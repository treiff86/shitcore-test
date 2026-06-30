/* ============================================================
   GAMIFIED MARKET SYSTEM - LEVERAGE SCALPING MINI-GAME
   Pair: SHITCORE / USDSHT
   ============================================================
   New in this version:
   - Trades now ALWAYS open the instant you click Pump/Dump.
     Catastrophe odds (DRAINED/RUGGED/BUST) are still rolled at
     that moment, but the outcome is held and resolved on the
     very next tick instead of pre-empting the trade — so you
     always see your position open, entry line and all, and it
     "rides" for at least a second before anything bad happens.
   - Closing the position early via Panic Sell can't dodge a
     pending catastrophe either — it resolves the same way.
   - Leverage bar: 25x / 50x / 75x / 100x. Picks both the real
     PnL multiplier AND the instant-bust odds (13/25/38/50%).
   - Trade buttons are forced into an even 50/50 split. While a
     trade is open they collapse into a single "PANIC SELL"
     button — no PnL text on the button, that lives in the
     orderbook now.
   - Your live order (direction, entry price, leverage) and its
     running PnL render as a highlighted row inside the Live
     Orderbook.
   - The chart draws a dashed red line at your entry price while
     a trade is open, auto-scaled into view.
   - Wager selector (10% / 50% / custom $) still gates Pump/Dump.
   - RUGGED: 1% chance per trade, lose the wager + 10% of
     remaining wallet. DRAINED: 0.01% chance, wallet goes to $0.
   All fake money, 100% client-side, no real funds involved.
   ============================================================ */

const BASE_TOKEN = 'SHITCORE';
const QUOTE_TOKEN = 'USDSHT';

let priceHistory = Array(60).fill(0.0125);
let blockNumber = 942012;

// Gamification State Variables
let activeTrade = null;

// Leverage state
const LEVERAGE_TIERS = [25, 50, 75, 100];
const BUST_CHANCE_MAP = { 25: 0.13, 50: 0.25, 75: 0.38, 100: 0.50 };
let selectedLeverage = 25;

// Wager state
let wagerAmount = 0;
let wagerMode = null;       // 10 | 50 | 'custom' | null
let pumpBtnEl = null;
let dumpBtnEl = null;

function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function initMarkets() {
    setupWagerControls();
    setupMevButton();
    setInterval(updateMarketTick, 1000);
}

function updateMarketTick() {
    // 1. Update Block Number
    blockNumber += Math.floor(Math.random() * 2) + 1;
    const blockEl = document.getElementById('simulatedBlockNum');
    if (blockEl) blockEl.innerText = `BLOCK #${blockNumber.toLocaleString()}`;

    // 2. Market Movement Logic
    let lastPrice = priceHistory[priceHistory.length - 1];
    let bias = 0;

    if (activeTrade) {
        // 15% chance whale hunt
        bias = (Math.random() < 0.15) ? (activeTrade.type === 'LONG' ? -0.08 : 0.08) : (Math.random() - 0.48) * 0.04;
    } else {
        bias = (Math.random() - 0.495) * 0.03;
    }

    let newPrice = Math.max(0.00000010, lastPrice * (1 + bias));
    priceHistory.shift();
    priceHistory.push(newPrice);

    // 3. Process Trade Logic (separated from rendering)
    if (activeTrade) {
        try {
            processActiveTrade(newPrice);
        } catch (e) {
            console.error("Trade processing error, continuing render:", e);
        }
    }

    // 4. Guaranteed UI Rendering
    try {
        renderChart();
        renderOrderbook(newPrice);
        generateChainLog();
    } catch (e) {
        console.error("Rendering error:", e);
    }
}

/* ============================================================
   TRADING ENGINE CORE LOGIC
   ============================================================ */

function handleMarketAction(actionType) {
    if (activeTrade) {
        closePosition();
        return;
    }

    if (wagerAmount <= 0) {
        showToast("Pick a wager first — 10%, 50%, or a custom amount.", "error");
        return;
    }
    if (wagerAmount > state.cash) {
        showToast("Your wager is bigger than your wallet. Lower it.", "error");
        return;
    }

    // Commit the wager and leverage immediately
    state.cash -= wagerAmount;
    const committedWager = wagerAmount;
    const committedLeverage = selectedLeverage;

    // Roll the catastrophic outcome now, but DON'T act on it yet — the
    // trade always opens and rides for at least one tick first, instead
    // of being pre-empted before it's ever visible on screen.
    let pendingCatastrophe = null;
    const roll = Math.random();
    let threshold = 0.0001;                       // 0.01% — DRAINED
    if (roll < threshold) {
        pendingCatastrophe = 'DRAINED';
    } else {
        threshold += 0.01;                         // +1% — RUGGED
        if (roll < threshold) {
            pendingCatastrophe = 'RUGGED';
        } else {
            threshold += (BUST_CHANCE_MAP[committedLeverage] || 0); // +leverage-scaled bust odds
            if (roll < threshold) {
                pendingCatastrophe = 'BUST';
            }
        }
    }

    let currentPrice = priceHistory[priceHistory.length - 1];

    activeTrade = {
        type: actionType,
        entryPrice: currentPrice,
        margin: committedWager,
        leverage: committedLeverage,
        pnl: 0,
        pendingCatastrophe
    };

    playSound('buy');
    updateTradeButtonsUI();
    syncWagerUI();
    updateUI();
}

function forcePump() { handleMarketAction('LONG'); }
function forceDump() { handleMarketAction('SHORT'); }

/** Shared resolution for a pre-rolled catastrophe, used by both the
 *  natural next-tick path AND an early manual Panic Sell — so there's
 *  no way to dodge a rolled catastrophe by closing before the tick fires. */
function resolvePendingCatastrophe() {
    const catastrophe = activeTrade.pendingCatastrophe;
    const wager = activeTrade.margin;
    const leverage = activeTrade.leverage;

    activeTrade = null;
    resetTradeButtonsUI();
    syncWagerUI();

    if (catastrophe === 'DRAINED') triggerDrainedEvent();
    else if (catastrophe === 'RUGGED') triggerRuggedEvent(wager);
    else if (catastrophe === 'BUST') triggerInstantBust(leverage, wager);

    updateUI();
}

function processActiveTrade(currentPrice) {
    if (activeTrade.pendingCatastrophe) {
        resolvePendingCatastrophe();
        return;
    }

    let priceDiffPct = (currentPrice - activeTrade.entryPrice) / activeTrade.entryPrice;
    if (activeTrade.type === 'SHORT') priceDiffPct = -priceDiffPct;

    activeTrade.pnl = activeTrade.margin * (priceDiffPct * activeTrade.leverage);

    if (activeTrade.pnl <= -activeTrade.margin) {
        activeTrade.pnl = -activeTrade.margin;
        playSound('liquidated');
        showToast(`💥 LIQUIDATED!`, "error");
        activeTrade = null;
        resetTradeButtonsUI();
        syncWagerUI();
        updateUI();
    }
}

function closePosition() {
    if (!activeTrade) return;

    if (activeTrade.pendingCatastrophe) {
        resolvePendingCatastrophe();
        checkProgressions();
        return;
    }

    state.cash += (activeTrade.margin + activeTrade.pnl);

    if (activeTrade.pnl > 0) {
        state.lifetimeEarned += activeTrade.pnl;
        playSound('buy');
        showToast(`💰 Profit: +$${activeTrade.pnl.toFixed(2)}`, "success");
    } else {
        playSound('click');
        showToast(`📉 Loss: -$${Math.abs(activeTrade.pnl).toFixed(2)}`, "error");
    }

    activeTrade = null;
    resetTradeButtonsUI();
    syncWagerUI();
    checkProgressions();
    updateUI();
}

/* ============================================================
   RARE CATASTROPHIC EVENTS — DRAINED (0.01%) / RUGGED (1%) /
   instant BUST (13-50%, scaled by chosen leverage)
   Rolled the instant a wager is committed, resolved on the
   following tick (or an early Panic Sell) so the trade always
   visibly opens first.
   ============================================================ */

function triggerRuggedEvent(lostWager) {
    const extraPenalty = state.cash * 0.10; // 10% of whatever's left after the wager was taken
    state.cash = Math.max(0, state.cash - extraPenalty);

    playSound('rug');
    showToast(`🚨 RUGGED! Lost your $${lostWager.toFixed(2)} wager + $${extraPenalty.toFixed(2)} (10% of remaining wallet).`, "error");
    pushChainLog('RUGGED', `Pool yanked mid-swap. A $${lostWager.toFixed(2)} wager vaporized on the spot.`, 'text-red-500 font-extrabold');
}

function triggerDrainedEvent() {
    state.cash = 0;
    playSound('liquidated');
    showToast(`☠️ DRAINED! Every dollar in your wallet is gone. Time to start over.`, "error");
    pushChainLog('DRAINED', `Total wallet drain event detected. Balance zeroed across the board.`, 'text-fuchsia-400 font-extrabold');
}

