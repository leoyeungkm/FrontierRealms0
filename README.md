# FR0 — Frontier Realms Zero

> A Web3 fantasy battler set on the continent of **Aeloria**, where five kingdoms forge alliances and wage war for the realm. Built on **Sui** & **Walrus**.

🎮 **Play:** https://sui.fr0.world &nbsp;·&nbsp; 📖 **Whitepaper:** https://fr0.gitbook.io/whitepaper

FR0 fuses real-time voxel combat with on-chain ownership and a live prediction market. Back a kingdom, fight on its front line, and let your blade move the very odds you're betting on — then claim your battle XP and prediction payout on-chain.

---

## 🏆 Sui Overflow 2026

FR0 is a **Sui Overflow 2026** submission (primary track: **Walrus** — decentralized storage), built for deep Sui-stack integration. Full write-up: **[`SUI_OVERFLOW.md`](SUI_OVERFLOW.md)**.

| Integration | What it does | Source |
|---|---|---|
| **Move packages** | `cosmetic` · `achievement` · `warbond` · `market` | [`sui/sources/`](sui/sources/) |
| **Hero NFT** | Owned, tradeable hero with on-chain XP / levels | [`sui_hero/sources/hero.move`](sui_hero/sources/hero.move) |
| **Gear marketplace** | Generic NFT listings — `list` / `buy` / `delist` | [`sui_market/sources/gearmarket.move`](sui_market/sources/gearmarket.move) |
| **Walrus** | Player cosmetics — PNG art + loadout JSON stored off-chain, referenced on-chain by `blobId` | [`src/sui/walrus.js`](src/sui/walrus.js) |
| **zkLogin** | Google sign-in → Sui address, no wallet required | [`src/sui/zklogin.js`](src/sui/zklogin.js) |
| **Prediction market** | CPMM on battle outcome + War Bonds on the world map | [`src/sui/market.js`](src/sui/market.js) · [`warbond.js`](src/sui/warbond.js) |
| **Server oracle** | Chain-verified NFT ownership + ed25519-signed XP grants | [`server/src/sui/`](server/src/sui/) |

All contracts are live on **Sui testnet** — IDs in [`src/sui/config.js`](src/sui/config.js).

## ✨ Features

- ⚔️ **Real-time voxel battles** — storm enemy keeps, capture towers, hold the front line (Colyseus multiplayer).
- 📈 **On-chain prediction market** — stake SUI on which kingdom wins; buy/sell your position as the odds shift; redeem on settlement.
- 🗺️ **World map (Aeloria)** — five kingdoms (Minas United, Calaadia, Ledell, Dieudonné, Phoenix) with territories, borders and live marching animations.
- 🦸 **Hero NFTs** — your character is an owned, tradeable NFT that levels up (XP via server-signed `apply_xp`).
- 🎨 **Cosmetic / Gear NFTs** — mint, recolor, equip and trade gear; art + loadouts stored on **Walrus**.
- 🐾 **Summons** — call knights, giants and wraiths to fight at your side.
- ⛏️ **Ethershard** — gather the realm's primary resource and spend it at the Market.
- 🌐 **Bilingual** — English / 繁體中文, runtime toggle.
- 🔌 **Graceful degradation** — runs single-player/offline when chain or server config is absent.

## 🛠 Tech Stack

| Layer | Tech |
|---|---|
| Client | Three.js · Vite · vanilla JS |
| Multiplayer | Colyseus (Node + TypeScript) |
| Blockchain | Sui (Move) |
| Storage | Walrus (NFT art + loadouts) |
| Wallet | `@mysten/wallet-standard` |

## 📁 Project Structure

```
.
├── src/                # client
│   ├── main.js         # game loop, input, camera, netcode
│   ├── constants.js    # tunables + VITE_SERVER_URL
│   ├── world/          # voxel map, castle, crystal, sphere-of-influence
│   ├── entities/       # player, enemy, tower, summons, remote players
│   ├── ui/             # HUD, menus, world map, i18n
│   └── sui/            # wallet, market, warbond, hero, gear market, walrus
├── server/             # Colyseus server (MyRoom.ts) + Sui oracle
│   └── DEPLOY.md       # deployment guide
├── sui_hero/           # Move package: Hero NFT
├── sui_market/         # Move package: gear marketplace
├── public/             # static assets, privacy / terms
└── index.html
```

## 🚀 Local Development

**Client**
```bash
npm install
npm run dev          # http://localhost:5173
```

**Server** (Colyseus)
```bash
cd server
npm install
npm run serve        # ws://localhost:2567
```

Point the client at a server with `.env` → `VITE_SERVER_URL` (defaults to `ws://localhost:2567`; the client falls back to single-player if the server is unreachable).

## ☁️ Deployment

- **Client** → Vercel (`sui.fr0.world`)
- **Server** → Render (`frontierrealms0.onrender.com`) or self-hosted Mac mini + Cloudflare Tunnel

See [`server/DEPLOY.md`](server/DEPLOY.md) for the full guide.

## ⛓️ On-chain (Sui testnet)

Public package IDs (override via `.env` `VITE_FR0_*`; see `src/sui/config.js`):

| Package | ID | Modules |
|---|---|---|
| Main | `0x1712a9d8…d1fd` | market · warbond · cosmetic · achievement |
| Hero | `0xe51bd7ed…ab1c` | hero (mint_hero / apply_xp / set_image) |
| Gear Market | `0x540d5442…c0c0` | gearmarket (list / buy / delist) |

> ⚠️ Secrets — admin-cap private keys and `FR0_ADMIN_SECRET` — are **never** committed; they live only in `.env` / host environment variables.

## 🎮 Controls

`WASD` move · `Mouse` look · `LMB` attack · `Tab` weapon · `B` build · `G` summon · `K` skills · `O` gear · `M` market · `Enter` chat · `Alt` cursor mode

## 📄 License

All rights reserved © FR0. (License TBD.)
