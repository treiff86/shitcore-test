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
let lastCompiledCode = null;

/* ---- flavor pools ---- */

const BADGE_POOL = [
    'CRITICAL DEGEN OVERLOAD','TOTAL BYTECODE BIOHAZARD','CONFIRMED HONEYPOT ARCHITECTURE',
    'DEV EXIT IMMINENT','RUG VELOCITY: MAXIMUM','LIQUIDITY BLACK HOLE DETECTED',
    'AUDIT FAILURE CASCADE','TOXIC WASTE CONTRACT','CATASTROPHIC TRUST DEFICIT',
    'FULL EXIT TRAJECTORY CONFIRMED','MALICIOUS INTENT PROBABLE','SCAM FINGERPRINT DETECTED',
    'REGULATORY NIGHTMARE FUEL','ABSOLUTE DISASTER ARCHITECTURE','DEVELOPER FLIGHT RISK: SEVERE',
    'ZERO DAYS UNTIL RUG','PRINCIPAL LOSS IMMINENT','HONEY TRAP CONFIRMED',
    'EMERGENCY BAIL PROTOCOL ACTIVE','COMPLIANCE VIOLATION STACK OVERFLOW','TRUST SCORE: NULL',
    'FUNDS ALREADY LEAVING','ADVANCED DECEPTION LAYER DETECTED','FORENSIC RED FLAG CLUSTER',
    'CRIME COMMITTED IN SOLIDITY','FIVE-ALARM RUG WARNING','WALLET DRAINER BYTECODE MATCH',
    'PONZI ARCHITECTURE: VERIFIED','MULTISIG COMPROMISED BY DESIGN','SELL FUNCTION: THEORETICAL',
    'SYSTEMIC FRAUD VECTOR ACTIVE','EXIT LIQUIDITY MECHANISM DETECTED','OWNER WALLET: OFFSHORE',
    'CRITICAL VULNERABILITY STACK','AUDIT SCORE: NEGATIVE','BACKDOOR: HIGHWAY-SIZED',
    'TECHNICAL RUG IN PROGRESS','GOVERNANCE ATTACK VECTOR OPEN','FLASH LOAN EXPLOIT SURFACE',
    'CONTRACT HAZARD: LEVEL 10','DEPLOYER PACKING BAGS NOW','ANONYMOUS DEV: MAXIMUM CONCERN',
    'RUG PULL IN PROGRESS: DO NOT BUY','INFINITE MINT CATASTROPHE','SELL TAX: 100% PROBABLE',
    'LIQUIDITY: DECORATIVE ONLY','VESTING CLIFF: IMMEDIATELY','TREASURY: DEV PERSONAL WALLET',
    'TOKEN UTILITY: NONE DETECTED','WHITEPAPER: AI-GENERATED FICTION',
    'ROADMAP: SINGLE EMOJI ON A WHITE BACKGROUND','TEAM: STOCK PHOTOS AND VIBES',
    'TOKENOMICS: HEADS I WIN TAILS YOU LOSE','SECURITY MODEL: TRUST ME BRO',
    'DECENTRALIZATION: LOGO ONLY','COMMUNITY: BOTS AND BAGHOLDERS',
    'DUE DILIGENCE: NOT RECOMMENDED','FINANCIAL ADVICE: RUN',
];

