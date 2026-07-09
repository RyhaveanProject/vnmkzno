import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { connectDb } from './lib/db.js';
import { validateTelegramInitData } from './lib/telegramAuth.js';
import { integerAmount, signToken } from './lib/utils.js';
import { User } from './models/User.js';
import { Transaction } from './models/Transaction.js';
import { Withdrawal } from './models/Withdrawal.js';
import { BlackjackRound } from './models/BlackjackRound.js';
import { PokerTournament } from './models/PokerTournament.js';
import { GiftDeposit } from './models/GiftDeposit.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import { changeBalance } from './services/ledgerService.js';
import { createInvoiceLink, getBot, sendAdminMessage, setupBotWebhook } from './services/telegramService.js';
import { buyLotteryTicket, blackjackHit, blackjackStand, getOrCreateJackpot, getOrCreateLotteryDraw, joinPokerTournament, playJackpot, playSimpleGame, settleLotteryIfNeeded, startBlackjack } from './services/gameService.js';
import { startUserbotWatcher } from './services/userbotService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, '..', 'public')));

function serializeUser(user) {
  return {
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
    balanceStars: user.balanceStars,
    totalDepositedStars: user.totalDepositedStars,
    totalWithdrawnStars: user.totalWithdrawnStars,
    totalWageredStars: user.totalWageredStars,
    isAdmin: user.isAdmin
  };
}

async function upsertTelegramUser(userData) {
  const telegramId = Number(userData.id);
  const payload = {
    telegramId,
    username: userData.username || '',
    firstName: userData.first_name || userData.firstName || '',
    lastName: userData.last_name || userData.lastName || '',
    photoUrl: userData.photo_url || userData.photoUrl || '',
    languageCode: userData.language_code || '',
    isAdmin: env.adminIds.includes(telegramId),
    lastLoginAt: new Date(),
    updatedAt: new Date()
  };
  return User.findOneAndUpdate({ telegramId }, { $set: payload, $setOnInsert: { createdAt: new Date() } }, { new: true, upsert: true });
}

app.get('/health', async (_req, res) => {
  const openDraw = await getOrCreateLotteryDraw().catch(() => null);
  res.json({ ok: true, name: 'Venom Kazino', lotteryDrawAt: openDraw?.drawAt || null });
});

app.get('/api/config', (_req, res) => {
  res.json({
    ok: true,
    name: 'Venom Kazino',
    botUsername: env.botUsername,
    appUrl: env.appUrl,
    minWithdrawStars: env.minWithdrawStars,
    maxBetStars: env.maxBetStars,
    adminUsername: env.adminUsername,
    channelLink: env.channelLink,
    userbotEnabled: env.userbotEnabled
  });
});

