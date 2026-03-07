// ---------------------------------------------------------------------------
// Total War Expansion – AI Module
// Handles AI decisions for Air Forces, Bolster cards, and minor powers.
// ---------------------------------------------------------------------------

import { Country, Team, Card, GameState, getTeam, getEnemyTeam } from '../types';
import { getAdjacentSpaces, SUPPLY_SPACE_IDS, HOME_SPACES, getSpace } from '../mapData';
import { getAllPieces, isInSupply } from '../engine';
import {
  TotalWarState,
  AirForcePiece,
  MinorPower,
  TotalWarCard,
  ExtendedCardType,
  BolsterTrigger,
  MINOR_POWER_CONTROLLER,
} from './types';
import {
  canDeploy,
  canMarshal,
  canGainSuperiority,
  getValidDeployLocations,
  getValidMarshalSources,
  getValidMarshalDestinations,
  getValidSuperiorityTargets,
  canUseAirDefense,
  canUseAirAttack,
  getAirDefenseAF,
  getAirAttackAF,
  hasAirPowerCard,
  isAirForceInSupply,
} from './engine';

// ---------------------------------------------------------------------------
// Space scoring helper (local, simplified version of base AI's scoreSpace)
// ---------------------------------------------------------------------------

function scoreSpaceForAF(
  spaceId: string,
  country: Country,
  state: GameState,
  twState: TotalWarState
): number {
  const space = getSpace(spaceId);
  if (!space) return 0;

  let score = 0;
  const team = getTeam(country);
  const enemyTeam = getEnemyTeam(country);
  const allPieces = getAllPieces(state);
  const adj = getAdjacentSpaces(spaceId);

  // Supply spaces are high value
  if (SUPPLY_SPACE_IDS.includes(spaceId)) score += 15;

  // Home spaces are critical
  if (spaceId === HOME_SPACES[country]) score += 20;

  // Enemy home spaces are high-value targets
  const enemyHomes = Object.entries(HOME_SPACES)
    .filter(([c]) => getTeam(c as Country) === enemyTeam)
    .map(([, s]) => s);
  if (enemyHomes.includes(spaceId)) score += 25;

  // Spaces with enemy pieces nearby — AF provides tactical advantage
  const adjacentEnemyCount = adj.filter((a) =>
    allPieces.some((p) => p.spaceId === a && getTeam(p.country) === enemyTeam)
  ).length;
  score += adjacentEnemyCount * 5;

  // Spaces with friendly pieces — AF supports defense
  const friendlyHere = allPieces.filter(
    (p) => p.spaceId === spaceId && getTeam(p.country) === team
  ).length;
  score += friendlyHere * 3;

  // Adjacent enemy AF makes this space more valuable (can gain superiority later)
  const adjacentEnemyAF = twState.airForces.filter(
    (af) => getTeam(af.country) !== team && adj.includes(af.spaceId)
  ).length;
  score += adjacentEnemyAF * 8;

  // Frontline bonus: spaces adjacent to both friendly and enemy pieces
  const hasFriendlyAdj = adj.some((a) =>
    allPieces.some((p) => p.spaceId === a && getTeam(p.country) === team)
  );
  const hasEnemyAdj = adj.some((a) =>
    allPieces.some((p) => p.spaceId === a && getTeam(p.country) === enemyTeam)
  );
  if (hasFriendlyAdj && hasEnemyAdj) score += 10;

  return score;
}

// ---------------------------------------------------------------------------
// Air Step Action Choice
// ---------------------------------------------------------------------------

/**
 * AI decides what to do during the Air Step.
 * Returns the action to take and any related data.
 */
