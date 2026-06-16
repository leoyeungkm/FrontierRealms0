# FR0 Server 部署到 Mac mini（長期常駐）

把 Colyseus server 放在 Mac mini 上 24/7 運行,透過 **Cloudflare Tunnel** 對外提供 `wss://` 連線,client（Vercel）連過來。

## 架構
- **Mac mini**：Node + Colyseus（port `2567`），用 **pm2** 常駐 + 開機自啟。
- **Cloudflare Tunnel**：把 `localhost:2567` 對外成 `wss://game.fr0.world`（自動 TLS、免開路由器 port）。
- **client（Vercel）**：環境變數 `VITE_SERVER_URL = wss://game.fr0.world`。

---

## 一、Mac mini（server）

```bash
# 1) 裝 Node 與 Cloudflare 工具
brew install node cloudflared

# 2) 取得程式（整個 repo，使用 server 資料夾）
git clone https://github.com/leoyeungkm/FrontierRealms0.git
cd FrontierRealms0/server     # 路徑視 repo 結構而定
npm install

# 3) 設定 .env（私鑰自己在 Mac 上取，切勿外流 / 不要進 git）
cp .env.example .env
#   先裝 Sui CLI，再 export 部署者 0xfde8 的私鑰：
#     sui keytool export --key-identity 0xfde8585a67be8ed0c52b300dea896a370fdd599a481a7e3a668b24bea961b9df
#   把輸出的 suiprivkey… 填進 .env 的 FR0_ADMIN_SECRET（純 ASCII、存 UTF-8、不要 BOM）。
#   ⚠ 此帳號需有 testnet SUI gas（resolve 市場 + 開新市場用）。

# 4) pm2 長開 + 開機自啟
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup            # ← 貼上它印出的那行指令（開機自動起 server）
pm2 logs fr0-server    # 確認：[market]/[hero] init enabled=true、⚔ Listening on 2567
```

啟動 log 應該看到（代表 oracle 結算已啟用）：
```
✅ .env loaded.
[market] init enabled=true (secret=set pkg=true mkt=true cap=true)
[hero]   init enabled=true (secret=set pkg=true cfg=true cap=true)
⚔️  Listening on http://localhost:2567
```

---

## 二、Cloudflare Tunnel（公網 + wss）

前提：`fr0.world` 的 DNS 託管在 Cloudflare（若尚未，把網域加進 Cloudflare，免費）。

```bash
cloudflared tunnel login                          # 瀏覽器授權，選 fr0.world
cloudflared tunnel create fr0
cloudflared tunnel route dns fr0 game.fr0.world   # 對外網址 = game.fr0.world
```

建立 `~/.cloudflared/config.yml`：
```yaml
tunnel: <上一步建立的 tunnel id>
credentials-file: /Users/<你的帳號>/.cloudflared/<tunnel id>.json
ingress:
  - hostname: game.fr0.world
    service: ws://localhost:2567
  - service: http_status:404
```

裝成開機服務（背景常駐）：
```bash
sudo cloudflared service install
```
→ 對外即有 **`wss://game.fr0.world`** 指向 Mac mini 的 2567（Cloudflare 自動處理 TLS）。

> 快速測試（不設域名）：`cloudflared tunnel --url ws://localhost:2567` 會印一個隨機 `wss://xxxx.trycloudflare.com`（每次重啟會變，僅供驗證連通）。

---

## 三、client 指向新 server

Vercel 專案 → Settings → Environment Variables：
```
VITE_SERVER_URL = wss://game.fr0.world
```
然後 **重新 deploy**（Vite 只在 build 時讀 env）。本地 dev 想連同一台，可在 `Threejs_FR0/.env` 設同一行。

---

## ⚠ 必做

1. **Mac mini 防睡眠**：系統設定 → 節能 → 開「防止自動睡眠」「喚醒供網路存取」。睡著 = server 斷線。
2. **私鑰只放 Mac mini 的 `.env`**，已被 `.gitignore` 忽略；切勿進 git 或貼到任何地方。此錢包握有 MARKET_CAP / AdminCap。

## 維運速查

| 操作 | 指令 |
|---|---|
| 看 log | `pm2 logs fr0-server` |
| 重啟（改完 .env 必做，dotenv 只在啟動讀一次） | `pm2 restart fr0-server` |
| 停止 / 移除 | `pm2 stop fr0-server` / `pm2 delete fr0-server` |
| 更新程式 | `git pull && cd server && npm install && pm2 restart fr0-server` |
| 看 tunnel 狀態 | `cloudflared tunnel info fr0` |

> 註：production 用 `npm run serve`（= `tsx src/index.ts`，不 watch）；`npm start` 是開發用的 `tsx watch`。pm2 設定已指向前者。
