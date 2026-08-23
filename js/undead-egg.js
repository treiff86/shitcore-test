/* ============================================================
   GENUINE UNDEAD / FOREVER UNDEAD EASTER EGG
   ============================================================
   Same mechanic as js/conmen-egg.js and js/skullx-egg.js:
   undead-mode only, a small clickable version of the character
   appears in the bottom-right corner at random intervals, stays
   for exactly 2 seconds, then disappears again if nobody clicks
   it. Clicking it opens a full-screen Win95-style launcher.

   Different from Conmen/Skull X in one way: instead of linking out
   to an external site, the launcher's "enter" button swaps in a
   live embedded game (classicjoy.games) right there in the window,
   per Tim's request - the iframe is only created once actually
   clicked, not eagerly loaded every time the popup could show.

   Checks document.body.classList on every tick rather than once at
   page load, since the theme only applies once a Genuine Undead /
   Forever Undead wallet actually connects - which can happen well
   after this script first runs.
   ============================================================ */

const UNDEAD_EGG_VISIBLE_MS = 2000;
const UNDEAD_EGG_MIN_GAP_MS = 3 * 60 * 1000;   // 3 min
const UNDEAD_EGG_MAX_GAP_MS = 7 * 60 * 1000;   // 7 min
const UNDEAD_EGG_EMBED_SRC = 'https://classicjoy.games/embed?slug=metal-gear-solid';

let _undeadEggHideTimeout = null;

function _undeadEggRandomGap() {
    return UNDEAD_EGG_MIN_GAP_MS + Math.random() * (UNDEAD_EGG_MAX_GAP_MS - UNDEAD_EGG_MIN_GAP_MS);
}

function _undeadEggShow() {
    const el = document.getElementById('undeadEggPopup');
    if (!el) return;
    el.classList.add('show');
    clearTimeout(_undeadEggHideTimeout);
    _undeadEggHideTimeout = setTimeout(_undeadEggHide, UNDEAD_EGG_VISIBLE_MS);
}

function _undeadEggHide() {
    const el = document.getElementById('undeadEggPopup');
    if (el) el.classList.remove('show');
}

function _undeadEggTick() {
    // Requires BOTH genuine ownership AND the Undead theme actually being
    // the one active right now - same reasoning as Conmen/Skull X's
    // versions: isUndeadHolder alone isn't enough for a dual holder
    // currently viewing a different theme.
    if (typeof isUndeadHolder !== 'undefined' && isUndeadHolder
        && document.body.classList.contains('undead-mode')) {
        _undeadEggShow();
    }
    setTimeout(_undeadEggTick, _undeadEggRandomGap());
}

function openUndeadLauncher() {
    // Same real-ownership + active-theme gate as the tick above, plus a
    // master-wallet bypass so the "Easter Egg" test button (master
    // wallet only, see web3.js) can open the launcher for testing
    // without needing a real Undead holding or the theme active - same
    // pattern as Conmen/Skull X's launchers.
    const isRealHolder = typeof isUndeadHolder !== 'undefined' && isUndeadHolder
        && document.body.classList.contains('undead-mode');
    const isMaster = typeof walletAddress !== 'undefined' && typeof MASTER_WALLET !== 'undefined' && walletAddress === MASTER_WALLET;
    if (!isRealHolder && !isMaster) return;
    clearTimeout(_undeadEggHideTimeout);
    _undeadEggHide();
    _undeadEggResetLauncherView();
    const overlay = document.getElementById('undeadLauncherOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    }
}

// Manual test hook for the "Easter Egg" button, master-wallet-only (see
// web3.js). Skips both the undead-mode check and the random schedule so
// it always fires immediately on click, regardless of theme or timing.
function testUndeadEgg() {
    _undeadEggShow();
}

// Swaps the intro (character + blurb + button) out for the live embedded
// game - built fresh each time rather than left in the DOM permanently,
// so it isn't sitting there loading/running in the background for anyone
// who never actually clicks in.
function openUndeadEmbed() {
    const intro = document.getElementById('undeadLauncherIntro');
    const wrap = document.getElementById('undeadEmbedWrap');
    if (!wrap) return;
    if (intro) intro.classList.add('hidden');
    // SECURITY: sandboxed deliberately. With no sandbox attribute an
    // embedded third-party frame may navigate the TOP-level window after a
    // user gesture - so one click inside the embedded game could silently
    // replace this page with a lookalike. That matters much more here than
    // on an ordinary site, because this is a page people connect real
    // wallets to, which makes a same-tab redirect high-value phishing.
    // allow-scripts + allow-same-origin are what the game needs to run;
    // top-navigation and popups are deliberately NOT granted.
    wrap.innerHTML = `<iframe src="${UNDEAD_EGG_EMBED_SRC}" width="800" height="600" frameborder="0"` +
        ` sandbox="allow-scripts allow-same-origin allow-pointer-lock"` +
        ` referrerpolicy="no-referrer" allowfullscreen></iframe>`;
    wrap.classList.remove('hidden');

    // The site's own theme music kept playing straight over the embedded
    // game, so you heard both at once. Same handoff the Bonus Stage and
    // Fight Club already use - pause here, resume on close.
    //
    // Done at the point the GAME opens rather than when the launcher
    // window opens: the launcher's intro screen is just artwork and a
    // button, and killing the music for that would be an odd silence for
    // anyone who reads it and backs out.
    if (typeof pauseMainThemeForBonusStage === 'function') {
        pauseMainThemeForBonusStage();
        _undeadEggPausedSiteMusic = true;
    }
}

// Tracks whether THIS egg actually paused the music, so closing a launcher
// nobody entered can't resume music the player had deliberately muted.
// pauseMainThemeForBonusStage() records the was-it-playing flag globally,
// and it would otherwise still hold a stale value from some earlier
// mini-game.
let _undeadEggPausedSiteMusic = false;

function _undeadEggResetLauncherView() {
    const intro = document.getElementById('undeadLauncherIntro');
    const wrap = document.getElementById('undeadEmbedWrap');
    if (wrap) { wrap.classList.add('hidden'); wrap.innerHTML = ''; } // tear down the iframe so it isn't still running (and doesn't keep any audio playing) once closed
    if (intro) intro.classList.remove('hidden');
    if (_undeadEggPausedSiteMusic) {
        _undeadEggPausedSiteMusic = false;
        if (typeof resumeMainThemeAfterBonusStage === 'function') resumeMainThemeAfterBonusStage();
    }
}

function closeUndeadLauncher() {
    const overlay = document.getElementById('undeadLauncherOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    _undeadEggResetLauncherView();
}

document.addEventListener('DOMContentLoaded', () => {
    // Same fixed-position-under-filter gotcha as Conmen/Skull X's version -
    // see the long comment in js/conmen-egg.js for the full explanation.
    // Moving these to be children of <html> instead of <body> sidesteps
    // it, since <html> never gets the theme's animated filter.
    const popupEl = document.getElementById('undeadEggPopup');
    if (popupEl) document.documentElement.appendChild(popupEl);
    const launcherEl = document.getElementById('undeadLauncherOverlay');
    if (launcherEl) document.documentElement.appendChild(launcherEl);

    setTimeout(_undeadEggTick, _undeadEggRandomGap());
});
