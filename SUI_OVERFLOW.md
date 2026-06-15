# FR0 × Walrus — Sui Overflow 2026 提交

> **一款 FEZ 風格多人對戰遊戲，用 Walrus 去中心化儲存承載玩家的造型內容；用 zkLogin 一鍵 Google 登入。**

**主賽道：Walrus**（去中心化儲存 / 資料可用性）· 搭配 zkLogin 降低上手門檻

---

## 一句話

FR0 把遊戲的「玩家自創內容」整套放上 **Walrus**：你在遊戲裡調好造型（身形/頭/身/手/腳/披風 + 染色 + 武器皮膚），鑄造成 NFT 時——**角色的實際渲染預覽圖**與**完整造型設定**都上傳 Walrus，鏈上 NFT 只記 `blobId`。內容不在我們的伺服器，任何人都能從 Walrus aggregator 讀回並渲染。再用 **zkLogin** 讓玩家用 Google 帳號登入、零錢包門檻。

## 為什麼用 Walrus（契合點）

遊戲是天生的「大量二進位內容 + 使用者生成內容」場景，正是 Walrus 的主場：

1. **玩家造型 = Walrus blob** — 每件造型 NFT 的預覽圖（PNG，玩家角色的真實 render）+ 設定（JSON）存 Walrus。NFT 輕量（只存 blobId），內容去中心化、可驗證、永久可讀。
2. **真去中心化** — 別的玩家、錢包、區塊鏈瀏覽器都能直接從 Walrus aggregator URL 看到你的造型圖（NFT 的 `image_url` 指向 Walrus）。我們的伺服器掛了也不影響資產內容。
3. **可擴充** — 同一管線可延伸到對戰 replay、擊殺精華、玩家自訂貼圖（roadmap）。

## 用到的技術

| 技術 | 在哪 | 說明 |
|---|---|---|
| **Walrus HTTP 儲存** | `src/sui/walrus.js` | PUT 預覽圖 + 設定到 publisher 拿 blobId；aggregator URL 讀回 |
| **Walrus ← 鏈上引用** | `sui/sources/cosmetic.move` | `Cosmetic` NFT 存 `walrus_blob`(設定 blobId) + `image_url`(Walrus 圖 URL) |
| **zkLogin** | `src/sui/zklogin.js` | Google OAuth → 臨時金鑰 + ZK 證明 → Sui 地址，免錢包免助記詞 |
| **自訂物件 NFT（`key+store`）** | `cosmetic.move` | 造型真擁有、可轉移/交易、`recolor` 動態改色 |
| **Soulbound 成就 + `MintCap`** | `achievement.move` | 戰績徽章不可轉移，伺服器權威頒發 |
| **`sui::display`** | 合約 init | 錢包/瀏覽器直接顯示 Walrus 上的造型圖 |
| **伺服器查鏈驗證** | `Game_Server/src/sui/verify.ts` | 裝備時確認 NFT 真為玩家持有（鏈為 source of truth）|

## 架構

```
   Client (Three.js)                 Walrus                    Sui 鏈
   ─────────────────          ──────────────────         ──────────────
   調造型 → 鑄造                                          
     │  ① PUT 預覽PNG ───────▶ publisher → blobId          
     │  ② PUT 設定JSON ──────▶ publisher → blobId          
     │  ③ mint(image_url, walrus_blob) ─────────────────▶ cosmetic::Cosmetic
     │                                                        │
   穿上 NFT                                                   │
     │  ④ GET 設定 ◀───────── aggregator ◀── blobId(NFT) ────┘
     │  ⑤ 套用造型 + 廣播
     ▼
   Game Server (Colyseus) ── verify.ts：查鏈確認 ownership ──▶ Sui
   zkLogin：Google → 地址（src/sui/zklogin.js，免錢包）
```

## Demo 流程

1. 進遊戲（不登入也能玩）。按 **O** 開外觀面板 → 底部「🔗 SUI 鏈上衣櫥 · Walrus」。
2. **登入**：用 Sui 錢包，或 **用 Google 登入（zkLogin）**——免裝錢包、免助記詞。
3. 調好一套造型 → 「＋ 鑄造目前造型為 NFT」：
   - 預覽圖 PNG → **上傳 Walrus**
   - 造型設定 JSON → **上傳 Walrus**
   - mint NFT（記 blobId）
4. 「我的造型 NFT」清單顯示**從 Walrus 載入的預覽圖**。
5. 點「穿上」→ **從 Walrus 讀回設定** → 角色即時換裝 + 廣播。
6. 伺服器查鏈確認持有 → 其他玩家看到你名牌出現 **🔗 已驗證持有**。
7. 🎨「重新染色」→ 動態改 NFT 顏色（Sui 可變物件）。

## 執行

```powershell
# 1. 部署合約（詳見 sui/README.md）
cd sui ; ./deploy.ps1 -Network testnet      # 自動寫入 ../.env 的 package id

# 2. 設定 .env（複製 .env.example）：Walrus 端點已給 testnet 預設；
#    要 Google 登入則填 VITE_GOOGLE_CLIENT_ID

# 3. 伺服器
cd ../../Game_Server ; $env:FR0_PACKAGE_ID="0x..." ; npm start

# 4. Client
cd ../Threejs_FR0 ; npm run dev
```

> 未填 package id → 鏈上/Walrus 功能自動停用，遊戲照常（優雅降級）。

## 誠實邊界 / 備註

- **鏈上**：資產所有權、轉移/交易、染色、成就、ownership 驗證。**Walrus**：造型美術 + 設定資料。**鏈下**：即時戰鬥（Colyseus 權威伺服器，低延遲）。
- **zkLogin salt**：demo 用 localStorage 隨機鹽；正式環境應接 salt 服務。
- **prover**：用公開 testnet prover（可在 `.env` 換成自架）。
- **錢包/zkLogin 二擇一**：錢包路徑有個人訊息簽章綁定地址；zkLogin 路徑以鏈上 ownership 為驗證核心。

## Roadmap

- Sponsored transaction（免 gas）讓 zkLogin 玩家完全零門檻。
- 對戰 replay / 擊殺精華存 Walrus、可分享回放。
- Kiosk 二級市場 + 創作者版稅；成就自動頒發接戰鬥事件。
