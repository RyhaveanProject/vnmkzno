const tg = window.Telegram?.WebApp;
const state = { token: localStorage.getItem('venom_token') || '', user: null, config: null };

const byId = (id) => document.getElementById(id);
const resultBox = byId('resultBox');

function show(message, data) {
  resultBox.textContent = data ? `${message}\n\n${JSON.stringify(data, null, 2)}` : message;
}

async function fetchJSON(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Xəta baş verdi');
  return data;
}

function renderProfile() {
  if (!state.user) return;
  byId('profileBox').innerHTML = `
    <div><strong>${state.user.firstName || ''} ${state.user.lastName || ''}</strong></div>
    <div>@${state.user.username || 'username yoxdur'}</div>
    <div>ID: ${state.user.telegramId}</div>
    <div>${state.user.isAdmin ? 'Admin' : 'İstifadəçi'}</div>
  `;
  byId('balanceValue').textContent = state.user.balanceStars || 0;
}

function renderTransactions(items = []) {
  const box = byId('txList');
  box.innerHTML = '';
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'tx-item';
    div.innerHTML = `
      <div>
        <strong>${item.title || item.type}</strong>
        <small>${new Date(item.createdAt).toLocaleString()}</small>
      </div>
      <div class="${item.amountStars >= 0 ? 'good' : 'bad'}">${item.amountStars >= 0 ? '+' : ''}${item.amountStars} ⭐</div>
    `;
    box.appendChild(div);
  });
}

async function loadSelf() {
  const [{ user }, { items }, giftInfo] = await Promise.all([
    fetchJSON('/api/me'),
    fetchJSON('/api/transactions'),
    fetchJSON('/api/gift-deposit/status').catch(() => ({ items: [], adminUsername: state.config?.adminUsername || '' }))
  ]);
  state.user = user;
  renderProfile();
  renderTransactions(items);
  byId('giftInfo').textContent = giftInfo.adminUsername
    ? `Gift deposit üçün admin hesabı: @${giftInfo.adminUsername}. Userbot açıqdırsa gift avtomatik balansınıza yazılır.`
    : 'Gift deposit istifadə etmək üçün .env faylında admin hesabını doldurun.';
}

