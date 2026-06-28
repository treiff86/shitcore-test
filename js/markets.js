/* ============================================================
   GAMIFIED MARKET SYSTEM - LEVERAGE SCALPING MINI-GAME
   Pair: SHITCORE / USDSHT
   ============================================================
   New in this version:
   - Leverage bar: 25x / 50x / 75x / 100x. Picks both the real
     PnL multiplier AND the instant-bust odds (13/25/38/50%),
     rolled the moment you open a trade.
   - Trade buttons are forced into an even 50/50 split (no more
     wrapping onto two stacked lines). While a trade is open they
     collapse into a single "PANIC SELL" button — no PnL text on
     the button anymore.
   - Your live order (direction, entry price, leverage) and its
     running PnL now render as a highlighted row inside the Live
     Orderbook instead of on the button.
   - The chart draws a dashed red line at your entry price while
     a trade is open, auto-scaled into view, so you can actually
     see whether you're above or below it.
   - Wager selector (10% / 50% / custom $) still gates Pump/Dump.
   - RUGGED event: 1% chance per trade, lose the wager + 10% of
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

    // Catastrophic event rolls happen the instant the wager is committed
    const roll = Math.random();
    let threshold = 0.0001;                      // 0.01% — DRAINED
    if (roll < threshold) {
        triggerDrainedEvent();
        syncWagerUI();
        updateUI();
        return;
    }
    threshold += 0.01;                            // +1% — RUGGED
    if (roll < threshold) {
        triggerRuggedEvent(committedWager);
        syncWagerUI();
        updateUI();
        return;
    }
    threshold += (BUST_CHANCE_MAP[committedLeverage] || 0); // +leverage-scaled bust odds
    if (roll < threshold) {
        triggerInstantBust(committedLeverage, committedWager);
        syncWagerUI();
        updateUI();
        return;
    }

    let currentPrice = priceHistory[priceHistory.length - 1];

    activeTrade = {
        type: actionType,
        entryPrice: currentPrice,
        margin: committedWager,
        leverage: committedLeverage,
        pnl: 0
    };

    playSound('buy');
    updateTradeButtonsUI();
    syncWagerUI();
    updateUI();
}

function forcePump() { handleMarketAction('LONG'); }
function forceDump() { handleMarketAction('SHORT'); }

function processActiveTrade(currentPrice) {
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
   Rolled the instant a wager is committed via Pump/Dump.
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
    showToast(`💥 BUSTED! Your ${leverage}x leveraged position liquidated before it even opened. Lost your $${lostWager.toFixed(2)} wager.`, "error");
    pushChainLog('LIQ', `A ${leverage}x leveraged position got busted instantly. $${lostWager.toFixed(2)} gone before block confirmation.`, 'text-red-500 font-extrabold');
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
    if (!pumpBtn || !dumpBtn) {
        setTimeout(setupWagerControls, 200); // DOM not ready yet, retry shortly
        return;
    }

    pumpBtnEl = pumpBtn;
    dumpBtnEl = dumpBtn;

    // Force the two trade buttons into an even, side-by-side split instead
    // of letting the surrounding layout wrap them onto separate lines.
    const tradeButtonsContainer = pumpBtn.parentElement;
    if (tradeButtonsContainer) {
        tradeButtonsContainer.className = "flex items-center gap-2 w-full min-w-[170px]";
    }
    pumpBtnEl.className = "flex-1 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded text-xs font-mono transition";
    dumpBtnEl.className = "flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded text-xs font-mono transition";

    const panelHtml = `
        <div id="wagerControlPanel" class="bg-[#10141D] border border-[#1A2232] rounded-lg p-3 mb-3 space-y-2">
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

    const anchor = pumpBtn.closest('div') || pumpBtn.parentElement || pumpBtn;
    anchor.insertAdjacentHTML('beforebegin', panelHtml);

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
    pumpBtnEl.className = "flex-1 py-2 bg-rose-700 hover:bg-rose-600 text-white font-extrabold rounded text-xs text-center cursor-pointer transition animate-pulse";
    pumpBtnEl.setAttribute("onclick", "closePosition()");
    dumpBtnEl.classList.add('hidden');
}

function resetTradeButtonsUI() {
    if (!pumpBtnEl || !dumpBtnEl) return;
    pumpBtnEl.innerHTML = `📈 PUMP IT`;
    pumpBtnEl.className = "flex-1 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded text-xs font-mono transition";
    pumpBtnEl.setAttribute("onclick", "forcePump()");

    dumpBtnEl.classList.remove('hidden');
    dumpBtnEl.innerHTML = `📉 DUMP IT`;
    dumpBtnEl.className = "flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded text-xs font-mono transition";
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
const BOT_NAMES = ['Sandwich#402', 'MevSlayer#9', 'SnipeBotX', 'JaredFromSubwayClone', 'FrontrunFred'];
const HANDLES = ['@ToiletAlpha', '@CryptoChad420', '@DegenDaily', '@RugRadar', '@LamboOrBust'];
const FAKE_RIVAL_TOKENS = ['SafeMoonJr', 'BabyToiletInu', 'ElonFlushCoin', 'PumpKingDAO', 'WetWipesFinance'];

const CHAIN_LOG_TEMPLATES = [
    { tag: 'BUY', color: 'text-green-400', text: () => `${randomWalletAddr()} bought ${randomTokenAmt()} $${BASE_TOKEN} for ${randomUsdtAmt()} ${QUOTE_TOKEN}. Diamond hands, allegedly.` },
    { tag: 'SELL', color: 'text-rose-400', text: () => `${randomWalletAddr()} panic-sold ${randomTokenAmt()} $${BASE_TOKEN}. Paper hands confirmed.` },
    { tag: 'WHALE', color: 'text-blue-400', text: () => `Whale wallet ${randomWalletAddr()} bought ${randomUsdtAmt()} ${QUOTE_TOKEN} of $${BASE_TOKEN} in a single block.` },
    { tag: 'RUG', color: 'text-red-500', text: () => `Rival project "${randomFrom(FAKE_RIVAL_TOKENS)}" just got rugged for ${randomUsdtAmt()} ${QUOTE_TOKEN}. RIP.` },
    { tag: 'DRAIN', color: 'text-fuchsia-400', text: () => `An unaudited vault on a copycat chain drained ${randomUsdtAmt()} ${QUOTE_TOKEN} overnight. Nobody is shocked.` },
    { tag: 'MEV', color: 'text-purple-400', text: () => `Sandwich bot ${randomFrom(BOT_NAMES)} frontran ${randomWalletAddr()}, extracting ${randomUsdtAmt()} ${QUOTE_TOKEN}.` },
    { tag: 'GAS', color: 'text-amber-400', text: () => `Gas spiked to ${randomGwei()} GWEI. The mempool is one big traffic jam.` },
    { tag: 'AUDIT', color: 'text-blue-400', text: () => `A "certified" auditor gave a known honeypot a 10/10 safety score. As expected.` },
    { tag: 'SHILL', color: 'text-green-400', text: () => `${randomFrom(HANDLES)} just shilled $${BASE_TOKEN} from a yacht he doesn't own.` },
    { tag: 'DEV', color: 'text-rose-400', text: () => `Dev wallet ${randomWalletAddr()} moved ${randomUsdtAmt()} ${QUOTE_TOKEN} to an exchange at 3 AM. Sleep well.` },
    { tag: 'AIRDROP', color: 'text-blue-400', text: () => `Snapshot taken for the next airdrop. 4,000 wallets about to get dust they'll never claim.` },
    { tag: 'LIQ', color: 'text-red-500', text: () => `A ${randomFrom(LEVERAGE_TIERS)}x leveraged position on $${BASE_TOKEN} got liquidated for ${randomUsdtAmt()} ${QUOTE_TOKEN}. Ouch.` },
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
