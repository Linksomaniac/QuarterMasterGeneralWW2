import {
  Card,
  CardEffectType,
  CardType,
  Country,
  COUNTRY_PIECES,
  GameState,
  PendingAction,
  Piece,
  SpaceType,
  getTeam,
  getEnemyTeam,
  Team,
  TURN_ORDER,
} from './types';
import {
  getValidBuildLocations,
  getValidBattleTargets,
  getAvailablePieces,
  getAllPieces,
  getAllPiecesWithMinorPowers,
  getCurrentCountry,
  isInSupply,
  evaluateVPCondition,
} from './engine';
import { getSpace, HOME_SPACES, SUPPLY_SPACE_IDS, getAdjacentSpaces } from './mapData';
import { useTotalWarStore } from './totalwar/store';
import type { MinorPowerPiece } from './totalwar/types';

// ---------------------------------------------------------------------------
// Total War minor power context — lazy accessor (returns null when TW disabled)
// ---------------------------------------------------------------------------
interface TWContext {
  minorPowerPieces: MinorPowerPiece[];
  franceHomeIsUK: boolean;
  frenchArmies: MinorPowerPiece[];
  chineseArmies: MinorPowerPiece[];
}

function getTWContext(): TWContext | null {
  const tw = useTotalWarStore.getState();
  if (!tw.enabled) return null;
  const pieces = tw.minorPowerPieces;
  return {
    minorPowerPieces: pieces,
    franceHomeIsUK: tw.franceHomeIsUK,
    frenchArmies: pieces.filter((p) => p.minorPower === 'FRANCE' && p.type === 'army'),
    chineseArmies: pieces.filter((p) => p.minorPower === 'CHINA' && p.type === 'army'),
  };
}

// ===========================================================================
// Country-Specific AI Strategies
// ===========================================================================

interface CountryStrategy {
  prioritySpaces: string[];
  avoidSpaces: string[];
  priorityCardIds: string[];
  buildNavyBonus: number;
  buildArmyBonus: number;
  statusBonus: number;
  responseBonus: number;
  eventBonus: number;
  earlyStatusPriority: boolean;
  earlyBuildPriority: boolean;
}

const COUNTRY_STRATEGIES: Record<Country, CountryStrategy> = {
  [Country.UK]: {
    prioritySpaces: ['western_europe', 'india', 'australia', 'north_sea', 'mediterranean',
                     'north_atlantic', 'bay_of_bengal', 'canada', 'north_africa', 'africa'],
    avoidSpaces: ['eastern_us', 'western_us', 'hawaii', 'east_pacific'],
    priorityCardIds: ['uk_lord_linlithgow', 'uk_australia_directorate', 'uk_royal_navy',
                      'uk_free_france', 'uk_mackenzie_king', 'uk_resistance',
                      'uk_tw_government_in_exile', 'uk_tw_free_france_sub',
                      'uk_tw_senegalese_tirailleurs', 'uk_tw_armee_de_terre',
                      'uk_tw_france_combattante'],
    buildNavyBonus: 8,
    buildArmyBonus: 0,
    statusBonus: 4,
    responseBonus: 0,
    eventBonus: 0,
    earlyStatusPriority: false,
    earlyBuildPriority: true,
  },
  [Country.USA]: {
    prioritySpaces: ['hawaii', 'east_pacific', 'central_pacific', 'south_china_sea',
                     'philippines', 'iwo_jima', 'sea_of_japan', 'japan',
                     'new_guinea', 'western_europe', 'north_atlantic'],
    avoidSpaces: [],
    priorityCardIds: ['usa_aircraft_carriers', 'usa_amphibious_landings',
                      'usa_superior_shipyards', 'usa_wartime_production',
                      'usa_american_volunteer', 'usa_flying_fortresses',
                      'usa_tw_american_volunteer_sub', 'usa_tw_anti_japanese_volunteer',
                      'usa_tw_hundred_regiments', 'usa_tw_ledo_burma_roads_sub'],
    buildNavyBonus: 10,
    buildArmyBonus: 0,
    statusBonus: 8,
    responseBonus: 0,
    eventBonus: 2,
    earlyStatusPriority: true,
    earlyBuildPriority: true,
  },
  [Country.GERMANY]: {
    prioritySpaces: ['western_europe', 'eastern_europe', 'ukraine', 'russia', 'moscow', 'balkans',
                     'scandinavia'],
    avoidSpaces: [],
    priorityCardIds: ['ger_blitzkrieg', 'ger_bias_for_action', 'ger_dive_bombers',
                      'ger_conscription', 'ger_abundant_resources', 'ger_synthetic_fuel',
                      'ger_tw_fall_weiss', 'ger_tw_ardennes_offensive'],
    buildNavyBonus: 0,
    buildArmyBonus: 4,
    statusBonus: 10,
    responseBonus: 0,
    eventBonus: 0,
    earlyStatusPriority: true,
    earlyBuildPriority: false,
  },
  [Country.SOVIET_UNION]: {
    prioritySpaces: ['moscow', 'ukraine', 'russia', 'eastern_europe', 'siberia', 'kazakhstan'],
    avoidSpaces: [],
    priorityCardIds: ['ussr_guards', 'ussr_shvernik_evacuation', 'ussr_scorched_earth',
                      'ussr_women_conscripts', 'ussr_frontal_assault'],
    buildNavyBonus: 0,
    buildArmyBonus: 6,
    statusBonus: 6,
    responseBonus: 0,
    eventBonus: 0,
    earlyStatusPriority: false,
    earlyBuildPriority: true,
  },
  [Country.ITALY]: {
    prioritySpaces: ['balkans', 'north_africa', 'africa', 'middle_east',
                     'western_europe', 'mediterranean'],
    avoidSpaces: [],
    priorityCardIds: ['ita_impero_italiano', 'ita_balkan_resources', 'ita_mare_nostrum',
                      'ita_anti_communist', 'ita_afrika_korps', 'ita_bravado'],
    buildNavyBonus: 6,
    buildArmyBonus: 0,
    statusBonus: 12,
    responseBonus: 0,
    eventBonus: 0,
    earlyStatusPriority: true,
    earlyBuildPriority: false,
  },
  [Country.JAPAN]: {
    prioritySpaces: ['china', 'szechuan', 'southeast_asia', 'philippines', 'indonesia',
                     'new_guinea', 'india', 'iwo_jima', 'south_china_sea'],
    avoidSpaces: [],
    priorityCardIds: ['jpn_destroyer_transport', 'jpn_snlf', 'jpn_china_offensive',
                      'jpn_fall_of_singapore', 'jpn_surprise_attack', 'jpn_mobile_force',
                      'jpn_tw_chinese_civil_war', 'jpn_tw_imperial_manchukuo_army',
                      'jpn_tw_marco_polo_bridge'],
    buildNavyBonus: 8,
    buildArmyBonus: 0,
    statusBonus: 0,
    responseBonus: 10,
    eventBonus: 0,
    earlyStatusPriority: false,
    earlyBuildPriority: false,
  },
};

// US Pacific vs European focus shifts over time
const US_PACIFIC_SPACES = new Set(['hawaii', 'east_pacific', 'central_pacific', 'south_china_sea',
  'philippines', 'iwo_jima', 'new_guinea', 'indonesia', 'sea_of_japan', 'north_pacific']);
const US_EUROPE_SPACES = new Set(['western_europe', 'north_atlantic', 'north_sea',
  'mediterranean', 'north_africa', 'iceland']);

// Germany's east-push target chain
const GERMANY_EAST_CHAIN = new Set(['eastern_europe', 'ukraine', 'russia', 'moscow',
  'balkans', 'kazakhstan', 'siberia']);

// Moscow neighborhood for USSR defensive calculations
const MOSCOW_ADJACENT = new Set(getAdjacentSpaces('moscow'));

