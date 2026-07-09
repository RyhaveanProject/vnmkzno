import 'dotenv/config';

const adminIds = (process.env.ADMIN_TELEGRAM_ID || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean)
  .map((v) => Number(v));

export const env = {
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
  mongoUri: process.env.MONGODB_URI || '',
  botToken: process.env.BOT_TOKEN || '',
  webhookSecret: process.env.WEBHOOK_SECRET || 'venom-secret',
  jwtSecret: process.env.JWT_SECRET || 'venom-local-secret',
  adminChatId: process.env.ADMIN_CHAT_ID || '',
  adminIds,
  adminUsername: process.env.ADMIN_USERNAME || '',
  botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
  channelLink: process.env.TELEGRAM_CHANNEL_LINK || '',
  minWithdrawStars: Number(process.env.MIN_WITHDRAW_STARS || 100),
  maxBetStars: Number(process.env.MAX_BET_STARS || 10000),
  houseEdgeBps: Number(process.env.HOUSE_EDGE_BPS || 200),
  apiId: Number(process.env.API_ID || 0),
  apiHash: process.env.API_HASH || '',
  userbotSession: process.env.USERBOT_SESSION || '',
  userbotPhone: process.env.USERBOT_PHONE || '',
  userbotEnabled: process.env.USERBOT_ENABLED === 'true',
  autoConvertGifts: process.env.AUTO_CONVERT_GIFTS === 'true'
};
