// ─── 角色(Hero NFT)+ 等級系統(FEZ 式，上限 40 級)──────────────
// Hero = owned、可在 NFT 市場交易的角色 NFT(身分 + 等級)。造形由另外鑄造的
// Gear(cosmetic)逐件裝備而成 —— Hero 本身不存造形。
// 等級「只給技能點」(HP/傷害全員一致 → PvP 平衡)；升級用 server 簽章 apply_xp
// (合約 ed25519 驗章)防作弊。未部署 / 未連錢包 → 優雅降級為本地角色。
// 對外維持原本的函式名（getMyCharacter / createCharacter…），呼叫端不需改。
import { Transaction } from '@mysten/sui/transactions';
import { HERO_PACKAGE_ID, HERO_CONFIG_ID, heroEnabled } from './config.js';
import { suiClient, suiState, executeTx } from './wallet.js';
import { storeDataUrl, blobUrl } from './walrus.js';

export const MAX_LEVEL = 40;
const LS = 'fr0_character';

/** 升到 (lv+1) 所需累積 XP(與合約 level_for_xp 一致：50*lv*(lv+1)) */
export function levelForXp(xp) {
  let lv = 1;
  while (lv < MAX_LEVEL && xp >= 50 * lv * (lv + 1)) lv++;
  return lv;
}
export function xpForNextLevel(level) { return level >= MAX_LEVEL ? null : 50 * level * (level + 1); }

/** 等級 → 可用技能點(平衡曲線：lv1=9 … lv32 起封頂 40) */
export function skillPointsForLevel(level) { return Math.min(40, 8 + Math.max(1, level)); }

export function loadCharacter() {
  try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; }
}
function saveCharacter(c) { try { localStorage.setItem(LS, JSON.stringify(c)); } catch { /* noop */ } }
export function clearCharacter() { try { localStorage.removeItem(LS); } catch { /* noop */ } }

// ── 待結算（玩家錯過戰後結算面板時，可在世界地圖角色卡補領彩金 / 補升級）──
const PLS = 'fr0_pending';
export function loadPending() { try { return JSON.parse(localStorage.getItem(PLS) || '{}'); } catch { return {}; } }
function _savePending(p) { try { localStorage.setItem(PLS, JSON.stringify(p)); } catch { /* noop */ } }
export function setPendingXp(xp) { const p = loadPending(); p.xp = xp; _savePending(p); }
export function clearPendingXp() { const p = loadPending(); delete p.xp; _savePending(p); }
export function addPendingRedeem(mktId) { const p = loadPending(); p.redeem = p.redeem || []; if (mktId && !p.redeem.includes(mktId)) p.redeem.push(mktId); _savePending(p); }
export function removePendingRedeem(mktId) { const p = loadPending(); p.redeem = (p.redeem || []).filter(m => m !== mktId); _savePending(p); }

function _heroFromFields(id, f, addr) {
  return {
    name: f.name, nation: Number(f.nation), level: Number(f.level), xp: Number(f.xp),
    nftId: id, onchain: true, addr,
  };
}

/** 查擁有者的 Hero NFT(owned → 直接 getOwnedObjects，可靠) */
async function _findHeroOnChain(address) {
  if (!heroEnabled() || !address) return null;
  try {
    const page = await suiClient.getOwnedObjects({
      owner: address,
      filter: { StructType: `${HERO_PACKAGE_ID}::hero::Hero` },
      options: { showContent: true },
    });
    for (const o of page.data || []) {
      const f = o.data?.content?.fields;
      if (f) return _heroFromFields(o.data.objectId, f, address);
    }
  } catch (e) { console.warn('查 Hero 失敗：', e.message); }
  return null;
}

/** 取目前帳號的角色：本地快取優先；缺少/換帳號/本地非鏈上 → 查鏈上 Hero；有 nftId 則刷新等級。 */
export async function getMyCharacter() {
  let c = loadCharacter();
  const addr = suiState.address;
  const stale = !!(c && addr && c.addr && c.addr !== addr);
  if ((!c || stale || !c.nftId) && addr && heroEnabled()) {
    const oc = await _findHeroOnChain(addr);
    if (oc) { saveCharacter(oc); return oc; }
    if (stale) return null;
  }
  if (!c) return null;
  if (c.nftId && heroEnabled()) {
    try {
      const o = await suiClient.getObject({ id: c.nftId, options: { showContent: true } });
      const f = o.data?.content?.fields;
      if (f) { c.level = Number(f.level); c.xp = Number(f.xp); c.nation = Number(f.nation); c.name = f.name ?? c.name; saveCharacter(c); }
    } catch { /* 鏈上讀取失敗：保留本地 */ }
  }
  return c;
}

