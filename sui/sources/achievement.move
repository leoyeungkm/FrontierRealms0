/// FR0 成就徽章 —— soulbound（只有 `key`、沒有 `store` → 不可轉移/交易），
/// 由遊戲伺服器持有的 `MintCap` 頒發 = 戰績由權威端認證，防偽造。
module fr0::achievement;

use std::string::{Self, String};
use sui::display;
use sui::package;
use sui::event;

/// 成就徽章（綁定玩家，永久）
public struct Achievement has key {
    id: UID,
    kind: String,    // first_blood | centurion | keep_destroyer | giant_slayer ...
    label: String,   // 顯示名稱
    value: u64,      // 數值（例如累計擊殺數）
    epoch: u64,      // 頒發時的 epoch
}

/// 鑄造權杖：部署後轉給遊戲伺服器錢包 → 只有伺服器能頒發成就
public struct MintCap has key, store { id: UID }

public struct ACHIEVEMENT has drop {}

public struct AchievementAwarded has copy, drop {
    id: ID,
    kind: String,
    recipient: address,
    value: u64,
}

fun init(otw: ACHIEVEMENT, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    let mut disp = display::new<Achievement>(&publisher, ctx);
    disp.add(string::utf8(b"name"), string::utf8(b"{label}"));
    disp.add(string::utf8(b"description"), string::utf8(b"FR0 achievement - value {value}"));
    disp.add(string::utf8(b"project_url"), string::utf8(b"https://github.com/"));
    disp.update_version();
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(disp, ctx.sender());
    // MintCap 給部署者（之後手動轉給伺服器錢包）
    transfer::public_transfer(MintCap { id: object::new(ctx) }, ctx.sender());
}

/// 頒發成就（需要 MintCap = 只有伺服器能呼叫）。soulbound：玩家收到後無法再轉出。
public fun award(
    _cap: &MintCap,
    recipient: address,
    kind: vector<u8>,
    label: vector<u8>,
    value: u64,
    ctx: &mut TxContext,
) {
    let a = Achievement {
        id: object::new(ctx),
        kind: string::utf8(kind),
        label: string::utf8(label),
        value,
        epoch: ctx.epoch(),
    };
    event::emit(AchievementAwarded {
        id: object::id(&a),
        kind: a.kind,
        recipient,
        value,
    });
    // 用 transfer（非 public_transfer）+ 無 store → 收件者無法再轉移 = soulbound
    transfer::transfer(a, recipient);
}

public fun kind(a: &Achievement): String { a.kind }
public fun value(a: &Achievement): u64 { a.value }
