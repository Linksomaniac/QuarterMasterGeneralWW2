import React, { useRef, useEffect, useState } from 'react';
import {
  Country,
  CardType,
  COUNTRY_COLORS,
  COUNTRY_NAMES,
  COUNTRY_SHORT,
  Team,
  getTeam,
  TURN_ORDER,
  GamePhase,
  Card,
} from '../game/types';
import { useGameStore } from '../game/store';
import { getCurrentCountry, getAvailablePieces } from '../game/engine';

const CARD_TYPE_BREAKDOWN: { type: CardType; label: string; icon: string }[] = [
  { type: CardType.BUILD_ARMY, label: 'Build Army', icon: '⚔' },
  { type: CardType.BUILD_NAVY, label: 'Build Navy', icon: '⚓' },
  { type: CardType.LAND_BATTLE, label: 'Land Battle', icon: '💥' },
  { type: CardType.SEA_BATTLE, label: 'Sea Battle', icon: '🌊' },
  { type: CardType.STATUS, label: 'Status', icon: '🏛' },
  { type: CardType.RESPONSE, label: 'Response', icon: '🛡' },
  { type: CardType.EVENT, label: 'Event', icon: '📜' },
  { type: CardType.ECONOMIC_WARFARE, label: 'Econ War', icon: '💰' },
];

function countByType(cards: Card[]): Record<CardType, number> {
  const counts = {} as Record<CardType, number>;
  for (const ct of Object.values(CardType)) counts[ct] = 0;
  for (const c of cards) counts[c.type]++;
  return counts;
}

function VPTrack() {
  const axisVP = useGameStore((s) => s.axisVP);
  const alliesVP = useGameStore((s) => s.alliesVP);
  const maxVP = Math.max(axisVP, alliesVP, 50);

  return (
    <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#1A3A5A]">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
        Victory Points
      </h3>
      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-red-400 font-bold">Axis</span>
            <span className="text-red-400 font-bold">{axisVP}</span>
          </div>
          <div className="h-2 bg-[#1A2A3A] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-800 to-red-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (axisVP / maxVP) * 100)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-blue-400 font-bold">Allies</span>
            <span className="text-blue-400 font-bold">{alliesVP}</span>
          </div>
          <div className="h-2 bg-[#1A2A3A] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-800 to-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (alliesVP / maxVP) * 100)}%` }}
            />
          </div>
        </div>
      </div>
      <div className="mt-2 text-center">
        <span className={`text-lg font-display font-bold ${axisVP > alliesVP ? 'text-red-400' : axisVP < alliesVP ? 'text-blue-400' : 'text-gray-400'}`}>
          {axisVP > alliesVP ? `Axis +${axisVP - alliesVP}` : axisVP < alliesVP ? `Allies +${alliesVP - axisVP}` : 'Tied'}
        </span>
      </div>
    </div>
  );
}

