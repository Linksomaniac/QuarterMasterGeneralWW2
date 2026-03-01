import {
  Country,
  Team,
  Card,
  CardType,
  CountryState,
  GamePhase,
  GameState,
  Piece,
  PendingAction,
  getTeam,
  getEnemyTeam,
  getTeamCountries,
  TURN_ORDER,
  COUNTRY_PIECES,
  COUNTRY_NAMES,
  MAX_ROUNDS,
  HAND_SIZE,
  INITIAL_DRAW,
  INITIAL_DISCARD,
  SUDDEN_VICTORY_VP,
  VP_PER_SUPPLY_SPACE_SOLE,
  VP_PER_SUPPLY_SPACE_SHARED,
  SpaceType,
  CardEffectType,
  CardEffect,
} from './types';
import {
  getSpace,
  getAdjacentSpaces,
  areAdjacentForTeam,
  getStraitStatus,
  HOME_SPACES,
  SUPPLY_SPACE_IDS,
  SPACES,
  spaceMatchesWhere,
} from './mapData';

// ---------------------------------------------------------------------------
// Piece ID generation
// ---------------------------------------------------------------------------
let pieceIdCounter = 0;
export function generatePieceId(): string {
  return `piece_${++pieceIdCounter}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// 1. shuffleDeck
// ---------------------------------------------------------------------------
export function shuffleDeck(cards: Card[]): Card[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ---------------------------------------------------------------------------
// Helper: get supply spaces for a country (incl. Canada/Szechuan markers)
// ---------------------------------------------------------------------------
function getSupplySpacesForCountry(country: Country, supplyMarkers: { canada: boolean; szechuan: boolean; scorched_earth_ukraine: boolean; truk_supply: boolean }): string[] {
  let spaces = [...SUPPLY_SPACE_IDS];
  if (country === Country.UK && supplyMarkers.canada) spaces.push('canada');
  if (country === Country.USA && supplyMarkers.szechuan) spaces.push('szechuan');
  if (supplyMarkers.scorched_earth_ukraine && getTeam(country) === Team.AXIS) {
    spaces = spaces.filter((s) => s !== 'ukraine');
  }
  if (country === Country.JAPAN && supplyMarkers.truk_supply) {
    spaces.push('central_pacific');
  }
  return spaces;
}

// ---------------------------------------------------------------------------
// Helper: rank cards for initial discard (Economic Warfare first, then dupes)
// ---------------------------------------------------------------------------
function getDiscardPriority(card: Card, hand: Card[]): number {
  const isEconomicWarfare = card.type === CardType.ECONOMIC_WARFARE ? 1 : 0;
  const dupCount = hand.filter((c) => c.name === card.name).length;
  return isEconomicWarfare * 1000 + (dupCount > 1 ? dupCount : 0);
}

// ---------------------------------------------------------------------------
// 2. initializeCountryState
// ---------------------------------------------------------------------------
export function initializeCountryState(
  country: Country,
  deck: Card[],
  isHuman: boolean,
  difficulty: 'easy' | 'medium' | 'hard',
  skipAutoDiscard?: boolean
): CountryState {
  const shuffled = shuffleDeck(deck);
  const drawn = shuffled.slice(0, INITIAL_DRAW);
  const remainingDeck = shuffled.slice(INITIAL_DRAW);

  let hand: Card[];
  let discard: Card[];

  if (skipAutoDiscard) {
    hand = drawn;
    discard = [];
  } else {
    const sortedForDiscard = [...drawn].sort((a, b) => getDiscardPriority(a, drawn) - getDiscardPriority(b, drawn));
    const toDiscard = sortedForDiscard.slice(0, INITIAL_DISCARD);
    hand = drawn.filter((c) => !toDiscard.includes(c));
    discard = [...toDiscard];
  }

  const homeSpace = HOME_SPACES[country];
  const startingArmy: Piece = {
    id: generatePieceId(),
    country,
    type: 'army',
    spaceId: homeSpace,
  };

  return {
    country,
    hand,
    deck: remainingDeck,
    discard,
    statusCards: [],
    responseCards: [],
    piecesOnBoard: [startingArmy],
    isHuman,
    aiDifficulty: difficulty,
  };
}

// ---------------------------------------------------------------------------
// 3. getAllPieces
// ---------------------------------------------------------------------------
export function getAllPieces(state: GameState): Piece[] {
  return Object.values(state.countries).flatMap((cs) => cs.piecesOnBoard);
}

// ---------------------------------------------------------------------------
// 3b. isWithinNSpaces — BFS distance check on the map graph
// ---------------------------------------------------------------------------
function isWithinNSpaces(fromId: string, toId: string, n: number): boolean {
  if (fromId === toId) return true;
  if (n <= 0) return false;
  const visited = new Set<string>([fromId]);
  let frontier = [fromId];
  for (let step = 0; step < n; step++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const adj of getAdjacentSpaces(id)) {
        if (adj === toId) return true;
        if (!visited.has(adj)) {
          visited.add(adj);
          next.push(adj);
        }
      }
    }
    frontier = next;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 4. isInSupply
// ---------------------------------------------------------------------------
export function isInSupply(piece: Piece, state: GameState): boolean {
  const country = piece.country;
  const team = getTeam(country);
  const allPieces = getAllPieces(state);

  // Navies in sea spaces are in supply if adjacent to any land space containing
  // an allied army. No BFS piece-chain back to a supply space is required —
  // the adjacent army acts as the supply anchor. This matches QMG rules and
  // fixes the bug where a navy built adjacent to a friendly army (e.g. Sea of
  // Japan next to Philippines) was incorrectly eliminated because the BFS
  // couldn't reach the sea space through piece chains.
  if (piece.type === 'navy') {
    const space = getSpace(piece.spaceId);
    if (space?.type === 'SEA') {
      return getAdjacentSpaces(piece.spaceId).some((adjId) => {
        const adjSpace = getSpace(adjId);
        if (adjSpace?.type !== 'LAND') return false;
        return allPieces.some(
          (p) => p.spaceId === adjId && p.type === 'army' && getTeam(p.country) === team
        );
      });
    }
    // Navy on a non-sea space (rare): fall through to army BFS check
  }

  // Armies (and non-sea navies): BFS from supply origins through piece chains.
  const supplySpaces = getSupplySpacesForCountry(country, state.supplyMarkers);
  const straitStatuses = getStraitStatus(allPieces.map((p) => ({ country: p.country, spaceId: p.spaceId })));
  const isAxisTeam = team === Team.AXIS;

  const countryPieces = allPieces.filter((p) => p.country === country);
  const supplyOrigins = supplySpaces.filter((spaceId) =>
    countryPieces.some((p) => p.spaceId === spaceId && p.type === 'army')
  );
  if (supplyOrigins.length === 0) return false;

  const pieceSpaces = new Set(countryPieces.map((p) => p.spaceId));
  const isAdjacent = (a: string, b: string) =>
    getAdjacentSpaces(a).includes(b) || areAdjacentForTeam(a, b, isAxisTeam, straitStatuses);

  const reached = new Set<string>(supplyOrigins);
  const queue = [...supplyOrigins];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const adj of getAdjacentSpaces(current)) {
      if (!reached.has(adj) && pieceSpaces.has(adj) && isAdjacent(current, adj)) {
        reached.add(adj);
        queue.push(adj);
      }
    }
    for (const space of SPACES) {
      if (!space.controlsStrait) continue;
      const [seaA, seaB] = space.controlsStrait.connects;
      const straitStatus = straitStatuses.find((s) => s.straitSpaceId === space.id);
      if (!straitStatus) continue;
      const open = isAxisTeam ? straitStatus.axisControlled : !straitStatus.axisControlled;
      if (!open) continue;
      const other = current === seaA ? seaB : current === seaB ? seaA : null;
      if (other && !reached.has(other) && pieceSpaces.has(other)) {
        reached.add(other);
        queue.push(other);
      }
    }
  }

  return reached.has(piece.spaceId);
}

// ---------------------------------------------------------------------------
// 4b. getValidRecruitSpaces — valid spaces for recruit effects from event cards
// ---------------------------------------------------------------------------
export function getValidRecruitSpaces(
  effect: { type: string; where?: string[]; condition?: string },
  recruitCountry: Country,
  state: GameState
): string[] {
  const pieceType = effect.type === 'RECRUIT_NAVY' ? 'navy' : 'army';
  const spaceType = pieceType === 'navy' ? SpaceType.SEA : SpaceType.LAND;
  const targetSpaces = effect.where ?? [];
  const expandedSpaces = effect.condition === 'adjacent_or_in'
    ? [...new Set(targetSpaces.flatMap((s) => [s, ...getAdjacentSpaces(s)]))]
    : targetSpaces;
  const allPcs = getAllPieces(state);
  return expandedSpaces.filter((sid) => {
    const sp = getSpace(sid);
    if (!sp || sp.type !== spaceType) return false;
    if (allPcs.some((p) => p.spaceId === sid && p.country === recruitCountry)) return false;
    if (allPcs.some((p) => p.spaceId === sid && getTeam(p.country) !== getTeam(recruitCountry))) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// 5. getValidBuildLocations
// ---------------------------------------------------------------------------
export function getValidBuildLocations(
  country: Country,
  pieceType: 'army' | 'navy',
  state: GameState
): string[] {
  const available = getAvailablePieces(country, state);
  if (pieceType === 'army' && available.armies === 0) return [];
  if (pieceType === 'navy' && available.navies === 0) return [];

  const homeSpace = HOME_SPACES[country];
  const countryPieces = state.countries[country].piecesOnBoard;
  const allPieces = getAllPieces(state);
  const enemyTeam = getEnemyTeam(country);
  const allPieceSpaceIds = new Set(countryPieces.map((p) => p.spaceId));

  const valid = new Set<string>();

  const statusGranted = new Set<string>();

  const enemyInHome = allPieces.some((p) => p.spaceId === homeSpace && getTeam(p.country) === enemyTeam);
  const ownPieceInHome = countryPieces.some((p) => p.spaceId === homeSpace);
  const homeAvailable = !enemyInHome && !ownPieceInHome;

  if (pieceType === 'army') {
    if (allPieceSpaceIds.size === 0) {
      if (homeAvailable) valid.add(homeSpace);
    } else {
      for (const spaceId of allPieceSpaceIds) {
        for (const adj of getAdjacentSpaces(spaceId)) {
          const s = getSpace(adj);
          if (s?.type !== SpaceType.LAND) continue;
          if (countryPieces.some((p) => p.spaceId === adj)) continue;
          if (allPieces.some((p) => p.spaceId === adj && getTeam(p.country) === enemyTeam)) continue;
          valid.add(adj);
        }
      }
      if (homeAvailable && !valid.has(homeSpace)) valid.add(homeSpace);
    }

    const statusCards = state.countries[country].statusCards;
    const team = getTeam(country);
    for (const card of statusCards) {
      for (const effect of card.effects) {
        if (effect.type !== 'BUILD_ARMY' || !effect.where) continue;

        if (effect.condition === 'no_adjacency_required') {
          for (const space of SPACES) {
            if (space.type !== SpaceType.LAND) continue;
            if (!spaceMatchesWhere(space.id, effect.where)) continue;
            if (countryPieces.some((p) => p.spaceId === space.id)) continue;
            if (allPieces.some((p) => p.spaceId === space.id && getTeam(p.country) === enemyTeam)) continue;
            valid.add(space.id);
            statusGranted.add(space.id);
          }
        }

        if (effect.condition === 'control_libya') {
          const controlsLibya = countryPieces.some((p) => p.spaceId === 'north_africa' && p.type === 'army');
          if (controlsLibya) {
            for (const space of SPACES) {
              if (space.type !== SpaceType.LAND) continue;
              if (!spaceMatchesWhere(space.id, effect.where)) continue;
              if (countryPieces.some((p) => p.spaceId === space.id)) continue;
              if (allPieces.some((p) => p.spaceId === space.id && getTeam(p.country) === enemyTeam)) continue;
              valid.add(space.id);
              statusGranted.add(space.id);
            }
          }
        }

        if (effect.condition === 'navy_adjacent') {
          for (const space of SPACES) {
            if (space.type !== SpaceType.LAND) continue;
            if (!spaceMatchesWhere(space.id, effect.where)) continue;
            if (countryPieces.some((p) => p.spaceId === space.id)) continue;
            if (allPieces.some((p) => p.spaceId === space.id && getTeam(p.country) === enemyTeam)) continue;
            const adjSeas = getAdjacentSpaces(space.id).filter((a) => getSpace(a)?.type === SpaceType.SEA);
            const hasNavy = adjSeas.some((sea) =>
              allPieces.some((p) => p.spaceId === sea && p.type === 'navy' && getTeam(p.country) === team)
            );
            if (hasNavy) {
              valid.add(space.id);
              statusGranted.add(space.id);
            }
          }
        }
      }
    }
  } else {
    for (const spaceId of allPieceSpaceIds) {
      for (const adj of getAdjacentSpaces(spaceId)) {
        const s = getSpace(adj);
        if (s?.type !== SpaceType.SEA) continue;
        if (countryPieces.some((p) => p.spaceId === adj)) continue;
        if (allPieces.some((p) => p.spaceId === adj && getTeam(p.country) === enemyTeam)) continue;
        valid.add(adj);
      }
    }
  }

  const straitStatuses = getStraitStatus(allPieces.map((p) => ({ country: p.country, spaceId: p.spaceId })));
  const isAxisTeam = getTeam(country) === Team.AXIS;

  if (pieceType === 'navy') {
    for (const space of SPACES) {
      if (!space.controlsStrait) continue;
      const [seaA, seaB] = space.controlsStrait.connects;
      const straitStatus = straitStatuses.find((s) => s.straitSpaceId === space.id);
      if (!straitStatus) continue;
      const open = isAxisTeam ? straitStatus.axisControlled : !straitStatus.axisControlled;
      if (!open) continue;
      for (const seaId of [seaA, seaB]) {
        const s = getSpace(seaId);
        if (s?.type !== SpaceType.SEA) continue;
        if (valid.has(seaId)) continue;
        if (countryPieces.some((p) => p.spaceId === seaId)) continue;
        if (allPieces.some((p) => p.spaceId === seaId && getTeam(p.country) === enemyTeam)) continue;
        const hasAdjacent = [seaA, seaB].some((other) => other !== seaId && allPieceSpaceIds.has(other));
        if (hasAdjacent) valid.add(seaId);
      }
    }
  }

  return Array.from(valid);
}

// ---------------------------------------------------------------------------
// 6. getValidBattleTargets
// ---------------------------------------------------------------------------
export function getValidBattleTargets(
  country: Country,
  battleType: 'land' | 'sea',
  state: GameState
): string[] {
  const pieceType = battleType === 'land' ? 'army' : 'navy';
  const spaceType = battleType === 'land' ? SpaceType.LAND : SpaceType.SEA;
  const countryPieces = state.countries[country].piecesOnBoard;
  const enemyTeam = getEnemyTeam(country);
  const allPieces = getAllPieces(state);
  const enemyPieces = allPieces.filter((p) => getTeam(p.country) === enemyTeam && p.type === pieceType);

  const pieceSpaceIds = new Set(countryPieces.map((p) => p.spaceId));

  const valid = new Set<string>();
  for (const spaceId of pieceSpaceIds) {
    for (const adj of getAdjacentSpaces(spaceId)) {
      const s = getSpace(adj);
      if (s?.type !== spaceType) continue;
      const hasEnemy = enemyPieces.some((p) => p.spaceId === adj);
      if (hasEnemy) valid.add(adj);
    }
  }

  const straitStatuses = getStraitStatus(allPieces.map((p) => ({ country: p.country, spaceId: p.spaceId })));
  const isAxisTeam = getTeam(country) === Team.AXIS;

  if (battleType === 'sea') {
    for (const ep of enemyPieces) {
      const epSpace = getSpace(ep.spaceId);
      if (epSpace?.type !== SpaceType.SEA) continue;
      for (const space of SPACES) {
        if (!space.controlsStrait) continue;
        const [seaA, seaB] = space.controlsStrait.connects;
        const straitStatus = straitStatuses.find((s) => s.straitSpaceId === space.id);
        if (!straitStatus) continue;
        const open = isAxisTeam ? straitStatus.axisControlled : !straitStatus.axisControlled;
        if (!open) continue;
        const connected = ep.spaceId === seaA ? seaB : ep.spaceId === seaB ? seaA : null;
        if (connected && pieceSpaceIds.has(connected) && !valid.has(ep.spaceId)) {
          valid.add(ep.spaceId);
        }
      }
    }
  }

  // Allow battling empty adjacent spaces when the country has status/response
  // cards that trigger on battle and provide a build or chain-battle benefit
  // (e.g. Aircraft Carriers, Blitzkrieg, Destroyer Transport, Surprise Attack).
  const cs = state.countries[country];
  const allCards = [...cs.statusCards, ...cs.responseCards];
  const hasResponseOnBattle = allCards.some((c) =>
    c.effects.some((e) =>
      (e.type === 'BUILD_AFTER_BATTLE' &&
        ((battleType === 'sea' && e.condition === 'sea_battle') ||
         (battleType === 'land' && (e.condition === 'land_battle' || e.condition === 'adjacent_to_us_navy')))) ||
      (e.type === 'BUILD_ARMY' && e.condition === 'adjacent_to_battle' && battleType === 'sea') ||
      (e.type === 'BUILD_AFTER_BATTLE' && e.where && battleType === 'land') ||
      (e.type === 'ADDITIONAL_BATTLE' && (
        (e.battleType === 'land' && battleType === 'land') ||
        (e.battleType === 'sea' && battleType === 'sea') ||
        !e.battleType
      )) ||
      (e.type === 'SEA_BATTLE' && battleType === 'sea' && c.type === CardType.RESPONSE) ||
      (e.type === 'LAND_BATTLE' && battleType === 'land' && c.type === CardType.RESPONSE)
    )
  );
  if (hasResponseOnBattle) {
    for (const spaceId of pieceSpaceIds) {
      for (const adj of getAdjacentSpaces(spaceId)) {
        const s = getSpace(adj);
        if (s?.type !== spaceType) continue;
        if (valid.has(adj)) continue;
        const friendlyHere = countryPieces.some((p) => p.spaceId === adj && p.type === pieceType);
        if (friendlyHere) continue;
        valid.add(adj);
      }
    }
    if (battleType === 'sea') {
      for (const space of SPACES) {
        if (!space.controlsStrait) continue;
        const [seaA, seaB] = space.controlsStrait.connects;
        const straitStatus = straitStatuses.find((s) => s.straitSpaceId === space.id);
        if (!straitStatus) continue;
        const open = isAxisTeam ? straitStatus.axisControlled : !straitStatus.axisControlled;
        if (!open) continue;
        for (const seaId of [seaA, seaB]) {
          if (valid.has(seaId)) continue;
          const other = seaId === seaA ? seaB : seaA;
          if (!pieceSpaceIds.has(other)) continue;
          const friendlyHere = countryPieces.some((p) => p.spaceId === seaId && p.type === 'navy');
          if (friendlyHere) continue;
          valid.add(seaId);
        }
      }
    }
  }

  return Array.from(valid);
}

// ---------------------------------------------------------------------------
// 7. removeOutOfSupplyPieces
// ---------------------------------------------------------------------------
export function removeOutOfSupplyPieces(
  country: Country,
  state: GameState
): { newState: GameState; removed: Piece[]; supplyLog: string[] } {
  const countryState = state.countries[country];
  const removed: Piece[] = [];
  const kept: Piece[] = [];
  const supplyLog: string[] = [];

  for (const piece of countryState.piecesOnBoard) {
    const spaceName = getSpace(piece.spaceId)?.name ?? piece.spaceId;
    if (isInSupply(piece, state)) {
      kept.push(piece);
      if (piece.type === 'navy') {
        const sp = getSpace(piece.spaceId);
        if (sp?.type === 'SEA') {
          const team = getTeam(country);
          const allPieces = getAllPieces(state);
          const supporter = getAdjacentSpaces(piece.spaceId)
            .map((adjId) => {
              const adjSp = getSpace(adjId);
              if (adjSp?.type !== 'LAND') return null;
              const army = allPieces.find(
                (p) => p.spaceId === adjId && p.type === 'army' && getTeam(p.country) === team
              );
              return army ? `${COUNTRY_NAMES[army.country]} army in ${adjSp.name}` : null;
            })
            .filter(Boolean);
          supplyLog.push(`Navy in ${spaceName}: in supply (supported by ${supporter.join(', ') || 'NONE'})`);
        }
      }
    } else if (isProtectedByShvernik(piece, state)) {
      kept.push(piece);
    } else {
      removed.push(piece);
      supplyLog.push(`${piece.type === 'army' ? 'Army' : 'Navy'} in ${spaceName}: REMOVED (out of supply)`);
    }
  }

  const newState: GameState = {
    ...state,
    countries: {
      ...state.countries,
      [country]: { ...countryState, piecesOnBoard: kept },
    },
  };

  return { newState, removed, supplyLog };
}

// ---------------------------------------------------------------------------
// 8. calculateVictoryPoints
// ---------------------------------------------------------------------------
export function evaluateVPCondition(
  condition: string,
  country: Country,
  state: GameState
): number {
  const enemyTeam = getEnemyTeam(country);
  const team = getTeam(country);
  const allPieces = getAllPieces(state);

  switch (condition) {
    case 'army_in_ukraine_kazakhstan_russia':
      return allPieces.filter(
        (p) => p.country === country && p.type === 'army' &&
          (p.spaceId === 'ukraine' || p.spaceId === 'kazakhstan' || p.spaceId === 'russia')
      ).length;
    case 'swedish_iron_ore': {
      let vp = 0;
      if (allPieces.some((p) => p.country === country && p.type === 'navy' && p.spaceId === 'baltic')) vp++;
      if (allPieces.some((p) => p.country === country && p.type === 'army' && p.spaceId === 'scandinavia')) vp++;
      return vp;
    }
    case 'mackenzie_king': {
      let vp = 0;
      if (allPieces.some((p) => p.country === country && p.type === 'navy' && p.spaceId === 'north_atlantic')) vp++;
      if (allPieces.some((p) => p.country === country && p.type === 'army' && p.spaceId === 'canada')) vp++;
      return vp;
    }
    case 'army_in_iwo_jima_or_philippines':
      return allPieces.some(
        (p) => p.country === country && p.type === 'army' &&
          (p.spaceId === 'iwo_jima' || p.spaceId === 'philippines')
      ) ? 1 : 0;
    case 'army_in_hawaii_pnw_nz':
      return allPieces.some(
        (p) => p.country === country && p.type === 'army' &&
          (p.spaceId === 'hawaii' || p.spaceId === 'pacific_northwest' || p.spaceId === 'new_zealand')
      ) ? 1 : 0;
    case 'army_in_indonesia_ng_sea':
      return allPieces.filter(
        (p) => p.country === country && p.type === 'army' &&
          (p.spaceId === 'indonesia' || p.spaceId === 'new_guinea' || p.spaceId === 'southeast_asia')
      ).length;
    case 'no_allied_army_hawaii':
      return allPieces.some(
        (p) => p.type === 'army' && p.spaceId === 'hawaii' && getTeam(p.country) === Team.ALLIES
      ) ? 0 : 1;
    case 'army_in_russia_or_ukraine':
      return allPieces.filter(
        (p) => p.country === country && p.type === 'army' &&
          (p.spaceId === 'russia' || p.spaceId === 'ukraine')
      ).length;
    case 'army_in_balkans':
      return allPieces.some(
        (p) => p.country === country && p.type === 'army' && p.spaceId === 'balkans'
      ) ? 1 : 0;
    case 'axis_army_in_africa_me':
      return allPieces.filter(
        (p) => getTeam(p.country) === Team.AXIS && p.type === 'army' &&
          (p.spaceId === 'north_africa' || p.spaceId === 'africa' || p.spaceId === 'middle_east')
      ).length;
    case 'italian_navy_count':
      return allPieces.filter(
        (p) => p.country === Country.ITALY && p.type === 'navy'
      ).length;
    default:
      return 0;
  }
}

export function calculateVictoryPoints(country: Country, state: GameState): number {
  const enemyTeam = getEnemyTeam(country);
  const allPieces = getAllPieces(state);
  const homeSpace = HOME_SPACES[country];

  if (allPieces.some((p) => p.spaceId === homeSpace && getTeam(p.country) === enemyTeam)) {
    return 0;
  }

  const supplySpaces = getSupplySpacesForCountry(country, state.supplyMarkers);
  let vp = 0;

  for (const spaceId of supplySpaces) {
    const countryArmies = allPieces.filter(
      (p) => p.spaceId === spaceId && p.country === country && p.type === 'army'
    );
    if (countryArmies.length === 0) continue;
    const teammateArmies = allPieces.filter(
      (p) =>
        p.spaceId === spaceId &&
        p.type === 'army' &&
        getTeam(p.country) === getTeam(country) &&
        p.country !== country
    );
    if (teammateArmies.length === 0) vp += VP_PER_SUPPLY_SPACE_SOLE;
    else vp += VP_PER_SUPPLY_SPACE_SHARED;
  }

  const statusCards = state.countries[country].statusCards;
  for (const card of statusCards) {
    for (const effect of card.effects) {
      if (effect.type === 'VP_PER_CONDITION' && effect.condition && effect.amount) {
        const count = evaluateVPCondition(effect.condition, country, state);
        vp += count * effect.amount;
      }
    }
  }

  return vp;
}

// ---------------------------------------------------------------------------
// 9. checkSuddenVictory
// ---------------------------------------------------------------------------
export function checkSuddenVictory(state: GameState): Team | null {
  const lead = state.axisVP - state.alliesVP;
  if (lead >= SUDDEN_VICTORY_VP) return Team.AXIS;
  if (lead <= -SUDDEN_VICTORY_VP) return Team.ALLIES;

  return null;
}

// ---------------------------------------------------------------------------
// 10. drawCards
// ---------------------------------------------------------------------------
export function drawCards(country: Country, state: GameState): GameState {
  const cs = state.countries[country];
  if (cs.deck.length === 0) return state;

  const needed = HAND_SIZE - cs.hand.length;
  if (needed <= 0) return state;

  const drawn = cs.deck.slice(0, needed);
  const newDeck = cs.deck.slice(needed);

  return {
    ...state,
    countries: {
      ...state.countries,
      [country]: {
        ...cs,
        hand: [...cs.hand, ...drawn],
        deck: newDeck,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 10b. executeEventCard — resolve event effects (recruit, build, eliminate, etc.)
// ---------------------------------------------------------------------------
function executeEventCard(card: Card, country: Country, state: GameState): GameState {
  let ns = state;
  const enemyTeam = getEnemyTeam(country);
  const team = getTeam(country);

  for (const effect of card.effects) {
    if (effect.type === 'SUPPLY_MARKER' && effect.marker) {
      if (effect.marker === 'canada') ns = { ...ns, supplyMarkers: { ...ns.supplyMarkers, canada: true } };
      if (effect.marker === 'szechuan') ns = { ...ns, supplyMarkers: { ...ns.supplyMarkers, szechuan: true } };
      if (effect.marker === 'scorched_earth_ukraine') ns = { ...ns, supplyMarkers: { ...ns.supplyMarkers, scorched_earth_ukraine: true } };
      if (effect.marker === 'truk_supply') ns = { ...ns, supplyMarkers: { ...ns.supplyMarkers, truk_supply: true } };
    }

    if (effect.type === 'RECRUIT_ARMY' || (effect.type === 'BUILD_ARMY' && effect.where)) {
      const buildCountry = effect.country ?? country;
      const maxCount = effect.count ?? 1;
      let built = 0;
      const targetSpaces = effect.where ?? [];
      const expandedSpaces = effect.condition === 'adjacent_or_in'
        ? [...new Set(targetSpaces.flatMap((s) => [s, ...getAdjacentSpaces(s)]))]
        : targetSpaces;
      for (const sid of expandedSpaces) {
        if (built >= maxCount) break;
        const avail = getAvailablePieces(buildCountry, ns);
        if (avail.armies <= 0) break;
        const sp = getSpace(sid);
        if (!sp || sp.type !== SpaceType.LAND) continue;
        const pieces = getAllPieces(ns);
        if (pieces.some((p) => p.spaceId === sid && p.country === buildCountry)) continue;
        if (pieces.some((p) => p.spaceId === sid && getTeam(p.country) !== getTeam(buildCountry))) continue;
        const piece: Piece = { id: generatePieceId(), country: buildCountry, type: 'army', spaceId: sid };
        ns = { ...ns, countries: { ...ns.countries, [buildCountry]: { ...ns.countries[buildCountry], piecesOnBoard: [...ns.countries[buildCountry].piecesOnBoard, piece] } } };
        ns = addLogEntry(ns, country, `${card.name}: recruited army in ${sp.name}`);
        built++;
      }
    }

    if (effect.type === 'RECRUIT_NAVY' || (effect.type === 'BUILD_NAVY' && effect.where)) {
      const buildCountry = effect.country ?? country;
      const avail = getAvailablePieces(buildCountry, ns);
      if (avail.navies <= 0) continue;
      const targetSpaces = effect.where ?? [];
      const expandedNavySpaces = effect.condition === 'adjacent_or_in'
        ? [...new Set(targetSpaces.flatMap((s) => [s, ...getAdjacentSpaces(s)]))]
        : targetSpaces;
      for (const sid of expandedNavySpaces) {
        const sp = getSpace(sid);
        if (!sp || sp.type !== SpaceType.SEA) continue;
        const pieces = getAllPieces(ns);
        if (pieces.some((p) => p.spaceId === sid && p.country === buildCountry)) continue;
        if (pieces.some((p) => p.spaceId === sid && getTeam(p.country) !== getTeam(buildCountry))) continue;
        const piece: Piece = { id: generatePieceId(), country: buildCountry, type: 'navy', spaceId: sid };
        ns = { ...ns, countries: { ...ns.countries, [buildCountry]: { ...ns.countries[buildCountry], piecesOnBoard: [...ns.countries[buildCountry].piecesOnBoard, piece] } } };
        ns = addLogEntry(ns, country, `${card.name}: built navy in ${sp.name}`);
        break;
      }
    }

    if (effect.type === 'BUILD_NAVY' && !effect.where) {
      const buildCountry = effect.country ?? country;
      const avail = getAvailablePieces(buildCountry, ns);
      if (avail.navies <= 0) continue;
      const validSpaces = getValidBuildLocations(buildCountry, 'navy', ns);
      if (validSpaces.length > 0) {
        const best = validSpaces.reduce((a, b) => {
          const sa = getSpace(a);
          const sb = getSpace(b);
          const scoreA = (sa?.isSupplySpace ? 10 : 0);
          const scoreB = (sb?.isSupplySpace ? 10 : 0);
          return scoreB > scoreA ? b : a;
        });
        const piece: Piece = { id: generatePieceId(), country: buildCountry, type: 'navy', spaceId: best };
        ns = { ...ns, countries: { ...ns.countries, [buildCountry]: { ...ns.countries[buildCountry], piecesOnBoard: [...ns.countries[buildCountry].piecesOnBoard, piece] } } };
        ns = addLogEntry(ns, country, `${card.name}: built navy in ${getSpace(best)?.name ?? best}`);
      }
    }

    if (effect.type === 'ELIMINATE_ARMY') {
      const targetTeam = effect.team ?? enemyTeam;
      const targetSpaces = effect.where ?? [];
      const maxCount = effect.count ?? 1;
      let eliminated = 0;
      const expandedSpaces = effect.condition === 'adjacent_or_in'
        ? [...new Set(targetSpaces.flatMap((s) => [s, ...getAdjacentSpaces(s)]))]
        : targetSpaces;
      for (const sid of expandedSpaces) {
        if (eliminated >= maxCount) break;
        const pieces = getAllPieces(ns);
        const target = pieces.find(
          (p) => p.spaceId === sid && p.type === 'army' && getTeam(p.country) === targetTeam
        );
        if (target) {
          const tcs = ns.countries[target.country];
          ns = { ...ns, countries: { ...ns.countries, [target.country]: { ...tcs, piecesOnBoard: tcs.piecesOnBoard.filter((p) => p.id !== target.id) } } };
          ns = addLogEntry(ns, country, `${card.name}: eliminated army in ${getSpace(sid)?.name ?? sid}`);
          eliminated++;
        }
      }
    }

    if (effect.type === 'LAND_BATTLE') {
      const maxCount = effect.count ?? 1;
      let battled = 0;
      const targets = effect.where
        ? effect.where.filter((sid) => getAllPieces(ns).some((p) => p.spaceId === sid && p.type === 'army' && getTeam(p.country) === enemyTeam))
        : getValidBattleTargets(country, 'land', ns);
      for (const sid of targets) {
        if (battled >= maxCount) break;
        const hasEnemy = getAllPieces(ns).some((p) => p.spaceId === sid && p.type === 'army' && getTeam(p.country) === enemyTeam);
        if (!hasEnemy) continue;
        ns = resolveBattleAction(sid, country, ns);
        ns = addLogEntry(ns, country, `${card.name}: battled in ${getSpace(sid)?.name ?? sid}`);
        battled++;
      }
    }

    if (effect.type === 'SEA_BATTLE') {
      const targets = effect.where
        ? effect.where.filter((sid) => getAllPieces(ns).some((p) => p.spaceId === sid && p.type === 'navy' && getTeam(p.country) === enemyTeam))
        : getValidBattleTargets(country, 'sea', ns);
      for (const sid of targets) {
        const hasEnemy = getAllPieces(ns).some((p) => p.spaceId === sid && p.type === 'navy' && getTeam(p.country) === enemyTeam);
        if (!hasEnemy) continue;
        ns = resolveBattleAction(sid, country, ns);
        ns = addLogEntry(ns, country, `${card.name}: battled in ${getSpace(sid)?.name ?? sid}`);
        break;
      }
    }

    if (effect.type === 'MOVE_PIECES') {
      const cs = ns.countries[country];
      const movedPieces: Piece[] = [];
      const pieceType = effect.pieceType;
      for (const piece of cs.piecesOnBoard) {
        if (pieceType && piece.type !== pieceType) {
          movedPieces.push(piece);
          continue;
        }
        const validSpaces = getValidBuildLocations(country, piece.type, ns);
        if (validSpaces.length > 0) {
          const best = validSpaces.reduce((a, b) => {
            const sa = getSpace(a);
            const sb = getSpace(b);
            const scoreA = (sa?.isSupplySpace ? 10 : 0) + (sa?.homeCountry ? 5 : 0);
            const scoreB = (sb?.isSupplySpace ? 10 : 0) + (sb?.homeCountry ? 5 : 0);
            return scoreB > scoreA ? b : a;
          });
          movedPieces.push({ ...piece, spaceId: best });
        } else {
          movedPieces.push(piece);
        }
      }
      ns = { ...ns, countries: { ...ns.countries, [country]: { ...cs, piecesOnBoard: movedPieces } } };
      ns = addLogEntry(ns, country, `${card.name}: reorganized forces`);
    }

    if (effect.type === 'SCORE_VP') {
      const amount = effect.amount ?? 0;
      if (effect.condition === 'pieces_outside_home') {
        const homeSpace = HOME_SPACES[country];
        const count = ns.countries[country].piecesOnBoard.filter((p) => p.spaceId !== homeSpace).length;
        const vp = count * amount;
        if (team === Team.AXIS) ns = { ...ns, axisVP: ns.axisVP + vp };
        else ns = { ...ns, alliesVP: ns.alliesVP + vp };
        ns = addLogEntry(ns, country, `${card.name}: gained ${vp} VP`);
      } else if (amount > 0) {
        if (team === Team.AXIS) ns = { ...ns, axisVP: ns.axisVP + amount };
        else ns = { ...ns, alliesVP: ns.alliesVP + amount };
        ns = addLogEntry(ns, country, `${card.name}: gained ${amount} VP`);
      }
    }

    if (effect.type === 'BUILD_ALLY_ARMY') {
      const cond = effect.condition;
      if (cond === 'uk_build_army_and_navy') {
        const uk = Country.UK;

        const buildArmy = (s: GameState): GameState => {
          const avail = getAvailablePieces(uk, s);
          if (avail.armies <= 0) return s;
          const valid = getValidBuildLocations(uk, 'army', s);
          if (valid.length === 0) return s;
          const best = valid.reduce((a, b) => ((getSpace(b)?.isSupplySpace ? 1 : 0) > (getSpace(a)?.isSupplySpace ? 1 : 0) ? b : a));
          const piece: Piece = { id: generatePieceId(), country: uk, type: 'army', spaceId: best };
          let r = { ...s, countries: { ...s.countries, [uk]: { ...s.countries[uk], piecesOnBoard: [...s.countries[uk].piecesOnBoard, piece] } } };
          r = addLogEntry(r, country, `${card.name}: UK built army in ${getSpace(best)?.name ?? best}`);
          return r;
        };

        const buildNavy = (s: GameState): GameState => {
          const avail = getAvailablePieces(uk, s);
          if (avail.navies <= 0) return s;
          const valid = getValidBuildLocations(uk, 'navy', s);
          if (valid.length === 0) return s;
          // Score each location by adjacent friendly pieces (more = better tactical position)
          const friendlySpaceIds = new Set(s.countries[uk].piecesOnBoard.map((p) => p.spaceId));
          const best = valid.reduce((a, b) => {
            const scoreA = getAdjacentSpaces(a).filter((adj) => friendlySpaceIds.has(adj)).length;
            const scoreB = getAdjacentSpaces(b).filter((adj) => friendlySpaceIds.has(adj)).length;
            return scoreB > scoreA ? b : a;
          });
          const piece: Piece = { id: generatePieceId(), country: uk, type: 'navy', spaceId: best };
          let r = { ...s, countries: { ...s.countries, [uk]: { ...s.countries[uk], piecesOnBoard: [...s.countries[uk].piecesOnBoard, piece] } } };
          r = addLogEntry(r, country, `${card.name}: UK built navy in ${getSpace(best)?.name ?? best}`);
          return r;
        };

        const armyFirstValid = getAvailablePieces(uk, ns).armies > 0 && getValidBuildLocations(uk, 'army', ns).length > 0;
        if (armyFirstValid) {
          ns = buildArmy(ns);
          ns = buildNavy(ns);
        } else {
          ns = buildNavy(ns);
          ns = buildArmy(ns);
        }
      } else if (cond === 'uk_recruit_we_na_africa') {
        const uk = Country.UK;
        const ukAvail = getAvailablePieces(uk, ns);
        if (ukAvail.armies > 0) {
          const targetSpaces = ['western_europe', 'north_africa', 'africa'];
          for (const sid of targetSpaces) {
            const pieces = getAllPieces(ns);
            if (pieces.some((p) => p.spaceId === sid && p.country === uk)) continue;
            if (pieces.some((p) => p.spaceId === sid && getTeam(p.country) !== Team.ALLIES)) continue;
            const sp = getSpace(sid);
            if (!sp || sp.type !== SpaceType.LAND) continue;
            const piece: Piece = { id: generatePieceId(), country: uk, type: 'army', spaceId: sid };
            ns = { ...ns, countries: { ...ns.countries, [uk]: { ...ns.countries[uk], piecesOnBoard: [...ns.countries[uk].piecesOnBoard, piece] } } };
            ns = addLogEntry(ns, country, `${card.name}: UK recruited army in ${sp.name}`);
            break;
          }
        }
      } else if (cond === 'soviet_build_army') {
        const ussr = Country.SOVIET_UNION;
        const ussrAvail = getAvailablePieces(ussr, ns);
        if (ussrAvail.armies > 0) {
          const valid = getValidBuildLocations(ussr, 'army', ns);
          if (valid.length > 0) {
            const best = valid.reduce((a, b) => ((getSpace(b)?.isSupplySpace ? 1 : 0) > (getSpace(a)?.isSupplySpace ? 1 : 0) ? b : a));
            const piece: Piece = { id: generatePieceId(), country: ussr, type: 'army', spaceId: best };
            ns = { ...ns, countries: { ...ns.countries, [ussr]: { ...ns.countries[ussr], piecesOnBoard: [...ns.countries[ussr].piecesOnBoard, piece] } } };
            ns = addLogEntry(ns, country, `${card.name}: Soviet Union built army in ${getSpace(best)?.name ?? best}`);
          }
        }
      } else if (cond === 'ally_play_and_draw') {
        const allyCountries = getTeamCountries(team).filter((c) => c !== country);
        for (const ally of allyCountries) {
          const acs = ns.countries[ally];
          if (acs.hand.length > 0 && acs.deck.length > 0) {
            const avail = getAvailablePieces(ally, ns);
            if (avail.armies > 0) {
              const valid = getValidBuildLocations(ally, 'army', ns);
              if (valid.length > 0) {
                const best = valid.reduce((a, b) => ((getSpace(b)?.isSupplySpace ? 1 : 0) > (getSpace(a)?.isSupplySpace ? 1 : 0) ? b : a));
                const piece: Piece = { id: generatePieceId(), country: ally, type: 'army', spaceId: best };
                ns = { ...ns, countries: { ...ns.countries, [ally]: { ...ns.countries[ally], piecesOnBoard: [...ns.countries[ally].piecesOnBoard, piece] } } };
                ns = addLogEntry(ns, country, `${card.name}: ${COUNTRY_NAMES[ally]} built army in ${getSpace(best)?.name ?? best}`);
                const newDeck = [...ns.countries[ally].deck];
                if (newDeck.length > 0) {
                  const drawn = newDeck.pop()!;
                  ns = { ...ns, countries: { ...ns.countries, [ally]: { ...ns.countries[ally], deck: newDeck, hand: [...ns.countries[ally].hand, drawn] } } };
                  ns = addLogEntry(ns, country, `${card.name}: ${COUNTRY_NAMES[ally]} drew a card`);
                }
                break;
              }
            }
          }
        }
      } else {
        const allyCountries = getTeamCountries(team).filter((c) => c !== country);
        for (const ally of allyCountries) {
          const avail = getAvailablePieces(ally, ns);
          if (avail.armies <= 0) continue;
          const validSpaces = getValidBuildLocations(ally, 'army', ns);
          if (validSpaces.length > 0) {
            const best = validSpaces.reduce((a, b) => ((getSpace(b)?.isSupplySpace ? 1 : 0) > (getSpace(a)?.isSupplySpace ? 1 : 0) ? b : a));
            const piece: Piece = { id: generatePieceId(), country: ally, type: 'army', spaceId: best };
            ns = { ...ns, countries: { ...ns.countries, [ally]: { ...ns.countries[ally], piecesOnBoard: [...ns.countries[ally].piecesOnBoard, piece] } } };
            ns = addLogEntry(ns, country, `${card.name}: ${COUNTRY_NAMES[ally]} built army in ${getSpace(best)?.name ?? best}`);
            break;
          }
        }
      }
    }

    if (effect.type === 'DISCARD_CARDS') {
      if (effect.condition === 'retrieve_from_discard') {
        // Handled via pending action in playCard
      } else if (effect.condition === 'discard_soviet_response' || effect.condition === 'discard_japanese_response') {
        const discardTarget = effect.condition === 'discard_soviet_response' ? Country.SOVIET_UNION : Country.JAPAN;
        const tcs = ns.countries[discardTarget];
        if (tcs.responseCards.length > 0) {
          const idx = Math.floor(Math.random() * tcs.responseCards.length);
          const discarded = tcs.responseCards[idx];
          ns = { ...ns, countries: { ...ns.countries, [discardTarget]: { ...tcs, responseCards: tcs.responseCards.filter((_, i) => i !== idx), discard: [...tcs.discard, discarded] } } };
          ns = addLogEntry(ns, country, `${card.name}: discarded a ${COUNTRY_NAMES[discardTarget]} Response card`);
        }
      }
    }
  }

  return ns;
}

// ---------------------------------------------------------------------------
// 10c. processEventEffects — interactive event resolution with player choice
// ---------------------------------------------------------------------------
function getEffectValidSpaces(
  effect: CardEffect,
  country: Country,
  state: GameState
): { action: 'recruit_army' | 'recruit_navy' | 'build_army' | 'build_navy' | 'land_battle' | 'sea_battle' | 'eliminate_army' | 'eliminate_navy'; spaces: string[]; effectCountry: Country; prompt: string; count: number; skippable: boolean } | null {
  const effectCountry = effect.country ?? country;
  const enemyTeam = getEnemyTeam(country);
  const allPcs = getAllPieces(state);

  if (effect.type === 'RECRUIT_ARMY' && effect.where) {
    const avail = getAvailablePieces(effectCountry, state);
    if (avail.armies <= 0) return null;
    const expanded = effect.condition === 'adjacent_or_in'
      ? [...new Set(effect.where.flatMap((s) => [s, ...getAdjacentSpaces(s)]))]
      : effect.where;
    const valid = expanded.filter((sid) => {
      const sp = getSpace(sid);
      if (!sp || sp.type !== SpaceType.LAND) return false;
      if (allPcs.some((p) => p.spaceId === sid && p.country === effectCountry)) return false;
      if (allPcs.some((p) => p.spaceId === sid && getTeam(p.country) !== getTeam(effectCountry))) return false;
      return true;
    });
    const count = effect.count ?? 1;
    return valid.length > 0 ? { action: 'recruit_army', spaces: valid, effectCountry, prompt: `Recruit army`, count, skippable: count > 1 } : null;
  }

  if (effect.type === 'RECRUIT_NAVY' && effect.where) {
    const avail = getAvailablePieces(effectCountry, state);
    if (avail.navies <= 0) return null;
    const expanded = effect.condition === 'adjacent_or_in'
      ? [...new Set(effect.where.flatMap((s) => [s, ...getAdjacentSpaces(s)]))]
      : effect.where;
    const valid = expanded.filter((sid) => {
      const sp = getSpace(sid);
      if (!sp || sp.type !== SpaceType.SEA) return false;
      if (allPcs.some((p) => p.spaceId === sid && p.country === effectCountry)) return false;
      if (allPcs.some((p) => p.spaceId === sid && getTeam(p.country) !== getTeam(effectCountry))) return false;
      return true;
    });
    return valid.length > 0 ? { action: 'recruit_navy', spaces: valid, effectCountry, prompt: `Recruit navy`, count: 1, skippable: false } : null;
  }

  if ((effect.type === 'BUILD_ARMY' || effect.type === 'BUILD_NAVY') && effect.where && !effect.condition) {
    const pieceType = effect.type === 'BUILD_ARMY' ? 'army' as const : 'navy' as const;
    const spaceType = pieceType === 'army' ? SpaceType.LAND : SpaceType.SEA;
    const avail = getAvailablePieces(effectCountry, state);
    if (pieceType === 'army' && avail.armies <= 0) return null;
    if (pieceType === 'navy' && avail.navies <= 0) return null;
    const valid = effect.where.filter((sid) => {
      const sp = getSpace(sid);
      if (!sp || sp.type !== spaceType) return false;
      if (allPcs.some((p) => p.spaceId === sid && p.country === effectCountry)) return false;
      if (allPcs.some((p) => p.spaceId === sid && getTeam(p.country) !== getTeam(effectCountry))) return false;
      return true;
    });
    const action = pieceType === 'army' ? 'build_army' as const : 'build_navy' as const;
    return valid.length > 0 ? { action, spaces: valid, effectCountry, prompt: `Build ${pieceType}`, count: 1, skippable: false } : null;
  }

  if ((effect.type === 'BUILD_ARMY' || effect.type === 'BUILD_NAVY') && effect.where && effect.condition === 'adjacent_or_in') {
    const pieceType = effect.type === 'BUILD_ARMY' ? 'army' as const : 'navy' as const;
    const spaceType = pieceType === 'army' ? SpaceType.LAND : SpaceType.SEA;
    const avail = getAvailablePieces(effectCountry, state);
    if (pieceType === 'army' && avail.armies <= 0) return null;
    if (pieceType === 'navy' && avail.navies <= 0) return null;
    const expanded = [...new Set(effect.where.flatMap((s) => [s, ...getAdjacentSpaces(s)]))];
    const valid = expanded.filter((sid) => {
      const sp = getSpace(sid);
      if (!sp || sp.type !== spaceType) return false;
      if (allPcs.some((p) => p.spaceId === sid && p.country === effectCountry)) return false;
      if (allPcs.some((p) => p.spaceId === sid && getTeam(p.country) !== getTeam(effectCountry))) return false;
      return true;
    });
    const action = pieceType === 'army' ? 'build_army' as const : 'build_navy' as const;
    return valid.length > 0 ? { action, spaces: valid, effectCountry, prompt: `Build ${pieceType}`, count: 1, skippable: false } : null;
  }

  if (effect.type === 'LAND_BATTLE' && effect.where) {
    const valid = effect.where.filter((sid) =>
      allPcs.some((p) => p.spaceId === sid && p.type === 'army' && getTeam(p.country) === enemyTeam)
    );
    const count = effect.count ?? 1;
    return valid.length > 0 ? { action: 'land_battle', spaces: valid, effectCountry: country, prompt: `Battle a land space`, count, skippable: false } : null;
  }

  // LAND_BATTLE without a where clause (e.g. Broad Front: 3 battles anywhere).
  // Route through SELECT_EVENT_SPACE so human gets to choose; AI auto-picks via
  // maybeSetOrAutoResolveEventSpace / runFullAiTurn's non-skippable battle loop.
  if (effect.type === 'LAND_BATTLE' && !effect.where && !effect.condition) {
    const valid = getValidBattleTargets(country, 'land', state);
    const count = effect.count ?? 1;
    return valid.length > 0
      ? { action: 'land_battle' as const, spaces: valid, effectCountry: country, prompt: 'Choose a land space to battle', count, skippable: false }
      : null;
  }

  if (effect.type === 'SEA_BATTLE' && effect.where) {
    const valid = effect.where.filter((sid) =>
      allPcs.some((p) => p.spaceId === sid && p.type === 'navy' && getTeam(p.country) === enemyTeam)
    );
    return valid.length > 0 ? { action: 'sea_battle', spaces: valid, effectCountry: country, prompt: `Battle a sea space`, count: 1, skippable: false } : null;
  }

  if (effect.type === 'ELIMINATE_ARMY' && effect.where) {
    const targetTeam = effect.team ?? enemyTeam;
    const expanded = effect.condition === 'adjacent_or_in'
      ? [...new Set(effect.where.flatMap((s) => [s, ...getAdjacentSpaces(s)]))]
      : effect.where;
    const valid = expanded.filter((sid) =>
      allPcs.some((p) => p.spaceId === sid && p.type === 'army' && getTeam(p.country) === targetTeam)
    );
    const count = effect.count ?? 1;
    return valid.length > 0 ? { action: 'eliminate_army', spaces: valid, effectCountry: country, prompt: `Eliminate enemy army`, count, skippable: count > 1 } : null;
  }

  return null;
}

export interface EventBuildInfo {
  triggerType: 'build_army' | 'build_navy';
  spaceId: string;
  effectCountry: Country;
  remainingEffects: CardEffect[];
  eventCardName: string;
  playingCountry: Country;
}

export function processEventEffects(
  effects: CardEffect[],
  cardName: string,
  country: Country,
  state: GameState
): { newState: GameState; pendingAction: PendingAction | null; eventBuildInfo?: EventBuildInfo } {
  let ns = state;

  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    const remainingEffects = effects.slice(i + 1);

    if (effect.countries && effect.countries.length > 1 && effect.type === 'RECRUIT_ARMY' && effect.where) {
      const allPcs = getAllPieces(ns);
      const expanded = effect.condition === 'adjacent_or_in'
        ? [...new Set(effect.where.flatMap((s) => [s, ...getAdjacentSpaces(s)]))]
        : effect.where;

      const hasValidSpace = (c: Country) => expanded.some((sid) => {
        const sp = getSpace(sid);
        if (!sp || sp.type !== SpaceType.LAND) return false;
        if (allPcs.some((p) => p.spaceId === sid && p.country === c)) return false;
        if (allPcs.some((p) => p.spaceId === sid && getTeam(p.country) !== getTeam(c))) return false;
        return true;
      });

      const validCountries = effect.countries.filter((c) => {
        const avail = getAvailablePieces(c, ns);
        const hasReserve = avail.armies > 0;
        const canRedeploy = !hasReserve && ns.countries[c].piecesOnBoard.some((p) => p.type === 'army');
        if (!hasReserve && !canRedeploy) return false;
        return hasValidSpace(c);
      });

      if (validCountries.length > 1) {
        return {
          newState: ns,
          pendingAction: {
            type: 'SELECT_RECRUIT_COUNTRY',
            validCountries,
            where: effect.where,
            eventCardName: cardName,
            remainingEffects,
            playingCountry: country,
          },
        };
      }
      if (validCountries.length === 1) {
        const chosen = validCountries[0];
        const avail = getAvailablePieces(chosen, ns);
        if (avail.armies <= 0) {
          const redeployPA = getRedeployOption(chosen, 'army', ns, {
            currentEffect: { ...effect, country: chosen, countries: undefined },
            eventCardName: cardName,
            remainingEffects,
            playingCountry: country,
          });
          if (redeployPA) return { newState: ns, pendingAction: redeployPA };
          continue;
        }
        const singleEffect = { ...effect, country: chosen, countries: undefined };
        const singleChoice = getEffectValidSpaces(singleEffect, country, ns);
        if (singleChoice && singleChoice.spaces.length >= 1) {
          const sid = singleChoice.spaces[0];
          ns = resolveEventEffectAtSpace('recruit_army', sid, chosen, country, ns, cardName);
        }
        continue;
      }
      continue;
    }

    const choice = getEffectValidSpaces(effect, country, ns);

    if (!choice && (effect.type === 'RECRUIT_ARMY' || effect.type === 'BUILD_ARMY' ||
        effect.type === 'RECRUIT_NAVY' || effect.type === 'BUILD_NAVY')) {
      const effectCountry = effect.country ?? country;
      const pieceType = (effect.type === 'RECRUIT_ARMY' || effect.type === 'BUILD_ARMY') ? 'army' as const : 'navy' as const;
      const avail = getAvailablePieces(effectCountry, ns);
      const hasReserve = pieceType === 'army' ? avail.armies > 0 : avail.navies > 0;
      if (!hasReserve) {
        const remaining = effects.slice(effects.indexOf(effect) + 1);
        const redeployPA = getRedeployOption(effectCountry, pieceType, ns, {
          currentEffect: effect,
          eventCardName: cardName,
          remainingEffects: remaining,
          playingCountry: country,
        });
        if (redeployPA) {
          return { newState: ns, pendingAction: redeployPA };
        }
      }
    }

    if (choice && choice.spaces.length > 1) {
      return {
        newState: ns,
        pendingAction: {
          type: 'SELECT_EVENT_SPACE',
          eventCardName: cardName,
          prompt: choice.prompt,
          validSpaces: choice.spaces,
          effectAction: choice.action,
          effectCountry: choice.effectCountry,
          playingCountry: country,
          remaining: choice.count,
          remainingEffects,
          skippable: choice.skippable,
        },
      };
    }

    if (choice && choice.spaces.length === 1) {
      for (let c = 0; c < choice.count; c++) {
        const stillValid = getEffectValidSpaces(effect, country, ns);
        if (!stillValid || stillValid.spaces.length === 0) break;
        const sid = stillValid.spaces[0];
        ns = resolveEventEffectAtSpace(choice.action, sid, choice.effectCountry, country, ns, cardName);

        const isBuild = choice.action === 'build_army' || choice.action === 'build_navy'
          || choice.action === 'recruit_army' || choice.action === 'recruit_navy';
        if (isBuild) {
          const triggerType = (choice.action === 'build_navy' || choice.action === 'recruit_navy')
            ? 'build_navy' as const : 'build_army' as const;
          const sameEffectRemaining = (choice.count - c - 1) > 0
            ? [{ ...effect, count: choice.count - c - 1 } as CardEffect]
            : [];
          const remaining = [...sameEffectRemaining, ...effects.slice(i + 1)];
          return {
            newState: ns,
            pendingAction: null,
            eventBuildInfo: {
              triggerType,
              spaceId: sid,
              effectCountry: choice.effectCountry,
              remainingEffects: remaining,
              eventCardName: cardName,
              playingCountry: country,
            },
          };
        }
      }
      continue;
    }

    if (effect.type === 'MOVE_PIECES') {
      const movePA = buildMovePiecesAction(country, cardName, effect.pieceType as 'army' | 'navy' | undefined, [], remainingEffects, country, ns);
      if (movePA) {
        return { newState: ns, pendingAction: movePA };
      }
      continue;
    }

    const tempCard: Card = { id: 'temp', name: cardName, country, type: CardType.EVENT, text: '', effects: [effect] };
    ns = executeEventCard(tempCard, country, ns);
  }

  return { newState: ns, pendingAction: null };
}

export function buildMovePiecesAction(
  country: Country,
  eventCardName: string,
  pieceTypeFilter: 'army' | 'navy' | undefined,
  movedPieceIds: string[],
  remainingEffects: CardEffect[],
  playingCountry: Country,
  state: GameState
): PendingAction | null {
  const cs = state.countries[country];
  const eligible = cs.piecesOnBoard
    .filter((p) => !movedPieceIds.includes(p.id) && (!pieceTypeFilter || p.type === pieceTypeFilter))
    .map((p) => ({
      pieceId: p.id,
      pieceType: p.type as 'army' | 'navy',
      spaceId: p.spaceId,
      spaceName: getSpace(p.spaceId)?.name ?? p.spaceId.replace(/_/g, ' '),
    }));

  if (eligible.length === 0) return null;

  return {
    type: 'SELECT_MOVE_PIECE',
    country,
    eventCardName,
    pieceTypeFilter,
    eligiblePieces: eligible,
    movedPieceIds,
    remainingEffects,
    playingCountry,
  };
}

export function resolveEventEffectAtSpace(
  action: string,
  spaceId: string,
  effectCountry: Country,
  playingCountry: Country,
  state: GameState,
  cardName: string
): GameState {
  let ns = state;
  const spaceName = getSpace(spaceId)?.name ?? spaceId.replace(/_/g, ' ');

  switch (action) {
    case 'recruit_army': {
      const piece: Piece = { id: generatePieceId(), country: effectCountry, type: 'army', spaceId };
      ns = { ...ns, countries: { ...ns.countries, [effectCountry]: { ...ns.countries[effectCountry], piecesOnBoard: [...ns.countries[effectCountry].piecesOnBoard, piece] } } };
      ns = addLogEntry(ns, playingCountry, `${cardName}: recruited army in ${spaceName}`);
      break;
    }
    case 'recruit_navy': {
      const piece: Piece = { id: generatePieceId(), country: effectCountry, type: 'navy', spaceId };
      ns = { ...ns, countries: { ...ns.countries, [effectCountry]: { ...ns.countries[effectCountry], piecesOnBoard: [...ns.countries[effectCountry].piecesOnBoard, piece] } } };
      ns = addLogEntry(ns, playingCountry, `${cardName}: recruited navy in ${spaceName}`);
      break;
    }
    case 'build_army': {
      const piece: Piece = { id: generatePieceId(), country: effectCountry, type: 'army', spaceId };
      ns = { ...ns, countries: { ...ns.countries, [effectCountry]: { ...ns.countries[effectCountry], piecesOnBoard: [...ns.countries[effectCountry].piecesOnBoard, piece] } } };
      ns = addLogEntry(ns, playingCountry, `${cardName}: built army in ${spaceName}`);
      break;
    }
    case 'build_navy': {
      const piece: Piece = { id: generatePieceId(), country: effectCountry, type: 'navy', spaceId };
      ns = { ...ns, countries: { ...ns.countries, [effectCountry]: { ...ns.countries[effectCountry], piecesOnBoard: [...ns.countries[effectCountry].piecesOnBoard, piece] } } };
      ns = addLogEntry(ns, playingCountry, `${cardName}: built navy in ${spaceName}`);
      break;
    }
    case 'land_battle': {
      ns = resolveBattleAction(spaceId, playingCountry, ns);
      ns = addLogEntry(ns, playingCountry, `${cardName}: battled in ${spaceName}`);
      break;
    }
    case 'sea_battle': {
      ns = resolveBattleAction(spaceId, playingCountry, ns);
      ns = addLogEntry(ns, playingCountry, `${cardName}: battled in ${spaceName}`);
      break;
    }
    case 'eliminate_army': {
      const enemyTeam = getEnemyTeam(playingCountry);
      const allPcs = getAllPieces(ns);
      const target = allPcs.find((p) => p.spaceId === spaceId && p.type === 'army' && getTeam(p.country) === enemyTeam);
      if (target) {
        const tcs = ns.countries[target.country];
        ns = { ...ns, countries: { ...ns.countries, [target.country]: { ...tcs, piecesOnBoard: tcs.piecesOnBoard.filter((p) => p.id !== target.id) } } };
        ns = addLogEntry(ns, playingCountry, `${cardName}: eliminated army in ${spaceName}`);
      }
      break;
    }
  }
  return ns;
}

// ---------------------------------------------------------------------------
// resolveRecruitCountryChoice — after player picks a country for multi-country recruit
// ---------------------------------------------------------------------------
export function resolveRecruitCountryChoice(
  chosenCountry: Country,
  where: string[],
  cardName: string,
  playingCountry: Country,
  remainingEffects: CardEffect[],
  state: GameState
): { newState: GameState; pendingAction: PendingAction | null } {
  let ns = state;

  const avail = getAvailablePieces(chosenCountry, ns);
  if (avail.armies <= 0) {
    const recruitEffect: CardEffect = { type: 'RECRUIT_ARMY', where, country: chosenCountry };
    const redeployPA = getRedeployOption(chosenCountry, 'army', ns, {
      currentEffect: recruitEffect,
      eventCardName: cardName,
      remainingEffects,
      playingCountry,
    });
    if (redeployPA) return { newState: ns, pendingAction: redeployPA };
    if (remainingEffects.length > 0) return processEventEffects(remainingEffects, cardName, playingCountry, ns);
    return { newState: ns, pendingAction: null };
  }

  const allPcs = getAllPieces(ns);
  const validSpaces = where.filter((sid) => {
    const sp = getSpace(sid);
    if (!sp || sp.type !== SpaceType.LAND) return false;
    if (allPcs.some((p) => p.spaceId === sid && p.country === chosenCountry)) return false;
    if (allPcs.some((p) => p.spaceId === sid && getTeam(p.country) !== getTeam(chosenCountry))) return false;
    return true;
  });
  if (validSpaces.length === 1) {
    ns = resolveEventEffectAtSpace('recruit_army', validSpaces[0], chosenCountry, playingCountry, ns, cardName);
  } else if (validSpaces.length > 1) {
    return {
      newState: ns,
      pendingAction: {
        type: 'SELECT_EVENT_SPACE',
        eventCardName: cardName,
        prompt: `Recruit army (${COUNTRY_NAMES[chosenCountry]})`,
        validSpaces,
        effectAction: 'recruit_army',
        effectCountry: chosenCountry,
        playingCountry,
        remaining: 1,
        remainingEffects,
        skippable: false,
      },
    };
  }
  if (remainingEffects.length > 0) {
    return processEventEffects(remainingEffects, cardName, playingCountry, ns);
  }
  return { newState: ns, pendingAction: null };
}

// ---------------------------------------------------------------------------
// 10b. getEWValidTargets — determine valid EW target countries from card + board
// ---------------------------------------------------------------------------
function getEWValidTargets(card: Card, country: Country, state: GameState): Country[] {
  const allPieces = getAllPieces(state);
  const myPieces = allPieces.filter((p) => p.country === country);
  const myArmies = myPieces.filter((p) => p.type === 'army');
  const myNavies = myPieces.filter((p) => p.type === 'navy');

  const axisHomes: [string, Country][] = [
    [HOME_SPACES[Country.GERMANY], Country.GERMANY],
    [HOME_SPACES[Country.ITALY], Country.ITALY],
    [HOME_SPACES[Country.JAPAN], Country.JAPAN],
  ];

  switch (card.id) {
    // US cards with proximity prerequisites
    case 'usa_b24_liberator':
      return myArmies.some((a) => isWithinNSpaces(a.spaceId, HOME_SPACES[Country.ITALY], 2))
        ? [Country.ITALY] : [];
    case 'usa_b29_superfortress':
      return myArmies.some((a) => isWithinNSpaces(a.spaceId, HOME_SPACES[Country.GERMANY], 3))
        ? [Country.GERMANY] : [];
    case 'usa_sdb_dauntless':
      return myNavies.some((n) => isWithinNSpaces(n.spaceId, HOME_SPACES[Country.JAPAN], 2))
        ? [Country.JAPAN] : [];
    case 'usa_b26_marauder':
      return axisHomes
        .filter(([home]) => myArmies.some((a) => isWithinNSpaces(a.spaceId, home, 3)))
        .map(([, c]) => c);
    case 'usa_firestorm_bombing':
      return axisHomes
        .filter(([home]) => {
          const adj = getAdjacentSpaces(home);
          return myPieces.some((p) => adj.includes(p.spaceId) || p.spaceId === home);
        })
        .map(([, c]) => c);

    // UK Bomber Command: explicitly Germany or Italy
    case 'uk_bomber_command':
      return [Country.GERMANY, Country.ITALY];

    // Malta Submarines: affects both Germany and Italy (not Japan)
    case 'uk_malta_submarines':
      return [Country.GERMANY, Country.ITALY];

    // All other EW cards: use the target country from card data if specified
    default: {
      const discardEffects = card.effects.filter((e) => e.type === 'DISCARD_CARDS');
      const allHaveTarget = discardEffects.length > 0 && discardEffects.every((e) => e.country);
      if (allHaveTarget) {
        return [...new Set(discardEffects.map((e) => e.country!))];
      }
      return getTeamCountries(getEnemyTeam(country));
    }
  }
}

// ---------------------------------------------------------------------------
// 10c. getCardPlayWarning — preview whether a card will have no effect
// ---------------------------------------------------------------------------
export function getCardPlayWarning(card: Card, state: GameState): string | null {
  const country = card.country;
  switch (card.type) {
    case CardType.BUILD_ARMY: {
      const avail = getAvailablePieces(country, state);
      const hasOnBoard = state.countries[country].piecesOnBoard.some((p) => p.type === 'army');
      if (avail.armies <= 0 && !hasOnBoard) return 'No armies available to build';
      if (avail.armies > 0) {
        const locs = getValidBuildLocations(country, 'army', state);
        if (locs.length === 0) return 'No valid build locations for army';
      }
      return null;
    }
    case CardType.BUILD_NAVY: {
      const avail = getAvailablePieces(country, state);
      const hasOnBoard = state.countries[country].piecesOnBoard.some((p) => p.type === 'navy');
      if (avail.navies <= 0 && !hasOnBoard) return 'No navies available to build';
      if (avail.navies > 0) {
        const locs = getValidBuildLocations(country, 'navy', state);
        if (locs.length === 0) return 'No valid build locations for navy';
      }
      return null;
    }
    case CardType.LAND_BATTLE: {
      const targets = getValidBattleTargets(country, 'land', state);
      if (targets.length === 0) return 'No valid land battle targets';
      return null;
    }
    case CardType.SEA_BATTLE: {
      const targets = getValidBattleTargets(country, 'sea', state);
      if (targets.length === 0) return 'No valid sea battle targets';
      return null;
    }
    case CardType.ECONOMIC_WARFARE: {
      const targets = getEWValidTargets(card, country, state);
      if (targets.length === 0) return 'Prerequisite not met — card will have no effect';
      return null;
    }
    case CardType.EVENT: {
      const isFlexible = card.effects.some((e) => e.condition === 'retrieve_from_discard');
      if (isFlexible && state.countries[country].discard.length === 0) {
        return 'Discard pile is empty — no card to retrieve';
      }
      return null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 11. playCard
// ---------------------------------------------------------------------------
export function playCard(
  card: Card,
  state: GameState
): { newState: GameState; pendingAction: PendingAction | null; eventBuildInfo?: EventBuildInfo } {
  const country = card.country;
  let newState: GameState = {
    ...state,
    selectedCard: card,
    countries: {
      ...state.countries,
      [country]: {
        ...state.countries[country],
        hand: state.countries[country].hand.filter((c) => c.id !== card.id),
      },
    },
  };

  switch (card.type) {
    case CardType.BUILD_ARMY: {
      const validSpaces = getValidBuildLocations(country, 'army', newState);
      if (validSpaces.length === 0) {
        const redeployPA = getRedeployOption(country, 'army', newState);
        if (redeployPA) {
          return { newState, pendingAction: redeployPA };
        }
        newState = addLogEntry(newState, country, `Played ${card.name} but no valid build location. Card discarded.`);
        newState = { ...newState, countries: { ...newState.countries, [country]: { ...newState.countries[country], discard: [...newState.countries[country].discard, card] } } };
        return { newState, pendingAction: null };
      }
      return {
        newState: { ...newState, pendingAction: { type: 'SELECT_BUILD_LOCATION', pieceType: 'army', validSpaces } },
        pendingAction: { type: 'SELECT_BUILD_LOCATION', pieceType: 'army', validSpaces },
      };
    }
    case CardType.BUILD_NAVY: {
      const validSpaces = getValidBuildLocations(country, 'navy', newState);
      if (validSpaces.length === 0) {
        const redeployPA = getRedeployOption(country, 'navy', newState);
        if (redeployPA) {
          return { newState, pendingAction: redeployPA };
        }
        newState = addLogEntry(newState, country, `Played ${card.name} but no valid build location. Card discarded.`);
        newState = { ...newState, countries: { ...newState.countries, [country]: { ...newState.countries[country], discard: [...newState.countries[country].discard, card] } } };
        return { newState, pendingAction: null };
      }
      return {
        newState: { ...newState, pendingAction: { type: 'SELECT_BUILD_LOCATION', pieceType: 'navy', validSpaces } },
        pendingAction: { type: 'SELECT_BUILD_LOCATION', pieceType: 'navy', validSpaces },
      };
    }
    case CardType.LAND_BATTLE: {
      const validTargets = getValidBattleTargets(country, 'land', newState);
      if (validTargets.length === 0) {
        newState = addLogEntry(newState, country, `Played ${card.name} but no valid battle target. Card discarded.`);
        newState = { ...newState, countries: { ...newState.countries, [country]: { ...newState.countries[country], discard: [...newState.countries[country].discard, card] } } };
        return { newState, pendingAction: null };
      }
      return {
        newState: { ...newState, pendingAction: { type: 'SELECT_BATTLE_TARGET', battleType: 'land', validTargets } },
        pendingAction: { type: 'SELECT_BATTLE_TARGET', battleType: 'land', validTargets },
      };
    }
    case CardType.SEA_BATTLE: {
      const validTargets = getValidBattleTargets(country, 'sea', newState);
      if (validTargets.length === 0) {
        newState = addLogEntry(newState, country, `Played ${card.name} but no valid battle target. Card discarded.`);
        newState = { ...newState, countries: { ...newState.countries, [country]: { ...newState.countries[country], discard: [...newState.countries[country].discard, card] } } };
        return { newState, pendingAction: null };
      }
      return {
        newState: { ...newState, pendingAction: { type: 'SELECT_BATTLE_TARGET', battleType: 'sea', validTargets } },
        pendingAction: { type: 'SELECT_BATTLE_TARGET', battleType: 'sea', validTargets },
      };
    }
    case CardType.STATUS:
      newState = {
        ...newState,
        countries: {
          ...newState.countries,
          [country]: {
            ...newState.countries[country],
            statusCards: [...newState.countries[country].statusCards, card],
          },
        },
      };
      for (const effect of card.effects) {
        if (effect.type === 'SUPPLY_MARKER' && effect.marker) {
          if (effect.marker === 'canada') newState = { ...newState, supplyMarkers: { ...newState.supplyMarkers, canada: true } };
          if (effect.marker === 'szechuan') newState = { ...newState, supplyMarkers: { ...newState.supplyMarkers, szechuan: true } };
          if (effect.marker === 'scorched_earth_ukraine') newState = { ...newState, supplyMarkers: { ...newState.supplyMarkers, scorched_earth_ukraine: true } };
          if (effect.marker === 'truk_supply') newState = { ...newState, supplyMarkers: { ...newState.supplyMarkers, truk_supply: true } };
        }
      }
      return { newState, pendingAction: null };
    case CardType.RESPONSE:
      newState = {
        ...newState,
        countries: {
          ...newState.countries,
          [country]: {
            ...newState.countries[country],
            responseCards: [...newState.countries[country].responseCards, card],
          },
        },
      };
      return { newState, pendingAction: null };
    case CardType.EVENT: {
      const isLendLease = card.effects.some((e) => e.condition === 'ally_play_and_draw');
      if (isLendLease) {
        const validTargets = [Country.UK, Country.SOVIET_UNION].filter((c) => {
          const cs = newState.countries[c];
          return cs.hand.length > 0 || cs.deck.length > 0;
        });
        if (validTargets.length > 0) {
          return {
            newState,
            pendingAction: { type: 'SELECT_LEND_LEASE_TARGET', validTargets, lendLeaseCard: card },
          };
        }
      }
      const isFlexible = card.effects.some((e) => e.condition === 'retrieve_from_discard');
      if (isFlexible) {
        const cs = newState.countries[country];
        if (cs.discard.length > 0) {
          newState = { ...newState, countries: { ...newState.countries, [country]: { ...cs, discard: [...cs.discard, card] } } };
          return {
            newState,
            pendingAction: { type: 'SELECT_FROM_DISCARD', discardCards: [...cs.discard] },
          };
        }
      }
      const isMultiChoice = card.effects.length > 1 && card.effects.every(
        (e) => ['BUILD_ARMY', 'BUILD_NAVY', 'LAND_BATTLE', 'SEA_BATTLE'].includes(e.type) && !e.where
      );
      if (isMultiChoice) {
        const available = getAvailablePieces(country, newState);
        const choices = card.effects.map((e) => {
          let label = '';
          let avail = false;
          switch (e.type) {
            case 'BUILD_ARMY':
              label = 'Build Army';
              avail = available.armies > 0 && getValidBuildLocations(country, 'army', newState).length > 0;
              break;
            case 'BUILD_NAVY':
              label = 'Build Navy';
              avail = available.navies > 0 && getValidBuildLocations(country, 'navy', newState).length > 0;
              break;
            case 'LAND_BATTLE':
              label = 'Land Battle';
              avail = getValidBattleTargets(country, 'land', newState).length > 0;
              break;
            case 'SEA_BATTLE':
              label = 'Sea Battle';
              avail = getValidBattleTargets(country, 'sea', newState).length > 0;
              break;
          }
          return { label, effectType: e.type as CardEffectType, available: avail };
        });
        return {
          newState,
          pendingAction: { type: 'SELECT_EVENT_CHOICE', eventCard: card, choices },
        };
      }
      const eventResult = processEventEffects(card.effects, card.name, country, newState);
      newState = { ...eventResult.newState, countries: { ...eventResult.newState.countries, [country]: { ...eventResult.newState.countries[country], discard: [...eventResult.newState.countries[country].discard, card] } } };
      if (eventResult.pendingAction) {
        return { newState, pendingAction: eventResult.pendingAction };
      }
      if (eventResult.eventBuildInfo) {
        return { newState, pendingAction: null, eventBuildInfo: eventResult.eventBuildInfo };
      }
      return { newState, pendingAction: null };
    }
    case CardType.ECONOMIC_WARFARE: {
      const validTargets = getEWValidTargets(card, country, newState);
      if (validTargets.length === 0) {
        newState = addLogEntry(newState, country, `${card.name}: prerequisite not met — no effect`);
        newState = { ...newState, countries: { ...newState.countries, [country]: { ...newState.countries[country], discard: [...newState.countries[country].discard, card] } } };
        return { newState, pendingAction: null };
      }
      return {
        newState,
        pendingAction: { type: 'SELECT_EW_TARGET', ewCard: card, validTargets },
      };
    }
    default:
      newState = { ...newState, countries: { ...newState.countries, [country]: { ...newState.countries[country], discard: [...newState.countries[country].discard, card] } } };
      return { newState, pendingAction: null };
  }
}

// ---------------------------------------------------------------------------
// 11b. resolveEventChoice — resolve a multi-choice event (e.g. Guns and Butter)
// Returns { newState, pendingAction } so the store can chain into build/battle flow
// ---------------------------------------------------------------------------
export function resolveEventChoice(
  chosenEffect: CardEffectType,
  eventCard: Card,
  country: Country,
  state: GameState
): { newState: GameState; pendingAction: PendingAction | null } {
  let ns = { ...state, countries: { ...state.countries, [country]: { ...state.countries[country], discard: [...state.countries[country].discard, eventCard] } } };

  switch (chosenEffect) {
    case 'BUILD_ARMY': {
      const validSpaces = getValidBuildLocations(country, 'army', ns);
      if (validSpaces.length === 0) {
        ns = addLogEntry(ns, country, `${eventCard.name}: no valid build location`);
        return { newState: ns, pendingAction: null };
      }
      return { newState: ns, pendingAction: { type: 'SELECT_BUILD_LOCATION', pieceType: 'army', validSpaces } };
    }
    case 'BUILD_NAVY': {
      const validSpaces = getValidBuildLocations(country, 'navy', ns);
      if (validSpaces.length === 0) {
        ns = addLogEntry(ns, country, `${eventCard.name}: no valid build location`);
        return { newState: ns, pendingAction: null };
      }
      return { newState: ns, pendingAction: { type: 'SELECT_BUILD_LOCATION', pieceType: 'navy', validSpaces } };
    }
    case 'LAND_BATTLE': {
      const validTargets = getValidBattleTargets(country, 'land', ns);
      if (validTargets.length === 0) {
        ns = addLogEntry(ns, country, `${eventCard.name}: no valid battle target`);
        return { newState: ns, pendingAction: null };
      }
      return { newState: ns, pendingAction: { type: 'SELECT_BATTLE_TARGET', battleType: 'land', validTargets } };
    }
    case 'SEA_BATTLE': {
      const validTargets = getValidBattleTargets(country, 'sea', ns);
      if (validTargets.length === 0) {
        ns = addLogEntry(ns, country, `${eventCard.name}: no valid battle target`);
        return { newState: ns, pendingAction: null };
      }
      return { newState: ns, pendingAction: { type: 'SELECT_BATTLE_TARGET', battleType: 'sea', validTargets } };
    }
    default:
      return { newState: ns, pendingAction: null };
  }
}

// ---------------------------------------------------------------------------
// 11c. resolveLendLease — chosen ally plays a card and draws a card
// ---------------------------------------------------------------------------
export function resolveLendLease(
  targetCountry: Country,
  playingCountry: Country,
  card: Card,
  state: GameState
): GameState {
  let ns = state;
  const cs = ns.countries[targetCountry];

  if (cs.hand.length > 0) {
    const sorted = [...cs.hand].sort((a, b) => {
      const score = (c: Card) =>
        c.type === CardType.STATUS ? 10 : c.type === CardType.EVENT ? 8 :
        c.type === CardType.RESPONSE ? 7 : c.type === CardType.BUILD_ARMY ? 5 : 3;
      return score(b) - score(a);
    });
    const toPlay = sorted[0];
    const newHand = cs.hand.filter((c) => c.id !== toPlay.id);
    // Route the played card to the correct pile based on its type
    if (toPlay.type === CardType.STATUS) {
      let updatedCountry = { ...ns.countries[targetCountry], hand: newHand, statusCards: [...ns.countries[targetCountry].statusCards, toPlay] };
      ns = { ...ns, countries: { ...ns.countries, [targetCountry]: updatedCountry } };
      // Apply any SUPPLY_MARKER effects from the status card
      for (const effect of toPlay.effects) {
        if (effect.type === 'SUPPLY_MARKER' && effect.marker) {
          if (effect.marker === 'canada') ns = { ...ns, supplyMarkers: { ...ns.supplyMarkers, canada: true } };
          if (effect.marker === 'szechuan') ns = { ...ns, supplyMarkers: { ...ns.supplyMarkers, szechuan: true } };
          if (effect.marker === 'scorched_earth_ukraine') ns = { ...ns, supplyMarkers: { ...ns.supplyMarkers, scorched_earth_ukraine: true } };
          if (effect.marker === 'truk_supply') ns = { ...ns, supplyMarkers: { ...ns.supplyMarkers, truk_supply: true } };
        }
      }
    } else if (toPlay.type === CardType.RESPONSE) {
      let updatedCountry = { ...ns.countries[targetCountry], hand: newHand, responseCards: [...ns.countries[targetCountry].responseCards, toPlay] };
      ns = { ...ns, countries: { ...ns.countries, [targetCountry]: updatedCountry } };
    } else {
      ns = { ...ns, countries: { ...ns.countries, [targetCountry]: { ...ns.countries[targetCountry], hand: newHand, discard: [...ns.countries[targetCountry].discard, toPlay] } } };
    }
    ns = addLogEntry(ns, playingCountry, `${card.name}: ${COUNTRY_NAMES[targetCountry]} played ${toPlay.name}`);
  }

  const updatedCs = ns.countries[targetCountry];
  if (updatedCs.deck.length > 0) {
    const drawn = updatedCs.deck[0];
    const newDeck = updatedCs.deck.slice(1);
    ns = { ...ns, countries: { ...ns.countries, [targetCountry]: { ...ns.countries[targetCountry], hand: [...ns.countries[targetCountry].hand, drawn], deck: newDeck } } };
    ns = addLogEntry(ns, playingCountry, `${card.name}: ${COUNTRY_NAMES[targetCountry]} drew a card`);
  }

  ns = { ...ns, countries: { ...ns.countries, [playingCountry]: { ...ns.countries[playingCountry], discard: [...ns.countries[playingCountry].discard, card] } } };
  return ns;
}

// ---------------------------------------------------------------------------
// 12. resolveBuildAction
// ---------------------------------------------------------------------------
export function resolveBuildAction(
  spaceId: string,
  pieceType: 'army' | 'navy',
  country: Country,
  state: GameState
): GameState {
  const piece: Piece = {
    id: generatePieceId(),
    country,
    type: pieceType,
    spaceId,
  };

  const cs = state.countries[country];
  const newState: GameState = {
    ...state,
    pendingAction: null,
    selectedCard: null,
    countries: {
      ...state.countries,
      [country]: {
        ...cs,
        piecesOnBoard: [...cs.piecesOnBoard, piece],
      },
    },
  };

  return addLogEntry(newState, country, `Built ${pieceType} in ${getSpace(spaceId)?.name ?? spaceId}`);
}

// ---------------------------------------------------------------------------
// 12b. resolveEWAction — apply Economic Warfare to a chosen target country
// ---------------------------------------------------------------------------
function evaluateEWScaling(cond: string, state: GameState): number {
  const allPieces = getAllPieces(state);
  const adj = (s: string) => getAdjacentSpaces(s);
  switch (cond) {
    case 'german_army_adj_north_sea':
      return allPieces.filter(
        (p) => p.country === Country.GERMANY && p.type === 'army' && adj('north_sea').includes(p.spaceId)
      ).length;
    case 'german_navy_on_board':
      return allPieces.filter((p) => p.country === Country.GERMANY && p.type === 'navy').length;
    case 'german_piece_adj_scandinavia': {
      const adjScan = ['scandinavia', ...adj('scandinavia')];
      return allPieces.filter(
        (p) => p.country === Country.GERMANY && adjScan.includes(p.spaceId)
      ).length;
    }
    case 'japanese_navy_adj_bay_bengal': {
      const adjBay = ['bay_of_bengal', ...adj('bay_of_bengal')];
      return allPieces.filter(
        (p) => p.country === Country.JAPAN && p.type === 'navy' && adjBay.includes(p.spaceId)
      ).length;
    }
    case 'japanese_navy_adj_east_pacific': {
      const adjEP = ['east_pacific', ...adj('east_pacific')];
      return allPieces.filter(
        (p) => p.country === Country.JAPAN && p.type === 'navy' && adjEP.includes(p.spaceId)
      ).length;
    }
    case 'italian_navy_on_board':
      return allPieces.filter((p) => p.country === Country.ITALY && p.type === 'navy').length;
    default:
      return 1;
  }
}

function evaluateEWBonus(cond: string, state: GameState): boolean {
  const allPieces = getAllPieces(state);
  switch (cond) {
    case 'no_allied_navy_north_sea':
      return !allPieces.some(
        (p) => p.type === 'navy' && p.spaceId === 'north_sea' && getTeam(p.country) === Team.ALLIES
      );
    case 'no_allied_navy_mediterranean':
      return !allPieces.some(
        (p) => p.type === 'navy' && p.spaceId === 'mediterranean' && getTeam(p.country) === Team.ALLIES
      );
    case 'german_army_western_europe':
      return allPieces.some(
        (p) => p.country === Country.GERMANY && p.type === 'army' && p.spaceId === 'western_europe'
      );
    default:
      return true;
  }
}

export function resolveEWAction(
  ewCard: Card,
  targetCountry: Country,
  playingCountry: Country,
  state: GameState
): GameState {
  const targetCs = state.countries[targetCountry];
  const discardEffect = ewCard.effects.find((e) => e.type === 'DISCARD_CARDS');
  const basePerUnit = discardEffect?.count ?? 2;

  const scalingCond = discardEffect?.scalingCondition;
  const scalingMultiplier = scalingCond ? evaluateEWScaling(scalingCond, state) : 1;

  const prereqCond = discardEffect?.bonusCondition;
  if (prereqCond && !discardEffect?.bonusCount && !evaluateEWBonus(prereqCond, state)) {
    let resultState: GameState = {
      ...state, pendingAction: null, selectedCard: null,
    };
    resultState = addLogEntry(resultState, playingCountry, `${ewCard.name}: prerequisite not met — no effect`);
    const cs = resultState.countries[playingCountry];
    resultState = { ...resultState, countries: { ...resultState.countries, [playingCountry]: { ...cs, discard: [...cs.discard, ewCard] } } };
    return resultState;
  }

  let bonusDiscard = 0;
  if (discardEffect?.bonusCount && discardEffect.bonusCondition) {
    if (evaluateEWBonus(discardEffect.bonusCondition, state)) {
      bonusDiscard = discardEffect.bonusCount;
    }
  }

  let ewBoost = 0;
  const attackerTeam = getTeam(playingCountry);
  const attackerCountries = getTeamCountries(attackerTeam);
  for (const ac of attackerCountries) {
    for (const sc of state.countries[ac].statusCards) {
      for (const eff of sc.effects) {
        if (eff.type === 'DISCARD_CARDS' && eff.condition === 'boost_ew' && eff.count) {
          ewBoost += eff.count;
        }
      }
    }
  }

  let ewReduction = 0;
  const targetTeam = getTeam(targetCountry);
  const defenderCountries = getTeamCountries(targetTeam);
  for (const dc of defenderCountries) {
    const dcs = state.countries[dc];
    for (const sc of [...dcs.statusCards, ...dcs.responseCards]) {
      for (const eff of sc.effects) {
        if (eff.type === 'DISCARD_CARDS' && eff.condition === 'reduce_ew_discard' && eff.count) {
          ewReduction += eff.count;
        }
      }
    }
  }

  const rawCount = (basePerUnit * scalingMultiplier) + bonusDiscard + ewBoost;
  const count = Math.max(0, rawCount - ewReduction);

  let toDiscard = count;
  let deck = [...targetCs.deck];
  let discard = [...targetCs.discard];
  let discarded = 0;

  while (toDiscard > 0 && deck.length > 0) {
    discard.push(deck.pop()!);
    toDiscard--;
    discarded++;
  }

  let vpLost = toDiscard;
  let resultState: GameState = {
    ...state,
    pendingAction: null,
    selectedCard: null,
    countries: {
      ...state.countries,
      [targetCountry]: { ...targetCs, deck, discard },
    },
  };

  if (discarded > 0) {
    resultState = addLogEntry(resultState, playingCountry, `${ewCard.name}: ${COUNTRY_NAMES[targetCountry]} discards ${discarded} from deck`);
  }
  if (vpLost > 0) {
    const enemyTeam = getTeam(targetCountry);
    if (enemyTeam === Team.AXIS) resultState = { ...resultState, axisVP: Math.max(0, resultState.axisVP - vpLost) };
    else resultState = { ...resultState, alliesVP: Math.max(0, resultState.alliesVP - vpLost) };
    resultState = addLogEntry(resultState, playingCountry, `${ewCard.name}: ${COUNTRY_NAMES[targetCountry]} deck empty — ${vpLost} VP lost`);
  }

  resultState = applyWolfPacksModifier(playingCountry, resultState);

  const vpEffect = ewCard.effects.find((e) => e.type === 'SCORE_VP');
  if (vpEffect?.amount) {
    const vpScaling = vpEffect.scalingCondition ? evaluateEWScaling(vpEffect.scalingCondition, state) : 1;
    const vpPrereq = vpEffect.bonusCondition;
    const vpGain = (vpPrereq && !evaluateEWBonus(vpPrereq, state)) ? 0 : vpEffect.amount * vpScaling;
    if (vpGain > 0) {
      const playingTeam = getTeam(playingCountry);
      if (playingTeam === Team.AXIS) resultState = { ...resultState, axisVP: resultState.axisVP + vpGain };
      else resultState = { ...resultState, alliesVP: resultState.alliesVP + vpGain };
      resultState = addLogEntry(resultState, playingCountry, `${ewCard.name}: gained ${vpGain} VP`);
    }
  }

  const cs = resultState.countries[playingCountry];
  resultState = {
    ...resultState,
    countries: {
      ...resultState.countries,
      [playingCountry]: { ...cs, discard: [...cs.discard, ewCard] },
    },
  };

  return resultState;
}

export function resolveMaltaSubmarines(
  ewCard: Card,
  playingCountry: Country,
  state: GameState
): GameState {
  let ns = state;
  for (const targetCountry of [Country.GERMANY, Country.ITALY]) {
    const pieces = ns.countries[targetCountry].piecesOnBoard;
    const medNavy = pieces.find((p) => p.type === 'navy' && p.spaceId === 'mediterranean');
    if (medNavy) {
      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [targetCountry]: {
            ...ns.countries[targetCountry],
            piecesOnBoard: ns.countries[targetCountry].piecesOnBoard.filter((p) => p.id !== medNavy.id),
          },
        },
      };
      ns = addLogEntry(ns, playingCountry, `Malta Submarines: ${COUNTRY_NAMES[targetCountry]} eliminated navy in Mediterranean`);
    } else {
      const cs = ns.countries[targetCountry];
      let deck = [...cs.deck];
      let discard = [...cs.discard];
      let discarded = 0;
      const count = 2;
      while (discarded < count && deck.length > 0) {
        discard.push(deck.pop()!);
        discarded++;
      }
      ns = { ...ns, countries: { ...ns.countries, [targetCountry]: { ...cs, deck, discard } } };
      if (discarded > 0) {
        ns = addLogEntry(ns, playingCountry, `Malta Submarines: ${COUNTRY_NAMES[targetCountry]} discards ${discarded} from deck`);
      }
    }
  }
  const cs = ns.countries[playingCountry];
  ns = { ...ns, countries: { ...ns.countries, [playingCountry]: { ...cs, discard: [...cs.discard, ewCard] } } };
  return ns;
}

// ---------------------------------------------------------------------------
// 12c. applyAtlanticWallPenalty — Atlantic Wall: attacker discards from deck
// ---------------------------------------------------------------------------
function applyAtlanticWallPenalty(
  battleSpaceId: string,
  attackingCountry: Country,
  eliminatedType: 'army' | 'navy',
  state: GameState
): GameState {
  if (eliminatedType !== 'army') return state;
  const defenderTeam = getEnemyTeam(attackingCountry);
  const defenderCountries = getTeamCountries(defenderTeam);
  for (const dc of defenderCountries) {
    for (const sc of state.countries[dc].statusCards) {
      for (const eff of sc.effects) {
        if (eff.type === 'DISCARD_CARDS' && eff.condition === 'axis_battled_western_europe' && eff.where) {
          if (!spaceMatchesWhere(battleSpaceId, eff.where)) continue;
          const discardCount = eff.count ?? 3;
          const acs = state.countries[attackingCountry];
          let deck = [...acs.deck];
          let discard = [...acs.discard];
          let discarded = 0;
          while (discarded < discardCount && deck.length > 0) {
            discard.push(deck.pop()!);
            discarded++;
          }
          if (discarded > 0) {
            state = {
              ...state,
              countries: {
                ...state.countries,
                [attackingCountry]: { ...state.countries[attackingCountry], deck, discard },
              },
            };
            state = addLogEntry(state, dc, `Atlantic Wall: ${COUNTRY_NAMES[attackingCountry]} discards ${discarded} from deck`);
          }
        }
      }
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// 13. resolveBattleAction
// ---------------------------------------------------------------------------
export function resolveBattleAction(
  spaceId: string,
  country: Country,
  state: GameState
): GameState {
  const allPieces = getAllPieces(state);
  const enemyTeam = getEnemyTeam(country);
  const spaceName = getSpace(spaceId)?.name ?? spaceId;

  const hasRemoveAll = state.countries[country].statusCards.some((c) =>
    c.effects.some((e) => e.type === 'ELIMINATE_ARMY' && e.condition === 'all_in_space')
  );

  if (hasRemoveAll) {
    const piecesToRemove = allPieces.filter(
      (p) => p.spaceId === spaceId && getTeam(p.country) === enemyTeam
    );
    if (piecesToRemove.length === 0) return state;
    let ns: GameState = { ...state, pendingAction: null, selectedCard: null };
    for (const piece of piecesToRemove) {
      const cs = ns.countries[piece.country];
      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [piece.country]: { ...cs, piecesOnBoard: cs.piecesOnBoard.filter((p) => p.id !== piece.id) },
        },
      };
    }
    return addLogEntry(ns, country, `Eliminated ALL ${piecesToRemove.length} enemy piece(s) in ${spaceName}`);
  }

  const pieceToRemove = allPieces.find((p) => p.spaceId === spaceId && getTeam(p.country) === enemyTeam);
  if (!pieceToRemove) return state;

  const targetCountry = pieceToRemove.country;
  const cs = state.countries[targetCountry];
  const newPieces = cs.piecesOnBoard.filter((p) => p.id !== pieceToRemove.id);

  let newState: GameState = {
    ...state,
    pendingAction: null,
    selectedCard: null,
    countries: {
      ...state.countries,
      [targetCountry]: { ...cs, piecesOnBoard: newPieces },
    },
  };

  newState = addLogEntry(newState, country, `Eliminated enemy ${pieceToRemove.type} in ${spaceName}`);
  newState = applyAtlanticWallPenalty(spaceId, country, pieceToRemove.type, newState);
  return newState;
}

// ---------------------------------------------------------------------------
// 13b. findProtectionResponses — check if any country can protect a piece
// ---------------------------------------------------------------------------
export function findProtectionResponses(
  battleSpaceId: string,
  eliminatedPieceCountry: Country,
  state: GameState,
  eliminatedPieceType?: 'army' | 'navy',
  eliminatedPieceId?: string
): { country: Country; card: Card }[] {
  const results: { country: Country; card: Card }[] = [];
  const defenderTeam = getTeam(eliminatedPieceCountry);
  const teamCountries = getTeamCountries(defenderTeam);

  const piece = eliminatedPieceId
    ? getAllPieces(state).find((p) => p.id === eliminatedPieceId)
    : undefined;
  const pieceType = eliminatedPieceType ?? piece?.type;

  for (const c of teamCountries) {
    const cs = state.countries[c];
    for (const card of cs.responseCards) {
      for (const effect of card.effects) {
        if (effect.type !== 'PROTECT_PIECE') continue;

        if (effect.pieceType && pieceType && effect.pieceType !== pieceType) continue;

        const spaceMatch = !effect.where ||
          effect.where.includes(battleSpaceId) ||
          effect.where.some((w) => getAdjacentSpaces(w).includes(battleSpaceId));
        if (!spaceMatch) continue;

        const teamMatch = !effect.team || effect.team === defenderTeam;
        if (!teamMatch) continue;

        if (effect.condition === 'us_or_uk_navy') {
          if (eliminatedPieceCountry !== Country.UK && eliminatedPieceCountry !== Country.USA) continue;
          if (pieceType && pieceType !== 'navy') continue;
        }
        if (effect.condition === 'supplied' && piece) {
          if (!isInSupply(piece, state)) continue;
        }

        results.push({ country: c, card });
        break;
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 13c. activateProtectionResponse — discard the used response card
// ---------------------------------------------------------------------------
export function activateProtectionResponse(
  responseCountry: Country,
  responseCardId: string,
  state: GameState
): GameState {
  const cs = state.countries[responseCountry];
  const card = cs.responseCards.find((c) => c.id === responseCardId);
  if (!card) return state;

  return {
    ...state,
    countries: {
      ...state.countries,
      [responseCountry]: {
        ...cs,
        responseCards: cs.responseCards.filter((c) => c.id !== responseCardId),
        discard: [...cs.discard, card],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 13d. findOffensiveResponses — self-triggered responses after own battle/build
// ---------------------------------------------------------------------------
export function findOffensiveResponses(
  triggerType: 'battle_land' | 'battle_sea' | 'build_army' | 'build_navy',
  triggerSpaceId: string,
  country: Country,
  state: GameState,
  excludeCardIds: string[] = []
): { card: Card; description: string }[] {
  const cs = state.countries[country];
  const results: { card: Card; description: string }[] = [];
  const spaceName = getSpace(triggerSpaceId)?.name ?? triggerSpaceId;

  const checkCard = (card: Card) => {
    if (excludeCardIds.includes(card.id)) return;
    for (const effect of card.effects) {
      if (effect.type === 'ADDITIONAL_BATTLE') {
        if (effect.handCost) {
          if (cs.hand.length < effect.handCost) continue;
        } else if (card.type === CardType.STATUS && cs.deck.length === 0) {
          continue;
        }

        const isBattleTrigger = triggerType === 'battle_land' || triggerType === 'battle_sea';
        const isBuildTrigger = triggerType === 'build_army' || triggerType === 'build_navy';

        if (isBuildTrigger && effect.condition === 'adjacent') {
          const buildTypeMatch = effect.battleType === 'land' ? triggerType === 'build_army' : triggerType === 'build_navy';
          if (!buildTypeMatch) continue;
          const adj = getAdjacentSpaces(triggerSpaceId);
          const enemyTeam = getEnemyTeam(country);
          const allPieces = getAllPieces(state);
          const targetType = effect.battleType === 'sea' ? 'navy' : 'army';
          const hasTarget = adj.some((a) => allPieces.some((p) => p.spaceId === a && getTeam(p.country) === enemyTeam && p.type === targetType));
          if (!hasTarget) continue;
          results.push({ card, description: `${card.name}: Battle a land space adjacent to ${spaceName}` });
          break;
        }

        if (!isBattleTrigger) continue;
        const battleTypeMatch =
          !effect.battleType ||
          (effect.battleType === 'land' && triggerType === 'battle_land') ||
          (effect.battleType === 'sea' && triggerType === 'battle_sea');
        if (!battleTypeMatch) continue;
        const whereMatch = !effect.where || spaceMatchesWhere(triggerSpaceId, effect.where);
        if (!whereMatch) continue;

        const enemyTeamB = getEnemyTeam(country);
        const allPiecesB = getAllPieces(state);
        const targetTypeB = effect.battleType === 'sea' ? 'navy' : 'army';
        const hasEnemySame = allPiecesB.some(
          (p) => p.spaceId === triggerSpaceId && getTeam(p.country) === enemyTeamB && p.type === targetTypeB
        );

        if (effect.condition === 'same_only') {
          if (!hasEnemySame) continue;
          results.push({ card, description: `${card.name}: Battle the same space (${spaceName}) again` });
          break;
        }

        const adjSpaces = getAdjacentSpaces(triggerSpaceId);
        const friendlySpacesB = new Set(state.countries[country].piecesOnBoard.map((p) => p.spaceId));
        const hasEnemyAdj = adjSpaces.some((a) =>
          allPiecesB.some(
            (p) => p.spaceId === a && getTeam(p.country) === enemyTeamB && p.type === targetTypeB &&
              getAdjacentSpaces(a).some((aa) => friendlySpacesB.has(aa))
          )
        );

        if (!hasEnemySame && !hasEnemyAdj) continue;
        const desc = effect.condition === 'adjacent_or_same'
          ? `${card.name}: Battle in or adjacent to ${spaceName}`
          : `${card.name}: Battle an additional piece adjacent to ${spaceName}`;
        results.push({ card, description: desc });
        break;
      }

      if (
        (effect.type === 'BUILD_ARMY' || effect.type === 'BUILD_NAVY') &&
        effect.condition === 'adjacent_to_battle'
      ) {
        const isBattleTrigger = triggerType === 'battle_land' || triggerType === 'battle_sea';
        if (!isBattleTrigger) continue;
        const pieceType = effect.type === 'BUILD_ARMY' ? 'army' : 'navy';
        const adjBuildLocs = getValidBuildLocations(country, pieceType as 'army' | 'navy', state);
        const adjTrigger = getAdjacentSpaces(triggerSpaceId);
        if (!adjBuildLocs.some((l) => adjTrigger.includes(l))) continue;
        results.push({ card, description: `${card.name}: Build ${pieceType} adjacent to ${spaceName}` });
        break;
      }

      if (effect.type === 'BUILD_ARMY' && effect.condition === 'after_build_adjacent') {
        if (triggerType !== 'build_army') continue;
        const avail = getAvailablePieces(country, state);
        if (avail.armies <= 0) continue;
        const adjArmyLocs = getValidBuildLocations(country, 'army', state);
        const adjTrigger2 = getAdjacentSpaces(triggerSpaceId);
        if (!adjArmyLocs.some((l) => adjTrigger2.includes(l))) continue;
        results.push({ card, description: `${card.name}: Build an additional army adjacent to ${spaceName}` });
        break;
      }

      if (effect.type === 'BUILD_ARMY' && effect.condition === 'after_navy_build_adjacent') {
        if (triggerType !== 'build_navy') continue;
        const avail = getAvailablePieces(country, state);
        if (avail.armies <= 0) continue;
        const adjArmyLocs2 = getValidBuildLocations(country, 'army', state);
        const adjTrigger3 = getAdjacentSpaces(triggerSpaceId);
        if (!adjArmyLocs2.some((l) => adjTrigger3.includes(l))) continue;
        results.push({ card, description: `${card.name}: Build 1-2 armies adjacent to ${spaceName}` });
        break;
      }

      if (effect.type === 'BUILD_NAVY' && effect.condition === 'after_build_adjacent') {
        if (triggerType !== 'build_navy') continue;
        const adjNavyLocs = getValidBuildLocations(country, 'navy', state);
        const adjTrigger4 = getAdjacentSpaces(triggerSpaceId);
        if (!adjNavyLocs.some((l) => adjTrigger4.includes(l))) continue;
        results.push({ card, description: `${card.name}: Build an additional navy adjacent to ${spaceName}` });
        break;
      }

      if (effect.type === 'BUILD_ARMY' && effect.condition === 'after_build_anywhere') {
        if (triggerType !== 'build_army') continue;
        const avail = getAvailablePieces(country, state);
        if (avail.armies <= 0) continue;
        if (getValidBuildLocations(country, 'army', state).length === 0) continue;
        results.push({ card, description: `${card.name}: Build an additional army anywhere` });
        break;
      }

      if (effect.type === 'BUILD_NAVY' && effect.condition === 'after_build_anywhere') {
        if (triggerType !== 'build_navy') continue;
        const avail2 = getAvailablePieces(country, state);
        if (avail2.navies <= 0) continue;
        if (getValidBuildLocations(country, 'navy', state).length === 0) continue;
        results.push({ card, description: `${card.name}: Build an additional navy anywhere` });
        break;
      }

      if (effect.type === 'BUILD_AFTER_BATTLE' && effect.condition === 'island_battle') {
        if (triggerType !== 'battle_sea') continue;
        const adjLand = getAdjacentSpaces(triggerSpaceId).filter((a) => {
          const sp = getSpace(a);
          return sp?.type === SpaceType.LAND;
        });
        if (adjLand.length === 0) continue;
        results.push({ card, description: `${card.name}: Build army on island adjacent to ${spaceName}` });
        break;
      }

      if (effect.type === 'BUILD_AFTER_BATTLE' && effect.pieceType === 'navy' && effect.condition === 'sea_battle') {
        if (triggerType !== 'battle_sea') continue;
        if (state.countries[country].deck.length === 0) continue;
        // Allow trigger even with 0 reserves if there are navies on board to redeploy
        const avail = getAvailablePieces(country, state);
        const canBuild = avail.navies > 0 || cs.piecesOnBoard.some((p) => p.type === 'navy');
        if (!canBuild) continue;
        const pieces = getAllPieces(state);
        const enemyInSpace = pieces.some((p) => p.spaceId === triggerSpaceId && getTeam(p.country) === getEnemyTeam(country));
        const friendlyNavy = cs.piecesOnBoard.some((p) => p.spaceId === triggerSpaceId && p.type === 'navy');
        if (enemyInSpace || friendlyNavy) continue;
        results.push({ card, description: `${card.name}: Discard top card and build Navy in ${spaceName}` });
        break;
      }

      if (effect.type === 'BUILD_AFTER_BATTLE' && effect.pieceType === 'army' && effect.condition === 'adjacent_to_us_navy') {
        if (triggerType !== 'battle_land') continue;
        if (state.countries[country].deck.length === 0) continue;
        // Allow trigger even with 0 reserves if there are armies on board to redeploy
        const avail = getAvailablePieces(country, state);
        const canBuild = avail.armies > 0 || cs.piecesOnBoard.some((p) => p.type === 'army');
        if (!canBuild) continue;
        const pieces = getAllPieces(state);
        const hasNavyAdj = pieces.some((p) =>
          p.country === country && p.type === 'navy' &&
          getAdjacentSpaces(triggerSpaceId).includes(p.spaceId) &&
          isInSupply(p, state)
        );
        if (!hasNavyAdj) continue;
        const enemyInSpace = pieces.some((p) => p.spaceId === triggerSpaceId && getTeam(p.country) === getEnemyTeam(country));
        const friendlyInSpace = cs.piecesOnBoard.some((p) => p.spaceId === triggerSpaceId);
        if (enemyInSpace || friendlyInSpace) continue;
        results.push({ card, description: `${card.name}: Discard top card and build Army in ${spaceName}` });
        break;
      }

      if (effect.type === 'BUILD_AFTER_BATTLE' && effect.condition === 'land_battle') {
        if (triggerType !== 'battle_land') continue;
        if (state.countries[country].deck.length === 0) continue;
        // Allow trigger even with 0 reserves if there are armies on board to redeploy
        const avail = getAvailablePieces(country, state);
        const canBuild = avail.armies > 0 || cs.piecesOnBoard.some((p) => p.type === 'army');
        if (!canBuild) continue;
        const allPieces = getAllPieces(state);
        const enemyTeam = getEnemyTeam(country);
        const enemyInSpace = allPieces.some(
          (p) => p.spaceId === triggerSpaceId && getTeam(p.country) === enemyTeam
        );
        const friendlyInSpace = cs.piecesOnBoard.some((p) => p.spaceId === triggerSpaceId);
        if (enemyInSpace || friendlyInSpace) continue;
        results.push({ card, description: `${card.name}: Discard top card and build army in ${spaceName}` });
        break;
      }

      if (effect.type === 'BUILD_AFTER_BATTLE' && effect.where && !effect.condition) {
        if (triggerType !== 'battle_land') continue;
        const whereMatch = spaceMatchesWhere(triggerSpaceId, effect.where) ||
          effect.where.some((w) => getAdjacentSpaces(w).includes(triggerSpaceId));
        if (!whereMatch) continue;
        const avail = getAvailablePieces(country, state);
        if (avail.armies <= 0) continue;
        results.push({ card, description: `${card.name}: Build army and battle in ${effect.where.join('/')}` });
        break;
      }

      if (effect.type === 'ELIMINATE_ARMY' && effect.condition === 'battle_space') {
        const isBattle = triggerType === 'battle_land' || triggerType === 'battle_sea';
        if (!isBattle) continue;
        const enemyTeam = getEnemyTeam(country);
        const remaining = getAllPieces(state).filter(
          (p) => p.spaceId === triggerSpaceId && getTeam(p.country) === enemyTeam
        );
        if (remaining.length === 0) continue;
        results.push({ card, description: `${card.name}: Eliminate additional enemy in ${spaceName}` });
        break;
      }

      if (effect.type === 'RECRUIT_ARMY') {
        if (effect.condition === 'after_italian_army_removed' || effect.condition === 'after_german_army_removed') continue;
        if (triggerType !== 'build_army') continue;
        const avail = getAvailablePieces(country, state);
        if (avail.armies <= 0) continue;
        const adj = getAdjacentSpaces(triggerSpaceId);
        const allPieces = getAllPieces(state);
        const enemyTeam = getEnemyTeam(country);
        const validAdj = adj.filter((a) => {
          const sp = getSpace(a);
          if (sp?.type !== SpaceType.LAND) return false;
          if (allPieces.some((p) => p.spaceId === a && getTeam(p.country) === enemyTeam)) return false;
          if (cs.piecesOnBoard.some((p) => p.spaceId === a)) return false;
          return true;
        });
        if (validAdj.length === 0) continue;
        results.push({ card, description: `${card.name}: Recruit additional army adjacent to ${spaceName}` });
        break;
      }

      // Fall of Singapore: triggers on land battle in Southeast Asia
      if (card.id === 'jpn_fall_of_singapore' && effect.type === 'SEA_BATTLE') {
        if (triggerType !== 'battle_land') continue;
        if (triggerSpaceId !== 'southeast_asia') continue;
        const allPieces = getAllPieces(state);
        const enemyTeam = getEnemyTeam(country);
        const hasEnemyNavySCS = allPieces.some(
          (p) => p.spaceId === 'south_china_sea' && getTeam(p.country) === enemyTeam && p.type === 'navy'
        );
        if (!hasEnemyNavySCS) continue;
        results.push({ card, description: `${card.name}: Battle South China Sea; recruit Army in Southeast Asia` });
        break;
      }

      // Surprise Attack: triggers on sea battle
      if (card.id === 'jpn_surprise_attack' && effect.type === 'SEA_BATTLE' && !effect.where) {
        if (triggerType !== 'battle_sea') continue;
        const seaTargets = getValidBattleTargets(country, 'sea', state);
        const landTargets = getValidBattleTargets(country, 'land', state);
        if (seaTargets.length === 0 && landTargets.length === 0) continue;
        results.push({ card, description: `${card.name}: Battle a sea space; then battle a land space` });
        break;
      }
    }
  };

  for (const card of cs.responseCards) checkCard(card);
  for (const card of cs.statusCards) checkCard(card);

  return results;
}

// ---------------------------------------------------------------------------
// 13e. resolveOffensiveResponse — auto-resolve the bonus effect
// ---------------------------------------------------------------------------

let _resolveIdCounter = 0;

export type ChainTrigger = {
  type: 'battle_land' | 'battle_sea' | 'build_army' | 'build_navy';
  spaceId: string;
  builtPieceId?: string;
};

export type PendingElimination = {
  pieceId: string;
  pieceCountry: Country;
  pieceType: 'army' | 'navy';
  spaceId: string;
};

export function resolveOffensiveResponse(
  card: Card,
  triggerSpaceId: string,
  country: Country,
  state: GameState
): { newState: GameState; message: string; chainTrigger?: ChainTrigger; pendingElimination?: PendingElimination; validBattleTargets?: string[]; validBuildSpaces?: string[]; buildPieceType?: 'army' | 'navy'; buildCount?: number; buildAnywhere?: boolean; needsRedeploy?: boolean; targetBuildSpaceId?: string; redeployPieceType?: 'army' | 'navy' } {
  const isStatusCard = card.type === CardType.STATUS;
  let ns = isStatusCard ? state : activateProtectionResponse(country, card.id, state);

  if (isStatusCard) {
    const hasHandCost = card.effects.some((e) => e.handCost);
    if (!hasHandCost) {
      const deck = ns.countries[country].deck;
      if (deck.length > 0) {
        const [discardedCard, ...remainingDeck] = deck;
        ns = {
          ...ns,
          countries: {
            ...ns.countries,
            [country]: {
              ...ns.countries[country],
              deck: remainingDeck,
              discard: [...ns.countries[country].discard, discardedCard],
            },
          },
        };
      }
    }
  }

  const allPieces = getAllPieces(ns);
  const enemyTeam = getEnemyTeam(country);
  const adj = getAdjacentSpaces(triggerSpaceId);

  for (const effect of card.effects) {
    if (effect.type === 'BUILD_AFTER_BATTLE' && effect.condition === 'land_battle') {
      const avail = getAvailablePieces(country, ns);
      const enemyInSpace = allPieces.some(
        (p) => p.spaceId === triggerSpaceId && getTeam(p.country) === enemyTeam
      );
      const friendlyInSpace = ns.countries[country].piecesOnBoard.some(
        (p) => p.spaceId === triggerSpaceId
      );
      if (enemyInSpace || friendlyInSpace) {
        return { newState: ns, message: `${card.name}: cannot build in ${getSpace(triggerSpaceId)?.name ?? triggerSpaceId}` };
      }
      if (avail.armies <= 0) {
        return { newState: ns, message: `${card.name}: redeploy army to ${getSpace(triggerSpaceId)?.name ?? triggerSpaceId}`, needsRedeploy: true, targetBuildSpaceId: triggerSpaceId, redeployPieceType: 'army' };
      }
      const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'army', spaceId: triggerSpaceId };
      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [country]: {
            ...ns.countries[country],
            piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece],
          },
        },
      };
      const spaceName = getSpace(triggerSpaceId)?.name ?? triggerSpaceId;
      return { newState: ns, message: `${card.name}: built army in ${spaceName}`, chainTrigger: { type: 'build_army', spaceId: triggerSpaceId, builtPieceId: piece.id } };
    }

    if (effect.type === 'BUILD_AFTER_BATTLE' && effect.pieceType === 'navy' && effect.condition === 'sea_battle') {
      const avail = getAvailablePieces(country, ns);
      const friendlyNavy = ns.countries[country].piecesOnBoard.some((p) => p.spaceId === triggerSpaceId && p.type === 'navy');
      const enemyInSpace = allPieces.some((p) => p.spaceId === triggerSpaceId && getTeam(p.country) === enemyTeam);
      if (friendlyNavy || enemyInSpace) return { newState: ns, message: `${card.name}: cannot build in ${getSpace(triggerSpaceId)?.name ?? triggerSpaceId}` };
      if (avail.navies <= 0) {
        return { newState: ns, message: `${card.name}: redeploy navy to ${getSpace(triggerSpaceId)?.name ?? triggerSpaceId}`, needsRedeploy: true, targetBuildSpaceId: triggerSpaceId, redeployPieceType: 'navy' };
      }
      const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'navy', spaceId: triggerSpaceId };
      ns = { ...ns, countries: { ...ns.countries, [country]: { ...ns.countries[country], piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] } } };
      return { newState: ns, message: `${card.name}: built navy in ${getSpace(triggerSpaceId)?.name ?? triggerSpaceId}`, chainTrigger: { type: 'build_navy', spaceId: triggerSpaceId, builtPieceId: piece.id } };
    }

    if (effect.type === 'BUILD_AFTER_BATTLE' && effect.pieceType === 'army' && effect.condition === 'adjacent_to_us_navy') {
      const avail = getAvailablePieces(country, ns);
      const enemyInSpace = allPieces.some((p) => p.spaceId === triggerSpaceId && getTeam(p.country) === enemyTeam);
      const friendlyInSpace = ns.countries[country].piecesOnBoard.some((p) => p.spaceId === triggerSpaceId);
      if (enemyInSpace || friendlyInSpace) return { newState: ns, message: `${card.name}: cannot build in ${getSpace(triggerSpaceId)?.name ?? triggerSpaceId}` };
      if (avail.armies <= 0) {
        // Signal to caller that a redeploy is needed to place the army in triggerSpaceId
        return { newState: ns, message: `${card.name}: redeploy army to ${getSpace(triggerSpaceId)?.name ?? triggerSpaceId}`, needsRedeploy: true, targetBuildSpaceId: triggerSpaceId, redeployPieceType: 'army' };
      }
      const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'army', spaceId: triggerSpaceId };
      ns = { ...ns, countries: { ...ns.countries, [country]: { ...ns.countries[country], piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] } } };
      return { newState: ns, message: `${card.name}: built army in ${getSpace(triggerSpaceId)?.name ?? triggerSpaceId}`, chainTrigger: { type: 'build_army', spaceId: triggerSpaceId, builtPieceId: piece.id } };
    }

    if (effect.type === 'ADDITIONAL_BATTLE') {
      const targetType = effect.battleType === 'sea' ? 'navy' : 'army';
      const enemyInSame = allPieces.filter(
        (p) =>
          p.spaceId === triggerSpaceId &&
          getTeam(p.country) === enemyTeam &&
          p.type === targetType
      );

      let candidates: typeof enemyInSame;
      if (effect.condition === 'same_only') {
        candidates = enemyInSame;
      } else {
        const friendlySpaces = new Set(
          ns.countries[country].piecesOnBoard.map((p) => p.spaceId)
        );
        const enemyInAdj = allPieces.filter(
          (p) =>
            adj.includes(p.spaceId) &&
            getTeam(p.country) === enemyTeam &&
            p.type === targetType &&
            getAdjacentSpaces(p.spaceId).some((a) => friendlySpaces.has(a))
        );
        candidates = effect.condition === 'adjacent_or_same'
          ? [...enemyInSame, ...enemyInAdj]
          : enemyInAdj;
      }

      if (candidates.length === 0) {
        return { newState: ns, message: `${card.name}: no valid target for additional battle` };
      }

      const uniqueSpaces = [...new Set(candidates.map((c) => c.spaceId))];
      if (uniqueSpaces.length > 1) {
        return {
          newState: ns,
          message: `${card.name}: choose battle target`,
          validBattleTargets: uniqueSpaces,
        };
      }

      const target = candidates[0];
      const spaceName = getSpace(target.spaceId)?.name ?? target.spaceId;
      const battleChain: ChainTrigger = {
        type: effect.battleType === 'sea' ? 'battle_sea' : 'battle_land',
        spaceId: target.spaceId,
      };
      return {
        newState: ns,
        message: `${card.name}: battling enemy ${target.type} in ${spaceName}`,
        chainTrigger: battleChain,
        pendingElimination: {
          pieceId: target.id,
          pieceCountry: target.country,
          pieceType: target.type,
          spaceId: target.spaceId,
        },
      };
    }

    if (
      (effect.type === 'BUILD_ARMY' && effect.condition === 'adjacent_to_battle') ||
      (effect.type === 'BUILD_ARMY' && effect.condition === 'after_build_adjacent')
    ) {
      const avail = getAvailablePieces(country, ns);
      if (avail.armies <= 0) {
        return { newState: ns, message: `${card.name}: no armies available to build` };
      }
      const validBuildLocs = new Set(getValidBuildLocations(country, 'army', ns));
      const validAdj = adj.filter((a) => validBuildLocs.has(a));
      if (validAdj.length > 1) {
        return { newState: ns, message: `${card.name}: choose where to build army`, validBuildSpaces: validAdj, buildPieceType: 'army', buildCount: 1 };
      }
      if (validAdj.length === 1) {
        const best = validAdj[0];
        const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'army', spaceId: best };
        ns = { ...ns, countries: { ...ns.countries, [country]: { ...ns.countries[country], piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] } } };
        return { newState: ns, message: `${card.name}: built army in ${getSpace(best)?.name ?? best}`, chainTrigger: { type: 'build_army', spaceId: best, builtPieceId: piece.id } };
      }
      return { newState: ns, message: `${card.name}: no valid location to build army` };
    }

    if (effect.type === 'BUILD_ARMY' && effect.condition === 'after_navy_build_adjacent') {
      const localAvail = getAvailablePieces(country, ns);
      if (localAvail.armies <= 0) return { newState: ns, message: `${card.name}: no armies available` };
      const maxCount = effect.count ?? 1;
      const freshBuildLocs = new Set(getValidBuildLocations(country, 'army', ns));
      const validLandAdj = adj.filter((a) => freshBuildLocs.has(a));
      if (validLandAdj.length > 1) {
        return { newState: ns, message: `${card.name}: choose where to build army`, validBuildSpaces: validLandAdj, buildPieceType: 'army', buildCount: Math.min(maxCount, localAvail.armies) };
      }
      if (validLandAdj.length === 1) {
        let placed = 0;
        let localNs = ns;
        for (let i = 0; i < maxCount; i++) {
          const av = getAvailablePieces(country, localNs);
          if (av.armies <= 0) break;
          const fl = new Set(getValidBuildLocations(country, 'army', localNs));
          const vl = adj.filter((a) => fl.has(a));
          if (vl.length === 0) break;
          const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}_${i}`, country, type: 'army', spaceId: vl[0] };
          localNs = { ...localNs, countries: { ...localNs.countries, [country]: { ...localNs.countries[country], piecesOnBoard: [...localNs.countries[country].piecesOnBoard, piece] } } };
          placed++;
        }
        if (placed > 0) {
          return { newState: localNs, message: `${card.name}: built ${placed} army(ies) adjacent to ${getSpace(triggerSpaceId)?.name ?? triggerSpaceId}`, chainTrigger: { type: 'build_army', spaceId: triggerSpaceId } };
        }
      }
      return { newState: ns, message: `${card.name}: no valid location to build army` };
    }

    if (effect.type === 'BUILD_NAVY' && effect.condition === 'after_build_adjacent') {
      const avail = getAvailablePieces(country, ns);
      if (avail.navies <= 0) {
        return { newState: ns, message: `${card.name}: no navies available to build` };
      }
      const validNavyBuildLocs = new Set(getValidBuildLocations(country, 'navy', ns));
      const validAdj = adj.filter((a) => validNavyBuildLocs.has(a));
      if (validAdj.length > 1) {
        return { newState: ns, message: `${card.name}: choose where to build navy`, validBuildSpaces: validAdj, buildPieceType: 'navy', buildCount: 1 };
      }
      if (validAdj.length === 1) {
        const best = validAdj[0];
        const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'navy', spaceId: best };
        ns = { ...ns, countries: { ...ns.countries, [country]: { ...ns.countries[country], piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] } } };
        return { newState: ns, message: `${card.name}: built navy in ${getSpace(best)?.name ?? best}`, chainTrigger: { type: 'build_navy', spaceId: best, builtPieceId: piece.id } };
      }
      return { newState: ns, message: `${card.name}: no valid location to build navy` };
    }

    if (effect.type === 'BUILD_ARMY' && effect.condition === 'after_build_anywhere') {
      const avail = getAvailablePieces(country, ns);
      if (avail.armies <= 0) {
        return { newState: ns, message: `${card.name}: no armies available to build` };
      }
      const allArmyLocs = getValidBuildLocations(country, 'army', ns);
      if (allArmyLocs.length > 1) {
        return { newState: ns, message: `${card.name}: choose where to build army`, validBuildSpaces: allArmyLocs, buildPieceType: 'army', buildCount: 1 };
      }
      if (allArmyLocs.length === 1) {
        const best = allArmyLocs[0];
        const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'army', spaceId: best };
        ns = { ...ns, countries: { ...ns.countries, [country]: { ...ns.countries[country], piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] } } };
        return { newState: ns, message: `${card.name}: built army in ${getSpace(best)?.name ?? best}`, chainTrigger: { type: 'build_army', spaceId: best, builtPieceId: piece.id } };
      }
      return { newState: ns, message: `${card.name}: no valid location to build army` };
    }

    if (effect.type === 'BUILD_NAVY' && effect.condition === 'after_build_anywhere') {
      const avail = getAvailablePieces(country, ns);
      if (avail.navies <= 0) {
        return { newState: ns, message: `${card.name}: no navies available to build` };
      }
      const allNavyLocs = getValidBuildLocations(country, 'navy', ns);
      if (allNavyLocs.length > 1) {
        return { newState: ns, message: `${card.name}: choose where to build navy`, validBuildSpaces: allNavyLocs, buildPieceType: 'navy', buildCount: 1 };
      }
      if (allNavyLocs.length === 1) {
        const best = allNavyLocs[0];
        const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'navy', spaceId: best };
        ns = { ...ns, countries: { ...ns.countries, [country]: { ...ns.countries[country], piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] } } };
        return { newState: ns, message: `${card.name}: built navy in ${getSpace(best)?.name ?? best}`, chainTrigger: { type: 'build_navy', spaceId: best, builtPieceId: piece.id } };
      }
      return { newState: ns, message: `${card.name}: no valid location to build navy` };
    }

    if (effect.type === 'BUILD_AFTER_BATTLE' && effect.condition === 'island_battle') {
      const avail = getAvailablePieces(country, ns);
      if (avail.armies <= 0) {
        return { newState: ns, message: `${card.name}: no armies available to build` };
      }
      const islands = adj.filter((a) => {
        const sp = getSpace(a);
        if (sp?.type !== SpaceType.LAND) return false;
        if (allPieces.some((p) => p.spaceId === a && getTeam(p.country) === enemyTeam)) return false;
        if (ns.countries[country].piecesOnBoard.some((p) => p.spaceId === a)) return false;
        return true;
      });
      if (islands.length > 1) {
        return { newState: ns, message: `${card.name}: choose where to build army`, validBuildSpaces: islands, buildPieceType: 'army', buildCount: 1 };
      }
      if (islands.length === 1) {
        const best = islands[0];
        const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'army', spaceId: best };
        ns = { ...ns, countries: { ...ns.countries, [country]: { ...ns.countries[country], piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] } } };
        return { newState: ns, message: `${card.name}: built army on ${getSpace(best)?.name ?? best}`, chainTrigger: { type: 'build_army', spaceId: best, builtPieceId: piece.id } };
      }
      return { newState: ns, message: `${card.name}: no valid island to build on` };
    }

    if (effect.type === 'BUILD_AFTER_BATTLE' && effect.where && !effect.condition) {
      const avail = getAvailablePieces(country, ns);
      if (avail.armies <= 0) return { newState: ns, message: `${card.name}: no armies available` };
      const buildSpace = triggerSpaceId;
      const enemyInBuild = allPieces.some((p) => p.spaceId === buildSpace && getTeam(p.country) === enemyTeam);
      const friendlyInBuild = ns.countries[country].piecesOnBoard.some((p) => p.spaceId === buildSpace);
      if (!enemyInBuild && !friendlyInBuild) {
        const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'army', spaceId: buildSpace };
        ns = { ...ns, countries: { ...ns.countries, [country]: { ...ns.countries[country], piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] } } };
        ns = addLogEntry(ns, country, `${card.name}: built army in ${getSpace(buildSpace)?.name ?? buildSpace}`);
      }
      const battleTargets = getValidBattleTargets(country, 'land', ns);
      const whereSpaces = effect.where ?? [];
      const filtered = battleTargets.filter((t) =>
        spaceMatchesWhere(t, whereSpaces) || whereSpaces.some((w) => getAdjacentSpaces(w).includes(t))
      );
      if (filtered.length > 1) {
        // Multiple targets: let processOffensiveResult handle human choice or AI scoring
        return { newState: ns, message: `${card.name}: choose a land space to battle`, validBattleTargets: filtered };
      }
      if (filtered.length === 1) {
        const target = filtered[0];
        // Filter by army type since this is a land battle (enemy pieces here should all be armies)
        const targetPieces = getAllPieces(ns).filter(
          (p) => p.spaceId === target && getTeam(p.country) === enemyTeam && p.type === 'army'
        );
        if (targetPieces.length > 0) {
          // Pick the army with the highest own-country score (most valuable to eliminate)
          const elim = targetPieces[0];
          return {
            newState: ns,
            message: `${card.name}: battling in ${getSpace(target)?.name ?? target}`,
            chainTrigger: { type: 'battle_land', spaceId: target },
            pendingElimination: { pieceId: elim.id, pieceCountry: elim.country, pieceType: elim.type, spaceId: elim.spaceId },
          };
        }
      }
      return { newState: ns, message: `${card.name}: built army, no valid battle target` };
    }

    if (effect.type === 'ELIMINATE_ARMY' && effect.condition === 'battle_space') {
      const remaining = getAllPieces(ns).filter(
        (p) => p.spaceId === triggerSpaceId && getTeam(p.country) === enemyTeam
      );
      if (remaining.length > 0) {
        const target = remaining[0];
        const targetCs = ns.countries[target.country];
        ns = {
          ...ns,
          countries: {
            ...ns.countries,
            [target.country]: {
              ...targetCs,
              piecesOnBoard: targetCs.piecesOnBoard.filter((p) => p.id !== target.id),
            },
          },
        };
        const sn = getSpace(target.spaceId)?.name ?? target.spaceId;
        return { newState: ns, message: `${card.name}: eliminated enemy ${target.type} in ${sn}` };
      }
      return { newState: ns, message: `${card.name}: no valid target` };
    }

    if (effect.type === 'RECRUIT_ARMY') {
      const avail = getAvailablePieces(country, ns);
      if (avail.armies <= 0) {
        return { newState: ns, message: `${card.name}: no armies available` };
      }
      const validAdj = adj.filter((a) => {
        const sp = getSpace(a);
        if (sp?.type !== SpaceType.LAND) return false;
        if (getAllPieces(ns).some((p) => p.spaceId === a && getTeam(p.country) === enemyTeam)) return false;
        if (ns.countries[country].piecesOnBoard.some((p) => p.spaceId === a)) return false;
        return true;
      });
      if (validAdj.length > 0) {
        const best = validAdj.reduce((a, b) => {
          const sa = getSpace(a);
          const sb = getSpace(b);
          const scoreA = (sa?.isSupplySpace ? 10 : 0) + (sa?.homeCountry ? 5 : 0);
          const scoreB = (sb?.isSupplySpace ? 10 : 0) + (sb?.homeCountry ? 5 : 0);
          return scoreB > scoreA ? b : a;
        });
        const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'army', spaceId: best };
        ns = {
          ...ns,
          countries: {
            ...ns.countries,
            [country]: {
              ...ns.countries[country],
              piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece],
            },
          },
        };
        return { newState: ns, message: `${card.name}: recruited army in ${getSpace(best)?.name ?? best}`, chainTrigger: { type: 'build_army', spaceId: best, builtPieceId: piece.id } };
      }
      return { newState: ns, message: `${card.name}: no valid location to recruit` };
    }

    // Fall of Singapore: battle South China Sea, then recruit in Southeast Asia
    if (card.id === 'jpn_fall_of_singapore' && effect.type === 'SEA_BATTLE') {
      const freshPieces = getAllPieces(ns);
      const enemyNavy = freshPieces.find(
        (p) => p.spaceId === 'south_china_sea' && getTeam(p.country) === enemyTeam && p.type === 'navy'
      );
      if (enemyNavy) {
        ns = addLogEntry(ns, country, `${card.name}: battling enemy navy in South China Sea`);
        const tc = ns.countries[enemyNavy.country];
        ns = { ...ns, countries: { ...ns.countries, [enemyNavy.country]: { ...tc, piecesOnBoard: tc.piecesOnBoard.filter((p) => p.id !== enemyNavy.id) } } };
      }
      const avail = getAvailablePieces(country, ns);
      if (avail.armies > 0) {
        const seaPieces = getAllPieces(ns);
        const enemyInSEA = seaPieces.some((p) => p.spaceId === 'southeast_asia' && getTeam(p.country) === enemyTeam);
        const ownInSEA = ns.countries[country].piecesOnBoard.some((p) => p.spaceId === 'southeast_asia' && p.type === 'army');
        if (!enemyInSEA && !ownInSEA) {
          const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'army', spaceId: 'southeast_asia' };
          ns = { ...ns, countries: { ...ns.countries, [country]: { ...ns.countries[country], piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] } } };
          ns = addLogEntry(ns, country, `${card.name}: recruited army in Southeast Asia`);
        }
      }
      return { newState: ns, message: `${card.name}: resolved`, chainTrigger: enemyNavy ? { type: 'battle_sea', spaceId: 'south_china_sea' } : undefined };
    }

    // Surprise Attack: battle sea space, then battle land space
    if (card.id === 'jpn_surprise_attack' && effect.type === 'SEA_BATTLE' && !effect.where) {
      const seaTargets = getValidBattleTargets(country, 'sea', ns);
      const seaPiecesAll = getAllPieces(ns);
      const seaWithEnemy = seaTargets.filter((sid) =>
        seaPiecesAll.some((p) => p.spaceId === sid && getTeam(p.country) === enemyTeam && p.type === 'navy')
      );
      const seaTarget = seaWithEnemy.length > 0
        ? seaWithEnemy.reduce((best, cur) => {
            const bs = getSpace(best);
            const cs2 = getSpace(cur);
            return ((cs2?.isSupplySpace ? 10 : 0) + (cs2?.homeCountry ? 5 : 0)) >
                   ((bs?.isSupplySpace ? 10 : 0) + (bs?.homeCountry ? 5 : 0)) ? cur : best;
          })
        : null;
      if (seaTarget) {
        const seaVictim = seaPiecesAll.find(
          (p) => p.spaceId === seaTarget && getTeam(p.country) === enemyTeam && p.type === 'navy'
        );
        if (seaVictim) {
          ns = addLogEntry(ns, country, `${card.name}: battling enemy navy in ${getSpace(seaTarget)?.name ?? seaTarget}`);
          const tc = ns.countries[seaVictim.country];
          ns = { ...ns, countries: { ...ns.countries, [seaVictim.country]: { ...tc, piecesOnBoard: tc.piecesOnBoard.filter((p) => p.id !== seaVictim.id) } } };
        }
      }
      const landTargets = getValidBattleTargets(country, 'land', ns);
      const landPiecesAll = getAllPieces(ns);
      const landWithEnemy = landTargets.filter((sid) =>
        landPiecesAll.some((p) => p.spaceId === sid && getTeam(p.country) === enemyTeam && p.type === 'army')
      );
      if (landWithEnemy.length > 0) {
        const landTarget = landWithEnemy.reduce((best, cur) => {
          const bs = getSpace(best);
          const cs2 = getSpace(cur);
          return ((cs2?.isSupplySpace ? 10 : 0) + (cs2?.homeCountry ? 5 : 0)) >
                 ((bs?.isSupplySpace ? 10 : 0) + (bs?.homeCountry ? 5 : 0)) ? cur : best;
        });
        const landVictim = landPiecesAll.find(
          (p) => p.spaceId === landTarget && getTeam(p.country) === enemyTeam && p.type === 'army'
        );
        if (landVictim) {
          return {
            newState: ns,
            message: `${card.name}: battling enemy army in ${getSpace(landTarget)?.name ?? landTarget}`,
            chainTrigger: { type: 'battle_land', spaceId: landTarget },
            pendingElimination: { pieceId: landVictim.id, pieceCountry: landVictim.country, pieceType: landVictim.type, spaceId: landVictim.spaceId },
          };
        }
      }
      return { newState: ns, message: `${card.name}: resolved` };
    }
  }

  return { newState: ns, message: `${card.name} activated` };
}

