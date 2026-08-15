/* ============================================================
   BITCOIN WALLET CONNECTION (Xverse + UniSat)
   ============================================================
   Completely separate from the Solana/Phantom flow in web3.js -
   Bitcoin wallets don't plug into that code at all. Exposes
   window.btcWalletAddress (the ORDINALS/taproot address, which is
   what actually holds inscriptions - not the payment address)
   once connected, plus ownership-check helpers for specific
   collections/parents.

   Uses each wallet's OWN api to list what it holds (Xverse's
   ord_getInscriptions, UniSat's getInscriptions) rather than a
   separate paid indexer - the wallet already knows what it owns.
   Hiro's Ordinals API is NOT used here since it was deprecated
   March 2026 in favor of wallet-native/Xverse endpoints.

   First-pass implementation, not yet tested against real Xverse/
   UniSat wallets - expect some real-world debugging once you
   actually click through it with a real wallet installed.
   ============================================================ */

let btcWalletAddress = null;   // ordinals (taproot) address, once connected
let btcWalletProvider = null;  // 'xverse' | 'unisat'

function getXverseProvider() {
    return window.XverseProviders?.BitcoinProvider || window.BitcoinProvider || null;
}

async function connectXverse() {
    if (typeof walletAddress !== 'undefined' && walletAddress) {
        if (typeof showToast === 'function') showToast("Only one wallet at a time - disconnect your Solana wallet first.", "error");
        return;
    }
    const provider = getXverseProvider();
    if (!provider) {
        if (typeof showToast === 'function') showToast('Xverse not detected - install the extension first.', 'error');
        window.open('https://www.xverse.app/', '_blank');
        return;
    }

    // Pulls the ordinals-purpose address out of whatever shape Xverse
    // actually responds with - seen it come back as res.result (array),
    // res.result.addresses (nested), and plain res (array) depending on
    // extension state, so this checks all of them instead of assuming one.
    const extractOrdinalsAddress = (res) => {
        const accounts = res?.result?.addresses || res?.result || res?.addresses || res || [];
        const list = Array.isArray(accounts) ? accounts : [];
        return list.find(a => a?.purpose === 'ordinals')?.address || null;
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await provider.request('getAccounts', { purposes: ['ordinals', 'payment'] });
            const address = extractOrdinalsAddress(res);
            if (address) {
                btcWalletAddress = address;
                btcWalletProvider = 'xverse';
                onBitcoinWalletConnected();
                return;
            }
            throw new Error('No ordinals address in response');
        } catch (e) {
            console.error(`[btcwallet] Xverse connect attempt ${attempt} failed:`, e);
            if (attempt === 1) {
                // Right after a disconnect/reconnect, the extension can
                // occasionally answer before it's fully ready - one short
                // pause and a second try clears this most of the time.
                await new Promise(r => setTimeout(r, 600));
                continue;
            }
            if (typeof showToast === 'function') showToast("Couldn't connect Xverse - try again.", 'error');
        }
    }
}

async function connectUnisat() {
    if (typeof walletAddress !== 'undefined' && walletAddress) {
        if (typeof showToast === 'function') showToast("Only one wallet at a time - disconnect your Solana wallet first.", "error");
        return;
    }
    if (typeof window.unisat === 'undefined') {
        if (typeof showToast === 'function') showToast('UniSat not detected - install the extension first.', 'error');
        window.open('https://unisat.io/', '_blank');
        return;
    }
    try {
        const accounts = await window.unisat.requestAccounts();
        if (!accounts || !accounts[0]) throw new Error('No account in response');
        btcWalletAddress = accounts[0];
        btcWalletProvider = 'unisat';
        onBitcoinWalletConnected();
    } catch (e) {
        console.error('[btcwallet] UniSat connect failed:', e);
        if (typeof showToast === 'function') showToast("Couldn't connect UniSat - try again.", 'error');
    }
}

function onBitcoinWalletConnected() {
    if (typeof showToast === 'function') {
        showToast(`🟠 Bitcoin wallet connected: ${btcWalletAddress.slice(0, 6)}...${btcWalletAddress.slice(-4)}`, 'success');
    }
    const disp = document.getElementById('btcWalletAddressText');
    if (disp) disp.textContent = `${btcWalletAddress.slice(0, 6)}...${btcWalletAddress.slice(-4)}`;
    document.getElementById('btcWalletDisplay')?.classList.remove('hidden');
    document.getElementById('btcWalletConnectBtn')?.classList.add('hidden');
    document.getElementById('walletConnectBtn')?.classList.add('hidden'); // only one wallet active at a time - no point showing a button that'll just error if clicked

    // Re-check gated cosmetic themes now that a Bitcoin wallet is
    // available too - shows the same "Choose Your Theme" picker as the
    // Solana side if this wallet turns out to hold more than one gated
    // thing (e.g. Skull X + Bitcoin Wizards), instead of silently
    // picking one for them.
    if (typeof applyCosmeticThemes === 'function') {
        applyCosmeticThemes(btcWalletAddress, true);
    }
}

