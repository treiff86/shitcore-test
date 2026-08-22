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
    { id: 'tg_bot', name: "Telegram Bot Automator", cost: 600, requiredLevel: 1, desc: "Your Hype Meter drains 40% slower AND generates +1% Hype per second on its own — campaigns last much longer with way less manual upkeep." },
    { id: 'shill_army', name: "DeFi Twitter Coordination Network", cost: 2500, requiredLevel: 2, desc: "+40% capital inflow, every Marketing Campaign costs 25% less to run, and your tracked victim count climbs an extra 50% faster for bigger leaderboard numbers." },
    { id: 'cayman_vault', name: "Offshore Cayman Layering Loop", cost: 12000, requiredLevel: 3, desc: "Contract seizures and rug pulls generate about 50% less Regulatory Heat from here on out." }
];

function renderPerkShop() {
    const container = document.getElementById('perkShopContainer');
    if (!container) return;

    container.innerHTML = PERK_CATALOG.map(p => {
        const owned = state.ownedPerks.includes(p.id);
        const locked = state.degenLevel < p.requiredLevel;
        let btnLabel, btnClass, btnDisabled;
        if (locked) {
            btnLabel = `🔒 Lvl ${p.requiredLevel}`;
            btnClass = 'bg-gray-800 text-gray-500';
            btnDisabled = 'disabled';
        } else if (owned) {
            btnLabel = 'OWNED';
            btnClass = 'bg-gray-800 text-gray-500';
            btnDisabled = 'disabled';
        } else {
            btnLabel = `$${p.cost.toLocaleString()}`;
            btnClass = 'bg-emerald-600 hover:bg-emerald-500 text-black';
            btnDisabled = '';
        }
        return `
            <div class="perk-row ${owned ? 'owned' : ''} ${locked ? 'opacity-50' : ''}">
                <div class="max-w-[70%]">
                    <strong class="text-white text-xs block">${p.name}</strong>
                    <span class="text-[10px] text-gray-400 font-light leading-tight block mt-0.5">${p.desc}</span>
                    ${locked ? `<span class="text-[10px] text-amber-400 font-semibold block mt-1">Unlocks at Degen Level ${p.requiredLevel} (${DEGEN_LEVELS[p.requiredLevel]?.name || ''})</span>` : ''}
                </div>
                <button onclick="buyPerk('${p.id}')" ${btnDisabled} class="px-3 py-1.5 ${btnClass} font-extrabold text-xs rounded transition whitespace-nowrap">
                    ${btnLabel}
                </button>
            </div>
        `;
    }).join('');
}

function buyPerk(id) {
    if (state.ownedPerks.includes(id)) return;
    const perk = PERK_CATALOG.find(p => p.id === id);
    if (!perk) return;
    if (state.degenLevel < perk.requiredLevel) { showToast(`Reach Degen Level ${perk.requiredLevel} first!`); return; }
    if (state.cash < perk.cost) { showToast("Insufficient asset clearings!"); return; }

    state.cash -= perk.cost;
    state.ownedPerks.push(id);
    playSound('buy');
    showToast(`🛒 Upgrade acquired: ${perk.name}`, "success");
    updateUI();
}

// RENAMED from renderLeaderboard(). These are classic scripts sharing one
// global scope, and js/web3.js defines a DIFFERENT renderLeaderboard() (the
// cloud leaderboard) and loads later - so it silently won. Two things broke:
// this Victim Hall of Fame never rendered at all, and updateUI()'s call to
// renderLeaderboard() fired a Supabase query on EVERY ui refresh (dozens per
// session) instead of doing this cheap local render.
//
// PERFORMANCE: this used to rebuild the entire list as innerHTML on every
// single call, and updateUI() calls it constantly (~47 call sites plus the
// main setInterval loop). Tearing down and recreating every row several
// times a second is pure waste, because the list only actually changes
// when a rug gets pulled or a save loads.
//
// The signature below is what makes skipping safe. It is deliberately NOT
// just the array length: unshift() puts the newest rug at index 0, so
// including the head entry means a change is caught even in the (contrived)
// case where one is added and one trimmed in the same tick. `_victimLbEl` is
// checked too, so if anything ever swaps the container element out - a
// theme switch, a re-render of the panel - the next call rebuilds instead
// of trusting a signature that describes a DOM node no longer on the page.
let _victimLbSig = null;
let _victimLbEl = null;

function renderVictimLeaderboard() {
    const container = document.getElementById('victimLeaderboard');
    if (!container) return;

    const head = state.victimLeaderboard[0];
    const sig = state.victimLeaderboard.length + '|' + (head ? head.name + ' ' + head.ticker + ' ' + head.cash : '');
    if (container === _victimLbEl && sig === _victimLbSig) return; // nothing changed - leave the DOM alone
    _victimLbEl = container;
    _victimLbSig = sig;

    if (state.victimLeaderboard.length === 0) {
        container.innerHTML = `<div class="text-gray-500 italic text-[11px]">No rugs pulled yet. Get to work.</div>`;
        return;
    }

    container.innerHTML = state.victimLeaderboard.map((l, idx) => `
        <div class="flex justify-between items-center text-[11px] border-b border-[#1A2232] py-1 text-gray-400">
            <span>#${idx + 1} <strong class="text-white">${escapeHtml(l.name)} (${escapeHtml(l.ticker)})</strong></span>
            <span class="text-rose-400 font-mono">+$${l.cash.toLocaleString('en-US', { maximumFractionDigits: 0 })} (<span class="text-gray-500">${l.suckers} victims</span>)</span>
        </div>
    `).join('');
}
