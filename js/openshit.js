/* ============================================================
   OPENSHIT — SATIRICAL NFT COLLECTION MINI-GAME
   ============================================================
   Mocking OpenSea and NFT culture. Generate a real AI image
   via Pollinations.ai (free, zero API keys), "mint" it as a
   fake NFT collection on the fake Shitcore blockchain, run
   a fake Y (not-Twitter) social media hype campaign, and exit
   via Mint & Rug OR Floor Pump & Dump.

   Self-contained: patches switchTab automatically so index.html
   only needs one extra <script> tag.
   ============================================================ */

/* ---- constants ---- */
const NFT_SUPPLY        = 500;
const NFT_LAUNCH_COST   = 100;
const NFT_HYPE_DECAY    = 0.28;   // /sec — much slower than Rug Creator's 2.5
const NFT_BASE_MINT_RATE = 0.56;  // NFTs/sec at 100% hype → ~15 min to fill 500
const NFT_Y_INTERVAL    = 4200;   // ms between ambient Y posts
const IP_LAWSUIT_CHANCE = 0.0003; // /sec while collection is live
const DMCA_CHANCE       = 0.0007; // /sec while collection is live

/* ---- runtime state ---- */
let nftCollection    = null;
let nftGameInterval  = null;
let nftYFeedTimer    = null;
let nftImageUrl      = null;
let nftYRecentSet    = new Set();

/* ============================================================
   Y (FAKE TWITTER) POST POOLS
   ============================================================ */

const Y_POSTS_HYPE = [
    n=>`gm gm 🌅 ${n} is the move today, stack before it sells out`,
    n=>`wen reveal ${n}??? the art better go hard after all this hype 👀`,
    n=>`just minted my 3rd ${n}. floor is about to absolutely MOVE`,
    n=>`the ${n} team is based, doxxed (on their terms), and built different. WAGMI`,
    n=>`${n} giving me heavy BAYC 2021 vibes rn. not financial advice but FINANCIAL ADVICE`,
    n=>`not gonna lie ${n} art is mid but the utility is 🔥🔥🔥 (utility TBA)`,
    n=>`already flipped two ${n} up 4x. this is too easy ser`,
    n=>`${n} discord is actually the most alpha community I've joined this cycle`,
    n=>`diamond hands on my ${n} 💎🙌 never selling. wife doesn't know yet`,
    n=>`wen ${n} staking? the roadmap says Q3. it is Q4. asking for a friend`,
    n=>`the ${n} mint was smooth as butter. no gas wars, no crashes. team delivered`,
    n=>`my ${n} NFT is literally my entire personality now and I am at peace with that`,
    n=>`${n} floor up 40% in 24 hours. told you guys. I literally told you.`,
    n=>`just listed my ${n} for 100x floor. not selling below that. not a threat`,
    n=>`${n} is what happens when you actually ship. take notes, other devs`,
    n=>`grabbed 5 ${n} at mint. my current portfolio: mostly ${n}. I have no regrets`,
    n=>`new Twitter bio: proud holder of ${n} 🖼️ I have become the thing`,
    n=>`${n} team just posted a dev update. one sentence. extremely bullish somehow`,
    n=>`someone offered me 10x on my ${n}. I said no. I am not a well person`,
    n=>`wen lambo? after ${n} goes to 10 eth floor. simple math, do not question it`,
    n=>`${n} has the best community. everyone here is kind and completely delusional together`,
    n=>`my ${n} is my retirement plan. no I am not joking. yes my wife knows.`,
    n=>`ser the ${n} contract is clean, art is unique, team is anon but TRUST THE PROCESS`,
    n=>`${n} is gonna be a top 10 collection. calling it now. screenshot this`,
    n=>`just got off a ${n} Twitter Space. the alpha was REAL and very unverifiable`,
    n=>`${n} collab announcement coming. I cannot say more. I don't know more. BUY`,
    n=>`${n} is 70% minted. if you're not in yet... ser... SER... please`,
    n=>`I've explained ${n} to my financial advisor 3 times. She said "please stop calling."`,
    n=>`${n} holder checking in. floor is floor. we are fine. I think we are fine.`,
    n=>`just used my ${n} as collateral for a loan to buy more ${n}. this is fine`,
    n=>`found ${n} through a sponsored tweet. that counts as due diligence right`,
    n=>`${n} is why I believe in NFTs. also why I no longer have a savings account`,
    n=>`gm to everyone except ${n} fudders. they know what they did`,
    n=>`the ${n} roadmap just updated. Phase 1: done ✅ Phase 2: soon™ Phase 3: ✨🚀✨`,
    n=>`my ${n} is worth more than my car. my car is a 2009 Civic. still bullish`,
    n=>`${n} is proof you don't need utility if the community is strong enough to cope together`,
    n=>`just checked the ${n} contract. I don't understand it but it looked fine to me`,
    n=>`the ${n} art is procedurally generated which means it's rare which means it's valuable. logic.`,
    n=>`if ${n} goes to zero I will simply not look at my wallet. diamond hands by ignorance`,
    n=>`${n} community call just happened. the audio cut out for the important parts. bullish somehow`,
    n=>`the ${n} roadmap is 3 phases. Phase 1: launch. Phase 2: "soon". Phase 3: a second roadmap.`,
    n=>`ser I FOMO'd into ${n} at 3am and I regret nothing. I regret everything. I regret nothing`,
    n=>`just did my technical analysis on ${n}. the chart goes up. I drew a line. WAGMI.`,
    n=>`${n} is my emergency fund now. this is fine. this is not fine.`,
    n=>`told my therapist about ${n}. she said we need to talk about financial self-harm. appointment next week`,
    n=>`${n} has better fundamentals than my savings account. my savings account has $0. coincidence?`,
    n=>`the ${n} community is the most supportive group I've ever lost money with`,
    n=>`bought 5 ${n} at mint and my portfolio is now 94% ${n}. diversified.`,
    n=>`${n} whitepaper dropped. 47 pages. I read the header. EXTREMELY BULLISH`,
    n=>`gm. just checked ${n} floor. still up. going back to sleep. gm again`,
    n=>`the ${n} dev is building in silence which means either they're cooking or they left. I choose to believe cooking`,
    n=>`${n} collab with a brand I've never heard of JUST ANNOUNCED. this is the catalyst`,
    n=>`I sold my ${n} for a 2x and cried when it went 10x the next day. I am not well`,
    n=>`${n} is the reason I check my phone every 23 minutes at night`,
    n=>`the ${n} floor chart looks like a staircase to heaven and I am on step 3`,
    n=>`my ${n} holder count: 1. that 1 is me. I am the community. I will not stop.`,
    n=>`${n} has a vibe that cannot be quantified by traditional metrics only by gut feeling and delusion`,
    n=>`just added ${n} to my portfolio tracker. portfolio tracker said "are you okay" which I thought was rude`,
    n=>`${n} is not just an NFT it is a lifestyle and a financial mistake I am proud of`,
    n=>`wen ${n} gets listed on Coinbase? I said wen? SER. WEN?`,
    n=>`the art for ${n} is AI generated which makes it even more rare somehow trust me`,
    n=>`${n} is the hill I will die on. hopefully not literally. probably not literally.`,
    n=>`verified ${n} holder here. I have contributed meaningfully to making this dev rich`,
    n=>`${n} floor holding strong. I said it once and I'll say it again: diamond. hands.`,
    n=>`I have explained why I bought ${n} to 6 different people. all 6 unfollowed me. their loss`,
    n=>`${n} is the answer to the question nobody asked but I answer anyway at family dinners`,
    n=>`the ${n} community call had 12 people. I was 11 of them. commitment.`,
    n=>`if ${n} doesn't make me rich it will at least make me a cautionary tale with a great story`,
    n=>`just got my ${n} in a cold wallet. it is now permanently and irreversibly safe from gains`,
    n=>`${n} community holding a vote on the next feature. options are: "more hype" or "even more hype". democracy`,
    n=>`my wife said choose between ${n} and her. I said I'll flip a coin. I did not flip a coin`,
    n=>`${n} utility just announced: "exclusive access to future ${n} content". it's more ${n}.`,
    n=>`burned my ${n} by accident. floor went up. I am a genius or a disaster. probably both`,
    n=>`${n} is my whole personality until I get rugged at which point it never happened`,
    n=>`ser if you're not in ${n} you're basically leaving money on the table right next to your dignity`,
];

