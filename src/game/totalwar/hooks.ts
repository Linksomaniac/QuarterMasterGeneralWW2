// ---------------------------------------------------------------------------
// Total War Controller Hook
// Subscribes to base game store phase transitions and intercepts to inject
// expansion logic (Air Step, minor power VP, mandatory discard, AF reposition).
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { useGameStore } from '../store';
import { useTotalWarStore } from './store';
import { GamePhase, Country, Team, getTeam, TURN_ORDER, COUNTRY_NAMES, CardType } from '../types';
import { REALLOCATE_COST, REALLOCATE_ELIGIBLE_TYPES } from './types';
import { getCurrentCountry, getAllPieces } from '../engine';
import {
  checkAirForceReposition,
  calculateMinorPowerVP,
  calculateVPAdjustmentForMinorSharing,
  isMinorPowerPieceInSupply,
  getAirDefenseAF,
  getAirAttackAF,
} from './engine';
import {
  applyMandatoryDiscardPenalty,
  clearTurnTracking,
  finishAirStep,
} from './storeWrapper';
import { fireBolsterTrigger } from './bolsterEngine';
import { HOME_SPACES } from '../mapData';

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
  const bolsterProcessingRef = useRef(false);
  const airCombatProcessingRef = useRef(false);
  const playStepOfferedRef = useRef(-1); // tracks currentCountryIndex where we offered reallocate
  // Tracks which step-begin bolster triggers have been fired for the current turn.
  // Prevents re-firing when the phase resumes back after a bolster prompt is resolved.
  const stepBolstersFiredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const twState = useTotalWarStore.getState();
    if (!twState.enabled) return;

    // Immediate check: if the phase is already SETUP_DISCARD when we mount,
    // the subscription won't catch it (it only fires on changes). Handle it now.
    const initState = useGameStore.getState();
    if (initState.phase === GamePhase.SETUP_DISCARD) {
      const idx = (initState as any).setupDiscardCountryIndex ?? 0;
      const setupCountry = TURN_ORDER[idx];
      if (initState.countries[setupCountry]?.isHuman) {
        useGameStore.setState({ phase: GamePhase.AWAITING_RESPONSE });
        useTotalWarStore.getState().setPendingTotalWarAction({
          type: 'TW_SETUP_DISCARD',
          country: setupCountry,
          countryIndex: idx,
        });
      }
    }

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

      // --- SETUP_DISCARD interception: allow 5 discards instead of 3 ---
      if (phase === GamePhase.SETUP_DISCARD && prevPhase !== GamePhase.SETUP_DISCARD) {
        const idx = (state as any).setupDiscardCountryIndex ?? 0;
        const setupCountry = TURN_ORDER[idx];
        if (state.countries[setupCountry]?.isHuman) {
          useGameStore.setState({ phase: GamePhase.AWAITING_RESPONSE });
          useTotalWarStore.getState().setPendingTotalWarAction({
            type: 'TW_SETUP_DISCARD',
            country: setupCountry,
            countryIndex: idx,
          });
        }
        return;
      }

      // --- Mandatory discard penalty: if country discarded 0 cards, team loses 1 VP ---
      if (prevPhase === GamePhase.DISCARD_STEP && phase !== GamePhase.DISCARD_STEP) {
        const discardCountry = getCurrentCountry(prevState);
        const prevDiscardSize = prevState.countries[discardCountry]?.discard?.length ?? 0;
        const newDiscardSize = state.countries[discardCountry]?.discard?.length ?? 0;
        const discardedCount = newDiscardSize - prevDiscardSize;
        if (discardedCount === 0) {
          applyMandatoryDiscardPenalty(0, discardCountry);
          twLog(discardCountry, `Mandatory discard penalty: team loses 1 VP (must discard at least 1 card)`);
        }
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

          // Fire AIR_STEP_BEGIN bolsters.
          // If a human bolster prompt was set, don't overwrite it — the Air Step
          // choice screen will appear naturally after the bolster is resolved
          // (AirStepOverlay checks airStepCountry which is still set).
          const bolsterFired = fireBolsterTrigger('AIR_STEP_BEGIN', country);

          const cs = state.countries[country];
          if (!cs.isHuman) {
            // AI: bolsters were auto-resolved, proceed to air step
            resolveAiAirStep(country);
          } else if (!bolsterFired) {
            // Human with no bolster: show air step choice directly
            twStore.setPendingTotalWarAction({
              type: 'AIR_STEP_CHOICE',
              country,
            });
          }
          // else: human bolster prompt is showing; Air Step choice appears after
          return;
        }
      }

      // --- VICTORY_STEP: add minor power VP ---
      if (phase === GamePhase.VICTORY_STEP && prevPhase !== GamePhase.VICTORY_STEP) {
        addMinorPowerVPIfNeeded(state);
      }

      // --- New country's turn: reset Air Step tracking + fire PLAY_STEP bolsters + Reallocate ---
      if (phase === GamePhase.PLAY_STEP && prevPhase !== GamePhase.PLAY_STEP) {
        const currentIdx = state.currentCountryIndex;

        // Guard: only fire once per country turn (prevents re-trigger when
        // resuming from AWAITING_RESPONSE after declining Reallocate/Bolster)
        if (playStepOfferedRef.current === currentIdx) return;
        playStepOfferedRef.current = currentIdx;

        airStepDoneRef.current = false;
        stepBolstersFiredRef.current.clear();
        clearTurnTracking();

        const playCountry = getCurrentCountry(state);

        // Fire PLAY_STEP_BEGIN bolsters for the current country
        fireBolsterTrigger('PLAY_STEP_BEGIN', playCountry);
        // Fire ANY_PLAYER_PLAY_STEP bolsters for all countries
        fireBolsterTrigger('ANY_PLAYER_PLAY_STEP', playCountry);

        // Offer Reallocate Resources at beginning of Play Step
        const freshState2 = useGameStore.getState();
        const playCs = freshState2.countries[playCountry];
        const hasPendingBolster = useTotalWarStore.getState().pendingTotalWarAction?.type === 'BOLSTER_OPPORTUNITY';
        if (!hasPendingBolster && playCs && playCs.hand.length > REALLOCATE_COST) {
          if (playCs.isHuman) {
            useGameStore.setState({ phase: GamePhase.AWAITING_RESPONSE });
            useTotalWarStore.getState().setPendingTotalWarAction({
              type: 'REALLOCATE_RESOURCES_OFFER',
              country: playCountry,
            });
          } else {
            // AI: check if should reallocate (lost home army, no Build Army in hand)
            resolveAiReallocate(playCountry);
          }
        }
      }

      // --- VICTORY_STEP: fire bolsters ---
      if (phase === GamePhase.VICTORY_STEP && prevPhase !== GamePhase.VICTORY_STEP) {
        const vicKey = `${state.currentCountryIndex}_VICTORY`;
        if (!stepBolstersFiredRef.current.has(vicKey)) {
          stepBolstersFiredRef.current.add(vicKey);
          const vicCountry = getCurrentCountry(state);
          fireBolsterTrigger('VICTORY_STEP_BEGIN', vicCountry);
        }
      }

      // --- DRAW_STEP: fire bolsters ---
      if (phase === GamePhase.DRAW_STEP && prevPhase !== GamePhase.DRAW_STEP) {
        const drawKey = `${state.currentCountryIndex}_DRAW`;
        if (!stepBolstersFiredRef.current.has(drawKey)) {
          stepBolstersFiredRef.current.add(drawKey);
          const drawCountry = getCurrentCountry(state);
          fireBolsterTrigger('DRAW_STEP_BEGIN', drawCountry);
        }
      }

      // --- DISCARD_STEP: fire bolsters ---
      if (phase === GamePhase.DISCARD_STEP && prevPhase !== GamePhase.DISCARD_STEP) {
        const discKey = `${state.currentCountryIndex}_DISCARD`;
        if (!stepBolstersFiredRef.current.has(discKey)) {
          stepBolstersFiredRef.current.add(discKey);
          const discCountry = getCurrentCountry(state);
          fireBolsterTrigger('DISCARD_STEP_BEGIN', discCountry);
        }
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

  // ---------------------------------------------------------------------------
  // Reactive guard: remove Axis pieces illegally placed in minor-power-occupied
  // spaces. The base AI resolves builds synchronously (before the pending-action
  // subscription can filter), so this catches those cases by detecting the piece
  // after it appears in the store and removing it immediately.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const twState = useTotalWarStore.getState();
    if (!twState.enabled) return;

    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      const tw = useTotalWarStore.getState();
      if (!tw.enabled || tw.minorPowerPieces.length === 0) return;

      const mpSpaces = new Set(tw.minorPowerPieces.map((p) => p.spaceId));
      if (mpSpaces.size === 0) return;

      const removals: { country: Country; pieceIds: string[] }[] = [];

      for (const country of TURN_ORDER) {
        if (getTeam(country) === Team.ALLIES) continue; // Only check Axis countries

        const cs = state.countries[country];
        const prevCs = prevState.countries[country];
        if (!cs?.piecesOnBoard || !prevCs?.piecesOnBoard) continue;

        const pieces = cs.piecesOnBoard;
        const prevPieces = prevCs.piecesOnBoard;
        if (pieces === prevPieces) continue;
        if (pieces.length <= prevPieces.length) continue; // Only check additions

        const prevIds = new Set(prevPieces.map((p: any) => p.id));
        const newPieces = pieces.filter((p: any) => !prevIds.has(p.id));

        const illegal = newPieces.filter((p: any) => mpSpaces.has(p.spaceId));
        if (illegal.length > 0) {
          removals.push({ country, pieceIds: illegal.map((p: any) => p.id) });
        }
      }

      if (removals.length === 0) return;

      // Remove all illegal pieces in one state update
      useGameStore.setState((s) => {
        const newCountries = { ...s.countries };
        for (const { country, pieceIds } of removals) {
          const idSet = new Set(pieceIds);
          newCountries[country] = {
            ...newCountries[country],
            piecesOnBoard: newCountries[country].piecesOnBoard.filter(
              (p: any) => !idSet.has(p.id)
            ),
          };
          twLog(country, `Build blocked — space occupied by minor power`);
        }
        return { countries: newCountries };
      });
    });

    return unsubscribe;
  }, []);

  // ---------------------------------------------------------------------------
  // Bolster action triggers — detect builds, battles, EW plays via log entries
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const twState = useTotalWarStore.getState();
    if (!twState.enabled) return;

    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      if (bolsterProcessingRef.current) return;
      const tw = useTotalWarStore.getState();
      if (!tw.enabled) return;

      // Skip during setup and game-over phases
      const phase = state.phase;
      if (phase === GamePhase.SETUP || phase === GamePhase.SETUP_DISCARD ||
          phase === GamePhase.GAME_OVER) return;

      // Detect new log entries
      if (state.log.length <= prevState.log.length) return;
      const newEntries = state.log.slice(prevState.log.length);

      bolsterProcessingRef.current = true;
      try {
        for (const entry of newEntries) {
          const msg = entry.message;
          const logCountry = entry.country as Country;

          // BUILD_ARMY trigger
          if (msg.startsWith('Built army') || msg.includes('Built army')) {
            fireBolsterTrigger('BUILD_ARMY', logCountry);
          }
          // BUILD_NAVY trigger
          else if (msg.startsWith('Built navy') || msg.includes('Built navy')) {
            fireBolsterTrigger('BUILD_NAVY', logCountry);
          }
          // BATTLE triggers
          else if (msg.startsWith('Eliminated enemy army') || msg.includes('Land Battle')) {
            fireBolsterTrigger('BATTLE_LAND', logCountry);
          }
          else if (msg.startsWith('Eliminated enemy navy') || msg.includes('Sea Battle')) {
            fireBolsterTrigger('BATTLE_SEA', logCountry);
          }
          // EW play trigger
          else if (msg.includes('Economic Warfare') || msg.includes('Submarines')) {
            fireBolsterTrigger('PLAY_EW', logCountry);
            // Check for Germany Submarine EW
            if (logCountry === Country.GERMANY && msg.includes('Submarine')) {
              fireBolsterTrigger('GERMANY_PLAYS_SUBMARINE', logCountry);
            }
          }
          // TARGET_OF_EW trigger: when a country is targeted by EW
          // Log messages: "<cardName>: <CountryName> discards X from deck"
          //            or "<cardName>: <CountryName> deck empty — X VP lost"
          else if (msg.includes('discards') && msg.includes('from deck')) {
            // Identify the target country from the message
            for (const c of TURN_ORDER) {
              if (msg.includes(COUNTRY_NAMES[c])) {
                fireBolsterTrigger('TARGET_OF_EW', c);
                break;
              }
            }
          }
          // Status card play trigger (Axis)
          else if (msg.includes('Played') && msg.includes('Status') &&
                   getTeam(logCountry) === Team.AXIS) {
            fireBolsterTrigger('AXIS_USES_STATUS', logCountry);
          }
          // DEPLOY/MARSHAL AF trigger
          else if (msg.includes('Air Step: Deployed') || msg.includes('Air Step: Marshalled')) {
            fireBolsterTrigger('DEPLOY_OR_MARSHAL_AF', logCountry);
          }
          // AXIS_USES_BOLSTER trigger: when an Axis country uses a bolster
          else if (msg.startsWith('Bolster:') && getTeam(logCountry) === Team.AXIS) {
            fireBolsterTrigger('AXIS_USES_BOLSTER', logCountry);
          }
          // Army eliminated (for TARGET_OF_EW, ARMY_BATTLED, ARMY_REMOVED)
          else if (msg.startsWith('Eliminated enemy')) {
            // Find which countries lost pieces
            for (const c of TURN_ORDER) {
              if (c === logCountry) continue;
              const cs = state.countries[c];
              const prevCs = prevState.countries[c];
              if (!cs?.piecesOnBoard || !prevCs?.piecesOnBoard) continue;
              if (cs.piecesOnBoard.length < prevCs.piecesOnBoard.length) {
                const lostArmies = prevCs.piecesOnBoard.filter(
                  (p: any) => p.type === 'army' && !cs.piecesOnBoard.some((q: any) => q.id === p.id)
                );
                if (lostArmies.length > 0) {
                  fireBolsterTrigger('ARMY_BATTLED', c);
                  fireBolsterTrigger('ARMY_REMOVED', c);
                  // Check if last army was removed
                  const remainingArmies = cs.piecesOnBoard.filter((p: any) => p.type === 'army');
                  if (remainingArmies.length === 0) {
                    fireBolsterTrigger('LAST_ARMY_REMOVED', c);
                  }
                }
              }
            }
          }
        }
      } finally {
        bolsterProcessingRef.current = false;
      }
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
          // After base supply removal, also remove out-of-supply minor power pieces
          // (France during UK supply step, China during USA supply step)
          setTimeout(() => {
            removeOutOfSupplyMinorPieces();
            handleAirForceReposition();
          }, 100);
        }, 200);
      }
    });

    return unsubscribe;
  }, []);

  // ---------------------------------------------------------------------------
  // Air Defense & Air Attack — reactive detection of battle eliminations.
  //
  // Air Defense: When a piece is eliminated in battle and the defender has an
  //   AF in the battle space, the AF can absorb the hit (saving the piece).
  //   Detected by watching for piece removals during battle phases.
  //
  // Air Attack: After a battle eliminates a piece, if the attacker has a
  //   supplied AF adjacent to the battle space AND the defender still has an
  //   AF in the battle space, the attacker can eliminate that AF too.
  //   Detected by checking conditions after each battle elimination.
  //
  // Re-entrancy guard: airCombatProcessingRef prevents the subscription from
  // re-triggering when we modify state (restore pieces, remove AFs).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const twState = useTotalWarStore.getState();
    if (!twState.enabled) return;

    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      // Re-entrancy guard: skip if we're currently processing an air defense/attack
      if (airCombatProcessingRef.current) return;

      const tw = useTotalWarStore.getState();
      if (!tw.enabled || tw.airForces.length === 0) return;

      // Only detect battle eliminations during battle-related phases.
      // Supply step removals should NOT trigger air defense/attack.
      const phase = state.phase;
      if (
        phase !== GamePhase.PLAY_STEP &&
        phase !== GamePhase.AWAITING_RESPONSE
      ) {
        return;
      }

      // If air defense is disabled this turn (e.g., Cloud Cover card), skip
      if (tw.airDefenseDisabledThisTurn) return;

      // Detect piece removals by comparing piecesOnBoard for each country
      for (const defenderCountry of TURN_ORDER) {
        const cs = state.countries[defenderCountry];
        const prevCs = prevState.countries[defenderCountry];
        if (!cs?.piecesOnBoard || !prevCs?.piecesOnBoard) continue;

        // Reference equality check: if the array didn't change, skip
        if (cs.piecesOnBoard === prevCs.piecesOnBoard) continue;

        // Only care about removals (piece count decreased)
        if (cs.piecesOnBoard.length >= prevCs.piecesOnBoard.length) continue;

        // Find removed pieces
        const currentIds = new Set(cs.piecesOnBoard.map((p: any) => p.id));
        const removedPieces = prevCs.piecesOnBoard.filter(
          (p: any) => !currentIds.has(p.id)
        );

        if (removedPieces.length === 0) continue;

        // Verify this is a battle elimination by checking the latest log entry.
        // Battle eliminations produce log entries like "Eliminated enemy army/navy in ..."
        // (from resolveBattleAction). Event card eliminations use a different format
        // with the card name prefix.
        const newLogEntries = state.log.slice(prevState.log.length);
        const battleLogEntry = newLogEntries.find(
          (entry: any) => entry.message.startsWith('Eliminated enemy')
        );

        if (!battleLogEntry) continue;

        // The attacker is the country that authored the "Eliminated enemy" log entry
        const attackerCountry = battleLogEntry.country as Country;

        // Verify attacker is on the opposite team from the defender
        if (getTeam(attackerCountry) === getTeam(defenderCountry)) continue;

        // Process each removed piece for Air Defense and Air Attack
        for (const removed of removedPieces) {
          const battleSpaceId = removed.spaceId;

          // --- AIR DEFENSE ---
          // Check if the defender has an AF in the battle space that can absorb the hit
          const defenseAF = getAirDefenseAF(defenderCountry, battleSpaceId, tw);

          if (defenseAF) {
            const isDefenderHuman = cs.isHuman;

            if (!isDefenderHuman) {
              // AI always uses air defense — sacrifice the AF to save the piece
              airCombatProcessingRef.current = true;
              try {
                // Restore the eliminated piece
                useGameStore.setState((s) => ({
                  countries: {
                    ...s.countries,
                    [defenderCountry]: {
                      ...s.countries[defenderCountry],
                      piecesOnBoard: [
                        ...s.countries[defenderCountry].piecesOnBoard,
                        removed,
                      ],
                    },
                  },
                }));

                // Remove the AF (sacrifice it)
                useTotalWarStore.getState().removeAirForce(defenseAF.id);

                twLog(
                  defenderCountry,
                  `Air Defense: Sacrificed Air Force to save ${removed.type} in ${battleSpaceId.replace(/_/g, ' ')}`
                );
              } finally {
                airCombatProcessingRef.current = false;
              }

              // After air defense, check for air attack opportunity for the attacker.
              // The defender's piece was saved, but is there still an enemy AF in the
              // battle space? (The AF we just removed was the defender's, so check for
              // another defender AF.)
              checkAndResolveAirAttack(
                attackerCountry,
                defenderCountry,
                battleSpaceId,
                state,
                airCombatProcessingRef
              );

              // Skip further processing for this piece (it was saved)
              continue;
            } else {
              // Human defender: show AIR_DEFENSE_OPPORTUNITY prompt
              // Save context needed to resume after the human responds
              airCombatProcessingRef.current = true;
              try {
                useTotalWarStore.getState().setPendingTotalWarAction({
                  type: 'AIR_DEFENSE_OPPORTUNITY',
                  defenderCountry,
                  battleSpaceId,
                  threatenedPieceId: removed.id,
                  threatenedPieceType: removed.type,
                  airForceId: defenseAF.id,
                });
              } finally {
                airCombatProcessingRef.current = false;
              }
              // Don't process air attack yet — wait for human to respond to defense first
              continue;
            }
          }

          // --- AIR ATTACK (no air defense available) ---
          // Piece was eliminated. Check if attacker can perform air attack
          // to also eliminate a defender's AF in the battle space.
          checkAndResolveAirAttack(
            attackerCountry,
            defenderCountry,
            battleSpaceId,
            state,
            airCombatProcessingRef
          );
        }
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

  // --- Minor power VP scoring (France during UK turn, China during USA turn) ---
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

  // --- VP sharing adjustment: minor power armies reduce major power VP ---
  // The base game's calculateVictoryPoints doesn't know about minor power
  // pieces, so any supply space shared with a minor power army needs a -1
  // adjustment (from 2VP sole → 1VP shared).
  // This applies to ALL major powers, not just the controller.
  const freshState = useGameStore.getState();
  const adjustment = calculateVPAdjustmentForMinorSharing(country, tw, freshState);
  if (adjustment < 0) {
    const team = getTeam(country);
    if (team === Team.AXIS) {
      useGameStore.setState((s) => ({ axisVP: s.axisVP + adjustment }));
    } else {
      useGameStore.setState((s) => ({ alliesVP: s.alliesVP + adjustment }));
    }
    twLog(country, `VP adjusted by ${adjustment} (shared supply space with minor power)`);
  }
}

