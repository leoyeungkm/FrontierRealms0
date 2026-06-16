// PM2 設定：在 Mac mini 上長期常駐 FR0 Colyseus server（自動重啟 + 開機自啟）。
//
// 一次性安裝與啟動（在 server 目錄）：
//   npm install
//   npm install -g pm2
//   pm2 start ecosystem.config.cjs      # 啟動（讀 .env，production 模式：tsx 不 watch）
//   pm2 save                            # 記住目前進程清單
//   pm2 startup                         # 依指示貼上它印出的指令 → 開機自動起來
//
// 常用：
//   pm2 logs fr0-server                 # 看 log（含 [market]/[hero] init、結算）
//   pm2 restart fr0-server              # 改 .env 後重啟（dotenv 只在啟動讀一次）
//   pm2 stop fr0-server / pm2 delete fr0-server
module.exports = {
  apps: [{
    name: 'fr0-server',
    script: './node_modules/.bin/tsx',
    args: 'src/index.ts',
    cwd: __dirname,
    autorestart: true,
    max_restarts: 50,
    restart_delay: 2000,
    env: { NODE_ENV: 'production' },
  }],
};
