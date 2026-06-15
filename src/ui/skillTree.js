import { SKILL_DEFS, WEAPON_SKILL_LISTS, COMMON_SKILLS, WEAPON_LABELS } from '../data/skillDefs.js';

// ─── State ────────────────────────────────────────────────────
export const treeState = {
  weapon:  'sword_shield',        // 'sword_shield' | 'greatsword' | 'polearm'
  points:  40,                    // 剩餘技能點數
  learned: {},                    // id → level (1–3)
  slots:   Array(9).fill(null),   // slots[0..8] 對應按鍵 1–9，值為 skill id 或 null
  cdTimers: {},                   // id → 剩餘 CD 秒數（每幀更新）
};

let _pendingAssign = null;        // 等待選格的技能 id
let _onWeaponChange = null;       // 換武器時的回調（傳入 main.js 更新 mesh）

// ─── Queries ──────────────────────────────────────────────────
export function getSlotSkill(slotIdx) {
  const id = treeState.slots[slotIdx];
  if (!id) return null;
  const lv = treeState.learned[id] || 0;
  if (lv === 0) return null;
  const def = SKILL_DEFS[id];
  return { id, def, level: lv, stats: def.levels[lv - 1] };
}

export function getLearnedLevel(id) { return treeState.learned[id] || 0; }

// ─── Actions ──────────────────────────────────────────────────
export function learnSkill(id) {
  const def = SKILL_DEFS[id];
  if (!def) return false;
  if (def.weapon !== 'common' && def.weapon !== treeState.weapon) return false;

  const curLv = treeState.learned[id] || 0;
  if (curLv >= 3) return false;

  // 前置技能檢查
  if (def.requires) {
    for (const [reqId, reqLv] of Object.entries(def.requires)) {
      if ((treeState.learned[reqId] || 0) < reqLv) return false;
    }
  }

  const cost = curLv + 1; // LV1=1pt LV2=2pt LV3=3pt
  if (treeState.points < cost) return false;

  treeState.points -= cost;
  treeState.learned[id] = curLv + 1;
  renderPanel();
  return true;
}

export function assignToSlot(slotIdx, skillId) {
  // 從舊位置移除
  for (let i = 0; i < 9; i++) {
    if (treeState.slots[i] === skillId) treeState.slots[i] = null;
  }
  treeState.slots[slotIdx] = skillId || null;
  renderPanel();
}

export function setWeapon(weapon) {
  if (treeState.weapon === weapon) return;
  // 清空屬於舊武器的格子
  const oldWeaponSkills = new Set(WEAPON_SKILL_LISTS[treeState.weapon] || []);
  treeState.slots = treeState.slots.map(id => (id && oldWeaponSkills.has(id)) ? null : id);
  treeState.weapon = weapon;
  if (_onWeaponChange) _onWeaponChange(weapon);
  renderPanel();
}

// ─── CD 更新（每幀呼叫）─────────────────────────────────────
export function updateSkillCDs(dt) {
  for (const id in treeState.cdTimers) {
    treeState.cdTimers[id] = Math.max(0, treeState.cdTimers[id] - dt);
  }
}

export function startCD(id) {
  const def = SKILL_DEFS[id];
  if (def) treeState.cdTimers[id] = def.cd;
}

export function getCDTimer(id) { return treeState.cdTimers[id] || 0; }

// ─── Panel UI ────────────────────────────────────────────────
let panelEl = null;

export function initSkillPanel(onWeaponChange) {
  panelEl = document.getElementById('skill-panel');
  if (!panelEl) return;
  _onWeaponChange = onWeaponChange || null;

  // 武器 tab 點擊
  panelEl.querySelectorAll('[data-weapon]').forEach(btn => {
    btn.addEventListener('click', () => {
      setWeapon(btn.dataset.weapon);
    });
  });

  renderPanel();
}

export function toggleSkillPanel() {
  if (!panelEl) return;
  const open = panelEl.style.display !== 'flex';
  panelEl.style.display = open ? 'flex' : 'none';
  if (open) renderPanel();
}

export function isSkillPanelOpen() {
  return panelEl?.style.display === 'flex';
}

export function refreshSkillPanel() { renderPanel(); }

