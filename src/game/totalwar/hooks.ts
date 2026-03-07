// ---------------------------------------------------------------------------
// Total War Controller Hook
// Subscribes to base game store phase transitions and intercepts to inject
// expansion logic (Air Step, minor power VP, mandatory discard, AF reposition).
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { useGameStore } from '../store';
import { useTotalWarStore } from './store';
import { GamePhase, Country, Team, getTeam, TURN_ORDER, COUNTRY_NAMES } from '../types';
import { getCurrentCountry } from '../engine';
import { checkAirForceReposition, calculateMinorPowerVP } from './engine';
import {
  applyMandatoryDiscardPenalty,
  clearTurnTracking,
  finishAirStep,
} from './storeWrapper';

/** Append a log entry to the base game store */
function twLog(country: Country, message: string) {
  useGameStore.setState((s) => ({
    log: [...s.log, { country, message, round: s.round, timestamp: Date.now() }],
  }));
}

/**
 * React hook that wires the Total War expansion into the base game's flow.
 * Must be rendered in TotalWarGameView (only when expansion is active).
 */
export function useTotalWarController() {
  const airStepDoneRef = useRef(false);

  useEffect(() => {
    const twState = useTotalWarStore.getState();
    if (!twState.enabled) return;

    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      const tw = useTotalWarStore.getState();
      if (!tw.enabled) return;

      const phase = state.phase;
      const prevPhase = prevState.phase;

      // Skip if phase hasn't changed
      if (phase === prevPhase) return;

      // Guard: if game was reset (SETUP phase or empty countries), skip
      if (phase === GamePhase.SETUP || phase === GamePhase.GAME_OVER) {
        return;
      }

      // Guard: if countries are empty/not initialized, skip
      const country = getCurrentCountry(state);
      if (!state.countries[country]) return;

      // --- SUPPLY_STEP interception: inject Air Step ---
      if (phase === GamePhase.SUPPLY_STEP && prevPhase !== GamePhase.SUPPLY_STEP) {
        if (!airStepDoneRef.current && !tw.inAirStep) {
          // Immediately set phase to AWAITING_RESPONSE to prevent
          // the base store's scheduled advanceToNextPhase from doing
          // supply removal before the Air Step completes.
          useGameStore.setState({ phase: GamePhase.AWAITING_RESPONSE });

          // Enter Air Step
          const twStore = useTotalWarStore.getState();
          twStore.enterAirStep(country);

          const cs = state.countries[country];
          if (!cs.isHuman) {
            resolveAiAirStep(country);
          } else {
            twStore.setPendingTotalWarAction({
              type: 'AIR_STEP_CHOICE',
              country,
            });
          }
          return;
        }
      }

      // --- VICTORY_STEP: add minor power VP ---
      if (phase === GamePhase.VICTORY_STEP && prevPhase !== GamePhase.VICTORY_STEP) {
        addMinorPowerVPIfNeeded(state);
      }

      // --- New country's turn: reset Air Step tracking ---
      if (phase === GamePhase.PLAY_STEP && prevPhase !== GamePhase.PLAY_STEP) {
        airStepDoneRef.current = false;
        clearTurnTracking();
      }
    });

    return unsubscribe;
  }, []);

  // ---------------------------------------------------------------------------
  // Intercept pending actions: filter out spaces occupied by enemy minor power
  // pieces. The base engine's getValidBuildLocations doesn't know about minor
  // power pieces (stored in expansion store), so Axis could build where France/
  // China armies are. This subscription fixes that for both human and AI.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const twState = useTotalWarStore.getState();
    if (!twState.enabled) return;

    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      const tw = useTotalWarStore.getState();
      if (!tw.enabled) return;

      const pa = state.pendingAction;
      if (!pa || pa === prevState.pendingAction) return;

      // Only filter build/recruit location actions
      if (pa.type !== 'SELECT_BUILD_LOCATION' && pa.type !== 'SELECT_RECRUIT_LOCATION') return;

      const country = getCurrentCountry(state);
      const enemyTeam = getTeam(country) === Team.AXIS ? Team.ALLIES : Team.AXIS;

      // Find spaces occupied by enemy minor power pieces
      const blockedSpaces = new Set<string>();
      for (const mp of tw.minorPowerPieces) {
        // France & China are both Allied minor powers
        const mpTeam = Team.ALLIES;
        if (mpTeam === enemyTeam) {
          blockedSpaces.add(mp.spaceId);
        }
      }

      if (blockedSpaces.size === 0) return;

      const validSpaces: string[] = pa.validSpaces;
      const filtered = validSpaces.filter((s) => !blockedSpaces.has(s));
      if (filtered.length === validSpaces.length) return; // no change needed

      useGameStore.setState({
        pendingAction: { ...pa, validSpaces: filtered } as any,
      });
    });

    return unsubscribe;
  }, []);

  // Subscribe to expansion store for Air Step completion
  useEffect(() => {
    const tw = useTotalWarStore.getState();
    if (!tw.enabled) return;

    const unsubscribe = useTotalWarStore.subscribe((state, prevState) => {
      if (state.airStepCompleted && !prevState.airStepCompleted) {
        airStepDoneRef.current = true;
        finishAirStep();

        // Resume base game: set phase back to SUPPLY_STEP
        useGameStore.setState({ phase: GamePhase.SUPPLY_STEP });
        setTimeout(() => {
          useGameStore.getState().advanceToNextPhase();
          // Handle AF reposition after supply removal
          setTimeout(() => handleAirForceReposition(), 100);
        }, 200);
      }
    });

    return unsubscribe;
  }, []);
}

