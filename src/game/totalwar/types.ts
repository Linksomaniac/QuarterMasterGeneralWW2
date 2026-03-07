// ---------------------------------------------------------------------------
// Total War Expansion Types
// Extends base game types WITHOUT modifying them.
// ---------------------------------------------------------------------------

import {
  Country,
  Team,
  Card,
  CardType,
  CardEffect,
  CardEffectType,
  GamePhase,
  GameState,
  Piece,
  PendingAction,
  CountryState,
} from '../types';

// Re-export base types for convenience
export {
  Country,
  Team,
  CardType,
  GamePhase,
};
export type {
  Card,
  CardEffect,
  CardEffectType,
  GameState,
  Piece,
  PendingAction,
  CountryState,
};

// ---------------------------------------------------------------------------
// Minor Powers: France & China
// NOT new Country enum values — tracked as string literal types
// ---------------------------------------------------------------------------

export type MinorPower = 'FRANCE' | 'CHINA';

/** Country or MinorPower — used where either is valid */
export type AnyForce = Country | MinorPower;

export const MINOR_POWER_NAMES: Record<MinorPower, string> = {
  FRANCE: 'France',
  CHINA: 'China',
};

export const MINOR_POWER_COLORS: Record<MinorPower, string> = {
  FRANCE: '#1E3A8A',  // deep blue
  CHINA: '#8B4513',   // brown (saddle brown)
};

export const MINOR_POWER_TEXT_ON_BG: Record<MinorPower, string> = {
  FRANCE: '#FFFFFF',
  CHINA: '#FFFFFF',
};

export const MINOR_POWER_SHORT: Record<MinorPower, string> = {
  FRANCE: 'FRA',
  CHINA: 'CHN',
};

/** Which major power controls each minor power */
export const MINOR_POWER_CONTROLLER: Record<MinorPower, Country> = {
  FRANCE: Country.UK,
  CHINA: Country.USA,
};

export const MINOR_POWER_HOME: Record<MinorPower, string> = {
  FRANCE: 'western_europe',
  CHINA: 'china',
};

/** Piece limits for minor powers */
export const MINOR_POWER_PIECES: Record<MinorPower, { armies: number; navies: number; airForces: number }> = {
  FRANCE: { armies: 3, navies: 2, airForces: 1 },
  CHINA: { armies: 2, navies: 0, airForces: 1 },
};

// ---------------------------------------------------------------------------
// Air Forces
// ---------------------------------------------------------------------------

export interface AirForcePiece {
  id: string;
  country: Country;
  minorPower?: MinorPower;
  type: 'air_force';
  spaceId: string;
}

/** Max air forces per major power */
export const AIR_FORCE_LIMITS: Record<Country, number> = {
  [Country.GERMANY]: 2,
  [Country.UK]: 2,
  [Country.JAPAN]: 2,
  [Country.SOVIET_UNION]: 1,
  [Country.ITALY]: 1,
  [Country.USA]: 3,
};

/** Max air forces per minor power */
export const MINOR_POWER_AF_LIMITS: Record<MinorPower, number> = {
  FRANCE: 1,
  CHINA: 1,
};

// ---------------------------------------------------------------------------
// Extended Card Types (union with base CardType)
// ---------------------------------------------------------------------------

export type ExtendedCardType = CardType | 'AIR_POWER' | 'BOLSTER';

/** Extended card interface that can hold expansion card types */
export interface TotalWarCard extends Omit<Card, 'type'> {
  type: ExtendedCardType;
  /** For bolster cards, the trigger condition */
  bolsterTrigger?: BolsterTrigger;
  /** Whether this is a substitute card replacing a base game card */
  isSubstitute?: boolean;
  /** The base card ID this substitutes */
  substitutesBaseId?: string;
  /** Minor power this card involves (for France/China cards) */
  minorPower?: MinorPower;
}

// ---------------------------------------------------------------------------
// Bolster Card Triggers
// ---------------------------------------------------------------------------

