/* ============================================================
   WEB3: WALLET CONNECT + CLOUD SAVE + LIVE LEADERBOARD
   ============================================================
   - Wallet connect is read-only: it asks the browser wallet extension
     for your public address, nothing else. It never requests a
     transaction or a signature, and never touches funds.
   - Your wallet address becomes your save-slot key in Supabase, so you
     can pick up your run on a different device/browser.
   - The leaderboard ranks lifetime_earned (same number your Degen Level
     is based on) and updates live via Supabase Realtime - no polling.

   SETUP (two things to fill in before this does anything):
     1. Run supabase_setup.sql once in your Supabase project's SQL Editor.
     2. Fill in SUPABASE_URL and SUPABASE_ANON_KEY below (Project
        Settings -> API in your Supabase dashboard). The anon key is
        meant to be public/client-side - that's what it's for.
   ============================================================ */

const SUPABASE_URL = "https://dhoewjzwimvgogckprof.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_AECc75ywuwTSIeXmtCmqzg_FqsutxYE";

// Master wallet: previewing a theme here never checks real ownership, and
// never affects what anyone else sees - it's a local dev-only toggle.
const MASTER_WALLET = "AUrTSsPC2hqZB71QDPn1iHCtTpdFqk4uzk1eRmJDnmGs";

// Cosmetic collection themes. Each entry: a collection to check ownership
// against, and the CSS class (see style.css) to apply if the connected
// wallet holds one. Only the first match applies - these are full-page
// reskins, not meant to stack. Add new ones here as new collections come
// in; nothing else needs to change to support another.
const MIM_SOL_MINT = "M1M6sdffCs3ozzhpRveweRCWdZhxth4mvVujPtYEC3h"; // $MIM SPL token on Solana

const COSMETIC_THEMES = [
    {
        id: "midevils",
        label: "Mid Evils - Medieval",
        collectionAddress: "w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW", // verified via Solscan (MidEvil #3592's collection.key)
        cssClass: "medieval-mode",
        toastMsg: "🏰 Mid Evil detected! The realm grows old.",
    },
    {
        id: "conmen",
        label: "Conmen - Cell Block",
        collectionAddress: "9DqJWp9jF2M7F5Be8Sxs1GSJz7HZYVcyFgyMU9CBLmUQ", // verified via Solscan
        cssClass: "conmen-mode",
        toastMsg: "🔒 Conman detected! Welcome to the cell block.",
    },
    {
        id: "skullx",
        label: "Skull X",
        cssClass: "", // no dedicated visual theme yet - detection/unlock only, standard look
        toastMsg: "💀 Skull X detected!",
        // Bitcoin-based, not Solana - checked against whatever Bitcoin
        // wallet is connected via js/btcwallet.js, not the Solana wallet.
        checkFn: async () => {
            if (typeof btcWalletAddress === 'undefined' || !btcWalletAddress) return false;
            if (typeof window.checkSkullXOrigins !== 'function') return false;
            return await window.checkSkullXOrigins();
        },
    },
    {
        id: "mimwizard",
        label: "$MIM / Bitcoin Wizard",
        cssClass: "", // no dedicated visual theme yet - detection/unlock only, standard look
        toastMsg: "🧙 MIM / Bitcoin Wizard detected!",
        // Shared across both chains on purpose - holding $MIM on Solana OR
        // a Bitcoin Wizard both qualify for the same theme slot.
        checkFn: async () => {
            let holds = false;
            if (typeof walletAddress !== 'undefined' && walletAddress && typeof window.checkTokenHolding === 'function') {
                holds = await window.checkTokenHolding(walletAddress, MIM_SOL_MINT);
            }
            if (!holds && typeof btcWalletAddress !== 'undefined' && btcWalletAddress) {
                if (typeof window.checkMimRuneHolding === 'function') holds = await window.checkMimRuneHolding();
                if (!holds && typeof window.checkBitcoinWizardsOwnership === 'function') holds = await window.checkBitcoinWizardsOwnership();
            }
            return holds;
        },
    },
    {
        id: "genuineundead",
        label: "Genuine Undead",
        cssClass: "", // uses the normal site background on purpose - only the Fight Game arena/fighter change for this one
        toastMsg: "☠️ Genuine Undead detected!",
        // TEST Play preview only, on purpose - no collectionAddress/checkFn
        // means real ownership detection (applyCosmeticThemes) can never
        // match this for an actual player; it only ever shows up via the
        // Theme Preview modal, which is itself TEST-Play-gated already.
    },
];

