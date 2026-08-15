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
/* ============================================================
   EVM NFT OWNERSHIP CHECKING
   ============================================================
   Real on-chain balanceOf() checks for ERC-721 (and ERC-721A, same
   ABI) collections - no third-party indexer, no API key, no CORS
   worries like the Bitcoin/Ordiscan side had. balanceOf(address) is
   part of the ERC-721 standard itself, so this works for any
   compliant contract on any EVM chain, as long as we know which
   chain to ask.

   Two ways to actually make the call:
   - Via the connected wallet's own provider (js/ethwallet.js) - works
     for whatever chain the wallet is currently pointed at, which for
     almost everyone connecting is Ethereum mainnet by default.
   - Via a direct RPC fetch to a specific chain's public endpoint -
     needed for ApeChain (ForeverUndead) specifically, since asking
     the wallet to switch chains just to check a balance would throw
     an unwanted network-switch prompt at people who may not even
     hold anything there.
   ============================================================ */

const APECHAIN_RPC = 'https://rpc.apechain.com/http'; // public, free, chain ID 33139

// Encodes balanceOf(address) call data - the standard ERC-721/ERC-20
// selector (0x70a08231) is the same on every compliant contract, no
// ABI file needed for a call this simple.
function encodeBalanceOfCall(address) {
    const cleanAddr = address.toLowerCase().replace('0x', '');
    return '0x70a08231' + cleanAddr.padStart(64, '0');
}

function hexBalanceIsPositive(hexResult) {
    if (!hexResult || hexResult === '0x') return false;
    try {
        return BigInt(hexResult) > 0n;
    } catch (_) {
        return false;
    }
}

// Checks balanceOf via the CONNECTED WALLET's own provider - whatever
// chain it's currently pointed at (Ethereum mainnet for almost everyone
// who hasn't manually switched).
async function checkERC721BalanceViaWallet(contractAddress) {
    if (typeof ethWalletProviderInfo === 'undefined' || !ethWalletProviderInfo || !ethWalletAddress) return false;
    try {
        const result = await ethWalletProviderInfo.provider.request({
            method: 'eth_call',
            params: [{ to: contractAddress, data: encodeBalanceOfCall(ethWalletAddress) }, 'latest'],
        });
        console.log(`[evmwallet] balanceOf via wallet provider for ${contractAddress}: ${result}`);
        return hexBalanceIsPositive(result);
    } catch (e) {
        console.warn(`[evmwallet] balanceOf via wallet provider failed for ${contractAddress}:`, e);
        return false;
    }
}

// Checks balanceOf via a direct RPC fetch to a SPECIFIC chain, bypassing
// whatever chain the connected wallet currently happens to be on. Used
// for ApeChain (ForeverUndead) so checking doesn't trigger a chain-switch
// prompt in the user's wallet.
async function checkERC721BalanceViaRPC(contractAddress, rpcUrl) {
    if (typeof ethWalletAddress === 'undefined' || !ethWalletAddress) return false;
    try {
        const res = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'eth_call',
                params: [{ to: contractAddress, data: encodeBalanceOfCall(ethWalletAddress) }, 'latest'],
            }),
        });
        const json = await res.json();
        console.log(`[evmwallet] balanceOf via RPC (${rpcUrl}) for ${contractAddress}:`, json.result);
        return hexBalanceIsPositive(json.result);
    } catch (e) {
        console.warn(`[evmwallet] balanceOf via RPC failed for ${contractAddress}:`, e);
        return false;
    }
}

// Confirmed real contract - the older "GU Origins" collection that
// current-gen Genuine Undead migrated from. Tim confirmed Origins
// holders who haven't migrated should still count.
const GU_ORIGINS_CONTRACT = '0x209e639a0ec166ac7a1a4ba41968fa967db30221'; // Ethereum mainnet, confirmed via Etherscan/Rarible

// NOT YET CONFIRMED - placeholders. The v3 deployer address Tim gave me
// (0xa0734ed3ea5b48376fa0c5fa3e7c8086ab53f9ae, "GUv3_Deployer") is
// DIFFERENT from Etherscan's on-record deployer for GU Origins, which
// confirms a real, separate v3 contract exists - just couldn't pin down
// its exact address via search. Same story for ForeverUndead on
// ApeChain. Fill these in the moment Tim sends the real addresses (see
// Details > Contract Address on the collection's OpenSea page).
const GENUINE_UNDEAD_V3_CONTRACT = null; // TODO: Ethereum mainnet
const FOREVER_UNDEAD_CONTRACT = null;    // TODO: ApeChain

window.checkGenuineUndeadOwnership = async function () {
    if (GENUINE_UNDEAD_V3_CONTRACT && await checkERC721BalanceViaWallet(GENUINE_UNDEAD_V3_CONTRACT)) return true;
    if (await checkERC721BalanceViaWallet(GU_ORIGINS_CONTRACT)) return true;
    if (FOREVER_UNDEAD_CONTRACT && await checkERC721BalanceViaRPC(FOREVER_UNDEAD_CONTRACT, APECHAIN_RPC)) return true;
    return false;
};

// Confirmed real contracts - Tim's own collection lookups (Skullx,
// Skullx Aeons, KinkySkullx, whatever SkullxSummoner deployed). Two of
// the originally sent four addresses were identical, so this covers 3
// distinct contracts, not 4 - which exact name maps to which specific
// address wasn't specified, so all 3 are just treated as "Skull X, some
// gallery" equally, same as how the Bitcoin side already unifies its
// galleries.
const SKULLX_EVM_CONTRACTS = [
    '0x495f947276749ce646f68ac8c248420045cb7b5e',
    '0xd4f417cfd29ae83a303b6d75f88b62a696de47e1',
    '0x1dc5d3b2162f9500d7ddec14eb0ba9ccb43bc20c',
];

// Checks a list of ERC-721 contracts via the connected wallet's own
// provider, returns true on the first one with a positive balance.
window.checkSkullXEvmOwnership = async function () {
    for (const addr of SKULLX_EVM_CONTRACTS) {
        if (await checkERC721BalanceViaWallet(addr)) return true;
    }
    return false;
};

