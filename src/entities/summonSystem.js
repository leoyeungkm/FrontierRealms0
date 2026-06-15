import * as THREE from 'three';
import { SUMMON_DEFS, GRAVITY } from '../constants.js';
import { buildKnightMesh, buildGiantMesh, buildWraithMesh } from './summon.js';
import { spawnHitSparks, spawnSiegeExplosion, spawnShellSmoke } from '../effects/particles.js';
import { pulseLight, acquireFollowLight } from '../effects/lightPool.js';
import { getTerrainHeight } from '../world/voxelMap.js';
import { towers } from './tower.js';
import { obelisks } from '../world/soi.js';
import { enemies, markEnemyHit } from './enemy.js';
import { sfxCannon, sfxSlam } from '../effects/sfx.js';
import { showDmgNum } from '../effects/dmgNumbers.js';
import { updateSummonHUD, showAnnounce } from '../ui/hud.js';

// ─── 共享狀態（main.js 透過這個 object 讀寫）────────────────
export const summonState = {
  active:  false,  // isSummoned
  type:    '',     // summonType
  hp:      0,      // summonHp
  maxHp:   0,      // summonMaxHp
  atkCd:   0,      // summonAtkCd
  atkAnim: 0,      // summonAtkAnim
  group:   null,   // summonGroup
};

// ─── Injected refs ───────────────────────────────────────────
let _scene        = null;
let _camera       = null;
let _playerPos    = null; // Vector3 ref — mutations visible
let _playerGroup  = null; // set after buildPlayerMesh()
let _atkRingMesh  = null;
let _mouse        = null;

export function initSummonSystem(scene, camera, playerPos, mouse, atkRingMesh) {
  _scene       = scene;
  _camera      = camera;
  _playerPos   = playerPos;
  _mouse       = mouse;
  _atkRingMesh = atkRingMesh;
}

/** buildPlayerMesh 完成後呼叫（playerGroup 初始為 null） */
export function setSummonPlayerGroup(pg) { _playerGroup = pg; }

// ─── Activate / Deactivate ───────────────────────────────────
export function activateSummon(type, room) {
  const def = SUMMON_DEFS[type];
  summonState.active  = true;
  summonState.type    = type;
  summonState.hp      = def.hp;
  summonState.maxHp   = def.hp;
  summonState.atkCd   = 0;
  summonState.atkAnim = 0;
  if (_playerGroup) _playerGroup.visible = false;
  if (type === 'knight')      summonState.group = buildKnightMesh();
  else if (type === 'giant')  summonState.group = buildGiantMesh();
  else if (type === 'wraith') summonState.group = buildWraithMesh();
  if (summonState.group) summonState.group.position.copy(_playerPos);
  updateSummonHUD(true, type, def.hp, def.hp);
  showAnnounce(`⚗ ${def.name} 已召喚！`);
  if (room) room.send('summonStart', [type, def.hp]);
}

export function deactivateSummon() {
  if (!summonState.active) return;
  summonState.active = false;
  summonState.type   = '';
  if (summonState.group) { _scene.remove(summonState.group); summonState.group = null; }
  if (_playerGroup) _playerGroup.visible = true;
  if (_atkRingMesh) _atkRingMesh.scale.setScalar(1);
  clearGiantAimVisual();
  updateSummonHUD(false, '', 0, 0);
}

// ─── 召喚物位置 / 動畫更新（每幀，由 updatePlayer 呼叫）────
export function updateSummonTransform(playerYaw, walkTime, dt) {
  const s = summonState;
  if (s.atkCd > 0) s.atkCd = Math.max(0, s.atkCd - dt);
  if (!s.active || !s.group) return;

  s.group.position.copy(_playerPos);
  if (s.type !== 'wraith') s.group.position.y = _playerPos.y;
  else s.group.position.y = _playerPos.y + 0.4 + Math.sin(walkTime * 2) * 0.12;
  s.group.rotation.y = playerYaw;

  if (s.atkAnim > 0) {
    s.atkAnim = Math.max(0, s.atkAnim - dt * 4.5);
    s.group.rotation.x = Math.sin(s.atkAnim * Math.PI) * 0.55;
    if (s.atkAnim <= 0) s.group.rotation.x = 0;
  }
}

// ─── 召喚物技能組（FEZ：騎士=衝鋒/投槍、巨人=踐踏、亡靈=冰縛/暗霧）──
export const SUMMON_SKILLS = {
  knight: [
    { id: 'knight_charge', icon: '🐎', nameZh: '騎士衝鋒', cd: 6,  desc: '直線衝鋒 12m，沿途重創並擊退' },
    { id: 'lance_throw',   icon: '🔱', nameZh: '投擲長槍', cd: 4,  desc: '遠程投槍（FEZ 騎士的慢速遠攻）' },
  ],
  giant: [
    { id: 'stomp',         icon: '🦶', nameZh: '巨人踐踏', cd: 7,  desc: '震地：周圍敵人吹飛（FEZ 招牌）' },
  ],
  wraith: [
    { id: 'ice_bind',      icon: '❄',  nameZh: '冰縛',     cd: 8,  desc: '周圍敵人凍結傷害（FEZ Ice Bind）' },
    { id: 'dark_mist',     icon: '🌫', nameZh: '暗霧',     cd: 14, desc: '釋放遮蔽視線的黑霧（FEZ Dark Mist）' },
  ],
};
// 技能冷卻（id → 剩餘秒）；main.js 每幀遞減
export const summonSkillCds = {};

