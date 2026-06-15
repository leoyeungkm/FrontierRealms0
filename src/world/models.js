import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ─── GLB 模型載入（針對 Kenney 風格純色低多邊形模型）──────────
// 流程：載入 → 材質色烘焙成頂點色 → 合併為單一幾何（發光部分另拆一份）
// → 正規化（底部貼地、水平置中、縮放到目標高度）
// 產出的幾何可直接餵給 InstancedMesh：一個模型 = 1~2 個 draw call。

const _loader = new GLTFLoader();

/**
 * @param {string} url GLB 路徑（放在 public/models/）
 * @param {object} opts
 *   colorOverrides: { 材質名: hex }   — 重新上色以配合世界調色盤
 *   glowMatch:      RegExp            — 材質名符合者拆到發光層（吃 bloom）
 *   targetHeight:   number            — 正規化後的高度（公尺）
 * @returns {Promise<{base: BufferGeometry|null, glow: BufferGeometry|null}|null>}
 */
export async function loadBakedGLB(url, opts = {}) {
  let gltf;
  try { gltf = await _loader.loadAsync(url); } catch { return null; }

  const baseGeos = [], glowGeos = [];
  const col = new THREE.Color();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    // toNonIndexed 對已非索引的幾何會回傳原物件 → 先 clone 避免污染來源
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    const posAttr = geo.attributes.position;
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: posAttr.count, materialIndex: 0 }];
    for (const g of groups) {
      const mat = mats[g.materialIndex] || mats[0];
      const name = mat?.name || '';
      const ov = opts.colorOverrides?.[name];
      col.setHex(ov != null ? ov : (mat?.color ? mat.color.getHex() : 0xffffff));

      const slice = (attr) => new THREE.BufferAttribute(
        attr.array.slice(g.start * attr.itemSize, (g.start + g.count) * attr.itemSize), attr.itemSize);
      const sub = new THREE.BufferGeometry();
      sub.setAttribute('position', slice(posAttr));
      if (geo.attributes.normal) sub.setAttribute('normal', slice(geo.attributes.normal));
      const colors = new Float32Array(g.count * 3);
      for (let i = 0; i < g.count; i++) {
        colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
      }
      sub.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      (opts.glowMatch && opts.glowMatch.test(name) ? glowGeos : baseGeos).push(sub);
    }
  });
  if (!baseGeos.length && !glowGeos.length) return null;

  const out = {
    base: baseGeos.length ? mergeGeometries(baseGeos) : null,
    glow: glowGeos.length ? mergeGeometries(glowGeos) : null,
  };
  // 正規化：兩層共用同一個包圍盒與變換（保持相對位置）
  const parts = [out.base, out.glow].filter(Boolean);
  const box = new THREE.Box3();
  for (const g of parts) { g.computeBoundingBox(); box.union(g.boundingBox); }
  const sizeY = Math.max(0.0001, box.max.y - box.min.y);
  const s = (opts.targetHeight || 2.5) / sizeY;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const m = new THREE.Matrix4()
    .makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeTranslation(-cx, -box.min.y, -cz));
  for (const g of parts) g.applyMatrix4(m);
  return out;
}

/**
 * 載入使用調色盤貼圖的 kit 模型（如 Kenney Castle Kit）：
 * 保留原材質與 UV，合併 primitives 成單一幾何。
 * @returns {Promise<{geometry: BufferGeometry, material: Material}|null>}
 */
export async function loadKitGLB(url) {
  let gltf;
  try { gltf = await _loader.loadAsync(url); } catch { return null; }
  const geos = [];
  let material = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    if (!material) material = Array.isArray(o.material) ? o.material[0] : o.material;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(o.matrixWorld);
    const sub = new THREE.BufferGeometry();
    sub.setAttribute('position', g.attributes.position);
    if (g.attributes.normal) sub.setAttribute('normal', g.attributes.normal);
    if (g.attributes.uv) sub.setAttribute('uv', g.attributes.uv);
    geos.push(sub);
  });
  if (!geos.length || !material) return null;
  return { geometry: mergeGeometries(geos), material };
}

