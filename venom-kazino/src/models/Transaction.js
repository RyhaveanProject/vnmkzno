import { mongoose } from '../lib/db.js';

const transactionSchema = new mongoose.Schema({
  telegramId: { type: Number, index: true },
  type: { type: String, index: true },
  amountStars: Number,
  balanceAfter: Number,
  source: String,
  title: String,
  meta: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});

export const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
