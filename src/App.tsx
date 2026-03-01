import React from 'react';
import { GamePhase } from './game/types';
import { useGameStore } from './game/store';
import SetupScreen from './components/SetupScreen';
import GameBoard from './components/GameBoard';
import CardHand from './components/CardHand';
import Sidebar from './components/Sidebar';

export default function App() {
  const phase = useGameStore((s) => s.phase);

  if (phase === GamePhase.SETUP) {
    return <SetupScreen />;
  }

  return (
    <div className="h-screen flex flex-col bg-[#1A2E1A] overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-2 overflow-auto">
            <GameBoard />
          </div>
          <CardHand />
        </div>
        <Sidebar />
      </div>
    </div>
  );
}