const Y_POSTS_PANIC = [
    n=>`wait why is the ${n} website loading a blank page is that just me`,
    n=>`${n} team hasn't replied in 12 hours. probably sleeping lol. it's been 36 hours`,
    n=>`is anyone else's ${n} not showing in their wallet or literally just me please respond`,
    n=>`${n} floor dropped 60% in an hour. just a temporary dip. buying more. send help`,
    n=>`the ${n} Discord just went private. that's normal right? devs do that right?`,
    n=>`${n} dev wallet just moved 50 ETH. I'm sure it's nothing. I know it's something.`,
    n=>`can someone explain the ${n} chart to me because I am not emotionally stable right now`,
    n=>`${n} was my biggest bag and now I don't know what to call it`,
    n=>`just checked the ${n} contract. there's a function I didn't notice before. it's called exitAll(). probably unrelated`,
    n=>`${n} team: "wen reveal?" Dev: [last seen 3 days ago]`,
    n=>`the ${n} roadmap milestone that was due last month is now "in final testing"`,
    n=>`floor of ${n} just hit a new low. telegram mod says "zoom out." I zoomed out. It's worse.`,
    n=>`${n} volume has dropped 90% in 24 hours. the team calls it "consolidation." I call it my portfolio`,
    n=>`just tried to sell my ${n}. the sell didn't go through. checked the contract. there's a reason.`,
    n=>`${n} dev posted "we're aware of the situation" without specifying what situation. I am aware of my fear`,
    n=>`the ${n} Telegram just went silent. it was 400 messages a minute 6 hours ago. now: nothing.`,
    n=>`someone on ${n} Discord said "trust the process." the process has not responded to messages in 48 hours`,
    n=>`${n} floor just hit a price I didn't think was possible in this direction`,
    n=>`uh ${n} just disabled the buy function on their dapp. they say it's "maintenance." it's 2am.`,
    n=>`the ${n} team's last tweet was "exciting things coming 🚀" 6 days ago. the rocket appears to have gone somewhere else`,
    n=>`${n} community vote results: 97% want the dev to respond. dev has not responded to the vote results`,
    n=>`just checked ${n} on-chain. the dev wallet has been very active tonight. in the wrong direction.`,
    n=>`${n} promised utility by Q2. it is Q4 of the following year. "Q2" was a vibe, not a date`,
    n=>`the ${n} website SSL certificate just expired. small thing. totally fine. I'm not fine.`,
    n=>`${n} floor is now lower than my self esteem and my self esteem has been bearish for months`,
    n=>`did ${n} always have a function called migrateToNewWallet() in their contract? asking for a reason`,
    n=>`${n} roadmap says "partnerships with major brands" and the only partner announced is a Discord bot`,
    n=>`the ${n} community manager just changed their bio. it no longer mentions ${n}. I saw it.`,
    n=>`${n} just pushed a contract update. nobody asked for an update. the update was not announced.`,
    n=>`I cannot explain why but ${n} gives me a feeling I had right before my last relationship ended`,
    n=>`${n} mods are saying "all good, dev is cooking" with the same energy as someone who smells smoke`,
    n=>`did the ${n} whitepaper always have this section called "team compensation mechanism"? feels new`,
    n=>`${n} OpenSea volume: $0 in the last 7 days. the team says this is "a market condition"`,
    n=>`the ${n} Discord just went from 4000 members to 380. people are leaving and not saying why.`,
    n=>`${n} mystery Twitter Space scheduled for tonight. the dev did not join. we waited 90 minutes.`,
    n=>`${n} community: where is the dev? dev: 🫥`,
    n=>`just noticed the ${n} contract has an emergency pause function. wondering when it will feel appropriate to use it`,
    n=>`${n} floor dropped while I was asleep. I am setting an alarm from now on. I cannot explain why I think that will help`,
    n=>`the ${n} collab that was announced 3 weeks ago has not been mentioned again. I have mentioned it 17 times.`,
    n=>`${n} staking rewards haven't been paid for 11 days. team says "smart contract delay." delay looks intentional on-chain.`,
    n=>`${n} just quietly removed the "roadmap" section from their website. it was there yesterday. I have screenshots.`,
    n=>`the ${n} twitter account just followed 0 new accounts and unfollowed 3000. I don't know what this means`,
    n=>`I'm in the ${n} holder chat and we're all just sending each other memes to cope. no one will say it.`,
    n=>`${n} "strategic advisor" removed themselves from the website. they were listed as the reason I bought`,
    n=>`the ${n} contract deployer wallet just transferred to an exchange. small amount. just testing probably. probably.`,
    n=>`I asked the ${n} dev directly. they said "all is well." that's it. "all is well." that's all I got.`,
    n=>`${n} revenue wallet just received funds and immediately sent them to a different wallet. normal treasury stuff right`,
    n=>`${n} launch was 6 weeks ago. promised product demo was 4 weeks ago. demo has not materialized into reality`,
    n=>`three ${n} mod accounts were created the same day. all three posted "don't panic" at the same time. I am panicking`,
    n=>`${n} community voice channel: 47 people talking about whether the dev is alive. dev has not joined the call`,
    n=>`I've been holding ${n} through 4 dips. this 5th one feels different in a way I cannot articulate`,
    n=>`someone in ${n} chat said "it's not a rug if you don't sell" and 12 people said "facts" and I'm scared`,
    n=>`${n} founder wallet just transferred to a new wallet with no transaction history. I've been staring at this for an hour`,
    n=>`the ${n} smart contract has a function I didn't notice before. it's called withdrawAll(address). I'm sure it's fine.`,
    n=>`${n} team just posted their first update in 3 weeks: one sentence, no details, 3 rocket emojis. I wish I felt better`,
    n=>`${n} moderator just said "not here to spread fud" in response to a question about where the funds went`,
    n=>`something is wrong with ${n} and I can't say what it is because I don't understand the contract but something is wrong`,
    n=>`${n}: I have trust issues from before and this is not helping`,
    n=>`the ${n} token unlock schedule just changed in a way that wasn't in the whitepaper. "team decision." I see.`,
];

