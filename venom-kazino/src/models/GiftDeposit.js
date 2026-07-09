import { mongoose } from '../lib/db.js';

const giftDepositSchema = new mongoose.Schema({
  giftMessageId: { type: String, unique: true, sparse: true },
  fromTelegramId: Number,
  toTelegramId: Number,
  stars: Number,
  convertedStars: Number,
  status: { type: String, default: 'detected' },
  raw: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});

export const GiftDeposit = mongoose.models.GiftDeposit || mongoose.model('GiftDeposit', giftDepositSchema);
