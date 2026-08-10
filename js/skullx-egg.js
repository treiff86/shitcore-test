/* ============================================================
   SKULL X EASTER EGG
   ============================================================
   Same mechanic as js/conmen-egg.js: skullx-mode only, a small
   clickable version of the character appears in the bottom-right
   corner at random intervals, stays for exactly 2 seconds, then
   disappears again if nobody clicks it. Clicking it opens a
   full-screen Win95-style launcher pointing at the Skull X Linktree.

   Checks document.body.classList on every tick rather than once at
   page load, since the theme only applies once a Skull X wallet
   actually connects - which can happen well after this script first
   runs.
   ============================================================ */

const SKULLX_EGG_VISIBLE_MS = 2000;
const SKULLX_EGG_MIN_GAP_MS = 3 * 60 * 1000;   // 3 min
const SKULLX_EGG_MAX_GAP_MS = 7 * 60 * 1000;   // 7 min

let _skullxEggHideTimeout = null;

function _skullxEggRandomGap() {
    return SKULLX_EGG_MIN_GAP_MS + Math.random() * (SKULLX_EGG_MAX_GAP_MS - SKULLX_EGG_MIN_GAP_MS);
}

function _skullxEggShow() {
    const el = document.getElementById('skullxEggPopup');
    if (!el) return;
    el.classList.add('show');
    clearTimeout(_skullxEggHideTimeout);
    _skullxEggHideTimeout = setTimeout(_skullxEggHide, SKULLX_EGG_VISIBLE_MS);
}

function _skullxEggHide() {
    const el = document.getElementById('skullxEggPopup');
    if (el) el.classList.remove('show');
}

function _skullxEggTick() {
    // Requires BOTH genuine ownership AND the Skull X theme actually
    // being the one active right now - same reasoning as Conmen's
    // version: isSkullXHolder alone isn't enough for a dual holder
    // currently viewing a different theme.
    if (typeof isSkullXHolder !== 'undefined' && isSkullXHolder
        && document.body.classList.contains('skullx-mode')) {
        _skullxEggShow();
    }
    setTimeout(_skullxEggTick, _skullxEggRandomGap());
}

function openSkullXLauncher() {
    // Same real-ownership + active-theme gate as the tick above, plus a
    // master-wallet bypass so the "Skull X Egg" test button (master
    // wallet only, see web3.js) can open the launcher for testing
    // without needing a real Skull X holding or the theme active - same
    // pattern as Conmen's launcher.
    const isRealHolder = typeof isSkullXHolder !== 'undefined' && isSkullXHolder
        && document.body.classList.contains('skullx-mode');
    const isMaster = typeof walletAddress !== 'undefined' && typeof MASTER_WALLET !== 'undefined' && walletAddress === MASTER_WALLET;
    if (!isRealHolder && !isMaster) return;
    clearTimeout(_skullxEggHideTimeout);
    _skullxEggHide();
    const overlay = document.getElementById('skullxLauncherOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    }
}

// Manual test hook for the "Skull X Egg" button, master-wallet-only (see
// web3.js). Skips both the skullx-mode check and the random schedule so
// it always fires immediately on click, regardless of theme or timing.
function testSkullXEgg() {
    _skullxEggShow();
}

function closeSkullXLauncher() {
    const overlay = document.getElementById('skullxLauncherOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Same fixed-position-under-filter gotcha as Conmen's version - see
    // the long comment in js/conmen-egg.js for the full explanation.
    // Moving these to be children of <html> instead of <body> sidesteps
    // it, since <html> never gets the theme's animated filter.
    const popupEl = document.getElementById('skullxEggPopup');
    if (popupEl) document.documentElement.appendChild(popupEl);
    const launcherEl = document.getElementById('skullxLauncherOverlay');
    if (launcherEl) document.documentElement.appendChild(launcherEl);

    setTimeout(_skullxEggTick, _skullxEggRandomGap());
});
