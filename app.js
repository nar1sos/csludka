const SHARED_CLOUD_CONFIG = {
  binId: '6b0976891b390e1b559b54e3',
  apiKey: '$2a$10$uCgH40cdceLb9NZh7JtgyOcaiU1.fdgpinEa09JSQcj2V.ZYDPOfG'
};

const PACK_PRICE = 1000;
const INITIAL_BALANCE = 1500;
const MIN_START_BALANCE = 1;
const MAX_START_BALANCE = 1500;
const DUEL_WIN_BONUS = 400;
const MAX_CASE_OPEN_COUNT = 10;

const DEFAULT_CASE_CATEGORIES = [
  { id: 'cat_featured', name: 'Основные кейсы' },
  { id: 'cat_players', name: 'Кейсы игроков' }
];
const DUEL_BOT_NAMES = ['Бот 1', 'Бот 2'];

// === ЗВУКОВОЙ ДВИЖОК ===
const SoundFX = (() => {
  let ctx = null;
  let muted = localStorage.getItem('cs_muted') === '1';
  let volume = Number(localStorage.getItem('cs_volume') ?? 0.45);
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) volume = 0.45;

  function ensureCtx() {
    if (muted || volume <= 0) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone({ freq = 440, endFreq = null, type = 'triangle', duration = 0.12, gain = 0.25, delay = 0 }) {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    const peak = Math.max(0.0001, gain * volume);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  return {
    isMuted: () => muted,
    getVolume: () => volume,
    setMuted(val) {
      muted = Boolean(val);
      localStorage.setItem('cs_muted', muted ? '1' : '0');
      if (!muted) ensureCtx();
    },
    setVolume(pct) {
      const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
      volume = clamped / 100;
      localStorage.setItem('cs_volume', String(volume));
      if (volume > 0 && muted) { muted = false; localStorage.setItem('cs_muted', '0'); }
      ensureCtx();
    },
    click() { tone({ freq: 620, endFreq: 780, type: 'sine', duration: 0.045, gain: 0.12 }); },
    cardPass(stepIndex = 0) {
      const shift = Math.min(200, (stepIndex % 10) * 18);
      tone({ freq: 860 + shift, endFreq: 290, type: 'triangle', duration: 0.05, gain: 0.25 });
    },
    tick(pitchBoost = 0) { tone({ freq: 520 + pitchBoost * 18, endFreq: 340, type: 'triangle', duration: 0.04, gain: 0.14 }); },
    win(isSpecial = false) {
      const notes = isSpecial ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => tone({ freq: f, type: 'triangle', duration: 0.22, gain: 0.24, delay: i * 0.075 }));
    },
    sell() {
      tone({ freq: 880, endFreq: 1174.66, type: 'sine', duration: 0.09, gain: 0.18, delay: 0 });
      tone({ freq: 1174.66, endFreq: 1318.5, type: 'sine', duration: 0.12, gain: 0.18, delay: 0.07 });
    },
    packOpen() { [330, 440, 554.37, 659.25].forEach((f, i) => tone({ freq: f, type: 'sawtooth', duration: 0.11, gain: 0.1, delay: i * 0.06 })); },
    upgradeSuccess() { [440, 554.37, 659.25, 880].forEach((f, i) => tone({ freq: f, type: 'triangle', duration: 0.2, gain: 0.22, delay: i * 0.08 })); },
    upgradeFail() { tone({ freq: 260, endFreq: 130, type: 'sawtooth', duration: 0.28, gain: 0.2 }); },
    trade() { tone({ freq: 587.33, type: 'triangle', duration: 0.12, gain: 0.2 }); tone({ freq: 880, type: 'triangle', duration: 0.18, gain: 0.2, delay: 0.1 }); }
  };
})();

function updateSoundUI() {
  const btn = document.getElementById('sound-toggle-btn');
  if (btn) btn.textContent = SoundFX.isMuted() ? '🔇' : '🔊';
  const slider = document.getElementById('sound-volume-slider');
  const label = document.getElementById('sound-volume-label');
  const pct = Math.round(SoundFX.getVolume() * 100);
  if (slider) slider.value = String(pct);
  if (label) label.textContent = pct + '%';
}

function toggleSoundMute() { SoundFX.setMuted(!SoundFX.isMuted()); updateSoundUI(); if (!SoundFX.isMuted()) SoundFX.click(); }
function setSoundVolume(val) { SoundFX.setVolume(val); updateSoundUI(); SoundFX.tick(4); }

// === СОСТОЯНИЕ ===
const rawSavedBalance = localStorage.getItem('cs_balance');
const isBrandNewPlayer = rawSavedBalance === null;

function getEffectiveCloudConfig() {
  const saved = JSON.parse(localStorage.getItem('cs_cloud') || 'null');
  return {
    binId: (saved && saved.binId) || SHARED_CLOUD_CONFIG.binId || '',
    apiKey: (saved && saved.apiKey) || SHARED_CLOUD_CONFIG.apiKey || ''
  };
}

let state = {
  nickname: localStorage.getItem('cs_nick') || 'Player_' + Math.floor(100 + Math.random() * 900),
  balance: isBrandNewPlayer ? INITIAL_BALANCE : Number(rawSavedBalance),
  inventory: JSON.parse(localStorage.getItem('cs_inventory') || '[]'),
  stats: JSON.parse(localStorage.getItem('cs_stats') || '{"opened":0,"upgrades":0}'),
  rarities: localStorage.getItem('cs_rarities') ? JSON.parse(localStorage.getItem('cs_rarities')) : JSON.parse(JSON.stringify(DEFAULT_RARITIES)),
  wears: localStorage.getItem('cs_wears') ? JSON.parse(localStorage.getItem('cs_wears')) : JSON.parse(JSON.stringify(DEFAULT_WEARS)),
  cards: localStorage.getItem('cs_cards') ? JSON.parse(localStorage.getItem('cs_cards')) : JSON.parse(JSON.stringify(DEFAULT_CARDS)),
  cases: localStorage.getItem('cs_cases') ? JSON.parse(localStorage.getItem('cs_cases')) : JSON.parse(JSON.stringify(DEFAULT_CASES)),
  caseCategories: localStorage.getItem('cs_case_categories') ? JSON.parse(localStorage.getItem('cs_case_categories')) : JSON.parse(JSON.stringify(DEFAULT_CASE_CATEGORIES)),
  cloud: getEffectiveCloudConfig(),
  statTrakMultiplier: Number(localStorage.getItem('cs_st_mult') ?? 1.8),
  statTrakChance: Number(localStorage.getItem('cs_st_chance') ?? 0.14),
  souvenirMultiplier: Number(localStorage.getItem('cs_souv_mult') ?? 3.5),
  souvenirChance: Number(localStorage.getItem('cs_souv_chance') ?? 0.08)
};

if (!Number.isFinite(state.balance) || state.balance < 0) state.balance = INITIAL_BALANCE;
if (!Array.isArray(state.inventory)) state.inventory = [];

let currentCaseId = null;
let caseOpenCount = 1;
let isSpinning = false;
let isUpgrading = false;
let isOpeningPack = false;
let isDuelRunning = false;
let duelBotCount = 1;
let duelCompetitors = [];
let rouletteSoundRafId = null;
let lastWonItems = [];
let editingCardId = null;
let editingCaseId = null;
let hasLocalCatalogEdits = localStorage.getItem('cs_dirty_catalog') === '1';
let cloudSyncInProgress = false;

let upgSelectedSourceUid = null;
let upgSelectedTargetId = null;
let upgSelectedTargetEdition = 'normal';
let upgSelectedTargetWear = 'FN';
let currentWheelAngle = 0;

let tradeMyOfferUids = [];
let tradeBotOffer = [];
let craftSelectedUids = [];

let rotX = 0, rotY = 0, isDragging3D = false, dragStartX = 0, dragStartY = 0;
let rarityMapCache = new Map();
let cardMapCache = new Map();
let wearMapCache = new Map();

function rebuildLookupCaches() {
  rarityMapCache = new Map(state.rarities.map(r => [r.id, r]));
  cardMapCache = new Map(state.cards.map(c => [c.id, c]));
  wearMapCache = new Map(state.wears.map(w => [w.code, w]));
}

function getRarityObj(id) { return rarityMapCache.get(id) || state.rarities[state.rarities.length - 1] || state.rarities[0]; }
function getCardById(id) { return cardMapCache.get(id); }
function getWearObj(code) { return wearMapCache.get(code) || state.wears[0] || { code: 'FN', label: 'Factory New', priceMult: 1, weight: 100 }; }

function getRarityGradientColors(rar) {
  if (!rar) return ['#4b69ff', '#14161c'];
  if (Array.isArray(rar.gradientColors) && rar.gradientColors.length > 0) return rar.gradientColors.slice(0, 5);
  return [rar.color || '#4b69ff', rar.bg || '#14161c'];
}

function buildRarityGradientCSS(rar) {
  const colors = getRarityGradientColors(rar);
  if (colors.length === 1) return `linear-gradient(155deg, ${colors[0]} 0%, ${colors[0]} 100%)`;
  const stops = colors.map((col, idx) => `${col} ${Math.round((idx / (colors.length - 1)) * 100)}%`);
  return `linear-gradient(155deg, ${stops.join(', ')})`;
}

function sanitizeChanceInput(rawVal) {
  const num = Number(String(rawVal ?? '').replace(',', '.').trim());
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(100, num);
}

function recalculateRarityHierarchy() {
  if (!Array.isArray(state.rarities) || state.rarities.length === 0) {
    state.rarities = JSON.parse(JSON.stringify(DEFAULT_RARITIES));
  }
  const total = state.rarities.length;
  state.rarities.forEach((r, idx) => {
    r.weight = sanitizeChanceInput(r.weight);
    r.packWeight = r.packWeight !== undefined ? sanitizeChanceInput(r.packWeight) : r.weight;
    r.order = total - idx;
    const gColors = getRarityGradientColors(r);
    r.color = gColors[0];
    r.bg = gColors[gColors.length - 1];
  });
  if (state.rarities.reduce((s, r) => s + r.weight, 0) <= 0) {
    state.rarities[state.rarities.length - 1].weight = 100;
  }
  if (state.rarities.reduce((s, r) => s + r.packWeight, 0) <= 0) {
    state.rarities[state.rarities.length - 1].packWeight = 100;
  }
  rebuildLookupCaches();
}

function normalizeCaseCategoriesAndCases() {
  if (!Array.isArray(state.caseCategories) || state.caseCategories.length === 0) {
    state.caseCategories = JSON.parse(JSON.stringify(DEFAULT_CASE_CATEGORIES));
  }
  const validIds = new Set(state.caseCategories.map(c => c.id));
  const fallback = state.caseCategories[0].id;
  if (!Array.isArray(state.cases)) state.cases = [];
  state.cases.forEach(c => { if (!c.categoryId || !validIds.has(c.categoryId)) c.categoryId = fallback; });
}

