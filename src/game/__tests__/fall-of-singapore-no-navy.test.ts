import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store';
import { Country, GamePhase } from '../types';
import { getCountryDeck } from '../cards';
import { findOffensiveResponses, resolveOffensiveResponse } from '../engine';

function setup(withEnemyNavy: boolean, withJapanArmyInSEA = false) {
  useGameStore.getState().initGame([
    { country: Country.JAPAN, isHuman: true, aiDifficulty: 'easy' },
    { country: Country.UK, isHuman: false, aiDifficulty: 'easy' },
    { country: Country.GERMANY, isHuman: false, aiDifficulty: 'easy' },
    { country: Country.SOVIET_UNION, isHuman: false, aiDifficulty: 'easy' },
    { country: Country.ITALY, isHuman: false, aiDifficulty: 'easy' },
    { country: Country.USA, isHuman: false, aiDifficulty: 'easy' },
  ]);
  const card = getCountryDeck(Country.JAPAN).find((c) => c.id === 'jpn_fall_of_singapore')!;
  const st = useGameStore.getState();
  const cleared = Object.fromEntries(
    Object.values(Country).map((c) => [
      c,
      { ...st.countries[c], hand: [], statusCards: [], responseCards: [], piecesOnBoard: [] },
    ])
  ) as unknown as typeof st.countries;
  cleared[Country.JAPAN] = {
    ...cleared[Country.JAPAN],
    responseCards: [card],
    piecesOnBoard: withJapanArmyInSEA
      ? [{ id: 'j1', country: Country.JAPAN, type: 'army', spaceId: 'southeast_asia' }]
      : [{ id: 'j1', country: Country.JAPAN, type: 'army', spaceId: 'china' }],
  };
  if (withEnemyNavy) {
    cleared[Country.UK] = {
      ...cleared[Country.UK],
      piecesOnBoard: [{ id: 'uk1', country: Country.UK, type: 'navy', spaceId: 'south_china_sea' }],
    };
  }
  useGameStore.setState({ phase: GamePhase.PLAY_STEP, currentCountryIndex: 0, countries: cleared });
  return { card, state: useGameStore.getState() };
}

describe('Fall of Singapore', () => {
  beforeEach(() => {});

  it('is offered after a Southeast Asia land battle even with no enemy Navy in South China Sea', () => {
    const { state } = setup(false);
    const r = findOffensiveResponses('battle_land', 'southeast_asia', Country.JAPAN, state);
    expect(r.map((x) => x.card.id)).toContain('jpn_fall_of_singapore');
  });

  it('recruits an Army in Southeast Asia when resolved with no Navy to battle', () => {
    const { card, state } = setup(false);
    const { newState } = resolveOffensiveResponse(card, 'southeast_asia', Country.JAPAN, state);
    expect(
      newState.countries[Country.JAPAN].piecesOnBoard.some((p) => p.spaceId === 'southeast_asia' && p.type === 'army')
    ).toBe(true);
  });

  it('is still offered when an enemy Navy is in South China Sea', () => {
    const { state } = setup(true);
    const r = findOffensiveResponses('battle_land', 'southeast_asia', Country.JAPAN, state);
    expect(r.map((x) => x.card.id)).toContain('jpn_fall_of_singapore');
  });

  it('is not offered when there is no Navy and Japan already has an Army in Southeast Asia', () => {
    const { state } = setup(false, true);
    const r = findOffensiveResponses('battle_land', 'southeast_asia', Country.JAPAN, state);
    expect(r.map((x) => x.card.id)).not.toContain('jpn_fall_of_singapore');
  });
});
