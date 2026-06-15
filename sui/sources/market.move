/// FR0 Prediction Market —— 二元結果的 constant-product AMM（Polymarket / Gnosis CPMM 式）。
/// 結果 A=Minas、B=Calaadia。連續定價（價=對手 reserve 比），可即時買/賣份額，
/// 結算後勝方份額 1:1 兌付。種子流動性由 admin 提供（LP 風險）。
module fr0::market;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::table::{Self, Table};
use sui::event;

const EResolved: u64 = 1;
const ENotResolved: u64 = 2;
const EBadOutcome: u64 = 3;
const EZero: u64 = 4;
const EInsufficientShares: u64 = 5;

/// 一個預測市場（共享物件）
public struct Market has key {
    id: UID,
    round: u64,
    resolved: bool,
    winner: u8,                  // 0=A(Minas) 1=B(Calaadia)
    ra: u64,                     // 結果 A 份額 reserve
    rb: u64,                     // 結果 B 份額 reserve
    fee_bps: u64,
    collateral: Balance<SUI>,    // 抵押金庫（份額以此 1:1 兌付）
    bal_a: Table<address, u64>,  // 使用者持有的 A 份額
    bal_b: Table<address, u64>,  // 使用者持有的 B 份額
}

public struct AdminCap has key, store { id: UID }

public struct MarketOpened has copy, drop { market: ID, round: u64, seed: u64 }
public struct Trade has copy, drop { market: ID, who: address, outcome: u8, buy: bool, sui: u64, shares: u64, price_a_bps: u64 }
public struct Resolved has copy, drop { market: ID, winner: u8 }
public struct Redeemed has copy, drop { market: ID, who: address, payout: u64 }

