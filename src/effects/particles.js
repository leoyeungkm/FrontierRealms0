import * as THREE from 'three';
import { pulseLight, acquireFollowLight } from './lightPool.js';
import { sfxExplosion, sfxMine, sfxCast, sfxSlam, sfxBuff, sfxDash, sfxSkill } from './sfx.js';

// 與鏡頭距離（音量衰減用；鏡頭 ≈ 玩家位置）
function _camDist(pos) {
  return _camera ? _camera.position.distanceTo(pos) : 0;
}

// ─── Shared Geometries（全局共享，只建一次）──────────────────
const _gS = new THREE.SphereGeometry(0.045, 3, 2);  // 細小火花
const _gC = new THREE.SphereGeometry(0.13,  4, 3);  // 中型碎塊
const _gB = new THREE.SphereGeometry(0.24,  5, 4);  // 爆炸大塊
const _gF = new THREE.BoxGeometry(0.13, 0.025, 0.13); // 扁平碎片

const particles = [];
let _scene = null;

/** 必須在 scene 建立後呼叫一次 */
export function initParticles(scene) {
  _scene = scene;
}

// Mesh + Material 物件池：避免每顆粒子 new Material（GC 壓力 + GPU 資源洩漏）
const _pool = [];
const _POOL_MAX = 300;
function _p(pos, vel, color, geo, life, grav = 14) {
  let m = _pool.pop();
  if (m) {
    m.geometry = geo;
    m.material.color.set(color);
    m.material.opacity = 1;
  } else {
    m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
  }
  m.position.copy(pos);
  m.scale.setScalar(1);
  _scene.add(m);
  particles.push({ mesh: m, vel: vel.clone(), life, maxLife: life, grav });
}

// ─── 血濺 + 地面血漬（命中回饋）──────────────────────────────
const _bloodColors = [0x8a1414, 0xa81f1f, 0x6d0f0f, 0x9c1818];
const _stainGeo = new THREE.CircleGeometry(0.5, 10);
const _stains = [];          // 上限控管：最舊先移除
const MAX_STAINS = 36;

/** 命中噴血：沿揮擊方向的錐形血珠 + 落地血漬（4s 淡出） */
export function spawnBloodSpray(pos, dx = 0, dz = 0) {
  const dir = new THREE.Vector3(dx, 0.5, dz);
  if (dir.lengthSq() < 0.01) dir.set(0, 1, 0);
  dir.normalize();
  _emitBurst({
    origin: pos.clone().setY(pos.y + 1.05),
    count: 13, life: [0.22, 0.5], speed: [2.5, 6.5], size: [0.2, 0.03],
    colors: _bloodColors, dir, spread: 0.55, gravity: 18, drag: 0.96,
  });
  // 地面血漬（貼地圓斑，隨機形變）
  const stain = new THREE.Mesh(_stainGeo, new THREE.MeshBasicMaterial({
    color: _bloodColors[(Math.random() * _bloodColors.length) | 0],
    transparent: true, opacity: 0.5, depthWrite: false,
  }));
  stain.rotation.x = -Math.PI / 2;
  stain.rotation.z = Math.random() * Math.PI * 2;
  const s = 0.45 + Math.random() * 0.5;
  stain.scale.set(s, s * (0.6 + Math.random() * 0.6), 1);
  stain.position.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + 0.02, pos.z + (Math.random() - 0.5) * 0.5);
  stain.renderOrder = 0;
  _scene.add(stain);
  _stains.push(stain);
  if (_stains.length > MAX_STAINS) {
    const old = _stains.shift();
    _scene.remove(old); old.material.dispose();
  }
  let t = 0;
  _addEffect({ update(dt) {
    t += dt;
    if (t > 2.2) stain.material.opacity = 0.5 * Math.max(0, 1 - (t - 2.2) / 1.8);
    if (t >= 4.0) {
      const i = _stains.indexOf(stain);
      if (i >= 0) _stains.splice(i, 1);
      _scene.remove(stain); stain.material.dispose();
      return false;
    }
    return true;
  }});
}

/** 近戰命中：銀白火花 + 橙衝擊 + 紅血跡 + 命中閃光
 *  純視覺——命中聲由「與玩家有關」的呼叫端自行播（小兵互打/塔射擊不出聲） */
