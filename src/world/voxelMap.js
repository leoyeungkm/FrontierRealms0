import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CRYSTAL_POSITIONS } from '../constants.js';
import { loadBakedGLB, spawnInstancedModels, makeStylizedTree } from './models.js';
import { buildModelCastles } from './castle.js';

// ─── World Config ─────────────────────────────────────────────
// Grid: 128×128, visual offset: (x-64, y, z-64)
// 高度基準：h=4 為 lane/基地平面（visual y = h - 4 = 0）
const W = 128, D = 128, HX = 64, HZ = 64;
const VERT_OFFSET = 3.5;     // 體素建築 block 視覺偏移（城堡/水晶簇仍是體素）
const SEA_LEVEL = 3;         // 水面 grid 高度（visual y = -1）

// Base grid coords → visual: BASE_A=(0,+50), BASE_B=(0,-50)
const BASE_A = [64, 114];
const BASE_B = [64, 14];
const LANE_MID_L = [30, 64]; // 左路中點 visual(-34,0)
const LANE_MID_R = [98, 64]; // 右路中點 visual(+34,0)

// ─── Block Types（體素建築用：城堡 / 水晶簇）──────────────────
const BLOCKS = {
  stone:   { color: 0x828890, rough: 0.90, pattern: 'stone'   },
  wood:    { color: 0x6b4a2a, rough: 0.90, pattern: 'wood'    },
  crystal: { color: 0x7ad6c8, rough: 0.20, pattern: 'crystal', emissive: 0x2a8f7a, emissiveInt: 0.5 },
  brick:   { color: 0x9aa0aa, rough: 0.85, pattern: 'stone'   },
  blue:    { color: 0x4a6fae, rough: 0.80, pattern: 'stone'   },
  red:     { color: 0xae4a4a, rough: 0.80, pattern: 'stone'   },
};

// ─── Pixel Textures ───────────────────────────────────────────
function makeTex(b) {
  const N = 16, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const base = new THREE.Color(b.color);
  const rnd = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return n - Math.floor(n); };
  const px = (x, y, col) => {
    g.fillStyle = `rgb(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0})`;
    g.fillRect(x, y, 1, 1);
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
    px(x, y, base.clone().multiplyScalar(0.86 + rnd(x, y) * 0.22));
  const dk = base.clone().multiplyScalar(0.74), lt = base.clone().multiplyScalar(1.16);
  if (b.pattern === 'stone') {
    for (let i = 0; i < 4; i++) {
      let x = rnd(i, 11) * N | 0, y = rnd(i, 12) * N | 0;
      for (let s = 0; s < 7; s++) { px(x, y, dk); x = (x + (rnd(i + s, 13) > 0.5 ? 1 : -1) + N) % N; y = (y + (rnd(i + s, 14) > 0.6 ? 1 : 0)) % N; }
    }
  } else if (b.pattern === 'wood') {
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if ((x % 5) === 0 || (x % 5) === 1) px(x, y, dk);
  } else if (b.pattern === 'crystal') {
    for (let i = 0; i < 20; i++) px(rnd(i, 3) * N | 0, rnd(i, 4) * N | 0, lt);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}

const _mats = {};
function getMat(id) {
  if (_mats[id]) return _mats[id];
  const b = BLOCKS[id];
  _mats[id] = new THREE.MeshLambertMaterial({
    map: makeTex(b),
    color: 0xffffff,
    transparent: b.transparent || false,
    opacity: b.opacity ?? 1,
    emissive: b.emissive != null ? new THREE.Color(b.emissive) : new THREE.Color(0),
    emissiveIntensity: b.emissiveInt ?? 0,
  });
  return _mats[id];
}

// ─── Sparse World Storage（只存體素建築）─────────────────────
const WORLD = new Map();
const key = (x, y, z) => `${x},${y},${z}`;
function setBlock(x, y, z, id) { if (id) WORLD.set(key(x, y, z), id); else WORLD.delete(key(x, y, z)); }
function getBlock(x, y, z)    { return WORLD.get(key(x, y, z)); }

// ─── Distance Fields ──────────────────────────────────────────
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let t = L2 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
function laneDist(x, z) {
  return Math.min(
    distSeg(x, z, BASE_A[0], BASE_A[1], BASE_B[0], BASE_B[1]),               // 中路
    distSeg(x, z, BASE_A[0], BASE_A[1], LANE_MID_L[0], LANE_MID_L[1]),       // 左路上半
    distSeg(x, z, LANE_MID_L[0], LANE_MID_L[1], BASE_B[0], BASE_B[1]),       // 左路下半
    distSeg(x, z, BASE_A[0], BASE_A[1], LANE_MID_R[0], LANE_MID_R[1]),       // 右路上半
    distSeg(x, z, LANE_MID_R[0], LANE_MID_R[1], BASE_B[0], BASE_B[1])        // 右路下半
  );
}
function baseDist(x, z) {
  return Math.min(Math.hypot(x - BASE_A[0], z - BASE_A[1]), Math.hypot(x - BASE_B[0], z - BASE_B[1]));
}
function crystalDist(x, z) {
  let d2 = 1e18;
  for (const [wx, wz] of CRYSTAL_POSITIONS) {
    const dx = x - (wx + HX), dz = z - (wz + HZ);
    const dd = dx * dx + dz * dz;
    if (dd < d2) d2 = dd;
  }
  return Math.sqrt(d2);
}

// ─── Noise ────────────────────────────────────────────────────
function hash(ix, iz) { const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453; return n - Math.floor(n); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, z) {
  let f = 0, amp = 1, frq = 1, sum = 0;
  for (let o = 0; o < 5; o++) { f += vnoise(x * frq * 0.05, z * frq * 0.05) * amp; sum += amp; amp *= 0.5; frq *= 2.1; }
  return f / sum;
}
const _ss = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

// ─── 平滑地形高度（FEZ 風格：連續起伏，不量化）─────────────────
function smoothHeightAt(x, z) {
  const ld = laneDist(x, z), bd = baseDist(x, z), n = fbm(x, z);
  const mountain = vnoise(x * 0.018 + 10, z * 0.018 + 5);
  let land = 1 + Math.pow(n, 1.6) * 16;
  const m = Math.max(0, mountain - 0.5) * 2;
  land += Math.pow(m, 1.8) * 28;
  if (mountain < 0.35) land -= (0.35 - mountain) * 12;   // 低地（湖泊）
  land += Math.max(0, ld - 12) * 0.3 * (0.5 + vnoise(x * 0.04, z * 0.04));
  let h = land;
  // 路面整平（smoothstep 平滑過渡）
  if (ld < 10) h = 4 + (land - 4) * _ss((ld - 4) / 6);
  // 基地整平
  if (bd < 13) h = 4 + (h - 4) * _ss((bd - 8) / 5);
  // 水晶礦周圍整平（採礦空地）
  const cd = crystalDist(x, z);
  if (cd < 6.5) h = 4 + (h - 4) * _ss((cd - 2.8) / 3.7);
  // 島形：離地圖中心越遠越低，邊緣沉入海面下 → 圓形島輪廓，消除 128×128 方形邊界
  const dx = x - W / 2, dz = z - D / 2;
  const edge = _ss((Math.sqrt(dx * dx + dz * dz) - 58) / 8);   // 半徑 58 內為島、66 外沉海（城堡 z=±50、側路 x=±34 都在島內）
  h = h * (1 - edge) - 9 * edge;
  return Math.max(-7, h);
}

// 高度網格快取：視覺 mesh / 物理 trimesh / getTerrainHeight 共用同一份資料
let _grid = null;
function ensureGrid() {
  if (_grid) return;
  _grid = new Float32Array(W * D);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) _grid[z * W + x] = smoothHeightAt(x, z);
}
function gridH(x, z) {
  ensureGrid();
  return _grid[Math.min(D - 1, Math.max(0, z)) * W + Math.min(W - 1, Math.max(0, x))];
}
// 體素建築擺放用的整數高度
function heightAt(x, z) { return Math.max(1, Math.round(gridH(Math.round(x), Math.round(z)))); }

