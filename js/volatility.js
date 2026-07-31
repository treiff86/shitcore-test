/* ============================================================
   MARKET VOLATILITY ENGINE
   ============================================================
   Passive difficulty mechanic. Every VOLATILITY_INTERVAL_SECONDS
   of active play (ticked from the same 1-second heartbeat as
   everything else in main.js), your wallet cash takes a random
   "correction" hit - just for having the tab open, on top of
   every other way this game already finds to take your money.

   Normal correction: -1% to -10% of current cash.
   Black Swan (BLACK_SWAN_CHANCE): -25% instead. Rare, and rolled
   BEFORE the normal range so it fully replaces it on the frames
   it hits, not stacked on top.
   ============================================================ */

const VOLATILITY_INTERVAL_SECONDS = 300;   // 5 minutes of active play
const VOLATILITY_MIN_PCT = 1;
const VOLATILITY_MAX_PCT = 10;
const BLACK_SWAN_CHANCE = 0.0001;          // 0.01%
const BLACK_SWAN_PCT = 25;

let volatilityTickCounter = 0;

const CORRECTION_LINES = [
    (pct, amt) => `📉 MARKET CORRECTION: Nobody knows why, but everything's down. Portfolio -${pct}% ($${amt}).`,
    (pct, amt) => `📉 MARKET CORRECTION: A whale sneezed on Twitter. -${pct}% ($${amt}).`,
    (pct, amt) => `📉 MARKET CORRECTION: Macro headwinds, or possibly just vibes. -${pct}% ($${amt}).`,
    (pct, amt) => `📉 MARKET CORRECTION: "Healthy pullback," probably. -${pct}% ($${amt}).`,
    (pct, amt) => `📉 MARKET CORRECTION: Someone in a Discord said "sell," and it happened. -${pct}% ($${amt}).`,
    (pct, amt) => `📉 MARKET CORRECTION: Line went down for absolutely no reason. -${pct}% ($${amt}).`,
    (pct, amt) => `📉 MARKET CORRECTION: An algorithm somewhere panicked. -${pct}% ($${amt}).`,
];

const BLACK_SWAN_LINES = [
    (amt) => `🦢 BLACK SWAN EVENT! An exchange somewhere collapsed and dragged your bag down with it. -25% wallet ($${amt}).`,
    (amt) => `🦢 BLACK SWAN EVENT! A stablecoin briefly wasn't. Contagion. -25% wallet ($${amt}).`,
    (amt) => `🦢 BLACK SWAN EVENT! Regulators in a country you can't find on a map just banned "this sort of thing." -25% wallet ($${amt}).`,
    (amt) => `🦢 BLACK SWAN EVENT! Nobody knows what happened. Everybody lost money. -25% wallet ($${amt}).`,
];

function processMarketVolatility() {
    if (!state.cash || state.cash <= 0) return;

    const isBlackSwan = Math.random() < BLACK_SWAN_CHANCE;
    const pct = isBlackSwan
        ? BLACK_SWAN_PCT
        : VOLATILITY_MIN_PCT + Math.random() * (VOLATILITY_MAX_PCT - VOLATILITY_MIN_PCT);

    const before = state.cash;
    state.cash = Math.max(0, state.cash * (1 - pct / 100));
    const lostAmt = (before - state.cash).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pctLabel = pct.toFixed(2);

    playSound(isBlackSwan ? 'rug' : 'alarm');
    showToast(
        isBlackSwan ? randomFrom(BLACK_SWAN_LINES)(lostAmt) : randomFrom(CORRECTION_LINES)(pctLabel, lostAmt),
        isBlackSwan ? "error" : "info"
    );

    updateUI();
    saveGame();
}

/** Called once per second from main.js's heartbeat. */
function tickMarketVolatility() {
    volatilityTickCounter++;
    if (volatilityTickCounter >= VOLATILITY_INTERVAL_SECONDS) {
        volatilityTickCounter = 0;
        processMarketVolatility();
    }
}
