/* ============================================================
   GAMIFIED MARKET SYSTEM - LEVERAGE SCALPING MINI-GAME
   ============================================================ */

let priceHistory = Array(60).fill(0.0125);
let blockNumber = 942012;

// Gamification State Variables
let activeTrade = null; // Stores: { type: 'LONG'|'SHORT', entryPrice: 0, margin: 0, pnl: 0 }
const LEVERAGE = 50;    // 50x Degen Leverage

function initMarkets() {
    setInterval(updateMarketTick, 1000);
}

function updateMarketTick() {
    blockNumber += Math.floor(Math.random() * 2) + 1;
    const blockEl = document.getElementById('simulatedBlockNum');
    if (blockEl) blockEl.innerText = `BLOCK #${blockNumber.toLocaleString()}`;

    // Standard Asset Random Walk
    let lastPrice = priceHistory[priceHistory.length - 1];
    
    // Natural variance biased by active trades to simulate market manipulation
    let bias = 0;
    if (activeTrade) {
        // 15% chance per tick that a market whale hunts your stop loss
        if (Math.random() < 0.15) {
            bias = activeTrade.type === 'LONG' ? -0.08 : 0.08; 
        } else {
            // Slight natural drift based on market momentum
            bias = (Math.random() - 0.48) * 0.04;
        }
    } else {
        bias = (Math.random() - 0.495) * 0.03;
    }

    let newPrice = Math.max(0.00000010, lastPrice * (1 + bias));
    
    priceHistory.shift();
    priceHistory.push(newPrice);

    // Calculate active position PnL or Liquidation
    if (activeTrade) {
        processActiveTrade(newPrice);
    }

    renderChart();
    renderOrderbook(newPrice);
    generateChainLog();
}

/* ============================================================
   TRADING ENGINE CORE LOGIC
   ============================================================ */

function handleMarketAction(actionType) {
    // If already in a trade, any click acts as a Panic Close / Take Profit
    if (activeTrade) {
        closePosition();
        return;
    }

    // Risk 10% of current cash assets on the trade
    let marginAllocation = state.cash * 0.10;
    if (marginAllocation < 10) {
        showToast("Insufficient capital to satisfy exchange margin bounds!", "error");
        return;
    }

    state.cash -= marginAllocation;
    let currentPrice = priceHistory[priceHistory.length - 1];

    activeTrade = {
        type: actionType, // 'LONG' or 'SHORT'
        entryPrice: currentPrice,
        margin: marginAllocation,
        pnl: 0
    };

    playSound('buy');
    showToast(`📈 Opened ${LEVERAGE}x ${actionType} position with $${marginAllocation.toFixed(2)} margin!`, "info");
    updateTradeButtonsUI();
    updateUI();
}

// Map old button structures cleanly to the new gamified gateway
function forcePump() { handleMarketAction('LONG'); }
function forceDump() { handleMarketAction('SHORT'); }

function processActiveTrade(currentPrice) {
    let priceDiffPct = (currentPrice - activeTrade.entryPrice) / activeTrade.entryPrice;
    
    // Invert performance metrics if shorting
    if (activeTrade.type === 'SHORT') {
        priceDiffPct = -priceDiffPct;
    }

    // Apply 50x leverage multiplier
    activeTrade.pnl = activeTrade.margin * (priceDiffPct * LEVERAGE);

    // Liquidation Check: If you lose 100% of your margin, you get wiped
    if (activeTrade.pnl <= -activeTrade.margin) {
        activeTrade.pnl = -activeTrade.margin;
        playSound('liquidated');
        showToast(`💥 LIQUIDATED! A market whale squeezed your position. Lost -$${activeTrade.margin.toFixed(2)}`, "error");
        
        activeTrade = null;
        resetTradeButtonsUI();
        updateUI();
        return;
    }

    // Update real-time UI text inside the chart card container dynamically
    updateActiveTradeHUD();
}

