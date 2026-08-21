/* ============================================================
   MEV SANDWICH - growing/eating arcade minigame, slither.io-style
   ============================================================
   v2 rewrite per Tim's request to feel more authentically like
   slither.io (reference: github.com/knagaitsev/slither.io-clone),
   still single-player (real multiplayer is a separate, bigger
   project queued up for later):

   - Large circular WORLD, not a small fixed box - camera follows
     the player's head and zooms out as you grow, same "explore a big
     space" feel as the real thing instead of a cramped static arena.
   - FIVE CPU rival sandwiches to compete against - they eat, grow,
     boost, dodge each other, take each other out, and respawn. Running
     into any of their bodies ends your round, same as your own tail.
   - Speed boost (hold Space OR left mouse) - faster, but continuously
     costs BOTH length and cash while held. Classic risk/reward, with
     the money drain making a long sprint an actual decision.
   - Live leaderboard ranking every snake by size, so the competition
     is visible moment to moment.
   - Food scatters at the death location when any snake dies, so
     hunting a big rival is worth the risk.

   Still exposes window.MevSandwichGame.start(canvas)/.stop() the
   same way as before. No Level 3 gating or launch button wiring
   yet on purpose - Tim wants the game itself nailed down first.
   ============================================================ */

window.MevSandwichGame = (function () {
    const SW = 960, SH = 540;
    const WORLD_R = 1600;            // world is a circle, radius from center - cross it and you die, same as real slither.io's boundary. Shrunk from 2400 - combined with the higher food count below, the map reads as dense/busy instead of empty, closer to real slither.io.
    const HEAD_SPEED = 220;          // px/sec, normal
    const BOOST_SPEED = 380;         // px/sec, while boosting
    const BOOST_DRAIN_INTERVAL = 0.35; // seconds per segment lost while boosting
    const TURN_RATE = 4.2;
    const SEGMENT_SPACING = 14;
    const SEGMENT_SIZE_BASE = 22;
    const SEGMENT_SIZE_MAX = 40;
    const START_SEGMENTS = 5;
    const MIN_SEGMENTS = 4;          // boosting can't shrink you below this
    const ROUND_SECONDS = 90;        // longer now that there's an actual world to explore and bots to compete with
    const FOOD_COUNT_TARGET = 380;   // even more bubbles on screen at once - was 260, and 70 before that
    const FOOD_RESPAWN_DELAY = 0.4;

    // Boosting now costs CASH as well as length - holding it burns your
    // take slowly, so a long boost is a real financial decision and not
    // just free speed. Length cost (BOOST_DRAIN_INTERVAL above) is what
    // still physically limits it; money is the thing you feel.
    const BOOST_MONEY_PER_SEC = 4;

    // Rival sandwiches. Multiple bots now instead of a single rival -
    // they eat, grow, boost, and dodge each other, so the map stays
    // genuinely contested for the whole round.
    const BOT_COUNT = 5;
    const BOT_RESPAWN_SECONDS = 3;
    const BOT_NAMES = ['jaredfromsubway', 'flashb0t', 'mempool_mike', 'sandwichlord', 'rugpull_rick', 'blockbuilder', 'toxic_flow'];

    // Ghosts = recorded runs by real players (js/mevghosts.js). Kept
    // visually distinct from the CPU bots - washed-out spectral blue - so
    // it's obvious which rivals were once actual people.
    const GHOST_PALETTE = { hi: '#cfe6f5', mid: '#8fb8d0', lo: '#4a6a80' };
    const GHOST_SAMPLE_HZ_LOCAL = (typeof MEV_GHOST_SAMPLE_HZ !== 'undefined') ? MEV_GHOST_SAMPLE_HZ : 8;
    const MEV_GHOST_PER_ROUND_LOCAL = (typeof MEV_GHOST_PER_ROUND !== 'undefined') ? MEV_GHOST_PER_ROUND : 4;
    const PLAYER_PALETTE = { hi: '#f6dfa0', mid: '#e6bd72', lo: '#a5763f' };
    const BOT_PALETTES = [
        { hi: '#e3b3c6', mid: '#c67a97', lo: '#7a3f56' }, // pink - the original rival's colors
        { hi: '#b3c9e3', mid: '#7a9cc6', lo: '#3f5a7a' }, // blue
        { hi: '#c6e3b3', mid: '#97c67a', lo: '#567a3f' }, // green
        { hi: '#e0cbb0', mid: '#c2a077', lo: '#755735' }, // tan
        { hi: '#d9b3e3', mid: '#b47ac6', lo: '#6b3f7a' }, // purple
    ];

    // Camera zoom - real slither.io starts zoomed in close and slowly
    // pulls back as your snake grows, so a small snake always feels
    // "close" and a huge one still fits on screen. Tied to the same
    // 40-segment growth curve segmentSizeFor() already uses, so the two
    // stay in sync (you zoom out at the same rate your segments get
    // visually bigger, not fighting each other).
    const ZOOM_CLOSE = 1.65;   // at START_SEGMENTS
    const ZOOM_FAR = 1.0;      // once fully grown
    function currentZoom() {
        const growth = Math.min(1, (g.player.segmentCount - START_SEGMENTS) / 40);
        return ZOOM_CLOSE + (ZOOM_FAR - ZOOM_CLOSE) * growth;
    }

    const TX_TYPES = [
        { label: '$', value: 1, r: 8, color: '#7fd68a', chance: 0.55 },
        { label: '$$', value: 3, r: 11, color: '#e0c34c', chance: 0.30 },
        { label: 'WHALE', value: 8, r: 15, color: '#e05c5c', chance: 0.15 },
    ];

    let canvas, ctx;
    let rafId = null;
    let mouseX = SW / 2, mouseY = SH / 2;
    let boosting = false;
    let onMouseMove, onKeyDown, onKeyUp, onMouseDown, onMouseUp, onMouseLeave;

    function rand(min, max) { return min + Math.random() * (max - min); }

    function pickTxType() {
        const r = Math.random();
        let acc = 0;
        for (const t of TX_TYPES) { acc += t.chance; if (r <= acc) return t; }
        return TX_TYPES[0];
    }

    function randomPointInWorld(marginFromEdge) {
        // Uniform-ish distribution within the circle, not just within its
        // bounding square (which would clump points near the corners of
        // that square, outside the actual circle, if done naively).
        const r = (WORLD_R - marginFromEdge) * Math.sqrt(Math.random());
        const a = Math.random() * Math.PI * 2;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    }

    function spawnFood(existing) {
        let x, y, tries = 0;
        do {
            const p = randomPointInWorld(60);
            x = p.x; y = p.y;
            tries++;
        } while (tries < 8 && existing.some(f => Math.hypot(f.x - x, f.y - y) < 30));
        const type = pickTxType();
        return { x, y, r: type.r, value: type.value, label: type.label, color: type.color, bob: Math.random() * Math.PI * 2 };
    }

    function scatterFoodAt(x, y, segmentCount, foodArray) {
        // A snake dying scatters food along roughly where its body was,
        // not just a single point - reads much more like "this thing
        // exploded into food" than one dot appearing.
        const count = Math.min(18, Math.max(4, Math.round(segmentCount * 0.4)));
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = rand(0, 70);
            const type = pickTxType();
            foodArray.push({
                x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
                r: type.r, value: type.value, label: type.label, color: type.color,
                bob: Math.random() * Math.PI * 2,
            });
        }
    }

    // Hard cap on segment count. This loop runs `segments * 3` times, so an
    // out-of-range value here is not a cosmetic bug - it locks up the tab.
    // Ghost snakes are built from mev_ghosts rows, and ANY anonymous person
    // can insert one of those via the public REST endpoint, so a hostile
    // row claiming 2147483647 segments would otherwise make every other
    // player's browser try to allocate ~6.4 billion objects and die.
    // Clamped at this single choke point that every snake passes through,
    // rather than trusting each caller to sanitise first.
    const MAX_SEGMENTS_HARD = 600;

    function newSnake(x, y, angle, segments, opts = {}) {
        segments = Math.min(MAX_SEGMENTS_HARD, Math.max(1, Number(segments) | 0)) || 1;
        if (!Number.isFinite(x)) x = 0;
        if (!Number.isFinite(y)) y = 0;
        if (!Number.isFinite(angle)) angle = 0;
        const trail = [];
        for (let i = 0; i < segments * 3; i++) {
            trail.push({ x: x - Math.cos(angle) * i * (SEGMENT_SPACING / 3), y: y - Math.sin(angle) * i * (SEGMENT_SPACING / 3) });
        }
        return {
            head: { x, y, angle }, trail, segmentCount: segments,
            alive: true, boostDrainT: 0,
            // Per-snake identity/AI state. Bots each carry their own
            // target + wander so they behave independently instead of
            // all chasing one shared global target the way the single-bot
            // version did.
            name: opts.name ?? 'YOU',
            palette: opts.palette ?? PLAYER_PALETTE,
            isBot: opts.isBot ?? false,
            targetFood: null,
            wanderAngle: 0,
            boostT: 0,          // seconds of boost this bot has left
            boostCooldown: rand(1, 6),
            respawnT: 0,
        };
    }

    // Bots spawn scaled to how far into the round it is, so a bot that
    // respawns at 0:20 remaining isn't a free meal next to snakes that
    // have been growing the whole time.
    function botStartSegments() {
        // roundProgress is CLAMPED to 0..1 on purpose. Without the clamp,
        // a timer outside the normal 0..ROUND_SECONDS range makes this
        // return a NEGATIVE segment count, which propagates into
        // segmentSizeFor() -> a negative ellipse radius -> a hard canvas
        // exception that kills the whole render loop. Clamping here (and
        // flooring the result at MIN_SEGMENTS) makes that unreachable
        // regardless of what the timer is doing.
        const raw = g ? 1 - (g.timer / ROUND_SECONDS) : 0;
        const roundProgress = Math.max(0, Math.min(1, raw));
        return Math.max(MIN_SEGMENTS, Math.round(START_SEGMENTS + rand(0, 6) + roundProgress * 14));
    }

    function spawnBot(index) {
        const p = randomPointInWorld(500);
        return newSnake(p.x, p.y, Math.random() * Math.PI * 2, botStartSegments(), {
            name: BOT_NAMES[index % BOT_NAMES.length],
            palette: BOT_PALETTES[index % BOT_PALETTES.length],
            isBot: true,
        });
    }

    function segmentSizeFor(total) {
        // growth is floored at 0 as well as capped at 1 - a size below
        // SEGMENT_SIZE_BASE would mean a negative radius downstream in
        // drawSandwichSegment(), which canvas rejects by throwing and
        // takes the entire animation loop down with it. Belt-and-braces
        // alongside the clamp in botStartSegments().
        const growth = Math.max(0, Math.min(1, (total - START_SEGMENTS) / 40));
        return SEGMENT_SIZE_BASE + (SEGMENT_SIZE_MAX - SEGMENT_SIZE_BASE) * growth;
    }

    let g;
    let _roundCounter = 0;

    // Turns a recorded run (see js/mevghosts.js) into something the rest
    // of the game can treat as just another snake. It has the same shape
    // as a bot - head, trail, segmentCount, palette - so collision,
    // drawing and the leaderboard all work on it unchanged. The only
    // difference is that its head follows a recording instead of an AI.
    function newGhostSnake(run) {
        const first = run.samples[0];
        const s = newSnake(first.x, first.y, first.a, Math.max(1, first.s), {
            name: run.name,
            palette: GHOST_PALETTE,
            isBot: true,
        });
        s.isGhost = true;
        s.samples = run.samples;
        s.playT = 0;
        return s;
    }

    function loadGhostsIntoRound() {
        if (typeof pickMevGhostRuns !== 'function') return;
        // The pool is normally already cached (fetched at page load), in
        // which case this runs synchronously. If it isn't - first visit,
        // slow network - the ghosts drop in when the fetch resolves. The
        // roundId guard stops a late response from injecting ghosts into
        // a round the player has already restarted out of.
        const myRound = g.roundId;
        const inject = () => {
            if (!g || g.roundId !== myRound || g.phase !== 'playing') return;
            try {
                for (const run of pickMevGhostRuns(MEV_GHOST_PER_ROUND_LOCAL)) {
                    g.ghosts.push(newGhostSnake(run));
                }
            } catch (e) {
                console.warn('[mevsandwich] ghost load failed, continuing with bots only:', e);
            }
        };
        if (typeof fetchMevGhostPool === 'function') {
            fetchMevGhostPool().then(inject).catch(() => {});
        } else {
            inject();
        }
    }

    // Advances a ghost along its recording, interpolating between the
    // 8Hz samples so it moves as smoothly as a live snake. When the
    // recording runs out, that player's run is simply over.
    function updateGhost(ghost, dt) {
        if (!ghost.alive) return;
        ghost.playT += dt;
        const idx = ghost.playT * GHOST_SAMPLE_HZ_LOCAL;
        const i0 = Math.floor(idx);
        if (i0 >= ghost.samples.length - 1) { ghost.alive = false; ghost.respawnT = BOT_RESPAWN_SECONDS; return; }
        const f = idx - i0;
        const a = ghost.samples[i0], b = ghost.samples[i0 + 1];
        const nx = a.x + (b.x - a.x) * f;
        const ny = a.y + (b.y - a.y) * f;
        const dx = nx - ghost.head.x, dy = ny - ghost.head.y;
        if (dx || dy) ghost.head.angle = Math.atan2(dy, dx);
        ghost.head.x = nx;
        ghost.head.y = ny;
        ghost.segmentCount = Math.max(1, Math.round(a.s + (b.s - a.s) * f));

        const last = ghost.trail[0];
        if (!last || Math.hypot(nx - last.x, ny - last.y) >= SEGMENT_SPACING) {
            ghost.trail.unshift({ x: nx, y: ny });
        }
        const maxTrailLen = Math.ceil(ghost.segmentCount * (SEGMENT_SIZE_MAX / SEGMENT_SPACING)) + 20;
        if (ghost.trail.length > maxTrailLen) ghost.trail.length = maxTrailLen;
    }

    function newGame() {
        g = {
            phase: 'playing',
            player: newSnake(0, 400, -Math.PI / 2, START_SEGMENTS),
            bots: [],
            ghosts: [],
            roundId: ++_roundCounter,
            // Recording of THIS run, saved when the round ends.
            rec: [],
            recT: 0,
            saved: false,
            food: (() => { const f = []; for (let i = 0; i < FOOD_COUNT_TARGET; i++) f.push(spawnFood(f)); return f; })(),
            pendingSpawns: [],
            score: 0,
            scoreDrainAccum: 0, // fractional cash burned by boosting, so the drain is smooth instead of jumping a whole dollar at a time
            timer: ROUND_SECONDS,
            deathReason: null,
            shakeT: 0,
            camera: { x: 0, y: 400 },
        };
        // Assigned after g exists - botStartSegments() reads g.timer.
        for (let i = 0; i < BOT_COUNT; i++) g.bots.push(spawnBot(i));
        loadGhostsIntoRound();
        return g;
    }

    function bodyPointsFor(snake) {
        const total = snake.segmentCount;
        const size = segmentSizeFor(total);
        const spacingPx = Math.max(6, size * 0.55);
        const points = [];
        let dist = 0, idx = 0;
        for (let n = 0; n < total && idx < snake.trail.length - 1; n++) {
            while (idx < snake.trail.length - 1 && dist < n * spacingPx) {
                dist += Math.hypot(snake.trail[idx].x - snake.trail[idx + 1].x, snake.trail[idx].y - snake.trail[idx + 1].y);
                idx++;
            }
            points.push(snake.trail[Math.min(idx, snake.trail.length - 1)]);
        }
        return points;
    }

    function updateSnakeMovement(snake, dt, targetAngle, speed) {
        let diff = targetAngle - snake.head.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = TURN_RATE * dt;
        snake.head.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
        snake.head.x += Math.cos(snake.head.angle) * speed * dt;
        snake.head.y += Math.sin(snake.head.angle) * speed * dt;

        const last = snake.trail[0];
        if (!last || Math.hypot(snake.head.x - last.x, snake.head.y - last.y) >= SEGMENT_SPACING) {
            snake.trail.unshift({ x: snake.head.x, y: snake.head.y });
        }
        const maxTrailLen = Math.ceil(snake.segmentCount * (SEGMENT_SIZE_MAX / SEGMENT_SPACING)) + 20;
        if (snake.trail.length > maxTrailLen) snake.trail.length = maxTrailLen;
    }

    // Is the point a bot is about to move into occupied by somebody
    // else's body? Bots that ignore this just drive into each other and
    // the map empties out within seconds, which kills the competition
    // this whole system exists to create.
    function dangerAhead(bot, allSnakes, lookaheadPx) {
        const ax = bot.head.x + Math.cos(bot.head.angle) * lookaheadPx;
        const ay = bot.head.y + Math.sin(bot.head.angle) * lookaheadPx;
        const clearance = segmentSizeFor(bot.segmentCount) * 0.9;
        for (const other of allSnakes) {
            if (other === bot || !other.alive) continue;
            for (const p of bodyPointsFor(other)) {
                if (Math.hypot(ax - p.x, ay - p.y) < clearance + segmentSizeFor(other.segmentCount) * 0.5) {
                    return { x: p.x, y: p.y };
                }
            }
        }
        return null;
    }

    function updateBotAI(bot, dt, allSnakes) {
        if (!bot.alive) return;

        // Priority order: don't leave the world, don't crash into
        // anything, otherwise go eat. Each bot keeps its own target and
        // wander state so five of them don't move as one blob.
        const distFromCenter = Math.hypot(bot.head.x, bot.head.y);
        let targetAngle;
        let wantsBoost = false;

        const threat = dangerAhead(bot, allSnakes, 70 + bot.segmentCount);
        if (distFromCenter > WORLD_R * 0.85) {
            targetAngle = Math.atan2(-bot.head.y, -bot.head.x); // steer back toward center
        } else if (threat) {
            // Veer perpendicular to the threat rather than directly away -
            // turning a full 180 into your own body is how the old single
            // bot used to kill itself trying to dodge.
            const away = Math.atan2(bot.head.y - threat.y, bot.head.x - threat.x);
            targetAngle = away + (Math.PI / 2) * (bot.wanderAngle >= 0 ? 1 : -1);
        } else {
            if (!bot.targetFood || !g.food.includes(bot.targetFood) || Math.random() < 0.01) {
                // Slight preference for high-value food, not strictly
                // nearest - makes different bots pick different targets
                // and chase WHALEs like a real player would.
                let best = null, bestScore = -Infinity;
                for (const f of g.food) {
                    const d = Math.hypot(f.x - bot.head.x, f.y - bot.head.y);
                    if (d > 900) continue;
                    const s = f.value * 60 - d;
                    if (s > bestScore) { bestScore = s; best = f; }
                }
                bot.targetFood = best;
            }
            if (bot.targetFood) {
                targetAngle = Math.atan2(bot.targetFood.y - bot.head.y, bot.targetFood.x - bot.head.x);
                const d = Math.hypot(bot.targetFood.x - bot.head.x, bot.targetFood.y - bot.head.y);
                wantsBoost = d > 320 && bot.targetFood.value >= 3; // sprint for the valuable stuff that's far away
            } else {
                bot.wanderAngle += rand(-0.5, 0.5) * dt;
                targetAngle = bot.head.angle + bot.wanderAngle * dt;
            }
        }

        // Bot boosting - same length cost the player pays, on a cooldown
        // so they're not permanently sprinting.
        bot.boostCooldown -= dt;
        if (bot.boostT > 0) {
            bot.boostT -= dt;
        } else if (wantsBoost && bot.boostCooldown <= 0 && bot.segmentCount > MIN_SEGMENTS + 3) {
            bot.boostT = rand(0.5, 1.4);
            bot.boostCooldown = rand(3, 8);
        }

        let botSpeed = HEAD_SPEED * 0.92; // very slightly slower than the player's base speed so it's beatable, not just competitive
        if (bot.boostT > 0 && bot.segmentCount > MIN_SEGMENTS) {
            botSpeed = BOOST_SPEED * 0.92;
            bot.boostDrainT -= dt;
            if (bot.boostDrainT <= 0) {
                bot.boostDrainT = BOOST_DRAIN_INTERVAL;
                bot.segmentCount = Math.max(MIN_SEGMENTS, bot.segmentCount - 1);
                scatterFoodAt(bot.trail[bot.trail.length - 1]?.x ?? bot.head.x,
                    bot.trail[bot.trail.length - 1]?.y ?? bot.head.y, 1, g.food);
            }
        }
        updateSnakeMovement(bot, dt, targetAngle, botSpeed);
    }

    function checkSelfAndSnakeCollision(snake, others, skipSegments) {
        // IMPORTANT: this must check against the same points that get
        // DRAWN (bodyPointsFor), not the raw trail array. The raw trail
        // is a dense breadcrumb (a new point every SEGMENT_SPACING=14px
        // of travel) that curls back near the head after a completely
        // normal turn - at max turn rate the head's turning circle is
        // only ~50px across, so a handful of ordinary-looking turns used
        // to trip "self collision" against trail crumbs that weren't
        // anywhere near a visible body segment. Checking the actual
        // rendered body points (spaced by segment size, one per segment)
        // and skipping the first few segments closest to the neck fixes
        // the false-positive "sandwiched yourself" reports.
        const headSize = segmentSizeFor(snake.segmentCount);
        const threshold = headSize * 0.5;
        const bodyPoints = bodyPointsFor(snake);
        for (let i = skipSegments; i < bodyPoints.length; i++) {
            if (Math.hypot(snake.head.x - bodyPoints[i].x, snake.head.y - bodyPoints[i].y) < threshold) return true;
        }
        // others may be a single snake, an array of them, or null - the
        // array form is what supports the multiple rival sandwiches.
        if (others) {
            const list = Array.isArray(others) ? others : [others];
            for (const other of list) {
                if (!other || other === snake || !other.alive) continue;
                for (const p of bodyPointsFor(other)) {
                    if (Math.hypot(snake.head.x - p.x, snake.head.y - p.y) < threshold) return true;
                }
            }
        }
        return false;
    }

    function handleEating(snake) {
        const headSize = segmentSizeFor(snake.segmentCount);
        for (let i = g.food.length - 1; i >= 0; i--) {
            const f = g.food[i];
            if (Math.hypot(snake.head.x - f.x, snake.head.y - f.y) < headSize / 2 + f.r) {
                if (snake === g.player) { g.score += f.value; g.shakeT = 0.08; }
                snake.segmentCount += 1;
                g.food.splice(i, 1);
                g.pendingSpawns.push(FOOD_RESPAWN_DELAY);
            }
        }
    }

    function update(dt) {
        if (g.phase !== 'playing') return;
        g.timer -= dt;
        g.shakeT = Math.max(0, g.shakeT - dt);

        // Player steering + boost. `boosting` is set by EITHER the space
        // bar or holding left mouse - see the listeners in start().
        const targetAngle = Math.atan2(mouseY - (SH / 2), mouseX - (SW / 2)); // relative to screen center, since the camera keeps the player centered
        let speed = HEAD_SPEED;
        const canBoost = boosting && g.player.segmentCount > MIN_SEGMENTS;
        if (canBoost) {
            speed = BOOST_SPEED;
            // Cash cost - accumulated as a float and spent in whole
            // dollars so the number ticks down smoothly rather than
            // lurching. Floors at $0; going fast can bankrupt your take
            // but never puts you in debt.
            g.scoreDrainAccum += BOOST_MONEY_PER_SEC * dt;
            if (g.scoreDrainAccum >= 1) {
                const spend = Math.floor(g.scoreDrainAccum);
                g.scoreDrainAccum -= spend;
                g.score = Math.max(0, g.score - spend);
            }
            // Length cost (unchanged) - this is what physically limits boosting.
            g.player.boostDrainT -= dt;
            if (g.player.boostDrainT <= 0) {
                g.player.boostDrainT = BOOST_DRAIN_INTERVAL;
                g.player.segmentCount = Math.max(MIN_SEGMENTS, g.player.segmentCount - 1);
                scatterFoodAt(g.player.trail[g.player.trail.length - 1]?.x ?? g.player.head.x,
                    g.player.trail[g.player.trail.length - 1]?.y ?? g.player.head.y, 1, g.food);
            }
        } else {
            g.scoreDrainAccum = 0;
        }
        updateSnakeMovement(g.player, dt, targetAngle, speed);

        for (const ghost of g.ghosts) updateGhost(ghost, dt);

        // Ghosts are part of the world for every purpose: bots dodge them,
        // bots can crash into them, and they can kill you.
        const allSnakes = [g.player, ...g.bots, ...g.ghosts];
        for (const bot of g.bots) updateBotAI(bot, dt, allSnakes);

        // Record this run for future players to race against. Sampled at
        // a fixed rate rather than every frame so the stored path is the
        // same size regardless of framerate.
        g.recT += dt;
        const recInterval = 1 / GHOST_SAMPLE_HZ_LOCAL;
        while (g.recT >= recInterval) {
            g.recT -= recInterval;
            g.rec.push({ x: g.player.head.x, y: g.player.head.y, a: g.player.head.angle, s: g.player.segmentCount });
        }

        // Camera follows the player's head
        g.camera.x = g.player.head.x;
        g.camera.y = g.player.head.y;

        // Boundary check (circular world)
        if (Math.hypot(g.player.head.x, g.player.head.y) > WORLD_R) {
            g.phase = 'over'; g.deathReason = 'Drifted outside the mempool.'; endRound(); return;
        }
        for (const bot of g.bots) {
            if (bot.alive && Math.hypot(bot.head.x, bot.head.y) > WORLD_R + 50) {
                killBot(bot); // shouldn't really happen given the AI steers back, but a safety net
            }
        }

        // Player vs own tail and vs EVERY rival, live bot or recorded ghost
        const rivals = [...g.bots, ...g.ghosts];
        if (checkSelfAndSnakeCollision(g.player, rivals, 3)) {
            const hitOwnTail = checkSelfAndSnakeCollision(g.player, null, 3);
            const ghostHit = !hitOwnTail && checkSelfAndSnakeCollision(g.player, g.ghosts, 3);
            g.phase = 'over';
            g.deathReason = hitOwnTail
                ? 'Sandwiched yourself. Ironic.'
                : (ghostHit ? "Crashed into someone else's run." : 'Ran straight into a rival sandwich.');
            scatterFoodAt(g.player.head.x, g.player.head.y, g.player.segmentCount, g.food);
            endRound();
            return;
        }
        // Each rival vs its own tail, the player, and the other rivals -
        // so bots can genuinely take each other out and the field churns.
        for (const bot of g.bots) {
            if (!bot.alive) continue;
            if (checkSelfAndSnakeCollision(bot, allSnakes, 3)) killBot(bot);
        }
        // A ghost that drives into somebody dies too - its recording just
        // stops there. Keeps them from ploughing through the field
        // untouchable while every live snake has to respect collisions.
        for (const ghost of g.ghosts) {
            if (!ghost.alive) continue;
            if (checkSelfAndSnakeCollision(ghost, [g.player, ...g.bots], 3)) killBot(ghost);
        }

        handleEating(g.player);
        for (const bot of g.bots) if (bot.alive) handleEating(bot);

        for (let i = g.pendingSpawns.length - 1; i >= 0; i--) {
            g.pendingSpawns[i] -= dt;
            if (g.pendingSpawns[i] <= 0) { g.pendingSpawns.splice(i, 1); g.food.push(spawnFood(g.food)); }
        }
        for (const f of g.food) f.bob += dt * 3;

        // Dead rivals respawn after a beat rather than the round
        // permanently losing them - keeps the map contested for the full
        // 90 seconds instead of going quiet once you've outlasted them.
        for (let i = 0; i < g.bots.length; i++) {
            const bot = g.bots[i];
            if (bot.alive) continue;
            bot.respawnT -= dt;
            if (bot.respawnT <= 0) g.bots[i] = spawnBot(i);
        }

        if (g.timer <= 0) { g.timer = 0; g.phase = 'over'; g.deathReason = null; endRound(); }
    }

    // Called exactly once per round, however the round ended, to archive
    // the run for future players. Guarded by g.saved because several
    // different code paths can end a round.
    function endRound() {
        if (g.saved) return;
        g.saved = true;
        if (typeof saveMevGhostRun === 'function') {
            saveMevGhostRun(g.score, g.player.segmentCount, g.rec);
        }
    }

    // A rival dying dumps its whole body back into the world as food -
    // the same rule the player's death follows, which is what makes
    // hunting a big bot worth the risk.
    function killBot(bot) {
        bot.alive = false;
        bot.respawnT = BOT_RESPAWN_SECONDS;
        scatterFoodAt(bot.head.x, bot.head.y, bot.segmentCount, g.food);
    }

    function drawSandwichSegment(x, y, angle, size, isHead, palette) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        const r = size / 2;

        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(2, 3, r, r * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();

        // Each snake carries its own palette now, so five rivals are
        // visually distinguishable from each other and from you at a
        // glance instead of every bot sharing one pink.
        const pal = palette || PLAYER_PALETTE;
        const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.15, 0, 0, r);
        grad.addColorStop(0, pal.hi); grad.addColorStop(0.55, pal.mid); grad.addColorStop(1, pal.lo);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.82, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#a85a3a';
        ctx.fillRect(-r, -r * 0.16, r * 2, r * 0.30);
        ctx.fillStyle = '#7fc26b';
        ctx.fillRect(-r, r * 0.10, r * 2, r * 0.16);
        ctx.fillStyle = '#d6564a';
        ctx.fillRect(-r, r * 0.24, r * 2, r * 0.14);
        ctx.restore();

        ctx.strokeStyle = 'rgba(40,25,10,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.82, 0, 0, Math.PI * 2);
        ctx.stroke();

        if (isHead) {
            for (const ey of [-r * 0.32, r * 0.32]) {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(r * 0.35, ey, r * 0.22, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#161616';
                ctx.beginPath(); ctx.arc(r * 0.42, ey, r * 0.12, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.beginPath(); ctx.arc(r * 0.46, ey - r * 0.05, r * 0.045, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
    }

    let _hexBgCanvas = null;
    function buildHexBackground() {
        // Built once, big enough to tile seamlessly under the camera -
        // the camera samples a moving window of this via drawImage's
        // source-rect rather than regenerating hexes every frame.
        const hexR = 26, hexW = hexR * Math.sqrt(3), hexH = hexR * 2;
        const tileW = Math.ceil(hexW * 2), tileH = Math.ceil(hexH * 1.5);
        const off = document.createElement('canvas');
        off.width = tileW; off.height = tileH;
        const octx = off.getContext('2d');
        octx.fillStyle = '#0b0f16';
        octx.fillRect(0, 0, tileW, tileH);
        for (let row = -1; row < 3; row++) {
            const y = row * hexH * 0.75;
            const xOffset = (row % 2 + 2) % 2 ? hexW / 2 : 0;
            for (let col = -1; col < 3; col++) {
                const x = col * hexW + xOffset;
                const shade = (Math.abs(row * 31 + col * 17) % 5) / 5;
                octx.fillStyle = `hsl(155, 18%, ${12 + shade * 4}%)`;
                octx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = Math.PI / 3 * i - Math.PI / 6;
                    const px = x + hexR * 0.94 * Math.cos(a), py = y + hexR * 0.94 * Math.sin(a);
                    if (i === 0) octx.moveTo(px, py); else octx.lineTo(px, py);
                }
                octx.closePath(); octx.fill();
            }
        }
        _hexBgCanvas = off;
    }

    function drawWorldBackground(camX, camY, zoom) {
        // Now drawn INSIDE the camera transform set up in draw() (world
        // coordinates map straight to screen via that transform), so the
        // pattern - anchored at world (0,0) and repeating infinitely -
        // scrolls correctly just by filling a world-space rect around the
        // camera. None of the old manual screen-space offset math is
        // needed anymore now that everything draws in world space.
        if (!_hexBgCanvas) buildHexBackground();
        const pattern = ctx.createPattern(_hexBgCanvas, 'repeat');
        ctx.fillStyle = pattern;
        const halfW = (SW / 2) / zoom + 80;
        const halfH = (SH / 2) / zoom + 80;
        ctx.fillRect(camX - halfW, camY - halfH, halfW * 2, halfH * 2);
    }

    function draw() {
        const shakeX = g.shakeT > 0 ? rand(-3, 3) : 0;
        const shakeY = g.shakeT > 0 ? rand(-3, 3) : 0;
        const camX = g.camera.x, camY = g.camera.y;
        const zoom = currentZoom();

        ctx.fillStyle = '#0b0f16';
        ctx.fillRect(0, 0, SW, SH);

        // Camera transform: screen-center at the player, scaled by the
        // current zoom, then shifted so world coordinates land exactly
        // where they should. Everything drawn between here and the
        // matching ctx.restore() below is specified in plain WORLD
        // coordinates - the transform handles screen placement AND size
        // (segments, food, line widths all scale with zoom automatically),
        // replacing the old manual toScreen() conversions.
        ctx.save();
        ctx.translate(SW / 2 + shakeX, SH / 2 + shakeY);
        ctx.scale(zoom, zoom);
        ctx.translate(-camX, -camY);

        drawWorldBackground(camX, camY, zoom);

        // World boundary - visible as a glowing ring so "the edge" reads
        // clearly as the actual danger it is, not an invisible wall.
        // Divided by zoom so the ring's screen thickness stays consistent
        // regardless of how zoomed in/out the camera currently is.
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 4 / zoom;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(0, 0, WORLD_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Visible half-extents at the current zoom, with margin - used to
        // cull food/segments that are off-screen instead of drawing
        // everything in the (now much bigger) food pool every frame.
        const viewHalfW = (SW / 2) / zoom + 60;
        const viewHalfH = (SH / 2) / zoom + 60;

        // Food
        for (const f of g.food) {
            if (Math.abs(f.x - camX) > viewHalfW || Math.abs(f.y - camY) > viewHalfH) continue;
            const bobY = Math.sin(f.bob) * 3;
            ctx.save();
            ctx.translate(f.x, f.y + bobY);
            const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, f.r * 2.6);
            glow.addColorStop(0, f.color + 'aa'); glow.addColorStop(1, f.color + '00');
            ctx.fillStyle = glow;
            ctx.beginPath(); ctx.arc(0, 0, f.r * 2.6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = f.color;
            ctx.beginPath(); ctx.arc(0, 0, f.r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#0b0f16';
            ctx.font = `bold ${f.r}px 'JetBrains Mono', monospace`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(f.label, 0, 1);
            ctx.restore();
        }

        function drawSnake(snake) {
            if (!snake.alive) return;
            const bodyPoints = bodyPointsFor(snake);
            const size = segmentSizeFor(snake.segmentCount);
            for (let i = bodyPoints.length - 1; i >= 1; i--) {
                const p = bodyPoints[i], prev = bodyPoints[i - 1] || snake.head;
                if (Math.abs(p.x - camX) > viewHalfW + 60 || Math.abs(p.y - camY) > viewHalfH + 60) continue;
                const ang = Math.atan2(prev.y - p.y, prev.x - p.x);
                drawSandwichSegment(p.x, p.y, ang, size * (0.7 + 0.3 * (i / bodyPoints.length)), false, snake.palette);
            }
            drawSandwichSegment(snake.head.x, snake.head.y, snake.head.angle, size, true, snake.palette);

            // Rival name tag above the head, so you can tell who's who
            // and see which one is the big threat. Scaled down by zoom so
            // it stays readable at any camera distance.
            if (snake.isBot && Math.abs(snake.head.x - camX) < viewHalfW && Math.abs(snake.head.y - camY) < viewHalfH) {
                ctx.save();
                ctx.translate(snake.head.x, snake.head.y - size * 0.9);
                ctx.scale(1 / zoom, 1 / zoom);
                ctx.font = "bold 11px 'JetBrains Mono', monospace";
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                const tw = ctx.measureText(snake.name).width;
                ctx.fillRect(-tw / 2 - 4, -8, tw + 8, 15);
                ctx.fillStyle = snake.palette.hi;
                ctx.fillText(snake.name, 0, 0);
                ctx.restore();
            }
        }
        // Ghosts render first (underneath) and semi-transparent, so a
        // recorded run reads as a spectral replay rather than something
        // solid you'd mistake for a live rival.
        ctx.save();
        ctx.globalAlpha = 0.55;
        for (const ghost of g.ghosts) drawSnake(ghost);
        ctx.restore();
        for (const bot of g.bots) drawSnake(bot);
        drawSnake(g.player);

        ctx.restore();

        // HUD
        ctx.fillStyle = '#2ecc71';
        ctx.font = "bold 22px 'JetBrains Mono', monospace";
        ctx.textAlign = 'left';
        ctx.fillText(`SANDWICHED: $${g.score}`, 16, 30);
        const sec = Math.max(0, Math.ceil(g.timer));
        ctx.textAlign = 'right';
        ctx.fillStyle = sec <= 10 ? '#e05c5c' : '#eaeaea';
        ctx.fillText(`${sec}s`, SW - 16, 30);
        if (boosting && g.player.segmentCount > MIN_SEGMENTS) {
            ctx.fillStyle = '#e0c34c';
            ctx.font = "14px 'JetBrains Mono', monospace";
            ctx.textAlign = 'right';
            ctx.fillText(`BOOSTING  -$${BOOST_MONEY_PER_SEC}/s`, SW - 16, 52);
        }

        // Live leaderboard - the whole point of having five rivals is
        // seeing yourself climb (or fall) against them in real time.
        {
            const ranked = [g.player, ...g.bots.filter(b => b.alive), ...g.ghosts.filter(gh => gh.alive)]
                .sort((a, b) => b.segmentCount - a.segmentCount)
                .slice(0, 6);
            ctx.textAlign = 'left';
            ctx.font = "11px 'JetBrains Mono', monospace";
            let ly = 74;
            ctx.fillStyle = 'rgba(127,168,139,0.75)';
            ctx.fillText('BIGGEST SANDWICHES', 16, ly);
            ly += 15;
            for (let i = 0; i < ranked.length; i++) {
                const s = ranked[i];
                const isYou = s === g.player;
                ctx.fillStyle = isYou ? '#2ecc71' : s.palette.mid;
                ctx.fillText(`${i + 1}. ${isYou ? 'YOU' : s.name}`, 16, ly);
                // "rec" marks a recorded run by a real player, so those are
                // distinguishable from the CPU rivals at a glance - the
                // whole point of the ghost system is knowing a human set
                // that line, not the AI.
                if (s.isGhost) {
                    ctx.fillStyle = 'rgba(143,184,208,0.65)';
                    ctx.fillText('rec', 140, ly);
                }
                ctx.fillStyle = isYou ? '#2ecc71' : s.palette.mid;
                ctx.fillText(`${s.segmentCount}`, 172, ly);
                ly += 14;
            }
        }

        if (g.phase === 'over') {
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(0, 0, SW, SH);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#2ecc71';
            ctx.font = "bold 44px 'JetBrains Mono', monospace";
            ctx.fillText(g.deathReason ? 'REKT' : "TIME'S UP", SW / 2, SH / 2 - 40);
            ctx.fillStyle = '#eaeaea';
            ctx.font = "20px 'JetBrains Mono', monospace";
            ctx.fillText(`Final take: $${g.score}`, SW / 2, SH / 2 + 2);
            if (g.deathReason) ctx.fillText(g.deathReason, SW / 2, SH / 2 + 30);
            ctx.fillStyle = '#7fa88b';
            ctx.font = "14px 'JetBrains Mono', monospace";
            ctx.fillText('ENTER = Replay    ESC = Quit', SW / 2, SH / 2 + 66);
        }
    }

    function frame(now) {
        if (!frame._last) frame._last = now;
        const dt = Math.min((now - frame._last) / 1000, 0.05);
        frame._last = now;
        update(dt);
        draw();
        rafId = requestAnimationFrame(frame);
    }

    function start(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        g = newGame();
        frame._last = null;
        boosting = false;

        onMouseMove = (ev) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = (ev.clientX - rect.left) * (SW / rect.width);
            mouseY = (ev.clientY - rect.top) * (SH / rect.height);
        };
        onKeyDown = (ev) => {
            if (ev.key === 'Escape') { if (typeof window.closeMevSandwich === 'function') window.closeMevSandwich(); return; }
            if (ev.key === 'Enter' && g.phase === 'over') { newGame(); return; }
            if (ev.code === 'Space') { boosting = true; ev.preventDefault(); }
        };
        onKeyUp = (ev) => { if (ev.code === 'Space') boosting = false; };

        // Left mouse held = boost, same as the space bar. Clicking after
        // a round is over restarts it, matching what ENTER does, so you
        // can replay without going back to the keyboard.
        onMouseDown = (ev) => {
            if (ev.button !== 0) return;
            ev.preventDefault();
            if (g.phase === 'over') { newGame(); return; }
            boosting = true;
        };
        onMouseUp = (ev) => { if (ev.button === 0) boosting = false; };
        // Releasing the button outside the canvas (or dragging off it)
        // would otherwise leave boosting stuck on forever.
        onMouseLeave = () => { boosting = false; };

        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseleave', onMouseLeave);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (canvas && onMouseMove) canvas.removeEventListener('mousemove', onMouseMove);
        if (canvas && onMouseDown) canvas.removeEventListener('mousedown', onMouseDown);
        if (canvas && onMouseLeave) canvas.removeEventListener('mouseleave', onMouseLeave);
        if (onMouseUp) window.removeEventListener('mouseup', onMouseUp);
        if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
        if (onKeyUp) window.removeEventListener('keyup', onKeyUp);
        onMouseMove = onKeyDown = onKeyUp = onMouseDown = onMouseUp = onMouseLeave = null;
        boosting = false;
    }

    return { start, stop };
})();

function openMevSandwich() {
    const overlay = document.getElementById('mevSandwichOverlay');
    const canvas = document.getElementById('mevSandwichCanvas');
    if (!overlay || !canvas) { console.error('[mevsandwich] overlay/canvas not found - is the HTML in place?'); return; }
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    window.MevSandwichGame.start(canvas);
}
function closeMevSandwich() {
    const overlay = document.getElementById('mevSandwichOverlay');
    if (overlay) { overlay.classList.add('hidden'); overlay.classList.remove('flex'); }
    window.MevSandwichGame.stop();
}
