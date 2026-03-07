import React from 'react';
import { GamePhase } from '../../types';
import { useGameStore } from '../../store';
import { useTotalWarStore } from '../store';
import App from '../../../App';
import TotalWarSetupScreen from './TotalWarSetupScreen';
import TotalWarGameView from './TotalWarGameView';

/**
 * AppWrapper — the single entry point that replaces App in main.tsx.
 * Routes to base App or Total War components based on expansion state.
 */
export default function AppWrapper() {
  const phase = useGameStore((s) => s.phase);
  const twEnabled = useTotalWarStore((s) => s.enabled);

  // Before game starts, show the TW-aware setup screen
  if (phase === GamePhase.SETUP) {
    return <TotalWarSetupScreen />;
  }

  // During gameplay, use TW game view if expansion is enabled
  if (twEnabled) {
    return <TotalWarGameView />;
  }

  // Base game — delegate to original App
  return <App />;
}
