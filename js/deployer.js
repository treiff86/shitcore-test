/* ============================================================
   TOKEN DEPLOYER ENGINE & COMMUNITY LOOPS
   ============================================================
   What's in this version:
   - Fixed: dragging the Toxicity Tax slider now live-updates
     the % readout (and the active deployment's rate)
   - DRAINED on deploy: 0.01% chance the act of deploying itself
     wipes your wallet to $0
   - Manual Marketing is now 90/10: 90% it just works, 10% the
     "influencer" takes your $50 AND hacks 10%-50% of what's left
   - QUANTUM AUDIT: a rare instant-seizure event (separate from
     the normal slow Audit Threat climb) that maxes the meter
     and forfeits the deployment on the spot
   - 4-tier Marketing Campaign system (Lvl 2+ unlocks 2, Lvl 4+
     unlocks 2 more). Each campaign PERMANENTLY speeds up both
     capital inflow and Audit Threat growth for that deployment.
     Effects stack freely if you run more than one.
   - Binance Pump & Dump easter egg: deploying under a custom
     (non-default) token name has a 1% shot at a $10,000 windfall
   - Bigger, more varied Degen Chat Feed flavor text throughout
   ============================================================ */

let deployerInterval = null;

/* ---- tunable odds, all easy to find in one place ---- */
const DEPLOY_DRAIN_CHANCE = 0.0001;      // 0.01% — rolled once, on launch
const SHILL_SCAM_CHANCE = 0.10;           // 10% — rolled each manual shill
const QUANTUM_AUDIT_CHANCE = 0.0005;      // 0.05% per second of live deployment
const DEFAULT_TOKEN_NAME = 'Golden Toilet Elon';
const BINANCE_PUMP_CHANCE = 0.01;         // 1% — rolled on deploy, only if name was changed
const BINANCE_PUMP_BONUS = 10000;

/* ---- Marketing Campaigns ----
   capitalSpeedBoost / auditSpeedBoost are PERMANENT, STACKING
   multipliers added to the deployment's ongoing rates the
   moment you run the campaign (not a one-time lump sum). Run
   the same or different campaigns again and they keep stacking. */
const CAMPAIGNS = [
    { id: 'press', name: '📋 Fake Press Release', minLevel: 2, cost: 150, capitalSpeedBoost: 0.25, auditSpeedBoost: 0.15 },
    { id: 'airdrop', name: '🐶 Sketchy Influencer Airdrop', minLevel: 2, cost: 400, capitalSpeedBoost: 0.50, auditSpeedBoost: 0.30 },
    { id: 'raid', name: '🎙️ Coordinated Twitter Raid', minLevel: 4, cost: 900, capitalSpeedBoost: 0.85, auditSpeedBoost: 0.45 },
    { id: 'tv', name: '📺 Bought a Crypto TV Segment', minLevel: 4, cost: 1800, capitalSpeedBoost: 1.30, auditSpeedBoost: 0.60 },
];

/* ---- flavor text pools ---- */

const LAUNCH_LINES = [
    "[Dev] Contract deployed. Generating TG hype channel groups...",
    "[Dev] Bytecode live. Recruiting bots to simulate organic growth...",
    "[Dev] Liquidity seeded. Whitepaper still loading (it's one paragraph)...",
    "[Dev] Token minted. Legal team (a Fiverr freelancer) says we're fine.",
    "[Dev] Deployment successful. Roadmap pending — probably just emojis.",
];

const AMBIENT_CHAT_LINES = [
    "Is this safe?", "Dev doxed?", "Gonna fly 100x!", "Rug imminent?", "Bought the dip!", "LFG!!!",
    "My wife's boyfriend told me to buy this.", "Just sold my car for more bags.",
    "Chart looks like a staircase to heaven.", "Dev said 'trust me' and I believed him.",
    "Is the liquidity locked or is that a joke too?", "Whale just bought, WAGMI!",
    "This is literally the next Bitcoin (it is not).", "Telegram mod muted me for asking questions. Bullish.",
    "I have a good feeling about this one (I always say that).", "Just refinanced my house. YOLO.",
    "Someone said the dev's wallet moved. Probably nothing.", "Diamond hands until the FBI gets here.",
    "Audit report says 9/10. Suspiciously specific number.", "If this rugs I'm legally changing my name.",
];

