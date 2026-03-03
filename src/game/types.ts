export enum Country {
  GERMANY = 'GERMANY',
  UK = 'UK',
  JAPAN = 'JAPAN',
  SOVIET_UNION = 'SOVIET_UNION',
  ITALY = 'ITALY',
  USA = 'USA',
}

export enum Team {
  AXIS = 'AXIS',
  ALLIES = 'ALLIES',
}

export enum SpaceType {
  LAND = 'LAND',
  SEA = 'SEA',
}

export enum CardType {
  BUILD_ARMY = 'BUILD_ARMY',
  BUILD_NAVY = 'BUILD_NAVY',
  LAND_BATTLE = 'LAND_BATTLE',
  SEA_BATTLE = 'SEA_BATTLE',
  EVENT = 'EVENT',
  STATUS = 'STATUS',
  ECONOMIC_WARFARE = 'ECONOMIC_WARFARE',
  RESPONSE = 'RESPONSE',
}

export enum GamePhase {
  SETUP = 'SETUP',
  SETUP_DISCARD = 'SETUP_DISCARD',
  PLAY_STEP = 'PLAY_STEP',
  AWAITING_RESPONSE = 'AWAITING_RESPONSE',
  SUPPLY_STEP = 'SUPPLY_STEP',
  VICTORY_STEP = 'VICTORY_STEP',
  DISCARD_STEP = 'DISCARD_STEP',
  DRAW_STEP = 'DRAW_STEP',
  GAME_OVER = 'GAME_OVER',
}

export const TURN_ORDER: Country[] = [
  Country.GERMANY,
  Country.UK,
  Country.JAPAN,
  Country.SOVIET_UNION,
  Country.ITALY,
  Country.USA,
];

export function getTeam(country: Country): Team {
  return [Country.GERMANY, Country.JAPAN, Country.ITALY].includes(country)
    ? Team.AXIS
    : Team.ALLIES;
}

export function getEnemyTeam(country: Country): Team {
  return getTeam(country) === Team.AXIS ? Team.ALLIES : Team.AXIS;
}

export function getTeamCountries(team: Team): Country[] {
  return team === Team.AXIS
    ? [Country.GERMANY, Country.JAPAN, Country.ITALY]
    : [Country.UK, Country.SOVIET_UNION, Country.USA];
}

export const COUNTRY_COLORS: Record<Country, string> = {
  [Country.GERMANY]: '#555555',
  [Country.UK]: '#DAA520',
  [Country.JAPAN]: '#FFFFFF',
  [Country.SOVIET_UNION]: '#CC0000',
  [Country.ITALY]: '#7B1FA2',
  [Country.USA]: '#2E7D32',
};

export const COUNTRY_TEXT_ON_BG: Record<Country, string> = {
  [Country.GERMANY]: '#FFFFFF',
  [Country.UK]: '#1A1A1A',
  [Country.JAPAN]: '#1A1A1A',
  [Country.SOVIET_UNION]: '#FFFFFF',
  [Country.ITALY]: '#FFFFFF',
  [Country.USA]: '#FFFFFF',
};

export const COUNTRY_NAMES: Record<Country, string> = {
  [Country.GERMANY]: 'Germany',
  [Country.UK]: 'United Kingdom',
  [Country.JAPAN]: 'Japan',
  [Country.SOVIET_UNION]: 'Soviet Union',
  [Country.ITALY]: 'Italy',
  [Country.USA]: 'United States',
};

export const COUNTRY_SHORT: Record<Country, string> = {
  [Country.GERMANY]: 'GER',
  [Country.UK]: 'UK',
  [Country.JAPAN]: 'JPN',
  [Country.SOVIET_UNION]: 'USSR',
  [Country.ITALY]: 'ITA',
  [Country.USA]: 'USA',
};

