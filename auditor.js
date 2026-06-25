/* ============================================================
   PROCEDURAL SOLIDITY ROASTER ENGINE
   ============================================================ */

const TEMPLATES = {
    safemoon: `contract SafePlunge {\n    mapping(address => uint) public balances;\n    uint256 public constant reflectionTax = 99;\n    // TODO: Renounce ownership tomorrow maybe`,
    infinite: `contract LamboSqueeze {\n    function mintInfinitum(address target) public {\n        // Open backdoor entry for marketing funds\n        balances[target] += 100000000000000000;\n    }\n}`,
    gigapump: `contract GigaPumpPresale {\n    address payable owner;\n    fallback() external payable {\n        // Forward directly to dev's cold wallet\n        owner.transfer(msg.value);\n    }\n}`,
    taxrug: `contract TaxRugBooster {\n    // Extract liquidity dynamically on transfer\n    function transfer(address to, uint val) public {\n        _balances[msg.sender] -= val;\n        _balances[owner] += val;\n    }\n}`
};

function loadTemplate(key) {
    if(TEMPLATES[key]) {
        document.getElementById('contractInput').value = TEMPLATES[key];
        playSound('click');
    }
}

function auditContract() {
    const code = document.getElementById('contractInput').value;
    if(!code.trim()) return;

    playSound('click');
    const container = document.getElementById('auditResults');
    container.classList.remove('hidden');

    // Deterministic seed generation based on string lengths
    const riskScore = Math.floor(Math.random() * 30) + 70; 
    
    const badge = document.getElementById('auditSafetyBadge');
    badge.innerText = `CRITICAL DEGEN OVERLOAD (${riskScore}% DANGER)`;
    badge.className = "px-2.5 py-1 text-[11px] rounded-full font-bold bg-rose-500/20 text-rose-400";

    document.getElementById('auditProb').innerText = `${riskScore}%`;
    document.getElementById('auditProb').className = "text-xl font-bold text-rose-500";
    document.getElementById('auditDevSentiment').innerText = "HONEYPOT_READY";
    document.getElementById('auditLiqStatus').innerText = "0% LOCKED";
    document.getElementById('auditLiqStatus').className = "text-xl font-bold text-rose-400";

    const roasts = [
        "Auditor Verdict: This code looks like it was written by a toddler tracking numbers on a wet napkin.",
        "Line 3: Hardcoded developer wallet addresses detected. Absolute dynamic disaster incoming.",
        "Line 12: Overflow configurations are completely unbound. Math constraints do not exist here.",
        "Warning: High probability of instantaneous geographical disappearance of founder post-launch."
    ];

    document.getElementById('auditParagraph').innerText = roasts[0];
    
    const logs = document.getElementById('lineRoastLogs');
    logs.innerHTML = roasts.map(r => `<div><i class="fa-solid fa-code text-rose-500 mr-1"></i> ${r}</div>`).join('');
}