function closePosition() {
    if (!activeTrade) return;

    let finalPayout = activeTrade.margin + activeTrade.pnl;
    state.cash += finalPayout;
    
    if (activeTrade.pnl > 0) {
        state.lifetimeEarned += activeTrade.pnl;
        playSound('buy');
        showToast(`💰 POSITION CLOSED! Secured a green profit of +$${activeTrade.pnl.toFixed(2)}!`, "success");
    } else {
        playSound('click');
        showToast(`📉 Position closed in defense. Realized a loss of -$${Math.abs(activeTrade.pnl).toFixed(2)}.`, "error");
    }

    activeTrade = null;
    resetTradeButtonsUI();
    checkProgressions();
    updateUI();
}

/* ============================================================
   INTERFACE ADJUSTMENT WRAPPERS
   ============================================================ */

function updateTradeButtonsUI() {
    const pumpBtn = document.querySelector("button[onclick='forcePump()']");
    const dumpBtn = document.querySelector("button[onclick='forceDump()']");
    
    if (pumpBtn && dumpBtn) {
        // Transform the buttons to look like a single dynamic position management dashboard
        pumpBtn.innerHTML = `<span id="hudPnL">PnL: $0.00</span>`;
        pumpBtn.className = "w-full py-2 bg-amber-600 text-white font-extrabold rounded text-xs animate-pulse text-center cursor-pointer transition";
        pumpBtn.setAttribute("onclick", "closePosition()");
        
        dumpBtn.innerHTML = `❌ PANIC CLOSE`;
        dumpBtn.className = "w-full py-2 bg-rose-700 hover:bg-rose-600 text-white font-bold rounded text-xs text-center cursor-pointer transition";
        dumpBtn.setAttribute("onclick", "closePosition()");
    }
}

function resetTradeButtonsUI() {
    const pumpBtn = document.querySelector("button[onclick='closePosition()']");
    // Grab both transformed buttons to cleanly reset hooks
    const tradeButtons = document.querySelectorAll("button[onclick='closePosition()']");
    
    if (tradeButtons.length > 0) {
        const pBtn = tradeButtons[0];
        pBtn.innerHTML = `📈 PUMP IT`;
        pBtn.className = "px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded text-xs font-mono transition";
        pBtn.setAttribute("onclick", "forcePump()");
    }
    if (tradeButtons.length > 1) {
        const dBtn = tradeButtons[1];
        dBtn.innerHTML = `📉 DUMP IT`;
        dBtn.className = "px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded text-xs font-mono transition";
        dBtn.setAttribute("onclick", "forceDump()");
    }
}

function updateActiveTradeHUD() {
    const hud = document.getElementById('hudPnL');
    if (!hud) return;
    
    const prefix = activeTrade.pnl >= 0 ? "Profit: +" : "Loss: ";
    hud.innerText = `${activeTrade.type} PnL: ${prefix}$${activeTrade.pnl.toFixed(2)}`;
    
    // Flash green/red based on profitability
    if (activeTrade.pnl >= 0) {
        hud.parentElement.className = "w-full py-2 bg-emerald-600 text-black font-black rounded text-xs text-center cursor-pointer transition";
    } else {
        hud.parentElement.className = "w-full py-2 bg-amber-600 text-white font-black rounded text-xs text-center cursor-pointer transition";
    }
}

/* ============================================================
   VISUAL RENDER CONFIGURATIONS
   ============================================================ */

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

    // Plot Base Trendline
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < priceHistory.length; i++) {
        let x = (canvas.width / (priceHistory.length - 1)) * i;
        let y = canvas.height - ((priceHistory[i] - minVal) / range * canvas.height);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Visual Gamification: Render entry price horizontal line if active in trade
    if (activeTrade) {
        let entryY = canvas.height - ((activeTrade.entryPrice - minVal) / range * canvas.height);
        ctx.strokeStyle = '#F59E0B'; // Amber entry line
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]); // Dashed line
        ctx.beginPath();
        ctx.moveTo(0, entryY);
        ctx.lineTo(canvas.width, entryY);
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash styling
        
        // Label entry line
        ctx.fillStyle = '#F59E0B';
        ctx.font = '10px monospace';
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

function runMevFrontrun() {
    if (state.degenLevel < 3) return;
    let profit = Math.floor(Math.random() * 150) + 50;
    state.globalHeat = Math.min(100, state.globalHeat + 8);
    addCash(profit);
    showToast(`🤖 MEV Bot Frontran a sandwich block! Sniped +$${profit}.00`, "success");
    playSound('buy');
    updateUI();
}