// ---------------------------------------------------------------------------
// 14. advanceTurn
// ---------------------------------------------------------------------------
export function advanceTurn(state: GameState): GameState {
  let nextIndex = state.currentCountryIndex + 1;
  let nextRound = state.round;

  if (nextIndex >= TURN_ORDER.length) {
    nextIndex = 0;
    nextRound = state.round + 1;
  }

  if (nextRound > MAX_ROUNDS) {
    return {
      ...state,
      phase: GamePhase.GAME_OVER,
      round: nextRound,
      currentCountryIndex: nextIndex,
    };
  }

  let ns = { ...state, currentCountryIndex: nextIndex, round: nextRound, phase: GamePhase.PLAY_STEP };
  if (TURN_ORDER[state.currentCountryIndex] === Country.JAPAN && ns.supplyMarkers.truk_supply) {
    ns = { ...ns, supplyMarkers: { ...ns.supplyMarkers, truk_supply: false } };
  }
  return ns;
}

// ---------------------------------------------------------------------------
// 15. getAvailablePieces
// ---------------------------------------------------------------------------
export function getAvailablePieces(
  country: Country,
  state: GameState
): { armies: number; navies: number } {
  const limits = COUNTRY_PIECES[country];
  const cs = state.countries[country];
  const armiesOnBoard = cs.piecesOnBoard.filter((p) => p.type === 'army').length;
  const naviesOnBoard = cs.piecesOnBoard.filter((p) => p.type === 'navy').length;

  return {
    armies: Math.max(0, limits.armies - armiesOnBoard),
    navies: Math.max(0, limits.navies - naviesOnBoard),
  };
}

