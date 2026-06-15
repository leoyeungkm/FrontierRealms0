// ─── 多語系（中/英）────────────────────────────────────────────
// 用法：HTML 元素加 data-i18n="key" → textContent 自動套用；
// 動態文字用 t('key', {vars})。語言存 localStorage，可擴充到遊戲內 HUD。

const DICT = {
  en: {
    tagline: 'Five kingdoms wage war for the realm · Powered by Sui & Walrus',
    sec_signin: 'Ⅰ · Enter the realm',
    btn_google: 'Sign in with Google',
    btn_wallet: 'Connect Sui Wallet',
    btn_guest: 'Enter as guest',
    status_default: 'Not signed in — play as guest, or sign in to own your gear on-chain.',
    status_signing_g: 'Redirecting to Google…',
    status_signing_w: 'Connecting wallet…',
    status_guest: 'Guest mode — you can sign in later from the wardrobe (O).',
    status_fail_g: 'Google sign-in failed: ',
    status_fail_w: 'Connection failed: ',
    status_in: 'Signed in {addr} ({via})',
    via_google: 'Google', via_wallet: 'Wallet',
    sec_pledge: 'Ⅱ · Pledge your kingdom',
    tomap_disabled: 'Choose a kingdom first',
    tomap_ready: 'Pledge to {name} → World Map',
    map_label: 'AELORIA · Five kingdoms at war',
    allegiance: 'Allegiance: {name} — tap the central front to deploy',
    enter_connecting: 'Linking to the front…',
    enter_online: 'To War  ·  {n} online',
    enter_offline: 'To War  ·  solo skirmish',
    back: '← Back',
    hint: 'On-chain assets are managed in the wardrobe (O). Guests can play first.',
  },
  zh: {
    tagline: '五王國爭奪領域霸權 · 由 Sui 與 Walrus 驅動',
    sec_signin: '壹 · 進入領域',
    btn_google: '用 Google 登入',
    btn_wallet: '連接 Sui 錢包',
    btn_guest: '以訪客進入',
    status_default: '未登入 — 可用訪客身分遊玩，登入後外觀與資產上鏈。',
    status_signing_g: '前往 Google 登入…',
    status_signing_w: '連接錢包中…',
    status_guest: '訪客模式 — 之後仍可在外觀面板（O）登入。',
    status_fail_g: 'Google 登入失敗：',
    status_fail_w: '連接失敗：',
    status_in: '已登入 {addr}（{via}）',
    via_google: 'Google', via_wallet: '錢包',
    sec_pledge: '貳 · 宣誓效忠的王國',
    tomap_disabled: '請先宣誓王國',
    tomap_ready: '效忠 {name} → 前往世界地圖',
    map_label: 'AELORIA · 五王國交戰',
    allegiance: '效忠王國：{name} — 點中央戰線出征',
    enter_connecting: '連接戰線中…',
    enter_online: '出征  ·  在線 {n}',
    enter_offline: '出征  ·  單機試煉',
    back: '← 返回',
    hint: '鏈上資產在外觀面板（O）操作；訪客可先試玩。',
  },
};

let _lang = localStorage.getItem('fr0_lang') || ((navigator.language || '').startsWith('zh') ? 'zh' : 'en');
if (!DICT[_lang]) _lang = 'en';

export function getLang() { return _lang; }

export function t(key, vars) {
  let s = (DICT[_lang] && DICT[_lang][key]) ?? (DICT.en[key] ?? key);
  if (vars) for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
  return s;
}

/** 套用所有 [data-i18n] 元素的文字 */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
}

const _listeners = [];
export function onLangChange(cb) { _listeners.push(cb); }

export function setLang(l) {
  if (!DICT[l] || l === _lang) return;
  _lang = l;
  localStorage.setItem('fr0_lang', l);
  applyI18n();
  for (const cb of _listeners) { try { cb(l); } catch { /* noop */ } }
}

export function toggleLang() { setLang(_lang === 'zh' ? 'en' : 'zh'); }