function disconnectBitcoinWallet() {
    btcWalletAddress = null;
    btcWalletProvider = null;
    document.getElementById('btcWalletDisplay')?.classList.add('hidden');
    document.getElementById('btcWalletConnectBtn')?.classList.remove('hidden');
    document.getElementById('walletConnectBtn')?.classList.remove('hidden');
    if (typeof applyCosmeticThemes === 'function' && typeof walletAddress !== 'undefined') {
        applyCosmeticThemes(walletAddress, false);
    }
}

/* ---------------- Inscription / ownership checks ---------------- */

// Pulls the CONNECTED wallet's own inscriptions directly from the wallet
// itself - no separate indexer or API key needed, the wallet already
// knows what it holds. Field names differ slightly between wallets, so
// callers should check multiple possible field names (see below).
async function getMyInscriptions() {
    if (!btcWalletAddress || !btcWalletProvider) return [];
    try {
        if (btcWalletProvider === 'xverse') {
            const provider = getXverseProvider();
            const res = await provider.request('ord_getInscriptions', { limit: 100, offset: 0 });
            return res?.result?.inscriptions || res?.inscriptions || [];
        }
        if (btcWalletProvider === 'unisat') {
            const res = await window.unisat.getInscriptions(0, 100);
            return res?.list || [];
        }
    } catch (e) {
        console.warn('[btcwallet] getMyInscriptions failed:', e);
    }
    return [];
}

// Skull X's real on-chain parent structure, confirmed directly (not
// guessed) from browsing an actual marketplace's parent/child data:
//
// #22593457 is the MASTER parent for the entire Skull X universe - it's
// listed as the parent of the Cursed Raiders, Cyber Raiders, and Hell
// Raiders gallery groupings, several sub-parents, AND (confirmed
// separately) as one of Infinite's own 2 direct parents. This one
// parent number is likely enough to catch most/all Skull X holders on
// its own, regardless of which specific gallery they hold.
//
// #60983386 is specifically the SKULLX ORIGINS parent (also one of
// Infinite's 2 direct parents) - kept as a second check in case some
// pieces list it without the master parent for whatever reason.
//
// This REPLACES the earlier unverified guess (63994951 / a candidate ID
// pulled from a CoinMarketCap listing), which turned out to be wrong -
// that's why real holders weren't being recognized before this fix.
const SKULLX_KNOWN_PARENT_NUMBERS = [22593457, 60983386];
const SKULLX_ORIGINS_PARENT_ID_CANDIDATE = '666da210350e1d444a69bb9df97e9dc2338fbfb78534c6251f56f275e75b6666i0'; // long-form ID confirmed for #60983386 specifically - no long-form ID confirmed yet for the master #22593457

// All 5 Skull X galleries count toward the same "Skull X" status - one
// unified check, holding any single one unlocks it, not tracked as
// separate tiers. Slugs are Ordiscan's OWN collection identifiers, which
// don't necessarily match ord.net's, Magic Eden's, or OpenSea's slug for
// the same collection - each needs independently confirming against
// Ordiscan itself (ordiscan.com/collection/<slug>, or a real holder's
// connected-wallet console output) the same way bitcoin-wizards was.
//
// Cyber Raider is worth calling out specifically: it originally minted
// on ETHEREUM with a burn-to-redeem flow for the actual Bitcoin Ordinal
// (see OpenSea/Superful listings) - checking here is intentionally the
// BTC Ordinal side only, same as every other gallery, so only wallets
// that actually completed the redemption will pass. There's no ETH-side
// check anywhere in this codebase and there isn't meant to be one.
//
// Status of each slug below: "infinite" and "cyber-raiders" are
// reasonable candidates from web search (ord.net and Magic Eden
// respectively) but NEITHER has been independently confirmed against
// Ordiscan's own site yet - kept only as a belt-and-suspenders backup
// now that the master parent number above should already cover every
// gallery on its own.
const SKULLX_GALLERY_SLUGS = [
    "skullx_infinite",       // candidate from ord.net - not yet confirmed against Ordiscan directly
    "skullx-cyber-raiders",  // candidate from Magic Eden - not yet confirmed against Ordiscan directly
];

