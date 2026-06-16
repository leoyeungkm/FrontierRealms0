// ─── 選單角色預覽（小型 3D，旋轉展示）──────────────────────────
// 在世界地圖選單顯示目前角色的造形（用 buildAppearanceRig 組裝同一套外觀）。
// 自帶獨立 renderer，不與外觀面板(O)的預覽衝突；WebGL 失敗則安靜略過。
import * as THREE from 'three';
import { buildAppearanceRig } from './appearance.js';

let _r = null, _scene = null, _cam = null, _holder = null, _model = null, _raf = null, _t0 = 0, _req = 0;

export function disposeCharPreview() {
  _req++;
  if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
  if (_r) { try { _r.dispose(); } catch { /* noop */ } _r = null; }
  _scene = _cam = _holder = _model = null;
}

export async function initCharPreview(canvas, appearance) {
  if (!canvas) return false;
  disposeCharPreview();
  const req = ++_req;
  let r;
  try { r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); }
  catch { return false; }
  if (!r.getContext()) return false;
  _r = r;
  const w = canvas.clientWidth || 96, h = canvas.clientHeight || 120;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.setSize(w, h, false);
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;

  _scene = new THREE.Scene();
  _scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x55483a, 1.2));
  const dl = new THREE.DirectionalLight(0xfff2dc, 1.7); dl.position.set(1.5, 3, 2.2); _scene.add(dl);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.06, 28),
    new THREE.MeshLambertMaterial({ color: 0x39415a }));
  disc.position.y = -0.02; _scene.add(disc);
  _cam = new THREE.PerspectiveCamera(32, w / h, 0.1, 10);
  _cam.position.set(0, 1.05, 3.2); _cam.lookAt(0, 0.85, 0);
  _holder = new THREE.Group(); _scene.add(_holder);

  try {
    const v = await buildAppearanceRig(appearance);
    if (v && _r && req === _req) { _model = v; _holder.add(v.group); v.play('Idle'); }
  } catch { /* 模型載入失敗：留空轉盤 */ }

  _t0 = performance.now();
  const animate = () => {
    if (!_r || req !== _req) return;
    _raf = requestAnimationFrame(animate);
    const t = (performance.now() - _t0) / 1000;
    _holder.rotation.y = t * 0.6;          // 展示自轉
    _model?.update(0.016);
    _r.render(_scene, _cam);
  };
  animate();
  return true;
}

/** 一次性離屏渲染角色造形 → 回傳 PNG dataURL（mint NFT 的預覽圖；存 Walrus 用）。 */
export async function captureHeroImage(appearance, size = 256) {
  let r;
  try { r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); }
  catch { return null; }
  r.setSize(size, size, false);
  r.setClearColor(0x0c1018, 1);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x55483a, 1.2));
  const dl = new THREE.DirectionalLight(0xfff2dc, 1.7); dl.position.set(1.5, 3, 2.2); scene.add(dl);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 10);
  cam.position.set(0, 1.05, 3.2); cam.lookAt(0, 0.85, 0);
  let url = null;
  try {
    const v = await buildAppearanceRig(appearance);
    if (v) { scene.add(v.group); v.play('Idle'); v.update(0.1); }
    r.render(scene, cam);
    url = r.domElement.toDataURL('image/png');
  } catch { /* 失敗回 null */ }
  try { r.dispose(); } catch { /* noop */ }
  return url;
}
