import * as THREE from 'three';

// ─── 日式卡通著色（三階 toon 漸層，全角色共用）────────────────
let _gradientMap = null;
export function toonGradient() {
  if (_gradientMap) return _gradientMap;
  const tex = new THREE.DataTexture(new Uint8Array([110, 200, 255]), 3, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  _gradientMap = tex;
  return tex;
}

/** 卡通材質（取代舊的像素材質；rough/metal 參數保留簽名相容，不再使用） */
export function vmat(hex) {
  return new THREE.MeshToonMaterial({ color: hex, gradientMap: toonGradient() });
}

// ─── 幾何快取（圓潤部件共用）─────────────────────────────────
const _geoCache = {};
function capGeo(r, len) {
  const k = `c${r}_${len}`;
  return _geoCache[k] || (_geoCache[k] = new THREE.CapsuleGeometry(r, len, 4, 10));
}
function sphGeo(r) {
  const k = `s${r}`;
  return _geoCache[k] || (_geoCache[k] = new THREE.SphereGeometry(r, 18, 14));
}

function part(parent, geo, m, x, y, z, store) {
  const g = new THREE.Mesh(geo, m);
  g.position.set(x || 0, y || 0, z || 0);
  g.castShadow = true; g.receiveShadow = true;
  parent.add(g);
  if (store) store.push(g);
  return g;
}

// 動漫描邊：反向殼（純黑背面網格，跟著父關節動）
const _outlineMat = new THREE.MeshBasicMaterial({ color: 0x201822, side: THREE.BackSide });
function addOutline(mesh, store, grow = 1.07) {
  const o = new THREE.Mesh(mesh.geometry, _outlineMat);
  o.position.copy(mesh.position);
  o.rotation.copy(mesh.rotation);
  o.scale.copy(mesh.scale).multiplyScalar(grow);
  mesh.parent.add(o);
  if (store) store.push(o);
  return o;
}

function voxel(parent, w, h, d, m, x, y, z, store) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  g.position.set(x || 0, y || 0, z || 0);
  g.castShadow = true; g.receiveShadow = true;
  parent.add(g);
  if (store) store.push(g);
  return g;
}

function clearGroup(arr) {
  // 只釋放非共用幾何（Box = 每次新建；Capsule/Sphere 走快取不可 dispose）
  arr.forEach(o => {
    o.parent && o.parent.remove(o);
    if (o.geometry && o.geometry.type === 'BoxGeometry') o.geometry.dispose();
  });
  arr.length = 0;
}

