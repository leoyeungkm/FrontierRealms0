# FR0 鏈上資產（Move 合約）

FEZ 風格多人對戰遊戲 **FR0** 的 Sui 鏈上模組（Sui Overflow 2026）。

## 模組

| 模組 | 型別 | 能力 | 用途 |
|---|---|---|---|
| `cosmetic` | `Cosmetic` | `key + store` | 外觀 NFT — 可轉移、可在 Kiosk 交易、可動態 `recolor` |
| `achievement` | `Achievement` | `key`（soulbound） | 戰績徽章 — 不可轉移，由伺服器 `MintCap` 頒發 |

`Cosmetic` 對應遊戲的裝備外觀系統（頭/身/手/腳/披風 + 染色）：`slot`、`variant`、`tint`、`rarity`，並實作 `sui::display` 讓錢包/瀏覽器正確顯示。

## 部署（testnet）

```powershell
# 1. 安裝 Sui CLI（一次）
#    https://docs.sui.io/guides/developer/getting-started/sui-install

# 2. 設定 testnet 並領 gas
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet
sui client faucet            # 領測試幣

# 3. 一鍵部署（編譯→發布→寫入 client .env）
cd sui
./deploy.ps1 -Network testnet
```

`deploy.ps1` 會輸出 **Package ID** 與 **MintCap** object id，並把 package id 寫進 `../.env`（client 自動讀取）。

### 伺服器設定

把同一個 package id 給遊戲伺服器（驗證 ownership / 簽章用）：

```
FR0_PACKAGE_ID=0x...
FR0_SUI_NETWORK=testnet
```

成就頒發（選用）：把 `MintCap` 轉給伺服器錢包：
```powershell
sui client transfer --object-id <MintCap> --to <伺服器地址> --gas-budget 10000000
```

## 手動測試合約

```powershell
# 鑄造一件外觀
sui client call --package <PKG> --module cosmetic --function mint `
  --args "head" "knight" 4294967295 "Knight Helmet" "https://placehold.co/256" 1 `
  --gas-budget 20000000

# 重新染色（動態 NFT）
sui client call --package <PKG> --module cosmetic --function recolor `
  --args <CosmeticObjectId> 14711402 --gas-budget 20000000
```

## 驗證合約可編譯

```powershell
cd sui
sui move build
```
