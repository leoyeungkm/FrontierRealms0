// ─── 角色等級伺服器結算（server 當 oracle）────────────────────
// 回合結束 → 用管理金鑰簽 character::grant_xp 上鏈，加經驗 → 重算等級。
// 金鑰只從環境變數讀，絕不進 repo。未設定則停用（grantXp 直接回 false）。
import "dotenv/config";   // 保證本模組求值（讀 process.env）前 .env 已載入；不依賴 index.ts 的載入時機
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const NETWORK = (process.env.FR0_SUI_NETWORK as any) || 'testnet';
const PACKAGE = process.env.FR0_CHARACTER_PACKAGE || '';
const CAP = process.env.FR0_CHARACTER_CAP || '';            // character AdminCap object id
const ADMIN_SECRET = process.env.FR0_ADMIN_SECRET || '';    // suiprivkey...（與市場結算共用同一把 server 金鑰）

const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
let keypair: Ed25519Keypair | null = null;
try {
  if (ADMIN_SECRET) keypair = Ed25519Keypair.fromSecretKey(ADMIN_SECRET);
} catch (e) {
  console.warn('[character] FR0_ADMIN_SECRET 無效，等級結算停用：', (e as Error).message);
}

export function characterEnabled(): boolean {
  return !!(PACKAGE && CAP && keypair);
}

/** server 授權替某角色加經驗（grant_xp）→ 鏈上重算等級。回成功與否。 */
export async function grantXp(characterId: string, amount: number): Promise<boolean> {
  if (!characterEnabled() || !characterId || amount <= 0) return false;
  try {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE}::character::grant_xp`,
      arguments: [tx.object(CAP), tx.object(characterId), tx.pure.u64(Math.floor(amount))],
    });
    await client.signAndExecuteTransaction({ signer: keypair!, transaction: tx });
    console.log(`[character] grant_xp ${characterId} +${amount}`);
    return true;
  } catch (e) {
    console.error('[character] grant_xp 失敗：', (e as Error).message);
    return false;
  }
}