// ---------------------------------------------------------------------------
// getCountryCardBonus — country-aware card scoring adjustments
// ---------------------------------------------------------------------------
function getCountryCardBonus(card: Card, country: Country, state: GameState, round: number): number {
  const strategy = COUNTRY_STRATEGIES[country];
  const isEarly = round <= 5;
  const isMid = round > 5 && round <= 12;
  let bonus = 0;

  if (strategy.priorityCardIds.includes(card.id)) {
    bonus += isEarly ? 15 : isMid ? 10 : 8;
  }

  switch (card.type) {
    case CardType.BUILD_NAVY: bonus += strategy.buildNavyBonus; break;
    case CardType.BUILD_ARMY: bonus += strategy.buildArmyBonus; break;
    case CardType.STATUS:     bonus += strategy.statusBonus;    break;
    case CardType.RESPONSE:   bonus += strategy.responseBonus;  break;
    case CardType.EVENT:      bonus += strategy.eventBonus;     break;
  }

  if (strategy.earlyStatusPriority && isEarly && card.type === CardType.STATUS) {
    bonus += 8;
  }
  if (strategy.earlyBuildPriority && isEarly &&
      (card.type === CardType.BUILD_ARMY || card.type === CardType.BUILD_NAVY)) {
    bonus += 6;
  }

  // --- Germany: status chain — Blitzkrieg / Bias for Action / Dive Bombers ---
  // These three cards create a devastating combo: battle → build in battled space
  // → battle again → battle again. Each one in the chain massively multiplies
  // Germany's offensive power, so getting them down early is critical.
  if (country === Country.GERMANY) {
    const activeIds = new Set(state.countries[country].statusCards.map((c) => c.id));
    const chainCards = ['ger_blitzkrieg', 'ger_bias_for_action', 'ger_dive_bombers'];
    const activeChain = chainCards.filter((id) => activeIds.has(id)).length;

    if (card.type === CardType.STATUS && chainCards.includes(card.id) && !activeIds.has(card.id)) {
      // Escalating bonus: 1st chain card +10, 2nd +20, 3rd +30
      bonus += (activeChain + 1) * 10;
      // Extra urgency in early/mid game — chain must be set up before it's too late
      if (isEarly) bonus += 12;
      else if (isMid) bonus += 6;
    }
    // VP-generating status cards (Abundant Resources, Swedish Iron Ore) also get a boost
    if (card.type === CardType.STATUS && !chainCards.includes(card.id)) {
      const hasVPEffect = card.effects?.some((e) => e.type === 'VP_PER_CONDITION');
      if (hasVPEffect) bonus += 8;
    }
    // Once chain is active, build and battle cards become more valuable
    // because Blitzkrieg/Bias/Dive Bombers multiply their effects
    if (activeChain >= 2) {
      if (card.type === CardType.BUILD_ARMY) bonus += 6;
      if (card.type === CardType.LAND_BATTLE) bonus += 8;
    } else if (activeChain === 1) {
      if (card.type === CardType.LAND_BATTLE) bonus += 4;
    }
  }

  // --- Japan: response-based combo engine ---
  // Japan's power comes from response cards that trigger off battles/builds:
  // - Destroyer Transport: sea battle → build 1-2 armies adjacent
  // - SNLF: build navy → build 1-2 armies adjacent
  // - Surprise Attack: sea battle → extra sea + land battle
  // - China Offensive: battle China → build army + extra battle
  // - Banzai Charge: land battle → extra adjacent land battle
  // Response cards should be played BEFORE the triggers they combo with.
  if (country === Country.JAPAN) {
    const hand = state.countries[country].hand;
    const activeResponses = state.countries[country].responseCards;
    const activeResponseIds = new Set(activeResponses.map((c) => c.id));

    if (card.type === CardType.RESPONSE) {
      const hasBuildNavy = hand.some((c) => c.type === CardType.BUILD_NAVY);
      const hasSeaBattle = hand.some((c) => c.type === CardType.SEA_BATTLE);
      const hasLandBattle = hand.some((c) => c.type === CardType.LAND_BATTLE);

      // Build-enabling responses (Destroyer Transport, SNLF) are extremely high value
      const isBuildResponse = card.effects?.some((e) =>
        e.type === 'BUILD_ARMY' || e.type === 'RECRUIT_ARMY' || e.type === 'BUILD_NAVY' || e.type === 'RECRUIT_NAVY'
      );
      if (isBuildResponse) {
        bonus += 12;
        if (hasBuildNavy || hasSeaBattle) bonus += 10;  // have the trigger in hand
      }

      // Battle-extending responses (Surprise Attack, Banzai Charge, China Offensive)
      const isBattleResponse = card.effects?.some((e) =>
        e.type === 'ADDITIONAL_BATTLE' || e.type === 'SEA_BATTLE' || e.type === 'LAND_BATTLE' || e.type === 'BUILD_AFTER_BATTLE'
      );
      if (isBattleResponse) {
        bonus += 8;
        if (hasSeaBattle || hasLandBattle) bonus += 6;
      }

      // Responses should be played early to get maximum triggers over the game
      if (isEarly) bonus += 8;
      else if (isMid) bonus += 4;
    }

    // When Japan has key responses active, boost the cards that trigger them
    if (card.type === CardType.BUILD_NAVY) {
      // SNLF triggers off navy builds → build armies adjacent
      if (activeResponseIds.has('jpn_snlf')) bonus += 12;
    }
    if (card.type === CardType.SEA_BATTLE) {
      // Destroyer Transport triggers off sea battles → build armies
      if (activeResponseIds.has('jpn_destroyer_transport')) bonus += 12;
      // Surprise Attack gives extra battles
      if (activeResponseIds.has('jpn_surprise_attack')) bonus += 8;
    }
    if (card.type === CardType.LAND_BATTLE) {
      // Banzai Charge and China Offensive trigger off land battles
      if (activeResponseIds.has('jpn_banzai_charge')) bonus += 8;
      if (activeResponseIds.has('jpn_china_offensive')) bonus += 8;
    }
    // General synergy: more active responses = more value from triggers
    if (card.type === CardType.BUILD_NAVY || card.type === CardType.SEA_BATTLE) {
      if (activeResponses.length > 0) bonus += activeResponses.length * 3;
    }
  }

  // --- US: status-based force multiplier engine ---
  // USA's power comes from status cards that turn every build/battle into multiple actions:
  // - Aircraft Carriers: sea battle → build navy in battled space
  // - Amphibious Landings: land battle near navy → build army in battled space
  // - Superior Shipyards: build navy → build another navy
  // - Wartime Production: build army → build another army
  // - Flying Fortresses: EW cards discard +2 extra
  // Getting these status cards down early multiplies every future action.
  if (country === Country.USA) {
    const activeStatusIds = new Set(state.countries[country].statusCards.map((c) => c.id));
    const hand = state.countries[country].hand;

    // Force-multiplier status cards get a big bonus
    const forceMultipliers = [
      'usa_aircraft_carriers', 'usa_amphibious_landings',
      'usa_superior_shipyards', 'usa_wartime_production'
    ];
    if (card.type === CardType.STATUS && forceMultipliers.includes(card.id)) {
      bonus += 14;
      if (isEarly) bonus += 10;
      else if (isMid) bonus += 5;
    }
    // Flying Fortresses boosts EW — valuable if USA has EW cards in hand/deck
    if (card.id === 'usa_flying_fortresses') {
      const hasEW = hand.some((c) => c.type === CardType.ECONOMIC_WARFARE);
      bonus += hasEW ? 12 : 6;
    }

    // When force-multiplier statuses are active, boost their triggers
    if (card.type === CardType.SEA_BATTLE) {
      if (activeStatusIds.has('usa_aircraft_carriers')) bonus += 10;  // battle → build navy
    }
    if (card.type === CardType.LAND_BATTLE) {
      if (activeStatusIds.has('usa_amphibious_landings')) bonus += 10;  // battle → build army
    }
    if (card.type === CardType.BUILD_NAVY) {
      if (activeStatusIds.has('usa_superior_shipyards')) bonus += 8;  // build → build another
    }
    if (card.type === CardType.BUILD_ARMY) {
      if (activeStatusIds.has('usa_wartime_production')) bonus += 8;  // build → build another
    }
    if (card.type === CardType.ECONOMIC_WARFARE) {
      if (activeStatusIds.has('usa_flying_fortresses')) bonus += 6;  // EW hits harder
    }

    // Round-dependent Pacific vs Europe shift
    const hasPacificBuild = card.effects?.some((e) =>
      (e.type === 'BUILD_NAVY' || e.type === 'BUILD_ARMY' || e.type === 'RECRUIT_ARMY') &&
      e.where?.some((w) => US_PACIFIC_SPACES.has(w))
    );
    const hasEuropeBuild = card.effects?.some((e) =>
      (e.type === 'BUILD_NAVY' || e.type === 'BUILD_ARMY' || e.type === 'RECRUIT_ARMY') &&
      e.where?.some((w) => US_EUROPE_SPACES.has(w))
    );
    if (hasPacificBuild && round <= 8) bonus += 8;
    if (hasEuropeBuild && round > 8) bonus += 8;
  }

  // --- USSR: conserve battle cards early, use them late ---
  if (country === Country.SOVIET_UNION) {
    if (isEarly && (card.type === CardType.LAND_BATTLE || card.type === CardType.SEA_BATTLE)) {
      bonus -= 6;
    }
    if (round > 12 && card.type === CardType.LAND_BATTLE) {
      bonus += 4;
    }
  }

  // --- Total War: minor power card scoring ---
  const tw = getTWContext();
  if (tw) {
    const twCard = card as unknown as { minorPower?: string };
    const hasFrenchOnBoard = tw.frenchArmies.length > 0;
    const hasChineseOnBoard = tw.chineseArmies.length > 0;
    const axisInWE = getAllPieces(state).some(
      (p) => p.spaceId === 'western_europe' && getTeam(p.country) === Team.AXIS
    );

    // UK: France-related cards — play French status to move home, defend France
    if (country === Country.UK && twCard.minorPower === 'FRANCE') {
      // Government in Exile: critical when Axis holds WE, lets France build from UK
      if (card.id === 'uk_tw_government_in_exile') {
        bonus += axisInWE ? 25 : 12;
        if (isEarly) bonus += 10;
      }
      // Free France status: valuable when France has pieces to sustain
      else if (card.id === 'uk_tw_free_france_sub') {
        bonus += hasFrenchOnBoard ? 18 : 10;
        if (isEarly) bonus += 8;
      }
      // Senegalese Tirailleurs: expands France supply to Africa
      else if (card.id === 'uk_tw_senegalese_tirailleurs') {
        bonus += 12;
        if (isEarly) bonus += 6;
      }
      // Maginot Line: strong if French army is in WE
      else if (card.id === 'uk_tw_maginot_line') {
        bonus += tw.frenchArmies.some((p) => p.spaceId === 'western_europe') ? 15 : 6;
      }
      // All other France minor power cards: general build/recruit value
      else {
        bonus += 10;
        if (tw.frenchArmies.length <= 1) bonus += 8;  // urgent when France is low on pieces
      }
    }

    // Japan: anti-China cards — eliminate Chinese armies ASAP
    if (country === Country.JAPAN) {
      if (card.id === 'jpn_tw_chinese_civil_war') {
        bonus += hasChineseOnBoard ? 20 : 6;
        if (isEarly) bonus += 10;
      } else if (card.id === 'jpn_tw_imperial_manchukuo_army') {
        bonus += 14;
        if (isEarly) bonus += 8;
      } else if (card.id === 'jpn_tw_marco_polo_bridge') {
        bonus += hasChineseOnBoard ? 16 : 6;
      } else if (card.id === 'jpn_tw_bombing_chongqing') {
        bonus += hasChineseOnBoard ? 12 : 4;
      }
      // PRIORITY #1: Land battle when Chinese armies exist — this is the top priority
      if (hasChineseOnBoard && card.type === CardType.LAND_BATTLE) {
        // Check if Japan has an army adjacent to a Chinese army
        const jpnArmies = state.countries[Country.JAPAN].piecesOnBoard.filter((p) => p.type === 'army');
        const canReachChinese = tw.chineseArmies.some((mp) =>
          jpnArmies.some((a) => getAdjacentSpaces(a.spaceId).includes(mp.spaceId))
        );
        bonus += canReachChinese ? 50 : 25;  // massive bonus when can reach, still high when can't
      }
      // Build army to position for attacking Chinese armies
      if (hasChineseOnBoard && card.type === CardType.BUILD_ARMY) {
        bonus += 25;  // build to get adjacent, then battle next turn
      }
    }

    // Germany: anti-France cards — eliminate French armies ASAP (PRIORITY #1)
    if (country === Country.GERMANY) {
      if (card.id === 'ger_tw_fall_weiss') {
        bonus += hasFrenchOnBoard ? 15 : 4;
        if (isEarly) bonus += 8;
      } else if (card.id === 'ger_tw_ardennes_offensive') {
        bonus += tw.frenchArmies.some((p) => p.spaceId === 'western_europe') ? 14 : 6;
      }
      // PRIORITY #1: Land battle when French armies exist
      if (hasFrenchOnBoard && card.type === CardType.LAND_BATTLE) {
        const gerArmies = state.countries[Country.GERMANY].piecesOnBoard.filter((p) => p.type === 'army');
        const canReachFrench = tw.frenchArmies.some((mp) =>
          gerArmies.some((a) => getAdjacentSpaces(a.spaceId).includes(mp.spaceId))
        );
        bonus += canReachFrench ? 50 : 25;
      }
      // Build army to position for attacking French armies
      if (hasFrenchOnBoard && card.type === CardType.BUILD_ARMY) {
        bonus += 25;
      }
    }

    // Italy: support anti-France efforts (PRIORITY #1 when France alive)
    if (country === Country.ITALY && hasFrenchOnBoard) {
      if (card.type === CardType.LAND_BATTLE) {
        const itaArmies = state.countries[Country.ITALY].piecesOnBoard.filter((p) => p.type === 'army');
        const canReachFrench = tw.frenchArmies.some((mp) =>
          itaArmies.some((a) => getAdjacentSpaces(a.spaceId).includes(mp.spaceId))
        );
        bonus += canReachFrench ? 45 : 20;
      }
      if (card.type === CardType.BUILD_ARMY) {
        bonus += 20;
      }
    }

    // USA: China-related cards — defend and sustain Chinese armies
    if (country === Country.USA && twCard.minorPower === 'CHINA') {
      if (card.id === 'usa_tw_american_volunteer_sub') {
        bonus += 18;
        if (isEarly) bonus += 10;
      } else if (card.id === 'usa_tw_anti_japanese_volunteer') {
        bonus += 14;
        if (hasChineseOnBoard) bonus += 6;
      } else if (card.id === 'usa_tw_hundred_regiments') {
        bonus += 8;
        if (hasChineseOnBoard) bonus += 6;
      } else if (card.id === 'usa_tw_ledo_burma_roads_sub') {
        bonus += 12;
        if (isEarly) bonus += 6;
      }
      // Generic China builds — more valuable when China is low on pieces
      else {
        bonus += 10;
        if (tw.chineseArmies.length <= 1) bonus += 8;
      }
    }
  }

  return bonus;
}

