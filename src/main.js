import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Client } from 'colyseus.js';
import { initPostFX } from './core/postfx.js';

// ─── Modules ─────────────────────────────────────────────────
import {
  SERVER_URL, ROOM_NAME,
  MOVE_SPEED, SPRINT_SPEED, BACK_MULT, STRAFE_MULT, JUMP_VEL, GRAVITY, LAND_LAG,
  PLAYER_ATK_RANGE, HITSTUN_DUR, KNOCKDOWN_GETUP, LMB_TIMING,
  SIDESTEP_DUR, SIDESTEP_IFRAME, SIDESTEP_DIST, SIDESTEP_CD,
  SP_MAX, SP_REGEN, SP_REGEN_DELAY, SP_SPRINT_DRAIN, SP_JUMP_COST, SP_SIDESTEP_COST,
  CAM_DIST, CAM_HEIGHT_OFFSET,
  TOWER_MAX,
  ROUND_DURATION, LOBBY_DURATION, CD_DURATION,
  SUMMON_DEFS, CRYSTAL_POSITIONS,
} from './constants.js';

import {
  initParticles, setParticleCamera, spawnHitSparks, spawnBloodSpray, spawnSlashStreak, spawnExplosion, spawnFootDust, updateParticles,
  spawnDashTrail, fireSkillEffect, fireBasicAttackEffect, spawnDarkMist,
} from './effects/particles.js';
import { initLightPool, updateLightPool, acquireFollowLight } from './effects/lightPool.js';
import { initRagdoll, updateRagdolls, createRagdoll, disposeRagdoll } from './effects/ragdoll.js';
import { initSfx, sfxSwing, sfxHit, sfxDash, sfxCast, sfxFreeze, sfxMist } from './effects/sfx.js';
import { initDmgNumbers, worldToScreen, showDmgNum, updateDmgNumbers } from './effects/dmgNumbers.js';
import { initSummon, buildKnightMesh, buildGiantMesh, buildWraithMesh, updateSummons, summonAttackAnim } from './entities/summon.js';
import { initEnemy, initEnemyPhysics, enemies, spawnEnemy, updateEnemyHp, flashEnemyHit, markEnemyHit, removeEnemy, killEnemy, clearEnemies, updateEnemies, updateDyingEnemies } from './entities/enemy.js';
import { initRemotePlayer, initRemotePlayerPhysics, remotePlayers, spawnRemotePlayer, removeRemotePlayer, updateRemotes, setRemoteAppearance, setRemoteName } from './entities/remotePlayer.js';
import { buildVoxelMap, createTerrainColliders, getTerrainHeight, updateWorldAnim, setGrassCount } from './world/voxelMap.js';
import { bindQuality, applyQuality, usePostFX, getQuality, QUALITY_PRESETS } from './core/quality.js';
import { buildSky, updateEnvironment, SKY_HORIZON } from './world/environment.js';
import { initSoI, createSoICircle, createObelisk, obelisks, updateObelisks } from './world/soi.js';
import { initTower, towers, updateTowers, createTower } from './entities/tower.js';
import { initCrystal, setCrystalPlayerRefs, isMining, crystalState, crystalNodes, spawnCrystalNode, updateMining } from './world/crystal.js';
import {
  initBuildMenu, menuState, updateBuildGhost, clearBuildGhost,
  toggleBuildMenu, selectAndPlace, placeTower, placeObelisk,
  toggleSummonMenu, selectSummon,
} from './ui/buildMenu.js';
import { initDummy, dummies, spawnDummy, dummyTakeDamage, dummyKnockback, updateDummies } from './entities/dummy.js';
import {
  summonState as s, initSummonSystem, setSummonPlayerGroup,
  deactivateSummon, updateSummonTransform,
  updateGiantAimVisual, clearGiantAimVisual, fireGiantCannon, updateGiantProjectiles,
  SUMMON_SKILLS, summonSkillCds,
} from './entities/summonSystem.js';
import {
  updateHpBar, updatePwBar, updateSpBar, updateCrystalHUD,
  updateSummonHUD, updateKeepBar, updateRoundTimer,
  flashDamage, flashKeepBar, showAnnounce, setStatus, showGameOver,
} from './ui/hud.js';
import { SKILL_DEFS, WEAPON_SKILL_LISTS, weaponLabel } from './data/skillDefs.js';
import { t, toggleLang, onLangChange } from './ui/i18n.js';
import { createVoxelRig } from './entities/voxelCharacter.js';
import { preloadWeapon } from './entities/riggedCharacter.js';
import { appearance, buildAppearanceRig, initAppearanceUI, initAppearancePreview, toggleAppearancePanel, appearanceToNet, appearanceFromNet } from './ui/appearance.js';
import { initSuiPanel } from './ui/suiPanel.js';
import { initIntro } from './ui/intro.js';
import { initMarketHud, toggleMarketHud } from './ui/marketHud.js';
import { signLogin, suiState } from './sui/wallet.js';
import { setActiveMarket, getMarket, getMyShares, redeem, toSui } from './sui/market.js';
import {
  treeState, getSlotSkill, learnSkill, assignToSlot, setWeapon,
  updateSkillCDs, startCD, getCDTimer, autoFillSkills, setSkillBudget,
  initSkillPanel, toggleSkillPanel, isSkillPanelOpen, refreshSkillPanel,
} from './ui/skillTree.js';
import { addLocalXp, skillPointsForLevel, loadCharacter, getMyCharacter, applyXp, setPendingXp, clearPendingXp, addPendingRedeem, removePendingRedeem } from './sui/character.js';

// ─── Renderer ────────────────────────────────────────────────
const canvas   = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.outputColorSpace  = THREE.SRGBColorSpace;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;   // 配合 N8AO sRGB 提亮曲線的補償曝光（偏白降低、偏暗調高）

// ─── Scene ───────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_HORIZON);          // 天穹外的保底色
// 線性霧：26m 內完全無霧（近景清晰銳利），遠景仍融入天空
scene.fog = new THREE.Fog(SKY_HORIZON, 26, 170);

// ─── Camera ──────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);

// ─── Lights ──────────────────────────────────────────────────
// 降低均勻環境光、提高半球光：天空藍從上方、草地綠從下方反射，立體感更強
// 均勻環境光壓低、半球光抬高 → 受光面/陰影面對比拉開（去「平光 raw render」感）
// 強度按 FEZ 校準：沉穩柔光戰場，不是亮白卡通
scene.add(new THREE.AmbientLight(0xfff0e0, 0.30));
scene.add(new THREE.HemisphereLight(0x7ab8e8, 0x5a7a4e, 0.72));
const sun = new THREE.DirectionalLight(0xfff5e8, 2.05);
sun.position.set(40, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(2048);
sun.shadow.bias = -0.0003;     // 平滑地形防 shadow acne
sun.shadow.normalBias = 0.6;
sun.shadow.camera.near = 1;
sun.shadow.camera.far  = 250;
// 陰影相機跟隨玩家（小視錐 = 高解析陰影；位置 snap 防邊緣閃爍）
sun.shadow.camera.left = sun.shadow.camera.bottom = -42;
sun.shadow.camera.right = sun.shadow.camera.top = 42;
scene.add(sun);
scene.add(sun.target);
const _sunOffset = new THREE.Vector3(40, 80, 30);
function updateShadowFollow() {
  const sx = Math.round(playerPos.x / 4) * 4;
  const sz = Math.round(playerPos.z / 4) * 4;
  sun.position.set(sx + _sunOffset.x, _sunOffset.y, sz + _sunOffset.z);
  sun.target.position.set(sx, 0, sz);
}

// ─── Sky（漸層天穹 + 飄移雲朵）───────────────────────────────
buildSky(scene, sun.position);

// ─── 固定光源池（所有瞬間光效共用，光源數量恆定 → 不觸發 shader 重編譯）──
initLightPool(scene, 8);

// ─── 後處理管線（→ src/core/postfx.js）──────────────────────
const { composer, syncSize: syncComposerSize, gradePass, aoPass } = initPostFX(renderer, scene, camera);

// ─── 畫質設定（低/中/高，localStorage 持久化）────────────────
bindQuality({ renderer, composer, syncSize: syncComposerSize, sun, setGrassCount, aoPass });


// ─── Attack Ring ─────────────────────────────────────────────
const atkRingMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0, depthTest: false,
});
const atkRingMesh = new THREE.Mesh(new THREE.RingGeometry(0.1, PLAYER_ATK_RANGE, 48), atkRingMat);
atkRingMesh.rotation.x = -Math.PI / 2;
atkRingMesh.renderOrder = 3;
scene.add(atkRingMesh);
let atkRingTimer = 0;

// ─── Clock & Input ───────────────────────────────────────────
const clock = new THREE.Clock();
const keys  = {};
const mouse = { dx: 0, dy: 0, locked: false, leftClick: false, leftDown: false, freeLook: false };

window.addEventListener('keydown', e => {
  // 開場/打字時（角色名稱等輸入框）不把按鍵傳進遊戲；未進場也不吃輸入
  const _t = e.target;
  if (_t && (_t.tagName === 'INPUT' || _t.tagName === 'TEXTAREA' || _t.isContentEditable)) return;
  if (!_enteredGame) return;
  keys[e.code] = true;
  // 側閃（FEZ §4：Q=左 E=右，按一下觸發一次）
  if ((e.code === 'KeyQ' || e.code === 'KeyE') && !e.repeat) _sidestepReq = e.code === 'KeyE' ? 1 : -1;
  if (e.code === 'KeyB' && !s.active) toggleBuildMenu();
  if (e.code === 'Digit1' && menuState.buildOpen) selectAndPlace('tower');
  if (e.code === 'Digit2' && menuState.buildOpen) selectAndPlace('obelisk');
  if (e.code === 'Escape' && menuState.buildOpen) toggleBuildMenu();
  if (e.code === 'KeyG' && !isDead && !gameOver) toggleSummonMenu(s.active);
  if (e.code === 'Digit1' && menuState.summonOpen) selectSummon('knight');
  if (e.code === 'Digit2' && menuState.summonOpen) selectSummon('giant');
  if (e.code === 'Digit3' && menuState.summonOpen) selectSummon('wraith');
  if (e.code === 'Escape' && menuState.summonOpen) toggleSummonMenu(s.active);
  // 召喚技能（召喚中且選單未開：1/2 = 召喚物專屬技能）
  if (s.active && !menuState.summonOpen) {
    if (e.code === 'Digit1') useSummonSkill(0);
    if (e.code === 'Digit2') useSummonSkill(1);
  }
  // 技能欄 1–7
  if (!s.active) {
    if (e.code === 'Digit1') useSkillSlot(0);
    if (e.code === 'Digit2') useSkillSlot(1);
    if (e.code === 'Digit3') useSkillSlot(2);
    if (e.code === 'Digit4') useSkillSlot(3);
    if (e.code === 'Digit5') useSkillSlot(4);
    if (e.code === 'Digit6') useSkillSlot(5);
    if (e.code === 'Digit7') useSkillSlot(6);
    if (e.code === 'Digit8') useSkillSlot(7);
    if (e.code === 'Digit9') useSkillSlot(8);
  }
  // 技能樹面板（技能 = K；人物外觀 = O，兩者完全獨立）
  if (e.code === 'KeyK') toggleSkillPanel();
  // 測試面板
  if (e.code === 'KeyP') toggleDebugPanel();
  // 角色外觀面板（不影響技能/武器玩法）
  if (e.code === 'KeyO') toggleAppearancePanel();
  // 場內預測市場 HUD（進場後，M=Market；B 已給建造選單，避免衝突）：
  // 開啟時放開鼠標可點交易，關閉復原視角
  if (e.code === 'KeyM' && _enteredGame) {
    if (toggleMarketHud()) document.exitPointerLock(); else canvas.requestPointerLock();
  }
  // FEZ 原版操作：Alt 切換「滑鼠游標模式（點 UI）↔ 視角控制」
  if (e.code === 'AltLeft' || e.code === 'AltRight') {
    e.preventDefault();   // 擋瀏覽器選單 focus
    if (mouse.locked) document.exitPointerLock();
    else canvas.requestPointerLock();
  }
  // Tab：循環換武器
  if (e.code === 'Tab' && !isSkillPanelOpen()) {
    e.preventDefault();
    const order = ['sword_shield', 'greatsword', 'polearm'];
    const next = order[(order.indexOf(treeState.weapon) + 1) % order.length];
    setWeapon(next);
    autoFillSkills();   // 換武器：在角色等級預算內重填技能
    showAnnounce(t('g_equipped', { name: weaponLabel(next) }));
  }
});
window.addEventListener('keyup',   e => {
  const _t = e.target;
  if (_t && (_t.tagName === 'INPUT' || _t.tagName === 'TEXTAREA' || _t.isContentEditable)) return;
  keys[e.code] = false;
});
canvas.addEventListener('click', () => { canvas.requestPointerLock(); initSfx(); });
document.addEventListener('pointerlockchange', () => { mouse.locked = document.pointerLockElement === canvas; });
document.addEventListener('mousemove', e => {
  if (mouse.locked || mouse.freeLook) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 0 && mouse.locked) {
    mouse.leftDown = true;
    if (s.active) {
      mouse.leftClick = true;           // 召喚模式：按下即觸發（giant 按住瞄準）
    } else {
      _chargeT0 = performance.now();    // 一般模式：按住蓄力，放開揮出（Chivalry charge）
      _chargeHeld = true;
    }
  }
  // 右鍵：鎖定中=舉盾格擋（單手劍）；游標模式=自由環視
  if (e.button === 2) {
    if (mouse.locked) _blockReq = true;
    else mouse.freeLook = true;
  }
});
window.addEventListener('mouseup', e => {
  if (e.button === 2) { mouse.freeLook = false; _blockReq = false; return; }
  if (e.button !== 0) return;
  // Giant 放開才發射
  if (mouse.leftDown && mouse.locked && s.active && s.type === 'giant' && !isDead && s.atkCd <= 0) {
    camShake = Math.max(camShake, fireGiantCannon(room));
    s.atkCd   = SUMMON_DEFS.giant.atkCd;
    s.atkAnim = 1.0;
    if (s.group) summonAttackAnim(s.group, 'Throw', 0.6);
  }
  // 蓄力放開 → 揮出（按住時長決定威力；快點 = 普通快擊零延遲）
  if (_chargeHeld) {
    _chargeHeld = false;
    mouse.lmbFire = true;
    mouse.lmbHeldDur = (performance.now() - _chargeT0) / 1000;
  }
  mouse.leftDown = false;
  clearGiantAimVisual();
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
// Chivalry 式三向輸入：滾輪上=縱劈、滾輪下=突刺（LMB=橫掃）
canvas.addEventListener('wheel', e => {
  if (!mouse.locked || s.active) return;
  e.preventDefault();
  _atkRequest = e.deltaY < 0 ? 'overhead' : 'stab';
}, { passive: false });
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  syncComposerSize();
});

// ─── Game State ──────────────────────────────────────────────
let room = null, mySessionId = '', hp = 100, killCount = 0;
const towersLeftRef = { value: TOWER_MAX };
let keepHp1 = 1000, keepHp2 = 1000, maxKeepHp = 1000;
let myTeam = 1;   // 從伺服器收到
let gameOver = false;
let isDead = false, respawnCountdown = 0;
let _myRag = null;   // 自己死亡時的 ragdoll handle
// crystalState → src/world/crystal.js (imported as crystalState)
// menuState (buildOpen/summonOpen) → src/ui/buildMenu.js
// summonState → src/entities/summonSystem.js (imported as s)
// crystalNodes → src/world/crystal.js
// obelisks → src/world/soi.js

// PW (Power) system — per FEZ spec: max 100, recovers 1/s
let pw = 100, maxPw = 100, pwRecoverTimer = 0;

// SP 耐力：衝刺持續消耗、跳躍/側閃單次消耗，短延遲後快速回復
let sp = SP_MAX, spRegenDelay = 0;
function spendSP(cost) {
  if (sp < cost) return false;
  sp -= cost;
  spRegenDelay = SP_REGEN_DELAY;
  updateSpBar(sp, SP_MAX);
  return true;
}

// ─── Debug / Test flags ───────────────────────────────────────
const debug = {
  infinitePw: false,
  oneHit:     false,
  noCD:       false,
};

// ─── Active skill buff state ─────────────────────────────────
let emboldened  = false;  // Embolden 超甲
let emboldenTimer = 0;
let reinforced  = false;  // Reinforce Guard 強化防禦
let reinforceTimer = 0;

// ─── 攻擊狀態機（FEZ §5：前搖→判定→後搖，全程 commit）────────
// slot = -1 表示 LMB 普攻；hits>1 的技能在 active 期間平均分段命中
const atk = {
  phase: 'none',   // 'none' | 'windup' | 'active' | 'recovery'
  t: 0,            // 當前 phase 經過秒數
  slot: -2,
  id: null, def: null, stats: null,
  windup: 0, active: 0, recovery: 0,
  hits: 1, hitsDone: 0,
  style: 'slash',
  variant: 'slash',   // LMB 三向：slash | overhead | stab（Chivalry 式）
  trace: null,        // 揮擊掃掠狀態（刀刃逐個掃到目標才結算）
  queued: null,       // recovery 期間預約的下一刀（combo，僅普攻）
};
let _atkRequest = null;  // 本幀攻擊輸入：'slash' | 'overhead' | 'stab'

// ── Chivalry 式三向普攻（傷害/節奏/扇形各異）──────────────────
const LMB_VARIANTS = {
  slash:    { dmgMul: 1.0,  wMul: 1.0,  rMul: 1.0,  rangeAdd: 0,   hac: 0.707 },  // 橫掃：標準
  overhead: { dmgMul: 1.45, wMul: 1.3,  rMul: 1.2,  rangeAdd: 0.2, hac: 0.86  },  // 縱劈：重慢窄
  stab:     { dmgMul: 0.75, wMul: 0.8,  rMul: 0.85, rangeAdd: 0.7, hac: 0.93  },  // 突刺：快長極窄
};
// 體素 fallback 揮擊樣式
const LMB_STYLE      = { sword_shield: 'slash',      greatsword: 'diag', polearm: 'pl_sweep' };
const LMB_STYLE_ALT  = { sword_shield: 'chop_quick', greatsword: 'diag', polearm: 'pl_sweep' };
// KayKit 剪輯（武器 × 三向）
const RV_LMB = {
  sword_shield: { slash: ['1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Slice_Diagonal'], overhead: '1H_Melee_Attack_Chop', stab: '1H_Melee_Attack_Stab' },
  greatsword:   { slash: ['2H_Melee_Attack_Slice', '2H_Melee_Attack_Slice'], overhead: '2H_Melee_Attack_Chop', stab: '2H_Melee_Attack_Stab' },
  polearm:      { slash: ['2H_Melee_Attack_Slice', '2H_Melee_Attack_Slice'], overhead: '2H_Melee_Attack_Chop', stab: '2H_Melee_Attack_Stab' },
};

// ─── LMB 連擊鏈（Chivalry 一整套動作：每段從上一刀的收勢位置接續）──
// 橫掃（右→左）→ 反掃/斜斬（左→右）→ 重劈收尾（傷害加成、節奏沉）
const LMB_COMBO = {
  sword_shield: [
    { clip: '1H_Melee_Attack_Slice_Horizontal', mode: 'sweep', dirSign:  1, style: 'slash' },
    { clip: '1H_Melee_Attack_Slice_Diagonal',   mode: 'sweep', dirSign: -1, style: 'diag' },
    { clip: '1H_Melee_Attack_Chop',             mode: 'reach', dirSign:  1, style: 'chop', dmgMul: 1.3, wMul: 1.25, rMul: 1.15 },
  ],
  greatsword: [
    { clip: '2H_Melee_Attack_Slice', mode: 'sweep', dirSign:  1, style: 'slash' },
    { clip: '2H_Melee_Attack_Spin',  mode: 'sweep', dirSign: -1, style: 'slash', dmgMul: 1.15 },
    { clip: '2H_Melee_Attack_Chop',  mode: 'reach', dirSign:  1, style: 'chop',  dmgMul: 1.35, wMul: 1.3, rMul: 1.2 },
  ],
  polearm: [
    { clip: '2H_Melee_Attack_Stab',  mode: 'reach', dirSign:  1, style: 'pl_thrust' },
    { clip: '2H_Melee_Attack_Slice', mode: 'sweep', dirSign: -1, style: 'pl_sweep' },
    { clip: '2H_Melee_Attack_Chop',  mode: 'reach', dirSign:  1, style: 'chop', dmgMul: 1.3, wMul: 1.25, rMul: 1.15 },
  ],
};
let _lastComboIdx = 0;

// ─── 蓄力攻擊 / 盾牌格擋狀態 ─────────────────────────────────
let _chargeT0 = 0, _chargeHeld = false, _isCharging = false, _chargeFlashed = false;
let _pendingCharge = 1;   // 放開蓄力時計算的威力倍率（1.0 ～ 1.8）
let _blockReq = false, _blocking = false;

// dummies → src/entities/dummy.js

let camYaw = 0, camPitch = -0.4, camShake = 0;
let _fovPunch = 0;   // 打擊 FOV 收縮（0..1，命中時設定，快速回彈）
let playerPos    = new THREE.Vector3(0, getTerrainHeight(0, 47) + 3, 47);
let playerYaw    = Math.PI;
let yVelocity    = 0;
let isGrounded   = false;
let wasGrounded  = true;  // 上一幀是否落地（偵測落地瞬間用）
let landLagTimer = 0;     // 落地硬直剩餘秒數
let airTime      = 0;     // 連續騰空累積時間（防止邊緣抖動觸發硬直）
let _wasJumped   = false; // 是否主動按 F 跳躍（區別「跳躍」和「踏邊掉落」）
const airVel     = new THREE.Vector3(); // 起跳時鎖定的水平速度
// 側閃（Q/E，FEZ §4：前 0.3s 物理 i-frame，1.5s CD）
let sidestepTimer  = 0;       // >0 = 側閃中（由 SIDESTEP_DUR 倒數）
let sidestepCd     = 0;
let _sidestepReq   = 0;       // keydown 觸發請求：-1=Q(左) +1=E(右)
let sidestepDirLocal = 1;     // 相對角色面向的左右（動畫用）
const sidestepVec  = new THREE.Vector3();
let atkCd        = 0;         // LMB 剩餘鎖定（HUD 顯示用）
// Hitstun (§6 FEZ_Movement_Hitstun.md)
let hitstunTimer    = 0;      // 剩餘硬直秒數
let hitstunMaxTimer = 0;      // 這次硬直總時長（算 lean 比例用）
let hitstunType     = 'flinch_short';
let getupTimer      = 0;      // knockdown 起身後的無敵恢復期（§6.5）
const knockbackVel  = new THREE.Vector3(); // 擊退速度
let sendTimer    = 0;
let walkTime     = 0;
let _footDustTimer = 0;   // 腳步揚塵節拍
// towers → src/entities/tower.js