recalculateRarityHierarchy();
normalizeCaseCategoriesAndCases();

function saveState(markCatalogDirty = false) {
  recalculateRarityHierarchy();
  normalizeCaseCategoriesAndCases();
  if (markCatalogDirty) {
    hasLocalCatalogEdits = true;
    localStorage.setItem('cs_dirty_catalog', '1');
  }
  localStorage.setItem('cs_nick', state.nickname);
  localStorage.setItem('cs_balance', String(state.balance));
  localStorage.setItem('cs_inventory', JSON.stringify(state.inventory));
  localStorage.setItem('cs_stats', JSON.stringify(state.stats));
  localStorage.setItem('cs_rarities', JSON.stringify(state.rarities));
  localStorage.setItem('cs_wears', JSON.stringify(state.wears));
  localStorage.setItem('cs_cards', JSON.stringify(state.cards));
  localStorage.setItem('cs_cases', JSON.stringify(state.cases));
  localStorage.setItem('cs_case_categories', JSON.stringify(state.caseCategories));
  localStorage.setItem('cs_st_mult', String(state.statTrakMultiplier));
  localStorage.setItem('cs_st_chance', String(state.statTrakChance));
  localStorage.setItem('cs_souv_mult', String(state.souvenirMultiplier));
  localStorage.setItem('cs_souv_chance', String(state.souvenirChance));
  updateTopBar();
  updateCloudSyncBadge();
}

function updateCloudSyncBadge() {
  const btn = document.getElementById('push-cloud-catalog-btn');
  if (btn) btn.textContent = hasLocalCatalogEdits ? '☁ Залить в облако (*)' : '☁ Залить всё в облако';
}

function updateTopBar() {
  document.getElementById('user-balance').textContent = Math.floor(state.balance);
  document.getElementById('nickname-input').value = state.nickname;
}

function saveNickname() {
  const val = document.getElementById('nickname-input').value.trim();
  if (val) {
    state.nickname = val;
    saveState(false);
    if (document.getElementById('tab-duels').classList.contains('active') && !isDuelRunning) renderDuelLobby();
  }
}

function switchTab(tabName) {
  SoundFX.click();
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${tabName}"]`).classList.add('active');

  if (tabName === 'cases') renderCasesList();
  if (tabName === 'upgrade') renderUpgradeUI();
  if (tabName === 'duels') renderDuelLobby();
  if (tabName === 'trade') {
    if (document.getElementById('trade-arena').classList.contains('hidden')) startBotTrade();
    else renderTradeUI();
  }
  if (tabName === 'collection') renderCollection();
  if (tabName === 'craft') renderCraftUI();
  if (tabName === 'admin') renderAdminUI();
}

// === ИЗНОС, STATTRAK И СУВЕНИР ===
function rollWearCode() {
  const pool = state.wears || DEFAULT_WEARS;
  const total = pool.reduce((s, w) => s + (Number(w.weight) || 0), 0);
  if (total <= 0) return 'FT';
  let r = Math.random() * total;
  for (const w of pool) {
    const wt = Number(w.weight) || 0;
    if (r < wt) return w.code;
    r -= wt;
  }
  return pool[pool.length - 1].code;
}

function rollEditionForSkin(card) {
  if (!card) return 'normal';
  const canSouv = Boolean(card.hasSouvenir);
  const canSt = Boolean(card.hasStatTrak);

  if (canSouv && canSt) {
    const roll = Math.random();
    if (roll < state.souvenirChance) return 'souvenir';
    if (roll < state.souvenirChance + state.statTrakChance) return 'stattrak';
    return 'normal';
  }
  if (canSouv && Math.random() < state.souvenirChance) return 'souvenir';
  if (canSt && Math.random() < state.statTrakChance) return 'stattrak';
  return 'normal';
}

function getSkinPrice(card, edition = 'normal', wearCode = 'FN') {
  if (!card) return 0;
  const base = Number(card.price || 0);
  const wearMult = Number(getWearObj(wearCode)?.priceMult ?? 1);
  let edMult = 1;
  if (edition === 'stattrak') edMult = Number(state.statTrakMultiplier) || 1.8;
  if (edition === 'souvenir') edMult = Number(state.souvenirMultiplier) || 3.5;
  return Math.max(1, Math.round(base * wearMult * edMult));
}

function formatSkinTitle(card) {
  const w = (card.weapon || '').trim();
  const n = (card.name || '').trim();
  if (w && n) return `${w} | ${n}`;
  return n || w || 'Skin';
}

function sortItems(items, sortMode) {
  return [...items].sort((a, b) => {
    const cardA = a.card || a;
    const cardB = b.card || b;
    const priceA = getSkinPrice(cardA, a.edition || 'normal', a.wear || 'FN');
    const priceB = getSkinPrice(cardB, b.edition || 'normal', b.wear || 'FN');
    const rarA = Number(getRarityObj(cardA.rarity)?.order || 0);
    const rarB = Number(getRarityObj(cardB.rarity)?.order || 0);

    if (sortMode === 'price-desc') return priceB - priceA;
    if (sortMode === 'price-asc') return priceA - priceB;
    if (sortMode === 'rarity-desc') return rarB - rarA || priceB - priceA;
    if (sortMode === 'rarity-asc') return rarA - rarB || priceA - priceB;
    return 0;
  });
}

function createCardHTML(card, edition = 'normal', wearCode = 'FN', extraClass = '', clickAttr = '', actionBtnHTML = '', wrapAttr = '') {
  const rar = getRarityObj(card.rarity);
  const price = getSkinPrice(card, edition, wearCode);
  const effectClass = rar.effect && rar.effect !== 'none' ? `effect-${rar.effect}` : '';
  const edClass = edition === 'souvenir' ? 'is-souvenir' : edition === 'stattrak' ? 'is-stattrak' : '';
  const gradCSS = buildRarityGradientCSS(rar);

  const badges = [];
  if (edition === 'stattrak') badges.push('<span class="st-pill">ST™</span>');
  if (edition === 'souvenir') badges.push('<span class="souv-pill">★ SOUVENIR</span>');

  return `
    <div class="card-wrap" ${wrapAttr}>
      <div class="gd-card ${edClass} ${effectClass} ${extraClass}"
           style="--rar-color: ${rar.color}; --rar-bg: ${rar.bg}; --rar-gradient: ${gradCSS};"
           ${clickAttr}>
        <div class="card-top-row">
          <span class="wear-tag">${wearCode}</span>
          <span class="card-rarity-badge">${rar.name}</span>
        </div>
        <img class="card-thumb" loading="lazy" decoding="async" draggable="false" src="${card.img}" alt="${formatSkinTitle(card)}" onerror="this.src='https://placehold.co/320x200/181a20/ffffff?text=CS+SKIN'">
        <div class="skin-weapon">${card.weapon || 'Weapon'}</div>
        <div class="card-title">${card.name}</div>
        <div class="card-bottom-area">
          <span class="card-price">${price} ₽</span>
          <div class="edition-badges">${badges.join('')}</div>
        </div>
      </div>
      ${actionBtnHTML}
    </div>
  `;
}

function createUpgradeSquareTileHTML(card, edition = 'normal', wearCode = 'FN', isSelected = false, clickAttr = '', extraAttr = '') {
  const rar = getRarityObj(card.rarity);
  const price = getSkinPrice(card, edition, wearCode);
  const gradCSS = buildRarityGradientCSS(rar);
  const selClass = isSelected ? 'selected' : '';
  const edTag = edition === 'souvenir' ? 'SOUV ' : edition === 'stattrak' ? 'ST ' : '';

  return `
    <div class="upg-square-tile ${selClass}"
         style="--rar-color: ${rar.color}; --rar-bg: ${rar.bg}; --rar-gradient: ${gradCSS};"
         ${extraAttr}
         ${clickAttr}>
      <div class="upg-tile-top">
        <span class="upg-tile-price">${price} ₽</span>
        <span class="wear-tag" style="font-size:9px;padding:1px 4px;">${edTag}${wearCode}</span>
      </div>
      <img class="upg-tile-img" loading="lazy" decoding="async" draggable="false" src="${card.img}" alt="${formatSkinTitle(card)}" onerror="this.src='https://placehold.co/320x200/181a20/ffffff?text=CS'">
      <div class="upg-tile-name">${formatSkinTitle(card)}</div>
      <div class="upg-plus-overlay"><span class="upg-plus-box">+</span></div>
    </div>
  `;
}

function appendEmptyUpgradeSlots(container, itemCount, minRows = 3) {
  if (!container) return;
  const width = container.getBoundingClientRect().width;
  const cols = width ? Math.max(2, Math.floor((width + 10) / 122)) : 4;
  const totalSlots = Math.max(minRows, Math.ceil(itemCount / cols)) * cols;
  const emptyCount = Math.max(0, totalSlots - itemCount);
  for (let i = 0; i < emptyCount; i++) {
    const d = document.createElement('div');
    d.className = 'upg-empty-tile';
    container.appendChild(d);
  }
}

function giveSkinToPlayer(card, edition = 'normal', wearCode = 'FN') {
  const item = {
    uid: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    cardId: card.id,
    edition,
    wear: wearCode
  };
  state.inventory.push(item);
  saveState(false);
  return item;
}

// === ОБЛАКО JSONBIN.IO ===
function buildCloudHeaders() {
  const cfg = getEffectiveCloudConfig();
  const h = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) h['X-Master-Key'] = cfg.apiKey;
  return h;
}

async function readCloudRecord() {
  const cfg = getEffectiveCloudConfig();
  if (!cfg.binId) throw new Error('Не указан Bin ID');
  const headers = {};
  if (cfg.apiKey) headers['X-Master-Key'] = cfg.apiKey;
  const res = await fetch(`https://api.jsonbin.io/v3/b/${cfg.binId}/latest`, { method: 'GET', headers });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  return json && typeof json.record === 'object' && json.record !== null ? json.record : {};
}

