/* ============================================================
   ETHEREUM WALLET CONNECTION
   ============================================================
   Covers MetaMask, Coinbase Wallet, Rabby, Rainbow, Trust Wallet,
   Brave Wallet, and anything else that injects a standard EIP-1193
   provider - which is effectively every major browser-extension
   EVM wallet. Uses EIP-6963 (the modern multi-wallet announcement
   standard) to detect ALL installed EVM wallets at once and let
   the user pick between them, same idea as the existing Solana
   multi-wallet picker.

   WalletConnect (QR-code mobile wallet connections) is NOT covered
   here - that's a separate SDK requiring its own WalletConnect
   Cloud project ID, deliberately left for later.

   Read-only by design, same as the Bitcoin wallet module - only
   ever requests the connected address, never asks for a signature
   or transaction approval.

   Depends on nothing else loading first, but showToast/applyCosmeticThemes
   (web3.js) and closeWalletPicker (web3.js) are used if present.
   ============================================================ */

let ethWalletAddress = null;
let ethWalletProviderInfo = null; // the EIP-6963 provider detail (name, icon, the actual provider object) for whichever wallet got connected

// EIP-6963 providers announce themselves async via a browser event, so
// this collects whatever announces itself before the picker is opened.
// Falls back to plain window.ethereum (older wallets that don't support
// EIP-6963 yet, or only one wallet installed) if nothing announces itself.
// Keyed by the provider's own info.uuid (a real unique ID EIP-6963
// requires every announcement to include, specifically so listeners can
// tell "this is the same wallet re-announcing" apart from "this is a
// genuinely different wallet") - a Map here means a wallet re-announcing
// itself (which is normal, expected behavior, not a bug on the wallet's
// side) just overwrites its own entry instead of adding a duplicate.
const _eip6963Providers = new Map();
window.addEventListener('eip6963:announceProvider', (event) => {
    _eip6963Providers.set(event.detail.info.uuid, event.detail);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));

// Wallets that technically announce an EIP-1193/EIP-6963-compatible
// interface (for cross-chain dApp compatibility) but aren't genuine
// Ethereum wallets someone would pick here - TronLink is the known case,
// it exposes this for Tron dApps, not because it's meant to be an
// Ethereum option.
const ETH_PROVIDER_EXCLUDE_NAMES = ['tronlink'];

function getEthereumProviders() {
    let list;
    if (_eip6963Providers.size > 0) {
        list = Array.from(_eip6963Providers.values()).map(p => ({ name: p.info.name, icon: p.info.icon, provider: p.provider }));
    } else if (typeof window.ethereum !== 'undefined') {
        // No EIP-6963 announcements (older wallet, or the announce event
        // fired before this script loaded) - fall back to the plain
        // window.ethereum injection if one exists.
        list = [{ name: window.ethereum.isMetaMask ? 'MetaMask' : 'Browser Wallet', icon: null, provider: window.ethereum }];
    } else {
        list = [];
    }
    return list.filter(p => !ETH_PROVIDER_EXCLUDE_NAMES.includes((p.name || '').toLowerCase()));
}

async function connectEthereum(providerIndex) {
    if (typeof walletAddress !== 'undefined' && walletAddress) {
        if (typeof showToast === 'function') showToast('Only one wallet at a time - disconnect your Solana wallet first.', 'error');
        return;
    }
    if (typeof btcWalletAddress !== 'undefined' && btcWalletAddress) {
        if (typeof showToast === 'function') showToast('Only one wallet at a time - disconnect your Bitcoin wallet first.', 'error');
        return;
    }
    const providers = getEthereumProviders();
    const chosen = providers[providerIndex];
    if (!chosen) {
        if (typeof showToast === 'function') showToast('No Ethereum wallet detected - install MetaMask or similar first.', 'error');
        window.open('https://metamask.io/download/', '_blank');
        return;
    }
    try {
        const accounts = await chosen.provider.request({ method: 'eth_requestAccounts' });
        if (!accounts || !accounts[0]) throw new Error('No account returned');
        ethWalletAddress = accounts[0];
        ethWalletProviderInfo = chosen;
        onEthereumWalletConnected();
    } catch (e) {
        console.error('[ethwallet] Connect failed:', e);
        if (typeof showToast === 'function') showToast("Couldn't connect - try again.", 'error');
    }
}

function shortEthAddr(addr) {
    return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
}

function onEthereumWalletConnected() {
    document.getElementById('ethWalletAddressText').innerText = shortEthAddr(ethWalletAddress);
    document.getElementById('ethWalletDisplay')?.classList.remove('hidden');
    document.getElementById('walletConnectBtn')?.classList.add('hidden'); // only one wallet active at a time
    if (typeof showToast === 'function') {
        showToast(`🔷 Ethereum wallet connected: ${shortEthAddr(ethWalletAddress)}`, 'success');
    }
    // No Ethereum-gated cosmetic themes exist yet - this is here so
    // adding one later (COSMETIC_THEMES entry with a checkFn that reads
    // ethWalletAddress) doesn't need any wiring beyond that, same as how
    // Bitcoin wallet connecting already re-checks themes.
    if (typeof applyCosmeticThemes === 'function') {
        applyCosmeticThemes(ethWalletAddress, true);
    }
}

function disconnectEthereumWallet() {
    ethWalletAddress = null;
    ethWalletProviderInfo = null;
    document.getElementById('ethWalletDisplay')?.classList.add('hidden');
    document.getElementById('walletConnectBtn')?.classList.remove('hidden');
    if (typeof applyCosmeticThemes === 'function' && typeof walletAddress !== 'undefined') {
        applyCosmeticThemes(walletAddress, false);
    }
}

// Populates the Ethereum section of the shared wallet picker modal (see
// walletPickerModal in index.html) - called from openWalletPicker() in
// web3.js alongside the Solana section.
function renderEthWalletPickerButtons() {
    const box = document.getElementById('ethWalletPickerButtons');
    if (!box) return;
    const providers = getEthereumProviders();
    if (providers.length === 0) {
        box.innerHTML = `<p class="text-[10px] text-gray-500 italic">No Ethereum wallet detected.</p>`;
        return;
    }
    box.innerHTML = providers.map((p, i) => `
        <button onclick="closeWalletPicker(); connectEthereum(${i});"
            class="w-full py-2.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 rounded font-bold text-sm transition text-left px-4">
            ${p.name}
        </button>`).join('');
}
