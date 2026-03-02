import React from 'react';
import {
  Card,
  CardType,
  COUNTRY_COLORS,
  COUNTRY_TEXT_ON_BG,
  COUNTRY_NAMES,
  COUNTRY_SHORT,
  Country,
  GamePhase,
  TURN_ORDER,
} from '../game/types';
import { useGameStore } from '../game/store';
import { getCurrentCountry, getStatusAlternativeActions, getCardPlayWarning } from '../game/engine';

const CARD_TYPE_ICONS: Record<CardType, string> = {
  [CardType.BUILD_ARMY]: '⚔',
  [CardType.BUILD_NAVY]: '⚓',
  [CardType.LAND_BATTLE]: '💥',
  [CardType.SEA_BATTLE]: '🌊',
  [CardType.EVENT]: '📜',
  [CardType.STATUS]: '🏛',
  [CardType.ECONOMIC_WARFARE]: '💰',
  [CardType.RESPONSE]: '🛡',
};

const CARD_TYPE_COLORS: Record<CardType, string> = {
  [CardType.BUILD_ARMY]: '#4a7c3f',
  [CardType.BUILD_NAVY]: '#3a5c8c',
  [CardType.LAND_BATTLE]: '#8c3a3a',
  [CardType.SEA_BATTLE]: '#3a6c8c',
  [CardType.EVENT]: '#8c7a3a',
  [CardType.STATUS]: '#6a3a8c',
  [CardType.ECONOMIC_WARFARE]: '#5c5c3a',
  [CardType.RESPONSE]: '#3a5c5c',
};

