// ─── War Bonds client（parimutuel 押注）────────────────────────
// 讀 War 池子/賠率、押注（付 testnet SUI）、領彩。對應 fr0::warbond 合約。
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, WAR_ID, suiEnabled } from './config.js';
import { suiClient, suiState, executeTx } from './wallet.js';

const MIST = 1_000_000_000;

/** 讀 War 狀態：{ open, settled, winner, pools:[u64], total } */
export async function getWar() {
  if (!suiEnabled() || !WAR_ID) return null;
  const o = await suiClient.getObject({ id: WAR_ID, options: { showContent: true } });
  const f = o.data?.content?.fields;
  if (!f) return null;
  const pools = (f.pools || []).map(Number);
  return {
    round: Number(f.round), open: f.open, settled: f.settled,
    winner: Number(f.winner), pools,
    total: pools.reduce((s, v) => s + v, 0),
  };
}

/** 我持有、屬於當前 War 的債券：[{ id, nation, amount }] */
export async function getMyBonds() {
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
      if (f && f.war === WAR_ID) out.push({ id: o.data.objectId, nation: Number(f.nation), amount: Number(f.amount) });
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
  tx.moveCall({ target: `${PACKAGE_ID}::warbond::bet`, arguments: [tx.object(WAR_ID), tx.pure.u8(nation), coin] });
  return executeTx(tx);
}

/** 領彩：用押中的債券換 SUI */
export async function claimBond(bondId) {
  if (!suiState.connected) throw new Error('請先登入');
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE_ID}::warbond::claim_to_sender`, arguments: [tx.object(WAR_ID), tx.object(bondId)] });
  return executeTx(tx);
}

/** 賠率：押 1 給某國，若該國贏可得多少（含全池，未扣費的概估）*/
export function oddsFor(war, nation) {
  if (!war || !war.pools[nation]) return null;
  return war.total / war.pools[nation];   // ×倍
}

export const toSui = mist => (mist / MIST);
