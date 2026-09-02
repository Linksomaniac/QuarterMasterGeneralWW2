import React from 'react';
import { useTotalWarStore } from '../store';
import { useGameStore } from '../../store';
import { COUNTRY_NAMES, COUNTRY_COLORS, Card, Country } from '../../types';
import { TotalWarCard, AirForcePiece } from '../types';
import {
  canDeploy,
  canMarshal,
  canGainSuperiority,
  getValidDeployLocations,
  getValidMarshalSources,
  getValidMarshalDestinations,
  getValidSuperiorityTargets,
} from '../engine';

/** Append a log entry to the base game store */
function twLog(country: Country, message: string) {
  useGameStore.setState((s) => ({
    log: [...s.log, { country, message, round: s.round, timestamp: Date.now() }],
  }));
}

function discardCardFromHand(country: Country, cardId: string) {
  useGameStore.setState((s) => {
    const cs = s.countries[country];
    const card = cs.hand.find((c: Card) => c.id === cardId);
    if (!card) return {};
    return {
      countries: {
        ...s.countries,
        [country]: {
          ...cs,
          hand: cs.hand.filter((c: Card) => c.id !== cardId),
          discard: [...cs.discard, card],
        },
      },
    };
  });
}

/**
 * AirStepOverlay — shown during the Air Step phase.
 * Allows the player to choose: Deploy, Marshal, Gain Superiority, or Skip,
 * and walks them through the follow-up card-discard / space-selection /
 * target-selection steps for whichever action they picked.
 */
export default function AirStepOverlay() {
  const airStepCountry = useTotalWarStore((s) => s.airStepCountry);
  const pendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);

  if (!airStepCountry) return null;

  const countryName = COUNTRY_NAMES[airStepCountry];
  const color = COUNTRY_COLORS[airStepCountry];

  // If there's a specific sub-action (like selecting a card to discard, or a
  // target), show that UI. AIR_STEP_CHOICE means we're at the main choice
  // screen — show it below.
  if (pendingAction && pendingAction.type !== 'AIR_STEP_CHOICE') {
    return <AirStepPendingAction />;
  }

  const state = useGameStore.getState();
  const tw = useTotalWarStore.getState();
  const deployOk = canDeploy(airStepCountry, state, tw);
  const marshalOk = canMarshal(airStepCountry, state, tw);
  const superiorityOk = canGainSuperiority(airStepCountry, state, tw);

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
            disabled={!deployOk}
          />
          <AirStepButton
            label="Marshal Air Force"
            description="Discard any card to move a supplied Air Force"
            icon="↗️"
            onClick={() => handleAirStepChoice('MARSHAL')}
            disabled={!marshalOk}
          />
          <AirStepButton
            label="Gain Air Superiority"
            description="Discard an Air Power card to eliminate adjacent enemy AF"
            icon="💥"
            onClick={() => handleAirStepChoice('GAIN_SUPERIORITY')}
            disabled={!superiorityOk}
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

/** Cancel a sub-action and go back to skipping the Air Step entirely. */
function cancel() {
  useTotalWarStore.getState().setPendingTotalWarAction(null);
  useTotalWarStore.getState().completeAirStep();
}

