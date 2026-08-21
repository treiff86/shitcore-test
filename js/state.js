/* ============================================================
   STATE MANAGEMENT & ENGINE CONSTANTS
   ============================================================ */

const defaultState = {
    cash: 1000.00,
    lifetimeEarned: 0.00,
    ruggedSavings: 0.00,   // Lambo goal money - only grows when the player manually deposits via the Deposit button, unlike lifetimeEarned which tracks everything automatically
    globalHeat: 0,
    degenLevel: 1,
    
    // Active Token Deployment
    activeToken: null, 
    
    // Staking Pool Data
    stakedAmount: 0,
    stakedPoolId: null,
    unclaimedRewards: 0,
    lastHarvestOrStakeTime: null,

    // Perks / Upgrades Owned (IDs)
    ownedPerks: [],
    
    // Leaderboard entries
    victimLeaderboard: [],

    // NFT trait rewards (see TRAIT_REWARDS in web3.js) - permanent once
    // earned, persisted in the save so they survive even if the NFT is
    // later sold/transferred.
    claimedTraitRewards: [],   // reward ids already granted
    marketsLuckMultiplier: 1   // divides Markets catastrophe odds; 1 = no bonus
};

let state = { ...defaultState };

// Game Balance Tables
const DEGEN_LEVELS = {
    1: { name: "The Basement Dev", target: 3000 },
    2: { name: "The Shiller", target: 25000 },
    3: { name: "The Shadow Validator", target: 150000 },
    4: { name: "The Institutional Rugger", target: 1000000 }
};

const LAMBO_TIERS = [
    { name: "Hot Wheels Lambo", cost: 0 },
    { name: "Cardboard Bodykit Yukon", cost: 5000 },
    { name: "Salvage Title 2004 Gallardo", cost: 50000 },
    { name: "Rental Aventador (3 Hours)", cost: 200000 },
    { name: "Real SVJ Roadster (Victory)", cost: 1000000 }
];

// Deliberately NOT restoring from localStorage anymore - without a
// connected wallet, every fresh page load starts clean at $1,000. Kept as
// a function (rather than deleted outright) in case a local-only save mode
// gets reintroduced later; it just isn't called from anywhere right now.
function loadGame() {
    try {
        const saved = localStorage.getItem('shitcore_tycoon_save');
        if (saved) {
            const parsed = JSON.parse(saved);
            state = { ...defaultState, ...parsed };
            return true;
        }
    } catch (e) {
        console.error("Failed to load save file:", e);
    }
    return false;
}

// No-op by design - progress without a connected wallet is meant to be
// ephemeral (lost on refresh/close), and a connected wallet's progress is
// saved to Supabase via saveToCloud() instead (see web3.js). This is kept
// as a callable stub rather than removed so every existing saveGame() call
// site throughout the codebase still works without touching each one.
function saveGame() {
    // intentionally does nothing - see comment above
}

// TESTING ONLY - click the wallet balance in the header to add $4,200.
// Wired up for verifying the Caravaggio trait's starting-cash amount
// without needing a real qualifying wallet every time. Hard-gated to TEST
// Play - this must never work for a real LIVE player, full stop.
function addTestCash() {
    if (typeof isTestPlayMode === 'undefined' || !isTestPlayMode) return;
    state.cash = (state.cash || 0) + 4200;
    saveGame();
    if (typeof updateUI === "function") updateUI();
    if (typeof showToast === "function") showToast("🧪 Test: +$4,200 added.", "success");
}

async function resetGame() {
    state = JSON.parse(JSON.stringify(defaultState));
    localStorage.removeItem('shitcore_tycoon_save'); // harmless cleanup of any pre-existing save from before this change
    playSound('click');
    // Push the fresh state to the cloud save too, or reconnecting the same
    // wallet after the reload below would just pull the old progress right
    // back down and silently undo the reset.
    if (typeof saveToCloud === 'function') {
        try { await saveToCloud(); } catch (e) { console.warn('[state] resetGame cloud sync failed:', e); }
    }
    window.location.reload();
}

// Used on wallet disconnect - progress without a connected wallet is meant
// to be ephemeral, so disconnecting should show a clean slate immediately,
// same as a fresh page load would. Unlike resetGame() this doesn't reload
// the page (that would be a jarring/unnecessary disruption just for
// disconnecting) or touch localStorage (already unused, see loadGame()).
function resetGameStateInMemory() {
    state = JSON.parse(JSON.stringify(defaultState));
    // An open Markets position is NOT part of `state` - it lives in
    // markets.js. Without clearing it here the trade outlived the reset and
    // could still be closed for a margin refund on top of the fresh
    // balance, duplicating money.
    if (typeof clearActiveTradeOnReset === "function") clearActiveTradeOnReset();
    if (typeof updateUI === "function") updateUI();
}

// Resets spendable cash back to the $1,000 starting amount. Rugged
// Savings resets to $0 too, and Degen Level follows it right back down
// since it's a live reflection of Rugged Savings, not a separate stored
// achievement. Perk Shop upgrades follow the same rule - checkProgressions()
// strips any perk that requires a higher Degen Level than you're back
// down to, so perks bought this run don't carry over past a reset. No
// page reload.
async function refreshFundsToStart() {
    state.cash = 1000;
    state.ruggedSavings = 0;
    // Same money-duplication fix as resetGameStateInMemory(): an open trade
    // survives this reset otherwise, and closing it afterwards refunds its
    // margin on top of the fresh $1,000.
    if (typeof clearActiveTradeOnReset === "function") clearActiveTradeOnReset();
    checkProgressions(); // recalculates Degen Level to match the reset Rugged Savings
    playSound('click');
    if (typeof updateUI === "function") updateUI();
    if (typeof showToast === "function") showToast("💸 Funds refreshed to $1,000. Rugged Savings reset to $0.", "info");
    // Push immediately rather than waiting on the periodic autosave - same
    // reasoning as resetGame(): otherwise reconnecting before that next
    // tick would just pull the old numbers back down.
    if (typeof saveToCloud === 'function') {
        try { await saveToCloud(); } catch (e) { console.warn('[state] refreshFundsToStart cloud sync failed:', e); }
    }
}