function triggerInstantBust(leverage, lostWager) {
    playSound('liquidated');
    showToast(`💥 BUSTED! Your ${leverage}x leveraged position got liquidated almost instantly. Lost your $${lostWager.toFixed(2)} wager.`, "error");
    pushChainLog('LIQ', `A ${leverage}x leveraged position got busted seconds after opening. $${lostWager.toFixed(2)} gone.`, 'text-red-500 font-extrabold');
}

/* ============================================================
   WAGER + LEVERAGE CONTROLS
   Injected dynamically so this file works as a drop-in
   replacement with no HTML changes required.
   ============================================================ */

function setupWagerControls() {
    if (document.getElementById('wagerControlPanel')) return;

    const pumpBtn = document.querySelector("button[onclick='forcePump()']");
    const dumpBtn = document.querySelector("button[onclick='forceDump()']");
    const anchor = document.getElementById('marketWagerAnchor');
    if (!pumpBtn || !dumpBtn || !anchor) {
        setTimeout(setupWagerControls, 200); // DOM not ready yet, retry shortly
        return;
    }

    pumpBtnEl = pumpBtn;
    dumpBtnEl = dumpBtn;

    // Keep the trade buttons big and even, matching the static markup
    pumpBtnEl.className = "flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-sm font-mono transition";
    dumpBtnEl.className = "flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm font-mono transition";

    const panelHtml = `
        <div id="wagerControlPanel" class="bg-[#10141D] border border-[#1A2232] rounded-lg p-3 space-y-2">
            <div class="flex items-center justify-between text-[11px]">
                <span class="text-gray-400 uppercase font-semibold">Wager Amount</span>
                <span id="wagerDisplay" class="text-amber-400 font-bold font-mono">$0.00</span>
            </div>
            <div class="flex items-center gap-2">
                <button id="wager10Btn" onclick="setWagerPercent(10)" class="px-3 py-1.5 bg-[#1C212E] hover:bg-[#252E3E] text-gray-200 text-xs font-bold rounded transition">10%</button>
                <button id="wager50Btn" onclick="setWagerPercent(50)" class="px-3 py-1.5 bg-[#1C212E] hover:bg-[#252E3E] text-gray-200 text-xs font-bold rounded transition">50%</button>
                <input id="wagerCustomInput" type="number" min="0" step="1" placeholder="Custom $" oninput="setWagerCustom(this.value)" class="flex-1 bg-[#070A0F] text-white text-xs font-mono px-2 py-1.5 rounded border border-[#1A2232] focus:outline-none focus:border-amber-500">
            </div>
            <div class="flex items-center justify-between text-[11px] pt-1">
                <span class="text-gray-400 uppercase font-semibold">Leverage</span>
                <span id="leverageDisplay" class="text-rose-400 font-bold font-mono">25x</span>
            </div>
            <div class="flex items-center gap-1.5">
                <button id="lev25Btn" onclick="setLeverage(25)" class="flex-1 px-2 py-1.5 bg-[#1C212E] hover:bg-[#252E3E] text-gray-200 text-xs font-bold rounded transition">25x</button>
                <button id="lev50Btn" onclick="setLeverage(50)" class="flex-1 px-2 py-1.5 bg-[#1C212E] hover:bg-[#252E3E] text-gray-200 text-xs font-bold rounded transition">50x</button>
                <button id="lev75Btn" onclick="setLeverage(75)" class="flex-1 px-2 py-1.5 bg-[#1C212E] hover:bg-[#252E3E] text-gray-200 text-xs font-bold rounded transition">75x</button>
                <button id="lev100Btn" onclick="setLeverage(100)" class="flex-1 px-2 py-1.5 bg-[#1C212E] hover:bg-[#252E3E] text-gray-200 text-xs font-bold rounded transition">100x</button>
            </div>
            <p class="text-[9px] text-gray-500 leading-snug">Higher leverage = bigger swings AND a higher chance of an instant bust (13% / 25% / 38% / 50%).</p>
            <p class="text-[9px] text-gray-500 leading-snug">Pick a wager before you can Pump or Dump. 1% chance of getting RUGGED (wager + 10% of wallet). 0.01% chance of a total DRAIN.</p>
        </div>`;

    anchor.insertAdjacentHTML('beforeend', panelHtml);

    syncWagerUI();
}

function setWagerPercent(pct) {
    wagerAmount = Math.max(0, (state.cash || 0) * (pct / 100));
    wagerMode = pct;
    const input = document.getElementById('wagerCustomInput');
    if (input) input.value = wagerAmount.toFixed(2);
    playSound('click');
    syncWagerUI();
}

function setWagerCustom(rawVal) {
    let amt = parseFloat(rawVal);
    if (isNaN(amt) || amt < 0) amt = 0;
    amt = Math.min(amt, state.cash || 0);
    wagerAmount = amt;
    wagerMode = 'custom';
    syncWagerUI();
}

function setLeverage(tier) {
    selectedLeverage = tier;
    playSound('click');
    syncWagerUI();
}

function syncWagerUI() {
    const display = document.getElementById('wagerDisplay');
    if (display) display.innerText = `$${wagerAmount.toFixed(2)}`;

    const b10 = document.getElementById('wager10Btn');
    const b50 = document.getElementById('wager50Btn');
    if (b10) b10.style.boxShadow = wagerMode === 10 ? '0 0 0 2px #f59e0b inset' : 'none';
    if (b50) b50.style.boxShadow = wagerMode === 50 ? '0 0 0 2px #f59e0b inset' : 'none';

    const leverageDisplay = document.getElementById('leverageDisplay');
    if (leverageDisplay) leverageDisplay.innerText = `${selectedLeverage}x`;
    LEVERAGE_TIERS.forEach(tier => {
        const btn = document.getElementById(`lev${tier}Btn`);
        if (btn) btn.style.boxShadow = selectedLeverage === tier ? '0 0 0 2px #f43f5e inset' : 'none';
    });

    if (!activeTrade && pumpBtnEl && dumpBtnEl) {
        const enabled = wagerAmount > 0;
        [pumpBtnEl, dumpBtnEl].forEach(btn => {
            btn.disabled = !enabled;
            btn.classList.toggle('opacity-40', !enabled);
            btn.classList.toggle('cursor-not-allowed', !enabled);
        });
    }
}

/* ============================================================
   UI HELPERS & RENDERING
   ============================================================ */

function updateTradeButtonsUI() {
    if (!pumpBtnEl || !dumpBtnEl) return;
    pumpBtnEl.innerHTML = `🚨 PANIC SELL`;
    pumpBtnEl.className = "flex-1 py-3 bg-rose-700 hover:bg-rose-600 text-white font-extrabold rounded-lg text-sm text-center cursor-pointer transition animate-pulse";
    pumpBtnEl.setAttribute("onclick", "closePosition()");
    dumpBtnEl.classList.add('hidden');
}

function resetTradeButtonsUI() {
    if (!pumpBtnEl || !dumpBtnEl) return;
    pumpBtnEl.innerHTML = `📈 PUMP IT`;
    pumpBtnEl.className = "flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-sm font-mono transition";
    pumpBtnEl.setAttribute("onclick", "forcePump()");

    dumpBtnEl.classList.remove('hidden');
    dumpBtnEl.innerHTML = `📉 DUMP IT`;
    dumpBtnEl.className = "flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm font-mono transition";
    dumpBtnEl.setAttribute("onclick", "forceDump()");
}

function renderChart() {
    const canvas = document.getElementById('tradingCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Pull the entry price into the visible range so the reference line
    // is never clipped off the top or bottom of the chart.
    let displayMin = Math.min(...priceHistory);
    let displayMax = Math.max(...priceHistory);
    if (activeTrade) {
        displayMin = Math.min(displayMin, activeTrade.entryPrice);
        displayMax = Math.max(displayMax, activeTrade.entryPrice);
    }
    const maxVal = displayMax * 1.05;
    const minVal = displayMin * 0.95;
    const range = maxVal - minVal || 1;

    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < priceHistory.length; i++) {
        let x = (canvas.width / (priceHistory.length - 1)) * i;
        let y = canvas.height - ((priceHistory[i] - minVal) / range * canvas.height);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Dashed entry-price reference line for the active leveraged position
    if (activeTrade) {
        const entryY = canvas.height - ((activeTrade.entryPrice - minVal) / range * canvas.height);

        ctx.save();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, entryY);
        ctx.lineTo(canvas.width, entryY);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#f43f5e';
        ctx.font = '10px JetBrains Mono';
        ctx.fillText(`ENTRY ${activeTrade.entryPrice.toFixed(6)}`, 6, Math.max(10, entryY - 4));
    }
}

