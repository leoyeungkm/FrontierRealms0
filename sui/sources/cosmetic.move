/// FR0 外觀 NFT —— 玩家真正擁有的裝備外觀（頭/身/手/腳/披風/武器皮膚）。
/// `key + store` = 可轉移、可在 Kiosk 交易；recolor 展示 Sui 可變物件（動態 NFT）。
module fr0::cosmetic;

use std::string::{Self, String};
use sui::display;
use sui::package;
use sui::event;

/// 沒有染色的哨兵值（對應遊戲內 appearance.tint = null）
const NO_TINT: u32 = 0xFFFFFFFF;

/// 一件外觀（對應遊戲 appearance 的某個 gear 欄位）
public struct Cosmetic has key, store {
    id: UID,
    slot: String,        // head | body | arms | legs | cape | weapon
    variant: String,     // knight | barbarian | rogue | sword | axe | hood ...
    tint: u32,           // 0xRRGGBB；NO_TINT = 原色
    name: String,
    image_url: String,   // Walrus 預覽圖（角色實際 render）的 aggregator URL
    walrus_blob: String, // Walrus blobId：完整造型 loadout 設定（去中心化儲存）
    rarity: u8,          // 0 普通 / 1 稀有 / 2 史詩 / 3 傳說
}

/// One-Time-Witness：建立 Publisher + Display
public struct COSMETIC has drop {}

public struct CosmeticMinted has copy, drop {
    id: ID,
    slot: String,
    variant: String,
    owner: address,
}

fun init(otw: COSMETIC, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    // Display：讓錢包 / 瀏覽器正確顯示外觀卡
    let mut disp = display::new<Cosmetic>(&publisher, ctx);
    disp.add(string::utf8(b"name"), string::utf8(b"{name}"));
    disp.add(string::utf8(b"description"), string::utf8(b"FR0 cosmetic - {variant} {slot}"));
    disp.add(string::utf8(b"image_url"), string::utf8(b"{image_url}"));
    disp.add(string::utf8(b"project_url"), string::utf8(b"https://github.com/"));
    disp.update_version();
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(disp, ctx.sender());
}

/// 公開鑄造（Hackathon demo：玩家自助鑄造一件外觀並收到自己錢包）
public entry fun mint(
    slot: vector<u8>,
    variant: vector<u8>,
    tint: u32,
    name: vector<u8>,
    image_url: vector<u8>,
    walrus_blob: vector<u8>,
    rarity: u8,
    ctx: &mut TxContext,
) {
    let c = Cosmetic {
        id: object::new(ctx),
        slot: string::utf8(slot),
        variant: string::utf8(variant),
        tint,
        name: string::utf8(name),
        image_url: string::utf8(image_url),
        walrus_blob: string::utf8(walrus_blob),
        rarity,
    };
    event::emit(CosmeticMinted {
        id: object::id(&c),
        slot: c.slot,
        variant: c.variant,
        owner: ctx.sender(),
    });
    transfer::public_transfer(c, ctx.sender());
}

/// 動態 NFT：重新染色 —— 你的裝備會隨你改變（展示 Sui 可變物件）
public entry fun recolor(c: &mut Cosmetic, tint: u32) {
    c.tint = tint;
}

// ── 讀取器（server ownership 驗證 / client 顯示）─────────────
public fun slot(c: &Cosmetic): String { c.slot }
public fun variant(c: &Cosmetic): String { c.variant }
public fun tint(c: &Cosmetic): u32 { c.tint }
public fun rarity(c: &Cosmetic): u8 { c.rarity }
public fun walrus_blob(c: &Cosmetic): String { c.walrus_blob }
public fun no_tint(): u32 { NO_TINT }
