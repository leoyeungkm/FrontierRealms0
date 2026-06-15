# FR0 × Sui — Sui Overflow 2026 提交

> **FEZ 風格的多人體素對戰遊戲，你的裝備外觀是你真正擁有、可驗證、可交易的鏈上 NFT。**

賽道：**Entertainment & Culture / ONE Championship**（消費級應用 — gaming / NFT）

---

## 一句話

FR0 是一款瀏覽器即玩的即時多人對戰遊戲（Three.js + Colyseus），完整的裝備外觀系統（頭/身/手/腳/披風 + 染色 + 武器皮膚）由 **Sui 物件**支撐 —— 玩家把外觀鑄造成 NFT、真正擁有、可交易；而且**遊戲伺服器以鏈為唯一事實來源**驗證玩家確實持有所裝備的 NFT。

## 解決什麼問題

Web3 遊戲的兩大痛點：**上手難**（要先懂錢包/助記詞/買 gas）與**假擁有**（「NFT」其實只是前端貼圖，伺服器不驗證）。FR0 的設計：

1. **真擁有 + 真驗證** — 外觀是 `key + store` 的 Sui 物件，可轉移/交易；裝備時**伺服器查鏈**確認 ownership，鏈是 source of truth，不是前端裝飾。
2. **優雅降級** — 沒連錢包也能完整遊玩（所有外觀本地可用）；連上錢包後外觀升級為可驗證的鏈上資產。零門檻入場，漸進式上鏈。

## 用到的 Sui 功能

| 功能 | 在哪 | 說明 |
|---|---|---|
| **自訂物件 + `key+store`** | `sui/sources/cosmetic.move` | 外觀 NFT，可轉移、可進 Kiosk 交易 |
| **可變物件（動態 NFT）** | `cosmetic::recolor` | 玩家為已擁有的外觀重新染色，物件隨玩家改變 |
| **`sui::display`** | `cosmetic` / `achievement` init | 錢包/瀏覽器正確顯示外觀卡與徽章 |
| **Soulbound（`key`-only）** | `sui/sources/achievement.move` | 戰績徽章不可轉移，由伺服器 `MintCap` 權威頒發 |
| **能力模式 `MintCap`** | `achievement` | 成就只能由持有權杖的伺服器鑄造，防偽造 |
| **個人訊息簽章驗證** | `Game_Server/src/sui/verify.ts` | 綁定 sessionId ↔ 地址，防冒用他人 NFT |
| **鏈上物件查詢** | `verify.ts` `multiGetObjects` | 伺服器驗證玩家真的持有所裝備的外觀 |
| **錢包標準連接 + 交易簽署** | `src/sui/wallet.js` | Sui Wallet / Suiet 連接、鑄造交易 |

## 架構

```
        ┌────────── Client (Three.js / Vite) ──────────┐
        │  遊戲本體（戰鬥/移動/技能）— 與鏈完全解耦      │
        │  src/sui/wallet.js   連接錢包、鑄造、查 NFT     │
        │  src/ui/suiPanel.js  鏈上衣櫥 UI（O 鍵面板）    │
        └───────┬───────────────────────────┬───────────┘
                │ signPersonalMessage        │ moveCall: mint / recolor
                │ (登入簽章)                 ▼
                │                      ┌─────────────┐
                │                      │  Sui 鏈      │
                │                      │  cosmetic /  │
                │                      │  achievement │
                │                      └──────┬──────┘
                ▼ suiAuth[addr,sig]           │ multiGetObjects / verify sig
        ┌──────────────────────────────┐     │
        │  Game Server (Colyseus / TS)  │◀────┘
        │  src/sui/verify.ts            │
        │  · 簽章驗身 → 綁定地址        │
        │  · 查鏈驗證 NFT ownership     │
        │  · 廣播 gearVerified ✓        │
        └──────────────────────────────┘
```

## Demo 流程

1. 進遊戲（不連錢包也能玩）。按 **O** 開外觀面板 → 底部「🔗 SUI 鏈上衣櫥」。
2. **連接錢包**（Sui Wallet / Suiet，testnet）→ 自動簽署登入訊息，伺服器顯示「🔗 Sui 已驗證」。
3. 調好一套外觀 → 點某部位的 **鑄造** → 錢包簽名 → 鏈上多出一件 `Cosmetic` NFT（錢包/瀏覽器可見，含 Display 圖卡）。
4. 「我的外觀 NFT」清單出現該件 → 點 **裝備** → 角色即時換上 + 廣播。
5. 伺服器查鏈確認你持有 → 其他玩家看到你名牌出現 **🔗 已驗證持有** 標記。
6. （動態 NFT）對已擁有的外觀 `recolor` → 同一個物件換色。

## 執行

```powershell
# 1. 部署合約（見 sui/README.md）
cd sui ; ./deploy.ps1 -Network testnet     # 自動寫入 ../.env

# 2. 伺服器
cd ../../Game_Server ; $env:FR0_PACKAGE_ID="0x..." ; npm start

# 3. Client
cd ../Threejs_FR0 ; npm run dev
```

> 未填 package id 時，鏈上功能自動停用、遊戲照常運作（優雅降級）。

## 鏈上 vs 鏈下（誠實邊界）

- **鏈上**：外觀資產所有權、轉移/交易、染色、成就徽章、ownership 與身分驗證。
- **鏈下**：即時戰鬥/位移/技能判定（由 Colyseus 權威伺服器處理，低延遲）。這是刻意的設計 — 用鏈處理「所有權」，用伺服器處理「即時性」。

## 後續路線

- **zkLogin（Enoki）** 社交登入 + **Sponsored transaction** 免 gas —— SDK 已備（`@mysten/enoki`），接 UI 即可，進一步降低入場門檻。
- **Kiosk** 二級市場 + 創作者版稅。
- 成就 SBT 自動頒發（擊殺里程碑 / 摧毀主堡）已具備合約與 `MintCap` 流程，待接戰鬥事件。
