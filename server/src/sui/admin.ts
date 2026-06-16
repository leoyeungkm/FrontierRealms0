// ─── 預測市場伺服器結算（server 當 oracle）────────────────────
// 回合結束 → 用管理金鑰簽 market::resolve 上鏈，再開新一個市場（種子流動性）。
// 金鑰只從環境變數讀，絕不進 repo。
import "dotenv/config";   // 保證本模組求值（讀 process.env）前 .env 已載入；不依賴 index.ts 的載入時機
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
console.log(`[market] init enabled=${marketEnabled()} (secret=${ADMIN_SECRET ? 'set' : 'EMPTY'} pkg=${!!PACKAGE_ID} mkt=${!!MARKET_ID} cap=${!!MARKET_CAP})`);

/** 結算當前市場（winner: 0=Minas / 1=Calaadia）→ 成功與否 */
export async function resolveMarket(winner: number, _retry = 0): Promise<boolean> {
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
    const msg = (e as Error).message;
    // version race（剛用過 AdminCap）→ 等一下重試；EResolved 等 MoveAbort 不會中這條，直接放棄
    if (_retry < 3 && /unavailable for consumption|needs to be rebuilt|is not available|version/i.test(msg)) {
      await new Promise(r => setTimeout(r, 1500));
      return resolveMarket(winner, _retry + 1);
    }
    console.error('[market] resolve 失敗：', msg);
    return false;
  }
}

/** 查鏈上最新一場的 round（MarketOpened 事件最新一筆）→ 沒有回 0。讓新場 round 真遞增、不重複。 */
async function getLatestRound(): Promise<number> {
  try {
    const r = await client.queryEvents({ query: { MoveEventType: `${PACKAGE_ID}::market::MarketOpened` }, order: 'descending', limit: 1 });
    return Number((r.data?.[0]?.parsedJson as any)?.round) || 0;
  } catch { return 0; }
}

/** 開新市場（admin 注入種子流動性）→ 回傳新 Market id；失敗回 null */
export async function openMarket(round: number, _retry = 0): Promise<string | null> {
  if (!PACKAGE_ID || !MARKET_CAP || !keypair) return null;
  try {
    const r = Math.max(round || 0, (await getLatestRound()) + 1);   // 鏈上最新 round+1：場次編號真遞增、不重複
    const tx = new Transaction();
    const [seed] = tx.splitCoins(tx.gas, [SEED_MIST]);
    tx.moveCall({
      target: `${PACKAGE_ID}::market::open_market`,
      arguments: [tx.object(MARKET_CAP), tx.pure.u64(r), seed, tx.pure.u64(FEE_BPS)],
    });
    const res = await client.signAndExecuteTransaction({
      signer: keypair!, transaction: tx, options: { showObjectChanges: true },
    });
    const created = (res.objectChanges || []).find(
      (o: any) => o.type === 'created' && o.objectType?.endsWith('::market::Market'));
    if (created) { MARKET_ID = (created as any).objectId; console.log('[market] opened', MARKET_ID); return MARKET_ID; }
    return null;
  } catch (e) {
    const msg = (e as Error).message;
    // AdminCap 緊接在 resolve 之後使用 → fullnode 還沒同步新 version（unavailable/needs to be rebuilt）；等一下重試
    if (_retry < 3 && /unavailable for consumption|needs to be rebuilt|is not available|version/i.test(msg)) {
      await new Promise(r => setTimeout(r, 1500));
      return openMarket(round, _retry + 1);
    }
    console.error('[market] open_market 失敗：', msg);
    return null;
  }
}

/** 啟動時確保「當前市場」是未結算的：若 .env 指的市場已 resolved（或查不到）→ 開下一場，
 *  讓世界地圖（即使沒人入場）也永遠看到可下注的最新一輪，而非卡在已結算的舊市場。 */
export async function ensureFreshMarket(): Promise<void> {
  if (!marketEnabled()) return;
  try {
    // 查「鏈上最新一場」（不是 .env 的舊場）：未結算就沿用、已結算才開下一場 → 避免每次重啟都開新的 round=2
    const ev = await client.queryEvents({ query: { MoveEventType: `${PACKAGE_ID}::market::MarketOpened` }, order: 'descending', limit: 1 });
    const latestId = (ev.data?.[0]?.parsedJson as any)?.market;
    if (!latestId) { await openMarket(1); return; }                  // 鏈上沒有任何場 → 開第一場
    const o = await client.getObject({ id: latestId, options: { showContent: true } });
    const f = (o.data?.content as any)?.fields;
    if (!f || f.resolved === true) { await openMarket((Number(f?.round) || 0) + 1); }       // 最新場已結算 → 開下一場
    else { MARKET_ID = latestId; console.log('[market] reuse open market round', f.round, latestId); }   // 最新場未結算 → 沿用
  } catch {
    await openMarket(1);
  }
}
