// ─── 世界戰略地圖（Three.js）— 幻想戰記式國戰 ──────────────────
// 五王國環繞 + 中央 Aeloria 爭奪區。首都→本土小爭奪地→中央戰場（串連，相鄰才能打），
// 各國本土領地再互連成環。相機可拖曳旋轉 / 滾輪縮放 / 點國家 caption 聚焦。
// 目前只開放 Minas(藍)/Calaadia(紅)；點中央 Aeloria 進遊戲。
import * as THREE from 'three';

const H = 440;
let _renderer = null, _scene, _cam, _raf = null, _ro = null, _t0 = 0, _container = null;
let _spin = [], _clickables = [], _kingAngles = [];
let _handlers = null;
// 球面相機
let _camR = 13.5, _camRT = 13.5, _camPhi = 0.82, _camTheta = Math.PI / 2, _camThetaT = Math.PI / 2;
let _kingCaps = [], _kingSectors = [], _selKing = -1, _onSelKing = () => {};
const _camLook = new THREE.Vector3(0, 0.3, 0), _camLookT = new THREE.Vector3(0, 0.3, 0);
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();

export function disposeMapScene() {
  if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
  try { _ro?.disconnect(); } catch { /* noop */ } _ro = null;
  if (_renderer) {
    const cv = _renderer.domElement;
    if (_handlers) for (const [ev, fn] of _handlers) cv.removeEventListener(ev, fn);
    try { _renderer.dispose(); } catch { /* noop */ }
    cv?.remove(); _renderer = null;
  }
  if (_container) { _container.style.height = ''; _container = null; }
  _scene = _cam = null; _spin = []; _clickables = []; _kingAngles = []; _kingCaps = []; _kingSectors = []; _selKing = -1; _handlers = null;
}

/** 點國家 → 相機飛近並聚焦該王國領地 + 標記為選取（金環高亮 + 勢力色塊提亮） */
export function focusKingdom(i) {
  if (_kingAngles[i] === undefined) return;
  _camThetaT = _kingAngles[i];
  _camRT = 8.6;
  const c = _kingCaps[i];
  if (c) _camLookT.set(c[0] * 0.5, 0.3, c[1] * 0.5);   // 看向「首都↔中央」之間，該國領地入鏡
  _selectKingdom(i);
}
/** 縮回全景（看整個 Aeloria） */
export function resetMapCam() { _camRT = 13.5; _camLookT.set(0, 0.3, 0); _selectKingdom(-1); }
function _selectKingdom(i) {
  _selKing = i;
  _kingSectors.forEach((s, j) => { if (s) s.mat.opacity = j === i ? s.baseOp * 2.6 : s.baseOp; });
}

