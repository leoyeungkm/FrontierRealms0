/// FR0 Gear Market —— 泛型 NFT 掛單買賣。玩家把裝備(cosmetic Gear)或角色(Hero)等
/// owned NFT 上架成 Listing(共享物件，NFT 寄存其中)，他人付 SUI 購買、賣家收款。
/// 泛型 Listing<T>：對任何 `key + store` 的 NFT 都通用，型別由 client 以 type argument 帶入。
module fr0::gearmarket;

use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::event;

const EInsufficient: u64 = 1;
const ENotSeller: u64 = 2;

/// 一筆掛單（共享物件，內含寄存的 NFT）
public struct Listing<T: key + store> has key {
    id: UID,
    seller: address,
    price: u64,        // 售價（MIST）
    item: T,           // 寄存的 NFT
}

public struct Listed has copy, drop { id: ID, seller: address, price: u64 }
public struct Sold has copy, drop { id: ID, seller: address, buyer: address, price: u64 }
public struct Delisted has copy, drop { id: ID }

/// 上架：把 NFT 存入 Listing(共享)，設定售價
public entry fun list<T: key + store>(item: T, price: u64, ctx: &mut TxContext) {
    let l = Listing<T> { id: object::new(ctx), seller: ctx.sender(), price, item };
    event::emit(Listed { id: object::id(&l), seller: l.seller, price });
    transfer::share_object(l);
}

/// 購買：付 SUI → 拿 NFT；賣家收款，找零退回買家
public entry fun buy<T: key + store>(listing: Listing<T>, payment: Coin<SUI>, ctx: &mut TxContext) {
    let Listing { id, seller, price, item } = listing;
    let mut pay = payment;
    assert!(coin::value(&pay) >= price, EInsufficient);
    let paid = coin::split(&mut pay, price, ctx);
    transfer::public_transfer(paid, seller);            // 賣家收款
    transfer::public_transfer(pay, ctx.sender());       // 找零退回（可能為 0）
    transfer::public_transfer(item, ctx.sender());      // 買家取得 NFT
    event::emit(Sold { id: object::uid_to_inner(&id), seller, buyer: ctx.sender(), price });
    object::delete(id);
}

/// 下架：賣家取回 NFT
public entry fun delist<T: key + store>(listing: Listing<T>, ctx: &mut TxContext) {
    let Listing { id, seller, price: _, item } = listing;
    assert!(seller == ctx.sender(), ENotSeller);
    transfer::public_transfer(item, seller);
    event::emit(Delisted { id: object::uid_to_inner(&id) });
    object::delete(id);
}

// ── 讀取 ──
public fun price<T: key + store>(l: &Listing<T>): u64 { l.price }
public fun seller<T: key + store>(l: &Listing<T>): address { l.seller }
