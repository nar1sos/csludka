const SHARED_CLOUD_CONFIG = {
  binId: '6b0976891b390e1b559b54e3',
  apiKey: '$2a$10$uCgH40cdceLb9NZh7JtgyOcaiU1.fdgpinEa09JSQcj2V.ZYDPOfG'
};

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
    skinPass(stepIndex = 0) {
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
  skins: localStorage.getItem('cs_cards') ? JSON.parse(localStorage.getItem('cs_cards')) : JSON.parse(JSON.stringify(DEFAULT_CARDS)),
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
let isDuelRunning = false;
let duelBotCount = 1;
let duelCompetitors = [];
let rouletteSoundRafId = null;
let lastWonItems = [];
let editingSkinId = null;
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

let rarityMapCache = new Map();
let skinMapCache = new Map();
let wearMapCache = new Map();

function rebuildLookupCaches() {
  rarityMapCache = new Map(state.rarities.map(r => [r.id, r]));
  skinMapCache = new Map(state.skins.map(s => [s.id, s]));
  wearMapCache = new Map(state.wears.map(w => [w.code, w]));
}

function getRarityObj(id) { return rarityMapCache.get(id) || state.rarities[state.rarities.length - 1] || state.rarities[0]; }
function getSkinById(id) { return skinMapCache.get(id); }
function getWearObj(code) { return wearMapCache.get(code) || state.wears[0] || { code: 'FN', label: 'Factory New', priceMult: 1, weight: 100 }; }

function getRarityGradientColors(rar) {
  if (!rar) return ['#4b69ff', '#14161c'];
  if (Array.isArray(rar.gradientColors) && rar.gradientColors.length > 0) return rar.gradientColors.slice(0, 5);
  return [rar.color || '#4b69ff', rar.bg || '#14161c'];
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
    r.order = total - idx;
    const gColors = getRarityGradientColors(r);
    r.color = gColors[0];
    r.bg = gColors[gColors.length - 1];
  });
  if (state.rarities.reduce((s, r) => s + r.weight, 0) <= 0) {
    state.rarities[state.rarities.length - 1].weight = 100;
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
  localStorage.setItem('cs_cards', JSON.stringify(state.skins));
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

function rollEditionForSkin(skin) {
  if (!skin) return 'normal';
  const canSouv = Boolean(skin.hasSouvenir);
  const canSt = Boolean(skin.hasStatTrak);

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

function getSkinPrice(skin, edition = 'normal', wearCode = 'FN') {
  if (!skin) return 0;
  const base = Number(skin.price || 0);
  const wearMult = Number(getWearObj(wearCode)?.priceMult ?? 1);
  let edMult = 1;
  if (edition === 'stattrak') edMult = Number(state.statTrakMultiplier) || 1.8;
  if (edition === 'souvenir') edMult = Number(state.souvenirMultiplier) || 3.5;
  return Math.max(1, Math.round(base * wearMult * edMult));
}

function formatSkinTitle(skin) {
  const w = (skin.weapon || '').trim();
  const n = (skin.name || '').trim();
  if (w && n) return `${w} | ${n}`;
  return n || w || 'Skin';
}

function sortItems(items, sortMode) {
  return [...items].sort((a, b) => {
    const skinA = a.skin || a;
    const skinB = b.skin || b;
    const priceA = getSkinPrice(skinA, a.edition || 'normal', a.wear || 'FN');
    const priceB = getSkinPrice(skinB, b.edition || 'normal', b.wear || 'FN');
    const rarA = Number(getRarityObj(skinA.rarity)?.order || 0);
    const rarB = Number(getRarityObj(skinB.rarity)?.order || 0);

    if (sortMode === 'price-desc') return priceB - priceA;
    if (sortMode === 'price-asc') return priceA - priceB;
    if (sortMode === 'rarity-desc') return rarB - rarA || priceB - priceA;
    if (sortMode === 'rarity-asc') return rarA - rarB || priceA - priceB;
    return 0;
  });
}

// === ПЛИТКА СКИНА В ТОЧНОМ СТИЛЕ СКРИНШОТА ===
function createSkinTileHTML(skin, edition = 'normal', wearCode = 'FN', extraClass = '', clickAttr = '', actionBtnHTML = '') {
  const rar = getRarityObj(skin.rarity);
  const price = getSkinPrice(skin, edition, wearCode);
  const edClass = edition === 'souvenir' ? 'is-souvenir' : edition === 'stattrak' ? 'is-stattrak' : '';

  const badges = [];
  if (edition === 'stattrak') badges.push('<span class="st-pill">ST™</span>');
  if (edition === 'souvenir') badges.push('<span class="souv-pill">★ SOUV</span>');

  return `
    <div class="card-wrap">
      <div class="cs-skin-card ${edClass} ${extraClass}"
           style="--rar-color: ${rar.color};"
           ${clickAttr}>
        <div class="skin-card-top">
          <span class="wear-badge">${wearCode}</span>
          <span class="rarity-label-top">${rar.name}</span>
        </div>
        <div class="skin-img-frame">
          <img loading="lazy" decoding="async" draggable="false" src="${skin.img}" alt="${formatSkinTitle(skin)}" onerror="this.src='https://placehold.co/320x200/181a20/ef4444?text=${encodeURIComponent(formatSkinTitle(skin))}'">
        </div>
        <div class="skin-text-block">
          <div class="skin-weapon-line">${skin.weapon || 'Weapon'}</div>
          <div class="skin-name-line">${skin.name}</div>
        </div>
        <div class="skin-footer-line">
          <span class="skin-price-val">${price} ₽</span>
          <div>${badges.join('')}</div>
        </div>
      </div>
      ${actionBtnHTML}
    </div>
  `;
}

function createUpgradeSquareTileHTML(skin, edition = 'normal', wearCode = 'FN', isSelected = false, clickAttr = '', extraAttr = '') {
  const rar = getRarityObj(skin.rarity);
  const price = getSkinPrice(skin, edition, wearCode);
  const selClass = isSelected ? 'selected' : '';
  const edTag = edition === 'souvenir' ? 'SOUV ' : edition === 'stattrak' ? 'ST ' : '';

  return `
    <div class="upg-square-tile ${selClass}"
         style="--rar-color: ${rar.color};"
         ${extraAttr}
         ${clickAttr}>
      <div class="upg-tile-top">
        <span class="upg-tile-price">${price} ₽</span>
        <span class="wear-badge" style="font-size:9px;padding:1px 4px;">${edTag}${wearCode}</span>
      </div>
      <img class="upg-tile-img" loading="lazy" decoding="async" draggable="false" src="${skin.img}" alt="${formatSkinTitle(skin)}" onerror="this.src='https://placehold.co/320x200/181a20/ffffff?text=CS'">
      <div class="upg-tile-name">${formatSkinTitle(skin)}</div>
    </div>
  `;
}

function appendEmptyUpgradeSlots(container, itemCount, minRows = 3) {
  if (!container) return;
  const width = container.getBoundingClientRect().width;
  const cols = width ? Math.max(2, Math.floor((width + 8) / 120)) : 4;
  const totalSlots = Math.max(minRows, Math.ceil(itemCount / cols)) * cols;
  const emptyCount = Math.max(0, totalSlots - itemCount);
  for (let i = 0; i < emptyCount; i++) {
    const d = document.createElement('div');
    d.className = 'upg-empty-tile';
    container.appendChild(d);
  }
}

function giveSkinToPlayer(skin, edition = 'normal', wearCode = 'FN') {
  const item = {
    uid: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    cardId: skin.id,
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
      cards: state.skins,
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

    if (Array.isArray(cat.cards) && cat.cards.length > 0) state.skins = cat.cards;
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

function buildMultiRouletteTracks(caseObj, winners = null) {
  const container = document.getElementById('roulettes-multi-container');
  if (!container || !caseObj) return;

  const pool = caseObj.cardIds.map(getSkinById).filter(Boolean);
  if (pool.length === 0) { container.innerHTML = ''; return; }

  let html = '';
  for (let row = 0; row < caseOpenCount; row++) {
    const win = winners && winners[row] ? winners[row] : null;
    let skinsHtml = '';
    for (let i = 0; i < 45; i++) {
      if (i === 38 && win) {
        skinsHtml += createSkinTileHTML(win.skin, win.edition, win.wear);
      } else {
        const rnd = pool[Math.floor(Math.random() * pool.length)];
        skinsHtml += createSkinTileHTML(rnd, rollEditionForSkin(rnd), rollWearCode());
      }
    }
    html += `
      <div class="roulette-wrapper">
        <div class="roulette-pointer"></div>
        <div id="roulette-track-${row}" class="roulette-track">${skinsHtml}</div>
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
  const skins = c.cardIds.map(getSkinById).filter(Boolean);
  document.getElementById('case-contents-grid').innerHTML = sortItems(skins, sortMode).map(skin => createSkinTileHTML(skin, 'normal', 'FN')).join('');
}

function rollWeightedSkin(poolSkins) {
  let totalW = 0;
  const weighted = poolSkins.map(skin => {
    const rar = getRarityObj(skin.rarity);
    const w = sanitizeChanceInput(rar?.weight);
    totalW += w;
    return { skin, w };
  });
  if (totalW <= 0) return poolSkins[Math.floor(Math.random() * poolSkins.length)];
  let r = Math.random() * totalW;
  for (const item of weighted) {
    if (r < item.w) return item.skin;
    r -= item.w;
  }
  return poolSkins[poolSkins.length - 1];
}

function getRouletteStepWidth() {
  const firstTile = document.querySelector('.roulette-track .card-wrap');
  const trackEl = firstTile ? firstTile.parentElement : null;
  const tileW = firstTile ? firstTile.getBoundingClientRect().width : 195;
  let gapW = 12;
  if (trackEl) {
    const g = parseFloat(getComputedStyle(trackEl).columnGap || getComputedStyle(trackEl).gap);
    if (Number.isFinite(g) && g >= 0) gapW = g;
  }
  return { tileW, stepW: tileW + gapW };
}

function setCaseControlsDisabled(disabled) {
  document.getElementById('spin-case-btn').disabled = disabled;
  document.getElementById('fast-spin-btn').disabled = disabled;
  document.querySelectorAll('#case-count-selector .count-chip').forEach(btn => { btn.disabled = disabled; });
}

function stopRouletteSkinSoundTracker() {
  if (rouletteSoundRafId !== null) { cancelAnimationFrame(rouletteSoundRafId); rouletteSoundRafId = null; }
}

function trackRouletteSkinsPassingPointer(durationSec, isActiveCheck = () => isSpinning, trackId = 'roulette-track-0') {
  stopRouletteSkinSoundTracker();
  const track = document.getElementById(trackId);
  const pointer = track?.parentElement?.querySelector('.roulette-pointer');
  if (!track || !pointer) return;
  const items = Array.from(track.querySelectorAll('.card-wrap'));
  if (!items.length) return;

  const startTime = performance.now();
  const durationMs = durationSec * 1000;
  let lastIdx = -1;

  function check() {
    const px = pointer.getBoundingClientRect().left;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (rect.left + rect.width * 0.5 <= px && i > lastIdx) {
        lastIdx = i;
        SoundFX.skinPass(i);
      }
    }
  }

  function frame(now) {
    check();
    if (now - startTime < durationMs + 60 && isActiveCheck()) rouletteSoundRafId = requestAnimationFrame(frame);
    else { check(); stopRouletteSkinSoundTracker(); }
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

  const pool = c.cardIds.map(getSkinById).filter(Boolean);
  if (!pool.length) return;

  state.balance -= totalCost;
  state.stats.opened += count;
  saveState(false);

  const winners = [];
  for (let i = 0; i < count; i++) {
    const skin = rollWeightedSkin(pool);
    winners.push({ skin, edition: rollEditionForSkin(skin), wear: rollWearCode() });
  }

  buildMultiRouletteTracks(c, winners);
  isSpinning = true;
  setCaseControlsDisabled(true);

  const { tileW, stepW } = getRouletteStepWidth();
  const durationSec = fast ? 0.85 : 4.2;

  setTimeout(() => {
    for (let row = 0; row < count; row++) {
      const track = document.getElementById(`roulette-track-${row}`);
      if (!track) continue;
      const jitter = Math.random() * Math.min(24, tileW * 0.16) - Math.min(12, tileW * 0.08);
      const offset = 38 * stepW + jitter + tileW / 2;
      track.style.transition = `transform ${durationSec}s cubic-bezier(0.12, 0.88, 0.22, 1)`;
      track.style.transform = `translateX(-${offset}px)`;
    }
    trackRouletteSkinsPassingPointer(durationSec, () => isSpinning, 'roulette-track-0');
  }, 30);

  setTimeout(() => {
    stopRouletteSkinSoundTracker();
    isSpinning = false;
    setCaseControlsDisabled(false);
    const addedEntries = winners.map(w => {
      const added = giveSkinToPlayer(w.skin, w.edition, w.wear);
      return { ...w, uid: added.uid };
    });
    SoundFX.win(addedEntries.some(e => e.edition !== 'normal'));
    showWinModal(addedEntries);
  }, fast ? 950 : 4350);
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
  const mapped = state.inventory.map(item => ({ ...item, skin: getSkinById(item.cardId) })).filter(x => x.skin);
  const sorted = sortItems(mapped, sortMode);

  const grid = document.getElementById('upgrade-my-cards');
  grid.innerHTML = '';
  sorted.forEach(item => {
    const d = document.createElement('div');
    d.innerHTML = createUpgradeSquareTileHTML(
      item.skin,
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
  state.skins.forEach(skin => {
    editions.forEach(ed => {
      if (ed === 'stattrak' && !skin.hasStatTrak) return;
      if (ed === 'souvenir' && !skin.hasSouvenir) return;
      targets.push({ skin, edition: ed, wear: wearCode });
    });
  });

  if (searchQ) {
    targets = targets.filter(t => formatSkinTitle(t.skin).toLowerCase().includes(searchQ));
  }

  const sorted = sortItems(targets, sortMode);
  document.getElementById('upg-targets-count').textContent = sorted.length;

  const grid = document.getElementById('upgrade-target-cards');
  grid.innerHTML = '';
  sorted.forEach(t => {
    const sel = t.skin.id === upgSelectedTargetId && t.edition === upgSelectedTargetEdition && t.wear === upgSelectedTargetWear;
    const d = document.createElement('div');
    d.innerHTML = createUpgradeSquareTileHTML(
      t.skin,
      t.edition,
      t.wear,
      sel,
      `onclick="selectUpgradeTarget('${t.skin.id}', '${t.edition}', '${t.wear}')"`,
      `data-upg-target="${t.skin.id}_${t.edition}_${t.wear}"`
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

function selectUpgradeTarget(skinId, edition, wear) {
  if (isUpgrading) return;
  SoundFX.click();
  upgSelectedTargetId = skinId;
  upgSelectedTargetEdition = edition;
  upgSelectedTargetWear = wear;
  const key = `${skinId}_${edition}_${wear}`;
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
  const srcSkin = srcItem ? getSkinById(srcItem.cardId) : null;
  const tgtSkin = upgSelectedTargetId ? getSkinById(upgSelectedTargetId) : null;

  srcSlot.innerHTML = srcSkin ? createSkinTileHTML(srcSkin, srcItem.edition || 'normal', srcItem.wear || 'FN') : 'Выбери скин снизу';
  tgtSlot.innerHTML = tgtSkin ? createSkinTileHTML(tgtSkin, upgSelectedTargetEdition, upgSelectedTargetWear) : 'Выбери цель справа';

  if (srcSkin && tgtSkin) {
    const sPrice = getSkinPrice(srcSkin, srcItem.edition || 'normal', srcItem.wear || 'FN');
    const tPrice = getSkinPrice(tgtSkin, upgSelectedTargetEdition, upgSelectedTargetWear);
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
  const srcSkin = getSkinById(srcItem.cardId);
  const tgtSkin = getSkinById(upgSelectedTargetId);
  if (!srcSkin || !tgtSkin) return;

  const chance = calculateUpgradeChance(
    getSkinPrice(srcSkin, srcItem.edition || 'normal', srcItem.wear || 'FN'),
    getSkinPrice(tgtSkin, upgSelectedTargetEdition, upgSelectedTargetWear)
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
      giveSkinToPlayer(tgtSkin, upgSelectedTargetEdition, upgSelectedTargetWear);
      msg.innerHTML = `<span style="color:#4ade80;font-weight:800;">УСПЕХ! Выпал ${formatSkinTitle(tgtSkin)}</span>`;
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
  const playable = state.cases.filter(c => c.cardIds.map(getSkinById).filter(Boolean).length > 0);
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
  const playable = state.cases.filter(c => c.cardIds.map(getSkinById).filter(Boolean).length > 0);
  if (!playable.length) return;

  state.balance -= playerCase.price;
  state.stats.opened += 1 + duelBotCount;
  saveState(false);

  duelCompetitors = [{
    id: 'player', name: state.nickname, isPlayer: true, caseObj: playerCase,
    pool: playerCase.cardIds.map(getSkinById).filter(Boolean)
  }];
  for (let i = 0; i < duelBotCount; i++) {
    const bc = playable[Math.floor(Math.random() * playable.length)];
    duelCompetitors.push({
      id: 'bot_' + i, name: DUEL_BOT_NAMES[i], isPlayer: false, caseObj: bc,
      pool: bc.cardIds.map(getSkinById).filter(Boolean)
    });
  }

  duelCompetitors.forEach(comp => {
    const skin = rollWeightedSkin(comp.pool);
    const edition = rollEditionForSkin(skin);
    const wear = rollWearCode();
    comp.winnerEntry = { skin, edition, wear };
    comp.score = getSkinPrice(skin, edition, wear) + (Number(getRarityObj(skin.rarity)?.order || 0) * 100000);
  });

  document.getElementById('duel-case-select-view').classList.add('hidden');
  document.getElementById('duel-arena-view').classList.remove('hidden');
  document.getElementById('duel-rematch-btn').classList.add('hidden');
  document.getElementById('duel-verdict-banner').textContent = 'Крутим рулетки...';

  document.getElementById('duel-competitors-grid').innerHTML = duelCompetitors.map((comp, idx) => {
    let skinsHtml = '';
    for (let i = 0; i < 45; i++) {
      if (i === 38) skinsHtml += createSkinTileHTML(comp.winnerEntry.skin, comp.winnerEntry.edition, comp.winnerEntry.wear);
      else {
        const rnd = comp.pool[Math.floor(Math.random() * comp.pool.length)];
        skinsHtml += createSkinTileHTML(rnd, rollEditionForSkin(rnd), rollWearCode());
      }
    }
    return `
      <div id="duel-lane-${idx}" class="duel-lane">
        <div class="duel-lane-head"><b>${comp.name}</b><span class="duel-lane-case">${comp.caseObj.name}</span></div>
        <div class="duel-roulette-box"><div class="roulette-pointer"></div><div id="duel-track-${idx}" class="duel-roulette-track">${skinsHtml}</div></div>
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
      track.style.transform = `translateX(-${38 * 182 + 85}px)`;
    });
    trackRouletteSkinsPassingPointer(4.2, () => isDuelRunning, 'duel-track-0');
  }, 30);

  setTimeout(() => {
    stopRouletteSkinSoundTracker();
    const maxScore = Math.max(...duelCompetitors.map(c => c.score));
    const winners = duelCompetitors.filter(c => c.score === maxScore);
    const playerWon = winners.some(w => w.isPlayer) && winners.length === 1;

    duelCompetitors.forEach((comp, idx) => {
      const price = getSkinPrice(comp.winnerEntry.skin, comp.winnerEntry.edition, comp.winnerEntry.wear);
      document.getElementById(`duel-lane-result-${idx}`).textContent = `${formatSkinTitle(comp.winnerEntry.skin)} (${comp.winnerEntry.wear}) — ${price} ₽`;
      if (winners.some(w => w.id === comp.id)) document.getElementById(`duel-lane-${idx}`).classList.add('is-winner');
    });

    const verdict = document.getElementById('duel-verdict-banner');
    if (playerWon) {
      SoundFX.win(true);
      giveSkinToPlayer(duelCompetitors[0].winnerEntry.skin, duelCompetitors[0].winnerEntry.edition, duelCompetitors[0].winnerEntry.wear);
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
function toggleTradeSkin(uid) {
  SoundFX.click();
  const idx = tradeMyOfferUids.indexOf(uid);
  if (idx > -1) tradeMyOfferUids.splice(idx, 1); else tradeMyOfferUids.push(uid);
  let mySum = 0;
  tradeMyOfferUids.forEach(id => {
    const it = state.inventory.find(x => x.uid === id);
    const s = it && getSkinById(it.cardId);
    if (s) mySum += getSkinPrice(s, it.edition || 'normal', it.wear || 'FN');
  });
  let budget = Math.floor(mySum * 0.95);
  tradeBotOffer = [];
  if (budget > 0 && state.skins.length > 0) {
    const sorted = [...state.skins].sort((a, b) => b.price - a.price);
    for (let g = 0; g < 10 && budget >= 20; g++) {
      const avail = sorted.filter(s => getSkinPrice(s, 'normal', 'FT') <= budget);
      if (!avail.length) break;
      const pick = avail[Math.floor(Math.random() * Math.min(3, avail.length))];
      const ed = rollEditionForSkin(pick);
      const wr = rollWearCode();
      const pr = getSkinPrice(pick, ed, wr);
      if (pr <= budget) { tradeBotOffer.push({ skin: pick, edition: ed, wear: wr }); budget -= pr; }
    }
  }
  renderTradeUI();
}
function renderTradeUI() {
  let mySum = 0;
  document.getElementById('my-trade-offer').innerHTML = tradeMyOfferUids.map(uid => {
    const it = state.inventory.find(x => x.uid === uid);
    const s = it && getSkinById(it.cardId);
    if (!s) return '';
    mySum += getSkinPrice(s, it.edition || 'normal', it.wear || 'FN');
    return createSkinTileHTML(s, it.edition || 'normal', it.wear || 'FN', '', `onclick="toggleTradeSkin('${uid}')"`);
  }).join('') || '<div class="hint-text">Выбери скины снизу</div>';

  let botSum = 0;
  document.getElementById('bot-trade-offer').innerHTML = tradeBotOffer.map(b => {
    botSum += getSkinPrice(b.skin, b.edition, b.wear);
    return createSkinTileHTML(b.skin, b.edition, b.wear);
  }).join('') || '<div class="hint-text">Предложение бота</div>';

  document.getElementById('my-trade-sum').textContent = mySum;
  document.getElementById('bot-trade-sum').textContent = botSum;

  const avail = state.inventory.map(it => ({ ...it, skin: getSkinById(it.cardId) })).filter(x => x.skin && !tradeMyOfferUids.includes(x.uid));
  document.getElementById('trade-inv-count').textContent = avail.length;
  document.getElementById('trade-my-inv').innerHTML = avail.map(it => createSkinTileHTML(it.skin, it.edition || 'normal', it.wear || 'FN', '', `onclick="toggleTradeSkin('${it.uid}')"`)).join('') || '<div class="hint-text">Нет скинов для обмена</div>';
  document.getElementById('confirm-trade-btn').disabled = !(mySum > 0 && tradeBotOffer.length > 0);
}
function confirmTrade() {
  SoundFX.trade();
  state.inventory = state.inventory.filter(x => !tradeMyOfferUids.includes(x.uid));
  tradeBotOffer.forEach(b => giveSkinToPlayer(b.skin, b.edition, b.wear));
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
  const mapped = state.inventory.map(it => ({ ...it, skin: getSkinById(it.cardId) })).filter(x => x.skin);
  const totalVal = mapped.reduce((s, x) => s + getSkinPrice(x.skin, x.edition || 'normal', x.wear || 'FN'), 0);

  document.getElementById('stat-total-cards').textContent = mapped.length;
  document.getElementById('stat-inv-value').textContent = totalVal + ' ₽';
  document.getElementById('stat-opened').textContent = state.stats.opened;
  document.getElementById('stat-upgrades').textContent = state.stats.upgrades;

  document.getElementById('collection-grid').innerHTML = sortItems(mapped, sortMode).map(item => {
    const ed = item.edition || 'normal';
    const wr = item.wear || 'FN';
    const price = getSkinPrice(item.skin, ed, wr);
    const sellBtn = `<button class="secondary-btn" style="width:100%;margin-top:6px;padding:6px 8px;font-size:11px;" onclick="event.stopPropagation(); sellInventorySkin('${item.uid}')">Продать за ${price} ₽</button>`;
    return createSkinTileHTML(item.skin, ed, wr, '', `onclick="openSkinImageModal('${item.skin.id}')"`, sellBtn);
  }).join('');
}

function sellInventorySkin(uid) {
  const idx = state.inventory.findIndex(x => x.uid === uid);
  if (idx === -1) return;
  const it = state.inventory[idx];
  const s = getSkinById(it.cardId);
  if (s) { SoundFX.sell(); state.balance += getSkinPrice(s, it.edition || 'normal', it.wear || 'FN'); }
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
      const s = getSkinById(it.cardId);
      if (s) earned += getSkinPrice(s, it.edition || 'normal', it.wear || 'FN');
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
    const s = getSkinById(it.cardId);
    if (s && s.rarity === rid) { earned += getSkinPrice(s, it.edition || 'normal', it.wear || 'FN'); return false; }
    return true;
  });
  if (earned > 0) { SoundFX.sell(); state.balance += earned; saveState(false); renderCollection(); }
}

function sellAllInventoryCards() {
  let earned = 0;
  state.inventory.forEach(it => {
    const s = getSkinById(it.cardId);
    if (s) earned += getSkinPrice(s, it.edition || 'normal', it.wear || 'FN');
  });
  if (earned > 0) SoundFX.sell();
  state.inventory = [];
  state.balance += earned;
  saveState(false);
  renderCollection();
}

// === КОНТРАКТЫ ===
function renderCraftUI() {
  const mapped = state.inventory.map(it => ({ ...it, skin: getSkinById(it.cardId) })).filter(x => x.skin);
  document.getElementById('craft-inv-grid').innerHTML = sortItems(mapped, document.getElementById('craft-sort').value).map(it =>
    createSkinTileHTML(it.skin, it.edition || 'normal', it.wear || 'FN', craftSelectedUids.includes(it.uid) ? 'selected' : '', `onclick="toggleCraftSkin('${it.uid}')"`)
  ).join('');

  let sum = 0;
  let slots = '';
  for (let i = 0; i < 10; i++) {
    const uid = craftSelectedUids[i];
    if (uid) {
      const it = state.inventory.find(x => x.uid === uid);
      const s = it && getSkinById(it.cardId);
      if (s) sum += getSkinPrice(s, it.edition || 'normal', it.wear || 'FN');
      slots += `<div class="craft-mini-slot" onclick="toggleCraftSkin('${uid}')"><img src="${s?.img || ''}" style="width:100%;height:100%;object-fit:contain;"></div>`;
    } else slots += `<div class="craft-mini-slot">${i + 1}</div>`;
  }
  document.getElementById('craft-selected-slots').innerHTML = slots;
  document.getElementById('craft-count').textContent = craftSelectedUids.length;
  document.getElementById('craft-avg-price').textContent = craftSelectedUids.length ? Math.round(sum / craftSelectedUids.length) : 0;
  document.getElementById('do-craft-btn').disabled = craftSelectedUids.length !== 10;
}

function toggleCraftSkin(uid) {
  SoundFX.click();
  const idx = craftSelectedUids.indexOf(uid);
  if (idx > -1) { craftSelectedUids.splice(idx, 1); }
  else {
    if (craftSelectedUids.length >= 10) return;
    if (craftSelectedUids.length > 0) {
      const firstS = getSkinById(state.inventory.find(x => x.uid === craftSelectedUids[0])?.cardId);
      const nextS = getSkinById(state.inventory.find(x => x.uid === uid)?.cardId);
      if (firstS?.rarity !== nextS?.rarity) return;
    }
    craftSelectedUids.push(uid);
  }
  renderCraftUI();
}

function executeCraft() {
  if (craftSelectedUids.length !== 10) return;
  const firstS = getSkinById(state.inventory.find(x => x.uid === craftSelectedUids[0])?.cardId);
  const curRar = getRarityObj(firstS?.rarity);
  const nextRar = [...state.rarities].sort((a, b) => a.order - b.order).find(r => r.order > curRar.order) || curRar;
  const pool = state.skins.filter(s => s.rarity === nextRar.id);
  const crafted = (pool.length ? pool : state.skins)[Math.floor(Math.random() * (pool.length || state.skins.length))];
  const ed = rollEditionForSkin(crafted);
  const wr = rollWearCode();

  state.inventory = state.inventory.filter(x => !craftSelectedUids.includes(x.uid));
  craftSelectedUids = [];
  const added = giveSkinToPlayer(crafted, ed, wr);
  SoundFX.win(ed !== 'normal');
  showWinModal([{ skin: crafted, edition: ed, wear: wr, uid: added.uid }]);
  renderCraftUI();
}

// === ПРОСМОТР ТОЛЬКО КАРТИНКИ СКИНА В ИНВЕНТАРЕ ===
function openSkinImageModal(skinId) {
  const skin = getSkinById(skinId);
  if (!skin) return;
  SoundFX.click();
  const img = document.getElementById('skin-preview-only-img');
  img.src = skin.img;
  img.alt = formatSkinTitle(skin);
  document.getElementById('skin-preview-modal').classList.remove('hidden');
}

function closeSkinPreviewModal(e) {
  if (e && e.target !== document.getElementById('skin-preview-modal')) return;
  document.getElementById('skin-preview-modal').classList.add('hidden');
}

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
  updateSkinPreview();
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
    <div class="rar-manage-card" style="--rar-color:${r.color};">
      <div class="rar-manage-top"><span style="color:${r.color}">${r.name}</span><button onclick="adminDeleteRarity('${r.id}')" style="background:none;border:none;color:#f87171;cursor:pointer;">✕</button></div>
      <div class="rar-chance-row"><span>Шанс:</span><input type="text" value="${r.weight}" onchange="updateRarityWeight('${r.id}', this.value)"></div>
    </div>
  `).join('');

  document.getElementById('admin-case-skins-selector').innerHTML = state.skins.map(s => `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;"><input type="checkbox" class="case-skin-cb" value="${s.id}"> ${formatSkinTitle(s)}</label>
  `).join('');

  renderAdminCasesList();
  updateCasePreview();

  document.getElementById('admin-skins-count').textContent = state.skins.length;
  document.getElementById('admin-all-skins').innerHTML = state.skins.map(s => {
    const ed = s.hasSouvenir ? 'souvenir' : s.hasStatTrak ? 'stattrak' : 'normal';
    const delBtn = `<button class="secondary-btn" style="width:100%;margin-top:6px;padding:6px 8px;font-size:11px;color:#f87171;" onclick="event.stopPropagation(); adminDeleteSkin('${s.id}')">Удалить</button>`;
    return createSkinTileHTML(s, ed, 'FN', s.id === editingSkinId ? 'selected' : '', `onclick="openEditSkinPanel('${s.id}')"`, delBtn);
  }).join('');

  updateSkinPreview();
}

function updateRarityWeight(id, val) {
  const r = state.rarities.find(x => x.id === id);
  if (!r) return;
  r.weight = sanitizeChanceInput(val);
  saveState(true); renderAdminUI();
}

function adminAddRarity() {
  const name = document.getElementById('new-rar-name').value.trim();
  if (!name) return;
  const gradColors = Array.from(document.querySelectorAll('#new-rar-colors-box .new-rar-grad-color')).map(i => i.value);
  const weight = sanitizeChanceInput(document.getElementById('new-rar-weight').value);
  const id = name.toLowerCase().replace(/\s+/g, '_');
  state.rarities.push({ id, name, color: gradColors[0], bg: gradColors[gradColors.length - 1], gradientColors: gradColors, order: 1, weight });
  saveState(true); renderAdminUI();
}

function adminDeleteRarity(id) {
  if (state.rarities.length <= 1) return;
  state.rarities = state.rarities.filter(r => r.id !== id);
  saveState(true); renderAdminUI();
}

function updateSkinPreview() {
  const box = document.getElementById('skin-creator-preview');
  if (!box) return;
  const sample = {
    id: 'prev',
    weapon: document.getElementById('new-skin-weapon').value.trim() || 'AK-47',
    name: document.getElementById('new-skin-name').value.trim() || 'Redline',
    rarity: document.getElementById('new-skin-rarity').value || state.rarities[0].id,
    price: Number(document.getElementById('new-skin-price').value) || 1200,
    hasStatTrak: Boolean(document.getElementById('new-skin-has-st').checked),
    hasSouvenir: Boolean(document.getElementById('new-skin-has-souv').checked),
    img: document.getElementById('new-skin-img').value.trim() || 'https://placehold.co/320x200/181a20/ef4444?text=AK-47+%7C+Redline'
  };
  const ed = document.getElementById('preview-edition')?.value || 'normal';
  const wr = document.getElementById('preview-wear')?.value || 'FT';
  box.innerHTML = createSkinTileHTML(sample, ed, wr);
}

function adminAddSkin() {
  const weapon = document.getElementById('new-skin-weapon').value.trim() || 'Weapon';
  const name = document.getElementById('new-skin-name').value.trim();
  if (!name) return;
  state.skins.push({
    id: 's_' + Date.now(),
    weapon,
    name,
    rarity: document.getElementById('new-skin-rarity').value,
    price: Number(document.getElementById('new-skin-price').value) || 1000,
    hasStatTrak: Boolean(document.getElementById('new-skin-has-st').checked),
    hasSouvenir: Boolean(document.getElementById('new-skin-has-souv').checked),
    img: document.getElementById('new-skin-img').value.trim() || `https://placehold.co/320x200/181a20/ef4444?text=${encodeURIComponent(weapon + ' | ' + name)}`
  });
  saveState(true); renderAdminUI();
}

