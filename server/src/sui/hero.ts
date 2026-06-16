// ─── Hero 等級結算（server 當 oracle，簽章授權）────────────────
// Hero NFT 是 owned（可交易），server 不能直接改它 → 改用「簽章」：
// server 簽 (hero_id ‖ amount ‖ nonce)，玩家送交易、合約用 ed25519 驗章才加經驗。
// 啟動時把 server 公鑰寫進 Hero Config（持 AdminCap）。金鑰只從環境變數讀。
import "dotenv/config";   // 保證本模組求值（讀 process.env）前 .env 已載入；不依賴 index.ts 的載入時機
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const NETWORK = (process.env.FR0_SUI_NETWORK as any) || 'testnet';
const PACKAGE = process.env.FR0_HERO_PACKAGE || '';
const CONFIG = process.env.FR0_HERO_CONFIG || '';
const CAP = process.env.FR0_HERO_ADMINCAP || '';
const ADMIN_SECRET = process.env.FR0_ADMIN_SECRET || '';

const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
let keypair: Ed25519Keypair | null = null;
try {
  if (ADMIN_SECRET) keypair = Ed25519Keypair.fromSecretKey(ADMIN_SECRET);
} catch (e) {
  console.warn('[hero] FR0_ADMIN_SECRET 無效，等級結算停用：', (e as Error).message);
}

export function heroEnabled(): boolean {
  return !!(PACKAGE && CONFIG && keypair);
}
console.log(`[hero] init enabled=${heroEnabled()} (secret=${ADMIN_SECRET ? 'set' : 'EMPTY'} pkg=${!!PACKAGE} cfg=${!!CONFIG} cap=${!!CAP})`);

// 0x 十六進位 → 32 bytes（hero object id = 32-byte address）
function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, '').padStart(64, '0');
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
  return b;
}
function u64le(n: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(Math.floor(n)), true);
  return b;
}

let _pubkeyEnsured = false;
/** 啟動時把 server 公鑰寫進 Config（合約驗章用）。已設過則略過。 */
export async function ensureServerPubkey(): Promise<void> {
  if (!heroEnabled() || _pubkeyEnsured || !CAP) return;
  _pubkeyEnsured = true;
  try {
    const cfg = await client.getObject({ id: CONFIG, options: { showContent: true } });
    const cur = (cfg.data?.content as any)?.fields?.server_pubkey;
    const isSet = Array.isArray(cur) ? cur.length >= 32 : (typeof cur === 'string' && cur.length > 0);
    if (isSet) return;
    const mine = keypair!.getPublicKey().toRawBytes();
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE}::hero::set_server_pubkey`,
      arguments: [tx.object(CAP), tx.object(CONFIG), tx.pure.vector('u8', Array.from(mine))],
    });
    await client.signAndExecuteTransaction({ signer: keypair!, transaction: tx });
    console.log('[hero] server_pubkey 已寫入 Config');
  } catch (e) {
    console.error('[hero] ensureServerPubkey 失敗：', (e as Error).message);
  }
}

/** 簽一張升級憑證：msg = bcs(hero_id) ‖ bcs(amount) ‖ bcs(nonce)。回 number[] 簽章供 client 用。 */
export async function signXp(heroId: string, amount: number, nonce: number): Promise<number[] | null> {
  if (!heroEnabled() || !heroId) return null;
  try {
    const msg = new Uint8Array(48);
    msg.set(hexToBytes(heroId), 0);
    msg.set(u64le(amount), 32);
    msg.set(u64le(nonce), 40);
    const sig = await keypair!.sign(msg);          // 原始 64-byte ed25519 簽章
    return Array.from(sig);
  } catch (e) {
    console.error('[hero] signXp 失敗：', (e as Error).message);
    return null;
  }
}