async function writeCloudRecord(recordObj) {
  const cfg = getEffectiveCloudConfig();
  if (!cfg.binId) throw new Error('Не указан Bin ID');
  const res = await fetch(`https://api.jsonbin.io/v3/b/${cfg.binId}`, {
    method: 'PUT',
    headers: buildCloudHeaders(),
    body: JSON.stringify(recordObj)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

async function pushCatalogToCloud() {
  const cfg = getEffectiveCloudConfig();
  if (!cfg.binId || !cfg.apiKey) {
    setAdminBalanceStatus('Укажи Bin ID и X-Master-Key в блоке JSONBin.io', true);
    return;
  }

  const btn = document.getElementById('push-cloud-catalog-btn');
  if (btn) btn.disabled = true;
  cloudSyncInProgress = true;

  try {
    let current = {};
    try { current = await readCloudRecord(); } catch (_) { current = {}; }

    current.csCatalog = {
      cards: state.cards,
      rarities: state.rarities,
      wears: state.wears,
      cases: state.cases,
      caseCategories: state.caseCategories,
      statTrakMultiplier: state.statTrakMultiplier,
      statTrakChance: state.statTrakChance,
      souvenirMultiplier: state.souvenirMultiplier,
      souvenirChance: state.souvenirChance,
      updatedAt: Date.now()
    };

    await writeCloudRecord(current);
    hasLocalCatalogEdits = false;
    localStorage.setItem('cs_dirty_catalog', '0');
    updateCloudSyncBadge();
    SoundFX.sell();
    setAdminBalanceStatus('Каталог CS сохранён в облако JSONBin.io');
  } catch (err) {
    console.error(err);
    setAdminBalanceStatus('Ошибка загрузки в облако: проверь Bin ID и ключ', true);
  } finally {
    cloudSyncInProgress = false;
    if (btn) btn.disabled = false;
  }
}

async function syncCatalogFromCloud(forceOverwriteLocal = false) {
  const cfg = getEffectiveCloudConfig();
  if (!cfg.binId || cloudSyncInProgress) return;
  if (hasLocalCatalogEdits && !forceOverwriteLocal) return;

  cloudSyncInProgress = true;
  try {
    const record = await readCloudRecord();
    const cat = record && record.csCatalog;
    if (!cat || typeof cat !== 'object') return;

    if (Array.isArray(cat.cards) && cat.cards.length > 0) state.cards = cat.cards;
    if (Array.isArray(cat.rarities) && cat.rarities.length > 0) state.rarities = cat.rarities;
    if (Array.isArray(cat.wears) && cat.wears.length > 0) state.wears = cat.wears;
    if (Array.isArray(cat.caseCategories) && cat.caseCategories.length > 0) state.caseCategories = cat.caseCategories;
    if (Array.isArray(cat.cases) && cat.cases.length > 0) state.cases = cat.cases;

    if (typeof cat.statTrakMultiplier === 'number') state.statTrakMultiplier = cat.statTrakMultiplier;
    if (typeof cat.statTrakChance === 'number') state.statTrakChance = cat.statTrakChance;
    if (typeof cat.souvenirMultiplier === 'number') state.souvenirMultiplier = cat.souvenirMultiplier;
    if (typeof cat.souvenirChance === 'number') state.souvenirChance = cat.souvenirChance;

    recalculateRarityHierarchy();
    normalizeCaseCategoriesAndCases();

    if (forceOverwriteLocal) {
      hasLocalCatalogEdits = false;
      localStorage.setItem('cs_dirty_catalog', '0');
    }

    saveState(false);
    renderCasesList();
    if (!document.getElementById('admin-panel-content')?.classList.contains('hidden')) {
      renderAdminUI();
    }
    if (forceOverwriteLocal) {
      setAdminBalanceStatus('Каталог загружен из облака JSONBin.io');
    }
  } catch (err) {
    console.error(err);
    if (forceOverwriteLocal) {
      setAdminBalanceStatus('Не удалось загрузить данные из JSONBin.io', true);
    }
  } finally {
    cloudSyncInProgress = false;
  }
}

// === КЕЙСЫ И МУЛЬТИ-РУЛЕТКА x1..x10 ===
function renderCasesList() {
  normalizeCaseCategoriesAndCases();
  const sortMode = document.getElementById('cases-sort').value;
  const sortFn = (a, b) => sortMode === 'price-asc' ? a.price - b.price : b.price - a.price;

  document.getElementById('cases-list').innerHTML = state.caseCategories.map(cat => {
    const catCases = state.cases.filter(c => c.categoryId === cat.id).sort(sortFn);
    if (catCases.length === 0) return '';
    return `
      <div class="case-category-section">
        <div class="case-category-header"><h3 class="case-category-title">${cat.name}</h3></div>
        <div class="cases-grid">
          ${catCases.map(c => `
            <div class="case-item" onclick="openCaseView('${c.id}')">
              <img src="${c.img}" alt="${c.name}" onerror="this.src='https://placehold.co/320x180/181a20/ffffff?text=CASE'">
              <h3>${c.name}</h3>
              <div class="case-price-tag">${c.price} ₽</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('') || '<div class="hint-text">Кейсов пока нет</div>';
}

function setCaseOpenCount(count) {
  if (isSpinning) return;
  SoundFX.click();
  caseOpenCount = Math.max(1, Math.min(MAX_CASE_OPEN_COUNT, Number(count) || 1));
  document.querySelectorAll('#case-count-selector .count-chip').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.count) === caseOpenCount);
  });
  updateCaseOpenCostLabel();
  const c = state.cases.find(x => x.id === currentCaseId);
  if (c) buildMultiRouletteTracks(c);
}

function updateCaseOpenCostLabel() {
  const c = state.cases.find(x => x.id === currentCaseId);
  if (!c) return;
  document.getElementById('active-case-count-label').textContent = `x${caseOpenCount}`;
  document.getElementById('active-case-total-price').textContent = c.price * caseOpenCount;
}

function applyRouletteGridLayout(container, count) {
  if (!container) return;
  container.classList.toggle('is-multi', count > 1);
  container.classList.toggle('cols-3', count === 3 || count === 5 || count === 6);
  container.classList.toggle('cols-4', count === 7 || count === 8);
  container.classList.toggle('cols-5', count >= 9);
}

function buildMultiRouletteTracks(caseObj, winners = null) {
  const container = document.getElementById('roulettes-multi-container');
  if (!container || !caseObj) return;
  applyRouletteGridLayout(container, caseOpenCount);

  const pool = caseObj.cardIds.map(getCardById).filter(Boolean);
  if (pool.length === 0) { container.innerHTML = ''; return; }

  let html = '';
  for (let row = 0; row < caseOpenCount; row++) {
    const win = winners && winners[row] ? winners[row] : null;
    let cardsHtml = '';
    for (let i = 0; i < 45; i++) {
      if (i === 38 && win) {
        cardsHtml += createCardHTML(win.card, win.edition, win.wear);
      } else {
        const rnd = pool[Math.floor(Math.random() * pool.length)];
        cardsHtml += createCardHTML(rnd, rollEditionForSkin(rnd), rollWearCode());
      }
    }
    html += `
      <div class="roulette-wrapper">
        <div class="roulette-pointer"></div>
        <div id="roulette-track-${row}" class="roulette-track">${cardsHtml}</div>
      </div>
    `;
  }
  container.innerHTML = html;
  for (let row = 0; row < caseOpenCount; row++) {
    const tr = document.getElementById(`roulette-track-${row}`);
    if (tr) { tr.style.transition = 'none'; tr.style.transform = 'translateX(0px)'; }
  }
}

function openCaseView(caseId) {
  SoundFX.click();
  currentCaseId = caseId;
  const c = state.cases.find(x => x.id === caseId);
  if (!c) { closeCaseView(); return; }
  document.getElementById('cases-grid-view').classList.add('hidden');
  document.getElementById('case-open-view').classList.remove('hidden');
  document.getElementById('active-case-title').textContent = c.name;
  setCaseOpenCount(caseOpenCount);
  renderCaseContents();
}

function closeCaseView() {
  if (isSpinning) return;
  SoundFX.click();
  currentCaseId = null;
  document.getElementById('case-open-view').classList.add('hidden');
  document.getElementById('cases-grid-view').classList.remove('hidden');
}

function renderCaseContents() {
  const c = state.cases.find(x => x.id === currentCaseId);
  if (!c) return;
  const sortMode = document.getElementById('case-contents-sort').value;
  const cards = c.cardIds.map(getCardById).filter(Boolean);
  document.getElementById('case-contents-grid').innerHTML = sortItems(cards, sortMode).map(card => createCardHTML(card, 'normal', 'FN')).join('');
}

function rollWeightedSkin(poolCards, mode = 'case') {
  let totalW = 0;
  const weighted = poolCards.map(card => {
    const rar = getRarityObj(card.rarity);
    const w = sanitizeChanceInput(mode === 'pack' ? (rar?.packWeight ?? rar?.weight) : rar?.weight);
    totalW += w;
    return { card, w };
  });
  if (totalW <= 0) return poolCards[Math.floor(Math.random() * poolCards.length)];
  let r = Math.random() * totalW;
  for (const item of weighted) {
    if (r < item.w) return item.card;
    r -= item.w;
  }
  return poolCards[poolCards.length - 1];
}

function getRouletteStepWidth() {
  const firstCard = document.querySelector('.roulette-track .card-wrap');
  const trackEl = firstCard ? firstCard.parentElement : null;
  const cardW = firstCard ? firstCard.getBoundingClientRect().width : 185;
  let gapW = 12;
  if (trackEl) {
    const g = parseFloat(getComputedStyle(trackEl).columnGap || getComputedStyle(trackEl).gap);
    if (Number.isFinite(g) && g >= 0) gapW = g;
  }
  return { cardW, stepW: cardW + gapW };
}

function setCaseControlsDisabled(disabled) {
  document.getElementById('spin-case-btn').disabled = disabled;
  document.getElementById('fast-spin-btn').disabled = disabled;
  document.querySelectorAll('#case-count-selector .count-chip').forEach(btn => { btn.disabled = disabled; });
}

function stopRouletteCardSoundTracker() {
  if (rouletteSoundRafId !== null) { cancelAnimationFrame(rouletteSoundRafId); rouletteSoundRafId = null; }
}

function trackRouletteCardsPassingPointer(durationSec, isActiveCheck = () => isSpinning, trackId = 'roulette-track-0') {
  stopRouletteCardSoundTracker();
  const track = document.getElementById(trackId);
  const pointer = track?.parentElement?.querySelector('.roulette-pointer');
  if (!track || !pointer) return;
  const cards = Array.from(track.querySelectorAll('.card-wrap'));
  if (!cards.length) return;

  const startTime = performance.now();
  const durationMs = durationSec * 1000;
  let lastIdx = -1;

  function check() {
    const px = pointer.getBoundingClientRect().left;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (rect.left + rect.width * 0.5 <= px && i > lastIdx) {
        lastIdx = i;
        SoundFX.cardPass(i);
      }
    }
  }

  function frame(now) {
    check();
    if (now - startTime < durationMs + 60 && isActiveCheck()) rouletteSoundRafId = requestAnimationFrame(frame);
    else { check(); stopRouletteCardSoundTracker(); }
  }
  rouletteSoundRafId = requestAnimationFrame(frame);
}

