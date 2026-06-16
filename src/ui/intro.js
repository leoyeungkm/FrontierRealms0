// ─── 開場：① 登入+宣誓王國 → ② 世界地圖(在線人數) → 出征 ──────
// 王國/領域對齊 fr0.world：領域 Aeloria、五王國 Minas United / Ledell /
// Calaadia / Dieudonne / Phoenix。暗色電影風 + 中英 i18n。
import { suiState, onSuiChange, connectWallet, connectZkLogin, refreshCosmetics } from '../sui/wallet.js';
import { listGear, buyGear, delistGear, fetchListings } from '../sui/gearmarket.js';
import { suiEnabled, SUI_NETWORK } from '../sui/config.js';
import { appearance, setSuiAddress } from './appearance.js';
import { t, applyI18n, toggleLang, onLangChange } from './i18n.js';
import { getMarket, getMyShares, buy, sell, redeem, toSui, estimateBuy, setActiveMarket, findLatestMarket } from '../sui/market.js';
import { initMapScene, disposeMapScene, focusKingdom } from './mapScene.js';
import { getMyCharacter, createCharacter, skillPointsForLevel, xpForNextLevel, listMyHeroes, setActiveCharacter, loadCharacter, applyXp, loadPending, clearPendingXp, removePendingRedeem } from '../sui/character.js';
import { initCharPreview, disposeCharPreview, captureHeroImage } from './charPreview.js';
import { setSkillBudget } from './skillTree.js';

const BET_SUI = 0.1;                // demo 預設買入額
const BET_AMTS = [0.1, 0.5, 1];     // 可選買入額（SUI）
let _betAmt = BET_SUI;              // 目前選的買入額
const _priceHist = [];             // Minas 機率歷史（畫 sparkline）
let _wbBusy = false;               // 交易中：暫停輪詢重繪
let _char = null;                  // 目前選定的角色（身分 + 等級）
let _creating = false;             // 是否在「建立新角色」模式
let _heroesCache = [];             // 已擁有的 Hero 清單（角色選擇用）
let _tab = 'market';               // 側欄分頁：market | nft
let _selectedMap = null;           // 目前選的戰場（國戰）
// 五王國（3D 戰略地圖用；目前只開放 Minas/Calaadia 交戰，其餘未開放）
const KINGDOMS = [
  { name: 'Minas United', color: 0x4f86d8, active: true,  terr: 3 },
  { name: 'Calaadia',     color: 0xd5494a, active: true,  terr: 3 },
  { name: 'Ledell',       color: 0x6ac0a0, active: false, terr: 1 },
  { name: 'Dieudonne',    color: 0xd6a95a, active: false, terr: 2 },
  { name: 'Phoenix',      color: 0xc06ad0, active: false, terr: 2 },
];
// 退回用的格狀地圖（WebGL 不可用時）。owner：0 Minas / 1 Calaadia / -1 戰場
const TERRITORIES = [
  { name: 'Aeloria', owner: -1, active: true },
  { name: 'Minas Vale', owner: 0 }, { name: 'Highmoor', owner: 0 }, { name: 'Ledell', owner: 0 }, { name: 'Dunmore', owner: 0 }, { name: 'Greywater', owner: 0 },
  { name: 'Calaadia', owner: 1 }, { name: 'Dieudonne', owner: 1 }, { name: 'Phoenix', owner: 1 }, { name: 'Ashfen', owner: 1 }, { name: 'Stormhold', owner: 1 },
];

// 兩大王國（對應遊戲藍/紅兩隊；宣誓效忠 → 服裝旗色 + War Bonds 押注對象）
// 索引固定：0 = Minas（藍/隊1）、1 = Calaadia（紅/隊2）——與合約 nation 索引一致
export const NATIONS = [
  { id: 'minas',    name: 'Minas United', short: 'Minas',    color: 0x4f86d8 }, // 藍
  { id: 'calaadia', name: 'Calaadia',     short: 'Calaadia', color: 0xd5494a }, // 紅
];
export let selectedNation = null;

const hex = c => '#' + c.toString(16).padStart(6, '0');

