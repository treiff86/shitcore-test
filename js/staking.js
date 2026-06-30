/* ============================================================
   PONZI POOLS & LIQUIDATION ALGORITHMS
   ============================================================
   New in this version:
   - Blackhole Liquidity Devourer APY bumped to 42069%.
   - Withdrawing principal now carries a tiny 0.01% rug risk,
     same severity tier as every other "you're starting over"
     event elsewhere in the game.
   - Live Yield Logs is now actually alive: an ambient ticker
     posts fake third-party deposits/withdrawals/harvests/drains
     constantly (same energy as the Markets chain feed), PLUS
     real reactive lines whenever the player deposits, withdraws,
     or harvests.
   - Harvesting and withdrawing both still add straight to
     wallet cash only — neither counts toward lifetimeEarned.
   ============================================================ */

const POOLS = [
    { id: 'toilet', name: "Porcelain Yield Slip", apy: 420 },
    { id: 'nuclear', name: "Plutonium Compound Core", apy: 6900 },
    { id: 'singularity', name: "Blackhole Liquidity Devourer", apy: 42069 }
];

const WITHDRAW_RUG_CHANCE = 0.0001; // 0.01%
const AMBIENT_YIELD_LOG_INTERVAL_MS = 1800;

/* ---- small, self-contained helpers (duplicated on purpose so this
   file never depends on markets.js having loaded first) ---- */