async function login() {
  state.config = await fetchJSON('/api/config');
  if (tg?.initData) {
    tg.ready();
    tg.expand();
    const auth = await fetchJSON('/api/auth/telegram', { method: 'POST', body: JSON.stringify({ initData: tg.initData }) });
    state.token = auth.token;
    localStorage.setItem('venom_token', state.token);
    state.user = auth.user;
    return;
  }
  const auth = await fetchJSON('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ telegramId: 9990001, username: 'dev_render' }) });
  state.token = auth.token;
  localStorage.setItem('venom_token', state.token);
  state.user = auth.user;
}

function numberValue(id) { return Number(byId(id).value || 0); }

async function play(game) {
  const payloadMap = {
    coinflip: { betAmount: numberValue('coinflipBet'), choice: byId('coinflipChoice').value },
    dice: { betAmount: numberValue('diceBet'), target: numberValue('diceTarget'), rollUnder: byId('diceMode').value === 'under' },
    crash: { betAmount: numberValue('crashBet'), autoCashout: Number(byId('crashAuto').value || 2) },
    plinko: { betAmount: numberValue('plinkoBet'), rows: Number(byId('plinkoRows').value) },
    roulette: { betAmount: numberValue('rouletteBet'), betType: byId('rouletteType').value, betValue: byId('rouletteValue').value },
    slots: { betAmount: numberValue('slotsBet') }
  };
  const data = await fetchJSON(`/api/games/${game}/play`, { method: 'POST', body: JSON.stringify(payloadMap[game]) });
  show(`${game} nəticəsi`, data.result);
  await loadSelf();
}

async function deposit(amountStars) {
  const data = await fetchJSON('/api/payments/invoice', { method: 'POST', body: JSON.stringify({ amountStars }) });
  if (tg?.openInvoice) tg.openInvoice(data.link);
  else window.open(data.link, '_blank');
  show('Invoice yaradıldı', data);
}

async function withdraw() {
  const data = await fetchJSON('/api/withdrawals', {
    method: 'POST',
    body: JSON.stringify({ amountStars: numberValue('withdrawAmount'), details: byId('withdrawDetails').value })
  });
  show('Çıxarış sorğusu göndərildi', data);
  await loadSelf();
}

async function refreshBlackjack() {
  const data = await fetchJSON('/api/games/blackjack/current');
  byId('blackjackBox').textContent = JSON.stringify(data.round, null, 2);
}

async function refreshJackpot() {
  const data = await fetchJSON('/api/games/jackpot/status');
  byId('jackpotBox').textContent = JSON.stringify(data.round, null, 2);
}

async function refreshLottery() {
  const data = await fetchJSON('/api/games/lottery/status');
  byId('lotteryBox').textContent = JSON.stringify(data.draw, null, 2);
}

async function refreshPoker() {
  const data = await fetchJSON('/api/games/poker/tournaments');
  byId('pokerBox').textContent = JSON.stringify(data.items, null, 2);
}

async function initEvents() {
  document.querySelectorAll('[data-deposit]').forEach((btn) => btn.addEventListener('click', () => deposit(Number(btn.dataset.deposit))));
  document.querySelectorAll('.play-btn').forEach((btn) => btn.addEventListener('click', () => play(btn.dataset.game)));
  byId('refreshBtn').addEventListener('click', loadSelf);
  byId('withdrawBtn').addEventListener('click', withdraw);
  byId('blackjackStart').addEventListener('click', async () => {
    const data = await fetchJSON('/api/games/blackjack/start', { method: 'POST', body: JSON.stringify({ betAmount: numberValue('blackjackBet') }) });
    byId('blackjackBox').textContent = JSON.stringify(data.round, null, 2);
    await loadSelf();
  });
  byId('blackjackHit').addEventListener('click', async () => {
    const data = await fetchJSON('/api/games/blackjack/hit', { method: 'POST' });
    byId('blackjackBox').textContent = JSON.stringify(data.round, null, 2);
    await loadSelf();
  });
  byId('blackjackStand').addEventListener('click', async () => {
    const data = await fetchJSON('/api/games/blackjack/stand', { method: 'POST' });
    byId('blackjackBox').textContent = JSON.stringify(data.round, null, 2);
    await loadSelf();
  });
  byId('jackpotPlay').addEventListener('click', async () => {
    const data = await fetchJSON('/api/games/jackpot/play', { method: 'POST', body: JSON.stringify({ betAmount: numberValue('jackpotBet') }) });
    byId('jackpotBox').textContent = JSON.stringify(data, null, 2);
    await loadSelf();
  });
  byId('lotteryBuy').addEventListener('click', async () => {
    const numbers = byId('lotteryNumbers').value.split(',').map((v) => Number(v.trim()));
    const data = await fetchJSON('/api/games/lottery/buy', { method: 'POST', body: JSON.stringify({ betAmount: numberValue('lotteryBet'), numbers }) });
    byId('lotteryBox').textContent = JSON.stringify(data.draw, null, 2);
    await loadSelf();
  });
  byId('lotteryRefresh').addEventListener('click', refreshLottery);
  byId('pokerJoin').addEventListener('click', async () => {
    const data = await fetchJSON('/api/games/poker/join', { method: 'POST', body: JSON.stringify({ buyInStars: numberValue('pokerBuyIn'), maxPlayers: numberValue('pokerMaxPlayers') }) });
    byId('pokerBox').textContent = JSON.stringify(data.table, null, 2);
    await loadSelf();
  });
  byId('pokerRefresh').addEventListener('click', refreshPoker);
}

(async () => {
  try {
    await login();
    renderProfile();
    await initEvents();
    await loadSelf();
    await refreshBlackjack();
    await refreshJackpot();
    await refreshLottery();
    await refreshPoker();
    show('Venom Kazino hazırdır');
  } catch (error) {
    show(`Xəta: ${error.message}`);
  }
})();