export function spawnHitSparks(pos) {
  // 命中白閃（Sprite 恆面向鏡頭，0.12s 撐大淡出）
  const flashMat = new THREE.SpriteMaterial({
    map: _getGlow(), color: 0xfff0c8, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flash = new THREE.Sprite(flashMat);
  flash.position.copy(pos);
  flash.scale.setScalar(1.0);
  _scene.add(flash);
  let ft = 0;
  _addEffect({ update(dt) {
    ft += dt;
    const k = Math.min(1, ft / 0.12);
    flash.scale.setScalar(1.0 + k * 1.8);
    flashMat.opacity = 0.95 * (1 - k);
    if (k >= 1) { _scene.remove(flash); flashMat.dispose(); return false; }
    return true;
  }});
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 7;
    _p(pos, new THREE.Vector3(Math.cos(a)*sp, 1.5+Math.random()*4.5, Math.sin(a)*sp),
      Math.random() > 0.4 ? 0xffffff : 0xffe090, _gS, 0.28, 18);
  }
  for (let i = 0; i < 3; i++) {
    const op = pos.clone().add(new THREE.Vector3((Math.random()-.5)*.5, Math.random()*.5, (Math.random()-.5)*.5));
    _p(op, new THREE.Vector3((Math.random()-.5)*3, 0.8+Math.random()*2, (Math.random()-.5)*3),
      i === 0 ? 0xff8800 : 0xff5500, _gC, 0.2, 7);
  }
  for (let i = 0; i < 4; i++) {
    _p(pos, new THREE.Vector3((Math.random()-.5)*4, 2+Math.random()*3.5, (Math.random()-.5)*4),
      Math.random() > 0.5 ? 0xcc1100 : 0x881100, _gF, 0.4, 13);
  }
}

/** 揮劍斬擊：白銀弧形光跡 */
export function spawnSlashStreak(pos, yaw) {
  const fwd   = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  for (let i = 0; i < 5; i++) {
    const t   = (i / 4) - 0.5;
    const dir = fwd.clone().addScaledVector(right, t * 1.2).normalize();
    const sp  = 5 + Math.random() * 4;
    const col = i === 2 ? 0xffffff : (Math.random() > 0.5 ? 0xddeeFF : 0xaaccff);
    _p(pos.clone().add(new THREE.Vector3(0, 0.8 + Math.random() * 0.6, 0)),
      dir.clone().multiplyScalar(sp).add(new THREE.Vector3(0, 0.5 + Math.random(), 0)),
      col, _gS, 0.18, 10);
  }
  const impactPos = pos.clone().addScaledVector(fwd, 1.5).add(new THREE.Vector3(0, 0.7, 0));
  _p(impactPos, new THREE.Vector3(0, 0.3, 0), 0xff9900, _gC, 0.12, 4);
}

/** 腳步揚塵（跑步/落地）：土色小團 */
export function spawnFootDust(pos, big = false) {
  const n = big ? 6 : 3;
  for (let i = 0; i < n; i++) {
    _p(pos.clone().add(new THREE.Vector3((Math.random() - .5) * .4, 0.06, (Math.random() - .5) * .4)),
      new THREE.Vector3((Math.random() - .5) * (big ? 2.4 : 1.2), 0.7 + Math.random() * (big ? 1.8 : 1.0), (Math.random() - .5) * (big ? 2.4 : 1.2)),
      i % 2 ? 0xbfb39a : 0xa89a82, _gC, big ? 0.45 : 0.32, 5);
  }
}

/** 砲彈黑煙尾跡（單顆小灰團） */
export function spawnShellSmoke(pos) {
  _p(pos.clone().add(new THREE.Vector3((Math.random() - .5) * .25, 0, (Math.random() - .5) * .25)),
    new THREE.Vector3((Math.random() - .5) * 0.6, 0.5 + Math.random() * 0.8, (Math.random() - .5) * 0.6),
    Math.random() > 0.5 ? 0x3a3430 : 0x55504a, _gC, 0.55, 0.8);
}

/** 採礦：藍色水晶碎片 */
export function spawnMiningDust(pos) {
  sfxMine();
  const cols = [0x44aaff, 0x88ddff, 0x2266ff, 0xaaeeff];
  for (let i = 0; i < 5; i++) {
    _p(pos, new THREE.Vector3((Math.random()-.5)*3, 1+Math.random()*2.5, (Math.random()-.5)*3),
      cols[i % cols.length], i < 2 ? _gS : _gC, 0.52, 8);
  }
}

/**
 * 爆炸（Giant砲）：火焰 + 餘燼 + 煙霧
 * @returns {number} camShake 震動量，讓呼叫者 Math.max(camShake, result)
 */
export function spawnExplosion(pos) {
  sfxExplosion(false, _camDist(pos));
  for (let i = 0; i < 10; i++) {
    const c = [0xff4400, 0xff8800, 0xffcc00][i % 3];
    _p(pos, new THREE.Vector3((Math.random()-.5)*9, 3+Math.random()*9, (Math.random()-.5)*9), c, _gB, 0.55, 9);
  }
  for (let i = 0; i < 14; i++) {
    _p(pos, new THREE.Vector3((Math.random()-.5)*13, 2+Math.random()*11, (Math.random()-.5)*13),
      Math.random() > 0.5 ? 0xff6600 : 0xffaa00, _gC, 0.42, 7);
  }
  for (let i = 0; i < 8; i++) {
    const grey = 0x333333 + Math.floor(Math.random() * 0x222222) * 0x10101;
    _p(pos.clone().add(new THREE.Vector3(0, 0.5, 0)),
      new THREE.Vector3((Math.random()-.5)*5, 0.8+Math.random()*3, (Math.random()-.5)*5),
      grey, _gC, 1.0, 3);
  }
  pulseLight(pos.clone().setY(pos.y + 1), 0xff6600, 14, 12, 0.22);
  return 0.28; // camShake 量
}

// ─── 臨時 Mesh 效果（非粒子，短暫動畫）────────────────────────
// （舊版技能特效已由 fireSkillEffect 統一取代）

/** 衝撞 Tackle / 長槍突刺：衝鋒殘影 */
export function spawnDashTrail(pos, yaw) {
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  for (let i = 0; i < 5; i++) {
    const behind = pos.clone().addScaledVector(fwd, -i * 0.4);
    _p(behind.add(new THREE.Vector3(0, 0.7, 0)),
      new THREE.Vector3((Math.random()-.5)*1.5, 0.5+Math.random()*1, (Math.random()-.5)*1.5),
      i < 2 ? 0xffffff : 0x88aaff, _gS, 0.15 - i*0.02, 4);
  }
}

/**
 * 攻城爆炸（巨人砲）：雙衝擊環 + 地裂 + 火柱 + 濃煙 + 大量碎石
 * @returns {number} camShake 量
 */
export function spawnSiegeExplosion(pos) {
  sfxExplosion(true, _camDist(pos));
  const ground = pos.clone(); ground.y = Math.max(0.06, pos.y);
  _shockRing(ground, 5.5, 0xff7a22);
  _groundCrack(ground, 4.2);
  _beam(ground, 0xff8830, 9, 2.6, 0.5);                      // 火柱
  _lightPulse(ground, 0xff7722, 16, 18, 0.32);
  _playFlipbook(_getExplosionSheet(), pos.clone().setY(pos.y + 2), 9, 0.55, 0xffc080);
  // 延遲第二環（餘波）
  let dly = 0;
  _addEffect({ update(dt) {
    dly += dt;
    if (dly >= 0.12) { _shockRing(ground.clone(), 3.4, 0xffb060); return false; }
    return true;
  }});
  // 火焰碎片
  _emitBurst({ origin: pos.clone().setY(pos.y + 0.5), count: 46, life: [0.4, 0.9], speed: [4, 10], size: [0.7, 0.08],
    colors: [{ t: 0, c: 0xfff0c8 }, { t: 0.4, c: 0xff8a30 }, { t: 1, c: 0x551a08 }], gravity: 9, lift: 3 });
  // 石塊飛濺（實體粒子）
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, sp = 5 + Math.random() * 8;
    _p(pos.clone(), new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 7, Math.sin(a) * sp),
      i % 2 ? 0x6e6258 : 0x4e453e, _gB, 0.8, 16);
  }
  // 濃煙柱（緩慢上升的深灰團）
  for (let i = 0; i < 10; i++) {
    _p(pos.clone().add(new THREE.Vector3((Math.random() - .5) * 2, 0.5 + Math.random(), (Math.random() - .5) * 2)),
      new THREE.Vector3((Math.random() - .5) * 2, 1.5 + Math.random() * 2.5, (Math.random() - .5) * 2),
      0x2e2a28, _gB, 1.6, 1.2);
  }
  return 0.5;
}

