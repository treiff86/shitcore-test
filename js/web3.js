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
        cssClass: "skullx-mode", // dark teal/navy "shadow validator" theme, matched to the reference mockup
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
        label: "Genuine Undead / Forever Undead",
        cssClass: "undead-mode", // dark terminal-green "hacker" theme, matched to the reference mockup
        toastMsg: "☠️ GU/FU Detected!",
        checkFn: async () => {
            if (typeof window.checkGenuineUndeadOwnership !== 'function') return false;
            return await window.checkGenuineUndeadOwnership();
        },
        // No longer TEST-preview-only on purpose - real ownership check via
        // GU Origins, Genuine Undead v3, or ForeverUndead (any one counts,
        // per Tim's explicit call to unify them). GENUINE_UNDEAD_V3_CONTRACT
        // and FOREVER_UNDEAD_CONTRACT in js/evmwallet.js are still
        // placeholders (null) until the real contract addresses come in -
        // only GU Origins can actually match a real holder until then.
    },
];

// Trait-gated rewards - checked against the specific NFT's metadata
// attributes, not just collection membership. Add more entries here as
// new ones get designed; nothing else needs to change to support them.
//   - cashBonus: one-time, claimed once and recorded in the save.
//     WAS startingCashBonus, which REPLACED the default starting cash and
//     only applied to a brand-new wallet. That made it invisible to
//     anyone who had already played, and it silently conflicted with the
//     flat holder bonus below (one sets cash, the other adds to it, and
//     the order they ran in decided the result). It is now additive and
//     ownership-triggered like every other holder bonus, so a Caravaggio
//     holder gets the Mid Evils $3,000 AND this $4,200 on top.
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
        cashBonus: 4200,
        marketsLuckMultiplier: 10,
        requiresThemeClass: "medieval-mode", // only recognized/granted once the Mid Evils theme has actually connected - not just on raw wallet connect
    },
];

/* ---------------- HOLDER PERKS ----------------
   Every collection now carries perks, not just Conmen and Mid Evils.

   WHY THIS IS A TABLE. The perks used to be scattered: a bespoke
   grantConmenHolderBonus() for the cash, a hardcoded multiplier buried in
   deployer.js for the heat, a trait reward for the luck. Adding a sixth
   collection meant touching four files and remembering all four. The perk
   is the data now - the effects read this table, so a new collection is
   one entry here and nothing else.

   `themeId` matches COSMETIC_THEMES above. Ownership is read from
   ownedThemesList - the single source of truth applyCosmeticThemes fills
   from real on-chain checks - rather than the individual isXHolder
   booleans, which are only mirrors of it.

   Two kinds of perk live here and the difference matters:
     - cashBonus is CLAIMED ONCE, recorded in the save, and kept forever
       even if the NFT is later sold. Same contract as the trait rewards.
     - every other field is LIVE, re-read from current ownership at the
       moment of use. Sell the NFT and the perk stops. That asymmetry is
       deliberate: a one-off welcome gift can be permanent, an ongoing
       mechanical advantage for an NFT you no longer hold should not be.

   `lines` is what the player is actually told on connect (see
   announceHolderPerks) - keep it accurate, because it is the only place
   most people will ever learn what they get. */
const HOLDER_PERKS = [
    {
        themeId: "midevils",
        name: "Mid Evils",
        cashBonus: 3000,
        lines: "$3,000 holder bonus · Bonus Stage unlocked · Online Fight Club unlocked",
    },
    {
        themeId: "conmen",
        name: "Conmen",
        cashBonus: 3000,
        heatMultiplier: 0.6,   // 40% less Regulatory Heat from every heat event
        lines: "$3,000 holder bonus · 40% less Regulatory Heat · rare chance to wipe Heat to 0 · Bonus Stage + Online Fight Club unlocked",
    },
    {
        themeId: "skullx",
        name: "Skull X",
        cashBonus: 3000,
        marketsLuck: 3,        // divides DRAINED/RUGGED/BUST odds
        lines: "$3,000 holder bonus · 3x Markets luck — crashes are 3x rarer · Online Fight Club unlocked",
    },
    {
        themeId: "mimwizard",
        name: "$MIM / Bitcoin Wizard",
        cashBonus: 3000,
        capitalInflowMult: 1.40,
        lines: "$3,000 holder bonus · +40% capital inflow on every deployment · the Windows 95 desktop · Online Fight Club unlocked",
    },
    {
        themeId: "genuineundead",
        name: "Genuine Undead / Forever Undead",
        cashBonus: 3000,
        secondLife: true,      // one free revival per run when Heat maxes out
        lines: "$3,000 holder bonus · Second Life: one free revival per run when Heat maxes out · Online Fight Club unlocked",
    },
];

function ownsThemeId(id) {
    return Array.isArray(ownedThemesList) && ownedThemesList.some((t) => t.id === id);
}

// Best (not cumulative) luck across owned collections, versus whatever the
// save already permanently holds from a trait reward. Caravaggio's 10x
// therefore still beats Skull X's 3x for anyone holding both, instead of
// the two multiplying into a 30x nobody designed.
function holderMarketsLuck() {
    let best = 1;
    try { best = (state && state.marketsLuckMultiplier) || 1; } catch (e) { best = 1; }
    for (const p of HOLDER_PERKS) {
        if (p.marketsLuck && ownsThemeId(p.themeId)) best = Math.max(best, p.marketsLuck);
    }
    return best;
}