const SIGNATURE_POOL = [
    'HONEYPOT_READY','BACKDOOR_DETECTED','OWNER_GOD_MODE','INFINITE_MINT_LOOP',
    'SELL_FUNCTION_MISSING','TAX_OVERRIDE_ENABLED','BLACKLIST_FUNCTION_FOUND','PROXY_UPGRADE_TRAP',
    'LP_DRAIN_PROBABLE','SELLS_BLOCKED_FUTURE','FEE_LEVEL_OVERRIDE','MEM_KEY_EXPOSURE',
    'RECURSIVE_MINT_LOOP','ADMIN_DRAIN_VECTOR','HIDDEN_OWNER_FUNCTION','FAKE_RENOUNCE_DETECTED',
    'SELFDESTRUCT_LURKING','EMERGENCY_WITHDRAW_ABUSE','ARBITRARY_CALL_ENABLED','PRICE_MANIPULATION_HOOK',
    'REENTRANCY_UNGUARDED','INTEGER_OVERFLOW_BAIT','DELEGATECALL_EXPLOIT_SURFACE','FLASH_LOAN_ATTACK_VECTOR',
    'TIMESTAMP_DEPENDENCE','TX_ORIGIN_AUTH_BYPASS','UNCHECKED_RETURN_VALUES','SIGNATURE_REPLAY_ATTACK',
    'FRONT_RUN_VULNERABILITY','CENTRALIZATION_SINGLE_POINT','PROXY_STORAGE_COLLISION','ORACLE_MANIPULATION_GATE',
    'UNPROTECTED_INITIALIZER','FORCED_ETHER_RECEPTION','DOS_WITH_BLOCK_GAS','GRIEFING_ATTACK_SURFACE',
    'WALLET_DRAINER_OPCODE','TOKEN_PRINTER_GOES_BRRR','BLACKHOLE_TRANSFER_HOOK','SILENT_OVERFLOW_ACTIVE',
    'GOVERNANCE_TAKEOVER_READY','MULTISIG_BYPASS_DETECTED','UPGRADE_KEY_UNPROTECTED','CREATOR_BACKDOOR_0x00',
    'OPAQUE_PROXY_ACTIVE','LOCKED_SELL_MODIFIER','VARIABLE_FEE_TO_INFINITY','OWNER_MINT_UNLIMITED',
    'SNAPSHOT_MANIPULATION','TRANSFER_HOOK_EXPLOIT','LIQUIDITY_REMOVAL_INSTANT','PAUSE_WITH_NO_UNPAUSE',
    'TREASURY_DRAIN_QUEUED','VESTING_BYPASS_FUNCTION','ALLOWANCE_DRAINER_ACTIVE','METADATA_REDIRECT_RUG',
    'FAKE_LP_LOCK_DETECTED','OWNER_WITHDRAW_ALL_FUNDS','EMERGENCY_PROTOCOL_ABUSE','YIELD_PRINTER_EXPLOIT',
    'UNCAPPED_FEE_MODIFIER','ZERO_ADDRESS_TRANSFER','DOUBLE_SPEND_PATHWAY','ANTIWHALE_HONEYPOT',
];

const LOCKED_LIQUIDITY_POOL = [
    '0% LOCKED','2% LOCKED (JOKE LOCK)','0.4% LOCKED (EXPIRES IN 6 MIN)','1% LOCKED (DEV-CONTROLLED)',
    '0% LOCKED (NEVER WAS)','5% LOCKED (DEV HOLDS THE KEY)','LIQUIDITY: LOL','0.001% LOCKED (ROUNDING ERROR)',
    '100% LOCKED (IN DEV WALLET)','LOCKED UNTIL NEXT TUESDAY','LOCK EXPIRED YESTERDAY',
    '"LOCKED" (UNVERIFIED CLAIM)','LIQUIDITY POOL: THEORETICAL','LP TOKENS: IN DEPLOYER WALLET',
    'LOCKED BY HONOR SYSTEM ONLY','0% — DEV SAYS "TRUST ME"','LIQUIDITY: AESTHETIC ONLY',
    'LOCKED (KEY LOST, CONVENIENTLY)','TIMELOCK: 1 SECOND','LOCK CONTRACT: UNAUDITED',
    'LOCKED BUT DEV IS SOLE SIGNER','MULTI-SIG LOCK (2/2 DEV WALLETS)','LIQUIDITY: PRESENT BUT SCARED',
    'LOCKED FOR "INDEFINITE PERIOD"','0.0% LOCKED (POST-RUG READING)','LP BURNED (TO DEV WALLET)',
    'LOCKED VIA TELEGRAM PROMISE','LIQUIDITY: DRAINING AS YOU READ THIS','LOCK STATUS: VIBE CHECK ONLY',
    '3% LOCKED (97% DEV RUNWAY)','LOCK EXPIRES ON LAUNCH DAY','LIQUIDITY BOOTSTRAPPED FROM COMMUNITY, RETURNED TO DEV',
    'NO LOCK NEEDED (DEV IS BASED)','LOCKED USING HOMEMADE TIMELOCK CONTRACT (UNVERIFIED)',
    'LIQUIDITY: $4.20','LP: WILL LOCK "SOON"','LOCK: SCREENSHOT AVAILABLE ON REQUEST',
    'LIQUIDITY LOCKED FOR 48 HOURS TOTAL','PARTIALLY LOCKED (GUESS WHICH PART)',
    'LOCKED (CONDITIONS APPLY, SEE DISCORD)','LIQUIDITY LOCKED BY VIBES AND COMMUNITY TRUST',
    '0% — RUG ALREADY EXECUTED','0% LOCKED (HONEST BADGE EDITION)','LOCKED BEHIND MULTISIG (1 OF 1)',
    'LOCK: CEO IS HOLDING IT PERSONALLY','LP TOKENS: VESTING TO DEV IN T-3 DAYS',
    'LOCKED UNTIL THEY ARE NOT','LIQUIDITY: ENOUGH TO FOOL A SCREENSHOT','LOCK: LEGALLY SPEAKING, NO',
    '100% UNLOCKED (CONGRATS, YOU FOUND IT)',
];