/** 暗霧（FEZ Wraith Dark Mist）：大片遮蔽視線的黑霧，緩慢漂移 */
export function spawnDarkMist(pos, radius = 5, dur = 8) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * radius * 0.8;
    const sp = _softSprite(
      pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 1 + Math.random() * 1.5, Math.sin(a) * r)),
      4 + Math.random() * 2.5, 3 + Math.random() * 2, 0x141020, 0.55);
    sp.material.blending = THREE.NormalBlending;   // 遮蔽用，不發光
    let t = 0;
    const drift = (Math.random() - 0.5) * 0.3;
    _addEffect({ update(dt) {
      t += dt;
      sp.position.y += dt * 0.1;
      sp.position.x += drift * dt;
      const k = t / dur;
      sp.material.opacity = 0.55 * (k < 0.08 ? k / 0.08 : (1 - Math.max(0, (k - 0.7) / 0.3)));
      if (_camera) {
        const dx = _camera.position.x - sp.position.x, dz = _camera.position.z - sp.position.z;
        sp.rotation.set(0, Math.atan2(dx, dz), 0);
      }
      if (t >= dur) { _scene.remove(sp); sp.geometry.dispose(); sp.material.dispose(); return false; }
      return true;
    }});
  }
}

// ─── Effect Lifecycle System ──────────────────────────────────
const _effects = [];
function _addEffect(e) { _effects.push(e); }

// ─── Glow Texture (cached) ────────────────────────────────────
let _GLOW = null;
function _getGlow() {
  if (_GLOW) return _GLOW;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _GLOW = new THREE.CanvasTexture(c);
  return _GLOW;
}

// ─── Gradient Color Helper ────────────────────────────────────
// 每粒子每幀呼叫：Color 物件快取 + scratch 回傳（呼叫端只立即讀 r/g/b）
const _gradCache = new WeakMap();
const _gradScratch = new THREE.Color();
function _gradAt(stops, t) {
  let cs = _gradCache.get(stops);
  if (!cs) { cs = stops.map(s => ({ t: s.t, c: new THREE.Color(s.c) })); _gradCache.set(stops, cs); }
  for (let i = 0; i < cs.length - 1; i++) {
    if (t >= cs[i].t && t <= cs[i + 1].t) {
      const k = (t - cs[i].t) / (cs[i + 1].t - cs[i].t);
      return _gradScratch.copy(cs[i].c).lerp(cs[i + 1].c, k);
    }
  }
  return _gradScratch.copy(cs[cs.length - 1].c);
}

