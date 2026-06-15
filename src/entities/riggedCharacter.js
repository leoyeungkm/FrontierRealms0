import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toonGradient } from './voxelCharacter.js';

// ─── KayKit 骨骼動畫角色（CC0）────────────────────────────────
// 設計：遊戲邏輯/FSM 完全不變，這裡只是「動畫輸出層」。
// 呼叫端在各狀態決策點呼叫 view.play(clipName, opts)，
// 同名剪輯不會重啟（除非 retrigger），切換時自動 crossfade。

const _loader = new GLTFLoader();
const _gltfCache = {};   // url → Promise<gltf|null>

export function preloadRig(url) {
  if (!_gltfCache[url]) _gltfCache[url] = _loader.loadAsync(url).catch(() => null);
  return _gltfCache[url];
}

/** 已載入完成的 gltf（未完成回傳 null，呼叫端走 fallback） */
export function getLoadedRig(url) {
  preloadRig(url);
  return _loadedRigs[url] || null;
}
const _loadedRigs = {};
export async function warmupRig(url) {
  const g = await preloadRig(url);
  if (g) _loadedRigs[url] = g;
  return g;
}

// ─── 武器模型（attach 到 handslot）────────────────────────────
const _weaponCache = {};
export function preloadWeapon(url) {
  if (!_weaponCache[url]) {
    _weaponCache[url] = _loader.loadAsync(url).then(g => {
      const grp = g.scene;
      grp.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          o.material = new THREE.MeshToonMaterial({ map: o.material.map, gradientMap: toonGradient() });
        }
      });
      return grp;
    }).catch(() => null);
  }
  return _weaponCache[url];
}

// ─── 跨模型部件混搭（FEZ 式 gear 欄位）────────────────────────
// KayKit 三模型共用同一 41-joint 骨架（順序已驗證一致）→
// donor 模型的 SkinnedMesh clone 後直接 `skeleton = base.skeleton` 重綁即可。
const _partNorm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
const PART_MATCH = {
  body:     n => n.endsWith('body'),
  arms:     n => n.endsWith('armleft') || n.endsWith('armright'),
  legs:     n => n.endsWith('legleft') || n.endsWith('legright'),
  headRepl: n => n.endsWith('head') || n.endsWith('headhooded'),
  headgear: n => n.endsWith('helmet') || n.endsWith('hat'),
  cape:     n => n.endsWith('cape'),
};

function _applyParts(group, parts) {
  let skel = null, parent = null;
  group.traverse(o => { if (!skel && o.isSkinnedMesh) { skel = o.skeleton; parent = o.parent; } });
  if (!skel || !parent) return;
  for (const key of Object.keys(PART_MATCH)) {
    const v = parts[key];
    if (v === undefined || v === null) continue;   // 不動：保留 base 原件
    const test = PART_MATCH[key];
    // 移除 base 的對應部件
    const del = [];
    group.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && test(_partNorm(o.name))) del.push(o); });
    for (const o of del) o.parent?.remove(o);
    if (v === 'none') continue;                    // 'none'：該欄位空裝備
    // 從 donor gltf clone 部件並重綁到 base 骨架
    const src = [];
    v.scene.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && test(_partNorm(o.name))) src.push(o); });
    for (const s of src) {
      const m = s.clone();
      if (m.isSkinnedMesh) {
        m.skeleton = skel;       // 同骨序 → 直接重綁
        parent.add(m);
      } else {
        // 配件（盔/帽/披風）是掛在骨骼下的普通 mesh（Helmet→head、Cape→chest），
        // 其 transform 相對掛點骨 → 必須掛到 base 的「同名骨」，掛 Rig 根會跑到身體
        const slotName = s.parent?.name || '';
        let slot = null;
        group.traverse(o => { if (!slot && o.name === slotName) slot = o; });
        (slot || parent).add(m);
      }
    }
  }
}

/**
 * 從已載入的 gltf 建立角色實例（SkeletonUtils.clone 處理 SkinnedMesh）。
 * opts: { tint: 全身染色（小兵隊色用）, height: 目標身高(m),
 *         cape: 顯示披風（預設 true）, headgear: 顯示頭盔/帽（預設 true）,
 *         bodyTint: 服裝染色 hex（只染身體/四肢，不染頭臉；FEZ 染裝不染膚）,
 *         parts: { body|arms|legs|headRepl|headgear|cape: donorGltf | 'none' | null }
 *                跨模型 gear 混搭；提供 parts 時忽略 cape/headgear 布林開關 }
 */
