import { mongoose } from '../lib/db.js';

const jackpotRoundSchema = new mongoose.Schema({
  roundNo: Number,
  poolStars: { type: Number, default: 0 },
  entries: { type: Array, default: [] },
  status: { type: String, default: 'open' },
  winnerTelegramId: Number,
  createdAt: { type: Date, default: Date.now },
  closedAt: Date
});

export const JackpotRound = mongoose.models.JackpotRound || mongoose.model('JackpotRound', jackpotRoundSchema);
