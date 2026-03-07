import React from 'react';
import { useTotalWarStore } from '../store';
import { useGameStore } from '../../store';
import { COUNTRY_NAMES, COUNTRY_COLORS } from '../../types';

/**
 * AirStepOverlay — shown during the Air Step phase.
 * Allows the player to choose: Deploy, Marshal, Gain Superiority, or Skip.
 */
export default function AirStepOverlay() {
  const airStepCountry = useTotalWarStore((s) => s.airStepCountry);
  const pendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);

  if (!airStepCountry) return null;

  const countryName = COUNTRY_NAMES[airStepCountry];
  const color = COUNTRY_COLORS[airStepCountry];

  // If there's a specific pending action (like selecting deploy location), show that UI
  if (pendingAction) {
    return <AirStepPendingAction />;
  }

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Air Step</div>
          <div className="text-lg font-bold" style={{ color }}>
            {countryName}
          </div>
        </div>

        <p className="text-sm text-gray-400 text-center mb-6">
          Choose an action for your Air Step, or skip.
        </p>

        <div className="space-y-3">
          <AirStepButton
            label="Deploy Air Force"
            description="Discard an Air Power card to place an Air Force"
            icon="✈️"
            onClick={() => handleAirStepChoice('DEPLOY')}
            disabled={false} // TODO: check canDeploy
          />
          <AirStepButton
            label="Marshal Air Force"
            description="Discard any card to move a supplied Air Force"
            icon="↗️"
            onClick={() => handleAirStepChoice('MARSHAL')}
            disabled={false} // TODO: check canMarshal
          />
          <AirStepButton
            label="Gain Air Superiority"
            description="Discard an Air Power card to eliminate adjacent enemy AF"
            icon="💥"
            onClick={() => handleAirStepChoice('GAIN_SUPERIORITY')}
            disabled={false} // TODO: check canGainSuperiority
          />
          <button
            onClick={() => handleAirStepChoice('SKIP')}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Skip Air Step
          </button>
        </div>
      </div>
    </div>
  );
}

function handleAirStepChoice(action: 'DEPLOY' | 'MARSHAL' | 'GAIN_SUPERIORITY' | 'SKIP') {
  const twStore = useTotalWarStore.getState();

  if (action === 'SKIP') {
    twStore.completeAirStep();
    return;
  }

  // Set the appropriate pending action based on choice
  const country = twStore.airStepCountry!;

  switch (action) {
    case 'DEPLOY':
      twStore.setPendingTotalWarAction({
        type: 'SELECT_AF_DISCARD_FOR_DEPLOY',
        country,
      });
      break;
    case 'MARSHAL':
      twStore.setPendingTotalWarAction({
        type: 'SELECT_AF_DISCARD_FOR_MARSHAL',
        country,
      });
      break;
    case 'GAIN_SUPERIORITY':
      twStore.setPendingTotalWarAction({
        type: 'SELECT_AF_DISCARD_FOR_SUPERIORITY',
        country,
      });
      break;
  }
}

function AirStepButton({
  label,
  description,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  description: string;
  icon: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
        disabled
          ? 'border-gray-800 bg-gray-900/50 text-gray-600 cursor-not-allowed'
          : 'border-gray-700 bg-gray-800/50 text-gray-200 hover:bg-gray-700/50 hover:border-sky-600'
      }`}
    >
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
    </button>
  );
}

function AirStepPendingAction() {
  const pendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);
  if (!pendingAction) return null;

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center text-gray-300">
          <div className="text-sm mb-2">Air Step Action</div>
          <div className="text-xs text-gray-500">
            {pendingAction.type === 'SELECT_AF_DISCARD_FOR_DEPLOY' && 'Select an Air Power card from your hand to discard for deployment.'}
            {pendingAction.type === 'SELECT_AF_DISCARD_FOR_MARSHAL' && 'Select any card from your hand to discard for marshaling.'}
            {pendingAction.type === 'SELECT_AF_DISCARD_FOR_SUPERIORITY' && 'Select an Air Power card from your hand to discard for air superiority.'}
            {pendingAction.type === 'SELECT_AF_DEPLOY_LOCATION' && 'Click a valid space to deploy your Air Force.'}
            {pendingAction.type === 'SELECT_AF_MARSHAL_SOURCE' && 'Select an Air Force to marshal.'}
            {pendingAction.type === 'SELECT_AF_MARSHAL_DESTINATION' && 'Click a destination space for your Air Force.'}
            {pendingAction.type === 'SELECT_AF_SUPERIORITY_TARGET' && 'Select an enemy Air Force to eliminate.'}
          </div>
          <button
            onClick={() => {
              useTotalWarStore.getState().setPendingTotalWarAction(null);
              useTotalWarStore.getState().completeAirStep();
            }}
            className="mt-4 px-4 py-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
