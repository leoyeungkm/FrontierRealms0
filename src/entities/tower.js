import * as THREE from 'three';
import { TOWER_FIRE_RATE, TOWER_RANGE, TOWER_DAMAGE } from '../constants.js';
import { enemies, flashEnemyHit } from './enemy.js';
import { spawnHitSparks } from '../effects/particles.js';
import { loadKitGLB } from '../world/models.js';

// ─── State ───────────────────────────────────────────────────
export const towers = [];

let _scene   = null;
let _physics = null;
let _RAPIER  = null;
let _hexPieces = null;   // { base, mid, roof }（Kenney Castle Kit，載入完成才用）

/** 必須在 physics init 完成後呼叫 */
export function initTower(scene, physics, RAPIER) {
  _scene   = scene;
  _physics = physics;
  _RAPIER  = RAPIER;
  // 預載六角塔模型件（失敗則蓋程序化塔）
  Promise.all([
    loadKitGLB('models/castle/hex_base.glb'),
    loadKitGLB('models/castle/hex_mid.glb'),
    loadKitGLB('models/castle/hex_roof.glb'),
  ]).then(([base, mid, roof]) => {
    if (base && mid && roof) _hexPieces = { base, mid, roof };
  }).catch(() => {});
}

// ─── Mesh + Collider ─────────────────────────────────────────
function _buildTowerMesh() {
  const g = new THREE.Group();
  if (_hexPieces) {
    // Kenney 六角塔：塔基(h1.31) + 塔身(h0.46) + 尖頂(h0.83)
    const mk = (p, y, s) => {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.position.y = y; m.scale.setScalar(s);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
    mk(_hexPieces.base, 0,    2.3);   // h ≈ 3.0
    mk(_hexPieces.mid,  3.0,  2.4);   // h ≈ 1.1
    mk(_hexPieces.roof, 4.1,  2.4);   // h ≈ 2.0 → 總高 ~6.1
  } else {
    // 程序化 fallback
    const stone = new THREE.MeshLambertMaterial({ color: 0xc0b0a0 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.6, 8), stone);
    base.position.y = 0.3; g.add(base);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 4.0, 8), stone);
    shaft.position.y = 2.6; shaft.castShadow = true; g.add(shaft);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.45, 0.28), stone);
      const a = (i / 6) * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.7, 4.83, Math.sin(a) * 0.7); g.add(b);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.8, 8),
      new THREE.MeshLambertMaterial({ color: 0x8b2020 }));
    roof.position.y = 5.5; g.add(roof);
  }
  return g;
}

export function createTower(x, z, team = 1, mine = true) {
  const g = _buildTowerMesh();
  g.position.set(x, 0, z);
  _scene.add(g);

  if (_physics) {
    _physics.createCollider(
      _RAPIER.ColliderDesc.cylinder(2.0, 0.75).setTranslation(x, 2.0, z)
    );
  }

  const tower = { pos: new THREE.Vector3(x, 0, z), fireTimer: Math.random() * TOWER_FIRE_RATE, arrows: [], team, mine };
  towers.push(tower);
  return tower;
}

// ─── 箭矢 ────────────────────────────────────────────────────
function shootArrow(tower, eid) {
  if (!enemies[eid]) return;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.55, 4),
    new THREE.MeshLambertMaterial({ color: 0x8b6914 })
  );
  mesh.position.copy(tower.pos.clone().add(new THREE.Vector3(0, 4.5, 0)));
  _scene.add(mesh);
  tower.arrows.push({ mesh, eid, traveled: 0 });
}

// ─── Update（每幀）──────────────────────────────────────────
/** myTeam: 不攻擊友方小兵；room: 發送 towerHit 訊息 */
export function updateTowers(dt, myTeam, room) {
  for (const t of towers) {
    const tteam = t.team || myTeam;   // 同步來的塔用自己的歸屬陣營（打對方陣營的小兵）
    t.fireTimer += dt;
    if (t.fireTimer >= TOWER_FIRE_RATE) {
      let nearestEid = null, nearDist = TOWER_RANGE;
      for (const [eid, en] of Object.entries(enemies)) {
        if (en.team === tteam) continue;
        const d = en.group.position.distanceTo(t.pos);
        if (d < nearDist) { nearDist = d; nearestEid = eid; }
      }
      if (nearestEid) { t.fireTimer = 0; shootArrow(t, nearestEid); }
    }
    t.arrows = t.arrows.filter(a => {
      const en = enemies[a.eid];
      if (!en) { _scene.remove(a.mesh); return false; }
      const targetPos = en.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      const toTarget  = targetPos.clone().sub(a.mesh.position);
      const dist      = toTarget.length();
      a.mesh.position.addScaledVector(toTarget.normalize(), 16 * dt);
      a.traveled += 16 * dt;
      if (dist < 0.9) {
        if (t.mine && room) room.send('towerHit', [a.eid, TOWER_DAMAGE]);   // 只有自己建的塔才送傷害（避免重複）
        spawnHitSparks(en.group.position.clone().add(new THREE.Vector3(0, 1, 0)));
        flashEnemyHit(a.eid);
        _scene.remove(a.mesh); return false;
      }
      if (a.traveled > TOWER_RANGE + 5) { _scene.remove(a.mesh); return false; }
      return true;
    });
  }
}