function openEditSkinPanel(id) {
  const s = getSkinById(id);
  if (!s) return;
  editingSkinId = id;
  document.getElementById('admin-edit-skin-panel').classList.remove('hidden');
  document.getElementById('edit-skin-heading').textContent = formatSkinTitle(s);
  document.getElementById('edit-skin-weapon').value = s.weapon || '';
  document.getElementById('edit-skin-name').value = s.name || '';
  document.getElementById('edit-skin-rarity').value = s.rarity;
  document.getElementById('edit-skin-price').value = s.price || 1000;
  document.getElementById('edit-skin-img').value = s.img || '';
  document.getElementById('edit-skin-has-st').checked = Boolean(s.hasStatTrak);
  document.getElementById('edit-skin-has-souv').checked = Boolean(s.hasSouvenir);
  updateEditSkinPreview();
}

function cancelEditSkin() { editingSkinId = null; document.getElementById('admin-edit-skin-panel').classList.add('hidden'); }

function updateEditSkinPreview() {
  if (!editingSkinId) return;
  const sample = {
    id: editingSkinId,
    weapon: document.getElementById('edit-skin-weapon').value.trim(),
    name: document.getElementById('edit-skin-name').value.trim() || 'Skin',
    rarity: document.getElementById('edit-skin-rarity').value,
    price: Number(document.getElementById('edit-skin-price').value) || 1000,
    hasStatTrak: Boolean(document.getElementById('edit-skin-has-st').checked),
    hasSouvenir: Boolean(document.getElementById('edit-skin-has-souv').checked),
    img: document.getElementById('edit-skin-img').value.trim() || 'https://placehold.co/320x200/181a20/ffffff?text=CS+SKIN'
  };
  document.getElementById('edit-skin-preview').innerHTML = createSkinTileHTML(sample, sample.hasSouvenir ? 'souvenir' : sample.hasStatTrak ? 'stattrak' : 'normal', 'FN');
}

