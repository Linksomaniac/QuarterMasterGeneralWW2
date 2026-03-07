// ---------------------------------------------------------------------------
// TotalWarGameBoard — Full game board with expansion pieces
// Renders base game content PLUS minor power pieces and air force tokens.
// Replaces the base GameBoard when the Total War expansion is active.
// ---------------------------------------------------------------------------

import React from 'react';
import {
  Country,
  COUNTRY_COLORS,
  COUNTRY_TEXT_ON_BG,
  COUNTRY_SHORT,
  getTeam,
  Team,
  TURN_ORDER,
} from '../../types';
import {
  SPACES,
  MAP_WIDTH,
  MAP_HEIGHT,
} from '../../mapData';
import { useGameStore } from '../../store';
import { getCurrentCountry, getAllPieces, isInSupply, getAvailablePieces } from '../../engine';
import { useTotalWarStore } from '../store';
import {
  MINOR_POWER_COLORS,
  MINOR_POWER_TEXT_ON_BG,
  MINOR_POWER_PIECES,
  AIR_FORCE_LIMITS,
  MINOR_POWER_AF_LIMITS,
} from '../types';

const BOARD_FRAME = '#D4C090';
const TOTAL_W = MAP_WIDTH;
const BOTTOM_H = 170;
const TOTAL_H = MAP_HEIGHT + BOTTOM_H;

// ---------------------------------------------------------------------------
// Token components — same visual style as base GameBoard
// ---------------------------------------------------------------------------

function ArmyToken({ x, y, color, inSupply }: { x: number; y: number; color: string; inSupply: boolean }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(1.5)`} opacity={inSupply ? 1 : 0.35}>
      <rect x={1} y={9} width={34} height={16} rx={3} fill="#000" opacity={0.2} />
      <rect x={0} y={8} width={34} height={16} rx={3} fill={color} stroke="#111" strokeWidth={1} />
      <rect x={8} y={2} width={14} height={9} rx={2} fill={color} stroke="#111" strokeWidth={0.8} />
      <rect x={22} y={4} width={12} height={3.5} rx={1.5} fill={color} stroke="#111" strokeWidth={0.7} />
      <rect x={1} y={20} width={32} height={5} rx={2.5} fill="#1a1a1a" />
      {!inSupply && <text x={17} y={-2} textAnchor="middle" fontSize={11} fill="#ff4444" fontWeight="bold">✕</text>}
    </g>
  );
}

function NavyToken({ x, y, color, inSupply }: { x: number; y: number; color: string; inSupply: boolean }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(1.5)`} opacity={inSupply ? 1 : 0.35}>
      <path d="M1,19 L8,4 L28,4 L35,19 Z" fill="#000" opacity={0.2} />
      <path d="M0,18 L7,3 L27,3 L34,18 Z" fill={color} stroke="#111" strokeWidth={1} />
      <rect x={10} y={-4} width={14} height={9} rx={1.5} fill={color} stroke="#111" strokeWidth={0.8} />
      <line x1={17} y1={-4} x2={17} y2={-12} stroke="#666" strokeWidth={1} />
      <rect x={17} y={-14} width={6} height={4} fill={color} stroke="#111" strokeWidth={0.5} />
      {!inSupply && <text x={17} y={-16} textAnchor="middle" fontSize={11} fill="#ff4444" fontWeight="bold">✕</text>}
    </g>
  );
}