// ─── Exported Heights (for entity spawning / 跟隨地形) ────────
/** 返回遊戲世界座標 (wx, wz) 的地表 visual Y（雙線性插值，與地形 mesh 一致） */
export function getTerrainHeight(wx, wz) {
  ensureGrid();
  const fx = Math.min(W - 1.001, Math.max(0, wx + HX));
  const fz = Math.min(D - 1.001, Math.max(0, wz + HZ));
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const tx = fx - x0, tz = fz - z0;
  const i = z0 * W + x0;
  const h = _grid[i] * (1 - tx) * (1 - tz) + _grid[i + 1] * tx * (1 - tz)
          + _grid[i + W] * (1 - tx) * tz   + _grid[i + W + 1] * tx * tz;
  return h - 4;
}

// ─── Terrain Trimesh（視覺與物理共用同一網格）──────────────────
export function getTerrainTrimesh() {
  ensureGrid();
  const verts = new Float32Array(W * D * 3);
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const i = (z * W + x) * 3;
      verts[i]     = x - HX;
      verts[i + 1] = _grid[z * W + x] - 4;
      verts[i + 2] = z - HZ;
    }
  }
  const idxs = new Uint32Array((W - 1) * (D - 1) * 6);
  let ii = 0;
  for (let z = 0; z < D - 1; z++) {
    for (let x = 0; x < W - 1; x++) {
      const a = z * W + x, b = a + 1, c = a + W, d = c + 1;
      idxs[ii++] = a; idxs[ii++] = c; idxs[ii++] = b;
      idxs[ii++] = b; idxs[ii++] = c; idxs[ii++] = d;
    }
  }
  return { vertices: verts, indices: idxs };
}

/** 地形物理：單一 trimesh collider（與視覺 mesh 完全相同的三角形） */
export function createTerrainColliders(RAPIER, physics) {
  const { vertices, indices } = getTerrainTrimesh();
  physics.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices));
}

// ─── 地形視覺 Mesh（頂點色：草地/沙路/岩石/基地鋪面）──────────
const _cGrass = new THREE.Color(0x6cab4f), _cGrassD = new THREE.Color(0x4f8c36);   // FEZ 橄欖綠（提亮半檔）
const _cDirt  = new THREE.Color(0x8a6a42), _cRock  = new THREE.Color(0x8a9098);
const _cRockD = new THREE.Color(0x6e747c), _cSand  = new THREE.Color(0xd9c78e);
const _cPave  = new THREE.Color(0x9aa0a8), _cSnow  = new THREE.Color(0xe8edf2);
const _tmpC   = new THREE.Color();

function _vertexColor(x, z, out) {
  ensureGrid();
  const h = gridH(x, z);
  // 坡度（相鄰格高差）
  const slope = Math.max(
    Math.abs(gridH(x + 1, z) - gridH(x - 1, z)) * 0.5,
    Math.abs(gridH(x, z + 1) - gridH(x, z - 1)) * 0.5
  );
  // 基底：草地（兩種綠色雜訊混合）
  out.copy(_cGrass).lerp(_cGrassD, vnoise(x * 0.35, z * 0.35));
  // 高山 → 岩石 → 雪頂
  if (h > 12) out.lerp(_tmpC.copy(_cRock).lerp(_cRockD, vnoise(x * 0.5, z * 0.5)), _ss((h - 12) / 5));
  if (h > 24) out.lerp(_cSnow, _ss((h - 24) / 5));
  // 陡坡 → 岩石/泥土
  if (slope > 0.45) out.lerp(h > 9 ? _cRockD : _cDirt, _ss((slope - 0.45) / 0.5) * 0.85);
  // 低地 → 沙灘
  if (h < 3.6) out.lerp(_cSand, _ss((3.6 - h) / 1.2));
  // 路面：沙色小徑
  const ld = laneDist(x, z);
  if (ld < 6) out.lerp(_cSand, _ss((6 - ld) / 2.5) * 0.9);
  // 基地：石板鋪面
  const bd = baseDist(x, z);
  if (bd < 11) out.lerp(_cPave, _ss((11 - bd) / 3) * 0.95);
  // 水晶空地：淡土色
  const cd = crystalDist(x, z);
  if (cd < 5) out.lerp(_cDirt, _ss((5 - cd) / 2.5) * 0.4);
  // 細碎雜訊調光（讓大面同色不死板）
  out.multiplyScalar(0.93 + hash(x, z) * 0.14);
}

