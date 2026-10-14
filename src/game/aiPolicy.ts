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
  /** supply spaces held solely by own team / solely by enemy / contested */
  supplyMine?: number;
  supplyTheirs?: number;
  supplyContested?: number;
  /** status + response cards the country holds */
  nStatus?: number;
  nResponse?: number;
  /** smallest enemy draw-deck (Economic Warfare relevance) */
  enemyMinDeck?: number;
  /** enemy armies adjacent to own pieces / own armies adjacent to enemy ones */
  threatened?: number;
  pressing?: number;
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
  if (ctx.supplyMine !== undefined) {
    f['sm:' + t] = ctx.supplyMine / 6;
    f['st:' + t] = (ctx.supplyTheirs ?? 0) / 6;
    f['sc:' + t] = (ctx.supplyContested ?? 0) / 6;
    f['ns:' + t] = Math.min(ctx.nStatus ?? 0, 4) / 4;
    f['nr:' + t] = Math.min(ctx.nResponse ?? 0, 4) / 4;
    f['th2:' + t] = Math.min(ctx.threatened ?? 0, 6) / 6;
    f['pr:' + t] = Math.min(ctx.pressing ?? 0, 6) / 6;
    if ((ctx.enemyMinDeck ?? 99) < 10) f['emd:' + t] = 1;
    f[`sm:${t}:${roundBucket(ctx.round)}`] = ctx.supplyMine / 6;
  }
  for (const o of ALL_TYPES) {
    const n = others.filter((c) => c.type === o).length;
    if (n > 0) f[`th:${t}:${o}`] = Math.min(n, 3) / 3;
  }
  if (others.some((c) => c.type === CardType.BUILD_ARMY || c.type === CardType.BUILD_NAVY)) f['ib:' + card.id] = 1;
  if (others.some((c) => c.type === CardType.LAND_BATTLE || c.type === CardType.SEA_BATTLE)) f['il:' + card.id] = 1;
  if (others.some((c) => c.name === card.name)) f['dup:' + t] = 1;
  for (const o of others) f['ho:' + o.id] = 1 / 3;
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

// A decision's logit = linear part (keys without "N:" prefix) + a small
// one-hidden-layer network per decision kind (keys "N:<kind>:...").
//   hidden_j = tanh(b1_j + sum_k f_k * W1[k][j]);  out = b2 + sum_j w2_j * hidden_j
export const NET_HIDDEN = 16;
interface Net { W1: Map<string, Float64Array>; b1: Float64Array; w2: Float64Array; b2: number }
interface Compiled { lin: Weights; nets: Map<string, Net> }
const compiledCache = new WeakMap<Weights, Compiled>();

function compile(w: Weights): Compiled {
  let c = compiledCache.get(w);
  if (c) return c;
  c = { lin: {}, nets: new Map() };
  for (const key in w) {
    if (!key.startsWith('N:')) { c.lin[key] = w[key]; continue; }
    const rest = key.slice(2);
    const kind = rest.slice(0, rest.indexOf(':'));
    let net = c.nets.get(kind);
    if (!net) {
      net = { W1: new Map(), b1: new Float64Array(NET_HIDDEN), w2: new Float64Array(NET_HIDDEN), b2: 0 };
      c.nets.set(kind, net);
    }
    const tail = rest.slice(kind.length + 1);
    if (tail === 'b2') net.b2 = w[key];
    else if (tail.startsWith('b1:')) net.b1[+tail.slice(3)] = w[key];
    else if (tail.startsWith('w2:')) net.w2[+tail.slice(3)] = w[key];
    else if (tail.startsWith('W1:')) {
      const body = tail.slice(3);
      const cut = body.lastIndexOf(':');
      const fk = body.slice(0, cut), jj = +body.slice(cut + 1);
      let row = net.W1.get(fk);
      if (!row) { row = new Float64Array(NET_HIDDEN); net.W1.set(fk, row); }
      row[jj] = w[key];
    }
  }
  compiledCache.set(w, c);
  return c;
}

function hiddenOf(net: Net, f: Feats): Float64Array {
  const a = Float64Array.from(net.b1);
  for (const k in f) {
    const row = net.W1.get(k);
    if (row) for (let j = 0; j < NET_HIDDEN; j++) a[j] += f[k] * row[j];
  }
  for (let j = 0; j < NET_HIDDEN; j++) a[j] = Math.tanh(a[j]);
  return a;
}

export function scoreLogit(w: Weights, kind: string, f: Feats): number {
  const c = compile(w);
  let s = 0;
  for (const k in f) {
    const v = c.lin[k];
    if (v !== undefined) s += v * f[k];
  }
  const net = c.nets.get(kind);
  if (net) {
    const h = hiddenOf(net, f);
    s += net.b2;
    for (let j = 0; j < NET_HIDDEN; j++) s += net.w2[j] * h[j];
  }
  return s;
}

