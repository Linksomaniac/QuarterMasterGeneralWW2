// ---------------------------------------------------------------------------
// Total War Expansion Engine
// Extension-only logic that builds on the base engine without modifying it.
// ---------------------------------------------------------------------------

import { Country, Team, Card, GameState, Piece, getTeam } from '../types';
import { getCountryDeck } from '../cards';
import { getAdjacentSpaces, SUPPLY_SPACE_IDS } from '../mapData';
import { getAllPieces, isInSupply } from '../engine';
import {
  TotalWarState,
  AirForcePiece,
  MinorPowerPiece,
  MinorPower,
  MINOR_POWER_HOME,
  MINOR_POWER_CONTROLLER,
  AIR_FORCE_LIMITS,
  TotalWarCard,
  ExtendedCardType,
  MINOR_POWER_PIECES,
} from './types';
import { getExpansionDeck, getSubstituteBaseIds } from './cards';

// ---------------------------------------------------------------------------
// 1. Air Force Supply
// ---------------------------------------------------------------------------

/**
 * An Air Force is in supply if it occupies the same space as a supplied
 * Army or Navy belonging to the same country (or the same minor power).
 */
export function isAirForceInSupply(
  af: AirForcePiece,
  state: GameState,
  twState: TotalWarState
): boolean {
  const allPieces = getAllPieces(state);

  if (af.minorPower) {
    // Minor power AF: needs a minor power Army/Navy in the same space
    // that traces its own minor power supply chain.
    const minorPiecesInSpace = twState.minorPowerPieces.filter(
      (mp) => mp.minorPower === af.minorPower && mp.spaceId === af.spaceId
    );
    if (minorPiecesInSpace.length === 0) return false;
    // Check if any of those minor pieces are in supply
    return minorPiecesInSpace.some((mp) =>
      isMinorPowerPieceInSupply(mp, allPieces, twState.minorPowerPieces, state, twState)
    );
  }

  // Major power AF: needs a same-country Army or Navy in the same space that is supplied
  const friendlyPiecesInSpace = allPieces.filter(
    (p) => p.country === af.country && p.spaceId === af.spaceId
  );
  if (friendlyPiecesInSpace.length === 0) return false;
  return friendlyPiecesInSpace.some((p) => isInSupply(p, state));
}

// ---------------------------------------------------------------------------
// 2. Air Force Reposition
// ---------------------------------------------------------------------------

/**
 * After supply removal, check each AF on the board.  If an AF is in a space
 * without any Army/Navy from the same country/minor power, it must reposition
 * to an adjacent space that contains a supplied Army/Navy from the same force.
 * If no such space exists, the AF is removed.
 *
 * Returns a list of AFs that need repositioning, along with their valid
 * destinations.  The caller is responsible for prompting the player or
 * AI and actually moving/removing the AF.
 */