window.checkSkullXOrigins = async function () {
    // Primary check: real on-chain parent inscription. Checks EVERY
    // parent an inscription has, not just the first - Infinite pieces
    // specifically have 2 parents, and the master parent isn't
    // guaranteed to be first in the array. IMPORTANT: per Xverse's own
    // documented ord_getInscriptions schema, there is NO
    // parentInscriptionNumber field at all - only parentInscriptionId
    // (long-form). The earlier number-based check was silently
    // comparing against a field that Xverse never sends, so it could
    // never have matched anything through Xverse specifically, no
    // matter how correct the number itself was.
    const inscriptions = await getMyInscriptions();
    console.log('[btcwallet] Inscriptions seen for Skull X check:', inscriptions);
    console.log('[btcwallet] Compact summary of all inscriptions (number | contentType | collectionName | has parent field):');
    inscriptions.forEach((i, idx) => {
        const hasParent = !!(i.parentInscriptionId || i.parent || (Array.isArray(i.parents) && i.parents.length));
        console.log(`  [${idx}] #${i.inscriptionNumber} | ${i.contentType || '?'} | collectionName="${i.collectionName || ''}" | hasParent=${hasParent}`);
    });
    // Full dump specifically of inscriptions that look like real image-
    // based NFTs (not tiny text/plain inscriptions like BRC-20 transfers
    // or rune etchings) - these are the ones actually worth inspecting
    // for Skull X's real parent/collection data, since item [0] earlier
    // turned out to be an unrelated 51-byte text inscription.
    const likelyNFTs = inscriptions.filter(i => i.contentType && !i.contentType.startsWith('text/'));
    console.log(`[btcwallet] ${likelyNFTs.length} inscriptions that look like image/NFT content (not plain text):`,
        JSON.stringify(likelyNFTs, null, 2));
    const hasKnownParent = inscriptions.some(i => {
        const parentIds = [];
        if (i.parentInscriptionId) parentIds.push(i.parentInscriptionId);
        if (i.parent) parentIds.push(i.parent);
        if (Array.isArray(i.parents)) parentIds.push(...i.parents);
        if (parentIds.includes(SKULLX_ORIGINS_PARENT_ID_CANDIDATE)) return true;
        // collectionName is a real field Xverse documents directly on
        // each inscription - cheap extra check, no separate API call.
        if (i.collectionName && /skull\s*x/i.test(i.collectionName)) return true;
        return false;
    });
    if (hasKnownParent) return true;

    // Ordiscan's own parent_inscription_id data - the check that can
    // actually work, since Ordiscan's inscriptions endpoint includes
    // real parent data that Xverse's wallet API never provides at all.
    if (await checkOrdiscanSkullXParent()) return true;

    // Last resort: Ordiscan's collection tagging by slug - confirmed via
    // direct testing that Ordiscan doesn't have Skull X registered under
    // ANY slug for this wallet's actual holdings (only "dose" and
    // "airhead" showed up, both unrelated), so this is unlikely to ever
    // match for Skull X specifically, but it's what confirmed Bitcoin
    // Wizards, so kept in case it's registered for some other wallet.
    for (const slug of SKULLX_GALLERY_SLUGS) {
        if (await checkOrdiscanCollection(slug)) return true;
    }

    return false;
};

/* ============================================================
   ORDISCAN API — collections by slug + rune balances
   ============================================================
   Separate from the wallet-native checks above. Needed for two
   things the wallet's own API can't do: (1) recognize "Gallery"
   groupings like Bitcoin Wizards and most of Skull X, which
   aren't true on-chain parent-child so ord_getInscriptions can't
   see them, and (2) check Rune balances (a different asset type
   than inscriptions entirely). Requires a free API key from
   ordiscan.com.
   ============================================================ */

const ORDISCAN_API_KEY = "abe0d88c-74bd-4828-8f8b-ed7b66efafd7";
const ORDISCAN_BASE = "https://api.ordiscan.com/v1";

async function ordiscanFetch(path) {
    console.log(`[btcwallet] Ordiscan request starting: ${path}`);
    try {
        const res = await fetch(`${ORDISCAN_BASE}${path}`, {
            headers: { Authorization: `Bearer ${ORDISCAN_API_KEY}` },
        });
        console.log(`[btcwallet] Ordiscan responded: HTTP ${res.status} for ${path}`);
        if (!res.ok) {
            console.warn(`[btcwallet] Ordiscan returned HTTP ${res.status} for ${path}`);
            return null;
        }
        const json = await res.json();
        // Ordiscan wraps every list response in a {data: [...]} envelope
        // rather than returning the array directly - unwrap it here, once,
        // so every caller can just treat the result as the array it
        // actually wants. This was THE bug: every check below was doing
        // Array.isArray() on the whole {data: [...]} object, which is
        // always false, so every single check silently bailed out before
        // ever looking at a single real item - regardless of whether the
        // wallet actually held the thing being checked for.
        const unwrapped = Array.isArray(json?.data) ? json.data : json;
        console.log(`[btcwallet] Ordiscan response for ${path} - ${Array.isArray(unwrapped) ? unwrapped.length + ' items' : 'not an array'}:`, JSON.stringify(unwrapped).slice(0, 2000));
        return unwrapped;
    } catch (e) {
        // If this fires with a generic "Failed to fetch" / TypeError and
        // no HTTP status ever logged above, that's the signature of a
        // CORS block or network-level failure - the request never
        // actually reached Ordiscan's server at all, browser blocked it
        // client-side before it could.
        console.error(`[btcwallet] Ordiscan request FAILED before getting any HTTP response for ${path} (likely CORS or network-level, not an API error):`, e);
        return null;
    }
}