function randomFromYield(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function randomYieldWallet() {
    const hex = '0123456789abcdef';
    let s = '0x';
    for (let i = 0; i < 4; i++) s += hex[Math.floor(Math.random() * 16)];
    return s + '...' + Math.floor(Math.random() * 900 + 100);
}
function randomYieldAmt() { return (Math.random() * 9000 + 50).toFixed(2); }

/* ---- flavor pools ---- */

const STAKE_DEPOSIT_LINES = [
    (amt, pool) => `You deposited $${amt} into ${pool}. The pool says "thank you for your sacrifice."`,
    (amt, pool) => `$${amt} locked into ${pool}. Definitely not a pyramid scheme (it is).`,
    (amt, pool) => `Fresh $${amt} liquidity added to ${pool}. Somewhere, an early depositor smiles.`,
    (amt, pool) => `$${amt} just entered ${pool}. The smart contract says "more."`,
    (amt, pool) => `You handed ${pool} $${amt}. The pool doesn't say thank you. It never does.`,
    (amt, pool) => `$${amt} deposited into ${pool}. Your wallet cries, your hopium soars.`,
    (amt, pool) => `${pool} received $${amt}. APY is not a promise. APY is a suggestion.`,
    (amt, pool) => `$${amt} successfully laundered into ${pool}. Totally normal financial activity.`,
    (amt, pool) => `You deposited $${amt}. The whitepaper said this was "risk-free." The whitepaper lied.`,
    (amt, pool) => `$${amt} into ${pool}. The dev's rent is covered for another month.`,
    (amt, pool) => `You voluntarily gave ${pool} $${amt}. No refunds. Also no audit. Also no team.`,
    (amt, pool) => `${pool} is now holding $${amt} of yours. "Holding" is doing a lot of work in that sentence.`,
    (amt, pool) => `$${amt} entered the ${pool} vault. The vault has very thin walls.`,
    (amt, pool) => `Deposited $${amt} into ${pool}. The router said "confirmed." The dev said "nice."`,
    (amt, pool) => `You are now staking $${amt} in ${pool}. This is either genius or a cautionary tale.`,
    (amt, pool) => `You committed $${amt} to ${pool}. The smart contract committed to nothing in return.`,
    (amt, pool) => `$${amt} added to ${pool}. The TVL chart goes up. So does the dev's confidence.`,
    (amt, pool) => `Deposit confirmed: $${amt} into ${pool}. The lockup period was mentioned. You didn't read it.`,
    (amt, pool) => `$${amt} flows into ${pool}. Somewhere, a smart contract giggles.`,
    (amt, pool) => `You staked $${amt} in ${pool}. The vault's TVL graph now has a small, hopeful bump.`,
    (amt, pool) => `${pool} absorbed $${amt} like it was nothing. To the protocol, it was nothing.`,
    (amt, pool) => `$${amt} deposited. ${pool}'s smart contract has 0 comments and 1 owner-only function. Cool.`,
    (amt, pool) => `You sent $${amt} to ${pool}. The blockchain says "transaction confirmed." Your gut says "uh oh."`,
    (amt, pool) => `${pool} now has your $${amt}. You now have a number on a screen that goes up sometimes.`,
    (amt, pool) => `$${amt} into ${pool}. The yield farm just got a little more fertile, or a little more cursed.`,
    (amt, pool) => `You committed $${amt} of life savings (or lunch money) to ${pool}. Either way, brave.`,
    (amt, pool) => `${pool} accepted your $${amt} without so much as a receipt. Trust the process.`,
    (amt, pool) => `$${amt} deposited into ${pool}. Risk disclosure: there was no risk disclosure.`,
    (amt, pool) => `You're in. $${amt} locked into ${pool}. The exit door is theoretical.`,
    (amt, pool) => `${pool} just got $${amt} richer. You just got $${amt} more invested in a number going up.`,
    (amt, pool) => `$${amt} staked. ${pool}'s tokenomics PDF has a typo in the word "tokenomics."`,
    (amt, pool) => `You deposited $${amt} into ${pool}. The dev's Lambo fund says thank you.`,
    (amt, pool) => `${pool} swallowed $${amt} whole. It has done this before. It will do this again.`,
    (amt, pool) => `$${amt} added to ${pool}. The smart contract was audited by a Discord bot named "AuditBot9000."`,
    (amt, pool) => `Deposit successful: $${amt}. ${pool} promises returns. ${pool} does not promise anything else.`,
    (amt, pool) => `$${amt} entered ${pool}. The vault's only security feature is optimism.`,
    (amt, pool) => `You gave ${pool} $${amt} on the strength of a Telegram sticker pack alone.`,
    (amt, pool) => `${pool} received $${amt}. The smart contract's only test was "does it deploy." It deployed.`,
    (amt, pool) => `$${amt} into ${pool}. Somewhere, an APY counter just got a little more unhinged.`,
    (amt, pool) => `You staked $${amt}. ${pool}'s roadmap is a single PNG with a rocket on it.`,
    (amt, pool) => `${pool} now holds $${amt} more of other people's money, which is the entire business model.`,
    (amt, pool) => `$${amt} deposited. The "team" behind ${pool} is one guy and a logo he made in Canva.`,
    (amt, pool) => `You committed $${amt} to ${pool}, a decision your future self will have feelings about.`,
    (amt, pool) => `${pool} accepted $${amt}. No KYC, no questions, no guarantees, no problem (probably).`,
    (amt, pool) => `$${amt} added to the pile. ${pool}'s pile is now slightly more concerning.`,
    (amt, pool) => `You deposited $${amt} into ${pool} based on a 280-character thread and a gut feeling.`,
    (amt, pool) => `${pool} just locked in $${amt} of yours. The lock has no key. There was never a key.`,
    (amt, pool) => `$${amt} staked. ${pool}'s smart contract source code is "coming soon," same as the audit.`,
    (amt, pool) => `You sent ${pool} $${amt} and received a warm feeling and absolutely no other guarantees.`,
    (amt, pool) => `${pool} grew by $${amt}. So did the gap between you and your money.`,
];

const STAKE_WITHDRAW_LINES = [
    (amt, pool) => `You pulled $${amt} out of ${pool} clean. Smart move, or a lucky one.`,
    (amt, pool) => `$${amt} successfully extracted from ${pool} before anyone noticed.`,
    (amt, pool) => `Principal of $${amt} returned from ${pool}. The vault sheds a single tear.`,
    (amt, pool) => `$${amt} back in your wallet. ${pool} has trust issues now.`,
    (amt, pool) => `Clean exit: $${amt} from ${pool}. Congratulations on your continued existence.`,
    (amt, pool) => `You withdrew $${amt}. The Discord mod called it "fud." You called it "financial sanity."`,
    (amt, pool) => `$${amt} pulled from ${pool}. Somewhere a bagholder is being told to "zoom out."`,
    (amt, pool) => `Withdrawal complete: $${amt}. ${pool} remains. Your survival instincts are intact.`,
    (amt, pool) => `$${amt} extracted from ${pool} without incident. An increasingly rare outcome.`,
    (amt, pool) => `You took $${amt} back from ${pool}. Paper hands? More like "hands attached to a functioning brain."`,
    (amt, pool) => `$${amt} landed safely. ${pool} waves goodbye. The wave looks suspicious.`,
    (amt, pool) => `Funds returned: $${amt}. The Telegram group is calling you a traitor. You don't care.`,
    (amt, pool) => `$${amt} out of ${pool}. Profit? Maybe. Alive? Yes. That's something.`,
    (amt, pool) => `Your $${amt} principal is home. ${pool} has already found a replacement.`,
    (amt, pool) => `$${amt} withdrawal processed. The protocol logged it as "unexpected user rationality."`,
    (amt, pool) => `$${amt} pulled from ${pool} with zero drama. A rare and beautiful thing.`,
    (amt, pool) => `You requested $${amt} back from ${pool}. ${pool} actually complied. Shocking.`,
    (amt, pool) => `$${amt} exited ${pool} safely. Somewhere, a risk manager would be proud, if this game had one.`,
    (amt, pool) => `Withdrawal of $${amt} processed. ${pool} pretends not to be hurt by this.`,
    (amt, pool) => `$${amt} is back where it belongs: your wallet, not someone else's yield farm.`,
    (amt, pool) => `You cashed out $${amt} from ${pool}. The Discord will call this "weak hands." Ignore them.`,
    (amt, pool) => `${pool} released $${amt} without a fight. The vault's PR team is relieved.`,
    (amt, pool) => `$${amt} withdrawn. ${pool}'s TVL chart just took a small, personal hit.`,
    (amt, pool) => `You got $${amt} out of ${pool} before the next "unexpected liquidity event."`,
    (amt, pool) => `Principal recovered: $${amt}. ${pool} will simply find a new depositor. It always does.`,
    (amt, pool) => `$${amt} pulled. ${pool} posts a tweet about "diamond hands" anyway. Ironic.`,
    (amt, pool) => `You withdrew $${amt} from ${pool}. The exit liquidity gods smiled on you today.`,
    (amt, pool) => `$${amt} is yours again. ${pool} keeps the lights on with the next sucker's deposit.`,
    (amt, pool) => `Withdrawal complete: $${amt}. You read the contract once. You'll never do it again, but you read it.`,
    (amt, pool) => `$${amt} successfully removed from ${pool}. The vault's "lock" was apparently more of a "suggestion."`,
    (amt, pool) => `You took back $${amt}. ${pool} will absolutely still be advertising 6-figure APY tomorrow.`,
    (amt, pool) => `$${amt} withdrawn clean. Future you sends a small thank-you note to present you.`,
    (amt, pool) => `${pool} let go of $${amt}. It did not want to. It rarely does.`,
    (amt, pool) => `$${amt} back in your wallet. ${pool}'s next victim is already filling out the deposit form.`,
    (amt, pool) => `You extracted $${amt} from ${pool}. The smart contract logged it as "regrettable."`,
    (amt, pool) => `$${amt} withdrawn. ${pool}'s APY number remains aggressively, suspiciously high.`,
    (amt, pool) => `Funds out: $${amt}. ${pool} immediately runs a "limited time deposit bonus" to refill the bags.`,
    (amt, pool) => `$${amt} pulled from ${pool}. No fireworks, no drama, just a clean exit. Cherish it.`,
    (amt, pool) => `You withdrew $${amt}. ${pool} thanks you for your contribution to its liquidity, briefly.`,
    (amt, pool) => `$${amt} is safely yours. ${pool} is already pitching the next depositor on "sustainable yield."`,
    (amt, pool) => `Withdrawal successful: $${amt}. The vault's withdrawal button worked. Mark the date.`,
    (amt, pool) => `$${amt} returned from ${pool}. The protocol's Twitter bio still says "rug-proof." It is not.`,
    (amt, pool) => `You got $${amt} out before the music stopped. ${pool}'s chairs are running low.`,
    (amt, pool) => `$${amt} withdrawn. ${pool} files this under "acceptable losses" and moves on.`,
    (amt, pool) => `Principal of $${amt} secured. ${pool} will be just fine. It always finds new liquidity.`,
    (amt, pool) => `$${amt} out clean. ${pool}'s next APY announcement is, somehow, even higher.`,
    (amt, pool) => `You withdrew $${amt} from ${pool}. The vault's smart contract has no feelings, but if it did.`,
    (amt, pool) => `$${amt} returned. ${pool} remains exactly as audited as before: not at all.`,
    (amt, pool) => `Withdrawal of $${amt} confirmed. ${pool}'s Discord mods are already drafting the "don't panic" message for others.`,
    (amt, pool) => `$${amt} back home. ${pool} keeps spinning, waiting for the next deposit to keep the lights on.`,
];

const STAKE_WITHDRAW_RUGGED_LINES = [
    (amt) => `Your withdrawal request for $${amt} got "processed" by a contract that no longer exists.... DRAIN.`,
    (amt) => `The withdrawal queue was actually just a funnel to the dev wallet. $${amt} gone.`,
    (amt) => `A "routine maintenance" event ate your $${amt} withdrawal mid-transaction. Routine, apparently.`,
    (amt) => `$${amt} withdrawal initiated... routed to offshore mixer... marked as complete. It was not complete.`,
    (amt) => `The "emergency timelock" activated during your $${amt} withdrawal. Permanently.`,
    (amt) => `Your $${amt} triggered an "anti-bot protection" clause on the way out. You were not a bot.`,
    (amt) => `Withdrawal of $${amt} failed with error code 0x5C4M. Dev is "looking into it."`,
    (amt) => `$${amt} withdrawal entered the queue. The queue had exactly one exit: the dev's Coinbase.`,
    (amt) => `An MEV bot front-ran your $${amt} withdrawal with a better withdrawal. Yours was cancelled.`,
    (amt) => `The protocol detected your $${amt} and reclassified it as "protocol-owned liquidity." Goodbye.`,
    (amt) => `The withdraw button worked perfectly. The funds it sent went to a wallet that wasn't yours. $${amt} gone.`,
    (amt) => `Your $${amt} withdrawal was "delayed for security review." The review concluded: it's gone.`,
    (amt) => `A smart contract upgrade silently swapped the withdraw function for a black hole. $${amt} in.`,
    (amt) => `The vault's "emergency pause" activated the instant your $${amt} tried to leave. Convenient timing.`,
    (amt) => `Your $${amt} withdrawal got sandwiched by the protocol's own treasury wallet. Self-inflicted, somehow.`,
    (amt) => `The smart contract's withdraw function had a typo. The typo redirected $${amt} to "0xDEAD."`,
    (amt) => `A "liquidity rebalancing event" occurred at the precise moment of your $${amt} exit. Suspicious timing.`,
    (amt) => `Your withdrawal of $${amt} was routed through a "yield optimizer" that optimized it directly into the void.`,
    (amt) => `The dev's wallet executed a function called withdrawAllToMe(). Yours was included. $${amt} gone.`,
    (amt) => `A "temporary" smart contract pause on withdrawals became permanent the instant after your $${amt} request.`,
    (amt) => `Your $${amt} got caught in a "cross-chain bridge exploit" that this pool definitely should not have been exposed to.`,
    (amt) => `The protocol's "fair withdrawal queue" was alphabetical by wallet, and yours never came up. $${amt} stuck, then gone.`,
    (amt) => `Withdrawal of $${amt} approved by governance vote. Governance was three wallets. All three were the dev.`,
    (amt) => `Your $${amt} exit transaction got front-run by the protocol's own "treasury management" bot.`,
    (amt) => `The vault's withdraw function silently called transferToDev() instead. $${amt} relocated accordingly.`,
    (amt) => `A "security incident" was disclosed 4 minutes after your $${amt} withdrawal vanished. Coincidence, surely.`,
    (amt) => `Your $${amt} withdrawal succeeded, technically. It just succeeded into someone else's wallet.`,
    (amt) => `The smart contract interpreted your withdrawal of $${amt} as a "donation." There is no undo button.`,
    (amt) => `A rogue admin key, which definitely should not have existed, redirected your $${amt} mid-transaction.`,
    (amt) => `Your $${amt} got stuck behind a "withdrawal fee" of exactly 100%. The fee structure was never disclosed.`,
    (amt) => `The protocol's withdrawal contract self-destructed the moment your $${amt} request was confirmed.`,
    (amt) => `Your $${amt} withdrawal triggered a "circuit breaker" that, oddly, only ever breaks in one direction.`,
    (amt) => `A "smart contract migration" moved everyone's funds to a new address. You were not given the new address.`,
    (amt) => `Your $${amt} exit was flagged as "suspicious activity" by the protocol that, itself, is the suspicious activity.`,
    (amt) => `The withdraw function called the right method with the wrong recipient. The recipient was the dev. $${amt} gone.`,
    (amt) => `Your $${amt} withdrawal cleared the mempool, then mysteriously cleared your wallet instead of crediting it.`,
    (amt) => `A "yield harvesting bot" intercepted your $${amt} withdrawal and harvested it directly into nonexistence.`,
    (amt) => `The protocol's withdrawal logic was, it turns out, just a function called keepItAllHaha().`,
    (amt) => `Your $${amt} got "temporarily locked for compliance reasons." The compliance department was a single wallet.`,
];

const STAKE_HARVEST_LINES = [
    (amt) => `You harvested $${amt} in yield. The printer go brrr, briefly.`,
    (amt) => `$${amt} in "generated yield derivatives" successfully laundered into your wallet.`,
    (amt) => `$${amt} claimed. Definitely real money, not just numbers going up.`,
    (amt) => `Harvest complete: $${amt}. The APY was real for exactly this long.`,
    (amt) => `$${amt} harvested. The pool is slightly less ponzi-shaped than a moment ago.`,
    (amt) => `You claimed $${amt}. Technically "yield." Technically "printed from nothing." Both true.`,
    (amt) => `Yield harvested: $${amt}. The math didn't add up but the button worked.`,
    (amt) => `$${amt} successfully extracted from the yield module. Spend it before the protocol reconsiders.`,
    (amt) => `Rewards claimed: $${amt}. Origin of funds: vibes. Destination: your wallet.`,
    (amt) => `$${amt} harvested from the void. Economics professors across the world felt something.`,
    (amt) => `You pressed harvest. $${amt} appeared. No one is entirely sure why, but here we are.`,
    (amt) => `Harvest: $${amt}. That's the power of 42069% APY, baby. Sustainable? No. Delicious? Yes.`,
    (amt) => `$${amt} collected from the yield trap. The trap remains set for the next person.`,
    (amt) => `Rewards unlocked: $${amt}. The protocol's accountant filed a complaint. No one read it.`,
    (amt) => `$${amt} harvested clean. The early depositor in you would be proud.`,
    (amt) => `$${amt} claimed before the pool noticed. Quick hands, good instincts.`,
    (amt) => `Yield of $${amt} locked in. The APY counter immediately started adjusting to compensate.`,
    (amt) => `$${amt} harvested. The smart contract has no idea why it gave you this. Neither do you.`,
    (amt) => `You claimed $${amt} in freshly minted hopium. Spendable, for now.`,
    (amt) => `$${amt} of "passive income" landed. The dev's Lambo payment is still larger.`,
    (amt) => `Harvest button clicked, $${amt} received. The yield was real until proven otherwise.`,
    (amt) => `$${amt} dropped into your wallet like nothing happened. The pool still pretends nothing happened.`,
    (amt) => `You scooped $${amt} from the top of the yield pile before someone else could.`,
    (amt) => `$${amt} claimed. This is what "number go up" feels like at the bottom of the stack.`,
    (amt) => `Yield extraction complete: $${amt}. The token supply somewhere silently increased to cover it.`,
    (amt) => `$${amt} in rewards, freshly printed from the protocol's inflationary fever dream.`,
    (amt) => `You harvested $${amt}. This does not prove the pool is safe. It proves you were fast.`,
    (amt) => `$${amt} claimed. The protocol says "you're welcome." It did not contribute this money. You did.`,
    (amt) => `Harvest complete: $${amt}. The APY counter didn't even flinch. It has seen worse.`,
    (amt) => `$${amt} landed. The yield came from new deposits funding old rewards. As is tradition.`,
    (amt) => `You made $${amt} today. Somewhere, someone who deposited after you is funding your exit.`,
    (amt) => `$${amt} harvested. The protocol's liquidity runway just got 0.003% shorter.`,
    (amt) => `Rewards claimed: $${amt}. No animals were harmed. Several wallets were.`,
    (amt) => `$${amt} in yield, successfully extracted before the next "unexpected liquidity event."`,
    (amt) => `You collected $${amt}. The Ponzi thanks you for your patience and your principal.`,
];

const STAKE_EXPLOIT_LINES = [
    `Flash loan structural liquidation drained your principal.... DRAIN.`,
    `An anonymous dev forked the vault mid-harvest, removed the withdraw function, and vanished. Classic.`,
    `The audit said "low risk." The audit was written by the dev. Principal: gone.`,
    `A governance vote passed while you were sleeping: "transfer all funds to treasury." You weren't on the committee.`,
    `The "insurance fund" that was supposed to cover this? It was also in this pool.`,
    `Someone found a reentrancy bug and found it before you found your money.`,
    `A 0-day exploit in the reward-distribution function redistributed your funds to the explorer.`,
    `The protocol "upgraded" mid-harvest. The new version doesn't have a withdrawal function. Noted.`,
    `A flash loan attack drained the pool in 3 transactions. Transaction 1 was your harvest request.`,
    `The multisig wallet executed a "strategic reallocation." You were not a signer.`,
    `A "price oracle manipulation" event coincided exactly with your harvest. Principal: confiscated.`,
    `The protocol's emergency shutdown function was triggered. "Emergency" being defined loosely here.`,
    `An undisclosed admin key executed exitAll() at 3:47 AM. Your principal exited into someone else's wallet.`,
    `The reward contract called selfdestruct() during your transaction. This was a feature, apparently.`,
    `A sandwich attack at the contract level front-ran your harvest and took the principal as a "fee."`,
    `The timelock protecting the vault was set to 0 blocks. The dev didn't wait.`,
    `Your harvest triggered a cascading liquidation that ate the entire pool, starting with your deposit.`,
    `The protocol posted a Medium article titled "Post-Mortem" while your transaction was still pending.`,
    `An oracle returned a price of $0 for one second. The contract acted accordingly.`,
    `The "safe" modifier on the withdraw function had a typo. The typo cost you your principal.`,
    `A governance proposal to "reallocate idle liquidity" passed 3-0. The committee was three dev wallets.`,
    `The smart contract hit an integer overflow. The overflow direction was not in your favor.`,
    `Your harvest transaction confirmed in the same block as a drain function. The drain went first.`,
    `A "liquidity migration" was announced 2 seconds after your principal was moved. You were not migrated.`,
    `The protocol's telegram announced "temporary issues" as your principal was permanently relocated.`,
    `A whitehat hacker drained the pool to "protect it." They returned zero funds. Very white hat.`,
    `The yield farm's underlying asset depegged to $0 during your transaction. Principal: vaporized.`,
    `An "economic attack" exploited the exact function you called, at the exact moment you called it.`,
    `The protocol ran out of liquidity to pay your rewards and compensated you with the principal instead. Incorrectly.`,
    `Someone posted the private key to the admin wallet in the public Discord. You were already too late.`,
];

const AMBIENT_YIELD_TEMPLATES = [
    { tag: 'DEPOSIT', color: 'text-green-400', text: () => `${randomYieldWallet()} deposited ${randomYieldAmt()} USDSHT into ${randomFromYield(POOLS).name}. Bold strategy.` },
    { tag: 'DEPOSIT', color: 'text-green-400', text: () => `${randomYieldWallet()} just yolo'd ${randomYieldAmt()} USDSHT into ${randomFromYield(POOLS).name}. No questions asked.` },
    { tag: 'DEPOSIT', color: 'text-green-400', text: () => `New bag: ${randomYieldWallet()} dropped ${randomYieldAmt()} into ${randomFromYield(POOLS).name}. The pool says thanks.` },
    { tag: 'DEPOSIT', color: 'text-green-400', text: () => `${randomYieldWallet()} deposited ${randomYieldAmt()} USDSHT. The smart contract's TVL counter went up, morale unchanged.` },
    { tag: 'DEPOSIT', color: 'text-green-400', text: () => `Fresh liquidity: ${randomYieldWallet()} added ${randomYieldAmt()} to ${randomFromYield(POOLS).name}. Another bagholder acquired.` },
    { tag: 'WITHDRAW', color: 'text-amber-400', text: () => `${randomYieldWallet()} withdrew ${randomYieldAmt()} USDSHT from ${randomFromYield(POOLS).name}. Got out clean, allegedly.` },
    { tag: 'WITHDRAW', color: 'text-amber-400', text: () => `${randomYieldWallet()} pulled ${randomYieldAmt()} from ${randomFromYield(POOLS).name}. Congratulations on your continued financial existence.` },
    { tag: 'WITHDRAW', color: 'text-amber-400', text: () => `${randomYieldWallet()} exited ${randomFromYield(POOLS).name} with ${randomYieldAmt()}. The Discord called it "fud." They didn't care.` },
    { tag: 'WITHDRAW', color: 'text-amber-400', text: () => `Principal recovered: ${randomYieldWallet()} got ${randomYieldAmt()} out of ${randomFromYield(POOLS).name}. Rare outcome. Celebrated accordingly.` },
    { tag: 'HARVEST', color: 'text-emerald-400', text: () => `${randomYieldWallet()} harvested ${randomYieldAmt()} USDSHT in yield. Definitely sustainable.` },
    { tag: 'HARVEST', color: 'text-emerald-400', text: () => `${randomYieldWallet()} claimed ${randomYieldAmt()} in freshly minted hopium from ${randomFromYield(POOLS).name}.` },
    { tag: 'HARVEST', color: 'text-emerald-400', text: () => `Yield collected: ${randomYieldWallet()} extracted ${randomYieldAmt()} from ${randomFromYield(POOLS).name} before the music stopped.` },
    { tag: 'HARVEST', color: 'text-emerald-400', text: () => `${randomYieldWallet()} pressed harvest on ${randomFromYield(POOLS).name}. ${randomYieldAmt()} appeared. The laws of economics wept.` },
    { tag: 'DRAIN', color: 'text-rose-500 font-bold', text: () => `${randomYieldWallet()} tried harvesting from ${randomFromYield(POOLS).name}.... DRAIN. Principal: gone.` },
    { tag: 'DRAIN', color: 'text-rose-500 font-bold', text: () => `${randomYieldWallet()} hit harvest on ${randomFromYield(POOLS).name}. Got a flash loan to the face instead. Principal: relocated.` },
    { tag: 'DRAIN', color: 'text-rose-500 font-bold', text: () => `Exploit confirmed: ${randomYieldWallet()} lost ${randomYieldAmt()} USDSHT from ${randomFromYield(POOLS).name}. Post-mortem pending, refund not.` },
    { tag: 'DRAIN', color: 'text-rose-500 font-bold', text: () => `${randomYieldWallet()} tried to exit ${randomFromYield(POOLS).name}. The pool had other plans for their ${randomYieldAmt()}.` },
    { tag: 'WHALE', color: 'text-blue-400', text: () => `A whale just deposited ${randomYieldAmt()} USDSHT into ${randomFromYield(POOLS).name} in a single block.` },
    { tag: 'WHALE', color: 'text-blue-400', text: () => `Whale alert: ${randomYieldWallet()} dumped ${randomYieldAmt()} USDSHT into ${randomFromYield(POOLS).name}. APY dropped 0.0001% and nobody noticed.` },
    { tag: 'WHALE', color: 'text-blue-400', text: () => `${randomYieldWallet()} (suspected whale) entered ${randomFromYield(POOLS).name} with ${randomYieldAmt()}. Everyone is watching this wallet now.` },
    { tag: 'RUG', color: 'text-rose-500', text: () => `A "withdrawal processing fee" quietly ate ${randomYieldAmt()} USDSHT from someone's exit. Cost of doing business.` },
    { tag: 'RUG', color: 'text-rose-500', text: () => `The ${randomFromYield(POOLS).name} vault just executed an "emergency protocol adjustment." ${randomYieldAmt()} adjusted to the dev's wallet.` },
    { tag: 'RUG', color: 'text-rose-500', text: () => `Admin function triggered: ${randomYieldAmt()} USDSHT "migrated" from ${randomFromYield(POOLS).name}. Migration destination undisclosed.` },
    { tag: 'APY', color: 'text-amber-400', text: () => `${randomFromYield(POOLS).name}'s APY just recalculated itself. The math still doesn't check out.` },
    { tag: 'APY', color: 'text-amber-400', text: () => `${randomFromYield(POOLS).name} APY spiked to a number that implies impossible returns. Telegram is very excited.` },
    { tag: 'APY', color: 'text-amber-400', text: () => `"Sustainable yield" update: ${randomFromYield(POOLS).name} just printed more tokens to cover its APY promises.` },
    { tag: 'AUDIT', color: 'text-purple-400', text: () => `Someone asked if these pools are audited. The silence in the Discord was deafening.` },
    { tag: 'AUDIT', color: 'text-purple-400', text: () => `${randomFromYield(POOLS).name} audit report released. Page 1: "looks fine." Pages 2-40: blank.` },
    { tag: 'AUDIT', color: 'text-purple-400', text: () => `A security researcher flagged something in ${randomFromYield(POOLS).name}. The Discord mod banned them for "spreading fud."` },
    { tag: 'PANIC', color: 'text-rose-400', text: () => `${randomYieldWallet()} is asking in chat where the withdraw button is. There isn't one. There never was.` },
    { tag: 'PANIC', color: 'text-rose-400', text: () => `Multiple wallets attempting emergency exits from ${randomFromYield(POOLS).name}. The exit queue is "processing."` },
    { tag: 'PANIC', color: 'text-rose-400', text: () => `${randomYieldWallet()} posted "IS THE POOL OK" in all caps in 4 different Discord channels. No response from devs.` },
    { tag: 'PANIC', color: 'text-rose-400', text: () => `Sell pressure detected: ${randomYieldWallet()} is trying to withdraw ${randomYieldAmt()} but gas fees are "unexpectedly high."` },
    { tag: 'LOCK', color: 'text-gray-400', text: () => `${randomFromYield(POOLS).name} quietly updated its terms. Withdrawals now require a "7-day cooldown." Terms were not announced.` },
    { tag: 'LOCK', color: 'text-gray-400', text: () => `${randomYieldWallet()} just discovered their ${randomYieldAmt()} is "time-locked for security." Time-lock duration: undefined.` },
    { tag: 'TVL', color: 'text-blue-400', text: () => `${randomFromYield(POOLS).name} TVL: ${randomYieldAmt()} USDSHT. That number is made up but it sounds impressive.` },
    { tag: 'SHILL', color: 'text-green-400', text: () => `${randomFromYield(POOLS).name} trending on crypto Twitter. Three people tweeted about it, two are bots.` },
    { tag: 'SHILL', color: 'text-green-400', text: () => `"WAGMI" posted in ${randomFromYield(POOLS).name} Discord 47 times in the last hour. Dev has not posted once.` },
    { tag: 'COPY', color: 'text-gray-400', text: () => `A copycat protocol launched "${randomFromYield(POOLS).name} v2" with 10x the APY and half the code.` },
    { tag: 'COPY', color: 'text-gray-400', text: () => `Fork of ${randomFromYield(POOLS).name} deployed in 4 minutes using the original's exact bytecode. Rugged in 5.` },
];

/* ---- no-repeat helper for ambient yield log ---- */
const recentYieldIdxs = new Set();

function generateAmbientYieldLog() {
    const available = AMBIENT_YIELD_TEMPLATES
        .map((t, i) => ({ t, i }))
        .filter(({ i }) => !recentYieldIdxs.has(i));
    const pool = available.length > 0 ? available : AMBIENT_YIELD_TEMPLATES.map((t, i) => ({ t, i }));
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    recentYieldIdxs.add(chosen.i);
    if (recentYieldIdxs.size > Math.floor(AMBIENT_YIELD_TEMPLATES.length * 0.55)) {
        recentYieldIdxs.delete(recentYieldIdxs.values().next().value);
    }
    pushYieldLog(chosen.t.tag, chosen.t.text(), chosen.t.color);
}

/* ---- core pool logic ---- */

function renderPoolCards() {
    const container = document.getElementById('poolCardsContainer');
    if(!container || container.children.length > 0) return; // Prevent duplications

    container.innerHTML = POOLS.map(p => `
        <div id="pool-card-${p.id}" onclick="selectPool('${p.id}')" class="pool-card">
            <h4 class="font-bold text-white text-xs uppercase mb-1">${p.name}</h4>
            <div class="text-xl font-black font-mono text-amber-500 animate-pulse">${p.apy}% APY</div>
            <p class="text-[9px] text-gray-500 mt-2 font-mono">ID: ${p.id.toUpperCase()}_VAULT</p>
        </div>
    `).join('');
}

function selectPool(id) {
    POOLS.forEach(p => {
        const card = document.getElementById(`pool-card-${p.id}`);
        if(card) card.classList.remove('selected');
    });
    document.getElementById(`pool-card-${id}`).classList.add('selected');
    state.stakedPoolId = id;
    playSound('click');
}

function stakeTokens() {
    if(!state.stakedPoolId) { showToast("Select a structural yield card target first!"); return; }
    const amount = parseFloat(document.getElementById('stakeAmount').value) || 0;
    
    if(amount <= 0 || state.cash < amount) {
        showToast("Invalid allocation metrics requested!");
        return;
    }

    state.cash -= amount;
    state.stakedAmount += amount;
    state.lastHarvestOrStakeTime = Date.now();
    
    playSound('stake');
    document.getElementById('stakedLocked').innerText = `$${state.stakedAmount.toFixed(2)}`;
    document.getElementById('stakedPoolType').innerText = state.stakedPoolId.toUpperCase();

    const pool = POOLS.find(p => p.id === state.stakedPoolId);
    pushYieldLog('DEPOSIT', randomFromYield(STAKE_DEPOSIT_LINES)(amount.toFixed(2), pool ? pool.name : 'the pool'), 'text-green-400');

    saveGame();
    updateUI();
}

/** Pulls staked principal back to wallet cash. Tiny 0.01% rug risk on the
 *  way out — same severity tier as every other catastrophic event in the
 *  game. Does NOT touch lifetimeEarned: this is your own money coming
 *  back, not new earnings. */
function withdrawStake() {
    if (state.stakedAmount <= 0) {
        showToast("Nothing staked to withdraw.", "error");
        return;
    }

    const amount = state.stakedAmount;
    const poolName = (POOLS.find(p => p.id === state.stakedPoolId) || {}).name || 'the pool';

    if (Math.random() < WITHDRAW_RUG_CHANCE) {
        state.stakedAmount = 0;
        state.stakedPoolId = null;
        state.unclaimedRewards = 0;

        playSound('rug');
        pushYieldLog('DRAIN', randomFromYield(STAKE_WITHDRAW_RUGGED_LINES)(amount.toFixed(2)), 'text-red-500 font-extrabold');
        showAlertModal(`🚨 WITHDRAWAL RUGGED! Your $${amount.toFixed(2)} principal vanished mid-withdrawal. Classic.`);

        document.getElementById('stakedLocked').innerText = "$0.00";
        document.getElementById('stakedPoolType').innerText = "—";
        POOLS.forEach(p => { const c = document.getElementById(`pool-card-${p.id}`); if (c) c.classList.remove('selected'); });

        saveGame();
        updateUI();
        return;
    }

    state.cash += amount;
    state.stakedAmount = 0;
    state.stakedPoolId = null;

    playSound('click');
    showToast(`💵 Withdrew $${amount.toFixed(2)} in principal back to your wallet.`, "success");
    pushYieldLog('WITHDRAW', randomFromYield(STAKE_WITHDRAW_LINES)(amount.toFixed(2), poolName), 'text-amber-400');

    document.getElementById('stakedLocked').innerText = "$0.00";
    document.getElementById('stakedPoolType').innerText = "—";
    POOLS.forEach(p => { const c = document.getElementById(`pool-card-${p.id}`); if (c) c.classList.remove('selected'); });

    saveGame();
    updateUI();
}

function processStakingRewards() {
    if(state.stakedAmount <= 0 || !state.stakedPoolId) return;

    const pool = POOLS.find(p => p.id === state.stakedPoolId);
    if(!pool) return;

    // Realtime incremental generation matrix
    let rewardPerSec = (state.stakedAmount * (pool.apy / 100)) / (365 * 24 * 3600);
    state.unclaimedRewards += rewardPerSec;

    document.getElementById('unclaimedShitcoins').innerText = state.unclaimedRewards.toLocaleString('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});
}

function harvestRewards() {
    if(state.unclaimedRewards <= 0) return;

    // Exploit roll calculator configuration bounds
    if(Math.random() < 0.15) {
        pushYieldLog('DRAIN', randomFromYield(STAKE_EXPLOIT_LINES), 'text-rose-500 font-bold');
        state.stakedAmount = 0;
        state.unclaimedRewards = 0;
        state.stakedPoolId = null;
        playSound('liquidated');
        
        document.getElementById('stakedLocked').innerText = "$0.00";
        document.getElementById('stakedPoolType').innerText = "—";
        POOLS.forEach(p => { const c = document.getElementById(`pool-card-${p.id}`); if (c) c.classList.remove('selected'); });
        saveGame();
        updateUI();
        showAlertModal("⚠️ EXPLORED RESTRUCTURE! A rogue hacker group systematically frontran your withdrawal path, vaporizing 100% of your vault configurations.");
        return;
    }

    let harvested = state.unclaimedRewards;
    state.unclaimedRewards = 0;
    state.cash += harvested; // wallet cash only — does not count toward lifetimeEarned/Lambo

    const unclaimedEl = document.getElementById('unclaimedShitcoins');
    if (unclaimedEl) unclaimedEl.innerText = "0.0000";

    showToast(`🌾 Harvested +$${harvested.toFixed(2)} in generated yield derivatives!`, "success");
    pushYieldLog('HARVEST', randomFromYield(STAKE_HARVEST_LINES)(harvested.toFixed(2)), 'text-emerald-400');
    playSound('buy');
    saveGame();
    updateUI();
}

/* ============================================================
   WITHDRAW BUTTON + AMBIENT LOG TICKER
   Both self-initializing via JS — no HTML changes required.
   ============================================================ */

function setupWithdrawButton() {
    if (document.getElementById('withdrawStakeBtn')) return;

    const poolTypeEl = document.getElementById('stakedPoolType');
    if (!poolTypeEl) {
        setTimeout(setupWithdrawButton, 200); // DOM not ready yet, retry shortly
        return;
    }

    const infoBlock = poolTypeEl.closest('div');
    if (!infoBlock) return;

    const btnHtml = `
        <button id="withdrawStakeBtn" onclick="withdrawStake()" class="w-full mt-2 py-2 bg-amber-600 hover:bg-amber-500 text-black font-extrabold text-xs rounded-lg transition shadow-md uppercase tracking-wider">
            Withdraw Principal
        </button>`;
    infoBlock.insertAdjacentHTML('afterend', btnHtml);
}

document.addEventListener('DOMContentLoaded', () => {
    setupWithdrawButton();
    setInterval(generateAmbientYieldLog, AMBIENT_YIELD_LOG_INTERVAL_MS);
});