// ─── GPU Points Burst ─────────────────────────────────────────
function _emitBurst(o) {
  const n = o.count;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  const P = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, e = 0.2 + Math.random() * 1.2;
    const sp = o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]);
    let v;
    if (o.dir) {
      const sd = o.spread || 0.5;
      v = o.dir.clone().multiplyScalar(sp);
      v.x += (Math.random() - 0.5) * sp * sd;
      v.y += (Math.random() - 0.5) * sp * sd + (o.lift || 0);
      v.z += (Math.random() - 0.5) * sp * sd;
    } else if (o.coneUp) {
      v = new THREE.Vector3(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + (o.lift || 0), Math.sin(a) * Math.cos(e) * sp);
    } else {
      const ph = Math.acos(2 * Math.random() - 1);
      v = new THREE.Vector3(Math.sin(ph) * Math.cos(a), Math.cos(ph), Math.sin(ph) * Math.sin(a)).multiplyScalar(sp);
      v.y += o.lift || 0;
    }
    P.push({ p: o.origin.clone(), v, life: 0, max: o.life[0] + Math.random() * (o.life[1] - o.life[0]) });
    pos[i * 3] = o.origin.x; pos[i * 3 + 1] = o.origin.y; pos[i * 3 + 2] = o.origin.z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const mat = _getBurstMat(); // 所有 burst 共用同一 ShaderMaterial（顏色/大小皆為頂點屬性）
  const pts = new THREE.Points(geo, mat);
  _scene.add(pts);
  const grav = o.gravity != null ? o.gravity : 6, drag = o.drag || 0.9;
  _addEffect({ update(dt) {
    let al = false;
    for (let i = 0; i < n; i++) {
      const pp = P[i]; pp.life += dt;
      if (pp.life < pp.max) {
        al = true;
        pp.v.y -= grav * dt;
        pp.v.multiplyScalar(1 - (1 - drag) * dt * 4);
        pp.p.addScaledVector(pp.v, dt);
        const lt = pp.life / pp.max;
        pos[i * 3] = pp.p.x; pos[i * 3 + 1] = pp.p.y; pos[i * 3 + 2] = pp.p.z;
        const c = _gradAt(o.colors, lt), f = (1 - lt) * 0.85;
        col[i * 3] = c.r * f; col[i * 3 + 1] = c.g * f; col[i * 3 + 2] = c.b * f;
        sz[i] = o.size[0] + (o.size[1] - o.size[0]) * lt;
      } else { sz[i] = 0; }
    }
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.size.needsUpdate = true;
    if (!al) { _scene.remove(pts); geo.dispose(); return false; } // mat 為共用材質，不 dispose
    return true;
  }});
}

let _burstMat = null;
function _getBurstMat() {
  if (_burstMat) return _burstMat;
  _burstMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: _getGlow() } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: `attribute float size;attribute vec3 color;varying vec3 vC;void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*300./(-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform sampler2D tex;varying vec3 vC;void main(){gl_FragColor=vec4(vC,1.)*texture2D(tex,gl_PointCoord);}`,
  });
  return _burstMat;
}

