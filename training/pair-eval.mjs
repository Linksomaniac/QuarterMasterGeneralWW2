// Evaluate an {axis, allies} weights pair.
//   node training/pair-eval.mjs pair.json [games-per-match] [reference.json]
// Reports self-play side split, and the pair's win rate vs a reference weight set.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [, , pp, games = '2000', rp = 'training/ref/weights-v2.json'] = process.argv;
const pair = JSON.parse(readFileSync(pp, 'utf8')), ref = JSON.parse(readFileSync(rp, 'utf8'));
const W = 8; mkdirSync('training/out', { recursive: true });
const run = (axis, allies, tag) => Promise.all(Array.from({ length: W }, (_, i) => new Promise((res, rej) => {
  const job = `training/out/pe-${tag}-${i}.json`, out = `training/out/pe-${tag}-${i}.res.json`;
  writeFileSync(job, JSON.stringify({ mode: 'match', axis, allies, games: Math.ceil(+games / W), out }));
  spawn('npx', ['vitest', 'run', '--config', 'training/vitest.train.config.ts'], { env: { ...process.env, TRAIN_JOB: job }, stdio: 'ignore' })
    .on('close', (c) => (c === 0 ? res(JSON.parse(readFileSync(out, 'utf8'))) : rej(new Error('fail'))));
}))).then((rs) => { const n = rs.reduce((a, r) => a + r.n, 0), w = rs.reduce((a, r) => a + r.axisWins, 0); return { n, p: w / n, se: Math.sqrt((w / n) * (1 - w / n) / n) }; });
const pc = (x) => (100 * x).toFixed(1);
const self = await run(pair.axis, pair.allies, 'self');
console.log(`pair self-play: Axis ${pc(self.p)}% / Allies ${pc(1 - self.p)}% (±${pc(1.96 * self.se)}, n=${self.n})`);
const ax = await run(pair.axis, ref, 'ax'), al = await run(ref, pair.allies, 'al'), rr = await run(ref, ref, 'rr');
console.log(`reference mirror: Axis ${pc(rr.p)}% / Allies ${pc(1 - rr.p)}% (n=${rr.n})`);
console.log(`pair as Axis vs reference Allies: ${pc(ax.p)}% (reference as Axis vs itself: ${pc(rr.p)}%)`);
console.log(`pair as Allies vs reference Axis: ${pc(1 - al.p)}% (reference as Allies vs itself: ${pc(1 - rr.p)}%)`);
const overall = (ax.p + (1 - al.p)) / 2;
console.log(`pair overall win rate vs reference (sides averaged): ${pc(overall)}%`);
