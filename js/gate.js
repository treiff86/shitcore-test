/* ============================================================
   NFT GATE (Conmen + Mid Evils)
   ============================================================
   Full-game access gate: once enabled, only wallets holding a
   Conmen OR a Mid Evils NFT can play (holding either is enough -
   this is an "any of" check, not "both").

   DISABLED BY DEFAULT. Flipping GATING_ENABLED on locks out every
   wallet that doesn't hold one of the two collections below, so
   only turn it on when that's actually what you want.

     1. GATED_COLLECTIONS below already has both real, VERIFIED
        collection addresses (same ones used for the cosmetic
        themes in web3.js) - not a token/mint address for one
        individual NFT, the shared collection address all of
        them belong to.
     2. Set GATING_ENABLED = true.
     3. Bump the ?v= on this file's <script> tag in index.html so
        the change isn't served from cache.

   Until GATING_ENABLED is true, this file does nothing and the
   game plays exactly as it does today.
   ============================================================ */

const GATING_ENABLED = false;
const GATED_COLLECTIONS = [
    { label: "Conmen",    address: "9DqJWp9jF2M7F5Be8Sxs1GSJz7HZYVcyFgyMU9CBLmUQ" }, // verified via Solscan
    { label: "Mid Evils", address: "w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW" },  // verified via Solscan (MidEvil #3592's collection.key)
];

async function verifyAndEnterGame() {
    const btn = document.getElementById("gateVerifyBtn");
    const status = document.getElementById("gateStatus");
    btn.disabled = true;
    status.innerText = "Connecting wallet...";

    await connectWallet(); // reuses the existing, already-tested wallet connect flow from web3.js

    if (!walletAddress) {
        status.innerText = "Wallet connection was cancelled or failed. Try again.";
        btn.disabled = false;
        return;
    }

    status.innerText = "Verifying NFT ownership...";

    // "Any of" check - holding just one of the gated collections is enough.
    let owns = false;
    for (const { address } of GATED_COLLECTIONS) {
        if (await window.checkCollectionOwnership(walletAddress, address)) {
            owns = true;
            break;
        }
    }

    if (owns) {
        document.getElementById("gateOverlay").classList.add("hidden");
    } else {
        const names = GATED_COLLECTIONS.map(c => c.label).join(" or ");
        status.innerText = `This wallet doesn't hold a ${names}. Connect one that does, or grab one before playing.`;
        btn.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (!GATING_ENABLED) return; // gate never shows, game is fully playable exactly as before
    const missing = GATED_COLLECTIONS.filter(c => !c.address);
    if (missing.length) {
        console.warn(`[gate] GATING_ENABLED is true but these collections have no address set: ${missing.map(c => c.label).join(", ")}. Refusing to lock the game against an unset collection.`);
        return;
    }
    document.getElementById("gateOverlay")?.classList.remove("hidden");
    document.getElementById("gateVerifyBtn")?.addEventListener("click", verifyAndEnterGame);
});
