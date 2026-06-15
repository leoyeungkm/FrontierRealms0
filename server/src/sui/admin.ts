// ─── War Bonds 伺服器結算（server 當預測市場的 oracle）────────────
// 伺服器是「誰贏」的權威：回合結束 → 用管理金鑰簽 warbond::settle 上鏈，
// 再開新一場。金鑰只從環境變數讀，絕不進 repo。
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const NETWORK = (process.env.FR0_SUI_NETWORK as any) || 'testnet';
const PACKAGE_ID  = process.env.FR0_PACKAGE_ID || '';
const WARBOND_CAP = process.env.FR0_WARBOND_CAP || '';   // warbond AdminCap object id
const ADMIN_SECRET = process.env.FR0_ADMIN_SECRET || ''; // suiprivkey... (bech32)
let WAR_ID = process.env.FR0_WAR_ID || '';
const FEE_BPS = Number(process.env.FR0_WARBOND_FEE_BPS || 200);

const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
let keypair: Ed25519Keypair | null = null;
try {
  if (ADMIN_SECRET) keypair = Ed25519Keypair.fromSecretKey(ADMIN_SECRET);
} catch (e) {
  console.warn('[warbond] FR0_ADMIN_SECRET 無效，自動結算停用：', (e as Error).message);
}

export function warbondEnabled(): boolean {
  return !!(PACKAGE_ID && WARBOND_CAP && WAR_ID && keypair);
}
export function currentWarId(): string { return WAR_ID; }

/** 結算當前 War（winner: 0=Minas / 1=Calaadia）→ 成功與否 */
export async function settleWar(winner: number): Promise<boolean> {
  if (!warbondEnabled()) return false;
  try {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::warbond::settle`,
      arguments: [tx.object(WARBOND_CAP), tx.object(WAR_ID), tx.pure.u8(winner)],
    });
    await client.signAndExecuteTransaction({ signer: keypair!, transaction: tx });
    console.log(`[warbond] settled war ${WAR_ID} winner=${winner}`);
    return true;
  } catch (e) {
    console.error('[warbond] settle 失敗：', (e as Error).message);
    return false;
  }
}

/** 開新一場 War → 回傳新 War id（並設為當前場）；失敗回 null */
export async function openWar(round: number): Promise<string | null> {
  if (!PACKAGE_ID || !WARBOND_CAP || !keypair) return null;
  try {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::warbond::open_war`,
      arguments: [tx.object(WARBOND_CAP), tx.pure.u64(round), tx.pure.u64(FEE_BPS)],
    });
    const res = await client.signAndExecuteTransaction({
      signer: keypair!, transaction: tx, options: { showObjectChanges: true },
    });
    const created = (res.objectChanges || []).find(
      (o: any) => o.type === 'created' && o.objectType?.endsWith('::warbond::War'));
    if (created) { WAR_ID = (created as any).objectId; console.log('[warbond] opened war', WAR_ID); return WAR_ID; }
    return null;
  } catch (e) {
    console.error('[warbond] open_war 失敗：', (e as Error).message);
    return null;
  }
}
