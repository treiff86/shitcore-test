/* ============================================================
   CLAY STONKZ EASTER EGG
   ============================================================
   Every so often, while the Clay theme is active, Clay peers in from
   the bottom-right corner in a green hat, whispering "psst...".
   Clicking him opens the game he is dressed for, on the site that
   hosts it, in a new tab.

   Built to the same shape as the other four theme eggs (conmen-egg.js
   and friends): same corner, same 110px teaser, same fade-and-lift on a
   `show` class, same random gap and short visible window. It started
   out as a big bottom-left speech bubble copied from the McDonald's
   popup, which put it in the wrong corner at the wrong size next to a
   theme toast that already lives there.

   WHY A LINK AND NOT AN <iframe>
   The obvious version of this drops the host's embed straight into
   the page. That would make THIS site the thing serving an
   unlicensed copy of a commercial Nintendo game, rather than a site
   that points at somebody else's. Nintendo takes that distinction
   seriously and acts on it. A plain outbound link is ordinary web
   behaviour and keeps the joke without hosting anything - and if
   the destination ever goes away, a dead link costs nothing while a
   dead embed leaves a broken grey box in the middle of the page.
   ============================================================ */

const CLAY_EGG_URL = 'https://classicjoy.games/games/the-legend-of-zelda-ocarina-of-time';
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

function openClayEgg() {
    // noopener/noreferrer: the new tab gets no handle back to this one.
    window.open(CLAY_EGG_URL, '_blank', 'noopener,noreferrer');
    _clayEggHide();
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
    setTimeout(_clayEggTick, _clayEggRandomGap());
});