export function getRedeployOption(
  country: Country,
  pieceType: 'army' | 'navy',
  state: GameState,
  eventContext?: { currentEffect?: CardEffect; eventCardName: string; remainingEffects: CardEffect[]; playingCountry: Country }
): PendingAction | null {
  const avail = getAvailablePieces(country, state);
  const hasReserve = pieceType === 'army' ? avail.armies > 0 : avail.navies > 0;
  if (hasReserve) return null;

  const pieces = state.countries[country].piecesOnBoard.filter((p) => p.type === pieceType);
  if (pieces.length === 0) return null;

  const piecesOnBoard = pieces.map((p) => ({
    pieceId: p.id,
    spaceId: p.spaceId,
    spaceName: getSpace(p.spaceId)?.name ?? p.spaceId.replace(/_/g, ' '),
  }));

  return {
    type: 'SELECT_PIECE_TO_REDEPLOY',
    pieceType,
    piecesOnBoard,
    redeployCountry: country,
    ...(eventContext && {
      currentEffect: eventContext.currentEffect,
      eventCardName: eventContext.eventCardName,
      remainingEffects: eventContext.remainingEffects,
      playingCountry: eventContext.playingCountry,
    }),
  };
}

// ---------------------------------------------------------------------------
// 16. addLogEntry
// ---------------------------------------------------------------------------
export function addLogEntry(state: GameState, country: Country, message: string): GameState {
  return {
    ...state,
    log: [
      ...state.log,
      { round: state.round, country, message, timestamp: Date.now() },
    ],
  };
}

