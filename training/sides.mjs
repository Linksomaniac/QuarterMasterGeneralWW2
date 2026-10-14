// Axis vs Allies balance when all six powers use the given weights.
//   node training/sides.mjs [weights.json] [games] [workers]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [, , wp = 'src/game/aiWeights.json', games = '4000', workers = '8'] = process.argv;
const theta = JSON.parse(readFileSync(wp, 'utf8'));
mkdirSync('training/out', { recursive: true });
const per = Math.ceil(+games / +workers);
const run = (i) => new Promise((res, rej) => {
  const job = `training/out/sides-job-${i}.json`, out = `training/out/sides-res-${i}.json`;
  writeFileSync(job, JSON.stringify({ mode: 'sides', theta, baseline: {}, games: per, out }));
  const p = spawn('npx', ['vitest', 'run', '--config', 'training/vitest.train.config.ts'], { env: { ...process.env, TRAIN_JOB: job }, stdio: 'ignore' });
  p.on('close', (c) => (c === 0 ? res(JSON.parse(readFileSync(out, 'utf8'))) : rej(new Error('worker failed'))));
});
const rs = await Promise.all(Array.from({ length: +workers }, (_, i) => run(i)));
const t = rs.reduce((a, r) => { for (const k in r) a[k] = (a[k] ?? 0) + r[k]; return a; }, {});
console.log(`games=${t.n}  Axis wins=${t.axis} (${(100 * t.axis / t.n).toFixed(1)}%)  Allies wins=${t.allies} (${(100 * t.allies / t.n).toFixed(1)}%)`);
console.log(`ended by sudden victory (30+ VP lead): ${(100 * t.sudden / t.n).toFixed(1)}%   avg VP axis=${(t.axisVP / t.n).toFixed(0)} allies=${(t.alliesVP / t.n).toFixed(0)}`);
