/* ============================================================
   .SOL DOMAIN LOOKUP (Solana Name Service, formerly Bonfida)
   ============================================================
   Loaded as a real ES module (type="module" in index.html) since
   it needs actual npm packages - unlike the rest of this codebase,
   which is plain classic <script> tags sharing one global scope.
   Modules don't share that scope, so this hands its result back
   to web3.js the only way it can: a function on `window`.

   Uses Solana's free public RPC endpoint - fine for one lookup per
   wallet connect, but it's rate-limited and can be slow/flaky under
   load. If .sol names start failing to resolve for real users, swap
   SOLANA_RPC for a proper provider (Helius/QuickNode/etc, free tiers
   exist) - same code, just a different URL.
   ============================================================ */

import { Connection, PublicKey } from "https://esm.sh/@solana/web3.js@1";
import { getAllDomains, performReverseLookup } from "https://esm.sh/@bonfida/spl-name-service@3";

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const connection = new Connection(SOLANA_RPC);

/**
 * Returns the wallet's primary .sol domain name (e.g. "degen.sol"),
 * or null if it has none / the lookup fails. Never throws.
 */
window.lookupSolDomain = async function (walletAddressStr) {
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
        console.warn("[sns] domain lookup failed (non-fatal, falling back to shortened address):", e);
        return null;
    }
};
