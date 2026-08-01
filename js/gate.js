/* ============================================================
   CONMEN NFT GATE
   ============================================================
   Full-game access gate: once enabled, only wallets holding a
   Conmen NFT can play.

   DISABLED BY DEFAULT, ON PURPOSE. The Conmen collection doesn't
   exist yet (minting Aug 5) - flipping GATING_ENABLED on before
   then would lock out every current player against a collection
   address that isn't real yet. After the mint:

     1. Set CONMEN_COLLECTION_ADDRESS below to the real, VERIFIED
        collection address (visible on the mint's Magic Eden/
        Tensor listing, or in your Candy Machine config) - not
        a token/mint address for one individual NFT, the shared
        collection address all of them belong to.
     2. Set GATING_ENABLED = true.
     3. Bump the ?v= on this file's <script> tag in index.html so
        the change isn't served from cache.

   Until both are set, this file does nothing and the game plays
   exactly as it does today.
   ============================================================ */

const GATING_ENABLED = false;
const CONMEN_COLLECTION_ADDRESS = ""; // fill in after the Aug 5 mint

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

    status.innerText = "Verifying Conmen ownership...";
    const owns = await window.checkCollectionOwnership(walletAddress, CONMEN_COLLECTION_ADDRESS);

    if (owns) {
        document.getElementById("gateOverlay").classList.add("hidden");
    } else {
        status.innerText = "This wallet doesn't hold a Conmen. Connect one that does, or grab one before playing.";
        btn.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (!GATING_ENABLED) return; // gate never shows, game is fully playable exactly as before
    if (!CONMEN_COLLECTION_ADDRESS) {
        console.warn("[gate] GATING_ENABLED is true but CONMEN_COLLECTION_ADDRESS is blank - refusing to lock the game against nothing. Fill in the collection address first.");
        return;
    }
    document.getElementById("gateOverlay")?.classList.remove("hidden");
    document.getElementById("gateVerifyBtn")?.addEventListener("click", verifyAndEnterGame);
});