function spinCurrentCase(fast = false) {
  if (isSpinning) return;
  const c = state.cases.find(x => x.id === currentCaseId);
  if (!c) return;
  const count = Math.min(MAX_CASE_OPEN_COUNT, caseOpenCount);
  const totalCost = c.price * count;
  if (state.balance < totalCost) return;

  const pool = c.cardIds.map(getCardById).filter(Boolean);
  if (!pool.length) return;

  state.balance -= totalCost;
  state.stats.opened += count;
  saveState(false);

  const winners = [];
  for (let i = 0; i < count; i++) {
    const card = rollWeightedSkin(pool, 'case');
    winners.push({ card, edition: rollEditionForSkin(card), wear: rollWearCode() });
  }

  buildMultiRouletteTracks(c, winners);
  isSpinning = true;
  setCaseControlsDisabled(true);

  const { cardW, stepW } = getRouletteStepWidth();
  const durationSec = fast ? 0.85 : 4.2;

  setTimeout(() => {
    for (let row = 0; row < count; row++) {
      const track = document.getElementById(`roulette-track-${row}`);
      if (!track) continue;
      const jitter = Math.random() * Math.min(24, cardW * 0.16) - Math.min(12, cardW * 0.08);
      const offset = 38 * stepW + jitter + cardW / 2;
      track.style.transition = `transform ${durationSec}s cubic-bezier(0.12, 0.88, 0.22, 1)`;
      track.style.transform = `translateX(-${offset}px)`;
    }
    trackRouletteCardsPassingPointer(durationSec, () => isSpinning, 'roulette-track-0');
  }, 30);

  setTimeout(() => {
    stopRouletteCardSoundTracker();
    isSpinning = false;
    setCaseControlsDisabled(false);
    const addedEntries = winners.map(w => {
      const added = giveSkinToPlayer(w.card, w.edition, w.wear);
      return { ...w, uid: added.uid };
    });
    SoundFX.win(addedEntries.some(e => e.edition !== 'normal'));
    showWinModal(addedEntries);
  }, fast ? 950 : 4350);
}

// === ПАКИ ===
function buyPack() {
  if (isOpeningPack || state.balance < PACK_PRICE) return;
  isOpeningPack = true;
  SoundFX.packOpen();
  document.getElementById('buy-pack-btn').disabled = true;
  state.balance -= PACK_PRICE;
  state.stats.opened += 1;
  saveState(false);

  const revealArea = document.getElementById('pack-reveal-area');
  revealArea.innerHTML = '';

  const pulled = [];
  for (let i = 0; i < 5; i++) {
    const card = rollWeightedSkin(state.cards, 'pack');
    const edition = rollEditionForSkin(card);
    const wear = rollWearCode();
    giveSkinToPlayer(card, edition, wear);
    pulled.push({ card, edition, wear });
  }

  pulled.forEach((entry, idx) => {
    setTimeout(() => {
      SoundFX.tick(idx + 2);
      const d = document.createElement('div');
      d.innerHTML = createCardHTML(entry.card, entry.edition, entry.wear);
      if (d.firstElementChild) {
        d.firstElementChild.classList.add('pack-reveal-anim');
        revealArea.appendChild(d.firstElementChild);
      }
      if (idx === pulled.length - 1) {
        SoundFX.win(pulled.some(p => p.edition !== 'normal'));
        isOpeningPack = false;
        document.getElementById('buy-pack-btn').disabled = false;
      }
    }, idx * 140);
  });
}

// === АПГРЕЙД ===
function calculateUpgradeChance(srcPrice, tgtPrice) {
  if (srcPrice <= 0 || tgtPrice <= 0) return 0;
  return Math.min(85, Math.max(0, (srcPrice / tgtPrice) * 85));
}

function formatUpgradeChanceText(chance) {
  if (!Number.isFinite(chance) || chance <= 0) return '0%';
  if (chance < 0.01) return chance.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + '%';
  if (chance < 1) return chance.toFixed(2) + '%';
  return chance.toFixed(2).replace(/\.00$/, '') + '%';
}

function renderUpgradeUI() {
  renderUpgradeMyInventory();
  renderUpgradeTargets();
  updateUpgradeSlotsAndChance();
}

function renderUpgradeMyInventory() {
  const sortMode = document.getElementById('upg-inv-sort').value;
  const mapped = state.inventory.map(item => ({ ...item, card: getCardById(item.cardId) })).filter(x => x.card);
  const sorted = sortItems(mapped, sortMode);

  const grid = document.getElementById('upgrade-my-cards');
  grid.innerHTML = '';
  sorted.forEach(item => {
    const d = document.createElement('div');
    d.innerHTML = createUpgradeSquareTileHTML(
      item.card,
      item.edition || 'normal',
      item.wear || 'FN',
      item.uid === upgSelectedSourceUid,
      `onclick="selectUpgradeSource('${item.uid}')"`,
      `data-upg-uid="${item.uid}"`
    );
    if (d.firstElementChild) grid.appendChild(d.firstElementChild);
  });
  appendEmptyUpgradeSlots(grid, sorted.length, 3);
}

function renderUpgradeTargets() {
  const sortMode = document.getElementById('upg-target-sort')?.value || 'price-asc';
  const searchQ = (document.getElementById('upg-target-search')?.value || '').trim().toLowerCase();
  const edFilter = document.getElementById('upg-target-edition-filter')?.value || 'all';
  const wearCode = document.getElementById('upg-target-wear-filter')?.value || 'FN';
  upgSelectedTargetWear = wearCode;

  const editions = [];
  if (edFilter === 'all' || edFilter === 'normal') editions.push('normal');
  if (edFilter === 'all' || edFilter === 'stattrak') editions.push('stattrak');
  if (edFilter === 'all' || edFilter === 'souvenir') editions.push('souvenir');

  let targets = [];
  state.cards.forEach(card => {
    editions.forEach(ed => {
      if (ed === 'stattrak' && !card.hasStatTrak) return;
      if (ed === 'souvenir' && !card.hasSouvenir) return;
      targets.push({ card, edition: ed, wear: wearCode });
    });
  });

  if (searchQ) {
    targets = targets.filter(t => formatSkinTitle(t.card).toLowerCase().includes(searchQ));
  }

  const sorted = sortItems(targets, sortMode);
  document.getElementById('upg-targets-count').textContent = sorted.length;

  const grid = document.getElementById('upgrade-target-cards');
  grid.innerHTML = '';
  sorted.forEach(t => {
    const sel = t.card.id === upgSelectedTargetId && t.edition === upgSelectedTargetEdition && t.wear === upgSelectedTargetWear;
    const d = document.createElement('div');
    d.innerHTML = createUpgradeSquareTileHTML(
      t.card,
      t.edition,
      t.wear,
      sel,
      `onclick="selectUpgradeTarget('${t.card.id}', '${t.edition}', '${t.wear}')"`,
      `data-upg-target="${t.card.id}_${t.edition}_${t.wear}"`
    );
    if (d.firstElementChild) grid.appendChild(d.firstElementChild);
  });
  appendEmptyUpgradeSlots(grid, sorted.length, 3);
}

function selectUpgradeSource(uid) {
  if (isUpgrading) return;
  SoundFX.click();
  upgSelectedSourceUid = uid;
  document.querySelectorAll('#upgrade-my-cards .upg-square-tile').forEach(el => el.classList.toggle('selected', el.dataset.upgUid === uid));
  updateUpgradeSlotsAndChance();
}

function selectUpgradeTarget(cardId, edition, wear) {
  if (isUpgrading) return;
  SoundFX.click();
  upgSelectedTargetId = cardId;
  upgSelectedTargetEdition = edition;
  upgSelectedTargetWear = wear;
  const key = `${cardId}_${edition}_${wear}`;
  document.querySelectorAll('#upgrade-target-cards .upg-square-tile').forEach(el => el.classList.toggle('selected', el.dataset.upgTarget === key));
  updateUpgradeSlotsAndChance();
}

function updateUpgradeSlotsAndChance() {
  const srcSlot = document.getElementById('upgrade-source-slot');
  const tgtSlot = document.getElementById('upgrade-target-slot');
  const btn = document.getElementById('do-upgrade-btn');
  const chanceText = document.getElementById('upgrade-chance-text');
  const circle = document.getElementById('upgrade-circle');

  const srcItem = state.inventory.find(x => x.uid === upgSelectedSourceUid);
  const srcCard = srcItem ? getCardById(srcItem.cardId) : null;
  const tgtCard = upgSelectedTargetId ? getCardById(upgSelectedTargetId) : null;

  srcSlot.innerHTML = srcCard ? createCardHTML(srcCard, srcItem.edition || 'normal', srcItem.wear || 'FN') : 'Выбери скин снизу';
  tgtSlot.innerHTML = tgtCard ? createCardHTML(tgtCard, upgSelectedTargetEdition, upgSelectedTargetWear) : 'Выбери цель справа';

  if (srcCard && tgtCard) {
    const sPrice = getSkinPrice(srcCard, srcItem.edition || 'normal', srcItem.wear || 'FN');
    const tPrice = getSkinPrice(tgtCard, upgSelectedTargetEdition, upgSelectedTargetWear);
    const chance = calculateUpgradeChance(sPrice, tPrice);
    chanceText.textContent = formatUpgradeChanceText(chance);
    const deg = (chance / 100) * 360;
    circle.style.background = `conic-gradient(var(--accent-gold) 0deg ${deg}deg, #262934 ${deg}deg 360deg)`;
    btn.disabled = isUpgrading;
  } else {
    chanceText.textContent = '0.00%';
    circle.style.background = `conic-gradient(var(--accent-gold) 0deg, #262934 0deg)`;
    btn.disabled = true;
  }
}