// ─── Soft Billboard Sprite ────────────────────────────────────
function _softSprite(pos, sx, sy, color, opacity) {
  const mat = new THREE.MeshBasicMaterial({
    map: _getGlow(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.position.copy(pos); m.scale.set(sx, sy, 1);
  _scene.add(m);
  return m;
}

// ─── 命中光源脈衝（走固定光源池，不觸發 shader 重編譯）────────
function _lightPulse(pos, color, intensity = 5, dist = 7, dur = 0.18) {
  pulseLight(pos.clone().setY(pos.y + 0.8), color, intensity, dist, dur);
}

// ─── 垂直光柱（billboard 拉高的柔光，AoE / buff 用）──────────
function _beam(pos, color, height = 5, width = 1.6, dur = 0.5) {
  const sp = _softSprite(pos.clone().setY(pos.y + height * 0.5), width, height, color, 0.75);
  let t = 0;
  _addEffect({ update(dt) {
    t += dt; const k = t / dur;
    sp.material.opacity = 0.75 * (1 - k);
    sp.scale.x = width * (1 + k * 0.6);
    // 永遠面向鏡頭（只繞 Y）
    if (_camera) {
      const dx = _camera.position.x - sp.position.x, dz = _camera.position.z - sp.position.z;
      sp.rotation.set(0, Math.atan2(dx, dz), 0);
    }
    if (t >= dur) { _scene.remove(sp); sp.geometry.dispose(); sp.material.dispose(); return false; }
    return true;
  }});
}

// ─── 地裂貼花（放射狀裂紋，重擊落點淡出）─────────────────────
let _CRACK = null;
function _getCrack() {
  if (_CRACK) return _CRACK;
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.clearRect(0, 0, N, N);
  g.strokeStyle = 'rgba(20,12,8,0.9)';
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
    let x = N / 2, y = N / 2, ang = a;
    g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(x, y);
    const segs = 4 + (Math.random() * 3 | 0);
    for (let s = 0; s < segs; s++) {
      const len = 8 + Math.random() * 12;
      ang += (Math.random() - 0.5) * 0.9;
      x += Math.cos(ang) * len; y += Math.sin(ang) * len;
      g.lineTo(x, y);
      g.lineWidth = Math.max(0.5, 3.5 - s);
    }
    g.stroke();
  }
  _CRACK = new THREE.CanvasTexture(c);
  return _CRACK;
}

function _groundCrack(center, radius) {
  const mat = new THREE.MeshBasicMaterial({
    map: _getCrack(), transparent: true, opacity: 0.6, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * Math.PI * 2;
  m.position.copy(center); m.position.y = 0.06;
  m.renderOrder = 2;
  _scene.add(m);
  let t = 0; const dur = 1.5;
  _addEffect({ update(dt) {
    t += dt; const k = t / dur;
    mat.opacity = 0.6 * (1 - k * k);
    if (t >= dur) { _scene.remove(m); m.geometry.dispose(); mat.dispose(); return false; }
    return true;
  }});
}

let _camera = null;
/** 可選：提供 camera 給需要面向鏡頭的特效（main.js init 時呼叫） */
export function setParticleCamera(camera) { _camera = camera; }

// ─── Weapon Style Definitions ─────────────────────────────────
const WEAPON_STYLE = {
  sword_shield: { color: 0x7fc8ff, band: [0.46, 0.92], dur: 0.26, scale: 1.0,   heavy: false,
    grad: [{ t: 0, c: 0xeaf7ff }, { t: 0.5, c: 0x5cc6f5 }, { t: 1, c: 0x12476e }], flip: 0xaadcff },
  greatsword:   { color: 0xffa336, band: [0.16, 0.96], dur: 0.42, scale: 1.22,  heavy: true,
    grad: [{ t: 0, c: 0xfff0c8 }, { t: 0.45, c: 0xff8a30 }, { t: 1, c: 0x6e1e0c }], flip: 0xffb874 },
  polearm:      { color: 0x66e6a6, band: [0.52, 0.96], dur: 0.22, scale: 1.08,  heavy: false,
    grad: [{ t: 0, c: 0xe6fff0 }, { t: 0.5, c: 0x4fe0a0 }, { t: 1, c: 0x12513a }], flip: 0x9af0c4 },
  common:       { color: 0xffcf6b, band: [0.4,  0.92], dur: 0.3,  scale: 1.0,   heavy: false,
    grad: [{ t: 0, c: 0xfff2cf }, { t: 0.5, c: 0xeebf5c }, { t: 1, c: 0x553a10 }], flip: 0xffcf6b },
};

// ─── Slash Arc (shader-based fan mesh) ───────────────────────
/** roll：繞面向軸的傾角（0=水平橫斬、±0.7=斜斬、1.25≈縱劈） */
function _slashArc(origin, facing, range, hac, style, roll = 0) {
  const half = Math.acos(THREE.MathUtils.clamp(hac, -1, 1)) || 0.001;
  const seg = 30;
  const v = [], aR = [], aS = [];
  for (let i = 0; i < seg; i++) {
    const a0 = -half + 2 * half * i / seg, a1 = -half + 2 * half * (i + 1) / seg;
    v.push(0, 0, 0, Math.sin(a0) * range, 0, Math.cos(a0) * range, Math.sin(a1) * range, 0, Math.cos(a1) * range);
    aR.push(0, 1, 1);
    aS.push(0, a0 / half, a1 / half);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setAttribute('aR', new THREE.Float32BufferAttribute(aR, 1));
  geo.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(style.color) }, uOp: { value: 0 },
      uBin: { value: style.band[0] }, uBout: { value: style.band[1] },
    },
    vertexShader: `attribute float aR;attribute float aS;varying float vR;varying float vS;void main(){vR=aR;vS=aS;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 uColor;uniform float uOp;uniform float uBin;uniform float uBout;varying float vR;varying float vS;
      void main(){float band=smoothstep(uBin,uBout,vR)*(1.-smoothstep(uBout,uBout+.12,vR));
        float ang=smoothstep(0.,.35,1.-abs(vS));float a=band*ang*uOp;gl_FragColor=vec4(mix(uColor,vec3(1.),a*.5),a);}`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(origin); m.position.y = 1.1;
  m.rotation.order = 'YZX';          // 先轉面向，再繞面向軸傾斜（斜斬/縱劈）
  m.rotation.y = facing;
  m.rotation.z = roll;
  _scene.add(m);
  let t = 0; const dur = style.dur;
  _addEffect({ update(dt) {
    t += dt; const k = t / dur;
    const f = k < 0.18 ? k / 0.18 : 1 - (k - 0.18) / 0.82;
    mat.uniforms.uOp.value = Math.max(0, f) * 0.95;
    m.scale.setScalar((0.85 + 0.2 * k) * style.scale);
    if (t >= dur) { _scene.remove(m); geo.dispose(); mat.dispose(); return false; }
    return true;
  }});
}

// ─── Shock Ring (expanding ground ring) ──────────────────────
function _shockRing(center, radius, color) {
  const geo = new THREE.CircleGeometry(radius * 1.15, 64);
  const mat = new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uR: { value: 0 },
      uW: { value: 0.12 }, uOp: { value: 1 }, uMax: { value: radius * 1.15 },
    },
    vertexShader: `varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 uColor;uniform float uR;uniform float uW;uniform float uOp;uniform float uMax;varying vec2 vP;
      void main(){float d=length(vP)/uMax;float ring=exp(-pow((d-uR)/uW,2.));float core=(1.-smoothstep(0.,uR,d))*.13;
        gl_FragColor=vec4(uColor,(ring+core)*uOp);}`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2; m.position.copy(center); m.position.y = 0.05;
  _scene.add(m);
  let t = 0; const dur = 0.5;
  _addEffect({ update(dt) {
    t += dt; const k = t / dur;
    mat.uniforms.uR.value = k;
    mat.uniforms.uW.value = 0.1 + 0.12 * k;
    mat.uniforms.uOp.value = (1 - k) * 0.9;
    if (t >= dur) { _scene.remove(m); geo.dispose(); mat.dispose(); return false; }
    return true;
  }});
}

// ─── Dash Trail (visual-only, soft sprite version) ────────────
function _fxDashTrail(origin, facing, range, color) {
  const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  let placed = 0, t = 0; const dur = 0.26;
  _addEffect({ update(dt) {
    t += dt; const want = Math.floor(t / dur * 10);
    while (placed < want) {
      placed++;
      const p = origin.clone().addScaledVector(dir, range * placed / 10).setY(1.2);
      const sp = _softSprite(p, 1.3, 1.7, color, 0.5);
      let tt = 0;
      _addEffect({ update(d2) {
        tt += d2;
        sp.material.opacity = 0.5 * (1 - tt / 0.32);
        if (tt > 0.32) { _scene.remove(sp); sp.geometry.dispose(); sp.material.dispose(); return false; }
        return true;
      }});
    }
    if (t >= dur) return false;
    return true;
  }});
}

// ─── Flipbook Sheets ──────────────────────────────────────────
let _SHEET_EXPLO = null, _SHEET_SLASH = null;

function _getExplosionSheet() {
  if (_SHEET_EXPLO) return _SHEET_EXPLO;
  const cols = 5, rows = 5, cell = 128;
  const c = document.createElement('canvas'); c.width = cols * cell; c.height = rows * cell;
  const g = c.getContext('2d'); const N = cols * rows;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const cx = (i % cols) * cell + cell / 2, cy = (Math.floor(i / cols)) * cell + cell / 2;
    const R = cell * 0.12 + t * cell * 0.4;
    const a = (t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.5)) * 0.82;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, `rgba(255,250,235,${a})`);
    gr.addColorStop(0.45, `rgba(255,210,150,${a * 0.75})`);
    gr.addColorStop(0.8, `rgba(220,140,90,${a * 0.4})`);
    gr.addColorStop(1, 'rgba(120,70,50,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let s = 0; s < 10; s++) {
      const ang = (s / 10) * 6.28 + i, d = R * (0.6 + 0.4 * ((s * 7 % 10) / 10));
      const sr = Math.max(0, (cell * 0.035) * (1 - t));
      g.fillStyle = `rgba(255,235,200,${a * 0.6})`; g.beginPath(); g.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, sr, 0, 7); g.fill();
    }
    g.restore();
  }
  _SHEET_EXPLO = { tex: new THREE.CanvasTexture(c), cols, rows, N };
  return _SHEET_EXPLO;
}

