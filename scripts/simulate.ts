#!/usr/bin/env tsx
import { runSimulation, theoreticalBaseLineRtp } from '../src/sim/simulator';
import { GAME_CONFIG } from '../src/config/gameConfig';

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  return fallback;
}

const spins = Number(arg('spins', '200000'));
const seed = Number(arg('seed', String(0x5eedcafe)));
const bet = Number(arg('bet', String(GAME_CONFIG.defaultBet)));
const withTheory = process.argv.includes('--theory');

console.log(`${GAME_CONFIG.title} — RTP simulation`);
console.log(`spins=${spins} seed=${seed} bet=${bet}`);
console.log(`target RTP=${(GAME_CONFIG.rtpTarget * 100).toFixed(2)}%`);
console.log('---');

const t0 = Date.now();
const stats = runSimulation({ spins, seed, bet });
const ms = Date.now() - t0;

console.log(`Elapsed: ${ms}ms`);
console.log(`Total wagered: ${stats.totalWagered}`);
console.log(`Total returned: ${stats.totalReturned}`);
console.log(`RTP: ${(stats.rtp * 100).toFixed(4)}%`);
console.log(`95% CI: [${(stats.rtpCI95[0] * 100).toFixed(4)}%, ${(stats.rtpCI95[1] * 100).toFixed(4)}%]`);
console.log(`Hit frequency: ${(stats.hitFrequency * 100).toFixed(3)}%`);
console.log(`Losing-spin frequency: ${(stats.losingSpinFrequency * 100).toFixed(3)}%`);
console.log(`Volatility (std of win/bet): ${stats.volatilityStdDev.toFixed(4)}`);
console.log(`Max win (×bet): ${stats.maxWinMult.toFixed(2)}`);
console.log('Percentiles (×bet):', stats.percentiles);
console.log('Category RTP:');
for (const [k, v] of Object.entries(stats.categoryRtp)) {
  const target = GAME_CONFIG.rtpAllocation[k as keyof typeof GAME_CONFIG.rtpAllocation];
  console.log(
    `  ${k}: ${(v * 100).toFixed(4)}% (target ${(target * 100).toFixed(2)}%, credits ${stats.rtpByCategory[k as keyof typeof stats.rtpByCategory]})`,
  );
}
console.log(
  `  SUM: ${((stats.categoryRtp.BASE + stats.categoryRtp.BONUS + stats.categoryRtp.SEQUENCE + stats.categoryRtp.SPIRITUALITY) * 100).toFixed(4)}%`,
);
console.log('Bonus triggers:');
for (const [k, v] of Object.entries(stats.bonusTriggers)) {
  console.log(
    `  ${k}: count=${v.count} freq=${(v.frequency * 100).toFixed(4)}% avgPayout=${v.avgPayout.toFixed(2)}`,
  );
}
console.log(`Sequence applications (mult>1): ${stats.sequenceActivations}`);
console.log('Sequence mult histogram:', stats.sequenceMultHistogram);
console.log(`Spirituality activations: ${stats.spiritualityActivations}`);
console.log('Spirituality by effect:', stats.spiritualityByEffect);

const delta = Math.abs(stats.rtp - GAME_CONFIG.rtpTarget);
console.log('---');
console.log(
  `Delta vs ${(GAME_CONFIG.rtpTarget * 100).toFixed(2)}% target: ${(delta * 100).toFixed(4)} pp (tolerance ±${(GAME_CONFIG.rtpTolerance * 100).toFixed(2)} pp)`,
);
if (delta <= GAME_CONFIG.rtpTolerance) {
  console.log('PASS: measured RTP within tolerance.');
} else {
  console.log('OUT OF TOLERANCE: tune strips/paytable/bonus weights.');
  process.exit(1);
}

if (withTheory) {
  console.log('--- Theoretical base-only approx (no sequence/spirit/bonus) ---');
  const th = theoreticalBaseLineRtp(bet);
  console.log(th);
}