// ─── Rapier Physics ──────────────────────────────────────────
let physics = null;         // RAPIER.World
let _onSteepSlope = false;  // 站在陡坡上（滑落中，禁跳）
let _airTime = 0;           // 連續離地時間（防地形小起伏觸發空中動畫抖動）
let _physicsStepped = false; // 本幀是否已 step（死亡/硬直時 updatePlayer 提早 return，需保底）
let charController = null;  // KinematicCharacterController
let charBody       = null;  // RigidBody
let charCollider   = null;  // Collider

async function initPhysics() {
  await RAPIER.init();
  physics = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });

  // 安全網地板（防止掉入無限深淵，設在地形最低點以下）
  physics.createCollider(
    RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -6, 0)
  );

  // 地形 trimesh collider（與視覺地形 mesh 同一份三角形）
  createTerrainColliders(RAPIER, physics);

  // 水晶礦節點 collider（visual 恆在 y=0，碰撞體中心固定 y=0.9）
  for (const [x, z] of CRYSTAL_POSITIONS) {
    physics.createCollider(
      RAPIER.ColliderDesc.cuboid(0.6, 0.9, 0.6).setTranslation(x, 0.9, z)
    );
  }

  // Player kinematic body
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(playerPos.x, playerPos.y, playerPos.z);
  charBody = physics.createRigidBody(bodyDesc);
  charCollider = physics.createCollider(
    RAPIER.ColliderDesc.capsule(0.5, 0.35),
    charBody
  );

  // Character controller (auto step, snap-to-ground)
  charController = physics.createCharacterController(0.05); // 皮膚間距加大，減少 corner 卡住
  charController.setUp({ x: 0, y: 1, z: 0 });
  charController.setMaxSlopeClimbAngle(50 * Math.PI / 180);
  charController.setMinSlopeSlideAngle(30 * Math.PI / 180);
  charController.enableAutostep(0.3, 0.1, false); // 小值：只處理格縫隙，不影響高差判定
  charController.enableSnapToGround(1.1); // 大於 1 unit，令 1 格高差視為踩台階
  charController.setApplyImpulsesToDynamicBodies(true);

  initRagdoll(physics, RAPIER);   // 真 ragdoll 系統

  console.log('Rapier physics initialized');
}

// ─── Player Mesh (Robolo) ─────────────────────────────────────
let playerGroup = null, playerBody_ = null, playerWeaponGroup = null;

// ─── KayKit 骨骼動畫角色（_rv；載入失敗時 fallback 體素 _rig）──
let _rv = null;
// 揮擊樣式 → KayKit 動畫剪輯
const RV_ATTACK = {
  slash: '1H_Melee_Attack_Slice_Horizontal', slash2: '1H_Melee_Attack_Slice_Diagonal',
  chop_quick: '1H_Melee_Attack_Chop', chop: '2H_Melee_Attack_Chop', diag: '2H_Melee_Attack_Slice',
  gs_sweep: '2H_Melee_Attack_Spinning', sweep: '1H_Melee_Attack_Slice_Horizontal',
  thrust: '1H_Melee_Attack_Stab', slam: '2H_Melee_Attack_Chop', bash: 'Block_Attack',
  spin: '2H_Melee_Attack_Spin', shoulder: 'Block_Attack',
  pl_sweep: '2H_Melee_Attack_Slice', pl_thrust: '2H_Melee_Attack_Stab',
  pl_leap: '2H_Melee_Attack_Chop', pl_spin: '2H_Melee_Attack_Spin',
  raise: 'Spellcast_Raise', guard: 'Block',
};

// 三種武器的視覺模板（明顯區分：單手劍+盾 / 加大雙手劍 / 杖身+刃合成長矛）
const _weaponTplCache = {};
function _getWeaponTemplate(weapon) {
  // 雙手武器有外觀皮膚（大劍/戰斧，角色外觀面板選擇）→ cache key 帶皮膚
  const key = weapon === 'greatsword' ? `greatsword:${appearance.gsSkin}` : weapon;
  if (_weaponTplCache[key]) return _weaponTplCache[key];
  _weaponTplCache[key] = (async () => {
    if (weapon === 'greatsword') {
      const url = appearance.gsSkin === 'axe'
        ? 'models/chars/axe_2handed.gltf'
        : 'models/chars/sword_2handed.gltf';
      const s = await preloadWeapon(url);
      if (!s) return { r: null, l: null };
      const g = new THREE.Group();
      const m = s.clone();
      m.scale.setScalar(1.25);            // 大劍就要有大劍的份量
      g.add(m);
      return { r: g, l: null };
    }
    if (weapon === 'polearm') {
      const [staff, dagger] = await Promise.all([
        preloadWeapon('models/chars/staff.gltf'),
        preloadWeapon('models/chars/dagger.gltf'),
      ]);
      if (!staff) return { r: null, l: null };
      const g = new THREE.Group();
      const shaft = staff.clone();
      shaft.scale.set(0.85, 1.35, 0.85);  // 拉長杖身作槍桿
      g.add(shaft);
      if (dagger) {
        const box = new THREE.Box3().setFromObject(shaft);
        const tip = dagger.clone();        // 匕首作槍頭
        tip.scale.setScalar(1.5);
        tip.position.y = box.max.y - 0.02;
        g.add(tip);
      }
      return { r: g, l: null };
    }
    // sword_shield：單手劍 + 盾徽盾
    const [r, l] = await Promise.all([
      preloadWeapon('models/chars/sword_1handed.gltf'),
      preloadWeapon('models/chars/shield_badge.gltf'),
    ]);
    return { r, l };
  })();
  return _weaponTplCache[weapon];
}

let _weaponReq = 0;   // 防快速切換競態：只套用最後一次請求
async function _attachRiggedWeapons(weapon) {
  if (!_rv) return;
  const req = ++_weaponReq;
  const { r, l } = await _getWeaponTemplate(weapon);
  if (_rv && req === _weaponReq) _rv.setWeapons(r, l);
}

/** 身體發光（i-frame 藍光 / Embolden 金光 / 受擊紅閃）— rigged 與體素通用 */
function setBodyEmissive(hex, intensity) {
  if (_rv) _rv.setEmissive(hex, intensity);
  else if (_rig) _rig.setEmissive(hex, intensity);
}

// ─── Voxel Rig ────────────────────────────────────────────────
let _rig = null;  // createVoxelRig() 返回的完整骨架
// 方便 animation 函數直接引用
let _torso = null, _armR = null, _armL = null;
const ARM_R0 = -0.3;  // 右肩 combat resting angle（不隨武器改變）
let ARM_L0 = -0.2;    // 左肩 resting angle（隨武器類型變化）
const SW = 0.9; // swing duration seconds

// Weapon-specific idle poses (from HTML reference)
const IDLE_POSE = {
  sword_shield: { aRx: -0.55, aRz:  0.15, aLx: -0.45, aLz: -0.10, uY: 0.4, uX: 0.02 },
  greatsword:   { aRx: -0.95, aRz:  0.00, aLx: -1.05, aLz:  0.00, uY: 0.6, uX: 0.06 },
  polearm:      { aRx: -0.50, aRz:  0.00, aLx: -0.70, aLz:  0.00, uY: 0.5, uX: 0.03 },
};
const TWO_HAND_WEAPONS = new Set(['greatsword', 'polearm']);

// ─── Visual offset（純視覺位移，不影響 physics）────────────────
const _vOff = new THREE.Vector3();

// ─── updatePlayer 每幀重用的 scratch 物件（避免 GC 壓力）──────
const _mvFwd = new THREE.Vector3(), _mvRight = new THREE.Vector3(), _mvDir = new THREE.Vector3();
const _camEuler  = new THREE.Euler();
const _camPitchQ = new THREE.Quaternion(), _camYawQ = new THREE.Quaternion();
const _camOffset = new THREE.Vector3(), _camLook = new THREE.Vector3(), _camDest = new THREE.Vector3();

// ─── Swing / Impact maps ──────────────────────────────────────
const SWING_MAP = {
  shield_bash: 'bash', smash: 'chop_quick', smash_2: 'slash2', force_impact: 'thrust', sonic_boom: 'sweep',
  behemoths_tail: 'gs_sweep', heavy_smash: 'chop', crumble_storm: 'spin', cleave: 'diag', slam_attack: 'slam',
  lance_sweep: 'pl_sweep', lance_charge: 'pl_thrust', big_step: 'pl_leap', whirlwind_lance: 'pl_spin',
  tackle: 'shoulder', embolden: 'raise', reinforce_guard: 'guard',
};

// 換武器時更新 rig 武器 + HUD
const _weaponIcons = { sword_shield: '⚔', greatsword: '🗡', polearm: '🔱' };
function updateWeaponMesh(weapon) {
  if (_rv) {
    _attachRiggedWeapons(weapon);
  } else if (_rig) {
    _rig.buildWeapon(weapon);
    _updateHandPose(weapon);
  } else return;
  playerWeaponGroup = null; // 武器現在由 rig 管理
  const el = document.getElementById('weapon-display');
  if (el) el.innerHTML = `${(_weaponIcons[weapon] || '') + ' ' + weaponLabel(weapon)}　<span style="color:#aaa;font-size:10px;">${t('g_tab_weapon')}</span>`;
}

function _updateHandPose(weapon) {
  if (!_rig) return;
  if (weapon === 'greatsword') {
    _rig.armL.shoulder.position.set(-0.30, 0.55, 0.05);
    ARM_L0 = -0.55;
  } else if (weapon === 'polearm') {
    _rig.armL.shoulder.position.set(-0.32, 0.55, 0.05);
    ARM_L0 = -0.40;
  } else {
    _rig.armL.shoulder.position.set(-0.48, 0.62, 0);
    ARM_L0 = -0.20;
  }
  if (_armL) _armL.shoulder.rotation.set(ARM_L0, 0, 0);
}

function buildPlayerMesh() {
  const g = new THREE.Group();
  g.position.copy(playerPos);
  scene.add(g);
  playerGroup = g;

  // 建立體素角色 rig（藍方板甲戰士）
  _rig = createVoxelRig({
    headId:   'helmet',
    upperId:  'plate',
    lowerId:  'greaves',
    weaponId: treeState.weapon,
    colorHex: 0x4f7fc0,
    scale:    0.65,
  });
  g.add(_rig.group);

  // 快捷參照，供 animation 函數使用
  _torso = _rig.torsoAnchor;
  _armR  = _rig.armR;
  _armL  = _rig.armL;

  // 初始肩部角度（combat resting）
  _armR.shoulder.rotation.x = ARM_R0;
  _armL.shoulder.rotation.x = ARM_L0;

  // Apply weapon-specific arm pose
  _updateHandPose(treeState.weapon);

  // playerBody_ 指向主要軀幹 mesh（供舊版 emissive/squish 效果）
  playerBody_ = null; // 已改由 _rig.setEmissive / pelvis.scale 處理

  // KayKit 骨骼動畫角色：載入成功後隱藏體素 rig（失敗保留 fallback）
  rebuildPlayerAppearance();
}

/** 按外觀設定（ui/appearance.js）重建玩家模型；變更時即時呼叫並廣播。
 *  kind='weapon'（大劍/戰斧皮膚）只重掛武器——重建整個模型會與武器掛載競態，
 *  造成「有時只見大劍有時只見斧」。 */
let _appearanceReq = 0;
async function rebuildPlayerAppearance(kind) {
  if (kind === 'weapon' || kind === 'chain') {
    // weapon：只換武器；chain：只廣播鏈上 payload（地址綁定）——皆不重建模型
    if (kind === 'weapon') _attachRiggedWeapons(treeState.weapon);
    if (kind === 'chain' && suiState.connected) _ensureSuiAuth();   // 連接後簽章驗身
    if (room) room.send('appearance', appearanceToNet());
    return;
  }
  const req = ++_appearanceReq;
  try {
    const v = await buildAppearanceRig(appearance);
    if (!v || req !== _appearanceReq || !playerGroup) return;
    if (_rv) playerGroup.remove(_rv.group);
    _rv = v;
    // playerGroup 原點 = playerPos.y - 0.35 = 膠囊底（地面），模型底(y=0)直接對齊
    v.group.position.y = 0;
    playerGroup.add(v.group);
    if (_rig) _rig.group.visible = false;
    _attachRiggedWeapons(treeState.weapon);
    v.play('Idle');
    if (room) room.send('appearance', appearanceToNet());
  } catch { /* 載入失敗：保留現有模型 / 體素 fallback */ }
}

// ─── Body Animation System ────────────────────────────────────
const _animEffects = [];
let _swinging = false;  // 技能動畫進行中：鎖定新技能輸入
let _hitStop = 0;
function _addAnim(e) { _animEffects.push(e); }
function _updateAnims(dt) {
  for (let i = _animEffects.length - 1; i >= 0; i--)
    if (!_animEffects[i].update(dt)) _animEffects.splice(i, 1);
}

function _triggerImpact(strong) {
  _hitStop  = Math.max(_hitStop, strong ? 0.09 : 0.05);
  camShake  = Math.max(camShake, strong ? 0.55 : 0.28);
  _fovPunch = Math.max(_fovPunch, strong ? 1 : 0.55);   // 鏡頭瞬間收縮再回彈
}

// ─── Blade Trail ──────────────────────────────────────────────
const TRAIL_N = 16;
let _trailMesh = null, _trailPts = [], _trailActive = false;
const TRAIL_COLOR = { sword_shield: 0x7fc8ff, greatsword: 0xffa336, polearm: 0x66e6a6 };

function _bladeTipBase() {
  if (_rv) {
    const w = _rv.weaponR;
    if (!w) return null;
    return {
      tip:  w.localToWorld(new THREE.Vector3(0, _rv.weaponTipY, 0)),
      base: w.localToWorld(new THREE.Vector3(0, _rv.weaponBaseY, 0)),
    };
  }
  if (!_armR) return null;
  const hand = _armR.hand;
  if (!hand || !hand.children.length) return null;
  const wg = hand.children[0];
  if (!wg) return null;
  let tipY, baseY;
  switch (treeState.weapon) {
    case 'greatsword': tipY = -0.37; baseY = -1.47; break;
    case 'polearm':    tipY = -2.10; baseY = -0.85; break;
    default:           tipY = -0.15; baseY = -0.85; break;
  }
  return {
    tip:  wg.localToWorld(new THREE.Vector3(0, tipY,  0)),
    base: wg.localToWorld(new THREE.Vector3(0, baseY, 0)),
  };
}

function _startTrail() {
  _trailActive = true; _trailPts = [];
  if (!_trailMesh) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i*2, b = i*2+1, c = (i+1)*2, d = (i+1)*2+1;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    _trailMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    _trailMesh.frustumCulled = false;
    scene.add(_trailMesh);
  }
  _trailMesh.userData.trailColor = new THREE.Color(TRAIL_COLOR[treeState.weapon] || 0x7fc8ff);
  _trailMesh.material.opacity = 0.7;
  _trailMesh.visible = true;
}

function _updateTrail() {
  if (!_trailActive || !_trailMesh) return;
  const tb = _bladeTipBase(); if (!tb) return;
  _trailPts.unshift({ tip: tb.tip.clone(), base: tb.base.clone() });
  if (_trailPts.length > TRAIL_N) _trailPts.pop();
  const pos = _trailMesh.geometry.attributes.position.array;
  const col = _trailMesh.geometry.attributes.color.array;
  const c   = _trailMesh.userData.trailColor;
  for (let i = 0; i < TRAIL_N; i++) {
    const p = _trailPts[Math.min(i, _trailPts.length - 1)];
    const f = (1 - i / TRAIL_N);
    pos[i*6]=p.tip.x;  pos[i*6+1]=p.tip.y;  pos[i*6+2]=p.tip.z;
    pos[i*6+3]=p.base.x;pos[i*6+4]=p.base.y;pos[i*6+5]=p.base.z;
    for (let j = 0; j < 2; j++) { col[i*6+j*3]=c.r*f; col[i*6+j*3+1]=c.g*f; col[i*6+j*3+2]=c.b*f; }
  }
  _trailMesh.geometry.attributes.position.needsUpdate = true;
  _trailMesh.geometry.attributes.color.needsUpdate = true;
}

function _stopTrail() {
  _trailActive = false;
  if (!_trailMesh) return;
  let o = 0.7;
  const fade = () => { o -= 0.08; if (_trailMesh) _trailMesh.material.opacity = Math.max(0, o); if (o > 0) requestAnimationFrame(fade); else if (_trailMesh) _trailMesh.visible = false; };
  fade();
}

function _sStep(x) { return x * x * (3 - 2 * x); }

function punchEase(k) {
  return k < 0.35 ? (k / 0.35) * (k / 0.35) * 0.42 : 0.42 + (1 - Math.pow(1 - (k - 0.35) / 0.65, 2.4)) * 0.58;
}

function _bendElbows() {
  if (_rv) return;
  if (_armR && _armR.elbow)
    _armR.elbow.rotation.x = THREE.MathUtils.clamp(-0.15 - _armR.shoulder.rotation.x * 0.06, -0.5, 0.05);
  if (_armL && _armL.elbow)
    _armL.elbow.rotation.x = THREE.MathUtils.clamp(-0.15 - _armL.shoulder.rotation.x * 0.06, -0.5, 0.05);
}

// 2-bone IK: 讓左手握住雙手武器握把（greatsword/polearm）
const _ikGripWorld = new THREE.Vector3();
function _gripLeftHand() {
  if (_rv) return;
  if (!_armL || !_armR || !_torso) return;
  if (!TWO_HAND_WEAPONS.has(treeState.weapon)) return;
  const hand = _armR.hand;
  if (!hand || !hand.children.length) return;
  const wg = hand.children[0];
  if (!wg) return;
  // Grip point on weapon (local Y offset per weapon type)
  const gripY = treeState.weapon === 'greatsword' ? 0.15 : 0.35;
  _torso.updateWorldMatrix(true, true);
  wg.localToWorld(_ikGripWorld.set(0, gripY, 0));
  // Transform grip into torso local space
  const torsoInv = new THREE.Matrix4().copy(_torso.matrixWorld).invert();
  const targetLocal = _ikGripWorld.clone().applyMatrix4(torsoInv);
  const shoulderLocal = _armL.shoulder.position.clone();
  const dir = targetLocal.sub(shoulderLocal);
  const dist = Math.min(dir.length(), 0.84);
  dir.normalize();
  // Point shoulder toward grip (-Y = arm rest direction)
  _armL.shoulder.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  // 2-bone IK: bend elbow based on distance
  const uL = 0.42, fL = 0.42, L = Math.max(0.2, dist);
  const cosA = THREE.MathUtils.clamp((uL*uL + fL*fL - L*L) / (2*uL*fL), -1, 1);
  _armL.elbow.rotation.set(-(Math.PI - Math.acos(cosA)), 0, 0);
}

function _prepAnim(style, dur = 0.25) {
  if (_rv || !_torso) return;   // rigged 模式：攻擊剪輯內含前搖
  let t = 0; const target = {};
  switch (style) {
    case 'slash':      target.uY =  0.6; target.aRx =  0.2; break;
    case 'slash2':     target.uY =  0.7; target.aRx =  0.1; break;
    case 'chop_quick': target.aRx =  1.7; target.uX = -0.15; break;
    case 'chop':       target.aRx =  2.2; target.uX = -0.25; break;
    case 'diag':       target.aRx =  1.9; target.uY =  0.6; break;
    case 'gs_sweep':   target.uY  =  1.2; target.aRx = -0.5; break;
    case 'sweep':      target.uY  =  1.0; target.aRx = -1.3; break;
    case 'thrust':     target.uX  = -0.2; target.aRx = -0.5; break;
    case 'slam':       target.aRx =  2.2; break;
    case 'bash':       target.aLx =  0.5; target.uY =  0.3; break;
    case 'spin':       target.aRx = -1.3; break;
    case 'shoulder':   target.uX  = -0.2; target.aRx = 0.6; target.aLx = 0.6; break;
    case 'pl_sweep':   target.uY  =  0.9; target.aRx = ARM_R0; break;
    case 'pl_thrust':  target.uX  = -0.25; target.aRx = ARM_R0; break;
    case 'pl_leap':    target.uX  = -0.2;  target.aRx = ARM_R0; break;
    case 'pl_spin':    target.aRx = ARM_R0; break;
    case 'raise': break;
    case 'guard': break;
  }
  const s0 = {
    uX: _torso.rotation.x, uY: _torso.rotation.y,
    aRx: _armR ? _armR.shoulder.rotation.x : ARM_R0,
    aLx: _armL ? _armL.shoulder.rotation.x : ARM_L0,
    pY: _rig ? _rig.pelvis.position.y : 1.0,
  };
  _addAnim({ combat: true, update(dt) {
    t += dt; const k = Math.min(t / dur, 1);
    _torso.rotation.x = s0.uX + ((target.uX || 0) - s0.uX) * k;
    _torso.rotation.y = s0.uY + ((target.uY || 0) - s0.uY) * k;
    if (_armR) _armR.shoulder.rotation.x = s0.aRx + ((target.aRx != null ? target.aRx : ARM_R0) - s0.aRx) * k;
    if (_armL) _armL.shoulder.rotation.x = s0.aLx + ((target.aLx != null ? target.aLx : ARM_L0) - s0.aLx) * k;
    // 前搖蓄力：屈膝下沉（anticipation）
    if (_rig) {
      _rig.pelvis.position.y = s0.pY + (0.92 - s0.pY) * k;
      _rig.legL.knee.rotation.x = 0.35 * k;
      _rig.legR.knee.rotation.x = 0.35 * k;
      _rig.legL.hip.rotation.x = -0.18 * k;
      _rig.legR.hip.rotation.x = -0.18 * k;
    }
    if (t >= dur) return false;
    return true;
  }});
}