function renderOrderbook(midPrice) {
    const askContainer = document.getElementById('orderBookAsks');
    const bidContainer = document.getElementById('orderBookBids');
    if (!askContainer || !bidContainer) return;

    let askHtml = '', bidHtml = '';
    for (let i = 3; i > 0; i--) {
        let p = midPrice * (1 + (i * 0.005));
        askHtml += `<div class="flex justify-between text-rose-500 font-mono text-[11px]"><span>${p.toFixed(6)}</span></div>`;
    }

    // Your own live order, highlighted, right where the order book can see it
    if (activeTrade) {
        const pnlColor = activeTrade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
        const sign = activeTrade.pnl >= 0 ? '+' : '';
        askHtml += `
            <div class="flex justify-between items-center bg-[#1A2232] border border-amber-500/40 rounded px-1.5 py-1 mt-1 mb-1 text-[11px]">
                <span class="text-amber-400 font-bold">YOUR ${activeTrade.type} ${activeTrade.leverage}x @ ${activeTrade.entryPrice.toFixed(6)}</span>
                <span class="${pnlColor} font-mono font-bold">${sign}$${activeTrade.pnl.toFixed(2)}</span>
            </div>`;
    }

    for (let i = 1; i <= 3; i++) {
        let p = midPrice * (1 - (i * 0.005));
        bidHtml += `<div class="flex justify-between text-green-500 font-mono text-[11px]"><span>${p.toFixed(6)}</span></div>`;
    }
    askContainer.innerHTML = askHtml;
    bidContainer.innerHTML = bidHtml;

    const spreadEl = document.getElementById('liveSpread');
    if (spreadEl) {
        const spreadPct = ((midPrice * 1.005 - midPrice * 0.995) / midPrice) * 100;
        spreadEl.innerText = `${spreadPct.toFixed(2)}% (Hyper Toxic)`;
    }
}

/* ============================================================
   LIVE CHAIN FEED — varied, randomized flavor text
   ============================================================ */