export function aiChooseAirStepAction(
  country: Country,
  state: GameState,
  twState: TotalWarState,
  difficulty: 'easy' | 'medium' | 'hard'
): { action: 'DEPLOY' | 'MARSHAL' | 'GAIN_SUPERIORITY' | 'SKIP'; minorPower?: MinorPower } {

  // Easy AI: random valid choice
  if (difficulty === 'easy') {
    const options: { action: 'DEPLOY' | 'MARSHAL' | 'GAIN_SUPERIORITY' | 'SKIP'; minorPower?: MinorPower }[] = [];
    if (canDeploy(country, state, twState)) options.push({ action: 'DEPLOY' });
    if (canMarshal(country, state, twState)) options.push({ action: 'MARSHAL' });
    if (canGainSuperiority(country, state, twState)) options.push({ action: 'GAIN_SUPERIORITY' });

    // Check minor power options for controller
    const minors: MinorPower[] = (['FRANCE', 'CHINA'] as MinorPower[]).filter(
      (mp) => MINOR_POWER_CONTROLLER[mp] === country
    );
    for (const mp of minors) {
      if (canDeploy(country, state, twState, mp)) options.push({ action: 'DEPLOY', minorPower: mp });
      if (canMarshal(country, state, twState, mp)) options.push({ action: 'MARSHAL', minorPower: mp });
    }

    options.push({ action: 'SKIP' });
    return options[Math.floor(Math.random() * options.length)];
  }

  // Medium/Hard: scored priority system
  // Priority: Gain Superiority (high-value) > Deploy (good location) > Marshal > Skip

  let bestAction: { action: 'DEPLOY' | 'MARSHAL' | 'GAIN_SUPERIORITY' | 'SKIP'; minorPower?: MinorPower } = { action: 'SKIP' };
  let bestScore = 0; // SKIP baseline is 0

  // --- Gain Superiority ---
  if (canGainSuperiority(country, state, twState)) {
    const targets = getValidSuperiorityTargets(country, state, twState);
    if (targets.length > 0) {
      // Score each target
      let maxTargetScore = 0;
      for (const target of targets) {
        let tScore = 20; // base value of eliminating enemy AF
        // Higher value if target is near our important spaces
        if (SUPPLY_SPACE_IDS.includes(target.spaceId)) tScore += 10;
        if (target.spaceId === HOME_SPACES[country]) tScore += 15;
        // Adjacent to our supply spaces
        const adj = getAdjacentSpaces(target.spaceId);
        const nearOurSupply = adj.some((a) => SUPPLY_SPACE_IDS.includes(a));
        if (nearOurSupply) tScore += 5;
        if (tScore > maxTargetScore) maxTargetScore = tScore;
      }
      const superiorityScore = maxTargetScore + (difficulty === 'hard' ? 5 : 0);
      if (superiorityScore > bestScore) {
        bestScore = superiorityScore;
        bestAction = { action: 'GAIN_SUPERIORITY' };
      }
    }
  }

  // --- Deploy ---
  const checkDeploy = (minorPower?: MinorPower) => {
    if (!canDeploy(country, state, twState, minorPower)) return;
    const locations = getValidDeployLocations(country, state, twState, minorPower);
    if (locations.length === 0) return;

    let maxLocScore = 0;
    for (const loc of locations) {
      const locScore = scoreSpaceForAF(loc, country, state, twState);
      if (locScore > maxLocScore) maxLocScore = locScore;
    }

    // Deploy base value: getting an AF on the board is good
    const deployScore = 15 + maxLocScore * 0.5 + (difficulty === 'hard' ? 3 : 0);
    if (deployScore > bestScore) {
      bestScore = deployScore;
      bestAction = { action: 'DEPLOY', minorPower };
    }
  };

  checkDeploy();
  // Check minor power deploy for controller
  const controlledMinors: MinorPower[] = (['FRANCE', 'CHINA'] as MinorPower[]).filter(
    (mp) => MINOR_POWER_CONTROLLER[mp] === country
  );
  for (const mp of controlledMinors) {
    checkDeploy(mp);
  }

  // --- Marshal ---
  const checkMarshal = (minorPower?: MinorPower) => {
    if (!canMarshal(country, state, twState, minorPower)) return;
    const sources = getValidMarshalSources(country, state, twState, minorPower);
    if (sources.length === 0) return;

    let bestMoveImprovement = 0;
    for (const af of sources) {
      const currentScore = scoreSpaceForAF(af.spaceId, country, state, twState);
      const dests = getValidMarshalDestinations(af.id, country, state, twState, minorPower);
      for (const dest of dests) {
        const destScore = scoreSpaceForAF(dest, country, state, twState);
        const improvement = destScore - currentScore;
        if (improvement > bestMoveImprovement) bestMoveImprovement = improvement;
      }
    }

    // Only marshal if we gain meaningful improvement
    // The cost is discarding any card, so improvement must justify that
    const marshalScore = bestMoveImprovement > 5
      ? 10 + bestMoveImprovement * 0.5
      : 0;
    if (marshalScore > bestScore) {
      bestScore = marshalScore;
      bestAction = { action: 'MARSHAL', minorPower };
    }
  };

  checkMarshal();
  for (const mp of controlledMinors) {
    checkMarshal(mp);
  }

  // Add small random noise (less for hard)
  // Already evaluated — just return best
  return bestAction;
}

// ---------------------------------------------------------------------------
// Deploy Location
// ---------------------------------------------------------------------------

/**
 * AI picks the best space to deploy an Air Force.
 */
export function aiPickDeployLocation(
  country: Country,
  state: GameState,
  twState: TotalWarState,
  minorPower?: MinorPower
): string | null {
  const locations = getValidDeployLocations(country, state, twState, minorPower);
  if (locations.length === 0) return null;
  if (locations.length === 1) return locations[0];

  let bestLoc = locations[0];
  let bestScore = -Infinity;

  for (const loc of locations) {
    const score = scoreSpaceForAF(loc, country, state, twState) + Math.random() * 3;
    if (score > bestScore) {
      bestScore = score;
      bestLoc = loc;
    }
  }

  return bestLoc;
}