// ─── 面板渲染 ─────────────────────────────────────────────────
function renderPanel() {
  if (!panelEl || panelEl.style.display === 'none') return;

  // 技能點數
  panelEl.querySelector('#sp-count').textContent = treeState.points;
  panelEl.querySelector('#sp-max').textContent   = 40;

  // 武器 tab 高亮
  panelEl.querySelectorAll('[data-weapon]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.weapon === treeState.weapon);
  });

  // 共通技能
  renderSkillSection('skill-section-common', COMMON_SKILLS);
  // 武器技能
  renderSkillSection('skill-section-weapon', WEAPON_SKILL_LISTS[treeState.weapon] || []);

  // 技能格（槽位）
  renderSlots();
}

function renderSkillSection(sectionId, skillIds) {
  const sec = panelEl.querySelector(`#${sectionId}`);
  if (!sec) return;
  sec.innerHTML = '';
  for (const id of skillIds) {
    sec.appendChild(makeSkillCard(id));
  }
}

function makeSkillCard(id) {
  const def  = SKILL_DEFS[id];
  const curLv = treeState.learned[id] || 0;
  const canLearnMore = curLv < 3;
  const nextCost     = curLv + 1;
  const canAfford    = treeState.points >= nextCost;
  const requiresMet  = checkRequires(def);
  const isAssigning  = _pendingAssign === id;

  const card = document.createElement('div');
  card.className = 'sk-card' + (curLv > 0 ? ' learned' : '') + (isAssigning ? ' assigning' : '');

  const lvStars = '★'.repeat(curLv) + '☆'.repeat(3 - curLv);
  const nextStatText = canLearnMore ? def.levels[curLv].pw + ' PW | ' + (def.levels[curLv].dmg ?? '') : '滿級';

  card.innerHTML = `
    <div class="sk-top">
      <span class="sk-icon">${def.icon}</span>
      <div class="sk-info">
        <div class="sk-name">${def.nameZh} <small>${def.nameEn}</small></div>
        <div class="sk-lv">${lvStars}</div>
      </div>
      <div class="sk-right">
        ${canLearnMore && requiresMet
          ? `<button class="sk-btn-learn ${canAfford ? '' : 'disabled'}" data-id="${id}">
               學習 (${nextCost}pt)
             </button>`
          : !requiresMet ? `<span class="sk-req">需前置技能</span>` : `<span class="sk-maxlv">LV MAX</span>`}
      </div>
    </div>
    <div class="sk-desc">${def.desc}</div>
    ${curLv > 0 ? `<div class="sk-stats">LV${curLv}：${def.levels[curLv-1].pw}PW${def.levels[curLv-1].dmg ? ' / ' + def.levels[curLv-1].dmg + 'dmg' : ''}　CD: ${def.cd}s</div>` : ''}
    ${curLv > 0 ? `<div class="sk-assign-row">
      裝備到：${[1,2,3,4,5,6,7,8,9].map(n => {
        const slotSkill = treeState.slots[n-1];
        const active = slotSkill === id;
        return `<button class="sk-slot-btn ${active ? 'active' : ''}" data-assign-id="${id}" data-slot="${n-1}">${n}</button>`;
      }).join('')}
    </div>` : ''}
  `;

  // 學習按鈕
  card.querySelector('.sk-btn-learn')?.addEventListener('click', e => {
    e.stopPropagation();
    learnSkill(id);
  });
  // 裝備按鈕
  card.querySelectorAll('.sk-slot-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const slot = parseInt(btn.dataset.slot);
      const sid  = btn.dataset.assignId;
      if (treeState.slots[slot] === sid) {
        assignToSlot(slot, null); // 取消裝備
      } else {
        assignToSlot(slot, sid);
      }
    });
  });

  return card;
}

function renderSlots() {
  const bar = panelEl.querySelector('#panel-slot-bar');
  if (!bar) return;
  bar.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const id  = treeState.slots[i];
    const def = id ? SKILL_DEFS[id] : null;
    const lv  = id ? (treeState.learned[id] || 0) : 0;
    const div = document.createElement('div');
    div.className = 'panel-slot' + (id ? ' filled' : '');
    div.innerHTML = `
      <div class="ps-key">${i + 1}</div>
      <div class="ps-icon">${def ? def.icon : '—'}</div>
      <div class="ps-name">${def ? def.nameZh : '空'}</div>
      ${lv > 0 ? `<div class="ps-lv">LV${lv}</div>` : ''}
    `;
    div.addEventListener('click', () => { assignToSlot(i, null); });
    bar.appendChild(div);
  }
}

function checkRequires(def) {
  if (!def.requires) return true;
  for (const [reqId, reqLv] of Object.entries(def.requires)) {
    if ((treeState.learned[reqId] || 0) < reqLv) return false;
  }
  return true;
}
