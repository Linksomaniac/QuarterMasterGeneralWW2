// ---------------------------------------------------------------------------
// ReallocateResourcesPrompt — UI for human Reallocate Resources action.
//
// Flow: OFFER → DISCARD (pick N cards to discard) → PICK (choose card from deck)
// ---------------------------------------------------------------------------

import React, { useState } from 'react';
import { useGameStore } from '../../store';
import { useTotalWarStore } from '../store';
import {
  COUNTRY_COLORS,
  COUNTRY_NAMES,
  Country,
  CardType,
  GamePhase,
} from '../../types';
import { REALLOCATE_COST, REALLOCATE_ELIGIBLE_TYPES } from '../types';

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

export default function ReallocateResourcesPrompt() {
  const pendingAction = useTotalWarStore((s) => s.pendingTotalWarAction);

  if (!pendingAction) return null;

  if (pendingAction.type === 'REALLOCATE_RESOURCES_OFFER') {
    return <ReallocateOffer country={pendingAction.country} />;
  }
  if (pendingAction.type === 'REALLOCATE_RESOURCES_DISCARD') {
    return <ReallocateDiscard country={pendingAction.country} cost={pendingAction.cost} />;
  }
  if (pendingAction.type === 'REALLOCATE_RESOURCES_PICK') {
    return (
      <ReallocatePick
        country={pendingAction.country}
        eligibleCards={pendingAction.eligibleCards}
        source={pendingAction.source}
      />
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Step 1: Offer
// ---------------------------------------------------------------------------

function ReallocateOffer({ country }: { country: Country }) {
  const color = COUNTRY_COLORS[country];
  const hand = useGameStore.getState().countries[country]?.hand ?? [];

  // Check for Victory Gardens (USA status: cost reduced to 1)
  const hasVictoryGardens =
    country === Country.USA &&
    useGameStore
      .getState()
      .countries[Country.USA]?.statusCards.some(
        (c: any) => c.effects?.some((e: any) => e.condition === 'cheaper_reallocate')
      );
  const cost = hasVictoryGardens ? 1 : REALLOCATE_COST;

  const canAfford = hand.length > cost; // Must have more cards than cost (need at least 1 left)

  const handleAccept = () => {
    useTotalWarStore.getState().setPendingTotalWarAction({
      type: 'REALLOCATE_RESOURCES_DISCARD',
      country,
      cost,
    });
  };

  const handleDecline = () => {
    useTotalWarStore.getState().setPendingTotalWarAction(null);
    // Resume normal play step
    useGameStore.setState({ phase: GamePhase.PLAY_STEP });
  };

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-yellow-700/50 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-xs uppercase tracking-wider text-yellow-400 mb-1">
            Reallocate Resources
          </div>
          <div className="text-lg font-bold" style={{ color }}>
            {COUNTRY_NAMES[country]}
          </div>
        </div>

        <div className="bg-yellow-900/20 border border-yellow-800/30 rounded-lg p-3 mb-4">
          <div className="text-sm text-gray-300">
            Discard <span className="font-bold text-yellow-300">{cost} card{cost !== 1 ? 's' : ''}</span> from
            your hand to search your deck for a <span className="text-white font-medium">Build Army</span>,{' '}
            <span className="text-white font-medium">Build Navy</span>,{' '}
            <span className="text-white font-medium">Land Battle</span>, or{' '}
            <span className="text-white font-medium">Sea Battle</span> card.
          </div>
          {hasVictoryGardens && (
            <div className="text-xs text-green-400 mt-2">
              Victory Gardens: Cost reduced to 1 card!
            </div>
          )}
          <div className="text-xs text-gray-500 mt-2">
            Hand: {hand.length} cards
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            disabled={!canAfford}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              canAfford
                ? 'bg-yellow-700 hover:bg-yellow-600 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            Reallocate (Discard {cost})
          </button>
          <button
            onClick={handleDecline}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-700"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Discard selection
// ---------------------------------------------------------------------------

function ReallocateDiscard({ country, cost }: { country: Country; cost: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hand = useGameStore.getState().countries[country]?.hand ?? [];
  const color = COUNTRY_COLORS[country];

  const toggle = (cardId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else if (next.size < cost) {
        next.add(cardId);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size !== cost) return;

    const discardIds = Array.from(selected);

    // Discard from hand
    useGameStore.setState((s) => {
      const cs = s.countries[country];
      const discarded = cs.hand.filter((c: any) => discardIds.includes(c.id));
      const remaining = cs.hand.filter((c: any) => !discardIds.includes(c.id));
      return {
        countries: {
          ...s.countries,
          [country]: {
            ...cs,
            hand: remaining,
            discard: [...cs.discard, ...discarded],
          },
        },
      };
    });

    // Check for War Bonds (USA status: search discard instead of deck)
    const hasWarBonds =
      country === Country.USA &&
      useGameStore
        .getState()
        .countries[Country.USA]?.statusCards.some(
          (c: any) => c.effects?.some((e: any) => e.condition === 'reallocate_from_discard')
        );

    // Find eligible cards from deck or discard
    const freshState = useGameStore.getState();
    const cs = freshState.countries[country];
    const source = hasWarBonds ? cs.discard : cs.deck;
    const eligible = source
      .filter((c: any) => REALLOCATE_ELIGIBLE_TYPES.includes(c.type))
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        text: c.text || '',
      }));

    if (eligible.length === 0) {
      // No eligible cards — log and resume
      useGameStore.setState((s) => ({
        log: [
          ...s.log,
          {
            country,
            message: `Reallocate Resources: No eligible cards found in ${hasWarBonds ? 'discard' : 'deck'}`,
            round: s.round,
            timestamp: Date.now(),
          },
        ],
        phase: GamePhase.PLAY_STEP,
      }));
      useTotalWarStore.getState().setPendingTotalWarAction(null);
      return;
    }

    useTotalWarStore.getState().setPendingTotalWarAction({
      type: 'REALLOCATE_RESOURCES_PICK',
      country,
      eligibleCards: eligible,
      source: hasWarBonds ? 'discard' : 'deck',
    });
  };

  const handleCancel = () => {
    // Cancel — go back to offer (or just skip)
    useTotalWarStore.getState().setPendingTotalWarAction(null);
    useGameStore.setState({ phase: GamePhase.PLAY_STEP });
  };

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-yellow-700/50 rounded-xl p-5 max-w-3xl w-full mx-4 shadow-2xl">
        <div className="text-center mb-3">
          <div className="text-xs uppercase tracking-wider text-yellow-400 mb-1">
            Reallocate Resources — Select {cost} card{cost !== 1 ? 's' : ''} to discard
          </div>
          <div className="text-sm font-bold" style={{ color }}>
            {COUNTRY_NAMES[country]}
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="flex gap-2 w-fit mx-auto min-w-0">
            {hand.map((card: any) => {
              const isSelected = selected.has(card.id);
              const typeColor = CARD_TYPE_COLORS[card.type] ?? '#555';
              const typeLabel = CARD_TYPE_LABELS[card.type] ?? card.type;
              return (
                <div
                  key={card.id}
                  onClick={() => toggle(card.id)}
                  className={`flex-shrink-0 w-[130px] h-[180px] rounded-lg cursor-pointer transition-all border-2 ${
                    isSelected
                      ? 'border-red-500 opacity-50 scale-95'
                      : 'border-transparent hover:border-yellow-400 hover:-translate-y-1'
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${typeColor} 0%, ${typeColor}cc 100%)`,
                  }}
                >
                  <div className="p-2 h-full flex flex-col">
                    <div className="text-[8px] font-bold text-white/70 uppercase tracking-wider mb-0.5">
                      {typeLabel}
                    </div>
                    <div className="text-[10px] font-bold text-white leading-tight">
                      {card.name}
                    </div>
                    {card.text && (
                      <div className="text-[7px] text-white/50 leading-snug mt-0.5 flex-1 overflow-hidden line-clamp-3">
                        {card.text}
                      </div>
                    )}
                    {isSelected && (
                      <div className="text-center text-red-300 text-[10px] font-bold mt-0.5">
                        DISCARD
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 mt-3 justify-center">
          <button
            onClick={handleConfirm}
            disabled={selected.size !== cost}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              selected.size === cost
                ? 'bg-yellow-700 hover:bg-yellow-600 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            Confirm Discard ({selected.size}/{cost})
          </button>
          <button
            onClick={handleCancel}
            className="px-6 py-2 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Pick card from deck/discard
// ---------------------------------------------------------------------------

function ReallocatePick({
  country,
  eligibleCards,
  source,
}: {
  country: Country;
  eligibleCards: { id: string; name: string; type: string; text: string }[];
  source: 'deck' | 'discard';
}) {
  const color = COUNTRY_COLORS[country];

  const handlePick = (cardId: string) => {
    // Move the picked card from deck/discard to hand
    useGameStore.setState((s) => {
      const cs = s.countries[country];
      let newDeck = cs.deck;
      let newDiscard = cs.discard;
      let pickedCard: any = null;

      if (source === 'deck') {
        pickedCard = cs.deck.find((c: any) => c.id === cardId);
        newDeck = cs.deck.filter((c: any) => c.id !== cardId);
        // Shuffle deck after picking
        newDeck = [...newDeck].sort(() => Math.random() - 0.5);
      } else {
        pickedCard = cs.discard.find((c: any) => c.id === cardId);
        newDiscard = cs.discard.filter((c: any) => c.id !== cardId);
      }

      if (!pickedCard) return {};

      return {
        countries: {
          ...s.countries,
          [country]: {
            ...cs,
            hand: [...cs.hand, pickedCard],
            deck: newDeck,
            discard: newDiscard,
          },
        },
        phase: GamePhase.PLAY_STEP,
        log: [
          ...s.log,
          {
            country,
            message: `Reallocate Resources: Searched ${source} and took ${pickedCard.name}`,
            round: s.round,
            timestamp: Date.now(),
          },
        ],
      };
    });

    useTotalWarStore.getState().setPendingTotalWarAction(null);
  };

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-yellow-700/50 rounded-xl p-5 max-w-4xl w-full mx-4 shadow-2xl">
        <div className="text-center mb-3">
          <div className="text-xs uppercase tracking-wider text-yellow-400 mb-1">
            Reallocate Resources — Pick a card from your {source}
          </div>
          <div className="text-sm font-bold" style={{ color }}>
            {COUNTRY_NAMES[country]}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {eligibleCards.length} eligible card{eligibleCards.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="overflow-x-auto pb-2 max-h-[60vh]">
          <div className="flex flex-wrap gap-2 justify-center">
            {eligibleCards.map((card) => {
              const typeColor = CARD_TYPE_COLORS[card.type] ?? '#555';
              const typeLabel = CARD_TYPE_LABELS[card.type] ?? card.type;
              return (
                <div
                  key={card.id}
                  onClick={() => handlePick(card.id)}
                  className="flex-shrink-0 w-[140px] h-[190px] rounded-lg cursor-pointer transition-all border-2 border-transparent hover:border-yellow-400 hover:-translate-y-1 hover:shadow-lg hover:shadow-yellow-400/20"
                  style={{
                    background: `linear-gradient(135deg, ${typeColor} 0%, ${typeColor}cc 100%)`,
                  }}
                >
                  <div className="p-2 h-full flex flex-col">
                    <div className="text-[8px] font-bold text-white/70 uppercase tracking-wider mb-0.5">
                      {typeLabel}
                    </div>
                    <div className="text-[10px] font-bold text-white leading-tight">
                      {card.name}
                    </div>
                    {card.text && (
                      <div className="text-[7px] text-white/50 leading-snug mt-1 flex-1 overflow-hidden line-clamp-5">
                        {card.text}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
