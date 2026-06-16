// ─── Sui 錢包 / 鏈上資產整合層 ───────────────────────────────
// 設計：完全獨立的疊加層。未連錢包時所有函數安全回傳空/拋友善錯誤，
// 遊戲邏輯不依賴任何 Sui 狀態（優雅降級）。
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { getWallets } from '@mysten/wallet-standard';
import { SUI_NETWORK, PACKAGE_ID, COSMETIC_TYPE, suiEnabled, rarityOf, NO_TINT } from './config.js';
import { storeBlob, storeDataUrl, blobUrl, readJson } from './walrus.js';
import { zkEnabled, beginGoogleLogin, tryCompleteZkLogin, restoreZkSession, zkLogout } from './zklogin.js';

const client = new SuiClient({ url: getFullnodeUrl(SUI_NETWORK) });

export const suiState = {
  available: false,   // 有可用的 Sui 錢包
  connected: false,
  mode: null,         // 'wallet' | 'zklogin'
  address: null,
  wallet: null,
  account: null,
  zkSigner: null,     // zkLogin 簽署器（mode==='zklogin' 時）
  zkEnabled: false,   // 是否設定了 Google 登入
  cosmetics: [],      // 持有的 Cosmetic NFT
};

const _listeners = [];
export function onSuiChange(cb) { _listeners.push(cb); }
function _emit() { for (const cb of _listeners) { try { cb(suiState); } catch { /* noop */ } } }

// ── 偵測錢包 ─────────────────────────────────────────────────
function _listSuiWallets() {
  // 放寬：只要支援標準連線 + 任一 Sui 簽章 feature 即視為 Sui 錢包
  //（不卡 chains —— 部分錢包註冊當下 chains 為空，會被舊條件誤排除而「連不到」）
  return getWallets().get().filter(w =>
    w.features['standard:connect'] &&
    (w.features['sui:signTransaction'] || w.features['sui:signAndExecuteTransaction'] || w.features['sui:signAndExecuteTransactionBlock'])
  );
}
function _findSuiWallet() { return _listSuiWallets()[0] || null; }

// 裝了多個 Sui 錢包時，讓使用者自己選（只有一個則直接用）
function _pickWallet(wallets) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(6,8,16,.82);';
    const box = document.createElement('div');
    box.style.cssText = 'background:linear-gradient(180deg,#1a2236,#0d1322);border:1px solid rgba(120,150,210,.35);border-radius:14px;padding:20px;min-width:280px;box-shadow:0 20px 70px rgba(0,0,0,.6);';
    box.innerHTML = '<div style="font:700 15px Cinzel,serif;color:#c9b27a;text-align:center;margin-bottom:14px;">選擇錢包 · Choose wallet</div>';
    wallets.forEach(w => {
      const b = document.createElement('button');
      b.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;margin-bottom:8px;border:1px solid rgba(120,150,210,.25);border-radius:10px;background:rgba(255,255,255,.05);color:#e8eefc;cursor:pointer;font:600 14px Oswald,sans-serif;';
      b.innerHTML = (w.icon ? '<img src="' + w.icon + '" width="24" height="24" style="border-radius:5px">' : '') + '<span>' + w.name + '</span>';
      b.onmouseenter = () => { b.style.background = 'rgba(120,150,210,.2)'; };
      b.onmouseleave = () => { b.style.background = 'rgba(255,255,255,.05)'; };
      b.onclick = () => { try { document.body.removeChild(ov); } catch (e) { /* noop */ } resolve(w); };
      box.appendChild(b);
    });
    const cancel = document.createElement('button');
    cancel.textContent = '取消 · Cancel';
    cancel.style.cssText = 'width:100%;padding:8px;margin-top:4px;border:none;border-radius:8px;background:rgba(120,130,160,.3);color:#cfe0ff;cursor:pointer;font:600 12px Oswald,sans-serif;';
    cancel.onclick = () => { try { document.body.removeChild(ov); } catch (e) { /* noop */ } resolve(null); };
    box.appendChild(cancel);
    ov.appendChild(box);
    ov.onclick = (e) => { if (e.target === ov) { try { document.body.removeChild(ov); } catch (er) { /* noop */ } resolve(null); } };
    document.body.appendChild(ov);
  });
}

export function initSui() {
  if (!suiEnabled()) return;             // 未部署合約 → 不啟用
  suiState.zkEnabled = zkEnabled();
  const refresh = () => {
    suiState.available = !!_findSuiWallet();
    _tryWalletReconnect();          // 重整後自動靜默重連（先前已授權者）
    _emit();
  };
  refresh();
  // 錢包延遲注入（擴充功能載入時機）→ 監聽註冊事件
  try { getWallets().on('register', refresh); } catch { /* noop */ }
  // zkLogin：處理 Google 回跳 / 還原既有 session
  if (zkEnabled()) _initZk();
}

async function _initZk() {
  try {
    const signer = (await tryCompleteZkLogin(client)) || restoreZkSession(client);
    if (signer) {
      suiState.zkSigner = signer;
      suiState.mode = 'zklogin';
      suiState.address = signer.address;
      suiState.connected = true;
      await refreshCosmetics();
      _emit();
    }
  } catch (e) { console.warn('zkLogin 還原失敗：', e.message); }
}

