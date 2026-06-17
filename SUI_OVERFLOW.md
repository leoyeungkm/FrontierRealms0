# FR0 × Walrus — Sui Overflow 2026 提交

> **一款 FEZ 風格多人對戰遊戲，用 Walrus 去中心化儲存承載玩家的造型內容；用 zkLogin 一鍵 Google 登入。**

**主賽道：Walrus**（去中心化儲存 / 資料可用性）· 搭配 zkLogin 降低上手門檻

## 已部署（Sui Testnet）

> 現行 ID 以 `src/sui/config.js` 為準（下表為主要物件）。

| 物件 | ID |
|---|---|
| **主 Package**（cosmetic · achievement · warbond · market） | `0x1712a9d8fcb6a6325a2336156d9257fa4afc5b3b215985edf85750d53ba7d1fd` |
| 預測市場 Market（B3 CPMM 共享物件） | `0x585a99d8d30f146a0612e4d63be52fc0a74628b16b38ee71ed912e037cefde8f` |
| **Hero Package**（owned 角色 NFT + 等級） | `0xe51bd7edc04b6c101e79ac2438e67a778e2ba821e5fa66353d730a3a4578ab1c` |
| Hero Config（存 server 公鑰，驗 XP 簽章） | `0x0eef570e98739a109377dc593c277ddb99e206c63a50d2932723616892786ef9` |
| **Gear Market Package**（泛型 NFT 掛單買賣） | `0x540d5442fb101b77b20ec690d1b3bddb8d8c9a9c4fec794c12a598aa1644c0c0` |
| War（warbond 押注場） | `0x460b807cfe1b6ccd513408e3b0443fb3f6ce9679721363e02d33d6d1dea58262` |
| warbond AdminCap（伺服器結算用） | `0x9bd4c542ff3a82a6133d563a1ff6d495749fe45a11c460c98ba532d4c72570e9` |

瀏覽器：`https://testnet.suivision.xyz/package/0x1712a9d8fcb6a6325a2336156d9257fa4afc5b3b215985edf85750d53ba7d1fd`

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
| **伺服器查鏈驗證** | `server/src/sui/verify.ts` | 裝備時確認 NFT 真為玩家持有（鏈為 source of truth）|
| **War Bonds（DeFi 預測市場）** | `sui/sources/warbond.move` | 對勝國同注分彩押注：原生 SUI 託管、按比例瓜分；client `src/sui/warbond.js` |
| **預測市場 CPMM（B3 AMM）** | `sui/sources/market.move` | 戰場勝負自動造市押注：買/賣 outcome 份額、賠率隨下注浮動、結算領彩；client `src/sui/market.js` |
| **Hero NFT（owned + 等級）** | `sui_hero/sources/hero.move` | 可交易的角色身分 NFT；`apply_xp` 以 server ed25519 簽章升級；含 `Display` |
| **Gear 市場（泛型掛單）** | `sui_market/sources/gearmarket.move` | `list<T>` / `buy<T>` / `delist<T>` 泛型 NFT 寄售；client `src/sui/gearmarket.js` |

### War Bonds 手動結算（demo）
回合結束後，持 AdminCap 的伺服器/管理者選勝國結算（0=Minas、1=Calaadia）：
```powershell
sui client call --package <PKG> --module warbond --function settle `
  --args <AdminCap> <War> 0 --gas-budget 50000000
```
開新一場：`warbond::open_war(<AdminCap>, <round>, <fee_bps>)`

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
# 1. 部署合約（詳見 sui/README.md；已部署 testnet，clone 可直接用）
cd sui ; ./deploy.ps1 -Network testnet      # 重新部署才需要

# 2. Client：.env 複製 .env.example（Walrus 已給 testnet 預設；
#    要 Google 登入則填 VITE_GOOGLE_CLIENT_ID）
npm install ; npm run dev

# 3. 伺服器（同 repo 的 server/）：.env 複製 server/.env.example
cd server ; npm install ; npm start
```

> Client 與 server 為同一 repo：根目錄 = Three.js client，`server/` = Colyseus 權威伺服器，`sui/` = Move 合約。

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