// Trait-gated rewards - checked against the specific NFT's metadata
// attributes, not just collection membership. Add more entries here as
// new ones get designed; nothing else needs to change to support them.
//   - startingCashBonus: one-time, only applied the very first time a
//     wallet is seen (see offerCloudLoadIfExists) - REPLACES the default
//     starting cash, doesn't stack with it.
//   - marketsLuckMultiplier: permanent once earned (persisted in the
//     save via claimedTraitRewards), divides all Markets catastrophe
//     odds (DRAINED/RUGGED/BUST) by this amount. Sticks even if the NFT
//     is later sold, by design - once earned, it's earned.
const TRAIT_REWARDS = [
    {
        id: "caravaggio_clothing",
        collectionAddress: "w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW", // Mid Evils
        traitType: "Clothing",
        traitValue: "Caravaggio",
        startingCashBonus: 4200,
        marketsLuckMultiplier: 10,
    },
];

let sb = null;
let walletAddress = null;
let walletSolDomain = null; // e.g. "degen.sol" - null until/unless resolved
let leaderboardChannel = null;

function web3Ready() {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function initSupabase() {
    if (!web3Ready()) {
        console.warn("[web3] SUPABASE_URL/SUPABASE_ANON_KEY not set in js/web3.js - wallet/leaderboard features disabled.");
        return;
    }
    if (typeof window.supabase === "undefined") {
        console.warn("[web3] Supabase JS client script not loaded - check the <script> tag in index.html.");
        return;
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* ---------------- Cosmetic theme detection ---------------- */

function clearCosmeticThemes() {
    COSMETIC_THEMES.forEach((t) => { if (t.cssClass) document.body.classList.remove(t.cssClass); });
    document.getElementById("audioToggleBtn")?.classList.add("hidden");
    if (typeof stopMainThemeIfPlaying === "function") stopMainThemeIfPlaying();
    if (typeof exitWin95Desktop === "function") exitWin95Desktop();
}

// Themes the currently-connected wallet actually owns (real ownership,
// not a preview) - populated by applyCosmeticThemes(), read by the
// "switch theme" button so a dual (or more) holder can change their mind
// later without having to reconnect.
let ownedThemesList = [];
let isConmenHolder = false; // real Conmen NFT ownership - separate from cosmetic theme choice, used to gate the Online Fight Club tab and the Conmen heat perks below

// showChoiceIfMultiple=false is used specifically for the master wallet's
// TEST Play path, where Theme Preview is about to open right after and
// would just fight with this modal for attention. Every other caller -
// including LIVE Play, which is deliberately meant to be indistinguishable
// from a real connection - leaves it true.
async function applyCosmeticThemes(addr, showChoiceIfMultiple = true) {
    const owned = [];
    for (const theme of COSMETIC_THEMES) {
        let owns = false;
        try {
            if (theme.checkFn) {
                owns = await theme.checkFn();
            } else if (theme.collectionAddress && typeof window.checkCollectionOwnership === 'function') {
                owns = await window.checkCollectionOwnership(addr, theme.collectionAddress);
            }
        } catch (e) {
            console.warn(`[web3] ownership check failed for theme "${theme.id}":`, e);
        }
        if (owns) owned.push(theme);
    }
    ownedThemesList = owned;
    isConmenHolder = owned.some((t) => t.id === "conmen");
    updateOnlineLobbyAccess();

    const switchBtn = document.getElementById("themeSwitchBtn");
    if (owned.length > 1) {
        switchBtn?.classList.remove("hidden");
    } else {
        switchBtn?.classList.add("hidden");
    }

    if (owned.length === 0) {
        return; // no gated collection owned, normal look
    }
    if (owned.length === 1) {
        applyTheme(owned[0]);
        return;
    }
    // Owns more than one gated collection - let them pick rather than
    // silently defaulting to whichever happens to be checked first.
    if (!showChoiceIfMultiple) {
        applyTheme(owned[0]); // baseline pick; caller has its own way to let them override (Theme Preview)
        return;
    }
    renderThemeChoiceButtons();
    document.getElementById("themeChoiceModal")?.classList.remove("hidden");
}

// Actually applies a theme's visuals/features - shared by the single-owner
// auto-apply path above and the manual picker below, so they can never
// drift out of sync with each other.
// Online Fight Club: locked to "Soon"/"Holders Only" for everyone except
// TEST Play (for testing) or a wallet that genuinely holds a Conmen or Mid
// Evils NFT (checked above via COSMETIC_THEMES, same real ownership check
// cosmetic theming uses - nothing separate to maintain).
function updateOnlineLobbyAccess() {
    const unlocked = isTestPlayMode || ownedThemesList.length > 0;
    document.getElementById("onlineLobbySoonOverlay")?.classList.toggle("hidden", unlocked);
    document.getElementById("onlineLobbySoonBadge")?.classList.toggle("hidden", unlocked);

    // Test-cash button (click the wallet balance for +$4,200) is TEST Play
    // only - addTestCash() itself refuses outside TEST Play too (see
    // state.js), this just stops it from looking clickable for real players.
    const cashWrapper = document.getElementById("cashDisplayWrapper");
    if (cashWrapper) {
        cashWrapper.classList.toggle("cursor-pointer", isTestPlayMode);
        cashWrapper.title = isTestPlayMode ? "Testing only: click to add $4,200" : "";
    }
}

function applyTheme(theme) {
    clearCosmeticThemes(); // also exits Win95 desktop if it was active, so switching straight between themes doesn't stack states
    if (theme.cssClass) document.body.classList.add(theme.cssClass);
    showToast(theme.toastMsg, "success");
    if (theme.id === "mimwizard" && typeof enterWin95Desktop === "function") {
        enterWin95Desktop();
    }
    if (theme.id === "midevils" || theme.id === "conmen") {
        // Deliberately NOT unlocking bonusStageBtn here - the persistent
        // "Play mini game" header button is TEST Play only now. Every real
        // player (and LIVE Play) only reaches the mini-game through the
        // McDonald's popup easter egg (see js/mcdonalds-egg.js).
        document.getElementById("audioToggleBtn")?.classList.remove("hidden");
        if (typeof autoStartThemeMusicIfMuted === 'function') autoStartThemeMusicIfMuted();
    }
}

function renderThemeChoiceButtons() {
    const box = document.getElementById("themeChoiceButtons");
    if (!box) return;
    box.innerHTML = ownedThemesList.map((t) => `
        <button onclick="selectOwnedTheme('${t.id}')"
            class="w-full py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-300 rounded text-xs font-bold transition">
            ${t.label}
        </button>
    `).join("");
}

function selectOwnedTheme(themeId) {
    const theme = ownedThemesList.find((t) => t.id === themeId);
    if (!theme) return;
    applyTheme(theme);
    closeThemeChoice();
}

function openThemeChoice() {
    if (!ownedThemesList.length) return;
    renderThemeChoiceButtons();
    document.getElementById("themeChoiceModal")?.classList.remove("hidden");
}

function closeThemeChoice() {
    document.getElementById("themeChoiceModal")?.classList.add("hidden");
}

/* ---------------- Master wallet: LIVE Play vs TEST Play ---------------- */

// True only after the master wallet explicitly picks TEST Play this
// session - never true for a real player, never true by default.
let isTestPlayMode = false;

function choosePlayMode(mode) {
    document.getElementById("playModeModal")?.classList.add("hidden");
    if (mode === "test") {
        isTestPlayMode = true;
        applyCosmeticThemes(walletAddress, false); // real theme still applies as a baseline; Theme Preview (below) is what actually lets you override it, so skip the separate dual-choice popup here
        document.getElementById("themePreviewBtn")?.classList.remove("hidden");
        document.getElementById("bonusStageBtn")?.classList.remove("hidden");
        document.getElementById("audioToggleBtn")?.classList.remove("hidden");
        document.getElementById("conmenEggTestBtn")?.classList.remove("hidden");
        document.getElementById("debugMenuBtn")?.classList.remove("hidden");
        document.getElementById("fightGameBtn")?.classList.remove("hidden");
        document.getElementById("onlineLobbySoonOverlay")?.classList.add("hidden");
        document.getElementById("onlineLobbySoonBadge")?.classList.add("hidden");
        document.getElementById("btcWalletConnectBtn")?.classList.remove("hidden");
        openThemePreview();
        showToast("🧪 TEST PLAY active - all testing tools unlocked.", "info");
    } else {
        isTestPlayMode = false;
        // Genuinely re-runs the exact same real-connection flow any other
        // wallet gets - including the dual-theme picker if this wallet
        // holds more than one gated collection. Nothing about this call
        // is different for the master wallet.
        applyCosmeticThemes(walletAddress, true);
        document.getElementById("btcWalletConnectBtn")?.classList.add("hidden");
        if (typeof disconnectBitcoinWallet === "function" && typeof btcWalletAddress !== "undefined" && btcWalletAddress) {
            disconnectBitcoinWallet(); // BTC connectivity is TEST-only - don't let it carry over into a LIVE Play session
        }
        showToast("▶️ LIVE PLAY active - this is exactly what a real player sees.", "info");
    }
    if (typeof updateUI === "function") updateUI(); // re-checks things like the zero-balance modal now that the picker is out of the way
}

/* ---------------- Debug menu (TEST Play only) ---------------- */

function _scriptVersionList() {
    return Array.from(document.querySelectorAll('script[src]'))
        .map((s) => s.getAttribute('src'))
        .filter((src) => src && !src.startsWith('http'))
        .map((src) => {
            const [path, ver] = src.split('?v=');
            return `${path.split('/').pop()}  →  ${ver ? 'v' + ver : '(no version tag)'}`;
        });
}

function _activeThemeLabel() {
    if (document.body.classList.contains('medieval-mode')) return 'medieval-mode (Mid Evils)';
    if (document.body.classList.contains('conmen-mode')) return 'conmen-mode (Conmen)';
    return 'none (default look)';
}

function refreshDebugInfo() {
    const stateBox = document.getElementById('debugStateBox');
    if (stateBox) {
        stateBox.innerHTML = [
            `Wallet: ${escapeHtml(walletAddress || '(not connected)')}`,
            `Play mode: ${isTestPlayMode ? 'TEST PLAY' : 'LIVE PLAY'}`,
            `Active theme: ${escapeHtml(_activeThemeLabel())}`,
            `Owned themes (real): ${ownedThemesList.length ? escapeHtml(ownedThemesList.map(t => t.label).join(', ')) : 'none'}`,
            `Page URL: ${escapeHtml(window.location.href)}`,
        ].map(line => `<div>${line}</div>`).join('');
    }

    const versionsBox = document.getElementById('debugVersionsBox');
    if (versionsBox) {
        versionsBox.innerHTML = _scriptVersionList().map(line => `<div>${escapeHtml(line)}</div>`).join('');
    }

    const errorsBox = document.getElementById('debugErrorsBox');
    if (errorsBox) {
        const log = window._debugErrorLog || [];
        errorsBox.innerHTML = log.length
            ? log.slice().reverse().map(e => `<div>[${escapeHtml(e.time)}] ${escapeHtml(e.type)}${e.source ? ' @ ' + escapeHtml(e.source) : ''}: ${escapeHtml(e.message)}</div>`).join('')
            : '<div class="text-gray-500">No errors caught since page load. 🎉</div>';
    }
}

function openDebugMenu() {
    if (typeof isTestPlayMode === 'undefined' || !isTestPlayMode) return; // TEST Play only, full stop - matches addTestCash()/connectUnisat() pattern, not just UI-hidden
    refreshDebugInfo();
    document.getElementById("debugMenuModal")?.classList.remove("hidden");
}

function closeDebugMenu() {
    document.getElementById("debugMenuModal")?.classList.add("hidden");
}

function copyDebugReport() {
    const log = window._debugErrorLog || [];
    const report = [
        '=== SHITCORE DEBUG REPORT ===',
        new Date().toString(),
        '',
        `Wallet: ${walletAddress || '(not connected)'}`,
        `Play mode: ${isTestPlayMode ? 'TEST PLAY' : 'LIVE PLAY'}`,
        `Active theme: ${_activeThemeLabel()}`,
        `Owned themes (real): ${ownedThemesList.length ? ownedThemesList.map(t => t.label).join(', ') : 'none'}`,
        `Page URL: ${window.location.href}`,
        `User agent: ${navigator.userAgent}`,
        '',
        '--- Loaded Script Versions ---',
        ..._scriptVersionList(),
        '',
        '--- Caught Errors ---',
        log.length ? log.map(e => `[${e.time}] ${e.type}${e.source ? ' @ ' + e.source : ''}: ${e.message}`).join('\n') : '(none)',
    ].join('\n');

    navigator.clipboard.writeText(report)
        .then(() => showToast('📋 Debug report copied - paste it in chat.', 'success'))
        .catch(() => showToast('Could not copy automatically - select the text manually.', 'error'));
}

/* ---------------- Wallet connect (any Solana wallet) ---------------- */

// Older/simpler wallets each inject themselves onto `window` under their
// own key - this covers those directly.
const KNOWN_WALLET_CHECKS = [
    { name: "Phantom",         test: () => (window.phantom?.solana?.isPhantom && window.phantom.solana) || (window.solana?.isPhantom && window.solana) },
    { name: "Solflare",        test: () => window.solflare?.isSolflare && window.solflare },
    { name: "Backpack",        test: () => window.backpack?.isBackpack && window.backpack },
    { name: "Glow",            test: () => window.glow?.isGlow && window.glow },
    { name: "Coin98",          test: () => window.coin98?.sol && window.coin98.sol },
    { name: "Trust Wallet",    test: () => window.trustwallet?.solana && window.trustwallet.solana },
    { name: "Coinbase Wallet", test: () => window.coinbaseSolana && window.coinbaseSolana },
    { name: "Exodus",          test: () => window.exodus?.solana && window.exodus.solana },
    { name: "Clover",          test: () => window.clover_solana && window.clover_solana },
];

// Newer wallets (including MetaMask's Solana support, and anything we
// didn't think to name above) announce themselves through the "Wallet
// Standard" instead - a small two-event handshake, no library needed:
// a wallet dispatches "register-wallet" with itself, and/or listens for
// us announcing "app-ready" so wallets that loaded before this script
// did still get a chance to register. This is the mechanism MetaMask's
// Solana integration specifically relies on (confirmed via MetaMask's
// own developer docs - it does not inject a plain window.metamask.solana
// the way Phantom/Solflare/Backpack do).
const standardWallets = []; // { name, wallet } - deduped, Solana-only
function registerStandardWallet(wallet) {
    if (!wallet?.chains?.some(c => c.startsWith("solana:"))) return; // not a Solana wallet
    if (standardWallets.some(w => w.name === wallet.name)) return;   // already have it
    standardWallets.push({ name: wallet.name, wallet });
}
window.addEventListener("wallet-standard:register-wallet", (event) => {
    event.detail({ register: registerStandardWallet });
});
window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", {
    detail: { register: registerStandardWallet },
}));

