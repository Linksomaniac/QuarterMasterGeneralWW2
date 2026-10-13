import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '../store';
import { Country, GamePhase } from '../types';
import { getCountryDeck } from '../cards';

const find = (c: Country, id: string) => getCountryDeck(c).find((x) => x.id === id)!;

describe('Enigma Code Cracked fires only after the Status card has been used', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().initGame([
      { country: Country.GERMANY, isHuman: true, aiDifficulty: 'easy' },
      { country: Country.UK, isHuman: true, aiDifficulty: 'easy' },
      { country: Country.JAPAN, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.SOVIET_UNION, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.ITALY, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.USA, isHuman: false, aiDifficulty: 'easy' },
    ]);
  });
  afterEach(() => vi.useRealTimers());

  it('Bias for Action battles first; Enigma is offered afterwards', () => {
    const bias = find(Country.GERMANY, 'ger_bias_for_action');
    const enigma = find(Country.UK, 'uk_enigma_code_cracked');
    const build = find(Country.GERMANY, 'ger_build_army_1');
    const st = useGameStore.getState();
    const cleared = Object.fromEntries(
      Object.values(Country).map((c) => [
        c,
        { ...st.countries[c], hand: [], statusCards: [], responseCards: [], piecesOnBoard: [] },
      ])
    ) as unknown as typeof st.countries;

    useGameStore.setState({
      phase: GamePhase.PLAY_STEP,
      round: 3,
      currentCountryIndex: 0,
      pendingAction: null,
      selectedCard: null,
      actionContext: undefined,
      countries: {
        ...cleared,
        [Country.GERMANY]: {
          ...cleared[Country.GERMANY],
          hand: [build],
          statusCards: [bias],
          piecesOnBoard: [{ id: 'g1', country: Country.GERMANY, type: 'army', spaceId: 'germany' }],
        },
        [Country.UK]: { ...cleared[Country.UK], responseCards: [enigma] },
        [Country.SOVIET_UNION]: {
          ...cleared[Country.SOVIET_UNION],
          piecesOnBoard: [{ id: 's1', country: Country.SOVIET_UNION, type: 'army', spaceId: 'ukraine' }],
        },
      },
    });

    useGameStore.getState().selectCard(build);
    useGameStore.getState().playSelectedCard();
    useGameStore.getState().handleSpaceClick('balkans');
    vi.runAllTimers();

    let s = useGameStore.getState();
    expect(s.pendingAction?.type).toBe('OFFENSIVE_RESPONSE_OPPORTUNITY');
    // Enigma has not fired merely because Bias is available.
    expect(s.countries[Country.GERMANY].statusCards.map((c) => c.id)).toContain('ger_bias_for_action');

    useGameStore.getState().respondToOpportunity(true, 'ger_bias_for_action');
    vi.runAllTimers();
    s = useGameStore.getState();

    // Bias's battle has been declared/logged before Enigma is offered.
    expect(s.log.some((l) => l.message.includes('Bias for Action: battling'))).toBe(true);
    expect(s.pendingAction?.type).toBe('ENIGMA_OPPORTUNITY');
    expect(s.countries[Country.GERMANY].statusCards.map((c) => c.id)).toContain('ger_bias_for_action');

    useGameStore.getState().respondToOpportunity(true);
    vi.runAllTimers();
    s = useGameStore.getState();
    expect(s.countries[Country.GERMANY].statusCards.map((c) => c.id)).not.toContain('ger_bias_for_action');
    // The interrupted chain still completes: the battled enemy Army is removed.
    expect(s.countries[Country.SOVIET_UNION].piecesOnBoard.some((p) => p.id === 's1')).toBe(false);
  });
});
