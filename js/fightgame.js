/* ============================================================
   FIGHT GAME (TEST PLAY ONLY, FOR NOW)
   ============================================================
   1v1: whichever character matches your active theme vs the other,
   CPU-controlled. Reuses the exact same walk/punch/kick/hurt/victory/
   defeat art already built for the Bonus Stage - only the block pose
   and the two arena backgrounds are new to this file.

   Block: hold the block key. While blocking:
     - you cannot attack (inputs are ignored, same as a real fighting
       game - blocking is purely defensive)
     - incoming hits are reduced by a random 60-90%, never fully
       negated and never full damage either
     - you can still be chip-damaged, just heavily reduced

   Usage: FightGame.start(canvasEl) to begin, FightGame.stop() to
   fully tear down. Mirrors BonusStage's API on purpose.
   ============================================================ */
window.FightGame = (function () {
    'use strict';

    // ---------------------------------------------------------------
    // CONSTANTS
    // ---------------------------------------------------------------
    const SW = 960, SH = 540;
    const GROUND = 430;
    const P_H = 220;

    const P_SPD = 4.6;
    const ROUND_T = 60.0;
    const STAGE_MARGIN = 40;

    const DMG = { punch_lo: 14, kick_lo: 22 };
    const ATK_DUR = { punch_lo: 0.26, kick_lo: 0.34 };
    const HEAVY = new Set(['kick_lo']);
    const HS_LT = 5, HS_HV = 9;
    const CANCEL_W = 0.18;

    const BLOCK_REDUCTION_MIN = 0.60;
    const BLOCK_REDUCTION_MAX = 0.90;

    const MAX_HP = 100;
    const VICTORY_FPS = 8;
    const DEFEAT_FPS = 7;
    const AUTO_CLOSE_SECONDS = 3.0;
    const HURT_FLASH_T = 0.22;

    const COL = {
        W: '#ffffff', RD: '#dc1e1e', OR: '#ff8c00', YL: '#ffd700',
        GN: '#1ec846', GY: '#787878', DK: '#323232', LG: '#c8c8c8', BL: '#3b82f6',
    };

    // Full move sets - walk/punch/kick/hurt/victory/defeat all reuse the
    // exact files already built for the Bonus Stage; only "block" is new
    // and lives in assets/fight_game/ instead.
    const FIGHTER_ANIM_FILES = {
        reiffer: {
            walk:     ['assets/bonus_stage/reiffer_walk.webp', 6],
            victory:  ['assets/bonus_stage/reiffer_victory.webp', 6],
            punch_lo: ['assets/bonus_stage/reiffer_punch_lo.webp', 6],
            kick_lo:  ['assets/bonus_stage/reiffer_kick_lo.webp', 4],
            hurt:     ['assets/bonus_stage/hit.webp', 1],
            defeat:   ['assets/bonus_stage/midevils_defeat.webp?v=3', 3],
            block:    ['assets/fight_game/reiffer_block.webp', 1],
        },
        conmen: {
            walk:     ['assets/bonus_stage/conmen_walk.webp', 4],
            victory:  ['assets/bonus_stage/conmen_victory.webp', 4],
            punch_lo: ['assets/bonus_stage/conmen_punch_lo.webp', 3],
            kick_lo:  ['assets/bonus_stage/conmen_kick_lo.webp', 3],
            hurt:     ['assets/bonus_stage/conmen_hit.webp', 1],
            defeat:   ['assets/bonus_stage/conmen_defeat.webp?v=2', 4],
            block:    ['assets/fight_game/conmen_block.webp', 1],
        },
    };

    const BACKGROUNDS = ['assets/fight_game/bg_prison.webp', 'assets/fight_game/bg_market.webp'];

    // ---------------------------------------------------------------
    // ASSET LOADING
    // ---------------------------------------------------------------
    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('failed to load ' + src));
            img.src = src;
        });
    }

    async function loadStrip(fullPath, frameCount, outH) {
        let img;
        try { img = await loadImage(fullPath); }
        catch (e) { console.warn('[fightgame] missing sprite', fullPath, e); return []; }
        const cellW = img.width / frameCount;
        const cellH = img.height;
        const scale = outH / cellH;
        const outW = Math.max(1, Math.round(cellW * scale));
        const frames = [];
        for (let i = 0; i < frameCount; i++) {
            const c = document.createElement('canvas');
            c.width = outW; c.height = outH;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, i * cellW, 0, cellW, cellH, 0, 0, outW, outH);
            frames.push(c);
        }
        return frames;
    }

    async function loadFighterAnims(key) {
        const files = FIGHTER_ANIM_FILES[key];
        const anims = {};
        for (const state in files) {
            const [path, count] = files[state];
            anims[state] = await loadStrip(path, count, P_H);
        }
        anims.idle = anims.walk.length ? [anims.walk[0]] : [];
        return anims;
    }

    async function loadArenaBackground() {
        const src = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
        try {
            const img = await loadImage(src);
            const c = document.createElement('canvas');
            c.width = SW; c.height = SH;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, SW, SH);
            return c;
        } catch (e) { return null; }
    }

    // ---------------------------------------------------------------
    // FIGHTER
    // ---------------------------------------------------------------
    class Fighter {
        constructor(anims, x, facing, isCPU) {
            this.anims = anims;
            this.x = x; this.y = GROUND - P_H;
            this.vx = 0; this.facing = facing;
            this.isCPU = isCPU;
            this.hp = MAX_HP;
            this.state = 'idle'; this.fr = 0; this.frT = 0;
            this._fw = 90;
            this.atkT = 0; this.atkDur = 0; this.hitReg = false; this.canW = false; this.canT = 0;
            this.stop = 0;
            this.blocking = false;
            this.hurtT = 0;
            this.ko = false;
            // CPU brain
            this.cpuTimer = 0;
            this.cpuAction = 'idle';
        }

        rect() {
            return { x: this.x, y: this.y, w: this._fw, h: P_H };
        }

        hitbox() {
            if (this.state === 'punch_lo' && !this.hitReg) {
                const ex = this.facing === 1 ? this.x + this._fw - 6 : this.x - 40;
                return { x: ex, y: this.y + P_H * 0.30, w: 46, h: 30 };
            }
            if (this.state === 'kick_lo' && !this.hitReg) {
                const ex = this.facing === 1 ? this.x + this._fw - 4 : this.x - 46;
                return { x: ex, y: this.y + P_H * 0.55, w: 54, h: 28 };
            }
            return null;
        }

        beginAttack(kind) {
            if (this.blocking) return; // can't attack while blocking, no exceptions
            this.state = kind; this.atkT = 0; this.hitReg = false; this.canW = false; this.canT = 0;
            this.fr = 0; this.frT = 0; this.atkDur = ATK_DUR[kind];
        }

        takeDamage(rawDmg, heavy) {
            let dmg = rawDmg;
            if (this.blocking) {
                const reduction = BLOCK_REDUCTION_MIN + Math.random() * (BLOCK_REDUCTION_MAX - BLOCK_REDUCTION_MIN);
                dmg = rawDmg * (1 - reduction);
            }
            dmg = Math.round(dmg);
            this.hp = Math.max(0, this.hp - dmg);
            if (!this.blocking) {
                this.hurtT = HURT_FLASH_T;
                this.stop = heavy ? HS_HV : HS_LT;
            }
            if (this.hp <= 0) this.ko = true;
            return dmg;
        }

        _adv(dt, fps) {
            this.frT += dt;
            if (this.frT >= 1 / fps) {
                this.frT = 0;
                const n = (this.anims[this.state] || [null]).length;
                this.fr = (this.fr + 1) % Math.max(1, n);
            }
        }

        _surf() {
            if (this.hurtT > 0) {
                const hf = this.anims.hurt;
                if (hf && hf.length) return hf[0];
            }
            const frames = this.anims[this.state] && this.anims[this.state].length ? this.anims[this.state] : this.anims.idle;
            if (!frames || !frames.length) return null;
            const s = frames[this.fr % frames.length];
            if (s && s.width !== this._fw) this._fw = s.width;
            return s;
        }

        draw(ctx, so) {
            const img = this._surf();
            const sx = Math.round(this.x + so[0]);
            const sy = Math.round(this.y + so[1]);
            if (!img) return;
            if (this.facing === -1) {
                ctx.save();
                ctx.translate(sx + this._fw, sy);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0);
                ctx.restore();
            } else {
                ctx.drawImage(img, sx, sy);
            }
        }
    }

    // ---------------------------------------------------------------
    // GAME STATE
    // ---------------------------------------------------------------
    let assetsPromise = null;
    let rafId = null;
    let keys = {};
    let onKeyDown, onKeyUp;

    function newGame(anims, bg, playerKey) {
        const cpuKey = playerKey === 'conmen' ? 'reiffer' : 'conmen';
        const player = new Fighter(anims[playerKey], 180, 1, false);
        const cpu = new Fighter(anims[cpuKey], SW - 180 - 90, -1, true);
        return {
            player, cpu, bg,
            timer: ROUND_T,
            phase: 'playing', // playing | won | lost | draw
            closeCountdown: null,
        };
    }

    function aabbOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function updateCPU(dt, cpu, player) {
        cpu.cpuTimer -= dt;
        const gap = player.x - cpu.x;
        const absGap = Math.abs(gap);
        cpu.facing = gap >= 0 ? 1 : -1;

        const busy = cpu.state === 'punch_lo' || cpu.state === 'kick_lo';
        if (cpu.stop > 0) { cpu.stop--; return; }

        // React to the player actively attacking at close range - decent
        // chance to throw up a block instead of eating it clean.
        const playerAttacking = (player.state === 'punch_lo' || player.state === 'kick_lo') && !player.hitReg;
        if (playerAttacking && absGap < 90 && Math.random() < 0.55 && !busy) {
            cpu.blocking = true;
            cpu.state = 'block'; cpu.fr = 0;
            return;
        }

        if (cpu.cpuTimer <= 0) {
            cpu.cpuTimer = 0.35 + Math.random() * 0.5;
            if (absGap > 140) {
                cpu.cpuAction = 'approach';
            } else if (absGap < 60) {
                cpu.cpuAction = Math.random() < 0.6 ? 'attack' : (Math.random() < 0.3 ? 'block' : 'idle');
            } else {
                cpu.cpuAction = Math.random() < 0.5 ? 'approach' : 'attack';
            }
        }

        cpu.blocking = false;
        if (busy) { /* let current swing finish */ }
        else if (cpu.cpuAction === 'block') {
            cpu.blocking = true;
            cpu.state = 'block'; cpu.fr = 0;
        } else if (cpu.cpuAction === 'approach') {
            cpu.vx = cpu.facing * P_SPD * 0.85;
            cpu.x = Math.max(STAGE_MARGIN, Math.min(SW - STAGE_MARGIN - cpu._fw, cpu.x + cpu.vx));
            cpu.state = 'walk';
        } else if (cpu.cpuAction === 'attack' && absGap < 100) {
            cpu.beginAttack(Math.random() < 0.5 ? 'punch_lo' : 'kick_lo');
        } else {
            cpu.state = 'idle';
        }
    }

    function updateFighterCommon(dt, f) {
        const atk = f.state === 'punch_lo' || f.state === 'kick_lo';
        if (atk) {
            f.atkT += dt;
            if (f.canT > 0) f.canT -= dt;
            if (!f.canW && f.atkT >= f.atkDur * 0.4) { f.canW = true; f.canT = CANCEL_W; }
            if (f.atkT >= f.atkDur) {
                f.state = 'idle'; f.atkT = 0; f.canW = false; f.fr = 0;
            }
        }
        if (f.hurtT > 0) f.hurtT = Math.max(0, f.hurtT - dt);
        const fpsMap = { idle: 5, walk: 10, punch_lo: 16, kick_lo: 14, block: 1 };
        f._adv(dt, fpsMap[f.state] || 8);
    }

    function resolveHit(attacker, defender, shake, fx) {
        const hb = attacker.hitbox();
        if (!hb || attacker.hitReg) return;
        if (aabbOverlap(hb, defender.rect())) {
            attacker.hitReg = true;
            const heavy = HEAVY.has(attacker.state);
            const dealt = defender.takeDamage(DMG[attacker.state] || 10, heavy);
            attacker.stop = heavy ? HS_HV : HS_LT;
            shake.hit(heavy ? 7.0 : 3.2);
            fx.push({ x: hb.x + hb.w / 2, y: hb.y + hb.h / 2, l: heavy ? 9 : 6, ml: heavy ? 9 : 6, heavy });
            if (typeof window.playSound === 'function') {
                window.playSound(defender.blocking ? 'fryer_hit' : 'player_hurt');
            }
            void dealt;
        }
    }

    class Shake {
        constructor() { this.v = 0; }
        hit(a) { this.v = Math.max(this.v, a); }
        update() { this.v *= 0.75; if (this.v < 0.4) this.v = 0; }
        off() { if (this.v < 0.4) return [0, 0]; return [(Math.random() - 0.5) * 2 * this.v, (Math.random() - 0.5) * this.v]; }
    }

    function drawHUD(ctx, g) {
        // Player bar (left)
        const barW = 300, barH = 18;
        drawBar(ctx, 24, 20, barW, barH, g.player.hp / MAX_HP, COL.GN, 'YOU');
        drawBar(ctx, SW - 24 - barW, 20, barW, barH, g.cpu.hp / MAX_HP, COL.RD, 'RIVAL', true);

        ctx.textBaseline = 'top';
        ctx.font = "20px 'BonusStagePixel', monospace";
        ctx.fillStyle = COL.W;
        const t = Math.max(0, Math.ceil(g.timer));
        const tw = ctx.measureText(String(t)).width;
        ctx.fillText(String(t), SW / 2 - tw / 2, 18);
    }

    function drawBar(ctx, x, y, w, h, pct, color, label, rightAlign) {
        pct = Math.max(0, Math.min(1, pct));
        ctx.fillStyle = COL.DK;
        ctx.fillRect(x, y, w, h);
        const fillW = w * pct;
        ctx.fillStyle = color;
        ctx.fillRect(rightAlign ? x + w - fillW : x, y, fillW, h);
        ctx.strokeStyle = COL.W;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.font = "11px 'BonusStagePixel', monospace";
        ctx.fillStyle = COL.LG;
        ctx.textBaseline = 'bottom';
        if (rightAlign) {
            const tw = ctx.measureText(label).width;
            ctx.fillText(label, x + w - tw, y - 3);
        } else {
            ctx.fillText(label, x, y - 3);
        }
        ctx.textBaseline = 'top';
    }

    function drawEnd(ctx, g) {
        let title, col;
        if (g.phase === 'won') { title = 'YOU WIN'; col = COL.YL; }
        else if (g.phase === 'lost') { title = 'YOU LOSE'; col = COL.RD; }
        else { title = 'DRAW'; col = COL.GY; }

        ctx.textBaseline = 'top';
        ctx.font = "26px 'BonusStagePixel', monospace";
        ctx.fillStyle = col;
        const tw = ctx.measureText(title).width;
        ctx.fillText(title, SW / 2 - tw / 2, SH / 2 - 70);

        ctx.font = "13px 'BonusStagePixel', monospace";
        ctx.fillStyle = COL.GY;
        const h = 'ENTER = Rematch    ESC = Quit';
        const hw = ctx.measureText(h).width;
        ctx.fillText(h, SW / 2 - hw / 2, SH / 2 + 60);

        if (g.closeCountdown !== null) {
            const secs = Math.max(0, Math.ceil(g.closeCountdown));
            const c = `Closing in ${secs}...`;
            ctx.font = "12px 'BonusStagePixel', monospace";
            const cw = ctx.measureText(c).width;
            ctx.fillText(c, SW / 2 - cw / 2, SH / 2 + 84);
        }
    }

    // ---------------------------------------------------------------
    // MAIN LOOP
    // ---------------------------------------------------------------
    async function start(canvas) {
        stop();
        const ctx = canvas.getContext('2d');
        canvas.width = SW; canvas.height = SH;

        if (!assetsPromise) {
            assetsPromise = Promise.all([
                loadFighterAnims('reiffer'),
                loadFighterAnims('conmen'),
                loadArenaBackground(),
            ]);
        }
        const [reifferAnims, conmenAnims, bg] = await assetsPromise;
        const anims = { reiffer: reifferAnims, conmen: conmenAnims };

        const playerKey = document.body.classList.contains('conmen-mode') ? 'conmen' : 'reiffer';
        let g = newGame(anims, bg, playerKey);
        const shake = new Shake();
        const fx = [];

        keys = {};
        onKeyDown = (ev) => {
            keys[ev.key] = true;
            if (ev.key === 'Escape') { if (typeof window.closeFightGame === 'function') window.closeFightGame(); return; }
            if (g.phase !== 'playing' && ev.key === 'Enter') {
                g = newGame(anims, bg, playerKey);
            }
        };
        onKeyUp = (ev) => { keys[ev.key] = false; };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        let lastT = performance.now();
        function frame(now) {
            const dt = Math.min((now - lastT) / 1000, 0.05);
            lastT = now;
            const so = shake.off(); shake.update();

            if (g.phase === 'playing') {
                g.timer -= dt;
                const p = g.player, c = g.cpu;

                // --- player input ---
                const blockHeld = !!(keys['c'] || keys['C'] || keys['l'] || keys['L']);
                p.blocking = blockHeld && p.state !== 'punch_lo' && p.state !== 'kick_lo';
                if (p.blocking) {
                    p.state = 'block'; p.fr = 0;
                } else if (p.stop <= 0) {
                    const atk = p.state === 'punch_lo' || p.state === 'kick_lo';
                    if (!atk) {
                        p.vx = 0;
                        if (keys['ArrowLeft'] || keys['a'] || keys['A']) { p.vx = -P_SPD; p.facing = -1; p.state = 'walk'; }
                        else if (keys['ArrowRight'] || keys['d'] || keys['D']) { p.vx = P_SPD; p.facing = 1; p.state = 'walk'; }
                        else { p.state = 'idle'; }
                        p.x = Math.max(STAGE_MARGIN, Math.min(SW - STAGE_MARGIN - p._fw, p.x + p.vx));
                    }
                    const canStart = !atk || (p.canW && p.canT > 0);
                    if (canStart) {
                        if (keys['z'] || keys['Z'] || keys['j'] || keys['J']) p.beginAttack('punch_lo');
                        else if (keys['x'] || keys['X'] || keys['k'] || keys['K']) p.beginAttack('kick_lo');
                    }
                } else { p.stop--; }

                if (c.stop > 0) c.stop--; else updateCPU(dt, c, p);

                updateFighterCommon(dt, p);
                updateFighterCommon(dt, c);

                resolveHit(p, c, shake, fx);
                resolveHit(c, p, shake, fx);

                if (c.ko || p.ko) {
                    g.closeCountdown = AUTO_CLOSE_SECONDS;
                    if (c.ko && !p.ko) {
                        g.phase = 'won'; p.state = 'victory'; p.fr = 0; p.hurtT = 0;
                        c.state = 'defeat'; c.fr = 0; c.hurtT = 0;
                    } else if (p.ko && !c.ko) {
                        g.phase = 'lost'; c.state = 'victory'; c.fr = 0; c.hurtT = 0;
                        p.state = 'defeat'; p.fr = 0; p.hurtT = 0;
                    } else {
                        g.phase = 'draw';
                    }
                } else if (g.timer <= 0) {
                    g.timer = 0;
                    g.closeCountdown = AUTO_CLOSE_SECONDS;
                    if (p.hp > c.hp) { g.phase = 'won'; p.state = 'victory'; c.state = 'defeat'; }
                    else if (c.hp > p.hp) { g.phase = 'lost'; c.state = 'victory'; p.state = 'defeat'; }
                    else { g.phase = 'draw'; }
                    p.fr = 0; c.fr = 0; p.hurtT = 0; c.hurtT = 0;
                }
            } else {
                // Play victory/defeat once then freeze, same approach as the Bonus Stage
                const winner = g.phase === 'won' ? g.player : (g.phase === 'lost' ? g.cpu : null);
                const loser = g.phase === 'won' ? g.cpu : (g.phase === 'lost' ? g.player : null);
                if (winner) {
                    winner.frT += dt;
                    if (winner.frT >= 1 / VICTORY_FPS) { winner.frT = 0; const n = (winner.anims.victory || [null]).length; winner.fr = (winner.fr + 1) % Math.max(1, n); }
                }
                if (loser) {
                    const n = (loser.anims.defeat && loser.anims.defeat.length) || 1;
                    if (loser.fr < n - 1) {
                        loser.frT += dt;
                        if (loser.frT >= 1 / DEFEAT_FPS) { loser.frT = 0; loser.fr = Math.min(n - 1, loser.fr + 1); }
                    }
                }
                if (g.closeCountdown !== null) {
                    g.closeCountdown -= dt;
                    if (g.closeCountdown <= 0) {
                        if (typeof window.closeFightGame === 'function') window.closeFightGame();
                        return;
                    }
                }
            }

            // --- draw ---
            if (g.bg) ctx.drawImage(g.bg, Math.round(so[0]), Math.round(so[1]));
            else { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, SW, SH); }

            for (let i = fx.length - 1; i >= 0; i--) {
                const s = fx[i]; s.l--;
                if (s.l <= 0) { fx.splice(i, 1); continue; }
                const t = 1 - s.l / s.ml;
                ctx.fillStyle = s.heavy ? COL.OR : COL.YL;
                ctx.globalAlpha = Math.max(0, 1 - t);
                ctx.beginPath();
                ctx.arc(s.x + so[0], s.y + so[1], 10 + t * 14, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            g.player.draw(ctx, so);
            g.cpu.draw(ctx, so);
            drawHUD(ctx, g);
            if (g.phase !== 'playing') drawEnd(ctx, g);

            const leg = '←→/AD Move   Z/J Punch   X/K Kick   Hold C/L Block   ESC Quit';
            ctx.font = "10px 'BonusStagePixel', monospace";
            ctx.fillStyle = '#aaaaaa';
            ctx.textAlign = 'center';
            ctx.fillText(leg, SW / 2, SH - 16);
            ctx.textAlign = 'left';

            rafId = requestAnimationFrame(frame);
        }
        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
        if (onKeyUp) window.removeEventListener('keyup', onKeyUp);
        onKeyDown = onKeyUp = null;
    }

    return { start, stop };
})();
