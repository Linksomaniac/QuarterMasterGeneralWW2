// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useGameStore } from '../store';
import { Country, GamePhase, CardType } from '../types';
import { getCountryDeck } from '../cards';
import { useTotalWarStore } from '../totalwar/store';
import { useTotalWarController } from '../totalwar/hooks';
import { getTotalWarDeck } from '../totalwar/engine';
import AirStepOverlay from '../totalwar/components/AirStepOverlay';

function findCard(country: Country, id: string) {
  const card = getCountryDeck(country).find((c) => c.id === id);
  if (!card) throw new Error(`card not found: ${id}`);
  return card;
}

function HarnessComponent() {
  useTotalWarController();
  const inAirStep = useTotalWarStore((s) => s.inAirStep);
  return inAirStep ? React.createElement(AirStepOverlay) : null;
}

function clickButtonWithText(container: HTMLElement, text: string) {
  const buttons = Array.from(container.querySelectorAll('button'));
  const btn = buttons.find((b) => b.textContent?.includes(text));
  if (!btn) throw new Error(`button not found: ${text} (available: ${buttons.map((b) => b.textContent).join(' | ')})`);
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('Blitzkrieg build-after-battle chain (Total War expansion active)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

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

    useTotalWarStore.getState().resetState();
    useTotalWarStore.getState().setEnabled(true);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // Mount the controller hook (+ the real AirStepOverlay, exactly like
    // TotalWarGameView does) so its useGameStore subscriptions are live.
    // act() forces the useEffect subscriptions to flush before we touch the
    // store below — otherwise React 18 may defer them past this setup.
    act(() => {
      root.render(React.createElement(HarnessComponent));
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  function setupGermanTurn3() {
    const blitzkrieg = findCard(Country.GERMANY, 'ger_blitzkrieg');
    const landBattleCard = findCard(Country.GERMANY, 'ger_land_battle_1');
    const airPowerCard = getTotalWarDeck(Country.GERMANY).find(
      (c) => (c as any).type === 'AIR_POWER'
    );

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
          hand: (airPowerCard ? [landBattleCard, airPowerCard] : [landBattleCard]) as typeof state.countries[Country.GERMANY]['hand'],
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

    return { blitzkrieg, landBattleCard, airPowerCard };
  }

  it('lets Germany reach and complete its Air Step after Land Battle triggers a Blitzkrieg build', () => {
    const { landBattleCard, airPowerCard } = setupGermanTurn3();
    expect(airPowerCard).toBeTruthy();

    // Play the Land Battle card and eliminate the Soviet army in Eastern Europe.
    act(() => {
      useGameStore.getState().selectCard(landBattleCard);
      useGameStore.getState().playSelectedCard();
    });
    expect(useGameStore.getState().pendingAction?.type).toBe('SELECT_BATTLE_TARGET');

    act(() => {
      useGameStore.getState().handleSpaceClick('eastern_europe');
    });
    expect(useGameStore.getState().pendingAction?.type).toBe('OFFENSIVE_RESPONSE_OPPORTUNITY');

    // Accept Blitzkrieg's build-after-battle offer.
    act(() => {
      useGameStore.getState().respondToOpportunity(true);
      vi.runAllTimers();
    });

    const built = useGameStore.getState().countries[Country.GERMANY].piecesOnBoard.find(
      (p) => p.spaceId === 'eastern_europe' && p.type === 'army'
    );
    expect(built).toBeTruthy();

    // The turn should now have reached the Air Step (Total War expansion),
    // with the choice overlay visible and interactive.
    const tw = useTotalWarStore.getState();
    expect(tw.inAirStep).toBe(true);
    expect(tw.pendingTotalWarAction?.type).toBe('AIR_STEP_CHOICE');

    // Regression check: before the fix, clicking "Deploy Air Force" replaced
    // the pendingTotalWarAction with SELECT_AF_DISCARD_FOR_DEPLOY, the overlay
    // unmounted (TotalWarGameView only rendered it for AIR_STEP_CHOICE), and
    // the human had no way to pick a card or a space — a full input lockout.
    clickButtonWithText(container, 'Deploy Air Force');

    expect(useTotalWarStore.getState().pendingTotalWarAction?.type).toBe('SELECT_AF_DISCARD_FOR_DEPLOY');
    // The overlay must still be showing something interactive (not vanish).
    expect(container.querySelector('button')).toBeTruthy();

    // Pick the Air Power card to discard.
    clickButtonWithText(container, airPowerCard!.name);
    expect(useTotalWarStore.getState().pendingTotalWarAction?.type).toBe('SELECT_AF_DEPLOY_LOCATION');
    expect(
      useGameStore.getState().countries[Country.GERMANY].hand.some((c) => c.id === airPowerCard!.id)
    ).toBe(false);

    // Resolve the deploy location the same way TotalWarGameBoard's
    // onSpaceClick would (clicking a validSpaces entry on the board).
    const pending = useTotalWarStore.getState().pendingTotalWarAction;
    if (pending?.type !== 'SELECT_AF_DEPLOY_LOCATION') throw new Error('expected SELECT_AF_DEPLOY_LOCATION');
    const deploySpace = pending.validSpaces[0];
    expect(deploySpace).toBeTruthy();

    act(() => {
      useTotalWarStore.getState().addAirForce({
        id: 'af_test',
        country: Country.GERMANY,
        type: 'air_force',
        spaceId: deploySpace,
      });
      useTotalWarStore.getState().setPendingTotalWarAction(null);
      useTotalWarStore.getState().completeAirStep();
      vi.runAllTimers();
    });

    const finalTw = useTotalWarStore.getState();
    expect(finalTw.inAirStep).toBe(false);
    expect(finalTw.airForces.some((af) => af.id === 'af_test')).toBe(true);

    // The base game must not be stuck: no leftover pendingAction blocking
    // Germany's Play Step controls (Pass Turn / play-a-card).
    const finalState = useGameStore.getState();
    const stillGermanysTurnAndBlocked =
      finalState.round === 3 &&
      (finalState.phase === GamePhase.PLAY_STEP || finalState.phase === GamePhase.AWAITING_RESPONSE) &&
      finalState.pendingAction !== null;
    expect(stillGermanysTurnAndBlocked).toBe(false);
  });
});
