/* ============================================================
   CONMEN EASTER EGG
   ============================================================
   Conmen-mode only: a small clickable version of the character
   appears in the bottom-right corner at random intervals, stays
   for exactly 2 seconds, then disappears again if nobody clicks
   it. Clicking it opens a full-screen Win95-style launcher
   pointing at the Tensor marketplace listing.

   Checks document.body.classList on every tick rather than once
   at page load, since the theme only applies once a Conmen wallet
   actually connects - which can happen well after this script
   first runs.
   ============================================================ */

const CONMEN_EGG_VISIBLE_MS = 2000;
const CONMEN_EGG_MIN_GAP_MS = 3 * 60 * 1000;   // 3 min
const CONMEN_EGG_MAX_GAP_MS = 7 * 60 * 1000;   // 7 min

let _conmenEggHideTimeout = null;

function _conmenEggRandomGap() {
    return CONMEN_EGG_MIN_GAP_MS + Math.random() * (CONMEN_EGG_MAX_GAP_MS - CONMEN_EGG_MIN_GAP_MS);
}

function _conmenEggShow() {
    const el = document.getElementById('conmenEggPopup');
    if (!el) return;

    // Position is fixed via CSS (bottom-right corner) - just toggle visibility.
    el.classList.add('show');
    clearTimeout(_conmenEggHideTimeout);
    _conmenEggHideTimeout = setTimeout(_conmenEggHide, CONMEN_EGG_VISIBLE_MS);
}

function _conmenEggHide() {
    const el = document.getElementById('conmenEggPopup');
    if (el) el.classList.remove('show');
}

function _conmenEggTick() {
    // Real LIVE ownership only - isConmenHolder is set exclusively by
    // applyCosmeticThemes()'s genuine NFT check and is never touched by
    // Theme Preview (TEST Play), unlike the conmen-mode CSS class which
    // both real holders AND TEST preview apply. Checking the class here
    // used to let this fire during TEST preview too - not intended.
    if (typeof isConmenHolder !== 'undefined' && isConmenHolder) {
        _conmenEggShow();
    }
    setTimeout(_conmenEggTick, _conmenEggRandomGap());
}

function openConmenLauncher() {
    // Real-ownership gate, same as the tick above - plus a master-wallet
    // bypass so the "Easter Egg" test button (master wallet only, see
    // web3.js) can still open the launcher for testing without needing
    // to actually hold a Conmen NFT.
    const isRealHolder = typeof isConmenHolder !== 'undefined' && isConmenHolder;
    const isMaster = typeof walletAddress !== 'undefined' && typeof MASTER_WALLET !== 'undefined' && walletAddress === MASTER_WALLET;
    if (!isRealHolder && !isMaster) return;
    clearTimeout(_conmenEggHideTimeout);
    _conmenEggHide();
    const overlay = document.getElementById('conmenLauncherOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    }
}

// Manual test hook for the "Easter Egg" button, master-wallet-only (see
// web3.js). Skips both the conmen-mode check and the random schedule so
// it always fires immediately on click, regardless of theme or timing.
function testConmenEgg() {
    _conmenEggShow();
}

function closeConmenLauncher() {
    const overlay = document.getElementById('conmenLauncherOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Escape hatch for a real CSS gotcha: .medieval-mode/.conmen-mode animate
    // `filter` directly on <body> for the flicker effect, and any element
    // with a `filter` becomes the containing block for its position:fixed
    // descendants. That silently turns "fixed to the browser window" into
    // "fixed to the whole scrollable page", so the popup drifted around
    // with scroll position instead of pinning to the actual corner.
    // Moving these two elements to be children of <html> instead of <body>
    // sidesteps it entirely, since <html> never gets that filter.
    const popupEl = document.getElementById('conmenEggPopup');
    if (popupEl) document.documentElement.appendChild(popupEl);
    const launcherEl = document.getElementById('conmenLauncherOverlay');
    if (launcherEl) document.documentElement.appendChild(launcherEl);

    setTimeout(_conmenEggTick, _conmenEggRandomGap());
});
