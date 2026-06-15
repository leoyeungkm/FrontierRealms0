// ─── Sui 鏈上驗證（伺服器權威端）─────────────────────────────
// 1) verifyLogin：驗證玩家簽署的登入訊息 → 綁定 sessionId ↔ Sui 地址（防偽造）
// 2) verifyCosmetics：查鏈確認玩家「真的持有」所裝備的外觀 NFT（鏈為 source of truth）
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';

const NETWORK = (process.env.FR0_SUI_NETWORK as any) || 'testnet';
export const PACKAGE_ID = process.env.FR0_PACKAGE_ID || '';

const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

export function suiEnabled(): boolean { return PACKAGE_ID.length > 2; }

/** 驗證個人訊息簽章；nonce 用該連線的 sessionId（伺服器已知，無法重放他人） */
export async function verifyLogin(address: string, signature: string, nonce: string): Promise<boolean> {
  try {
    const msg = new TextEncoder().encode(`FR0 login: ${nonce}`);
    const pk = await verifyPersonalMessageSignature(msg, signature);
    return pk.toSuiAddress() === address;
  } catch {
    return false;
  }
}

/**
 * 驗證 slot→objectId 確實由 owner 持有、型別為 Cosmetic、且 slot/variant 與宣稱相符。
 * @returns 通過驗證的 slot 清單
 */
export async function verifyCosmetics(
  owner: string,
  items: Record<string, string>,
  expectVariant: Record<string, string>,
): Promise<string[]> {
  const entries = Object.entries(items || {});
  if (!entries.length || !owner) return [];
  const ok: string[] = [];
  try {
    const objs = await client.multiGetObjects({
      ids: entries.map(([, id]) => id),
      options: { showContent: true, showOwner: true, showType: true },
    });
    const byId: Record<string, any> = {};
    for (const o of objs) if (o.data) byId[o.data.objectId] = o.data;
    for (const [slot, id] of entries) {
      const d = byId[id];
      if (!d) continue;
      const ownerAddr = d.owner?.AddressOwner ?? null;
      const fields = d.content?.fields;
      if (
        ownerAddr === owner &&
        d.type === `${PACKAGE_ID}::cosmetic::Cosmetic` &&
        fields?.slot === slot &&
        fields?.variant === expectVariant[slot]
      ) {
        ok.push(slot);
      }
    }
  } catch {
    /* RPC 失敗 → 保守回空（不認證） */
  }
  return ok;
}
