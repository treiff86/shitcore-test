/* ============================================================
   UPGRADE PERK CATALOG SYSTEM
   ============================================================
   Descriptions rewritten in plain English to match what each
   perk actually does in code (see deployer.js):
   - tg_bot: halves Hype decay (2.5/sec -> 1.5/sec)
   - shill_army: +40% capital inflow rate on active deployments
   - cayman_vault: seizures and rug pulls generate ~50% less
     Regulatory Heat going forward (applyCaymanDiscount in
     deployer.js)
   ============================================================ */

const PERK_CATALOG = [
    { id: 'tg_bot', name: "Telegram Bot Automator", cost: 600, desc: "Your Hype Meter drains 40% slower AND generates +1% Hype per second on its own — campaigns last much longer with way less manual upkeep." },
    { id: 'shill_army', name: "DeFi Twitter Coordination Network", cost: 2500, desc: "+40% capital inflow, every Marketing Campaign costs 25% less to run, and your tracked victim count climbs an extra 50% faster for bigger leaderboard numbers." },
    { id: 'cayman_vault', name: "Offshore Cayman Layering Loop", cost: 12000, desc: "Contract seizures and rug pulls generate about 50% less Regulatory Heat from here on out." }
];

function renderPerkShop() {
    const container = document.getElementById('perkShopContainer');
    if (!container) return;

    container.innerHTML = PERK_CATALOG.map(p => {
        const owned = state.ownedPerks.includes(p.id);
        return `
            <div class="perk-row ${owned ? 'owned' : ''}">
                <div class="max-w-[70%]">
                    <strong class="text-white text-xs block">${p.name}</strong>
                    <span class="text-[10px] text-gray-400 font-light leading-tight block mt-0.5">${p.desc}</span>
                </div>
                <button onclick="buyPerk('${p.id}')" ${owned ? 'disabled' : ''} class="px-3 py-1.5 ${owned ? 'bg-gray-800 text-gray-500' : 'bg-emerald-600 hover:bg-emerald-500 text-black'} font-extrabold text-xs rounded transition whitespace-nowrap">
                    ${owned ? 'OWNED' : `$${p.cost.toLocaleString()}`}
                </button>
            </div>
        `;
    }).join('');
}

function buyPerk(id) {
    if (state.ownedPerks.includes(id)) return;
    const perk = PERK_CATALOG.find(p => p.id === id);
    if (!perk || state.cash < perk.cost) { showToast("Insufficient asset clearings!"); return; }

    state.cash -= perk.cost;
    state.ownedPerks.push(id);
    playSound('buy');
    showToast(`🛒 Upgrade acquired: ${perk.name}`, "success");
    updateUI();
}

function renderLeaderboard() {
    const container = document.getElementById('victimLeaderboard');
    if (!container) return;

    if (state.victimLeaderboard.length === 0) {
        container.innerHTML = `<div class="text-gray-500 italic text-[11px]">No rugs pulled yet. Get to work.</div>`;
        return;
    }

    container.innerHTML = state.victimLeaderboard.map((l, idx) => `
        <div class="flex justify-between items-center text-[11px] border-b border-[#1A2232] py-1 text-gray-400">
            <span>#${idx + 1} <strong class="text-white">${l.name} (${l.ticker})</strong></span>
            <span class="text-rose-400 font-mono">+$${l.cash.toLocaleString('en-US', { maximumFractionDigits: 0 })} (<span class="text-gray-500">${l.suckers} victims</span>)</span>
        </div>
    `).join('');
}