/* ---------------- Zero-balance choice ---------------- */
// Triggered from updateUI() whenever cash is at/under $0. Guarded so it
// only pops once per "run" of being broke - if they play Bonus Stage and
// end up back at $0 later, it's allowed to show again.
let zeroBalanceModalShown = false;

function maybeShowZeroBalanceModal() {
    if (zeroBalanceModalShown || state.cash > 0) return;
    // Don't cover the LIVE/TEST picker while the master wallet still has an
    // unresolved choice to make there - this fires again once that's picked
    // and cash is still $0 by then (updateUI() runs again after).
    const playModeModal = document.getElementById('playModeModal');
    if (playModeModal && !playModeModal.classList.contains('hidden')) return;
    zeroBalanceModalShown = true;
    document.getElementById('zeroBalanceModal')?.classList.remove('hidden');
    if (typeof playSound === 'function') playSound('alarm');
}

function closeZeroBalanceModalForBonusStage() {
    // openBonusStage() refuses unless a Mid Evils or Conmen theme is active.
    // For everyone else this used to hide the modal, reset the "already
    // shown" flag, show an error toast - and then updateUI() immediately
    // re-opened the modal with its alarm sound, over and over. A broke
    // player with no NFT was stuck in that loop with only "Start Fresh" as
    // a way out. Check availability BEFORE tearing the modal down.
    const bonusStageAvailable = document.body.classList.contains('medieval-mode')
        || document.body.classList.contains('conmen-mode');
    if (!bonusStageAvailable) {
        if (typeof showToast === 'function') {
            showToast("Bonus Stage needs a Mid Evils or Conmen NFT. Try 'Start Fresh' instead.", "error");
        }
        return; // leave the modal up, and leave zeroBalanceModalShown TRUE so it can't re-alarm
    }
    zeroBalanceModalShown = false; // could hit $0 again after playing - let it show again if so
    document.getElementById('zeroBalanceModal')?.classList.add('hidden');
    if (typeof openBonusStage === 'function') openBonusStage();
}

// Deliberately the same full reset as the existing Reset Game flow
// (resetGame(), via restartGame()) - NOT refreshFundsToStart(), which
// keeps Rugged Savings on purpose. "Start from the beginning" means
// Rugged Savings goes back to 0 too, along with everything else.
function confirmZeroBalanceGameOver() {
    if (typeof restartGame === 'function') restartGame();
}

function addCash(amount) {
    if (isNaN(amount) || amount <= 0) return;
    state.cash += amount;
    state.lifetimeEarned += amount;
    checkProgressions();
    saveGame();
}

function depositToSavings(amount) {
    amount = Math.floor(Math.min(amount, state.cash) * 100) / 100; // never more than you actually have, round to cents
    if (isNaN(amount) || amount <= 0) {
        if (typeof showToast === 'function') showToast("You don't have any cash to deposit.", 'error');
        return false;
    }
    state.cash -= amount;
    state.ruggedSavings += amount;
    checkProgressions();
    if (typeof updateUI === 'function') updateUI();
    if (typeof showToast === 'function') {
        showToast(`Deposited $${amount.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} to Rugged Savings.`, 'success');
    }
    saveGame();
    return true;
}

// Degen Level is a LIVE reflection of current Rugged Savings, not a
// permanent achievement - if Rugged Savings goes down (Refresh Funds,
// Game Over), the level drops right along with it. Pure function: same
// savings amount always gives the same level, no hidden state.
function computeDegenLevel(savings) {
    let level = 1;
    while (DEGEN_LEVELS[level + 1] && savings >= DEGEN_LEVELS[level].target) level++;
    return level;
}

function checkProgressions() {
    const newLevel = computeDegenLevel(state.ruggedSavings);
    if (newLevel > state.degenLevel) {
        state.degenLevel = newLevel;
        showToast(`🎉 LEVELED UP! You are now: ${DEGEN_LEVELS[newLevel].name}`, "success");
        playSound('buy');
    } else if (newLevel !== state.degenLevel) {
        state.degenLevel = newLevel; // dropped - no toast/sound, just reflect it
        // Perks only last as long as the Degen Level that unlocked them -
        // dropping back down (Refresh Funds, Game Over) strips anything
        // that now requires a higher level than you're currently at, same
        // way the level itself isn't a permanent achievement.
        if (typeof PERK_CATALOG !== 'undefined' && state.ownedPerks && state.ownedPerks.length) {
            state.ownedPerks = state.ownedPerks.filter((id) => {
                const perk = PERK_CATALOG.find((p) => p.id === id);
                return !perk || perk.requiredLevel <= newLevel;
            });
        }
    }
    
    // Win Condition Check - matches Level 4's target and the Lambo
    // Tracker's top tier, both of which are Rugged-Savings-based, so the
    // win now means "actually saved $1,000,000", not just earned it.
    if (state.ruggedSavings >= 1000000) {
        document.getElementById('winModal').classList.remove('hidden');
        playSound('lambo');
    }
}
