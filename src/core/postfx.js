import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { N8AOPass } from '../vendor/N8AO.js';

// ─── 後處理管線 ───────────────────────────────────────────────
// N8AO（渲染場景 + SSAO，取代 RenderPass）→ UnrealBloom → 銳化+filmic 調色暈影
// → Output → SMAA。
// 註：N8AO 需要自己的 depth texture，與 MSAA render target 不相容 →
// 抗鋸齒由鏈尾 SMAA 負責（品質接近 MSAA、無 FXAA 的全畫面模糊）。

export function initPostFX(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);

  // SSAO：接觸陰影/角落變暗 → 物體「坐進」場景（UE 立體感的關鍵一環）
  const aoPass = new N8AOPass(scene, camera, innerWidth, innerHeight);
  aoPass.configuration.aoRadius        = 2.0;
  aoPass.configuration.distanceFalloff = 1.0;
  aoPass.configuration.intensity       = 2.2;
  aoPass.configuration.color           = new THREE.Color(0x0a0e18);   // 微藍 AO（配日式陰影）
  // N8AO 的 sRGB 輸出（gammaCorrection=true）+ 後段 OutputPass = 技術上的雙重校正，
  // 但這條「提亮曲線」的柔亮+AO 立體觀感是本作想要的 look（使用者選擇）。
  // 太白 → 降 main.js 的 toneMappingExposure；要標準管線 → 改回 false。
  aoPass.configuration.gammaCorrection = true;
  composer.addPass(aoPass);

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.24, 0.55, 0.85);
  composer.addPass(bloomPass);

  const gradePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uVig:   { value: 0.34 },
      uSat:   { value: 1.12 },                          // 飽和（再強→升、過豔→降）
      uSharp: { value: 0.30 },                          // unsharp mask 強度
      uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
      uTime:  { value: 0 },                             // 膠片顆粒動畫
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uVig; uniform float uSat; uniform float uSharp; uniform float uTime;
      uniform vec2 uTexel;
      varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        // 銳化（unsharp mask）：找回貼圖/草葉的高頻細節，反「畫面糊」
        vec3 nb = texture2D(tDiffuse, vUv + vec2(0.0,  uTexel.y)).rgb
                + texture2D(tDiffuse, vUv - vec2(0.0,  uTexel.y)).rgb
                + texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb
                + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb;
        c.rgb += (c.rgb - nb * 0.25) * uSharp;
        // filmic S-curve 對比（UE 式：暗部沉、亮部透）
        c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.55);
        // Split toning（電影調色核心）：陰影染冷藍、亮部染暖橙（輕量——暖白也是白）
        float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb += mix(vec3(-0.016, 0.004, 0.042), vec3(0.020, 0.008, -0.018),
                     smoothstep(0.22, 0.78, lum));
        // 黑位：FEZ 黑就是黑——只留極微藍底
        c.rgb = c.rgb * 0.988 + vec3(0.002, 0.003, 0.005);
        c.rgb = mix(vec3(lum), c.rgb, uSat);                     // 輕微提飽和
        float d = distance(vUv, vec2(0.5));
        c.rgb *= 1.0 - smoothstep(0.42, 0.88, d) * uVig;         // 柔和暈影聚焦
        // 極輕膠片顆粒：打破 CG 的「過度乾淨」
        float gr = fract(sin(dot(vUv * 731.7 + fract(uTime) * 13.1, vec2(12.9898, 78.233))) * 43758.5453);
        c.rgb += (gr - 0.5) * 0.022;
        gl_FragColor = c;
      }`,
  });
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());

  const smaaPass = new SMAAPass(innerWidth, innerHeight);
  composer.addPass(smaaPass);

  function syncSize() {
    const pr = renderer.getPixelRatio();   // 跟隨畫質設定的實際解析度
    composer.setPixelRatio(pr);
    composer.setSize(innerWidth, innerHeight);
    gradePass.uniforms.uTexel.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
  }
  syncSize();

  return { composer, syncSize, bloomPass, gradePass, aoPass };
}
