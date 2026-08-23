/* ============================================================
   MID EVILS EASTER EGG
   ============================================================
   Same mechanic as js/conmen-egg.js, js/skullx-egg.js and
   js/undead-egg.js: medieval-mode only, a small clickable version
   of the character appears in the bottom-right corner at random
   intervals, stays for exactly 2 seconds, then disappears again if
   nobody clicks it. Clicking it opens a full-screen Win95-style
   launcher which, like Genuine Undead's, swaps in a live embedded
   game rather than linking out the way Conmen and Skull X do. The
   iframe is built only once the button is actually clicked, so it
   isn't loading or running in the background for anyone who never
   goes in - and it's torn down again on close so it doesn't keep
   playing audio behind the page.

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
const MIDEVILS_EGG_EMBED_SRC = 'https://classicjoy.games/embed?slug=wwf-no-mercy';

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
    _midevilsEggResetLauncherView(); // always open on the intro, never on a stale iframe
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

// Swaps the intro (character + blurb + button) out for the live embedded
// game - built fresh each time rather than left in the DOM permanently,
// so it isn't sitting there loading and running in the background for
// anyone who never actually clicks in.
function openMidEvilsEmbed() {
    const intro = document.getElementById('midevilsLauncherIntro');
    const wrap = document.getElementById('midevilsEmbedWrap');
    if (!wrap) return;
    if (intro) intro.classList.add('hidden');
    // SECURITY: sandboxed deliberately, same as the Undead embed. With no
    // sandbox attribute an embedded third-party frame may navigate the
    // TOP-level window after a user gesture - so one click inside the
    // embedded game could silently replace this page with a lookalike.
    // That matters far more here than on an ordinary site, because this is
    // a page people connect real wallets to, which makes a same-tab
    // redirect high-value phishing. allow-scripts + allow-same-origin are
    // what the game needs to run; top-navigation and popups are
    // deliberately NOT granted.
    wrap.innerHTML = `<iframe src="${MIDEVILS_EGG_EMBED_SRC}" width="800" height="600" frameborder="0"` +
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
        _midevilsEggPausedSiteMusic = true;
    }
}

// Tracks whether THIS egg actually paused the music, so closing a launcher
// nobody entered can't resume music the player had deliberately muted.
// pauseMainThemeForBonusStage() records the was-it-playing flag globally,
// and it would otherwise still hold a stale value from some earlier
// mini-game.
let _midevilsEggPausedSiteMusic = false;

function _midevilsEggResetLauncherView() {
    const intro = document.getElementById('midevilsLauncherIntro');
    const wrap = document.getElementById('midevilsEmbedWrap');
    // Emptying innerHTML destroys the iframe, which is what actually stops
    // the game running (and its audio playing) once the window is closed -
    // just hiding it would leave it going behind the page.
    if (wrap) { wrap.classList.add('hidden'); wrap.innerHTML = ''; }
    if (intro) intro.classList.remove('hidden');
    if (_midevilsEggPausedSiteMusic) {
        _midevilsEggPausedSiteMusic = false;
        if (typeof resumeMainThemeAfterBonusStage === 'function') resumeMainThemeAfterBonusStage();
    }
}

function closeMidEvilsLauncher() {
    const overlay = document.getElementById('midevilsLauncherOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    _midevilsEggResetLauncherView();
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
