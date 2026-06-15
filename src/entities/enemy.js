import * as THREE from 'three';
import { spawnHitSparks, spawnBloodSpray } from '../effects/particles.js';
import { createVoxelRig } from './voxelCharacter.js';
import { warmupRig, getLoadedRig, createRiggedFromGltf, preloadWeapon } from './riggedCharacter.js';
import { createRagdoll, disposeRagdoll } from '../effects/ragdoll.js';
import { sfxDeath, sfxHit } from '../effects/sfx.js';
import { makeSegOverlay } from '../ui/segbar.js';
import { getTerrainHeight } from '../world/voxelMap.js';

// 小兵用骷髏雜兵（與玩家的騎士明確區分）
const RIG_URL = 'models/chars/Skeleton_Minion.glb';
let _minionWeapon = null;   // 共用武器模板（clone 掛到每隻小兵）

// ─── State ───────────────────────────────────────────────────
export const enemies = {};

let _scene   = null;
let _camera  = null;
let _physics = null;
let _RAPIER  = null;

/** 必須在 scene + camera 建立後呼叫一次 */
export function initEnemy(scene, camera) {
  _scene  = scene;
  _camera = camera;
  warmupRig(RIG_URL);
  preloadWeapon('models/chars/sword_1handed.gltf').then(w => { _minionWeapon = w; });
}

/** 物理初始化完成後呼叫 */
export function initEnemyPhysics(physics, RAPIER) {
  _physics = physics;
  _RAPIER  = RAPIER;
}

// ─── Spawn ───────────────────────────────────────────────────
/** team 1 = 藍方小兵（北上），team 2 = 紅方小兵（南下） */
export function spawnEnemy(eid, x, z, hpVal, maxHp, wave, team = 2, y = 0) {
  const isBlue   = (team === 1);
  const colorHex = isBlue ? 0x3355cc : 0xcc3333;

  const group = new THREE.Group();
  group.position.set(x, y, z);
  _scene.add(group);

  // KayKit 骨骼動畫小兵（未載入完成則 fallback 體素 rig）
  let rig = null, rv = null;
  const gltf = getLoadedRig(RIG_URL);
  if (gltf) {
    rv = createRiggedFromGltf(gltf, {
      height: 1.3,                                  // 小兵比玩家矮
      tint: isBlue ? 0x8fb0f0 : 0xf09898,           // 隊色染色
    });
    group.add(rv.group);
    rv.play('Idle');
  } else {
    rig = createVoxelRig({
      headId:   'helmet',
      upperId:  'leather',
      lowerId:  'pants',
      weaponId: 'sword_shield',
      colorHex,
      scale:    0.60,
    });
    group.add(rig.group);
  }

  // HP 條（float 在角色頭上）
  const hpBarY = 2.2; // 略高於角色頭頂
  const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.12), new THREE.MeshBasicMaterial({ color: 0x222222, depthTest: false }));
  bgMesh.position.set(0, hpBarY, 0); bgMesh.renderOrder = 1; group.add(bgMesh);
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x33ee33, depthTest: false });
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.12), fillMat);
  fill.position.set(0, hpBarY + 0.02, 0.01); fill.renderOrder = 2; group.add(fill);
  // 分段格線（每 25HP 一格）：一眼判斷小兵剩餘戰力
  const segBar = makeSegOverlay(1.2, 0.12, maxHp || 100, 25);
  if (segBar) { segBar.position.set(0, hpBarY + 0.02, 0.02); group.add(segBar); }

  let rigidBody = null;
  if (_physics && _RAPIER) {
    const rbDesc = _RAPIER.RigidBodyDesc.kinematicPositionBased();
    rigidBody = _physics.createRigidBody(rbDesc);
    _physics.createCollider(_RAPIER.ColliderDesc.capsule(0.40, 0.35), rigidBody);
    rigidBody.setTranslation({ x, y: y + 0.5, z }, false);
  }

  enemies[eid] = {
    group, rig, rv, fill, bgMesh, segBar,
    maxHp: maxHp || 100, currentHp: hpVal,
    targetPos: new THREE.Vector3(x, y, z),
    team: team || 2, atKeep: false,
    atkAnim: 0, walkPhase: 0, idleTime: 0,
    body: rigidBody,
  };
}

