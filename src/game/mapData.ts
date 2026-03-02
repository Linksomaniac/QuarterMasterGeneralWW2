import { Country, MapSpace, SpaceType } from './types';

export const SPACES: MapSpace[] = [
  // ─── NORTH AMERICA ───
  { id: 'eastern_us', name: 'Eastern United States', type: SpaceType.LAND, isSupplySpace: true, homeCountry: Country.USA, x: 76, y: 291 },
  { id: 'western_us', name: 'Western United States', type: SpaceType.LAND, isSupplySpace: true, x: 1900, y: 298 },
  { id: 'pacific_northwest', name: 'Pacific Northwest', type: SpaceType.LAND, isSupplySpace: false, x: 1891, y: 121 },
  { id: 'canada', name: 'Canada', type: SpaceType.LAND, isSupplySpace: false, x: 80, y: 120 },
  { id: 'hawaii', name: 'Hawaii', type: SpaceType.LAND, isSupplySpace: false, x: 1714, y: 439 },

  // ─── SOUTH AMERICA ───
  { id: 'brazil', name: 'Latin America', type: SpaceType.LAND, isSupplySpace: false, x: 259, y: 645, controlsStrait: { connects: ['south_atlantic', 'southeast_pacific'] } },

  // ─── EUROPE ───
  { id: 'iceland', name: 'Iceland', type: SpaceType.LAND, isSupplySpace: false, x: 432, y: 39 },
  { id: 'united_kingdom', name: 'United Kingdom', type: SpaceType.LAND, isSupplySpace: true, homeCountry: Country.UK, x: 484, y: 170 },
  { id: 'western_europe', name: 'Western Europe', type: SpaceType.LAND, isSupplySpace: true, x: 558, y: 282 },
  { id: 'germany', name: 'Germany', type: SpaceType.LAND, isSupplySpace: true, homeCountry: Country.GERMANY, x: 644, y: 221 },
  { id: 'scandinavia', name: 'Scandinavia', type: SpaceType.LAND, isSupplySpace: false, x: 670, y: 38, controlsStrait: { connects: ['north_sea', 'baltic'] } },
  { id: 'italy', name: 'Italy', type: SpaceType.LAND, isSupplySpace: true, homeCountry: Country.ITALY, x: 643, y: 355 },
  { id: 'balkans', name: 'Balkans', type: SpaceType.LAND, isSupplySpace: false, x: 715, y: 319, controlsStrait: { connects: ['mediterranean', 'black_sea'] } },
  { id: 'eastern_europe', name: 'Eastern Europe', type: SpaceType.LAND, isSupplySpace: false, x: 729, y: 211 },

  // ─── RUSSIA / CENTRAL ASIA ───
  { id: 'ukraine', name: 'Ukraine', type: SpaceType.LAND, isSupplySpace: true, x: 829, y: 261 },
  { id: 'russia', name: 'Russia', type: SpaceType.LAND, isSupplySpace: false, x: 818, y: 92 },
  { id: 'moscow', name: 'Moscow', type: SpaceType.LAND, isSupplySpace: true, homeCountry: Country.SOVIET_UNION, x: 929, y: 163 },
  { id: 'siberia', name: 'Siberia', type: SpaceType.LAND, isSupplySpace: false, x: 1145, y: 79 },
  { id: 'kazakhstan', name: 'Kazakhstan', type: SpaceType.LAND, isSupplySpace: false, x: 1013, y: 293 },
  { id: 'mongolia', name: 'Mongolia', type: SpaceType.LAND, isSupplySpace: false, x: 1272, y: 236 },
  { id: 'vladivostok', name: 'Vladivostok', type: SpaceType.LAND, isSupplySpace: false, x: 1481, y: 49 },

  // ─── AFRICA ───
  { id: 'north_africa', name: 'North Africa', type: SpaceType.LAND, isSupplySpace: false, x: 653, y: 491, controlsStrait: { connects: ['north_sea', 'mediterranean'] } },
  { id: 'africa', name: 'Africa', type: SpaceType.LAND, isSupplySpace: false, x: 648, y: 606 },
  { id: 'madagascar', name: 'Madagascar', type: SpaceType.LAND, isSupplySpace: false, x: 832, y: 796 },

  // ─── MIDDLE EAST / SOUTH ASIA ───
  { id: 'middle_east', name: 'Middle East', type: SpaceType.LAND, isSupplySpace: false, x: 872, y: 419, controlsStrait: { connects: ['mediterranean', 'indian_ocean'] } },
  { id: 'india', name: 'India', type: SpaceType.LAND, isSupplySpace: true, x: 1141, y: 513 },
  { id: 'szechuan', name: 'Szechuan', type: SpaceType.LAND, isSupplySpace: false, x: 1186, y: 370 },
  { id: 'china', name: 'China', type: SpaceType.LAND, isSupplySpace: true, x: 1331, y: 373 },
  { id: 'southeast_asia', name: 'Southeast Asia', type: SpaceType.LAND, isSupplySpace: false, x: 1258, y: 510, controlsStrait: { connects: ['bay_of_bengal', 'south_china_sea'] } },

  // ─── EAST ASIA / PACIFIC ISLANDS ───
  { id: 'japan', name: 'Japan', type: SpaceType.LAND, isSupplySpace: true, homeCountry: Country.JAPAN, x: 1501, y: 358 },
  { id: 'philippines', name: 'Philippines', type: SpaceType.LAND, isSupplySpace: false, x: 1428, y: 542 },
  { id: 'indonesia', name: 'Indonesia', type: SpaceType.LAND, isSupplySpace: false, x: 1328, y: 644 },
  { id: 'iwo_jima', name: 'Iwo Jima', type: SpaceType.LAND, isSupplySpace: false, x: 1539, y: 426 },
  { id: 'new_guinea', name: 'New Guinea', type: SpaceType.LAND, isSupplySpace: false, x: 1529, y: 644 },
  { id: 'new_zealand', name: 'New Zealand', type: SpaceType.LAND, isSupplySpace: false, x: 1621, y: 912 },
  { id: 'australia', name: 'Australia', type: SpaceType.LAND, isSupplySpace: true, x: 1449, y: 791 },

  // ─── SEA SPACES ───
  { id: 'north_atlantic', name: 'North Atlantic', type: SpaceType.SEA, isSupplySpace: false, x: 264, y: 376 },
  { id: 'south_atlantic', name: 'South Atlantic', type: SpaceType.SEA, isSupplySpace: false, x: 457, y: 685 },
  { id: 'north_sea', name: 'North Sea', type: SpaceType.SEA, isSupplySpace: false, x: 402, y: 298 },
  { id: 'baltic', name: 'Baltic Sea', type: SpaceType.SEA, isSupplySpace: false, x: 689, y: 152 },
  { id: 'mediterranean', name: 'Mediterranean', type: SpaceType.SEA, isSupplySpace: false, x: 716, y: 422 },
  { id: 'black_sea', name: 'Black Sea', type: SpaceType.SEA, isSupplySpace: false, x: 795, y: 334 },
  { id: 'caspian_sea', name: 'Caspian Sea', type: SpaceType.SEA, isSupplySpace: false, x: 933, y: 337 },
  { id: 'southern_ocean', name: 'Southern Ocean', type: SpaceType.SEA, isSupplySpace: false, x: 478, y: 932 },
  { id: 'indian_ocean', name: 'Indian Ocean', type: SpaceType.SEA, isSupplySpace: false, x: 1052, y: 895 },
  { id: 'bay_of_bengal', name: 'Bay of Bengal', type: SpaceType.SEA, isSupplySpace: false, x: 1051, y: 649 },
  { id: 'south_china_sea', name: 'South China Sea', type: SpaceType.SEA, isSupplySpace: false, x: 1405, y: 616 },
  { id: 'sea_of_japan', name: 'Sea of Japan', type: SpaceType.SEA, isSupplySpace: false, x: 1438, y: 455 },
  { id: 'north_pacific', name: 'North Pacific', type: SpaceType.SEA, isSupplySpace: false, x: 1657, y: 245 },
  { id: 'east_pacific', name: 'East Pacific', type: SpaceType.SEA, isSupplySpace: false, x: 1759, y: 573 },
  { id: 'central_pacific', name: 'Central Pacific', type: SpaceType.SEA, isSupplySpace: false, x: 1591, y: 541 },
  { id: 'south_pacific', name: 'South Pacific', type: SpaceType.SEA, isSupplySpace: false, x: 1603, y: 741 },
  { id: 'southeast_pacific', name: 'Southeast Pacific', type: SpaceType.SEA, isSupplySpace: false, x: 90, y: 694 },
];

