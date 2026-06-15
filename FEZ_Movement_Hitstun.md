# FEZ 動作與硬直系統 (Movement & Hitstun) 詳細規格

> **為什麼這份文檔重要**：FEZ 的「手感」跟現代動作 MMO 完全不同 — 沒有 animation cancel、攻擊一發完全 commit、跳躍和側閃有 i-frames、戰士有超甲。這些機制**疊起來**才是 FEZ 獨特的戰鬥節奏。
>
> 如果照一般 MMO（魔獸、新世界、永劫無間）的手感寫，會做出**完全不像 FEZ**的東西。這份文檔是要把原版的「重」、「克制」、「不能瞎按」三件事還原出來。

---

## 目錄

1. [為何 FEZ 跟其他遊戲不同](#1-為何-fez-跟其他遊戲不同)
2. [完整操作對照](#2-完整操作對照)
3. [移動系統](#3-移動系統)
4. [i-Frame 系統（跳躍與側閃）](#4-i-frame-系統)
5. [攻擊狀態機](#5-攻擊狀態機)
6. [硬直 (Hitstun) 完整分類](#6-硬直-hitstun-完整分類)
7. [Embolden（超甲）機制](#7-embolden超甲機制)
8. [施法與蓄力](#8-施法與蓄力)
9. [PW 池系統](#9-pw-池系統)
10. [角色狀態機（FSM）](#10-角色狀態機)
11. [TypeScript 實作](#11-typescript-實作)
12. [還原度檢查清單](#12-還原度檢查清單)

---

## 1. 為何 FEZ 跟其他遊戲不同

### 1.1 對比表

| 機制 | 一般 MMO (WoW / FFXIV) | 動作遊戲 (永劫 / 黑神話) | **FEZ** |
|---|---|---|---|
| 攻擊命中判定 | 自動鎖定 | 鎖定 + 範圍 | **完全手動瞄準** |
| Animation Cancel | 大部分技能可被打斷自己施放 | 部分可 cancel | **完全不可 cancel** |
| 技能限制 | Cooldown 每個技能獨立 | Cooldown + 體力 | **PW 共享池，無 CD** |
| 受擊反應 | 多數無硬直 | 硬直 + 倒地 | **多級硬直，被打=完全不能動** |
| 閃避 | 翻滾 / Dash | 翻滾 / Parry | **跳躍 / 側閃 (Q/E)** |
| 防禦 | 盾 / Parry | 格擋 / Parry | **超甲 (Embolden)** |
| 後搖 | 很短 | 短到中等 | **長到非常長** |

### 1.2 FEZ 的「重感」哲學

每一個操作都是**承諾**：

- 你按 LMB 揮一刀 → 動畫從前搖、命中判定到後搖**全程要打完**，無法中途取消
- 你跳起來閃了一招 → 落地前**不能攻擊、不能接技能**
- 你按了 Shield Bash → 動畫起手非常明顯，敵人有時間反應

這設計的意圖：**沒有花俏的連招表，比拼的是讀招、預判、走位**。FEZ 是「動作版的 RTS」，不是「武俠連招遊戲」。

### 1.3 復刻時最容易做錯的地方

| 錯誤做法 | 結果 |
|---|---|
| 攻擊可以中途轉身 | 變成永劫無間，沒有 FEZ 的重感 |
| 受擊只有 0.1s 硬直 | 戰士衝鋒衝不下來、亡靈劍清不到線 |
| 跳躍沒 i-frame | 玩家不會用跳躍躲技能 — 戰術一半消失 |
| 用 cooldown 而不是 PW | 玩家無腦放招、不會精算資源 |
| Embolden 只是個 buff | 戰士不會用它推進前線 |

---

## 2. 完整操作對照

### 2.1 鍵盤

| 按鍵 | 動作 | 備註 |
|---|---|---|
| **W / S** | 前進 / 後退 | 角色面朝**滑鼠方向**，不是 W 鍵方向 |
| **A / D** | 平移 (Strafe) | 不是轉身 |
| **Q / E** | **側閃 (Sidestep)** | i-frame 動作，跟 A/D 不同 |
| **Space** | 跳躍 | i-frame |
| **Shift** | 衝刺 (Sprint) | 持續按住 |
| **C** | 蹲下 (採礦) | 蹲下不能移動，可被攻擊 |
| **F** | 互動 / 上下車 | 開門、上車、撿物 |
| **1-8** | 技能槽 | 對應技能欄 |
| **LMB** | 普通攻擊 | 一律手動瞄準 |
| **RMB** | 相機自由旋轉 (按住) | 配合「羽毛游標」用 |
| **R** | 對隊友交易水晶 | 站旁邊按 |
| **B** | 開建造選單 | 持有水晶 + 在影響範圍內 |
| **Z** | 開召喚 / 解除召喚選單 | |
| **Tab** | 切換游標模式 | crosshair ↔ feather |
| **M** | 大地圖 | |
| **Enter** | 聊天 | |

### 2.2 兩種游標模式（重要）

**Crosshair Cursor（十字準心）— 預設**
- 滑鼠移動 = 相機跟著轉
- 角色面朝相機方向
- 適合：**直線攻擊**（普攻、弓箭、火球）

**Feather Cursor（羽毛游標）— 按住 RMB**
- 滑鼠在螢幕上自由移動，相機固定
- 滑鼠在地面上的投影 = AoE 落點
- 適合：**範圍技**（Ice Javelin、Crumble Storm、Fireball 落點選擇）

實作要點：
```ts
type CursorMode = 'crosshair' | 'feather';

class InputManager {
  cursorMode: CursorMode = 'crosshair';
  
  onTabPress() { this.cursorMode = this.cursorMode === 'crosshair' ? 'feather' : 'crosshair'; }
  onRMBDown() { this.tempCursorMode = 'feather'; }
  onRMBUp() { this.tempCursorMode = null; }
  
  getEffectiveMode() { return this.tempCursorMode ?? this.cursorMode; }
}
```

---

## 3. 移動系統

### 3.1 基本走路 / 跑步

| 屬性 | 數值 | 備註 |
|---|---|---|
| 走路速度 (默認) | **5.0 m/s** | W 鍵持續 |
| 衝刺速度 (Shift) | **7.5 m/s** | +50% |
| 後退速度 (S) | 3.5 m/s | -30% |
| 平移速度 (A/D) | 4.5 m/s | -10% |
| 涉水速度 | × 0.5 | 河流區域 |
| 蹲下時 | 0（不能移動）| 採礦狀態 |

**重要：角色面朝方向 = 滑鼠/相機方向**，不是 W 鍵方向。

```ts
// 移動向量計算
function getMoveVector(input: Input, cameraYaw: number): Vec3 {
  const forward = new Vec3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
  const right = new Vec3(forward.z, 0, -forward.x);
  
  let vec = new Vec3();
  if (input.W) vec.add(forward);
  if (input.S) vec.sub(forward).multiplyScalar(0.7);  // 後退較慢
  if (input.A) vec.sub(right).multiplyScalar(0.9);
  if (input.D) vec.add(right).multiplyScalar(0.9);
  
  vec.normalize();
  
  const speed = input.Shift ? 7.5 : 5.0;
  return vec.multiplyScalar(speed);
}
```

### 3.2 跳躍

| 屬性 | 數值 | 備註 |
|---|---|---|
| 跳躍高度 | ~2.0m | 大約一個半角色身高 |
| 跳躍時間（上升）| 0.4s | |
| 跳躍時間（總）| ~0.9s | 含下降 |
| 落地後 recovery | 0.15s | 不能立即跳 |
| 雙跳 | **無** | 一次只能跳一次，落地才能再跳 |
| 跳躍中可否攻擊 | **不可** | 全程鎖技 |
| 跳躍中可否移動 | 可，但慣性主導 | 起跳後改變方向有限 |
| **跳躍中的 i-frame** | **整個騰空期間** | 物理攻擊穿透 |

### 3.3 衝刺限制

原版的 Shift sprint 沒有體力上限（不像 BoTW），可以一直按。但：
- 衝刺中**不能釋放技能**（只有普通走路才能）
- 衝刺中 LMB 普攻會自動退出衝刺後再砍

實作建議：
```ts
function canCastSkill(player: Player): boolean {
  if (player.state !== 'idle' && player.state !== 'walking') return false;
  // 衝刺中不能放技能
  return true;
}
```

### 3.4 蹲下（採礦）

- 按 C 進入蹲伏狀態
- 完全靜止，不能轉身、不能攻擊
- 距離水晶礦 < 3m 自動開始採集
- 被攻擊時自動退出蹲伏（被打斷）
- 動畫：明顯彎腰姿勢（敵人遠看就知道你在採礦 = 容易成為目標）

---

## 4. i-Frame 系統

i-frame (Invincibility frame) 是 FEZ 戰術的核心之一。

### 4.1 i-frame 的兩個來源

**1. 跳躍 (Space)**
- 整個騰空期間（~0.9s）
- **只擋物理攻擊**（普攻、弓箭、長槍）
- **不擋魔法/AoE**（火球、Ice Javelin、雷擊）— 跳起來打雷反而更慘
- 落地恢復受擊判定

**2. 側閃 (Q/E)**
- 短距離快速滑步 ~3m
- 動作時長 0.4s，**前 0.3s 有 i-frame**
- 後 0.1s 是 recovery（無法行動但可被打）
- 同樣**只擋物理**
- 有冷卻 1.5s（防無腦閃）

### 4.2 為何「只擋物理」這個細節很重要

如果跳躍/側閃同時擋魔法，玩家會無腦閃；如果完全不擋，玩家不會用。FEZ 的設計：

- **戰士衝鋒**（物理）→ 對方跳閃可躲
- **斥候射箭**（物理）→ 對方跳閃可躲
- **法師火球**（魔法）→ **跳閃沒用，必須走位躲**

這個機制讓**魔法系職業有存在感**（魔法不可閃 = 必須真的走位）。

### 4.3 i-frame 實作

```ts
interface IFrameState {
  active: boolean;
  blocksPhysical: boolean;
  blocksMagical: boolean;
  startedAt: number;
  duration: number;
}

function canDamage(target: Player, damageType: 'physical' | 'magical'): boolean {
  const iframe = target.iFrame;
  if (!iframe.active) return true;
  
  const elapsed = now() - iframe.startedAt;
  if (elapsed > iframe.duration) return true;
  
  if (damageType === 'physical' && iframe.blocksPhysical) return false;
  if (damageType === 'magical' && iframe.blocksMagical) return false;
  return true;
}

// 跳躍時
function startJump(player: Player) {
  player.iFrame = {
    active: true,
    blocksPhysical: true,
    blocksMagical: false,  // 跳躍不擋魔法
    startedAt: now(),
    duration: 900,  // ms
  };
}

// 側閃時
function startSidestep(player: Player, direction: 'left' | 'right') {
  player.iFrame = {
    active: true,
    blocksPhysical: true,
    blocksMagical: false,
    startedAt: now(),
    duration: 300,  // 只有前 0.3s
  };
}
```

### 4.4 跳躍 / 側閃 vs 技能對照表

| 技能類型 | 跳躍可閃？ | 側閃可閃？ |
|---|---|---|
| 普通攻擊（劍、槍、拳）| ✓ | ✓ |
| 弓箭 / 槍械（Scout）| ✓ | ✓ |
| Shield Bash (戰士)  | ✓ | ✓ |
| 火球 (Fireball)     | ✗ | ✗ |
| 雷擊 (Lightning)    | ✗ | ✗ |
| 冰槍 (Ice Javelin)  | ✗ | ✗ |
| Embolden 戰士的攻擊 | ✓ | ✓ |
| Giant 砲擊（範圍）  | ✗ | ✗ |
| Wraith Guillotine Sword | ✓ | ✓ |

---

## 5. 攻擊狀態機

FEZ 攻擊的核心是「**前搖 → 命中判定 → 後搖**」三段制，**全程鎖定**不可取消。

### 5.1 攻擊三段

```
┌─────────────┬───────────────┬───────────────┐
│   Windup    │   Active      │   Recovery    │
│   (前搖)    │   (命中判定)  │   (後搖)      │
└─────────────┴───────────────┴───────────────┘
   無敵 ✗      命中判定生效      無敵 ✗
   可被打 ✓    可被打 ✓         可被打 ✓
   可移動 ✗    可移動 ✗         可移動 ✗
   可換技 ✗    可換技 ✗         可換技 ✗
```

整個過程**完全鎖死**，不能移動、不能轉身、不能放下一招。

### 5.2 典型技能時間表

| 技能 | Windup | Active | Recovery | 總時長 |
|---|---|---|---|---|
| Warrior LMB（短劍） | 150ms | 80ms | 250ms | 480ms |
| Warrior LMB（長槍） | 200ms | 100ms | 300ms | 600ms |
| Warrior LMB（雙手劍） | 350ms | 150ms | 500ms | 1000ms |
| Shield Bash | 250ms | 100ms | 400ms | 750ms |
| Scout 弓 LMB | 200ms | 50ms（射出箭）| 250ms | 500ms |
| Sorcerer Fireball | 1000ms（蓄力）| 50ms | 600ms | 1650ms |
| Sorcerer Ice Javelin | 1500ms | 100ms | 700ms | 2300ms |
| Fencer 突刺 | 100ms | 80ms | 200ms | 380ms |
| Cestus 普攻 | 200ms | 100ms | 300ms | 600ms |
| Cestus 蓄力拳 (Charge) | **可蓄力 0-3s** | 150ms | 600ms | 變動 |

關鍵觀察：
- **越重的武器，後搖越長**（雙手劍 500ms 後搖很可怕）
- **法師施法非常慢**（1-2s 蓄力），所以需要前排保護
- **Fencer 是最快的**（380ms 一招），但傷害低、要靠數量

### 5.3 攻擊 → 攻擊的「連段」

FEZ 沒有真正的連段系統 — 你只能在「上一招後搖結束」後**重新開始**下一招的前搖。

```
LMB → (windup 200) → (active 80) → (recovery 250) → ← 530ms 後才能下一招
```

跟一般動作遊戲不同，FEZ **不能後搖中按下一招緩衝**。要按準時間。

### 5.4 攻擊期間是否能轉身？

**不能。** 攻擊開始的瞬間，角色 yaw 鎖定，整個攻擊期間都對著當初的方向。

這意味著：
- 玩家必須**先瞄準，再攻擊**
- 對手快速繞背 → 你的攻擊就空了
- 這就是為什麼 FEZ 戰鬥很注重**站位、預判、繞背**

```ts
function startAttack(player: Player, skill: Skill) {
  if (!canAttack(player)) return;
  
  player.state = 'attacking';
  player.attackingSkill = skill;
  player.attackPhase = 'windup';
  player.attackPhaseStartedAt = now();
  player.lockedFacing = player.cameraYaw;  // 鎖定面向
  player.movementLocked = true;            // 不能動
}
```

---

## 6. 硬直 (Hitstun) 完整分類

這是 FEZ 最容易做錯的部分。**硬直 = 被打後的鎖定狀態**，不只一種。

### 6.1 硬直類型對照

| 類型 | 中文 | 時長 | 不能移動 | 不能攻擊 | 不能轉身 | 備註 |
|---|---|---|---|---|---|---|
| **Flinch (Short)** | 短硬直 | 200ms | ✓ | ✓ | ✗ | 普攻命中 |
| **Flinch** | 硬直 | 400ms | ✓ | ✓ | ✓ | 技能命中、被斷招 |
| **Knockback** | 擊退 | 600ms | ✓ | ✓ | ✓ | 加位移，被往後推 |
| **Knockdown** | 倒地 | 1200ms | ✓ | ✓ | ✓ | 倒地，**可被連擊** |
| **Stun** | 暈眩 | 1500-3000ms | ✓ | ✓ | ✓ | Shield Bash 等 |
| **Bind / Root** | 定身 | 2000-4000ms | ✓ | ✗ | ✗ | **可施法**，Ice Javelin |
| **Slow** | 減速 | 2000-5000ms | 部分 | ✗ | ✗ | 移速降低 % |
| **Silence** | 沈默 | 2000-3000ms | ✗ | 部分 | ✗ | 不能用技能，但可普攻 |

### 6.2 哪些技能造成哪種硬直

源自原版 wiki：

**Flinch（短）— 普攻、輕技能**
- 一般 LMB 命中
- Scout 普攻

**Flinch — 技能命中**
- Fireball、Lightning Bolt
- Fencer 突刺

**Knockback — 推開**
- Crumble Storm、Slam Attack、Piercing Shot
- Thunderbolt、Cold Wave、Intense Fire
- Big Step、Impact Claw

**Knockdown — 擊倒**
- Downdrive、Blaze Arrow、Arrow Rain
- 倒地後**可繼續被打**（地板擊殺）

**Stun — 完全暈**
- Shield Bash（戰士招牌）
- Ice Javelin（也含 root 效果）

**Bind / Root — 定身但可施法**
- Ice Javelin、Blizzard Caress、Blizzard Breath

**Slow — 減速**
- Cold Bolt、Cold Wave、Blizzard Caress
- Spider Web、Leg Break、Earth Stamper、Ice Bind

### 6.3 硬直的「重置」規則

被打中時：
- 如果**新硬直 > 當前硬直** → 覆蓋為新硬直
- 如果**新硬直 ≤ 當前硬直** → 不縮短，繼續原來的

這防止「多次小傷害無限續鎖」，同時保留「強招打斷弱招」。

```ts
function applyHitstun(target: Player, type: HitstunType, duration: number) {
  const newEndTime = now() + duration;
  if (newEndTime > target.hitstunEndTime) {
    target.hitstun = type;
    target.hitstunEndTime = newEndTime;
  }
}
```

### 6.4 硬直期間的視覺

- 角色微微往後彎（被擊中的姿勢）
- 被擊中時**全身瞬間泛紅**（emissive 紅 0.15s）
- 如果是 Knockback，**生成位移**（被往攻擊方向推 2-3m）
- 如果是 Knockdown，**完全倒地**動畫（地板擊殺很恥）

### 6.5 倒地（Knockdown）的特殊規則

倒地狀態：
- 持續 ~1.2s
- 角色躺在地上不動
- **可被繼續攻擊** — 地板擊殺非常痛
- 起身後有 0.5s 的「無敵恢復期」防被無限連
- 倒地期間 = 無敵 OFF（一般 MMO 倒地會給無敵，FEZ 沒有）

這就是為何 Downdrive 這個技能很強 — 把對方打倒在地，隊友圍上來砸。

---

## 7. Embolden（超甲）機制

戰士的招牌技能。**這是 FEZ 戰術的核心之一，必須做對。**

### 7.1 Embolden 是什麼

戰士的技能，啟動後：
- 戰士**完全無視硬直** — 被打但動作不會被打斷
- 可以**繼續攻擊、繼續走、繼續接技**
- 但**仍會受到傷害**（不是無敵）
- 持續時間 ~6-10s（依等級）
- 有冷卻 ~15-20s
- **不擋魔法的特殊硬直**（如 Ice Javelin 的 root 仍然有效）

### 7.2 為什麼這個機制這麼關鍵

沒有 Embolden 的戰士：
- 衝向敵陣 → 一被打就硬直 → 接著被連串打 → 死
- 戰士就完全沒用

有 Embolden 的戰士：
- 衝向敵陣 → 被打但繼續走 → 殺進去用 Shield Bash 開團
- 戰士成為「破壞先鋒」

這是 FEZ 中**前排戰士存在的意義**。

### 7.3 與其他機制的互動

| 互動 | 結果 |
|---|---|
| 被普攻命中 | 不會硬直，但會受傷 |
| 被 Shield Bash 命中 | **仍然會 Stun**（Stun 比硬直更嚴重，Embolden 擋不住）|
| 被火球（Burn DoT）| Embolden 擋硬直，但 DoT 仍然會持續傷害 |
| 被 Ice Javelin（Root）| **Root 仍然生效** — Embolden 不擋移動限制類 debuff |
| 被擊飛（Knockback）| 仍然會擊飛（位移是硬規則） |

換句話說：**Embolden 擋的只有硬直/動作中斷，不是「無敵狀態」**。

### 7.4 Embolden 實作

```ts
interface Status {
  embolden?: { endTime: number; level: number; };
  // ...
}

function applyHitstun(target: Player, type: HitstunType, duration: number) {
  // Embolden 完全擋 flinch 級硬直
  if (target.status.embolden && now() < target.status.embolden.endTime) {
    if (type === 'flinch_short' || type === 'flinch') {
      return;  // 不發生硬直
    }
    // Stun / Knockback / Root 仍然有效
  }
  
  applyHitstunActually(target, type, duration);
}
```

### 7.5 視覺呈現

戰士啟動 Embolden 時：
- 全身輕微金色光暈（emissive #ffaa44 intensity 0.3）
- 持續粒子效果（金色火花上升）
- 圖示顯示在角色頭頂 buff bar
- 被打時火花迸射但角色不退（視覺強調）

---

## 8. 施法與蓄力

### 8.1 法師施法流程

```
按下技能鍵 → 蓄力 (1-2s) → 釋放 (50ms) → 後搖 (600ms)
   ↓
施法期間：
- 移動速度 × 0.3（幾乎不動）
- 不能轉身
- 被打到 → **強制中斷**（flinch），技能失敗，PW 已扣
```

### 8.2 中斷規則

施法被打斷 = 技能失敗，PW **不退還**。這就是為何法師需要前排保護。

**例外**：Embolden 戰士施法？戰士沒有蓄力技，所以不適用。

Sorcerer 是唯一受打斷影響嚴重的職業。

### 8.3 Cestus 蓄力拳

Cestus 的某些技能可以**長按累積能量**：
- 按住技能鍵蓄力 0-3 秒
- 蓄力越久，傷害和擊飛越強
- 但越久越容易被打斷
- 最大蓄力時釋放，可造成最大 3 倍傷害 + 強 knockback

實作：
```ts
interface ChargingSkill {
  startedAt: number;
  maxChargeTime: number;  // 例 3000ms
}

function getChargeMultiplier(charging: ChargingSkill): number {
  const elapsed = now() - charging.startedAt;
  const ratio = Math.min(elapsed / charging.maxChargeTime, 1);
  return 1 + ratio * 2;  // 1x ~ 3x
}
```

---

## 9. PW 池系統

### 9.1 為何不用 Cooldown

一般 MMO：每個技能各自 CD → 玩家輪流放招、不需要思考資源管理

FEZ：所有技能共用 **PW 池** → 玩家必須**選擇何時放、放什麼**

### 9.2 PW 規格

| 屬性 | 數值 |
|---|---|
| 最大 PW | 8（基準） |
| PW 回復速率 | 每 3 秒 +1 點 |
| 普攻 PW 消耗 | 0（普攻不耗 PW）|
| 一般技能 PW | 1-3 |
| 強技能 PW | 3-5 |
| 終極技能 PW | 5-8（如 Ice Javelin、Crumble Storm）|

### 9.3 PW 的戰術意義

舉例：戰士想要連續 Shield Bash + Sword Slash + 衝刺
- 總成本 ~6 PW
- 一次出招 = 池子幾乎空
- 接著要等 18 秒回滿
- 在這期間敵人放招，戰士只能普攻

這就是為何 FEZ 戰鬥**不是技能轟炸**，而是**精算每次出招**。

### 9.4 PW 回復實作

```ts
const PW_REGEN_INTERVAL = 3000;  // ms

function updatePW(player: Player, dt: number) {
  player.pwAccumulator += dt;
  while (player.pwAccumulator >= PW_REGEN_INTERVAL) {
    if (player.pw < player.maxPw) player.pw += 1;
    player.pwAccumulator -= PW_REGEN_INTERVAL;
  }
}
```

注意：**死亡重生不會立刻回滿 PW**，必須慢慢累積。所以剛重生的戰士去衝陣，普攻為主、技能慎用。

---

## 10. 角色狀態機

把上面所有東西整合成一個有限狀態機 (FSM)：

### 10.1 主要狀態

```
                ┌──────────────────────────────┐
                │                              │
                ▼                              │
┌─────────┐   ┌──────────┐   ┌───────────┐    │
│  Idle   │←─→│ Walking  │   │ Sprinting │    │
└─────────┘   └──────────┘   └───────────┘    │
     │             │              │           │
     │             │              │           │
     ▼             ▼              ▼           │
┌─────────┐   ┌──────────┐   ┌───────────┐    │
│ Jumping │   │ Sidestep │   │ Attacking │    │
│(i-frame)│   │(i-frame) │   │  (locked) │    │
└─────────┘   └──────────┘   └───────────┘    │
     │             │              │           │
     └──────┬──────┴──────┬───────┘           │
            │             │                   │
            ▼             ▼                   │
       ┌─────────┐  ┌──────────┐              │
       │ Casting │  │ Hitstun  │              │
       │(locked) │  │ (locked) │──────────────┘
       └─────────┘  └──────────┘
            │             │
            ▼             ▼
       ┌─────────┐  ┌──────────┐
       │  Dead   │  │  Mining  │
       └─────────┘  │ (蹲下)   │
                    └──────────┘
```

### 10.2 狀態優先級

當收到輸入時，按以下順序檢查能否轉換：

1. **Dead** — 不能轉到任何狀態（等待重生）
2. **Hitstun** — 不能轉到任何主動狀態（等硬直結束）
3. **Attacking / Casting** — 不能取消（commit）
4. **Jumping / Sidestep** — 動作完成前不能新動作
5. **Mining** — 必須先按 C 解除
6. 其他可自由轉換

### 10.3 哪些狀態可以接哪些狀態

| 從 \ 到 | Idle | Walk | Sprint | Jump | Sidestep | Attack | Cast | Mining | Hitstun |
|---|---|---|---|---|---|---|---|---|---|
| Idle | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | (被打) |
| Walking | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | (被打) |
| Sprinting | ✓ | ✓ | — | ✓ | ✗ | ✗ | ✗ | ✗ | (被打) |
| Jumping | ✓ (落地) | ✓ (落地) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Sidestep | ✓ (完成) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | (被打) |
| Attacking | ✓ (完成) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | (被打但不取消) |
| Casting | ✓ (完成) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | (被打→中斷) |
| Mining | ✓ (按C) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — | (被打→中斷) |
| Hitstun | ✓ (結束) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |

⚠ 注意：**Attacking 中被打不會被取消攻擊**（攻擊照常進行，但同時受傷）— 這是 FEZ 的「commit」哲學

⚠ 但 **Casting 中被打會強制中斷**（法師施法是脆弱的）

⚠ Embolden buff 啟動時，**所有 (被打) 不會觸發 Hitstun**

---

## 11. TypeScript 實作

完整的角色狀態機 + 戰鬥邏輯範例：

### 11.1 型別

```ts
type PlayerState = 
  | 'idle'
  | 'walking'
  | 'sprinting'
  | 'jumping'
  | 'sidestepping'
  | 'attacking'
  | 'casting'
  | 'mining'
  | 'hitstun'
  | 'dead';

type HitstunType = 
  | 'flinch_short'
  | 'flinch'
  | 'knockback'
  | 'knockdown'
  | 'stun'
  | 'bind';

interface AttackPhase {
  skill: Skill;
  phase: 'windup' | 'active' | 'recovery';
  phaseStartedAt: number;
  lockedYaw: number;
}

interface HitstunState {
  type: HitstunType;
  endTime: number;
  knockbackVelocity?: Vec3;
}

interface Status {
  embolden?: { endTime: number };
  burn?: { endTime: number; dps: number };
  slow?: { endTime: number; multiplier: number };
  root?: { endTime: number };
}

interface IFrame {
  endTime: number;
  blocksPhysical: boolean;
  blocksMagical: boolean;
}

interface Player {
  state: PlayerState;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  
  hp: number; maxHp: number;
  pw: number; maxPw: number;
  pwAccumulator: number;
  
  attack?: AttackPhase;
  hitstun?: HitstunState;
  iframe?: IFrame;
  status: Status;
}
```

### 11.2 主 tick 更新

```ts
function tickPlayer(player: Player, input: Input, dt: number) {
  // 0. 死亡時不更新
  if (player.state === 'dead') return;
  
  // 1. 更新狀態效果（DoT、buff 過期）
  updateStatusEffects(player, dt);
  
  // 2. 更新 PW 回復
  updatePW(player, dt);
  
  // 3. 檢查硬直是否結束
  if (player.hitstun && now() >= player.hitstun.endTime) {
    player.hitstun = undefined;
    player.state = 'idle';
  }
  
  // 4. 在硬直中不接受輸入
  if (player.hitstun) {
    applyKnockbackVelocity(player, dt);
    return;
  }
  
  // 5. 攻擊中：推進攻擊狀態
  if (player.state === 'attacking') {
    advanceAttackPhase(player);
    return;  // 攻擊中不接受其他輸入
  }
  
  // 6. 施法中：可被打斷
  if (player.state === 'casting') {
    advanceCasting(player);
    return;
  }
  
  // 7. 跳躍中：物理推進，落地後解鎖
  if (player.state === 'jumping') {
    if (isGrounded(player)) {
      player.state = 'idle';
    }
    applyPhysics(player, dt);
    return;
  }
  
  // 8. 側閃中：時間驅動
  if (player.state === 'sidestepping') {
    advanceSidestep(player, dt);
    return;
  }
  
  // 9. 蹲下 / 採礦
  if (player.state === 'mining') {
    if (!input.C) player.state = 'idle';
    return;
  }
  
  // 10. 正常輸入處理
  handleNormalInput(player, input, dt);
}
```

### 11.3 輸入處理

```ts
function handleNormalInput(player: Player, input: Input, dt: number) {
  // 攻擊
  if (input.LMB && canAttack(player)) {
    startAttack(player, getPrimarySkill(player));
    return;
  }
  
  // 技能 1-8
  for (let i = 1; i <= 8; i++) {
    if (input[`Key${i}`] && canCastSkill(player)) {
      const skill = player.skillBar[i - 1];
      if (skill && player.pw >= skill.pwCost) {
        startSkill(player, skill);
        return;
      }
    }
  }
  
  // 跳躍
  if (input.Space && isGrounded(player)) {
    startJump(player);
    return;
  }
  
  // 側閃 Q/E
  if (input.Q) { startSidestep(player, 'left'); return; }
  if (input.E) { startSidestep(player, 'right'); return; }
  
  // 蹲下
  if (input.C) { player.state = 'mining'; return; }
  
  // 移動
  const moveVec = getMoveVector(input, player.cameraYaw);
  if (moveVec.lengthSq() > 0) {
    player.velocity.copy(moveVec);
    player.state = input.Shift ? 'sprinting' : 'walking';
  } else {
    player.velocity.set(0, 0, 0);
    player.state = 'idle';
  }
  
  // 永遠面朝相機方向
  player.yaw = player.cameraYaw;
}
```

### 11.4 攻擊狀態推進

```ts
function startAttack(player: Player, skill: Skill) {
  player.state = 'attacking';
  player.attack = {
    skill,
    phase: 'windup',
    phaseStartedAt: now(),
    lockedYaw: player.cameraYaw,
  };
  player.yaw = player.cameraYaw;  // 鎖定面向
  player.velocity.set(0, 0, 0);
  player.pw -= skill.pwCost;
}

function advanceAttackPhase(player: Player) {
  if (!player.attack) return;
  const elapsed = now() - player.attack.phaseStartedAt;
  const { skill, phase } = player.attack;
  
  if (phase === 'windup' && elapsed >= skill.windupMs) {
    player.attack.phase = 'active';
    player.attack.phaseStartedAt = now();
    performHitDetection(player, skill);  // 在 active 開始時做命中判定
  } else if (phase === 'active' && elapsed >= skill.activeMs) {
    player.attack.phase = 'recovery';
    player.attack.phaseStartedAt = now();
  } else if (phase === 'recovery' && elapsed >= skill.recoveryMs) {
    player.state = 'idle';
    player.attack = undefined;
  }
}
```

### 11.5 受擊邏輯

```ts
function applyDamage(target: Player, attack: AttackInfo) {
  // 1. 檢查 i-frame
  if (target.iframe && now() < target.iframe.endTime) {
    if (attack.damageType === 'physical' && target.iframe.blocksPhysical) return;
    if (attack.damageType === 'magical' && target.iframe.blocksMagical) return;
  }
  
  // 2. 扣血
  const finalDamage = calculateDamage(attack, target);
  target.hp -= finalDamage;
  
  if (target.hp <= 0) {
    killPlayer(target);
    return;
  }
  
  // 3. 應用硬直（Embolden 可能擋掉）
  if (attack.hitstun) {
    const blocked = target.status.embolden 
      && now() < target.status.embolden.endTime
      && (attack.hitstun === 'flinch' || attack.hitstun === 'flinch_short');
    
    if (!blocked) {
      applyHitstun(target, attack.hitstun, attack.hitstunMs);
    }
  }
  
  // 4. 應用 debuff（Burn / Slow / Root 等不受 Embolden 影響）
  if (attack.statusEffect) {
    applyStatusEffect(target, attack.statusEffect);
  }
  
  // 5. 中斷施法（如果在施法中）
  if (target.state === 'casting') {
    target.state = 'idle';
    target.casting = undefined;
    // PW 不退還
  }
  
  // 6. 中斷蹲下
  if (target.state === 'mining') {
    target.state = 'idle';
  }
  
  // 7. 視覺反饋
  broadcastHit(target, finalDamage);
}
```

---

## 12. 還原度檢查清單

實作完成後，逐項檢查。如果哪項做不到，**會嚴重影響 FEZ 手感**：

### 移動
- [ ] 角色永遠面朝相機方向，不是 W 鍵方向
- [ ] A/D 是 strafe，不是轉身
- [ ] Q/E 是側閃，不是 strafe
- [ ] 衝刺中不能放技能
- [ ] 蹲下完全不能移動

### 攻擊
- [ ] 攻擊期間角色 yaw 鎖定，不能轉身
- [ ] 攻擊期間不能移動
- [ ] 攻擊不能 cancel
- [ ] 後搖結束才能下一招
- [ ] 後搖中按下一招**不會被緩衝**

### 跳躍與側閃
- [ ] 跳躍期間 i-frame 對物理攻擊有效
- [ ] 跳躍期間 i-frame 對魔法**無效**（火球能打中）
- [ ] 跳躍中不能攻擊
- [ ] 沒有雙跳
- [ ] 側閃有冷卻（1.5s）

### 硬直
- [ ] 普攻造成短硬直
- [ ] 技能造成普通硬直
- [ ] Knockback 包含位移（被推開）
- [ ] Knockdown 倒地後可被繼續打
- [ ] 多次硬直只取較長者，不疊加

### Embolden
- [ ] 戰士啟動 Embolden 後，受擊不會 flinch
- [ ] Embolden **不擋** Stun（Shield Bash 仍然會暈）
- [ ] Embolden **不擋** Root（Ice Javelin 仍然被定）
- [ ] Embolden **不擋** DoT（Burn 仍然會持續傷害）
- [ ] Embolden **不擋** Knockback 位移
- [ ] Embolden 視覺特效明顯（金光 / 火花）

### 施法
- [ ] 法師蓄力期間移動速度大幅降低
- [ ] 施法期間被打 → 強制中斷，PW 不退還
- [ ] Cestus 的蓄力拳可長按累積能量
- [ ] 蓄力時間越久，傷害越高

### PW
- [ ] 普攻不消耗 PW
- [ ] PW 每 3 秒回 1 點
- [ ] 死亡重生 PW 不回滿
- [ ] 衝刺中不能放需要 PW 的技能

---

## 附錄 — 兩個容易誤解的點

### A. FEZ 的「重感」是設計，不是 bug

第一次玩 FEZ 的玩家常抱怨「動作好笨重、招式收不回來」。**這是設計目的**：
- 強迫玩家精準瞄準（不能瞎按）
- 鼓勵團隊配合（一個人衝不進去）
- 讓低階玩家也能威脅高階玩家（手快無用，看招才重要）

復刻時**不要為了「現代化」把後搖縮短**。

### B. Embolden 不是「免傷盾」

很多遊戲的超甲伴隨減傷。FEZ 的 Embolden **只擋硬直，不減傷**。戰士啟動 Embolden 衝陣，雖然動作不被打斷，但**血條會大量減少**。Cestus / 法師輸出強到一定程度可以「Embolden 戰士直接被打死」。

這就是為什麼戰士也要看時機、看血量、看支援，不能無腦衝。

---

文檔到此。實作時依「§11 TypeScript 實作」逐步寫，搭配「§12 還原度檢查清單」逐項驗證。如果有任何一項打不了勾，這個遊戲就還不是 FEZ。
