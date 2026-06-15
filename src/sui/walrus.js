// ─── Walrus 去中心化儲存（Sui Overflow 2026 — Walrus track）────
// 外觀 NFT 的美術(角色預覽 PNG)與造型資料(loadout JSON)存上 Walrus，
// NFT 只記 blobId → 內容不在我們的伺服器，任何人都能從 aggregator 讀回。
// API：PUT {publisher}/v1/blobs?epochs=N 上傳；GET {aggregator}/v1/blobs/{blobId} 讀取。

const ENV = (k, d) => (import.meta.env && import.meta.env[k]) || d;

// 公開 testnet 端點（可用 .env 覆蓋成自架/社群節點）
export const WALRUS_PUBLISHER  = ENV('VITE_WALRUS_PUBLISHER',  'https://publisher.walrus-testnet.walrus.space');
export const WALRUS_AGGREGATOR = ENV('VITE_WALRUS_AGGREGATOR', 'https://aggregator.walrus-testnet.walrus.space');
const STORE_EPOCHS = Number(ENV('VITE_WALRUS_EPOCHS', 5));   // 儲存期數

/** 上傳 bytes / 字串到 Walrus，回傳 blobId（已存在則回傳既有 blobId） */
export async function storeBlob(data, epochs = STORE_EPOCHS) {
  const body = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`, {
    method: 'PUT',
    body,
  });
  if (!res.ok) throw new Error(`Walrus 上傳失敗 (${res.status})`);
  const j = await res.json();
  // 回應有兩種：新建 newlyCreated.blobObject.blobId 或 已認證 alreadyCertified.blobId
  const blobId = j?.newlyCreated?.blobObject?.blobId || j?.alreadyCertified?.blobId;
  if (!blobId) throw new Error('Walrus 回應缺少 blobId');
  return blobId;
}

/** 上傳 dataURL（例如 canvas.toDataURL）→ blobId */
export async function storeDataUrl(dataUrl, epochs = STORE_EPOCHS) {
  const blob = await (await fetch(dataUrl)).blob();
  return storeBlob(new Uint8Array(await blob.arrayBuffer()), epochs);
}

/** blobId → 可直接給 <img>/材質的讀取 URL */
export function blobUrl(blobId) {
  return `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
}

/** 讀回 JSON（造型 loadout） */
export async function readJson(blobId) {
  const res = await fetch(blobUrl(blobId));
  if (!res.ok) throw new Error(`Walrus 讀取失敗 (${res.status})`);
  return res.json();
}