export type BolsterTrigger =
  | 'PLAY_STEP_BEGIN'          // Use at beginning of Play step
  | 'VICTORY_STEP_BEGIN'       // Use at beginning of Victory step
  | 'DRAW_STEP_BEGIN'          // Use at beginning of Draw step
  | 'DISCARD_STEP_BEGIN'       // Use at beginning of Discard step
  | 'AIR_STEP_BEGIN'           // Use at beginning of Air step
  | 'DEPLOY_OR_MARSHAL_AF'     // Use when you deploy or marshal an Air Force
  | 'BUILD_NAVY'               // Use when you build a Navy
  | 'BUILD_ARMY'               // Use when you build an Army
  | 'BATTLE_LAND'              // Use when you battle a land space
  | 'BATTLE_SEA'               // Use when you battle a sea space
  | 'PLAY_EW'                  // Use when you play an Economic Warfare card
  | 'TARGET_OF_EW'             // Use when you are target of EW
  | 'AXIS_USES_STATUS'         // Use when Axis uses a Status card
  | 'AXIS_USES_BOLSTER'        // Use when Axis uses a Bolster card
  | 'GERMANY_PLAYS_SUBMARINE'  // Use when Germany plays Submarine EW
  | 'ARMY_BATTLED'             // Use when your Army is battled
  | 'LAST_ARMY_REMOVED'        // Use after your last Army is removed
  | 'ANY_PLAYER_PLAY_STEP'     // Use at beginning of any player's Play step
  | 'ARMY_REMOVED'             // Use when your Army in specific space is removed
  ;

// ---------------------------------------------------------------------------
// Extended Game Phase (union with base GamePhase)
// ---------------------------------------------------------------------------

export type ExtendedGamePhase = GamePhase | 'AIR_STEP';

// ---------------------------------------------------------------------------
// Air Step Actions
// ---------------------------------------------------------------------------

export type AirStepAction =
  | 'DEPLOY'           // Discard Air Power card, place AF with supplied piece
  | 'MARSHAL'          // Discard any card, move supplied AF to space with supplied piece
  | 'GAIN_SUPERIORITY' // Discard Air Power card, eliminate adjacent enemy AF
  | 'SKIP';            // Do nothing

// ---------------------------------------------------------------------------
// Total War Expansion State
// ---------------------------------------------------------------------------

export interface MinorPowerPiece {
  id: string;
  minorPower: MinorPower;
  type: 'army' | 'navy';
  spaceId: string;
}

export interface TotalWarState {
  /** Whether the expansion is enabled */
  enabled: boolean;

  /** Air force pieces on the board (all countries + minor powers) */
  airForces: AirForcePiece[];

  /** Minor power pieces on the board */
  minorPowerPieces: MinorPowerPiece[];

  /** Whether we're currently in the Air Step (injected phase) */
  inAirStep: boolean;

  /** Which country is taking the Air Step */
  airStepCountry: Country | null;

  /** Whether the current country has completed their Air Step action */
  airStepCompleted: boolean;

  /** France Home marker — moves to UK if Western Europe occupied by Axis */
  franceHomeIsUK: boolean;

  /** China Home marker on China space */
  chinaHomeMarker: boolean;

  /** Soviet Union Home marker (for Government Evacuates to Kuibyshev) */
  sovietHomeIsSiberia: boolean;

  /** Supply source markers */
  supplySourceMarkers: {
    africa: boolean;           // Senegalese Tirailleurs
    eastern_europe: boolean;   // Polish Sovereignty
    szechuan_china: boolean;   // American Volunteer Group Expands (substitute)
    siberia: boolean;          // Government Evacuates to Kuibyshev
  };

  /** Track which bolster cards have been used this turn (to prevent re-use) */
  bolstersUsedThisTurn: string[];

  /** Track status abilities used this turn for "once per turn" expansion statuses */
  expansionStatusUsedThisTurn: string[];

  /** Air defense/attack is not available flag for Cloud Cover bolster */
  airDefenseDisabledThisTurn: boolean;

  /** Pending expansion-specific action */
  pendingTotalWarAction: TotalWarPendingAction | null;
}

// ---------------------------------------------------------------------------
// Total War Pending Actions
// ---------------------------------------------------------------------------

