// ─── 角色外觀自定（FEZ 風格裝備外觀）──────────────────────────
// 欄位：身形模型 / 服裝染色（染裝不染膚）/ 披風 / 頭部裝備 / 雙手武器外觀。
// localStorage 持久化；變更即時重建本地模型並廣播給其他玩家。
// 「人物」與「技能」完全分離：外觀只影響 render，技能組由裝備武器（Tab）決定。
// 面板內建即時 3D 預覽（獨立 mini renderer，只在面板開啟時渲染）。

import * as THREE from 'three';
import { warmupRig, createRiggedFromGltf } from '../entities/riggedCharacter.js';

export const APPEARANCE_MODELS = {
  knight:    { label: '騎士', url: 'models/chars/Knight.glb',       headgear: '頭盔',
               weapons: ['models/chars/sword_1handed.gltf', 'models/chars/shield_badge.gltf'] },
  barbarian: { label: '蠻族', url: 'models/chars/Barbarian.glb',    headgear: '帽飾',
               weapons: ['models/chars/axe_2handed.gltf', null] },
  rogue:     { label: '遊俠', url: 'models/chars/Rogue_Hooded.glb', headgear: null,   // 兜帽縫在頭上不可拆
               weapons: ['models/chars/dagger.gltf', null] },
};

// 相乘染色：用亮中間調，太深會把貼圖壓黑
export const APPEARANCE_TINTS = [
  { label: '原色', hex: null     },
  { label: '緋紅', hex: 0xe07a6a },
  { label: '湛藍', hex: 0x6ea2e0 },
  { label: '森綠', hex: 0x84c070 },
  { label: '紫晶', hex: 0xa88ad8 },
  { label: '琥珀', hex: 0xdec06a },
  { label: '玄灰', hex: 0x8e8e96 },
  { label: '雪白', hex: 0xf2f2f2 },
];

// FEZ 式 gear 欄位：頭部 / 身體 / 手部 / 腳部 / 背部（披風）逐件混搭。
// 三模型同骨架（41 joints 已驗證）→ 部件可跨模型替換。
const GEAR_DEFAULT = {
  knight:    { head: 'knight',    body: 'knight',    arms: 'knight',    legs: 'knight',    cape: 'knight' },
  barbarian: { head: 'barbarian', body: 'barbarian', arms: 'barbarian', legs: 'barbarian', cape: 'barbarian' },
  rogue:     { head: 'hood',      body: 'rogue',     arms: 'rogue',     legs: 'rogue',     cape: 'rogue' },
};

export const appearance = {
  model: 'knight',     // 基底（臉/骨架）
  head: 'knight',      // none | knight(盔) | barbarian(帽) | hood(兜帽)
  body: 'knight',      // knight | barbarian | rogue
  arms: 'knight',
  legs: 'knight',
  cape: 'knight',      // none | knight | barbarian | rogue
  tint: null,          // hex | null（原色）
  gsSkin: 'sword',     // 雙手武器外觀：'sword' | 'axe'
  chainItems: {},      // slot → Sui Cosmetic objectId（鏈上 NFT 來源；server 驗證 ownership）
  suiAddress: null,    // 已連接的 Sui 地址（server 綁定 / 驗證用）
};

/** 從持有的 NFT 裝備外觀（slot 變體 + 全域染色），記錄 objectId 供 server 驗證 */
export function equipNftCosmetic(item) {
  appearance[item.slot] = item.variant;
  if (item.tint != null && item.tint !== 0xFFFFFFFF) appearance.tint = item.tint;
  appearance.chainItems = { ...appearance.chainItems, [item.slot]: item.id };
  _changed('gear');
}

/** 設定已連接的 Sui 地址（main.js 在連接成功後呼叫；觸發廣播） */
export function setSuiAddress(addr) {
  appearance.suiAddress = addr || null;
  if (!addr) appearance.chainItems = {};
  _save(); _onChange?.('chain');
}

const LS_KEY = 'fr0_appearance';
try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  if (saved && APPEARANCE_MODELS[saved.model]) {
    Object.assign(appearance, GEAR_DEFAULT[saved.model], saved);
    // 舊版存檔（cape/headgear 布林）遷移
    if (typeof appearance.cape === 'boolean') {
      appearance.cape = appearance.cape ? appearance.model : 'none';
    }
    if (typeof saved.headgear === 'boolean') {
      appearance.head = saved.headgear ? GEAR_DEFAULT[appearance.model].head : 'none';
      delete appearance.headgear;
    }
  }
} catch { /* 壞資料：用預設 */ }

function _save() {
  // 不存執行期鏈上狀態（地址/objectId 應由實際連接重建，避免 stale）
  const { chainItems, suiAddress, ...persist } = appearance;
  localStorage.setItem(LS_KEY, JSON.stringify(persist));
}

