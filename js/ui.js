/* ============================================================
   UI RENDERING & ROUTING INTERFACES
   ============================================================ */

function switchTab(tabId) {
    playSound('click');
    const tabs = ['markets', 'ai', 'deployer', 'staking', 'mempool', 'info'];
    tabs.forEach(t => {
        const contentEl = document.getElementById(`content-${t}`);
        const tabEl = document.getElementById(`tab-${t}`);
        if (contentEl) contentEl.classList.add('hidden');
        if (tabEl) {
            tabEl.classList.remove('border-blue-500', 'text-white');
            tabEl.classList.add('border-transparent', 'text-gray-400');
        }
    });

    const activeContent = document.getElementById(`content-${tabId}`);
    const activeTab = document.getElementById(`tab-${tabId}`);
    if (activeContent) activeContent.classList.remove('hidden');
    if (activeTab) {
        activeTab.classList.remove('border-transparent', 'text-gray-400');
        activeTab.classList.add('border-blue-500', 'text-white');
    }
}

function updateUI() {
    // Formatted Core Stats
    document.getElementById('cashDisplay').innerText = state.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('lifetimeEarnedDisplay').innerText = state.lifetimeEarned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('heatPct').innerText = `${state.globalHeat.toFixed(2)}%`;
    document.getElementById('heatBarFill').style.width = `${state.globalHeat}%`;

    // Progression Renders
    const currentLevelInfo = DEGEN_LEVELS[state.degenLevel];
    document.getElementById('levelBadge').innerText = `LVL ${state.degenLevel} — ${currentLevelInfo.name}`;
    document.getElementById('levelProgressLabel').innerText = `LVL ${state.degenLevel} — ${currentLevelInfo.name}`;
    
    const nextTarget = currentLevelInfo.target;
    document.getElementById('levelProgressNext').innerText = state.degenLevel >= 4 ? "MAX LEVEL" : `Next: $${nextTarget.toLocaleString()}`;
    const levelPct = Math.min(100, (state.lifetimeEarned / nextTarget) * 100);
    document.getElementById('levelProgressBar').style.width = `${levelPct}%`;

    // Lambo Tier Tracking
    let currentLambo = LAMBO_TIERS[0].name;
    for (let i = 0; i < LAMBO_TIERS.length; i++) {
        if (state.lifetimeEarned >= LAMBO_TIERS[i].cost) {
            currentLambo = LAMBO_TIERS[i].name;
        }
    }
    document.getElementById('lamboTierDisplay').innerText = currentLambo;
    const lamboPct = Math.min(100, (state.lifetimeEarned / 1000000) * 100);
    document.getElementById('lamboProgressBar').style.width = `${lamboPct}%`;

    // Unlocking mechanics via permissions
    if (state.degenLevel >= 2) {
        document.getElementById('stakingLocked').classList.add('hidden');
        document.getElementById('stakingUnlocked').classList.remove('hidden');
        document.getElementById('stakingLockIcon').classList.remove('fa-lock');
        document.getElementById('stakingLockIcon').classList.add('fa-wheat-awn', 'text-green-400');
        document.getElementById('campaignPanel').classList.remove('hidden');
    } else {
        document.getElementById('stakingLocked').classList.remove('hidden');
        document.getElementById('stakingUnlocked').classList.add('hidden');
    }

    if (state.degenLevel >= 3) {
        document.getElementById('mevPanel').classList.remove('hidden');
        document.getElementById('mevLockedNotice').classList.add('hidden');
    }
    
    if (state.degenLevel >= 4) {
        document.getElementById('honeypotPanel').classList.remove('hidden');
    }

    // Call sub-module panels
    renderPerkShop();
    renderLeaderboard();
    updateDeployerUI();
}

function showToast(message, type = "info") {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    msgEl.innerText = message;
    
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 4000);
}

function showAlertModal(message) {
    document.getElementById('alertModalMessage').innerText = message;
    document.getElementById('customAlertModal').classList.remove('hidden');
    playSound('alarm');
}

function closeAlertModal() {
    document.getElementById('customAlertModal').classList.add('hidden');
}
