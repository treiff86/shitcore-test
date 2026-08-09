/* ============================================================
   MCDONALD'S MINI-GAME PROMO POPUP
   ============================================================
   Only when the Bonus Stage is actually available (i.e. the "Play
   mini game" button is visible - a connected wallet holding a
   qualifying NFT), this character randomly pops up in the
   bottom-left corner inviting the player to play. Stays up for a
   few seconds, then disappears again if nobody clicks it.
   Clicking the bubble opens the Bonus Stage directly.

   Checks the button's visibility on every tick rather than once at
   page load, since wallet connection (and therefore mini-game
   availability) can happen well after this script first runs.
   ============================================================ */

const MCD_EGG_VISIBLE_MS = 5000;
const MCD_EGG_MIN_GAP_MS = 3 * 60 * 1000;   // 3 min
const MCD_EGG_MAX_GAP_MS = 7 * 60 * 1000;   // 7 min

let _mcdEggHideTimeout = null;

function _mcdEggRandomGap() {
    return MCD_EGG_MIN_GAP_MS + Math.random() * (MCD_EGG_MAX_GAP_MS - MCD_EGG_MIN_GAP_MS);
}

function _mcdEggBonusStageAvailable() {
    // Checks the active theme directly rather than bonusStageBtn's
    // visibility - that button is TEST Play only now, so it no longer
    // reflects whether a real player actually has mini-game access.
    return document.body.classList.contains('medieval-mode') || document.body.classList.contains('conmen-mode');
}

function _mcdEggAnotherToastVisible() {
    // Avoid stacking on top of the Mid Evils/Conmen theme toasts, which
    // share this same bottom-left corner.
    const ids = ['toastMedieval', 'toastConmen', 'toastDefault'];
    return ids.some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
    });
}

// Each theme gets its own McDonald's crew member - Reiffer in uniform for
// Mid Evils, the Conmen character in uniform for Conmen. Falls back to the
// Conmen art if somehow neither theme class is present (shouldn't happen,
// since this popup only ever fires while the Bonus Stage is available).
function _mcdEggCharacterSrc() {
    if (document.body.classList.contains('medieval-mode')) return 'assets/midevils-mcdonalds-pfp.webp';
    return 'assets/mcdonalds-pfp.webp';
}

function _mcdEggShow() {
    const el = document.getElementById('mcdEggPopup');
    if (!el) return;

    const img = el.querySelector('img');
    if (img) img.src = _mcdEggCharacterSrc();

    el.classList.remove('hidden');
    el.classList.add('flex');
    clearTimeout(_mcdEggHideTimeout);
    _mcdEggHideTimeout = setTimeout(_mcdEggHide, MCD_EGG_VISIBLE_MS);
}

function _mcdEggHide() {
    const el = document.getElementById('mcdEggPopup');
    if (el) {
        el.classList.add('hidden');
        el.classList.remove('flex');
    }
}

function _mcdEggTick() {
    if (_mcdEggBonusStageAvailable() && !_mcdEggAnotherToastVisible()) {
        _mcdEggShow();
    }
    setTimeout(_mcdEggTick, _mcdEggRandomGap());
}

document.addEventListener('DOMContentLoaded', () => {
    // Same fix as the Conmen easter egg: .medieval-mode/.conmen-mode
    // animate `filter` on <body>, which silently breaks position:fixed
    // for descendants (turns "fixed to the window" into "fixed to the
    // whole scrollable page"). Moving this to be a child of <html>
    // instead of <body> sidesteps it.
    const popupEl = document.getElementById('mcdEggPopup');
    if (popupEl) document.documentElement.appendChild(popupEl);

    setTimeout(_mcdEggTick, _mcdEggRandomGap());
});
