import * as THREE from 'three';

// ─── 天空與環境（漸層天穹 + 低多邊形飄移雲）─────────────────
// buildSky(scene) 建立一次；updateEnvironment(dt) 每幀呼叫（雲朵飄移）

export const SKY_TOP     = 0x4a90e0;  // 天頂藍
export const SKY_HORIZON = 0xcfe8f5;  // 地平線淡藍（霧色建議同步）

// ─── 漸層天穹 ─────────────────────────────────────────────────
function buildSkyDome(scene, sunDir) {
  const geo = new THREE.SphereGeometry(380, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop:     { value: new THREE.Color(SKY_TOP) },
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uGround:  { value: new THREE.Color(0x8fa8b8) },
      uSunDir:  { value: sunDir.clone().normalize() },
      uSunCol:  { value: new THREE.Color(0xfff0c8) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHorizon, uGround, uSunDir, uSunCol;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        // 地平線以上：horizon→top；以下：偏灰藍
        vec3 col = h >= 0.0
          ? mix(uHorizon, uTop, pow(h, 0.55))
          : mix(uHorizon, uGround, min(1.0, -h * 3.0));
        // 太陽光暈（核心 + 大範圍暖暈）
        float d = max(0.0, dot(vDir, uSunDir));
        col += uSunCol * (pow(d, 350.0) * 0.9 + pow(d, 18.0) * 0.18);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);
}

// ─── 低多邊形雲（隨風緩慢飄移，越界回繞）──────────────────────
let _clouds = null;
const _cloudData = [];   // { x, y, z, sx, sy, sz, rot, speed }
const _cloudObj = new THREE.Object3D();
const WRAP_X = 170;

function buildClouds(scene) {
  const puffs = [];
  const clusters = 14;
  for (let c = 0; c < clusters; c++) {
    const cx = (Math.random() - 0.5) * 2 * WRAP_X;
    const cy = 42 + Math.random() * 26;
    const cz = (Math.random() - 0.5) * 230;
    const n  = 3 + (Math.random() * 3 | 0);
    const speed = 1.2 + Math.random() * 1.6;
    for (let i = 0; i < n; i++) {
      puffs.push({
        x: cx + (Math.random() - 0.5) * 9,
        y: cy + (Math.random() - 0.5) * 2.5,
        z: cz + (Math.random() - 0.5) * 6,
        sx: 3.5 + Math.random() * 4.5,
        sy: 1.2 + Math.random() * 1.1,
        sz: 2.5 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        speed,
      });
    }
  }
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff, emissive: 0x9fb6c8, emissiveIntensity: 0.35,
    flatShading: true, transparent: true, opacity: 0.92, fog: false,
  });
  _clouds = new THREE.InstancedMesh(geo, mat, puffs.length);
  _clouds.castShadow = false;
  _clouds.frustumCulled = false;
  _cloudData.push(...puffs);
  _syncCloudMatrices();
  scene.add(_clouds);
}

function _syncCloudMatrices() {
  for (let i = 0; i < _cloudData.length; i++) {
    const p = _cloudData[i];
    _cloudObj.position.set(p.x, p.y, p.z);
    _cloudObj.rotation.set(0, p.rot, 0);
    _cloudObj.scale.set(p.sx, p.sy, p.sz);
    _cloudObj.updateMatrix();
    _clouds.setMatrixAt(i, _cloudObj.matrix);
  }
  _clouds.instanceMatrix.needsUpdate = true;
}

/** 建立天空（天穹 + 雲）。sunDir = 太陽方向（用於光暈位置） */
export function buildSky(scene, sunDir = new THREE.Vector3(40, 80, 30)) {
  buildSkyDome(scene, sunDir);
  buildClouds(scene);
}

/** 每幀：雲朵向 +x 飄移，超界回繞 */
export function updateEnvironment(dt) {
  if (!_clouds) return;
  for (const p of _cloudData) {
    p.x += p.speed * dt;
    if (p.x > WRAP_X) p.x -= WRAP_X * 2;
  }
  _syncCloudMatrices();
}
