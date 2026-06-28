/* ============================================================
   PROCEDURAL SOLIDITY ROASTER ENGINE
   ============================================================
   New in this version:
   - Real anti-spam gate: 50+ chars AND 10+ distinct characters
     AND no single character over 40% of the input. Mashing one
     key (or alternating two) no longer passes.
   - 1% chance per compile: liquidity flips to "100% UNLOCKED"
     and a DRAIN button appears, granting $1,000-$10,000. Never
     rolls on an unedited built-in .sol template.
   - 0.01% chance per compile: total wallet DRAINED, start over
     (same severity tier as the other mini-games).
   - Every legitimate compile (not the catastrophic drain) chips
     a random 4-10% off Regulatory Heat — the only way to bring
     Heat back down in this build. That's no longer risk-free:
     10% chance it docks 10% of your wallet, 0.01% chance it
     docks 35%. Short cooldown on the Compile button so this
     can't be macro'd into a free Heat reset.
   - Bigger, more varied badge / signature / liquidity / verdict
     / line-roast pools for a much less repetitive feel.
   ============================================================ */

const TEMPLATES = {
    safemoon: `contract SafePlunge {\n    mapping(address => uint) public balances;\n    uint256 public constant reflectionTax = 99;\n    // TODO: Renounce ownership tomorrow maybe`,
    infinite: `contract LamboSqueeze {\n    function mintInfinitum(address target) public {\n        // Open backdoor entry for marketing funds\n        balances[target] += 100000000000000000;\n    }\n}`,
    gigapump: `contract GigaPumpPresale {\n    address payable owner;\n    fallback() external payable {\n        // Forward directly to dev's cold wallet\n        owner.transfer(msg.value);\n    }\n}`,
    taxrug: `contract TaxRugBooster {\n    // Extract liquidity dynamically on transfer\n    function transfer(address to, uint val) public {\n        _balances[msg.sender] -= val;\n        _balances[owner] += val;\n    }\n}`
};

/* ---- tunable knobs, all in one place ---- */
const MIN_LENGTH = 50;
const MIN_UNIQUE_CHARS = 10;
const MAX_CHAR_FREQUENCY = 0.4;            // no single character may exceed 40% of the input
const AUDIT_DRAIN_JACKPOT_CHANCE = 0.01;   // 1%
const AUDIT_FULL_DRAIN_CHANCE = 0.0001;    // 0.01%
const JACKPOT_DRAIN_MIN = 1000;
const JACKPOT_DRAIN_MAX = 10000;
const HEAT_REDUCTION_MIN = 4;
const HEAT_REDUCTION_MAX = 10;
const COMPILE_COOLDOWN_MS = 3000;
const EARNINGS_PENALTY_SEVERE_CHANCE = 0.0001; // 0.01% — docks 35%
const EARNINGS_PENALTY_SEVERE_PCT = 0.35;
const EARNINGS_PENALTY_MINOR_CHANCE = 0.10;    // 10% — docks 10%
const EARNINGS_PENALTY_MINOR_PCT = 0.10;

let compileOnCooldown = false;

/* ---- flavor pools ---- */

const BADGE_POOL = [
    'CRITICAL DEGEN OVERLOAD', 'TOTAL BYTECODE BIOHAZARD', 'CONFIRMED HONEYPOT ARCHITECTURE',
    'DEV EXIT IMMINENT', 'RUG VELOCITY: MAXIMUM', 'LIQUIDITY BLACK HOLE DETECTED',
    'AUDIT FAILURE CASCADE', 'TOXIC WASTE CONTRACT',
];

const SIGNATURE_POOL = [
    'HONEYPOT_READY', 'BACKDOOR_DETECTED', 'OWNER_GOD_MODE', 'INFINITE_MINT_LOOP',
    'SELL_FUNCTION_MISSING', 'TAX_OVERRIDE_ENABLED', 'BLACKLIST_FUNCTION_FOUND', 'PROXY_UPGRADE_TRAP',
];

const LOCKED_LIQUIDITY_POOL = [
    '0% LOCKED', '2% LOCKED (JOKE LOCK)', '0.4% LOCKED (EXPIRES IN 6 MIN)', '1% LOCKED (DEV-CONTROLLED)',
];

