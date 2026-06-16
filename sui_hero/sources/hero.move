/// FR0 Hero —— 玩家的角色（owned，可在 NFT 市場買賣）。只存「身分 + 等級進度」。
/// 造形由另外鑄造的 Gear(cosmetic, 主 package)逐件裝備而成；Hero 本身不存造形。
/// 升級用「server 簽章」：server 簽 (hero_id, amount, nonce)，玩家送交易、合約 ed25519 驗章
/// 才加經驗 → 既可自由交易、又防止玩家自行改數值（作弊）。
module fr0::hero;

use std::string::{Self, String};
use sui::display;
use sui::package;
use sui::ed25519;
use sui::bcs;
use sui::event;

const MAX_LEVEL: u64 = 40;

const EBadNation: u64 = 1;
const EBadNonce: u64 = 2;
const EBadSig: u64 = 3;

public struct Hero has key, store {
    id: UID,
    name: String,
    nation: u8,          // 0=Minas 1=Calaadia
    level: u64,          // 1..=40
    xp: u64,
    last_nonce: u64,     // 防重放：每次升級 nonce 必須遞增
    image_url: String,   // Walrus 造形預覽圖（NFT 市場 Display 用）
}

/// 共享設定：server(oracle)的 ed25519 公鑰（驗證升級簽章）
public struct Config has key { id: UID, server_pubkey: vector<u8> }
public struct AdminCap has key, store { id: UID }

/// OTW：建立 Publisher + Display
public struct HERO has drop {}

public struct HeroMinted has copy, drop { id: ID, owner: address, nation: u8 }
public struct HeroLeveled has copy, drop { id: ID, level: u64, xp: u64 }

fun init(otw: HERO, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    let mut disp = display::new<Hero>(&publisher, ctx);
    disp.add(string::utf8(b"name"), string::utf8(b"{name} - Lv {level}"));
    disp.add(string::utf8(b"description"), string::utf8(b"FR0 Hero - Frontier Realms 0"));
    disp.add(string::utf8(b"image_url"), string::utf8(b"{image_url}"));
    disp.update_version();
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(disp, ctx.sender());
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    transfer::share_object(Config { id: object::new(ctx), server_pubkey: vector::empty() });
}

/// admin 設定 server 公鑰（32 bytes 原始 ed25519 公鑰）
public entry fun set_server_pubkey(_cap: &AdminCap, cfg: &mut Config, pk: vector<u8>) {
    cfg.server_pubkey = pk;
}

/// 建立角色 → 轉給建立者（owned、可交易）
public entry fun mint_hero(name: vector<u8>, nation: u8, image_url: vector<u8>, ctx: &mut TxContext) {
    assert!(nation < 2, EBadNation);
    let h = Hero {
        id: object::new(ctx),
        name: string::utf8(name), nation, level: 1, xp: 0, last_nonce: 0,
        image_url: string::utf8(image_url),
    };
    event::emit(HeroMinted { id: object::id(&h), owner: ctx.sender(), nation });
    transfer::public_transfer(h, ctx.sender());
}

/// server 簽章升級：msg = bcs(hero_id) ++ bcs(amount) ++ bcs(nonce)
public entry fun apply_xp(cfg: &Config, h: &mut Hero, amount: u64, nonce: u64, sig: vector<u8>) {
    assert!(nonce > h.last_nonce, EBadNonce);
    let mut msg = bcs::to_bytes(&object::id(h));
    vector::append(&mut msg, bcs::to_bytes(&amount));
    vector::append(&mut msg, bcs::to_bytes(&nonce));
    assert!(ed25519::ed25519_verify(&sig, &cfg.server_pubkey, &msg), EBadSig);
    h.xp = h.xp + amount;
    h.last_nonce = nonce;
    h.level = level_for_xp(h.xp);
    event::emit(HeroLeveled { id: object::id(h), level: h.level, xp: h.xp });
}

/// 擁有者更新造形預覽圖（換裝後同步市場顯示；owned → 只有本人能動）
public entry fun set_image(h: &mut Hero, image_url: vector<u8>) {
    h.image_url = string::utf8(image_url);
}

/// 升到 (lv+1) 所需累積 XP = 50 * lv * (lv+1)
fun level_for_xp(xp: u64): u64 {
    let mut lv = 1;
    while (lv < MAX_LEVEL) {
        if (xp >= 50 * lv * (lv + 1)) { lv = lv + 1; } else { break };
    };
    lv
}

// ── 讀取 ──
public fun level(h: &Hero): u64 { h.level }
public fun xp(h: &Hero): u64 { h.xp }
public fun nation(h: &Hero): u8 { h.nation }
public fun name(h: &Hero): String { h.name }
public fun max_level(): u64 { MAX_LEVEL }
