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
    'Sandwich#402','MevSlayer#9','SnipeBotX','JaredFromSubwayClone','FrontrunFred',
    'GasGoblin#7','BlockBully','SlippageStalker','BaseFeeKiller','MempoolManiac',
    'FrontrunFelicia','BackrunBob','ArbDemon#31','SandwichSam','GasGhost',
    'ZeroConfidence#404','MEV_Maximalist','ProfitExtractor','TxReorderer','DarkpoolDave',
    'jaredFromSubwayEth','AtomicArbV2','FlashbotsFrederica','PrivateTxPirate','SandwichBot3000',
    'MempoolMagician','GweiWaster','TxCensorSam','BundleBuilder','RelayRaider',
    'BeefyMEV','SlippageSniper','BaseFeeBully','ReorgRobert','TimestampTamperer',
    'ValidatorVince','ProposerPirate','BlockBuilderBot','MaxExtractorX','UncleBobsBot',
    'SandwichSeeker42','MevMeerkat','GrumpyArb','TokenSniffer3k','LiqBot9000',
    'EarlyBirdMEV','GasWarGarry','TxPeeker','FrontierFrontrun','NinjaArb',
    'ShadowSandwich','PriorityFeePete','MevMachine','SneakySandwich','BlockspaceBarry',
    'FlashLoanFrank','AtomicSwapper','MempoolMole','BackrunBandit','TipMaximizer',
    'PriorityPirate','CensorshipCarl','BundleBandito','MevMuncher','GweiGremlin',
    'SandwichSorcerer','ArbAlchemist','FrontrunPhantom','MempoolMiner','SlippageSlayer',
];
const HANDLES = [
    '@ToiletAlpha','@CryptoChad420','@DegenDaily','@RugRadar','@LamboOrBust',
    '@BlockchainBro','@DiamondHandsDave','@SatoshisCousin','@NGMIOfficial','@WagmiWatcher',
    '@TokenTerrence','@MemecoinMike','@DeFiDegenerate','@HodlHarvey','@PumpPatrick',
    '@BasedAndBullish','@AlphaCaller99','@AnonymousDev404','@RetailSlayer','@CoinGossip',
    '@MoonMathGuy','@ChartGoblin','@OnChainOracle','@PrivateSaleVIP','@EarlyInvestorBro',
    '@SeedRoundSam','@VCShill','@FounderOfNothing','@TechBroTrades','@NotFinancialAdvice',
    '@DegenerateTrader','@MemecoinMillionaire','@ToTheMoonTerry','@PaperHandsPaul',
    '@IronHandsIrene','@BullMarketBully','@BearMarketBrian','@FOMOFrank','@FUDFighter',
    '@ShillStation','@NoPlanNoProblem','@ViralCryptoPost','@AlphaLeakAlert','@WhaleWatcher99',
    '@AuditedByMe','@RugCheckBot','@AnonymousDevGuy','@TeamTokens','@AdvisoryBoard69',
    '@VestingSchedule','@LiquidityLocker','@TokenomicsGuru','@SatoshiDreams','@EthMaximalistPro',
    '@CryptoInfluencer1','@PumpItTweets','@DumpAfterShill','@CallItFirst','@ImAlwaysEarly',
    '@TargetPriceGuru','@NeverSellNate','@BuyMoreBrendan','@ThisisTheWayWallet','@YoureAllLate',
    '@GmGmGmGm','@SerAlpha','@LiquidatedAgain','@UpOnlyOracle','@AnonymousWhispers',
    '@QuantStrategist','@OnchainDetective','@DegenApologist','@BullCaseOnly','@SillySeason',
];
const FAKE_RIVAL_TOKENS = [
    'SafeMoonJr','BabyToiletInu','ElonFlushCoin','PumpKingDAO','WetWipesFinance',
    'TurboRug3000','GoldenToiletCoin','MemeDrainProtocol','NuclearDumpToken','InfiniteHypeDAO',
    'FlushWarpFinance','PonziPepe','ScamSafuToken','AnonymousDevCoin','MidnightRug420',
    'ShibaFlushInu','BasedDegeneracy','HoneypotHero','PaperHandsProtocol','ExitLiquidityDAO',
    'BitConnectJr','SafeSquidToken','IronFinanceTwo','LunaClassicClassic','TerraFlushToken',
    'OneCoinRemake','QuadrigaDAO','AlamedalDAO','SBFBucks','CelsiusVault',
    'BlockFiYield','VoyagerDAO','GenesisCapitalToken','ThreeArrowsDown','DoKwonDollars',
    'TitanIronToken','SafePlusToken','TrueUSD3000','USDC_Depegged','FiatOnChain',
    'PepeMaximus','WojackFinance','ChadToken','BasedPepe','GigaChadDAO',
    'FlokiFlush','ShibaImpersonator','DogeKillerInu','MiniDoge420','BabyShiba2024',
    'MetaverseRug','NFTFinanceDAO','GameFiScam','PlayToLoseToken','AxieKiller',
    'StepNScam','Move2EarnDrain','SocialTokenRug','CreatorCoinDrain','ScholarshipDAO',
    'RubicSwap2','BadgerDAOAgain','PickleFinanceBack','CreamFinanceReloaded','EasyFiAgain',
    'PolynetworkJr','RoninBridgeTwo','WormholeWoes','HorizonHack','NomadNightmare',
    'ShitcoinsRUs','MillionDollarFud','InfiniteMoneyGlitch','NumberGoDownCoin','OopsAllScam',
];

