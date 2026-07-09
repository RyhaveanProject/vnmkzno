import { Telegraf } from 'telegraf';
import { env } from '../config/env.js';

let bot = null;

export function getBot() {
  if (!env.botToken) return null;
  if (!bot) bot = new Telegraf(env.botToken);
  return bot;
}

export async function setupBotWebhook() {
  const instance = getBot();
  if (!instance || !env.appUrl) return null;
  const webhookUrl = `${env.appUrl.replace(/\/$/, '')}/telegram/webhook/${env.webhookSecret}`;
  await instance.telegram.setWebhook(webhookUrl);
  return instance;
}

export async function sendAdminMessage(text) {
  const instance = getBot();
  if (!instance || !env.adminChatId) return;
  await instance.telegram.sendMessage(env.adminChatId, text, { parse_mode: 'HTML' }).catch(() => null);
}

export async function createInvoiceLink({ telegramId, amountStars, title, description, payload }) {
  const instance = getBot();
  if (!instance) throw new Error('BOT_TOKEN qurulmayıb');
  return instance.telegram.createInvoiceLink(title, description, payload, '', 'XTR', [{ label: `${amountStars} Stars`, amount: amountStars }], {
    photo_url: `${env.appUrl.replace(/\/$/, '')}/assets/logo.svg`,
    photo_width: 512,
    photo_height: 512,
    need_name: false,
    need_email: false,
    need_phone_number: false,
    need_shipping_address: false
  });
}