function getInstalledWallets() {
    const found = [];
    for (const w of KNOWN_WALLET_CHECKS) {
        try {
            const provider = w.test();
            if (provider) found.push({ name: w.name, kind: "legacy", provider });
        } catch (_) { /* a wallet's injected object being weirdly shaped shouldn't break the rest */ }
    }
    for (const { name, wallet } of standardWallets) {
        if (found.some(w => w.name === name)) continue; // already found via the legacy check above
        found.push({ name, kind: "standard", provider: wallet });
    }
    return found;
}

let activeProvider = null; // whichever wallet's provider/wallet object we actually connected with
let activeProviderKind = null; // "legacy" or "standard" - connect/disconnect differ slightly

async function connectWallet() {
    if (typeof btcWalletAddress !== 'undefined' && btcWalletAddress) {
        showToast("Only one wallet at a time - disconnect the Bitcoin wallet first.", "error");
        return;
    }
    const wallets = getInstalledWallets();
    if (wallets.length === 0) {
        showToast("No Solana wallet found - install Phantom, Solflare, Backpack, or similar to connect.", "error");
        window.open("https://solana.com/ecosystem/explore?categories=wallet", "_blank");
        return;
    }
    if (wallets.length === 1) {
        connectToProvider(wallets[0]);
        return;
    }
    openWalletPicker(wallets);
}