function _getSlashSheet() {
  if (_SHEET_SLASH) return _SHEET_SLASH;
  const cols = 8, cell = 256;
  const c = document.createElement('canvas'); c.width = cols * cell; c.height = cell;
  const g = c.getContext('2d');
  for (let i = 0; i < cols; i++) {
    const t = i / (cols - 1);
    g.save(); g.translate(i * cell + cell / 2, cell / 2); g.rotate(-1 + t * 2.2);
    const a = (t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 0.7)) * 0.85;
    g.globalCompositeOperation = 'lighter';
    for (let L = 0; L < 3; L++) {
      const rr = cell * (0.3 + L * 0.05);
      g.strokeStyle = L === 0 ? `rgba(255,255,255,${a})` : `rgba(220,235,255,${a * 0.5})`;
      g.lineWidth = Math.max(1, cell * (0.05 - L * 0.012));
      g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, rr, -0.9, 0.9); g.stroke();
    }
    g.restore();
  }
  _SHEET_SLASH = { tex: new THREE.CanvasTexture(c), cols, rows: 1, N: cols };
  return _SHEET_SLASH;
}

// flipbook 貼圖池：clone + needsUpdate 會重新上傳 GPU，池化避免每次重傳
const _sheetPools = new WeakMap();
function _acquireSheetTex(sheet) {
  let pool = _sheetPools.get(sheet);
  if (!pool) { pool = []; _sheetPools.set(sheet, pool); }
  if (pool.length) return pool.pop();
  const tex = sheet.tex.clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1 / sheet.cols, 1 / sheet.rows);
  return tex;
}
function _releaseSheetTex(sheet, tex) {
  const pool = _sheetPools.get(sheet);
  if (pool && pool.length < 8) pool.push(tex);
  else tex.dispose();
}

function _playFlipbook(sheet, pos, size, dur, color) {
  const tex = _acquireSheetTex(sheet);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, color: color || 0xffffff,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.position.copy(pos); _scene.add(m);
  let t = 0;
  _addEffect({ update(dt) {
    t += dt; const k = Math.min(t / dur, 1);
    const f = Math.min(sheet.N - 1, (k * sheet.N) | 0);
    tex.offset.set((f % sheet.cols) / sheet.cols, 1 - (Math.floor(f / sheet.cols) + 1) / sheet.rows);
    if (t >= dur) {
      _scene.remove(m); m.geometry.dispose(); mat.dispose();
      _releaseSheetTex(sheet, tex);
      return false;
    }
    return true;
  }});
}

