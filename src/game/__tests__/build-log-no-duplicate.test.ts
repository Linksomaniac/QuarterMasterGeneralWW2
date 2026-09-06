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

// Regression test for a bug where a "Build Army"/"Build Navy" card play logged
// the build twice: once from resolveBuildAction's own log entry (properly
// cased, e.g. "Built army in Balkans") and once more from the SELECT_BUILD_LOCATION
// click handler in store.ts, which additionally used a raw `spaceId.replace(/_/g, ' ')`
// instead of the space's display name, producing a second, lowercase line
// (e.g. "Built army in balkans"). Only one Army should ever be placed on the
// board, and only one log line should describe it.
describe('Building a piece logs exactly one entry with the proper space name', () => {
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

  it('places exactly one Army and logs exactly one "Built army in Balkans" line', () => {
    const buildArmy = findCard(Country.GERMANY, 'ger_build_army_1');
    const cleared = clearedCountries();

    useGameStore.setState({
      phase: GamePhase.PLAY_STEP,
      round: 5,
      currentCountryIndex: 0, // Germany
      pendingAction: null,
      selectedCard: null,
      actionContext: undefined,
      countries: {
        ...cleared,
        [Country.GERMANY]: {
          ...cleared[Country.GERMANY],
          hand: [buildArmy],
          piecesOnBoard: [
            { id: 'test_ger_home_army', country: Country.GERMANY, type: 'army', spaceId: 'germany' },
          ],
        },
      },
    });

    useGameStore.getState().selectCard(buildArmy);
    useGameStore.getState().playSelectedCard();
    vi.runAllTimers();

    // Human must pick the build space themselves.
    useGameStore.getState().handleSpaceClick('balkans');
    vi.runAllTimers();

    const s = useGameStore.getState();
    const germanArmiesInBalkans = s.countries[Country.GERMANY].piecesOnBoard.filter(
      (p) => p.spaceId === 'balkans' && p.type === 'army'
    );
    expect(germanArmiesInBalkans).toHaveLength(1);

    const buildLogLines = s.log.filter((entry) => /built army in/i.test(entry.message));
    expect(buildLogLines).toHaveLength(1);
    expect(buildLogLines[0].message).toBe('Built army in Balkans');
  });
});
