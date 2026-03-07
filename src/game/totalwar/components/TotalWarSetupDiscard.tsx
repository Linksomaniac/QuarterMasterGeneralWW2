// ---------------------------------------------------------------------------
// TotalWarSetupDiscard — Custom setup discard panel for Total War (5 from 12)
// Replaces the base SetupDiscardPanel during SETUP_DISCARD phase.
// ---------------------------------------------------------------------------

import React, { useState, useCallback } from 'react';
import { useGameStore } from '../../store';
import { useTotalWarStore } from '../store';
import {
  Country,
  COUNTRY_COLORS,
  COUNTRY_NAMES,
  TURN_ORDER,
  GamePhase,
  CardType,
} from '../../types';
import { getCurrentCountry } from '../../engine';

const TW_DISCARD_COUNT = 5;

const CARD_TYPE_COLORS: Record<string, string> = {
  [CardType.BUILD_ARMY]: '#4a7c3f',
  [CardType.BUILD_NAVY]: '#3a5c8c',
  [CardType.LAND_BATTLE]: '#8c3a3a',
  [CardType.SEA_BATTLE]: '#3a6c8c',
  [CardType.EVENT]: '#8c7a3a',
  [CardType.STATUS]: '#6a3a8c',
  [CardType.ECONOMIC_WARFARE]: '#5c5c3a',
  [CardType.RESPONSE]: '#3a5c5c',
  AIR_POWER: '#5a8cc8',
  BOLSTER: '#c87a3a',
};

const CARD_TYPE_LABELS: Record<string, string> = {
  [CardType.BUILD_ARMY]: 'Build Army',
  [CardType.BUILD_NAVY]: 'Build Navy',
  [CardType.LAND_BATTLE]: 'Land Battle',
  [CardType.SEA_BATTLE]: 'Sea Battle',
  [CardType.EVENT]: 'Event',
  [CardType.STATUS]: 'Status',
  [CardType.ECONOMIC_WARFARE]: 'Econ Warfare',
  [CardType.RESPONSE]: 'Response',
  AIR_POWER: 'Air Power',
  BOLSTER: 'Bolster',
};