const Y_POSTS_RUG = [
    n=>`I GOT RUGGED ON ${n.toUpperCase()}. I am going to lie down`,
    n=>`${n.toUpperCase()} EXIT SCAM CONFIRMED. dev wallet drained. I cannot believe I am typing these words`,
    n=>`${n} team deleted the Discord. deleted the Twitter. deleted my net worth.`,
    n=>`writing this from a ${n} support group. there are 47 of us in this server`,
    n=>`${n} was my first NFT. and my last NFT. I am going back to index funds`,
    n=>`${n} rug happened in 4 seconds. I was on my phone. I saw it happen. I could do nothing.`,
    n=>`making a documentary about the ${n} rug. it's called "I Told You So" narrated by my wife`,
    n=>`${n} is why I believe in regulation now and I will not be taking questions`,
    n=>`shoutout to the ${n} dev for the financial literacy lesson. most expensive education I've had`,
    n=>`${n} floor: 0. My dignity: also 0. Available for comment if anyone from the media wants`,
    n=>`filed a police report about ${n}. officer asked if I really paid that for a jpeg. he was right to ask`,
    n=>`the ${n} rug was so fast I didn't even have time to panic. it just happened. done. gone.`,
    n=>`the ${n} rug has been confirmed by three block explorers, one journalist, and my own eyes`,
    n=>`${n} post-mortem: the dev was one person, the audit was a logo, and I am a cautionary tale`,
    n=>`asked for a refund on my ${n}. the wallet is empty. the Discord is deleted. the website returns a 404.`,
    n=>`${n} community right now is 200 people in a server sending each other the blockchain transaction as if seeing it will reverse it`,
    n=>`I have been scammed by ${n} and I would like everyone to know because awareness is all I have left`,
    n=>`the ${n} dev's final Twitter post was "🙏" and then the account was deleted. the prayer did not reach me`,
    n=>`${n} exit scam was so clean the dev must have planned it from day 1. I tipped my imaginary hat. then I cried.`,
    n=>`I bought ${n} after seeing someone on here say "this is it ser." it was not it. I know that now.`,
    n=>`${n} rug timeline: 9am launch, 11am presale filled, 3pm website down, 6pm discord deleted, 9pm I found out`,
    n=>`the ${n} dev made more money in 4 hours than I made in a year and the SEC is not involved. yet.`,
    n=>`${n} holders are currently in 5 different Telegram groups trying to organize something. we have no leverage. literally.`,
    n=>`filed a police report about ${n}. the officer asked what an NFT is. I explained for 20 minutes. he did not help.`,
    n=>`${n} community post-rug: we've started a support group. attendance: 84. mood: dark but together`,
    n=>`the ${n} rug was so fast I didn't even get to watch it in real time. I blinked. gone.`,
    n=>`${n} dev: 1. Community: 0. Decentralization: never real. Trust: destroyed. Lesson: expensive`,
    n=>`somewhere a ${n} dev is buying a car and I am buying nothing because my money is in that car`,
    n=>`${n} is a great example of why you should do research. I did no research. I am the example.`,
    n=>`the ${n} founders are "doxxed" which apparently meant a LinkedIn with a stock photo and a fake name`,
    n=>`I've accepted the ${n} rug. the five stages: denial, anger, bargaining, depression, and this post`,
    n=>`${n} community tried to track down the dev. we found a Discord alt, a VPN, and a dead end.`,
    n=>`woke up. checked ${n}. rugged. made coffee. considered my choices. the choices were bad.`,
    n=>`the ${n} smart contract had an emergency withdraw function. the dev considered it an emergency.`,
    n=>`${n} was my first NFT and a complete financial disaster and somehow I'm already looking at the next project`,
    n=>`I know I said I was done with NFTs after the last rug. ${n} was supposed to be different.`,
    n=>`${n} dev exit was so thorough they deleted the GitHub. the commits. the repo. everything. respect the commitment.`,
    n=>`my ${n} bags are now worth the approximate value of a thought and a feeling`,
    n=>`${n} rug confirmed. I have 47 tabs open about how to recover funds. all 47 tabs say the same thing: you cannot`,
    n=>`the ${n} community has produced 3 memes about the rug and they are all very funny and very sad`,
    n=>`${n} devs if you're reading this: I hope the Lambo was worth it. genuinely. enjoy it.`,
    n=>`lesson from ${n}: the audit badge on the website is an image file. not a report. an image. a JPG of trust.`,
    n=>`${n} Discord final messages before deletion: "when refund" "never" *deleted*`,
    n=>`the ${n} rug hit me different because I had just told my friend to buy. he did. we don't talk now`,
    n=>`${n} investors forming a DAO to coordinate recovery efforts. the DAO has no treasury. we are aware of the irony.`,
    n=>`I wrote a letter to the ${n} dev. not sure where to send it. sending it to the void. the void has my money anyway`,
    n=>`${n} is proof that vibes are not a financial instrument. I voted yes on vibes. the market voted no.`,
    n=>`the ${n} team posted one final message: "thank you for your support 🙏" — I did not feel supported.`,
    n=>`${n} rugged 11 days after the "community treasury" was funded. the treasury funded the rug.`,
    n=>`I spent 3 weeks in the ${n} Discord, learned the lore, made friends, then the dev vanished with $400k`,
    n=>`${n} holders support group session 4: we have accepted the loss. we are now watching for the v2 launch. we know.`,
    n=>`the ${n} rug was executed with more precision than any product they described in the whitepaper`,
    n=>`somewhere in the ${n} contract there was an exitScam() function. we should have checked. we did not check.`,
    n=>`${n} exit complete. time from launch to rug: ${Math.floor(Math.random()*20+2)} days. another one for the record books.`,
    n=>`I keep refreshing the ${n} contract hoping the money comes back. it does not. it will not. I know.`,
    n=>`${n} post-mortem published by community. 4000 words. dev read it from a yacht. we assume.`,
    n=>`the ${n} community has graduated from grief to anger to a very specific type of DeFi cynicism`,
    n=>`${n} was my tuition payment to the school of on-chain education. the school has no diploma.`,
    n=>`I now check every contract for the word "rug" before buying. ${n} taught me this. too late for ${n}.`,
];

/* ============================================================
   IMAGE GENERATION — POLLINATIONS.AI
   ============================================================ */

