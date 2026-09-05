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

describe('Ally-build event cards ask the human ally to choose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().initGame([
      { country: Country.GERMANY, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.UK, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.JAPAN, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.SOVIET_UNION, isHuman: true, aiDifficulty: 'easy' },
      { country: Country.ITALY, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.USA, isHuman: false, aiDifficulty: 'easy' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lets a human Soviet Union pick the build space for Murmansk Convoy instead of auto-building', () => {
    const murmanskConvoy = findCard(Country.USA, 'usa_murmansk_convoy');
    const cleared = clearedCountries();

    useGameStore.setState({
      phase: GamePhase.PLAY_STEP,
      round: 3,
      currentCountryIndex: 5, // USA
      pendingAction: null,
      selectedCard: null,
      actionContext: undefined,
      countries: {
        ...cleared,
        [Country.USA]: { ...cleared[Country.USA], hand: [murmanskConvoy] },
        [Country.SOVIET_UNION]: {
          ...cleared[Country.SOVIET_UNION],
          piecesOnBoard: [
            { id: 'test_ussr_moscow', country: Country.SOVIET_UNION, type: 'army', spaceId: 'moscow' },
          ],
        },
      },
    });

    useGameStore.getState().selectCard(murmanskConvoy);
    useGameStore.getState().playSelectedCard();
    vi.runAllTimers();

    const s = useGameStore.getState();

    // The Soviet Union (human) must be asked where to build the bonus Army —
    // Moscow has 3 empty land neighbors (russia, kazakhstan, siberia), so this
    // is a genuine choice, not something the engine may pick automatically.
    expect(s.pendingAction?.type).toBe('SELECT_EVENT_SPACE');
    if (s.pendingAction?.type === 'SELECT_EVENT_SPACE') {
      expect(s.pendingAction.effectCountry).toBe(Country.SOVIET_UNION);
      expect(s.pendingAction.humanCheckCountry).toBe(Country.SOVIET_UNION);
      expect(s.pendingAction.validSpaces.length).toBeGreaterThan(1);
    }

    // The mandatory single-space recruit into Russia has happened (that part
    // has no choice to make), but the bonus Army build must not have — it's
    // still awaiting the human's choice, not auto-resolved by the AI's play.
    const soviets = s.countries[Country.SOVIET_UNION].piecesOnBoard;
    expect(soviets.length).toBe(2);
    expect(soviets.some((p) => p.spaceId === 'russia')).toBe(true);
  });
});

describe('Patton Advances battle respects defensive Response cards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().initGame([
      { country: Country.GERMANY, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.UK, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.JAPAN, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.SOVIET_UNION, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.ITALY, isHuman: true, aiDifficulty: 'easy' },
      { country: Country.USA, isHuman: true, aiDifficulty: 'easy' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers Italy a chance to protect its Army before Patton Advances eliminates it', () => {
    const pattonAdvances = findCard(Country.USA, 'usa_patton_advances');
    const monteCassino = findCard(Country.ITALY, 'ita_monte_cassino');
    const cleared = clearedCountries();

    useGameStore.setState({
      phase: GamePhase.PLAY_STEP,
      round: 3,
      currentCountryIndex: 5, // USA
      pendingAction: null,
      selectedCard: null,
      actionContext: undefined,
      countries: {
        ...cleared,
        [Country.USA]: {
          ...cleared[Country.USA],
          hand: [pattonAdvances],
          // Patton Advances is a "Build" effect, so per the game's build rule
          // it still needs a USA piece adjacent to Western Europe (here, a
          // Navy in the Mediterranean) — it isn't a free "Recruit" placement.
          piecesOnBoard: [
            { id: 'test_usa_navy', country: Country.USA, type: 'navy', spaceId: 'mediterranean' },
          ],
        },
        [Country.ITALY]: {
          ...cleared[Country.ITALY],
          responseCards: [{ ...monteCassino, id: 'test_monte_cassino', country: Country.ITALY }],
          piecesOnBoard: [
            { id: 'test_ita_army', country: Country.ITALY, type: 'army', spaceId: 'italy' },
          ],
        },
      },
    });

    useGameStore.getState().selectCard(pattonAdvances);
    useGameStore.getState().playSelectedCard();
    vi.runAllTimers();

    let s = useGameStore.getState();

    // The Army must actually have been built in Western Europe (a real build).
    const built = s.countries[Country.USA].piecesOnBoard.find(
      (p) => p.spaceId === 'western_europe' && p.type === 'army'
    );
    expect(built).toBeTruthy();

    // The battle itself requires confirming the (single) target space, just
    // like a normal battle card, rather than resolving silently.
    expect(s.pendingAction?.type).toBe('SELECT_EVENT_SPACE');
    if (s.pendingAction?.type === 'SELECT_EVENT_SPACE') {
      expect(s.pendingAction.validSpaces).toEqual(['italy']);
      useGameStore.getState().handleSpaceClick('italy');
      vi.runAllTimers();
    }

    s = useGameStore.getState();

    // Before the Italian Army is eliminated, Italy (human) must be offered
    // the chance to use its protection Response card — the battle must not
    // behave like an unconditional elimination.
    expect(s.pendingAction?.type).toBe('RESPONSE_OPPORTUNITY');
    if (s.pendingAction?.type === 'RESPONSE_OPPORTUNITY') {
      expect(s.pendingAction.responseCountry).toBe(Country.ITALY);
      expect(s.pendingAction.eliminatedPieceCountry).toBe(Country.ITALY);
    }

    // Italian army must still be on the board awaiting the decision.
    expect(s.countries[Country.ITALY].piecesOnBoard.some((p) => p.id === 'test_ita_army')).toBe(true);

    // Decline the protection — the Army should now actually be eliminated.
    useGameStore.getState().respondToOpportunity(false);
    vi.runAllTimers();

    s = useGameStore.getState();
    expect(s.countries[Country.ITALY].piecesOnBoard.some((p) => p.id === 'test_ita_army')).toBe(false);
  });
});

