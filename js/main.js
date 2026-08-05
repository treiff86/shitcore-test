/* ============================================================
   SYSTEM INITIALIZATION & HEARTBEAT CORE LOOPS
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial State Sync - deliberately NOT calling loadGame() here.
    // Without a connected wallet, every page open starts fresh at $1,000;
    // connecting a wallet is what pulls in a saved cloud state (see
    // offerCloudLoadIfExists() in web3.js), not a local restore.

    // 2. Interface Render Triggers
    renderPoolCards();
    updateUI();

    // 3. Engine Modulations Initializations
    initMarkets();

    // 4. Global Core Heartbeat Intervallic Loops
    let cloudSaveTickCounter = 0;
    setInterval(() => {
        processStakingRewards();
        tickMarketVolatility();

        // Cayman heat reduction optimization check
        if(state.ownedPerks.includes('cayman_vault') && state.globalHeat > 0 && !state.activeToken) {
            state.globalHeat = Math.max(0, state.globalHeat - 0.25);
            document.getElementById('heatPct').innerText = `${Math.floor(state.globalHeat)}%`;
            document.getElementById('heatBarFill').style.width = `${Math.floor(state.globalHeat)}%`;
        }

        // Cloud autosave every 30s, only while a wallet is connected - avoids
        // hammering Supabase on every single tick the way localStorage can.
        if (typeof walletAddress !== 'undefined' && walletAddress) {
            cloudSaveTickCounter++;
            if (cloudSaveTickCounter >= 30) {
                cloudSaveTickCounter = 0;
                saveToCloud();
            }
        }
    }, 1000);

    // 5. Global Reset Event Listener Bridge
    const resetBtn = document.getElementById('resetGameBtn');
    if(resetBtn) {
        resetBtn.addEventListener('click', () => {
            if(confirm("Refresh your funds back to $0? Your Degen Level, Rugged Savings, and perks stay as they are.")) {
                refreshFundsToZero();
            }
        });
    }
});

// Structural routing reset callbacks
function restartGame() {
    resetGame();
}
