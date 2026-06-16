import * as THREE from 'three';
import { worldToScreen } from '../effects/dmgNumbers.js';
import { createVoxelRig } from './voxelCharacter.js';
import { warmupRig, getLoadedRig, createRiggedFromGltf, preloadWeapon } from './riggedCharacter.js';
import { disposeRagdoll } from '../effects/ragdoll.js';
import { APPEARANCE_MODELS, buildAppearanceRig } from '../ui/appearance.js';

// 遠端玩家外觀：按 sessionId 穩定輪替三種職業（騎士/野蠻人/兜帽盜賊）
const RP_VARIANTS = [
  { url: 'models/chars/Knight.glb',       weapons: ['models/chars/sword_1handed.gltf', 'models/chars/shield_badge.gltf'] },
  { url: 'models/chars/Barbarian.glb',    weapons: ['models/chars/axe_2handed.gltf', null] },
  { url: 'models/chars/Rogue_Hooded.glb', weapons: ['models/chars/dagger.gltf', null] },
];
function _pickVariant(sid) {
  let h = 0;
  for (let i = 0; i < sid.length; i++) h = (h * 31 + sid.charCodeAt(i)) | 0;
  return RP_VARIANTS[Math.abs(h) % RP_VARIANTS.length];
}

// ─── State ───────────────────────────────────────────────────
export const remotePlayers = {};

let _scene   = null;
let _physics = null;
let _RAPIER  = null;

/** 必須在 scene 建立後呼叫一次 */
export function initRemotePlayer(scene) {
  _scene = scene;
  for (const v of RP_VARIANTS) warmupRig(v.url);   // 預載三種職業外觀
}

/** 物理初始化完成後呼叫（在 initPhysics().then() 內）*/
export function initRemotePlayerPhysics(physics, RAPIER) {
  _physics = physics;
  _RAPIER  = RAPIER;
}

// ─── Sword Animation（本地 / 遠端共用）──────────────────────
export function applySwordAnim(sword, a) {
  const t = 1 - a; // t: 0→1 隨動畫進行
  let rx, rz, py;
  if (t < 0.22) {
    const u = t / 0.22;
    rx = u * 0.7; rz = -0.3 - u * 0.3; py = 0.75 + u * 0.12;
  } else if (t < 0.62) {
    const u = (t - 0.22) / 0.40;
    rx = 0.7 - u * (0.7 + Math.PI * 1.3); rz = -0.60 + u * 0.75; py = 0.87 - u * 0.24;
  } else {
    const u = (t - 0.62) / 0.38;
    rx = -Math.PI * 1.3 * (1 - u); rz = 0.15 - u * 0.45; py = 0.63 + u * 0.12;
  }
  sword.rotation.x = rx;
  sword.rotation.z = rz;
  sword.position.y = py;
}