function generateNFTImage() {
    const prompt = document.getElementById('nftPrompt').value.trim();
    if (!prompt || prompt.length < 5) {
        showToast('Enter a prompt (at least 5 characters) to generate your NFT art.', 'error');
        return;
    }

    const btn      = document.getElementById('generateNftBtn');
    const imgEl    = document.getElementById('nftPreviewImg');
    const overlay  = document.getElementById('nftImgOverlay');
    const progress = document.getElementById('nftGenProgress');

    btn.disabled  = true;
    btn.innerText = 'Generating…';
    overlay.classList.remove('hidden');
    progress.style.width = '0%';

    // Animate progress bar while waiting
    let pct = 0;
    const prog = setInterval(() => {
        pct = Math.min(90, pct + Math.random() * 8);
        progress.style.width = pct + '%';
    }, 400);

    const seed = Math.floor(Math.random() * 99999);
    const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&model=flux&seed=${seed}`;

    const loader = new Image();
    loader.onload = () => {
        clearInterval(prog);
        progress.style.width = '100%';
        setTimeout(() => {
            nftImageUrl = url;
            imgEl.src   = url;
            imgEl.classList.remove('hidden');
            overlay.classList.add('hidden');
            document.getElementById('nftLaunchBtn').disabled = false;
            btn.disabled  = false;
            btn.innerText = '🎨 Regenerate';
            playSound('buy');
            showToast('NFT art generated! Set your collection details and launch.', 'success');
        }, 300);
    };
    loader.onerror = () => {
        clearInterval(prog);
        overlay.classList.add('hidden');
        btn.disabled  = false;
        btn.innerText = '🎨 Generate NFT Art';
        showToast('Image generation failed — check your internet connection.', 'error');
    };
    loader.src = url;
}

/* ============================================================
   LAUNCH
   ============================================================ */

function launchNFTCollection() {
    if (nftCollection) {
        showToast('You already have an active collection running.', 'error');
        return;
    }
    if (!nftImageUrl) {
        showToast('Generate your NFT art first.', 'error');
        return;
    }

    const name      = (document.getElementById('nftCollectionName').value.trim() || 'Anonymous Shitcoins');
    const ticker    = (document.getElementById('nftTicker').value.trim()  || 'SHIT').toUpperCase().slice(0, 5);
    const mintPrice = parseFloat(document.getElementById('nftMintPrice').value) || 2.5;

    if (mintPrice <= 0) { showToast('Mint price must be greater than 0.', 'error'); return; }
    if ((state.cash || 0) < NFT_LAUNCH_COST) {
        showToast(`Need $100 USDSHT to deploy the collection.`, 'error');
        return;
    }

    state.cash -= NFT_LAUNCH_COST;

    nftCollection = {
        name, ticker, mintPrice,
        supply: NFT_SUPPLY,
        minted: 0,
        revenue: 0,
        hype: 65,
        mintComplete: false,
        dmcaWarned: false,
        imageUrl: nftImageUrl,
        launchTime: Date.now(),
    };

    /* lock setup panel, show monitor + exit buttons */
    document.getElementById('nftSetupPanel').classList.add('opacity-40', 'pointer-events-none');
    document.getElementById('nftLaunchBtn').classList.add('hidden');
    document.getElementById('nftExitBtns').classList.remove('hidden');
    document.getElementById('nftMonitor').classList.remove('hidden');
    document.getElementById('nftMonitorName').innerText = `${name}  (${ticker})`;

    /* seed Y feed */
    pushYPost('OpenShitOfficial', 'openshit_official', true, '🖼️',
        `✨ NEW DROP: ${name} (${ticker}) is LIVE on OpenShit! ${NFT_SUPPLY} NFTs. Mint is open. LFG 🚀🚀🚀`);
    setTimeout(() => {
        const fn = Y_POSTS_HYPE[Math.floor(Math.random() * 6)];
        pushYPost(`EarlyApe${Math.floor(Math.random()*99)}`, `early_minter_${Math.floor(Math.random()*999)}`, false, '🦍', fn(name));
    }, 2500);

    if (nftGameInterval) clearInterval(nftGameInterval);
    if (nftYFeedTimer)   clearInterval(nftYFeedTimer);
    nftGameInterval = setInterval(nftTick, 1000);
    nftYFeedTimer   = setInterval(nftAmbientYPost, NFT_Y_INTERVAL);

    playSound('launch');
    showToast(`🚀 ${name} is live! Watch the mints roll in.`, 'success');
    saveGame();
    updateUI();
    nftUpdateUI();
}

/* ============================================================
   GAME TICK — called every second while collection is live
   ============================================================ */

function nftTick() {
    const col = nftCollection;
    if (!col) return;

    /* --- 0.01% general drain: any interaction with OpenShit risks the whole wallet --- */
    if (Math.random() < 0.0001) {
        nftSeize('DRAINED', '☠️ DRAINED! An unknown exploit swept your entire wallet while your NFT collection was live. Wallet: $0. Collection: seized. Have a nice day.');
        state.cash = 0;
        updateUI();
        return;
    }

    /* --- IP Lawsuit: instant seizure --- */
    if (Math.random() < IP_LAWSUIT_CHANCE) {
        nftSeize('IP LAWSUIT',
            `⚖️ IP LAWSUIT! A corporation claims your AI-generated art infringes their copyright. The entire collection has been seized and your mint revenue forfeited. Should have used clip art.`);
        return;
    }

    /* --- DMCA Strike: hype tank --- */
    if (Math.random() < DMCA_CHANCE && !col.dmcaWarned) {
        col.dmcaWarned = true;
        col.hype = Math.max(0, col.hype - 28);
        playSound('alarm');
        showToast('⚠️ DMCA STRIKE! A claim was filed on your AI art. Hype tanked 28%.', 'error');
        pushYPost('IP_WatchDog', 'ip_watch_dog_nft', true, '⚖️',
            `DMCA filed against ${col.name}. turns out the AI art is based on a stock image. the irony of suing an NFT project for IP theft is not lost on anyone`);
    }

    /* --- Hype decay --- */
    col.hype = Math.max(0, col.hype - NFT_HYPE_DECAY);

    /* --- Mint accrual --- */
    const mintsThisTick = (col.hype / 100) * NFT_BASE_MINT_RATE * (0.4 + Math.random() * 1.2);
    col.minted  = Math.min(NFT_SUPPLY, col.minted + mintsThisTick);
    col.revenue = col.minted * col.mintPrice;

    /* --- Panic tweets when hype drops below 40% --- */
    if (col.hype < 40 && Math.random() < 0.07) {
        const fn = Y_POSTS_PANIC[Math.floor(Math.random() * Y_POSTS_PANIC.length)];
        const handles = ['worried_holder','floor_watcher','rugdar','ser_is_it_ok','anon_degen'];
        pushYPost('WorriedHolder'+Math.floor(Math.random()*99),
            handles[Math.floor(Math.random()*handles.length)]+'_'+Math.floor(Math.random()*999),
            false, '😰', fn(col.name));
    }

    /* --- SOLD OUT --- */
    if (col.minted >= NFT_SUPPLY && !col.mintComplete) {
        col.mintComplete = true;
        playSound('lambo');
        showToast(`🎉 ${col.name} is SOLD OUT! ${NFT_SUPPLY}/${NFT_SUPPLY} minted. Choose your exit.`, 'success');
        pushYPost('OpenShitOfficial', 'openshit_official', true, '🎉',
            `${col.name} SOLD OUT in ${Math.round((Date.now() - col.launchTime)/60000)} minutes. Congratulations to all holders. 🎊`);
    }

    nftUpdateUI();
}

/* ============================================================
   EXIT STRATEGIES
   ============================================================ */

function mintAndRug() {
    const col = nftCollection;
    if (!col) return;
    if (col.minted < 5) { showToast('Need at least 5 mints before you can rug.', 'error'); return; }

    clearInterval(nftGameInterval);
    clearInterval(nftYFeedTimer);
    playSound('rug');

    const haul = Math.round(col.revenue);
    state.cash  = (state.cash || 0) + haul;
    state.lifetimeEarned = (state.lifetimeEarned || 0) + haul;
    nftAddHeat(7 + Math.random() * 8);

    /* post rug tweets with delay */
    const rugPosts = Y_POSTS_RUG.slice(0, 6);
    const rugAvatars = ['😭','😤','🤬','💀','😶','🫥'];
    const rugHandles = ['rugged_again_lol','exit_liquidity_was_me','i_should_have_known','degenerate_lesson','ngmi_confirmed','anon_victim'];
    rugPosts.forEach((fn, i) => {
        setTimeout(() => pushYPost(`RuggedHolder${i+1}`, rugHandles[i], false, rugAvatars[i], fn(col.name)), i * 900);
    });

    const colName = col.name;
    nftCollection = null;
    nftResetUI();
    saveGame();
    if (typeof checkProgressions === 'function') checkProgressions();
    updateUI();
    showAlertModal(`💀 MINT & RUG COMPLETE!\n\nYou ghosted the ${colName} community and walked away with $${haul.toLocaleString()} USDSHT in mint revenue.\n\n${Math.floor(col.minted)} people are currently in a Discord server asking where you went.`);
}

function floorPumpAndDump() {
    const col = nftCollection;
    if (!col) return;
    if (col.minted < 30) { showToast('Need at least 30 mints to pump the floor.', 'error'); return; }

    clearInterval(nftGameInterval);
    clearInterval(nftYFeedTimer);
    playSound('lambo');

    /* multiplier based on hype: 1.5x at 0% hype → 4x at 100% hype */
    const multiplier = 1.5 + (col.hype / 100) * 2.5;
    const haul = Math.round(col.revenue * multiplier);
    state.cash  = (state.cash || 0) + haul;
    state.lifetimeEarned = (state.lifetimeEarned || 0) + haul;
    nftAddHeat(14 + Math.random() * 11);

    pushYPost('FloorWatcher', 'nft_floor_watch', true, '📊',
        `${col.name} floor just ${multiplier.toFixed(1)}x'd in 10 minutes. someone is listing 200 at once. this is NOT organic price discovery`);
    setTimeout(() => {
        pushYPost('BoughtTheTop', 'literally_bought_the_top', false, '😭',
            `waited weeks for the ${col.name} pump and bought at the exact top. someone dumped 200 on me simultaneously. goodbye savings`);
    }, 2200);

    const colName = col.name;
    nftCollection = null;
    nftResetUI();
    saveGame();
    if (typeof checkProgressions === 'function') checkProgressions();
    updateUI();
    showAlertModal(`📈 FLOOR PUMP & DUMP COMPLETE!\n\nYou artificially pumped the ${colName} floor ${multiplier.toFixed(1)}x and dumped your holdings on retail buyers.\n\nTotal extracted: $${haul.toLocaleString()} USDSHT.\n\nSomeone on Y is already writing a thread about you.`);
}