const SUSPICIOUS_CHAT_LINES = [
    "Wait, why isn't the sell button working...", "Dev hasn't replied in 10 minutes, RED FLAG.",
    "The Telegram admin just left the group. Silently.", "Anyone else notice the contract owner address changed?",
    "Why does the liquidity pool keep shrinking??", "I'm starting to think 'trust me bro' wasn't an audit.",
    "Is it normal for the price chart to look like a cliff?", "The website just 404'd. Cool, cool, cool.",
];

const SHILL_SUCCESS_LINES = [
    "[SYSTEM] Influencer posted. 40,000 bots liked it within a second.",
    "[SYSTEM] TikTok influencer called it 'the future of finance' between ad reads for protein powder.",
    "[SYSTEM] Sponsored post live. Engagement is 90% bots, 10% regret.",
    "[SYSTEM] Influencer's caption says 'NOT SPONSORED' (it was extremely sponsored). Hype rising.",
];

const SHILL_SCAM_LINES = [
    (pct, amt) => `[SYSTEM] The "influencer" took your $50, deleted his TikTok, and hacked ${pct}% of your wallet ($${amt}) on the way out.`,
    (pct, amt) => `[SYSTEM] Turns out @ToiletAlpha was three guys in a trench coat. They grabbed the $50, drained ${pct}% of your wallet ($${amt}), and vanished.`,
    (pct, amt) => `[SYSTEM] Your influencer's "marketing agency" was a Discord server with one member. He's gone — and so is ${pct}% of your wallet ($${amt}).`,
    (pct, amt) => `[SYSTEM] The influencer's manager (his mom) confirms he's "off the grid now." Also, your wallet is down ${pct}% ($${amt}).`,
];

const QUANTUM_AUDIT_LINES = [
    (ticker) => `🌀 QUANTUM AUDIT! A regulator from a parallel timeline audited $${ticker} before the ink on the contract dried. Everything riding on it is gone.`,
    (ticker) => `🌀 QUANTUM AUDIT! Schrödinger's compliance officer collapsed the waveform on $${ticker} — turns out it was illegal the whole time.`,
    (ticker) => `🌀 QUANTUM AUDIT! The audit happened yesterday, tomorrow, and right now, simultaneously. $${ticker} didn't stand a chance.`,
];

const DEPLOY_DRAINED_LINES = [
    "☠️ DRAINED! The instant you hit deploy, an unknown exploit swept every dollar out of your wallet. Starting over from $0.",
    "☠️ DRAINED! Congratulations — you found the one contract that rugs its own deployer. Wallet: $0.",
];

const CAMPAIGN_CHAT_LINES = [
    (name) => `[MARKETING] ${name} is live. Both the hype and the heat just got a permanent turbo boost.`,
    (name) => `[MARKETING] ${name} launched. Money's coming in faster now — so is regulatory attention.`,
    (name) => `[MARKETING] ${name} dropped. Bots are typing "🚀🚀🚀" in unison while a compliance officer Googles your contract address.`,
];

/* ---- small helpers ---- */

function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function pushChatLine(html) {
    const feed = document.getElementById('chatFeed');
    if (!feed) return;
    feed.innerHTML += `<div>${html}</div>`;
    feed.scrollTop = feed.scrollHeight;
}

function maybePushAmbientChat(t) {
    if (Math.random() >= 0.4) return;
    const pool = (t.auditThreat > 50 && Math.random() < 0.5) ? SUSPICIOUS_CHAT_LINES : AMBIENT_CHAT_LINES;
    const line = randomFrom(pool);
    pushChatLine(`<span class="text-amber-500">Anon_${Math.floor(Math.random() * 9000)}:</span> ${line}`);
}

/** Reads the player's Degen Level from state.js's degenLevel field. Falls back to 1 if missing. */
function getPlayerLevel() {
    return state.degenLevel || 1;
}

/** Offshore Cayman Layering Loop perk: heat-generating events produce ~50% less Heat. */
function applyCaymanDiscount(heatGain) {
    return state.ownedPerks.includes('cayman_vault') ? heatGain * 0.5 : heatGain;
}

/** Shared seizure handling for both the normal Audit Threat climb and Quantum Audit. */
function seizeContract(t, message) {
    clearInterval(deployerInterval);
    state.globalHeat = Math.min(100, state.globalHeat + applyCaymanDiscount(25));
    playSound('liquidated');
    showAlertModal(message);
    state.activeToken = null;

    if (state.globalHeat >= 100) {
        triggerLossGameOver();
    }
}

let lastRenderedCampaignSignature = null;