// Checks the connected BTC wallet's own inscriptions (via Ordiscan, which
// includes each one's collection_slug) for a match against the given
// collection slug. Works for "Gallery"-style groupings that the wallet's
// own API can't see, as long as Ordiscan has that collection indexed
// under this exact slug.
async function checkOrdiscanCollection(slug) {
    if (!btcWalletAddress) return false;
    const data = await ordiscanFetch(`/address/${btcWalletAddress}/inscriptions`);
    if (!Array.isArray(data)) {
        console.log(`[btcwallet] Ordiscan collection check for "${slug}": no usable data returned, treating as not owned`);
        return false;
    }
    const slugsSeen = [...new Set(data.map(i => i.collection_slug).filter(Boolean))];
    console.log(`[btcwallet] Ordiscan collection check for "${slug}": ${data.length} inscriptions returned, collection_slug values actually present: ${JSON.stringify(slugsSeen)}`);
    return data.some(i => i.collection_slug === slug);
}

// Skull X specifically, checked via Ordiscan's real parent_inscription_id
// field - a field Xverse's own wallet API never returns at all (confirmed
// by direct testing), so this is the one place this check can actually
// work. Same known parent numbers/ID as the (currently unused, since
// Xverse can't supply this data) SKULLX_KNOWN_PARENT_NUMBERS above.
async function checkOrdiscanSkullXParent() {
    if (!btcWalletAddress) return false;
    const data = await ordiscanFetch(`/address/${btcWalletAddress}/inscriptions`);
    if (!Array.isArray(data)) {
        console.log('[btcwallet] Ordiscan Skull X parent check: no usable data returned, treating as not owned');
        return false;
    }
    const parentIdsSeen = [...new Set(data.map(i => i.parent_inscription_id).filter(Boolean))];
    console.log(`[btcwallet] Ordiscan Skull X parent check: ${data.length} inscriptions returned, parent_inscription_id values actually present: ${JSON.stringify(parentIdsSeen)}`);
    // Skull X galleries don't share ONE parent ID - real data confirmed at
    // least 8 distinct ones, but every single one follows the same
    // consistent branded shape: starts with "666" and ends with
    // "666i<digit>". Matching that pattern catches every gallery at once
    // instead of chasing individual IDs one at a time.
    const skullXPattern = /^666[0-9a-f]+666i\d+$/i;
    return data.some(i => i.parent_inscription_id && skullXPattern.test(i.parent_inscription_id));
}

// Checks the connected BTC wallet's Rune balance for a real amount > 0 of
// the given rune (name WITHOUT the bullet spacers, e.g. "MAGICINTERNETMONEY").
async function checkOrdiscanRune(runeName) {
    if (!btcWalletAddress) return false;
    const data = await ordiscanFetch(`/address/${btcWalletAddress}/runes`);
    if (!Array.isArray(data)) {
        console.log(`[btcwallet] Ordiscan rune check for "${runeName}": no usable data returned, treating as not owned`);
        return false;
    }
    console.log(`[btcwallet] Ordiscan rune check for "${runeName}": runes actually present in wallet:`, JSON.stringify(data.map(r => ({ name: r.name, balance: r.balance }))));
    return data.some(r => r.name === runeName && BigInt(r.balance || "0") > 0n);
}

// Bitcoin Wizards - confirmed real slug on Ordiscan (verified against
// ordiscan.com/collection/bitcoin-wizards directly), so this replaces the
// stub above for real.
window.checkBitcoinWizardsOwnership = async function () {
    return await checkOrdiscanCollection("bitcoin-wizards");
};

// $MIM rune on Bitcoin (Rune #17, MAGIC•INTERNET•MONEY, id 840000:45).
window.checkMimRuneHolding = async function () {
    return await checkOrdiscanRune("MAGICINTERNETMONEY");
};
