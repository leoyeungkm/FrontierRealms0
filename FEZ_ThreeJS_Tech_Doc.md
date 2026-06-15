# FEZ (Fantasy Earth Zero) Three.js 重製版 — 技術文檔

> 目標：以 Three.js 為渲染核心，重現《幻想戰記 / Fantasy Earth Zero》（Square Enix, 2006）的 50v50 國戰核心體驗 — 動作戰鬥 + RTS 資源/建築/召喚 + 領地影響範圍。
> 本文檔為架構與系統規格，不含具體美術資源；數值參考日版/北美版 wiki，可依實作調整。
> 版本：v1.0｜最後更新：2026-05

---

## 目錄

1. [遊戲概念與範圍](#1-遊戲概念與範圍)
2. [技術選型](#2-技術選型)
3. [整體架構](#3-整體架構)
4. [Three.js 渲染層設計](#4-threejs-渲染層設計)
5. [角色系統 (Class System)](#5-角色系統-class-system)
6. [戰鬥系統](#6-戰鬥系統)
7. [RTS 經濟系統 (水晶/建築/召喚)](#7-rts-經濟系統)
8. [影響範圍與勝負判定 (Sphere of Influence)](#8-影響範圍與勝負判定)
9. [網路同步 (50v50)](#9-網路同步-50v50)
10. [地圖與場景](#10-地圖與場景)
11. [UI / HUD](#11-ui--hud)
12. [音效系統](#12-音效系統)
13. [效能最佳化](#13-效能最佳化)
14. [資料模型 (Data Schema)](#14-資料模型-data-schema)
15. [專案結構](#15-專案結構)
16. [開發路線圖](#16-開發路線圖)
17. [已知技術風險](#17-已知技術風險)

---

## 1. 遊戲概念與範圍

### 1.1 核心玩法
- **第三人稱動作 + RTS 混合**：玩家操控單一角色，但戰場有資源採集、建築建造、單位召喚等 RTS 元素
- **50v50 國戰 (KvK, Kingdom vs Kingdom)**：兩個敵對國家各派最多 50 名玩家
- **無自動鎖定**：手動瞄準，WASD 移動，技能釋放靠玩家操作
- **勝負條件**：摧毀敵方主堡 (Keep) 或讓對方影響範圍歸零

### 1.2 重製範圍 (MVP)
為避免一次做太大，建議分階段：
- **Phase 0**：單人沙盒 (走、跳、揮劍、地形)
- **Phase 1**：本地 PvE (一個職業 + 採礦 + 蓋一棟塔)
- **Phase 2**：5v5 線上對戰 (壓縮版地圖、3 職業、基本召喚)
- **Phase 3**：50v50 完整國戰 (5 職業、全召喚、Sphere of Influence)

### 1.3 不在範圍內 (建議放棄或延後)
- MMO 城鎮、PvE 練功、商城、公會系統 (原版 FEZ 大部分玩家根本不在意這些)
- 五國劇情、語音 NPC
- 反作弊 (個人重製版用 trust-client + 簡單檢查即可)

---

## 2. 技術選型

| 模組 | 推薦方案 | 備註 |
|---|---|---|
| 渲染 | **three.js** (r160+) | 核心 |
| 物理 | **Rapier.js** (rapier3d-compat) | WASM、效能比 cannon-es 好 |
| 角色控制 | 自製 Kinematic Character Controller | 用 Rapier 的 ray + capsule 做 |
| 動畫 | three.js AnimationMixer + Mixamo / 自製 rig | GLB 格式 |
| 載入 | GLTFLoader + DRACOLoader + KTX2Loader | 壓縮模型與貼圖 |
| 後處理 | postprocessing (pmndrs) | Bloom、Outline、SSAO |
| 狀態管理 | **Zustand** (client) | 比 Redux 輕 |
| 客戶端框架 | Vite + TypeScript + React (僅 UI 層) | Canvas 純 three.js |
| 網路 | **Colyseus** (建議) 或 **Socket.IO + 自製 schema** | Colyseus 有現成的 state sync |
| 伺服器 | Node.js (TypeScript) | 與客戶端共用型別 |
| 序列化 | @colyseus/schema 或 MessagePack | 二進位、節省頻寬 |
| 資料庫 | SQLite (開發) / PostgreSQL (上線) | 帳號、角色存檔 |
| 部署 | 客戶端：Cloudflare Pages；伺服器：fly.io / Railway | |

**為什麼選 Colyseus 而不是純 Socket.IO**：
Colyseus 內建 room、room state 的 delta 同步、reconnection — 50v50 自己手寫這些坑會踩很久。如果你想完全自製，去看「Glenn Fiedler — Networked Physics」系列，預期會多花 2-3 個月。

---

## 3. 整體架構

```
┌─────────────────────────────────────────────────────────┐
│                       Browser                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │  React UI  │  │  three.js  │  │  Rapier (client)   │ │
│  │  (HUD)     │  │  Scene     │  │  僅做預測/插值     │ │
│  └─────┬──────┘  └─────┬──────┘  └──────────┬─────────┘ │
│        │               │                     │           │
│  ┌─────▼───────────────▼─────────────────────▼─────────┐ │
│  │              GameClient (Zustand store)              │ │
│  │     - 輸入收集 / 預測 / 插值 / 與 server 同步        │ │
│  └─────────────────────────┬────────────────────────────┘ │
└────────────────────────────┼──────────────────────────────┘
                             │ WebSocket (Colyseus)
                             │ Binary state delta @ 20Hz
┌────────────────────────────▼──────────────────────────────┐
│              Node.js Game Server (權威)                    │
│  ┌──────────────────┐  ┌────────────────────────────────┐ │
│  │  Colyseus Room   │  │   Rapier (server, headless)    │ │
│  │  (一房間=一戰場) │  │   - 權威物理、碰撞、子彈        │ │
│  └────────┬─────────┘  └────────────────────────────────┘ │
│           │                                                │
│  ┌────────▼───────────────────────────────────────────┐  │
│  │  Game Logic                                         │  │
│  │  - 戰鬥/技能 - 採礦 - 建築 - 召喚 - Keep HP - SoI  │  │
│  └─────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                             │
                       PostgreSQL (帳號 / 角色)
```

### 3.1 客戶端職責
- 渲染、UI、音效、輸入收集
- 客戶端預測 (Client-Side Prediction)：自己角色的移動立即生效，伺服器糾正時做 reconciliation
- 其他玩家做 **entity interpolation** (延遲 100ms 回放)

### 3.2 伺服器職責
- 一切會影響戰局的事都在伺服器算 (HP、傷害、採礦、建築建造、召喚)
- Tick rate: **20 Hz** (50ms 一個 tick；戰況激烈時可考慮 30Hz，再高頻寬會爆)
- 廣播 rate: 20 Hz，每包只送 delta

---

## 4. Three.js 渲染層設計

### 4.1 場景結構
```
Scene
├── Sky (Sky shader 或 HDR)
├── Lights
│   ├── DirectionalLight (太陽，啟用 shadow，cascade 自製或用 csm)
│   └── AmbientLight / HemisphereLight
├── Terrain (Heightmap → BufferGeometry，分 chunk)
├── Static Props (樹、岩石、地標 — InstancedMesh)
├── Buildings (Obelisk / Arrow Tower / etc — InstancedMesh per type)
├── Players (SkinnedMesh，可考慮 InstancedSkinnedMesh)
├── Summons (Knight / Giant / Wraith / Chimera / Dragon)
├── Projectiles (箭、火球 — Points 或 InstancedMesh)
├── Effects (Particles、傷害數字)
└── UI Helpers (HP bar billboards)
```

### 4.2 相機
- 第三人稱跟隨相機，滑鼠右鍵旋轉
- 自帶 collision：用 raycast 從角色頭部往相機目標位置打，碰到物件就把相機拉近
- 預設距離 6m，FOV 60°，可滾輪 zoom 3m~10m

```ts
// 偽碼
const idealPos = player.position.clone()
  .add(offset.applyQuaternion(camYawPitch));
raycaster.set(player.head, idealPos.clone().sub(player.head).normalize());
const hits = raycaster.intersectObjects(staticColliders);
camera.position.copy(hits[0]?.point ?? idealPos);
```

### 4.3 渲染管線
- **Forward rendering** (Deferred 在 three.js 上自製太貴，不建議)
- 後處理 stack：
  - SMAA / FXAA (反鋸齒)
  - SSAO (可選，戰場 60+ 單位時關掉)
  - Bloom (技能特效很需要)
  - Outline (鎖定/瞄準目標時用)

### 4.4 陰影
- DirectionalLight 動態陰影只開玩家附近 40m
- 遠處用 **lightmap baked** (Blender 烤好放進 GLB)
- shadow map size 2048，PCF Soft

### 4.5 LOD 與 Instancing
- 玩家角色：3 級 LOD (高/中/低，距離 15m/35m)
- 箭塔等建築：InstancedMesh，所有同型建築共享一個 mesh，差異存在 instance attribute (顏色/HP%)
- 樹/草：InstancedMesh + frustum culling 自製 (three.js 預設不會 cull instance)

---

## 5. 角色系統 (Class System)

### 5.1 五大職業

| 職業 (Class) | 武器 | 定位 | 關鍵特性 |
|---|---|---|---|
| **Warrior (戰士)** | 單手劍+盾 / 長槍 / 雙手劍 | 前線坦克/輸出 | 高 HP、Embolden 抗擊飛、子流派多 |
| **Sorcerer (法師)** | 法杖 / 寵物 | 中距 AoE | 火/冰/雷三系，蓄力施法 |
| **Scout (斥候)** | 弓 / 槍 / 短劍 | 遠程狙擊 | 機動性高、暴擊高 |
| **Fencer (劍士)** | 細劍 | 反擊 / 機動 | 突進、反擊判定 |
| **Cestus (鬥士)** | 拳套 | 攻城 / 修建 | 對建築傷害高、可治療己方建築 |

### 5.2 職業相剋 (Rock-Paper-Scissors)
基礎傷害修正：
- Warrior **吃** Scout (戰士打斥候 +damage)
- Scout **吃** Sorcerer
- Sorcerer **吃** Warrior
- Fencer 和 Cestus 走特殊定位 (見技能設計)

實作：
```ts
const CLASS_MATRIX: Record<Class, Record<Class, number>> = {
  warrior:  { warrior: 1.0, scout: 1.3, sorcerer: 0.7, fencer: 1.0, cestus: 1.0 },
  scout:    { warrior: 0.7, scout: 1.0, sorcerer: 1.3, fencer: 1.0, cestus: 1.0 },
  sorcerer: { warrior: 1.3, scout: 0.7, sorcerer: 1.0, fencer: 1.0, cestus: 1.0 },
  // ...
};
```

### 5.3 等級與技能點
- 等級上限 40，每級獲得技能點，總計 40 點
- 每個職業 ~15 個技能，需點數解鎖
- 子職業系統：練其他職業到一定等級會給主職業一點點 bonus (subclass bonus，最大 4%)

### 5.4 角色 Stats
```ts
interface CharacterStats {
  hp: number;        // 生命
  pw: number;        // Power (技能能量)，每 3s 恢復一格
  attack: number;
  defense: number;
  moveSpeed: number; // 基準 5 m/s
  weight: number;    // 影響移動 / 跳躍
}
```

PW 系統很重要：技能不靠 cooldown 限制，靠 PW 池子。原版 PW 每 3s tick 一次回復。

### 5.5 動畫狀態機

```
Idle ─┬── WalkForward / Strafe / Back
      ├── Run (Shift)
      ├── Jump (Space) → Falling → Land
      ├── Attack_1 → Attack_2 → Attack_3 (combo)
      ├── SkillCast (parameterized by skill id)
      ├── Hit (受擊硬直)
      ├── Stagger (擊飛)
      └── Death
```
建議用 **Mixamo** 抓基礎動畫，自己用 Blender 改節奏 (Mixamo 動畫普遍太慢，FEZ 是快節奏)。

---

## 6. 戰鬥系統

### 6.1 命中判定 — 沒有自動鎖定
- 普攻：扇形 hitbox (45° 角，1.5m 距離)，伺服器用 OBB vs Capsule 判定
- 投射物 (箭、火球)：伺服器 tick 內做 raycast 推進
- 範圍技 (爆裂、Ice Javelin)：球形 / 圓柱形 query，命中所有在範圍內的敵人

### 6.2 傷害公式
```
finalDamage = baseSkillDamage 
            × (1 + classMatrixMultiplier)
            × (1 + (attacker.attack - defender.defense) / 200)
            × (1 + subclassBonus)
            × criticalMultiplier  // 1.0 或 1.5
            × randomVariance      // 0.95~1.05
```
所有公式都跑在伺服器上，客戶端只做動畫預覽。

### 6.3 狀態效果
- **Stun (暈)**：完全無法行動 (盾擊、Ice Javelin)
- **Bind (定身)**：不能移動但可施法
- **Slow**：移動速度 -X%
- **Knockback**：擊退
- 戰士的 **Embolden** 技能：buff 期間免疫硬直 (重要前線機制)

實作為 component (ECS-style)：
```ts
interface StatusEffect {
  type: 'stun' | 'bind' | 'slow' | 'silence' | 'embolden';
  duration: number;  // ms
  potency?: number;
  sourceId: string;
}
character.statuses: StatusEffect[];
```

### 6.4 技能設計範例

**Warrior — Shield Bash**
- PW Cost: 2
- 前搖 300ms，盾打範圍 1.8m 扇形
- 命中：傷害 80% + Stun 1.5s
- 動畫：`shield_bash_v1.glb`

**Sorcerer — Fireball**
- PW Cost: 3
- 蓄力 1s，可移動但走得慢 50%
- 投射物速度 25 m/s，爆炸範圍 2.5m
- 傷害 130%，可被打斷

技能定義表存在 `data/skills.ts`，伺服器與客戶端共用。

---

## 7. RTS 經濟系統

### 7.1 水晶 (Crystals)
- 戰場散佈大水晶礦，玩家蹲下 (C 鍵) 開採
- 採礦速度：3 秒/顆，背包上限 50
- **採超過 12 顆後變慢** (10 秒/顆) — 原版防壟斷機制，必須保留
- 礦有 HP，採完會消失
- 玩家死亡掉所有水晶 (掉地上可撿)
- 玩家之間可以交易水晶 (R 鍵對著隊友)

### 7.2 建築一覽

| 建築 | 用途 | 水晶成本 | 上限 | HP | 備註 |
|---|---|---|---|---|---|
| **Obelisk (方尖塔)** | 擴張影響範圍 | 12 | 多 | 中 | 基礎擴張塔 |
| **Eclipse Tower** | 在敵方範圍內擴張 | 18 | 少 | 中 | 進攻必備 |
| **Arrow Tower (箭塔)** | 攻擊範圍內敵人 | 18 | 12 | 高 | 不會自衛但血厚 |
| **Bulwark (壁壘)** | 阻擋敵人 | 8 | 多 | 中 | 戰術用 |
| **Scaffold (台架)** | 跳板 | 8 | 多 | 低 | 地形利用 |
| **War Workshop** | 召喚 Giant | 20 | 1 | 中 | 摧毀後 Giant 全死 |
| **Gates of Hades** | 召喚 Wraith | 22 | 1 | 低 | 通常蓋主堡旁 |

### 7.3 建築建造流程
1. 玩家持有足夠水晶 + 站在友方影響範圍內
2. 按 B 開建造選單，選建築類型
3. 螢幕上出現預覽幽靈 (semi-transparent ghost mesh)
4. 滑鼠移動選位置，伺服器即時檢查合法性 (地形、與其他建築距離)
5. 確定後送 build request → 伺服器扣水晶、開始建造動畫 (3-5s)
6. 完成後實體建築出現

```ts
// 客戶端預覽
function showBuildGhost(type: BuildingType, mouseWorld: Vector3) {
  ghostMesh.position.copy(snapToGrid(mouseWorld));
  ghostMesh.material.color = isValidPlacement(...) ? GREEN : RED;
}
```

### 7.4 召喚 (Summons)

| 召喚物 | 來源建築 | 成本 | 定位 |
|---|---|---|---|
| **Knight (騎士)** | Keep | 30 水晶 | 反召喚、偵察 (快速) |
| **Giant (巨人)** | War Workshop | 30 水晶 | 攻城 (慢、血厚、遠攻) |
| **Wraith (亡靈)** | Gates of Hades | 50 水晶 | 反步兵 (清線) |
| **Chimera (奇美拉)** | Keep (Keep HP < 2/3 解鎖) | 40 水晶 + Chimera Blood 道具 | 自爆型，Final Burst 對 Keep 造成 ~1/3 HP 傷害 |
| **Chariot (戰車)** | Keep | 待補 | 運輸步兵 |
| **Dragon (龍)** | Dragon Soul 道具 (稀有掉落) | 道具 | 終極大招 |

**召喚機制要點**：
- 玩家按 Z 鍵對著建築/Keep 召喚
- 召喚後玩家本體**消失**，控制召喚物 (玩家 ID 不變，死亡計入玩家統計)
- 召喚物死亡 = 玩家死亡，回 Keep 重生
- 召喚物有自己的 HP、攻擊、技能，要獨立寫一套 controller
- 客戶端視角會切到第三人稱跟隨召喚物 (相機距離拉遠，因為召喚物更大)

```ts
// 伺服器端
function summonUnit(player: Player, type: SummonType) {
  if (!canSummon(player, type)) return;
  player.crystals -= COST[type];
  const summon = new Summon(type, player.position);
  player.controlledEntity = summon;  // 切換控制
  player.body.enabled = false;        // 隱藏本體
  room.broadcast('summon', { playerId, summonType: type });
}
```

---

## 8. 影響範圍與勝負判定

這是 FEZ 最特別的系統，必須正確實作才有原味。

### 8.1 Sphere of Influence (SoI)
- 每個 Obelisk / Eclipse / Keep / War Workshop / Gates of Hades 都有一個 **半徑** 的影響範圍 (圓形)
- 兩邊陣營的範圍會在地圖上塗成不同顏色 (建議用一張 RenderTarget 動態繪製)
- 玩家**只能在己方範圍內建造**
- Eclipse 特例：可以在敵方範圍內蓋 (用來突進)

### 8.2 視覺呈現 — Influence Map Texture
```ts
// 用一張 1024x1024 的 Texture 表示整張地圖的影響
// 每個 pixel 對應戰場 1m x 1m (地圖約 1km x 1km)
// R channel: 我方影響強度
// G channel: 敵方影響強度
// 用 fragment shader 在地面 mesh 上 blend
```
伺服器計算結構陣列 → 客戶端每秒重繪一次 texture (不需要每幀)。

### 8.3 Keep HP & 勝負
- 每邊 Keep 有大量 HP (原版 ~1200 萬)
- 扣 HP 來源：
  - 友方角色死亡：扣 HP (level scaled)
  - 友方召喚死亡：扣更多 HP
  - 影響範圍縮小：每秒扣固定值
  - 直接攻擊 Keep：當然會扣
  - Chimera Final Burst：~1/3 Keep HP
- Keep HP 歸零 → 該國敗北、戰場結束、結算經驗

### 8.4 結算
```ts
interface BattleResult {
  winner: NationId;
  duration: number;  // ms
  playerStats: Array<{
    playerId: string;
    kills: number;
    deaths: number;
    crystalsMinedTotal: number;
    buildingsBuilt: number;
    damageToKeep: number;
    xp: number;
    rings: number;  // 結算貨幣
  }>;
}
```

---

## 9. 網路同步 (50v50)

### 9.1 為什麼 50v50 很難
100 個玩家、~30 個建築、~20 個召喚、上百個投射物 — 全部要在 20Hz 內同步。

頻寬估算 (每個玩家)：
- 100 玩家 × (position 12B + rotation 4B + state 2B) = 1.8 KB
- 50 建築 × 8B = 0.4 KB
- 召喚 + 子彈 + UI 狀態 ≈ 1 KB
- 合計 ~3.2 KB/tick × 20 tick/s = **64 KB/s ≈ 512 kbps**

每個玩家 0.5 Mbps 的下行頻寬 — 對寬頻可接受，行動網路會卡。

### 9.2 優化策略
1. **AoI (Area of Interest)**：玩家只接收自己 60m 內的詳細狀態，遠處給概略狀態 (位置即可，無動畫)
2. **Delta 編碼**：Colyseus 自動做，自製要實作
3. **Position 量化**：地圖 1km，用 16-bit 整數 (16cm 精度) 而不是 float
4. **Rotation 量化**：only yaw needed for upright capsule → 16-bit
5. **動作預測**：客戶端立即播動畫，伺服器確認後同步

### 9.3 Client-Side Prediction & Reconciliation

```ts
// 客戶端
function tick(input: Input) {
  const inputId = nextInputId++;
  pendingInputs.push({ id: inputId, input });
  applyInputLocally(input);              // 立即移動
  send({ type: 'input', id: inputId, input });
}

function onServerState(state: ServerState) {
  // 找到 server 已確認的最後一個 inputId
  const ackId = state.lastProcessedInput;
  pendingInputs = pendingInputs.filter(p => p.id > ackId);
  
  // 從 server 狀態出發，重放未確認的 input
  setLocalState(state.myPlayer);
  for (const p of pendingInputs) applyInputLocally(p.input);
}
```

### 9.4 Entity Interpolation (其他玩家)
不要直接 setPosition (會抖)，要做插值：
```ts
// 維持 100ms buffer，永遠在 100ms 過去的時間點上 render
const renderTime = serverTime - 100;
const [a, b] = findTwoFrames(other.positionHistory, renderTime);
other.mesh.position.lerpVectors(a.pos, b.pos, t);
```

### 9.5 投射物 (箭/火球)
- 由伺服器發射，但客戶端在送出 input 的當下就 spawn 一個視覺投射物 (預測)
- 伺服器回報命中或未命中
- 不要每個 tick 同步投射物座標 (太貴)，只同步「發射事件」和「命中事件」

---

## 10. 地圖與場景

### 10.1 戰場 (Battleground)
- 大小：1km × 1km
- 結構：兩端各一個 Keep，中央分散的水晶礦
- 高低差：必須有 (FEZ 戰術很大成份在地形)
- 推薦做 4-6 張不同戰場，從第一張 MVP 開始

### 10.2 地形生成
- 用 Blender 雕地形 → 匯出 GLB
- 或用 heightmap PNG → 在 three.js 生 PlaneGeometry，displaceVertices
- Collision：地形用 trimesh collider (Rapier 支援)，但效能差，建議導熱點區域用簡化的 convex hull

### 10.3 場景大小估算
- 角色高度 ~1.8m，地圖 1000m
- Far plane 設 500m，遠處用 fog 蓋掉
- 主堡很顯眼 (高 30m+)，要遠遠就看得到

### 10.4 載入
- 第一次進戰場全部一次載入 (GLB 用 DRACO 壓縮後約 50-100MB)
- 載入頁面顯示進度，順便讓伺服器準備房間
- 建築物 GLB 全部預載 (戰鬥中現生會卡頓)

---

## 11. UI / HUD

### 11.1 框架選擇
- HUD 用 **React (DOM)** 而不是 three.js sprite
- 唯一例外：3D 場景中的 HP bar、玩家名字 → 用 CSS2DRenderer / CSS3DRenderer 做 billboard

### 11.2 HUD 元件清單
- 左下：自己 HP / PW bar、技能欄 (1-8 鍵)、buff 列
- 左上：水晶數量、隊伍人數、目前 Keep HP 比例
- 右上：迷你地圖 (MiniMap)
- 右下：聊天框、快速指令
- 中央：準心、瞄準目標的 HP bar
- 上方：兩邊 Keep HP 對比 bar (重要)

### 11.3 迷你地圖
- 用 OffscreenCanvas 繪製
- 顯示：地形輪廓、敵我建築 (不同顏色)、隊友位置、水晶礦
- 注意：**敵人位置只在己方影響範圍內或被斥候標記時可見**
- 點擊小地圖可以 ping (右鍵)

### 11.4 字體與美術風格
- 原版風格：偏動畫風 + 中世紀奇幻
- 字體建議：Cinzel / Trajan Pro 系列做標題
- HUD 用 SVG 框 + 黃金邊飾

---

## 12. 音效系統

### 12.1 音效引擎
- **Howler.js** 或 three.js 內建 PositionalAudio
- 50v50 同時播音會爆 — 必須做 **混音優先級** (priority queue，遠處的聲音音量壓低、超過 32 個 voice 就 cull 最弱的)

### 12.2 音效分類
- BGM：戰場、勝利、敗北 (原版作曲 崎元仁 — 重製版要找自己的)
- SFX：腳步 (材質感應)、技能、攻擊命中、UI 點擊、環境
- VO：陣營國王指示 (戰況提示)

### 12.3 3D 音效
- 攻擊聲、召喚物吼聲 → PositionalAudio
- UI 音效、自己技能 → 普通 Audio
- 環境音 → AudioListener 上的 ambient

---

## 13. 效能最佳化

### 13.1 GPU 端
- **Frustum culling**：three.js 自帶，但 InstancedMesh 不會自動 cull instance，要自己做或用 BVH
- **Occlusion culling**：戰場視野遠時建築互相遮擋很多，建議用 [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) 做 GPU occlusion
- **Draw call < 200** (目標)：透過 InstancedMesh、atlas 合併材質
- **GPU instanced skinning**：50 個 Warrior 模型可以共用骨骼動畫，研究 [three.js InstancedSkinnedMesh](https://discourse.threejs.org/t/instancedskinnedmesh/3651)

### 13.2 CPU 端
- **避免每幀 new Vector3()**：預配置 temp vector，重複使用
- **Object pool**：投射物、傷害數字、粒子全部 pooling
- **Web Worker**：把 pathfinding (如果有 AI 召喚) 丟到 worker

### 13.3 記憶體
- 模型 GLB 用 KTX2 壓縮貼圖 (基樹紋理，GPU 直接讀)
- DRACO 壓縮 mesh
- 共用 BufferGeometry 與 Material — 不同 mesh 共享同一個 material 實例

### 13.4 目標
| 環境 | 目標 FPS |
|---|---|
| 1v1 練功 | 144+ |
| 5v5 | 100+ |
| 20v20 | 60+ |
| 50v50 滿戰場 | 45+ (能玩就好) |

---

## 14. 資料模型 (Data Schema)

### 14.1 共用型別 (`shared/types.ts`)

```ts
type Nation = 'netzawar' | 'cesedria' | 'gerburand' | 'ielsord' | 'holdenant';
type ClassType = 'warrior' | 'sorcerer' | 'scout' | 'fencer' | 'cestus';
type BuildingType = 'obelisk' | 'eclipse' | 'arrowTower' | 'bulwark' 
                  | 'scaffold' | 'warWorkshop' | 'gatesOfHades';
type SummonType = 'knight' | 'giant' | 'wraith' | 'chimera' | 'chariot' | 'dragon';

interface Vec3 { x: number; y: number; z: number; }
```

### 14.2 玩家狀態 (server-side)
```ts
class PlayerState {
  id: string;
  name: string;
  nation: Nation;
  class: ClassType;
  level: number;
  
  // 即時
  position: Vec3;
  rotation: number;     // yaw only
  velocity: Vec3;
  hp: number;
  maxHp: number;
  pw: number;
  maxPw: number;
  crystals: number;
  
  // 控制
  controlledEntityId: string | null;  // 若有召喚則為召喚物 ID
  
  // 狀態
  statuses: StatusEffect[];
  lastInputId: number;
  isAlive: boolean;
  isMining: boolean;
}
```

### 14.3 建築狀態
```ts
class BuildingState {
  id: string;
  type: BuildingType;
  nation: Nation;
  position: Vec3;
  hp: number;
  maxHp: number;
  builtAt: number;          // 完工時間
  isUnderConstruction: boolean;
  influenceRadius: number;  // 0 if not influence type
}
```

### 14.4 戰場狀態
```ts
class BattleState {
  battleId: string;
  startedAt: number;
  
  nations: Record<Nation, {
    keepHp: number;
    maxKeepHp: number;
    playerCount: number;
    influenceArea: number;  // 範圍總面積 (m²)
  }>;
  
  players: Map<string, PlayerState>;
  buildings: Map<string, BuildingState>;
  summons: Map<string, SummonState>;
  crystalMines: Map<string, { position: Vec3; hp: number; }>;
  projectiles: Map<string, ProjectileState>;
}
```

### 14.5 玩家存檔 (DB)
```ts
interface CharacterSave {
  characterId: string;
  accountId: string;
  name: string;
  nation: Nation;     // 不可變更
  class: ClassType;
  level: number;
  xp: number;
  skillPoints: Record<string, number>;  // skillId -> points
  equipment: { weaponId: string; armorId: string; /* ... */ };
  rings: number;      // 結算貨幣
  inventory: ItemStack[];
}
```

---

## 15. 專案結構

```
fez-remake/
├── packages/
│   ├── shared/                    # 客戶端與伺服器共用
│   │   ├── types/
│   │   ├── constants/             # COST, HP, damage tables
│   │   ├── formulas/              # damage(), influence(), keepHpDrain()
│   │   └── schema/                # Colyseus schemas
│   │
│   ├── server/
│   │   ├── src/
│   │   │   ├── rooms/
│   │   │   │   ├── BattleRoom.ts  # 主戰場 room
│   │   │   │   └── LobbyRoom.ts
│   │   │   ├── systems/           # ECS-ish
│   │   │   │   ├── PhysicsSystem.ts
│   │   │   │   ├── CombatSystem.ts
│   │   │   │   ├── BuildingSystem.ts
│   │   │   │   ├── MiningSystem.ts
│   │   │   │   ├── SummonSystem.ts
│   │   │   │   └── InfluenceSystem.ts
│   │   │   ├── db/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── client/
│       ├── src/
│       │   ├── three/             # Three.js 場景
│       │   │   ├── Scene.ts
│       │   │   ├── Camera.ts
│       │   │   ├── Terrain.ts
│       │   │   ├── entities/
│       │   │   │   ├── PlayerEntity.ts
│       │   │   │   ├── BuildingEntity.ts
│       │   │   │   └── ProjectileEntity.ts
│       │   │   ├── effects/
│       │   │   └── postprocessing/
│       │   ├── input/
│       │   │   ├── InputManager.ts
│       │   │   └── BindMap.ts
│       │   ├── net/
│       │   │   ├── ColyseusClient.ts
│       │   │   ├── Prediction.ts
│       │   │   └── Interpolation.ts
│       │   ├── ui/                # React HUD
│       │   │   ├── HUD.tsx
│       │   │   ├── MiniMap.tsx
│       │   │   ├── SkillBar.tsx
│       │   │   ├── KeepBar.tsx
│       │   │   └── BuildMenu.tsx
│       │   ├── audio/
│       │   ├── store/             # Zustand
│       │   └── main.ts
│       ├── public/
│       │   └── assets/            # GLB, KTX2, audio
│       └── vite.config.ts
│
├── tools/
│   ├── asset-pipeline/            # GLB 壓縮、KTX2 轉檔腳本
│   └── balance/                   # 數值表 CSV ↔ TS 轉換
│
└── package.json (pnpm workspace)
```

---

## 16. 開發路線圖

### Milestone 0 — 技術驗證 (2-3 週)
- [ ] Vite + three.js + Rapier 跑起來
- [ ] 一個 capsule 角色，WASD + 滑鼠視角
- [ ] 載入一張地形 GLB，可走可跳，地形碰撞
- [ ] 一個 Mixamo 角色 + idle/run 動畫切換

### Milestone 1 — 戰鬥原型 (3-4 週)
- [ ] Warrior 普攻 + 一個技能 (Shield Bash)
- [ ] 假人靶 (站立不動，可受擊、會死)
- [ ] HP bar、傷害數字、命中音效
- [ ] 死亡與重生

### Milestone 2 — RTS 元素 (4 週)
- [ ] 一個水晶礦，蹲下採礦
- [ ] 蓋一個 Obelisk (有預覽幽靈、有建造動畫)
- [ ] 影響範圍視覺化 (texture-based)
- [ ] 蓋一個 Arrow Tower，會自動射箭

### Milestone 3 — 多人連線 (5-6 週)
- [ ] Colyseus 伺服器 + Room
- [ ] 玩家狀態同步、Client-Side Prediction、Interpolation
- [ ] 2v2 對戰可玩 (基本戰鬥 + 採礦 + Obelisk)
- [ ] 結算畫面

### Milestone 4 — 召喚與全職業 (6-8 週)
- [ ] Scout、Sorcerer 兩職業
- [ ] Knight、Giant 兩召喚 (含切換控制邏輯)
- [ ] War Workshop 建築
- [ ] Keep HP 系統 + 勝負判定
- [ ] Fencer、Cestus、Wraith、Chimera

### Milestone 5 — 規模化 (4-6 週)
- [ ] 全部最佳化 (LOD、Instancing、AoI)
- [ ] 50v50 壓力測試 (用 bot)
- [ ] 多戰場
- [ ] 部署到生產環境

### Milestone 6 — 內容與打磨
- [ ] 角色客製化
- [ ] 帳號系統與角色存檔
- [ ] 結算獎勵、進階成長
- [ ] 音樂、音效完整

預估總時程：**單人 12-18 個月 (full-time)**，二三人團隊 8-12 個月。

---

## 17. 已知技術風險

### 17.1 高風險
1. **50v50 同步效能**
   - 應對：早期就用 bot 模擬 100 個玩家測試，不要等做完才測

2. **InstancedSkinnedMesh**
   - three.js 對 instanced skinned mesh 支援不夠原生，自寫 shader 工作量大
   - 應對：先用 LOD + 一般 SkinnedMesh，遠處改 Sprite billboard

3. **物理 vs 動畫同步**
   - Rapier kinematic body 跟動畫匹配容易出問題 (穿牆、漂浮)
   - 應對：物理只做 capsule 主體碰撞，動畫只是視覺

### 17.2 中風險
1. **聲音系統 voice 數量**
   - 50v50 同時技能特效音會超過瀏覽器 AudioContext 限制 (~32 voices)
   - 應對：priority manager 主動 cull

2. **影響範圍視覺化頻寬**
   - 每秒重繪一張 1024² texture 不算貴，但同步資料量大
   - 應對：客戶端從建築位置自己算，不從伺服器送整張圖

### 17.3 法律風險
- 美術、音樂、品牌不能直接拿原版
- 召喚物、職業名稱可以致敬但建議改名
- 不要對外宣稱「Fantasy Earth Zero remake」— 用原創品牌 (例：Fantasy Realms Zero、自取一個)
- 確保是 fan project / 非商業

---

## 附錄 A — 參考資源

- [three.js 官方文件](https://threejs.org/docs/)
- [Rapier.js 官方文件](https://rapier.rs/docs/user_guides/javascript/getting_started_js)
- [Colyseus 官方文件](https://docs.colyseus.io/)
- [Glenn Fiedler — Networked Physics](https://gafferongames.com/categories/networked-physics/)
- [Gabriel Gambetta — Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-server-game-architecture.html)
- [FEZ Fandom Wiki](https://fanearthzero.fandom.com/) — 數值與機制參考
- [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing)
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) — 高效碰撞與 culling

## 附錄 B — 名詞對照

| 中文 | 英文 | 縮寫 |
|---|---|---|
| 國戰 | Kingdom vs Kingdom | KvK |
| 主堡 | Keep | — |
| 影響範圍 | Sphere of Influence | SoI |
| 戰意值 | Morale / Keep HP | — |
| 水晶 | Crystal | — |
| 召喚物 | Summon | — |
| 客戶端預測 | Client-Side Prediction | CSP |
| 區域同步 | Area of Interest | AoI |