function AFToken({ x, y, color, textColor, inSupply }: { x: number; y: number; color: string; textColor: string; inSupply: boolean }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(1.5)`} opacity={inSupply ? 1 : 0.35}>
      <circle cx={17} cy={12} r={14} fill="#000" opacity={0.15} />
      <circle cx={16} cy={11} r={13} fill={color} stroke="#111" strokeWidth={1.2} />
      <g transform="translate(16, 11) scale(0.5)">
        <path
          d="M0,-12 L3,-6 L12,-2 L12,0 L3,2 L2,8 L6,10 L6,12 L0,10 L-6,12 L-6,10 L-2,8 L-3,2 L-12,0 L-12,-2 L-3,-6 Z"
          fill={textColor}
          opacity={0.9}
        />
      </g>
    </g>
  );
}

// Small icons for the bottom available-pieces tray
function SmallArmyIcon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={0} y={4} width={22} height={10} rx={2} fill={color} stroke="#222" strokeWidth={0.6} />
      <rect x={5} y={0} width={9} height={6} rx={1.5} fill={color} stroke="#222" strokeWidth={0.5} />
      <rect x={14} y={1.5} width={8} height={2.5} rx={1} fill={color} stroke="#222" strokeWidth={0.4} />
      <rect x={1} y={12} width={20} height={3} rx={1.5} fill="#1a1a1a" />
    </g>
  );
}

function SmallNavyIcon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <path d="M0,12 L5,2 L17,2 L22,12 Z" fill={color} stroke="#222" strokeWidth={0.6} />
      <rect x={7} y={-3} width={8} height={6} rx={1} fill={color} stroke="#222" strokeWidth={0.5} />
      <line x1={11} y1={-3} x2={11} y2={-8} stroke="#555" strokeWidth={0.7} />
    </g>
  );
}

function SmallAFIcon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx={10} cy={7} r={7} fill={color} stroke="#222" strokeWidth={0.6} />
      <g transform="translate(10, 7) scale(0.25)">
        <path d="M0,-12 L3,-6 L12,-2 L12,0 L3,2 L2,8 L6,10 L6,12 L0,10 L-6,12 L-6,10 L-2,8 L-3,2 L-12,0 L-12,-2 L-3,-6 Z" fill="#fff" />
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Unified render piece type
// ---------------------------------------------------------------------------

interface RenderPiece {
  id: string;
  type: 'army' | 'navy' | 'air_force';
  color: string;
  textColor: string;
  inSupply: boolean;
  spaceId: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TotalWarGameBoard() {
  const state = useGameStore();
  const { pendingAction, axisVP, alliesVP, round } = state;
  const handleSpaceClick = useGameStore((s) => s.handleSpaceClick);

  // Expansion state
  const airForces = useTotalWarStore((s) => s.airForces);
  const minorPowerPieces = useTotalWarStore((s) => s.minorPowerPieces);
  const twPendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);

  // Build valid-spaces set from base + expansion pending actions
  const validSpaces = new Set<string>();
  if (pendingAction) {
    if (pendingAction.type === 'SELECT_BUILD_LOCATION')
      pendingAction.validSpaces.forEach((s) => validSpaces.add(s));
    if (pendingAction.type === 'SELECT_RECRUIT_LOCATION')
      pendingAction.validSpaces.forEach((s) => validSpaces.add(s));
    if (pendingAction.type === 'SELECT_EVENT_SPACE')
      pendingAction.validSpaces.forEach((s) => validSpaces.add(s));
    if (pendingAction.type === 'SELECT_BATTLE_TARGET')
      pendingAction.validTargets.forEach((s) => validSpaces.add(s));
    if (pendingAction.type === 'SELECT_MOVE_DESTINATION')
      pendingAction.validSpaces.forEach((s) => validSpaces.add(s));
  }
  if (twPendingAction?.type === 'REPOSITION_AIR_FORCE') {
    twPendingAction.validSpaces.forEach((s) => validSpaces.add(s));
  }
  if (twPendingAction?.type === 'SELECT_AF_DEPLOY_LOCATION') {
    twPendingAction.validSpaces.forEach((s) => validSpaces.add(s));
  }

  const currentCountry = getCurrentCountry(state);

  // -----------------------------------------------------------------------
  // Build unified piece list: base pieces + minor power pieces + air forces
  // -----------------------------------------------------------------------

  const basePieces = getAllPieces(state);
  const renderPieces: RenderPiece[] = [];

  for (const p of basePieces) {
    renderPieces.push({
      id: p.id,
      type: p.type,
      color: COUNTRY_COLORS[p.country],
      textColor: COUNTRY_TEXT_ON_BG[p.country],
      inSupply: isInSupply(p, state),
      spaceId: p.spaceId,
    });
  }

  for (const mp of minorPowerPieces) {
    renderPieces.push({
      id: mp.id,
      type: mp.type,
      color: MINOR_POWER_COLORS[mp.minorPower],
      textColor: MINOR_POWER_TEXT_ON_BG[mp.minorPower],
      inSupply: true,
      spaceId: mp.spaceId,
    });
  }

  for (const af of airForces) {
    const color = af.minorPower
      ? MINOR_POWER_COLORS[af.minorPower]
      : COUNTRY_COLORS[af.country];
    const textColor = af.minorPower
      ? MINOR_POWER_TEXT_ON_BG[af.minorPower]
      : COUNTRY_TEXT_ON_BG[af.country];
    renderPieces.push({
      id: af.id,
      type: 'air_force',
      color,
      textColor,
      inSupply: true,
      spaceId: af.spaceId,
    });
  }

  // -----------------------------------------------------------------------
  // Click handler: TW actions first, then fall through to base
  // -----------------------------------------------------------------------

  const onSpaceClick = (spaceId: string) => {
    const tw = useTotalWarStore.getState();
    if (tw.pendingTotalWarAction?.type === 'REPOSITION_AIR_FORCE') {
      tw.moveAirForce(tw.pendingTotalWarAction.afId, spaceId);
      tw.setPendingTotalWarAction(null);
      return;
    }
    handleSpaceClick(spaceId);
  };

  // -----------------------------------------------------------------------
  // Available minor-power pieces (not on board)
  // -----------------------------------------------------------------------

  const franceOnBoard = {
    armies: minorPowerPieces.filter((p) => p.minorPower === 'FRANCE' && p.type === 'army').length,
    navies: minorPowerPieces.filter((p) => p.minorPower === 'FRANCE' && p.type === 'navy').length,
    afs: airForces.filter((af) => af.minorPower === 'FRANCE').length,
  };
  const chinaOnBoard = {
    armies: minorPowerPieces.filter((p) => p.minorPower === 'CHINA' && p.type === 'army').length,
    navies: minorPowerPieces.filter((p) => p.minorPower === 'CHINA' && p.type === 'navy').length,
    afs: airForces.filter((af) => af.minorPower === 'CHINA').length,
  };

  return (
    <div className="relative w-full h-full overflow-auto">
      <svg
        viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
        className="w-full"
        style={{ minHeight: '500px', minWidth: '900px' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ═══ BOARD IMAGE ═══ */}
        <image href={`${import.meta.env.BASE_URL}board.png`} x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} preserveAspectRatio="none" />

        {/* ═══ HIGHLIGHT OVERLAYS ═══ */}
        {SPACES.filter((s) => validSpaces.has(s.id)).map((space) => (
          <g key={`hl-${space.id}`} className="animate-pulse">
            <circle
              cx={space.x} cy={space.y} r={35}
              fill="#FFD700" fillOpacity={0.25}
              stroke="#FFD700" strokeWidth={3}
              filter="url(#glow)"
              cursor="pointer"
              onClick={() => onSpaceClick(space.id)}
            />
          </g>
        ))}

        {/* ═══ ALL PIECES ON MAP (base + minor powers + air forces) ═══ */}
        {SPACES.map((space) => {
          const spacePieces = renderPieces.filter((p) => p.spaceId === space.id);
          if (spacePieces.length === 0) return null;
          const TOKEN_W = 51;
          const TOKEN_H = 18;
          const spacing = TOKEN_W + 4;
          return (
            <g key={`pieces-${space.id}`}>
              {spacePieces.map((piece, i) => {
                const totalWidth = spacePieces.length * spacing;
                const startX = space.x - totalWidth / 2 + i * spacing;
                const py = space.y - TOKEN_H;
                if (piece.type === 'army') {
                  return <ArmyToken key={piece.id} x={startX} y={py} color={piece.color} inSupply={piece.inSupply} />;
                } else if (piece.type === 'navy') {
                  return <NavyToken key={piece.id} x={startX} y={py} color={piece.color} inSupply={piece.inSupply} />;
                } else {
                  return <AFToken key={piece.id} x={startX} y={py} color={piece.color} textColor={piece.textColor} inSupply={piece.inSupply} />;
                }
              })}
            </g>
          );
        })}

        {/* ═══════════════════════════════════════════ */}
        {/* ═══ BOTTOM PANEL ═══ */}
        {/* ═══════════════════════════════════════════ */}

        <rect x={15} y={MAP_HEIGHT - 5} width={TOTAL_W - 30} height={BOTTOM_H - 5} rx={3} fill={BOARD_FRAME} stroke="#A0906A" strokeWidth={1} />

        {/* QMG Branding */}
        <g transform={`translate(40, ${MAP_HEIGHT + 10})`}>
          <circle cx={50} cy={45} r={42} fill="#1A3A5A" stroke="#C4A860" strokeWidth={2} />
          <circle cx={50} cy={45} r={36} fill="none" stroke="#C4A860" strokeWidth={1} />
          <text x={50} y={30} textAnchor="middle" fontSize={8} fontWeight="900" fill="#C4A860" fontFamily="Cinzel, serif" letterSpacing="1">QUARTERMASTER</text>
          <text x={50} y={50} textAnchor="middle" fontSize={14} fontWeight="900" fill="#fff" fontFamily="Cinzel, serif" letterSpacing="2">GENERAL</text>
          <text x={50} y={68} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#CC3333" fontFamily="Cinzel, serif" letterSpacing="3">WW2</text>
        </g>

        {/* Order of Play */}
        <g transform={`translate(200, ${MAP_HEIGHT + 8})`}>
          <text x={230} y={12} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#555" fontFamily="Inter, sans-serif" letterSpacing="1.5">
            ORDER OF PLAY
          </text>
          {TURN_ORDER.map((c, i) => {
            const flagX = i * 78;
            const isCurrent = c === currentCountry;
            return (
              <g key={c}>
                <rect x={flagX} y={20} width={68} height={45} rx={4}
                  fill={COUNTRY_COLORS[c]} stroke={isCurrent ? '#FFD700' : '#333'}
                  strokeWidth={isCurrent ? 3 : 1} />
                <text x={flagX + 34} y={38} textAnchor="middle" fontSize={8}
                  fill={COUNTRY_TEXT_ON_BG[c]} fontWeight="bold" fontFamily="Inter, sans-serif" opacity={0.7}>
                  {getTeam(c) === Team.AXIS ? 'AXIS' : 'ALLIES'}
                </text>
                <text x={flagX + 34} y={53} textAnchor="middle" fontSize={11}
                  fontWeight="bold" fill={COUNTRY_TEXT_ON_BG[c]} fontFamily="Inter, sans-serif"
                  stroke={COUNTRY_COLORS[c] === '#FFFFFF' ? '#888' : '#000'} strokeWidth={0.3} paintOrder="stroke">
                  {COUNTRY_SHORT[c]}
                </text>
                {isCurrent && (
                  <polygon points={`${flagX + 28},70 ${flagX + 34},78 ${flagX + 40},70`} fill="#FFD700" />
                )}
              </g>
            );
          })}
        </g>

        {/* Round Track */}
        <g transform={`translate(200, ${MAP_HEIGHT + 90})`}>
          <text x={230} y={10} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#555" fontFamily="Inter, sans-serif" letterSpacing="1">
            ROUND
          </text>
          {Array.from({ length: 20 }, (_, idx) => idx + 1).map((r) => {
            const rx = (r - 1) * 23.2;
            const isCurrent = r === round;
            return (
              <g key={r}>
                <rect x={rx} y={16} width={20} height={18} rx={2}
                  fill={isCurrent ? '#CC3333' : '#fff'} stroke="#666" strokeWidth={0.7} />
                <text x={rx + 10} y={28.5} textAnchor="middle" fontSize={8}
                  fill={isCurrent ? '#fff' : '#444'} fontWeight={isCurrent ? 'bold' : 'normal'}
                  fontFamily="Inter, sans-serif">
                  {r}
                </text>
              </g>
            );
          })}
        </g>

        {/* Score Display */}
        <g transform={`translate(${TOTAL_W - 370}, ${MAP_HEIGHT + 10})`}>
          <rect width={160} height={90} rx={6} fill="#1A3A5A" stroke="#2A5A8A" strokeWidth={1.5} />
          <text x={80} y={24} textAnchor="middle" fontSize={18} fill="#CC3333" fontWeight="bold" fontFamily="Cinzel, serif">
            Axis: {axisVP}
          </text>
          <text x={80} y={48} textAnchor="middle" fontSize={18} fill="#6495ED" fontWeight="bold" fontFamily="Cinzel, serif">
            Allies: {alliesVP}
          </text>
          <line x1={12} y1={56} x2={148} y2={56} stroke="#2A4A6A" strokeWidth={0.5} />
          <text x={80} y={74} textAnchor="middle" fontSize={14} fill="#DAA520" fontWeight="bold" fontFamily="Cinzel, serif">
            Turn {round} &gt; {COUNTRY_SHORT[currentCountry]}
          </text>
        </g>

        {/* Turn Sequence */}
        <g transform={`translate(${TOTAL_W - 185}, ${MAP_HEIGHT + 10})`}>
          <rect width={155} height={90} rx={6} fill="#fff" fillOpacity={0.6} stroke="#999" strokeWidth={0.8} />
          <text x={78} y={16} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#444" fontFamily="Inter, sans-serif" letterSpacing="1">
            TURN SEQUENCE
          </text>
          <line x1={8} y1={22} x2={148} y2={22} stroke="#bbb" strokeWidth={0.5} />
          {['1. Play Step', '2. Air Step', '3. Supply Step', '4. Victory Step', '5. Discard Step', '6. Draw Step'].map((step, i) => (
            <text key={i} x={12} y={33 + i * 10} fontSize={8} fill="#555" fontFamily="Inter, sans-serif">{step}</text>
          ))}
        </g>

        {/* ═══ AVAILABLE PIECES TRAY (base countries) ═══ */}
        <g transform={`translate(${TOTAL_W - 370}, ${MAP_HEIGHT + 108})`}>
          {TURN_ORDER.map((c, ci) => {
            const avail = getAvailablePieces(c, state);
            const afOnBoard = airForces.filter((af) => af.country === c && !af.minorPower).length;
            const afMax = AIR_FORCE_LIMITS[c];
            const afAvail = Math.max(0, afMax - afOnBoard);
            const bx = ci * 56;
            return (
              <g key={c} transform={`translate(${bx}, 0)`}>
                {Array.from({ length: Math.min(avail.armies, 3) }, (_, i) => (
                  <SmallArmyIcon key={`a${i}`} x={i * 8} y={0} color={COUNTRY_COLORS[c]} />
                ))}
                {Array.from({ length: Math.min(avail.navies, 3) }, (_, i) => (
                  <SmallNavyIcon key={`n${i}`} x={i * 8} y={18} color={COUNTRY_COLORS[c]} />
                ))}
                {Array.from({ length: Math.min(afAvail, 3) }, (_, i) => (
                  <SmallAFIcon key={`af${i}`} x={i * 8 + 28} y={18} color={COUNTRY_COLORS[c]} />
                ))}
              </g>
            );
          })}
        </g>

        {/* ═══ MINOR POWER PIECES TRAY (France & China) ═══ */}
        <g transform={`translate(${TOTAL_W - 370}, ${MAP_HEIGHT + 145})`}>
          {/* France */}
          <g>
            <rect x={-2} y={-6} width={110} height={18} rx={3} fill={MINOR_POWER_COLORS.FRANCE} opacity={0.15} />
            <text x={2} y={5} fontSize={7} fill={MINOR_POWER_COLORS.FRANCE} fontWeight="bold" fontFamily="Inter, sans-serif">FRA</text>
            {Array.from({ length: Math.max(0, MINOR_POWER_PIECES.FRANCE.armies - franceOnBoard.armies) }, (_, i) => (
              <SmallArmyIcon key={`fa${i}`} x={24 + i * 8} y={-6} color={MINOR_POWER_COLORS.FRANCE} />
            ))}
            {Array.from({ length: Math.max(0, MINOR_POWER_PIECES.FRANCE.navies - franceOnBoard.navies) }, (_, i) => (
              <SmallNavyIcon key={`fn${i}`} x={52 + i * 8} y={-6} color={MINOR_POWER_COLORS.FRANCE} />
            ))}
            {Array.from({ length: Math.max(0, MINOR_POWER_AF_LIMITS.FRANCE - franceOnBoard.afs) }, (_, i) => (
              <SmallAFIcon key={`faf${i}`} x={80 + i * 8} y={-6} color={MINOR_POWER_COLORS.FRANCE} />
            ))}
          </g>
          {/* China */}
          <g transform="translate(120, 0)">
            <rect x={-2} y={-6} width={100} height={18} rx={3} fill={MINOR_POWER_COLORS.CHINA} opacity={0.15} />
            <text x={2} y={5} fontSize={7} fill={MINOR_POWER_COLORS.CHINA} fontWeight="bold" fontFamily="Inter, sans-serif">CHN</text>
            {Array.from({ length: Math.max(0, MINOR_POWER_PIECES.CHINA.armies - chinaOnBoard.armies) }, (_, i) => (
              <SmallArmyIcon key={`ca${i}`} x={24 + i * 8} y={-6} color={MINOR_POWER_COLORS.CHINA} />
            ))}
            {Array.from({ length: Math.max(0, MINOR_POWER_AF_LIMITS.CHINA - chinaOnBoard.afs) }, (_, i) => (
              <SmallAFIcon key={`caf${i}`} x={48 + i * 8} y={-6} color={MINOR_POWER_COLORS.CHINA} />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
