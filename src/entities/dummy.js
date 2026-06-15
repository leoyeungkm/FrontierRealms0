import * as THREE from 'three';
import { spawnHitSparks } from '../effects/particles.js';
import { showDmgNum } from '../effects/dmgNumbers.js';
import { sfxHit } from '../effects/sfx.js';
import { makeSegOverlay } from '../ui/segbar.js';

// ─── State ───────────────────────────────────────────────────
export const dummies = [];

let _scene  = null;
let _camera = null;
let _onKill = null; // callback: () => void，在 dummy 死亡時呼叫

/** 必須在 scene + camera 建立後呼叫一次
 *  onKill: 每次 dummy 死亡時呼叫（用於 main.js 更新 killCount）
 */
export function initDummy(scene, camera, onKill) {
  _scene  = scene;
  _camera = camera;
  _onKill = onKill;
}

// ─── Spawn ───────────────────────────────────────────────────
export function spawnDummy(x, z) {
  const g = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xc8a050 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.2), bodyMat);
  body.position.y = 1.1; body.castShadow = true; g.add(body);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x8b6914 }));
  pole.position.y = 1.2; g.add(pole);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xd4a050 }));
  head.position.y = 2.4; head.castShadow = true; g.add(head);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x8b6914 }));
  arm.position.y = 1.5; g.add(arm);

  // HP bar
  const bgM = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x222222, depthTest: false }));
  bgM.position.set(0, 3.0, 0); bgM.renderOrder = 1; g.add(bgM);
  const fillM = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x33ee33, depthTest: false }));
  fillM.position.set(0, 3.02, 0.01); fillM.renderOrder = 2; g.add(fillM);
  const segM = makeSegOverlay(1.0, 0.1, 200, 25);   // 200HP → 8 格（100HP 粗線）
  if (segM) { segM.position.set(0, 3.02, 0.02); g.add(segM); }

  g.position.set(x, 0, z);
  _scene.add(g);
  const d = {
    group: g, body, head, fillM, bgM, segM,
    hp: 200, maxHp: 200, alive: true, respawnTimer: 0, baseY: 0,
    homeX: x, homeZ: z,            // 重生歸位用
    kb: null,                      // 吹飛狀態 { vx, vz, t, dur }
  };
  dummies.push(d);
  return d;
}

// ─── 吹飛（FEZ knockback：飛行位移 + 後仰，落定後回正）────────
export function dummyKnockback(d, dirX, dirZ, power = 4) {
  if (!d.alive) return;
  const len = Math.hypot(dirX, dirZ) || 1;
  d.kb = {
    vx: (dirX / len) * power * 2.6,
    vz: (dirZ / len) * power * 2.6,
    t: 0, dur: 0.38,
  };
}

// ─── Damage / Death ──────────────────────────────────────────
/** emboldened: 是否有 Embolden buff（main.js 傳入） */
export function dummyTakeDamage(d, amount, isCrit, emboldened = false) {
  if (!d.alive) return;
  const finalDmg = emboldened ? Math.round(amount * 1.3) : amount;
  d.hp = Math.max(0, d.hp - finalDmg);

  const pos = d.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 3.5 + Math.random() * 0.5, 0));
  showDmgNum(pos, finalDmg, isCrit);
  spawnHitSparks(d.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
  sfxHit(isCrit);   // 假人只會被玩家自己打到——訓練命中回饋

  const r = d.hp / d.maxHp;
  d.fillM.scale.x = r; d.fillM.position.x = (r - 1) * 0.5;
  d.fillM.material.color.setHSL(r * 0.33, 1, 0.45);

  d.body.material.color.setHex(0xffffff);
  d.head.material.color.setHex(0xffffff);
  setTimeout(() => { d.body.material.color.setHex(0xc8a050); d.head.material.color.setHex(0xd4a050); }, 100);

  if (d.hp <= 0) _dummyDie(d);
}

function _dummyDie(d) {
  d.alive = false;
  d.group.rotation.z = Math.PI / 2;
  d.group.position.y = d.baseY - 0.4;
  d.respawnTimer = 4.0;
  if (_onKill) _onKill();
}

// ─── Update（每幀）──────────────────────────────────────────
export function updateDummies(dt) {
  for (const d of dummies) {
    if (!d.alive) {
      d.respawnTimer -= dt;
      if (d.respawnTimer <= 0) {
        d.alive = true; d.hp = d.maxHp;
        d.group.rotation.set(0, 0, 0);
        d.group.position.set(d.homeX, d.baseY, d.homeZ);   // 重生歸位
        d.kb = null;
        d.fillM.scale.x = 1; d.fillM.position.x = 0;
        d.fillM.material.color.setHex(0x33ee33);
      }
    } else {
      // 吹飛飛行：位移 + 小弧線 + 朝飛行方向後仰，落定回正
      if (d.kb) {
        const kb = d.kb;
        kb.t += dt;
        const k = Math.min(1, kb.t / kb.dur);
        const ease = 1 - k * k;                      // 減速
        d.group.position.x += kb.vx * ease * dt;
        d.group.position.z += kb.vz * ease * dt;
        d.group.position.y = d.baseY + Math.sin(k * Math.PI) * 0.45;
        const lean = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.5;
        const ang = Math.atan2(kb.vx, kb.vz);
        d.group.rotation.x = Math.cos(ang) * lean;   // 朝飛行方向後仰
        d.group.rotation.z = -Math.sin(ang) * lean;
        if (k >= 1) {
          d.kb = null;
          d.group.position.y = d.baseY;
          d.group.rotation.x = 0; d.group.rotation.z = 0;
        }
      }
      d.bgM.lookAt(_camera.position);
      d.fillM.lookAt(_camera.position);
      if (d.segM) d.segM.lookAt(_camera.position);
    }
  }
}