/** 網路傳輸格式（緊湊陣列，v2 = 8 欄 + 第 9 欄鏈上驗證 payload）
 *  第 9 欄 { a: 地址, c: {slot:objectId} } 只供 server 驗證 ownership，
 *  其他 client 渲染遠端玩家時忽略它（變體/染色已在前 8 欄）。 */
export function appearanceToNet() {
  const a = appearance;
  const base = [a.model, a.tint ?? -1, a.gsSkin, a.head, a.body, a.arms, a.legs, a.cape];
  if (a.suiAddress && Object.keys(a.chainItems).length) {
    base.push({ a: a.suiAddress, c: a.chainItems });
  }
  return base;
}
export function appearanceFromNet(arr) {
  if (!Array.isArray(arr) || !APPEARANCE_MODELS[arr[0]]) return null;
  const model = arr[0];
  const base = {
    model,
    tint: Number(arr[1]) >= 0 ? Number(arr[1]) : null,
    ...GEAR_DEFAULT[model],
    gsSkin: 'sword',
  };
  if (arr.length >= 8) {   // v2
    base.gsSkin = arr[2] === 'axe' ? 'axe' : 'sword';
    if (['none', 'knight', 'barbarian', 'hood'].includes(arr[3])) base.head = arr[3];
    for (const [i, k] of [[4, 'body'], [5, 'arms'], [6, 'legs']]) {
      if (APPEARANCE_MODELS[arr[i]]) base[k] = arr[i];
    }
    if (arr[7] === 'none' || APPEARANCE_MODELS[arr[7]]) base.cape = arr[7];
  } else {                 // v1 舊 client：[model, tint, cape01, headgear01, gsSkin]
    base.cape = Number(arr[2]) ? model : 'none';
    base.head = Number(arr[3]) ? GEAR_DEFAULT[model].head : 'none';
    base.gsSkin = arr[4] === 'axe' ? 'axe' : 'sword';
  }
  return base;
}

// ─── 外觀 → 模型組裝（本地/預覽/遠端共用）─────────────────────
/** 按外觀設定載入所需 gltf 並組裝 rigged view；extra 可帶 tint（隊色）等 */
export async function buildAppearanceRig(app, extra = {}) {
  const M = APPEARANCE_MODELS;
  const base = M[app.model] || M.knight;
  const urls = new Set([base.url]);
  for (const k of [app.body, app.arms, app.legs, app.cape]) if (M[k]) urls.add(M[k].url);
  if (app.head === 'hood') urls.add(M.rogue.url);
  else if (M[app.head]) urls.add(M[app.head].url);
  const loaded = {};
  await Promise.all([...urls].map(async u => { loaded[u] = await warmupRig(u); }));
  const baseGltf = loaded[base.url];
  if (!baseGltf) return null;
  const g = (key) => (M[key] && loaded[M[key].url]) || null;

  const parts = {
    body: app.body === app.model ? null : g(app.body),
    arms: app.arms === app.model ? null : g(app.arms),
    legs: app.legs === app.model ? null : g(app.legs),
    cape: app.cape === 'none' ? 'none' : (app.cape === app.model ? null : g(app.cape)),
  };
  // 頭部：盔/帽=配件；兜帽=整顆頭替換；遊俠基底選盔/帽時換成該族的頭+飾
  if (app.head === 'none') {
    parts.headgear = 'none';
  } else if (app.head === 'hood') {
    parts.headgear = 'none';
    if (app.model !== 'rogue') parts.headRepl = g('rogue');
  } else {
    parts.headgear = app.head === app.model ? null : g(app.head);
    if (app.model === 'rogue') parts.headRepl = g(app.head);
  }

  return createRiggedFromGltf(baseGltf, { height: 1.7, bodyTint: app.tint, parts, ...extra });
}

// ─── 即時 3D 預覽（mini renderer，面板開啟時才渲染）────────────
let _pv = null;     // { renderer, scene, camera, holder, model, raf, last, on }
let _pvDeps = null; // { getWeapon, getWeaponTemplate } — 預覽掛「現在所用」的武器

export function initAppearancePreview(canvas, deps) {
  if (!canvas) return;
  _pvDeps = deps || null;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x55483a, 1.15));
  const dl = new THREE.DirectionalLight(0xfff2dc, 1.7);
  dl.position.set(1.5, 3, 2.2);
  scene.add(dl);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.08, 32),
    new THREE.MeshLambertMaterial({ color: 0x39415a }));
  disc.position.y = -0.04;
  scene.add(disc);
  const camera = new THREE.PerspectiveCamera(35, canvas.width / canvas.height, 0.1, 10);
  camera.position.set(0, 1.05, 3.4);   // 寬幅構圖：全身入鏡
  camera.lookAt(0, 0.85, 0);
  const holder = new THREE.Group();
  scene.add(holder);
  _pv = { renderer, scene, camera, holder, model: null, raf: 0, last: 0, on: false };
  _rebuildPreview();
}