/* ============================================================
   MANUAL SHILL
   ============================================================ */


/* ---- Heman Tusk viral post (uses the generated NFT image as his pfp) ---- */
function pushTuskPost(collectionName, imageUrl) {
    const feed = document.getElementById('yFeed');
    if (!feed) return;

    const texts = [
        `just changed my pfp to a ${collectionName} NFT. incredible art. the future of digital ownership.`,
        `${collectionName} is the most culturally significant NFT project I've seen. changing my pfp immediately.`,
        `I don't buy NFTs. I just bought a ${collectionName}. make of that what you will.`,
        `${collectionName} reminds me of why I believe in decentralized art. pfp changed. this is the one.`,
    ];
    const text = texts[Math.floor(Math.random() * texts.length)];

    const post = document.createElement('div');
    post.className = 'border-b border-[#2F3336] p-4 flex gap-3 hover:bg-white/[0.03] transition-colors cursor-pointer border-l-4 border-l-[#1D9BF0] bg-[#1D9BF0]/5';
    const avatarHtml = imageUrl
        ? `<div class="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2 border-[#1D9BF0]"><img src="${imageUrl}" class="w-full h-full object-cover" alt="Heman Tusk" /></div>`
        : `<div class="w-10 h-10 rounded-full bg-[#1D9BF0] flex items-center justify-center flex-shrink-0 text-lg border-2 border-[#1D9BF0]">🐦</div>`;
    post.innerHTML = avatarHtml +
        `<div class="flex-1 min-w-0">` +
          `<div class="flex items-center gap-1 flex-wrap text-sm mb-0.5">` +
            `<span class="font-bold text-white">Heman Tusk</span>` +
            `<span class="text-[#1D9BF0] text-xs font-bold">✓</span>` +
            `<span class="text-[#FFD700] text-xs">⭐</span>` +
            `<span class="text-[#71767B]">@heman_tusk · just now</span>` +
          `</div>` +
          `<p class="y-post-text text-[#E7E9EA] text-sm mt-1 leading-relaxed">${text}</p>` +
          `<div class="flex gap-5 mt-2.5 text-[#71767B] text-xs select-none">` +
            `<span class="hover:text-[#1D9BF0] transition-colors cursor-pointer">💬 ${(Math.floor(Math.random()*200000+500000)).toLocaleString()}</span>` +
            `<span class="hover:text-green-400 transition-colors cursor-pointer">🔁 ${(Math.floor(Math.random()*500000+1500000)).toLocaleString()}</span>` +
            `<span class="hover:text-pink-500 transition-colors cursor-pointer">🤍 ${(Math.floor(Math.random()*5000000+14000000)).toLocaleString()}</span>` +
            `<span class="hover:text-[#1D9BF0] transition-colors cursor-pointer">📊 1,200,000,000</span>` +
          `</div>` +
        `</div>`;
    feed.prepend(post);
}