function saveEditedSkin() {
  const idx = state.skins.findIndex(s => s.id === editingSkinId);
  if (idx === -1) return;
  state.skins[idx] = {
    ...state.skins[idx],
    weapon: document.getElementById('edit-skin-weapon').value.trim(),
    name: document.getElementById('edit-skin-name').value.trim() || state.skins[idx].name,
    rarity: document.getElementById('edit-skin-rarity').value,
    price: Number(document.getElementById('edit-skin-price').value) || 1000,
    hasStatTrak: Boolean(document.getElementById('edit-skin-has-st').checked),
    hasSouvenir: Boolean(document.getElementById('edit-skin-has-souv').checked),
    img: document.getElementById('edit-skin-img').value.trim() || state.skins[idx].img
  };
  saveState(true); renderAdminUI();
}

function deleteEditingSkin() {
  if (!editingSkinId) return;
  adminDeleteSkin(editingSkinId);
  cancelEditSkin();
}

function adminDeleteSkin(id) {
  state.skins = state.skins.filter(s => s.id !== id);
  saveState(true); renderAdminUI();
}

function updateCasePreview() {
  const box = document.getElementById('case-creator-preview');
  if (!box) return;
  box.innerHTML = `<div class="case-item" style="width:100%;cursor:default;transform:none;"><img src="${document.getElementById('new-case-img').value.trim() || 'https://placehold.co/320x180/181a20/ffffff?text=CASE'}"><h3>${document.getElementById('new-case-name').value.trim() || 'Кейс'}</h3><div class="case-price-tag">${Number(document.getElementById('new-case-price').value) || 500} ₽</div></div>`;
}

