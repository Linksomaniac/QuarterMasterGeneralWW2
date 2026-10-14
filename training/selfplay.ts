import { vi } from 'vitest';
import { useGameStore } from '../src/game/store';
import { Country, GamePhase, Team, getTeam } from '../src/game/types';
import {
  Weights, clearPolicyOverrides, setPolicyOverride, setTrainingMode, drainTrace, TraceStep, Feats,
} from '../src/game/aiPolicy';

const ALL = [Country.GERMANY, Country.UK, Country.JAPAN, Country.SOVIET_UNION, Country.ITALY, Country.USA];

export interface GameSpec {
  /** weights per team; null = pure heuristic ({}) */
  axis: Weights;
  allies: Weights;
  /** which teams sample + record a trace (training) */
  learn: Team[];
  tau: number;
}

export interface GameResult {
  winner: Team | null;
  axisVP: number;
  alliesVP: number;
  rounds: number;
  trace: TraceStep[];
}

export async function playGame(spec: GameSpec): Promise<GameResult | null> {
  vi.clearAllTimers();
  clearPolicyOverrides();
  for (const c of ALL) setPolicyOverride(c, getTeam(c) === Team.AXIS ? spec.axis : spec.allies);
  const learnCountries = ALL.filter((c) => spec.learn.includes(getTeam(c)));
  setTrainingMode(learnCountries.length ? { tau: spec.tau, countries: learnCountries } : null);

  useGameStore.getState().initGame(ALL.map((c) => ({ country: c, isHuman: false, aiDifficulty: 'hard' as const })));
  let steps = 0;
  while (useGameStore.getState().phase !== GamePhase.GAME_OVER && steps < 600) {
    await vi.advanceTimersByTimeAsync(1000);
    steps++;
  }
  const s = useGameStore.getState();
  const trace = drainTrace();
  setTrainingMode(null);
  if (s.phase !== GamePhase.GAME_OVER) return null; // stuck game: discard
  return { winner: s.winner, axisVP: s.axisVP, alliesVP: s.alliesVP, rounds: s.round, trace };
}

/** Reward for a team in [-1, 1]: half win/loss, half clipped VP margin. */
export function reward(r: GameResult, team: Team): number {
  const margin = team === Team.AXIS ? r.axisVP - r.alliesVP : r.alliesVP - r.axisVP;
  const win = r.winner === team ? 1 : -1;
  return 0.5 * win + 0.5 * Math.max(-1, Math.min(1, margin / 60));
}

/** Sum of grad log pi over a team's trace steps, w.r.t. the linear weights. */
export function teamGrad(trace: TraceStep[], team: Team): Feats {
  const g: Feats = {};
  for (const st of trace) {
    if (getTeam(st.country) !== team) continue;
    const mean: Feats = {};
    st.cands.forEach((f, j) => {
      for (const k in f) mean[k] = (mean[k] ?? 0) + st.probs[j] * f[k];
    });
    const fc = st.cands[st.chosen];
    for (const k in fc) g[k] = (g[k] ?? 0) + fc[k] / st.tau;
    for (const k in mean) g[k] = (g[k] ?? 0) - mean[k] / st.tau;
  }
  return g;
}
