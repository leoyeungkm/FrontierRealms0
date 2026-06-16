import { Room, Client } from "@colyseus/core";
import { Player, Enemy, MyRoomState } from "./schema/MyRoomState";
import { suiEnabled, verifyLogin, verifyCosmetics } from "../sui/verify";
import { marketEnabled, resolveMarket, openMarket, currentMarketId, ensureFreshMarket } from "../sui/admin";
import { heroEnabled, signXp, ensureServerPubkey } from "../sui/hero";

const DURATION_LOBBY     = 7 * 1000;
const DURATION_COUNTDOWN = 3 * 1000;
const DURATION_PLAY      = 120 * 1000;
const ROUND_DURATION     = DURATION_LOBBY + DURATION_COUNTDOWN + DURATION_PLAY;

const ENEMY_SPEED       = 2.8;
const ENEMY_ATK_RANGE   = 2.2;
const ENEMY_ATK_DAMAGE  = 10;
const ENEMY_ATK_CD      = 1500;
const PLAYER_ATK_RANGE  = 4.5;
const PLAYER_ATK_DAMAGE = 35;
const ENEMY_AI_INTERVAL = 100;
const ENEMY_BROADCAST_INTERVAL = 100;

// 測試模式：持續滴灌生成（不再一波波）
const TRICKLE_INTERVAL = 3500;   // 每隊補兵間隔 (ms)
const TRICKLE_CAP      = 12;     // 每隊同時在場上限
const PLAYER_KEEP_ATK_DAMAGE = 20;  // 玩家直接攻擊主堡傷害
const PLAYER_KEEP_ATK_RANGE  = 6;   // 玩家攻擊主堡距離
const KEEP_DEATH_DAMAGE = 50;   // 玩家死亡扣主堡血
const KEEP_REACH_DAMAGE = 30;   // 小兵抵達主堡扣血
const KEEP_ATK_DAMAGE   = 15;   // 小兵攻擊主堡每次傷害
const KEEP_ATK_CD       = 2000; // 小兵攻主堡 CD (ms)
const KEEP_WAVE_REGEN   = 80;   // 波次清除回血
const AGGRO_RANGE       = 10;

// 主堡火球塔（自動攻擊射程內敵方小兵）
const KEEP_FIRE_RANGE  = 22;    // 索敵射程 (m)
const KEEP_FIRE_CD     = 2500;  // 發射間隔 (ms)
const KEEP_FIRE_DMG    = 50;    // 命中傷害
const KEEP_FIRE_SPLASH = 3;     // 濺射半徑 (m)
const KEEP_FIRE_FLIGHT = 800;   // 飛行時間 (ms)

// 兩邊主堡位置（對應客戶端 buildCastle，對稱於 z=0）
const KEEP1_Z =  50;   // 藍方主堡（南）
const KEEP2_Z = -50;   // 紅方主堡（北）

// 水晶礦位置（對應客戶端 CRYSTAL_POSITIONS）：小兵繞行的障礙物
// 佈局：兩座城堡旁各一組 + 地圖中央一組
const CRYSTAL_OBSTACLES: [number, number][] = [
  [-8,  38], [8,  38],            // 藍堡旁
  [-8, -38], [8, -38],            // 紅堡旁
  [-5, 0], [5, 0], [0, 6],        // 中央（三路交會處）
];
const CRYSTAL_BLOCK_R = 1.7;   // 阻擋半徑

export class MyRoom extends Room<MyRoomState> {
  seatReservationTime = 30;

  private objectState: any = {};
  private activeRound: number = undefined;
  private _roundStartedAt = 0;   // 本場開始時的 server 時間 → tick 顯示「本場經過」而非 server 總運行時間
  private enemyCounter: number = 0;
  private enemyAtkTimers: Map<string, number> = new Map();
  private enemyKeepAtkTimers: Map<string, number> = new Map();
  private enemyAtKeep: Set<string> = new Set();
  // 每隻小兵的路徑點鏈（三線：中/左/右，含進出城門的中線對齊點）
  private enemyWaypoints: Map<string, [number, number][]> = new Map();
  // 主堡火球塔冷卻 [藍堡, 紅堡]
  private keepFireTimers: number[] = [0, 0];
  // 小兵吹飛狀態（FEZ knockback：短暫飛行位移，期間不行動）
  private enemyKnockbacks: Map<string, { vx: number; vz: number; t: number }> = new Map();
  // 持續生成
  private spawnAccum = 0;
  private laneRotor  = 0;
  private enemyBroadcastTimer: number = 0;
  private keepDestroyed1 = false;
  private keepDestroyed2 = false;
  private playerSummons: Map<string, { type: string; maxHp: number }> = new Map();
  private appearances: Map<string, any> = new Map();   // sid → 角色外觀（client 自定）
  private playerBlocks: Set<string> = new Set();        // 格擋中的玩家（盾牌右鍵）
  private playerSuiAddr: Map<string, string> = new Map(); // sid → 已驗證的 Sui 地址
  private playerChar: Map<string, string> = new Map();    // sid → 角色 NFT object id（升級用）
  // 玩家建造的建築（塔/方尖碑）：同步給所有人、新加入者補發。team = 塔的歸屬陣營
  private buildings: { sid: string; type: string; x: number; z: number; team: number }[] = [];
  private playerNames: Map<string, string> = new Map();   // sid → 角色名（遠端名牌顯示用）
  private playerAddr: Map<string, string> = new Map();    // sid → 宣稱錢包地址（防同帳號雙開用）

  /** 鏈上 ownership 驗證：appearance 第 9 欄帶 { a:地址, c:{slot:objectId} }。
   *  用「已驗證綁定」的地址（非 client 宣稱）查鏈，確認 NFT 真為該玩家持有，
   *  通過的 slot 廣播成 gearVerified → 其他人看到「🔗 已驗證持有」標記。 */
  private async verifyGearOnChain(client: Client, data: any) {
    if (!suiEnabled() || !Array.isArray(data)) return;
    const chain = data[8];
    if (!chain || !chain.c) return;
    // 優先用「簽章驗身綁定」的地址（錢包）；zkLogin 無簽章 → 退用宣稱地址。
    // 無論哪種，verifyCosmetics 都查鏈確認物件「真的由該地址持有」（核心防作弊）。
    const bound = this.playerSuiAddr.get(client.sessionId) || chain.a;
    if (!bound) return;
    // 造型 NFT：slot="loadout"、variant=model(data[0])；逐件 NFT：各 slot 對應變體
    const expect = { loadout: data[0], head: data[3], body: data[4], arms: data[5], legs: data[6], cape: data[7] };
    const verified = await verifyCosmetics(bound, chain.c, expect as any);
    this.broadcast('gearVerified', [client.sessionId, verified]);
  }

