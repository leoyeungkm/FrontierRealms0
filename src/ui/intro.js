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
    al.innerHTML = `效忠王國：<b>${selectedNation.name}</b>`;
    _refreshCount();
    _pollTimer = setInterval(_refreshCount, 4000);   // 每 4s 更新在線人數
  });
  document.getElementById('intro-back')?.addEventListener('click', () => {
    clearInterval(_pollTimer); _pollTimer = null;
    stageMap.style.display = 'none';
    stageLogin.style.display = 'block';
  });

  async function _refreshCount() {
    const cntEl = document.getElementById('bf-count');
    const fill = document.getElementById('bf-fill');
    const capEl = document.getElementById('bf-cap');
    const enter = document.getElementById('intro-enter');
    let total = 0, cap = BF_CAP, online = false;
    try {
      const rooms = (queryServers ? await queryServers() : []) || [];
      total = rooms.reduce((s, r) => s + (r.clients || 0), 0);
      if (rooms.length) cap = rooms.reduce((s, r) => s + (r.maxClients || BF_CAP), 0);
      online = true;
    } catch { online = false; }
    cntEl.textContent = online ? `⚔ 在線 ${total} 名戰士` : '伺服器離線（可單機試玩）';
    fill.style.width = Math.min(100, (total / cap) * 100) + '%';
    capEl.textContent = online ? `容量 ${total} / ${cap}（KvK 每邊上限 50）` : '';
    enter.disabled = false;
    enter.textContent = '⚔ 參戰';
  }

  // ── 參戰 ──
  document.getElementById('intro-enter')?.addEventListener('click', () => {
    clearInterval(_pollTimer);
    screen.style.display = 'none';
    onEnter?.();
  });
}