function _recoverAnim(dur) {
  if (_rv || !_torso) return;
  const norm = a => Math.atan2(Math.sin(a), Math.cos(a));
  const s0 = {
    uX: _torso.rotation.x, uY: norm(_torso.rotation.y), uZ: _torso.rotation.z,
    aRx: _armR ? _armR.shoulder.rotation.x : ARM_R0,
    aRy: _armR ? _armR.shoulder.rotation.y : 0,
    aRz: _armR ? _armR.shoulder.rotation.z : 0,
    reRx: _armR && _armR.elbow ? _armR.elbow.rotation.x : 0,
    leRx: _armL && _armL.elbow ? _armL.elbow.rotation.x : 0,
  };
  const qL0    = _armL ? _armL.shoulder.quaternion.clone() : new THREE.Quaternion();
  const qLrest = new THREE.Quaternion().setFromEuler(new THREE.Euler(ARM_L0, 0, 0));
  const legs0 = _rig ? {
    pY: _rig.pelvis.position.y,
    lh: _rig.legL.hip.rotation.x, lk: _rig.legL.knee.rotation.x,
    rh: _rig.legR.hip.rotation.x, rk: _rig.legR.knee.rotation.x,
  } : null;
  let t = 0;
  _addAnim({ combat: true, update(dt) {
    t += dt; const k = Math.min(t / dur, 1); const e = _sStep(k);
    const stanceUY = (IDLE_POSE[treeState.weapon] || IDLE_POSE.sword_shield).uY || 0;
    _torso.rotation.x = s0.uX * (1 - e);
    _torso.rotation.y = s0.uY + (stanceUY - s0.uY) * e;
    _torso.rotation.z = s0.uZ * (1 - e);
    if (_armR) {
      _armR.shoulder.rotation.x = s0.aRx + (ARM_R0 - s0.aRx) * e;
      _armR.shoulder.rotation.y = s0.aRy * (1 - e);
      _armR.shoulder.rotation.z = s0.aRz * (1 - e);
      if (_armR.elbow) _armR.elbow.rotation.x = s0.reRx * (1 - e);
    }
    if (_armL) {
      _armL.shoulder.quaternion.copy(qL0).slerp(qLrest, e);
      if (_armL.elbow) _armL.elbow.rotation.x = s0.leRx * (1 - e);
    }
    // 下半身回正
    if (_rig && legs0) {
      _rig.pelvis.position.y = legs0.pY + (1.0 - legs0.pY) * e;
      _rig.legL.hip.rotation.x  = legs0.lh * (1 - e);
      _rig.legL.knee.rotation.x = legs0.lk * (1 - e);
      _rig.legR.hip.rotation.x  = legs0.rh * (1 - e);
      _rig.legR.knee.rotation.x = legs0.rk * (1 - e);
    }
    if (t >= dur) {
      if (_armL) _armL.shoulder.rotation.set(ARM_L0, 0, 0);
      return false;
    }
    return true;
  }});
}

// 有位移的技能（physics 已處理，跳過視覺位移避免重複）
const _PHYSICS_MOVE = new Set(['tackle', 'lance_charge', 'big_step']);

// 參照 HTML MOVE 表：每種揮擊動作的 back / fwd / jump（單位：公尺）
const MOVE_TABLE = {
  slash:      { fwd: 0.9,  back: 0.25 },
  slash2:     { fwd: 0.8,  back: 0.25 },
  chop_quick: { fwd: 0.9,  back: 0.3  },
  chop:       { fwd: 1.1,  back: 0.5,  jump: 0.4  },
  diag:       { fwd: 1.1,  back: 0.45, jump: 1.6  },
  gs_sweep:   { fwd: 0.9,  back: 0.6  },
  sweep:      { fwd: 0.9,  back: 0.35 },
  thrust:     { fwd: 1.9,  back: 0.6  },
  slam:       { fwd: 0.9,  back: 0.3,  jump: 1.8  },
  bash:       { fwd: 1.2,  back: 0.45 },
  spin:       { fwd: 0.3,  jump: 0.25 },
  shoulder:   { fwd: 2.3,  back: 0.7  },  // tackle - 由 physics 處理
  pl_sweep:   { fwd: 0.9,  back: 0.35 },
  pl_thrust:  { fwd: 1.9,  back: 0.6  },  // lance_charge - 由 physics 處理
  pl_leap:    { fwd: 2.1,  back: 0.45, jump: 0.7  }, // big_step - 由 physics 處理
  pl_spin:    { fwd: 0.3,  jump: 0.25 },
  raise:      {},
  guard:      {},
};

/**
 * 位移動畫：後退蓄力 → 向前突進 → 停在前衝終點
 * 每幀直接增量移動 playerPos + charBody，不依賴末尾 commit，避免回彈。
 * _vOff 只用於垂直跳躍高度（不影響 XZ）。
 */
function _moveStrikeAnim(skillId, style, facing, dur = SW) {
  if (_PHYSICS_MOVE.has(skillId)) return; // physics 已處理
  const M = MOVE_TABLE[style];
  if (!M || (!M.fwd && !M.jump && !M.back)) return;

  const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  // rigged 模式：KayKit 剪輯已含身體動態，跳躍視覺位移歸零（避免飛天），只保留前後突進
  const back = M.back || 0, fwd = M.fwd || 0, jumpH = _rv ? 0 : (M.jump || 0);
  const ka = 0.25, kb = 0.58;
  let t = 0, prevH = 0;

  _vOff.set(0, 0, 0);
  _addAnim({ combat: true, update(dt) {
    t += dt; const k = Math.min(t / dur, 1);
    let h;
    if      (k < ka) h = -back * (k / ka);
    else if (k < kb) h = -back + (back + fwd) * _sStep((k - ka) / (kb - ka));
    else             h = fwd;

    // 每幀增量直接移動物理座標，不再靠末尾 commit
    const dh = h - prevH;
    prevH = h;
    playerPos.x += dir.x * dh;
    playerPos.z += dir.z * dh;
    if (charBody) charBody.setNextKinematicTranslation({ x: playerPos.x, y: playerPos.y + 0.5, z: playerPos.z });
    if (playerGroup) { playerGroup.position.x = playerPos.x; playerGroup.position.z = playerPos.z; }

    // 垂直跳躍仍用 _vOff.y（不影響 physics）
    const y = jumpH * Math.sin(Math.min(Math.max((k - 0.05) / 0.85, 0), 1) * Math.PI);
    _vOff.set(0, y, 0);

    if (t >= dur) {
      _vOff.set(0, 0, 0);
      return false;
    }
    return true;
  }});
}

/**
 * 揮擊動畫：dur = 主要揮擊時長，結束後自動接 _recoverAnim(recoverDur)
 * （時長由攻擊狀態機依技能 active/recovery 決定）
 */
function _swingAnim(style, dur = SW, recoverDur = 0.4) {
  if (_rv || !_torso) return;   // rigged 模式：攻擊剪輯處理，拖尾由 FSM 控制
  let t = 0;
  _startTrail();
  _addAnim({ combat: true, update(dt) {
    t += dt;
    const kRaw = Math.min(t / dur, 1);
    const k = punchEase(kRaw);
    const s = Math.sin(k * Math.PI);
    // 每幀從乾淨基準開始：沒有指定 Y 軸的樣式（chop/thrust 系）
    // 否則下方 stance blend 的 += 會逐幀累積，造成身體無限旋轉
    _torso.rotation.y = 0;
    switch (style) {
      case 'slash':
        _torso.rotation.y = 0.6 - 1.4 * k;
        if (_armR) _armR.shoulder.rotation.x = 0.2 - 1.0 * k;
        break;
      case 'slash2': {
        const seg = k < 0.5 ? 0 : 1;
        const local = (k - seg * 0.5) / 0.5;
        const chop = Math.sin(local * Math.PI);
        if (_armR) _armR.shoulder.rotation.x = 0.8 - 2.0 * chop;
        _torso.rotation.x = 0.28 * chop;
        _torso.rotation.y = seg === 0 ? 0.28 : -0.28;
        break;
      }
      case 'chop_quick':
        if (_armR) _armR.shoulder.rotation.x = 1.7 - 2.4 * k;
        _torso.rotation.x = -0.15 + 0.35 * k;
        break;
      case 'chop':
        if (_armR) _armR.shoulder.rotation.x = 2.2 - 3.2 * k;
        _torso.rotation.x = -0.25 + 0.65 * k;
        break;
      case 'diag':
        if (_armR) _armR.shoulder.rotation.x = 1.9 - 2.9 * k;
        _torso.rotation.y = 0.6 - 1.2 * k;
        _torso.rotation.x = 0.2 * k;
        break;
      case 'gs_sweep': {
        const swings = 4; const p = k * swings;
        const segN = Math.floor(p) % 2; const local2 = p - Math.floor(p);
        const dirn = segN === 0 ? 1 : -1;
        _torso.rotation.y = dirn * (1.2 - 2.4 * local2);
        if (_armR) _armR.shoulder.rotation.x = -0.5;
        _torso.rotation.x = 0.15;
        break;
      }
      case 'sweep':
        _torso.rotation.y = 1.0 - 2.0 * k;
        if (_armR) _armR.shoulder.rotation.x = -1.3;
        break;
      case 'thrust':
        _torso.rotation.x = -0.2 + 0.5 * s;
        if (_armR) _armR.shoulder.rotation.x = -0.5 - 1.0 * s;
        break;
      case 'slam':
        if (_armR) _armR.shoulder.rotation.x = 2.2 - 3.0 * k;
        _torso.rotation.x = 0.5 * k;
        break;
      case 'bash':
        if (_armL) _armL.shoulder.rotation.x = 0.5 - 1.9 * s;
        _torso.rotation.x = 0.3 * s;
        _torso.rotation.y = 0.3 - 0.3 * k;
        break;
      case 'spin':
        _torso.rotation.y = -(k * 6.283);
        if (_armR) _armR.shoulder.rotation.x = -1.3;
        break;
      case 'shoulder':
        _torso.rotation.x = -0.2 + 0.7 * s;
        if (_armR) _armR.shoulder.rotation.x = 0.6 - 0.3 * k;
        if (_armL) _armL.shoulder.rotation.x = 0.6 - 0.3 * k;
        break;
      case 'pl_sweep':
        _torso.rotation.y = 0.9 - 1.8 * k;
        if (_armR) _armR.shoulder.rotation.x = ARM_R0;
        break;
      case 'pl_thrust':
        _torso.rotation.x = -0.25 + 0.55 * s;
        if (_armR) _armR.shoulder.rotation.x = ARM_R0 - 0.25 * s;
        break;
      case 'pl_leap':
        _torso.rotation.x = -0.2 + 0.5 * s;
        if (_armR) _armR.shoulder.rotation.x = ARM_R0 - 0.25 * s;
        break;
      case 'pl_spin':
        _torso.rotation.y = -(k * 6.283);
        if (_armR) _armR.shoulder.rotation.x = ARM_R0;
        break;
      case 'raise': {
        const kk = Math.min(1, k * 2);
        if (_armR) _armR.shoulder.rotation.x = 2.0 * kk;
        if (_armL) _armL.shoulder.rotation.x = 1.6 * kk;
        _torso.rotation.x = -0.2 * kk;
        break;
      }
      case 'guard': {
        const kk = Math.min(1, k * 2);
        if (_armR) _armR.shoulder.rotation.x = ARM_R0 - 1.0 * kk;
        if (_armL) _armL.shoulder.rotation.x = ARM_L0 - 1.1 * kk;
        _torso.rotation.x = 0.2 * kk;
        break;
      }
    }
    // Idle stance blend during swing (matches HTML reference)
    if (style !== 'spin' && style !== 'pl_spin') {
      const stance = (IDLE_POSE[treeState.weapon] || IDLE_POSE.sword_shield).uY || 0;
      const isTwo = TWO_HAND_WEAPONS.has(treeState.weapon);
      const blend = Math.min(1, Math.min(kRaw, 1 - kRaw) * 3.5);
      const keep = isTwo ? (1 - blend * 0.95) : (1 - blend * 0.7);
      _torso.rotation.y += stance * keep;
    }
    // Elbow follow
    if (style !== 'raise' && style !== 'guard') {
      _bendElbows();
      if (style !== 'pl_spin' && style !== 'spin' && TWO_HAND_WEAPONS.has(treeState.weapon)) _gripLeftHand();
    }
    // 下半身：弓步（前腳屈、後腳蹬，揮擊中段最深）
    if (_rig && style !== 'raise' && style !== 'guard') {
      const lunge = Math.sin(Math.min(kRaw, 1) * Math.PI) * 0.55;
      _rig.legR.hip.rotation.x  = -0.45 * lunge;
      _rig.legR.knee.rotation.x =  0.65 * lunge;
      _rig.legL.hip.rotation.x  =  0.32 * lunge;
      _rig.legL.knee.rotation.x =  0.18 * lunge;
      _rig.pelvis.position.y    = 1.0 - 0.10 * lunge;
    }
    if (t >= dur) { _stopTrail(); _recoverAnim(recoverDur); return false; }
    return true;
  }});
}

// ─── Towers ──────────────────────────────────────────────────
// createTower / updateTowers / shootArrow → src/entities/tower.js

// placeTower / placeObelisk → src/ui/buildMenu.js
// worldToScreen / showDmgNum / updateDmgNumbers → src/effects/dmgNumbers.js

