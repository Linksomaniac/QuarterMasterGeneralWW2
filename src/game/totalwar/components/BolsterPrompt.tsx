import React from 'react';
import { useTotalWarStore } from '../store';
import { COUNTRY_NAMES, COUNTRY_COLORS } from '../../types';

/**
 * BolsterPrompt — shown when a bolster card can be played as a reaction.
 * Allows the human player to accept or decline.
 */
export default function BolsterPrompt() {
  const pendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);
  if (!pendingAction || pendingAction.type !== 'BOLSTER_OPPORTUNITY') return null;

  const { country, bolsterCardName, description } = pendingAction;
  const color = COUNTRY_COLORS[country];

  const handleAccept = () => {
    const tw = useTotalWarStore.getState();
    tw.markBolsterUsed(pendingAction.bolsterCardId);
    tw.setPendingTotalWarAction(null);
    // TODO: execute bolster effect
  };

  const handleDecline = () => {
    useTotalWarStore.getState().setPendingTotalWarAction(null);
  };

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-orange-700/50 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-xs uppercase tracking-wider text-orange-500 mb-1">Bolster Reaction</div>
          <div className="text-lg font-bold" style={{ color }}>
            {COUNTRY_NAMES[country]}
          </div>
        </div>

        <div className="bg-orange-900/20 border border-orange-800/30 rounded-lg p-3 mb-4">
          <div className="text-sm font-medium text-orange-300 mb-1">{bolsterCardName}</div>
          <div className="text-xs text-gray-400">{description}</div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-orange-700 hover:bg-orange-600 text-white transition-colors"
          >
            Use Bolster
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
