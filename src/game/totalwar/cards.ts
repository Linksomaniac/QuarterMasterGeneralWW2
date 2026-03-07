// ---------------------------------------------------------------------------
// Total War Expansion Cards
// All ~165 expansion cards organized by country.
// Categories included: Air Marshall, Air Marshall/Total War,
// Alternate Histories, Alternate Histories/Total War, Total War
// ---------------------------------------------------------------------------

import { Country, Team, CardType, CardEffect } from '../types';
import { TotalWarCard, ExtendedCardType, BolsterTrigger, MinorPower } from './types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function twCard(
  id: string,
  name: string,
  country: Country,
  type: ExtendedCardType,
  text: string,
  effects: CardEffect[],
  opts?: {
    bolsterTrigger?: BolsterTrigger;
    isSubstitute?: boolean;
    substitutesBaseId?: string;
    minorPower?: MinorPower;
  }
): TotalWarCard {
  return {
    id,
    name,
    country,
    type,
    text,
    effects,
    ...opts,
  };
}

function airPowerCards(country: Country, count: number, prefix: string): TotalWarCard[] {
  return Array.from({ length: count }, (_, i) =>
    twCard(
      `${prefix}_air_power_${i + 1}`,
      'Air Power',
      country,
      'AIR_POWER',
      'Play during the Air Force step to either (a) place an available Air Force in a space with your supplied Army or Navy, or (b) select one of your supplied Air Forces on the board and move it to any space that has a supplied Army or Navy. Or discard to gain Air Superiority.',
      [{ type: 'BUILD_ARMY' }] // placeholder effect — handled by air step logic
    )
  );
}

// ---------------------------------------------------------------------------
// GERMANY EXPANSION CARDS (27 cards)
// ---------------------------------------------------------------------------

// Air Marshall: 3 Deploy Air Force (Air Power) + 1 Bolster
// Air Marshall / Total War: 7 Bolsters
// Alternate Histories: 1 Air Power + 1 EW + 1 Status
// Alternate Histories / Total War: 8 Status + 3 Event + 2 Bolster + 1 EW + 1 Land Battle + 1 Build Navy(?)
// Total War: 0 unique (Air Power covered above)

const GERMANY_AIR_POWER = airPowerCards(Country.GERMANY, 4, 'ger_tw');

