// ─── War Bonds client（parimutuel 押注）────────────────────────
// 讀 War 池子/賠率、押注（付 testnet SUI）、領彩。對應 fr0::warbond 合約。
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, WAR_ID, suiEnabled } from './config.js';
import { suiClient, suiState, executeTx } from './wallet.js';

const MIST = 1_000_000_000;

// 當前押注場（server 開新場時用 setActiveWar 切換）
let _activeWar = WAR_ID;
export function setActiveWar(id) { if (id) _activeWar = id; }
export function activeWar() { return _activeWar; }

/** 讀 War 狀態：{ open, settled, winner, pools:[u64], total } */
export async function getWar(warId = _activeWar) {
  if (!suiEnabled() || !warId) return null;
  const o = await suiClient.getObject({ id: warId, options: { showContent: true } });
  const f = o.data?.content?.fields;
  if (!f) return null;
  const pools = (f.pools || []).map(Number);
  return {
    round: Number(f.round), open: f.open, settled: f.settled,
    winner: Number(f.winner), pools,
    total: pools.reduce((s, v) => s + v, 0),
  };
}

/** 我持有的債券（warId 過濾，預設當前場）：[{ id, nation, amount, war }] */
export async function getMyBonds(warId = _activeWar) {
  if (!suiState.address) return [];
  const out = [];
  let cursor = null;
  do {
    const page = await suiClient.getOwnedObjects({
      owner: suiState.address,
      filter: { StructType: `${PACKAGE_ID}::warbond::Bond` },
      options: { showContent: true }, cursor,
    });
    for (const o of page.data) {
      const f = o.data?.content?.fields;
      if (f && (!warId || f.war === warId)) out.push({ id: o.data.objectId, nation: Number(f.nation), amount: Number(f.amount), war: f.war });
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return out;
}

/** 押注：nation 索引 0/1，amountSui 例 0.1 */
export async function bet(nation, amountSui) {
  if (!suiState.connected) throw new Error('請先登入');
  const amount = Math.round(amountSui * MIST);
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [amount]);
  tx.moveCall({ target: `${PACKAGE_ID}::warbond::bet`, arguments: [tx.object(_activeWar), tx.pure.u8(nation), coin] });
  return executeTx(tx);
}

/** 領彩：用押中的債券換 SUI（warId 預設當前場；領舊場要帶該場 id） */
export async function claimBond(bondId, warId = _activeWar) {
  if (!suiState.connected) throw new Error('請先登入');
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE_ID}::warbond::claim_to_sender`, arguments: [tx.object(warId), tx.object(bondId)] });
  return executeTx(tx);
}

/** 賠率：押 1 給某國，若該國贏可得多少（含全池，未扣費的概估）*/
export function oddsFor(war, nation) {
  if (!war || !war.pools[nation]) return null;
  return war.total / war.pools[nation];   // ×倍
}

export const toSui = mist => (mist / MIST);
