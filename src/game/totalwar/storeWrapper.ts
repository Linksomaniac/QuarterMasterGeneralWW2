// ---------------------------------------------------------------------------
// Store Wrapper — Intercepts base game store actions to inject expansion logic
// ---------------------------------------------------------------------------
//
// This module provides hooks and utilities that coordinate the base game store
// (useGameStore) with the expansion store (useTotalWarStore).
//
// Key interceptions:
// 1. Phase transitions: Play Step → Air Step → Supply Step (injects Air Step)
// 2. Deck creation: uses merged decks (base + expansion - substitutes)
// 3. Discard enforcement: mandatory discard penalty
// 4. Air defense/attack reactions during battles
// ---------------------------------------------------------------------------

import { useGameStore } from '../store';
import { useTotalWarStore } from './store';
import { Country, GamePhase, Team, getTeam, TURN_ORDER } from '../types';
import { getTotalWarDeck } from './engine';

/**
 * Initialize the game with Total War expansion decks.
 * Called after the base initGame to replace decks with merged versions.
 */
export function initTotalWarGame() {
  const twState = useTotalWarStore.getState();
  if (!twState.enabled) return;

  const gameState = useGameStore.getState();

  // Replace each country's deck with the Total War merged deck
  // This is done by directly modifying the store state after init
  // since we can't intercept the initGame call itself
  useGameStore.setState((state) => {
    const newCountries = { ...state.countries };
    for (const country of TURN_ORDER) {
      const merged = getTotalWarDeck(country);
      // Shuffle the merged deck
      const shuffled = [...merged].sort(() => Math.random() - 0.5);

      // TW setup: draw 12, discard 5 (vs base 10/3)
      const drawn = shuffled.slice(0, 12);
      const remainingDeck = shuffled.slice(12);

      // Auto-discard for AI, manual for human
      const cs = newCountries[country];
      if (!cs.isHuman) {
        // AI: auto-discard 5 lowest priority
        const toDiscard = [...drawn]
          .sort((a, b) => {
            // Prioritize discarding EW and Air Power cards
            const aScore = a.type === 'ECONOMIC_WARFARE' ? 2 : (a.type as string) === 'AIR_POWER' ? 1 : 0;
            const bScore = b.type === 'ECONOMIC_WARFARE' ? 2 : (b.type as string) === 'AIR_POWER' ? 1 : 0;
            return bScore - aScore; // Higher score = discard first
          })
          .slice(0, 5);
        const hand = drawn.filter((c) => !toDiscard.includes(c));

        newCountries[country] = {
          ...cs,
          hand: hand as any,
          deck: remainingDeck as any,
          discard: toDiscard as any,
        };
      } else {
        // Human: give all 12, they'll choose 5 to discard in SETUP_DISCARD phase
        newCountries[country] = {
          ...cs,
          hand: drawn as any,
          deck: remainingDeck as any,
          discard: [],
        };
      }
    }

    return { countries: newCountries };
  });

  // Place starting minor power pieces
  twState.placeStartingMinorPowerPieces();
}

/**
 * Check if we should inject an Air Step between Play and Supply steps.
 * Call this when the base game transitions to Supply Step.
 */
export function shouldInjectAirStep(): boolean {
  return useTotalWarStore.getState().enabled;
}

/**
 * Start the Air Step for the current country.
 */
export function startAirStep(country: Country) {
  const twStore = useTotalWarStore.getState();
  twStore.enterAirStep(country);
  twStore.setPendingTotalWarAction({
    type: 'AIR_STEP_CHOICE',
    country,
  });
}

/**
 * Called when Air Step is complete — resumes base game flow to Supply Step.
 */
export function finishAirStep() {
  const twStore = useTotalWarStore.getState();
  twStore.exitAirStep();
  // The base game should now proceed to Supply Step
}

/**
 * Check mandatory discard rule: if a country discarded 0 cards,
 * their team loses 1 VP.
 */
export function applyMandatoryDiscardPenalty(discardCount: number, country: Country) {
  if (!useTotalWarStore.getState().enabled) return;
  if (discardCount > 0) return;

  const team = getTeam(country);
  useGameStore.setState((state) => {
    if (team === Team.AXIS) {
      return { axisVP: Math.max(0, state.axisVP - 1) };
    } else {
      return { alliesVP: Math.max(0, state.alliesVP - 1) };
    }
  });
}

/**
 * Clear per-turn expansion tracking at the end of a country's turn.
 */
export function clearTurnTracking() {
  const twStore = useTotalWarStore.getState();
  twStore.clearBolstersUsedThisTurn();
  twStore.clearExpansionStatusUsedThisTurn();
  twStore.setAirDefenseDisabled(false);
}
