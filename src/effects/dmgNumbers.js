import * as THREE from 'three';

const dmgNumbers = [];
let _camera = null;
let _hudEl   = null;

/** 必須在 camera + HUD element 建立後呼叫一次 */
export function initDmgNumbers(camera) {
  _camera = camera;
  _hudEl  = document.getElementById('hud');
}

/** 世界座標 → 螢幕像素座標，相機背後回傳 null */
const _wsScratch = new THREE.Vector3();
export function worldToScreen(worldPos) {
  const p = _wsScratch.copy(worldPos).project(_camera);
  if (p.z > 1) return null;
  return { x: (p.x + 1) / 2 * innerWidth, y: (-p.y + 1) / 2 * innerHeight };
}

/**
 * 在 3D 世界座標上顯示浮動傷害數字
 * @param {THREE.Vector3} worldPos  起始 3D 位置
 * @param {number|string} amount    傷害值或字串（如 '+💎'）
 * @param {boolean}       isCrit   暴擊時字體變大且顯示 '!'
 * @param {string}        color    CSS 顏色字串（預設白色）
 */
export function showDmgNum(worldPos, amount, isCrit = false, color = '#fff') {
  const el = document.createElement('div');
  el.className   = 'dmg-num';
  el.textContent = isCrit ? `${amount}!` : amount;
  el.style.color    = isCrit ? '#ffcc00' : color;
  el.style.fontSize = isCrit ? '22px' : '16px';
  _hudEl.appendChild(el);
  dmgNumbers.push({ el, worldPos: worldPos.clone(), offsetY: 0, life: 0.85 });
}

/** 每幀呼叫：更新位置、透明度、移除死亡數字 */
const _dnScratch = new THREE.Vector3();
export function updateDmgNumbers(dt) {
  for (let i = dmgNumbers.length - 1; i >= 0; i--) {
    const d = dmgNumbers[i];
    d.life    -= dt;
    d.offsetY += dt * 1.8;
    const sp = worldToScreen(_dnScratch.copy(d.worldPos).setY(d.worldPos.y + d.offsetY));
    if (sp && d.life > 0) {
      d.el.style.left    = sp.x + 'px';
      d.el.style.top     = sp.y + 'px';
      d.el.style.opacity = (d.life / 0.85).toFixed(2);
    } else {
      d.el.remove();
      dmgNumbers.splice(i, 1);
    }
  }
}
