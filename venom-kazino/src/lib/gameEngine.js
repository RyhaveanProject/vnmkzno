import crypto from 'crypto';

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const SYMBOLS = ['🍒','🍋','🔔','💎','7️⃣','BAR'];
const PLINKO_MULTIPLIERS = {
  8: [5, 3, 1.5, 1.1, 0.7, 1.1, 1.5, 3, 5],
  10: [8, 5, 2.5, 1.4, 1.1, 0.6, 1.1, 1.4, 2.5, 5, 8],
  12: [12, 8, 4, 2, 1.5, 1.1, 0.5, 1.1, 1.5, 2, 4, 8, 12],
  16: [25, 12, 6, 3, 2, 1.4, 1.1, 0.6, 0.6, 1.1, 1.4, 2, 3, 6, 12, 25, 50]
};

function rng(seed) {
  return crypto.createHash('sha256').update(String(seed)).digest();
}

function num(seed, index, max) {
  const buffer = rng(`${seed}:${index}`);
  const value = buffer.readUInt32BE(0);
  return value % max;
}

function payoutWithHouseEdge(amount, multiplier, houseEdgeBps = 200) {
  return Math.floor(amount * multiplier * ((10000 - houseEdgeBps) / 10000));
}

function cardFromValue(value) {
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits = ['♠','♥','♦','♣'];
  return { rank: ranks[value % 13], suit: suits[Math.floor((value % 52) / 13)] };
}

function cardScore(rank) {
  if (rank === 'A') return 11;
  if (['J','Q','K'].includes(rank)) return 10;
  return Number(rank);
}

export function calculateBlackjackScore(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardScore(card.rank);
    if (card.rank === 'A') aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function drawCard(seed, index) {
  return cardFromValue(num(seed, index, 52));
}

export function calculateGameResult(game, payload, seed = 'seed', houseEdgeBps = 200) {
  const betAmount = Math.floor(Number(payload.betAmount || 0));
  if (betAmount <= 0) throw new Error('Məbləğ düzgün deyil');

  if (game === 'coinflip') {
    const result = num(seed, 1, 2) === 0 ? 'heads' : 'tails';
    const win = result === payload.choice;
    return {
      game,
      status: win ? 'won' : 'lost',
      result,
      payout: win ? payoutWithHouseEdge(betAmount, 1.95, 0) : 0,
      meta: { choice: payload.choice }
    };
  }

  if (game === 'dice') {
    const target = Math.min(99, Math.max(2, Math.floor(Number(payload.target || 50))));
    const rollUnder = Boolean(payload.rollUnder);
    const roll = num(seed, 2, 100) + 1;
    const win = rollUnder ? roll < target : roll > target;
    const probability = rollUnder ? target - 1 : 100 - target;
    const multiplier = 100 / probability;
    return {
      game,
      status: win ? 'won' : 'lost',
      result: roll,
      payout: win ? payoutWithHouseEdge(betAmount, multiplier, houseEdgeBps) : 0,
      meta: { target, rollUnder }
    };
  }

  if (game === 'crash') {
    const autoCashout = Math.max(1.01, Number(payload.autoCashout || 2));
    const raw = num(seed, 3, 100000) / 100000;
    const crashPoint = Number(Math.max(1, (0.99 / (1 - raw))).toFixed(2));
    const win = autoCashout <= crashPoint;
    return {
      game,
      status: win ? 'won' : 'lost',
      result: crashPoint,
      payout: win ? payoutWithHouseEdge(betAmount, autoCashout, houseEdgeBps) : 0,
      meta: { autoCashout }
    };
  }

  if (game === 'plinko') {
    const rows = [8,10,12,16].includes(Number(payload.rows)) ? Number(payload.rows) : 12;
    const buckets = PLINKO_MULTIPLIERS[rows];
    let position = 0;
    for (let i = 0; i < rows; i += 1) position += num(seed, i + 10, 2) === 0 ? -1 : 1;
    const bucketIndex = Math.min(buckets.length - 1, Math.max(0, Math.floor((position + rows) / 2)));
    const multiplier = buckets[bucketIndex];
    return {
      game,
      status: multiplier >= 1 ? 'won' : 'lost',
      result: { position, bucketIndex, multiplier },
      payout: payoutWithHouseEdge(betAmount, multiplier, houseEdgeBps),
      meta: { rows }
    };
  }

  if (game === 'roulette') {
    const winningNumber = num(seed, 4, 37);
    const betType = payload.betType || 'color';
    const betValue = payload.betValue;
    let win = false;
    let multiplier = 0;
    if (betType === 'single') {
      win = Number(betValue) === winningNumber;
      multiplier = 36;
    } else if (betType === 'color') {
      const isRed = RED_NUMBERS.has(winningNumber);
      win = (betValue === 'red' && isRed) || (betValue === 'black' && winningNumber !== 0 && !isRed);
      multiplier = 2;
    } else if (betType === 'oddEven') {
      win = (betValue === 'odd' && winningNumber % 2 === 1) || (betValue === 'even' && winningNumber !== 0 && winningNumber % 2 === 0);
      multiplier = 2;
    } else if (betType === 'highLow') {
      win = (betValue === 'low' && winningNumber >= 1 && winningNumber <= 18) || (betValue === 'high' && winningNumber >= 19 && winningNumber <= 36);
      multiplier = 2;
    } else if (betType === 'dozen') {
      const dozen = winningNumber === 0 ? -1 : Math.floor((winningNumber - 1) / 12) + 1;
      win = Number(betValue) === dozen;
      multiplier = 3;
    }
    return {
      game,
      status: win ? 'won' : 'lost',
      result: winningNumber,
      payout: win ? payoutWithHouseEdge(betAmount, multiplier, houseEdgeBps) : 0,
      meta: { betType, betValue }
    };
  }

  if (game === 'slots') {
    const reels = [num(seed, 5, 6), num(seed, 6, 6), num(seed, 7, 6)];
    let multiplier = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) {
      if (reels[0] === 4) multiplier = 25;
      else if (reels[0] === 5) multiplier = 10;
      else if (reels[0] === 3) multiplier = 5;
      else multiplier = 2;
    } else if (new Set(reels).size === 2) {
      multiplier = 1;
    }
    return {
      game,
      status: multiplier > 0 ? 'won' : 'lost',
      result: reels.map((index) => SYMBOLS[index]),
      payout: multiplier > 0 ? payoutWithHouseEdge(betAmount, multiplier, houseEdgeBps) : 0,
      meta: { reels }
    };
  }

  if (game === 'jackpot') {
    return { game, status: 'pending', result: null, payout: 0, meta: {} };
  }

  if (game === 'lottery') {
    return { game, status: 'pending', result: null, payout: 0, meta: {} };
  }

  if (game === 'poker') {
    return { game, status: 'pending', result: null, payout: 0, meta: {} };
  }

  throw new Error('Oyunun nəticəsi hesablanmadı');
}