// ─── Spawn ───────────────────────────────────────────────────
/** myTeam 用於判斷名牌顏色（敵/友）*/
export function spawnRemotePlayer(sid, team = 1, myTeam = 1) {
  if (remotePlayers[sid]) return;
  const colorHex = team === 2 ? 0xc04f4f : 0x4f7fc0;

  const g = new THREE.Group();
  g.visible = false; // 等第一次收到座標再顯示

  // KayKit 骨骼動畫角色（職業外觀按 sid 輪替；未載入完成則 fallback 體素 rig）
  let rig = null, rv = null;
  const variant = _pickVariant(sid);
  const gltf = getLoadedRig(variant.url);
  if (gltf) {
    rv = createRiggedFromGltf(gltf, {
      height: 1.7,
      tint: team === 2 ? 0xffb0a8 : 0xb0c8ff,   // 隊色淡染
    });
    g.add(rv.group);
    rv.play('Idle');
    Promise.all([
      variant.weapons[0] ? preloadWeapon(variant.weapons[0]) : null,
      variant.weapons[1] ? preloadWeapon(variant.weapons[1]) : null,
    ]).then(([r, l]) => { if (rv && g.parent) rv.setWeapons(r, l); }).catch(() => {});
  } else {
    rig = createVoxelRig({
      headId:   'helmet',
      upperId:  'plate',
      lowerId:  'greaves',
      weaponId: 'sword_shield',
      colorHex,
      scale:    0.65,
    });
    g.add(rig.group);
  }
  _scene.add(g);

  // ── Rapier kinematic body（若物理已初始化）──────────────────
  let rigidBody = null;
  if (_physics && _RAPIER) {
    const rbDesc = _RAPIER.RigidBodyDesc.kinematicPositionBased();
    rigidBody = _physics.createRigidBody(rbDesc);
    _physics.createCollider(
      _RAPIER.ColliderDesc.capsule(0.5, 0.35),
      rigidBody
    );
  }

  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;pointer-events:none;text-align:center;transform:translateX(-50%);';
  const isEnemy = team !== myTeam;
  const shortId = sid.slice(-5);
  label.innerHTML = `
    <div style="color:${isEnemy?'#ff8888':'#88ddff'};font-size:11px;text-shadow:1px 1px 2px #000;white-space:nowrap;">
      ${isEnemy?'🔴':'🔵'} <span class="rp-name">${shortId}</span>
    </div>
    <div style="background:#111;border-radius:3px;overflow:hidden;height:5px;width:60px;margin:1px auto;position:relative;">
      <div class="rp-hp-fill" style="height:100%;width:100%;background:${isEnemy?'#cc2200':'#22aa44'};transition:width .2s;"></div>
      <div style="position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(90deg,transparent 0 calc(25% - 1px),rgba(0,0,0,.6) calc(25% - 1px) 25%);"></div>
    </div>`;
  document.getElementById('hud').appendChild(label);

  remotePlayers[sid] = { group: g, rig, rv, targetPos: new THREE.Vector3(), targetYaw: 0, team, atkAnim: 0, walkPhase: 0, idleTime: 0, hp: 100, maxHp: 100, label, summonGroup: null, body: rigidBody };

  // 對方的外觀廣播比 spawn 先到 → 補套用
  if (_pendingApp[sid]) {
    setRemoteAppearance(sid, _pendingApp[sid]);
    delete _pendingApp[sid];
  }
  if (_pendingName[sid]) { setRemoteName(sid, _pendingName[sid]); delete _pendingName[sid]; }
}

// ─── 外觀同步（角色自定面板的選擇，server relay）──────────────
const _pendingApp = {};

export function setRemoteAppearance(sid, app) {
  if (!app) return;
  const rp = remotePlayers[sid];
  if (!rp) { _pendingApp[sid] = app; return; }
  rp.appearance = app;
  _applyRpAppearance(sid, rp, app);
}

// 遠端玩家角色名（server relay 'pname'）：更新名牌（沒到位前暫存，spawn 後補套用）
const _pendingName = {};
export function setRemoteName(sid, name) {
  if (!name) return;
  const rp = remotePlayers[sid];
  if (!rp) { _pendingName[sid] = name; return; }
  rp.pname = name;
  const el = rp.label && rp.label.querySelector('.rp-name');
  if (el) el.textContent = name;
}

async function _applyRpAppearance(sid, rp, app) {
  const def = APPEARANCE_MODELS[app.model];
  if (!def) return;
  const rv = await buildAppearanceRig(app, {
    tint: rp.team === 2 ? 0xffb0a8 : 0xb0c8ff,   // 隊色淡染（與服裝色相乘共存）
  });
  if (!rv || remotePlayers[sid] !== rp || rp.appearance !== app) return;   // 已離線/已被更新
  if (rp.rv)  { rp.group.remove(rp.rv.group);  rp.rv = null; }
  if (rp.rig) { rp.group.remove(rp.rig.group); rp.rig = null; }
  rp.group.add(rv.group);
  rv.play('Idle');
  rp.rv = rv;
  const wpns = app.model === 'barbarian' && app.gsSkin === 'sword'
    ? ['models/chars/sword_2handed.gltf', null] : def.weapons;
  Promise.all([
    wpns[0] ? preloadWeapon(wpns[0]) : null,
    wpns[1] ? preloadWeapon(wpns[1]) : null,
  ]).then(([r, l]) => { if (rp.rv === rv) rv.setWeapons(r, l); }).catch(() => {});
}

// ─── Remove ──────────────────────────────────────────────────
export function removeRemotePlayer(sid) {
  if (!remotePlayers[sid]) return;
  const rp = remotePlayers[sid];
  if (rp._rag) { disposeRagdoll(rp._rag); rp._rag = null; }
  _scene.remove(rp.group);
  if (rp.summonGroup) _scene.remove(rp.summonGroup);
  if (rp.label) rp.label.remove();
  if (rp.body && _physics) _physics.removeRigidBody(rp.body);
  delete remotePlayers[sid];
}

