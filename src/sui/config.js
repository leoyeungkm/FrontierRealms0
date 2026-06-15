// ─── Sui 設定（Sui Overflow 2026）─────────────────────────────
// 部署合約後把 scripts/deploy 輸出的 packageId 填進來。
// PACKAGE_ID 為空字串 → 鏈上功能自動停用，遊戲照常單機/連線跑（優雅降級）。

// .env 的 VITE_FR0_PACKAGE_ID 優先；否則用已部署的 testnet 合約（下方預設）
const ENV = (import.meta.env && import.meta.env.VITE_FR0_PACKAGE_ID) || '';
export const SUI_NETWORK = (import.meta.env && import.meta.env.VITE_FR0_SUI_NETWORK) || 'testnet';
// 已部署：Sui testnet（Sui Overflow 2026）
export const PACKAGE_ID = ENV || '0xa0089188ec828755a5026a37d5fe839487168eed97e74854358e580a0f595392';

export const COSMETIC_TYPE = () => (PACKAGE_ID ? `${PACKAGE_ID}::cosmetic::Cosmetic` : '');
export const suiEnabled = () => PACKAGE_ID.length > 2;

export const NO_TINT = 0xFFFFFFFF;

// 外觀面板每個 gear 欄位的可鑄造稀有度 / 顯示名（slot→variant→meta）
// rarity：0 普通 1 稀有 2 史詩 3 傳說
export const COSMETIC_META = {
  head: { label: '頭部', icon: '🪖' },
  body: { label: '身體', icon: '🛡️' },
  arms: { label: '手部', icon: '🧤' },
  legs: { label: '腳部', icon: '👢' },
  cape: { label: '披風', icon: '🧣' },
};

/** 依 variant 給個粗略稀有度（hood/特殊染色更稀有，純展示用） */
export function rarityOf(slot, variant, tint) {
  if (tint != null && tint !== NO_TINT) return 2;       // 自訂染色 = 史詩
  if (variant === 'hood' || variant === 'rogue') return 1;
  return 0;
}

export const RARITY_NAME = ['普通', '稀有', '史詩', '傳說'];
export const RARITY_COLOR = ['#9aa0a8', '#4f9ae0', '#a86ad8', '#dec06a'];