const VERDICT_POOL = [
    "This code looks like it was written by a toddler tracking numbers on a wet napkin.",
    "Our compiler wept, then filed a restraining order against the deployer.",
    "We've seen better security in a gas station bathroom lock.",
    "The contract owner has more control over your funds than you do. Functionally, it's a leash.",
    "This isn't a smart contract, it's a confession written in Solidity.",
    "We ran this through three audit firms. All three quit the industry afterward.",
    "There's a 'TODO: fix this later' comment directly above the mint function. Later never came.",
    "Whoever wrote this owes the EVM a formal apology.",
    "This contract has the structural integrity of a paper boat in a hurricane.",
    "We're not saying it's a scam. We're saying it scored 100% on every scam metric we own.",
];

const LINE_ROAST_POOL = [
    "Hardcoded developer wallet addresses detected. Absolute dynamic disaster incoming.",
    "Overflow configurations are completely unbound. Math constraints do not exist here.",
    "High probability of instantaneous geographical disappearance of founder post-launch.",
    "Owner-only function found with the comment '// for emergencies (always emergencies)'.",
    "Transfer function silently skips the sender's balance check. Bold choice.",
    "This modifier exists purely to make 'onlyOwner' sound official. It is not official.",
    "Detected a hidden mint call disguised as a 'reward distribution' mechanism.",
    "Liquidity removal function requires zero confirmations and zero shame.",
    "Variable names suggest the deployer was renaming things as they typed, in real time, panicking.",
    "This contract imports a library that was deleted from existence in 2019.",
];

/* ---- small helpers ---- */

function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
    const pool = [...arr];
    const picks = [];
    for (let i = 0; i < n && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        picks.push(pool.splice(idx, 1)[0]);
    }
    return picks;
}

function isExactTemplateMatch(rawCode) {
    return Object.values(TEMPLATES).some(t => t === rawCode);
}

/** Returns an error string if the input fails the anti-spam gate, or null if it's valid. */
function validateAuditInput(rawCode) {
    const trimmed = rawCode.trim();
    if (trimmed.length < MIN_LENGTH) {
        return `Paste at least ${MIN_LENGTH} characters before compiling.`;
    }

    const freq = {};
    for (const ch of trimmed) freq[ch] = (freq[ch] || 0) + 1;
    const uniqueCount = Object.keys(freq).length;
    const maxCount = Math.max(...Object.values(freq));

    if (uniqueCount < MIN_UNIQUE_CHARS) {
        return `Too repetitive — needs at least ${MIN_UNIQUE_CHARS} different characters, not one key mashed over and over.`;
    }
    if (maxCount / trimmed.length > MAX_CHAR_FREQUENCY) {
        return `Too repetitive — no single character can make up more than ${Math.round(MAX_CHAR_FREQUENCY * 100)}% of the input.`;
    }
    return null;
}

function loadTemplate(key) {
    if (TEMPLATES[key]) {
        document.getElementById('contractInput').value = TEMPLATES[key];
        playSound('click');
    }
}

/* ---- main entry point ---- */

function auditContract() {
    if (compileOnCooldown) return;

    const rawCode = document.getElementById('contractInput').value;
    const validationError = validateAuditInput(rawCode);
    if (validationError) {
        showToast(validationError, "error");
        return;
    }

    playSound('click');
    const isTemplate = isExactTemplateMatch(rawCode);

    const container = document.getElementById('auditResults');
    container.classList.remove('hidden');
    removeDrainButton();

    // 0.01% — total wallet wipe, same severity tier as the other mini-games
    if (Math.random() < AUDIT_FULL_DRAIN_CHANCE) {
        triggerAuditorFullDrain();
        startCompileCooldown();
        return;
    }

    // Every legitimate compile chips away at Regulatory Heat
    reduceRegulatoryHeat();

    const riskScore = Math.floor(Math.random() * 30) + 70;
    const badge = document.getElementById('auditSafetyBadge');
    badge.innerText = `${randomFrom(BADGE_POOL)} (${riskScore}% DANGER)`;
    badge.className = "px-2.5 py-1 text-[11px] rounded-full font-bold bg-rose-500/20 text-rose-400";

    document.getElementById('auditProb').innerText = `${riskScore}%`;
    document.getElementById('auditProb').className = "text-xl font-bold text-rose-500";
    document.getElementById('auditDevSentiment').innerText = randomFrom(SIGNATURE_POOL);

    const liqStatusEl = document.getElementById('auditLiqStatus');

    // 1% jackpot — only possible on input that isn't an unedited template
    if (!isTemplate && Math.random() < AUDIT_DRAIN_JACKPOT_CHANCE) {
        liqStatusEl.innerText = "100% UNLOCKED";
        liqStatusEl.className = "text-xl font-bold text-emerald-400";
        insertDrainButton();
    } else {
        liqStatusEl.innerText = randomFrom(LOCKED_LIQUIDITY_POOL);
        liqStatusEl.className = "text-xl font-bold text-rose-400";
    }

    document.getElementById('auditParagraph').innerText = randomFrom(VERDICT_POOL);

    const logs = document.getElementById('lineRoastLogs');
    logs.innerHTML = pickN(LINE_ROAST_POOL, 4)
        .map(r => `<div><i class="fa-solid fa-code text-rose-500 mr-1"></i> ${r}</div>`)
        .join('');

    startCompileCooldown();
}

