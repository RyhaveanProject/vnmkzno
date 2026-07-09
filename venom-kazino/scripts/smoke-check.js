import { calculateGameResult } from '../src/lib/gameEngine.js';
const samples = [
  ['coinflip', { betAmount: 100, choice: 'heads' }],
  ['dice', { betAmount: 100, target: 60, rollUnder: true }],
  ['roulette', { betAmount: 100, betType: 'color', betValue: 'red' }],
  ['slots', { betAmount: 100 }],
  ['crash', { betAmount: 100, autoCashout: 2.5 }],
  ['plinko', { betAmount: 100, rows: 12 }]
];
for (const [game, payload] of samples) {
  const result = calculateGameResult(game, payload, `${game}-seed`);
  console.log(game, result.status, result.payout);
}
console.log('smoke-check-ok');
