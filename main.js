/* ============================================================
   SYSTEM INITIALIZATION & HEARTBEAT CORE LOOPS
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial State Sync
    loadGame();

    // 2. Interface Render Triggers
    renderPoolCards();
    updateUI();

    // 3. Engine Modulations Initializations
    initMarkets();

    // 4. Global Core Heartbeat Intervallic Loops
    setInterval(() => {
        processStakingRewards();
        
        // Cayman heat reduction optimization check
        if(state.ownedPerks.includes('cayman_vault') && state.globalHeat > 0 && !state.activeToken) {
            state.globalHeat = Math.max(0, state.globalHeat - 0.25);
            document.getElementById('heatPct').innerText = `${Math.floor(state.globalHeat)}%`;
            document.getElementById('heatBarFill').style.width = `${Math.floor(state.globalHeat)}%`;
        }
    }, 1000);

    // 5. Global Reset Event Listener Bridge
    const resetBtn = document.getElementById('resetGameBtn');
    if(resetBtn) {
        resetBtn.addEventListener('click', () => {
            if(confirm("Are you sure you want to exit your criminal enterprise and wipe your progress entirely?")) {
                resetGame();
            }
        });
    }
});

// Structural routing reset callbacks
function restartGame() {
    resetGame();
}