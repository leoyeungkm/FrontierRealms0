// ─── Sui 鏈上衣櫥 UI（注入外觀面板 O）──────────────────────────
// 連接（錢包 / Google zkLogin）→ 把目前造型鑄成 NFT（預覽圖+設定存 Walrus）
// → 我的造型 NFT（顯示 Walrus 圖、點擊從 Walrus 讀回裝備）→ 🎨 重新染色。
// suiEnabled() 為 false（未部署合約）時整區隱藏，遊戲照常。
import { appearance, equipLoadout, equipGearPiece, setSuiAddress, capturePreviewDataURL } from './appearance.js';
import { suiEnabled, RARITY_NAME, RARITY_COLOR } from '../sui/config.js';
import {
  suiState, onSuiChange, initSui, connectWallet, connectZkLogin, disconnectWallet,
  mintCosmetic, mintGearPiece, recolorCosmetic, loadCosmeticConfig,
} from '../sui/wallet.js';
import { t, onLangChange } from './i18n.js';
import { setHeroImage } from '../sui/character.js';

let _root = null, _onEquip = null;

export function initSuiPanel(onEquip) {
  _onEquip = onEquip;
  const panel = document.getElementById('appearance-panel');
  if (!panel || !suiEnabled()) return;

  _root = document.createElement('div');
  _root.id = 'sui-wardrobe';
  panel.appendChild(_root);
  onSuiChange(_render);
  onLangChange(_render);
  initSui();
  _render();
}

const _short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const _canvas = () => document.getElementById('ap-preview');

function _render() {
  if (!_root) return;
  const s = suiState;
  let html = `<div class="ap-section" style="color:#6fd0ff;border-top:1px solid #335;padding-top:6px;margin-top:8px;">${t('g_sui_title')}</div>`;

  if (!s.connected) {
    html += `<button class="dbg-btn" id="sui-connect">${s.available ? t('g_sui_connect') : t('g_sui_need_wallet')}</button>`;
    if (s.zkEnabled) html += `<button class="dbg-btn" id="sui-google" style="background:#2a3a5a;">${t('g_sui_google')}</button>`;
    html += `<div class="ap-note">${t('g_sui_login_note')}</div>`;
    _root.innerHTML = html;
    _root.querySelector('#sui-connect')?.addEventListener('click', _connect);
    _root.querySelector('#sui-google')?.addEventListener('click', _google);
    return;
  }

  const via = s.mode === 'zklogin' ? 'Google' : t('g_sui_via_wallet');
  html += `<div class="ap-note">👛 ${_short(s.address)}（${via}）<a href="#" id="sui-dc" style="color:#88a;float:right;">${t('g_sui_disconnect')}</a></div>`;
  html += `<div class="ap-section">${t('g_sui_mint_gear')}</div>`;
  html += `<div class="ap-btnrow">`;
  for (const [slot, key] of [['head', 'g_ap_head'], ['body', 'g_ap_torso'], ['arms', 'g_ap_arms'], ['legs', 'g_ap_legs'], ['cape', 'g_ap_cape']]) {
    html += `<button class="dbg-btn sui-mintgear" data-slot="${slot}" style="background:#2a4a2a;padding:3px 0;font-size:10px;">${t(key)}</button>`;
  }
  html += `</div>`;
  html += `<div id="sui-mint-stat" class="ap-note"></div>`;
  html += `<button class="dbg-btn" id="sui-heroimg" style="background:#3a2a5a;">${t('g_sui_heroimg')}</button>`;

  html += `<div class="ap-section">${t('g_sui_my_nfts', { n: s.cosmetics.length })}</div>`;
  if (!s.cosmetics.length) {
    html += `<div class="ap-note">${t('g_sui_none')}</div>`;
  } else {
    html += `<div style="display:flex;flex-direction:column;gap:3px;max-height:150px;overflow-y:auto;">`;
    for (const c of s.cosmetics) {
      const col = RARITY_COLOR[c.rarity] || '#9aa0a8';
      const img = c.image
        ? `<img src="${c.image}" width="34" height="34" style="border-radius:4px;object-fit:cover;background:#111;" loading="lazy">`
        : `<span style="font-size:16px;">🎽</span>`;
      html += `<div style="display:flex;align-items:center;gap:6px;padding:3px 5px;background:#1a2030;border-radius:4px;border-left:3px solid ${col};">
        ${img}
        <span style="flex:1;font-size:11px;">${c.name || c.variant}<br><span style="color:${col};font-size:9px;">${RARITY_NAME[c.rarity] || ''} · ${c.slot} · Walrus ✓</span></span>
        <button class="sui-recolor dbg-btn" data-id="${c.id}" title="${t('g_sui_recolor_title')}" style="width:auto;margin:0;padding:2px 6px;font-size:10px;">🎨</button>
        <button class="sui-equip dbg-btn" data-id="${c.id}" style="width:auto;margin:0;padding:2px 8px;font-size:10px;">${t('g_sui_equip')}</button>
      </div>`;
    }
    html += `</div>`;
  }

  _root.innerHTML = html;
  _root.querySelector('#sui-dc')?.addEventListener('click', e => { e.preventDefault(); disconnectWallet(); setSuiAddress(null); });
  _root.querySelectorAll('.sui-mintgear').forEach(b => b.addEventListener('click', () => _mintGear(b.dataset.slot)));
  _root.querySelector('#sui-heroimg')?.addEventListener('click', _updateHeroImg);
  _root.querySelectorAll('.sui-equip').forEach(b => b.addEventListener('click', () => _equip(b.dataset.id)));
  _root.querySelectorAll('.sui-recolor').forEach(b => b.addEventListener('click', () => _recolor(b.dataset.id, b)));
}

