import { connectDb } from './lib/db.js';
import { startUserbotWatcher } from './services/userbotService.js';

await connectDb();
await startUserbotWatcher();
console.log('userbot-started');