const GERMANY_EXPANSION: TotalWarCard[] = [
  // --- Air Marshall Bolster ---
  twCard('ger_tw_me109s', 'Me-109s Attack Airfields', Country.GERMANY, 'BOLSTER',
    'Use when you deploy or marshal an Air Force. Discard the top card of your draw deck to eliminate an Allied Air Force adjacent to that Air Force.',
    [{ type: 'ELIMINATE_NAVY', condition: 'eliminate_adjacent_af' }],
    { bolsterTrigger: 'DEPLOY_OR_MARSHAL_AF' }),

  // --- Air Marshall / Total War Bolsters ---
  twCard('ger_tw_admiral_graf_spee', 'Admiral Graf Spee', Country.GERMANY, 'BOLSTER',
    'Use when you build a Navy. Discard the top card of your draw deck to battle a Navy in the North Sea, North Atlantic, or South Atlantic.',
    [{ type: 'SEA_BATTLE', where: ['north_sea', 'north_atlantic', 'south_atlantic'] }],
    { bolsterTrigger: 'BUILD_NAVY' }),

  twCard('ger_tw_cloud_cover', 'Cloud Cover', Country.GERMANY, 'BOLSTER',
    'Use at the beginning of your Play step. Air Defense and Air Attack cannot be used this turn.',
    [{ type: 'SCORE_VP', amount: 0, condition: 'disable_air_defense' }],
    { bolsterTrigger: 'PLAY_STEP_BEGIN' }),

  twCard('ger_tw_ju52_airlift', "Ju-52's Airlift Supplies", Country.GERMANY, 'BOLSTER',
    'Use at the beginning of your Play step. If you have an Air Force on the board, all German Pieces are in supply for the rest of the turn.',
    [{ type: 'SUPPLY_MARKER', condition: 'all_in_supply_if_af' }],
    { bolsterTrigger: 'PLAY_STEP_BEGIN' }),

  twCard('ger_tw_ju87', 'Ju-87', Country.GERMANY, 'BOLSTER',
    'Use when you deploy or marshal an Air Force. Discard the top card of your draw deck to battle an Army adjacent to that Air Force.',
    [{ type: 'LAND_BATTLE', condition: 'adjacent_to_af' }],
    { bolsterTrigger: 'DEPLOY_OR_MARSHAL_AF' }),

  twCard('ger_tw_operation_weserubung', 'Operation Weserübung', Country.GERMANY, 'BOLSTER',
    'Use at the beginning of your Victory step. Discard the top card of your draw deck to recruit an Army in Scandinavia.',
    [{ type: 'RECRUIT_ARMY', where: ['scandinavia'] }],
    { bolsterTrigger: 'VICTORY_STEP_BEGIN' }),

  twCard('ger_tw_tactical_innovations', 'Tactical Innovations', Country.GERMANY, 'BOLSTER',
    'Use at the beginning of your Play step. Discard your Status card on the table to place a Status card from your hand on the table.',
    [{ type: 'DISCARD_CARDS', condition: 'swap_status' }],
    { bolsterTrigger: 'PLAY_STEP_BEGIN' }),

  twCard('ger_tw_the_blitz', 'The Blitz', Country.GERMANY, 'BOLSTER',
    'Use when you play an Economic Warfare card. The United Kingdom must discard the top 2 cards of its draw deck for each German Air Force within 2 spaces of the United Kingdom.',
    [{ type: 'DISCARD_CARDS', count: 2, country: Country.UK, scalingCondition: 'german_af_near_uk' }],
    { bolsterTrigger: 'PLAY_EW' }),

  // --- Alternate Histories ---
  twCard('ger_tw_arkhangelsk_overrun', 'Arkhangelsk Overrun', Country.GERMANY, CardType.ECONOMIC_WARFARE,
    'To use, the Axis must have an Army in Scandinavia and Russia. The Soviet Union must discard the top 5 cards of its draw deck. Gain +1 Victory Point.',
    [{ type: 'DISCARD_CARDS', count: 5, country: Country.SOVIET_UNION }, { type: 'SCORE_VP', amount: 1 }]),

  twCard('ger_tw_synthetic_fuel_ah', 'Synthetic Fuel', Country.GERMANY, CardType.STATUS,
    'Use once per turn when you build an Army. Discard the top 2 cards of your draw deck to build an Army adjacent to the Army just built.',
    [{ type: 'BUILD_ARMY', condition: 'after_build_adjacent' }]),

  // --- Alternate Histories / Total War ---
  twCard('ger_tw_12_8cm_flak', '12.8cm Flakzwilling 40', Country.GERMANY, CardType.STATUS,
    'Discard 2 fewer cards than required by Allied Economic Warfare cards.',
    [{ type: 'DISCARD_CARDS', count: 2, condition: 'reduce_ew_discard' }]),

  twCard('ger_tw_ardennes_offensive', 'Ardennes Offensive', Country.GERMANY, CardType.EVENT,
    'Battle in Western Europe; then build an Army in Western Europe.',
    [{ type: 'LAND_BATTLE', where: ['western_europe'] }, { type: 'BUILD_ARMY', where: ['western_europe'] }]),

  twCard('ger_tw_elektroboot_submarines', 'Elektroboot Submarines', Country.GERMANY, CardType.ECONOMIC_WARFARE,
    'Your choice of one Allied country must discard the top card of its draw deck. Gain +3 Victory Points.',
    [{ type: 'DISCARD_CARDS', count: 1 }, { type: 'SCORE_VP', amount: 3 }]),

  twCard('ger_tw_fall_weiss', 'Fall Weiss', Country.GERMANY, CardType.EVENT,
    'Discard the top of your draw deck and recruit an Army in Eastern Europe. Then, play another card from your hand.',
    [{ type: 'RECRUIT_ARMY', where: ['eastern_europe'] }]),

  twCard('ger_tw_fallschirmjager', 'Fallschirmjäger', Country.GERMANY, 'BOLSTER',
    'Use at the beginning of your Play step. Discard the top card of your draw deck to battle a land space adjacent to your Air Force.',
    [{ type: 'LAND_BATTLE', condition: 'adjacent_to_af' }],
    { bolsterTrigger: 'PLAY_STEP_BEGIN' }),

  twCard('ger_tw_g7e_torpedo', 'G7e Torpedo', Country.GERMANY, 'BOLSTER',
    'Use when you play an Economic Warfare card with the word "Submarines" in the title. Discard the top card of your draw deck to battle a Navy from the same country targeted by the Economic Warfare.',
    [{ type: 'SEA_BATTLE', condition: 'ew_submarine_target' }],
    { bolsterTrigger: 'GERMANY_PLAYS_SUBMARINE' }),

  twCard('ger_tw_land_battle_ahtw', 'Land Battle', Country.GERMANY, CardType.LAND_BATTLE,
    'Select an enemy Army adjacent to one or more of your own supplied Army or Navy pieces and remove it from the board.',
    [{ type: 'LAND_BATTLE' }]),

  twCard('ger_tw_landkreuzers', 'Landkreuzers', Country.GERMANY, CardType.STATUS,
    'Use once per turn, when a Germany Army is battled. The country initiating the battle must discard the top 3 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 3, condition: 'german_army_battled' }]),

  twCard('ger_tw_sea_lion', 'Sea Lion', Country.GERMANY, CardType.EVENT,
    'Build a Navy in the North Sea, then battle the United Kingdom.',
    [{ type: 'BUILD_NAVY', where: ['north_sea'] }, { type: 'LAND_BATTLE', where: ['united_kingdom'] }]),

  twCard('ger_tw_strategic_planning', 'Strategic Planning', Country.GERMANY, CardType.EVENT,
    'Take your choice of 1 or 2 cards from your draw deck and add them to your hand, then discard a card from your hand. Shuffle your draw deck.',
    [{ type: 'DISCARD_CARDS', condition: 'search_deck' }]),

  twCard('ger_tw_sweden_supports_finland', 'Sweden Supports Finland', Country.GERMANY, CardType.EVENT,
    'To use, Germany or the Soviet Union must have an Army in Russia. Build a Navy in the Baltic and recruit an Army in Scandinavia.',
    [{ type: 'BUILD_NAVY', where: ['baltic_sea'] }, { type: 'RECRUIT_ARMY', where: ['scandinavia'] }]),

  twCard('ger_tw_turkey_joins_axis', 'Turkey Joins Axis', Country.GERMANY, CardType.EVENT,
    'Build a Navy in the Black Sea; then recruit an Army in the Middle East.',
    [{ type: 'BUILD_NAVY', where: ['black_sea'] }, { type: 'RECRUIT_ARMY', where: ['middle_east'] }]),

  twCard('ger_tw_westwall', 'Westwall', Country.GERMANY, CardType.STATUS,
    'Use once per turn when an Axis Army is battled in Germany. The country initiating the battle must discard the top 4 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 4, condition: 'axis_battled_germany' }]),
];

// ---------------------------------------------------------------------------
// ITALY EXPANSION CARDS (24 cards)
// ---------------------------------------------------------------------------

const ITALY_AIR_POWER = airPowerCards(Country.ITALY, 3, 'ita_tw');

const ITALY_EXPANSION: TotalWarCard[] = [
  // --- Air Marshall Bolster ---
  twCard('ita_tw_macchi_c202', 'Macchi C.202', Country.ITALY, 'BOLSTER',
    'Use when you deploy or marshal an Air Force. Discard 2 cards from your hand to eliminate an Allied Air Force adjacent to that Air Force.',
    [{ type: 'ELIMINATE_NAVY', condition: 'eliminate_adjacent_af' }],
    { bolsterTrigger: 'DEPLOY_OR_MARSHAL_AF' }),

  // --- Air Marshall / Total War Bolsters ---
  twCard('ita_tw_golden_square_coup', 'Golden Square Coup', Country.ITALY, 'BOLSTER',
    'Use at the beginning of your Victory step. Germany may recruit an Army in the Middle East.',
    [{ type: 'RECRUIT_ARMY', where: ['middle_east'], country: Country.GERMANY }],
    { bolsterTrigger: 'VICTORY_STEP_BEGIN' }),

  twCard('ita_tw_regia_aeronautica', 'Regia Aeronautica', Country.ITALY, 'BOLSTER',
    'Use when you are the target of an Economic Warfare card. Remove your Air Force from the board instead of discarding cards.',
    [{ type: 'DISCARD_CARDS', condition: 'remove_af_instead' }],
    { bolsterTrigger: 'TARGET_OF_EW' }),

  twCard('ita_tw_somaliland', 'Somaliland', Country.ITALY, 'BOLSTER',
    'Use at the beginning of your Victory step. Recruit an Army in Africa.',
    [{ type: 'RECRUIT_ARMY', where: ['africa'] }],
    { bolsterTrigger: 'VICTORY_STEP_BEGIN' }),

  twCard('ita_tw_supermarina', 'Supermarina', Country.ITALY, 'BOLSTER',
    'Use during your Victory step. Gain +1 Victory Point per Italian Navy on the board.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'italian_navy_count' }],
    { bolsterTrigger: 'VICTORY_STEP_BEGIN' }),

  // --- Alternate Histories ---
  twCard('ita_tw_italy_completes_carriers', 'Italy Completes Carriers Early', Country.ITALY, 'BOLSTER',
    'Use at the beginning of your Play step. Discard any card from your hand to deploy or marshal an Air Force in a space with your Navy.',
    [{ type: 'BUILD_ARMY', condition: 'deploy_af_with_navy' }],
    { bolsterTrigger: 'PLAY_STEP_BEGIN' }),

  twCard('ita_tw_ireland_revolts', 'Ireland Revolts', Country.ITALY, CardType.ECONOMIC_WARFARE,
    'The United Kingdom must choose to either eliminate an Army from the United Kingdom or discard the top 3 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 3, country: Country.UK, condition: 'ireland_revolts' }]),

  // --- Alternate Histories / Total War ---
  twCard('ita_tw_alpini', 'Alpini', Country.ITALY, CardType.RESPONSE,
    'Use when your Army is battled in or adjacent to Italy. Do not remove that Army.',
    [{ type: 'PROTECT_PIECE', where: ['italy'], duration: 'turn', condition: 'adjacent_or_in' }]),

  twCard('ita_tw_betasom', 'BETASOM', Country.ITALY, 'BOLSTER',
    'Use when Germany plays a card with the word Submarine. The Allied country targeted by the card must discard 2 additional cards from the top of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 2, condition: 'german_submarine_boost' }],
    { bolsterTrigger: 'GERMANY_PLAYS_SUBMARINE' }),

  twCard('ita_tw_build_navy_ahtw', 'Build Navy', Country.ITALY, CardType.BUILD_NAVY,
    'Place one of your country\'s available Navies in a sea space adjacent to one of the same country\'s supplied pieces.',
    [{ type: 'BUILD_NAVY' }]),

  twCard('ita_tw_giuliani', 'Giuliani, Cappellini, and Torelli', Country.ITALY, CardType.EVENT,
    'Germany, Italy, and Japan each take a random card from their discard piles and place them on top of their draw decks. Gain +1 Victory point.',
    [{ type: 'SCORE_VP', amount: 1, condition: 'axis_reclaim_discards' }]),

  twCard('ita_tw_irredentismo', 'Irredentismo Italiano', Country.ITALY, CardType.STATUS,
    'During the Victory step of your turn, gain +1 Victory Point if you have an Army in Western Europe.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'army_in_western_europe' }]),

  twCard('ita_tw_land_battle_ahtw', 'Land Battle', Country.ITALY, CardType.LAND_BATTLE,
    'Select an enemy Army adjacent to one or more of your own supplied Army or Navy pieces and remove it from the board.',
    [{ type: 'LAND_BATTLE' }]),

  twCard('ita_tw_operation_herkules', 'Operation Herkules', Country.ITALY, CardType.EVENT,
    'Recruit an available Italian Navy and German Navy in the Mediterranean.',
    [{ type: 'RECRUIT_NAVY', where: ['mediterranean'] }, { type: 'RECRUIT_NAVY', where: ['mediterranean'], country: Country.GERMANY }]),

  twCard('ita_tw_operation_pike', 'Operation Pike', Country.ITALY, CardType.ECONOMIC_WARFARE,
    'If the United Kingdom has an Army within 2 spaces of Ukraine, the Soviet Union must discard the top 2 cards of its draw deck. Gain +1 Victory Point.',
    [{ type: 'DISCARD_CARDS', count: 2, country: Country.SOVIET_UNION }, { type: 'SCORE_VP', amount: 1 }]),

  twCard('ita_tw_operation_unthinkable', 'Operation Unthinkable', Country.ITALY, CardType.RESPONSE,
    'Use immediately after the Soviet Union builds an Army. If the United Kingdom or United States has an Army adjacent to the Soviet Army just built, eliminate that Soviet Army.',
    [{ type: 'ELIMINATE_ARMY', country: Country.SOVIET_UNION, condition: 'allied_adjacent_to_soviet_build' }]),

  twCard('ita_tw_pact_of_steel', 'Pact of Steel', Country.ITALY, 'BOLSTER',
    'Use at any time. Germany must discard between 1 and 5 cards from its hand; then Italy may take the same number of random cards from its discard pile and place them on top of its draw deck.',
    [{ type: 'DISCARD_CARDS', condition: 'germany_to_italy_transfer' }],
    { bolsterTrigger: 'ANY_PLAYER_PLAY_STEP' }),

  twCard('ita_tw_reza_shah', 'Reza Shah Supports Axis', Country.ITALY, CardType.EVENT,
    'Eliminate an Allied Army the Middle East.',
    [{ type: 'ELIMINATE_ARMY', team: Team.ALLIES, where: ['middle_east'] }]),

  twCard('ita_tw_spain', 'Spain', Country.ITALY, CardType.EVENT,
    'Build an Army in Western Europe or North Africa; then build a Navy in the Mediterranean or North Sea.',
    [{ type: 'BUILD_ARMY', where: ['western_europe', 'north_africa'] }, { type: 'BUILD_NAVY', where: ['mediterranean', 'north_sea'] }]),

  twCard('ita_tw_spanish_troops_gibraltar', 'Spanish Troops Seize Gibraltar', Country.ITALY, CardType.STATUS,
    'The North Sea and Mediterranean are never adjacent for the Allies, and always adjacent for the Axis.',
    [{ type: 'SUPPLY_MARKER', condition: 'gibraltar_axis' }]),

  twCard('ita_tw_turkey_opens_straits', 'Turkey Opens the Straits', Country.ITALY, CardType.STATUS,
    'For the Axis, the Middle East is adjacent to Balkans, and the Black Sea is adjacent to Mediterranean Sea.',
    [{ type: 'SUPPLY_MARKER', condition: 'turkey_straits_axis' }]),

  twCard('ita_tw_wafdist_uprising', 'Wafdist Uprising', Country.ITALY, CardType.EVENT,
    'Eliminate an Allied Army in North Africa.',
    [{ type: 'ELIMINATE_ARMY', team: Team.ALLIES, where: ['north_africa'] }]),
];

// ---------------------------------------------------------------------------
// JAPAN EXPANSION CARDS (28 cards)
// ---------------------------------------------------------------------------

const JAPAN_AIR_POWER = airPowerCards(Country.JAPAN, 4, 'jpn_tw');

const JAPAN_EXPANSION: TotalWarCard[] = [
  // --- Air Marshall Bolster ---
  twCard('jpn_tw_a6m_zero_sen', 'A6M Zero-Sen', Country.JAPAN, 'BOLSTER',
    'Use when you battle a sea space. Discard a Response card from your hand to battle an additional Navy in the same or an adjacent space.',
    [{ type: 'SEA_BATTLE', condition: 'adjacent_or_same' }],
    { bolsterTrigger: 'BATTLE_SEA' }),

  // --- Air Marshall / Total War Bolsters ---
  twCard('jpn_tw_imperial_japanese_navy', 'Imperial Japanese Navy', Country.JAPAN, 'BOLSTER',
    'Use when you build a Navy. Discard a Response card from your hand to build an additional Navy.',
    [{ type: 'BUILD_NAVY', condition: 'after_build_anywhere' }],
    { bolsterTrigger: 'BUILD_NAVY' }),

  twCard('jpn_tw_island_fortresses', 'Island Fortresses', Country.JAPAN, 'BOLSTER',
    'Use at the beginning of your Victory step. Discard a Response card from your hand to recruit an Army in Indonesia, New Guinea, Iwo Jima, or Philippines.',
    [{ type: 'RECRUIT_ARMY', where: ['indonesia', 'new_guinea', 'iwo_jima', 'philippines'] }],
    { bolsterTrigger: 'VICTORY_STEP_BEGIN' }),

  twCard('jpn_tw_nagumo_commands', 'Nagumo Commands the First Air Fleet', Country.JAPAN, 'BOLSTER',
    'Use when you deploy or marshal an Air Force to a sea space. Discard a Response card from your hand to battle a space adjacent to that Air Force.',
    [{ type: 'SEA_BATTLE', condition: 'adjacent_to_af' }],
    { bolsterTrigger: 'DEPLOY_OR_MARSHAL_AF' }),

  twCard('jpn_tw_pacific_empire', 'The Pacific Empire', Country.JAPAN, 'BOLSTER',
    'Use during your Victory step. Score +1 Victory Point for each Japanese Navy that occupies a space with Pacific in the title.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'navy_in_pacific' }],
    { bolsterTrigger: 'VICTORY_STEP_BEGIN' }),

  twCard('jpn_tw_tora', 'Tora', Country.JAPAN, 'BOLSTER',
    'Use when you deploy or marshal an Air Force. Discard a Response card from your hand to eliminate an Allied Air Force adjacent to that Air Force.',
    [{ type: 'ELIMINATE_NAVY', condition: 'eliminate_adjacent_af' }],
    { bolsterTrigger: 'DEPLOY_OR_MARSHAL_AF' }),

  twCard('jpn_tw_yamamoto_aboard_yamato', 'Yamamoto aboard the Yamato', Country.JAPAN, 'BOLSTER',
    'Use at the beginning of your Play step. Discard a Response card from your hand to deploy an Air Force in a space with your supplied Navy. (You do not need a Deploy Air Force card.)',
    [{ type: 'BUILD_ARMY', condition: 'deploy_af_with_navy_no_card' }],
    { bolsterTrigger: 'PLAY_STEP_BEGIN' }),

  // --- Alternate Histories ---
  twCard('jpn_tw_fracturing_commonwealth', 'Fracturing the Commonwealth', Country.JAPAN, CardType.ECONOMIC_WARFARE,
    'The United Kingdom must discard the top card of its draw deck for each Japanese Army and Navy adjacent to the Bay of Bengal or Indian Ocean.',
    [{ type: 'DISCARD_CARDS', count: 1, country: Country.UK, scalingCondition: 'japanese_piece_adj_bay_bengal_indian' }]),

  // --- Alternate Histories / Total War ---
  twCard('jpn_tw_absolute_defense', 'Absolute National Defense Sphere', Country.JAPAN, CardType.STATUS,
    'During the Victory step of your turn, gain +1 Victory Point if you have 3 or more Navies on the board.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'three_or_more_navies' }]),

  twCard('jpn_tw_bombing_chongqing', 'Bombing of Chongqing', Country.JAPAN, CardType.ECONOMIC_WARFARE,
    'The United States must discard the top 2 cards of its draw deck. Gain +1 Victory Point.',
    [{ type: 'DISCARD_CARDS', count: 2, country: Country.USA }, { type: 'SCORE_VP', amount: 1 }]),

  twCard('jpn_tw_build_navy_ahtw', 'Build Navy', Country.JAPAN, CardType.BUILD_NAVY,
    'Place one of your country\'s available Navies in a sea space adjacent to one of the same country\'s supplied pieces.',
    [{ type: 'BUILD_NAVY' }]),

  twCard('jpn_tw_chinese_civil_war', 'Chinese Civil War', Country.JAPAN, CardType.RESPONSE,
    'Use at the beginning of your Play step. Eliminate a Chinese Army.',
    [{ type: 'ELIMINATE_ARMY', condition: 'eliminate_chinese_army' }],
    { minorPower: 'CHINA' }),

  twCard('jpn_tw_code_of_bushido', 'Code of Bushido', Country.JAPAN, 'BOLSTER',
    'Use when your Army is battled. Discard a Response card from your hand and do not remove the Army.',
    [{ type: 'PROTECT_PIECE', pieceType: 'army', duration: 'turn' }],
    { bolsterTrigger: 'ARMY_BATTLED' }),

  twCard('jpn_tw_hokushin_ron', 'Hokushin-ron', Country.JAPAN, CardType.STATUS,
    'During the Victory step of your turn. Gain +1 Victory Point for each Army you have in Vladivostok and Siberia.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'army_in_vladivostok_siberia' }]),

  twCard('jpn_tw_imperial_manchukuo_army', 'Imperial Manchukuo Army', Country.JAPAN, CardType.RESPONSE,
    'Use at the beginning of your Play step. Recruit an Army in China.',
    [{ type: 'RECRUIT_ARMY', where: ['china'] }]),

  twCard('jpn_tw_japan_arms_nationalists', 'Japan Arms Indian Nationalists', Country.JAPAN, CardType.RESPONSE,
    'Use when you battle India. Build an Army in India.',
    [{ type: 'BUILD_ARMY', where: ['india'] }]),

  twCard('jpn_tw_japanese_fleet_blockades', 'Japanese Fleet Blockades Vladivostok', Country.JAPAN, CardType.ECONOMIC_WARFARE,
    'The Soviet Union must discard the top 2 cards of its draw deck. Gain +1 Victory Point.',
    [{ type: 'DISCARD_CARDS', count: 2, country: Country.SOVIET_UNION }, { type: 'SCORE_VP', amount: 1 }]),

  twCard('jpn_tw_japanese_mandate_south_seas', 'Japanese Mandate for the South Seas Islands', Country.JAPAN, CardType.STATUS,
    'During the Victory step of your turn, gain +1 Victory Point if you have a Navy in the Central Pacific.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'navy_in_central_pacific' }]),

  twCard('jpn_tw_kantai_kessen', 'Kantai Kessen', Country.JAPAN, CardType.RESPONSE,
    'Use at the beginning of your Play step. Battle a Sea space.',
    [{ type: 'SEA_BATTLE' }]),

  twCard('jpn_tw_marco_polo_bridge', 'Marco Polo Bridge Incident', Country.JAPAN, CardType.RESPONSE,
    'Use at the beginning of Play step. Land battle in or adjacent to China.',
    [{ type: 'LAND_BATTLE', where: ['china'], condition: 'adjacent_or_in' }]),

  twCard('jpn_tw_mitsubishi_j8m', 'Mitsubishi J8M', Country.JAPAN, 'BOLSTER',
    'Use when you are the target of an Economic Warfare card with Bombers in the title and you have an Air Force in Japan. Reduce the number of cards required to be discarded by 4.',
    [{ type: 'DISCARD_CARDS', count: 4, condition: 'reduce_ew_discard_if_af_japan' }],
    { bolsterTrigger: 'TARGET_OF_EW' }),

  twCard('jpn_tw_snlf_paratroopers', 'SNLF Paratroopers', Country.JAPAN, CardType.RESPONSE,
    'Use when you build a Navy. Land battle 1 or 2 times adjacent to the Navy just built.',
    [{ type: 'LAND_BATTLE', count: 2, condition: 'adjacent_to_built_navy' }]),

  twCard('jpn_tw_thailand', 'Thailand', Country.JAPAN, CardType.RESPONSE,
    'Use at the beginning of your Play step. Recruit an Army in Southeast Asia.',
    [{ type: 'RECRUIT_ARMY', where: ['southeast_asia'] }]),
];

// ---------------------------------------------------------------------------
// SOVIET UNION EXPANSION CARDS (24 cards, Subs: 1)
// ---------------------------------------------------------------------------

const SOVIET_AIR_POWER = airPowerCards(Country.SOVIET_UNION, 3, 'ussr_tw');

const SOVIET_EXPANSION: TotalWarCard[] = [
  // --- Air Marshall Bolster ---
  twCard('ussr_tw_partisans', 'Partisans', Country.SOVIET_UNION, 'BOLSTER',
    'Use at the beginning of the Discard step. Discard a Build Army card and 2 other cards to recruit an Army in or adjacent to Moscow.',
    [{ type: 'RECRUIT_ARMY', where: ['moscow'], condition: 'adjacent_or_in' }],
    { bolsterTrigger: 'DISCARD_STEP_BEGIN' }),

  // --- Air Marshall / Total War Bolsters ---
  twCard('ussr_tw_asian_reserves', 'Asian Reserves', Country.SOVIET_UNION, 'BOLSTER',
    'Use at the beginning of your Draw step. Take 2 Build Army cards from your discard pile into your hand.',
    [{ type: 'DISCARD_CARDS', condition: 'reclaim_build_army' }],
    { bolsterTrigger: 'DRAW_STEP_BEGIN' }),

  twCard('ussr_tw_battle_of_moscow', 'Battle of Moscow', Country.SOVIET_UNION, 'BOLSTER',
    'Use immediately after your last Army on the board is removed. Discard a Build Army card from your hand to eliminate an Axis Army in or adjacent to Moscow.',
    [{ type: 'ELIMINATE_ARMY', team: Team.AXIS, where: ['moscow'], condition: 'adjacent_or_in' }],
    { bolsterTrigger: 'LAST_ARMY_REMOVED' }),

  twCard('ussr_tw_fortress_rebuilt', 'Fortress Rebuilt', Country.SOVIET_UNION, 'BOLSTER',
    'Use at the beginning of your Draw step. Discard a Build Army card from your hand to place a Response card from your discard pile face-down on the table.',
    [{ type: 'DISCARD_CARDS', condition: 'response_from_discard' }],
    { bolsterTrigger: 'DRAW_STEP_BEGIN' }),

  twCard('ussr_tw_paratroops', 'Paratroops', Country.SOVIET_UNION, 'BOLSTER',
    'Use when you deploy or marshal an Air Force. Discard a Build Army card from your hand to build an Army adjacent to that Air Force.',
    [{ type: 'BUILD_ARMY', condition: 'adjacent_to_af' }],
    { bolsterTrigger: 'DEPLOY_OR_MARSHAL_AF' }),

  twCard('ussr_tw_zhukov_drives_west', 'Zhukov Drives West', Country.SOVIET_UNION, 'BOLSTER',
    'Use when you land battle Russia, Eastern Europe, Ukraine, or Balkans. Discard a Build Army card from your hand to build an Army in the space just battled.',
    [{ type: 'BUILD_ARMY', where: ['russia', 'eastern_europe', 'ukraine', 'balkans'] }],
    { bolsterTrigger: 'BATTLE_LAND' }),

  // --- Alternate Histories (substitute) ---
  twCard('ussr_tw_vasilevsky_sub', 'Vasilevsky Takes Command in the Far East', Country.SOVIET_UNION, CardType.EVENT,
    'Recruit a Soviet Army in Vladivostok and battle an Army in China.',
    [{ type: 'RECRUIT_ARMY', where: ['vladivostok'] }, { type: 'LAND_BATTLE', where: ['china'] }],
    { isSubstitute: true, substitutesBaseId: 'ussr_vasilevsky' }),

  // --- Alternate Histories / Total War ---
  twCard('ussr_tw_attrition', 'Attrition', Country.SOVIET_UNION, CardType.STATUS,
    'During your discard step, gain +1 Victory Point for each Build Army card you discard from your hand.',
    [{ type: 'VP_PER_CONDITION', amount: 1, condition: 'build_army_discard_vp' }]),

  twCard('ussr_tw_battles_khalkhin_gol', 'Battles of Khalkhin Gol', Country.SOVIET_UNION, CardType.EVENT,
    'Recruit an Army in Mongolia, then battle Vladivostok or China.',
    [{ type: 'RECRUIT_ARMY', where: ['mongolia'] }, { type: 'LAND_BATTLE', where: ['vladivostok', 'china'] }]),

  twCard('ussr_tw_build_army_ahtw', 'Build Army', Country.SOVIET_UNION, CardType.BUILD_ARMY,
    'Place one of your country\'s available Armies in a land space adjacent to one of the same country\'s supplied pieces, or in that country\'s Home space.',
    [{ type: 'BUILD_ARMY' }]),

  twCard('ussr_tw_cavalry_corps', 'Cavalry Corps', Country.SOVIET_UNION, 'BOLSTER',
    'Use at the beginning of your Play step. Discard a Build Army card from your hand and remove a Soviet Army from the board. Then build an Army.',
    [{ type: 'BUILD_ARMY', condition: 'remove_then_build' }],
    { bolsterTrigger: 'PLAY_STEP_BEGIN' }),

  twCard('ussr_tw_endless_expanses', 'Endless Expanses', Country.SOVIET_UNION, CardType.RESPONSE,
    'Use anytime. Do not remove Soviet Armies in Siberia and Kazakhstan this turn.',
    [{ type: 'PROTECT_PIECE', where: ['siberia', 'kazakhstan'], duration: 'turn' }]),

  twCard('ussr_tw_govt_evacuates', 'Government Evacuates to Kuibyshev', Country.SOVIET_UNION, CardType.STATUS,
    'Siberia is now the Soviet Union Home space, and a supply space for the Soviet Union (only). Place a Supply Source marker on Siberia. Moscow is no longer a supply space for any country.',
    [{ type: 'SUPPLY_MARKER', marker: 'siberia_home' }]),

  twCard('ussr_tw_heavy_tanks', 'Heavy Tanks', Country.SOVIET_UNION, CardType.RESPONSE,
    'Use when your Army is battled. The attacker must discard 3 cards from its hand or your Army is not removed.',
    [{ type: 'PROTECT_PIECE', pieceType: 'army', condition: 'attacker_discard_3' }]),

  twCard('ussr_tw_kuril_islands', 'Kuril Islands Landing Operation', Country.SOVIET_UNION, CardType.EVENT,
    'Build a Navy in the Sea of Japan, then battle Japan.',
    [{ type: 'BUILD_NAVY', where: ['sea_of_japan'] }, { type: 'LAND_BATTLE', where: ['japan'] }]),

  twCard('ussr_tw_land_battle_ahtw', 'Land Battle', Country.SOVIET_UNION, CardType.LAND_BATTLE,
    'Select an enemy Army adjacent to one or more of your own supplied Army or Navy pieces and remove it from the board.',
    [{ type: 'LAND_BATTLE' }]),

  twCard('ussr_tw_operation_zet', 'Operation Zet', Country.SOVIET_UNION, 'BOLSTER',
    'Use at the beginning of your Air Step. Deploy a Chinese Air Force.',
    [{ type: 'BUILD_ARMY', condition: 'deploy_chinese_af' }],
    { bolsterTrigger: 'AIR_STEP_BEGIN', minorPower: 'CHINA' }),

  twCard('ussr_tw_peoples_liberation', "People's Liberation Army", Country.SOVIET_UNION, CardType.STATUS,
    'Chinese Armies are never out supply. During your turn, instead of playing a card you may discard a Build Army card from your hand to recruit a Chinese Army in Szechuan, China, or Mongolia.',
    [{ type: 'SUPPLY_MARKER', condition: 'chinese_always_supply' }],
    { minorPower: 'CHINA' }),

  twCard('ussr_tw_quantity_quality', 'Quantity Has a Quality All its Own', Country.SOVIET_UNION, CardType.STATUS,
    'Use once per turn when you build an Army. Discard a Build Army card from your hand to build an additional Army.',
    [{ type: 'BUILD_ARMY', condition: 'after_build_anywhere' }]),

  twCard('ussr_tw_retreat_regroup', 'Retreat and Regroup', Country.SOVIET_UNION, CardType.RESPONSE,
    'Use when your Army in Moscow or Ukraine is removed. Recruit an Army in Siberia and Kazakhstan.',
    [{ type: 'RECRUIT_ARMY', where: ['siberia', 'kazakhstan'] }]),

  twCard('ussr_tw_siberian_transfer', 'Siberian Transfer', Country.SOVIET_UNION, CardType.EVENT,
    'Recruit an Army in or adjacent to Siberia.',
    [{ type: 'RECRUIT_ARMY', where: ['siberia'], condition: 'adjacent_or_in' }]),

  twCard('ussr_tw_tank_desant', 'Tank Desant', Country.SOVIET_UNION, CardType.STATUS,
    'Use when you build an Army. Discard a Build Army and a Land Battle card from your hand and battle a Land space adjacent to the Army just built.',
    [{ type: 'LAND_BATTLE', condition: 'adjacent_to_built_army' }]),

  twCard('ussr_tw_vitebsk_gate', 'Vitebsk Gate', Country.SOVIET_UNION, 'BOLSTER',
    'Use at the beginning of your Victory step. Discard a Build Army card and 2 other cards from your hand to eliminate an Axis Army in Moscow or Russia.',
    [{ type: 'ELIMINATE_ARMY', team: Team.AXIS, where: ['moscow', 'russia'] }],
    { bolsterTrigger: 'VICTORY_STEP_BEGIN' }),
];

// ---------------------------------------------------------------------------
// UNITED KINGDOM EXPANSION CARDS (29 cards, Subs: 4)
// ---------------------------------------------------------------------------

const UK_AIR_POWER = airPowerCards(Country.UK, 4, 'uk_tw');

const UK_EXPANSION: TotalWarCard[] = [
  // --- Air Marshall Bolsters ---
  twCard('uk_tw_commonwealth_irregulars', 'Commonwealth Irregulars', Country.UK, 'BOLSTER',
    'Use at the beginning of your Victory step. Discard 2 cards from your hand to recruit an Army in North Africa, Middle East, Southeast Asia, or Indonesia.',
    [{ type: 'RECRUIT_ARMY', where: ['north_africa', 'middle_east', 'southeast_asia', 'indonesia'] }],
    { bolsterTrigger: 'VICTORY_STEP_BEGIN' }),

  twCard('uk_tw_operation_banquet', 'Operation Banquet', Country.UK, 'BOLSTER',
    'Use at the beginning of any player\'s Play step. Discard 3 cards from your hand to deploy an Air Force to the United Kingdom or North Sea. (You do not need a Deploy Air Force card.)',
    [{ type: 'BUILD_ARMY', condition: 'deploy_af_uk_or_north_sea' }],
    { bolsterTrigger: 'ANY_PLAYER_PLAY_STEP' }),

  // --- Air Marshall / Total War Bolsters ---
  twCard('uk_tw_bletchley_park', 'Bletchley Park', Country.UK, 'BOLSTER',
    'Use when Germany or Italy uses a Bolster card. Discard 2 cards from your hand to negate the effect of the Bolster card (but not any cost associated with using the card).',
    [{ type: 'DISCARD_CARDS', condition: 'negate_axis_bolster' }],
    { bolsterTrigger: 'AXIS_USES_BOLSTER' }),

  twCard('uk_tw_keep_calm', 'Keep Calm and Carry On', Country.UK, 'BOLSTER',
    'Use when the Axis uses a Status card. Discard 2 cards from your hand to negate the effect of the Status card (but not any cost associated with using the card) until the end of the turn.',
    [{ type: 'DISCARD_CARDS', condition: 'negate_axis_status' }],
    { bolsterTrigger: 'AXIS_USES_STATUS' }),

  twCard('uk_tw_warsaw_uprising', 'Warsaw Uprising', Country.UK, 'BOLSTER',
    'Use at the beginning of your Victory step. Discard 2 cards from your hand to recruit an Army in Eastern Europe.',
    [{ type: 'RECRUIT_ARMY', where: ['eastern_europe'] }],
    { bolsterTrigger: 'VICTORY_STEP_BEGIN' }),

  // --- Alternate Histories (substitute) ---
  twCard('uk_tw_resistance_sub', 'Resistance', Country.UK, CardType.EVENT,
    'Eliminate an Army in Western Europe.',
    [{ type: 'ELIMINATE_ARMY', where: ['western_europe'] }],
    { isSubstitute: true, substitutesBaseId: 'uk_resistance' }),

  // --- Alternate Histories / Total War ---
  twCard('uk_tw_armee_de_lair', "Armee de l'Air", Country.UK, 'BOLSTER',
    'Use at the beginning of your Air step. Deploy a French Air Force.',
    [{ type: 'BUILD_ARMY', condition: 'deploy_french_af' }],
    { bolsterTrigger: 'AIR_STEP_BEGIN', minorPower: 'FRANCE' }),

  twCard('uk_tw_armee_de_terre', 'Armee de Terre', Country.UK, CardType.EVENT,
    'Build a French Army.',
    [{ type: 'BUILD_ARMY', condition: 'build_french_army' }],
    { minorPower: 'FRANCE' }),

  twCard('uk_tw_build_navy_ahtw', 'Build Navy', Country.UK, CardType.BUILD_NAVY,
    'Place one of your country\'s available Navies in a sea space adjacent to one of the same country\'s supplied pieces.',
    [{ type: 'BUILD_NAVY' }]),

  twCard('uk_tw_dutch_east_indies_sub', 'Dutch East Indies', Country.UK, CardType.EVENT,
    'Recruit a French Army in Indonesia and New Guinea, and a French Navy in the South China Sea.',
    [{ type: 'RECRUIT_ARMY', where: ['indonesia', 'new_guinea'] }, { type: 'RECRUIT_NAVY', where: ['south_china_sea'] }],
    { isSubstitute: true, substitutesBaseId: 'uk_dutch_east_indies', minorPower: 'FRANCE' }),

  twCard('uk_tw_foreign_legion', 'Foreign Legion', Country.UK, CardType.EVENT,
    'Recruit a French Army in Africa, North Africa, Madagascar, Southeast Asia, New Guinea, or the Middle East.',
    [{ type: 'RECRUIT_ARMY', where: ['africa', 'north_africa', 'madagascar', 'southeast_asia', 'new_guinea', 'middle_east'] }],
    { minorPower: 'FRANCE' }),

  twCard('uk_tw_france_combattante', 'France Combattante', Country.UK, CardType.EVENT,
    'Build a French Army.',
    [{ type: 'BUILD_ARMY', condition: 'build_french_army' }],
    { minorPower: 'FRANCE' }),

  twCard('uk_tw_free_forces_low_countries', 'Free Forces of the Low Countries', Country.UK, CardType.EVENT,
    'The French may build an Army in Western Europe, or battle Western Europe.',
    [{ type: 'BUILD_ARMY', where: ['western_europe'] }],
    { minorPower: 'FRANCE' }),

  twCard('uk_tw_free_france_sub', 'Free France', Country.UK, CardType.STATUS,
    'French Pieces are never out of supply. (Other rules about building new pieces still apply.)',
    [{ type: 'SUPPLY_MARKER', condition: 'french_always_supply' }],
    { isSubstitute: true, substitutesBaseId: 'uk_free_france', minorPower: 'FRANCE' }),

  twCard('uk_tw_free_french_allies_sub', 'Free French Allies', Country.UK, CardType.EVENT,
    'Recruit 1 or 2 French Armies in Western Europe, Africa, and/or North Africa.',
    [{ type: 'RECRUIT_ARMY', where: ['western_europe', 'africa', 'north_africa'], count: 2 }],
    { isSubstitute: true, substitutesBaseId: 'usa_free_french_allies', minorPower: 'FRANCE' }),

  twCard('uk_tw_french_patriots', 'French Patriots Join Allies', Country.UK, CardType.RESPONSE,
    'Use immediately after the United States, France, or the United Kingdom land battle in North Africa, Africa, Middle East, or Western Europe. Recruit a French Army in the space battled.',
    [{ type: 'RECRUIT_ARMY', condition: 'after_allied_battle' }],
    { minorPower: 'FRANCE' }),

  twCard('uk_tw_government_in_exile', 'Government in Exile', Country.UK, CardType.STATUS,
    'If Western Europe is occupied by an Axis Army, the United Kingdom is France\'s Home Space.',
    [{ type: 'SUPPLY_MARKER', condition: 'france_home_moves_to_uk' }],
    { minorPower: 'FRANCE' }),

  twCard('uk_tw_hobarts_funnies', "Hobart's Funnies", Country.UK, CardType.STATUS,
    'Axis Status cards are ignored during the United Kingdom turn.',
    [{ type: 'DISCARD_CARDS', condition: 'ignore_axis_status' }]),

  twCard('uk_tw_la_royale', 'La Royale', Country.UK, CardType.EVENT,
    'Build a French Navy.',
    [{ type: 'BUILD_NAVY', condition: 'build_french_navy' }],
    { minorPower: 'FRANCE' }),

  twCard('uk_tw_les_forces_navales', 'Les Forces Navales Francaises Libres', Country.UK, CardType.EVENT,
    'Build a French Navy.',
    [{ type: 'BUILD_NAVY', condition: 'build_french_navy' }],
    { minorPower: 'FRANCE' }),

  twCard('uk_tw_maginot_line', 'Maginot Line', Country.UK, 'BOLSTER',
    'Use anytime. Discard 4 cards from your hand and do not remove a French Army in Western Europe this turn.',
    [{ type: 'PROTECT_PIECE', where: ['western_europe'], duration: 'turn' }],
    { bolsterTrigger: 'ARMY_BATTLED', minorPower: 'FRANCE' }),

  twCard('uk_tw_polish_sovereignty', 'Polish Sovereignty', Country.UK, CardType.STATUS,
    'Eastern Europe is a supply space for the United Kingdom (only). You may build Armies in Eastern Europe without being adjacent to another United Kingdom piece. Place a Supply Source marker on Eastern Europe.',
    [{ type: 'SUPPLY_MARKER', condition: 'eastern_europe_supply' }]),

  twCard('uk_tw_polskie_panstwo', 'Polskie Panstwo Podziemne', Country.UK, CardType.EVENT,
    'Eliminate an Axis Army in Eastern Europe.',
    [{ type: 'ELIMINATE_ARMY', team: Team.AXIS, where: ['eastern_europe'] }]),

  twCard('uk_tw_rhin_et_danube', 'Rhin et Danube', Country.UK, CardType.EVENT,
    'The French may battle a Land space.',
    [{ type: 'LAND_BATTLE', condition: 'french_battle' }],
    { minorPower: 'FRANCE' }),

  twCard('uk_tw_senegalese_tirailleurs', 'Senegalese Tirailleurs', Country.UK, CardType.STATUS,
    'Africa is a supply space for France (only). French Armies built in Africa do not need to be adjacent to another French piece. Place a Supply Source marker on Africa.',
    [{ type: 'SUPPLY_MARKER', condition: 'africa_supply_france' }],
    { minorPower: 'FRANCE' }),

  twCard('uk_tw_special_air_service', 'Special Air Service Raids Airfields', Country.UK, 'BOLSTER',
    'Use at the beginning of your Play step. Discard 2 cards from your hand to eliminate an Axis Air Force adjacent to your Air Force.',
    [{ type: 'ELIMINATE_NAVY', condition: 'eliminate_adjacent_axis_af' }],
    { bolsterTrigger: 'PLAY_STEP_BEGIN' }),
];

// ---------------------------------------------------------------------------
// UNITED STATES EXPANSION CARDS (33 cards, Subs: 3)
// ---------------------------------------------------------------------------

const USA_AIR_POWER = airPowerCards(Country.USA, 4, 'usa_tw');

const USA_EXPANSION: TotalWarCard[] = [
  // --- Air Marshall / Total War Bolsters ---
  twCard('usa_tw_a_great_sleeping_giant', 'A Great, Sleeping Giant', Country.USA, 'BOLSTER',
    'Use when you build a Navy in a space with Pacific in the title. Discard the top card of your draw deck to build an Army or Navy in an adjacent space.',
    [{ type: 'BUILD_ARMY', condition: 'after_pacific_navy_build' }],
    { bolsterTrigger: 'BUILD_NAVY' }),

  twCard('usa_tw_navajo_code_talkers', 'Navajo Code Talkers', Country.USA, 'BOLSTER',
    'Use at the beginning of your play step. Take a Bolster card from your hand and place it face down on the table. You may use it as if it were a Response card.',
    [{ type: 'DISCARD_CARDS', condition: 'bolster_as_response' }],
    { bolsterTrigger: 'PLAY_STEP_BEGIN' }),

  twCard('usa_tw_our_philosophy', 'Our Philosophy of Government', Country.USA, 'BOLSTER',
    'Use at the beginning of your Draw step. Discard the top 2 cards of your draw deck to allow the United Kingdom to place a Response card from its discard pile face-down on the table.',
    [{ type: 'DISCARD_CARDS', condition: 'uk_response_from_discard' }],
    { bolsterTrigger: 'DRAW_STEP_BEGIN' }),

  twCard('usa_tw_p51_mustang', 'P-51 Mustang', Country.USA, 'BOLSTER',
    'Use when you play an Economic Warfare card. The country attacked must discard an additional card for each Air Force you have within 2 spaces of the opponent\'s home space.',
    [{ type: 'DISCARD_CARDS', condition: 'af_boost_ew' }],
    { bolsterTrigger: 'PLAY_EW' }),

  twCard('usa_tw_pacific_bases', 'Pacific Bases', Country.USA, 'BOLSTER',
    'Use at the beginning of your Victory step. Discard the top card of your draw deck to recruit an Army in a space adjacent to the Central Pacific.',
    [{ type: 'RECRUIT_ARMY', condition: 'adjacent_to_central_pacific' }],
    { bolsterTrigger: 'VICTORY_STEP_BEGIN' }),

  twCard('usa_tw_rangers', 'Rangers', Country.USA, 'BOLSTER',
    'Use when you deploy or marshal an Air Force. Discard the top card of your draw deck to eliminate an Army adjacent to that Air Force.',
    [{ type: 'ELIMINATE_ARMY', condition: 'adjacent_to_af' }],
    { bolsterTrigger: 'DEPLOY_OR_MARSHAL_AF' }),

  // --- Alternate Histories (substitute) ---
  twCard('usa_tw_flexible_resources_sub', 'Flexible Resources', Country.USA, CardType.EVENT,
    'Play the card of your choice from your discard pile.',
    [{ type: 'DISCARD_CARDS', count: -1, condition: 'retrieve_from_discard' }],
    { isSubstitute: true, substitutesBaseId: 'usa_flexible_resources' }),

  // --- Alternate Histories / Total War ---
  twCard('usa_tw_american_public_sympathizes', 'American Public Sympathizes with Chinese People', Country.USA, CardType.EVENT,
    'Build a Chinese Army.',
    [{ type: 'BUILD_ARMY', condition: 'build_chinese_army' }],
    { minorPower: 'CHINA' }),

  twCard('usa_tw_american_volunteer_sub', 'American Volunteer Group Expands', Country.USA, CardType.STATUS,
    'Szechuan is a supply space for China (only), and is now China\'s home space. On your Play step, instead of playing a card, you can discard a Build Army card from your hand to build a Chinese Army. Place a Supply Source marker on Szechuan.',
    [{ type: 'SUPPLY_MARKER', marker: 'szechuan_china' }],
    { isSubstitute: true, substitutesBaseId: 'usa_american_volunteer', minorPower: 'CHINA' }),

  twCard('usa_tw_anti_japanese_volunteer', 'Anti-Japanese Volunteer Armies', Country.USA, CardType.STATUS,
    'Each time a Chinese Army is battled, built, or recruited, the Japanese player must discard a card from its hand.',
    [{ type: 'DISCARD_CARDS', condition: 'japan_discard_on_chinese_action' }],
    { minorPower: 'CHINA' }),

  twCard('usa_tw_artificial_harbors', 'Artificial Harbors', Country.USA, CardType.STATUS,
    'Use once per turn when you build a Navy. Discard the top card of your draw deck to build an Army adjacent to the Navy just built.',
    [{ type: 'BUILD_ARMY', condition: 'after_navy_build_adjacent' }]),

  twCard('usa_tw_carpet_bombing', 'Carpet Bombing', Country.USA, 'BOLSTER',
    'Use when you battle. Discard an Economic Warfare card from your hand and battle the same space again.',
    [{ type: 'LAND_BATTLE', condition: 'battle_same_space' }],
    { bolsterTrigger: 'BATTLE_LAND' }),

  twCard('usa_tw_cash_and_carry', 'Cash and Carry Replaces Neutrality Acts', Country.USA, CardType.EVENT,
    'Recruit any one available Allied Army or Navy in or adjacent to the corresponding country\'s Home space.',
    [{ type: 'RECRUIT_ARMY', condition: 'any_allied_recruit' }]),

  twCard('usa_tw_doolittles_bombers', "Doolittle's Bombers", Country.USA, CardType.ECONOMIC_WARFARE,
    'Use if you have a supplied Navy within 3 spaces of Japan. Japan must discard the top card of its draw deck. Gain +2 Victory Points.',
    [{ type: 'DISCARD_CARDS', count: 1, country: Country.JAPAN }, { type: 'SCORE_VP', amount: 2 }]),

  twCard('usa_tw_flying_tigers', 'Flying Tigers', Country.USA, 'BOLSTER',
    'Use at the beginning of your Air Step. Deploy a Chinese Air Force.',
    [{ type: 'BUILD_ARMY', condition: 'deploy_chinese_af' }],
    { bolsterTrigger: 'AIR_STEP_BEGIN', minorPower: 'CHINA' }),

  twCard('usa_tw_ledo_burma_roads_sub', 'Ledo and Burma Roads', Country.USA, CardType.EVENT,
    'To use, the Allies must have an Army in Southeast Asia. Recruit a Chinese Army in China or Szechuan, or eliminate an Axis Army in China or Szechuan.',
    [{ type: 'RECRUIT_ARMY', where: ['china', 'szechuan'] }],
    { isSubstitute: true, substitutesBaseId: 'uk_ledo_burma_roads', minorPower: 'CHINA' }),

  twCard('usa_tw_oil_embargo', 'Oil Embargo', Country.USA, CardType.ECONOMIC_WARFARE,
    'Germany, Italy, and Japan must each choose to remove a piece from the board or discard the top 2 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 2, condition: 'oil_embargo' }]),

  twCard('usa_tw_pappy_boyington', 'Pappy Boyington', Country.USA, 'BOLSTER',
    'Use at the beginning of your Victory Step. Discard the top card of your draw deck to deploy or marshal an Air Force to a land space adjacent to the Central Pacific.',
    [{ type: 'BUILD_ARMY', condition: 'af_adj_central_pacific' }],
    { bolsterTrigger: 'VICTORY_STEP_BEGIN' }),

  twCard('usa_tw_shaef', 'SHAEF', Country.USA, CardType.STATUS,
    'During their respective Supply steps, France, the United States, and the United Kingdom may trace supply through each other\'s pieces.',
    [{ type: 'SUPPLY_MARKER', condition: 'shared_supply' }]),

  twCard('usa_tw_shoot_first', 'Shoot First and Argue Afterwards', Country.USA, CardType.EVENT,
    'Build a Navy in a space with the word Pacific in the title, then battle a Sea space adjacent to the Navy just built.',
    [{ type: 'BUILD_NAVY', condition: 'pacific_space' }, { type: 'SEA_BATTLE', condition: 'adjacent_to_built_navy' }]),

  twCard('usa_tw_brazilian_expeditionary', 'The Brazilian Expeditionary Force', Country.USA, CardType.EVENT,
    'Build an Army in Latin America and a Navy in the South Atlantic or the Southern Ocean.',
    [{ type: 'BUILD_ARMY', where: ['latin_america'] }, { type: 'BUILD_NAVY', where: ['south_atlantic', 'southern_ocean'] }]),

  twCard('usa_tw_hundred_regiments', 'The Hundred Regiments Offensive', Country.USA, CardType.EVENT,
    'The Chinese may battle a Land Space.',
    [{ type: 'LAND_BATTLE', condition: 'chinese_battle' }],
    { minorPower: 'CHINA' }),

  twCard('usa_tw_us_submarines_patrol', 'United States Submarines Patrol Japanese Shipping Lanes', Country.USA, CardType.ECONOMIC_WARFARE,
    'If you have a Navy within 2 spaces of Japan, Japan must discard the top 4 cards of its draw deck.',
    [{ type: 'DISCARD_CARDS', count: 4, country: Country.JAPAN }]),

  twCard('usa_tw_usmc', 'USMC', Country.USA, CardType.STATUS,
    'Use when you build a Navy in or adjacent to a Sea space with the word Pacific in the title. Discard the top card of your draw deck and battle a Land space adjacent to the Navy just built.',
    [{ type: 'LAND_BATTLE', condition: 'adjacent_to_pacific_navy' }]),

  twCard('usa_tw_victory_gardens', 'Victory Gardens', Country.USA, CardType.STATUS,
    'The United States only has to discard 1 card from its hand to use Reallocate Resources.',
    [{ type: 'DISCARD_CARDS', condition: 'cheaper_reallocate' }]),

  twCard('usa_tw_war_bonds', 'War Bonds', Country.USA, CardType.STATUS,
    'When you Reallocate Resources, you may take a card from your discard pile instead of your Draw deck.',
    [{ type: 'DISCARD_CARDS', condition: 'reallocate_from_discard' }]),
];

// ---------------------------------------------------------------------------
// Collected expansion card arrays by country
// ---------------------------------------------------------------------------

export const GERMANY_TW_CARDS: TotalWarCard[] = [...GERMANY_AIR_POWER, ...GERMANY_EXPANSION];
export const ITALY_TW_CARDS: TotalWarCard[] = [...ITALY_AIR_POWER, ...ITALY_EXPANSION];
export const JAPAN_TW_CARDS: TotalWarCard[] = [...JAPAN_AIR_POWER, ...JAPAN_EXPANSION];
export const SOVIET_TW_CARDS: TotalWarCard[] = [...SOVIET_AIR_POWER, ...SOVIET_EXPANSION];
export const UK_TW_CARDS: TotalWarCard[] = [...UK_AIR_POWER, ...UK_EXPANSION];
export const USA_TW_CARDS: TotalWarCard[] = [...USA_AIR_POWER, ...USA_EXPANSION];

export const ALL_TW_CARDS: TotalWarCard[] = [
  ...GERMANY_TW_CARDS,
  ...ITALY_TW_CARDS,
  ...JAPAN_TW_CARDS,
  ...SOVIET_TW_CARDS,
  ...UK_TW_CARDS,
  ...USA_TW_CARDS,
];

// ---------------------------------------------------------------------------
// Get expansion deck for a country (to be merged with base deck)
// ---------------------------------------------------------------------------

export function getExpansionDeck(country: Country): TotalWarCard[] {
  const decks: Record<Country, TotalWarCard[]> = {
    [Country.GERMANY]: GERMANY_TW_CARDS,
    [Country.UK]: UK_TW_CARDS,
    [Country.JAPAN]: JAPAN_TW_CARDS,
    [Country.SOVIET_UNION]: SOVIET_TW_CARDS,
    [Country.ITALY]: ITALY_TW_CARDS,
    [Country.USA]: USA_TW_CARDS,
  };
  return [...decks[country]];
}

/** IDs of base cards that expansion substitute cards replace */
export function getSubstituteBaseIds(): string[] {
  return ALL_TW_CARDS
    .filter((c) => c.isSubstitute && c.substitutesBaseId)
    .map((c) => c.substitutesBaseId!);
}

/** Get the substitute expansion card that replaces a given base card ID */
export function getSubstituteCard(baseId: string): TotalWarCard | undefined {
  return ALL_TW_CARDS.find((c) => c.substitutesBaseId === baseId);
}