function nftShill() {
    if (!nftCollection) { showToast('Launch a collection first.', 'error'); return; }
    if ((state.cash || 0) < 100) { showToast('Not enough USDSHT. Y Social influencers cost $100.', 'error'); return; }

    state.cash -= 100;

    const roll = Math.random();

    /* 0.01% — DRAINED: paying an influencer just wiped your wallet */
    if (roll < 0.0001) {
        state.cash = 0;
        clearInterval(nftGameInterval);
        clearInterval(nftYFeedTimer);
        nftCollection = null;
        nftResetUI();
        playSound('liquidated');
        saveGame();
        updateUI();
        showAlertModal('☠️ DRAINED! The Y Social "influencer" you hired was a phishing front. Every dollar in your wallet is gone.');
        return;
    }

    /* 1% — Heman Tusk changes his pfp to your NFT → instant sellout */
    if (roll < 0.0001 + 0.01) {
        const col = nftCollection;
        col.minted = col.supply;
        col.revenue = col.supply * col.mintPrice;
        col.hype = 100;
        playSound('lambo');
        pushTuskPost(col.name, nftImageUrl);
        setTimeout(() => {
            pushYPost('NFTFloor', 'floor_is_gone', true, '📈',
                `${col.name} just sold out in 4 minutes after Heman Tusk changed his pfp. floor is already 40x. I missed the mint. I hate this.`);
        }, 2500);
        showToast(`🚀 HEMAN TUSK POSTED! ${col.name} is SOLD OUT. Absolute scenes.`, 'success');
        nftUpdateUI();
        saveGame();
        updateUI();
        return;
    }

    /* 10% — influencer scams you, hacks wallet 10-50% */
    if (roll < 0.0001 + 0.01 + 0.10) {
        const hackPct = 0.10 + Math.random() * 0.40;
        const hacked  = (state.cash || 0) * hackPct;
        state.cash    = Math.max(0, (state.cash || 0) - hacked);
        playSound('rug');
        showToast(`😱 SCAMMED! Lost $100 fee + ${Math.round(hackPct*100)}% of wallet ($${hacked.toFixed(2)}).`, 'error');
        pushYPost('ScamInfluencer', 'totally_real_nft_kol', false, '🎭',
            `just accepted $100 to shill ${nftCollection.name}. wait they want more. no actually I'm deleting this account. wallet hacked. bye forever`);
        saveGame();
        updateUI();
        nftUpdateUI();
        return;
    }

    /* SUCCESS — boost hype 5-25% and mint progress 5-10% */
    const hypeBoost = 5 + Math.random() * 20;
    const mintBoost = nftCollection.supply * (0.05 + Math.random() * 0.05);
    nftCollection.hype   = Math.min(100, nftCollection.hype + hypeBoost);
    nftCollection.minted = Math.min(nftCollection.supply, nftCollection.minted + mintBoost);
    nftCollection.revenue = nftCollection.minted * nftCollection.mintPrice;

    const viralLikes = Math.floor(Math.random()*80000+20000);
    const viralRTs   = Math.floor(Math.random()*20000+5000);

    const successPosts = [
        `${nftCollection.name} is literally the most alpha collection I've seen this cycle. not financial advice. my bags are up 3x. not financial advice`,
        `just discovered ${nftCollection.name} and I need everyone to look at this art RIGHT NOW. this is the one ser`,
        `${nftCollection.name} has the strongest community I've seen since the last project I shilled. completely unbiased opinion`,
        `my professional recommendation as a Y Social influencer: mint ${nftCollection.name} immediately. this is not financial advice (it is)`,
        `${nftCollection.name} floor is going to be disgusting. in the best possible way. screenshot this post.`,
    ];
    const postText = successPosts[Math.floor(Math.random()*successPosts.length)];

    playSound('buy');
    showToast(`📣 Influencer posted! Hype +${hypeBoost.toFixed(0)}%, Minted +${Math.floor(mintBoost)} NFTs.`, 'success');

    /* Viral Y post with inflated engagement numbers */
    const feed = document.getElementById('yFeed');
    if (feed) {
        const post = document.createElement('div');
        post.className = 'border-b border-[#2F3336] p-4 flex gap-3 hover:bg-white/[0.03] transition-colors border-l-4 border-l-amber-400 bg-amber-400/5';
        post.innerHTML =
            `<div class="w-10 h-10 rounded-full bg-[#1A1A2E] flex items-center justify-center text-lg flex-shrink-0">🎨</div>` +
            `<div class="flex-1 min-w-0">` +
              `<div class="flex items-center gap-1 text-sm mb-0.5">` +
                `<span class="font-bold text-white">NFTInfluencer${Math.floor(Math.random()*99)}</span>` +
                `<span class="text-[#1D9BF0] text-xs font-bold">✓</span>` +
                `<span class="text-[#71767B]">@nft_kol_${Math.floor(Math.random()*9999)} · just now</span>` +
                `<span class="ml-auto text-[10px] text-amber-400 font-bold uppercase">SPONSORED</span>` +
              `</div>` +
              `<p class="y-post-text text-[#E7E9EA] text-sm mt-1 leading-relaxed">${postText}</p>` +
              `<div class="flex gap-5 mt-2.5 text-[#71767B] text-xs select-none">` +
                `<span class="hover:text-[#1D9BF0] cursor-pointer">💬 ${Math.floor(viralRTs*0.1).toLocaleString()}</span>` +
                `<span class="hover:text-green-400 cursor-pointer">🔁 ${viralRTs.toLocaleString()}</span>` +
                `<span class="hover:text-pink-500 cursor-pointer">🤍 ${viralLikes.toLocaleString()}</span>` +
                `<span class="hover:text-[#1D9BF0] cursor-pointer">📊 ${(viralLikes*12).toLocaleString()}</span>` +
              `</div>` +
            `</div>`;
        feed.prepend(post);
    }

    saveGame();
    updateUI();
    nftUpdateUI();
}

/* ============================================================
   SEIZURE
   ============================================================ */

function nftSeize(type, message) {
    clearInterval(nftGameInterval);
    clearInterval(nftYFeedTimer);
    playSound('liquidated');
    nftAddHeat(20);
    nftCollection = null;
    nftResetUI();
    saveGame();
    updateUI();
    showAlertModal(message);
}

function nftAddHeat(amount) {
    state.globalHeat = Math.min(100, (state.globalHeat || 0) + amount);
    if (state.globalHeat >= 100) {
        if (typeof triggerLossGameOver === 'function') triggerLossGameOver();
    }
}

/* ============================================================
   Y FEED
   ============================================================ */

const Y_EMOJI_POOL = ['🦍','💎','🎨','🚀','🔥','⚡','🦊','🐋','🌙','💰','🎭','🤖','👾','🦄','🎪'];

function pushYPost(displayName, handle, verified, emoji, text) {
    const feed = document.getElementById('yFeed');
    if (!feed) return;

    /* no-repeat: skip if identical text already visible */
    const existing = feed.querySelectorAll('.y-post-text');
    for (const el of existing) { if (el.textContent === text) return; }

    const mins   = ['just now','1m','2m','3m','5m','8m','12m','16m'][Math.floor(Math.random()*8)];
    const likes  = Math.floor(Math.random()*9800+20);
    const rts    = Math.floor(Math.random()*890+2);
    const repls  = Math.floor(Math.random()*190+1);
    const views  = (likes * (Math.floor(Math.random()*8)+2)).toLocaleString();
    const av     = emoji || Y_EMOJI_POOL[Math.floor(Math.random()*Y_EMOJI_POOL.length)];

    const post = document.createElement('div');
    post.className = 'border-b border-[#2F3336] p-4 flex gap-3 hover:bg-white/[0.03] transition-colors cursor-pointer';
    post.innerHTML =
        `<div class="w-10 h-10 rounded-full bg-[#1A1A2E] flex items-center justify-center text-lg flex-shrink-0">${av}</div>` +
        `<div class="flex-1 min-w-0">` +
          `<div class="flex items-center gap-1 flex-wrap text-sm">` +
            `<span class="font-bold text-white">${displayName}</span>` +
            (verified ? `<span class="text-[#1D9BF0] text-xs font-bold">✓</span>` : '') +
            `<span class="text-[#71767B]">@${handle} · ${mins}</span>` +
          `</div>` +
          `<p class="y-post-text text-[#E7E9EA] text-sm mt-1 leading-relaxed">${text}</p>` +
          `<div class="flex gap-6 mt-2.5 text-[#71767B] text-xs select-none">` +
            `<span class="hover:text-[#1D9BF0] transition-colors cursor-pointer flex items-center gap-1">💬 ${repls}</span>` +
            `<span class="hover:text-green-400 transition-colors cursor-pointer flex items-center gap-1">🔁 ${rts}</span>` +
            `<span class="hover:text-pink-500 transition-colors cursor-pointer flex items-center gap-1">🤍 ${likes.toLocaleString()}</span>` +
            `<span class="hover:text-[#1D9BF0] transition-colors cursor-pointer flex items-center gap-1">📊 ${views}</span>` +
          `</div>` +
        `</div>`;

    feed.prepend(post);
    while (feed.children.length > 35) feed.removeChild(feed.lastChild);
}