const CHAIN_LOG_TEMPLATES = [
    /* ---- BUY ---- */
    { tag:'BUY', color:'text-green-400', text:()=>`${randomWalletAddr()} bought ${randomTokenAmt()} $${BASE_TOKEN} for ${randomUsdtAmt()} ${QUOTE_TOKEN}. Diamond hands, allegedly.` },
    { tag:'BUY', color:'text-green-400', text:()=>`${randomWalletAddr()} aped ${randomUsdtAmt()} ${QUOTE_TOKEN} into $${BASE_TOKEN}. No research, maximum conviction.` },
    { tag:'BUY', color:'text-green-400', text:()=>`${randomWalletAddr()} market-bought ${randomTokenAmt()} $${BASE_TOKEN}. Slippage: who cares. Hopium: max.` },
    { tag:'BUY', color:'text-green-400', text:()=>`${randomWalletAddr()} bought the dip on $${BASE_TOKEN}. The dip was not the bottom.` },
    { tag:'BUY', color:'text-green-400', text:()=>`${randomWalletAddr()} swapped ${randomUsdtAmt()} ${QUOTE_TOKEN} for ${randomTokenAmt()} $${BASE_TOKEN}. Telegram told them to.` },
    { tag:'BUY', color:'text-green-400', text:()=>`New entry: ${randomWalletAddr()} accumulated ${randomTokenAmt()} $${BASE_TOKEN}. Cost basis: not great.` },
    { tag:'BUY', color:'text-green-400', text:()=>`${randomWalletAddr()} FOMO-bought ${randomTokenAmt()} $${BASE_TOKEN} after a 40% pump. Classic.` },
    { tag:'BUY', color:'text-green-400', text:()=>`${randomWalletAddr()} opened a position in $${BASE_TOKEN}. Entry was "now." Research was "vibes."` },
    { tag:'BUY', color:'text-green-400', text:()=>`${randomWalletAddr()} just sent ${randomUsdtAmt()} ${QUOTE_TOKEN} to a DEX and called it investing.` },
    { tag:'BUY', color:'text-green-400', text:()=>`Market buy confirmed: ${randomWalletAddr()} took ${randomTokenAmt()} $${BASE_TOKEN}. 8% slippage accepted without hesitation.` },
    { tag:'BUY', color:'text-green-400', text:()=>`${randomWalletAddr()} saw the chart go up and bought ${randomUsdtAmt()} ${QUOTE_TOKEN} worth. Solid strategy.` },
    { tag:'BUY', color:'text-green-400', text:()=>`${randomWalletAddr()} entered $${BASE_TOKEN} at what they called "a discount." The chart disagrees.` },
    /* ---- SELL ---- */
    { tag:'SELL', color:'text-rose-400', text:()=>`${randomWalletAddr()} panic-sold ${randomTokenAmt()} $${BASE_TOKEN}. Paper hands confirmed.` },
    { tag:'SELL', color:'text-rose-400', text:()=>`${randomWalletAddr()} dumped ${randomTokenAmt()} $${BASE_TOKEN} into a falling market. Brave, or stupid. Probably both.` },
    { tag:'SELL', color:'text-rose-400', text:()=>`${randomWalletAddr()} exited $${BASE_TOKEN} at a loss. Now posting about "learning experiences."` },
    { tag:'SELL', color:'text-rose-400', text:()=>`${randomWalletAddr()} sold all ${randomTokenAmt()} $${BASE_TOKEN} at the exact bottom. Textbook execution.` },
    { tag:'SELL', color:'text-rose-400', text:()=>`${randomWalletAddr()} rage-sold ${randomTokenAmt()} $${BASE_TOKEN} after 3 red candles. The 4th candle was green.` },
    { tag:'SELL', color:'text-rose-400', text:()=>`Sell detected: ${randomWalletAddr()} dumped ${randomUsdtAmt()} ${QUOTE_TOKEN} worth of $${BASE_TOKEN}. Chart is not happy.` },
    { tag:'SELL', color:'text-rose-400', text:()=>`${randomWalletAddr()} closed their $${BASE_TOKEN} position. Their Discord handle was 'HodlForever.'` },
    { tag:'SELL', color:'text-rose-400', text:()=>`${randomWalletAddr()} sold ${randomTokenAmt()} $${BASE_TOKEN} at market. 23% below their average entry. Still counts.` },
    { tag:'SELL', color:'text-rose-400', text:()=>`${randomWalletAddr()} took profits on $${BASE_TOKEN}. "Profits" is doing a lot of work in that sentence.` },
    { tag:'SELL', color:'text-rose-400', text:()=>`Mass sell detected from ${randomWalletAddr()}. ${randomTokenAmt()} $${BASE_TOKEN} dumped in a single transaction. Someone read the contract.` },
    { tag:'SELL', color:'text-rose-400', text:()=>`${randomWalletAddr()} exited $${BASE_TOKEN} after the Discord went quiet for 12 hours. Good instinct.` },
    { tag:'SELL', color:'text-rose-400', text:()=>`${randomWalletAddr()} rage-dumped ${randomTokenAmt()} $${BASE_TOKEN}. Twitter thread incoming: "I was scammed."` },
    /* ---- WHALE ---- */
    { tag:'WHALE', color:'text-blue-400', text:()=>`Whale ${randomWalletAddr()} bought ${randomUsdtAmt()} ${QUOTE_TOKEN} of $${BASE_TOKEN} in a single block.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`${randomWalletAddr()} (whale) accumulated ${randomTokenAmt()} $${BASE_TOKEN} quietly over 4 hours. Nobody noticed. Until now.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`Whale alert: ${randomWalletAddr()} moved ${randomUsdtAmt()} ${QUOTE_TOKEN} toward a $${BASE_TOKEN} position.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`${randomWalletAddr()} entered $${BASE_TOKEN} with ${randomUsdtAmt()} ${QUOTE_TOKEN}. They know something. Or they don't.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`Dormant whale ${randomWalletAddr()} just woke up and bought ${randomTokenAmt()} $${BASE_TOKEN}. Last activity: 3 years ago.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`${randomWalletAddr()} whale is averaging down on $${BASE_TOKEN}. This is either smart or devastating.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`Large accumulation: ${randomWalletAddr()} now holds ${randomTokenAmt()} $${BASE_TOKEN}. That's ${(Math.random()*15+2).toFixed(1)}% of circulating supply.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`Whale spotted: ${randomWalletAddr()} splitting ${randomUsdtAmt()} ${QUOTE_TOKEN} across 12 wallets to hide an entry. Didn't work.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`${randomWalletAddr()} whale transferred ${randomUsdtAmt()} ${QUOTE_TOKEN} to an exchange. Buy or sell. Nobody knows. Everyone is panicking.` },
    /* ---- RUG ---- */
    { tag:'RUG', color:'text-red-500', text:()=>`Rival project "${randomFrom(FAKE_RIVAL_TOKENS)}" just got rugged for ${randomUsdtAmt()} ${QUOTE_TOKEN}. RIP.` },
    { tag:'RUG', color:'text-red-500', text:()=>`${randomFrom(FAKE_RIVAL_TOKENS)} dev wallet drained liquidity at 4 AM. Telegram mods are "looking into it."` },
    { tag:'RUG', color:'text-red-500', text:()=>`${randomFrom(FAKE_RIVAL_TOKENS)} price dropped 98% in one block. Dev says "we were hacked." Sure.` },
    { tag:'RUG', color:'text-red-500', text:()=>`${randomFrom(FAKE_RIVAL_TOKENS)} rug confirmed. Community "shocked." The audit was done by the dev's cousin.` },
    { tag:'RUG', color:'text-red-500', text:()=>`${randomFrom(FAKE_RIVAL_TOKENS)} website went offline. Discord deleted. $${randomUsdtAmt()} gone. "Team is working on it."` },
    { tag:'RUG', color:'text-red-500', text:()=>`${randomFrom(FAKE_RIVAL_TOKENS)} exit scam complete. ${randomUsdtAmt()} ${QUOTE_TOKEN} moved to mixer. Post-mortem: never.` },
    { tag:'RUG', color:'text-red-500', text:()=>`ALERT: ${randomFrom(FAKE_RIVAL_TOKENS)} liquidity removed in full. ${randomTokenAmt()} tokens now worthless. New all-time low: $0.` },
    { tag:'RUG', color:'text-red-500', text:()=>`${randomFrom(FAKE_RIVAL_TOKENS)} dev posted "unexpected circumstances" and vanished with ${randomUsdtAmt()} ${QUOTE_TOKEN}.` },
    { tag:'RUG', color:'text-red-500', text:()=>`${randomFrom(FAKE_RIVAL_TOKENS)} honeypot confirmed. Buys worked. Sells: error 0xRUG. ${randomUsdtAmt()} trapped.` },
    { tag:'RUG', color:'text-red-500', text:()=>`Rug velocity: ${randomFrom(FAKE_RIVAL_TOKENS)} went from launch to $0 in ${Math.floor(Math.random()*48+1)} hours. New record.` },
    { tag:'RUG', color:'text-red-500', text:()=>`${randomFrom(FAKE_RIVAL_TOKENS)} just renamed to "${randomFrom(FAKE_RIVAL_TOKENS)}V2" and launched a new contract. Please don't.` },
    /* ---- DRAIN ---- */
    { tag:'DRAIN', color:'text-fuchsia-400', text:()=>`An unaudited vault drained ${randomUsdtAmt()} ${QUOTE_TOKEN} overnight. Nobody is shocked.` },
    { tag:'DRAIN', color:'text-fuchsia-400', text:()=>`Cross-chain bridge drained for ${randomUsdtAmt()} ${QUOTE_TOKEN}. Bridge was "audited." Auditor: also drained.` },
    { tag:'DRAIN', color:'text-fuchsia-400', text:()=>`Flash loan attack drained ${randomUsdtAmt()} ${QUOTE_TOKEN} from a yield farm in 3 transactions.` },
    { tag:'DRAIN', color:'text-fuchsia-400', text:()=>`Protocol exploit detected: ${randomUsdtAmt()} ${QUOTE_TOKEN} removed in a single transaction. Hacker said "thank you for the funds."` },
    { tag:'DRAIN', color:'text-fuchsia-400', text:()=>`Reentrancy attack on a protocol drained ${randomUsdtAmt()} ${QUOTE_TOKEN}. Contract was 18 months old.` },
    { tag:'DRAIN', color:'text-fuchsia-400', text:()=>`A price oracle was manipulated for 2 seconds. Someone made ${randomUsdtAmt()} ${QUOTE_TOKEN}. Many did not.` },
    { tag:'DRAIN', color:'text-fuchsia-400', text:()=>`Governance attack: flash-loaned voting power passed a "treasury diversification" proposal. ${randomUsdtAmt()} diversified into hacker wallet.` },
    { tag:'DRAIN', color:'text-fuchsia-400', text:()=>`Infinite mint bug triggered. ${randomTokenAmt()} tokens created. ${randomUsdtAmt()} ${QUOTE_TOKEN} extracted. Auditors updated their LinkedIn.` },
    { tag:'DRAIN', color:'text-fuchsia-400', text:()=>`Private key leaked for a protocol holding ${randomUsdtAmt()} ${QUOTE_TOKEN}. Leaked on: their own Telegram. Funds: gone.` },
    { tag:'DRAIN', color:'text-fuchsia-400', text:()=>`Deprecated contract still holding ${randomUsdtAmt()} ${QUOTE_TOKEN} drained. The dev team forgot it existed. Someone else didn't.` },
    /* ---- MEV ---- */
    { tag:'MEV', color:'text-purple-400', text:()=>`Sandwich bot ${randomFrom(BOT_NAMES)} frontran ${randomWalletAddr()}, extracting ${randomUsdtAmt()} ${QUOTE_TOKEN}.` },
    { tag:'MEV', color:'text-purple-400', text:()=>`${randomFrom(BOT_NAMES)} back-ran a ${randomUsdtAmt()} ${QUOTE_TOKEN} swap on $${BASE_TOKEN}. Clean extraction. No remorse.` },
    { tag:'MEV', color:'text-purple-400', text:()=>`${randomFrom(BOT_NAMES)} sandwiched ${randomWalletAddr()} for ${randomUsdtAmt()} ${QUOTE_TOKEN}. In and out before block confirmation.` },
    { tag:'MEV', color:'text-purple-400', text:()=>`Three MEV bots raced to sandwich the same transaction. ${randomFrom(BOT_NAMES)} won. ${randomUsdtAmt()} extracted.` },
    { tag:'MEV', color:'text-purple-400', text:()=>`${randomFrom(BOT_NAMES)} found a ${randomUsdtAmt()} ${QUOTE_TOKEN} swap with 12% slippage tolerance. Treated it as an invitation.` },
    { tag:'MEV', color:'text-purple-400', text:()=>`Atomic arbitrage: ${randomFrom(BOT_NAMES)} extracted ${randomUsdtAmt()} ${QUOTE_TOKEN} across 4 pools in a single transaction.` },
    { tag:'MEV', color:'text-purple-400', text:()=>`${randomFrom(BOT_NAMES)} ran 60 failed sandwich attempts this block. The 61st paid for all of them.` },
    { tag:'MEV', color:'text-purple-400', text:()=>`Priority fee war: ${randomFrom(BOT_NAMES)} paid ${randomGwei()} GWEI to be first in block. Extracted ${randomUsdtAmt()} ${QUOTE_TOKEN}.` },
    /* ---- GAS ---- */
    { tag:'GAS', color:'text-amber-400', text:()=>`Gas spiked to ${randomGwei()} GWEI. The mempool is one big traffic jam.` },
    { tag:'GAS', color:'text-amber-400', text:()=>`Gas wars active: ${randomGwei()} GWEI floor. A bot is paying 12x base fee just to be first.` },
    { tag:'GAS', color:'text-amber-400', text:()=>`Someone paid ${randomUsdtAmt()} ${QUOTE_TOKEN} in gas to claim ${(Math.random()*3+0.01).toFixed(3)} in rewards. The math did not math.` },
    { tag:'GAS', color:'text-amber-400', text:()=>`Mempool congestion: ${Math.floor(Math.random()*40000+5000)} pending transactions. Average wait: 14 minutes. Gas: ${randomGwei()} GWEI.` },
    { tag:'GAS', color:'text-amber-400', text:()=>`${randomWalletAddr()} set a max gas of 5 GWEI. Their transaction has been pending for 6 hours. Still pending.` },
    { tag:'GAS', color:'text-amber-400', text:()=>`Gas just hit ${randomGwei()} GWEI. This is technically L1's fault but everyone is blaming the token.` },
    { tag:'GAS', color:'text-amber-400', text:()=>`Failed transaction detected: ${randomWalletAddr()} burned ${(Math.random()*80+5).toFixed(2)} USDSHT in gas for a transaction that reverted.` },
    { tag:'GAS', color:'text-amber-400', text:()=>`Block ${blockNumber} is 98% full. ${Math.floor(Math.random()*200+50)} transactions queued. Validators are thriving.` },
    /* ---- AUDIT ---- */
    { tag:'AUDIT', color:'text-blue-400', text:()=>`A "certified" auditor gave a known honeypot a 10/10 safety score. As expected.` },
    { tag:'AUDIT', color:'text-blue-400', text:()=>`New audit released for $${BASE_TOKEN}. Security score: 97/100. The 3 missing points are the withdraw function.` },
    { tag:'AUDIT', color:'text-blue-400', text:()=>`An auditor flagged a critical vulnerability. The dev called it "a feature." The auditor was blocked.` },
    { tag:'AUDIT', color:'text-blue-400', text:()=>`"Audit in progress" has been pinned in the ${randomFrom(FAKE_RIVAL_TOKENS)} Discord for 9 months.` },
    { tag:'AUDIT', color:'text-blue-400', text:()=>`Audit firm issued a report with 0 critical findings on a contract that was drained 3 hours later.` },
    { tag:'AUDIT', color:'text-blue-400', text:()=>`KYC completed for ${randomFrom(FAKE_RIVAL_TOKENS)} dev team. KYC provider: a Discord bot the dev also deployed.` },
    { tag:'AUDIT', color:'text-blue-400', text:()=>`New smart contract audit shows "all issues resolved." The issues were documented. The fixes were not verified.` },
    { tag:'AUDIT', color:'text-blue-400', text:()=>`${randomFrom(FAKE_RIVAL_TOKENS)} received an audit badge. Badge cost: $200. Audit contents: one page. Exploit found after: 4 days.` },
    { tag:'AUDIT', color:'text-blue-400', text:()=>`Audit firm claimed "no critical issues found." The critical issue was in the function they didn't audit.` },
    /* ---- SHILL ---- */
    { tag:'SHILL', color:'text-green-400', text:()=>`${randomFrom(HANDLES)} just shilled $${BASE_TOKEN} from a yacht he doesn't own.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`${randomFrom(HANDLES)} called $${BASE_TOKEN} "the next ETH" in a 42-post thread. Two people liked it. Both bots.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`${randomFrom(HANDLES)} is hosting a Twitter Space about $${BASE_TOKEN}. Co-host: his second account.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`${randomFrom(HANDLES)} posted "NGL this might be the play" about $${BASE_TOKEN}. He was paid in tokens to say this.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`YouTube thumbnail: "WHY $${BASE_TOKEN} IS GOING 1000X" — views: 11. The presenter holds 40% of supply.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`Paid promotion detected: ${randomFrom(HANDLES)} posted about $${BASE_TOKEN} after receiving a "community grant" of ${randomTokenAmt()} tokens.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`${randomFrom(HANDLES)} wrote an 8-tweet thread explaining why $${BASE_TOKEN} is undervalued. Disclosure: not included.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`Breaking: ${randomFrom(HANDLES)} set $${BASE_TOKEN} as their profile picture. They hold ${randomUsdtAmt()} ${QUOTE_TOKEN} worth. Now you know why.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`${randomFrom(HANDLES)} tweeted "DYOR on $${BASE_TOKEN}" while having completed approximately zero research themselves.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`New shill unlocked: a Telegram group with 200k members just pinned $${BASE_TOKEN}. 197k are bots.` },
    /* ---- DEV ---- */
    { tag:'DEV', color:'text-rose-400', text:()=>`Dev wallet ${randomWalletAddr()} moved ${randomUsdtAmt()} ${QUOTE_TOKEN} to an exchange at 3 AM. Sleep well.` },
    { tag:'DEV', color:'text-rose-400', text:()=>`Dev wallet ${randomWalletAddr()} transferred ${randomUsdtAmt()} ${QUOTE_TOKEN} to a mixer. "For security reasons."` },
    { tag:'DEV', color:'text-rose-400', text:()=>`The $${BASE_TOKEN} dev hasn't posted in 72 hours. Mods say "they're heads-down building."` },
    { tag:'DEV', color:'text-rose-400', text:()=>`Dev team "stepping back for personal reasons" after ${randomUsdtAmt()} ${QUOTE_TOKEN} left the treasury.` },
    { tag:'DEV', color:'text-rose-400', text:()=>`Dev wallet ${randomWalletAddr()} unlocked vesting 3 months early via a function nobody noticed was in the contract.` },
    { tag:'DEV', color:'text-rose-400', text:()=>`${randomFrom(FAKE_RIVAL_TOKENS)} dev wallet bridged ${randomUsdtAmt()} ${QUOTE_TOKEN} to a chain with no block explorer. Interesting choice.` },
    { tag:'DEV', color:'text-rose-400', text:()=>`Dev address ${randomWalletAddr()} just sent ${randomTokenAmt()} $${BASE_TOKEN} to a CEX. "Long-term holder" era ended.` },
    { tag:'DEV', color:'text-rose-400', text:()=>`On-chain data: ${randomWalletAddr()} (dev wallet, labeled) received ${randomUsdtAmt()} ${QUOTE_TOKEN} from the protocol treasury at 4:17 AM.` },
    { tag:'DEV', color:'text-rose-400', text:()=>`Dev of ${randomFrom(FAKE_RIVAL_TOKENS)} posted "we're still building" from a wallet with 0 transactions since the launch.` },
    /* ---- AIRDROP ---- */
    { tag:'AIRDROP', color:'text-blue-400', text:()=>`Snapshot taken for the next airdrop. 4,000 wallets about to get dust they'll never claim.` },
    { tag:'AIRDROP', color:'text-blue-400', text:()=>`$${BASE_TOKEN} airdrop announced. Eligibility: "must have used the protocol." Sybil wallets: 94% of claimants.` },
    { tag:'AIRDROP', color:'text-blue-400', text:()=>`Airdrop farming wallet ${randomWalletAddr()} eligible for ${randomTokenAmt()} $${BASE_TOKEN}. Will dump on TGE.` },
    { tag:'AIRDROP', color:'text-blue-400', text:()=>`${randomFrom(FAKE_RIVAL_TOKENS)} airdrop launched. Claimed in first block: 84%. Percentage held longer than 1 hour: 3%.` },
    { tag:'AIRDROP', color:'text-blue-400', text:()=>`Sybil detection update: ${Math.floor(Math.random()*40000+10000)} wallets disqualified from the $${BASE_TOKEN} airdrop. Each was operated by the same person.` },
    { tag:'AIRDROP', color:'text-blue-400', text:()=>`${randomWalletAddr()} is farming the $${BASE_TOKEN} airdrop across ${Math.floor(Math.random()*50+10)} wallets. The effort required is insane. The reward will not be.` },
    { tag:'AIRDROP', color:'text-blue-400', text:()=>`Airdrop cliff unlocked for ${randomFrom(FAKE_RIVAL_TOKENS)} early users. All 12 of them dumped within 9 minutes.` },
    { tag:'AIRDROP', color:'text-blue-400', text:()=>`$${BASE_TOKEN} snapshot announced. Within 4 minutes, bridging volume to the network increased ${Math.floor(Math.random()*900+100)}%. Organic interest.` },
    /* ---- LIQ ---- */
    { tag:'LIQ', color:'text-red-500', text:()=>`A ${randomFrom(LEVERAGE_TIERS)}x leveraged position on $${BASE_TOKEN} got liquidated for ${randomUsdtAmt()} ${QUOTE_TOKEN}.` },
    { tag:'LIQ', color:'text-red-500', text:()=>`Cascade liquidation on $${BASE_TOKEN}: 7 positions blown out in one block. Total: ${randomUsdtAmt()} ${QUOTE_TOKEN}.` },
    { tag:'LIQ', color:'text-red-500', text:()=>`${randomWalletAddr()} 100x long on $${BASE_TOKEN} liquidated. Entry: bold. Exit: involuntary.` },
    { tag:'LIQ', color:'text-red-500', text:()=>`Liquidation engine triggered on ${randomWalletAddr()}'s ${randomFrom(LEVERAGE_TIERS)}x $${BASE_TOKEN} position. Margin: gone. Lesson: expensive.` },
    { tag:'LIQ', color:'text-red-500', text:()=>`${randomWalletAddr()} was 1 GWEI away from being first to liquidate a position. They were not first. Cost them ${randomUsdtAmt()} ${QUOTE_TOKEN}.` },
    { tag:'LIQ', color:'text-red-500', text:()=>`Mass liquidation event: ${randomUsdtAmt()} ${QUOTE_TOKEN} in positions liquidated in 60 seconds as $${BASE_TOKEN} fell through a support level.` },
    { tag:'LIQ', color:'text-red-500', text:()=>`${randomWalletAddr()} borrowed ${randomUsdtAmt()} ${QUOTE_TOKEN} against $${BASE_TOKEN} collateral. Collateral now worth less than the loan. Liquidated.` },
    { tag:'LIQ', color:'text-red-500', text:()=>`Health factor for ${randomWalletAddr()} hit 1.0. Then 0.99. Then: liquidated. ${randomUsdtAmt()} ${QUOTE_TOKEN} gone.` },
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

const recentChainIdxs = new Set();

function generateChainLog() {
    const available = CHAIN_LOG_TEMPLATES.map((_,i)=>i).filter(i=>!recentChainIdxs.has(i));
    const pool = available.length > 0 ? available : CHAIN_LOG_TEMPLATES.map((_,i)=>i);
    const idx = pool[Math.floor(Math.random()*pool.length)];
    recentChainIdxs.add(idx);
    if (recentChainIdxs.size > Math.floor(CHAIN_LOG_TEMPLATES.length * 0.55)) recentChainIdxs.delete(recentChainIdxs.values().next().value);
    const t = CHAIN_LOG_TEMPLATES[idx];
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
    'a wallet that owns more leveraged BTC than is medically advisable',
    "a guy whose entire bio is just 'orange coin good'",
    'a self-proclaimed crypto prophet with a blue checkmark and zero humility',
    'an exchange founder who definitely reads his own subpoenas for fun',
    'a wallet linked to someone who only tweets in all caps about Bitcoin',
    "a hedge fund manager who refers to his followers as 'the army'",
    'a former TechCrunch darling who pivoted to "blockchain infrastructure" in 2021',
    "someone who describes their job as 'full-time degen' without a hint of irony",
    'a VC fund that has made 11 consecutive bad calls and is still writing checks',
    'a wallet whose transaction history reads like a cry for help',
    "the guy who keeps posting 'I told you so' regardless of what the market does",
    'a protocol founder who sold 80% of their allocation "for legal reasons"',
    'a pseudonymous account with a laser-eye profile picture and 800k followers',
    'a whale who learned what a blockchain was 3 months ago and now gives advice',
    "a fund manager whose last newsletter was titled 'This Changes Everything'",
    'a serial token launcher whose previous five projects all depegged within 6 weeks',
    'a "decentralization advocate" who controls 60% of the governance votes',
    'a wallet address that appears in 34 separate rug-pull post-mortems',
    "an anonymous account that has been 'early on everything' and somehow still broke",
    'a protocol co-founder whose LinkedIn still says "Building the future of finance"',
    'a celebrity who launched an NFT collection and has since gone very quiet about it',
    'someone who called the top "for a friend" and actually meant themselves',
    'a wallet that bought the dip seventeen times and kept finding new lows',
    'an influencer whose "not financial advice" disclaimer is 3 times longer than the advice',
    'a dev whose GitHub shows no commits but whose Telegram shows constant announcements',
    'someone who describes every project they invest in as "a paradigm shift"',
    'a whale who moves markets with one post and blames manipulation for the volatility',
    'an algorithmic stablecoin designer who is "still refining the math"',
    'a person who has publicly predicted 47 market crashes, 3 of which happened',
    'a tokenomics "expert" who has never once explained what the token actually does',
    'someone whose entire investment thesis is "number will go up because I bought it"',
    'a wallet that has been "accumulating quietly" since the previous all-time high',
    'an NFT founder who calls floor price manipulation "organic price discovery"',
    'a protocol that raised $40M in a bear market and shipped a logo',
    'a wallet address that Chainalysis has printed out and stuck to a dartboard',
    'a layer-2 founder who describes every competitor as "centralized and unsafe"',
    'someone who keeps posting "this is still early" as the chart makes new lows',
    'a DAO treasury manager who moved funds to a personal wallet "for security"',
    'a "KOL" whose paid posts always include the sentence "own your future"',
    'a market maker who claims to provide liquidity but mostly provides exits for devs',
    'a venture partner who describes every portfolio company as "best in class"',
    'someone who has minted 4 NFT collections and personally holds 90% of each',
    'a wallet associated with someone who called the SEC "anti-innovation" in court',
    'an algorithmic yield optimizer whose APY lasted exactly one week',
    'a crypto podcast host who has quietly sold every token they ever mentioned on air',
    "a yield aggregator dev who aggregated everyones yield directly into their own wallet",
    "a community-first protocol that has a 5/9 multisig controlled by the founders family",
    'someone who describes holding a 95% drawdown asset as "playing the long game"',
    'a former exchange CEO who is now "focused on building" from an undisclosed location',
    "a DeFi protocol that has been in audit for 14 consecutive months",
    'a wallet that executed the most profitable trade of the year and then immediately did a rug',
    'a content creator whose on-chain activity contradicts everything they post publicly',
    'someone who launched a "community token" and gave the community 12% of the supply',
    'a metaverse land developer whose metaverse exists mainly in press releases',
    "a crypto billionaire who claims to live simply from a yacht registered in a tax haven",
    'a layer-1 chain founder who has described their chain as "the Ethereum killer" 6 times',
    "a meme coin deployer who considers themselves a serious entrepreneur",
    'someone who typed "wen token" under a governance proposal for a non-token protocol',
    'a DeFi yield farmer whose entire strategy is "ape first, read second"',
    'an on-chain analyst who has been tracking this wallet "for weeks" and now it moved',
    'a validator operator who runs 23% of the network and calls it "sufficiently decentralized"',
    'a seed investor whose vesting cliff unlocks the same week as the token launch. Coincidence.',
    'a crypto lawyer who bills $800/hour to tell you that you probably cannot do the thing',
    "a tokenized real-world asset platform whose only real-world asset is the server bill",
    'someone who spent $2M on a profile picture and considers it "portfolio diversification"',
    'an anonymous dev who writes "anon for regulatory reasons" and definitely no other reasons',
    'a protocol that charges a 0.3% fee on every transaction, including the ones removing liquidity',
    'a bridge operator who calls their security model "battle-tested" after one month of uptime',
    'a crypto VC whose entire thesis is "whatever the last thing that went up was, more of that"',
    'a stablecoin issuer whose reserve attestation was done by an accountant they hired themselves',
    'someone who has written "this is not financial advice" 4,000 times and given financial advice 4,000 times',
    "a market structure expert who could not explain their own protocol's tokenomics under oath",
    'a wallet that appears in the first paragraph of three separate FBI press releases',
    'an NFT artist who minted 10,000 identical jpegs and calls the variation "procedural art"',
    'a governance whale who votes on every proposal except the one about their own compensation',
    'a DeFi protocol whose "timelock" is controlled by a wallet with no timelock',
    'someone who calls every market downturn "a chance to stack sats" regardless of the asset',
    'a crypto conference speaker who has never shipped working software but has strong opinions',
    'a layer-2 project that has been "coming soon" for 26 months',
    'an advisor listed on 73 protocol websites who has advised approximately none of them',
    'a wallet that moved $800M through Tornado Cash "for privacy" and definitely nothing else',
    'a DeFi founder who considers "decentralized" to mean "the DAO votes but I execute"',
    'someone whose token launch raised $120M and whose product launch raised a 404 error',
    'a crypto influencer who disclosed the partnership in footnote 7 of their disclaimer page',
    'a protocol auditor who found zero critical vulnerabilities in a contract that was later drained',
    'an exchange founder who says "customer funds are safu" and means it in a very specific way',
    'a bear market "builder" who built a new website and called it a rebrand',
    'someone who says "DYOR" after every recommendation they make about a token they hold',
    "a decentralized oracle whose three price feeds are all hosted on one AWS instance",
    'a crypto hedge fund manager who describes their drawdown as "temporarily underwater"',
    'a protocol co-founder who left "to pursue other opportunities" two days before the exploit',
    'a wallet that has triggered the same on-chain alarm three different block explorers use as a test case',
    'a liquidity provider who removed all liquidity and calls it "strategic portfolio rebalancing"',
    "a web3 gaming company that made a token, a whitepaper, and one screenshot of a game",
    'someone who describes the blockchain as "the next internet" and cannot explain either one',
    "a market maker whose spreads widen by exactly 100x on volatile days when people need them most",
];

const MEV_SANDWICH_LINES = [
    (c)=>`Your bot sandwiched 3 community swaps in one block, skimming $${c}. Mayo optional.`,
    (c)=>`MEV bot front-ran, back-ran, and middle-ran a single transaction. Extracted $${c}. Galaxy brain.`,
    (c)=>`Sandwich executed: buy before, sell after, regret never. +$${c}.`,
    (c)=>`Your bot inserted itself into someone's swap like an uninvited guest at dinner. +$${c}.`,
    (c)=>`Gas war won. Sandwich assembled. $${c} extracted from your own community, lettuce wept.`,
    (c)=>`Bot sniped the slippage tolerance of a wallet that trusted you. +$${c}.`,
    (c)=>`Sandwich complete. $${c} extracted. The victim is asking why their swap cost so much.`,
    (c)=>`You front-ran a $${c} swap, back-ran the same swap, and pocketed the difference. Chef's kiss.`,
    (c)=>`Your MEV bot found a transaction, surrounded it on both sides, and walked away with $${c}.`,
    (c)=>`Block explorer shows your sandwich: buy → victim → sell → $${c} profit. Evidence preserved forever.`,
    (c)=>`Your bot intercepted a swap and extracted $${c} in slippage fees. Technically legal. Barely.`,
    (c)=>`Sandwich bot slipped between two blocks and came out with $${c}. The validator sees nothing.`,
    (c)=>`You sandwiched a Discord mod who was buying the dip. Extracted $${c}. They deserved it probably.`,
    (c)=>`Your bot executed a perfect 3-transaction sandwich in one block. $${c} profit. Block time: 2 seconds.`,
    (c)=>`MEV extracted: $${c}. Victim's swap still processed, just 2.3% worse than it should've been.`,
    (c)=>`You found a large pending swap and positioned around it like a financial predator. +$${c}.`,
    (c)=>`Your sandwich bot ran 40 failed attempts before this one landed. $${c} covers the gas. Barely.`,
    (c)=>`Slippage exploit complete: $${c}. The buyer got their tokens. You got a tip they didn't approve.`,
    (c)=>`Your bot smelled an unprotected swap from 3 blocks away. Sandwiched it. $${c}. No witnesses.`,
    (c)=>`Transaction reordering successful. $${c} extracted. The chain is immutable but your profit isn't.`,
    (c)=>`You wrapped someone's swap in a buy and a sell so fast they only saw one confirmation. +$${c}.`,
    (c)=>`Your bot paid ${Math.floor(Math.random()*500+100)} GWEI to jump the queue. Sandwiched for $${c}. Net positive.`,
    (c)=>`Sandwich confirmed. $${c} in, $${c} out of someone else's trade. This is a feature of the network.`,
    (c)=>`A wallet using 20% slippage just handed your bot $${c}. Consider it a tip they didn't know they left.`,
    (c)=>`MEV sandwich: initiated, executed, settled. $${c} profit. Victim still thinks it was gas.`,
    (c)=>`Your bot found a large DEX trade and turned it into a free lunch. $${c}. No ketchup required.`,
    (c)=>`Three wallets competed to sandwich this swap. Yours was faster. $${c} richer than the other two.`,
    (c)=>`Atomic sandwich complete in block ${blockNumber}. $${c} extracted before the victim even saw the confirmation.`,
    (c)=>`Your MEV strategy worked perfectly: buy → whale's buy → sell. Net: $${c}. No harm done. Financially speaking.`,
    (c)=>`$${c} extracted by positioning your bot on both sides of a large swap. The spread was a gift.`,
    (c)=>`Your sandwich bot's 847th sandwich this week. Total extracted today: $${c}. Running total: alarming.`,
    (c)=>`You converted someone's market order into a limit order of sorts — specifically, your profit was the limit. $${c}.`,
    (c)=>`MEV collected: $${c}. The community calls this extraction. You call it "providing price discovery services."`,
    (c)=>`Sandwich executed via private mempool. $${c} profit. No competing bots. The dark forest was empty tonight.`,
    (c)=>`Your bundle was accepted. Buy → target → sell settled atomically. $${c} in the account. Beautiful.`,
    (c)=>`Flashbots order flow captured. Sandwiched the pending tx for $${c}. Signed, sealed, extracted.`,
    (c)=>`You sandwiched a swap so fast the transaction didn't even realize it was surrounded. $${c} gone.`,
    (c)=>`Priority fee of ${Math.floor(Math.random()*1000+200)} GWEI paid. Sandwich executed. $${c} returned. Math checked out.`,
    (c)=>`Your bot inserted 2 transactions around 1 victim transaction. The math on $${c} works out in your favor.`,
    (c)=>`Slippage tolerance 15%. Your sandwich: 14.9%. Victim's swap: completed. Your profit: $${c}. Legal: technically.`,
];

const MEV_NOTICED_LINES = [
    (c)=>`🚨 Your bot accidentally sandwiched ${randomFrom(FAKE_WHALE_NAMES)}. Extracted $${c} before anyone noticed. Then everyone noticed.`,
    (c)=>`🚨 Turns out that swap belonged to ${randomFrom(FAKE_WHALE_NAMES)}. $${c} richer, several subpoenas poorer.`,
    (c)=>`🚨 Sandwiched ${randomFrom(FAKE_WHALE_NAMES)} by accident. $${c} extracted. Screenshots are already circulating.`,
    (c)=>`🚨 You just MEV'd ${randomFrom(FAKE_WHALE_NAMES)} for $${c}. Their lawyers have already been notified.`,
    (c)=>`🚨 WHALE SANDWICHED: ${randomFrom(FAKE_WHALE_NAMES)} is $${c} lighter. Their next post will be about "MEV reform."`,
    (c)=>`🚨 Your bot hit ${randomFrom(FAKE_WHALE_NAMES)} for $${c}. They control 19% of the supply. You may have made an enemy.`,
    (c)=>`🚨 Extracted $${c} from ${randomFrom(FAKE_WHALE_NAMES)}. They can afford it. They're still going to be very upset.`,
    (c)=>`🚨 ${randomFrom(FAKE_WHALE_NAMES)} just lost $${c} to your sandwich bot. Their Discord is calling for "on-chain justice."`,
    (c)=>`🚨 You accidentally front-ran ${randomFrom(FAKE_WHALE_NAMES)} and made $${c}. "Accidentally" is doing a lot of work there.`,
    (c)=>`🚨 Sandwich confirmed: $${c} from ${randomFrom(FAKE_WHALE_NAMES)}. Block explorer evidence: permanent. Their memory: longer.`,
    (c)=>`🚨 JACKPOT: Your bot sandwiched ${randomFrom(FAKE_WHALE_NAMES)} entering a $${c} position. Huge payout. Huge problem.`,
    (c)=>`🚨 ${randomFrom(FAKE_WHALE_NAMES)} was using MetaMask with default settings. You extracted $${c}. This one was almost too easy.`,
    (c)=>`🚨 On-chain alert: ${randomFrom(FAKE_WHALE_NAMES)} got sandwiched for $${c}. Their followers are calling it market manipulation. They're not wrong.`,
    (c)=>`🚨 You extracted $${c} from ${randomFrom(FAKE_WHALE_NAMES)} who was rotating positions. They noticed. They're rotating toward lawyers now.`,
    (c)=>`🚨 Whale sandwich: ${randomFrom(FAKE_WHALE_NAMES)} hit for $${c}. 40k people just shared the transaction on Twitter. You are famous now.`,
    (c)=>`🚨 ${randomFrom(FAKE_WHALE_NAMES)} entered $${BASE_TOKEN} with a large buy. Your bot turned $${c} of that into MEV. Oops. Worth it?`,
    (c)=>`🚨 $${c} extracted from ${randomFrom(FAKE_WHALE_NAMES)}. They have already written a 3000-word blog post about MEV being theft.`,
    (c)=>`🚨 Massive sandwich: $${c} taken from ${randomFrom(FAKE_WHALE_NAMES)}. Their next move: governance proposal to ban your wallet.`,
    (c)=>`🚨 Your bot sandwiched ${randomFrom(FAKE_WHALE_NAMES)} on the exact block they were using to enter a long. $${c} profit. Timing was either perfect or very bad.`,
    (c)=>`🚨 NOTICED ON CHAIN: ${randomFrom(FAKE_WHALE_NAMES)} got MEV'd for $${c}. Block explorers are lit up. This will be in a CoinDesk article by morning.`,
    (c)=>`🚨 You sandwiched ${randomFrom(FAKE_WHALE_NAMES)} for $${c} and they have ${Math.floor(Math.random()*800+100)}k followers. This was not a quiet extraction.`,
    (c)=>`🚨 Hot sandwich: ${randomFrom(FAKE_WHALE_NAMES)} transaction wrapped and extracted for $${c}. Their community is organizing. Run your bot faster.`,
    (c)=>`🚨 The transaction you just sandwiched for $${c} belonged to ${randomFrom(FAKE_WHALE_NAMES)}. The regulatory heat just got very real.`,
    (c)=>`🚨 MEV whale alert: ${randomFrom(FAKE_WHALE_NAMES)} hit for $${c}. They've pinned a thread about "the state of DeFi." You are case study #1.`,
    (c)=>`🚨 $${c} sandwich executed on ${randomFrom(FAKE_WHALE_NAMES)}'s entry. The ratio of money made to enemies made is not great.`,
];

const MEV_COUNTER_LINES = [
    (l)=>`Plot twist: a BIGGER bot sandwiched YOUR sandwich bot. Lost $${l}. The food chain is real.`,
    (l)=>`Your sandwich bot got front-run by a sandwich bot's sandwich bot. -$${l}. Inception fee.`,
    (l)=>`A rival MEV bot ate your lunch — literally your sandwich trade. -$${l}.`,
    (l)=>`You tried to sandwich the mempool. The mempool sandwiched back. -$${l}.`,
    (l)=>`Your bot lost a gas war to a faster bot and paid $${l} in failed transaction fees.`,
    (l)=>`Counter-MEV detected: ${randomFrom(BOT_NAMES)} sandwiched your sandwich. -$${l}. Layers on layers.`,
    (l)=>`Your sandwich was itself sandwiched. The irony cost you $${l}. MEV is a cruel mistress.`,
    (l)=>`A validator front-ran your MEV strategy and took $${l} before your transaction hit the pool.`,
    (l)=>`Three bots saw your sandwich and raced to wrap it. The winner kept $${l} of yours. You came last.`,
    (l)=>`Your extraction was extraction-ception'd. $${l} gone. The student has become the victim.`,
    (l)=>`${randomFrom(BOT_NAMES)} noticed your pattern and set a counter-trap. You walked into it. -$${l}.`,
    (l)=>`Your bot paid $${l} in gas trying to win a block priority war it couldn't afford.`,
    (l)=>`A dark pool operator front-ran your MEV bot's own front-run. $${l} evaporated before block 1.`,
    (l)=>`The mempool giveth and the mempool taketh. Today it tooketh $${l} specifically from you.`,
    (l)=>`Your sandwich was intercepted mid-execution. $${l} less than you started with.`,
    (l)=>`${randomFrom(BOT_NAMES)} has been counter-sandwiching your bot all week. Today's bill: $${l}.`,
    (l)=>`You were out-bribed. Another bot paid the validator more. You paid $${l} in gas for nothing.`,
    (l)=>`Backfire: your front-run was itself front-run. The chain laughed. You lost $${l}.`,
    (l)=>`${randomFrom(BOT_NAMES)} simulated your pending bundle and submitted a better one first. -$${l}.`,
    (l)=>`Revert detected: your sandwich transaction failed at the last step. You paid $${l} in gas to break even at a loss.`,
    (l)=>`Your MEV position got liquidated by a faster liquidation bot. $${l} taken before you could take from anyone.`,
    (l)=>`A searcher with better latency saw your sandwich coming and ate it first. $${l} gone. Upgrade your nodes.`,
    (l)=>`${randomFrom(BOT_NAMES)} is running the same strategy as you, but cheaper and faster. Today's tuition: $${l}.`,
    (l)=>`Your private mempool bundle leaked to a competing validator. $${l} redirected into their pocket.`,
    (l)=>`You tried to exploit a whale's slippage. A faster bot exploited yours. $${l} is the premium on humility.`,
    (l)=>`Block reorg: your confirmed sandwich was reorganized out of the canonical chain. $${l} lost, swap uncompleted.`,
    (l)=>`${randomFrom(BOT_NAMES)} deployed a honeypot transaction specifically to bait sandwich bots. Yours took the bait. -$${l}.`,
    (l)=>`Failed bundle: your 3-transaction sandwich was atomic until it wasn't. Reverted at step 2. Gas: $${l}. Gone.`,
    (l)=>`An order-flow auction was supposed to protect against this. You lost $${l} to it anyway. Fine print.`,
    (l)=>`Your strategy was profitable in backtesting. In live trading, ${randomFrom(BOT_NAMES)} adjusted their model. You lost $${l}.`,
    (l)=>`Counter-sandwich detected: someone positioned around YOUR position. $${l} extracted from the extractor.`,
    (l)=>`Gas spike at the exact moment of execution. Your sandwich failed. You paid $${l} in gas to help nobody.`,
    (l)=>`The validator you were bribing switched to a higher bidder mid-block. $${l} in priority fees, zero transactions included.`,
    (l)=>`Your sandwich relied on a price oracle. The oracle was 1 block stale. You lost $${l} to your own bad math.`,
    (l)=>`${randomFrom(BOT_NAMES)} runs its operations from co-lo hardware 3ms from the validator. You run yours from a VPS in Ohio. -$${l}.`,
    (l)=>`Jit liquidity was added around your sandwich target. Someone absorbed your trade. -$${l}. Welcome to modern MEV.`,
    (l)=>`Your bundle was submitted correctly. Flashbots rejected it. A competing bundle won. You ate $${l} in gas.`,
    (l)=>`A "protection" RPC endpoint you thought was private was logging your pending transactions. ${randomFrom(BOT_NAMES)} subscribed. -$${l}.`,
    (l)=>`You extracted $${l} from the mempool this week. ${randomFrom(BOT_NAMES)} extracted $${l} from you. It's the circle of MEV.`,
    (l)=>`Counter-MEV bot ${randomFrom(BOT_NAMES)} specifically targets sandwich bots. Your bot is now on its list. First bill: $${l}.`,
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
