// ─── 開場：① 登入+宣誓王國 → ② 世界地圖(在線人數) → 出征 ──────
// 王國/領域對齊 fr0.world：領域 Aeloria、五王國 Minas United / Ledell /
// Calaadia / Dieudonne / Phoenix。暗色電影風 + 中英 i18n。
import { suiState, onSuiChange, connectWallet, connectZkLogin } from '../sui/wallet.js';
import { suiEnabled } from '../sui/config.js';
import { appearance, setSuiAddress } from './appearance.js';
import { t, applyI18n, toggleLang, onLangChange } from './i18n.js';
import { getMarket, getMyShares, buy, sell, redeem, toSui } from '../sui/market.js';

const BET_SUI = 0.1;   // demo 固定買入額

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
  let onMap = false, _pollTimer = null, _lastTotal = null, _online = false;

  applyI18n();
  _renderStatus();
  tomap.textContent = t('tomap_disabled');

  // 語言切換 → 重套靜態文字 + 重繪動態文字
  document.getElementById('intro-lang')?.addEventListener('click', toggleLang);
  onLangChange(() => {
    _renderStatus();
    tomap.textContent = selectedNation ? t('tomap_ready', { name: selectedNation.short }) : t('tomap_disabled');
    if (onMap) { _renderAllegiance(); _renderEnter(); _renderWarBonds(); }
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
    tomap.disabled = false;
    tomap.textContent = t('tomap_ready', { name: selectedNation.short });
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
    try { _status(t('status_signing_w')); setSuiAddress(await connectWallet()); }
    catch (e) { _status(t('status_fail_w') + e.message); }
  });
  document.getElementById('intro-guest')?.addEventListener('click', () => _status(t('status_guest')));
  onSuiChange(_renderStatus);

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

  // ── → 世界地圖 ──
  tomap.addEventListener('click', () => {
    if (!selectedNation) return;
    onMap = true;
    stageLogin.style.display = 'none';
    stageMap.style.display = 'block';
    document.getElementById('intro-map').innerHTML = _buildMap();
    document.getElementById('map-center')?.addEventListener('click', _enter);
    _renderAllegiance();
    _renderWarBonds();
    _refreshCount();
    _pollTimer = setInterval(_refreshCount, 4000);
  });
  document.getElementById('intro-back')?.addEventListener('click', () => {
    clearInterval(_pollTimer); _pollTimer = null; onMap = false;
    stageMap.style.display = 'none';
    stageLogin.style.display = 'block';
  });

  function _renderAllegiance() {
    const al = document.getElementById('intro-allegiance');
    al.style.setProperty('--mync', hex(selectedNation.color));
    document.getElementById('intro-enter')?.style.setProperty('--mync', hex(selectedNation.color));
    al.innerHTML = t('allegiance', { name: `<b>${selectedNation.name}</b>` });
  }
  function _renderEnter() {
    if (_lastTotal == null) { enter.textContent = t('enter_connecting'); return; }
    enter.textContent = _online ? t('enter_online', { n: _lastTotal }) : t('enter_offline');
  }

  // ── 預測市場（B3：CPMM AMM 即時買/賣）──
  async function _renderWarBonds() {
    const box = document.getElementById('intro-warbonds');
    if (!box) return;
    if (!suiEnabled()) { box.innerHTML = ''; return; }
    if (!suiState.connected) { box.innerHTML = `<div class="wb-note">${t('wb_login')}</div>`; return; }
    let mkt, mine;
    try { mkt = await getMarket(); mine = await getMyShares(mkt); } catch { box.innerHTML = ''; return; }
    if (!mkt) { box.innerHTML = ''; return; }
    const prices = [mkt.priceA, mkt.priceB];
    const myShares = [mine.a, mine.b];

    let html = `<div class="wb-title">${t('mk_title')}</div>`;
    NATIONS.forEach((n, i) => {
      const pct = (prices[i] * 100).toFixed(1);
      html += `<div class="wb-row" style="--nc:${hex(n.color)}">
        <span class="wb-name">${n.short}</span>
        <span class="wb-pool"><b style="color:#dce6f7">${pct}%</b>${myShares[i] ? ` · ${toSui(myShares[i]).toFixed(2)}🎟` : ''}</span>
        ${!mkt.resolved ? `<button class="wb-bet" data-buy="${i}">${t('mk_buy', { amt: BET_SUI })}</button>` : ''}
        ${(!mkt.resolved && myShares[i] > 0) ? `<button class="wb-bet" data-sell="${i}" style="border-color:#8794ad">${t('mk_sell')}</button>` : ''}
      </div>`;
    });
    if (mkt.resolved) {
      html += `<div class="wb-note">${t('wb_settled', { name: NATIONS[mkt.winner]?.name || '—' })}</div>`;
      if (myShares[mkt.winner] > 0) html += `<button class="wb-claim">${t('mk_redeem')}</button>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => _doTrade('buy', Number(b.dataset.buy), b)));
    box.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => _doTrade('sell', Number(b.dataset.sell), b, myShares)));
    box.querySelector('.wb-claim')?.addEventListener('click', () => _doRedeem());
  }
  async function _doTrade(kind, outcome, btn, myShares) {
    btn.disabled = true; btn.textContent = '…';
    try {
      if (kind === 'buy') await buy(outcome, BET_SUI);
      else await sell(outcome, myShares[outcome]);   // demo：賣出全部該結果份額
    } catch (e) { alert((kind === 'buy' ? '買入' : '賣出') + '失敗：' + e.message); }
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
    let total = 0; _online = false;
    try {
      const rooms = (queryServers ? await queryServers() : []) || [];
      total = rooms.reduce((s, r) => s + (r.clients || 0), 0);
      _online = true;
    } catch { _online = false; }
    _lastTotal = total;
    const cntEl = document.getElementById('map-count');
    if (cntEl) cntEl.textContent = _online ? String(total) : '—';
    enter.disabled = false;
    _renderEnter();
  }

  // ── 出征 ──
  function _enter() {
    clearInterval(_pollTimer);
    screen.style.display = 'none';
    onEnter?.();
  }
  enter.addEventListener('click', _enter);
}
