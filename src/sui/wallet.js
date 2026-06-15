// ─── Sui 錢包 / 鏈上資產整合層 ───────────────────────────────
// 設計：完全獨立的疊加層。未連錢包時所有函數安全回傳空/拋友善錯誤，
// 遊戲邏輯不依賴任何 Sui 狀態（優雅降級）。
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { getWallets } from '@mysten/wallet-standard';
import { SUI_NETWORK, PACKAGE_ID, COSMETIC_TYPE, suiEnabled, rarityOf, NO_TINT } from './config.js';

const client = new SuiClient({ url: getFullnodeUrl(SUI_NETWORK) });

export const suiState = {
  available: false,   // 有可用的 Sui 錢包
  connected: false,
  address: null,
  wallet: null,
  account: null,
  cosmetics: [],      // 持有的 Cosmetic NFT（{ id, slot, variant, tint, name, rarity }）
};

let _onChange = () => {};
export function onSuiChange(cb) { _onChange = cb; }
function _emit() { _onChange(suiState); }

// ── 偵測錢包 ─────────────────────────────────────────────────
function _findSuiWallet() {
  const wallets = getWallets().get();
  return wallets.find(w =>
    (w.chains || []).some(c => c.startsWith('sui:')) &&
    w.features['standard:connect'] &&
    (w.features['sui:signAndExecuteTransaction'] || w.features['sui:signAndExecuteTransactionBlock'])
  ) || null;
}

export function initSui() {
  if (!suiEnabled()) return;             // 未部署合約 → 不啟用
  const refresh = () => {
    suiState.available = !!_findSuiWallet();
    _emit();
  };
  refresh();
  // 錢包延遲注入（擴充功能載入時機）→ 監聽註冊事件
  try { getWallets().on('register', refresh); } catch { /* noop */ }
}

// ── 連線 ─────────────────────────────────────────────────────
export async function connectWallet() {
  if (!suiEnabled()) throw new Error('鏈上功能未啟用（合約尚未部署）');
  const wallet = _findSuiWallet();
  if (!wallet) throw new Error('找不到 Sui 錢包，請安裝 Sui Wallet 或 Suiet 擴充功能');
  const res = await wallet.features['standard:connect'].connect();
  const account = (res?.accounts || wallet.accounts)[0];
  if (!account) throw new Error('錢包未授權任何帳號');
  suiState.wallet = wallet;
  suiState.account = account;
  suiState.address = account.address;
  suiState.connected = true;
  // 帳號切換 / 斷線
  try {
    wallet.features['standard:events']?.on('change', () => {
      const a = wallet.accounts[0];
      if (a) { suiState.account = a; suiState.address = a.address; }
      else disconnectWallet();
      _emit();
    });
  } catch { /* noop */ }
  await refreshCosmetics();
  _emit();
  return suiState.address;
}

export function disconnectWallet() {
  try { suiState.wallet?.features['standard:disconnect']?.disconnect(); } catch { /* noop */ }
  suiState.connected = false;
  suiState.address = null;
  suiState.account = null;
  suiState.wallet = null;
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
      });
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  suiState.cosmetics = out;
  return out;
}

// ── 鑄造外觀 NFT ─────────────────────────────────────────────
export async function mintCosmetic({ slot, variant, tint, name }) {
  if (!suiState.connected) throw new Error('請先連接錢包');
  const t = (tint == null) ? NO_TINT : tint;
  const rarity = rarityOf(slot, variant, tint);
  const img = `https://placehold.co/256x256/${(t === NO_TINT ? 0x5a7a4e : t).toString(16).padStart(6, '0')}/ffffff?text=${encodeURIComponent(variant + ' ' + slot)}`;
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::cosmetic::mint`,
    arguments: [
      tx.pure.string(slot),
      tx.pure.string(variant),
      tx.pure.u32(t),
      tx.pure.string(name || `${variant} ${slot}`),
      tx.pure.string(img),
      tx.pure.u8(rarity),
    ],
  });
  const r = await _signExec(tx);
  await refreshCosmetics();
  _emit();
  return r;
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
export async function signLogin(nonce) {
  if (!suiState.connected) throw new Error('請先連接錢包');
  const msg = new TextEncoder().encode(`FR0 login: ${nonce}`);
  const feat = suiState.wallet.features['sui:signPersonalMessage'];
  if (!feat) throw new Error('錢包不支援訊息簽署');
  const res = await feat.signPersonalMessage({ message: msg, account: suiState.account });
  return { address: suiState.address, signature: res.signature, nonce };
}

// ── 內部：簽署並執行交易（相容兩種 wallet feature）────────────
async function _signExec(tx) {
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

export { client as suiClient };
