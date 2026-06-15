// ─── 開場：① 登入+宣誓王國 → ② 世界地圖(在線人數) → 參戰 ──────
// 依原版 Fantasy Earth Zero 流程：宣誓 5 王國其一 → 中央大陸 Ecetia 世界地圖
// → 看戰場在線人數 → 參戰（KvK）。登入支援 zkLogin / 錢包 / 訪客。
import { suiState, onSuiChange, connectWallet, connectZkLogin } from '../sui/wallet.js';
import { suiEnabled } from '../sui/config.js';
import { appearance, setSuiAddress } from './appearance.js';

// 原版 FEZ 五王國（宣誓效忠 → 服裝旗色 allegiance）
export const NATIONS = [
  { id: 'yelsord',   name: 'Yelsord 耶斯洛',   color: 0xd8b84a },
  { id: 'cesedria',  name: 'Cesedria 賽瑟利亞', color: 0x4f86d8 },
  { id: 'gevrandia', name: 'Gevrandia 蓋夫蘭',  color: 0x5aa85a },
  { id: 'netzavare', name: 'Netzavare 涅薩瓦',  color: 0xa86ad8 },
  { id: 'hordaine',  name: 'Hordaine 霍丹',     color: 0xd85050 },
];
export let selectedNation = null;

const BF_CAP = 100;   // 戰場總容量（KvK 每邊 50）

function _status(msg, ok) {
  const el = document.getElementById('intro-status');
  if (el) { el.textContent = msg; el.classList.toggle('ok', !!ok); }
}

