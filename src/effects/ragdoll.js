import * as THREE from 'three';
import { getTerrainHeight } from '../world/voxelMap.js';

// ─── 真 Ragdoll（Rapier 逐骨骼布娃娃）────────────────────────
// 死亡瞬間：把 KayKit 骨架的 11 段換成動態 capsule 剛體 + 球關節，
// 擊殺衝量打進軀幹，之後每幀「物理 → 骨骼」回寫，
// SkinnedMesh 跟著骨骼 = 四肢自由甩動、撞地翻滾的真布娃娃。

let _world = null, _RAPIER = null;
export function initRagdoll(physics, RAPIER) { _world = physics; _RAPIER = RAPIER; }

const _ragdolls = [];
const MAX_RAGDOLLS = 8;          // 上限（防大量同死爆物理量）
const DENSITY = 80;              // capsule 密度（讓全身質量 ~5-8，衝量手感用）
// 碰撞組：ragdoll 之間不互撞（關節相鄰段會重疊，互撞會抖爆）
const RAGDOLL_GROUPS = (0x0002 << 16) | 0xFFFD;

// KayKit 骨架段定義：[骨名, 子骨名(決定段長方向; null=固定0.22), capsule 半徑]
// 半徑要接近「視覺體積」：太小會物理停在地上、網格卻沉進地裡
const SEGMENTS = [
  ['hips',      'spine',     0.17],
  ['chest',     'head',      0.18],
  ['head',      null,        0.13],
  ['upperarml', 'lowerarml', 0.07],
  ['lowerarml', 'handl',     0.06],
  ['upperarmr', 'lowerarmr', 0.07],
  ['lowerarmr', 'handr',     0.06],
  ['upperlegl', 'lowerlegl', 0.09],
  ['lowerlegl', 'footl',     0.07],
  ['upperlegr', 'lowerlegr', 0.09],
  ['lowerlegr', 'footr',     0.07],
];
// 球關節：[子段, 父段]（錨點 = 子骨原點）
const JOINTS = [
  ['chest', 'hips'], ['head', 'chest'],
  ['upperarml', 'chest'], ['lowerarml', 'upperarml'],
  ['upperarmr', 'chest'], ['lowerarmr', 'upperarmr'],
  ['upperlegl', 'hips'], ['lowerlegl', 'upperlegl'],
  ['upperlegr', 'hips'], ['lowerlegr', 'upperlegr'],
];

const _norm = n => (n || '').toLowerCase().replace(/[^a-z]/g, '');
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _qInv = new THREE.Quaternion();
const _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4();
const _sDummy = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

/**
 * 為角色建立 ragdoll。
 * @param {THREE.Object3D} group 含 SkinnedMesh 的角色根
 * @param {THREE.Vector3|{x,z}} dir 擊殺方向（單位向量即可）
 * @param {number} power 力道（4~13；對應現有的 lastHit.power）
 * @returns handle | null（失敗時呼叫端 fallback 舊拋飛）
 */
