// ─── 開場畫面：登入（zkLogin / 錢包 / 訪客）+ 選國 ────────────
// fit Sui hackathon：把登入流程放到進遊戲前，所屬國 = 服裝旗色（allegiance）。
import { suiState, onSuiChange, connectWallet, connectZkLogin } from '../sui/wallet.js';
import { suiEnabled } from '../sui/config.js';
import { appearance, setSuiAddress } from './appearance.js';

// 5+1 國（白皮書：每週 5 國混戰）；顏色 = 服裝染色 allegiance
export const NATIONS = [
  { id: 'azure',   name: '蒼藍', color: 0x4f86d8 },
  { id: 'crimson', name: '緋焰', color: 0xd85050 },
  { id: 'verdant', name: '碧森', color: 0x5aa85a },
  { id: 'gold',    name: '鎏金', color: 0xd8b84a },
  { id: 'violet',  name: '紫曜', color: 0xa86ad8 },
  { id: 'frost',   name: '霜白', color: 0xc8d4e6 },
];
export let selectedNation = null;

function _status(msg, ok) {
  const el = document.getElementById('intro-status');
  if (el) { el.textContent = msg; el.classList.toggle('ok', !!ok); }
}

/** onEnter：使用者按「進入戰場」時呼叫（main.js 在此真正連線） */
export function initIntro(onEnter) {
  const screen = document.getElementById('intro-screen');
  if (!screen) { onEnter?.(); return; }

  // 國家選擇
  const nat = document.getElementById('intro-nations');
  nat.innerHTML = NATIONS.map(n =>
    `<button class="nation-btn" data-id="${n.id}" style="--nc:#${n.color.toString(16).padStart(6, '0')}"><span class="nation-dot"></span>${n.name}</button>`
  ).join('');
  const enterBtn = document.getElementById('intro-enter');
  nat.querySelectorAll('.nation-btn').forEach(b => b.addEventListener('click', () => {
    selectedNation = NATIONS.find(n => n.id === b.dataset.id);
    nat.querySelectorAll('.nation-btn').forEach(x => x.classList.toggle('sel', x === b));
    appearance.tint = selectedNation.color;   // 所屬國 = 旗色（服裝染色）
    enterBtn.disabled = false;
    enterBtn.textContent = `以「${selectedNation.name}」進入戰場 ⚔`;
  }));

  // 登入
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
  document.getElementById('intro-guest')?.addEventListener('click', () => {
    _status('訪客模式——可先試玩，之後仍可在外觀面板（O）登入上鏈');
  });

  // 登入狀態（zkLogin 回跳 / 錢包連上都會觸發）
  const showLogin = (s) => {
    if (s.connected && s.address) {
      _status(`已登入 ${s.address.slice(0, 6)}…${s.address.slice(-4)}（${s.mode === 'zklogin' ? 'Google' : '錢包'}）`, true);
    }
  };
  onSuiChange(showLogin);
  showLogin(suiState);

  // 進入戰場
  enterBtn?.addEventListener('click', () => {
    if (!selectedNation) return;
    screen.style.display = 'none';
    onEnter?.();
  });
}
