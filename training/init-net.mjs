// Adds a hidden-layer network (zero input rows, small random output weights, so
// behaviour starts identical to the input weights) to an existing weights file.
//   node training/init-net.mjs in.json out.json [seed-scale]
import { readFileSync, writeFileSync } from 'node:fs';
const [, , inp, out, scaleArg] = process.argv;
const H = 16, scale = +(scaleArg ?? 0.05);
const w = JSON.parse(readFileSync(inp, 'utf8'));
const rnd = () => (Math.random() * 2 - 1) * scale;
// W1 rows start at zero (created lazily by the trainer); the random w2 breaks symmetry.
for (const kind of ['play', 'build', 'battle', 'keep', 'discard'].flatMap((k) => [k + 'X', k + 'Y'])) {
  w[`N:${kind}:b2`] = 0;
  for (let j = 0; j < H; j++) { w[`N:${kind}:w2:${j}`] = rnd(); w[`N:${kind}:b1:${j}`] = 0; }
}
writeFileSync(out, JSON.stringify(w));
console.log('params', Object.keys(w).length);
