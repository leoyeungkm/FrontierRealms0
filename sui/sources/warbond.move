/// FR0 War Bonds —— 對「哪個王國本回合戰績最高」的同注分彩預測市場（parimutuel）。
/// 用原生 sui::balance 託管 SUI；押中者按比例瓜分整池（扣手續費）。
/// 結算由伺服器持有的 AdminCap 觸發（戰績由權威端認證）。
module fr0::warbond;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::event;

const NATIONS: u8 = 5;            // Minas / Ledell / Calaadia / Dieudonne / Phoenix

const EClosed: u64 = 1;
const EBadNation: u64 = 2;
const EZeroBet: u64 = 3;
const ENotSettled: u64 = 4;
const EAlreadySettled: u64 = 5;
const EWrongWar: u64 = 6;
const ENotWinner: u64 = 7;
const ENoWinnerPool: u64 = 8;

/// 一場戰爭（共享物件）
public struct War has key {
    id: UID,
    round: u64,
    open: bool,
    settled: bool,
    winner: u8,
    fee_bps: u64,             // 手續費（萬分比，例 200 = 2%）
    pools: vector<u64>,       // 各國累計押注額
    vault: Balance<SUI>,      // 實際託管的 SUI
    payout_pool: u64,         // 結算時固定：可分配總額（扣費後）
    winner_pool: u64,         // 結算時固定：勝國池額
}

/// 開戰 / 結算權杖（部署後轉給伺服器錢包）
public struct AdminCap has key, store { id: UID }

/// 債券（押注憑證）
public struct Bond has key, store {
    id: UID,
    war: ID,
    round: u64,
    nation: u8,
    amount: u64,
}

public struct WarOpened has copy, drop { war: ID, round: u64 }
public struct BondBought has copy, drop { war: ID, nation: u8, amount: u64, buyer: address }
public struct WarSettled has copy, drop { war: ID, winner: u8, payout_pool: u64, winner_pool: u64 }
public struct Claimed has copy, drop { war: ID, nation: u8, amount: u64, payout: u64 }

fun init(ctx: &mut TxContext) {
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

/// 開新一場戰爭（admin）。fee_bps 建議 0~500。
public fun open_war(_cap: &AdminCap, round: u64, fee_bps: u64, ctx: &mut TxContext) {
    let war = War {
        id: object::new(ctx),
        round, open: true, settled: false, winner: 0, fee_bps,
        pools: vector[0, 0, 0, 0, 0],
        vault: balance::zero<SUI>(),
        payout_pool: 0, winner_pool: 0,
    };
    event::emit(WarOpened { war: object::id(&war), round });
    transfer::share_object(war);
}

/// 押注某王國：付 SUI → 進該國池 + 發債券給你
public fun buy_bond(war: &mut War, nation: u8, payment: Coin<SUI>, ctx: &mut TxContext): Bond {
    assert!(war.open && !war.settled, EClosed);
    assert!(nation < NATIONS, EBadNation);
    let amount = coin::value(&payment);
    assert!(amount > 0, EZeroBet);

    balance::join(&mut war.vault, coin::into_balance(payment));
    let p = vector::borrow_mut(&mut war.pools, nation as u64);
    *p = *p + amount;

    event::emit(BondBought { war: object::id(war), nation, amount, buyer: ctx.sender() });
    Bond { id: object::new(ctx), war: object::id(war), round: war.round, nation, amount }
}

/// entry 版：押注並把債券送回自己
entry fun bet(war: &mut War, nation: u8, payment: Coin<SUI>, ctx: &mut TxContext) {
    let bond = buy_bond(war, nation, payment, ctx);
    transfer::public_transfer(bond, ctx.sender());
}

/// 結算（admin）：鎖盤、定勝國、固定分配額並抽手續費給伺服器
public fun settle(_cap: &AdminCap, war: &mut War, winner: u8, ctx: &mut TxContext) {
    assert!(!war.settled, EAlreadySettled);
    assert!(winner < NATIONS, EBadNation);
    war.open = false;
    war.settled = true;
    war.winner = winner;

    let total = balance::value(&war.vault);
    let fee = total * war.fee_bps / 10000;
    if (fee > 0) {
        let fee_coin = coin::take(&mut war.vault, fee, ctx);
        transfer::public_transfer(fee_coin, ctx.sender());   // 手續費 → 伺服器/金庫
    };
    war.payout_pool = balance::value(&war.vault);            // 扣費後可分配總額
    war.winner_pool = *vector::borrow(&war.pools, winner as u64);
    event::emit(WarSettled { war: object::id(war), winner, payout_pool: war.payout_pool, winner_pool: war.winner_pool });
}

/// 領彩：押中者按比例瓜分（payout = amount × payout_pool ÷ winner_pool）
public fun claim(war: &mut War, bond: Bond, ctx: &mut TxContext): Coin<SUI> {
    assert!(war.settled, ENotSettled);
    assert!(bond.war == object::id(war), EWrongWar);
    assert!(bond.nation == war.winner, ENotWinner);
    assert!(war.winner_pool > 0, ENoWinnerPool);

    let payout = ((bond.amount as u128) * (war.payout_pool as u128) / (war.winner_pool as u128)) as u64;
    event::emit(Claimed { war: object::id(war), nation: bond.nation, amount: bond.amount, payout });

    let Bond { id, war: _, round: _, nation: _, amount: _ } = bond;
    object::delete(id);
    coin::take(&mut war.vault, payout, ctx)
}

/// entry 版：領彩並把 SUI 送回自己
entry fun claim_to_sender(war: &mut War, bond: Bond, ctx: &mut TxContext) {
    let c = claim(war, bond, ctx);
    transfer::public_transfer(c, ctx.sender());
}

/// 邊角回收（admin）：勝國無人押注等情況的殘額
public fun admin_withdraw(_cap: &AdminCap, war: &mut War, ctx: &mut TxContext): Coin<SUI> {
    assert!(war.settled, ENotSettled);
    let left = balance::value(&war.vault);
    coin::take(&mut war.vault, left, ctx)
}

// ── 讀取（client 顯示賠率/池子用）──
public fun pools(war: &War): vector<u64> { war.pools }
public fun total(war: &War): u64 { balance::value(&war.vault) }
public fun is_open(war: &War): bool { war.open && !war.settled }
public fun winner(war: &War): u8 { war.winner }
public fun round(war: &War): u64 { war.round }