export function checkAirForceReposition(
  twState: TotalWarState,
  baseState: GameState
): { afId: string; country: Country; minorPower?: MinorPower; validSpaces: string[] }[] {
  const allPieces = getAllPieces(baseState);
  const results: { afId: string; country: Country; minorPower?: MinorPower; validSpaces: string[] }[] = [];

  for (const af of twState.airForces) {
    const hasCompanion = af.minorPower
      ? twState.minorPowerPieces.some(
          (mp) => mp.minorPower === af.minorPower && mp.spaceId === af.spaceId
        )
      : allPieces.some(
          (p) => p.country === af.country && p.spaceId === af.spaceId
        );

    if (hasCompanion) continue; // AF is co-located, no reposition needed

    // Must reposition: find adjacent spaces with a supplied Army/Navy
    const adjacentSpaces = getAdjacentSpaces(af.spaceId);
    const validSpaces: string[] = [];

    for (const adjId of adjacentSpaces) {
      if (af.minorPower) {
        // Minor power AF repos to space with supplied minor power Army/Navy
        const hasSuppliedMinor = twState.minorPowerPieces.some(
          (mp) =>
            mp.minorPower === af.minorPower &&
            mp.spaceId === adjId &&
            isMinorPowerPieceInSupply(mp, allPieces, twState.minorPowerPieces, baseState, twState)
        );
        if (hasSuppliedMinor) validSpaces.push(adjId);
      } else {
        // Major power AF repos to space with supplied Army/Navy from same country
        const hasSupplied = allPieces.some(
          (p) =>
            p.country === af.country &&
            p.spaceId === adjId &&
            isInSupply(p, baseState)
        );
        if (hasSupplied) validSpaces.push(adjId);
      }
    }

    // Also check: destination must not already have an AF from same country/minor
    const filteredSpaces = validSpaces.filter((spId) => {
      if (af.minorPower) {
        return !twState.airForces.some(
          (other) =>
            other.id !== af.id &&
            other.minorPower === af.minorPower &&
            other.spaceId === spId
        );
      }
      return !twState.airForces.some(
        (other) =>
          other.id !== af.id &&
          other.country === af.country &&
          !other.minorPower &&
          other.spaceId === spId
      );
    });

    results.push({
      afId: af.id,
      country: af.country,
      minorPower: af.minorPower,
      validSpaces: filteredSpaces,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 3. Air Step Logic
// ---------------------------------------------------------------------------

/**
 * Valid spaces to deploy (place) an Air Force: spaces that contain a supplied
 * Army or Navy from the same country and don't already have an AF from that
 * country/minor.
 */
export function getValidDeployLocations(
  country: Country,
  state: GameState,
  twState: TotalWarState,
  minorPower?: MinorPower
): string[] {
  const allPieces = getAllPieces(state);
  const validSpaces: string[] = [];
  const seenSpaces = new Set<string>();

  if (minorPower) {
    // Deploy minor power AF to space with supplied minor power Army/Navy
    for (const mp of twState.minorPowerPieces) {
      if (mp.minorPower !== minorPower) continue;
      if (seenSpaces.has(mp.spaceId)) continue;
      seenSpaces.add(mp.spaceId);
      if (!isMinorPowerPieceInSupply(mp, allPieces, twState.minorPowerPieces, state, twState)) continue;
      // Check no AF from this minor power already in this space
      const hasAF = twState.airForces.some(
        (af) => af.minorPower === minorPower && af.spaceId === mp.spaceId
      );
      if (!hasAF) validSpaces.push(mp.spaceId);
    }
  } else {
    // Deploy major power AF to space with supplied Army/Navy from same country
    for (const piece of allPieces) {
      if (piece.country !== country) continue;
      if (seenSpaces.has(piece.spaceId)) continue;
      seenSpaces.add(piece.spaceId);
      if (!isInSupply(piece, state)) continue;
      // Check no AF from this country (non-minor) already in this space
      const hasAF = twState.airForces.some(
        (af) => af.country === country && !af.minorPower && af.spaceId === piece.spaceId
      );
      if (!hasAF) validSpaces.push(piece.spaceId);
    }
  }

  return validSpaces;
}

/**
 * AFs on the board that can be marshalled (moved): supplied AFs belonging
 * to the country/minor power.
 */
export function getValidMarshalSources(
  country: Country,
  state: GameState,
  twState: TotalWarState,
  minorPower?: MinorPower
): AirForcePiece[] {
  return twState.airForces.filter((af) => {
    if (minorPower) {
      return af.minorPower === minorPower && isAirForceInSupply(af, state, twState);
    }
    return af.country === country && !af.minorPower && isAirForceInSupply(af, state, twState);
  });
}

/**
 * Valid destination spaces for marshalling (moving) a specific AF: spaces
 * with a supplied Army/Navy from the same country (may be different from
 * the AF's current space).
 */
export function getValidMarshalDestinations(
  afId: string,
  country: Country,
  state: GameState,
  twState: TotalWarState,
  minorPower?: MinorPower
): string[] {
  const af = twState.airForces.find((a) => a.id === afId);
  if (!af) return [];

  const allPieces = getAllPieces(state);
  const validSpaces: string[] = [];
  const seenSpaces = new Set<string>();

  if (minorPower) {
    for (const mp of twState.minorPowerPieces) {
      if (mp.minorPower !== minorPower) continue;
      if (seenSpaces.has(mp.spaceId)) continue;
      seenSpaces.add(mp.spaceId);
      if (!isMinorPowerPieceInSupply(mp, allPieces, twState.minorPowerPieces, state, twState)) continue;
      // Can't have another AF from same minor in destination
      const hasOtherAF = twState.airForces.some(
        (other) => other.id !== afId && other.minorPower === minorPower && other.spaceId === mp.spaceId
      );
      if (!hasOtherAF) validSpaces.push(mp.spaceId);
    }
  } else {
    for (const piece of allPieces) {
      if (piece.country !== country) continue;
      if (seenSpaces.has(piece.spaceId)) continue;
      seenSpaces.add(piece.spaceId);
      if (!isInSupply(piece, state)) continue;
      // Can't have another AF from same country (non-minor) in destination
      const hasOtherAF = twState.airForces.some(
        (other) => other.id !== afId && other.country === country && !other.minorPower && other.spaceId === piece.spaceId
      );
      if (!hasOtherAF) validSpaces.push(piece.spaceId);
    }
  }

  return validSpaces;
}

/**
 * Valid targets for Air Superiority: enemy AFs that are in a space adjacent
 * to any of your supplied AFs.
 */
export function getValidSuperiorityTargets(
  country: Country,
  state: GameState,
  twState: TotalWarState
): { afId: string; spaceId: string; ownerCountry: Country; ownerMinorPower?: MinorPower }[] {
  const myTeam = getTeam(country);

  // Find all supplied AFs belonging to this country (non-minor only for superiority)
  const mySuppliedAFs = twState.airForces.filter(
    (af) => af.country === country && !af.minorPower && isAirForceInSupply(af, state, twState)
  );
  if (mySuppliedAFs.length === 0) return [];

  // Collect all spaces adjacent to my supplied AFs
  const adjacentSpaces = new Set<string>();
  for (const af of mySuppliedAFs) {
    for (const adjId of getAdjacentSpaces(af.spaceId)) {
      adjacentSpaces.add(adjId);
    }
    // Also include the AF's own space (enemy AF could be co-located)
    adjacentSpaces.add(af.spaceId);
  }

  // Find enemy AFs in those spaces
  const targets: { afId: string; spaceId: string; ownerCountry: Country; ownerMinorPower?: MinorPower }[] = [];
  for (const enemyAF of twState.airForces) {
    // Determine the team of the enemy AF
    const enemyTeam = getTeam(enemyAF.country);
    if (enemyTeam === myTeam) continue; // Skip friendly AFs

    if (adjacentSpaces.has(enemyAF.spaceId)) {
      targets.push({
        afId: enemyAF.id,
        spaceId: enemyAF.spaceId,
        ownerCountry: enemyAF.country,
        ownerMinorPower: enemyAF.minorPower,
      });
    }
  }

  return targets;
}

/**
 * Can this country deploy an AF this Air Step?
 * Requires: Air Power card in hand + available AF piece + valid location.
 */
export function canDeploy(
  country: Country,
  state: GameState,
  twState: TotalWarState,
  minorPower?: MinorPower
): boolean {
  const cs = state.countries[country];

  // Need an Air Power card in hand
  const hasAirPowerCard = cs.hand.some(
    (c) => (c as unknown as TotalWarCard).type === 'AIR_POWER'
  );
  if (!hasAirPowerCard) return false;

  // Need an available AF piece (not already on board)
  if (!hasAvailableAFPiece(country, twState, minorPower)) return false;

  // Need at least one valid deployment location
  const locations = getValidDeployLocations(country, state, twState, minorPower);
  return locations.length > 0;
}

/**
 * Can this country marshal (move) an AF this Air Step?
 * Requires: any card in hand + supplied AF on board + valid destination.
 */
export function canMarshal(
  country: Country,
  state: GameState,
  twState: TotalWarState,
  minorPower?: MinorPower
): boolean {
  const cs = state.countries[country];

  // Need at least one card in hand (any card)
  if (cs.hand.length === 0) return false;

  // Need a supplied AF on board
  const sources = getValidMarshalSources(country, state, twState, minorPower);
  if (sources.length === 0) return false;

  // Need at least one valid destination for at least one source AF
  for (const af of sources) {
    const dests = getValidMarshalDestinations(af.id, country, state, twState, minorPower);
    if (dests.length > 0) return true;
  }

  return false;
}

/**
 * Can this country gain air superiority this Air Step?
 * Requires: Air Power card in hand + supplied AF adjacent to enemy AF.
 */
export function canGainSuperiority(
  country: Country,
  state: GameState,
  twState: TotalWarState
): boolean {
  const cs = state.countries[country];

  // Need an Air Power card in hand
  const hasAirPowerCard = cs.hand.some(
    (c) => (c as unknown as TotalWarCard).type === 'AIR_POWER'
  );
  if (!hasAirPowerCard) return false;

  // Need at least one valid target
  const targets = getValidSuperiorityTargets(country, state, twState);
  return targets.length > 0;
}

// ---------------------------------------------------------------------------
// 4. Minor Power Supply
// ---------------------------------------------------------------------------

/**
 * Compute the supply chain for a minor power.
 *
 * Minor powers trace supply independently from their controller.
 * France home = western_europe (or united_kingdom if Government in Exile
 *   is active and western_europe has an Axis army).
 * China home = china (or szechuan if szechuan_china supply marker is active
 *   and china has an Axis army).
 *
 * BFS starts from the minor power's home space if it has a minor power army
 * there, then traverses through adjacent spaces that have minor power pieces,
 * returning the set of reachable spaces.
 */
export function computeMinorPowerSupply(
  minorPower: MinorPower,
  allPieces: Piece[],
  minorPieces: MinorPowerPiece[],
  state: GameState,
  twState: TotalWarState
): Set<string> {
  const homeSpaceId = getMinorPowerHomeSpace(minorPower, allPieces, state, twState);
  const myPieces = minorPieces.filter((mp) => mp.minorPower === minorPower);

  // Build set of spaces occupied by this minor power's pieces
  const pieceSpaces = new Set(myPieces.map((mp) => mp.spaceId));

  // Supply origins: supply spaces (including the home space) with a minor army
  const supplySpaces = getMinorPowerSupplySpaces(minorPower, twState);
  const supplyOrigins = supplySpaces.filter(
    (spId) => myPieces.some((mp) => mp.spaceId === spId && mp.type === 'army')
  );

  if (supplyOrigins.length === 0) return new Set<string>();

  // BFS through minor power piece spaces
  const reached = new Set<string>(supplyOrigins);
  const queue = [...supplyOrigins];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const adj of getAdjacentSpaces(current)) {
      if (!reached.has(adj) && pieceSpaces.has(adj)) {
        reached.add(adj);
        queue.push(adj);
      }
    }
  }

  return reached;
}

/**
 * Check if a minor power piece is in supply.
 */
export function isMinorPowerPieceInSupply(
  mp: MinorPowerPiece,
  allPieces: Piece[],
  minorPieces: MinorPowerPiece[],
  state: GameState,
  twState: TotalWarState
): boolean {
  const chain = computeMinorPowerSupply(mp.minorPower, allPieces, minorPieces, state, twState);
  return chain.has(mp.spaceId);
}

/**
 * Get the effective home space for a minor power, accounting for government
 * in exile / fallback rules.
 */
function getMinorPowerHomeSpace(
  minorPower: MinorPower,
  allPieces: Piece[],
  _state: GameState,
  twState: TotalWarState
): string {
  if (minorPower === 'FRANCE') {
    if (twState.franceHomeIsUK) {
      // Government in Exile: home is UK if western_europe has Axis army
      const wEuropeHasAxisArmy = allPieces.some(
        (p) =>
          p.spaceId === 'western_europe' &&
          p.type === 'army' &&
          getTeam(p.country) === Team.AXIS
      );
      if (wEuropeHasAxisArmy) return 'united_kingdom';
    }
    return MINOR_POWER_HOME.FRANCE; // western_europe
  }

  if (minorPower === 'CHINA') {
    if (twState.supplySourceMarkers.szechuan_china) {
      // American Volunteer Group Expands: szechuan is substitute home
      // if china has Axis army
      const chinaHasAxisArmy = allPieces.some(
        (p) =>
          p.spaceId === 'china' &&
          p.type === 'army' &&
          getTeam(p.country) === Team.AXIS
      );
      if (chinaHasAxisArmy) return 'szechuan';
    }
    return MINOR_POWER_HOME.CHINA; // china
  }

  return MINOR_POWER_HOME[minorPower];
}

/**
 * Get the list of supply spaces relevant for a minor power.
 * Minor powers can use standard supply spaces plus any special ones from
 * expansion supply source markers.
 */
function getMinorPowerSupplySpaces(
  minorPower: MinorPower,
  twState: TotalWarState
): string[] {
  const spaces = [...SUPPLY_SPACE_IDS];

  if (minorPower === 'FRANCE') {
    // France gains africa as supply source from Senegalese Tirailleurs
    if (twState.supplySourceMarkers.africa) {
      spaces.push('africa');
    }
    // Government in Exile allows UK as home/supply
    if (twState.franceHomeIsUK) {
      if (!spaces.includes('united_kingdom')) spaces.push('united_kingdom');
    }
  }

  if (minorPower === 'CHINA') {
    // American Volunteer Group Expands makes szechuan a supply source
    if (twState.supplySourceMarkers.szechuan_china) {
      spaces.push('szechuan');
    }
  }

  return spaces;
}

// ---------------------------------------------------------------------------
// 5. Minor Power VP
// ---------------------------------------------------------------------------

/**
 * Count supply spaces controlled by minor power pieces during the
 * controller's Victory step.  Returns the VP earned.
 *
 * A minor power "controls" a supply space if it has a minor power army in
 * that space that is in supply.  Follows the same VP rules as major powers:
 * 2 VP if sole controller, 1 VP if shared with an allied piece.
 */
export function calculateMinorPowerVP(
  minorPower: MinorPower,
  twState: TotalWarState,
  state: GameState
): number {
  const allPieces = getAllPieces(state);
  const myPieces = twState.minorPowerPieces.filter((mp) => mp.minorPower === minorPower);
  const supplyChain = computeMinorPowerSupply(minorPower, allPieces, myPieces, state, twState);
  const controllerTeam = getTeam(MINOR_POWER_CONTROLLER[minorPower]);

  let vp = 0;
  const supplySpaces = getMinorPowerSupplySpaces(minorPower, twState);

  for (const spId of supplySpaces) {
    // Does this minor power have a supplied army here?
    const hasSuppliedArmy = myPieces.some(
      (mp) => mp.spaceId === spId && mp.type === 'army' && supplyChain.has(spId)
    );
    if (!hasSuppliedArmy) continue;

    // Check if enemy also has an army in this supply space
    const enemyHasArmy = allPieces.some(
      (p) =>
        p.spaceId === spId &&
        p.type === 'army' &&
        getTeam(p.country) !== controllerTeam
    );
    // Also check enemy minor power armies
    const enemyMinorHasArmy = twState.minorPowerPieces.some(
      (mp) =>
        mp.spaceId === spId &&
        mp.type === 'army' &&
        mp.minorPower !== minorPower &&
        getTeam(MINOR_POWER_CONTROLLER[mp.minorPower]) !== controllerTeam
    );

    if (enemyHasArmy || enemyMinorHasArmy) {
      vp += 1; // Shared
    } else {
      vp += 2; // Sole control
    }
  }

  return vp;
}

// ---------------------------------------------------------------------------
// 6. Deck Merging
// ---------------------------------------------------------------------------

/**
 * Combine base deck + expansion cards for Total War play.
 *
 * 1. Get base deck via getCountryDeck(country)
 * 2. Get substitute base IDs from expansion
 * 3. Filter out base cards whose IDs are in the substitute list
 * 4. Get expansion cards for this country
 * 5. Combine filtered base + all expansion cards
 */
export function getTotalWarDeck(country: Country): (Card | TotalWarCard)[] {
  const baseDeck = getCountryDeck(country);
  const substituteIds = getSubstituteBaseIds();

  // Remove base cards that have expansion substitutes
  const filteredBase = baseDeck.filter((card) => !substituteIds.includes(card.id));

  // Get expansion cards for this country
  const expansionCards = getExpansionDeck(country);

  // Combine: filtered base cards + all expansion cards
  return [...filteredBase, ...expansionCards];
}

// ---------------------------------------------------------------------------
// 7. Mandatory Discard
// ---------------------------------------------------------------------------

/**
 * Check the mandatory discard rule: if a player discards 0 cards during
 * the Discard step, their team loses 1 VP.
 *
 * Returns the VP penalty (0 or -1).
 */
export function checkMandatoryDiscard(discardCount: number, team: Team): number {
  if (discardCount === 0) {
    return -1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 8. Air Defense / Air Attack
// ---------------------------------------------------------------------------

/**
 * Can a country use Air Defense in a battle?
 * Air Defense: if the defender has an AF in the battle space (from the same
 * country as the piece being eliminated), the AF can absorb the hit instead,
 * removing the AF but saving the Army/Navy.
 *
 * Also checks that air defense hasn't been disabled this turn (Cloud Cover).
 */
export function canUseAirDefense(
  country: Country,
  battleSpaceId: string,
  state: GameState,
  twState: TotalWarState,
  minorPower?: MinorPower
): boolean {
  if (twState.airDefenseDisabledThisTurn) return false;

  if (minorPower) {
    // Minor power: check for minor AF in battle space
    return twState.airForces.some(
      (af) => af.minorPower === minorPower && af.spaceId === battleSpaceId
    );
  }

  // Major power: check for same-country AF (non-minor) in battle space
  return twState.airForces.some(
    (af) => af.country === country && !af.minorPower && af.spaceId === battleSpaceId
  );
}

/**
 * Can a country use Air Attack in a battle?
 * Air Attack: if the attacker has a supplied AF adjacent to the battle space,
 * after eliminating the primary target, the attacker can also eliminate an
 * enemy AF in the battle space.  The attacker's AF must be supplied and in a
 * space adjacent to the battle space.
 *
 * Returns whether the attacker can use air attack to eliminate a defender's
 * AF located at defenderAFSpaceId.
 */
export function canUseAirAttack(
  attackerCountry: Country,
  battleSpaceId: string,
  defenderAFSpaceId: string,
  state: GameState,
  twState: TotalWarState
): boolean {
  if (twState.airDefenseDisabledThisTurn) return false;

  // The defender's AF must be in the battle space
  if (defenderAFSpaceId !== battleSpaceId) return false;

  // Attacker needs a supplied AF adjacent to the battle space
  const adjacentToBattle = getAdjacentSpaces(battleSpaceId);

  return twState.airForces.some(
    (af) =>
      af.country === attackerCountry &&
      !af.minorPower &&
      adjacentToBattle.includes(af.spaceId) &&
      isAirForceInSupply(af, state, twState)
  );
}

/**
 * Find the attacker's AF that can perform an air attack on a battle space.
 * Returns the first eligible AF, or undefined if none.
 */
export function getAirAttackAF(
  attackerCountry: Country,
  battleSpaceId: string,
  state: GameState,
  twState: TotalWarState
): AirForcePiece | undefined {
  const adjacentToBattle = getAdjacentSpaces(battleSpaceId);

  return twState.airForces.find(
    (af) =>
      af.country === attackerCountry &&
      !af.minorPower &&
      adjacentToBattle.includes(af.spaceId) &&
      isAirForceInSupply(af, state, twState)
  );
}

/**
 * Find the defender's AF in the battle space that can use air defense.
 * Returns the AF piece, or undefined if none.
 */
export function getAirDefenseAF(
  country: Country,
  battleSpaceId: string,
  twState: TotalWarState,
  minorPower?: MinorPower
): AirForcePiece | undefined {
  if (minorPower) {
    return twState.airForces.find(
      (af) => af.minorPower === minorPower && af.spaceId === battleSpaceId
    );
  }
  return twState.airForces.find(
    (af) => af.country === country && !af.minorPower && af.spaceId === battleSpaceId
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a country/minor power has an available (off-board) AF piece.
 */
function hasAvailableAFPiece(
  country: Country,
  twState: TotalWarState,
  minorPower?: MinorPower
): boolean {
  if (minorPower) {
    const limit = MINOR_POWER_PIECES[minorPower].airForces;
    const onBoard = twState.airForces.filter(
      (af) => af.minorPower === minorPower
    ).length;
    return onBoard < limit;
  }

  const limit = AIR_FORCE_LIMITS[country];
  const onBoard = twState.airForces.filter(
    (af) => af.country === country && !af.minorPower
  ).length;
  return onBoard < limit;
}

/**
 * Count the number of AFs currently on the board for a country or minor power.
 */
export function countAirForcesOnBoard(
  country: Country,
  twState: TotalWarState,
  minorPower?: MinorPower
): number {
  if (minorPower) {
    return twState.airForces.filter((af) => af.minorPower === minorPower).length;
  }
  return twState.airForces.filter(
    (af) => af.country === country && !af.minorPower
  ).length;
}

/**
 * Get the maximum number of AFs for a country or minor power.
 */
export function getAirForceLimit(
  country: Country,
  minorPower?: MinorPower
): number {
  if (minorPower) {
    return MINOR_POWER_PIECES[minorPower].airForces;
  }
  return AIR_FORCE_LIMITS[country];
}

/**
 * Check if a hand contains at least one Air Power card.
 */
export function hasAirPowerCard(hand: Card[]): boolean {
  return hand.some((c) => (c as unknown as TotalWarCard).type === 'AIR_POWER');
}