// ---------------------------------------------------------------------------
// 16b. resolveAdditionalBattleChoice — player chose a target for ADDITIONAL_BATTLE
// ---------------------------------------------------------------------------
export function resolveAdditionalBattleChoice(
  chosenSpaceId: string,
  card: Card,
  country: Country,
  state: GameState
): { newState: GameState; message: string; chainTrigger?: ChainTrigger; pendingElimination?: PendingElimination } {
  const allPieces = getAllPieces(state);
  const enemyTeam = getEnemyTeam(country);
  const battleType = card.effects.find((e) => e.type === 'ADDITIONAL_BATTLE')?.battleType ?? 'land';
  const targetType = battleType === 'sea' ? 'navy' : 'army';

  const target = allPieces.find(
    (p) => p.spaceId === chosenSpaceId && getTeam(p.country) === enemyTeam && p.type === targetType
  );

  if (!target) {
    return { newState: state, message: `${card.name}: no valid target in ${getSpace(chosenSpaceId)?.name ?? chosenSpaceId}` };
  }

  const spaceName = getSpace(target.spaceId)?.name ?? target.spaceId;
  const battleChain: ChainTrigger = {
    type: battleType === 'sea' ? 'battle_sea' : 'battle_land',
    spaceId: target.spaceId,
  };

  return {
    newState: state,
    message: `${card.name}: battling enemy ${target.type} in ${spaceName}`,
    chainTrigger: battleChain,
    pendingElimination: {
      pieceId: target.id,
      pieceCountry: target.country,
      pieceType: target.type,
      spaceId: target.spaceId,
    },
  };
}

