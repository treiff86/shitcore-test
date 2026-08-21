/* ============================================================
   NFT COLLECTION OWNERSHIP CHECK (via the sol-lookup proxy)
   ============================================================
   window.checkCollectionOwnership(walletAddress, collectionAddress)
   window.checkTokenHolding(walletAddress, mintAddress)
   window.checkTraitOwnership(walletAddress, collectionAddress, traitType, traitValue)
   -> true/false, never throws.

   Checks against the collection's VERIFIED on-chain collection
   address (Metaplex Certified Collection) - not name/symbol
   matching, which anyone could fake with a copycat collection.

   SECURITY: the Helius API key is deliberately NOT in this file any
   more. It used to sit here in plain sight, so anyone could lift it
   from DevTools and spend the quota - and because these checks fail
   CLOSED, an exhausted quota locks REAL holders out of their themes
   and trait rewards.

   These calls now go through the `sol-lookup` Supabase Edge Function,
   which holds the key server-side. That function is NOT a general RPC
   proxy: it accepts one of three fixed operations, validates both
   addresses as base58, builds the Helius request itself, and returns
   only a boolean. See supabase_sol_lookup.md.

   Still fails CLOSED on any error - the right default for access
   gating, where a network hiccup should never accidentally let someone
   through.
   ============================================================ */

const SOL_LOOKUP_FUNCTION = "sol-lookup";

// `sb` is declared with `let` in js/web3.js, so it sits in the temporal
// dead zone until that script executes - and `typeof` on a TDZ binding
// THROWS rather than returning "undefined". Hence the try/catch.
function _solLookupClient() {
    try {
        return (typeof sb !== 'undefined' && sb) ? sb : null;
    } catch (e) {
        return null;
    }
}

// Single call path for all three checks. Returns true/false, never throws.
async function _solLookup(payload, label) {
    const client = _solLookupClient();
    if (!client) {
        console.warn(`[nftgate] Supabase client not ready - cannot reach sol-lookup (${label})`);
        return false;
    }
    try {
        const { data, error } = await client.functions.invoke(SOL_LOOKUP_FUNCTION, { body: payload });
        if (error) {
            // Likely causes: the HELIUS_API_KEY secret not being set on the
            // function, the per-IP rate limit, or Helius itself being down.
            // All fail closed, exactly as the old direct fetch did.
            console.warn(`[nftgate] sol-lookup error (${label}):`, error.message || error);
            return false;
        }
        if (data && data.error) {
            console.warn(`[nftgate] sol-lookup rejected (${label}):`, data.error);
            return false;
        }
        const owns = !!(data && data.owns);
        console.log(`[nftgate] ${label} -> ${owns}${data && data.cached ? ' (server cache)' : ''}`);
        return owns;
    } catch (e) {
        console.error(`[nftgate] sol-lookup threw (${label}):`, e);
        return false;
    }
}

window.checkCollectionOwnership = async function (walletAddressStr, collectionAddress) {
    if (!walletAddressStr || !collectionAddress) return false; // never "pass" against an unset/blank collection
    return await _solLookup(
        { op: 'collection', wallet: walletAddressStr, target: collectionAddress },
        `collection ${String(collectionAddress).slice(0, 4)}...${String(collectionAddress).slice(-4)}`,
    );
};

window.checkTokenHolding = async function (walletAddressStr, mintAddress) {
    if (!walletAddressStr || !mintAddress) return false;
    return await _solLookup(
        { op: 'token', wallet: walletAddressStr, target: mintAddress },
        `token ${String(mintAddress).slice(0, 4)}...${String(mintAddress).slice(-4)}`,
    );
};

window.checkTraitOwnership = async function (walletAddressStr, collectionAddress, traitType, traitValue) {
    if (!walletAddressStr || !collectionAddress || !traitType || !traitValue) return false;
    // The trait comparison happens server-side inside the function, so the
    // browser only ever receives the yes/no - never the wallet's metadata.
    return await _solLookup(
        { op: 'trait', wallet: walletAddressStr, target: collectionAddress, traitType, traitValue },
        `trait ${traitType}=${traitValue}`,
    );
};