/** Keeps the campaign <select> in sync with the player's level AND the
 *  Coordination Network discount, without fighting their current
 *  selection — only rewrites it when something relevant actually changed. */
function populateCampaignSelect() {
    const select = document.getElementById('campaignSelect');
    if (!select) return;

    const lvl = getPlayerLevel();
    const available = CAMPAIGNS.filter(c => lvl >= c.minLevel);
    const discount = state.ownedPerks.includes('shill_army') ? 0.75 : 1;

    if (available.length === 0) {
        if (lastRenderedCampaignSignature !== 'locked') {
            select.innerHTML = `<option value="">Reach Level 2 to unlock campaigns</option>`;
            select.disabled = true;
            lastRenderedCampaignSignature = 'locked';
        }
        return;
    }

    const signature = `${available.map(c => c.id).join(',')}|${discount}`;
    if (lastRenderedCampaignSignature !== signature) {
        const previousValue = select.value;
        select.disabled = false;
        select.innerHTML = available.map(c => `<option value="${c.id}">${c.name} ($${Math.round(c.cost * discount).toLocaleString()})</option>`).join('');
        if (available.some(c => c.id === previousValue)) select.value = previousValue;
        lastRenderedCampaignSignature = signature;
    }
}

/* ---- Toxicity Tax slider wiring (this was missing — the original bug) ---- */

document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('toxicityTaxSlider');
    if (slider) {
        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10) || 0;
            const label = document.getElementById('toxicityTaxVal');
            if (label) label.innerText = `${val}%`;
            // Live deployments can have their tax rate adjusted on the fly
            if (state.activeToken) state.activeToken.toxicity = val;
        });
    }
    populateCampaignSelect();
});

/* ============================================================
   CORE LOOP
   ============================================================ */

function updateDeployerUI() {
    populateCampaignSelect();

    const placeholder = document.getElementById('deployerPlaceholder');
    const active = state.activeToken;

    if (!active) {
        placeholder.classList.remove('hidden');
        document.getElementById('pullRugBtn').disabled = true;
        document.getElementById('pullRugBtn').className = "w-full py-3 bg-gradient-to-r from-red-600 to-rose-700 text-white font-extrabold rounded-lg text-xs shadow-lg uppercase opacity-40 cursor-not-allowed";
        return;
    }

    placeholder.classList.add('hidden');
    document.getElementById('monitorTokenName').innerText = active.name;
    document.getElementById('monitorTokenTicker').innerText = `$${active.ticker}`;
    document.getElementById('monitorStatus').innerText = active.auditThreat >= 100 ? "UNDER INVESTIGATION" : "LIVE ACCUMULATION";

    document.getElementById('monitorRaised').innerText = `$${active.raised.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    document.getElementById('monitorSuckers').innerText = Math.floor(active.suckers).toLocaleString();
    document.getElementById('monitorPrice').innerText = `$${active.price.toFixed(6)}`;
    document.getElementById('monitorHoneypot').innerText = active.honeypot ? "ON (BACKDOOR BLOCKED)" : "OFF";
    document.getElementById('monitorHoneypot').className = active.honeypot ? "text-rose-500 font-bold text-sm font-mono" : "text-gray-500 font-bold text-sm font-mono";

    document.getElementById('hypePct').innerText = `${Math.floor(active.hype)}%`;
    document.getElementById('hypeBar').style.width = `${Math.floor(active.hype)}%`;

    document.getElementById('auditThreatPct').innerText = `${Math.floor(active.auditThreat)}%`;
    document.getElementById('auditThreatBar').style.width = `${Math.floor(active.auditThreat)}%`;

    document.getElementById('pullRugBtn').disabled = false;
    document.getElementById('pullRugBtn').className = "w-full py-3 bg-gradient-to-r from-red-600 to-rose-700 text-white font-extrabold rounded-lg text-xs shadow-lg uppercase hover:from-red-500 hover:to-rose-600 cursor-pointer transition";
}

function launchToken() {
    if (state.activeToken) {
        showToast("You already have an active deployment draining funds!", "error");
        return;
    }

    // Rare catastrophic event: the act of deploying can itself get you drained
    if (Math.random() < DEPLOY_DRAIN_CHANCE) {
        triggerDeployDrainEvent();
        return;
    }

    const tokenName = (document.getElementById('deployName').value || "ScamCoin").trim();

    // Easter egg: deploying under a custom (non-default) name has a tiny shot at a windfall
    if (tokenName !== DEFAULT_TOKEN_NAME && Math.random() < BINANCE_PUMP_CHANCE) {
        triggerBinancePumpBonus();
    }

    const cost = parseFloat(document.getElementById('deployLiquidity').value) || 200;
    if (state.cash < cost) {
        showToast("Insufficient cash reserves to seed structural liquidity!", "error");
        return;
    }

    state.cash -= cost;
    playSound('launch');

    state.activeToken = {
        name: tokenName || "ScamCoin",
        ticker: (document.getElementById('deployTicker').value || "SCAM").toUpperCase(),
        liquidity: cost,
        raised: 0,
        suckers: 0,
        price: 0.0001,
        toxicity: parseInt(document.getElementById('toxicityTaxSlider').value) || 10,
        hype: 30,
        auditThreat: 0,
        honeypot: document.getElementById('honeypotToggle') ? document.getElementById('honeypotToggle').checked : false,
        // Permanent, stacking multipliers built up by running Marketing Campaigns
        campaignCapitalMult: 1,
        campaignAuditMult: 1
    };

    document.getElementById('chatFeed').innerHTML = `<div class="text-green-400">${randomFrom(LAUNCH_LINES)}</div>`;

    if (deployerInterval) clearInterval(deployerInterval);
    deployerInterval = setInterval(processTokenLifecycle, 1000);

    showToast("🚀 Toxic deployment live on-chain!", "success");
    updateUI();
}

function triggerDeployDrainEvent() {
    state.cash = 0;
    playSound('liquidated');
    showAlertModal(randomFrom(DEPLOY_DRAINED_LINES));
    showToast("☠️ DRAINED! Your wallet got wiped the instant you hit deploy.", "error");
    updateUI();
}

function triggerBinancePumpBonus() {
    state.cash += BINANCE_PUMP_BONUS;
    state.lifetimeEarned += BINANCE_PUMP_BONUS;
    playSound('lambo');
    showAlertModal(`🚀 BINANCE PUMP & DUMP! Your custom-named token briefly caught a real exchange listing bot's attention. +$${BINANCE_PUMP_BONUS.toLocaleString()} toward your Lambo goal before anyone noticed the mistake.`);
    showToast(`🚀 JACKPOT! +$${BINANCE_PUMP_BONUS.toLocaleString()} from a freak listing glitch.`, "success");
}