// ─── Debug Panel ─────────────────────────────────────────────
function toggleDebugPanel() {
  const panel = document.getElementById('debug-panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function unlockAllSkills() {
  for (const id in SKILL_DEFS) treeState.learned[id] = 3;
  treeState.points = 40;
  const common = ['embolden', 'reinforce_guard', 'tackle'];
  const weaponSkills = WEAPON_SKILL_LISTS[treeState.weapon] || [];
  const all = [...common, ...weaponSkills];
  for (let i = 0; i < 9; i++) treeState.slots[i] = all[i] || null;
  refreshSkillPanel();
  updateSkillBarHUD();
}

function initDebugPanel() {
  const chkPw  = document.getElementById('dbg-infinite-pw');
  const chkHit = document.getElementById('dbg-one-hit');
  const chkCd  = document.getElementById('dbg-no-cd');
  const btnUnlock = document.getElementById('dbg-unlock-skills');
  const btnSp  = document.getElementById('dbg-reset-sp');
  const btnHp  = document.getElementById('dbg-full-hp');
  if (!chkPw) return;
  // 解鎖全技能：所有技能 LV3，自動填入槽位 1-9
  btnUnlock?.addEventListener('click', () => { unlockAllSkills(); showAnnounce(t('g_unlock_done')); });
  document.getElementById('dbg-lang')?.addEventListener('click', toggleLang);
  onLangChange(() => {
    const el = document.getElementById('weapon-display');
    if (el) el.innerHTML = `${(_weaponIcons[treeState.weapon] || '') + ' ' + weaponLabel(treeState.weapon)}　<span style="color:#aaa;font-size:10px;">${t('g_tab_weapon')}</span>`;
  });
  chkPw.addEventListener('change',  () => { debug.infinitePw = chkPw.checked; if (debug.infinitePw) { pw = maxPw; updatePwBar(pw, maxPw); } });
  chkHit.addEventListener('change', () => { debug.oneHit     = chkHit.checked; });
  chkCd.addEventListener('change',  () => { debug.noCD       = chkCd.checked; if (debug.noCD) for (const k in treeState.cdTimers) treeState.cdTimers[k] = 0; });
  btnSp.addEventListener('click',   () => { treeState.points = 40; refreshSkillPanel(); document.getElementById('sp-count').textContent = 40; });
  btnHp.addEventListener('click',   () => { if (room && mySessionId) room.send('debugHeal'); hp = 100; updateHpBar(100, 100); });
  // 畫質切換（低/中/高）
  const qBtns = document.querySelectorAll('.q-btn');
  const syncQBtns = () => qBtns.forEach(b => b.classList.toggle('q-on', b.dataset.q === getQuality()));
  qBtns.forEach(b => b.addEventListener('click', () => {
    applyQuality(b.dataset.q);
    syncQBtns();
    showAnnounce(t('g_quality_set', { q: t('g_' + b.dataset.q) }));
  }));
  syncQBtns();
}

// ─── PW System ───────────────────────────────────────────────
function updatePW(dt) {
  // 無限 PW 模式
  if (debug.infinitePw) { pw = maxPw; updatePwBar(pw, maxPw); }
  // +1 PW/s, +3/s 蹲下（C 鍵 + 落地）
  else if (pw < maxPw) {
    const regenRate = (keys['KeyC'] && isGrounded) ? 3.0 : 1.0;
    pwRecoverTimer += dt * regenRate;
    if (pwRecoverTimer >= 1.0) { pwRecoverTimer -= 1.0; pw = Math.min(maxPw, pw + 1); updatePwBar(pw, maxPw); }
  }
  // Embolden 倒數
  if (emboldened) {
    emboldenTimer -= dt;
    if (emboldenTimer <= 0) {
      emboldened = false;
      setBodyEmissive(0x000000, 0);
      document.getElementById('buff-flash').style.opacity = '0';
    }
  }
  // Reinforce Guard 倒數
  if (reinforced) {
    reinforceTimer -= dt;
    if (reinforceTimer <= 0) { reinforced = false; }
  }
  // SP 耐力回復（消耗後延遲 0.7s，之後快速回滿）
  if (spRegenDelay > 0) {
    spRegenDelay -= dt;
  } else if (sp < SP_MAX) {
    sp = Math.min(SP_MAX, sp + SP_REGEN * dt);
    updateSpBar(sp, SP_MAX);
  }
  // 技能 CD（treeState.cdTimers）
  updateSkillCDs(dt);
  // 召喚技能 CD
  for (const k in summonSkillCds) {
    if (summonSkillCds[k] > 0) summonSkillCds[k] = Math.max(0, summonSkillCds[k] - dt);
  }
  // HUD 更新
  updateSkillBarHUD();
}


// ─── Skill Bar HUD 更新 ───────────────────────────────────────
// 此函數每幀執行：DOM refs 只查一次，值未變不寫入 DOM
let _hudRefs = null;
function _getHudRefs() {
  if (_hudRefs) return _hudRefs;
  const slots = [];
  for (let i = 0; i < 9; i++) {
    const n = i + 1;
    const slotEl = document.getElementById(`slot-${n}`);
    const cdEl   = document.getElementById(`cd-${n}`);
    if (!slotEl || !cdEl) { slots.push(null); continue; }
    let pwEl = slotEl.querySelector('.skill-pw');
    if (!pwEl) { pwEl = document.createElement('span'); pwEl.className = 'skill-pw'; slotEl.appendChild(pwEl); }
    let nmEl = slotEl.querySelector('.skill-name-sm');
    if (!nmEl) { nmEl = document.createElement('div'); nmEl.className = 'skill-name-sm'; slotEl.insertBefore(nmEl, slotEl.querySelector('.skill-key')); }
    slots.push({
      slotEl, cdEl, pwEl, nmEl,
      iconEl: slotEl.querySelector('.skill-icon'),
      lastIcon: undefined, lastPw: undefined, lastName: undefined, lastCd: undefined,
    });
  }
  _hudRefs = {
    lmbEl: document.getElementById('cd-lmb'),
    lmbSlot: document.getElementById('slot-lmb'),
    lastLmbCd: undefined,
    slots,
  };
  return _hudRefs;
}

function updateSkillBarHUD() {
  const R = _getHudRefs();

  // ── 召喚模式：顯示召喚物專屬技能組（FEZ：依召喚類型不同）──
  if (s.active) {
    const list = SUMMON_SKILLS[s.type] || [];
    const lmbS = s.atkCd > 0.05 ? s.atkCd.toFixed(1) : '';
    if (lmbS !== R.lastLmbCd) {
      R.lastLmbCd = lmbS;
      R.lmbEl.textContent = lmbS;
      R.lmbEl.classList.toggle('show', !!lmbS);
      R.lmbSlot.classList.toggle('ready', !lmbS);
    }
    for (let i = 0; i < 9; i++) {
      const S = R.slots[i];
      if (!S) continue;
      const sk = list[i];
      if (!sk) {
        if (S.lastIcon !== '—') {
          S.lastIcon = '—'; S.lastPw = ''; S.lastName = ''; S.lastCd = '';
          S.iconEl.textContent = '—'; S.pwEl.textContent = ''; S.nmEl.textContent = '';
          S.cdEl.textContent = ''; S.cdEl.classList.remove('show');
          S.slotEl.classList.remove('ready', 'active', 'casting', 'wrong-weapon');
        }
        continue;
      }
      if (S.lastIcon !== sk.icon)   { S.lastIcon = sk.icon;   S.iconEl.textContent = sk.icon; }
      if (S.lastName !== sk.nameZh) { S.lastName = sk.nameZh; S.nmEl.textContent = sk.nameZh; }
      if (S.lastPw !== '')          { S.lastPw = '';          S.pwEl.textContent = ''; }
      const cd = summonSkillCds[sk.id] || 0;
      const cdTxt = cd > 0.05 ? cd.toFixed(1) : '';
      if (cdTxt !== S.lastCd) {
        S.lastCd = cdTxt;
        S.cdEl.textContent = cdTxt;
        S.cdEl.classList.toggle('show', !!cdTxt);
      }
      S.slotEl.classList.toggle('ready', !cdTxt);
      S.slotEl.classList.remove('wrong-weapon', 'active', 'casting');
    }
    return;
  }

  // LMB
  const lmbTxt = atkCd > 0.05 ? atkCd.toFixed(1) : '';
  if (lmbTxt !== R.lastLmbCd) {
    R.lastLmbCd = lmbTxt;
    R.lmbEl.textContent = lmbTxt;
    R.lmbEl.classList.toggle('show', !!lmbTxt);
    R.lmbSlot.classList.toggle('ready', !lmbTxt);
  }

  // Slots 1–9
  for (let i = 0; i < 9; i++) {
    const S = R.slots[i];
    if (!S) continue;
    const sk = getSlotSkill(i);
    if (!sk) {
      if (S.lastIcon !== '—') {
        S.lastIcon = '—'; S.lastPw = ''; S.lastName = ''; S.lastCd = '';
        S.iconEl.textContent = '—'; S.pwEl.textContent = ''; S.nmEl.textContent = '';
        S.cdEl.textContent = ''; S.cdEl.classList.remove('show');
        S.slotEl.classList.remove('ready', 'active', 'casting', 'wrong-weapon');
      }
      continue;
    }
    if (S.lastIcon !== sk.def.icon)   { S.lastIcon = sk.def.icon;   S.iconEl.textContent = sk.def.icon; }
    const pwTxt = sk.stats.pw + 'PW';
    if (S.lastPw !== pwTxt)           { S.lastPw = pwTxt;           S.pwEl.textContent = pwTxt; }
    if (S.lastName !== sk.def.nameZh) { S.lastName = sk.def.nameZh; S.nmEl.textContent = sk.def.nameZh; }

    // 武器不符：灰色遮罩
    const wrongWeapon = sk.def.weapon !== 'common' && sk.def.weapon !== treeState.weapon;
    S.slotEl.classList.toggle('wrong-weapon', wrongWeapon);

    const cd = getCDTimer(sk.id);
    const cdTxt = cd > 0.05 ? cd.toFixed(1) : '';
    if (cdTxt !== S.lastCd) {
      S.lastCd = cdTxt;
      S.cdEl.textContent = cdTxt;
      S.cdEl.classList.toggle('show', !!cdTxt);
    }
    S.slotEl.classList.toggle('ready', !cdTxt && !wrongWeapon);

    // Embolden / Reinforce 高亮
    const isActive = (sk.id === 'embolden' && emboldened) || (sk.id === 'reinforce_guard' && reinforced);
    S.slotEl.classList.toggle('active', isActive);
    // 前搖蓄力中
    S.slotEl.classList.toggle('casting', atk.phase === 'windup' && atk.slot === i);
  }
}

// ─── Skills：按 1–9 啟動（進入攻擊狀態機）─────────────────────
function useSkillSlot(slotIdx) {
  if (!mouse.locked || isDead || hitstunTimer > 0) return;
  if (atk.phase !== 'none') return;   // 攻擊中 / 後搖中不可出招（FEZ：不可緩衝）
  if (sidestepTimer > 0) return;
  if (!isGrounded || landLagTimer > 0) return;  // 空中 / 落地硬直不能出招
  if (isSkillPanelOpen()) return;

  const sk = getSlotSkill(slotIdx);
  if (!sk) return;

  // 衝刺中不能放技能（FEZ §3.3）
  if ((keys['ShiftLeft'] || keys['ShiftRight']) && _isMoveKeyHeld()) {
    showAnnounce(t('g_dash_no_skill'));
    return;
  }

  // 武器配對檢查
  if (sk.def.weapon !== 'common' && sk.def.weapon !== treeState.weapon) {
    showAnnounce(t('g_need_weapon', { weapon: weaponLabel(sk.def.weapon) }));
    return;
  }

  const cd = getCDTimer(sk.id);
  if (!debug.noCD && cd > 0) return;
  if (!debug.infinitePw && pw < sk.stats.pw) { showAnnounce(t('g_pw_low', { n: sk.stats.pw })); return; }

  if (!debug.infinitePw) { pw -= sk.stats.pw; updatePwBar(pw, maxPw); }
  if (!debug.noCD) startCD(sk.id);

  startAttack(slotIdx, sk);
}

function _isMoveKeyHeld() {
  return keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'] ||
         keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'];
}

// 測試用：一擊必殺時傷害倍增（只影響 Dummy，PvP 由 Server 決定）
function effectiveDmg(dmg) { return debug.oneHit ? 99999 : dmg; }

// ─── 攻擊狀態機（FEZ §5）──────────────────────────────────────
/** sk = null 表示 LMB 普攻；面向在此刻鎖定，全程不可取消
 *  opts: { variant: 'slash'|'overhead'|'stab', combo: true（接擊：跳過大半前搖）} */
function startAttack(slotIdx, sk, opts = {}) {
  atk.phase = 'windup';
  atk.t = 0;
  atk.slot = slotIdx;
  atk.hitsDone = 0;
  atk.trace = null;
  atk.queued = null;
  _swinging = true;
  let rvClip = null;
  if (sk) {
    atk.id = sk.id; atk.def = sk.def; atk.stats = sk.stats;
    atk.hits     = sk.def.hits || 1;
    atk.windup   = sk.def.windup   || 0;
    atk.active   = sk.def.active   || 0;
    atk.recovery = sk.def.recovery ?? 0.3;
    atk.style    = SWING_MAP[sk.id] || 'slash';
    atk.variant  = 'skill';
    rvClip = RV_ATTACK[atk.style] || '1H_Melee_Attack_Slice_Horizontal';
  } else {
    const T = LMB_TIMING[treeState.weapon] || LMB_TIMING.sword_shield;
    const variant = opts.variant || 'slash';
    const V = LMB_VARIANTS[variant] || LMB_VARIANTS.slash;
    atk.id = null; atk.def = null; atk.stats = null;
    atk.hits = 1;
    atk.variant   = variant;
    atk.chargeMul = opts.chargeMul || 1;   // 蓄力威力（dmg / 擊飛 / 打擊感共用）
    atk.windup    = T.windup * V.wMul * (opts.combo ? 0.68 : 1);  // combo：接擊仍要看見起手
    atk.active    = Math.max(T.active, variant === 'slash' ? 0.1 : 0.12);  // 掃掠需要時間窗
    atk.recovery  = T.recovery * V.rMul;
    // 樣式 / 剪輯
    if (variant === 'overhead') {
      atk.style = 'chop';
      atk.traceMode = 'reach';
      atk.dmgMul = atk.chargeMul;
      rvClip = (RV_LMB[treeState.weapon] || RV_LMB.sword_shield).overhead;
    } else if (variant === 'stab') {
      atk.style = treeState.weapon === 'polearm' ? 'pl_thrust' : 'thrust';
      atk.traceMode = 'reach';
      atk.dmgMul = atk.chargeMul;
      rvClip = (RV_LMB[treeState.weapon] || RV_LMB.sword_shield).stab;
    } else {
      // 連擊鏈：每段從上一刀收勢位置接續（橫掃→反掃→重劈），不再重複同一動作
      const chain = LMB_COMBO[treeState.weapon] || LMB_COMBO.sword_shield;
      atk.comboIdx = opts.combo ? (_lastComboIdx + 1) % chain.length : 0;
      _lastComboIdx = atk.comboIdx;
      const seg = chain[atk.comboIdx];
      atk.style     = seg.style;
      atk.dirSign   = seg.dirSign;
      atk.traceMode = seg.mode;
      atk.dmgMul    = (seg.dmgMul || 1) * atk.chargeMul;
      if (seg.wMul) atk.windup   *= seg.wMul;
      if (seg.rMul) atk.recovery *= seg.rMul;
      rvClip = seg.clip;
    }
    atkCd = atk.windup + atk.active + atk.recovery;  // HUD 顯示
  }
  if (_rv && rvClip) {
    // KayKit 攻擊剪輯：縮放到 前搖+判定+後搖 總時長（剪輯內含預備動作）
    _rv.play(rvClip, {
      once: true, retrigger: true, clamp: true, fade: opts.combo ? 0.05 : 0.08,
      dur: Math.max(0.3, atk.windup + atk.active + atk.recovery),
    });
  }
  _prepAnim(atk.style, Math.max(0.08, atk.windup));
}

/** 每幀推進攻擊狀態（updatePlayer 內呼叫） */
function updateAttack(dt) {
  if (atk.phase === 'none') return;
  atk.t += dt;

  if (atk.phase === 'windup') {
    if (atk.t >= atk.windup) {
      atk.phase = 'active'; atk.t = 0;
      // 揮擊聲按武器 × 變體：技能用 AoE 類=縱劈級厚重、其餘=橫掃級
      sfxSwing(treeState.weapon, atk.id
        ? (atk.def.kind === 'self_aoe' || atk.def.kind === 'point_aoe' ? 'overhead' : 'slash')
        : atk.variant);
      if (_rv) {
        _startTrail();   // rigged：剪輯演揮擊，拖尾由 FSM 開關
      } else {
        // 揮擊視覺：時長貼合判定窗（最少 0.25s 保持可讀性）
        const visDur = Math.max(0.25, atk.active + 0.12);
        _swingAnim(atk.style, visDur, Math.max(0.2, Math.min(atk.recovery, 0.5)));
      }
      if (atk.id) _moveStrikeAnim(atk.id, atk.style, playerYaw, Math.max(0.3, atk.active + atk.recovery * 0.5));
      doAttackHit(0);
      atk.hitsDone = 1;
    }
  } else if (atk.phase === 'active') {
    // 揮擊掃掠：刀刃掃過誰、誰在那一刻吃傷害（Chivalry 式）
    _updateSwingTrace();
    // 多段命中：在 active 期間平均分段（第二段起可被側閃迴避）
    while (atk.hitsDone < atk.hits && atk.t >= atk.active * atk.hitsDone / atk.hits) {
      doAttackHit(atk.hitsDone);
      atk.hitsDone++;
    }
    if (atk.t >= atk.active) {
      atk.phase = 'recovery'; atk.t = 0;
      atk.trace = null;
      if (_rv) _stopTrail();
    }
  } else if (atk.phase === 'recovery') {
    if (atk.t >= atk.recovery) endAttack();
  }
}

function endAttack() {
  const queued = atk.queued;
  atk.phase = 'none';
  atk.slot = -2;
  atk.trace = null;
  atk.queued = null;
  _swinging = false;
  // Chivalry combo：預約的下一刀立即啟動（跳過大半前搖，保持壓制節奏）
  if (queued && !isDead && hitstunTimer <= 0 && isGrounded && sidestepTimer <= 0) {
    startAttack(-1, null, { variant: queued, combo: true });
  }
}

/** 被打斷（硬直/死亡）：清除 combat 動畫並快速回正。FEZ：PW 不退還。 */
function cancelAttack() {
  if (atk.phase === 'none') return;
  atk.queued = null;   // 被打斷不接 combo
  _stopTrail();
  for (let i = _animEffects.length - 1; i >= 0; i--)
    if (_animEffects[i].combat) _animEffects.splice(i, 1);
  _vOff.set(0, 0, 0);
  endAttack();
  if (_rv) _rv.play('Hit_A', { once: true, dur: 0.35, clamp: true, retrigger: true });
  else _recoverAnim(0.15);
}

/** 第 h 段命中（h 從 0 開始） */
function doAttackHit(h) {
  const isHeavy = atk.id
    ? (atk.def.weapon === 'greatsword' || atk.def.kind === 'self_aoe' || atk.def.kind === 'point_aoe')
    : treeState.weapon === 'greatsword';
  _triggerImpact(isHeavy);
  if (atk.id) {
    fireSkillEffect(atk.def, atk.stats, playerPos.clone().add(_vOff), playerYaw);
    execSkillTick(atk.id, atk.stats, h);
  } else {
    doLmbHit();
  }
}

/** 技能命中分派：dash / projectile / buff 只在第一段執行，扇形與 AoE 每段判定 */
function execSkillTick(id, stats, h) {
  switch (id) {
    case 'embolden':        if (h === 0) execEmbolden(stats); return;
    case 'reinforce_guard': if (h === 0) execReinforceGuard(stats); return;
    case 'tackle':          if (h === 0) execTackle(stats, atk.active || 0.3); return;
    case 'lance_charge':    if (h === 0) execTackle(stats, atk.active || 0.3); return;
    case 'big_step':        if (h === 0) execBigStep(stats, atk.active || 0.2); return;
    case 'force_impact':    if (h === 0) execForceImpact(stats); return;
    // 單發扇形 → 掃掠判定（刀刃實際掃到才結算，Chivalry 式）
    case 'shield_bash':     return _initFanSkillTrace(stats, 'shield_bash');
    case 'smash':           return _initFanSkillTrace(stats, 'smash');
    case 'heavy_smash':     return _initFanSkillTrace(stats, 'heavySmash');
    case 'cleave':          return _initFanSkillTrace(stats, 'cleave');
    case 'lance_sweep':     return _initFanSkillTrace(stats, 'lanceSweep');
    // 多段技保持分段瞬時判定
    case 'smash_2':         return execFanHit(stats, 'smash');
    case 'sonic_boom':      return execSonicBoom(stats);
    case 'behemoths_tail':  return execFanHit(stats, 'smash');
    case 'crumble_storm':
    case 'slam_attack':
    case 'whirlwind_lance': return execAoE(stats);
  }
}

// ─── 揮擊軌跡掃掠（Chivalry 式）────────────────────────────────
// sweep：橫掃，命中時刻 = 刀刃掃到目標角度的時刻（dirSign 決定起點左右）
// reach：縱劈/突刺，命中時刻 = 刃由近到遠延伸到目標距離的時刻
function _initSwingTrace(cfg) {
  atk.trace = {
    ...cfg,
    half: Math.acos(THREE.MathUtils.clamp(cfg.hac ?? 0.707, -1, 1)),
    hitSet: new Set(),
  };
}

function _contactFeedback(pos) {
  spawnHitSparks(pos.clone().setY(pos.y + 1));
  spawnBloodSpray(pos, Math.sin(playerYaw), Math.cos(playerYaw));   // 沿揮擊方向噴血 + 地面血漬
  sfxHit(treeState.weapon === 'greatsword');   // 自己的刀刃接觸：命中聲（sfx 內建節流防多目標疊音）
  if (_hitStop < 0.035) _hitStop = 0.035;   // 每個接觸一記小凍幀（不無限疊加）
  camShake = Math.max(camShake, 0.18);
}

/** 彈劍（Chivalry 2：刀刃砍進肉裡停下，不會無感穿過）
 *  穿透額度用完 → 揮擊立即中止：剪輯凍在命中姿態、後搖加長、重凍幀 */
function _weaponBounce() {
  if (atk.phase !== 'active') return;
  atk.phase = 'recovery';
  atk.t = -atk.recovery * 0.3;    // 負起點 = 後搖多 30%（武器卡進肉裡的代價）
  atk.trace = null;
  _stopTrail();
  if (_rv) _rv.setTimeScale(0.12);   // 剪輯幾乎凍結=武器「停在敵人身上」（下一個 play 會重設）
  _hitStop  = Math.max(_hitStop, 0.085);
  camShake  = Math.max(camShake, 0.34);
  _fovPunch = Math.max(_fovPunch, 0.7);
}

function _updateSwingTrace() {
  const tr = atk.trace;
  if (!tr || atk.active <= 0) return;
  const prog = Math.min(1, atk.t / atk.active);
  const fwdX = Math.sin(playerYaw), fwdZ = Math.cos(playerYaw);
  const rgtX = Math.cos(playerYaw), rgtZ = -Math.sin(playerYaw);

  // 計算目標的命中時刻（0..1），尚未到時刻回傳 -1
  const hitMoment = (px, pz) => {
    const dx = px - playerPos.x, dz = pz - playerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > tr.range || dist < 0.01) return -1;
    const lz = dx * fwdX + dz * fwdZ;
    if (lz <= 0) return -1;
    const ang = Math.atan2(dx * rgtX + dz * rgtZ, lz);   // 右為正
    if (Math.abs(ang) > tr.half) return -1;
    return tr.mode === 'reach'
      ? dist / tr.range
      : ((tr.dirSign || 1) > 0 ? (tr.half - ang) : (ang + tr.half)) / (2 * tr.half);
  };

  // 穿透額度（LMB 限定）：命中數達額度 → 彈劍中止揮擊
  const bounceCheck = () => {
    if (tr.pierce && tr.hitSet.size >= tr.pierce) _weaponBounce();
  };

  // 訓練假人：接觸瞬間結算傷害
  for (const d of dummies) {
    if (!atk.trace) return;   // 已彈劍
    if (!d.alive || tr.hitSet.has(d)) continue;
    const m = hitMoment(d.group.position.x, d.group.position.z);
    if (m >= 0 && prog + 0.001 >= m) {
      tr.hitSet.add(d);
      const dx = d.group.position.x - playerPos.x, dz = d.group.position.z - playerPos.z;
      const len = Math.hypot(dx, dz) || 1;
      tr.onDummy(d, dx / len, dz / len);
      _contactFeedback(d.group.position);
      bounceCheck();
    }
  }
  // 小兵：傷害由 server 結算，這裡做接觸回饋 + 記錄受擊（死亡拋飛方向用）
  for (const [eid, en] of Object.entries(enemies)) {
    if (!atk.trace) return;   // 已彈劍
    if (tr.hitSet.has(en) || en.team === myTeam) continue;
    const m = hitMoment(en.group.position.x, en.group.position.z);
    if (m >= 0 && prog + 0.001 >= m) {
      tr.hitSet.add(en);
      flashEnemyHit(eid);
      markEnemyHit(eid,
        en.group.position.x - playerPos.x, en.group.position.z - playerPos.z,
        tr.hitPower || 5);
      _contactFeedback(en.group.position);
      bounceCheck();
    }
  }
  // 遠端玩家：技能在接觸瞬間送 skillHit（serverKey 存在時）
  if (room && tr.serverKey) {
    for (const [sid, rp] of Object.entries(remotePlayers)) {
      if (!atk.trace) return;   // 已彈劍
      if (tr.hitSet.has(rp) || !rp.group.visible || rp.team === myTeam) continue;
      const m = hitMoment(rp.group.position.x, rp.group.position.z);
      if (m >= 0 && prog + 0.001 >= m) {
        tr.hitSet.add(rp);
        room.send('skillHit', [tr.serverKey, sid, fwdX, fwdZ]);
        _contactFeedback(rp.group.position);
        bounceCheck();
      }
    }
  }
}

// 單發扇形技能 → 掃掠版（盾擊/重擊/重型重擊/劈斬/長槍橫掃）
function _initFanSkillTrace(stats, serverKey) {
  const hs = stats.hitstun || 'flinch';
  const dmg = stats.dmg;
  camShake = Math.max(camShake, 0.12);
  if (room) room.send('playerAttack', [playerPos.x, playerPos.y, playerPos.z, 0]);
  _initSwingTrace({
    range: stats.range || 2,
    hac: stats.halfAngleCos ?? 0.707,
    mode: 'sweep', dirSign: 1,
    serverKey,
    hitPower: hs === 'knockback' ? 10 : (hs === 'stun' ? 6 : 5.5),   // 屍體拋飛力道
    onDummy(d, nx, nz) {
      dummyTakeDamage(d, dmg, hs === 'stun', emboldened);
      if (hs === 'knockback') dummyKnockback(d, nx, nz, 5);
    },
  });
}

