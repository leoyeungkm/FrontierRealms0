import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CRYSTAL_MAX, MINE_RANGE, MINE_RATE_NORMAL, MINE_RATE_SLOW } from '../constants.js';
import { spawnHitSparks, spawnMiningDust } from '../effects/particles.js';
import { showDmgNum } from '../effects/dmgNumbers.js';
import { updateCrystalHUD } from '../ui/hud.js';

// ─── State ───────────────────────────────────────────────────
export const crystalNodes = [];
export const crystalState = { count: 0 };

// ─── Injected refs ───────────────────────────────────────────
let _scene = null, _camera = null, _playerPos = null, _keys = null;
let _getIsDead = () => false;
let _playerGroup = null, _playerSword = null, _playerBody_ = null;

// ─── Mining internal state ────────────────────────────────────
let mineTimer = 0, isCurrentlyMining = false, miningAnimTime = 0, miningDustTimer = 0;

export function isMining() { return isCurrentlyMining; }
let miningRingMesh = null, miningRingMat = null;

export function initCrystal(scene, camera, playerPos, keys, getIsDead) {
  _scene = scene; _camera = camera; _playerPos = playerPos;
  _keys = keys; _getIsDead = getIsDead;

  miningRingMat = new THREE.MeshBasicMaterial({
    color: 0x44aaff, side: THREE.DoubleSide, transparent: true, opacity: 0, depthTest: false
  });
  miningRingMesh = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.65, 48), miningRingMat);
  miningRingMesh.rotation.x = -Math.PI / 2;
  miningRingMesh.renderOrder = 3;
  miningRingMesh.visible = false;
  scene.add(miningRingMesh);
}

/** buildPlayerMesh 完成後呼叫 */
export function setCrystalPlayerRefs(group, sword, body) {
  _playerGroup = group; _playerSword = sword; _playerBody_ = body;
}

// ─── Crystal Node（程序化風格水晶簇）──────────────────────────
// 六角尖柱簇（主柱+外傾副柱）＋ 菲涅爾邊緣發光（吃 bloom）＋
// 底深頂亮漸層 ＋ 緩慢脈動 ＋ 灰岩底座。flatShading 給切面感。
const _cryTime = { value: 0 };

const _cryMat = new THREE.MeshLambertMaterial({
  color: 0xffffff, flatShading: true, transparent: true, opacity: 0.94,
});
_cryMat.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = _cryTime;
  sh.uniforms.uGlow = { value: new THREE.Color(0x27d6c4) };
  sh.vertexShader = ('varying float vCH;\nvarying vec3 vCWp;\n' + sh.vertexShader)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vCH = position.y;
      vCWp = (modelMatrix * vec4(position, 1.0)).xyz;`);
  sh.fragmentShader = ('uniform float uTime;\nuniform vec3 uGlow;\nvarying float vCH;\nvarying vec3 vCWp;\n' + sh.fragmentShader)
    .replace('#include <color_fragment>', `#include <color_fragment>
      // 底深頂亮（內部透光感）
      diffuseColor.rgb = mix(vec3(0.05, 0.24, 0.30), vec3(0.32, 0.93, 0.90),
                             smoothstep(0.0, 1.9, vCH));`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // 菲涅爾邊緣光：側面/稜線亮 → bloom 拾取；加緩慢呼吸脈動
        vec3 Vv = normalize(vViewPosition);
        float fr = pow(1.0 - clamp(dot(Vv, normalize(normal)), 0.0, 1.0), 2.4);
        float pulse = 0.5 + 0.5 * sin(uTime * 1.8 + vCWp.x * 0.5 + vCWp.z * 0.4);
        totalEmissiveRadiance += uGlow * (0.16 + fr * 1.15 + pulse * 0.10);
      }`);
};
const _cryRockMat = new THREE.MeshLambertMaterial({ color: 0x7d848d, flatShading: true });

/** 一根六角水晶柱（柱身漸縮 + 尖錐頂），回傳已套用傾斜/位置的 geometry */
function _crystalSpike(r, h, ang, dist, tilt) {
  const body = new THREE.CylinderGeometry(r * 0.45, r, h * 0.72, 6, 1, true);
  body.translate(0, h * 0.36, 0);
  const tip = new THREE.ConeGeometry(r * 0.45, h * 0.30, 6);
  tip.translate(0, h * 0.87, 0);
  const one = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()]);
  const d = new THREE.Object3D();
  // 沿切線軸外傾 + 隨機自轉（簇感）
  d.quaternion.setFromAxisAngle(new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)), tilt);
  d.rotateY(Math.random() * Math.PI * 2);
  d.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
  d.updateMatrix();
  one.applyMatrix4(d.matrix);
  return one;
}