function executeUpgrade() {
  if (isUpgrading) return;
  const srcIdx = state.inventory.findIndex(x => x.uid === upgSelectedSourceUid);
  if (srcIdx === -1) return;
  const srcItem = state.inventory[srcIdx];
  const srcCard = getCardById(srcItem.cardId);
  const tgtCard = getCardById(upgSelectedTargetId);
  if (!srcCard || !tgtCard) return;

  const chance = calculateUpgradeChance(
    getSkinPrice(srcCard, srcItem.edition || 'normal', srcItem.wear || 'FN'),
    getSkinPrice(tgtCard, upgSelectedTargetEdition, upgSelectedTargetWear)
  );

  const speedMode = document.getElementById('upgrade-speed-select')?.value || 'normal';
  const durationMs = speedMode === 'slow' ? 4500 : speedMode === 'fast' ? 800 : 2500;
  const roll = Math.random() * 100;
  const targetDeg = (roll / 100) * 360;
  const baseNorm = ((currentWheelAngle % 360) + 360) % 360;
  currentWheelAngle += 6 * 360 + ((targetDeg - baseNorm + 360) % 360);

  const rotor = document.getElementById('upgrade-arrow-rotor');
  rotor.style.transition = `transform ${durationMs}ms cubic-bezier(0.12, 0.88, 0.22, 1)`;
  rotor.style.transform = `rotate(${currentWheelAngle}deg)`;

  isUpgrading = true;
  document.getElementById('do-upgrade-btn').disabled = true;
  document.getElementById('upgrade-result-msg').textContent = 'Крутим...';

  setTimeout(() => {
    isUpgrading = false;
    state.inventory.splice(srcIdx, 1);
    upgSelectedSourceUid = null;
    const msg = document.getElementById('upgrade-result-msg');
    if (chance > 0 && roll < chance) {
      SoundFX.upgradeSuccess();
      state.stats.upgrades += 1;
      giveSkinToPlayer(tgtCard, upgSelectedTargetEdition, upgSelectedTargetWear);
      msg.innerHTML = `<span style="color:#4ade80;font-weight:800;">УСПЕХ! Выпал ${formatSkinTitle(tgtCard)}</span>`;
    } else {
      SoundFX.upgradeFail();
      msg.innerHTML = `<span style="color:#f87171;font-weight:800;">НЕУДАЧА! Скин сгорел</span>`;
    }
    saveState(false);
    renderUpgradeMyInventory();
    updateUpgradeSlotsAndChance();
  }, durationMs + 80);
}

// === ДУЭЛИ ===
function setDuelBotCount(count) {
  if (isDuelRunning) return;
  SoundFX.click();
  duelBotCount = count === 2 ? 2 : 1;
  document.querySelectorAll('#duel-bot-count-selector .count-chip').forEach(b => b.classList.toggle('active', Number(b.dataset.bots) === duelBotCount));
  renderDuelLobby();
}

function renderDuelLobby() {
  if (isDuelRunning) return;
  document.getElementById('duel-lobby-view').classList.remove('hidden');
  document.getElementById('duel-case-select-view').classList.add('hidden');
  document.getElementById('duel-arena-view').classList.add('hidden');
  document.getElementById('duel-status-badge').textContent = `Ботов: ${duelBotCount} • Приз: +${DUEL_WIN_BONUS} ₽`;

  const slots = [`<div class="duel-slot-card is-player"><div class="duel-slot-role">Игрок</div><div class="duel-slot-name">${state.nickname}</div></div>`];
  for (let i = 0; i < duelBotCount; i++) {
    slots.push(`<div class="duel-slot-card"><div class="duel-slot-role">Соперник #${i + 1}</div><div class="duel-slot-name">${DUEL_BOT_NAMES[i]}</div></div>`);
  }
  document.getElementById('duel-lobby-slots').innerHTML = slots.join('');
}

function resetDuelToLobby() { if (!isDuelRunning) { SoundFX.click(); renderDuelLobby(); } }

function startDuelMatch() {
  if (isDuelRunning) return;
  const playable = state.cases.filter(c => c.cardIds.map(getCardById).filter(Boolean).length > 0);
  if (!playable.length) return;
  SoundFX.click();
  document.getElementById('duel-lobby-view').classList.add('hidden');
  document.getElementById('duel-case-select-view').classList.remove('hidden');
  document.getElementById('duel-bot-picks-info').textContent = 'Выбери свой кейс — бот подберёт свой.';
  document.getElementById('duel-cases-grid').innerHTML = playable.map(c => `
    <div class="case-item" style="${state.balance >= c.price ? '' : 'opacity:0.45;'}" onclick="${state.balance >= c.price ? `pickDuelCaseAndSpin('${c.id}')` : ''}">
      <img src="${c.img}" alt="${c.name}" onerror="this.src='https://placehold.co/320x180/181a20/ffffff?text=CASE'">
      <h3>${c.name}</h3>
      <div class="case-price-tag">${c.price} ₽</div>
    </div>
  `).join('');
}

function pickDuelCaseAndSpin(playerCaseId) {
  if (isDuelRunning) return;
  const playerCase = state.cases.find(c => c.id === playerCaseId);
  if (!playerCase || state.balance < playerCase.price) return;
  const playable = state.cases.filter(c => c.cardIds.map(getCardById).filter(Boolean).length > 0);
  if (!playable.length) return;

  state.balance -= playerCase.price;
  state.stats.opened += 1 + duelBotCount;
  saveState(false);

  duelCompetitors = [{
    id: 'player', name: state.nickname, isPlayer: true, caseObj: playerCase,
    pool: playerCase.cardIds.map(getCardById).filter(Boolean)
  }];
  for (let i = 0; i < duelBotCount; i++) {
    const bc = playable[Math.floor(Math.random() * playable.length)];
    duelCompetitors.push({
      id: 'bot_' + i, name: DUEL_BOT_NAMES[i], isPlayer: false, caseObj: bc,
      pool: bc.cardIds.map(getCardById).filter(Boolean)
    });
  }

  duelCompetitors.forEach(comp => {
    const card = rollWeightedSkin(comp.pool, 'case');
    const edition = rollEditionForSkin(card);
    const wear = rollWearCode();
    comp.winnerEntry = { card, edition, wear };
    comp.score = getSkinPrice(card, edition, wear) + (Number(getRarityObj(card.rarity)?.order || 0) * 100000);
  });

  document.getElementById('duel-case-select-view').classList.add('hidden');
  document.getElementById('duel-arena-view').classList.remove('hidden');
  document.getElementById('duel-rematch-btn').classList.add('hidden');
  document.getElementById('duel-verdict-banner').textContent = 'Крутим рулетки...';

  document.getElementById('duel-competitors-grid').innerHTML = duelCompetitors.map((comp, idx) => {
    let cardsHtml = '';
    for (let i = 0; i < 45; i++) {
      if (i === 38) cardsHtml += createCardHTML(comp.winnerEntry.card, comp.winnerEntry.edition, comp.winnerEntry.wear);
      else {
        const rnd = comp.pool[Math.floor(Math.random() * comp.pool.length)];
        cardsHtml += createCardHTML(rnd, rollEditionForSkin(rnd), rollWearCode());
      }
    }
    return `
      <div id="duel-lane-${idx}" class="duel-lane">
        <div class="duel-lane-head"><b>${comp.name}</b><span class="duel-lane-case">${comp.caseObj.name}</span></div>
        <div class="duel-roulette-box"><div class="roulette-pointer"></div><div id="duel-track-${idx}" class="duel-roulette-track">${cardsHtml}</div></div>
        <div id="duel-lane-result-${idx}" class="duel-lane-result">Крутится...</div>
      </div>
    `;
  }).join('');

  isDuelRunning = true;
  setTimeout(() => {
    duelCompetitors.forEach((_, idx) => {
      const track = document.getElementById(`duel-track-${idx}`);
      if (!track) return;
      track.style.transition = 'transform 4.2s cubic-bezier(0.12, 0.88, 0.22, 1)';
      track.style.transform = `translateX(-${38 * 162 + 76}px)`;
    });
    trackRouletteCardsPassingPointer(4.2, () => isDuelRunning, 'duel-track-0');
  }, 30);

  setTimeout(() => {
    stopRouletteCardSoundTracker();
    const maxScore = Math.max(...duelCompetitors.map(c => c.score));
    const winners = duelCompetitors.filter(c => c.score === maxScore);
    const playerWon = winners.some(w => w.isPlayer) && winners.length === 1;

    duelCompetitors.forEach((comp, idx) => {
      const price = getSkinPrice(comp.winnerEntry.card, comp.winnerEntry.edition, comp.winnerEntry.wear);
      document.getElementById(`duel-lane-result-${idx}`).textContent = `${formatSkinTitle(comp.winnerEntry.card)} (${comp.winnerEntry.wear}) — ${price} ₽`;
      if (winners.some(w => w.id === comp.id)) document.getElementById(`duel-lane-${idx}`).classList.add('is-winner');
    });

    const verdict = document.getElementById('duel-verdict-banner');
    if (playerWon) {
      SoundFX.win(true);
      giveSkinToPlayer(duelCompetitors[0].winnerEntry.card, duelCompetitors[0].winnerEntry.edition, duelCompetitors[0].winnerEntry.wear);
      state.balance += DUEL_WIN_BONUS;
      saveState(false);
      verdict.className = 'duel-verdict-banner win';
      verdict.textContent = `Победа! Забираешь скин и +${DUEL_WIN_BONUS} ₽!`;
    } else {
      SoundFX.upgradeFail();
      verdict.className = 'duel-verdict-banner lose';
      verdict.textContent = `Поражение! Победил ${winners[0]?.name || 'бот'}.`;
    }
    isDuelRunning = false;
    document.getElementById('duel-rematch-btn').classList.remove('hidden');
  }, 4350);
}

// === ТРЕЙДЫ ===
function startBotTrade() { SoundFX.click(); tradeMyOfferUids = []; tradeBotOffer = []; document.getElementById('trade-arena').classList.remove('hidden'); renderTradeUI(); }
function toggleTradeCard(uid) {
  SoundFX.click();
  const idx = tradeMyOfferUids.indexOf(uid);
  if (idx > -1) tradeMyOfferUids.splice(idx, 1); else tradeMyOfferUids.push(uid);
  let mySum = 0;
  tradeMyOfferUids.forEach(id => {
    const it = state.inventory.find(x => x.uid === id);
    const c = it && getCardById(it.cardId);
    if (c) mySum += getSkinPrice(c, it.edition || 'normal', it.wear || 'FN');
  });
  let budget = Math.floor(mySum * 0.95);
  tradeBotOffer = [];
  if (budget > 0 && state.cards.length > 0) {
    const sorted = [...state.cards].sort((a, b) => b.price - a.price);
    for (let g = 0; g < 10 && budget >= 20; g++) {
      const avail = sorted.filter(c => getSkinPrice(c, 'normal', 'FT') <= budget);
      if (!avail.length) break;
      const pick = avail[Math.floor(Math.random() * Math.min(3, avail.length))];
      const ed = rollEditionForSkin(pick);
      const wr = rollWearCode();
      const pr = getSkinPrice(pick, ed, wr);
      if (pr <= budget) { tradeBotOffer.push({ card: pick, edition: ed, wear: wr }); budget -= pr; }
    }
  }
  renderTradeUI();
}
function renderTradeUI() {
  let mySum = 0;
  document.getElementById('my-trade-offer').innerHTML = tradeMyOfferUids.map(uid => {
    const it = state.inventory.find(x => x.uid === uid);
    const c = it && getCardById(it.cardId);
    if (!c) return '';
    mySum += getSkinPrice(c, it.edition || 'normal', it.wear || 'FN');
    return createCardHTML(c, it.edition || 'normal', it.wear || 'FN', '', `onclick="toggleTradeCard('${uid}')"`);
  }).join('') || '<div class="hint-text">Выбери скины снизу</div>';

  let botSum = 0;
  document.getElementById('bot-trade-offer').innerHTML = tradeBotOffer.map(b => {
    botSum += getSkinPrice(b.card, b.edition, b.wear);
    return createCardHTML(b.card, b.edition, b.wear);
  }).join('') || '<div class="hint-text">Предложение бота</div>';

  document.getElementById('my-trade-sum').textContent = mySum;
  document.getElementById('bot-trade-sum').textContent = botSum;

  const avail = state.inventory.map(it => ({ ...it, card: getCardById(it.cardId) })).filter(x => x.card && !tradeMyOfferUids.includes(x.uid));
  document.getElementById('trade-inv-count').textContent = avail.length;
  document.getElementById('trade-my-inv').innerHTML = avail.map(it => createCardHTML(it.card, it.edition || 'normal', it.wear || 'FN', '', `onclick="toggleTradeCard('${it.uid}')"`)).join('') || '<div class="hint-text">Нет скинов для обмена</div>';
  document.getElementById('confirm-trade-btn').disabled = !(mySum > 0 && tradeBotOffer.length > 0);
}
function confirmTrade() {
  SoundFX.trade();
  state.inventory = state.inventory.filter(x => !tradeMyOfferUids.includes(x.uid));
  tradeBotOffer.forEach(b => giveSkinToPlayer(b.card, b.edition, b.wear));
  tradeMyOfferUids = [];
  tradeBotOffer = [];
  saveState(false);
  renderTradeUI();
}