export default function TotalWarSetupDiscard() {
  const twAction = useTotalWarStore((s) => s.pendingTotalWarAction);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!twAction || twAction.type !== 'TW_SETUP_DISCARD') return null;

  const { country, countryIndex } = twAction;
  const state = useGameStore.getState();
  const cs = state.countries[country];
  if (!cs) return null;

  const hand = cs.hand;
  const color = COUNTRY_COLORS[country];

  const toggle = (cardId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else if (next.size < TW_DISCARD_COUNT) {
        next.add(cardId);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size !== TW_DISCARD_COUNT) return;

    const cardIds = Array.from(selected);
    const discarded = hand.filter((c: any) => cardIds.includes(c.id));
    const remaining = hand.filter((c: any) => !cardIds.includes(c.id));

    // Update the country's hand/discard directly
    useGameStore.setState((s) => {
      const newCountries = {
        ...s.countries,
        [country]: {
          ...s.countries[country],
          hand: remaining,
          discard: [...s.countries[country].discard, ...discarded],
        },
      };

      // Find next human country
      let nextIdx = countryIndex + 1;
      while (nextIdx < TURN_ORDER.length && !newCountries[TURN_ORDER[nextIdx]]?.isHuman) {
        nextIdx++;
      }

      if (nextIdx >= TURN_ORDER.length) {
        // All countries done — start the game
        return {
          countries: newCountries,
          phase: GamePhase.PLAY_STEP,
          selectedDiscards: new Set<string>(),
          setupDiscardCountryIndex: 0,
          log: [
            ...s.log,
            {
              round: 1,
              country: Country.GERMANY,
              message: 'All countries ready. Round 1 begins!',
              timestamp: Date.now(),
            },
          ],
        };
      } else {
        // More human countries to go — set up next
        return {
          countries: newCountries,
          setupDiscardCountryIndex: nextIdx,
          selectedDiscards: new Set<string>(),
        };
      }
    });

    // Determine if all countries are done BEFORE clearing pending action,
    // since the hooks subscription may intercept the PLAY_STEP phase change.
    let nextHumanIdx = countryIndex + 1;
    const freshCountries = useGameStore.getState().countries;
    while (nextHumanIdx < TURN_ORDER.length && !freshCountries[TURN_ORDER[nextHumanIdx]]?.isHuman) {
      nextHumanIdx++;
    }
    const allDone = nextHumanIdx >= TURN_ORDER.length;

    if (allDone) {
      // Clear setup discard action — hooks subscription will set the next pending action
      // (e.g. REALLOCATE_RESOURCES_OFFER) when it sees PLAY_STEP phase.
      // Use setTimeout so hooks subscription fires first from the setState above.
      setTimeout(() => {
        const current = useTotalWarStore.getState().pendingTotalWarAction;
        // Only clear if it's still the setup discard action (don't wipe hooks-set actions)
        if (current?.type === 'TW_SETUP_DISCARD') {
          useTotalWarStore.getState().setPendingTotalWarAction(null);
        }
        // Trigger AI turn if needed
        const s = useGameStore.getState();
        const c = getCurrentCountry(s);
        if (!s.countries[c].isHuman) {
          useGameStore.getState().runFullAiTurn();
        }
      }, 300);
    } else {
      // Next human country — reset selection and re-trigger setup discard
      setSelected(new Set());
      useTotalWarStore.getState().setPendingTotalWarAction({
        type: 'TW_SETUP_DISCARD',
        country: TURN_ORDER[nextHumanIdx],
        countryIndex: nextHumanIdx,
      });
    }
  };

  return (
    <div className="bg-[#0A1628]/90 backdrop-blur rounded-t-xl border-t border-[#1A3A5A] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-display font-bold" style={{ color }}>
            {COUNTRY_NAMES[country]}
          </span>
          <span className="text-xs text-gray-400">
            — Select {TW_DISCARD_COUNT} cards to discard from your initial hand of {hand.length}
            <span className="ml-1 text-yellow-500">(Total War)</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {selected.size}/{TW_DISCARD_COUNT} selected
          </span>
          <button
            onClick={handleConfirm}
            disabled={selected.size !== TW_DISCARD_COUNT}
            className={`px-4 py-1.5 rounded text-sm font-bold transition-colors ${
              selected.size === TW_DISCARD_COUNT
                ? 'bg-board-supply text-gray-900 hover:bg-yellow-500'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            Confirm Discard
          </button>
        </div>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-2 w-fit mx-auto min-w-0">
          {hand.map((card: any) => {
            const isSelected = selected.has(card.id);
            const typeColor = CARD_TYPE_COLORS[card.type] ?? '#555';
            const typeLabel = CARD_TYPE_LABELS[card.type] ?? card.type;
            return (
              <div
                key={card.id}
                onClick={() => toggle(card.id)}
                className={`flex-shrink-0 w-[160px] h-[210px] rounded-lg cursor-pointer transition-all border-2 ${
                  isSelected
                    ? 'border-red-500 opacity-50 -translate-y-0 scale-95'
                    : 'border-transparent hover:border-yellow-400 -translate-y-0 hover:-translate-y-1'
                }`}
                style={{
                  background: `linear-gradient(135deg, ${typeColor} 0%, ${typeColor}cc 100%)`,
                }}
              >
                <div className="p-2 h-full flex flex-col">
                  <div className="text-[9px] font-bold text-white/70 uppercase tracking-wider mb-1">
                    {typeLabel}
                  </div>
                  <div className="text-[11px] font-bold text-white leading-tight">
                    {card.name}
                  </div>
                  {card.text && (
                    <div className="text-[8px] text-white/60 leading-snug mt-1 flex-1 overflow-hidden line-clamp-4">
                      {card.text}
                    </div>
                  )}
                  {isSelected && (
                    <div className="text-center text-red-300 text-xs font-bold mt-1">
                      DISCARD
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