// ---------------------------------------------------------------------------
// 17. getCurrentCountry
// ---------------------------------------------------------------------------
export function getCurrentCountry(state: GameState): Country {
  return TURN_ORDER[state.currentCountryIndex];
}

// ---------------------------------------------------------------------------
// 18. findEWCounterResponses — EW counter cards (Convoy Protection, Atlantic
//     Convoy, Women Conscripts)
// ---------------------------------------------------------------------------
export function findEWCounterResponses(
  ewCountry: Country,
  state: GameState
): { country: Country; card: Card }[] {
  const results: { country: Country; card: Card }[] = [];
  const targetTeam = getEnemyTeam(ewCountry);
  const targetCountries = getTeamCountries(targetTeam);

  for (const c of targetCountries) {
    const cs = state.countries[c];
    for (const card of cs.responseCards) {
      for (const effect of card.effects) {
        if (effect.condition === 'on_ew_discard' || effect.condition === 'on_soviet_discard') {
          results.push({ country: c, card });
          break;
        }
      }
    }
  }
  return results;
}

export function findEWCancelResponses(
  ewCountry: Country,
  state: GameState
): { country: Country; card: Card }[] {
  const results: { country: Country; card: Card }[] = [];
  const targetTeam = getEnemyTeam(ewCountry);
  const targetCountries = getTeamCountries(targetTeam);
  for (const c of targetCountries) {
    for (const card of state.countries[c].responseCards) {
      for (const effect of card.effects) {
        if (effect.condition === 'cancel_ew_card') {
          results.push({ country: c, card });
          break;
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 19. resolveEWCounter — discard counter card and draw a replacement card
// ---------------------------------------------------------------------------
export function resolveEWCounter(
  responseCountry: Country,
  responseCardId: string,
  state: GameState
): GameState {
  let ns = activateProtectionResponse(responseCountry, responseCardId, state);

  const cs = ns.countries[responseCountry];
  if (cs.deck.length > 0) {
    const drawn = cs.deck[0];
    const newDeck = cs.deck.slice(1);
    ns = {
      ...ns,
      countries: {
        ...ns.countries,
        [responseCountry]: {
          ...ns.countries[responseCountry],
          hand: [...ns.countries[responseCountry].hand, drawn],
          deck: newDeck,
        },
      },
    };
  }

  return ns;
}

// ---------------------------------------------------------------------------
// 20. findEnemyBuildReactions — Loyal to Crown, Kamikaze, Rasputitsa,
//     Defense of the Motherland
// ---------------------------------------------------------------------------
export function findEnemyBuildReactions(
  buildCountry: Country,
  buildSpaceId: string,
  builtPieceType: 'army' | 'navy',
  builtPieceId: string,
  state: GameState,
  excludeCardIds: string[] = []
): { country: Country; card: Card; description: string }[] {
  const results: { country: Country; card: Card; description: string }[] = [];
  const buildTeam = getTeam(buildCountry);
  const enemyCountries = getTeamCountries(buildTeam === Team.AXIS ? Team.ALLIES : Team.AXIS);

  const pieceStillExists = state.countries[buildCountry].piecesOnBoard.some(
    (p) => p.id === builtPieceId
  );

  for (const c of enemyCountries) {
    const cs = state.countries[c];
    for (const card of cs.responseCards) {
      if (excludeCardIds.includes(card.id)) continue;

      for (const effect of card.effects) {
        // --- ELIMINATE reactions (Loyal to Crown, Kamikaze, Rasputitsa) ---
        if (
          (effect.type === 'ELIMINATE_ARMY' || effect.type === 'ELIMINATE_NAVY') &&
          effect.team === buildTeam
        ) {
          if (!pieceStillExists) continue;
          const targetPieceType = effect.type === 'ELIMINATE_ARMY' ? 'army' : 'navy';
          if (builtPieceType !== targetPieceType) continue;

          let locationMatch = false;

          if (effect.condition === 'adjacent_or_in' && effect.where) {
            locationMatch = effect.where.some(
              (w) => w === buildSpaceId || getAdjacentSpaces(w).includes(buildSpaceId)
            );
          } else if (effect.condition === 'adjacent_to_japanese_navy' || effect.condition === 'adjacent_to_japanese_piece') {
            const adjSpaces = getAdjacentSpaces(buildSpaceId);
            locationMatch = state.countries[Country.JAPAN].piecesOnBoard.some(
              (p) => adjSpaces.includes(p.spaceId)
            );
          } else if (effect.where) {
            locationMatch = effect.where.includes(buildSpaceId);
          }

          if (locationMatch) {
            const spaceName = getSpace(buildSpaceId)?.name ?? buildSpaceId;
            results.push({
              country: c,
              card,
              description: `${card.name}: eliminate ${builtPieceType} in ${spaceName}`,
            });
            break;
          }
        }

        // --- BUILD reaction (Defense of the Motherland) ---
        if (
          effect.type === 'BUILD_ARMY' &&
          effect.condition === 'axis_build_adjacent_moscow' &&
          effect.where?.includes('moscow') &&
          buildTeam === Team.AXIS &&
          builtPieceType === 'army'
        ) {
          const adjToMoscow = getAdjacentSpaces('moscow');
          if (!adjToMoscow.includes(buildSpaceId) && buildSpaceId !== 'moscow') continue;

          const avail = getAvailablePieces(c, state);
          if (avail.armies <= 0) continue;

          const allPieces = getAllPieces(state);
          const ownArmyInMoscow = state.countries[c].piecesOnBoard.some(
            (p) => p.spaceId === 'moscow' && p.type === 'army'
          );
          const enemyInMoscow = allPieces.some(
            (p) => p.spaceId === 'moscow' && getTeam(p.country) !== getTeam(c)
          );

          if (!ownArmyInMoscow && !enemyInMoscow) {
            results.push({
              country: c,
              card,
              description: `${card.name}: build Soviet army in Moscow`,
            });
            break;
          }
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 21. findCrossTeamBuildResponses — Italian Axis Alliance
// ---------------------------------------------------------------------------
export function findCrossTeamBuildResponses(
  buildCountry: Country,
  buildSpaceId: string,
  state: GameState,
  excludeCardIds: string[] = []
): { country: Country; card: Card; description: string }[] {
  const results: { country: Country; card: Card; description: string }[] = [];
  const buildTeam = getTeam(buildCountry);
  const allyCountries = getTeamCountries(buildTeam).filter((c) => c !== buildCountry);

  for (const c of allyCountries) {
    const cs = state.countries[c];
    for (const card of cs.responseCards) {
      if (excludeCardIds.includes(card.id)) continue;

      for (const effect of card.effects) {
        if (effect.type === 'BUILD_ARMY' && effect.condition === 'axis_ally_build') {
          if (buildTeam !== Team.AXIS) continue;

          const avail = getAvailablePieces(c, state);
          if (avail.armies <= 0) continue;

          const adj = getAdjacentSpaces(buildSpaceId);
          const allPieces = getAllPieces(state);

          const validAdj = adj.filter((a) => {
            const sp = getSpace(a);
            if (sp?.type !== SpaceType.LAND) return false;
            if (allPieces.some((p) => p.spaceId === a && getTeam(p.country) !== buildTeam))
              return false;
            if (state.countries[c].piecesOnBoard.some((p) => p.spaceId === a)) return false;
            return true;
          });

          if (validAdj.length > 0) {
            const spaceName = getSpace(buildSpaceId)?.name ?? buildSpaceId;
            results.push({
              country: c,
              card,
              description: `${card.name}: build Italian army adjacent to ${spaceName}`,
            });
            break;
          }
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 22. resolveBuildReaction — handles eliminate (Loyal to Crown, Kamikaze,
//     Rasputitsa) and build (Defense of Motherland, Axis Alliance) reactions
// ---------------------------------------------------------------------------
export function resolveBuildReaction(
  card: Card,
  buildSpaceId: string,
  buildCountry: Country,
  builtPieceId: string,
  responseCountry: Country,
  state: GameState
): { newState: GameState; message: string } {
  let ns = activateProtectionResponse(responseCountry, card.id, state);

  for (const effect of card.effects) {
    if (effect.type === 'ELIMINATE_ARMY' || effect.type === 'ELIMINATE_NAVY') {
      const targetCs = ns.countries[buildCountry];
      const piece = targetCs.piecesOnBoard.find((p) => p.id === builtPieceId);
      if (piece) {
        ns = {
          ...ns,
          countries: {
            ...ns.countries,
            [buildCountry]: {
              ...targetCs,
              piecesOnBoard: targetCs.piecesOnBoard.filter((p) => p.id !== builtPieceId),
            },
          },
        };
        const spaceName = getSpace(buildSpaceId)?.name ?? buildSpaceId;
        return {
          newState: ns,
          message: `${card.name}: eliminated ${piece.type} in ${spaceName}`,
        };
      }
      return { newState: ns, message: `${card.name}: target no longer exists` };
    }

    if (effect.type === 'BUILD_ARMY') {
      const avail = getAvailablePieces(responseCountry, ns);
      if (avail.armies <= 0) {
        return { newState: ns, message: `${card.name}: no armies available` };
      }

      let targetSpace: string | null = null;

      if (effect.condition === 'axis_build_adjacent_moscow' && effect.where) {
        targetSpace = effect.where[0];
      } else if (effect.condition === 'axis_ally_build') {
        const adj = getAdjacentSpaces(buildSpaceId);
        const allPieces = getAllPieces(ns);
        const team = getTeam(responseCountry);

        const validAdj = adj.filter((a) => {
          const sp = getSpace(a);
          if (sp?.type !== SpaceType.LAND) return false;
          if (allPieces.some((p) => p.spaceId === a && getTeam(p.country) !== team)) return false;
          if (ns.countries[responseCountry].piecesOnBoard.some((p) => p.spaceId === a))
            return false;
          return true;
        });

        if (validAdj.length === 0) {
          return { newState: ns, message: `${card.name}: no valid adjacent space` };
        }

        targetSpace = validAdj.reduce((a, b) => {
          const sa = getSpace(a);
          const sb = getSpace(b);
          const scoreA = (sa?.isSupplySpace ? 10 : 0) + (sa?.homeCountry ? 5 : 0);
          const scoreB = (sb?.isSupplySpace ? 10 : 0) + (sb?.homeCountry ? 5 : 0);
          return scoreB > scoreA ? b : a;
        });
      }

      if (!targetSpace) {
        return { newState: ns, message: `${card.name}: unknown build condition` };
      }

      const piece: Piece = {
        id: `piece_r${++_resolveIdCounter}_${Date.now()}`,
        country: responseCountry,
        type: 'army',
        spaceId: targetSpace,
      };

      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [responseCountry]: {
            ...ns.countries[responseCountry],
            piecesOnBoard: [...ns.countries[responseCountry].piecesOnBoard, piece],
          },
        },
      };

      const spaceName = getSpace(targetSpace)?.name ?? targetSpace;
      return { newState: ns, message: `${card.name}: built army in ${spaceName}` };
    }
  }

  return { newState: ns, message: `${card.name} activated` };
}

// ---------------------------------------------------------------------------
// 23. findBattleReactions — Romanian Reinforcements
// ---------------------------------------------------------------------------
export function findBattleReactions(
  battleCountry: Country,
  battleSpaceId: string,
  state: GameState,
  excludeCardIds: string[] = []
): { country: Country; card: Card; description: string }[] {
  const results: { country: Country; card: Card; description: string }[] = [];

  for (const c of TURN_ORDER) {
    if (c === battleCountry) continue;
    const cs = state.countries[c];
    for (const card of cs.responseCards) {
      if (excludeCardIds.includes(card.id)) continue;

      for (const effect of card.effects) {
        if (effect.type === 'BUILD_ARMY' && effect.condition === 'battle_adjacent_balkans') {
          const adjToBalkans = getAdjacentSpaces('balkans');
          if (battleSpaceId !== 'balkans' && !adjToBalkans.includes(battleSpaceId)) continue;

          const avail = getAvailablePieces(c, state);
          if (avail.armies <= 0) continue;

          const allPieces = getAllPieces(state);
          const team = getTeam(c);
          const enemyInBalkans = allPieces.some(
            (p) => p.spaceId === 'balkans' && getTeam(p.country) !== team
          );
          const ownArmyInBalkans = state.countries[c].piecesOnBoard.some(
            (p) => p.spaceId === 'balkans' && p.type === 'army'
          );

          if (!enemyInBalkans && !ownArmyInBalkans) {
            results.push({
              country: c,
              card,
              description: `${card.name}: build Italian army in Balkans`,
            });
            break;
          }
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 24. resolveBattleReaction — builds in response to nearby battle
// ---------------------------------------------------------------------------
export function resolveBattleReaction(
  card: Card,
  responseCountry: Country,
  state: GameState
): { newState: GameState; message: string } {
  let ns = activateProtectionResponse(responseCountry, card.id, state);

  for (const effect of card.effects) {
    if (effect.type === 'BUILD_ARMY' && effect.where) {
      const targetSpace = effect.where[0];
      const avail = getAvailablePieces(responseCountry, ns);
      if (avail.armies <= 0) {
        return { newState: ns, message: `${card.name}: no armies available` };
      }

      const allPieces = getAllPieces(ns);
      const team = getTeam(responseCountry);
      const enemyInSpace = allPieces.some(
        (p) => p.spaceId === targetSpace && getTeam(p.country) !== team
      );
      const ownInSpace = ns.countries[responseCountry].piecesOnBoard.some(
        (p) => p.spaceId === targetSpace
      );

      if (enemyInSpace || ownInSpace) {
        const spaceName = getSpace(targetSpace)?.name ?? targetSpace;
        return { newState: ns, message: `${card.name}: cannot build in ${spaceName}` };
      }

      const piece: Piece = {
        id: `piece_r${++_resolveIdCounter}_${Date.now()}`,
        country: responseCountry,
        type: 'army',
        spaceId: targetSpace,
      };

      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [responseCountry]: {
            ...ns.countries[responseCountry],
            piecesOnBoard: [...ns.countries[responseCountry].piecesOnBoard, piece],
          },
        },
      };

      const spaceName = getSpace(targetSpace)?.name ?? targetSpace;
      return { newState: ns, message: `${card.name}: built army in ${spaceName}` };
    }
  }

  return { newState: ns, message: `${card.name} activated` };
}

// ---------------------------------------------------------------------------
// 25. cardTargetsUK — check if a card affects United Kingdom spaces
// ---------------------------------------------------------------------------
export function cardTargetsUK(card: Card): boolean {
  return card.effects.some((e) => e.where?.includes('united_kingdom'));
}

// ---------------------------------------------------------------------------
// 26. findCardCancelResponses — Battle of Britain
// ---------------------------------------------------------------------------
export function findCardCancelResponses(
  playingCountry: Country,
  card: Card,
  state: GameState
): { country: Country; card: Card } | null {
  if (playingCountry !== Country.GERMANY) return null;
  if (!cardTargetsUK(card)) return null;

  const ukState = state.countries[Country.UK];
  for (const responseCard of ukState.responseCards) {
    for (const effect of responseCard.effects) {
      if (effect.condition === 'cancel_german_card') {
        return { country: Country.UK, card: responseCard };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 27. findStatusFreeActions — Afrika Korps, Resistance, Soviet Partisans
// ---------------------------------------------------------------------------
export function findStatusFreeActions(
  country: Country,
  state: GameState,
  excludeCardIds: string[] = []
): { card: Card; description: string }[] {
  const cs = state.countries[country];
  const results: { card: Card; description: string }[] = [];
  if (cs.deck.length === 0) return results;

  for (const card of cs.statusCards) {
    if (excludeCardIds.includes(card.id)) continue;
    for (const effect of card.effects) {
      if (effect.type === 'BUILD_ARMY' && effect.where && !effect.condition) {
        const avail = getAvailablePieces(country, state);
        if (avail.armies <= 0) continue;
        const allPieces = getAllPieces(state);
        const enemyTeam = getEnemyTeam(country);
        const validSpaces = SPACES.filter((sp) => {
          if (sp.type !== SpaceType.LAND) return false;
          if (!spaceMatchesWhere(sp.id, effect.where!)) return false;
          if (cs.piecesOnBoard.some((p) => p.spaceId === sp.id)) return false;
          if (allPieces.some((p) => p.spaceId === sp.id && getTeam(p.country) === enemyTeam)) return false;
          return cs.piecesOnBoard.some((p) => isInSupply(p, state) && getAdjacentSpaces(p.spaceId).includes(sp.id));
        });
        if (validSpaces.length === 0) continue;
        const whereName = effect.where.join(', ').replace(/_/g, ' ');
        results.push({ card, description: `${card.name}: Build army in ${whereName} (costs top card)` });
        break;
      }

      if (effect.type === 'LAND_BATTLE' && effect.where && !effect.condition) {
        const targets = getValidBattleTargets(country, 'land', state).filter((t) =>
          spaceMatchesWhere(t, effect.where!)
        );
        if (targets.length === 0) continue;
        const whereName = effect.where.join(', ').replace(/_/g, ' ');
        results.push({ card, description: `${card.name}: Battle land space in ${whereName} (costs top card)` });
        break;
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 28. resolveStatusFreeAction — execute the free action, discard top card
// ---------------------------------------------------------------------------
export function resolveStatusFreeAction(
  card: Card,
  country: Country,
  state: GameState
): { newState: GameState; message: string; validBattleTargets?: string[] } {
  let ns = state;

  const deck = ns.countries[country].deck;
  if (deck.length > 0) {
    const [discardedCard, ...remaining] = deck;
    ns = {
      ...ns,
      countries: {
        ...ns.countries,
        [country]: {
          ...ns.countries[country],
          deck: remaining,
          discard: [...ns.countries[country].discard, discardedCard],
        },
      },
    };
  }

  for (const effect of card.effects) {
    if (effect.type === 'BUILD_ARMY' && effect.where && !effect.condition) {
      const avail = getAvailablePieces(country, ns);
      if (avail.armies <= 0) return { newState: ns, message: `${card.name}: no armies available` };
      const allPieces = getAllPieces(ns);
      const enemyTeam = getEnemyTeam(country);
      const validSpaces = SPACES.filter((sp) => {
        if (sp.type !== SpaceType.LAND) return false;
        if (!spaceMatchesWhere(sp.id, effect.where!)) return false;
        if (ns.countries[country].piecesOnBoard.some((p) => p.spaceId === sp.id)) return false;
        if (allPieces.some((p) => p.spaceId === sp.id && getTeam(p.country) === enemyTeam)) return false;
        return true;
      });
      if (validSpaces.length === 0) return { newState: ns, message: `${card.name}: no valid location` };
      const best = validSpaces.reduce((a, b) => {
        const sa = a.isSupplySpace ? 10 : 0;
        const sb = b.isSupplySpace ? 10 : 0;
        return sb > sa ? b : a;
      });
      const piece: Piece = { id: `piece_r${++_resolveIdCounter}_${Date.now()}`, country, type: 'army', spaceId: best.id };
      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [country]: { ...ns.countries[country], piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] },
        },
      };
      return { newState: ns, message: `${card.name}: built army in ${best.name}` };
    }

    if (effect.type === 'LAND_BATTLE' && effect.where && !effect.condition) {
      const targets = getValidBattleTargets(country, 'land', ns).filter((t) =>
        spaceMatchesWhere(t, effect.where!)
      );
      if (targets.length === 0) return { newState: ns, message: `${card.name}: no valid targets` };
      if (targets.length > 1) {
        // Multiple targets: let caller (store.ts) handle human choice or AI scoring
        return { newState: ns, message: `${card.name}: choose a land space to battle`, validBattleTargets: targets };
      }
      // Single target: auto-execute
      const target = targets[0];
      ns = resolveBattleAction(target, country, ns);
      return { newState: ns, message: `${card.name}: battled in ${getSpace(target)?.name ?? target}` };
    }
  }

  return { newState: ns, message: `${card.name} activated` };
}

// ---------------------------------------------------------------------------
// 29. getStatusAlternativeActions — Conscription, Guards, Bravado, Free France,
//     Resistance, Volksturm, Directorates, etc.
// ---------------------------------------------------------------------------
export function getStatusAlternativeActions(
  country: Country,
  state: GameState
): { card: Card; description: string; discardCardType?: CardType }[] {
  const cs = state.countries[country];
  const results: { card: Card; description: string; discardCardType?: CardType }[] = [];

  for (const card of cs.statusCards) {
    for (const effect of card.effects) {
      if (effect.type === 'BUILD_ARMY' && effect.condition === 'from_discard') {
        if (cs.hand.length >= 2 && cs.discard.some((c) => c.type === CardType.BUILD_ARMY)) {
          results.push({ card, description: `${card.name}: Discard 2 from hand to play Build Army from discard`, discardCardType: CardType.BUILD_ARMY });
        }
      }
      if (effect.type === 'BUILD_ARMY' && effect.condition === 'deck_cost_build') {
        if (cs.deck.length >= 2) {
          const avail = getAvailablePieces(country, state);
          const validLocs = getValidBuildLocations(country, 'army', state);
          const hasArmiesOnBoard = cs.piecesOnBoard.some((p) => p.type === 'army');
          if ((avail.armies > 0 && validLocs.length > 0) || (avail.armies === 0 && hasArmiesOnBoard)) {
            results.push({ card, description: `${card.name}: Discard 2 from deck to build an Army` });
          }
        }
      }
      if (effect.type === 'LAND_BATTLE' && effect.condition === 'from_discard') {
        if (cs.hand.length >= 2 && cs.discard.some((c) => c.type === CardType.LAND_BATTLE)) {
          results.push({ card, description: `${card.name}: Discard 2 from hand to play Land Battle from discard`, discardCardType: CardType.LAND_BATTLE });
        }
      }
      if (effect.type === 'LAND_BATTLE' && effect.condition === 'deck_cost_battle') {
        if (cs.deck.length >= 2) {
          const enemyTeam = getEnemyTeam(country);
          const allPcs = getAllPieces(state);
          const hasTarget = allPcs.some((p) => p.type === 'army' && getTeam(p.country) === enemyTeam &&
            cs.piecesOnBoard.some((own) => own.type === 'army' && getAdjacentSpaces(own.spaceId).includes(p.spaceId))
          );
          if (hasTarget) {
            results.push({ card, description: `${card.name}: Discard 2 from deck to battle a land space` });
          }
        }
      }
      if (effect.type === 'DISCARD_CARDS' && effect.condition === 'retrieve_from_discard') {
        if (cs.discard.length > 0) {
          results.push({ card, description: `${card.name}: Take a card from discard pile` });
        }
      }
      if (effect.type === 'BUILD_ARMY' && effect.condition === 'discard_2_from_hand') {
        if (cs.hand.length >= 2) {
          const avail = getAvailablePieces(country, state);
          if (avail.armies > 0 && effect.where) {
            results.push({ card, description: `${card.name}: Discard 2 cards to build Army in ${effect.where.join('/')}` });
          }
        }
      }
      if (effect.type === 'LAND_BATTLE' && effect.condition === 'discard_2_from_hand') {
        if (cs.hand.length >= 2) {
          const enemyTeam = getEnemyTeam(country);
          const allPieces = getAllPieces(state);
          const filtered = (effect.where ?? []).filter((sid) =>
            allPieces.some((p) => p.spaceId === sid && p.type === 'army' && getTeam(p.country) === enemyTeam)
          );
          if (filtered.length > 0) {
            results.push({ card, description: `${card.name}: Discard 2 cards to battle` });
          }
        }
      }
      if (effect.type === 'RECRUIT_ARMY' && effect.where && card.id !== 'ger_volksturm') {
        const deckCost = effect.condition === 'discard_2_from_deck' ? 2 : 1;
        if (state.countries[country].deck.length < deckCost) continue;
        const avail = getAvailablePieces(country, state);
        if (avail.armies > 0) {
          for (const sid of effect.where) {
            const sp = getSpace(sid);
            if (!sp) continue;
            const pieces = getAllPieces(state);
            if (pieces.some((p) => p.spaceId === sid && p.country === country)) continue;
            if (pieces.some((p) => p.spaceId === sid && getTeam(p.country) !== getTeam(country))) continue;
            results.push({ card, description: `${card.name}: Recruit Army in ${sp.name} (discard ${deckCost} from deck)` });
            break;
          }
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 30. executeStatusAlternativeAction — plays a card from discard
// ---------------------------------------------------------------------------
export function executeStatusAlternativeAction(
  statusCard: Card,
  country: Country,
  state: GameState
): { newState: GameState; pendingAction: PendingAction | null; retrievedCard?: Card } {
  const cs = state.countries[country];
  let ns = state;

  for (const effect of statusCard.effects) {
    // Guards (USSR): discard 2 from hand → play Build Army/Land Battle from discard pile
    if (
      (effect.type === 'BUILD_ARMY' && effect.condition === 'from_discard') ||
      (effect.type === 'LAND_BATTLE' && effect.condition === 'from_discard')
    ) {
      if (cs.hand.length < 2) return { newState: ns, pendingAction: null };
      const targetType = effect.type === 'BUILD_ARMY' ? CardType.BUILD_ARMY : CardType.LAND_BATTLE;
      const cardIndex = cs.discard.findIndex((c) => c.type === targetType);
      if (cardIndex === -1) return { newState: ns, pendingAction: null };

      return {
        newState: ns,
        pendingAction: {
          type: 'SELECT_HAND_DISCARD',
          count: 2,
          statusCardId: statusCard.id,
          afterAction: effect.type === 'BUILD_ARMY' ? 'build_army' : 'land_battle',
        },
      };
    }

    // Conscription (Germany): discard 2 from deck → build an Army
    if (effect.type === 'BUILD_ARMY' && effect.condition === 'deck_cost_build') {
      if (cs.deck.length < 2) return { newState: ns, pendingAction: null };
      const avail = getAvailablePieces(country, ns);

      const discarded = cs.deck.slice(0, 2);
      const remainingDeck = cs.deck.slice(2);
      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [country]: { ...cs, deck: remainingDeck, discard: [...cs.discard, ...discarded] },
        },
      };
      ns = addLogEntry(ns, country, `${statusCard.name}: discarded 2 cards from deck`);

      if (avail.armies <= 0) {
        const redeployPA = getRedeployOption(country, 'army', ns);
        if (redeployPA) return { newState: ns, pendingAction: redeployPA };
        return { newState: ns, pendingAction: null };
      }
      const validLocs = getValidBuildLocations(country, 'army', ns);
      if (validLocs.length === 0) return { newState: ns, pendingAction: null };

      if (validLocs.length === 1) {
        const piece: Piece = { id: generatePieceId(), country, type: 'army', spaceId: validLocs[0] };
        ns = { ...ns, countries: { ...ns.countries, [country]: { ...ns.countries[country], piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] } } };
        ns = addLogEntry(ns, country, `${statusCard.name}: built army in ${getSpace(validLocs[0])?.name ?? validLocs[0]}`);
        return { newState: ns, pendingAction: null };
      }
      return {
        newState: ns,
        pendingAction: { type: 'SELECT_BUILD_LOCATION', pieceType: 'army', validSpaces: validLocs },
      };
    }

    // Bravado (Italy): discard 2 from deck → battle a land space
    if (effect.type === 'LAND_BATTLE' && effect.condition === 'deck_cost_battle') {
      if (cs.deck.length < 2) return { newState: ns, pendingAction: null };
      const validTargets = getValidBattleTargets(country, 'land', ns);
      if (validTargets.length === 0) return { newState: ns, pendingAction: null };

      const discarded = cs.deck.slice(0, 2);
      const remainingDeck = cs.deck.slice(2);
      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [country]: { ...cs, deck: remainingDeck, discard: [...cs.discard, ...discarded] },
        },
      };
      ns = addLogEntry(ns, country, `${statusCard.name}: discarded 2 cards from deck`);

      if (validTargets.length === 1) {
        ns = resolveBattleAction(validTargets[0], country, ns);
        ns = addLogEntry(ns, country, `${statusCard.name}: battled in ${getSpace(validTargets[0])?.name ?? validTargets[0]}`);
        return { newState: ns, pendingAction: null };
      }
      return {
        newState: ns,
        pendingAction: { type: 'SELECT_BATTLE_TARGET', battleType: 'land', validTargets },
      };
    }

    if (effect.type === 'DISCARD_CARDS' && effect.condition === 'retrieve_from_discard') {
      if (cs.discard.length === 0) return { newState: ns, pendingAction: null };
      const best = cs.discard.reduce((a, b) => {
        const scoreA = a.type === CardType.STATUS ? 5 : a.type === CardType.EVENT ? 4 : a.type === CardType.LAND_BATTLE ? 3 : 2;
        const scoreB = b.type === CardType.STATUS ? 5 : b.type === CardType.EVENT ? 4 : b.type === CardType.LAND_BATTLE ? 3 : 2;
        return scoreB > scoreA ? b : a;
      });
      const newDiscard = cs.discard.filter((c) => c.id !== best.id);
      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [country]: { ...cs, hand: [...cs.hand, best], discard: newDiscard },
        },
      };
      return { newState: addLogEntry(ns, country, `${statusCard.name}: retrieved ${best.name} from discard`), pendingAction: null, retrievedCard: best };
    }

    if (effect.type === 'BUILD_ARMY' && effect.condition === 'discard_2_from_hand' && effect.where) {
      if (cs.hand.length < 2) return { newState: ns, pendingAction: null };
      return {
        newState: ns,
        pendingAction: { type: 'SELECT_HAND_DISCARD', count: 2, statusCardId: statusCard.id, afterAction: 'build_army', afterWhere: effect.where },
      };
    }

    if (effect.type === 'LAND_BATTLE' && effect.condition === 'discard_2_from_hand') {
      if (cs.hand.length < 2) return { newState: ns, pendingAction: null };
      return {
        newState: ns,
        pendingAction: { type: 'SELECT_HAND_DISCARD', count: 2, statusCardId: statusCard.id, afterAction: 'land_battle', afterWhere: effect.where },
      };
    }

    if (effect.type === 'RECRUIT_ARMY' && effect.where) {
      const deckCost = effect.condition === 'discard_2_from_deck' ? 2 : 1;
      const avail = getAvailablePieces(country, ns);
      if (avail.armies <= 0) return { newState: ns, pendingAction: null };
      if (ns.countries[country].deck.length < deckCost) return { newState: ns, pendingAction: null };
      const allPcs = getAllPieces(ns);
      for (const sid of effect.where) {
        const sp = getSpace(sid);
        if (!sp || sp.type !== SpaceType.LAND) continue;
        if (allPcs.some((p) => p.spaceId === sid && p.country === country)) continue;
        if (allPcs.some((p) => p.spaceId === sid && getTeam(p.country) !== getTeam(country))) continue;
        let deck = [...ns.countries[country].deck];
        let discard = [...ns.countries[country].discard];
        const discardedFromDeck = deck.slice(0, deckCost);
        deck = deck.slice(deckCost);
        discard = [...discard, ...discardedFromDeck];
        const piece: Piece = { id: generatePieceId(), country, type: 'army', spaceId: sid };
        ns = { ...ns, countries: { ...ns.countries, [country]: { ...ns.countries[country], deck, discard, piecesOnBoard: [...ns.countries[country].piecesOnBoard, piece] } } };
        const discardNames = discardedFromDeck.map((c) => c.name).join(', ');
        return { newState: addLogEntry(ns, country, `${statusCard.name}: recruited army in ${sp.name} (discarded ${discardNames} from deck)`), pendingAction: null };
      }
      return { newState: ns, pendingAction: null };
    }
  }

  return { newState: ns, pendingAction: null };
}

// ---------------------------------------------------------------------------
// 30b. resolveHandDiscardAction — after player picks cards to discard for
//      Free France / Resistance, compute the next pending action (build/battle).
// ---------------------------------------------------------------------------
export function resolveHandDiscardAction(
  cardIds: string[],
  statusCardId: string,
  afterAction: 'build_army' | 'land_battle',
  afterWhere: string[] | undefined,
  country: Country,
  state: GameState
): { newState: GameState; pendingAction: PendingAction | null } {
  const cs = state.countries[country];
  const statusCard = cs.statusCards.find((c) => c.id === statusCardId);
  const cardName = statusCard?.name ?? 'Status card';

  const discarded = cs.hand.filter((c) => cardIds.includes(c.id));
  const remaining = cs.hand.filter((c) => !cardIds.includes(c.id));
  let ns: GameState = {
    ...state,
    countries: {
      ...state.countries,
      [country]: { ...cs, hand: remaining, discard: [...cs.discard, ...discarded] },
    },
  };
  ns = addLogEntry(ns, country, `${cardName}: discarded ${discarded.map((c) => c.name).join(', ')}`);

  if (afterAction === 'build_army') {
    const validSpaces = getValidBuildLocations(country, 'army', ns);
    const filtered = afterWhere ? validSpaces.filter((s) => afterWhere.includes(s)) : validSpaces;
    if (filtered.length > 0) {
      return { newState: ns, pendingAction: { type: 'SELECT_BUILD_LOCATION', pieceType: 'army', validSpaces: filtered } };
    }
    return { newState: addLogEntry(ns, country, `${cardName}: no valid build location`), pendingAction: null };
  }

  if (afterAction === 'land_battle') {
    const enemyTeam = getEnemyTeam(country);
    const allPieces = getAllPieces(ns);
    const filtered = (afterWhere ?? []).filter((sid) =>
      allPieces.some((p) => p.spaceId === sid && p.type === 'army' && getTeam(p.country) === enemyTeam)
    );
    if (filtered.length > 0) {
      return { newState: ns, pendingAction: { type: 'SELECT_BATTLE_TARGET', battleType: 'land', validTargets: filtered } };
    }
    return { newState: addLogEntry(ns, country, `${cardName}: no valid battle target`), pendingAction: null };
  }

  return { newState: ns, pendingAction: null };
}

// ---------------------------------------------------------------------------
// 31. applyWolfPacksModifier — Wolf Packs: EW also targets UK specifically
// ---------------------------------------------------------------------------
export function applyWolfPacksModifier(
  ewCountry: Country,
  state: GameState
): GameState {
  if (ewCountry !== Country.GERMANY) return state;
  const hasWolfPacks = state.countries[Country.GERMANY].statusCards.some(
    (c) => c.effects.some((e) => e.type === 'DISCARD_CARDS' && e.condition === 'submarine')
  );
  if (!hasWolfPacks) return state;

  const ukState = state.countries[Country.UK];
  let deck = [...ukState.deck];
  let discard = [...ukState.discard];
  let toDiscard = 2;
  let discarded = 0;

  while (toDiscard > 0 && deck.length > 0) {
    discard.push(deck.pop()!);
    toDiscard--;
    discarded++;
  }

  let resultState: GameState = {
    ...state,
    countries: {
      ...state.countries,
      [Country.UK]: { ...ukState, deck, discard },
    },
  };

  if (discarded > 0) {
    resultState = addLogEntry(resultState, ewCountry, `Wolf Packs: UK discards ${discarded} more from deck`);
  }
  return resultState;
}

// ---------------------------------------------------------------------------
// 32. isProtectedByShvernik — check if a piece is protected by Shvernik
// ---------------------------------------------------------------------------
export function isProtectedByShvernik(piece: Piece, state: GameState): boolean {
  // Card text: "Soviet Armies are never out of supply."
  // Only protects Soviet armies (not navies, not other Allied nations).
  // Protection is map-wide — there is no geographic restriction.
  if (piece.country !== Country.SOVIET_UNION) return false;
  if (piece.type !== 'army') return false;
  const ussrStatus = state.countries[Country.SOVIET_UNION].statusCards;
  return ussrStatus.some((c) =>
    c.effects.some((e) => e.type === 'PROTECT_PIECE' && e.condition === 'only_land_battle')
  );
}

// ---------------------------------------------------------------------------
// 33. findBushidoOpportunity — Bushido: when a Japanese army is eliminated,
//     Japan may battle an adjacent land space before the army is removed
// ---------------------------------------------------------------------------
export function findBushidoOpportunity(
  eliminatedSpaceId: string,
  attackingCountry: Country,
  state: GameState
): { card: Card; validTargets: string[] } | null {
  if (getTeam(attackingCountry) === Team.AXIS) return null;

  const jpnStatus = state.countries[Country.JAPAN].statusCards;
  const bushido = jpnStatus.find((c) =>
    c.effects.some((e) => e.type === 'LAND_BATTLE' && e.condition === 'on_army_eliminated')
  );
  if (!bushido) return null;
  if (state.countries[Country.JAPAN].deck.length === 0) return null;

  const adj = getAdjacentSpaces(eliminatedSpaceId);
  const enemyTeam = getEnemyTeam(Country.JAPAN);
  const allPieces = getAllPieces(state);
  const validTargets = adj.filter((a) => {
    const sp = getSpace(a);
    if (sp?.type !== SpaceType.LAND) return false;
    return allPieces.some(
      (p) => p.spaceId === a && getTeam(p.country) === enemyTeam && p.type === 'army'
    );
  });

  if (validTargets.length === 0) return null;
  return { card: bushido, validTargets };
}

// ---------------------------------------------------------------------------
// 34. resolveBushidoBattle — execute the Bushido bonus battle (costs top card)
// ---------------------------------------------------------------------------
export function resolveBushidoBattle(
  card: Card,
  eliminatedSpaceId: string,
  state: GameState
): { newState: GameState; message: string } {
  let ns = state;

  const deck = ns.countries[Country.JAPAN].deck;
  if (deck.length > 0) {
    const [discardedCard, ...remaining] = deck;
    ns = {
      ...ns,
      countries: {
        ...ns.countries,
        [Country.JAPAN]: {
          ...ns.countries[Country.JAPAN],
          deck: remaining,
          discard: [...ns.countries[Country.JAPAN].discard, discardedCard],
        },
      },
    };
  }

  const adj = getAdjacentSpaces(eliminatedSpaceId);
  const enemyTeam = getEnemyTeam(Country.JAPAN);
  const allPieces = getAllPieces(ns);
  const validTargets = adj.filter((a) => {
    const sp = getSpace(a);
    if (sp?.type !== SpaceType.LAND) return false;
    return allPieces.some(
      (p) => p.spaceId === a && getTeam(p.country) === enemyTeam && p.type === 'army'
    );
  });

  if (validTargets.length === 0) {
    return { newState: ns, message: `${card.name}: no valid adjacent target` };
  }

  const best = validTargets.reduce((a, b) => {
    const sa = getSpace(a);
    const sb = getSpace(b);
    const scoreA = (sa?.isSupplySpace ? 10 : 0) + (sa?.homeCountry ? 5 : 0);
    const scoreB = (sb?.isSupplySpace ? 10 : 0) + (sb?.homeCountry ? 5 : 0);
    return scoreB > scoreA ? b : a;
  });

  ns = resolveBattleAction(best, Country.JAPAN, ns);
  const spaceName = getSpace(best)?.name ?? best;
  return { newState: ns, message: `${card.name}: battled in ${spaceName} before army removal` };
}

// ---------------------------------------------------------------------------
// 35. findIslandDefenseOpportunity — Island Hopping Defense: when an Allied
//     navy battles a sea space, protect a Japanese navy adjacent to an island
// ---------------------------------------------------------------------------
export function findIslandDefenseOpportunity(
  battleSpaceId: string,
  attackingCountry: Country,
  eliminatedPieceId: string,
  state: GameState
): { card: Card } | null {
  if (getTeam(attackingCountry) !== Team.ALLIES) return null;

  const jpnStatus = state.countries[Country.JAPAN].statusCards;
  const ihd = jpnStatus.find((c) =>
    c.effects.some((e) => e.type === 'PROTECT_PIECE' && e.condition === 'adjacent_to_island')
  );
  if (!ihd) return null;
  if (state.countries[Country.JAPAN].deck.length === 0) return null;

  const piece = state.countries[Country.JAPAN].piecesOnBoard.find(
    (p) => p.id === eliminatedPieceId
  );
  if (!piece || piece.type !== 'navy') return null;

  const adj = getAdjacentSpaces(piece.spaceId);
  const adjacentToIsland = adj.some((a) => {
    const sp = getSpace(a);
    return sp?.type === SpaceType.LAND;
  });
  if (!adjacentToIsland) return null;

  return { card: ihd };
}

// ---------------------------------------------------------------------------
// 36. resolveIslandDefense — protect Japanese navy (costs top deck card)
// ---------------------------------------------------------------------------
export function resolveIslandDefense(
  card: Card,
  state: GameState
): { newState: GameState; message: string } {
  let ns = state;

  const deck = ns.countries[Country.JAPAN].deck;
  if (deck.length > 0) {
    const [discardedCard, ...remaining] = deck;
    ns = {
      ...ns,
      countries: {
        ...ns.countries,
        [Country.JAPAN]: {
          ...ns.countries[Country.JAPAN],
          deck: remaining,
          discard: [...ns.countries[Country.JAPAN].discard, discardedCard],
        },
      },
    };
  }

  return { newState: ns, message: `${card.name}: protected Japanese Navy adjacent to island` };
}

// ---------------------------------------------------------------------------
// 37. findCounterOffensiveOpportunity — Red Army Counter-Offensive: when an
//     Axis army is eliminated, USSR may recruit an army in an adjacent space
// ---------------------------------------------------------------------------
export function findCounterOffensiveOpportunity(
  eliminatedSpaceId: string,
  eliminatedPieceCountry: Country,
  state: GameState
): { card: Card; validSpaces: string[] } | null {
  if (getTeam(eliminatedPieceCountry) !== Team.AXIS) return null;

  const ussrStatus = state.countries[Country.SOVIET_UNION].statusCards;
  const co = ussrStatus.find((c) =>
    c.effects.some((e) => e.type === 'RECRUIT_ARMY' && e.condition === 'on_axis_eliminated')
  );
  if (!co) return null;

  const avail = getAvailablePieces(Country.SOVIET_UNION, state);
  if (avail.armies <= 0) return null;

  const adj = getAdjacentSpaces(eliminatedSpaceId);
  const allPieces = getAllPieces(state);
  const validSpaces = adj.filter((a) => {
    const sp = getSpace(a);
    if (sp?.type !== SpaceType.LAND) return false;
    if (allPieces.some((p) => p.spaceId === a && getTeam(p.country) === Team.AXIS)) return false;
    if (state.countries[Country.SOVIET_UNION].piecesOnBoard.some((p) => p.spaceId === a))
      return false;
    return true;
  });

  if (validSpaces.length === 0) return null;
  return { card: co, validSpaces };
}

// ---------------------------------------------------------------------------
// 38. resolveCounterOffensive — recruit Soviet army in adjacent space
// ---------------------------------------------------------------------------
export function resolveCounterOffensive(
  card: Card,
  eliminatedSpaceId: string,
  state: GameState
): { newState: GameState; message: string } {
  let ns = state;

  const avail = getAvailablePieces(Country.SOVIET_UNION, ns);
  if (avail.armies <= 0) {
    return { newState: ns, message: `${card.name}: no armies available` };
  }

  const adj = getAdjacentSpaces(eliminatedSpaceId);
  const allPieces = getAllPieces(ns);
  const validSpaces = adj.filter((a) => {
    const sp = getSpace(a);
    if (sp?.type !== SpaceType.LAND) return false;
    if (allPieces.some((p) => p.spaceId === a && getTeam(p.country) === Team.AXIS)) return false;
    if (ns.countries[Country.SOVIET_UNION].piecesOnBoard.some((p) => p.spaceId === a))
      return false;
    return true;
  });

  if (validSpaces.length === 0) {
    return { newState: ns, message: `${card.name}: no valid adjacent space` };
  }

  const best = validSpaces.reduce((a, b) => {
    const sa = getSpace(a);
    const sb = getSpace(b);
    const scoreA = (sa?.isSupplySpace ? 10 : 0) + (sa?.homeCountry ? 5 : 0);
    const scoreB = (sb?.isSupplySpace ? 10 : 0) + (sb?.homeCountry ? 5 : 0);
    return scoreB > scoreA ? b : a;
  });

  const piece: Piece = {
    id: `piece_co_${++_resolveIdCounter}_${Date.now()}`,
    country: Country.SOVIET_UNION,
    type: 'army',
    spaceId: best,
  };

  ns = {
    ...ns,
    countries: {
      ...ns.countries,
      [Country.SOVIET_UNION]: {
        ...ns.countries[Country.SOVIET_UNION],
        piecesOnBoard: [...ns.countries[Country.SOVIET_UNION].piecesOnBoard, piece],
      },
    },
  };

  const spaceName = getSpace(best)?.name ?? best;
  return { newState: ns, message: `${card.name}: recruited army in ${spaceName}` };
}

// ---------------------------------------------------------------------------
// 39. findArsenalOpportunity — Arsenal of Democracy: when an Allied country
//     discards due to hand limit, USA may help them draw an extra card
// ---------------------------------------------------------------------------
export function findArsenalOpportunity(
  discardingCountry: Country,
  state: GameState
): { card: Card } | null {
  if (getTeam(discardingCountry) !== Team.ALLIES) return null;
  if (discardingCountry === Country.USA) return null;

  const usaStatus = state.countries[Country.USA].statusCards;
  const arsenal = usaStatus.find((c) =>
    c.effects.some((e) => e.type === 'DISCARD_CARDS' && e.condition === 'give_to_ally')
  );
  if (!arsenal) return null;
  if (state.countries[Country.USA].hand.length <= 1) return null;

  const targetDeck = state.countries[discardingCountry].deck;
  if (targetDeck.length === 0) return null;

  return { card: arsenal };
}

// ---------------------------------------------------------------------------
// 40. resolveArsenalOfDemocracy — USA discards lowest-value card, ally draws
//     an extra card from their own deck
// ---------------------------------------------------------------------------
export function resolveArsenalOfDemocracy(
  card: Card,
  targetCountry: Country,
  state: GameState
): { newState: GameState; message: string } {
  let ns = state;
  const usaState = ns.countries[Country.USA];

  if (usaState.hand.length === 0) {
    return { newState: ns, message: `${card.name}: no cards available` };
  }

  const discardCard = usaState.hand[usaState.hand.length - 1];
  ns = {
    ...ns,
    countries: {
      ...ns.countries,
      [Country.USA]: {
        ...usaState,
        hand: usaState.hand.filter((c) => c.id !== discardCard.id),
        discard: [...usaState.discard, discardCard],
      },
    },
  };

  const targetState = ns.countries[targetCountry];
  if (targetState.deck.length > 0) {
    const drawn = targetState.deck[0];
    ns = {
      ...ns,
      countries: {
        ...ns.countries,
        [targetCountry]: {
          ...ns.countries[targetCountry],
          hand: [...ns.countries[targetCountry].hand, drawn],
          deck: ns.countries[targetCountry].deck.slice(1),
        },
      },
    };
  }

  const countryName = COUNTRY_NAMES[targetCountry];
  return { newState: ns, message: `${card.name}: aided ${countryName} (drew extra card)` };
}

// ---------------------------------------------------------------------------
// 41. findEnigmaOpportunity — after Germany uses a Status card ability,
//     UK can discard that Status card
// ---------------------------------------------------------------------------
export function findEnigmaOpportunity(state: GameState): { card: Card } | null {
  const ukCards = state.countries[Country.UK].responseCards;
  for (const card of ukCards) {
    if (card.effects.some((e) => e.condition === 'discard_german_status')) {
      return { card };
    }
  }
  return null;
}

export function resolveEnigma(
  statusCardId: string,
  state: GameState
): GameState {
  const gerState = state.countries[Country.GERMANY];
  const card = gerState.statusCards.find((c) => c.id === statusCardId);
  if (!card) return state;
  return {
    ...state,
    countries: {
      ...state.countries,
      [Country.GERMANY]: {
        ...gerState,
        statusCards: gerState.statusCards.filter((c) => c.id !== statusCardId),
        discard: [...gerState.discard, card],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 42. applyRationing — return played card to deck instead of discard
// ---------------------------------------------------------------------------
export function findRationingOpportunity(country: Country, state: GameState): Card | null {
  if (country !== Country.UK) return null;
  for (const card of state.countries[Country.UK].responseCards) {
    if (card.effects.some((e) => e.condition === 'return_played_card')) return card;
  }
  return null;
}

export function resolveRationing(playedCard: Card, state: GameState): GameState {
  const ukState = state.countries[Country.UK];
  const inDiscard = ukState.discard.find((c) => c.id === playedCard.id);
  if (!inDiscard) return state;
  const newDiscard = ukState.discard.filter((c) => c.id !== playedCard.id);
  const newDeck = [...ukState.deck];
  const insertIdx = Math.floor(Math.random() * (newDeck.length + 1));
  newDeck.splice(insertIdx, 0, playedCard);
  return {
    ...state,
    countries: {
      ...state.countries,
      [Country.UK]: { ...ukState, deck: newDeck, discard: newDiscard },
    },
  };
}

// ---------------------------------------------------------------------------
// 43. applyWomenConscripts — return Build Army card to top of deck
// ---------------------------------------------------------------------------
export function findWomenConscriptsOpportunity(country: Country, playedCardType: CardType, state: GameState): Card | null {
  if (country !== Country.SOVIET_UNION) return null;
  if (playedCardType !== CardType.BUILD_ARMY) return null;
  for (const card of state.countries[Country.SOVIET_UNION].statusCards) {
    if (card.effects.some((e) => e.condition === 'return_build_army')) return card;
  }
  return null;
}

export function resolveWomenConscripts(playedCard: Card, state: GameState): GameState {
  const cs = state.countries[Country.SOVIET_UNION];
  const inDiscard = cs.discard.find((c) => c.id === playedCard.id);
  if (!inDiscard) return state;
  const newDiscard = cs.discard.filter((c) => c.id !== playedCard.id);
  return {
    ...state,
    countries: {
      ...state.countries,
      [Country.SOVIET_UNION]: {
        ...cs,
        deck: [playedCard, ...cs.deck],
        discard: newDiscard,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 44. applyRosieTheRiveter — return 1-2 cards from hand to bottom of deck
// ---------------------------------------------------------------------------
export function findRosieOpportunity(country: Country, state: GameState): Card | null {
  if (country !== Country.USA) return null;
  for (const card of state.countries[Country.USA].statusCards) {
    if (card.effects.some((e) => e.condition === 'return_to_deck')) return card;
  }
  return null;
}

export function resolveRosieWithCards(state: GameState, cardIds: string[]): GameState {
  const cs = state.countries[Country.USA];
  const toReturn = cs.hand.filter((c) => cardIds.includes(c.id));
  if (toReturn.length === 0) return state;
  const newHand = cs.hand.filter((c) => !cardIds.includes(c.id));
  return {
    ...state,
    countries: {
      ...state.countries,
      [Country.USA]: {
        ...cs,
        hand: newHand,
        deck: [...cs.deck, ...toReturn],
      },
    },
  };
}

export function resolveRosieAI(state: GameState): GameState {
  const cs = state.countries[Country.USA];
  if (cs.hand.length === 0) return state;

  const allPieces = getAllPieces(state);
  const usaPieces = cs.piecesOnBoard;
  const hasArmyOnBoard = usaPieces.some((p) => p.type === 'army');
  const hasNavyOnBoard = usaPieces.some((p) => p.type === 'navy');
  const handSize = cs.hand.length;

  const scored = cs.hand.map((card) => {
    let keepScore = 0;

    switch (card.type) {
      case CardType.STATUS:
        keepScore = 20;
        if (cs.statusCards.length >= 3) keepScore = 12;
        break;
      case CardType.RESPONSE:
        keepScore = 16;
        if (cs.responseCards.length >= 2) keepScore = 10;
        break;
      case CardType.EVENT:
        keepScore = 14;
        break;
      case CardType.BUILD_ARMY:
        keepScore = hasArmyOnBoard ? 8 : 4;
        break;
      case CardType.BUILD_NAVY:
        keepScore = hasNavyOnBoard ? 8 : 4;
        break;
      case CardType.LAND_BATTLE:
        keepScore = hasArmyOnBoard ? 10 : 3;
        break;
      case CardType.SEA_BATTLE:
        keepScore = hasNavyOnBoard ? 10 : 3;
        break;
      case CardType.ECONOMIC_WARFARE:
        keepScore = state.round >= 6 ? 8 : 4;
        break;
      default:
        keepScore = 5;
    }

    if (handSize <= 3) keepScore += 5;

    return { card, keepScore };
  });

  scored.sort((a, b) => a.keepScore - b.keepScore);
  const returnCount = Math.min(2, scored.length);
  const toReturnIds = scored.slice(0, returnCount).map((s) => s.card.id);
  return resolveRosieWithCards(state, toReturnIds);
}

// ---------------------------------------------------------------------------
// 45. applySuperiorPlanning — examine top 4 cards, reorder optimally
// ---------------------------------------------------------------------------
export function findSuperiorPlanningOpportunity(country: Country, state: GameState): Card | null {
  if (country !== Country.GERMANY) return null;
  for (const card of state.countries[Country.GERMANY].statusCards) {
    if (card.effects.some((e) => e.condition === 'examine_top_4')) return card;
  }
  return null;
}

export function resolveSuperiorPlanning(state: GameState): GameState {
  const cs = state.countries[Country.GERMANY];
  if (cs.deck.length < 2) return state;
  const topN = Math.min(4, cs.deck.length);
  const examined = cs.deck.slice(0, topN);
  const rest = cs.deck.slice(topN);
  examined.sort((a, b) => {
    const score = (c: Card) =>
      c.type === CardType.STATUS ? 10 : c.type === CardType.EVENT ? 8 :
      c.type === CardType.RESPONSE ? 7 : c.type === CardType.LAND_BATTLE ? 5 :
      c.type === CardType.BUILD_ARMY ? 4 : 3;
    return score(b) - score(a);
  });
  return {
    ...state,
    countries: {
      ...state.countries,
      [Country.GERMANY]: { ...cs, deck: [...examined, ...rest] },
    },
  };
}

// ---------------------------------------------------------------------------
// 46. resolveVolksturm — beginning of turn: recruit army in Germany
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 45b. resolveFlexibleResources — play a chosen card from the discard pile
// ---------------------------------------------------------------------------
export function resolveFlexibleResources(
  chosenCardId: string,
  country: Country,
  state: GameState
): { newState: GameState; pendingAction: PendingAction | null } {
  const cs = state.countries[country];
  const chosen = cs.discard.find((c) => c.id === chosenCardId);
  if (!chosen) return { newState: state, pendingAction: null };

  const newDiscard = cs.discard.filter((c) => c.id !== chosenCardId);
  let ns: GameState = {
    ...state,
    countries: {
      ...state.countries,
      [country]: { ...cs, discard: newDiscard },
    },
  };

  const { newState, pendingAction } = playCard(chosen, ns);
  return {
    newState: addLogEntry(newState, country, `Flexible Resources: played ${chosen.name} from discard`),
    pendingAction,
  };
}

export function findVolkssturmOpportunity(country: Country, state: GameState): Card | null {
  if (country !== Country.GERMANY) return null;
  for (const card of state.countries[Country.GERMANY].statusCards) {
    if (card.effects.some((e) => e.type === 'RECRUIT_ARMY' && e.where?.includes('germany'))) return card;
  }
  return null;
}

export function resolveVolkssturm(state: GameState): GameState {
  const cs = state.countries[Country.GERMANY];
  if (cs.deck.length === 0) return state;
  const avail = getAvailablePieces(Country.GERMANY, state);
  if (avail.armies <= 0) return state;
  const allPieces = getAllPieces(state);
  if (allPieces.some((p) => p.spaceId === 'germany' && p.country === Country.GERMANY && p.type === 'army')) return state;
  if (allPieces.some((p) => p.spaceId === 'germany' && getTeam(p.country) !== Team.AXIS)) return state;

  const [discardedCard, ...remainingDeck] = cs.deck;
  const piece: Piece = { id: `piece_vk_${Date.now()}`, country: Country.GERMANY, type: 'army', spaceId: 'germany' };
  return {
    ...state,
    countries: {
      ...state.countries,
      [Country.GERMANY]: {
        ...cs,
        deck: remainingDeck,
        discard: [...cs.discard, discardedCard],
        piecesOnBoard: [...cs.piecesOnBoard, piece],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 47. resolveMobileForce — beginning of turn: recruit navy in/adj North Pacific
// ---------------------------------------------------------------------------
export function findMobileForceOpportunity(country: Country, state: GameState): Card | null {
  if (country !== Country.JAPAN) return null;
  for (const card of state.countries[Country.JAPAN].responseCards) {
    if (card.id === 'jpn_mobile_force') return card;
  }
  return null;
}

export function getValidMobileForceSpaces(state: GameState): string[] {
  const avail = getAvailablePieces(Country.JAPAN, state);
  if (avail.navies <= 0) return [];
  return getValidRecruitSpaces(
    { type: 'RECRUIT_NAVY', where: ['north_pacific'], condition: 'adjacent_or_in' },
    Country.JAPAN,
    state
  );
}

export function resolveMobileForceAt(spaceId: string, state: GameState): GameState {
  const cs = state.countries[Country.JAPAN];
  const piece: Piece = { id: `piece_mf_${Date.now()}`, country: Country.JAPAN, type: 'navy', spaceId };
  return {
    ...state,
    countries: {
      ...state.countries,
      [Country.JAPAN]: {
        ...cs,
        piecesOnBoard: [...cs.piecesOnBoard, piece],
        responseCards: cs.responseCards.filter((c) => c.id !== 'jpn_mobile_force'),
        discard: [...cs.discard, ...cs.responseCards.filter((c) => c.id === 'jpn_mobile_force')],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 48. resolveDefenseOfMotherland — beginning of turn: recruit army in/adj
//     Moscow, then eliminate Axis army in Moscow
// ---------------------------------------------------------------------------
export function findDefenseOfMotherlandOpportunity(country: Country, state: GameState): Card | null {
  if (country !== Country.SOVIET_UNION) return null;
  for (const card of state.countries[Country.SOVIET_UNION].responseCards) {
    if (card.id === 'ussr_defense_motherland') return card;
  }
  return null;
}

export function resolveDefenseOfMotherland(state: GameState): GameState {
  let cs = state.countries[Country.SOVIET_UNION];
  let ns = state;
  const allPieces = getAllPieces(ns);

  const avail = getAvailablePieces(Country.SOVIET_UNION, ns);
  if (avail.armies > 0) {
    const targets = ['moscow', ...getAdjacentSpaces('moscow')];
    for (const sid of targets) {
      const sp = getSpace(sid);
      if (!sp || sp.type !== SpaceType.LAND) continue;
      if (allPieces.some((p) => p.spaceId === sid && p.country === Country.SOVIET_UNION && p.type === 'army')) continue;
      if (allPieces.some((p) => p.spaceId === sid && getTeam(p.country) === Team.AXIS)) continue;
      const piece: Piece = { id: `piece_dm_${Date.now()}`, country: Country.SOVIET_UNION, type: 'army', spaceId: sid };
      ns = { ...ns, countries: { ...ns.countries, [Country.SOVIET_UNION]: { ...cs, piecesOnBoard: [...cs.piecesOnBoard, piece] } } };
      ns = addLogEntry(ns, Country.SOVIET_UNION, `Defense of the Motherland: recruited army in ${sp.name}`);
      break;
    }
  }

  const axisInMoscow = getAllPieces(ns).find(
    (p) => p.spaceId === 'moscow' && getTeam(p.country) === Team.AXIS && p.type === 'army'
  );
  if (axisInMoscow) {
    const tc = ns.countries[axisInMoscow.country];
    ns = { ...ns, countries: { ...ns.countries, [axisInMoscow.country]: { ...tc, piecesOnBoard: tc.piecesOnBoard.filter((p) => p.id !== axisInMoscow.id) } } };
    ns = addLogEntry(ns, Country.SOVIET_UNION, `Defense of the Motherland: eliminated ${axisInMoscow.country} army in Moscow`);
  }

  cs = ns.countries[Country.SOVIET_UNION];
  ns = {
    ...ns,
    countries: {
      ...ns.countries,
      [Country.SOVIET_UNION]: {
        ...cs,
        responseCards: cs.responseCards.filter((c) => c.id !== 'ussr_defense_motherland'),
        discard: [...cs.discard, ...cs.responseCards.filter((c) => c.id === 'ussr_defense_motherland')],
      },
    },
  };

  return ns;
}

// ---------------------------------------------------------------------------
// 49. findAllyReinforcementResponses — German/Romanian Reinforcements
//     Triggered when a supplied allied army is removed from the board
// ---------------------------------------------------------------------------
export function findAllyReinforcementResponses(
  eliminatedCountry: Country,
  eliminatedSpaceId: string,
  state: GameState
): { country: Country; card: Card; recruitCountry: Country; description: string }[] {
  const results: { country: Country; card: Card; recruitCountry: Country; description: string }[] = [];
  const teamCountries = getTeamCountries(getTeam(eliminatedCountry));
  for (const c of teamCountries) {
    for (const card of state.countries[c].responseCards) {
      for (const eff of card.effects) {
        if (eff.type === 'RECRUIT_ARMY' && eff.condition === 'after_italian_army_removed' && eliminatedCountry === Country.ITALY) {
          const recruitC = eff.country ?? Country.GERMANY;
          const avail = getAvailablePieces(recruitC, state);
          if (avail.armies <= 0) continue;
          results.push({ country: c, card, recruitCountry: recruitC, description: `${card.name}: recruit ${COUNTRY_NAMES[recruitC]} army in ${getSpace(eliminatedSpaceId)?.name ?? eliminatedSpaceId}` });
          break;
        }
        if (eff.type === 'RECRUIT_ARMY' && eff.condition === 'after_german_army_removed' && eliminatedCountry === Country.GERMANY) {
          const recruitC = eff.country ?? c;
          const avail = getAvailablePieces(recruitC, state);
          if (avail.armies <= 0) continue;
          results.push({ country: c, card, recruitCountry: recruitC, description: `${card.name}: recruit ${COUNTRY_NAMES[recruitC]} army in ${getSpace(eliminatedSpaceId)?.name ?? eliminatedSpaceId}` });
          break;
        }
      }
    }
  }
  return results;
}

export function resolveAllyReinforcement(
  card: Card,
  recruitCountry: Country,
  spaceId: string,
  responseCountry: Country,
  state: GameState
): { newState: GameState; message: string } {
  let ns = activateProtectionResponse(responseCountry, card.id, state);
  const avail = getAvailablePieces(recruitCountry, ns);
  if (avail.armies <= 0) return { newState: ns, message: `${card.name}: no armies available` };
  const allPieces = getAllPieces(ns);
  const enemyTeam = getEnemyTeam(recruitCountry);
  if (allPieces.some((p) => p.spaceId === spaceId && getTeam(p.country) === enemyTeam)) {
    return { newState: ns, message: `${card.name}: enemy in space, cannot recruit` };
  }
  if (ns.countries[recruitCountry].piecesOnBoard.some((p) => p.spaceId === spaceId)) {
    return { newState: ns, message: `${card.name}: already have piece in space` };
  }
  const piece: Piece = { id: `piece_reinf_${++_resolveIdCounter}_${Date.now()}`, country: recruitCountry, type: 'army', spaceId };
  ns = { ...ns, countries: { ...ns.countries, [recruitCountry]: { ...ns.countries[recruitCountry], piecesOnBoard: [...ns.countries[recruitCountry].piecesOnBoard, piece] } } };
  return { newState: ns, message: `${card.name}: recruited ${COUNTRY_NAMES[recruitCountry]} army in ${getSpace(spaceId)?.name ?? spaceId}` };
}