/** 列出此帳號所有 Hero NFT（角色選擇畫面用） */
export async function listMyHeroes() {
  const addr = suiState.address;
  if (!addr || !heroEnabled()) return [];
  try {
    const page = await suiClient.getOwnedObjects({
      owner: addr, filter: { StructType: `${HERO_PACKAGE_ID}::hero::Hero` }, options: { showContent: true },
    });
    return (page.data || []).map(o => {
      const f = o.data?.content?.fields;
      return f ? { name: f.name, nation: Number(f.nation), level: Number(f.level), xp: Number(f.xp), image: f.image_url || '', nftId: o.data.objectId, onchain: true, addr } : null;
    }).filter(Boolean);
  } catch (e) { console.warn('列出 Hero 失敗：', e.message); return []; }
}

/** 設定目前使用的角色（寫本地快取，getMyCharacter / 名牌 / 升級都讀這個） */
export function setActiveCharacter(hero) { if (hero) saveCharacter(hero); }

async function _findCreatedHero(digest) {
  if (!digest) return null;
  try {
    await suiClient.waitForTransaction({ digest });
    const tb = await suiClient.getTransactionBlock({ digest, options: { showObjectChanges: true } });
    const created = (tb.objectChanges || []).find(
      o => o.type === 'created' && String(o.objectType).endsWith('::hero::Hero'));
    return created ? created.objectId : null;
  } catch { return null; }
}

/** 建立角色：把造形預覽圖存 Walrus → mint Hero(owned、可交易，含圖供 NFT 市場顯示)。 */
export async function createCharacter({ name, nation, appearance, previewDataUrl }) {
  const c = {
    name: (name || 'Warrior').slice(0, 24), nation: Number(nation) || 0,
    level: 1, xp: 0, appearance: appearance || 'knight',
    nftId: null, onchain: false, image: '', addr: suiState.address || null,
  };
  if (heroEnabled() && suiState.connected) {
    let imageUrl = '';
    if (previewDataUrl) {
      try { imageUrl = blobUrl(await storeDataUrl(previewDataUrl)); }   // 預覽圖上 Walrus
      catch (e) { console.warn('Walrus 上傳預覽失敗：', e.message); }
    }
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${HERO_PACKAGE_ID}::hero::mint_hero`,
        arguments: [tx.pure.string(c.name), tx.pure.u8(c.nation), tx.pure.string(imageUrl)],
      });
      const r = await executeTx(tx);
      c.nftId = await _findCreatedHero(r?.digest);
      c.onchain = !!c.nftId;
      c.image = imageUrl;
    } catch (e) { console.warn('Hero 上鏈失敗，改用本地：', e.message); }
  }
  saveCharacter(c);
  return c;
}

/** 更新 Hero NFT 的造形預覽圖（存 Walrus → set_image）；修正空圖 / 換裝後同步市場顯示。 */
export async function setHeroImage(previewDataUrl) {
  const c = loadCharacter();
  if (!c?.nftId || !heroEnabled() || !suiState.connected || !previewDataUrl) return false;
  try {
    const imageUrl = blobUrl(await storeDataUrl(previewDataUrl));
    const tx = new Transaction();
    tx.moveCall({
      target: `${HERO_PACKAGE_ID}::hero::set_image`,
      arguments: [tx.object(c.nftId), tx.pure.string(imageUrl)],
    });
    await executeTx(tx);
    c.image = imageUrl; saveCharacter(c);
    return true;
  } catch (e) { console.warn('set_image 失敗：', e.message); return false; }
}

/** server 簽章升級：用 server 給的 (amount, nonce, sig:Uint8Array) 送 apply_xp 上鏈。 */
export async function applyXp(amount, nonce, sig) {
  const c = loadCharacter();
  if (!c?.nftId || !heroEnabled() || !suiState.connected) return false;
  try {
    const tx = new Transaction();
    tx.moveCall({
      target: `${HERO_PACKAGE_ID}::hero::apply_xp`,
      arguments: [
        tx.object(HERO_CONFIG_ID), tx.object(c.nftId),
        tx.pure.u64(amount), tx.pure.u64(nonce), tx.pure.vector('u8', Array.from(sig)),
      ],
    });
    await executeTx(tx);
    return true;
  } catch (e) { console.warn('apply_xp 失敗：', e.message); return false; }
}

/** 更新本地等級/XP 快取(顯示用；權威值在鏈上 Hero)。 */
export function setCharacterProgress(level, xp) {
  const c = loadCharacter(); if (!c) return null;
  if (level != null) c.level = Number(level);
  if (xp != null) c.xp = Number(xp);
  saveCharacter(c);
  return c;
}

/** 示範用本地加經驗(僅「純本地角色」生效；鏈上 Hero 一律由 server 簽章升級，防作弊)。 */
export function addLocalXp(amount) {
  const c = loadCharacter();
  if (!c || c.onchain) return null;
  const before = c.level || 1;
  c.xp = (c.xp || 0) + Math.max(0, amount | 0);
  c.level = levelForXp(c.xp);
  saveCharacter(c);
  return { level: c.level, xp: c.xp, leveledUp: c.level > before };
}
