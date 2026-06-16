// ─── Sui 設定（Sui Overflow 2026）─────────────────────────────
// 部署合約後把 scripts/deploy 輸出的 packageId 填進來。
// PACKAGE_ID 為空字串 → 鏈上功能自動停用，遊戲照常單機/連線跑（優雅降級）。

// .env 的 VITE_FR0_PACKAGE_ID 優先；否則用已部署的 testnet 合約（下方預設）
const ENV = (import.meta.env && import.meta.env.VITE_FR0_PACKAGE_ID) || '';
export const SUI_NETWORK = (import.meta.env && import.meta.env.VITE_FR0_SUI_NETWORK) || 'testnet';
// 已部署：Sui testnet（cosmetic + achievement + warbond + market 同包）
export const PACKAGE_ID = ENV || '0x1712a9d8fcb6a6325a2336156d9257fa4afc5b3b215985edf85750d53ba7d1fd';
// 預測市場（B3 CPMM AMM）：當前可交易的 Market 共享物件
export const MARKET_ID = (import.meta.env && import.meta.env.VITE_FR0_MARKET_ID) || '0x585a99d8d30f146a0612e4d63be52fc0a74628b16b38ee71ed912e037cefde8f';
// 角色 NFT（character.move）獨立部署的 package；空 → 角色走本地（優雅降級）
export const CHARACTER_PACKAGE_ID = (import.meta.env && import.meta.env.VITE_FR0_CHARACTER_PACKAGE) || '0x9b033e1c9eb1c9319ab6a2a35cb5baa38b48f84e2c89716c6bbc74c5beac6b39';
export const characterEnabled = () => CHARACTER_PACKAGE_ID.length > 2;
// Hero NFT（owned、可交易的角色；身分+等級）。Gear 由 cosmetic NFT 另外裝備。
export const HERO_PACKAGE_ID = (import.meta.env && import.meta.env.VITE_FR0_HERO_PACKAGE) || '0xe51bd7edc04b6c101e79ac2438e67a778e2ba821e5fa66353d730a3a4578ab1c';
export const HERO_CONFIG_ID = (import.meta.env && import.meta.env.VITE_FR0_HERO_CONFIG) || '0x0eef570e98739a109377dc593c277ddb99e206c63a50d2932723616892786ef9';
export const heroEnabled = () => HERO_PACKAGE_ID.length > 2;
// Gear 市場（泛型 NFT 掛單買賣）
export const GEARMARKET_PACKAGE_ID = (import.meta.env && import.meta.env.VITE_FR0_GEARMARKET_PACKAGE) || '0x540d5442fb101b77b20ec690d1b3bddb8d8c9a9c4fec794c12a598aa1644c0c0';
export const gmEnabled = () => GEARMARKET_PACKAGE_ID.length > 2;

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