function CardComponent({
  card,
  isSelected,
  isDiscard,
  isDiscardSelected,
  onClick,
  small,
}: {
  card: Card;
  isSelected?: boolean;
  isDiscard?: boolean;
  isDiscardSelected?: boolean;
  onClick?: () => void;
  small?: boolean;
}) {
  const color = COUNTRY_COLORS[card.country];
  const typeColor = CARD_TYPE_COLORS[card.type];

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-lg cursor-pointer transition-all duration-200 group/card
        ${small ? 'w-28 h-40' : 'w-36 h-52'}
        ${isSelected ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/30 -translate-y-2' : ''}
        ${isDiscardSelected ? 'ring-2 ring-red-500 opacity-60' : ''}
        ${!isSelected && !isDiscardSelected ? 'hover:-translate-y-1 hover:shadow-lg' : ''}
      `}
      style={{
        background: `linear-gradient(135deg, ${typeColor} 0%, ${typeColor}cc 100%)`,
        border: `2px solid ${color}`,
      }}
    >
      <div className="rounded-lg overflow-hidden h-full flex flex-col">
        {/* Country bar */}
        <div
          className="px-2 py-1 text-center"
          style={{ backgroundColor: color }}
        >
          <span
            className="text-[9px] font-bold uppercase tracking-wider"
            style={{ color: COUNTRY_TEXT_ON_BG[card.country] }}
          >
            {COUNTRY_NAMES[card.country]}
          </span>
        </div>

        {/* Card type */}
        <div className="flex items-center gap-1 px-2 pt-1">
          <span className="text-sm">{CARD_TYPE_ICONS[card.type]}</span>
          <span className="text-[8px] font-semibold text-gray-200 uppercase">
            {card.type.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Card name */}
        <div className="px-2 pt-1">
          <p className={`font-display font-bold text-white ${small ? 'text-[10px]' : 'text-xs'} leading-tight`}>
            {card.name}
          </p>
        </div>

        {/* Card text */}
        <div className="px-2 pt-1 flex-1 overflow-y-auto min-h-0">
          <p className={`text-gray-300 ${small ? 'text-[7px]' : 'text-[8px]'} leading-snug`}>
            {card.text}
          </p>
        </div>
      </div>

      {/* Full-text tooltip on hover — outside overflow container */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg bg-[#0A1628] border border-[#1A3A5A] shadow-2xl z-50 hidden group-hover/card:block pointer-events-none">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-sm">{CARD_TYPE_ICONS[card.type]}</span>
          <span className="text-[10px] font-semibold text-gray-400 uppercase">
            {card.type.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="font-display font-bold text-sm leading-tight mb-1.5" style={{ color }}>
          {card.name}
        </div>
        <p className="text-[11px] text-gray-300 leading-relaxed">{card.text}</p>
      </div>

      {/* Discard overlay */}
      {isDiscardSelected && (
        <div className="absolute inset-0 rounded-lg bg-red-900/40 flex items-center justify-center">
          <span className="text-red-300 font-bold text-xs">DISCARD</span>
        </div>
      )}
    </div>
  );
}

function ResponsePrompt() {
  const state = useGameStore();
  const respondToOpportunity = useGameStore((s) => s.respondToOpportunity);
  const pa = state.pendingAction;

  if (state.phase !== GamePhase.AWAITING_RESPONSE || !pa) return null;

  if (pa.type === 'RESPONSE_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;

    const responderColor = COUNTRY_COLORS[responder];
    const spaceName = pa.battleSpaceId.replace(/_/g, ' ');

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-yellow-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Response Opportunity</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Activate <strong className="text-yellow-400">{pa.responseCardName}</strong> to protect
              piece in <strong className="text-yellow-400">{spaceName}</strong>?
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-green-700 text-white text-sm font-bold hover:bg-green-600 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'OFFENSIVE_RESPONSE_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;

    const responderColor = COUNTRY_COLORS[responder];

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-green-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Response Opportunity</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Activate <strong className="text-yellow-400">{pa.responseCardName}</strong>?{' '}
              <span className="text-green-400">{pa.description}</span>
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-green-700 text-white text-sm font-bold hover:bg-green-600 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'EW_CANCEL_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-blue-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Cancel EW</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Activate <strong className="text-yellow-400">{pa.responseCardName}</strong> to cancel <strong className="text-red-400">{pa.ewCard.name}</strong>?
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-red-700 text-white text-sm font-bold hover:bg-red-600 transition-colors"
            >
              Cancel EW
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Allow
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'EW_COUNTER_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-blue-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">EW Counter</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Activate <strong className="text-yellow-400">{pa.responseCardName}</strong> to draw a card and counter Economic Warfare?
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-blue-700 text-white text-sm font-bold hover:bg-blue-600 transition-colors"
            >
              Counter
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'BUILD_REACTION_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-red-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Build Reaction</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Activate <strong className="text-yellow-400">{pa.responseCardName}</strong>?{' '}
              <span className="text-red-400">{pa.description}</span>
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-red-700 text-white text-sm font-bold hover:bg-red-600 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'BEGINNING_TURN_RESPONSE') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-red-900/60 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Beginning of Turn</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Activate <strong className="text-yellow-400">{pa.responseCardName}</strong>?{' '}
              <span className="text-red-300">{pa.description}</span>
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-red-900 text-white text-sm font-bold hover:bg-red-700 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'BATTLE_REACTION_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-orange-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Battle Reaction</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Activate <strong className="text-yellow-400">{pa.responseCardName}</strong>?{' '}
              <span className="text-orange-400">{pa.description}</span>
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-orange-700 text-white text-sm font-bold hover:bg-orange-600 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'ALLY_REINFORCEMENT_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-green-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Reinforcement</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Activate <strong className="text-yellow-400">{pa.responseCardName}</strong>?{' '}
              <span className="text-green-400">{pa.description}</span>
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-green-700 text-white text-sm font-bold hover:bg-green-600 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'CARD_CANCEL_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-purple-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Card Cancellation</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Activate <strong className="text-yellow-400">{pa.responseCardName}</strong> to cancel Germany's{' '}
              <strong className="text-red-400">{pa.cancelledCardName}</strong>?
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-purple-700 text-white text-sm font-bold hover:bg-purple-600 transition-colors"
            >
              Cancel Card
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Allow
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'STATUS_ABILITY_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-amber-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Status Ability</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Use <strong className="text-yellow-400">{pa.statusCardName}</strong>?{' '}
              <span className="text-amber-400">{pa.description}</span>
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-amber-700 text-white text-sm font-bold hover:bg-amber-600 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'BUSHIDO_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];
    const spaceName = pa.battleSpaceId.replace(/_/g, ' ');

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-red-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Bushido</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Your army in <strong className="text-yellow-400">{spaceName}</strong> is being eliminated.
              Use <strong className="text-yellow-400">{pa.statusCardName}</strong> to battle an adjacent
              space first? <span className="text-gray-500">(costs top deck card)</span>
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-red-700 text-white text-sm font-bold hover:bg-red-600 transition-colors"
            >
              Battle!
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'ISLAND_DEFENSE_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];
    const spaceName = pa.battleSpaceId.replace(/_/g, ' ');

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-cyan-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Island Hopping Defense</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Your navy in <strong className="text-yellow-400">{spaceName}</strong> is adjacent to an
              island. Use <strong className="text-yellow-400">{pa.statusCardName}</strong> to protect
              it? <span className="text-gray-500">(costs top deck card)</span>
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-cyan-700 text-white text-sm font-bold hover:bg-cyan-600 transition-colors"
            >
              Protect
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'COUNTER_OFFENSIVE_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];
    const spaceName = pa.eliminatedSpaceId.replace(/_/g, ' ');

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-red-600/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Counter-Offensive</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              An Axis army was eliminated in <strong className="text-yellow-400">{spaceName}</strong>.
              Use <strong className="text-yellow-400">{pa.statusCardName}</strong> to recruit a Soviet
              army in an adjacent space?
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-red-800 text-white text-sm font-bold hover:bg-red-700 transition-colors"
            >
              Recruit
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'ARSENAL_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];
    const targetName = COUNTRY_NAMES[pa.targetCountry];

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-blue-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Arsenal of Democracy</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              <strong className="text-yellow-400">{targetName}</strong> discarded cards.
              Use <strong className="text-yellow-400">{pa.statusCardName}</strong> to help them draw
              an extra card? <span className="text-gray-500">(costs 1 US card)</span>
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-blue-700 text-white text-sm font-bold hover:bg-blue-600 transition-colors"
            >
              Aid Ally
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pa.type === 'ENIGMA_OPPORTUNITY') {
    const responder = pa.responseCountry;
    if (!state.countries[responder]?.isHuman) return null;
    const responderColor = COUNTRY_COLORS[responder];

    return (
      <div className="bg-[#0A1628]/95 backdrop-blur rounded-t-xl border-t border-cyan-500/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: responderColor }} />
            <div>
              <span className="text-sm font-display font-bold" style={{ color: responderColor }}>
                {COUNTRY_NAMES[responder]}
              </span>
              <span className="text-xs text-gray-400 ml-2">Enigma</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">
              Germany used <strong className="text-red-400">{pa.germanStatusCardName}</strong>.
              Use <strong className="text-yellow-400">{pa.enigmaCardName}</strong> to discard it permanently?
            </span>
            <button
              onClick={() => respondToOpportunity(true)}
              className="px-4 py-1.5 rounded bg-cyan-700 text-white text-sm font-bold hover:bg-cyan-600 transition-colors"
            >
              Discard Status
            </button>
            <button
              onClick={() => respondToOpportunity(false)}
              className="px-4 py-1.5 rounded bg-gray-700 text-gray-300 text-sm font-bold hover:bg-gray-600 transition-colors"
            >
              Save for Later
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function EWTargetPrompt() {
  const state = useGameStore();
  const selectEWTarget = useGameStore((s) => s.selectEWTarget);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_EW_TARGET') return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-yellow-400">
        💰 Choose a target for {pa.ewCard.name}:
      </span>
      {pa.validTargets.map((target) => (
        <button
          key={target}
          onClick={() => selectEWTarget(target)}
          className="px-3 py-1 rounded text-xs font-bold border transition-colors hover:brightness-125"
          style={{
            borderColor: COUNTRY_COLORS[target],
            color: COUNTRY_COLORS[target],
            backgroundColor: COUNTRY_COLORS[target] + '20',
          }}
        >
          {COUNTRY_NAMES[target]}
        </button>
      ))}
    </div>
  );
}

function LendLeaseTargetPrompt() {
  const state = useGameStore();
  const selectTarget = useGameStore((s) => s.selectLendLeaseTarget);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_LEND_LEASE_TARGET') return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-yellow-400">
        Choose an ally for Lend Lease:
      </span>
      {pa.validTargets.map((target) => (
        <button
          key={target}
          onClick={() => selectTarget(target)}
          className="px-3 py-1 rounded text-xs font-bold border transition-colors hover:brightness-125"
          style={{
            borderColor: COUNTRY_COLORS[target],
            color: COUNTRY_COLORS[target],
            backgroundColor: COUNTRY_COLORS[target] + '20',
          }}
        >
          {COUNTRY_NAMES[target]}
        </button>
      ))}
    </div>
  );
}

function EventChoicePrompt() {
  const state = useGameStore();
  const selectEventChoice = useGameStore((s) => s.selectEventChoice);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_EVENT_CHOICE') return null;

  const effectIcons: Record<string, string> = {
    BUILD_ARMY: '🪖',
    BUILD_NAVY: '⚓',
    LAND_BATTLE: '⚔️',
    SEA_BATTLE: '🌊',
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-yellow-400">
        Choose an action for {pa.eventCard.name}:
      </span>
      {pa.choices.map((choice) => (
        <button
          key={choice.effectType}
          onClick={() => selectEventChoice(choice.effectType)}
          disabled={!choice.available}
          className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
            choice.available
              ? 'border-yellow-500 text-yellow-300 bg-yellow-500/20 hover:bg-yellow-500/40 cursor-pointer'
              : 'border-gray-600 text-gray-500 bg-gray-800/50 cursor-not-allowed opacity-50'
          }`}
        >
          {effectIcons[choice.effectType] ?? ''} {choice.label}
        </button>
      ))}
    </div>
  );
}

