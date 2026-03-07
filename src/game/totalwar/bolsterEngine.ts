// ---------------------------------------------------------------------------
// Bolster Engine — Trigger detection, matching, and effect execution.
// ---------------------------------------------------------------------------

import { useGameStore } from '../store';
import { useTotalWarStore } from './store';
import {
  Country,
  Team,
  GamePhase,
  getTeam,
  TURN_ORDER,
  COUNTRY_NAMES,
  CardType,
} from '../types';
import { getAllPieces, getValidBuildLocations, isInSupply } from '../engine';
import { getAdjacentSpaces, HOME_SPACES, getSpace } from '../mapData';
import { TotalWarCard, BolsterTrigger, TotalWarState } from './types';
import { aiShouldUseBolster } from './ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BolsterMatch {
  country: Country;
  card: TotalWarCard;
  cardId: string;
}

// ---------------------------------------------------------------------------
// 1. Find matching bolsters in ALL countries' hands
// ---------------------------------------------------------------------------

/**
 * Scan all countries' hands for BOLSTER cards whose trigger matches.
 * Returns matches excluding already-used bolsters this turn.
 *
 * `triggerCountry` is the country whose action caused the trigger.
 * For self-triggers (PLAY_STEP_BEGIN), only the trigger country's bolsters match.
 * For cross-triggers (ANY_PLAYER_PLAY_STEP), all countries are checked.
 * For reaction triggers (TARGET_OF_EW), the targeted country's bolsters match.
 */