describe('removeOwnPiece lets a human voluntarily remove their own pieces', () => {
  beforeEach(() => {
    useGameStore.getState().initGame([
      { country: Country.GERMANY, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.UK, isHuman: true, aiDifficulty: 'easy' },
      { country: Country.JAPAN, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.SOVIET_UNION, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.ITALY, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.USA, isHuman: false, aiDifficulty: 'easy' },
    ]);
  });

  it('removes a human-controlled piece regardless of phase or turn', () => {
    const cleared = clearedCountries();
    useGameStore.setState({
      countries: {
        ...cleared,
        [Country.UK]: {
          ...cleared[Country.UK],
          piecesOnBoard: [{ id: 'test_uk_army', country: Country.UK, type: 'army', spaceId: 'united_kingdom' }],
        },
      },
    });

    useGameStore.getState().removeOwnPiece('test_uk_army');

    const s = useGameStore.getState();
    expect(s.countries[Country.UK].piecesOnBoard.some((p) => p.id === 'test_uk_army')).toBe(false);
  });

  it('refuses to remove an AI-controlled country\'s piece', () => {
    const cleared = clearedCountries();
    useGameStore.setState({
      countries: {
        ...cleared,
        [Country.GERMANY]: {
          ...cleared[Country.GERMANY],
          piecesOnBoard: [{ id: 'test_ger_army', country: Country.GERMANY, type: 'army', spaceId: 'germany' }],
        },
      },
    });

    useGameStore.getState().removeOwnPiece('test_ger_army');

    const s = useGameStore.getState();
    expect(s.countries[Country.GERMANY].piecesOnBoard.some((p) => p.id === 'test_ger_army')).toBe(true);
  });
});

