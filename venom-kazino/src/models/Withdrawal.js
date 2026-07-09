import { mongoose } from '../lib/db.js';

const withdrawalSchema = new mongoose.Schema({
  telegramId: { type: Number, index: true },
  username: String,
  grossStars: Number,
  feeStars: Number,
  netStars: Number,
  details: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

export const Withdrawal = mongoose.models.Withdrawal || mongoose.model('Withdrawal', withdrawalSchema);
