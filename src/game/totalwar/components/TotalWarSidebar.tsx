import React from 'react';
import Sidebar from '../../../components/Sidebar';
import { useTotalWarStore } from '../store';
import { useGameStore } from '../../store';
import {
  Country,
  COUNTRY_NAMES,
  COUNTRY_COLORS,
  TURN_ORDER,
  getTeam,
  Team,
} from '../../types';
import {
  MinorPower,
  MINOR_POWER_NAMES,
  MINOR_POWER_COLORS,
  MINOR_POWER_CONTROLLER,
  AIR_FORCE_LIMITS,
  MINOR_POWER_PIECES,
} from '../types';

/**
 * TotalWarSidebar — extends the base Sidebar with expansion info.
 * Shows air force counts, minor power status, and expansion indicators.
 */
export default function TotalWarSidebar() {
  return (
    <div className="flex flex-col h-full">
      {/* Expansion info panel at the top */}
      <ExpansionInfoPanel />
      {/* Base sidebar below */}
      <div className="flex-1 overflow-hidden">
        <Sidebar />
      </div>
    </div>
  );
}

function ExpansionInfoPanel() {
  const airForces = useTotalWarStore((s) => s.airForces);
  const minorPowerPieces = useTotalWarStore((s) => s.minorPowerPieces);
  const inAirStep = useTotalWarStore((s) => s.inAirStep);
  const airStepCountry = useTotalWarStore((s) => s.airStepCountry);

  return (
    <div className="bg-gray-900/80 border-b border-gray-700 px-3 py-2 text-xs space-y-2 w-72 shrink-0">
      {/* Air Step indicator */}
      {inAirStep && airStepCountry && (
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-sky-900/30 border border-sky-700/50">
          <span className="text-sky-400">✈</span>
          <span className="text-sky-300 font-medium">
            Air Step — {COUNTRY_NAMES[airStepCountry]}
          </span>
        </div>
      )}

      {/* Air Force counts */}
      <div>
        <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Air Forces</div>
        <div className="flex flex-wrap gap-1">
          {TURN_ORDER.map((country) => {
            const onBoard = airForces.filter((af) => af.country === country && !af.minorPower).length;
            const max = AIR_FORCE_LIMITS[country];
            if (max === 0) return null;
            return (
              <div
                key={country}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-800/50"
                title={`${COUNTRY_NAMES[country]}: ${onBoard}/${max} Air Forces`}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COUNTRY_COLORS[country] }} />
                <span className="text-gray-400">{onBoard}/{max}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Minor Powers */}
      <div>
        <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Minor Powers</div>
        <div className="flex gap-2">
          {(['FRANCE', 'CHINA'] as MinorPower[]).map((mp) => {
            const pieces = minorPowerPieces.filter((p) => p.minorPower === mp);
            const armies = pieces.filter((p) => p.type === 'army').length;
            const navies = pieces.filter((p) => p.type === 'navy').length;
            const afs = airForces.filter((af) => af.minorPower === mp).length;
            const maxA = MINOR_POWER_PIECES[mp].armies;
            const maxN = MINOR_POWER_PIECES[mp].navies;
            const maxAF = MINOR_POWER_PIECES[mp].airForces;
            const controller = MINOR_POWER_CONTROLLER[mp];

            return (
              <div
                key={mp}
                className="flex-1 px-2 py-1 rounded border border-gray-800 bg-gray-800/30"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: MINOR_POWER_COLORS[mp] }} />
                  <span className="font-medium" style={{ color: MINOR_POWER_COLORS[mp] }}>
                    {MINOR_POWER_NAMES[mp]}
                  </span>
                  <span className="text-gray-600 text-[9px]">({COUNTRY_NAMES[controller].slice(0, 2)})</span>
                </div>
                <div className="text-gray-500 text-[10px]">
                  A:{armies}/{maxA} N:{navies}/{maxN} AF:{afs}/{maxAF}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