// ─── 召喚物技能（FEZ：騎士衝鋒/投槍、巨人踐踏、亡靈冰縛/暗霧）──
function useSummonSkill(idx) {
  if (!s.active || isDead || !mouse.locked || hitstunTimer > 0) return;
  const sk = (SUMMON_SKILLS[s.type] || [])[idx];
  if (!sk || (summonSkillCds[sk.id] || 0) > 0) return;
  summonSkillCds[sk.id] = sk.cd;

  const fwd = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));
  switch (sk.id) {
    case 'knight_charge': {
      // 12m 直線衝鋒：沿途重創 + 擊退（FEZ 騎士反召喚突擊）
      sfxSwing('greatsword', 'slash');
      if (s.group) summonAttackAnim(s.group, '1H_Melee_Attack_Stab', 0.5);
      camShake = 0.25;
      const start = playerPos.clone();
      const target = playerPos.clone().addScaledVector(fwd, 12);
      const hitSet = new Set();
      let elapsed = 0;
      _addAnim({ update(dt) {
        elapsed += dt;
        const t = Math.min(1, elapsed / 0.4);
        playerPos.lerpVectors(start, target, t);
        if (charBody) charBody.setNextKinematicTranslation({ x: playerPos.x, y: playerPos.y + 0.5, z: playerPos.z });
        spawnDashTrail(playerPos.clone(), playerYaw);
        for (const d of dummies) {
          if (!d.alive || hitSet.has(d) || playerPos.distanceTo(d.group.position) > 2.2) continue;
          hitSet.add(d);
          dummyTakeDamage(d, 120, false, false);
          dummyKnockback(d, fwd.x, fwd.z, 6);
        }
        if (room) {
          for (const [sid, rp] of Object.entries(remotePlayers)) {
            if (hitSet.has(rp) || !rp.group.visible || rp.team === myTeam) continue;
            if (playerPos.distanceTo(rp.group.position) < 2.2) {
              hitSet.add(rp);
              room.send('skillHit', ['tackle', sid, fwd.x, fwd.z]);
            }
          }
        }
        if (t >= 1) {
          if (room) {
            room.send('playerAttack', [playerPos.x, playerPos.y, playerPos.z, 0]);
            room.send('aoeKnockback', [playerPos.x, playerPos.z, 3, 6]);
          }
          return false;
        }
        return true;
      }});
      break;
    }
    case 'lance_throw': {
      // 遠程投槍（FEZ 騎士的慢速遠攻）
      sfxCast();
      if (s.group) summonAttackAnim(s.group, 'Throw', 0.45);
      const spear = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6),
        new THREE.MeshLambertMaterial({ color: 0x8b6914 }));
      shaft.rotation.x = Math.PI / 2; spear.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6),
        new THREE.MeshLambertMaterial({ color: 0xdde0ff }));
      tip.rotation.x = Math.PI / 2; tip.position.z = 1.4; spear.add(tip);
      spear.position.copy(playerPos).add(new THREE.Vector3(0, 1.6, 0));
      spear.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwd);
      scene.add(spear);
      let dist = 0, hit = false;
      _addAnim({ update(dt) {
        const step = 28 * dt; dist += step;
        spear.position.addScaledVector(fwd, step);
        if (!hit) {
          for (const d of dummies) {
            if (!d.alive || spear.position.distanceTo(d.group.position) > 1.2) continue;
            dummyTakeDamage(d, 90, false, false);
            dummyKnockback(d, fwd.x, fwd.z, 4);
            hit = true;
          }
        }
        if (dist >= 18 || hit) {
          if (room) room.send('playerAttack', [spear.position.x, spear.position.y, spear.position.z, 0]);
          spawnHitSparks(spear.position.clone());
          if (hit) sfxHit(true, playerPos.distanceTo(spear.position));   // 我的投槍命中
          scene.remove(spear);
          spear.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
          return false;
        }
        return true;
      }});
      break;
    }
    case 'stomp': {
      // FEZ 巨人踐踏：震地吹飛周圍非召喚敵人
      if (s.group) summonAttackAnim(s.group, 'Unarmed_Melee_Attack_Kick', 0.6);
      camShake = 0.55;
      _hitStop = Math.max(_hitStop, 0.06);
      fireSkillEffect({ kind: 'self_aoe', weapon: 'common', id: 'stomp' }, { aoeRadius: 6 }, playerPos.clone(), playerYaw);
      for (const d of dummies) {
        if (!d.alive || !inRadius(d.group.position, 6)) continue;
        dummyTakeDamage(d, 130, false, false);
        dummyKnockback(d, d.group.position.x - playerPos.x, d.group.position.z - playerPos.z, 7);
      }
      for (const [eid, en] of Object.entries(enemies)) {
        if (en.team === myTeam || !inRadius(en.group.position, 6)) continue;
        markEnemyHit(eid, en.group.position.x - playerPos.x, en.group.position.z - playerPos.z, 12);
      }
      if (room) {
        room.send('summonAttack', [playerPos.x, playerPos.z, 150, 6]);
        room.send('aoeKnockback', [playerPos.x, playerPos.z, 7, 8]);
        for (const [sid, rp] of Object.entries(remotePlayers)) {
          if (!rp.group.visible || rp.team === myTeam || !inRadius(rp.group.position, 6)) continue;
          const dx = rp.group.position.x - playerPos.x, dz = rp.group.position.z - playerPos.z;
          const l = Math.hypot(dx, dz) || 1;
          room.send('skillHit', ['force_impact', sid, dx / l, dz / l]);   // knockback 檔位
        }
      }
      break;
    }
    case 'ice_bind': {
      // FEZ Ice Bind：周圍凍結傷害
      sfxFreeze();
      if (s.group) summonAttackAnim(s.group, 'Spellcasting', 0.6);
      fireSkillEffect({ kind: 'self_aoe', weapon: 'sword_shield', id: 'ice_bind' }, { aoeRadius: 5 }, playerPos.clone(), playerYaw);
      for (const d of dummies) {
        if (!d.alive || !inRadius(d.group.position, 5)) continue;
        dummyTakeDamage(d, 80, true, false);
      }
      if (room) {
        room.send('summonAttack', [playerPos.x, playerPos.z, 80, 5]);
        for (const [sid, rp] of Object.entries(remotePlayers)) {
          if (!rp.group.visible || rp.team === myTeam || !inRadius(rp.group.position, 5)) continue;
          room.send('skillHit', ['shield_bash', sid, 0, 0]);   // stun 檔位 = 凍結
        }
      }
      break;
    }
    case 'dark_mist': {
      // FEZ Dark Mist：遮蔽視線黑霧
      sfxMist();
      if (s.group) summonAttackAnim(s.group, 'Spellcast_Raise', 0.6);
      spawnDarkMist(playerPos.clone().addScaledVector(fwd, 3));
      break;
    }
  }
  updateSkillBarHUD();
}

// ─── LMB 普攻命中（三向 + 掃掠判定）──────────────────────────
function doLmbHit() {
  camShake = 0.12;
  // 普攻特效：按武器動作走（橫斬弧 / 縱劈弧 / 突刺光帶），刻意簡潔
  fireBasicAttackEffect(treeState.weapon, atk.style, playerPos.clone().add(_vOff), playerYaw);
  const T = LMB_TIMING[treeState.weapon] || LMB_TIMING.sword_shield;
  const V = LMB_VARIANTS[atk.variant] || LMB_VARIANTS.slash;
  const baseDmg = Math.round(T.dmg * V.dmgMul * (atk.dmgMul || 1));   // 連擊段加成 × 蓄力
  _initSwingTrace({
    range: PLAYER_ATK_RANGE + V.rangeAdd,
    hac: V.hac,
    mode: atk.traceMode || (atk.variant === 'slash' ? 'sweep' : 'reach'),
    dirSign: atk.dirSign || 1,
    serverKey: null,
    // Chivalry 2 穿透額度：單手劍/長槍命中 1 個即彈劍；雙手劍 cleave 砍穿 1 個、第 2 個停
    pierce: treeState.weapon === 'greatsword' ? 2 : 1,
    hitPower: (atk.variant === 'overhead' ? 7 : (atk.variant === 'stab' ? 5 : 4.5)) * (atk.chargeMul || 1),
    onDummy(d) {
      const isCrit = Math.random() < 0.2;
      const raw = baseDmg + (Math.random() * 10 | 0);
      dummyTakeDamage(d, isCrit ? raw * 2 : raw, isCrit, emboldened);
    },
  });
  if (room) {
    room.send('playerAttack', [playerPos.x, playerPos.y, playerPos.z, 0]);
    room.send('animStart', 'attack');
  }
  updateSkillBarHUD();
}

// ─── 扇形命中輔助 ─────────────────────────────────────────────
function inFan(targetPos, range, halfAngleCos) {
  const fwd = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));
  const toTarget = targetPos.clone().sub(playerPos);
  toTarget.y = 0;
  const dist = toTarget.length();
  if (dist > range) return false;
  if (dist < 0.01) return true;
  if (halfAngleCos <= -1) return true; // 360°
  return fwd.dot(toTarget.normalize()) >= halfAngleCos;
}

function inRadius(targetPos, radius) {
  const dx = targetPos.x - playerPos.x, dz = targetPos.z - playerPos.z;
  return Math.sqrt(dx*dx + dz*dz) <= radius;
}

// ─── Embolden ────────────────────────────────────────────────
function execEmbolden(stats) {
  emboldened = true;
  emboldenTimer = stats.duration / 1000;
  setBodyEmissive(0xffaa00, 0.5);
  document.getElementById('buff-flash').style.opacity = '1';
  setTimeout(() => { document.getElementById('buff-flash').style.opacity = '0'; }, 400);
  showAnnounce(t('g_embolden', { s: stats.duration / 1000 }));
}

// ─── Reinforce Guard ─────────────────────────────────────────
function execReinforceGuard(stats) {
  reinforced = true;
  reinforceTimer = stats.duration / 1000;
  showAnnounce(t('g_reinforce', { def: stats.defBonus, atk: stats.atkMul, s: stats.duration / 1000 }));
}

// ─── Tackle / Lance Charge（突進，dur = active 判定時長）─────
function execTackle(stats, dur = 0.3) {
  const dist = stats.range || 8;
  const fwd  = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));
  const target = playerPos.clone().addScaledVector(fwd, dist);
  let elapsed = 0;
  const start  = playerPos.clone();
  const hitSet = new Set();
  _addAnim({ combat: true, update(dt) {
    elapsed += dt;
    const t = Math.min(1, elapsed / dur);
    playerPos.lerpVectors(start, target, t);
    if (charBody) charBody.setNextKinematicTranslation({ x: playerPos.x, y: playerPos.y + 0.5, z: playerPos.z });
    if (playerGroup) playerGroup.position.set(playerPos.x, playerPos.y - 0.35, playerPos.z);
    spawnDashTrail(playerPos.clone(), playerYaw);
    for (const d of dummies) {
      if (!d.alive || playerPos.distanceTo(d.group.position) > 1.6) continue;
      dummyTakeDamage(d, effectiveDmg(stats.dmg), false, emboldened);
      dummyKnockback(d, fwd.x, fwd.z, 3);   // 衝撞小擊退
    }
    if (room) {
      for (const [sid, rp] of Object.entries(remotePlayers)) {
        if (hitSet.has(sid) || !rp.group.visible || rp.team === myTeam) continue;
        if (playerPos.distanceTo(rp.group.position) < 1.6) {
          hitSet.add(sid); room.send('skillHit', ['tackle', sid, fwd.x, fwd.z]);
        }
      }
    }
    if (t >= 1) { if (room) room.send('playerAttack', [playerPos.x, playerPos.y, playerPos.z, 0]); return false; }
    return true;
  }});
  camShake = 0.15;
}

// ─── 扇形命中技能（各自特效）────────────────────────────────
function execFanHit(stats, skillKey) {
  const r   = stats.range      || 2;
  const hac = stats.halfAngleCos ?? 0.707;
  const dmg = stats.dmg;
  const hs  = stats.hitstun || 'flinch';
  const fwd = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));

  // camShake per skill type
  switch (skillKey) {
    case 'shieldBash': camShake = 0.14; break;
    case 'smash':      camShake = 0.08; break;
    case 'heavySmash': camShake = 0.14; break;
    case 'cleave':     camShake = 0.12; break;
    case 'lanceSweep': camShake = 0.07; break;
    default:           camShake = 0.06;
  }

  for (const d of dummies) {
    if (!d.alive || !inFan(d.group.position, r, hac)) continue;
    dummyTakeDamage(d, dmg, hs === 'stun', emboldened);
    if (hs === 'knockback')
      dummyKnockback(d, d.group.position.x - playerPos.x, d.group.position.z - playerPos.z, 5);
  }
  if (room) {
    room.send('playerAttack', [playerPos.x, playerPos.y, playerPos.z, 0]);
    if (hs === 'knockback') room.send('aoeKnockback', [playerPos.x, playerPos.z, r + 1, 5]);
    const serverKey = skillKey === 'shieldBash' ? 'shield_bash'
                    : skillKey === 'heavySmash' ? 'heavySmash'
                    : skillKey === 'cleave'     ? 'cleave'
                    : skillKey === 'lanceSweep' ? 'lanceSweep' : 'smash';
    for (const [sid, rp] of Object.entries(remotePlayers)) {
      if (!rp.group.visible || rp.team === myTeam || !inFan(rp.group.position, r, hac)) continue;
      room.send('skillHit', [serverKey, sid, fwd.x, fwd.z]);
    }
  }
}

// ─── AoE（Crumble Storm / Slam Attack / Whirlwind）───────────
function execAoE(stats) {
  const r   = stats.aoeRadius || 4;
  const dmg = stats.dmg;
  const fwd = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));
  camShake = 0.22;
  const aoeKb = stats.hitstun === 'knockback';
  for (const d of dummies) {
    if (!d.alive || !inRadius(d.group.position, r)) continue;
    dummyTakeDamage(d, dmg, false, emboldened);
    if (aoeKb)
      dummyKnockback(d, d.group.position.x - playerPos.x, d.group.position.z - playerPos.z, 6);
  }
  // 記錄小兵受擊（AoE 擊殺 → 屍體放射狀炸飛）
  for (const [eid, en] of Object.entries(enemies)) {
    if (en.team === myTeam || !inRadius(en.group.position, r)) continue;
    markEnemyHit(eid, en.group.position.x - playerPos.x, en.group.position.z - playerPos.z, aoeKb ? 10 : 6);
  }
  if (room) {
    room.send('playerAttack', [playerPos.x, playerPos.y, playerPos.z, 0]);
    if (aoeKb) room.send('aoeKnockback', [playerPos.x, playerPos.z, r + 1, 6]);
    for (const [sid, rp] of Object.entries(remotePlayers)) {
      if (!rp.group.visible || rp.team === myTeam || !inRadius(rp.group.position, r)) continue;
      room.send('skillHit', ['smash', sid, fwd.x, fwd.z]);
    }
  }
}

// ─── Force Impact（線性投射物）───────────────────────────────
function execForceImpact(stats) {
  const maxRange = stats.range || 12;
  const fwd = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));
  const proj = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.35, 0.7),
    new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.9 })
  );
  proj.position.copy(playerPos).add(new THREE.Vector3(0, 0.9, 0));
  proj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwd);
  scene.add(proj);
  // 尾跡光（光源池）
  const trail = acquireFollowLight(0x44aaff, 3, 4);
  trail.set(proj.position);

  let dist = 0; let hit = false;
  const hitSids = new Set();
  _addAnim({ update(dt) {
    const step = 25 * dt;
    dist += step;
    proj.position.addScaledVector(fwd, step);
    trail.set(proj.position);
    if (!hit) {
      for (const d of dummies) {
        if (!d.alive || proj.position.distanceTo(d.group.position) > 1.1) continue;
        dummyTakeDamage(d, effectiveDmg(stats.dmg), false, emboldened);
        dummyKnockback(d, fwd.x, fwd.z, 7);   // Force Impact：FEZ 大擊退
        hit = true;
      }
      if (room) {
        for (const [sid, rp] of Object.entries(remotePlayers)) {
          if (hitSids.has(sid) || !rp.group.visible || rp.team === myTeam) continue;
          if (proj.position.distanceTo(rp.group.position) < 1.1) {
            hitSids.add(sid); hit = true;
            room.send('skillHit', ['force_impact', sid, fwd.x, fwd.z]);
          }
        }
      }
    }
    if (dist >= maxRange || hit) {
      if (hit && room) room.send('aoeKnockback', [proj.position.x, proj.position.z, 2.5, 7]);
      scene.remove(proj);
      proj.geometry.dispose(); proj.material.dispose();
      trail.release();
      return false;
    }
    return true;
  }});
  camShake = 0.10;
  if (room) room.send('playerAttack', [playerPos.x, playerPos.y, playerPos.z, 0]);
}

// ─── Sonic Boom（寬線性波）───────────────────────────────────
function execSonicBoom(stats) {
  const maxRange = stats.range  || 15;
  const halfW    = (stats.aoeWidth || 2) / 2;
  const fwd  = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  camShake = 0.09;
  function inPath(pos) {
    const rel = pos.clone().sub(playerPos); rel.y = 0;
    const along = rel.dot(fwd);
    if (along < 0 || along > maxRange) return false;
    return Math.abs(rel.dot(right)) <= halfW;
  }
  for (const d of dummies) {
    if (!d.alive || !inPath(d.group.position)) continue;
    dummyTakeDamage(d, effectiveDmg(stats.dmg), false, emboldened);
  }
  if (room) {
    room.send('playerAttack', [playerPos.x, playerPos.y, playerPos.z, 0]);
    for (const [sid, rp] of Object.entries(remotePlayers)) {
      if (!rp.group.visible || rp.team === myTeam || !inPath(rp.group.position)) continue;
      room.send('skillHit', ['sonic_boom', sid, fwd.x, fwd.z]);
    }
  }
}

// ─── Big Step（突進 + 落地 AoE，dur = active 時長）──────────
function execBigStep(stats, dur = 0.2) {
  const dashRange = stats.dashRange || 5;
  const fwd = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));
  const target = playerPos.clone().addScaledVector(fwd, dashRange);
  let elapsed = 0;
  const start = playerPos.clone();
  _addAnim({ combat: true, update(dt) {
    elapsed += dt;
    const t = Math.min(1, elapsed / dur);
    playerPos.lerpVectors(start, target, t);
    if (charBody) charBody.setNextKinematicTranslation({ x: playerPos.x, y: playerPos.y + 0.5, z: playerPos.z });
    if (playerGroup) playerGroup.position.set(playerPos.x, playerPos.y - 0.35, playerPos.z);
    spawnDashTrail(playerPos.clone(), playerYaw);
    if (t >= 1) {
      execAoE({ ...stats, aoeRadius: stats.aoeRadius });
      return false;
    }
    return true;
  }});
  camShake = 0.15;
}

// ─── Dummy Targets → src/entities/dummy.js ───────────────────
// Crystal Nodes / Mining → src/world/crystal.js
// Build Menu / Ghost / Summon Menu → src/ui/buildMenu.js
// SoI / Obelisk → src/world/soi.js

// buildKnightMesh / buildGiantMesh / buildWraithMesh → src/entities/summon.js
// activateSummon / deactivateSummon / updateGiantAimVisual / clearGiantAimVisual
// fireGiantCannon / updateGiantProjectiles → src/entities/summonSystem.js

// HUD → see src/ui/hud.js
// Particles → see src/effects/particles.js

// ─── 主堡火球（server 廣播 keepFire，client 做拋物線追蹤視覺）──
const _fireballGeo = new THREE.SphereGeometry(0.38, 8, 6);
const _fireballMat = new THREE.MeshBasicMaterial({ color: 0xffc066 });
const _fbScratch = new THREE.Vector3();

function spawnKeepFireball(team, targetEid, dur) {
  const from = new THREE.Vector3((Math.random() - 0.5) * 2, 11.5, team === 1 ? 50 : -50);
  sfxCast(playerPos.distanceTo(from));
  const ball = new THREE.Mesh(_fireballGeo, _fireballMat);
  ball.position.copy(from);
  scene.add(ball);
  const light = acquireFollowLight(0xff7722, 7, 9);   // 光源池：跟隨光
  light.set(from);
  const lastTarget = new THREE.Vector3(from.x, 0.6, from.z + (team === 1 ? -8 : 8));
  let t = 0;
  _addAnim({ update(dt) {
    t += dt;
    const k = Math.min(1, t / dur);
    const en = enemies[targetEid];
    if (en) { lastTarget.copy(en.group.position); lastTarget.y += 0.6; }  // 追蹤目標
    _fbScratch.lerpVectors(from, lastTarget, k);
    _fbScratch.y += Math.sin(k * Math.PI) * 5;   // 拋物線
    ball.position.copy(_fbScratch);
    light.set(_fbScratch);
    if (k >= 1) {
      scene.remove(ball);
      light.release();
      // 爆炸：震動隨距離衰減
      const shake = spawnExplosion(ball.position.clone());
      const dist = playerPos.distanceTo(ball.position);
      camShake = Math.max(camShake, shake * Math.max(0, 1 - dist / 35));
      return false;
    }
    return true;
  }});
}

// ─── Sui 簽章驗身（連接後一次；nonce = sessionId 防重放）────────
let _suiAuthed = false, _suiAuthing = false, _myVerifiedGear = [];
async function _ensureSuiAuth() {
  if (_suiAuthed || _suiAuthing || !room || !mySessionId) return;
  _suiAuthing = true;
  try {
    const { address, signature } = await signLogin(mySessionId);
    room.send('suiAuth', [address, signature]);
  } catch (e) {
    console.warn('Sui 驗身取消/失敗：', e.message);
  } finally {
    _suiAuthing = false;
  }
}

// ─── 屍體拋飛（ragdoll-lite）：拋物線 + 翻滾 + 落地反彈 ────────
function launchCorpse(group, dirX, dirZ, power = 7) {
  const l = Math.hypot(dirX, dirZ) || 1;
  const vel = new THREE.Vector3((dirX / l) * power, 3 + power * 0.45, (dirZ / l) * power);
  let spinX = (Math.random() - 0.5) * (4 + power);
  let spinZ = (Math.random() - 0.5) * (4 + power);
  let t = 0;
  _addAnim({ update(dt) {
    t += dt;
    vel.y += GRAVITY * dt;
    group.position.addScaledVector(vel, dt);
    const gy = getTerrainHeight(group.position.x, group.position.z);
    if (group.position.y <= gy) {
      group.position.y = gy;
      if (vel.y < -3) {
        vel.y = -vel.y * 0.35;
        vel.x *= 0.55; vel.z *= 0.55;
        spinX *= 0.5; spinZ *= 0.5;
        spawnFootDust(group.position, true);
      } else {
        vel.set(0, 0, 0);
        spinX *= 0.82; spinZ *= 0.82;
      }
    }
    group.rotation.x += spinX * dt;
    group.rotation.z += spinZ * dt;
    return t < 2.2;
  }});
}

// ─── Network ─────────────────────────────────────────────────
// 取得經驗（純本地角色即時升級；鏈上角色由 server 結算 → addLocalXp 回 null）
function _gainXp(amount) {
  const r = addLocalXp(amount);
  if (!r?.leveledUp) return;
  treeState.maxPoints = skillPointsForLevel(r.level);
  const spent = Object.values(treeState.learned).reduce((s, lv) => s + lv * (lv + 1) / 2, 0);
  treeState.points = Math.max(0, treeState.maxPoints - spent);   // 只新增升級獲得的點數，不重置既有配點
  refreshSkillPanel();
  showAnnounce(t('g_levelup', { n: r.level }));
}

// 本地玩家頭上的角色名牌（顯示角色名 + 等級；名稱即鏈上 NFT 的 name）
let _nameLabel = null;
const _escName = s => String(s || 'Warrior').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function _updateNameLabel() {
  if (!_enteredGame || !playerGroup || isDead || gameOver) { if (_nameLabel) _nameLabel.style.display = 'none'; return; }
  const ch = loadCharacter();
  if (!ch) { if (_nameLabel) _nameLabel.style.display = 'none'; return; }
  if (!_nameLabel) {
    _nameLabel = document.createElement('div');
    _nameLabel.style.cssText = 'position:absolute;pointer-events:none;text-align:center;transform:translateX(-50%);z-index:6;';
    document.getElementById('hud')?.appendChild(_nameLabel);
  }
  const key = (ch.name || '') + '|' + (ch.level || 1);
  if (_nameLabel._key !== key) {
    _nameLabel._key = key;
    _nameLabel.innerHTML = `<div style="color:#ffe08a;font:700 12px 'Oswald',sans-serif;text-shadow:0 1px 3px #000,0 0 6px rgba(0,0,0,.7);white-space:nowrap;">${_escName(ch.name)} <span style="color:#cfe3ff;font-size:9px;opacity:.85;">Lv${ch.level || 1}</span></div>`;
  }
  const head = playerPos.clone(); head.y += 2.2;
  const sp = worldToScreen(head);
  if (sp) { _nameLabel.style.left = sp.x + 'px'; _nameLabel.style.top = sp.y + 'px'; _nameLabel.style.display = 'block'; }
  else _nameLabel.style.display = 'none';
}