function _radial(inner, outer) {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, inner); grd.addColorStop(0.45, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function _glow(colorHex, size) {
  const c = new THREE.Color(colorHex);
  const inner = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},0.95)`;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: _radial(inner, 'rgba(0,0,0,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.scale.set(size, size, 1); return sp;
}
function _label(text, color, scale = 1) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = '700 30px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.95)'; g.shadowBlur = 8; g.fillStyle = color; g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sp.scale.set(2.6 * scale, 0.66 * scale, 1); sp.renderOrder = 10; return sp;
}
function _node(colorHex, r, emissive) {
  return new THREE.Mesh(
    new THREE.IcosahedronGeometry(r, 0),
    new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: emissive, metalness: 0.5, roughness: 0.35, flatShading: true }),
  );
}
function _line(p1, p2, colorHex, opacity, y = 0.05) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p1[0], y, p1[1]), new THREE.Vector3(p2[0], y, p2[1])]),
    new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity }),
  );
}
// 扇形版圖（xz 平面，world x=cos、z=sin，精確對齊國家方位）→ 拼成整張圓形地圖
function _sector(ang, half, rIn, rOut, colorHex, opacity) {
  const segs = 20, pos = [], idx = [];
  for (let s = 0; s <= segs; s++) {
    const a = ang - half + 2 * half * (s / segs), cx = Math.cos(a), cz = Math.sin(a);
    pos.push(rIn * cx, 0, rIn * cz, rOut * cx, 0, rOut * cz);
  }
  for (let s = 0; s < segs; s++) { const b = s * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  m.position.y = 0.01; return m;
}
function _updateCam() {
  const sp = Math.sin(_camPhi);
  _cam.position.set(
    _camLook.x + _camR * sp * Math.cos(_camTheta),
    _camLook.y + _camR * Math.cos(_camPhi),
    _camLook.z + _camR * sp * Math.sin(_camTheta),
  );
  _cam.lookAt(_camLook);
}

export function initMapScene(container, { kingdoms = [], onSelectMap = () => {}, onSelectKingdom = () => {} } = {}) {
  if (!container) return false;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); if (!renderer.getContext()) return false; }
  catch { return false; }
  disposeMapScene();
  try {
    _renderer = renderer; _container = container;
    _camR = _camRT = 13.5; _camPhi = 0.82; _camTheta = _camThetaT = Math.PI / 2;
    _camLook.set(0, 0.3, 0); _camLookT.set(0, 0.3, 0); _selKing = -1; _onSelKing = onSelectKingdom;
    container.style.position = 'relative'; container.style.height = H + 'px';
    const W = container.clientWidth || 640;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H); renderer.setClearColor(0x000000, 0);
    const cv = renderer.domElement; cv.style.position = 'absolute'; cv.style.inset = '0'; cv.style.cursor = 'grab';
    container.insertBefore(cv, container.firstChild);

    _scene = new THREE.Scene();
    _cam = new THREE.PerspectiveCamera(42, W / H, 0.1, 200); _updateCam();
    _scene.add(new THREE.AmbientLight(0x6677aa, 0.95));
    const keyL = new THREE.PointLight(0x9ab4ff, 1.3, 90); keyL.position.set(5, 11, 8); _scene.add(keyL);

    // 星空
    const SN = 240, sp = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) { sp[i * 3] = (Math.random() - 0.5) * 64; sp[i * 3 + 1] = 6 + Math.random() * 26; sp[i * 3 + 2] = (Math.random() - 0.5) * 64 - 12; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x9fb4e6, size: 0.14, transparent: true, opacity: 0.8, map: _radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), depthWrite: false }));
    _scene.add(stars); _spin.push({ obj: stars, kind: 'stars' });

    // 地台
    const disc = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshBasicMaterial({ color: 0x0c1224, transparent: true, opacity: 0.5 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -0.06; _scene.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(8.5, 9, 64), new THREE.MeshBasicMaterial({ color: 0x3a4a78, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; _scene.add(ring);

    // ── 中央 Aeloria 爭奪區：多張戰場（有歸屬 + 相鄰連線；點選看戰況）──
    const NCOL = [0x4f86d8, 0xd5494a];   // 0 Minas / 1 Calaadia
    const CMAPS = [
      { name: 'Aeloria',     pos: [0, 0],       state: 'war', enter: true },   // 交戰中戰場
      { name: 'Borderlands', pos: [2.3, 0.2],   owner: 1 },                    // Calaadia 佔
      { name: 'Old Ruins',   pos: [-1.5, 1.9],  owner: -1 },                   // 中立
      { name: 'Twin Gates',  pos: [-1.6, -1.8], owner: 0 },                    // Minas 佔
    ];
    const _mcol = (m) => m.state === 'war' ? 0x8fb0ff : m.owner === 0 ? NCOL[0] : m.owner === 1 ? NCOL[1] : 0x7484b4;
    for (const [a, b] of [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3]]) _scene.add(_line(CMAPS[a].pos, CMAPS[b].pos, 0x6f86d0, 0.35));
    const selRing = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 44), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 }));
    selRing.rotation.x = Math.PI / 2; selRing.position.y = 0.06; selRing.visible = false; _scene.add(selRing);
    const _selMap = (idx) => { selRing.visible = true; selRing.position.set(CMAPS[idx].pos[0], 0.06, CMAPS[idx].pos[1]); };
    CMAPS.forEach((m, idx) => {
      const g = new THREE.Group(); g.position.set(m.pos[0], 0, m.pos[1]); _scene.add(g);
      const col = _mcol(m), war = m.state === 'war';
      const core = _node(col, war ? 0.55 : 0.34, war ? 0.85 : 0.55); g.add(core);
      if (war) {
        g.add(_glow(0x6f9aff, 3.8)); _spin.push({ obj: core, kind: 'core' });
        // 交戰中：橙紅 radar 脈動環（特別顯示）
        const pr = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 44),
          new THREE.MeshBasicMaterial({ color: 0xff9a6a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
        pr.rotation.x = -Math.PI / 2; pr.position.y = 0.03; g.add(pr);
        _spin.push({ obj: pr, kind: 'pulse' });
      }
      const lbl = _label((war ? '⚔ ' : '') + m.name, war ? '#dfeaff' : '#cdd8ef', war ? 1.05 : 0.82);
      lbl.position.set(0, war ? 1.25 : 0.95, 0); g.add(lbl);
      _clickables.push({ mesh: core, onClick: () => { resetMapCam(); _selMap(idx); onSelectMap({ ...m, idx }); } });
    });
    // 紅藍交戰：兩國從本土領地朝中央 Aeloria 行軍（前進光點，表示兩國正在交戰）
    const _march = (from, to, colorHex) => {
      for (let mk = 0; mk < 3; mk++) { const g = _glow(colorHex, 0.85); _scene.add(g); _spin.push({ obj: g, kind: 'march', from, to, phase: mk / 3 }); }
    };
    _march(CMAPS[3].pos, CMAPS[0].pos, NCOL[0]);   // Twin Gates(Minas 藍) → Aeloria
    _march(CMAPS[1].pos, CMAPS[0].pos, NCOL[1]);   // Borderlands(Calaadia 紅) → Aeloria
    // 不預設選取：等使用者點地圖才顯示該地圖戰況與出征鈕

    // ── 五王國：首都 → 本土小爭奪地（串）→ 中央戰場 ──
    const KR = 6.7, N = kingdoms.length || 5;
    const _lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const homeT = [];   // 各國最靠首都的領地（用來連成外環）
    kingdoms.forEach((k, i) => {
      const ang = -Math.PI / 2 + i * (2 * Math.PI / N); _kingAngles[i] = ang;
      const cap = [Math.cos(ang) * KR, Math.sin(ang) * KR];
      const col = k.color, emi = k.active ? 0.7 : 0.28, op = k.active ? 0.55 : 0.2;
      const labelCol = k.active ? '#eaf2ff' : '#' + new THREE.Color(col).getHexString();

      _kingCaps[i] = cap;
      // 信長之野望式勢力國土：從中央往外的扇形版圖（相鄰國邊界相接，拼成整張地圖）
      const half = Math.PI / N - 0.015;   // 兩國之間留一點縫＝國界
      const sect = _sector(ang, half, 2.9, 8.3, col, op * 0.5); _scene.add(sect);
      _kingSectors[i] = { mat: sect.material, baseOp: op * 0.5 };
      // 兩側 radial 國界線
      for (const sgn of [-1, 1]) {
        const ab = ang + sgn * (Math.PI / N);
        _scene.add(_line([2.9 * Math.cos(ab), 2.9 * Math.sin(ab)], [8.3 * Math.cos(ab), 8.3 * Math.sin(ab)], k.active ? 0x9fb4e6 : 0x4a5680, k.active ? 0.42 : 0.2, 0.02));
      }

      const capG = new THREE.Group(); capG.position.set(cap[0], 0, cap[1]); _scene.add(capG);
      const capNode = _node(col, 0.42, emi);
      capG.add(capNode);
      if (k.active) capG.add(_glow(k.color, 2.2));
      capG.add(_label(k.name, labelCol, 0.9).translateY(1.0));
      // 點首都/領土 → 飛近聚焦該國 + 回呼 intro（active 才設為效忠國）
      const _pick = () => { focusKingdom(i); _onSelKing({ index: i, name: k.name, active: !!k.active }); };
      _clickables.push({ mesh: capNode, onClick: _pick });
      _clickables.push({ mesh: sect, onClick: _pick });

      let nearest = CMAPS[0], nd = Infinity;
      for (const m of CMAPS) { const d = (m.pos[0] - cap[0]) ** 2 + (m.pos[1] - cap[1]) ** 2; if (d < nd) { nd = d; nearest = m; } }
      const dir = [nearest.pos[0] - cap[0], nearest.pos[1] - cap[1]];
      const dl = Math.hypot(dir[0], dir[1]) || 1, perp = [-dir[1] / dl, dir[0] / dl];

      const tn = Math.max(1, Math.min(3, k.terr || 1));
      let prev = cap;
      for (let j = 1; j <= tn; j++) {
        const base = _lerp(cap, nearest.pos, j / (tn + 1));
        const off = (j < tn) ? (j % 2 ? 1 : -1) * 0.5 : 0;
        const pos = [base[0] + perp[0] * off, base[1] + perp[1] * off];
        const tm = _node(col, 0.22, emi * 0.7); tm.position.set(pos[0], 0, pos[1]); _scene.add(tm);
        _scene.add(_line(prev, pos, col, op));
        if (j === 1) homeT[i] = pos;     // 最靠首都的領地
        prev = pos;
      }
      const front = _line(prev, nearest.pos, col, k.active ? 0.6 : 0.18); _scene.add(front);
      if (k.active) _spin.push({ obj: front, kind: 'beam', phase: i * 1.3 });
    });

    // 本土小爭奪地互連成外環（鄰國領地相連）
    for (let i = 0; i < homeT.length; i++) {
      const a = homeT[i], b = homeT[(i + 1) % homeT.length];
      if (a && b) _scene.add(_line(a, b, 0x5a6788, 0.22));
    }

    // ── 互動：拖曳旋轉 / 滾輪縮放 / 點中央進遊戲 ──
    const _hit = (e) => {
      const rect = cv.getBoundingClientRect();
      _ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      _ray.setFromCamera(_ndc, _cam);
      return _clickables.find(c => _ray.intersectObject(c.mesh, false).length);
    };
    let drag = false, moved = 0, lx = 0, ly = 0;
    const onDown = (e) => { drag = true; moved = 0; lx = e.clientX; ly = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch { /* noop */ } };
    const onMove = (e) => {
      if (drag) {
        const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
        _camTheta -= dx * 0.006; _camThetaT = _camTheta;
        _camPhi = Math.min(1.35, Math.max(0.35, _camPhi - dy * 0.005));
        _updateCam();
      } else cv.style.cursor = _hit(e) ? 'pointer' : 'grab';
    };
    const onUp = (e) => { drag = false; if (moved < 6) { const c = _hit(e); if (c) c.onClick(); } };
    const onLeave = () => { drag = false; };
    const onWheel = (e) => { e.preventDefault(); _camR = Math.min(20, Math.max(8, _camR + Math.sign(e.deltaY) * 0.8)); _updateCam(); };
    _handlers = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointerleave', onLeave], ['wheel', onWheel]];
    for (const [ev, fn] of _handlers) cv.addEventListener(ev, fn, ev === 'wheel' ? { passive: false } : undefined);

    try { _ro = new ResizeObserver(() => { if (!_renderer) return; const w = container.clientWidth || W; _renderer.setSize(w, H); _cam.aspect = w / H; _cam.updateProjectionMatrix(); }); _ro.observe(container); } catch { /* noop */ }

    _t0 = performance.now();
    const animate = () => {
      if (!_renderer) return;
      _raf = requestAnimationFrame(animate);
      const t = (performance.now() - _t0) / 1000;
      // 聚焦：相機方位漸進到目標（處理角度繞圈最短路徑）
      let d = _camThetaT - _camTheta;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const dr = _camRT - _camR, dlk = _camLook.distanceToSquared(_camLookT);
      if (Math.abs(d) > 0.002 || Math.abs(dr) > 0.01 || dlk > 0.0001) {
        _camTheta += d * 0.08; _camR += dr * 0.08; _camLook.lerp(_camLookT, 0.08); _updateCam();
      }
      for (const s of _spin) {
        if (s.kind === 'core') { s.obj.rotation.y = t * 0.4; s.obj.rotation.x = Math.sin(t * 0.5) * 0.2; }
        else if (s.kind === 'stars') s.obj.rotation.y = t * 0.01;
        else if (s.kind === 'beam') s.obj.material.opacity = 0.3 + (Math.sin(t * 2 + (s.phase || 0)) * 0.5 + 0.5) * 0.45;
        else if (s.kind === 'pulse') { const p = (t * 0.7) % 1; s.obj.scale.setScalar(1 + p * 2.6); s.obj.material.opacity = 0.6 * (1 - p); }
        else if (s.kind === 'march') { const p = ((t * 0.32) + s.phase) % 1; s.obj.position.set(s.from[0] + (s.to[0] - s.from[0]) * p, 0.28, s.from[1] + (s.to[1] - s.from[1]) * p); s.obj.material.opacity = 0.85 * Math.sin(p * Math.PI); }
      }
      _renderer.render(_scene, _cam);
    };
    animate();
    return true;
  } catch (e) {
    console.warn('[mapScene] init 失敗，退回格狀地圖：', e?.message || e);
    disposeMapScene();
    return false;
  }
}