// ---------------------------------------------------------------------------
// AI Air Step resolution
// ---------------------------------------------------------------------------

async function resolveAiAirStep(country: Country) {
  const tw = useTotalWarStore.getState();

  const {
    aiChooseAirStepAction,
    aiPickDeployLocation,
    aiPickMarshalMove,
    aiPickSuperiorityTarget,
    aiPickCardToDiscard,
  } = await import('./ai');

  const state = useGameStore.getState();
  const diff = state.countries[country].aiDifficulty;
  const action = aiChooseAirStepAction(country, state, tw, diff);

  await new Promise((r) => setTimeout(r, 300));

  if (action.action === 'SKIP') {
    twLog(country, 'Air Step: Skipped');
    tw.completeAirStep();
    return;
  }

  if (action.action === 'DEPLOY') {
    const cardIdx = aiPickCardToDiscard(country, useGameStore.getState(), true);
    if (cardIdx >= 0) discardCardFromHand(country, cardIdx);

    const freshState = useGameStore.getState();
    const freshTw = useTotalWarStore.getState();
    const location = aiPickDeployLocation(country, freshState, freshTw, action.minorPower);
    if (location) {
      freshTw.addAirForce({
        id: `af_${country}_${Date.now()}`,
        country,
        minorPower: action.minorPower,
        type: 'air_force',
        spaceId: location,
      });
      twLog(country, `Air Step: Deployed Air Force to ${location.replace(/_/g, ' ')}`);
    }
    useTotalWarStore.getState().completeAirStep();
    return;
  }

  if (action.action === 'MARSHAL') {
    const cardIdx = aiPickCardToDiscard(country, useGameStore.getState(), false);
    if (cardIdx >= 0) discardCardFromHand(country, cardIdx);

    const freshState = useGameStore.getState();
    const freshTw = useTotalWarStore.getState();
    const move = aiPickMarshalMove(country, freshState, freshTw, action.minorPower);
    if (move) {
      freshTw.moveAirForce(move.afId, move.destination);
      twLog(country, `Air Step: Marshalled Air Force to ${move.destination.replace(/_/g, ' ')}`);
    }
    useTotalWarStore.getState().completeAirStep();
    return;
  }

  if (action.action === 'GAIN_SUPERIORITY') {
    const cardIdx = aiPickCardToDiscard(country, useGameStore.getState(), true);
    if (cardIdx >= 0) discardCardFromHand(country, cardIdx);

    const freshTw = useTotalWarStore.getState();
    const freshState = useGameStore.getState();
    const targetId = aiPickSuperiorityTarget(country, freshState, freshTw);
    if (targetId) {
      const targetAF = freshTw.airForces.find(af => af.id === targetId);
      freshTw.removeAirForce(targetId);
      twLog(country, `Air Step: Eliminated enemy AF at ${targetAF?.spaceId?.replace(/_/g, ' ') ?? 'unknown'}`);
    }
    useTotalWarStore.getState().completeAirStep();
    return;
  }

  // Fallback
  useTotalWarStore.getState().completeAirStep();
}

// ---------------------------------------------------------------------------
// Helper: discard a card from a country's hand
// ---------------------------------------------------------------------------

function discardCardFromHand(country: Country, handIndex: number) {
  useGameStore.setState((s) => {
    const cs = s.countries[country];
    const card = cs.hand[handIndex];
    if (!card) return {};
    return {
      countries: {
        ...s.countries,
        [country]: {
          ...cs,
          hand: cs.hand.filter((_: any, i: number) => i !== handIndex),
          discard: [...cs.discard, card],
        },
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Minor Power VP
// ---------------------------------------------------------------------------

function addMinorPowerVPIfNeeded(state: any) {
  const country = getCurrentCountry(state);
  if (!state.countries[country]) return;
  const tw = useTotalWarStore.getState();

  if (country === Country.UK) {
    const franceVP = calculateMinorPowerVP('FRANCE', tw, state);
    if (franceVP > 0) {
      useGameStore.setState((s) => ({ alliesVP: s.alliesVP + franceVP }));
      twLog(Country.UK, `France scored ${franceVP} VP`);
    }
  }

  if (country === Country.USA) {
    const chinaVP = calculateMinorPowerVP('CHINA', tw, state);
    if (chinaVP > 0) {
      useGameStore.setState((s) => ({ alliesVP: s.alliesVP + chinaVP }));
      twLog(Country.USA, `China scored ${chinaVP} VP`);
    }
  }
}

// ---------------------------------------------------------------------------
// Air Force Reposition
// ---------------------------------------------------------------------------

function handleAirForceReposition() {
  const state = useGameStore.getState();
  const tw = useTotalWarStore.getState();
  if (!tw.enabled) return;

  const repos = checkAirForceReposition(tw, state);
  if (repos.length === 0) return;

  for (const r of repos) {
    const country = r.country;
    const cs = state.countries[country];

    if (r.validSpaces.length === 0) {
      useTotalWarStore.getState().removeAirForce(r.afId);
      twLog(country, 'Air Force removed (no valid reposition space)');
    } else if (!cs?.isHuman) {
      useTotalWarStore.getState().moveAirForce(r.afId, r.validSpaces[0]);
      twLog(country, `Air Force repositioned to ${r.validSpaces[0].replace(/_/g, ' ')}`);
    } else {
      useTotalWarStore.getState().setPendingTotalWarAction({
        type: 'REPOSITION_AIR_FORCE',
        afId: r.afId,
        country,
        minorPower: r.minorPower,
        validSpaces: r.validSpaces,
      });
      return;
    }
  }
}
