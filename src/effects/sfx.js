// ─── 程序化音效（WebAudio 合成，零音檔）──────────────────────
// AudioContext 需要使用者手勢才能啟動：main.js 在 canvas click 時呼叫 initSfx()。
// 所有函數可帶 dist（與玩家距離，公尺）做衰減；50m 外靜音。

let ctx = null;
let master = null;
let _noiseBuf = null;

export function initSfx() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

function ready() { return ctx && ctx.state === 'running'; }

function noise() {
  if (_noiseBuf) return _noiseBuf;
  const len = ctx.sampleRate;
  _noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = _noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return _noiseBuf;
}

function att(dist) { return Math.max(0, 1 - (dist || 0) / 50); }

/** 噪聲爆發：filterType/freq 整形 + 指數衰減 */
function noiseBurst(vol, dur, filterType, freq, q = 1) {
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const f = ctx.createBiquadFilter();
  f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

/** 正弦/三角短音：freq 起訖掃頻 */
function tone(vol, dur, type, f0, f1) {
  const o = ctx.createOscillator();
  o.type = type;
  const t = ctx.currentTime;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

/** 揮擊嗖聲（whoosh）：按武器 × 三向變體整形
 *  [音量, 時長, 帶通頻率, Q]——頻率低=厚重、時長長=大弧、Q 高=風聲窄銳 */
const SWING_TBL = {
  sword_shield: { slash: [0.34, 0.12, 780, 2.4], overhead: [0.44, 0.17, 560, 2.2], stab: [0.30, 0.08, 1150, 3.0] },
  greatsword:   { slash: [0.52, 0.22, 410, 1.8], overhead: [0.62, 0.28, 330, 1.6], stab: [0.42, 0.13, 620, 2.2] },
  polearm:      { slash: [0.42, 0.18, 640, 2.6], overhead: [0.50, 0.21, 470, 2.2], stab: [0.36, 0.10, 1350, 3.4] },
};
export function sfxSwing(weapon = 'sword_shield', variant = 'slash') {
  if (!ready()) return;
  const w = SWING_TBL[weapon] || SWING_TBL.sword_shield;
  const [vol, dur, freq, q] = w[variant] || w.slash;
  noiseBurst(vol, dur, 'bandpass', freq, q);
  if (weapon === 'greatsword') tone(0.22, dur * 1.1, 'sine', 110, 55);                       // 大劍：低頻份量感
  if (weapon === 'polearm' && variant === 'stab') tone(0.12, 0.09, 'triangle', 900, 1500);   // 突刺「咻」上掃
}

/** 命中：高頻金屬擦聲 + 低頻肉感 thump
 *  50ms 節流：AoE 多目標 / 掃掠+結算同幀重複呼叫只響一聲 */
let _lastHitT = 0;
export function sfxHit(strong = false, dist = 0) {
  if (!ready()) return;
  const a = att(dist);
  if (a <= 0.02) return;
  if (ctx.currentTime - _lastHitT < 0.05) return;
  _lastHitT = ctx.currentTime;
  noiseBurst((strong ? 0.55 : 0.4) * a, 0.09, 'highpass', 2200, 0.8);
  tone((strong ? 0.5 : 0.32) * a, strong ? 0.16 : 0.1, 'sine', strong ? 130 : 160, 55);
}

/** 武技釋放（扇形斬擊技）：厚風壓 + 能量鳴響——讓「出技」聽起來不同於普攻 */
export function sfxSkill(heavy = false, dist = 0) {
  if (!ready()) return;
  const a = att(dist);
  if (a <= 0.02) return;
  noiseBurst((heavy ? 0.55 : 0.4) * a, heavy ? 0.3 : 0.2, 'bandpass', heavy ? 380 : 540, 1.6);
  tone((heavy ? 0.3 : 0.22) * a, heavy ? 0.26 : 0.18, 'triangle', 240, heavy ? 90 : 480);
}

/** 爆炸：低通噪聲長尾 + 50Hz 次低音 */
export function sfxExplosion(big = false, dist = 0) {
  if (!ready()) return;
  const a = att(dist);
  if (a <= 0.02) return;
  noiseBurst((big ? 0.9 : 0.6) * a, big ? 0.8 : 0.45, 'lowpass', big ? 420 : 600, 0.6);
  tone((big ? 0.7 : 0.4) * a, big ? 0.5 : 0.3, 'sine', big ? 90 : 110, 38);
}

/** 巨人砲口 */
export function sfxCannon(dist = 0) {
  if (!ready()) return;
  const a = att(dist);
  noiseBurst(0.7 * a, 0.25, 'lowpass', 900, 0.8);
  tone(0.5 * a, 0.2, 'triangle', 180, 60);
}

/** 側閃 / 跳躍輕嗖聲 */
export function sfxDash() {
  if (!ready()) return;
  noiseBurst(0.22, 0.16, 'bandpass', 900, 1.6);
}

/** 死亡悶響 */
export function sfxDeath(dist = 0) {
  if (!ready()) return;
  const a = att(dist);
  if (a <= 0.02) return;
  tone(0.4 * a, 0.3, 'sine', 100, 35);
  noiseBurst(0.2 * a, 0.2, 'lowpass', 350, 0.8);
}

/** 採礦叮聲 */
export function sfxMine() {
  if (!ready()) return;
  tone(0.18, 0.12, 'triangle', 1400 + Math.random() * 600, 900);
}

/** 施放/投射物發射：上揚能量嗖聲 */
export function sfxCast(dist = 0) {
  if (!ready()) return;
  const a = att(dist);
  if (a <= 0.02) return;
  noiseBurst(0.3 * a, 0.18, 'bandpass', 1200, 2.5);
  tone(0.22 * a, 0.2, 'sawtooth', 320, 760);
}

/** 地面重擊（AoE 落地：碎裂風暴/重墜/踐踏）*/
export function sfxSlam(dist = 0) {
  if (!ready()) return;
  const a = att(dist);
  if (a <= 0.02) return;
  noiseBurst(0.65 * a, 0.4, 'lowpass', 500, 0.7);
  tone(0.5 * a, 0.34, 'sine', 95, 34);
}

/** Buff 啟動：上行琶音（Embolden/強化防禦）*/
export function sfxBuff() {
  if (!ready()) return;
  tone(0.2, 0.16, 'triangle', 440, 660);
  setTimeout(() => { if (ready()) tone(0.2, 0.2, 'triangle', 660, 1100); }, 90);
}

/** 冰凍（Ice Bind）：高頻結晶 + 下行音 */
export function sfxFreeze(dist = 0) {
  if (!ready()) return;
  const a = att(dist);
  noiseBurst(0.3 * a, 0.35, 'highpass', 3500, 1.2);
  tone(0.25 * a, 0.4, 'sine', 900, 220);
}

/** 暗霧（Dark Mist）：低沉湧動 */
export function sfxMist() {
  if (!ready()) return;
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 240;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.35);   // 湧上來
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);  // 散去
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + 1.3);
}
