/* ============================================================
   BONUS STAGE: DESTROY THE FRY MACHINE! - web port
   ============================================================
   Ported from the standalone Python/Pygame version (bonus_stage.py).
   Every constant, formula, and behavior here is a direct translation -
   the two should stay in sync if either one changes.

   Usage: BonusStage.start(canvasEl) to begin, BonusStage.stop() to
   fully tear down (cancels the loop and removes input listeners - safe
   to call even if never started).
   ============================================================ */
window.BonusStage = (function () {
    'use strict';

    // ---------------------------------------------------------------
    // CONSTANTS (matches bonus_stage.py exactly)
    // ---------------------------------------------------------------
    const SW = 960, SH = 540;
    const GROUND = 410;

    const P_H = 220;
    const FM_CX = 475;
    const FM_DW = 295;
    const FM_DH = 185;
    const FM_Y_PUSH = 0;
    const FM_HP = 5200;
    // The last damage-state image is deliberately a tiny sliver of the HP
    // bar - just a couple of hits from "critical" to destroyed, not an
    // even 1/6th share like the rest. Everything else splits the
    // remaining HP evenly. Keep this in sync with bonus_stage.py.
    const FM_FINAL_TIER_HP = 130;
    const ROUND_T = 45.0;

    const P_SPD = 5.2;
    const P_Y = GROUND - P_H;

    const LEFT_WALL_X = [0, 300];
    const RIGHT_WALL_X = [650, 830];
    const WALL_COLLIDE_W = 95;

    const DMG = { punch_lo: 55, kick_lo: 85 };
    const ATK_DUR = { punch_lo: 0.26, kick_lo: 0.32 };
    const HEAVY = new Set(['kick_lo']);
    const HS_LT = 5, HS_HV = 9;
    const HITSTUN = 0.15;
    const CANCEL_W = 0.18;
    const BUF_WIN = 0.13;

    const WIN_CASH_REWARD = 2500;  // real Shitcore account cash awarded on winning, via window.addCash()
    // in-game SCORE now mirrors live progress toward that same $2500 -
    // no more open-ended point piling, it's capped here to match
    const VICTORY_FPS = 8;
    const DEFEAT_FPS = 7;
    const AUTO_CLOSE_SECONDS = 3.0;

    const PLAYER_MAX_HP = 100;
    const SELF_DMG = [0, 1];
    const DEBRIS_HIT_CHANCE = 0.10;
    const DEBRIS_DMG_LIGHT = [2, 6];
    const DEBRIS_DMG_HEAVY = [14, 25];
    const HEAVY_BASE = 0.08;
    const HEAVY_PER_STREAK = 0.018;
    const HEAVY_CAP = 0.35;
    const STREAK_RESET_T = 1.3;
    const HURT_FLASH_T = 0.3;

    const COL = {
        W: '#ffffff', RD: '#dc1e1e', OR: '#ff8c00', YL: '#ffd700',
        GN: '#1ec846', GY: '#787878', DK: '#323232', LG: '#c8c8c8',
    };

    const ASSET_BASE = 'assets/bonus_stage/';

    const ANIM_FILES = {
        walk: ['reiffer_walk.webp', 6],
        victory: ['reiffer_victory.webp', 6],
        punch_lo: ['reiffer_punch_lo.webp', 3], // was 6 - sheet got re-cropped to 3 frames at some point, this just never got updated to match (fightgame.js already had it right)
        kick_lo: ['reiffer_kick_lo.webp', 3],   // was 4 - same story
        hurt: ['hit.webp', 1],
        defeat: ['midevils_defeat.webp?v=3', 3],
    };
    // Conmen holders get their own character - same animation states, own
    // art and frame counts (this set has fewer frames per animation, which
    // is fine, loadStrip just divides each strip's width by its own count).
    const CONMEN_ANIM_FILES = {
        walk: ['conmen_walk.webp', 4],
        victory: ['conmen_victory.webp', 4],
        punch_lo: ['conmen_punch_lo.webp', 3],
        kick_lo: ['conmen_kick_lo.webp', 3],
        hurt: ['conmen_hit.webp', 1],
        defeat: ['conmen_defeat.webp?v=2', 4],
    };
    const FRYER_FILES = ['tier_01.webp','tier_02.webp','tier_03.webp','tier_04.webp','tier_05.webp','tier_06.webp'];
    const DEBRIS_FILES = ['debris_1.webp','debris_2.webp','debris_3.webp','debris_4.webp','debris_5.webp','debris_6.webp','debris_7.webp','debris_8.webp','debris_9.webp','debris_10.webp','debris_11.webp','debris_12.webp'];
    const SPARK_FILES = ['spark_1.webp','spark_2.webp','spark_3.webp','spark_4.webp','spark_5.webp','spark_6.webp'];

    // ---------------------------------------------------------------
    // small helpers (JS equivalents of Python's random module)
    // ---------------------------------------------------------------
    function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); } // inclusive both ends, like random.randint
    function randUniform(a, b) { return a + Math.random() * (b - a); }
    function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('failed to load ' + src));
            img.src = src;
        });
    }

    // Slices a horizontal sprite strip into `frameCount` equal frames, each
    // scaled (whole-cell, not cropped) to display height outH - mirrors
    // load_strip() in the Python version exactly, including the "scale the
    // whole cell so feet line up automatically" reasoning.
    async function loadStrip(fname, frameCount, outH) {
        let img;
        try { img = await loadImage(ASSET_BASE + fname); }
        catch (e) { console.warn('[bonusstage] missing sprite', fname, e); return []; }
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

    async function loadReifferAnims() {
        const isConmen = document.body.classList.contains('conmen-mode');
        const files = isConmen ? CONMEN_ANIM_FILES : ANIM_FILES;
        const anims = {};
        for (const state in files) {
            const [fname, count] = files[state];
            anims[state] = await loadStrip(fname, count, P_H);
        }
        anims.idle = anims.walk.length ? [anims.walk[0]] : [];
        return anims;
    }

    // Loads every fry-machine tier, pre-scaled (aspect preserved, fit inside
    // FM_DW x FM_DH) exactly once at load time - mirrors load_fryer().
    async function loadFryer() {
        const imgs = [];
        for (const fname of FRYER_FILES) {
            let img;
            try { img = await loadImage(ASSET_BASE + 'fry_machine/' + fname); }
            catch (e) { continue; }
            const scale = Math.min(FM_DW / img.width, FM_DH / img.height);
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, 0, 0, w, h);
            imgs.push(c);
        }
        return imgs;
    }

    async function loadFxSet(files, folder) {
        const imgs = [];
        for (const fname of files) {
            try { imgs.push(await loadImage(ASSET_BASE + (folder ? folder + '/' : '') + fname)); }
            catch (e) { /* fine if missing, fx are decorative */ }
        }
        return imgs;
    }

    async function loadBackground() {
        let img;
        try { img = await loadImage(ASSET_BASE + 'mcdonalds_background.webp'); }
        catch (e) { return null; }
        const kitchenH = Math.floor(img.height * 0.73);
        const c = document.createElement('canvas');
        c.width = SW; c.height = SH;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, img.width, kitchenH, 0, 0, SW, SH);
        return c;
    }

    // ---------------------------------------------------------------
    // INPUT BUFFER - direct port of IBuf
    // ---------------------------------------------------------------
    class IBuf {
        constructor() { this.q = []; }
        push(a) { this.q.push([a, performance.now() / 1000]); }
        pop(a) {
            const now = performance.now() / 1000;
            const nq = []; let found = false;
            for (const [act, t] of this.q) {
                if (now - t > BUF_WIN) continue;
                if (act === a && !found) found = true;
                else nq.push([act, t]);
            }
            this.q = nq;
            return found;
        }
        flush() {
            const now = performance.now() / 1000;
            this.q = this.q.filter(([, t]) => now - t <= BUF_WIN);
        }
    }

    // ---------------------------------------------------------------
    // SCREEN SHAKE - direct port
    // ---------------------------------------------------------------
    class Shake {
        constructor() { this.v = 0.0; }
        hit(a) { this.v = Math.max(this.v, a); }
        update() { this.v *= 0.74; if (this.v < 0.4) this.v = 0.0; }
        off() {
            if (this.v < 0.4) return [0, 0];
            return [randUniform(-this.v, this.v), randUniform(-this.v * 0.45, this.v * 0.45)];
        }
    }

    // ---------------------------------------------------------------
    // DEBRIS + SPARK BURST - direct port
    // ---------------------------------------------------------------
    class Debris {
        constructor(x, y, img, heavy) {
            this.x = x; this.y = y; this.img = img;
            const spd = randUniform(3.5, 7.5) * (heavy ? 1.4 : 1.0);
            const ang = randUniform(-2.5, -0.6);
            this.vx = Math.cos(ang) * spd * choice([-1, 1]);
            this.vy = Math.sin(ang) * spd;
            this.rot = randUniform(0, 360);
            this.rotSpd = randUniform(-360, 360);
            this.life = randUniform(0.5, 0.9);
            this.age = 0.0;
        }
        update(dt) {
            this.age += dt;
            if (this.age >= this.life) return false;
            this.vy += 22 * dt;
            this.x += this.vx; this.y += this.vy;
            this.rot += this.rotSpd * dt;
            return true;
        }
        draw(ctx, ox, oy) {
            const t = 1.0 - this.age / this.life;
            ctx.save();
            ctx.globalAlpha = t < 0.35 ? Math.max(0, t / 0.35) : 1.0;
            ctx.translate(this.x + ox, this.y + oy);
            ctx.rotate(this.rot * Math.PI / 180);
            ctx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);
            ctx.restore();
        }
    }

    class SparkBurst {
        constructor(x, y, img, heavy) {
            this.x = x; this.y = y; this.img = img;
            this.life = heavy ? 0.22 : 0.14;
            this.age = 0.0;
            this.scale = heavy ? 1.3 : 1.0;
        }
        update(dt) { this.age += dt; return this.age < this.life; }
        draw(ctx, ox, oy) {
            const t = 1.0 - this.age / this.life;
            const w = this.img.width * this.scale, h = this.img.height * this.scale;
            ctx.save();
            ctx.globalAlpha = Math.max(0, t);
            ctx.drawImage(this.img, this.x + ox - w / 2, this.y + oy - h / 2, w, h);
            ctx.restore();
        }
    }

    function spawnHitFx(fx, x, y, heavy, debrisImgs, sparkImgs) {
        if (sparkImgs.length) fx.push(new SparkBurst(x, y, choice(sparkImgs), heavy));
        if (debrisImgs.length) {
            const n = heavy ? randInt(2, 4) : randInt(1, 2);
            for (let i = 0; i < n; i++) fx.push(new Debris(x, y, choice(debrisImgs), heavy));
        }
    }

    // ---------------------------------------------------------------
    // FRY MACHINE - direct port
    // ---------------------------------------------------------------
    class FryMachine {
        constructor(imgs) {
            this.imgs = imgs; this.hp = FM_HP;
            this.x = FM_CX - Math.floor(FM_DW / 2);
            this.y = GROUND - FM_DH + FM_Y_PUSH;
            this.dead = false;
            this.stun = 0.0; this.flash = 0.0;
            this.flashX = FM_CX; this.flashY = this.y + FM_DH / 2;  // where the glow renders - set per-hit in hit()
            this.shkT = 0.0; this.shkA = 0.0; this.shkX = 0;
        }
        rect() { return { x: this.x, y: this.y, w: FM_DW, h: FM_DH }; }
        idx() {
            const n = this.imgs.length;
            if (n === 0) return 0;
            if (n === 1) return 0;
            const finalHp = Math.min(FM_FINAL_TIER_HP, FM_HP - 1);
            const otherTiers = n - 1;
            const chunk = (FM_HP - finalHp) / otherTiers;
            if (this.hp <= finalHp) return n - 1;
            const i = Math.floor((FM_HP - this.hp) / chunk);
            return Math.min(i, n - 2);
        }
        hit(dmg, heavy, hitX, hitY) {
            if (this.stun > 0 || this.dead) return false;
            this.hp = Math.max(0, this.hp - dmg);
            this.stun = HITSTUN; this.flash = 0.10;
            if (hitX !== undefined) this.flashX = hitX;
            if (hitY !== undefined) this.flashY = hitY;
            this.shkT = heavy ? 0.17 : 0.08;
            this.shkA = heavy ? 10.0 : 5.0;
            if (this.hp === 0) this.dead = true;
            return true;
        }
        update(dt) {
            this.stun = Math.max(0.0, this.stun - dt);
            this.flash = Math.max(0.0, this.flash - dt);
            if (this.shkT > 0) { this.shkT -= dt; this.shkX = randUniform(-this.shkA, this.shkA); }
            else this.shkX = 0;
        }
        draw(ctx, so) {
            const img = this.imgs.length && this.idx() < this.imgs.length ? this.imgs[this.idx()] : null;
            if (img) {
                const iw = img.width, ih = img.height;
                const ox = Math.round(this.x + this.shkX + so[0] + (FM_DW - iw) / 2);
                const oy = Math.round(this.y + so[1] + (FM_DH - ih));
                ctx.drawImage(img, ox, oy);
            }
            if (this.flash > 0) {
                // small glow right at the point of impact instead of
                // lighting up the whole machine
                const t = Math.min(1, this.flash / 0.10);
                const fx = this.flashX + so[0], fy = this.flashY + so[1];
                const r = 50;
                ctx.save();
                const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
                grad.addColorStop(0, `rgba(255,255,255,${0.85 * t})`);
                grad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(fx, fy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }

    // ---------------------------------------------------------------
    // PLAYER - direct port
    // ---------------------------------------------------------------
    class Player {
        constructor(anims) {
            this.anims = anims; this.fw = 95;
            this.x = 312.0; this.y = P_Y;
            this.vx = 0.0; this.facing = 1;
            this.state = 'idle'; this.fr = 0; this.frT = 0.0;
            this.atkT = 0.0; this.atkDur = 0.0;
            this.hitReg = false; this.canW = false; this.canT = 0.0;
            this.stop = 0;
            this.ib = new IBuf();
            this.hp = PLAYER_MAX_HP;
            this.hurtT = 0.0;
            this.streak = 0; this.streakT = 0.0;
        }
        _surf() {
            if (this.hurtT > 0) {
                const hf = this.anims.hurt;
                if (hf && hf.length) return hf[0];
            }
            const frames = this.anims[this.state] && this.anims[this.state].length ? this.anims[this.state] : this.anims.idle;
            if (!frames || !frames.length) return null;
            const s = frames[this.fr % frames.length];
            if (s && s.width !== this.fw) this.fw = s.width;
            return s;
        }
        _adv(dt, fps) {
            this.frT += dt;
            if (this.frT >= 1 / fps) {
                this.frT = 0.0;
                const n = (this.anims[this.state] || [null]).length;
                this.fr = (this.fr + 1) % Math.max(1, n);
            }
        }
        _hb() {
            const fw = this.fw;
            if (this.state === 'punch_lo' && !this.hitReg) {
                const ex = this.facing === 1 ? this.x + fw + 8 : this.x - 50;
                return { x: ex, y: this.y + 180, w: 46, h: 32 };
            }
            if (this.state === 'kick_lo' && !this.hitReg) {
                const ex = this.facing === 1 ? this.x + fw + 6 : this.x - 52;
                return { x: ex, y: this.y + 195, w: 54, h: 28 };
            }
            return null;
        }
        _wallBlocks(x) {
            const w = WALL_COLLIDE_W;
            for (const [wx0, wx1] of [LEFT_WALL_X, RIGHT_WALL_X]) {
                if (x < wx1 && x + w > wx0) return true;
            }
            return false;
        }
        _begin(kind) {
            this.state = kind; this.atkT = 0.0;
            this.hitReg = false; this.canW = false; this.canT = 0.0;
            this.fr = 0; this.frT = 0.0; this.atkDur = ATK_DUR[kind] || 0.28;
        }
        update(dt, keys, fm, fx, shake, scoreRef, debrisImgs, sparkImgs) {
            if (this.hurtT > 0) this.hurtT = Math.max(0.0, this.hurtT - dt);
            if (this.streakT > 0) { this.streakT -= dt; if (this.streakT <= 0) this.streak = 0; }
            if (this.stop > 0) { this.stop -= 1; return; }
            this.ib.flush();
            const atk = this.state === 'punch_lo' || this.state === 'kick_lo';
            if (!atk) {
                this.vx = 0.0;
                let moving = false;
                if (keys.left) { this.vx = -P_SPD; this.facing = -1; moving = true; }
                else if (keys.right) { this.vx = P_SPD; this.facing = 1; moving = true; }
                this.state = moving ? 'walk' : 'idle';

                let newX = this.x + this.vx;
                newX = Math.max(0.0, Math.min(newX, SW - this.fw));
                if (!this._wallBlocks(newX)) this.x = newX;
            }
            const canStart = !atk || (this.canW && this.canT > 0);
            if (canStart) {
                if (this.ib.pop('punch_lo')) this._begin('punch_lo');
                else if (this.ib.pop('kick_lo')) this._begin('kick_lo');
            }
            if (atk) {
                this.atkT += dt;
                if (this.canT > 0) this.canT -= dt;
                if (!this.canW && this.atkT >= this.atkDur * 0.4) { this.canW = true; this.canT = CANCEL_W; }
                const hb = this._hb();
                if (hb && !this.hitReg && rectsOverlap(hb, fm.rect())) {
                    const heavy = HEAVY.has(this.state);
                    const cx = hb.x + hb.w / 2 + randInt(-8, 8);
                    const cy = hb.y + hb.h / 2 + randInt(-8, 8);
                    if (fm.hit(DMG[this.state] || 55, heavy, cx, cy)) {
                        this.hitReg = true;
                        this.stop = heavy ? HS_HV : HS_LT;
                        fm.stun = this.stop / 60;
                        shake.hit(heavy ? 8.0 : 3.8);
                        spawnHitFx(fx, cx, cy, heavy, debrisImgs || [], sparkImgs || []);
                        if (typeof playSfxFile === 'function') {
                            playSfxFile(fm.dead ? 'assets/sfx/bonusstage/metal_punch_finisher.mp3' : 'assets/sfx/bonusstage/metal_punch.mp3', fm.dead ? 0.7 : 0.55);
                        }
                        this.hp = Math.max(0, this.hp - randInt(SELF_DMG[0], SELF_DMG[1]));
                        this.streak += 1; this.streakT = STREAK_RESET_T;
                        if (Math.random() < DEBRIS_HIT_CHANCE) {
                            const heavyChance = Math.min(HEAVY_BASE + this.streak * HEAVY_PER_STREAK, HEAVY_CAP);
                            let dmg;
                            if (Math.random() < heavyChance) dmg = randInt(DEBRIS_DMG_HEAVY[0], DEBRIS_DMG_HEAVY[1]);
                            else dmg = randInt(DEBRIS_DMG_LIGHT[0], DEBRIS_DMG_LIGHT[1]);
                            this.hp = Math.max(0, this.hp - dmg);
                            this.hurtT = HURT_FLASH_T;
                            if (typeof playSfxRandom === 'function') {
                                playSfxRandom(['assets/sfx/fight/hit_body_small.mp3', 'assets/sfx/fight/hit_body_large.mp3', 'assets/sfx/fight/hit_face_large.mp3'], 0.5);
                            }
                            shake.hit(5.0);
                        }
                    }
                }
                if (this.atkT >= this.atkDur) {
                    this.state = 'idle';
                    this.atkT = 0.0; this.canW = false; this.fr = 0;
                }
            }
            const fpsMap = { idle: 5, walk: 10, punch_lo: 16, kick_lo: 14 };
            this._adv(dt, fpsMap[this.state] || 8);
        }
        draw(ctx, so) {
            const img = this._surf();
            const sx = Math.round(this.x + so[0]), sy = Math.round(this.y + so[1]);
            if (img) {
                if (this.facing === -1) {
                    ctx.save();
                    ctx.translate(sx + img.width, sy);
                    ctx.scale(-1, 1);
                    ctx.drawImage(img, 0, 0);
                    ctx.restore();
                } else {
                    ctx.drawImage(img, sx, sy);
                }
            }
        }
    }

    // ---------------------------------------------------------------
    // HUD + END SCREENS - direct port
    // ---------------------------------------------------------------
    function drawHud(ctx, score, t, playerHp, fmHp, fmMaxHp) {
        ctx.textBaseline = 'top';
        ctx.font = "24px 'BonusStagePixel', monospace";
        ctx.fillStyle = COL.YL;
        ctx.fillText(`SCORE  $${score}`, 22, 10);

        const sec = Math.max(0, Math.ceil(t));
        const secStr = String(sec).padStart(2, '0');
        ctx.font = "24px 'BonusStagePixel', monospace";
        ctx.fillStyle = sec <= 9 ? COL.RD : COL.W;
        const secW = ctx.measureText(secStr).width;
        ctx.fillText(secStr, SW / 2 - secW / 2, 8);

        ctx.font = "14px 'BonusStagePixel', monospace";
        ctx.fillStyle = COL.LG;
        const lblW = ctx.measureText('TIME').width;
        ctx.fillText('TIME', SW / 2 - lblW / 2, 52);

        const bw = 170, bh = 13;
        const bx = SW - 22 - bw, by = 14;
        ctx.fillStyle = COL.LG;
        const youW = ctx.measureText('YOU').width;
        ctx.fillText('YOU', bx - youW - 8, by - 1);
        drawBar(ctx, bx, by, bw, bh, Math.max(0, playerHp / PLAYER_MAX_HP));

        const by2 = by + bh + 8;
        const friesW = ctx.measureText('FRIES').width;
        ctx.fillStyle = COL.LG;
        ctx.fillText('FRIES', bx - friesW - 8, by2 - 1);
        drawBar(ctx, bx, by2, bw, bh, Math.max(0, fmHp / fmMaxHp));
    }

    function drawBar(ctx, bx, by, bw, bh, rat) {
        ctx.fillStyle = COL.DK;
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = rat > 0.5 ? COL.GN : (rat > 0.25 ? COL.OR : COL.RD);
        ctx.fillRect(bx, by, bw * rat, bh);
        ctx.strokeStyle = COL.W; ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);
    }

    function drawEnd(ctx, won, score, reason, closeCountdown) {
        let title, col;
        if (won) { title = 'BONUS CLEAR!!'; col = COL.YL; }
        else if (reason === 'ko') { title = "KO'd BY THE FRYER"; col = COL.RD; }
        else { title = 'TIME OVER'; col = COL.RD; }

        ctx.textBaseline = 'top';
        ctx.font = "24px 'BonusStagePixel', monospace";
        ctx.fillStyle = col;
        const t1w = ctx.measureText(title).width;
        ctx.fillText(title, SW / 2 - t1w / 2, SH / 2 - 72);

        ctx.font = "14px 'BonusStagePixel', monospace";
        const t2 = won ? `BONUS  +$${WIN_CASH_REWARD.toLocaleString()}` : `SCORE  $${score}`;
        ctx.fillStyle = won ? COL.OR : COL.LG;
        const t2w = ctx.measureText(t2).width;
        ctx.fillText(t2, SW / 2 - t2w / 2, SH / 2 + 10);

        ctx.font = "14px 'BonusStagePixel', monospace";
        ctx.fillStyle = COL.GY;
        const h = 'ENTER = Replay    ESC = Quit';
        const hw = ctx.measureText(h).width;
        ctx.fillText(h, SW / 2 - hw / 2, SH / 2 + 76);

        if (closeCountdown !== null && closeCountdown !== undefined) {
            ctx.font = "12px 'BonusStagePixel', monospace";
            ctx.fillStyle = COL.GY;
            const secs = Math.max(0, Math.ceil(closeCountdown));
            const c = `Closing in ${secs}...`;
            const cw = ctx.measureText(c).width;
            ctx.fillText(c, SW / 2 - cw / 2, SH / 2 + 100);
        }
    }

    function drawFallbackBg(ctx) {
        ctx.fillStyle = '#504636';
        ctx.fillRect(0, 0, SW, SH);
        for (let tx = 0; tx < SW; tx += 64) {
            for (let ty = GROUND; ty < SH; ty += 64) {
                ctx.fillStyle = ((tx / 64 + ty / 64) % 2 === 0) ? '#5a5044' : '#64584a';
                ctx.fillRect(tx, ty, 64, 64);
            }
        }
        ctx.strokeStyle = '#3c3024'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(SW, GROUND); ctx.stroke();
        ctx.fillStyle = '#736454';
        ctx.fillRect(0, 0, SW, GROUND);
    }

    // ---------------------------------------------------------------
    // MAIN GAME - owns the loop, input, and lifecycle
    // ---------------------------------------------------------------
    let rafId = null;
    let keydownHandler = null;
    let assetsPromise = null;
    let reifferAnimsPromise = null;
    let conmenAnimsPromise = null;

    function newGame(reifferAnims, fryerImgs) {
        return {
            player: new Player(reifferAnims),
            fm: new FryMachine(fryerImgs),
            timer: ROUND_T,
            score: { value: 0 },
            phase: 'playing',
            fx: [],
            reason: null,
            rewardGiven: false,
            closeCountdown: null, // set to AUTO_CLOSE_SECONDS the instant the round ends (won or lost)
        };
    }

    let themeMusic = null;
    function getThemeMusic() {
        if (typeof Audio === 'undefined') return null;
        if (!themeMusic) {
            themeMusic = new Audio('assets/bonus_stage/fry-bonus-game-theme.mp3');
            themeMusic.loop = true;
            themeMusic.volume = 0.5;
        }
        return themeMusic;
    }

    async function start(canvas) {
        if (typeof _refreshMiniGameAudioButtons === 'function') _refreshMiniGameAudioButtons(); // reflect whatever music/SFX state carried over from a previous session
        stop(); // safety: never run two loops at once

        const ctx = canvas.getContext('2d');
        canvas.width = SW; canvas.height = SH;

        const music = getThemeMusic();
        if (music) {
            if (typeof setActiveMiniGameMusicEl === 'function') setActiveMiniGameMusicEl(music);
            music.currentTime = 0;
            // Always starts (ignores the main site's music toggle on purpose,
            // same as Fight Game) unless the in-game music button has been
            // switched off - see js/audio.js's miniGameMusicMuted.
            if (typeof isMiniGameMusicMuted !== 'function' || !isMiniGameMusicMuted()) {
                music.play().catch(() => {}); // browsers can block autoplay w/ sound until a user gesture - fine, it just won't play silently instead of throwing
            }
        }

        if (!assetsPromise) {
            assetsPromise = Promise.all([
                loadBackground(),
                loadFryer(),
                loadFxSet(DEBRIS_FILES, 'fx'),
                loadFxSet(SPARK_FILES, 'fx'),
            ]);
        }
        // Character art is cached separately, keyed by theme - loadBackground/
        // loadFryer/loadFxSet never change, but which wallet (and therefore
        // which cosmetic theme) is connected can change between plays, so this
        // can't be folded into the assetsPromise cache above without serving
        // stale art after a wallet switch.
        const isConmen = document.body.classList.contains('conmen-mode');
        let characterAnimsPromise;
        if (isConmen) {
            if (!conmenAnimsPromise) conmenAnimsPromise = loadReifferAnims();
            characterAnimsPromise = conmenAnimsPromise;
        } else {
            if (!reifferAnimsPromise) reifferAnimsPromise = loadReifferAnims();
            characterAnimsPromise = reifferAnimsPromise;
        }

        const [[bg, fryerImgs, debrisImgs, sparkImgs], reifferAnims] = await Promise.all([assetsPromise, characterAnimsPromise]);

        const shakeObj = new Shake();
        let g = newGame(reifferAnims, fryerImgs);

        const keys = { left: false, right: false };
        keydownHandler = (ev) => {
            const k = ev.key;
            if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true;
            if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true;
            if (g.phase === 'playing') {
                if (k === 'z' || k === 'Z' || k === 'j' || k === 'J') g.player.ib.push('punch_lo');
                else if (k === 'x' || k === 'X' || k === 'k' || k === 'K') g.player.ib.push('kick_lo');
            } else if (g.phase === 'won' || g.phase === 'lost') {
                if (k === 'Enter') { g = newGame(reifferAnims, fryerImgs); }
            }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) ev.preventDefault();
        };
        const keyupHandler = (ev) => {
            const k = ev.key;
            if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
            if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
        };
        window.addEventListener('keydown', keydownHandler);
        window.addEventListener('keyup', keyupHandler);
        keydownHandler._keyupPair = keyupHandler; // stash so stop() can remove it too

        /* ---------------- TOUCH CONTROLS ----------------
           Same approach as the fight game's pad: the buttons drive the very
           same `keys` object and input buffer the keyboard does, so there is
           no parallel input path that could drift out of step.

           The fryer needs far less than a fighter - it only walks left and
           right and throws two attacks - so this is a two-button row plus
           two action buttons rather than a full d-pad.

           Restarting after a win or loss is a TAP ON THE CANVAS rather than
           another button. On a keyboard that is ENTER, and there is no
           on-screen equivalent worth dedicating a button to for something
           you press once at the end of a round. */
        bindBonusTouchPad({
            press: (name, on) => {
                if (name === 'left') keys.left = on;
                else if (name === 'right') keys.right = on;
                else if (on && g.phase === 'playing') {
                    g.player.ib.push(name === 'punch' ? 'punch_lo' : 'kick_lo');
                }
            },
            tapCanvas: () => {
                if (g.phase === 'won' || g.phase === 'lost') g = newGame(reifferAnims, fryerImgs);
            },
        });

        let last = performance.now();
        function frame(now) {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            const so = shakeObj.off(); shakeObj.update();

            if (g.phase === 'playing') {
                g.timer -= dt;
                g.player.update(dt, keys, g.fm, g.fx, shakeObj, g.score, debrisImgs, sparkImgs);
                g.fm.update(dt);
                // Mutates g.fx in place instead of g.fx.filter(...) - the
                // filter version allocated a brand new array every single
                // frame during play, which fightgame.js's equivalent
                // particle loop never did. Reverse iteration is required
                // here so splicing an index doesn't shift the ones still
                // left to check.
                for (let i = g.fx.length - 1; i >= 0; i--) {
                    if (!g.fx[i].update(dt)) g.fx.splice(i, 1);
                }
                g.score.value = Math.round(WIN_CASH_REWARD * (1.0 - g.fm.hp / FM_HP));
                if (g.fm.dead) {
                    shakeObj.hit(22); g.phase = 'won';
                    g.player.state = 'victory'; g.player.fr = 0; g.player.frT = 0.0;
                    g.player.hurtT = 0.0;  // don't let a lingering hurt-flash mask the victory pose
                    g.fm.flash = 0.0; g.fm.shkT = 0.0; g.fm.shkX = 0;  // fm.update() stops running once won - freeze it clean, not mid-flash
                    g.closeCountdown = AUTO_CLOSE_SECONDS;
                    if (!g.rewardGiven) {
                        g.rewardGiven = true;
                        if (typeof window.addCash === 'function') {
                            window.addCash(WIN_CASH_REWARD);
                            if (typeof window.updateUI === 'function') window.updateUI();
                            if (typeof window.showToast === 'function') {
                                window.showToast(`Bonus Stage cleared! +$${WIN_CASH_REWARD.toLocaleString()} added to your account.`, 'success');
                            }
                        } else {
                            console.warn('[bonusstage] window.addCash() not found - main game cash was not credited');
                        }
                    }
                } else if (g.player.hp <= 0) {
                    g.phase = 'lost'; g.reason = 'ko';
                    g.player.state = 'defeat'; g.player.fr = 0; g.player.frT = 0.0;
                    g.player.hurtT = 0.0;  // don't let a lingering hurt-flash mask the defeat pose
                    g.fm.flash = 0.0; g.fm.shkT = 0.0; g.fm.shkX = 0;
                    g.closeCountdown = AUTO_CLOSE_SECONDS;
                } else if (g.timer <= 0) {
                    g.timer = 0.0; g.phase = 'lost'; g.reason = 'time';
                    g.player.state = 'defeat'; g.player.fr = 0; g.player.frT = 0.0;
                    g.player.hurtT = 0.0;
                    g.closeCountdown = AUTO_CLOSE_SECONDS;
                    g.fm.flash = 0.0; g.fm.shkT = 0.0; g.fm.shkX = 0;
                }
            } else if (g.phase === 'won') {
                g.player._adv(dt, VICTORY_FPS);
            } else if (g.phase === 'lost') {
                // Play through once and freeze on the last (down-for-the-count)
                // frame, rather than looping like victory does - a defeat
                // animation that repeats forever looks like he keeps getting
                // back up and falling again. Both Mid Evils and Conmen have
                // their own defeat set now; the (|| 1) fallback just protects
                // against any future character that doesn't.
                const defeatN = (g.player.anims.defeat && g.player.anims.defeat.length) || 1;
                if (g.player.fr < defeatN - 1) {
                    g.player.frT += dt;
                    if (g.player.frT >= 1 / DEFEAT_FPS) {
                        g.player.frT = 0.0;
                        g.player.fr = Math.min(defeatN - 1, g.player.fr + 1);
                    }
                }
            }

            if (g.phase === 'won' || g.phase === 'lost') {
                if (g.closeCountdown !== null) {
                    g.closeCountdown -= dt;
                    if (g.closeCountdown <= 0) {
                        if (typeof window.closeBonusStage === 'function') window.closeBonusStage();
                        return; // stop here - the canvas/overlay are already torn down by closeBonusStage()
                    }
                }
            }

            if (bg) ctx.drawImage(bg, Math.round(so[0]), Math.round(so[1]));
            else drawFallbackBg(ctx);

            g.fm.draw(ctx, so);
            g.player.draw(ctx, so);
            for (const e of g.fx) e.draw(ctx, so[0], so[1]);

            drawHud(ctx, g.score.value, g.timer, g.player.hp, g.fm.hp, FM_HP);
            if (g.phase === 'won' || g.phase === 'lost') drawEnd(ctx, g.phase === 'won', g.score.value, g.reason, g.closeCountdown);

            ctx.textBaseline = 'top';
            ctx.font = "9px 'BonusStagePixel', monospace";
            ctx.fillStyle = 'rgb(175,175,175)';
            const leg = 'Arrows/A D Move  Z/J Punch  X/K Kick';
            const legW = ctx.measureText(leg).width;
            ctx.fillText(leg, SW / 2 - legW / 2, SH - 22);

            rafId = requestAnimationFrame(frame);
        }
        rafId = requestAnimationFrame(frame);
    }

    let _btButtons = [];
    let _btCanvasTap = null;
    let _btReveal = null;

    function bindBonusTouchPad(handlers) {
        unbindBonusTouchPad();
        const pad = document.getElementById('bonusTouchPad');
        const canvas = document.getElementById('bonusStageCanvas');
        if (!pad) return;

        pad.querySelectorAll('[data-bonus-key]').forEach((el) => {
            const name = el.getAttribute('data-bonus-key');
            const onDown = (ev) => {
                ev.preventDefault();   // no scroll, no zoom, no synthetic click
                ev.stopPropagation();
                el.classList.add('ft-on');
                handlers.press(name, true);
            };
            // touchcancel matters as much as touchend: an incoming call or
            // the browser reclaiming the gesture fires cancel, and without
            // it a held direction would stay stuck on for the rest of the
            // round.
            const onUp = (ev) => {
                ev.preventDefault();
                el.classList.remove('ft-on');
                handlers.press(name, false);
            };
            el.addEventListener('touchstart', onDown, { passive: false });
            el.addEventListener('touchend', onUp, { passive: false });
            el.addEventListener('touchcancel', onUp, { passive: false });
            _btButtons.push({ el, onDown, onUp });
        });

        if (canvas) {
            _btCanvasTap = (ev) => { ev.preventDefault(); handlers.tapCanvas(); };
            canvas.addEventListener('touchstart', _btCanvasTap, { passive: false });
        }

        // Revealed by the first REAL touch, not by user-agent sniffing or an
        // 'ontouchstart' check - plenty of laptops report touch support
        // while the person is using a mouse.
        if (pad.classList.contains('hidden')) {
            _btReveal = () => {
                pad.classList.remove('hidden');
                window.removeEventListener('touchstart', _btReveal, true);
                _btReveal = null;
            };
            window.addEventListener('touchstart', _btReveal, true);
        }
    }

    function unbindBonusTouchPad() {
        _btButtons.forEach(({ el, onDown, onUp }) => {
            // The options object must match the one used to add these, or
            // the browser treats it as a different listener and never
            // removes it.
            el.removeEventListener('touchstart', onDown, { passive: false });
            el.removeEventListener('touchend', onUp, { passive: false });
            el.removeEventListener('touchcancel', onUp, { passive: false });
            el.classList.remove('ft-on');
        });
        _btButtons = [];
        const canvas = document.getElementById('bonusStageCanvas');
        if (canvas && _btCanvasTap) canvas.removeEventListener('touchstart', _btCanvasTap, { passive: false });
        _btCanvasTap = null;
        if (_btReveal) {
            window.removeEventListener('touchstart', _btReveal, true);
            _btReveal = null;
        }
    }

    function stop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (keydownHandler) {
            window.removeEventListener('keydown', keydownHandler);
            if (keydownHandler._keyupPair) window.removeEventListener('keyup', keydownHandler._keyupPair);
            keydownHandler = null;
        }
        unbindBonusTouchPad();
        if (themeMusic) { themeMusic.pause(); themeMusic.currentTime = 0; }
    }

    return {
        start, stop,
        // Exposed so the real classes/logic can be driven directly in
        // tests, instead of a separately hand-written re-implementation
        // that could silently drift from what actually ships (that exact
        // mistake happened once already in this project's Python version).
        _internal: {
            Player, FryMachine, IBuf, Shake, Debris, SparkBurst, spawnHitFx,
            rectsOverlap, randInt, randUniform, choice,
            loadReifferAnims, loadFryer, loadFxSet, loadBackground, loadStrip,
            newGame, drawHud, drawEnd, drawFallbackBg,
            constants: {
                SW, SH, GROUND, P_H, FM_CX, FM_DW, FM_DH, FM_Y_PUSH, FM_HP, FM_FINAL_TIER_HP, ROUND_T,
                P_SPD, P_Y, LEFT_WALL_X, RIGHT_WALL_X, WALL_COLLIDE_W,
                DMG, ATK_DUR, HEAVY, HS_LT, HS_HV, HITSTUN, CANCEL_W, BUF_WIN,
                VICTORY_FPS, DEFEAT_FPS, PLAYER_MAX_HP, SELF_DMG, DEBRIS_HIT_CHANCE, WIN_CASH_REWARD,
                DEBRIS_DMG_LIGHT, DEBRIS_DMG_HEAVY, HEAVY_BASE, HEAVY_PER_STREAK,
                HEAVY_CAP, STREAK_RESET_T, HURT_FLASH_T,
            },
        },
    };
})();
