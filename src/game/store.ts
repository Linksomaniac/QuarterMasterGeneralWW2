import { create } from 'zustand';
import {
  Card,
  CardEffect,
  CardType,
  Country,
  CountryState,
  GamePhase,
  GameState,
  INITIAL_DISCARD,
  PendingAction,
  Team,
  TURN_ORDER,
  getTeam,
} from './types';
import { getCountryDeck } from './cards';
import {
  initializeCountryState,
  playCard,
  resolveBuildAction,
  resolveBattleAction,
  getValidBuildLocations,
  removeOutOfSupplyPieces,
  isInSupply,
  calculateVictoryPoints,
  checkSuddenVictory,
  drawCards,
  addLogEntry,
  getCurrentCountry,
  advanceTurn,
  getAllPieces,
  findProtectionResponses,
  activateProtectionResponse,
  findOffensiveResponses,
  resolveOffensiveResponse,
  ChainTrigger,
  PendingElimination,
  findEWCounterResponses,
  resolveEWCounter,
  findEnemyBuildReactions,
  findCrossTeamBuildResponses,
  resolveBuildReaction,
  findBattleReactions,
  resolveBattleReaction,
  findCardCancelResponses,
  cardTargetsUK,
  findStatusFreeActions,
  resolveStatusFreeAction,
  getStatusAlternativeActions,
  executeStatusAlternativeAction,
  findBushidoOpportunity,
  resolveBushidoBattle,
  findIslandDefenseOpportunity,
  resolveIslandDefense,
  findCounterOffensiveOpportunity,
  resolveCounterOffensive,
  findArsenalOpportunity,
  resolveArsenalOfDemocracy,
  resolveEWAction,
  resolveLendLease,
  findEWCancelResponses,
  findRationingOpportunity,
  resolveRationing,
  findWomenConscriptsOpportunity,
  resolveWomenConscripts,
  findRosieOpportunity,
  resolveRosieWithCards,
  resolveRosieAI,
  getValidRecruitSpaces,
  processEventEffects,
  EventBuildInfo,
  resolveEventEffectAtSpace,
  buildMovePiecesAction,
  generatePieceId,
  findSuperiorPlanningOpportunity,
  resolveSuperiorPlanning,
  findEnigmaOpportunity,
  resolveEnigma,
  findAllyReinforcementResponses,
  resolveAllyReinforcement,
  resolveFlexibleResources,
  findVolkssturmOpportunity,
  resolveVolkssturm,
  findMobileForceOpportunity,
  getValidMobileForceSpaces,
  resolveMobileForceAt,
  findDefenseOfMotherlandOpportunity,
  resolveDefenseOfMotherland,
  resolveAdditionalBattleChoice,
  resolveEventChoice,
  getAvailablePieces,
  resolveHandDiscardAction,
  resolveRecruitCountryChoice,
  getRedeployOption,
} from './engine';
import { getEnemyTeam, Piece, COUNTRY_NAMES } from './types';
import { getSpace, getAdjacentSpaces } from './mapData';
import {
  aiChooseCard,
  aiResolvePendingAction,
  aiChooseDiscards,
  aiShouldActivateProtection,
  aiShouldActivateBuildReaction,
  aiShouldActivateBattleReaction,
  aiShouldActivateCardCancel,
  aiShouldActivateBushido,
  aiShouldActivateIslandDefense,
  aiShouldActivateCounterOffensive,
  aiShouldActivateArsenal,
  aiPickEWTarget,
  pickBestBattleTarget,
  pickBestBuildLocation,
  pickWorstPieceToRemove,
  aiChooseEventEffect,
  aiShouldTriggerDefenseOfMotherland,
  aiBestPieceToEliminate,
  aiShouldSkipRedeploy,
} from './ai';

export interface PlayerConfig {
  country: Country;
  isHuman: boolean;
  aiDifficulty: 'easy' | 'medium' | 'hard';
}

export interface ActionContext {
  type: 'build' | 'battle' | 'ew';
  country: Country;
  spaceId: string;
  builtPieceId?: string;
  builtPieceType?: 'army' | 'navy';
  battleType?: 'land' | 'sea';
  ewCountry?: Country;
  declinedCardIds: string[];
  usedOffensiveIds: string[];
  usedStatusAbilityIds: string[];
  chainTrigger?: ChainTrigger;
  chainUsedIds?: string[];
  chainPendingElimination?: PendingElimination;
  playedCard?: Card;
  additionalBattleCard?: Card;
  additionalBattleCountry?: Country;
  /** Saved original trigger so resumeChain can continue offering offensive
   *  responses after chain build reactions (e.g. Rasputitsa) resolve. */
  pendingOriginalTrigger?: {
    type: 'battle_land' | 'battle_sea' | 'build_army' | 'build_navy';
    spaceId: string;
  };
  eventContinuation?: {
    remainingEffects: CardEffect[];
    eventCardName: string;
    playingCountry: Country;
  };
}

interface GameStoreActions {
  initGame: (configs: PlayerConfig[]) => void;
  confirmSetupDiscard: (cardIds: string[]) => void;
  selectCard: (card: Card) => void;
  playSelectedCard: () => void;
  handleSpaceClick: (spaceId: string) => void;
  confirmDiscardStep: (discardIndices: number[]) => void;
  executeAiTurn: () => Promise<void>;
  runFullAiTurn: () => Promise<void>;
  advanceToNextPhase: () => void;
  resetGame: () => void;
  toggleCardForDiscard: (cardId: string) => void;
  respondToOpportunity: (accept: boolean) => void;
  useAlternativeAction: (statusCardId: string) => void;
  selectEWTarget: (targetCountry: Country) => void;
  selectLendLeaseTarget: (targetCountry: Country) => void;
  selectFromDiscard: (cardId: string) => void;
  selectEventChoice: (effectType: string) => void;
  resolveReorderCards: (orderedCardIds: string[]) => void;
  resolveRosieSelection: (cardIds: string[]) => void;
  skipPlayStep: () => void;
  skipRemainingRecruits: () => void;
  skipEventEffect: () => void;
  resolveMaltaChoice: (choice: 'eliminate_navy' | 'discard_cards') => void;
  confirmHandDiscard: (cardIds: string[]) => void;
  confirmOffensiveHandDiscard: (cardIds: string[]) => void;
  resolveRationingChoice: (accept: boolean) => void;
  confirmRecruitCountry: (country: Country) => void;
  confirmRedeploy: (pieceId: string) => void;
  skipRedeploy: () => void;
  selectMovePiece: (pieceId: string) => void;
  skipMovePieces: () => void;
  selectBattlePiece: (pieceId: string) => void;
}

interface GameStoreState extends GameState {
  selectedDiscards: Set<string>;
  actionContext?: ActionContext;
  setupDiscardCountryIndex: number;
}

type GameStore = GameStoreState & GameStoreActions;

function gs(store: GameStore): GameState {
  return {
    phase: store.phase,
    round: store.round,
    currentCountryIndex: store.currentCountryIndex,
    countries: store.countries,
    axisVP: store.axisVP,
    alliesVP: store.alliesVP,
    log: store.log,
    supplyMarkers: store.supplyMarkers,
    protections: store.protections,
    winner: store.winner,
    pendingAction: store.pendingAction,
    selectedCard: store.selectedCard,
  };
}

const initialState: GameStoreState = {
  phase: GamePhase.SETUP,
  round: 1,
  currentCountryIndex: 0,
  countries: {} as Record<Country, CountryState>,
  axisVP: 0,
  alliesVP: 0,
  log: [],
  supplyMarkers: { canada: false, szechuan: false, scorched_earth_ukraine: false, truk_supply: false },
  protections: [],
  winner: null,
  pendingAction: null,
  selectedCard: null,
  selectedDiscards: new Set<string>(),
  actionContext: undefined,
  setupDiscardCountryIndex: 0,
};

const AI_DELAY = 600;
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// tryOfferOffensiveResponse — existing offensive response check
// ---------------------------------------------------------------------------
function tryOfferOffensiveResponse(
  triggerType: 'battle_land' | 'battle_sea' | 'build_army' | 'build_navy',
  triggerSpaceId: string,
  country: Country,
  state: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore,
  excludeCardIds: string[] = []
): boolean {
  const offensives = findOffensiveResponses(triggerType, triggerSpaceId, country, state, excludeCardIds);
  if (offensives.length === 0) return false;

  const off = offensives[0];
  set({
    ...state,
    phase: GamePhase.AWAITING_RESPONSE,
    pendingAction: {
      type: 'OFFENSIVE_RESPONSE_OPPORTUNITY',
      responseCountry: country,
      responseCardId: off.card.id,
      responseCardName: off.card.name,
      triggerSpaceId,
      description: off.description,
    },
  });

  if (!state.countries[country].isHuman) {
    setTimeout(() => {
      get().respondToOpportunity(true);
    }, AI_DELAY);
  }
  return true;
}

// ---------------------------------------------------------------------------
// maybeSetOrAutoResolveEventSpace — when processEventEffects returns a
// SELECT_EVENT_SPACE pending action, check whether the playing country is
// human.  If human: pause and show the space-picker UI.  If AI: pick the
// best space automatically and continue without interrupting the turn.
// Fixes Patton Advances (and similar cards) prompting the wrong player.
// ---------------------------------------------------------------------------
function maybeSetOrAutoResolveEventSpace(
  pa: Extract<PendingAction, { type: 'SELECT_EVENT_SPACE' }>,
  ns: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): boolean {
  if (ns.countries[pa.playingCountry].isHuman) {
    set({ ...ns, pendingAction: pa });
    return true;
  }

  // AI playing country — pick automatically.
  const diff = ns.countries[pa.playingCountry].aiDifficulty;
  let pick: string | null = null;

  if (pa.effectAction === 'land_battle') {
    pick = pickBestBattleTarget(pa.validSpaces, pa.effectCountry, ns, diff);
  } else {
    pick = pickBestBuildLocation(pa.validSpaces, pa.effectCountry, ns, diff) ?? pa.validSpaces[0] ?? null;
  }

  if (!pick) {
    goToSupplyStep(ns, set, get);
    return true;
  }

  let aiNs = resolveEventEffectAtSpace(
    pa.effectAction, pick, pa.effectCountry, pa.playingCountry, ns, pa.eventCardName
  );

  // After a battle event effect, check for offensive responses (Amphibious Landing, Blitzkrieg, etc.)
  const aiIsBattle = pa.effectAction === 'land_battle' || pa.effectAction === 'sea_battle';
  if (aiIsBattle) {
    const aiBattleType = pa.effectAction === 'sea_battle' ? 'sea' as const : 'land' as const;
    if (handleEventBattleTrigger(aiBattleType, pick, pa.playingCountry, pa.remainingEffects, pa.eventCardName, aiNs, set, get)) return true;
  }

  if (pa.remainingEffects.length > 0) {
    const contResult = processEventEffects(pa.remainingEffects, pa.eventCardName, pa.playingCountry, aiNs);
    if (contResult.pendingAction && contResult.pendingAction.type === 'SELECT_EVENT_SPACE') {
      return maybeSetOrAutoResolveEventSpace(contResult.pendingAction, contResult.newState, set, get);
    }
    if (contResult.eventBuildInfo) {
      if (handleEventBuildTrigger(contResult.eventBuildInfo, contResult.newState, set, get)) return true;
    }
    aiNs = contResult.newState;
  }

  if (proceedAfterAction(aiNs, set, get)) return true;
  goToSupplyStep(aiNs, set, get);
  return true;
}

