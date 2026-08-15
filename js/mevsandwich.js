/* ============================================================
   MEV SANDWICH - growing/eating arcade minigame, slither.io-style
   ============================================================
   v2 rewrite per Tim's request to feel more authentically like
   slither.io (reference: github.com/knagaitsev/slither.io-clone),
   still single-player (real multiplayer is a separate, bigger
   project queued up for later):

   - Large circular WORLD, not a small fixed box - camera follows
     the player's head, same "explore a big space" feel as the
     real thing instead of a cramped static arena.
   - A CPU bot snake to actually compete against - eats food, grows,
     and running into ITS body ends your round too, same as running
     into your own tail. Real stakes, not just solo dot-eating.
   - Speed boost (hold Space) - faster, but continuously costs
     length while held. Classic risk/reward.
   - Food scatters along the death location when either snake dies,
     not just a static respawn pool.

   Still exposes window.MevSandwichGame.start(canvas)/.stop() the
   same way as before. No Level 3 gating or launch button wiring
   yet on purpose - Tim wants the game itself nailed down first.
   ============================================================ */

window.MevSandwichGame = (function () {
    const SW = 960, SH = 540;
    const WORLD_R = 2400;            // world is a circle, radius from center - cross it and you die, same as real slither.io's boundary
    const HEAD_SPEED = 220;          // px/sec, normal
    const BOOST_SPEED = 380;         // px/sec, while boosting
    const BOOST_DRAIN_INTERVAL = 0.35; // seconds per segment lost while boosting
    const TURN_RATE = 4.2;
    const SEGMENT_SPACING = 14;
    const SEGMENT_SIZE_BASE = 22;
    const SEGMENT_SIZE_MAX = 40;
    const START_SEGMENTS = 5;
    const MIN_SEGMENTS = 4;          // boosting can't shrink you below this
    const ROUND_SECONDS = 90;        // longer now that there's an actual world to explore and a bot to compete with
    const FOOD_COUNT_TARGET = 70;    // spread across the much bigger world now
    const FOOD_RESPAWN_DELAY = 0.4;

    const TX_TYPES = [
        { label: '$', value: 1, r: 8, color: '#7fd68a', chance: 0.55 },
        { label: '$$', value: 3, r: 11, color: '#e0c34c', chance: 0.30 },
        { label: 'WHALE', value: 8, r: 15, color: '#e05c5c', chance: 0.15 },
    ];

    let canvas, ctx;
    let rafId = null;
    let mouseX = SW / 2, mouseY = SH / 2;
    let boosting = false;
    let onMouseMove, onKeyDown, onKeyUp;

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

    function newSnake(x, y, angle, segments) {
        const trail = [];
        for (let i = 0; i < segments * 3; i++) {
            trail.push({ x: x - Math.cos(angle) * i * (SEGMENT_SPACING / 3), y: y - Math.sin(angle) * i * (SEGMENT_SPACING / 3) });
        }
        return {
            head: { x, y, angle }, trail, segmentCount: segments,
            alive: true, boostDrainT: 0,
        };
    }

    function segmentSizeFor(total) {
        const growth = Math.min(1, (total - START_SEGMENTS) / 40);
        return SEGMENT_SIZE_BASE + (SEGMENT_SIZE_MAX - SEGMENT_SIZE_BASE) * growth;
    }

    let g;

    function newGame() {
        return {
            phase: 'playing',
            player: newSnake(0, 400, -Math.PI / 2, START_SEGMENTS),
            bot: newSnake(0, -400, Math.PI / 2, START_SEGMENTS),
            botTargetFood: null,
            botWanderAngle: 0,
            food: (() => { const f = []; for (let i = 0; i < FOOD_COUNT_TARGET; i++) f.push(spawnFood(f)); return f; })(),
            pendingSpawns: [],
            score: 0,
            timer: ROUND_SECONDS,
            deathReason: null,
            shakeT: 0,
            camera: { x: 0, y: 400 },
        };
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

    function updateBotAI(dt) {
        const bot = g.bot;
        if (!bot.alive) return;

        // Simple, readable AI: head for the nearest food most of the
        // time; occasionally just wander so it doesn't feel robotic;
        // steer away from the world edge before it gets close enough
        // to matter.
        const distFromCenter = Math.hypot(bot.head.x, bot.head.y);
        let targetAngle;
        if (distFromCenter > WORLD_R * 0.85) {
            targetAngle = Math.atan2(-bot.head.y, -bot.head.x); // steer back toward center
        } else {
            if (!g.botTargetFood || !g.food.includes(g.botTargetFood) || Math.random() < 0.01) {
                let best = null, bestD = Infinity;
                for (const f of g.food) {
                    const d = Math.hypot(f.x - bot.head.x, f.y - bot.head.y);
                    if (d < bestD) { bestD = d; best = f; }
                }
                g.botTargetFood = best;
            }
            if (g.botTargetFood) {
                targetAngle = Math.atan2(g.botTargetFood.y - bot.head.y, g.botTargetFood.x - bot.head.x);
            } else {
                g.botWanderAngle += rand(-0.5, 0.5) * dt;
                targetAngle = bot.head.angle + g.botWanderAngle * dt;
            }
        }
        const botSpeed = HEAD_SPEED * 0.92; // very slightly slower than the player's base speed so it's beatable, not just competitive
        updateSnakeMovement(bot, dt, targetAngle, botSpeed);
    }

    function checkSelfAndSnakeCollision(snake, otherSnake, skipNear) {
        const headSize = segmentSizeFor(snake.segmentCount);
        for (let i = skipNear; i < snake.trail.length; i++) {
            if (Math.hypot(snake.head.x - snake.trail[i].x, snake.head.y - snake.trail[i].y) < headSize * 0.45) return true;
        }
        if (otherSnake && otherSnake.alive) {
            const otherPoints = bodyPointsFor(otherSnake);
            for (const p of otherPoints) {
                if (Math.hypot(snake.head.x - p.x, snake.head.y - p.y) < headSize * 0.45) return true;
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

        // Player steering + boost
        const targetAngle = Math.atan2(mouseY - (SH / 2), mouseX - (SW / 2)); // relative to screen center, since the camera keeps the player centered
        let speed = HEAD_SPEED;
        if (boosting && g.player.segmentCount > MIN_SEGMENTS) {
            speed = BOOST_SPEED;
            g.player.boostDrainT -= dt;
            if (g.player.boostDrainT <= 0) {
                g.player.boostDrainT = BOOST_DRAIN_INTERVAL;
                g.player.segmentCount = Math.max(MIN_SEGMENTS, g.player.segmentCount - 1);
                scatterFoodAt(g.player.trail[g.player.trail.length - 1]?.x ?? g.player.head.x,
                    g.player.trail[g.player.trail.length - 1]?.y ?? g.player.head.y, 1, g.food);
            }
        }
        updateSnakeMovement(g.player, dt, targetAngle, speed);
        updateBotAI(dt);

        // Camera follows the player's head
        g.camera.x = g.player.head.x;
        g.camera.y = g.player.head.y;

        // Boundary check (circular world)
        if (Math.hypot(g.player.head.x, g.player.head.y) > WORLD_R) {
            g.phase = 'over'; g.deathReason = 'Drifted outside the mempool.'; return;
        }
        if (g.bot.alive && Math.hypot(g.bot.head.x, g.bot.head.y) > WORLD_R + 50) {
            g.bot.alive = false; // shouldn't really happen given the AI steers back, but a safety net
            scatterFoodAt(g.bot.head.x, g.bot.head.y, g.bot.segmentCount, g.food);
        }

        // Self-collision and snake-vs-snake collision
        if (checkSelfAndSnakeCollision(g.player, g.bot, 10)) {
            const hitOwnTail = checkSelfAndSnakeCollision(g.player, null, 10);
            g.phase = 'over';
            g.deathReason = hitOwnTail ? 'Sandwiched yourself. Ironic.' : 'Ran straight into a rival sandwich.';
            scatterFoodAt(g.player.head.x, g.player.head.y, g.player.segmentCount, g.food);
            return;
        }
        if (g.bot.alive && checkSelfAndSnakeCollision(g.bot, g.player, 10)) {
            g.bot.alive = false;
            scatterFoodAt(g.bot.head.x, g.bot.head.y, g.bot.segmentCount, g.food);
        }

        handleEating(g.player);
        if (g.bot.alive) handleEating(g.bot);

        for (let i = g.pendingSpawns.length - 1; i >= 0; i--) {
            g.pendingSpawns[i] -= dt;
            if (g.pendingSpawns[i] <= 0) { g.pendingSpawns.splice(i, 1); g.food.push(spawnFood(g.food)); }
        }
        for (const f of g.food) f.bob += dt * 3;

        // Bot respawns a little while after dying, rather than the round
        // just permanently losing its rival - keeps the "something to
        // compete against" feeling alive for the whole round.
        if (!g.bot.alive) {
            g._botRespawnT = (g._botRespawnT ?? 3) - dt;
            if (g._botRespawnT <= 0) {
                const p = randomPointInWorld(400);
                g.bot = newSnake(p.x, p.y, Math.random() * Math.PI * 2, START_SEGMENTS);
                g._botRespawnT = undefined;
            }
        }

        if (g.timer <= 0) { g.timer = 0; g.phase = 'over'; g.deathReason = null; }
    }

    function drawSandwichSegment(x, y, angle, size, isHead, isBot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        const r = size / 2;

        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(2, 3, r, r * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();

        const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.15, 0, 0, r);
        if (isBot) {
            grad.addColorStop(0, '#e3b3c6'); grad.addColorStop(0.55, '#c67a97'); grad.addColorStop(1, '#7a3f56');
        } else {
            grad.addColorStop(0, '#f6dfa0'); grad.addColorStop(0.55, '#e6bd72'); grad.addColorStop(1, '#a5763f');
        }
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

    function drawWorldBackground(camX, camY) {
        if (!_hexBgCanvas) buildHexBackground();
        const tw = _hexBgCanvas.width, th = _hexBgCanvas.height;
        const pattern = ctx.createPattern(_hexBgCanvas, 'repeat');
        ctx.save();
        // Offset the pattern so it scrolls correctly with the camera -
        // canvas patterns tile from (0,0) of the CANVAS by default, not
        // from the world origin, so this corrects for that each frame.
        const offX = ((-camX + SW / 2) % tw + tw) % tw;
        const offY = ((-camY + SH / 2) % th + th) % th;
        ctx.translate(offX - tw, offY - th);
        ctx.fillStyle = pattern;
        ctx.fillRect(-offX + camX - SW / 2 - tw, -offY + camY - SH / 2 - th, SW + tw * 3, SH + th * 3);
        ctx.restore();
    }

    function draw() {
        const shakeX = g.shakeT > 0 ? rand(-3, 3) : 0;
        const shakeY = g.shakeT > 0 ? rand(-3, 3) : 0;
        const camX = g.camera.x, camY = g.camera.y;

        ctx.fillStyle = '#0b0f16';
        ctx.fillRect(0, 0, SW, SH);
        ctx.save();
        ctx.translate(shakeX, shakeY);
        drawWorldBackground(camX, camY);

        function toScreen(wx, wy) { return [wx - camX + SW / 2, wy - camY + SH / 2]; }

        // World boundary - visible as a glowing ring so "the edge" reads
        // clearly as the actual danger it is, not an invisible wall.
        const [bx, by] = toScreen(0, 0);
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(bx, by, WORLD_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Food
        for (const f of g.food) {
            const [sx, sy] = toScreen(f.x, f.y);
            if (sx < -30 || sx > SW + 30 || sy < -30 || sy > SH + 30) continue; // cheap offscreen skip
            const bobY = Math.sin(f.bob) * 3;
            ctx.save();
            ctx.translate(sx, sy + bobY);
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

        function drawSnake(snake, isBot) {
            if (!snake.alive && isBot) return;
            const bodyPoints = bodyPointsFor(snake);
            const size = segmentSizeFor(snake.segmentCount);
            for (let i = bodyPoints.length - 1; i >= 1; i--) {
                const p = bodyPoints[i], prev = bodyPoints[i - 1] || snake.head;
                const [sx, sy] = toScreen(p.x, p.y);
                if (sx < -60 || sx > SW + 60 || sy < -60 || sy > SH + 60) continue;
                const ang = Math.atan2(prev.y - p.y, prev.x - p.x);
                drawSandwichSegment(sx, sy, ang, size * (0.7 + 0.3 * (i / bodyPoints.length)), false, isBot);
            }
            const [hx, hy] = toScreen(snake.head.x, snake.head.y);
            drawSandwichSegment(hx, hy, snake.head.angle, size, true, isBot);
        }
        drawSnake(g.bot, true);
        drawSnake(g.player, false);

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
            ctx.fillText('BOOSTING', SW - 16, 52);
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
            if (ev.key === 'Enter' && g.phase === 'over') { g = newGame(); return; }
            if (ev.code === 'Space') { boosting = true; ev.preventDefault(); }
        };
        onKeyUp = (ev) => { if (ev.code === 'Space') boosting = false; };
        canvas.addEventListener('mousemove', onMouseMove);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (canvas && onMouseMove) canvas.removeEventListener('mousemove', onMouseMove);
        if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
        if (onKeyUp) window.removeEventListener('keyup', onKeyUp);
        onMouseMove = onKeyDown = onKeyUp = null;
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
