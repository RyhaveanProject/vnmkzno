import { env } from '../config/env.js';
import { GiftDeposit } from '../models/GiftDeposit.js';
import { User } from '../models/User.js';
import { changeBalance } from './ledgerService.js';
import { sendAdminMessage } from './telegramService.js';

let clientRef = null;

export async function startUserbotWatcher() {
  if (!env.userbotEnabled || !env.apiId || !env.apiHash || !env.userbotSession) return null;
  const telegram = await import('telegram');
  const { NewMessage } = await import('telegram/events/index.js');
  const client = new telegram.TelegramClient(new telegram.sessions.StringSession(env.userbotSession), env.apiId, env.apiHash, { connectionRetries: 5 });
  await client.start({ phoneNumber: async () => env.userbotPhone || '', password: async () => '', phoneCode: async () => '', onError: console.error });
  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      const action = message?.action;
      if (!action || action.className !== 'MessageActionStarGift') return;
      const fromTelegramId = Number(action.fromId?.userId?.value || action.fromId?.userId || 0);
      const stars = Number(action.convertStars?.value || action.convertStars || action.gift?.stars?.value || action.gift?.stars || 0);
      const giftMessageId = String(message.id || '');
      const existing = await GiftDeposit.findOne({ giftMessageId });
      if (existing) return;
      await GiftDeposit.create({ giftMessageId, fromTelegramId, toTelegramId: Number(env.adminIds[0] || 0), stars, convertedStars: stars, status: 'credited', raw: { action } });
      const user = await User.findOne({ telegramId: fromTelegramId });
      if (user && stars > 0) {
        await changeBalance(user.telegramId, stars, { type: 'deposit', source: 'telegram-gift', title: 'Telegram gift deposit', meta: { giftMessageId } });
        await User.findOneAndUpdate({ telegramId: user.telegramId }, { $inc: { totalDepositedStars: stars } });
        await sendAdminMessage(`🎁 <b>Gift deposit</b>\nUser: @${user.username || 'unknown'}\nID: <code>${user.telegramId}</code>\nStars: <b>${stars}</b>\nMesaj ID: <code>${giftMessageId}</code>`);
      } else {
        await sendAdminMessage(`⚠️ Gift gəldi, amma user tapılmadı.\nFrom ID: <code>${fromTelegramId}</code>\nStars: <b>${stars}</b>\nMesaj ID: <code>${giftMessageId}</code>`);
      }
    } catch (error) {
      console.error('userbot gift error', error);
    }
  }, new NewMessage({}));
  clientRef = client;
  return client;
}

export function getUserbotClient() {
  return clientRef;
}