// ─── 程序化細節貼圖（無縫 wrapped value noise，含 mipmap + 各向異性）──
// 地形「高清化」核心：頂點色只有 128×128 解析度（近看必糊），
// 這張 512 tiled 貼圖補回高頻明暗 + 假凹凸 + 粗糙度變化。
function _makeDetailTexture() {
  const S = 512;
  const lattice = (n) => {
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = Math.random();
    return (x, y) => {   // wrapped lattice → 四方連續無縫
      const xi = Math.floor(x) % n, yi = Math.floor(y) % n;
      const xf = x - Math.floor(x), yf = y - Math.floor(y);
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const x1 = (xi + 1) % n, y1 = (yi + 1) % n;
      const a = g[yi * n + xi], b = g[yi * n + x1], c = g[y1 * n + xi], d = g[y1 * n + x1];
      return a + (b - a) * u + (c - a) * v + (d - b - c + a) * u * v;
    };
  };
  const n1 = lattice(16), n2 = lattice(48), n3 = lattice(128);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = x / S, fy = y / S;
      let v = n1(fx * 16, fy * 16) * 0.42 + n2(fx * 48, fy * 48) * 0.34 + n3(fx * 128, fy * 128) * 0.24;
      v += (Math.random() - 0.5) * 0.09;   // 細顆粒
      const b = Math.max(0, Math.min(255, v * 255 | 0));
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = b; data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;   // 斜視角（第三人稱常態）地面不糊的關鍵
  tex.needsUpdate = true;
  return tex;
}

function buildTerrainMesh(scene) {
  const { vertices, indices } = getTerrainTrimesh();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  const colors = new Float32Array(W * D * 3);
  const out = new THREE.Color();
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      _vertexColor(x, z, out);
      const i = (z * W + x) * 3;
      colors[i] = out.r; colors[i + 1] = out.g; colors[i + 2] = out.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // 逐像素細節著色：頂點色只給大區域（草/路/岩），fragment 內疊多尺度噪聲
  // 色斑 + 坡度岩壁色，近看不再是一片死色
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: _makeDetailTexture() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vWNor = normalize(mat3(modelMatrix) * normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNor;
        uniform sampler2D uDetail;
        float thash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tnoise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(thash(i), thash(i + vec2(1,0)), u.x),
                     mix(thash(i + vec2(0,1)), thash(i + vec2(1,1)), u.x), u.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // 原神式大色塊：冷綠 ↔ 暖黃綠「色相」漸變（不是明度噪聲），
          // 只染綠色像素（草地），路面/石板/沙灘不受影響
          float macro  = tnoise(vWPos.xz * 0.045);
          float mid    = tnoise(vWPos.xz * 0.5);
          float grassy = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * 4.0, 0.0, 1.0);
          vec3 warm = diffuseColor.rgb * vec3(1.05, 1.02, 0.74);   // FEZ：暖染收斂（黃=亮=白）
          diffuseColor.rgb = mix(diffuseColor.rgb, warm,
                                 smoothstep(0.32, 0.78, macro) * 0.4 * grassy);
          // 高頻細節改用 tiled 貼圖（有 mipmap：近看銳利、遠看自動柔化不閃爍）
          float dtl  = texture2D(uDetail, vWPos.xz * 0.22).r;
          float dtl2 = texture2D(uDetail, vWPos.xz * 0.05).r;
          diffuseColor.rgb *= 0.80 + dtl * 0.28 + dtl2 * 0.12 + mid * 0.06;
          // 逐像素坡度 → 岩壁色（比頂點級精細很多）
          float sl = 1.0 - clamp(vWNor.y, 0.0, 1.0);
          vec3 cliff = vec3(0.46, 0.44, 0.45) * (0.72 + mid * 0.3 + dtl * 0.22);
          diffuseColor.rgb = mix(diffuseColor.rgb, cliff, smoothstep(0.42, 0.72, sl));
          // 谷地輕微冷色調、高處輕微暖亮（假環境光遮蔽/高度霧染）
          diffuseColor.rgb *= mix(vec3(0.92, 0.96, 1.02), vec3(1.04, 1.02, 0.97),
                                  smoothstep(-1.0, 14.0, vWPos.y));
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // 細節假凹凸：取樣高度差 → 擾動法線（陽光下地面有立體顆粒，UE 質感關鍵）
          vec2 duv = vWPos.xz * 0.22;
          float e  = 0.012;
          float hC = texture2D(uDetail, duv).r;
          float hX = texture2D(uDetail, duv + vec2(e, 0.0)).r;
          float hZ = texture2D(uDetail, duv + vec2(0.0, e)).r;
          vec3 wgrad = vec3(hC - hX, 0.0, hC - hZ) * 2.4;
          vec3 vgrad = (viewMatrix * vec4(wgrad, 0.0)).xyz;
          float fade = 1.0 - smoothstep(22.0, 65.0, length(vViewPosition));  // 遠處不擾動防高光噪
          normal = normalize(normal + vgrad * fade);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // 粗糙度微變化：噪聲低處略帶光澤 → 陽光下草地有微妙的反光層次
        roughnessFactor = clamp(roughnessFactor - texture2D(uDetail, vWPos.xz * 0.05).r * 0.16, 0.6, 1.0);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;       // 山脈投影到山谷，增加立體感
  scene.add(mesh);
}

// ─── 水面（單一透明平面，取代水體素）─────────────────────────
// ─── 動態水面 shader ──────────────────────────────────────────
// 取樣地形高度貼圖算水深：淺水碧綠→深水湛藍、岸線動態泡沫、
// 流動波紋、菲涅爾反射天空色、太陽高光
const _waterTime = { value: 0 };