  /** 盾牌格擋減傷：格擋中且攻擊來自面向前方 ~140° 錐 → 傷害 25%、硬直降級 */
  private applyBlock(targetSid: string, target: any, srcX: number, srcZ: number, dmg: number) {
    if (!this.playerBlocks.has(targetSid)) return { dmg, blocked: false };
    const tx = srcX - target.x, tz = srcZ - target.z;
    const len = Math.sqrt(tx * tx + tz * tz) || 1;
    const dot = (tx / len) * Math.sin(target.angleY) + (tz / len) * Math.cos(target.angleY);
    if (dot < 0.34) return { dmg, blocked: false };
    return { dmg: Math.max(1, Math.round(dmg * 0.25)), blocked: true };
  }

  onCreate(options: any) {
    this.maxClients = options.maxClients || 50;
    this.autoDispose = false;   // 持續維持同一個場（round）：空場也不銷毀，玩家都加入同一場
    ensureServerPubkey();       // 啟動時把 server 公鑰寫進 Hero Config（升級驗章用）
    this.setMetadata({ t1: 0, t2: 0, market: currentMarketId() }).catch(() => {});   // 大廳戰況條(t1/t2)＋世界地圖 warbond(market)：room 一啟動就帶上，未入場也讀得到
    this.setState(new MyRoomState());
    this.clock.start();
    ensureFreshMarket().then(() => this.syncMeta());   // 啟動時若 .env 市場已結算 → 開下一場，並同步 metadata 給世界地圖 warbond

    // Round tick (every 1s)：測試模式 — 只開場一次，之後持續戰鬥不重置
    this.clock.setInterval(() => {
      const serverTime = this.clock.elapsedTime;
      if (this.activeRound === undefined) {
        this.activeRound = 1;
        this.onRoundStart(1);
      }
      this.broadcast('tick', Math.max(0, serverTime - this._roundStartedAt));   // 本場經過時間（每場歸零，非 server 總運行時間）
    }, 1000);

    // Enemy AI + broadcast
    this.clock.setInterval(() => {
      this.updateEnemies();
      this.updateKeepTurrets();
      this.updateTrickleSpawn();
      this.enemyBroadcastTimer += ENEMY_AI_INTERVAL;
      if (this.enemyBroadcastTimer >= ENEMY_BROADCAST_INTERVAL) {
        this.enemyBroadcastTimer = 0;
        this.broadcastEnemies();
      }
    }, ENEMY_AI_INTERVAL);

    // ── Messages ──────────────────────────────────────────────

    this.onMessage("updatePos", (client, msg) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.x = msg[0]; player.y = msg[1]; player.z = msg[2];
      player.angleY = msg[3]; player.animX = msg[4]; player.animZ = msg[5];
      this.broadcast('remotePos', [client.sessionId, msg[0], msg[1], msg[2], msg[3], player.team, player.hp], { except: client });
    });

    this.onMessage("towerHit", (client, msg) => {
      const [enemyId, damage] = msg;
      const attacker = this.state.players.get(client.sessionId);
      const enemy = this.state.enemies.get(String(enemyId));
      if (!attacker || !enemy || !enemy.alive) return;
      if (enemy.team === attacker.team) return; // 不打友方小兵
      enemy.hp = Math.max(0, enemy.hp - damage);
      if (enemy.hp <= 0) this.killEnemy(String(enemyId), enemy);
    });

    this.onMessage("animStart", (client, msg) => {
      this.broadcast("animStart", [client.sessionId, msg], { except: client });
    });

    this.onMessage("playerAttack", (client, msg) => {
      const attacker = this.state.players.get(client.sessionId);
      if (!attacker || !attacker.alive) return;
      const px = msg[0], pz = msg[2];

      // 攻擊小兵
      this.state.enemies.forEach((enemy, enemyId) => {
        if (!enemy.alive || enemy.team === attacker.team) return;
        const dx = enemy.x - px, dz = enemy.z - pz;
        if (Math.sqrt(dx*dx + dz*dz) <= PLAYER_ATK_RANGE) {
          enemy.hp -= PLAYER_ATK_DAMAGE + Math.floor(Math.random() * 10);
          if (enemy.hp <= 0) this.killEnemy(enemyId, enemy);
        }
      });

      // 攻擊對方主堡
      const enemyKeepZ = attacker.team === 1 ? KEEP2_Z : KEEP1_Z;
      const keepTeam   = attacker.team === 1 ? 2 : 1;
      const dxKeep = px - 0, dzKeep = pz - enemyKeepZ;
      if (Math.sqrt(dxKeep*dxKeep + dzKeep*dzKeep) <= PLAYER_KEEP_ATK_RANGE) {
        if (keepTeam === 1) {
          this.state.keepHp1 = Math.max(0, this.state.keepHp1 - PLAYER_KEEP_ATK_DAMAGE);
          this.broadcast('keepUpdate', [1, this.state.keepHp1]);
          this.checkKeepDestroyed(1);
        } else {
          this.state.keepHp2 = Math.max(0, this.state.keepHp2 - PLAYER_KEEP_ATK_DAMAGE);
          this.broadcast('keepUpdate', [2, this.state.keepHp2]);
          this.checkKeepDestroyed(2);
        }
      }

      // PvP：攻擊對方陣營玩家
      this.state.players.forEach((target, targetSid) => {
        if (targetSid === client.sessionId) return;
        if (target.team === attacker.team || !target.alive) return;
        const dx = target.x - px, dz = target.z - pz;
        if (Math.sqrt(dx*dx + dz*dz) > PLAYER_ATK_RANGE) return;
        // 跳躍 i-frame：animX=0 表示空中，擋物理攻擊
        if (target.animX === 0) return;

        const rawDmg = PLAYER_ATK_DAMAGE + Math.floor(Math.random() * 10);
        const blk = this.applyBlock(targetSid, target, attacker.x, attacker.z, rawDmg);
        const dmg = blk.dmg;
        target.hp = Math.max(0, target.hp - dmg);
        const tc = this.clients.find(c => c.sessionId === targetSid);
        const pvpLen = Math.sqrt((target.x-attacker.x)**2 + (target.z-attacker.z)**2) || 1;
        const pvpKbX = (target.x - attacker.x) / pvpLen;
        const pvpKbZ = (target.z - attacker.z) / pvpLen;
        if (tc) tc.send('playerDamage', [dmg, 'flinch_short', pvpKbX, pvpKbZ, blk.blocked ? 1 : 0]);
        this.broadcast('playerHpUpdate', [targetSid, target.hp], { except: tc });

        if (target.hp <= 0 && target.alive) {
          target.alive = false;
          this.broadcast('playerDeath', [targetSid, pvpKbX, pvpKbZ]);   // 帶擊殺方向（屍體拋飛用）
          if (target.team === 1) {
            this.state.keepHp1 = Math.max(0, this.state.keepHp1 - KEEP_DEATH_DAMAGE);
            this.broadcast('keepUpdate', [1, this.state.keepHp1]);
            this.checkKeepDestroyed(1);
          } else {
            this.state.keepHp2 = Math.max(0, this.state.keepHp2 - KEEP_DEATH_DAMAGE);
            this.broadcast('keepUpdate', [2, this.state.keepHp2]);
            this.checkKeepDestroyed(2);
          }
          const pTeam = target.team;
          this.clock.setTimeout(() => {
            const p = this.state.players.get(targetSid);
            if (!p) return;
            p.hp = 100; p.alive = true;
            p.x = (Math.random() - 0.5) * 6; p.y = 3;
            p.z = pTeam === 1 ? 47 : -47;
            this.playerSummons.delete(targetSid);
            this.broadcast('playerRespawn', [targetSid, p.x, p.y, p.z]);
          }, 5000);
        }
      });
    });