async function connectToProvider({ name, kind, provider }) {
    closeWalletPicker();
    try {
        let address;
        if (kind === "standard") {
            // Wallet Standard's connect API is shaped differently from the
            // older per-wallet providers: it hands back an accounts array
            // instead of a single publicKey.
            const connectFeature = provider.features?.["standard:connect"];
            if (!connectFeature) throw new Error("wallet doesn't support standard:connect");
            const { accounts } = await connectFeature.connect();
            if (!accounts?.length) throw { code: 4001 };
            address = accounts[0].address;
        } else {
            const resp = await provider.connect(); // read-only: just asks for the public address
            address = resp.publicKey.toString();
        }

        activeProvider = provider;
        activeProviderKind = kind;
        walletAddress = address;
        updateWalletUI();
        showToast(`🔗 ${name} connected: ${shortAddr(walletAddress)}`, "success");

        // Best-effort .sol domain resolution - purely cosmetic, never blocks anything
        if (typeof window.lookupSolDomain === "function") {
            window.lookupSolDomain(walletAddress).then((domain) => {
                if (domain) {
                    walletSolDomain = domain;
                    updateWalletUI();
                    showToast(`✨ Resolved ${domain}`, "success");
                }
            });
        }

        // Real holder detection - checks every theme in COSMETIC_THEMES.
        // For every normal wallet this runs immediately, same as always.
        // For the master wallet it's deliberately deferred until LIVE/TEST
        // is picked below, so choosing LIVE genuinely re-runs this exact
        // same real-connection sequence rather than something already
        // having happened moments earlier.
        if (walletAddress === MASTER_WALLET) {
            document.getElementById("playModeModal")?.classList.remove("hidden");
        } else {
            applyCosmeticThemes(walletAddress);
        }

        await offerCloudLoadIfExists();
    } catch (e) {
        if (e?.code === 4001) return; // user closed the connect popup - not an error
        console.error(`[web3] ${name} connect failed:`, e);
        showToast(`${name} connection failed or was rejected.`, "error");
    }
}