// ---------------------------------------------------------------------------
// getCountrySpaceBonus — country-aware space scoring adjustments
// ---------------------------------------------------------------------------
function getCountrySpaceBonus(spaceId: string, country: Country, state: GameState): number {
  const strategy = COUNTRY_STRATEGIES[country];
  let bonus = 0;

  if (strategy.prioritySpaces.includes(spaceId)) bonus += 10;
  if (strategy.avoidSpaces.includes(spaceId)) bonus -= 12;

  // --- Germany: defend western_europe when Allies are near ---
  if (country === Country.GERMANY && spaceId === 'western_europe') {
    const allPieces = getAllPieces(state);
    const alliedNearWE = allPieces.some((p) =>
      getTeam(p.country) === Team.ALLIES &&
      (p.spaceId === 'western_europe' || getAdjacentSpaces('western_europe').includes(p.spaceId))
    );
    if (alliedNearWE) bonus += 10;
  }
  // Germany: bonus for east-chain offensive spaces — Moscow is the prize
  if (country === Country.GERMANY) {
    if (GERMANY_EAST_CHAIN.has(spaceId)) bonus += 6;
    if (spaceId === 'moscow') bonus += 25;    // Taking Moscow is devastating
    if (spaceId === 'ukraine') bonus += 10;   // VP space + route to Moscow
    if (spaceId === 'russia') bonus += 8;     // Adjacent to Moscow
    // UK's home is also a major target
    if (spaceId === 'united_kingdom') bonus += 15;
    // When chain is active, offensive paths are even more valuable
    const gerStatusIds = new Set(state.countries[Country.GERMANY].statusCards.map((c) => c.id));
    const chainActive = ['ger_blitzkrieg', 'ger_bias_for_action', 'ger_dive_bombers']
      .filter((id) => gerStatusIds.has(id)).length;
    if (chainActive >= 2 && GERMANY_EAST_CHAIN.has(spaceId)) {
      bonus += 10;  // Chain makes pushing east much more powerful
    }
  }

  // --- USSR: defend Moscow neighborhood ---
  if (country === Country.SOVIET_UNION && (spaceId === 'moscow' || MOSCOW_ADJACENT.has(spaceId))) {
    const allPieces = getAllPieces(state);
    const enemyNearMoscow = allPieces.some((p) =>
      getTeam(p.country) === Team.AXIS &&
      (p.spaceId === 'moscow' || MOSCOW_ADJACENT.has(p.spaceId) ||
       getAdjacentSpaces(p.spaceId).some((a) => a === 'moscow' || MOSCOW_ADJACENT.has(a)))
    );
    if (enemyNearMoscow) bonus += 15;
  }

  // --- US: Pacific offensive, targeting Japan ---
  if (country === Country.USA) {
    const round = state.round;
    if (US_PACIFIC_SPACES.has(spaceId)) {
      bonus += round <= 8 ? 12 : 4;
    }
    if (US_EUROPE_SPACES.has(spaceId)) {
      bonus += round > 8 ? 10 : 2;
    }
    // Japan and Sea of Japan are key targets — US should push to take Japan's home
    if (spaceId === 'japan') bonus += 20;
    if (spaceId === 'sea_of_japan') bonus += 15;
    // Stepping stones to Japan get extra bonus when US has navies nearby
    const usNavies = state.countries[Country.USA].piecesOnBoard.filter((p) => p.type === 'navy');
    const japanSteppingStones = ['iwo_jima', 'central_pacific', 'north_pacific', 'philippines'];
    if (japanSteppingStones.includes(spaceId) && usNavies.length > 0) {
      bonus += 8;
    }
    // When US has force-multiplier status cards, be more aggressive on attack paths
    const usStatusIds = new Set(state.countries[Country.USA].statusCards.map((c) => c.id));
    if (usStatusIds.has('usa_aircraft_carriers') || usStatusIds.has('usa_amphibious_landings')) {
      // With these active, offensive spaces become more valuable
      if (['sea_of_japan', 'japan', 'iwo_jima', 'philippines', 'south_china_sea'].includes(spaceId)) {
        bonus += 10;
      }
    }
  }

  // --- Italy: support Germany in western_europe ---
  if (country === Country.ITALY && spaceId === 'western_europe') {
    const gerHasWE = state.countries[Country.GERMANY].piecesOnBoard.some((p) => p.spaceId === 'western_europe');
    if (gerHasWE) bonus += 8;
  }
  // Italy: Africa/Balkans focus
  if (country === Country.ITALY &&
      ['balkans', 'north_africa', 'africa', 'middle_east'].includes(spaceId)) {
    bonus += 6;
  }

  // --- Japan: base-building focus ---
  if (country === Country.JAPAN &&
      ['china', 'southeast_asia', 'philippines', 'indonesia', 'new_guinea', 'india'].includes(spaceId)) {
    bonus += 8;
  }

  // --- UK: push toward Germany, protect home ---
  if (country === Country.UK) {
    if (['eastern_us', 'western_us', 'hawaii', 'east_pacific'].includes(spaceId)) {
      bonus -= 15;
    }
    // Germany and Western Europe are key targets for UK
    if (spaceId === 'germany') bonus += 20;
    if (spaceId === 'western_europe') bonus += 12;
    // North Sea control is critical for UK supply and D-Day
    if (spaceId === 'north_sea') bonus += 10;
    // When UK has status cards that multiply battles/builds, be more aggressive
    const ukStatusIds = new Set(state.countries[Country.UK].statusCards.map((c) => c.id));
    if (ukStatusIds.has('uk_royal_navy') || ukStatusIds.has('uk_free_france')) {
      if (['western_europe', 'north_sea', 'north_atlantic', 'mediterranean'].includes(spaceId)) {
        bonus += 8;
      }
    }
  }

  // --- Japan: push toward India, Australia, and enemy supply spaces ---
  if (country === Country.JAPAN) {
    if (spaceId === 'india') bonus += 15;
    if (spaceId === 'australia') bonus += 15;
    if (spaceId === 'united_kingdom') bonus += 10;  // distant but devastating
    // Key offensive sea spaces for Japan
    if (['bay_of_bengal', 'indian_ocean', 'south_china_sea'].includes(spaceId)) {
      bonus += 8;
    }
    // When responses are active, aggressive expansion spaces become more valuable
    const jpnResponseIds = new Set(state.countries[Country.JAPAN].responseCards.map((c) => c.id));
    if (jpnResponseIds.has('jpn_destroyer_transport') || jpnResponseIds.has('jpn_snlf')) {
      if (['india', 'australia', 'southeast_asia', 'new_guinea', 'philippines'].includes(spaceId)) {
        bonus += 10;
      }
    }
  }

  // --- Total War: minor power awareness ---
  const tw = getTWContext();
  if (tw) {
    const isEarly = state.round <= 5;
    const frenchHere = tw.frenchArmies.some((p) => p.spaceId === spaceId);
    const chineseHere = tw.chineseArmies.some((p) => p.spaceId === spaceId);

    // Germany/Italy: PRIORITY #1 — spaces with French armies must be taken
    if (country === Country.GERMANY || country === Country.ITALY) {
      if (frenchHere) {
        bonus += 40;  // massive priority on French army positions
        if (spaceId === 'western_europe') bonus += 20;  // WE is the key battleground
      }
      if (isEarly && tw.frenchArmies.length > 0) {
        // Early urgency: western_europe is a priority regardless of French position
        if (spaceId === 'western_europe') bonus += 15;
      }
      // After France is eliminated, occupy WE supply space ASAP to deny Allies VP
      if (tw.frenchArmies.length === 0 && spaceId === 'western_europe') {
        const axisInWE = getAllPieces(state).some(
          (p) => p.spaceId === 'western_europe' && getTeam(p.country) === Team.AXIS
        );
        if (!axisInWE) bonus += 30;  // empty WE = massive build priority
      }
    }

    // Japan: PRIORITY #1 — spaces with Chinese armies must be taken
    if (country === Country.JAPAN) {
      if (chineseHere) {
        bonus += 40;  // massive priority on Chinese army positions
        if (spaceId === 'china' || spaceId === 'szechuan') bonus += 20;
      }
      if (isEarly && tw.chineseArmies.length > 0) {
        if (spaceId === 'china' || spaceId === 'szechuan') bonus += 15;
      }
      // After China is eliminated, occupy China/Szechuan supply spaces ASAP
      if (tw.chineseArmies.length === 0 && (spaceId === 'china' || spaceId === 'szechuan')) {
        const axisInSpace = getAllPieces(state).some(
          (p) => p.spaceId === spaceId && getTeam(p.country) === Team.AXIS
        );
        if (!axisInSpace) bonus += 30;  // empty supply space = massive build priority
      }
    }

    // UK: defend French armies — stay near them, protect western_europe
    if (country === Country.UK) {
      if (frenchHere) bonus += 12;  // defend spaces with French armies
      if (spaceId === 'western_europe' && tw.frenchArmies.some((p) => p.spaceId === 'western_europe')) {
        bonus += 10;
      }
      // If Government in Exile active (franceHomeIsUK), UK home becomes supply for France
      if (tw.franceHomeIsUK && spaceId === 'united_kingdom') bonus += 8;
      // Africa for Senegalese Tirailleurs supply route
      if (spaceId === 'africa' && tw.frenchArmies.length > 0) bonus += 6;
    }

    // USA: defend Chinese armies
    if (country === Country.USA) {
      if (chineseHere) bonus += 8;
    }
  }

  return bonus;
}

// ---------------------------------------------------------------------------
// AI: decide whether to activate a build reaction (Loyal to Crown, Kamikaze,
// Rasputitsa, Defense of Motherland, Axis Alliance)
// ---------------------------------------------------------------------------
export function aiShouldActivateBuildReaction(
  state: GameState,
  responseCard: Card,
  buildSpaceId: string,
  responseCountry: Country
): boolean {
  const hasEliminate = responseCard.effects.some(
    (e) => e.type === 'ELIMINATE_ARMY' || e.type === 'ELIMINATE_NAVY'
  );
  if (hasEliminate) return true;

  const hasBuild = responseCard.effects.some((e) => e.type === 'BUILD_ARMY');
  if (hasBuild) {
    const avail = getAvailablePieces(responseCountry, state);
    return avail.armies > 0;
  }

  return true;
}

// ---------------------------------------------------------------------------
// AI: decide whether to activate a battle reaction (Romanian Reinforcements)
// ---------------------------------------------------------------------------
export function aiShouldActivateBattleReaction(
  state: GameState,
  responseCard: Card,
  responseCountry: Country
): boolean {
  const avail = getAvailablePieces(responseCountry, state);
  return avail.armies > 0;
}

// ---------------------------------------------------------------------------
// AI: decide whether to activate card cancellation (Battle of Britain)
// ---------------------------------------------------------------------------
export function aiShouldActivateCardCancel(
  state: GameState,
  cancelledCard: Card
): boolean {
  if (cancelledCard.type === CardType.EVENT) return true;
  if (cancelledCard.type === CardType.LAND_BATTLE || cancelledCard.type === CardType.SEA_BATTLE)
    return true;
  return false;
}

