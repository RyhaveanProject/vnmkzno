import crypto from 'crypto';
import { calculateGameResult, calculateBlackjackScore, drawCard } from '../lib/gameEngine.js';
import { env } from '../config/env.js';
import { changeBalance, recordWager } from './ledgerService.js';
import { BlackjackRound } from '../models/BlackjackRound.js';
import { JackpotRound } from '../models/JackpotRound.js';
import { LotteryDraw } from '../models/LotteryDraw.js';
import { PokerTournament } from '../models/PokerTournament.js';
import { Transaction } from '../models/Transaction.js';

function makeSeed(input) {
  return crypto.createHash('sha256').update(`${input}:${Date.now()}:${Math.random()}`).digest('hex');
}

export async function playSimpleGame(user, game, payload) {
  const betAmount = Math.floor(Number(payload.betAmount || 0));
  if (betAmount <= 0 || betAmount > env.maxBetStars) throw new Error('Bahis məbləği düzgün deyil');
  await changeBalance(user.telegramId, -betAmount, { type: 'bet', source: game, title: `${game} bahis`, meta: payload });
  await recordWager(user.telegramId, betAmount);
  const result = calculateGameResult(game, payload, makeSeed(`${user.telegramId}:${game}`), env.houseEdgeBps);
  if (result.payout > 0) {
    await changeBalance(user.telegramId, result.payout, { type: 'win', source: game, title: `${game} qazanc`, meta: result });
  }
  const balance = (await import('../models/User.js')).User;
  const freshUser = await balance.findOne({ telegramId: user.telegramId });
  return { ...result, balanceStars: freshUser.balanceStars, betAmount };
}

export async function startBlackjack(user, betAmount) {
  if (betAmount <= 0 || betAmount > env.maxBetStars) throw new Error('Bahis məbləği düzgün deyil');
  await changeBalance(user.telegramId, -betAmount, { type: 'bet', source: 'blackjack', title: 'blackjack bahis' });
  await recordWager(user.telegramId, betAmount);
  const seed = makeSeed(`blackjack:${user.telegramId}`);
  const playerCards = [drawCard(seed, 1), drawCard(seed, 2)];
  const dealerCards = [drawCard(seed, 3)];
  const playerScore = calculateBlackjackScore(playerCards);
  const dealerScore = calculateBlackjackScore(dealerCards);
  const round = await BlackjackRound.create({ telegramId: user.telegramId, betAmount, playerCards, dealerCards, playerScore, dealerScore, seed, step: 4 });
  if (playerScore === 21) {
    round.status = 'settled';
    round.payout = Math.floor(betAmount * 2.5);
    await round.save();
    await changeBalance(user.telegramId, round.payout, { type: 'win', source: 'blackjack', title: 'blackjack natural', meta: { roundId: round._id.toString() } });
  }
  return round;
}

export async function blackjackHit(user) {
  const round = await BlackjackRound.findOne({ telegramId: user.telegramId, status: 'playing' }).sort({ createdAt: -1 });
  if (!round) throw new Error('Aktiv blackjack oyunu tapılmadı');
  const card = drawCard(round.seed, round.step + 1);
  round.step += 1;
  round.playerCards.push(card);
  round.playerScore = calculateBlackjackScore(round.playerCards);
  if (round.playerScore > 21) {
    round.status = 'settled';
    round.payout = 0;
  }
  await round.save();
  return round;
}

export async function blackjackStand(user) {
  const round = await BlackjackRound.findOne({ telegramId: user.telegramId, status: 'playing' }).sort({ createdAt: -1 });
  if (!round) throw new Error('Aktiv blackjack oyunu tapılmadı');
  while (round.dealerScore < 17) {
    const card = drawCard(round.seed, round.step + 1);
    round.step += 1;
    round.dealerCards.push(card);
    round.dealerScore = calculateBlackjackScore(round.dealerCards);
  }
  round.status = 'settled';
  let payout = 0;
  if (round.dealerScore > 21 || round.playerScore > round.dealerScore) payout = round.betAmount * 2;
  else if (round.playerScore === round.dealerScore) payout = round.betAmount;
  round.payout = payout;
  await round.save();
  if (payout > 0) await changeBalance(user.telegramId, payout, { type: 'win', source: 'blackjack', title: 'blackjack nəticə', meta: { roundId: round._id.toString() } });
  return round;
}

export async function getOrCreateJackpot() {
  let round = await JackpotRound.findOne({ status: 'open' }).sort({ roundNo: -1 });
  if (!round) round = await JackpotRound.create({ roundNo: 1, poolStars: 0, entries: [], status: 'open' });
  return round;
}

