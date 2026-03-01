import { Card, CardEffect, CardType, Country, Team } from './types';

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

const COUNTRY_PREFIX: Record<Country, string> = {
  [Country.GERMANY]: 'ger',
  [Country.UK]: 'uk',
  [Country.JAPAN]: 'jpn',
  [Country.SOVIET_UNION]: 'ussr',
  [Country.ITALY]: 'ita',
  [Country.USA]: 'usa',
};

function makeCard(
  id: string,
  name: string,
  country: Country,
  type: CardType,
  text: string,
  effects: CardEffect[]
): Card {
  return { id, name, country, type, text, effects };
}

function buildArmyCards(country: Country, count: number): Card[] {
  const prefix = COUNTRY_PREFIX[country];
  return Array.from({ length: count }, (_, i) =>
    makeCard(
      `${prefix}_build_army_${i + 1}`,
      'Build Army',
      country,
      CardType.BUILD_ARMY,
      'Place one of your country\'s available Armies in a land space adjacent to one of the same country\'s supplied pieces, or in that country\'s Home space.',
      [{ type: 'BUILD_ARMY' }]
    )
  );
}

function buildNavyCards(country: Country, count: number): Card[] {
  const prefix = COUNTRY_PREFIX[country];
  return Array.from({ length: count }, (_, i) =>
    makeCard(
      `${prefix}_build_navy_${i + 1}`,
      'Build Navy',
      country,
      CardType.BUILD_NAVY,
      'Place one of your country\'s available Navies in a sea space adjacent to one of the same country\'s supplied pieces.',
      [{ type: 'BUILD_NAVY' }]
    )
  );
}

function landBattleCards(country: Country, count: number): Card[] {
  const prefix = COUNTRY_PREFIX[country];
  return Array.from({ length: count }, (_, i) =>
    makeCard(
      `${prefix}_land_battle_${i + 1}`,
      'Land Battle',
      country,
      CardType.LAND_BATTLE,
      'Select a land space adjacent to one of your own supplied Army or Navy pieces; then select one enemy Army from that space and remove it from the board.',
      [{ type: 'LAND_BATTLE' }]
    )
  );
}

function seaBattleCards(country: Country, count: number): Card[] {
  const prefix = COUNTRY_PREFIX[country];
  return Array.from({ length: count }, (_, i) =>
    makeCard(
      `${prefix}_sea_battle_${i + 1}`,
      'Sea Battle',
      country,
      CardType.SEA_BATTLE,
      'Select a sea space adjacent to one of your own supplied Army or Navy pieces; then select one enemy Navy from that space and remove it from the board.',
      [{ type: 'SEA_BATTLE' }]
    )
  );
}

// ---------------------------------------------------------------------------
// Germany Cards (41 total: 6 BA + 2 BN + 7 LB + 2 SB + 24 unique)
// ---------------------------------------------------------------------------

const GERMANY_BASIC = [
  ...buildArmyCards(Country.GERMANY, 6),
  ...buildNavyCards(Country.GERMANY, 2),
  ...landBattleCards(Country.GERMANY, 7),
  ...seaBattleCards(Country.GERMANY, 2),
];

