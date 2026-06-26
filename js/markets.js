/* ============================================================
   GAMIFIED MARKET SYSTEM - LEVERAGE SCALPING MINI-GAME
   Pair: SHITCORE / USDSHT
   ============================================================
   New in this version:
   - Wager selector (10% / 50% / custom $) gates Pump/Dump
   - Live chain feed auto-fills with varied buy/sell/rug/drain/
     MEV/whale flavor text instead of repetitive block spam
   - RUGGED event: 1% chance per trade, lose the wager + 10%
     of remaining wallet
   - DRAINED event: 0.01% chance per trade, wallet goes to $0
   All fake money, 100% client-side, no real funds involved.
   ============================================================ */

const BASE_TOKEN = 'SHITCORE';
const QUOTE_TOKEN = 'USDSHT';

let priceHistory = Array(60).fill(0.0125);
let blockNumber = 942012;

// Gamification State Variables
let activeTrade = null;
const LEVERAGE = 50;

// Wager state
let wagerAmount = 0;
let wagerMode = null;       // 10 | 50 | 'custom' | null
let pumpBtnEl = null;
let dumpBtnEl = null;

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

    // Commit the wager immediately
    state.cash -= wagerAmount;
    const committedWager = wagerAmount;

    // Catastrophic event roll happens the instant the wager is committed
    const roll = Math.random();
    if (roll < 0.0001) {                 // 0.01% — DRAINED
        triggerDrainedEvent();
        syncWagerUI();
        updateUI();
        return;
    }
    if (roll < 0.0001 + 0.01) {          // +1% — RUGGED
        triggerRuggedEvent(committedWager);
        syncWagerUI();
        updateUI();
        return;
    }

    let currentPrice = priceHistory[priceHistory.length - 1];

    activeTrade = {
        type: actionType,
        entryPrice: currentPrice,
        margin: committedWager,
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

    activeTrade.pnl = activeTrade.margin * (priceDiffPct * LEVERAGE);

    if (activeTrade.pnl <= -activeTrade.margin) {
        activeTrade.pnl = -activeTrade.margin;
        playSound('liquidated');
        showToast(`💥 LIQUIDATED!`, "error");
        activeTrade = null;
        resetTradeButtonsUI();
        syncWagerUI();
        updateUI();
        return;
    }
    updateActiveTradeHUD();
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
   RARE CATASTROPHIC EVENTS — RUGGED (1%) / DRAINED (0.01%)
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

/* ============================================================
   WAGER CONTROLS — 10% / 50% / custom $
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

function syncWagerUI() {
    const display = document.getElementById('wagerDisplay');
    if (display) display.innerText = `$${wagerAmount.toFixed(2)}`;

    const b10 = document.getElementById('wager10Btn');
    const b50 = document.getElementById('wager50Btn');
    if (b10) b10.style.boxShadow = wagerMode === 10 ? '0 0 0 2px #f59e0b inset' : 'none';
    if (b50) b50.style.boxShadow = wagerMode === 50 ? '0 0 0 2px #f59e0b inset' : 'none';

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
    const pumpBtn = document.querySelector("button[onclick='forcePump()']");
    const dumpBtn = document.querySelector("button[onclick='forceDump()']");
    if (pumpBtn && dumpBtn) {
        pumpBtn.innerHTML = `<span id="hudPnL">PnL: $0.00</span>`;
        pumpBtn.className = "w-full py-2 bg-amber-600 text-white font-extrabold rounded text-xs animate-pulse text-center cursor-pointer transition";
        pumpBtn.setAttribute("onclick", "closePosition()");
        dumpBtn.innerHTML = `❌ PANIC CLOSE`;
        dumpBtn.className = "w-full py-2 bg-rose-700 text-white font-bold rounded text-xs text-center cursor-pointer transition";
        dumpBtn.setAttribute("onclick", "closePosition()");
    }
}

function resetTradeButtonsUI() {
    const tradeButtons = document.querySelectorAll("button[onclick='closePosition()']");
    if (tradeButtons.length > 0) {
        tradeButtons[0].innerHTML = `📈 PUMP IT`;
        tradeButtons[0].className = "px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded text-xs font-mono transition";
        tradeButtons[0].setAttribute("onclick", "forcePump()");
    }
    if (tradeButtons.length > 1) {
        tradeButtons[1].innerHTML = `📉 DUMP IT`;
        tradeButtons[1].className = "px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded text-xs font-mono transition";
        tradeButtons[1].setAttribute("onclick", "forceDump()");
    }
}

function updateActiveTradeHUD() {
    const hud = document.getElementById('hudPnL');
    if (!hud) return;
    hud.innerText = `${activeTrade.type} PnL: $${activeTrade.pnl.toFixed(2)}`;
}

function renderChart() {
    const canvas = document.getElementById('tradingCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const maxVal = Math.max(...priceHistory) * 1.05;
    const minVal = Math.min(...priceHistory) * 0.95;
    const range = maxVal - minVal;

    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < priceHistory.length; i++) {
        let x = (canvas.width / (priceHistory.length - 1)) * i;
        let y = canvas.height - ((priceHistory[i] - minVal) / range * canvas.height);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
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
    for (let i = 1; i <= 3; i++) {
        let p = midPrice * (1 - (i * 0.005));
        bidHtml += `<div class="flex justify-between text-green-500 font-mono text-[11px]"><span>${p.toFixed(6)}</span></div>`;
    }
    askContainer.innerHTML = askHtml;
    bidContainer.innerHTML = bidHtml;
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
    { tag: 'RUG', color: 'text-red-500', text: () => `Rival project "${FAKE_RIVAL_TOKENS[Math.floor(Math.random() * FAKE_RIVAL_TOKENS.length)]}" just got rugged for ${randomUsdtAmt()} ${QUOTE_TOKEN}. RIP.` },
    { tag: 'DRAIN', color: 'text-fuchsia-400', text: () => `An unaudited vault on a copycat chain drained ${randomUsdtAmt()} ${QUOTE_TOKEN} overnight. Nobody is shocked.` },
    { tag: 'MEV', color: 'text-purple-400', text: () => `Sandwich bot ${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]} frontran ${randomWalletAddr()}, extracting ${randomUsdtAmt()} ${QUOTE_TOKEN}.` },
    { tag: 'GAS', color: 'text-amber-400', text: () => `Gas spiked to ${randomGwei()} GWEI. The mempool is one big traffic jam.` },
    { tag: 'AUDIT', color: 'text-blue-400', text: () => `A "certified" auditor gave a known honeypot a 10/10 safety score. As expected.` },
    { tag: 'SHILL', color: 'text-green-400', text: () => `${HANDLES[Math.floor(Math.random() * HANDLES.length)]} just shilled $${BASE_TOKEN} from a yacht he doesn't own.` },
    { tag: 'DEV', color: 'text-rose-400', text: () => `Dev wallet ${randomWalletAddr()} moved ${randomUsdtAmt()} ${QUOTE_TOKEN} to an exchange at 3 AM. Sleep well.` },
    { tag: 'AIRDROP', color: 'text-blue-400', text: () => `Snapshot taken for the next airdrop. 4,000 wallets about to get dust they'll never claim.` },
    { tag: 'LIQ', color: 'text-red-500', text: () => `A ${LEVERAGE}x leveraged position on $${BASE_TOKEN} got liquidated for ${randomUsdtAmt()} ${QUOTE_TOKEN}. Ouch.` },
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
    const t = CHAIN_LOG_TEMPLATES[Math.floor(Math.random() * CHAIN_LOG_TEMPLATES.length)];
    pushChainLog(t.tag, t.text(), t.color);
}
