import { mongoose } from '../lib/db.js';

const pokerTournamentSchema = new mongoose.Schema({
  buyInStars: Number,
  maxPlayers: Number,
  prizePoolStars: { type: Number, default: 0 },
  players: { type: Array, default: [] },
  status: { type: String, default: 'waiting' },
  winnerTelegramId: Number,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const PokerTournament = mongoose.models.PokerTournament || mongoose.model('PokerTournament', pokerTournamentSchema);