// ─── HP / Hit ────────────────────────────────────────────────
export function updateEnemyHp(eid, curHp) {
  if (!enemies[eid]) return;
  const en = enemies[eid];
  if (curHp < en.currentHp) { flashEnemyHit(eid); spawnHitSparks(en.group.position.clone().add(new THREE.Vector3(0, 1, 0))); }
  en.currentHp = curHp;
  const r = Math.max(0, curHp / en.maxHp);
  en.fill.scale.x = r; en.fill.position.x = (r - 1) * 0.6;
  en.fill.material.color.setHSL(r * 0.33, 1, 0.45);
}

/** 記錄最後受擊方向/力道（死亡時決定屍體拋飛軌跡；不同技能不同死法）
 *  只有「玩家自己」的攻擊會呼叫 → 也是命中聲的掛點（小兵互打不出聲） */
export function markEnemyHit(eid, dx, dz, power = 5) {
  const e = enemies[eid];
  if (!e) return;
  const l = Math.hypot(dx, dz) || 1;
  e.lastHit = { x: dx / l, z: dz / l, power, t: performance.now() };
  sfxHit(power >= 8, _camera ? _camera.position.distanceTo(e.group.position) : 20);
  spawnBloodSpray(e.group.position, dx / l, dz / l);   // 我的攻擊命中 → 噴血 + 血漬
}

export function flashEnemyHit(eid) {
  if (!enemies[eid]) return;
  const en = enemies[eid];
  en.hitPunch = 1;   // 受擊擠壓（squash & stretch）
  const view = en.rv || en.rig;
  if (!view) return;
  view.setEmissive(0xffffff, 1.5);
  setTimeout(() => {
    const e2 = enemies[eid];
    if (e2) (e2.rv || e2.rig)?.setEmissive(0x000000, 0);
  }, 120);
}

// ─── Remove ──────────────────────────────────────────────────
export function removeEnemy(eid) {
  if (!enemies[eid]) return;
  const e = enemies[eid];
  _scene.remove(e.group);
  if (e.body && _physics) _physics.removeRigidBody(e.body);
  delete enemies[eid];
}

// ─── Death rig（倒地 → 淡出）────────────────────────────────
const _dying = [];  // { group, timer, mats }
const _FALL_DUR  = 0.45;  // 倒地動畫時長
const _LIE_DUR   = 0.60;  // 躺地停留
const _FADE_DUR  = 0.50;  // 淡出時長
const _TOTAL_DUR = _FALL_DUR + _LIE_DUR + _FADE_DUR;

export function killEnemy(eid) {
  if (!enemies[eid]) return;
  const e = enemies[eid];

  // 立即移除 Rapier body + HP bar
  if (e.body && _physics) _physics.removeRigidBody(e.body);
  e.bgMesh.visible = false;
  e.fill.visible   = false;
  if (e.segBar) e.segBar.visible = false;

  sfxDeath(_camera ? _camera.position.distanceTo(e.group.position) : 20);
  // 死法分流（日式 × 物理混合）：
  //   強力擊殺（技能/AoE/踐踏/砲，power≥5.5）→ 真 ragdoll 拋飛（爽快）
  //   普通擊殺（輕普攻）→ Death_A 死亡動畫（乾淨利落的日式倒地）
  const lh = e.lastHit && (performance.now() - e.lastHit.t) < 900 ? e.lastHit : null;
  const strong = !!(lh && lh.power >= 5.5);
  let rag = null;
  if (e.rv && strong) {
    rag = createRagdoll(e.group, { x: lh.x, z: lh.z }, lh.power * 1.15);
  }

  // 動畫死亡（普通擊殺 / ragdoll 額滿 fallback）
  if (!rag && e.rv) e.rv.play('Death_A', { once: true, dur: 0.8, clamp: true, retrigger: true });
  const fly = (!rag && lh && strong) ? {
    vx: lh.x * lh.power,
    vy: 2.5 + lh.power * 0.5,
    vz: lh.z * lh.power,
    spinX: (Math.random() - 0.5) * (4 + lh.power),
    spinZ: (Math.random() - 0.5) * (4 + lh.power),
  } : null;

  // 收集所有 mesh 材質，改為透明模式
  const mats = [];
  e.group.traverse(obj => {
    if (obj.isMesh && obj.material) {
      obj.material = obj.material.clone();
      obj.material.transparent = true;
      obj.material.opacity = 1;
      mats.push(obj.material);
    }
  });

  _dying.push({ group: e.group, timer: 0, mats, rv: e.rv, fly, rag });
  delete enemies[eid];
}