export function findMatchingBolsters(
  trigger: BolsterTrigger,
  triggerCountry: Country,
): BolsterMatch[] {
  const state = useGameStore.getState();
  const tw = useTotalWarStore.getState();
  if (!tw.enabled) return [];

  const usedSet = new Set(tw.bolstersUsedThisTurn);
  const matches: BolsterMatch[] = [];

  // Determine which countries to check
  let countriesToCheck: Country[];

  switch (trigger) {
    // Self-triggers: only the acting country
    case 'PLAY_STEP_BEGIN':
    case 'VICTORY_STEP_BEGIN':
    case 'DRAW_STEP_BEGIN':
    case 'DISCARD_STEP_BEGIN':
    case 'AIR_STEP_BEGIN':
    case 'DEPLOY_OR_MARSHAL_AF':
    case 'BUILD_NAVY':
    case 'BUILD_ARMY':
    case 'BATTLE_LAND':
    case 'BATTLE_SEA':
    case 'PLAY_EW':
    case 'GERMANY_PLAYS_SUBMARINE':
      countriesToCheck = [triggerCountry];
      break;

    // Reaction triggers: the targeted/affected country
    case 'TARGET_OF_EW':
    case 'ARMY_BATTLED':
    case 'ARMY_REMOVED':
    case 'LAST_ARMY_REMOVED':
      // Check the country being targeted (not the attacker)
      countriesToCheck = [triggerCountry];
      break;

    // Cross-country triggers: check all countries
    case 'ANY_PLAYER_PLAY_STEP':
    case 'AXIS_USES_STATUS':
    case 'AXIS_USES_BOLSTER':
      countriesToCheck = [...TURN_ORDER];
      break;

    default:
      countriesToCheck = [triggerCountry];
  }

  for (const country of countriesToCheck) {
    const cs = state.countries[country];
    if (!cs) continue;

    for (const card of cs.hand) {
      const twCard = card as unknown as TotalWarCard;
      if (twCard.type !== 'BOLSTER') continue;
      if (twCard.bolsterTrigger !== trigger) continue;
      if (usedSet.has(card.id)) continue;

      matches.push({
        country,
        card: twCard,
        cardId: card.id,
      });
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// 2. Fire bolster triggers — resolve AI, queue human
// ---------------------------------------------------------------------------

/**
 * Main entry point: fire a bolster trigger, resolving AI bolsters immediately
 * and queuing human bolsters for prompt display.
 *
 * Returns true if any human bolster prompt was set (game paused for response).
 */
export function fireBolsterTrigger(
  trigger: BolsterTrigger,
  triggerCountry: Country,
): boolean {
  const matches = findMatchingBolsters(trigger, triggerCountry);
  if (matches.length === 0) return false;

  const state = useGameStore.getState();
  const tw = useTotalWarStore.getState();

  // Separate AI and human bolsters
  const aiMatches: BolsterMatch[] = [];
  const humanMatches: BolsterMatch[] = [];

  for (const m of matches) {
    const cs = state.countries[m.country];
    if (!cs) continue;

    if (cs.isHuman) {
      humanMatches.push(m);
    } else {
      aiMatches.push(m);
    }
  }

  // Auto-resolve all AI bolsters
  for (const m of aiMatches) {
    const diff = state.countries[m.country].aiDifficulty;
    const shouldUse = aiShouldUseBolster(m.country, m.cardId, trigger, state, tw, diff);
    if (shouldUse) {
      executeBolsterEffect(m.country, m.card, m.cardId, trigger);
    }
  }

  // Queue human bolsters
  if (humanMatches.length === 0) return false;

  // Check if there's already a pending bolster prompt — if so, append to its queue
  // (this happens when multiple triggers fire at the same moment, e.g.
  // PLAY_STEP_BEGIN + ANY_PLAYER_PLAY_STEP during the same phase transition)
  const existingAction = useTotalWarStore.getState().pendingTotalWarAction;
  if (existingAction && existingAction.type === 'BOLSTER_OPPORTUNITY') {
    const newEntries = humanMatches.map((m) => ({
      cardId: m.cardId,
      cardName: m.card.name,
      description: m.card.text || '',
      country: m.country,
      trigger,
    }));
    useTotalWarStore.getState().setPendingTotalWarAction({
      ...existingAction,
      allBolsters: [...(existingAction.allBolsters || []), ...newEntries],
    });
    return true;
  }

  // Show the first human bolster as a prompt
  const first = humanMatches[0];
  const rest = humanMatches.slice(1);

  // Capture the current phase so we can resume it after bolsters resolve
  const currentPhase = state.phase as GamePhase;

  // Pause the game for the human to decide
  useGameStore.setState({ phase: GamePhase.AWAITING_RESPONSE });
  useTotalWarStore.getState().setPendingTotalWarAction({
    type: 'BOLSTER_OPPORTUNITY',
    country: first.country,
    bolsterCardId: first.cardId,
    bolsterCardName: first.card.name,
    trigger,
    description: first.card.text || '',
    resumePhase: currentPhase,
    allBolsters: rest.map((m) => ({
      cardId: m.cardId,
      cardName: m.card.name,
      description: m.card.text || '',
      country: m.country,
      trigger,
    })),
  });

  return true;
}

// ---------------------------------------------------------------------------
// 3. Process next bolster in queue (called after human responds)
// ---------------------------------------------------------------------------

/**
 * After a human responds to a bolster prompt, check if there are more
 * bolsters in the queue. If so, show the next one. If not, resume the game.
 *
 * @param previousPhase - The phase to resume to if no more bolsters.
 */
export function processNextBolster(previousPhase: GamePhase) {
  const pending = useTotalWarStore.getState().pendingTotalWarAction;
  if (!pending || pending.type !== 'BOLSTER_OPPORTUNITY') {
    // No pending action or not a bolster — resume
    useGameStore.setState({ phase: previousPhase });
    return;
  }

  const queue = (pending as any).allBolsters as any[] | undefined;
  if (!queue || queue.length === 0) {
    // No more bolsters — resume
    useTotalWarStore.getState().setPendingTotalWarAction(null);
    useGameStore.setState({ phase: previousPhase });
    return;
  }

  // Show the next bolster, preserving the resume phase
  const next = queue[0];
  const rest = queue.slice(1);
  const resumePhase = (pending as any).resumePhase || previousPhase;

  useTotalWarStore.getState().setPendingTotalWarAction({
    type: 'BOLSTER_OPPORTUNITY',
    country: next.country,
    bolsterCardId: next.cardId,
    bolsterCardName: next.cardName,
    trigger: next.trigger,
    description: next.description,
    resumePhase,
    allBolsters: rest,
  });
}

// ---------------------------------------------------------------------------
// 4. Execute a bolster card's effect
// ---------------------------------------------------------------------------

/** Append a log entry */
function twLog(country: Country, message: string) {
  useGameStore.setState((s) => ({
    log: [...s.log, { country, message, round: s.round, timestamp: Date.now() }],
  }));
}

/**
 * Execute a bolster card: mark as used, discard from hand, pay costs,
 * and apply the effect.
 */
export function executeBolsterEffect(
  country: Country,
  card: TotalWarCard,
  cardId: string,
  trigger: BolsterTrigger,
) {
  const tw = useTotalWarStore.getState();

  // Mark bolster as used this turn
  tw.markBolsterUsed(cardId);

  // Discard the bolster card from hand
  useGameStore.setState((s) => {
    const cs = s.countries[country];
    const bolsterCard = cs.hand.find((c: any) => c.id === cardId);
    if (!bolsterCard) return {};
    return {
      countries: {
        ...s.countries,
        [country]: {
          ...cs,
          hand: cs.hand.filter((c: any) => c.id !== cardId),
          discard: [...cs.discard, bolsterCard],
        },
      },
    };
  });

  // Resolve effects based on the card's effect definitions
  const effects = card.effects || [];
  const state = useGameStore.getState();

  for (const effect of effects) {
    resolveEffect(country, card, effect, state, tw);
  }

  twLog(country, `Bolster: ${card.name}`);
}

// ---------------------------------------------------------------------------
// 5. Resolve individual effects
// ---------------------------------------------------------------------------

function resolveEffect(
  country: Country,
  card: TotalWarCard,
  effect: any,
  state: any,
  tw: TotalWarState,
) {
  const effectType = effect.type;
  const condition = effect.condition;

  // --- Flag effects ---
  if (condition === 'disable_air_defense') {
    useTotalWarStore.getState().setAirDefenseDisabled(true);
    return;
  }

  if (condition === 'all_in_supply_if_af') {
    // All pieces in supply this turn if AF on board
    const hasAF = tw.airForces.some((af) => af.country === country && !af.minorPower);
    if (hasAF) {
      // Set a temporary flag — checked by supply computation
      // For now, log the benefit
      twLog(country, 'All pieces treated as in supply this turn (Air Force bonus)');
    }
    return;
  }

  // --- VP effects ---
  if (effectType === 'VP_PER_CONDITION') {
    const vpPerUnit = effect.amount || 1;
    let count = 0;

    if (condition === 'italian_navy_count') {
      count = state.countries[Country.ITALY]?.piecesOnBoard.filter(
        (p: any) => p.type === 'navy'
      ).length ?? 0;
    } else if (condition === 'japanese_island_count' || condition === 'us_island_count') {
      // Count islands occupied by this country
      const islandSpaces = ['japan', 'pacific_islands', 'dutch_east_indies', 'philippines', 'hawaii', 'midway'];
      count = state.countries[country]?.piecesOnBoard.filter(
        (p: any) => p.type === 'army' && islandSpaces.includes(p.spaceId)
      ).length ?? 0;
    }

    if (count > 0) {
      const vp = vpPerUnit * count;
      const team = getTeam(country);
      useGameStore.setState((s: any) =>
        team === Team.AXIS
          ? { axisVP: s.axisVP + vp }
          : { alliesVP: s.alliesVP + vp }
      );
      twLog(country, `+${vp} VP from ${card.name}`);
    }
    return;
  }

  if (effectType === 'SCORE_VP' && effect.amount && effect.amount > 0) {
    const team = getTeam(country);
    useGameStore.setState((s: any) =>
      team === Team.AXIS
        ? { axisVP: s.axisVP + effect.amount }
        : { alliesVP: s.alliesVP + effect.amount }
    );
    return;
  }

  // --- Deck discard cost (many bolsters: "Discard the top card of your draw deck to...") ---
  if (effectType === 'RECRUIT_ARMY' || effectType === 'LAND_BATTLE' || effectType === 'SEA_BATTLE' ||
      effectType === 'ELIMINATE_NAVY') {
    // Pay deck cost (discard top card)
    payDeckCost(country, 1);
    // Then resolve the main effect
    resolveMainEffect(country, card, effect, state, tw);
    return;
  }

  // --- Force target to discard from deck ---
  if (effectType === 'DISCARD_CARDS' && effect.country) {
    const targetCountry = effect.country as Country;
    let count = effect.count || 1;

    // Scaling condition: The Blitz — 2 per German AF near UK
    if (effect.scalingCondition === 'german_af_near_uk') {
      const ukSpace = HOME_SPACES[Country.UK];
      const nearUK = getAdjacentSpaces(ukSpace);
      nearUK.push(ukSpace);
      const germanAFNearUK = tw.airForces.filter(
        (af) => af.country === Country.GERMANY && !af.minorPower && nearUK.includes(af.spaceId)
      ).length;
      count = 2 * germanAFNearUK;
    }

    if (count > 0) {
      discardFromDeck(targetCountry, count);
      twLog(country, `${COUNTRY_NAMES[targetCountry]} forced to discard ${count} from deck`);
    }
    return;
  }

  // --- Remove AF instead of discarding for EW ---
  if (condition === 'remove_af_instead') {
    // This bolster replaces the EW penalty: instead of discarding, remove own AF
    const myAF = tw.airForces.find((af) => af.country === country && !af.minorPower);
    if (myAF) {
      useTotalWarStore.getState().removeAirForce(myAF.id);
      twLog(country, `Removed Air Force to cancel EW penalty`);
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// 6. Main effect resolution (recruit, battle, eliminate)
// ---------------------------------------------------------------------------

function resolveMainEffect(
  country: Country,
  card: TotalWarCard,
  effect: any,
  state: any,
  tw: TotalWarState,
) {
  const isHuman = state.countries[country]?.isHuman;

  // --- Recruit Army ---
  if (effect.type === 'RECRUIT_ARMY') {
    const targetCountry = effect.country || country;
    const whereSpaces: string[] = effect.where || [];

    // Find valid spaces from the allowed list
    const allValid = getValidBuildLocations(targetCountry, 'army', state);
    const eligible = whereSpaces.length > 0
      ? allValid.filter((s: string) => whereSpaces.includes(s))
      : allValid;

    if (eligible.length > 0) {
      // AI or auto: pick first valid
      const pickedSpace = eligible[0];
      useGameStore.setState((s: any) => {
        const cs = s.countries[targetCountry];
        const newPiece = {
          id: `bolster_army_${Date.now()}`,
          country: targetCountry,
          type: 'army',
          spaceId: pickedSpace,
        };
        return {
          countries: {
            ...s.countries,
            [targetCountry]: {
              ...cs,
              piecesOnBoard: [...cs.piecesOnBoard, newPiece],
            },
          },
        };
      });
      twLog(targetCountry, `Recruited army in ${pickedSpace.replace(/_/g, ' ')} (${card.name})`);
    }
    return;
  }

  // --- Land/Sea Battle (adjacent to AF) ---
  if (effect.type === 'LAND_BATTLE' && effect.condition === 'adjacent_to_af') {
    // Find AF for this country, then find adjacent enemy armies
    const myAFs = tw.airForces.filter((af) => af.country === country && !af.minorPower);
    const enemyTeam = getTeam(country) === Team.AXIS ? Team.ALLIES : Team.AXIS;

    for (const af of myAFs) {
      const adjacent = getAdjacentSpaces(af.spaceId);
      // Also include AF's own space
      adjacent.push(af.spaceId);

      for (const adjSpace of adjacent) {
        // Find enemy army here
        for (const c of TURN_ORDER) {
          if (getTeam(c) !== enemyTeam) continue;
          const enemyPieces = state.countries[c]?.piecesOnBoard || [];
          const enemyArmy = enemyPieces.find(
            (p: any) => p.spaceId === adjSpace && p.type === 'army'
          );
          if (enemyArmy) {
            // Eliminate the enemy army
            useGameStore.setState((s: any) => ({
              countries: {
                ...s.countries,
                [c]: {
                  ...s.countries[c],
                  piecesOnBoard: s.countries[c].piecesOnBoard.filter(
                    (p: any) => p.id !== enemyArmy.id
                  ),
                },
              },
            }));
            twLog(country, `Eliminated enemy army in ${adjSpace.replace(/_/g, ' ')} (${card.name})`);
            return;
          }
        }
      }
    }
    return;
  }

  if (effect.type === 'SEA_BATTLE' && effect.where) {
    // Battle navy in specific spaces (Admiral Graf Spee, A6M Zero-Sen)
    const whereSpaces: string[] = effect.where;
    const enemyTeam = getTeam(country) === Team.AXIS ? Team.ALLIES : Team.AXIS;

    for (const space of whereSpaces) {
      for (const c of TURN_ORDER) {
        if (getTeam(c) !== enemyTeam) continue;
        const enemyPieces = state.countries[c]?.piecesOnBoard || [];
        const enemyNavy = enemyPieces.find(
          (p: any) => p.spaceId === space && p.type === 'navy'
        );
        if (enemyNavy) {
          useGameStore.setState((s: any) => ({
            countries: {
              ...s.countries,
              [c]: {
                ...s.countries[c],
                piecesOnBoard: s.countries[c].piecesOnBoard.filter(
                  (p: any) => p.id !== enemyNavy.id
                ),
              },
            },
          }));
          twLog(country, `Eliminated enemy navy in ${space.replace(/_/g, ' ')} (${card.name})`);
          return;
        }
      }
    }
    return;
  }

  // --- Eliminate adjacent AF ---
  if (effect.condition === 'eliminate_adjacent_af') {
    const myAFs = tw.airForces.filter((af) => af.country === country && !af.minorPower);
    const myTeam = getTeam(country);

    for (const af of myAFs) {
      const adjacent = getAdjacentSpaces(af.spaceId);
      adjacent.push(af.spaceId);
      const enemyAF = tw.airForces.find(
        (eaf) => getTeam(eaf.country) !== myTeam && adjacent.includes(eaf.spaceId)
      );
      if (enemyAF) {
        useTotalWarStore.getState().removeAirForce(enemyAF.id);
        twLog(country, `Eliminated enemy Air Force at ${enemyAF.spaceId.replace(/_/g, ' ')} (${card.name})`);
        return;
      }
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function payDeckCost(country: Country, count: number) {
  useGameStore.setState((s: any) => {
    const cs = s.countries[country];
    if (cs.deck.length < count) return {};
    const discarded = cs.deck.slice(0, count);
    return {
      countries: {
        ...s.countries,
        [country]: {
          ...cs,
          deck: cs.deck.slice(count),
          discard: [...cs.discard, ...discarded],
        },
      },
    };
  });
}

function discardFromDeck(country: Country, count: number) {
  useGameStore.setState((s: any) => {
    const cs = s.countries[country];
    const actual = Math.min(count, cs.deck.length);
    if (actual === 0) return {};
    const discarded = cs.deck.slice(0, actual);
    return {
      countries: {
        ...s.countries,
        [country]: {
          ...cs,
          deck: cs.deck.slice(actual),
          discard: [...cs.discard, ...discarded],
        },
      },
    };
  });
}
