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
    const provider = getXverseProvider();
    if (!provider) {
        if (typeof showToast === 'function') showToast('Xverse not detected - install the extension first.', 'error');
        window.open('https://www.xverse.app/', '_blank');
        return;
    }
    try {
        const res = await provider.request('getAccounts', { purposes: ['ordinals', 'payment'] });
        const accounts = res?.result || res || [];
        const ordinalsAccount = Array.isArray(accounts) ? accounts.find(a => a.purpose === 'ordinals') : null;
        if (!ordinalsAccount?.address) throw new Error('No ordinals address in response');
        btcWalletAddress = ordinalsAccount.address;
        btcWalletProvider = 'xverse';
        onBitcoinWalletConnected();
    } catch (e) {
        console.error('[btcwallet] Xverse connect failed:', e);
        if (typeof showToast === 'function') showToast("Couldn't connect Xverse - try again.", 'error');
    }
}

async function connectUnisat() {
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

    // Re-check gated cosmetic themes now that a Bitcoin wallet is
    // available too - quiet update (no popup), same as how TEST Play
    // applies a baseline pick instead of interrupting with a choice modal.
    if (typeof applyCosmeticThemes === 'function' && typeof walletAddress !== 'undefined') {
        applyCosmeticThemes(walletAddress, false);
    }
}

function disconnectBitcoinWallet() {
    btcWalletAddress = null;
    btcWalletProvider = null;
    document.getElementById('btcWalletDisplay')?.classList.add('hidden');
    document.getElementById('btcWalletConnectBtn')?.classList.remove('hidden');
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

// Skull X: Origins uses a real on-chain parent inscription (ord.net shows
// it as parent #63994951). We don't have that parent's full long-form
// inscription ID confirmed yet - only the inscription NUMBER, and a
// candidate ID pulled from a CoinMarketCap listing that hasn't been
// verified as the true parent vs. just another piece from the same batch
// reveal. Rather than gate on an unverified guess, this logs everything
// it sees from the connected wallet so the real ID can be confirmed
// against an actual Skull X holder's wallet, then hardcoded here for real.
const SKULLX_ORIGINS_PARENT_NUMBER = 63994951;
const SKULLX_ORIGINS_PARENT_ID_CANDIDATE = '666552489f01b1f478e28d7c34b601e50ac6ed2f9c2e75da1f6702016bf8e666i0'; // UNVERIFIED

window.checkSkullXOrigins = async function () {
    const inscriptions = await getMyInscriptions();
    console.log('[btcwallet] Inscriptions seen for Skull X check:', inscriptions);
    return inscriptions.some(i => {
        const parentId = i.parentInscriptionId || i.parent || (Array.isArray(i.parents) ? i.parents[0] : null);
        const parentNumber = i.parentInscriptionNumber;
        if (parentId && parentId === SKULLX_ORIGINS_PARENT_ID_CANDIDATE) return true;
        if (parentNumber && parentNumber === SKULLX_ORIGINS_PARENT_NUMBER) return true;
        return false;
    });
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
    try {
        const res = await fetch(`${ORDISCAN_BASE}${path}`, {
            headers: { Authorization: `Bearer ${ORDISCAN_API_KEY}` },
        });
        if (!res.ok) {
            console.warn(`[btcwallet] Ordiscan returned HTTP ${res.status} for ${path}`);
            return null;
        }
        return await res.json();
    } catch (e) {
        console.warn(`[btcwallet] Ordiscan request failed for ${path}:`, e);
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
    if (!Array.isArray(data)) return false;
    return data.some(i => i.collection_slug === slug);
}

// Checks the connected BTC wallet's Rune balance for a real amount > 0 of
// the given rune (name WITHOUT the bullet spacers, e.g. "MAGICINTERNETMONEY").
async function checkOrdiscanRune(runeName) {
    if (!btcWalletAddress) return false;
    const data = await ordiscanFetch(`/address/${btcWalletAddress}/runes`);
    if (!Array.isArray(data)) return false;
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