export function createRagdoll(group, dir, power = 6) {
  if (!_world || !_RAPIER || _ragdolls.length >= MAX_RAGDOLLS) return null;
  let skinned = null;
  group.traverse(o => { if (!skinned && o.isSkinnedMesh) skinned = o; });
  if (!skinned) return null;
  const bones = {};
  for (const b of skinned.skeleton.bones) bones[_norm(b.name)] = b;
  if (!bones.hips || !bones.chest) return null;

  group.updateMatrixWorld(true);
  const dirX = dir.x || 0, dirZ = dir.z || 0;
  const dl = Math.hypot(dirX, dirZ) || 1;
  const ix = dirX / dl, iz = dirZ / dl;

  const parts = [];
  for (const [name, childName, radius] of SEGMENTS) {
    const bone = bones[name];
    if (!bone) continue;
    const child = childName ? bones[childName] : null;

    const worldScale = bone.getWorldScale(_v3).y || 1;
    let dirLocal, segLen;
    if (child) {
      dirLocal = child.position.clone();
      segLen = dirLocal.length() || 0.2;
      dirLocal.normalize();
    } else {
      dirLocal = new THREE.Vector3(0, 1, 0);
      segLen = 0.22 / worldScale;
    }
    const lenW = segLen * worldScale;

    const wp = bone.getWorldPosition(new THREE.Vector3());
    const wq = bone.getWorldQuaternion(new THREE.Quaternion());
    // capsule 中心 = 骨原點 + 半段（世界）
    const offWorldLocal = dirLocal.clone().multiplyScalar(lenW / 2);   // bone 旋轉系、世界長度
    const center = _v1.copy(offWorldLocal).applyQuaternion(wq).add(wp);

    const body = _world.createRigidBody(
      _RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w })
        .setGravityScale(0.42)      // 世界重力 -25 是跳躍手感用的；屍體用弱重力才有飄逸的拋物線
        .setLinearDamping(0.12)
        .setAngularDamping(0.5)
        .setCcdEnabled(true)        // 連續碰撞：高速時不穿透薄三角形地形
    );
    // capsule 沿段方向（collider 本地 Y → dirLocal）
    const cq = _q1.setFromUnitVectors(_UP, dirLocal);
    const half = Math.max(0.02, lenW / 2 - radius * 0.5);
    _world.createCollider(
      _RAPIER.ColliderDesc.capsule(half, radius)
        .setRotation({ x: cq.x, y: cq.y, z: cq.z, w: cq.w })
        .setDensity(DENSITY)
        .setFriction(0.5)           // 太高會黏地
        .setRestitution(0.35)       // 落地有彈跳
        .setCollisionGroups(RAGDOLL_GROUPS),
      body
    );
    // 擊殺衝量：軀幹吃大頭、四肢小份 + 隨機扭矩（每具死相不同）
    const isCore = name === 'hips' || name === 'chest';
    const k = isCore ? 0.85 : 0.16;
    body.applyImpulse({
      x: ix * power * k,
      y: power * (isCore ? 0.5 : 0.1) + Math.random() * 0.3,   // 多給點滯空
      z: iz * power * k,
    }, true);
    body.applyTorqueImpulse({
      x: (Math.random() - 0.5) * power * 0.06,
      y: (Math.random() - 0.5) * power * 0.06,
      z: (Math.random() - 0.5) * power * 0.06,
    }, true);

    parts.push({ name, bone, body, offWorldLocal });
  }
  if (parts.length < 3) {
    for (const p of parts) _world.removeRigidBody(p.body);
    return null;
  }

  const byName = {};
  for (const p of parts) byName[p.name] = p;
  const joints = [];
  for (const [childSeg, parentSeg] of JOINTS) {
    const c = byName[childSeg], par = byName[parentSeg];
    if (!c || !par) continue;
    // 世界錨點 = 子骨原點
    const anchorW = c.bone.getWorldPosition(_v1);
    const toLocal = (body, out) => {
      const t = body.translation(), r = body.rotation();
      _qInv.set(r.x, r.y, r.z, r.w).invert();
      out.set(anchorW.x - t.x, anchorW.y - t.y, anchorW.z - t.z).applyQuaternion(_qInv);
      return out;
    };
    const a1 = toLocal(par.body, _v2);
    const a2 = toLocal(c.body, _v3);
    joints.push(_world.createImpulseJoint(
      _RAPIER.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z }),
      par.body, c.body, true
    ));
  }

  const rd = { parts, joints, group, dead: false };
  _ragdolls.push(rd);
  return rd;
}

/** 每幀：物理 → 骨骼回寫（在 physics.step 之後呼叫） */
export function updateRagdolls() {
  for (const rd of _ragdolls) {
    if (rd.dead) continue;
    rd.group.updateMatrixWorld(true);
    for (const part of rd.parts) {
      let t = part.body.translation();
      // 保底：萬一還是鑽進地形（極端速度），拉回地表上方
      const gy = getTerrainHeight(t.x, t.z);
      if (t.y < gy - 0.05) {
        part.body.setTranslation({ x: t.x, y: gy + 0.15, z: t.z }, true);
        const lv = part.body.linvel();
        part.body.setLinvel({ x: lv.x * 0.5, y: Math.abs(lv.y) * 0.3, z: lv.z * 0.5 }, true);
        t = part.body.translation();
      }
      const r = part.body.rotation();
      _q1.set(r.x, r.y, r.z, r.w);
      // 骨原點（世界）= 體心 − 旋轉後半段偏移
      _v1.copy(part.offWorldLocal).applyQuaternion(_q1);
      _v2.set(t.x - _v1.x, t.y - _v1.y, t.z - _v1.z);
      // 世界 → 父骨局部（只取位置/旋轉，骨骼 scale 不動）
      _m4.compose(_v2, _q1, _sDummy.set(1, 1, 1));
      _m4b.copy(part.bone.parent.matrixWorld).invert().multiply(_m4);
      _m4b.decompose(part.bone.position, part.bone.quaternion, _sDummy);
      part.bone.updateMatrixWorld(true);
    }
  }
}

/** 釋放（淡出結束 / 重生時） */
export function disposeRagdoll(rd) {
  if (!rd || rd.dead) return;
  rd.dead = true;
  for (const p of rd.parts) _world.removeRigidBody(p.body);   // joints 隨 body 一併移除
  const i = _ragdolls.indexOf(rd);
  if (i >= 0) _ragdolls.splice(i, 1);
}