// ---------------------------------------------------------------------------
// handleEventBuildTrigger — after an event auto-resolves a build/recruit,
// check for status card triggers (Superior Shipyards, Wartime Production, etc.)
// and continue with remaining event effects afterward.
// ---------------------------------------------------------------------------
function handleEventBuildTrigger(
  buildInfo: EventBuildInfo,
  ns: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): boolean {
  const country = buildInfo.playingCountry;

  set({
    actionContext: {
      type: 'build',
      country,
      spaceId: buildInfo.spaceId,
      builtPieceType: buildInfo.triggerType === 'build_navy' ? 'navy' : 'army',
      declinedCardIds: [],
      usedOffensiveIds: [],
      usedStatusAbilityIds: [],
      eventContinuation: {
        remainingEffects: buildInfo.remainingEffects,
        eventCardName: buildInfo.eventCardName,
        playingCountry: buildInfo.playingCountry,
      },
    },
  });

  if (tryOfferOffensiveResponse(buildInfo.triggerType, buildInfo.spaceId, country, ns, set, get)) {
    return true;
  }

  set({ actionContext: undefined });

  if (buildInfo.remainingEffects.length > 0) {
    const result = processEventEffects(buildInfo.remainingEffects, buildInfo.eventCardName, buildInfo.playingCountry, ns);
    if (result.pendingAction) {
      // For SELECT_EVENT_SPACE, check whether the playing country is human;
      // AI countries auto-resolve so they never hand control to the wrong player.
      if (result.pendingAction.type === 'SELECT_EVENT_SPACE') {
        return maybeSetOrAutoResolveEventSpace(result.pendingAction, result.newState, set, get);
      }
      set({ ...result.newState, pendingAction: result.pendingAction });
      return true;
    }
    if (result.eventBuildInfo) {
      if (handleEventBuildTrigger(result.eventBuildInfo, result.newState, set, get)) return true;
      set({ ...result.newState, pendingAction: null });
      goToSupplyStep(result.newState, set, get);
      return true;
    }
    set({ ...result.newState, pendingAction: null });
    goToSupplyStep(result.newState, set, get);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// handleEventBattleTrigger — after an event card resolves a battle, check for
// offensive responses (Amphibious Landing, Blitzkrieg, etc.) and continue with
// remaining event effects afterward via eventContinuation.
// ---------------------------------------------------------------------------
function handleEventBattleTrigger(
  battleType: 'land' | 'sea',
  spaceId: string,
  playingCountry: Country,
  remainingEffects: CardEffect[],
  eventCardName: string,
  ns: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): boolean {
  const trigType = battleType === 'sea' ? 'battle_sea' as const : 'battle_land' as const;

  set({
    actionContext: {
      type: 'battle',
      country: playingCountry,
      spaceId,
      battleType,
      declinedCardIds: [],
      usedOffensiveIds: [],
      usedStatusAbilityIds: [],
      eventContinuation: remainingEffects.length > 0 ? {
        remainingEffects,
        eventCardName,
        playingCountry,
      } : undefined,
    },
  });

  if (tryOfferOffensiveResponse(trigType, spaceId, playingCountry, ns, set, get)) {
    return true;
  }

  // No offensive response available — clean up actionContext
  set({ actionContext: undefined });
  return false;
}

// ---------------------------------------------------------------------------
// aiResolveMovePieces — AI decides which pieces to move and where
// ---------------------------------------------------------------------------
function aiResolveMovePieces(
  pa: Extract<PendingAction, { type: 'SELECT_MOVE_PIECE' }>,
  state: GameState,
  diff: 'easy' | 'medium' | 'hard',
  currentCountry: Country
): GameState {
  let ns = state;
  const moveCountry = pa.country;
  const movedIds = [...pa.movedPieceIds];

  for (let iter = 0; iter < 20; iter++) {
    const cs = ns.countries[moveCountry];
    const eligible = cs.piecesOnBoard.filter(
      (p) => !movedIds.includes(p.id) && (!pa.pieceTypeFilter || p.type === pa.pieceTypeFilter)
    );
    if (eligible.length === 0) break;

    let bestPiece: typeof eligible[0] | null = null;
    let bestDest = '';
    let bestImprovement = 0;

    for (const piece of eligible) {
      const tempState: GameState = {
        ...ns,
        countries: {
          ...ns.countries,
          [moveCountry]: {
            ...cs,
            piecesOnBoard: cs.piecesOnBoard.filter((p) => p.id !== piece.id),
          },
        },
      };
      const validLocs = getValidBuildLocations(moveCountry, piece.type, tempState);
      if (validLocs.length === 0) continue;

      const dest = pickBestBuildLocation(validLocs, moveCountry, tempState, diff);
      if (!dest || dest === piece.spaceId) continue;

      const currentIsSupply = getSpace(piece.spaceId)?.isSupplySpace ? 1 : 0;
      const destIsSupply = getSpace(dest)?.isSupplySpace ? 1 : 0;
      const currentInSupply = isInSupply(piece, ns) ? 1 : 0;
      const improvement = (destIsSupply - currentIsSupply) * 5 + (1 - currentInSupply) * 8;

      if (improvement > bestImprovement) {
        bestImprovement = improvement;
        bestPiece = piece;
        bestDest = dest;
      }
    }

    if (!bestPiece || bestImprovement <= 0) break;

    const rmName = getSpace(bestPiece.spaceId)?.name ?? bestPiece.spaceId.replace(/_/g, ' ');
    const destName = getSpace(bestDest)?.name ?? bestDest.replace(/_/g, ' ');
    ns = {
      ...ns,
      countries: {
        ...ns.countries,
        [moveCountry]: {
          ...ns.countries[moveCountry],
          piecesOnBoard: [
            ...ns.countries[moveCountry].piecesOnBoard.filter((p) => p.id !== bestPiece!.id),
            { ...bestPiece, id: generatePieceId(), spaceId: bestDest },
          ],
        },
      },
    };
    ns = addLogEntry(ns, moveCountry, `${pa.eventCardName}: moved ${bestPiece.type} from ${rmName} to ${destName}`);
    movedIds.push(bestPiece.id);
  }

  return ns;
}

// ---------------------------------------------------------------------------
// eliminateSpecificPiece — remove a known piece by id from the board
// ---------------------------------------------------------------------------
function eliminateSpecificPiece(
  elim: PendingElimination,
  state: GameState
): GameState {
  const cs = state.countries[elim.pieceCountry];
  return {
    ...state,
    countries: {
      ...state.countries,
      [elim.pieceCountry]: {
        ...cs,
        piecesOnBoard: cs.piecesOnBoard.filter((p) => p.id !== elim.pieceId),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// handleChainElimination — process a chain battle elimination with full
// reactive flow: protection → Bushido / Island Defense → eliminate →
// Counter-Offensive, then resume chain via resumeChain.
// ---------------------------------------------------------------------------
function handleChainElimination(
  elim: PendingElimination,
  attackingCountry: Country,
  state: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): void {
  const responses = findProtectionResponses(elim.spaceId, elim.pieceCountry, state, elim.pieceType, elim.pieceId);
  if (responses.length > 0) {
    const resp = responses[0];
    set({
      ...state,
      phase: GamePhase.AWAITING_RESPONSE,
      pendingAction: {
        type: 'RESPONSE_OPPORTUNITY',
        responseCountry: resp.country,
        responseCardId: resp.card.id,
        responseCardName: resp.card.name,
        battleSpaceId: elim.spaceId,
        eliminatedPieceId: elim.pieceId,
        eliminatedPieceCountry: elim.pieceCountry,
        attackingCountry,
      },
    });
    if (!state.countries[resp.country].isHuman) {
      setTimeout(() => {
        const accept = aiShouldActivateProtection(
          gs(get()), resp.card, elim.spaceId, resp.country
        );
        get().respondToOpportunity(accept);
      }, AI_DELAY);
    }
    return;
  }

  performChainElimination(elim, attackingCountry, state, set, get);
}

// ---------------------------------------------------------------------------
// performChainElimination — actually remove the piece after protection was
// declined or unavailable; then check Bushido / Island Defense / Counter-Off.
// ---------------------------------------------------------------------------
function performChainElimination(
  elim: PendingElimination,
  attackingCountry: Country,
  state: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): void {
  if (elim.pieceCountry === Country.JAPAN && elim.pieceType === 'army') {
    const bushido = findBushidoOpportunity(elim.spaceId, attackingCountry, state);
    if (bushido) {
      set({
        ...state,
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'BUSHIDO_OPPORTUNITY',
          responseCountry: Country.JAPAN,
          statusCardId: bushido.card.id,
          statusCardName: bushido.card.name,
          battleSpaceId: elim.spaceId,
          attackingCountry,
        },
      });
      if (!state.countries[Country.JAPAN].isHuman) {
        setTimeout(() => {
          get().respondToOpportunity(
            aiShouldActivateBushido(gs(get()), elim.spaceId)
          );
        }, AI_DELAY);
      }
      return;
    }
  }

  if (elim.pieceCountry === Country.JAPAN && elim.pieceType === 'navy') {
    const ihd = findIslandDefenseOpportunity(
      elim.spaceId, attackingCountry, elim.pieceId, state
    );
    if (ihd) {
      set({
        ...state,
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'ISLAND_DEFENSE_OPPORTUNITY',
          responseCountry: Country.JAPAN,
          statusCardId: ihd.card.id,
          statusCardName: ihd.card.name,
          battleSpaceId: elim.spaceId,
          attackingCountry,
        },
      });
      if (!state.countries[Country.JAPAN].isHuman) {
        setTimeout(() => {
          get().respondToOpportunity(
            aiShouldActivateIslandDefense(gs(get()), elim.spaceId)
          );
        }, AI_DELAY);
      }
      return;
    }
  }

  let ns = eliminateSpecificPiece(elim, state);
  ns = addLogEntry(ns, attackingCountry,
    `Eliminated enemy ${elim.pieceType} in ${getSpace(elim.spaceId)?.name ?? elim.spaceId}`
  );

  if (
    elim.pieceType === 'army' &&
    getTeam(elim.pieceCountry) === Team.AXIS
  ) {
    const co = findCounterOffensiveOpportunity(elim.spaceId, elim.pieceCountry, ns);
    if (co) {
      set({
        ...ns,
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'COUNTER_OFFENSIVE_OPPORTUNITY',
          responseCountry: Country.SOVIET_UNION,
          statusCardId: co.card.id,
          statusCardName: co.card.name,
          eliminatedSpaceId: elim.spaceId,
          eliminatedPieceCountry: elim.pieceCountry,
        },
      });
      if (!ns.countries[Country.SOVIET_UNION].isHuman) {
        setTimeout(() => {
          get().respondToOpportunity(
            aiShouldActivateCounterOffensive(gs(get()), elim.spaceId)
          );
        }, AI_DELAY);
      }
      return;
    }
  }

  resumeChain(ns, set, get);
}

// ---------------------------------------------------------------------------
// checkChainBuildReactions — after a chain build, check enemy build reactions,
// then resume chain.
// ---------------------------------------------------------------------------
function checkChainBuildReactions(
  chainTrigger: ChainTrigger,
  chainCountry: Country,
  usedIds: string[],
  state: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): boolean {
  if (
    (chainTrigger.type === 'build_army' || chainTrigger.type === 'build_navy') &&
    chainTrigger.builtPieceId
  ) {
    const pieceType = chainTrigger.type === 'build_army' ? 'army' as const : 'navy' as const;
    const ctx = get().actionContext;
    const reactions = findEnemyBuildReactions(
      chainCountry, chainTrigger.spaceId, pieceType, chainTrigger.builtPieceId,
      state, ctx?.declinedCardIds ?? []
    );
    if (reactions.length > 0) {
      const reaction = reactions[0];
      set({
        ...state,
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'BUILD_REACTION_OPPORTUNITY',
          responseCountry: reaction.country,
          responseCardId: reaction.card.id,
          responseCardName: reaction.card.name,
          buildSpaceId: chainTrigger.spaceId,
          buildCountry: chainCountry,
          builtPieceId: chainTrigger.builtPieceId,
          description: reaction.description,
        },
      });
      if (!state.countries[reaction.country].isHuman) {
        setTimeout(() => {
          get().respondToOpportunity(
            aiShouldActivateBuildReaction(
              gs(get()), reaction.card, chainTrigger.spaceId, reaction.country
            )
          );
        }, AI_DELAY);
      }
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// resumeChain — after an intermediate chain reaction resolves, continue
// checking for more offensive responses using the saved chain trigger.
// ---------------------------------------------------------------------------
function resumeChain(
  state: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): void {
  const ctx = get().actionContext;
  if (!ctx?.chainTrigger) {
    // No more chain triggers — check if there's a pending original trigger
    // (e.g. after Blitzkrieg build → Rasputitsa resolved, continue with Dive Bombers)
    if (ctx?.pendingOriginalTrigger) {
      const { type: origType, spaceId: origSpace } = ctx.pendingOriginalTrigger;
      set({ actionContext: { ...ctx, pendingOriginalTrigger: undefined } });
      if (tryOfferOffensiveResponse(origType, origSpace, ctx.country, state, set, get, ctx.usedOffensiveIds)) return;
    }
    if (proceedAfterAction(state, set, get)) return;
    goToSupplyStep(state, set, get);
    return;
  }

  const { chainTrigger, chainUsedIds = [] } = ctx;
  set({ actionContext: { ...ctx, chainTrigger: undefined, chainUsedIds: undefined, chainPendingElimination: undefined } });

  if (checkChainBuildReactions(chainTrigger, ctx.country, chainUsedIds, state, set, get)) return;

  if (tryOfferOffensiveResponse(chainTrigger.type, chainTrigger.spaceId, ctx.country, state, set, get, chainUsedIds)) return;

  // After chain trigger resolved, check pending original trigger
  const freshCtx = get().actionContext;
  if (freshCtx?.pendingOriginalTrigger) {
    const { type: origType, spaceId: origSpace } = freshCtx.pendingOriginalTrigger;
    set({ actionContext: { ...freshCtx, pendingOriginalTrigger: undefined } });
    if (tryOfferOffensiveResponse(origType, origSpace, freshCtx.country, state, set, get, freshCtx.usedOffensiveIds)) return;
  }

  if (proceedAfterAction(state, set, get)) return;
  goToSupplyStep(state, set, get);
}

// ---------------------------------------------------------------------------
// proceedAfterAction — check for remaining reactive triggers before advancing
// to supply step. Returns true if a reaction was offered (game paused).
// ---------------------------------------------------------------------------
function proceedAfterAction(
  state: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): boolean {
  const ctx = get().actionContext;
  if (!ctx) { console.log('[AI] proceedAfterAction: no ctx, returning false'); return false; }
  console.log(`[AI] proceedAfterAction: ctx.type=${ctx.type}, ctx.spaceId=${ctx.spaceId}`);

  if (ctx.type === 'build') {
    const enemyReactions = findEnemyBuildReactions(
      ctx.country,
      ctx.spaceId,
      ctx.builtPieceType!,
      ctx.builtPieceId!,
      state,
      ctx.declinedCardIds
    );
    if (enemyReactions.length > 0) {
      const reaction = enemyReactions[0];
      set({
        ...state,
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'BUILD_REACTION_OPPORTUNITY',
          responseCountry: reaction.country,
          responseCardId: reaction.card.id,
          responseCardName: reaction.card.name,
          buildSpaceId: ctx.spaceId,
          buildCountry: ctx.country,
          builtPieceId: ctx.builtPieceId!,
          description: reaction.description,
        },
      });
      if (!state.countries[reaction.country].isHuman) {
        setTimeout(() => {
          get().respondToOpportunity(
            aiShouldActivateBuildReaction(gs(get()), reaction.card, ctx.spaceId, reaction.country)
          );
        }, AI_DELAY);
      }
      return true;
    }

    const crossTeam = findCrossTeamBuildResponses(ctx.country, ctx.spaceId, state, ctx.declinedCardIds);
    if (crossTeam.length > 0) {
      const reaction = crossTeam[0];
      set({
        ...state,
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'BUILD_REACTION_OPPORTUNITY',
          responseCountry: reaction.country,
          responseCardId: reaction.card.id,
          responseCardName: reaction.card.name,
          buildSpaceId: ctx.spaceId,
          buildCountry: ctx.country,
          builtPieceId: ctx.builtPieceId!,
          description: reaction.description,
        },
      });
      if (!state.countries[reaction.country].isHuman) {
        setTimeout(() => {
          get().respondToOpportunity(
            aiShouldActivateBuildReaction(gs(get()), reaction.card, ctx.spaceId, reaction.country)
          );
        }, AI_DELAY);
      }
      return true;
    }

    return false;
  }

  if (ctx.type === 'battle') {
    const reactions = findBattleReactions(ctx.country, ctx.spaceId, state, ctx.declinedCardIds);
    if (reactions.length > 0) {
      const reaction = reactions[0];
      set({
        ...state,
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'BATTLE_REACTION_OPPORTUNITY',
          responseCountry: reaction.country,
          responseCardId: reaction.card.id,
          responseCardName: reaction.card.name,
          battleSpaceId: ctx.spaceId,
          battleCountry: ctx.country,
          description: reaction.description,
        },
      });
      if (!state.countries[reaction.country].isHuman) {
        setTimeout(() => {
          get().respondToOpportunity(
            aiShouldActivateBattleReaction(gs(get()), reaction.card, reaction.country)
          );
        }, AI_DELAY);
      }
      return true;
    }
    return false;
  }

  if (ctx.type === 'ew') {
    const counters = findEWCounterResponses(ctx.ewCountry!, state);
    const available = counters.filter((c) => !ctx.declinedCardIds.includes(c.card.id));
    if (available.length > 0) {
      const counter = available[0];
      set({
        ...state,
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'EW_COUNTER_OPPORTUNITY',
          responseCountry: counter.country,
          responseCardId: counter.card.id,
          responseCardName: counter.card.name,
          ewCountry: ctx.ewCountry!,
        },
      });
      if (!state.countries[counter.country].isHuman) {
        setTimeout(() => {
          get().respondToOpportunity(true);
        }, AI_DELAY);
      }
      return true;
    }
    return false;
  }

  return false;
}

// ---------------------------------------------------------------------------
// autoDiscardFromHand — AI auto-selects lowest-value cards to discard
// ---------------------------------------------------------------------------
function autoDiscardFromHand(
  country: Country,
  count: number,
  cardName: string,
  state: GameState
): GameState {
  const hand = [...state.countries[country].hand];
  const scored = hand.map((c, i) => ({
    index: i,
    score: c.type === CardType.STATUS ? 10 : c.type === CardType.EVENT ? 8 :
           c.type === CardType.RESPONSE ? 7 : c.type === CardType.ECONOMIC_WARFARE ? 6 : 1,
  }));
  scored.sort((a, b) => a.score - b.score);
  const toDiscard = scored.slice(0, count).map((s) => s.index);
  const discarded = toDiscard.map((i) => hand[i]);
  const remaining = hand.filter((_, i) => !toDiscard.includes(i));
  let ns: GameState = {
    ...state,
    countries: {
      ...state.countries,
      [country]: {
        ...state.countries[country],
        hand: remaining,
        discard: [...state.countries[country].discard, ...discarded],
      },
    },
  };
  ns = addLogEntry(ns, country, `${cardName}: discarded ${discarded.map((c) => c.name).join(', ')} from hand`);
  return ns;
}

// ---------------------------------------------------------------------------
// processOffensiveResult — handles the result of resolveOffensiveResponse
// (builds, battles, chain continuation). Returns true if it set state and
// paused the flow (e.g. for human choices).
// ---------------------------------------------------------------------------
function processOffensiveResult(
  result: ReturnType<typeof resolveOffensiveResponse>,
  card: Card,
  isStatusCard: boolean,
  country: Country,
  triggerSpaceId: string,
  usedIds: string[],
  initialNs: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): void {
  console.log(`[AI] processOffensiveResult for ${COUNTRY_NAMES[country]}: card=${card.name}, needsRedeploy=${result.needsRedeploy}, validBuildSpaces=${result.validBuildSpaces?.length}, validBattleTargets=${result.validBattleTargets?.length}`);
  let ns = result.newState;
  let chainTrigger: ChainTrigger | undefined;
  let pendingElim: PendingElimination | undefined;

  if (isStatusCard) {
    const enigmaResult = checkAndResolveEnigma(country, card.id, card.name, ns);
    ns = enigmaResult.newState;
    if (enigmaResult.enigmaPending) {
      set({ ...ns, pendingAction: enigmaResult.enigmaPending });
      return;
    }
  }

  // Handle BUILD_AFTER_BATTLE needing a redeploy to a fixed target space (0 reserves)
  if (result.needsRedeploy && result.targetBuildSpaceId) {
    const targetSpaceId = result.targetBuildSpaceId;
    const pieceType = result.redeployPieceType ?? 'army';
    const isHuman = ns.countries[country].isHuman;
    const redeployPA = getRedeployOption(country, pieceType, ns);
    if (redeployPA) {
      if (isHuman) {
        ns = addLogEntry(ns, country, `${card.name}: no reserve ${pieceType === 'navy' ? 'navies' : 'armies'} — pick one to redeploy to ${getSpace(targetSpaceId)?.name ?? targetSpaceId}`);
        set({
          ...ns,
          phase: GamePhase.PLAY_STEP,
          pendingAction: { ...redeployPA, targetSpaceId } as PendingAction,
          actionContext: {
            ...(get().actionContext ?? { type: 'build', country, spaceId: '', declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [] }),
            usedOffensiveIds: usedIds,
          },
        });
        return;
      }
      // AI: check if it's worth sacrificing a piece; skip if all pieces are too valuable
      const pieces = ns.countries[country].piecesOnBoard.filter((p) => p.type === pieceType);
      const pieceMappings = pieces.map((p) => ({ pieceId: p.id, spaceId: p.spaceId }));
      const aiDiff = ns.countries[country].aiDifficulty;
      if (aiShouldSkipRedeploy(pieceMappings, country, ns, aiDiff)) {
        ns = addLogEntry(ns, country, `${card.name}: declined to redeploy — all ${pieceType === 'navy' ? 'navies' : 'armies'} too valuable`);
      } else {
      const worstId = pickWorstPieceToRemove(pieceMappings, country, ns);
      const remove = pieces.find((p) => p.id === worstId);
      if (remove) {
        const removedSpaceName = getSpace(remove.spaceId)?.name ?? remove.spaceId;
        ns = {
          ...ns,
          countries: {
            ...ns.countries,
            [country]: {
              ...ns.countries[country],
              piecesOnBoard: ns.countries[country].piecesOnBoard.filter((p) => p.id !== remove.id),
            },
          },
        };
        const newPiece: Piece = { id: generatePieceId(), country, type: pieceType, spaceId: targetSpaceId };
        ns = {
          ...ns,
          countries: {
            ...ns.countries,
            [country]: {
              ...ns.countries[country],
              piecesOnBoard: [...ns.countries[country].piecesOnBoard, newPiece],
            },
          },
        };
        ns = addLogEntry(ns, country, `${card.name}: redeployed ${pieceType} from ${removedSpaceName} to ${getSpace(targetSpaceId)?.name ?? targetSpaceId}`);
        chainTrigger = { type: pieceType === 'navy' ? 'build_navy' : 'build_army', spaceId: targetSpaceId, builtPieceId: newPiece.id };
      }
      }
    }
  }

  if (result.validBuildSpaces && result.validBuildSpaces.length > 1) {
    const isHuman = ns.countries[country].isHuman;
    const pieceType = result.buildPieceType ?? 'army';
    const buildCount = result.buildCount ?? 1;
    if (isHuman) {
      ns = addLogEntry(ns, country, `${card.name}: choose where to build ${pieceType}`);
      set({
        ...ns,
        phase: GamePhase.PLAY_STEP,
        pendingAction: {
          type: 'SELECT_RECRUIT_LOCATION',
          pieceType,
          validSpaces: result.validBuildSpaces,
          remaining: buildCount,
          baseWhere: [],
          baseCondition: undefined,
          recruitCountry: country,
          eventCardName: card.name,
        },
        actionContext: {
          ...(get().actionContext ?? { type: 'build', country, spaceId: '', declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [] }),
          usedOffensiveIds: usedIds,
        },
      });
      return;
    }
    const diff = ns.countries[country].aiDifficulty;
    for (let i = 0; i < buildCount; i++) {
      const av = getAvailablePieces(country, ns);
      const hasPcs = pieceType === 'navy' ? av.navies > 0 : av.armies > 0;
      if (!hasPcs) break;
      const freshLocs = new Set(getValidBuildLocations(country, pieceType, ns));
      // buildAnywhere: pick from ALL valid locations (not just adjacent to trigger), e.g. RECRUIT_UK navy
      const candidateSpaces = result.buildAnywhere
        ? [...freshLocs]
        : getAdjacentSpaces(triggerSpaceId).filter((a) => freshLocs.has(a));
      if (candidateSpaces.length === 0) break;
      const pick = pickBestBuildLocation(candidateSpaces, country, ns, diff);
      if (!pick) break;
      ns = resolveBuildAction(pick, pieceType, country, ns);
      ns = addLogEntry(ns, country, `${card.name}: built ${pieceType} in ${getSpace(pick)?.name ?? pick}`);
      chainTrigger = { type: pieceType === 'army' ? 'build_army' : 'build_navy', spaceId: pick };
    }
  } else if (result.validBattleTargets && result.validBattleTargets.length > 1) {
    const isHuman = ns.countries[country].isHuman;
    if (isHuman) {
      ns = addLogEntry(ns, country, `${card.name}: choose a target to battle`);
      set({
        ...ns,
        phase: GamePhase.PLAY_STEP,
        pendingAction: {
          type: 'SELECT_BATTLE_TARGET',
          battleType: card.effects.find((e) => e.type === 'ADDITIONAL_BATTLE')?.battleType === 'sea' ? 'sea' : 'land',
          validTargets: result.validBattleTargets,
        },
        actionContext: {
          ...(get().actionContext ?? { type: 'build', country, spaceId: '', declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [] }),
          usedOffensiveIds: usedIds,
          additionalBattleCard: card,
          additionalBattleCountry: country,
        },
      });
      return;
    }
    const diff = ns.countries[country].aiDifficulty;
    const aiTarget = pickBestBattleTarget(result.validBattleTargets, country, ns, diff);
    const aiResult = resolveAdditionalBattleChoice(aiTarget, card, country, ns);
    ns = aiResult.newState;
    ns = addLogEntry(ns, country, aiResult.message);
    chainTrigger = aiResult.chainTrigger;
    pendingElim = aiResult.pendingElimination;
  } else {
    ns = addLogEntry(ns, country, result.message);
    chainTrigger = result.chainTrigger;
    pendingElim = result.pendingElimination;
  }

  finishOffensiveChain(ns, country, usedIds, chainTrigger, pendingElim, set, get);
}

function finishOffensiveChain(
  ns: GameState,
  country: Country,
  usedIds: string[],
  chainTrigger: ChainTrigger | undefined,
  pendingElim: PendingElimination | undefined,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): void {
  console.log(`[AI] finishOffensiveChain for ${COUNTRY_NAMES[country]}: chainTrigger=${chainTrigger?.type}, pendingElim=${!!pendingElim}`);
  const ctx = get().actionContext;
  if (ctx) {
    set({ actionContext: { ...ctx, usedOffensiveIds: usedIds } });
    const triggerType = ctx.type === 'battle'
      ? (ctx.battleType === 'sea' ? 'battle_sea' as const : 'battle_land' as const)
      : (ctx.builtPieceType === 'army' ? 'build_army' as const : 'build_navy' as const);

    // STEP 1: Handle pending elimination from the current offensive response
    // (e.g. Dive Bombers additional battle killed an enemy piece)
    if (pendingElim && chainTrigger) {
      set({
        actionContext: {
          ...ctx,
          usedOffensiveIds: usedIds,
          chainTrigger,
          chainUsedIds: usedIds,
          chainPendingElimination: pendingElim,
          // Save original trigger so resumeChain can continue offering
          // offensive responses after elimination + build reactions resolve
          pendingOriginalTrigger: { type: triggerType, spaceId: ctx.spaceId },
        },
      });
      handleChainElimination(pendingElim, country, ns, set, get);
      return;
    }

    // STEP 2: Handle build reactions BEFORE offering more offensive responses.
    // This ensures cards like Rasputitsa trigger immediately after a chain build
    // (e.g. Blitzkrieg builds army → Rasputitsa fires) before Dive Bombers etc.
    if (chainTrigger && (chainTrigger.type === 'build_army' || chainTrigger.type === 'build_navy')) {
      set({
        actionContext: {
          ...ctx,
          usedOffensiveIds: usedIds,
          chainTrigger,
          chainUsedIds: usedIds,
          // Save original trigger so resumeChain can continue offering
          // offensive responses after build reactions resolve
          pendingOriginalTrigger: { type: triggerType, spaceId: ctx.spaceId },
        },
      });
      if (checkChainBuildReactions(chainTrigger, country, usedIds, ns, set, get)) return;
      if (tryOfferOffensiveResponse(chainTrigger.type, chainTrigger.spaceId, country, ns, set, get, usedIds)) return;
    }

    // STEP 3: Offer more offensive responses for the ORIGINAL trigger type
    // (e.g. after Blitzkrieg build reactions resolved, offer Dive Bombers)
    if (tryOfferOffensiveResponse(triggerType, ctx.spaceId, country, ns, set, get, usedIds)) return;

    // STEP 4: If chainTrigger type differs from original, offer responses for it too
    if (chainTrigger && chainTrigger.type !== triggerType) {
      if (tryOfferOffensiveResponse(chainTrigger.type, chainTrigger.spaceId, country, ns, set, get, usedIds)) return;
    }
  }

  const evCtx = get().actionContext?.eventContinuation;
  if (evCtx && evCtx.remainingEffects.length > 0) {
    set({ actionContext: undefined });
    const contResult = processEventEffects(evCtx.remainingEffects, evCtx.eventCardName, evCtx.playingCountry, ns);
    if (contResult.pendingAction) {
      // For SELECT_EVENT_SPACE, check whether the playing country is human;
      // AI countries auto-resolve so they never hand control to the wrong player.
      if (contResult.pendingAction.type === 'SELECT_EVENT_SPACE') {
        maybeSetOrAutoResolveEventSpace(contResult.pendingAction, contResult.newState, set, get);
        return;
      }
      set({ ...contResult.newState, pendingAction: contResult.pendingAction });
      return;
    }
    if (contResult.eventBuildInfo) {
      if (handleEventBuildTrigger(contResult.eventBuildInfo, contResult.newState, set, get)) return;
    }
    ns = contResult.newState;
  }

  if (proceedAfterAction(ns, set, get)) return;
  goToSupplyStep(ns, set, get);
}

// ---------------------------------------------------------------------------
// checkAndResolveEnigma — after Germany uses a Status card ability, UK's Enigma
// Code Cracked can discard that German Status card. Returns pending action for
// human UK; auto-resolves for AI UK (only uses on high-value targets).
// ---------------------------------------------------------------------------
function checkAndResolveEnigma(
  country: Country,
  statusCardId: string,
  statusCardName: string,
  state: GameState
): { newState: GameState; enigmaPending: PendingAction | null } {
  if (country !== Country.GERMANY) return { newState: state, enigmaPending: null };
  const enigma = findEnigmaOpportunity(state);
  if (!enigma) return { newState: state, enigmaPending: null };

  const ukIsHuman = state.countries[Country.UK].isHuman;

  if (ukIsHuman) {
    return {
      newState: state,
      enigmaPending: {
        type: 'ENIGMA_OPPORTUNITY',
        responseCountry: Country.UK,
        enigmaCardId: enigma.card.id,
        enigmaCardName: enigma.card.name,
        germanStatusCardId: statusCardId,
        germanStatusCardName: statusCardName,
      },
    };
  }

  const gerStatus = state.countries[Country.GERMANY].statusCards;
  const targetCard = gerStatus.find((c) => c.id === statusCardId);
  const isHighValue = targetCard?.effects.some(
    (e) => e.type === 'BUILD_ARMY' || e.type === 'LAND_BATTLE'
      || e.type === 'VP_PER_CONDITION' || e.type === 'ADDITIONAL_BATTLE' || e.type === 'PROTECT_PIECE'
      || e.type === 'SUPPLY_MARKER' || e.condition === 'supplied'
  ) ?? false;
  const gerStatusCount = gerStatus.length;

  if (isHighValue || gerStatusCount <= 2) {
    let ns = resolveEnigma(statusCardId, state);
    ns = activateProtectionResponse(Country.UK, enigma.card.id, ns);
    ns = addLogEntry(ns, Country.UK, `Enigma Code Cracked: discarded ${statusCardName}`);
    return { newState: ns, enigmaPending: null };
  }

  return { newState: state, enigmaPending: null };
}

// ---------------------------------------------------------------------------
// tryOfferStatusFreeAction — offer once-per-turn free actions from status cards
// ---------------------------------------------------------------------------
function tryOfferStatusFreeAction(
  country: Country,
  state: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore,
  excludeIds: string[] = []
): boolean {
  const actions = findStatusFreeActions(country, state, excludeIds);
  if (actions.length === 0) return false;

  const action = actions[0];
  set({
    ...state,
    phase: GamePhase.AWAITING_RESPONSE,
    pendingAction: {
      type: 'STATUS_ABILITY_OPPORTUNITY',
      responseCountry: country,
      statusCardId: action.card.id,
      statusCardName: action.card.name,
      description: action.description,
    },
  });

  if (!state.countries[country].isHuman) {
    setTimeout(() => get().respondToOpportunity(true), AI_DELAY);
  }
  return true;
}

// ---------------------------------------------------------------------------
// aiShouldUseRationing — AI decides whether to use Rationing on a played card.
// Prefer using it on high-value card types and when the deck is getting low.
// ---------------------------------------------------------------------------
function aiShouldUseRationing(playedCard: Card, state: GameState): boolean {
  const deckSize = state.countries[Country.UK].deck.length;
  if (playedCard.type === CardType.STATUS || playedCard.type === CardType.EVENT || playedCard.type === CardType.RESPONSE) {
    return true;
  }
  if (playedCard.type === CardType.ECONOMIC_WARFARE) return true;
  if (playedCard.type === CardType.LAND_BATTLE || playedCard.type === CardType.SEA_BATTLE) {
    return deckSize <= 12;
  }
  if (deckSize <= 8) return true;
  return false;
}

// ---------------------------------------------------------------------------
// ensurePlayedCardDiscarded — Build/Battle cards aren't discarded in playCard;
// add the played card to the discard pile if it's not already there
// (Status → statusCards, Response → responseCards, so skip those)
// ---------------------------------------------------------------------------
function ensurePlayedCardDiscarded(playedCard: Card, country: Country, state: GameState): GameState {
  const cs = state.countries[country];
  const alreadyDiscarded = cs.discard.some((c) => c.id === playedCard.id);
  const isStatus = cs.statusCards.some((c) => c.id === playedCard.id);
  const isResponse = cs.responseCards.some((c) => c.id === playedCard.id);
  if (alreadyDiscarded || isStatus || isResponse) return state;
  return {
    ...state,
    countries: {
      ...state.countries,
      [country]: { ...cs, discard: [...cs.discard, playedCard] },
    },
  };
}

// ---------------------------------------------------------------------------
// continueAfterRationing — finish post-play hooks (Women Conscripts) then
// proceed to status free actions and supply step
// ---------------------------------------------------------------------------
function continueAfterRationing(
  state: GameState,
  playedCard: Card,
  country: Country,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
) {
  const wcCard = findWomenConscriptsOpportunity(country, playedCard.type, state);
  if (wcCard) {
    state = resolveWomenConscripts(playedCard, state);
    state = addLogEntry(state, Country.SOVIET_UNION, `Women Conscripts: placed ${playedCard.name} on top of deck`);
  }

  const ctx = get().actionContext;
  const usedIds = ctx?.usedStatusAbilityIds ?? [];
  if (tryOfferStatusFreeAction(country, state, set, get, usedIds)) return;
  set({ ...state, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
  setTimeout(() => get().advanceToNextPhase(), 400);
}

// ---------------------------------------------------------------------------
// goToSupplyStep — discard played card, check Rationing, Women Conscripts,
// free actions, then clear context and advance
// ---------------------------------------------------------------------------
function goToSupplyStep(
  state: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
) {
  const ctx = get().actionContext;
  const country = getCurrentCountry(state);
  console.log(`[AI] goToSupplyStep for ${COUNTRY_NAMES[country]}, playedCard=${ctx?.playedCard?.name ?? 'none'}`);

  if (ctx?.playedCard) {
    state = ensurePlayedCardDiscarded(ctx.playedCard, country, state);

    const rationingCard = findRationingOpportunity(country, state);
    if (rationingCard) {
      const cs = state.countries[country];
      if (cs.isHuman) {
        set({
          ...state,
          phase: GamePhase.AWAITING_RESPONSE,
          pendingAction: {
            type: 'RATIONING_OPPORTUNITY',
            rationingCardId: rationingCard.id,
            playedCard: ctx.playedCard,
          },
        });
        return;
      } else {
        if (aiShouldUseRationing(ctx.playedCard, state)) {
          state = resolveRationing(ctx.playedCard, state);
          state = addLogEntry(state, country, `Rationing: shuffled ${ctx.playedCard.name} back into deck`);
          state = activateProtectionResponse(Country.UK, rationingCard.id, state);
        }
      }
    }

    continueAfterRationing(state, ctx.playedCard, country, set, get);
    return;
  }

  const usedIds = ctx?.usedStatusAbilityIds ?? [];
  if (tryOfferStatusFreeAction(country, state, set, get, usedIds)) return;
  set({ ...state, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
  setTimeout(() => get().advanceToNextPhase(), 400);
}

// ---------------------------------------------------------------------------
// continueBeginningOfTurnAfterMobileForce — run remaining BoT effects
// (Defense of Motherland, etc.) then finalise the turn start
// ---------------------------------------------------------------------------
function continueBeginningOfTurnAfterMobileForce(
  state: GameState,
  country: Country,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
) {
  let advanced = state;

  const dmCard = findDefenseOfMotherlandOpportunity(country, advanced);
  if (dmCard) {
    const ussrIsHuman = advanced.countries[Country.SOVIET_UNION].isHuman;
    if (ussrIsHuman) {
      // Pause and let the human decide whether to activate the card.
      set({
        ...advanced,
        selectedDiscards: new Set<string>(),
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'BEGINNING_TURN_RESPONSE',
          responseCountry: Country.SOVIET_UNION,
          responseCardId: dmCard.id,
          responseCardName: dmCard.name,
          description: 'Recruit an Army in or adjacent to Moscow; then eliminate an Axis Army in Moscow.',
        },
      });
      return;
    }
    // AI decision — use heuristic based on difficulty.
    const diff = advanced.countries[Country.SOVIET_UNION].aiDifficulty;
    if (aiShouldTriggerDefenseOfMotherland(advanced, diff)) {
      advanced = resolveDefenseOfMotherland(advanced);
    }
  }

  set({ ...advanced, selectedDiscards: new Set<string>() });

  setTimeout(() => {
    const store = get();
    if (store.phase === GamePhase.GAME_OVER) return;
    const next = getCurrentCountry(gs(store));
    if (!store.countries[next].isHuman) store.runFullAiTurn();
  }, 300);
}

// ---------------------------------------------------------------------------
// Malta Submarines helpers — process each target country one at a time,
// giving human players a choice and letting AI decide strategically.
// ---------------------------------------------------------------------------
const AI_MALTA_DELAY = 600;

function resolveMaltaForCountry(
  targetCountry: Country,
  choice: 'eliminate_navy' | 'discard_cards',
  ewCard: Card,
  playingCountry: Country,
  state: GameState
): GameState {
  let ns = state;
  if (choice === 'eliminate_navy') {
    const medNavy = ns.countries[targetCountry].piecesOnBoard.find(
      (p) => p.type === 'navy' && p.spaceId === 'mediterranean'
    );
    if (medNavy) {
      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [targetCountry]: {
            ...ns.countries[targetCountry],
            piecesOnBoard: ns.countries[targetCountry].piecesOnBoard.filter((p) => p.id !== medNavy.id),
          },
        },
      };
      ns = addLogEntry(ns, playingCountry, `Malta Submarines: ${COUNTRY_NAMES[targetCountry]} eliminated navy in Mediterranean`);
    }
  } else {
    const cs = ns.countries[targetCountry];
    const deck = [...cs.deck];
    const discard = [...cs.discard];
    let discarded = 0;
    while (discarded < 2 && deck.length > 0) {
      discard.push(deck.pop()!);
      discarded++;
    }
    ns = { ...ns, countries: { ...ns.countries, [targetCountry]: { ...cs, deck, discard } } };
    if (discarded > 0) {
      ns = addLogEntry(ns, playingCountry, `Malta Submarines: ${COUNTRY_NAMES[targetCountry]} discards ${discarded} from deck`);
    }
  }
  return ns;
}

function countryHasNavyInMed(country: Country, state: GameState): boolean {
  return state.countries[country].piecesOnBoard.some(
    (p) => p.type === 'navy' && p.spaceId === 'mediterranean'
  );
}

function aiMaltaChoice(targetCountry: Country, state: GameState): 'eliminate_navy' | 'discard_cards' {
  const cs = state.countries[targetCountry];
  if (cs.deck.length <= 3) return 'eliminate_navy';
  return 'discard_cards';
}

function continueMaltaResolution(
  state: GameState,
  ewCard: Card,
  playingCountry: Country,
  remainingCountries: Country[],
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
) {
  let ns = state;

  for (let i = 0; i < remainingCountries.length; i++) {
    const target = remainingCountries[i];
    const hasNavy = countryHasNavyInMed(target, ns);

    if (!hasNavy) {
      ns = resolveMaltaForCountry(target, 'discard_cards', ewCard, playingCountry, ns);
      continue;
    }

    if (ns.countries[target].isHuman) {
      set({
        ...ns,
        pendingAction: {
          type: 'SELECT_MALTA_CHOICE',
          targetCountry: target,
          ewCard,
          playingCountry,
          remainingCountries: remainingCountries.slice(i + 1),
        },
      });
      return;
    }

    const choice = aiMaltaChoice(target, ns);
    ns = resolveMaltaForCountry(target, choice, ewCard, playingCountry, ns);
  }

  const cs = ns.countries[playingCountry];
  ns = { ...ns, countries: { ...ns.countries, [playingCountry]: { ...cs, discard: [...cs.discard, ewCard] } } };
  set({ ...ns, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
  setTimeout(() => get().advanceToNextPhase(), 400);
}

// ---------------------------------------------------------------------------
// proceedWithElimination — handle pre-elimination reactives (Bushido / IHD),
// then eliminate, then check post-elimination reactives (Counter-Offensive),
// then continue with offensive responses / supply step.
// ---------------------------------------------------------------------------
function proceedWithElimination(
  battleSpaceId: string,
  attackingCountry: Country,
  targetPiece: Piece | undefined,
  state: GameState,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): void {
  console.log(`[AI] proceedWithElimination: space=${battleSpaceId}, attacker=${COUNTRY_NAMES[attackingCountry]}, target=${targetPiece?.country != null ? COUNTRY_NAMES[targetPiece.country] : 'none'}`);
  if (targetPiece) {
    if (targetPiece.country === Country.JAPAN && targetPiece.type === 'army') {
      const bushido = findBushidoOpportunity(battleSpaceId, attackingCountry, state);
      if (bushido) {
        set({
          ...state,
          phase: GamePhase.AWAITING_RESPONSE,
          pendingAction: {
            type: 'BUSHIDO_OPPORTUNITY',
            responseCountry: Country.JAPAN,
            statusCardId: bushido.card.id,
            statusCardName: bushido.card.name,
            battleSpaceId,
            attackingCountry,
          },
        });
        if (!state.countries[Country.JAPAN].isHuman) {
          setTimeout(() => {
            get().respondToOpportunity(
              aiShouldActivateBushido(gs(get()), battleSpaceId)
            );
          }, AI_DELAY);
        }
        return;
      }
    }

    if (targetPiece.country === Country.JAPAN && targetPiece.type === 'navy') {
      const ihd = findIslandDefenseOpportunity(
        battleSpaceId, attackingCountry, targetPiece.id, state
      );
      if (ihd) {
        set({
          ...state,
          phase: GamePhase.AWAITING_RESPONSE,
          pendingAction: {
            type: 'ISLAND_DEFENSE_OPPORTUNITY',
            responseCountry: Country.JAPAN,
            statusCardId: ihd.card.id,
            statusCardName: ihd.card.name,
            battleSpaceId,
            attackingCountry,
          },
        });
        if (!state.countries[Country.JAPAN].isHuman) {
          setTimeout(() => {
            get().respondToOpportunity(
              aiShouldActivateIslandDefense(gs(get()), battleSpaceId)
            );
          }, AI_DELAY);
        }
        return;
      }
    }
  }

  const eliminatedType = targetPiece?.type;
  const eliminatedCountry = targetPiece?.country;
  const ns = resolveBattleAction(battleSpaceId, attackingCountry, state, targetPiece?.id);
  continueAfterElimination(
    ns, battleSpaceId, attackingCountry, eliminatedType, eliminatedCountry, set, get
  );
}

// ---------------------------------------------------------------------------
// continueAfterElimination — check Counter-Offensive, then offensive
// responses, then supply step
// ---------------------------------------------------------------------------
function continueAfterElimination(
  state: GameState,
  battleSpaceId: string,
  attackingCountry: Country,
  eliminatedPieceType: 'army' | 'navy' | undefined,
  eliminatedPieceCountry: Country | undefined,
  set: (s: Partial<GameStoreState>) => void,
  get: () => GameStore
): void {
  let ns = state;

  if (
    eliminatedPieceType === 'army' &&
    eliminatedPieceCountry &&
    getTeam(eliminatedPieceCountry) === Team.AXIS
  ) {
    const co = findCounterOffensiveOpportunity(battleSpaceId, eliminatedPieceCountry, ns);
    if (co) {
      set({
        ...ns,
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'COUNTER_OFFENSIVE_OPPORTUNITY',
          responseCountry: Country.SOVIET_UNION,
          statusCardId: co.card.id,
          statusCardName: co.card.name,
          eliminatedSpaceId: battleSpaceId,
          eliminatedPieceCountry,
        },
      });
      if (!ns.countries[Country.SOVIET_UNION].isHuman) {
        setTimeout(() => {
          get().respondToOpportunity(
            aiShouldActivateCounterOffensive(gs(get()), battleSpaceId)
          );
        }, AI_DELAY);
      }
      return;
    }
  }

  if (eliminatedPieceType === 'army' && eliminatedPieceCountry) {
    const reinforcements = findAllyReinforcementResponses(eliminatedPieceCountry, battleSpaceId, ns);
    if (reinforcements.length > 0) {
      const reinf = reinforcements[0];
      set({
        ...ns,
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'ALLY_REINFORCEMENT_OPPORTUNITY',
          responseCountry: reinf.country,
          responseCardId: reinf.card.id,
          responseCardName: reinf.card.name,
          recruitCountry: reinf.recruitCountry,
          recruitSpaceId: battleSpaceId,
          description: reinf.description,
        },
      });
      if (!ns.countries[reinf.country].isHuman) {
        setTimeout(() => {
          const currentState = gs(get());
          const tempPiece: Piece = { id: 'supply_check', country: reinf.recruitCountry, type: 'army', spaceId: battleSpaceId };
          const tempState: GameState = {
            ...currentState,
            countries: {
              ...currentState.countries,
              [reinf.recruitCountry]: {
                ...currentState.countries[reinf.recruitCountry],
                piecesOnBoard: [...currentState.countries[reinf.recruitCountry].piecesOnBoard, tempPiece],
              },
            },
          };
          const wouldBeSupplied = isInSupply(tempPiece, tempState);
          get().respondToOpportunity(wouldBeSupplied);
        }, AI_DELAY);
      }
      return;
    }
  }

  const ctx = get().actionContext;
  if (!ctx) {
    goToSupplyStep(ns, set, get);
    return;
  }
  const battleType = ctx.battleType === 'sea' ? 'battle_sea' as const : 'battle_land' as const;
  // Pass ctx.usedOffensiveIds so cards that already fired this turn (e.g. Bias for
  // Action) are excluded.  Without this, Blitzkrieg could re-trigger Bias and vice-
  // versa, creating an infinite loop.
  if (tryOfferOffensiveResponse(battleType, battleSpaceId, ctx.country, ns, set, get, ctx.usedOffensiveIds)) return;
  if (proceedAfterAction(ns, set, get)) return;
  goToSupplyStep(ns, set, get);
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  initGame: (configs) => {
    const countries = {} as Record<Country, CountryState>;
    let anyHumanNeedsDiscard = false;
    for (const cfg of configs) {
      countries[cfg.country] = initializeCountryState(
        cfg.country,
        getCountryDeck(cfg.country),
        cfg.isHuman,
        cfg.aiDifficulty,
        cfg.isHuman
      );
      if (cfg.isHuman) anyHumanNeedsDiscard = true;
    }

    const firstHumanIdx = anyHumanNeedsDiscard
      ? TURN_ORDER.findIndex((c) => countries[c]?.isHuman)
      : -1;

    if (firstHumanIdx >= 0) {
      set({
        phase: GamePhase.SETUP_DISCARD,
        round: 1,
        currentCountryIndex: 0,
        countries,
        axisVP: 0,
        alliesVP: 0,
        log: [{
          round: 1,
          country: Country.GERMANY,
          message: 'Game starting — each country discards 3 cards from their initial hand of 10.',
          timestamp: Date.now(),
        }],
        supplyMarkers: { canada: false, szechuan: false, scorched_earth_ukraine: false, truk_supply: false },
        protections: [],
        winner: null,
        pendingAction: null,
        selectedCard: null,
        selectedDiscards: new Set(),
        actionContext: undefined,
        setupDiscardCountryIndex: firstHumanIdx,
      });
    } else {
      set({
        phase: GamePhase.PLAY_STEP,
        round: 1,
        currentCountryIndex: 0,
        countries,
        axisVP: 0,
        alliesVP: 0,
        log: [{
          round: 1,
          country: Country.GERMANY,
          message: 'Game started! Round 1 begins.',
          timestamp: Date.now(),
        }],
        supplyMarkers: { canada: false, szechuan: false, scorched_earth_ukraine: false, truk_supply: false },
        protections: [],
        winner: null,
        pendingAction: null,
        selectedCard: null,
        selectedDiscards: new Set(),
        actionContext: undefined,
        setupDiscardCountryIndex: 0,
      });
      setTimeout(() => {
        const s = gs(get());
        const c = getCurrentCountry(s);
        if (!s.countries[c].isHuman) get().runFullAiTurn();
      }, 300);
    }
  },

  confirmSetupDiscard: (cardIds) => {
    const store = get();
    if (store.phase !== GamePhase.SETUP_DISCARD) return;
    const idx = store.setupDiscardCountryIndex;
    const country = TURN_ORDER[idx];
    const cs = store.countries[country];
    if (!cs) return;

    if (cardIds.length !== INITIAL_DISCARD) return;

    const discarded = cs.hand.filter((c) => cardIds.includes(c.id));
    const remaining = cs.hand.filter((c) => !cardIds.includes(c.id));

    const newCountries = {
      ...store.countries,
      [country]: { ...cs, hand: remaining, discard: [...cs.discard, ...discarded] },
    };

    let nextIdx = idx + 1;
    while (nextIdx < TURN_ORDER.length && !newCountries[TURN_ORDER[nextIdx]]?.isHuman) {
      nextIdx++;
    }

    if (nextIdx >= TURN_ORDER.length) {
      set({
        countries: newCountries,
        phase: GamePhase.PLAY_STEP,
        selectedDiscards: new Set(),
        setupDiscardCountryIndex: 0,
        log: [...store.log, {
          round: 1,
          country: Country.GERMANY,
          message: 'All countries ready. Round 1 begins!',
          timestamp: Date.now(),
        }],
      });
      setTimeout(() => {
        const s = gs(get());
        const c = getCurrentCountry(s);
        if (!s.countries[c].isHuman) get().runFullAiTurn();
      }, 300);
    } else {
      set({
        countries: newCountries,
        setupDiscardCountryIndex: nextIdx,
        selectedDiscards: new Set(),
      });
    }
  },

  selectCard: (card) => {
    const s = gs(get());
    if (s.phase !== GamePhase.PLAY_STEP) return;
    if (s.pendingAction) return; // Block selection while resolving event/build effects
    if (card.country !== getCurrentCountry(s)) return;
    set({ selectedCard: card });
  },

  playSelectedCard: () => {
    const s = gs(get());
    if (!s.selectedCard || s.phase !== GamePhase.PLAY_STEP) return;
    if (s.pendingAction) return; // Block play while resolving event/build effects
    const card = s.selectedCard;
    const country = getCurrentCountry(s);
    const cState = s.countries[country];

    if (!cState.hand.some((c) => c.id === card.id)) return;

    const withCardRemoved: GameState = {
      ...s,
      countries: {
        ...s.countries,
        [country]: { ...cState, hand: cState.hand.filter((c) => c.id !== card.id) },
      },
      selectedCard: null,
    };

    // --- Battle of Britain: check card cancellation for German cards ---
    if (country === Country.GERMANY && cardTargetsUK(card)) {
      const bobResponse = findCardCancelResponses(country, card, withCardRemoved);
      if (bobResponse) {
        set({
          ...withCardRemoved,
          phase: GamePhase.AWAITING_RESPONSE,
          pendingAction: {
            type: 'CARD_CANCEL_OPPORTUNITY',
            responseCountry: bobResponse.country,
            responseCardId: bobResponse.card.id,
            responseCardName: bobResponse.card.name,
            cancelledCard: card,
            cancelledCardName: card.name,
            cancelledCountry: country,
          },
        });
        if (!withCardRemoved.countries[bobResponse.country].isHuman) {
          setTimeout(() => {
            get().respondToOpportunity(
              aiShouldActivateCardCancel(gs(get()), card)
            );
          }, AI_DELAY);
        }
        return;
      }
    }

    const playResult = playCard(card, withCardRemoved);
    const logMsg = card.type === CardType.RESPONSE ? 'Played a Response' : `Played ${card.name}`;
    const logged = addLogEntry(playResult.newState, country, logMsg);

    if (playResult.pendingAction) {
      set({ ...logged, pendingAction: playResult.pendingAction, phase: GamePhase.PLAY_STEP, actionContext: { type: 'build', country, spaceId: '', declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [], playedCard: card } });
      if (playResult.pendingAction.type === 'SELECT_EW_TARGET') {
        const isMaltaAuto = playResult.pendingAction.ewCard.effects.some((e: { condition?: string }) => e.condition === 'malta_submarines');
        if (isMaltaAuto || playResult.pendingAction.validTargets.length === 1) {
          setTimeout(() => get().selectEWTarget(playResult.pendingAction!.type === 'SELECT_EW_TARGET' ? (playResult.pendingAction as any).validTargets[0] : undefined), 100);
        }
      }
    } else if (playResult.eventBuildInfo) {
      if (handleEventBuildTrigger(playResult.eventBuildInfo, logged, set, get)) return;
      set({ ...logged, pendingAction: null, phase: GamePhase.SUPPLY_STEP });
      setTimeout(() => get().advanceToNextPhase(), 400);
    } else {
      set({ ...logged, pendingAction: null, phase: GamePhase.SUPPLY_STEP });
      setTimeout(() => get().advanceToNextPhase(), 400);
    }
  },

  handleSpaceClick: (spaceId) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa) return;
    const country = getCurrentCountry(s);

    if (pa.type === 'SELECT_BUILD_LOCATION' && pa.validSpaces.includes(spaceId)) {
      const buildCtry = pa.buildCountry ?? country;
      const built = resolveBuildAction(spaceId, pa.pieceType, buildCtry, s);
      const logged = addLogEntry(built, buildCtry, `Built ${pa.pieceType} in ${spaceId.replace(/_/g, ' ')}`);

      const builtPiece = logged.countries[buildCtry].piecesOnBoard.find(
        (p) => p.spaceId === spaceId && p.type === pa.pieceType
      );

      const prevCtx = get().actionContext;
      set({
        actionContext: {
          type: 'build',
          country,
          spaceId,
          builtPieceId: builtPiece?.id ?? '',
          builtPieceType: pa.pieceType,
          declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
          playedCard: prevCtx?.playedCard,
        },
      });

      const triggerType = pa.pieceType === 'army' ? 'build_army' as const : 'build_navy' as const;
      if (tryOfferOffensiveResponse(triggerType, spaceId, country, logged, set, get)) return;
      if (proceedAfterAction(logged, set, get)) return;
      goToSupplyStep(logged, set, get);
    }

    if (pa.type === 'SELECT_RECRUIT_LOCATION' && pa.validSpaces.includes(spaceId)) {
      if (pa.botContinuation) {
        let ns = resolveMobileForceAt(spaceId, s);
        ns = addLogEntry(ns, country, `${pa.eventCardName}: recruited navy in ${spaceId.replace(/_/g, ' ')}`);
        ns = { ...ns, pendingAction: null };
        continueBeginningOfTurnAfterMobileForce(ns, country, set, get);
        return;
      }

      const built = resolveBuildAction(spaceId, pa.pieceType, pa.recruitCountry, s);
      const logged = addLogEntry(built, country, `${pa.eventCardName}: built ${pa.pieceType} in ${spaceId.replace(/_/g, ' ')}`);

      const newRemaining = pa.remaining - 1;
      if (newRemaining > 0) {
        const avail = getAvailablePieces(pa.recruitCountry, logged);
        const hasPieces = pa.pieceType === 'navy' ? avail.navies > 0 : avail.armies > 0;
        if (hasPieces) {
          let newValidSpaces: string[];
          if (pa.baseWhere.length > 0) {
            newValidSpaces = getValidRecruitSpaces(
              { type: pa.pieceType === 'navy' ? 'RECRUIT_NAVY' : 'RECRUIT_ARMY', where: pa.baseWhere, condition: pa.baseCondition },
              pa.recruitCountry,
              logged
            );
          } else {
            const ctx = get().actionContext;
            const triggerSpace = ctx?.spaceId ?? '';
            const freshLocs = new Set(getValidBuildLocations(pa.recruitCountry, pa.pieceType, logged));
            newValidSpaces = triggerSpace ? getAdjacentSpaces(triggerSpace).filter((a) => freshLocs.has(a)) : [];
          }
          if (newValidSpaces.length > 0) {
            set({
              ...logged,
              pendingAction: { ...pa, validSpaces: newValidSpaces, remaining: newRemaining },
            });
            return;
          }
        }
      }

      if (pa.baseWhere.length === 0) {
        const ctx = get().actionContext;
        if (ctx) {
          const buildTrigger = pa.pieceType === 'army' ? 'build_army' as const : 'build_navy' as const;
          set({ ...logged, pendingAction: null });
          if (tryOfferOffensiveResponse(buildTrigger, spaceId, country, logged, set, get, ctx.usedOffensiveIds)) return;
          if (proceedAfterAction(logged, set, get)) return;
          goToSupplyStep(logged, set, get);
          return;
        }
      }

      set({ ...logged, pendingAction: null });
      goToSupplyStep(logged, set, get);
    }

    if (pa.type === 'SELECT_EVENT_SPACE' && pa.validSpaces.includes(spaceId)) {
      // Safety guard: the space-picker should only be resolved by the human player
      // who owns this action.  If playingCountry is an AI (e.g. a SELECT_EVENT_SPACE
      // that leaked into the store before maybeSetOrAutoResolveEventSpace could clear
      // it), ignore the human click and let the AI auto-resolve instead.
      if (!s.countries[pa.playingCountry].isHuman) {
        maybeSetOrAutoResolveEventSpace(pa, s, set, get);
        return;
      }
      let ns = resolveEventEffectAtSpace(pa.effectAction, spaceId, pa.effectCountry, pa.playingCountry, s, pa.eventCardName);

      const isBuildAction = pa.effectAction === 'build_army' || pa.effectAction === 'build_navy'
        || pa.effectAction === 'recruit_army' || pa.effectAction === 'recruit_navy';
      const newRemaining = pa.remaining - 1;
      if (isBuildAction) {
        const trigType = (pa.effectAction === 'build_navy' || pa.effectAction === 'recruit_navy')
          ? 'build_navy' as const : 'build_army' as const;
        const sameEffectRemaining: CardEffect[] = newRemaining > 0 && pa.skippable
          ? [{ type: pa.effectAction === 'recruit_army' ? 'RECRUIT_ARMY' : pa.effectAction === 'recruit_navy' ? 'RECRUIT_NAVY' : pa.effectAction === 'eliminate_army' ? 'ELIMINATE_ARMY' : 'BUILD_NAVY', where: pa.validSpaces, count: newRemaining, condition: pa.validSpaces.length > 5 ? 'adjacent_or_in' : undefined } as any]
          : [];
        const buildInfo: EventBuildInfo = {
          triggerType: trigType,
          spaceId,
          effectCountry: pa.effectCountry,
          remainingEffects: [...sameEffectRemaining, ...pa.remainingEffects],
          eventCardName: pa.eventCardName,
          playingCountry: pa.playingCountry,
        };
        if (handleEventBuildTrigger(buildInfo, ns, set, get)) return;
      }

      // After a battle event effect, check for offensive responses (Amphibious Landing, Blitzkrieg, etc.)
      const isBattleAction = pa.effectAction === 'land_battle' || pa.effectAction === 'sea_battle';
      if (isBattleAction) {
        const battleType = pa.effectAction === 'sea_battle' ? 'sea' as const : 'land' as const;
        // Bundle remaining same-type battles + other remaining effects into eventContinuation
        const remainingBattles: CardEffect[] = newRemaining > 0
          ? [{ type: pa.effectAction === 'sea_battle' ? 'SEA_BATTLE' : 'LAND_BATTLE', count: newRemaining } as CardEffect]
          : [];
        const allRemaining = [...remainingBattles, ...pa.remainingEffects];
        if (handleEventBattleTrigger(battleType, spaceId, pa.playingCountry, allRemaining, pa.eventCardName, ns, set, get)) return;
      }

      if (newRemaining > 0 && pa.skippable) {
        const recheck = processEventEffects(
          [{ type: pa.effectAction === 'recruit_army' ? 'RECRUIT_ARMY' : pa.effectAction === 'recruit_navy' ? 'RECRUIT_NAVY' : pa.effectAction === 'eliminate_army' ? 'ELIMINATE_ARMY' : 'LAND_BATTLE', where: pa.validSpaces, count: newRemaining, condition: pa.validSpaces.length > 5 ? 'adjacent_or_in' : undefined } as any],
          pa.eventCardName,
          pa.playingCountry,
          ns
        );
        ns = recheck.newState;
        if (recheck.pendingAction && recheck.pendingAction.type === 'SELECT_EVENT_SPACE') {
          set({ ...ns, pendingAction: { ...recheck.pendingAction, remainingEffects: pa.remainingEffects, skippable: true } });
          return;
        }
      }

      // Non-skippable mandatory multi-battle (e.g. Broad Front: 3 battles).
      // After each human selection re-prompt with fresh valid targets.
      if (newRemaining > 0 && !pa.skippable && pa.effectAction === 'land_battle') {
        const recheck = processEventEffects(
          [{ type: 'LAND_BATTLE' as const, count: newRemaining }],
          pa.eventCardName,
          pa.playingCountry,
          ns
        );
        if (recheck.pendingAction?.type === 'SELECT_EVENT_SPACE') {
          set({ ...recheck.newState, pendingAction: { ...recheck.pendingAction, remainingEffects: pa.remainingEffects } });
          return;
        }
        ns = recheck.newState;
      }

      if (pa.remainingEffects.length > 0) {
        const contResult = processEventEffects(pa.remainingEffects, pa.eventCardName, pa.playingCountry, ns);
        if (contResult.pendingAction) {
          set({ ...contResult.newState, pendingAction: contResult.pendingAction });
          return;
        }
        if (contResult.eventBuildInfo) {
          if (handleEventBuildTrigger(contResult.eventBuildInfo, contResult.newState, set, get)) return;
        }
        ns = contResult.newState;
      }

      set({ ...ns, pendingAction: null });
      goToSupplyStep(ns, set, get);
    }

    if (pa.type === 'SELECT_MOVE_DESTINATION' && pa.validSpaces.includes(spaceId)) {
      const destName = getSpace(spaceId)?.name ?? spaceId.replace(/_/g, ' ');
      const newPiece: Piece = { id: generatePieceId(), country: pa.country, type: pa.pieceType, spaceId };
      let ns: GameState = {
        ...s,
        pendingAction: null,
        countries: {
          ...s.countries,
          [pa.country]: {
            ...s.countries[pa.country],
            piecesOnBoard: [...s.countries[pa.country].piecesOnBoard, newPiece],
          },
        },
      };
      ns = addLogEntry(ns, pa.country, `${pa.eventCardName}: moved ${pa.pieceType} from ${pa.removedFromSpaceName} to ${destName}`);

      const nextPA = buildMovePiecesAction(pa.country, pa.eventCardName, pa.pieceTypeFilter, pa.movedPieceIds, pa.remainingEffects, pa.playingCountry, ns);
      if (nextPA) {
        set({ ...ns, pendingAction: nextPA });
      } else {
        if (pa.remainingEffects.length > 0) {
          const contResult = processEventEffects(pa.remainingEffects, pa.eventCardName, pa.playingCountry, ns);
          if (contResult.pendingAction) { set({ ...contResult.newState, pendingAction: contResult.pendingAction }); return; }
          if (contResult.eventBuildInfo) {
            if (handleEventBuildTrigger(contResult.eventBuildInfo, contResult.newState, set, get)) return;
          }
          ns = contResult.newState;
        }
        set({ ...ns, pendingAction: null });
        goToSupplyStep(ns, set, get);
      }
      return;
    }

    if (pa.type === 'SELECT_BATTLE_TARGET' && pa.validTargets.includes(spaceId)) {
      const spaceName = getSpace(spaceId)?.name ?? spaceId.replace(/_/g, ' ');
      const allPieces = getAllPieces(s);
      const enemyTeam = getEnemyTeam(country);
      const enemyPieces = allPieces.filter(
        (p) => p.spaceId === spaceId && getTeam(p.country) === enemyTeam
      );

      const prevBattleCtx = get().actionContext;
      set({
        actionContext: {
          type: 'battle',
          country,
          spaceId,
          battleType: pa.battleType,
          // Carry over usedOffensiveIds/usedStatusAbilityIds from any in-progress
          // chain (e.g. Bias for Action fired → human picks battle target here).
          // Resetting them to [] would let Bias re-fire after Blitzkrieg builds,
          // creating an infinite Bias ↔ Blitzkrieg loop.
          declinedCardIds: [],
          usedOffensiveIds: prevBattleCtx?.usedOffensiveIds ?? [],
          usedStatusAbilityIds: prevBattleCtx?.usedStatusAbilityIds ?? [],
          playedCard: prevBattleCtx?.playedCard,
        },
      });

      let ns = addLogEntry(s, country, `Battled in ${spaceName}`);

      // Check if attacker has "remove all in space" status — if so, all pieces
      // are removed automatically and there is nothing to choose.
      const hasRemoveAll = s.countries[country].statusCards.some((c) =>
        c.effects.some((e) => e.type === 'ELIMINATE_ARMY' && e.condition === 'all_in_space')
      );

      // When multiple enemy pieces from different countries share the space and
      // the attacker does NOT have a "remove all" ability, ask the human to
      // choose which piece to eliminate (or let the AI decide).
      if (enemyPieces.length > 1 && !hasRemoveAll) {
        if (s.countries[country].isHuman) {
          // Pause and show the piece picker — selectBattlePiece() resolves it.
          set({
            ...ns,
            pendingAction: {
              type: 'SELECT_BATTLE_PIECE',
              battleType: pa.battleType,
              battleSpaceId: spaceId,
              spaceName,
              attackingCountry: country,
              eligiblePieces: enemyPieces.map((p) => ({
                pieceId: p.id,
                country: p.country,
                pieceType: p.type,
              })),
            },
          });
          return;
        } else {
          // AI picks the most valuable enemy piece to eliminate.
          const bestPiece = aiBestPieceToEliminate(enemyPieces, s);
          const responses = findProtectionResponses(spaceId, bestPiece.country, ns, bestPiece.type, bestPiece.id);
          if (responses.length > 0) {
            const resp = responses[0];
            set({
              ...ns,
              phase: GamePhase.AWAITING_RESPONSE,
              pendingAction: {
                type: 'RESPONSE_OPPORTUNITY',
                responseCountry: resp.country,
                responseCardId: resp.card.id,
                responseCardName: resp.card.name,
                battleSpaceId: spaceId,
                eliminatedPieceId: bestPiece.id,
                eliminatedPieceCountry: bestPiece.country,
                attackingCountry: country,
              },
            });
            if (!ns.countries[resp.country].isHuman) {
              setTimeout(() => {
                get().respondToOpportunity(
                  aiShouldActivateProtection(gs(get()), resp.card, spaceId, resp.country)
                );
              }, AI_DELAY);
            }
            return;
          }
          proceedWithElimination(spaceId, country, bestPiece, ns, set, get);
          return;
        }
      }

      // Single enemy piece (or hasRemoveAll) — proceed as before.
      const targetPiece = enemyPieces[0];

      if (targetPiece) {
        const responses = findProtectionResponses(spaceId, targetPiece.country, ns, targetPiece.type, targetPiece.id);
        if (responses.length > 0) {
          const resp = responses[0];
          set({
            ...ns,
            phase: GamePhase.AWAITING_RESPONSE,
            pendingAction: {
              type: 'RESPONSE_OPPORTUNITY',
              responseCountry: resp.country,
              responseCardId: resp.card.id,
              responseCardName: resp.card.name,
              battleSpaceId: spaceId,
              eliminatedPieceId: targetPiece.id,
              eliminatedPieceCountry: targetPiece.country,
              attackingCountry: country,
            },
          });
          if (!ns.countries[resp.country].isHuman) {
            setTimeout(() => {
              const accept = aiShouldActivateProtection(
                gs(get()), resp.card, spaceId, resp.country
              );
              get().respondToOpportunity(accept);
            }, AI_DELAY);
          }
          return;
        }
      }

      proceedWithElimination(spaceId, country, targetPiece, ns, set, get);
    }

    if (pa.type === 'SELECT_BATTLE_PIECE' && pa.attackingCountry === country) {
      // Human clicked a space while the piece picker is open — ignore map clicks
      // in this state (piece selection is done via the CardHand UI buttons).
      return;
    }
  },

  toggleCardForDiscard: (cardId) => {
    const store = get();
    const sd = store.selectedDiscards;
    const isSetup = store.phase === GamePhase.SETUP_DISCARD;
    if (sd.has(cardId)) {
      const next = new Set(sd);
      next.delete(cardId);
      set({ selectedDiscards: next });
    } else if (isSetup) {
      if (sd.size < INITIAL_DISCARD) {
        const next = new Set(sd);
        next.add(cardId);
        set({ selectedDiscards: next });
      }
    } else {
      const next = new Set(sd);
      next.add(cardId);
      set({ selectedDiscards: next });
    }
  },

  confirmDiscardStep: (discardIndices) => {
    let s = gs(get());
    const country = getCurrentCountry(s);

    const cState = s.countries[country];

    const discarded: Card[] = [];
    const newHand = cState.hand.filter((c, i) => {
      if (discardIndices.includes(i)) { discarded.push(c); return false; }
      return true;
    });

    let ns: GameState = {
      ...s,
      countries: {
        ...s.countries,
        [country]: { ...cState, hand: newHand, discard: [...cState.discard, ...discarded] },
      },
    };

    ns = drawCards(country, ns);
    if (discarded.length > 0) {
      ns = addLogEntry(ns, country, `Discarded ${discarded.length} card(s)`);
    }

    if (discarded.length > 0 && getTeam(country) === Team.ALLIES && country !== Country.USA) {
      const arsenal = findArsenalOpportunity(country, ns);
      if (arsenal) {
        set({
          ...ns,
          phase: GamePhase.AWAITING_RESPONSE,
          pendingAction: {
            type: 'ARSENAL_OPPORTUNITY',
            responseCountry: Country.USA,
            statusCardId: arsenal.card.id,
            statusCardName: arsenal.card.name,
            targetCountry: country,
          },
          selectedDiscards: new Set(),
        });
        if (!ns.countries[Country.USA].isHuman) {
          setTimeout(() => {
            get().respondToOpportunity(
              aiShouldActivateArsenal(gs(get()), country)
            );
          }, AI_DELAY);
        }
        return;
      }
    }

    const isEndOfRound = ns.currentCountryIndex === TURN_ORDER.length - 1;
    if (isEndOfRound) {
      const w = checkSuddenVictory(ns);
      if (w) { set({ ...ns, phase: GamePhase.GAME_OVER, winner: w, selectedDiscards: new Set() }); return; }
    }

    let advanced = advanceTurn(ns);
    const nextCountry = getCurrentCountry(advanced);

    const spCard = findSuperiorPlanningOpportunity(nextCountry, advanced);
    if (spCard) {
      const isHuman = advanced.countries[nextCountry].isHuman;
      if (isHuman) {
        const topN = Math.min(4, advanced.countries[nextCountry].deck.length);
        if (topN >= 2) {
          const cardsToReorder = advanced.countries[nextCountry].deck.slice(0, topN);
          set({
            ...advanced,
            selectedDiscards: new Set(),
            pendingAction: { type: 'REORDER_CARDS', cards: cardsToReorder, statusCardName: spCard.name },
          });
          return;
        }
      } else {
        advanced = resolveSuperiorPlanning(advanced);
        advanced = addLogEntry(advanced, nextCountry, `${spCard.name}: examined and reordered top cards`);
      }
    }

    const vkCard = findVolkssturmOpportunity(nextCountry, advanced);
    if (vkCard) {
      const before = advanced;
      advanced = resolveVolkssturm(advanced);
      if (advanced !== before) {
        advanced = addLogEntry(advanced, nextCountry, `${vkCard.name}: recruited army in Germany (cost 1 deck card)`);
      }
    }

    const mfCard = findMobileForceOpportunity(nextCountry, advanced);
    if (mfCard) {
      const validSpaces = getValidMobileForceSpaces(advanced);
      if (validSpaces.length > 0) {
        if (advanced.countries[nextCountry].isHuman) {
          // Ask human whether to activate Mobile Force before showing location picker
          set({
            ...advanced,
            selectedDiscards: new Set<string>(),
            phase: GamePhase.AWAITING_RESPONSE,
            pendingAction: {
              type: 'BEGINNING_TURN_RESPONSE',
              responseCountry: Country.JAPAN,
              responseCardId: mfCard.id,
              responseCardName: mfCard.name,
              description: 'Recruit a Navy in or adjacent to North Pacific.',
              botType: 'mobile_force',
              validSpaces,
            },
          });
          return;
        } else {
          const diff = advanced.countries[nextCountry].aiDifficulty;
          const best = pickBestBuildLocation(validSpaces, Country.JAPAN, advanced, diff);
          advanced = resolveMobileForceAt(best, advanced);
          advanced = addLogEntry(advanced, nextCountry, `${mfCard.name}: recruited navy in ${best.replace(/_/g, ' ')}`);
        }
      }
    }

    const dmCard = findDefenseOfMotherlandOpportunity(nextCountry, advanced);
    if (dmCard) {
      const ussrIsHuman = advanced.countries[Country.SOVIET_UNION].isHuman;
      if (ussrIsHuman) {
        // Ask human whether to activate Defense of the Motherland
        set({
          ...advanced,
          selectedDiscards: new Set<string>(),
          phase: GamePhase.AWAITING_RESPONSE,
          pendingAction: {
            type: 'BEGINNING_TURN_RESPONSE',
            responseCountry: Country.SOVIET_UNION,
            responseCardId: dmCard.id,
            responseCardName: dmCard.name,
            description: 'Recruit an Army in or adjacent to Moscow; then eliminate an Axis Army in Moscow.',
          },
        });
        return;
      }
      // AI decision — use heuristic based on difficulty.
      const diff = advanced.countries[Country.SOVIET_UNION].aiDifficulty;
      if (aiShouldTriggerDefenseOfMotherland(advanced, diff)) {
        advanced = resolveDefenseOfMotherland(advanced);
      }
    }

    set({ ...advanced, selectedDiscards: new Set() });

    setTimeout(() => {
      const store = get();
      if (store.phase === GamePhase.GAME_OVER) return;
      const next = getCurrentCountry(gs(store));
      if (!store.countries[next].isHuman) store.runFullAiTurn();
    }, 300);
  },

  advanceToNextPhase: () => {
    const s = gs(get());
    const country = getCurrentCountry(s);

    if (s.phase === GamePhase.SUPPLY_STEP) {
      let pre = s;
      if (country === Country.JAPAN && !pre.supplyMarkers.truk_supply) {
        const trukCard = pre.countries[Country.JAPAN].responseCards.find(
          (c) => c.effects.some((e) => e.marker === 'truk_supply')
        );
        if (trukCard) {
          pre = { ...pre, supplyMarkers: { ...pre.supplyMarkers, truk_supply: true } };
          pre = activateProtectionResponse(Country.JAPAN, trukCard.id, pre);
          pre = addLogEntry(pre, Country.JAPAN, `Truk: Japanese pieces near Central Pacific are in supply`);
        }
      }
      const { newState, removed, supplyLog } = removeOutOfSupplyPieces(country, pre);
      let ns = newState;
      for (const msg of supplyLog) {
        ns = addLogEntry(ns, country, `Supply: ${msg}`);
      }
      if (removed.length > 0) {
        ns = addLogEntry(ns, country, `${removed.length} piece(s) removed (out of supply)`);
      }
      set({ ...ns, phase: GamePhase.VICTORY_STEP });
      setTimeout(() => get().advanceToNextPhase(), 300);
      return;
    }

    if (s.phase === GamePhase.VICTORY_STEP) {
      const vp = calculateVictoryPoints(country, s);
      const team = getTeam(country);
      let ns: GameState = {
        ...s,
        axisVP: team === Team.AXIS ? s.axisVP + vp : s.axisVP,
        alliesVP: team === Team.ALLIES ? s.alliesVP + vp : s.alliesVP,
      };
      if (vp > 0) ns = addLogEntry(ns, country, `Scored ${vp} Victory Points`);

      const rosieCard = findRosieOpportunity(country, ns);
      if (rosieCard && ns.countries[country].hand.length > 0) {
        if (ns.countries[country].isHuman) {
          set({
            ...ns,
            pendingAction: {
              type: 'SELECT_ROSIE_CARDS',
              handCards: [...ns.countries[country].hand],
              minCards: 0,
              maxCards: Math.min(2, ns.countries[country].hand.length),
            },
          });
          return;
        } else {
          const handBefore = ns.countries[country].hand.length;
          ns = resolveRosieAI(ns);
          const handAfter = ns.countries[country].hand.length;
          const returned = handBefore - handAfter;
          if (returned > 0) {
            ns = addLogEntry(ns, country, `Rosie the Riveter: returned ${returned} card(s) to bottom of deck`);
          }
        }
      }

      set({ ...ns, phase: GamePhase.DISCARD_STEP });
      if (!s.countries[country].isHuman) {
        setTimeout(() => get().advanceToNextPhase(), 200);
      }
      return;
    }

    if (s.phase === GamePhase.DISCARD_STEP) {
      if (s.countries[country].isHuman) return;
      const diff = s.countries[country].aiDifficulty;
      get().confirmDiscardStep(aiChooseDiscards(s, diff));
    }
  },

  executeAiTurn: async () => {
   try {
    let s = gs(get());
    const country = getCurrentCountry(s);
    const cState = s.countries[country];
    const diff = cState.aiDifficulty;
    console.log(`[AI] ${COUNTRY_NAMES[country]} starting turn, hand=${cState.hand.length}, phase=${s.phase}`);

    if (cState.hand.length === 0) {
      set({ ...addLogEntry(s, country, 'No cards to play'), phase: GamePhase.SUPPLY_STEP });
      await delay(AI_DELAY);
      get().advanceToNextPhase();
      return;
    }

    const altActions = getStatusAlternativeActions(country, s);
    const armiesOnBoard = cState.piecesOnBoard.filter((p) => p.type === 'army').length;
    const hasBuildInHand = cState.hand.some((c) => c.type === CardType.BUILD_ARMY);
    const hasDeckCostAlt = altActions.some((a) =>
      a.card.effects.some((e) => e.condition === 'deck_cost_build' || e.condition === 'deck_cost_battle')
    );

    let buildWouldBeSupplied = false;
    if (hasDeckCostAlt) {
      const validLocs = getValidBuildLocations(country, 'army', s);
      if (validLocs.length > 0) {
        const bestLoc = pickBestBuildLocation(validLocs, country, s, diff);
        const tempPiece: Piece = { id: 'supply_check', country, type: 'army', spaceId: bestLoc };
        const tempState: GameState = {
          ...s,
          countries: { ...s.countries, [country]: { ...cState, piecesOnBoard: [...cState.piecesOnBoard, tempPiece] } },
        };
        buildWouldBeSupplied = isInSupply(tempPiece, tempState);
      }
    }

    const shouldUseAlt = altActions.length > 0 && diff !== 'easy' && (
      cState.hand.length <= 3 ||
      (hasDeckCostAlt && !hasBuildInHand && buildWouldBeSupplied) ||
      (armiesOnBoard <= 2 && !hasBuildInHand && buildWouldBeSupplied)
    );
    if (shouldUseAlt) {
      const alt = altActions[0];
      console.log(`[AI] ${COUNTRY_NAMES[country]} using alt action: ${alt.card.name}`);
      const { newState, pendingAction: altPA } = executeStatusAlternativeAction(alt.card, country, s);
      let logged = addLogEntry(newState, country, `Used ${alt.card.name}`);

      // Resolve altPA for the AI *before* checking Enigma so that:
      // (a) the build/battle is never lost if Enigma fires, and
      // (b) Enigma always fires after the action is already complete.
      if (altPA) {
        if (altPA.type === 'SELECT_HAND_DISCARD') {
          const hand = logged.countries[country].hand;
          const scored = hand.map((c) => ({ id: c.id, score: c.type === CardType.STATUS ? 10 : c.type === CardType.EVENT ? 8 : c.type === CardType.RESPONSE ? 7 : c.type === CardType.ECONOMIC_WARFARE ? 6 : 1 }));
          scored.sort((a, b) => a.score - b.score);
          const picks = scored.slice(0, altPA.count).map((x) => x.id);
          const { newState: ns2, pendingAction: nextPA } = resolveHandDiscardAction(picks, altPA.statusCardId, altPA.afterAction, altPA.afterWhere, country, logged);
          if (nextPA) {
            const res2 = aiResolvePendingAction(ns2, nextPA, diff);
            if (typeof res2 === 'string' && res2) {
              let ns3 = ns2;
              if (nextPA.type === 'SELECT_BUILD_LOCATION') {
                ns3 = resolveBuildAction(res2, nextPA.pieceType, country, ns3);
                ns3 = addLogEntry(ns3, country, `Built ${nextPA.pieceType} in ${res2.replace(/_/g, ' ')}`);
              } else if (nextPA.type === 'SELECT_BATTLE_TARGET') {
                ns3 = resolveBattleAction(res2, country, ns3);
              }
              logged = ns3;
            } else {
              logged = ns2;
            }
          } else {
            logged = ns2;
          }
        } else {
          if (altPA.type === 'SELECT_PIECE_TO_REDEPLOY') {
            const rdCtry = altPA.redeployCountry;
            const pieceMappings = altPA.piecesOnBoard;
            if (aiShouldSkipRedeploy(pieceMappings, rdCtry, logged, diff)) {
              logged = addLogEntry(logged, rdCtry, `Declined to redeploy — all ${altPA.pieceType === 'navy' ? 'navies' : 'armies'} too valuable`);
            } else {
              const res = aiResolvePendingAction(logged, altPA, diff);
              if (typeof res === 'string' && res) {
                let ns = logged;
                const rmPiece = ns.countries[rdCtry].piecesOnBoard.find((p) => p.id === res);
                if (rmPiece) {
                  ns = { ...ns, countries: { ...ns.countries, [rdCtry]: { ...ns.countries[rdCtry], piecesOnBoard: ns.countries[rdCtry].piecesOnBoard.filter((p) => p.id !== res) } } };
                  ns = addLogEntry(ns, rdCtry, `Removed ${altPA.pieceType} from ${getSpace(rmPiece.spaceId)?.name ?? rmPiece.spaceId} for redeployment`);
                  const validSpaces = getValidBuildLocations(rdCtry, altPA.pieceType, ns);
                  if (validSpaces.length > 0) {
                    const buildLoc = pickBestBuildLocation(validSpaces, rdCtry, ns, diff);
                    ns = resolveBuildAction(buildLoc, altPA.pieceType, rdCtry, ns);
                    ns = addLogEntry(ns, rdCtry, `Built ${altPA.pieceType} in ${buildLoc.replace(/_/g, ' ')}`);
                  }
                }
                logged = ns;
              }
            }
          } else {
          const res = aiResolvePendingAction(logged, altPA, diff);
          if (typeof res === 'string' && res) {
            let ns = logged;
            if (altPA.type === 'SELECT_BUILD_LOCATION') {
              ns = resolveBuildAction(res, altPA.pieceType, country, ns);
              ns = addLogEntry(ns, country, `Built ${altPA.pieceType} in ${res.replace(/_/g, ' ')}`);
            } else if (altPA.type === 'SELECT_BATTLE_TARGET') {
              ns = resolveBattleAction(res, country, ns);
            }
            logged = ns;
          }
          }
        }
      }

      // Now check Enigma. If it fires for a human UK player we must set
      // AWAITING_RESPONSE so the prompt actually renders (ResponsePrompt gates
      // on that phase). altPA has already been resolved above, so no action is
      // lost regardless of the UK player's Enigma decision.
      const enigmaRes2 = checkAndResolveEnigma(country, alt.card.id, alt.card.name, logged);
      logged = enigmaRes2.newState;
      if (enigmaRes2.enigmaPending) {
        set({ ...logged, pendingAction: enigmaRes2.enigmaPending, phase: GamePhase.AWAITING_RESPONSE });
        return;
      }

      set({ ...logged, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
      await delay(AI_DELAY / 2);
      get().advanceToNextPhase();
      return;
    }

    const ci = aiChooseCard(s, diff);
    console.log(`[AI] ${COUNTRY_NAMES[country]} chose card index=${ci}`);
    if (ci < 0) {
      set({ phase: GamePhase.SUPPLY_STEP });
      await delay(AI_DELAY);
      get().advanceToNextPhase();
      return;
    }

    const card = cState.hand[ci];
    console.log(`[AI] ${COUNTRY_NAMES[country]} playing: ${card.name} (${card.type})`);
    set({ selectedCard: card });
    await delay(AI_DELAY);

    const fresh = gs(get());
    const freshCS = fresh.countries[country];
    const withRemoved: GameState = {
      ...fresh,
      countries: {
        ...fresh.countries,
        [country]: { ...freshCS, hand: freshCS.hand.filter((_, i) => i !== ci) },
      },
      selectedCard: null,
    };

    // --- Battle of Britain: check card cancellation for German cards ---
    if (country === Country.GERMANY && cardTargetsUK(card)) {
      const bobResponse = findCardCancelResponses(country, card, withRemoved);
      if (bobResponse) {
        set({
          ...withRemoved,
          phase: GamePhase.AWAITING_RESPONSE,
          pendingAction: {
            type: 'CARD_CANCEL_OPPORTUNITY',
            responseCountry: bobResponse.country,
            responseCardId: bobResponse.card.id,
            responseCardName: bobResponse.card.name,
            cancelledCard: card,
            cancelledCardName: card.name,
            cancelledCountry: country,
          },
        });
        if (!withRemoved.countries[bobResponse.country].isHuman) {
          await delay(AI_DELAY);
          get().respondToOpportunity(
            aiShouldActivateCardCancel(gs(get()), card)
          );
        }
        return;
      }
    }

    const aiPlayResult = playCard(card, withRemoved);
    const aiLogMsg = card.type === CardType.RESPONSE ? 'Played a Response' : `Played ${card.name}`;
    let ns = addLogEntry(aiPlayResult.newState, country, aiLogMsg);
    console.log(`[AI] ${COUNTRY_NAMES[country]} playCard result: pendingAction=${aiPlayResult.pendingAction?.type ?? 'null'}, eventBuildInfo=${!!aiPlayResult.eventBuildInfo}`);

    if (aiPlayResult.eventBuildInfo && !aiPlayResult.pendingAction) {
      if (handleEventBuildTrigger(aiPlayResult.eventBuildInfo, ns, set, get)) return;
      set({ ...ns, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
      await delay(AI_DELAY / 2);
      get().advanceToNextPhase();
      return;
    }

    const pendingAction = aiPlayResult.pendingAction;
    if (pendingAction) {
      if (pendingAction.type === 'SELECT_LEND_LEASE_TARGET') {
        const target = pendingAction.validTargets.reduce((best, c) => {
          const cs = ns.countries[c];
          return cs.hand.length + cs.deck.length > ns.countries[best].hand.length + ns.countries[best].deck.length ? c : best;
        }, pendingAction.validTargets[0]);
        ns = resolveLendLease(target, country, pendingAction.lendLeaseCard, ns);
        set({ ...ns, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
        await delay(AI_DELAY / 2);
        get().advanceToNextPhase();
        return;
      }

      if (pendingAction.type === 'SELECT_MOVE_PIECE') {
        ns = aiResolveMovePieces(pendingAction, ns, diff, country);
        if (pendingAction.remainingEffects.length > 0) {
          const contResult = processEventEffects(pendingAction.remainingEffects, pendingAction.eventCardName, pendingAction.playingCountry, ns);
          ns = contResult.newState;
          if (contResult.pendingAction) {
            // Route SELECT_EVENT_SPACE through the human-vs-AI gate so AI countries
            // never briefly expose the space-picker UI to the human player.
            if (contResult.pendingAction.type === 'SELECT_EVENT_SPACE') {
              maybeSetOrAutoResolveEventSpace(contResult.pendingAction, contResult.newState, set, get);
              return;
            }
            // For AI countries, auto-resolve any remaining pending action so the
            // game never hangs waiting for human input on an AI turn.
            if (!ns.countries[country].isHuman) {
              const subRes = aiResolvePendingAction(ns, contResult.pendingAction, diff);
              if (typeof subRes === 'string' && subRes) {
                if (contResult.pendingAction.type === 'SELECT_BUILD_LOCATION') {
                  ns = resolveBuildAction(subRes, contResult.pendingAction.pieceType, country, ns);
                  ns = addLogEntry(ns, country, `Built ${contResult.pendingAction.pieceType} in ${subRes.replace(/_/g, ' ')}`);
                } else if (contResult.pendingAction.type === 'SELECT_BATTLE_TARGET') {
                  ns = resolveBattleAction(subRes, country, ns);
                  ns = addLogEntry(ns, country, `Battled in ${getSpace(subRes)?.name ?? subRes.replace(/_/g, ' ')}`);
                } else if (contResult.pendingAction.type === 'SELECT_RECRUIT_LOCATION') {
                  ns = resolveBuildAction(subRes, contResult.pendingAction.pieceType, contResult.pendingAction.recruitCountry, ns);
                  ns = addLogEntry(ns, country, `Recruited ${contResult.pendingAction.pieceType} in ${subRes.replace(/_/g, ' ')}`);
                }
              }
              // Fall through to supply step below
            } else {
              set({ ...ns, pendingAction: contResult.pendingAction });
              return;
            }
          }
          if (contResult.eventBuildInfo) {
            if (handleEventBuildTrigger(contResult.eventBuildInfo, ns, set, get)) return;
          }
        }
        set({ ...ns, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
        await delay(AI_DELAY / 2);
        get().advanceToNextPhase();
        return;
      }

      if (pendingAction.type === 'SELECT_EVENT_CHOICE') {
        const chosenEffect = aiChooseEventEffect(pendingAction.choices, country, ns, diff);
        const { newState: resolved, pendingAction: nextPA } = resolveEventChoice(
          chosenEffect, pendingAction.eventCard, country, ns
        );
        ns = addLogEntry(resolved, country, `${pendingAction.eventCard.name}: chose ${chosenEffect.replace(/_/g, ' ').toLowerCase()}`);

        if (nextPA) {
          const res2 = aiResolvePendingAction(ns, nextPA, diff);
          if (typeof res2 === 'string' && res2) {
            if (nextPA.type === 'SELECT_BUILD_LOCATION') {
              ns = resolveBuildAction(res2, nextPA.pieceType, country, ns);
              ns = addLogEntry(ns, country, `Built ${nextPA.pieceType} in ${res2.replace(/_/g, ' ')}`);
              set({
                actionContext: {
                  type: 'build', country, spaceId: res2,
                  builtPieceId: ns.countries[country].piecesOnBoard.find((p) => p.spaceId === res2 && p.type === nextPA.pieceType)?.id ?? '',
                  builtPieceType: nextPA.pieceType,
                  declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
                  playedCard: card,
                },
              });
              const buildTrigger = nextPA.pieceType === 'army' ? 'build_army' as const : 'build_navy' as const;
              if (tryOfferOffensiveResponse(buildTrigger, res2, country, ns, set, get)) return;
              if (proceedAfterAction(ns, set, get)) return;
            } else if (nextPA.type === 'SELECT_BATTLE_TARGET') {
              const spaceName = getSpace(res2)?.name ?? res2.replace(/_/g, ' ');
              ns = addLogEntry(ns, country, `Battled in ${spaceName}`);
              set({
                actionContext: {
                  type: 'battle', country, spaceId: res2,
                  battleType: nextPA.battleType,
                  declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
                  playedCard: card,
                },
              });
              const allPieces2 = getAllPieces(ns);
              const enemyTeam2 = getEnemyTeam(country);
              const targetPiece2 = allPieces2.find(
                (p) => p.spaceId === res2 && getTeam(p.country) === enemyTeam2
              );
              if (targetPiece2) {
                const responses2 = findProtectionResponses(res2, targetPiece2.country, ns, targetPiece2.type, targetPiece2.id);
                if (responses2.length > 0) {
                  const resp2 = responses2[0];
                  set({
                    ...ns, phase: GamePhase.AWAITING_RESPONSE,
                    pendingAction: {
                      type: 'RESPONSE_OPPORTUNITY', responseCountry: resp2.country,
                      responseCardId: resp2.card.id, responseCardName: resp2.card.name,
                      battleSpaceId: res2, eliminatedPieceId: targetPiece2.id,
                      eliminatedPieceCountry: targetPiece2.country, attackingCountry: country,
                    },
                  });
                  if (!ns.countries[resp2.country].isHuman) {
                    await delay(AI_DELAY);
                    const accept = aiShouldActivateProtection(gs(get()), resp2.card, res2, resp2.country);
                    get().respondToOpportunity(accept);
                  }
                  return;
                }
              }
              proceedWithElimination(res2, country, targetPiece2, ns, set, get);
              return;
            }
          }
        }
        goToSupplyStep(ns, set, get);
        return;
      }

      if (pendingAction.type === 'SELECT_EW_TARGET') {
        const cancelResponses = findEWCancelResponses(country, ns);
        if (cancelResponses.length > 0) {
          const resp = cancelResponses[0];
          const target = aiPickEWTarget(pendingAction.validTargets, ns);
          set({
            ...ns,
            pendingAction: {
              type: 'EW_CANCEL_OPPORTUNITY',
              responseCountry: resp.country,
              responseCardId: resp.card.id,
              responseCardName: resp.card.name,
              ewCard: pendingAction.ewCard,
              ewTargetCountry: target,
              ewPlayingCountry: country,
            },
            phase: GamePhase.AWAITING_RESPONSE,
            actionContext: {
              type: 'ew', country, spaceId: '', ewCountry: country,
              declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
              playedCard: card,
            },
          });
          if (!ns.countries[resp.country].isHuman) {
            await delay(AI_DELAY);
            get().respondToOpportunity(true);
          }
          return;
        }

        const isMalta = pendingAction.ewCard.effects.some((e: { condition?: string }) => e.condition === 'malta_submarines');
        if (isMalta) {
          for (const target of [Country.GERMANY, Country.ITALY] as Country[]) {
            const hasNavy = countryHasNavyInMed(target, ns);
            const choice = hasNavy ? aiMaltaChoice(target, ns) : 'discard_cards';
            ns = resolveMaltaForCountry(target, choice, pendingAction.ewCard, country, ns);
          }
          const ewCs = ns.countries[country];
          ns = { ...ns, countries: { ...ns.countries, [country]: { ...ewCs, discard: [...ewCs.discard, pendingAction.ewCard] } } };
        } else {
          const target = aiPickEWTarget(pendingAction.validTargets, ns);
          ns = resolveEWAction(pendingAction.ewCard, target, country, ns);
        }

        set({
          actionContext: {
            type: 'ew',
            country,
            spaceId: '',
            ewCountry: country,
            declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
            playedCard: card,
          },
        });
        if (proceedAfterAction(ns, set, get)) return;
      } else {
        const res = aiResolvePendingAction(ns, pendingAction, diff);
        if (typeof res === 'string' && res) {
          if (pendingAction.type === 'SELECT_FROM_DISCARD') {
            // Inline resolution: selectFromDiscard requires store pendingAction
            // to be set, but executeAiTurn keeps it in a local variable. Resolve
            // Flexible Resources directly here instead.
            const { newState: frState, pendingAction: frPA } = resolveFlexibleResources(res, country, ns);
            ns = frState;
            if (frPA) {
              const frRes = aiResolvePendingAction(ns, frPA, diff);
              if (typeof frRes === 'string' && frRes) {
                if (frPA.type === 'SELECT_BUILD_LOCATION') {
                  const bc = frPA.buildCountry ?? country;
                  ns = resolveBuildAction(frRes, frPA.pieceType, bc, ns);
                  ns = addLogEntry(ns, bc, `Built ${frPA.pieceType} in ${frRes.replace(/_/g, ' ')}`);
                  set({
                    actionContext: {
                      type: 'build', country: bc, spaceId: frRes,
                      builtPieceId: ns.countries[bc].piecesOnBoard.find((p) => p.spaceId === frRes && p.type === frPA.pieceType)?.id ?? '',
                      builtPieceType: frPA.pieceType,
                      declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
                      playedCard: card,
                    },
                  });
                  const buildTrigger = frPA.pieceType === 'army' ? 'build_army' as const : 'build_navy' as const;
                  if (tryOfferOffensiveResponse(buildTrigger, frRes, bc, ns, set, get)) return;
                  if (proceedAfterAction(ns, set, get)) return;
                } else if (frPA.type === 'SELECT_BATTLE_TARGET') {
                  const spaceName = getSpace(frRes)?.name ?? frRes.replace(/_/g, ' ');
                  ns = addLogEntry(ns, country, `Battled in ${spaceName}`);
                  set({
                    actionContext: {
                      type: 'battle', country, spaceId: frRes,
                      battleType: frPA.battleType,
                      declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
                      playedCard: card,
                    },
                  });
                  const allPieces = getAllPieces(ns);
                  const enemyTeam = getEnemyTeam(country);
                  const targetPiece = allPieces.find(
                    (p) => p.spaceId === frRes && getTeam(p.country) === enemyTeam
                  );
                  proceedWithElimination(frRes, country, targetPiece, ns, set, get);
                  return;
                }
              }
            }
            goToSupplyStep(ns, set, get);
            return;
          }
          if (pendingAction.type === 'SELECT_EVENT_SPACE') {
            ns = resolveEventEffectAtSpace(pendingAction.effectAction, res, pendingAction.effectCountry, pendingAction.playingCountry, ns, pendingAction.eventCardName);

            const isAiBuild = pendingAction.effectAction === 'build_army' || pendingAction.effectAction === 'build_navy'
              || pendingAction.effectAction === 'recruit_army' || pendingAction.effectAction === 'recruit_navy';
            if (isAiBuild) {
              const aiBuildTrigType = (pendingAction.effectAction === 'build_navy' || pendingAction.effectAction === 'recruit_navy')
                ? 'build_navy' as const : 'build_army' as const;
              const aiBuildInfo: EventBuildInfo = {
                triggerType: aiBuildTrigType,
                spaceId: res,
                effectCountry: pendingAction.effectCountry,
                remainingEffects: pendingAction.remainingEffects,
                eventCardName: pendingAction.eventCardName,
                playingCountry: pendingAction.playingCountry,
              };
              if (handleEventBuildTrigger(aiBuildInfo, ns, set, get)) return;
            }

            let rem = pendingAction.remaining - 1;
            while (rem > 0 && pendingAction.skippable) {
              const recheck = processEventEffects(
                [{ type: pendingAction.effectAction === 'recruit_army' ? 'RECRUIT_ARMY' : pendingAction.effectAction === 'recruit_navy' ? 'RECRUIT_NAVY' : pendingAction.effectAction === 'eliminate_army' ? 'ELIMINATE_ARMY' : 'LAND_BATTLE', where: pendingAction.validSpaces, count: rem, condition: pendingAction.validSpaces.length > 5 ? 'adjacent_or_in' : undefined } as any],
                pendingAction.eventCardName,
                pendingAction.playingCountry,
                ns
              );
              ns = recheck.newState;
              if (recheck.pendingAction && recheck.pendingAction.type === 'SELECT_EVENT_SPACE' && recheck.pendingAction.validSpaces.length > 0) {
                const pick = pickBestBuildLocation(recheck.pendingAction.validSpaces, pendingAction.effectCountry, ns, diff);
                if (!pick) break;
                ns = resolveEventEffectAtSpace(pendingAction.effectAction, pick, pendingAction.effectCountry, pendingAction.playingCountry, ns, pendingAction.eventCardName);
                rem--;
              } else {
                if (recheck.eventBuildInfo) {
                  if (handleEventBuildTrigger(recheck.eventBuildInfo, recheck.newState, set, get)) return;
                  ns = recheck.newState;
                }
                break;
              }
            }

            // Non-skippable mandatory multi-battle (e.g. Broad Front: 3 battles).
            // Hard AI picks the best target for each remaining battle.
            if (rem > 0 && !pendingAction.skippable && pendingAction.effectAction === 'land_battle') {
              while (rem > 0) {
                const recheck = processEventEffects(
                  [{ type: 'LAND_BATTLE' as const, count: rem }],
                  pendingAction.eventCardName,
                  pendingAction.playingCountry,
                  ns
                );
                ns = recheck.newState;
                if (recheck.pendingAction?.type === 'SELECT_EVENT_SPACE' && recheck.pendingAction.validSpaces.length > 0) {
                  const nextPick = pickBestBattleTarget(recheck.pendingAction.validSpaces, pendingAction.effectCountry, ns, diff);
                  if (!nextPick) break;
                  ns = resolveEventEffectAtSpace('land_battle', nextPick, pendingAction.effectCountry, pendingAction.playingCountry, ns, pendingAction.eventCardName);
                  rem--;
                } else {
                  break;
                }
              }
            }

            if (pendingAction.remainingEffects.length > 0) {
              const contResult = processEventEffects(pendingAction.remainingEffects, pendingAction.eventCardName, pendingAction.playingCountry, ns);
              ns = contResult.newState;
              if (contResult.eventBuildInfo) {
                if (handleEventBuildTrigger(contResult.eventBuildInfo, ns, set, get)) return;
              }
              if (contResult.pendingAction && contResult.pendingAction.type === 'SELECT_EVENT_SPACE') {
                const pick2 = pickBestBuildLocation(contResult.pendingAction.validSpaces, contResult.pendingAction.effectCountry, ns, diff);
                if (pick2) {
                  ns = resolveEventEffectAtSpace(contResult.pendingAction.effectAction, pick2, contResult.pendingAction.effectCountry, contResult.pendingAction.playingCountry, ns, contResult.pendingAction.eventCardName);
                  if (contResult.pendingAction.remainingEffects.length > 0) {
                    const contResult2 = processEventEffects(contResult.pendingAction.remainingEffects, contResult.pendingAction.eventCardName, contResult.pendingAction.playingCountry, ns);
                    ns = contResult2.newState;
                    if (contResult2.eventBuildInfo) {
                      if (handleEventBuildTrigger(contResult2.eventBuildInfo, ns, set, get)) return;
                    }
                  }
                }
              }
            }

            if (proceedAfterAction(ns, set, get)) return;
          } else if (pendingAction.type === 'SELECT_RECRUIT_LOCATION') {
            ns = resolveBuildAction(res, pendingAction.pieceType, pendingAction.recruitCountry, ns);
            ns = addLogEntry(ns, country, `${pendingAction.eventCardName}: recruited ${pendingAction.pieceType} in ${res.replace(/_/g, ' ')}`);

            let rem = pendingAction.remaining - 1;
            while (rem > 0) {
              const avail = getAvailablePieces(pendingAction.recruitCountry, ns);
              const hasPcs = pendingAction.pieceType === 'navy' ? avail.navies > 0 : avail.armies > 0;
              if (!hasPcs) break;
              const newValid = getValidRecruitSpaces(
                { type: pendingAction.pieceType === 'navy' ? 'RECRUIT_NAVY' : 'RECRUIT_ARMY', where: pendingAction.baseWhere, condition: pendingAction.baseCondition },
                pendingAction.recruitCountry,
                ns
              );
              if (newValid.length === 0) break;
              const nextPick = pickBestBuildLocation(newValid, pendingAction.recruitCountry, ns, diff);
              if (!nextPick) break;
              ns = resolveBuildAction(nextPick, pendingAction.pieceType, pendingAction.recruitCountry, ns);
              ns = addLogEntry(ns, country, `${pendingAction.eventCardName}: recruited ${pendingAction.pieceType} in ${nextPick.replace(/_/g, ' ')}`);
              rem--;
            }

            if (proceedAfterAction(ns, set, get)) return;
          } else if (pendingAction.type === 'SELECT_RECRUIT_COUNTRY') {
            const chosenIdx = Number(res);
            const chosenCountry = isNaN(chosenIdx) ? pendingAction.validCountries[0] : chosenIdx as unknown as Country;
            const rcResult = resolveRecruitCountryChoice(
              chosenCountry, pendingAction.where, pendingAction.eventCardName,
              pendingAction.playingCountry, pendingAction.remainingEffects, ns
            );
            ns = rcResult.newState;
            if (rcResult.pendingAction) {
              const subRes = aiResolvePendingAction(ns, rcResult.pendingAction, diff);
              if (typeof subRes === 'string' && subRes && rcResult.pendingAction.type === 'SELECT_EVENT_SPACE') {
                ns = resolveEventEffectAtSpace(
                  rcResult.pendingAction.effectAction, subRes,
                  rcResult.pendingAction.effectCountry, rcResult.pendingAction.playingCountry,
                  ns, rcResult.pendingAction.eventCardName
                );
                if (rcResult.pendingAction.remainingEffects.length > 0) {
                  const contSt = processEventEffects(
                    rcResult.pendingAction.remainingEffects, rcResult.pendingAction.eventCardName,
                    rcResult.pendingAction.playingCountry, ns
                  );
                  ns = contSt.newState;
                  if (contSt.eventBuildInfo) {
                    if (handleEventBuildTrigger(contSt.eventBuildInfo, ns, set, get)) return;
                  }
                }
              }
            }
            ns = addLogEntry(ns, country, `${pendingAction.eventCardName}: chose ${COUNTRY_NAMES[chosenCountry]} army`);
            if (proceedAfterAction(ns, set, get)) return;
          } else if (pendingAction.type === 'SELECT_PIECE_TO_REDEPLOY') {
            const rdCountry = pendingAction.redeployCountry;
            const pieceMappings = pendingAction.piecesOnBoard;
            if (aiShouldSkipRedeploy(pieceMappings, rdCountry, ns, diff)) {
              ns = addLogEntry(ns, rdCountry, `Declined to redeploy — all ${pendingAction.pieceType === 'navy' ? 'navies' : 'armies'} too valuable`);
            } else {
            const removePiece = ns.countries[rdCountry].piecesOnBoard.find((p) => p.id === res);
            if (removePiece) {
              const rmName = getSpace(removePiece.spaceId)?.name ?? removePiece.spaceId.replace(/_/g, ' ');
              ns = {
                ...ns,
                countries: { ...ns.countries, [rdCountry]: { ...ns.countries[rdCountry], piecesOnBoard: ns.countries[rdCountry].piecesOnBoard.filter((p) => p.id !== res) } },
              };
              ns = addLogEntry(ns, rdCountry, `Removed ${pendingAction.pieceType} from ${rmName} for redeployment`);

              if (pendingAction.currentEffect && pendingAction.eventCardName && pendingAction.playingCountry != null) {
                const allEffects = [pendingAction.currentEffect, ...(pendingAction.remainingEffects ?? [])];
                const result = processEventEffects(allEffects, pendingAction.eventCardName, pendingAction.playingCountry, ns);
                ns = result.newState;
                if (result.pendingAction) {
                  // Route SELECT_EVENT_SPACE through maybeSetOrAutoResolveEventSpace so AI
                  // countries (e.g. USA when Patton Advances triggers a redeploy) never hand
                  // the space-picker UI to the wrong (human) player.
                  if (result.pendingAction.type === 'SELECT_EVENT_SPACE') {
                    maybeSetOrAutoResolveEventSpace(result.pendingAction, result.newState, set, get);
                    return;
                  }
                  // For AI countries, auto-resolve any remaining pending action so the
                  // game never hangs waiting for human input on an AI turn.
                  if (!ns.countries[rdCountry].isHuman) {
                    const subRes = aiResolvePendingAction(ns, result.pendingAction, diff);
                    if (typeof subRes === 'string' && subRes) {
                      if (result.pendingAction.type === 'SELECT_BUILD_LOCATION') {
                        ns = resolveBuildAction(subRes, result.pendingAction.pieceType, rdCountry, ns);
                        ns = addLogEntry(ns, rdCountry, `Built ${result.pendingAction.pieceType} in ${subRes.replace(/_/g, ' ')}`);
                      } else if (result.pendingAction.type === 'SELECT_BATTLE_TARGET') {
                        ns = resolveBattleAction(subRes, rdCountry, ns);
                        ns = addLogEntry(ns, rdCountry, `Battled in ${getSpace(subRes)?.name ?? subRes.replace(/_/g, ' ')}`);
                      } else if (result.pendingAction.type === 'SELECT_RECRUIT_LOCATION') {
                        const rCountry = result.pendingAction.recruitCountry ?? rdCountry;
                        ns = resolveBuildAction(subRes, result.pendingAction.pieceType, rCountry, ns);
                        ns = addLogEntry(ns, rdCountry, `Recruited ${result.pendingAction.pieceType} in ${subRes.replace(/_/g, ' ')}`);
                      }
                    }
                    // Fall through to proceedAfterAction / supply step below
                  } else {
                    set({ ...ns, pendingAction: result.pendingAction });
                    return;
                  }
                }
                if (result.eventBuildInfo) {
                  if (handleEventBuildTrigger(result.eventBuildInfo, ns, set, get)) return;
                }
              } else {
                const validSpaces = getValidBuildLocations(rdCountry, pendingAction.pieceType, ns);
                if (validSpaces.length > 0) {
                  const buildLoc = pickBestBuildLocation(validSpaces, rdCountry, ns, diff);
                  ns = resolveBuildAction(buildLoc, pendingAction.pieceType, rdCountry, ns);
                  ns = addLogEntry(ns, rdCountry, `Built ${pendingAction.pieceType} in ${buildLoc.replace(/_/g, ' ')}`);
                  const builtPc = ns.countries[rdCountry].piecesOnBoard.find((p) => p.spaceId === buildLoc && p.type === pendingAction.pieceType);
                  set({
                    actionContext: {
                      type: 'build', country: rdCountry, spaceId: buildLoc, builtPieceId: builtPc?.id ?? '',
                      builtPieceType: pendingAction.pieceType,
                      declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [], playedCard: card,
                    },
                  });
                  const buildTrigger = pendingAction.pieceType === 'army' ? 'build_army' as const : 'build_navy' as const;
                  if (tryOfferOffensiveResponse(buildTrigger, buildLoc, rdCountry, ns, set, get)) return;
                }
              }
            }
            }
            if (proceedAfterAction(ns, set, get)) return;
          } else if (pendingAction.type === 'SELECT_BUILD_LOCATION') {
            const bCtry = pendingAction.buildCountry ?? country;
            ns = resolveBuildAction(res, pendingAction.pieceType, bCtry, ns);
            ns = addLogEntry(ns, bCtry, `Built ${pendingAction.pieceType} in ${res.replace(/_/g, ' ')}`);

            const builtPiece = ns.countries[bCtry].piecesOnBoard.find(
              (p) => p.spaceId === res && p.type === pendingAction.pieceType
            );

            set({
              actionContext: {
                type: 'build',
                country: bCtry,
                spaceId: res,
                builtPieceId: builtPiece?.id ?? '',
                builtPieceType: pendingAction.pieceType,
                declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
                playedCard: card,
              },
            });

            const buildTrigger = pendingAction.pieceType === 'army' ? 'build_army' as const : 'build_navy' as const;
            if (tryOfferOffensiveResponse(buildTrigger, res, bCtry, ns, set, get)) return;
            if (proceedAfterAction(ns, set, get)) return;
          } else if (pendingAction.type === 'SELECT_BATTLE_TARGET') {
            const spaceName = getSpace(res)?.name ?? res.replace(/_/g, ' ');
            ns = addLogEntry(ns, country, `Battled in ${spaceName}`);

            set({
              actionContext: {
                type: 'battle',
                country,
                spaceId: res,
                battleType: pendingAction.battleType,
                declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
                playedCard: card,
              },
            });

            const allPieces = getAllPieces(ns);
            const enemyTeam = getEnemyTeam(country);
            const targetPiece = allPieces.find(
              (p) => p.spaceId === res && getTeam(p.country) === enemyTeam
            );

            if (targetPiece) {
              const responses = findProtectionResponses(res, targetPiece.country, ns, targetPiece.type, targetPiece.id);
              if (responses.length > 0) {
                const resp = responses[0];
                set({
                  ...ns,
                  phase: GamePhase.AWAITING_RESPONSE,
                  pendingAction: {
                    type: 'RESPONSE_OPPORTUNITY',
                    responseCountry: resp.country,
                    responseCardId: resp.card.id,
                    responseCardName: resp.card.name,
                    battleSpaceId: res,
                    eliminatedPieceId: targetPiece.id,
                    eliminatedPieceCountry: targetPiece.country,
                    attackingCountry: country,
                  },
                });

                if (!ns.countries[resp.country].isHuman) {
                  await delay(AI_DELAY);
                  const accept = aiShouldActivateProtection(
                    gs(get()), resp.card, res, resp.country
                  );
                  get().respondToOpportunity(accept);
                }
                return;
              }
            }

            proceedWithElimination(res, country, targetPiece, ns, set, get);
            return;
          }
        }
      }
    }

    goToSupplyStep(ns, set, get);
   } catch (err) {
    console.error('[AI Turn Error]', err);
    // Safety: force-advance to supply step so the game never hangs
    const recovery = gs(get());
    const country = getCurrentCountry(recovery);
    const logged = addLogEntry(recovery, country, 'AI encountered an error — skipping turn');
    set({ ...logged, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined, selectedCard: null });
    setTimeout(() => get().advanceToNextPhase(), 400);
   }
  },

  respondToOpportunity: (accept) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa) { console.warn('[AI] respondToOpportunity called with no pendingAction'); return; }
    console.log(`[AI] respondToOpportunity: type=${pa.type}, accept=${accept}`);

    // --- Protection Response (existing) ---
    if (pa.type === 'RESPONSE_OPPORTUNITY') {
      let ns = s;
      const spaceName = getSpace(pa.battleSpaceId)?.name ?? pa.battleSpaceId.replace(/_/g, ' ');
      const ctx = get().actionContext;
      const isChain = !!ctx?.chainTrigger;

      if (accept) {
        ns = activateProtectionResponse(pa.responseCountry, pa.responseCardId, ns);
        ns = addLogEntry(
          ns,
          pa.responseCountry,
          `Activated ${pa.responseCardName} — piece protected in ${spaceName}`
        );
        if (isChain) {
          resumeChain(ns, set, get);
        } else {
          const battleType = getSpace(pa.battleSpaceId)?.type === 'SEA' ? 'battle_sea' as const : 'battle_land' as const;
          if (tryOfferOffensiveResponse(battleType, pa.battleSpaceId, pa.attackingCountry, ns, set, get, ctx?.usedOffensiveIds)) return;
          if (proceedAfterAction(ns, set, get)) return;
          goToSupplyStep(ns, set, get);
        }
      } else {
        if (isChain) {
          const elim = ctx.chainPendingElimination;
          if (elim) {
            performChainElimination(elim, pa.attackingCountry, ns, set, get);
          } else {
            resumeChain(ns, set, get);
          }
        } else {
          const allPieces = getAllPieces(ns);
          const targetPiece = allPieces.find((p) => p.id === pa.eliminatedPieceId);
          proceedWithElimination(pa.battleSpaceId, pa.attackingCountry, targetPiece, ns, set, get);
        }
      }
      return;
    }

    // --- Offensive Response (supports both response and status cards, chains multiple) ---
    if (pa.type === 'OFFENSIVE_RESPONSE_OPPORTUNITY') {
      let ns = s;
      const country = pa.responseCountry;
      const ctx = get().actionContext;
      const usedIds = [...(ctx?.usedOffensiveIds ?? []), pa.responseCardId];

      if (accept) {
        const card = ns.countries[country].responseCards.find((c) => c.id === pa.responseCardId)
          || ns.countries[country].statusCards.find((c) => c.id === pa.responseCardId);
        if (card) {
          const isStatusCard = card.type === CardType.STATUS;
          const handCostEffect = card.effects.find((e) => e.handCost);

          if (handCostEffect?.handCost && isStatusCard) {
            if (ns.countries[country].isHuman) {
              set({
                ...ns,
                phase: GamePhase.PLAY_STEP,
                pendingAction: {
                  type: 'SELECT_OFFENSIVE_HAND_DISCARD',
                  count: handCostEffect.handCost,
                  offensiveCardId: card.id,
                  triggerSpaceId: pa.triggerSpaceId,
                },
                actionContext: {
                  ...(ctx ?? { type: 'build', country, spaceId: '', declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [] }),
                  usedOffensiveIds: usedIds,
                },
              });
              return;
            }
            ns = autoDiscardFromHand(country, handCostEffect.handCost, card.name, ns);
          }

          const result = resolveOffensiveResponse(card, pa.triggerSpaceId, country, ns);
          processOffensiveResult(result, card, isStatusCard, country, pa.triggerSpaceId, usedIds, ns, set, get);
          return;
        }
      }

      finishOffensiveChain(ns, country, usedIds, undefined, undefined, set, get);
      return;
    }

    // --- EW Cancel Opportunity (ASW Tactics) ---
    if (pa.type === 'EW_CANCEL_OPPORTUNITY') {
      let ns = s;
      if (accept) {
        ns = activateProtectionResponse(pa.responseCountry, pa.responseCardId, ns);
        ns = addLogEntry(ns, pa.responseCountry, `${pa.responseCardName}: cancelled ${pa.ewCard.name}`);
        const cs = ns.countries[pa.ewPlayingCountry];
        ns = { ...ns, countries: { ...ns.countries, [pa.ewPlayingCountry]: { ...cs, discard: [...cs.discard, pa.ewCard] } } };
      } else {
        const isMalta = pa.ewCard.effects.some((e: { condition?: string }) => e.condition === 'malta_submarines');
        if (isMalta) {
          continueMaltaResolution(ns, pa.ewCard, pa.ewPlayingCountry, [Country.GERMANY, Country.ITALY], set, get);
          return;
        }
        ns = resolveEWAction(pa.ewCard, pa.ewTargetCountry, pa.ewPlayingCountry, ns);
      }
      set({
        ...ns,
        pendingAction: null,
        actionContext: {
          type: 'ew', country: pa.ewPlayingCountry, spaceId: '', ewCountry: pa.ewPlayingCountry,
          declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
        },
      });
      if (proceedAfterAction(ns, set, get)) return;
      goToSupplyStep(ns, set, get);
      return;
    }

    // --- EW Counter Opportunity ---
    if (pa.type === 'EW_COUNTER_OPPORTUNITY') {
      let ns = s;

      if (accept) {
        ns = resolveEWCounter(pa.responseCountry, pa.responseCardId, ns);
        ns = addLogEntry(ns, pa.responseCountry, `${pa.responseCardName}: drew a card to counter Economic Warfare`);
      } else {
        const ctx = get().actionContext;
        if (ctx) {
          set({ actionContext: { ...ctx, declinedCardIds: [...ctx.declinedCardIds, pa.responseCardId] } });
        }
      }

      if (proceedAfterAction(ns, set, get)) return;
      goToSupplyStep(ns, set, get);
      return;
    }

    // --- Beginning-of-Turn Response (Mobile Force / Defense of the Motherland) ---
    if (pa.type === 'BEGINNING_TURN_RESPONSE') {
      let advanced = s;
      const country = getCurrentCountry(advanced);

      // --- Mobile Force ---
      if (pa.botType === 'mobile_force') {
        if (accept && pa.validSpaces && pa.validSpaces.length > 0) {
          // Human accepted — show location picker for navy placement
          set({
            ...advanced,
            selectedDiscards: new Set<string>(),
            pendingAction: {
              type: 'SELECT_RECRUIT_LOCATION',
              pieceType: 'navy',
              validSpaces: pa.validSpaces,
              remaining: 1,
              baseWhere: ['north_pacific'],
              baseCondition: 'adjacent_or_in',
              recruitCountry: Country.JAPAN,
              eventCardName: pa.responseCardName,
              botContinuation: true,
            },
          });
          return;
        }
        // Declined Mobile Force — continue to check Defense of Motherland
        const ns = { ...advanced, pendingAction: null };
        continueBeginningOfTurnAfterMobileForce(ns, country, set, get);
        return;
      }

      // --- Defense of the Motherland ---
      if (accept) {
        advanced = resolveDefenseOfMotherland(advanced);
      }
      // Declining keeps the card in responseCards for future turns.
      set({ ...advanced, pendingAction: null, selectedDiscards: new Set<string>() });
      setTimeout(() => {
        const store = get();
        if (store.phase === GamePhase.GAME_OVER) return;
        const next = getCurrentCountry(gs(store));
        if (!store.countries[next].isHuman) store.runFullAiTurn();
      }, 300);
      return;
    }

    // --- Build Reaction Opportunity (Loyal to Crown, Kamikaze, Rasputitsa,
    //     Defense of Motherland, Axis Alliance) ---
    if (pa.type === 'BUILD_REACTION_OPPORTUNITY') {
      let ns = s;
      const ctx = get().actionContext;
      const isChain = !!ctx?.chainTrigger;

      if (accept) {
        const card = ns.countries[pa.responseCountry].responseCards.find(
          (c) => c.id === pa.responseCardId
        );
        if (card) {
          const result = resolveBuildReaction(
            card,
            pa.buildSpaceId,
            pa.buildCountry,
            pa.builtPieceId,
            pa.responseCountry,
            ns
          );
          ns = result.newState;
          ns = addLogEntry(ns, pa.responseCountry, result.message);
        }
      } else {
        if (ctx) {
          set({ actionContext: { ...ctx, declinedCardIds: [...ctx.declinedCardIds, pa.responseCardId] } });
        }
      }

      if (isChain) {
        resumeChain(ns, set, get);
        return;
      }
      if (proceedAfterAction(ns, set, get)) return;
      goToSupplyStep(ns, set, get);
      return;
    }

    // --- Battle Reaction Opportunity (Romanian Reinforcements) ---
    if (pa.type === 'BATTLE_REACTION_OPPORTUNITY') {
      let ns = s;

      if (accept) {
        const card = ns.countries[pa.responseCountry].responseCards.find(
          (c) => c.id === pa.responseCardId
        );
        if (card) {
          const result = resolveBattleReaction(card, pa.responseCountry, ns);
          ns = result.newState;
          ns = addLogEntry(ns, pa.responseCountry, result.message);
        }
      } else {
        const ctx = get().actionContext;
        if (ctx) {
          set({ actionContext: { ...ctx, declinedCardIds: [...ctx.declinedCardIds, pa.responseCardId] } });
        }
      }

      if (proceedAfterAction(ns, set, get)) return;
      goToSupplyStep(ns, set, get);
      return;
    }

    // --- Ally Reinforcement Opportunity (German/Romanian Reinforcements) ---
    if (pa.type === 'ALLY_REINFORCEMENT_OPPORTUNITY') {
      let ns = s;

      if (accept) {
        const card = ns.countries[pa.responseCountry].responseCards.find(
          (c) => c.id === pa.responseCardId
        );
        if (card) {
          const result = resolveAllyReinforcement(card, pa.recruitCountry, pa.recruitSpaceId, pa.responseCountry, ns);
          ns = result.newState;
          ns = addLogEntry(ns, pa.responseCountry, result.message);
        }
      } else {
        const ctx = get().actionContext;
        if (ctx) {
          set({ actionContext: { ...ctx, declinedCardIds: [...ctx.declinedCardIds, pa.responseCardId] } });
        }
      }

      const ctx = get().actionContext;
      if (ctx) {
        const battleType = ctx.battleType === 'sea' ? 'battle_sea' as const : 'battle_land' as const;
        if (tryOfferOffensiveResponse(battleType, pa.recruitSpaceId, ctx.country, ns, set, get, ctx.usedOffensiveIds)) return;
      }
      if (proceedAfterAction(ns, set, get)) return;
      goToSupplyStep(ns, set, get);
      return;
    }

    // --- Status Ability Opportunity (Afrika Korps, Resistance, Soviet Partisans) ---
    if (pa.type === 'STATUS_ABILITY_OPPORTUNITY') {
      let ns = s;
      const country = pa.responseCountry;
      const ctx = get().actionContext;
      const usedIds = [...(ctx?.usedStatusAbilityIds ?? []), pa.statusCardId];

      if (accept) {
        const card = ns.countries[country].statusCards.find((c) => c.id === pa.statusCardId);
        if (card) {
          const result = resolveStatusFreeAction(card, country, ns);
          ns = result.newState;
          ns = addLogEntry(ns, country, result.message);

          if (result.validBattleTargets && result.validBattleTargets.length > 0) {
            // Multiple battle targets returned (e.g. LAND_BATTLE with where on a status card).
            // NOTE: No current STATUS card triggers this path. When one does, full human-interactive
            // choice (SELECT_BATTLE_TARGET + resume status-ability flow) should be added here.
            // For now, always use AI scoring to pick the best target (works for both AI and human).
            const diff = ns.countries[country].aiDifficulty;
            const target = pickBestBattleTarget(result.validBattleTargets, country, ns, diff);
            ns = resolveBattleAction(target, country, ns);
            ns = addLogEntry(ns, country, `${card.name}: battled in ${getSpace(target)?.name ?? target}`);
          }

          const enigmaRes3 = checkAndResolveEnigma(country, pa.statusCardId, card.name, ns);
          ns = enigmaRes3.newState;
          if (enigmaRes3.enigmaPending) {
            set({
              ...ns,
              pendingAction: enigmaRes3.enigmaPending,
              actionContext: ctx
                ? { ...ctx, usedStatusAbilityIds: usedIds }
                : { type: 'build', country, spaceId: '', declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: usedIds },
            });
            return;
          }
        }
      }

      set({
        actionContext: ctx
          ? { ...ctx, usedStatusAbilityIds: usedIds }
          : { type: 'build', country, spaceId: '', declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: usedIds },
      });

      if (tryOfferStatusFreeAction(country, ns, set, get, usedIds)) return;
      set({ ...ns, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
      setTimeout(() => get().advanceToNextPhase(), 400);
      return;
    }

    // --- Bushido Opportunity ---
    if (pa.type === 'BUSHIDO_OPPORTUNITY') {
      let ns = s;
      const ctx = get().actionContext;
      const isChain = !!ctx?.chainTrigger;
      if (accept) {
        const card = ns.countries[Country.JAPAN].statusCards.find(
          (c) => c.id === pa.statusCardId
        );
        if (card) {
          const result = resolveBushidoBattle(card, pa.battleSpaceId, ns);
          ns = result.newState;
          ns = addLogEntry(ns, Country.JAPAN, result.message);
        }
      }
      if (isChain) {
        const elim = ctx.chainPendingElimination;
        if (elim) {
          ns = eliminateSpecificPiece(elim, ns);
          ns = addLogEntry(ns, pa.attackingCountry,
            `Eliminated enemy ${elim.pieceType} in ${getSpace(elim.spaceId)?.name ?? elim.spaceId}`);
        }
        if (elim && getTeam(Country.JAPAN) === Team.AXIS) {
          const co = findCounterOffensiveOpportunity(pa.battleSpaceId, Country.JAPAN, ns);
          if (co) {
            set({
              ...ns, phase: GamePhase.AWAITING_RESPONSE,
              pendingAction: {
                type: 'COUNTER_OFFENSIVE_OPPORTUNITY',
                responseCountry: Country.SOVIET_UNION,
                statusCardId: co.card.id, statusCardName: co.card.name,
                eliminatedSpaceId: pa.battleSpaceId, eliminatedPieceCountry: Country.JAPAN,
              },
            });
            if (!ns.countries[Country.SOVIET_UNION].isHuman) {
              setTimeout(() => get().respondToOpportunity(
                aiShouldActivateCounterOffensive(gs(get()), pa.battleSpaceId)
              ), AI_DELAY);
            }
            return;
          }
        }
        resumeChain(ns, set, get);
      } else {
        ns = resolveBattleAction(pa.battleSpaceId, pa.attackingCountry, ns);
        continueAfterElimination(
          ns, pa.battleSpaceId, pa.attackingCountry, 'army', Country.JAPAN, set, get
        );
      }
      return;
    }

    // --- Island Hopping Defense Opportunity ---
    if (pa.type === 'ISLAND_DEFENSE_OPPORTUNITY') {
      let ns = s;
      const ctx = get().actionContext;
      const isChain = !!ctx?.chainTrigger;
      if (accept) {
        const card = ns.countries[Country.JAPAN].statusCards.find(
          (c) => c.id === pa.statusCardId
        );
        if (card) {
          const result = resolveIslandDefense(card, ns);
          ns = result.newState;
          ns = addLogEntry(ns, Country.JAPAN, result.message);
        }
        if (isChain) {
          resumeChain(ns, set, get);
        } else {
          if (!ctx) { goToSupplyStep(ns, set, get); return; }
          const battleType = ctx.battleType === 'sea' ? 'battle_sea' as const : 'battle_land' as const;
          if (tryOfferOffensiveResponse(battleType, pa.battleSpaceId, ctx.country, ns, set, get, ctx.usedOffensiveIds)) return;
          if (proceedAfterAction(ns, set, get)) return;
          goToSupplyStep(ns, set, get);
        }
      } else {
        if (isChain) {
          const elim = ctx.chainPendingElimination;
          if (elim) {
            ns = eliminateSpecificPiece(elim, ns);
            ns = addLogEntry(ns, pa.attackingCountry,
              `Eliminated enemy ${elim.pieceType} in ${getSpace(elim.spaceId)?.name ?? elim.spaceId}`);
          }
          resumeChain(ns, set, get);
        } else {
          ns = resolveBattleAction(pa.battleSpaceId, pa.attackingCountry, ns);
          continueAfterElimination(
            ns, pa.battleSpaceId, pa.attackingCountry, 'navy', Country.JAPAN, set, get
          );
        }
      }
      return;
    }

    // --- Counter-Offensive Opportunity ---
    if (pa.type === 'COUNTER_OFFENSIVE_OPPORTUNITY') {
      let ns = s;
      if (accept) {
        const card = ns.countries[Country.SOVIET_UNION].statusCards.find(
          (c) => c.id === pa.statusCardId
        );
        if (card) {
          const result = resolveCounterOffensive(card, pa.eliminatedSpaceId, ns);
          ns = result.newState;
          ns = addLogEntry(ns, Country.SOVIET_UNION, result.message);
        }
      }
      const ctx = get().actionContext;
      if (ctx?.chainTrigger) {
        resumeChain(ns, set, get);
        return;
      }
      if (!ctx) { goToSupplyStep(ns, set, get); return; }
      const battleType = ctx.battleType === 'sea' ? 'battle_sea' as const : 'battle_land' as const;
      if (tryOfferOffensiveResponse(battleType, ctx.spaceId, ctx.country, ns, set, get, ctx.usedOffensiveIds)) return;
      if (proceedAfterAction(ns, set, get)) return;
      goToSupplyStep(ns, set, get);
      return;
    }

    // --- Arsenal of Democracy Opportunity ---
    if (pa.type === 'ARSENAL_OPPORTUNITY') {
      let ns = s;
      if (accept) {
        const card = ns.countries[Country.USA].statusCards.find(
          (c) => c.id === pa.statusCardId
        );
        if (card) {
          const result = resolveArsenalOfDemocracy(card, pa.targetCountry, ns);
          ns = result.newState;
          ns = addLogEntry(ns, Country.USA, result.message);
        }
      }
      const advanced = advanceTurn(ns);
      set({ ...advanced, selectedDiscards: new Set() });
      setTimeout(() => {
        const store = get();
        if (store.phase === GamePhase.GAME_OVER) return;
        const next = getCurrentCountry(gs(store));
        if (!store.countries[next].isHuman) store.runFullAiTurn();
      }, 300);
      return;
    }

    // --- Card Cancel Opportunity (Battle of Britain) ---
    if (pa.type === 'CARD_CANCEL_OPPORTUNITY') {
      let ns = s;

      if (accept) {
        ns = activateProtectionResponse(pa.responseCountry, pa.responseCardId, ns);

        const gerState = ns.countries[pa.cancelledCountry];
        ns = {
          ...ns,
          countries: {
            ...ns.countries,
            [pa.cancelledCountry]: {
              ...gerState,
              discard: [...gerState.discard, pa.cancelledCard],
            },
          },
        };

        ns = addLogEntry(
          ns,
          pa.responseCountry,
          `${pa.responseCardName}: cancelled Germany's ${pa.cancelledCardName}!`
        );

        set({ ...ns, pendingAction: null, phase: GamePhase.PLAY_STEP, actionContext: undefined });

        if (!ns.countries[pa.cancelledCountry].isHuman) {
          setTimeout(() => get().runFullAiTurn(), AI_DELAY);
        }
        return;
      }

      // Declined: play the German card normally
      const card = pa.cancelledCard;
      const cancelledCountry = pa.cancelledCountry;

      const cancelPlayResult = playCard(card, ns);
      const logged = addLogEntry(cancelPlayResult.newState, cancelledCountry, `Played ${card.name}`);

      if (cancelPlayResult.eventBuildInfo && !cancelPlayResult.pendingAction) {
        if (handleEventBuildTrigger(cancelPlayResult.eventBuildInfo, logged, set, get)) return;
        set({ ...logged, pendingAction: null, phase: GamePhase.SUPPLY_STEP });
        setTimeout(() => get().advanceToNextPhase(), 400);
        return;
      }

      const newPA = cancelPlayResult.pendingAction;
      if (newPA) {
        set({ ...logged, pendingAction: newPA, phase: GamePhase.PLAY_STEP });

        if (!logged.countries[cancelledCountry].isHuman) {
          const diff = logged.countries[cancelledCountry].aiDifficulty;
          const res = aiResolvePendingAction(logged, newPA, diff);
          if (typeof res === 'string' && res) {
            setTimeout(() => get().handleSpaceClick(res), AI_DELAY);
          }
        }
      } else {
        if (card.type === CardType.ECONOMIC_WARFARE) {
          const ewCounters = findEWCounterResponses(cancelledCountry, logged);
          if (ewCounters.length > 0) {
            set({
              ...logged,
              pendingAction: null,
              actionContext: {
                type: 'ew',
                country: cancelledCountry,
                spaceId: '',
                ewCountry: cancelledCountry,
                declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
              },
            });
            if (proceedAfterAction(logged, set, get)) return;
          }
        }
        goToSupplyStep(logged, set, get);
      }
      return;
    }

    // --- Enigma Code Cracked Opportunity ---
    if (pa.type === 'ENIGMA_OPPORTUNITY') {
      let ns = s;
      if (accept) {
        ns = resolveEnigma(pa.germanStatusCardId, ns);
        ns = activateProtectionResponse(Country.UK, pa.enigmaCardId, ns);
        ns = addLogEntry(ns, Country.UK, `${pa.enigmaCardName}: discarded Germany's ${pa.germanStatusCardName}`);
      } else {
        ns = addLogEntry(ns, Country.UK, `Declined to use ${pa.enigmaCardName}`);
      }
      set({ ...ns, pendingAction: null });
      if (proceedAfterAction(ns, set, get)) return;
      goToSupplyStep(ns, set, get);
      return;
    }
  },

  runFullAiTurn: async () => {
    const startPhase = get().phase;
    const startCountry = get().currentCountryIndex;
    // Watchdog: if AI turn doesn't advance within 15 seconds, force-advance
    const watchdog = setTimeout(() => {
      const cur = get();
      // Only intervene if we're still on the same country's turn and not waiting for human
      if (cur.currentCountryIndex === startCountry && cur.phase !== GamePhase.GAME_OVER) {
        const country = getCurrentCountry(gs(cur));
        if (!cur.countries[country].isHuman) {
          console.error('[AI Watchdog] Turn stuck for', COUNTRY_NAMES[country], 'phase:', cur.phase, 'pendingAction:', cur.pendingAction?.type);
          const logged = addLogEntry(gs(cur), country, 'AI turn timed out — advancing');
          set({ ...logged, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined, selectedCard: null });
          setTimeout(() => get().advanceToNextPhase(), 400);
        }
      }
    }, 15000);
    try {
      await get().executeAiTurn();
    } finally {
      // If executeAiTurn completed or threw, check if we've already advanced past this turn.
      // If not (stuck in a callback chain), the watchdog will handle it.
      const afterPhase = get().phase;
      const afterCountry = get().currentCountryIndex;
      if (afterPhase !== startPhase || afterCountry !== startCountry) {
        clearTimeout(watchdog); // Turn advanced normally, cancel watchdog
      }
    }
  },

  useAlternativeAction: (statusCardId: string) => {
    const s = gs(get());
    if (s.phase !== GamePhase.PLAY_STEP || s.pendingAction) return;
    const country = getCurrentCountry(s);
    const cs = s.countries[country];
    if (!cs.isHuman) return;

    const statusCard = cs.statusCards.find((c) => c.id === statusCardId);
    if (!statusCard) return;

    let { newState, pendingAction } = executeStatusAlternativeAction(statusCard, country, s);
    const enigmaRes4 = checkAndResolveEnigma(country, statusCardId, statusCard.name, newState);
    newState = enigmaRes4.newState;
    if (enigmaRes4.enigmaPending) {
      set({ ...newState, pendingAction: enigmaRes4.enigmaPending, phase: GamePhase.PLAY_STEP });
      return;
    }

    if (pendingAction) {
      set({ ...newState, pendingAction, phase: GamePhase.PLAY_STEP });
    } else {
      goToSupplyStep(newState, set, get);
    }
  },

  selectEWTarget: (targetCountry: Country) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_EW_TARGET') return;
    if (!pa.validTargets.includes(targetCountry)) return;

    const country = getCurrentCountry(s);

    const cancelResponses = findEWCancelResponses(country, s);
    if (cancelResponses.length > 0) {
      const resp = cancelResponses[0];
      set({
        ...s,
        pendingAction: {
          type: 'EW_CANCEL_OPPORTUNITY',
          responseCountry: resp.country,
          responseCardId: resp.card.id,
          responseCardName: resp.card.name,
          ewCard: pa.ewCard,
          ewTargetCountry: targetCountry,
          ewPlayingCountry: country,
        },
        phase: GamePhase.AWAITING_RESPONSE,
      });
      if (!s.countries[resp.country].isHuman) {
        setTimeout(() => get().respondToOpportunity(true), AI_DELAY);
      }
      return;
    }

    const isMalta = pa.ewCard.effects.some((e: { condition?: string }) => e.condition === 'malta_submarines');
    if (isMalta) {
      continueMaltaResolution(s, pa.ewCard, country, [Country.GERMANY, Country.ITALY], set, get);
      return;
    }

    let ns = resolveEWAction(pa.ewCard, targetCountry, country, s);

    set({
      ...ns,
      pendingAction: null,
      actionContext: {
        type: 'ew',
        country,
        spaceId: '',
        ewCountry: country,
        declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [],
      },
    });

    if (proceedAfterAction(ns, set, get)) return;
    goToSupplyStep(ns, set, get);
  },

  selectLendLeaseTarget: (targetCountry: Country) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_LEND_LEASE_TARGET') return;
    if (!pa.validTargets.includes(targetCountry)) return;

    const country = getCurrentCountry(s);
    let ns = resolveLendLease(targetCountry, country, pa.lendLeaseCard, s);
    set({ ...ns, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
    setTimeout(() => get().advanceToNextPhase(), 400);
  },

  selectFromDiscard: (cardId: string) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_FROM_DISCARD') return;
    if (!pa.discardCards.some((c) => c.id === cardId)) return;

    const country = getCurrentCountry(s);
    const { newState, pendingAction } = resolveFlexibleResources(cardId, country, s);

    if (pendingAction) {
      set({ ...newState, pendingAction });

      if (!newState.countries[country].isHuman) {
        setTimeout(async () => {
          const diff = gs(get()).countries[country].aiDifficulty;
          const res = aiResolvePendingAction(gs(get()), pendingAction, diff);
          if (typeof res === 'string' && res) {
            let ns = gs(get());
            if (pendingAction.type === 'SELECT_BUILD_LOCATION') {
              const bc = pendingAction.buildCountry ?? country;
              ns = resolveBuildAction(res, pendingAction.pieceType, bc, ns);
              ns = addLogEntry(ns, bc, `Built ${pendingAction.pieceType} in ${res.replace(/_/g, ' ')}`);
            } else if (pendingAction.type === 'SELECT_BATTLE_TARGET') {
              ns = resolveBattleAction(res, country, ns);
              ns = addLogEntry(ns, country, `Battled in ${res.replace(/_/g, ' ')}`);
            }
            set({ ...ns, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
            setTimeout(() => get().advanceToNextPhase(), 400);
          } else {
            set({ ...gs(get()), pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
            setTimeout(() => get().advanceToNextPhase(), 400);
          }
        }, AI_DELAY);
      }
    } else {
      set({ ...newState, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
      setTimeout(() => get().advanceToNextPhase(), 400);
    }
  },

  selectEventChoice: (effectType: string) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_EVENT_CHOICE') return;

    const country = getCurrentCountry(s);
    const { newState, pendingAction } = resolveEventChoice(
      effectType as any,
      pa.eventCard,
      country,
      s
    );
    const logged = addLogEntry(newState, country, `${pa.eventCard.name}: chose ${effectType.replace(/_/g, ' ').toLowerCase()}`);

    if (pendingAction) {
      set({ ...logged, pendingAction, phase: GamePhase.PLAY_STEP, actionContext: { type: 'build', country, spaceId: '', declinedCardIds: [], usedOffensiveIds: [], usedStatusAbilityIds: [], playedCard: pa.eventCard } });
    } else {
      set({ ...logged, pendingAction: null, phase: GamePhase.SUPPLY_STEP, actionContext: undefined });
      setTimeout(() => get().advanceToNextPhase(), 400);
    }
  },

  resolveReorderCards: (orderedCardIds: string[]) => {
    let s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'REORDER_CARDS') return;

    const country = getCurrentCountry(s);
    const cs = s.countries[country];
    const topN = pa.cards.length;
    const rest = cs.deck.slice(topN);
    const reordered = orderedCardIds
      .map((id) => pa.cards.find((c) => c.id === id))
      .filter(Boolean) as Card[];
    s = {
      ...s,
      pendingAction: null,
      countries: {
        ...s.countries,
        [country]: { ...cs, deck: [...reordered, ...rest] },
      },
    };
    s = addLogEntry(s, country, `${pa.statusCardName}: examined and reordered top cards`);

    const vkCard = findVolkssturmOpportunity(country, s);
    if (vkCard) {
      const before = s;
      s = resolveVolkssturm(s);
      if (s !== before) {
        s = addLogEntry(s, country, `${vkCard.name}: recruited army in Germany (cost 1 deck card)`);
      }
    }
    const mfCard = findMobileForceOpportunity(country, s);
    if (mfCard) {
      const validSpaces = getValidMobileForceSpaces(s);
      if (validSpaces.length > 0) {
        if (s.countries[country].isHuman) {
          // Ask human whether to activate Mobile Force before showing location picker
          set({
            ...s,
            selectedDiscards: new Set<string>(),
            phase: GamePhase.AWAITING_RESPONSE,
            pendingAction: {
              type: 'BEGINNING_TURN_RESPONSE',
              responseCountry: Country.JAPAN,
              responseCardId: mfCard.id,
              responseCardName: mfCard.name,
              description: 'Recruit a Navy in or adjacent to North Pacific.',
              botType: 'mobile_force',
              validSpaces,
            },
          });
          return;
        } else {
          const diff = s.countries[country].aiDifficulty;
          const best = pickBestBuildLocation(validSpaces, Country.JAPAN, s, diff);
          s = resolveMobileForceAt(best, s);
          s = addLogEntry(s, country, `${mfCard.name}: recruited navy in ${best.replace(/_/g, ' ')}`);
        }
      }
    }
    const dmCard = findDefenseOfMotherlandOpportunity(country, s);
    if (dmCard) {
      const ussrIsHuman = s.countries[Country.SOVIET_UNION].isHuman;
      if (ussrIsHuman) {
        // Ask human whether to activate Defense of the Motherland
        set({
          ...s,
          selectedDiscards: new Set<string>(),
          phase: GamePhase.AWAITING_RESPONSE,
          pendingAction: {
            type: 'BEGINNING_TURN_RESPONSE',
            responseCountry: Country.SOVIET_UNION,
            responseCardId: dmCard.id,
            responseCardName: dmCard.name,
            description: 'Recruit an Army in or adjacent to Moscow; then eliminate an Axis Army in Moscow.',
          },
        });
        return;
      }
      // AI decision — use heuristic based on difficulty.
      const diff = s.countries[Country.SOVIET_UNION].aiDifficulty;
      if (aiShouldTriggerDefenseOfMotherland(s, diff)) {
        s = resolveDefenseOfMotherland(s);
      }
    }

    set({ ...s, selectedDiscards: new Set() });

    setTimeout(() => {
      const store = get();
      if (store.phase === GamePhase.GAME_OVER) return;
      const next = getCurrentCountry(gs(store));
      if (!store.countries[next].isHuman) store.runFullAiTurn();
    }, 300);
  },

  skipPlayStep: () => {
    const s = gs(get());
    const country = getCurrentCountry(s);
    const cs = s.countries[country];
    // Only valid for the active human player during the play step with nothing pending
    if (!cs.isHuman || s.phase !== GamePhase.PLAY_STEP || s.pendingAction) return;
    const reason = cs.hand.length === 0 ? 'No cards to play' : 'Passed play step';
    const ns = addLogEntry(s, country, reason);
    goToSupplyStep(ns, set, get);
  },

  skipRemainingRecruits: () => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_RECRUIT_LOCATION') return;
    const ns = { ...s, pendingAction: null };
    if (pa.botContinuation) {
      const country = getCurrentCountry(ns);
      continueBeginningOfTurnAfterMobileForce(ns, country, set, get);
      return;
    }
    set(ns);
    goToSupplyStep(ns, set, get);
  },

  skipEventEffect: () => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_EVENT_SPACE') return;

    let ns = s;
    if (pa.remainingEffects.length > 0) {
      const skipResult = processEventEffects(pa.remainingEffects, pa.eventCardName, pa.playingCountry, ns);
      if (skipResult.pendingAction) {
        set({ ...skipResult.newState, pendingAction: skipResult.pendingAction });
        return;
      }
      if (skipResult.eventBuildInfo) {
        if (handleEventBuildTrigger(skipResult.eventBuildInfo, skipResult.newState, set, get)) return;
      }
      ns = skipResult.newState;
    }
    set({ ...ns, pendingAction: null });
    goToSupplyStep(ns, set, get);
  },

  resolveRosieSelection: (cardIds: string[]) => {
    let s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_ROSIE_CARDS') return;
    if (cardIds.length < pa.minCards || cardIds.length > pa.maxCards) return;

    const country = getCurrentCountry(s);
    if (cardIds.length > 0) {
      s = resolveRosieWithCards(s, cardIds);
      const returnedNames = pa.handCards
        .filter((c) => cardIds.includes(c.id))
        .map((c) => c.name)
        .join(', ');
      s = addLogEntry(s, country, `Rosie the Riveter: returned ${returnedNames} to bottom of deck`);
    }
    s = { ...s, pendingAction: null };

    set({ ...s, phase: GamePhase.DISCARD_STEP });
  },

  resolveMaltaChoice: (choice: 'eliminate_navy' | 'discard_cards') => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_MALTA_CHOICE') return;

    let ns = resolveMaltaForCountry(pa.targetCountry, choice, pa.ewCard, pa.playingCountry, s);
    ns = { ...ns, pendingAction: null };
    continueMaltaResolution(ns, pa.ewCard, pa.playingCountry, pa.remainingCountries, set, get);
  },

  confirmHandDiscard: (cardIds: string[]) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_HAND_DISCARD') return;
    const country = getCurrentCountry(s);

    const { newState, pendingAction: nextPA } = resolveHandDiscardAction(
      cardIds, pa.statusCardId, pa.afterAction, pa.afterWhere, country, s
    );

    if (nextPA) {
      set({ ...newState, pendingAction: nextPA, phase: GamePhase.PLAY_STEP });
    } else {
      goToSupplyStep(newState, set, get);
    }
  },

  confirmOffensiveHandDiscard: (cardIds: string[]) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_OFFENSIVE_HAND_DISCARD') return;
    const country = getCurrentCountry(s);
    const ctx = get().actionContext;
    const usedIds = ctx?.usedOffensiveIds ?? [];

    const card = s.countries[country].statusCards.find((c) => c.id === pa.offensiveCardId);
    if (!card) return;

    const discarded = s.countries[country].hand.filter((c) => cardIds.includes(c.id));
    const remaining = s.countries[country].hand.filter((c) => !cardIds.includes(c.id));
    let ns: GameState = {
      ...s,
      pendingAction: null,
      countries: {
        ...s.countries,
        [country]: {
          ...s.countries[country],
          hand: remaining,
          discard: [...s.countries[country].discard, ...discarded],
        },
      },
    };
    ns = addLogEntry(ns, country, `${card.name}: discarded ${discarded.map((c) => c.name).join(', ')} from hand`);

    const result = resolveOffensiveResponse(card, pa.triggerSpaceId, country, ns);
    processOffensiveResult(result, card, true, country, pa.triggerSpaceId, usedIds, ns, set, get);
  },

  confirmRedeploy: (pieceId: string) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_PIECE_TO_REDEPLOY') return;
    const redeployCountry = pa.redeployCountry;

    const piece = s.countries[redeployCountry].piecesOnBoard.find((p) => p.id === pieceId);
    if (!piece) return;

    const spaceName = getSpace(piece.spaceId)?.name ?? piece.spaceId.replace(/_/g, ' ');
    let ns: GameState = {
      ...s,
      pendingAction: null,
      countries: {
        ...s.countries,
        [redeployCountry]: {
          ...s.countries[redeployCountry],
          piecesOnBoard: s.countries[redeployCountry].piecesOnBoard.filter((p) => p.id !== pieceId),
        },
      },
    };
    ns = addLogEntry(ns, redeployCountry, `Removed ${pa.pieceType} from ${spaceName} for redeployment`);

    // Fixed-target redeploy (e.g. Amphibious Landings) — place army directly in the target space
    if (pa.targetSpaceId) {
      const newPiece: Piece = { id: generatePieceId(), country: redeployCountry, type: pa.pieceType, spaceId: pa.targetSpaceId };
      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [redeployCountry]: {
            ...ns.countries[redeployCountry],
            piecesOnBoard: [...ns.countries[redeployCountry].piecesOnBoard, newPiece],
          },
        },
      };
      const targetName = getSpace(pa.targetSpaceId)?.name ?? pa.targetSpaceId;
      ns = addLogEntry(ns, redeployCountry, `Built ${pa.pieceType} in ${targetName} (redeployed)`);
      set({ ...ns, pendingAction: null });
      goToSupplyStep(ns, set, get);
      return;
    }

    if (pa.currentEffect && pa.eventCardName && pa.playingCountry != null) {
      const allEffects = [pa.currentEffect, ...(pa.remainingEffects ?? [])];
      const result = processEventEffects(allEffects, pa.eventCardName, pa.playingCountry, ns);
      if (result.pendingAction) {
        set({ ...result.newState, pendingAction: result.pendingAction });
        return;
      }
      if (result.eventBuildInfo) {
        if (handleEventBuildTrigger(result.eventBuildInfo, result.newState, set, get)) return;
      }
      set({ ...result.newState, pendingAction: null });
      goToSupplyStep(result.newState, set, get);
      return;
    }

    const validSpaces = getValidBuildLocations(redeployCountry, pa.pieceType, ns);
    if (validSpaces.length === 0) {
      set({ ...ns });
      return;
    }
    set({
      ...ns,
      pendingAction: {
        type: 'SELECT_BUILD_LOCATION',
        pieceType: pa.pieceType,
        validSpaces,
        buildCountry: redeployCountry,
      },
    });
  },

  skipRedeploy: () => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_PIECE_TO_REDEPLOY') return;

    let ns: GameState = { ...s, pendingAction: null };
    ns = addLogEntry(ns, pa.redeployCountry, `Declined to redeploy ${pa.pieceType}`);

    // BUILD_AFTER_BATTLE: skip the bonus build, proceed to supply
    if (pa.targetSpaceId) {
      set({ ...ns });
      goToSupplyStep(ns, set, get);
      return;
    }

    // Event card recruit: skip this recruit, continue remaining effects
    if (pa.currentEffect && pa.eventCardName && pa.playingCountry != null) {
      const remaining = pa.remainingEffects ?? [];
      if (remaining.length > 0) {
        const result = processEventEffects(remaining, pa.eventCardName, pa.playingCountry, ns);
        if (result.pendingAction) {
          set({ ...result.newState, pendingAction: result.pendingAction });
          return;
        }
        if (result.eventBuildInfo) {
          if (handleEventBuildTrigger(result.eventBuildInfo, result.newState, set, get)) return;
        }
        set({ ...result.newState, pendingAction: null });
        goToSupplyStep(result.newState, set, get);
        return;
      }
      set({ ...ns });
      goToSupplyStep(ns, set, get);
      return;
    }

    // Normal BUILD card: just go to supply
    set({ ...ns });
    goToSupplyStep(ns, set, get);
  },

  selectMovePiece: (pieceId: string) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_MOVE_PIECE') return;

    const piece = s.countries[pa.country].piecesOnBoard.find((p) => p.id === pieceId);
    if (!piece) return;

    const spaceName = getSpace(piece.spaceId)?.name ?? piece.spaceId.replace(/_/g, ' ');

    let ns: GameState = {
      ...s,
      pendingAction: null,
      countries: {
        ...s.countries,
        [pa.country]: {
          ...s.countries[pa.country],
          piecesOnBoard: s.countries[pa.country].piecesOnBoard.filter((p) => p.id !== pieceId),
        },
      },
    };
    ns = addLogEntry(ns, pa.country, `${pa.eventCardName}: removed ${piece.type} from ${spaceName}`);

    const validSpaces = getValidBuildLocations(pa.country, piece.type, ns);
    if (validSpaces.length === 0) {
      ns = addLogEntry(ns, pa.country, `${pa.eventCardName}: no valid location — piece lost`);
      const nextPA = buildMovePiecesAction(pa.country, pa.eventCardName, pa.pieceTypeFilter, [...pa.movedPieceIds, pieceId], pa.remainingEffects, pa.playingCountry, ns);
      if (nextPA) {
        set({ ...ns, pendingAction: nextPA });
      } else {
        if (pa.remainingEffects.length > 0) {
          const contResult = processEventEffects(pa.remainingEffects, pa.eventCardName, pa.playingCountry, ns);
          if (contResult.pendingAction) { set({ ...contResult.newState, pendingAction: contResult.pendingAction }); return; }
          ns = contResult.newState;
        }
        set({ ...ns, pendingAction: null });
        goToSupplyStep(ns, set, get);
      }
      return;
    }

    set({
      ...ns,
      pendingAction: {
        type: 'SELECT_MOVE_DESTINATION',
        country: pa.country,
        eventCardName: pa.eventCardName,
        pieceType: piece.type,
        removedFromSpaceId: piece.spaceId,
        removedFromSpaceName: spaceName,
        validSpaces,
        pieceTypeFilter: pa.pieceTypeFilter,
        movedPieceIds: [...pa.movedPieceIds, pieceId],
        remainingEffects: pa.remainingEffects,
        playingCountry: pa.playingCountry,
      },
    });
  },

  skipMovePieces: () => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || (pa.type !== 'SELECT_MOVE_PIECE' && pa.type !== 'SELECT_MOVE_DESTINATION')) return;

    let ns: GameState = { ...s, pendingAction: null };

    if (pa.type === 'SELECT_MOVE_DESTINATION') {
      const piece: Piece = { id: generatePieceId(), country: pa.country, type: pa.pieceType, spaceId: pa.removedFromSpaceId };
      ns = {
        ...ns,
        countries: {
          ...ns.countries,
          [pa.country]: {
            ...ns.countries[pa.country],
            piecesOnBoard: [...ns.countries[pa.country].piecesOnBoard, piece],
          },
        },
      };
      ns = addLogEntry(ns, pa.country, `${pa.eventCardName}: returned ${pa.pieceType} to ${pa.removedFromSpaceName}`);
    }

    if (pa.remainingEffects.length > 0) {
      const contResult = processEventEffects(pa.remainingEffects, pa.eventCardName, pa.playingCountry, ns);
      if (contResult.pendingAction) { set({ ...contResult.newState, pendingAction: contResult.pendingAction }); return; }
      if (contResult.eventBuildInfo) {
        if (handleEventBuildTrigger(contResult.eventBuildInfo, contResult.newState, set, get)) return;
      }
      ns = contResult.newState;
    }

    set({ ...ns, pendingAction: null });
    goToSupplyStep(ns, set, get);
  },

  selectBattlePiece: (pieceId: string) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_BATTLE_PIECE') return;

    const allPieces = getAllPieces(s);
    const targetPiece = allPieces.find((p) => p.id === pieceId);
    if (!targetPiece) return;

    const { battleSpaceId, attackingCountry } = pa;

    // Clear the pending action before proceeding
    let ns: GameState = { ...s, pendingAction: null };

    // Check if the chosen piece is protected by a response card
    const responses = findProtectionResponses(
      battleSpaceId, targetPiece.country, ns, targetPiece.type, targetPiece.id
    );
    if (responses.length > 0) {
      const resp = responses[0];
      set({
        ...ns,
        phase: GamePhase.AWAITING_RESPONSE,
        pendingAction: {
          type: 'RESPONSE_OPPORTUNITY',
          responseCountry: resp.country,
          responseCardId: resp.card.id,
          responseCardName: resp.card.name,
          battleSpaceId,
          eliminatedPieceId: targetPiece.id,
          eliminatedPieceCountry: targetPiece.country,
          attackingCountry,
        },
      });
      if (!ns.countries[resp.country].isHuman) {
        setTimeout(() => {
          get().respondToOpportunity(
            aiShouldActivateProtection(gs(get()), resp.card, battleSpaceId, resp.country)
          );
        }, AI_DELAY);
      }
      return;
    }

    proceedWithElimination(battleSpaceId, attackingCountry, targetPiece, ns, set, get);
  },

  confirmRecruitCountry: (chosenCountry: Country) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'SELECT_RECRUIT_COUNTRY') return;
    if (!pa.validCountries.includes(chosenCountry)) return;

    let ns = { ...s, pendingAction: null } as GameState;
    const result = resolveRecruitCountryChoice(
      chosenCountry, pa.where, pa.eventCardName, pa.playingCountry, pa.remainingEffects, ns
    );
    ns = result.newState;
    if (result.pendingAction) {
      set({ ...ns, pendingAction: result.pendingAction });
    } else {
      // All event effects resolved — advance to supply step
      set({ ...ns, pendingAction: null });
      goToSupplyStep(ns, set, get);
    }
  },

  resolveRationingChoice: (accept: boolean) => {
    const s = gs(get());
    const pa = s.pendingAction;
    if (!pa || pa.type !== 'RATIONING_OPPORTUNITY') return;
    const country = getCurrentCountry(s);
    let ns = { ...s, pendingAction: null } as GameState;

    if (accept) {
      ns = resolveRationing(pa.playedCard, ns);
      ns = addLogEntry(ns, country, `Rationing: shuffled ${pa.playedCard.name} back into deck`);
      ns = activateProtectionResponse(Country.UK, pa.rationingCardId, ns);
    }

    continueAfterRationing(ns, pa.playedCard, country, set, get);
  },

  resetGame: () => {
    set({ ...initialState });
  },
}));
