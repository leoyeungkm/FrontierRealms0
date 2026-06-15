import * as THREE from 'three';
import { warmupRig, getLoadedRig, createRiggedFromGltf, preloadWeapon } from './riggedCharacter.js';

let _scene = null;

// 活躍的 rigged 召喚物（移動偵測 → Run/Idle；移出場景自動清理）
const _active = [];

/** 必須在 scene 建立後呼叫一次 */
export function initSummon(scene) {
  _scene = scene;
  warmupRig('models/chars/Knight.glb');
  warmupRig('models/chars/Barbarian.glb');
  warmupRig('models/chars/Skeleton_Mage.glb');
}

function _riggedSummon(url, opts, fallbackBuilder, weapons = null) {
  const gltf = getLoadedRig(url);
  if (!gltf) return fallbackBuilder();
  const rv = createRiggedFromGltf(gltf, opts);
  const g = new THREE.Group();
  g.add(rv.group);
  g.userData.rv = rv;
  rv.play('Idle');
  if (weapons) {
    Promise.all([
      weapons[0] ? preloadWeapon(weapons[0]) : null,
      weapons[1] ? preloadWeapon(weapons[1]) : null,
    ]).then(([r, l]) => { if (g.parent) rv.setWeapons(r, l); }).catch(() => {});
  }
  _active.push({ g, rv, px: 0, pz: 0, atkHold: 0 });
  _scene.add(g);
  return g;
}

/** 每幀：召喚物動畫（移動→Running / 靜止→Idle；攻擊剪輯播放期間不打斷） */
export function updateSummons(dt) {
  for (let i = _active.length - 1; i >= 0; i--) {
    const s = _active[i];
    let root = s.g;
    while (root.parent) root = root.parent;
    if (root !== _scene) { _active.splice(i, 1); continue; }   // 已被移除
    s.rv.update(dt);
    const moved = Math.hypot(s.g.position.x - s.px, s.g.position.z - s.pz);
    s.px = s.g.position.x; s.pz = s.g.position.z;
    if (s.atkHold > 0) { s.atkHold -= dt; continue; }
    if (moved / Math.max(dt, 1e-4) > 0.8) s.rv.play('Running_A', { timeScale: 1.1 });
    else s.rv.play('Idle');
  }
}

/** 召喚物攻擊動畫（main.js 在攻擊判定時呼叫） */
export function summonAttackAnim(group, clip = '1H_Melee_Attack_Chop', dur = 0.55) {
  const rec = _active.find(a => a.g === group);
  if (!rec) return;
  rec.atkHold = dur;
  rec.rv.play(clip, { once: true, retrigger: true, dur });
}

/** 騎士：KayKit 騎士金色加大版 + 劍盾（fallback：人馬體素） */
export function buildKnightMesh() {
  return _riggedSummon('models/chars/Knight.glb',
    { height: 2.4, tint: 0xffd890 }, _buildKnightVoxel,
    ['models/chars/sword_1handed.gltf', 'models/chars/shield_badge.gltf']);
}

/** 巨人：KayKit 野蠻人放大版 + 雙手斧（fallback：石巨人體素） */
export function buildGiantMesh() {
  return _riggedSummon('models/chars/Barbarian.glb',
    { height: 4.6, tint: 0xcdbfae }, _buildGiantVoxel,
    ['models/chars/axe_2handed.gltf', null]);
}

/** 幽魂：骷髏法師暗紫半透明 + 法杖 + 發光漂浮（fallback：靈體體素） */
export function buildWraithMesh() {
  const g = _riggedSummon('models/chars/Skeleton_Mage.glb',
    { height: 2.1, tint: 0x9a66e8 }, _buildWraithVoxel,
    ['models/chars/staff.gltf', null]);
  const rv = g.userData?.rv;
  if (rv) {
    for (const m of rv.mats) {
      m.transparent = true; m.opacity = 0.85;
      // 自體發光加強（bloom 吃得到；不用 PointLight 避免光源數量變動）
      m.emissive.setHex(0x6a2cc8); m.emissiveIntensity = 0.55;
    }
    rv.group.position.y = 0.35;   // 漂浮
  }
  return g;
}