// ─── Giant 砲彈系統 ─────────────────────────────────────────
const _giantProjectiles = [];
let   _giantArcLine = null, _giantLandingIndicator = null;

/** 從相機方向找地面瞄準點 */
function getGiantAimTarget() {
  const dir = new THREE.Vector3();
  _camera.getWorldDirection(dir);
  if (Math.abs(dir.y) < 0.01) {
    const yaw = summonState.group?.rotation.y ?? 0;
    return _playerPos.clone().addScaledVector(
      new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 25
    );
  }
  const t = -_camera.position.y / dir.y;
  if (t < 1 || t > 120) return null;
  return _camera.position.clone().addScaledVector(dir, t);
}

/** 高射炮彈道：65° 仰角 */
function calcHighArcVelocity(from, target) {
  const dx = target.x - from.x, dz = target.z - from.z;
  const hDist = Math.max(6, Math.sqrt(dx*dx + dz*dz));
  const g     = Math.abs(GRAVITY);
  const angle = 65 * Math.PI / 180;
  const v     = Math.sqrt(hDist * g / Math.sin(2 * angle));
  const hDir  = new THREE.Vector3(dx, 0, dz).normalize();
  return new THREE.Vector3(
    hDir.x * v * Math.cos(angle),
    v * Math.sin(angle),
    hDir.z * v * Math.cos(angle)
  );
}

/** 估算砲彈落地時間（y=0）；用實際 GRAVITY，並夾住範圍防 NaN/極端值 */
function calcFlightTime(fromY, vy0) {
  const g = Math.abs(GRAVITY);
  const disc = vy0 * vy0 + 2 * g * Math.max(0, fromY);
  const t = disc < 0 ? 2 : (vy0 + Math.sqrt(disc)) / g;
  return Number.isFinite(t) ? Math.min(Math.max(t, 0.3), 8) : 2;
}

export function clearGiantAimVisual() {
  if (_giantArcLine) { _scene.remove(_giantArcLine); _giantArcLine.geometry.dispose(); _giantArcLine = null; }
  if (_giantLandingIndicator) { _scene.remove(_giantLandingIndicator); _giantLandingIndicator = null; }
}

/** 按住滑鼠時顯示拋物線弧線 + 落點圈 */
export function updateGiantAimVisual() {
  if (!summonState.active || summonState.type !== 'giant' || !_mouse.leftDown) {
    clearGiantAimVisual(); return;
  }
  const target = getGiantAimTarget();
  if (!target) { clearGiantAimVisual(); return; }

  const from = _playerPos.clone().add(new THREE.Vector3(0, 3.5, 0));
  const vel  = calcHighArcVelocity(from, target);
  const tFly = calcFlightTime(from.y, vel.y);

  const pts = [];
  const STEPS = 48;
  for (let i = 0; i <= STEPS; i++) {
    const t  = (i / STEPS) * tFly;
    const py = from.y + vel.y * t + 0.5 * GRAVITY * t * t;
    if (py < 0.05) { pts.push(new THREE.Vector3(from.x + vel.x*t, 0.05, from.z + vel.z*t)); break; }
    pts.push(new THREE.Vector3(from.x + vel.x*t, py, from.z + vel.z*t));
  }

  if (_giantArcLine) {
    _giantArcLine.geometry.setFromPoints(pts);
    _giantArcLine.geometry.computeBoundingSphere();
  } else {
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.9, depthTest: false });
    _giantArcLine = new THREE.Line(geo, mat);
    _giantArcLine.renderOrder = 5;
    _scene.add(_giantArcLine);
  }

  const land = pts[pts.length - 1];
  if (!_giantLandingIndicator) {
    const geo2 = new THREE.RingGeometry(0.4, 4.5, 32);
    const mat2 = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthTest: false });
    _giantLandingIndicator = new THREE.Mesh(geo2, mat2);
    _giantLandingIndicator.rotation.x = -Math.PI / 2;
    _giantLandingIndicator.renderOrder = 4;
    _scene.add(_giantLandingIndicator);
  }
  _giantLandingIndicator.position.set(land.x, 0.09, land.z);
}

/** 放開滑鼠時發射砲彈
 *  @returns {number} camShakeDelta — main.js 用 Math.max 合併
 */
