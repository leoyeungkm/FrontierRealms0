import { ROUND_DURATION, LOBBY_DURATION, CD_DURATION, SUMMON_DEFS } from '../constants.js';
import { applyDomSegments } from './segbar.js';
import { t } from './i18n.js';

// ─── DOM refs（模組載入時取得一次）──────────────────────────
const hpFill     = document.getElementById('hp-fill');
const announceEl = document.getElementById('announce');
const statusEl   = document.getElementById('status');
const flashEl    = document.getElementById('damage-flash');
const elWave     = document.getElementById('round-wave-label');
const elCountdown = document.getElementById('round-countdown');
const elPhase    = document.getElementById('round-phase');

let announceTimer = null;
let flashTO       = null;

// ─── 分段血條初始化（Might is Right 式：每格固定 HP）─────────
// HP/PW/SP = 100 → 25/格四段；主堡 1000 → 100/格十段
for (const id of ['hp-fill', 'pw-fill', 'sp-fill']) {
  applyDomSegments(document.getElementById(id)?.parentElement, 100, 25);
}
applyDomSegments(document.getElementById('keep-bar-1'), 1000, 100);
applyDomSegments(document.getElementById('keep-bar-2'), 1000, 100);

// ─── 純工具 ──────────────────────────────────────────────────
export function fmtTime(s) {
  return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
}

// ─── 玩家 HP ─────────────────────────────────────────────────
export function updateHpBar(hp) {
  hpFill.style.width      = Math.max(0, hp) + '%';
  hpFill.style.background = `hsl(${Math.max(0, hp) * 1.2},90%,45%)`;
}

// ─── PW 條 ───────────────────────────────────────────────────
export function updatePwBar(pw, maxPw) {
  document.getElementById('pw-fill').style.width = (pw / maxPw * 100) + '%';
}

// ─── SP 耐力條 ───────────────────────────────────────────────
const spFill = document.getElementById('sp-fill');
export function updateSpBar(sp, maxSp) {
  if (spFill) spFill.style.width = (sp / maxSp * 100) + '%';
}

// ─── 水晶數量 ────────────────────────────────────────────────
export function updateCrystalHUD(crystalCount) {
  const el = document.getElementById('crystal-count');
  if (el) el.textContent = crystalCount;
}

// ─── 召喚物 HUD ──────────────────────────────────────────────
/** isSummoned, summonType, summonHp, summonMaxHp */
export function updateSummonHUD(isSummoned, summonType, summonHp, summonMaxHp) {
  const status = document.getElementById('summon-status');
  if (!status) return;
  if (isSummoned) {
    status.style.display = 'block';
    document.getElementById('summon-name').textContent = SUMMON_DEFS[summonType].name;
    const pct = Math.max(0, summonHp / summonMaxHp * 100);
    const fill = document.getElementById('summon-hp-fill');
    fill.style.width = pct + '%';
    applyDomSegments(fill.parentElement, summonMaxHp, 100);   // 召喚體型大 → 100/格
    document.getElementById('summon-hp-text').textContent = summonHp + ' / ' + summonMaxHp;
  } else {
    status.style.display = 'none';
  }
}

// ─── 主堡血條 ────────────────────────────────────────────────
export function updateKeepBar(keepHp1, keepHp2, maxKeepHp) {
  const el1 = document.getElementById('keep-fill-1');
  const el2 = document.getElementById('keep-fill-2');
  const t1  = document.getElementById('keep-hp-text-1');
  const t2  = document.getElementById('keep-hp-text-2');
  if (el1) el1.style.width = Math.max(0, keepHp1 / maxKeepHp * 100) + '%';
  if (el2) el2.style.width = Math.max(0, keepHp2 / maxKeepHp * 100) + '%';
  if (t1)  t1.textContent  = keepHp1 + ' / ' + maxKeepHp;
  if (t2)  t2.textContent  = keepHp2 + ' / ' + maxKeepHp;
}

// ─── 回合計時器（測試模式：持續戰鬥，顯示經過時間）────────────
export function updateRoundTimer(serverTime) {
  elWave.textContent = t('g_test_field');
  elPhase.textContent = t('g_continuous');
  elCountdown.textContent = fmtTime(Math.floor(serverTime / 1000));
  elCountdown.style.color = '#aad4ff';
}

// ─── 傷害/公告 ───────────────────────────────────────────────
export function flashDamage() {
  flashEl.style.opacity = '1';
  clearTimeout(flashTO);
  flashTO = setTimeout(() => { flashEl.style.opacity = '0'; }, 200);
}

export function flashKeepBar(team) {
  const bar = document.getElementById('keep-bar-' + team);
  if (!bar) return;
  bar.classList.remove('keep-bar-hit');
  void bar.offsetWidth; // reflow
  bar.classList.add('keep-bar-hit');
  bar.addEventListener('animationend', () => bar.classList.remove('keep-bar-hit'), { once: true });
}

export function showAnnounce(text) {
  announceEl.textContent = text;
  announceEl.style.opacity = '1';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { announceEl.style.opacity = '0'; }, 3000);
}

export function setStatus(text) {
  statusEl.textContent = text;
  statusEl.style.display = text ? 'block' : 'none';
}

// ─── 遊戲結束（純 DOM，state 改寫由 main.js 處理）──────────
/** isMyKeep = 被摧毀的是自己的主堡（輸了） */
export function showGameOver(isMyKeep) {
  const title = document.getElementById('gameover-title');
  const sub   = document.getElementById('gameover-sub');
  if (title) title.textContent = isMyKeep ? t('g_go_lose') : t('g_go_win');
  if (title) title.style.color = isMyKeep ? '#ff2222' : '#ffcc00';
  if (sub)   sub.textContent   = isMyKeep ? t('g_go_lose_sub') : t('g_go_win_sub');
  document.getElementById('gameover-screen').style.display = 'flex';
  document.exitPointerLock();
}
