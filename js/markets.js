/* ============================================================
   GAMIFIED MARKET SYSTEM - LEVERAGE SCALPING MINI-GAME
   ============================================================ */

let priceHistory = Array(60).fill(0.0125);
let blockNumber = 942012;

// Gamification State Variables
let activeTrade = null; 
const LEVERAGE = 50;    

function initMarkets() {
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

    // 3. Process Trade Logic (Separated from rendering)
    if (activeTrade) {
        try {
            processActiveTrade(newPrice);
        } catch (e) {
            console.error("Trade processing error, continuing render:", e);
        }
    }

    // 4. Guaranteed UI Rendering
    // Even if trade logic fails, these will continue to execute every second
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

    let marginAllocation = state.cash * 0.10;
    if (marginAllocation < 10) {
        showToast("Insufficient capital!", "error");
        return;
    }

    state.cash -= marginAllocation;
    let currentPrice = priceHistory[priceHistory.length - 1];

    activeTrade = {
        type: actionType,
        entryPrice: currentPrice,
        margin: marginAllocation,
        pnl: 0
    };

    playSound('buy');
    updateTradeButtonsUI();
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
    checkProgressions();
    updateUI();
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
    for(let i=3; i>0; i--) {
        let p = midPrice * (1 + (i * 0.005));
        askHtml += `<div class="flex justify-between text-rose-500 font-mono text-[11px]"><span>${p.toFixed(6)}</span></div>`;
    }
    for(let i=1; i<=3; i++) {
        let p = midPrice * (1 - (i * 0.005));
        bidHtml += `<div class="flex justify-between text-green-500 font-mono text-[11px]"><span>${p.toFixed(6)}</span></div>`;
    }
    askContainer.innerHTML = askHtml;
    bidContainer.innerHTML = bidHtml;
}

function generateChainLog() {
    const container = document.getElementById('blockchainLogs');
    if (!container) return;
    const el = document.createElement('div');
    el.className = "text-gray-400 py-0.5 border-b border-[#121721] font-mono text-[11px]";
    el.innerHTML = `<span class="text-blue-400">[Tx]</span> Processed block #${blockNumber}`;
    container.prepend(el);
    if(container.children.length > 8) container.removeChild(container.lastChild);
}