// ─── 程序化風格樹（原神/吉卜力式：揉皺球簇樹冠 + 彎曲樹幹）─────
// CC0 樹模型 CLI 下載不易（itch/poly.pizza 動態連結）→ 程序化生成，
// 頂點色：樹冠綠（g>r → 吃 canopyGrade/風搖 shader）、樹幹棕。
function _bakeColor(geo, fn) {
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(c, p.getX(i), p.getY(i), p.getZ(i));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** 揉皺球（樹冠團）：icosphere 頂點沿法線抖動 → 不規則有機形 */
function _crumpleBall(r, jitter = 0.16) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (Math.random() - 0.5) * jitter * 2;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * (k * 0.92), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

/** kind: 'round' 圓冠 | 'tall' 高瘦 | 'pine' 松樹；回傳 { base } 同 loadBakedGLB */
export function makeStylizedTree(kind = 'round', targetHeight = 3.2) {
  const geos = [];
  const leafA = new THREE.Color(0x468034), leafB = new THREE.Color(0x78ac4e);   // 底深 → 頂亮（FEZ 橄欖提亮）
  const warm  = new THREE.Color(0xa1ad4a);                                       // 頂部暖染
  const barkA = new THREE.Color(0x6b4a2a), barkB = new THREE.Color(0x83613a);

  const trunk = (h, rB, rT, leanX = 0) => {
    const t = new THREE.CylinderGeometry(rT, rB, h, 7, 2);
    const p = t.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + h / 2;
      p.setX(i, p.getX(i) + leanX * (y / h) * h * 0.18);   // 輕微彎曲
    }
    t.translate(0, h / 2, 0);
    _bakeColor(t, (c, x, y) => c.copy(barkA).lerp(barkB, Math.min(1, y / h) * 0.7 + Math.random() * 0.15));
    geos.push(t);
    return h;
  };
  const canopyBall = (r, cx, cy, cz, yMin, yMax) => {
    const b = _crumpleBall(r);
    b.translate(cx, cy, cz);
    _bakeColor(b, (c, x, y) => {
      const k = THREE.MathUtils.clamp((y - yMin) / Math.max(0.001, yMax - yMin), 0, 1);
      c.copy(leafA).lerp(leafB, k).lerp(warm, k * k * 0.35 + Math.random() * 0.06);
    });
    geos.push(b);
  };

  if (kind === 'pine') {
    const th = trunk(1.0, 0.17, 0.12, (Math.random() - 0.5));
    // 三層揉皺圓錐
    let y = th * 0.85;
    for (const [r, h] of [[1.05, 1.15], [0.82, 1.0], [0.55, 0.9]]) {
      const cone = new THREE.ConeGeometry(r, h, 8, 2);
      const p = cone.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 1 + (Math.random() - 0.5) * 0.22;
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
      }
      cone.computeVertexNormals();
      cone.translate(0, y + h / 2, 0);
      const y0 = y, y1 = y + h;
      _bakeColor(cone, (c, x, yy) => {
        const k = THREE.MathUtils.clamp((yy - y0) / (y1 - y0), 0, 1);
        c.copy(leafA).lerp(leafB, k * 0.8 + 0.1);
      });
      geos.push(cone);
      y += h * 0.55;
    }
  } else {
    const tall = kind === 'tall';
    const th = trunk(tall ? 1.7 : 1.1, tall ? 0.15 : 0.19, tall ? 0.1 : 0.13, (Math.random() - 0.5) * 1.4);
    // 主球 + 衛星球簇
    const cy = th + (tall ? 0.55 : 0.7);
    const R = tall ? 0.78 : 0.95;
    const yMin = cy - R * 1.4, yMax = cy + R * 1.6;
    canopyBall(R, 0, cy, 0, yMin, yMax);
    const n = tall ? 3 : 4 + (Math.random() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.8;
      const rr = R * (0.5 + Math.random() * 0.25);
      canopyBall(rr,
        Math.cos(a) * R * 0.75,
        cy + (tall ? 0.5 + i * 0.42 : (Math.random() - 0.3) * 0.55),
        Math.sin(a) * R * 0.75, yMin, yMax);
    }
  }

  let merged = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g));
  // 正規化：底部貼地、縮放到目標高度（與 loadBakedGLB 一致）
  merged.computeBoundingBox();
  const bb = merged.boundingBox;
  merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const s = targetHeight / Math.max(0.001, bb.max.y - bb.min.y);
  merged.scale(s, s, s);
  merged.computeVertexNormals();
  return { base: merged, glow: null };
}

const _dummy = new THREE.Object3D();

/**
 * 用載入的模型在指定位置批次生成 InstancedMesh（base + 可選 glow 層）。
 * spots: [[x, y, z], ...]；variants: loadBakedGLB 結果陣列（依序輪流分配）
 * 回傳建立的 mesh 陣列（方便之後移除）。
 */