const RAW_ADJACENCIES: [string, string][] = [
  // ═══ LAND-LAND ═══
  // North America
  ["eastern_us", "western_us"],
  ['eastern_us', 'canada'],
  ['canada', 'pacific_northwest'],
  ['western_us', 'pacific_northwest'],

  // Europe
  ['western_europe', 'germany'],
  ['western_europe', 'italy'],
  ['germany', 'eastern_europe'],
  ['germany', 'italy'],
  ['germany', 'balkans'],
  ['italy', 'balkans'],
  ['balkans', 'eastern_europe'],
  ['balkans', 'ukraine'],
  ['balkans', 'middle_east'],
  ['eastern_europe', 'ukraine'],
  ['eastern_europe', 'russia'],

  // Russia / Central Asia
  ['russia', 'scandinavia'],
  ['russia', 'moscow'],
  ['russia', 'ukraine'],
  ['russia', 'siberia'],
  ['moscow', 'ukraine'],
  ['moscow', 'kazakhstan'],
  ['moscow', 'siberia'],
  ['ukraine', 'kazakhstan'],
  ['ukraine', 'middle_east'],
  ['siberia', 'mongolia'],
  ['siberia', 'vladivostok'],
  ['siberia', 'kazakhstan'],
  ['mongolia', 'vladivostok'],
  ['mongolia', 'kazakhstan'],
  ['mongolia', 'szechuan'],
  ['mongolia', 'china'],
  ['vladivostok', 'china'],
  ['kazakhstan', 'szechuan'],

  // Africa
  ['north_africa', 'africa'],
  ['north_africa', 'middle_east'],

  // Middle East / South Asia
  ['middle_east', 'india'],
  ['middle_east', 'szechuan'],
  ['middle_east', 'kazakhstan'],
  ['india', 'szechuan'],
  ['india', 'southeast_asia'],
  ['szechuan', 'china'],
  ['szechuan', 'southeast_asia'],
  ['china', 'southeast_asia'],

  // ═══ LAND-SEA ═══
  // North America
  ['eastern_us', 'north_atlantic'],
  ['canada', 'north_atlantic'],
  ['brazil', 'north_atlantic'],
  ['pacific_northwest', 'north_pacific'],
  ['pacific_northwest', 'east_pacific'],
  ['western_us', 'east_pacific'],
  ['hawaii', 'east_pacific'],
  ['hawaii', 'central_pacific'],
  ['hawaii', 'north_pacific'],
  ['brazil', 'south_atlantic'],
  ['brazil', 'southeast_pacific'],
  ['brazil', 'southern_ocean'],

  // Europe
  ['iceland', 'north_atlantic'],
  ['iceland', 'north_sea'],
  ['united_kingdom', 'north_sea'],
  ['western_europe', 'north_sea'],
  ['western_europe', 'mediterranean'],
  ['scandinavia', 'north_sea'],
  ['scandinavia', 'baltic'],
  ['germany', 'baltic'],
  ['italy', 'mediterranean'],
  ['balkans', 'mediterranean'],
  ['balkans', 'black_sea'],

  // Russia / Central Asia seas
  ['ukraine', 'black_sea'],
  ['ukraine', 'caspian_sea'],
  ['kazakhstan', 'caspian_sea'],
  ['middle_east', 'caspian_sea'],

  // Africa / Middle East seas
  ['middle_east', 'mediterranean'],
  ['north_africa', 'mediterranean'],
  ['north_africa', 'bay_of_bengal'],
  ['north_africa', 'north_sea'],
  ['africa', 'south_atlantic'],
  ['africa', 'southern_ocean'],
  ['africa', 'bay_of_bengal'],
  ['africa', 'indian_ocean'],
  ['madagascar', 'indian_ocean'],
  ['madagascar', 'bay_of_bengal'],

  // Middle East / South Asia seas
  ['middle_east', 'bay_of_bengal'],
  ['india', 'bay_of_bengal'],
  ['southeast_asia', 'bay_of_bengal'],
  ['southeast_asia', 'south_china_sea'],
  ['indonesia', 'bay_of_bengal'],
  ['indonesia', 'south_china_sea'],

  // East Asia / Pacific seas
  ['japan', 'sea_of_japan'],
  ['vladivostok', 'sea_of_japan'],
  ['vladivostok', 'north_pacific'],
  ['china', 'sea_of_japan'],
  ['philippines', 'sea_of_japan'],
  ['philippines', 'central_pacific'],
  ['philippines', 'south_china_sea'],
  ['iwo_jima', 'central_pacific'],
  ['iwo_jima', 'north_pacific'],
  ['iwo_jima', 'sea_of_japan'],
  ['new_guinea', 'south_pacific'],
  ['new_guinea', 'south_china_sea'],
  ['new_guinea', 'central_pacific'],
  ['new_zealand', 'south_pacific'],
  ['new_zealand', 'east_pacific'],
  ['australia', 'south_pacific'],
  ['australia', 'indian_ocean'],
  ['australia', 'south_china_sea'],

  // ═══ SEA-SEA ═══
  ['north_atlantic', 'south_atlantic'],
  ['north_atlantic', 'north_sea'],
  ['south_atlantic', 'southern_ocean'],
  ['southern_ocean', 'indian_ocean'],
  ['indian_ocean', 'bay_of_bengal'],
  ['south_china_sea', 'sea_of_japan'],
  ['south_china_sea', 'central_pacific'],
  ['south_china_sea', 'south_pacific'],
  ['sea_of_japan', 'north_pacific'],
  ['sea_of_japan', 'central_pacific'],
  ['north_pacific', 'east_pacific'],
  ['north_pacific', 'central_pacific'],
  ['east_pacific', 'central_pacific'],
  ['east_pacific', 'south_pacific'],
  ['east_pacific', 'north_pacific'],
  ['central_pacific', 'south_pacific'],
  ['southeast_pacific', 'southern_ocean'],
  ['southeast_pacific', 'east_pacific'],
];

