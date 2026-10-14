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

  if (job.mode === 'train') {
    // Per game: {kind, team, R, G} for each learning team.
    const records: { kind: string; team: string; R: number; G: Record<string, number> }[] = [];
    for (let i = 0; i < job.games; i++) {
      const selfPlay = i % 2 === 0;
      const learnerSide = Math.random() < 0.5 ? Team.AXIS : Team.ALLIES;
      const res = selfPlay
        ? await playGame({ axis: theta, allies: theta, learn: [Team.AXIS, Team.ALLIES], tau: job.tau })
        : await playGame({
            axis: learnerSide === Team.AXIS ? theta : base,
            allies: learnerSide === Team.ALLIES ? theta : base,
            learn: [learnerSide],
            tau: job.tau,
          });
      if (!res) continue;
      const teams = selfPlay ? [Team.AXIS, Team.ALLIES] : [learnerSide];
      for (const t of teams) {
        records.push({ kind: selfPlay ? 'self' : 'base', team: t, R: reward(res, t), G: teamGrad(res.trace, t) });
      }
    }
    writeFileSync(job.out, JSON.stringify(records));
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