function _buildNodeVisual(g) {
  const parts = [];
  // 水晶簇：1 主柱 + 5–7 根外傾副柱
  const spikes = [_crystalSpike(0.30 + Math.random() * 0.08, 1.7 + Math.random() * 0.5,
                                Math.random() * Math.PI * 2, 0, Math.random() * 0.1)];
  const n = 5 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.7;
    spikes.push(_crystalSpike(
      0.12 + Math.random() * 0.12, 0.55 + Math.random() * 0.75,
      ang, 0.30 + Math.random() * 0.32, 0.18 + Math.random() * 0.38));
  }
  const cry = new THREE.Mesh(mergeGeometries(spikes), _cryMat);
  cry.castShadow = cry.receiveShadow = true;
  g.add(cry); parts.push(cry);
  // 灰岩底座（接地）
  const rocks = [];
  for (let i = 0; i < 4; i++) {
    const rg = new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.14, 0);   // Polyhedron 本身即非索引
    const a = Math.random() * Math.PI * 2;
    rg.scale(1, 0.55 + Math.random() * 0.3, 1);
    rg.rotateY(Math.random() * Math.PI);
    rg.translate(Math.cos(a) * (0.3 + Math.random() * 0.3), 0.05, Math.sin(a) * (0.3 + Math.random() * 0.3));
    rocks.push(rg);
  }
  const rock = new THREE.Mesh(mergeGeometries(rocks), _cryRockMat);
  rock.castShadow = rock.receiveShadow = true;
  g.add(rock); parts.push(rock);
  return parts;
}

export function spawnCrystalNode(x, z, hpVal = 5) {
  const g = new THREE.Group();
  const visualParts = _buildNodeVisual(g);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.10),
    new THREE.MeshBasicMaterial({ color: 0x222222, depthTest: false }));
  bg.position.set(0, 2.1, 0); bg.renderOrder = 1; g.add(bg);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.10),
    new THREE.MeshBasicMaterial({ color: 0x44aaff, depthTest: false }));
  fill.position.set(0, 2.11, 0.01); fill.renderOrder = 2; g.add(fill);
  g.position.set(x, 0, z);
  _scene.add(g);
  crystalNodes.push({ group: g, bg, fill, visualParts, hp: hpVal, maxHp: hpVal, alive: true, respawnTimer: 0 });
}

// ─── Mining Update（每幀）────────────────────────────────────
export function updateMining(dt) {
  _cryTime.value += dt;   // 水晶發光脈動時鐘
  // 礦節點 billboard + 重生
  for (const c of crystalNodes) {
    if (!c.alive) {
      c.respawnTimer -= dt;
      if (c.respawnTimer <= 0) {
        c.alive = true; c.hp = c.maxHp;
        c.group.visible = true;
        c.fill.scale.x = 1; c.fill.position.x = 0;
      }
      continue;
    }
    c.bg.lookAt(_camera.position);
    c.fill.lookAt(_camera.position);
  }

  const stopMining = () => {
    if (!isCurrentlyMining) return;
    isCurrentlyMining = false;
    mineTimer = 0; miningAnimTime = 0; miningDustTimer = 0;
    miningRingMesh.visible = false;
  };

  if (_getIsDead() || !_keys['KeyC']) { stopMining(); return; }

  let nearest = null, nearDist = MINE_RANGE;
  for (const c of crystalNodes) {
    if (!c.alive) continue;
    const d = _playerPos.distanceTo(c.group.position);
    if (d < nearDist) { nearDist = d; nearest = c; }
  }
  if (!nearest || crystalState.count >= CRYSTAL_MAX) { stopMining(); return; }

  isCurrentlyMining = true;
  miningAnimTime  += dt;
  miningDustTimer += dt;

  const rate     = crystalState.count >= 12 ? MINE_RATE_SLOW : MINE_RATE_NORMAL;
  const progress = Math.min(1, mineTimer / rate);

  miningRingMesh.visible = true;
  miningRingMesh.position.set(nearest.group.position.x, 0.05, nearest.group.position.z);
  miningRingMesh.scale.setScalar(0.5 + progress * 1.8);
  miningRingMat.opacity = 0.2 + progress * 0.55;

  // 採礦動畫由主循環的 animateSit() 處理，此處不再操控 rig

  if (miningDustTimer >= 0.2) {
    miningDustTimer = 0;
    spawnMiningDust(nearest.group.position.clone().add(new THREE.Vector3(0, 0.8, 0)));
  }

  mineTimer += dt;
  if (mineTimer < rate) return;
  mineTimer = 0;
  miningRingMesh.scale.setScalar(0.5);

  crystalState.count++;
  updateCrystalHUD(crystalState.count);
  nearest.hp--;
  const r = nearest.hp / nearest.maxHp;
  nearest.fill.scale.x = r; nearest.fill.position.x = (r - 1) * 0.5;
  spawnHitSparks(nearest.group.position.clone().add(new THREE.Vector3(0, 1, 0)));
  showDmgNum(nearest.group.position.clone().add(new THREE.Vector3(0, 2.6, 0)), '+💎', false, '#44ccff');

  if (nearest.hp <= 0) {
    nearest.alive = false;
    nearest.respawnTimer = 60;
    nearest.group.visible = false;
    stopMining();
  }
}