// === ИНВЕНТАРЬ ===
function renderCollection() {
  const sel = document.getElementById('sell-rarity-select');
  if (sel) sel.innerHTML = state.rarities.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

  const sortMode = document.getElementById('col-sort').value;
  const mapped = state.inventory.map(it => ({ ...it, card: getCardById(it.cardId) })).filter(x => x.card);
  const totalVal = mapped.reduce((s, x) => s + getSkinPrice(x.card, x.edition || 'normal', x.wear || 'FN'), 0);

  document.getElementById('stat-total-cards').textContent = mapped.length;
  document.getElementById('stat-inv-value').textContent = totalVal + ' ₽';
  document.getElementById('stat-opened').textContent = state.stats.opened;
  document.getElementById('stat-upgrades').textContent = state.stats.upgrades;

  document.getElementById('collection-grid').innerHTML = sortItems(mapped, sortMode).map(item => {
    const ed = item.edition || 'normal';
    const wr = item.wear || 'FN';
    const price = getSkinPrice(item.card, ed, wr);
    const sellBtn = `<button class="secondary-btn" style="width:100%;margin-top:6px;padding:6px 8px;font-size:11px;" onclick="event.stopPropagation(); sellInventoryCard('${item.uid}')">Продать за ${price} ₽</button>`;
    return createCardHTML(item.card, ed, wr, '', `onclick="openCard3DModal('${item.card.id}', '${ed}', '${wr}')"`, sellBtn);
  }).join('');
}

function sellInventoryCard(uid) {
  const idx = state.inventory.findIndex(x => x.uid === uid);
  if (idx === -1) return;
  const it = state.inventory[idx];
  const c = getCardById(it.cardId);
  if (c) { SoundFX.sell(); state.balance += getSkinPrice(c, it.edition || 'normal', it.wear || 'FN'); }
  state.inventory.splice(idx, 1);
  saveState(false);
  renderCollection();
}

function sellAllDuplicates() {
  const seen = new Set();
  let earned = 0;
  state.inventory = state.inventory.filter(it => {
    const key = `${it.cardId}_${it.edition || 'normal'}_${it.wear || 'FN'}`;
    if (seen.has(key)) {
      const c = getCardById(it.cardId);
      if (c) earned += getSkinPrice(c, it.edition || 'normal', it.wear || 'FN');
      return false;
    }
    seen.add(key);
    return true;
  });
  if (earned > 0) SoundFX.sell();
  state.balance += earned;
  saveState(false);
  renderCollection();
}

function sellBySelectedRarity() {
  const rid = document.getElementById('sell-rarity-select')?.value;
  if (!rid) return;
  let earned = 0;
  state.inventory = state.inventory.filter(it => {
    const c = getCardById(it.cardId);
    if (c && c.rarity === rid) { earned += getSkinPrice(c, it.edition || 'normal', it.wear || 'FN'); return false; }
    return true;
  });
  if (earned > 0) { SoundFX.sell(); state.balance += earned; saveState(false); renderCollection(); }
}

function sellAllInventoryCards() {
  let earned = 0;
  state.inventory.forEach(it => {
    const c = getCardById(it.cardId);
    if (c) earned += getSkinPrice(c, it.edition || 'normal', it.wear || 'FN');
  });
  if (earned > 0) SoundFX.sell();
  state.inventory = [];
  state.balance += earned;
  saveState(false);
  renderCollection();
}

// === КРАФТЫ ===
function renderCraftUI() {
  const mapped = state.inventory.map(it => ({ ...it, card: getCardById(it.cardId) })).filter(x => x.card);
  document.getElementById('craft-inv-grid').innerHTML = sortItems(mapped, document.getElementById('craft-sort').value).map(it =>
    createCardHTML(it.card, it.edition || 'normal', it.wear || 'FN', craftSelectedUids.includes(it.uid) ? 'selected' : '', `onclick="toggleCraftCard('${it.uid}')"`)
  ).join('');

  let sum = 0;
  let slots = '';
  for (let i = 0; i < 10; i++) {
    const uid = craftSelectedUids[i];
    if (uid) {
      const it = state.inventory.find(x => x.uid === uid);
      const c = it && getCardById(it.cardId);
      if (c) sum += getSkinPrice(c, it.edition || 'normal', it.wear || 'FN');
      slots += `<div class="craft-mini-slot" onclick="toggleCraftCard('${uid}')"><img src="${c?.img || ''}" style="width:100%;height:100%;object-fit:cover;"></div>`;
    } else slots += `<div class="craft-mini-slot">${i + 1}</div>`;
  }
  document.getElementById('craft-selected-slots').innerHTML = slots;
  document.getElementById('craft-count').textContent = craftSelectedUids.length;
  document.getElementById('craft-avg-price').textContent = craftSelectedUids.length ? Math.round(sum / craftSelectedUids.length) : 0;
  document.getElementById('do-craft-btn').disabled = craftSelectedUids.length !== 10;
}

function toggleCraftCard(uid) {
  SoundFX.click();
  const idx = craftSelectedUids.indexOf(uid);
  if (idx > -1) { craftSelectedUids.splice(idx, 1); }
  else {
    if (craftSelectedUids.length >= 10) return;
    if (craftSelectedUids.length > 0) {
      const firstC = getCardById(state.inventory.find(x => x.uid === craftSelectedUids[0])?.cardId);
      const nextC = getCardById(state.inventory.find(x => x.uid === uid)?.cardId);
      if (firstC?.rarity !== nextC?.rarity) return;
    }
    craftSelectedUids.push(uid);
  }
  renderCraftUI();
}

function executeCraft() {
  if (craftSelectedUids.length !== 10) return;
  const firstC = getCardById(state.inventory.find(x => x.uid === craftSelectedUids[0])?.cardId);
  const curRar = getRarityObj(firstC?.rarity);
  const nextRar = [...state.rarities].sort((a, b) => a.order - b.order).find(r => r.order > curRar.order) || curRar;
  const pool = state.cards.filter(c => c.rarity === nextRar.id);
  const crafted = (pool.length ? pool : state.cards)[Math.floor(Math.random() * (pool.length || state.cards.length))];
  const ed = rollEditionForSkin(crafted);
  const wr = rollWearCode();

  state.inventory = state.inventory.filter(x => !craftSelectedUids.includes(x.uid));
  craftSelectedUids = [];
  const added = giveSkinToPlayer(crafted, ed, wr);
  SoundFX.win(ed !== 'normal');
  showWinModal([{ card: crafted, edition: ed, wear: wr, uid: added.uid }]);
  renderCraftUI();
}

// === 3D МОДАЛКА ===
function openCard3DModal(cardId, edition = 'normal', wearCode = 'FN') {
  const card = getCardById(cardId);
  if (!card) return;
  SoundFX.click();
  const rar = getRarityObj(card.rarity);
  const wear = getWearObj(wearCode);
  const edLabel = edition === 'souvenir' ? '★ Сувенир' : edition === 'stattrak' ? 'StatTrak™' : 'Обычный';

  document.getElementById('card-3d-front').innerHTML = createCardHTML(card, edition, wearCode);
  document.getElementById('card-3d-info').innerHTML = `
    <div><span>Скин:</span><b>${formatSkinTitle(card)}</b></div>
    <div><span>Редкость:</span><b style="color:${rar.color}">${rar.name}</b></div>
    <div><span>Износ:</span><b>${wear.label} (${wearCode})</b></div>
    <div><span>Версия:</span><b>${edLabel}</b></div>
    <div><span>Цена:</span><b style="color:#a3e635">${getSkinPrice(card, edition, wearCode)} ₽</b></div>
  `;
  rotX = 0; rotY = 0;
  document.getElementById('card-3d-flipper').style.transform = 'rotateX(0deg) rotateY(0deg)';
  document.getElementById('card-3d-modal').classList.remove('hidden');
}

function closeCard3DModal(e) {
  if (e && e.target !== document.getElementById('card-3d-modal')) return;
  isDragging3D = false;
  document.getElementById('card-3d-modal').classList.add('hidden');
}

(function init3D() {
  const stage = document.getElementById('stage-3d');
  if (!stage) return;
  stage.addEventListener('pointerdown', (e) => {
    isDragging3D = true; dragStartX = e.clientX; dragStartY = e.clientY;
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  });
  stage.addEventListener('pointermove', (e) => {
    if (!isDragging3D) return;
    rotY += (e.clientX - dragStartX) * 0.7;
    rotX = Math.max(-55, Math.min(55, rotX - (e.clientY - dragStartY) * 0.6));
    dragStartX = e.clientX; dragStartY = e.clientY;
    document.getElementById('card-3d-flipper').style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  });
  stage.addEventListener('pointerup', () => { isDragging3D = false; });
})();

// === АДМИНКА ===
const DEFAULT_RARITY_PALETTE = ['#eb4b4b', '#d32ce6', '#8847ff', '#4b69ff', '#facc15'];