fun init(ctx: &mut TxContext) {
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

// ── 整數平方根（u128，Newton）──
fun sqrt_u128(y: u128): u128 {
    if (y < 4) { return if (y == 0) 0 else 1 };
    let mut z = y;
    let mut x = y / 2 + 1;
    while (x < z) { z = x; x = (y / x + x) / 2; };
    z
}

/// 開市（admin 注入種子流動性 seed → 起始 50/50）
public fun open_market(_cap: &AdminCap, round: u64, seed: Coin<SUI>, fee_bps: u64, ctx: &mut TxContext) {
    let amt = coin::value(&seed);
    assert!(amt > 0, EZero);
    let m = Market {
        id: object::new(ctx),
        round, resolved: false, winner: 0,
        ra: amt, rb: amt, fee_bps,
        collateral: coin::into_balance(seed),
        bal_a: table::new(ctx), bal_b: table::new(ctx),
    };
    event::emit(MarketOpened { market: object::id(&m), round, seed: amt });
    transfer::share_object(m);
}

/// 結果 A 的當前隱含機率（基點 0..10000 = 0..100%）= rb / (ra+rb)
public fun price_a_bps(m: &Market): u64 { (((m.rb as u128) * 10000) / ((m.ra as u128) + (m.rb as u128))) as u64 }

fun add_bal(t: &mut Table<address, u64>, who: address, n: u64) {
    if (table::contains(t, who)) { let b = table::borrow_mut(t, who); *b = *b + n; }
    else { table::add(t, who, n); }
}
fun sub_bal(t: &mut Table<address, u64>, who: address, n: u64) {
    let b = table::borrow_mut(t, who);
    assert!(*b >= n, EInsufficientShares);
    *b = *b - n;
}
fun get_bal(t: &Table<address, u64>, who: address): u64 {
    if (table::contains(t, who)) *table::borrow(t, who) else 0
}

/// 買入 outcome（0=A 1=B）份額，付 SUI；CPMM 連續定價（買越多價越高）
public entry fun buy(m: &mut Market, outcome: u8, payment: Coin<SUI>, ctx: &mut TxContext) {
    assert!(!m.resolved, EResolved);
    assert!(outcome < 2, EBadOutcome);
    let inv = coin::value(&payment);
    assert!(inv > 0, EZero);
    let fee = inv * m.fee_bps / 10000;
    let net = (inv - fee) as u128;
    balance::join(&mut m.collateral, coin::into_balance(payment));   // 全額入庫（fee 留庫=LP 收益）

    let ra = m.ra as u128; let rb = m.rb as u128; let prod = ra * rb;
    let who = ctx.sender();
    let shares;
    if (outcome == 0) {
        let new_rb = rb + net;
        let new_ra = prod / new_rb;
        shares = (ra + net - new_ra) as u64;
        m.ra = new_ra as u64; m.rb = new_rb as u64;
        add_bal(&mut m.bal_a, who, shares);
    } else {
        let new_ra = ra + net;
        let new_rb = prod / new_ra;
        shares = (rb + net - new_rb) as u64;
        m.ra = new_ra as u64; m.rb = new_rb as u64;
        add_bal(&mut m.bal_b, who, shares);
    };
    event::emit(Trade { market: object::id(m), who, outcome, buy: true, sui: inv, shares, price_a_bps: price_a_bps(m) });
}

/// 賣出 outcome 份額換回 SUI（解二次式求兌付額；CPMM 連續定價）
public entry fun sell(m: &mut Market, outcome: u8, shares: u64, ctx: &mut TxContext) {
    assert!(!m.resolved, EResolved);
    assert!(outcome < 2, EBadOutcome);
    assert!(shares > 0, EZero);
    let who = ctx.sender();
    let s = shares as u128;
    let ra = m.ra as u128; let rb = m.rb as u128;
    // 賣 A：(ra + s - ret)(rb - ret) = ra*rb → ret = (sum - sqrt(sum^2 - 4·s·other))/2
    let ret128;
    if (outcome == 0) {
        sub_bal(&mut m.bal_a, who, shares);
        let sum = ra + s + rb;
        ret128 = (sum - sqrt_u128(sum * sum - 4 * s * rb)) / 2;
        m.ra = (ra + s - ret128) as u64; m.rb = (rb - ret128) as u64;
    } else {
        sub_bal(&mut m.bal_b, who, shares);
        let sum = ra + s + rb;
        ret128 = (sum - sqrt_u128(sum * sum - 4 * s * ra)) / 2;
        m.rb = (rb + s - ret128) as u64; m.ra = (ra - ret128) as u64;
    };
    let ret = ret128 as u64;
    let out = coin::take(&mut m.collateral, ret, ctx);
    event::emit(Trade { market: object::id(m), who, outcome, buy: false, sui: ret, shares, price_a_bps: price_a_bps(m) });
    transfer::public_transfer(out, who);
}

/// 結算（admin）：定勝方
public fun resolve(_cap: &AdminCap, m: &mut Market, winner: u8) {
    assert!(!m.resolved, EResolved);
    assert!(winner < 2, EBadOutcome);
    m.resolved = true; m.winner = winner;
    event::emit(Resolved { market: object::id(m), winner });
}

/// 兌付：勝方份額 1:1 換 SUI（呼叫者領自己的）
public entry fun redeem(m: &mut Market, ctx: &mut TxContext) {
    assert!(m.resolved, ENotResolved);
    let who = ctx.sender();
    let win = if (m.winner == 0) &mut m.bal_a else &mut m.bal_b;
    let shares = if (table::contains(win, who)) table::remove(win, who) else 0;
    assert!(shares > 0, EZero);
    let payout = if (shares > balance::value(&m.collateral)) balance::value(&m.collateral) else shares;
    let out = coin::take(&mut m.collateral, payout, ctx);
    event::emit(Redeemed { market: object::id(m), who, payout });
    transfer::public_transfer(out, who);
}

/// 結算後 admin 回收剩餘（LP 的池內勝方份額對應的抵押 + 殘額）
public fun admin_withdraw(_cap: &AdminCap, m: &mut Market, ctx: &mut TxContext): Coin<SUI> {
    assert!(m.resolved, ENotResolved);
    let left = balance::value(&m.collateral);
    coin::take(&mut m.collateral, left, ctx)
}

// ── 讀取 ──
public fun reserves(m: &Market): (u64, u64) { (m.ra, m.rb) }
public fun total_collateral(m: &Market): u64 { balance::value(&m.collateral) }
public fun shares_of(m: &Market, who: address): (u64, u64) { (get_bal(&m.bal_a, who), get_bal(&m.bal_b, who)) }
public fun is_resolved(m: &Market): bool { m.resolved }
public fun winner(m: &Market): u8 { m.winner }
public fun round(m: &Market): u64 { m.round }