// ---------------------------------------------------------------------------
// Marshal Move
// ---------------------------------------------------------------------------

/**
 * AI picks which Air Force to marshal and where.
 */
export function aiPickMarshalMove(
  country: Country,
  state: GameState,
  twState: TotalWarState,
  minorPower?: MinorPower
): { afId: string; destination: string } | null {
  const sources = getValidMarshalSources(country, state, twState, minorPower);
  if (sources.length === 0) return null;

  let bestMove: { afId: string; destination: string } | null = null;
  let bestImprovement = -Infinity;

  for (const af of sources) {
    const currentScore = scoreSpaceForAF(af.spaceId, country, state, twState);
    const dests = getValidMarshalDestinations(af.id, country, state, twState, minorPower);

    for (const dest of dests) {
      const destScore = scoreSpaceForAF(dest, country, state, twState) + Math.random() * 2;
      const improvement = destScore - currentScore;
      if (improvement > bestImprovement) {
        bestImprovement = improvement;
        bestMove = { afId: af.id, destination: dest };
      }
    }
  }

  return bestMove;
}

// ---------------------------------------------------------------------------
// Superiority Target
// ---------------------------------------------------------------------------

/**
 * AI picks which enemy AF to target with air superiority.
 */
export function aiPickSuperiorityTarget(
  country: Country,
  state: GameState,
  twState: TotalWarState
): string | null {
  const targets = getValidSuperiorityTargets(country, state, twState);
  if (targets.length === 0) return null;
  if (targets.length === 1) return targets[0].afId;

  let bestTarget = targets[0].afId;
  let bestScore = -Infinity;

  for (const target of targets) {
    let score = 10; // base value of any elimination

    // Higher value targets: near our supply/home spaces
    if (SUPPLY_SPACE_IDS.includes(target.spaceId)) score += 12;
    if (target.spaceId === HOME_SPACES[country]) score += 20;

    // Target near our pieces (threatening us)
    const adj = getAdjacentSpaces(target.spaceId);
    const allPieces = getAllPieces(state);
    const friendlyNearby = adj.filter((a) =>
      allPieces.some((p) => p.spaceId === a && p.country === country)
    ).length;
    score += friendlyNearby * 4;

    // Enemy AF that is in supply is more threatening
    const afPiece = twState.airForces.find((af) => af.id === target.afId);
    if (afPiece && isAirForceInSupply(afPiece, state, twState)) {
      score += 8;
    }

    score += Math.random() * 3;

    if (score > bestScore) {
      bestScore = score;
      bestTarget = target.afId;
    }
  }

  return bestTarget;
}

// ---------------------------------------------------------------------------
// Air Defense
// ---------------------------------------------------------------------------

/**
 * AI decides whether to use Air Defense (sacrifice AF to save Army/Navy).
 */
export function aiShouldUseAirDefense(
  country: Country,
  state: GameState,
  twState: TotalWarState,
  difficulty: 'easy' | 'medium' | 'hard'
): boolean {
  // Easy: always use (reflex save)
  if (difficulty === 'easy') return true;

  // Medium: use unless we have plenty of pieces and few AFs
  if (difficulty === 'medium') {
    const countryPieces = state.countries[country].piecesOnBoard;
    const myAFs = twState.airForces.filter(
      (af) => af.country === country && !af.minorPower
    );
    // If we have many pieces on board (5+) and only one AF, don't sacrifice
    if (countryPieces.length >= 5 && myAFs.length <= 1) return false;
    return true;
  }

  // Hard: evaluate piece value vs AF value
  const countryPieces = state.countries[country].piecesOnBoard;
  const myAFs = twState.airForces.filter(
    (af) => af.country === country && !af.minorPower
  );

  // Always save if we have few pieces (3 or fewer) — every piece counts
  if (countryPieces.length <= 3) return true;

  // Don't sacrifice our last AF if we have healthy board presence
  if (myAFs.length <= 1 && countryPieces.length >= 5) return false;

  // With multiple AFs, usually worth saving the piece
  return true;
}

// ---------------------------------------------------------------------------
// Air Attack
// ---------------------------------------------------------------------------

/**
 * AI decides whether to use Air Attack (eliminate enemy AF after battle).
 * Almost always yes since it's a free elimination.
 */
export function aiShouldUseAirAttack(): boolean {
  // Air attack is essentially free — always take it
  return true;
}

// ---------------------------------------------------------------------------
// Bolster
// ---------------------------------------------------------------------------

/**
 * AI decides whether to use a bolster card when triggered.
 * Returns true if the AI wants to use it.
 */
