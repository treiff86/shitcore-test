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
    blockNumber += Math.floor(Math.random() * 2) + 1;
    const blockEl = document.getElementById('simulatedBlockNum');
    if (blockEl) blockEl.innerText = `BLOCK #${blockNumber.toLocaleString()}`;

    let lastPrice = priceHistory[priceHistory.length - 1];
    
    let bias = 0;
    if (activeTrade) {
        // --- 🎲 RISK LOGIC ---
        // 1. RUGGED CHECK (1% chance per tick)
        if (Math.random() < 0.01) {
            triggerRugged();
        } 
        // 2. DRAINED CHECK (0.01% chance per tick)
        else if (Math.random() < 0.0001) {
            triggerDrained();
        }
        
        // Market whale hunts
        if (Math.random() < 0.15) {
            bias = activeTrade.type === 'LONG' ? -0.08 : 0.08; 
        } else {
            bias = (Math.random() - 0.48) * 0.04;
        }
    } else {
        bias = (Math.random() - 0.495) * 0.03;
    }

    let newPrice = Math.max(0.00000010, lastPrice * (1 + bias));
    
    priceHistory.shift();
    priceHistory.push(newPrice);

    if (activeTrade) {
        processActiveTrade(newPrice);
    }

    renderChart();
    renderOrderbook(newPrice);
    generateChainLog();
}

/* ============================================================
   RISK EVENTS (RUGGED / DRAINED)
   ============================================================ */

function triggerRugged() {
    activeTrade = null;
    playSound('liquidated');
    showToast("⚠️ RUGGED! Liquidity pulled. Position liquidated.", "error");
    resetTradeButtonsUI();
    updateUI();
}

function triggerDrained() {
    let drainPercent = 0.25 + (Math.random() * 0.25); // 25-50%
    let drainAmount = state.lifetimeEarned * drainPercent;
    
    state.lifetimeEarned -= drainAmount;
    state.cash = 0; 
    activeTrade = null;
    
    playSound('alarm');
    showToast(`💀 DRAINED! Wallet wiped and ${ (drainPercent * 100).toFixed(0) }% lifetime gains stolen!`, "error");
    
    resetTradeButtonsUI();
    updateUI();
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
        showToast("Insufficient capital to satisfy exchange margin bounds!", "error");
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
    showToast(`📈 Opened ${LEVERAGE}x ${actionType} position with $${marginAllocation.toFixed(2)} margin!`, "info");
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
        showToast(`💥 LIQUIDATED! A market whale squeezed your position.`, "error");
        activeTrade = null;
        resetTradeButtonsUI();
        updateUI();
        return;
    }
    updateActiveTradeHUD();
}

function closePosition() {
    if (!activeTrade) return;
    let finalPayout = activeTrade.margin + activeTrade.pnl;
    state.cash += finalPayout;
    
    if (activeTrade.pnl > 0) {
        state.lifetimeEarned += activeTrade.pnl;
        playSound('buy');
        showToast(`💰 POSITION CLOSED! Secured +$${activeTrade.pnl.toFixed(2)}!`, "success");
    } else {
        playSound('click');
        showToast(`📉 Position closed. Loss of -$${Math.abs(activeTrade.pnl).toFixed(2)}.`, "error");
    }

    activeTrade = null;
    resetTradeButtonsUI();
    updateUI();
}

function updateTradeButtonsUI() {
    const pumpBtn = document.querySelector("button[onclick='forcePump()']");
    const dumpBtn = document.querySelector("button[onclick='forceDump()']");
    if (pumpBtn && dumpBtn) {
        pumpBtn.innerHTML = `<span id="hudPnL">PnL: $0.00</span>`;
        pumpBtn.className = "w-full py-2 bg-amber-600 text-white font-extrabold rounded text-xs animate-pulse text-center cursor-pointer transition";
        pumpBtn.setAttribute("onclick", "closePosition()");
        dumpBtn.innerHTML = `❌ PANIC CLOSE`;
        dumpBtn.className = "w-full py-2 bg-rose-700 hover:bg-rose-600 text-white font-bold rounded text-xs text-center cursor-pointer transition";
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
    const prefix = activeTrade.pnl >= 0 ? "Profit: +" : "Loss: ";
    hud.innerText = `${activeTrade.type} PnL: ${prefix}$${activeTrade.pnl.toFixed(2)}`;
    hud.parentElement.className = `w-full py-2 ${activeTrade.pnl >= 0 ? "bg-emerald-600" : "bg-amber-600"} text-white font-black rounded text-xs text-center cursor-pointer transition`;
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
    if (activeTrade) {
        let entryY = canvas.height - ((activeTrade.entryPrice - minVal) / range * canvas.height);
        ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, entryY); ctx.lineTo(canvas.width, entryY); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#F59E0B'; ctx.font = '10px monospace';
        ctx.fillText(`YOUR ENTRY (${activeTrade.type})`, 10, entryY - 4);
    }
}

function renderOrderbook(midPrice) {
    const askContainer = document.getElementById('orderBookAsks');
    const bidContainer = document.getElementById('orderBookBids');
    if (!askContainer || !bidContainer) return;
    let askHtml = '', bidHtml = '';
    for(let i=3; i>0; i--) {
        let p = midPrice * (1 + (i * 0.005));
        let v = (Math.random() * 15000 + 5000).toFixed(0);
        askHtml += `<div class="flex justify-between text-rose-500 font-mono text-[11px]"><span>${p.toFixed(6)}</span><span>${v}</span></div>`;
    }
    for(let i=1; i<=3; i++) {
        let p = midPrice * (1 - (i * 0.005));
        let v = (Math.random() * 15000 + 5000).toFixed(0);
        bidHtml += `<div class="flex justify-between text-green-500 font-mono text-[11px]"><span>${p.toFixed(6)}</span><span>${v}</span></div>`;
    }
    askContainer.innerHTML = askHtml;
    bidContainer.innerHTML = bidHtml;
}

function generateChainLog() {
    const container = document.getElementById('blockchainLogs');
    if (!container) return;
    const dynamicTickers = [state.activeToken ? state.activeToken.ticker : "USDSHT", "SHIB", "PEPE", "MEME"];
    const ticker = dynamicTickers[Math.floor(Math.random() * dynamicTickers.length)];
    const actions = ["Swapped BNB for", "Liquidity Added to", "Sniped Contract Presale for", "Panic Dumped"];
    const action = actions[Math.floor(Math.random() * actions.length)];
    const value = (Math.random() * 8 + 1).toFixed(2);
    const el = document.createElement('div');
    el.className = "text-gray-400 py-0.5 border-b border-[#121721] font-mono text-[11px]";
    el.innerHTML = `<span class="text-blue-400">[Tx]</span> 0x${Math.random().toString(16).substr(2, 6)}... ${action} <strong class="text-white">${value} ${ticker}</strong>`;
    container.prepend(el);
    if(container.children.length > 8) container.removeChild(container.lastChild);
}
