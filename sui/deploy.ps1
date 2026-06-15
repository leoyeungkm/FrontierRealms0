# ─── 部署 FR0 Move 合約到 Sui，並把 package id 寫入 client .env ───
# 前置：已安裝 sui CLI、sui client 已切到目標網路且地址有 gas（testnet 可用水龍頭）
param([string]$Network = "testnet")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "→ 切換網路：$Network"
sui client switch --env $Network

Write-Host "→ 編譯 + 發布合約..."
sui client publish --gas-budget 200000000 --json | Out-File -Encoding utf8 publish-output.json

# 解析 packageId 與 MintCap object id（成就頒發權杖）
$pkg = node -e "const d=require('./publish-output.json'); const c=d.objectChanges.find(o=>o.type==='published'); console.log(c.packageId)"
$cap = node -e "const d=require('./publish-output.json'); const c=(d.objectChanges||[]).find(o=>o.objectType&&o.objectType.endsWith('::achievement::MintCap')); console.log(c?c.objectId:'')"

Write-Host ""
Write-Host "✅ Package ID : $pkg"
Write-Host "✅ MintCap    : $cap  （頒發成就用，轉給伺服器錢包）"

# 寫入 client .env
"VITE_FR0_PACKAGE_ID=$pkg`r`nVITE_FR0_SUI_NETWORK=$Network" | Out-File -Encoding utf8 ..\.env
Write-Host "→ 已寫入 ..\.env（client）"
Write-Host ""
Write-Host "伺服器端請設環境變數：FR0_PACKAGE_ID=$pkg  FR0_SUI_NETWORK=$Network"
