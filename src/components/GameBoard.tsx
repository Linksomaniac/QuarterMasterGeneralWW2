import React from 'react';
import {
  Country,
  COUNTRY_COLORS,
  COUNTRY_TEXT_ON_BG,
  COUNTRY_SHORT,
  COUNTRY_NAMES,
  SpaceType,
  getTeam,
  Team,
  TURN_ORDER,
  COUNTRY_PIECES,
} from '../game/types';
import {
  SPACES,
  ADJACENCY_MAP,
  MAP_WIDTH,
  MAP_HEIGHT,
  CONTINENT_SHAPES,
} from '../game/mapData';
import { useGameStore } from '../game/store';
import { getCurrentCountry, getAllPieces, isInSupply, getAvailablePieces } from '../game/engine';

const OCEAN_COLOR = '#4A8EC2';
const LAND_OLIVE = '#8B9B6B';
const LAND_SANDY = '#B8A068';
const BOARD_FRAME = '#D4C090';
const BORDER_DARK = '#4A5A3A';
const BORDER_SANDY = '#8A7A50';

const TOTAL_W = MAP_WIDTH;
const BOTTOM_H = 170;
const TOTAL_H = MAP_HEIGHT + BOTTOM_H;

const REGION_COLORS: Record<string, string> = {
  canada: LAND_OLIVE, pacific_northwest: LAND_OLIVE, western_us: LAND_OLIVE,
  eastern_us: LAND_OLIVE, hawaii: LAND_OLIVE,
  brazil: LAND_OLIVE,
  scandinavia: LAND_OLIVE, united_kingdom: LAND_OLIVE, germany: LAND_OLIVE,
  western_europe: LAND_OLIVE, italy: LAND_OLIVE, balkans: LAND_OLIVE, eastern_europe: LAND_OLIVE,
  moscow: LAND_OLIVE, russia: LAND_OLIVE, ukraine: LAND_OLIVE,
  kazakhstan: LAND_SANDY, mongolia: LAND_SANDY, vladivostok: LAND_OLIVE,
  north_africa: LAND_SANDY, africa: LAND_SANDY, madagascar: LAND_SANDY,
  iceland: LAND_OLIVE, siberia: LAND_OLIVE,
  middle_east: LAND_SANDY, india: LAND_SANDY,
  szechuan: LAND_OLIVE, china: LAND_OLIVE, southeast_asia: LAND_OLIVE,
  japan: LAND_OLIVE, philippines: LAND_OLIVE, indonesia: LAND_OLIVE, iwo_jima: LAND_OLIVE,
  new_guinea: LAND_OLIVE, new_zealand: LAND_OLIVE,
  australia: LAND_SANDY,
};

function getTerritoryFill(space: { id: string; homeCountry?: Country }): string {
  if (space.homeCountry) return COUNTRY_COLORS[space.homeCountry];
  return REGION_COLORS[space.id] ?? LAND_OLIVE;
}

function getTerritoryBorder(id: string): string {
  const sandy = ['north_africa', 'africa', 'madagascar', 'middle_east', 'india', 'australia', 'kazakhstan', 'mongolia'];
  return sandy.includes(id) ? BORDER_SANDY : BORDER_DARK;
}

function SupplyStar({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const outer = (i * 72 - 90) * Math.PI / 180;
    const inner = ((i * 72 + 36) - 90) * Math.PI / 180;
    pts.push(`${cx + r * Math.cos(outer)},${cy + r * Math.sin(outer)}`);
    pts.push(`${cx + r * 0.4 * Math.cos(inner)},${cy + r * 0.4 * Math.sin(inner)}`);
  }
  return <polygon points={pts.join(' ')} fill="#E8C840" stroke="#8B6914" strokeWidth={0.8} />;
}

function ArmyToken({ x, y, country, inSupply }: { x: number; y: number; country: Country; inSupply: boolean }) {
  const color = COUNTRY_COLORS[country];
  return (
    <g transform={`translate(${x}, ${y})`} opacity={inSupply ? 1 : 0.35}>
      <rect x={1} y={9} width={34} height={16} rx={3} fill="#000" opacity={0.2} />
      <rect x={0} y={8} width={34} height={16} rx={3} fill={color} stroke="#111" strokeWidth={1} />
      <rect x={8} y={2} width={14} height={9} rx={2} fill={color} stroke="#111" strokeWidth={0.8} />
      <rect x={22} y={4} width={12} height={3.5} rx={1.5} fill={color} stroke="#111" strokeWidth={0.7} />
      <rect x={1} y={20} width={32} height={5} rx={2.5} fill="#1a1a1a" />
      {!inSupply && <text x={17} y={-2} textAnchor="middle" fontSize={11} fill="#ff4444" fontWeight="bold">✕</text>}
    </g>
  );
}