export const COUNTRY_PIECES: Record<Country, { armies: number; navies: number }> = {
  [Country.GERMANY]: { armies: 7, navies: 3 },
  [Country.UK]: { armies: 5, navies: 5 },
  [Country.JAPAN]: { armies: 5, navies: 5 },
  [Country.SOVIET_UNION]: { armies: 7, navies: 1 },
  [Country.ITALY]: { armies: 4, navies: 3 },
  [Country.USA]: { armies: 5, navies: 6 },
};

export const COUNTRY_DECK_SIZE: Record<Country, number> = {
  [Country.GERMANY]: 41,
  [Country.UK]: 40,
  [Country.JAPAN]: 34,
  [Country.SOVIET_UNION]: 34,
  [Country.ITALY]: 30,
  [Country.USA]: 41,
};

export interface MapSpace {
  id: string;
  name: string;
  type: SpaceType;
  isSupplySpace: boolean;
  homeCountry?: Country;
  controlsStrait?: { connects: [string, string] };
  x: number;
  y: number;
  labelOffset?: { dx: number; dy: number };
}

export interface Adjacency {
  from: string;
  to: string;
}

export interface Piece {
  id: string;
  country: Country;
  type: 'army' | 'navy';
  spaceId: string;
}

export type CardEffectType =
  | 'BUILD_ARMY'
  | 'BUILD_NAVY'
  | 'LAND_BATTLE'
  | 'SEA_BATTLE'
  | 'RECRUIT_ARMY'
  | 'RECRUIT_NAVY'
  | 'ELIMINATE_ARMY'
  | 'ELIMINATE_NAVY'
  | 'DISCARD_CARDS'
  | 'SCORE_VP'
  | 'ADDITIONAL_BATTLE'
  | 'BUILD_AFTER_BATTLE'
  | 'PROTECT_PIECE'
  | 'SUPPLY_MARKER'
  | 'VP_PER_CONDITION'
  | 'BUILD_ALLY_ARMY'
  | 'MOVE_PIECES';

export interface CardEffect {
  type: CardEffectType;
  where?: string[];
  count?: number;
  team?: Team;
  country?: Country;
  pieceType?: 'army' | 'navy';
  condition?: string;
  amount?: number;
  duration?: 'turn' | 'permanent';
  battleType?: 'land' | 'sea';
  marker?: string;
  scalingCondition?: string;
  bonusCount?: number;
  bonusCondition?: string;
  handCost?: number;
  countries?: Country[];
}

export interface Card {
  id: string;
  name: string;
  country: Country;
  type: CardType;
  text: string;
  effects: CardEffect[];
}

export interface CountryState {
  country: Country;
  hand: Card[];
  deck: Card[];
  discard: Card[];
  statusCards: Card[];
  responseCards: Card[];
  piecesOnBoard: Piece[];
  isHuman: boolean;
  aiDifficulty: 'easy' | 'medium' | 'hard';
}

export interface ProtectionEffect {
  pieceId: string;
  spaceId: string;
  country: Country;
  expiresEndOfTurn: boolean;
}

export interface GameState {
  phase: GamePhase;
  round: number;
  currentCountryIndex: number;
  countries: Record<Country, CountryState>;
  axisVP: number;
  alliesVP: number;
  log: LogEntry[];
  supplyMarkers: { canada: boolean; szechuan: boolean; scorched_earth_ukraine: boolean; truk_supply: boolean };
  protections: ProtectionEffect[];
  winner: Team | null;
  pendingAction: PendingAction | null;
  selectedCard: Card | null;
}

export interface LogEntry {
  round: number;
  country: Country;
  message: string;
  timestamp: number;
}

