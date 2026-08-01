/* ============================================================
   .SOL DOMAIN LOOKUP (Solana Name Service, formerly Bonfida)
   ============================================================
   Loaded as a real ES module (type="module" in index.html) since
   it needs actual npm packages - unlike the rest of this codebase,
   which is plain classic <script> tags sharing one global scope.
   Modules don't share that scope, so this hands its result back
   to web3.js the only way it can: a function on `window`.

   Scans the connected wallet directly for any .sol domain(s) it
   owns, on-chain, via the official Bonfida/SNS SDK. (A previous
   version of this file tried SNS's "favorite domain" proxy API
   first, but that endpoint's exact input format couldn't be
   verified and it errored on real wallet addresses - dropped
   entirely rather than keep guessing at an unverifiable API.)

   RPC_ENDPOINTS is tried in order. Solana's own public endpoint
   (api.mainnet-beta.solana.com) actively 403s this kind of
   browser-origin traffic - confirmed, not in this list on purpose.
   If ALL of these end up unreliable for you, the properly durable
   fix is a free Helius API key (dashboard.helius.dev, no cost,
   takes a couple minutes) - swap RPC_ENDPOINTS for a single
   `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY` and this
   stops depending on shared public infrastructure at all.
   ============================================================ */

import { Connection, PublicKey } from "https://esm.sh/@solana/web3.js@1";
import { getAllDomains, performReverseLookup } from "https://esm.sh/@bonfida/spl-name-service@3";

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
            console.log(`[sns] ${rpcUrl} -> found ${domainKeys?.length || 0} domain(s) for this wallet`);
            if (!domainKeys || !domainKeys.length) return null; // reached the RPC fine, wallet just has none

            const names = await Promise.all(
                domainKeys.map((key) => performReverseLookup(connection, key).catch(() => null))
            );
            const first = names.find((n) => !!n);
            return first ? `${first}.sol` : null;
        } catch (e) {
            console.warn(`[sns] ${rpcUrl} failed, trying next endpoint if any:`, e);
        }
    }
    console.warn("[sns] all RPC endpoints failed - see the warnings above for each one's specific error.");
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
