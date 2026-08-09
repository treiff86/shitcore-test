/* ============================================================
   BITCOIN WIZARD - AOL-STYLE IM POPUPS
   ============================================================
   While the $MIM / Bitcoin Wizard (Win95) theme is active, an
   "instant message" window pops up in the bottom-right every so
   often - a random square wizard image plus a one-line quote,
   AIM-buddy-style. Closes itself after a few seconds, or on
   click of the X.

   Add more images any time: drop a square image in
   assets/wizard_popups/ and add one entry to WIZARD_POPUPS below
   (img path + quote). No limit on how many.

   Usage: WizardPopups.init() when entering the theme,
   WizardPopups.stop() when leaving it. Mirrors the
   BonusStage/FightGame start()/stop() naming on purpose.
   ============================================================ */
window.WizardPopups = (function () {
    'use strict';

    const WIZARD_POPUPS = [
        { img: 'assets/wizard_popups/45.webp', quote: 'Diagnosed: severe bag holding. Prescribed: more bags.' },
        { img: 'assets/wizard_popups/48.webp', quote: "Behind door number $MIM: more $MIM." },
        { img: 'assets/wizard_popups/2.webp', quote: 'Bite my shiny metal ape.' },
        { img: 'assets/wizard_popups/4.webp', quote: 'Do not eat. Do ape.' },
        { img: 'assets/wizard_popups/7.webp', quote: 'Minty fresh. Rug fresh too.' },
        { img: 'assets/wizard_popups/9.webp', quote: "The cauldron's just for show. The real magic's in the mint function." },
        { img: 'assets/wizard_popups/11.webp', quote: 'Bowled a strike. Missed the top by a country mile.' },
        { img: 'assets/wizard_popups/12.webp', quote: 'Membership has its privileges. So does liquidation.' },
        { img: 'assets/wizard_popups/13.webp', quote: 'Straight outta $MIM, a crazy mfer named Wiz.' },
        { img: 'assets/wizard_popups/14.webp', quote: 'The floor is lava. Also the ceiling. Also the chart.' },
        { img: 'assets/wizard_popups/15.webp', quote: 'Diamond hands run in the family. So does the liver damage.' },
        { img: 'assets/wizard_popups/18.webp', quote: "F#ck yea. NFA. DYOR. WAGMI. Etc." },
        { img: 'assets/wizard_popups/21.webp', quote: 'On island time. Also margin call time.' },
        { img: 'assets/wizard_popups/24.webp', quote: 'Everything floats down here. Mostly your portfolio.' },
        { img: 'assets/wizard_popups/32.webp', quote: 'Parental Advisory: Explicit Rugs.' },
        { img: 'assets/wizard_popups/33.webp', quote: 'Half-life of a shitcoin: about a weekend.' },
        { img: 'assets/wizard_popups/34.webp', quote: 'Struck by lightning. Also struck by the chart.' },
        { img: 'assets/wizard_popups/35.webp', quote: 'Built different. Built on ice, actually.' },
        { img: 'assets/wizard_popups/41.webp', quote: 'Side effects may include: believing in $MIM.' },
        { img: 'assets/wizard_popups/44.webp', quote: "It's not a cult. It's a community. With robes." },
    ];

    const MIN_DELAY = 45000, MAX_DELAY = 90000; // between popups
    const FIRST_DELAY_MIN = 10000, FIRST_DELAY_MAX = 20000; // before the first one
    const AUTO_DISMISS = 9000;

    let active = false;
    let timer = null, dismissTimer = null;
    let el = null;
    let lastIndex = -1;

    function rand(min, max) { return min + Math.random() * (max - min); }

    function pickNext() {
        if (WIZARD_POPUPS.length === 1) return WIZARD_POPUPS[0];
        let i;
        do { i = Math.floor(Math.random() * WIZARD_POPUPS.length); } while (i === lastIndex);
        lastIndex = i;
        return WIZARD_POPUPS[i];
    }

    // Don't interrupt Fight Game / Bonus Stage with a popup sliding in.
    function overlaysOpen() {
        const fg = document.getElementById('fightGameOverlay');
        const bs = document.getElementById('bonusStageOverlay');
        const fgOpen = fg && !fg.classList.contains('hidden');
        const bsOpen = bs && !bs.classList.contains('hidden');
        return fgOpen || bsOpen;
    }

    function ensureEl() {
        if (el) return el;
        el = document.createElement('div');
        el.id = 'wizardIMPopup';
        el.className = 'wizard-im-popup';
        el.innerHTML = `
            <img class="wizard-im-avatar" alt="Bitcoin Wizard">
            <p class="wizard-im-quote"></p>
            <button class="wizard-im-close" type="button" aria-label="Close">&times;</button>
        `;
        el.querySelector('.wizard-im-close').addEventListener('click', dismiss);
        document.body.appendChild(el);
        return el;
    }

    function showPopup() {
        if (!active) return;
        if (!document.body.classList.contains('win95-mode') || overlaysOpen() || document.hidden) {
            scheduleNext();
            return;
        }
        const pick = pickNext();
        const node = ensureEl();
        node.querySelector('.wizard-im-avatar').src = pick.img;
        node.querySelector('.wizard-im-quote').textContent = pick.quote;
        node.classList.remove('wizard-im-hide');
        // restart the slide-in animation even if a popup was already showing
        node.classList.remove('wizard-im-show');
        void node.offsetWidth;
        node.classList.add('wizard-im-show');

        clearTimeout(dismissTimer);
        dismissTimer = setTimeout(dismiss, AUTO_DISMISS);
    }

    function dismiss() {
        clearTimeout(dismissTimer);
        if (el) {
            el.classList.remove('wizard-im-show');
            el.classList.add('wizard-im-hide');
        }
        scheduleNext();
    }

    function scheduleNext(first) {
        clearTimeout(timer);
        if (!active) return;
        const delay = first ? rand(FIRST_DELAY_MIN, FIRST_DELAY_MAX) : rand(MIN_DELAY, MAX_DELAY);
        timer = setTimeout(showPopup, delay);
    }

    function init() {
        if (active) return;
        active = true;
        scheduleNext(true);
    }

    function stop() {
        active = false;
        clearTimeout(timer);
        clearTimeout(dismissTimer);
        if (el) { el.remove(); el = null; }
    }

    return { init, stop };
})();