async function _connect() {
  const btn = _root.querySelector('#sui-connect');
  if (btn) { btn.textContent = t('g_sui_connecting'); btn.disabled = true; }
  try { setSuiAddress(await connectWallet()); }
  catch (e) { alert(t('g_sui_connect_fail') + e.message); _render(); }
}

async function _google() {
  try { await connectZkLogin(); }   // 整頁跳轉至 Google，回來由 initSui 完成
  catch (e) { alert(t('g_sui_google_fail') + e.message); }
}

async function _mintGear(slot) {
  const stat = _root.querySelector('#sui-mint-stat');
  if (stat) stat.textContent = t('g_sui_minting');
  try {
    await mintGearPiece({
      appearance, slot, previewDataUrl: capturePreviewDataURL(),
      onProgress: m => { if (stat) stat.textContent = m; },
    });
    if (stat) stat.textContent = t('g_sui_minted');
  } catch (e) {
    alert(t('g_sui_mint_fail') + e.message);
    if (stat) stat.textContent = '';
  }
  _render();
}

async function _equip(id) {
  const item = suiState.cosmetics.find(c => c.id === id);
  if (!item) return;
  // 逐件 Gear NFT：直接把該部位換成此 NFT 的 variant（不需讀 Walrus）
  if (['head', 'body', 'arms', 'legs', 'cape', 'weapon'].includes(item.slot)) {
    equipGearPiece(item.slot, item.variant, id);
    _onEquip?.();
    return;
  }
  // 舊的整套 loadout NFT：從 Walrus 讀回完整造型
  const stat = _root.querySelector('#sui-mint-stat');
  if (stat) stat.textContent = t('g_sui_reading');
  const cfg = await loadCosmeticConfig(item);
  if (!cfg) { if (stat) stat.textContent = t('g_sui_read_fail'); return; }
  equipLoadout(cfg, id);
  _onEquip?.();
  if (stat) stat.textContent = '';
}

async function _updateHeroImg() {
  const stat = _root.querySelector('#sui-mint-stat');
  const png = capturePreviewDataURL();   // 截外觀面板的角色預覽
  if (!png) { if (stat) stat.textContent = '⚠'; return; }
  if (stat) stat.textContent = t('g_sui_minting');
  const ok = await setHeroImage(png);
  if (stat) stat.textContent = ok ? t('g_sui_minted') : t('g_sui_mint_fail');
}

async function _recolor(id, btn) {
  btn.disabled = true; btn.textContent = '…';
  try { await recolorCosmetic(id, appearance.tint); }
  catch (e) { alert(t('g_sui_recolor_fail') + e.message); }
  _render();
}