    // ── Warrior skill hits on players ────────────────────────
    this.onMessage("skillHit", (client, msg) => {
      const [skillId, targetSid, kbX, kbZ] = msg;
      const attacker = this.state.players.get(client.sessionId);
      const target   = this.state.players.get(String(targetSid));
      if (!attacker || !attacker.alive || !target || !target.alive) return;
      if (target.team === attacker.team) return;

      // 伺服器端距離驗證（最大 10m 寬容）
      const dx = target.x - attacker.x, dz = target.z - attacker.z;
      if (Math.sqrt(dx*dx + dz*dz) > 10) return;

      const SKILL_CONFIG: Record<string, { dmg: number; hitstun: string }> = {
        shield_bash:    { dmg: 150, hitstun: 'stun' },
        tackle:         { dmg:  80, hitstun: 'knockback' },
        smash:          { dmg: 100, hitstun: 'flinch' },
        heavySmash:     { dmg: 200, hitstun: 'flinch' },
        cleave:         { dmg: 220, hitstun: 'flinch' },
        lanceSweep:     { dmg: 130, hitstun: 'flinch' },
        force_impact:   { dmg: 130, hitstun: 'knockback' },
        sonic_boom:     { dmg: 110, hitstun: 'flinch' },
      };
      const cfg = SKILL_CONFIG[String(skillId)];
      if (!cfg) return;

      const atkP = this.state.players.get(client.sessionId);
      const sblk = this.applyBlock(String(targetSid), target, atkP ? atkP.x : target.x, atkP ? atkP.z : target.z, cfg.dmg);
      target.hp = Math.max(0, target.hp - sblk.dmg);
      const tc = this.clients.find(c => c.sessionId === String(targetSid));
      // 格擋成功：硬直降級為輕推（盾吃下了大部分衝擊）
      if (tc) tc.send('playerDamage', [sblk.dmg, sblk.blocked ? 'flinch_short' : cfg.hitstun, Number(kbX), Number(kbZ), sblk.blocked ? 1 : 0]);
      this.broadcast('playerHpUpdate', [String(targetSid), target.hp], { except: tc });

      if (target.hp <= 0 && target.alive) {
        target.alive = false;
        // skillHit 擊殺：帶擊退方向，knockback/stun 技能的擊殺屍體飛更遠
        const pw = cfg.hitstun === 'knockback' ? 1.6 : 1.0;
        this.broadcast('playerDeath', [String(targetSid), Number(kbX) * pw, Number(kbZ) * pw]);
        const side = target.team;
        if (side === 1) {
          this.state.keepHp1 = Math.max(0, this.state.keepHp1 - KEEP_DEATH_DAMAGE);
          this.broadcast('keepUpdate', [1, this.state.keepHp1]);
          this.checkKeepDestroyed(1);
        } else {
          this.state.keepHp2 = Math.max(0, this.state.keepHp2 - KEEP_DEATH_DAMAGE);
          this.broadcast('keepUpdate', [2, this.state.keepHp2]);
          this.checkKeepDestroyed(2);
        }
        const pTeam = target.team;
        this.clock.setTimeout(() => {
          const p = this.state.players.get(String(targetSid));
          if (!p) return;
          p.hp = 100; p.alive = true;
          p.x = (Math.random() - 0.5) * 8; p.y = 1;
          p.z = pTeam === 1 ? 40 : -40;
          this.playerSummons.delete(String(targetSid));
          this.broadcast('playerRespawn', [String(targetSid), p.x, p.y, p.z]);
        }, 5000);
      }
    });

