/* ============================================================
   FIGHT GAME (TEST PLAY ONLY, FOR NOW)
   ============================================================
   Player 1 is human-controlled, Player 2 is a CPU opponent
   (see updateCPUInput() - medium difficulty: approaches, throws
   punches/kicks in range, reacts to your attacks with a chance
   to block. Feeds P2's decisions in as virtual key presses so it
   reuses updateHumanFighter()'s physics/attack/block logic
   instead of duplicating any of it).

   Player 1 - Arrow Keys + Z/X
     Left/Right move, Up jump, Down crouch, Z punch, X kick, Space block

   Block: hold the block key. While blocking:
     - you cannot attack (inputs are ignored, same as a real fighting
       game - blocking is purely defensive)
     - incoming hits are reduced by a random 60-90%, never fully
       negated and never full damage either

   Attacks require an actual key PRESS per hit - holding the key down
   does not auto-repeat the attack. You have to mash it.

   Jump/crouch/jump-attacks/crouch-attacks: Conmen has real art for jump,
   crouch, jump_punch, jump_kick, and crouch_kick now - only crouch_punch
   is still a placeholder for him. Mid Evils/Reiffer has none of these
   yet and uses placeholders for all six. Swap the relevant entry in
   FIGHTER_ANIM_FILES for a real loadStrip() source the moment new art
   exists; loadFighterAnims() only fills in a placeholder for whatever's
   still missing, so adding real art for one character/state at a time
   just works without touching anything else.

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
    const ROUND_T = 90.0;
    const STAGE_MARGIN = 40;

    const JUMP_VELOCITY = -560; // px/s
    const GRAVITY = 1400;       // px/s^2

    // Helicopter kick (Reiffer-specific, needs a 2+ frame jump_kick strip):
    // mashing kick again while already jump-kicking extends a reduced-
    // gravity spin instead of starting a new attack.
    const HELI_MAX_T = 2.2;          // hard cap on total float time, seconds
    const HELI_ADD_PER_MASH = 0.45;  // each mash press adds this much float time
    const HELI_GRAVITY_MULT = 0.18;  // fraction of normal gravity while active
    const HELI_FRAME_FPS = 10;       // spin frame-cycle rate

    // Shared per-attack-type numbers - jump/crouch variants borrow their
    // grounded counterpart's values until they get their own tuning.
    const ATTACK_BASE = { punch: 'punch_lo', kick: 'kick_lo' };
    const DMG = { punch_lo: 5, kick_lo: 8 }; // tuned so continuous unblocked hitting takes ~20-30s to KO, not ~5 hits
    const ATK_DUR = { punch_lo: 0.26, kick_lo: 0.34 };
    const HEAVY = new Set(['kick_lo']);
    const HS_LT = 5, HS_HV = 9;
    const CANCEL_W = 0.18;

    function baseAttackKind(state) {
        // 'jump_punch' / 'crouch_punch' -> 'punch_lo', etc. - so damage/
        // duration/hitbox lookups work the same regardless of variant.
        if (state.endsWith('_punch') || state === 'punch_lo') return 'punch_lo';
        if (state.endsWith('_kick') || state === 'kick_lo') return 'kick_lo';
        return null;
    }
    function isAttackState(state) {
        return state === 'punch_lo' || state === 'kick_lo' || state === 'jump_punch' || state === 'jump_kick' || state === 'crouch_punch' || state === 'crouch_kick';
    }

    // ---------------- Guard meter, chip damage, guard break ----------------
    // Blocking is free (0 damage) while the guard meter has charge. Each
    // blocked hit costs GUARD_COST_PER_BLOCK, so GUARD_METER_MAX / cost =
    // how many hits you can block for free before it runs out (5 at these
    // numbers). Once empty, further blocked hits deal chip damage that
    // scales from 1% to 10% of max HP over CHIP_BLOCKS_TO_BREAK more hits,
    // then Guard Break triggers.
    const GUARD_METER_MAX = 100;
    const GUARD_COST_PER_BLOCK = 20;
    const CHIP_BLOCKS_TO_BREAK = 5;
    const CHIP_DMG_MIN_PCT = 0.01;
    const CHIP_DMG_MAX_PCT = 0.10;
    const GUARD_BREAK_DURATION = 1.5;   // seconds fully vulnerable after a guard break
    const GUARD_REGEN_DELAY = 2.0;      // seconds without blocking/taking a hit before the meter starts refilling
    const GUARD_REGEN_RATE = 40;        // meter points per second once regen kicks in

    // ---------------- Counter hits & combo scaling ----------------
    const COUNTER_HIT_MULT = 1.25;      // bonus damage for interrupting an opponent's attack startup
    const COUNTER_HIT_EXTRA_STOP = 4;   // extra hitstop frames on a counter hit, on top of the normal HS_LT/HS_HV
    const COMBO_SCALE_STEP = 0.08;      // each hit after the first in a combo deals ~8% less
    const COMBO_MIN_SCALE = 0.5;        // combo scaling never drops a hit below 50% of its base damage
    const COMBO_WINDOW = 0.6;           // seconds after a hit lands where the next hit still counts as the same combo

    const MAX_HP = 100;
    const VICTORY_FPS = 8;
    const DEFEAT_FPS = 7;
    const INTRO_DURATION = 1.0; // seconds the "FIGHT!" card holds before a round starts
    const HURT_FLASH_T = 0.22;

    const COL = {
        W: '#ffffff', RD: '#dc1e1e', OR: '#ff8c00', YL: '#ffd700',
        GN: '#1ec846', GY: '#787878', DK: '#323232', LG: '#c8c8c8', BL: '#3b82f6',
    };

    // Full move sets - walk/punch/kick/hurt/victory/defeat/block are real
    // art. jump/crouch/jump_punch/jump_kick/crouch_punch/crouch_kick are
    // placeholders (see loadFighterAnims) until dedicated sprites exist.
    const FIGHTER_ANIM_FILES = {
        reiffer: {
            walk:     ['assets/bonus_stage/reiffer_walk.webp', 6],
            victory:  ['assets/bonus_stage/reiffer_victory.webp', 6],
            punch_lo: ['assets/bonus_stage/reiffer_punch_lo.webp?v=2', 3],
            kick_lo:  ['assets/bonus_stage/reiffer_kick_lo.webp?v=3', 3],
            hurt:     ['assets/bonus_stage/hit.webp', 1],
            defeat:   ['assets/bonus_stage/midevils_defeat.webp?v=3', 3],
            block:    ['assets/fight_game/reiffer_block.webp', 1],
            jump:         ['assets/fight_game/reiffer_jump.webp', 1],
            crouch:       ['assets/fight_game/reiffer_crouch.webp', 1],
            jump_punch:   ['assets/fight_game/reiffer_jump_punch.webp', 1],
            jump_kick:    ['assets/fight_game/reiffer_jump_kick.webp', 2], // also doubles as the helicopter-kick loop, see updateHumanFighter
            crouch_kick:  ['assets/fight_game/reiffer_crouch_kick.webp', 1],
            crouch_punch: ['assets/fight_game/reiffer_crouch_punch.webp', 1],
        },
        conmen: {
            walk:     ['assets/bonus_stage/conmen_walk.webp', 4],
            victory:  ['assets/bonus_stage/conmen_victory.webp', 4],
            punch_lo: ['assets/bonus_stage/conmen_punch_lo.webp', 3],
            kick_lo:  ['assets/bonus_stage/conmen_kick_lo.webp', 3],
            hurt:     ['assets/bonus_stage/conmen_hit.webp', 1],
            defeat:   ['assets/bonus_stage/conmen_defeat.webp?v=2', 4],
            block:    ['assets/fight_game/conmen_block.webp', 1],
            jump:         ['assets/fight_game/conmen_jump.webp', 1],
            crouch:       ['assets/fight_game/conmen_crouch.webp', 1],
            jump_punch:   ['assets/fight_game/conmen_jump_punch.webp?v=2', 1],
            jump_kick:    ['assets/fight_game/conmen_jump_kick.webp?v=2', 1],
            crouch_kick:  ['assets/fight_game/conmen_crouch_kick.webp', 1],
            crouch_punch: ['assets/fight_game/conmen_crouch_punch.webp', 1],
        },
        wizard: {
            walk:     ['assets/fight_game/wizard_walk.webp', 1],
            victory:  ['assets/fight_game/wizard_victory.webp', 3],
            punch_lo: ['assets/fight_game/wizard_punch_lo.webp', 1],
            kick_lo:  ['assets/fight_game/wizard_kick_lo.webp', 1],
            hurt:     ['assets/fight_game/wizard_hurt.webp', 1],
            defeat:   ['assets/fight_game/wizard_defeat.webp?v=2', 3],
            block:    ['assets/fight_game/wizard_block.webp', 1],
            jump:         ['assets/fight_game/wizard_jump.webp', 1],
            crouch:       ['assets/fight_game/wizard_crouch.webp', 1],
            jump_punch:   ['assets/fight_game/wizard_jump_punch.webp', 1],
            jump_kick:    ['assets/fight_game/wizard_jump_kick.webp', 1],
            crouch_kick:  ['assets/fight_game/wizard_crouch_kick.webp', 1],
            crouch_punch: ['assets/fight_game/wizard_crouch_punch.webp', 1],
        },
        // Genuine Undead - TEST Play preview theme only (see COSMETIC_THEMES
        // in web3.js). Full move set including a dedicated idle pose -
        // see the `anims.idle` override below loadFighterAnims that lets
        // a character supply its own idle instead of borrowing walk[0].
        undead: {
            idle:     ['assets/fight_game/undead_idle.webp', 1],
            walk:     ['assets/fight_game/undead_walk.webp', 2],
            victory:  ['assets/fight_game/undead_victory.webp?v=2', 5],
            punch_lo: ['assets/fight_game/undead_punch_lo.webp', 2],
            kick_lo:  ['assets/fight_game/undead_kick_lo.webp?v=2', 1],
            hurt:     ['assets/fight_game/undead_hurt.webp', 1],
            defeat:   ['assets/fight_game/undead_defeat.webp', 4],
            block:    ['assets/fight_game/undead_block.webp', 1],
            jump:         ['assets/fight_game/undead_jump.webp', 1],
            crouch:       ['assets/fight_game/undead_crouch.webp', 1],
            jump_punch:   ['assets/fight_game/undead_jump_punch.webp', 2],
            jump_kick:    ['assets/fight_game/undead_jump_kick.webp', 2],
            crouch_kick:  ['assets/fight_game/undead_crouch_kick.webp', 1],
            crouch_punch: ['assets/fight_game/undead_crouch_punch.webp', 2],
            // Dedicated poses for blocking/getting hit while crouching or
            // airborne. Any character without these four falls back to
            // their normal block/hurt pose (see resolveBlockPose/
            // resolveHurtPose below) - purely additive, doesn't touch
            // Reiffer/Conmen/Wizard.
            crouch_block: ['assets/fight_game/undead_crouch_block.webp', 1],
            crouch_hurt:  ['assets/fight_game/undead_crouch_hurt.webp', 1],
            jump_block:   ['assets/fight_game/undead_jump_block.webp', 1],
            jump_hurt:    ['assets/fight_game/undead_jump_hurt.webp', 1],
        },
        // Skull X - the on-chain-gated fighter (see COSMETIC_THEMES
        // "skullx" in web3.js). Real ownership verification is still
        // pending (Origins parent inscription ID unconfirmed - see
        // btcwallet.js), so for now this is reachable the same way
        // Genuine Undead is: via Theme Preview in TEST mode. Also added
        // to the P2 random-opponent pool for everyone regardless of
        // ownership, same as the other three.
        // Full move set including jump/jump_block/jump_punch/jump_kick -
        // this character's airborne pose is a deliberate tight tuck-into-
        // a-ball (cape wraps into the silhouette), not a standard leap, so
        // don't "fix" it to look like the other fighters' jump poses.
        // No dedicated idle - falls back to walk[0] same as Reiffer/
        // Conmen/Wizard.
        skullx: {
            walk:     ['assets/fight_game/skullx_walk.webp', 2],
            victory:  ['assets/fight_game/skullx_victory.webp', 4],
            punch_lo: ['assets/fight_game/skullx_punch_lo.webp', 2],
            kick_lo:  ['assets/fight_game/skullx_kick_lo.webp', 2],
            hurt:     ['assets/fight_game/skullx_hurt.webp', 1],
            defeat:   ['assets/fight_game/skullx_defeat.webp', 5],
            block:    ['assets/fight_game/skullx_block.webp', 1],
            jump:         ['assets/fight_game/skullx_jump.webp', 1],
            crouch:       ['assets/fight_game/skullx_crouch.webp', 1],
            jump_punch:   ['assets/fight_game/skullx_jump_punch.webp', 1],
            jump_kick:    ['assets/fight_game/skullx_jump_kick.webp', 1],
            crouch_kick:  ['assets/fight_game/skullx_crouch_kick.webp', 1],
            crouch_punch: ['assets/fight_game/skullx_crouch_punch.webp', 1],
            crouch_block: ['assets/fight_game/skullx_crouch_block.webp', 1],
            crouch_hurt:  ['assets/fight_game/skullx_crouch_hurt.webp', 1],
            jump_block:   ['assets/fight_game/skullx_jump_block.webp', 1],
            jump_hurt:    ['assets/fight_game/skullx_jump_hurt.webp', 1],
        },
    };

    const BACKGROUNDS = ['assets/fight_game/bg_prison.webp', 'assets/fight_game/bg_market.webp', 'assets/fight_game/bg_wizard.webp', 'assets/fight_game/bg_skullx.webp', 'assets/fight_game/bg_undead.webp'];
    // Online matches decide the arena once, at room-creation time (see
    // onlinelobby.js), so both players load the same image instead of each
    // independently rolling their own - this is what that picks from.
    window.pickRandomArenaSrc = () => BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];

    // ---------------------------------------------------------------
    // SOUND EFFECTS (real recorded files, not the synthesized tones in
    // audio.js). Whoosh plays the instant a swing starts; hit/block/
    // finisher play on impact via playSfxRandom() so the same exact
    // sample doesn't play every single time.
    // ---------------------------------------------------------------
    const SFX_PUNCH_WHOOSH = 'assets/sfx/fight/punch_whoosh.mp3';
    const SFX_KICK_WHOOSH = 'assets/sfx/fight/kick_whoosh.mp3';
    const SFX_HITS = ['assets/sfx/fight/hit_body_small.mp3', 'assets/sfx/fight/hit_body_large.mp3', 'assets/sfx/fight/hit_face_large.mp3'];
    const SFX_FINISHERS = ['assets/sfx/fight/hit_finisher_body.mp3', 'assets/sfx/fight/hit_finisher_face.mp3'];
    const SFX_BLOCKS = ['assets/sfx/fight/block_small.mp3', 'assets/sfx/fight/block_medium.mp3', 'assets/sfx/fight/block_large.mp3'];

    // Per-background overrides for floor height, P1's starting spot, and an
    // optional jumpable platform (x-range + top surface y). Any background
    // not listed here just uses the plain GROUND constant, no platform -
    // add an entry here the same way to give another scene its own floor
    // level or a jump-up ledge.
    const ARENA_CONFIG = {
        'assets/fight_game/bg_wizard.webp': {
            ground: 500,          // floor is lower in this art than the default 430
            p1X: 350,             // clear of the cauldron. At the old 205 P1 spawned standing INSIDE it, which is only survivable while the cauldron is scenery - now that it is solid he has to start beside it.
            platforms: [
                { x1: 585, x2: 890, topY: 405 }, // the table on the right - jump up to stand on it
                // The cauldron. It read as a painted-on background object
                // before: fighters walked straight through it and P1 even
                // spawned standing inside it. Measured off the art at
                // canvas scale by sampling the bowl's colour - the rim
                // tops out at y=428-431 across its width, so 430. `solid`
                // additionally stops you walking THROUGH the side of it,
                // which is what makes it read as a real object rather than
                // a decal you can stand on.
                { x1: 185, x2: 335, topY: 430, solid: true },
            ],
        },
        'assets/fight_game/bg_market.webp': {
            // The Mid Evils arena. It had no entry at all, so it fell back
            // to the default GROUND = 430 - which put both fighters' feet
            // level with the market stalls in the middle distance, roughly
            // 40px above the dirt, visibly hovering. The dirt in front of
            // the stalls is flat from y=424 all the way down past y=500;
            // 470 sits them on it, just behind the foreground fence.
            ground: 470,
            platforms: [
                // The long trestle table. Measured off the art by drawing
                // candidate lines over a render and picking the one that
                // sat on the plank's top edge: the surface is at y=378 and
                // the legs meet the dirt around y=440. x stops just inside
                // the ends so you can run off either side and drop.
                { x1: 535, x2: 845, topY: 378 },
            ],
        },
        'assets/fight_game/bg_skullx.webp': {
            ground: 480,           // throne-room art - estimated from the rug/floor line, no platform (no obvious ledge like some other arenas have) - nudge this if feet look off once it's live
        },
        'assets/fight_game/bg_undead.webp': {
            // Was 481, which left both fighters visibly hovering: at that
            // height their feet sit level with the BASE of the reception
            // desk - i.e. at the desk's depth, not on the foreground floor
            // the camera is actually looking at. Moved down onto the pale
            // floor tiles in front of it.
            ground: 502,
            platforms: [
                { x1: 528, x2: 715, topY: 335 }, // the green filing cabinets on the right
                // The near corner of the reception desk - the bit Tim
                // pointed at. Sampling the wood across the counter gives a
                // top surface running y=392 at x=300 up to y=372 at x=450:
                // it is drawn in perspective, so it is not flat. Rather
                // than fake a flat platform across the whole desk (which
                // would leave you visibly sunk into it at one end), this
                // covers only the near half, where the surface stays
                // within a few pixels of 379. x2 stops at the corner so
                // you can run off the end and drop to the floor.
                { x1: 280, x2: 470, topY: 379 },
            ],
        },
    };
    let currentArena = null; // set fresh each time loadArenaBackground() runs

    function arenaGroundY() { return (currentArena && currentArena.ground) || GROUND; }

    // How far BELOW a platform's surface a falling fighter can still be
    // caught by it. Without a tolerance a fast fall can step clean past a
    // ledge between two frames and land on the floor instead.
    const LAND_TOLERANCE = 26;

    // Arenas used to allow exactly ONE jumpable platform. This returns a
    // list either way, so a legacy `platform:` entry still works and any
    // arena can now carry as many surfaces as its art has ledges.
    function arenaPlatforms() {
        if (!currentArena) return [];
        if (Array.isArray(currentArena.platforms)) return currentArena.platforms;
        if (currentArena.platform) return [currentArena.platform];
        return [];
    }

    // The surface a fighter at horizontal centre `cx` and height `y` would
    // land on. Picks the HIGHEST platform still at or below them, so
    // stacked ledges resolve the way a player expects: you land on the
    // table rather than the floor beneath it, and jumping up from the floor
    // never teleports you onto a ledge you are currently underneath.
    function surfaceBelow(cx, y) {
        let landY = arenaGroundY() - P_H;
        let onPlatform = false;
        for (const pl of arenaPlatforms()) {
            if (cx <= pl.x1 || cx >= pl.x2) continue;
            const platY = pl.topY - P_H;
            if (platY <= landY && y <= platY + LAND_TOLERANCE) { landY = platY; onPlatform = true; }
        }
        return { landY, onPlatform };
    }

    // Is there still a surface under this fighter's feet at `cx`, given
    // they are standing at `y`? Used when walking, to decide whether they
    // just stepped off the end of a ledge.
    function stillSupportedAt(cx, y) {
        for (const pl of arenaPlatforms()) {
            if (cx > pl.x1 && cx < pl.x2 && Math.abs((pl.topY - P_H) - y) < 2) return true;
        }
        return false;
    }

    // Side collision for platforms marked `solid`. Only those block
    // horizontal movement; the desk, table and filing cabinets stay
    // walk-through on purpose, because the fighters pass in FRONT of those
    // in the art and stopping dead at thin air would look broken.
    //
    // Written so it can never trap anyone: it only refuses movement that
    // takes a fighter FURTHER INTO an obstacle they were previously
    // outside of. Anyone who somehow ends up inside one - a knockback, an
    // arena swap, a future edit to these numbers - can always simply walk
    // back out.
    function blockSolidSides(f, prevCx) {
        const cx = f.x + f._fw / 2;
        const feetY = f.y + P_H;
        for (const pl of arenaPlatforms()) {
            if (!pl.solid) continue;
            // Standing on top of it, or clearing it in the air? Not a wall.
            if (feetY <= pl.topY + 2) continue;
            if (cx <= pl.x1 || cx >= pl.x2) continue;   // outside: nothing to do
            if (prevCx > pl.x1 && prevCx < pl.x2) continue; // already inside: let them leave
            const edge = prevCx <= pl.x1 ? pl.x1 : pl.x2;
            f.x = edge - f._fw / 2;
            f.vx = 0;
        }
    }

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

    // Only Reiffer's ORIGINAL sprites (walk/victory/punch_lo/kick_lo/hurt -
    // not built by me, pre-existing) have the extra padding problem and
    // need the size boost. Everything I built this session for him
    // (block, defeat, jump, crouch, jump_punch, jump_kick, crouch_kick,
    // crouch_punch) was already scaled to his true reference size directly
    // - applying the correction to those too was the bug that made his
    // crouch (and other new poses) render oversized.
    const REIFFER_LEGACY_PADDED_STATES = new Set(['walk', 'victory', 'punch_lo', 'hurt']); // kick_lo re-cropped tight (see reiffer_kick_lo.webp?v=3 fix) - no longer needs the padding boost
    const REIFFER_SIZE_CORRECTION = 1.255;

    // Conmen's cloak flows almost to the ground even while he's crouching,
    // so the crouch/crouch_punch source frames measure nearly as tall as
    // his standing frames (the cloak fabric fills the frame regardless of
    // pose) - without this he barely looks any shorter than standing.
    // crouch_kick isn't listed here because it already measures noticeably
    // shorter on its own. First-pass estimate - nudge the number if it
    // still doesn't read as a crouch once you see it live.
    const CONMEN_CROUCH_STATES = new Set(['crouch', 'crouch_punch']);
    const CONMEN_CROUCH_CORRECTION = 0.87;

    // Same issue, same fix, different character: the Wizard's robe also
    // flows to the ground regardless of pose, so all three of his crouch
    // states measure just as tall as standing. Caught this one proactively
    // by measuring fill ratios before shipping, rather than waiting for a
    // bug report - same correction value as Conmen's fix since the
    // underlying cause and target look are identical.
    const WIZARD_CROUCH_STATES = new Set(['crouch', 'crouch_kick', 'crouch_punch']);
    const WIZARD_CROUCH_CORRECTION = 0.61; // 0.87 * 0.7 - shrunk another 30% on top of the first pass per feedback

    // The new dedicated hurt sprite fills its own canvas noticeably less
    // than his reference walk pose (~83% vs ~98%), so without this he'd
    // render smaller than every other state during a hit reaction.
    const WIZARD_BOOST_STATES = new Set(['hurt']);
    const WIZARD_BOOST_CORRECTION = 1.18;

    // Skull X's coat/cape reaches near the ground in every pose too (same
    // root cause as Conmen/Wizard above), so raw crouch frame height
    // doesn't read as noticeably shorter than standing without this.
    // Genuinely a first-pass estimate this time - unlike Conmen/Wizard,
    // there was no live match to check fill ratios against yet, so
    // starting halfway between their two values. Nudge once it's live.
    const SKULLX_CROUCH_STATES = new Set(['crouch', 'crouch_kick', 'crouch_punch', 'crouch_block', 'crouch_hurt']);
    const SKULLX_CROUCH_CORRECTION = 0.75;

    async function loadFighterAnims(key) {
        const files = FIGHTER_ANIM_FILES[key];
        const anims = {};
        for (const state in files) {
            const [path, count] = files[state];
            let outH = P_H;
            if (key === 'reiffer' && REIFFER_LEGACY_PADDED_STATES.has(state)) outH = P_H * REIFFER_SIZE_CORRECTION;
            else if (key === 'conmen' && CONMEN_CROUCH_STATES.has(state)) outH = P_H * CONMEN_CROUCH_CORRECTION;
            else if (key === 'wizard' && WIZARD_CROUCH_STATES.has(state)) outH = P_H * WIZARD_CROUCH_CORRECTION;
            else if (key === 'wizard' && WIZARD_BOOST_STATES.has(state)) outH = P_H * WIZARD_BOOST_CORRECTION;
            else if (key === 'skullx' && SKULLX_CROUCH_STATES.has(state)) outH = P_H * SKULLX_CROUCH_CORRECTION;
            anims[state] = await loadStrip(path, count, outH);
        }
        anims.idle = (anims.idle && anims.idle.length) ? anims.idle : (anims.walk.length ? [anims.walk[0]] : []);

        /* FOOT ALIGNMENT - why everyone looked like they were hovering.

           Sprites are bottom-anchored: the frame's bottom edge is placed on
           the arena's ground line. That only puts FEET on the ground if the
           art has no transparent margin below them, and most of this set
           does. Measured from the source strips:

             reiffer  9px of empty space under the shoes (of a 300px frame,
                      and his legacy strips get scaled UP by 1.255, so it
                      lands as ~8px on screen)
             undead   26px of 835 -> ~7px on screen
             wizard   10px of 951 -> ~2px
             conmen    3px of 668 -> ~1px
             skullx    0px        -> already correct

           So Reiffer floated about 8px on every single stage and Skull X
           didn't float at all, which is exactly the inconsistency that made
           it read as a bug rather than a style.

           This measures the character's own walk strip once at load and
           shifts that character down by the gap. Deliberately measured from
           ONE reference pose and applied to all of their states: per-frame
           correction would be wrong, because a jump or a crouch is SUPPOSED
           to have the feet higher in the frame, and auto-flattening those
           would destroy the animation. */
        anims._footPad = measureFootPad(anims.walk && anims.walk.length ? anims.walk[0] : anims.idle[0]);
        console.log(`[fightgame] ${key}: foot gap ${anims._footPad}px - sprite shifted down by that much so the feet meet the floor`);

        // PLACEHOLDERS for anything not defined above in FIGHTER_ANIM_FILES -
        // replace the corresponding FIGHTER_ANIM_FILES entry with a real
        // loadStrip() source once that art exists, and these no-ops itself.
        if (!anims.jump || !anims.jump.length) anims.jump = anims.idle;
        if (!anims.crouch || !anims.crouch.length) anims.crouch = anims.idle;
        if (!anims.jump_punch || !anims.jump_punch.length) anims.jump_punch = anims.punch_lo;
        if (!anims.jump_kick || !anims.jump_kick.length) anims.jump_kick = anims.kick_lo;
        if (!anims.crouch_punch || !anims.crouch_punch.length) anims.crouch_punch = anims.punch_lo;
        if (!anims.crouch_kick || !anims.crouch_kick.length) anims.crouch_kick = anims.kick_lo;
        return anims;
    }

    // Transparent rows below the lowest opaque pixel of a rendered frame.
    // Returns 0 for anything unreadable rather than guessing, so a failure
    // here can only ever mean "no correction applied", never a wrong one.
    function measureFootPad(frameCanvas) {
        if (!frameCanvas || !frameCanvas.width || !frameCanvas.height) return 0;
        try {
            const c = frameCanvas.getContext('2d');
            const w = frameCanvas.width, h = frameCanvas.height;
            const data = c.getImageData(0, 0, w, h).data;
            for (let y = h - 1; y >= 0; y--) {
                const row = y * w * 4;
                for (let x = 0; x < w; x++) {
                    if (data[row + x * 4 + 3] > 8) return h - 1 - y; // alpha > 8 = a real pixel
                }
            }
        } catch (e) {
            console.warn('[fightgame] could not measure foot padding, leaving it uncorrected:', e);
        }
        return 0;
    }

    let lastArenaBg = null; // tracks the previous match's background so the next one never repeats it

    async function loadArenaBackground(forcedSrc) {
        // Fully random every match, regardless of which cosmetic theme is
        // active - the arena and its music are meant to vary match to
        // match. Never repeats the immediately-previous background.
        // Online matches pass forcedSrc (decided once at room-creation
        // time, see onlinelobby.js) so both players see the same arena
        // instead of each independently rolling their own.
        let src = forcedSrc;
        if (!src) {
            do {
                src = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
            } while (src === lastArenaBg && BACKGROUNDS.length > 1);
        }
        lastArenaBg = src;
        currentArena = ARENA_CONFIG[src] || null;
        console.log(`[fightgame] Arena loaded: ${src} | config:`, currentArena ? JSON.stringify(currentArena) : '(none - using default GROUND=' + GROUND + ', no platform)');
        if (typeof playFightMusicForBackground === 'function') playFightMusicForBackground(src);
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
        constructor(anims, x, facing) {
            this.anims = anims;
            this.x = x; this.y = arenaGroundY() - P_H;
            this.vx = 0; this.vy = 0; this.facing = facing;
            this.grounded = true;
            this.onPlatform = false;
            this._prevX = x;   // position at the start of this frame - resolveFighterCollision() uses it to tell who walked into whom
            this.kbChain = 0;  // nudges taken in the current flurry; at KB_MAX_CHAIN they plant
            this.kbResetT = 0; // seconds left before kbChain clears (see tickKnockbackRecovery)
            this.crouching = false;
            this.hp = MAX_HP;
            this.state = 'idle'; this.fr = 0; this.frT = 0;
            this._fw = 90;
            this.atkT = 0; this.atkDur = 0; this.hitReg = false; this.canW = false; this.canT = 0;
            this.stop = 0;
            this.blocking = false;
            this.hurtT = 0;
            this.heliT = 0;
            this.ko = false;

            // Guard meter / chip damage / guard break
            this.guardMeter = GUARD_METER_MAX;
            this.chipBlockCount = 0;
            this.guardBroken = false;
            this.guardBreakT = 0;
            this.timeSinceBlockOrHit = GUARD_REGEN_DELAY; // starts "already recovered"

            // Combo scaling
            this.comboCounter = 0;
            this.comboWindowT = 0;
        }

        rect() {
            // Crouching halves the hurtbox height, feet-anchored - low
            // attacks would matter more here once crouch has real art.
            const h = this.crouching ? P_H * 0.6 : P_H;
            return { x: this.x, y: this.y + (P_H - h), w: this._fw, h };
        }

        hitbox() {
            if (!isAttackState(this.state) || this.hitReg) return null;
            const base = baseAttackKind(this.state);
            if (base === 'punch_lo') {
                const ex = this.facing === 1 ? this.x + this._fw - 6 : this.x - 40;
                return { x: ex, y: this.y + P_H * 0.30, w: 46, h: 30 };
            }
            if (base === 'kick_lo') {
                const ex = this.facing === 1 ? this.x + this._fw - 4 : this.x - 46;
                return { x: ex, y: this.y + P_H * 0.55, w: 54, h: 28 };
            }
            return null;
        }

        // baseKind: 'punch' or 'kick' - resolves to the grounded/airborne/
        // crouching variant automatically.
        beginAttack(baseKind) {
            if (this.blocking) return; // can't attack while blocking, no exceptions
            let kind;
            if (!this.grounded) kind = baseKind === 'punch' ? 'jump_punch' : 'jump_kick';
            else if (this.crouching) kind = baseKind === 'punch' ? 'crouch_punch' : 'crouch_kick';
            else kind = ATTACK_BASE[baseKind];
            this.state = kind; this.atkT = 0; this.hitReg = false; this.canW = false; this.canT = 0;
            this.fr = 0; this.frT = 0;
            this.atkDur = ATK_DUR[baseAttackKind(kind)];
            if (typeof playSfxFile === 'function') playSfxFile(baseKind === 'punch' ? SFX_PUNCH_WHOOSH : SFX_KICK_WHOOSH, 0.35);
        }

        // rawDmg has already had counter-hit and combo scaling applied by
        // resolveHit() by the time it gets here - this method's only job is
        // deciding how blocking/guard state affects it.
        takeDamage(rawDmg, heavy, isCounterHit) {
            let dmg;
            if (this.guardBroken) {
                // Fully vulnerable - blocking isn't possible during a guard
                // break, so this always behaves like an unblocked hit.
                dmg = Math.round(rawDmg);
                this.hurtT = HURT_FLASH_T;
                this.stop = (heavy ? HS_HV : HS_LT) + (isCounterHit ? COUNTER_HIT_EXTRA_STOP : 0);
                this.timeSinceBlockOrHit = 0;
            } else if (this.blocking) {
                this.timeSinceBlockOrHit = 0;
                if (this.guardMeter > 0) {
                    // Free block - guard meter absorbs it instead of health.
                    this.guardMeter = Math.max(0, this.guardMeter - GUARD_COST_PER_BLOCK);
                    dmg = 0;
                } else {
                    // Guard's empty - chip damage scales up the longer they
                    // keep leaning on block instead of recovering it.
                    this.chipBlockCount++;
                    const t = Math.min(1, this.chipBlockCount / CHIP_BLOCKS_TO_BREAK);
                    const chipPct = CHIP_DMG_MIN_PCT + t * (CHIP_DMG_MAX_PCT - CHIP_DMG_MIN_PCT);
                    dmg = Math.round(MAX_HP * chipPct);
                    if (this.chipBlockCount >= CHIP_BLOCKS_TO_BREAK) this.triggerGuardBreak();
                }
            } else {
                dmg = Math.round(rawDmg);
                this.hurtT = HURT_FLASH_T;
                this.stop = (heavy ? HS_HV : HS_LT) + (isCounterHit ? COUNTER_HIT_EXTRA_STOP : 0);
                this.timeSinceBlockOrHit = 0;
                // A clean non-blocked hit also resets guard - no reason to
                // stay "worn down" from blocking once they've eaten a real hit.
                this.chipBlockCount = 0;
            }

            this.hp = Math.max(0, this.hp - dmg);
            if (this.hp <= 0) this.ko = true;
            return dmg;
        }

        // Dizzy/stagger state: fully vulnerable, can't block or attack, for
        // GUARD_BREAK_DURATION seconds. Reuses the 'hurt' pose since there's
        // no dedicated dizzy sprite - the "GUARD BREAK!" callout in drawHUD
        // and the stars effect are what actually sell the moment.
        triggerGuardBreak() {
            this.guardBroken = true;
            this.guardBreakT = GUARD_BREAK_DURATION;
            this.blocking = false;
            this.guardMeter = 0;
            this.chipBlockCount = 0;
            this.state = 'hurt';
            this.fr = 0;
            if (typeof showToast === 'function') showToast('💥 Guard Break!', 'error');
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
                let hf = this.anims.hurt;
                if (!this.grounded && this.anims.jump_hurt && this.anims.jump_hurt.length) hf = this.anims.jump_hurt;
                else if (this.grounded && this.crouching && this.anims.crouch_hurt && this.anims.crouch_hurt.length) hf = this.anims.crouch_hurt;
                if (hf && hf.length) return hf[0];
            }
            // Block has its own crouch/jump variants the same way hurt does
            // above - state stays 'block' either way (so anything checking
            // f.state === 'block' elsewhere is unaffected), this only picks
            // which art to draw. Falls back to the plain block pose for any
            // character without the crouch/jump variants.
            let stateForFrames = this.state;
            if (this.state === 'block') {
                if (!this.grounded && this.anims.jump_block && this.anims.jump_block.length) stateForFrames = 'jump_block';
                else if (this.grounded && this.crouching && this.anims.crouch_block && this.anims.crouch_block.length) stateForFrames = 'crouch_block';
            }
            const frames = this.anims[stateForFrames] && this.anims[stateForFrames].length ? this.anims[stateForFrames] : this.anims.idle;
            if (!frames || !frames.length) return null;
            const s = frames[this.fr % frames.length];
            if (s && s.width !== this._fw) this._fw = s.width;
            return s;
        }

        draw(ctx, so) {
            const img = this._surf();
            if (!img) return;
            const sx = Math.round(this.x + so[0]);
            // Bottom-anchored: most sprites are exactly P_H tall (this is a
            // no-op for those), but some dynamic poses (e.g. a full diagonal
            // jump-punch) need a taller canvas to avoid cropping the head or
            // limbs. Anchoring by the bottom keeps feet/ground-contact in the
            // same place regardless of a given frame's actual height.
            // `_footPad` closes the gap between the bottom of the frame and
            // the bottom of the actual artwork - see the FOOT ALIGNMENT
            // note in loadFighterAnims(). Without it a character whose art
            // has empty space under the shoes hovers above every floor in
            // the game by exactly that many pixels.
            const sy = Math.round(this.y + P_H - img.height + so[1] + (this.anims._footPad || 0));
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
    let justPressed = {}; // set true on a genuine new keydown, cleared every frame - forces mashing instead of holding
    let onKeyDown, onKeyUp;

    const HANDLED_KEYS = new Set([
        'a', 'd', 'w', 's', 'z', 'x', ' ',
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', '/',
        'Shift', 'Escape',
    ]);

    function normKey(k) {
        if (k.length === 1 && /[a-zA-Z]/.test(k)) return k.toLowerCase();
        return k;
    }

    function newGame(anims, bg) {
        // Online matches already know both fighters - decided at
        // room-creation/join time so both sides agree before the match
        // even starts (see onlinelobby.js) - rather than P2 being a random
        // CPU pick. Local/solo matches keep the old behavior: P1 matches
        // your real active theme (getActiveFighterKey, shared with the
        // online path so Conmen/Wizard/etc. show correctly everywhere),
        // P2 random from the rest.
        const online = window.fightClubOnlineActive && window.fightClubOnlineFighters;
        const p1Key = online ? window.fightClubOnlineFighters.p1
            : (typeof getActiveFighterKey === 'function' ? getActiveFighterKey() : 'reiffer');
        let p2Key;
        if (online) {
            p2Key = window.fightClubOnlineFighters.p2;
        } else {
            const p2Pool = ['reiffer', 'conmen', 'wizard', 'undead', 'skullx'].filter(k => k !== p1Key);
            p2Key = p2Pool[Math.floor(Math.random() * p2Pool.length)];
        }
        window.fightClubOnlineFighters = null; // read once, same pattern as onlineNames below
        // SECURITY: in an online match these keys originate from the
        // fight_rooms table, which any anonymous person can write to. An
        // unrecognised key (or "__proto__"/"constructor") made anims[key]
        // undefined, which threw on the first frame - and since the raf
        // loop only re-arms at the BOTTOM of frame(), that single throw
        // killed the opponent's game permanently on a frozen canvas.
        // Anything not an own-property of the map falls back to default.
        const safeAnimKey = (k) => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(anims, k)) ? k : 'reiffer';
        const p1 = new Fighter(anims[safeAnimKey(p1Key)], (currentArena && currentArena.p1X) || 180, 1);
        const p2 = new Fighter(anims[safeAnimKey(p2Key)], SW - 180 - 90, -1);
        // Online Fight Club sets this right before calling openFightGame()
        // so the HUD shows real wallet names instead of "P1"/"P2" - your
        // own name on your side, the matched opponent's on the other.
        // Cleared immediately after reading so a later normal TEST/local
        // match doesn't accidentally inherit stale online-match names.
        const onlineNames = window.fightClubOnlineNames;
        window.fightClubOnlineNames = null;
        return {
            p1, p2, bg,
            timer: ROUND_T,
            phase: 'intro', // intro | playing | p1win | p2win | draw
            introT: 0,
            p1Label: (onlineNames && onlineNames.p1) || 'P1',
            p2Label: (onlineNames && onlineNames.p2) || 'P2',
        };
    }

    function aabbOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    class Shake {
        constructor() { this.v = 0; }
        hit(a) { this.v = Math.max(this.v, a); }
        update() { this.v *= 0.75; if (this.v < 0.4) this.v = 0; }
        off() { if (this.v < 0.4) return [0, 0]; return [(Math.random() - 0.5) * 2 * this.v, (Math.random() - 0.5) * this.v]; }
    }

    // Handles movement, jump physics, crouch, and attack input for one
    // fighter given its own key bindings. Shared by both players so P1
    // and P2 behave identically, just reading different keys.
    // Shared fall/landing physics - used during normal play (mid-jump,
    // mid-air-block) and also to bring a winner back down to earth before
    // their victory dance starts, if the KO or timer ran out while they
    // were still in the air (see the post-'playing' phase handling below).
    function applyGravity(f, dt, heliEligible) {
        const heliActive = heliEligible && f.heliT > 0 && f.state === 'jump_kick';
        const g = heliActive ? GRAVITY * HELI_GRAVITY_MULT : GRAVITY;
        f.vy += g * dt;
        f.y += f.vy * dt;
        if (heliActive) {
            f.heliT = Math.max(0, f.heliT - dt);
            if (f.heliT <= 0) { f.state = 'jump'; f.fr = 0; f.atkT = 0; f.canW = false; }
        }
        // Which surface is below: any platform this arena defines (only
        // while falling and horizontally over it) or the regular floor.
        // `f.y - f.vy * dt` is where they were BEFORE this frame's step -
        // using it means a fighter who was above a ledge last frame still
        // lands on it even if one frame of gravity carried them past it.
        const cx = f.x + f._fw / 2;
        const prevY = f.y - f.vy * dt;
        const { landY, onPlatform: landOnPlatform } =
            f.vy >= 0 ? surfaceBelow(cx, prevY) : { landY: arenaGroundY() - P_H, onPlatform: false };
        if (f.y >= landY) {
            f.y = landY; f.vy = 0; f.grounded = true; f.heliT = 0; f.onPlatform = landOnPlatform;
            if (f.state === 'jump_kick') { f.state = 'idle'; f.fr = 0; }
            return true; // landed this frame
        }
        return false;
    }

    // ---------------------------------------------------------------
    // CPU OPPONENT (P2, TEST Play only)
    // ---------------------------------------------------------------
    // Deliberately simple: approach when far, throw a punch or kick when
    // close, react to the player's attacks with a chance to block. Works
    // by setting P2's virtual keys the same way a human mashing the
    // keyboard would, then handing off to updateHumanFighter() below - so
    // it gets movement/attack/block physics for free instead of
    // duplicating any of that logic.
    const CPU_MEDIUM = {
        attackRange: 92,        // close enough to throw a hit
        decisionInterval: 0.35, // seconds between re-deciding movement/attack intent
        attackChance: 0.45,     // chance to attack per decision tick while in range
        attackCooldown: 0.55,   // minimum seconds between attacks
        blockChance: 0.55,      // chance to react-block an incoming attack
        blockReactRange: 130,   // how close the opponent needs to be to bother blocking
        jumpChance: 0.06,       // chance to hop per decision tick while approaching
    };
    // Requested for testing (harder to push around, harder CPU to test
    // against) - noticeably more aggressive and defensive across the
    // board. Switch the `const diff =` line in updateCPUInput() below
    // back to CPU_MEDIUM whenever you want the normal opponent back.
    const CPU_HARD = {
        attackRange: 96,
        decisionInterval: 0.14,   // was 0.2 - reacts and re-decides noticeably faster
        attackChance: 0.85,       // was 0.7 - attacks far more often when in range
        attackCooldown: 0.22,     // was 0.35 - strings attacks together much tighter
        blockChance: 0.9,         // was 0.8 - blocks almost everything it sees coming
        blockReactRange: 170,     // was 150 - starts blocking a bit earlier
        jumpChance: 0.1,          // was 0.08 - slightly more willing to jump in
    };

    /* ---------------- BODY CONTACT AND KNOCKBACK ----------------
       Two separate ideas that used to be tangled together:

       1. WALKING INTO SOMEONE MOVES NOBODY. Previously, when the two
          sprites overlapped too far, BOTH were shoved apart by half the
          excess each. Hold forward against a standing opponent and every
          frame pushed them a little further, so you could walk someone
          across the whole stage. Now the correction is charged entirely
          to whoever actually moved inward this frame: walk into a
          stationary fighter and YOU stop, they don't budge. Walk into each
          other and you each give back your own share.

       2. THE ONLY WAY TO MOVE SOMEONE IS TO HIT THEM, and even that runs
          out. Every landed hit nudges the defender back a little - less
          when they block it - but only for the first KB_MAX_CHAIN hits of
          a sequence. After that they plant, so a long combo can't walk
          anybody into the corner. The counter resets once they've gone
          KB_RESET_SECONDS without being hit, so it limits a single flurry
          rather than the whole round. */

    const KB_ON_HIT = 20;        // px, nudge when a clean hit lands
    const KB_ON_BLOCK = 13;      // px, smaller nudge when they blocked it
    const KB_MAX_CHAIN = 4;      // nudges in one flurry before they plant
    const KB_RESET_SECONDS = 0.8; // untouched this long and the count clears

    // Applies a knockback nudge to the defender, respecting the chain cap.
    // Returns true if they actually moved, false if they've gone stiff.
    function applyKnockback(defender, attacker, blocked) {
        if (defender.kbChain >= KB_MAX_CHAIN) {
            defender.kbResetT = KB_RESET_SECONDS; // still refresh the timer - the flurry is ongoing
            return false;
        }
        defender.kbChain++;
        defender.kbResetT = KB_RESET_SECONDS;
        const dir = defender.x < attacker.x ? -1 : 1;
        const dist = blocked ? KB_ON_BLOCK : KB_ON_HIT;
        defender.x = Math.max(STAGE_MARGIN, Math.min(SW - STAGE_MARGIN - defender._fw, defender.x + dir * dist));
        return true;
    }

    // Ticks the "have they been left alone long enough to recover" timer.
    function tickKnockbackRecovery(f, dt) {
        if (f.kbChain <= 0) return;
        f.kbResetT -= dt;
        if (f.kbResetT <= 0) { f.kbChain = 0; f.kbResetT = 0; }
    }

    function resolveFighterCollision(p1, p2) {
        if (!p1.grounded || !p2.grounded) return; // jumping over each other still works
        // Sprites are allowed to clinch a fair way into each other, the way
        // they do in most 2D fighters, rather than hitting a hard wall the
        // moment they touch. Only true stacking gets corrected.
        const ALLOWED_OVERLAP = 45;

        const p1Right = p1.x + p1._fw, p2Right = p2.x + p2._fw;
        const overlap = Math.min(p1Right, p2Right) - Math.max(p1.x, p2.x);
        if (overlap <= ALLOWED_OVERLAP) return;

        const leftF = p1.x < p2.x ? p1 : p2;
        const rightF = leftF === p1 ? p2 : p1;
        const need = overlap - ALLOWED_OVERLAP;

        // How far each one moved TOWARD the other since the last frame.
        // _prevX is stamped at the top of every fighter update.
        const leftIn = Math.max(0, leftF.x - (leftF._prevX ?? leftF.x));
        const rightIn = Math.max(0, (rightF._prevX ?? rightF.x) - rightF.x);
        const totalIn = leftIn + rightIn;

        if (totalIn <= 0.001) {
            // Neither of them walked in - they ended up stacked some other
            // way (a knockback, a landing, a spawn). Nothing to charge to
            // either side, so split it and just un-stack them.
            const half = need / 2;
            leftF.x = Math.max(STAGE_MARGIN, leftF.x - half);
            rightF.x = Math.min(SW - STAGE_MARGIN - rightF._fw, rightF.x + half);
            return;
        }

        // Charge the correction to whoever closed the distance, in
        // proportion. A fighter standing still contributes 0 and therefore
        // does not move at all - which is the whole point.
        leftF.x = Math.max(STAGE_MARGIN, leftF.x - need * (leftIn / totalIn));
        rightF.x = Math.min(SW - STAGE_MARGIN - rightF._fw, rightF.x + need * (rightIn / totalIn));
    }

    // Online-match equivalent of updateCPUInput below - same job (fill in
    // P2's virtual keys before updateHumanFighter reads them), but sourced
    // from the opponent's real, live key state instead of AI decisions.
    // getFightSyncRemoteKeys() (js/onlinesync.js) already uses this exact
    // cpu_left/cpu_right/... shape, so this is mostly a straight copy -
    // EXCEPT justPressed has to be derived here too (rising edge: false
    // last frame, true this frame), not just copied - updateHumanFighter
    // gates punch/kick/jump on justPressed, not on keys being held, same
    // as updateCPUInput already does manually for the bot.
    function updateRemoteInput(dt, remote, bind) {
        const rk = (typeof getFightSyncRemoteKeys === 'function') ? getFightSyncRemoteKeys() : null;
        const next = {
            [bind.left]: !!(rk && rk.cpu_left), [bind.right]: !!(rk && rk.cpu_right),
            [bind.jump]: !!(rk && rk.cpu_jump), [bind.crouch]: !!(rk && rk.cpu_crouch),
            [bind.punch]: !!(rk && rk.cpu_punch), [bind.kick]: !!(rk && rk.cpu_kick),
            [bind.block]: !!(rk && rk.cpu_block),
        };
        for (const k in next) {
            if (next[k] && !keys[k]) justPressed[k] = true; // rising edge only, same rule as a real keydown
            keys[k] = next[k];
        }
    }

    function updateCPUInput(dt, cpu, target, bind) {
        const ai = cpu._ai || (cpu._ai = {
            timer: 0, moveDir: 0, wantAttack: null, attackCooldown: 0,
            blockingReact: false, hasReactedToAttack: false,
        });
        const diff = CPU_HARD; // swapped from CPU_MEDIUM for testing per Tim's request

        // Release every virtual key first, then set only what this frame's
        // decision calls for - same shape as a human's actual key state.
        keys[bind.left] = false; keys[bind.right] = false; keys[bind.crouch] = false; keys[bind.block] = false;

        ai.attackCooldown = Math.max(0, ai.attackCooldown - dt);

        const dx = target.x - cpu.x;
        const absDist = Math.abs(dx);

        // Reactive blocking is checked every frame (not just on the
        // decision timer) so it actually responds while the attack is
        // still happening, rather than a frame late.
        const targetAttacking = isAttackState(target.state);
        if (targetAttacking && !ai.hasReactedToAttack) {
            ai.hasReactedToAttack = true;
            ai.blockingReact = absDist < diff.blockReactRange && Math.random() < diff.blockChance;
        }
        if (!targetAttacking) { ai.hasReactedToAttack = false; ai.blockingReact = false; }

        if (ai.blockingReact) {
            keys[bind.block] = true;
            return; // don't also move/attack while committed to a block
        }

        ai.timer -= dt;
        if (ai.timer <= 0) {
            ai.timer = diff.decisionInterval;
            if (absDist > diff.attackRange) {
                ai.moveDir = dx > 0 ? 1 : -1;
            } else {
                ai.moveDir = 0;
                if (ai.attackCooldown <= 0 && Math.random() < diff.attackChance) {
                    ai.wantAttack = Math.random() < 0.5 ? 'punch' : 'kick';
                    ai.attackCooldown = diff.attackCooldown;
                }
            }
            if (cpu.grounded && ai.moveDir !== 0 && Math.random() < diff.jumpChance) {
                justPressed[bind.jump] = true;
            }
        }

        // Checked every frame, not just once per decision tick above - a
        // fighter closing at normal walk speed covers real ground during
        // one 0.2s tick (~55px), so only checking at tick boundaries meant
        // the CPU regularly walked straight through attackRange and deep
        // into the player before it next noticed, triggering the push-
        // apart, then walking back in for the same thing next tick. This
        // stops it the instant it's actually in range instead.
        if (ai.moveDir !== 0 && absDist <= diff.attackRange) ai.moveDir = 0;

        if (ai.moveDir > 0) keys[bind.right] = true;
        else if (ai.moveDir < 0) keys[bind.left] = true;

        if (ai.wantAttack) {
            justPressed[bind[ai.wantAttack]] = true;
            ai.wantAttack = null;
        }
    }

    function updateHumanFighter(dt, f, bind) {
        if (f.guardBroken) return; // fully vulnerable, no input accepted - see updateFighterCommon for the countdown

        const blockHeld = !!(keys[bind.block]);
        const attacking = isAttackState(f.state);
        const crouchHeld = !!keys[bind.crouch];

        // Blocking works airborne now too (see jump_block art) - grounded
        // blocking still stops input dead like before; airborne blocking
        // falls through so gravity/landing keeps running underneath it.
        f.blocking = blockHeld && !attacking;
        if (f.blocking) {
            f.crouching = f.grounded && crouchHeld; // holding crouch+block on the ground gives the crouch_block pose
            f.state = 'block'; f.fr = 0;
            f.timeSinceBlockOrHit = 0; // holding block also resets the recovery clock, not just getting hit while blocking
            if (f.grounded) return;
        }

        if (f.stop > 0) { f.stop--; return; }

        // --- jump physics (runs regardless of attack state, so you can
        // still fall/land mid-attack, and now also mid-air-block).
        // Helicopter kick drastically slows the fall while it's active,
        // then hands back to normal gravity. ---
        if (!f.grounded) {
            applyGravity(f, dt, true);
        } else if (justPressed[bind.jump]) {
            f.vy = JUMP_VELOCITY; f.grounded = false;
        }

        if (f.blocking) return; // airborne block: physics above already ran (including landing) - skip movement/attack input

        if (!attacking) {
            // --- crouch (grounded only, cancels moving) ---
            f.crouching = f.grounded && !!keys[bind.crouch];

            f.vx = 0;
            if (!f.crouching) {
                if (keys[bind.left]) { f.vx = -P_SPD; f.facing = -1; }
                else if (keys[bind.right]) { f.vx = P_SPD; f.facing = 1; }
            }
            const _prevCx = f.x + f._fw / 2;
            f.x = Math.max(STAGE_MARGIN, Math.min(SW - STAGE_MARGIN - f._fw, f.x + f.vx));
            blockSolidSides(f, _prevCx);

            // Walked off the edge of a ledge - start falling to whatever is
            // below instead of staying suspended in mid-air. Checks every
            // platform now, not just one, so stepping from the cauldron rim
            // straight onto another surface is handled too.
            if (f.grounded && f.onPlatform) {
                const cx = f.x + f._fw / 2;
                if (!stillSupportedAt(cx, f.y)) {
                    f.grounded = false; f.onPlatform = false; f.vy = 0;
                }
            }

            if (f.grounded) {
                f.state = f.crouching ? 'crouch' : (f.vx !== 0 ? 'walk' : 'idle');
            } else {
                f.state = 'jump';
            }
        }

        // --- attacks: only fire on a genuine key PRESS, mashing required ---
        const canStart = !attacking || (f.canW && f.canT > 0);
        if (justPressed[bind.punch] && canStart) {
            f.beginAttack('punch');
        } else if (justPressed[bind.kick]) {
            // Helicopter kick: mashing kick WHILE ALREADY mid-air-kicking (not
            // the first press - that's a normal jump kick) extends the spin
            // instead of starting a new attack. Only characters with a 2+
            // frame jump_kick strip (currently just Reiffer) can do this -
            // Conmen's single-frame jump kick just behaves like a normal kick.
            const jkFrames = f.anims.jump_kick;
            const helicopterCapable = !f.grounded && f.state === 'jump_kick' && jkFrames && jkFrames.length >= 2;
            if (helicopterCapable) {
                f.heliT = Math.min(HELI_MAX_T, f.heliT + HELI_ADD_PER_MASH);
                f.hitReg = false; // fresh hit chance for this mash
            } else if (canStart) {
                f.beginAttack('kick');
            }
        }
    }

    function updateFighterCommon(dt, f) {
        // Guard break countdown - once it expires they're back to normal,
        // guard meter already reset to 0 by triggerGuardBreak() so they have
        // to earn it back like anyone else who got chipped down.
        if (f.guardBroken) {
            f.guardBreakT -= dt;
            if (f.hurtT > 0) f.hurtT = Math.max(0, f.hurtT - dt);
            if (f.guardBreakT <= 0) {
                f.guardBroken = false;
                f.state = f.grounded ? 'idle' : 'jump';
                f.fr = 0;
            }
            return; // no attack/animation timers to advance while dizzy
        }

        // Guard meter regen - only once GUARD_REGEN_DELAY has passed since
        // they last blocked or got hit, and only while they're not
        // currently holding block (matches "not blocking or taking damage").
        f.timeSinceBlockOrHit += dt;
        if (!f.blocking && f.timeSinceBlockOrHit >= GUARD_REGEN_DELAY && f.guardMeter < GUARD_METER_MAX) {
            f.guardMeter = Math.min(GUARD_METER_MAX, f.guardMeter + GUARD_REGEN_RATE * dt);
            if (f.guardMeter >= GUARD_METER_MAX) f.chipBlockCount = 0; // fully recovered - clean slate
        }

        // Combo window - if nothing else lands within COMBO_WINDOW seconds
        // of the last hit, the next hit starts a fresh combo instead of
        // extending this one.
        if (f.comboWindowT > 0) {
            f.comboWindowT = Math.max(0, f.comboWindowT - dt);
            if (f.comboWindowT === 0) f.comboCounter = 0;
        }

        const heliActive = f.heliT > 0 && f.state === 'jump_kick';
        if (isAttackState(f.state) && !heliActive) {
            f.atkT += dt;
            if (f.canT > 0) f.canT -= dt;
            if (!f.canW && f.atkT >= f.atkDur * 0.4) { f.canW = true; f.canT = CANCEL_W; }
            if (f.atkT >= f.atkDur) {
                f.state = f.grounded ? 'idle' : 'jump'; f.atkT = 0; f.canW = false; f.fr = 0;
            }
        }
        if (f.hurtT > 0) f.hurtT = Math.max(0, f.hurtT - dt);

        if (heliActive) {
            // Spin through both jump_kick frames fast, resetting hitReg each
            // cycle so the move can actually land more than one hit.
            f.frT += dt;
            if (f.frT >= 1 / HELI_FRAME_FPS) {
                f.frT = 0;
                const n = f.anims.jump_kick.length;
                f.fr = (f.fr + 1) % Math.max(1, n);
                f.hitReg = false;
            }
        } else {
            const fpsMap = { idle: 5, walk: 10, punch_lo: 16, kick_lo: 14, block: 1, jump: 1, crouch: 1, jump_punch: 16, jump_kick: 14, crouch_punch: 16, crouch_kick: 14 };
            f._adv(dt, fpsMap[f.state] || 8);
        }
    }

    function resolveHit(attacker, defender, shake, fx) {
        const hb = attacker.hitbox();
        if (!hb || attacker.hitReg) return;
        if (aabbOverlap(hb, defender.rect())) {
            attacker.hitReg = true;
            const heavy = HEAVY.has(baseAttackKind(attacker.state));
            const baseDmg = DMG[baseAttackKind(attacker.state)] || 10;

            // Counter hit: defender was already mid-attack (committed,
            // hasn't landed their own hit yet) when this connected -
            // interrupting a startup earns bonus damage and extra hitstun.
            const isCounterHit = isAttackState(defender.state) && !defender.hitReg && !defender.guardBroken;
            let dmg = isCounterHit ? baseDmg * COUNTER_HIT_MULT : baseDmg;

            // Combo scaling only applies to genuinely unguarded hits -
            // blocked hits (free or chip) are a guard mechanic, not a combo.
            if (!defender.blocking) {
                defender.comboCounter = defender.comboWindowT > 0 ? defender.comboCounter + 1 : 1;
                defender.comboWindowT = COMBO_WINDOW;
                const scale = Math.max(COMBO_MIN_SCALE, 1 - (defender.comboCounter - 1) * COMBO_SCALE_STEP);
                dmg *= scale;
            }

            defender.takeDamage(dmg, heavy, isCounterHit);
            attacker.stop = heavy ? HS_HV : HS_LT;
            shake.hit(heavy ? 7.0 : 3.2);

            // The ONLY thing in the game that moves an opponent. A clean
            // hit shoves further than a blocked one, and after
            // KB_MAX_CHAIN nudges in one flurry they plant and stop
            // sliding - so a long combo can't walk somebody into the
            // corner. Walking into them does nothing at all (see
            // resolveFighterCollision).
            applyKnockback(defender, attacker, defender.blocking);

            fx.push({ x: hb.x + hb.w / 2, y: hb.y + hb.h / 2, l: heavy ? 9 : 6, ml: heavy ? 9 : 6, heavy });
            if (typeof playSfxRandom === 'function') {
                if (defender.blocking) playSfxRandom(SFX_BLOCKS, 0.5);
                else if (defender.ko) playSfxRandom(SFX_FINISHERS, 0.7); // this hit just finished them - the KO flag is already set by takeDamage() above
                else playSfxRandom(SFX_HITS, 0.55);
            }
            if (isCounterHit && typeof showToast === 'function') {
                showToast('⚡ Counter Hit!', 'success');
            }
        }
    }

    // Caps a HUD label's length so a long .sol domain from Online Fight
    // Club can't run past the health bar's edge - normal 'P1'/'P2' text
    // is always well under this, so it's a no-op for local/CPU matches.
    function hudLabel(label) {
        if (!label) return '';
        return label.length > 14 ? label.slice(0, 13) + '\u2026' : label;
    }

    function drawHUD(ctx, g) {
        const barW = 300, barH = 18;
        drawBar(ctx, 24, 20, barW, barH, g.p1.hp / MAX_HP, COL.GN, hudLabel(g.p1Label), false);
        drawBar(ctx, SW - 24 - barW, 20, barW, barH, g.p2.hp / MAX_HP, COL.BL, hudLabel(g.p2Label), true);

        // Guard meter - thin bar under each health bar. Gold while it has
        // charge (blocking's still free), red once empty (chip damage zone)
        // or during an active Guard Break.
        const guardBarH = 6, guardBarY = 20 + barH + 4;
        drawGuardBar(ctx, 24, guardBarY, barW, guardBarH, g.p1, false);
        drawGuardBar(ctx, SW - 24 - barW, guardBarY, barW, guardBarH, g.p2, true);

        ctx.textBaseline = 'top';
        ctx.font = "20px 'BonusStagePixel', monospace";
        ctx.fillStyle = COL.W;
        const t = Math.max(0, Math.ceil(g.timer));
        const tw = ctx.measureText(String(t)).width;
        ctx.fillText(String(t), SW / 2 - tw / 2, 18);
    }

    function drawGuardBar(ctx, x, y, w, h, fighter, rightAlign) {
        const pct = fighter.guardBroken ? 0 : Math.max(0, Math.min(1, fighter.guardMeter / GUARD_METER_MAX));
        const empty = fighter.guardBroken || fighter.guardMeter <= 0;
        ctx.fillStyle = COL.DK;
        ctx.fillRect(x, y, w, h);
        const fillW = w * pct;
        ctx.fillStyle = empty ? COL.RD : COL.YL;
        ctx.fillRect(rightAlign ? x + w - fillW : x, y, fillW, h);
        ctx.strokeStyle = COL.W;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
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

    // Draws pixel-font text with a black outline + drop shadow so it stays
    // readable over busy arena backgrounds no matter what's behind it.
    // ctx.font/textAlign/textBaseline must already be set by the caller.
    function drawOutlinedText(ctx, text, x, y, fillColor) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(text, x + 3, y + 3); // drop shadow
        ctx.fillStyle = '#000000';
        for (const [ox, oy] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, -2], [0, 2], [-2, 0], [2, 0]]) {
            ctx.fillText(text, x + ox, y + oy); // outline
        }
        ctx.fillStyle = fillColor;
        ctx.fillText(text, x, y); // fill on top
    }

    function drawEnd(ctx, g) {
        let title, col;
        if (g.phase === 'p1win') { title = 'PLAYER 1 WINS'; col = COL.GN; }
        else if (g.phase === 'p2win') { title = 'PLAYER 2 WINS'; col = COL.BL; }
        else { title = 'DRAW'; col = COL.W; }

        ctx.textBaseline = 'top';
        ctx.font = "26px 'BonusStagePixel', monospace";
        const tw = ctx.measureText(title).width;
        drawOutlinedText(ctx, title, SW / 2 - tw / 2, SH / 2 - 70, col);

        ctx.font = "13px 'BonusStagePixel', monospace";
        const h = 'ESC = Quit';
        const hw = ctx.measureText(h).width;
        drawOutlinedText(ctx, h, SW / 2 - hw / 2, SH / 2 + 60, COL.W);
    }

    // Pre-round "FIGHT!" card: punches in big, holds, fades out. Fighters
    // are drawn already-idle behind it (see frame()) since update() isn't
    // called for either player during 'intro', so they just stand ready.
    function drawIntro(ctx, g) {
        const growEnd = 0.15;
        const fadeStart = INTRO_DURATION - 0.2;
        const t = g.introT;
        let scale = 1, alpha = 1;
        if (t < growEnd) {
            const p = t / growEnd;
            scale = 1.7 - 0.7 * p; // punches in from big to normal size
            alpha = p;
        } else if (t > fadeStart) {
            const p = (t - fadeStart) / (INTRO_DURATION - fadeStart);
            alpha = 1 - p;
        }
        alpha = Math.max(0, Math.min(1, alpha));

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = "62px 'BonusStagePixel', monospace";
        ctx.translate(SW / 2, SH / 2 - 20);
        ctx.scale(scale, scale);

        const text = 'FIGHT!';
        // Chunky outline: same pixel font used everywhere else in the game,
        // just stamped 8x behind in dark before the bright fill on top -
        // no separate outlined font/asset needed for the arcade look.
        ctx.fillStyle = COL.DK;
        for (const [ox, oy] of [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, -4], [0, 4], [-4, 0], [4, 0]]) {
            ctx.fillText(text, ox, oy);
        }
        ctx.fillStyle = COL.YL;
        ctx.fillText(text, 0, 0);
        ctx.restore();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
    }

    // ---------------------------------------------------------------
    // MAIN LOOP
    // ---------------------------------------------------------------
    async function start(canvas) {
        if (typeof _refreshMiniGameAudioButtons === 'function') _refreshMiniGameAudioButtons(); // reflect whatever music/SFX state carried over from a previous match this session
        stop();
        const ctx = canvas.getContext('2d');
        canvas.width = SW; canvas.height = SH;

        if (!assetsPromise) {
            assetsPromise = Promise.all([
                loadFighterAnims('reiffer'),
                loadFighterAnims('conmen'),
                loadFighterAnims('wizard'),
                loadFighterAnims('undead'),
                loadFighterAnims('skullx'),
            ]);
        }
        const [reifferAnims, conmenAnims, wizardAnims, undeadAnims, skullxAnims] = await assetsPromise;
        const bg = await loadArenaBackground(window.fightClubOnlineActive ? window.fightClubOnlineArena : null); // always fresh - depends on whichever theme is active right now, not cached
        const anims = { reiffer: reifferAnims, conmen: conmenAnims, wizard: wizardAnims, undead: undeadAnims, skullx: skullxAnims };

        let g = newGame(anims, bg);
        if (typeof playSfxFile === 'function') playSfxFile('assets/sfx/fight/fight.mp3', 0.7);
        const shake = new Shake();
        const fx = [];

        const P1_BIND = { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', crouch: 'ArrowDown', punch: 'z', kick: 'x', block: ' ' };
        // P2 is CPU-only now (see updateCPUInput) - these are just internal
        // dictionary keys the AI sets programmatically, not real keyboard
        // keys, so they're deliberately NOT actual key names anymore. That
        // matters: if these matched P1_BIND's real key strings, a P1 key
        // press would leak into the CPU's virtual input for that frame
        // (they share the same `keys`/`justPressed` objects).
        const P2_BIND = { left: 'cpu_left', right: 'cpu_right', jump: 'cpu_jump', crouch: 'cpu_crouch', punch: 'cpu_punch', kick: 'cpu_kick', block: 'cpu_block' };

        keys = {}; justPressed = {};
        let lastSentInputSnapshot = null;
        onKeyDown = (ev) => {
            const k = normKey(ev.key);
            if (HANDLED_KEYS.has(ev.key) || HANDLED_KEYS.has(k)) ev.preventDefault();
            if (!keys[k]) justPressed[k] = true; // only a fresh press counts, not OS key-repeat while held
            keys[k] = true;

            if (ev.key === 'Escape') { if (typeof window.closeFightGame === 'function') window.closeFightGame(); return; }
        };
        onKeyUp = (ev) => { keys[normKey(ev.key)] = false; };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        let lastT = performance.now();
        // Resilience: the raf loop re-arms itself only at the BOTTOM of
        // frame(), so ANY exception mid-frame used to stop the game dead on
        // a frozen canvas with no way back. That turned every render bug -
        // including ones a remote player could trigger via fight_rooms -
        // into a permanent denial of service. Wrapping the body means a bad
        // frame is skipped and the next one still runs.
        function frame(now) {
            try {
                frameBody(now);
            } catch (err) {
                console.error('[fightgame] frame error (recovering, loop continues):', err);
                rafId = requestAnimationFrame(frame);
            }
        }

        function frameBody(now) {
            const dt = Math.min((now - lastT) / 1000, 0.05);
            lastT = now;
            const so = shake.off(); shake.update();

            if (g.phase === 'intro') {
                g.introT += dt;
                if (g.introT >= INTRO_DURATION) g.phase = 'playing';
            } else if (g.phase === 'playing') {
                g.timer -= dt;
                const p1 = g.p1, p2 = g.p2;

                // Stamp where each fighter stood BEFORE anything moved them
                // this frame. resolveFighterCollision() compares against
                // this to work out who walked into whom, so that a fighter
                // standing still is never displaced by one walking into
                // them. Must happen before any movement code runs.
                p1._prevX = p1.x; p2._prevX = p2.x;
                tickKnockbackRecovery(p1, dt);
                tickKnockbackRecovery(p2, dt);

                updateHumanFighter(dt, p1, P1_BIND);
                if (window.fightClubOnlineActive) {
                    // Real match: send what P1 (your real keys) just did to
                    // your opponent, and drive P2 from whatever they most
                    // recently sent back - only send when it actually
                    // changed, not every frame, so a held key doesn't spam
                    // the channel.
                    const outKeys = {
                        cpu_left: !!keys[P1_BIND.left], cpu_right: !!keys[P1_BIND.right],
                        cpu_jump: !!keys[P1_BIND.jump], cpu_crouch: !!keys[P1_BIND.crouch],
                        cpu_punch: !!keys[P1_BIND.punch], cpu_kick: !!keys[P1_BIND.kick],
                        cpu_block: !!keys[P1_BIND.block],
                    };
                    const snap = JSON.stringify(outKeys);
                    if (snap !== lastSentInputSnapshot) {
                        lastSentInputSnapshot = snap;
                        if (typeof sendFightSyncInput === 'function') sendFightSyncInput(outKeys);
                    }
                    updateRemoteInput(dt, p2, P2_BIND);
                } else {
                    updateCPUInput(dt, p2, p1, P2_BIND);
                }
                updateHumanFighter(dt, p2, P2_BIND);
                updateFighterCommon(dt, p1);
                updateFighterCommon(dt, p2);
                resolveFighterCollision(p1, p2);

                resolveHit(p1, p2, shake, fx);
                resolveHit(p2, p1, shake, fx);

                if (p1.ko || p2.ko) {
                    if (p2.ko && !p1.ko) {
                        g.phase = 'p1win'; p1.state = p1.grounded ? 'victory' : 'jump'; p1.fr = 0; p1.hurtT = 0;
                        p2.state = 'defeat'; p2.fr = 0; p2.hurtT = 0;
                    } else if (p1.ko && !p2.ko) {
                        g.phase = 'p2win'; p2.state = p2.grounded ? 'victory' : 'jump'; p2.fr = 0; p2.hurtT = 0;
                        p1.state = 'defeat'; p1.fr = 0; p1.hurtT = 0;
                    } else {
                        g.phase = 'draw';
                    }
                    if (g.phase === 'p2win') {
                        if (typeof playSfxFile === 'function') playSfxFile('assets/sfx/fight/game_over.mp3', 0.7); // you lost
                    } else if (g.phase === 'p1win') {
                        if (typeof playSfxFile === 'function') playSfxFile('assets/sfx/fight/you_win.mp3', 0.7); // you won
                    } else if (typeof playMiniGameSound === 'function') {
                        playMiniGameSound('fight_game_over'); // draw - synthesized stinger, no dedicated draw SFX yet
                    }
                } else if (g.timer <= 0) {
                    g.timer = 0;
                    if (p1.hp > p2.hp) { g.phase = 'p1win'; p1.state = p1.grounded ? 'victory' : 'jump'; p2.state = 'defeat'; }
                    else if (p2.hp > p1.hp) { g.phase = 'p2win'; p2.state = p2.grounded ? 'victory' : 'jump'; p1.state = 'defeat'; }
                    else { g.phase = 'draw'; }
                    p1.fr = 0; p2.fr = 0; p1.hurtT = 0; p2.hurtT = 0;
                    if (g.phase === 'p2win') {
                        if (typeof playSfxFile === 'function') playSfxFile('assets/sfx/fight/game_over.mp3', 0.7); // you lost
                    } else if (g.phase === 'p1win') {
                        if (typeof playSfxFile === 'function') playSfxFile('assets/sfx/fight/you_win.mp3', 0.7); // you won
                    } else if (typeof playMiniGameSound === 'function') {
                        playMiniGameSound('fight_game_over'); // draw - synthesized stinger, no dedicated draw SFX yet
                    }
                }
            } else {
                const winner = g.phase === 'p1win' ? g.p1 : (g.phase === 'p2win' ? g.p2 : null);
                const loser = g.phase === 'p1win' ? g.p2 : (g.phase === 'p2win' ? g.p1 : null);
                if (winner) {
                    if (!winner.grounded) {
                        // Was mid-air when they won - fall to the floor for
                        // real instead of freezing the victory pose in
                        // mid-jump. Victory animation only starts once
                        // they've actually landed.
                        applyGravity(winner, dt, false);
                        if (winner.grounded) { winner.state = 'victory'; winner.fr = 0; winner.frT = 0; }
                    } else {
                        winner.frT += dt;
                        if (winner.frT >= 1 / VICTORY_FPS) { winner.frT = 0; const n = (winner.anims.victory || [null]).length; winner.fr = (winner.fr + 1) % Math.max(1, n); }
                    }
                }
                if (loser) {
                    if (!loser.grounded) {
                        // Was mid-air when they lost - fall to the floor
                        // for real instead of freezing the defeat pose in
                        // mid-jump, same treatment as the winner above.
                        // Holds on the KO-reaction frame (fr stays 0) while
                        // falling, then the collapse sequence plays once
                        // they've actually landed.
                        applyGravity(loser, dt, false);
                    } else {
                        const n = (loser.anims.defeat && loser.anims.defeat.length) || 1;
                        if (loser.fr < n - 1) {
                            loser.frT += dt;
                            if (loser.frT >= 1 / DEFEAT_FPS) { loser.frT = 0; loser.fr = Math.min(n - 1, loser.fr + 1); }
                        }
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

            g.p1.draw(ctx, so);
            g.p2.draw(ctx, so);
            drawHUD(ctx, g);
            if (g.phase === 'intro') drawIntro(ctx, g);
            else if (g.phase !== 'playing') drawEnd(ctx, g);

            const leg = 'P1: \u2190\u2192 Move  \u2191 Jump  \u2193 Crouch  Z Punch  X Kick  Space Block   |   P2: CPU';
            ctx.font = "9px 'BonusStagePixel', monospace";
            ctx.fillStyle = '#aaaaaa';
            ctx.textAlign = 'center';
            ctx.fillText(leg, SW / 2, SH - 14);
            ctx.textAlign = 'left';

            // Clear "just pressed" pulses at the very end of the frame -
            // each physical press only gets this one frame to register,
            // which combined with the OS-repeat guard above is what
            // forces mashing instead of holding.
            justPressed = {};

            rafId = requestAnimationFrame(frame);
        }
        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
        if (onKeyUp) window.removeEventListener('keyup', onKeyUp);
        onKeyDown = onKeyUp = null;
        keys = {}; justPressed = {};
        if (typeof stopFightMusic === 'function') stopFightMusic();
    }

    return { start, stop };
})();