export type PendingAction =
  | { type: 'SELECT_BUILD_LOCATION'; pieceType: 'army' | 'navy'; validSpaces: string[]; buildCountry?: Country; eventCardName?: string; remainingEffects?: CardEffect[]; playingCountry?: Country }
  | { type: 'SELECT_PIECE_TO_REDEPLOY'; pieceType: 'army' | 'navy'; piecesOnBoard: { pieceId: string; spaceId: string; spaceName: string }[]; redeployCountry: Country; targetSpaceId?: string; currentEffect?: CardEffect; eventCardName?: string; remainingEffects?: CardEffect[]; playingCountry?: Country }
  | { type: 'SELECT_BATTLE_TARGET'; battleType: 'land' | 'sea'; validTargets: string[] }
  | {
      type: 'SELECT_BATTLE_PIECE';
      battleType: 'land' | 'sea';
      battleSpaceId: string;
      spaceName: string;
      attackingCountry: Country;
      eligiblePieces: { pieceId: string; country: Country; pieceType: 'army' | 'navy' }[];
    }
  | { type: 'SELECT_DISCARD'; minDiscard: number; maxDiscard: number }
  | { type: 'CONFIRM_DISCARD_STEP' }
  | { type: 'SELECT_RESPONSE_TARGET'; effectType: string; validTargets: string[] }
  | { type: 'SELECT_EW_TARGET'; ewCard: Card; validTargets: Country[] }
  | { type: 'SELECT_MALTA_CHOICE'; targetCountry: Country; ewCard: Card; playingCountry: Country; remainingCountries: Country[] }
  | { type: 'SELECT_LEND_LEASE_TARGET'; validTargets: Country[]; lendLeaseCard: Card }
  | { type: 'SELECT_FROM_DISCARD'; discardCards: Card[] }
  | { type: 'SELECT_EVENT_CHOICE'; eventCard: Card; choices: { label: string; effectType: CardEffectType; available: boolean }[] }
  | {
      type: 'RESPONSE_OPPORTUNITY';
      responseCountry: Country;
      responseCardId: string;
      responseCardName: string;
      battleSpaceId: string;
      eliminatedPieceId: string;
      eliminatedPieceCountry: Country;
      attackingCountry: Country;
    }
  | {
      type: 'OFFENSIVE_RESPONSE_OPPORTUNITY';
      responseCountry: Country;
      responseCardId: string;
      responseCardName: string;
      triggerSpaceId: string;
      description: string;
    }
  | {
      type: 'EW_COUNTER_OPPORTUNITY';
      responseCountry: Country;
      responseCardId: string;
      responseCardName: string;
      ewCountry: Country;
    }
  | {
      type: 'EW_CANCEL_OPPORTUNITY';
      responseCountry: Country;
      responseCardId: string;
      responseCardName: string;
      ewCard: Card;
      ewTargetCountry: Country;
      ewPlayingCountry: Country;
    }
  | { type: 'SELECT_HAND_DISCARD'; count: number; statusCardId: string; afterAction: 'build_army' | 'land_battle'; afterWhere?: string[] }
  | { type: 'SELECT_OFFENSIVE_HAND_DISCARD'; count: number; offensiveCardId: string; triggerSpaceId: string }
  | { type: 'RATIONING_OPPORTUNITY'; rationingCardId: string; playedCard: Card }
  | { type: 'SELECT_ROSIE_CARDS'; handCards: Card[]; minCards: number; maxCards: number }
  | { type: 'SELECT_RECRUIT_LOCATION'; pieceType: 'army' | 'navy'; validSpaces: string[]; remaining: number; baseWhere: string[]; baseCondition?: string; recruitCountry: Country; eventCardName: string; botContinuation?: boolean }
  | { type: 'SELECT_RECRUIT_COUNTRY'; validCountries: Country[]; where: string[]; eventCardName: string; remainingEffects: CardEffect[]; playingCountry: Country }
  | {
      type: 'SELECT_EVENT_SPACE';
      eventCardName: string;
      prompt: string;
      validSpaces: string[];
      effectAction: 'recruit_army' | 'recruit_navy' | 'build_army' | 'build_navy' | 'land_battle' | 'sea_battle' | 'eliminate_army' | 'eliminate_navy';
      effectCountry: Country;
      playingCountry: Country;
      remaining: number;
      remainingEffects: CardEffect[];
      skippable: boolean;
    }
  | {
      type: 'BUILD_REACTION_OPPORTUNITY';
      responseCountry: Country;
      responseCardId: string;
      responseCardName: string;
      buildSpaceId: string;
      buildCountry: Country;
      builtPieceId: string;
      description: string;
    }
  | {
      type: 'BATTLE_REACTION_OPPORTUNITY';
      responseCountry: Country;
      responseCardId: string;
      responseCardName: string;
      battleSpaceId: string;
      battleCountry: Country;
      description: string;
    }
  | {
      type: 'ALLY_REINFORCEMENT_OPPORTUNITY';
      responseCountry: Country;
      responseCardId: string;
      responseCardName: string;
      recruitCountry: Country;
      recruitSpaceId: string;
      description: string;
    }
  | {
      type: 'CARD_CANCEL_OPPORTUNITY';
      responseCountry: Country;
      responseCardId: string;
      responseCardName: string;
      cancelledCard: Card;
      cancelledCardName: string;
      cancelledCountry: Country;
    }
  | {
      type: 'STATUS_ABILITY_OPPORTUNITY';
      responseCountry: Country;
      statusCardId: string;
      statusCardName: string;
      description: string;
    }
  | {
      type: 'BUSHIDO_OPPORTUNITY';
      responseCountry: Country;
      statusCardId: string;
      statusCardName: string;
      battleSpaceId: string;
      attackingCountry: Country;
    }
  | {
      type: 'ISLAND_DEFENSE_OPPORTUNITY';
      responseCountry: Country;
      statusCardId: string;
      statusCardName: string;
      battleSpaceId: string;
      attackingCountry: Country;
    }
  | {
      type: 'COUNTER_OFFENSIVE_OPPORTUNITY';
      responseCountry: Country;
      statusCardId: string;
      statusCardName: string;
      eliminatedSpaceId: string;
      eliminatedPieceCountry: Country;
    }
  | {
      type: 'ARSENAL_OPPORTUNITY';
      responseCountry: Country;
      statusCardId: string;
      statusCardName: string;
      targetCountry: Country;
    }
  | {
      type: 'REORDER_CARDS';
      cards: Card[];
      statusCardName: string;
    }
  | {
      type: 'ENIGMA_OPPORTUNITY';
      responseCountry: Country;
      enigmaCardId: string;
      enigmaCardName: string;
      germanStatusCardId: string;
      germanStatusCardName: string;
    }
  | {
      type: 'SELECT_MOVE_PIECE';
      country: Country;
      eventCardName: string;
      pieceTypeFilter?: 'army' | 'navy';
      eligiblePieces: { pieceId: string; pieceType: 'army' | 'navy'; spaceId: string; spaceName: string }[];
      movedPieceIds: string[];
      remainingEffects: CardEffect[];
      playingCountry: Country;
    }
  | {
      type: 'SELECT_MOVE_DESTINATION';
      country: Country;
      eventCardName: string;
      pieceType: 'army' | 'navy';
      removedFromSpaceId: string;
      removedFromSpaceName: string;
      validSpaces: string[];
      pieceTypeFilter?: 'army' | 'navy';
      movedPieceIds: string[];
      remainingEffects: CardEffect[];
      playingCountry: Country;
    }
  | {
      /** Shown at the start of a nation's turn when they hold a beginning-of-turn
       *  response card (e.g. Defense of the Motherland). Human decides; AI uses
       *  a heuristic. Declining keeps the card in responseCards for future turns. */
      type: 'BEGINNING_TURN_RESPONSE';
      responseCountry: Country;
      responseCardId: string;
      responseCardName: string;
      description: string;
      /** Identifies the specific BoT card for special handling in the accept/decline handler. */
      botType?: 'mobile_force';
      /** Valid spaces for Mobile Force location picker (used after human accepts). */
      validSpaces?: string[];
    };

export const MAX_ROUNDS = 20;
export const HAND_SIZE = 7;
export const INITIAL_DRAW = 10;
export const INITIAL_DISCARD = 3;
export const SUDDEN_VICTORY_VP = 30;
export const VP_PER_SUPPLY_SPACE_SOLE = 2;
export const VP_PER_SUPPLY_SPACE_SHARED = 1;
