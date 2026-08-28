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

// Single debug-menu "Easter Egg" button now covers all FOUR eggs - fires
// whichever one matches the currently active theme instead of needing a
// separate button per theme. Defaults to Conmen's for every other theme
// (including no theme at all), same as the button did before Skull X's
// egg existed.
//
// Mid Evils' theme class is `medieval-mode`, NOT `midevils-mode`: the
// theme id in web3.js is "midevils" but its cssClass has always been
// `medieval-mode`. Checking for the wrong one here would silently fall
// through to Conmen's egg while on the Mid Evils theme - which is exactly
// the kind of bug that looks like "the button is broken".
/* THE TEST BUTTON'S DISPATCHER.

   A table rather than an if/else chain, because the chain ended in a bare
   `else` that called Conmen's hook - so ANY theme without a branch of its own
   silently fired the Conmen egg instead of its own. Clay hit exactly that:
   his egg shipped, the button was pressed under the Clay theme, and the
   Conmen soldier popped up. A missing entry here is now a no-op you can see,
   not another character's easter egg.

   Conmen stays as the fallback only for the DEFAULT skin, which is what it
   has always been - it is reached when no theme class is on <body> at all,
   not when a theme simply forgot to register. */
const THEME_EGG_TESTS = [
    ['skullx-mode',   'testSkullXEgg'],
    ['undead-mode',   'testUndeadEgg'],
    ['medieval-mode', 'testMidEvilsEgg'],
    ['conmen-mode',   'testConmenEgg'],
    ['clay-mode',     'testClayEgg'],
];

function testThemeEasterEgg() {
    for (const [cls, fn] of THEME_EGG_TESTS) {
        if (!document.body.classList.contains(cls)) continue;
        if (typeof window[fn] === 'function') { window[fn](); return; }
        console.warn(`[easter egg] ${cls} is active but ${fn}() does not exist - nothing to show.`);
        return;
    }
    // No theme class at all: the default skin, which uses the Conmen egg.
    if (typeof testConmenEgg === 'function') testConmenEgg();
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