function PickerPanel({
  title,
  items,
  onPick,
  emptyMessage,
}: {
  title: string;
  items: { key: string; label: string; sub?: string }[];
  onPick: (key: string) => void;
  emptyMessage: string;
}) {
  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-sm text-gray-300 mb-3">{title}</div>
        {items.length === 0 ? (
          <div className="text-xs text-gray-500 mb-4">{emptyMessage}</div>
        ) : (
          <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.key}
                onClick={() => onPick(item.key)}
                className="w-full text-left px-3 py-2 rounded-lg border border-gray-700 bg-gray-800/60 text-gray-200 hover:bg-gray-700/60 hover:border-sky-600 transition-colors"
              >
                <div className="text-sm font-medium">{item.label}</div>
                {item.sub && <div className="text-[11px] text-gray-500">{item.sub}</div>}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={cancel}
          className="px-4 py-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function AirStepPendingAction() {
  const pendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);
  if (!pendingAction) return null;

  const state = useGameStore.getState();
  const tw = useTotalWarStore.getState();

  // --- Card-discard steps ---
  if (pendingAction.type === 'SELECT_AF_DISCARD_FOR_DEPLOY' || pendingAction.type === 'SELECT_AF_DISCARD_FOR_SUPERIORITY') {
    const country = pendingAction.country;
    const hand = state.countries[country]?.hand ?? [];
    const airPowerCards = hand.filter((c) => (c as unknown as TotalWarCard).type === 'AIR_POWER');
    const isDeploy = pendingAction.type === 'SELECT_AF_DISCARD_FOR_DEPLOY';

    return (
      <PickerPanel
        title={`Select an Air Power card to discard for ${isDeploy ? 'deployment' : 'air superiority'}.`}
        emptyMessage="No Air Power cards available."
        items={airPowerCards.map((c) => ({ key: c.id, label: c.name }))}
        onPick={(cardId) => {
          discardCardFromHand(country, cardId);
          if (isDeploy) {
            const freshTw = useTotalWarStore.getState();
            const freshState = useGameStore.getState();
            const locations = getValidDeployLocations(country, freshState, freshTw);
            if (locations.length === 0) {
              cancel();
              return;
            }
            useTotalWarStore.getState().setPendingTotalWarAction({
              type: 'SELECT_AF_DEPLOY_LOCATION',
              country,
              validSpaces: locations,
            });
          } else {
            const freshTw = useTotalWarStore.getState();
            const freshState = useGameStore.getState();
            const targets = getValidSuperiorityTargets(country, freshState, freshTw);
            if (targets.length === 0) {
              cancel();
              return;
            }
            useTotalWarStore.getState().setPendingTotalWarAction({
              type: 'SELECT_AF_SUPERIORITY_TARGET',
              country,
              validTargets: targets.map((t) => ({
                afId: t.afId,
                spaceId: t.spaceId,
                spaceName: t.spaceId.replace(/_/g, ' '),
                ownerCountry: t.ownerCountry,
                ownerMinorPower: t.ownerMinorPower,
              })),
            });
          }
        }}
      />
    );
  }

  if (pendingAction.type === 'SELECT_AF_DISCARD_FOR_MARSHAL') {
    const country = pendingAction.country;
    const hand = state.countries[country]?.hand ?? [];

    return (
      <PickerPanel
        title="Select a card to discard for marshaling."
        emptyMessage="No cards in hand."
        items={hand.map((c) => ({ key: c.id, label: c.name }))}
        onPick={(cardId) => {
          discardCardFromHand(country, cardId);
          const freshTw = useTotalWarStore.getState();
          const freshState = useGameStore.getState();
          const sources = getValidMarshalSources(country, freshState, freshTw);
          if (sources.length === 0) {
            cancel();
            return;
          }
          if (sources.length === 1) {
            const dests = getValidMarshalDestinations(sources[0].id, country, freshState, freshTw);
            if (dests.length === 0) {
              cancel();
              return;
            }
            useTotalWarStore.getState().setPendingTotalWarAction({
              type: 'SELECT_AF_MARSHAL_DESTINATION',
              country,
              afId: sources[0].id,
              validSpaces: dests,
            });
            return;
          }
          useTotalWarStore.getState().setPendingTotalWarAction({
            type: 'SELECT_AF_MARSHAL_SOURCE',
            country,
            eligibleAirForces: sources.map((af: AirForcePiece) => ({
              afId: af.id,
              spaceId: af.spaceId,
              spaceName: af.spaceId.replace(/_/g, ' '),
            })),
          });
        }}
      />
    );
  }

  if (pendingAction.type === 'SELECT_AF_MARSHAL_SOURCE') {
    const country = pendingAction.country;
    return (
      <PickerPanel
        title="Select an Air Force to marshal."
        emptyMessage="No supplied Air Forces available."
        items={pendingAction.eligibleAirForces.map((af) => ({ key: af.afId, label: af.spaceName }))}
        onPick={(afId) => {
          const freshTw = useTotalWarStore.getState();
          const freshState = useGameStore.getState();
          const dests = getValidMarshalDestinations(afId, country, freshState, freshTw);
          if (dests.length === 0) {
            cancel();
            return;
          }
          useTotalWarStore.getState().setPendingTotalWarAction({
            type: 'SELECT_AF_MARSHAL_DESTINATION',
            country,
            afId,
            validSpaces: dests,
          });
        }}
      />
    );
  }

  if (pendingAction.type === 'SELECT_AF_SUPERIORITY_TARGET') {
    const country = pendingAction.country;
    return (
      <PickerPanel
        title="Select an enemy Air Force to eliminate."
        emptyMessage="No valid targets."
        items={pendingAction.validTargets.map((t) => ({
          key: t.afId,
          label: t.spaceName,
          sub: COUNTRY_NAMES[t.ownerCountry],
        }))}
        onPick={(afId) => {
          const target = pendingAction.validTargets.find((t) => t.afId === afId);
          useTotalWarStore.getState().removeAirForce(afId);
          twLog(country, `Air Step: Eliminated enemy AF at ${(target?.spaceName ?? 'unknown')}`);
          useTotalWarStore.getState().setPendingTotalWarAction(null);
          useTotalWarStore.getState().completeAirStep();
        }}
      />
    );
  }

  // --- Space-selection steps (resolved by clicking the board) ---
  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 pointer-events-none">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl pointer-events-auto">
        <div className="text-center text-gray-300">
          <div className="text-sm mb-2">Air Step Action</div>
          <div className="text-xs text-gray-500">
            {pendingAction.type === 'SELECT_AF_DEPLOY_LOCATION' && 'Click a highlighted space to deploy your Air Force.'}
            {pendingAction.type === 'SELECT_AF_MARSHAL_DESTINATION' && 'Click a highlighted destination space for your Air Force.'}
          </div>
          <button
            onClick={cancel}
            className="mt-4 px-4 py-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
