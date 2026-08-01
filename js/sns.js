/* ============================================================
   .SOL DOMAIN LOOKUP (Solana Name Service, formerly Bonfida)
   ============================================================
   Loaded as a real ES module (type="module" in index.html) since
   it needs actual npm packages - unlike the rest of this codebase,
   which is plain classic <script> tags sharing one global scope.
   Modules don't share that scope, so this hands its result back
   to web3.js the only way it can: a function on `window`.

   Two-tier lookup:
   1. FAVORITE DOMAIN - SNS lets a wallet owner explicitly designate
      one of their domains as "the" one for their wallet (set via
      sns.id's own UI). This is the actually-correct answer to "which
      domain is attached to this wallet" when they own several, so we
      try this first via SNS's own public REST proxy - no RPC/SDK
      overhead needed for this path.
   2. FALLBACK - if no favorite is set (or the API call fails for any
      reason), fall back to grabbing any domain the wallet owns via
      the on-chain SDK, so something still shows instead of nothing.

   Uses Solana's free public RPC endpoint for the fallback path only -
   fine for occasional use, but rate-limited/can be flaky under load.
   If domains stop resolving reliably, swap SOLANA_RPC for a proper
   provider (Helius/QuickNode/etc, free tiers exist) - same code, just
   a different URL.
   ============================================================ */

import { Connection, PublicKey } from "https://esm.sh/@solana/web3.js@1";
import { getAllDomains, performReverseLookup } from "https://esm.sh/@bonfida/spl-name-service@3";

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const SNS_PROXY = "https://sdk-proxy.sns.id";
const connection = new Connection(SOLANA_RPC);

function normalizeDomain(raw) {
    if (!raw) return null;
    const name = typeof raw === "string" ? raw : (raw.domain || raw.favoriteDomain || raw.name || null);
    if (!name) return null;
    return name.endsWith(".sol") ? name : `${name}.sol`;
}

async function getFavoriteDomain(walletAddressStr) {
    try {
        const res = await fetch(`${SNS_PROXY}/favorite-domain/${walletAddressStr}`);
        if (!res.ok) {
            console.warn(`[sns] favorite-domain lookup returned HTTP ${res.status}, falling back.`);
            return null;
        }
        const data = await res.json();
        const domain = normalizeDomain(data);
        if (!domain) console.warn("[sns] favorite-domain response had no recognizable domain (owner likely hasn't set one), falling back.");
        return domain;
    } catch (e) {
        console.warn("[sns] favorite-domain lookup failed (network or API issue), falling back:", e);
        return null;
    }
}

async function getAnyDomain(walletAddressStr) {
    try {
        const owner = new PublicKey(walletAddressStr);
        const domainKeys = await getAllDomains(connection, owner);
        if (!domainKeys || !domainKeys.length) return null;

        const names = await Promise.all(
            domainKeys.map((key) => performReverseLookup(connection, key).catch(() => null))
        );
        const first = names.find((n) => !!n);
        return first ? `${first}.sol` : null;
    } catch (e) {
        console.warn("[sns] fallback domain lookup failed:", e);
        return null;
    }
}

/**
 * Returns the wallet's favorite/primary .sol domain if they've set one,
 * otherwise any domain they own, otherwise null. Never throws.
 */
window.lookupSolDomain = async function (walletAddressStr) {
    const favorite = await getFavoriteDomain(walletAddressStr);
    if (favorite) return favorite;
    return await getAnyDomain(walletAddressStr);
};