function _heightDataTexture() {
  ensureGrid();
  // half-float：WebGL2 核心保證可線性過濾（float 需要額外擴展，部分 GPU 會失效）
  const half = new Uint16Array(W * D);
  for (let i = 0; i < _grid.length; i++) half[i] = THREE.DataUtils.toHalfFloat(_grid[i]);
  const tex = new THREE.DataTexture(half, W, D, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function buildWater(scene) {
  const waterY = SEA_LEVEL - 4 + 0.05;   // visual y ≈ -0.95
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: {
      ...THREE.UniformsLib.fog,
      uTime:    _waterTime,
      uHeight:  { value: _heightDataTexture() },
      uWaterY:  { value: waterY },
      uSunDir:  { value: new THREE.Vector3(40, 80, 30).normalize() },
      uSky:     { value: new THREE.Color(0xcfe8f5) },
      uShallow: { value: new THREE.Color(0x59c2c0) },
      uDeep:    { value: new THREE.Color(0x1d5d9e) },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform sampler2D uHeight;
      uniform float uWaterY;
      uniform vec3 uSunDir, uSky, uShallow, uDeep;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float whash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wnoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(whash(i), whash(i + vec2(1,0)), u.x),
                   mix(whash(i + vec2(0,1)), whash(i + vec2(1,1)), u.x), u.y);
      }
      void main() {
        // 地形高度 → 水深
        vec2 uv = (vWorld.xz + 64.5) / 128.0;
        float ground = texture2D(uHeight, uv).r - 4.0;
        float depth = uWaterY - ground;
        if (depth < -0.2) discard;             // 陸地下方不畫（省 overdraw）

        // 流動波紋（兩層反向滾動噪聲）
        float w1 = wnoise(vWorld.xz * 0.38 + vec2(uTime * 0.21,  uTime * 0.13));
        float w2 = wnoise(vWorld.xz * 0.93 - vec2(uTime * 0.16, -uTime * 0.10));
        float wave = w1 * 0.6 + w2 * 0.4;

        // 深淺漸層
        vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 3.2, depth));
        col += (wave - 0.5) * 0.075;

        // 岸線動態泡沫（不規則邊緣 + 緩慢呼吸）
        float edgeWob = (wnoise(vWorld.xz * 1.1 + uTime * 0.18) - 0.5) * 0.35;
        float foam = smoothstep(0.5, 0.06, depth + edgeWob);
        foam *= 0.65 + 0.35 * sin(uTime * 1.6 + vWorld.x * 0.7 + vWorld.z * 0.9 + wave * 6.0);
        col = mix(col, vec3(0.96, 0.99, 1.0), clamp(foam, 0.0, 1.0) * 0.85);

        // 菲涅爾：視角越平越反射天空色
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.6);
        col = mix(col, uSky, fres * 0.55);

        // 太陽高光（波紋擾動法線）
        vec3 N = normalize(vec3((w1 - 0.5) * 0.35, 1.0, (w2 - 0.5) * 0.35));
        vec3 H = normalize(V + uSunDir);
        col += vec3(1.0, 0.95, 0.82) * pow(max(dot(N, H), 0.0), 160.0) * 0.9;

        float alpha = mix(0.62, 0.9, smoothstep(0.0, 3.0, depth)) + foam * 0.1;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W + 60, D + 60), mat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = waterY;
  scene.add(water);

  // 遠景外海：一大片延伸到天際的海，蓋掉地圖邊緣外的虛空（受霧 → 遠處融入天空色，看不到硬邊界）
  const horizon = new THREE.Mesh(
    new THREE.CircleGeometry(700, 64),
    new THREE.MeshBasicMaterial({ color: 0x3a6589, fog: true })
  );
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.y = waterY - 0.6;   // 略低於精緻水面，避免 z-fighting
  scene.add(horizon);
}

/** 每幀呼叫：推進水面 / 草地搖曳時間；playerPos=壓彎中心、camPos=billboard 視點 */
const _grassPlayer = { value: new THREE.Vector3() };
const _grassCam    = { value: new THREE.Vector3() };
export function updateWorldAnim(dt, playerPos, camPos) {
  _waterTime.value += dt;
  if (playerPos) _grassPlayer.value.set(playerPos.x, playerPos.y, playerPos.z);
  if (camPos)    _grassCam.value.copy(camPos);
}

// ─── 低多邊形樹木 / 岩石（InstancedMesh）─────────────────────
const _dummyObj = new THREE.Object3D();

// 裝飾物位置與目前使用的 mesh（程序化 → GLB 模型熱替換用）
let _treeSpots = [], _rockSpots = [];
const _procMeshes = { trees: [], rocks: [] };

function plantTrees(scene) {
  ensureGrid();
  const spots = [];
  for (let tr = 0; tr < 2200 && spots.length < 170; tr++) {
    const x = 4 + (Math.random() * (W - 8) | 0);
    const z = 4 + (Math.random() * (D - 8) | 0);
    const h = gridH(x, z);
    const slope = Math.abs(gridH(x + 1, z) - gridH(x - 1, z)) * 0.5
                + Math.abs(gridH(x, z + 1) - gridH(x, z - 1)) * 0.5;
    if (laneDist(x, z) > 7 && baseDist(x, z) > 11 && crystalDist(x, z) > 5 &&
        h > 3.6 && h < 17 && slope < 0.55) {
      spots.push([x - HX + (Math.random() - 0.5) * 0.8, h - 4, z - HZ + (Math.random() - 0.5) * 0.8]);
    }
  }
  if (!spots.length) return;

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.3, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  // 雙層樹冠（合併成單一幾何，仍是一個 InstancedMesh）：原點在樹冠底部
  const cone1 = new THREE.ConeGeometry(1.3, 2.2, 6);  cone1.translate(0, 1.1, 0);
  const cone2 = new THREE.ConeGeometry(0.85, 1.7, 6); cone2.translate(0, 2.05, 0);
  const leafGeo = mergeGeometries([cone1, cone2]);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length);
  const leafC = new THREE.Color();

  spots.forEach(([x, y, z], i) => {
    const s = 0.8 + Math.random() * 0.7;
    const rot = Math.random() * Math.PI * 2;
    _dummyObj.position.set(x, y + 0.6 * s, z);
    _dummyObj.rotation.set(0, rot, 0);
    _dummyObj.scale.setScalar(s);
    _dummyObj.updateMatrix();
    trunks.setMatrixAt(i, _dummyObj.matrix);
    _dummyObj.position.set(x, y + 0.95 * s, z);
    _dummyObj.updateMatrix();
    leaves.setMatrixAt(i, _dummyObj.matrix);
    // 樹冠色相微偏移（偏黃綠～偏藍綠），畫面更有層次
    leafC.setHSL(0.29 + Math.random() * 0.07, 0.5, 0.3 + Math.random() * 0.12);
    leaves.setColorAt(i, leafC);
  });
  trunks.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = leaves.receiveShadow = true;
  scene.add(trunks); scene.add(leaves);
  _treeSpots = spots;
  _procMeshes.trees = [trunks, leaves];
}

// ─── 風吹草地（BotW / 原神式樣式化草叢）──────────────────────
// 關鍵：草根色 = 取樣地形著色函數（與地面無縫融合）、尖端亮黃綠漸層、
// 彎刀形葉片、簇生分布、大尺度雲影掃過草原。
// InstancedMesh 建滿上限，畫質設定用 .count 調密度（零重建成本）。
let _grassChunks = [], _grassMax = 0, _grassTarget = Infinity;
let _flowerMesh = null, _flowerMax = 0;
const _dryGrassC = new THREE.Color(0xb6a35e);

function _applyGrassTarget() {
  const ratio = Math.min(1, _grassTarget / Math.max(1, _grassMax));
  for (const c of _grassChunks) c.mesh.count = Math.max(0, Math.round(c.max * ratio));
}