export type TotalWarPendingAction =
  | {
      type: 'AIR_STEP_CHOICE';
      country: Country;
      /** Can also marshal/deploy for minor power AF during controller's turn */
      canDeployMinor?: MinorPower;
    }
  | {
      type: 'SELECT_AF_DEPLOY_LOCATION';
      country: Country;
      minorPower?: MinorPower;
      validSpaces: string[];
    }
  | {
      type: 'SELECT_AF_MARSHAL_SOURCE';
      country: Country;
      minorPower?: MinorPower;
      eligibleAirForces: { afId: string; spaceId: string; spaceName: string }[];
    }
  | {
      type: 'SELECT_AF_MARSHAL_DESTINATION';
      country: Country;
      minorPower?: MinorPower;
      afId: string;
      validSpaces: string[];
    }
  | {
      type: 'SELECT_AF_SUPERIORITY_TARGET';
      country: Country;
      validTargets: { afId: string; spaceId: string; spaceName: string; ownerCountry: Country; ownerMinorPower?: MinorPower }[];
    }
  | {
      type: 'AIR_DEFENSE_OPPORTUNITY';
      defenderCountry: Country;
      battleSpaceId: string;
      threatenedPieceId: string;
      threatenedPieceType: 'army' | 'navy';
      airForceId: string;
    }
  | {
      type: 'AIR_ATTACK_OPPORTUNITY';
      attackerCountry: Country;
      defenderCountry: Country;
      battleSpaceId: string;
      defenderAFSpaceId: string;
      attackerAFId: string;
    }
  | {
      type: 'BOLSTER_OPPORTUNITY';
      country: Country;
      bolsterCardId: string;
      bolsterCardName: string;
      trigger: BolsterTrigger;
      description: string;
      /** Phase to resume after all bolsters are resolved */
      resumePhase: GamePhase;
      /** Multiple bolsters may be available; this tracks all of them */
      allBolsters?: { cardId: string; cardName: string; description: string }[];
    }
  | {
      type: 'SELECT_AF_DISCARD_FOR_DEPLOY';
      country: Country;
      minorPower?: MinorPower;
    }
  | {
      type: 'SELECT_AF_DISCARD_FOR_MARSHAL';
      country: Country;
      minorPower?: MinorPower;
    }
  | {
      type: 'SELECT_AF_DISCARD_FOR_SUPERIORITY';
      country: Country;
    }
  | {
      type: 'REPOSITION_AIR_FORCE';
      afId: string;
      country: Country;
      minorPower?: MinorPower;
      validSpaces: string[];
    }
  | {
      type: 'SELECT_BOLSTER_DISCARD';
      country: Country;
      bolsterCardId: string;
      count: number;
      /** Some bolsters require specific card type to discard */
      requiredCardType?: ExtendedCardType;
      afterAction?: string;
    }
  | {
      type: 'SELECT_MINOR_BUILD_LOCATION';
      minorPower: MinorPower;
      pieceType: 'army' | 'navy';
      validSpaces: string[];
      eventCardName: string;
    }
  | {
      type: 'TW_SETUP_DISCARD';
      country: Country;
      countryIndex: number;
    }
  | {
      type: 'REALLOCATE_RESOURCES_OFFER';
      country: Country;
    }
  | {
      type: 'REALLOCATE_RESOURCES_DISCARD';
      country: Country;
      cost: number;
    }
  | {
      type: 'REALLOCATE_RESOURCES_PICK';
      country: Country;
      /** Eligible cards from deck (or discard if War Bonds active) */
      eligibleCards: { id: string; name: string; type: string; text: string }[];
      source: 'deck' | 'discard';
    }
  ;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Total War setup: draw 12 cards, discard 5 */
export const TW_INITIAL_DRAW = 12;
export const TW_INITIAL_DISCARD = 5;

/** Deck sizes WITH expansion (from rulebook constructed deck rules) */
export const TW_DECK_SIZES: Record<Country, number> = {
  [Country.GERMANY]: 67,
  [Country.UK]: 68,
  [Country.JAPAN]: 60,
  [Country.SOVIET_UNION]: 59,
  [Country.ITALY]: 54,
  [Country.USA]: 70,
};

/** Substitute card base IDs that get removed when expansion is enabled */
export const SUBSTITUTE_BASE_IDS: string[] = [
  'uk_dutch_east_indies',      // replaced by expansion Dutch East Indies
  'uk_free_france',            // replaced by expansion Free France
  'usa_free_french_allies',    // replaced by expansion Free French Allies (moves to UK deck)
  'usa_american_volunteer',    // replaced by expansion American Volunteer Group Expands
  'usa_lend_lease',            // Ledo and Burma Roads replaces base version
];

/** Cards that are renamed in Total War: Deploy Air Force → Air Power */
export const DEPLOY_AF_IS_AIR_POWER = true;

/** Reallocate Resources: discard 3 cards to search deck for a combat/build card */
export const REALLOCATE_COST = 3;

/** Card types eligible to pick via Reallocate Resources */
export const REALLOCATE_ELIGIBLE_TYPES: string[] = [
  'BUILD_ARMY', 'BUILD_NAVY', 'LAND_BATTLE', 'SEA_BATTLE',
];

// ---------------------------------------------------------------------------
// Initial expansion state
// ---------------------------------------------------------------------------

export const INITIAL_TOTAL_WAR_STATE: TotalWarState = {
  enabled: false,
  airForces: [],
  minorPowerPieces: [],
  inAirStep: false,
  airStepCountry: null,
  airStepCompleted: false,
  franceHomeIsUK: false,
  chinaHomeMarker: false,
  sovietHomeIsSiberia: false,
  supplySourceMarkers: {
    africa: false,
    eastern_europe: false,
    szechuan_china: false,
    siberia: false,
  },
  bolstersUsedThisTurn: [],
  expansionStatusUsedThisTurn: [],
  airDefenseDisabledThisTurn: false,
  pendingTotalWarAction: null,
};