export const ADJACENCY_MAP: Map<string, Set<string>> = new Map();

function addAdj(a: string, b: string) {
  if (!ADJACENCY_MAP.has(a)) ADJACENCY_MAP.set(a, new Set());
  if (!ADJACENCY_MAP.has(b)) ADJACENCY_MAP.set(b, new Set());
  ADJACENCY_MAP.get(a)!.add(b);
  ADJACENCY_MAP.get(b)!.add(a);
}

for (const [a, b] of RAW_ADJACENCIES) {
  addAdj(a, b);
}

export function getSpace(id: string): MapSpace | undefined {
  return SPACES.find((s) => s.id === id);
}

export function getAdjacentSpaces(spaceId: string): string[] {
  return Array.from(ADJACENCY_MAP.get(spaceId) ?? []);
}

export function isAdjacentWithStraits(
  spaceId1: string,
  spaceId2: string,
  axisControlledStraits: Set<string>
): boolean {
  const baseAdj = ADJACENCY_MAP.get(spaceId1)?.has(spaceId2) ?? false;
  if (baseAdj) return true;
  for (const space of SPACES) {
    if (!space.controlsStrait) continue;
    const [seaA, seaB] = space.controlsStrait.connects;
    if (
      (spaceId1 === seaA && spaceId2 === seaB) ||
      (spaceId1 === seaB && spaceId2 === seaA)
    ) {
      return true;
    }
  }
  return false;
}