function reduceRegulatoryHeat() {
    const reduction = HEAT_REDUCTION_MIN + Math.random() * (HEAT_REDUCTION_MAX - HEAT_REDUCTION_MIN);
    state.globalHeat = Math.max(0, state.globalHeat - reduction);

    const penaltyRoll = Math.random();
    if (penaltyRoll < EARNINGS_PENALTY_SEVERE_CHANCE) {
        applyEarningsPenalty(EARNINGS_PENALTY_SEVERE_PCT, reduction, 'SEVERE');
    } else if (penaltyRoll < EARNINGS_PENALTY_SEVERE_CHANCE + EARNINGS_PENALTY_MINOR_CHANCE) {
        applyEarningsPenalty(EARNINGS_PENALTY_MINOR_PCT, reduction, 'MINOR');
    } else {
        showToast(`✅ Audit complete. Regulatory Heat -${reduction.toFixed(1)}%.`, "success");
    }

    updateUI();
}

function applyEarningsPenalty(pct, heatReduction, severity) {
    const penalty = state.cash * pct;
    state.cash = Math.max(0, state.cash - penalty);
    playSound('alarm');
    showToast(`⚠️ ${severity} AUDIT BACKFIRE! Heat -${heatReduction.toFixed(1)}%, but it cost you $${penalty.toFixed(2)} (${Math.round(pct * 100)}% of your wallet) in "compliance fees."`, "error");
    if (typeof pushChainLog === 'function') {
        pushChainLog('AUDIT', `An "independent auditor" found something and billed ${Math.round(pct * 100)}% of someone's wallet for the privilege.`, 'text-amber-400');
    }
}

function insertDrainButton() {
    const liqStatusEl = document.getElementById('auditLiqStatus');
    const btn = document.createElement('button');
    btn.id = 'auditDrainBtn';
    btn.innerHTML = '💸 DRAIN';
    btn.className = "ml-2 text-[10px] font-bold uppercase px-2 py-1 rounded bg-emerald-500 text-black hover:bg-emerald-400 transition";
    btn.onclick = drainAuditLiquidity;
    liqStatusEl.insertAdjacentElement('afterend', btn);
}

function removeDrainButton() {
    const existing = document.getElementById('auditDrainBtn');
    if (existing) existing.remove();
}

function drainAuditLiquidity() {
    const amount = Math.floor(JACKPOT_DRAIN_MIN + Math.random() * (JACKPOT_DRAIN_MAX - JACKPOT_DRAIN_MIN));
    addCash(amount);
    playSound('rug');
    showToast(`💸 Drained $${amount.toLocaleString()} from unlocked liquidity!`, "success");

    const liqStatusEl = document.getElementById('auditLiqStatus');
    liqStatusEl.innerText = "100% UNLOCKED (DRAINED)";
    removeDrainButton();
}

function triggerAuditorFullDrain() {
    state.cash = 0;
    playSound('liquidated');
    showAlertModal("☠️ The contract you were auditing audited YOU back. Every dollar in your wallet is gone. Starting over from $0.");
    showToast("☠️ DRAINED! The audit tool got exploited.", "error");
    updateUI();
}

function startCompileCooldown() {
    compileOnCooldown = true;
    const btn = document.querySelector("button[onclick='auditContract()']");
    if (!btn) {
        setTimeout(() => { compileOnCooldown = false; }, COMPILE_COOLDOWN_MS);
        return;
    }

    const original = btn.innerHTML;
    let secondsLeft = Math.ceil(COMPILE_COOLDOWN_MS / 1000);
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    btn.innerText = `Recompiling in ${secondsLeft}s...`;

    const interval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
            clearInterval(interval);
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = original;
            compileOnCooldown = false;
        } else {
            btn.innerText = `Recompiling in ${secondsLeft}s...`;
        }
    }, 1000);
}
