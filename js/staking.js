/* ============================================================
   PONZI POOLS & LIQUIDATION ALGORITHMS
   ============================================================ */

const POOLS = [
    { id: 'toilet',      name: "Porcelain Yield Slip",          apy: 420    },
    { id: 'nuclear',     name: "Plutonium Compound Core",        apy: 6900   },
    { id: 'singularity', name: "Blackhole Liquidity Devourer",   apy: 42069  }
];

const WITHDRAW_RUG_CHANCE         = 0.0001;  // 0.01%
const AMBIENT_YIELD_LOG_INTERVAL  = 1800;    // ms
let   ambientYieldTimer           = null;    // guard against double-start

/* ---- helpers ---- */
function randomFromYield(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomYieldWallet() {
    const h = '0123456789abcdef';
    let s = '0x';
    for (let i = 0; i < 4; i++) s += h[Math.floor(Math.random() * 16)];
    return s + '...' + Math.floor(Math.random() * 900 + 100);
}
function randomYieldAmt() { return (Math.random() * 9000 + 50).toFixed(2); }

function getStakedAmount()    { return parseFloat(state.stakedAmount)    || 0; }
function getUnclaimedRewards(){ return parseFloat(state.unclaimedRewards)|| 0; }

/* ============================================================
   FLAVOR POOLS
   ============================================================ */

const STAKE_DEPOSIT_LINES = [
    (a,p)=>`You deposited $${a} into ${p}. The pool says "thank you for your sacrifice."`,
    (a,p)=>`$${a} locked into ${p}. Definitely not a pyramid scheme (it is).`,
    (a,p)=>`Fresh $${a} liquidity added to ${p}. Somewhere, an early depositor smiles.`,
    (a,p)=>`$${a} just entered ${p}. The smart contract says "more."`,
    (a,p)=>`You handed ${p} $${a}. The pool doesn't say thank you. It never does.`,
    (a,p)=>`$${a} deposited into ${p}. Your wallet cries, your hopium soars.`,
    (a,p)=>`${p} received $${a}. APY is not a promise. APY is a suggestion.`,
    (a,p)=>`$${a} successfully laundered into ${p}. Totally normal financial activity.`,
    (a,p)=>`You deposited $${a}. The whitepaper said this was "risk-free." The whitepaper lied.`,
    (a,p)=>`$${a} into ${p}. The dev's rent is covered for another month.`,
    (a,p)=>`You voluntarily gave ${p} $${a}. No refunds. Also no audit. Also no team.`,
    (a,p)=>`${p} is now holding $${a} of yours. "Holding" is doing a lot of work in that sentence.`,
    (a,p)=>`$${a} entered the ${p} vault. The vault has very thin walls.`,
    (a,p)=>`Deposited $${a} into ${p}. The router said "confirmed." The dev said "nice."`,
    (a,p)=>`You are now staking $${a} in ${p}. This is either genius or a cautionary tale.`,
    (a,p)=>`$${a} added to ${p}. The TVL chart goes up. So does the dev's confidence.`,
    (a,p)=>`You committed $${a} to ${p}. The smart contract committed to nothing in return.`,
    (a,p)=>`$${a} into ${p}. The dev's Lambo fund says thank you.`,
    (a,p)=>`${p} swallowed $${a} whole. It has done this before. It will do this again.`,
    (a,p)=>`$${a} added to ${p}. The smart contract was audited by a Discord bot named "AuditBot9000."`,
    (a,p)=>`You sent ${p} $${a} and received a warm feeling and absolutely no other guarantees.`,
    (a,p)=>`${p} just locked in $${a} of yours. The lock has no key. There was never a key.`,
    (a,p)=>`$${a} staked. ${p}'s smart contract source code is "coming soon," same as the audit.`,
    (a,p)=>`${p} absorbed $${a} like it was nothing. To the protocol, it was nothing.`,
    (a,p)=>`$${a} into ${p}. Somewhere, an APY counter just got a little more unhinged.`,
    (a,p)=>`${p} now holds $${a} more of other people's money, which is the entire business model.`,
    (a,p)=>`You committed $${a} to ${p}, a decision your future self will have feelings about.`,
    (a,p)=>`Deposit confirmed: $${a} into ${p}. The lockup period was mentioned. You didn't read it.`,
    (a,p)=>`$${a} flows into ${p}. Somewhere, a smart contract giggles.`,
    (a,p)=>`$${a} deposited. The "team" behind ${p} is one guy and a logo he made in Canva.`,
    (a,p)=>`You gave ${p} $${a} on the strength of a Telegram sticker pack alone.`,
    (a,p)=>`$${a} staked. ${p}'s roadmap is a single PNG with a rocket on it.`,
    (a,p)=>`You sent ${p} $${a} without asking who controls the admin key. Bold.`,
    (a,p)=>`${p} accepted $${a} without so much as a receipt. Trust the process.`,
    (a,p)=>`$${a} deposited into ${p} based on a 280-character thread and a gut feeling.`,
];

const STAKE_WITHDRAW_LINES = [
    (a,p)=>`You pulled $${a} out of ${p} clean. Smart move, or a lucky one.`,
    (a,p)=>`$${a} successfully extracted from ${p} before anyone noticed.`,
    (a,p)=>`Principal of $${a} returned from ${p}. The vault sheds a single tear.`,
    (a,p)=>`$${a} back in your wallet. ${p} has trust issues now.`,
    (a,p)=>`Clean exit: $${a} from ${p}. Congratulations on your continued existence.`,
    (a,p)=>`You withdrew $${a}. The Discord mod called it "fud." You called it "financial sanity."`,
    (a,p)=>`$${a} pulled from ${p}. Somewhere a bagholder is being told to "zoom out."`,
    (a,p)=>`Withdrawal complete: $${a}. ${p} remains. Your survival instincts are intact.`,
    (a,p)=>`$${a} extracted from ${p} without incident. An increasingly rare outcome.`,
    (a,p)=>`You took $${a} back from ${p}. Paper hands? More like "hands attached to a functioning brain."`,
    (a,p)=>`$${a} landed safely. ${p} waves goodbye. The wave looks suspicious.`,
    (a,p)=>`Funds returned: $${a}. The Telegram group is calling you a traitor. You don't care.`,
    (a,p)=>`$${a} out of ${p}. Profit? Maybe. Alive? Yes. That's something.`,
    (a,p)=>`Your $${a} principal is home. ${p} has already found a replacement.`,
    (a,p)=>`$${a} withdrawal processed. The protocol logged it as "unexpected user rationality."`,
    (a,p)=>`$${a} pulled from ${p} with zero drama. A rare and beautiful thing.`,
    (a,p)=>`You requested $${a} back from ${p}. ${p} actually complied. Shocking.`,
    (a,p)=>`$${a} exited ${p} safely. A risk manager would be proud, if this game had one.`,
    (a,p)=>`You cashed out $${a} from ${p}. The Discord will call this "weak hands." Ignore them.`,
    (a,p)=>`${p} released $${a} without a fight. The vault's PR team is relieved.`,
    (a,p)=>`$${a} withdrawn. ${p}'s TVL chart just took a small, personal hit.`,
    (a,p)=>`You got $${a} out of ${p} before the next "unexpected liquidity event."`,
    (a,p)=>`$${a} is yours again. ${p} will simply find a new depositor. It always does.`,
    (a,p)=>`$${a} pulled. ${p} posts a tweet about "diamond hands" anyway. Ironic.`,
    (a,p)=>`You withdrew $${a} from ${p}. The exit liquidity gods smiled on you today.`,
    (a,p)=>`$${a} is yours again. ${p} keeps the lights on with the next sucker's deposit.`,
    (a,p)=>`$${a} back home. ${p} keeps spinning, waiting for the next deposit.`,
    (a,p)=>`You got $${a} out before the music stopped. ${p}'s chairs are running low.`,
    (a,p)=>`$${a} withdrawn. ${p} files this under "acceptable losses" and moves on.`,
    (a,p)=>`$${a} secured. ${p} remains exactly as audited as before: not at all.`,
];

const STAKE_WITHDRAW_RUGGED_LINES = [
    (a)=>`Your withdrawal request for $${a} got "processed" by a contract that no longer exists.... DRAIN.`,
    (a)=>`The withdrawal queue was actually just a funnel to the dev wallet. $${a} gone.`,
    (a)=>`A "routine maintenance" event ate your $${a} withdrawal mid-transaction. Routine, apparently.`,
    (a)=>`$${a} withdrawal initiated... routed to offshore mixer... marked as complete. It was not complete.`,
    (a)=>`The "emergency timelock" activated during your $${a} withdrawal. Permanently.`,
    (a)=>`Your $${a} triggered an "anti-bot protection" clause on the way out. You were not a bot.`,
    (a)=>`Withdrawal of $${a} failed with error code 0x5C4M. Dev is "looking into it."`,
    (a)=>`$${a} withdrawal entered the queue. The queue had exactly one exit: the dev's Coinbase.`,
    (a)=>`An MEV bot front-ran your $${a} withdrawal with a better withdrawal. Yours was cancelled.`,
    (a)=>`The protocol detected your $${a} and reclassified it as "protocol-owned liquidity." Goodbye.`,
    (a)=>`The withdraw button worked perfectly. The funds went to a wallet that wasn't yours. $${a} gone.`,
    (a)=>`Your $${a} withdrawal was "delayed for security review." The review concluded: it's gone.`,
    (a)=>`A smart contract upgrade silently swapped the withdraw function for a black hole. $${a} in.`,
    (a)=>`The vault's "emergency pause" activated the instant your $${a} tried to leave. Convenient timing.`,
    (a)=>`The smart contract's withdraw function had a typo. The typo redirected $${a} to "0xDEAD."`,
    (a)=>`The dev's wallet executed a function called withdrawAllToMe(). Yours was included. $${a} gone.`,
    (a)=>`Your $${a} got caught in a "cross-chain bridge exploit" this pool definitely shouldn't have touched.`,
    (a)=>`The vault's withdraw function silently called transferToDev() instead. $${a} relocated accordingly.`,
    (a)=>`A "security incident" was disclosed 4 minutes after your $${a} withdrawal vanished. Coincidence.`,
    (a)=>`Your $${a} withdrawal succeeded, technically. Into someone else's wallet.`,
];

const STAKE_HARVEST_LINES = [
    (a)=>`You harvested $${a} in yield. The printer go brrr, briefly.`,
    (a)=>`$${a} in "generated yield derivatives" successfully laundered into your wallet.`,
    (a)=>`$${a} claimed. Definitely real money, not just numbers going up.`,
    (a)=>`Harvest complete: $${a}. The APY was real for exactly this long.`,
    (a)=>`$${a} harvested. The pool is slightly less ponzi-shaped than a moment ago.`,
    (a)=>`You claimed $${a}. Technically "yield." Technically "printed from nothing." Both true.`,
    (a)=>`Yield harvested: $${a}. The math didn't add up but the button worked.`,
    (a)=>`$${a} successfully extracted from the yield module. Spend it before the protocol reconsiders.`,
    (a)=>`Rewards claimed: $${a}. Origin of funds: vibes. Destination: your wallet.`,
    (a)=>`$${a} harvested from the void. Economics professors felt something.`,
    (a)=>`You pressed harvest. $${a} appeared. No one is entirely sure why, but here we are.`,
    (a)=>`Harvest: $${a}. That's the power of 42069% APY. Sustainable? No. Delicious? Yes.`,
    (a)=>`$${a} collected from the yield trap. The trap remains set for the next person.`,
    (a)=>`Rewards unlocked: $${a}. The protocol's accountant filed a complaint. No one read it.`,
    (a)=>`$${a} harvested clean. The early depositor in you would be proud.`,
    (a)=>`$${a} claimed before the pool noticed. Quick hands, good instincts.`,
    (a)=>`Yield of $${a} locked in. The APY counter immediately started adjusting to compensate.`,
    (a)=>`$${a} harvested. The smart contract has no idea why it gave you this. Neither do you.`,
    (a)=>`You claimed $${a} in freshly minted hopium. Spendable, for now.`,
    (a)=>`$${a} of "passive income" landed. The dev's Lambo payment is still larger.`,
    (a)=>`Harvest button clicked, $${a} received. The yield was real until proven otherwise.`,
    (a)=>`$${a} dropped into your wallet like nothing happened. The pool still pretends nothing happened.`,
    (a)=>`You scooped $${a} from the top of the yield pile before someone else could.`,
    (a)=>`$${a} claimed. This is what "number go up" feels like at the bottom of the stack.`,
    (a)=>`Yield extraction complete: $${a}. The token supply somewhere silently increased to cover it.`,
    (a)=>`$${a} in rewards, freshly printed from the protocol's inflationary fever dream.`,
    (a)=>`You harvested $${a}. This does not prove the pool is safe. It proves you were fast.`,
    (a)=>`$${a} claimed. The protocol says "you're welcome." It did not contribute this money. You did.`,
    (a)=>`Harvest complete: $${a}. The APY counter didn't even flinch. It has seen worse.`,
    (a)=>`$${a} landed. The yield came from new deposits funding old rewards. As is tradition.`,
    (a)=>`You made $${a} today. Somewhere, someone who deposited after you is funding your exit.`,
    (a)=>`$${a} harvested. The protocol's liquidity runway just got 0.003% shorter.`,
    (a)=>`Rewards claimed: $${a}. No animals were harmed. Several wallets were.`,
    (a)=>`$${a} in yield, successfully extracted before the next "unexpected liquidity event."`,
    (a)=>`You collected $${a}. The Ponzi thanks you for your patience and your principal.`,
    (a)=>`$${a} hits your wallet. The yield farm's Discord says "keep staking." You kept harvesting.`,
    (a)=>`$${a} in yield claimed. The smart contract shrugged and printed it. Works for you.`,
    (a)=>`You harvested $${a} in "organic yield." The yield is not organic. Nothing here is organic.`,
    (a)=>`$${a} reward secured. You are now $${a} richer and zero percent less at risk.`,
    (a)=>`Yield harvest: $${a}. The pool absorbs the loss, redistributes the hopium, and moves on.`,
    (a)=>`$${a} of pure financial fiction, now yours. Spend it on something real.`,
    (a)=>`$${a} claimed from the yield factory floor. Factory conditions: unregulated.`,
    (a)=>`Rewards: $${a}. The liquidity underpinning this is mostly vibes and late deposits.`,
    (a)=>`Harvest confirmed: $${a}. The pool says "plenty more where that came from." Sure it does.`,
    (a)=>`$${a} harvested. This is what winning looks like in a game designed for you to lose.`,
];

const STAKE_EXPLOIT_LINES = [
    `Flash loan structural liquidation drained your principal.... DRAIN.`,
    `An anonymous dev forked the vault mid-harvest, removed the withdraw function, and vanished.`,
    `The audit said "low risk." The audit was written by the dev. Principal: gone.`,
    `A governance vote passed while you were sleeping: "transfer all funds to treasury."`,
    `The "insurance fund" that was supposed to cover this? It was also in this pool.`,
    `Someone found a reentrancy bug and found it before you found your money.`,
    `A 0-day exploit in the reward-distribution function redistributed your funds to the explorer.`,
    `The protocol "upgraded" mid-harvest. The new version doesn't have a withdrawal function.`,
    `A flash loan attack drained the pool in 3 transactions. Transaction 1 was your harvest request.`,
    `The multisig wallet executed a "strategic reallocation." You were not a signer.`,
    `A "price oracle manipulation" event coincided exactly with your harvest. Principal: confiscated.`,
    `The protocol's emergency shutdown function was triggered. "Emergency" loosely defined.`,
    `An undisclosed admin key executed exitAll() at 3:47 AM. Your principal exited into someone else's wallet.`,
    `The reward contract called selfdestruct() during your transaction. This was a feature, apparently.`,
    `A sandwich attack at the contract level front-ran your harvest and took the principal as a "fee."`,
    `The timelock protecting the vault was set to 0 blocks. The dev didn't wait.`,
    `Your harvest triggered a cascading liquidation that ate the entire pool, starting with your deposit.`,
    `The protocol posted a Medium article titled "Post-Mortem" while your transaction was still pending.`,
    `An oracle returned a price of $0 for one second. The contract acted accordingly.`,
    `A governance proposal to "reallocate idle liquidity" passed 3-0. The committee was three dev wallets.`,
    `The smart contract hit an integer overflow. The overflow direction was not in your favor.`,
    `Your harvest transaction confirmed in the same block as a drain function. The drain went first.`,
    `A "liquidity migration" was announced 2 seconds after your principal was moved. You were not migrated.`,
    `The protocol's telegram announced "temporary issues" as your principal was permanently relocated.`,
    `A whitehat hacker drained the pool to "protect it." They returned zero funds. Very white hat.`,
    `The yield farm's underlying asset depegged to $0 during your transaction. Principal: vaporized.`,
    `An "economic attack" exploited the exact function you called, at the exact moment you called it.`,
    `The protocol ran out of liquidity and compensated you with your own principal. Incorrectly.`,
    `Someone posted the private key to the admin wallet in the public Discord. You were already too late.`,
    `The vault's proxy contract was upgraded to point to a different vault. A personal one.`,
    `A bot caught your harvest in the mempool and front-ran it with a complete drain of the pool.`,
    `The team announced a "v2 migration." v2 is just the dev's personal wallet with extra steps.`,
    `An "unplanned maintenance window" occurred during your harvest. Duration: forever.`,
    `A "dust attack" prepared for 3 weeks culminated in your harvest transaction. Unlucky timing.`,
    `The contract's onlyOwner check was accidentally removed in the last "minor update."`,
    `The protocol triggered a "rage quit" function that doesn't exist in any documentation.`,
    `An MEV bot targeted specifically this harvest amount in a coordinated drain.`,
    `The pool ran a "community vote" to burn unclaimed rewards. Your rewards were included. Retroactively.`,
    `A "token migration" swapped your underlying asset 1:1 into a brand-new unverified contract.`,
    `A governance attack using flash-loaned voting tokens passed a "protocol improvement": taking your money.`,
    `The "immutable" contract was deployed behind a proxy that was, it turns out, entirely mutable.`,
    `The protocol celebrated 1,000 transactions by executing transaction 1,001: draining the yield pool.`,
    `An anonymous researcher published an exploit 30 seconds after you deposited. They also deployed it.`,
    `The bridge the protocol used to move funds lost your principal somewhere in the middle.`,
    `A coordinated bot network drained the pool in the exact block window between your deposit and harvest.`,
    `The smart contract interpreted your harvest as a "donation." There is no undo button.`,
    `A rogue admin key, which definitely should not have existed, redirected your funds mid-transaction.`,
    `Your harvest got stuck behind a "withdrawal fee" of exactly 100%. The fee was never disclosed.`,
    `The protocol's withdrawal contract self-destructed the moment your harvest request was confirmed.`,
    `A "circuit breaker" activated that, oddly, only ever breaks in one direction: against you.`,
];

const AMBIENT_YIELD_TEMPLATES = [
    { tag:'DEPOSIT', color:'text-green-400', text:()=>`${randomYieldWallet()} deposited ${randomYieldAmt()} USDSHT into ${randomFromYield(POOLS).name}. Bold strategy.` },
    { tag:'DEPOSIT', color:'text-green-400', text:()=>`${randomYieldWallet()} yolo'd ${randomYieldAmt()} into ${randomFromYield(POOLS).name}. No questions asked.` },
    { tag:'DEPOSIT', color:'text-green-400', text:()=>`${randomYieldWallet()} dropped ${randomYieldAmt()} into ${randomFromYield(POOLS).name}. The pool says thanks.` },
    { tag:'DEPOSIT', color:'text-green-400', text:()=>`${randomYieldWallet()} deposited ${randomYieldAmt()} USDSHT. TVL counter went up, morale unchanged.` },
    { tag:'DEPOSIT', color:'text-green-400', text:()=>`Fresh liquidity: ${randomYieldWallet()} added ${randomYieldAmt()} to ${randomFromYield(POOLS).name}. Another bagholder acquired.` },
    { tag:'DEPOSIT', color:'text-green-400', text:()=>`${randomYieldWallet()} aped ${randomYieldAmt()} into ${randomFromYield(POOLS).name}. "Ape now, read later" energy.` },
    { tag:'DEPOSIT', color:'text-green-400', text:()=>`${randomYieldWallet()} deposited ${randomYieldAmt()} with zero due diligence and maximum optimism.` },
    { tag:'DEPOSIT', color:'text-green-400', text:()=>`${randomYieldWallet()} chose ${randomFromYield(POOLS).name} after a 4-second read of the homepage. ${randomYieldAmt()} committed.` },
    { tag:'DEPOSIT', color:'text-green-400', text:()=>`${randomYieldWallet()} sent ${randomYieldAmt()} to ${randomFromYield(POOLS).name}. The dev's TVL screenshot just got better.` },
    { tag:'DEPOSIT', color:'text-green-400', text:()=>`${randomFromYield(POOLS).name} received ${randomYieldAmt()} from ${randomYieldWallet()}. The pool didn't say thank you.` },
    { tag:'WITHDRAW', color:'text-amber-400', text:()=>`${randomYieldWallet()} withdrew ${randomYieldAmt()} from ${randomFromYield(POOLS).name}. Got out clean, allegedly.` },
    { tag:'WITHDRAW', color:'text-amber-400', text:()=>`${randomYieldWallet()} pulled ${randomYieldAmt()} from ${randomFromYield(POOLS).name}. Congratulations on continued financial existence.` },
    { tag:'WITHDRAW', color:'text-amber-400', text:()=>`${randomYieldWallet()} exited ${randomFromYield(POOLS).name} with ${randomYieldAmt()}. Discord called it "fud." They didn't care.` },
    { tag:'WITHDRAW', color:'text-amber-400', text:()=>`Principal recovered: ${randomYieldWallet()} got ${randomYieldAmt()} out of ${randomFromYield(POOLS).name}. Rare outcome.` },
    { tag:'WITHDRAW', color:'text-amber-400', text:()=>`${randomYieldWallet()} rage-quit ${randomFromYield(POOLS).name} with ${randomYieldAmt()}. Telegram posted rocket emojis in response.` },
    { tag:'WITHDRAW', color:'text-amber-400', text:()=>`${randomYieldWallet()} exited quietly with ${randomYieldAmt()}. A professional move in an amateur environment.` },
    { tag:'HARVEST', color:'text-emerald-400', text:()=>`${randomYieldWallet()} harvested ${randomYieldAmt()} USDSHT in yield. Definitely sustainable.` },
    { tag:'HARVEST', color:'text-emerald-400', text:()=>`${randomYieldWallet()} claimed ${randomYieldAmt()} in freshly minted hopium from ${randomFromYield(POOLS).name}.` },
    { tag:'HARVEST', color:'text-emerald-400', text:()=>`${randomYieldWallet()} extracted ${randomYieldAmt()} from ${randomFromYield(POOLS).name} before the music stopped.` },
    { tag:'HARVEST', color:'text-emerald-400', text:()=>`${randomYieldWallet()} pressed harvest on ${randomFromYield(POOLS).name}. ${randomYieldAmt()} appeared. Economics wept.` },
    { tag:'HARVEST', color:'text-emerald-400', text:()=>`${randomYieldWallet()} grabbed ${randomYieldAmt()} before the APY "adjusted." Smart or lucky, outcome same.` },
    { tag:'HARVEST', color:'text-emerald-400', text:()=>`Harvest: ${randomYieldWallet()} claimed ${randomYieldAmt()} from ${randomFromYield(POOLS).name}. Funds printed, dignity intact.` },
    { tag:'HARVEST', color:'text-emerald-400', text:()=>`${randomYieldWallet()} cashed out ${randomYieldAmt()} in "passive income." The origin of that income: new depositors.` },
    { tag:'DRAIN', color:'text-rose-500 font-bold', text:()=>`${randomYieldWallet()} tried harvesting from ${randomFromYield(POOLS).name}.... DRAIN. Principal: gone.` },
    { tag:'DRAIN', color:'text-rose-500 font-bold', text:()=>`${randomYieldWallet()} hit harvest on ${randomFromYield(POOLS).name}. Got a flash loan to the face instead.` },
    { tag:'DRAIN', color:'text-rose-500 font-bold', text:()=>`Exploit confirmed: ${randomYieldWallet()} lost ${randomYieldAmt()} from ${randomFromYield(POOLS).name}. Post-mortem pending, refund not.` },
    { tag:'DRAIN', color:'text-rose-500 font-bold', text:()=>`${randomYieldWallet()} tried to exit ${randomFromYield(POOLS).name}. The pool had other plans for their ${randomYieldAmt()}.` },
    { tag:'DRAIN', color:'text-rose-500 font-bold', text:()=>`${randomFromYield(POOLS).name} drain event detected. ${randomYieldWallet()} was collateral damage. ${randomYieldAmt()} gone.` },
    { tag:'DRAIN', color:'text-rose-500 font-bold', text:()=>`Reentrancy attack caught ${randomYieldWallet()} mid-harvest. ${randomYieldAmt()} liquidated before block confirmation.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`Whale deposited ${randomYieldAmt()} USDSHT into ${randomFromYield(POOLS).name} in a single block.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`Whale alert: ${randomYieldWallet()} dumped ${randomYieldAmt()} into ${randomFromYield(POOLS).name}. APY dropped 0.0001%.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`${randomYieldWallet()} (suspected whale) entered ${randomFromYield(POOLS).name} with ${randomYieldAmt()}. Everyone is watching.` },
    { tag:'WHALE', color:'text-blue-400', text:()=>`Whale entering: ${randomYieldWallet()} dropped ${randomYieldAmt()} into ${randomFromYield(POOLS).name}. Small wallets are nervous.` },
    { tag:'RUG', color:'text-rose-500', text:()=>`A "withdrawal fee" quietly ate ${randomYieldAmt()} USDSHT from someone's exit. Cost of doing business.` },
    { tag:'RUG', color:'text-rose-500', text:()=>`${randomFromYield(POOLS).name} vault executed an "emergency adjustment." ${randomYieldAmt()} adjusted to the dev's wallet.` },
    { tag:'RUG', color:'text-rose-500', text:()=>`Admin function triggered: ${randomYieldAmt()} USDSHT "migrated" from ${randomFromYield(POOLS).name}. Destination undisclosed.` },
    { tag:'RUG', color:'text-rose-500', text:()=>`Governance passed a proposal to "optimize" ${randomFromYield(POOLS).name}. The optimization moved ${randomYieldAmt()} to the team.` },
    { tag:'APY', color:'text-amber-400', text:()=>`${randomFromYield(POOLS).name}'s APY just recalculated itself. The math still doesn't check out.` },
    { tag:'APY', color:'text-amber-400', text:()=>`${randomFromYield(POOLS).name} APY spiked to impossible-return territory. Telegram is very excited.` },
    { tag:'APY', color:'text-amber-400', text:()=>`"Sustainable yield" update: ${randomFromYield(POOLS).name} just printed more tokens to cover its APY promises.` },
    { tag:'APY', color:'text-amber-400', text:()=>`${randomFromYield(POOLS).name} APY is now higher than the GDP of several small nations. All is well.` },
    { tag:'AUDIT', color:'text-purple-400', text:()=>`Someone asked if these pools are audited. The silence in the Discord was deafening.` },
    { tag:'AUDIT', color:'text-purple-400', text:()=>`${randomFromYield(POOLS).name} audit report released. Page 1: "looks fine." Pages 2-40: blank.` },
    { tag:'AUDIT', color:'text-purple-400', text:()=>`A security researcher flagged something in ${randomFromYield(POOLS).name}. Discord mod banned them for "spreading fud."` },
    { tag:'AUDIT', color:'text-purple-400', text:()=>`"KYC completed" posted in ${randomFromYield(POOLS).name} chat. The KYC was a photo of a dog. Passed.` },
    { tag:'AUDIT', color:'text-purple-400', text:()=>`${randomFromYield(POOLS).name} security score: 94/100. The 6 missing points are the withdraw function.` },
    { tag:'PANIC', color:'text-rose-400', text:()=>`${randomYieldWallet()} is asking where the withdraw button is. There isn't one. There never was.` },
    { tag:'PANIC', color:'text-rose-400', text:()=>`Multiple wallets attempting emergency exits from ${randomFromYield(POOLS).name}. Exit queue is "processing."` },
    { tag:'PANIC', color:'text-rose-400', text:()=>`${randomYieldWallet()} posted "IS THE POOL OK" in all caps in 4 Discord channels. No dev response.` },
    { tag:'PANIC', color:'text-rose-400', text:()=>`${randomYieldWallet()} noticed the dev wallet moved. Now refreshing the pool page every 3 seconds.` },
    { tag:'PANIC', color:'text-rose-400', text:()=>`"Why is the APY dropping" posted in the ${randomFromYield(POOLS).name} channel. Dev is "traveling."` },
    { tag:'LOCK', color:'text-gray-400', text:()=>`${randomFromYield(POOLS).name} quietly updated terms. Withdrawals now require a "7-day cooldown." Not announced.` },
    { tag:'LOCK', color:'text-gray-400', text:()=>`${randomYieldWallet()} discovered their ${randomYieldAmt()} is "time-locked for security." Lock duration: undefined.` },
    { tag:'LOCK', color:'text-gray-400', text:()=>`${randomFromYield(POOLS).name} added an "anti-dump mechanism." It also prevents withdrawals. Technically different things.` },
    { tag:'TVL', color:'text-blue-400', text:()=>`${randomFromYield(POOLS).name} TVL: ${randomYieldAmt()} USDSHT. That number is made up but sounds impressive.` },
    { tag:'TVL', color:'text-blue-400', text:()=>`TVL update: ${randomFromYield(POOLS).name} hit a new high of ${randomYieldAmt()} USDSHT. Mostly because nobody can leave.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`${randomFromYield(POOLS).name} trending on crypto Twitter. Three tweeted about it, two are bots.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`"WAGMI" posted in ${randomFromYield(POOLS).name} Discord 47 times this hour. Dev has not posted once.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`An influencer called ${randomFromYield(POOLS).name} "the next 100x." The influencer was paid in pool tokens.` },
    { tag:'SHILL', color:'text-green-400', text:()=>`A YouTube thumbnail reading "UNLIMITED YIELD?? 🤑" just went up about ${randomFromYield(POOLS).name}. Comments disabled.` },
    { tag:'COPY', color:'text-gray-400', text:()=>`A copycat launched "${randomFromYield(POOLS).name} v2" with 10x the APY and half the code.` },
    { tag:'COPY', color:'text-gray-400', text:()=>`Fork of ${randomFromYield(POOLS).name} deployed in 4 minutes using the original's bytecode. Rugged in 5.` },
    { tag:'COPY', color:'text-gray-400', text:()=>`"${randomFromYield(POOLS).name} Pro Max Plus Ultra" just launched. Same contract, different name.` },
    { tag:'TEAM', color:'text-gray-400', text:()=>`The ${randomFromYield(POOLS).name} dev posted a "transparency update" that contains no new information.` },
    { tag:'TEAM', color:'text-gray-400', text:()=>`${randomFromYield(POOLS).name} Discord mod just left the server without explanation. "No cause for concern" pinned.` },
    { tag:'TEAM', color:'text-gray-400', text:()=>`${randomFromYield(POOLS).name} team is "fully doxxed" according to a Medium post written by the team.` },
    { tag:'GAS', color:'text-amber-400', text:()=>`Gas spike: ${randomYieldWallet()} paid ${randomYieldAmt()} USDSHT in gas to claim ${(Math.random()*2+0.01).toFixed(4)} in rewards.` },
    { tag:'GAS', color:'text-amber-400', text:()=>`${randomFromYield(POOLS).name} harvest gas fees just exceeded the reward amount for small wallets.` },
    { tag:'MEV', color:'text-purple-400', text:()=>`A sandwich bot front-ran ${randomYieldWallet()}'s harvest from ${randomFromYield(POOLS).name}, extracting ${randomYieldAmt()}.` },
    { tag:'MEV', color:'text-purple-400', text:()=>`${randomYieldWallet()} lost ${randomYieldAmt()} to an MEV bot that saw their harvest coming from 3 blocks away.` },
    { tag:'FUD', color:'text-rose-400', text:()=>`${randomYieldWallet()} posted a thread questioning ${randomFromYield(POOLS).name}'s tokenomics. Thread was deleted.` },
    { tag:'FUD', color:'text-rose-400', text:()=>`Someone said "${randomFromYield(POOLS).name} is unsustainable" in the Discord. It was the dev. They deleted it.` },
    { tag:'FARM', color:'text-emerald-400', text:()=>`${randomYieldWallet()} auto-compounding their ${randomFromYield(POOLS).name} position. Compounding losses counts, right?` },
    { tag:'FARM', color:'text-emerald-400', text:()=>`${randomYieldWallet()} has been staking in ${randomFromYield(POOLS).name} for 14 days. They are not concerned. They should be.` },
];

/* ---- no-repeat sets for every pool ---- */
const recentYieldIdxs    = new Set();
const recentHarvestIdxs  = new Set();
const recentDepositIdxs  = new Set();
const recentWithdrawIdxs = new Set();

function pickNoRepeat(arr, seen) {
    const available = arr.map((_,i) => i).filter(i => !seen.has(i));
    const pool = available.length > 0 ? available : arr.map((_,i) => i);
    const idx = pool[Math.floor(Math.random() * pool.length)];
    seen.add(idx);
    if (seen.size > Math.floor(arr.length * 0.55)) seen.delete(seen.values().next().value);
    return arr[idx];
}

/* ============================================================
   LOG OUTPUT
   ============================================================ */
function pushYieldLog(tag, text, colorClass) {
    const log = document.getElementById('stakingEventLog');
    if (!log) return;
    const el = document.createElement('div');
    el.className = "py-0.5 border-b border-[#1A2232]/30";
    el.innerHTML = `<span class="${colorClass} font-bold">[${tag}]</span> <span class="text-gray-300 font-light">${text}</span>`;
    log.prepend(el);
    while (log.children.length > 50) log.removeChild(log.lastChild);
}

function generateAmbientYieldLog() {
    const t = pickNoRepeat(AMBIENT_YIELD_TEMPLATES, recentYieldIdxs);
    pushYieldLog(t.tag, t.text(), t.color);
}

/* ============================================================
   UI HELPERS
   ============================================================ */
function resetStakingDisplay() {
    const safeSet = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    safeSet('stakedLocked',       '$0.00');
    safeSet('stakedPoolType',     '—');
    safeSet('unclaimedShitcoins', '0.0000');
    POOLS.forEach(p => {
        const c = document.getElementById(`pool-card-${p.id}`);
        if (c) c.classList.remove('selected');
    });
    const inp = document.getElementById('stakeAmount');
    if (inp) inp.value = '';
}

/* ============================================================
   POOL CARDS
   ============================================================ */
function renderPoolCards() {
    const container = document.getElementById('poolCardsContainer');
    if (!container || container.children.length > 0) return;
    container.innerHTML = POOLS.map(p => `
        <div id="pool-card-${p.id}" onclick="selectPool('${p.id}')" class="pool-card">
            <h4 class="font-bold text-white text-xs uppercase mb-1">${p.name}</h4>
            <div class="text-xl font-black font-mono text-amber-500 animate-pulse">${p.apy}% APY</div>
            <p class="text-[9px] text-gray-500 mt-2 font-mono">ID: ${p.id.toUpperCase()}_VAULT</p>
        </div>
    `).join('');
}

function selectPool(id) {
    POOLS.forEach(p => { const c = document.getElementById(`pool-card-${p.id}`); if (c) c.classList.remove('selected'); });
    const chosen = document.getElementById(`pool-card-${id}`);
    if (chosen) chosen.classList.add('selected');
    state.stakedPoolId = id;
    playSound('click');
}

/* ============================================================
   DEPOSIT
   ============================================================ */
function stakeTokens() {
    if (!state.stakedPoolId) { showToast("Select a pool first.", "error"); return; }
    const amount = parseFloat(document.getElementById('stakeAmount').value) || 0;
    if (amount <= 0) { showToast("Enter a valid amount.", "error"); return; }
    if (amount > (state.cash || 0)) { showToast("Not enough cash in your wallet.", "error"); return; }

    state.cash -= amount;
    state.stakedAmount  = (parseFloat(state.stakedAmount)  || 0) + amount;
    state.unclaimedRewards = parseFloat(state.unclaimedRewards) || 0;
    state.lastHarvestOrStakeTime = Date.now();

    const pool = POOLS.find(p => p.id === state.stakedPoolId);
    const poolName = pool ? pool.name : 'the pool';

    document.getElementById('stakedLocked').innerText  = `$${state.stakedAmount.toFixed(2)}`;
    document.getElementById('stakedPoolType').innerText = state.stakedPoolId.toUpperCase();

    pushYieldLog('DEPOSIT', pickNoRepeat(STAKE_DEPOSIT_LINES, recentDepositIdxs)(amount.toFixed(2), poolName), 'text-green-400');

    playSound('stake');
    showToast(`💰 Staked $${amount.toFixed(2)} into ${poolName}.`, "success");
    saveGame();
    updateUI();
}

/* ============================================================
   WITHDRAW — also auto-harvests any pending rewards first
   ============================================================ */
function withdrawStake() {
    const principal = parseFloat(state.stakedAmount) || 0;
    if (principal <= 0) { showToast("Nothing staked to withdraw.", "error"); return; }

    const poolName = (POOLS.find(p => p.id === state.stakedPoolId) || {}).name || 'the pool';

    /* --- 0.01% rug risk on withdrawal --- */
    if (Math.random() < WITHDRAW_RUG_CHANCE) {
        state.stakedAmount     = 0;
        state.stakedPoolId     = null;
        state.unclaimedRewards = 0;
        pushYieldLog('DRAIN', pickNoRepeat(STAKE_WITHDRAW_RUGGED_LINES, recentWithdrawIdxs)(principal.toFixed(2)), 'text-red-500 font-extrabold');
        resetStakingDisplay();
        playSound('rug');
        saveGame();
        updateUI();
        showAlertModal(`🚨 WITHDRAWAL RUGGED! Your $${principal.toFixed(2)} principal vanished mid-withdrawal.`);
        return;
    }

    /* --- auto-harvest pending rewards before returning principal --- */
    const unclaimed = parseFloat(state.unclaimedRewards) || 0;
    if (unclaimed > 0.0001) {
        state.cash += unclaimed;
        state.unclaimedRewards = 0;
        pushYieldLog('HARVEST', pickNoRepeat(STAKE_HARVEST_LINES, recentHarvestIdxs)(unclaimed.toFixed(4)), 'text-emerald-400');
        setTimeout(() => showToast(`🌾 Auto-harvested $${unclaimed.toFixed(4)} on withdrawal!`, "success"), 100);
    }

    /* --- return principal --- */
    state.cash += principal;
    state.stakedAmount  = 0;
    state.stakedPoolId  = null;

    pushYieldLog('WITHDRAW', pickNoRepeat(STAKE_WITHDRAW_LINES, recentWithdrawIdxs)(principal.toFixed(2), poolName), 'text-amber-400');
    resetStakingDisplay();
    playSound('click');
    showToast(`💵 Withdrew $${principal.toFixed(2)} back to your wallet.`, "success");
    saveGame();
    updateUI();
}

/* ============================================================
   REWARD ACCRUAL — called every second by main.js game tick
   ============================================================ */
function processStakingRewards() {
    const staked = parseFloat(state.stakedAmount) || 0;
    if (staked <= 0 || !state.stakedPoolId) return;

    const pool = POOLS.find(p => p.id === state.stakedPoolId);
    if (!pool) return;

    const rewardPerSec = (staked * (pool.apy / 100)) / (365 * 24 * 3600);
    state.unclaimedRewards = (parseFloat(state.unclaimedRewards) || 0) + rewardPerSec;

    const el = document.getElementById('unclaimedShitcoins');
    if (el) el.innerText = state.unclaimedRewards.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/* ============================================================
   MANUAL HARVEST
   ============================================================ */
function harvestRewards() {
    const unclaimed = parseFloat(state.unclaimedRewards) || 0;
    if (unclaimed <= 0) { showToast("Nothing to harvest yet.", "error"); return; }

    if (Math.random() < 0.15) {
        const lost = parseFloat(state.stakedAmount) || 0;
        state.stakedAmount     = 0;
        state.unclaimedRewards = 0;
        state.stakedPoolId     = null;
        pushYieldLog('DRAIN', pickNoRepeat(STAKE_EXPLOIT_LINES, recentHarvestIdxs), 'text-rose-500 font-bold');
        resetStakingDisplay();
        playSound('liquidated');
        saveGame();
        updateUI();
        showAlertModal("⚠️ PROTOCOL EXPLOIT! A flash loan attack drained 100% of your vault. Principal: gone.");
        return;
    }

    state.cash += unclaimed;
    state.unclaimedRewards = 0;

    const el = document.getElementById('unclaimedShitcoins');
    if (el) el.innerText = '0.0000';

    pushYieldLog('HARVEST', pickNoRepeat(STAKE_HARVEST_LINES, recentHarvestIdxs)(unclaimed.toFixed(4)), 'text-emerald-400');
    showToast(`🌾 Harvested $${unclaimed.toFixed(4)} in yield!`, "success");
    playSound('buy');
    saveGame();
    updateUI();
}

/* ============================================================
   WITHDRAW BUTTON INJECTION + AMBIENT TICKER START
   ============================================================ */
function setupWithdrawButton() {
    if (document.getElementById('withdrawStakeBtn')) return;
    const poolTypeEl = document.getElementById('stakedPoolType');
    if (!poolTypeEl) { setTimeout(setupWithdrawButton, 300); return; }
    const infoBlock = poolTypeEl.closest('div');
    if (!infoBlock) return;
    infoBlock.insertAdjacentHTML('afterend', `
        <button id="withdrawStakeBtn" onclick="withdrawStake()" class="w-full mt-2 py-2.5 bg-amber-600 hover:bg-amber-500 text-black font-extrabold text-xs rounded-lg transition shadow-md uppercase tracking-wider">
            Withdraw Principal + Harvest
        </button>`);
}

function startStakingAmbientLogs() {
    if (ambientYieldTimer) return; // already running
    ambientYieldTimer = setInterval(generateAmbientYieldLog, AMBIENT_YIELD_LOG_INTERVAL);
}

/* Start on DOMContentLoaded AND also when the page is fully loaded
   (belt-and-suspenders — covers both defer and non-defer loading) */
document.addEventListener('DOMContentLoaded', () => { setupWithdrawButton(); startStakingAmbientLogs(); });
window.addEventListener('load', () => { setupWithdrawButton(); startStakingAmbientLogs(); });
