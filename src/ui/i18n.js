// ─── 多語系（中/英）────────────────────────────────────────────
// 用法：HTML 元素加 data-i18n="key" → textContent 自動套用；
// 動態文字用 t('key', {vars})。語言存 localStorage，可擴充到遊戲內 HUD。

const DICT = {
  en: {
    tagline: 'Five kingdoms wage war for the realm · Powered by Sui & Walrus',
    sec_signin: 'Ⅰ · Enter the realm',
    btn_google: 'Sign in with Google',
    btn_wallet: 'Connect Sui Wallet',
    btn_guest: 'Enter as guest',
    status_default: 'Not signed in — play as guest, or sign in to own your gear on-chain.',
    status_signing_g: 'Redirecting to Google…',
    status_signing_w: 'Connecting wallet…',
    status_guest: 'Guest mode — you can sign in later from the wardrobe (O).',
    status_fail_g: 'Google sign-in failed: ',
    status_fail_w: 'Connection failed: ',
    status_in: 'Signed in {addr} ({via})',
    via_google: 'Google', via_wallet: 'Wallet',
    sec_pledge: 'Ⅱ · Create Character · Pledge Kingdom',
    tomap_disabled: 'Choose a kingdom first',
    tomap_ready: 'Pledge to {name} → World Map',
    map_label: 'AELORIA · Five kingdoms at war',
    allegiance: 'Allegiance: {name} — tap the central front to deploy',
    enter_connecting: 'Linking to the front…',
    enter_online: 'To War  ·  {n} online',
    enter_offline: 'To War  ·  solo skirmish',
    back: '← Back',
    hint: 'On-chain assets are managed in the wardrobe (O). Guests can play first.',
    wb_title: 'War Bonds · bet on the winning kingdom',
    wb_login: 'Sign in to place War Bonds.',
    wb_bet: 'Bet {amt}',
    wb_pool: 'pool {sui} SUI · ×{odds}',
    wb_settled: 'Settled — winner: {name}',
    wb_claim: 'Claim winnings',
    wb_claimed: 'Winnings claimed!',
    wb_open: 'Open · round {r}',
    mk_title: 'Prediction Market · who wins this war?',
    mk_buy: 'Buy {amt}',
    mk_sell: 'Sell',
    mk_pos: 'You hold: Minas {a} · Calaadia {b}',
    mk_redeem: 'Redeem winnings',
    mk_status_open: 'Live', mk_status_end: 'Resolved',
    mk_round: 'Round {r}',
    mk_liquidity: 'Liquidity {sui} SUI',
    mk_mypos: 'My position ~{sui} SUI',
    mk_hold: 'Hold {n}🎟 · ~{sui} SUI',
    mk_buyname: 'Buy {name}',
    mk_to_win: '{name} wins → ~{sui} SUI',
    // ── 遊戲內 in-game ──
    g_lang: 'Language: 中 / EN',
    g_debughint: '[ P ] Settings ・ [ O ] Appearance ・ [ B ] Build ・ [ M ] Market ・ [ Alt ] Cursor/View',
    g_settings: '⚙ Settings / Debug', g_quality: 'Quality', g_low: 'Low', g_mid: 'Med', g_high: 'High',
    g_infinite_pw: 'Infinite PW', g_one_hit: 'One-hit kill', g_no_cd: 'No skill CD',
    g_unlock_skills: '🔓 Unlock all skills (test)', g_reset_sp: 'Reset skill points (40pt)', g_full_hp: 'Full HP',
    g_ap_title: '👤 Appearance', g_ap_note: 'Looks and skills are fully separate — your skill set comes from your weapon (Tab).',
    g_ap_form: 'Body Type', g_ap_tint: 'Dye (clothes only)', g_ap_head: 'Head', g_ap_torso: 'Torso', g_ap_arms: 'Arms', g_ap_legs: 'Legs', g_ap_cape: 'Back (Cape)', g_ap_gsskin: 'Two-Handed Look',
    g_knight: 'Knight', g_barbarian: 'Barbarian', g_rogue: 'Rogue', g_none: 'None',
    g_helm_knight: 'Knight Helm', g_hat_barb: 'Barb Hat', g_hood: 'Hood',
    g_armor_knight: 'Knight Armor', g_armor_barb: 'Barb Garb', g_armor_rogue: 'Rogue Outfit',
    g_arms_knight: 'Knight Arms', g_arms_barb: 'Barb Arms', g_arms_rogue: 'Rogue Sleeves',
    g_legs_knight: 'Knight Legs', g_legs_barb: 'Barb Pants', g_legs_rogue: 'Rogue Boots',
    g_gs_sword: 'Greatsword', g_gs_axe: 'Battle Axe', g_close_o: 'Close (O)',
    g_tint_none: 'Original', g_tint_crimson: 'Crimson', g_tint_azure: 'Azure', g_tint_forest: 'Forest', g_tint_amethyst: 'Amethyst', g_tint_amber: 'Amber', g_tint_slate: 'Slate', g_tint_snow: 'Snow',
    g_go_lose: '💀 Keep Fallen', g_go_lose_sub: 'The enemy has seized your castle', g_go_win: '🏆 Victory!', g_go_win_sub: 'Your army destroyed the enemy castle!', g_go_restart: 'Press F5 to restart',
    g_death: 'You have fallen', g_respawn_in: 'Respawn in {n}s...', g_respawn: '⚔ Respawned!', g_levelup: '🎚 Level up! Lv {n}',
    g_charname_ph: 'Character name', g_loading_char: 'Loading your character from chain…', g_create_char: '⚔ Create Character (mint)', g_to_world: '⚔ Enter World Map', g_choose_hero: 'Choose your Hero', g_create_new: '＋ Create New Hero', g_select_create: 'Select or create a hero',
    g_tab_market: 'Prediction Market', g_tab_nft: 'NFT Market', g_locked: 'Locked', g_battlefield: 'Battlefield', g_territories: 'territories',
    g_nft_trade: 'View ↗', g_nft_none: 'No tradeable NFTs yet', g_nft_hint: 'Your Hero & gear are owned NFTs — freely tradeable on any Sui marketplace.',
    g_to_war: '⚔ To War', g_to_war_nation: '⚔ Fight for {n}', g_map_peace_btn: 'Peaceful land', g_map_war: 'At War', g_map_peace: 'Peace', g_map_neutral: 'Neutral', g_map_ctrl: 'Held by {n}', g_fighting: '{n} fighting now', g_nofight: 'No battle yet', g_pick_map: 'Click a map to inspect',
    g_kicked_title: 'Disconnected', g_kicked_multilogin: 'This account just logged in from another window/device. This session was disconnected to prevent multi-boxing.', g_reload: 'Reload',
    g_settle_title: '⚜ War Settlement', g_settle_waiting: 'Settling on-chain…', g_checking_shares: 'Checking your position…', g_you_won_shares: 'You backed the winner! ~{n} SUI to claim', g_no_payout: 'No winning position this round', g_claim_payout: 'Claim payout', g_claiming: 'Claiming…', g_claim_failed: 'Claim failed', g_xp_earned: 'Earned +{n} XP this match', g_xp_applied: 'Applied +{n} XP ✓', g_confirm_levelup: 'Confirm level-up', g_leveling: 'Leveling…', g_settle_restart: '🏰 Back to lobby', g_no_wallet_settle: 'Connect wallet to claim', g_new_round: '⚔ A new war begins!', g_pending_xp: 'Unclaimed +{n} XP', g_pending_redeem: '{n} unclaimed payout(s)', g_demo_gear: 'Showcase gear (demo)', g_demo_hint: 'Sample cosmetics to preview the marketplace. Real player listings show above.', g_demo_buy: 'This is demo data. To trade real NFTs, list your own gear above or buy a real listing.', g_guest_name: 'Guest Hero', g_keys: 'WASD Move · LMB Atk · 1–9 Skills · Tab Weapon · B Build · G Summon · O Gear · K Skills · M Market',
    g_my_gear: 'My Gear', g_listings: 'Market Listings', g_list: 'List', g_buy: 'Buy', g_delist: 'Delist', g_no_listings: 'No listings yet', g_price_req: 'Enter a price (SUI)', g_listed_ok: 'Listed!', g_bought_ok: 'Bought!', g_create_hint: 'You can customize your look with O after entering.', g_creating: 'Creating character… please sign in your wallet', g_created: '✅ Character created on-chain · Lv {lv}', g_created_local: '✅ Character created (local) · Lv {lv}',
    g_connecting: 'Connecting...', g_kills: 'Kills:', g_crystals: 'crystals', g_towers_left: 'Towers left:',
    g_keep_blue: '🏰 Blue Keep', g_keep_red: '🏰 Red Keep', g_waiting_conn: 'Waiting for connection', g_test_field: 'Test Arena', g_continuous: 'Endless Battle', g_wave_dash: 'Wave -',
    g_tab_weapon: '[ Tab: switch weapon ]', g_equipped: 'Equipped: {name}',
    g_w_sword: 'Sword & Shield', g_w_greatsword: 'Greatsword', g_w_polearm: 'Polearm',
    g_controls: 'WASD move (face crosshair) · Shift dash<br>Space jump · Q/E sidestep · C mine<br>LMB swing · Wheel↑ overhead · Wheel↓ thrust<br>1-9 skills · Tab weapon · B build · G summon',
    g_build_title: '⚒ Build Menu', g_build_tower: '[1] Arrow Tower', g_build_obelisk: '[2] Obelisk', g_build_obelisk_note: '(expands influence)', g_cancel_be: '[B / Esc] Cancel',
    g_tower_max: 'Tower limit reached!', g_need_crystal: 'Need {cost} 💎 crystals! (have {have})', g_need_summon: 'Need {cost} 💎 to summon {name}!',
    g_summon_title: '⚗ Summon Menu', g_summon_knight: '[1] Knight', g_summon_knight_note: 'HP 300 · Heavy melee', g_summon_giant: '[2] Giant', g_summon_giant_note: 'HP 600 · Super-heavy charge', g_summon_wraith: '[3] Wraith', g_summon_wraith_note: 'HP 180 · High-speed pierce', g_cancel_ge: '[G / Esc] Cancel',
    g_skilltree_title: '⚔ Warrior Skill Tree', g_sp_points: 'Skill points:', g_sec_common: '── Common Skills ──', g_sec_weapon: '── Weapon Skills ──', g_sec_slots: '── Skill Slots (click a cell to unequip) ──', g_skilltree_close: 'Press K to close skill tree',
    g_sk_learn: 'Learn ({cost}pt)', g_sk_req: 'Needs prerequisite', g_sk_maxlv: 'LV MAX', g_sk_max: 'Max', g_sk_equip_to: 'Equip to:', g_sk_empty: 'Empty',
    g_dash_no_skill: 'Cannot use skills while dashing', g_need_weapon: 'Equip 【{weapon}】 to use this skill', g_pw_low: 'Not enough PW! (need {n})',
    g_embolden: '✨ Embolden! Flinch immunity {s}s', g_reinforce: '🛡 Reinforce Guard! DEF+{def} ATK×{atk} for {s}s',
    g_team_blue: '🔵 Blue', g_team_red: '🔴 Red', g_team_blue_side: '🔵 Blue Army', g_team_red_side: '🔴 Red Army',
    g_wave_n: '⚔ Wave {n}!', g_wave_clear: '✨ Wave cleared!', g_keep_attacked: '🏰 Your keep is under attack!',
    g_war_settled: '⚔ War settled: {name} wins!', g_payout_done: '🪙 Prediction winnings paid!', g_sui_verified: '🔗 Sui verified',
    g_unlock_done: 'All skills unlocked! LV3', g_quality_set: 'Quality: {q}', g_err: '⚠ Error: {msg}', g_init_fail: 'Init failed: {msg}',
    g_sui_title: '🔗 SUI On-chain Wardrobe · Walrus', g_sui_connect: 'Connect wallet', g_sui_need_wallet: 'Install a Sui wallet', g_sui_google: 'Sign in with Google (zkLogin)', g_sui_login_note: 'Sign in to mint your look as an NFT — art & config on Walrus, truly yours.', g_sui_via_wallet: 'Wallet', g_sui_disconnect: 'Disconnect', g_sui_mint: '＋ Mint current look as NFT', g_sui_mint_gear: 'Mint gear (per piece)', g_sui_heroimg: '🖼 Update Hero NFT image', g_sui_my_nfts: 'My Cosmetic NFTs ({n})', g_sui_none: 'None yet — mint one', g_sui_equip: 'Wear', g_sui_recolor_title: 'Recolor to current dye (dynamic NFT)', g_sui_connecting: 'Connecting…', g_sui_connect_fail: 'Connection failed: ', g_sui_google_fail: 'Google sign-in failed: ', g_sui_minting: 'Minting…', g_sui_minted: '✅ Minted & stored on Walrus', g_sui_mint_fail: 'Mint failed: ', g_sui_reading: 'Reading look from Walrus…', g_sui_read_fail: '⚠ Walrus read failed', g_sui_recolor_fail: 'Recolor failed: ', g_cosmetic_name: '{model} look',
  },
  zh: {
    tagline: '五王國爭奪領域霸權 · 由 Sui 與 Walrus 驅動',
    sec_signin: '壹 · 進入領域',
    btn_google: '用 Google 登入',
    btn_wallet: '連接 Sui 錢包',
    btn_guest: '以訪客進入',
    status_default: '未登入 — 可用訪客身分遊玩，登入後外觀與資產上鏈。',
    status_signing_g: '前往 Google 登入…',
    status_signing_w: '連接錢包中…',
    status_guest: '訪客模式 — 之後仍可在外觀面板（O）登入。',
    status_fail_g: 'Google 登入失敗：',
    status_fail_w: '連接失敗：',
    status_in: '已登入 {addr}（{via}）',
    via_google: 'Google', via_wallet: '錢包',
    sec_pledge: '貳 · 建立角色 · 宣誓王國',
    tomap_disabled: '請先宣誓王國',
    tomap_ready: '效忠 {name} → 前往世界地圖',
    map_label: 'AELORIA · 五王國交戰',
    allegiance: '效忠王國：{name} — 點中央戰線出征',
    enter_connecting: '連接戰線中…',
    enter_online: '出征  ·  在線 {n}',
    enter_offline: '出征  ·  單機試煉',
    back: '← 返回',
    hint: '鏈上資產在外觀面板（O）操作；訪客可先試玩。',
    wb_title: '戰爭債券 · 押注本場勝國',
    wb_login: '登入後即可押注戰爭債券。',
    wb_bet: '押 {amt}',
    wb_pool: '池 {sui} SUI · ×{odds}',
    wb_settled: '已結算 — 勝國：{name}',
    wb_claim: '領取彩金',
    wb_claimed: '彩金已領取！',
    wb_open: '開放中 · 第 {r} 回合',
    mk_title: '預測市場 · 誰會贏下這場戰爭？',
    mk_buy: '買 {amt}',
    mk_sell: '賣出',
    mk_pos: '你的持倉：Minas {a} · Calaadia {b}',
    mk_redeem: '兌付彩金',
    mk_status_open: '進行中', mk_status_end: '已結算',
    mk_round: '第 {r} 場',
    mk_liquidity: '流動性 {sui} SUI',
    mk_mypos: '我的部位 ~{sui} SUI',
    mk_hold: '持 {n}🎟 · ~{sui} SUI',
    mk_buyname: '買 {name}',
    mk_to_win: '{name} 勝 → ~{sui} SUI',
    // ── 遊戲內 in-game ──
    g_lang: '語言：中 / EN',
    g_debughint: '[ P ] 設定 ・ [ O ] 外觀 ・ [ B ] 建造 ・ [ M ] 預測市場 ・ [ Alt ] 滑鼠/視角',
    g_settings: '⚙ 設定 / 測試面板', g_quality: '畫質', g_low: '低', g_mid: '中', g_high: '高',
    g_infinite_pw: '無限 PW', g_one_hit: '一擊必殺', g_no_cd: '技能無 CD',
    g_unlock_skills: '🔓 解鎖全技能 (測試)', g_reset_sp: '重置技能點 (40pt)', g_full_hp: 'HP 回滿',
    g_ap_title: '👤 角色外觀', g_ap_note: '外觀與技能完全獨立 — 技能組由武器決定（Tab 切換）',
    g_ap_form: '身形', g_ap_tint: '服裝染色（染裝不染膚）', g_ap_head: '頭部', g_ap_torso: '身體', g_ap_arms: '手部', g_ap_legs: '腳部', g_ap_cape: '背部（披風）', g_ap_gsskin: '雙手武器外觀',
    g_knight: '騎士', g_barbarian: '蠻族', g_rogue: '遊俠', g_none: '無',
    g_helm_knight: '騎士盔', g_hat_barb: '蠻帽', g_hood: '兜帽',
    g_armor_knight: '騎士甲', g_armor_barb: '蠻族衣', g_armor_rogue: '遊俠裝',
    g_arms_knight: '騎士臂甲', g_arms_barb: '蠻族臂', g_arms_rogue: '遊俠袖',
    g_legs_knight: '騎士腿甲', g_legs_barb: '蠻族褲', g_legs_rogue: '遊俠靴',
    g_gs_sword: '大劍', g_gs_axe: '戰斧', g_close_o: '關閉（O）',
    g_tint_none: '原色', g_tint_crimson: '緋紅', g_tint_azure: '湛藍', g_tint_forest: '森綠', g_tint_amethyst: '紫晶', g_tint_amber: '琥珀', g_tint_slate: '玄灰', g_tint_snow: '雪白',
    g_go_lose: '💀 主堡陷落', g_go_lose_sub: '敵軍已佔領您的城堡', g_go_win: '🏆 勝利！', g_go_win_sub: '您的軍隊摧毀了敵方城堡！', g_go_restart: '按 F5 重新開始',
    g_death: '你陣亡了', g_respawn_in: '{n} 秒後重生...', g_respawn: '⚔ 重生！', g_levelup: '🎚 升級！Lv {n}',
    g_charname_ph: '角色名稱', g_loading_char: '從鏈上載入角色中…', g_create_char: '⚔ 建立角色（鑄造）', g_to_world: '⚔ 進入世界地圖', g_choose_hero: '選擇你的英雄', g_create_new: '＋ 建立新角色', g_select_create: '請選擇或建立角色',
    g_tab_market: '預測市場', g_tab_nft: 'NFT 市場', g_locked: '未開放', g_battlefield: '戰場', g_territories: '塊領地',
    g_nft_trade: '鏈上查看 ↗', g_nft_none: '尚無可交易的 NFT', g_nft_hint: '你的英雄與裝備都是 owned NFT，可在任何 Sui 市場自由買賣。',
    g_to_war: '⚔ 出征參戰', g_to_war_nation: '⚔ 為 {n} 出征', g_map_peace_btn: '和平領地（不可進）', g_map_war: '交戰中', g_map_peace: '和平', g_map_neutral: '中立', g_map_ctrl: '{n} 控制', g_fighting: '{n} 人交戰中', g_nofight: '尚無戰鬥', g_pick_map: '點地圖查看戰況',
    g_kicked_title: '連線已中斷', g_kicked_multilogin: '此帳號剛在另一個視窗／裝置登入，為避免多開，這個連線已被中斷。', g_reload: '重新整理',
    g_settle_title: '⚜ 戰後結算', g_settle_waiting: '鏈上結算中…', g_checking_shares: '查詢持倉中…', g_you_won_shares: '你押中了！可領約 {n} SUI 彩金', g_no_payout: '本場未押中／未參與下注', g_claim_payout: '領取派彩', g_claiming: '領取中…', g_claim_failed: '領取失敗', g_xp_earned: '本場獲得 +{n} XP', g_xp_applied: '已領取 +{n} XP ✓', g_confirm_levelup: '確認升級', g_leveling: '升級中…', g_settle_restart: '🏰 回大廳', g_no_wallet_settle: '連錢包後可領取', g_new_round: '⚔ 新一輪戰爭開始！', g_pending_xp: '未領取 +{n} XP', g_pending_redeem: '未領彩金 {n} 筆', g_demo_gear: '示範裝備（展示）', g_demo_hint: '展示用樣品，預覽市場樣式；玩家上架後真實掛單會顯示在上方。', g_demo_buy: '這是示範資料。真實買賣請用上方「我的裝備」上架，或購買真實掛單。', g_guest_name: '訪客勇者', g_keys: 'WASD 移動 · LMB 攻擊 · 1–9 技能 · Tab 武器 · B 建造 · G 召喚 · O 外觀 · K 技能 · M 市場',
    g_my_gear: '我的裝備', g_listings: '市場掛單', g_list: '上架', g_buy: '購買', g_delist: '下架', g_no_listings: '目前沒有掛單', g_price_req: '請輸入售價（SUI）', g_listed_ok: '已上架！', g_bought_ok: '購買成功！', g_create_hint: '進場後可按 O 自訂外觀。', g_creating: '建立角色中…請在錢包簽名', g_created: '✅ 角色已上鏈建立 · Lv {lv}', g_created_local: '✅ 角色已建立（本地）· Lv {lv}',
    g_connecting: '連線中...', g_kills: '擊殺:', g_crystals: '水晶', g_towers_left: '箭塔剩餘:',
    g_keep_blue: '🏰 藍方主堡', g_keep_red: '🏰 紅方主堡', g_waiting_conn: '等待連線', g_test_field: '測試戰場', g_continuous: '持續戰鬥', g_wave_dash: '第 - 波',
    g_tab_weapon: '[ Tab 換武器 ]', g_equipped: '裝備：{name}',
    g_w_sword: '單手劍盾', g_w_greatsword: '雙手劍', g_w_polearm: '長槍',
    g_controls: 'WASD 移動（面向準心）· Shift 衝刺<br>Space 跳躍 · Q/E 側閃 · C 採礦<br>LMB 橫掃 · 滾輪↑縱劈 · 滾輪↓突刺<br>1-9 技能 · Tab 換武器 · B 建造 · G 召喚',
    g_build_title: '⚒ 建造選單', g_build_tower: '[1] 箭塔', g_build_obelisk: '[2] 方尖塔 Obelisk', g_build_obelisk_note: '（擴張影響範圍）', g_cancel_be: '[B / Esc] 取消',
    g_tower_max: '箭塔已達上限！', g_need_crystal: '需要 {cost} 💎 水晶！（現有 {have}）', g_need_summon: '需要 {cost} 💎 召喚 {name}！',
    g_summon_title: '⚗ 召喚選單', g_summon_knight: '[1] 騎士 Knight', g_summon_knight_note: 'HP 300 · 重裝近戰', g_summon_giant: '[2] 巨人 Giant', g_summon_giant_note: 'HP 600 · 超重衝撞', g_summon_wraith: '[3] 幽魂 Wraith', g_summon_wraith_note: 'HP 180 · 高速穿刺', g_cancel_ge: '[G / Esc] 取消',
    g_skilltree_title: '⚔ 戰士技能樹', g_sp_points: '技能點：', g_sec_common: '── 共通技能 ──', g_sec_weapon: '── 武器技能 ──', g_sec_slots: '── 技能欄位（點格子取消裝備）──', g_skilltree_close: '按 K 關閉技能樹',
    g_sk_learn: '學習 ({cost}pt)', g_sk_req: '需前置技能', g_sk_maxlv: 'LV MAX', g_sk_max: '滿級', g_sk_equip_to: '裝備到：', g_sk_empty: '空',
    g_dash_no_skill: '衝刺中無法使用技能', g_need_weapon: '需要裝備【{weapon}】才能使用此技能', g_pw_low: 'PW 不足！（需要 {n}）',
    g_embolden: '✨ Embolden！免疫硬直 {s}s', g_reinforce: '🛡 強化防禦！防禦+{def} 攻擊×{atk} 持續 {s}s',
    g_team_blue: '🔵 藍方', g_team_red: '🔴 紅方', g_team_blue_side: '🔵 藍方陣營', g_team_red_side: '🔴 紅方陣營',
    g_wave_n: '⚔ 第 {n} 波！', g_wave_clear: '✨ 波次清除！', g_keep_attacked: '🏰 主堡受到攻擊！',
    g_war_settled: '⚔ 戰爭結算：{name} 勝！', g_payout_done: '🪙 預測市場彩金已兌付！', g_sui_verified: '🔗 Sui 已驗證',
    g_unlock_done: '全技能解鎖！LV3', g_quality_set: '畫質：{q}', g_err: '⚠ 錯誤: {msg}', g_init_fail: '初始化失敗: {msg}',
    g_sui_title: '🔗 SUI 鏈上衣櫥 · Walrus', g_sui_connect: '連接錢包', g_sui_need_wallet: '需安裝 Sui 錢包', g_sui_google: '用 Google 登入（zkLogin）', g_sui_login_note: '登入後把造型鑄成 NFT，美術與設定存於 Walrus 去中心化儲存、真正歸你所有', g_sui_via_wallet: '錢包', g_sui_disconnect: '中斷', g_sui_mint: '＋ 鑄造目前造型為 NFT', g_sui_mint_gear: '鑄造裝備（逐件 NFT）', g_sui_heroimg: '🖼 更新 Hero NFT 圖', g_sui_my_nfts: '我的造型 NFT（{n}）', g_sui_none: '尚無——鑄造一套吧', g_sui_equip: '穿上', g_sui_recolor_title: '改為目前染色（動態 NFT）', g_sui_connecting: '連接中…', g_sui_connect_fail: '連接失敗：', g_sui_google_fail: 'Google 登入失敗：', g_sui_minting: '鑄造中…', g_sui_minted: '✅ 已鑄造並存上 Walrus', g_sui_mint_fail: '鑄造失敗：', g_sui_reading: '從 Walrus 讀取造型…', g_sui_read_fail: '⚠ Walrus 讀取失敗', g_sui_recolor_fail: '染色失敗：', g_cosmetic_name: '{model} 造型',
  },
};

let _lang = localStorage.getItem('fr0_lang') || ((navigator.language || '').startsWith('zh') ? 'zh' : 'en');
if (!DICT[_lang]) _lang = 'en';

export function getLang() { return _lang; }

export function t(key, vars) {
  let s = (DICT[_lang] && DICT[_lang][key]) ?? (DICT.en[key] ?? key);
  if (vars) for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
  return s;
}

/** 套用所有 [data-i18n] 元素的文字 */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
}

const _listeners = [];
export function onLangChange(cb) { _listeners.push(cb); }

export function setLang(l) {
  if (!DICT[l] || l === _lang) return;
  _lang = l;
  localStorage.setItem('fr0_lang', l);
  applyI18n();
  for (const cb of _listeners) { try { cb(l); } catch { /* noop */ } }
}

export function toggleLang() { setLang(_lang === 'zh' ? 'en' : 'zh'); }
