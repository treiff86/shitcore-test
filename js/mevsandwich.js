/* ============================================================
   MEV SANDWICH - growing/eating arcade minigame
   ============================================================
   worms.io-style single-player round: you're a sandwich, mouse
   steers the head, transactions ("tx" dots) floating around the
   arena get eaten to grow the tail and rack up score. Starts as
   a tiny sandwich, ends the round as a "biggun" if you eat enough.

   Round ends on: timer running out, hitting a wall, or hitting
   your own tail (classic snake rules - the tail is the actual
   challenge once it gets long, not just free growth).

   No Level 3 gating or TEST-mode-only visibility wired up yet on
   purpose - Tim asked to nail the game feel first, wiring comes
   next as a separate pass. For testing right now, this exposes
   window.MevSandwichGame.start(canvas)/.stop() the same way
   BonusStage/FightGame do - call openMevSandwich() from the
   console (or wire a temporary button) to try it.
   ============================================================ */

window.MevSandwichGame = (function () {
    const SW = 960, SH = 540;
    const HEAD_SPEED = 220;          // px/sec
    const TURN_RATE = 4.2;           // radians/sec, how fast the head can steer toward the cursor
    const SEGMENT_SPACING = 14;      // px between trail points that get recorded
    const SEGMENT_SIZE_BASE = 22;    // px, size of the smallest (starting) segments
    const SEGMENT_SIZE_MAX = 40;     // px, size once fully grown
    const START_SEGMENTS = 5;
    const ROUND_SECONDS = 45;
    const FOOD_COUNT_TARGET = 22;    // how many tx dots stay on screen at once
    const FOOD_RESPAWN_DELAY = 0.4;  // seconds after eating before a new one appears somewhere else

    const TX_TYPES = [
        { label: '$', value: 1, r: 8,  color: '#7fd68a', chance: 0.55 },
        { label: '$$', value: 3, r: 11, color: '#e0c34c', chance: 0.30 },
        { label: 'WHALE', value: 8, r: 15, color: '#e05c5c', chance: 0.15 },
    ];

    let canvas, ctx;
    let rafId = null;
    let keys = {};
    let mouseX = SW / 2, mouseY = SH / 2;
    let onMouseMove, onKeyDown, onKeyUp;

    function rand(min, max) { return min + Math.random() * (max - min); }

    function pickTxType() {
        const r = Math.random();
        let acc = 0;
        for (const t of TX_TYPES) {
            acc += t.chance;
            if (r <= acc) return t;
        }
        return TX_TYPES[0];
    }

    function spawnFood(existing) {
        // keep new spawns away from the immediate edges so they don't
        // appear half-clipped against a wall
        const margin = 40;
        let x, y, tries = 0;
        do {
            x = rand(margin, SW - margin);
            y = rand(margin, SH - margin);
            tries++;
        } while (tries < 10 && existing.some(f => Math.hypot(f.x - x, f.y - y) < 30));
        const type = pickTxType();
        return { x, y, r: type.r, value: type.value, label: type.label, color: type.color, bob: Math.random() * Math.PI * 2 };
    }

    function newGame() {
        const startAngle = -Math.PI / 2;
        const head = { x: SW / 2, y: SH * 0.7, angle: startAngle };
        // Seed the trail behind the head so it doesn't start as a bare dot.
        const trail = [];
        for (let i = 0; i < START_SEGMENTS * 3; i++) {
            trail.push({ x: head.x - Math.cos(startAngle) * i * (SEGMENT_SPACING / 3), y: head.y - Math.sin(startAngle) * i * (SEGMENT_SPACING / 3) });
        }
        const food = [];
        for (let i = 0; i < FOOD_COUNT_TARGET; i++) food.push(spawnFood(food));
        return {
            phase: 'playing', // 'playing' | 'over'
            head,
            trail,
            segmentCount: START_SEGMENTS,
            food,
            pendingSpawns: [],
            score: 0,
            timer: ROUND_SECONDS,
            deathReason: null,
            shakeT: 0,
        };
    }

    let g;

    function segmentSizeFor(index, total) {
        // Grows from base to max size along the body's own growth curve,
        // not by segment index within a fixed body - the WHOLE sandwich
        // gets chunkier as segmentCount increases, capped at max.
        const growth = Math.min(1, (total - START_SEGMENTS) / 40);
        return SEGMENT_SIZE_BASE + (SEGMENT_SIZE_MAX - SEGMENT_SIZE_BASE) * growth;
    }

    function update(dt) {
        if (g.phase !== 'playing') return;
        g.timer -= dt;
        g.shakeT = Math.max(0, g.shakeT - dt);

        // Steer the head toward the mouse - classic io-game control feel,
        // capped turn rate so it can't snap-turn instantly.
        const targetAngle = Math.atan2(mouseY - g.head.y, mouseX - g.head.x);
        let diff = targetAngle - g.head.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = TURN_RATE * dt;
        g.head.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));

        g.head.x += Math.cos(g.head.angle) * HEAD_SPEED * dt;
        g.head.y += Math.sin(g.head.angle) * HEAD_SPEED * dt;

        // Wall collision - round over.
        if (g.head.x < 10 || g.head.x > SW - 10 || g.head.y < 10 || g.head.y > SH - 10) {
            g.phase = 'over'; g.deathReason = 'Ran off the edge of the mempool.'; return;
        }

        // Record trail point.
        const last = g.trail[0];
        if (!last || Math.hypot(g.head.x - last.x, g.head.y - last.y) >= SEGMENT_SPACING) {
            g.trail.unshift({ x: g.head.x, y: g.head.y });
        }
        const maxTrailLen = Math.ceil(g.segmentCount * (SEGMENT_SIZE_MAX / SEGMENT_SPACING)) + 20;
        if (g.trail.length > maxTrailLen) g.trail.length = maxTrailLen;

        // Self-collision - only check against trail points far enough
        // back to actually be a different part of the body, not the
        // points immediately behind the head (which are always close).
        const headSize = segmentSizeFor(0, g.segmentCount);
        const skipNear = 10;
        for (let i = skipNear; i < g.trail.length; i++) {
            if (Math.hypot(g.head.x - g.trail[i].x, g.head.y - g.trail[i].y) < headSize * 0.45) {
                g.phase = 'over'; g.deathReason = 'Sandwiched yourself. Ironic.'; return;
            }
        }

        // Eating.
        for (let i = g.food.length - 1; i >= 0; i--) {
            const f = g.food[i];
            if (Math.hypot(g.head.x - f.x, g.head.y - f.y) < headSize / 2 + f.r) {
                g.score += f.value;
                g.segmentCount += 1;
                g.shakeT = 0.08;
                g.food.splice(i, 1);
                g.pendingSpawns.push(FOOD_RESPAWN_DELAY);
            }
        }
        for (let i = g.pendingSpawns.length - 1; i >= 0; i--) {
            g.pendingSpawns[i] -= dt;
            if (g.pendingSpawns[i] <= 0) {
                g.pendingSpawns.splice(i, 1);
                g.food.push(spawnFood(g.food));
            }
        }
        for (const f of g.food) f.bob += dt * 3;

        if (g.timer <= 0) {
            g.timer = 0; g.phase = 'over'; g.deathReason = null; // ran out the clock, not a death - treated as a clean finish
        }
    }

    function drawSandwichSegment(x, y, angle, size, isHead) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        const s = size;
        const h = s * 0.62;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(2, 3, s / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // bottom bread
        ctx.fillStyle = '#e2b869';
        roundedRect(-s / 2, -h * 0.30, s, h * 0.34, h * 0.12);
        // meat
        ctx.fillStyle = '#a85a3a';
        roundedRect(-s / 2 + 1, -h * 0.06, s - 2, h * 0.16, 3);
        // lettuce
        ctx.fillStyle = '#7fc26b';
        roundedRect(-s / 2 + 1, h * 0.08, s - 2, h * 0.10, 3);
        // tomato
        ctx.fillStyle = '#d6564a';
        roundedRect(-s / 2 + 1, h * 0.16, s - 2, h * 0.09, 3);
        // top bread
        ctx.fillStyle = '#eccb85';
        roundedRect(-s / 2, -h * 0.5, s, h * 0.24, h * 0.12);

        if (isHead) {
            // little cartoon eyes so the front reads clearly as "the front"
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.arc(s * 0.18, -h * 0.05, s * 0.06, 0, Math.PI * 2);
            ctx.arc(s * 0.18, h * 0.12, s * 0.06, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function roundedRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
    }

    function draw() {
        const shakeX = g.shakeT > 0 ? rand(-3, 3) : 0;
        const shakeY = g.shakeT > 0 ? rand(-3, 3) : 0;
        ctx.save();
        ctx.translate(shakeX, shakeY);

        // background - dark "mempool" grid
        ctx.fillStyle = '#0b0f16';
        ctx.fillRect(-10, -10, SW + 20, SH + 20);
        ctx.strokeStyle = 'rgba(46,204,113,0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x < SW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke(); }
        for (let y = 0; y < SH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke(); }
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, SW - 12, SH - 12);

        // food
        for (const f of g.food) {
            const bobY = Math.sin(f.bob) * 3;
            ctx.save();
            ctx.translate(f.x, f.y + bobY);
            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.arc(0, 0, f.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0b0f16';
            ctx.font = `bold ${f.r}px 'JetBrains Mono', monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(f.label, 0, 1);
            ctx.restore();
        }

        // body segments, drawn tail-first so the head renders on top
        const total = g.segmentCount;
        const size = segmentSizeFor(0, total);
        const spacingPx = Math.max(6, size * 0.55);
        const bodyPoints = [];
        let dist = 0, idx = 0;
        for (let n = 0; n < total && idx < g.trail.length - 1; n++) {
            while (idx < g.trail.length - 1 && dist < n * spacingPx) {
                dist += Math.hypot(g.trail[idx].x - g.trail[idx + 1].x, g.trail[idx].y - g.trail[idx + 1].y);
                idx++;
            }
            bodyPoints.push(g.trail[Math.min(idx, g.trail.length - 1)]);
        }
        for (let i = bodyPoints.length - 1; i >= 1; i--) {
            const p = bodyPoints[i];
            const prev = bodyPoints[i - 1] || g.head;
            const ang = Math.atan2(prev.y - p.y, prev.x - p.x);
            drawSandwichSegment(p.x, p.y, ang, size * (0.7 + 0.3 * (i / bodyPoints.length)), false);
        }
        drawSandwichSegment(g.head.x, g.head.y, g.head.angle, size, true);

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
        keys = {};
        frame._last = null;

        onMouseMove = (ev) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = (ev.clientX - rect.left) * (SW / rect.width);
            mouseY = (ev.clientY - rect.top) * (SH / rect.height);
        };
        onKeyDown = (ev) => {
            if (ev.key === 'Escape') { if (typeof window.closeMevSandwich === 'function') window.closeMevSandwich(); return; }
            if (ev.key === 'Enter' && g.phase === 'over') { g = newGame(); return; }
        };
        canvas.addEventListener('mousemove', onMouseMove);
        window.addEventListener('keydown', onKeyDown);

        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (canvas && onMouseMove) canvas.removeEventListener('mousemove', onMouseMove);
        if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
        onMouseMove = onKeyDown = null;
    }

    return { start, stop };
})();

/* ---------------- Temporary test-only launcher ----------------
   No button/UI wired up yet on purpose (Tim wants the game itself
   nailed down first) - call openMevSandwich() from the browser
   console to try it, or wire a real button to this later. */
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