export function updateDyingEnemies(dt) {
  for (let i = _dying.length - 1; i >= 0; i--) {
    const d = _dying[i];
    d.timer += dt;

    // 真 Ragdoll：骨骼由物理驅動（mixer 停用），躺夠久再淡出
    if (d.rag) {
      if (d.timer > 2.0) {
        const fade = Math.max(0, 1 - (d.timer - 2.0) / 0.7);
        for (const m of d.mats) m.opacity = fade;
      }
      if (d.timer >= 2.8) {
        disposeRagdoll(d.rag);
        _scene.remove(d.group);
        _dying.splice(i, 1);
      }
      continue;
    }

    if (d.rv) d.rv.update(dt);   // Death_A 剪輯推進

    // 屍體拋飛：拋物線 + 翻滾 + 落地反彈（不同技能力道 → 不同死法）
    if (d.fly) {
      const f = d.fly;
      f.vy -= 25 * dt;
      d.group.position.x += f.vx * dt;
      d.group.position.y += f.vy * dt;
      d.group.position.z += f.vz * dt;
      const gy = getTerrainHeight(d.group.position.x, d.group.position.z);
      if (d.group.position.y <= gy) {
        d.group.position.y = gy;
        if (f.vy < -3) {   // 彈跳
          f.vy = -f.vy * 0.35;
          f.vx *= 0.55; f.vz *= 0.55;
          f.spinX *= 0.5; f.spinZ *= 0.5;
        } else {           // 落定
          f.vx = 0; f.vy = 0; f.vz = 0;
          f.spinX *= 0.82; f.spinZ *= 0.82;
        }
      }
      d.group.rotation.x += f.spinX * dt;
      d.group.rotation.z += f.spinZ * dt;
    }

    if (d.timer < _FALL_DUR) {
      // 往後倒地（體素限定；rigged 由 Death_A 演出）
      if (!d.rv && !d.fly) {
        const t = d.timer / _FALL_DUR;
        d.group.rotation.x = -Math.PI * 0.5 * (t * t);   // ease-in
        d.group.position.y = -0.05 * t;                   // 略微下沉
      }
    } else if (d.timer < _FALL_DUR + _LIE_DUR) {
      // 躺地不動
      if (!d.rv && !d.fly) d.group.rotation.x = -Math.PI * 0.5;
    } else {
      // 淡出
      const fade = 1 - Math.min(1, (d.timer - _FALL_DUR - _LIE_DUR) / _FADE_DUR);
      for (const m of d.mats) m.opacity = fade;
    }

    if (d.timer >= _TOTAL_DUR) {
      _scene.remove(d.group);
      _dying.splice(i, 1);
    }
  }
}

export function clearEnemies() {
  for (const e of Object.values(enemies)) {
    _scene.remove(e.group);
    if (e.body && _physics) _physics.removeRigidBody(e.body);
  }
  for (const k in enemies) delete enemies[k];
  // 清理正在死亡的
  for (const d of _dying) {
    if (d.rag) disposeRagdoll(d.rag);
    _scene.remove(d.group);
  }
  _dying.length = 0;
}

// ─── Update（每幀）──────────────────────────────────────────
const _SEPARATION_R = 0.55;  // 每個士兵的佔位半徑（m）
const _MIN_DIST     = _SEPARATION_R * 2; // 兩士兵中心最小距離

