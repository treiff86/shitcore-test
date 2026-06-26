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
        // --- 🎲 NEW DEGEN RISK LOGIC ---
        
        // 1. RUGGED CHECK (1% chance per tick)
        if (Math.random() < 0.01) {
            triggerRugged();
            return; 
        }

        // 2. DRAINED CHECK (0.01% chance per tick)
        if (Math.random() < 0.0001) {
            triggerDrained();
            return;
        }
        
        // --- END RISK LOGIC ---

        // 15% chance per tick that a market whale hunts your stop loss
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
   TRADING ENGINE CORE LOGIC (Rest of your functions remain same)
   ============================================================ */
// [Keep handleMarketAction, processActiveTrade, closePosition, etc. here]