function NavyToken({ x, y, country, inSupply }: { x: number; y: number; country: Country; inSupply: boolean }) {
  const color = COUNTRY_COLORS[country];
  return (
    <g transform={`translate(${x}, ${y})`} opacity={inSupply ? 1 : 0.35}>
      <path d="M1,19 L8,4 L28,4 L35,19 Z" fill="#000" opacity={0.2} />
      <path d="M0,18 L7,3 L27,3 L34,18 Z" fill={color} stroke="#111" strokeWidth={1} />
      <rect x={10} y={-4} width={14} height={9} rx={1.5} fill={color} stroke="#111" strokeWidth={0.8} />
      <line x1={17} y1={-4} x2={17} y2={-12} stroke="#666" strokeWidth={1} />
      <rect x={17} y={-14} width={6} height={4} fill={color} stroke="#111" strokeWidth={0.5} />
      {!inSupply && <text x={17} y={-16} textAnchor="middle" fontSize={11} fill="#ff4444" fontWeight="bold">✕</text>}
    </g>
  );
}

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

function LandTerritory({
  space, pieces, isHighlighted, onClick, state,
}: {
  space: (typeof SPACES)[0];
  pieces: { id: string; country: Country; type: 'army' | 'navy'; spaceId: string }[];
  isHighlighted: boolean;
  onClick: () => void;
  state: any;
}) {
  const fillColor = getTerritoryFill(space);
  const isHome = !!space.homeCountry;
  const borderColor = isHighlighted ? '#FFD700' : getTerritoryBorder(space.id);

  const nameLen = space.name.length;
  const fontSize = nameLen > 16 ? 7.5 : nameLen > 12 ? 8.5 : nameLen > 8 ? 9.5 : 10.5;
  const boxW = Math.max(60, nameLen * (fontSize * 0.62) + 16);
  const boxH = isHome ? 36 : 28;
  const bx = space.x - boxW / 2;
  const by = space.y - boxH / 2;

  return (
    <g>
      {isHighlighted && (
        <rect x={bx - 3} y={by - 3} width={boxW + 6} height={boxH + 6} rx={10}
          fill="none" stroke="#FFD700" strokeWidth={3}
          filter="url(#glow)" className="animate-pulse" />
      )}

      <rect
        x={bx + 1} y={by + 1} width={boxW} height={boxH} rx={7}
        fill="#000" opacity={0.18}
      />
      <rect
        x={bx} y={by} width={boxW} height={boxH} rx={7}
        fill={fillColor}
        fillOpacity={0.95}
        stroke={borderColor}
        strokeWidth={isHighlighted ? 2.5 : isHome ? 2 : 1.3}
        cursor={isHighlighted ? 'pointer' : 'default'}
        onClick={isHighlighted ? onClick : undefined}
      />

      {space.isSupplySpace && (
        <SupplyStar cx={bx + boxW - 6} cy={by + 7} r={5.5} />
      )}

      {space.controlsStrait && (
        <text x={bx + 8} y={by + 9} fontSize={10} fill="#FFD700" pointerEvents="none"
          stroke="#000" strokeWidth={0.3} paintOrder="stroke">⚓</text>
      )}

      <text
        x={space.x} y={by + (isHome ? 12 : boxH / 2)}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={fontSize}
        fill="#fff" fontWeight="bold" fontFamily="Inter, sans-serif"
        pointerEvents="none" stroke="#000" strokeWidth={1.8} paintOrder="stroke"
      >
        {space.name.toUpperCase()}
      </text>

      {isHome && (
        <g>
          <rect x={space.x - 17} y={by + 20} width={34} height={13} rx={3}
            fill={COUNTRY_COLORS[space.homeCountry!]} stroke="#000" strokeWidth={0.6} />
          <text x={space.x} y={by + 29} textAnchor="middle" fontSize={8}
            fontWeight="bold" fill={COUNTRY_TEXT_ON_BG[space.homeCountry!]} fontFamily="Inter, sans-serif"
            stroke={COUNTRY_COLORS[space.homeCountry!] === '#FFFFFF' ? '#888' : '#000'} strokeWidth={0.2} paintOrder="stroke">
            {COUNTRY_SHORT[space.homeCountry!]}
          </text>
        </g>
      )}

      {pieces.map((piece, i) => {
        const supply = isInSupply(piece, state);
        const totalWidth = pieces.length * 38;
        const startX = space.x - totalWidth / 2 + i * 38;
        const py = by + boxH + 4;
        return piece.type === 'army' ? (
          <ArmyToken key={piece.id} x={startX} y={py} country={piece.country} inSupply={supply} />
        ) : (
          <NavyToken key={piece.id} x={startX} y={py} country={piece.country} inSupply={supply} />
        );
      })}
    </g>
  );
}

