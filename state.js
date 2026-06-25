/* ============================================================
   STATE MANAGEMENT & ENGINE CONSTANTS
   ============================================================ */

const defaultState = {
    cash: 1000.00,
    lifetimeEarned: 0.00,
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
    victimLeaderboard: []
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

function saveGame() {
    try {
        localStorage.setItem('shitcore_tycoon_save', JSON.stringify(state));
    } catch (e) {
        console.error("Save failed:", e);
    }
}

function resetGame() {
    state = JSON.parse(JSON.stringify(defaultState));
    localStorage.removeItem('shitcore_tycoon_save');
    playSound('click');
    window.location.reload();
}

function addCash(amount) {
    if (isNaN(amount) || amount <= 0) return;
    state.cash += amount;
    state.lifetimeEarned += amount;
    checkProgressions();
    saveGame();
}

function checkProgressions() {
    // Level Up Check
    let currentTier = DEGEN_LEVELS[state.degenLevel];
    while (currentTier && state.lifetimeEarned >= currentTier.target && state.degenLevel < 4) {
        state.degenLevel++;
        currentTier = DEGEN_LEVELS[state.degenLevel];
        showToast(`🎉 LEVELED UP! You are now: ${currentTier.name}`, "success");
        playSound('buy');
    }
    
    // Win Condition Check
    if (state.lifetimeEarned >= 1000000) {
        document.getElementById('winModal').classList.remove('hidden');
        playSound('lambo');
    }
}