function adminAddCase() {
  const name = document.getElementById('new-case-name').value.trim();
  const cardIds = Array.from(document.querySelectorAll('.case-skin-cb:checked')).map(cb => cb.value);
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
    <div class="admin-case-card">
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
  document.getElementById('admin-edit-case-skins-selector').innerHTML = state.skins.map(sk => `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;"><input type="checkbox" class="edit-case-skin-cb" value="${sk.id}" ${set.has(sk.id) ? 'checked' : ''}> ${formatSkinTitle(sk)}</label>
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
  const cardIds = Array.from(document.querySelectorAll('.edit-case-skin-cb:checked')).map(cb => cb.value);
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
  document.getElementById('win-skin-container').innerHTML = lastWonItems.map(e => createSkinTileHTML(e.skin, e.edition, e.wear)).join('');
  const totalPrice = lastWonItems.reduce((s, e) => s + getSkinPrice(e.skin, e.edition, e.wear), 0);
  const sellBtn = document.getElementById('sell-won-btn');
  sellBtn.textContent = lastWonItems.length > 1 ? `Продать все за ${totalPrice} ₽` : `Продать за ${totalPrice} ₽`;
  sellBtn.disabled = totalPrice <= 0;
  document.getElementById('win-modal').classList.remove('hidden');
}

function closeWinModal() { SoundFX.click(); lastWonItems = []; document.getElementById('win-modal').classList.add('hidden'); }

function sellWonSkin() {
  if (!lastWonItems.length) return;
  const uids = new Set(lastWonItems.map(x => x.uid));
  let earned = 0;
  state.inventory = state.inventory.filter(it => {
    if (uids.has(it.uid)) {
      const s = getSkinById(it.cardId);
      if (s) earned += getSkinPrice(s, it.edition || 'normal', it.wear || 'FN');
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