function CountryStatus({ country }: { country: Country }) {
  const [expanded, setExpanded] = useState(false);
  const state = useGameStore();
  const currentCountry = getCurrentCountry(state);
  const countryState = state.countries[country];
  if (!countryState) return null;

  const isCurrent = currentCountry === country;
  const available = getAvailablePieces(country, state);
  const onBoard = countryState.piecesOnBoard.length;

  const remaining = [...countryState.deck, ...countryState.hand];
  const remainingCounts = countByType(remaining);

  return (
    <div
      className={`rounded-lg p-2 border transition-all ${
        isCurrent
          ? 'border-yellow-500/50 bg-yellow-900/10 shadow-sm shadow-yellow-500/10'
          : 'border-[#1A3A5A] bg-[#0F1C2E]/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full ${isCurrent ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: COUNTRY_COLORS[country] }}
        />
        <span
          className="text-xs font-bold"
          style={{ color: COUNTRY_COLORS[country] }}
        >
          {COUNTRY_SHORT[country]}
        </span>
        <span className="text-[9px] text-gray-500">
          {countryState.isHuman ? '👤' : '🤖'}
        </span>
        {isCurrent && (
          <span className="text-[8px] text-yellow-500 ml-auto font-medium">
            ● Active
          </span>
        )}
      </div>
      <div className="flex gap-3 mt-1 text-[9px] text-gray-500">
        <span>🃏 {countryState.hand.length}</span>
        <span>📚 {countryState.deck.length}</span>
        <span>⚔ {onBoard}</span>
        <span className="text-gray-600">
          ({available.armies}A {available.navies}N left)
        </span>
      </div>

      {/* Card type breakdown toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-1 text-[8px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 w-full"
      >
        <span className="text-[7px]">{expanded ? '▼' : '▶'}</span>
        <span>{remaining.length} cards remaining</span>
      </button>

      {expanded && (
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
          {CARD_TYPE_BREAKDOWN.map(({ type, label, icon }) => {
            const count = remainingCounts[type];
            return (
              <div
                key={type}
                className="flex items-center gap-1 text-[8px]"
                style={{ opacity: count > 0 ? 1 : 0.35 }}
              >
                <span className="w-3 text-center">{icon}</span>
                <span className="text-gray-400 truncate">{label}</span>
                <span className="ml-auto font-bold text-gray-300">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {(countryState.statusCards.length > 0 || countryState.responseCards.length > 0) && (
        <div className="mt-1.5 space-y-0.5">
          {countryState.statusCards.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-1 text-[9px] rounded px-1.5 py-0.5 cursor-help relative group"
              style={{
                backgroundColor: COUNTRY_COLORS[country] + '18',
                color: COUNTRY_COLORS[country],
              }}
            >
              <span className="opacity-70">🏛</span>
              <span className="font-medium truncate">{c.name}</span>
              <div className="absolute left-full top-0 ml-1.5 w-52 p-2 rounded bg-[#0A1628] border border-[#1A3A5A] text-[10px] text-gray-300 leading-snug shadow-xl z-50 hidden group-hover:block pointer-events-none">
                <div className="font-semibold mb-0.5" style={{ color: COUNTRY_COLORS[country] }}>{c.name}</div>
                {c.text}
              </div>
            </div>
          ))}
          {countryState.responseCards.length > 0 && (
            <div className="flex items-center gap-1 text-[9px] text-gray-500 px-1.5 py-0.5 rounded bg-[#1A2A3A]">
              <span className="opacity-70">🛡</span>
              <span>{countryState.responseCards.length} response{countryState.responseCards.length !== 1 ? 's' : ''} ready</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GameLog() {
  const log = useGameStore((s) => s.log);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  const recentLog = log.slice(-30);

  return (
    <div className="bg-[#0F1C2E] rounded-lg border border-[#1A3A5A] flex flex-col" style={{ maxHeight: '200px' }}>
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider p-2 pb-1">
        Game Log
      </h3>
      <div className="overflow-y-auto px-2 pb-2 flex-1 space-y-0.5">
        {recentLog.map((entry, i) => (
          <div key={i} className="text-[10px] leading-snug">
            <span className="text-gray-600">R{entry.round}</span>{' '}
            <span style={{ color: COUNTRY_COLORS[entry.country] }} className="font-medium">
              {COUNTRY_SHORT[entry.country]}
            </span>{' '}
            <span className="text-gray-400">{entry.message}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

export default function Sidebar() {
  const state = useGameStore();
  const { round, phase, winner } = state;
  const resetGame = useGameStore((s) => s.resetGame);

  const axisCountries = TURN_ORDER.filter((c) => getTeam(c) === Team.AXIS);
  const alliedCountries = TURN_ORDER.filter((c) => getTeam(c) === Team.ALLIES);

  return (
    <div className="w-72 flex flex-col gap-3 p-3 bg-[#0A1628]/90 border-l border-[#1A3A5A] overflow-y-auto">
      {/* Round & Phase */}
      <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#1A3A5A] text-center">
        <div className="text-xs text-gray-400 uppercase tracking-wider">Round</div>
        <div className="text-2xl font-display font-bold text-board-supply">{round} / 20</div>
        <div className="text-[10px] text-gray-400 mt-1 uppercase">
          {phase.replace(/_/g, ' ')}
        </div>
      </div>

      <VPTrack />

      {/* Axis */}
      <div>
        <div className="text-[10px] font-bold text-red-400/70 uppercase tracking-wider mb-1 px-1">
          Axis Powers
        </div>
        <div className="space-y-1">
          {axisCountries.map((c) => (
            <CountryStatus key={c} country={c} />
          ))}
        </div>
      </div>

      {/* Allies */}
      <div>
        <div className="text-[10px] font-bold text-blue-400/70 uppercase tracking-wider mb-1 px-1">
          Allied Powers
        </div>
        <div className="space-y-1">
          {alliedCountries.map((c) => (
            <CountryStatus key={c} country={c} />
          ))}
        </div>
      </div>

      <GameLog />

      {/* Game Over */}
      {winner && (
        <div className={`rounded-lg p-4 text-center border-2 ${winner === Team.AXIS ? 'border-red-500 bg-red-950/30' : 'border-blue-500 bg-blue-950/30'}`}>
          <div className="text-xl font-display font-bold mb-1" style={{ color: winner === Team.AXIS ? '#ef4444' : '#3b82f6' }}>
            {winner === Team.AXIS ? 'Axis' : 'Allies'} Victory!
          </div>
          <div className="text-xs text-gray-400 mb-3">
            Axis: {state.axisVP} VP &bull; Allies: {state.alliesVP} VP
          </div>
          <button
            onClick={resetGame}
            className="px-6 py-2 rounded bg-board-supply text-gray-900 font-bold text-sm hover:bg-yellow-500 transition-colors"
          >
            New Game
          </button>
        </div>
      )}

      {!winner && (
        <button
          onClick={resetGame}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors py-1"
        >
          Return to Setup
        </button>
      )}
    </div>
  );
}