let _walletPickerList = [];
function openWalletPicker(wallets) {
    _walletPickerList = wallets;
    const box = document.getElementById("walletPickerButtons");
    const modal = document.getElementById("walletPickerModal");
    if (!box || !modal) return;
    box.innerHTML = wallets.map((w, i) => `
        <button onclick="connectToProvider(_walletPickerList[${i}])"
            class="w-full py-2.5 bg-[#1C212E] hover:bg-[#252E3E] text-white font-bold rounded-lg text-sm transition text-left px-4">
            ${w.name}
        </button>`).join("");
    modal.classList.remove("hidden");
}

function closeWalletPicker() {
    document.getElementById("walletPickerModal")?.classList.add("hidden");
}

/* ---------------- Deposit to Rugged Savings ---------------- */

function openDepositModal() {
    const avail = document.getElementById("depositAvailableCash");
    if (avail) avail.innerText = (state.cash || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const input = document.getElementById("depositCustomInput");
    if (input) input.value = "";
    document.getElementById("depositModal")?.classList.remove("hidden");
}

function closeDepositModal() {
    document.getElementById("depositModal")?.classList.add("hidden");
}

function depositPercent(pct) {
    const amount = (state.cash || 0) * (pct / 100);
    if (typeof depositToSavings === "function" && depositToSavings(amount)) {
        playSound("click");
        closeDepositModal();
    }
}

function depositCustom() {
    const input = document.getElementById("depositCustomInput");
    const amount = parseFloat(input?.value);
    if (isNaN(amount) || amount <= 0) {
        showToast("Enter a real amount first.", "error");
        return;
    }
    if (typeof depositToSavings === "function" && depositToSavings(amount)) {
        playSound("click");
        closeDepositModal();
    }
}

function disconnectWallet() {
    if (activeProviderKind === "standard") {
        activeProvider?.features?.["standard:disconnect"]?.disconnect?.();
    } else if (activeProvider?.disconnect) {
        activeProvider.disconnect();
    }
    activeProvider = null;
    activeProviderKind = null;
    walletAddress = null;
    walletSolDomain = null;
    clearCosmeticThemes();
    ownedThemesList = [];
    isConmenHolder = false;
    isTestPlayMode = false;
    updateOnlineLobbyAccess();
    document.getElementById("themePreviewBtn")?.classList.add("hidden");
    document.getElementById("themeSwitchBtn")?.classList.add("hidden");
    document.getElementById("bonusStageBtn")?.classList.add("hidden");
    document.getElementById("conmenEggTestBtn")?.classList.add("hidden");
    document.getElementById("debugMenuBtn")?.classList.add("hidden");
    document.getElementById("fightGameBtn")?.classList.add("hidden");
    document.getElementById("btcWalletConnectBtn")?.classList.add("hidden");
    if (typeof disconnectBitcoinWallet === "function" && typeof btcWalletAddress !== "undefined" && btcWalletAddress) {
        disconnectBitcoinWallet();
    }
    if (typeof resetGameStateInMemory === "function") resetGameStateInMemory();
    updateWalletUI();
    showToast("Wallet disconnected. Still playing locally.", "info");
}

function shortAddr(addr) {
    return addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : "";
}

// .sol domain names are registered by whoever owns them - nothing stops a
// malicious one containing HTML. Anywhere a resolved domain name (or any
// other externally-sourced string) gets inserted via innerHTML instead of
// innerText, it needs to go through this first.
function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function displayName() {
    return walletSolDomain || shortAddr(walletAddress);
}

function updateWalletUI() {
    const btn = document.getElementById("walletConnectBtn");
    if (!btn) return;
    btn.innerText = walletAddress ? `🔗 ${displayName()}` : "Connect Wallet";
    btn.onclick = walletAddress ? disconnectWallet : connectWallet;
}

/* ---------------- Trait-gated rewards ---------------- */

// Checks every entry in TRAIT_REWARDS and grants whichever the wallet
// qualifies for and hasn't already claimed. `isNewSave` gates the
// one-time cash bonus - only a brand-new wallet gets it; the luck
// multiplier is granted regardless (and permanently, once granted).
async function applyTraitRewards(addr, isNewSave) {
    for (const reward of TRAIT_REWARDS) {
        const has = await window.checkTraitOwnership(addr, reward.collectionAddress, reward.traitType, reward.traitValue);
        if (!has) continue;

        // Always confirm the on-chain check itself succeeded, every time -
        // this is separate from whether the reward below actually gets
        // (re-)granted, so it's a reliable way to verify detection is
        // working even on a wallet that already claimed it before.
        showToast(`🎨 Trait Recognized: ${reward.traitValue}`, "success");

        const alreadyClaimed = (state.claimedTraitRewards || []).includes(reward.id);
        if (alreadyClaimed) continue; // detection confirmed above, but don't re-grant

        state.claimedTraitRewards = [...(state.claimedTraitRewards || []), reward.id];
        if (reward.marketsLuckMultiplier) {
            state.marketsLuckMultiplier = Math.max(state.marketsLuckMultiplier || 1, reward.marketsLuckMultiplier);
        }
        if (isNewSave && reward.startingCashBonus) {
            state.cash = reward.startingCashBonus; // replaces the default starting cash, doesn't stack with it
        }

        showToast(`✨ Reward unlocked permanently from ${reward.traitValue}.`, "success");
        saveGame(); // no-op now, but harmless to leave - actual cloud save happens right after this in offerCloudLoadIfExists
        updateUI();
    }
}

// One-time $4,200 bonus for genuinely holding a Conmen NFT. Independent
// ownership check rather than reusing isConmenHolder - applyCosmeticThemes
// runs concurrently with this (not awaited before it), so that flag isn't
// guaranteed to have resolved yet by the time this runs.
async function grantConmenHolderBonus(addr) {
    if (typeof window.checkCollectionOwnership !== "function") return;
    const conmenTheme = COSMETIC_THEMES.find((t) => t.id === "conmen");
    if (!conmenTheme) return;
    const owns = await window.checkCollectionOwnership(addr, conmenTheme.collectionAddress);
    if (!owns) return;
    if ((state.claimedTraitRewards || []).includes("conmen_holder_bonus")) return;

    state.claimedTraitRewards = [...(state.claimedTraitRewards || []), "conmen_holder_bonus"];
    state.cash = (state.cash || 0) + 4200;
    showToast("🔒 Conman detected - $4,200 welcome bonus added.", "success");
    updateUI();
}

/* ---------------- Cloud save / load ---------------- */

async function offerCloudLoadIfExists() {
    if (!sb || !walletAddress) return;
    const { data, error } = await sb
        .from("players")
        .select("game_state, updated_at")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

    if (error) { console.error("[web3] load check failed:", error); return; }
    if (!data) {
        await applyTraitRewards(walletAddress, true); // brand-new wallet - eligible for one-time starting bonuses too
        await grantConmenHolderBonus(walletAddress);
        await saveToCloud();
        return;
    }

    // Always resume the cloud save automatically - no prompt. This wallet's
    // last session is the source of truth the moment it connects.
    state = { ...defaultState, ...data.game_state };
    saveGame();     // no-op now, harmless leftover call
    updateUI();
    showToast("☁️ Welcome back - resumed where you left off.", "success");
    await applyTraitRewards(walletAddress, false); // existing save - can still earn permanent perks (e.g. luck), no cash bonus though
    await grantConmenHolderBonus(walletAddress);
}

async function saveToCloud() {
    if (!sb || !walletAddress) return;
    const { error } = await sb.from("players").upsert({
        wallet_address: walletAddress,
        display_name: walletSolDomain || null,
        game_state: state,
        lifetime_earned: state.lifetimeEarned || 0,
        degen_level: state.degenLevel || 1,
        updated_at: new Date().toISOString(),
    });
    if (error) console.error("[web3] cloud save failed:", error);
}

/* ---------------- Live leaderboard ---------------- */

async function renderLeaderboard() {
    const box = document.getElementById("leaderboardBody");
    if (!box) return;
    if (!sb) {
        box.innerHTML = `<div class="text-gray-500 italic text-xs">Leaderboard not configured yet.</div>`;
        return;
    }
    const { data, error } = await sb
        .from("players")
        .select("wallet_address, display_name, lifetime_earned, degen_level")
        .neq("wallet_address", MASTER_WALLET) // the dev/testing wallet should never show up on a real players' leaderboard
        .order("lifetime_earned", { ascending: false })
        .limit(25);

    if (error) { box.innerHTML = `<div class="text-rose-400 text-xs">Couldn't load leaderboard.</div>`; return; }
    if (!data.length) { box.innerHTML = `<div class="text-gray-500 italic text-xs">Nobody's on the board yet. Be the first degen.</div>`; return; }

    box.innerHTML = data.map((row, i) => `
        <div class="flex justify-between items-center text-[11px] border-b border-[#1A2232] py-1.5 ${row.wallet_address === walletAddress ? "text-amber-400" : "text-gray-300"}">
            <span>#${i + 1} <strong>${row.display_name ? escapeHtml(row.display_name) : shortAddr(row.wallet_address)}</strong> ${row.wallet_address === walletAddress ? "(you)" : ""}</span>
            <span class="font-mono">$${Math.round(row.lifetime_earned).toLocaleString()}</span>
        </div>
    `).join("");
}

function subscribeLeaderboardRealtime() {
    if (!sb || leaderboardChannel) return;
    leaderboardChannel = sb
        .channel("players-leaderboard")
        .on("postgres_changes", { event: "*", schema: "public", table: "players" }, renderLeaderboard)
        .subscribe();
}

function openLeaderboard() {
    document.getElementById("leaderboardModal")?.classList.remove("hidden");
    renderLeaderboard();
    subscribeLeaderboardRealtime();
}
function closeLeaderboard() {
    document.getElementById("leaderboardModal")?.classList.add("hidden");
}

/* ---------------- Theme preview panel (master wallet only) ---------------- */

function renderThemePreviewButtons() {
    const box = document.getElementById("themePreviewButtons");
    if (!box) return;
    box.innerHTML = COSMETIC_THEMES.map((t) => `
        <button onclick="previewTheme('${t.id}')"
            class="w-full py-2 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-300 rounded text-xs font-bold transition">
            ${t.label}
        </button>
    `).join("");
}

function previewTheme(themeId) {
    clearCosmeticThemes(); // also exits Win95 desktop if it was active
    window.activePreviewThemeId = themeId || null; // read by fightgame.js for themes with no cssClass, like Genuine Undead
    if (!themeId) {
        showToast("Preview reset to normal.", "info");
        closeThemePreview();
        return;
    }
    const theme = COSMETIC_THEMES.find((t) => t.id === themeId);
    if (!theme) return;
    if (theme.cssClass) document.body.classList.add(theme.cssClass);
    showToast(`Previewing: ${theme.label} (not a real ownership check)`, "info");
    if (theme.id === "mimwizard" && typeof enterWin95Desktop === "function") {
        enterWin95Desktop();
    }
    // Theme Preview is a full-screen modal (inset-0) - without this it just
    // sits on top of everything after you pick a theme, silently eating
    // clicks on stuff behind it (like the Play Fight Game button) until
    // someone notices and hits the X. Closing on selection is the fix.
    closeThemePreview();
}

function openThemePreview() {
    renderThemePreviewButtons();
    document.getElementById("themePreviewModal")?.classList.remove("hidden");
}
function closeThemePreview() {
    document.getElementById("themePreviewModal")?.classList.add("hidden");
}

/* ---------------- Bonus Stage mini-game (Mid Evils exclusive) ---------------- */

function _bonusStageEscHandler(ev) {
    if (ev.key === "Escape") closeBonusStage();
}

function openBonusStage() {
    console.log('[bonusstage] openBonusStage() called - body classes:', document.body.className);
    // Real access rule, not just "is the button visible": a genuine Mid
    // Evils/Conmen holder gets this in LIVE too, same as the McDonald's
    // popup checks (see _mcdEggBonusStageAvailable() in mcdonalds-egg.js)
    // - TEST Play users get it via the Theme Preview override applying
    // the same body classes. Hard-gating here (not just hiding the
    // button) closes off calling this directly from the console.
    const themeUnlocked = document.body.classList.contains('medieval-mode') || document.body.classList.contains('conmen-mode');
    if (!themeUnlocked) {
        // Was silent before - if the McDonald's popup click isn't opening
        // the mini-game, this tells us definitively whether it's this gate
        // blocking it (this toast fires) or something else entirely (click
        // isn't even reaching this function - no toast at all).
        console.warn('[bonusstage] openBonusStage() blocked - neither medieval-mode nor conmen-mode is active on <body> right now.');
        if (typeof showToast === 'function') showToast("Mini-game needs Mid Evils or Conmen active first.", "error");
        return;
    }
    const overlay = document.getElementById("bonusStageOverlay");
    const canvas = document.getElementById("bonusStageCanvas");
    if (!overlay || !canvas) return;
    if (typeof window.BonusStage === "undefined") {
        console.error("[bonusstage] js/bonusstage.js didn't load - check the <script> tag in index.html");
        showToast("Mini-game failed to load. Try refreshing the page.", "error");
        return;
    }
    if (typeof pauseMainThemeForBonusStage === "function") pauseMainThemeForBonusStage();
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
    document.addEventListener("keydown", _bonusStageEscHandler);
    window.BonusStage.start(canvas);
}

function closeBonusStage() {
    const overlay = document.getElementById("bonusStageOverlay");
    if (overlay) {
        overlay.classList.add("hidden");
        overlay.classList.remove("flex");
    }
    document.removeEventListener("keydown", _bonusStageEscHandler);
    if (typeof window.BonusStage !== "undefined") window.BonusStage.stop();
    if (typeof resumeMainThemeAfterBonusStage === "function") resumeMainThemeAfterBonusStage();
}

// TEST PLAY only - see choosePlayMode(). Escape-to-quit is handled inside
// fightgame.js itself (its own keydown listener, torn down in stop()), so
// unlike Bonus Stage there's no separate handler to wire up here.
function openFightGame() {
    if (typeof isTestPlayMode === 'undefined' || !isTestPlayMode) return; // TEST Play only, full stop - no real-holder path exists for this one yet, unlike Bonus Stage
    const overlay = document.getElementById("fightGameOverlay");
    const canvas = document.getElementById("fightGameCanvas");
    if (!overlay || !canvas) return;
    if (typeof window.FightGame === "undefined") {
        console.error("[fightgame] js/fightgame.js didn't load - check the <script> tag in index.html");
        showToast("Fight game failed to load. Try refreshing the page.", "error");
        return;
    }
    if (typeof pauseMainThemeForBonusStage === "function") pauseMainThemeForBonusStage();
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
    window.FightGame.start(canvas);
}

function closeFightGame() {
    const overlay = document.getElementById("fightGameOverlay");
    if (overlay) {
        overlay.classList.add("hidden");
        overlay.classList.remove("flex");
    }
    if (typeof window.FightGame !== "undefined") window.FightGame.stop();
    if (typeof resumeMainThemeAfterBonusStage === "function") resumeMainThemeAfterBonusStage();
}

/* ---------------- Init ---------------- */

document.addEventListener("DOMContentLoaded", () => {
    initSupabase();
    updateWalletUI();
});
