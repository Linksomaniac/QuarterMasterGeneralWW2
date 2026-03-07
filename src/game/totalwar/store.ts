// ---------------------------------------------------------------------------
// Total War Expansion – Zustand Store
// Manages expansion state separately from the base game store.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { Country, Team } from '../types';
import {
  TotalWarState,
  INITIAL_TOTAL_WAR_STATE,
  AirForcePiece,
  MinorPowerPiece,
  MinorPower,
  TotalWarPendingAction,
  AirStepAction,
  MINOR_POWER_HOME,
  MINOR_POWER_PIECES,
  AIR_FORCE_LIMITS,
} from './types';

// ---------------------------------------------------------------------------
// Piece ID generator
// ---------------------------------------------------------------------------

let twPieceCounter = 0;

function generateTWPieceId(): string {
  return `tw_piece_${++twPieceCounter}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface TotalWarStore extends TotalWarState {
  // Actions
  setEnabled: (enabled: boolean) => void;
  resetState: () => void;

  // Air Force actions
  addAirForce: (af: AirForcePiece) => void;
  removeAirForce: (afId: string) => void;
  moveAirForce: (afId: string, toSpaceId: string) => void;

  // Minor power piece actions
  addMinorPowerPiece: (piece: MinorPowerPiece) => void;
  removeMinorPowerPiece: (pieceId: string) => void;

  // Air step tracking
  enterAirStep: (country: Country) => void;
  completeAirStep: () => void;
  exitAirStep: () => void;

  // France/China state
  setFranceHomeIsUK: (val: boolean) => void;
  setChinaHomeMarker: (val: boolean) => void;
  setSovietHomeIsSiberia: (val: boolean) => void;

  // Supply markers
  setSupplySourceMarker: (key: keyof TotalWarState['supplySourceMarkers'], val: boolean) => void;

  // Bolster tracking
  markBolsterUsed: (cardId: string) => void;
  clearBolstersUsedThisTurn: () => void;

  // Expansion status tracking
  markExpansionStatusUsed: (cardId: string) => void;
  clearExpansionStatusUsedThisTurn: () => void;

  // Air defense
  setAirDefenseDisabled: (val: boolean) => void;

  // Pending action
  setPendingTotalWarAction: (action: TotalWarPendingAction | null) => void;

  // Setup helpers
  placeStartingMinorPowerPieces: () => void;
}

// ---------------------------------------------------------------------------
// Store creation
// ---------------------------------------------------------------------------

export const useTotalWarStore = create<TotalWarStore>((set, get) => ({
  // Spread initial state as defaults
  ...INITIAL_TOTAL_WAR_STATE,

  // -------------------------------------------------------------------------
  // Core actions
  // -------------------------------------------------------------------------

  setEnabled: (enabled: boolean) => {
    set(() => ({ enabled }));
  },

  resetState: () => {
    twPieceCounter = 0;
    set(() => ({ ...INITIAL_TOTAL_WAR_STATE }));
  },

  // -------------------------------------------------------------------------
  // Air Force actions
  // -------------------------------------------------------------------------

  addAirForce: (af: AirForcePiece) => {
    set((state) => ({
      airForces: [...state.airForces, af],
    }));
  },

  removeAirForce: (afId: string) => {
    set((state) => ({
      airForces: state.airForces.filter((af) => af.id !== afId),
    }));
  },

  moveAirForce: (afId: string, toSpaceId: string) => {
    set((state) => ({
      airForces: state.airForces.map((af) =>
        af.id === afId ? { ...af, spaceId: toSpaceId } : af
      ),
    }));
  },

  // -------------------------------------------------------------------------
  // Minor power piece actions
  // -------------------------------------------------------------------------

  addMinorPowerPiece: (piece: MinorPowerPiece) => {
    set((state) => ({
      minorPowerPieces: [...state.minorPowerPieces, piece],
    }));
  },

  removeMinorPowerPiece: (pieceId: string) => {
    set((state) => ({
      minorPowerPieces: state.minorPowerPieces.filter((p) => p.id !== pieceId),
    }));
  },

  // -------------------------------------------------------------------------
  // Air step tracking
  // -------------------------------------------------------------------------

  enterAirStep: (country: Country) => {
    set(() => ({
      inAirStep: true,
      airStepCountry: country,
      airStepCompleted: false,
    }));
  },

  completeAirStep: () => {
    set(() => ({
      airStepCompleted: true,
    }));
  },

  exitAirStep: () => {
    set(() => ({
      inAirStep: false,
      airStepCountry: null,
      airStepCompleted: false,
    }));
  },

  // -------------------------------------------------------------------------
  // France / China / Soviet state
  // -------------------------------------------------------------------------

  setFranceHomeIsUK: (val: boolean) => {
    set(() => ({ franceHomeIsUK: val }));
  },

  setChinaHomeMarker: (val: boolean) => {
    set(() => ({ chinaHomeMarker: val }));
  },

  setSovietHomeIsSiberia: (val: boolean) => {
    set(() => ({ sovietHomeIsSiberia: val }));
  },

  // -------------------------------------------------------------------------
  // Supply markers
  // -------------------------------------------------------------------------

  setSupplySourceMarker: (key: keyof TotalWarState['supplySourceMarkers'], val: boolean) => {
    set((state) => ({
      supplySourceMarkers: {
        ...state.supplySourceMarkers,
        [key]: val,
      },
    }));
  },

  // -------------------------------------------------------------------------
  // Bolster tracking
  // -------------------------------------------------------------------------

  markBolsterUsed: (cardId: string) => {
    set((state) => ({
      bolstersUsedThisTurn: [...state.bolstersUsedThisTurn, cardId],
    }));
  },

  clearBolstersUsedThisTurn: () => {
    set(() => ({ bolstersUsedThisTurn: [] }));
  },

  // -------------------------------------------------------------------------
  // Expansion status tracking
  // -------------------------------------------------------------------------

  markExpansionStatusUsed: (cardId: string) => {
    set((state) => ({
      expansionStatusUsedThisTurn: [...state.expansionStatusUsedThisTurn, cardId],
    }));
  },

  clearExpansionStatusUsedThisTurn: () => {
    set(() => ({ expansionStatusUsedThisTurn: [] }));
  },

  // -------------------------------------------------------------------------
  // Air defense
  // -------------------------------------------------------------------------

  setAirDefenseDisabled: (val: boolean) => {
    set(() => ({ airDefenseDisabledThisTurn: val }));
  },

  // -------------------------------------------------------------------------
  // Pending action
  // -------------------------------------------------------------------------

  setPendingTotalWarAction: (action: TotalWarPendingAction | null) => {
    set(() => ({ pendingTotalWarAction: action }));
  },

  // -------------------------------------------------------------------------
  // Setup helpers
  // -------------------------------------------------------------------------

  placeStartingMinorPowerPieces: () => {
    const frenchArmy: MinorPowerPiece = {
      id: generateTWPieceId(),
      minorPower: 'FRANCE',
      type: 'army',
      spaceId: 'western_europe',
    };

    const chineseArmy: MinorPowerPiece = {
      id: generateTWPieceId(),
      minorPower: 'CHINA',
      type: 'army',
      spaceId: 'china',
    };

    set((state) => ({
      minorPowerPieces: [...state.minorPowerPieces, frenchArmy, chineseArmy],
      chinaHomeMarker: true,
    }));
  },
}));
