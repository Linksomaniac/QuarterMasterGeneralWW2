import React from 'react';
import TotalWarGameBoard from './TotalWarGameBoard';
import CardHand from '../../../components/CardHand';
import AirStepOverlay from './AirStepOverlay';
import TotalWarSidebar from './TotalWarSidebar';
import BolsterPrompt from './BolsterPrompt';
import { useTotalWarStore } from '../store';
import { useTotalWarController } from '../hooks';

/**
 * TotalWarGameView — replaces the base App layout when expansion is active.
 * Uses the same base components but adds:
 * - Controller hook that intercepts base game flow for expansion logic
 * - Air Step overlay during Air Step phase
 * - Bolster prompt for bolster card reactions
 * - Expanded sidebar with AF counts, minor power info
 */
export default function TotalWarGameView() {
  // Wire expansion into base game flow
  useTotalWarController();

  const inAirStep = useTotalWarStore((s) => s.inAirStep);
  const pendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);

  return (
    <div className="h-screen flex flex-col bg-[#1A2E1A] overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-2 overflow-auto relative">
            <TotalWarGameBoard />
            {/* Air Step choice overlay */}
            {inAirStep && <AirStepOverlay />}
            {/* Bolster prompt */}
            {pendingAction?.type === 'BOLSTER_OPPORTUNITY' && <BolsterPrompt />}
          </div>
          <CardHand />
        </div>
        <TotalWarSidebar />
      </div>
    </div>
  );
}