export function getStraitStatus(pieces: { country: Country; spaceId: string }[]): {
  straitSpaceId: string;
  axisControlled: boolean;
}[] {
  const results: { straitSpaceId: string; axisControlled: boolean }[] = [];
  for (const space of SPACES) {
    if (!space.controlsStrait) continue;
    const hasAxisArmy = pieces.some(
      (p) =>
        p.spaceId === space.id &&
        [Country.GERMANY, Country.JAPAN, Country.ITALY].includes(p.country)
    );
    results.push({ straitSpaceId: space.id, axisControlled: hasAxisArmy });
  }
  return results;
}

export function areAdjacentForTeam(
  spaceId1: string,
  spaceId2: string,
  isAxisTeam: boolean,
  straitStatuses: { straitSpaceId: string; axisControlled: boolean }[]
): boolean {
  if (ADJACENCY_MAP.get(spaceId1)?.has(spaceId2)) return true;
  for (const space of SPACES) {
    if (!space.controlsStrait) continue;
    const [seaA, seaB] = space.controlsStrait.connects;
    if (
      (spaceId1 === seaA && spaceId2 === seaB) ||
      (spaceId1 === seaB && spaceId2 === seaA)
    ) {
      const straitStatus = straitStatuses.find((s) => s.straitSpaceId === space.id);
      if (!straitStatus) continue;
      const open = isAxisTeam ? straitStatus.axisControlled : !straitStatus.axisControlled;
      if (open) return true;
    }
  }
  return false;
}

