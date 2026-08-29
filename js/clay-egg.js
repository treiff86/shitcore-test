/* ============================================================
   CLAY STONKZ EASTER EGG
   ============================================================
   Every so often, while the Clay theme is active, Clay peers in from
   the bottom-right corner in a green hat, whispering "psst...".
   Clicking him opens a full-screen Win95 launcher; the button inside
   it starts the game.

   Built to the same shape as the other four theme eggs (conmen-egg.js
   and friends): same corner, same 110px teaser, same fade-and-lift on a
   `show` class, same random gap and short visible window. It started
   out as a big bottom-left speech bubble copied from the McDonald's
   popup, which put it in the wrong corner at the wrong size next to a
   theme toast that already lives there.

   The game is embedded in the launcher window rather than linked
   out, matching Genuine Undead's and Mid Evils' eggs, which already
   embed classicjoy titles the same way. The frame is sandboxed and
   torn down on close - see openClayEmbed.

   ============================================================ */

const CLAY_EGG_EMBED_SRC = 'https://classicjoy.games/embed?slug=the-legend-of-zelda-ocarina-of-time';
const CLAY_EGG_VISIBLE_MS = 7000;
const CLAY_EGG_MIN_GAP_MS = 4 * 60 * 1000;   // 4 min
const CLAY_EGG_MAX_GAP_MS = 9 * 60 * 1000;   // 9 min

let _clayEggHideTimeout = null;

function _clayEggRandomGap() {
    return CLAY_EGG_MIN_GAP_MS + Math.random() * (CLAY_EGG_MAX_GAP_MS - CLAY_EGG_MIN_GAP_MS);
}

function _clayEggAvailable() {
    return document.body.classList.contains('clay-mode');
}

/* This teaser sits in the bottom-RIGHT corner, the same slot the other four
   theme eggs use, so those are what it has to stand down for - not the
   toasts, which live bottom-left. In practice none of them can be up at the
   same time (each is gated on its own theme class) but a stray one showing
   through would stack two characters on top of each other. */
function _clayEggCornerBusy() {
    const ids = ['conmenEggPopup', 'skullxEggPopup', 'undeadEggPopup', 'midevilsEggPopup'];
    return ids.some(id => {
        const el = document.getElementById(id);
        return el && el.classList.contains('show');
    });
}

/* Clicking the teaser opens the launcher window, the same way Undead's and
   Mid Evils' do. The game itself is not built until the button inside is
   pressed - see openClayEmbed below. */
function openClayEgg() {
    _clayEggHide();
    _clayEggResetLauncherView();   // always open on the intro, never on a stale frame
    const overlay = document.getElementById('clayLauncherOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    }
}

/* Swaps the intro out for the live embedded game. Built fresh on each open
   rather than left in the DOM, so it is not quietly loading and running in
   the background for anyone who never clicks in. */
function openClayEmbed() {
    const intro = document.getElementById('clayLauncherIntro');
    const wrap = document.getElementById('clayEmbedWrap');
    if (!wrap) return;
    if (intro) intro.classList.add('hidden');
    /* SECURITY: sandboxed deliberately, exactly as Undead's is. Without a
       sandbox attribute an embedded third-party frame is allowed to navigate
       the TOP-level window after a user gesture - so one click inside the
       game could silently replace this page with a lookalike. That matters
       more here than on an ordinary site, because this is a page people
       connect real wallets to, which makes a same-tab redirect high-value
       phishing. allow-scripts + allow-same-origin are what the game needs to
       run; top-navigation and popups are deliberately NOT granted. */
    wrap.innerHTML = `<iframe src="${CLAY_EGG_EMBED_SRC}" width="800" height="600" frameborder="0"` +
        ` sandbox="allow-scripts allow-same-origin allow-pointer-lock"` +
        ` referrerpolicy="no-referrer" allowfullscreen></iframe>`;
    wrap.classList.remove('hidden');

    // Same music handoff the other launchers use, done at the point the GAME
    // opens rather than when the window does - the intro is artwork and a
    // button, and silencing the site for that would just read as a glitch.
    if (typeof pauseMainThemeForBonusStage === 'function') {
        pauseMainThemeForBonusStage();
        _clayEggPausedSiteMusic = true;
    }
}

/* Tracks whether THIS launcher paused the music, so closing a window nobody
   entered cannot resume music the player had deliberately muted. */
let _clayEggPausedSiteMusic = false;

function _clayEggResetLauncherView() {
    const intro = document.getElementById('clayLauncherIntro');
    const wrap = document.getElementById('clayEmbedWrap');
    // Emptying innerHTML destroys the iframe, which is what actually stops
    // the game running - and stops its audio - once the window is closed.
    if (wrap) { wrap.classList.add('hidden'); wrap.innerHTML = ''; }
    if (intro) intro.classList.remove('hidden');
    if (_clayEggPausedSiteMusic) {
        _clayEggPausedSiteMusic = false;
        if (typeof resumeMainThemeAfterBonusStage === 'function') resumeMainThemeAfterBonusStage();
    }
}

function closeClayLauncher() {
    const overlay = document.getElementById('clayLauncherOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    _clayEggResetLauncherView();
}

/* Visibility is a `show` class, not hidden/flex - the CSS fades and lifts
   the teaser in, and toggling display would skip the transition entirely. */
function _clayEggShow() {
    const el = document.getElementById('clayEggPopup');
    if (!el) return;
    el.classList.add('show');
    clearTimeout(_clayEggHideTimeout);
    _clayEggHideTimeout = setTimeout(_clayEggHide, CLAY_EGG_VISIBLE_MS);
}

function _clayEggHide() {
    const el = document.getElementById('clayEggPopup');
    if (el) el.classList.remove('show');
}

/* Manual test hook for the "Easter Egg" button (master wallet only, see
   web3.js). Skips both the clay-mode check and the random schedule so it
   fires the instant you click, the same way every other theme's hook does. */
function testClayEgg() {
    _clayEggShow();
}

function _clayEggTick() {
    if (_clayEggAvailable() && !_clayEggCornerBusy()) _clayEggShow();
    setTimeout(_clayEggTick, _clayEggRandomGap());
}

document.addEventListener('DOMContentLoaded', () => {
    /* Same fix the other two corner popups needed: the theme classes
       animate `filter` on <body>, and a filtered ancestor turns
       position:fixed into "fixed to the whole scrollable page" instead of
       to the window. Reparenting to <html> sidesteps it. */
    const popupEl = document.getElementById('clayEggPopup');
    if (popupEl) document.documentElement.appendChild(popupEl);
    const launcherEl = document.getElementById('clayLauncherOverlay');
    if (launcherEl) document.documentElement.appendChild(launcherEl);
    setTimeout(_clayEggTick, _clayEggRandomGap());
});