/** acc += scale * d logit / d weights (training). */
export function logitGrad(w: Weights, kind: string, f: Feats, scale: number, acc: Record<string, number>) {
  for (const k in f) acc[k] = (acc[k] ?? 0) + scale * f[k];
  const net = compile(w).nets.get(kind);
  if (!net) return;
  const h = hiddenOf(net, f);
  const pre = `N:${kind}:`;
  acc[pre + 'b2'] = (acc[pre + 'b2'] ?? 0) + scale;
  for (let j = 0; j < NET_HIDDEN; j++) {
    const dj = scale * net.w2[j] * (1 - h[j] * h[j]);
    acc[`${pre}w2:${j}`] = (acc[`${pre}w2:${j}`] ?? 0) + scale * h[j];
    acc[`${pre}b1:${j}`] = (acc[`${pre}b1:${j}`] ?? 0) + dj;
    for (const k in f) {
      const key = `${pre}W1:${k}:${j}`;
      acc[key] = (acc[key] ?? 0) + dj * f[k];
    }
  }
}

// ---- Training trace -------------------------------------------------------

export interface TraceStep {
  country: Country;
  kind: string;
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
  const logits = cands.map((f, i) => bases[i] + scoreLogit(w, 'play', f));
  if (sampling && isSampling(ctx.country)) {
    const { pick, probs } = softmaxSample(logits, sampling.tau);
    trace.push({ country: ctx.country, kind: 'play', cands, chosen: pick, probs, tau: sampling.tau });
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
    const logits = remaining.map((i, j) => -keepBase(hand[i], hand) + scoreLogit(w, 'keep', cands[j]));
    let pick: number;
    if (sampling && isSampling(country)) {
      const r = softmaxSample(logits, sampling.tau);
      pick = r.pick;
      trace.push({ country, kind: 'keep', cands, chosen: pick, probs: r.probs, tau: sampling.tau });
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

// ---- Space choices (where to build / which battle to fight) ---------------

export interface SpaceOption {
  id: string;
  /** heuristic score from ai.ts */
  base: number;
  isSupply: boolean;
  isSea: boolean;
  enemyAdj: number;
  friendAdj: number;
  enemyHere: number;
}

export interface SpaceContext {
  country: Country;
  round: number;
  vpGap: number;
}

export function spaceFeatures(kind: 'build' | 'battle', o: SpaceOption, c: SpaceContext): Feats {
  const f: Feats = {};
  const rb = roundBucket(c.round);
  f['hs:' + kind] = o.base / 10;
  f[`sp:${kind}:${o.id}`] = 1;
  f[`spc:${kind}:${c.country}:${o.id}`] = 1;
  f[`spr:${kind}:${o.id}:${rb}`] = 1;
  f[`ks:${kind}:${o.isSea ? 'sea' : 'land'}:${rb}`] = 1;
  f[`ke:${kind}`] = Math.min(o.enemyAdj, 4) / 4;
  f[`kf:${kind}`] = Math.min(o.friendAdj, 4) / 4;
  if (o.enemyHere) f[`kh:${kind}`] = Math.min(o.enemyHere, 3) / 3;
  if (o.isSupply) {
    f[`ksup:${kind}`] = 1;
    f[`ksv:${kind}`] = Math.max(-1, Math.min(1, c.vpGap / 30));
  }
  return f;
}

/** Pick one space. Returns the index into `opts`. */
export function chooseSpace(kind: 'build' | 'battle', opts: SpaceOption[], c: SpaceContext): number {
  const w = weightsFor(c.country);
  const cands = opts.map((o) => spaceFeatures(kind, o, c));
  const logits = cands.map((f, i) => opts[i].base + scoreLogit(w, kind, f));
  if (sampling && isSampling(c.country)) {
    const { pick, probs } = softmaxSample(logits, sampling.tau);
    trace.push({ country: c.country, kind, cands, chosen: pick, probs, tau: sampling.tau });
    return pick;
  }
  return logits.indexOf(Math.max(...logits));
}

// ---- Mid-game discards -----------------------------------------------------

export interface DiscardContext { country: Country; round: number; deckSize: number; vpGap: number }

/**
 * Decide, per hand card, whether to discard it. `bases[i]` is a heuristic
 * prior (positive = lean discard). Each card is an independent keep/discard
 * choice (a two-way softmax), so the same trace/gradient machinery applies.
 */
export function chooseDiscardFlags(hand: Card[], bases: number[], ctx: DiscardContext): boolean[] {
  const w = weightsFor(ctx.country);
  return hand.map((card, i) => {
    const others = hand.filter((c) => c !== card);
    const f: Feats = {};
    const t = card.type;
    f['dsid:' + card.id] = 1;
    f[`dst:${t}:${roundBucket(ctx.round)}`] = 1;
    f['dsd:' + t] = Math.min(ctx.deckSize, 30) / 30;
    f['dsv:' + t] = Math.max(-1, Math.min(1, ctx.vpGap / 30));
    for (const o of ALL_TYPES) {
      const n = others.filter((c) => c.type === o).length;
      if (n > 0) f[`dsh:${t}:${o}`] = Math.min(n, 3) / 3;
    }
    for (const o of others) f['dso:' + o.id] = 1 / 3;
    // candidate 0 = discard, candidate 1 = keep (no features, logit 0)
    const cands: Feats[] = [f, {}];
    const logits = [bases[i] + scoreLogit(w, 'discard', f), 0];
    if (sampling && isSampling(ctx.country)) {
      const { pick, probs } = softmaxSample(logits, 1);
      trace.push({ country: ctx.country, kind: 'discard', cands, chosen: pick, probs, tau: 1 });
      return pick === 0;
    }
    return logits[0] > 0;
  });
}
