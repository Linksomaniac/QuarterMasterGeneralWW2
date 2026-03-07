import React, { useState } from 'react';
import {
  Country,
  COUNTRY_NAMES,
  COUNTRY_COLORS,
  getTeam,
  Team,
} from '../../types';
import { PlayerConfig, useGameStore } from '../../store';
import { useTotalWarStore } from '../store';
import { initTotalWarGame } from '../storeWrapper';

const ALL_COUNTRIES: Country[] = [
  Country.GERMANY,
  Country.UK,
  Country.JAPAN,
  Country.SOVIET_UNION,
  Country.ITALY,
  Country.USA,
];

const PRESETS: Record<string, Record<Country, 'human' | 'ai'>> = {
  '1 vs 5 AI': {
    [Country.GERMANY]: 'human',
    [Country.UK]: 'ai',
    [Country.JAPAN]: 'ai',
    [Country.SOVIET_UNION]: 'ai',
    [Country.ITALY]: 'ai',
    [Country.USA]: 'ai',
  },
  '2 Players': {
    [Country.GERMANY]: 'human',
    [Country.UK]: 'human',
    [Country.JAPAN]: 'ai',
    [Country.SOVIET_UNION]: 'ai',
    [Country.ITALY]: 'ai',
    [Country.USA]: 'ai',
  },
  '6 Players': {
    [Country.GERMANY]: 'human',
    [Country.UK]: 'human',
    [Country.JAPAN]: 'human',
    [Country.SOVIET_UNION]: 'human',
    [Country.ITALY]: 'human',
    [Country.USA]: 'human',
  },
  'All AI': {
    [Country.GERMANY]: 'ai',
    [Country.UK]: 'ai',
    [Country.JAPAN]: 'ai',
    [Country.SOVIET_UNION]: 'ai',
    [Country.ITALY]: 'ai',
    [Country.USA]: 'ai',
  },
};

