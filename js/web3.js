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
const COSMETIC_THEMES = [
    {
        id: "doopies",
        label: "Doopies - Rainbow",
        collectionAddress: "7ifrcfFwVLBUKCo8smEK44npokR1xK8KHopRV98Moj8f", // verified via Solscan
        cssClass: "rainbow-mode",
        toastMsg: "🌈 Doopie detected! Rainbow mode activated.",
    },
    {
        id: "midevils",
        label: "Mid Evils - Medieval",
        collectionAddress: "w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW", // verified via Solscan (MidEvil #3592's collection.key)
        cssClass: "medieval-mode",
        toastMsg: "🏰 Mid Evil detected! The realm grows old.",
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
    COSMETIC_THEMES.forEach((t) => document.body.classList.remove(t.cssClass));
}

async function applyCosmeticThemes(addr) {
    if (typeof window.checkCollectionOwnership !== "function") return;
    for (const theme of COSMETIC_THEMES) {
        if (!theme.collectionAddress) continue;
        const owns = await window.checkCollectionOwnership(addr, theme.collectionAddress);
        if (owns) {
            clearCosmeticThemes();
            document.body.classList.add(theme.cssClass);
            showToast(theme.toastMsg, "success");
            if (theme.id === "midevils") {
                document.getElementById("bonusStageBtn")?.classList.remove("hidden");
            }
            return; // first match wins, these don't stack
        }
    }
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

        // Real holder detection - checks every theme in COSMETIC_THEMES
        applyCosmeticThemes(walletAddress);

        // Master wallet gets the preview panel, in addition to (not instead
        // of) normal real-ownership detection above
        if (walletAddress === MASTER_WALLET) {
            document.getElementById("themePreviewBtn")?.classList.remove("hidden");
            document.getElementById("bonusStageBtn")?.classList.remove("hidden");
            openThemePreview();
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
    document.getElementById("themePreviewBtn")?.classList.add("hidden");
    document.getElementById("bonusStageBtn")?.classList.add("hidden");
    updateWalletUI();
    showToast("Wallet disconnected. Still playing locally.", "info");
}

function shortAddr(addr) {
    return addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : "";
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
        saveGame(); // keep localStorage in sync immediately, cloud save happens right after this in offerCloudLoadIfExists
        updateUI();
    }
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
        await saveToCloud();
        return;
    }

    const when = new Date(data.updated_at).toLocaleString();
    if (confirm(`Found a cloud save for this wallet from ${when}. Load it? (Cancel keeps your current local progress and overwrites the cloud save with it instead.)`)) {
        state = { ...defaultState, ...data.game_state };
        saveGame();     // keep localStorage in sync too
        updateUI();
        showToast("☁️ Cloud save loaded.", "success");
    } else {
        await saveToCloud();
    }
    await applyTraitRewards(walletAddress, false); // existing save - can still earn permanent perks (e.g. luck), no cash bonus though
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
        .order("lifetime_earned", { ascending: false })
        .limit(25);

    if (error) { box.innerHTML = `<div class="text-rose-400 text-xs">Couldn't load leaderboard.</div>`; return; }
    if (!data.length) { box.innerHTML = `<div class="text-gray-500 italic text-xs">Nobody's on the board yet. Be the first degen.</div>`; return; }

    box.innerHTML = data.map((row, i) => `
        <div class="flex justify-between items-center text-[11px] border-b border-[#1A2232] py-1.5 ${row.wallet_address === walletAddress ? "text-amber-400" : "text-gray-300"}">
            <span>#${i + 1} <strong>${row.display_name || shortAddr(row.wallet_address)}</strong> ${row.wallet_address === walletAddress ? "(you)" : ""}</span>
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
    clearCosmeticThemes();
    if (!themeId) {
        showToast("Preview reset to normal.", "info");
        return;
    }
    const theme = COSMETIC_THEMES.find((t) => t.id === themeId);
    if (!theme) return;
    document.body.classList.add(theme.cssClass);
    showToast(`Previewing: ${theme.label} (not a real ownership check)`, "info");
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

/* ---------------- Init ---------------- */

document.addEventListener("DOMContentLoaded", () => {
    initSupabase();
    updateWalletUI();
});
