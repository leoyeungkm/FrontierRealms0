// ─── 畫質設定（低/中/高）────────────────────────────────────
// localStorage 持久化；切換即時生效。
// 設計約束：切換「不得」觸發 shader 重編譯（會凍結數秒）——
// 因此只調整解析度 / 後處理開關 / 陰影貼圖大小 / 草數量，
// 不動材質參數、不開關 renderer.shadowMap.enabled。

export const QUALITY_PRESETS = {
  low:  { label: '低', pixelRatio: 1.0, postfx: false, shadowMap: 1024, grass: 6000 },
  mid:  { label: '中', pixelRatio: 1.5, postfx: true,  shadowMap: 2048, grass: 17000 },
  high: { label: '高', pixelRatio: 2.0, postfx: true,  shadowMap: 4096, grass: 34000 },
};

let _level = localStorage.getItem('fr0_quality') || 'high';
if (!QUALITY_PRESETS[_level]) _level = 'high';

let _ctx = null;

export function getQuality() { return _level; }
export function getPreset()  { return QUALITY_PRESETS[_level]; }
export function usePostFX()  { return QUALITY_PRESETS[_level].postfx; }

/** main.js 在 renderer / composer / sun 就緒後呼叫一次 */
export function bindQuality(ctx) {
  _ctx = ctx;
  applyQuality(_level);
}

export function applyQuality(level) {
  if (!QUALITY_PRESETS[level] || !_ctx) return;
  _level = level;
  localStorage.setItem('fr0_quality', level);
  const p = QUALITY_PRESETS[level];
  const { renderer, composer, syncSize, sun, setGrassCount, aoPass } = _ctx;

  const pr = Math.min(devicePixelRatio, p.pixelRatio);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(pr);
  syncSize();

  // SSAO 解析度：中檔半解析（省約一半 AO 成本），高檔全解析
  if (aoPass) aoPass.configuration.halfRes = level !== 'high';

  // 陰影貼圖解析度（uniform 級變更，不觸發重編譯；置空讓 three 下幀重建）
  if (sun.shadow.mapSize.x !== p.shadowMap) {
    sun.shadow.mapSize.setScalar(p.shadowMap);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }

  setGrassCount(p.grass);
}
