/* ============================================================
   CLAY STONKZ EASTER EGG
   ============================================================
   Every so often, while the Clay theme is active, Clay turns up in
   the bottom-left corner wearing a very familiar green hat and
   looking like he has seen something he should not have. Clicking
   the bubble opens the game he is dressed for, on the site that
   hosts it, in a new tab.

   Built on the same bones as the McDonald's popup (mcdonalds-egg.js):
   random gap, short visible window, never stacks on top of a toast
   that shares this corner.

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

const CLAY_EGG_URL = 'https://classicjoy.games/embed?slug=the-legend-of-zelda-ocarina-of-time';
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

// This corner is shared with every theme toast and with the McDonald's
// popup. Two characters talking over each other reads as a bug.
function _clayEggCornerBusy() {
    const ids = ['toastClay', 'toastMedieval', 'toastConmen', 'toastUndead', 'toastDefault', 'mcdEggPopup'];
    return ids.some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
    });
}

function openClayEgg() {
    // noopener/noreferrer: the new tab gets no handle back to this one.
    window.open(CLAY_EGG_URL, '_blank', 'noopener,noreferrer');
    _clayEggHide();
}

function _clayEggShow() {
    const el = document.getElementById('clayEggPopup');
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
    clearTimeout(_clayEggHideTimeout);
    _clayEggHideTimeout = setTimeout(_clayEggHide, CLAY_EGG_VISIBLE_MS);
}

function _clayEggHide() {
    const el = document.getElementById('clayEggPopup');
    if (el) {
        el.classList.add('hidden');
        el.classList.remove('flex');
    }
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
