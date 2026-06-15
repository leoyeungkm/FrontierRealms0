import * as THREE from 'three';

// ─── 分段血條（Might is Right 式）────────────────────────────
// 每格 = 固定 HP（小格 25 / 粗線 100）→ 血量跨度大（小兵 70 ～ 主堡 1000）
// 時不用讀數字，看格數就知道單位強度。

const _texCache = {};

/** 格線貼圖（透明底 + 黑分隔線；每 4 小格一條粗線 = 100HP） */
export function segLinesTexture(segments) {
  const n = Math.max(2, Math.min(24, segments));
  if (_texCache[n]) return _texCache[n];
  const W = 144, H = 12;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  for (let i = 1; i < n; i++) {
    const x = Math.round(i * W / n);
    const major = i % 4 === 0;
    ctx.fillStyle = major ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - (major ? 1 : 0), 0, major ? 2 : 1, H);
  }
  const tex = new THREE.CanvasTexture(cv);
  _texCache[n] = tex;
  return tex;
}

/** 3D 血條格線 overlay（蓋在 fill 上）；segs < 2 回傳 null */
export function makeSegOverlay(width, height, maxHp, per = 25) {
  const segs = Math.ceil(maxHp / per);
  if (segs < 2) return null;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: segLinesTexture(segs), transparent: true, depthTest: false }),
  );
  m.renderOrder = 3;
  return m;
}

/** DOM 血條分段：在容器內疊一層格線 overlay（fill 之上） */
export function applyDomSegments(container, maxHp, per = 25) {
  if (!container) return;
  let ov = container.querySelector('.seg-ov');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'seg-ov';
    ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(ov);
  }
  const pct = (per / maxHp) * 100;
  ov.style.background = pct >= 50 ? 'none' :
    `repeating-linear-gradient(90deg, transparent 0 calc(${pct}% - 1px), rgba(0,0,0,0.55) calc(${pct}% - 1px) ${pct}%)`;
}
