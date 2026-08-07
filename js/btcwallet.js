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

// Bitcoin Wizards - STUB. Waiting on the collection's parent inscription
// ID (or official inscription range, if it doesn't use parent-child)
// before this can actually check anything. Always returns false until
// filled in.
window.checkBitcoinWizardsOwnership = async function () {
    return false;
};