// These two DO compound across collections - a dual holder should feel
// like a dual holder. With one perk of each kind in the table today it
// makes no practical difference; it matters the moment a second is added.
function holderCapitalInflowMult() {
    let m = 1;
    for (const p of HOLDER_PERKS) {
        if (p.capitalInflowMult && ownsThemeId(p.themeId)) m *= p.capitalInflowMult;
    }
    return m;
}

function holderHeatMultiplier() {
    let m = 1;
    for (const p of HOLDER_PERKS) {
        if (p.heatMultiplier && ownsThemeId(p.themeId)) m *= p.heatMultiplier;
    }
    return m;
}

function holderHasSecondLife() {
    return HOLDER_PERKS.some((p) => p.secondLife && ownsThemeId(p.themeId));
}

// One toast per owned collection, spelling out what that collection
// actually gives them. showToast displays one at a time and replaces
// whatever is on screen, so these are spaced far enough apart to each be
// readable instead of firing as a burst where only the last is ever seen.
function announceHolderPerks() {
    const owned = HOLDER_PERKS.filter((p) => ownsThemeId(p.themeId));
    if (!owned.length) return;
    let delay = 2600; // let the "theme detected" toast land first
    owned.forEach((p) => {
        setTimeout(() => showToast(`✨ ${p.name} perks — ${p.lines}`, "success"), delay);
        delay += 4200;
    });
}

let sb = null;
let walletAddress = null;
let walletSolDomain = null; // e.g. "degen.sol" - null until/unless resolved
// leaderboardChannel is gone with the realtime subscription it held -
// see startLeaderboardPolling() for why that had to become a poll.

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
let isSkullXHolder = false; // real Skull X ownership - same idea, gates the Skull X easter egg below
let isUndeadHolder = false; // real Genuine Undead / Forever Undead ownership - same idea, gates the Undead easter egg below
let isMidEvilsHolder = false; // real Mid Evils ownership - same idea, gates the Mid Evils easter egg (js/midevils-egg.js)
let isMimWizardHolder = false; // real $MIM / Bitcoin Wizard ownership - drives the capital-inflow perk in deployer.js

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
                // collectionAddress checks are always Solana-specific -
                // always use the actual connected Solana wallet here,
                // NOT the addr parameter, which might be a Bitcoin
                // address if this re-check was triggered by a BTC wallet
                // connecting/disconnecting instead of a Solana one. That
                // mismatch is what caused "Invalid pubkey bc1..." errors
                // from the Solana NFT checker.
                if (typeof walletAddress === 'undefined' || !walletAddress) continue;
                owns = await window.checkCollectionOwnership(walletAddress, theme.collectionAddress);
            }
        } catch (e) {
            console.warn(`[web3] ownership check failed for theme "${theme.id}":`, e);
        }
        if (owns) owned.push(theme);
    }
    ownedThemesList = owned;
    isConmenHolder = owned.some((t) => t.id === "conmen");
    isSkullXHolder = owned.some((t) => t.id === "skullx");
    isUndeadHolder = owned.some((t) => t.id === "genuineundead");
    // "midevils" is the THEME ID here (its cssClass is "medieval-mode" -
    // the two names differ, and mixing them up is an easy mistake).
    isMidEvilsHolder = owned.some((t) => t.id === "midevils");
    isMimWizardHolder = owned.some((t) => t.id === "mimwizard");
    updateOnlineLobbyAccess();

    const switchBtn = document.getElementById("themeSwitchBtn");
    if (owned.length > 1) {
        switchBtn?.classList.remove("hidden");
    } else {
        switchBtn?.classList.add("hidden");
    }

    if (owned.length === 0) {
        clearCosmeticThemes(); // nothing owned anymore (e.g. wallet disconnected) - back to the standard look, not whatever was applied before
        return;
    }
    // Ask before applying, even with exactly one match - holding a
    // gated NFT doesn't mean the themed look should switch on
    // automatically without confirmation. Only exception: showChoiceIfMultiple
    // === false is the "quiet re-check" path (e.g. disconnecting a wallet),
    // which should never pop up a modal on its own.
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
    showToast(theme.toastMsg, "success", theme.id === "skullx" ? pickRandomSkullXOrdinal() : null);
    if (theme.id === "mimwizard" && typeof enterWin95Desktop === "function") {
        enterWin95Desktop();
    }
    // Every theme that HAS a music track gets the audio button and the
    // auto-start. This used to list only midevils/conmen/mimwizard, which
    // meant Skull X and Genuine Undead had tracks sitting in the repo
    // (assets/skullx-theme.mp3 and assets/undead-theme.mp3, both wired
    // into THEME_MUSIC_TRACKS in js/audio.js and both perfectly playable)
    // that nothing ever asked to play - and no audio button to start them
    // by hand either, so those two themes were completely silent.
    //
    // Derived from THEME_MUSIC_TRACKS rather than hardcoded a second time,
    // so adding a track to that map is now the ONLY thing needed to give a
    // future theme music. That's what went wrong here: the track was added
    // in one place and the gate was never updated to match.
    if (themeHasMusic(theme)) {
        // Deliberately NOT unlocking bonusStageBtn here - the persistent
        // "Play mini game" header button is TEST Play only now. Every real
        // player (and LIVE Play) only reaches the mini-game through the
        // McDonald's popup easter egg (see js/mcdonalds-egg.js).
        document.getElementById("audioToggleBtn")?.classList.remove("hidden");
        if (typeof autoStartThemeMusicIfMuted === 'function') autoStartThemeMusicIfMuted();
    }
}

