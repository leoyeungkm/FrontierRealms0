// ─── Sui 鏈上衣櫥 UI（注入外觀面板 O）──────────────────────────
// 連接錢包 / 鑄造目前外觀為 NFT / 我的 NFT 清單（點擊裝備）/ 重新染色。
// suiEnabled() 為 false（未部署合約）時整區隱藏，遊戲照常。
import { appearance, equipNftCosmetic, setSuiAddress } from './appearance.js';
import { suiEnabled, COSMETIC_META, RARITY_NAME, RARITY_COLOR, NO_TINT } from '../sui/config.js';
import {
  suiState, onSuiChange, initSui, connectWallet, disconnectWallet,
  mintCosmetic, recolorCosmetic,
} from '../sui/wallet.js';

let _root = null, _onEquip = null;

export function initSuiPanel(onEquip) {
  _onEquip = onEquip;
  const panel = document.getElementById('appearance-panel');
  if (!panel || !suiEnabled()) return;   // 未啟用鏈上 → 不注入

  _root = document.createElement('div');
  _root.id = 'sui-wardrobe';
  panel.appendChild(_root);
  onSuiChange(_render);
  initSui();
  _render();
}

function _short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }

function _render() {
  if (!_root) return;
  const s = suiState;
  let html = `<div class="ap-section" style="color:#6fd0ff;border-top:1px solid #335;padding-top:6px;margin-top:8px;">🔗 SUI 鏈上衣櫥</div>`;

  if (!s.connected) {
    html += `<button class="dbg-btn" id="sui-connect">${s.available ? '連接錢包' : '需安裝 Sui 錢包'}</button>`;
    html += `<div class="ap-note">登入後可把外觀鑄造成 NFT、真正擁有並交易</div>`;
    _root.innerHTML = html;
    _root.querySelector('#sui-connect')?.addEventListener('click', _connect);
    return;
  }

  html += `<div class="ap-note">👛 ${_short(s.address)} <a href="#" id="sui-dc" style="color:#88a;float:right;">中斷</a></div>`;

  // 鑄造目前各部件（讀 appearance 當前選擇）
  html += `<div class="ap-section">鑄造目前部件為 NFT</div><div class="ap-btnrow" style="flex-wrap:wrap;">`;
  for (const slot of ['head', 'body', 'arms', 'legs', 'cape']) {
    const v = appearance[slot];
    if (v === 'none') continue;
    html += `<button class="dbg-btn sui-mint" data-slot="${slot}" style="flex:0 0 auto;padding:3px 7px;" title="${v}">${COSMETIC_META[slot].icon}${COSMETIC_META[slot].label}</button>`;
  }
  html += `</div>`;

  // 我的 NFT 清單
  html += `<div class="ap-section">我的外觀 NFT（${s.cosmetics.length}）</div>`;
  if (!s.cosmetics.length) {
    html += `<div class="ap-note">尚無——先鑄造一件吧</div>`;
  } else {
    html += `<div id="sui-nft-list" style="display:flex;flex-direction:column;gap:3px;max-height:140px;overflow-y:auto;">`;
    for (const c of s.cosmetics) {
      const col = RARITY_COLOR[c.rarity] || '#9aa0a8';
      html += `<div class="sui-nft" data-id="${c.id}" style="display:flex;align-items:center;gap:6px;padding:3px 5px;background:#1a2030;border-radius:4px;border-left:3px solid ${col};cursor:pointer;">
        <span style="font-size:14px;">${COSMETIC_META[c.slot]?.icon || '🎽'}</span>
        <span style="flex:1;font-size:11px;">${c.variant} ${c.slot}<br><span style="color:${col};font-size:9px;">${RARITY_NAME[c.rarity] || ''}</span></span>
        <button class="sui-recolor dbg-btn" data-id="${c.id}" title="改為目前染色（動態 NFT）" style="width:auto;margin:0;padding:2px 6px;font-size:10px;">🎨</button>
        <button class="sui-equip dbg-btn" data-id="${c.id}" style="width:auto;margin:0;padding:2px 8px;font-size:10px;">裝備</button>
      </div>`;
    }
    html += `</div>`;
  }

  _root.innerHTML = html;
  _root.querySelector('#sui-dc')?.addEventListener('click', (e) => { e.preventDefault(); disconnectWallet(); setSuiAddress(null); });
  _root.querySelectorAll('.sui-mint').forEach(b => b.addEventListener('click', () => _mint(b.dataset.slot, b)));
  _root.querySelectorAll('.sui-equip').forEach(b => b.addEventListener('click', () => _equip(b.dataset.id)));
  _root.querySelectorAll('.sui-recolor').forEach(b => b.addEventListener('click', () => _recolor(b.dataset.id, b)));
}

async function _recolor(id, btn) {
  btn.disabled = true; btn.textContent = '…';
  try {
    await recolorCosmetic(id, appearance.tint);   // 改成目前面板的染色（同一個物件變色）
  } catch (e) {
    alert('染色失敗：' + e.message);
  }
  _render();
}

async function _connect() {
  const btn = _root.querySelector('#sui-connect');
  if (btn) { btn.textContent = '連接中…'; btn.disabled = true; }
  try {
    const addr = await connectWallet();
    setSuiAddress(addr);   // 廣播地址給 server（綁定 / 驗證）
  } catch (e) {
    alert('連接失敗：' + e.message);
    _render();
  }
}

async function _mint(slot, btn) {
  const v = appearance[slot];
  btn.disabled = true; btn.textContent = '鑄造中…';
  try {
    await mintCosmetic({ slot, variant: v, tint: appearance.tint, name: `${v} ${slot}` });
  } catch (e) {
    alert('鑄造失敗：' + e.message);
  }
  _render();
}

function _equip(id) {
  const item = suiState.cosmetics.find(c => c.id === id);
  if (!item) return;
  equipNftCosmetic(item);   // 套用到 appearance + 記錄 objectId
  _onEquip?.();             // 重建本地模型 + 廣播（含鏈上驗證 payload）
}
