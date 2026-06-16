// ─── FEZ Skill Definitions — Warrior ─────────────────────────
// LV3 = spec values; LV1 ≈ 60%, LV2 ≈ 80%
// pw / dmg / duration scale with level.
//
// 時間欄位（秒，FEZ_Skills §2 / FEZ_Movement §5）：
//   windup   前搖：鎖定面向與移動，可被打斷（Embolden 擋 flinch 級）
//   active   命中判定窗：多段技能（hits>1）在此期間平均分段命中
//   recovery 後搖：仍然鎖定，結束才能下一招（不可緩衝）

import { t, getLang } from '../ui/i18n.js';

export const SKILL_DEFS = {

  // ══════════════════════════════════════════════════════
  //  共通技能 (common — all warrior weapons)
  // ══════════════════════════════════════════════════════

  embolden: {
    id: 'embolden', nameZh: '堅毅', nameEn: 'Embolden',
    weapon: 'common', icon: '✨', kind: 'buff',
    cd: 18, windup: 0.20, active: 0, recovery: 0.30,
    desc: '超甲：期間免疫 flinch（不擋 stun / knockback / DoT）',
    levels: [
      { pw: 18, duration: 4000 },
      { pw: 24, duration: 6000 },
      { pw: 30, duration: 8000 },
    ],
  },

  reinforce_guard: {
    id: 'reinforce_guard', nameZh: '強化防禦', nameEn: 'Reinforce Guard',
    weapon: 'common', icon: '🛡', kind: 'buff',
    cd: 90, windup: 0.30, active: 0, recovery: 0.40,
    desc: '防禦提升，攻擊力下降，持續時間長',
    levels: [
      { pw: 24, defBonus: 30, atkMul: 0.88, duration: 40000 },
      { pw: 32, defBonus: 40, atkMul: 0.85, duration: 80000 },
      { pw: 40, defBonus: 50, atkMul: 0.82, duration: 120000 },
    ],
  },

  tackle: {
    id: 'tackle', nameZh: '衝撞', nameEn: 'Tackle',
    weapon: 'common', icon: '⚡', kind: 'dash',
    cd: 12, windup: 0.10, active: 0.40, recovery: 0.35,
    desc: '直線突進，沿途命中敵人，擊退',
    levels: [
      { pw: 15, dmg: 48, range: 5 },
      { pw: 20, dmg: 64, range: 7 },
      { pw: 25, dmg: 80, range: 8 },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  單手劍盾 (sword_shield)
  // ══════════════════════════════════════════════════════

  shield_bash: {
    id: 'shield_bash', nameZh: '盾擊', nameEn: 'Shield Bash',
    weapon: 'sword_shield', icon: '🛡⚔', kind: 'cone',
    cd: 18, windup: 0.25, active: 0.10, recovery: 0.40,
    desc: '短前搖後 2m 90°扇形，暈眩目標（戰士招牌技）',
    levels: [
      { pw: 24, dmg: 90,  hitstun: 'stun', stunMs: 1500, range: 2, halfAngleCos: 0.707 },
      { pw: 32, dmg: 120, hitstun: 'stun', stunMs: 2000, range: 2, halfAngleCos: 0.707 },
      { pw: 40, dmg: 150, hitstun: 'stun', stunMs: 3000, range: 2, halfAngleCos: 0.707 },
    ],
  },

  smash: {
    id: 'smash', nameZh: '重擊', nameEn: 'Smash',
    weapon: 'sword_shield', icon: '💥', kind: 'cone',
    cd: 4, windup: 0.20, active: 0.08, recovery: 0.25,
    desc: '2m 60°扇形，短前搖，flinch',
    levels: [
      { pw:  9, dmg:  60, hitstun: 'flinch', range: 2, halfAngleCos: 0.866 },
      { pw: 12, dmg:  80, hitstun: 'flinch', range: 2, halfAngleCos: 0.866 },
      { pw: 15, dmg: 100, hitstun: 'flinch', range: 2, halfAngleCos: 0.866 },
    ],
  },

  smash_2: {
    id: 'smash_2', nameZh: '連續重擊', nameEn: '2 Smash',
    weapon: 'sword_shield', icon: '💥💥', kind: 'cone',
    cd: 5, windup: 0.20, active: 0.50, recovery: 0.35, hits: 2,
    requires: { smash: 3 },
    desc: '兩段連擊（第二段可側閃迴避），各自 flinch',
    levels: [
      { pw: 15, dmg: 54,  hitstun: 'flinch', range: 2, halfAngleCos: 0.866 },
      { pw: 20, dmg: 72,  hitstun: 'flinch', range: 2, halfAngleCos: 0.866 },
      { pw: 25, dmg: 90,  hitstun: 'flinch', range: 2, halfAngleCos: 0.866 },
    ],
  },

  force_impact: {
    id: 'force_impact', nameZh: '衝擊波', nameEn: 'Force Impact',
    weapon: 'sword_shield', icon: '🌊', kind: 'projectile',
    cd: 10, windup: 0.40, active: 0.05, recovery: 0.50,
    desc: '前方線性投射物，命中後大擊退',
    levels: [
      { pw: 21, dmg:  78, hitstun: 'knockback', range:  8 },
      { pw: 28, dmg: 104, hitstun: 'knockback', range: 10 },
      { pw: 35, dmg: 130, hitstun: 'knockback', range: 12 },
    ],
  },

  sonic_boom: {
    id: 'sonic_boom', nameZh: '音速波', nameEn: 'Sonic Boom',
    weapon: 'sword_shield', icon: '💨', kind: 'wave',
    cd: 8, windup: 0.30, active: 0.08, recovery: 0.40,
    desc: '前方寬2m線性波，掃陣型用，flinch',
    levels: [
      { pw: 18, dmg:  66, hitstun: 'flinch', range:  9, aoeWidth: 2 },
      { pw: 24, dmg:  88, hitstun: 'flinch', range: 12, aoeWidth: 2 },
      { pw: 30, dmg: 110, hitstun: 'flinch', range: 15, aoeWidth: 2 },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  雙手劍 (greatsword)
  // ══════════════════════════════════════════════════════

  behemoths_tail: {
    id: 'behemoths_tail', nameZh: '巨獸尾擊', nameEn: "Behemoth's Tail",
    weapon: 'greatsword', icon: '🐉', kind: 'cone',
    cd: 8, windup: 0.35, active: 0.60, recovery: 0.50, hits: 4,
    desc: '4段水平橫掃 180°，每段 flinch，可接 Heavy Smash',
    levels: [
      { pw: 21, dmg: 36, hits: 4, hitstun: 'flinch', range: 3, halfAngleCos: 0 },
      { pw: 28, dmg: 48, hits: 4, hitstun: 'flinch', range: 3, halfAngleCos: 0 },
      { pw: 35, dmg: 60, hits: 4, hitstun: 'flinch', range: 3, halfAngleCos: 0 },
    ],
  },

  heavy_smash: {
    id: 'heavy_smash', nameZh: '重型重擊', nameEn: 'Heavy Smash',
    weapon: 'greatsword', icon: '⚒', kind: 'cone',
    cd: 6, windup: 0.30, active: 0.10, recovery: 0.60,
    requires: { behemoths_tail: 1 },
    desc: '接巨獸尾擊後的高傷害收尾技',
    levels: [
      { pw: 18, dmg: 120, hitstun: 'flinch', range: 3, halfAngleCos: 0.5 },
      { pw: 24, dmg: 160, hitstun: 'flinch', range: 3, halfAngleCos: 0.5 },
      { pw: 30, dmg: 200, hitstun: 'flinch', range: 3, halfAngleCos: 0.5 },
    ],
  },

  crumble_storm: {
    id: 'crumble_storm', nameZh: '碎裂風暴', nameEn: 'Crumble Storm',
    weapon: 'greatsword', icon: '🌪', kind: 'self_aoe',
    cd: 18, windup: 0.50, active: 0.20, recovery: 0.80,
    desc: '自身 360° 4m 範圍爆炸，強力 knockback（後搖長）',
    levels: [
      { pw: 36, dmg: 150, hitstun: 'knockback', aoeRadius: 4 },
      { pw: 48, dmg: 200, hitstun: 'knockback', aoeRadius: 4 },
      { pw: 60, dmg: 250, hitstun: 'knockback', aoeRadius: 4 },
    ],
  },

  cleave: {
    id: 'cleave', nameZh: '劈斬', nameEn: 'Cleave',
    weapon: 'greatsword', icon: '⚔', kind: 'cone',
    cd: 8, windup: 0.40, active: 0.12, recovery: 0.50,
    desc: '3m 120°扇形大傷害，flinch',
    levels: [
      { pw: 24, dmg: 132, hitstun: 'flinch', range: 3, halfAngleCos: 0.5 },
      { pw: 32, dmg: 176, hitstun: 'flinch', range: 3, halfAngleCos: 0.5 },
      { pw: 40, dmg: 220, hitstun: 'flinch', range: 3, halfAngleCos: 0.5 },
    ],
  },

  slam_attack: {
    id: 'slam_attack', nameZh: '重墜攻擊', nameEn: 'Slam Attack',
    weapon: 'greatsword', icon: '🔨', kind: 'point_aoe',
    cd: 10, windup: 0.45, active: 0.10, recovery: 0.55,
    desc: '落地衝擊 3m 圓形，knockback',
    levels: [
      { pw: 27, dmg: 108, hitstun: 'knockback', aoeRadius: 3 },
      { pw: 36, dmg: 144, hitstun: 'knockback', aoeRadius: 3 },
      { pw: 45, dmg: 180, hitstun: 'knockback', aoeRadius: 3 },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  長槍 (polearm)
  // ══════════════════════════════════════════════════════

  lance_sweep: {
    id: 'lance_sweep', nameZh: '長槍橫掃', nameEn: 'Lance Sweep',
    weapon: 'polearm', icon: '🔱', kind: 'cone',
    cd: 5, windup: 0.25, active: 0.10, recovery: 0.35,
    desc: '3.5m 120°扇形橫掃，flinch',
    levels: [
      { pw: 15, dmg:  78, hitstun: 'flinch', range: 3.5, halfAngleCos: 0.5 },
      { pw: 20, dmg: 104, hitstun: 'flinch', range: 3.5, halfAngleCos: 0.5 },
      { pw: 25, dmg: 130, hitstun: 'flinch', range: 3.5, halfAngleCos: 0.5 },
    ],
  },

  lance_charge: {
    id: 'lance_charge', nameZh: '長槍突刺', nameEn: 'Lance Charge',
    weapon: 'polearm', icon: '🏹', kind: 'dash',
    cd: 7, windup: 0.20, active: 0.30, recovery: 0.40,
    desc: '直線突刺，距離隨等級增加，flinch',
    levels: [
      { pw: 18, dmg: 108, hitstun: 'flinch', range: 4 },
      { pw: 24, dmg: 144, hitstun: 'flinch', range: 5 },
      { pw: 30, dmg: 180, hitstun: 'flinch', range: 6 },
    ],
  },

  big_step: {
    id: 'big_step', nameZh: '大步突進', nameEn: 'Big Step',
    weapon: 'polearm', icon: '🦘', kind: 'dash_aoe',
    cd: 12, windup: 0.30, active: 0.20, recovery: 0.50,
    desc: '突進後落地衝擊，範圍 knockback',
    levels: [
      { pw: 27, dmg: 102, hitstun: 'knockback', dashRange: 3, aoeRadius: 2 },
      { pw: 36, dmg: 136, hitstun: 'knockback', dashRange: 4, aoeRadius: 2.5 },
      { pw: 45, dmg: 170, hitstun: 'knockback', dashRange: 5, aoeRadius: 3 },
    ],
  },

  whirlwind_lance: {
    id: 'whirlwind_lance', nameZh: '風暴長槍', nameEn: 'Whirlwind Lance',
    weapon: 'polearm', icon: '🌀', kind: 'self_aoe',
    cd: 14, windup: 0.40, active: 0.60, recovery: 0.60, hits: 3,
    desc: '360° 4m 三段旋擊，每段 flinch',
    levels: [
      { pw: 30, dmg: 42, hits: 3, hitstun: 'flinch', aoeRadius: 4 },
      { pw: 40, dmg: 56, hits: 3, hitstun: 'flinch', aoeRadius: 4 },
      { pw: 50, dmg: 70, hits: 3, hitstun: 'flinch', aoeRadius: 4 },
    ],
  },
};

// 各武器的技能清單（顯示順序）
export const WEAPON_SKILL_LISTS = {
  sword_shield: ['shield_bash', 'smash', 'smash_2', 'force_impact', 'sonic_boom'],
  greatsword:   ['behemoths_tail', 'heavy_smash', 'crumble_storm', 'cleave', 'slam_attack'],
  polearm:      ['lance_sweep', 'lance_charge', 'big_step', 'whirlwind_lance'],
};

export const COMMON_SKILLS = ['embolden', 'reinforce_guard', 'tackle'];

export const WEAPON_LABELS = {
  sword_shield: '單手劍盾',
  greatsword:   '雙手劍',
  polearm:      '長槍',
};

// 英文技能說明（中文用各 def.desc）
const SKILL_DESC_EN = {
  embolden: 'Super-armor: immune to flinch (not stun / knockback / DoT)',
  reinforce_guard: 'Raises defense, lowers attack; long duration',
  tackle: 'Dash forward, hitting enemies along the path, knockback',
  shield_bash: 'Short windup, 2m 90° cone, stuns target (warrior signature)',
  smash: '2m 60° cone, short windup, flinch',
  smash_2: 'Two-hit combo (2nd is sidestep-cancelable), each flinches',
  force_impact: 'Linear projectile forward, strong knockback on hit',
  sonic_boom: '2m-wide linear wave, sweeps formations, flinch',
  behemoths_tail: '4-hit 180° horizontal sweep, each flinches, combos into Heavy Smash',
  heavy_smash: "High-damage finisher after Behemoth's Tail",
  crumble_storm: 'Self 360° 4m blast, strong knockback (long recovery)',
  cleave: '3m 120° cone, heavy damage, flinch',
  slam_attack: 'Landing impact in a 3m circle, knockback',
  lance_sweep: '3.5m 120° cone sweep, flinch',
  lance_charge: 'Linear thrust, range scales with level, flinch',
  big_step: 'Leap then landing impact, area knockback',
  whirlwind_lance: '360° 4m three-hit spin, each flinches',
};

const WEAPON_KEY = { sword_shield: 'g_w_sword', greatsword: 'g_w_greatsword', polearm: 'g_w_polearm' };

/** 依目前語言取技能名 / 說明 / 武器標籤 */
export function skillName(def) { return getLang() === 'zh' ? def.nameZh : (def.nameEn || def.nameZh); }
export function skillDesc(def) { return getLang() === 'zh' ? def.desc : (SKILL_DESC_EN[def.id] || def.desc); }
export function weaponLabel(weapon) { return t(WEAPON_KEY[weapon] || weapon); }
