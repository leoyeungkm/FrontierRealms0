import * as THREE from 'three';

// ─── Network ─────────────────────────────────────────────────
export const SERVER_URL = 'ws://localhost:2567';
export const ROOM_NAME  = 'my_room';

// ─── Movement（FEZ_Movement_Hitstun.md §3）──────────────────
export const MOVE_SPEED   = 5.0;   // 走路
export const SPRINT_SPEED = 7.5;   // 衝刺 +50%
export const BACK_MULT    = 0.7;   // 後退 -30%
export const STRAFE_MULT  = 0.9;   // 平移 -10%
export const JUMP_VEL     = 10;    // 跳高 ~2m（上升 0.4s）
export const GRAVITY      = -25;
export const LAND_LAG     = 0.15;  // 落地 recovery

// ─── SP 耐力（衝刺/跳躍/側閃消耗；原版 FEZ 這些動作吃 PW，
//     這裡分離成獨立資源讓技能資源不被移動拖累）────────────────
export const SP_MAX           = 100;
export const SP_REGEN         = 22;    // 每秒回復
export const SP_REGEN_DELAY   = 0.7;   // 消耗後延遲回復（秒）
export const SP_SPRINT_DRAIN  = 14;    // 衝刺每秒消耗
export const SP_JUMP_COST     = 12;
export const SP_SIDESTEP_COST = 22;

// ─── Sidestep 側閃（Q/E，§4.1）──────────────────────────────
export const SIDESTEP_DUR    = 0.4;   // 總時長
export const SIDESTEP_IFRAME = 0.3;   // 前 0.3s 無敵（物理）
export const SIDESTEP_DIST   = 3.0;   // 位移距離
export const SIDESTEP_CD     = 1.5;

// ─── Combat ──────────────────────────────────────────────────
export const PLAYER_ATK_RANGE = 2.2;  // FEZ 近戰 ~2m，必須貼臉
export const ATK_CD           = 0.5;  // （保留給召喚物等舊邏輯）
export const HITSTUN_DUR      = { flinch_short: 0.2, flinch: 0.4, knockback: 0.6, stun: 3.0, knockdown: 1.2 };
export const KNOCKDOWN_GETUP  = 0.5;  // 倒地起身的無敵恢復期

// ─── LMB 普攻時間表（武器別，§5.2，秒）──────────────────────
// Chivalry 2 式重量節奏：前搖看得見「掄起來」、後搖有收勢——揮擊有質量感
export const LMB_TIMING = {
  sword_shield: { windup: 0.22, active: 0.11, recovery: 0.33, dmg: 30 },
  greatsword:   { windup: 0.48, active: 0.19, recovery: 0.64, dmg: 55 },
  polearm:      { windup: 0.28, active: 0.14, recovery: 0.42, dmg: 38 },
};

// ─── Camera ──────────────────────────────────────────────────
export const CAM_DIST          = 10;
export const CAM_HEIGHT_OFFSET = new THREE.Vector3(0, 1.6, 0);

// ─── Towers ──────────────────────────────────────────────────
export const TOWER_MAX       = 3;
export const TOWER_RANGE     = 14;
export const TOWER_DAMAGE    = 18;
export const TOWER_FIRE_RATE = 1.8;
export const TOWER_COST      = 0;

// ─── Buildings / RTS ─────────────────────────────────────────
export const OBELISK_COST       = 0;
export const OBELISK_SOI_RADIUS = 20;
export const CRYSTAL_MAX        = 50;
export const MINE_RATE_NORMAL   = 3.0;   // 秒/顆 (前12顆)
export const MINE_RATE_SLOW     = 10.0;  // 秒/顆 (超過12顆後，原版防壟斷機制)
export const MINE_RANGE         = 3.5;

// ─── Round Timer ─────────────────────────────────────────────
export const ROUND_DURATION = (7 + 3 + 120) * 1000;
export const LOBBY_DURATION = 7 * 1000;
export const CD_DURATION    = 3 * 1000;

// ─── 水晶礦位置（遊戲世界座標，完全對稱；周圍地形會整平）──────
// 佈局：兩座城堡旁各一組 + 地圖中央（三路交會）一組
export const CRYSTAL_POSITIONS = [
  [-8,  38], [8,  38],            // 藍堡旁
  [-8, -38], [8, -38],            // 紅堡旁
  [-5, 0], [5, 0], [0, 6],        // 中央
];

// ─── Summon Definitions ──────────────────────────────────────
export const SUMMON_DEFS = {
  knight: { cost: 0, hp: 300, speed: 5.5, atkDmg: 65,  atkRange: 3.2, atkCd: 1.1, name: '騎士 Knight' },
  giant:  { cost: 0, hp: 600, speed: 2.8, atkDmg: 130, atkRange: 4.5, atkCd: 2.0, name: '巨人 Giant'  },
  wraith: { cost: 0, hp: 180, speed: 9.5, atkDmg: 42,  atkRange: 5.2, atkCd: 0.6, name: '幽魂 Wraith' },
};