export async function playJackpot(user, betAmount) {
  if (betAmount <= 0 || betAmount > env.maxBetStars) throw new Error('Bahis məbləği düzgün deyil');
  await changeBalance(user.telegramId, -betAmount, { type: 'bet', source: 'jackpot', title: 'jackpot giriş' });
  await recordWager(user.telegramId, betAmount);
  const round = await getOrCreateJackpot();
  const contribution = Math.floor(betAmount * 0.95);
  round.poolStars += contribution;
  round.entries.push({ telegramId: user.telegramId, username: user.username, amount: betAmount, tickets: contribution || 1, joinedAt: new Date().toISOString() });
  let winner = null;
  if (round.entries.length >= 5) {
    const totalTickets = round.entries.reduce((sum, item) => sum + item.tickets, 0);
    let ticket = Math.floor(Math.random() * totalTickets);
    for (const entry of round.entries) {
      ticket -= entry.tickets;
      if (ticket < 0) { winner = entry; break; }
    }
    if (winner) {
      round.status = 'settled';
      round.winnerTelegramId = winner.telegramId;
      round.closedAt = new Date();
      await changeBalance(winner.telegramId, round.poolStars, { type: 'win', source: 'jackpot', title: 'jackpot qazanc', meta: { roundNo: round.roundNo } });
      await Transaction.create({ telegramId: winner.telegramId, type: 'jackpot', amountStars: 0, balanceAfter: 0, source: 'jackpot', title: `round ${round.roundNo}`, meta: { winner, poolStars: round.poolStars } });
    }
  }
  await round.save();
  if (winner) await JackpotRound.create({ roundNo: round.roundNo + 1, poolStars: 0, entries: [], status: 'open' });
  return { round, winner };
}

function nextDrawAt() {
  const at = new Date();
  at.setUTCHours(at.getUTCHours() + 1, 0, 0, 0);
  return at;
}

export async function getOrCreateLotteryDraw() {
  let draw = await LotteryDraw.findOne({ status: 'open' }).sort({ drawNo: -1 });
  if (!draw) draw = await LotteryDraw.create({ drawNo: 1, drawAt: nextDrawAt(), prizePoolStars: 0, tickets: [], status: 'open' });
  return draw;
}

function uniqueLotteryNumbers(seed) {
  const list = new Set();
  let i = 1;
  while (list.size < 6) {
    const n = (parseInt(crypto.createHash('sha256').update(`${seed}:${i}`).digest('hex').slice(0, 8), 16) % 49) + 1;
    list.add(n);
    i += 1;
  }
  return [...list].sort((a, b) => a - b);
}

export async function buyLotteryTicket(user, betAmount, numbers) {
  const safeNumbers = [...new Set((numbers || []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 49))].sort((a, b) => a - b);
  if (safeNumbers.length !== 6) throw new Error('6 unikal rəqəm lazımdır');
  await settleLotteryIfNeeded();
  const draw = await getOrCreateLotteryDraw();
  await changeBalance(user.telegramId, -betAmount, { type: 'bet', source: 'lottery', title: 'lottery ticket', meta: { numbers: safeNumbers } });
  await recordWager(user.telegramId, betAmount);
  draw.prizePoolStars += betAmount;
  draw.tickets.push({ telegramId: user.telegramId, username: user.username, betAmount, numbers: safeNumbers, purchasedAt: new Date().toISOString() });
  await draw.save();
  return draw;
}

export async function settleLotteryIfNeeded() {
  const draw = await LotteryDraw.findOne({ status: 'open' }).sort({ drawNo: -1 });
  if (!draw || draw.drawAt > new Date()) return draw;
  draw.winningNumbers = uniqueLotteryNumbers(`lottery:${draw.drawNo}`);
  draw.status = 'settled';
  draw.closedAt = new Date();
  const buckets = { 6: [], 5: [], 4: [] };
  for (const ticket of draw.tickets) {
    const matches = ticket.numbers.filter((n) => draw.winningNumbers.includes(n)).length;
    if (buckets[matches]) buckets[matches].push({ ...ticket, matches });
  }
  const prizeMap = { 6: 0.7, 5: 0.2, 4: 0.1 };
  for (const key of [6,5,4]) {
    const winners = buckets[key];
    if (!winners.length) continue;
    const prizeEach = Math.floor((draw.prizePoolStars * prizeMap[key]) / winners.length);
    for (const winner of winners) {
      await changeBalance(winner.telegramId, prizeEach, { type: 'win', source: 'lottery', title: `lottery ${key} match`, meta: { drawNo: draw.drawNo, numbers: draw.winningNumbers } });
    }
  }
  await draw.save();
  await LotteryDraw.create({ drawNo: draw.drawNo + 1, drawAt: nextDrawAt(), prizePoolStars: 0, tickets: [], status: 'open' });
  return draw;
}

export async function joinPokerTournament(user, buyInStars = 100, maxPlayers = 4) {
  let table = await PokerTournament.findOne({ status: 'waiting', buyInStars, maxPlayers }).sort({ createdAt: 1 });
  if (!table) table = await PokerTournament.create({ buyInStars, maxPlayers, prizePoolStars: 0, players: [], status: 'waiting' });
  if (table.players.some((player) => player.telegramId === user.telegramId)) return table;
  if (table.players.length >= table.maxPlayers) throw new Error('Poker masası doludur');
  await changeBalance(user.telegramId, -buyInStars, { type: 'bet', source: 'poker', title: 'poker buy-in', meta: { tableId: table._id.toString() } });
  await recordWager(user.telegramId, buyInStars);
  table.players.push({ telegramId: user.telegramId, username: user.username, joinedAt: new Date().toISOString() });
  table.prizePoolStars += buyInStars;
  if (table.players.length >= table.maxPlayers) {
    const winner = table.players[Math.floor(Math.random() * table.players.length)];
    table.status = 'settled';
    table.winnerTelegramId = winner.telegramId;
    await changeBalance(winner.telegramId, table.prizePoolStars, { type: 'win', source: 'poker', title: 'poker tournament', meta: { tableId: table._id.toString() } });
  }
  table.updatedAt = new Date();
  await table.save();
  return table;
}