export const HOME_SPACES: Record<Country, string> = {
  [Country.GERMANY]: 'germany',
  [Country.UK]: 'united_kingdom',
  [Country.JAPAN]: 'japan',
  [Country.SOVIET_UNION]: 'moscow',
  [Country.ITALY]: 'italy',
  [Country.USA]: 'eastern_us',
};

export const SUPPLY_SPACE_IDS: string[] = SPACES
  .filter((s) => s.isSupplySpace)
  .map((s) => s.id);

export const REGION_SPACES: Record<string, string[]> = {
  pacific: ['philippines', 'iwo_jima', 'new_guinea', 'hawaii', 'australia', 'southeast_asia', 'indonesia', 'new_zealand'],
  north_africa: ['north_africa'],
  western_europe: ['western_europe', 'united_kingdom'],
  eastern_europe: ['eastern_europe', 'balkans'],
  soviet_union: ['moscow', 'ukraine', 'russia', 'siberia', 'kazakhstan', 'vladivostok', 'mongolia'],
  asia: ['china', 'szechuan', 'india', 'southeast_asia', 'japan', 'philippines', 'iwo_jima', 'new_guinea', 'indonesia'],
  europe: ['western_europe', 'germany', 'italy', 'balkans', 'eastern_europe', 'scandinavia', 'united_kingdom', 'iceland'],
  mediterranean: ['mediterranean'],
  siberia: ['vladivostok', 'siberia', 'russia'],
};

export function spaceMatchesWhere(spaceId: string, where: string[]): boolean {
  for (const w of where) {
    if (spaceId === w) return true;
    if (spaceId.includes(w)) return true;
    if (REGION_SPACES[w]?.includes(spaceId)) return true;
  }
  return false;
}

export const MAP_WIDTH = 1920;
export const MAP_HEIGHT = 983;

export const CONTINENT_SHAPES: { name: string; color: string; points: string }[] = [
  {
    name: 'North America',
    color: '#8B9B6B',
    points: '275,148 455,148 455,430 275,430',
  },
  {
    name: 'Pacific Coast',
    color: '#8B9B6B',
    points: '1755,148 1900,148 1905,420 1865,425 1795,415 1750,385',
  },
  {
    name: 'Hawaii',
    color: '#8B9B6B',
    points: '1730,478 1830,478 1835,548 1730,548',
  },
  {
    name: 'South America',
    color: '#8B9B6B',
    points: '420,610 540,610 540,740 470,760 400,740',
  },
  {
    name: 'Europe',
    color: '#8B9B6B',
    points: '660,110 870,80 960,150 960,300 940,425 850,425 770,395 680,395 680,280 650,200',
  },
  {
    name: 'Russia',
    color: '#8B9B6B',
    points: '890,100 1280,80 1450,130 1450,250 1360,280 1200,370 1060,420 890,310',
  },
  {
    name: 'Africa',
    color: '#B8A068',
    points: '660,458 820,455 980,440 1000,520 980,660 860,680 680,680 620,560 640,470',
  },
  {
    name: 'Middle East & India',
    color: '#B8A068',
    points: '1000,380 1080,380 1200,400 1210,520 1140,540 1000,520',
  },
  {
    name: 'East Asia',
    color: '#8B9B6B',
    points: '1230,280 1400,260 1510,220 1510,330 1430,530 1430,625 1310,625 1250,530 1240,380',
  },
  {
    name: 'Australia & NZ',
    color: '#B8A068',
    points: '1400,640 1580,630 1700,680 1700,780 1400,780',
  },
];

