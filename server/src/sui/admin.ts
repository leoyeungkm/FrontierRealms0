// ─── 預測市場伺服器結算（server 當 oracle）────────────────────
// 回合結束 → 用管理金鑰簽 market::resolve 上鏈，再開新一個市場（種子流動性）。
// 金鑰只從環境變數讀，絕不進 repo。
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const NETWORK = (process.env.FR0_SUI_NETWORK as any) || 'testnet';
const PACKAGE_ID  = process.env.FR0_PACKAGE_ID || '';
const MARKET_CAP  = process.env.FR0_MARKET_CAP || '';      // market AdminCap object id
const ADMIN_SECRET = process.env.FR0_ADMIN_SECRET || '';   // suiprivkey... (bech32)
let MARKET_ID = process.env.FR0_MARKET_ID || '';
const FEE_BPS = Number(process.env.FR0_MARKET_FEE_BPS || 200);
const SEED_MIST = Number(process.env.FR0_MARKET_SEED_MIST || 50_000_000);  // 0.05 SUI 種子

const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
let keypair: Ed25519Keypair | null = null;
try {
  if (ADMIN_SECRET) keypair = Ed25519Keypair.fromSecretKey(ADMIN_SECRET);
} catch (e) {
  console.warn('[market] FR0_ADMIN_SECRET 無效，自動結算停用：', (e as Error).message);
}

export function marketEnabled(): boolean {
  return !!(PACKAGE_ID && MARKET_CAP && MARKET_ID && keypair);
}
export function currentMarketId(): string { return MARKET_ID; }

/** 結算當前市場（winner: 0=Minas / 1=Calaadia）→ 成功與否 */
export async function resolveMarket(winner: number): Promise<boolean> {
  if (!marketEnabled()) return false;
  try {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::market::resolve`,
      arguments: [tx.object(MARKET_CAP), tx.object(MARKET_ID), tx.pure.u8(winner)],
    });
    await client.signAndExecuteTransaction({ signer: keypair!, transaction: tx });
    console.log(`[market] resolved ${MARKET_ID} winner=${winner}`);
    return true;
  } catch (e) {
    console.error('[market] resolve 失敗：', (e as Error).message);
    return false;
  }
}

/** 開新市場（admin 注入種子流動性）→ 回傳新 Market id；失敗回 null */
export async function openMarket(round: number): Promise<string | null> {
  if (!PACKAGE_ID || !MARKET_CAP || !keypair) return null;
  try {
    const tx = new Transaction();
    const [seed] = tx.splitCoins(tx.gas, [SEED_MIST]);
    tx.moveCall({
      target: `${PACKAGE_ID}::market::open_market`,
      arguments: [tx.object(MARKET_CAP), tx.pure.u64(round), seed, tx.pure.u64(FEE_BPS)],
    });
    const res = await client.signAndExecuteTransaction({
      signer: keypair!, transaction: tx, options: { showObjectChanges: true },
    });
    const created = (res.objectChanges || []).find(
      (o: any) => o.type === 'created' && o.objectType?.endsWith('::market::Market'));
    if (created) { MARKET_ID = (created as any).objectId; console.log('[market] opened', MARKET_ID); return MARKET_ID; }
    return null;
  } catch (e) {
    console.error('[market] open_market 失敗：', (e as Error).message);
    return null;
  }
}