/** opts: { onEnter, queryServers }  queryServers()→Promise<[{clients,maxClients}]> */
export function initIntro(opts = {}) {
  const { onEnter, queryServers } = opts;
  const screen = document.getElementById('intro-screen');
  if (!screen) { onEnter?.(); return; }
  const stageLogin = document.getElementById('intro-stage-login');
  const stageMap   = document.getElementById('intro-stage-map');

  // ── 宣誓王國 ──
  const nat = document.getElementById('intro-nations');
  nat.innerHTML = NATIONS.map(n =>
    `<button class="nation-btn" data-id="${n.id}" style="--nc:#${n.color.toString(16).padStart(6, '0')}"><span class="nation-dot"></span>${n.name.split(' ')[1]}</button>`
  ).join('');
  const toMap = document.getElementById('intro-tomap');
  nat.querySelectorAll('.nation-btn').forEach(b => b.addEventListener('click', () => {
    selectedNation = NATIONS.find(n => n.id === b.dataset.id);
    nat.querySelectorAll('.nation-btn').forEach(x => x.classList.toggle('sel', x === b));
    appearance.tint = selectedNation.color;
    toMap.disabled = false;
    toMap.textContent = `宣誓效忠「${selectedNation.name.split(' ')[1]}」→ 前往世界地圖`;
  }));

  // ── 登入 ──
  const gBtn = document.getElementById('intro-google');
  if (!suiEnabled() || !suiState.zkEnabled) { if (gBtn) gBtn.style.display = 'none'; }
  gBtn?.addEventListener('click', async () => {
    try { _status('前往 Google 登入…'); await connectZkLogin(); }
    catch (e) { _status('Google 登入失敗：' + e.message); }
  });
  const wBtn = document.getElementById('intro-wallet');
  if (!suiEnabled()) { if (wBtn) wBtn.style.display = 'none'; }
  wBtn?.addEventListener('click', async () => {
    try { _status('連接錢包中…'); setSuiAddress(await connectWallet()); }
    catch (e) { _status('連接失敗：' + e.message); }
  });
  document.getElementById('intro-guest')?.addEventListener('click', () =>
    _status('訪客模式——可先試玩，之後仍可在外觀面板（O）登入上鏈'));

  const showLogin = (s) => {
    if (s.connected && s.address)
      _status(`已登入 ${s.address.slice(0, 6)}…${s.address.slice(-4)}（${s.mode === 'zklogin' ? 'Google' : '錢包'}）`, true);
  };
  onSuiChange(showLogin); showLogin(suiState);

  // ── 階段切換：→ 世界地圖 ──
  let _pollTimer = null;
  toMap.addEventListener('click', () => {
    if (!selectedNation) return;
    stageLogin.style.display = 'none';
    stageMap.style.display = 'block';
    const al = document.getElementById('intro-allegiance');
    al.style.setProperty('--mync', '#' + selectedNation.color.toString(16).padStart(6, '0'));
    al.innerHTML = `效忠王國：<b>${selectedNation.name}</b> — 點中央戰場參戰`;
    document.getElementById('intro-map').innerHTML = _buildMap();
    document.getElementById('map-center')?.addEventListener('click', _enter);
    _refreshCount();
    _pollTimer = setInterval(_refreshCount, 4000);   // 每 4s 更新在線人數
  });
  document.getElementById('intro-back')?.addEventListener('click', () => {
    clearInterval(_pollTimer); _pollTimer = null;
    stageMap.style.display = 'none';
    stageLogin.style.display = 'block';
  });

  // 中央大陸 Ecetia + 五王國環繞 + 戰線匯聚中央戰場（SVG）
  function _buildMap() {
    const cx = 180, cy = 148, R = 106;
    const myId = selectedNation?.id;
    let lines = '', nodes = '';
    NATIONS.forEach((n, i) => {
      const a = (-90 + i * 72) * Math.PI / 180;
      const x = Math.round(cx + Math.cos(a) * R), y = Math.round(cy + Math.sin(a) * R);
      const col = '#' + n.color.toString(16).padStart(6, '0');
      const mine = n.id === myId;
      lines += `<line x1="${x}" y1="${y}" x2="${cx}" y2="${cy}" stroke="${col}" stroke-width="${mine ? 2.5 : 1}" opacity="${mine ? 0.85 : 0.25}"/>`;
      nodes += `<circle cx="${x}" cy="${y}" r="${mine ? 13 : 9}" fill="${col}" opacity="${mine ? 1 : 0.5}" ${mine ? 'stroke="#fff" stroke-width="2"' : ''}/>`
            +  `<text class="map-nation-label" x="${x}" y="${y + (y < cy ? -15 : 21)}">${n.name.split(' ')[1]}</text>`;
    });
    return `<svg viewBox="0 0 360 296">
      <ellipse cx="${cx}" cy="${cy}" rx="140" ry="108" fill="#152340" stroke="#2c466e" stroke-width="1"/>
      <ellipse cx="${cx}" cy="${cy}" rx="92" ry="70" fill="#1a2d4e" opacity="0.6"/>
      ${lines}
      <g id="map-center" class="map-front">
        <circle cx="${cx}" cy="${cy}" r="46" fill="none" stroke="#7fd0ff" stroke-width="2" opacity="0.55" style="animation:bfpulse 1.8s infinite"/>
        <circle cx="${cx}" cy="${cy}" r="40" fill="#0c1730" stroke="#5a8fd8" stroke-width="1.5"/>
        <text class="map-center-count" id="map-count" x="${cx}" y="${cy - 1}">…</text>
        <text class="map-center-sub" x="${cx}" y="${cy + 15}">ECETIA 戰場</text>
      </g>
      ${nodes}
    </svg>`;
  }

  async function _refreshCount() {
    const cntEl = document.getElementById('map-count');
    const enter = document.getElementById('intro-enter');
    let total = 0, online = false;
    try {
      const rooms = (queryServers ? await queryServers() : []) || [];
      total = rooms.reduce((s, r) => s + (r.clients || 0), 0);
      online = true;
    } catch { online = false; }
    if (cntEl) cntEl.textContent = online ? String(total) : '離線';
    if (enter) {
      enter.disabled = false;
      enter.textContent = online ? `⚔ 參戰（在線 ${total}）` : '⚔ 參戰（單機試玩）';
    }
  }

  // ── 參戰（中央戰場節點 / 參戰鈕共用）──
  function _enter() {
    clearInterval(_pollTimer);
    screen.style.display = 'none';
    onEnter?.();
  }
  document.getElementById('intro-enter')?.addEventListener('click', _enter);
}
