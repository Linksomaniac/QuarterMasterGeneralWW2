import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '../store';
import { Country, GamePhase } from '../types';
import { getCountryDeck } from '../cards';
import { findVolkssturmOpportunity, resolveVolkssturm } from '../engine';

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

describe('Volksturm only ever recruits in Germany, and only once per turn', () => {
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

  it('is never offered as an offensive response after building an Army adjacent to Middle East (e.g. Balkans)', () => {
    // Regression test for a live-game bug: after building an Army in Balkans
    // (which is adjacent to Middle East), the generic "recruit an additional
    // army adjacent to the space you just built in" offensive-response scan
    // (findOffensiveResponses' RECRUIT_ARMY branch) was matching Volksturm's
    // card effect ({ type: 'RECRUIT_ARMY', where: ['germany'] }) even though
    // Volksturm is a fixed-location, beginning-of-turn-only effect with no
    // relation to build chains. This let Volksturm get auto-offered/accepted
    // and place an Army in Middle East instead of Germany.
    const volksturm = findCard(Country.GERMANY, 'ger_volksturm');
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
          statusCards: [volksturm],
          // An existing Army in Germany makes Balkans (adjacent to Germany,
          // and itself adjacent to Middle East) a valid build location.
          piecesOnBoard: [
            { id: 'test_ger_home_army', country: Country.GERMANY, type: 'army', spaceId: 'germany' },
          ],
        },
      },
    });

    useGameStore.getState().selectCard(buildArmy);
    useGameStore.getState().playSelectedCard();

    let s = useGameStore.getState();
    expect(s.pendingAction?.type).toBe('SELECT_BUILD_LOCATION');
    if (s.pendingAction?.type === 'SELECT_BUILD_LOCATION') {
      expect(s.pendingAction.validSpaces).toContain('balkans');
    }

    useGameStore.getState().handleSpaceClick('balkans');
    vi.runAllTimers();

    s = useGameStore.getState();
    // Volksturm must never be offered/auto-triggered off a build-army chain.
    expect(s.pendingAction?.type).not.toBe('OFFENSIVE_RESPONSE_OPPORTUNITY');

    const germanArmies = s.countries[Country.GERMANY].piecesOnBoard.filter(
      (p) => p.type === 'army' && p.country === Country.GERMANY
    );
    // Only the pre-existing home Army and the newly built Balkans Army — no
    // stray Volksturm-recruited Army anywhere, and definitely not in Middle East.
    expect(germanArmies.some((p) => p.spaceId === 'middle_east')).toBe(false);
    expect(germanArmies.map((p) => p.spaceId).sort()).toEqual(['balkans', 'germany']);
  });

  it('places its recruited Army in Germany, and only fires once per turn', () => {
    const state = useGameStore.getState();
    const volksturm = findCard(Country.GERMANY, 'ger_volksturm');
    const cs = state.countries[Country.GERMANY];

    const withVolksturm = {
      ...state,
      countries: {
        ...state.countries,
        [Country.GERMANY]: {
          ...cs,
          statusCards: [volksturm],
          piecesOnBoard: [],
        },
      },
    } as typeof state;

    const opportunity = findVolkssturmOpportunity(Country.GERMANY, withVolksturm);
    expect(opportunity?.id).toBe('ger_volksturm');

    const afterFirst = resolveVolkssturm(withVolksturm);
    const germanArmiesAfterFirst = afterFirst.countries[Country.GERMANY].piecesOnBoard.filter(
      (p) => p.type === 'army'
    );
    expect(germanArmiesAfterFirst).toHaveLength(1);
    expect(germanArmiesAfterFirst[0].spaceId).toBe('germany');

    // Calling it again in the same turn must be a no-op: Germany already has
    // a friendly Army there, so the guard blocks a second recruit.
    const afterSecond = resolveVolkssturm(afterFirst);
    expect(afterSecond).toBe(afterFirst);
    const germanArmiesAfterSecond = afterSecond.countries[Country.GERMANY].piecesOnBoard.filter(
      (p) => p.type === 'army'
    );
    expect(germanArmiesAfterSecond).toHaveLength(1);
  });
});
