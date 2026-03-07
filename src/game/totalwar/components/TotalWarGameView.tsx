import React from 'react';
import TotalWarGameBoard from './TotalWarGameBoard';
import CardHand from '../../../components/CardHand';
import AirStepOverlay from './AirStepOverlay';
import TotalWarSidebar from './TotalWarSidebar';
import BolsterPrompt from './BolsterPrompt';
import AirCombatPrompt from './AirCombatPrompt';
import ReallocateResourcesPrompt from './ReallocateResourcesPrompt';
import TotalWarSetupDiscard from './TotalWarSetupDiscard';
import { useTotalWarStore } from '../store';
import { useTotalWarController } from '../hooks';

/**
 * TotalWarGameView — replaces the base App layout when expansion is active.
 * Uses the same base components but adds:
 * - Controller hook that intercepts base game flow for expansion logic
 * - Air Step overlay during Air Step phase
 * - Bolster prompt for bolster card reactions
 * - Custom setup discard (5 from 12 instead of base 3 from 10)
 * - Expanded sidebar with AF counts, minor power info
 */
export default function TotalWarGameView() {
  // Wire expansion into base game flow
  useTotalWarController();

  const inAirStep = useTotalWarStore((s) => s.inAirStep);
  const pendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);
  const isSetupDiscard = pendingAction?.type === 'TW_SETUP_DISCARD';

  return (
    <div className="h-screen flex flex-col bg-[#1A2E1A] overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-2 overflow-auto relative">
            <TotalWarGameBoard />
            {/* Air Step choice overlay — only for human players (AI resolves automatically) */}
            {inAirStep && pendingAction?.type === 'AIR_STEP_CHOICE' && <AirStepOverlay />}
            {/* Bolster prompt */}
            {pendingAction?.type === 'BOLSTER_OPPORTUNITY' && <BolsterPrompt />}
            {/* Air Defense / Air Attack prompts */}
            {(pendingAction?.type === 'AIR_DEFENSE_OPPORTUNITY' ||
              pendingAction?.type === 'AIR_ATTACK_OPPORTUNITY') && <AirCombatPrompt />}
            {/* Reallocate Resources prompts */}
            {(pendingAction?.type === 'REALLOCATE_RESOURCES_OFFER' ||
              pendingAction?.type === 'REALLOCATE_RESOURCES_DISCARD' ||
              pendingAction?.type === 'REALLOCATE_RESOURCES_PICK') && <ReallocateResourcesPrompt />}
          </div>
          {/* Custom TW setup discard panel (5 from 12) replaces base CardHand during setup */}
          {isSetupDiscard ? <TotalWarSetupDiscard /> : <CardHand />}
        </div>
        <TotalWarSidebar />
      </div>
    </div>
  );
}