export const TERRITORY_SHAPES: Record<string, string> = {
  // ─── NORTH AMERICA (East) ───
  canada:     '280,152 435,148 450,225 442,278 280,278',
  eastern_us: '280,278 442,278 438,415 280,415',

  // ─── PACIFIC COAST (right side of map) ───
  pacific_northwest: '1760,155 1880,152 1885,248 1760,248',
  western_us: '1760,248 1895,248 1900,408 1860,415 1795,408 1760,378',
  hawaii:     '1735,482 1820,482 1825,540 1735,540',

  // ─── SOUTH AMERICA ───
  brazil: '408,605 548,605 548,745 475,768 395,748',

  // ─── EUROPE ───
  iceland:         '630,90 710,85 720,130 700,155 640,150 625,120',
  scandinavia:     '740,82 882,78 900,132 878,170 830,168 785,138 752,152 724,125',
  united_kingdom:  '645,195 742,185 748,262 725,282 652,275 635,235',
  germany:         '778,185 882,175 912,215 912,292 858,318 785,318 762,272 770,222',
  western_europe:  '652,285 762,272 785,318 808,368 782,408 705,412 672,405 648,358',
  italy:           '768,355 858,338 882,385 870,418 842,422 780,420 762,395 765,368',
  balkans:         '862,342 945,318 948,388 932,440 892,448 872,412 858,375',
  eastern_europe:  '912,178 975,152 1005,202 1005,312 975,345 912,345 882,318 912,292 912,215',

  // ─── RUSSIA / CENTRAL ASIA ───
  russia:      '920,98 1050,88 1070,152 1040,200 960,210 920,195 895,152',
  moscow:      '1040,195 1120,175 1150,210 1145,285 1090,320 1035,305 1025,250',
  siberia:     '1120,88 1270,85 1290,150 1260,200 1175,210 1140,155',
  ukraine:     '960,315 1030,300 1085,318 1080,400 1030,420 960,405',
  kazakhstan:  '1100,260 1200,240 1255,275 1250,355 1200,380 1130,365 1100,310',
  mongolia:    '1255,200 1340,192 1355,245 1335,275 1268,275 1248,240',
  vladivostok: '1360,140 1435,135 1440,200 1425,235 1375,240 1350,205',

  // ─── AFRICA ───
  north_africa: '668,462 885,458 912,502 888,555 792,562 668,542 648,498',
  africa:       '588,542 712,535 742,608 712,672 638,688 568,648 565,575',
  madagascar:   '880,570 970,555 990,610 970,660 905,672 870,635',

  // ─── MIDDLE EAST & SOUTH ASIA ───
  middle_east:    '975,420 1100,400 1120,455 1100,520 1025,530 960,500',
  india:          '1105,415 1235,400 1255,465 1245,545 1180,555 1105,525 1090,458',
  szechuan:       '1205,318 1315,298 1340,358 1320,408 1245,418 1218,372',
  china:          '1282,268 1405,258 1418,325 1398,385 1352,408 1288,378 1272,318',
  southeast_asia: '1232,462 1335,445 1345,502 1335,562 1272,578 1232,538',

  // ─── EAST ASIA / PACIFIC ISLANDS ───
  japan:       '1465,228 1548,218 1562,298 1538,340 1472,340 1462,282',
  philippines: '1390,438 1455,432 1468,498 1448,535 1395,528 1385,475',
  indonesia:   '1332,542 1412,535 1422,588 1405,612 1348,615 1325,582',
  iwo_jima:    '1498,372 1565,372 1568,418 1498,418',
  new_guinea:  '1485,542 1578,532 1592,588 1572,618 1508,618 1478,585',
  new_zealand: '1602,692 1678,688 1685,748 1668,768 1612,765 1598,732',
  australia:   '1415,648 1588,638 1612,725 1602,785 1428,785 1408,725',
};

export const OCEAN_REGIONS: { name: string; cx: number; cy: number; rx: number; ry: number }[] = [
  { name: 'Atlantic Ocean', cx: 570, cy: 460, rx: 110, ry: 200 },
  { name: 'Pacific Ocean', cx: 1700, cy: 440, rx: 130, ry: 250 },
  { name: 'Indian Ocean', cx: 1100, cy: 600, rx: 120, ry: 100 },
];