export function initIntro(opts = {}) {
  const { onEnter, queryServers } = opts;
  const screen = document.getElementById('intro-screen');
  if (!screen) { onEnter?.(); return; }
  const stageLogin = document.getElementById('intro-stage-login');
  const stageMap   = document.getElementById('intro-stage-map');
  const tomap  = document.getElementById('intro-tomap');
  const enter  = document.getElementById('intro-enter');
  let onMap = false, _pollTimer = null, _lastTotal = null, _online = false, _t1 = 0, _t2 = 0;

  applyI18n();
  _renderStatus();
  _refreshCharScreen();

  // 語言切換 → 重套靜態文字 + 重繪動態文字
  document.getElementById('intro-lang')?.addEventListener('click', toggleLang);
  onLangChange(() => {
    _renderStatus();
    _redraw();
    if (onMap) { _renderAllegiance(); _renderCharCard(); _renderEnter(); _renderWarBonds(); }
  });

  // ── 宣誓王國 ──
  const nat = document.getElementById('intro-nations');
  nat.innerHTML = NATIONS.map(n =>
    `<button class="nation-btn" data-id="${n.id}" style="--nc:${hex(n.color)}"><span class="nation-dot"></span>${n.short}</button>`
  ).join('');
  nat.querySelectorAll('.nation-btn').forEach(b => b.addEventListener('click', () => {
    selectedNation = NATIONS.find(n => n.id === b.dataset.id);
    nat.querySelectorAll('.nation-btn').forEach(x => x.classList.toggle('sel', x === b));
    appearance.tint = selectedNation.color;
    _syncButtons();
  }));

  // ── 登入 ──
  const gBtn = document.getElementById('intro-google');
  if (!suiEnabled() || !suiState.zkEnabled) { if (gBtn) gBtn.style.display = 'none'; }
  gBtn?.addEventListener('click', async () => {
    try { _status(t('status_signing_g')); await connectZkLogin(); }
    catch (e) { _status(t('status_fail_g') + e.message); }
  });
  const wBtn = document.getElementById('intro-wallet');
  if (!suiEnabled()) { if (wBtn) wBtn.style.display = 'none'; }
  wBtn?.addEventListener('click', async () => {
    try { _status(t('status_signing_w')); const _a = await connectWallet(); if (_a) setSuiAddress(_a); else _status(''); }
    catch (e) { _status(t('status_fail_w') + e.message); }
  });
  document.getElementById('intro-guest')?.addEventListener('click', async () => {
    if (_char) { _goMap(); return; }                       // 已有本地角色 → 直接進世界地圖
    try {
      _status(t('status_guest'));
      if (!selectedNation) selectedNation = NATIONS[0];     // 未宣誓 → 預設 Minas
      const c = await createCharacter({ nation: NATIONS.indexOf(selectedNation), name: t('g_guest_name') });  // 不連錢包 → 本地 1 級角色（不鑄 NFT）
      _setActive(c);
      await _refreshCharScreen();
      _status(t('g_created_local', { lv: c.level || 1 }), true);
    } catch (e) { _status(t('status_fail_w') + e.message); }
  });
  onSuiChange(_renderStatus);
  onSuiChange(() => { if (!onMap) _refreshCharScreen(); });   // 連線狀態改變 → 重整角色選擇

  function _renderStatus() {
    if (suiState.connected && suiState.address) {
      const via = t(suiState.mode === 'zklogin' ? 'via_google' : 'via_wallet');
      _status(t('status_in', { addr: suiState.address.slice(0, 6) + '…' + suiState.address.slice(-4), via }), true);
    } else {
      _status(t('status_default'));
    }
  }
  function _status(msg, ok) {
    const el = document.getElementById('intro-status');
    if (el) { el.textContent = msg; el.classList.toggle('ok', !!ok); }
  }
  // ── 角色選擇 / 建立 ──────────────────────────────────────────
  async function _listHeroes() { try { return await listMyHeroes(); } catch { return []; } }

  function _setActive(h) {
    _char = h; setActiveCharacter(h);
    selectedNation = NATIONS[h.nation] || NATIONS[0];
    appearance.tint = selectedNation.color;
    setSkillBudget(skillPointsForLevel(h.level || 1));
  }
  function _rosterHtml(heroes) {
    let html = `<div class="intro-label">${t('g_choose_hero')}</div><div id="intro-roster-list">`;
    for (const h of heroes) {
      const n = NATIONS[h.nation] || NATIONS[0];
      const sel = _char && _char.nftId === h.nftId;
      const img = h.image ? `<img class="rh-img" src="${h.image}" loading="lazy">` : `<span class="rh-dot" style="background:${hex(n.color)}"></span>`;
      html += `<button class="rh-card${sel ? ' sel' : ''}" data-id="${h.nftId}" style="--nc:${hex(n.color)}">${img}<span class="rh-info"><span class="rh-name">${_escCC(h.name)}</span><span class="rh-meta">${n.short} · Lv ${h.level}</span></span></button>`;
    }
    html += `</div><button class="intro-btn intro-ghost" id="intro-newchar">${t('g_create_new')}</button>`;
    return html;
  }
  function _bindRoster() {
    const roster = document.getElementById('intro-roster');
    if (!roster) return;
    roster.querySelectorAll('.rh-card').forEach(b => b.addEventListener('click', () => {
      const h = _heroesCache.find(x => x.nftId === b.dataset.id); if (!h) return;
      _setActive(h);
      roster.querySelectorAll('.rh-card').forEach(x => x.classList.toggle('sel', x === b));
      _syncButtons();
    }));
    roster.querySelector('#intro-newchar')?.addEventListener('click', () => { _creating = true; _refreshCharScreen(); });
  }
  function _syncButtons() {
    tomap.disabled = !_char;
    tomap.textContent = _char ? t('g_to_world') : t('g_select_create');
    const cb = document.getElementById('intro-create');
    if (cb) { cb.disabled = !selectedNation || !!_char; cb.textContent = t('g_create_char'); }
  }
  function _redraw() {
    const roster = document.getElementById('intro-roster');
    if (roster && _heroesCache.length && !_creating && roster.style.display !== 'none') { roster.innerHTML = _rosterHtml(_heroesCache); _bindRoster(); }
    const nm = document.getElementById('intro-charname'); if (nm) nm.placeholder = t('g_charname_ph');
    _syncButtons();
  }
  // 依「有沒有英雄 / 是否建立模式」切換角色選擇 ↔ 建立流程
  async function _refreshCharScreen() {
    const roster = document.getElementById('intro-roster');
    const pledge = document.getElementById('intro-pledge');
    _heroesCache = suiState.connected ? await _listHeroes() : [];
    if (_heroesCache.length && !_creating) {
      if (!_char || !_heroesCache.some(h => h.nftId === _char.nftId)) _setActive(_heroesCache[0]);
      if (roster) { roster.style.display = 'block'; roster.innerHTML = _rosterHtml(_heroesCache); _bindRoster(); }
      if (pledge) pledge.style.display = 'none';
    } else {
      if (roster) {
        if (_heroesCache.length) {   // 建立模式但已有英雄 → 提供「返回選擇」
          roster.style.display = 'block';
          roster.innerHTML = `<button class="intro-btn intro-ghost" id="intro-backsel">← ${t('g_choose_hero')}</button>`;
          roster.querySelector('#intro-backsel')?.addEventListener('click', () => { _creating = false; _refreshCharScreen(); });
        } else roster.style.display = 'none';
      }
      _char = suiState.connected ? null : loadCharacter();   // 建立模式無選定角色；訪客用本地角色
      if (pledge) pledge.style.display = '';
    }
    const nm = document.getElementById('intro-charname'); if (nm) nm.placeholder = t('g_charname_ph');
    _syncButtons();
    // 從戰後結算面板「回大廳」回來 → 直接進世界地圖（用目前／上次角色），不用再點一次
    if (localStorage.getItem('fr0_return_map')) {
      if (!_char) _char = loadCharacter();
      if (_char) { localStorage.removeItem('fr0_return_map'); _goMap(); }
    }
  }
  // 建立角色（鑄造）
  async function _create() {
    if (!selectedNation) return;
    const nm = document.getElementById('intro-charname');
    const name = (nm?.value || '').trim() || (selectedNation.short + ' Warrior');
    const cb = document.getElementById('intro-create');
    if (cb) cb.disabled = true;
    _status(t('g_creating'));            // 建立中…請在錢包簽名
    try {
      let previewDataUrl = null;
      try { previewDataUrl = await captureHeroImage(appearance); } catch { /* 截圖失敗則無圖 */ }
      const c = await createCharacter({ nation: NATIONS.indexOf(selectedNation), name, appearance: appearance.model, previewDataUrl });
      _setActive(c);
      _status(t(c.onchain ? 'g_created' : 'g_created_local', { lv: c.level || 1 }), true);
      _creating = false;
      await _refreshCharScreen();         // 回角色選擇（新角色已選定）
    } catch (e) { _status(t('status_fail_w') + e.message); if (cb) cb.disabled = false; }
  }
  document.getElementById('intro-create')?.addEventListener('click', _create);

  // ── → 世界地圖（已選 / 已建立角色才可進）──
  tomap.addEventListener('click', () => { if (_char) _goMap(); });
  function _goMap() {
    onMap = true;
    document.getElementById('intro-card')?.classList.add('map-mode');   // 全頁世界地圖
    stageLogin.style.display = 'none';
    stageMap.style.display = 'block';
    // 先渲染側欄（角色卡 / 分頁 / 出征）：即使地圖出錯也照常顯示
    _renderCharCard();
    initCharPreview(document.getElementById('intro-char-cv'), appearance);
    document.querySelectorAll('.map-tab').forEach(b => b.addEventListener('click', () => _setTab(b.dataset.tab)));
    _setTab('market');
    _renderAllegiance();
    _selectedMap = null;   // 不預設：點地圖才顯示戰況 + 出征鈕
    _refreshCount();
    _renderMapInfo(); _syncEnter();
    _pollTimer = setInterval(_poll, 4000);
    // 地圖（出錯不影響上面側欄）
    _renderCaptions();
    try {
      if (!initMapScene(document.getElementById('intro-map'), { kingdoms: KINGDOMS, onSelectMap: _onSelectMap, onSelectKingdom: _onSelectKingdom })) _renderTerritories();
    } catch (e) { console.warn('map fail', e); _renderTerritories(); }
  }
  // 國家標題（caption）：各國領地數
  function _renderCaptions() {
    const el = document.getElementById('map-captions');
    if (!el) return;
    el.innerHTML = KINGDOMS.map((k, i) =>
      `<button class="cap${k.active ? '' : ' cap-locked'}" data-king="${i}" style="--nc:${hex(k.color)}"><span class="nation-dot" style="width:14px;height:14px"></span><span class="cap-txt">${k.name}<small>${k.terr} ${t('g_territories')}${k.active ? '' : ' · ' + t('g_locked')}</small></span></button>`).join('');
    el.querySelectorAll('[data-king]').forEach(b => b.addEventListener('click', () => focusKingdom(Number(b.dataset.king))));
  }
  // 領域地圖：一堆領地，只有戰場 Aeloria 可點進遊戲
  function _renderTerritories() {
    const el = document.getElementById('intro-map');
    if (!el) return;
    let html = `<div id="terr-grid">`;
    for (const tr of TERRITORIES) {
      const cls = tr.active ? 'terr active' : `terr locked owned${tr.owner}`;
      const sub = tr.active ? `⚔ ${t('g_battlefield')}` : t('g_locked');
      const lock = tr.active ? '' : `<span class="terr-lock">🔒</span>`;
      html += `<div class="${cls}"${tr.active ? ' data-enter="1"' : ''}>${lock}${tr.name}<span class="terr-sub">${sub}</span></div>`;
    }
    html += `</div>`;
    el.innerHTML = html;
    el.querySelector('[data-enter]')?.addEventListener('click', _enter);
  }
  function _setTab(tab) {
    _tab = tab;
    document.querySelectorAll('.map-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('map-hub')?.classList.toggle('nft-full', tab === 'nft');   // NFT 分頁隱藏地圖
    const mk = document.getElementById('intro-warbonds'); if (mk) mk.style.display = tab === 'market' ? 'block' : 'none';
    const nf = document.getElementById('intro-nftmkt'); if (nf) nf.style.display = tab === 'nft' ? 'block' : 'none';
    if (tab === 'market') _renderWarBonds(); else _renderNftMarket();
    _syncEnter();   // NFT 分頁隱藏出征鈕；市場分頁依是否選到戰場顯示
  }
  // NFT 市場：上架自己的裝備 / 購買 / 下架（真實鏈上掛單買賣）
  async function _renderNftMarket() {
    const el = document.getElementById('intro-nftmkt');
    if (!el) return;
    const MOCK = [
      { name: 'Aether Helm',        slot: 'head',   price: 0.5, rarity: 'Rare',      icon: '⛑️', color: '#4f86d8' },
      { name: 'Phoenix Cloak',      slot: 'cape',   price: 1.2, rarity: 'Epic',      icon: '🧣', color: '#d56aff' },
      { name: 'Runed Blade',        slot: 'weapon', price: 0.8, rarity: 'Rare',      icon: '⚔️', color: '#4f86d8' },
      { name: 'Voxel Greaves',      slot: 'legs',   price: 0.3, rarity: 'Common',    icon: '🥾', color: '#8fd0a0' },
      { name: 'Calaadia Pauldrons', slot: 'arms',   price: 0.6, rarity: 'Rare',      icon: '🛡️', color: '#d5494a' },
      { name: 'Crown of Aeloria',   slot: 'head',   price: 3.0, rarity: 'Legendary', icon: '👑', color: '#f2d98c' },
    ];
    const mine = suiState.connected ? (suiState.cosmetics || []) : [];
    const listings = await fetchListings();
    let html = `<div class="nm-hint">${t('g_nft_hint')}</div>`;
    html += `<div class="nm-sec">${t('g_my_gear')}</div>`;
    if (!mine.length) html += `<div class="wb-note">${t('g_nft_none')}</div>`;
    else for (const c of mine) {
      const img = c.image ? `<img class="nm-img" src="${c.image}" loading="lazy">` : `<span class="nm-img"></span>`;
      html += `<div class="nm-card">${img}<span class="nm-info">${_escCC(c.name || c.variant)}<small>${c.slot || ''}</small></span><input class="nm-price" type="number" min="0" step="0.1" placeholder="SUI" data-pid="${c.id}"><button class="nm-list" data-list="${c.id}">${t('g_list')}</button></div>`;
    }
    html += `<div class="nm-sec">${t('g_listings')}</div>`;
    if (!listings.length) html += `<div class="wb-note">${t('g_no_listings')}</div>`;
    else for (const L of listings) {
      const img = L.image ? `<img class="nm-img" src="${L.image}" loading="lazy">` : `<span class="nm-img"></span>`;
      const act = (L.seller === suiState.address)
        ? `<button class="nm-delist" data-delist="${L.id}">${t('g_delist')}</button>`
        : `<button class="nm-buy" data-buy="${L.id}" data-price="${L.price}">${t('g_buy')} ${L.price}◎</button>`;
      html += `<div class="nm-card">${img}<span class="nm-info">${_escCC(L.name)}<small>${L.slot} · ${L.price} SUI</small></span>${act}</div>`;
    }
    html += `<div class="nm-sec">${t('g_demo_gear')}</div><div class="nm-demohint">${t('g_demo_hint')}</div>`;
    for (const m of MOCK) {
      html += `<div class="nm-card"><span class="nm-img nm-icon" style="background:${m.color}2e;color:${m.color}">${m.icon}</span><span class="nm-info" style="color:${m.color}">${m.name}<small>${m.slot} · ${m.rarity} · ${m.price} SUI</small></span><button class="nm-buy nm-demo">${t('g_buy')} ${m.price}◎</button></div>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-list]').forEach(b => b.addEventListener('click', () => _doList(b.dataset.list)));
    el.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => _doBuy(b.dataset.buy, Number(b.dataset.price))));
    el.querySelectorAll('[data-delist]').forEach(b => b.addEventListener('click', () => _doDelist(b.dataset.delist)));
    el.querySelectorAll('.nm-demo').forEach(b => b.addEventListener('click', () => alert(t('g_demo_buy'))));
  }
  async function _doList(id) {
    const inp = document.querySelector(`.nm-price[data-pid="${id}"]`);
    const price = Number(inp?.value);
    if (!price || price <= 0) { alert(t('g_price_req')); return; }
    try { await listGear(id, price); await refreshCosmetics(); } catch (e) { alert('上架失敗：' + e.message); }
    _renderNftMarket();
  }
  async function _doBuy(id, price) {
    try { await buyGear(id, price); await refreshCosmetics(); alert(t('g_bought_ok')); } catch (e) { alert('購買失敗：' + e.message); }
    _renderNftMarket();
  }
  async function _doDelist(id) {
    try { await delistGear(id); await refreshCosmetics(); } catch (e) { alert('下架失敗：' + e.message); }
    _renderNftMarket();
  }
  document.getElementById('intro-back')?.addEventListener('click', () => {
    clearInterval(_pollTimer); _pollTimer = null; onMap = false;
    document.getElementById('intro-card')?.classList.remove('map-mode');
    disposeMapScene();
    disposeCharPreview();
    stageMap.style.display = 'none';
    stageLogin.style.display = 'block';
    _refreshCharScreen();
  });

  // 掛載世界地圖：優先 3D（Three.js），WebGL 不可用 → 退回 SVG 星圖
  function _mountMap() {
    const el = document.getElementById('intro-map');
    if (!el) return;
    el.innerHTML = `<div id="map-center" class="map-center3d">
        <div class="map-count3d" id="map-count">…</div>
        <div class="map-sub3d">AELORIA</div>
      </div>`;
    let ok = false;
    try { ok = initMapScene(el, { nations: NATIONS, myId: selectedNation?.id }); } catch { ok = false; }
    if (!ok) { disposeMapScene(); el.innerHTML = _buildMap(); }
    document.getElementById('map-center')?.addEventListener('click', _enter);
  }
  function _poll() { _refreshCount(); }   // warbond 由 _refreshCount 在同步 market 後自行重繪

  function _renderAllegiance() {
    const al = document.getElementById('intro-allegiance');
    if (!al || !selectedNation) return;
    al.style.setProperty('--mync', hex(selectedNation.color));
    document.getElementById('intro-enter')?.style.setProperty('--mync', hex(selectedNation.color));
    al.innerHTML = t('allegiance', { name: `<b>${selectedNation.name}</b>` });
  }
  // 選單角色卡：名稱 / 等級 / 王國 / XP 進度（在世界地圖就看得到）
  function _escCC(s) { return String(s || 'Warrior').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  function _renderCharCard() {
    const el = document.getElementById('intro-char');
    const info = document.getElementById('intro-char-info');
    if (!el || !info) return;
    if (!_char) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const next = xpForNextLevel(_char.level || 1);
    const pct = next ? Math.min(100, Math.round(((_char.xp || 0) / next) * 100)) : 100;
    const n = NATIONS[_char.nation] || NATIONS[0];
    info.innerHTML = `
      <div class="cc-name">${_escCC(_char.name)} <span class="cc-lv">Lv ${_char.level || 1}</span></div>
      <div class="cc-nation" style="color:${hex(n.color)}">● ${n.short} · ${_char.onchain ? '⛓ on-chain' : 'local'}</div>
      <div class="cc-xpbar"><div style="width:${pct}%"></div></div>
      <div class="cc-xptext">XP ${_char.xp || 0}${next ? ` / ${next}` : ' (MAX)'}</div>
      ${_pendingCardHtml()}`;
    _bindPendingCard();
  }

  // 待結算：玩家錯過戰後結算面板時，在世界地圖角色卡補領彩金 / 補升級（資料存在 localStorage）
  let _ccBusy = false;
  function _pendingCardHtml() {
    const p = loadPending();
    const canSign = suiState.connected;
    let h = '';
    if (p.xp) h += `<div class="cc-pending">✨ ${t('g_pending_xp', { n: p.xp.amount })} ${canSign ? `<button class="cc-pbtn" id="cc-levelup">${t('g_confirm_levelup')}</button>` : `<span class="cc-pnote">${t('g_no_wallet_settle')}</span>`}</div>`;
    if (p.redeem && p.redeem.length) h += `<div class="cc-pending">🎟 ${t('g_pending_redeem', { n: p.redeem.length })} ${canSign ? `<button class="cc-pbtn" id="cc-claim">${t('g_claim_payout')}</button>` : `<span class="cc-pnote">${t('g_no_wallet_settle')}</span>`}</div>`;
    return h;
  }
  function _bindPendingCard() {
    const l = document.getElementById('cc-levelup'); if (l) l.onclick = _doCardLevelUp;
    const c = document.getElementById('cc-claim');   if (c) c.onclick = _doCardClaim;
  }
  async function _doCardLevelUp() {
    const p = loadPending(); if (!p.xp || _ccBusy) return;
    _ccBusy = true;
    const btn = document.getElementById('cc-levelup'); if (btn) { btn.disabled = true; btn.textContent = t('g_leveling'); }
    try {
      const ok = await applyXp(p.xp.amount, p.xp.nonce, Uint8Array.from(p.xp.sig));
      if (ok) { clearPendingXp(); _char = (await getMyCharacter()) || _char; if (_char) setSkillBudget(skillPointsForLevel(_char.level || 1)); }
    } catch { /* noop */ }
    _ccBusy = false; _renderCharCard();
  }
  async function _doCardClaim() {
    const p = loadPending(); if (!p.redeem || !p.redeem.length || _ccBusy) return;
    _ccBusy = true;
    const btn = document.getElementById('cc-claim'); if (btn) { btn.disabled = true; btn.textContent = t('g_claiming'); }
    for (const m of [...p.redeem]) { try { await redeem(m); removePendingRedeem(m); } catch { /* keep */ } }
    _ccBusy = false; _renderCharCard();
  }
  // 選地圖 → 顯示該地圖戰況（在線數由 server queryServers 取）→ 右下 To War 出征
  function _onSelectMap(m) { _selectedMap = m; _renderMapInfo(); _syncEnter(); }
  // 點世界地圖上的國家 → 飛近聚焦該國，並把「開放國」標記為效忠國（同步外觀色 + allegiance / 出戰國）
  function _onSelectKingdom(k) {
    if (!k || !k.active || !NATIONS[k.index]) return;
    selectedNation = NATIONS[k.index];
    appearance.tint = selectedNation.color;
    _renderAllegiance();
    _renderMapInfo();
    _renderCharCard();
  }
  function _syncEnter() {
    if (enter) enter.style.display = 'none';   // 出征鈕已移到地圖戰況條（.mi-towar）
  }
  function _renderMapInfo() {
    const el = document.getElementById('map-info');
    if (!el) return;
    const m = _selectedMap;
    if (!m) { el.classList.remove('mi-warbg'); el.innerHTML = `<div class="mi-sub">${t('g_pick_map')}</div>`; return; }
    el.classList.toggle('mi-warbg', m.state === 'war');
    let badge, sub;
    if (m.state === 'war') {
      badge = `<span class="mi-state mi-war">${t('g_map_war')}</span>`;
      // 交戰雙方：team1=藍=Minas ⚔ team2=紅=Calaadia（人數由 server 房間 metadata 即時帶回）
      const a = NATIONS[0], b = NATIONS[1];
      sub = (_online && (_t1 + _t2) > 0)
        ? `<span class="mi-side" style="color:${hex(a.color)}">${a.short} ${_t1}</span><span class="mi-vs">⚔</span><span class="mi-side" style="color:${hex(b.color)}">${_t2} ${b.short}</span>`
        : t('g_nofight');
    } else if (m.owner === 0 || m.owner === 1) {
      badge = `<span class="mi-state mi-peace">${t('g_map_peace')}</span>`;
      sub = t('g_map_ctrl', { n: NATIONS[m.owner].short });
    } else {
      badge = `<span class="mi-state mi-peace">${t('g_map_neutral')}</span>`;
      sub = t('g_map_peace');
    }
    const myN = selectedNation || NATIONS[_char?.nation || 0];
    const warBtn = (m.enter && _tab !== 'nft') ? `<button class="mi-towar" style="--nc:${hex(myN.color)}">${t('g_to_war_nation', { n: myN.short })}</button>` : '';
    el.innerHTML = `<div class="mi-name">${m.state === 'war' ? '⚔ ' : ''}${m.name}</div>${badge}<div class="mi-sub">${sub}</div>${warBtn}`;
    el.querySelector('.mi-towar')?.addEventListener('click', _enter);
  }
  function _renderEnter() { _renderMapInfo(); _syncEnter(); }   // 沿用舊呼叫點（refreshCount / 語言切換）

  // ── 預測市場（B3：CPMM AMM · Polymarket 式即時買/賣）──
  async function _renderWarBonds() {
    const box = document.getElementById('intro-warbonds');
    if (!box) return;
    if (!suiEnabled()) { box.innerHTML = ''; return; }

    let mkt = null, mine = { a: 0, b: 0 };
    try {
      mkt = await getMarket();                          // 市場公開：未登入也讀得到
      if (suiState.address) mine = await getMyShares(mkt);
    } catch { /* 保留上次畫面 */ }
    if (!mkt) { box.innerHTML = suiState.connected ? '' : `<div class="wb-note">${t('wb_login')}</div>`; return; }

    const prices = [mkt.priceA, mkt.priceB];
    const shares = [toSui(mine.a), toSui(mine.b)];
    const liq = toSui(mkt.collateral || (mkt.ra + mkt.rb));
    const posVal = shares[0] * prices[0] + shares[1] * prices[1];
    _priceHist.push(prices[0]); if (_priceHist.length > 40) _priceHist.shift();
    const tradable = !mkt.resolved && suiState.connected;

    const pill = mkt.resolved
      ? `<span class="wb-pill wb-end">${t('mk_status_end')}</span>`
      : `<span class="wb-pill wb-live">● ${t('mk_status_open')}</span>`;

    let html = `<div class="wb-card">
      <div class="wb-head"><span class="wb-q">${t('mk_title')}</span>${pill}</div>
      <div class="wb-sub">${t('mk_round', { r: mkt.round })} · ${t('mk_liquidity', { sui: liq.toFixed(2) })}</div>
      <div class="wb-bar">
        <span class="wb-seg" style="width:${(prices[0] * 100).toFixed(1)}%;background:${hex(NATIONS[0].color)}">${(prices[0] * 100).toFixed(0)}%</span>
        <span class="wb-seg" style="width:${(prices[1] * 100).toFixed(1)}%;background:${hex(NATIONS[1].color)}">${(prices[1] * 100).toFixed(0)}%</span>
      </div>
      ${_sparkline()}`;

    if (tradable) {
      html += `<div class="wb-amts">${BET_AMTS.map(a =>
        `<button class="wb-amt${a === _betAmt ? ' sel' : ''}" data-amt="${a}">${a}</button>`).join('')}<span class="wb-amtlbl">SUI</span></div>`;
    }

    NATIONS.forEach((n, i) => {
      const pct = (prices[i] * 100).toFixed(1);
      const est = tradable ? estimateBuy(mkt, i, _betAmt) : null;
      html += `<div class="wb-out" style="--nc:${hex(n.color)}">
        <div class="wb-out-top">
          <span class="wb-name"><span class="wb-dot"></span>${n.short}</span>
          <span class="wb-odds">${pct}% · ×${(prices[i] > 0 ? 1 / prices[i] : 0).toFixed(2)}</span>
        </div>
        ${shares[i] > 0 ? `<div class="wb-hold">${t('mk_hold', { n: shares[i].toFixed(2), sui: (shares[i] * prices[i]).toFixed(2) })}</div>` : ''}
        ${tradable ? `<div class="wb-act">
          <button class="wb-buy" data-buy="${i}">${t('mk_buyname', { name: n.short })}${est ? ` <b>≈${est.shares.toFixed(2)}🎟</b>` : ''}</button>
          ${shares[i] > 0 ? `<button class="wb-sellbtn" data-sell="${i}">${t('mk_sell')}</button>` : ''}
        </div>` : ''}
      </div>`;
    });

    if (!suiState.connected) html += `<div class="wb-note">${t('wb_login')}</div>`;
    else if (posVal > 0) html += `<div class="wb-foot">${t('mk_mypos', { sui: posVal.toFixed(2) })}</div>`;
    if (mkt.resolved) {
      html += `<div class="wb-note">${t('wb_settled', { name: NATIONS[mkt.winner]?.name || '—' })}</div>`;
      if (shares[mkt.winner] > 0) html += `<button class="wb-claim">${t('mk_redeem')}</button>`;
    }
    html += `</div>`;

    box.innerHTML = html;
    box.querySelectorAll('[data-amt]').forEach(b => b.addEventListener('click', () => { _betAmt = Number(b.dataset.amt); _renderWarBonds(); }));
    box.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => _doTrade('buy', Number(b.dataset.buy), b)));
    box.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => _doTrade('sell', Number(b.dataset.sell), b, [mine.a, mine.b])));
    box.querySelector('.wb-claim')?.addEventListener('click', () => _doRedeem());
  }

  // 迷你價格走勢（Minas 機率隨輪詢累積）
  function _sparkline() {
    if (_priceHist.length < 2) return '';
    const W = 100, Hh = 22, n = _priceHist.length;
    const pts = _priceHist.map((p, i) => `${(i / (n - 1) * W).toFixed(1)},${(Hh - p * Hh).toFixed(1)}`).join(' ');
    const col = _priceHist[n - 1] >= 0.5 ? hex(NATIONS[0].color) : hex(NATIONS[1].color);
    return `<svg class="wb-spark" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5"/></svg>`;
  }

  async function _doTrade(kind, outcome, btn, rawShares) {
    _wbBusy = true; btn.disabled = true; btn.textContent = '…';
    try {
      if (kind === 'buy') await buy(outcome, _betAmt);
      else await sell(outcome, rawShares[outcome]);   // demo：賣出全部該結果份額
    } catch (e) { alert((kind === 'buy' ? '買入' : '賣出') + '失敗：' + e.message); }
    _wbBusy = false;
    _renderWarBonds();
  }
  async function _doRedeem() {
    try { await redeem(); alert(t('wb_claimed')); }
    catch (e) { alert('兌付失敗：' + e.message); }
    _renderWarBonds();
  }

  // ── 世界地圖 SVG（暗色星圖：中央 Aeloria 戰核 + 五王國環繞）──
  function _buildMap() {
    const cx = 180, cy = 148, R = 110;
    const myId = selectedNation?.id;
    const N = NATIONS.length;
    let lines = '', nodes = '';
    NATIONS.forEach((n, i) => {
      // 兩國 → 左右對峙；多國 → 環繞
      const a = Math.PI + i * (2 * Math.PI / N);
      const x = Math.round(cx + Math.cos(a) * R), y = Math.round(cy + Math.sin(a) * R);
      const col = hex(n.color), mine = n.id === myId;
      lines += `<line x1="${x}" y1="${y}" x2="${cx}" y2="${cy}" stroke="${col}" stroke-width="${mine ? 2.5 : 1}" stroke-dasharray="${mine ? '0' : '3 5'}" opacity="${mine ? 0.95 : 0.35}"/>`;
      nodes += (mine ? `<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="${col}" stroke-width="2" opacity="0.7"/>` : '')
            +  `<circle cx="${x}" cy="${y}" r="${mine ? 11 : 8}" fill="${col}"><animate attributeName="opacity" values="0.7;1;0.7" dur="2.4s" repeatCount="indefinite"/></circle>`
            +  `<text class="map-nation-label" x="${x}" y="${y + (y < cy ? -15 : 22)}">${n.short}</text>`;
    });
    return `<svg viewBox="0 0 360 296">
      <ellipse cx="${cx}" cy="${cy}" rx="140" ry="108" fill="none" stroke="rgba(130,150,210,0.35)" stroke-width="1.5"/>
      <ellipse cx="${cx}" cy="${cy}" rx="132" ry="101" fill="rgba(90,120,200,0.06)"/>
      ${lines}
      <g id="map-center" class="map-front">
        <circle cx="${cx}" cy="${cy}" r="46" fill="none" stroke="#8fb0ff" stroke-width="2.5" opacity="0.6" style="animation:bfpulse 1.8s infinite"/>
        <circle cx="${cx}" cy="${cy}" r="39" fill="#0b1426" stroke="#5a8fd8" stroke-width="2"/>
        <circle cx="${cx}" cy="${cy}" r="39" fill="#6f9aff" opacity="0.12"/>
        <text class="map-center-count" id="map-count" x="${cx}" y="${cy - 1}">…</text>
        <text class="map-center-sub" x="${cx}" y="${cy + 15}">AELORIA</text>
      </g>
      ${nodes}
    </svg>`;
  }

  async function _refreshCount() {
    let total = 0, t1 = 0, t2 = 0; _online = false;
    try {
      const rooms = (queryServers ? await queryServers() : []) || [];
      for (const r of rooms) { total += (r.clients || 0); t1 += (r.metadata?.t1 || 0); t2 += (r.metadata?.t2 || 0); if (r.metadata?.market) setActiveMarket(String(r.metadata.market)); }
      _online = true;
    } catch { _online = false; }
    _lastTotal = total; _t1 = t1; _t2 = t2;
    try { const latest = await findLatestMarket(); if (latest) setActiveMarket(latest); } catch { /* noop */ }   // 鏈上最新一場（權威，不靠 server room）
    const cntEl = document.getElementById('map-count');
    if (cntEl) cntEl.textContent = _online ? String(total) : '—';
    enter.disabled = false;
    _renderEnter();
    if (_tab === 'market' && !_wbBusy) _renderWarBonds();   // market 同步後（setActiveMarket）才重繪 warbond，避免讀到舊市場
  }

  // ── 出征 ──
  function _enter() {
    clearInterval(_pollTimer);
    document.getElementById('intro-card')?.classList.remove('map-mode');
    disposeMapScene();
    disposeCharPreview();
    setSkillBudget(skillPointsForLevel(_char?.level || 1));   // 進戰場前套用等級技能預算
    screen.style.display = 'none';
    onEnter?.();
  }
  enter.addEventListener('click', _enter);

  // 角色選擇畫面已在 init 與連線變更時由 _refreshCharScreen() 處理
}
