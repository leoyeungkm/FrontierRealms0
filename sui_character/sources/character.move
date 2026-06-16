/// FR0 Character —— 一人一個的可升級角色（動態 NFT）。
/// 身分(名稱/王國) + 進度(等級/經驗)。等級只影響「技能點」(HP/傷害全員一致 → PvP 平衡)。
/// XP 由 server(持 AdminCap)結算授權加上去，防止 client 自行改數值（作弊）。
/// 採共享物件，讓 server 能更新等級；owner 欄位綁定擁有者，改外觀需本人。
module fr0::character;

use std::string::String;
use sui::event;

const MAX_LEVEL: u64 = 40;

const EBadNation: u64 = 1;
const ENotOwner: u64 = 2;

public struct Character has key {
    id: UID,
    owner: address,
    name: String,
    nation: u8,         // 0=Minas 1=Calaadia
    level: u64,         // 1..=40
    xp: u64,            // 累積經驗
    appearance: String, // 緊湊外觀字串 / Walrus blobId（展示用）
}

/// 持有者 = server（oracle）。只有它能授權加經驗 → 升級。
public struct AdminCap has key, store { id: UID }

public struct CharacterCreated has copy, drop { id: ID, owner: address, nation: u8 }
public struct LeveledUp has copy, drop { id: ID, owner: address, level: u64, xp: u64 }

fun init(ctx: &mut TxContext) {
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

/// 升到 (lv+1) 所需累積 XP = 50 * lv * (lv+1)
///   lv1→2: 100、lv2→3: 300、lv3→4: 600 …（FEZ 式漸增）
fun level_for_xp(xp: u64): u64 {
    let mut lv = 1;
    while (lv < MAX_LEVEL) {
        if (xp >= 50 * lv * (lv + 1)) { lv = lv + 1; } else { break };
    };
    lv
}

/// 建立角色（每位玩家建一次；前端負責不重複建立）→ 共享物件
public entry fun mint_character(name: String, nation: u8, appearance: String, ctx: &mut TxContext) {
    assert!(nation < 2, EBadNation);
    let c = Character {
        id: object::new(ctx),
        owner: ctx.sender(),
        name, nation, level: 1, xp: 0, appearance,
    };
    event::emit(CharacterCreated { id: object::id(&c), owner: c.owner, nation });
    transfer::share_object(c);
}

/// server（AdminCap）授權加經驗 → 重算等級
public fun grant_xp(_cap: &AdminCap, c: &mut Character, amount: u64) {
    c.xp = c.xp + amount;
    c.level = level_for_xp(c.xp);
    event::emit(LeveledUp { id: object::id(c), owner: c.owner, level: c.level, xp: c.xp });
}

/// 擁有者更新外觀（換造型 NFT 後同步顯示）
public entry fun set_appearance(c: &mut Character, appearance: String, ctx: &TxContext) {
    assert!(c.owner == ctx.sender(), ENotOwner);
    c.appearance = appearance;
}

// ── 讀取 ──
public fun level(c: &Character): u64 { c.level }
public fun xp(c: &Character): u64 { c.xp }
public fun nation(c: &Character): u8 { c.nation }
public fun owner_of(c: &Character): address { c.owner }
public fun max_level(): u64 { MAX_LEVEL }
