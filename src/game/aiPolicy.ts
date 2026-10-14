// ---------------------------------------------------------------------------
// Learned policy for the Hard AI.
//
// The heuristic scorer in ai.ts gives every card in hand a base score. This
// module adds a *learned correction* on top of it: a sparse linear model over
// features of (card, whole hand, game state). The weights are trained offline
// by self-play (see training/) and shipped in aiWeights.json. With empty
// weights the policy is identical to the pure heuristic.
//
// Two decisions are learned:
//   - "play": which card of the hand to play this turn
//   - "keep": which 3 of the 10 opening cards to discard at setup
// ---------------------------------------------------------------------------
import { Card, CardType, Country } from './types';
import shipped from './aiWeights.json';

export type Feats = Record<string, number>;
export type Weights = Record<string, number>;

export interface PlayContext {
  country: Country;
  round: number;
  /** own team VP minus enemy team VP */
  vpGap: number;
  nPieces: number;
  availArmies: number;
  availNavies: number;
  deckSize: number;
}

const ALL_TYPES = Object.values(CardType) as CardType[];

function roundBucket(round: number): number {
  return round <= 3 ? 0 : round <= 7 ? 1 : round <= 13 ? 2 : 3;
}

// ---- Features -------------------------------------------------------------

/** Features of playing `card` now, given the rest of the hand and the state. */
export function playFeatures(card: Card, hand: Card[], ctx: PlayContext, base: number): Feats {
  const f: Feats = {};
  const t = card.type;
  const others = hand.filter((c) => c !== card);
  f['h'] = base / 10;
  f['id:' + card.id] = 1;
  f[`tr:${t}:${roundBucket(ctx.round)}`] = 1;
  f['tv:' + t] = Math.max(-1, Math.min(1, ctx.vpGap / 30));
  f['tp:' + t] = ctx.nPieces / 10;
  f['ta:' + t] = ctx.availArmies / 10;
  f['tn:' + t] = ctx.availNavies / 10;
  if (ctx.deckSize < 8) f['td:' + t] = 1;
  for (const o of ALL_TYPES) {
    const n = others.filter((c) => c.type === o).length;
    if (n > 0) f[`th:${t}:${o}`] = Math.min(n, 3) / 3;
  }
  if (others.some((c) => c.type === CardType.BUILD_ARMY || c.type === CardType.BUILD_NAVY)) f['ib:' + card.id] = 1;
  if (others.some((c) => c.type === CardType.LAND_BATTLE || c.type === CardType.SEA_BATTLE)) f['il:' + card.id] = 1;
  if (others.some((c) => c.name === card.name)) f['dup:' + t] = 1;
  return f;
}

/** Features describing how much we want to KEEP `card` from the opening 10. */
export function keepFeatures(card: Card, hand: Card[]): Feats {
  const f: Feats = {};
  const t = card.type;
  const others = hand.filter((c) => c !== card);
  f['kid:' + card.id] = 1;
  for (const o of ALL_TYPES) {
    const n = others.filter((c) => c.type === o).length;
    if (n > 0) f[`kth:${t}:${o}`] = Math.min(n, 4) / 4;
  }
  if (others.some((c) => c.name === card.name)) f['kdup:' + t] = 1;
  return f;
}

/** Fixed heuristic prior for keeping a card: Economic Warfare and dupes go first. */
function keepBase(card: Card, hand: Card[]): number {
  let b = 0;
  if (card.type === CardType.ECONOMIC_WARFARE) b -= 8;
  const dup = hand.filter((c) => c.name === card.name).length;
  if (dup > 1) b -= 2 * (dup - 1);
  return b;
}

// ---- Weights registry -----------------------------------------------------

let defaultWeights: Weights = shipped as Weights;
const overrides: Partial<Record<Country, Weights>> = {};

export function setDefaultWeights(w: Weights) { defaultWeights = w; }
/** Used by training/eval: pin a country to a specific weight set ({} = pure heuristic). */
export function setPolicyOverride(country: Country, w: Weights | null) {
  if (w === null) delete overrides[country];
  else overrides[country] = w;
}
export function clearPolicyOverrides() {
  for (const k of Object.keys(overrides)) delete overrides[k as Country];
}
function weightsFor(country: Country): Weights {
  return overrides[country] ?? defaultWeights;
}

function dot(w: Weights, f: Feats): number {
  let s = 0;
  for (const k in f) {
    const v = w[k];
    if (v !== undefined) s += v * f[k];
  }
  return s;
}

// ---- Training trace -------------------------------------------------------

export interface TraceStep {
  country: Country;
  cands: Feats[];
  chosen: number;
  probs: number[];
  tau: number;
}
let sampling: { tau: number; countries?: Country[] } | null = null;
const isSampling = (c: Country) => sampling !== null && (!sampling.countries || sampling.countries.includes(c));
let trace: TraceStep[] = [];
/** Enable softmax sampling + recording (training only). */
export function setTrainingMode(opts: { tau: number; countries?: Country[] } | null) { sampling = opts; trace = []; }
export function drainTrace(): TraceStep[] { const t = trace; trace = []; return t; }

function softmaxSample(logits: number[], tau: number): { pick: number; probs: number[] } {
  const m = Math.max(...logits);
  const ex = logits.map((l) => Math.exp((l - m) / tau));
  const sum = ex.reduce((a, b) => a + b, 0);
  const probs = ex.map((e) => e / sum);
  let r = Math.random();
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) return { pick: i, probs }; }
  return { pick: probs.length - 1, probs };
}

// ---- Decisions ------------------------------------------------------------

/**
 * Choose which card index to play. `bases` are the heuristic scores
 * (one per hand card). Returns an index into `hand`.
 */
export function choosePlay(hand: Card[], bases: number[], ctx: PlayContext): number {
  const w = weightsFor(ctx.country);
  const cands = hand.map((c, i) => playFeatures(c, hand, ctx, bases[i]));
  const logits = cands.map((f, i) => bases[i] + dot(w, f));
  if (sampling && isSampling(ctx.country)) {
    const { pick, probs } = softmaxSample(logits, sampling.tau);
    trace.push({ country: ctx.country, cands, chosen: pick, probs, tau: sampling.tau });
    return pick;
  }
  let best = 0, bestV = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    const v = logits[i] + Math.random() * 2;
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}

/** Choose `n` cards (indices) to discard from the opening hand. */
export function chooseSetupDiscards(country: Country, hand: Card[], n: number): number[] {
  const w = weightsFor(country);
  const remaining = hand.map((_, i) => i);
  const out: number[] = [];
  for (let step = 0; step < n; step++) {
    // Pick the card to discard: lowest keep-value. Stored features are negated
    // so the same "higher logit = more likely chosen" convention applies.
    const cands = remaining.map((i) => {
      const k = keepFeatures(hand[i], remaining.map((j) => hand[j]));
      const neg: Feats = {};
      for (const key in k) neg[key] = -k[key];
      return neg;
    });
    const logits = remaining.map((i, j) => -keepBase(hand[i], hand) + dot(w, cands[j]));
    let pick: number;
    if (sampling && isSampling(country)) {
      const r = softmaxSample(logits, sampling.tau);
      pick = r.pick;
      trace.push({ country, cands, chosen: pick, probs: r.probs, tau: sampling.tau });
    } else {
      pick = logits.indexOf(Math.max(...logits));
    }
    out.push(remaining[pick]);
    remaining.splice(pick, 1);
  }
  return out;
}

export function hasLearnedWeights(country: Country): boolean {
  return Object.keys(weightsFor(country)).length > 0;
}