function processTokenLifecycle() {
    const t = state.activeToken;
    if (!t) return;

    // QUANTUM AUDIT: vanishingly rare instant seizure, independent of the normal threat climb
    if (Math.random() < QUANTUM_AUDIT_CHANCE) {
        t.auditThreat = 100;
        updateDeployerUI();
        seizeContract(t, randomFrom(QUANTUM_AUDIT_LINES)(t.ticker));
        updateUI();
        return;
    }

    // Upgrades modifiers
    let botOwned = state.ownedPerks.includes('tg_bot');
    let influencerOwned = state.ownedPerks.includes('shill_army');

    let hypeDecay = 2.5;
    if (botOwned) hypeDecay -= 1.0; // -40% decay
    t.hype = Math.max(0, t.hype - hypeDecay);
    if (botOwned) t.hype = Math.min(100, t.hype + 1); // passive +1%/sec generation on top

    // Inflow calculation engine logic
    let entryRate = (t.hype / 10) * (1 + (t.liquidity / 1000));
    if (influencerOwned) entryRate *= 1.40;
    entryRate *= (t.campaignCapitalMult || 1); // Marketing Campaigns permanently speed this up

    let newSuckers = Math.random() * entryRate;

    // Coordination Network: extra "reach" inflates the tracked victim count
    // without proportionally inflating cash — cash stays keyed off newSuckers.
    let trackedSuckers = newSuckers;
    if (influencerOwned) trackedSuckers *= 1.5;
    t.suckers += trackedSuckers;

    let fundsInflow = newSuckers * (Math.random() * 45 + 5);
    t.raised += fundsInflow;
    t.price = 0.0001 * (1 + (t.raised / t.liquidity));

    // Audit Accumulation Calculation Matrix
    let threatGrowth = (t.toxicity * 0.12) + 1.2;
    if (t.honeypot) threatGrowth *= 2.0;
    threatGrowth *= (t.campaignAuditMult || 1); // Marketing Campaigns permanently speed this up too
    t.auditThreat += threatGrowth;

    // Feed varied, dynamic context statements to the chat panel
    maybePushAmbientChat(t);

    // Checking legal systemic compliance barriers
    if (t.auditThreat >= 100) {
        seizeContract(t, `🚨 CONTRACT SEIZED! The authorities audited $${t.ticker}. Your pool liquidity and raised assets were frozen instantly.`);
    }
    updateUI();
}