let _pvReq = 0;
async function _rebuildPreview() {
  if (!_pv) return;
  const req = ++_pvReq;
  const v = await buildAppearanceRig(appearance);
  if (!v || req !== _pvReq || !_pv) return;
  if (_pv.model) _pv.holder.remove(_pv.model.group);
  _pv.model = v;
  _pv.holder.add(v.group);
  v.play('Idle');
  // 掛上玩家「現在所用」的武器（與遊戲內完全一致的 render）
  if (_pvDeps?.getWeaponTemplate && _pvDeps?.getWeapon) {
    try {
      const { r, l } = await _pvDeps.getWeaponTemplate(_pvDeps.getWeapon());
      if (req === _pvReq && _pv.model === v) v.setWeapons(r, l);
    } catch { /* 武器載入失敗：徒手預覽 */ }
  }
}

function _pvLoop(t) {
  if (!_pv || !_pv.on) return;
  const dt = Math.min(0.05, (t - _pv.last) / 1000 || 0.016);
  _pv.last = t;
  _pv.holder.rotation.y += dt * 0.7;   // 展示自轉
  _pv.model?.update(dt);
  _pv.renderer.render(_pv.scene, _pv.camera);
  _pv.raf = requestAnimationFrame(_pvLoop);
}
function _startPreview() {
  if (!_pv || _pv.on) return;
  _pv.on = true;
  _pv.last = performance.now();
  _rebuildPreview();   // 進面板時同步當前武器（Tab 換裝後再開也正確）
  _pv.raf = requestAnimationFrame(_pvLoop);
}
function _stopPreview() {
  if (!_pv) return;
  _pv.on = false;
  cancelAnimationFrame(_pv.raf);
}

// ─── UI 綁定 ─────────────────────────────────────────────────
let _onChange = null;

export function toggleAppearancePanel(force) {
  const el = document.getElementById('appearance-panel');
  if (!el) return false;
  const show = force !== undefined ? force : el.style.display !== 'flex';
  el.style.display = show ? 'flex' : 'none';
  if (show) { _syncUI(); _startPreview(); document.exitPointerLock?.(); }
  else _stopPreview();
  return show;
}

function _changed(kind = 'gear') {
  _save();
  _syncUI();
  if (kind !== 'weapon') _rebuildPreview();   // 預覽即時反映（武器另行 reattach）
  else _refreshPreviewWeapon();
  _onChange?.(kind);   // 遊戲內角色即時重建/換武器 + 廣播
}

/** 武器皮膚變更：預覽只重掛武器，不重建模型 */
async function _refreshPreviewWeapon() {
  if (!_pv?.model || !_pvDeps?.getWeaponTemplate || !_pvDeps?.getWeapon) return;
  const v = _pv.model;
  try {
    const { r, l } = await _pvDeps.getWeaponTemplate(_pvDeps.getWeapon());
    if (_pv.model === v) v.setWeapons(r, l);
  } catch { /* ignore */ }
}

function _syncUI() {
  document.querySelectorAll('.ap-model').forEach(b =>
    b.classList.toggle('q-on', b.dataset.m === appearance.model));
  document.querySelectorAll('.ap-part').forEach(b =>
    b.classList.toggle('q-on', appearance[b.dataset.part] === b.dataset.v));
  document.querySelectorAll('.ap-tint').forEach(b =>
    b.classList.toggle('ap-tint-on', String(b.dataset.t) === String(appearance.tint ?? 'null')));
  document.querySelectorAll('.ap-gs').forEach(b =>
    b.classList.toggle('q-on', b.dataset.g === appearance.gsSkin));
}

/** main.js 啟動時呼叫；onChange(kind) = 重建本地模型（'weapon' 只換武器）+ 廣播 */
export function initAppearanceUI(onChange) {
  _onChange = onChange;
  document.querySelectorAll('.ap-model').forEach(b =>
    b.addEventListener('click', () => {
      // 換身形 = 套整組該族 gear（再逐件微調）
      appearance.model = b.dataset.m;
      Object.assign(appearance, GEAR_DEFAULT[appearance.model]);
      _changed('model');
    }));
  document.querySelectorAll('.ap-part').forEach(b =>
    b.addEventListener('click', () => {
      appearance[b.dataset.part] = b.dataset.v;
      // 改用免費本地部件 → 解除該 slot 的鏈上 NFT 來源
      if (appearance.chainItems[b.dataset.part]) {
        const { [b.dataset.part]: _, ...rest } = appearance.chainItems;
        appearance.chainItems = rest;
      }
      _changed('gear');
    }));
  document.querySelectorAll('.ap-tint').forEach(b =>
    b.addEventListener('click', () => {
      appearance.tint = b.dataset.t === 'null' ? null : Number(b.dataset.t);
      _changed('tint');
    }));
  document.querySelectorAll('.ap-gs').forEach(b =>
    b.addEventListener('click', () => { appearance.gsSkin = b.dataset.g; _changed('weapon'); }));
  document.getElementById('ap-close')?.addEventListener('click', () => toggleAppearancePanel(false));
  _syncUI();
}