export default function TotalWarSetupScreen() {
  const initGame = useGameStore((s) => s.initGame);
  const twStore = useTotalWarStore();

  const [expansionEnabled, setExpansionEnabled] = useState(false);
  const [configs, setConfigs] = useState<Record<Country, { isHuman: boolean; difficulty: 'easy' | 'medium' | 'hard' }>>(
    Object.fromEntries(
      ALL_COUNTRIES.map((c) => [c, { isHuman: c === Country.GERMANY, difficulty: 'hard' as const }])
    ) as any
  );

  const applyPreset = (name: string) => {
    const preset = PRESETS[name];
    if (!preset) return;
    setConfigs(
      Object.fromEntries(
        ALL_COUNTRIES.map((c) => [
          c,
          { isHuman: preset[c] === 'human', difficulty: configs[c].difficulty },
        ])
      ) as any
    );
  };

  const startGame = () => {
    // Set expansion state BEFORE initGame
    twStore.setEnabled(expansionEnabled);

    if (expansionEnabled) {
      twStore.resetState();
      twStore.setEnabled(true);
    }

    const playerConfigs: PlayerConfig[] = ALL_COUNTRIES.map((c) => ({
      country: c,
      isHuman: configs[c].isHuman,
      aiDifficulty: configs[c].difficulty,
    }));

    // Init the base game
    initGame(playerConfigs);

    // If expansion enabled, replace decks with merged versions (12/5 draw/discard)
    // and place starting minor power pieces
    if (expansionEnabled) {
      initTotalWarGame();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #1a2332 50%, #0d1b2a 100%)' }}>
      <div className="w-full max-w-4xl">
        <div className="text-center mb-10">
          <h1 className="font-display text-5xl font-bold text-board-supply tracking-wider mb-2">
            Quartermaster General
          </h1>
          <h2 className="font-display text-2xl text-gray-400 tracking-widest uppercase">
            World War II
          </h2>
          <div className="mt-4 h-0.5 w-48 mx-auto bg-gradient-to-r from-transparent via-board-supply to-transparent" />
        </div>

        {/* Expansion Toggle */}
        <div className="flex justify-center mb-6">
          <button
            onClick={() => setExpansionEnabled(!expansionEnabled)}
            className={`px-6 py-3 rounded-lg text-sm font-bold transition-all border-2 ${
              expansionEnabled
                ? 'bg-red-900/40 border-red-500 text-red-300 shadow-lg shadow-red-900/30'
                : 'bg-gray-800/50 border-gray-600 text-gray-400 hover:border-gray-500'
            }`}
          >
            {expansionEnabled ? '✦ TOTAL WAR EXPANSION — ON' : 'Total War Expansion — OFF'}
          </button>
        </div>

        {/* Expansion info banner */}
        {expansionEnabled && (
          <div className="mb-6 mx-auto max-w-2xl rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-gray-300">
            <div className="font-bold text-red-400 mb-2">Total War Expansion Active</div>
            <ul className="space-y-1 text-xs text-gray-400">
              <li>+ Air Forces — new piece type with Air Step phase</li>
              <li>+ France (controlled by UK) &amp; China (controlled by USA)</li>
              <li>+ Bolster cards — played from hand as reactions</li>
              <li>+ 165 new cards across all nations</li>
              <li>+ Setup: Draw 12 / Discard 5 (vs base 10/3)</li>
              <li>+ Must discard at least 1 card or team loses 1 VP</li>
            </ul>
          </div>
        )}

        <div className="flex gap-2 justify-center mb-8">
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => applyPreset(name)}
              className="px-4 py-2 rounded text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-700"
            >
              {name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {ALL_COUNTRIES.map((country) => {
            const team = getTeam(country);
            const borderColor = team === Team.AXIS ? 'border-red-900/50' : 'border-blue-900/50';
            const teamBg = team === Team.AXIS ? 'bg-red-950/20' : 'bg-blue-950/20';
            return (
              <div
                key={country}
                className={`rounded-lg border ${borderColor} ${teamBg} p-4 transition-all`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-4 h-4 rounded-full shadow-lg"
                    style={{ backgroundColor: COUNTRY_COLORS[country] }}
                  />
                  <h3 className="font-display text-lg font-bold" style={{ color: COUNTRY_COLORS[country] }}>
                    {COUNTRY_NAMES[country]}
                  </h3>
                  <span className={`text-xs px-2 py-0.5 rounded ${team === Team.AXIS ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>
                    {team}
                  </span>
                  {/* Show minor power badges */}
                  {expansionEnabled && country === Country.UK && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-800/50 text-blue-200">+France</span>
                  )}
                  {expansionEnabled && country === Country.USA && (
                    <span className="text-xs px-2 py-0.5 rounded bg-yellow-800/50 text-yellow-200">+China</span>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setConfigs((prev) => ({
                          ...prev,
                          [country]: { ...prev[country], isHuman: true },
                        }))
                      }
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                        configs[country].isHuman
                          ? 'bg-board-supply text-gray-900 shadow-lg'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      Human
                    </button>
                    <button
                      onClick={() =>
                        setConfigs((prev) => ({
                          ...prev,
                          [country]: { ...prev[country], isHuman: false },
                        }))
                      }
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                        !configs[country].isHuman
                          ? 'bg-board-supply text-gray-900 shadow-lg'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      AI
                    </button>
                  </div>

                  {!configs[country].isHuman && (
                    <select
                      value={configs[country].difficulty}
                      onChange={(e) =>
                        setConfigs((prev) => ({
                          ...prev,
                          [country]: { ...prev[country], difficulty: e.target.value as any },
                        }))
                      }
                      className="bg-gray-800 text-gray-300 text-sm rounded px-2 py-1.5 border border-gray-700"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <button
            onClick={startGame}
            className="px-12 py-4 rounded-lg font-display text-xl font-bold bg-gradient-to-r from-board-supply to-yellow-600 text-gray-900 hover:from-yellow-500 hover:to-yellow-700 transition-all shadow-xl hover:shadow-2xl transform hover:scale-105"
          >
            Start Game
          </button>
        </div>

        <div className="mt-8 text-center text-gray-600 text-xs space-y-1">
          <p>Based on the board game by Ian Brody &bull; Griggling Games</p>
          <p>
            Found a bug? Contact{' '}
            <a
              href="mailto:nishitsaraf52@gmail.com?subject=QG%20WW2%20Bug%20Report"
              className="text-board-supply hover:text-yellow-400 underline transition-colors"
            >
              nishitsaraf52@gmail.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