interface AiDecision {
  cardIndex: number;
  targetSpace?: string;
  discardIndices?: number[];
}

function getEffectiveSupplySpaces(country: Country, state: GameState): string[] {
  // Only starred board supply spaces give VP — card-granted supply (Szechuan/Truk) does not.
  let spaces = [...SUPPLY_SPACE_IDS];
  if (state.supplyMarkers.scorched_earth_ukraine && getTeam(country) === Team.AXIS) {
    spaces = spaces.filter((s) => s !== 'ukraine');
  }
  return spaces;
}

function getVPTargetSpaces(country: Country, state: GameState): Map<string, number> {
  const targets = new Map<string, number>();
  const team = getTeam(country);
  const allCountries = TURN_ORDER.filter((c) => getTeam(c) === team);

  for (const c of allCountries) {
    for (const card of state.countries[c].statusCards) {
      for (const eff of card.effects) {
        if (eff.type !== 'VP_PER_CONDITION' || !eff.condition) continue;
        const amt = eff.amount ?? 1;
        const spaces = getConditionTargetSpaces(eff.condition, c);
        for (const s of spaces) {
          targets.set(s, (targets.get(s) ?? 0) + amt);
        }
      }
    }
  }
  return targets;
}

function getConditionTargetSpaces(condition: string, country: Country): string[] {
  switch (condition) {
    case 'army_in_ukraine_kazakhstan_russia':
      return ['ukraine', 'kazakhstan', 'russia'];
    case 'swedish_iron_ore':
      return ['scandinavia', 'baltic'];
    case 'mackenzie_king':
      return ['canada', 'north_atlantic'];
    case 'army_in_iwo_jima_or_philippines':
      return ['iwo_jima', 'philippines'];
    case 'army_in_hawaii_pnw_nz':
      return ['hawaii', 'pacific_northwest', 'new_zealand'];
    case 'army_in_indonesia_ng_sea':
      return ['indonesia', 'new_guinea', 'southeast_asia'];
    case 'army_in_russia_or_ukraine':
      return ['russia', 'ukraine'];
    case 'army_in_balkans':
      return ['balkans'];
    case 'axis_army_in_africa_me':
      return ['north_africa', 'africa', 'middle_east'];
    case 'italian_navy_count':
      return [];
    case 'no_allied_army_hawaii':
      return [];
    default:
      return [];
  }
}

