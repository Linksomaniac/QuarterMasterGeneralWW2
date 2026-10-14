// Self-play REINFORCE trainer for the Hard AI card policy.
//
//   node training/train.mjs [--iters 300] [--games 100] [--workers 8] [--lr 0.08]
//                           [--tau 3] [--l2 0.002] [--eval-every 25] [--eval-games 1000]
//                           [--init path.json] [--out training/out]
//
// Each iteration: workers play self-play games (all six powers use the
// current weights and sample from a softmax) and games against the plain
// heuristic AI; the policy gradient is averaged and applied with Adam.
// Periodically the deployment policy (argmax) is evaluated head-to-head
// against the plain heuristic AI with sides alternated.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const ITERS = +arg('iters', 300), GAMES = +arg('games', 100), WORKERS = +arg('workers', 8);
const LR = +arg('lr', 0.08), TAU = +arg('tau', 3), L2 = +arg('l2', 0.002);
const EVAL_EVERY = +arg('eval-every', 25), EVAL_GAMES = +arg('eval-games', 1000);
const OUT = arg('out', 'training/out');
const NETLR = +arg('net-lr-mult', 0.25);
const PROMOTE = +arg('promote', 0.55);
// Moving opponent ("champion") for the non-self-play half of training games, plus a fixed reference.
let champion = arg('baseline') ? JSON.parse(readFileSync(arg('baseline'), 'utf8')) : {};
const ref = arg('ref') ? JSON.parse(readFileSync(arg('ref'), 'utf8')) : champion;
mkdirSync(OUT, { recursive: true });

let theta = arg('init') ? JSON.parse(readFileSync(arg('init'), 'utf8')) : {};
const m = {}, v = {};
let t = 0;

function runWorker(job, tag) {
  const jobPath = `${OUT}/job-${tag}.json`;
  job.out = `${OUT}/res-${tag}.json`;
  writeFileSync(jobPath, JSON.stringify(job));
  return new Promise((resolve, reject) => {
    const p = spawn('npx', ['vitest', 'run', '--config', 'training/vitest.train.config.ts'],
      { env: { ...process.env, TRAIN_JOB: jobPath }, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => {
      if (code !== 0 || !existsSync(job.out)) return reject(new Error(`worker ${tag} failed: ${err.slice(-500)}`));
      resolve(JSON.parse(readFileSync(job.out, 'utf8')));
    });
  });
}

async function evaluate(w, games, opp = champion) {
  const per = Math.ceil(games / WORKERS);
  const rs = await Promise.all(Array.from({ length: WORKERS }, (_, i) =>
    runWorker({ mode: 'eval', theta: w, baseline: opp, games: per }, `eval${i}`)));
  let n = 0, wins = 0, ms = 0;
  for (const r of rs) { n += r.n; wins += r.wins; ms += r.marginSum; }
  const p = wins / n, se = Math.sqrt(p * (1 - p) / n);
  return { n, winRate: p, se, avgMargin: ms / n };
}

const fmt = (e) => `win ${(100 * e.winRate).toFixed(1)}% ±${(196 * e.se).toFixed(1)} margin ${e.avgMargin.toFixed(1)} (n=${e.n})`;

if (process.argv.includes('--eval-only')) {
  console.log('eval-only:', fmt(await evaluate(theta, EVAL_GAMES)));
  process.exit(0);
}
console.log('champion mirror check:', fmt(await evaluate(champion, EVAL_GAMES)));

for (let it = 1; it <= ITERS; it++) {
  const rs = await Promise.all(Array.from({ length: WORKERS }, (_, i) =>
    runWorker({ mode: 'train', theta, baseline: champion, games: GAMES, tau: TAU }, `train${i}`)));
  // Workers return advantage-weighted gradient sums (local reward baselines).
  const grad = {};
  let N = 0;
  const meanRs = {};
  for (const r of rs) {
    N += r.n;
    for (const k in r.grad) grad[k] = (grad[k] ?? 0) + r.grad[k];
    for (const k in r.means) (meanRs[k] ??= []).push(r.means[k]);
  }
  const meanR = Object.fromEntries(Object.entries(meanRs).map(([k, a]) => [k, +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3)]));
  t++;
  const keys = new Set([...Object.keys(grad), ...Object.keys(theta)]);
  let gnorm = 0;
  for (const k of keys) {
    const g = (grad[k] ?? 0) / N - L2 * (theta[k] ?? 0); // ascent direction
    gnorm += g * g;
    m[k] = 0.9 * (m[k] ?? 0) + 0.1 * g;
    v[k] = 0.999 * (v[k] ?? 0) + 0.001 * g * g;
    const step = LR * (k.startsWith('N:') ? NETLR : 1) * (m[k] / (1 - 0.9 ** t)) / (Math.sqrt(v[k] / (1 - 0.999 ** t)) + 1e-8);
    theta[k] = Math.max(-15, Math.min(15, (theta[k] ?? 0) + step));
  }
  console.log(`iter ${it} records=${N} |g|=${Math.sqrt(gnorm).toFixed(4)} params=${Object.keys(theta).length} meanR=${JSON.stringify(meanR)}`);

  if (it % EVAL_EVERY === 0 || it === ITERS) {
    writeFileSync(`${OUT}/weights-${it}.json`, JSON.stringify(theta));
    writeFileSync(`${OUT}/weights-latest.json`, JSON.stringify(theta));
    const vsChamp = await evaluate(theta, EVAL_GAMES, champion);
    console.log(`  eval @${it}: vs champion ${fmt(vsChamp)}`);
    console.log(`  eval @${it}: vs reference ${fmt(await evaluate(theta, EVAL_GAMES, ref))}`);
    console.log(`  eval @${it}: vs heuristic ${fmt(await evaluate(theta, EVAL_GAMES, {}))}`);
    if (vsChamp.winRate - 1.96 * vsChamp.se > 0.5 && vsChamp.winRate >= PROMOTE) {
      champion = JSON.parse(JSON.stringify(theta));
      writeFileSync(`${OUT}/champion.json`, JSON.stringify(champion));
      console.log(`  promoted new champion @${it}`);
    }
  }
}