export function createRiggedFromGltf(gltf, opts = {}) {
  const group = SkeletonUtils.clone(gltf.scene);
  if (opts.parts) _applyParts(group, opts.parts);

  // per-instance Toon 材質（tint / emissive 不能共用）
  const mats = [];
  group.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false;   // 骨骼動畫包圍盒不更新，防止視角邊緣消失
      const m = new THREE.MeshToonMaterial({ map: o.material.map, gradientMap: toonGradient() });
      if (opts.tint != null) m.color.set(opts.tint);
      // 服裝染色：身體/手/腳/披風（白=原色，相乘染色，與隊色 tint 疊加）；
      // 頭不染（臉/髮保持貼圖原色——FEZ 染裝不染膚）
      if (opts.bodyTint != null && /body|armleft|armright|legleft|legright|cape/i.test(o.name)) {
        m.color.multiply(new THREE.Color(opts.bodyTint));
      }
      o.material = m;
      mats.push(m);
    }
  });

  // 身高正規化
  if (opts.height) {
    const box = new THREE.Box3().setFromObject(group);
    const h = Math.max(0.001, box.max.y - box.min.y);
    group.scale.setScalar(opts.height / h);
  }

  // 武器掛點：GLTFLoader 會消毒節點名（'handslot.r' → 'handslotr'），
  // 用正規化名稱比對，不能用 getObjectByName('handslot.r')
  let handR = null, handL = null;
  const builtin = [];
  group.traverse(o => {
    const norm = (o.name || '').toLowerCase().replace(/[^a-z]/g, '');
    if (norm === 'handslotr') handR = o;
    else if (norm === 'handslotl') handL = o;
    if (!o.isMesh) return;   // 絕不能碰骨骼（例如 elbowIK 會被 /bow/ 誤中）
    // 模型自帶的手持裝備（劍/盾/斧/刀/酒杯/投擲物…）一律移除
    if (/sword|shield|axe|crossbow|dagger|wand|staff|knife|throwable|mug/i.test(o.name)) builtin.push(o);
    // 配件布林開關（無 parts 的舊路徑：小兵/召喚物用）
    else if (!opts.parts && opts.cape === false && /cape/i.test(o.name)) builtin.push(o);
    else if (!opts.parts && opts.headgear === false && /helmet|hat/i.test(o.name)) builtin.push(o);
  });
  for (const o of builtin) {
    o.visible = false;
    if (o.parent) o.parent.remove(o);
  }

  const mixer = new THREE.AnimationMixer(group);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = { clip, action: mixer.clipAction(clip) };

  let current = null, currentName = '';

  const api = {
    group, mixer, mats, handR, handL,
    weaponR: null,            // 目前右手武器（拖尾取刀尖用）
    weaponTipY: 1, weaponBaseY: 0.2,

    /**
     * 播放剪輯。同名且非 retrigger 時不重啟（每幀安全呼叫）。
     * opts: once（單次）、dur（把剪輯縮放到此秒數）、clamp（停在最後一幀）、
     *       fade（crossfade 秒數）、timeScale、retrigger（強制重啟）
     */
    play(name, { once = false, dur = 0, clamp = false, fade = 0.15, timeScale = 1, retrigger = false } = {}) {
      const entry = actions[name];
      if (!entry) return null;
      if (currentName === name && !retrigger) {
        if (!once && timeScale !== 1) entry.action.timeScale = timeScale;
        return entry.action;
      }
      const a = entry.action;
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = clamp;
      a.timeScale = dur > 0 ? entry.clip.duration / dur : timeScale;
      a.enabled = true;
      if (current && current !== a) {
        a.crossFadeFrom(current, fade, false);
      }
      a.play();
      current = a;
      currentName = name;
      return a;
    },

    isPlaying(name) { return currentName === name; },
    setTimeScale(ts) { if (current) current.timeScale = ts; },
    update(dt) { mixer.update(dt); },

    setEmissive(hex, intensity) {
      for (const m of mats) { m.emissive.setHex(hex); m.emissiveIntensity = intensity; }
    },

    /** 掛武器：right = 主手模型(Object3D)，left = 副手（盾），null = 清空 */
    setWeapons(right, left) {
      if (handR) { for (const c of [...handR.children]) handR.remove(c); }
      if (handL) { for (const c of [...handL.children]) handL.remove(c); }
      api.weaponR = null;
      if (right && handR) {
        const w = right.clone();
        handR.add(w);
        api.weaponR = w;
        // 刀尖/刀根（局部 Y 範圍）供拖尾使用
        const box = new THREE.Box3().setFromObject(right);
        api.weaponTipY  = box.max.y;
        api.weaponBaseY = box.max.y * 0.25;
      }
      if (left && handL) handL.add(left.clone());
    },
  };
  return api;
}

/** 便利包裝：等 gltf 載好再建實例（玩家用） */
export async function createRigged(url, opts = {}) {
  const gltf = await warmupRig(url);
  if (!gltf) return null;
  return createRiggedFromGltf(gltf, opts);
}