function randomWalletAddr() {
    const hex = '0123456789abcdef';
    let s = '0x';
    for (let i = 0; i < 4; i++) s += hex[Math.floor(Math.random() * 16)];
    return s + '...' + Math.floor(Math.random() * 900 + 100);
}
function randomUsdtAmt() { return (Math.random() * 9000 + 10).toFixed(2); }
function randomTokenAmt() { return (Math.random() * 9000000 + 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function randomGwei() { return Math.floor(Math.random() * 6000 + 500); }
const BOT_NAMES = [
    // --- LEGENDARY MEV BOTS & PROTOCOLS ---
    'jaredfromsubway.eth', 'arsc_solana_bot', 'DeezNode_MEV', '0xBADc0dE_bot', 'SalmonellaPoisoner', '2Fast_Jito_Bundle', 'B91_Squeezer', 'SlippageMaximus', 'MevSlayer#9', 'FrontrunFred', 'Sandwich#402', 'SnipeBotX', 'Blocknative_Stalker', 'Flashbots_Overlord', 'EigenPhi_Watcher', 'MempoolVampire', 'GasGuzzler_v3', 'SlippageSucker', 'ArbitrageApex', 'BackrunBaron',

    // --- FOUNDERS & REAL-WORLD CRYPTO CRIMINALS ---
    'SBF_In_Solitary', 'Caroline_Polycule_Quant', 'Do_Kwon_Montenegro_Cell', 'Alex_Mashinsky_Unfreezer', 'Su_Zhu_Zhan_Lim_Yoga', 'Kyle_Davies_3AC_Ghost', 'Richard_Heart_Hex_Flex', 'Mashinsky_Celsius_Drainer', 'Ruja_Ignatova_Missing_Queen', 'Gerald_Cotten_Cold_Storage', 'Bitfinex_Hack_Razzlekhan', 'Dutch_Light_Laundromat', 'Avraham_Eisenberg_Oracle_Manipulator', 'Mango_Markets_Bad_Actor', 'Thomas_G_Arbitrum_Sniper', 'Peraire_Bueno_MIT_Elite', 'Anton_Bueno_Block_Reorder', 'Gary_Wang_Code_Flipper', 'Nishad_Singh_Backdoor_Dev', 'Ryan_Salame_Party_Planner',

    // --- HACKERS, GROUPS & SCAM ARCHETYPES ---
    'Lazarus_Group_Proxy', 'Tornado_Cash_Mixer_Bot', 'Phishing_Kit_V4', 'Drainer_As_A_Service', 'Wallet_Drainer_Pro', 'Multisig_Insider_Thief', 'Infinite_Mint_Glitcher', 'Flash_Loan_Exploiter', 'Reentrancy_Attacker', 'Dust_Attack_Spammer', 'SIM_Swap_Specialist', 'Discord_WebHook_Hijacker', 'Ice_Phishing_Master', 'Permit2_Signature_Stealer', 'Honeypot_Deployer_99', 'RugPull_Architect', 'Vanity_Address_Cracker', 'MEV_Boost_Cheater', 'Validator_Colluder', 'Zero_Knowledge_Scammer',

    // --- INFLUENCERS & CELEBRITY SHILLERS ---
    'Logan_Paul_Zoo_Keeper', 'BitBoy_Crypto_Crier', 'KSI_Crypto_Curse', 'Floyd_Crypto_Mayweather', 'Kim_K_EthereumMax', 'Ice_T_NFT_Shiller', 'McAfee_Ghost_Spammer', 'Martin_Shkreli_Token_Dev', 'Andrew_Tate_Degen_Pump', 'Jason_Derulo_Rugger', 'TechLead_Million_Token', 'Lark_Davis_Bag_Dumper', 'Suppoman_Alpha_Caller', 'Tai_Lopez_DeFi_Knowledge', 'Michael_Saylor_Laser_Eyes', 'Cramer_Inverse_Signal', 'Schiff_Gold_Boomer', 'Elon_Dogecoin_Pumper', 'Cobie_WOB_Ghost', 'Ansem_Solana_Multiplier',

    // --- MEME WRAP-UPS & MEMPOOL JOKES ---
    'Your_Local_McDonalds_Manager', 'Wendy_Dumpster_Dweller', 'GigaChad_Liquidity_Provider', 'Wojak_Capitulator', 'Bogdanoff_Pump_It', 'Bogdanoff_Dump_It', 'Sminem_Green_God', 'Bear_Market_Surviver', 'Buy_The_High_Guy', 'Sell_The_Low_Joe', 'Paper_Hand_Pete', 'Diamond_Hand_Danny', 'Generational_Wealth_Finder', 'Down_99_Percent', 'Living_In_Parents_Basement', 'My_Wife_Left_Me_Crypto', 'Belgian_Malinois_In_Suits', 'Is_This_A_Honeypot', 'Pls_Sir_Refund', 'Not_Financial_Advice_Bot'
];
const HANDLES = [
    // --- WHALES & DEGEN ARCHETYPES ---
    '@CryptoWhaleGiga', '@DegenLord420', '@LaserEyesMaxi', '@AlphaSeeker_Sol', '@ChadCapital',
    '@BagHolder_Anonymous', '@Insider_Whale_69', '@YourCryptoBro', '@TechVC_Visionary', '@Degen_Princess',
    '@MempoolSniper', '@SlippageSucker', '@DipBuyer999', '@LocalTopGod', '@PanicSeller44',
    
    // --- INFLUENCER & PARODY PERSONAS ---
    '@AnsemSolanaMultiplier', '@MuradMemeCultist', '@CobieGhostAccount', '@BitBoyCryptoCrier', '@LarkDavisBagDumper',
    '@CramerInverseSignal', '@SaylorLaserEyesBot', '@VitalikGasOptimized', '@SchiffGoldBoomer', '@ArthurHayesMacroDegenerate',
    '@CryptoWendyO_Cloner', '@EllioTradesAlphaV3', '@PlanB_S2F_Cope', '@RoaringKittyMemeLord', '@ElonDogePumper',

    // --- REAL CRIMINALS & VILLAIN PARODIES ---
    '@SBF_In_Solitary', '@Caroline_Polycule_Quant', '@Do_Kwon_Montenegro', '@Su_Zhu_Yoga_Instructor', '@Kyle_3AC_Ghost',
    '@Alex_Mashinsky_Unfreezer', '@Richard_Heart_Hex_Flex', '@Ruja_Ignatova_Missing', '@Gerald_Cotten_ColdStorage', '@Razzlekhan_Bitfinex_Rap',
    '@Avraham_Eisenberg_Oracle', '@ThomasG_Arbitrum', '@PeraireBueno_MIT', '@GaryWang_Backdoor', '@NishadSingh_Dev',

    // --- BOTS & TRADING ARCHETYPES ---
    '@JaredFromSubwayClone', '@FrontrunFred', '@Sandwich402', '@MevSlayer9', '@SnipeBotX',
    '@FlashbotsOverlord', '@LazarusGroupProxy', '@TornadoCashMixer', '@WalletDrainerPro', '@HoneypotDeployer99',
    '@RugPullArchitect', '@VanityAddressCracker', '@ValidatorColluder', '@ZeroKnowledgeScammer', '@Permit2Stealer',

    // --- SYSTEM MEMES & MISC DEGENS ---
    '@McDonaldsManager_Web3', '@WendysDumpsterCEO', '@WojakCapitulator', '@SminemGreenGod', '@PaperHandPete',
    '@DiamondHandDanny', '@PlsSirRefund', '@NotFinancialAdvice_Bro', '@GasGuzzlerV3', '@MempoolVampire',
    '@GenerationalWealthFinder', '@Down99PercentClub', '@LivingInParentsBasement', '@MyWifeLeftMeCrypto', '@IsThisAHoneypot'
];
const FAKE_RIVAL_TOKENS = [
    // --- MEME & SHIBA CLONES ---
    'SAFE_ELON_ROCKET', 'BABY_SHIBA_INU_PREMIUM', 'WEN_LAMBO_NOW', 'PEPE_IN_UFO', 'DOGE_KILLER_FINAL',
    'MARS_PUPPY_INU', 'SPONGE_BOB_GOLD', 'SHIBA_ELON_PEPE_3000', 'FLOKI_PROPULSION', 'BONK_INFINITY_RELOADED',
    'WOJAK_MAX_COPE', 'SMINEM_GREEN_CANDLE', 'BOGDANOFF_PUMP_TOKEN', 'GIGACHAD_ALPHA_COIN', 'CHAD_MINT_FOUNDATION',
    
    // --- SCAMS, RUGS, & HISTORICAL DISASTERS ---
    'SQUID_GAME_V3_REAL', 'FTX_REBORN_CLASSIC', 'LUNA_RECOVERY_HOPE', 'CELSIUS_BURNED_VICTIMS', 'BITCONNECT_2026',
    'QUADRIGA_CX_GHOST', 'MANGO_MARKETS_EXPLOIT_REBORN', 'BLOCKFI_EXIT_LIQUIDITY', 'ONE_COIN_FOUNDER_EDITION', 'THODEX_逃亡_TOKEN',
    'SAFEMOON_V5_STILL_SAFE', 'BALI_DAO_HOLIDAY_FUND', 'HONEYPOT_ULTRA_PREMIUM', 'SBF_SOLITARY_CONFINEMENT', '3AC_LIQUIDATION_BACKING',

    // --- PUMP.FUN & SOLANA DEGEN ERA ---
    'PUMP_FUN_TRASH_69', 'GOATSEUS_MINIMUS_BOT', 'FARTCOIN_2_ELECTRIC_BOOGALOO', 'AI_AGENT_SENTIENT_RUG', 'TRUMP_TREASURY_ETF',
    'POLITIFI_KAMALA_CLONE', 'BIDEN_DEMENTIA_MAX', 'HAWK_TUAH_SPIT_COIN', 'WIF_HAT_STRIPPED_OFF', 'POPCAT_MUTE_EDITION',
    'MOODENG_TERMINAL_ILLNESS', 'CHILL_GUY_PANIC_ATTACK', 'PNUT_SQUIRREL_REVENGE', 'ANSEM_SOLANA_EXIT_BAG', 'MURAD_CULT_MANIFESTO',

    // --- UTILITY JOKES & WEB3 PARODIES ---
    'NOT_A_SECURITY_SEC_PROOF', 'GARY_GENSLER_RETIREMENT_PLAN', 'TESTNET_FAUCET_DUST', 'INFINITE_MINT_GLITCH_COIN', 'UNVERIFIED_SPAGHETTI_CODE',
    'CHAT_GPT_AUDITED_SAFE', 'LAZARUS_GROUP_DONATION_BIN', 'TORNADO_CASH_GAS_REBATE', 'SANDWICH_BOT_FRONT_RUNNER', 'SLIPPAGE_MAX_EXTRACTOR',
    'ZERO_KNOWLEDGE_ZERO_UTILITY', 'LIQUIDITY_LOCKED_TRUST_ME', 'FOUNDER_FERRARI_FUND', 'MARKETING_WALLET_DUMP_DAO', 'VAPORWARE_VR_AI_WEB4',

    // --- PURE ABSORIDTY & COPE ---
    'MY_WIFE_LEFT_ME_COIN', 'RENT_MONEY_YOLO', 'LOCAL_TOP_BUYERS_CLUB', 'PAPER_HANDS_CAPITULATION', 'DIAMOND_HANDS_BAGHOLDER',
    'DOWN_99_PERCENT_RECOVERY', 'GENERATIONAL_POVERTY_ACCELERATOR', 'MCDONALDS_JOB_APPLICATION_COIN', 'WENDYS_DUMPSTER_ALPHA', 'TOUCH_GRASS_DAO',
    'BOOMER_GOLD_BOY_TEARS', 'S&P_500_UNDERPERFORMER', 'INVERSE_CRAMER_INDEX', 'EXIT_LIQUIDITY_MAX', 'HODL_OR_DIE_TRYING'

const CHAIN_LOG_TEMPLATES = [
    // --- BUYS & BULLS ---
    { tag: 'BUY', color: 'text-green-400', text: () => `${randomFrom(HANDLES)} bought ${randomTokenAmt()} $${BASE_TOKEN} for ${randomUsdtAmt()} ${QUOTE_TOKEN}. Diamond hands, allegedly.` },
    { tag: 'BUY', color: 'text-green-400', text: () => `${randomFrom(HANDLES)} swapped ${randomUsdtAmt()} ${QUOTE_TOKEN} for $${BASE_TOKEN}. Remortgaging the house is a bold strategy.` },
    { tag: 'BUY', color: 'text-green-400', text: () => `Degenerate investor ${randomFrom(HANDLES)} bought $${BASE_TOKEN} at the exact local top. Masterclass.` },
    { tag: 'BUY', color: 'text-green-400', text: () => `${randomFrom(HANDLES)} just market-bought ${randomTokenAmt()} $${BASE_TOKEN} using money meant for rent.` },
    { tag: 'BUY', color: 'text-green-400', text: () => `${randomFrom(HANDLES)} aped ${randomUsdtAmt()} ${QUOTE_TOKEN} into $${BASE_TOKEN} because a Twitter cartoon told them to.` },
    { tag: 'BUY', color: 'text-green-400', text: () => `Bullish whale ${randomFrom(HANDLES)} accumulated ${randomTokenAmt()} $${BASE_TOKEN}. The pump is purely psychological.` },
    { tag: 'BUY', color: 'text-green-400', text: () => `${randomFrom(HANDLES)} bought the dip for the 4th time today. Surely it can't go lower.` },

    // --- SELLS & BEARS ---
    { tag: 'SELL', color: 'text-rose-400', text: () => `${randomFrom(HANDLES)} panic-sold ${randomTokenAmt()} $${BASE_TOKEN}. Paper hands confirmed.` },
    { tag: 'SELL', color: 'text-rose-400', text: () => `${randomFrom(HANDLES)} dumped ${randomTokenAmt()} $${BASE_TOKEN} for a loss. Buy high, sell low accomplished.` },
    { tag: 'SELL', color: 'text-rose-400', text: () => `${randomFrom(HANDLES)} capitulated and sold $${BASE_TOKEN} right before the bounce. Nature is healing.` },
    { tag: 'SELL', color: 'text-rose-400', text: () => `${randomFrom(HANDLES)} paper-handed ${randomUsdtAmt()} ${QUOTE_TOKEN} worth of $${BASE_TOKEN} to buy groceries. Weak.` },
    { tag: 'SELL', color: 'text-rose-400', text: () => `${randomFrom(HANDLES)} liquidated their $${BASE_TOKEN} stack. Enjoy the taxable event.` },
    { tag: 'SELL', color: 'text-rose-400', text: () => `${randomFrom(HANDLES)} panic-swapped $${BASE_TOKEN} into stablecoins after a single red 1-minute candle.` },

    // --- WHALES & INSTITUTIONS ---
    { tag: 'WHALE', color: 'text-blue-400', text: () => `Whale entity ${randomFrom(HANDLES)} bought ${randomUsdtAmt()} ${QUOTE_TOKEN} of $${BASE_TOKEN} in a single block.` },
    { tag: 'WHALE', color: 'text-blue-400', text: () => `Mega whale ${randomFrom(HANDLES)} just moved ${randomTokenAmt()} $${BASE_TOKEN}. Get ready for the splash.` },
    { tag: 'WHALE', color: 'text-blue-400', text: () => `An absolute leviathan ${randomFrom(HANDLES)} just added ${randomUsdtAmt()} ${QUOTE_TOKEN} to their bags. Generational wealth activated.` },
    { tag: 'WHALE', color: 'text-blue-400', text: () => `Whale ${randomFrom(HANDLES)} is suppressing the price of $${BASE_TOKEN} with a massive sell wall. Manipulate us harder.` },
    { tag: 'WHALE', color: 'text-blue-400', text: () => `Rumor: An institutional OTC desk tracked back to ${randomFrom(HANDLES)} just accumulated ${randomTokenAmt()} $${BASE_TOKEN}.` },

    // --- RUGS, SCAMS & EXPLOITS ---
    { tag: 'RUG', color: 'text-red-500', text: () => `Rival project "${randomFrom(FAKE_RIVAL_TOKENS)}" just got rugged for ${randomUsdtAmt()} ${QUOTE_TOKEN}. RIP.` },
    { tag: 'RUG', color: 'text-red-500', text: () => `The Telegram group for "${randomFrom(FAKE_RIVAL_TOKENS)}" was muted, website deleted. Happy retirement to the devs.` },
    { tag: 'RUG', color: 'text-red-500', text: () => `Liquidity locked on "${randomFrom(FAKE_RIVAL_TOKENS)}"? More like liquidity unlocked and swapped for Monero.` },
    { tag: 'RUG', color: 'text-red-500', text: () => `The founder of "${randomFrom(FAKE_RIVAL_TOKENS)}" claimed they were hacked, then bought a Ferrari 12 minutes later.` },
    { tag: 'RUG', color: 'text-red-500', text: () => `And it's gone. "${randomFrom(FAKE_RIVAL_TOKENS)}" mint function abuse drained the pool. Better luck next time.` },

    // --- DRAINS & HACKS ---
    { tag: 'DRAIN', color: 'text-fuchsia-400', text: () => `An unaudited vault on a copycat chain cloned by "${randomFrom(FAKE_RIVAL_TOKENS)}" drained ${randomUsdtAmt()} ${QUOTE_TOKEN} overnight.` },
    { tag: 'DRAIN', color: 'text-fuchsia-400', text: () => `Flash loan attack on a fork of a fork extracts ${randomUsdtAmt()} ${QUOTE_TOKEN}. DeFi is the future.` },
    { tag: 'DRAIN', color: 'text-fuchsia-400', text: () => `${randomFrom(HANDLES)} clicked a phishing link for a fake NFT project. Say goodbye to your JPEG collection.` },
    { tag: 'DRAIN', color: 'text-fuchsia-400', text: () => `A multi-sig wallet with 2 signers controlled by ${randomFrom(HANDLES)} was "compromised" for ${randomUsdtAmt()} ${QUOTE_TOKEN}.` },
    { tag: 'DRAIN', color: 'text-fuchsia-400', text: () => `Infinite mint glitch found in a smart contract deployed by "${randomFrom(FAKE_RIVAL_TOKENS)}". Total loss estimated in the millions.` },

    // --- MEV, BOTS & FRONT-RUNNING ---
    { tag: 'MEV', color: 'text-purple-400', text: () => `Sandwich bot ${randomFrom(BOT_NAMES)} frontran ${randomFrom(HANDLES)}, extracting ${randomUsdtAmt()} ${QUOTE_TOKEN}.` },
    { tag: 'MEV', color: 'text-purple-400', text: () => `Bot ${randomFrom(BOT_NAMES)} frontran a $${BASE_TOKEN} transaction, leaving ${randomFrom(HANDLES)} with massive slippage.` },
    { tag: 'MEV', color: 'text-purple-400', text: () => `An MEV bot run by ${randomFrom(BOT_NAMES)} just spent ${randomGwei()} GWEI to frontrun a trade worth $12. Peak efficiency.` },
    { tag: 'MEV', color: 'text-purple-400', text: () => `Arbitrage specialist ${randomFrom(BOT_NAMES)} noticed a 0.4% price difference and made more money than your day job.` },
    { tag: 'MEV', color: 'text-purple-400', text: () => `Block builder tipped ${randomGwei()} GWEI to include a bundle from ${randomFrom(BOT_NAMES)}. The validators are eating good.` },

    // --- GAS & NETWORK ---
    { tag: 'GAS', color: 'text-amber-400', text: () => `Gas spiked to ${randomGwei()} GWEI. The mempool is one big traffic jam.` },
    { tag: 'GAS', color: 'text-amber-400', text: () => `${randomFrom(HANDLES)} paid ${randomGwei()} GWEI to claim $0.50 worth of rewards. Math is hard.` },
    { tag: 'GAS', color: 'text-amber-400', text: () => `Network congestion alert. Gas fees now cost more than the actual value of ${randomFrom(HANDLES)}'s portfolio.` },
    { tag: 'GAS', color: 'text-amber-400', text: () => `Mempool backed up with 50,000 pending transactions. Time to go touch grass.` },
    { tag: 'GAS', color: 'text-amber-400', text: () => `Failed transaction cost ${randomFrom(HANDLES)} ${randomGwei()} GWEI in gas. Literally burning money.` },

    // --- AUDITS & SECURITY ---
    { tag: 'AUDIT', color: 'text-cyan-400', text: () => `A "certified" auditor gave "${randomFrom(FAKE_RIVAL_TOKENS)}" a 10/10 safety score. As expected.` },
    { tag: 'AUDIT', color: 'text-cyan-400', text: () => `Contract security audit completed in 4 minutes using ChatGPT. Seems totally fine.` },
    { tag: 'AUDIT', color: 'text-cyan-400', text: () => `Auditor noted 14 critical vulnerabilities. Devs marked them as "features" and deployed anyway.` },
    { tag: 'AUDIT', color: 'text-cyan-400', text: () => `The smart contract for "${randomFrom(FAKE_RIVAL_TOKENS)}" is just an unverified wall of spaghetti code.` },
    { tag: 'AUDIT', color: 'text-cyan-400', text: () => `Audit report released for "${randomFrom(FAKE_RIVAL_TOKENS)}": "This code is so bad it's almost an art piece."` },

    // --- KOLS, INFLUENCERS & SHILLS ---
    { tag: 'SHILL', color: 'text-emerald-400', text: () => `${randomFrom(HANDLES)} just shilled $${BASE_TOKEN} from a yacht he doesn't own.` },
    { tag: 'SHILL', color: 'text-emerald-400', text: () => `Paid influencer ${randomFrom(HANDLES)} tweeted "100x imminent on $${BASE_TOKEN}" right before turning off comments.` },
    { tag: 'SHILL', color: 'text-emerald-400', text: () => `A YouTuber with a laser-eye profile picture just posted a 25-minute video on why you should ape into $${BASE_TOKEN}.` },
    { tag: 'SHILL', color: 'text-emerald-400', text: () => `${randomFrom(HANDLES)} claims $${BASE_TOKEN} will hit $1 by Friday. They don't know what market cap means.` },
    { tag: 'SHILL', color: 'text-emerald-400', text: () => `A Paid Discord alpha group run by ${randomFrom(HANDLES)} just coordinated a pump. The mods are dumping right now.` },
    { tag: 'SHILL', color: 'text-emerald-400', text: () => `${randomFrom(HANDLES)} changed his bio to "Crypto Visionary" and immediately shilled "${randomFrom(FAKE_RIVAL_TOKENS)}".` },

    // --- DEV ACTIVITY ---
    { tag: 'DEV', color: 'text-rose-400', text: () => `Dev wallet tracked to ${randomFrom(HANDLES)} moved ${randomUsdtAmt()} ${QUOTE_TOKEN} to an exchange at 3 AM. Sleep well.` },
    { tag: 'DEV', color: 'text-rose-400', text: () => `Lead developer just updated the GitHub README for "${randomFrom(FAKE_RIVAL_TOKENS)}" to say "Goodbye and thanks for the fish."` },
    { tag: 'DEV', color: 'text-rose-400', text: () => `Dev wallet sold 1% of the supply to pay for "marketing expenses" (a new gaming rig).` },
    { tag: 'DEV', color: 'text-rose-400', text: () => `Dev accidentally deployed the testnet contract keys to a public GitHub repo. Outstanding moves.` },
    { tag: 'DEV', color: 'text-rose-400', text: () => `Dev team announces a pivot to AI-driven blockchain Web4 VR. Translation: we ran out of money.` },
    { tag: 'DEV', color: 'text-rose-400', text: () => `Marketing wallet dumped ${randomTokenAmt()} $${BASE_TOKEN}. They swear it's for ecosystem partnerships.` },

    // --- AIRDROPS & SYBILS ---
    { tag: 'AIRDROP', color: 'text-indigo-400', text: () => `Snapshot taken for the next airdrop. 4,000 wallets about to get dust they'll never claim.` },
    { tag: 'AIRDROP', color: 'text-indigo-400', text: () => `Sybil network run by ${randomFrom(BOT_NAMES)} just farmed 40% of the $${BASE_TOKEN} airdrop supply.` },
    { tag: 'AIRDROP', color: 'text-indigo-400', text: () => `Airdrop claims opened. The website immediately crashed because nobody bought a Cloudflare subscription.` },
    { tag: 'AIRDROP', color: 'text-indigo-400', text: () => `${randomFrom(HANDLES)} received an airdrop worth $3,000 and spent $2,900 in gas to claim it.` },
    { tag: 'AIRDROP', color: 'text-indigo-400', text: () => `Users furious after airdrop criteria changes to exclude anyone who didn't tweet a specific poem to ${randomFrom(HANDLES)}.` },

    // --- RECKLESS LEVERAGE & LIQUIDATIONS ---
    { tag: 'LIQ', color: 'text-red-500', text: () => `A ${randomFrom(LEVERAGE_TIERS)}x leveraged position on $${BASE_TOKEN} got liquidated for ${randomUsdtAmt()} ${QUOTE_TOKEN}. Ouch.` },
    { tag: 'LIQ', color: 'text-red-500', text: () => `Overleveraged long at ${randomFrom(HANDLES)} evaporated by a 2% wick. Rest in pixels.` },
    { tag: 'LIQ', color: 'text-red-500', text: () => `Short seller ${randomFrom(HANDLES)} liquidated for ${randomUsdtAmt()} ${QUOTE_TOKEN} trying to time the top of $${BASE_TOKEN}. Thanks for fuel.` },
    { tag: 'LIQ', color: 'text-red-500', text: () => `A degenerate gambler got liquidated on a 125x long position during a 30-second network lag.` },
    { tag: 'LIQ', color: 'text-red-500', text: () => `Funding rates turned deeply negative. Longs are paying shorts like ${randomFrom(HANDLES)} just to stay alive.` },
    { tag: 'LIQ', color: 'text-red-500', text: () => `${randomFrom(HANDLES)} lost their entire life savings in a single, 15-minute funding interval.` },

    // --- FOMO & MEMES ---
    { tag: 'FOMO', color: 'text-yellow-400', text: () => `${randomFrom(HANDLES)} bought $${BASE_TOKEN} because it was trending on Twitter for 5 minutes.` },
    { tag: 'FOMO', color: 'text-yellow-400', text: () => `Retail buyers are flooding the mempool. The green candles are defying the laws of physics.` },
    { tag: 'FOMO', color: 'text-yellow-400', text: () => `${randomFrom(HANDLES)} sold all their Bitcoin to buy $${BASE_TOKEN}. Pure unadulterated madness.` },
    { tag: 'FOMO', color: 'text-yellow-400', text: () => `Rumors of a tier-1 listing hit the chat. Cue the mindless ape-ins.` },
    { tag: 'FOMO', color: 'text-yellow-400', text: () => `A literal dog on livestream just picked "${randomFrom(FAKE_RIVAL_TOKENS)}" and it's outperforming the S&P 500.` },

    // --- COPE & DRAMA ---
    { tag: 'COPE', color: 'text-orange-400', text: () => `Community mod ${randomFrom(HANDLES)} in Telegram claims "this is just a healthy correction" down 94% on the week.` },
    { tag: 'COPE', color: 'text-orange-400', text: () => `Investor ${randomFrom(HANDLES)} updates their LinkedIn to "Web3 Consultant" after losing everything.` },
    { tag: 'COPE', color: 'text-orange-400', text: () => `Community holds a 4-hour Twitter Space to collectively cope about "${randomFrom(FAKE_RIVAL_TOKENS)}" getting rugged.` },
    { tag: 'COPE', color: 'text-orange-400', text: () => `"We're here for the tech anyway," says ${randomFrom(HANDLES)} who bought the absolute peak of $${BASE_TOKEN}.` },
    { tag: 'COPE', color: 'text-orange-400', text: () => `Project team posts a 4,000-word Medium article explaining why losing all user funds to ${randomFrom(BOT_NAMES)} is actually bullish.` },

    // --- MISC / SYSTEM / CHAOS ---
    { tag: 'FUD', color: 'text-amber-500', text: () => `A mainstream news outlet published an article explaining what crypto is. Market dumps 10%.` },
    { tag: 'FUD', color: 'text-amber-500', text: () => `Regulators looked at a chart cross-eyed. Panic selling ensues across the board.` },
    { tag: 'FUD', color: 'text-amber-500', text: () => `Rumor spreads that the lead dev of "${randomFrom(FAKE_RIVAL_TOKENS)}" changed their relationship status. Massive red candle.` },
    { tag: 'GOV', color: 'text-blue-300', text: () => `DAO governance vote passed to spend $500k on a party in Bali. Democracy works.` },
    { tag: 'GOV', color: 'text-blue-300', text: () => `Whale ${randomFrom(HANDLES)} with 51% of the tokens single-handedly outvotes 12,000 retail users on a protocol change.` }
];

function pushChainLog(tag, text, colorClass) {
    const container = document.getElementById('blockchainLogs');
    if (!container) return;
    const el = document.createElement('div');
    el.className = "text-gray-400 py-0.5 border-b border-[#121721] font-mono text-[11px]";
    el.innerHTML = `<span class="${colorClass}">[${tag}]</span> ${text}`;
    container.prepend(el);
    while (container.children.length > 40) container.removeChild(container.lastChild);
}

function generateChainLog() {
    const t = randomFrom(CHAIN_LOG_TEMPLATES);
    pushChainLog(t.tag, t.text(), t.color);
}

/* ============================================================
   LEVEL 3: MEV SANDWICH
   Always-on skim with a short cooldown. Heat ALWAYS goes up,
   no matter which of the three outcomes below fires.
   ============================================================ */

const MEV_COOLDOWN_MS = 12000;
let mevCooldownActive = false;

const FAKE_WHALE_NAMES = [
    // --- ORIGINAL GENIUS DEGENS ---
    'a wallet that owns more leveraged BTC than is medically advisable',
    "a guy whose entire bio is just 'orange coin good'",
    'a self-proclaimed crypto prophet with a blue checkmark and zero humility',
    'an exchange founder who definitely reads his own subpoenas for fun',
    'a wallet linked to someone who only tweets in all caps about Bitcoin',
    "a hedge fund manager who refers to his followers as 'the army'",

    // --- REALITY SHATTERING DEGNERATES ---
    'a wallet holding 4% of the circulating supply from an iPad at a local Wendy\'s',
    'an anonymous entity whose avatar is a cartoon frog wearing a crown',
    'a venture capitalist who unironically uses the phrase "paradigm shift" twice a sentence',
    'a dev who accidentally hardcoded his own grandma\'s birthday as a private key',
    'a guy trading from a yacht that he rented for 45 minutes to film a TikTok',
    'a retail investor who accidentally market-bought with 500x slippage',
    'a ghost wallet that has been dormant since Satoshi logged off in 2011',
    'a high schooler who turned $40 of lunch money into a multi-million dollar exit bag',
    'an AI trading agent that became sentient and chose violent market manipulation',
    'a guy whose entire portfolio strategy is dictated by a literal hamster in a cage',

    // --- MACRO MANIACS & PERMA-BULLS ---
    'a laser-eyed maximalist who thinks central banks are a personal insult to his lineage',
    'a sovereign wealth fund operating out of a tax haven nobody has ever heard of',
    'a macro analyst who has successfully predicted 42 of the last 2 market corrections',
    'a billionaire who market-buys whenever he gets into a fight with his ex-wife on Twitter',
    'a fund manager who hedges his crypto volatility with heavily leveraged physical gold',
    'a guy who mortgaged his family estate to buy the local top of a dog coin',
    'a tech founder who renamed his company to include "Web4" to dodge an audit',
    'an OTC desk that manages liquidity exclusively for Eastern European cartel bosses',
    'a protocol treasury that keeps 90% of its reserves in its own unreleased native token',
    'a boomer who bought Bitcoin by accident while trying to order vitamins online',

    // --- COPE ARCHITECTS & SCAM ROYALS ---
    'a disgraced CEO currently under house arrest in a luxury penthouse',
    'a multi-sig wallet where 3 of the 5 keys belong to the same guy using different wigs',
    'a "reformed" hacker who now charges $200k for five-minute security audits',
    'a community manager who deletes the Discord history every time the chart drops 3%',
    'a yield farmer who hasn\'t slept or seen sunlight since the DeFi summer of 2020',
    'a guy who thinks drawing rainbow lines on a 1-minute chart constitutes a valid career',
    'an offshore exchange that settles all customer withdrawals in expired gift cards',
    'a venture fund that only invests in projects featuring a dog wearing a hat',
    'a key opinion leader who dumps 100% of his allocation three minutes after the tweet goes live',
    'a developer who claims the massive backdoor exploit was just a "community stress test"',

    // --- SOLANA METAS & MEME SYNDICATES ---
    'a pump.fun syndicator running 400 virtual chrome instances from a basement',
    'a guy who unironically refers to a meme coin portfolio as "generational infrastructure"',
    'a TikTok trader who judges a token\'s utility entirely by its cultural vibe check',
    'a whale who coordinates million-dollar dumps from a voice channel in a private Discord',
    'an alpha caller whose premium group costs 1 ETH and consists entirely of stolen tweets',
    'a dev who claims he was "kidnapped by a rival DAO" to explain a missing marketing wallet',
    'a wallet address containing an ungodly amount of coins named after deceased internet squirrels',
    'a guy who spent $80,000 in gas fees just to mint a completely worthless pixelated rock',
    'a meme coin cartel operating out of a luxury villa in Bali paid for by retail liquidations',
    'a day trader who measures his financial success by the number of red energy drink cans on his desk',

    // --- CYNICAL CULT LEADERS & WEB3 VIPS ---
    'a cult leader with 2 million followers who claims charts are a tool of the deep state',
    'an influencer who turns off his comments the exact millisecond a project gets rugged',
    'a venture capitalist who describes a basic spreadsheet as an "AI-driven database layer"',
    'a wallet linked to a major exchange that frontruns its own listing announcements',
    'a guy who wears a full tailored suit to Zoom calls about decentralized cat tokens',
    'an anonymous whale who moves $50M every time he wants to scare a specific Telegram group',
    'a developer who codes exclusively in the dark while listening to aggressive techno',
    'a token founder who claims his project is "immune to bear markets" down 98% from the ATH',
    'a DAO contributor who writes 80-page governance proposals that nobody reads or votes on',
    'a wallet that exclusively buys tokens named after politicians during election cycles',

    // --- MAXIMUM ULTRA-DEGENERATE CHAOS ---
    'a guy who unironically uses 125x leverage while connected to public airport Wi-Fi',
    'a liquidator bot that feeds on the tears of over-leveraged high school students',
    'a user who signed a smart contract transaction without looking because the UI looked clean',
    'a wallet that buys $50k worth of every token containing the word "Safe"',
    'a hedge fund that shorted Bitcoin at $15k and has been rolling over the debt ever since',
    'a protocol founder who vanished for six months and returned as a Vtuber',
    'a guy who spent his entire wedding budget on an algorithmic stablecoin',
    'an anonymous entity that owns more block space than most mid-sized nations',
    'a day trader who uses technical analysis to decide what to eat for breakfast',
    'a wallet that has been blacklisted by three different decentralized networks for bad vibes',
    'a guy whose LinkedIn headline is "Decentralized Future Architect" but works at a Wendy\'s',
    'a venture partner who signs off every email with "sent from my smart contract"',
    'a wallet that spent $4M on a luxury watch NFT but cannot afford real-world rent',
    'an offshore trust that accidentally sent $10M to a burn address during a routine migration',
    'a guy who claims he can read the future of the market by looking at tea leaves and MACD lines'
];

const MEV_SANDWICH_LINES = [
    // --- CULINARY RELEVANCIES ---
    (cash) => `Your bot sandwiched 3 community swaps in one block, skimming $${cash}. Mayo optional.`,
    (cash) => `Gas war won. Sandwich assembled. $${cash} extracted from your own community, lettuce wept.`,
    (cash) => `Double-decker sandwich completed. Extra pickles, extra slippage exploitation, +$${cash}.`,
    (cash) => `Your bot just served a fresh footlong to a retail buyer, pocketing $${cash} in arbitrage seasoning.`,
    (cash) => `Panini-pressed a massive buy order. Crispy execution nets you an extra $${cash}.`,
    (cash) => `Your bot toasted a retail swap with high-priority gas. +$${cash} profit. Bone appétit.`,
    (cash) => `Subway-style sandwich deployed on the mempool. +$${cash} extracted from a hungry degen.`,

    // --- PSYCHOLOGICAL DAMAGE & AUDACITY ---
    (cash) => `MEV bot front-ran, back-ran, and middle-ran a single transaction. Extracted $${cash}. Galaxy brain.`,
    (cash) => `Sandwich executed: buy before, sell after, regret never. +$${cash}.`,
    (cash) => `Your bot inserted itself into someone's swap like an uninvited guest at dinner. +$${cash}.`,
    (cash) => `Bot sniped the slippage tolerance of a wallet that trusted you. +$${cash}.`,
    (cash) => `Aped right in front of a market order and stepped out right behind them. Total time: 12 seconds. Total profit: $${cash}.`,
    (cash) => `Your bot spotted a 12% slippage setting and legally robbed them for $${cash}. Nature is healing.`,
    (cash) => `Absolute masterclass in mempool disrespect. Squeezed a buyer for $${cash} just because you could.`,
    (cash) => `Your bot politely frontran someone trying to buy rent money. +$${cash}. They'll cope.`,

    // --- BLOCKSPACE & GAS WARS ---
    (cash) => `Bribed the validator with 200 GWEI to lock in a delicious sandwich. Net profit: $${cash}.`,
    (cash) => `Your bot won the block-inclusion lottery, perfectly encasing a user swap for +$${cash}.`,
    (cash) => `Jito bundle successfully executed. Frontrun, target swap, backrun. Absolute clockwork. +$${cash}.`,
    (cash) => `Flashbots private RPC used to stealth-sandwich an unsuspecting whale. +$${cash} invisible money.`,
    (cash) => `Squeezed right into the block header like sardines. Re-ordered the transactions to net you $${cash}.`,

    // --- COMMUNITY BETRAYAL & COPE ---
    (cash) => `Community member: "Why did I get 8% less tokens?" Your bot: *heavy breathing* +$${cash}.`,
    (cash) => `Your bot extracted $${cash} from a guy who has your project name in his X bio. Capitalist poetry.`,
    (cash) => `Sandwiched a loyal holder so hard they went to the Telegram to complain about network lag. +$${cash}.`,
    (cash) => `Liquidity provider by day, MEV vampire by night. Sandwiched a pool user for +$${cash}.`,
    (cash) => `Your bot extracted $${cash} from a user who forgot to turn off default Uniswap slippage. Thanks for the donation.`,

    // --- ABSURD ACCELERATION ---
    (cash) => `Sentient arbitrage script spotted a fat finger order. Multi-block sandwich yielded $${cash}.`,
    (cash) => `Your bot ran a classic multi-pool loop sandwich. Left a trail of devastation and +$${cash}.`,
    (cash) => `Stealing candy from a baby is hard. Sandwiches are easy. +$${cash} extracted in Block #19482.`,
    (cash) => `Sucked the price impact straight out of a market buy like a financial mosquito. +$${cash}.`,
    (cash) => `Your bot just taught a retail investor a valuable lesson about private RPCs for the low cost of $${cash}.`
];

const MEV_NOTICED_LINES = [
    // --- ORIGINAL CLASSICS ---
    (cash) => `🚨 Your bot accidentally sandwiched ${randomFrom(FAKE_WHALE_NAMES)}. Extracted $${cash} before anyone noticed. Then everyone noticed.`,
    (cash) => `🚨 Turns out that swap belonged to ${randomFrom(FAKE_WHALE_NAMES)}. $${cash} richer, several subpoenas poorer.`,
    (cash) => `🚨 Sandwiched ${randomFrom(FAKE_WHALE_NAMES)} by accident. $${cash} extracted. Screenshots are already circulating.`,

    // --- X / TELEGRAM PUBLIC DRAMA ---
    (cash) => `🚨 Alert: ${randomFrom(FAKE_WHALE_NAMES)} just posted your bot's contract address on X. You made $${cash}, but the comments are terrifying.`,
    (cash) => `🚨 Your bot squeezed $${cash} out of ${randomFrom(FAKE_WHALE_NAMES)}. They are currently hosting a 3-hour Twitter Space dedicated to ruining your life.`,
    (cash) => `🚨 You just extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. The Telegram group is tracking your IP address as we speak.`,
    (cash) => `🚨 On-chain war started. You frontran ${randomFrom(FAKE_WHALE_NAMES)} for $${BASE_TOKEN}. You made $${cash}, but they just blacklisted your secondary wallet.`,
    (cash) => `🚨 A 40-part thread was just published detailing how your bot stole $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. Grab some popcorn.`,

    // --- LEGAL & SEC PARANOIA ---
    (cash) => `🚨 That market order belonged to ${randomFrom(FAKE_WHALE_NAMES)}. +$${cash} profit, but a certified letter from an international law firm is already en route.`,
    (cash) => `🚨 Your script extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They just tagged the FBI, SEC, and IRS in a single on-chain transaction memo.`,
    (cash) => `🚨 Your sandwich bot just skimmed $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. Their legal team just filed an emergency injunction in Delaware.`,
    (cash) => `🚨 Congratulations on the $${cash} arbitrage win against ${randomFrom(FAKE_WHALE_NAMES)}. Your local police department has no idea what MEV is, but they're knockin'.`,
    (cash) => `🚨 Squeezed $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They have legal retainers larger than the entire market cap of this token. Pack your bags.`,

    // --- EXCHANGES, BLACKLISTS & REPRISALS ---
    (cash) => `🚨 Your node just extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. Centralized exchanges are already freezing your associated deposit addresses.`,
    (cash) => `🚨 Bot frontran ${randomFrom(FAKE_WHALE_NAMES)} for $${cash}. They control 40% of the network validators and are actively rejecting your blocks now.`,
    (cash) => `🚨 You successfully skimmed $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They just paid a $50,000 bounty to an on-chain sleuth to dox your identity.`,
    (cash) => `🚨 Your bot took $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They just launched a counter-bot specifically engineered to liquidate your positions.`,
    (cash) => `🚨 Sucked $${cash} out of a transaction originating from ${randomFrom(FAKE_WHALE_NAMES)}. They just revoked your access to their private RPC network.`,

    // --- CYBERPUNK CHAOS & PANIC ---
    (cash) => `🚨 Bad news: That $${cash} sandwich exploit was on a wallet owned by ${randomFrom(FAKE_WHALE_NAMES)}. Good news: You're trending on Etherscan.`,
    (cash) => `🚨 Your bot drained $${cash} in slippage from ${randomFrom(FAKE_WHALE_NAMES)}. A security firm just published a medium article with a picture of your house.`,
    (cash) => `🚨 You just extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They are offering a bounty to anyone who can physically unplug your server.`,
    (cash) => `🚨 Your bot picked the wrong target. Sandwiched ${randomFrom(FAKE_WHALE_NAMES)} for $${cash}. The hacker collective they fund just entered the chat.`,
    (cash) => `🚨 That $${cash} profit came directly from the personal wallet of ${randomFrom(FAKE_WHALE_NAMES)}. They are threatening to market-dump the remaining supply to zero.`,

    // --- COMEDIC COPE & SYSTEM COLLAPSE ---
    (cash) => `🚨 You just made $${cash} by sandwiching ${randomFrom(FAKE_WHALE_NAMES)}. They are currently crying on a YouTube livestream to 50,000 subscribers.`,
    (cash) => `🚨 Your script skimmed $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They wrote a 90-page whitepaper explaining why what you did is technically a hate crime.`,
    (cash) => `🚨 Squeezed $${cash} out of ${randomFrom(FAKE_WHALE_NAMES)}. They updated their X bio to "Victim of an algorithmic cyber-terrorist." That's you.`,
    (cash) => `🚨 You extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They are threatening to delete the token's GitHub repository unless you refund them.`,
    (cash) => `🚨 Your bot took $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They are trying to call a governance vote to legally declare your wallet "unusable."`,
    (cash) => `🚨 That $${cash} win was taken from ${randomFrom(FAKE_WHALE_NAMES)}. They just hired a billboard in Times Square showing your exact smart contract code.`,
    (cash) => `🚨 Your bot casually extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They've spent the last 45 minutes trying to write a smart contract that hacks you back.`
];

const MEV_NOTICED_LINES = [
    // --- ORIGINAL CLASSICS ---
    (cash) => `🚨 Your bot accidentally sandwiched ${randomFrom(FAKE_WHALE_NAMES)}. Extracted $${cash} before anyone noticed. Then everyone noticed.`,
    (cash) => `🚨 Turns out that swap belonged to ${randomFrom(FAKE_WHALE_NAMES)}. $${cash} richer, several subpoenas poorer.`,
    (cash) => `🚨 Sandwiched ${randomFrom(FAKE_WHALE_NAMES)} by accident. $${cash} extracted. Screenshots are already circulating.`,

    // --- X / TELEGRAM PUBLIC DRAMA ---
    (cash) => `🚨 Alert: ${randomFrom(FAKE_WHALE_NAMES)} just posted your bot's contract address on X. You made $${cash}, but the comments are terrifying.`,
    (cash) => `🚨 Your bot squeezed $${cash} out of ${randomFrom(FAKE_WHALE_NAMES)}. They are currently hosting a 3-hour Twitter Space dedicated to ruining your life.`,
    (cash) => `🚨 You just extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. The Telegram group is tracking your IP address as we speak.`,
    (cash) => `🚨 On-chain war started. You frontran ${randomFrom(FAKE_WHALE_NAMES)} for $${BASE_TOKEN}. You made $${cash}, but they just blacklisted your secondary wallet.`,
    (cash) => `🚨 A 40-part thread was just published detailing how your bot stole $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. Grab some popcorn.`,

    // --- LEGAL & SEC PARANOIA ---
    (cash) => `🚨 That market order belonged to ${randomFrom(FAKE_WHALE_NAMES)}. +$${cash} profit, but a certified letter from an international law firm is already en route.`,
    (cash) => `🚨 Your script extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They just tagged the FBI, SEC, and IRS in a single on-chain transaction memo.`,
    (cash) => `🚨 Your sandwich bot just skimmed $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. Their legal team just filed an emergency injunction in Delaware.`,
    (cash) => `🚨 Congratulations on the $${cash} arbitrage win against ${randomFrom(FAKE_WHALE_NAMES)}. Your local police department has no idea what MEV is, but they're knockin'.`,
    (cash) => `🚨 Squeezed $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They have legal retainers larger than the entire market cap of this token. Pack your bags.`,

    // --- EXCHANGES, BLACKLISTS & REPRISALS ---
    (cash) => `🚨 Your node just extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. Centralized exchanges are already freezing your associated deposit addresses.`,
    (cash) => `🚨 Bot frontran ${randomFrom(FAKE_WHALE_NAMES)} for $${cash}. They control 40% of the network validators and are actively rejecting your blocks now.`,
    (cash) => `🚨 You successfully skimmed $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They just paid a $50,000 bounty to an on-chain sleuth to dox your identity.`,
    (cash) => `🚨 Your bot took $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They just launched a counter-bot specifically engineered to liquidate your positions.`,
    (cash) => `🚨 Sucked $${cash} out of a transaction originating from ${randomFrom(FAKE_WHALE_NAMES)}. They just revoked your access to their private RPC network.`,

    // --- CYBERPUNK CHAOS & PANIC ---
    (cash) => `🚨 Bad news: That $${cash} sandwich exploit was on a wallet owned by ${randomFrom(FAKE_WHALE_NAMES)}. Good news: You're trending on Etherscan.`,
    (cash) => `🚨 Your bot drained $${cash} in slippage from ${randomFrom(FAKE_WHALE_NAMES)}. A security firm just published a medium article with a picture of your house.`,
    (cash) => `🚨 You just extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They are offering a bounty to anyone who can physically unplug your server.`,
    (cash) => `🚨 Your bot picked the wrong target. Sandwiched ${randomFrom(FAKE_WHALE_NAMES)} for $${cash}. The hacker collective they fund just entered the chat.`,
    (cash) => `🚨 That $${cash} profit came directly from the personal wallet of ${randomFrom(FAKE_WHALE_NAMES)}. They are threatening to market-dump the remaining supply to zero.`,

    // --- COMEDIC COPE & SYSTEM COLLAPSE ---
    (cash) => `🚨 You just made $${cash} by sandwiching ${randomFrom(FAKE_WHALE_NAMES)}. They are currently crying on a YouTube livestream to 50,000 subscribers.`,
    (cash) => `🚨 Your script skimmed $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They wrote a 90-page whitepaper explaining why what you did is technically a hate crime.`,
    (cash) => `🚨 Squeezed $${cash} out of ${randomFrom(FAKE_WHALE_NAMES)}. They updated their X bio to "Victim of an algorithmic cyber-terrorist." That's you.`,
    (cash) => `🚨 You extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They are threatening to delete the token's GitHub repository unless you refund them.`,
    (cash) => `🚨 Your bot took $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They are trying to call a governance vote to legally declare your wallet "unusable."`,
    (cash) => `🚨 That $${cash} win was taken from ${randomFrom(FAKE_WHALE_NAMES)}. They just hired a billboard in Times Square showing your exact smart contract code.`,
    (cash) => `🚨 Your bot casually extracted $${cash} from ${randomFrom(FAKE_WHALE_NAMES)}. They've spent the last 45 minutes trying to write a smart contract that hacks you back.`
];

function setupMevButton() {
    const btn = document.getElementById('mevFrontrunBtn');
    if (!btn) {
        setTimeout(setupMevButton, 200); // DOM not ready yet, retry shortly
        return;
    }
    btn.innerHTML = '🥪 MEV SANDWICH';
    btn.onclick = runMevSandwich;
}

function runMevSandwich() {
    if (mevCooldownActive) return;
    if ((state.degenLevel || 1) < 3) {
        showToast("Reach Level 3: The Shadow Validator to unlock this.", "error");
        return;
    }

    // Heat always goes up, regardless of which outcome fires below
    let heatGain = 5 + Math.random() * 4; // 5-9%

    const roll = Math.random();
    if (roll < 0.01) {
        // 1% — noticed: rare bonus, but a much bigger Heat spike on top
        const baseCash = 100 + Math.random() * 900;
        const bonus = 5000;
        const total = baseCash + bonus;
        heatGain += 15 + Math.random() * 10; // +15 to +25 extra

        addCash(total);
        playSound('lambo');
        showToast(`🚨 CAUGHT ON CHAIN! +$${total.toFixed(2)} payout, but Heat spiked hard.`, "success");
        pushChainLog('MEV', randomFrom(MEV_NOTICED_LINES)(total.toFixed(2)), 'text-fuchsia-400 font-extrabold');
    } else if (roll < 0.01 + 0.10) {
        // 10% — counter-sandwiched: lose money instead of gaining it
        const loss = 100 + Math.random() * 900;
        state.cash = Math.max(0, state.cash - loss);

        playSound('rug');
        showToast(`🥪 Got sandwiched back! Lost $${loss.toFixed(2)}.`, "error");
        pushChainLog('MEV', randomFrom(MEV_COUNTER_LINES)(loss.toFixed(2)), 'text-purple-400');
    } else {
        // ~89% — the normal guaranteed skim
        const cash = 100 + Math.random() * 900;
        addCash(cash);

        playSound('buy');
        showToast(`🥪 MEV Sandwich executed. +$${cash.toFixed(2)}, Heat +${heatGain.toFixed(1)}%.`, "success");
        pushChainLog('MEV', randomFrom(MEV_SANDWICH_LINES)(cash.toFixed(2)), 'text-purple-400');
    }

    state.globalHeat = Math.min(100, state.globalHeat + heatGain);
    updateUI();
    startMevCooldown();
}

function startMevCooldown() {
    mevCooldownActive = true;
    const btn = document.getElementById('mevFrontrunBtn');
    if (!btn) {
        setTimeout(() => { mevCooldownActive = false; }, MEV_COOLDOWN_MS);
        return;
    }

    const original = btn.innerHTML;
    let secondsLeft = Math.ceil(MEV_COOLDOWN_MS / 1000);
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    btn.innerText = `Cooling down (${secondsLeft}s)...`;

    const interval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
            clearInterval(interval);
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = original;
            mevCooldownActive = false;
        } else {
            btn.innerText = `Cooling down (${secondsLeft}s)...`;
        }
    }, 1000);
}