function EventSpacePrompt() {
  const state = useGameStore();
  const skipEventEffect = useGameStore((s) => s.skipEventEffect);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_EVENT_SPACE') return null;

  const actionLabels: Record<string, string> = {
    recruit_army: 'recruit army',
    recruit_navy: 'recruit navy',
    build_army: 'build army',
    build_navy: 'build navy',
    land_battle: 'battle',
    sea_battle: 'battle',
    eliminate_army: 'eliminate army',
    eliminate_navy: 'eliminate navy',
  };
  const label = actionLabels[pa.effectAction] ?? pa.effectAction;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-yellow-400 animate-pulse">
        {pa.eventCardName}: Click a highlighted space to {label}
        {pa.remaining > 1 ? ` (${pa.remaining} remaining)` : ''}
      </span>
      {pa.skippable && (
        <button
          onClick={() => skipEventEffect()}
          className="px-3 py-1 rounded text-xs font-bold border border-gray-500 text-gray-300 bg-gray-700/50 hover:bg-gray-600/60 transition-colors"
        >
          Done
        </button>
      )}
    </div>
  );
}

function MaltaChoicePrompt() {
  const state = useGameStore();
  const resolveMaltaChoice = useGameStore((s) => s.resolveMaltaChoice);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_MALTA_CHOICE') return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-yellow-400 animate-pulse">
        Malta Submarines: {COUNTRY_NAMES[pa.targetCountry]} must choose
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => resolveMaltaChoice('eliminate_navy')}
          className="px-3 py-1 rounded text-xs font-bold border border-red-500 text-red-300 bg-red-900/40 hover:bg-red-800/60 transition-colors"
        >
          Eliminate Navy in Mediterranean
        </button>
        <button
          onClick={() => resolveMaltaChoice('discard_cards')}
          className="px-3 py-1 rounded text-xs font-bold border border-amber-500 text-amber-300 bg-amber-900/40 hover:bg-amber-800/60 transition-colors"
        >
          Discard 2 cards from deck
        </button>
      </div>
    </div>
  );
}