/** 畫質設定呼叫：調整可見草株數（按 chunk 等比；花朵連動） */
export function setGrassCount(n) {
  _grassTarget = n;
  _applyGrassTarget();
  if (_flowerMesh) _flowerMesh.count = Math.min(_flowerMax, Math.round(n / 14));
}

function buildGrass(scene) {
  ensureGrid();
  const GRASS_CAP = 34000;
  // 草叢幾何（Codrops fluffy 預算策略：葉精簡 → 換密度）：6 片兩段弧葉，
  // 每葉 5 頂點（底2 / 55%2 / 尖1）；fluffy 感靠「短寬葉 + 高密度 + 陰影染色」。
  // attributes：aH 高度權重、aRoot 葉根（billboard 旋轉軸）、aAng 葉片方位角。
  // 注意：instance「不做隨機 yaw」——風向/billboard 都需要世界空間一致。
  const pos = [], nor = [], aHArr = [], rootArr = [], angArr = [], idx = [];
  const BLADES = 6;
  for (let b = 0; b < BLADES; b++) {
    const a  = Math.random() * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const w    = 0.042 + Math.random() * 0.022;        // 半寬（略寬 → 蓬鬆）
    const h    = 0.36 + Math.random() * 0.24;          // 略短 → fluffy 草毯
    const off  = 0.04 + Math.random() * 0.12;          // 自叢心外移
    const lean = 0.12 + Math.random() * 0.16;          // 弧形外彎總量
    const bx = ca * off, bz = sa * off;
    const base = pos.length / 3;
    pos.push(
      bx + sa * w,                          0,        bz - ca * w,
      bx - sa * w,                          0,        bz + ca * w,
      bx + sa * w * 0.6 + ca * lean * 0.30, h * 0.55, bz - ca * w * 0.6 + sa * lean * 0.30,
      bx - sa * w * 0.6 + ca * lean * 0.30, h * 0.55, bz + ca * w * 0.6 + sa * lean * 0.30,
      bx + ca * lean,                       h,        bz + sa * lean,
    );
    aHArr.push(0, 0, 0.55, 0.55, 1);
    for (let k = 0; k < 5; k++) {
      nor.push(0, 1, 0);                               // 法線朝上：受光均勻柔和
      rootArr.push(bx, bz);
      angArr.push(a);
    }
    idx.push(
      base, base + 1, base + 2,  base + 1, base + 3, base + 2,
      base + 2, base + 3, base + 4,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aH', new THREE.Float32BufferAttribute(aHArr, 1));
  geo.setAttribute('aRoot', new THREE.Float32BufferAttribute(rootArr, 2));
  geo.setAttribute('aAng', new THREE.Float32BufferAttribute(angArr, 1));
  geo.setIndex(idx);

  // 簇生分布 + 噪聲禿斑：全地圖覆蓋（水際線～雪線、山坡也長），
  // 只避開路面/基地鋪面/水晶空地與陡峭岩壁
  const spots = [];
  for (let tr = 0; tr < 22000 && spots.length < GRASS_CAP; tr++) {
    const cx = 3 + Math.random() * (W - 6);
    const cz = 3 + Math.random() * (D - 6);
    const gx = Math.round(cx), gz = Math.round(cz);
    const h = gridH(gx, gz);
    const slope = Math.abs(gridH(gx + 1, gz) - gridH(gx - 1, gz)) * 0.5
                + Math.abs(gridH(gx, gz + 1) - gridH(gx, gz - 1)) * 0.5;
    if (!(h > 3.05 && h < 22 && slope < 0.65 &&
          laneDist(cx, cz) > 4.8 && baseDist(cx, cz) > 9 && crystalDist(cx, cz) > 4)) continue;
    const beach = h < 3.8;                              // 沙灘帶：稀疏的海岸野草
    const bald = vnoise(cx * 0.09, cz * 0.09);
    if (!beach && bald < 0.2) continue;                 // 禿斑：這一帶不長草（收斂）
    if (beach && Math.random() < 0.45) continue;        // 沙地草更稀
    const n = beach ? 1 + (Math.random() * 3 | 0)
                    : 4 + Math.round(bald * 8);         // 噪聲高處草更密
    for (let k = 0; k < n && spots.length < GRASS_CAP; k++) {
      const r = Math.sqrt(Math.random()) * 1.5, th = Math.random() * Math.PI * 2;
      const x = cx + Math.cos(th) * r, z = cz + Math.sin(th) * r;
      if (laneDist(x, z) < 4.5 || baseDist(x, z) < 8.7 || crystalDist(x, z) < 3.7) continue;
      spots.push([x, z, bald]);
    }
  }
  if (!spots.length) return;

  // 頂點變形注入（本體材質 + 陰影 depth 材質共用 → 影子跟著風搖/壓彎）。
  // 距離淡出必須用 uPlayerP 而非 cameraPosition：shadow pass 的 cameraPosition
  // 是「太陽相機」位置，用它算淡出會把整片草影縮沒。
  const injectGrassVert = (sh) => {
    sh.uniforms.uTime    = _waterTime;
    sh.uniforms.uPlayerP = _grassPlayer;
    sh.uniforms.uCamP    = _grassCam;
    sh.vertexShader = (
      'uniform float uTime;\nuniform vec3 uPlayerP;\nuniform vec3 uCamP;\nattribute float aH;\nattribute vec2 aRoot;\nattribute float aAng;\nvarying float vAH;\nvarying vec2 vGPos;\n' +
      'float ghash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
      'float gnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);\n' +
      '  return mix(mix(ghash(i), ghash(i + vec2(1,0)), u.x), mix(ghash(i + vec2(0,1)), ghash(i + vec2(1,1)), u.x), u.y); }\n' +
      sh.vertexShader)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vAH = aH;
        vec2 ipos = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        vGPos = ipos;
        // ── Per-blade billboard（grass-shader-glsl 核心）：每葉繞自己的根
        //    轉向「真相機」60% → 原地轉鏡頭草也跟著對齊（uCamP 每幀更新；
        //    不能用 shader 內建 cameraPosition——shadow pass 時那是太陽相機）──
        vec2 toV = uCamP.xz - ipos;
        float dA = atan(toV.x, toV.y) - aAng;
        float rot = atan(sin(dA), cos(dA)) * 0.6;
        float cs = cos(rot), sn = sin(rot);
        vec2 rel = transformed.xz - aRoot;
        transformed.xz = aRoot + vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs);
        // ── 噪聲風場（沿固定風向流動 → 看得見「風掃過草原」的波前）──
        vec2 wuv   = ipos * 0.07 - uTime * vec2(0.86, 0.64);
        float wind  = gnoise(wuv);                       // 主陣風 0..1
        float flut  = gnoise(wuv * 3.1 + 17.3) - 0.5;    // 高頻細顫
        vec2 bendDir = normalize(vec2(0.8, 0.6) + vec2(flut, -flut) * 0.7);
        float bend = (0.10 + 0.55 * wind * wind) * 0.5 + flut * 0.06;
        // ── 玩家互動（UE 式）：走過 → 草向兩側壓彎 + 輕壓低 ──
        vec2 away = ipos - uPlayerP.xz;
        float pd = length(away);
        float push = 1.0 - smoothstep(0.0, 1.3, pd);
        transformed.xz += normalize(away + vec2(0.001)) * push * 0.55 * aH;
        transformed.y  *= mix(1.0, 0.55, push);
        // 彎曲：權重 aH²（尖端 Bezier 弧形傾倒，根部穩）
        float wB = aH * aH;
        transformed.xz += bendDir * bend * wB;
        transformed.y  -= bend * wB * 0.35;
        // ── 距離淡出（UE cull distance 感）：遠處整株縮小消失 ──
        float cd = distance(ipos, uPlayerP.xz);
        transformed *= 1.0 - smoothstep(48.0, 68.0, cd);
      }`);
  };

  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    injectGrassVert(sh);
    sh.uniforms.uTip = { value: new THREE.Color(0xaacf64) };   // 尖端：FEZ 橄欖亮綠（提亮半檔）
    sh.fragmentShader = (
      'uniform float uTime;\nuniform vec3 uTip;\nvarying float vAH;\nvarying vec2 vGPos;\n' +
      'float fhash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
      'float fnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);\n' +
      '  return mix(mix(fhash(i), fhash(i + vec2(1,0)), u.x), mix(fhash(i + vec2(0,1)), fhash(i + vec2(1,1)), u.x), u.y); }\n' +
      sh.fragmentShader)
      // getShadowMask 依賴 shadowmap pars 的函數 → 必須注入在所有宣告之後、main 之前
      // （放檔頭會編譯失敗 → 整片草消失）
      .replace('void main() {', '#include <shadowmask_pars_fragment>\nvoid main() {')
      // DoubleSide 會在背面翻轉法線（朝上→朝下）→ billboard 葉片翻面瞬間變暗，
      // 鏡頭旋轉時形成一條「深淺分界線」掃過草原。草毯受光：法線恆朝上。
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize(vNormal);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        // 頂點色 AO：根部壓暗（fluffy 教學的「深色基部假陰影」）
        diffuseColor.rgb *= mix(0.66, 1.04, vAH);
        // 根→尖漸層：根部 = 地形色（instanceColor），尖端「雙色」由噪聲混合
        //（Codrops：two tip colors mixed by noise → 色彩豐富不雜亂）
        vec3 tip2 = uTip * vec3(0.74, 1.06, 0.70);   // 第二尖色：偏青綠
        vec3 tipC = mix(uTip, tip2, smoothstep(0.25, 0.75, fnoise(vGPos * 0.14)));
        diffuseColor.rgb = mix(diffuseColor.rgb, tipC, vAH * vAH * 0.78);
        // 大尺度雲影緩慢掃過（吉卜力草原的大塊明暗）
        float cl = sin(vGPos.x * 0.05 + uTime * 0.07) * sin(vGPos.y * 0.043 - uTime * 0.05);
        diffuseColor.rgb *= 0.90 + 0.16 * smoothstep(-0.4, 0.7, cl);
      }`)
      .replace('#include <opaque_fragment>', `
      {
        // ── 日式陰影染色（Codrops 核心）：陰影不是「變黑」，而是把草換成
        //    乾淨的「冷藍綠陰影色」——吉卜力樹影/雲影落在草地上的顏色 ──
        float sMask = getShadowMask();
        vec3 shadeC = outgoingLight * vec3(0.46, 0.58, 0.76) + vec3(0.004, 0.02, 0.05);
        outgoingLight = mix(shadeC, outgoingLight, sMask);
        // 透光 / 高光只發生在「陽光照得到」的草上（陰影中的草不該發亮）；
        // 並隨距離衰減——遠處 subpixel 葉尖的高光會閃白點（aliasing sparkle）
        float dFade = 1.0 - smoothstep(13.0, 32.0, distance(cameraPosition.xz, vGPos));
        vec2 V2 = normalize(cameraPosition.xz - vGPos);
        vec2 S2 = normalize(vec2(40.0, 30.0));
        float backlit = clamp(-dot(V2, S2), 0.0, 1.0);
        outgoingLight += uTip * (backlit * backlit) * vAH * 0.30 * sMask * dFade;
        float front = clamp(dot(V2, S2), 0.0, 1.0);
        outgoingLight += vec3(0.10, 0.09, 0.045) * pow(front, 5.0) * vAH * sMask * dFade;
      }
      #include <opaque_fragment>`);
  };

  // ── Chunk 分桶（Codrops 做法）：4×4 區各自 InstancedMesh（共用幾何/材質）
  //    → 視錐剔除生效，背後/遠處整塊不畫，省下的預算換密度 ──
  const CH = 4;
  const buckets = Array.from({ length: CH * CH }, () => []);
  for (const s of spots) {
    const bx = Math.min(CH - 1, Math.max(0, Math.floor(s[0] / (W / CH))));
    const bz = Math.min(CH - 1, Math.max(0, Math.floor(s[1] / (D / CH))));
    buckets[bz * CH + bx].push(s);
  }
  const gc = new THREE.Color();
  _grassChunks = [];
  for (const list of buckets) {
    if (!list.length) continue;
    const chunk = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([gx, gz, bald], i) => {
      const x = gx - HX, z = gz - HZ;
      _dummyObj.position.set(x, getTerrainHeight(x, z) - 0.02, z);
      _dummyObj.rotation.set(0, 0, 0);   // 不轉向：風向/billboard 需世界空間一致
      const s = 0.8 + Math.random() * 0.7;
      // 高度 = 大尺度噪聲（草原有高有矮的「地勢感」）× 隨機
      _dummyObj.scale.set(s, s * (0.55 + bald * 0.75 + Math.random() * 0.3), s);
      _dummyObj.updateMatrix();
      chunk.setMatrixAt(i, _dummyObj.matrix);
      // 草根色 = 地形著色函數（同一套色彩 → 與地面無縫），亮度微擾防死板
      _vertexColor(gx, gz, gc);
      gc.multiplyScalar(0.95 + Math.random() * 0.2);
      // 乾草混色（色彩雜度）：~16% 株偏枯黃
      if (Math.random() < 0.16) gc.lerp(_dryGrassC, 0.4 + Math.random() * 0.25);
      chunk.setColorAt(i, gc);
    });
    // 不投自身影（萬株草自影 = PCF 噪點髒亂——fluffy 風格靠「接收」乾淨的
    // 樹影/雲影 + 根部假 AO；省下的 depth pass 預算已換成密度）
    chunk.castShadow = false;
    chunk.receiveShadow = true;
    chunk.computeBoundingSphere();   // InstancedMesh 需手動算，否則剔除錯誤
    scene.add(chunk);
    _grassChunks.push({ mesh: chunk, max: list.length });
  }
  _grassMax = spots.length;
  _applyGrassTarget();
}

