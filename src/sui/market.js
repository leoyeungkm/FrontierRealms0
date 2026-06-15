// ─── 預測市場 client（B3：CPMM AMM 即時買/賣）──────────────────
// 讀即時價（reserve 比 → 機率%）、買/賣份額、redeem。對應 fr0::market。
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, MARKET_ID, suiEnabled } from './config.js';
import { suiClient, suiState, executeTx } from './wallet.js';

const MIST = 1_000_000_000;
export const toSui = m => m / MIST;

let _market = MARKET_ID;
export function setActiveMarket(id) { if (id) _market = id; }
export function activeMarket() { return _market; }

/** 讀市場：{ ra, rb, priceA, priceB, resolved, winner, round, tableA, tableB } */
export async function getMarket(id = _market) {
  if (!suiEnabled() || !id) return null;
  const o = await suiClient.getObject({ id, options: { showContent: true } });
  const f = o.data?.content?.fields;
  if (!f) return null;
  const ra = Number(f.ra), rb = Number(f.rb), tot = ra + rb || 1;
  return {
    id, round: Number(f.round), resolved: f.resolved, winner: Number(f.winner),
    ra, rb, priceA: rb / tot, priceB: ra / tot,
    tableA: f.bal_a?.fields?.id?.id, tableB: f.bal_b?.fields?.id?.id,
  };
}

/** 我在此市場的持倉份額 { a, b }（讀 Table 動態欄位）*/
export async function getMyShares(mkt) {
  if (!suiState.address || !mkt) return { a: 0, b: 0 };
  const read = async (tableId) => {
    if (!tableId) return 0;
    try {
      const r = await suiClient.getDynamicFieldObject({ parentId: tableId, name: { type: 'address', value: suiState.address } });
      const v = r.data?.content?.fields?.value;
      return v ? Number(v) : 0;
    } catch { return 0; }
  };
  return { a: await read(mkt.tableA), b: await read(mkt.tableB) };
}

/** 買入 outcome（0=Minas 1=Calaadia）份額，付 amountSui */
export async function buy(outcome, amountSui) {
  if (!suiState.connected) throw new Error('請先登入');
  const amt = Math.round(amountSui * MIST);
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [amt]);
  tx.moveCall({ target: `${PACKAGE_ID}::market::buy`, arguments: [tx.object(_market), tx.pure.u8(outcome), coin] });
  return executeTx(tx);
}

/** 賣出 outcome 份額換回 SUI */
export async function sell(outcome, shares) {
  if (!suiState.connected) throw new Error('請先登入');
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE_ID}::market::sell`, arguments: [tx.object(_market), tx.pure.u8(outcome), tx.pure.u64(Math.round(shares))] });
  return executeTx(tx);
}

/** 兌付（結算後勝方份額 1:1）*/
export async function redeem(marketId = _market) {
  if (!suiState.connected) throw new Error('請先登入');
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE_ID}::market::redeem`, arguments: [tx.object(marketId)] });
  return executeTx(tx);
}