const GERMANY_UNIQUE: Card[] = [
  // --- Status (12) ---
  makeCard('ger_abundant_resources', 'Abundant Resources', Country.GERMANY, CardType.STATUS,
    'During your Victory Step, gain +1 Victory Point for each German Army in Ukraine, Kazakhstan, or Russia.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'army_in_ukraine_kazakhstan_russia' }]),
  makeCard('ger_atlantic_wall', 'Atlantic Wall', Country.GERMANY, CardType.STATUS,
    'Use once per turn when an Axis Army is battled in Western Europe. The country initiating the battle must discard the top 3 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 3, condition: 'axis_battled_western_europe', where: ['western_europe'] }]),
  makeCard('ger_bias_for_action', 'Bias for Action', Country.GERMANY, CardType.STATUS,
    'Use once per turn when you build an Army. Discard the top 1 card of your draw deck to battle a land space adjacent to the Army just built.',
    [{ type: 'ADDITIONAL_BATTLE', battleType: 'land', condition: 'adjacent' }]),
  makeCard('ger_blitzkrieg', 'Blitzkrieg', Country.GERMANY, CardType.STATUS,
    'Use once per turn when you battle a land space. Discard the top 1 card of your draw deck to build an Army in the space battled.',
    [{ type: 'BUILD_AFTER_BATTLE', pieceType: 'army', condition: 'land_battle' }]),
  makeCard('ger_conscription', 'Conscription', Country.GERMANY, CardType.STATUS,
    'During your Play step, instead of playing a card from hand, discard the top 2 cards of your draw deck to build an Army.',
    [{ type: 'BUILD_ARMY', condition: 'deck_cost_build' }]),
  makeCard('ger_dive_bombers', 'Dive Bombers', Country.GERMANY, CardType.STATUS,
    'Use once per turn when you battle a land space. Discard the top 1 card of your draw deck to battle in the same or adjacent land space to the one battled.',
    [{ type: 'ADDITIONAL_BATTLE', battleType: 'land', condition: 'adjacent_or_same' }]),
  makeCard('ger_jet_fighters', 'Jet Fighters', Country.GERMANY, CardType.STATUS,
    'When you are the target of an Economic Warfare card, reduce the number of cards you must discard by 3 (minimum 0).',
    [{ type: 'DISCARD_CARDS', count: 3, condition: 'reduce_ew_discard' }]),
  makeCard('ger_superior_planning', 'Superior Planning', Country.GERMANY, CardType.STATUS,
    'Use once per turn at the beginning of your turn. Examine the top 4 cards of your draw deck and put them back in the order of your choice.',
    [{ type: 'SCORE_VP', amount: 0, condition: 'examine_top_4' }]),
  makeCard('ger_swedish_iron_ore', 'Swedish Iron Ore', Country.GERMANY, CardType.STATUS,
    'During your Victory Step, gain +1 Victory Point if a German Navy is in the Baltic Sea; then gain +1 Victory Point if a German Army is in Scandinavia.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'swedish_iron_ore' }]),
  makeCard('ger_synthetic_fuel', 'Synthetic Fuel', Country.GERMANY, CardType.STATUS,
    'Use once per turn when you build an Army. Discard the top 2 cards of your draw deck to build an Army adjacent to the Army just built.',
    [{ type: 'BUILD_ARMY', condition: 'after_build_adjacent' }]),
  makeCard('ger_volksturm', 'Volksturm', Country.GERMANY, CardType.STATUS,
    'Use once per turn, at the beginning of your turn. Discard the top 1 card of your draw deck to recruit an Army in Germany. (This is in addition to your Play step.)',
    [{ type: 'RECRUIT_ARMY', where: ['germany'] }]),
  makeCard('ger_wolf_packs', 'Wolf Packs', Country.GERMANY, CardType.STATUS,
    'German Economic Warfare cards containing the word "Submarines" discard 2 extra Allied cards (in total); 3 if a German Army occupies Scandinavia.',
    [{ type: 'DISCARD_CARDS', count: 2, condition: 'submarine' }]),

  // --- Event (6) ---
  makeCard('ger_broad_front', 'Broad Front', Country.GERMANY, CardType.EVENT,
    'Conduct 3 battles, each in a space that was occupied by a Soviet Army adjacent to a German Army at the beginning of the turn.',
    [{ type: 'LAND_BATTLE', count: 3 }]),
  makeCard('ger_forced_conscription', 'Forced Conscription', Country.GERMANY, CardType.EVENT,
    'Recruit 1 or 2 Armies in or adjacent to Germany.',
    [{ type: 'RECRUIT_ARMY', count: 2, where: ['germany'], condition: 'adjacent_or_in' }]),
  makeCard('ger_guns_and_butter', 'Guns and Butter', Country.GERMANY, CardType.EVENT,
    'This card can be used to: build an Army; build a Navy; land battle; or sea battle.',
    [{ type: 'BUILD_ARMY' }, { type: 'BUILD_NAVY' }, { type: 'LAND_BATTLE' }, { type: 'SEA_BATTLE' }]),
  makeCard('ger_military_dictatorships', 'Military Dictatorships in the Balkans', Country.GERMANY, CardType.EVENT,
    'Recruit an Italian Army in the Balkans; then eliminate an Allied Army in the Ukraine.',
    [{ type: 'RECRUIT_ARMY', where: ['balkans'], country: Country.ITALY }, { type: 'ELIMINATE_ARMY', team: Team.ALLIES, where: ['ukraine'] }]),
  makeCard('ger_plunder', 'Plunder', Country.GERMANY, CardType.EVENT,
    'Gain +1 Victory Point for each German Army or Navy outside Germany.',
    [{ type: 'SCORE_VP', amount: 1, condition: 'pieces_outside_home' }]),
  makeCard('ger_the_autobahn', 'The Autobahn', Country.GERMANY, CardType.EVENT,
    'One at a time, once per Army, you may eliminate each German Army on the board and then build that Army.',
    [{ type: 'MOVE_PIECES', pieceType: 'army' }]),

  // --- Economic Warfare (6) ---
  makeCard('ger_submarines_enforce_blockade', 'Submarines Enforce Blockade', Country.GERMANY, CardType.ECONOMIC_WARFARE,
    'For each German Army adjacent to the North Sea, gain +1 Victory Point and the United Kingdom must discard the top 2 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 2, country: Country.UK, scalingCondition: 'german_army_adj_north_sea' }, { type: 'SCORE_VP', amount: 1, scalingCondition: 'german_army_adj_north_sea' }]),
  makeCard('ger_submarines_battle_atlantic', 'Submarines Lead the Battle of the Atlantic', Country.GERMANY, CardType.ECONOMIC_WARFARE,
    'For each German Navy on the board, gain +1 Victory Point and the United Kingdom must discard the top 2 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 2, country: Country.UK, scalingCondition: 'german_navy_on_board' }, { type: 'SCORE_VP', amount: 1, scalingCondition: 'german_navy_on_board' }]),
  makeCard('ger_submarines_monsoon', 'Submarines of the Monsoon Group', Country.GERMANY, CardType.ECONOMIC_WARFARE,
    'The Allied country of your choice must discard the top 2 cards of its draw deck. Gain +2 Victory Points.',
    [{ type: 'DISCARD_CARDS', count: 2 }, { type: 'SCORE_VP', amount: 2 }]),
  makeCard('ger_submarines_unprotected', 'Submarines Prey on Unprotected Shipping', Country.GERMANY, CardType.ECONOMIC_WARFARE,
    'The United Kingdom must discard the top 2 cards of its draw deck; and 3 more if there is no Allied Navy in the North Sea. Gain +1 Victory Point.',
    [{ type: 'DISCARD_CARDS', count: 2, country: Country.UK, bonusCount: 3, bonusCondition: 'no_allied_navy_north_sea' }, { type: 'SCORE_VP', amount: 1 }]),
  makeCard('ger_submarines_murmansk', 'Submarines Raid Murmansk Convoy', Country.GERMANY, CardType.ECONOMIC_WARFARE,
    'For each German Army or Navy in or adjacent to Scandinavia: gain +1 Victory Point and the Soviet Union must discard the top 2 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 2, country: Country.SOVIET_UNION, scalingCondition: 'german_piece_adj_scandinavia' }, { type: 'SCORE_VP', amount: 1, scalingCondition: 'german_piece_adj_scandinavia' }]),
  makeCard('ger_v_weapons', 'V-Weapons', Country.GERMANY, CardType.ECONOMIC_WARFARE,
    'If a German Army is in Western Europe, gain +3 Victory Points and the United Kingdom must discard the top 1 card of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 1, country: Country.UK, bonusCondition: 'german_army_western_europe' }, { type: 'SCORE_VP', amount: 3, bonusCondition: 'german_army_western_europe' }]),
];

const GERMANY_CARDS: Card[] = [...GERMANY_BASIC, ...GERMANY_UNIQUE];

// ---------------------------------------------------------------------------
// United Kingdom Cards (40 total: 5 BA + 5 BN + 4 LB + 5 SB + 21 unique)
// ---------------------------------------------------------------------------

const UK_BASIC = [
  ...buildArmyCards(Country.UK, 5),
  ...buildNavyCards(Country.UK, 5),
  ...landBattleCards(Country.UK, 4),
  ...seaBattleCards(Country.UK, 5),
];

const UK_UNIQUE: Card[] = [
  // --- Status (6) ---
  makeCard('uk_australia_directorate', 'Australia Forms the Directorate of Manpower', Country.UK, CardType.STATUS,
    'Whenever you may build an Army, you may instead recruit that Army in Australia.',
    [{ type: 'BUILD_ARMY', where: ['australia'], condition: 'no_adjacency_required' }]),
  makeCard('uk_free_france', 'Free France', Country.UK, CardType.STATUS,
    'During your Play step, instead of playing a card from hand, discard 2 cards from your hand to build an Army in Western Europe.',
    [{ type: 'BUILD_ARMY', where: ['western_europe'], condition: 'discard_2_from_hand' }]),
  makeCard('uk_lord_linlithgow', 'Lord Linlithgow Declares India to be at War', Country.UK, CardType.STATUS,
    'Whenever you may build an Army, you may instead recruit that Army in India.',
    [{ type: 'BUILD_ARMY', where: ['india'], condition: 'no_adjacency_required' }]),
  makeCard('uk_mackenzie_king', 'Mackenzie King Drafts the National Resources Mobilization Act', Country.UK, CardType.STATUS,
    'During your Victory step, gain +1 Victory Point if a United Kingdom Navy is in the North Atlantic; then gain +1 Victory Point if a United Kingdom Army is in Canada.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'mackenzie_king' }]),
  makeCard('uk_resistance', 'Resistance', Country.UK, CardType.STATUS,
    'During your Play step, instead of playing a card from hand, discard 2 cards from your hand to battle in Western Europe or Italy.',
    [{ type: 'LAND_BATTLE', where: ['western_europe', 'italy'], condition: 'discard_2_from_hand' }]),
  makeCard('uk_royal_navy', 'The Royal Navy', Country.UK, CardType.STATUS,
    'Use once per turn when you battle a sea space. Discard 2 cards from your hand to battle the same or a different sea space.',
    [{ type: 'ADDITIONAL_BATTLE', battleType: 'sea', condition: 'adjacent_or_same', handCost: 2 }]),

  // --- Event (6) ---
  makeCard('uk_dutch_east_indies', 'Dutch East Indies', Country.UK, CardType.EVENT,
    'Recruit an Army in Indonesia and an Army in New Guinea, and then a Navy in the South China Sea.',
    [{ type: 'RECRUIT_ARMY', where: ['indonesia', 'new_guinea'] }, { type: 'RECRUIT_NAVY', where: ['south_china_sea'] }]),
  makeCard('uk_general_smuts', 'General Smuts Strengthens Ties to UK', Country.UK, CardType.EVENT,
    'Recruit an Army in Africa and a Navy in the Southern Ocean or the Bay of Bengal.',
    [{ type: 'RECRUIT_ARMY', where: ['africa'] }, { type: 'RECRUIT_NAVY', where: ['southern_ocean', 'bay_of_bengal'] }]),
  makeCard('uk_increased_commonwealth', 'Increased Commonwealth Support', Country.UK, CardType.EVENT,
    'Recruit a United Kingdom Army in India, Australia, or Canada.',
    [{ type: 'RECRUIT_ARMY', where: ['india', 'australia', 'canada'] }]),
  makeCard('uk_king_peter', 'King Peter Enthroned in Yugoslavia', Country.UK, CardType.EVENT,
    'Eliminate an Axis Army in the Balkans; then recruit an Army in the Balkans.',
    [{ type: 'ELIMINATE_ARMY', team: Team.AXIS, where: ['balkans'] }, { type: 'RECRUIT_ARMY', where: ['balkans'] }]),
  makeCard('uk_ledo_burma_roads', 'Ledo and Burma Roads', Country.UK, CardType.EVENT,
    'Build an Army in Southeast Asia; then battle in China or Szechuan.',
    [{ type: 'BUILD_ARMY', where: ['southeast_asia'] }, { type: 'LAND_BATTLE', where: ['china', 'szechuan'] }]),
  makeCard('uk_singapore', 'Singapore', Country.UK, CardType.EVENT,
    'Recruit an Army in Southeast Asia and then a Navy in the South China Sea.',
    [{ type: 'RECRUIT_ARMY', where: ['southeast_asia'] }, { type: 'RECRUIT_NAVY', where: ['south_china_sea'] }]),

  // --- Economic Warfare (2) ---
  makeCard('uk_bomber_command', 'Bomber Command', Country.UK, CardType.ECONOMIC_WARFARE,
    'Your choice of Germany or Italy must discard the top 4 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 4 }]),
  makeCard('uk_malta_submarines', 'Malta Submarines', Country.UK, CardType.ECONOMIC_WARFARE,
    'Germany and Italy each must choose to either discard the top 2 cards of its draw deck or eliminate a Navy in the Mediterranean.',
    [{ type: 'DISCARD_CARDS', count: 2, condition: 'malta_submarines' }]),

  // --- Response (7) ---
  makeCard('uk_asw_tactics', 'ASW Tactics', Country.UK, CardType.RESPONSE,
    'Use immediately after an Axis player plays an Economic Warfare card. Ignore the game text of that Economic Warfare card.',
    [{ type: 'DISCARD_CARDS', count: 0, condition: 'cancel_ew_card' }]),
  makeCard('uk_defensive_posture', 'Defensive Posture', Country.UK, CardType.RESPONSE,
    'Use when your supplied army is about to be removed. Do not remove that Army this turn.',
    [{ type: 'PROTECT_PIECE', pieceType: 'army', duration: 'turn' }]),
  makeCard('uk_destroyers', 'Destroyers', Country.UK, CardType.RESPONSE,
    'Use when a supplied United States or United Kingdom Navy is about to be removed. Do not remove that Navy this turn.',
    [{ type: 'PROTECT_PIECE', pieceType: 'navy', duration: 'turn', condition: 'us_or_uk_navy' }]),
  makeCard('uk_enigma_code_cracked', 'Enigma Code Cracked', Country.UK, CardType.RESPONSE,
    'Use immediately after Germany uses a Status card\'s game text. Discard the Status card just after it has been used.',
    [{ type: 'DISCARD_CARDS', count: 1, condition: 'discard_german_status' }]),
  makeCard('uk_loyal_to_crown', 'Loyal to the Crown', Country.UK, CardType.RESPONSE,
    'Use immediately after an Axis Army is built in India, Australia or Canada. Eliminate the Army just built.',
    [{ type: 'ELIMINATE_ARMY', team: Team.AXIS, where: ['india', 'australia', 'canada'] }]),
  makeCard('uk_raf', 'RAF', Country.UK, CardType.RESPONSE,
    'Use when your piece in or adjacent to the United Kingdom is about to be removed. Do not remove that piece this turn.',
    [{ type: 'PROTECT_PIECE', where: ['united_kingdom'], duration: 'turn' }]),
  makeCard('uk_rationing', 'Rationing', Country.UK, CardType.RESPONSE,
    'Use during your play step after playing a card. Instead of placing that card in your discard pile, shuffle it into your draw deck.',
    [{ type: 'DISCARD_CARDS', count: -1, condition: 'return_played_card' }]),
];

const UK_CARDS: Card[] = [...UK_BASIC, ...UK_UNIQUE];

// ---------------------------------------------------------------------------
// Japan Cards (34 total: 4 BA + 6 BN + 3 LB + 4 SB + 17 unique)
// ---------------------------------------------------------------------------

const JAPAN_BASIC = [
  ...buildArmyCards(Country.JAPAN, 4),
  ...buildNavyCards(Country.JAPAN, 6),
  ...landBattleCards(Country.JAPAN, 3),
  ...seaBattleCards(Country.JAPAN, 4),
];

const JAPAN_UNIQUE: Card[] = [
  // --- Status (4) ---
  makeCard('jpn_forward_bases', 'Forward Bases', Country.JAPAN, CardType.STATUS,
    'During your Victory step, gain +2 Victory Points if a Japanese Army is in Hawaii, Pacific Northwest, or New Zealand. (Only +2 Victory Points can be earned.)',
    [{ type: 'VP_PER_CONDITION', amount: 2, condition: 'army_in_hawaii_pnw_nz' }]),
  makeCard('jpn_co_prosperity_sphere', 'Greater East Asia Co-prosperity Sphere', Country.JAPAN, CardType.STATUS,
    'During your Victory step, gain +1 Victory Point for each Japanese Army in Indonesia, New Guinea, or Southeast Asia.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'army_in_indonesia_ng_sea' }]),
  makeCard('jpn_imperial_designs', 'Imperial Designs', Country.JAPAN, CardType.STATUS,
    'During your Victory step, gain +1 Victory Point if a Japanese Army is in Iwo Jima or the Philippines. (Only +1 Victory Point can be earned.)',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'army_in_iwo_jima_or_philippines' }]),
  makeCard('jpn_unimpeded_shipping', 'Unimpeded Merchant Shipping', Country.JAPAN, CardType.STATUS,
    'During your Victory step, gain +1 Victory Point if the Allies do not have an Army in Hawaii.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'no_allied_army_hawaii' }]),

  // --- Economic Warfare (2) ---
  makeCard('jpn_indian_ocean_patrols', 'Indian Ocean Patrols', Country.JAPAN, CardType.ECONOMIC_WARFARE,
    'For each Japanese Navy in or adjacent to the Bay of Bengal, gain +2 Victory Points and the United Kingdom must discard the top 2 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 2, country: Country.UK, scalingCondition: 'japanese_navy_adj_bay_bengal' }, { type: 'SCORE_VP', amount: 2, scalingCondition: 'japanese_navy_adj_bay_bengal' }]),
  makeCard('jpn_submarines_pacific', 'Submarines Support Pacific Islands', Country.JAPAN, CardType.ECONOMIC_WARFARE,
    'For each Japanese Navy in or adjacent to the East Pacific, gain +2 Victory Points and the United States must discard the top 2 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 2, country: Country.USA, scalingCondition: 'japanese_navy_adj_east_pacific' }, { type: 'SCORE_VP', amount: 2, scalingCondition: 'japanese_navy_adj_east_pacific' }]),

  // --- Response (11) ---
  makeCard('jpn_banzai_charge', 'Banzai Charge', Country.JAPAN, CardType.RESPONSE,
    'Use when you battle a land space. Battle in the same or an adjacent land space to the one just battled.',
    [{ type: 'ADDITIONAL_BATTLE', battleType: 'land', condition: 'adjacent_or_same' }]),
  makeCard('jpn_battleship_repair', 'Battleship Repair', Country.JAPAN, CardType.RESPONSE,
    'Use when your supplied Navy is about to be removed. Do not remove that Navy this turn.',
    [{ type: 'PROTECT_PIECE', pieceType: 'navy', duration: 'turn', condition: 'supplied' }]),
  makeCard('jpn_china_offensive', 'China Offensive', Country.JAPAN, CardType.RESPONSE,
    'Use when you battle in China or an adjacent land space. Build an Army in the space battled; then battle in China or an adjacent land space.',
    [{ type: 'BUILD_AFTER_BATTLE', pieceType: 'army', where: ['china'] }, { type: 'LAND_BATTLE', where: ['china'] }]),
  makeCard('jpn_destroyer_transport', 'Destroyer Transport', Country.JAPAN, CardType.RESPONSE,
    'Use when you battle a sea space. Build 1 or 2 Armies adjacent to the space just battled.',
    [{ type: 'BUILD_ARMY', count: 2, condition: 'adjacent_to_battle' }]),
  makeCard('jpn_fall_of_singapore', 'Fall of Singapore', Country.JAPAN, CardType.RESPONSE,
    'Use when you battle in Southeast Asia. Battle the South China Sea; then recruit an Army in Southeast Asia.',
    [{ type: 'SEA_BATTLE', where: ['south_china_sea'] }, { type: 'RECRUIT_ARMY', where: ['southeast_asia'] }]),
  makeCard('jpn_kamikaze', 'Kamikaze', Country.JAPAN, CardType.RESPONSE,
    'Use immediately after an Allied Navy is built adjacent to a Japanese piece. Eliminate the Navy just built.',
    [{ type: 'ELIMINATE_NAVY', team: Team.ALLIES, condition: 'adjacent_to_japanese_piece' }]),
  makeCard('jpn_kwantung_army', 'Kwantung Army', Country.JAPAN, CardType.RESPONSE,
    'Use when a supplied Japanese Army is about to be removed from China, Szechuan, Mongolia or Vladivostok. Do not remove that Army this turn.',
    [{ type: 'PROTECT_PIECE', pieceType: 'army', where: ['china', 'szechuan', 'mongolia', 'vladivostok'], duration: 'turn' }]),
  makeCard('jpn_mobile_force', 'Mobile Force', Country.JAPAN, CardType.RESPONSE,
    'Use at the beginning of your turn. Recruit a Navy in or adjacent to the North Pacific.',
    [{ type: 'RECRUIT_NAVY', where: ['north_pacific'], condition: 'adjacent_or_in' }]),
  makeCard('jpn_snlf', 'Special Naval Landing Forces', Country.JAPAN, CardType.RESPONSE,
    'Use when you build a Navy. Build 1 or 2 Armies adjacent to the space where you built the Navy.',
    [{ type: 'BUILD_ARMY', count: 2, condition: 'after_navy_build_adjacent' }]),
  makeCard('jpn_surprise_attack', 'Surprise Attack', Country.JAPAN, CardType.RESPONSE,
    'Use when you battle a sea space. Battle a sea space; then battle a land space.',
    [{ type: 'SEA_BATTLE' }, { type: 'LAND_BATTLE' }]),
  makeCard('jpn_truk', 'Truk', Country.JAPAN, CardType.RESPONSE,
    'Use anytime during your turn. Japanese pieces in or adjacent to the Central Pacific are in supply for the rest of this turn.',
    [{ type: 'SUPPLY_MARKER', marker: 'truk_supply' }]),
];

const JAPAN_CARDS: Card[] = [...JAPAN_BASIC, ...JAPAN_UNIQUE];

// ---------------------------------------------------------------------------
// Soviet Union Cards (34 total: 8 BA + 1 BN + 6 LB + 2 SB + 17 unique)
// ---------------------------------------------------------------------------

const SOVIET_BASIC = [
  ...buildArmyCards(Country.SOVIET_UNION, 8),
  ...buildNavyCards(Country.SOVIET_UNION, 1),
  ...landBattleCards(Country.SOVIET_UNION, 6),
  ...seaBattleCards(Country.SOVIET_UNION, 2),
];

const SOVIET_UNIQUE: Card[] = [
  // --- Status (6) ---
  makeCard('ussr_frontal_assault', 'Frontal Assault', Country.SOVIET_UNION, CardType.STATUS,
    'Use once per turn when you battle a land space. Discard 2 cards from your hand to battle in the same or adjacent land space to the one battled.',
    [{ type: 'ADDITIONAL_BATTLE', battleType: 'land', condition: 'adjacent_or_same', handCost: 2 }]),
  makeCard('ussr_guards', 'Guards', Country.SOVIET_UNION, CardType.STATUS,
    'During your Play step, instead of playing a card from hand, discard 2 cards from your hand to play a Build Army card from your discard pile.',
    [{ type: 'BUILD_ARMY', condition: 'from_discard' }]),
  makeCard('ussr_scorched_earth', 'Scorched Earth', Country.SOVIET_UNION, CardType.STATUS,
    'Ukraine is not a Supply space for the Axis.',
    [{ type: 'SUPPLY_MARKER', marker: 'scorched_earth_ukraine' }]),
  makeCard('ussr_shvernik_evacuation', "Shvernik's Evacuation Council", Country.SOVIET_UNION, CardType.STATUS,
    'Soviet Armies are never out of supply. Armies must still be built adjacent to another supplied piece, or in your Home space.',
    [{ type: 'PROTECT_PIECE', condition: 'only_land_battle' }]),
  makeCard('ussr_stavka_artillery', 'Stavka Forms Artillery Corps', Country.SOVIET_UNION, CardType.STATUS,
    'Use once per turn when you battle a land space. Discard a card from hand to battle the same space.',
    [{ type: 'ADDITIONAL_BATTLE', battleType: 'land', condition: 'same_only', handCost: 1 }]),
  makeCard('ussr_women_conscripts', 'Women Conscripts', Country.SOVIET_UNION, CardType.STATUS,
    'Use when you play a Build Army card for your Play step. Place that Build Army card on the top of your draw deck instead of discarding it.',
    [{ type: 'DISCARD_CARDS', count: -1, condition: 'return_build_army' }]),

  // --- Event (6) ---
  makeCard('ussr_general_winter', 'General Winter', Country.SOVIET_UNION, CardType.EVENT,
    'Eliminate 1 or 2 Axis Armies in or adjacent to Moscow.',
    [{ type: 'ELIMINATE_ARMY', team: Team.AXIS, count: 2, where: ['moscow'], condition: 'adjacent_or_in' }]),
  makeCard('ussr_german_soviet_treaty', 'German-Soviet Treaty of Friendship, Cooperation, and Demarcation', Country.SOVIET_UNION, CardType.EVENT,
    'Recruit an Army in Russia and an army in Eastern Europe.',
    [{ type: 'RECRUIT_ARMY', where: ['russia'] }, { type: 'RECRUIT_ARMY', where: ['eastern_europe'] }]),
  makeCard('ussr_mao_tse_tung', 'Mao Tse-tung', Country.SOVIET_UNION, CardType.EVENT,
    'Eliminate an Axis Army in China or Szechuan.',
    [{ type: 'ELIMINATE_ARMY', team: Team.AXIS, where: ['china', 'szechuan'] }]),
  makeCard('ussr_tito_partisans', "Tito's Partisans", Country.SOVIET_UNION, CardType.EVENT,
    'Eliminate an Axis Army in the Balkans; then recruit a Soviet or United Kingdom Army in the Balkans.',
    [{ type: 'ELIMINATE_ARMY', team: Team.AXIS, where: ['balkans'] }, { type: 'RECRUIT_ARMY', where: ['balkans'], countries: [Country.SOVIET_UNION, Country.UK] }]),
  makeCard('ussr_trans_siberian', 'Trans-Siberian Railroad', Country.SOVIET_UNION, CardType.EVENT,
    'One at a time, once per army, you may eliminate each Soviet Army on the board and then build that Army.',
    [{ type: 'MOVE_PIECES', pieceType: 'army' }]),
  makeCard('ussr_vasilevsky', 'Vasilevsky Takes Command in the Far East', Country.SOVIET_UNION, CardType.EVENT,
    'Recruit an Army in Vladivostok; then battle in China.',
    [{ type: 'RECRUIT_ARMY', where: ['vladivostok'] }, { type: 'LAND_BATTLE', where: ['china'] }]),

  // --- Response (5) ---
  makeCard('ussr_defense_motherland', 'Defense of the Motherland', Country.SOVIET_UNION, CardType.RESPONSE,
    'Use at the beginning of your turn. Recruit an Army in or adjacent to Moscow; then eliminate an Axis Army in Moscow.',
    [{ type: 'RECRUIT_ARMY', where: ['moscow'], condition: 'adjacent_or_in' }, { type: 'ELIMINATE_ARMY', team: Team.AXIS, where: ['moscow'] }]),
  makeCard('ussr_leningrad', 'Leningrad', Country.SOVIET_UNION, CardType.RESPONSE,
    'Use when your Army in Russia is about to be removed. Do not remove that Army this turn.',
    [{ type: 'PROTECT_PIECE', where: ['russia'], duration: 'turn' }]),
  makeCard('ussr_moscow', 'Moscow', Country.SOVIET_UNION, CardType.RESPONSE,
    'Use when your Army in Moscow is about to be removed. Do not remove that Army this turn.',
    [{ type: 'PROTECT_PIECE', where: ['moscow'], duration: 'turn' }]),
  makeCard('ussr_rasputitsa', 'Rasputitsa', Country.SOVIET_UNION, CardType.RESPONSE,
    'Use immediately after an Axis Army is built in or adjacent to Moscow. Eliminate the Army just built.',
    [{ type: 'ELIMINATE_ARMY', team: Team.AXIS, where: ['moscow'], condition: 'adjacent_or_in' }]),
  makeCard('ussr_stalingrad', 'Stalingrad', Country.SOVIET_UNION, CardType.RESPONSE,
    'Use when your Army in Ukraine is about to be removed. Do not remove that Army this turn.',
    [{ type: 'PROTECT_PIECE', where: ['ukraine'], duration: 'turn' }]),
];

const SOVIET_CARDS: Card[] = [...SOVIET_BASIC, ...SOVIET_UNIQUE];

// ---------------------------------------------------------------------------
// Italy Cards (30 total: 4 BA + 3 BN + 4 LB + 2 SB + 17 unique)
// ---------------------------------------------------------------------------

const ITALY_BASIC = [
  ...buildArmyCards(Country.ITALY, 4),
  ...buildNavyCards(Country.ITALY, 3),
  ...landBattleCards(Country.ITALY, 4),
  ...seaBattleCards(Country.ITALY, 2),
];

const ITALY_UNIQUE: Card[] = [
  // --- Status (5) ---
  makeCard('ita_anti_communist', 'Anti-Communist Sentiment', Country.ITALY, CardType.STATUS,
    'During your Victory step, gain +1 Victory Point for each Italian Army in Russia or Ukraine.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'army_in_russia_or_ukraine' }]),
  makeCard('ita_balkan_resources', 'Balkan Resources', Country.ITALY, CardType.STATUS,
    'During your Victory step, gain +1 Victory Point if an Italian Army is in the Balkans.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'army_in_balkans' }]),
  makeCard('ita_bravado', 'Bravado', Country.ITALY, CardType.STATUS,
    'During your Play step, instead of playing a card from hand, discard the top 2 cards of your draw deck to battle a land space.',
    [{ type: 'LAND_BATTLE', condition: 'deck_cost_battle' }]),
  makeCard('ita_impero_italiano', 'Impero Italiano', Country.ITALY, CardType.STATUS,
    'During your Victory step, gain +1 Victory Point for each Axis Army in North Africa, Africa or Middle East.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'axis_army_in_africa_me' }]),
  makeCard('ita_mare_nostrum', 'Mare Nostrum', Country.ITALY, CardType.STATUS,
    'During your Victory step, gain +1 Victory Point for each Italian Navy on the board.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'italian_navy_count' }]),

  // --- Event (6) ---
  makeCard('ita_afrika_korps', 'Afrika Korps', Country.ITALY, CardType.EVENT,
    'Recruit a German Army in North Africa and then a German Navy in the Mediterranean.',
    [{ type: 'RECRUIT_ARMY', where: ['north_africa'], country: Country.GERMANY }, { type: 'RECRUIT_NAVY', where: ['mediterranean'], country: Country.GERMANY }]),
  makeCard('ita_division_azul', 'Division Azul', Country.ITALY, CardType.EVENT,
    'Discard a random Soviet Response card from the table. You may not inspect the Response card discarded.',
    [{ type: 'DISCARD_CARDS', count: 1, condition: 'discard_soviet_response' }]),
  makeCard('ita_german_aid_greece', 'German Aid in Greece', Country.ITALY, CardType.EVENT,
    'Eliminate an Allied Army in the Balkans; then recruit a German Army in the Balkans.',
    [{ type: 'ELIMINATE_ARMY', team: Team.ALLIES, where: ['balkans'] }, { type: 'RECRUIT_ARMY', where: ['balkans'], country: Country.GERMANY }]),
  makeCard('ita_italian_east_africa', 'Italian East Africa', Country.ITALY, CardType.EVENT,
    'Build an Army in North Africa and then a Navy in the Bay of Bengal.',
    [{ type: 'BUILD_ARMY', where: ['north_africa'] }, { type: 'BUILD_NAVY', where: ['bay_of_bengal'] }]),
  makeCard('ita_italy_attacks_communists', 'Italy Attacks Communists', Country.ITALY, CardType.EVENT,
    'Build an Army in Ukraine and an Army in Russia.',
    [{ type: 'BUILD_ARMY', where: ['ukraine'] }, { type: 'BUILD_ARMY', where: ['russia'] }]),
  makeCard('ita_plunder', 'Plunder', Country.ITALY, CardType.EVENT,
    'Gain +1 Victory Point for each Italian Army or Navy outside Italy.',
    [{ type: 'SCORE_VP', amount: 1, condition: 'pieces_outside_home' }]),

  // --- Economic Warfare (2) ---
  makeCard('ita_decima_flottiglia', 'Decima Flottiglia MAS (Frogmen)', Country.ITALY, CardType.ECONOMIC_WARFARE,
    'The United Kingdom must discard the top 1 card of its draw deck; and 1 more if there is no Allied Navy in the Mediterranean. Gain +1 Victory Point.',
    [{ type: 'DISCARD_CARDS', count: 1, country: Country.UK, bonusCount: 1, bonusCondition: 'no_allied_navy_mediterranean' }, { type: 'SCORE_VP', amount: 1 }]),
  makeCard('ita_regia_marina_shipping', 'Regia Marina Closes Shipping Lanes', Country.ITALY, CardType.ECONOMIC_WARFARE,
    'For each Italian Navy on the board, gain +1 Victory Point and the United Kingdom must discard the top 1 card of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 1, country: Country.UK, scalingCondition: 'italian_navy_on_board' }, { type: 'SCORE_VP', amount: 1, scalingCondition: 'italian_navy_on_board' }]),

  // --- Response (4) ---
  makeCard('ita_german_reinforcements', 'German Reinforcements Counterattack', Country.ITALY, CardType.RESPONSE,
    'Use immediately after a supplied Italian Army is removed. Recruit a German Army in that space.',
    [{ type: 'RECRUIT_ARMY', country: Country.GERMANY, condition: 'after_italian_army_removed' }]),
  makeCard('ita_monte_cassino', 'Monte Cassino', Country.ITALY, CardType.RESPONSE,
    'Use when an Axis Army in Italy is about to be removed. Do not remove that Army this turn.',
    [{ type: 'PROTECT_PIECE', where: ['italy'], duration: 'turn' }]),
  makeCard('ita_romanian_reinforcements', 'Romanian Reinforcements', Country.ITALY, CardType.RESPONSE,
    'Use immediately after a supplied German Army is removed. Recruit an Italian Army in that space.',
    [{ type: 'RECRUIT_ARMY', condition: 'after_german_army_removed' }]),
  makeCard('ita_skilled_pilots', 'Skilled Pilots', Country.ITALY, CardType.RESPONSE,
    'When you are the target of an Economic Warfare card, reduce the number of cards you must discard by 5 (minimum 0).',
    [{ type: 'DISCARD_CARDS', count: 5, condition: 'reduce_ew_discard' }]),
];

const ITALY_CARDS: Card[] = [...ITALY_BASIC, ...ITALY_UNIQUE];

// ---------------------------------------------------------------------------
// United States Cards (41 total: 5 BA + 5 BN + 4 LB + 4 SB + 23 unique)
// ---------------------------------------------------------------------------

const USA_BASIC = [
  ...buildArmyCards(Country.USA, 5),
  ...buildNavyCards(Country.USA, 5),
  ...landBattleCards(Country.USA, 4),
  ...seaBattleCards(Country.USA, 4),
];

const USA_UNIQUE: Card[] = [
  // --- Status (8) ---
  makeCard('usa_aircraft_carriers', 'Aircraft Carriers', Country.USA, CardType.STATUS,
    'Use once per turn when you battle a sea space. Discard the top 1 card of your draw deck to build a Navy in the space battled.',
    [{ type: 'BUILD_AFTER_BATTLE', pieceType: 'navy', condition: 'sea_battle' }]),
  makeCard('usa_american_volunteer', 'American Volunteer Group Expands', Country.USA, CardType.STATUS,
    'Allied Armies in Szechuan are always in supply. During your play step, instead of playing a card from hand, discard the top 2 cards of your draw deck to recruit an Army in Szechuan.',
    [{ type: 'SUPPLY_MARKER', marker: 'szechuan' }, { type: 'RECRUIT_ARMY', where: ['szechuan'], condition: 'discard_2_from_deck' }]),
  makeCard('usa_amphibious_landings', 'Amphibious Landings', Country.USA, CardType.STATUS,
    'Use once per turn when you battle a land space. If the space battled is adjacent to a supplied United States Navy, discard the top 1 card of your draw deck to build an Army in the space battled.',
    [{ type: 'BUILD_AFTER_BATTLE', pieceType: 'army', condition: 'adjacent_to_us_navy' }]),
  makeCard('usa_flying_fortresses', 'Flying Fortresses', Country.USA, CardType.STATUS,
    'Use when you play an Economic Warfare card. Add 2 to the number of cards the Axis player must discard.',
    [{ type: 'DISCARD_CARDS', count: 2, condition: 'boost_ew' }]),
  makeCard('usa_radar', 'Radar', Country.USA, CardType.STATUS,
    'Use once per turn, when your supplied Navy is battled. Discard the top 2 cards of your draw deck and do not remove that Navy.',
    [{ type: 'PROTECT_PIECE', pieceType: 'navy', duration: 'turn', condition: 'supplied' }]),
  makeCard('usa_rosie_the_riveter', 'Rosie the Riveter', Country.USA, CardType.STATUS,
    'Use once per turn at the beginning of your Discard step. Take 1 or 2 cards from your hand and place them on the bottom of your draw deck.',
    [{ type: 'DISCARD_CARDS', count: -2, condition: 'return_to_deck' }]),
  makeCard('usa_superior_shipyards', 'Superior Shipyards', Country.USA, CardType.STATUS,
    'Use once per turn when you build a Navy. Discard the top 1 card of your draw deck to build an additional Navy.',
    [{ type: 'BUILD_NAVY', condition: 'after_build_anywhere' }]),
  makeCard('usa_wartime_production', 'Wartime Production', Country.USA, CardType.STATUS,
    'Use once per turn when you build an Army. Discard the top 1 card of your draw deck to build an additional Army.',
    [{ type: 'BUILD_ARMY', condition: 'after_build_anywhere' }]),

  // --- Event (10) ---
  makeCard('usa_arsenal_of_democracy', 'Arsenal of Democracy', Country.USA, CardType.EVENT,
    'The United Kingdom may build an Army and a Navy in the order of its choice.',
    [{ type: 'BUILD_ALLY_ARMY', condition: 'uk_build_army_and_navy' }]),
  makeCard('usa_fleet_pearl_harbor', 'Fleet Deployed to Pearl Harbor', Country.USA, CardType.EVENT,
    'Recruit an Army in Hawaii; then build a Navy adjacent to Hawaii.',
    [{ type: 'RECRUIT_ARMY', where: ['hawaii'] }, { type: 'BUILD_NAVY', where: ['east_pacific', 'central_pacific', 'north_pacific'] }]),
  makeCard('usa_flexible_resources', 'Flexible Resources', Country.USA, CardType.EVENT,
    'Play a card of your choice from your discard pile.',
    [{ type: 'DISCARD_CARDS', count: -1, condition: 'retrieve_from_discard' }]),
  makeCard('usa_free_french_allies', 'Free French Allies', Country.USA, CardType.EVENT,
    'The United Kingdom may recruit an Army in Western Europe, North Africa, or Africa.',
    [{ type: 'BUILD_ALLY_ARMY', condition: 'uk_recruit_we_na_africa' }]),
  makeCard('usa_guadalcanal', 'Guadalcanal', Country.USA, CardType.EVENT,
    'Recruit an Army in New Zealand; then build a Navy adjacent to New Zealand.',
    [{ type: 'RECRUIT_ARMY', where: ['new_zealand'] }, { type: 'BUILD_NAVY', where: ['new_zealand'], condition: 'adjacent_or_in' }]),
  makeCard('usa_lend_lease', 'Lend Lease', Country.USA, CardType.EVENT,
    'Your choice of the United Kingdom or the Soviet Union may play a card and then draw a card.',
    [{ type: 'BUILD_ALLY_ARMY', condition: 'ally_play_and_draw' }]),
  makeCard('usa_murmansk_convoy', 'Murmansk Convoy', Country.USA, CardType.EVENT,
    'Recruit a Soviet Army in Russia; then the Soviet Union may build an Army.',
    [{ type: 'RECRUIT_ARMY', where: ['russia'], country: Country.SOVIET_UNION }, { type: 'BUILD_ALLY_ARMY', condition: 'soviet_build_army' }]),
  makeCard('usa_operation_magic', 'Operation Magic', Country.USA, CardType.EVENT,
    'Discard a random Japanese Response card from the table. You may not inspect the Response card discarded.',
    [{ type: 'DISCARD_CARDS', count: 1, condition: 'discard_japanese_response' }]),
  makeCard('usa_patton_advances', 'Patton Advances', Country.USA, CardType.EVENT,
    'Build an Army in Western Europe; then battle in Germany or Italy.',
    [{ type: 'BUILD_ARMY', where: ['western_europe'] }, { type: 'LAND_BATTLE', where: ['germany', 'italy'] }]),
  makeCard('usa_theater_shift', 'Theater Shift', Country.USA, CardType.EVENT,
    'One at a time, once per piece, you may eliminate each United States Army and Navy on the board and then build that piece.',
    [{ type: 'MOVE_PIECES' }]),

  // --- Economic Warfare (5) ---
  makeCard('usa_b24_liberator', 'B-24 Liberator', Country.USA, CardType.ECONOMIC_WARFARE,
    'If a United States Army is within 2 spaces of Italy, Italy must discard the top 4 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 4, country: Country.ITALY }]),
  makeCard('usa_b26_marauder', 'B-26 Marauder', Country.USA, CardType.ECONOMIC_WARFARE,
    'If a United States Army is within 3 spaces of an Axis Home space, that country must discard the top 4 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 4 }]),
  makeCard('usa_b29_superfortress', 'B-29 Superfortress', Country.USA, CardType.ECONOMIC_WARFARE,
    'If a United States Army is within 3 spaces of Germany, Germany must discard the top 5 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 5, country: Country.GERMANY }]),
  makeCard('usa_firestorm_bombing', 'Firestorm Bombing', Country.USA, CardType.ECONOMIC_WARFARE,
    'If a United States Army or Navy is adjacent to an Axis Home space, that country must discard the top 7 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 7 }]),
  makeCard('usa_sdb_dauntless', 'SDB Dauntless', Country.USA, CardType.ECONOMIC_WARFARE,
    'If a United States Navy is within 2 spaces of Japan, Japan must discard the top 4 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 4, country: Country.JAPAN }]),
];

const USA_CARDS: Card[] = [...USA_BASIC, ...USA_UNIQUE];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ALL_CARDS: Card[] = [
  ...GERMANY_CARDS,
  ...UK_CARDS,
  ...JAPAN_CARDS,
  ...SOVIET_CARDS,
  ...ITALY_CARDS,
  ...USA_CARDS,
];

export function getCountryDeck(country: Country): Card[] {
  const decks: Record<Country, Card[]> = {
    [Country.GERMANY]: GERMANY_CARDS,
    [Country.UK]: UK_CARDS,
    [Country.JAPAN]: JAPAN_CARDS,
    [Country.SOVIET_UNION]: SOVIET_CARDS,
    [Country.ITALY]: ITALY_CARDS,
    [Country.USA]: USA_CARDS,
  };
  return [...decks[country]];
}

export { GERMANY_CARDS, UK_CARDS, JAPAN_CARDS, SOVIET_CARDS, ITALY_CARDS, USA_CARDS };
