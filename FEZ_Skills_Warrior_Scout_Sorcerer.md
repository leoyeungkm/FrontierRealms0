# FEZ 三大職業技能完整清單（戰士、弓手、法師）

> **範圍**：戰士 (Warrior, 三種武器樹) + 斥候 (Scout，僅弓樹) + 法師 (Sorcerer, 三種元素樹)。Fencer 和 Cestus 之後再補。
>
> **數值基準**：以原版 LV3（技能滿級）為標準。對應參考來源：FEZ Fandom Wiki、Grokipedia、玩家攻略。少數數值是依平衡推算的建議值，已標註「**[建議]**」。
>
> **PW 系統修正**：先前 §9 文檔寫「最大 8 PW」是錯的。**正確：最大 100 PW，每秒回復 1 點**，技能成本 5-80 不等。本份以此為準。

---

## 目錄

1. [技能系統基本規則](#1-技能系統基本規則)
2. [戰士 Warrior](#2-戰士-warrior)
   - [2.1 共通技能](#21-共通技能)
   - [2.2 單手劍盾](#22-單手劍盾)
   - [2.3 雙手劍](#23-雙手劍-greatsword)
   - [2.4 長槍](#24-長槍-polearm)
3. [斥候 Scout（弓）](#3-斥候-scout-弓)
4. [法師 Sorcerer](#4-法師-sorcerer)
   - [4.1 共通技能](#41-共通技能)
   - [4.2 火系](#42-火系)
   - [4.3 冰系](#43-冰系)
   - [4.4 雷系](#44-雷系)
5. [TypeScript 技能資料表](#5-typescript-技能資料表)

---

## 1. 技能系統基本規則

### 1.1 PW 池
- 最大 **100 PW**
- 每秒回復 **+1 PW**（蹲下回復更快，約 +3 PW/s）
- 死亡重生 PW 不會回滿（從 ~30 開始）
- **普攻（LMB）= 0 PW**，技能 = 5~80 PW
- 衝刺中不能使用消耗 PW 的技能

### 1.2 技能等級
- 每個技能可升 1~3 級
- LV 越高 = 傷害 / 範圍 / 持續時間 / 效果越強，但消耗 PW 增加
- 玩家**總共 40 點技能點**（角色 LV40 為上限）
- 一個技能滿級 (LV3) 通常需要 6 點 (1+2+3)

### 1.3 技能類型欄位定義

| 欄位 | 意義 |
|---|---|
| **PW** | 消耗值（LV3 滿級） |
| **Dmg** | 基礎傷害 (LV3，未含 RPS 修正) |
| **Range** | 命中距離（m） |
| **AoE** | 範圍效果半徑（m，無則為 0） |
| **Type** | 物理 (P) / 魔法 (M) |
| **Cast** | 蓄力時間（ms） |
| **Active** | 命中判定時間（ms） |
| **Recovery** | 後搖（ms） |
| **Effect** | 附加效果 (burn/slow/root/stun/knockback/knockdown) |
| **i-Frame Block** | 可否被跳/閃避（物理可被閃，魔法不可）|

---

## 2. 戰士 Warrior

### 2.1 共通技能

任何武器都能用的核心技能。

#### Embolden（堅毅 / 超甲）
**最重要的戰士技能**。FEZ 沒有它戰士就沒法用。

| 屬性 | 值 |
|---|---|
| PW | 30 |
| 持續 | 8s（LV3）|
| 冷卻 | 18s |
| 效果 | 自身免疫硬直（flinch）|
| 不擋 | Stun、Root、Knockback 位移、DoT |
| 被穿透 | Wraith 攻擊、Downdrive、Flash Stinger、Hornet Sting (Charge 1~2)|

```
Cast: 200ms | Active: instant | Recovery: 300ms
```

**戰術**：衝鋒前 1 秒按下，配合 Reinforce Guard 進入前線。**離開影響範圍 = Embolden 取消**（重要！原版機制：移動超過某距離會中斷）。

#### Reinforce Guard（強化防禦）

| 屬性 | 值 |
|---|---|
| PW | 40 |
| 持續 | 120s（LV3）|
| 冷卻 | 90s |
| 效果 | 防禦 +50、攻擊 -15 |

僅單手劍盾推薦點滿。雙手 / 長槍可以點 LV1 應急。

#### Tackle（衝撞 / 突進）

| 屬性 | 值 |
|---|---|
| PW | 25 |
| Dmg | 80 |
| Range | 8m（直線突進）|
| Effect | knockback（小擊退）|
| Cast | 100ms |
| Active | 400ms（突進中持續判定）|
| Recovery | 350ms |

戰士的位移技能，沒有它戰士會很難接近敵人。

---

### 2.2 單手劍盾

定位：低攻擊、高防禦、控場（Shield Bash 暈人）

#### Shield Bash（盾擊）
**戰士的招牌**。

| 屬性 | 值 |
|---|---|
| PW | 40 |
| Dmg | 150 |
| Range | 2m（極短）|
| AoE | 90° 扇形 |
| Type | P |
| Effect | **Stun 3s** |
| Cast | **250ms（明顯起手）** |
| Active | 100ms |
| Recovery | 400ms |
| 特殊 | 同目標 30s 內不可再次暈眩（diminishing returns）|

**戰術**：起手動畫極明顯，敵人有時間反應。配合：
- Embolden 衝進去 → Shield Bash → Sorcerer 法師接 Ice Javelin → 隊友集火

#### Smash（重擊）

| 屬性 | 值 |
|---|---|
| PW | 15 |
| Dmg | 100 |
| Range | 2m |
| AoE | 60° 扇形 |
| Type | P |
| Effect | flinch |
| Cast | 200ms |
| Active | 80ms |
| Recovery | 250ms |

基礎進攻技能。PW 便宜可常用，**LV3 後可解鎖 2 Smash**。

#### 2 Smash（連續重擊）

| 屬性 | 值 |
|---|---|
| PW | 25 |
| Dmg | 90 × 2（連擊）|
| Range | 2m |
| Effect | flinch × 2 |
| Cast | 200ms |
| Active | 80 + 80ms（兩段）|
| Recovery | 350ms |

替代普攻的主力。低 PW 高 DPS，但**側閃可以避開第二段**。

#### Force Impact（衝擊波）

| 屬性 | 值 |
|---|---|
| PW | 35 |
| Dmg | 130 |
| Range | 12m（線性投射）|
| Effect | **Knockback 4m** |
| Cast | 400ms |
| Active | 50ms |
| Recovery | 500ms |

遠程推開技。前搖長，慎用。

#### Sonic Boom（音速波）

| 屬性 | 值 |
|---|---|
| PW | 30 |
| Dmg | 110 |
| Range | 15m（線性）|
| AoE | 寬 2m |
| Effect | flinch |
| Cast | 300ms |
| Active | 80ms |
| Recovery | 400ms |

比 Force Impact 範圍更廣、但傷害較低。掃陣型用。

---

### 2.3 雙手劍 Greatsword

定位：高傷害、高建築傷害、慢、無位移

#### Behemoth's Tail（巨獸尾擊）
**雙手劍主力多段攻擊**。

| 屬性 | 值 |
|---|---|
| PW | 35 |
| Dmg | 60 × 4（四段，水平橫掃）|
| Range | 3m |
| AoE | 180° 弧形 |
| Effect | flinch（每段）|
| Cast | 350ms |
| Active | 600ms（四段判定持續）|
| Recovery | 500ms |
| 注意 | 多段命中 — 注意可能被取消後續段；側閃可避大多段 |

**核心連段**：Behemoth's Tail → Heavy Smash（接技條件）

#### Heavy Smash（重型重擊）

| 屬性 | 值 |
|---|---|
| PW | 30 |
| Dmg | 200 |
| Range | 3m |
| Effect | flinch |
| Cast | 300ms |
| Active | 100ms |
| Recovery | 600ms |
| 解鎖 | 對被 Behemoth's Tail flinch 的目標可接 |

#### Crumble Storm（碎裂風暴）
**戰士最強範圍技**。

| 屬性 | 值 |
|---|---|
| PW | 60 |
| Dmg | 250 |
| Range | 4m（自身周圍）|
| AoE | 360° |
| Type | P |
| Effect | **Knockback** |
| Cast | 500ms |
| Active | 200ms |
| Recovery | 800ms |
| 注意 | 後搖長，被打很慘 |

#### Cleave（劈斬）

| 屬性 | 值 |
|---|---|
| PW | 40 |
| Dmg | 220 |
| Range | 3m |
| AoE | 120° 扇形 |
| Cast | 400ms |
| Active | 120ms |
| Recovery | 500ms |

#### Slam Attack（重墜攻擊）

| 屬性 | 值 |
|---|---|
| PW | 45 |
| Dmg | 180 |
| Range | 2.5m |
| AoE | 圓形 3m |
| Effect | **Knockback** |
| Cast | 450ms |
| Active | 100ms |
| Recovery | 550ms |

---

### 2.4 長槍 Polearm

定位：中距離、平衡、繞背輸出

#### Lance Sweep（長槍橫掃）

| 屬性 | 值 |
|---|---|
| PW | 25 |
| Dmg | 130 |
| Range | 3.5m |
| AoE | 120° 扇形 |
| Effect | flinch |
| Cast | 250ms |
| Active | 100ms |
| Recovery | 350ms |

#### Lance Charge（長槍突刺）

| 屬性 | 值 |
|---|---|
| PW | 30 |
| Dmg | 180 |
| Range | 6m（線性突進）|
| Effect | flinch |
| Cast | 200ms |
| Active | 300ms（突進中）|
| Recovery | 400ms |

#### Big Step（大步突進）

| 屬性 | 值 |
|---|---|
| PW | 45 |
| Dmg | 170 |
| Range | 5m（突進） |
| AoE | 著陸 3m |
| Effect | **Knockback** |
| Cast | 300ms |
| Active | 200ms |
| Recovery | 500ms |

#### Whirlwind Lance（風暴長槍）

| 屬性 | 值 |
|---|---|
| PW | 50 |
| Dmg | 70 × 3 |
| Range | 4m |
| AoE | 360° |
| Cast | 400ms |
| Active | 600ms |
| Recovery | 600ms |

---

## 3. 斥候 Scout（弓）

定位：遠距離輸出、低 PW 高頻率、debuff 大師、**對戰士 Embolden 很弱**

### 3.1 共通技能

#### Hide（隱身）

| 屬性 | 值 |
|---|---|
| PW | 50 |
| 持續 | 20s（LV3）|
| 冷卻 | 30s |
| 效果 | 對敵方不可見（但 footstep、漣漪、開礦光、buff icon 仍可見）|
| 中斷 | 受擊、攻擊、施法 |

注意：原版設定 Hide 並不是真正的「無敵藏匿」— 對方滑鼠掃過你的位置仍會有準心鎖定圓圈。**這是設計上的妥協**。

#### Quick Step（快步移動）

| 屬性 | 值 |
|---|---|
| PW | 20 |
| Dmg | 0 |
| Effect | 移速 +40% / 持續 6s |
| Cast | 100ms |
| Recovery | 150ms |

斥候的脫戰 / 追擊技能。

---

### 3.2 弓系攻擊技能

#### True Shot（穿透箭）

| 屬性 | 值 |
|---|---|
| PW | 15 |
| Dmg | 120 |
| Range | 25m |
| Effect | **穿透**（一發箭穿過多人）|
| Cast | 200ms |
| Active | 50ms（箭飛行）|
| Recovery | 250ms |
| Hitbox | 大 |

**主力消耗技**。低 PW、可命中多人，是斥候的標配。

#### Eagle Shot（鷹眼箭）

| 屬性 | 值 |
|---|---|
| PW | 10 |
| Dmg | 80 |
| Range | **40m（遊戲中最遠）** |
| Cast | 300ms |
| Active | 50ms |
| Recovery | 350ms |

**狙擊技**。傷害低但射程最遠，配合 Hide 偷殘血神器。

#### Air Raid（空襲箭）

| 屬性 | 值 |
|---|---|
| PW | 12 |
| Dmg | 90 |
| Range | 20m |
| AoE | 3m |
| Effect | flinch + AoE |
| Cast | 250ms |
| Active | 80ms |
| Recovery | 200ms |

**Spammable** — 後搖短，PW 便宜，可以**連續 flinch lock 非戰士目標**。斥候鎖人就是靠這個。

#### Power Shot（強力箭）

| 屬性 | 值 |
|---|---|
| PW | 30 |
| Dmg | **280**（弓最高傷害）|
| Range | 25m |
| Cast | 400ms |
| Active | 50ms |
| Recovery | 400ms |

需要瞄準功夫。PW 不便宜，不要亂放。

#### Piercing Shot（貫穿箭）

| 屬性 | 值 |
|---|---|
| PW | 35 |
| Dmg | 200 |
| Range | 18m |
| Effect | **Knockback** |
| Cast | 350ms |
| Active | 50ms |
| Recovery | 400ms |

主要用於擊退召喚物（落單時自衛）、或撤退時推開追兵。

#### Arrow Rain（箭雨）

| 屬性 | 值 |
|---|---|
| PW | 50 |
| Dmg | 200 |
| Range | 20m（指定目標點）|
| AoE | **6m 圓形 + 持續 2s** |
| Effect | **Knockdown**（倒地）|
| Cast | 500ms |
| Active | 2000ms（箭雨持續落下）|
| Recovery | 400ms |
| Type | 羽毛游標瞄準 |

**反法師招牌**：對著敵後法師群放，打斷蓄力 + 倒地 = 連殺。

#### Blaze Arrow（炎之箭）

| 屬性 | 值 |
|---|---|
| PW | 40 |
| Dmg | 180 |
| Range | 20m |
| Effect | **Burn DoT (20/s × 5s) + Knockdown**（中心命中時）|
| Cast | 400ms |
| Active | 50ms |
| Recovery | 350ms |

#### Poison Shot（毒箭）

| 屬性 | 值 |
|---|---|
| PW | 25 |
| Dmg | 70 + DoT |
| Range | 22m |
| Effect | **Poison DoT (30/3s × 4)** = 120 總額 |
| Cast | 250ms |
| Active | 50ms |
| Recovery | 250ms |

對 Sorcerer 特別有效（破蓄力 + 持續傷害）。

#### Spider Web（蛛網）

| 屬性 | 值 |
|---|---|
| PW | 30 |
| Dmg | 30 |
| Range | 18m |
| AoE | 4m |
| Effect | **Slow -50% / 持續 6s** |
| Cast | 300ms |
| Active | 50ms |
| Recovery | 300ms |

**減速神技**。用來放在地形隘口、戰士衝鋒路線、敵方退路。

#### Leg Break（斷腳）

| 屬性 | 值 |
|---|---|
| PW | 25 |
| Dmg | 60 |
| Range | 18m |
| Effect | **Slow -30% / 持續 4s** |
| Cast | 200ms |
| Active | 50ms |
| Recovery | 200ms |

單體減速，PW 比 Spider Web 便宜。

---

## 4. 法師 Sorcerer

定位：高 AoE 傷害、控場、施法慢、脆弱。FEZ 唯一**完全靠走位躲招（i-frame 不擋魔法）**的職業

### 4.1 共通技能

#### Casting（詠唱開啟）
**法師最關鍵的 buff**。沒開 Casting，B/C/D 級技能完全無法使用（按下也沒反應）。

| 屬性 | 值 |
|---|---|
| PW | 20 |
| 持續 | 60s（LV3）|
| 冷卻 | 0（持續就能用）|
| 效果 | 開啟所有 B/C/D 級技能使用權 |
| Cast | 1500ms（**蓄力期間完全不能動，可被打斷**）|
| Recovery | 300ms |

**戰術**：
- 出場前先在己方範圍內**安全處**詠唱，**永遠不要在前線**詠唱
- Casting 過期前必須提前重唱（不能等沒了才唱，會被空檔殺）
- 法師技能欄第一格永遠放 Casting

#### Mind Recover（精神回復）

| 屬性 | 值 |
|---|---|
| PW | 0 |
| 持續 | 即時 |
| 效果 | 立即 +30 PW |
| 冷卻 | 30s |
| Cast | 200ms |

緊急 PW 救援。

---

### 4.2 火系

主題：**Burn DoT + AoE**，傷害高但無控場

#### Fire（火 — D 級基礎）

| 屬性 | 值 |
|---|---|
| PW | 15 |
| Dmg | 100 |
| Range | 15m |
| AoE | 0 |
| Effect | **Burn DoT (15/s × 4s) = 60** |
| Cast | 600ms |
| Active | 50ms |
| Recovery | 400ms |

#### Fireball（火球 — B 級）

| 屬性 | 值 |
|---|---|
| PW | 35 |
| Dmg | 200 |
| Range | 20m |
| AoE | 3m |
| Effect | **Burn DoT (20/3s × 3) + Knockdown 中心命中** |
| Cast | 1000ms（**需 Casting 啟動**）|
| Active | 50ms |
| Recovery | 600ms |

**火系主力**。對戰士 +10% RPS 修正後可一發接 Burn 打掉一半血。

#### Fire Lance（火槍 — A 級）

| 屬性 | 值 |
|---|---|
| PW | 50 |
| Dmg | 280 |
| Range | 22m（線性突進火焰）|
| AoE | 寬 2m |
| Effect | **Burn DoT (30/2s × 4)** |
| Cast | 1200ms |
| Active | 100ms |
| Recovery | 700ms |

直線爆射，比火球更專注單體。

#### Hellfire（地獄火 — S 級 / 終極）

| 屬性 | 值 |
|---|---|
| PW | 80 |
| Dmg | 400 |
| Range | 25m |
| AoE | **8m（巨型 AoE）** |
| Effect | **Burn DoT (40/2s × 5) + Knockdown** |
| Cast | 2000ms |
| Active | 200ms |
| Recovery | 1000ms |

**法師終極技**。蓄力時間極長 — **必須有戰士保護**。配合 Crumble Storm 連段。

#### Spark Flare（火花閃焰）

| 屬性 | 值 |
|---|---|
| PW | 30 |
| Dmg | 120 + 80（彈頭 + 爆裂）|
| Range | 18m |
| AoE | 4m（爆裂範圍）|
| Effect | **Burn**, **Knockback** |
| Cast | 800ms |
| Active | 50ms |
| Recovery | 500ms |
| 特殊 | 彈頭命中 → 爆裂不發生；彈頭未中 → 爆裂展開 |

#### Meteor（隕石 — S 級 / 終極）

| 屬性 | 值 |
|---|---|
| PW | 75 |
| Dmg | 200 × 3 隕石 |
| Range | 20m（指定點）|
| AoE | 每隕石 4m，**三隕石分三方向落下** |
| Effect | **Knockdown** |
| Cast | 1800ms |
| Active | 1500ms（隕石依序落下）|
| Recovery | 800ms |

**範圍最廣的法師技**。打陣型用。

---

### 4.3 冰系

主題：**Slow + Root（定身）**，傷害中等，**最強控場**

#### Cold Bolt（冰彈 — D 級）

| 屬性 | 值 |
|---|---|
| PW | 12 |
| Dmg | 80 |
| Range | 18m |
| Effect | **Slow -30% / 持續 3s** |
| Cast | 500ms |
| Active | 50ms |
| Recovery | 400ms |

#### Ice Javelin（冰槍 — A 級）
**法師最 OP 的技能之一**。

| 屬性 | 值 |
|---|---|
| PW | 70 |
| Dmg | 320 |
| Range | 20m |
| Effect | **Root 4s + Stun**（定身且不能施法）|
| Cast | 1500ms |
| Active | 100ms |
| Recovery | 700ms |
| 免疫 | 命中後 12s 該目標免疫 root |

**戰術核心**：
- Warrior Shield Bash (Stun 3s) → 隊友 Ice Javelin（4s root）= **總共 7s 鎖人**
- 在這 7 秒內法師全隊集火 → 大概率擊殺

#### Cold Wave（冷波 — B 級）

| 屬性 | 值 |
|---|---|
| PW | 45 |
| Dmg | 180 |
| Range | 15m |
| AoE | 5m 圓形 |
| Effect | **Slow -40% × 5s + Knockback** |
| Cast | 1000ms |
| Active | 50ms |
| Recovery | 500ms |

群體減速 + 推開。掩護撤退或佈防隘口。

#### Blizzard Caress（暴雪輕撫 — A 級）

| 屬性 | 值 |
|---|---|
| PW | 55 |
| Dmg | 100 + 250（彈頭 + 範圍）|
| Range | 18m |
| AoE | 4m（spread）|
| Effect | **Root 3s** |
| Cast | 1200ms |
| Active | 100ms |
| Recovery | 600ms |
| 特殊 | 彈頭命中 → 不展開；未中 → 範圍 spread 展開 |

#### Blizzard Breath（暴雪吐息 — S 級）

| 屬性 | 值 |
|---|---|
| PW | 80 |
| Dmg | 100 × 4（持續性）|
| Range | 12m（前方扇形持續吹）|
| AoE | 60° 扇形持續 |
| Effect | **Root（範圍內，期間）** |
| Cast | 1800ms |
| Active | 2000ms（吹氣持續）|
| Recovery | 800ms |

**封鎖隘口神技** — 對方進入扇形就動不了。

#### Frost Nova（冰霜新星 [建議]）

| 屬性 | 值 |
|---|---|
| PW | 40 |
| Dmg | 120 |
| Range | 0（自身）|
| AoE | 5m 圓 |
| Effect | **Slow -50% × 4s** |
| Cast | 500ms |
| Active | 100ms |
| Recovery | 500ms |

自身周圍緊急冰冷波（防被衝臉）。

---

### 4.4 雷系

主題：**最高單體傷害 + 無視高度**（從山頂打山谷也命中），無 burn 無 root，**對戰士 Embolden 無效**

#### Lightning（雷擊 — D 級）

| 屬性 | 值 |
|---|---|
| PW | 18 |
| Dmg | 130 |
| Range | 22m |
| Effect | flinch |
| Cast | 700ms |
| Active | 50ms |
| Recovery | 400ms |
| 特殊 | **無視高度差**（垂直打擊）|

#### Thunderbolt（雷霆 — B 級）

| 屬性 | 值 |
|---|---|
| PW | 40 |
| Dmg | 260 |
| Range | LV1: 18m / LV2: 22m / LV3: **30m** |
| Effect | **Knockback** |
| Cast | 900ms |
| Active | 50ms |
| Recovery | 500ms |

**雷系主力**。射程隨 LV 線性增長 — 滿級可在敵方射程外輸出。

#### Lightning Spark（雷光閃 — A 級）

| 屬性 | 值 |
|---|---|
| PW | 50 |
| Dmg | 300 |
| Range | 25m |
| AoE | 鏈式跳躍 3 個目標（每跳 -30%）|
| Effect | flinch |
| Cast | 1100ms |
| Active | 200ms（鏈擴散）|
| Recovery | 600ms |

#### Lightning Storm（雷暴 — S 級）

| 屬性 | 值 |
|---|---|
| PW | 75 |
| Dmg | 80 × 6（持續打擊）|
| Range | 20m（指定點）|
| AoE | 6m 圓形持續 |
| Effect | flinch（每段）|
| Cast | 1800ms |
| Active | 3000ms（持續放電）|
| Recovery | 800ms |

#### Chain Lightning（連鎖閃電 [建議]）

| 屬性 | 值 |
|---|---|
| PW | 60 |
| Dmg | 250 → 175 → 122（三段衰減）|
| Range | 25m 起手，每跳 +10m |
| Effect | flinch |
| Cast | 1000ms |
| Active | 400ms |
| Recovery | 500ms |

---

## 5. TypeScript 技能資料表

可以直接 copy 進你的專案的 `src/data/skills.ts`：

```ts
// FEZ Skill Data — LV3 stats
// 客戶端與伺服器共用。所有時間單位為 ms。

export type DamageType = 'physical' | 'magical';
export type HitstunType = 'none' | 'flinch_short' | 'flinch' | 'knockback' | 'knockdown' | 'stun' | 'root';
export type ElementType = 'none' | 'fire' | 'ice' | 'lightning';

export interface StatusEffect {
  type: 'burn' | 'poison' | 'slow' | 'root' | 'stun' | 'buff_embolden' | 'buff_casting' | 'buff_reinforce' | 'buff_quickstep' | 'invisible';
  duration: number;       // ms
  potency?: number;       // -50% slow = 0.5, +30 dmg/tick burn = 30
  tickInterval?: number;  // for DoT
}

export interface SkillDef {
  id: string;
  name: string;
  nameZh: string;
  classId: 'warrior' | 'scout' | 'sorcerer';
  weapon?: 'sword_shield' | 'greatsword' | 'polearm' | 'bow' | 'staff';
  tier: 'common' | 'D' | 'C' | 'B' | 'A' | 'S';
  
  pwCost: number;
  damage: number;
  damageType: DamageType;
  
  range: number;          // m
  aoeRadius: number;      // m (0 = single target / linear)
  aoeAngle?: number;      // degrees (for cone), default 360
  
  windupMs: number;       // 前搖
  activeMs: number;       // 命中判定窗口
  recoveryMs: number;     // 後搖
  
  hitstun: HitstunType;
  hitstunMs: number;
  
  blocksJumpDodge: boolean;  // false = 跳/側閃可閃；true = 不可閃（魔法）
  
  effects?: StatusEffect[];
  element?: ElementType;
  
  requires?: {
    castingBuff?: boolean;   // 需要 Casting active
    weapon?: string;
    selfBuff?: string;       // e.g. 'hide' for Punishing Strike
  };
  
  notes?: string;
}

export const SKILLS: Record<string, SkillDef> = {
  // ========== WARRIOR — COMMON ==========
  embolden: {
    id: 'embolden', name: 'Embolden', nameZh: '堅毅',
    classId: 'warrior', tier: 'common',
    pwCost: 30, damage: 0, damageType: 'physical',
    range: 0, aoeRadius: 0,
    windupMs: 200, activeMs: 0, recoveryMs: 300,
    hitstun: 'none', hitstunMs: 0,
    blocksJumpDodge: false,
    effects: [{ type: 'buff_embolden', duration: 8000 }],
    notes: 'Super armor — ignores flinch. Does NOT block: Stun, Root, Knockback velocity, DoT.',
  },
  
  reinforce_guard: {
    id: 'reinforce_guard', name: 'Reinforce Guard', nameZh: '強化防禦',
    classId: 'warrior', tier: 'common',
    pwCost: 40, damage: 0, damageType: 'physical',
    range: 0, aoeRadius: 0,
    windupMs: 300, activeMs: 0, recoveryMs: 400,
    hitstun: 'none', hitstunMs: 0,
    blocksJumpDodge: false,
    effects: [{ type: 'buff_reinforce', duration: 120000, potency: 50 }],
  },
  
  tackle: {
    id: 'tackle', name: 'Tackle', nameZh: '衝撞',
    classId: 'warrior', tier: 'common',
    pwCost: 25, damage: 80, damageType: 'physical',
    range: 8, aoeRadius: 0,
    windupMs: 100, activeMs: 400, recoveryMs: 350,
    hitstun: 'knockback', hitstunMs: 400,
    blocksJumpDodge: false,
  },
  
  // ========== WARRIOR — SWORD & SHIELD ==========
  shield_bash: {
    id: 'shield_bash', name: 'Shield Bash', nameZh: '盾擊',
    classId: 'warrior', weapon: 'sword_shield', tier: 'B',
    pwCost: 40, damage: 150, damageType: 'physical',
    range: 2, aoeRadius: 0, aoeAngle: 90,
    windupMs: 250, activeMs: 100, recoveryMs: 400,
    hitstun: 'stun', hitstunMs: 3000,
    blocksJumpDodge: false,
    notes: 'Iconic warrior CC. Target gets 30s stun immunity after.',
  },
  
  smash: {
    id: 'smash', name: 'Smash', nameZh: '重擊',
    classId: 'warrior', weapon: 'sword_shield', tier: 'D',
    pwCost: 15, damage: 100, damageType: 'physical',
    range: 2, aoeRadius: 0, aoeAngle: 60,
    windupMs: 200, activeMs: 80, recoveryMs: 250,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: false,
  },
  
  smash_2: {
    id: 'smash_2', name: '2 Smash', nameZh: '連續重擊',
    classId: 'warrior', weapon: 'sword_shield', tier: 'C',
    pwCost: 25, damage: 90, damageType: 'physical',
    range: 2, aoeRadius: 0,
    windupMs: 200, activeMs: 160, recoveryMs: 350,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: false,
    notes: 'Two hits: 90 + 90. Sidestep can avoid second hit.',
  },
  
  force_impact: {
    id: 'force_impact', name: 'Force Impact', nameZh: '衝擊波',
    classId: 'warrior', weapon: 'sword_shield', tier: 'C',
    pwCost: 35, damage: 130, damageType: 'physical',
    range: 12, aoeRadius: 0,
    windupMs: 400, activeMs: 50, recoveryMs: 500,
    hitstun: 'knockback', hitstunMs: 600,
    blocksJumpDodge: false,
  },
  
  sonic_boom: {
    id: 'sonic_boom', name: 'Sonic Boom', nameZh: '音速波',
    classId: 'warrior', weapon: 'sword_shield', tier: 'C',
    pwCost: 30, damage: 110, damageType: 'physical',
    range: 15, aoeRadius: 0, aoeAngle: 0,
    windupMs: 300, activeMs: 80, recoveryMs: 400,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: false,
    notes: 'Linear, 2m wide path.',
  },
  
  // ========== WARRIOR — GREATSWORD ==========
  behemoths_tail: {
    id: 'behemoths_tail', name: "Behemoth's Tail", nameZh: '巨獸尾擊',
    classId: 'warrior', weapon: 'greatsword', tier: 'B',
    pwCost: 35, damage: 60, damageType: 'physical',
    range: 3, aoeRadius: 0, aoeAngle: 180,
    windupMs: 350, activeMs: 600, recoveryMs: 500,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: false,
    notes: '4-hit sweep. 60 dmg per hit. Allows Heavy Smash chain on flinched target.',
  },
  
  heavy_smash: {
    id: 'heavy_smash', name: 'Heavy Smash', nameZh: '重型重擊',
    classId: 'warrior', weapon: 'greatsword', tier: 'A',
    pwCost: 30, damage: 200, damageType: 'physical',
    range: 3, aoeRadius: 0,
    windupMs: 300, activeMs: 100, recoveryMs: 600,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: false,
    notes: 'Combo from Behemoth flinch only.',
  },
  
  crumble_storm: {
    id: 'crumble_storm', name: 'Crumble Storm', nameZh: '碎裂風暴',
    classId: 'warrior', weapon: 'greatsword', tier: 'S',
    pwCost: 60, damage: 250, damageType: 'physical',
    range: 0, aoeRadius: 4,
    windupMs: 500, activeMs: 200, recoveryMs: 800,
    hitstun: 'knockback', hitstunMs: 600,
    blocksJumpDodge: false,
  },
  
  cleave: {
    id: 'cleave', name: 'Cleave', nameZh: '劈斬',
    classId: 'warrior', weapon: 'greatsword', tier: 'B',
    pwCost: 40, damage: 220, damageType: 'physical',
    range: 3, aoeRadius: 0, aoeAngle: 120,
    windupMs: 400, activeMs: 120, recoveryMs: 500,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: false,
  },
  
  slam_attack: {
    id: 'slam_attack', name: 'Slam Attack', nameZh: '重墜攻擊',
    classId: 'warrior', weapon: 'greatsword', tier: 'B',
    pwCost: 45, damage: 180, damageType: 'physical',
    range: 2.5, aoeRadius: 3,
    windupMs: 450, activeMs: 100, recoveryMs: 550,
    hitstun: 'knockback', hitstunMs: 600,
    blocksJumpDodge: false,
  },
  
  // ========== WARRIOR — POLEARM ==========
  lance_sweep: {
    id: 'lance_sweep', name: 'Lance Sweep', nameZh: '長槍橫掃',
    classId: 'warrior', weapon: 'polearm', tier: 'C',
    pwCost: 25, damage: 130, damageType: 'physical',
    range: 3.5, aoeRadius: 0, aoeAngle: 120,
    windupMs: 250, activeMs: 100, recoveryMs: 350,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: false,
  },
  
  lance_charge: {
    id: 'lance_charge', name: 'Lance Charge', nameZh: '長槍突刺',
    classId: 'warrior', weapon: 'polearm', tier: 'B',
    pwCost: 30, damage: 180, damageType: 'physical',
    range: 6, aoeRadius: 0,
    windupMs: 200, activeMs: 300, recoveryMs: 400,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: false,
  },
  
  big_step: {
    id: 'big_step', name: 'Big Step', nameZh: '大步突進',
    classId: 'warrior', weapon: 'polearm', tier: 'A',
    pwCost: 45, damage: 170, damageType: 'physical',
    range: 5, aoeRadius: 3,
    windupMs: 300, activeMs: 200, recoveryMs: 500,
    hitstun: 'knockback', hitstunMs: 600,
    blocksJumpDodge: false,
  },
  
  whirlwind_lance: {
    id: 'whirlwind_lance', name: 'Whirlwind Lance', nameZh: '風暴長槍',
    classId: 'warrior', weapon: 'polearm', tier: 'A',
    pwCost: 50, damage: 70, damageType: 'physical',
    range: 0, aoeRadius: 4,
    windupMs: 400, activeMs: 600, recoveryMs: 600,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: false,
    notes: '3 hits at 70 each.',
  },
  
  // ========== SCOUT — COMMON ==========
  hide: {
    id: 'hide', name: 'Hide', nameZh: '隱身',
    classId: 'scout', tier: 'common',
    pwCost: 50, damage: 0, damageType: 'physical',
    range: 0, aoeRadius: 0,
    windupMs: 400, activeMs: 0, recoveryMs: 300,
    hitstun: 'none', hitstunMs: 0,
    blocksJumpDodge: false,
    effects: [{ type: 'invisible', duration: 20000 }],
    notes: 'Footsteps and ripples still visible. Cancels on damage/attack.',
  },
  
  quick_step: {
    id: 'quick_step', name: 'Quick Step', nameZh: '快步移動',
    classId: 'scout', tier: 'common',
    pwCost: 20, damage: 0, damageType: 'physical',
    range: 0, aoeRadius: 0,
    windupMs: 100, activeMs: 0, recoveryMs: 150,
    hitstun: 'none', hitstunMs: 0,
    blocksJumpDodge: false,
    effects: [{ type: 'buff_quickstep', duration: 6000, potency: 1.4 }],
  },
  
  // ========== SCOUT — BOW ==========
  true_shot: {
    id: 'true_shot', name: 'True Shot', nameZh: '穿透箭',
    classId: 'scout', weapon: 'bow', tier: 'C',
    pwCost: 15, damage: 120, damageType: 'physical',
    range: 25, aoeRadius: 0,
    windupMs: 200, activeMs: 50, recoveryMs: 250,
    hitstun: 'flinch_short', hitstunMs: 200,
    blocksJumpDodge: false,
    notes: 'Piercing — hits multiple enemies in a line.',
  },
  
  eagle_shot: {
    id: 'eagle_shot', name: 'Eagle Shot', nameZh: '鷹眼箭',
    classId: 'scout', weapon: 'bow', tier: 'D',
    pwCost: 10, damage: 80, damageType: 'physical',
    range: 40, aoeRadius: 0,
    windupMs: 300, activeMs: 50, recoveryMs: 350,
    hitstun: 'flinch_short', hitstunMs: 200,
    blocksJumpDodge: false,
    notes: 'Longest range in game.',
  },
  
  air_raid: {
    id: 'air_raid', name: 'Air Raid', nameZh: '空襲箭',
    classId: 'scout', weapon: 'bow', tier: 'C',
    pwCost: 12, damage: 90, damageType: 'physical',
    range: 20, aoeRadius: 3,
    windupMs: 250, activeMs: 80, recoveryMs: 200,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: false,
    notes: 'Spammable. Flinch-locks non-Warriors.',
  },
  
  power_shot: {
    id: 'power_shot', name: 'Power Shot', nameZh: '強力箭',
    classId: 'scout', weapon: 'bow', tier: 'A',
    pwCost: 30, damage: 280, damageType: 'physical',
    range: 25, aoeRadius: 0,
    windupMs: 400, activeMs: 50, recoveryMs: 400,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: false,
  },
  
  piercing_shot: {
    id: 'piercing_shot', name: 'Piercing Shot', nameZh: '貫穿箭',
    classId: 'scout', weapon: 'bow', tier: 'B',
    pwCost: 35, damage: 200, damageType: 'physical',
    range: 18, aoeRadius: 0,
    windupMs: 350, activeMs: 50, recoveryMs: 400,
    hitstun: 'knockback', hitstunMs: 600,
    blocksJumpDodge: false,
  },
  
  arrow_rain: {
    id: 'arrow_rain', name: 'Arrow Rain', nameZh: '箭雨',
    classId: 'scout', weapon: 'bow', tier: 'A',
    pwCost: 50, damage: 200, damageType: 'physical',
    range: 20, aoeRadius: 6,
    windupMs: 500, activeMs: 2000, recoveryMs: 400,
    hitstun: 'knockdown', hitstunMs: 1200,
    blocksJumpDodge: false,
    notes: 'Target-point AoE. Used to interrupt back-line mages.',
  },
  
  blaze_arrow: {
    id: 'blaze_arrow', name: 'Blaze Arrow', nameZh: '炎之箭',
    classId: 'scout', weapon: 'bow', tier: 'A',
    pwCost: 40, damage: 180, damageType: 'physical',
    range: 20, aoeRadius: 0,
    windupMs: 400, activeMs: 50, recoveryMs: 350,
    hitstun: 'knockdown', hitstunMs: 1200,
    blocksJumpDodge: false,
    effects: [{ type: 'burn', duration: 5000, potency: 20, tickInterval: 1000 }],
  },
  
  poison_shot: {
    id: 'poison_shot', name: 'Poison Shot', nameZh: '毒箭',
    classId: 'scout', weapon: 'bow', tier: 'C',
    pwCost: 25, damage: 70, damageType: 'physical',
    range: 22, aoeRadius: 0,
    windupMs: 250, activeMs: 50, recoveryMs: 250,
    hitstun: 'flinch_short', hitstunMs: 200,
    blocksJumpDodge: false,
    effects: [{ type: 'poison', duration: 12000, potency: 30, tickInterval: 3000 }],
  },
  
  spider_web: {
    id: 'spider_web', name: 'Spider Web', nameZh: '蛛網',
    classId: 'scout', weapon: 'bow', tier: 'B',
    pwCost: 30, damage: 30, damageType: 'physical',
    range: 18, aoeRadius: 4,
    windupMs: 300, activeMs: 50, recoveryMs: 300,
    hitstun: 'none', hitstunMs: 0,
    blocksJumpDodge: false,
    effects: [{ type: 'slow', duration: 6000, potency: 0.5 }],
  },
  
  leg_break: {
    id: 'leg_break', name: 'Leg Break', nameZh: '斷腳',
    classId: 'scout', weapon: 'bow', tier: 'C',
    pwCost: 25, damage: 60, damageType: 'physical',
    range: 18, aoeRadius: 0,
    windupMs: 200, activeMs: 50, recoveryMs: 200,
    hitstun: 'flinch_short', hitstunMs: 200,
    blocksJumpDodge: false,
    effects: [{ type: 'slow', duration: 4000, potency: 0.7 }],
  },
  
  // ========== SORCERER — COMMON ==========
  casting: {
    id: 'casting', name: 'Casting', nameZh: '詠唱',
    classId: 'sorcerer', tier: 'common',
    pwCost: 20, damage: 0, damageType: 'magical',
    range: 0, aoeRadius: 0,
    windupMs: 1500, activeMs: 0, recoveryMs: 300,
    hitstun: 'none', hitstunMs: 0,
    blocksJumpDodge: false,
    effects: [{ type: 'buff_casting', duration: 60000 }],
    notes: 'REQUIRED to use B/A/S tier sorcerer skills. Cannot move while casting.',
  },
  
  mind_recover: {
    id: 'mind_recover', name: 'Mind Recover', nameZh: '精神回復',
    classId: 'sorcerer', tier: 'common',
    pwCost: 0, damage: 0, damageType: 'magical',
    range: 0, aoeRadius: 0,
    windupMs: 200, activeMs: 0, recoveryMs: 200,
    hitstun: 'none', hitstunMs: 0,
    blocksJumpDodge: false,
    notes: 'Instantly +30 PW. 30s cooldown (track separately).',
  },
  
  // ========== SORCERER — FIRE ==========
  fire: {
    id: 'fire', name: 'Fire', nameZh: '火',
    classId: 'sorcerer', weapon: 'staff', tier: 'D',
    pwCost: 15, damage: 100, damageType: 'magical',
    range: 15, aoeRadius: 0,
    windupMs: 600, activeMs: 50, recoveryMs: 400,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: true,
    element: 'fire',
    effects: [{ type: 'burn', duration: 4000, potency: 15, tickInterval: 1000 }],
  },
  
  fireball: {
    id: 'fireball', name: 'Fireball', nameZh: '火球',
    classId: 'sorcerer', weapon: 'staff', tier: 'B',
    pwCost: 35, damage: 200, damageType: 'magical',
    range: 20, aoeRadius: 3,
    windupMs: 1000, activeMs: 50, recoveryMs: 600,
    hitstun: 'knockdown', hitstunMs: 1200,
    blocksJumpDodge: true,
    element: 'fire',
    effects: [{ type: 'burn', duration: 9000, potency: 20, tickInterval: 3000 }],
    requires: { castingBuff: true },
  },
  
  fire_lance: {
    id: 'fire_lance', name: 'Fire Lance', nameZh: '火槍',
    classId: 'sorcerer', weapon: 'staff', tier: 'A',
    pwCost: 50, damage: 280, damageType: 'magical',
    range: 22, aoeRadius: 0,
    windupMs: 1200, activeMs: 100, recoveryMs: 700,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: true,
    element: 'fire',
    effects: [{ type: 'burn', duration: 8000, potency: 30, tickInterval: 2000 }],
    requires: { castingBuff: true },
  },
  
  hellfire: {
    id: 'hellfire', name: 'Hellfire', nameZh: '地獄火',
    classId: 'sorcerer', weapon: 'staff', tier: 'S',
    pwCost: 80, damage: 400, damageType: 'magical',
    range: 25, aoeRadius: 8,
    windupMs: 2000, activeMs: 200, recoveryMs: 1000,
    hitstun: 'knockdown', hitstunMs: 1200,
    blocksJumpDodge: true,
    element: 'fire',
    effects: [{ type: 'burn', duration: 10000, potency: 40, tickInterval: 2000 }],
    requires: { castingBuff: true },
  },
  
  spark_flare: {
    id: 'spark_flare', name: 'Spark Flare', nameZh: '火花閃焰',
    classId: 'sorcerer', weapon: 'staff', tier: 'B',
    pwCost: 30, damage: 120, damageType: 'magical',
    range: 18, aoeRadius: 4,
    windupMs: 800, activeMs: 50, recoveryMs: 500,
    hitstun: 'knockback', hitstunMs: 600,
    blocksJumpDodge: true,
    element: 'fire',
    effects: [{ type: 'burn', duration: 4000, potency: 20, tickInterval: 1000 }],
    requires: { castingBuff: true },
    notes: 'Bullet hits = no burst. Bullet miss = burst expands.',
  },
  
  meteor: {
    id: 'meteor', name: 'Meteor', nameZh: '隕石',
    classId: 'sorcerer', weapon: 'staff', tier: 'S',
    pwCost: 75, damage: 200, damageType: 'magical',
    range: 20, aoeRadius: 4,
    windupMs: 1800, activeMs: 1500, recoveryMs: 800,
    hitstun: 'knockdown', hitstunMs: 1200,
    blocksJumpDodge: true,
    element: 'fire',
    requires: { castingBuff: true },
    notes: '3 meteors splitting into 3 paths.',
  },
  
  // ========== SORCERER — ICE ==========
  cold_bolt: {
    id: 'cold_bolt', name: 'Cold Bolt', nameZh: '冰彈',
    classId: 'sorcerer', weapon: 'staff', tier: 'D',
    pwCost: 12, damage: 80, damageType: 'magical',
    range: 18, aoeRadius: 0,
    windupMs: 500, activeMs: 50, recoveryMs: 400,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: true,
    element: 'ice',
    effects: [{ type: 'slow', duration: 3000, potency: 0.7 }],
  },
  
  ice_javelin: {
    id: 'ice_javelin', name: 'Ice Javelin', nameZh: '冰槍',
    classId: 'sorcerer', weapon: 'staff', tier: 'A',
    pwCost: 70, damage: 320, damageType: 'magical',
    range: 20, aoeRadius: 0,
    windupMs: 1500, activeMs: 100, recoveryMs: 700,
    hitstun: 'root', hitstunMs: 4000,
    blocksJumpDodge: true,
    element: 'ice',
    requires: { castingBuff: true },
    notes: 'Target gets 12s root immunity after hit. Combos with Shield Bash for 7s lockdown.',
  },
  
  cold_wave: {
    id: 'cold_wave', name: 'Cold Wave', nameZh: '冷波',
    classId: 'sorcerer', weapon: 'staff', tier: 'B',
    pwCost: 45, damage: 180, damageType: 'magical',
    range: 15, aoeRadius: 5,
    windupMs: 1000, activeMs: 50, recoveryMs: 500,
    hitstun: 'knockback', hitstunMs: 600,
    blocksJumpDodge: true,
    element: 'ice',
    effects: [{ type: 'slow', duration: 5000, potency: 0.6 }],
    requires: { castingBuff: true },
  },
  
  blizzard_caress: {
    id: 'blizzard_caress', name: 'Blizzard Caress', nameZh: '暴雪輕撫',
    classId: 'sorcerer', weapon: 'staff', tier: 'A',
    pwCost: 55, damage: 100, damageType: 'magical',
    range: 18, aoeRadius: 4,
    windupMs: 1200, activeMs: 100, recoveryMs: 600,
    hitstun: 'root', hitstunMs: 3000,
    blocksJumpDodge: true,
    element: 'ice',
    requires: { castingBuff: true },
    notes: 'Bullet hit = no spread. Bullet miss = spread expands. Direct hit 100 + spread 250.',
  },
  
  blizzard_breath: {
    id: 'blizzard_breath', name: 'Blizzard Breath', nameZh: '暴雪吐息',
    classId: 'sorcerer', weapon: 'staff', tier: 'S',
    pwCost: 80, damage: 100, damageType: 'magical',
    range: 12, aoeRadius: 0, aoeAngle: 60,
    windupMs: 1800, activeMs: 2000, recoveryMs: 800,
    hitstun: 'root', hitstunMs: 1000,
    blocksJumpDodge: true,
    element: 'ice',
    requires: { castingBuff: true },
    notes: 'Persistent cone. Roots anyone in it. 4 hits over duration.',
  },
  
  frost_nova: {
    id: 'frost_nova', name: 'Frost Nova', nameZh: '冰霜新星',
    classId: 'sorcerer', weapon: 'staff', tier: 'B',
    pwCost: 40, damage: 120, damageType: 'magical',
    range: 0, aoeRadius: 5,
    windupMs: 500, activeMs: 100, recoveryMs: 500,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: true,
    element: 'ice',
    effects: [{ type: 'slow', duration: 4000, potency: 0.5 }],
    requires: { castingBuff: true },
  },
  
  // ========== SORCERER — LIGHTNING ==========
  lightning: {
    id: 'lightning', name: 'Lightning', nameZh: '雷擊',
    classId: 'sorcerer', weapon: 'staff', tier: 'D',
    pwCost: 18, damage: 130, damageType: 'magical',
    range: 22, aoeRadius: 0,
    windupMs: 700, activeMs: 50, recoveryMs: 400,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: true,
    element: 'lightning',
    notes: 'Ignores height difference.',
  },
  
  thunderbolt: {
    id: 'thunderbolt', name: 'Thunderbolt', nameZh: '雷霆',
    classId: 'sorcerer', weapon: 'staff', tier: 'B',
    pwCost: 40, damage: 260, damageType: 'magical',
    range: 30, aoeRadius: 0,
    windupMs: 900, activeMs: 50, recoveryMs: 500,
    hitstun: 'knockback', hitstunMs: 600,
    blocksJumpDodge: true,
    element: 'lightning',
    requires: { castingBuff: true },
    notes: 'Range scales heavily with level: LV1=18m / LV2=22m / LV3=30m.',
  },
  
  lightning_spark: {
    id: 'lightning_spark', name: 'Lightning Spark', nameZh: '雷光閃',
    classId: 'sorcerer', weapon: 'staff', tier: 'A',
    pwCost: 50, damage: 300, damageType: 'magical',
    range: 25, aoeRadius: 0,
    windupMs: 1100, activeMs: 200, recoveryMs: 600,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: true,
    element: 'lightning',
    requires: { castingBuff: true },
    notes: 'Chains to 3 targets, -30% damage per chain.',
  },
  
  lightning_storm: {
    id: 'lightning_storm', name: 'Lightning Storm', nameZh: '雷暴',
    classId: 'sorcerer', weapon: 'staff', tier: 'S',
    pwCost: 75, damage: 80, damageType: 'magical',
    range: 20, aoeRadius: 6,
    windupMs: 1800, activeMs: 3000, recoveryMs: 800,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: true,
    element: 'lightning',
    requires: { castingBuff: true },
    notes: 'Persistent zone. 6 hits over 3s.',
  },
  
  chain_lightning: {
    id: 'chain_lightning', name: 'Chain Lightning', nameZh: '連鎖閃電',
    classId: 'sorcerer', weapon: 'staff', tier: 'A',
    pwCost: 60, damage: 250, damageType: 'magical',
    range: 25, aoeRadius: 0,
    windupMs: 1000, activeMs: 400, recoveryMs: 500,
    hitstun: 'flinch', hitstunMs: 400,
    blocksJumpDodge: true,
    element: 'lightning',
    requires: { castingBuff: true },
    notes: '3 jumps: 250 → 175 → 122. Each jump +10m range.',
  },
};
```

---

## 附錄 — 經典連段（給玩家當教學）

### 戰士「衝陣連段」
```
1. Embolden（超甲，8s）
2. Tackle（衝撞，接近敵人）
3. Shield Bash（Stun 3s）
4. 普攻 × 3（趁 Stun 期間 free hits）
5. Smash 收尾
```
總 PW：30 + 25 + 40 + 0 + 15 = **110 PW**（超過上限，要中間補回）

### 法師「凍殺連段」
```
1. Casting（提前在後方詠唱）
2. （戰士隊友 Shield Bash 對目標）
3. Ice Javelin（Root 4s，蓄力中目標被戰士暈著）
4. Fireball + Thunderbolt（連續輸出）
5. 必要時 Mind Recover 補 PW
```

### 弓手「斷招連段」
```
1. （潛行接近敵後法師）
2. Arrow Rain（中斷蓄力 + 倒地）
3. Power Shot（補刀 280 dmg）
4. Blaze Arrow（burn DoT 殘留）
```

---

## 平衡備忘

- **戰士 vs 弓手**：弓手對戰士 -10% 傷害（RPS），但 Embolden 啟動時戰士無視 flinch lock，弓手必須**用 Knockback / Knockdown 技**（Piercing Shot、Arrow Rain）才能控
- **戰士 vs 法師**：法師對戰士 +10% 傷害；戰士衝進去就贏，被風箏就輸 — Embolden 撐時間關鍵
- **弓手 vs 法師**：弓手 +20% 傷害（強力剋制），最怕 Ice Javelin 被定住
- **三方混戰**：建議陣型 = 前排戰士（Embolden 抗線）+ 中排法師（AoE）+ 後排弓手（補刀、控場）

文檔到此。實作時把 `SKILLS` 物件 import 到客戶端與伺服器，依 `windupMs / activeMs / recoveryMs` 推進狀態機（參考前一份「動作與硬直」文檔的 §11）。