function renderNewRarityColorInputs(preset = null) {
  const box = document.getElementById('new-rar-colors-box');
  const cnt = Math.max(1, Math.min(5, Number(document.getElementById('new-rar-color-count')?.value) || 2));
  if (!box) return;
  let html = '';
  for (let i = 0; i < cnt; i++) {
    const v = (preset && preset[i]) || DEFAULT_RARITY_PALETTE[i % DEFAULT_RARITY_PALETTE.length];
    html += `<input type="color" class="new-rar-grad-color" value="${v}">`;
  }
  box.innerHTML = html;
}

function checkAdminPass() {
  if (document.getElementById('admin-pass-input').value === '12356790') {
    SoundFX.click();
    document.getElementById('admin-login-box').classList.add('hidden');
    document.getElementById('admin-panel-content').classList.remove('hidden');
    renderAdminUI();
  }
}

function saveSpecialRates() {
  state.statTrakMultiplier = Math.max(1, Number(document.getElementById('cfg-st-mult').value) || 1.8);
  state.statTrakChance = Math.max(0, Math.min(1, Number(document.getElementById('cfg-st-chance').value) || 0));
  state.souvenirMultiplier = Math.max(1, Number(document.getElementById('cfg-souv-mult').value) || 3.5);
  state.souvenirChance = Math.max(0, Math.min(1, Number(document.getElementById('cfg-souv-chance').value) || 0));
  saveState(true);
  updateCardPreview();
}

