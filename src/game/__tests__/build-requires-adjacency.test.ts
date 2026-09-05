import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '../store';
import { Country, GamePhase } from '../types';
import { getCountryDeck } from '../cards';

function findCard(country: Country, id: string) {
  const card = getCountryDeck(country).find((c) => c.id === id);
  if (!card) throw new Error(`card not found: ${id}`);
  return card;
}

function clearedCountries() {
  const state = useGameStore.getState();
  return Object.fromEntries(
    Object.values(Country).map((c) => [
      c,
      { ...state.countries[c], hand: [], statusCards: [], responseCards: [], piecesOnBoard: [] },
    ])
  ) as unknown as typeof state.countries;
}

describe('"Build" event effects require adjacency to an own piece (or Home space)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().initGame([
      { country: Country.GERMANY, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.UK, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.JAPAN, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.SOVIET_UNION, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.ITALY, isHuman: true, aiDifficulty: 'easy' },
      { country: Country.USA, isHuman: false, aiDifficulty: 'easy' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not build in Ukraine/Russia when Italy has no piece adjacent to either', () => {
    const attacksCommunists = findCard(Country.ITALY, 'ita_italy_attacks_communists');
    const cleared = clearedCountries();

    useGameStore.setState({
      phase: GamePhase.PLAY_STEP,
      round: 3,
      currentCountryIndex: 4, // Italy
      pendingAction: null,
      selectedCard: null,
      actionContext: undefined,
      countries: {
        ...cleared,
        [Country.ITALY]: { ...cleared[Country.ITALY], hand: [attacksCommunists] },
      },
    });

    useGameStore.getState().selectCard(attacksCommunists);
    useGameStore.getState().playSelectedCard();
    vi.runAllTimers();

    const s = useGameStore.getState();
    const italyPieces = s.countries[Country.ITALY].piecesOnBoard;
    expect(italyPieces.some((p) => p.spaceId === 'ukraine')).toBe(false);
    expect(italyPieces.some((p) => p.spaceId === 'russia')).toBe(false);
  });

  it('builds in Ukraine and Russia when Italy has a piece adjacent to both (e.g. Eastern Europe)', () => {
    const attacksCommunists = findCard(Country.ITALY, 'ita_italy_attacks_communists');
    const cleared = clearedCountries();

    useGameStore.setState({
      phase: GamePhase.PLAY_STEP,
      round: 3,
      currentCountryIndex: 4, // Italy
      pendingAction: null,
      selectedCard: null,
      actionContext: undefined,
      countries: {
        ...cleared,
        [Country.ITALY]: {
          ...cleared[Country.ITALY],
          hand: [attacksCommunists],
          piecesOnBoard: [
            { id: 'test_ita_army', country: Country.ITALY, type: 'army', spaceId: 'eastern_europe' },
          ],
        },
      },
    });

    useGameStore.getState().selectCard(attacksCommunists);
    useGameStore.getState().playSelectedCard();
    vi.runAllTimers();

    const s = useGameStore.getState();
    const italyPieces = s.countries[Country.ITALY].piecesOnBoard;
    expect(italyPieces.some((p) => p.spaceId === 'ukraine')).toBe(true);
    expect(italyPieces.some((p) => p.spaceId === 'russia')).toBe(true);
  });
});
