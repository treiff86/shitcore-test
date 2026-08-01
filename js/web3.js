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
const DOOPIES_COLLECTION_ADDRESS = ""; // real verified collection address - blank = rainbow mode never triggers, purely cosmetic either way

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

/* ---------------- Wallet connect (Phantom) ---------------- */

function getPhantomProvider() {
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solana?.isPhantom) return window.solana;
    return null;
}

async function connectWallet() {
    const provider = getPhantomProvider();
    if (!provider) {
        showToast("No Solana wallet found - install Phantom (or similar) to connect.", "error");
        window.open("https://phantom.app/", "_blank");
        return;
    }
    try {
        const resp = await provider.connect(); // read-only: just asks for the public address
        walletAddress = resp.publicKey.toString();
        updateWalletUI();
        showToast(`🔗 Wallet connected: ${shortAddr(walletAddress)}`, "success");

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

        // Doopie holder check - purely cosmetic, never blocks anything. Blank
        // collection address by default; fill in DOOPIES_COLLECTION_ADDRESS
        // once you have a real one to check against.
        if (typeof window.checkCollectionOwnership === "function" && DOOPIES_COLLECTION_ADDRESS) {
            window.checkCollectionOwnership(walletAddress, DOOPIES_COLLECTION_ADDRESS).then((owns) => {
                if (owns) {
                    document.body.classList.add("rainbow-mode");
                    showToast("🌈 Doopie detected! Rainbow mode activated.", "success");
                }
            });
        }

        await offerCloudLoadIfExists();
    } catch (e) {
        if (e?.code === 4001) return; // user closed the connect popup - not an error
        console.error("[web3] connect failed:", e);
        showToast("Wallet connection failed or was rejected.", "error");
    }
}

function disconnectWallet() {
    const provider = getPhantomProvider();
    if (provider?.disconnect) provider.disconnect();
    walletAddress = null;
    walletSolDomain = null;
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

/* ---------------- Cloud save / load ---------------- */

async function offerCloudLoadIfExists() {
    if (!sb || !walletAddress) return;
    const { data, error } = await sb
        .from("players")
        .select("game_state, updated_at")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

    if (error) { console.error("[web3] load check failed:", error); return; }
    if (!data) { await saveToCloud(); return; } // first time this wallet's been seen - create its row

    const when = new Date(data.updated_at).toLocaleString();
    if (confirm(`Found a cloud save for this wallet from ${when}. Load it? (Cancel keeps your current local progress and overwrites the cloud save with it instead.)`)) {
        state = { ...defaultState, ...data.game_state };
        saveGame();     // keep localStorage in sync too
        updateUI();
        showToast("☁️ Cloud save loaded.", "success");
    } else {
        await saveToCloud();
    }
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

/* ---------------- Init ---------------- */

document.addEventListener("DOMContentLoaded", () => {
    initSupabase();
    updateWalletUI();
});