function nftAmbientYPost() {
    if (!nftCollection) return;
    const col  = nftCollection;
    const pool = col.hype < 35 ? Y_POSTS_PANIC : Y_POSTS_HYPE;

    /* pick from pool avoiding recent repeats */
    let attempts = 0, fn, text;
    do {
        fn   = pool[Math.floor(Math.random() * pool.length)];
        text = fn(col.name);
        attempts++;
    } while (nftYRecentSet.has(text) && attempts < 10);
    nftYRecentSet.add(text);
    if (nftYRecentSet.size > Math.floor(pool.length * 0.6)) {
        nftYRecentSet.delete(nftYRecentSet.values().next().value);
    }

    const prefixes = ['DegenMinter','EarlyHolder','PFPCollector','NFTMaxi','Web3Native','ArtDegen','MintedFirst','JPEGKing','SerAlpha','DiamondHandsDave'];
    const name     = prefixes[Math.floor(Math.random()*prefixes.length)] + Math.floor(Math.random()*99);
    const handle   = name.toLowerCase().replace(/[^a-z0-9]/g,'') + '_' + Math.floor(Math.random()*9000+100);
    pushYPost(name, handle, Math.random() < 0.15, null, text);
}

/* ============================================================
   UI UPDATE + RESET
   ============================================================ */

function nftUpdateUI() {
    const col = nftCollection;
    if (!col) return;

    const pct    = Math.min(100, Math.round((col.minted / col.supply) * 100));
    const getEl  = id => document.getElementById(id);

    if (getEl('nftMintedCount')) getEl('nftMintedCount').innerText  = `${Math.floor(col.minted)} / ${col.supply}`;
    if (getEl('nftMintPct'))     getEl('nftMintPct').innerText      = `${pct}%`;
    if (getEl('nftMintBar'))     getEl('nftMintBar').style.width    = `${pct}%`;
    if (getEl('nftRevenue'))     getEl('nftRevenue').innerText      = `$${col.revenue.toLocaleString('en-US',{maximumFractionDigits:2})}`;
    if (getEl('nftHypePct'))     getEl('nftHypePct').innerText      = `${Math.round(col.hype)}%`;
    if (getEl('nftHypeBar'))     getEl('nftHypeBar').style.width    = `${Math.round(col.hype)}%`;
    if (getEl('nftFloorPrice'))  getEl('nftFloorPrice').innerText   = `${col.mintPrice.toFixed(3)} USDSHT`;
    if (getEl('nftHolders'))     getEl('nftHolders').innerText      = Math.floor(col.minted * 0.7).toLocaleString();
}

function nftResetUI() {
    clearInterval(nftGameInterval);
    clearInterval(nftYFeedTimer);
    nftGameInterval = null;
    nftYFeedTimer   = null;
    const s = id => document.getElementById(id);
    if (s('nftSetupPanel'))  s('nftSetupPanel').classList.remove('opacity-40','pointer-events-none');
    if (s('nftLaunchBtn'))   s('nftLaunchBtn').classList.remove('hidden');
    if (s('nftExitBtns'))    s('nftExitBtns').classList.add('hidden');
    if (s('nftMonitor'))     s('nftMonitor').classList.add('hidden');
}

/* ============================================================
   PATCH switchTab TO INCLUDE 'openshit'
   (avoids any need to edit ui.js or index.html)
   ============================================================ */

function patchSwitchTab() {
    if (typeof switchTab !== 'function') { setTimeout(patchSwitchTab, 200); return; }
    const orig = switchTab;
    window.switchTab = function(tabId) {
        /* hide openshit content before calling original so it gets
           hidden when switching away even if not in original tabs list */
        const os = document.getElementById('content-openshit');
        const bt = document.getElementById('tab-openshit');
        if (os) os.classList.add('hidden');
        if (bt) {
            bt.classList.remove('border-blue-500','text-white');
            bt.classList.add('border-transparent','text-gray-400');
        }
        orig(tabId);
        /* if target is openshit, show our section */
        if (tabId === 'openshit') {
            if (os) os.classList.remove('hidden');
            if (bt) {
                bt.classList.remove('border-transparent','text-gray-400');
                bt.classList.add('border-blue-500','text-white');
            }
        }
    };
}

/* ============================================================
   INJECT HTML INTO PAGE
   ============================================================ */

