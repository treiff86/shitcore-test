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
    document.getElementById('ruggedSavingsDisplay').innerText = state.ruggedSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('heatPct').innerText = `${state.globalHeat.toFixed(2)}%`;
    document.getElementById('heatBarFill').style.width = `${state.globalHeat}%`;

    // Progression Renders
    const currentLevelInfo = DEGEN_LEVELS[state.degenLevel];
    document.getElementById('levelBadge').innerText = `LVL ${state.degenLevel} — ${currentLevelInfo.name}`;
    document.getElementById('levelProgressLabel').innerText = `LVL ${state.degenLevel} — ${currentLevelInfo.name}`;
    
    const nextTarget = currentLevelInfo.target;
    document.getElementById('levelProgressNext').innerText = state.degenLevel >= 4 ? "MAX LEVEL" : `Next: $${nextTarget.toLocaleString()}`;
    const levelPct = Math.min(100, (state.ruggedSavings / nextTarget) * 100);
    document.getElementById('levelProgressBar').style.width = `${levelPct}%`;

    // Lambo Tier Tracking - now driven by manually-deposited Rugged
    // Savings, not everything you've ever earned
    let currentLambo = LAMBO_TIERS[0].name;
    for (let i = 0; i < LAMBO_TIERS.length; i++) {
        if (state.ruggedSavings >= LAMBO_TIERS[i].cost) {
            currentLambo = LAMBO_TIERS[i].name;
        }
    }
    document.getElementById('lamboTierDisplay').innerText = currentLambo;
    const lamboPct = Math.min(100, (state.ruggedSavings / 1000000) * 100);
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
    const isMedieval = document.body.classList.contains('medieval-mode');
    const isConmen = document.body.classList.contains('conmen-mode');
    const activeId = isMedieval ? 'toastMedieval' : (isConmen ? 'toastConmen' : 'toastDefault');
    const allToastIds = ['toastMedieval', 'toastConmen', 'toastDefault'];

    const toast = document.getElementById(activeId);
    allToastIds.filter(id => id !== activeId).forEach(id => {
        document.getElementById(id).classList.add('hidden'); // never show more than one at once
    });

    if (isMedieval) {
        document.getElementById('toastMessageMedieval').innerText = message;
        const bubble = document.getElementById('toastBubble');
        const borderColors = { info: '#000', success: '#16a34a', error: '#dc2626' };
        bubble.style.borderColor = borderColors[type] || '#000';
    } else if (isConmen) {
        document.getElementById('toastMessageConmen').innerText = message;
        const bubble = document.getElementById('toastBubbleConmen');
        const borderColors = { info: '#000', success: '#16a34a', error: '#dc2626' };
        bubble.style.borderColor = borderColors[type] || '#000';
    } else {
        document.getElementById('toastMessageDefault').innerText = message;
        const icon = document.getElementById('toastIconDefault');
        const iconClasses = { info: 'fa-info-circle text-blue-400', success: 'fa-check-circle text-emerald-400', error: 'fa-triangle-exclamation text-rose-400' };
        icon.className = (iconClasses[type] || iconClasses.info).split(' ').slice(1).join(' ');
        icon.innerHTML = `<i class="fa-solid ${(iconClasses[type] || iconClasses.info).split(' ')[0]} text-lg"></i>`;
    }

    toast.classList.remove('hidden');
    clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => { toast.classList.add('hidden'); }, 5000);
}

function showAlertModal(message) {
    document.getElementById('alertModalMessage').innerText = message;
    document.getElementById('customAlertModal').classList.remove('hidden');
    playSound('alarm');
}

function closeAlertModal() {
    document.getElementById('customAlertModal').classList.add('hidden');
}
