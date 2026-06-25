/* ============================================================
   PONZI POOLS & LIQUIDATION ALGORITHMS
   ============================================================ */

const POOLS = [
    { id: 'toilet', name: "Porcelain Yield Slip", apy: 420 },
    { id: 'nuclear', name: "Plutonium Compound Core", apy: 6900 },
    { id: 'singularity', name: "Blackhole Liquidity Devourer", apy: 880000 }
];

function renderPoolCards() {
    const container = document.getElementById('poolCardsContainer');
    if(!container || container.children.length > 0) return; // Prevent duplications

    container.innerHTML = POOLS.map(p => `
        <div id="pool-card-${p.id}" onclick="selectPool('${p.id}')" class="pool-card">
            <h4 class="font-bold text-white text-xs uppercase mb-1">${p.name}</h4>
            <div class="text-xl font-black font-mono text-amber-500 animate-pulse">${p.apy}% APY</div>
            <p class="text-[9px] text-gray-500 mt-2 font-mono">ID: ${p.id.toUpperCase()}_VAULT</p>
        </div>
    `).join('');
}

function selectPool(id) {
    POOLS.forEach(p => {
        const card = document.getElementById(`pool-card-${p.id}`);
        if(card) card.classList.remove('selected');
    });
    document.getElementById(`pool-card-${id}`).classList.add('selected');
    state.stakedPoolId = id;
    playSound('click');
}

function stakeTokens() {
    if(!state.stakedPoolId) { showToast("Select a structural yield card target first!"); return; }
    const amount = parseFloat(document.getElementById('stakeAmount').value) || 0;
    
    if(amount <= 0 || state.cash < amount) {
        showToast("Invalid allocation metrics requested!");
        return;
    }

    state.cash -= amount;
    state.stakedAmount += amount;
    state.lastHarvestOrStakeTime = Date.now();
    
    playSound('stake');
    document.getElementById('stakedLocked').innerText = `$${state.stakedAmount.toFixed(2)}`;
    document.getElementById('stakedPoolType').innerText = state.stakedPoolId.toUpperCase();
    
    updateUI();
}

function processStakingRewards() {
    if(state.stakedAmount <= 0 || !state.stakedPoolId) return;

    const pool = POOLS.find(p => p.id === state.stakedPoolId);
    if(!pool) return;

    // Realtime incremental generation matrix
    let rewardPerSec = (state.stakedAmount * (pool.apy / 100)) / (365 * 24 * 3600);
    state.unclaimedRewards += rewardPerSec;

    document.getElementById('unclaimedShitcoins').innerText = state.unclaimedRewards.toLocaleString('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});
}

function harvestRewards() {
    if(state.unclaimedRewards <= 0) return;

    // Exploit roll calculator configuration bounds
    if(Math.random() < 0.15) {
        const log = document.getElementById('stakingEventLog');
        log.innerHTML += `<div class="text-rose-500 font-bold">[EXPLOIT] Flash loan structural liquidation drained your principal!</div>`;
        state.stakedAmount = 0;
        state.unclaimedRewards = 0;
        state.stakedPoolId = null;
        playSound('liquidated');
        
        document.getElementById('stakedLocked').innerText = "$0.00";
        document.getElementById('stakedPoolType').innerText = "—";
        updateUI();
        showAlertModal("⚠️ EXPLORED RESTRUCTURE! A rogue hacker group systematically frontran your withdrawal path, vaporizing 100% of your vault configurations.");
        return;
    }

    let harvested = state.unclaimedRewards;
    state.unclaimedRewards = 0;
    addCash(harvested);
    
    showToast(`🌾 Harvested +$${harvested.toFixed(2)} in generated yield derivatives!`, "success");
    playSound('buy');
    updateUI();
}