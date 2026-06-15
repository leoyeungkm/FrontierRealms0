// ─── Sui 鏈上衣櫥 UI（注入外觀面板 O）──────────────────────────
// 連接（錢包 / Google zkLogin）→ 把目前造型鑄成 NFT（預覽圖+設定存 Walrus）
// → 我的造型 NFT（顯示 Walrus 圖、點擊從 Walrus 讀回裝備）→ 🎨 重新染色。
// suiEnabled() 為 false（未部署合約）時整區隱藏，遊戲照常。
import { appearance, equipLoadout, setSuiAddress, capturePreviewDataURL } from './appearance.js';
import { suiEnabled, RARITY_NAME, RARITY_COLOR } from '../sui/config.js';
import {
  suiState, onSuiChange, initSui, connectWallet, connectZkLogin, disconnectWallet,
  mintCosmetic, recolorCosmetic, loadCosmeticConfig,
} from '../sui/wallet.js';

let _root = null, _onEquip = null;

export function initSuiPanel(onEquip) {
  _onEquip = onEquip;
  const panel = document.getElementById('appearance-panel');
  if (!panel || !suiEnabled()) return;

  _root = document.createElement('div');
  _root.id = 'sui-wardrobe';
  panel.appendChild(_root);
  onSuiChange(_render);
  initSui();
  _render();
}

const _short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const _canvas = () => document.getElementById('ap-preview');

function _render() {
  if (!_root) return;
  const s = suiState;
  let html = `<div class="ap-section" style="color:#6fd0ff;border-top:1px solid #335;padding-top:6px;margin-top:8px;">🔗 SUI 鏈上衣櫥 · Walrus</div>`;

  if (!s.connected) {
    html += `<button class="dbg-btn" id="sui-connect">${s.available ? '連接錢包' : '需安裝 Sui 錢包'}</button>`;
    if (s.zkEnabled) html += `<button class="dbg-btn" id="sui-google" style="background:#2a3a5a;">用 Google 登入（zkLogin）</button>`;
    html += `<div class="ap-note">登入後把造型鑄成 NFT，美術與設定存於 Walrus 去中心化儲存、真正歸你所有</div>`;
    _root.innerHTML = html;
    _root.querySelector('#sui-connect')?.addEventListener('click', _connect);
    _root.querySelector('#sui-google')?.addEventListener('click', _google);
    return;
  }

  const via = s.mode === 'zklogin' ? 'Google' : '錢包';
  html += `<div class="ap-note">👛 ${_short(s.address)}（${via}）<a href="#" id="sui-dc" style="color:#88a;float:right;">中斷</a></div>`;
  html += `<button class="dbg-btn" id="sui-mint" style="background:#2a4a2a;">＋ 鑄造目前造型為 NFT</button>`;
  html += `<div id="sui-mint-stat" class="ap-note"></div>`;

  html += `<div class="ap-section">我的造型 NFT（${s.cosmetics.length}）</div>`;
  if (!s.cosmetics.length) {
    html += `<div class="ap-note">尚無——鑄造一套吧</div>`;
  } else {
    html += `<div style="display:flex;flex-direction:column;gap:3px;max-height:150px;overflow-y:auto;">`;
    for (const c of s.cosmetics) {
      const col = RARITY_COLOR[c.rarity] || '#9aa0a8';
      const img = c.image
        ? `<img src="${c.image}" width="34" height="34" style="border-radius:4px;object-fit:cover;background:#111;" loading="lazy">`
        : `<span style="font-size:16px;">🎽</span>`;
      html += `<div style="display:flex;align-items:center;gap:6px;padding:3px 5px;background:#1a2030;border-radius:4px;border-left:3px solid ${col};">
        ${img}
        <span style="flex:1;font-size:11px;">${c.name || c.variant}<br><span style="color:${col};font-size:9px;">${RARITY_NAME[c.rarity] || ''} · Walrus ✓</span></span>
        <button class="sui-recolor dbg-btn" data-id="${c.id}" title="改為目前染色（動態 NFT）" style="width:auto;margin:0;padding:2px 6px;font-size:10px;">🎨</button>
        <button class="sui-equip dbg-btn" data-id="${c.id}" style="width:auto;margin:0;padding:2px 8px;font-size:10px;">穿上</button>
      </div>`;
    }
    html += `</div>`;
  }

  _root.innerHTML = html;
  _root.querySelector('#sui-dc')?.addEventListener('click', e => { e.preventDefault(); disconnectWallet(); setSuiAddress(null); });
  _root.querySelector('#sui-mint')?.addEventListener('click', _mint);
  _root.querySelectorAll('.sui-equip').forEach(b => b.addEventListener('click', () => _equip(b.dataset.id)));
  _root.querySelectorAll('.sui-recolor').forEach(b => b.addEventListener('click', () => _recolor(b.dataset.id, b)));
}

async function _connect() {
  const btn = _root.querySelector('#sui-connect');
  if (btn) { btn.textContent = '連接中…'; btn.disabled = true; }
  try { setSuiAddress(await connectWallet()); }
  catch (e) { alert('連接失敗：' + e.message); _render(); }
}

async function _google() {
  try { await connectZkLogin(); }   // 整頁跳轉至 Google，回來由 initSui 完成
  catch (e) { alert('Google 登入失敗：' + e.message); }
}

async function _mint() {
  const btn = _root.querySelector('#sui-mint');
  const stat = _root.querySelector('#sui-mint-stat');
  btn.disabled = true; btn.textContent = '鑄造中…';
  try {
    await mintCosmetic({
      appearance, previewDataUrl: capturePreviewDataURL(),
      name: `${appearance.model} 造型`,
      onProgress: m => { if (stat) stat.textContent = m; },
    });
    if (stat) stat.textContent = '✅ 已鑄造並存上 Walrus';
  } catch (e) {
    alert('鑄造失敗：' + e.message);
    if (stat) stat.textContent = '';
  }
  _render();
}

async function _equip(id) {
  const item = suiState.cosmetics.find(c => c.id === id);
  if (!item) return;
  const stat = _root.querySelector('#sui-mint-stat');
  if (stat) stat.textContent = '從 Walrus 讀取造型…';
  const cfg = await loadCosmeticConfig(item);   // 從 Walrus 讀回完整 loadout
  if (!cfg) { if (stat) stat.textContent = '⚠ Walrus 讀取失敗'; return; }
  equipLoadout(cfg, id);   // 套用 + 記 objectId
  _onEquip?.();            // 重建模型 + 廣播（含鏈上驗證 payload）
  if (stat) stat.textContent = '';
}

async function _recolor(id, btn) {
  btn.disabled = true; btn.textContent = '…';
  try { await recolorCosmetic(id, appearance.tint); }
  catch (e) { alert('染色失敗：' + e.message); }
  _render();
}
