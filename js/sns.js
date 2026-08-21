/* ============================================================
   .SOL DOMAIN LOOKUP (Solana Name Service, formerly Bonfida)
   ============================================================
   Loaded as a real ES module (type="module" in index.html) since
   it needs actual npm packages - unlike the rest of this codebase,
   which is plain classic <script> tags sharing one global scope.
   Modules don't share that scope, so this hands its result back
   to web3.js the only way it can: a function on `window`.

   Scans the connected wallet directly for any .sol domain(s) it
   owns, on-chain, via the official Bonfida/SNS SDK.

   RPC SETUP - free public endpoints have proven unreliable enough
   in testing (one blocks browser traffic outright, one now requires
   a paid key, one hits SSL errors) that this now expects a real,
   free Helius API key instead of gambling on shared infrastructure:

     1. Sign up free at https://dashboard.helius.dev (no cost)
     2. Copy your API key
     3. Paste it into HELIUS_API_KEY below

   Until that's filled in, this falls back to the same public
   endpoints as before - they may or may not work depending on your
   network/browser, which is exactly the unreliability a real key
   avoids.
   ============================================================ */

// Pinned to exact versions. These were floating on "@1" and "@3", which
// meant esm.sh could inject brand-new third-party code into this page at
// any time. This is the single most sensitive place in the app for that:
// it runs on the page where wallets connect, so anything executing here can
// reach window.solana and ask the user to sign. Exact pins mean these bytes
// only change when we change them. (Versions below are what the old
// floating ranges already resolved to, so behaviour is unchanged today.)
import { Connection, PublicKey } from "https://esm.sh/@solana/web3.js@1.98.4";
import { getAllDomains, performReverseLookup } from "https://esm.sh/@bonfida/spl-name-service@3.0.26";

/* SECURITY: the Helius key used to live here, and unlike js/nftgate.js
   this file could NOT simply be put behind a proxy. The reason is
   structural: it hands an RPC URL to @solana/web3.js and lets the Bonfida
   library drive it, so it needs a GENERAL Solana RPC endpoint - and a
   general RPC proxy open to the internet would be strictly worse than the
   exposed key it replaced (same quota drain, but anonymous).

   So Helius is dropped here instead. This file only resolves a cosmetic
   ".sol" display name: it gates nothing, grants nothing, and failing just
   means a wallet shows as "AbCd...WxYz". The public endpoints below were
   already present as fallbacks and are fine for that.

   Real ownership checks (themes, trait rewards) live in js/nftgate.js and
   DO go through the key-protected sol-lookup proxy. */
const RPC_ENDPOINTS = [
    "https://rpc.ankr.com/solana",
    "https://solana-rpc.publicnode.com",
];

async function getAnyDomain(walletAddressStr) {
    const owner = new PublicKey(walletAddressStr);

    for (const rpcUrl of RPC_ENDPOINTS) {
        try {
            const connection = new Connection(rpcUrl);
            const domainKeys = await getAllDomains(connection, owner);
            console.log(`[sns] ${rpcUrl.split("?")[0]} -> found ${domainKeys?.length || 0} domain(s) for this wallet`);
            if (!domainKeys || !domainKeys.length) return null; // reached the RPC fine, wallet just has none

            const names = await Promise.all(
                domainKeys.map((key) => performReverseLookup(connection, key).catch(() => null))
            );
            const first = names.find((n) => !!n);
            return first ? `${first}.sol` : null;
        } catch (e) {
            console.warn(`[sns] ${rpcUrl.split("?")[0]} failed, trying next endpoint if any:`, e);
        }
    }
    console.warn("[sns] all RPC endpoints failed - see the warnings above for each one's specific error.");
    if (!HELIUS_API_KEY) console.warn("[sns] HELIUS_API_KEY is empty - fill that in for a reliable connection instead of depending on public endpoints.");
    return null;
}

/**
 * Returns any .sol domain the wallet owns, or null if it has none /
 * every RPC attempt failed. Never throws.
 */
window.lookupSolDomain = async function (walletAddressStr) {
    try {
        return await getAnyDomain(walletAddressStr);
    } catch (e) {
        console.warn("[sns] domain lookup failed unexpectedly:", e);
        return null;
    }
};