// 小地圖：俯視島嶼 + 城堡 + 小兵 + 其他玩家 + 自己（朝向箭頭）
function _drawMinimap() {
  const cv = document.getElementById('minimap'); if (!cv) return;
  const ctx = cv.getContext('2d'); if (!ctx) return;
  const S = 150, C = S / 2, sc = (C - 6) / 62;
  const px = (x) => C + x * sc, py = (z) => C + z * sc;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(46,78,56,0.5)'; ctx.beginPath(); ctx.arc(C, C, 58 * sc, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6aa8ff'; ctx.fillRect(px(0) - 4, py(50) - 4, 8, 8);    // 藍方主堡
  ctx.fillStyle = '#ff6a6a'; ctx.fillRect(px(0) - 4, py(-50) - 4, 8, 8);   // 紅方主堡
  for (const en of Object.values(enemies)) {
    if (!en || !en.alive || !en.group) continue; const p = en.group.position;
    ctx.fillStyle = en.team === myTeam ? '#7fd99a' : '#e88'; ctx.fillRect(px(p.x) - 1.5, py(p.z) - 1.5, 3, 3);
  }
  for (const rp of Object.values(remotePlayers)) {
    if (!rp || !rp.group) continue; const p = rp.group.position;
    ctx.fillStyle = rp.team === myTeam ? '#9ecbff' : '#ff9a9a'; ctx.beginPath(); ctx.arc(px(p.x), py(p.z), 2.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save(); ctx.translate(px(playerPos.x), py(playerPos.z)); ctx.rotate(-playerYaw);
  ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ── 聊天（傾計）──
function _openChat() { const i = document.getElementById('chat-input'); if (!i) return; i.style.display = 'block'; i.placeholder = t('g_chat_ph'); i.focus(); }
function _closeChat() { const i = document.getElementById('chat-input'); if (i) { i.style.display = 'none'; i.blur(); } }
function _addChat(name, text, team) {
  const box = document.getElementById('chat-msgs'); if (!box) return;
  const col = team === 1 ? '#9ecbff' : team === 2 ? '#ff9a9a' : '#cfe0ff';
  const d = document.createElement('div'); d.style.cssText = 'text-shadow:1px 1px 2px #000; word-break:break-word;';
  const nb = document.createElement('b'); nb.style.color = col; nb.textContent = name;
  const tx = document.createElement('span'); tx.style.color = '#dfe6f5'; tx.textContent = ': ' + text;
  d.appendChild(nb); d.appendChild(tx); box.appendChild(d);
  while (box.children.length > 6) box.removeChild(box.firstChild);
  setTimeout(() => { d.style.transition = 'opacity 1s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 1000); }, 12000);
}
document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
  e.stopPropagation();
  const i = e.currentTarget;
  if (e.code === 'Enter') { const v = i.value.trim(); if (v && room) { try { room.send('chat', v); } catch { /* noop */ } } i.value = ''; _closeChat(); }
  else if (e.code === 'Escape') { i.value = ''; _closeChat(); }
});

// HUD 網路延遲顯示（ms + 燈號色：綠<80 / 黃<160 / 紅）
function _updateNetStat(ms) {
  const el = document.getElementById('net-ms'); if (el) el.textContent = Math.round(ms) + ' ms';
  const dot = document.getElementById('net-dot'); if (dot) dot.style.background = ms < 80 ? '#8fd0a0' : ms < 160 ? '#e0c060' : '#e07050';
}

function _showKicked() {
  if (document.getElementById('kicked-overlay')) return;
  const d = document.createElement('div');
  d.id = 'kicked-overlay';
  d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:rgba(8,12,20,.94);color:#fff;font-family:Oswald,sans-serif;text-align:center;padding:24px;';
  d.innerHTML = `<div style="font:700 24px Cinzel,serif;color:#ffcf6b;">${t('g_kicked_title')}</div><div style="max-width:440px;line-height:1.6;color:#cfe0ff;">${t('g_kicked_multilogin')}</div>`;
  const btn = document.createElement('button');
  btn.textContent = t('g_reload');
  btn.style.cssText = 'padding:11px 30px;font:700 14px Oswald,sans-serif;letter-spacing:1px;cursor:pointer;border:none;border-radius:8px;color:#07101f;background:linear-gradient(180deg,#cfe0ff,#6f86d0);';
  btn.onclick = () => location.reload();
  d.appendChild(btn);
  document.body.appendChild(d);
}

// ── 戰後結算面板（玩家 confirm 才簽交易，取代自動彈錢包）──
let _settle = { mktId: null, winner: -1, xp: null, claimed: false, leveled: false, busy: false };

function _showSettlement(win) {
  showGameOver(!win);                                  // 設標題（勝/敗）+ 顯示畫面
  const panel = document.getElementById('settle-panel');
  if (panel) panel.style.display = 'flex';
  const r = document.getElementById('settle-restart'); if (r) r.onclick = () => { try { localStorage.setItem('fr0_return_map', '1'); } catch { /* noop */ } location.reload(); };   // 回大廳（世界地圖）
  const c = document.getElementById('settle-claim');   if (c) c.onclick = _doClaim;
  const l = document.getElementById('settle-levelup'); if (l) l.onclick = _doLevelUp;
  _renderSettleMarket();
  _renderSettleXp();
}

async function _renderSettleMarket() {
  const el = document.getElementById('settle-market');
  const btn = document.getElementById('settle-claim');
  if (!el) return;
  if (_settle.winner < 0) { el.innerHTML = `⏳ ${t('g_settle_waiting')}`; if (btn) btn.style.display = 'none'; return; }
  const winName = _settle.winner === 0 ? 'Minas United' : 'Calaadia';
  if (!suiState.connected) { el.innerHTML = `🏳️ ${t('g_war_settled', { name: winName })}<br><span style="opacity:.7">${t('g_no_wallet_settle')}</span>`; if (btn) btn.style.display = 'none'; return; }
  if (_settle.claimed)     { el.innerHTML = `🏆 ${t('g_war_settled', { name: winName })}<br><span style="opacity:.8">${t('g_payout_done')}</span>`; if (btn) btn.style.display = 'none'; return; }
  el.innerHTML = `🏳️ ${t('g_war_settled', { name: winName })} · <span style="opacity:.7">${t('g_checking_shares')}</span>`;
  let mine = { a: 0, b: 0 };
  try { const mkt = await getMarket(_settle.mktId); mine = await getMyShares(mkt); } catch { /* noop */ }
  const myWin = _settle.winner === 0 ? mine.a : mine.b;
  if (myWin > 0) {
    addPendingRedeem(_settle.mktId);   // 存起來：錯過結算面板也能在世界地圖角色卡補領
    el.innerHTML = `🏆 ${t('g_war_settled', { name: winName })}<br>${t('g_you_won_shares', { n: toSui(myWin).toFixed(3) })}`;
    if (btn) btn.style.display = '';
  } else {
    el.innerHTML = `🏳️ ${t('g_war_settled', { name: winName })}<br><span style="opacity:.7">${t('g_no_payout')}</span>`;
    if (btn) btn.style.display = 'none';
  }
}

function _renderSettleXp() {
  const el = document.getElementById('settle-xp');
  const btn = document.getElementById('settle-levelup');
  if (!el) return;
  if (!_settle.xp) { el.innerHTML = `⏳ ${t('g_settle_waiting')}`; if (btn) btn.style.display = 'none'; return; }
  if (_settle.leveled) { el.innerHTML = `✨ ${t('g_xp_applied', { n: _settle.xp.amount })}`; if (btn) btn.style.display = 'none'; return; }
  if (!suiState.connected) { el.innerHTML = `✨ ${t('g_xp_earned', { n: _settle.xp.amount })}<br><span style="opacity:.7">${t('g_no_wallet_settle')}</span>`; if (btn) btn.style.display = 'none'; return; }
  el.innerHTML = `✨ ${t('g_xp_earned', { n: _settle.xp.amount })}`;
  if (btn) btn.style.display = '';
}

async function _doClaim() {
  if (_settle.busy || !_settle.mktId) return;
  _settle.busy = true;
  const btn = document.getElementById('settle-claim');
  if (btn) { btn.disabled = true; btn.textContent = t('g_claiming'); }
  try { await redeem(_settle.mktId); _settle.claimed = true; removePendingRedeem(_settle.mktId); showAnnounce(t('g_payout_done')); }
  catch (e) { showAnnounce(t('g_claim_failed')); }
  if (btn) { btn.disabled = false; btn.textContent = t('g_claim_payout'); }
  _settle.busy = false;
  _renderSettleMarket();
}

async function _doLevelUp() {
  if (_settle.busy || !_settle.xp) return;
  _settle.busy = true;
  const btn = document.getElementById('settle-levelup');
  if (btn) { btn.disabled = true; btn.textContent = t('g_leveling'); }
  try {
    const before = (loadCharacter()?.level) || 1;
    const ok = await applyXp(_settle.xp.amount, _settle.xp.nonce, Uint8Array.from(_settle.xp.sig));
    if (ok) {
      _settle.leveled = true;
      clearPendingXp();
      const c = await getMyCharacter();
      if (c) {
        treeState.maxPoints = skillPointsForLevel(c.level);
        const spent = Object.values(treeState.learned).reduce((s, lv) => s + lv * (lv + 1) / 2, 0);
        treeState.points = Math.max(0, treeState.maxPoints - spent);
        refreshSkillPanel();
        if (c.level > before) showAnnounce(t('g_levelup', { n: c.level }));
      }
    }
  } catch (e) { /* noop */ }
  if (btn) { btn.disabled = false; btn.textContent = t('g_confirm_levelup'); }
  _settle.busy = false;
  _renderSettleXp();
}

async function connectToServer() {
  setStatus(t('g_connecting'));
  const client = new Client(SERVER_URL);
  const myNation = Number(loadCharacter()?.nation) || 0;   // 選哪國 → server 按此分隊（一定替哪國打）
  room = await client.joinOrCreate(ROOM_NAME, { nation: myNation });
  mySessionId = room.sessionId;
  setStatus('');
  console.log('Connected! Session:', mySessionId);
  room.send('appearance', appearanceToNet());   // 告知其他玩家我的外觀
  room.send('character', loadCharacter()?.nftId || '');   // 角色 NFT id（server 結算升級用＋防雙開）
  room.send('pname', loadCharacter()?.name || '');         // 角色名（讓別人的名牌顯示真名）
  room.send('whoami', suiState.address || '');             // 宣稱錢包地址（防同帳號雙開）

  // 建築同步：別人（與自己）建的塔／方尖碑都經 server 廣播回來，對面也看得到
  room.onMessage('build', data => {
    const [sid, type, x, z, team] = data;
    const mine = String(sid) === String(mySessionId);
    if (type === 'tower') createTower(Number(x), Number(z), Number(team) || 1, mine);
    else if (type === 'obelisk') createObelisk(Number(x), Number(z));
  });
  room.onMessage('pname', d => setRemoteName(String(d[0]), String(d[1] || '')));   // 遠端玩家名牌顯示真名
  room.onMessage('pong', t => _updateNetStat(performance.now() - Number(t)));       // 延遲量測：算 RTT
  room.onMessage('chat', d => _addChat(String(d[0]), String(d[1]), Number(d[2])));  // 聊天訊息
  setInterval(() => { try { room.send('ping', performance.now()); } catch { /* noop */ } }, 2500);
  // 防多開：同帳號在他處登入 → 本連線被踢，顯示提示、不自動重連
  let _kicked = false;
  room.onMessage('kicked', () => { _kicked = true; _showKicked(); });
  room.onLeave(code => { if (code === 4001 || _kicked) _showKicked(); });

  room.onMessage('remotePos', data => {
    const sid = String(data[0]);
    if (sid === mySessionId) return;
    const team = Number(data[5]) || 1;
    if (!remotePlayers[sid]) spawnRemotePlayer(sid, team, myTeam);
    const rp = remotePlayers[sid];
    rp.targetPos.set(data[1], data[2], data[3]);
    rp.targetYaw = data[4];
    if (!rp.group.visible) { rp.group.visible = true; rp.group.position.copy(rp.targetPos); }
    if (data[6] !== undefined) {
      const newHp = Number(data[6]);
      if (newHp < rp.hp) {
        // 受到傷害：顯示受擊粒子
        spawnHitSparks(rp.group.position.clone().add(new THREE.Vector3(0, 1, 0)));
      }
      rp.hp = newHp;
      const fill = rp.label?.querySelector('.rp-hp-fill');
      if (fill) fill.style.width = Math.max(0, rp.hp / rp.maxHp * 100) + '%';
    }
  });
  room.onMessage('playerJoined', data => {
    const sid = String(data[0]), team = Number(data[1]) || 1;
    if (sid !== mySessionId) spawnRemotePlayer(sid, team, myTeam);
  });
  // 外觀同步：單人變更 / 加入時的全員快照
  room.onMessage('appearance', data => {
    const sid = String(data[0]);
    if (sid !== mySessionId) setRemoteAppearance(sid, appearanceFromNet(data[1]));
  });
  room.onMessage('appearanceAll', data => {
    for (const [sid, arr] of data) {
      if (String(sid) !== mySessionId) setRemoteAppearance(String(sid), appearanceFromNet(arr));
    }
  });
  // Sui 簽章驗身結果
  room.onMessage('suiAuthOk', () => {
    _suiAuthed = true;
    setStatus(t('g_sui_verified'));
    setTimeout(() => setStatus(''), 2500);
    if (room) room.send('appearance', appearanceToNet());   // 驗身後重送 → 觸發 gear 驗證
  });
  // 鏈上 NFT ownership 驗證通過的 slot → 標記玩家「已驗證持有」
  room.onMessage('gearVerified', data => {
    const sid = String(data[0]); const slots = data[1] || [];
    if (sid === mySessionId) {
      _myVerifiedGear = slots;
    } else {
      const rp = remotePlayers[sid];
      if (rp) {
        rp.verifiedGear = slots;
        const nameEl = rp.label?.querySelector('div');
        if (nameEl && slots.length && !nameEl.textContent.includes('🔗')) {
          nameEl.innerHTML = '🔗 ' + nameEl.innerHTML;   // 名牌加鏈上認證標記
        }
      }
    }
  });
  // 預測市場：server 自動結算 → 切新市 + 自動兌付彩金
  room.onMessage('marketNew', id => setActiveMarket(String(id)));
  // 角色等級結算：收到 server 簽章 → 上鏈 apply_xp → 從鏈上刷新等級 + 技能點
  // 角色等級結算：存起來，在戰後結算面板由玩家 confirm 才上鏈 apply_xp（見 _doLevelUp）
  room.onMessage('heroXp', (d) => {
    _settle.xp = { amount: d.amount, nonce: d.nonce, sig: d.sig };
    setPendingXp(_settle.xp);   // 存起來：錯過結算面板也能在世界地圖角色卡補升級
    _renderSettleXp();
  });
  // 預測市場結算：存起來，在戰後結算面板由玩家 confirm 才領取派彩 redeem（見 _doClaim）
  room.onMessage('marketResolved', raw => {
    _settle.mktId = String(raw[0]); _settle.winner = Number(raw[1]);
    _renderSettleMarket();
  });
  room.onMessage('playerLeft',   data => { removeRemotePlayer(String(data)); });
  room.onMessage('existingPlayers', data => {
    for (const p of data) {
      const sid = String(p[0]); if (sid === mySessionId) continue;
      spawnRemotePlayer(sid, Number(p[7]) || 1, myTeam);
      const erp = remotePlayers[sid];
      erp.targetPos.set(p[1], p[2], p[3]);
      erp.group.position.copy(erp.targetPos);
      erp.group.visible = true;
    }
  });
  room.onMessage('enemySpawn', data => {
    clearEnemies();
    for (const e of data) spawnEnemy(String(e[0]), e[1], e[2], e[3], e[4], e[5], e[6]);
  });
  // 增量生成（持續滴灌補兵，不清場）
  room.onMessage('enemyAdd', data => {
    for (const e of data) spawnEnemy(String(e[0]), e[1], e[2], e[3], e[4], e[5], e[6]);
  });
  room.onMessage('enemyStates', data => {
    for (const e of data) {
      const eid = String(e[0]);
      if (!enemies[eid]) continue;
      if (e[4] <= 0) { killCount++; _gainXp(25); elKillCount.textContent = killCount; killEnemy(eid); continue; }
      enemies[eid].targetPos.set(e[1], 0, e[2]);
      updateEnemyHp(eid, e[3]);
    }
  });
  room.onMessage('playerHpUpdate', data => {
    const sid = String(data[0]);
    const rp = remotePlayers[sid];
    if (!rp) return;
    const newHp = Number(data[1]);
    if (newHp < rp.hp) spawnHitSparks(rp.group.position.clone().add(new THREE.Vector3(0, 1, 0)));
    rp.hp = newHp;
    const fill = rp.label?.querySelector('.rp-hp-fill');
    if (fill) fill.style.width = Math.max(0, rp.hp / rp.maxHp * 100) + '%';
  });

  room.onMessage('playerDamage', raw => {
    if (isDead) return;
    // 新格式 [dmg, hitstunType, kbX, kbZ, blocked]，向後兼容純數字
    const [dmg, hsType, kbX, kbZ] = Array.isArray(raw)
      ? [Number(raw[0]), raw[1] || 'flinch_short', Number(raw[2]||0), Number(raw[3]||0)]
      : [Number(raw), 'flinch_short', 0, 0];
    const blocked = Array.isArray(raw) && !!Number(raw[4]);

    // 格擋成功（server 已減傷至 25%）：盾面火花 + 金屬聲 + 輕推，不進硬直/紅閃
    if (blocked) {
      hp = Math.max(0, hp - dmg);
      updateHpBar(hp);
      sfxHit(true);
      spawnHitSparks(playerPos.clone().add(new THREE.Vector3(Math.sin(playerYaw) * 0.6, 1.15, Math.cos(playerYaw) * 0.6)));
      if (_rv) _rv.play('Block_Hit', { once: true, dur: 0.32, retrigger: true });
      camShake = Math.max(camShake, 0.18);
      knockbackVel.set(kbX * 1.2, 0, kbZ * 1.2);
      hitstunTimer = Math.max(hitstunTimer, 0.1);
      hitstunMaxTimer = Math.max(hitstunMaxTimer, 0.1);
      hitstunType = 'flinch_short';
      return;
    }

    if (s.active) {
      flashDamage();
      sfxHit(true);   // 自己（召喚形態）被打
      s.hp = Math.max(0, s.hp - dmg);
      updateSummonHUD(s.active, s.type, s.hp, s.maxHp);
    } else {
      // ── i-frame（§4：跳躍騰空 / 側閃前段 / 倒地起身恢復期）──
      // 目前所有戰士攻擊皆為物理，i-frame 一律可閃；魔法系加入時需帶 damageType
      const iframeActive = (_wasJumped && !isGrounded)
        || (sidestepTimer > SIDESTEP_DUR - SIDESTEP_IFRAME)
        || getupTimer > 0;
      if (iframeActive) {
        showDmgNum(playerPos.clone().add(new THREE.Vector3(0, 2.2, 0)), 'MISS', false, '#9adcff');
        return;
      }
      flashDamage();
      sfxHit(true);   // 自己被打：清楚的命中聲
      hp = Math.max(0, hp - dmg);
      updateHpBar(hp);
      // 受擊回饋：紅閃 + 鏡頭震動 + 微凍幀
      setBodyEmissive(0xff2222, 1.5);
      setTimeout(() => setBodyEmissive(0x000000, 0), 150);
      camShake  = Math.max(camShake, 0.32);
      _hitStop  = Math.max(_hitStop, 0.04);
      _fovPunch = Math.max(_fovPunch, 0.5);
      // 硬直（Embolden 擋 flinch 級，不擋 stun / knockdown / knockback）
      const emboldBlocks = emboldened && (hsType === 'flinch_short' || hsType === 'flinch');
      if (!emboldBlocks) {
        const dur = HITSTUN_DUR[hsType] ?? 0.2;
        if (dur > hitstunTimer) {    // 只取較長者（§6.3）
          hitstunTimer    = dur;
          hitstunMaxTimer = dur;
          hitstunType     = hsType;
          if (hsType === 'knockback' || hsType === 'knockdown') {
            knockbackVel.set(kbX * 5, 0, kbZ * 5);
          } else {
            knockbackVel.set(kbX * 1.5, 0, kbZ * 1.5); // flinch 小推
          }
        }
        // FEZ commit 哲學的另一面：被打斷招（前搖/揮擊全部中斷，PW 不退）
        cancelAttack();
        if (hsType === 'stun' || hsType === 'knockdown') sidestepTimer = 0; // 強控打斷側閃
      }
    }
  });

  room.onMessage('playerDeath', raw => {
    // 新格式 [sid, kbX, kbZ]（屍體拋飛方向），向後兼容純 sid
    const arr = Array.isArray(raw) ? raw : [raw, 0, 0];
    const sid = arr[0];
    const kbx = Number(arr[1] || 0), kbz = Number(arr[2] || 0);
    const hasDir = (kbx !== 0 || kbz !== 0);
    if (String(sid) === mySessionId) {
      if (s.active) deactivateSummon(); // 先清除召喚物
      // 自己死亡
      isDead = true;
      respawnCountdown = 5;
      cancelAttack();        // 死亡時強制解除技能鎖
      hitstunTimer = 0; sidestepTimer = 0;
      if (_torso) { _torso.rotation.x = 0; _torso.rotation.z = 0; }
      hp = 0; updateHpBar(hp);
      const ds = document.getElementById('death-screen');
      ds.style.display = 'flex';
      document.exitPointerLock();
      // 死法分流：被吹飛（有方向）→ ragdoll；普通死亡 → Death_A 動畫
      _myRag = (playerGroup && hasDir) ? createRagdoll(playerGroup, { x: kbx, z: kbz }, 9) : null;
      if (!_myRag) {
        if (_rv) _rv.play('Death_A', { once: true, dur: 1.0, clamp: true, retrigger: true });
        else if (playerGroup) { playerGroup.rotation.z = Math.PI / 2; playerGroup.position.y = -0.3; }
        if (playerGroup && hasDir) launchCorpse(playerGroup, kbx, kbz, 7.5);
      }
    } else {
      // 其他玩家死亡：ragdoll / 倒下 + 血條歸零
      const rp = remotePlayers[String(sid)];
      if (rp) {
        rp._rag = hasDir ? createRagdoll(rp.group, { x: kbx, z: kbz }, 9) : null;
        if (!rp._rag) {
          if (rp.rv) rp.rv.play('Death_A', { once: true, dur: 1.0, clamp: true, retrigger: true });
          else { rp.group.rotation.z = Math.PI / 2; rp.group.position.y = -0.3; }
          if (hasDir) launchCorpse(rp.group, kbx, kbz, 7.5);
        }
        rp.hp = 0;
        const fill = rp.label?.querySelector('.rp-hp-fill');
        if (fill) fill.style.width = '0%';
      }
    }
  });

  room.onMessage('playerRespawn', data => {
    const [sid, rx, ry, rz] = data;
    if (String(sid) === mySessionId) {
      // 自己重生
      isDead = false;
      if (_myRag) { disposeRagdoll(_myRag); _myRag = null; }   // 釋放屍體物理
      hp = 100; updateHpBar(hp);
      // FEZ §9：死亡重生 PW 不回滿（從 30 開始）；SP 回滿
      pw = Math.min(pw, 30); updatePwBar(pw, maxPw);
      sp = SP_MAX; spRegenDelay = 0; updateSpBar(sp, SP_MAX);
      const safeRy = Math.max(ry, getTerrainHeight(rx, rz) + 1);
      playerPos.set(rx, safeRy, rz);
      if (charBody) charBody.setNextKinematicTranslation({ x: rx, y: safeRy + 0.5, z: rz });
      if (playerGroup) {
        playerGroup.position.copy(playerPos);
        playerGroup.rotation.set(0, playerYaw, 0);   // 重置拋飛翻滾姿態
        playerGroup.position.y = 0;
      }
      document.getElementById('death-screen').style.display = 'none';
      if (_rv) _rv.play('Idle', { retrigger: true });
      showAnnounce(t('g_respawn'));
    } else {
      // 其他玩家重生
      const rp = remotePlayers[String(sid)];
      if (rp) {
        if (rp._rag) { disposeRagdoll(rp._rag); rp._rag = null; }
        rp.group.visible = true;
        rp.group.rotation.set(0, rp.group.rotation.y, 0);   // 重置拋飛姿態
        rp.targetPos.set(rx, ry, rz);
        rp.group.position.set(rx, ry, rz);                  // 直接歸位（屍體可能飛遠了）
        if (rp.rv) rp.rv.play('Idle', { retrigger: true });
        if (rp.summonGroup) { scene.remove(rp.summonGroup); rp.summonGroup = null; }
        rp.summonType = null; rp.maxHp = 100; rp.hp = 100;
        const fill = rp.label?.querySelector('.rp-hp-fill');
        if (fill) fill.style.width = '100%';
      }
    }
  });
  room.onMessage('playerSummon', ([sid, type, maxHp]) => {
    const rp = remotePlayers[String(sid)];
    if (!rp) return;
    rp.group.visible = false;
    if (rp.summonGroup) { scene.remove(rp.summonGroup); rp.summonGroup = null; }
    rp.maxHp = maxHp || 300;
    rp.hp = rp.maxHp;
    // 使用正式 build 函數（與本地玩家召喚相同外觀）
    let sg;
    if (type === 'giant')       sg = buildGiantMesh();
    else if (type === 'knight') sg = buildKnightMesh();
    else if (type === 'wraith') sg = buildWraithMesh();
    else sg = new THREE.Group();
    // 名牌偏移（召喚物高）
    sg.position.copy(rp.targetPos);
    scene.add(sg);
    rp.summonGroup = sg;
    rp.summonType = type;
    // 更新名牌
    const fill = rp.label?.querySelector('.rp-hp-fill');
    if (fill) fill.style.width = '100%';
  });
  room.onMessage('animStart', ([sid, anim]) => {
    const rp = remotePlayers[String(sid)];
    if (!rp) return;
    if (anim === 'attack') {
      rp.atkAnim = 1.0;
      // 在對方位置生成斬擊效果
      const pos = rp.group.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      spawnSlashStreak(pos, rp.group.rotation.y);
    }
  });
  room.onMessage('tick', serverTime => updateRoundTimer(serverTime));
  room.onMessage('__playground_message_types', () => {});
  room.onMessage('waveStart', wave => showAnnounce(t('g_wave_n', { n: wave })));
  room.onMessage('yourTeam', team => {
    myTeam = Number(team);
    const teamEl = document.getElementById('team-display');
    if (teamEl) teamEl.textContent = myTeam === 1 ? t('g_team_blue') : t('g_team_red');
    // 根據隊伍設定出生點（對稱於 z=0）
    const spawnZ = myTeam === 1 ? 47 : -47;
    const spawnX = (Math.random() - 0.5) * 6;
    playerPos.set(spawnX, getTerrainHeight(spawnX, spawnZ) + 3, spawnZ);
    if (playerGroup) playerGroup.position.copy(playerPos);
    showAnnounce(myTeam === 1 ? t('g_team_blue_side') : t('g_team_red_side'));
  });
  room.onMessage('waveClear', () => {
    showAnnounce(t('g_wave_clear'));
    hp = Math.min(100, hp + 25); updateHpBar(hp);
  });
  room.onMessage('keepUpdate', ([team, val]) => {
    const newHp = Number(val);
    const oldHp = team === 1 ? keepHp1 : keepHp2;
    const dmg   = oldHp - newHp;
    if (team === 1) keepHp1 = newHp;
    else            keepHp2 = newHp;
    updateKeepBar(keepHp1, keepHp2, maxKeepHp);
    // 浮動傷害數字（主堡在 z=±50，高度取 y=8 顯示在塔頂附近）
    if (dmg > 0) {
      const keepZ = team === 1 ? 50 : -50;
      showDmgNum(new THREE.Vector3((Math.random()-0.5)*3, 8, keepZ), dmg, false, '#ff8844');
    }
  });
  room.onMessage('keepDestroyed', destroyedTeam => {
    gameOver = true; isDead = true;
    _showSettlement(Number(destroyedTeam) !== myTeam);   // 對方主堡被毀 = 我方勝；玩家按「重新開始」離場 → server 0 人時重置新場
  });
  room.onMessage('enemyReachedKeep', ([eid, team]) => {
    const en = enemies[String(eid)];
    if (en) en.atKeep = true; // 停駐，不再 lerp 移動
    const isMyKeep = (team !== myTeam);
    if (isMyKeep) showAnnounce(t('g_keep_attacked'));
  });
  room.onMessage('keepFire', ([team, targetEid, flightMs]) => {
    spawnKeepFireball(Number(team), String(targetEid), (Number(flightMs) || 800) / 1000);
  });
  room.onMessage('enemyAttack', ([eid, target]) => {
    const en = enemies[String(eid)];
    if (!en) return;
    en.atkAnim = 1.0; // 觸發揮擊動畫
    if (target === 'keep') {
      // 主堡受擊：閃爍對應 bar，不做全螢幕紅色
      const keepTeam = en.team === 2 ? 1 : 2; // 紅方小兵打藍方堡，藍方小兵打紅方堡
      flashKeepBar(keepTeam);
    }
  });
}

// ─── Player Update (Rapier physics) ──────────────────────────
function updatePlayer(dt) {
  if (isDead) {
    // 死亡時只更新倒計時顯示
    if (respawnCountdown > 0) {
      respawnCountdown -= dt;
      const el = document.getElementById('respawn-cd');
      if (el) el.textContent = t('g_respawn_in', { n: Math.ceil(Math.max(0, respawnCountdown)) });
    }
    return;
  }
  sidestepCd = Math.max(0, sidestepCd - dt);
  getupTimer = Math.max(0, getupTimer - dt);
  atkCd      = Math.max(0, atkCd - dt);
  // summonAtkCd decrement handled by updateSummonTransform()
  if (landLagTimer > 0) landLagTimer = Math.max(0, landLagTimer - dt);

  // ── 攻擊狀態機推進（前搖→判定→後搖）────────────────────────
  updateAttack(dt);

  // ── Hitstun（§6 FEZ spec：flinch / knockback / stun / knockdown）──
  if (hitstunTimer > 0) {
    hitstunTimer -= dt;
    // 擊退位移（快速衰減摩擦）
    if (knockbackVel.lengthSq() > 0.001) {
      playerPos.addScaledVector(knockbackVel, dt);
      knockbackVel.multiplyScalar(Math.exp(-8 * dt)); // 指數衰減
      if (charBody) charBody.setNextKinematicTranslation({ x: playerPos.x, y: playerPos.y + 0.5, z: playerPos.z });
      if (playerGroup) playerGroup.position.set(playerPos.x, playerPos.y - 0.35, playerPos.z);
    }
    const elapsed = hitstunMaxTimer - hitstunTimer;
    if (_rv) {
      // KayKit 剪輯：倒地→躺平→起身 / 暈眩定格 / 受擊
      if (hitstunType === 'knockdown') {
        if (hitstunTimer < 0.38) _rv.play('Lie_StandUp', { once: true, dur: 0.42, clamp: true });
        else _rv.play('Lie_Down', { once: true, dur: 0.5, clamp: true });
      } else if (hitstunType === 'stun') {
        _rv.play('Hit_B', { once: true, dur: 0.6, clamp: true });
      } else {
        _rv.play('Hit_A', { once: true, dur: Math.max(0.25, hitstunMaxTimer), clamp: true });
      }
    } else if (hitstunType === 'knockdown' && playerGroup) {
      // 倒地：0.25s 內倒下 → 躺地（可被連擊）→ 最後 0.3s 起身
      const fall = Math.min(1, elapsed / 0.25);
      const rise = Math.min(1, Math.max(0, hitstunTimer) / 0.3);
      playerGroup.rotation.x = -Math.PI / 2 * _sStep(fall) * _sStep(rise);
    } else if (hitstunType === 'stun' && _torso && !isMining()) {
      // 暈眩：站立搖晃
      _torso.rotation.z = Math.sin(elapsed * 9) * 0.12;
      _torso.rotation.x = 0.18 + Math.sin(elapsed * 5) * 0.05;
    } else if (_torso && !isMining()) {
      // flinch / knockback：身體往後傾（lean 0→1→0 sin 曲線）
      const ratio = hitstunTimer / hitstunMaxTimer;
      _torso.rotation.x = -Math.sin(ratio * Math.PI) * 0.38;
    }
    if (hitstunTimer <= 0) {
      knockbackVel.set(0, 0, 0);
      if (_torso) { _torso.rotation.x = 0; _torso.rotation.z = 0; }
      if (playerGroup) playerGroup.rotation.x = 0;
      if (hitstunType === 'knockdown') getupTimer = KNOCKDOWN_GETUP; // 起身無敵恢復期
    }
    // 硬直期間不接受移動和攻擊輸入（但相機仍可轉）
    mouse.leftClick = false; // 消耗掉任何 pending click
    _sidestepReq = 0;
    _atkRequest = null;
  }

  // Camera orbit（鎖定模式 / 游標模式右鍵拖曳自由環視）
  if (mouse.locked || mouse.freeLook) {
    camYaw   -= mouse.dx * 0.003;
    camPitch -= mouse.dy * 0.002;
    camPitch  = Math.max(-Math.PI / 2.5, Math.min(-0.05, camPitch));
  }
  mouse.dx = 0; mouse.dy = 0;

  // 蓄力放開 → 揮出（按住 0.22s 起算，最長 1.12s = 1.8 倍威力；快點 = 普通快擊）
  if (mouse.lmbFire) {
    mouse.lmbFire = false;
    if (!s.active && hitstunTimer <= 0 && !(!isGrounded && _wasJumped) && !_blocking) {
      _pendingCharge = 1 + THREE.MathUtils.clamp(((mouse.lmbHeldDur || 0) - 0.22) / 0.9, 0, 1) * 0.8;
      _atkRequest = 'slash';
    }
  }

  // 蓄力姿態：按住中 → 武器緩慢舉起凍住；蓄滿金光一閃
  _isCharging = _chargeHeld && !s.active && atk.phase === 'none' && hitstunTimer <= 0 &&
                isGrounded && sidestepTimer <= 0 && !_blocking &&
                (performance.now() - _chargeT0) / 1000 > 0.22;
  if (_isCharging) {
    if (_rv) {
      const chain = LMB_COMBO[treeState.weapon] || LMB_COMBO.sword_shield;
      _rv.play(chain[0].clip, { once: true, clamp: true, dur: 4.5 });   // 超慢前搖 = 蓄力舉劍
    }
    if ((performance.now() - _chargeT0) / 1000 > 1.12 && !_chargeFlashed) {
      _chargeFlashed = true;
      setBodyEmissive(0xffd24a, 0.9);
      setTimeout(() => setBodyEmissive(0x000000, 0), 160);
    }
  } else if (!_chargeHeld) {
    _chargeFlashed = false;
  }

  // ── 盾牌格擋（右鍵按住；單手劍盾限定）──
  const wantBlock = _blockReq && treeState.weapon === 'sword_shield' && !s.active &&
                    hitstunTimer <= 0 && atk.phase === 'none' && sidestepTimer <= 0 &&
                    isGrounded && !isMining() && !_isCharging;
  if (wantBlock !== _blocking) {
    _blocking = wantBlock;
    if (room) room.send('blockState', _blocking ? 1 : 0);
  }

  // Attack（硬直中 / 跳躍中鎖定）
  if (mouse.leftClick && hitstunTimer > 0) mouse.leftClick = false;
  if (mouse.leftClick && !isGrounded && _wasJumped && !s.active) mouse.leftClick = false; // §3.2 主動跳躍時空中不能普攻
  if (mouse.leftClick) {
    mouse.leftClick = false;
    if (s.active) {
      // ── 召喚物攻擊 ──
      if (s.atkCd <= 0) {
        const def = SUMMON_DEFS[s.type];
        if (s.type === 'giant') {
          // Giant：按下只開始瞄準（不扣 CD），mouseup 發射時才進 CD
        } else {
          s.atkCd   = def.atkCd;
          s.atkAnim = 1.0;
          atkRingTimer = 0.35; atkRingMat.opacity = 0.85;
          atkRingMesh.scale.setScalar(def.atkRange / PLAYER_ATK_RANGE);
          atkRingMesh.position.set(playerPos.x, playerPos.y + 0.05, playerPos.z);
          camShake = 0.14;
          if (s.group) summonAttackAnim(s.group,
            s.type === 'wraith' ? 'Dualwield_Melee_Attack_Slice' : '1H_Melee_Attack_Chop');
          for (const d of dummies) {
            if (!d.alive) continue;
            if (playerPos.distanceTo(d.group.position) < def.atkRange) dummyTakeDamage(d, def.atkDmg, false, emboldened);
          }
          if (room) room.send('summonAttack', [playerPos.x, playerPos.z, def.atkDmg, def.atkRange]);
        }
      }
    } else {
      _atkRequest = 'slash';   // LMB = 橫掃
    }
  }

  // ── 三向普攻請求（Chivalry：LMB 橫掃 / 滾輪上縱劈 / 滾輪下突刺）──
  if (_atkRequest && !s.active && !isDead && !_blocking) {
    const v = _atkRequest;
    _atkRequest = null;
    if (hitstunTimer <= 0) {
      if (atk.phase === 'none') {
        if (isGrounded && landLagTimer <= 0 && sidestepTimer <= 0 && mouse.locked) {
          startAttack(-1, null, { variant: v, chargeMul: v === 'slash' ? _pendingCharge : 1 });
        }
      } else if (atk.slot === -1 &&
                 (atk.phase === 'recovery' || (atk.phase === 'active' && atk.t > atk.active * 0.5))) {
        atk.queued = v;   // combo 預約：上一刀收尾時按 → 立即接擊（僅普攻，技能不可緩衝）
      }
    }
    _pendingCharge = 1;
  } else {
    _atkRequest = null;
  }

  // Movement input（硬直 / 落地硬直 / 技能 COMMIT 中鎖定）
  if (hitstunTimer > 0) return;
  if (landLagTimer > 0) { _sidestepReq = 0; return; }

  // ── FEZ §3：角色永遠面向相機（準心）方向，WASD = 前後 + 平移 ──
  // 游標模式（Alt）：面向凍結 → 右鍵環視可繞到角色正面（FEZ 原版行為）
  if (mouse.locked && atk.phase === 'none' && sidestepTimer <= 0) {
    playerYaw = camYaw + Math.PI;
  } else if (mouse.locked && atk.slot === -1 && (atk.phase === 'windup' || atk.phase === 'active')) {
    // Chivalry drag/accel：普攻揮擊中允許「緩速」轉向修正刀路（技能仍完全鎖定）
    const target = camYaw + Math.PI;
    const dy = Math.atan2(Math.sin(target - playerYaw), Math.cos(target - playerYaw));
    const maxTurn = 2.4 * dt;
    playerYaw += THREE.MathUtils.clamp(dy, -maxTurn, maxTurn);
  }

  const fwd   = _mvFwd.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  const right = _mvRight.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
  const dir   = _mvDir.set(0, 0, 0);
  let fwdAmt = 0, strafeAmt = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    { dir.add(fwd); fwdAmt += 1; }
  if (keys['KeyS'] || keys['ArrowDown'])  { dir.sub(fwd); fwdAmt -= 1; }
  if (keys['KeyA'] || keys['ArrowLeft'])  { dir.sub(right); strafeAmt -= 1; }
  if (keys['KeyD'] || keys['ArrowRight']) { dir.add(right); strafeAmt += 1; }
  // 蹲下（採礦姿勢）完全不能移動（§3.4）
  if (keys['KeyC'] && isGrounded && !s.active) { dir.set(0, 0, 0); fwdAmt = 0; strafeAmt = 0; }

  // Chivalry 2：LMB 普攻揮擊中可以移動（減速）；技能仍全鎖（FEZ commit）
  const atkMove = atk.phase !== 'none' && atk.slot === -1 && !s.active;
  const moving = (!_swinging || atkMove) && sidestepTimer <= 0 && dir.lengthSq() > 0.0001;
  // 衝刺：只有向前才能衝 + 需要 SP（§3.3 衝刺中不能放技能，由 useSkillSlot 把關）
  const sprint = !s.active && !_swinging && fwdAmt > 0 && sp > 1 &&
                 (keys['ShiftLeft'] || keys['ShiftRight']);
  // 衝刺持續消耗 SP
  if (sprint && moving && isGrounded) {
    sp = Math.max(0, sp - SP_SPRINT_DRAIN * dt);
    spRegenDelay = SP_REGEN_DELAY;
    updateSpBar(sp, SP_MAX);
  }
  // 方向速度修正：後退 -30%、純平移 -10%（§3.1）
  const dirMult = fwdAmt < 0 ? BACK_MULT : (fwdAmt === 0 && strafeAmt !== 0 ? STRAFE_MULT : 1);
  let horizSpeed = s.active
    ? SUMMON_DEFS[s.type].speed
    : (sprint ? SPRINT_SPEED : MOVE_SPEED * dirMult);
  if (atkMove) horizSpeed *= 0.55;   // 揮擊中移動減速（Chivalry：邊走邊砍但腳步沉）
  if (_blocking)   horizSpeed *= 0.45;   // 舉盾步伐沉
  if (_isCharging) horizSpeed *= 0.40;   // 蓄力中緩步逼近
  if (moving) dir.normalize();

  // ── 側閃 Q/E（§4：0.4s 位移、前 0.3s 物理 i-frame、CD 1.5s、耗 SP）──
  if (_sidestepReq && !s.active && sidestepCd <= 0 && sidestepTimer <= 0 &&
      isGrounded && !_swinging && !_blocking && !_isCharging && !isMining() && spendSP(SP_SIDESTEP_COST)) {
    sidestepVec.copy(right).multiplyScalar(_sidestepReq); // 螢幕方向：Q=左 E=右
    sidestepDirLocal = Math.sign(
      sidestepVec.x * Math.cos(playerYaw) - sidestepVec.z * Math.sin(playerYaw)
    ) || 1;
    sidestepTimer = SIDESTEP_DUR;
    sidestepCd    = SIDESTEP_CD;
    spawnDashTrail(playerPos.clone(), playerYaw);
    sfxDash();
  }
  _sidestepReq = 0;

  // Jump（Space，§3.2：i-frame、慣性主導、無雙跳、耗 SP；陡坡上禁跳）
  if (keys['Space'] && isGrounded && !_onSteepSlope && !_swinging && !_blocking && !_isCharging && sidestepTimer <= 0 && spendSP(SP_JUMP_COST)) {
    yVelocity = JUMP_VEL;
    airVel.set(dir.x * horizSpeed, 0, dir.z * horizSpeed);
    _wasJumped = true; // 標記主動跳躍（落地才清除，不在這裡清除）
    sfxDash();
    if (_rv) _rv.play('Jump_Start', { once: true, dur: 0.22, retrigger: true });
  }

  // Apply gravity (only when not grounded)
  if (!isGrounded) {
    yVelocity += GRAVITY * dt;
  } else if (yVelocity < 0) {
    yVelocity = 0;
  }

  // Walk time counter（body 動畫用；採礦時也遞增以驅動 animateSit）
  // 衝刺步頻由 animateWalk 的 freq 控制，這裡不再額外加速
  if ((moving && isGrounded) || isMining()) walkTime += dt;

  // 腳步揚塵（跑得越快揚越密）
  if (moving && isGrounded) {
    _footDustTimer += dt;
    if (_footDustTimer >= (sprint ? 0.18 : 0.3)) {
      _footDustTimer = 0;
      spawnFootDust(playerPos);
    }
  }

  // Physics movement via character controller
  if (physics && charController && charBody && charCollider) {
    // 側閃 > 跳躍慣性 > 一般移動
    let hmx = 0, hmz = 0;
    if (sidestepTimer > 0) {
      sidestepTimer -= dt;
      // 位移速度曲線：前快後慢（ease-out）
      const k = Math.max(0, sidestepTimer / SIDESTEP_DUR);
      const spd = (SIDESTEP_DIST / SIDESTEP_DUR) * (0.4 + 1.2 * k);
      hmx = sidestepVec.x * spd * dt; hmz = sidestepVec.z * spd * dt;
    } else if (!isGrounded && _wasJumped) {
      // 主動跳躍：鎖定起跳時的 airVel（i-frame 期間固定方向）
      hmx = airVel.x * dt; hmz = airVel.z * dt;
    } else if (moving) {
      // 踏邊掉落（!_wasJumped）：仍可用鍵盤控制水平方向
      hmx = dir.x * horizSpeed * dt; hmz = dir.z * horizSpeed * dt;
    }
    // ── 陡坡滑落：站上 >40° 山坡 → 沿坡滑下、禁跳（山不可跳級攀登）──
    _onSteepSlope = false;
    if (isGrounded && yVelocity <= 0) {
      const e = 0.6;
      const sgx = (getTerrainHeight(playerPos.x + e, playerPos.z) - getTerrainHeight(playerPos.x - e, playerPos.z)) / (2 * e);
      const sgz = (getTerrainHeight(playerPos.x, playerPos.z + e) - getTerrainHeight(playerPos.x, playerPos.z - e)) / (2 * e);
      const sm = Math.hypot(sgx, sgz);
      // 限地形表面（站在城堡/箭塔等建築 collider 上不滑）
      const onTerrain = playerPos.y - 0.35 < getTerrainHeight(playerPos.x, playerPos.z) + 0.9;
      if (sm > 0.84 && onTerrain) {
        _onSteepSlope = true;
        const slide = 6.5 * dt;
        hmx += (-sgx / sm) * slide;
        hmz += (-sgz / sm) * slide;
      }
    }
    const desiredMovement = { x: hmx, y: yVelocity * dt, z: hmz };

    charController.computeColliderMovement(charCollider, desiredMovement, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const corrected = charController.computedMovement();
    const prevGrounded = isGrounded;
    isGrounded = charController.computedGrounded();
    if (isGrounded) _airTime = 0; else _airTime += dt;

    // 落地瞬間
    if (!prevGrounded && isGrounded) {
      const wasActiveJump = _wasJumped;
      _wasJumped = false; // 落地才清除跳躍旗標
      if (!s.active && (wasActiveJump || airTime > 0.5)) {
        landLagTimer = LAND_LAG; // §3.2 落地 recovery 0.15s
        airVel.set(0, 0, 0);
        spawnFootDust(playerPos, true); // 落地揚塵
      }
    }
    airTime = isGrounded ? 0 : airTime + dt;
    wasGrounded = isGrounded;

    // 以 playerPos 為基底（支援外部傳送），不讀 charBody.translation()
    // 邊界：把移動目標限制在島內（圓形 R=54），不讓玩家走進海或掉出界
    let _tx = playerPos.x + corrected.x, _tz = playerPos.z + corrected.z;
    const _BR = 54, _bd2 = _tx * _tx + _tz * _tz;
    if (_bd2 > _BR * _BR) { const _bd = Math.sqrt(_bd2); _tx = _tx / _bd * _BR; _tz = _tz / _bd * _BR; }
    charBody.setNextKinematicTranslation({
      x: _tx,
      y: playerPos.y + 0.5 + corrected.y,
      z: _tz,
    });
    physics.step();
    _physicsStepped = true;

    const newT = charBody.translation();
    playerPos.set(newT.x, newT.y - 0.5, newT.z); // offset: capsule center is 0.5 above feet
  }

  updateSummonTransform(playerYaw, walkTime, dt);
  if (!s.active && playerGroup) {
    playerGroup.position.set(playerPos.x + _vOff.x, playerPos.y - 0.35 + _vOff.y, playerPos.z + _vOff.z);
    playerGroup.rotation.y = playerYaw;
  }

  // i-frame 視覺：主動跳躍騰空 / 側閃前段發藍光（踏邊掉落不觸發）
  if ((_rv || _rig) && !s.active) {
    const iframeVis = (!isGrounded && _wasJumped) || sidestepTimer > SIDESTEP_DUR - SIDESTEP_IFRAME;
    if (iframeVis) {
      setBodyEmissive(0x0044ff, 0.45);
    } else if (emboldened) {
      setBodyEmissive(0xffaa00, 0.5);   // Embolden 超甲金光（§7.5）
    } else {
      setBodyEmissive(0x000000, 0);
    }

    // 落地壓扁動畫（體素限定；rigged 用 Jump_Land 剪輯）
    if (!_rv && _rig) {
      if (landLagTimer > 0) {
        const ratio = landLagTimer / LAND_LAG;
        _rig.pelvis.scale.y = THREE.MathUtils.lerp(1.0, 0.55, ratio);
      } else {
        _rig.pelvis.scale.y = 1.0;
      }
    }
  }

  // ── KayKit 骨骼動畫：FSM 狀態 → 剪輯（attack/hitstun 已在各自處理點播放）──
  if (_rv && !s.active) {
    if (atk.phase !== 'none') {
      // 攻擊剪輯播放中，不覆蓋
    } else if (isMining()) {
      _rv.play('Sit_Floor_Idle');
    } else if (sidestepTimer > 0) {
      _rv.play(sidestepDirLocal > 0 ? 'Dodge_Right' : 'Dodge_Left',
        { once: true, dur: SIDESTEP_DUR + 0.12, clamp: true });
    } else if (_blocking) {
      _rv.play('Blocking');   // 舉盾格擋（loop）
    } else if (_isCharging) {
      // 蓄力姿態由上方的慢速 windup play 維持（這裡不覆蓋）
    } else if (!isGrounded && (_wasJumped || _airTime > 0.16)) {
      // 走下地形小起伏會離地一兩幀 → 不立即切空中動畫（防 Jump_Idle 開關抖動）
      _rv.play('Jump_Idle');
    } else if (landLagTimer > 0) {
      _rv.play('Jump_Land', { once: true, dur: 0.3, clamp: true });
    } else if (moving) {
      const localF = dir.x * Math.sin(playerYaw) + dir.z * Math.cos(playerYaw);
      const localS = dir.x * Math.cos(playerYaw) - dir.z * Math.sin(playerYaw);
      let clip = 'Walking_A';
      if (sprint) clip = 'Running_A';
      else if (localF < -0.35) clip = 'Walking_Backwards';
      else if (Math.abs(localS) > 0.65) clip = localS > 0 ? 'Running_Strafe_Right' : 'Running_Strafe_Left';
      _rv.play(clip, { timeScale: sprint ? 1.1 : 1.05 });
    } else {
      _rv.play('Idle');
    }
  }

  // 體素角色動畫（idle / walk / jump / sidestep / sit）— rigged 未載入時的 fallback
  if (!_rv && _rig && _animEffects.length === 0 && !s.active) {
    const stanceY = (IDLE_POSE[treeState.weapon] || IDLE_POSE.sword_shield).uY || 0;
    if (isMining()) {
      _rig.animateSit(walkTime);
    } else if (sidestepTimer > 0) {
      _rig.animateSidestep(1 - sidestepTimer / SIDESTEP_DUR, sidestepDirLocal);
    } else if (!isGrounded) {
      _rig.animateJump(yVelocity);
      if (TWO_HAND_WEAPONS.has(treeState.weapon)) _gripLeftHand();
    } else if (moving) {
      // 方向性步伐：移動方向轉換到角色局部空間（FEZ：面向準心不變，腿沿移動方向擺）
      const localF = dir.x * Math.sin(playerYaw) + dir.z * Math.cos(playerYaw);
      const localS = dir.x * Math.cos(playerYaw) - dir.z * Math.sin(playerYaw);
      _rig.animateWalk(walkTime, localF, localS, sprint, stanceY);
      _bendElbows();
      if (TWO_HAND_WEAPONS.has(treeState.weapon)) _gripLeftHand();
    } else {
      // Weapon-specific idle pose (matches HTML reference applyIdle)
      const p = IDLE_POSE[treeState.weapon] || IDLE_POSE.sword_shield;
      const b = Math.sin(walkTime * 1.6) * 0.03;
      _rig.pelvis.position.y = 1.0 + b * 0.04;
      _rig.pelvis.rotation.y = 0;
      if (_armR) _armR.shoulder.rotation.set(p.aRx + b * 0.5, 0, p.aRz || 0);
      if (_armL) _armL.shoulder.rotation.set(p.aLx - b * 0.5, 0, p.aLz || 0);
      _torso.rotation.y += ((p.uY || 0) - _torso.rotation.y) * Math.min(1, dt * 8);
      _torso.rotation.x = (p.uX || 0) + b * 0.3;
      _torso.rotation.z = 0;
      _bendElbows();
      if (TWO_HAND_WEAPONS.has(treeState.weapon)) _gripLeftHand();
      [_rig.legL, _rig.legR].forEach(l => { if (l) { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); } });
    }
  }

  // Camera spring arm（召喚物體積大，相機拉遠）
  const camDist = s.active
    ? ({ knight: 12, giant: 18, wraith: 10 }[s.type] ?? 10)
    : CAM_DIST;
  const pitchQ = _camPitchQ.setFromEuler(_camEuler.set(camPitch, 0, 0));
  const yawQ   = _camYawQ.setFromEuler(_camEuler.set(0, camYaw, 0));
  const offset = _camOffset.set(0, 0, camDist).applyQuaternion(pitchQ).applyQuaternion(yawQ);
  const lookTarget = _camLook.copy(playerPos).add(CAM_HEIGHT_OFFSET);
  if (camShake > 0) {
    camShake -= dt * 4;
    const shk = Math.max(0, camShake);
    offset.x += (Math.random() - 0.5) * shk * 0.6;
    offset.y += (Math.random() - 0.5) * shk * 0.6;
  }
  camera.position.lerp(_camDest.copy(lookTarget).add(offset), 0.15);
  camera.lookAt(lookTarget);

  // FOV punch：命中瞬間視野收縮 ~2.6°，0.2s 內回彈（配合凍幀的衝擊感）
  if (_fovPunch > 0.001) {
    _fovPunch = Math.max(0, _fovPunch - dt * 6);
    camera.fov = 60 - _fovPunch * 2.6;
    camera.updateProjectionMatrix();
  } else if (camera.fov !== 60) {
    camera.fov = 60;
    camera.updateProjectionMatrix();
  }

  if (atkRingTimer > 0) {
    atkRingTimer -= dt;
    const r = Math.max(0, atkRingTimer / 0.35);
    atkRingMat.opacity = r * 0.7;
    // 從 0.35 擴大到 1.0 隨 ring 消失
    atkRingMesh.scale.setScalar(THREE.MathUtils.lerp(1.0, 0.35, r));
  }

  sendTimer += dt;
  if (sendTimer >= 0.05 && room) {
    sendTimer = 0;
    room.send('updatePos', [playerPos.x, playerPos.y, playerPos.z, playerYaw, isGrounded ? 1 : 0, 0]);
  }
}

// HUD → see src/ui/hud.js
// Round Timer → see src/ui/hud.js
const elTowerCount = document.getElementById('tower-count');
const elKillCount  = document.getElementById('kill-count');

// ─── Map ─────────────────────────────────────────────────────
/** gateSign：城門開在 cz + gateSign*6（朝戰場中央） */
function addCastleColliders(cx, cz, gateSign) {
  // 外城牆：高4（visual y=0..4）, half-y=2, center-y=2
  // 背面（朝地圖邊緣）：完整13格
  physics.createCollider(RAPIER.ColliderDesc.cuboid(6.5, 2, 0.5).setTranslation(cx, 2, cz - gateSign * 6));
  // 門口面（朝戰場）：左右各5格，中間3格（|dx|<2）留城門缺口
  physics.createCollider(RAPIER.ColliderDesc.cuboid(2.5, 2, 0.5).setTranslation(cx - 4, 2, cz + gateSign * 6));
  physics.createCollider(RAPIER.ColliderDesc.cuboid(2.5, 2, 0.5).setTranslation(cx + 4, 2, cz + gateSign * 6));
  // 東面 (dx=+6)
  physics.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 2, 6.5).setTranslation(cx + 6, 2, cz));
  // 西面 (dx=-6)
  physics.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 2, 6.5).setTranslation(cx - 6, 2, cz));

  // 四角塔（3×3，高8）
  [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(([tx, tz]) => {
    physics.createCollider(RAPIER.ColliderDesc.cuboid(1.5, 4, 1.5).setTranslation(cx + tx, 4, cz + tz));
  });

  // 中央主塔（5×5 frame，高10）—— 四面牆獨立 box
  physics.createCollider(RAPIER.ColliderDesc.cuboid(2.5, 5, 0.5).setTranslation(cx,     5, cz - 2));
  physics.createCollider(RAPIER.ColliderDesc.cuboid(2.5, 5, 0.5).setTranslation(cx,     5, cz + 2));
  physics.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 5, 2.5).setTranslation(cx + 2, 5, cz));
  physics.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 5, 2.5).setTranslation(cx - 2, 5, cz));
}
function buildMap(){
  // 水晶礦節點（遊戲邏輯用，完全對稱）
  CRYSTAL_POSITIONS.forEach(([x,z]) => spawnCrystalNode(x, z, 5 + Math.floor(Math.random() * 3)));

  // SoI 影響圈（藍紅對稱）
  createSoICircle(0,  50, 28, 0x4488ff);
  createSoICircle(0, -50, 28, 0xff4422);

  // 體素地圖（地形 + 城堡 + 裝飾）
  buildVoxelMap(scene, CRYSTAL_POSITIONS);
}

