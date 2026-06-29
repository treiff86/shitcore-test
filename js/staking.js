/* ============================================================
   PONZI POOLS & LIQUIDATION ALGORITHMS
   ============================================================
   New in this version:
   - Blackhole Liquidity Devourer APY bumped to 42069%.
   - Withdrawing principal now carries a tiny 0.01% rug risk,
     same severity tier as every other "you're starting over"
     event elsewhere in the game.
   - Live Yield Logs is now actually alive: an ambient ticker
     posts fake third-party deposits/withdrawals/harvests/drains
     constantly (same energy as the Markets chain feed), PLUS
     real reactive lines whenever the player deposits, withdraws,
     or harvests.
   - Harvesting and withdrawing both still add straight to
     wallet cash only — neither counts toward lifetimeEarned.
   ============================================================ */

const POOLS = [
    { id: 'toilet', name: "Porcelain Yield Slip", apy: 420 },
    { id: 'nuclear', name: "Plutonium Compound Core", apy: 6900 },
    { id: 'singularity', name: "Blackhole Liquidity Devourer", apy: 42069 }
];

const WITHDRAW_RUG_CHANCE = 0.0001; // 0.01%
const AMBIENT_YIELD_LOG_INTERVAL_MS = 1800;

/* ---- small, self-contained helpers (duplicated on purpose so this
   file never depends on markets.js having loaded first) ---- */

function randomFromYield(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function randomYieldWallet() {
    const hex = '0123456789abcdef';
    let s = '0x';
    for (let i = 0; i < 4; i++) s += hex[Math.floor(Math.random() * 16)];
    return s + '...' + Math.floor(Math.random() * 900 + 100);
}
function randomYieldAmt() { return (Math.random() * 9000 + 50).toFixed(2); }

/* ---- flavor pools ---- */

const STAKE_DEPOSIT_LINES = [
    (amt, pool) => `You deposited $${amt} into ${pool}. The pool says "thank you for your sacrifice."`,
    (amt, pool) => `$${amt} locked into ${pool}. Definitely not a pyramid scheme (it is).`,
    (amt, pool) => `Fresh $${amt} liquidity added to ${pool}. Somewhere, an early depositor smiles.`,
];

const STAKE_WITHDRAW_LINES = [
    (amt, pool) => `You pulled $${amt} out of ${pool} clean. Smart move, or a lucky one.`,
    (amt, pool) => `$${amt} successfully extracted from ${pool} before anyone noticed.`,
    (amt, pool) => `Principal of $${amt} returned from ${pool}. The vault sheds a single tear.`,
];

const STAKE_WITHDRAW_RUGGED_LINES = [
    (amt) => `Your withdrawal request for $${amt} got "processed" by a contract that no longer exists.... DRAIN.`,
    (amt) => `The withdrawal queue was actually just a funnel to the dev wallet. $${amt} gone.`,
    (amt) => `A "routine maintenance" event ate your $${amt} withdrawal mid-transaction. Routine, apparently.`,
];

const STAKE_HARVEST_LINES = [
    (amt) => `You harvested $${amt} in yield. The printer go brrr, briefly.`,
    (amt) => `$${amt} in "generated yield derivatives" successfully laundered into your wallet.`,
    (amt) => `$${amt} claimed. Definitely real money, not just numbers going up.`,
];

const STAKE_EXPLOIT_LINES = [
    `Flash loan structural liquidation drained your principal.... DRAIN.`,
    `An anonymous dev forked the vault mid-harvest, removed the withdraw function, and vanished. Classic.`,
    `The audit said "low risk." The audit was written by the dev. Principal: gone.`,
];

const AMBIENT_YIELD_TEMPLATES = [
    { tag: 'DEPOSIT', color: 'text-green-400', text: () => `${randomYieldWallet()} deposited ${randomYieldAmt()} USDSHT into ${randomFromYield(POOLS).name}. Bold strategy.` },
    { tag: 'WITHDRAW', color: 'text-amber-400', text: () => `${randomYieldWallet()} withdrew ${randomYieldAmt()} USDSHT from ${randomFromYield(POOLS).name}. Got out clean, allegedly.` },
    { tag: 'HARVEST', color: 'text-emerald-400', text: () => `${randomYieldWallet()} harvested ${randomYieldAmt()} USDSHT in yield. Definitely sustainable.` },
    { tag: 'DRAIN', color: 'text-rose-500 font-bold', text: () => `${randomYieldWallet()} tried harvesting from ${randomFromYield(POOLS).name}.... DRAIN. Principal: gone.` },
    { tag: 'WHALE', color: 'text-blue-400', text: () => `A whale just deposited ${randomYieldAmt()} USDSHT into ${randomFromYield(POOLS).name} in a single block.` },
    { tag: 'RUG', color: 'text-rose-500', text: () => `A "withdrawal processing fee" quietly ate ${randomYieldAmt()} USDSHT from someone's exit. Cost of doing business.` },
    { tag: 'APY', color: 'text-amber-400', text: () => `${randomFromYield(POOLS).name}'s APY just recalculated itself. The math still doesn't check out.` },
    { tag: 'AUDIT', color: 'text-purple-400', text: () => `Someone asked if these pools are audited. The silence in the Discord was deafening.` },
    { tag: 'PANIC', color: 'text-rose-400', text: () => `${randomYieldWallet()} is asking in chat where the withdraw button is. There isn't one. There never was.` },
];

function pushYieldLog(tag, text, colorClass) {
    const log = document.getElementById('stakingEventLog');
    if (!log) return;
    const el = document.createElement('div');
    el.className = "py-0.5 border-b border-[#1A2232]/30";
    el.innerHTML = `<span class="${colorClass} font-bold">[${tag}]</span> <span class="text-gray-300">${text}</span>`;
    log.prepend(el);
    while (log.children.length > 40) log.removeChild(log.lastChild);
}

function generateAmbientYieldLog() {
    const t = randomFromYield(AMBIENT_YIELD_TEMPLATES);
    pushYieldLog(t.tag, t.text(), t.color);
}

/* ---- core pool logic ---- */

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

    const pool = POOLS.find(p => p.id === state.stakedPoolId);
    pushYieldLog('DEPOSIT', randomFromYield(STAKE_DEPOSIT_LINES)(amount.toFixed(2), pool ? pool.name : 'the pool'), 'text-green-400');

    saveGame();
    updateUI();
}