function SeaTerritory({
  space, pieces, isHighlighted, onClick, state,
}: {
  space: (typeof SPACES)[0];
  pieces: { id: string; country: Country; type: 'army' | 'navy'; spaceId: string }[];
  isHighlighted: boolean;
  onClick: () => void;
  state: any;
}) {
  return (
    <g>
      {isHighlighted && (
        <rect x={space.x - 48} y={space.y - 14} width={96} height={28} rx={14}
          fill="none" stroke="#FFD700" strokeWidth={2} filter="url(#glow)"
          className="animate-pulse" />
      )}

      <text
        x={space.x} y={space.y}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={space.name.length > 13 ? 9 : 10.5}
        fill="#1A3860" fontWeight="600" fontStyle="italic"
        fontFamily="Inter, sans-serif" pointerEvents="none"
      >
        {space.name}
      </text>

      {isHighlighted && (
        <rect x={space.x - 48} y={space.y - 14} width={96} height={28} rx={14}
          fill="#FFD700" fillOpacity={0.15} stroke="#FFD700" strokeWidth={1.5}
          cursor="pointer" onClick={onClick} />
      )}

      {pieces.map((piece, i) => {
        const supply = isInSupply(piece, state);
        const totalWidth = pieces.length * 38;
        const startX = space.x - totalWidth / 2 + i * 38;
        const py = space.y + 16;
        return piece.type === 'army' ? (
          <ArmyToken key={piece.id} x={startX} y={py} country={piece.country} inSupply={supply} />
        ) : (
          <NavyToken key={piece.id} x={startX} y={py} country={piece.country} inSupply={supply} />
        );
      })}
    </g>
  );
}