/** 騎士人馬（Centaur）：下半身是馬，上半身是重甲騎士持長槍 */
function _buildKnightVoxel() {
  const g       = new THREE.Group();
  const steel   = new THREE.MeshLambertMaterial({ color: 0x8899bb });
  const dark    = new THREE.MeshLambertMaterial({ color: 0x334455 });
  const gold    = new THREE.MeshLambertMaterial({ color: 0xddaa22 });
  const horseMat= new THREE.MeshLambertMaterial({ color: 0x5c3d1e });

  // 馬身體
  const horseBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.85, 2.0), horseMat);
  horseBody.position.set(0, 0.62, 0.3); horseBody.castShadow = true; g.add(horseBody);
  const horseNeck = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.7, 0.45), horseMat);
  horseNeck.position.set(0, 1.1, -0.75); horseNeck.rotation.x = 0.35; g.add(horseNeck);
  const horseHead = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.65), horseMat);
  horseHead.position.set(0, 1.55, -1.18); g.add(horseHead);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.3), horseMat);
  snout.position.set(0, 1.42, -1.5); g.add(snout);
  [[-0.32, 0.65], [0.32, 0.65], [-0.32, -0.55], [0.32, -0.55]].forEach(([ox, oz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.28), horseMat);
    leg.position.set(ox, 0.12, oz); g.add(leg);
  });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.12), new THREE.MeshLambertMaterial({ color: 0x3a2510 }));
  tail.position.set(0, 0.85, 1.05); tail.rotation.x = -0.45; g.add(tail);

  // 人類上半身（騎士）
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.1, 0.65), steel);
  torso.position.set(0, 1.85, -0.15); torso.castShadow = true; g.add(torso);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), steel);
  helm.position.set(0, 2.6, -0.15); g.add(helm);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.2, 0.1), dark);
  visor.position.set(0, 2.55, -0.48); g.add(visor);
  const plume = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), new THREE.MeshLambertMaterial({ color: 0xcc2200 }));
  plume.position.set(0, 3.1, -0.15); g.add(plume);
  [-0.62, 0.62].forEach(ox => {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.55), gold);
    sp.position.set(ox, 2.45, -0.15); g.add(sp);
  });

  // 長槍（Lance）
  const lance = new THREE.Group();
  lance.position.set(0.6, 1.9, -0.15);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 3.2, 6), new THREE.MeshLambertMaterial({ color: 0x8b6914 }));
  shaft.rotation.x = Math.PI / 2; shaft.position.z = -1.0; lance.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 6), new THREE.MeshLambertMaterial({ color: 0xdde0ff }));
  tip.rotation.x = Math.PI / 2; tip.position.z = -2.7; lance.add(tip);
  g.add(lance);

  _scene.add(g);
  return g;
}

/** 攻城巨人（Giant）：肩扛雙肩砲 */
function _buildGiantVoxel() {
  const g      = new THREE.Group();
  const stone  = new THREE.MeshLambertMaterial({ color: 0x887766 });
  const dark   = new THREE.MeshLambertMaterial({ color: 0x554433 });
  const metal  = new THREE.MeshLambertMaterial({ color: 0x445566 });
  const barrel = new THREE.MeshLambertMaterial({ color: 0x333344 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.2, 1.4), stone);
  body.position.y = 1.1; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.1), stone);
  head.position.y = 2.7; g.add(head);
  [-0.25, 0.25].forEach(ox => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshLambertMaterial({ color: 0xff4400, emissive: new THREE.Color(0xcc2000), emissiveIntensity: 1.0 }));
    eye.position.set(ox, 2.72, -0.58); g.add(eye);
  });
  [-0.55, 0.55].forEach(ox => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.1, 0.72), dark);
    leg.position.set(ox, -0.55, 0); leg.castShadow = true; g.add(leg);
  });
  [-1.2, 1.2].forEach(ox => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.3, 0.55), stone);
    arm.position.set(ox, 1.2, 0); g.add(arm);
  });
  [-1.1, 1.1].forEach(ox => {
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 0.65), metal);
    mount.position.set(ox, 2.35, 0); g.add(mount);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 1.4, 8), barrel);
    can.rotation.x = Math.PI / 2;
    can.position.set(ox, 2.35, -0.82); g.add(can);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.04, 8, 12), metal);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(ox, 2.35, -1.54); g.add(ring);
  });

  _scene.add(g);
  return g;
}

/** 幽魂（Wraith）：半透明漂浮靈體 */
function _buildWraithVoxel() {
  const g = new THREE.Group();
  const ghostMat = new THREE.MeshLambertMaterial({
    color: 0x7722cc, transparent: true, opacity: 0.82,
    emissive: new THREE.Color(0x440099), emissiveIntensity: 0.5
  });
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.1, 8), ghostMat);
  robe.position.y = 0.85; g.add(robe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), ghostMat);
  head.position.y = 2.15; g.add(head);
  [-0.15, 0.15].forEach(ox => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff44ff }));
    eye.position.set(ox, 2.17, -0.4); g.add(eye);
  });
  // （不掛 PointLight：光源數量變動會觸發全場 shader 重編譯）
  [-0.5, 0.5].forEach(ox => {
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, 0.12), ghostMat);
    claw.position.set(ox * 0.85, 0.9, 0); claw.rotation.z = ox < 0 ? 0.45 : -0.45; g.add(claw);
  });
  g.position.y += 0.4; // 漂浮
  _scene.add(g);
  return g;
}