// ─── Game Loop ────────────────────────────────────────────────
// 遊戲迴圈例外 → 顯示在畫面上（否則表現為無聲卡死）
let _loopErrShown = false;
function _reportLoopError(err) {
  console.error('[game loop]', err);
  if (_loopErrShown) return;
  _loopErrShown = true;
  setStatus(t('g_err', { msg: err?.message || err }));
}
window.addEventListener('error', e => _reportLoopError(e.error || e.message));

renderer.setAnimationLoop(() => {
  if (!_enteredGame) { try { _renderIntroView(); } catch (err) { _reportLoopError(err); } return; }   // 未進場：電影鏡頭繞看地圖當進場背景
  try { _gameFrame(); } catch (err) { _reportLoopError(err); }
});

// 進場前：一台 cinematic 鏡頭緩慢繞看整個戰場地圖（無玩家、無 HUD），當作開場背景
function _renderIntroView() {
  const t = performance.now() / 1000;
  const r = 92, h = 44;
  camera.position.set(Math.cos(t * 0.04) * r, h + Math.sin(t * 0.07) * 4, Math.sin(t * 0.04) * r);
  camera.lookAt(0, 12, 0);   // 略低角度看向中心：地圖鋪在下半、天空在上半，近側邊緣落在畫面外
  if (scene.fog) { scene.fog.near = 30; scene.fog.far = 220; }   // 霧距：島嶼本身清楚、遠處外海與邊界融進天空色
  try { updateEnvironment(0.016); } catch { /* noop */ }
  renderer.render(scene, camera);
}