// ---------------------------------------------------------------------------
// Minor Power Supply Removal
// ---------------------------------------------------------------------------

/**
 * Remove out-of-supply minor power pieces during the controller's supply step.
 * France pieces are checked during UK's supply step.
 * China pieces are checked during USA's supply step.
 */
function removeOutOfSupplyMinorPieces() {
  const state = useGameStore.getState();
  const tw = useTotalWarStore.getState();
  if (!tw.enabled || tw.minorPowerPieces.length === 0) return;

  const country = getCurrentCountry(state);

  // Determine which minor power to check
  let minorPower: 'FRANCE' | 'CHINA' | null = null;
  if (country === Country.UK) minorPower = 'FRANCE';
  if (country === Country.USA) minorPower = 'CHINA';
  if (!minorPower) return;

  const allPieces = getAllPieces(state);
  const minorPieces = tw.minorPowerPieces.filter((mp) => mp.minorPower === minorPower);
  if (minorPieces.length === 0) return;

  const toRemove: string[] = [];

  for (const mp of minorPieces) {
    if (!isMinorPowerPieceInSupply(mp, allPieces, tw.minorPowerPieces, state, tw)) {
      toRemove.push(mp.id);
      const spaceName = mp.spaceId.replace(/_/g, ' ');
      twLog(country, `${minorPower === 'FRANCE' ? 'France' : 'China'} ${mp.type} in ${spaceName}: REMOVED (out of supply)`);
    }
  }

  if (toRemove.length > 0) {
    const twStore = useTotalWarStore.getState();
    for (const id of toRemove) {
      twStore.removeMinorPowerPiece(id);
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

// ---------------------------------------------------------------------------
// Air Attack — check and resolve after a battle elimination
// ---------------------------------------------------------------------------

/**
 * After a battle piece is eliminated (and air defense didn't apply or was
 * resolved), check if the attacker can use Air Attack to eliminate a defender's
 * AF in the battle space.
 *
 * Air Attack requires:
 * 1. The attacker has a supplied AF adjacent to the battle space
 * 2. The defender has an AF in the battle space
 *
 * For AI: automatically perform the air attack (free bonus elimination).
 * For human: show AIR_ATTACK_OPPORTUNITY prompt.
 */
// ---------------------------------------------------------------------------
// AI Reallocate Resources
// ---------------------------------------------------------------------------

/**
 * AI uses Reallocate Resources when:
 * 1. Home army was lost and no Build Army in hand → search for BUILD_ARMY
 * 2. France/China minor power armies exist and Axis has no LAND_BATTLE → search for LAND_BATTLE
 * 3. France/China armies eliminated but space empty and no BUILD_ARMY → search for BUILD_ARMY
 *
 * Automatically discards lowest-value cards and picks the needed card from deck.
 */
function resolveAiReallocate(country: Country) {
  const state = useGameStore.getState();
  const cs = state.countries[country];
  if (!cs || cs.hand.length <= REALLOCATE_COST) return;

  // Check for Victory Gardens status (USA pays only 1 card)
  const hasVictoryGardens = cs.statusCards?.some(
    (c: any) => c.effects?.some((e: any) => e.condition === 'cheaper_reallocate')
  );
  const cost = hasVictoryGardens ? 1 : REALLOCATE_COST;
  if (cs.hand.length <= cost) return;

  // Determine what card type is needed
  let neededType: string | null = null;
  let reason = '';

  const homeSpace = HOME_SPACES[country];
  const hasHomeArmy = cs.piecesOnBoard.some(
    (p: any) => p.type === 'army' && p.spaceId === homeSpace
  );
  const hasBuildArmy = cs.hand.some((c: any) => c.type === 'BUILD_ARMY');
  const hasLandBattle = cs.hand.some((c: any) => c.type === 'LAND_BATTLE');

  // Check minor power context
  const tw = useTotalWarStore.getState();
  const frenchArmies = tw.minorPowerPieces.filter((p) => p.minorPower === 'FRANCE' && p.type === 'army');
  const chineseArmies = tw.minorPowerPieces.filter((p) => p.minorPower === 'CHINA' && p.type === 'army');

  const isAxisAntiF = country === Country.GERMANY || country === Country.ITALY;
  const isJapan = country === Country.JAPAN;

  // Priority 1: Axis needs LAND_BATTLE to eliminate France/China armies
  if (isAxisAntiF && frenchArmies.length > 0 && !hasLandBattle) {
    neededType = 'LAND_BATTLE';
    reason = 'French armies on board, need land battle';
  } else if (isJapan && chineseArmies.length > 0 && !hasLandBattle) {
    neededType = 'LAND_BATTLE';
    reason = 'Chinese armies on board, need land battle';
  }
  // Priority 2: France/China eliminated, need to occupy the space
  // Only reallocate if this country can actually build in WE/China (check valid build locations)
  else if (isAxisAntiF && frenchArmies.length === 0 && !hasBuildArmy) {
    const weOccupied = cs.piecesOnBoard.some((p: any) => p.spaceId === 'western_europe');
    const allPieces = getAllPieces(state);
    const anyAxisInWE = allPieces.some((p: any) => p.spaceId === 'western_europe' && getTeam(p.country) === Team.AXIS);
    if (!weOccupied && !anyAxisInWE) {
      neededType = 'BUILD_ARMY';
      reason = 'France eliminated, need to build in Western Europe';
    }
  } else if (isJapan && chineseArmies.length === 0 && !hasBuildArmy) {
    const chinaOccupied = cs.piecesOnBoard.some((p: any) => p.spaceId === 'china' || p.spaceId === 'szechuan');
    const allPieces = getAllPieces(state);
    const anyAxisInChina = allPieces.some((p: any) => (p.spaceId === 'china' || p.spaceId === 'szechuan') && getTeam(p.country) === Team.AXIS);
    if (!chinaOccupied && !anyAxisInChina) {
      neededType = 'BUILD_ARMY';
      reason = 'China eliminated, need to build in China';
    }
  }
  // Priority 3: Lost home army (original logic)
  else if (!hasHomeArmy && !hasBuildArmy) {
    neededType = 'BUILD_ARMY';
    reason = 'lost home army';
  }

  if (!neededType) return;

  // Check if needed card type exists in deck
  const targetCard = cs.deck.find((c: any) => c.type === neededType);
  if (!targetCard) return;

  // AI decides to reallocate: discard lowest-value cards (preserving the needed type)
  const hand = [...cs.hand];
  const scored = hand.map((c: any, i: number) => ({
    id: c.id,
    index: i,
    cardType: c.type,
    score: c.type === 'STATUS' ? 15 : c.type === 'RESPONSE' ? 14 : c.type === 'LAND_BATTLE' ? 12 :
           c.type === 'EVENT' ? 11 : c.type === 'BUILD_ARMY' ? 10 : c.type === 'SEA_BATTLE' ? 10 :
           c.type === 'ECONOMIC_WARFARE' ? 9 : c.type === 'BUILD_NAVY' ? 8 :
           c.type === 'AIR_POWER' ? 7 : c.type === 'BOLSTER' ? 6 : 5,
  }));
  scored.sort((a, b) => a.score - b.score);

  // Don't discard cards of the type we're looking for
  const eligibleToDiscard = scored.filter((s) => s.cardType !== neededType);
  if (eligibleToDiscard.length < cost) return;

  const toDiscard = eligibleToDiscard.slice(0, cost);
  const discardIds = new Set(toDiscard.map((x) => x.id));

  // Perform the reallocate
  useGameStore.setState((s) => {
    const c = s.countries[country];
    const discarded = c.hand.filter((card: any) => discardIds.has(card.id));
    const remaining = c.hand.filter((card: any) => !discardIds.has(card.id));
    const pickedCard = c.deck.find((card: any) => card.type === neededType);
    if (!pickedCard) return {};

    const newDeck = c.deck.filter((card: any) => card.id !== pickedCard.id);
    // Shuffle deck after picking
    const shuffledDeck = [...newDeck].sort(() => Math.random() - 0.5);

    return {
      countries: {
        ...s.countries,
        [country]: {
          ...c,
          hand: [...remaining, pickedCard],
          deck: shuffledDeck,
          discard: [...c.discard, ...discarded],
        },
      },
    };
  });

  twLog(country, `Reallocate Resources: Discarded ${cost} cards, took ${targetCard.name} from deck (${reason})`);
}

function checkAndResolveAirAttack(
  attackerCountry: Country,
  defenderCountry: Country,
  battleSpaceId: string,
  _baseState: any,
  processingRef: { current: boolean }
) {
  // Re-read fresh state since air defense may have just modified it
  const freshState = useGameStore.getState();
  const freshTw = useTotalWarStore.getState();

  if (!freshTw.enabled || freshTw.airForces.length === 0) return;
  if (freshTw.airDefenseDisabledThisTurn) return;

  // Find a defender AF in the battle space (from any enemy country on the
  // defender's team — could be a different country than the one whose piece
  // was eliminated)
  const defenderTeam = getTeam(defenderCountry);
  const defenderAF = freshTw.airForces.find(
    (af) =>
      af.spaceId === battleSpaceId &&
      !af.minorPower &&
      getTeam(af.country) === defenderTeam
  );

  if (!defenderAF) return;

  // Check if the attacker has a supplied AF adjacent to the battle space
  const attackerAF = getAirAttackAF(attackerCountry, battleSpaceId, freshState, freshTw);
  if (!attackerAF) return;

  const isAttackerHuman = freshState.countries[attackerCountry]?.isHuman;

  if (!isAttackerHuman) {
    // AI always uses air attack — it's a free bonus elimination
    processingRef.current = true;
    try {
      useTotalWarStore.getState().removeAirForce(defenderAF.id);
      twLog(
        attackerCountry,
        `Air Attack: Eliminated enemy Air Force in ${battleSpaceId.replace(/_/g, ' ')}`
      );
    } finally {
      processingRef.current = false;
    }
  } else {
    // Human attacker: show AIR_ATTACK_OPPORTUNITY prompt
    processingRef.current = true;
    try {
      useTotalWarStore.getState().setPendingTotalWarAction({
        type: 'AIR_ATTACK_OPPORTUNITY',
        attackerCountry,
        defenderCountry: defenderAF.country,
        battleSpaceId,
        defenderAFSpaceId: battleSpaceId,
        attackerAFId: attackerAF.id,
      });
    } finally {
      processingRef.current = false;
    }
  }
}
