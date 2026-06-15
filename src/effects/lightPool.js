import * as THREE from 'three';

// ─── 固定光源池 ───────────────────────────────────────────────
// three.js 在「場上光源數量改變」時會重編譯所有受光材質的 shader，
// 場景材質多時 = 數秒凍結。因此所有瞬間光效（爆炸/砲口/技能脈衝/火球）
// 一律借用啟動時就放進場景的常駐光源（閒置時強度 0），數量恆定。

const _slots = [];

export function initLightPool(scene, count = 8) {
  for (let i = 0; i < count; i++) {
    const li = new THREE.PointLight(0xffffff, 0, 1);
    li.position.set(0, -100, 0);
    scene.add(li);
    _slots.push({ li, busy: false, t: 0, dur: 0, peak: 0 });
  }
}

function _acquireSlot() {
  let best = null;
  for (const s of _slots) {
    if (!s.busy) return s;
    // 全忙時：優先搶「脈衝」槽（dur 有限、即將結束），絕不搶跟隨光（避免別人的 handle 失效）
    if (s.dur !== Infinity && (!best || s.t > best.t)) best = s;
  }
  return best;
}

/** 光脈衝：在 pos 閃一下（intensity → 0），不增減場上光源數 */
export function pulseLight(pos, color, intensity = 6, dist = 8, dur = 0.2) {
  const s = _acquireSlot();
  if (!s) return;
  s.busy = true; s.t = 0; s.dur = dur; s.peak = intensity;
  s.follow = null;
  s.li.color.set(color);
  s.li.distance = dist;
  s.li.intensity = intensity;
  s.li.position.copy(pos);
}

/** 跟隨光：回傳 handle（set 更新位置 / release 歸還），給投射物用 */
export function acquireFollowLight(color, intensity = 4, dist = 6) {
  const s = _acquireSlot();
  if (!s) return { set() {}, setIntensity() {}, release() {} };
  s.busy = true; s.t = 0; s.dur = Infinity; s.peak = intensity;
  s.li.color.set(color);
  s.li.distance = dist;
  s.li.intensity = intensity;
  return {
    set(pos) { s.li.position.copy(pos); },
    setIntensity(v) { s.li.intensity = v; },
    release() { s.busy = false; s.li.intensity = 0; s.li.position.y = -100; },
  };
}

/** 每幀：脈衝衰減與歸還 */
export function updateLightPool(dt) {
  for (const s of _slots) {
    if (!s.busy || s.dur === Infinity) continue;
    s.t += dt;
    const k = s.t / s.dur;
    if (k >= 1) {
      s.busy = false;
      s.li.intensity = 0;
      s.li.position.y = -100;
    } else {
      s.li.intensity = s.peak * (1 - k);
    }
  }
}