// ─── 動漫臉（canvas 貼圖：大眼 + 眉 + 嘴 + 腮紅，全角色共用）──
let _faceTex = null;
function faceTexture() {
  if (_faceTex) return _faceTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 128);
  const eye = (cx) => {
    // 眼白底 → 大虹膜 → 瞳孔 → 高光（經典動漫眼）
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(cx, 58, 21, 26, 0, 0, 7); g.fill();
    g.fillStyle = '#4a3328';
    g.beginPath(); g.ellipse(cx, 60, 16, 22, 0, 0, 7); g.fill();
    g.fillStyle = '#241712';
    g.beginPath(); g.ellipse(cx, 64, 9, 13, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.ellipse(cx - 6, 50, 6, 8, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx + 7, 70, 3, 4, 0, 0, 7); g.fill();
    // 上眼線
    g.strokeStyle = '#2a1c20'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, 62, 22, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  };
  eye(78); eye(178);
  // 眉毛
  g.strokeStyle = '#3a2a24'; g.lineWidth = 4;
  g.beginPath(); g.arc(78, 38, 18, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
  g.beginPath(); g.arc(178, 38, 18, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
  // 嘴（小弧）
  g.strokeStyle = '#7a4438'; g.lineWidth = 4;
  g.beginPath(); g.arc(128, 96, 9, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  // 腮紅
  g.fillStyle = 'rgba(255,140,140,0.35)';
  g.beginPath(); g.ellipse(42, 88, 13, 8, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(214, 88, 13, 8, 0, 0, 7); g.fill();
  _faceTex = new THREE.CanvasTexture(c);
  return _faceTex;
}

const SKIN = 0xf2c9a0;   // 動漫膚色（亮）

// ─────────────────────────────────────────────────────────────
/**
 * 建立完整體素角色 rig（骨架 + 方塊 mesh）
 *
 * opts:
 *   headId   = 'helmet'|'hair'|'hood'|'crown'|'bald'
 *   upperId  = 'plate'|'leather'|'tunic'|'robe'|'bare'
 *   lowerId  = 'greaves'|'pants'|'skirt'|'shorts'
 *   weaponId = 'sword_shield'|'greatsword'|'polearm'|'none'
 *   colorHex = 0x4f7fc0 (主色)
 *   scale    = 0.65     (縮放至遊戲比例)
 *
 * 返回值:
 *   { group, pelvis, torsoAnchor, headAnchor,
 *     armL, armR, legL, legR,
 *     buildHead, buildUpper, buildLower, buildWeapon,
 *     animateIdle, animateWalk, getAllMeshes, setEmissive }
 */
export function createVoxelRig(opts = {}) {
  const {
    headId   = 'helmet',
    upperId  = 'plate',
    lowerId  = 'greaves',
    weaponId = 'sword_shield',
    colorHex = 0x4f7fc0,
    scale    = 0.65,
  } = opts;

  let curCol = colorHex;

  // ─── 骨架 ─────────────────────────────────────────────────
  const group = new THREE.Group();
  group.scale.setScalar(scale);

  const pelvis = new THREE.Group();
  pelvis.position.y = 1.0;
  group.add(pelvis);

  const torsoAnchor = new THREE.Group();
  pelvis.add(torsoAnchor);

  // headAnchor 作為 torsoAnchor 的 child，
  // 扭身時頭部隨軀幹一起轉，不會分離
  const headAnchor = new THREE.Group();
  headAnchor.position.y = 0.96;
  torsoAnchor.add(headAnchor);

  function makeArm(side) {
    const s = side === 'L' ? -1 : 1;
    const shoulder = new THREE.Group();
    shoulder.position.set(0.48 * s, 0.62, 0);
    torsoAnchor.add(shoulder);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.42, 0);
    shoulder.add(elbow);
    const hand = new THREE.Group();
    hand.position.set(0, -0.42, 0);
    elbow.add(hand);
    return { side, s, shoulder, elbow, hand, upperParts: [], foreParts: [] };
  }

  function makeLeg(side) {
    const s = side === 'L' ? -1 : 1;
    const hip = new THREE.Group();
    hip.position.set(0.17 * s, 0, 0);
    pelvis.add(hip);
    const knee = new THREE.Group();
    knee.position.set(0, -0.46, 0);
    hip.add(knee);
    const foot = new THREE.Group();
    foot.position.set(0, -0.44, 0);
    knee.add(foot);
    return { side, s, hip, knee, foot, thighParts: [], shinParts: [] };
  }

  const armL = makeArm('L');
  const armR = makeArm('R');
  const legL = makeLeg('L');
  const legR = makeLeg('R');

  // ─── 上身（日式 Q 版：膠囊軀幹 + 圓肩 + 膠囊手臂）──────────
  const torsoParts = [];
  function buildUpper(id) {
    clearGroup(torsoParts);
    clearGroup(armL.upperParts); clearGroup(armL.foreParts);
    clearGroup(armR.upperParts); clearGroup(armR.foreParts);
    const c1 = new THREE.Color(curCol), c2 = c1.clone().multiplyScalar(0.7);
    const cloth = vmat(c1.getHex()), cloth2 = vmat(c2.getHex());
    // 板甲帶隊色：鋼色混入 35% 主色，遠看能辨敵我
    const armorC = new THREE.Color(0xb8c2d2).lerp(c1, 0.35);
    const steel = vmat(armorC.getHex()), steelD = vmat(armorC.clone().multiplyScalar(0.72).getHex());
    const leather = vmat(0x8a5c38), leatherD = vmat(0x5e3e26);
    const skin = vmat(SKIN);
    const torsoM = id === 'plate' ? steel : (id === 'leather' ? leather : (id === 'bare' ? skin : (id === 'robe' ? cloth2 : cloth)));
    const foreM  = id === 'plate' ? steelD : (id === 'leather' ? leatherD : (id === 'robe' ? cloth : skin));
    const upperM = id === 'bare' ? skin : torsoM;

    // 軀幹：上寬下窄兩段膠囊（胸 + 腰腹）
    const chest = part(torsoAnchor, capGeo(0.29, 0.3), torsoM, 0, 0.58, 0, torsoParts);
    addOutline(chest, torsoParts);
    part(torsoAnchor, capGeo(0.26, 0.22), id === 'robe' ? cloth2 : (id === 'plate' ? steelD : torsoM), 0, 0.24, 0, torsoParts);
    // 腰帶
    part(torsoAnchor, capGeo(0.27, 0.02), id === 'plate' ? vmat(0xe0b54a) : cloth2, 0, 0.38, 0, torsoParts);
    if (id === 'plate') {
      // 胸甲亮面 + 金色徽記
      part(torsoAnchor, sphGeo(0.17), vmat(armorC.clone().multiplyScalar(1.18).getHex()), 0, 0.66, 0.17, torsoParts);
      part(torsoAnchor, sphGeo(0.06), vmat(0xe0b54a), 0, 0.7, 0.3, torsoParts);
    }
    if (id === 'robe') {
      // 法袍下襬（圓錐裙）
      const hem = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.62, 14), cloth2);
      hem.position.y = 0.1; hem.castShadow = true; torsoAnchor.add(hem); torsoParts.push(hem);
      part(torsoAnchor, sphGeo(0.07), vmat(0xe8c84a), 0, 0.55, 0.26, torsoParts);
    }
    if (id === 'leather') {
      // 斜背帶
      const strap = voxel(torsoAnchor, 0.1, 0.74, 0.5, leatherD, 0, 0.52, 0.01, torsoParts);
      strap.rotation.z = 0.5;
    }

    // 手臂：肩球 + 上臂/前臂膠囊 + 圓手
    [armL, armR].forEach(a => {
      if (id === 'plate') addOutline(part(a.shoulder, sphGeo(0.155), steel, 0, -0.02, 0, a.upperParts), a.upperParts, 1.06);
      else part(a.shoulder, sphGeo(0.13), upperM, 0, -0.04, 0, a.upperParts);
      part(a.shoulder, capGeo(0.095, 0.24), upperM, 0, -0.22, 0, a.upperParts);
      part(a.elbow, capGeo(0.085, 0.22), foreM, 0, -0.18, 0, a.foreParts);
      part(a.hand, sphGeo(0.105), vmat(SKIN), 0, -0.04, 0, a.foreParts);
    });
  }

  // ─── 下身（Q 版短腿：膠囊大腿/小腿 + 圓鞋）─────────────────
  const pelvisParts = [];
  function buildLower(id) {
    clearGroup(pelvisParts);
    clearGroup(legL.thighParts); clearGroup(legL.shinParts);
    clearGroup(legR.thighParts); clearGroup(legR.shinParts);
    const c1 = new THREE.Color(curCol).multiplyScalar(0.62);
    const pants = vmat(c1.getHex());
    const armorC = new THREE.Color(0xb8c2d2).lerp(new THREE.Color(curCol), 0.3);
    const steel = vmat(armorC.getHex()), steelL = vmat(armorC.clone().multiplyScalar(1.15).getHex());
    const boot = vmat(0x4a3526), skin = vmat(SKIN);

    // 臀部（圓潤短褲型）
    part(pelvis, capGeo(0.27, 0.1), id === 'greaves' ? steel : pants, 0, -0.06, 0, pelvisParts);
    if (id === 'skirt') {
      const sk = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.42, 12), vmat(curCol));
      sk.position.y = -0.18; sk.castShadow = true; pelvis.add(sk); pelvisParts.push(sk);
    }
    const thM = id === 'greaves' ? steel : (id === 'skirt' ? skin : pants);
    const shM = id === 'greaves' ? steelL : ((id === 'shorts' || id === 'skirt') ? skin : pants);
    [legL, legR].forEach(l => {
      part(l.hip, capGeo(0.115, 0.26), thM, 0, -0.2, 0, l.thighParts);
      part(l.knee, capGeo(0.10, 0.24), shM, 0, -0.17, 0, l.shinParts);
      if (id === 'greaves') part(l.knee, sphGeo(0.115), steelL, 0, 0, 0, l.shinParts);
      // 圓頭鞋
      const shoe = part(l.foot, sphGeo(0.13), boot, 0, -0.03, 0.06, l.shinParts);
      shoe.scale.set(1, 0.72, 1.45);
    });
  }

  // ─── 頭部（日式 Q 版：大球頭 + 動漫臉 + 圓潤髮型/頭盔）──────
  const headParts = [];
  const HEAD_R = 0.36;   // Q 版大頭（約佔身高 1/2.6）
  function buildHead(id) {
    clearGroup(headParts);
    const skin = vmat(SKIN), hair = vmat(0x4a3326), cloth = vmat(curCol);
    const armorC = new THREE.Color(0xc2ccdc).lerp(new THREE.Color(curCol), 0.3);
    const steel = vmat(armorC.getHex());

    // 脖子 + 大球頭 + 描邊
    part(headAnchor, capGeo(0.08, 0.1), skin, 0, -0.02, 0, headParts);
    const head = part(headAnchor, sphGeo(HEAD_R), skin, 0, 0.3, 0, headParts);
    head.scale.set(1, 0.96, 0.96);
    addOutline(head, headParts, 1.05);

    // 動漫臉：貼合頭球弧面的球面貼片（不會穿插或懸空）
    if (!_geoCache.face) {
      // φ 以 +z 為中心 ±0.62、θ 取眼鼻高度帶
      _geoCache.face = new THREE.SphereGeometry(HEAD_R + 0.008, 16, 12,
        Math.PI / 2 - 0.62, 1.24, 1.2, 0.62);
    }
    const face = new THREE.Mesh(_geoCache.face, new THREE.MeshBasicMaterial({
      map: faceTexture(), transparent: true, depthWrite: false,
    }));
    face.position.copy(head.position);
    face.scale.copy(head.scale);
    face.renderOrder = 1;
    headAnchor.add(face); headParts.push(face);

    if (id === 'hair' || id === 'crown') {
      // 動漫髮：後髮蓋（避開臉）+ 前瀏海三撮 + 兩側鬢髮
      const cap = part(headAnchor, sphGeo(HEAD_R + 0.045), hair, 0, 0.345, -0.105, headParts);
      cap.scale.set(1, 0.92, 1);
      const bang = (x, s, rz) => {
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.085 * s, 0.22 * s, 6), hair);
        b.position.set(x, 0.5, HEAD_R * 0.78);
        b.rotation.set(2.75, 0, rz);
        b.castShadow = true; headAnchor.add(b); headParts.push(b);
      };
      bang(-0.15, 1.0, 0.3); bang(0, 1.2, 0); bang(0.15, 1.0, -0.3);
      const lockL = part(headAnchor, capGeo(0.07, 0.2), hair, -HEAD_R - 0.01, 0.18, 0.02, headParts);
      const lockR = part(headAnchor, capGeo(0.07, 0.2), hair,  HEAD_R + 0.01, 0.18, 0.02, headParts);
      lockL.rotation.z = 0.12; lockR.rotation.z = -0.12;
      if (id === 'crown') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 8, 16), vmat(0xe0b54a));
        ring.position.set(0, 0.63, 0); ring.rotation.x = Math.PI / 2;
        ring.castShadow = true; headAnchor.add(ring); headParts.push(ring);
      }
    } else if (id === 'helmet') {
      // 圓頂盔（蓋頭頂不遮臉）+ 護頰 + 紅纓
      const dome = part(headAnchor, sphGeo(HEAD_R + 0.06), steel, 0, 0.52, -0.01, headParts);
      dome.scale.set(1, 0.62, 1);
      addOutline(dome, headParts, 1.05);
      part(headAnchor, sphGeo(0.1), steel, -HEAD_R - 0.02, 0.24, 0.02, headParts).scale.set(0.5, 1.3, 1);
      part(headAnchor, sphGeo(0.1), steel,  HEAD_R + 0.02, 0.24, 0.02, headParts).scale.set(0.5, 1.3, 1);
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), vmat(0xd84a4a));
      plume.position.set(0, 0.85, 0); plume.castShadow = true;
      headAnchor.add(plume); headParts.push(plume);
    } else if (id === 'hood') {
      const hd = part(headAnchor, sphGeo(HEAD_R + 0.07), cloth, 0, 0.36, -0.1, headParts);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 8), cloth);
      peak.position.set(0, 0.72, -0.16); peak.rotation.x = -0.5;
      peak.castShadow = true; headAnchor.add(peak); headParts.push(peak);
    }
    // 'bald' = 只有球頭 + 臉
  }

  // ─── 武器 ─────────────────────────────────────────────────
  const weaponParts = [];
  let _shieldGroup = null;

  function buildWeapon(gameWeapon) {
    clearGroup(weaponParts);
    if (_shieldGroup) { armL.hand.remove(_shieldGroup); _shieldGroup = null; }

    const steel = vmat(0xd2dae6, 0.35, 0.6), steelD = vmat(0x9aa4b4, 0.4, 0.5);
    const wood = vmat(0x6b4a2a), gold = vmat(0xd8b040, 0.5, 0.5);

    function attachR(fn, rot) {
      const g = new THREE.Group();
      fn(g);
      if (rot) g.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
      armR.hand.add(g);
      weaponParts.push(g);
    }

    if (gameWeapon === 'sword_shield' || gameWeapon === 'sword') {
      attachR(g => {
        voxel(g, 0.12, 0.22, 0.12, wood,  0,  0.02, 0);
        voxel(g, 0.16, 0.1,  0.16, gold,  0,  0.14, 0);
        voxel(g, 0.34, 0.12, 0.12, gold,  0, -0.1,  0);
        voxel(g, 0.1,  0.7,  0.1,  steel, 0, -0.5,  0);
      }, [0.9 - Math.PI, 0, 0.35]); // blade在-Y，需 rotX = HTML值(0.9) - π 才能朝前

      // 盾牌掛在左手
      if (gameWeapon === 'sword_shield') {
        _shieldGroup = new THREE.Group();
        voxel(_shieldGroup, 0.08, 0.60, 0.52, vmat(0x8b3a3a), 0, 0, 0);
        voxel(_shieldGroup, 0.06, 0.44, 0.38, vmat(0xaa5555, 0.7, 0.2), 0.05, 0, 0);
        _shieldGroup.rotation.set(0.3, 0, -0.2);
        _shieldGroup.position.set(0, -0.3, 0.2);
        armL.hand.add(_shieldGroup);
      }
    } else if (gameWeapon === 'greatsword') {
      attachR(g => {
        voxel(g, 0.14, 0.3,  0.14, wood,   0,  0.04, 0);
        voxel(g, 0.54, 0.14, 0.14, gold,   0, -0.14, 0);
        voxel(g, 0.12, 0.36, 0.12, steelD, 0, -0.4,  0);
        voxel(g, 0.18, 1.1,  0.07, steel,  0, -0.92, 0);
      }, [0.7 - Math.PI, 0, 0.35]); // blade在-Y，rotX = HTML值(0.7) - π
    } else if (gameWeapon === 'polearm' || gameWeapon === 'spear') {
      attachR(g => {
        voxel(g, 0.08, 2.2, 0.08, wood,  0, -0.85, 0);
        voxel(g, 0.16, 0.16, 0.16, steel, 0, -2.02, 0);
        for (let i = 0; i < 4; i++) voxel(g, 0.08, 0.16, 0.08, steelD, 0, -2.16 - i * 0.06, 0);
      }, [1.9 - Math.PI, 0, 0.12]); // 槍頭在-Y，rotX = HTML值(1.9) - π
    } else if (gameWeapon === 'staff') {
      attachR(g => {
        voxel(g, 0.08, 1.5, 0.08, wood, 0, -0.55, 0);
        const orbMat = new THREE.MeshStandardMaterial({ color: 0x8a5fff, emissive: new THREE.Color(0x6a3fcc), emissiveIntensity: 0.8, roughness: 0.3 });
        const orb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), orbMat);
        orb.position.set(0, -1.4, 0); g.add(orb);
      }, [1.0 - Math.PI, 0, 0.25]); // orb在-Y，rotX = HTML值(1.0) - π
    }
    // 'none' → no weapon
  }

  // ─── 動畫輔助 ─────────────────────────────────────────────
  function J(grp, x, y, z) { grp.rotation.set(x || 0, y || 0, z || 0); }

  function animateIdle(t) {
    const b = Math.sin(t * 1.6);
    pelvis.position.y = 1.0 + b * 0.02;
    pelvis.rotation.y = 0;
    J(armL.shoulder, 0.06 + b * 0.04, 0,  0.08);
    J(armL.elbow, -0.25, 0, 0);
    J(armR.shoulder, 0.06 - b * 0.04, 0, -0.08);
    J(armR.elbow, -0.25, 0, 0);
    [legL, legR].forEach(l => { J(l.hip, 0, 0, 0); J(l.knee, 0, 0, 0); });
    J(torsoAnchor, 0, 0, 0);
  }

  /**
   * 方向性步伐（FEZ：面向準心固定，腿沿移動方向擺）
   * @param {number} t       行走累積時間
   * @param {number} fwd     局部前後分量（+1 前進 / -1 後退 / 0 純橫移）
   * @param {number} side    局部左右分量（+1 右 / -1 左）
   * @param {boolean} sprint 衝刺：步頻更快、前傾、擺幅更大
   * @param {number} stanceY 武器戰鬥站姿的軀幹扭轉（行走時保留 60%）
   * 不傳參數時行為與舊版相同（enemy.js 直接呼叫 animateWalk(t)）。
   */
  function animateWalk(t, fwd = 1, side = 0, sprint = false, stanceY = 0) {
    // 步頻對齊移動速度：走路 5m/s ≈ 2.5 步/秒、衝刺 7.5m/s ≈ 3.5 步/秒
    const freq = sprint ? 11 : 8;
    const s = Math.sin(t * freq), c = Math.cos(t * freq);
    const bob = sprint ? 0.05 : 0.035;
    const mag = Math.min(1, Math.abs(fwd) + Math.abs(side) * 0.8); // 步伐強度

    pelvis.position.y = 1.0 + Math.abs(c) * bob;
    pelvis.rotation.y = 0;   // 不扭骨盆：FEZ 面向準心固定，扭了會像瞄不準

    // 每條腿有自己的相位（pL=+s / pR=−s），沿實際移動方向（fwd, side）擺動
    const ampF = (sprint ? 0.6 : 0.46) * fwd;
    const ampS = 0.3 * side;
    const pL = s, pR = -s;
    J(legL.hip, pL * ampF, 0, pL * ampS);
    J(legR.hip, pR * ampF, 0, pR * ampS);
    // 膝蓋：該腿後擺時抬起（與相位掛鉤，前進/後退/橫移通用）
    const lift = (sprint ? 1.0 : 0.8) * mag;
    J(legL.knee, Math.max(0, -pL) * lift, 0, 0);
    J(legR.knee, Math.max(0, -pR) * lift, 0, 0);

    // 手臂反向擺（只跟前後分量；橫移時手臂幾乎不擺）
    const armAmp = (sprint ? 0.55 : 0.38) * Math.abs(fwd) + 0.08;
    J(armL.shoulder, -s * armAmp * Math.sign(fwd || 1), 0,  0.06);
    J(armL.elbow, sprint ? -0.8 : -0.5, 0, 0);
    J(armR.shoulder,  s * armAmp * Math.sign(fwd || 1), 0, -0.06);
    J(armR.elbow, sprint ? -0.8 : -0.5, 0, 0);

    // 軀幹：衝刺前傾、保留武器站姿扭轉、橫移極輕側傾
    torsoAnchor.rotation.x = sprint ? 0.2 : 0.05 * Math.abs(fwd);
    torsoAnchor.rotation.y = stanceY * 0.6;
    torsoAnchor.rotation.z = -side * 0.04;
  }

  /**
   * 跳躍姿勢：上升收腿（tuck）、下降伸腿準備落地
   * @param {number} vy 垂直速度（>0 上升 / <0 下降）
   */
  function animateJump(vy) {
    const rise = Math.max(0, Math.min(1, vy / 8));     // 上升程度
    const fall = Math.max(0, Math.min(1, -vy / 10));   // 下降程度
    const tuck = 0.3 + rise * 0.8;                      // 收腿量
    pelvis.position.y = 1.0;
    pelvis.rotation.y = 0;
    J(legL.hip, -tuck, 0,  0.08); J(legL.knee, tuck * 1.3, 0, 0);
    J(legR.hip, -tuck * 0.75, 0, -0.08); J(legR.knee, tuck * 1.1, 0, 0);
    // 手臂：上升上揚、下降張開保持平衡
    J(armL.shoulder, -0.5 - rise * 0.5, 0,  0.35 + fall * 0.4);
    J(armL.elbow, -0.4, 0, 0);
    J(armR.shoulder, -0.5 - rise * 0.5, 0, -0.35 - fall * 0.4);
    J(armR.elbow, -0.4, 0, 0);
    torsoAnchor.rotation.x = 0.12 + fall * 0.15;       // 下降時微前傾盯落點
    torsoAnchor.rotation.z = 0;
  }

  /**
   * 側閃姿勢：往位移方向壓低側傾，外側腿蹬、內側腿屈
   * @param {number} k   進度 0→1
   * @param {number} dir 相對面向的左右（+1 右 / -1 左）
   */
  function animateSidestep(k, dir = 1) {
    const w = Math.sin(Math.min(k, 1) * Math.PI);      // 0→1→0 強度
    pelvis.position.y = 1.0 - 0.18 * w;
    pelvis.rotation.y = 0;
    torsoAnchor.rotation.x = 0.1 * w;
    torsoAnchor.rotation.z = -dir * 0.32 * w;          // 朝位移方向傾
    J(legL.hip, 0, 0,  dir * 0.45 * w); J(legL.knee, (dir < 0 ? 0.7 : 0.25) * w, 0, 0);
    J(legR.hip, 0, 0,  dir * 0.45 * w); J(legR.knee, (dir > 0 ? 0.7 : 0.25) * w, 0, 0);
    J(armL.shoulder, -0.3 * w, 0,  0.3 * w); J(armL.elbow, -0.4, 0, 0);
    J(armR.shoulder, -0.3 * w, 0, -0.3 * w); J(armR.elbow, -0.4, 0, 0);
  }

  // 坐下/採礦姿勢：臀部貼地，腿前伸，手臂前托（帶輕微搖晃）
  function animateSit(t) {
    const b = Math.sin(t * 3.5) * 0.07;   // 採礦搖擺幅度
    pelvis.position.y = 0.2;
    J(legL.hip, -1.62, 0,  0.12); J(legL.knee, 0.12, 0, 0);
    J(legR.hip, -1.62, 0, -0.12); J(legR.knee, 0.12, 0, 0);
    J(armL.shoulder, 0.5 + b, 0,  0.1); J(armL.elbow, -0.2, 0, 0);
    J(armR.shoulder, 0.5 - b, 0, -0.1); J(armR.elbow, -0.2, 0, 0);
    J(torsoAnchor, b * 0.4, 0, 0);
  }

  // ─── 工具：取得所有 Mesh 材質 ────────────────────────────
  function getAllMeshes() {
    const arr = [];
    group.traverse(o => { if (o.isMesh) arr.push(o); });
    return arr;
  }

  function setEmissive(hexColor, intensity) {
    group.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive) {
        o.material.emissive.setHex(hexColor);
        o.material.emissiveIntensity = intensity;
      }
    });
  }

  // ─── 初始建構 ─────────────────────────────────────────────
  buildHead(headId);
  buildUpper(upperId);
  buildLower(lowerId);
  buildWeapon(weaponId);

  return {
    group,
    pelvis, torsoAnchor, headAnchor,
    armL, armR, legL, legR,
    buildHead, buildUpper, buildLower, buildWeapon,
    animateIdle, animateWalk, animateSit, animateJump, animateSidestep,
    getAllMeshes, setEmissive,
    // Expose elbow joints for main.js bend-elbow calculations
    elbowR: armR.elbow, elbowL: armL.elbow,
  };
}
