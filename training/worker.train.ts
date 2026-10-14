// Driven by training/train.mjs via env TRAIN_JOB (path to a job JSON). Not a real test.
import { it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { Team } from '../src/game/types';
import { playGame, reward, teamGrad } from './selfplay';

it('selfplay worker', async () => {
  const jobPath = process.env.TRAIN_JOB;
  if (!jobPath) return;
  const job = JSON.parse(readFileSync(jobPath, 'utf8'));
  const theta = job.theta as Record<string, number>;
  const base = job.baseline as Record<string, number>;
  vi.useFakeTimers();
  const realLog = console.log;
  console.log = () => {};

  const pick = <T,>(xs: T[]): T => (Math.random() < 0.6 ? xs[xs.length - 1] : xs[Math.floor(Math.random() * xs.length)]);
  if (job.mode === 'match') {
    // Explicit axis/allies weights; no sampling. Returns Axis win count.
    let n = 0, axisWins = 0;
    for (let i = 0; i < job.games; i++) {
      const res = await playGame({ axis: job.axis, allies: job.allies, learn: [], tau: 1 });
      if (!res) continue;
      n++;
      if (res.winner === Team.AXIS) axisWins++;
    }
    writeFileSync(job.out, JSON.stringify({ n, axisWins }));
    console.log = realLog;
    return;
  }

  if (job.mode === 'train') {
    // League: 1/3 self-play, 1/3 learner as Axis vs an Allies champion,
    // 1/3 learner as Allies vs an Axis champion (opponents drawn from the pools).
    const records: { kind: string; team: string; R: number; G: Record<string, number> }[] = [];
    for (let i = 0; i < job.games; i++) {
      const mode = i % 3;
      const learnerSide = mode === 1 ? Team.AXIS : Team.ALLIES;
      const res = mode === 0
        ? await playGame({ axis: theta, allies: theta, learn: [Team.AXIS, Team.ALLIES], tau: job.tau })
        : await playGame({
            axis: learnerSide === Team.AXIS ? theta : pick<Record<string, number>>(job.poolAxis),
            allies: learnerSide === Team.ALLIES ? theta : pick<Record<string, number>>(job.poolAllies),
            learn: [learnerSide],
            tau: job.tau,
          });
      if (!res) continue;
      const teams = mode === 0 ? [Team.AXIS, Team.ALLIES] : [learnerSide];
      for (const t of teams) {
        records.push({ kind: mode === 0 ? 'self' : 'lg', team: t, R: reward(res, t), G: teamGrad(res.trace, t, theta) });
      }
    }
    const sums: Record<string, { s: number; n: number }> = {};
    for (const r of records) { const k = r.kind + r.team; (sums[k] ??= { s: 0, n: 0 }); sums[k].s += r.R; sums[k].n++; }
    const grad: Record<string, number> = {};
    for (const r of records) {
      const b = sums[r.kind + r.team].s / sums[r.kind + r.team].n;
      const adv = r.R - b;
      for (const k in r.G) grad[k] = (grad[k] ?? 0) + adv * r.G[k];
    }
    const means = Object.fromEntries(Object.entries(sums).map(([k, x]) => [k, x.s / x.n]));
    const out = { n: records.length, grad, means };
    writeFileSync(job.out, JSON.stringify(out));
    console.log = realLog;
    return;
  } else if (job.mode === 'sides') {
    // All six powers use `theta`: who wins, and how do games end?
    let n = 0, axis = 0, allies = 0, sudden = 0, axisVP = 0, alliesVP = 0;
    for (let i = 0; i < job.games; i++) {
      const res = await playGame({ axis: theta, allies: theta, learn: [], tau: 1 });
      if (!res) continue;
      n++;
      if (res.winner === Team.AXIS) axis++; else if (res.winner === Team.ALLIES) allies++;
      if (Math.abs(res.axisVP - res.alliesVP) >= 30) sudden++;
      axisVP += res.axisVP; alliesVP += res.alliesVP;
    }
    writeFileSync(job.out, JSON.stringify({ n, axis, allies, sudden, axisVP, alliesVP }));
  } else {
    // eval: deployment behaviour (no sampling). theta vs baseline, alternating sides.
    let wins = 0, n = 0, marginSum = 0;
    const margins: number[] = [];
    for (let i = 0; i < job.games; i++) {
      const side = i % 2 === 0 ? Team.AXIS : Team.ALLIES;
      const res = await playGame({
        axis: side === Team.AXIS ? theta : base,
        allies: side === Team.ALLIES ? theta : base,
        learn: [],
        tau: 1,
      });
      if (!res) continue;
      n++;
      if (res.winner === side) wins++;
      const m = side === Team.AXIS ? res.axisVP - res.alliesVP : res.alliesVP - res.axisVP;
      marginSum += m;
      margins.push(m);
    }
    writeFileSync(job.out, JSON.stringify({ n, wins, marginSum, margins }));
  }
  console.log = realLog;
}, 3_600_000);