function manualShill() {
    if (!state.activeToken) {
        showToast("Deploy a token first.", "error");
        return;
    }
    if (state.cash < 50) {
        showToast("Not enough cash for promotion campaigns!", "error");
        return;
    }

    state.cash -= 50;

    if (Math.random() < SHILL_SCAM_CHANCE) {
        const hackPct = 0.10 + Math.random() * 0.40; // 10%-50% of whatever's left after the $50
        const hacked = state.cash * hackPct;
        state.cash = Math.max(0, state.cash - hacked);
        const pctLabel = Math.round(hackPct * 100);

        playSound('rug');
        showToast(`😱 SCAMMED! Lost the $50 fee + ${pctLabel}% of your wallet ($${hacked.toFixed(2)}).`, "error");
        pushChatLine(`<span class="text-rose-500 font-bold">${randomFrom(SHILL_SCAM_LINES)(pctLabel, hacked.toFixed(2))}</span>`);
    } else {
        state.activeToken.hype = Math.min(100, state.activeToken.hype + 25);
        playSound('click');
        pushChatLine(`<span class="text-green-400">${randomFrom(SHILL_SUCCESS_LINES)}</span>`);
    }

    updateUI();
}

function runCampaign() {
    if (!state.activeToken) {
        showToast("Deploy a token first.", "error");
        return;
    }

    const select = document.getElementById('campaignSelect');
    const campaign = CAMPAIGNS.find(c => c.id === (select && select.value));
    if (!campaign) {
        showToast("Pick a campaign first.", "error");
        return;
    }
    if (getPlayerLevel() < campaign.minLevel) {
        showToast(`Reach Level ${campaign.minLevel} to run this campaign.`, "error");
        return;
    }
    const discount = state.ownedPerks.includes('shill_army') ? 0.75 : 1;
    const finalCost = Math.round(campaign.cost * discount);
    if (state.cash < finalCost) {
        showToast(`Not enough cash. Need $${finalCost.toLocaleString()}.`, "error");
        return;
    }

    state.cash -= finalCost;

    const t = state.activeToken;
    t.campaignCapitalMult = (t.campaignCapitalMult || 1) + campaign.capitalSpeedBoost;
    t.campaignAuditMult = (t.campaignAuditMult || 1) + campaign.auditSpeedBoost;

    playSound('buy');
    showToast(`${campaign.name} is live! Capital speed now ${t.campaignCapitalMult.toFixed(2)}x, Audit Threat speed now ${t.campaignAuditMult.toFixed(2)}x for this deployment.`, "success");
    pushChatLine(`<span class="text-indigo-400 font-bold">${randomFrom(CAMPAIGN_CHAT_LINES)(campaign.name)}</span>`);

    updateUI();
}

function toggleHoneypot() {
    if (state.activeToken) {
        state.activeToken.honeypot = document.getElementById('honeypotToggle').checked;
    }
}

function pullTheRug() {
    const t = state.activeToken;
    if (!t) return;

    clearInterval(deployerInterval);
    playSound('rug');

    let stolenCash = t.raised * (t.toxicity / 100) + t.liquidity;
    if (t.honeypot) stolenCash = t.raised + t.liquidity; // Take it all

    state.cash += stolenCash;
    state.lifetimeEarned += stolenCash;

    // Record entry to leaderboard
    state.victimLeaderboard.unshift({
        name: t.name, ticker: t.ticker, cash: stolenCash, suckers: Math.floor(t.suckers)
    });

    state.globalHeat = Math.min(100, state.globalHeat + applyCaymanDiscount(Math.floor(t.toxicity / 4)));
    state.activeToken = null;

    showToast(`💀 RUG PULLED! Siphoned +$${stolenCash.toLocaleString('en-US', { maximumFractionDigits: 2 })} into private wallets.`, "success");
    checkProgressions();
    updateUI();

    if (state.globalHeat >= 100) {
        triggerLossGameOver();
    }
}

function triggerLossGameOver() {
    document.getElementById('lossModal').classList.remove('hidden');
    document.getElementById('lossMessage').innerText = "Regulatory Heat maxed out at 100%. Tax compliance enforcement raids seized your account assets.";
    playSound('liquidated');
}
