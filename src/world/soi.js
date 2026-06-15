import * as THREE from 'three';
import { OBELISK_SOI_RADIUS } from '../constants.js';

// ─── State ───────────────────────────────────────────────────
export const obelisks = [];

let _scene = null;
let _getPhysics = () => null;   // physics 是 async 初始化，建造時才取用
let _RAPIER = null;

/** 必須在 scene 建立後呼叫一次 */
export function initSoI(scene, getPhysics, RAPIER) {
  _scene = scene;
  if (getPhysics) _getPhysics = getPhysics;
  if (RAPIER) _RAPIER = RAPIER;
}

// ─── SoI 視覺圓圈 ────────────────────────────────────────────
export function createSoICircle(x, z, radius, color, opacity = 0.13) {
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false
  });
  const circle = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), mat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.set(x, 0.03, z);
  circle.renderOrder = 0;
  _scene.add(circle);

  const ringMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: opacity * 3.5, side: THREE.DoubleSide, depthWrite: false
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.5, radius, 64), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.04, z);
  ring.renderOrder = 1;
  _scene.add(ring);
  return { circle, ring };
}

// ─── 方尖塔（FEZ 式オベリスク：細長方尖碑 + 頂部浮游水晶）──────
const _stoneMat = new THREE.MeshLambertMaterial({ color: 0xcdd1da });
const _stoneDk  = new THREE.MeshLambertMaterial({ color: 0xaab0bc });
const _runeMat  = new THREE.MeshLambertMaterial({
  color: 0x6688ff, emissive: new THREE.Color(0x3355ff), emissiveIntensity: 1.5,
});
const _gemMat   = new THREE.MeshLambertMaterial({
  color: 0x88aaff, emissive: new THREE.Color(0x4466ff), emissiveIntensity: 1.9,
});

export function createObelisk(x, z) {
  const g = new THREE.Group();

  // 雙層石基座（小而扁，FEZ 的碑座）
  const base1 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.3), _stoneDk);
  base1.position.y = 0.15; g.add(base1);
  const base2 = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.26, 0.92), _stoneMat);
  base2.position.y = 0.43; g.add(base2);

  // 細長四角錐台柱身（radial=4 的圓柱旋 45° = 方柱；邊寬 0.46 → 0.26）
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.184, 0.325, 4.2, 4, 1), _stoneMat);
  shaft.position.y = 0.56 + 2.1;
  shaft.rotation.y = Math.PI / 4;
  g.add(shaft);

  // 頂端金字塔尖（pyramidion）
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.55, 4), _stoneDk);
  tip.position.y = 0.56 + 4.2 + 0.27;
  tip.rotation.y = Math.PI / 4;
  g.add(tip);

  // 碑身隊色發光刻紋（前後兩面，吃 bloom；FEZ 碑文感）
  for (const s of [1, -1]) {
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.0, 0.02), _runeMat);
    rune.position.set(0, 2.5, s * 0.27);
    g.add(rune);
  }

  // 頂部浮游水晶（自轉 + 上下浮，updateObelisks 驅動）
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.30, 0), _gemMat);
  const gemBaseY = 0.56 + 4.2 + 0.55 + 0.45;
  gem.position.y = gemBaseY;
  gem.scale.y = 1.5;
  g.add(gem);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, 0, z);
  _scene.add(g);

  // 碰撞體：貼合細柱（之前用粗石柱模型且無 collider → 玩家穿塔）
  const physics = _getPhysics();
  let collider = null;
  if (physics && _RAPIER) {
    collider = physics.createCollider(
      _RAPIER.ColliderDesc.cuboid(0.34, 2.5, 0.34).setTranslation(x, 2.5, z)
    );
  }

  const soi = createSoICircle(x, z, OBELISK_SOI_RADIUS, 0x4488ff);
  obelisks.push({
    group: g, pos: new THREE.Vector3(x, 0, z), soi,
    gem, gemBaseY, phase: Math.random() * Math.PI * 2, collider,
  });
}

/** 每幀：浮游水晶自轉 + 上下浮動 */
let _obTime = 0;
export function updateObelisks(dt) {
  _obTime += dt;
  for (const o of obelisks) {
    if (!o.gem) continue;
    o.gem.rotation.y += dt * 1.3;
    o.gem.position.y = o.gemBaseY + Math.sin(_obTime * 1.6 + o.phase) * 0.13;
  }
}