const VERDICT_POOL = [
    "This code looks like it was written by a toddler tracking numbers on a wet napkin.",
    "Our compiler wept, then filed a restraining order against the deployer.",
    "We've seen better security in a gas station bathroom lock.",
    "The contract owner has more control over your funds than you do. Functionally, it's a leash.",
    "This isn't a smart contract, it's a confession written in Solidity.",
    "We ran this through three audit firms. All three quit the industry afterward.",
    "There's a TODO: fix this later comment directly above the mint function. Later never came.",
    "Whoever wrote this owes the EVM a formal apology.",
    "This contract has the structural integrity of a paper boat in a hurricane.",
    "We're not saying it's a scam. We're saying it scored 100% on every scam metric we own.",
    "The developer's last commit message was 'ok this should be fine probably.' It is not fine.",
    "This contract would fail a security audit conducted by a golden retriever.",
    "We've analyzed 40,000 contracts. This one is the reason we started drinking.",
    "The only thing audited here was the deployer's escape route.",
    "Our static analyzer flagged 47 issues. We stopped counting at 47.",
    "This is less a smart contract and more a carefully written heist plan.",
    "The owner function is accessible, unlocked, and pointed directly at your wallet.",
    "We ran the bytecode through our AI model. The AI requested a mental health day afterward.",
    "This contract has more hidden functions than a spy novel.",
    "The liquidity lock lasts until the dev gets bored, whichever comes first.",
    "Three separate vulnerabilities in this contract were named after famous heists. Intentional.",
    "Our audit tool returned a single result: 'why would you do this.'",
    "This codebase was apparently peer-reviewed by the dev's second anonymous wallet.",
    "Every best practice in smart contract security was violated here, some of them twice.",
    "This contract is what happens when someone reads the Solidity docs once and decides they're done.",
    "The security model here is based entirely on the assumption that nobody will look at the code.",
    "We found a comment that says 'this is temporary.' The contract has been deployed for 8 months.",
    "Calling this a smart contract is generous. Calling it a trap is more accurate.",
    "Our senior auditor described this as 'the most committed financial crime in bytecode form I have ever seen.'",
    "This contract will drain your wallet the same way a magician drains attention: confidently and without explanation.",
    "The only thing missing from this rug is a cartoon villain twirling their mustache.",
    "This code has the transparency of a brick wall and the security of a Post-it note.",
    "We've seen less alarming code in actual ransomware samples.",
    "The audit badge on this project's website was self-issued. Via a Canva template.",
    "This contract's safety features are: none. Its danger features are: all of them.",
    "If this contract were a physical object, it would be a bear trap painted to look like a welcome mat.",
    "Our auditor noted that the withdraw function and the steal function appear to be the same function.",
    "This is not a DeFi protocol. This is a wallet extraction service with a roadmap.",
    "The contract owner can change the tax rate to 100% in a single transaction. They know this.",
    "The only thing secure about this contract is the dev's ability to exit it.",
    "We found a function called emergencyWithdraw. It does not appear to be for emergencies.",
    "This code was written in a hurry. The question is: a hurry to do what, exactly.",
    "The contract passed our automated checks in the same way a driver passes a sobriety test by not stopping.",
    "An audit of this contract reveals two things: ambition, and a complete absence of ethics.",
    "This is the smart contract equivalent of leaving your front door open and a note that says 'back in 5 mins.'",
    "We have seen less red in a horror movie.",
    "The deployer wallet has executed this same pattern 6 times on 6 different chains. Coincidence: unlikely.",
    "Our tool ran out of warning icons before it ran out of warnings.",
    "This contract would have been rejected by BitConnect's compliance team.",
    "The only users protected by this contract are the ones who never interact with it.",
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
    "A function marked 'view' modifies state. The developer does not know what 'view' means.",
    "Gas limit set to 'unlimited' in three separate internal calls. Nobody asked why. They should have.",
    "The reentrancy guard exists but is applied to the wrong function. Decorative.",
    "This function accepts ETH but has no way to send it back out. Unless you're the owner. Interesting.",
    "The selfdestruct call is nested inside a function called 'updateRewards'. Noted.",
    "Integer division performed before multiplication, resulting in precision loss of approximately 'all of it.'",
    "Access control is enforced via tx.origin. This is a textbook exploit from 2017.",
    "Constructor runs twice due to a proxy initialization error. Both times, with different values.",
    "The pause mechanism can be triggered by the owner. The unpause mechanism cannot be found.",
    "A mapping is used to store approval allowances without expiry. Every approval is permanent.",
    "Three different uint256 values are cast to uint8 mid-calculation. Overflow is not theoretical here.",
    "The emit statement is placed before the state change. Events are reporting futures, not facts.",
    "Random number generated using block.timestamp as seed. Every miner can predict this.",
    "The whitelist function adds addresses. There is no function to remove them. Suspicious.",
    "A backdoor function is protected by require(msg.sender == 0xDEAD). That address is public.",
    "Contract inherits from five different parents. Two of them conflict. Nobody noticed.",
    "Unchecked arithmetic on line 47 can result in balance becoming MAX_UINT256. Fun.",
    "The oracle is queried mid-transaction, allowing price manipulation in the same block.",
    "This function loops over an unbounded array. It will eventually revert due to block gas limit.",
    "delegatecall is used without checking the return value. It could fail silently. It probably does.",
    "The timelock delay is set to 0. This is technically a timelock in the same way a door with no lock is technically a door.",
    "Fee calculation uses floating point math on a chain that does not support floating point math.",
    "The swap path is hardcoded to a pool that no longer exists. This function does nothing.",
    "There is a comment that says 'TODO: add access control here.' The TODO is two years old.",
    "The burn function sends tokens to address(0). The same function mints them back out. Net burn: zero.",
    "This contract emits a Transfer event on mint but credits the wrong address in the log.",
    "sqrt() is implemented as a for-loop with no bounds. Gas consumption: theoretically infinite.",
    "Three functions have identical names with different parameters. Two of them are never called.",
    "The approve-then-transfer pattern is used without checking current allowance. Front-runnable.",
    "A comment reads 'this is safe, I checked.' No checks are visible in the code.",
    "The contract stores private keys as state variables. They are not private. Nothing on-chain is private.",
    "Function visibility is 'public' on a function that was clearly intended to be 'internal.'",
    "block.number is used to enforce a time delay. Block times are not guaranteed. This delay is not guaranteed.",
    "Assembly block found with no documentation. The assembly block transfers funds to an address.",
    "The staking reward calculation divides by zero if totalSupply is 0. It has been 0 twice.",
    "External contract is called before internal state is updated. Classic reentrancy invitation.",
    "The event log says 'Approved.' The function does not approve anything.",
    "This contract compiles without warnings. That is more alarming than if it had warnings.",
    "A function named 'safeTransfer' does not use SafeERC20. Name is aspirational only.",
    "The multisig threshold is 1 of 1. That is a regular signature.",
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
    if (rawCode === lastCompiledCode) {
        showToast("Change the code before compiling again — no resubmitting the exact same input.", "error");
        return;
    }

    playSound('click');
    const isTemplate = isExactTemplateMatch(rawCode);
    lastCompiledCode = rawCode;

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