/** 發起 Google zkLogin（整頁跳轉，回來後 initSui 接手完成） */
export async function connectZkLogin() {
  if (!zkEnabled()) throw new Error('未設定 Google 登入（VITE_GOOGLE_CLIENT_ID）');
  await beginGoogleLogin(client);
}

// ── 連線 ─────────────────────────────────────────────────────
export async function connectWallet() {
  if (!suiEnabled()) throw new Error('鏈上功能未啟用（合約尚未部署）');
  const wallets = _listSuiWallets();
  if (!wallets.length) throw new Error('找不到 Sui 錢包，請安裝 Sui Wallet / Slush / Suiet 等瀏覽器擴充功能');
  const wallet = wallets.length === 1 ? wallets[0] : await _pickWallet(wallets);
  if (!wallet) return null;   // 使用者取消選擇
  const res = await wallet.features['standard:connect'].connect();
  const account = (res?.accounts || wallet.accounts)[0];
  if (!account) throw new Error('錢包未授權任何帳號');
  _adoptWallet(wallet, account);
  await refreshCosmetics();
  _emit();
  return suiState.address;
}

/** 套用已連線錢包帳號（互動連線與靜默重連共用），並記旗標供下次自動重連 */
function _adoptWallet(wallet, account) {
  suiState.wallet = wallet;
  suiState.account = account;
  suiState.address = account.address;
  suiState.mode = 'wallet';
  suiState.connected = true;
  try { localStorage.setItem('fr0_wallet', '1'); } catch { /* noop */ }
  // 帳號切換 / 斷線
  try {
    wallet.features['standard:events']?.on('change', () => {
      const a = wallet.accounts[0];
      if (a) { suiState.account = a; suiState.address = a.address; }
      else disconnectWallet();
      _emit();
    });
  } catch { /* noop */ }
}

/** 重整後靜默重連（不彈窗）：先前已授權且有旗標才嘗試 */
let _reconnectTried = false;
async function _tryWalletReconnect() {
  if (_reconnectTried || suiState.connected) return;
  if (localStorage.getItem('fr0_wallet') !== '1') return;
  const wallet = _findSuiWallet();
  if (!wallet) return;             // 擴充尚未注入：register 事件會再次觸發 refresh
  _reconnectTried = true;
  try {
    const res = await wallet.features['standard:connect'].connect({ silent: true });
    const account = (res?.accounts || wallet.accounts)[0];
    if (account) { _adoptWallet(wallet, account); await refreshCosmetics(); _emit(); }
  } catch { /* 靜默失敗：保持未連線，使用者可手動連 */ }
}

export function disconnectWallet() {
  try { suiState.wallet?.features['standard:disconnect']?.disconnect(); } catch { /* noop */ }
  try { localStorage.removeItem('fr0_wallet'); } catch { /* noop */ }
  if (suiState.mode === 'zklogin') zkLogout();
  suiState.connected = false;
  suiState.mode = null;
  suiState.address = null;
  suiState.account = null;
  suiState.wallet = null;
  suiState.zkSigner = null;
  suiState.cosmetics = [];
  _emit();
}