export function fireGiantCannon(room) {
  const from   = _playerPos.clone().add(new THREE.Vector3(0, 3.5, 0));
  const target = getGiantAimTarget();
  if (!target) return 0;

  const hDist = new THREE.Vector3(target.x - from.x, 0, target.z - from.z).length();
  if (hDist < 6) {
    // 近身改 Stomp
    spawnHitSparks(_playerPos.clone().add(new THREE.Vector3(0, 1, 0)));
    sfxSlam();   // 巨人踐踏：地面重擊
    if (room) room.send('summonAttack', [_playerPos.x, _playerPos.z, 200, 4]);
    showDmgNum(_playerPos.clone().add(new THREE.Vector3(0, 2, 0)), 'STOMP', false, '#ff8800');
    return 0.3;
  }

  const vel  = calcHighArcVelocity(from, target);
  const tFly = calcFlightTime(from.y, vel.y);

  // 灼熱砲彈：發光彈體 + 跟隨光 + 黑煙尾跡
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 10, 8),
    new THREE.MeshLambertMaterial({
      color: 0x3a3030, emissive: new THREE.Color(0xff5510), emissiveIntensity: 1.2,
    })
  );
  ball.position.copy(from);
  _scene.add(ball);

  pulseLight(from, 0xff8800, 12, 9, 0.12);   // 砲口閃光（光源池）
  sfxCannon();
  const glow = acquireFollowLight(0xff6622, 5, 7);
  glow.set(from);

  _giantProjectiles.push({ mesh: ball, vel: vel.clone(), life: tFly + 0.4, glow, smokeT: 0 });
  return 0.25;
}

// ─── 砲彈 vs 建築/地形 碰撞 ──────────────────────────────────
// 城堡實體量（與 addCastleColliders 腳印一致）：外牆環高4.2、角塔高7.5、主堡高14
const _KEEP_Z = [50, -50];
function _shellHits(p) {
  // 地形（含山坡，不再只看 y=0）
  if (p.y <= getTerrainHeight(p.x, p.z) + 0.3) return true;
  // 兩座城堡
  for (const kz of _KEEP_Z) {
    const ax = Math.abs(p.x), az = Math.abs(p.z - kz);
    if (ax > 8 || az > 8) continue;
    if (ax <= 2.8 && az <= 2.8 && p.y <= 14) return true;                          // 中央主堡
    if (Math.abs(ax - 6) <= 1.7 && Math.abs(az - 6) <= 1.7 && p.y <= 7.5) return true; // 四角塔
    if (ax <= 6.7 && az <= 6.7 && (ax >= 5.3 || az >= 5.3) && p.y <= 4.2) return true; // 外牆環
  }
  // 玩家箭塔
  for (const t of towers) {
    if (p.y <= 6.2 && Math.hypot(p.x - t.pos.x, p.z - t.pos.z) <= 1.3) return true;
  }
  // 方尖塔
  for (const o of obelisks) {
    if (p.y <= 6 && Math.hypot(p.x - o.pos.x, p.z - o.pos.z) <= 0.9) return true;
  }
  return false;
}
const _shellMid = new THREE.Vector3();

/** 每幀更新砲彈飛行
 *  @returns {number} camShakeDelta
 */
export function updateGiantProjectiles(dt, room) {
  let shakeDelta = 0;
  for (let i = _giantProjectiles.length - 1; i >= 0; i--) {
    const p = _giantProjectiles[i];
    p.life -= dt;
    p.vel.y += GRAVITY * dt;
    // 半步 + 全步雙重碰撞檢查（高速彈防止穿薄牆）
    _shellMid.copy(p.mesh.position).addScaledVector(p.vel, dt * 0.5);
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.glow) p.glow.set(p.mesh.position);
    // 黑煙尾跡
    p.smokeT += dt;
    if (p.smokeT >= 0.05) {
      p.smokeT = 0;
      spawnShellSmoke(p.mesh.position);
    }

    // NaN / 異常防護：座標壞掉直接清除，不留殭屍砲彈
    if (!Number.isFinite(p.mesh.position.y) || !Number.isFinite(p.life)) {
      _scene.remove(p.mesh);
      p.mesh.geometry.dispose(); p.mesh.material.dispose();
      if (p.glow) p.glow.release();
      _giantProjectiles.splice(i, 1);
      continue;
    }

    const contactMid = _shellHits(_shellMid);
    if (contactMid || _shellHits(p.mesh.position) || p.life <= 0) {
      const imp = (contactMid ? _shellMid : p.mesh.position).clone();
      // 爆炸視覺貼近地面/牆基（打在高牆上時不懸空）
      imp.y = Math.min(imp.y, getTerrainHeight(imp.x, imp.z) + 1.0);
      shakeDelta = Math.max(shakeDelta, spawnSiegeExplosion(imp));   // 攻城級爆炸
      // 受擊記錄：被砲彈炸死的小兵屍體放射狀炸飛
      for (const [eid, en] of Object.entries(enemies)) {
        const dx = en.group.position.x - imp.x, dz = en.group.position.z - imp.z;
        if (Math.hypot(dx, dz) <= 4.5) markEnemyHit(eid, dx, dz, 13);
      }
      _scene.remove(p.mesh);
      p.mesh.geometry.dispose(); p.mesh.material.dispose();
      if (p.glow) p.glow.release();
      _giantProjectiles.splice(i, 1);
      if (room) room.send('summonAttack', [imp.x, imp.z, 120, 4.5]);
    }
  }
  return shakeDelta;
}
