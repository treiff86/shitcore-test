/* ============================================================
   TOKEN DEPLOYER ENGINE & COMMUNITY LOOPS
   ============================================================ */

let deployerInterval = null;

function updateDeployerUI() {
    const placeholder = document.getElementById('deployerPlaceholder');
    const active = state.activeToken;

    if(!active) {
        placeholder.classList.remove('hidden');
        document.getElementById('pullRugBtn').disabled = true;
        document.getElementById('pullRugBtn').className = "w-full py-3 bg-gradient-to-r from-red-600 to-rose-700 text-white font-extrabold rounded-lg text-xs shadow-lg uppercase opacity-40 cursor-not-allowed";
        return;
    }

    placeholder.classList.add('hidden');
    document.getElementById('monitorTokenName').innerText = active.name;
    document.getElementById('monitorTokenTicker').innerText = `$${active.ticker}`;
    document.getElementById('monitorStatus').innerText = active.auditThreat >= 100 ? "UNDER INVESTIGATION" : "LIVE ACCUMULATION";
    
    document.getElementById('monitorRaised').innerText = `$${active.raised.toLocaleString('en-US', {maximumFractionDigits:2})}`;
    document.getElementById('monitorSuckers').innerText = Math.floor(active.suckers).toLocaleString();
    document.getElementById('monitorPrice').innerText = `$${active.price.toFixed(6)}`;
    document.getElementById('monitorHoneypot').innerText = active.honeypot ? "ON (BACKDOOR BLOCKED)" : "OFF";
    document.getElementById('monitorHoneypot').className = active.honeypot ? "text-rose-500 font-bold text-sm font-mono" : "text-gray-500 font-bold text-sm font-mono";

    document.getElementById('hypePct').innerText = `${Math.floor(active.hype)}%`;
    document.getElementById('hypeBar').style.width = `${Math.floor(active.hype)}%`;

    document.getElementById('auditThreatPct').innerText = `${Math.floor(active.auditThreat)}%`;
    document.getElementById('auditThreatBar').style.width = `${Math.floor(active.auditThreat)}%`;

    // Activate pulling interaction elements
    document.getElementById('pullRugBtn').disabled = false;
    document.getElementById('pullRugBtn').className = "w-full py-3 bg-gradient-to-r from-red-600 to-rose-700 text-white font-extrabold rounded-lg text-xs shadow-lg uppercase hover:from-red-500 hover:to-rose-600 cursor-pointer transition";
}

function launchToken() {
    if(state.activeToken) {
        showToast("You already have an active deployment draining funds!", "error");
        return;
    }

    const cost = parseFloat(document.getElementById('deployLiquidity').value) || 200;
    if(state.cash < cost) {
        showToast("Insufficient cash reserves to seed structural liquidity!", "error");
        return;
    }

    state.cash -= cost;
    playSound('launch');

    state.activeToken = {
        name: document.getElementById('deployName').value || "ScamCoin",
        ticker: (document.getElementById('deployTicker').value || "SCAM").toUpperCase(),
        liquidity: cost,
        raised: 0,
        suckers: 0,
        price: 0.0001,
        toxicity: parseInt(document.getElementById('toxicityTaxSlider').value) || 10,
        hype: 30,
        auditThreat: 0,
        honeypot: document.getElementById('honeypotToggle') ? document.getElementById('honeypotToggle').checked : false
    };

    document.getElementById('chatFeed').innerHTML = `<div class="text-green-400">[Dev] Contract deployed. Generating TG hype channel groups...</div>`;
    
    if(deployerInterval) clearInterval(deployerInterval);
    deployerInterval = setInterval(processTokenLifecycle, 1000);
    
    showToast("🚀 Toxic deployment live on-chain!", "success");
    updateUI();
}

function processTokenLifecycle() {
    const t = state.activeToken;
    if(!t) return;

    // Upgrades modifiers
    let botOwned = state.ownedPerks.includes('tg_bot');
    let influencerOwned = state.ownedPerks.includes('shill_army');

    let hypeDecay = 2.5;
    if(botOwned) hypeDecay -= 1.0; 
    t.hype = Math.max(0, t.hype - hypeDecay);

    // Inflow calculation engine logic
    let entryRate = (t.hype / 10) * (1 + (t.liquidity / 1000));
    if(influencerOwned) entryRate *= 1.40;

    let newSuckers = Math.random() * entryRate;
    t.suckers += newSuckers;
    
    let fundsInflow = newSuckers * (Math.random() * 45 + 5);
    t.raised += fundsInflow;
    t.price = 0.0001 * (1 + (t.raised / t.liquidity));

    // Audit Accumulation Calculation Matrix
    let threatGrowth = (t.toxicity * 0.12) + 1.2;
    if(t.honeypot) threatGrowth *= 2.0;
    t.auditThreat += threatGrowth;

    // Feed dynamic context statements to simulation panels
    if (Math.random() < 0.4) {
        const lines = ["Is this safe?", "Dev doxed?", "Gonna fly 100x!", "Rug imminent?", "Bought the dip!", "LFG!!!"];
        const feed = document.getElementById('chatFeed');
        if(feed) {
            feed.innerHTML += `<div><span class="text-amber-500">Anon_${Math.floor(Math.random()*9000)}:</span> ${lines[Math.floor(Math.random()*lines.length)]}</div>`;
            feed.scrollTop = feed.scrollHeight;
        }
    }

    // Checking legal systemic compliance barriers
    if(t.auditThreat >= 100) {
        clearInterval(deployerInterval);
        state.globalHeat = Math.min(100, state.globalHeat + 25);
        showAlertModal(`🚨 CONTRACT SEIZED! The authorities audited $${t.ticker}. Your pool liquidity and raised assets were frozen instantly.`);
        state.activeToken = null;
        
        if(state.globalHeat >= 100) {
            triggerLossGameOver();
        }
    }
    updateUI();
}

function manualShill() {
    if(!state.activeToken) return;
    if(state.cash < 50) { showToast("Not enough cash for promotion campaigns!"); return; }
    state.cash -= 50;
    state.activeToken.hype = Math.min(100, state.activeToken.hype + 25);
    playSound('click');
    updateUI();
}

function toggleHoneypot() {
    if(state.activeToken) {
        state.activeToken.honeypot = document.getElementById('honeypotToggle').checked;
    }
}

function pullTheRug() {
    const t = state.activeToken;
    if(!t) return;

    clearInterval(deployerInterval);
    playSound('rug');

    let stolenCash = t.raised * (t.toxicity / 100) + t.liquidity;
    if(t.honeypot) stolenCash = t.raised + t.liquidity; // Take it all

    state.cash += stolenCash;
    state.lifetimeEarned += stolenCash;

    // Record entry to leaderboard
    state.victimLeaderboard.unshift({
        name: t.name, ticker: t.ticker, cash: stolenCash, suckers: Math.floor(t.suckers)
    });

    state.globalHeat = Math.min(100, state.globalHeat + Math.floor(t.toxicity / 4));
    state.activeToken = null;

    showToast(`💀 RUG PULLED! Siphoned +$${stolenCash.toLocaleString('en-US',{maximumFractionDigits:2})} into private wallets.`, "success");
    checkProgressions();
    updateUI();

    if(state.globalHeat >= 100) {
         triggerLossGameOver();
    }
}

function triggerLossGameOver() {
    document.getElementById('lossModal').classList.remove('hidden');
    document.getElementById('lossMessage').innerText = "Regulatory Heat maxed out at 100%. Tax compliance enforcement raids seized your account assets.";
    playSound('liquidated');
}