// ── 查詢持有的外觀 NFT ───────────────────────────────────────
export async function refreshCosmetics() {
  if (!suiState.address || !suiEnabled()) { suiState.cosmetics = []; return []; }
  const out = [];
  let cursor = null;
  do {
    const page = await client.getOwnedObjects({
      owner: suiState.address,
      filter: { StructType: COSMETIC_TYPE() },
      options: { showContent: true },
      cursor,
    });
    for (const o of page.data) {
      const f = o.data?.content?.fields;
      if (!f) continue;
      out.push({
        id: o.data.objectId,
        slot: f.slot, variant: f.variant,
        tint: Number(f.tint), name: f.name, rarity: Number(f.rarity),
        image: f.image_url || '',         // Walrus 預覽圖 URL
        walrusBlob: f.walrus_blob || '',  // Walrus loadout 設定 blobId
      });
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  suiState.cosmetics = out;
  return out;
}

// ── 鑄造造型 NFT（完整 loadout + Walrus 去中心化儲存）─────────
// 1. 把預覽 canvas 截圖 PNG 上傳 Walrus → 圖片 blobId
// 2. 把完整造型設定 JSON 上傳 Walrus → 設定 blobId
// 3. mint：NFT 只記 blobId（內容在去中心化儲存，不在我們伺服器）
export async function mintCosmetic({ appearance, previewDataUrl, name, onProgress }) {
  if (!suiState.connected) throw new Error('請先連接錢包');
  const t = (appearance.tint == null) ? NO_TINT : appearance.tint;
  const rarity = rarityOf('loadout', appearance.model, appearance.tint);

  onProgress?.('上傳預覽圖到 Walrus…');
  let imageUrl = '';
  if (previewDataUrl) {
    try {
      const imgBlob = await storeDataUrl(previewDataUrl);
      imageUrl = blobUrl(imgBlob);
    } catch (e) { console.warn('預覽圖上傳失敗，略過：', e.message); }
  }

  onProgress?.('上傳造型資料到 Walrus…');
  // 只存外觀欄位（不含執行期鏈上狀態）
  const cfg = {
    model: appearance.model, head: appearance.head, body: appearance.body,
    arms: appearance.arms, legs: appearance.legs, cape: appearance.cape,
    tint: appearance.tint, gsSkin: appearance.gsSkin,
  };
  const cfgBlob = await storeBlob(JSON.stringify(cfg));

  onProgress?.('鑄造 NFT（請在錢包簽名）…');
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::cosmetic::mint`,
    arguments: [
      tx.pure.string('loadout'),
      tx.pure.string(appearance.model),
      tx.pure.u32(t),
      tx.pure.string(name || `${appearance.model} 造型`),
      tx.pure.string(imageUrl),
      tx.pure.string(cfgBlob),
      tx.pure.u8(rarity),
    ],
  });
  const r = await _signExec(tx);
  await refreshCosmetics();
  _emit();
  return r;
}

// ── 鑄造單件 Gear NFT（每個部位各一個 NFT；slot 對應 cosmetic 的部位）──
export async function mintGearPiece({ appearance, slot, previewDataUrl, onProgress }) {
  if (!suiState.connected) throw new Error('請先連接錢包');
  const variant = slot === 'weapon' ? appearance.gsSkin : appearance[slot];
  if (!variant || variant === 'none') throw new Error('此部位為「無」，不需鑄造');
  const tint = (appearance.tint == null) ? NO_TINT : appearance.tint;
  const rarity = rarityOf(slot, variant, appearance.tint);

  onProgress?.('上傳預覽圖到 Walrus…');
  let imageUrl = '';
  if (previewDataUrl) { try { imageUrl = blobUrl(await storeDataUrl(previewDataUrl)); } catch (e) { console.warn('預覽圖上傳失敗：', e.message); } }
  onProgress?.('上傳設定到 Walrus…');
  const cfgBlob = await storeBlob(JSON.stringify({ slot, variant, tint: appearance.tint }));

  onProgress?.('鑄造 NFT（請在錢包簽名）…');
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::cosmetic::mint`,
    arguments: [
      tx.pure.string(slot), tx.pure.string(String(variant)), tx.pure.u32(tint),
      tx.pure.string(`${variant} ${slot}`), tx.pure.string(imageUrl), tx.pure.string(cfgBlob), tx.pure.u8(rarity),
    ],
  });
  const r = await _signExec(tx);
  await refreshCosmetics();
  _emit();
  return r;
}

/** 從 Walrus 讀回造型 NFT 的完整 loadout 設定 */
export async function loadCosmeticConfig(item) {
  if (!item.walrusBlob) return null;
  try { return await readJson(item.walrusBlob); }
  catch (e) { console.warn('Walrus 讀取造型失敗：', e.message); return null; }
}

// ── 動態 NFT：重新染色 ───────────────────────────────────────
export async function recolorCosmetic(objectId, tint) {
  if (!suiState.connected) throw new Error('請先連接錢包');
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::cosmetic::recolor`,
    arguments: [tx.object(objectId), tx.pure.u32(tint == null ? NO_TINT : tint)],
  });
  const r = await _signExec(tx);
  await refreshCosmetics();
  _emit();
  return r;
}

// ── 簽署登入訊息（server 綁定 address，防偽造 ownership）──────
// zkLogin 模式回傳 null → server 退而用鏈上 ownership 檢查（仍可信，見 verify.ts）
export async function signLogin(nonce) {
  if (!suiState.connected) throw new Error('請先連接錢包');
  if (suiState.mode === 'zklogin') return null;
  const msg = new TextEncoder().encode(`FR0 login: ${nonce}`);
  const feat = suiState.wallet.features['sui:signPersonalMessage'];
  if (!feat) return null;
  const res = await feat.signPersonalMessage({ message: msg, account: suiState.account });
  return { address: suiState.address, signature: res.signature, nonce };
}

// ── 內部：簽署並執行交易（錢包 / zkLogin 二擇一）──────────────
async function _signExec(tx) {
  if (suiState.mode === 'zklogin') {
    return await suiState.zkSigner.signAndExecuteTransaction({ transaction: tx });
  }
  const w = suiState.wallet, acc = suiState.account;
  const chain = `sui:${SUI_NETWORK}`;
  if (w.features['sui:signAndExecuteTransaction']) {
    return await w.features['sui:signAndExecuteTransaction'].signAndExecuteTransaction({
      transaction: tx, account: acc, chain,
    });
  }
  // 舊版 fallback：簽名後用 SuiClient 送出
  const signed = await w.features['sui:signTransaction'].signTransaction({ transaction: tx, account: acc, chain });
  return await client.executeTransactionBlock({
    transactionBlock: signed.bytes, signature: signed.signature,
    options: { showEffects: true },
  });
}

/** 對外：用目前登入模式（錢包 / zkLogin）簽署並執行交易 */
export async function executeTx(tx) { return _signExec(tx); }

export { client as suiClient };
