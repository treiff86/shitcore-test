# Shitcore (USDSHT) — Layer 1 Shitcoin Tycoon

> **v2.1.0: PROVE IT'S YOU** — The most unhinged fake blockchain tycoon game on GitHub Pages.

A 100% free satirical idle/tycoon game about meme-coin rug pulls, leveraged trading, NFT grifts, and Ponzi yield farms. No real money ever moves — every dollar *in the game* is `Math.random()` running in your browser. It exists to satirize crypto culture, not teach or enable it.

**Yes, there is real wallet connection.** It is optional — the whole game plays fine having never connected one — but it is genuinely there, and it does four things: unlocks NFT-holder themes, unlocks holder perks, saves your progress to the cloud so you can pick your run back up on any device, and puts you on the live leaderboard. Both Solana (Phantom, Solflare, anything Wallet Standard) and Bitcoin (Xverse, UniSat) wallets are supported.

Connecting is read-only and never touches your funds. Signing in asks your wallet to sign **one plain-text message** so that nobody else can play as you or overwrite your save. A signature is not a transaction: it approves nothing, spends nothing, and cannot move a token — it is the same "sign in" step Magic Eden and Tensor use. Full detail in [Wallet Connect & Leaderboard](#-wallet-connect--leaderboard) below.

---

## 🚀 Play It Free

**Live:** [treiff86.github.io/shitcore-test](https://treiff86.github.io/shitcore-test/)

---

## 🎮 Mini-Games

### 📊 Markets — Leverage Scalping
Set a **wager** (10% / 50% / custom $) and pick your **leverage** (25x / 50x / 75x / 100x), then hit **Pump It** (Long) or **Dump It** (Short).

- Your entry price is marked with a **dashed red line** on the live chart so you can see whether price is above or below your entry
- Your live order, direction, leverage, and running P&L display in the **Live Orderbook** while the trade is open
- Higher leverage = bigger swings AND a higher instant-bust chance (13% / 25% / 38% / 50%)
- Trades always open — catastrophes resolve on the next tick, not before you see the position
- **RUGGED (1%):** lose your wager + 10% of your wallet
- **DRAINED (0.01%):** wallet goes to $0, start over

**Level 3 unlock — MEV Sandwich 🥪:** a cooldown ability that extracts $100-$1,000 with guaranteed cash and guaranteed Regulatory Heat every 12 seconds. 10% chance a bigger bot counter-sandwiches you and you lose money instead.

---

### 🚀 Rug Creator — Token Deployer
The main game loop. Deploy a fake token, pump its Hype Meter, crank the Toxicity Tax, and pull the rug before Audit Threat hits 100%.

- **Toxicity Tax slider** — live-updates the % readout; higher tax = faster cash + faster Audit Threat
- **Pay Y Social Influencer ($50)** — 90% success (+hype), 10% they steal your fee AND hack 10-50% of your wallet
- **Quantum Audit** — a rare per-second chance of instant deployment seizure, independent of Audit Threat level
- **Marketing Campaigns** (Level 2+, Level 4+) — 4 tiers, each permanently multiplies both capital inflow AND Audit Threat speed for that deployment; stacks if you run multiple campaigns
- **🍀 Easter Egg:** deploy under any name other than the default for a 1% chance at a **$10,000 Binance Pump & Dump** windfall
- **0.01% DRAINED** on deploy

**Level 4 unlock — Honeypot Backdoor:** locks all sells, doubles Audit Threat growth, guarantees you keep every dollar raised.

---

### 🤖 AI Solidity Auditor — Heat Reduction
The **only** way to lower Regulatory Heat. Paste 50+ characters with real variety (10+ unique chars, no single char over 40% of input) and hit Compile.

- Must change the input between compiles — can't spam the same code
- **Every compile** reduces Heat by 4-10%
- **10% chance** of "audit backfire" — Heat still drops but costs 10% of your wallet
- **0.01% chance** of severe backfire — 35% of your wallet gone
- **0.01% DRAINED** outright
- **1% jackpot** — Liquidity Lock Status flips green "100% UNLOCKED," a **DRAIN** button appears, click it for $1,000-$10,000
- 50+ unique badges, signatures, liquidity statuses, verdicts, and line roasts per compile

---

### 🌾 Ponzi Yield Pools — Staking
Lock funds into one of three increasingly unhinged APY vaults.

| Pool | APY |
|---|---|
| Porcelain Yield Slip | 420% |
| Plutonium Compound Core | 6,900% |
| Blackhole Liquidity Devourer | 42,069% |

- **Deposit** any amount into your selected pool
- **Harvest Rewards** — 85% success (yield added to wallet cash), 15% "Protocol Exploit" liquidates 100% of your stake
- **Withdraw Principal** — instant and risk-free... except for a **0.01% chance it gets rugged mid-withdrawal**
- Withdrawing **auto-harvests** any pending rewards at the same time with a second popup
- Harvested yield and returned principal go to **wallet cash only** — neither counts toward your Lambo tracker or Degen Level
- Live Yield Logs feeds 70+ ambient fake events (deposits, drains, whales, panics, audits, gas horror stories), no-repeat

---

### 🎨 OpenShit — NFT Collection Launcher *(New in v1.0.0)*
Mock OpenSea. Generate real AI art via Pollinations.ai (free, no API key). Mint a fake NFT collection. Exit scam your community.

**Flow:**
1. **Generate Art** — type any prompt, get a real AI image for free
2. **Configure** — name your collection, set ticker + mint price (500 NFT supply)
3. **Launch** ($100 deploy fee) — fake buyers start minting over ~15-20 min, Hype decays slowly. Config fields lock; the shill, floor, and exit tools unlock.
4. **Hype it** — Pay Y Social Influencer ($100), **max 3 uses per session** (resets on page reload, not per collection):
   - **0.01%** — DRAINED, wallet → $0
   - **0.01%** — Influencer Rug: they quietly take 25% of your wallet and vanish
   - **1%** — Heman Tusk (CEO of Y) changes his pfp to *your actual generated image* and posts about it — **instant sellout**, millions of likes
   - **10%** — scammer takes your $100 AND hacks 10-50% of your wallet
   - **~89%** — success: Hype +5-25%, Mint progress +5-10%, sponsored Y post with viral engagement numbers
5. **Floor Pump & Dump** — repeatable, does *not* end the collection. Each use is a coin flip: floor multiplier ×1.15 (pump) or ×0.85 (dump), and it **stacks multiplicatively** with every use. 0.01% chance per use of a hack that costs 90% of your wallet.
6. **Mint & Rug** — the actual exit. Cashes out `revenue × current floor multiplier`. Rug it before the collection fully sells out and there's a 1% chance a wallet drainer hits you for 90% of your funds on the way out, on top of whatever you just cashed out.

**Live Y Feed** — a fake Twitter/X feed (branded "Y") with 75 hype posts, 59 panic posts, and 59 rug-reaction posts streaming in as your collection progresses. Heman Tusk's viral post uses your actual generated image as his profile picture.

**Risks while live:** 0.01%/sec general drain · 0.03%/sec IP Lawsuit (instant seizure) · 0.07%/sec DMCA Strike (-28% hype)

---

### 🥊 Fight Club — Local Brawler & Online *(New in v2.0.0)*
A full side-scrolling fighter buried inside the tycoon game, because why not. **Live for holders of any supported collection** — the local CPU version is TEST Play, but the Online Fight Club lobby is open to every holder, and they can all match against each other. A $MIM Wizard holder can fight a Skull X holder.

- **5 playable characters** — Reiffer (Mid Evils), the Conmen character, the $MIM/Bitcoin Wizard, Genuine Undead (an office zombie in a suit), and Skull X
- **5 arenas** — a prison yard, a medieval market (with a jumpable trestle table), a wizard's study (jumpable table and cauldron), a corporate office (jumpable filing cabinets and desk), and the Skull X stage — each with matching background music where a track exists
- **P2 is CPU-controlled** (medium difficulty) — approaches, throws punches and kicks in range, reacts to your attacks with a chance to block
- Punch, kick, block, crouch, jump, and jump/crouch-specific block and hit-reaction poses; guard meter and chip damage; counter-hit and combo damage scaling
- Real recorded hit/block/whoosh sound effects, mixed randomly so it doesn't repeat, plus a distinct sound for the finishing blow
- P1 spawns as whichever character matches your active cosmetic theme. In a local match P2 and the arena are randomized; in an online match each side plays as their own collection's character

---

### 🍟 Bonus Stage — Destroy the Fry Machine *(Restored in v2.0.0)*
A Street Fighter 2-style beat-em-up against a McDonald's fry machine, accessed via the roaming McDonald's popup easter egg. Available to real Mid Evils/Conmen holders in LIVE, not just TEST Play.

- Punch and kick a fry machine through 6 damage tiers before the clock runs out
- Debris and spark hit effects, screen shake, streak-based heavy-hit odds
- Own dedicated theme music, own real metal-impact sound effects (regular hits vs. the machine-destroying finisher)
- Character-specific defeat animation if the fryer's debris takes you out first; auto-closes a few seconds after the round ends

---

## 🔗 Wallet Connect & Leaderboard *(New in v1.6.9)*

Fully optional — the game works exactly the same with zero wallet ever connected, same as v1.0.0. But it is real, and this is what it does.

- **Connect Wallet** — read-only. Asks your browser wallet for your public address and nothing else. Solana (Phantom, Solflare, and anything supporting Wallet Standard) and Bitcoin (Xverse, UniSat) are both supported. Connecting never requests a transaction and never touches funds.
- **Sign in** — once connected, your wallet is asked to sign one short plain-text message. **This is not a transaction.** It approves nothing, spends nothing, and cannot move a token; your wallet shows you the exact text before you sign. It exists so the server can tell that you actually hold that wallet, which is what stops anyone else playing as you, writing a fake score under your name, or wiping your save. The session lasts a week, so you'll see it on first connect and then about weekly — not every visit. Decline it and the game still plays perfectly; your progress just won't sync.
- **NFT themes and holder perks** — ownership is checked on-chain, server-side. Each supported collection reskins the whole site and carries its own gameplay perks. See [Holder Perks](#-holder-perks).
- **Cloud save** — your wallet address is your save slot. Connect from any device and your run resumes automatically.
- **Live Leaderboard** — ranks players by lifetime earned (the same number your Degen Level is based on). Refreshes every 20 seconds while it's open.
- **.sol domain display** — if your connected wallet owns a Solana Name Service domain, it replaces your address everywhere it would otherwise show: the header button, and your row on the leaderboard.

**Trust note — what is and isn't protected.** Saves are locked to the wallet that signed for them: the `players` table takes no anonymous reads or writes at all any more, so nobody can read your save, write a score under your address, or wipe your progress. Every write goes through a server function that also enforces value ceilings, a growth-rate limit and a save-frequency limit, and logs anything it rejects.

What that does **not** do is make the game itself tamper-proof. It runs in your browser, so a determined player can still edit *their own* numbers before they're sent — the server bounds how absurd that can get, but it can't referee a game it isn't simulating. Making that impossible too would mean running the whole tycoon sim server-side, which is a different project. Stated plainly here rather than implied away.

**Setup required to enable this in your own fork:** run `supabase_setup.sql` once in your own Supabase project's SQL Editor, deploy the `game-save`, `sol-lookup` and `btc-lookup` Edge Functions, then fill in that project's URL and publishable API key at the top of `js/web3.js`.

---

## 📉 Market Volatility

A passive difficulty system that runs the whole time you have the tab open — completely separate from anything you actively do.

- Every **5 minutes of active play**, your wallet cash takes a random hit: **-1% to -10%**
- **0.01% chance per tick** it's a **Black Swan Event** instead: **-25%** flat
- Applies to wallet cash only — staked principal and active token value aren't touched by this system
- No warning, no countdown — same philosophy as every other risk event in this game

---

## 🛒 Perk Shop — Permanent Upgrades

| Perk | Cost | Effect |
|---|---|---|
| Telegram Bot Automator | $600 | Hype Meter decays 40% slower AND generates +1%/sec passively — campaigns last much longer |
| DeFi Twitter Coordination Network | $2,500 | +40% capital inflow, Marketing Campaigns 25% cheaper, victim count grows 50% faster |
| Offshore Cayman Layering Loop | $12,000 | Seizures and rug pulls generate ~50% less Regulatory Heat |

---

## 🎭 Holder Perks

Separate from the shop above: these come from genuinely holding an NFT from a supported collection, verified on-chain. Every collection carries perks.

**You get the perks of the theme you're wearing.** Hold three collections and you still pick one look at a time, so you get that one's perks — choosing Mid Evils means Mid Evils perks, not everyone's at once. Switch theme and the perks switch with you. A toast on connect spells out exactly what the collection you picked gives you.

| Collection | One-time bonus | Ongoing perk |
|---|---|---|
| **Mid Evils** | $3,000 | Bonus Stage + Online Fight Club |
| **Conmen** | $3,000 | 40% less Regulatory Heat (stacks with Cayman), rare chance to wipe Heat to 0, Bonus Stage + Fight Club |
| **Skull X** | $3,000 | **3x Markets luck** — DRAINED/RUGGED/BUST are 3x rarer |
| **$MIM / Bitcoin Wizard** | $3,000 | **+40% capital inflow** on every deployment, plus the Windows 95 desktop |
| **Genuine Undead / Forever Undead** | $3,000 | **Second Life** — the first time Regulatory Heat maxes out in a run, it drops to 50% instead of ending you. Once per run |

**Trait-gated on top of that:** a Mid Evils holder whose NFT has the **Caravaggio** Clothing trait gets a further **$4,200** and a **10x Markets luck** multiplier while wearing the Mid Evils theme. Once earned it's yours permanently — selling the NFT never takes it back — it's simply dormant while you're wearing another collection's colours. If you also hold Skull X, wearing Mid Evils gives you the 10x and wearing Skull X gives you its 3x; they never multiply together.

**On the cash bonuses:** each collection's is claimable exactly once, ever, the first time you wear that theme. Wear Mid Evils and you get its $3,000; switch to Conmen later and you get that one's $3,000 too — once. Flipping back and forth pays nothing further, so there's no farming it.

**On the ongoing perks:** they're read live from the theme you're wearing *and* verified against what you actually hold, so forcing a theme in the browser console grants nothing. Sell the NFT and its perks end.

Every collection also unlocks its own full-site theme, theme music, easter egg, and playable Fight Club character. **Online Fight Club is open to holders of any supported collection, and they can all match against each other** — a $MIM Wizard holder can fight a Skull X holder.

---

## 🌡️ Regulatory Heat

Heat is **account-wide**. Hit **100% = instant game over**, all assets seized.

| What raises it | Amount |
|---|---|
| Token seized (Audit Threat maxed) | +25% |
| Pulling the rug | Scales with Toxicity Tax (up to ~25%) |
| MEV Sandwich (each use) | +5-9% base, up to +34% on rare "noticed" event |

**The only thing that lowers it:** AI Solidity Auditor compiles (-4 to -10% per run) — but each compile carries its own wallet risks now.

---

## ⚠️ Full Risk Event Reference

| Event | Where | Odds | Effect |
|---|---|---|---|
| DRAINED | Almost every interaction | 0.01% | Wallet → $0, start over |
| RUGGED | Markets wager | 1% | Wager + 10% of wallet lost |
| Instant Bust | Markets wager | 13-50% (leverage-scaled) | Wager lost immediately |
| MEV Counter-Sandwich | MEV Sandwich | 10% | Lose $100-$1,000 instead of gaining |
| Influencer Scam | Rug Creator / OpenShit shill | 10% | Fee + 10-50% of wallet hacked |
| Quantum Audit | Rug Creator (per second) | 0.05%/sec | Active deployment instantly seized |
| Deploy Drain | Rug Creator launch | 0.01% | Wallet → $0 |
| Auditor Backfire | AI Auditor compile | 10% | 10% of wallet lost |
| Auditor Severe Backfire | AI Auditor compile | 0.01% | 35% of wallet lost |
| Auditor Full Drain | AI Auditor compile | 0.01% | Wallet → $0 |
| Protocol Exploit | Ponzi Pool harvest | 15% | 100% of staked principal wiped |
| Withdrawal Rug | Ponzi Pool withdrawal | 0.01% | Principal lost mid-withdrawal |
| OpenShit General Drain | OpenShit (per second live) | 0.01%/sec | Wallet → $0 |
| IP Lawsuit | OpenShit (per second live) | 0.03%/sec | Collection seized, revenue forfeited |
| DMCA Strike | OpenShit (per second live) | 0.07%/sec | Hype -28% |
| Heman Tusk Post | OpenShit shill | 1% | Instant sellout (positive event!) |
| Influencer Rug (new) | OpenShit shill | 0.01% | 25% of wallet lost, no fee refund |
| Early Rug Hack (new) | OpenShit Mint & Rug, before sellout only | 1% | 90% of wallet lost, on top of the rug payout |
| Floor Manipulation Hack (new) | OpenShit Floor Pump & Dump, per use | 0.01% | 90% of wallet lost |
| Market Correction | Passive, every 5 min of play | 100% (always fires) | Wallet -1% to -10% |
| Black Swan Event | Passive, every 5 min of play | 0.01% (replaces the above) | Wallet -25% |

---

## 🏆 Degen Levels & Lambo Tracker

| Level | Name | Threshold | Unlocks |
|---|---|---|---|
| 1 | The Basement Dev | $0 | All base features |
| 2 | The Shiller | $3,000 | Ponzi Yield Pools, Campaign Tiers 1-2 |
| 3 | The Shadow Validator | $15,000 | MEV Sandwich |
| 4 | The Institutional Rugger | $60,000 | Honeypot Backdoor, Campaign Tiers 3-4 |

**Win condition:** $1,000,000 lifetime earnings → 🏎️ Real Lambo

---

## 🗂️ File Structure

```
index.html            Page structure, all tabs, modals, wallet/leaderboard UI, CSP
style.css              Theme, animations, card styling
tailwind.css          Vendored Tailwind build - GENERATED, don't hand-edit (rebuild steps in its header)
supabase_setup.sql    One-time DB setup for cloud save + leaderboard (run in Supabase SQL Editor)

Supabase Edge Functions (deployed separately, they hold the server-side keys):
  game-save           Wallet sign-in + the only path to read/write a cloud save
  sol-lookup          Solana NFT/token ownership checks (holds the Helius key)
  btc-lookup          Bitcoin ordinal/rune ownership checks (holds the Ordiscan key)
js/audio.js           Web Audio API synthesizer (no audio files)
js/state.js           Game state, save/load, levels, lambo tiers
js/ui.js              Tab switching, toasts, header rendering
js/markets.js         Markets mini-game + MEV Sandwich + chain feed
js/auditor.js         AI Solidity Auditor mini-game
js/deployer.js        Rug Creator mini-game
js/volatility.js      Passive Market Volatility (wallet decay every 5 min)
js/staking.js         Ponzi Yield Pools mini-game
js/perks.js           Perk shop
js/web3.js            Wallet connect + sign-in, cloud save/load, holder perks, leaderboard
js/sns.js             .sol domain resolution (ES module, Solana Name Service)
js/openshit.js        OpenShit NFT mini-game (self-injecting)
js/fightgame.js       Fight Club mini-game (TEST Play preview)
js/bonusstage.js      Bonus Stage - Destroy the Fry Machine mini-game
js/win95desktop.js    Windows 95 desktop UI for the $MIM/Bitcoin Wizard theme
js/wizardpopup.js     Rotating AOL-style wizard IM popups (Wizard theme)
js/onlinelobby.js     Online Fight Club matchmaking lobby (Supabase Realtime)
js/btcwallet.js       Bitcoin wallet connect (Xverse/UniSat), TEST Play only
js/main.js            Boot + 1-second game tick
```

---

## 🆕 Changelog

> Entries below describe what shipped **at the time of that version**. Where a later change superseded one, it's marked inline. For current behaviour, read the sections above rather than the changelog.

### Unreleased — since v2.0.0
Shipped to the live site, not yet cut as a tagged release.

**Wallet, perks and anti-cheat**
- **New:** Wallet sign-in. Your wallet signs one plain-text message (not a transaction — it approves nothing and cannot move funds) to prove you hold it. Sessions last a week
- **Security:** The `players` table accepted anonymous reads *and writes* from anyone holding the public API key. That meant any visitor could read every player's save, write any score to the leaderboard, and overwrite or wipe someone else's progress. All anonymous access is revoked — every read and write now goes through a server function that requires a signed session
- **Security:** Server-side save validation — value ceilings, a growth-rate limit, a save-frequency limit, structural checks that reject non-finite numbers and oversized payloads. Rejections are logged rather than silently dropped
- **Security:** The public leaderboard now reads a view exposing only name, earnings and level. Save files are no longer world-readable
- **New:** Every collection has holder perks, not just Conmen and Mid Evils — Skull X gets 3x Markets luck, $MIM/Bitcoin Wizard gets +40% capital inflow, Genuine Undead gets Second Life. All five get a $3,000 holder bonus. See [Holder Perks](#-holder-perks)
- **Changed:** The Conmen holder bonus is $3,000 (was $4,200). Anyone who already claimed the old amount keeps it
- **Changed:** The Caravaggio trait bonus is now additive and granted on ownership, rather than replacing starting cash for brand-new wallets only — it was previously invisible to anyone who had already played
- **New:** Connecting now announces your perks by name in a toast, so holders can actually tell what they get
- **Changed:** Perks follow the theme you WEAR, not everything you hold. A dual holder who picks Mid Evils gets Mid Evils perks only — previously they got every collection's perks at once, plus a toast per collection, which made the choice meaningless. Switching theme switches the perks; each collection's one-time cash bonus is still claimable exactly once, ever
- **Changed:** The Caravaggio trait check no longer reads the page's CSS class, which was applied asynchronously — a check running a moment early saw no theme and silently skipped the reward, and for a dual holder who hadn't answered the theme picker yet it never fired at all
- **Fixed:** Perk grants and their toasts fired over the top of the unanswered "Choose Your Theme" picker. They now wait for it

**Reliability**
- **Fixed:** The entire visual design depended on `cdn.tailwindcss.com` being reachable at page load — if it was slow, blocked or down, the site rendered as raw unstyled HTML with every modal and hidden panel visible at once. Tailwind is now a vendored stylesheet built into the repo
- **New:** Content-Security-Policy. Restricts where scripts, styles, fonts, images and network connections may come from, so a bug that got script onto the page still couldn't send player data anywhere
- **Changed:** The leaderboard refreshes on a 20-second poll instead of a Realtime subscription — Realtime enforces row-level security, so with `players` locked down the old subscription would have connected successfully and then silently never fired

**Fight Club and mini-games**
- **Fixed:** Sprite sizes are now consistent across every pose and character — victory dances, deaths, crouches and jumps were rendering at wildly different scales
- **Fixed:** Fighters could be shoved by an opponent simply walking into them
- **New:** Touch controls across Fight Club, Bonus Stage and MEV Sandwich
- **New:** Mid Evils easter egg, plus theme music for Skull X and Genuine Undead (both tracks were in the repo but unreachable)
- **Fixed:** Embedded easter-egg games now stop the site's background music instead of playing over it
- **Fixed:** A listener leak in the Windows 95 desktop that accumulated handlers every time it was opened
- **Performance:** Fight Club loads only the two characters in the match (3.80MB → 2.18MB, 2064ms → 654ms); MEV Sandwich runs 2.8–8x faster; the Victim Hall of Fame is capped so saves stop growing without bound

### v2.0.0 — LET HIM COOK!
- **New mini-game:** Fight Club — a full local fighting game (TEST Play preview). 4 characters, 4 arenas, CPU opponent, guard meter/chip damage, counter-hits, combo scaling, real recorded sound effects, and matching arena music
- **New mini-game:** Bonus Stage — Destroy the Fry Machine, back and fully working after being accidentally overwritten in an earlier commit. Available to real Mid Evils/Conmen holders in LIVE, own dedicated theme music, real metal-impact sound effects
- **New:** Cosmetic theme system expanded — Mid Evils and Conmen are now real, NFT-gated LIVE themes; Skull X, $MIM/Bitcoin Wizard, and Genuine Undead exist as TEST Play previews (Wizard theme includes a full Windows 95 desktop UI and rotating AOL-style "wizard says" popups)
- **New:** Online Fight Club — Supabase Realtime matchmaking lobby, gated to real NFT holders or TEST Play
- **New:** Bitcoin wallet support (Xverse, UniSat) for Bitcoin Wizards/$MIM rune checks — TEST Play only, read-only, address-only, same trust model as the Solana wallet connect
- **Security:** Several TEST-only and NFT-gated actions (Fight Club, Bonus Stage, the Conmen easter egg, the debug menu) were only ever hidden in the UI, not actually blocked in code — meaning calling them directly from the browser console bypassed the gate entirely. All now hard-gated at the function level
- **Security:** The Conmen easter egg was checking for the Conmen cosmetic theme being active, which TEST Play's Theme Preview also triggers — so it was firing in TEST preview, not just for real LIVE holders like intended. Now checks real ownership specifically
- **Security:** A rare $10,000 jackpot event (Rug Creator) had no cooldown at all, so calling its function directly from the console repeatedly meant infinite money. Now cooldown-protected
- **Security:** Several places were inserting text into the page without escaping it first (a debug panel, OpenShit's collection-name field, the victim leaderboard) — low-severity (self-only, no cross-player impact) but fixed regardless
- **Security:** Added a database-level rule that clamps how much a leaderboard score can jump in a single save, so a locally-tampered number can't land on the shared leaderboard other players see
- **Fixed:** A fighter who won mid-air would freeze frozen in their jump pose playing the victory animation instead of actually falling to the ground first
- **Fixed:** Reiffer's kick animation had a stray "ghost fist" flickering in from the neighboring frame in the sprite sheet — the source art wasn't cut into even frames
- **Fixed:** "Play Fight Game" appeared broken immediately after picking a cosmetic theme in TEST Play — the Theme Preview modal never closed itself after a selection, so it just sat on top of everything silently eating the next click

### v1.6.9 — Leaders of Rugging: Web3 Integrations Begin
- **New:** Wallet Connect (Phantom) — read-only, address-only, never requests a transaction or a signature *(superseded: a sign-in signature was added in Unreleased above. Connecting is still read-only and still never requests a transaction)*
- **New:** Cloud save — your wallet address becomes your save-slot key, pick up your run on any device
- **New:** Live Leaderboard — ranks lifetime earned, updates in real time across every open tab via Supabase Realtime
- **New:** .sol domain resolution — a connected wallet with a Solana Name Service domain shows that domain (e.g. "degen.sol") instead of its address, everywhere in the UI and on the leaderboard
- **New:** Market Volatility — passive wallet decay every 5 min of active play (-1% to -10%, 0.01% chance of a -25% Black Swan)
- **New:** Pay Y Social Influencer capped at 3 uses per session, plus a new 0.01% "Influencer Rug" outcome (-25% wallet)
- **Changed:** Floor Pump & Dump is no longer a one-time exit — it's now repeatable and stacks a floor multiplier (±15% per use, multiplicative), with a 0.01% hack chance per use (-90% wallet)
- **Changed:** Mint & Rug now applies the floor multiplier to its payout, and carries a new 1% wallet-hack risk (-90%) specifically when rugging before the collection fully sells out
- **Fixed:** Pay Y Social Influencer, Mint & Rug, and Floor Pump & Dump were all getting disabled (greyed out, unclickable) after launching a collection — a `pointer-events-none` lock meant for the config fields was accidentally applied to their shared parent container instead
- **Fixed (security):** Rug Creator's custom liquidity field accepted negative numbers, which meant "spending" liquidity to deploy actually *added* cash instead of subtracting it — an infinite free-money exploit. Input is now validated; invalid or non-positive values safely fall back to the $200 default
- **Fixed (security):** MEV Sandwich and AI Auditor compile cooldowns were tracked in memory only, so reloading the page instantly reset either cooldown — letting both be spammed far faster than intended (MEV Sandwich pays out real cash per use). Both cooldowns now persist properly and survive a reload

### v1.0.0 — OpenShit
- **New mini-game:** OpenShit — AI image generation, 500-NFT fake collections, fake Y social feed, Mint & Rug + Floor Pump & Dump exits
- **New:** Heman Tusk easter egg — 1% chance of instant sellout, uses your actual AI image as his pfp
- **New:** 75 hype / 59 panic / 59 rug Y feed posts, no-repeat system
- **Expanded:** All Markets flavor pools to 50-75+ entries (BOT_NAMES, HANDLES, FAKE_RIVAL_TOKENS, CHAIN_LOG_TEMPLATES, MEV lines, FAKE_WHALE_NAMES)
- **Expanded:** All Staking flavor pools to 50+ entries, 70 ambient yield log entries
- **Expanded:** All Auditor flavor pools to 50-65 entries each
- **Fixed:** Toxicity Tax slider not updating % readout live
- **Fixed:** Ponzi Yield Pool — withdrawn principal not clearing displayed balance
- **Fixed:** Ponzi Yield Pool — unclaimed rewards not zeroing after harvest
- **Fixed:** Ponzi Yield Pool — withdraw button now auto-harvests simultaneously
- **Fixed:** Mempool Roulette tab staying visible after switching away
- **Fixed:** Regulatory Heat showing 14 decimal places (now 2 d.p.)
- **Fixed:** Markets wager — RUGGED/DRAINED/BUST events now always show the trade opening first before resolving
- **Changed:** AI Auditor — must change code between compiles; same input rejected
- **Changed:** AI Auditor compile now carries wallet-penalty risk (10% → 10% wallet, 0.01% → 35% wallet)
- **Changed:** Ponzi Yield Pool withdrawal now carries 0.01% rug risk
- **Changed:** MEV Sandwich button renamed from "Frontrun The Mempool"
- **Changed:** OpenShit shill button costs $100, not $50

### v0.6.9 — No Crying in the Casino
- Leverage scalping in Markets (25x/50x/75x/100x) with real P&L multiplier and bust odds
- Wager system (10%/50%/custom $) gating Pump/Dump buttons
- Dashed entry-price line on chart + live order in orderbook
- MEV Sandwich cooldown ability (Level 3)
- 4-tier Marketing Campaigns in Rug Creator
- Withdraw Principal added to Ponzi Yield Pools
- Perk Shop fully functional — all 3 perks wired to real effects
- Coming Soon overlay on Mempool Roulette
- Expanded How To Play section

---

## ⚖️ Disclaimer

This is satire. In real life, rug pulls, honeypot tokens, and NFT exit scams steal real money from real people and are illegal in most jurisdictions. Nothing in this repository is financial, legal, or security advice.

**MIT License** — do whatever you want with it, just don't use it to actually scam anyone.
