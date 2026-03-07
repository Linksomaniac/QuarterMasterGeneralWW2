import React from 'react';
import { useTotalWarStore } from '../store';
import { useGameStore } from '../../store';
import { COUNTRY_NAMES, COUNTRY_COLORS } from '../../types';

/**
 * AirCombatPrompt — shown when a human player has an Air Defense or Air Attack
 * opportunity during battle.
 *
 * Air Defense: defender can sacrifice their AF to save a piece from elimination.
 * Air Attack: attacker can use their supplied adjacent AF to eliminate an enemy
 *   AF in the battle space (free bonus elimination after primary battle).
 */
export default function AirCombatPrompt() {
  const pendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);

  if (!pendingAction) return null;

  if (pendingAction.type === 'AIR_DEFENSE_OPPORTUNITY') {
    return <AirDefensePrompt />;
  }

  if (pendingAction.type === 'AIR_ATTACK_OPPORTUNITY') {
    return <AirAttackPrompt />;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Air Defense Prompt
// ---------------------------------------------------------------------------

function AirDefensePrompt() {
  const pendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);
  if (!pendingAction || pendingAction.type !== 'AIR_DEFENSE_OPPORTUNITY') return null;

  const { defenderCountry, battleSpaceId, threatenedPieceId, threatenedPieceType, airForceId } = pendingAction;
  const color = COUNTRY_COLORS[defenderCountry];
  const spaceName = battleSpaceId.replace(/_/g, ' ');

  const handleAccept = () => {
    // Sacrifice the AF to save the piece
    const tw = useTotalWarStore.getState();

    // Restore the eliminated piece from the previous state.
    // The piece was already removed by the base store, so we need to re-add it.
    useGameStore.setState((s) => {
      const cs = s.countries[defenderCountry];
      // Reconstruct the piece
      const restoredPiece = {
        id: threatenedPieceId,
        country: defenderCountry,
        type: threatenedPieceType,
        spaceId: battleSpaceId,
      };
      return {
        countries: {
          ...s.countries,
          [defenderCountry]: {
            ...cs,
            piecesOnBoard: [...cs.piecesOnBoard, restoredPiece],
          },
        },
      };
    });

    // Remove the AF
    tw.removeAirForce(airForceId);

    // Log it
    useGameStore.setState((s) => ({
      log: [
        ...s.log,
        {
          country: defenderCountry,
          message: `Air Defense: Sacrificed Air Force to save ${threatenedPieceType} in ${spaceName}`,
          round: s.round,
          timestamp: Date.now(),
        },
      ],
    }));

    tw.setPendingTotalWarAction(null);
  };

  const handleDecline = () => {
    // Don't use air defense — let the piece stay eliminated
    useTotalWarStore.getState().setPendingTotalWarAction(null);
  };

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-blue-700/50 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-xs uppercase tracking-wider text-blue-400 mb-1">Air Defense</div>
          <div className="text-lg font-bold" style={{ color }}>
            {COUNTRY_NAMES[defenderCountry]}
          </div>
        </div>

        <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 mb-4">
          <div className="text-sm text-gray-300">
            Your <span className="font-medium text-white">{threatenedPieceType}</span> in{' '}
            <span className="font-medium text-white capitalize">{spaceName}</span> is about
            to be eliminated in battle.
          </div>
          <div className="text-sm text-blue-300 mt-2">
            You have an Air Force in this space. Sacrifice it to save your {threatenedPieceType}?
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-700 hover:bg-blue-600 text-white transition-colors"
          >
            Sacrifice AF (Save Piece)
          </button>
          <button
            onClick={handleDecline}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-700"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Air Attack Prompt
// ---------------------------------------------------------------------------

function AirAttackPrompt() {
  const pendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);
  if (!pendingAction || pendingAction.type !== 'AIR_ATTACK_OPPORTUNITY') return null;

  const { attackerCountry, defenderCountry, battleSpaceId, defenderAFSpaceId } = pendingAction;
  const color = COUNTRY_COLORS[attackerCountry];
  const spaceName = battleSpaceId.replace(/_/g, ' ');

  const handleAccept = () => {
    const tw = useTotalWarStore.getState();

    // Find the defender's AF in the battle space
    const defenderAF = tw.airForces.find(
      (af) => af.country === defenderCountry && af.spaceId === defenderAFSpaceId && !af.minorPower
    );

    if (defenderAF) {
      tw.removeAirForce(defenderAF.id);

      // Log it
      useGameStore.setState((s) => ({
        log: [
          ...s.log,
          {
            country: attackerCountry,
            message: `Air Attack: Eliminated enemy Air Force in ${spaceName}`,
            round: s.round,
            timestamp: Date.now(),
          },
        ],
      }));
    }

    tw.setPendingTotalWarAction(null);
  };

  const handleDecline = () => {
    useTotalWarStore.getState().setPendingTotalWarAction(null);
  };

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-red-700/50 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-xs uppercase tracking-wider text-red-400 mb-1">Air Attack</div>
          <div className="text-lg font-bold" style={{ color }}>
            {COUNTRY_NAMES[attackerCountry]}
          </div>
        </div>

        <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3 mb-4">
          <div className="text-sm text-gray-300">
            After your battle in{' '}
            <span className="font-medium text-white capitalize">{spaceName}</span>,
            you can use your Air Force to also eliminate{' '}
            <span className="font-medium text-white">{COUNTRY_NAMES[defenderCountry]}</span>'s
            Air Force in that space.
          </div>
          <div className="text-sm text-red-300 mt-2">
            This is a free bonus elimination -- your Air Force stays on the board.
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-700 hover:bg-red-600 text-white transition-colors"
          >
            Air Attack (Eliminate AF)
          </button>
          <button
            onClick={handleDecline}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-700"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