export function spawnInstancedModels(scene, spots, variants, opts = {}) {
  const { scaleMin = 0.85, scaleMax = 1.3, randomYaw = true,
          glowColor = 0x35e0c8, glowIntensity = 0.6, castShadow = true,
          sway = null, canopyGrade = false, colorJitter = 0 } = opts;
  const made = [];
  variants = variants.filter(Boolean);
  if (!variants.length || !spots.length) return made;

  // 樹冠強化 shader：只作用在「綠色頂點」（葉），樹幹另有豎紋
  // sway = 時間 uniform（{value}）→ 樹冠隨風輕搖；canopyGrade → 色階+葉簇細節
  const enhance = (mat) => {
    if (!sway && !canopyGrade) return mat;
    mat.onBeforeCompile = (sh) => {
      if (sway) sh.uniforms.uTime = sway;
      sh.vertexShader = (
        (sway ? 'uniform float uTime;\n' : '') +
        'varying float vLeafM;\nvarying float vLocH;\nvarying vec3 vMWp;\n' + sh.vertexShader)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vLeafM = step(color.r, color.g);        // 綠 > 紅 = 樹葉頂點
          vLocH  = position.y;
          vMWp   = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
          ${sway ? `
          float swayK = vLeafM * smoothstep(0.6, 2.6, position.y);
          vec2 iph = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
          transformed.x += sin(uTime * 1.5 + iph.x * 0.7 + position.y * 0.9) * 0.055 * swayK;
          transformed.z += cos(uTime * 1.2 + iph.y * 0.8) * 0.045 * swayK;` : ''}
        }`);
      if (canopyGrade) {
        sh.fragmentShader = (
          'varying float vLeafM;\nvarying float vLocH;\nvarying vec3 vMWp;\n' +
          'float mhash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
          'float mnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);\n' +
          '  return mix(mix(mhash(i), mhash(i + vec2(1,0)), u.x), mix(mhash(i + vec2(0,1)), mhash(i + vec2(1,1)), u.x), u.y); }\n' +
          sh.fragmentShader)
          .replace('#include <color_fragment>', `#include <color_fragment>
          {
            // 樹冠色階：底部陰影綠 → 頂部受光亮（FEZ 沉穩版）
            float k = smoothstep(0.3, 2.8, vLocH);
            vec3 graded = diffuseColor.rgb * mix(vec3(0.74, 0.80, 0.75), vec3(1.10, 1.07, 0.90), k);
            // 葉簇明暗（兩個尺度）：純色樹冠長出「一簇簇葉子」的細節
            float clump = mnoise(vMWp.xz * 1.5 + vMWp.y * 0.6) * 0.7
                        + mnoise(vMWp.xz * 4.5 + vMWp.y * 1.8) * 0.3;
            graded *= 0.82 + clump * 0.34;
            // 樹幹豎紋（樹皮）
            float bark = 0.84 + 0.30 * mnoise(vec2((vMWp.x + vMWp.z) * 5.0, vMWp.y * 0.8));
            diffuseColor.rgb = mix(diffuseColor.rgb * bark, graded, vLeafM);
          }`);
      }
    };
    return mat;
  };

  // 依 variant 分配 spots
  const byVariant = variants.map(() => []);
  spots.forEach((p, i) => byVariant[i % variants.length].push(p));

  const jc = new THREE.Color();
  variants.forEach((v, vi) => {
    const list = byVariant[vi];
    if (!list.length) return;
    const mats = [];
    const layers = [];
    if (v.base) layers.push([v.base, enhance(new THREE.MeshLambertMaterial({ vertexColors: true }))]);
    if (v.glow) layers.push([v.glow, new THREE.MeshLambertMaterial({
      vertexColors: true, emissive: new THREE.Color(glowColor), emissiveIntensity: glowIntensity,
    })]);
    const meshes = layers.map(([g, mat]) => { mats.push(mat); return new THREE.InstancedMesh(g, mat, list.length); });
    list.forEach((p, i) => {
      _dummy.position.set(p[0], p[1], p[2]);
      _dummy.rotation.set(0, randomYaw ? Math.random() * Math.PI * 2 : 0, 0);
      _dummy.scale.setScalar(scaleMin + Math.random() * (scaleMax - scaleMin));
      _dummy.updateMatrix();
      for (const mm of meshes) {
        mm.setMatrixAt(i, _dummy.matrix);
        // 每棵色彩微差（亮度+冷暖擾動）：樹林不再齊一
        if (colorJitter > 0) {
          const t = (Math.random() * 2 - 1) * colorJitter;
          jc.setRGB(1 + t * 0.6, 1 + Math.abs(t) * 0.2, 1 - t * 0.8);
          mm.setColorAt(i, jc);
        }
      }
    });
    for (const mm of meshes) {
      mm.castShadow = castShadow;
      mm.receiveShadow = true;
      scene.add(mm);
      made.push(mm);
    }
  });
  return made;
}