export function aiShouldUseBolster(
  country: Country,
  bolsterCardId: string,
  trigger: BolsterTrigger,
  state: GameState,
  twState: TotalWarState,
  difficulty: 'easy' | 'medium' | 'hard'
): boolean {
  // Easy: always use bolsters when triggered (they're generally beneficial)
  if (difficulty === 'easy') return true;

  // Medium: use most bolsters, skip only if hand is very small
  if (difficulty === 'medium') {
    const hand = state.countries[country].hand;
    // Some bolsters require discarding cards — skip if hand is tiny
    if (hand.length <= 2) {
      // Only skip bolsters that might cost cards;
      // phase-triggered bolsters are usually free
      const costlyTriggers: BolsterTrigger[] = [
        'DEPLOY_OR_MARSHAL_AF',
        'BUILD_NAVY',
        'BUILD_ARMY',
      ];
      if (costlyTriggers.includes(trigger)) return false;
    }
    return true;
  }

  // Hard: evaluate more carefully
  const hand = state.countries[country].hand;

  // With very few cards (1-2), be selective — only use clearly beneficial bolsters
  if (hand.length <= 2) {
    // Phase-begin bolsters are usually free effects, always use
    const freeTriggers: BolsterTrigger[] = [
      'PLAY_STEP_BEGIN',
      'VICTORY_STEP_BEGIN',
      'DRAW_STEP_BEGIN',
      'DISCARD_STEP_BEGIN',
      'AIR_STEP_BEGIN',
      'ANY_PLAYER_PLAY_STEP',
    ];
    if (freeTriggers.includes(trigger)) return true;

    // Defensive bolsters are important
    const defensiveTriggers: BolsterTrigger[] = [
      'ARMY_BATTLED',
      'ARMY_REMOVED',
      'LAST_ARMY_REMOVED',
      'TARGET_OF_EW',
    ];
    if (defensiveTriggers.includes(trigger)) return true;

    // Skip others to preserve hand size
    return false;
  }

  // With reasonable hand, use bolsters
  return true;
}

// ---------------------------------------------------------------------------
// Card Discard for Air Step
// ---------------------------------------------------------------------------

/**
 * AI picks which card to discard for Air Step actions (deploy/marshal/superiority).
 * For deploy/superiority: must be an Air Power card.
 * For marshal: can be any card, picks the lowest value one.
 */
export function aiPickCardToDiscard(
  country: Country,
  state: GameState,
  requireAirPower: boolean
): number {
  const hand = state.countries[country].hand;
  if (hand.length === 0) return -1;

  if (requireAirPower) {
    // Must pick an Air Power card — find the first one
    // If multiple, pick the one we value least (they're all the same so just first)
    for (let i = 0; i < hand.length; i++) {
      const card = hand[i] as unknown as TotalWarCard;
      if (card.type === 'AIR_POWER') return i;
    }
    return -1; // shouldn't happen if canDeploy/canGainSuperiority returned true
  }

  // Marshal: discard lowest value card
  let worstIndex = 0;
  let worstScore = Infinity;

  for (let i = 0; i < hand.length; i++) {
    const card = hand[i];
    const score = simpleCardScore(card, state);
    if (score < worstScore) {
      worstScore = score;
      worstIndex = i;
    }
  }

  return worstIndex;
}

// ---------------------------------------------------------------------------
// Simple card scoring (for discard decisions)
// Mirrors base AI scoreCard logic but simplified to avoid importing private fn
// ---------------------------------------------------------------------------

function simpleCardScore(card: Card, state: GameState): number {
  const twCard = card as unknown as TotalWarCard;
  let score = 0;

  switch (twCard.type) {
    case 'BUILD_ARMY':
      score = 10;
      break;
    case 'BUILD_NAVY':
      score = 8;
      break;
    case 'LAND_BATTLE':
      score = 12;
      break;
    case 'SEA_BATTLE':
      score = 10;
      break;
    case 'STATUS':
      score = 15;
      break;
    case 'RESPONSE':
      score = 14;
      break;
    case 'EVENT':
      score = 11;
      break;
    case 'ECONOMIC_WARFARE':
      score = 9;
      break;
    case 'AIR_POWER':
      score = 7; // Air Power cards are useful but interchangeable
      break;
    case 'BOLSTER':
      score = 6; // Bolsters are situational — lowest priority to keep
      break;
    default:
      score = 5;
  }

  // Adjust for early/late game
  const round = state.round;
  if (round <= 5) {
    // Early game: builds and status cards more valuable
    if (twCard.type === 'BUILD_ARMY' || twCard.type === 'BUILD_NAVY') score += 5;
    if (twCard.type === 'STATUS') score += 5;
  } else if (round > 12) {
    // Late game: battles and events more valuable
    if (twCard.type === 'LAND_BATTLE' || twCard.type === 'SEA_BATTLE') score += 5;
    if (twCard.type === 'EVENT') score += 3;
  }

  return score;
}
