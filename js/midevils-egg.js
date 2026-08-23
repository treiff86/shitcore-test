/* ============================================================
   MID EVILS EASTER EGG
   ============================================================
   Same mechanic as js/conmen-egg.js, js/skullx-egg.js and
   js/undead-egg.js: medieval-mode only, a small clickable version
   of the character appears in the bottom-right corner at random
   intervals, stays for exactly 2 seconds, then disappears again if
   nobody clicks it. Clicking it opens a full-screen Win95-style
   launcher pointing at the Mid Evils marketplace listing - the same
   link-out shape Conmen and Skull X use, rather than the embedded
   game Genuine Undead's launcher swaps in.

   Note the class name: the Mid Evils theme's cssClass in web3.js is
   "medieval-mode", NOT "midevils-mode". Everything here checks the
   former. The theme id stays "midevils".

   Checks document.body.classList on every tick rather than once at
   page load, since the theme only applies once a Mid Evils wallet
   actually connects - which can happen well after this script first
   runs.
   ============================================================ */

const MIDEVILS_EGG_VISIBLE_MS = 2000;          // matches all three existing eggs
const MIDEVILS_EGG_MIN_GAP_MS = 3 * 60 * 1000; // 3 min
const MIDEVILS_EGG_MAX_GAP_MS = 7 * 60 * 1000; // 7 min

let _midevilsEggHideTimeout = null;

function _midevilsEggRandomGap() {
    return MIDEVILS_EGG_MIN_GAP_MS + Math.random() * (MIDEVILS_EGG_MAX_GAP_MS - MIDEVILS_EGG_MIN_GAP_MS);
}

function _midevilsEggShow() {
    const el = document.getElementById('midevilsEggPopup');
    if (!el) return;
    el.classList.add('show');
    clearTimeout(_midevilsEggHideTimeout);
    _midevilsEggHideTimeout = setTimeout(_midevilsEggHide, MIDEVILS_EGG_VISIBLE_MS);
}

function _midevilsEggHide() {
    const el = document.getElementById('midevilsEggPopup');
    if (el) el.classList.remove('show');
}

function _midevilsEggTick() {
    // Requires BOTH genuine ownership AND the Mid Evils theme actually
    // being the one active right now - same reasoning as the other three:
    // isMidEvilsHolder alone isn't enough for a dual holder currently
    // viewing a different theme.
    if (typeof isMidEvilsHolder !== 'undefined' && isMidEvilsHolder
        && document.body.classList.contains('medieval-mode')) {
        _midevilsEggShow();
    }
    setTimeout(_midevilsEggTick, _midevilsEggRandomGap());
}

function openMidEvilsLauncher() {
    // Same real-ownership + active-theme gate as the tick above, plus a
    // master-wallet bypass so the "Easter Egg" test button (master wallet
    // only, see web3.js) can open the launcher for testing without needing
    // a real Mid Evils holding or the theme active - same pattern as the
    // other three launchers.
    const isRealHolder = typeof isMidEvilsHolder !== 'undefined' && isMidEvilsHolder
        && document.body.classList.contains('medieval-mode');
    const isMaster = typeof walletAddress !== 'undefined' && typeof MASTER_WALLET !== 'undefined' && walletAddress === MASTER_WALLET;
    if (!isRealHolder && !isMaster) return;
    clearTimeout(_midevilsEggHideTimeout);
    _midevilsEggHide();
    const overlay = document.getElementById('midevilsLauncherOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    }
}

// Manual test hook for the "Easter Egg" button, master-wallet-only (see
// web3.js). Skips both the medieval-mode check and the random schedule so
// it always fires immediately on click, regardless of theme or timing.
function testMidEvilsEgg() {
    _midevilsEggShow();
}

function closeMidEvilsLauncher() {
    const overlay = document.getElementById('midevilsLauncherOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Same fixed-position-under-filter gotcha as the other three eggs - see
    // the long comment in js/conmen-egg.js for the full explanation. It
    // matters more here than anywhere else, because .medieval-mode carries
    // an animated `filter` (medieval-flicker), and ANY non-none filter on
    // an ancestor makes it the containing block for position:fixed
    // descendants - so the popup would be positioned relative to <body>
    // and flicker along with the theme instead of sitting still in the
    // corner. Reparenting to <html> sidesteps it, since <html> never gets
    // the theme class.
    const popupEl = document.getElementById('midevilsEggPopup');
    if (popupEl) document.documentElement.appendChild(popupEl);
    const launcherEl = document.getElementById('midevilsLauncherOverlay');
    if (launcherEl) document.documentElement.appendChild(launcherEl);

    setTimeout(_midevilsEggTick, _midevilsEggRandomGap());
});