// ─── Update（每幀）──────────────────────────────────────────
export function updateRemotes(dt) {
  const alpha = Math.min(1, dt * 10);
  for (const rp of Object.values(remotePlayers)) {
    // Ragdoll 中：group 必須完全凍結——物理直接驅動骨骼（世界空間回寫），
    // group 若繼續插值/轉向，非驅動骨（手/武器掛點）會跟著 group 走，
    // 與被鎖定的骨骼互相拉扯 → 屍體縮成一團、武器繞著屍體轉
    if (rp._rag) {
      const labelPos = rp.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      const sp = worldToScreen(labelPos);
      if (rp.label) {
        if (sp && rp.group.visible) { rp.label.style.left = sp.x + 'px'; rp.label.style.top = sp.y + 'px'; rp.label.style.display = 'block'; }
        else rp.label.style.display = 'none';
      }
      continue;
    }
    const px = rp.group.position.x, pz = rp.group.position.z;
    rp.group.position.lerp(rp.targetPos, alpha);
    // 腳步相位 = 實際移動距離驅動（與本地玩家步頻一致，不滑步）
    rp.walkPhase = (rp.walkPhase || 0) + Math.hypot(rp.group.position.x - px, rp.group.position.z - pz) * 0.45;
    rp.group.rotation.y = THREE.MathUtils.lerp(rp.group.rotation.y, rp.targetYaw, alpha);

    // 同步 Rapier body 到 lerped 位置（capsule 中心 = feet + 0.5）
    // 用 setTranslation 立即更新 broad phase，讓 computeColliderMovement 能查到
    if (rp.body) {
      const p = rp.group.position;
      rp.body.setTranslation({ x: p.x, y: p.y + 0.5, z: p.z }, false);
    }

    if (rp.summonGroup) {
      rp.summonGroup.position.lerp(rp.targetPos, alpha);
      rp.summonGroup.rotation.y = rp.group.rotation.y;
    }
    const labelY = rp.summonType === 'giant' ? 5.2 : rp.summonType ? 3.5 : 2.2;
    const labelPos = (rp.summonGroup || rp.group).position.clone().add(new THREE.Vector3(0, labelY, 0));
    const sp = worldToScreen(labelPos);
    if (rp.label) {
      if (sp && rp.group.visible) { rp.label.style.left = sp.x + 'px'; rp.label.style.top = sp.y + 'px'; rp.label.style.display = 'block'; }
      else rp.label.style.display = 'none';
    }
    const rpMoving = rp.group.position.distanceToSquared(rp.targetPos) > 0.04;
    if (rp.rv) {
      // KayKit 骨骼動畫（ragdoll 時停 mixer，避免武器掛點繼續播動畫亂轉）
      if (!rp._rag) rp.rv.update(dt);
      if (rp.atkAnim > 0) {
        rp.atkAnim = Math.max(0, rp.atkAnim - dt * 2.2);
        if (!rp._atkPlayed) {
          rp._atkPlayed = true;
          rp.rv.play('1H_Melee_Attack_Slice_Horizontal', { once: true, dur: 0.45, retrigger: true });
        }
        if (rp.atkAnim <= 0) rp._atkPlayed = false;
      } else if (rpMoving) {
        rp.rv.play('Running_A', { timeScale: 1.0 });
      } else {
        rp.rv.play('Idle');
      }
    } else if (rp.rig) {
      if (rp.atkAnim > 0) {
        rp.atkAnim = Math.max(0, rp.atkAnim - dt * 2.8);
        const swing = Math.sin((1 - rp.atkAnim) * Math.PI);
        rp.rig.torsoAnchor.rotation.x = swing * 0.3;
        rp.rig.armR.shoulder.rotation.x = -swing * 1.0;
        if (rp.atkAnim <= 0) {
          rp.rig.torsoAnchor.rotation.x = 0;
          rp.rig.armR.shoulder.rotation.x = -0.3;
        }
      } else {
        // 靜止 / 移動動畫（行走相位由移動距離驅動）
        if (rpMoving) {
          rp.rig.animateWalk(rp.walkPhase || 0);
        } else {
          rp.idleTime = (rp.idleTime || 0) + dt;
          rp.rig.animateIdle(rp.idleTime);
        }
      }
    }
  }
}