// ─── 野花點綴（UE 草地的色彩亮點）─────────────────────────────
// 細莖 + 交叉花瓣 quad；instanceColor = 花色（頂點色把莖固定為綠）。
function buildFlowers(scene) {
  ensureGrid();
  const CAP = 1700;
  // 幾何：莖（窄三角）+ 兩片交叉花瓣
  const pos = [], col = [], aHArr = [], idx = [];
  const stemC = [0.30, 0.48, 0.22], headC = [1, 1, 1];
  const H = 0.30;
  // 莖
  pos.push(-0.012, 0, 0,  0.012, 0, 0,  0, H, 0);
  col.push(...stemC, ...stemC, ...stemC);
  aHArr.push(0, 0, 1);
  idx.push(0, 1, 2);
  // 花瓣：兩片交叉 quad（0.11m）
  for (const a of [0, Math.PI / 2]) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const r = 0.055;
    const base = pos.length / 3;
    pos.push(
      -r * ca, H - 0.02, -r * sa,   r * ca, H - 0.02,  r * sa,
      -r * ca, H + 0.09, -r * sa,   r * ca, H + 0.09,  r * sa,
    );
    for (let k = 0; k < 4; k++) { col.push(...headC); aHArr.push(1); }
    idx.push(base, base + 1, base + 2,  base + 1, base + 3, base + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aH', new THREE.Float32BufferAttribute(aHArr, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // 散佈：草茂密區（禿斑噪聲高處）小簇
  const spots = [];
  for (let tr = 0; tr < 4000 && spots.length < CAP; tr++) {
    const cx = 3 + Math.random() * (W - 6);
    const cz = 3 + Math.random() * (D - 6);
    const gx = Math.round(cx), gz = Math.round(cz);
    const h = gridH(gx, gz);
    const slope = Math.abs(gridH(gx + 1, gz) - gridH(gx - 1, gz)) * 0.5
                + Math.abs(gridH(gx, gz + 1) - gridH(gx, gz - 1)) * 0.5;
    if (!(h > 3.7 && h < 13 && slope < 0.5 &&
          laneDist(cx, cz) > 5.5 && baseDist(cx, cz) > 10.5 && crystalDist(cx, cz) > 4.5)) continue;
    if (vnoise(cx * 0.09, cz * 0.09) < 0.55) continue;   // 只長在草茂密區
    const n = 2 + (Math.random() * 3 | 0);
    for (let k = 0; k < n && spots.length < CAP; k++) {
      const r = Math.sqrt(Math.random()) * 1.0, th = Math.random() * Math.PI * 2;
      spots.push([cx + Math.cos(th) * r, cz + Math.sin(th) * r]);
    }
  }
  if (!spots.length) return;

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = _waterTime;
    sh.vertexShader = ('uniform float uTime;\nattribute float aH;\n' + sh.vertexShader)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec2 ipos = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        float ph = ipos.x * 0.9 + ipos.y * 0.7;
        transformed.xz += vec2(sin(uTime * 2.0 + ph), cos(uTime * 1.7 + ph)) * 0.05 * aH;
        float cd = distance(ipos, cameraPosition.xz);
        transformed *= 1.0 - smoothstep(42.0, 60.0, cd);   // 距離淡出（比草更早）
      }`);
  };

  const FLOWER_COLORS = [0xffffff, 0xffd95e, 0xc9a8ff, 0xffb3c8, 0xff8a7a];
  const flowers = new THREE.InstancedMesh(geo, mat, spots.length);
  const fc = new THREE.Color();
  spots.forEach(([gx, gz], i) => {
    const x = gx - HX, z = gz - HZ;
    _dummyObj.position.set(x, getTerrainHeight(x, z) - 0.01, z);
    _dummyObj.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const s = 0.8 + Math.random() * 0.7;
    _dummyObj.scale.set(s, s, s);
    _dummyObj.updateMatrix();
    flowers.setMatrixAt(i, _dummyObj.matrix);
    fc.setHex(FLOWER_COLORS[(Math.random() * FLOWER_COLORS.length) | 0]);
    flowers.setColorAt(i, fc);
  });
  flowers.castShadow = false;
  flowers.receiveShadow = true;
  scene.add(flowers);
  _flowerMesh = flowers;
  _flowerMax  = spots.length;
  _flowerMesh.count = Math.min(_flowerMax, Math.round((_grassTarget === Infinity ? CAP * 12 : _grassTarget) / 12));
}

function scatterRocks(scene) {
  ensureGrid();
  const spots = [];
  for (let tr = 0; tr < 900 && spots.length < 70; tr++) {
    const x = 4 + (Math.random() * (W - 8) | 0);
    const z = 4 + (Math.random() * (D - 8) | 0);
    const h = gridH(x, z);
    if (laneDist(x, z) > 6 && baseDist(x, z) > 10 && crystalDist(x, z) > 4 && h > 6) {
      spots.push([x - HX, h - 4, z - HZ]);
    }
  }
  if (!spots.length) return;
  const geo = new THREE.DodecahedronGeometry(0.55, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x868c94, flatShading: true });
  const rocks = new THREE.InstancedMesh(geo, mat, spots.length);
  spots.forEach(([x, y, z], i) => {
    _dummyObj.position.set(x, y + 0.15, z);
    _dummyObj.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    _dummyObj.scale.set(0.5 + Math.random(), 0.4 + Math.random() * 0.6, 0.5 + Math.random());
    _dummyObj.updateMatrix();
    rocks.setMatrixAt(i, _dummyObj.matrix);
  });
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);
  _rockSpots = spots;
  _procMeshes.rocks = [rocks];
}

// ─── Voxel Castle（保留體素建築風格）──────────────────────────
function buildCastle(bx, bz, teamId) {
  const h = heightAt(bx, bz);
  const wallId = 'brick';
  // 城門朝向戰場中央：藍堡在 +z 側 → 門開 -z；紅堡在 -z 側 → 門開 +z
  const gateDz = teamId === 'blue' ? -6 : 6;
  // 地基
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++)
    for (let y = h - 2; y < h; y++) setBlock(bx + dx, y, bz + dz, 'stone');
  // 外城牆（高4，留缺口）
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
    if (Math.abs(dx) === 6 || Math.abs(dz) === 6) {
      if (Math.abs(dx) < 2 && dz === gateDz) continue; // 城門
      for (let y = h; y < h + 4; y++) setBlock(bx + dx, y, bz + dz, wallId);
      if (((dx + dz) & 1) === 0) setBlock(bx + dx, h + 4, bz + dz, wallId); // 城垛
    }
  }
  // 四角塔（高7，頂部隊色）
  [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(([cx, cz]) => {
    for (let y = h; y < h + 7; y++)
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
        setBlock(bx + cx + dx, y, bz + cz + dz, wallId);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
      setBlock(bx + cx + dx, h + 7, bz + cz + dz, teamId);
  });
  // 中央主塔（高9）
  for (let y = h; y < h + 9; y++)
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
      if (Math.abs(dx) === 2 || Math.abs(dz) === 2) setBlock(bx + dx, y, bz + dz, wallId);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
    setBlock(bx + dx, h + 9, bz + dz, teamId); // 塔頂
  // 水晶核心（發光）
  for (let k = 0; k < 4; k++) setBlock(bx, h + 10 + k, bz, 'crystal');
  // 旗杆
  for (let y = h + 10; y < h + 15; y++)
    setBlock(bx + (teamId === 'blue' ? -2 : 2), y, bz, 'wood');
}

// ─── GLB 模型熱替換（Kenney CC0；檔案在 public/models/）───────
async function _upgradeModels(scene) {
  const rockOv = { dirt: 0x868c94, grass: 0x6fae4e, _defaultMat: 0x9aa0a8 };
  // 樹：程序化風格樹（揉皺球簇樹冠，CC0 樹包 CLI 下載不可行 → 自產更可控）
  const ta = makeStylizedTree('round', 3.1);
  const tb = makeStylizedTree('tall',  3.8);
  const tc = makeStylizedTree('pine',  3.5);
  const [ra, rb] = await Promise.all([
    loadBakedGLB('models/rock_a.glb',    { colorOverrides: rockOv, targetHeight: 0.9 }),
    loadBakedGLB('models/rock_b.glb',    { colorOverrides: rockOv, targetHeight: 1.7 }),
  ]);
  const groundY = (spots) => spots.map(([x, , z]) => [x, getTerrainHeight(x, z), z]);
  const swap = (key, spots, variants, opts) => {
    const vs = variants.filter(Boolean);
    if (!vs.length || !spots.length) return;
    for (const m of _procMeshes[key]) { scene.remove(m); m.geometry.dispose(); }
    _procMeshes[key] = spawnInstancedModels(scene, spots, vs, opts);
  };
  // 樹：風搖樹冠 + 頂亮底暗色階 + 每棵色彩微差（原神樹林感）
  swap('trees', groundY(_treeSpots), [ta, tb, tc],
       { scaleMin: 0.8, scaleMax: 1.55, sway: _waterTime, canopyGrade: true, colorJitter: 0.10 });
  swap('rocks', groundY(_rockSpots), [ra, rb], { scaleMin: 0.7, scaleMax: 1.6 });
}

// ─── InstancedMesh Rendering（體素建築）──────────────────────
let _scene = null;
const _meshes = {};
const _cubeGeo = new THREE.BoxGeometry(1, 1, 1);

function isExposed(x, y, z) {
  return !getBlock(x + 1, y, z) || !getBlock(x - 1, y, z) ||
         !getBlock(x, y + 1, z) || !getBlock(x, y - 1, z) ||
         !getBlock(x, y, z + 1) || !getBlock(x, y, z - 1);
}

function rebuild() {
  const lists = {};
  for (const id in BLOCKS) lists[id] = [];
  WORLD.forEach((id, k) => {
    const [x, y, z] = k.split(',').map(Number);
    if (isExposed(x, y, z)) lists[id].push([x, y, z]);
  });
  for (const id in BLOCKS) {
    if (_meshes[id]) { _scene.remove(_meshes[id]); }
    const list = lists[id];
    if (!list || !list.length) { _meshes[id] = null; continue; }
    const im = new THREE.InstancedMesh(_cubeGeo, getMat(id), list.length);
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;
    list.forEach((p, i) => {
      _dummyObj.position.set(p[0] - HX, p[1] - VERT_OFFSET, p[2] - HZ);
      _dummyObj.rotation.set(0, 0, 0);
      _dummyObj.scale.setScalar(1);
      _dummyObj.updateMatrix();
      im.setMatrixAt(i, _dummyObj.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    _scene.add(im);
    _meshes[id] = im;
  }
}

// ─── Main Build Function ──────────────────────────────────────
/**
 * 建立整個地圖並加入 scene（平滑地形 + 水面 + 樹木岩石 + 體素城堡/水晶簇）。
 * 需要在 scene 建立後呼叫，且只呼叫一次。
 */
export function buildVoxelMap(scene, crystalPositions = []) {
  _scene = scene;
  ensureGrid();

  buildTerrainMesh(scene);
  buildWater(scene);
  plantTrees(scene);
  scatterRocks(scene);
  buildGrass(scene);
  buildFlowers(scene);

  // 藍方城堡：grid (64,114) = visual (0,+50)；紅方 (64,14) = visual (0,-50)
  buildCastle(BASE_A[0], BASE_A[1], 'blue');
  buildCastle(BASE_B[0], BASE_B[1], 'red');

  rebuild();

  // 非同步載入 Kenney CC0 模型升級樹/岩石/水晶（失敗則保留程序化版本）
  _upgradeModels(scene).catch(() => {});

  // 模型城堡：載入成功後移除體素城堡（WORLD 目前只剩城堡方塊）
  buildModelCastles(scene).then(ok => {
    if (ok) { WORLD.clear(); rebuild(); }
  }).catch(() => {});
}