export function updateEnemies(dt) {
  const alpha = Math.min(1, dt * 12);
  for (const e of Object.values(enemies)) {
    // 水平位置朝目標插值（伺服器驅動），高度貼合地形
    const dx = e.targetPos.x - e.group.position.x;
    const dz = e.targetPos.z - e.group.position.z;
    const movingSq = dx * dx + dz * dz;
    const px = e.group.position.x, pz = e.group.position.z;
    if (!e.atKeep) e.group.position.lerp(e.targetPos, alpha);
    // 本幀實際水平移動距離 → 推進腳步相位（步伐與速度完全同步，不滑步）
    const moved = Math.hypot(e.group.position.x - px, e.group.position.z - pz);
    e.walkPhase = (e.walkPhase || 0) + moved * 0.55;
    // 高度平滑貼地（避免崖邊/陡坡瞬間跳動看起來像卡住）
    const gy = getTerrainHeight(e.group.position.x, e.group.position.z);
    e.group.position.y += (gy - e.group.position.y) * Math.min(1, dt * 10);

    // 平滑轉向移動方向（取最短弧）
    if (!e.atKeep && movingSq > 0.04) {
      const targetYaw = Math.atan2(dx, dz);
      let dy = targetYaw - e.group.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.group.rotation.y += dy * Math.min(1, dt * 8);
    }

    if (e.body) {
      const p = e.group.position;
      e.body.setTranslation({ x: p.x, y: p.y + 0.5, z: p.z }, false);
    }
    // 受擊擠壓回彈：橫向撐開、縱向壓扁，0.15s 回正
    if (e.hitPunch > 0) {
      e.hitPunch = Math.max(0, e.hitPunch - dt * 7);
      const p = Math.sin(Math.min(1, e.hitPunch) * Math.PI);
      e.group.scale.set(1 + p * 0.16, 1 - p * 0.12, 1 + p * 0.16);
    } else if (e.group.scale.x !== 1) {
      e.group.scale.set(1, 1, 1);
    }
    e.bgMesh.lookAt(_camera.position);
    e.fill.lookAt(_camera.position);
    if (e.segBar) e.segBar.lookAt(_camera.position);
    if (e.rv) {
      // KayKit 骨骼動畫：攻擊 / 行走（速度同步步頻）/ 待機
      e.rv.update(dt);
      // 武器模板若在 spawn 後才載入完成，補掛一次
      if (!e._weaponSet && _minionWeapon) { e._weaponSet = true; e.rv.setWeapons(_minionWeapon, null); }
      if (e.atkAnim > 0) {
        e.atkAnim = Math.max(0, e.atkAnim - dt * 2.2);
        if (!e._atkPlayed) {
          e._atkPlayed = true;
          e.rv.play('1H_Melee_Attack_Chop', { once: true, dur: 0.5, retrigger: true });
        }
        if (e.atkAnim <= 0) e._atkPlayed = false;
      } else if (movingSq > 0.01) {
        const spd = moved / Math.max(dt, 1e-4);
        e.rv.play('Walking_A', { timeScale: Math.min(1.8, Math.max(0.6, spd * 0.5)) });
      } else {
        e.rv.play('Idle');
      }
    } else if (e.atkAnim > 0) {
      // 揮擊動畫：torso 前傾後回正（體素 fallback）
      e.atkAnim = Math.max(0, e.atkAnim - dt * 4);
      const swing = Math.sin(e.atkAnim * Math.PI) * 0.55;
      if (e.rig) {
        e.rig.torsoAnchor.rotation.x = swing * 0.6;
        e.rig.armR.shoulder.rotation.x = -swing * 0.8;
      }
      if (e.atkAnim <= 0 && e.rig) {
        e.rig.torsoAnchor.rotation.x = 0;
        e.rig.armR.shoulder.rotation.x = -0.3;
      }
    } else if (e.rig) {
      // 移動時播放行走動畫（相位由實際移動距離驅動，速度多快腳就跨多快）
      if (movingSq > 0.01) {
        e.rig.animateWalk(e.walkPhase || 0);
      } else {
        e.idleTime = (e.idleTime || 0) + dt;
        e.rig.animateIdle(e.idleTime);
      }
    }
  }

  // ── 士兵分離推擠（O(n²)，防止互相穿插）──────────────────────
  const list = Object.values(enemies);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const dx = a.group.position.x - b.group.position.x;
      const dz = a.group.position.z - b.group.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= _MIN_DIST * _MIN_DIST || distSq < 0.0001) continue;
      const dist = Math.sqrt(distSq);
      const push = (_MIN_DIST - dist) * 0.5;
      const nx = dx / dist, nz = dz / dist;
      // 推擠前檢查目標點地形：不把小兵推上陡坡 / 崖壁（防止卡在地形上）
      if (!a.atKeep) {
        const ax = a.group.position.x + nx * push, az = a.group.position.z + nz * push;
        if (getTerrainHeight(ax, az) - a.group.position.y < 0.8) {
          a.group.position.x = ax; a.group.position.z = az;
        }
      }
      if (!b.atKeep) {
        const bx = b.group.position.x - nx * push, bz = b.group.position.z - nz * push;
        if (getTerrainHeight(bx, bz) - b.group.position.y < 0.8) {
          b.group.position.x = bx; b.group.position.z = bz;
        }
      }
    }
  }
}
