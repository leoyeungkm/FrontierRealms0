import * as THREE from 'three';
import { loadKitGLB } from './models.js';

// ─── 模型城堡（Kenney Castle Kit, CC0）────────────────────────
// 沿用既有物理碰撞體腳印：外牆環 ±6（高4）、四角塔 3×3、中央主堡 5×5、
// 城門開在朝戰場側（藍堡 -z、紅堡 +z）的 |x|<2。
// 屋頂與旗幟用純色材質上隊色（藍/紅），不受調色盤貼圖限制。

const PIECES = {
  wall:  'models/castle/wall.glb',        // 1×1×1.31 城牆段（含城垛）
  arch:  'models/castle/arch.glb',        // 0.94×0.94×1.01 拱門
  base:  'models/castle/tower_base.glb',  // 1×1×1.01 塔基
  mid:   'models/castle/tower_mid.glb',   // 0.94×0.94×1.01 塔身
  top:   'models/castle/tower_top.glb',   // 1×1×0.30 塔頂城垛
  roof:  'models/castle/roof.glb',        // 1×1×2.01 尖頂（隊色）
  flag:  'models/castle/flag.glb',        // 旗幟（隊色）
};

const TEAM_TINT = {
  blue: new THREE.Color(0x4a78d8),
  red:  new THREE.Color(0xd84a4a),
};

/**
 * 建立兩座模型城堡。全部部件共 7 個 InstancedMesh。
 * @returns {Promise<boolean>} 全部部件載入成功才回傳 true（失敗時呼叫端保留體素城堡）
 */
export async function buildModelCastles(scene) {
  const keys = Object.keys(PIECES);
  const loaded = {};
  await Promise.all(keys.map(async k => { loaded[k] = await loadKitGLB(PIECES[k]); }));
  if (keys.some(k => !loaded[k])) return false;

  // 石材部件共用第一份貼圖材質；隊色部件（roof/flag）改純白 Lambert + per-instance 隊色
  const stoneMat = loaded.wall.material;
  const teamMat  = new THREE.MeshLambertMaterial({ color: 0xffffff });

  // 收集每種部件的擺放（兩座城堡一起）
  const X = {};
  for (const k of keys) X[k] = [];
  const place = (key, x, y, z, rotY, sx, sy, sz, tint) =>
    X[key].push({ x, y, z, rotY, sx, sy, sz, tint });

  for (const { cz, gateSign, tint } of [
    { cz:  50, gateSign: -1, tint: TEAM_TINT.blue },  // 藍堡，門朝 -z（戰場）
    { cz: -50, gateSign:  1, tint: TEAM_TINT.red  },  // 紅堡，門朝 +z（戰場）
  ]) {
    // 背面城牆：3 片（每片 3m 長、~4m 高、1.2m 厚）
    for (const ox of [-3, 0, 3]) place('wall', ox, 0, cz - gateSign * 6, 0, 3, 3, 1.2);
    // 左右側牆：各 3 片（轉 90°）
    for (const oz of [-3, 0, 3]) {
      place('wall', -6, 0, cz + oz, Math.PI / 2, 3, 3, 1.2);
      place('wall',  6, 0, cz + oz, Math.PI / 2, 3, 3, 1.2);
    }
    // 門面：左右各 1 片 + 中央拱門（開口對齊碰撞體缺口 |x|<2）
    place('wall', -3.25, 0, cz + gateSign * 6, 0, 2.5, 3, 1.2);
    place('wall',  3.25, 0, cz + gateSign * 6, 0, 2.5, 3, 1.2);
    place('arch',  0,    0, cz + gateSign * 6, 0, 4.5, 4, 1.7);
    // 四角塔：塔基 + 塔身 + 城垛頂 + 隊旗
    for (const [tx, tz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      place('base', tx, 0,    cz + tz, 0, 3,    3, 3);
      place('mid',  tx, 3.03, cz + tz, 0, 3.19, 3, 3.19);
      place('top',  tx, 6.06, cz + tz, 0, 3,    3, 3);
      place('flag', tx, 6.95, cz + tz, gateSign > 0 ? 0 : Math.PI, 2.4, 2.4, 2.4, tint);
    }
    // 中央主堡：大塔基 + 塔身 + 隊色尖頂
    place('base', 0, 0,    cz, 0, 5,    4, 5);
    place('mid',  0, 4.04, cz, 0, 5.32, 4, 5.32);
    place('roof', 0, 8.08, cz, 0, 5,    3.2, 5, tint);
  }

  // 石件分層灰調（Kenney 原色偏奶白，乘上灰藍調更像石材，也做出上下層次）
  const STONE_TINT = {
    wall: new THREE.Color(0xd8dbe0),
    arch: new THREE.Color(0xb8bfc8),
    base: new THREE.Color(0xa6adb8),   // 底層最深
    mid:  new THREE.Color(0xc6ccd4),
    top:  new THREE.Color(0xb4bbc4),
  };
  const dummy = new THREE.Object3D();
  const white = new THREE.Color(1, 1, 1);
  for (const key of keys) {
    const list = X[key];
    if (!list.length) continue;
    const isTeam = key === 'roof' || key === 'flag';
    const im = new THREE.InstancedMesh(loaded[key].geometry, isTeam ? teamMat : stoneMat, list.length);
    const stoneTint = STONE_TINT[key] || white;
    list.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.rotY, 0);
      dummy.scale.set(t.sx, t.sy, t.sz);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, t.tint || stoneTint);
    });
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
  }
  return true;
}
