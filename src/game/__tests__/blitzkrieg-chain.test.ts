import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '../store';
import { Country, GamePhase } from '../types';
import { getCountryDeck } from '../cards';

function findCard(country: Country, id: string) {
  const card = getCountryDeck(country).find((c) => c.id === id);
  if (!card) throw new Error(`card not found: ${id}`);
  return card;
}

describe('Blitzkrieg build-after-battle chain', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().initGame([
      { country: Country.GERMANY, isHuman: true, aiDifficulty: 'easy' },
      { country: Country.UK, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.JAPAN, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.SOVIET_UNION, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.ITALY, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.USA, isHuman: false, aiDifficulty: 'easy' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lets Germany keep playing after Land Battle triggers a Blitzkrieg build (regression for turn hang)', () => {
    const blitzkrieg = findCard(Country.GERMANY, 'ger_blitzkrieg');
    const landBattleCard = findCard(Country.GERMANY, 'ger_land_battle_1');

    const state = useGameStore.getState();

    // Fully deterministic board: every other country has an empty hand and
    // no status/response cards on the table, so no unrelated reactive card
    // (randomly dealt by initGame) can interfere with the chain being tested.
    const clearedCountries = Object.fromEntries(
      Object.values(Country).map((c) => [
        c,
        { ...state.countries[c], hand: [], statusCards: [], responseCards: [], piecesOnBoard: [] },
      ])
    ) as unknown as typeof state.countries;

    // Round 3, Germany's Play Step: one German army at home (adjacent to
    // Eastern Europe), Blitzkrieg already on the table, and a lone Soviet
    // army sitting in Eastern Europe to be eliminated.
    useGameStore.setState({
      phase: GamePhase.PLAY_STEP,
      round: 3,
      currentCountryIndex: 0, // Germany
      pendingAction: null,
      selectedCard: null,
      actionContext: undefined,
      countries: {
        ...clearedCountries,
        [Country.GERMANY]: {
          ...clearedCountries[Country.GERMANY],
          hand: [landBattleCard],
          statusCards: [blitzkrieg],
          piecesOnBoard: [
            { id: 'test_ger_army', country: Country.GERMANY, type: 'army', spaceId: 'germany' },
          ],
        },
        [Country.SOVIET_UNION]: {
          ...clearedCountries[Country.SOVIET_UNION],
          piecesOnBoard: [
            { id: 'test_ussr_army', country: Country.SOVIET_UNION, type: 'army', spaceId: 'eastern_europe' },
          ],
        },
      },
    });

    // Play the Land Battle card.
    useGameStore.getState().selectCard(landBattleCard);
    useGameStore.getState().playSelectedCard();

    let s = useGameStore.getState();
    expect(s.pendingAction?.type).toBe('SELECT_BATTLE_TARGET');

    // Choose Eastern Europe — eliminates the Soviet army and offers Blitzkrieg.
    useGameStore.getState().handleSpaceClick('eastern_europe');

    s = useGameStore.getState();
    expect(s.pendingAction?.type).toBe('OFFENSIVE_RESPONSE_OPPORTUNITY');
    expect(s.phase).toBe(GamePhase.AWAITING_RESPONSE);

    // Accept Blitzkrieg's build-after-battle offer.
    useGameStore.getState().respondToOpportunity(true);

    // Flush any AI setTimeout follow-ups (enemy build/battle reactions, etc.)
    vi.runAllTimers();

    s = useGameStore.getState();

    // Blitzkrieg's build must actually have happened.
    const builtArmy = s.countries[Country.GERMANY].piecesOnBoard.find(
      (p) => p.spaceId === 'eastern_europe' && p.type === 'army'
    );
    expect(builtArmy).toBeTruthy();

    // The turn must not be stuck: Germany must be back in an interactive
    // Play Step (no pendingAction) so the Pass Turn / play-a-card controls
    // render, or the game has legitimately moved past Germany's Play Step.
    // A hang looks like: phase === PLAY_STEP (or AWAITING_RESPONSE) forever
    // with a pendingAction that nothing will ever resolve, and the current
    // country still Germany.
    const isGermanysTurnStillActive =
      useGameStore.getState().countries[Country.GERMANY] &&
      s.round === 3;
    if (isGermanysTurnStillActive && (s.phase === GamePhase.PLAY_STEP || s.phase === GamePhase.AWAITING_RESPONSE)) {
      expect(s.pendingAction).toBeNull();
    }
  });
});