function RecruitLocationPrompt() {
  const state = useGameStore();
  const skipRemainingRecruits = useGameStore((s) => s.skipRemainingRecruits);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_RECRUIT_LOCATION') return null;

  const total = pa.remaining;
  const isBotAction = pa.botContinuation;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-yellow-400 animate-pulse">
        {pa.eventCardName}: Click a highlighted space to recruit {pa.pieceType}
        {!isBotAction && ` (${total} remaining)`}
      </span>
      <button
        onClick={() => skipRemainingRecruits()}
        className="px-3 py-1 rounded text-xs font-bold border border-gray-500 text-gray-300 bg-gray-700/50 hover:bg-gray-600/60 transition-colors"
      >
        {isBotAction ? 'Skip' : 'Done'}
      </button>
    </div>
  );
}

function RosieCardPrompt() {
  const state = useGameStore();
  const resolveRosieSelection = useGameStore((s) => s.resolveRosieSelection);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_ROSIE_CARDS') return null;

  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const toggle = (cardId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else if (next.size < pa.maxCards) {
        next.add(cardId);
      }
      return next;
    });
  };

  const typeLabel = (type: CardType) => {
    switch (type) {
      case CardType.BUILD_ARMY: return 'Build Army';
      case CardType.BUILD_NAVY: return 'Build Navy';
      case CardType.LAND_BATTLE: return 'Land Battle';
      case CardType.SEA_BATTLE: return 'Sea Battle';
      case CardType.STATUS: return 'Status';
      case CardType.RESPONSE: return 'Response';
      case CardType.EVENT: return 'Event';
      case CardType.ECONOMIC_WARFARE: return 'Econ Warfare';
      default: return String(type);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-yellow-400">
        Rosie the Riveter: Select {pa.minCards}–{pa.maxCards} card(s) to return to the bottom of your deck
      </span>
      <div className="flex gap-2 flex-wrap">
        {pa.handCards.map((card) => (
          <button
            key={card.id}
            onClick={() => toggle(card.id)}
            className={`px-3 py-2 rounded text-xs border transition-colors text-left ${
              selected.has(card.id)
                ? 'border-yellow-400 bg-yellow-500/30 text-yellow-200 ring-1 ring-yellow-400'
                : 'border-gray-600 bg-gray-800/60 text-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="font-bold">{card.name}</div>
            <div className="text-[10px] opacity-70">{typeLabel(card.type)}</div>
          </button>
        ))}
      </div>
      <button
        onClick={() => resolveRosieSelection(Array.from(selected))}
        disabled={selected.size < pa.minCards}
        className={`px-4 py-1.5 rounded text-xs font-bold border transition-colors self-start ${
          selected.size >= pa.minCards
            ? 'border-green-500 text-green-300 bg-green-500/20 hover:bg-green-500/40 cursor-pointer'
            : 'border-gray-600 text-gray-500 bg-gray-800/50 cursor-not-allowed opacity-50'
        }`}
      >
        Confirm ({selected.size} selected)
      </button>
    </div>
  );
}

function RationingPrompt() {
  const state = useGameStore();
  const resolveRationingChoice = useGameStore((s) => s.resolveRationingChoice);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'RATIONING_OPPORTUNITY') return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-yellow-400">
        Rationing: Shuffle <strong>{pa.playedCard.name}</strong> back into your draw deck instead of discarding it?
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => resolveRationingChoice(true)}
          className="px-4 py-1.5 rounded text-xs font-bold border border-green-500 text-green-300 bg-green-500/20 hover:bg-green-500/40 transition-colors"
        >
          Yes, shuffle into deck
        </button>
        <button
          onClick={() => resolveRationingChoice(false)}
          className="px-4 py-1.5 rounded text-xs font-bold border border-red-500 text-red-300 bg-red-500/20 hover:bg-red-500/40 transition-colors"
        >
          No, discard normally
        </button>
      </div>
    </div>
  );
}

function HandDiscardPrompt() {
  const state = useGameStore();
  const confirmHandDiscard = useGameStore((s) => s.confirmHandDiscard);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_HAND_DISCARD') return null;

  const country = getCurrentCountry(state);
  const hand = state.countries[country].hand;
  const statusCard = state.countries[country].statusCards.find((c) => c.id === pa.statusCardId);
  const cardName = statusCard?.name ?? 'Status card';

  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const toggle = (cardId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else if (next.size < pa.count) {
        next.add(cardId);
      }
      return next;
    });
  };

  const typeLabel = (type: CardType) => {
    switch (type) {
      case CardType.BUILD_ARMY: return 'Build Army';
      case CardType.BUILD_NAVY: return 'Build Navy';
      case CardType.LAND_BATTLE: return 'Land Battle';
      case CardType.SEA_BATTLE: return 'Sea Battle';
      case CardType.STATUS: return 'Status';
      case CardType.RESPONSE: return 'Response';
      case CardType.EVENT: return 'Event';
      case CardType.ECONOMIC_WARFARE: return 'Econ Warfare';
      default: return String(type);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-yellow-400">
        {cardName}: Select {pa.count} card(s) from your hand to discard
      </span>
      <div className="flex gap-2 flex-wrap">
        {hand.map((card) => (
          <button
            key={card.id}
            onClick={() => toggle(card.id)}
            className={`px-3 py-2 rounded text-xs border transition-colors text-left ${
              selected.has(card.id)
                ? 'border-red-400 bg-red-500/30 text-red-200 ring-1 ring-red-400'
                : 'border-gray-600 bg-gray-800/60 text-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="font-bold">{card.name}</div>
            <div className="text-[10px] opacity-70">{typeLabel(card.type)}</div>
          </button>
        ))}
      </div>
      <button
        onClick={() => confirmHandDiscard(Array.from(selected))}
        disabled={selected.size < pa.count}
        className={`px-4 py-1.5 rounded text-xs font-bold border transition-colors self-start ${
          selected.size >= pa.count
            ? 'border-green-500 text-green-300 bg-green-500/20 hover:bg-green-500/40 cursor-pointer'
            : 'border-gray-600 text-gray-500 bg-gray-800/50 cursor-not-allowed opacity-50'
        }`}
      >
        Confirm Discard ({selected.size}/{pa.count})
      </button>
    </div>
  );
}

function RedeployPrompt() {
  const state = useGameStore();
  const confirmRedeploy = useGameStore((s) => s.confirmRedeploy);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_PIECE_TO_REDEPLOY') return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-yellow-400">
        No {pa.pieceType === 'army' ? 'armies' : 'navies'} in reserve — choose which {pa.pieceType} to remove (you'll pick a new location next):
      </span>
      <div className="flex gap-2 flex-wrap">
        {pa.piecesOnBoard.map((p) => (
          <button
            key={p.pieceId}
            onClick={() => confirmRedeploy(p.pieceId)}
            className="px-3 py-2 rounded text-xs border border-orange-500 bg-orange-500/20 text-orange-300 hover:bg-orange-500/40 transition-colors cursor-pointer text-left"
          >
            <div className="font-bold">{p.spaceName}</div>
            <div className="text-[10px] opacity-70">{pa.pieceType === 'army' ? 'Army' : 'Navy'}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BattlePiecePrompt() {
  const state = useGameStore();
  const selectBattlePiece = useGameStore((s) => s.selectBattlePiece);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_BATTLE_PIECE') return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-yellow-400">
        Multiple enemy pieces in <strong>{pa.spaceName}</strong> — choose which to eliminate:
      </span>
      <div className="flex gap-2 flex-wrap">
        {pa.eligiblePieces.map((p) => (
          <button
            key={p.pieceId}
            onClick={() => selectBattlePiece(p.pieceId)}
            className="px-3 py-2 rounded text-xs border border-red-500 bg-red-500/20 text-red-300 hover:bg-red-500/40 transition-colors cursor-pointer text-left"
            style={{ borderColor: COUNTRY_COLORS[p.country] }}
          >
            <div className="font-bold" style={{ color: COUNTRY_COLORS[p.country] }}>
              {COUNTRY_SHORT[p.country]}
            </div>
            <div className="text-[10px] opacity-80">{COUNTRY_NAMES[p.country]}</div>
            <div className="text-[10px] opacity-70">{p.pieceType === 'army' ? '⚔ Army' : '⚓ Navy'}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MovePiecePrompt() {
  const state = useGameStore();
  const selectMovePiece = useGameStore((s) => s.selectMovePiece);
  const skipMovePieces = useGameStore((s) => s.skipMovePieces);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_MOVE_PIECE') return null;

  const pieceLabel = pa.pieceTypeFilter === 'army' ? 'armies' : pa.pieceTypeFilter === 'navy' ? 'navies' : 'pieces';

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-cyan-400">
        {pa.eventCardName}: Select a piece to move (eliminate & rebuild). {pa.movedPieceIds.length > 0 ? `Moved ${pa.movedPieceIds.length} so far.` : `Choose ${pieceLabel} one at a time.`}
      </span>
      <div className="flex gap-2 flex-wrap">
        {pa.eligiblePieces.map((p) => (
          <button
            key={p.pieceId}
            onClick={() => selectMovePiece(p.pieceId)}
            className="px-3 py-2 rounded text-xs border border-cyan-500 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40 transition-colors cursor-pointer text-left"
          >
            <div className="font-bold">{p.spaceName}</div>
            <div className="text-[10px] opacity-70">{p.pieceType === 'army' ? 'Army' : 'Navy'}</div>
          </button>
        ))}
      </div>
      <button
        onClick={skipMovePieces}
        className="px-4 py-2 rounded text-xs border border-gray-500 bg-gray-500/20 text-gray-300 hover:bg-gray-500/40 transition-colors cursor-pointer self-start"
      >
        Done — stop moving
      </button>
    </div>
  );
}

function MoveDestinationPrompt() {
  const state = useGameStore();
  const skipMovePieces = useGameStore((s) => s.skipMovePieces);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_MOVE_DESTINATION') return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-cyan-400">
        {pa.eventCardName}: Removed {pa.pieceType} from {pa.removedFromSpaceName}. Click a highlighted space to place it.
      </span>
      <button
        onClick={skipMovePieces}
        className="px-4 py-2 rounded text-xs border border-red-500 bg-red-500/20 text-red-300 hover:bg-red-500/40 transition-colors cursor-pointer self-start"
      >
        Cancel — return piece to {pa.removedFromSpaceName}
      </button>
    </div>
  );
}

function RecruitCountryPrompt() {
  const state = useGameStore();
  const confirmRecruitCountry = useGameStore((s) => s.confirmRecruitCountry);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_RECRUIT_COUNTRY') return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-yellow-400">
        {pa.eventCardName}: Choose which country's army to recruit
      </span>
      <div className="flex gap-2">
        {pa.validCountries.map((c) => (
          <button
            key={c}
            onClick={() => confirmRecruitCountry(c)}
            className="px-4 py-2 rounded text-sm font-bold border border-blue-500 bg-blue-500/20 text-blue-300 hover:bg-blue-500/40 transition-colors cursor-pointer"
          >
            {COUNTRY_NAMES[c]} Army
          </button>
        ))}
      </div>
    </div>
  );
}

function OffensiveHandDiscardPrompt() {
  const state = useGameStore();
  const confirmOffensiveHandDiscard = useGameStore((s) => s.confirmOffensiveHandDiscard);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_OFFENSIVE_HAND_DISCARD') return null;

  const country = getCurrentCountry(state);
  const hand = state.countries[country].hand;
  const statusCard = state.countries[country].statusCards.find((c) => c.id === pa.offensiveCardId);
  const cardName = statusCard?.name ?? 'Status card';

  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const toggle = (cardId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else if (next.size < pa.count) {
        next.add(cardId);
      }
      return next;
    });
  };

  const typeLabel = (type: CardType) => {
    switch (type) {
      case CardType.BUILD_ARMY: return 'Build Army';
      case CardType.BUILD_NAVY: return 'Build Navy';
      case CardType.LAND_BATTLE: return 'Land Battle';
      case CardType.SEA_BATTLE: return 'Sea Battle';
      case CardType.STATUS: return 'Status';
      case CardType.RESPONSE: return 'Response';
      case CardType.EVENT: return 'Event';
      case CardType.ECONOMIC_WARFARE: return 'Econ Warfare';
      default: return String(type);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-yellow-400">
        {cardName}: Select {pa.count} card(s) from your hand to discard
      </span>
      <div className="flex gap-2 flex-wrap">
        {hand.map((card) => (
          <button
            key={card.id}
            onClick={() => toggle(card.id)}
            className={`px-3 py-2 rounded text-xs border transition-colors text-left ${
              selected.has(card.id)
                ? 'border-red-400 bg-red-500/30 text-red-200 ring-1 ring-red-400'
                : 'border-gray-600 bg-gray-800/60 text-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="font-bold">{card.name}</div>
            <div className="text-[10px] opacity-70">{typeLabel(card.type)}</div>
          </button>
        ))}
      </div>
      <button
        onClick={() => confirmOffensiveHandDiscard(Array.from(selected))}
        disabled={selected.size < pa.count}
        className={`px-4 py-1.5 rounded text-xs font-bold border transition-colors self-start ${
          selected.size >= pa.count
            ? 'border-green-500 text-green-300 bg-green-500/20 hover:bg-green-500/40 cursor-pointer'
            : 'border-gray-600 text-gray-500 bg-gray-800/50 cursor-not-allowed opacity-50'
        }`}
      >
        Confirm Discard ({selected.size}/{pa.count})
      </button>
    </div>
  );
}

function ReorderCardsPrompt() {
  const state = useGameStore();
  const resolveReorderCards = useGameStore((s) => s.resolveReorderCards);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'REORDER_CARDS') return null;

  const [order, setOrder] = React.useState<string[]>(pa.cards.map((c) => c.id));
  const orderedCards = order.map((id) => pa.cards.find((c) => c.id === id)!);

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setOrder(next);
  };
  const moveDown = (idx: number) => {
    if (idx === order.length - 1) return;
    const next = [...order];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setOrder(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-yellow-400">
        {pa.statusCardName} — Examine your top {pa.cards.length} cards. Reorder them (top = drawn first):
      </span>
      <div className="flex gap-2 items-start flex-wrap">
        {orderedCards.map((card, i) => (
          <div key={card.id} className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] text-gray-400 font-mono">#{i + 1}</span>
            <CardComponent card={card} small />
            <div className="flex gap-1 mt-0.5">
              <button
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white"
              >
                ▲
              </button>
              <button
                onClick={() => moveDown(i)}
                disabled={i === order.length - 1}
                className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white"
              >
                ▼
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => resolveReorderCards(order)}
        className="px-4 py-1.5 rounded text-sm font-bold bg-board-supply text-gray-900 hover:bg-yellow-500 w-fit"
      >
        Confirm Order
      </button>
    </div>
  );
}

function DiscardPickerPrompt() {
  const state = useGameStore();
  const selectFromDiscard = useGameStore((s) => s.selectFromDiscard);
  const pa = state.pendingAction;
  if (!pa || pa.type !== 'SELECT_FROM_DISCARD') return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-yellow-400">
        📜 Flexible Resources — Pick a card from your discard pile to play:
      </span>
      <div className="flex gap-2 flex-wrap max-h-60 overflow-y-auto">
        {pa.discardCards.map((card) => (
          <CardComponent
            key={card.id}
            card={card}
            small
            onClick={() => selectFromDiscard(card.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SetupDiscardPanel() {
  const state = useGameStore();
  const confirmSetupDiscard = useGameStore((s) => s.confirmSetupDiscard);
  const toggleCardForDiscard = useGameStore((s) => s.toggleCardForDiscard);
  const { selectedDiscards } = state;

  const idx = (state as { setupDiscardCountryIndex: number }).setupDiscardCountryIndex ?? 0;
  const country = TURN_ORDER[idx];
  const countryState = state.countries[country];
  if (!countryState || !countryState.isHuman) return null;

  const { hand } = countryState;
  const color = COUNTRY_COLORS[country];

  const handleConfirm = () => {
    const ids = Array.from(selectedDiscards);
    if (ids.length === 3) {
      confirmSetupDiscard(ids);
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
            — Select 3 cards to discard from your initial hand of {hand.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {selectedDiscards.size}/3 selected
          </span>
          <button
            onClick={handleConfirm}
            disabled={selectedDiscards.size !== 3}
            className={`px-4 py-1.5 rounded text-sm font-bold transition-colors ${
              selectedDiscards.size === 3
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
          {hand.map((card) => (
            <div key={card.id} className="flex-shrink-0">
              <CardComponent
                card={card}
                isDiscardSelected={selectedDiscards.has(card.id)}
                onClick={() => toggleCardForDiscard(card.id)}
                small
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CardHand() {
  const [showDiscard, setShowDiscard] = React.useState(false);
  const state = useGameStore();
  const selectCard = useGameStore((s) => s.selectCard);
  const playSelectedCard = useGameStore((s) => s.playSelectedCard);
  const confirmDiscardStep = useGameStore((s) => s.confirmDiscardStep);
  const toggleCardForDiscard = useGameStore((s) => s.toggleCardForDiscard);
  const useAlternativeAction = useGameStore((s) => s.useAlternativeAction);
  const skipPlayStep = useGameStore((s) => s.skipPlayStep);

  if (state.phase === GamePhase.SETUP_DISCARD) {
    return <SetupDiscardPanel />;
  }

  if (
    state.phase === GamePhase.AWAITING_RESPONSE &&
    state.pendingAction &&
    'responseCountry' in state.pendingAction &&
    state.countries[(state.pendingAction as { responseCountry: Country }).responseCountry]?.isHuman
  ) {
    return <ResponsePrompt />;
  }

  const currentCountry = getCurrentCountry(state);
  const countryState = state.countries[currentCountry];
  if (!countryState) return null;

  const isHuman = countryState.isHuman;
  if (!isHuman) return null;

  const { hand, statusCards, responseCards } = countryState;
  const { phase, selectedCard, selectedDiscards } = state;

  const isPlayStep = phase === GamePhase.PLAY_STEP && !state.pendingAction;
  const isDiscardStep = phase === GamePhase.DISCARD_STEP;

  const handleCardClick = (card: Card, index: number) => {
    if (isPlayStep) {
      if (selectedCard?.id === card.id) {
        playSelectedCard();
      } else {
        selectCard(card);
      }
    }
    if (isDiscardStep) {
      toggleCardForDiscard(card.id);
    }
  };

  const handleConfirmDiscard = () => {
    const indices = hand
      .map((c, i) => (selectedDiscards.has(c.id) ? i : -1))
      .filter((i) => i >= 0);
    confirmDiscardStep(indices);
  };

  return (
    <div className="bg-[#0A1628]/90 backdrop-blur rounded-t-xl border-t border-[#1A3A5A] p-3">
      {/* Status / Response cards on table */}
      {(statusCards.length > 0 || responseCards.length > 0) && (
        <div className="mb-2 flex gap-1 items-center">
          <span className="text-[10px] text-gray-500 mr-2 uppercase tracking-wider">On Table:</span>
          {statusCards.map((c) => (
            <div
              key={c.id}
              className="px-2 py-0.5 rounded text-[9px] font-medium cursor-help relative group"
              style={{ backgroundColor: COUNTRY_COLORS[c.country] + '40', color: COUNTRY_COLORS[c.country] }}
              title={c.text}
            >
              {c.name}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 p-2 rounded bg-[#0A1628] border border-[#1A3A5A] text-[10px] text-gray-300 leading-snug shadow-xl z-50 hidden group-hover:block pointer-events-none">
                <div className="font-semibold mb-0.5" style={{ color: COUNTRY_COLORS[c.country] }}>{c.name}</div>
                {c.text}
              </div>
            </div>
          ))}
          {responseCards.map((c) => (
            <div
              key={c.id}
              className="px-2 py-0.5 rounded text-[9px] font-medium cursor-help relative group"
              style={{ backgroundColor: '#3a5c5c40', color: '#7ab8b8' }}
            >
              🛡 {c.name}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 p-2 rounded bg-[#0A1628] border border-[#1A3A5A] text-[10px] text-gray-300 leading-snug shadow-xl z-50 hidden group-hover:block pointer-events-none">
                <div className="font-semibold mb-0.5" style={{ color: '#7ab8b8' }}>{c.name}</div>
                {c.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-display font-bold"
            style={{ color: COUNTRY_COLORS[currentCountry] }}
          >
            {COUNTRY_NAMES[currentCountry]}
          </span>
          <span className="text-xs text-gray-400">
            {hand.length} cards in hand
          </span>
          <button
            onClick={() => setShowDiscard((v) => !v)}
            className="px-2 py-0.5 rounded text-[10px] font-medium border border-gray-600/40 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            {showDiscard ? 'Hide' : 'View'} Discard ({countryState.discard.length})
          </button>
        </div>

        {isPlayStep && (
          <div className="flex items-center gap-2">
            {getStatusAlternativeActions(currentCountry, state).map((alt) => (
              <button
                key={alt.card.id}
                onClick={() => useAlternativeAction(alt.card.id)}
                className="px-3 py-1.5 rounded bg-amber-800/60 text-amber-200 text-[11px] font-bold hover:bg-amber-700 transition-colors border border-amber-600/40"
                title={alt.description}
              >
                {alt.card.name}
              </button>
            ))}
            {selectedCard && (() => {
              const warning = getCardPlayWarning(selectedCard, state);
              return (
                <>
                  {warning && (
                    <span className="text-[11px] text-red-400 font-medium animate-pulse">
                      ⚠ {warning}
                    </span>
                  )}
                  <button
                    onClick={playSelectedCard}
                    className={`px-4 py-1.5 rounded text-sm font-bold transition-colors ${
                      warning
                        ? 'bg-red-900/60 text-red-300 hover:bg-red-800 border border-red-600/40'
                        : 'bg-board-supply text-gray-900 hover:bg-yellow-500'
                    }`}
                  >
                    Play {selectedCard.name}
                  </button>
                </>
              );
            })()}
            <button
              onClick={skipPlayStep}
              className="px-3 py-1.5 rounded bg-gray-700/70 text-gray-300 text-[11px] font-bold hover:bg-gray-600 transition-colors border border-gray-600/40"
              title="Skip your play step without playing a card"
            >
              {hand.length === 0 ? 'No Cards (Pass)' : 'Pass Turn'}
            </button>
          </div>
        )}

        {isDiscardStep && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              Select cards to discard (optional), then confirm
            </span>
            <button
              onClick={handleConfirmDiscard}
              className="px-4 py-1.5 rounded bg-board-supply text-gray-900 text-sm font-bold hover:bg-yellow-500 transition-colors"
            >
              {selectedDiscards.size === 0 ? 'Skip Discard' : `Discard ${selectedDiscards.size} Card${selectedDiscards.size > 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_EW_TARGET' && (
          <EWTargetPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_LEND_LEASE_TARGET' && (
          <LendLeaseTargetPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_EVENT_CHOICE' && (
          <EventChoicePrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_FROM_DISCARD' && (
          <DiscardPickerPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'REORDER_CARDS' && (
          <ReorderCardsPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_ROSIE_CARDS' && (
          <RosieCardPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_RECRUIT_LOCATION' && (
          <RecruitLocationPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_EVENT_SPACE' && (
          <EventSpacePrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_MALTA_CHOICE' && (
          <MaltaChoicePrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_HAND_DISCARD' && (
          <HandDiscardPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_OFFENSIVE_HAND_DISCARD' && (
          <OffensiveHandDiscardPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_PIECE_TO_REDEPLOY' && (
          <RedeployPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_RECRUIT_COUNTRY' && (
          <RecruitCountryPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'RATIONING_OPPORTUNITY' && (
          <RationingPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_MOVE_PIECE' && (
          <MovePiecePrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_MOVE_DESTINATION' && (
          <MoveDestinationPrompt />
        )}

        {state.pendingAction && state.pendingAction.type === 'SELECT_BATTLE_PIECE' && (
          <BattlePiecePrompt />
        )}

        {state.pendingAction && state.pendingAction.type !== 'RESPONSE_OPPORTUNITY' && state.pendingAction.type !== 'SELECT_EW_TARGET' && state.pendingAction.type !== 'SELECT_LEND_LEASE_TARGET' && state.pendingAction.type !== 'SELECT_EVENT_CHOICE' && state.pendingAction.type !== 'SELECT_FROM_DISCARD' && state.pendingAction.type !== 'REORDER_CARDS' && state.pendingAction.type !== 'SELECT_ROSIE_CARDS' && state.pendingAction.type !== 'SELECT_RECRUIT_LOCATION' && state.pendingAction.type !== 'SELECT_EVENT_SPACE' && state.pendingAction.type !== 'SELECT_MALTA_CHOICE' && state.pendingAction.type !== 'SELECT_HAND_DISCARD' && state.pendingAction.type !== 'SELECT_OFFENSIVE_HAND_DISCARD' && state.pendingAction.type !== 'SELECT_PIECE_TO_REDEPLOY' && state.pendingAction.type !== 'SELECT_RECRUIT_COUNTRY' && state.pendingAction.type !== 'RATIONING_OPPORTUNITY' && state.pendingAction.type !== 'ENIGMA_OPPORTUNITY' && state.pendingAction.type !== 'SELECT_MOVE_PIECE' && state.pendingAction.type !== 'SELECT_MOVE_DESTINATION' && state.pendingAction.type !== 'BEGINNING_TURN_RESPONSE' && state.pendingAction.type !== 'SELECT_BATTLE_PIECE' && (
          <span className="text-xs text-yellow-400 animate-pulse">
            {state.pendingAction.type === 'SELECT_BUILD_LOCATION'
              ? `Click a highlighted space to build ${state.pendingAction.pieceType}`
              : state.pendingAction.type === 'SELECT_BATTLE_TARGET'
              ? 'Click a highlighted space to battle'
              : 'Resolve action...'}
          </span>
        )}
      </div>

      {/* Discard pile viewer */}
      {showDiscard && (
        <div className="mb-2 border border-gray-700/50 rounded-lg p-2 bg-[#0D1B2A]/80">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">
              Discard Pile ({countryState.discard.length} cards)
            </span>
            <button
              onClick={() => setShowDiscard(false)}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              Close
            </button>
          </div>
          <div className="overflow-x-auto">
            <div className="flex gap-2 w-fit min-w-0">
              {countryState.discard.map((card) => (
                <div key={card.id} className="flex-shrink-0 opacity-75">
                  <CardComponent card={card} small />
                </div>
              ))}
              {countryState.discard.length === 0 && (
                <span className="text-gray-600 text-xs py-4">Discard pile is empty</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hand */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-2 w-fit mx-auto min-w-0">
          {hand.map((card, i) => (
            <div key={card.id} className="flex-shrink-0">
              <CardComponent
                card={card}
                isSelected={selectedCard?.id === card.id}
                isDiscardSelected={selectedDiscards.has(card.id)}
                onClick={() => handleCardClick(card, i)}
                small
              />
            </div>
          ))}
          {hand.length === 0 && (
            <div className="text-gray-600 text-sm py-8">No cards in hand</div>
          )}
        </div>
      </div>
    </div>
  );
}
