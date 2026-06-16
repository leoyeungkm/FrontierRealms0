// ─── 場內即時交易 HUD（B）──────────────────────────────────────
// 進遊戲後邊打邊交易：即時市場 %（reserve）+ 雙堡血量 + 買/賣/持倉。
// 城堡血量 = 戰況；市場 % = 交易推出來的隱含機率 → 看戰況翻盤就加碼/平倉。
import { NATIONS } from './intro.js';
import { suiEnabled } from '../sui/config.js';
import { suiState } from '../sui/wallet.js';
import { getMarket, getMyShares, buy, sell, toSui } from '../sui/market.js';
import { t, onLangChange } from './i18n.js';

const TRADE_SUI = 0.1;
let _on = false, _poll = null, _getKeeps = () => ({ hp1: 1, hp2: 1, max: 1 });
let _mkt = null, _mine = { a: 0, b: 0 }, _busy = false;
const hex = c => '#' + c.toString(16).padStart(6, '0');

export function initMarketHud(getKeeps) {
  if (getKeeps) _getKeeps = getKeeps;
  onLangChange(() => { if (_on) _render(); });
}

/** 切換顯示；回傳新狀態（main.js 據此處理鼠標鎖定）*/
export function toggleMarketHud() {
  _on = !_on;
  const el = document.getElementById('market-hud');
  if (!el) return false;
  el.style.display = _on ? 'block' : 'none';
  if (_on) { _refresh(); _poll = setInterval(_refresh, 3000); }
  else { clearInterval(_poll); _poll = null; }
  return _on;
}
export function isMarketHudOpen() { return _on; }

async function _refresh() {
  if (!_on) return;
  // 市場是公開鏈上物件：未登入也讀得到即時 %／戰況；只有「我的持倉」才需要地址。
  // （別把讀市場 gate 在 connected 後面，否則重入未連錢包時 _mkt 永遠是 null → 買鍵全灰）
  if (suiEnabled()) {
    try {
      _mkt = await getMarket();
      _mine = suiState.address ? await getMyShares(_mkt) : { a: 0, b: 0 };
    } catch { /* keep last */ }
  }
  _render();
}

function _render() {
  const el = document.getElementById('market-hud');
  if (!el) return;
  const k = _getKeeps();
  const keepHp = [k.hp1, k.hp2];     // 0=Minas(藍keep1) 1=Calaadia(紅keep2)
  const prices = _mkt ? [_mkt.priceA, _mkt.priceB] : [0.5, 0.5];
  const shares = [_mine.a, _mine.b];

  let html = `<div class="mh-head"><span class="mh-title">${t('mk_title')}</span><span class="mh-x" id="mh-close">✕</span></div>`;

  if (!suiEnabled() || !suiState.connected) {
    html += `<div class="mh-note">${t('wb_login')}</div>`;
  }

  NATIONS.forEach((n, i) => {
    const pct = (prices[i] * 100).toFixed(0);
    const hpPct = Math.max(0, Math.min(100, (keepHp[i] / (k.max || 1)) * 100));
    const tradable = _mkt && !_mkt.resolved && suiState.connected;
    html += `<div class="mh-nation" style="--nc:${hex(n.color)}">
      <div class="mh-top"><span class="mh-name">${n.short}</span><span class="mh-pct">${pct}%</span></div>
      <div class="mh-keeplbl">🏰 ${Math.round(hpPct)}%</div>
      <div class="mh-keep"><div style="width:${hpPct}%"></div></div>
      <div class="mh-btns">
        <button data-buy="${i}" ${tradable ? '' : 'disabled'}>${t('mk_buy', { amt: TRADE_SUI })}</button>
        <button class="mh-sell" data-sell="${i}" ${tradable && shares[i] > 0 ? '' : 'disabled'}>${t('mk_sell')}</button>
      </div>
    </div>`;
  });

  if (shares[0] || shares[1]) {
    html += `<div class="mh-pos">${t('mk_pos', { a: toSui(shares[0]).toFixed(2), b: toSui(shares[1]).toFixed(2) })}</div>`;
  }

  el.innerHTML = html;
  el.querySelector('#mh-close')?.addEventListener('click', () => toggleMarketHud());
  el.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => _trade('buy', Number(b.dataset.buy))));
  el.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => _trade('sell', Number(b.dataset.sell))));
}

async function _trade(kind, outcome) {
  if (_busy) return; _busy = true;
  try {
    if (kind === 'buy') await buy(outcome, TRADE_SUI);
    else await sell(outcome, (outcome === 0 ? _mine.a : _mine.b));
  } catch (e) { console.warn('trade failed', e.message); }
  _busy = false;
  _refresh();
}
