// ─── Gear 市場 client（玩家把裝備 NFT 上架 / 購買 / 下架）──────────
// 對應 fr0::gearmarket（泛型 Listing<T>）；這裡固定操作 cosmetic Gear。
import { Transaction } from '@mysten/sui/transactions';
import { GEARMARKET_PACKAGE_ID, COSMETIC_TYPE, gmEnabled, SUI_NETWORK } from './config.js';
import { suiClient, suiState, executeTx } from './wallet.js';

const MIST = 1_000_000_000;

/** 上架一件 Gear，售價 priceSui */
export async function listGear(gearId, priceSui) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${GEARMARKET_PACKAGE_ID}::gearmarket::list`,
    typeArguments: [COSMETIC_TYPE()],
    arguments: [tx.object(gearId), tx.pure.u64(Math.round(priceSui * MIST))],
  });
  return executeTx(tx);
}

/** 購買掛單（付 priceSui） */
export async function buyGear(listingId, priceSui) {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [Math.round(priceSui * MIST)]);
  tx.moveCall({
    target: `${GEARMARKET_PACKAGE_ID}::gearmarket::buy`,
    typeArguments: [COSMETIC_TYPE()],
    arguments: [tx.object(listingId), coin],
  });
  return executeTx(tx);
}

/** 下架（賣家取回） */
export async function delistGear(listingId) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${GEARMARKET_PACKAGE_ID}::gearmarket::delist`,
    typeArguments: [COSMETIC_TYPE()],
    arguments: [tx.object(listingId)],
  });
  return executeTx(tx);
}

/** 取得目前所有活躍掛單（用 Listed 事件找 → 仍存在者為活躍） */
export async function fetchListings() {
  if (!gmEnabled()) return [];
  try {
    const res = await suiClient.queryEvents({
      query: { MoveEventType: `${GEARMARKET_PACKAGE_ID}::gearmarket::Listed` },
      order: 'descending', limit: 50,
    });
    const out = [], seen = new Set();
    for (const ev of res.data || []) {
      const id = ev.parsedJson?.id;
      if (!id || seen.has(id)) continue; seen.add(id);
      try {
        const o = await suiClient.getObject({ id, options: { showContent: true } });
        const f = o.data?.content?.fields;
        if (!f) continue;                              // 已售出 / 下架 → 物件不存在
        const item = f.item?.fields || {};
        out.push({
          id, seller: f.seller, price: Number(f.price) / MIST,
          name: item.name || item.variant || 'Gear', slot: item.slot || '',
          image: item.image_url || '', rarity: Number(item.rarity) || 0,
        });
      } catch { /* 已售出 / 下架 */ }
    }
    return out;
  } catch (e) { console.warn('fetchListings 失敗：', e.message); return []; }
}

export const suiscanObject = (id) => `https://suiscan.xyz/${SUI_NETWORK}/object/${id}`;
