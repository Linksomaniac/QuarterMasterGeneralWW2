import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '../store';
import { Country, GamePhase } from '../types';
import { getCountryDeck } from '../cards';

function findCard(country: Country, id: string) {
  const card = getCountryDeck(country).find((c) => c.id === id);
  if (!card) throw new Error(`card not found: ${id}`);
  return card;
}

describe('Blitzkrieg only triggers once per turn', () => {
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

  it('does not re-offer Blitzkrieg on a second, independent land battle in the same turn', () => {
    const blitzkrieg = findCard(Country.GERMANY, 'ger_blitzkrieg');
    const landBattleCard1 = findCard(Country.GERMANY, 'ger_land_battle_1');
    const landBattleCard2 = findCard(Country.GERMANY, 'ger_land_battle_2');

    const state = useGameStore.getState();

    const clearedCountries = Object.fromEntries(
      Object.values(Country).map((c) => [
        c,
        { ...state.countries[c], hand: [], statusCards: [], responseCards: [], piecesOnBoard: [] },
      ])
    ) as unknown as typeof state.countries;

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
          hand: [landBattleCard1, landBattleCard2],
          statusCards: [blitzkrieg],
          piecesOnBoard: [
            { id: 'test_ger_army', country: Country.GERMANY, type: 'army', spaceId: 'germany' },
          ],
        },
        [Country.SOVIET_UNION]: {
          ...clearedCountries[Country.SOVIET_UNION],
          piecesOnBoard: [
            { id: 'test_ussr_army', country: Country.SOVIET_UNION, type: 'army', spaceId: 'eastern_europe' },
            { id: 'test_ussr_army2', country: Country.SOVIET_UNION, type: 'army', spaceId: 'poland' },
          ],
        },
      },
    });

    // --- First land battle: Blitzkrieg should be offered and accepted. ---
    useGameStore.getState().selectCard(landBattleCard1);
    useGameStore.getState().playSelectedCard();

    let s = useGameStore.getState();
    expect(s.pendingAction?.type).toBe('SELECT_BATTLE_TARGET');

    useGameStore.getState().handleSpaceClick('eastern_europe');

    s = useGameStore.getState();
    expect(s.pendingAction?.type).toBe('OFFENSIVE_RESPONSE_OPPORTUNITY');

    useGameStore.getState().respondToOpportunity(true);
    vi.runAllTimers();

    s = useGameStore.getState();
    const builtArmy = s.countries[Country.GERMANY].piecesOnBoard.find(
      (p) => p.spaceId === 'eastern_europe' && p.type === 'army'
    );
    expect(builtArmy).toBeTruthy();
    expect(s.countries[Country.GERMANY].usedOffensiveCardsThisTurn).toContain(blitzkrieg.id);

    // Return to a clean, interactive Play Step for the second battle so this
    // test only exercises the "used this turn" guard, not unrelated chain
    // continuation state left over from the first battle.
    useGameStore.setState({
      phase: GamePhase.PLAY_STEP,
      pendingAction: null,
      selectedCard: null,
      actionContext: undefined,
    });

    // --- Second, independent land battle in the same turn: Blitzkrieg must
    // NOT be offered again. ---
    useGameStore.getState().selectCard(landBattleCard2);
    useGameStore.getState().playSelectedCard();

    s = useGameStore.getState();
    expect(s.pendingAction?.type).toBe('SELECT_BATTLE_TARGET');

    useGameStore.getState().handleSpaceClick('poland');
    vi.runAllTimers();

    s = useGameStore.getState();
    expect(s.pendingAction?.type).not.toBe('OFFENSIVE_RESPONSE_OPPORTUNITY');

    const secondBuiltArmy = s.countries[Country.GERMANY].piecesOnBoard.find(
      (p) => p.spaceId === 'poland' && p.type === 'army'
    );
    expect(secondBuiltArmy).toBeFalsy();
  });
});