/** Pulls staked principal back to wallet cash. Tiny 0.01% rug risk on the
 *  way out — same severity tier as every other catastrophic event in the
 *  game. Does NOT touch lifetimeEarned: this is your own money coming
 *  back, not new earnings. */
function withdrawStake() {
    if (state.stakedAmount <= 0) {
        showToast("Nothing staked to withdraw.", "error");
        return;
    }

    const amount = state.stakedAmount;
    const poolName = (POOLS.find(p => p.id === state.stakedPoolId) || {}).name || 'the pool';

    if (Math.random() < WITHDRAW_RUG_CHANCE) {
        state.stakedAmount = 0;
        state.stakedPoolId = null;
        state.unclaimedRewards = 0;

        playSound('rug');
        pushYieldLog('DRAIN', randomFromYield(STAKE_WITHDRAW_RUGGED_LINES)(amount.toFixed(2)), 'text-red-500 font-extrabold');
        showAlertModal(`🚨 WITHDRAWAL RUGGED! Your $${amount.toFixed(2)} principal vanished mid-withdrawal. Classic.`);

        document.getElementById('stakedLocked').innerText = "$0.00";
        document.getElementById('stakedPoolType').innerText = "—";
        POOLS.forEach(p => { const c = document.getElementById(`pool-card-${p.id}`); if (c) c.classList.remove('selected'); });

        saveGame();
        updateUI();
        return;
    }

    state.cash += amount;
    state.stakedAmount = 0;
    state.stakedPoolId = null;

    playSound('click');
    showToast(`💵 Withdrew $${amount.toFixed(2)} in principal back to your wallet.`, "success");
    pushYieldLog('WITHDRAW', randomFromYield(STAKE_WITHDRAW_LINES)(amount.toFixed(2), poolName), 'text-amber-400');

    document.getElementById('stakedLocked').innerText = "$0.00";
    document.getElementById('stakedPoolType').innerText = "—";
    POOLS.forEach(p => { const c = document.getElementById(`pool-card-${p.id}`); if (c) c.classList.remove('selected'); });

    saveGame();
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
        pushYieldLog('DRAIN', randomFromYield(STAKE_EXPLOIT_LINES), 'text-rose-500 font-bold');
        state.stakedAmount = 0;
        state.unclaimedRewards = 0;
        state.stakedPoolId = null;
        playSound('liquidated');
        
        document.getElementById('stakedLocked').innerText = "$0.00";
        document.getElementById('stakedPoolType').innerText = "—";
        POOLS.forEach(p => { const c = document.getElementById(`pool-card-${p.id}`); if (c) c.classList.remove('selected'); });
        saveGame();
        updateUI();
        showAlertModal("⚠️ EXPLORED RESTRUCTURE! A rogue hacker group systematically frontran your withdrawal path, vaporizing 100% of your vault configurations.");
        return;
    }

    let harvested = state.unclaimedRewards;
    state.unclaimedRewards = 0;
    state.cash += harvested; // wallet cash only — does not count toward lifetimeEarned/Lambo

    const unclaimedEl = document.getElementById('unclaimedShitcoins');
    if (unclaimedEl) unclaimedEl.innerText = "0.0000";

    showToast(`🌾 Harvested +$${harvested.toFixed(2)} in generated yield derivatives!`, "success");
    pushYieldLog('HARVEST', randomFromYield(STAKE_HARVEST_LINES)(harvested.toFixed(2)), 'text-emerald-400');
    playSound('buy');
    saveGame();
    updateUI();
}

/* ============================================================
   WITHDRAW BUTTON + AMBIENT LOG TICKER
   Both self-initializing via JS — no HTML changes required.
   ============================================================ */

function setupWithdrawButton() {
    if (document.getElementById('withdrawStakeBtn')) return;

    const poolTypeEl = document.getElementById('stakedPoolType');
    if (!poolTypeEl) {
        setTimeout(setupWithdrawButton, 200); // DOM not ready yet, retry shortly
        return;
    }

    const infoBlock = poolTypeEl.closest('div');
    if (!infoBlock) return;

    const btnHtml = `
        <button id="withdrawStakeBtn" onclick="withdrawStake()" class="w-full mt-2 py-2 bg-amber-600 hover:bg-amber-500 text-black font-extrabold text-xs rounded-lg transition shadow-md uppercase tracking-wider">
            Withdraw Principal
        </button>`;
    infoBlock.insertAdjacentHTML('afterend', btnHtml);
}

document.addEventListener('DOMContentLoaded', () => {
    setupWithdrawButton();
    setInterval(generateAmbientYieldLog, AMBIENT_YIELD_LOG_INTERVAL_MS);
});