// Does this theme have a music track? Answered by asking js/audio.js's
// THEME_MUSIC_TRACKS map directly instead of keeping a duplicate list of
// theme ids in sync by hand.
//
// The mimwizard special case is real, not a workaround: its cssClass is
// empty, and its music is keyed off "win95-mode" - the class the Win95
// desktop adds to <body> - rather than a cosmetic theme class of its own.
function themeHasMusic(theme) {
    if (!theme) return false;
    if (theme.id === "mimwizard") return true; // keyed on win95-mode, applied by enterWin95Desktop()
    if (!theme.cssClass) return false;
    try {
        return typeof THEME_MUSIC_TRACKS !== 'undefined'
            && Object.prototype.hasOwnProperty.call(THEME_MUSIC_TRACKS, theme.cssClass);
    } catch (e) {
        // THEME_MUSIC_TRACKS is a top-level `const` in js/audio.js, so it
        // lives in the temporal dead zone until that script runs - and
        // `typeof` on a TDZ binding THROWS rather than returning
        // "undefined". Same gotcha as the `sb` checks elsewhere.
        return false;
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
    `).join("") + `
        <button onclick="selectNoTheme()"
            class="w-full py-2 bg-gray-600/20 hover:bg-gray-600/40 border border-gray-500/30 text-gray-300 rounded text-xs font-bold transition">
            No Theme (standard look)
        </button>
    `;
}

function selectOwnedTheme(themeId) {
    const theme = ownedThemesList.find((t) => t.id === themeId);
    if (!theme) return;
    applyTheme(theme);
    closeThemeChoice();
}

// Opting out - holding a gated NFT doesn't have to mean wanting the
// themed look every time. Doesn't forget what they own (ownedThemesList
// is untouched, so the "switch theme" button can still bring this modal
// back up later) - just clears whichever theme is currently applied.
function selectNoTheme() {
    clearCosmeticThemes();
    closeThemeChoice();
}

function openThemeChoice() {
    if (!ownedThemesList.length) return;
    renderThemeChoiceButtons();
    document.getElementById("themeChoiceModal")?.classList.remove("hidden");
}

/* ---------------- Waiting for the theme choice ----------------
   applyCosmeticThemes() opens the "Choose Your Theme" modal and RETURNS
   immediately - it does not wait for an answer. The perk grants and their
   toasts ran straight afterwards, so a holder got "Mid Evils perks -
   $3,000 holder bonus..." fired over the top of a modal they hadn't
   answered yet, before they'd even seen what they were choosing between.

   This gives that modal a completion signal. Every way out of it resolves
   the same promise - picking a theme, picking No Theme, or dismissing
   with the X - so nothing can leave a caller waiting forever.

   The timeout is a backstop, not the normal path: if a player wanders off
   with the modal open, their holder bonus should still land rather than
   being lost because they never clicked. */
const THEME_CHOICE_TIMEOUT_MS = 120000;
let _themeChoiceWaiters = [];

function themeChoiceOpen() {
    const m = document.getElementById("themeChoiceModal");
    return !!m && !m.classList.contains("hidden");
}

// Resolves once the modal is closed, or immediately if it was never open.
function whenThemeChoiceSettled() {
    if (!themeChoiceOpen()) return Promise.resolve();
    return new Promise((resolve) => {
        const done = () => resolve();
        _themeChoiceWaiters.push(done);
        setTimeout(() => {
            const i = _themeChoiceWaiters.indexOf(done);
            if (i !== -1) { _themeChoiceWaiters.splice(i, 1); done(); }
        }, THEME_CHOICE_TIMEOUT_MS);
    });
}

function settleThemeChoice() {
    const waiters = _themeChoiceWaiters;
    _themeChoiceWaiters = [];
    waiters.forEach((fn) => { try { fn(); } catch (e) {} });
}

function closeThemeChoice() {
    document.getElementById("themeChoiceModal")?.classList.add("hidden");
    settleThemeChoice(); // covers the X and both picker buttons, which
                         // all route through here
}

/* ---------------- Master wallet: LIVE Play vs TEST Play ---------------- */

// True only after the master wallet explicitly picks TEST Play this
// session - never true for a real player, never true by default.
let isTestPlayMode = false;

function choosePlayMode(mode) {
    // The master-wallet check used to live ONLY at the call site that opens
    // the modal, never inside this function - so any player could type
    // choosePlayMode('test') into the console and unlock the whole testing
    // kit (debug menu, theme preview, +$4,200 test cash, every gated
    // minigame). Re-checking here is what actually enforces it, since this
    // is a global function anyone can call.
    if (mode === "test" && walletAddress !== MASTER_WALLET) {
        console.warn("[web3] TEST Play is master-wallet only.");
        return;
    }
    document.getElementById("playModeModal")?.classList.add("hidden");
    if (mode === "test") {
        isTestPlayMode = true;
        applyCosmeticThemes(walletAddress, false); // real theme still applies as a baseline; Theme Preview (below) is what actually lets you override it, so skip the separate dual-choice popup here
        document.getElementById("themePreviewBtn")?.classList.remove("hidden");
        document.getElementById("bonusStageBtn")?.classList.remove("hidden");
        document.getElementById("audioToggleBtn")?.classList.remove("hidden");
        document.getElementById("conmenEggTestBtn")?.classList.remove("hidden");
        document.getElementById("mevSandwichGameTestBtn")?.classList.remove("hidden");
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
        // The grants are chained onto this rather than fired alongside it:
        // ownedThemesList only exists once applyCosmeticThemes resolves, and
        // for the master wallet offerCloudLoadIfExists already ran back in
        // connectToProvider - before LIVE was even picked - so this is the
        // only place a master-wallet LIVE session can pick its perks up.
        applyCosmeticThemes(walletAddress, true).then(() => {
            grantHolderBonuses().then(announceHolderPerks);
        });
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
    // Final dedup pass on the combined list, not just within each source
    // separately - some wallets (Backpack included) can fire their
    // Wallet Standard announce event more than once, which the per-source
    // checks above don't always catch.
    const seen = new Set();
    return found.filter(w => {
        if (seen.has(w.name)) return false;
        seen.add(w.name);
        return true;
    });
}

let activeProvider = null; // whichever wallet's provider/wallet object we actually connected with
let activeProviderKind = null; // "legacy" or "standard" - connect/disconnect differ slightly

async function connectWallet() {
    if (typeof btcWalletAddress !== 'undefined' && btcWalletAddress) {
        showToast("Only one wallet at a time - disconnect the Bitcoin wallet first.", "error");
        return;
    }
    const wallets = getInstalledWallets();
    // Always show the picker now, even with zero or one Solana wallet
    // detected - it's also how Bitcoin wallets (Xverse/UniSat) get
    // reached, which used to be a completely separate, easy-to-miss
    // button. Auto-connecting past this when exactly one Solana wallet
    // existed would silently skip the Bitcoin option every time.
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
            await applyCosmeticThemes(walletAddress); // must finish (and apply the theme class) before the trait check below runs, not just fire-and-forget
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
    if (wallets.length === 0) {
        box.innerHTML = `<p class="text-[10px] text-gray-500 italic">No Solana wallet detected - install Phantom, Solflare, Backpack, or similar, or use a Bitcoin/Ethereum wallet below instead.</p>`;
    } else {
        box.innerHTML = wallets.map((w, i) => `
            <button onclick="connectToProvider(_walletPickerList[${i}])"
                class="w-full py-2.5 bg-[#1C212E] hover:bg-[#252E3E] text-white font-bold rounded-lg text-sm transition text-left px-4">
                ${w.name}
            </button>`).join("");
    }
    if (typeof renderEthWalletPickerButtons === 'function') renderEthWalletPickerButtons();
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
    isSkullXHolder = false;
    isUndeadHolder = false;
    isMidEvilsHolder = false;
    isMimWizardHolder = false;
    isTestPlayMode = false;
    // Drop the signed-in session with the wallet. The stored token is
    // deliberately left in localStorage: it belongs to that wallet, is
    // useless without it, and keeping it means reconnecting the same
    // wallet later doesn't demand a fresh signature.
    playerSessionToken = null;
    stopLeaderboardPolling();
    updateOnlineLobbyAccess();
    document.getElementById("themePreviewBtn")?.classList.add("hidden");
    document.getElementById("themeSwitchBtn")?.classList.add("hidden");
    document.getElementById("bonusStageBtn")?.classList.add("hidden");
    document.getElementById("conmenEggTestBtn")?.classList.add("hidden");
    document.getElementById("mevSandwichGameTestBtn")?.classList.add("hidden");
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
        if (reward.requiresThemeClass && !document.body.classList.contains(reward.requiresThemeClass)) continue; // theme hasn't actually connected yet - don't even check, let alone recognize

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
        if (reward.cashBonus) {
            // Additive and ownership-triggered, not new-wallet-only - see the
            // note on TRAIT_REWARDS. `isNewSave` is no longer consulted here.
            state.cash = (state.cash || 0) + reward.cashBonus;
            showToast(`🎨 ${reward.traitValue} trait bonus: +$${reward.cashBonus.toLocaleString()}`, "success");
        }

        showToast(`✨ Reward unlocked permanently from ${reward.traitValue}.`, "success");
        saveGame(); // no-op now, but harmless to leave - actual cloud save happens right after this in offerCloudLoadIfExists
        updateUI();
    }
}

/* One-time holder cash bonuses, one per collection, driven by HOLDER_PERKS.

   REPLACES grantConmenHolderBonus(), which was a bespoke $4,200 for Conmen
   and nothing at all for the other four collections.

   Reads ownedThemesList rather than re-checking ownership on chain, which
   the old function had to do because it ran concurrently with
   applyCosmeticThemes. It no longer does: connectToProvider awaits
   applyCosmeticThemes before offerCloudLoadIfExists, so the list is
   already settled here - and skipping the redundant checks saves five
   round trips through the sol-lookup function on every single connect.

   MIGRATION. Conmen holders who already claimed the old $4,200 carry the
   legacy id "conmen_holder_bonus" in their save. That is treated as
   equivalent to the new id, so nobody gets paid twice for the same
   collection - and nobody who already claimed has their bonus revoked
   down to $3,000 either. The price change applies to new claims only. */
const LEGACY_BONUS_IDS = { conmen: "conmen_holder_bonus" };

async function grantHolderBonuses() {
    if (typeof state === "undefined" || !state) return;
    let total = 0;
    for (const perk of HOLDER_PERKS) {
        if (!perk.cashBonus || !ownsThemeId(perk.themeId)) continue;
        const id = `holder_bonus_${perk.themeId}`;
        const claimed = state.claimedTraitRewards || [];
        const legacy = LEGACY_BONUS_IDS[perk.themeId];
        if (claimed.includes(id) || (legacy && claimed.includes(legacy))) continue;

        state.claimedTraitRewards = [...claimed, id];
        state.cash = (state.cash || 0) + perk.cashBonus;
        total += perk.cashBonus;
        showToast(`💰 ${perk.name} holder bonus: +$${perk.cashBonus.toLocaleString()}`, "success");
    }
    if (total > 0 && typeof updateUI === "function") updateUI();
}

/* ============================================================
   WALLET SIGN-IN  (anti-cheat / save ownership)
   ============================================================
   THE PROBLEM THIS SOLVES. The `players` table used to accept anonymous
   reads and writes from anyone holding the publishable key - which is in
   this very file, by design, because it has to be. That meant anyone
   could read every player's save, write any score they liked to the
   leaderboard, and overwrite or wipe SOMEBODY ELSE'S save. The last one
   is the one that can't be patched client-side: connecting a wallet only
   tells us an address, and an address is public information. Nothing
   proved the person sending it actually held that wallet.

   THE FIX. On connect the wallet signs a short server-issued challenge.
   Only a real signature from that wallet's private key verifies, so the
   server can finally tell the owner from someone who typed the address
   in. It hands back a session token, and the `game-save` Edge Function
   refuses every read and write that doesn't carry a valid one.

   WHAT THE SIGNATURE IS NOT. It is not a transaction. It approves
   nothing, spends nothing, and cannot move a token - it is a plain text
   message, and the wallet shows the exact text before signing. This is
   the same "sign in" step Magic Eden and Tensor use.

   The token lasts a week and is kept in localStorage, so the popup shows
   up on first connect and then roughly weekly - not on every page load.
   ============================================================ */
const GAME_SAVE_FUNCTION = "game-save";
const SESSION_KEY_PREFIX = "shitcore_session_";

let playerSessionToken = null;

function loadStoredSession(addr) {
    try {
        const raw = localStorage.getItem(SESSION_KEY_PREFIX + addr);
        if (!raw) return null;
        const s = JSON.parse(raw);
        // A minute of headroom, so a token that expires mid-request doesn't
        // produce a confusing "session expired" on an action already begun.
        if (!s.token || !s.expiresAt || s.expiresAt < Date.now() + 60000) return null;
        return s.token;
    } catch (e) { return null; }
}

function storeSession(addr, token, expiresAt) {
    try { localStorage.setItem(SESSION_KEY_PREFIX + addr, JSON.stringify({ token, expiresAt })); }
    catch (e) { /* private browsing - the session just won't outlive the tab */ }
}

function clearStoredSession(addr) {
    try { localStorage.removeItem(SESSION_KEY_PREFIX + addr); } catch (e) {}
}

async function callGameSave(payload) {
    if (!sb) return { error: "no_client" };
    try {
        const { data, error } = await sb.functions.invoke(GAME_SAVE_FUNCTION, { body: payload });
        if (error) {
            // supabase-js turns a non-2xx into an error whose body holds the
            // real reason, which is the part actually worth knowing.
            let detail = null;
            try { detail = await error.context?.json?.(); } catch (e) {}
            return { error: detail?.error || error.message || "request_failed" };
        }
        return data || {};
    } catch (e) {
        console.warn("[web3] game-save call threw:", e);
        return { error: "unreachable" };
    }
}

// Asks the connected wallet to sign the challenge. Handles both provider
// shapes: Wallet Standard exposes solana:signMessage as a feature, the
// older injected providers expose provider.signMessage directly.
async function signMessageWithWallet(message) {
    const bytes = new TextEncoder().encode(message);
    if (activeProviderKind === "standard") {
        const feature = activeProvider?.features?.["solana:signMessage"];
        if (!feature) throw new Error("wallet can't sign messages");
        const accounts = activeProvider?.accounts || [];
        const res = await feature.signMessage({ account: accounts[0], message: bytes });
        const sig = Array.isArray(res) ? res[0]?.signature : res?.signature;
        if (!sig) throw new Error("no signature returned");
        return sig;
    }
    if (typeof activeProvider?.signMessage !== "function") throw new Error("wallet can't sign messages");
    const res = await activeProvider.signMessage(bytes, "utf8");
    return res?.signature || res;
}

// Solana signatures and public keys travel as base58 everywhere else in
// this codebase, so the server expects base58 too. No dependency needed
// for 64 bytes.
function toBase58(bytes) {
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const arr = Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    let zeros = 0;
    while (zeros < arr.length && arr[zeros] === 0) zeros++;
    // Starts EMPTY, not [0]. Seeding a zero digit is the classic base58
    // off-by-one: the leading-zero run below already emits one '1' per
    // zero byte, so a leftover zero digit adds one more on top and
    // toBase58(all-zero bytes) comes out a character too long.
    const digits = [];
    for (let i = zeros; i < arr.length; i++) {
        let carry = arr[i];
        for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    let out = "";
    for (let i = 0; i < zeros; i++) out += ALPHABET[0];
    for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
    return out;
}

/* Returns true once this wallet has a live session. Reuses a stored token
   when there is one, so the signature popup is a first-connect thing
   rather than a page-load thing. */
async function ensurePlayerSession() {
    if (!walletAddress) return false;
    if (playerSessionToken) return true;

    const stored = loadStoredSession(walletAddress);
    if (stored) { playerSessionToken = stored; return true; }

    const challenge = await callGameSave({ op: "nonce", wallet: walletAddress });
    if (challenge.error || !challenge.message) {
        console.warn("[web3] couldn't get a sign-in challenge:", challenge.error);
        showToast("Couldn't start sign-in. Cloud save is off for now.", "error");
        return false;
    }

    let signatureB58;
    try {
        showToast("✍️ Approve the signature to enable cloud save — it's not a transaction.", "info");
        signatureB58 = toBase58(await signMessageWithWallet(challenge.message));
    } catch (e) {
        // Rejecting is a completely valid choice - the game plays fine
        // locally without a cloud save, so this must not read as an error.
        console.info("[web3] sign-in declined or unsupported:", e?.message || e);
        showToast("Signature skipped — you can still play, progress just won't sync.", "info");
        return false;
    }

    const res = await callGameSave({ op: "login", wallet: walletAddress, signature: signatureB58 });
    if (res.error || !res.token) {
        console.warn("[web3] sign-in failed:", res.error);
        showToast("Sign-in failed. Cloud save is off for now.", "error");
        return false;
    }
    playerSessionToken = res.token;
    storeSession(walletAddress, res.token, res.expiresAt);
    showToast("🔐 Signed in — your save is now locked to your wallet.", "success");
    return true;
}

// A token can go stale mid-session (expired, or revoked server-side).
// Dropping it here means the next call re-signs instead of silently
// failing to save for the rest of the session.
function invalidateSessionIfRejected(err) {
    if (err === "not_signed_in" || err === "session_expired" || err === "bad_token") {
        playerSessionToken = null;
        if (walletAddress) clearStoredSession(walletAddress);
        return true;
    }
    return false;
}

/* ---------------- Cloud save / load ---------------- */

async function offerCloudLoadIfExists() {
    if (!sb || !walletAddress) return;

    // No session means no cloud save at all - not a silent half-state
    // where the game loads but never persists.
    const signedIn = await ensurePlayerSession();
    if (!signedIn) return;

    const res = await callGameSave({ op: "load", wallet: walletAddress, token: playerSessionToken });
    if (res.error) {
        if (invalidateSessionIfRejected(res.error)) return offerCloudLoadIfExists();
        console.error("[web3] load check failed:", res.error);
        return;
    }
    const data = res.found ? { game_state: res.game_state, updated_at: res.updated_at } : null;

    if (!data) {
        // Hold everything perk-related until the player has actually
        // answered the theme picker - otherwise the bonus toasts fire over
        // the top of a modal they haven't read yet. saveToCloud stays AFTER
        // the grants so the bonus cash is in the state being written.
        await whenThemeChoiceSettled();
        await applyTraitRewards(walletAddress, true); // brand-new wallet - eligible for one-time starting bonuses too
        await grantHolderBonuses();
        announceHolderPerks();
        await saveToCloud();
        return;
    }

    // Always resume the cloud save automatically - no prompt. This wallet's
    // last session is the source of truth the moment it connects.
    state = { ...defaultState, ...data.game_state };
    // Repairs a save that accumulated an unbounded Victim Hall of Fame
    // before the cap existed - see VICTIM_LEADERBOARD_MAX in js/state.js.
    // Deliberately before the updateUI() below, so the first render after
    // loading is already the trimmed list, and the next saveToCloud()
    // writes the smaller array back to Supabase.
    if (typeof trimVictimLeaderboard === "function") trimVictimLeaderboard();
    // Third money-duplication path: connecting a wallet mid-trade replaces
    // `state` (and with it the cash balance) while the open position lives
    // on in markets.js, so it could still be closed afterwards for a margin
    // refund against the newly loaded balance.
    if (typeof clearActiveTradeOnReset === "function") clearActiveTradeOnReset();
    saveGame();     // no-op now, harmless leftover call
    updateUI();
    showToast("☁️ Welcome back - resumed where you left off.", "success");
    // Same as the new-wallet path above: nothing perk-related is announced
    // over an unanswered theme picker.
    await whenThemeChoiceSettled();
    await applyTraitRewards(walletAddress, false); // existing save - can still earn permanent perks (e.g. luck)
    await grantHolderBonuses();
    // Always announced, claimed or not: the perks are ongoing, so a
    // returning player still needs reminding what holding gets them. Only
    // the CASH is once-per-wallet, and grantHolderBonuses handles that.
    announceHolderPerks();
}

// Writes now go through the game-save function, which requires the
// session token AND sanity-checks the payload server-side. A direct
// upsert from the browser is no longer possible at all - the anon role
// has had its grants on `players` revoked, so this isn't merely the
// polite path, it's the only one.
let _saveFailureStreak = 0;

async function saveToCloud() {
    if (!sb || !walletAddress) return;
    if (!playerSessionToken && !(await ensurePlayerSession())) return;

    const res = await callGameSave({
        op: "save",
        wallet: walletAddress,
        token: playerSessionToken,
        game_state: state,
        lifetime_earned: state.lifetimeEarned || 0,
        degen_level: state.degenLevel || 1,
        display_name: walletSolDomain || null,
    });

    if (!res.error) { _saveFailureStreak = 0; return; }

    if (invalidateSessionIfRejected(res.error)) {
        // One retry, which will re-sign. Not a loop: the retry passes
        // through this same branch and a second failure falls through to
        // the logging below instead of recursing again.
        if (await ensurePlayerSession()) {
            const retry = await callGameSave({
                op: "save", wallet: walletAddress, token: playerSessionToken,
                game_state: state, lifetime_earned: state.lifetimeEarned || 0,
                degen_level: state.degenLevel || 1, display_name: walletSolDomain || null,
            });
            if (!retry.error) { _saveFailureStreak = 0; return; }
            res.error = retry.error;
        }
    }

    console.error("[web3] cloud save rejected:", res.error);
    // "Too fast" is expected and harmless - two saves can race when a
    // manual action lands next to the 30s autosave tick. Never surface it.
    if (res.error === "saving_too_fast") return;
    // Everything else is worth telling the player about, but only once per
    // run of failures - the autosave fires every 30 seconds and a broken
    // connection would otherwise produce a toast forever.
    if (_saveFailureStreak++ === 0) {
        showToast("⚠️ Couldn't sync your progress to the cloud.", "error");
    }
}

/* ---------------- Live leaderboard ---------------- */

async function renderLeaderboard() {
    const box = document.getElementById("leaderboardBody");
    if (!box) return;
    if (!sb) {
        box.innerHTML = `<div class="text-gray-500 italic text-xs">Leaderboard not configured yet.</div>`;
        return;
    }
    // Reads the `leaderboard` VIEW, not the `players` table. The table is
    // sealed now; the view exposes only these four columns, so a public
    // leaderboard no longer means publicly readable save files.
    const { data, error } = await sb
        .from("leaderboard")
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

/* WHY THIS IS A POLL AND NOT A REALTIME SUBSCRIPTION ANY MORE.

   It used to be `.on("postgres_changes", { table: "players" })`. Realtime
   enforces RLS: it only delivers a change to a client that could have
   SELECTed the row itself. Now that the anon role has no read on
   `players`, that subscription would connect happily, report SUBSCRIBED,
   and then simply never fire - the worst kind of breakage, because it
   looks healthy. postgres_changes can't watch the `leaderboard` view
   either, so the honest replacement is a poll.

   It only runs while the modal is actually open, so it costs nothing the
   rest of the time. */
const LEADERBOARD_POLL_MS = 20000;
let leaderboardPollTimer = null;

function startLeaderboardPolling() {
    stopLeaderboardPolling();
    leaderboardPollTimer = setInterval(() => {
        const modal = document.getElementById("leaderboardModal");
        if (!modal || modal.classList.contains("hidden")) { stopLeaderboardPolling(); return; }
        renderLeaderboard();
    }, LEADERBOARD_POLL_MS);
}

function stopLeaderboardPolling() {
    if (leaderboardPollTimer) { clearInterval(leaderboardPollTimer); leaderboardPollTimer = null; }
}

function openLeaderboard() {
    document.getElementById("leaderboardModal")?.classList.remove("hidden");
    renderLeaderboard();
    startLeaderboardPolling();
}
function closeLeaderboard() {
    document.getElementById("leaderboardModal")?.classList.add("hidden");
    stopLeaderboardPolling(); // the poll checks this too, but stopping on
                              // close means no stray request after closing
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
    showToast(`Previewing: ${theme.label} (not a real ownership check)`, "info", theme.id === "skullx" ? pickRandomSkullXOrdinal() : null);
    if (theme.id === "mimwizard" && typeof enterWin95Desktop === "function") {
        enterWin95Desktop();
    }
    if (themeHasMusic(theme)) {
        // Same auto-start as the real-ownership path in applyTheme() -
        // TEST Play previewing a theme should get music starting too,
        // not just genuine holders. Shares themeHasMusic() with that path
        // on purpose, so the two can't drift apart again.
        document.getElementById("audioToggleBtn")?.classList.remove("hidden");
        if (typeof autoStartThemeMusicIfMuted === 'function') autoStartThemeMusicIfMuted();
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
    // Real access rule, not just "is the button visible": a genuine Mid
    // Evils/Conmen holder gets this in LIVE too, same as the McDonald's
    // popup checks (see _mcdEggBonusStageAvailable() in mcdonalds-egg.js)
    // - TEST Play users get it via the Theme Preview override applying
    // the same body classes. Hard-gating here (not just hiding the
    // button) closes off calling this directly from the console.
    const themeUnlocked = document.body.classList.contains('medieval-mode') || document.body.classList.contains('conmen-mode');
    if (!themeUnlocked) {
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
// Shared with fightgame.js (solo matches) and onlinelobby.js (online room
// creation/join, so both sides know which fighter you'll appear as before
// the match even starts). Single source of truth so a real Conmen holder
// looks like Conmen everywhere, not just in some paths and not others -
// this used to only special-case Wizard/Genuine Undead/Skull X and quietly
// defaulted every Mid Evils AND Conmen holder to the plain Reiffer look.
// Mid Evils has no separate character (Reiffer already IS the Mid Evils
// look), so it doesn't need its own branch here - only Conmen did.
// Skull X ordinal art for toasts - randomly picked so it's not the same
// piece every time. Purely cosmetic flourish, not tied to real ownership
// (Theme Preview already says as much in its own toast text).
const SKULLX_ORDINAL_IMAGES = [
    'assets/skullx_ordinals/skullx_aspectofthedeer.webp',
    'assets/skullx_ordinals/skullx_avernus.webp',
    'assets/skullx_ordinals/skullx_aviator.webp',
    'assets/skullx_ordinals/skullx_devout.webp',
    'assets/skullx_ordinals/skullx_fire.webp',
    'assets/skullx_ordinals/skullx_guardiansofthegateclan.webp',
    'assets/skullx_ordinals/skullx_hindudeities.webp',
    'assets/skullx_ordinals/skullx_hoodiepunk.webp',
    'assets/skullx_ordinals/skullx_kylanshellhound.webp',
    'assets/skullx_ordinals/skullx_pirateclan.webp',
    'assets/skullx_ordinals/skullx_plague_doctor.webp',
    'assets/skullx_ordinals/skullx_vampiric.webp',
    'assets/skullx_ordinals/skullx_wastelander.webp',
    'assets/skullx_ordinals/skullx_wildwestclan.webp',
    'assets/skullx_ordinals/skullx_zarathustracult.webp',
];
function pickRandomSkullXOrdinal() {
    return SKULLX_ORDINAL_IMAGES[Math.floor(Math.random() * SKULLX_ORDINAL_IMAGES.length)];
}

// Which character the player fights as. Every collection now gets its own.
//
// This used to read window.activePreviewThemeId for Skull X and Genuine
// Undead - and that variable is ONLY ever set by previewTheme(), the
// master-wallet TEST Play tool. The real-ownership path (applyTheme) never
// touches it. So both collections had complete sprite sets that looked
// correct in testing, while every genuine holder silently fought as
// Reiffer. Conmen and MIM Wizard were unaffected because they matched on a
// body class, which real holders actually get.
//
// Every theme is matched on its body class first now, with the preview id
// kept as a fallback. Theme Preview applies the class too, so the class
// check already covers it - the id lines are belt and braces.
//
// The class names deliberately don't all match their theme ids: Mid Evils'
// class is "medieval-mode", and MIM Wizard's is "win95-mode" (added by the
// Win95 desktop, since that theme has no cosmetic class of its own).
function getActiveFighterKey() {
    const c = document.body.classList;
    if (c.contains('win95-mode')) return 'wizard';
    if (c.contains('conmen-mode')) return 'conmen';
    if (c.contains('skullx-mode')) return 'skullx';
    if (c.contains('undead-mode')) return 'undead';
    // Mid Evils fights as Reiffer, the default - it needs no branch here,
    // it just falls through to the return below.
    if (window.activePreviewThemeId === 'genuineundead') return 'undead';
    if (window.activePreviewThemeId === 'skullx') return 'skullx';
    return 'reiffer';
}

function openFightGame() {
    // TEST Play only, EXCEPT for a real online match that's already been
    // through real ownership gating to get here (Mid Evils/Conmen holders,
    // see updateOnlineLobbyAccess() and onlinelobby.js) - this used to
    // block that path too with no exception, which would have silently
    // done nothing for every real holder the instant they got matched.
    const isRealOnlineMatch = !!window.fightClubOnlineActive;
    if ((typeof isTestPlayMode === 'undefined' || !isTestPlayMode) && !isRealOnlineMatch) return;
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
    // Online match cleanup lives here rather than only in onlinelobby.js so
    // ANY way of closing the fight game (Escape key, the in-game quit
    // button, a peer disconnecting) reliably tears the sync channel down -
    // a leftover open channel would otherwise bleed into the next match.
    if (typeof stopFightSync === 'function') stopFightSync();
    window.fightClubOnlineActive = false;
    window.fightClubOnlineRoomId = null;
    window.fightClubOnlineIsHost = false;
    window.fightClubOnlineFighters = null;
    window.fightClubOnlineArena = null;
}

/* ---------------- Debug menu: Fight Sync connectivity check ---------------- */
// Same idea as checkConnectivity() above, but for the actual per-match
// sync channel rather than general Supabase reachability - answers "is my
// connection to my current opponent actually alive right now" with real
// numbers instead of guesswork.
function checkFightSyncStatus() {
    const out = document.getElementById('fightSyncCheckResult');
    if (!out) return;
    if (typeof getFightSyncStatus !== 'function') { out.textContent = '❌ Sync module not loaded - check the <script> tag for js/onlinesync.js.'; return; }
    const s = getFightSyncStatus();
    if (!s.active) { out.textContent = 'Not in an online match right now - start or join a Fight Club room, then check.'; return; }
    const lines = [];
    lines.push(s.peerPresent ? '✅ Opponent present in the sync channel' : '⚠️ Channel open, but opponent not detected yet');
    lines.push(s.lastPingMs !== null ? `Round-trip to opponent: ${s.lastPingMs}ms` : 'No ping response yet');
    lines.push(s.msSinceLastRemoteInput !== null ? `Last input received from opponent: ${s.msSinceLastRemoteInput}ms ago` : 'No input received yet');
    lines.push(`Connected for: ${Math.round((s.connectedForMs || 0) / 1000)}s`);
    out.textContent = lines.join('\n');
}

/* ---------------- Init ---------------- */

document.addEventListener("DOMContentLoaded", () => {
    initSupabase();
    updateWalletUI();
});