describe('Bravado battle respects Soviet protection Response cards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().initGame([
      { country: Country.GERMANY, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.UK, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.JAPAN, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.SOVIET_UNION, isHuman: true, aiDifficulty: 'easy' },
      { country: Country.ITALY, isHuman: true, aiDifficulty: 'easy' },
      { country: Country.USA, isHuman: false, aiDifficulty: 'easy' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers the Soviet Union a chance to protect its Army before Bravado eliminates it', () => {
    const bravado = findCard(Country.ITALY, 'ita_bravado');
    const stalingrad = findCard(Country.SOVIET_UNION, 'ussr_stalingrad');
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
          statusCards: [bravado],
          piecesOnBoard: [
            { id: 'test_ita_army', country: Country.ITALY, type: 'army', spaceId: 'balkans' },
          ],
        },
        [Country.SOVIET_UNION]: {
          ...cleared[Country.SOVIET_UNION],
          responseCards: [{ ...stalingrad, id: 'test_stalingrad', country: Country.SOVIET_UNION }],
          piecesOnBoard: [
            { id: 'test_ussr_army', country: Country.SOVIET_UNION, type: 'army', spaceId: 'ukraine' },
          ],
        },
      },
    });

    useGameStore.getState().useAlternativeAction(bravado.id);
    vi.runAllTimers();

    let s = useGameStore.getState();

    // The battle itself requires confirming the (single) target space, just
    // like a normal battle card, rather than resolving silently.
    expect(s.pendingAction?.type).toBe('SELECT_BATTLE_TARGET');
    if (s.pendingAction?.type === 'SELECT_BATTLE_TARGET') {
      expect(s.pendingAction.validTargets).toEqual(['ukraine']);
      useGameStore.getState().handleSpaceClick('ukraine');
      vi.runAllTimers();
    }

    s = useGameStore.getState();

    // Before the Soviet Army is eliminated, the Soviet Union (human) must be
    // offered the chance to use Stalingrad — Bravado must not behave like an
    // unconditional elimination.
    expect(s.pendingAction?.type).toBe('RESPONSE_OPPORTUNITY');
    if (s.pendingAction?.type === 'RESPONSE_OPPORTUNITY') {
      expect(s.pendingAction.responseCountry).toBe(Country.SOVIET_UNION);
      expect(s.pendingAction.eliminatedPieceCountry).toBe(Country.SOVIET_UNION);
    }

    // Soviet army must still be on the board awaiting the decision.
    expect(s.countries[Country.SOVIET_UNION].piecesOnBoard.some((p) => p.id === 'test_ussr_army')).toBe(true);

    // Decline the protection — the Army should now actually be eliminated.
    useGameStore.getState().respondToOpportunity(false);
    vi.runAllTimers();

    s = useGameStore.getState();
    expect(s.countries[Country.SOVIET_UNION].piecesOnBoard.some((p) => p.id === 'test_ussr_army')).toBe(false);
  });
});

describe('AI-driven Bravado also respects Soviet protection Response cards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().initGame([
      { country: Country.GERMANY, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.UK, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.JAPAN, isHuman: false, aiDifficulty: 'easy' },
      { country: Country.SOVIET_UNION, isHuman: true, aiDifficulty: 'easy' },
      { country: Country.ITALY, isHuman: false, aiDifficulty: 'hard' },
      { country: Country.USA, isHuman: false, aiDifficulty: 'easy' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers the Soviet Union a chance to protect its Army when AI-Italy uses Bravado', async () => {
    const bravado = findCard(Country.ITALY, 'ita_bravado');
    const filler = findCard(Country.ITALY, 'ita_land_battle_1');
    const stalingrad = findCard(Country.SOVIET_UNION, 'ussr_stalingrad');
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
          hand: [filler],
          statusCards: [bravado],
          piecesOnBoard: [
            { id: 'test_ita_army', country: Country.ITALY, type: 'army', spaceId: 'balkans' },
          ],
        },
        [Country.SOVIET_UNION]: {
          ...cleared[Country.SOVIET_UNION],
          responseCards: [{ ...stalingrad, id: 'test_stalingrad', country: Country.SOVIET_UNION }],
          piecesOnBoard: [
            { id: 'test_ussr_army', country: Country.SOVIET_UNION, type: 'army', spaceId: 'ukraine' },
          ],
        },
      },
    });

    await useGameStore.getState().executeAiTurn();
    vi.runAllTimers();

    const s = useGameStore.getState();

    // Before the Soviet Army is eliminated, the human Soviet Union must be
    // offered the chance to use Stalingrad — even when Bravado is played by
    // the AI, not just when a human plays it.
    expect(s.pendingAction?.type).toBe('RESPONSE_OPPORTUNITY');
    if (s.pendingAction?.type === 'RESPONSE_OPPORTUNITY') {
      expect(s.pendingAction.responseCountry).toBe(Country.SOVIET_UNION);
      expect(s.pendingAction.eliminatedPieceCountry).toBe(Country.SOVIET_UNION);
    }
    expect(s.countries[Country.SOVIET_UNION].piecesOnBoard.some((p) => p.id === 'test_ussr_army')).toBe(true);
  });
});