function setAdminBalanceStatus(msg, err = false) {
  const el = document.getElementById('admin-balance-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = err ? '#f87171' : '#4ade80';
}

function adminGiveBalance(mode = 'add') {
  const target = (document.getElementById('admin-balance-target')?.value || '').trim();
  const amount = Number(document.getElementById('admin-balance-amount')?.value);
  if (!Number.isFinite(amount)) { setAdminBalanceStatus('Введи сумму', true); return; }
  if (target) state.nickname = target;
  state.balance = mode === 'set' ? Math.max(0, amount) : Math.max(0, state.balance + amount);
  SoundFX.sell();
  saveState(false);
  setAdminBalanceStatus(`Баланс ${state.nickname}: ${Math.floor(state.balance).toLocaleString('ru-RU')} ₽`);
}

function adminQuickGiveBalance(amount) {
  document.getElementById('admin-balance-amount').value = String(amount);
  adminGiveBalance('add');
}

function saveCloudConfig() {
  SoundFX.click();
  state.cloud.binId = document.getElementById('cfg-bin-id').value.trim();
  state.cloud.apiKey = document.getElementById('cfg-api-key').value.trim();
  localStorage.setItem('cs_cloud', JSON.stringify(state.cloud));
  setAdminBalanceStatus('Ключи JSONBin.io сохранены');
}

function adminAddCaseCategory() {
  const inp = document.getElementById('new-case-cat-name');
  const name = (inp?.value || '').trim();
  if (!name) return;
  state.caseCategories.push({ id: 'cat_' + Date.now(), name });
  inp.value = '';
  saveState(true);
  renderAdminUI();
  renderCasesList();
}

function moveCaseCategory(catId, dir) {
  const i = state.caseCategories.findIndex(c => c.id === catId);
  if (i === -1 || i + dir < 0 || i + dir >= state.caseCategories.length) return;
  const [m] = state.caseCategories.splice(i, 1);
  state.caseCategories.splice(i + dir, 0, m);
  saveState(true); renderAdminUI(); renderCasesList();
}

function adminDeleteCaseCategory(catId) {
  if (state.caseCategories.length <= 1) return;
  const i = state.caseCategories.findIndex(c => c.id === catId);
  const fb = state.caseCategories[i === 0 ? 1 : i - 1];
  state.cases.forEach(c => { if (c.categoryId === catId) c.categoryId = fb.id; });
  state.caseCategories.splice(i, 1);
  saveState(true); renderAdminUI(); renderCasesList();
}

function renderAdminUI() {
  recalculateRarityHierarchy();
  normalizeCaseCategoriesAndCases();
  updateCloudSyncBadge();
  updateSoundUI();
  renderNewRarityColorInputs();

  document.getElementById('cfg-st-mult').value = state.statTrakMultiplier;
  document.getElementById('cfg-st-chance').value = state.statTrakChance;
  document.getElementById('cfg-souv-mult').value = state.souvenirMultiplier;
  document.getElementById('cfg-souv-chance').value = state.souvenirChance;
  document.getElementById('cfg-bin-id').value = state.cloud.binId || '';
  document.getElementById('cfg-api-key').value = state.cloud.apiKey || '';

  document.getElementById('admin-case-categories-list').innerHTML = state.caseCategories.map((cat, idx) => `
    <div class="admin-cat-row">
      <b>#${idx + 1} ${cat.name}</b>
      <div class="admin-cat-actions">
        <button class="secondary-btn" style="padding:5px 9px;" ${idx === 0 ? 'disabled' : ''} onclick="moveCaseCategory('${cat.id}', -1)">▲</button>
        <button class="secondary-btn" style="padding:5px 9px;" ${idx === state.caseCategories.length - 1 ? 'disabled' : ''} onclick="moveCaseCategory('${cat.id}', 1)">▼</button>
        <button class="secondary-btn" style="padding:5px 9px;color:#f87171;" ${state.caseCategories.length <= 1 ? 'disabled' : ''} onclick="adminDeleteCaseCategory('${cat.id}')">✕</button>
      </div>
    </div>
  `).join('');

  const catOpts = state.caseCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  const rarOpts = state.rarities.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

  document.getElementById('new-case-category').innerHTML = catOpts;
  const newRarSel = document.getElementById('new-skin-rarity');
  const prevNewRar = newRarSel.value;
  newRarSel.innerHTML = rarOpts;
  if (prevNewRar && state.rarities.some(r => r.id === prevNewRar)) newRarSel.value = prevNewRar;

  const editRarSel = document.getElementById('edit-skin-rarity');
  editRarSel.innerHTML = rarOpts;

  document.getElementById('admin-rarities-list').innerHTML = state.rarities.map(r => `
    <div class="rar-manage-card" style="--rar-color:${r.color};--rar-bg:${r.bg};--rar-gradient:${buildRarityGradientCSS(r)};">
      <div class="rar-manage-top"><span style="color:${r.color}">${r.name}</span><button onclick="adminDeleteRarity('${r.id}')" style="background:none;border:none;color:#f87171;cursor:pointer;">✕</button></div>
      <div class="rar-chance-row"><span>Кейсы:</span><input type="text" value="${r.weight}" onchange="updateRarityWeight('${r.id}', this.value, 'case')"></div>
      <div class="rar-chance-row"><span>Паки:</span><input type="text" value="${r.packWeight ?? r.weight}" onchange="updateRarityWeight('${r.id}', this.value, 'pack')"></div>
    </div>
  `).join('');

  document.getElementById('admin-case-cards-selector').innerHTML = state.cards.map(c => `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;"><input type="checkbox" class="case-card-cb" value="${c.id}"> ${formatSkinTitle(c)}</label>
  `).join('');

  renderAdminCasesList();
  updateCasePreview();

  document.getElementById('admin-cards-count').textContent = state.cards.length;
  document.getElementById('admin-all-cards').innerHTML = state.cards.map(c => {
    const ed = c.hasSouvenir ? 'souvenir' : c.hasStatTrak ? 'stattrak' : 'normal';
    const delBtn = `<button class="secondary-btn" style="width:100%;margin-top:6px;padding:6px 8px;font-size:11px;color:#f87171;" onclick="event.stopPropagation(); adminDeleteCard('${c.id}')">Удалить</button>`;
    return createCardHTML(c, ed, 'FN', c.id === editingCardId ? 'editing-target' : '', `onclick="openEditCardPanel('${c.id}')"`, delBtn);
  }).join('');

  updateCardPreview();
}

function updateRarityWeight(id, val, mode) {
  const r = state.rarities.find(x => x.id === id);
  if (!r) return;
  if (mode === 'pack') r.packWeight = sanitizeChanceInput(val);
  else r.weight = sanitizeChanceInput(val);
  saveState(true); renderAdminUI();
}

function adminAddRarity() {
  const name = document.getElementById('new-rar-name').value.trim();
  if (!name) return;
  const gradColors = Array.from(document.querySelectorAll('#new-rar-colors-box .new-rar-grad-color')).map(i => i.value);
  const weight = sanitizeChanceInput(document.getElementById('new-rar-weight').value);
  const packWeight = sanitizeChanceInput(document.getElementById('new-rar-pack-weight').value);
  const id = name.toLowerCase().replace(/\s+/g, '_');
  state.rarities.push({ id, name, color: gradColors[0], bg: gradColors[gradColors.length - 1], gradientColors: gradColors, order: 1, weight, packWeight, effect: 'glow' });
  saveState(true); renderAdminUI();
}

function adminDeleteRarity(id) {
  if (state.rarities.length <= 1) return;
  state.rarities = state.rarities.filter(r => r.id !== id);
  saveState(true); renderAdminUI();
}

function updateCardPreview() {
  const box = document.getElementById('card-creator-preview');
  if (!box) return;
  const sample = {
    id: 'prev',
    weapon: document.getElementById('new-skin-weapon').value.trim() || 'AK-47',
    name: document.getElementById('new-skin-name').value.trim() || 'Redline',
    rarity: document.getElementById('new-skin-rarity').value || state.rarities[0].id,
    price: Number(document.getElementById('new-skin-price').value) || 1200,
    hasStatTrak: Boolean(document.getElementById('new-skin-has-st').checked),
    hasSouvenir: Boolean(document.getElementById('new-skin-has-souv').checked),
    img: document.getElementById('new-skin-img').value.trim() || 'https://placehold.co/320x200/181a20/ffffff?text=CS+SKIN'
  };
  const ed = document.getElementById('preview-edition')?.value || 'normal';
  const wr = document.getElementById('preview-wear')?.value || 'FN';
  box.innerHTML = createCardHTML(sample, ed, wr);
}

function adminAddCard() {
  const weapon = document.getElementById('new-skin-weapon').value.trim() || 'Weapon';
  const name = document.getElementById('new-skin-name').value.trim();
  if (!name) return;
  state.cards.push({
    id: 's_' + Date.now(),
    weapon,
    name,
    rarity: document.getElementById('new-skin-rarity').value,
    price: Number(document.getElementById('new-skin-price').value) || 1000,
    hasStatTrak: Boolean(document.getElementById('new-skin-has-st').checked),
    hasSouvenir: Boolean(document.getElementById('new-skin-has-souv').checked),
    img: document.getElementById('new-skin-img').value.trim() || 'https://placehold.co/320x200/181a20/ffffff?text=CS+SKIN'
  });
  saveState(true); renderAdminUI();
}

function openEditCardPanel(id) {
  const c = getCardById(id);
  if (!c) return;
  editingCardId = id;
  document.getElementById('admin-edit-card-panel').classList.remove('hidden');
  document.getElementById('edit-skin-heading').textContent = formatSkinTitle(c);
  document.getElementById('edit-skin-weapon').value = c.weapon || '';
  document.getElementById('edit-skin-name').value = c.name || '';
  document.getElementById('edit-skin-rarity').value = c.rarity;
  document.getElementById('edit-skin-price').value = c.price || 1000;
  document.getElementById('edit-skin-img').value = c.img || '';
  document.getElementById('edit-skin-has-st').checked = Boolean(c.hasStatTrak);
  document.getElementById('edit-skin-has-souv').checked = Boolean(c.hasSouvenir);
  updateEditCardPreview();
}

function cancelEditCard() { editingCardId = null; document.getElementById('admin-edit-card-panel').classList.add('hidden'); }

function updateEditCardPreview() {
  if (!editingCardId) return;
  const sample = {
    id: editingCardId,
    weapon: document.getElementById('edit-skin-weapon').value.trim(),
    name: document.getElementById('edit-skin-name').value.trim() || 'Skin',
    rarity: document.getElementById('edit-skin-rarity').value,
    price: Number(document.getElementById('edit-skin-price').value) || 1000,
    hasStatTrak: Boolean(document.getElementById('edit-skin-has-st').checked),
    hasSouvenir: Boolean(document.getElementById('edit-skin-has-souv').checked),
    img: document.getElementById('edit-skin-img').value.trim() || 'https://placehold.co/320x200/181a20/ffffff?text=CS+SKIN'
  };
  document.getElementById('edit-card-preview').innerHTML = createCardHTML(sample, sample.hasSouvenir ? 'souvenir' : sample.hasStatTrak ? 'stattrak' : 'normal', 'FN');
}

function saveEditedCard() {
  const idx = state.cards.findIndex(c => c.id === editingCardId);
  if (idx === -1) return;
  state.cards[idx] = {
    ...state.cards[idx],
    weapon: document.getElementById('edit-skin-weapon').value.trim(),
    name: document.getElementById('edit-skin-name').value.trim() || state.cards[idx].name,
    rarity: document.getElementById('edit-skin-rarity').value,
    price: Number(document.getElementById('edit-skin-price').value) || 1000,
    hasStatTrak: Boolean(document.getElementById('edit-skin-has-st').checked),
    hasSouvenir: Boolean(document.getElementById('edit-skin-has-souv').checked),
    img: document.getElementById('edit-skin-img').value.trim() || state.cards[idx].img
  };
  saveState(true); renderAdminUI();
}

function deleteEditingCard() {
  if (!editingCardId) return;
  adminDeleteCard(editingCardId);
  cancelEditCard();
}

function adminDeleteCard(id) {
  state.cards = state.cards.filter(c => c.id !== id);
  saveState(true); renderAdminUI();
}

function updateCasePreview() {
  const box = document.getElementById('case-creator-preview');
  if (!box) return;
  box.innerHTML = `<div class="case-item" style="width:100%;cursor:default;transform:none;"><img src="${document.getElementById('new-case-img').value.trim() || 'https://placehold.co/320x180/181a20/ffffff?text=CASE'}"><h3>${document.getElementById('new-case-name').value.trim() || 'Кейс'}</h3><div class="case-price-tag">${Number(document.getElementById('new-case-price').value) || 500} ₽</div></div>`;
}

function adminAddCase() {
  const name = document.getElementById('new-case-name').value.trim();
  const cardIds = Array.from(document.querySelectorAll('.case-card-cb:checked')).map(cb => cb.value);
  if (!name || !cardIds.length) return;
  state.cases.push({
    id: 'case_' + Date.now(),
    name,
    price: Number(document.getElementById('new-case-price').value) || 500,
    categoryId: document.getElementById('new-case-category').value,
    img: document.getElementById('new-case-img').value.trim() || 'https://placehold.co/320x180/181a20/ffffff?text=CASE',
    cardIds
  });
  saveState(true); renderAdminUI(); renderCasesList();
}

function renderAdminCasesList() {
  document.getElementById('admin-cases-count').textContent = state.cases.length;
  document.getElementById('admin-cases-list').innerHTML = state.cases.map(c => `
    <div class="admin-case-card ${c.id === editingCaseId ? 'editing-target' : ''}">
      <img src="${c.img}" onerror="this.src='https://placehold.co/320x180/181a20/ffffff?text=CASE'">
      <b>${c.name}</b>
      <div class="admin-case-meta">${c.price} ₽ • ${c.cardIds.length} скинов</div>
      <div class="admin-case-btns">
        <button class="secondary-btn" style="padding:6px 10px;font-size:12px;" onclick="openEditCasePanel('${c.id}')">Изменить</button>
        <button class="secondary-btn" style="padding:6px 10px;font-size:12px;color:#f87171;" onclick="adminDeleteCase('${c.id}')">Удалить</button>
      </div>
    </div>
  `).join('');
}

function openEditCasePanel(caseId) {
  const c = state.cases.find(x => x.id === caseId);
  if (!c) return;
  editingCaseId = caseId;
  document.getElementById('admin-edit-case-panel').classList.remove('hidden');
  document.getElementById('edit-case-heading').textContent = c.name;
  document.getElementById('edit-case-name').value = c.name;
  document.getElementById('edit-case-price').value = c.price;
  document.getElementById('edit-case-img').value = c.img;
  document.getElementById('edit-case-category').innerHTML = state.caseCategories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
  document.getElementById('edit-case-category').value = c.categoryId;
  const set = new Set(c.cardIds);
  document.getElementById('admin-edit-case-cards-selector').innerHTML = state.cards.map(sk => `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;"><input type="checkbox" class="edit-case-card-cb" value="${sk.id}" ${set.has(sk.id) ? 'checked' : ''}> ${formatSkinTitle(sk)}</label>
  `).join('');
  updateEditCasePreview();
}

function cancelEditCase() { editingCaseId = null; document.getElementById('admin-edit-case-panel').classList.add('hidden'); renderAdminCasesList(); }

function updateEditCasePreview() {
  if (!editingCaseId) return;
  document.getElementById('edit-case-preview').innerHTML = `<div class="case-item" style="width:100%;cursor:default;transform:none;"><img src="${document.getElementById('edit-case-img').value.trim() || 'https://placehold.co/320x180/181a20/ffffff?text=CASE'}"><h3>${document.getElementById('edit-case-name').value.trim() || 'Кейс'}</h3><div class="case-price-tag">${Number(document.getElementById('edit-case-price').value) || 500} ₽</div></div>`;
}

function saveEditedCase() {
  const idx = state.cases.findIndex(x => x.id === editingCaseId);
  if (idx === -1) return;
  const cardIds = Array.from(document.querySelectorAll('.edit-case-card-cb:checked')).map(cb => cb.value);
  if (!cardIds.length) return;
  state.cases[idx] = {
    ...state.cases[idx],
    name: document.getElementById('edit-case-name').value.trim() || state.cases[idx].name,
    price: Number(document.getElementById('edit-case-price').value) || 500,
    categoryId: document.getElementById('edit-case-category').value,
    img: document.getElementById('edit-case-img').value.trim() || state.cases[idx].img,
    cardIds
  };
  saveState(true); renderAdminUI(); renderCasesList();
}

function deleteEditingCase() { if (editingCaseId) { adminDeleteCase(editingCaseId); cancelEditCase(); } }

function adminDeleteCase(caseId) {
  state.cases = state.cases.filter(x => x.id !== caseId);
  if (currentCaseId === caseId) closeCaseView();
  saveState(true); renderAdminUI(); renderCasesList();
}

// === МОДАЛКА ВЫИГРЫША ===
function showWinModal(itemsList) {
  lastWonItems = Array.isArray(itemsList) ? itemsList : [];
  const mc = document.querySelector('#win-modal .modal-content');
  mc.classList.toggle('multi-win-content', lastWonItems.length > 1);
  document.getElementById('win-modal-title').textContent = lastWonItems.length > 1 ? `Тебе выпало (${lastWonItems.length}):` : 'Тебе выпало!';
  document.getElementById('win-card-container').innerHTML = lastWonItems.map(e => createCardHTML(e.card, e.edition, e.wear)).join('');
  const totalPrice = lastWonItems.reduce((s, e) => s + getSkinPrice(e.card, e.edition, e.wear), 0);
  const sellBtn = document.getElementById('sell-won-btn');
  sellBtn.textContent = lastWonItems.length > 1 ? `Продать все за ${totalPrice} ₽` : `Продать за ${totalPrice} ₽`;
  sellBtn.disabled = totalPrice <= 0;
  document.getElementById('win-modal').classList.remove('hidden');
}

function closeWinModal() { SoundFX.click(); lastWonItems = []; document.getElementById('win-modal').classList.add('hidden'); }

function sellWonCard() {
  if (!lastWonItems.length) return;
  const uids = new Set(lastWonItems.map(x => x.uid));
  let earned = 0;
  state.inventory = state.inventory.filter(it => {
    if (uids.has(it.uid)) {
      const c = getCardById(it.cardId);
      if (c) earned += getSkinPrice(c, it.edition || 'normal', it.wear || 'FN');
      return false;
    }
    return true;
  });
  if (earned > 0) { SoundFX.sell(); state.balance += earned; saveState(false); }
  closeWinModal();
}

// === СТАРТОВЫЙ БАЛАНС & ЗАПУСК ===
function openStartBalanceModal() { setStartBalanceValue(MAX_START_BALANCE); document.getElementById('start-balance-modal').classList.remove('hidden'); }
function setStartBalanceValue(val) {
  const n = Math.max(MIN_START_BALANCE, Math.min(MAX_START_BALANCE, Math.floor(Number(val) || MAX_START_BALANCE)));
  document.getElementById('start-balance-display').textContent = String(n);
  document.getElementById('start-balance-range').value = String(n);
  document.getElementById('start-balance-input').value = String(n);
}
function syncStartBalanceFromRange(v) { setStartBalanceValue(v); }
function syncStartBalanceFromInput(v) { setStartBalanceValue(v); }
function confirmStartBalance() {
  state.balance = Math.max(MIN_START_BALANCE, Math.min(MAX_START_BALANCE, Math.floor(Number(document.getElementById('start-balance-input').value) || MAX_START_BALANCE)));
  saveState(false);
  SoundFX.sell();
  document.getElementById('start-balance-modal').classList.add('hidden');
}

updateTopBar();
updateCloudSyncBadge();
updateSoundUI();
renderNewRarityColorInputs();
renderCasesList();
if (isBrandNewPlayer) openStartBalanceModal();
if (!hasLocalCatalogEdits) syncCatalogFromCloud(false);