// ─── 長槍突刺光帶（兩片交叉細長光帶向前急伸）──────────────────
function _thrustStreak(origin, facing, range, st) {
  const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const planes = [];
  for (const rx of [0, -Math.PI / 2]) {   // 垂直片 + 水平片（任何視角都可見）
    const mat = new THREE.MeshBasicMaterial({
      color: st.color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.22), mat);
    m.rotation.order = 'YXZ';
    m.rotation.y = facing - Math.PI / 2;   // 長邊沿面向
    m.rotation.x = rx;
    _scene.add(m);
    planes.push(m);
  }
  let t = 0; const dur = 0.16;
  _addEffect({ update(dt) {
    t += dt; const k = Math.min(1, t / dur);
    const len = 0.5 + (range - 0.5) * k;   // 由根部向前急伸
    for (const m of planes) {
      m.scale.x = len;
      m.position.copy(origin).addScaledVector(dir, 0.5 + len / 2);
      m.position.y = origin.y + 1.15;
      m.material.opacity = 0.85 * (1 - k * k);
    }
    if (t >= dur + 0.06) {
      for (const m of planes) { _scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
      return false;
    }
    return true;
  }});
  // 槍尖小火花
  const tip = origin.clone().addScaledVector(dir, range).setY(origin.y + 1.15);
  _emitBurst({ origin: tip, count: 4, life: [0.12, 0.25], speed: [1.5, 3.5], size: [0.28, 0.04], colors: st.grad, dir, spread: 0.45, gravity: 3 });
}

// ─── 普攻特效（按武器動作，刻意簡潔：一道對應軌跡的光，不加料）──
/**
 * @param {string} weapon sword_shield | greatsword | polearm
 * @param {string} style  揮擊樣式（決定弧的傾角：slash 橫 / chop_quick 斜 / diag 反斜 / chop 縱劈 / pl_thrust 突刺）
 */
export function fireBasicAttackEffect(weapon, style, origin, facing) {
  const st = WEAPON_STYLE[weapon] || WEAPON_STYLE.common;
  if (weapon === 'polearm' || style === 'pl_thrust') {
    _thrustStreak(origin, facing, 3.4, st);
    return;
  }
  const R = weapon === 'greatsword' ? 3.0 : 2.5;
  const roll =
    style === 'chop'       ?  1.25 :   // 雙手劍縱劈（上→下）
    style === 'diag'       ? -0.8  :   // 雙手劍斜劈
    style === 'chop_quick' ?  0.7  :   // 單手劍交替斜斬
    0;                                  // 橫斬
  _slashArc(origin, facing, R, 0.64, { ...st, dur: st.dur * 0.8 }, roll);
}

// ─── Master Skill Effect Dispatcher ──────────────────────────
/**
 * Fire visual effects for a skill.
 * @param {object} skillDef  - skill definition (has .kind, .weapon, .hits)
 * @param {object} stats     - level stats (has .range, .halfAngleCos, .aoeRadius, etc.)
 * @param {THREE.Vector3} origin - player world position
 * @param {number} facing    - playerYaw (radians)
 */
export function fireSkillEffect(skillDef, stats, origin, facing) {
  const st = WEAPON_STYLE[skillDef.weapon] || WEAPON_STYLE.common;
  // 角色面向 = (sin(yaw), 0, cos(yaw))，與 main.js 的 inFan / 突進方向一致
  const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const col = st.color;
  const grad = st.grad;

  switch (skillDef.kind) {
    case 'cone': {
      sfxSkill(st.heavy, _camDist(origin));
      const R = stats.range || 2.5;
      const hac = stats.halfAngleCos != null ? stats.halfAngleCos : 0.5;
      // 雙層弧光：主弧（武器色）+ 延遲 45ms 的內層亮弧（殘像感）
      _slashArc(origin, facing, R, hac, st);
      let dly = 0;
      const o2 = origin.clone(), st2 = { ...st, color: st.flip, dur: st.dur * 0.85, scale: st.scale * 0.72 };
      _addEffect({ update(dt) {
        dly += dt;
        if (dly >= 0.045) { _slashArc(o2, facing, R * 0.85, hac, st2); return false; }
        return true;
      }});
      const mid = origin.clone().addScaledVector(dir, R * 0.6).setY(1.2);
      _playFlipbook(_getSlashSheet(), mid, R * 1.5 * st.scale, 0.3, st.flip);
      _lightPulse(mid, col, st.heavy ? 6 : 3.5, R * 2.2, 0.16);
      // 弧緣火花
      _emitBurst({ origin: mid.clone(), count: st.heavy ? 12 : 6, life: [0.18, 0.4], speed: [2, 5], size: [0.35, 0.05], colors: grad, dir, spread: 0.9, gravity: 5 });
      if (st.heavy) {
        _shockRing(origin.clone().addScaledVector(dir, R * 0.5), R * 0.9, col);
        _emitBurst({ origin: origin.clone().addScaledVector(dir, 1).setY(0.3), count: 14, life: [0.3, 0.6], speed: [1, 3], size: [0.5, 0.1], colors: grad, gravity: 5, lift: 0.5 });
      }
      break;
    }
    case 'projectile':
    case 'wave': {
      sfxCast(_camDist(origin));
      const isW = skillDef.kind === 'wave';
      const range = stats.range || 10;
      const head = _softSprite(origin.clone().setY(1.2), (isW ? (stats.aoeWidth || 2) * 1.4 : 1.0), 1.2, col, 0.85);
      // 投射物跟隨光（光源池）
      const li = acquireFollowLight(col, 4, 6);
      li.set(head.position);
      let trav = 0; const sp = range / 0.32;
      _addEffect({ update(dt) {
        const step = sp * dt; trav += step;
        head.position.addScaledVector(dir, step);
        li.set(head.position);
        head.material.opacity = 0.85 * (1 - trav / range);
        li.setIntensity(4 * (1 - trav / range));
        _emitBurst({ origin: head.position.clone(), count: 2, life: [0.18, 0.35], speed: [0.4, 1.6], size: [0.32, 0.04], colors: grad, gravity: 1.5, drag: 0.85 });
        if (trav >= range) {
          _scene.remove(head); head.geometry.dispose(); head.material.dispose();
          li.release();
          return false;
        }
        return true;
      }});
      break;
    }
    case 'self_aoe': {
      sfxSlam(_camDist(origin));
      const A = stats.aoeRadius || 4;
      _shockRing(origin.clone(), A, col);
      _groundCrack(origin.clone(), A * 0.9);
      _beam(origin.clone(), col, A * 1.6, A * 0.55, 0.42);
      _lightPulse(origin.clone(), col, 9, A * 3, 0.28);
      _playFlipbook(_getExplosionSheet(), origin.clone().setY(1.3), A * 1.5, 0.5, st.flip);
      _emitBurst({ origin: origin.clone().setY(0.6), count: 38, life: [0.4, 0.8], speed: [3, 7], size: [0.6, 0.08], colors: grad, gravity: 7, lift: 2 });
      break;
    }
    case 'point_aoe': {
      const A = stats.aoeRadius || 3;
      const c = origin.clone().addScaledVector(dir, 2);
      sfxSlam(_camDist(c));
      _shockRing(c, A, col);
      _groundCrack(c.clone(), A * 0.9);
      _beam(c.clone(), col, A * 1.6, A * 0.55, 0.42);
      _lightPulse(c.clone(), col, 9, A * 3, 0.28);
      _playFlipbook(_getExplosionSheet(), c.clone().setY(1.2), A * 1.5, 0.5, st.flip);
      _emitBurst({ origin: c.clone().setY(0.5), count: 32, life: [0.4, 0.7], speed: [3, 6], size: [0.6, 0.08], colors: grad, gravity: 7, lift: 2 });
      break;
    }
    case 'dash': {
      sfxDash();
      const range = stats.range || stats.dashRange || 5;
      _fxDashTrail(origin, facing, range, col);
      const end = origin.clone().addScaledVector(dir, range);
      _lightPulse(end, col, 4, 6, 0.2);
      _emitBurst({ origin: end.clone().setY(1.1), count: 14, life: [0.25, 0.45], speed: [2, 4], size: [0.45, 0.08], colors: grad, dir, spread: 0.6, gravity: 4 });
      break;
    }
    case 'dash_aoe': {
      sfxDash();
      const range = stats.dashRange || stats.range || 5;
      _fxDashTrail(origin, facing, range, col);
      const end = origin.clone().addScaledVector(dir, range);
      const A = stats.aoeRadius || 2.5;
      sfxSlam(_camDist(end));
      _shockRing(end, A, col);
      _groundCrack(end.clone(), A * 0.9);
      _lightPulse(end.clone(), col, 8, A * 3, 0.25);
      _playFlipbook(_getExplosionSheet(), end.clone().setY(1.1), A * 1.5, 0.45, st.flip);
      _emitBurst({ origin: end.clone().setY(0.5), count: 26, life: [0.3, 0.6], speed: [3, 6], size: [0.5, 0.08], colors: grad, gravity: 7, lift: 2 });
      break;
    }
    case 'buff': {
      sfxBuff();
      const bc = skillDef.id === 'embolden' ? 0xffcf6b : 0x7fd0ff;
      const bg = skillDef.id === 'embolden' ? WEAPON_STYLE.common.grad : WEAPON_STYLE.sword_shield.grad;
      _shockRing(origin.clone(), 1.6, bc);
      _beam(origin.clone(), bc, 4.5, 1.3, 0.7);   // 啟動光柱
      _lightPulse(origin.clone(), bc, 5, 8, 0.4);
      _emitBurst({ origin: origin.clone().setY(0.2), count: 30, life: [0.7, 1.2], speed: [0.4, 1.6], size: [0.45, 0.04], colors: bg, coneUp: true, lift: 1.4, gravity: -1.5, drag: 0.95 });
      break;
    }
  }
}

/** 每幀呼叫：更新所有粒子位置、透明度、生命週期 */
export function updateParticles(dt) {
  // Update shader-based effects first
  for (let i = _effects.length - 1; i >= 0; i--)
    if (!_effects[i].update(dt)) _effects.splice(i, 1);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vel.y -= p.grav * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    const r = Math.max(0, p.life / p.maxLife);
    p.mesh.material.opacity = r * r;
    p.mesh.scale.setScalar(0.25 + r * 0.75);
    if (p.life <= 0) {
      _scene.remove(p.mesh);
      if (_pool.length < _POOL_MAX) _pool.push(p.mesh);
      else p.mesh.material.dispose();   // 幾何為全局共享，不 dispose
      particles.splice(i, 1);
    }
  }
}