app.post('/api/auth/telegram', async (req, res) => {
  try {
    if (!env.botToken) return res.status(400).json({ ok: false, error: 'BOT_TOKEN qurulmayıb' });
    const { initData } = req.body || {};
    const checked = validateTelegramInitData(initData, env.botToken);
    if (!checked.ok) return res.status(401).json({ ok: false, error: checked.reason });
    const user = await upsertTelegramUser(checked.user);
    const token = signToken({ telegramId: user.telegramId, issuedAt: Date.now() }, env.jwtSecret);
    res.json({ ok: true, token, user: serializeUser(user) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/auth/dev-login', async (req, res) => {
  try {
    const user = await upsertTelegramUser({
      id: Number(req.body?.telegramId || 9990001),
      username: req.body?.username || 'dev_user',
      first_name: req.body?.firstName || 'Dev',
      last_name: req.body?.lastName || 'User'
    });
    const token = signToken({ telegramId: user.telegramId, issuedAt: Date.now(), dev: true }, env.jwtSecret);
    res.json({ ok: true, token, user: serializeUser(user) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  res.json({ ok: true, user: serializeUser(req.user) });
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  const items = await Transaction.find({ telegramId: req.user.telegramId }).sort({ createdAt: -1 }).limit(80);
  res.json({ ok: true, items });
});

app.post('/api/payments/invoice', requireAuth, async (req, res) => {
  try {
    const amountStars = integerAmount(req.body?.amountStars);
    if (amountStars <= 0) return res.status(400).json({ ok: false, error: 'Məbləğ düzgün deyil' });
    const payload = `deposit:${req.user.telegramId}:${amountStars}:${Date.now()}`;
    const link = await createInvoiceLink({
      telegramId: req.user.telegramId,
      amountStars,
      title: `Venom Kazino balans artırma`,
      description: `${amountStars} Telegram Stars balans artırma`,
      payload
    });
    res.json({ ok: true, link, payload });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/gift-deposit/status', requireAuth, async (req, res) => {
  const items = await GiftDeposit.find({ fromTelegramId: req.user.telegramId }).sort({ createdAt: -1 }).limit(20);
  res.json({ ok: true, items, adminUsername: env.adminUsername, adminTelegramId: env.adminIds[0] || null });
});

app.post('/api/withdrawals', requireAuth, async (req, res) => {
  try {
    const gross = integerAmount(req.body?.amountStars);
    const details = String(req.body?.details || '').trim();
    if (gross < env.minWithdrawStars) return res.status(400).json({ ok: false, error: `Minimum çıxarış ${env.minWithdrawStars} stars` });
    if (!details) return res.status(400).json({ ok: false, error: 'Çıxarış məlumatı boşdur' });
    const fee = Math.ceil(gross * 0.08);
    const net = gross - fee;
    const user = await changeBalance(req.user.telegramId, -gross, { type: 'withdrawal', source: 'withdrawal', title: 'çıxarış sorğusu', meta: { fee, net, details } });
    await User.findOneAndUpdate({ telegramId: req.user.telegramId }, { $inc: { totalWithdrawnStars: gross } });
    const record = await Withdrawal.create({ telegramId: req.user.telegramId, username: req.user.username, grossStars: gross, feeStars: fee, netStars: net, details, status: 'pending' });
    const time = new Date().toISOString();
    await sendAdminMessage(`💸 <b>Yeni çıxarış sorğusu</b>\nUser ID: <code>${req.user.telegramId}</code>\nTag: @${req.user.username || 'unknown'}\nAd: ${req.user.firstName || ''} ${req.user.lastName || ''}\nMəbləğ: <b>${gross}</b> stars\nKomissiya: <b>${fee}</b> stars\nNet: <b>${net}</b> stars\nTarix/Saat: <code>${time}</code>\nMəlumat: <code>${details}</code>`);
    res.json({ ok: true, record, balanceStars: user.balanceStars });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.get('/api/admin/withdrawals', requireAuth, requireAdmin, async (_req, res) => {
  const items = await Withdrawal.find({}).sort({ createdAt: -1 }).limit(100);
  res.json({ ok: true, items });
});

app.get('/api/admin/stats', requireAuth, requireAdmin, async (_req, res) => {
  const users = await User.countDocuments();
  const deposits = await Transaction.aggregate([{ $match: { type: 'deposit' } }, { $group: { _id: null, total: { $sum: '$amountStars' } } }]);
  const withdrawals = await Withdrawal.aggregate([{ $group: { _id: null, total: { $sum: '$grossStars' } } }]);
  res.json({ ok: true, users, depositedStars: deposits[0]?.total || 0, withdrawnStars: withdrawals[0]?.total || 0 });
});

for (const game of ['coinflip', 'dice', 'crash', 'plinko', 'roulette', 'slots']) {
  app.post(`/api/games/${game}/play`, requireAuth, async (req, res) => {
    try {
      const result = await playSimpleGame(req.user, game, req.body || {});
      res.json({ ok: true, result });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });
}

app.post('/api/games/blackjack/start', requireAuth, async (req, res) => {
  try {
    const round = await startBlackjack(req.user, integerAmount(req.body?.betAmount));
    res.json({ ok: true, round });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/games/blackjack/hit', requireAuth, async (req, res) => {
  try {
    const round = await blackjackHit(req.user);
    res.json({ ok: true, round });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/games/blackjack/stand', requireAuth, async (req, res) => {
  try {
    const round = await blackjackStand(req.user);
    res.json({ ok: true, round });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.get('/api/games/blackjack/current', requireAuth, async (req, res) => {
  const round = await BlackjackRound.findOne({ telegramId: req.user.telegramId, status: 'playing' }).sort({ createdAt: -1 });
  res.json({ ok: true, round });
});

app.get('/api/games/jackpot/status', requireAuth, async (_req, res) => {
  const round = await getOrCreateJackpot();
  res.json({ ok: true, round });
});

app.post('/api/games/jackpot/play', requireAuth, async (req, res) => {
  try {
    const outcome = await playJackpot(req.user, integerAmount(req.body?.betAmount));
    res.json({ ok: true, ...outcome });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.get('/api/games/lottery/status', requireAuth, async (_req, res) => {
  await settleLotteryIfNeeded();
  const draw = await getOrCreateLotteryDraw();
  res.json({ ok: true, draw });
});

app.post('/api/games/lottery/buy', requireAuth, async (req, res) => {
  try {
    const draw = await buyLotteryTicket(req.user, integerAmount(req.body?.betAmount), req.body?.numbers || []);
    res.json({ ok: true, draw });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.get('/api/games/poker/tournaments', requireAuth, async (_req, res) => {
  const items = await PokerTournament.find({}).sort({ createdAt: -1 }).limit(20);
  res.json({ ok: true, items });
});

app.post('/api/games/poker/join', requireAuth, async (req, res) => {
  try {
    const table = await joinPokerTournament(req.user, integerAmount(req.body?.buyInStars || 100), integerAmount(req.body?.maxPlayers || 4));
    res.json({ ok: true, table });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

const bot = getBot();
if (bot) {
  bot.start(async (ctx) => {
    const buttonUrl = env.appUrl;
    await ctx.reply('Venom Kazino açmaq üçün aşağıdakı düymədən istifadə et.', {
      reply_markup: {
        inline_keyboard: [[{ text: '🎰 Venom Kazino aç', web_app: { url: buttonUrl } }]]
      }
    });
  });

  bot.command('balance', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    await ctx.reply(`Balans: ${user?.balanceStars || 0} Stars`);
  });

}

app.post('/telegram/webhook/:secret', async (req, res) => {
  try {
    if (req.params.secret !== env.webhookSecret) return res.status(403).json({ ok: false });
    if (!bot) return res.status(400).json({ ok: false, error: 'Bot aktiv deyil' });

    if (req.body?.pre_checkout_query) {
      await bot.telegram.answerPreCheckoutQuery(req.body.pre_checkout_query.id, true).catch(() => null);
      return res.json({ ok: true });
    }

    const payment = req.body?.message?.successful_payment;
    if (payment) {
      const payload = payment.invoice_payload || '';
      const [kind, telegramIdRaw, amountRaw] = payload.split(':');
      if (kind === 'deposit') {
        const telegramId = Number(telegramIdRaw);
        const amountStars = Number(amountRaw || payment.total_amount || 0);
        const chargeId = payment.telegram_payment_charge_id;
        const exists = await Transaction.findOne({ source: 'telegram-stars', 'meta.chargeId': chargeId });
        if (!exists) {
          const user = await User.findOne({ telegramId });
          if (user) {
            await changeBalance(telegramId, amountStars, { type: 'deposit', source: 'telegram-stars', title: 'Telegram Stars deposit', meta: { chargeId, payload } });
            await User.findOneAndUpdate({ telegramId }, { $inc: { totalDepositedStars: amountStars } });
            await sendAdminMessage(`⭐ <b>Yeni Stars deposit</b>\nUser ID: <code>${telegramId}</code>\nTag: @${user.username || 'unknown'}\nMəbləğ: <b>${amountStars}</b> stars`);
          }
        }
      }
      return res.json({ ok: true });
    }

    await bot.handleUpdate(req.body, res);
    if (!res.headersSent) res.json({ ok: true });
  } catch (error) {
    console.error('webhook error', error);
    if (!res.headersSent) res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

await connectDb();
await getOrCreateJackpot();
await getOrCreateLotteryDraw();
await settleLotteryIfNeeded();
if (bot) await setupBotWebhook().catch((error) => console.error('webhook setup error', error.message));
await startUserbotWatcher().catch((error) => console.error('userbot disabled', error.message));
setInterval(() => settleLotteryIfNeeded().catch((error) => console.error('lottery settle error', error.message)), 60_000);

app.listen(env.port, () => {
  console.log(`Venom Kazino started on ${env.port}`);
});
