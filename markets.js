/* ============================================================
   AMBIENT MARKET SYSTEM & CANVAS ENGINE
   ============================================================ */

let priceHistory = Array(60).fill(0.0125);
let blockNumber = 942012;

function initMarkets() {
    setInterval(updateMarketTick, 1000);
}

function updateMarketTick() {
    blockNumber += Math.floor(Math.random() * 2) + 1;
    document.getElementById('simulatedBlockNum').innerText = `BLOCK #${blockNumber.toLocaleString()}`;

    // Standard Asset Random Walk
    let lastPrice = priceHistory[priceHistory.length - 1];
    let changePct = (Math.random() - 0.495) * 0.15; // Natural variance biased upwards 
    let newPrice = Math.max(0.00000010, lastPrice * (1 + changePct));
    
    priceHistory.shift();
    priceHistory.push(newPrice);

    renderChart();
    renderOrderbook(newPrice);
    generateChainLog();
}

function renderChart() {
    const canvas = document.getElementById('tradingCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Auto-scale layout dimensions
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const maxVal = Math.max(...priceHistory) * 1.1;
    const minVal = Math.min(...priceHistory) * 0.9;
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
        let p = midPrice * (1 + (i * 0.02));
        let v = (Math.random() * 50000).toFixed(0);
        askHtml += `<div class="flex justify-between text-rose-500"><span>${p.toFixed(6)}</span><span>${v}</span></div>`;
    }
    for(let i=1; i<=3; i++) {
        let p = midPrice * (1 - (i * 0.02));
        let v = (Math.random() * 50000).toFixed(0);
        bidHtml += `<div class="flex justify-between text-green-500"><span>${p.toFixed(6)}</span><span>${v}</span></div>`;
    }
    askContainer.innerHTML = askHtml;
    bidContainer.innerHTML = bidHtml;
}

function generateChainLog() {
    const container = document.getElementById('blockchainLogs');
    if (!container) return;
    
    const dynamicTickers = [state.activeToken ? state.activeToken.ticker : "MEME", "DOGE", "SHIB", "PEPE", "SHT"];
    const ticker = dynamicTickers[Math.floor(Math.random() * dynamicTickers.length)];
    const actions = ["Swapped BNB for", "Liquidity Added to", "Sniped Contract Presale for", "Panic Dumped"];
    const action = actions[Math.floor(Math.random() * actions.length)];
    const value = (Math.random() * 10).toFixed(2);

    const el = document.createElement('div');
    el.className = "text-gray-400 py-0.5 border-b border-[#121721]";
    el.innerHTML = `<span class="text-blue-400">[Tx]</span> 0x${Math.random().toString(16).substr(2, 6)}... ${action} <strong class="text-white">${value} ${ticker}</strong>`;
    
    container.prepend(el);
    if(container.children.length > 30) container.removeChild(container.lastChild);
}

function forcePump() {
    let last = priceHistory[priceHistory.length - 1];
    priceHistory[priceHistory.length - 1] = last * 1.45;
    playSound('buy');
}

function forceDump() {
    let last = priceHistory[priceHistory.length - 1];
    priceHistory[priceHistory.length - 1] = last * 0.55;
    playSound('liquidated');
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