function injectOpenShitHTML() {
    /* --- 1. Tab button between mempool and info --- */
    const infoTab = document.getElementById('tab-info');
    if (infoTab && !document.getElementById('tab-openshit')) {
        infoTab.insertAdjacentHTML('beforebegin',
            `<button onclick="switchTab('openshit')" id="tab-openshit"
              class="py-3 text-sm font-medium border-b-2 border-transparent text-gray-400 hover:text-white whitespace-nowrap flex items-center gap-1.5 transition-all">
              OpenShit 🎨
            </button>`);
    }

    /* --- 2. Content section after content-mempool --- */
    const mempoolSection = document.getElementById('content-mempool');
    if (mempoolSection && !document.getElementById('content-openshit')) {
        mempoolSection.insertAdjacentHTML('afterend', `
<section id="content-openshit" class="hidden space-y-6">

  <!-- HEADER -->
  <div class="bg-[#0C0F16] border border-[#1A2232] rounded-xl p-5 shadow-lg flex items-center justify-between flex-wrap gap-3">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-black border-2 border-[#2F3336] flex items-center justify-center">
        <span class="text-white font-black text-xl leading-none">Y</span>
      </div>
      <div>
        <h2 class="text-white font-black text-xl tracking-tight">OpenShit <span class="text-base font-normal text-gray-400">by ShitCore</span></h2>
        <p class="text-[#71767B] text-xs">Satirical NFT launchpad. Generate AI art. Mint a collection. Exit scam on your community.</p>
      </div>
    </div>
    <span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs px-3 py-1 rounded-full">500 NFT Supply · ~15 min grind</span>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

    <!-- ===== LEFT COLUMN ===== -->
    <div class="space-y-5">

      <!-- AI Image Generator -->
      <div class="bg-[#0C0F16] border border-[#1A2232] rounded-xl p-5 shadow-lg space-y-4">
        <h3 class="text-white font-bold text-sm flex items-center gap-2">🎨 AI NFT Art Generator <span class="text-[10px] text-gray-500 font-normal">via Pollinations.ai · Free · No API key</span></h3>

        <!-- Image preview -->
        <div class="relative w-full aspect-square bg-[#070A0F] rounded-xl border border-[#1A2232] overflow-hidden flex items-center justify-center">
          <div id="nftImgPlaceholder" class="text-center text-gray-600 space-y-2 p-6">
            <div class="text-6xl">🖼️</div>
            <p class="text-xs font-mono">Your masterpiece awaits.<br/>Type a prompt below and generate.</p>
          </div>
          <img id="nftPreviewImg" class="hidden absolute inset-0 w-full h-full object-cover" alt="Generated NFT Art" />
          <!-- Loading overlay -->
          <div id="nftImgOverlay" class="hidden absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
            <div class="text-white text-sm font-mono animate-pulse">Generating on-chain art…</div>
            <div class="w-48 bg-[#1A2232] h-1.5 rounded-full overflow-hidden">
              <div id="nftGenProgress" class="bg-purple-500 h-full w-0 transition-all duration-300"></div>
            </div>
            <div class="text-xs text-gray-400 font-mono">Powered by Pollinations.ai (free)</div>
          </div>
        </div>

        <textarea id="nftPrompt" rows="2" placeholder='e.g. "bored toilet ape wearing a golden crown, glitchy pixel art" — be creative, weirder = better'
          class="w-full bg-[#070A0F] text-white text-xs font-mono px-3 py-2 rounded-lg border border-[#1A2232] focus:outline-none focus:border-purple-500 resize-none placeholder-gray-600"></textarea>

        <button id="generateNftBtn" onclick="generateNFTImage()"
          class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-lg text-sm transition shadow-lg">
          🎨 Generate NFT Art
        </button>
      </div>

      <!-- Collection Config -->
      <div id="nftSetupPanel" class="bg-[#0C0F16] border border-[#1A2232] rounded-xl p-5 shadow-lg space-y-4">
        <h3 class="text-white font-bold text-sm">📋 Collection Setup</h3>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-gray-400 text-[10px] uppercase font-semibold mb-1.5">Collection Name</label>
            <input id="nftCollectionName" type="text" value="Bored Toilet Apes"
              class="w-full bg-[#070A0F] text-white text-xs px-3 py-2 rounded border border-[#1A2232] focus:outline-none focus:border-amber-500">
          </div>
          <div>
            <label class="block text-gray-400 text-[10px] uppercase font-semibold mb-1.5">Ticker (max 5)</label>
            <input id="nftTicker" type="text" value="BTA" maxlength="5"
              class="w-full bg-[#070A0F] text-white text-xs px-3 py-2 rounded border border-[#1A2232] focus:outline-none focus:border-amber-500 uppercase">
          </div>
        </div>

        <div>
          <label class="block text-gray-400 text-[10px] uppercase font-semibold mb-1.5">Mint Price (USDSHT per NFT)</label>
          <input id="nftMintPrice" type="number" value="2.5" min="0.01" step="0.1"
            oninput="document.getElementById('nftMaxRev').innerText = ((parseFloat(this.value)||0)*500).toFixed(2)"
            class="w-full bg-[#070A0F] text-white text-xs px-3 py-2 rounded border border-[#1A2232] focus:outline-none focus:border-amber-500">
          <p class="text-[9px] text-gray-500 mt-1">Max revenue at full mint (500 NFTs): $<span id="nftMaxRev">1250.00</span> USDSHT</p>
        </div>

        <!-- Manual shill -->
        <button onclick="nftShill()"
          class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-xs transition">
          📣 Pay Y Social Influencer ($100 → +Hype)
        </button>

        <!-- Launch -->
        <button id="nftLaunchBtn" onclick="launchNFTCollection()" disabled
          class="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold rounded-lg text-sm tracking-wide shadow-lg transition disabled:opacity-40 disabled:cursor-not-allowed">
          🚀 Launch Collection — $100 Deploy Fee
        </button>

        <!-- Exit buttons (hidden until launched) -->
        <div id="nftExitBtns" class="hidden grid grid-cols-2 gap-3">
          <button onclick="mintAndRug()"
            class="py-3 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-extrabold rounded-lg text-xs shadow-lg transition uppercase tracking-wide">
            💀 Mint &amp; Rug
          </button>
          <button onclick="floorPumpAndDump()"
            class="py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-black font-extrabold rounded-lg text-xs shadow-lg transition uppercase tracking-wide">
            📈 Floor Pump &amp; Dump
          </button>
        </div>

        <p class="text-[9px] text-gray-600 leading-relaxed">
          ⚠️ Risk: 0.03%/sec IP Lawsuit (instant seizure) · 0.07%/sec DMCA Strike (hype -28%) · Influencer 10% chance to scam you
        </p>
      </div>
    </div>

    <!-- ===== RIGHT COLUMN ===== -->
    <div class="space-y-5">

      <!-- Live Monitor (hidden until launched) -->
      <div id="nftMonitor" class="hidden bg-[#0C0F16] border border-[#1A2232] rounded-xl p-5 shadow-lg space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h3 id="nftMonitorName" class="text-white font-extrabold text-base tracking-tight">COLLECTION (TICK)</h3>
          <span class="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full font-bold animate-pulse">MINTING LIVE</span>
        </div>

        <div class="grid grid-cols-2 gap-3 text-center">
          <div class="bg-[#070A0F] rounded-lg p-3 border border-[#131924]">
            <span class="text-[10px] text-gray-400 block">Minted</span>
            <span id="nftMintedCount" class="text-white font-bold text-sm font-mono">0 / 500</span>
          </div>
          <div class="bg-[#070A0F] rounded-lg p-3 border border-[#131924]">
            <span class="text-[10px] text-gray-400 block">Revenue</span>
            <span id="nftRevenue" class="text-green-400 font-bold text-sm font-mono">$0.00</span>
          </div>
          <div class="bg-[#070A0F] rounded-lg p-3 border border-[#131924]">
            <span class="text-[10px] text-gray-400 block">Floor Price</span>
            <span id="nftFloorPrice" class="text-amber-400 font-bold text-sm font-mono">0.000 USDSHT</span>
          </div>
          <div class="bg-[#070A0F] rounded-lg p-3 border border-[#131924]">
            <span class="text-[10px] text-gray-400 block">Holders</span>
            <span id="nftHolders" class="text-blue-400 font-bold text-sm font-mono">0</span>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex justify-between text-[11px]">
            <span class="text-gray-400 uppercase font-semibold">Mint Progress</span>
            <span id="nftMintPct" class="text-blue-400 font-mono">0%</span>
          </div>
          <div class="w-full bg-[#070A0F] h-2.5 rounded-full border border-[#1A2232] overflow-hidden">
            <div id="nftMintBar" class="bg-gradient-to-r from-blue-500 to-purple-500 h-full w-0 transition-all duration-500"></div>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex justify-between text-[11px]">
            <span class="text-gray-400 uppercase font-semibold">Community Hype</span>
            <span id="nftHypePct" class="text-amber-400 font-mono">0%</span>
          </div>
          <div class="w-full bg-[#070A0F] h-2.5 rounded-full border border-[#1A2232] overflow-hidden">
            <div id="nftHypeBar" class="bg-gradient-to-r from-amber-400 to-orange-500 h-full w-0 transition-all duration-300"></div>
          </div>
        </div>
      </div>

      <!-- Y Feed — always visible -->
      <div class="bg-black border border-[#2F3336] rounded-2xl overflow-hidden shadow-2xl">

        <!-- Y Header -->
        <div class="bg-black/95 border-b border-[#2F3336] px-4 py-3 flex items-center gap-3 sticky top-0 backdrop-blur-sm z-10">
          <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0">
            <span class="text-black font-black text-base leading-none">Y</span>
          </div>
          <div>
            <div class="text-white font-bold text-sm leading-tight">NFT Community · Y Social</div>
            <div class="text-[#71767B] text-[10px]">Live feed · ShitCore NFT culture</div>
          </div>
          <div class="ml-auto flex items-center gap-1.5">
            <span class="w-2 h-2 bg-green-400 rounded-full animate-ping"></span>
            <span class="text-[10px] text-green-400 font-mono">LIVE</span>
          </div>
        </div>

        <!-- Posts -->
        <div id="yFeed" class="max-h-[480px] overflow-y-auto bg-black">
          <div class="p-8 text-center text-[#71767B]">
            <div class="text-4xl mb-3">🖼️</div>
            <div class="text-sm font-bold text-white mb-1">Nothing here yet</div>
            <div class="text-xs">Launch a collection to activate the Y community feed</div>
          </div>
        </div>

      </div><!-- end Y feed -->
    </div><!-- end right col -->
  </div><!-- end grid -->
</section>`);
    }
}

/* ============================================================
   INIT
   ============================================================ */

function initOpenShit() {
    injectOpenShitHTML();
    patchSwitchTab();
}

document.addEventListener('DOMContentLoaded', initOpenShit);
window.addEventListener('load', initOpenShit);
