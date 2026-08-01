/* ============================================================
   NFT COLLECTION OWNERSHIP CHECK (Helius DAS API)
   ============================================================
   Loaded as a real ES module (type="module") for the same reason
   as sns.js - reuses the same Helius key already set up there.

   window.checkCollectionOwnership(walletAddress, collectionAddress)
   -> true/false, never throws.

   Checks against the collection's VERIFIED on-chain collection
   address (Metaplex Certified Collection) - not name/symbol
   matching, which anyone could fake with a copycat collection.
   Get the real collection address from your mint's Candy
   Machine / collection NFT once it exists - a marketplace page
   (Magic Eden/Tensor) for the collection will also show it.

   Fails CLOSED (returns false) on any error - the right default
   for access gating, where a network hiccup should never
   accidentally let someone through. For purely cosmetic checks
   (not security-relevant) failing closed just means the cosmetic
   doesn't show, which is a fine, low-stakes default either way.
   ============================================================ */

const HELIUS_API_KEY = "9c094b2b-cfdb-4fb9-b7e5-78c46d88066c"; // same key as sns.js
const HELIUS_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

window.checkCollectionOwnership = async function (walletAddressStr, collectionAddress) {
    if (!walletAddressStr || !collectionAddress) return false; // never "pass" against an unset/blank collection

    try {
        const res = await fetch(HELIUS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "collection-gate-check",
                method: "searchAssets",
                params: {
                    ownerAddress: walletAddressStr,
                    grouping: ["collection", collectionAddress],
                    page: 1,
                    limit: 1,
                },
            }),
        });

        if (!res.ok) {
            console.warn(`[nftgate] Helius returned HTTP ${res.status} checking collection ${collectionAddress}`);
            return false;
        }

        const data = await res.json();
        if (data.error) {
            console.warn("[nftgate] Helius API error:", data.error);
            return false;
        }

        const count = data?.result?.total ?? (data?.result?.items?.length || 0);
        console.log(`[nftgate] ${walletAddressStr.slice(0,4)}...${walletAddressStr.slice(-4)} owns ${count} asset(s) from collection ${collectionAddress.slice(0,4)}...${collectionAddress.slice(-4)}`);
        return count > 0;
    } catch (e) {
        console.warn("[nftgate] ownership check failed:", e);
        return false;
    }
};