export default function GameBoard() {
  const state = useGameStore();
  const { pendingAction, axisVP, alliesVP, round } = state;
  const handleSpaceClick = useGameStore((s) => s.handleSpaceClick);

  const allPieces = getAllPieces(state);
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

  const adjLines: { x1: number; y1: number; x2: number; y2: number; isStrait: boolean; fromType: string; toType: string }[] = [];
  const visited = new Set<string>();
  ADJACENCY_MAP.forEach((neighbors, spaceId) => {
    const from = SPACES.find((s) => s.id === spaceId);
    if (!from) return;
    neighbors.forEach((nId) => {
      const key = [spaceId, nId].sort().join('-');
      if (visited.has(key)) return;
      visited.add(key);
      const to = SPACES.find((s) => s.id === nId);
      if (!to) return;
      if (Math.abs(from.x - to.x) > 800) return;
      adjLines.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, isStrait: false, fromType: from.type, toType: to.type });
    });
  });

  for (const space of SPACES) {
    if (!space.controlsStrait) continue;
    const [sea1, sea2] = space.controlsStrait.connects;
    const s1 = SPACES.find((s) => s.id === sea1);
    const s2 = SPACES.find((s) => s.id === sea2);
    if (s1 && s2) adjLines.push({ x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y, isStrait: true, fromType: s1.type, toType: s2.type });
  }

  const currentCountry = getCurrentCountry(state);

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
          <marker id="arrowRed" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,2.5 L0,5 Z" fill="#C03030" opacity="0.5" />
          </marker>
        </defs>

        {/* ═══ BOARD FRAME ═══ */}
        <rect width={TOTAL_W} height={TOTAL_H} fill={BOARD_FRAME} rx={6} />

        {/* ═══ OCEAN ═══ */}
        <rect x={15} y={15} width={TOTAL_W - 30} height={MAP_HEIGHT - 30} fill={OCEAN_COLOR} rx={3} />

        {/* Subtle wave texture */}
        <defs>
          <pattern id="wavePattern" width="120" height="20" patternUnits="userSpaceOnUse">
            <path d="M0,10 Q30,4 60,10 Q90,16 120,10" fill="none" stroke="#5A9ECE" strokeWidth="0.4" opacity="0.4" />
          </pattern>
        </defs>
        <rect x={15} y={15} width={TOTAL_W - 30} height={MAP_HEIGHT - 30} fill="url(#wavePattern)" opacity={0.3} rx={3} />

        {/* ═══ CONTINENT BACKGROUNDS ═══ */}
        {CONTINENT_SHAPES.map((cont) => (
          <polygon
            key={cont.name}
            points={cont.points}
            fill={cont.color}
            stroke={cont.color}
            strokeWidth={8}
            strokeLinejoin="round"
            opacity={0.2}
          />
        ))}

        {/* ═══ CONNECTION LINES ═══ */}
        {adjLines.map((line, i) => {
          const dx = line.x2 - line.x1;
          const dy = line.y2 - line.y1;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1) return null;
          const ux = dx / dist;
          const uy = dy / dist;
          const shrink = 28;
          const sx = line.x1 + ux * shrink;
          const sy = line.y1 + uy * shrink;
          const ex = line.x2 - ux * shrink;
          const ey = line.y2 - uy * shrink;
          const bothLand = line.fromType === SpaceType.LAND && line.toType === SpaceType.LAND;
          return (
            <line
              key={`adj-${i}`}
              x1={sx} y1={sy} x2={ex} y2={ey}
              stroke={line.isStrait ? '#111111' : bothLand ? '#8B5E3C' : '#DAA520'}
              strokeWidth={line.isStrait ? 2.5 : bothLand ? 1.8 : 1.8}
              strokeDasharray={line.isStrait ? '6,4' : bothLand ? undefined : '5,4'}
              opacity={line.isStrait ? 0.6 : bothLand ? 0.55 : 0.6}
              strokeLinecap="round"
            />
          );
        })}

        {/* Pacific wrap indicators */}
        <g opacity={0.35}>
          <line x1={15} y1={350} x2={80} y2={350} stroke="#C03030" strokeWidth={1.5} strokeDasharray="4,3" />
          <text x={48} y={340} fontSize={7} fill="#C03030" textAnchor="middle" fontWeight="bold" fontStyle="italic">← wraps</text>
        </g>

        {/* ═══ LAND TERRITORIES ═══ */}
        {SPACES.filter((s) => s.type === SpaceType.LAND).map((space) => {
          const spacePieces = allPieces.filter((p) => p.spaceId === space.id);
          return (
            <LandTerritory
              key={space.id} space={space} pieces={spacePieces}
              isHighlighted={validSpaces.has(space.id)}
              onClick={() => handleSpaceClick(space.id)} state={state}
            />
          );
        })}

        {/* ═══ SEA TERRITORIES ═══ */}
        {SPACES.filter((s) => s.type === SpaceType.SEA).map((space) => {
          const spacePieces = allPieces.filter((p) => p.spaceId === space.id);
          return (
            <SeaTerritory
              key={space.id} space={space} pieces={spacePieces}
              isHighlighted={validSpaces.has(space.id)}
              onClick={() => handleSpaceClick(space.id)} state={state}
            />
          );
        })}

        {/* ═══ DECORATIVE OCEAN LABELS ═══ */}
        <text x={1700} y={580} fontSize={11} fill="#2A5A8A" fontWeight="600" fontFamily="Inter, sans-serif" fontStyle="italic" opacity={0.4}>East Pacific</text>
        <text x={530} y={720} fontSize={11} fill="#2A5A8A" fontWeight="600" fontFamily="Inter, sans-serif" fontStyle="italic" opacity={0.4}>Southern Ocean</text>
        <text x={1070} y={700} fontSize={11} fill="#2A5A8A" fontWeight="600" fontFamily="Inter, sans-serif" fontStyle="italic" opacity={0.4}>Indian Ocean</text>

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
          {['1. Play Step', '2. Supply Step', '3. Victory Step', '4. Discard Step', '5. Draw Step'].map((step, i) => (
            <text key={i} x={12} y={35 + i * 12} fontSize={9} fill="#555" fontFamily="Inter, sans-serif">{step}</text>
          ))}
        </g>

        {/* ═══ AVAILABLE PIECES TRAY ═══ */}
        <g transform={`translate(${TOTAL_W - 370}, ${MAP_HEIGHT + 108})`}>
          {TURN_ORDER.map((c, ci) => {
            const avail = getAvailablePieces(c, state);
            const bx = ci * 56;
            return (
              <g key={c} transform={`translate(${bx}, 0)`}>
                {Array.from({ length: Math.min(avail.armies, 3) }, (_, i) => (
                  <SmallArmyIcon key={`a${i}`} x={i * 8} y={0} color={COUNTRY_COLORS[c]} />
                ))}
                {Array.from({ length: Math.min(avail.navies, 3) }, (_, i) => (
                  <SmallNavyIcon key={`n${i}`} x={i * 8} y={18} color={COUNTRY_COLORS[c]} />
                ))}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