function bfsDistanceToNearestSupply(
  fromId: string,
  country: Country,
  state: GameState,
  maxDist: number = 5
): number {
  const team = getTeam(country);
  const allPieces = getAllPieces(state);
  const teamPieces = allPieces.filter((p) => getTeam(p.country) === team);
  const effectiveSupply = getEffectiveSupplySpaces(country, state);
  const teamOccupiedSupply = new Set(
    teamPieces.filter((p) => effectiveSupply.includes(p.spaceId)).map((p) => p.spaceId)
  );

  const targets = effectiveSupply.filter((s) => {
    if (teamOccupiedSupply.has(s)) return false;
    const sp = getSpace(s);
    if (!sp) return false;
    if (sp.type === SpaceType.SEA) return false;
    return true;
  });

  if (targets.length === 0) return maxDist + 1;

  const visited = new Set<string>([fromId]);
  let frontier = [fromId];
  for (let dist = 1; dist <= maxDist; dist++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const adj of getAdjacentSpaces(id)) {
        if (visited.has(adj)) continue;
        visited.add(adj);
        if (targets.includes(adj)) return dist;
        next.push(adj);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return maxDist + 1;
}

function scoreSpace(spaceId: string, country: Country, state: GameState, vpTargets?: Map<string, number>): number {
  const space = getSpace(spaceId);
  if (!space) return 0;
  let score = 0;

  const effectiveSupply = getEffectiveSupplySpaces(country, state);
  const isEffectivelySupply = effectiveSupply.includes(spaceId);
  if (isEffectivelySupply) score += 15;

  if (space.homeCountry !== undefined) score += 5;
  const enemyTeam = getEnemyTeam(country);
  const enemyHomeSpaces = TURN_ORDER
    .filter((c) => getTeam(c) === enemyTeam)
    .map((c) => HOME_SPACES[c]);
  // Controlling an enemy home space is the highest-value target — it zeros
  // their VP and is devastating strategically (e.g. taking Moscow, London).
  if (enemyHomeSpaces.includes(spaceId)) score += 30;
  if (spaceId === HOME_SPACES[country]) score += 25;

  const distToSupply = bfsDistanceToNearestSupply(spaceId, country, state);
  if (distToSupply <= 5) {
    score += Math.max(0, 12 - distToSupply * 2);
  }

  const targets = vpTargets ?? getVPTargetSpaces(country, state);
  const vpValue = targets.get(spaceId) ?? 0;
  if (vpValue > 0) {
    score += vpValue * 8;
    const countryPieces = state.countries[country].piecesOnBoard;
    if (!countryPieces.some((p) => p.spaceId === spaceId)) {
      score += 5;
    }
  }

  for (const [tgt, amt] of targets) {
    if (tgt === spaceId) continue;
    const adj = getAdjacentSpaces(spaceId);
    if (adj.includes(tgt)) {
      const countryPieces = state.countries[country].piecesOnBoard;
      if (!countryPieces.some((p) => p.spaceId === tgt)) {
        score += amt * 4;
      }
    }
  }

  score += getCountrySpaceBonus(spaceId, country, state);

  return score;
}

// ---------------------------------------------------------------------------
// Hard AI: penalty for attacking spaces defended by countries with responses
// ---------------------------------------------------------------------------
function getResponsePenaltyForTargets(
  targets: string[],
  country: Country,
  state: GameState
): number {
  if (targets.length === 0) return 0;
  const enemyTeam = getEnemyTeam(country);
  const allPieces = getAllPieces(state);
  let totalPenalty = 0;

  for (const spaceId of targets) {
    const defenders = allPieces.filter(
      (p) => p.spaceId === spaceId && getTeam(p.country) === enemyTeam
    );
    for (const d of defenders) {
      totalPenalty += state.countries[d.country].responseCards.length * 3;
    }
  }
  return Math.floor(totalPenalty / targets.length);
}

// ---------------------------------------------------------------------------
// Hard AI: score status cards based on board state
// ---------------------------------------------------------------------------
function scoreStatusCardHard(card: Card, country: Country, state: GameState): number {
  const cState = state.countries[country];
  const active = cState.statusCards;

  if (active.some((c) => c.name === card.name)) return -5;

  let score = 10;
  score -= Math.min(active.length * 2, 6);

  const vpEffects = card.effects.filter((e) => e.type === 'VP_PER_CONDITION');
  if (vpEffects.length > 0) {
    score += 6;
    for (const eff of vpEffects) {
      if (eff.condition) {
        const met = evaluateVPCondition(eff.condition, country, state);
        if (met > 0) score += met * 4;
      }
    }
  }

  const battleEnhance = card.effects.some((e) => e.type === 'ADDITIONAL_BATTLE');
  if (battleEnhance) {
    score += Math.min(cState.piecesOnBoard.length, 5);
    if (active.some((c) => c.effects.some((e) => e.type === 'ADDITIONAL_BATTLE'))) score -= 3;
  }

  const buildEffects = card.effects.filter(
    (e) => e.type === 'BUILD_ARMY' || e.type === 'BUILD_NAVY'
  );
  if (buildEffects.length > 0) {
    const avail = getAvailablePieces(country, state);
    if (avail.armies > 0 || avail.navies > 0) score += 3;
    else score -= 4;
  }

  if (card.effects.some((e) => e.type === 'SUPPLY_MARKER')) score += 8;

  return Math.max(score, -5);
}

// ---------------------------------------------------------------------------
// Hard AI: score response cards based on threat level
// ---------------------------------------------------------------------------
function scoreResponseCardHard(card: Card, country: Country, state: GameState): number {
  const cState = state.countries[country];
  let score = 8;

  score -= Math.min(cState.responseCards.length * 3, 9);

  const enemyTeam = getEnemyTeam(country);
  const allPieces = getAllPieces(state);
  const homeSpace = HOME_SPACES[country];
  const homeAdj = getAdjacentSpaces(homeSpace);
  const enemyNearHome = allPieces.filter(
    (p) =>
      getTeam(p.country) === enemyTeam &&
      (p.spaceId === homeSpace || homeAdj.includes(p.spaceId))
  ).length;
  score += enemyNearHome * 3;

  const protectEffects = card.effects.filter((e) => e.type === 'PROTECT_PIECE');
  if (protectEffects.length > 0) {
    const protectedSpaces = protectEffects.flatMap((e) => e.where ?? []);
    const hasPieceThere = protectedSpaces.some((s) =>
      cState.piecesOnBoard.some((p) => p.spaceId === s)
    );
    if (hasPieceThere) score += 4;
    else if (protectedSpaces.length > 0) score -= 2;
  }

  return Math.max(score, -2);
}

// ---------------------------------------------------------------------------
// Hard AI: score economic warfare based on enemy deck state
// ---------------------------------------------------------------------------
function scoreEconomicWarfareHard(card: Card, country: Country, state: GameState): number {
  const enemyTeam = getEnemyTeam(country);
  const enemies = TURN_ORDER.filter((c) => getTeam(c) === enemyTeam);
  let score = 5;

  const avgCards =
    enemies.reduce(
      (sum, c) => sum + state.countries[c].deck.length + state.countries[c].hand.length,
      0
    ) / enemies.length;

  if (avgCards < 10) score += 5;
  else if (avgCards < 20) score += 2;

  const hasEWCounter = enemies.some((c) =>
    state.countries[c].responseCards.some((r) =>
      r.effects.some((e) => e.condition === 'on_ew_discard')
    )
  );
  if (hasEWCounter) score -= 4;

  return score;
}

// ---------------------------------------------------------------------------
// Hard AI: score event cards — penalize builds that would be out of supply
// ---------------------------------------------------------------------------
function scoreEventCardHard(card: Card, country: Country, state: GameState): number {
  let score = 8;
  const buildEffects = card.effects.filter(
    (e) => (e.type === 'BUILD_ARMY' || e.type === 'RECRUIT_ARMY' ||
            e.type === 'BUILD_NAVY' || e.type === 'RECRUIT_NAVY') && e.where && e.where.length > 0
  );
  if (buildEffects.length === 0) return score;

  const effectCountry = buildEffects[0].country ?? country;
  const cs = state.countries[effectCountry];

  for (const effect of buildEffects) {
    const pieceType = (effect.type === 'BUILD_ARMY' || effect.type === 'RECRUIT_ARMY') ? 'army' : 'navy';
    const targets = effect.where!;
    let anyWouldSurvive = false;

    for (const spaceId of targets) {
      const hypothetical: Piece = { id: '__hypo__', country: effectCountry, type: pieceType, spaceId };
      const hypoState: GameState = {
        ...state,
        countries: {
          ...state.countries,
          [effectCountry]: {
            ...cs,
            piecesOnBoard: [...cs.piecesOnBoard, hypothetical],
          },
        },
      };
      if (isInSupply(hypothetical, hypoState)) {
        anyWouldSurvive = true;
        break;
      }
    }
    if (!anyWouldSurvive) score -= 12;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Card scoring — difficulty-aware
// ---------------------------------------------------------------------------
function scoreCard(
  card: Card,
  state: GameState,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium'
): number {
  const country = card.country;
  const available = getAvailablePieces(country, state);
  const isHard = difficulty === 'hard';
  const round = state.round;
  const isEarly = round <= 5;
  const isMid = round > 5 && round <= 12;

  const countryBonus = (difficulty !== 'easy')
    ? getCountryCardBonus(card, country, state, round)
    : 0;

  // ---------------------------------------------------------------------------
  // VP Urgency: shift strategy based on how close either team is to sudden
  // victory (±30 VP gap). When the gap is large, prioritise VP-generating cards
  // (events, EW, status VP). When small, invest in board position (builds,
  // battles). Applied to medium & hard difficulty only.
  // ---------------------------------------------------------------------------
  let vpBoost = 0;   // bonus applied to VP-generating cards
  let posBoost = 0;  // bonus applied to board-position cards
  if (difficulty !== 'easy') {
    const team = getTeam(country);
    const vpGap = team === Team.AXIS
      ? state.axisVP - state.alliesVP
      : state.alliesVP - state.axisVP;    // positive = winning
    const urgency = Math.min(Math.abs(vpGap) / 30, 1);  // 0..1
    const losing = vpGap < 0;

    // High urgency (gap ≥ 15): push for VP to win or catch up
    vpBoost = urgency * 12;                              // max +12
    // Low urgency (gap < 9): invest in board position
    posBoost = Math.max(0, (1 - urgency) * 8);           // max +8 when even

    // When losing, extra urgency for VP cards and penalty on slow builds
    if (losing) {
      vpBoost += urgency * 6;                             // extra +6 max
      posBoost = Math.max(0, posBoost - urgency * 4);     // reduce position bonus
    }
  }

  switch (card.type) {
    case CardType.BUILD_ARMY: {
      if (available.armies <= 0) return -5;
      const locations = getValidBuildLocations(country, 'army', state);
      if (locations.length === 0) return -5;
      const vpTargets = isHard ? getVPTargetSpaces(country, state) : undefined;
      let score = 5 + Math.max(...locations.map((l) => scoreSpace(l, country, state, vpTargets)));
      if (isHard && isEarly) score += 8;
      else if (isHard && isMid) score += 3;
      score += posBoost;

      // TW: Axis MUST build toward minor power armies if they can't currently reach them.
      // This is the "reallocate resources" logic — when land battle can't reach France/China,
      // building an army to get adjacent is the top priority.
      if (difficulty !== 'easy') {
        const twBuild = getTWContext();
        if (twBuild) {
          const myArmies = state.countries[country].piecesOnBoard.filter((p) => p.type === 'army');
          if ((country === Country.GERMANY || country === Country.ITALY) && twBuild.frenchArmies.length > 0) {
            const canReach = twBuild.frenchArmies.some((mp) =>
              myArmies.some((a) => getAdjacentSpaces(a.spaceId).includes(mp.spaceId))
            );
            if (!canReach) {
              // Can't battle France yet — building toward it is critical
              const canBuildAdjacent = twBuild.frenchArmies.some((mp) =>
                locations.some((loc) => loc === mp.spaceId || getAdjacentSpaces(loc).includes(mp.spaceId))
              );
              score += canBuildAdjacent ? 40 : 15;
            }
          }
          if (country === Country.JAPAN && twBuild.chineseArmies.length > 0) {
            const canReach = twBuild.chineseArmies.some((mp) =>
              myArmies.some((a) => getAdjacentSpaces(a.spaceId).includes(mp.spaceId))
            );
            if (!canReach) {
              const canBuildAdjacent = twBuild.chineseArmies.some((mp) =>
                locations.some((loc) => loc === mp.spaceId || getAdjacentSpaces(loc).includes(mp.spaceId))
              );
              score += canBuildAdjacent ? 40 : 15;
            }
          }
        }
      }

      return score + countryBonus;
    }
    case CardType.BUILD_NAVY: {
      if (available.navies <= 0) return -5;
      const locations = getValidBuildLocations(country, 'navy', state);
      if (locations.length === 0) return -5;
      // Only count sea spaces that have an adjacent friendly army on land;
      // unsupported navies are immediately eliminated so they're worthless.
      const navyTeamPieces = getAllPieces(state).filter((p) => getTeam(p.country) === getTeam(country));
      const supportedLocations = locations.filter((spaceId) => {
        const sp = getSpace(spaceId);
        if (sp?.type !== SpaceType.SEA) return true;
        return getAdjacentSpaces(spaceId).some((adjId) => {
          const adjSp = getSpace(adjId);
          return adjSp?.type === SpaceType.LAND &&
            navyTeamPieces.some((p) => p.spaceId === adjId && p.type === 'army');
        });
      });
      if (supportedLocations.length === 0) return -5;
      const vpTargetsNav = isHard ? getVPTargetSpaces(country, state) : undefined;
      let score = 4 + Math.max(supportedLocations.length, ...supportedLocations.map((l) => scoreSpace(l, country, state, vpTargetsNav)));
      if (isHard && isEarly) score += 8;
      else if (isHard && isMid) score += 3;
      score += posBoost;
      return score + countryBonus;
    }
    case CardType.LAND_BATTLE: {
      // Filter to only spaces that actually have an enemy army — getValidBattleTargets
      // may include empty adjacent spaces when status cards like Blitzkrieg are active.
      const allLandTargets = getValidBattleTargets(country, 'land', state);
      const landEnemyTeam = getEnemyTeam(country);
      // Include minor power pieces so French/Chinese armies count as valid targets
      const landAllPieces = getAllPiecesWithMinorPowers(state);
      const targets = allLandTargets.filter((t) =>
        landAllPieces.some((p) => p.spaceId === t && p.type === 'army' && getTeam(p.country) === landEnemyTeam)
      );
      if (targets.length === 0) return -3;
      let score = 12 + Math.max(...targets.map((t) => scoreSpace(t, country, state)));
      if (isHard) score -= getResponsePenaltyForTargets(targets, country, state);

      // Status cards that trigger off land battles make battling much more
      // valuable — e.g. Blitzkrieg (build after battle), Bias for Action
      // (extra battle after build), Dive Bombers (extra battle), Amphibious
      // Landings (build army if adjacent to navy). Battle effectively
      // becomes battle + build + battle chain.
      const activeStatuses = state.countries[country].statusCards;
      const hasBuildAfterLandBattle = activeStatuses.some((c) =>
        c.effects.some((e) => e.type === 'BUILD_AFTER_BATTLE' && (e.condition === 'land_battle' || e.condition === 'adjacent_to_us_navy'))
      );
      const hasAdditionalLandBattle = activeStatuses.some((c) =>
        c.effects.some((e) => e.type === 'ADDITIONAL_BATTLE')
      );
      if (hasBuildAfterLandBattle) score += 15;  // battle = battle + free build
      if (hasAdditionalLandBattle) score += 10;  // battle = battle + extra battle

      // Battling on enemy home spaces is critical — zeros their VP score
      const landEnemyHomes = TURN_ORDER
        .filter((c) => getTeam(c) === landEnemyTeam)
        .map((c) => HOME_SPACES[c]);
      const canHitHome = targets.some((t) => landEnemyHomes.includes(t));
      if (canHitHome) score += 20;

      // Defensive value: enemies adjacent to our home or supply spaces must be
      // eliminated to keep our position safe. E.g. USSR battling in Balkans
      // from Ukraine to keep Ukraine safe.
      const myPieces = state.countries[country].piecesOnBoard;
      for (const t of targets) {
        const adjToEnemy = getAdjacentSpaces(t);
        for (const mp of myPieces) {
          if (!adjToEnemy.includes(mp.spaceId)) continue;
          if (mp.spaceId === HOME_SPACES[country]) score += 15;
          if (getSpace(mp.spaceId)?.isSupplySpace) score += 8;
        }
      }

      score += posBoost;
      return score + countryBonus;
    }
    case CardType.SEA_BATTLE: {
      // Filter to only spaces that actually have an enemy navy.
      const allSeaTargets = getValidBattleTargets(country, 'sea', state);
      const seaEnemyTeam = getEnemyTeam(country);
      const seaAllPieces = getAllPieces(state);
      const targets = allSeaTargets.filter((t) =>
        seaAllPieces.some((p) => p.spaceId === t && p.type === 'navy' && getTeam(p.country) === seaEnemyTeam)
      );
      if (targets.length === 0) return -3;
      let score = 10 + targets.length;
      if (isHard) score -= getResponsePenaltyForTargets(targets, country, state);

      // Status cards that trigger off sea battles (Aircraft Carriers = build
      // navy after battle, Destroyer Transport = build armies adjacent)
      const seaActiveStatuses = state.countries[country].statusCards;
      const hasBuildAfterSeaBattle = seaActiveStatuses.some((c) =>
        c.effects.some((e) => e.type === 'BUILD_AFTER_BATTLE' && e.condition === 'sea_battle')
      );
      if (hasBuildAfterSeaBattle) score += 15;  // battle = battle + free build

      // Response cards that trigger off sea battles (Destroyer Transport, Surprise Attack)
      const seaActiveResponses = state.countries[country].responseCards;
      const hasBuildOnSeaBattle = seaActiveResponses.some((c) =>
        c.effects.some((e) => (e.type === 'BUILD_ARMY' || e.type === 'SEA_BATTLE' || e.type === 'LAND_BATTLE'))
      );
      if (hasBuildOnSeaBattle) score += 12;

      // Defensive value: enemy navies threatening our supply lines or home
      // adjacency must be cleared. E.g. Japan sea battling to keep Sea of
      // Japan safe, UK clearing North Sea to protect home.
      const seaMyPieces = state.countries[country].piecesOnBoard;
      for (const t of targets) {
        const seaAdjToEnemy = getAdjacentSpaces(t);
        for (const mp of seaMyPieces) {
          if (!seaAdjToEnemy.includes(mp.spaceId)) continue;
          if (mp.spaceId === HOME_SPACES[country]) score += 15;
          if (getSpace(mp.spaceId)?.isSupplySpace) score += 8;
        }
        // Enemy navy in a sea adjacent to our home is a direct threat
        if (seaAdjToEnemy.includes(HOME_SPACES[country])) score += 12;
      }

      score += posBoost;
      return score + countryBonus;
    }
    case CardType.STATUS: {
      let score = isHard ? scoreStatusCardHard(card, country, state) : 12;
      if (isHard && isEarly) score += 6;
      else if (isHard && isMid) score += 2;
      // VP-generating status cards get urgency boost
      const hasVPEffect = card.effects.some((e) => e.type === 'VP_PER_CONDITION');
      if (hasVPEffect) score += vpBoost;
      return score + countryBonus;
    }
    case CardType.RESPONSE: {
      let score = isHard ? scoreResponseCardHard(card, country, state) : 10;
      if (isHard && isEarly) score += 4;
      return score + countryBonus;
    }
    case CardType.EVENT: {
      let score = isHard ? scoreEventCardHard(card, country, state) : 8;
      if (isHard) {
        const hasBuildEffect = card.effects.some(
          (e) => e.type === 'BUILD_ARMY' || e.type === 'RECRUIT_ARMY' ||
                 e.type === 'BUILD_NAVY' || e.type === 'RECRUIT_NAVY' ||
                 e.type === 'BUILD_ALLY_ARMY'
        );
        if (isEarly && !hasBuildEffect) score -= 6;
        else if (isEarly && hasBuildEffect) score += 4;
      }
      // Events with VP effects get urgency boost; build-only events get position boost
      const hasVPEventEffect = card.effects.some(
        (e) => e.type === 'SCORE_VP' || e.type === 'DISCARD_CARDS'
      );
      if (hasVPEventEffect) score += vpBoost;
      else score += posBoost * 0.5;
      return score + countryBonus;
    }
    case CardType.ECONOMIC_WARFARE: {
      let score = isHard ? scoreEconomicWarfareHard(card, country, state) : 6;
      if (isHard && isEarly) score -= 8;
      else if (isHard && isMid) score -= 3;
      score += vpBoost;
      return score + countryBonus;
    }
    default:
      return countryBonus;
  }
}

// ---------------------------------------------------------------------------
// pickWorstPieceToRemove — returns the pieceId of the least-valuable piece
// (lowest scoreSpace) from a list of on-board pieces. Used when a country
// must redeploy and needs to decide which piece to sacrifice.
// ---------------------------------------------------------------------------
export function pickWorstPieceToRemove(
  pieces: { pieceId: string; spaceId: string }[],
  country: Country,
  state: GameState
): string {
  if (pieces.length === 0) return '';
  let worstId = pieces[0].pieceId;
  let worstScore = Infinity;
  for (const p of pieces) {
    const s = scoreSpace(p.spaceId, country, state);
    if (s < worstScore) {
      worstScore = s;
      worstId = p.pieceId;
    }
  }
  return worstId;
}

// ---------------------------------------------------------------------------
// aiShouldSkipRedeploy — returns true if the AI should skip a redeploy
// (all on-board pieces are too valuable to sacrifice for a new build).
// Easy AI never skips; medium/hard skip if even the least-valuable piece
// has a high scoreSpace value.
// ---------------------------------------------------------------------------
export function aiShouldSkipRedeploy(
  pieces: { pieceId: string; spaceId: string }[],
  country: Country,
  state: GameState,
  difficulty: 'easy' | 'medium' | 'hard'
): boolean {
  if (difficulty === 'easy') return false;
  if (pieces.length === 0) return true;

  let worstScore = Infinity;
  for (const p of pieces) {
    const s = scoreSpace(p.spaceId, country, state);
    if (s < worstScore) worstScore = s;
  }
  // Higher threshold = more willing to sacrifice (skips less often)
  const threshold = difficulty === 'hard' ? 20 : 15;
  return worstScore > threshold;
}

// ---------------------------------------------------------------------------
// aiBestPieceToEliminate – when an AI attacker faces multiple enemy pieces in
// the same space, pick the one that is most costly for the enemy to lose.
// Higher priority goes to pieces with the fewest reserves (harder to replace).
// ---------------------------------------------------------------------------
export function aiBestPieceToEliminate(pieces: Piece[], state: GameState): Piece {
  if (pieces.length === 0) throw new Error('aiBestPieceToEliminate: empty list');
  if (pieces.length === 1) return pieces[0];

  // Check for minor power virtual pieces — these have IDs starting with "mp_"
  // and should be prioritized since they score VP and can't be saved by Air Defense
  const tw = getTWContext();

  let bestPiece = pieces[0];
  let bestScore = -Infinity;

  for (const p of pieces) {
    let score = 0;

    // Minor power virtual pieces (French/Chinese) get massive priority —
    // they score VP every turn and are harder to rebuild
    if (tw && p.id.startsWith('mp_')) {
      score += 50;  // always prefer eliminating minor power pieces
    } else {
      const cs = state.countries[p.country];

      // Fewer reserves of this piece type → harder for the enemy to replace → higher value
      const totalOfType = cs.piecesOnBoard.filter((pb) => pb.type === p.type).length;
      const maxOfType =
        p.type === 'army' ? COUNTRY_PIECES[p.country].armies : COUNTRY_PIECES[p.country].navies;
      const reserve = maxOfType - totalOfType;
      score -= reserve; // lower reserve → less penalty → higher score

      // Slight bonus for navies (generally rarer and harder to build)
      if (p.type === 'navy') score += 1;

      // Prefer pieces from countries with more pieces on board (more strategically active)
      score += cs.piecesOnBoard.length;
    }

    if (score > bestScore) {
      bestScore = score;
      bestPiece = p;
    }
  }

  return bestPiece;
}

export function pickBestBuildLocation(
  validSpaces: string[],
  country: Country,
  state: GameState,
  difficulty: 'easy' | 'medium' | 'hard'
): string {
  if (validSpaces.length === 0) return '';

  const allPieces = getAllPieces(state);
  const team = getTeam(country);
  const enemyTeam = getEnemyTeam(country);
  const teamPieces = allPieces.filter((p) => getTeam(p.country) === team);
  const countryPieces = state.countries[country].piecesOnBoard;

  // Pre-filter: a navy in a sea space requires at least one adjacent friendly
  // team army on land to remain in supply. Exclude sea spaces that fail this
  // check — building there results in immediate supply elimination.
  const candidates = validSpaces.filter((spaceId) => {
    const sp = getSpace(spaceId);
    if (sp?.type !== SpaceType.SEA) return true; // land spaces are always fine
    return getAdjacentSpaces(spaceId).some((adjId) => {
      const adjSp = getSpace(adjId);
      return adjSp?.type === SpaceType.LAND &&
        teamPieces.some((p) => p.spaceId === adjId && p.type === 'army');
    });
  });
  // Fall back to the full list only if every location was filtered out (edge case)
  const spaces = candidates.length > 0 ? candidates : validSpaces;

  if (difficulty === 'easy') {
    return spaces[Math.floor(Math.random() * spaces.length)];
  }

  const vpTargets = getVPTargetSpaces(country, state);
  const effectiveSupply = getEffectiveSupplySpaces(country, state);
  let bestSpace = spaces[0];
  let bestScore = -Infinity;

  for (const spaceId of spaces) {
    const sp = getSpace(spaceId);
    const isEffSupply = effectiveSupply.includes(spaceId);
    let score = scoreSpace(spaceId, country, state, vpTargets);

    if (difficulty === 'hard' || difficulty === 'medium') {
      const adj = getAdjacentSpaces(spaceId);
      const hasTeamNeighbor = adj.some((a) => teamPieces.some((p) => p.spaceId === a));
      if (hasTeamNeighbor) score += 3;

      const ownSupplyCount = effectiveSupply.filter((s) =>
        countryPieces.some((p) => p.spaceId === s)
      ).length;
      if (ownSupplyCount === 0 && spaceId === HOME_SPACES[country]) score += 10;

      const allyPieceHere = allPieces.some(
        (p) => p.spaceId === spaceId && getTeam(p.country) === team && p.country !== country
      );
      if (allyPieceHere) {
        score -= isEffSupply ? 25 : 15;
      }

      if (isEffSupply) {
        const enemyHere = allPieces.some(
          (p) => p.spaceId === spaceId && getTeam(p.country) === enemyTeam
        );
        if (!enemyHere) score += 10;
      }

      const adjSupplyCount = adj.filter((a) => {
        return effectiveSupply.includes(a) && getSpace(a)?.type === SpaceType.LAND &&
          !teamPieces.some((p) => p.spaceId === a);
      }).length;
      score += adjSupplyCount * 6;

      const adjLandCount = adj.filter((a) => getSpace(a)?.type === SpaceType.LAND).length;
      if (adjLandCount <= 1 && !sp?.isSupplySpace) score -= 5;

      if (sp?.type === SpaceType.SEA) {
        const adjFriendlyLand = adj.filter((a) => {
          const asp = getSpace(a);
          return asp?.type === SpaceType.LAND && countryPieces.some((p) => p.spaceId === a);
        }).length;
        score += adjFriendlyLand * 8;

        const adjTeamLand = adj.filter((a) => {
          const asp = getSpace(a);
          return asp?.type === SpaceType.LAND && teamPieces.some((p) => p.spaceId === a);
        }).length;
        score += adjTeamLand * 4;

        const adjEnemyLand = adj.filter((a) => {
          const asp = getSpace(a);
          return asp?.type === SpaceType.LAND && allPieces.some((p) => p.spaceId === a && getTeam(p.country) === enemyTeam);
        }).length;
        score += adjEnemyLand * 5;

        const adjHomeLand = adj.filter((a) => {
          const asp = getSpace(a);
          return asp?.type === SpaceType.LAND && asp.homeCountry === country;
        }).length;
        score += adjHomeLand * 6;

        score += adj.length;
      }
    }

    // --- Total War: minor power build awareness ---
    const twBuild = getTWContext();
    if (twBuild) {
      const adj = getAdjacentSpaces(spaceId);

      // Germany/Italy: PRIORITY — build adjacent to French armies to attack them next turn
      if (country === Country.GERMANY || country === Country.ITALY) {
        const adjToFrench = twBuild.frenchArmies.some(
          (p) => p.spaceId === spaceId || adj.includes(p.spaceId)
        );
        if (adjToFrench) score += 35;
        // Extra bonus for building in WE when France is there
        if (spaceId === 'western_europe' &&
            twBuild.frenchArmies.some((p) => p.spaceId === 'western_europe')) {
          score += 20;
        }
      }

      // Japan: PRIORITY — build adjacent to Chinese armies to attack them next turn
      if (country === Country.JAPAN) {
        const adjToChinese = twBuild.chineseArmies.some(
          (p) => p.spaceId === spaceId || adj.includes(p.spaceId)
        );
        if (adjToChinese) score += 35;
        // Extra bonus for building in China/Szechuan when Chinese armies present
        if ((spaceId === 'china' || spaceId === 'szechuan') &&
            twBuild.chineseArmies.some((p) => p.spaceId === 'china' || p.spaceId === 'szechuan')) {
          score += 20;
        }
      }

      // Germany/Italy: after France eliminated, occupy WE supply space immediately
      if ((country === Country.GERMANY || country === Country.ITALY) &&
          twBuild.frenchArmies.length === 0 && spaceId === 'western_europe') {
        const axisInWE = allPieces.some(
          (p) => p.spaceId === 'western_europe' && getTeam(p.country) === Team.AXIS
        );
        if (!axisInWE) score += 40;  // empty WE supply = top build priority
      }

      // Japan: after China eliminated, occupy China/Szechuan supply spaces immediately
      if (country === Country.JAPAN && twBuild.chineseArmies.length === 0 &&
          (spaceId === 'china' || spaceId === 'szechuan')) {
        const axisInSpace = allPieces.some(
          (p) => p.spaceId === spaceId && getTeam(p.country) === Team.AXIS
        );
        if (!axisInSpace) score += 40;  // empty supply = top build priority
      }

      // UK: build near French armies to defend them, but avoid sharing WE supply
      if (country === Country.UK) {
        const nearFrench = twBuild.frenchArmies.some(
          (p) => p.spaceId === spaceId || adj.includes(p.spaceId)
        );
        if (nearFrench) score += 8;
        // Avoid sharing western_europe supply space with France (VP sharing penalty)
        if (spaceId === 'western_europe' &&
            twBuild.frenchArmies.some((p) => p.spaceId === 'western_europe')) {
          score -= 10;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSpace = spaceId;
    }
  }
  return bestSpace;
}

export function pickBestBattleTarget(
  validTargets: string[],
  country: Country,
  state: GameState,
  difficulty: 'easy' | 'medium' | 'hard'
): string {
  if (validTargets.length === 0) return '';
  if (difficulty === 'easy') {
    return validTargets[Math.floor(Math.random() * validTargets.length)];
  }

  // Include minor power pieces so AI can see French/Chinese armies as valid targets
  const allPieces = getAllPiecesWithMinorPowers(state);
  const enemyTeam = getEnemyTeam(country);
  const vpTargets = getVPTargetSpaces(country, state);
  let bestTarget = validTargets[0];
  let bestScore = -Infinity;

  for (const spaceId of validTargets) {
    let score = scoreSpace(spaceId, country, state, vpTargets);
    const enemyPiecesHere = allPieces.filter(
      (p) => p.spaceId === spaceId && getTeam(p.country) === enemyTeam
    );

    // Never pick a space with no enemy — battling an empty space wastes the card.
    // getValidBattleTargets() may include empty spaces when status cards like
    // Blitzkrieg are active (to support chain-build mechanics), but the actual
    // battle resolution always skips spaces without enemy pieces.
    if (enemyPiecesHere.length === 0) continue;

    for (const piece of enemyPiecesHere) {
      if (piece.spaceId === HOME_SPACES[piece.country]) score += 20;
      if (getSpace(spaceId)?.isSupplySpace) score += 8;

      if (difficulty === 'hard') {
        const defenderResponses = state.countries[piece.country].responseCards.length;
        score -= defenderResponses * 4;

        const protectResponses = state.countries[piece.country].responseCards.filter((r) =>
          r.effects.some(
            (e) => e.type === 'PROTECT_PIECE' && (!e.where || e.where.includes(spaceId))
          )
        );
        score -= protectResponses.length * 6;
      }
    }

    // Country-specific battle priorities
    if (country === Country.GERMANY) {
      if (GERMANY_EAST_CHAIN.has(spaceId)) score += 10;
      // Defensive: battle enemies threatening Western Europe (protect supply + home flank)
      if (spaceId === 'western_europe' || spaceId === 'north_sea') score += 12;
    }

    if (country === Country.SOVIET_UNION) {
      const ussrCoreSpaces = ['moscow', 'ukraine', 'russia', 'siberia', 'kazakhstan'];
      if (ussrCoreSpaces.includes(spaceId)) score += 12;
      // Defensive: battle enemies in spaces adjacent to Moscow or Ukraine
      const moskowAdj = getAdjacentSpaces('moscow');
      const ukraineAdj = getAdjacentSpaces('ukraine');
      if (moskowAdj.includes(spaceId)) score += 15;  // protect Moscow
      if (ukraineAdj.includes(spaceId)) score += 10;  // protect Ukraine (supply + VP)
      // Offensive from Ukraine: push enemies out of Balkans/Eastern Europe
      if (['balkans', 'eastern_europe'].includes(spaceId)) score += 8;
    }

    if (country === Country.JAPAN) {
      if (getSpace(spaceId)?.type === SpaceType.SEA) {
        const responseCount = state.countries[country].responseCards.length;
        if (responseCount > 0) score += responseCount * 5;
      }
      // Defensive: protect Sea of Japan (supply route) and home adjacency
      if (spaceId === 'sea_of_japan' || spaceId === 'north_pacific') score += 15;
      // Protect China supply space
      if (spaceId === 'china' || spaceId === 'szechuan') score += 8;
    }

    if (country === Country.UK) {
      // Defensive: protect North Sea (critical for UK supply and projecting power)
      if (spaceId === 'north_sea') score += 15;
      if (spaceId === 'north_atlantic') score += 10;
      // Protect India and Australia supply spaces
      if (spaceId === 'bay_of_bengal' || spaceId === 'indian_ocean') score += 10;
      // Offensive: clear Western Europe / Mediterranean
      if (spaceId === 'western_europe') score += 12;
      if (spaceId === 'mediterranean') score += 8;
    }

    if (country === Country.USA) {
      // Offensive: push toward Japan
      if (spaceId === 'sea_of_japan') score += 18;
      if (['central_pacific', 'south_china_sea', 'iwo_jima', 'philippines'].includes(spaceId)) score += 10;
      // Defensive: protect Hawaii and East Pacific supply lines
      if (spaceId === 'east_pacific' || spaceId === 'hawaii') score += 12;
    }

    if (country === Country.ITALY) {
      // Defensive: protect Mediterranean (critical for Italy supply chains)
      if (spaceId === 'mediterranean') score += 15;
      // Protect Balkans (VP route)
      if (spaceId === 'balkans') score += 10;
      // Offensive: support Germany by clearing North Africa / Middle East
      if (['north_africa', 'middle_east'].includes(spaceId)) score += 8;
    }

    // --- Total War: minor power battle targeting ---
    const twBattle = getTWContext();
    if (twBattle) {
      const isEarlyBattle = state.round <= 5;
      const frenchHere = twBattle.frenchArmies.some((p) => p.spaceId === spaceId);
      const chineseHere = twBattle.chineseArmies.some((p) => p.spaceId === spaceId);

      // Germany/Italy: PRIORITY #1 — battle French armies (massive bonus)
      if ((country === Country.GERMANY || country === Country.ITALY) && frenchHere) {
        score += 60;
        if (spaceId === 'western_europe') score += 20;
        if (isEarlyBattle) score += 15;
      }

      // Japan: PRIORITY #1 — battle Chinese armies (massive bonus)
      if (country === Country.JAPAN && chineseHere) {
        score += 60;
        if (spaceId === 'china' || spaceId === 'szechuan') score += 20;
        if (isEarlyBattle) score += 15;
      }

      // UK: prioritize battling enemies near French armies (defend France)
      if (country === Country.UK) {
        const adjToSpace = getAdjacentSpaces(spaceId);
        const frenchNearby = twBattle.frenchArmies.some(
          (p) => p.spaceId === spaceId || adjToSpace.includes(p.spaceId)
        );
        if (frenchNearby) score += 10;
      }

      // USA: prioritize battling enemies near Chinese armies (defend China)
      if (country === Country.USA) {
        const adjToSpace = getAdjacentSpaces(spaceId);
        const chineseNearby = twBattle.chineseArmies.some(
          (p) => p.spaceId === spaceId || adjToSpace.includes(p.spaceId)
        );
        if (chineseNearby) score += 8;
      }
    }

    // --- Defensive bonus for all countries: battle enemies that threaten
    // your own key spaces (home, supply spaces you control) ---
    const myPieces = state.countries[country].piecesOnBoard;
    const adjToTarget = getAdjacentSpaces(spaceId);
    for (const myPiece of myPieces) {
      if (!adjToTarget.includes(myPiece.spaceId)) continue;
      // Enemy is adjacent to one of our pieces — eliminating protects our position
      if (myPiece.spaceId === HOME_SPACES[country]) score += 20;  // protect home!
      if (getSpace(myPiece.spaceId)?.isSupplySpace) score += 10;  // protect supply
    }

    if (score > bestScore) {
      bestScore = score;
      bestTarget = spaceId;
    }
  }
  return bestTarget;
}

export function aiChooseCard(
  state: GameState,
  difficulty: 'easy' | 'medium' | 'hard'
): number {
  const country = getCurrentCountry(state);
  const hand = state.countries[country].hand;
  if (hand.length === 0) return -1;

  if (difficulty === 'easy') {
    const playable = hand.map((c, i) => ({ card: c, index: i }));
    if (playable.length === 0) return 0;
    return playable[Math.floor(Math.random() * playable.length)].index;
  }

  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < hand.length; i++) {
    const score =
      scoreCard(hand[i], state, difficulty) +
      (difficulty === 'hard' ? Math.random() * 2 : Math.random() * 5);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function aiResolvePendingAction(
  state: GameState,
  pending: PendingAction,
  difficulty: 'easy' | 'medium' | 'hard'
): string | number[] {
  const country = getCurrentCountry(state);

  switch (pending.type) {
    case 'SELECT_BUILD_LOCATION':
      return pickBestBuildLocation(pending.validSpaces, country, state, difficulty);

    case 'SELECT_PIECE_TO_REDEPLOY': {
      const pieces = pending.piecesOnBoard;
      if (pieces.length === 0) return '';
      let worstId = pieces[0].pieceId;
      let worstScore = Infinity;
      for (const p of pieces) {
        const s = scoreSpace(p.spaceId, country, state);
        if (s < worstScore) {
          worstScore = s;
          worstId = p.pieceId;
        }
      }
      return worstId;
    }

    case 'SELECT_RECRUIT_LOCATION':
      return pickBestBuildLocation(pending.validSpaces, pending.recruitCountry, state, difficulty);

    case 'SELECT_EVENT_SPACE':
      if (pending.effectAction === 'land_battle' || pending.effectAction === 'sea_battle' || pending.effectAction === 'eliminate_army' || pending.effectAction === 'eliminate_navy') {
        return pickBestBattleTarget(pending.validSpaces, pending.playingCountry, state, difficulty);
      }
      return pickBestBuildLocation(pending.validSpaces, pending.effectCountry, state, difficulty);

    case 'SELECT_BATTLE_TARGET':
      return pickBestBattleTarget(pending.validTargets, country, state, difficulty);

    case 'SELECT_DISCARD':
    case 'CONFIRM_DISCARD_STEP': {
      // Smart discard: evaluate each card and discard ones that are dead weight.
      // Low-score cards are useless (no valid targets, no pieces to build, etc.)
      // and should be traded for fresh draws from the deck.
      const hand = state.countries[country].hand;
      if (hand.length === 0) return [];
      const scored = hand.map((c, i) => ({ score: scoreCard(c, state, difficulty), index: i }));
      scored.sort((a, b) => a.score - b.score);

      // Threshold below which a card is considered not worth keeping.
      // Harder AI is pickier about card quality.
      const discardThreshold = difficulty === 'easy' ? -3
        : difficulty === 'medium' ? 0
        : 3;

      const toDiscard: number[] = [];
      for (const s of scored) {
        if (s.score < discardThreshold) {
          toDiscard.push(s.index);
        }
      }
      return toDiscard;
    }

    case 'SELECT_RESPONSE_TARGET':
      if (pending.validTargets.length === 0) return '';
      return pending.validTargets[0];

    case 'SELECT_FROM_DISCARD': {
      const cards = pending.discardCards;
      if (cards.length === 0) return '';
      const best = cards.reduce((a, b) => {
        const scoreA = scoreCard(a, state, difficulty);
        const scoreB = scoreCard(b, state, difficulty);
        return scoreB > scoreA ? b : a;
      });
      return best.id;
    }

    case 'SELECT_RECRUIT_COUNTRY': {
      const validC = pending.validCountries;
      if (validC.length === 0) return '';
      const allPieces = getAllPieces(state);
      let bestCountry = validC[0];
      let bestScore = -Infinity;
      for (const c of validC) {
        let score = 0;
        for (const sid of pending.where) {
          const adj = getAdjacentSpaces(sid);
          const hasFriendlyAdj = adj.some((a) =>
            allPieces.some((p) => p.spaceId === a && p.type === 'army' && getTeam(p.country) === getTeam(c))
          );
          if (hasFriendlyAdj) score += 10;
          const hasSameCountryAdj = adj.some((a) =>
            allPieces.some((p) => p.spaceId === a && p.country === c)
          );
          if (hasSameCountryAdj) score += 15;
        }
        const avail = getAvailablePieces(c, state);
        score += avail.armies * 2;
        if (score > bestScore) {
          bestScore = score;
          bestCountry = c;
        }
      }
      return bestCountry.toString();
    }

    default:
      return '';
  }
}

export function aiPickEWTarget(validTargets: Country[], state: GameState): Country {
  let best = validTargets[0];
  let bestDeck = Infinity;
  for (const t of validTargets) {
    const deckSize = state.countries[t].deck.length;
    if (deckSize < bestDeck) {
      bestDeck = deckSize;
      best = t;
    }
  }
  return best;
}

export function aiChooseDiscards(
  state: GameState,
  difficulty: 'easy' | 'medium' | 'hard'
): number[] {
  const country = getCurrentCountry(state);
  const cs = state.countries[country];
  const hand = cs.hand;

  if (hand.length === 0) return [];

  const scored = hand.map((c, i) => ({ score: scoreCard(c, state, difficulty), index: i }));
  scored.sort((a, b) => a.score - b.score);

  // Deck conservation: each discard costs an extra draw from deck.
  // Playing 1 card per turn already draws 1; each additional discard burns 1 more.
  // When the deck is low, be very conservative — running out means EW hurts badly
  // and you lose VP from having no cards to play.
  const deckSize = cs.deck.length;
  const remainingRounds = Math.max(1, 20 - state.round);

  // How many deck cards can we safely spare beyond the 1-per-turn baseline?
  // Reserve enough for ~1 draw per remaining round, then allow extras to be discarded.
  const safeExtraDraws = Math.max(0, deckSize - remainingRounds);

  // Base threshold: cards below this score are candidates for discard
  const baseThreshold = difficulty === 'easy' ? -3
    : difficulty === 'medium' ? 0
    : 3;

  // When deck is thin, raise the bar for discarding (make threshold more negative)
  // so only truly awful cards get tossed. When deck is healthy, use base threshold.
  let discardThreshold = baseThreshold;
  if (deckSize <= 5) {
    // Very low deck: only discard truly unplayable cards
    discardThreshold = -5;
  } else if (deckSize <= 10) {
    // Low deck: be conservative
    discardThreshold = Math.min(baseThreshold, -2);
  }

  const candidates: number[] = [];
  for (const s of scored) {
    if (s.score < discardThreshold) {
      candidates.push(s.index);
    }
  }

  // Hard AI also considers EW cards and 3+ duplicates as discard candidates
  if (difficulty === 'hard') {
    for (const s of scored) {
      if (candidates.includes(s.index)) continue;
      const card = hand[s.index];
      if (card.type === CardType.ECONOMIC_WARFARE && s.score < baseThreshold) {
        candidates.push(s.index);
        continue;
      }
      const dupeCount = hand.filter((c) => c.type === card.type && c.name === card.name).length;
      if (dupeCount > 2 && s.score < baseThreshold) {
        candidates.push(s.index);
      }
    }
  }

  // Cap discards by how many extra draws the deck can safely support.
  // Sort candidates by score (worst first) so we discard the worst ones.
  candidates.sort((a, b) => {
    const sa = scored.find((s) => s.index === a)!.score;
    const sb = scored.find((s) => s.index === b)!.score;
    return sa - sb;
  });

  return candidates.slice(0, Math.max(0, safeExtraDraws));
}

// ---------------------------------------------------------------------------
// AI: decide whether to activate Bushido
// ---------------------------------------------------------------------------
export function aiShouldActivateBushido(
  state: GameState,
  battleSpaceId: string
): boolean {
  const jpnDeck = state.countries[Country.JAPAN].deck;
  if (jpnDeck.length <= 2) return false;

  const space = getSpace(battleSpaceId);
  if (space?.isSupplySpace || space?.homeCountry) return true;
  return true;
}

// ---------------------------------------------------------------------------
// AI: decide whether to activate Island Hopping Defense
// ---------------------------------------------------------------------------
export function aiShouldActivateIslandDefense(
  state: GameState,
  battleSpaceId: string
): boolean {
  const jpnDeck = state.countries[Country.JAPAN].deck;
  if (jpnDeck.length <= 2) return false;

  const space = getSpace(battleSpaceId);
  if (space?.isSupplySpace) return true;

  const jpnNavies = state.countries[Country.JAPAN].piecesOnBoard.filter(
    (p) => p.type === 'navy'
  );
  if (jpnNavies.length <= 2) return true;

  return jpnDeck.length > 5;
}

// ---------------------------------------------------------------------------
// AI: decide whether to activate Counter-Offensive
// ---------------------------------------------------------------------------
export function aiShouldActivateCounterOffensive(
  state: GameState,
  eliminatedSpaceId: string
): boolean {
  const avail = getAvailablePieces(Country.SOVIET_UNION, state);
  if (avail.armies <= 0) return false;

  const space = getSpace(eliminatedSpaceId);
  if (space?.isSupplySpace || space?.homeCountry) return true;

  return true;
}

// ---------------------------------------------------------------------------
// AI: decide whether to activate Arsenal of Democracy
// ---------------------------------------------------------------------------
export function aiShouldActivateArsenal(
  state: GameState,
  targetCountry: Country
): boolean {
  const usaHand = state.countries[Country.USA].hand;
  if (usaHand.length <= 2) return false;

  const targetDeck = state.countries[targetCountry].deck;
  if (targetDeck.length === 0) return false;

  if (targetDeck.length < 10) return true;

  return usaHand.length > 4;
}

// ---------------------------------------------------------------------------
// AI: decide whether to activate a protection response
// ---------------------------------------------------------------------------
export function aiShouldActivateProtection(
  state: GameState,
  responseCard: Card,
  battleSpaceId: string,
  responseCountry: Country
): boolean {
  const space = getSpace(battleSpaceId);
  if (!space) return false;

  if (space.isSupplySpace) return true;
  if (space.homeCountry !== undefined) return true;
  if (battleSpaceId === HOME_SPACES[responseCountry]) return true;

  const cState = state.countries[responseCountry];
  if (cState.responseCards.length <= 1) {
    const piecesInSpace = cState.piecesOnBoard.filter((p) => p.spaceId === battleSpaceId);
    if (piecesInSpace.length > 0) return true;
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// AI: choose the best effect for a multi-choice event (e.g. Guns and Butter)
// ---------------------------------------------------------------------------
export function aiChooseEventEffect(
  choices: { label: string; effectType: CardEffectType; available: boolean }[],
  country: Country,
  state: GameState,
  difficulty: 'easy' | 'medium' | 'hard'
): CardEffectType {
  const available = choices.filter((c) => c.available);
  if (available.length === 0) return choices[0].effectType;
  if (available.length === 1) return available[0].effectType;

  if (difficulty === 'easy') {
    return available[Math.floor(Math.random() * available.length)].effectType;
  }

  const round = state.round;
  const isEarly = round <= 5;
  const piecesOnBoard = state.countries[country].piecesOnBoard;
  const avail = getAvailablePieces(country, state);

  let bestEffect = available[0].effectType;
  let bestScore = -Infinity;

  for (const choice of available) {
    let score = 0;
    switch (choice.effectType) {
      case 'BUILD_ARMY': {
        const locs = getValidBuildLocations(country, 'army', state);
        const vpTargets = getVPTargetSpaces(country, state);
        score = 5 + Math.max(0, ...locs.map((l) => scoreSpace(l, country, state, vpTargets)));
        if (isEarly) score += 10;
        if (avail.armies <= 2) score += 3;
        break;
      }
      case 'BUILD_NAVY': {
        const locs = getValidBuildLocations(country, 'navy', state);
        const vpTargets = getVPTargetSpaces(country, state);
        score = 4 + Math.max(0, ...locs.map((l) => scoreSpace(l, country, state, vpTargets)));
        if (isEarly) score += 8;
        break;
      }
      case 'LAND_BATTLE': {
        const statusEffectEnemyTeam = getEnemyTeam(country);
        const statusEffectAllPieces = getAllPieces(state);
        const targets = getValidBattleTargets(country, 'land', state).filter((t) =>
          statusEffectAllPieces.some((p) => p.spaceId === t && p.type === 'army' && getTeam(p.country) === statusEffectEnemyTeam)
        );
        score = targets.length === 0 ? -3 : 8 + Math.max(0, ...targets.map((t) => scoreSpace(t, country, state)));
        if (difficulty === 'hard') {
          score -= getResponsePenaltyForTargets(targets, country, state);
        }
        if (isEarly && piecesOnBoard.length < 3) score -= 8;
        break;
      }
      case 'SEA_BATTLE': {
        const statusEffectSeaEnemyTeam = getEnemyTeam(country);
        const statusEffectSeaAllPieces = getAllPieces(state);
        const targets = getValidBattleTargets(country, 'sea', state).filter((t) =>
          statusEffectSeaAllPieces.some((p) => p.spaceId === t && p.type === 'navy' && getTeam(p.country) === statusEffectSeaEnemyTeam)
        );
        score = targets.length === 0 ? -3 : 7 + targets.length;
        if (difficulty === 'hard') {
          score -= getResponsePenaltyForTargets(targets, country, state);
        }
        if (isEarly && piecesOnBoard.length < 3) score -= 8;
        break;
      }
    }
    score += Math.random() * 3;
    if (score > bestScore) {
      bestScore = score;
      bestEffect = choice.effectType;
    }
  }
  return bestEffect;
}

// ---------------------------------------------------------------------------
// aiShouldTriggerDefenseOfMotherland — called at the start of the USSR turn
// when the card is in responseCards. Returns true if the AI should use it.
// ---------------------------------------------------------------------------
export function aiShouldTriggerDefenseOfMotherland(
  state: GameState,
  difficulty: 'easy' | 'medium' | 'hard'
): boolean {
  const allPieces = getAllPieces(state);

  // Always worth using if we can eliminate an Axis army sitting in Moscow.
  const axisInMoscow = allPieces.some(
    (p) => p.spaceId === 'moscow' && getTeam(p.country) === Team.AXIS && p.type === 'army'
  );
  if (axisInMoscow) return true;

  // Need at least one army in reserve to build.
  const avail = getAvailablePieces(Country.SOVIET_UNION, state);
  if (avail.armies <= 0) return false;

  // Hard AI: always grab the free build if pieces are available.
  if (difficulty === 'hard') return true;

  // Medium AI: use it when Moscow or an adjacent space is unoccupied by Soviet armies.
  if (difficulty === 'medium') {
    const targets = ['moscow', ...getAdjacentSpaces('moscow')];
    return targets.some((sid) => {
      const sp = getSpace(sid);
      if (!sp || sp.type !== SpaceType.LAND) return false;
      return !allPieces.some(
        (p) => p.spaceId === sid && p.country === Country.SOVIET_UNION && p.type === 'army'
      );
    });
  }

  // Easy AI: only use if Moscow itself is at risk (Axis adjacent to Moscow).
  const moscowAdj = getAdjacentSpaces('moscow');
  return allPieces.some(
    (p) => moscowAdj.includes(p.spaceId) && getTeam(p.country) === Team.AXIS && p.type === 'army'
  );
}
