import { mongoose } from '../lib/db.js';

const blackjackRoundSchema = new mongoose.Schema({
  telegramId: { type: Number, index: true },
  betAmount: Number,
  playerCards: { type: Array, default: [] },
  dealerCards: { type: Array, default: [] },
  playerScore: Number,
  dealerScore: Number,
  status: { type: String, default: 'playing' },
  payout: { type: Number, default: 0 },
  seed: String,
  step: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const BlackjackRound = mongoose.models.BlackjackRound || mongoose.model('BlackjackRound', blackjackRoundSchema);