    // 範圍吹飛：knockback 技能（Force Impact / Crumble Storm / Slam / Big Step）
    this.onMessage("aoeKnockback", (client, msg) => {
      const attacker = this.state.players.get(client.sessionId);
      if (!attacker || !attacker.alive) return;
      const px = Number(msg[0]), pz = Number(msg[1]);
      const radius = Math.min(Number(msg[2]) || 4, 9);
      const power  = Math.min(Number(msg[3]) || 4, 9);
      // 防作弊：施放點不可離玩家太遠
      if (Math.hypot(px - attacker.x, pz - attacker.z) > 16) return;
      this.state.enemies.forEach((e, id) => {
        if (!e.alive || e.team === attacker.team) return;
        const dx = e.x - px, dz = e.z - pz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > radius || d < 0.001) return;
        const f = power * (1 - (d / radius) * 0.5);   // 越近吹越遠
        this.enemyKnockbacks.set(id, { vx: (dx / d) * f, vz: (dz / d) * f, t: 0.35 });
      });
    });

    this.onMessage("summonStart", (client, msg) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return;
      const maxHp = Math.min(Number(msg[1]), 800);
      player.hp = maxHp;
      this.playerSummons.set(client.sessionId, { type: String(msg[0]), maxHp });
      this.broadcast('playerSummon', [client.sessionId, String(msg[0]), maxHp]);
    });

    // 建築同步（塔／方尖碑）：記錄 + 廣播給所有人（含自己；team 由 server 權威決定）
    this.onMessage('build', (client, msg) => {
      if (!Array.isArray(msg)) return;
      const type = String(msg[0]);
      if (type !== 'tower' && type !== 'obelisk') return;
      const x = Number(msg[1]), z = Number(msg[2]);
      if (!isFinite(x) || !isFinite(z)) return;
      const p = this.state.players.get(client.sessionId);
      const team = p ? p.team : 1;
      this.buildings.push({ sid: client.sessionId, type, x, z, team });
      if (this.buildings.length > 400) this.buildings.shift();
      this.broadcast('build', [client.sessionId, type, x, z, team]);
    });

    this.onMessage("summonAttack", (client, msg) => {
      const attacker = this.state.players.get(client.sessionId);
      if (!attacker || !attacker.alive) return;
      const px     = Number(msg[0]), pz = Number(msg[1]);
      const damage = Math.min(Number(msg[2]), 250);
      const range  = Math.min(Number(msg[3]), 8);
      this.state.enemies.forEach((enemy, enemyId) => {
        if (!enemy.alive || enemy.team === attacker.team) return;
        const dx = enemy.x - px, dz = enemy.z - pz;
        if (Math.sqrt(dx*dx + dz*dz) <= range) {
          enemy.hp -= damage;
          if (enemy.hp <= 0) this.killEnemy(enemyId, enemy);
        }
      });

      // 攻城（FEZ 巨人本職）：砲擊/踐踏命中敵方主堡範圍 → 扣主堡血
      const enemyKeepZ = attacker.team === 1 ? KEEP2_Z : KEEP1_Z;
      const keepTeam   = attacker.team === 1 ? 2 : 1;
      if (Math.hypot(px, pz - enemyKeepZ) <= range + 5) {
        const siege = Math.min(80, Math.round(damage * 0.5));
        if (keepTeam === 1) {
          this.state.keepHp1 = Math.max(0, this.state.keepHp1 - siege);
          this.broadcast('keepUpdate', [1, this.state.keepHp1]);
          this.checkKeepDestroyed(1);
        } else {
          this.state.keepHp2 = Math.max(0, this.state.keepHp2 - siege);
          this.broadcast('keepUpdate', [2, this.state.keepHp2]);
          this.checkKeepDestroyed(2);
        }
      }
    });

    // 盾牌格擋狀態（右鍵按住/放開）
    this.onMessage('blockState', (client: Client, on: any) => {
      if (Number(on)) this.playerBlocks.add(client.sessionId);
      else this.playerBlocks.delete(client.sessionId);
    });

    // 延遲量測：client 送 ping(時戳) → 原樣回 pong，client 算 RTT 顯示 ms
    this.onMessage('ping', (client, t) => client.send('pong', t));

    // 聊天：廣播給全場（帶角色名 + 隊伍色）
    this.onMessage('chat', (client, text) => {
      const msg = String(text || '').slice(0, 120).trim();
      if (!msg) return;
      const nm = this.playerNames.get(client.sessionId) || client.sessionId.slice(-4);
      const p = this.state.players.get(client.sessionId);
      this.broadcast('chat', [nm, msg, p ? p.team : 0]);
    });

    // Sui 登入：驗證個人訊息簽章 → 綁定 sessionId ↔ 地址（防偽造 ownership）
    this.onMessage('suiAuth', async (client: Client, data: any) => {
      if (!suiEnabled() || !Array.isArray(data)) return;
      const [addr, sig] = data;
      if (await verifyLogin(String(addr), String(sig), client.sessionId)) {
        // 防多開：同一帳號（地址）若已有其他連線 → 踢掉舊連線（保留最新登入）
        const addrStr = String(addr);
        this.playerSuiAddr.forEach((a, sid) => {
          if (a === addrStr && sid !== client.sessionId) {
            const old = this.clients.find(c => c.sessionId === sid);
            if (old) { old.send('kicked', 'multilogin'); old.leave(4001); }
            this.playerSuiAddr.delete(sid);
          }
        });
        this.playerSuiAddr.set(client.sessionId, addrStr);
        client.send('suiAuthOk', addr);
      } else {
        client.send('suiAuthFail', null);
      }
    });

    // 角色外觀：存快照（新玩家加入時補發）+ relay 給其他人 + 鏈上 ownership 驗證
    this.onMessage('appearance', (client: Client, data: any) => {
      this.appearances.set(client.sessionId, data);
      this.broadcast('appearance', [client.sessionId, data], { except: client });
      this.verifyGearOnChain(client, data);
    });

    // 角色 NFT id：玩家加入時送來，作為結算授權升級的對象
    this.onMessage('character', (client: Client, id: any) => {
      if (!id) return;
      const idStr = String(id);
      // 防雙開：同一角色 NFT 不可同時兩個連線（會重複結算/佔位）→ 踢掉舊連線
      this.playerChar.forEach((cid, sid) => {
        if (cid === idStr && sid !== client.sessionId) {
          const old = this.clients.find(c => c.sessionId === sid);
          if (old) { old.send('kicked', 'multilogin'); old.leave(4001); }
          this.playerChar.delete(sid);
        }
      });
      this.playerChar.set(client.sessionId, idStr);
    });

    // 角色名字：relay 給其他人（遠端玩家名牌顯示真名，而非 sessionId 片段）
    this.onMessage('pname', (client: Client, name: any) => {
      const nm = String(name || '').slice(0, 24);
      this.playerNames.set(client.sessionId, nm);
      this.broadcast('pname', [client.sessionId, nm], { except: client });
    });

    // 防雙開（不靠簽章）：同一錢包地址只能有一個連線 → 進場宣稱地址，撞到就踢舊連線
    this.onMessage('whoami', (client: Client, addr: any) => {
      const a = String(addr || '');
      if (!a) return;
      this.playerAddr.forEach((pa, sid) => {
        if (pa === a && sid !== client.sessionId) {
          const old = this.clients.find(c => c.sessionId === sid);
          if (old) { old.send('kicked', 'multilogin'); old.leave(4001); }
          this.playerAddr.delete(sid);
        }
      });
      this.playerAddr.set(client.sessionId, a);
    });

    this.onMessage("*", (client: Client, type: any, message: any) => {
      if (type === 'objectOwner:request') {
        const lastState = this.objectState[message];
        if (lastState) client.send(`ou:${message}`, [client.sessionId, lastState]);
        return;
      }
      if (type.indexOf('ou:') === 0) {
        this.objectState[type.split(':')[1]] = message;
      }
      this.broadcast(type, [client.sessionId, message], { except: client });
    });
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!");
    const player = new Player();
    this.setPlayerTeam(player, options?.nation);
    this.state.players.set(client.sessionId, player);
    this.broadcast('playerJoined', [client.sessionId, player.team]);

    // 告知新玩家自己的隊伍
    client.send('yourTeam', player.team);

    // 傳送現有玩家
    const existing: any[] = [];
    this.state.players.forEach((p, sid) => {
      if (sid !== client.sessionId)
        existing.push([sid, p.x, p.y, p.z, p.angleY, p.hp, p.alive ? 1 : 0, p.team]);
    });
    if (existing.length > 0) client.send('existingPlayers', existing);

    // 傳送當前主堡血量
    client.send('keepUpdate', [1, this.state.keepHp1]);
    client.send('keepUpdate', [2, this.state.keepHp2]);

    // 同步「該場」預測市場 ID：讓重入／中途加入的玩家也認得到當前 warbond，
    // 不必等下一波 broadcast。currentMarketId() 即使沒設 ADMIN_SECRET 也會回 env 的 FR0_MARKET_ID。
    const mid = currentMarketId();
    if (mid) client.send('marketNew', mid);

    // 補發目前仍在召喚狀態的玩家（reconnect 後恢復召喚外觀）
    this.playerSummons.forEach((info, sid) => {
      if (sid !== client.sessionId)
        client.send('playerSummon', [sid, info.type, info.maxHp]);
    });

    // 補發現有玩家的角色外觀
    const appAll: any[] = [];
    this.appearances.forEach((a, sid) => {
      if (sid !== client.sessionId) appAll.push([sid, a]);
    });
    if (appAll.length > 0) client.send('appearanceAll', appAll);

    // 傳送當前存活的敵兵（reconnect 後能看到進行中波次的小兵）
    const existingEnemies: any[] = [];
    this.state.enemies.forEach((enemy, eid) => {
      if (enemy.alive)
        existingEnemies.push([eid, enemy.x, enemy.z, enemy.hp, enemy.maxHp, enemy.wave, enemy.team]);
    });
    if (existingEnemies.length > 0) client.send('enemySpawn', existingEnemies);

    // 補發場上已建建築（塔／方尖碑），讓新加入者也看得到別人蓋的
    this.buildings.forEach(b => client.send('build', [b.sid, b.type, b.x, b.z, b.team]));

    // 補發現有玩家的角色名（遠端名牌顯示真名）
    this.playerNames.forEach((nm, sid) => { if (sid !== client.sessionId) client.send('pname', [sid, nm]); });

    this.syncMeta();   // 更新房間 metadata（兩隊人數 → 大廳世界地圖戰況條顯示 Minas ⚔ Calaadia）
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");
    this.state.players.delete(client.sessionId);
    this.playerSummons.delete(client.sessionId);
    this.appearances.delete(client.sessionId);
    this.playerBlocks.delete(client.sessionId);
    this.playerSuiAddr.delete(client.sessionId);
    this.playerChar.delete(client.sessionId);
    this.playerNames.delete(client.sessionId);
    this.playerAddr.delete(client.sessionId);
    this.broadcast('playerLeft', client.sessionId);
    this.syncMeta();
    // 全員離場且已分出勝負 → 重置成乾淨新場（清場/滿血/復活），供下次出征；不在原場硬開下一輪
    if (this.state.players.size === 0 && (this.keepDestroyed1 || this.keepDestroyed2)) {
      this.activeRound = (this.activeRound || 1) + 1;
      this.onRoundStart(this.activeRound);
    }
  }

  onDispose() { console.log("room", this.roomId, "disposing..."); }

  // ── Round / Wave ──────────────────────────────────────────────

  onRoundStart(round: number) {
    this._roundStartedAt = this.clock.elapsedTime;   // 本場開始 → timer 每場從 0 起算
    this.state.players.forEach(player => {
      player.hp = 100; player.alive = true;
    });
    Array.from(this.state.enemies.keys()).forEach((id) => this.state.enemies.delete(id));   // 用 keys 快照刪，避免迭代中修改
    this.enemyAtkTimers.clear();
    this.enemyKeepAtkTimers.clear();
    this.enemyAtKeep.clear();
    this.enemyWaypoints.clear();
    this.enemyKnockbacks.clear();
    this.enemyCounter     = 0;
    this.state.wave       = round;
    this.state.waveActive = false;
    this.state.keepHp1    = this.state.maxKeepHp;
    this.state.keepHp2    = this.state.maxKeepHp;
    this.keepDestroyed1   = false;
    this.keepDestroyed2   = false;
    this.broadcast('keepUpdate', [1, this.state.keepHp1]);
    this.broadcast('keepUpdate', [2, this.state.keepHp2]);
    this.broadcast('roundRestart', round);   // client：收起結算畫面、清場、恢復戰鬥

    this.clock.setTimeout(() => this.spawnWave(round), DURATION_LOBBY + DURATION_COUNTDOWN);
  }

  // 三線地圖：中路 (0,±50)→(0,∓50)；左路 (0,±50)→(-34,0)→(0,∓50)；右路對稱
  // lane 0 = 中路（出生在自家城內，需經城門出來）；lane 1/2 = 左/右（出生在城外）
  // [x, z, jitterX, jitterZ]
  private static RED_LANES:  [number, number, number, number][] =
    [[0, -45.5, 1.0, 1.2], [-6, -40, 3, 2], [6, -40, 3, 2]];
  private static BLUE_LANES: [number, number, number, number][] =
    [[0,  45.5, 1.0, 1.2], [-6,  40, 3, 2], [6,  40, 3, 2]];

  // 路徑點鏈：中路直線（先出自家城門）；側路經 (±34,0) 再到敵方城門 → 城內
  // 城門皆在 x=0 中線（z=±44 牆面留 |x|<2 缺口），對齊中線即可不穿牆
  private buildWaypoints(team: number, laneIdx: number): [number, number][] {
    const s = team === 2 ? 1 : -1;        // 前進方向：紅 +z、藍 -z
    const exitZ = -s * 41;                // 自家城門外
    const gateZ =  s * 41;                // 敵方城門外
    const keepZ =  s * 47;                // 敵方城內（±45 進入 atKeep 停駐）
    if (laneIdx === 0) return [[0, exitZ], [0, keepZ]];
    const lx = laneIdx === 1 ? -34 : 34;
    return [[lx, 0], [0, gateZ], [0, keepZ]];
  }

  /** 生一隻小兵，回傳 spawn data row */
  spawnOne(team: number, laneIdx: number): any[] {
    const lanes = team === 2 ? MyRoom.RED_LANES : MyRoom.BLUE_LANES;
    const [lx, lz, jx, jz] = lanes[laneIdx % lanes.length];
    const id    = `e_${this.enemyCounter++}`;
    const enemy = new Enemy();
    enemy.x     = lx + (Math.random() - 0.5) * 2 * jx;
    enemy.y     = 0;
    enemy.z     = lz + (Math.random() - 0.5) * 2 * jz;
    enemy.hp    = 70;                     // 測試模式：固定血量
    enemy.maxHp = enemy.hp;
    enemy.wave  = this.state.wave;
    enemy.team  = team;
    enemy.alive = true;
    this.state.enemies.set(id, enemy);
    this.enemyAtkTimers.set(id, 0);
    this.enemyWaypoints.set(id, this.buildWaypoints(team, laneIdx % lanes.length));
    return [id, enemy.x, enemy.z, enemy.hp, enemy.maxHp, this.state.wave, team];
  }

  spawnWave(wave: number) {
    // 測試模式：開場每隊 3 隻（三線各一），之後持續滴灌補兵
    this.state.waveActive = true;
    const spawnData: any[] = [];
    for (let i = 0; i < 3; i++) {
      spawnData.push(this.spawnOne(2, i));
      spawnData.push(this.spawnOne(1, i));
    }
    this.broadcast('waveStart', wave);
    this.broadcast('enemySpawn', spawnData);
  }

  /** 持續生成：每 TRICKLE_INTERVAL 每隊補 1 隻（場上 < TRICKLE_CAP 時） */
  updateTrickleSpawn() {
    if (!this.state.waveActive) return;
    this.spawnAccum += ENEMY_AI_INTERVAL;
    if (this.spawnAccum < TRICKLE_INTERVAL) return;
    this.spawnAccum = 0;
    const added: any[] = [];
    for (const team of [1, 2]) {
      let alive = 0;
      this.state.enemies.forEach(e => { if (e.alive && e.team === team) alive++; });
      if (alive >= TRICKLE_CAP) continue;
      added.push(this.spawnOne(team, this.laneRotor++ % 3));
    }
    if (added.length) this.broadcast('enemyAdd', added);
  }

  killEnemy(enemyId: string, enemy: Enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    this.enemyAtKeep.delete(enemyId);
    this.clock.setTimeout(() => {
      if (this.state.enemies.has(enemyId)) this.state.enemies.delete(enemyId);   // 可能已被 onRoundStart 清場 → 先檢查，免 schema warning
      this.enemyAtkTimers.delete(enemyId);
      this.enemyKeepAtkTimers.delete(enemyId);
      this.enemyWaypoints.delete(enemyId);
      this.enemyKnockbacks.delete(enemyId);
    }, 2000);
    this.checkWaveClear();
  }

  checkWaveClear() {
    // 測試模式：持續滴灌生成，不再有「波次清除」（保留函數給 killEnemy 呼叫）
  }

  broadcastEnemies() {
    if (this.state.enemies.size === 0) return;
    const data: any[] = [];
    this.state.enemies.forEach((e, id) => {
      data.push([id, e.x, e.z, e.hp, e.alive ? 1 : 0, e.team]);
    });
    this.broadcast('enemyStates', data);
  }

  // ── Enemy AI ──────────────────────────────────────────────────

  updateEnemies() {
    const dt  = ENEMY_AI_INTERVAL / 1000;
    const now = this.clock.elapsedTime;

    this.state.enemies.forEach((enemy, enemyId) => {
      if (!enemy.alive) return;

      // 吹飛中：強制位移（指數減速），期間不行動
      const kb = this.enemyKnockbacks.get(enemyId);
      if (kb) {
        enemy.x += kb.vx * dt;
        enemy.z += kb.vz * dt;
        kb.vx *= 0.86; kb.vz *= 0.86;
        kb.t -= dt;
        if (kb.t <= 0) this.enemyKnockbacks.delete(enemyId);
        return;
      }

      // 判定是否抵達對方主堡城門，停駐並持續攻擊（LoL 風格）
      const reachedKeep = enemy.team === 2 ? (enemy.z >= 45) : (enemy.z <= -45);
      if (reachedKeep && !this.enemyAtKeep.has(enemyId)) {
        this.enemyAtKeep.add(enemyId);
        this.enemyKeepAtkTimers.set(enemyId, 0);
        this.broadcast('enemyReachedKeep', [enemyId, enemy.team]);
      }
      if (this.enemyAtKeep.has(enemyId)) {
        const lastKeepAtk = this.enemyKeepAtkTimers.get(enemyId) || 0;
        if (now - lastKeepAtk >= KEEP_ATK_CD) {
          this.enemyKeepAtkTimers.set(enemyId, now);
          this.broadcast('enemyAttack', [enemyId, 'keep']);
          if (enemy.team === 2) {
            this.state.keepHp1 = Math.max(0, this.state.keepHp1 - KEEP_ATK_DAMAGE);
            this.broadcast('keepUpdate', [1, this.state.keepHp1]);
            this.checkKeepDestroyed(1);
          } else {
            this.state.keepHp2 = Math.max(0, this.state.keepHp2 - KEEP_ATK_DAMAGE);
            this.broadcast('keepUpdate', [2, this.state.keepHp2]);
            this.checkKeepDestroyed(2);
          }
        }
        return; // 停駐，不移動
      }

      // 找最近對方玩家（AGGRO_RANGE 內）
      let nearestPlayer: Player | null = null;
      let nearestSid    = '';
      let nearestDist   = Infinity;
      this.state.players.forEach((player, sid) => {
        if (!player.alive || player.team === enemy.team) return;
        const dx = player.x - enemy.x, dz = player.z - enemy.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < AGGRO_RANGE && dist < nearestDist) {
          nearestDist = dist; nearestPlayer = player; nearestSid = sid;
        }
      });

      // 找最近對方小兵（AGGRO_RANGE 內）
      let nearestFoe: Enemy | null = null;
      let nearestFoeId  = '';
      let nearestFoeDist = Infinity;
      this.state.enemies.forEach((foe, foeId) => {
        if (foeId === enemyId || !foe.alive || foe.team === enemy.team) return;
        const dx = foe.x - enemy.x, dz = foe.z - enemy.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < AGGRO_RANGE && dist < nearestFoeDist) {
          nearestFoeDist = dist; nearestFoe = foe; nearestFoeId = foeId;
        }
      });

      const lastAtk = this.enemyAtkTimers.get(enemyId) || 0;

      if (nearestPlayer && nearestDist <= ENEMY_ATK_RANGE) {
        // 近戰攻擊對方玩家（優先）
        if (now - lastAtk >= ENEMY_ATK_CD) {
          this.enemyAtkTimers.set(enemyId, now);
          // 跳躍 i-frame：animX=0 表示空中，擋物理攻擊
          if (nearestPlayer.animX === 0) { /* airborne, i-frame */ }
          else {
          this.broadcast('enemyAttack', [enemyId, 'player']);
          const eblk = this.applyBlock(nearestSid, nearestPlayer, enemy.x, enemy.z, ENEMY_ATK_DAMAGE);
          nearestPlayer.hp = Math.max(0, nearestPlayer.hp - eblk.dmg);
          const client = this.clients.find(c => c.sessionId === nearestSid);
          // knockback: 從小兵推向玩家
          const kbLen = Math.sqrt((nearestPlayer.x-enemy.x)**2 + (nearestPlayer.z-enemy.z)**2) || 1;
          const kbX = (nearestPlayer.x - enemy.x) / kbLen;
          const kbZ = (nearestPlayer.z - enemy.z) / kbLen;
          if (client) client.send('playerDamage', [eblk.dmg, 'flinch_short', kbX, kbZ, eblk.blocked ? 1 : 0]);
          this.broadcast('playerHpUpdate', [nearestSid, nearestPlayer.hp], { except: client });

          if (nearestPlayer.hp <= 0 && nearestPlayer.alive) {
            nearestPlayer.alive = false;
            this.broadcast('playerDeath', [nearestSid, kbX, kbZ]);
            if (nearestPlayer.team === 1) {
              this.state.keepHp1 = Math.max(0, this.state.keepHp1 - KEEP_DEATH_DAMAGE);
              this.broadcast('keepUpdate', [1, this.state.keepHp1]);
              this.checkKeepDestroyed(1);
            } else {
              this.state.keepHp2 = Math.max(0, this.state.keepHp2 - KEEP_DEATH_DAMAGE);
              this.broadcast('keepUpdate', [2, this.state.keepHp2]);
              this.checkKeepDestroyed(2);
            }
            const sid = nearestSid;
            const pTeam = nearestPlayer.team;
            this.clock.setTimeout(() => {
              const p = this.state.players.get(sid);
              if (!p) return;
              p.hp = 100; p.alive = true;
              p.x = (Math.random() - 0.5) * 8;
              p.y = 1;
              p.z = pTeam === 1 ? 40 : -40;
              this.playerSummons.delete(sid);
              this.broadcast('playerRespawn', [sid, p.x, p.y, p.z]);
            }, 5000);
          }
          } // end else (i-frame)
        }
      } else if (nearestFoe && nearestFoeDist <= ENEMY_ATK_RANGE) {
        // 近戰攻擊對方小兵
        if (now - lastAtk >= ENEMY_ATK_CD) {
          this.enemyAtkTimers.set(enemyId, now);
          this.broadcast('enemyAttack', [enemyId, 'minion']);
          nearestFoe.hp -= ENEMY_ATK_DAMAGE;
          if (nearestFoe.hp <= 0) this.killEnemy(nearestFoeId, nearestFoe);
        }
      } else {
        // 追擊 aggro 內的敵對目標，否則沿自己線路的路徑點推進
        let tx: number, tz: number;
        if (nearestPlayer)    { tx = nearestPlayer.x; tz = nearestPlayer.z; }
        else if (nearestFoe)  { tx = nearestFoe.x;    tz = nearestFoe.z;    }
        else {
          const wps = this.enemyWaypoints.get(enemyId);
          if (wps && wps.length) {
            // 抵達目前路徑點、或已明顯更接近下一點（追擊後跳過走回頭路）→ 換下一點
            while (wps.length > 1) {
              const d0  = Math.hypot(wps[0][0] - enemy.x, wps[0][1] - enemy.z);
              const d1  = Math.hypot(wps[1][0] - enemy.x, wps[1][1] - enemy.z);
              const seg = Math.hypot(wps[1][0] - wps[0][0], wps[1][1] - wps[0][1]);
              if (d0 < 2.5 || d1 < seg - 1) wps.shift();
              else break;
            }
            tx = wps[0][0]; tz = wps[0][1];
          } else {
            tx = 0; tz = enemy.team === 2 ? KEEP1_Z : KEEP2_Z;
          }
        }
        const dx = tx - enemy.x, dz = tz - enemy.z;
        const len = Math.sqrt(dx*dx + dz*dz);
        if (len > 0.5) {
          enemy.x += (dx / len) * ENEMY_SPEED * dt;
          enemy.z += (dz / len) * ENEMY_SPEED * dt;
        }
      }
    });

    // ── 水晶礦障礙：把走進水晶的小兵推到邊緣（自然滑行繞過）─────
    this.state.enemies.forEach(enemy => {
      if (!enemy.alive) return;
      for (const [cx, cz] of CRYSTAL_OBSTACLES) {
        const dx = enemy.x - cx, dz = enemy.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= CRYSTAL_BLOCK_R * CRYSTAL_BLOCK_R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        enemy.x = cx + (dx / d) * CRYSTAL_BLOCK_R;
        enemy.z = cz + (dz / d) * CRYSTAL_BLOCK_R;
      }
    });

    // ── 同隊士兵分離（server-authoritative）────────────────────
    const SOLDIER_R   = 0.55;
    const SOLDIER_MIN = SOLDIER_R * 2;
    const enemyList: { id: string; e: Enemy }[] = [];
    this.state.enemies.forEach((e, id) => { if (e.alive) enemyList.push({ id, e }); });
    for (let i = 0; i < enemyList.length; i++) {
      for (let j = i + 1; j < enemyList.length; j++) {
        const a = enemyList[i].e, b = enemyList[j].e;
        if (a.team !== b.team) continue; // 只分離同隊，不同隊讓他們自然碰撞
        const sdx = a.x - b.x, sdz = a.z - b.z;
        const distSq = sdx*sdx + sdz*sdz;
        if (distSq >= SOLDIER_MIN * SOLDIER_MIN || distSq < 0.0001) continue;
        const dist = Math.sqrt(distSq);
        const push = (SOLDIER_MIN - dist) * 0.5;
        const nx = sdx / dist, nz = sdz / dist;
        // 城門帶（|z|>42，城牆附近）不做側向推擠，避免被擠進牆裡
        if (!this.enemyAtKeep.has(enemyList[i].id) && Math.abs(a.z) <= 42) { a.x += nx * push; a.z += nz * push; }
        if (!this.enemyAtKeep.has(enemyList[j].id) && Math.abs(b.z) <= 42) { b.x -= nx * push; b.z -= nz * push; }
      }
    }
  }

  // ── 主堡火球塔：自動攻擊射程內最近的敵方小兵 ──────────────────
  updateKeepTurrets() {
    const now = this.clock.elapsedTime;
    const keeps = [
      { team: 1, z: KEEP1_Z, destroyed: this.keepDestroyed1 },  // 藍堡
      { team: 2, z: KEEP2_Z, destroyed: this.keepDestroyed2 },  // 紅堡
    ];
    keeps.forEach((keep, idx) => {
      if (keep.destroyed) return;
      if (now - this.keepFireTimers[idx] < KEEP_FIRE_CD) return;

      // 找射程內最近的敵方小兵
      let best: Enemy | null = null;
      let bestId = '', bestDist = Infinity;
      this.state.enemies.forEach((e, id) => {
        if (!e.alive || e.team === keep.team) return;
        const d = Math.hypot(e.x, e.z - keep.z);
        if (d <= KEEP_FIRE_RANGE && d < bestDist) { best = e; bestId = id; bestDist = d; }
      });
      if (!best) return;

      this.keepFireTimers[idx] = now;
      const lockX = (best as Enemy).x, lockZ = (best as Enemy).z;
      this.broadcast('keepFire', [keep.team, bestId, KEEP_FIRE_FLIGHT]);

      // 飛行時間後在目標當前位置（死亡則用發射時位置）濺射
      this.clock.setTimeout(() => {
        const t = this.state.enemies.get(bestId);
        const cx = t && t.alive ? t.x : lockX;
        const cz = t && t.alive ? t.z : lockZ;
        this.state.enemies.forEach((e, id) => {
          if (!e.alive || e.team === keep.team) return;
          if (Math.hypot(e.x - cx, e.z - cz) <= KEEP_FIRE_SPLASH) {
            e.hp -= KEEP_FIRE_DMG;
            if (e.hp <= 0) this.killEnemy(id, e);
          }
        });
      }, KEEP_FIRE_FLIGHT);
    });
  }

  checkKeepDestroyed(team: number) {
    if (team === 1 && this.state.keepHp1 <= 0 && !this.keepDestroyed1) {
      this.keepDestroyed1 = true;
      this.broadcast('keepDestroyed', 1);  // 藍方主堡被摧毀，紅方(Calaadia=1)勝
      this.resolvePredictionMarket(1);
      this.grantMatchXp(1);
    }
    if (team === 2 && this.state.keepHp2 <= 0 && !this.keepDestroyed2) {
      this.keepDestroyed2 = true;
      this.broadcast('keepDestroyed', 2);  // 紅方主堡被摧毀，藍方(Minas=0)勝
      this.resolvePredictionMarket(0);
      this.grantMatchXp(0);
    }
  }

  /** 預測市場自動結算（server 當 oracle）：勝方上鏈 resolve → 開新市 → 廣播。
   *  即使 resolve 失敗（server 重啟後市場已被結算過＝EResolved）也照常開新一輪市場，避免卡死。 */
  private resolvePredictionMarket(winnerNation: number) {
    if (!marketEnabled()) return;
    const resolvedMarket = currentMarketId();
    (async () => {
      const ok = await resolveMarket(winnerNation);
      if (ok) this.broadcast('marketResolved', [resolvedMarket, winnerNation]);  // 成功才通知 client 兌付
      const next = await openMarket((this.state.wave || 1) + 1);                 // 不論成敗都開新市
      if (next) { this.broadcast('marketNew', next); this.syncMeta(); }          // 切新市 + 更新 metadata（世界地圖同步）
    })();
  }

  /** 回合結束：server 簽 XP 憑證發給各玩家（玩家自行送交易、合約驗章升級）。 */
  private grantMatchXp(winnerNation: number) {
    if (!heroEnabled()) return;
    this.clients.forEach((client: Client) => {
      const heroId = this.playerChar.get(client.sessionId);
      if (!heroId) return;
      const p = this.state.players.get(client.sessionId);
      const nation = p && p.team === 1 ? 0 : 1;                   // team1→Minas(0)、team2→Calaadia(1)
      const amount = 200 + (nation === winnerNation ? 200 : 0);  // 參與 200 +（勝方再 +200）
      const nonce = Date.now() + Math.floor(Math.random() * 1000); // 單調遞增、唯一
      signXp(heroId, amount, nonce).then(sig => { if (sig) client.send('heroXp', { amount, nonce, sig }); });
    });
  }

  // ── Helpers ───────────────────────────────────────────────────

  // 把兩隊即時人數寫進房間 metadata（team1=藍=Minas、team2=紅=Calaadia）
  // 客戶端 getAvailableRooms 讀 metadata.t1/t2 → 世界地圖戰況條顯示交戰雙方人數
  syncMeta() {
    let t1 = 0, t2 = 0;
    this.state.players.forEach(p => { if (p.team === 1) t1++; else if (p.team === 2) t2++; });
    this.setMetadata({ t1, t2, market: currentMarketId() }).catch(() => {});   // market：世界地圖 warbond 同步當前市場
  }

  setPlayerTeam(player: Player, nation?: any) {
    // 按效忠國家分隊：Minas(0)=team1(藍)、Calaadia(1)=team2(紅) —— 選哪國一定替哪國打
    const n = Number(nation);
    if (n === 0 || n === 1) { player.team = n === 1 ? 2 : 1; return; }
    // 無國家資訊（舊客戶端／未選角）→ 退回平衡分配
    let c1 = 0, c2 = 0;
    this.state.players.forEach(p => {
      if (p.team === 1) c1++; else if (p.team === 2) c2++;
    });
    player.team = c1 <= c2 ? 1 : 2;
  }
}