function _gameFrame() {
  const rawDt = Math.min(clock.getDelta(), 0.05);
  // 打擊凍幀（hitstop）：命中瞬間遊戲時間凍結到 6%，動作的「咬肉感」
  let dt = rawDt;
  if (_hitStop > 0) { _hitStop = Math.max(0, _hitStop - rawDt); dt = rawDt * 0.06; }
  updateRemotes(dt);  // 先 setNextKinematicTranslation，再讓 physics.step() 看到
  updatePlayer(dt);
  // 保底物理步進：死亡/硬直時 updatePlayer 提早 return 沒有 step，ragdoll 仍需模擬
  if (physics && !_physicsStepped) physics.step();
  _physicsStepped = false;
  // 骨骼動畫推進（ragdoll 時停用 mixer，否則非驅動骨骼[手/武器掛點]會繼續播循環動畫亂轉）
  if (_rv && !_myRag) _rv.update(dt);
  _updateAnims(dt);
  if (_trailActive) _updateTrail();
  updateEnemies(dt);
  updateDyingEnemies(dt);
  updateTowers(dt, myTeam, room);
  updateParticles(dt);
  updatePW(dt);
  updateDummies(dt);
  updateDmgNumbers(dt);
  updateMining(dt);
  updateBuildGhost();
  updateObelisks(dt);   // 方尖塔浮游水晶
  camShake = Math.max(camShake, updateGiantProjectiles(dt, room));
  updateGiantAimVisual();
  updateSummons(dt);
  updateLightPool(dt);
  updateEnvironment(dt);
  updateWorldAnim(dt, playerPos, camera.position);   // 玩家=草壓彎中心、相機=billboard 視點
  updateShadowFollow();
  updateRagdolls();   // 必須在所有 mixer 更新之後：物理覆寫骨骼姿態
  _updateNameLabel();  // 本地玩家頭上的角色名牌
  if (usePostFX()) {
    gradePass.uniforms.uTime.value += dt;   // 膠片顆粒動畫時鐘
    composer.render();
  } else {
    renderer.render(scene, camera);   // 低畫質：跳過整條後處理
  }
  try { _drawMinimap(); } catch { /* noop */ }
}

// ─── Init ────────────────────────────────────────────────────
updateHpBar(hp);
updatePwBar(pw, maxPw);
updateSpBar(sp, SP_MAX);
updateCrystalHUD(crystalState.count);
updateKeepBar(keepHp1, keepHp2, maxKeepHp);
initSkillPanel((w) => updateWeaponMesh(w));
initDebugPanel();
unlockAllSkills(); // 測試用：啟動即解鎖全部技能並填滿槽位
updateSkillBarHUD();

// Initialize modules that need scene/camera references
initParticles(scene);
setParticleCamera(camera);
initDmgNumbers(camera);
initSummon(scene);
initEnemy(scene, camera);
initRemotePlayer(scene);
initSoI(scene, () => physics, RAPIER);
initDummy(scene, camera, () => { killCount++; _gainXp(25); elKillCount.textContent = killCount; });
initSummonSystem(scene, camera, playerPos, mouse, atkRingMesh);
initCrystal(scene, camera, playerPos, keys, () => isDead);
initBuildMenu(scene, playerPos, () => playerYaw, crystalState, towersLeftRef,
  (n) => { elTowerCount.textContent = n; }, () => room);
initAppearanceUI(rebuildPlayerAppearance);   // 角色外觀面板（O 鍵；與技能系統完全獨立）
initAppearancePreview(document.getElementById('ap-preview'), {
  getWeapon: () => treeState.weapon,           // 預覽掛「現在所用」的武器
  getWeaponTemplate: _getWeaponTemplate,
});
initSuiPanel(() => rebuildPlayerAppearance('gear'));   // Sui 鏈上衣櫥（裝備 NFT → 重建 + 廣播）
initMarketHud(() => ({ hp1: keepHp1, hp2: keepHp2, max: maxKeepHp }));   // 場內預測市場 HUD（B）

// Build map first (needs no async), then init physics, then connect
buildMap();

// 測試地圖假人：中央 + 兩座城堡周邊（測攻城/技能/吹飛）
for (const [dx, dz] of [
  [0, 0], [-18, 5], [18, 5],
  // 藍堡周邊
  [-9, 41], [9, 41], [-12, 50], [12, 50],
  // 紅堡周邊
  [-9, -41], [9, -41], [-12, -50], [12, -50],
]) {
  const d = spawnDummy(dx, dz);
  d.baseY = getTerrainHeight(dx, dz);
  d.group.position.y = d.baseY;
}

// 開場「進入戰場」才真正連線（先套用所屬國旗色再連、連上後廣播外觀）
let _enteredGame = false;
function startGame() {
  if (_enteredGame) return;
  _enteredGame = true;
  if (scene.fog) { scene.fog.near = 26; scene.fog.far = 170; }   // 恢復遊戲霧距（cinematic 進場時曾拉近）
  const hudEl = document.getElementById('hud'); if (hudEl) hudEl.style.display = '';   // 進場才顯示 HUD
  initSfx();                                 // 進入時解鎖音效（Enter 是使用者手勢）
  rebuildPlayerAppearance('model');         // 套用所屬國染色到本地模型
  connectToServer().catch(console.error);
  canvas.requestPointerLock();
}
// 大廳查詢：用 Colyseus getAvailableRooms 取戰場在線人數（不需連進房）
const _lobbyClient = new Client(SERVER_URL);
async function queryServers() { return await _lobbyClient.getAvailableRooms(ROOM_NAME); }
initIntro({ onEnter: startGame, queryServers });   // 登入→世界地圖(人數)→參戰

initPhysics().then(() => {
  // Tower module needs physics reference (for colliders)
  initTower(scene, physics, RAPIER);
  initRemotePlayerPhysics(physics, RAPIER);
  initEnemyPhysics(physics, RAPIER);
  // Castle colliders（buildCastle 在 physics 前跑，這裡補建）
  // 城門皆朝戰場中央：藍堡(+z) 門開 -z、紅堡(-z) 門開 +z
  addCastleColliders(0,  50, -1);   // 藍方
  addCastleColliders(0, -50, +1);   // 紅方
  buildPlayerMesh();
  setSummonPlayerGroup(playerGroup);
  setCrystalPlayerRefs(playerGroup, playerWeaponGroup, _torso);
  // 不自動連線：等開場畫面按「進入戰場」（startGame）
}).catch(err => {
  setStatus(t('g_init_fail', { msg: err.message }));
  console.error(err);
  buildPlayerMesh();
  setSummonPlayerGroup(playerGroup);
  setCrystalPlayerRefs(playerGroup, playerWeaponGroup, _torso);
});
