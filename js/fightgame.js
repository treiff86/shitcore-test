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
    const DMG = { punch_lo: 5, kick_lo: 8, counter_lo: 10, throw_lo: 18 }; // throw_lo mirrors THROW_DMG below - kept literal because DMG is built before it // tuned so continuous unblocked hitting takes ~20-30s to KO, not ~5 hits
    const HEAVY = new Set(['kick_lo', 'counter_lo', 'throw_lo']);
    const HS_LT = 5, HS_HV = 9;

    /* ============================================================
       FRAME DATA - the thing that makes this feel like a fighting game
       ============================================================
       WHAT WAS WRONG BEFORE. hitbox() returned a live box the instant you
       pressed, and kept it live for the move's entire duration. Every
       attack was effectively frame-1, so exchanges resolved as "whoever
       pressed first wins" rather than "whoever read the other player".
       There was nothing to whiff-punish and no reason to space. It also
       left the counter-hit code below nearly dead: both attacks landed
       simultaneously, so it fired on a coin flip instead of on a read.

       Every move now runs STARTUP -> ACTIVE -> RECOVERY, in frames at 60fps:
         startup   committed, no hitbox yet. A faster move can interrupt -
                   which is what makes a counter hit a genuine read.
         active    the hitbox exists. Usually only a few frames.
         recovery  committed, no hitbox, cannot act. THIS is what makes a
                   whiffed attack punishable, and the main reason spacing
                   suddenly matters.

       HIT AND BLOCK STUN are separate from hitstop, and that separation is
       the whole game. Hitstop (HS_LT/HS_HV) freezes BOTH fighters, purely
       for impact feel. Stun freezes only the DEFENDER. The gap between the
       defender's stun and the attacker's remaining recovery is "frame
       advantage": plus means you keep your turn, minus means they punish
       you. Before this, both sides always unfroze together - so nothing
       was ever plus or minus and no move was ever unsafe.

       READING THE TABLE. The attacker's move runs to completion on
       schedule (updateFighterCommon ignores hitstop), so what they still
       owe after contact is (total - contactFrame). The defender is frozen
       for exactly `stun` frames. Therefore:
           advantage = stun - (total - contactFrame)
         punch on hit    19 - 12 = +7   links into another punch (4 startup)
         punch on block  13 - 12 = +1   safe, barely keeps your turn
         kick  on hit    25 - 19 = +6   still your turn
         kick  on block  10 - 19 = -9   PUNISHABLE by a 4-frame punch
       That last line is the point: the heavy hits harder and reaches
       further, and throwing it out carelessly now costs you the turn.
       ============================================================ */
    const FRAME = 1 / 60;
    const MOVES = {
        punch_lo:     { startup: 4, active: 3,  recovery: 9,  hitStun: 19, blockStun: 13 },
        kick_lo:      { startup: 7, active: 4,  recovery: 15, hitStun: 25, blockStun: 10 },
        crouch_punch: { startup: 4, active: 3,  recovery: 8,  hitStun: 18, blockStun: 12 },
        crouch_kick:  { startup: 6, active: 4,  recovery: 14, hitStun: 24, blockStun: 10 },
        // Air moves get long active windows and short recovery - landing
        // ends the move anyway, so recovery would be mostly invisible.
        jump_punch:   { startup: 4, active: 8,  recovery: 4,  hitStun: 20, blockStun: 14 },
        jump_kick:    { startup: 6, active: 10, recovery: 4,  hitStun: 24, blockStun: 16 },
        // The guard counter. Fast, because it is a reversal and has to
        // beat whatever they were about to do next. Long recovery, so a
        // wasted one costs you the turn as well as the meter.
        counter_lo:   { startup: 3, active: 3,  recovery: 20, hitStun: 30, blockStun: 0  },
        // The throw. Slower than the counter because it is the bigger
        // payoff, and its recovery is the worst in the game - a whiffed
        // throw should cost you the round's momentum.
        throw_lo:     { startup: 6, active: 3,  recovery: 28, hitStun: 46, blockStun: 0  },
    };
    function moveData(state) { return MOVES[state] || MOVES[baseAttackKind(state)] || MOVES.punch_lo; }
    function moveDuration(state) {
        const m = moveData(state);
        return (m.startup + m.active + m.recovery) * FRAME;
    }

    /* GUARD COUNTER - Z + X, in the moment right after you block a hit.

       WHAT THIS REPLACED. The first version was a standalone unblockable on
       its own key (C). It worked, but it was an OFFENSIVE option with no
       escape: once it started the defender had nothing. As a guard counter
       it becomes a DEFENSIVE option instead, which answers the same problem
       from the better side - an opponent leaning on you no longer pressures
       for free, and the player being pressured is the one holding the
       button. It also removes the need for a throw "tech", because there is
       nothing to escape from any more.

       WHY THE INPUT DOESN'T CLASH. Z and X are punch and kick, so reading
       both together would normally need an input buffer - and a buffer adds
       latency to every single punch. It doesn't here, because the counter
       is only read while you are IN BLOCKSTUN, a state where normal attacks
       are already locked out. There is nothing to disambiguate.

       IT COSTS GUARD METER, which is what stops it being free. The meter
       already decides how long you can keep blocking; now it also decides
       whether you can hit back out of a block. Spend it to escape pressure
       or save it to keep guarding - a real decision, built on a system that
       already existed rather than a new bar nobody asked for.

       STILL SPRITE-FREE: it borrows the punch frames, so it reads as a
       shove. It PLAYS correctly today and will LOOK right once there is
       art for it. */
    /* THE THROW - C, but only after blocking a BARRAGE.

       The guard counter (Z+X) answers a single blocked hit. This answers
       someone leaning on one button: block THROW_STREAK hits in a row and
       the throw unlocks, hitting far harder than the counter and putting
       them on the floor. An opponent who mashes the same attack is
       literally building your meter to punish them with.

       The streak has to be CONSECUTIVE and RECENT (THROW_STREAK_WINDOW),
       or blocks spread across a whole round would quietly bank into a
       free throw nobody earned. Taking a clean hit resets it - you have to
       actually hold the block, not trade. */
    const THROW_STREAK = 3;             // consecutive blocked hits to unlock it
    const THROW_STREAK_WINDOW = 1.6;    // seconds between blocks before the streak lapses
    const THROW_DMG = 18;               // vs kick 8, guard counter 10. Mirrored in DMG above.
    const THROW_RANGE = 64;             // px of grab reach past the body box
    const THROW_LAUNCH_VY = -430;       // upward kick, px/s - physics does the arc
    const THROW_LAUNCH_VX = 250;        // horizontal fling, px/s
    const THROWN_GROUND_T = 0.45;       // seconds spent on the floor before getting up
    /* INPUT BUFFER. `justPressed` lives for exactly one frame, and
       updateHumanFighter returns early during hitstop - so a C press that
       landed in the freeze after a blocked hit was thrown away with no
       feedback at all. Measured against the CPU while holding block, the
       defender is in hitstop 47% of the time and roughly 40% of correctly
       timed throw inputs were being discarded: press C, nothing happens,
       press again, nothing happens. Remembering the press for a few frames
       is the standard fix. 10 frames covers the longest hitstop in the game
       (9 for a heavy, 13 on a counter hit) without feeling sticky. */
    const THROW_BUFFER_FRAMES = 10;

    /* IDLE BREATHING - no sprites required.

       A Street Fighter idle bob is usually 2-4 drawn frames. This gets most
       of that for zero art by SQUASHING the sprite vertically about its own
       feet, which is a very different thing from sliding the whole sprite up
       and down: a translate lifts the shoes off the floor and reads as
       hovering, while a scale anchored at the baseline keeps the feet
       planted and moves the head and shoulders - which is what breathing
       actually looks like.

       PHASE IS PER-FIGHTER, and that matters more than the amount. Two
       characters breathing in perfect sync look like animatronics; a
       fraction of a cycle apart and they look alive. The offset is derived
       from the fighter's own start position so it is stable for the whole
       match rather than jittering frame to frame.

       If a character ever gets a REAL multi-frame idle drawn, this backs off
       automatically - see draw(). Hand-drawn always wins. */
    const IDLE_BREATH_AMP = 0.018;    // 1.8% vertical squash - deliberately subtle
    const IDLE_BREATH_HZ = 0.75;      // slow, roughly a resting breath
    const WALK_BOB_AMP = 0.010;       // a touch of the same on the walk cycle

    const LAND_RECOVER_T = 0.16;      // seconds of landing-absorb pose

    /* Dizzy skulls - the little cartoon birds that circle a stunned head.
       Drawn procedurally rather than from a sheet: they are three flat
       shapes, and drawing them in code means EVERY character gets them the
       moment they get guard broken, with no extra art to draw. */
    const SKULL_COUNT = 3;
    const SKULL_ORBIT_HZ = 0.85;      // laps per second
    const SKULL_RX = 34;              // horizontal radius of the orbit, px
    const SKULL_RY = 10;               // vertical - a squashed ellipse reads as perspective
    const SKULL_SIZE = 17;            // skull width at the front of the orbit
    const SKULL_DEPTH = 0.34;         // how much smaller/dimmer at the back
    const SKULL_HEAD_GAP = 2;        // px above the topmost ink of the artwork

    /* One skull, centred on (x, y), `w` px wide. Deliberately built from
       flat shapes with a dark outline so it stays readable at 9-13px, which
       is the size these actually render at. */
    function drawSkullGlyph(ctx, x, y, w) {
        const r = w / 2;
        const jawW = w * 0.52;
        const jawH = w * 0.30;

        ctx.save();
        ctx.translate(x, y);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(20, 12, 28, 0.85)';
        ctx.lineWidth = Math.max(1, w * 0.09);

        // Jaw first, so the cranium overlaps its top edge.
        ctx.fillStyle = '#efe9dd';
        ctx.beginPath();
        ctx.rect(-jawW / 2, r * 0.28, jawW, jawH);
        ctx.fill();
        ctx.stroke();

        // Cranium.
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eye sockets - the single most important detail at this size. Any
        // smaller than about 26% of the width and they vanish into the fill.
        const er = r * 0.30;
        ctx.fillStyle = 'rgba(24, 14, 32, 0.92)';
        ctx.beginPath();
        ctx.arc(-r * 0.38, -r * 0.10, er, 0, Math.PI * 2);
        ctx.arc(r * 0.38, -r * 0.10, er, 0, Math.PI * 2);
        ctx.fill();

        // Nose + a single tooth gap, drawn only when there are enough pixels
        // for them to read as anything but noise.
        if (w >= 10) {
            ctx.beginPath();
            ctx.moveTo(0, r * 0.10);
            ctx.lineTo(-r * 0.13, r * 0.34);
            ctx.lineTo(r * 0.13, r * 0.34);
            ctx.closePath();
            ctx.fill();

            ctx.lineWidth = Math.max(1, w * 0.07);
            ctx.strokeStyle = 'rgba(24, 14, 32, 0.7)';
            ctx.beginPath();
            ctx.moveTo(0, r * 0.30);
            ctx.lineTo(0, r * 0.30 + jawH);
            ctx.stroke();
        }
        ctx.restore();
    }
    const COUNTER_WINDOW = 0.32;      // seconds after blocking a hit to input it
    const COUNTER_METER_COST = 34;    // roughly a third of a full guard meter
    const CPU_COUNTER_CHANCE = 0.35;  // how often the CPU counters out of its own block
    const COUNTER_RANGE = 58;         // px of reach past the body box
    const COUNTER_KB = 96;            // px of shove - the whole point is "get off me"

    /* CANCELS - now only ON HIT.
       A cancel used to open at 40% of the move's duration whether or not it
       connected, so a whiffed attack could always be cancelled out of. That
       handed you a free escape from your own recovery and would have made
       whiff-punishing impossible even after recovery existed. Cancelling
       only on hit is the standard rule, and it is what turns punch -> kick
       into a real combo instead of a mash. */
    const CANCEL_W = 0.18;

    function baseAttackKind(state) {
        if (typeof state !== 'string') return null;
        // 'jump_punch' / 'crouch_punch' -> 'punch_lo', etc. - so damage and
        // hitbox lookups work the same regardless of variant.
        if (state === 'counter_lo') return 'counter_lo';
        if (state === 'throw_lo') return 'throw_lo';
        if (state.endsWith('_punch') || state === 'punch_lo') return 'punch_lo';
        if (state.endsWith('_kick') || state === 'kick_lo') return 'kick_lo';
        return null;
    }
    function isAttackState(state) {
        return state === 'punch_lo' || state === 'kick_lo' || state === 'jump_punch' || state === 'jump_kick' || state === 'crouch_punch' || state === 'crouch_kick' || state === 'counter_lo' || state === 'throw_lo';
    }
    function isCounterState(state) { return state === 'counter_lo'; }
    function isThrowState(state) { return state === 'throw_lo'; }

    // ---------------- Guard meter, chip damage, guard break ----------------
    // Blocking is free (0 damage) while the guard meter has charge. Each
    // blocked hit costs GUARD_COST_PER_BLOCK, so GUARD_METER_MAX / cost =
    // how many hits you can block for free before it runs out (5 at these
    // numbers). Once empty, further blocked hits deal chip damage that
    // scales from 1% to 10% of max HP over CHIP_BLOCKS_TO_BREAK more hits,
    // then Guard Break triggers.
    /* RETUNED from 20 / 5, which put a guard break ten consecutive blocked
       hits away - five to empty the meter, five more of chip. It worked, but
       measured against the CPU almost nobody holds block long enough to see
       it, so the dizzy art and the biggest punish in the game were both
       effectively unreachable. 25 / 3 makes it seven, which is still a long
       block string and still something you have to earn. */
    const GUARD_METER_MAX = 100;
    const GUARD_COST_PER_BLOCK = 25;
    const CHIP_BLOCKS_TO_BREAK = 3;
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

    /* THE KO. The last hit of a match used to play at exactly the same speed
       as the first, so the moment a round was decided read like any other
       exchange. Two beats fix it: everything stops dead on the impact frame,
       spark still hanging in the air, and then the fall plays back slow.
       Both are pure presentation - the outcome is already decided by the
       time either one starts. */
    const KO_FREEZE_T = 0.34;   // seconds absolutely nothing moves
    const KO_SLOW_T = 1.25;     // seconds of slow motion after the freeze
    const KO_SLOW_SCALE = 0.32; // how slowly time runs during it
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
            // Two airborne poses - a tucked rise and a reaching descent -
            // cut from the same sheet the landing frames came from, against
            // a shared crop so the tuck genuinely sits higher than the
            // descent. Which one shows is decided by vertical velocity, not
            // by a timer: see the jump branch in _surf(). Characters with a
            // one-frame jump are unaffected by any of it.
            jump:         ['assets/fight_game/undead_jump.webp?v=2', 2],
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
            // THROW ART. `throw` is the thrower (reach, grip, toss) and
            // `thrown` is the victim (airborne, landed). Genuine Undead is
            // the first character to have these; everyone else falls back
            // to punch/hurt frames until their art exists - see _surf().
            throw:    ['assets/fight_game/undead_throw.webp', 3],
            thrown:   ['assets/fight_game/undead_thrown.webp', 2],
            // Dizzy replaces the reused 'hurt' pose during a guard break -
            // the most dramatic moment in a round finally looks like one.
            dizzy:    ['assets/fight_game/undead_dizzy.webp', 2],
            // Landing recovery: absorb, rise, stand. Without it a fighter
            // snapped from airborne straight to idle with no weight at all.
            land:     ['assets/fight_game/undead_land.webp', 3],
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

    /* SHARED IMPACT FX - not per character.
       These are the same for everybody, so they load once and are reused by
       all five fighters. Loading them per character would fetch the same
       three files five times. They are also NOT put through the character
       area-normalisation: a spark is not a body, and normalising it against
       a standing pose would size it by pixel count rather than by how big
       the hit should feel. They get explicit on-screen heights instead. */
    const FX_FILES = {
        spark_big:   ['assets/fight_game/fx_spark_big.webp', 4, 96],
        spark_small: ['assets/fight_game/fx_spark_small.webp', 4, 68],
        dust:        ['assets/fight_game/fx_dust.webp', 3, 48],
    };
    /* Which spark a hit gets. Only a HEAVY hit that got through cleanly earns
       the big burst - a guard clash must not read like a clean hit, or
       blocking looks as rewarding as being hit. Its own function purely so
       the rule has one home and can be checked directly. */
    function pickSparkKind(heavy, blocked) {
        return (heavy && !blocked) ? 'spark_big' : 'spark_small';
    }

    let fxAnims = null;          // { kind: [canvas, ...] } once loaded
    let fxAnimsPromise = null;

    function loadFxAnims() {
        if (fxAnimsPromise) return fxAnimsPromise;
        fxAnimsPromise = (async () => {
            const out = {};
            for (const kind in FX_FILES) {
                const [path, count, targetH] = FX_FILES[kind];
                let img;
                try { img = await loadImage(path); }
                catch (e) { console.warn('[fightgame] missing fx sprite', path); out[kind] = []; continue; }
                const cellW = img.width / count, cellH = img.height;
                const scale = targetH / cellH;
                const frames = [];
                for (let i = 0; i < count; i++) {
                    const c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(cellW * scale));
                    c.height = Math.max(1, Math.round(cellH * scale));
                    const cx = c.getContext('2d');
                    /* Smoothing ON. These sheets are painted art being scaled
                       DOWN by more than half (a 210px spark cell to 96px on
                       screen), and nearest-neighbour downscaling of painted
                       art just throws away every other pixel row - the soft
                       edges of a spark turn into stair-steps. */
                    cx.imageSmoothingEnabled = true;
                    cx.imageSmoothingQuality = 'high';
                    cx.drawImage(img, i * cellW, 0, cellW, cellH, 0, 0, c.width, c.height);
                    frames.push(c);
                }
                out[kind] = frames;
            }
            fxAnims = out;
            return out;
        })();
        return fxAnimsPromise;
    }

    const BACKGROUNDS = ['assets/fight_game/bg_prison.webp', 'assets/fight_game/bg_market.webp', 'assets/fight_game/bg_wizard.webp', 'assets/fight_game/bg_skullx.webp', 'assets/fight_game/bg_undead.webp', 'assets/fight_game/bg_clay.webp'];
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
        'assets/fight_game/bg_clay.webp': {
            /* Clay Stonkz - the Wall St block, molded. Deliberately has NO
               music entry in FIGHT_ARENA_MUSIC_OVERRIDES (js/audio.js):
               playFightMusicForBackground() pauses on an arena it does not
               recognise, so this one is silent until a track exists.

               ground measured off the art at canvas scale. The road runs
               from the kerb at ~470 down past 520; 490 puts the fighters on
               the open asphalt in front of the hydrant rather than up on
               the far pavement.

               No platforms on purpose. The two pavements ARE higher than
               the road, but only by 32px on the left and 45px on the right
               - against a 220px fighter that is a kerb, not a ledge, and
               a ledge you can barely see but keep landing on reads as a
               bug. Every other arena's platform is 95px+ of real height. */
            ground: 490,
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

    /* ================= SPRITE SCALING =================
       THE BUG THIS REPLACES

       loadStrip() used to scale every strip so its FRAME height became
       exactly P_H. But a frame is just canvas - each state was exported
       with whatever padding suited it, so frame height says nothing about
       how big the character is inside it. Two strips of the same fighter,
       both forced to a 220px frame, render the character at completely
       different sizes if one has more empty space around it.

       Measured across the real art, that gave up to 49% swing in character
       size between poses of the SAME fighter - Conmen's death pose a third
       too small, Wizard's crouch nearly 40% too short, Reiffer's victory
       13% too big. Five hand-tuned correction constants had accumulated to
       paper over the worst cases, each a per-character, per-state fudge.

       THE FIX

       Scale by the ARTWORK, not the frame. Each strip is measured - the
       union of every frame's opaque pixels - and scaled so that artwork is
       the height the pose is meant to be. Padding stops mattering, and all
       five correction constants are gone.

       Poses that genuinely SHOULD differ in height are declared once, in
       the open, in POSE_HEIGHT below - rather than smuggled in as
       per-character corrections. */

    /* HOW A POSE'S SIZE IS DECIDED

       First attempt normalised each strip so its bounding-box HEIGHT hit a
       target. That is only a measure of the character while they are stood
       upright, and it broke badly the moment a pose was not:

         - Undead's death pose is a body falling DIAGONALLY. Short bounding
           box, wide bounding box. Forcing its height up to standing height
           inflated the entire sprite - it rendered roughly three times too
           big, lying across half the arena.
         - Skull X's crouch has a cape that still reaches the floor, so its
           box is nearly full height even though he is crouched. Squashing
           that box to 70% shrank the CHARACTER rather than the pose.

       Height was simply the wrong ruler. What actually stays constant as a
       character changes pose is how much of them there IS - the count of
       lit pixels. A body lying down has about the same pixel area as the
       same body standing; arms raised in a victory pose add height but
       barely any area.

       So every strip is now scaled so its OPAQUE PIXEL AREA matches the
       character's standing pose. Size stops depending on orientation, and
       the pose-height table is gone entirely: a crouch ends up shorter
       because a crouch IS shorter, not because a number said so. */

    /* SAFETY BAND, and why it bounds the OUTPUT rather than the scale.

       An early version clamped the scale FACTOR to within ~20% of the
       standing pose's. That was wrong, and visibly so: Conmen's block is
       exported at 120x240 while his walk is 668 tall, so his block
       legitimately needs about three times the scale to come out the same
       size. Clamping the factor crushed it to 44% and he blocked as a
       doll.

       Scale factors are meaningless to compare - every strip was exported
       at a different resolution. What is worth bounding is the RESULT: how
       tall the character actually ends up on screen. The band is wide
       enough to leave every real pose alone (a body on the floor is short,
       a victory pose with arms up is tall) and only catches a measurement
       that has gone properly wrong. */
    const POSE_MIN_H = 0.45;   // x P_H
    const POSE_MAX_H = 1.55;   // x P_H

    // Measures each frame's opaque box, then combines them two different
    // ways because the two jobs want different answers:
    //
    //   SCALE comes from the MEDIAN frame height. Not per-frame, which
    //   would scale a raised-foot walk frame back up to match the others
    //   and reintroduce the bobbing this system exists to kill. And not the
    //   union either: a victory animation that throws its arms up for one
    //   frame has a much taller union, so scaling the whole strip to fit it
    //   shrinks the character's BODY for the entire celebration - which is
    //   precisely the "victory dance gets too small" problem. The median
    //   ignores a single dramatic frame and describes the pose the
    //   animation actually sits at.
    //
    //   FOOT POSITION comes from the UNION bottom, so the lowest point the
    //   animation ever reaches is what rests on the floor and no frame ever
    //   sinks through it.
    // Measured on a DOWNSCALED copy, not the source. These strips are big -
    // some are over a thousand pixels tall and ten frames wide - and
    // scanning every one of them at full resolution added 2.6 seconds to
    // the first fight's load. A bounded copy costs a few milliseconds and
    // lands within a pixel or two once the result is scaled back, which is
    // far below anything visible.
    const MEASURE_MAX_H = 300;   // rows to scan; vertical precision is what matters here
    const MEASURE_MAX_W = 1200;  // columns to scan

    function measureStripArt(img, frameCount) {
        const cellW = img.width / frameCount, cellH = img.height;
        const s = Math.min(1, MEASURE_MAX_H / cellH, MEASURE_MAX_W / img.width);
        const mw = Math.max(1, Math.round(img.width * s));
        const mh = Math.max(1, Math.round(cellH * s));
        const mCellW = mw / frameCount;

        const c = document.createElement('canvas');
        c.width = mw; c.height = mh;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, img.width, cellH, 0, 0, mw, mh);
        let data;
        try { data = x.getImageData(0, 0, mw, mh).data; }
        catch (e) { return null; } // unreadable - caller falls back rather than guessing

        // Per-frame boxes.
        const fTop = new Array(frameCount).fill(mh);
        const fBot = new Array(frameCount).fill(-1);
        const fArea = new Array(frameCount).fill(0);
        let left = mw, right = -1, unionBottom = -1;
        for (let yy = 0; yy < mh; yy++) {
            const row = yy * mw * 4;
            for (let xx = 0; xx < mw; xx++) {
                // Threshold is low on purpose: downscaling softens the very
                // edge of the artwork, and a high cut-off would eat a pixel
                // or two off every measurement.
                if (data[row + xx * 4 + 3] > 4) {
                    const fi = Math.min(frameCount - 1, Math.floor(xx / mCellW));
                    fArea[fi]++;
                    if (yy < fTop[fi]) fTop[fi] = yy;
                    if (yy > fBot[fi]) fBot[fi] = yy;
                    if (yy > unionBottom) unionBottom = yy;
                    const inCell = xx % mCellW;
                    if (inCell < left) left = inCell;
                    if (inCell > right) right = inCell;
                }
            }
        }
        if (unionBottom < 0) return null;

        const heights = [], areas = [];
        for (let i = 0; i < frameCount; i++) {
            if (fBot[i] < 0) continue;
            heights.push(fBot[i] - fTop[i] + 1);
            areas.push(fArea[i]);
        }
        if (!heights.length) return null;
        heights.sort((a, b) => a - b);
        areas.sort((a, b) => a - b);
        const median = heights[Math.floor(heights.length / 2)];
        const medianArea = areas[Math.floor(areas.length / 2)];

        // Back to source pixels so every caller stays in source units.
        const inv = 1 / s;
        /* The highest ink in the whole strip. Poses are exported with wildly
           different amounts of empty space above the head, so anything that
           needs to sit ABOVE a character (the dizzy skulls) has to measure
           the artwork rather than trust the frame's top edge. */
        let unionTop = Infinity;
        for (let i = 0; i < frameCount; i++) if (fBot[i] >= 0 && fTop[i] < unionTop) unionTop = fTop[i];
        if (!isFinite(unionTop)) unionTop = 0;
        return {
            top: unionTop * inv,
            bottom: unionBottom * inv,
            left: left * inv,
            right: right * inv,
            artH: median * inv,                  // still used for the standing reference
            artW: (right - left + 1) * inv,
            // Area is measured on the DOWNSCALED copy, so convert back by
            // inv squared - it is an area, not a length.
            artArea: medianArea * inv * inv,
        };
    }

    // Copies a strip's measurements onto an array derived from it. Any
    // frame list built by hand rather than returned by loadStrip() must go
    // through this, or draw() falls back to defaults and the pose hovers.
    function withStripMeta(target, source) {
        if (source) {
            target.footPad = source.footPad;
            target.headPad = source.headPad;
            target.artW = source.artW;
            target.artCx = source.artCx;
        }
        return target;
    }

    // Loads and measures a strip WITHOUT rendering it. Scale can't be
    // decided per-strip any more: it depends on the character's standing
    // pose, which may not have been measured yet. So measurement and
    // rendering are two passes.
    async function measureStrip(fullPath, frameCount) {
        let img;
        try { img = await loadImage(fullPath); }
        catch (e) { console.warn('[fightgame] missing sprite', fullPath, e); return null; }
        return { img, frameCount, art: measureStripArt(img, frameCount) };
    }

    // Renders a measured strip at an explicit scale.
    function renderStrip(m, scale) {
        if (!m) return [];
        const { img, frameCount, art } = m;
        const cellW = img.width / frameCount;
        const cellH = img.height;
        const outW = Math.max(1, Math.round(cellW * scale));
        const outH = Math.max(1, Math.round(cellH * scale));
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
        // Carried on the array so draw() can put this pose's feet on the
        // ground and its body on the fighter's collision box, whatever
        // padding this particular export happened to have.
        frames.footPad = art ? Math.round((cellH - 1 - art.bottom) * scale) : 0;
        frames.headPad = art ? Math.round(art.top * scale) : 0;   // empty space ABOVE the artwork
        frames.artW = art ? Math.round(art.artW * scale) : outW;
        frames.artCx = art ? Math.round(((art.left + art.right) / 2) * scale) : outW / 2;
        return frames;
    }

    async function loadFighterAnims(key) {
        const files = FIGHTER_ANIM_FILES[key];

        // PASS 1 - measure every strip. Nothing is rendered yet, because the
        // scale each one needs depends on the character's standing pose.
        const measured = {};
        for (const state in files) {
            const [path, count] = files[state];
            measured[state] = await measureStrip(path, count);
        }

        // The standing reference. Its scale is set the old way - artwork
        // height to P_H - so standing characters come out exactly the size
        // they already were, and nothing about the game's feel shifts.
        const refKey = (measured.walk && measured.walk.art) ? 'walk'
                     : ((measured.idle && measured.idle.art) ? 'idle' : null);
        const ref = refKey ? measured[refKey] : null;
        const refScale = ref ? (P_H / ref.art.artH) : 1;
        // Target lit-pixel count for this character, in on-screen pixels.
        // Every other pose is scaled to match it.
        const targetArea = ref ? (ref.art.artArea * refScale * refScale) : 0;

        // PASS 2 - render each strip at the scale that makes its pixel area
        // match the standing pose.
        const anims = {};
        for (const state in files) {
            const m = measured[state];
            if (!m) { anims[state] = []; continue; }
            let scale = refScale;
            if (m.art && targetArea > 0 && m.art.artArea > 0) {
                scale = Math.sqrt(targetArea / m.art.artArea);
                // Guard on the RESULT, not the factor - see the note on
                // POSE_MIN_H. Only trips when a measurement has genuinely
                // gone wrong, and says so rather than failing quietly.
                const outH = m.art.artH * scale;
                const lo = P_H * POSE_MIN_H, hi = P_H * POSE_MAX_H;
                if (outH < lo || outH > hi) {
                    const fixed = (outH < lo ? lo : hi) / m.art.artH;
                    console.warn(`[fightgame] ${key}/${state}: area scaling wanted ${Math.round(outH)}px tall, outside ${Math.round(lo)}-${Math.round(hi)} - clamped`);
                    scale = fixed;
                }
            } else if (m.art) {
                scale = P_H / m.art.artH;   // no reference to compare against
            }
            anims[state] = renderStrip(m, scale);
        }
        // Characters with no idle strip of their own stand on the first
        // frame of their walk cycle. Building a NEW array here would drop
        // the measurements loadStrip() attached to the original - and those
        // are exactly what put the feet on the floor and the body on the
        // collision box, so the derived pose would hover by however much
        // padding its source export happened to have. Carry them across.
        anims.idle = (anims.idle && anims.idle.length)
            ? anims.idle
            : (anims.walk.length ? withStripMeta([anims.walk[0]], anims.walk) : []);

        /* FOOT ALIGNMENT is now per STRIP, not per character.

           Every strip already knows its own `footPad` - the gap between the
           bottom of its frame and the bottom of its artwork, measured in
           loadStrip() at the scale that strip was actually rendered at. So
           each pose lands its own feet on the floor, rather than every pose
           inheriting one number measured off the walk cycle. That old
           approach was right for characters whose exports were uniform and
           wrong for everyone else.

           BODY WIDTH is fixed here too. `_fw` - the collision box, the
           stage clamp, and the origin every hitbox is measured from - used
           to be overwritten on every single frame with the current sprite
           CANVAS width. So a fighter's hitbox silently changed shape
           mid-animation, and a pose exported on a wider canvas got a wider
           body for no reason the player could see. It is now measured once,
           from the standing pose's actual artwork, and never changes. */
        // Measured from the standing pose's artwork, with only a sanity
        // clamp. Deliberately NOT normalised across characters: the Wizard
        // and Skull X really are wider silhouettes because of the robe and
        // the cape, and those were already their effective widths while
        // walking, so keeping them preserves the spacing the game already
        // had. What changes is that the number now holds still - it used to
        // swing from 83px to 315px between Reiffer's own animation frames.
        const stand = (anims.walk && anims.walk.length) ? anims.walk : anims.idle;
        anims._bodyW = Math.max(70, Math.min(260, Math.round((stand && stand.artW) || 90)));

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
            // Fixed for the whole match, measured from this character's
            // standing artwork (see loadFighterAnims). Everything positional
            // hangs off this - the collision box, the stage clamp, every
            // hitbox origin - so it must not change between animation
            // frames the way it used to.
            this._fw = (anims && anims._bodyW) || 90;
            this._strip = null;
            this.atkT = 0; this.atkDur = 0; this.hitReg = false; this.canW = false; this.canT = 0;
            this.stop = 0;   // HITSTOP - freezes BOTH fighters, impact feel only
            this.landT = 0;           // >0 while playing the landing-absorb pose
            this._breathT = 0;
            // Phase derived from the spawn X so the two fighters are never in
            // lockstep - synchronised breathing reads as robotic.
            this._breathPhase = ((x || 0) % 97) / 97 * Math.PI * 2;
            this.counterWindowT = 0;  // seconds left to input a guard counter
            this.blockStreak = 0;     // consecutive blocked hits - unlocks the throw
            this.blockStreakT = 0;    // seconds left before that streak lapses
            this.thrownT = 0;         // >0 while being thrown (airborne, then floored)
            this.thrownGrounded = false;
            this.stunIsBlock = false; // was that stun from blocking, or from eating it?
            this.stunT = 0;  // HIT/BLOCK STUN - freezes only THIS fighter, in seconds.
                             // The difference between the two is where frame
                             // advantage comes from; see the FRAME DATA note above.

            this.blocking = false;
            this.hurtT = 0;
            this.heliT = 0;
            this.ko = false;

            // Guard meter / chip damage / guard break
            this.guardMeter = GUARD_METER_MAX;
            this.chipBlockCount = 0;
            this.guardBroken = false;
            this.guardBreakT = 0;
            this.throwBufT = 0;   // seconds a remembered throw press stays live
            /* Held through the FIGHT! card, then dropped. Both fighters used
               to stand in a plain idle for that whole second, so the round
               did not so much start as simply stop being paused. */
            this.introPose = true;
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

        // Which phase of the move we're in right now. Everything about how
        // the game feels hangs off this being correct.
        attackPhase() {
            if (!isAttackState(this.state)) return null;
            const m = moveData(this.state);
            /* EPSILON IS NOT OPTIONAL HERE. atkT accumulates by += dt, so
               after 7 frames it holds 6.9999999... rather than 7. Comparing
               that raw against integer frame counts moves every phase
               boundary by a frame in whichever direction the error happens
               to fall - a 3-frame active window measured as 4, a 4-frame one
               measured as 3. Rounding to the nearest frame first makes the
               boundaries land exactly where the table says they do. */
            const f = Math.floor(this.atkT / FRAME + 1e-6);
            if (f < m.startup) return 'startup';
            if (f < m.startup + m.active) return 'active';
            return 'recovery';
        }

        hitbox() {
            // ONLY during the active window. Returning a box during startup
            // or recovery is exactly the bug this rework exists to fix.
            if (!isAttackState(this.state) || this.hitReg) return null;
            if (this.attackPhase() !== 'active') return null;

            const base = baseAttackKind(this.state);
            if (base === 'punch_lo') {
                const ex = this.facing === 1 ? this.x + this._fw - 6 : this.x - 40;
                return { x: ex, y: this.y + P_H * 0.30, w: 46, h: 30 };
            }
            if (base === 'kick_lo') {
                const ex = this.facing === 1 ? this.x + this._fw - 4 : this.x - 46;
                return { x: ex, y: this.y + P_H * 0.55, w: 54, h: 28 };
            }
            if (base === 'counter_lo') {
                // Short reach and tall - a counter means "get off me", so it
                // has to connect with someone already in your face.
                const ex = this.facing === 1 ? this.x + this._fw - 10 : this.x - (COUNTER_RANGE - 10);
                return { x: ex, y: this.y + P_H * 0.25, w: COUNTER_RANGE, h: P_H * 0.5 };
            }
            if (base === 'throw_lo') {
                /* A grab box: short, and TALL enough to catch a crouching
                   opponent, because a throw that whiffs on someone ducking
                   would be maddening for a move you had to earn with three
                   blocks. Without this case hitbox() returned null and the
                   throw animation played through without ever connecting. */
                const ex = this.facing === 1 ? this.x + this._fw - 12 : this.x - (THROW_RANGE - 12);
                return { x: ex, y: this.y + P_H * 0.15, w: THROW_RANGE, h: P_H * 0.75 };
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
            this.atkDur = moveDuration(kind);
            if (typeof playSfxFile === 'function') playSfxFile(baseKind === 'punch' ? SFX_PUNCH_WHOOSH : SFX_KICK_WHOOSH, 0.35);
        }

        // True once they have blocked a genuine barrage - read by the HUD
        // so the player can SEE the throw is available, not guess.
        throwReady() {
            return this.grounded && !this.guardBroken
                && this.blockStreakT > 0 && this.blockStreak >= THROW_STREAK;
        }

        beginThrow() {
            if (!this.throwReady()) return false;
            this.blockStreak = 0; this.blockStreakT = 0;   // spent
            this.blocking = false; this.crouching = false;
            this.stunT = 0; this.stunIsBlock = false; this.stop = 0;
            this.state = 'throw_lo'; this.atkT = 0; this.hitReg = false;
            this.canW = false; this.canT = 0;
            this.fr = 0; this.frT = 0;
            this.atkDur = moveDuration('throw_lo');
            if (typeof playSfxFile === 'function') playSfxFile(SFX_KICK_WHOOSH, 0.55);
            return true;
        }

        /* Being thrown. The ARC IS PHYSICS, not animation: the victim is
           launched with a real velocity and gravity brings them down, so the
           two sprite frames only ever have to say "airborne" and "on the
           floor". That is why two frames is enough for this to read properly
           - trying to animate the whole arc would have needed six. */
        launchThrown(fromX) {
            this.state = 'thrown';
            this.fr = 0; this.frT = 0;
            this.grounded = false;
            this.thrownGrounded = false;
            this.thrownT = 0;
            this.vy = THROW_LAUNCH_VY;
            this.vx = (this.x < fromX ? -1 : 1) * THROW_LAUNCH_VX;
            this.blocking = false; this.crouching = false;
            this.stunT = 0; this.stop = 0;
            this.blockStreak = 0; this.blockStreakT = 0;
            this.comboCounter = 0; this.comboWindowT = 0;
        }

        /* Grounded only, and only out of a block. Returns false when it
           can't fire, so the caller can tell the difference between "not
           now" and "not enough meter" instead of the input just vanishing. */
        beginGuardCounter() {
            if (!this.grounded || this.guardBroken) return false;
            if (this.counterWindowT <= 0) return false;          // not fresh off a block
            if (this.guardMeter < COUNTER_METER_COST) return false;

            this.guardMeter = Math.max(0, this.guardMeter - COUNTER_METER_COST);
            this.counterWindowT = 0;   // one per block, no double-dipping
            this.blocking = false;
            this.crouching = false;
            this.stunT = 0;            // the counter IS the escape from blockstun
            this.stunIsBlock = false;
            this.stop = 0;
            this.state = 'counter_lo'; this.atkT = 0; this.hitReg = false;
            this.canW = false; this.canT = 0;
            this.fr = 0; this.frT = 0;
            this.atkDur = moveDuration('counter_lo');
            if (typeof playSfxFile === 'function') playSfxFile(SFX_KICK_WHOOSH, 0.5);
            return true;
        }

        // rawDmg has already had counter-hit and combo scaling applied by
        // resolveHit() by the time it gets here - this method's only job is
        // deciding how blocking/guard state affects it.
        takeDamage(rawDmg, heavy, isCounterHit, attackState) {
            let dmg;
            const move = attackState ? moveData(attackState) : MOVES.punch_lo;
            const unblockable = !!(attackState && (isCounterState(attackState) || isThrowState(attackState)));

            /* Stun is applied to the DEFENDER ONLY and is what creates
               frame advantage - see the FRAME DATA note at the top. It runs
               AFTER hitstop (`stop`), which freezes both fighters equally
               for impact feel and grants nobody an advantage.
               Counter hits add a few frames, which is what makes reading an
               opponent's startup actually pay. */
            /* STUN IS INCLUSIVE OF HITSTOP, and this is the subtle part.
               updateHumanFighter gates on `stop` FIRST and `stunT` second,
               so they run back to back - a defender given both is frozen for
               stop + stun frames, not stun frames. Meanwhile
               updateFighterCommon advances the ATTACKER's move timer with no
               hitstop check at all, so their move ends on schedule
               regardless. Left uncorrected every exchange came out ~5 frames
               worse for the attacker than the table claims: measurement had
               a "+1 on block" punch landing at -3. Subtracting the hitstop
               already applied makes the defender's total freeze exactly
               `frames`, which is what the table means. */
            const applyStun = (frames, wasBlocked) => {
                const extra = isCounterHit ? COUNTER_HIT_EXTRA_STOP : 0;
                const total = frames + extra;
                const already = this.stop || 0;
                this.stunT = Math.max(this.stunT || 0, Math.max(0, total - already) * FRAME);
                this.stunIsBlock = !!wasBlocked;
            };

            if (unblockable && !this.guardBroken) {
                // A throw ignores blocking entirely - that is its entire
                // reason for existing. It still can't hit someone already
                // guard-broken any harder than the normal path does.
                dmg = Math.round(rawDmg);
                this.hurtT = HURT_FLASH_T;
                this.stop = HS_HV + (isCounterHit ? COUNTER_HIT_EXTRA_STOP : 0);
                this.timeSinceBlockOrHit = 0;
                this.chipBlockCount = 0;
                this.blocking = false;   // yanked out of the block stance
                applyStun(move.hitStun);
                this.hp = Math.max(0, this.hp - dmg);
                if (this.hp <= 0) this.ko = true;
                return dmg;
            }

            if (this.guardBroken) {
                // Fully vulnerable - blocking isn't possible during a guard
                // break, so this always behaves like an unblocked hit.
                dmg = Math.round(rawDmg);
                this.hurtT = HURT_FLASH_T;
                this.stop = (heavy ? HS_HV : HS_LT) + (isCounterHit ? COUNTER_HIT_EXTRA_STOP : 0);
                this.timeSinceBlockOrHit = 0;
                applyStun(move.hitStun);
            } else if (this.blocking) {
                this.timeSinceBlockOrHit = 0;
                // The defender gets hitstop on a block too. Previously only
                // the ATTACKER froze on a blocked hit, which quietly handed
                // the defender ~5 free frames on every single block.
                this.stop = heavy ? HS_HV : HS_LT;
                // Blockstun is shorter than hitstun - that gap is what makes
                // blocking a way to survive rather than a way to win the turn.
                applyStun(move.blockStun, true);
                // ...and blocking now also opens the guard-counter window.
                // Deliberately a touch longer than blockstun so the input
                // still registers a few frames after guard is released -
                // demanding a frame-perfect release would be miserable.
                this.counterWindowT = COUNTER_WINDOW;
                // A blocked hit extends the barrage streak that unlocks the
                // throw. Consecutive AND recent: blockStreakT lapsing is what
                // stops blocks spread over a round banking into a free throw.
                this.blockStreak = (this.blockStreakT > 0 ? this.blockStreak : 0) + 1;
                this.blockStreakT = THROW_STREAK_WINDOW;
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
                applyStun(move.hitStun);
                // Taking one clean hit wipes the barrage streak. The throw is
                // a reward for actually holding a block, not for trading.
                this.blockStreak = 0; this.blockStreakT = 0;
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
            /* SQUARING UP. During the FIGHT! card, hold the first frame of
               the victory strip - every character has one, it is already a
               planted "come on then" stance, and holding one frame reads as
               a ready pose rather than as a celebration. `state` is left
               alone on purpose: this only chooses art, so nothing that keys
               off state (hitboxes, the frame data) can see it at all. */
            if (this.introPose && this.anims.victory && this.anims.victory.length) {
                this._strip = this.anims.victory;
                return this.anims.victory[0];
            }
            // The guard counter still borrows the punch strip - it reads as
            // a shove, which is what it is.
            if (this.state === 'counter_lo') stateForFrames = 'punch_lo';
            /* The throw has REAL art now, but only for characters who have
               been drawn yet. Genuine Undead is first; everyone else falls
               back to punch (thrower) and hurt (victim) so the move stays
               playable rather than rendering an empty frame. */
            if (this.state === 'throw_lo') {
                stateForFrames = (this.anims.throw && this.anims.throw.length) ? 'throw' : 'punch_lo';
            }
            if (this.state === 'thrown') {
                stateForFrames = (this.anims.thrown && this.anims.thrown.length) ? 'thrown' : 'hurt';
            }
            /* Guard break used to reuse the plain 'hurt' pose, so the single
               most dramatic moment in a round looked like any other hit.
               Characters without dizzy art keep the old behaviour. */
            if (this.guardBroken && this.anims.dizzy && this.anims.dizzy.length) {
                stateForFrames = 'dizzy';
            } else if (this.landT > 0 && this.grounded && !isAttackState(this.state)
                       && this.anims.land && this.anims.land.length) {
                // The landing-absorb pose, played only while landT is
                // counting down and only if nothing more important is
                // happening - an attack must always win the sprite.
                stateForFrames = 'land';
            }
            if (this.state === 'block') {
                if (!this.grounded && this.anims.jump_block && this.anims.jump_block.length) stateForFrames = 'jump_block';
                else if (this.grounded && this.crouching && this.anims.crouch_block && this.anims.crouch_block.length) stateForFrames = 'crouch_block';
            }
            const frames = this.anims[stateForFrames] && this.anims[stateForFrames].length ? this.anims[stateForFrames] : this.anims.idle;
            if (!frames || !frames.length) return null;
            // Remembered so draw() can read this strip's measured foot
            // padding and artwork centre. `_fw` is deliberately NOT touched
            // here any more - it used to be reassigned to this frame's
            // canvas width every single frame, which silently changed the
            // fighter's collision box and every hitbox origin mid-animation.
            this._strip = frames;

            /* THE JUMP ARC. A multi-frame jump must not run on a timer: the
               pose has to match what the body is actually doing, or a
               fighter reads as descending while still going up. Velocity
               picks it instead - rising takes the tucked frame, falling
               takes the reaching one - which also means a short hop and a
               full-height jump both look right without any tuning.
               A one-frame jump strip falls through this untouched. */
            if (stateForFrames === 'jump' && frames.length > 1) {
                const i = this.vy < 0 ? 0 : Math.min(frames.length - 1, 1);
                return frames[i];
            }
            return frames[this.fr % frames.length];
        }

        /* Vertical scale factor for the idle breath. 1 means "draw normally",
           which is what every state other than a grounded idle/walk gets -
           an attack or a jump must never be squashed, because their timing
           is what the whole frame-data system rests on. */
        breathScale() {
            if (!this.grounded || this.ko || this.guardBroken) return 1;
            let amp = 0;
            if (this.state === 'idle') {
                // A character with a real multi-frame idle is already
                // animated; squashing it too would fight the artist.
                const idleFrames = this.anims && this.anims.idle;
                if (idleFrames && idleFrames.length > 1) return 1;
                amp = IDLE_BREATH_AMP;
            } else if (this.state === 'walk') {
                amp = WALK_BOB_AMP;
            } else {
                return 1;
            }
            const t = (this._breathT || 0);
            return 1 + amp * Math.sin(t * Math.PI * 2 * IDLE_BREATH_HZ + (this._breathPhase || 0));
        }

        /* Three little skulls orbiting the head while guard-broken - the
           classic "seeing birds" cue. Called AFTER the sprite has been drawn
           and after ctx.restore(), so no mirror or breath transform is still
           on the context and the skulls always orbit the same direction
           regardless of which way the fighter is facing.
           `cx` / `topY` are already screen coordinates. */
        drawDizzySkulls(ctx, cx, topY) {
            const t = this._breathT || 0;
            const base = t * Math.PI * 2 * SKULL_ORBIT_HZ + (this._breathPhase || 0);
            const cy = topY - SKULL_HEAD_GAP;

            // Painter's order: draw the far skulls first so the near ones
            // overlap them, which is what sells the orbit as a circle rather
            // than three dots sliding along a line.
            const order = [];
            for (let i = 0; i < SKULL_COUNT; i++) {
                const a = base + (i / SKULL_COUNT) * Math.PI * 2;
                order.push({ a, depth: (Math.sin(a) + 1) / 2 });   // 0 = far, 1 = near
            }
            order.sort((p, q) => p.depth - q.depth);

            ctx.save();
            for (const s of order) {
                const scale = 1 - SKULL_DEPTH * (1 - s.depth);
                const w = SKULL_SIZE * scale;
                const x = cx + Math.cos(s.a) * SKULL_RX;
                const y = cy + Math.sin(s.a) * SKULL_RY;
                ctx.globalAlpha = 0.55 + 0.45 * s.depth;
                drawSkullGlyph(ctx, x, y, w);
            }
            ctx.restore();
        }

        draw(ctx, so) {
            const img = this._surf();
            if (!img) return;
            const strip = this._strip;   // the array this frame came from, carrying its measurements

            // VERTICAL: put the artwork's FEET on the fighter's baseline.
            // Anchoring on the frame's bottom edge alone would leave any
            // pose exported with empty space beneath the shoes hovering by
            // exactly that much - and every export has a different amount.
            const footPad = (strip && strip.footPad) || 0;
            const sy = Math.round(this.y + P_H - img.height + so[1] + footPad);

            // HORIZONTAL: centre the artwork on the collision box, rather
            // than aligning the frame's left edge to it. Frames differ in
            // width from pose to pose, so left-aligning made the character
            // visibly slide sideways whenever the state changed - most
            // obvious going into and out of a crouch.
            const bodyCx = this.x + this._fw / 2;
            const artCx = (strip && strip.artCx != null) ? strip.artCx : img.width / 2;
            const sx = Math.round(bodyCx - artCx + so[0]);

            /* The breath is applied as a scale about the FEET line
               (sy + img.height), so the shoes stay welded to the floor and
               only the body rises and falls. Scaling about the sprite's own
               origin instead would lift the whole character off the ground -
               the hovering look this is specifically avoiding. */
            const bs = this.breathScale();
            const needsBreath = bs !== 1;
            const footY = sy + img.height;

            if (this.facing === -1) {
                // Mirror about the artwork's own centre, not the frame's -
                // otherwise a frame with lopsided padding jumps sideways
                // the moment the fighter turns around.
                ctx.save();
                if (needsBreath) { ctx.translate(0, footY); ctx.scale(1, bs); ctx.translate(0, -footY); }
                ctx.translate(Math.round(bodyCx + artCx + so[0]), sy);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0);
                ctx.restore();
            } else if (needsBreath) {
                ctx.save();
                ctx.translate(0, footY); ctx.scale(1, bs); ctx.translate(0, -footY);
                ctx.drawImage(img, sx, sy);
                ctx.restore();
            } else {
                ctx.drawImage(img, sx, sy);
            }

            /* Last, on top of everything and outside every transform above.
               `sy` is the top of the artwork, so the skulls sit a fixed gap
               above the head no matter how tall this character's dizzy pose
               happens to be. */
            if (this.guardBroken && !this.ko) {
                /* `sy + headPad` is the top of the actual INK, not of the
                   frame. Anchoring on the frame instead left the skulls
                   orbiting empty air a good 60px over the character's head,
                   because every pose is exported with a different amount of
                   headroom above the drawing. */
                const headPad = (strip && strip.headPad) || 0;
                this.drawDizzySkulls(ctx, bodyCx + so[0], sy + headPad);
            }
        }
    }

    // ---------------------------------------------------------------
    // GAME STATE
    // ---------------------------------------------------------------
    // Per-character cache of loaded animation sets. Was a single promise
    // holding all five; now each character is fetched at most once per
    // session, the first time somebody actually fights as or against them.
    const fighterAnimCache = Object.create(null);
    let rafId = null;
    let keys = {};
    let justPressed = {}; // set true on a genuine new keydown, cleared every frame - forces mashing instead of holding
    let onKeyDown, onKeyUp;

    const HANDLED_KEYS = new Set([
        'a', 'd', 'w', 's', 'z', 'x', 'c', ' ',
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', '/',
        'Shift', 'Escape',
    ]);

    function normKey(k) {
        if (k.length === 1 && /[a-zA-Z]/.test(k)) return k.toLowerCase();
        return k;
    }

    const FIGHTER_KEYS = ['reiffer', 'conmen', 'wizard', 'undead', 'skullx'];
    const isRealFighter = (k) => typeof k === 'string' && FIGHTER_KEYS.indexOf(k) !== -1;

    /* Decides who is fighting, BEFORE any art is downloaded.
       This used to happen inside newGame() - after all five characters had
       already been loaded - which is why all five were loaded in the first
       place. Choosing first means only the two in the match get fetched.

       SECURITY: in an online match these keys come from the fight_rooms
       table, which any anonymous person can write to. An unrecognised key
       (or "__proto__" / "constructor") used to make anims[key] undefined,
       which threw on the first frame - and since the rAF loop only re-arms
       at the BOTTOM of frame(), that single throw killed the opponent's
       game permanently on a frozen canvas. Validating against an
       allow-list here means a hostile key can no longer even reach the
       loader, let alone the game. */
    function pickFighterKeys() {
        const online = window.fightClubOnlineActive && window.fightClubOnlineFighters;
        let p1Key = online ? window.fightClubOnlineFighters.p1
            : (typeof getActiveFighterKey === 'function' ? getActiveFighterKey() : 'reiffer');
        let p2Key = online ? window.fightClubOnlineFighters.p2 : null;
        window.fightClubOnlineFighters = null; // read once, same as onlineNames

        if (!isRealFighter(p1Key)) p1Key = 'reiffer';
        if (!isRealFighter(p2Key)) {
            // Local/solo: P1 matches the active theme, P2 is a random pick
            // from the rest - unchanged behaviour, just decided earlier.
            const pool = FIGHTER_KEYS.filter(k => k !== p1Key);
            p2Key = pool[Math.floor(Math.random() * pool.length)];
        }
        return { p1Key, p2Key };
    }

    function loadFighterCached(key) {
        if (!fighterAnimCache[key]) fighterAnimCache[key] = loadFighterAnims(key);
        return fighterAnimCache[key];
    }

    // Returns { key: anims } for just the fighters in this match. Handles
    // both sides picking the same character (possible in an online match)
    // without loading them twice.
    async function loadFightersFor(a, b) {
        const keys = (a === b) ? [a] : [a, b];
        const loaded = await Promise.all(keys.map(loadFighterCached));
        const map = {};
        keys.forEach((k, i) => { map[k] = loaded[i]; });
        return map;
    }

    function newGame(anims, bg, p1Key, p2Key) {
        // Both keys were validated in pickFighterKeys() before the art
        // loaded, so by here they are real fighter names AND present in
        // `anims`. This fallback is belt and braces, not the validation.
        const safeAnimKey = (k) => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(anims, k))
            ? k
            : Object.keys(anims)[0];
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
            koStarted: false,   // the finish only gets to happen once
            koFreezeT: 0,       // > 0 means time is stopped dead
            koSlowT: 0,         // > 0 means time is running slow
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
            const wasFalling = f.vy;
            f.y = landY; f.vy = 0; f.grounded = true; f.heliT = 0; f.onPlatform = landOnPlatform;
            if (f.state === 'jump_kick') { f.state = 'idle'; f.fr = 0; }
            /* Landing now has weight: a dust puff at the feet and a short
               recovery pose. Gated on actually falling fast enough, so
               walking off a one-pixel lip doesn't kick up a cloud. */
            if (wasFalling > 260) {
                f.landT = LAND_RECOVER_T;
                if (typeof spawnLandingDust === 'function') spawnLandingDust(f);
            }
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
        // A throw is not part of a flurry - it is the thing that ENDS one -
        // so it shoves hard and ignores the chain cap entirely.
        if (isCounterState(attacker.state)) {
            const dirT = defender.x < attacker.x ? -1 : 1;
            defender.x = Math.max(STAGE_MARGIN, Math.min(SW - STAGE_MARGIN - defender._fw, defender.x + dirT * COUNTER_KB));
            defender.kbChain = 0;
            defender.kbResetT = KB_RESET_SECONDS;
            return true;
        }
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
        /* How far the two bodies may clinch before they stop closing.

           This was a flat 45px, chosen back when `_fw` was whatever the
           current sprite CANVAS happened to measure - typically 190-223px
           while walking, so 45 was about a fifth of a body and read as a
           clinch.

           Fixing `_fw` to the real artwork width made those bodies much
           narrower (Undead is 117px), and the same 45 became a THIRD of a
           body. Nobody is displaced by it - walking into someone still
           moves them zero pixels - but you end up standing so far inside
           your opponent that it reads as shoving through them, which is
           what it looked like.

           Proportional to the narrower of the two fighters, so it means the
           same thing whoever is on screen. */
        const ALLOWED_OVERLAP = Math.round(0.22 * Math.min(p1._fw, p2._fw));

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
            [bind.throwGrab]: !!(rk && rk.cpu_throw),
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
        keys[bind.throwGrab] = false;

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
            /* The CPU gets the guard counter too, or the mechanic is a
               one-way privilege: the player could pressure it forever with
               no risk, which is precisely the problem the counter exists to
               solve. It holds both attack buttons, exactly as a human does -
               beginGuardCounter() then applies the same window and the same
               meter cost, so the AI can't cheat its way past either. */
            // A barrage the CPU blocked earns it the throw, same as it does
            // for you - otherwise mashing one button at the AI stays free.
            if (cpu.throwReady() && Math.random() < CPU_COUNTER_CHANCE * dt * 60) {
                justPressed[bind.throwGrab] = true;
            } else if (cpu.counterWindowT > 0 && cpu.guardMeter >= COUNTER_METER_COST
                && Math.random() < CPU_COUNTER_CHANCE * dt * 60) {
                keys[bind.punch] = true; keys[bind.kick] = true;
            } else {
                keys[bind.punch] = false; keys[bind.kick] = false;
            }
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

        /* BUFFER THE THROW PRESS FIRST, before any of the early returns
           below can swallow it. justPressed is wiped at the end of every
           frame, so a press that arrives during hitstop - which is when a
           player pressing C is most likely to be, since they are blocking a
           barrage - used to vanish without a trace. Recording it here and
           reading the buffer later means the press survives the freeze and
           fires on the first frame the fighter can actually act.
           Deliberately AFTER the guardBroken return: a press made while
           dizzy should not bank a throw for the moment they recover. */
        if (justPressed[bind.throwGrab]) f.throwBufT = THROW_BUFFER_FRAMES * FRAME;

        /* ORDER MATTERS HERE, and getting it wrong is subtle.

           Freeze states are checked BEFORE the block stance is evaluated.
           The block branch below returns early for a grounded fighter, so
           when it ran first a fighter who held block never reached the
           timers underneath - and their blockstun never expired. They would
           have been frozen for as long as they kept holding block. */

        /* BEING THROWN. Handled before everything else because it ignores
           input entirely - you are in the air, then on the floor, and only
           then are you allowed to act again. Physics supplies the arc; the
           two sprite frames just pick airborne vs floored. */
        if (f.state === 'thrown') {
            if (!f.thrownGrounded) {
                f.x = Math.max(STAGE_MARGIN, Math.min(SW - STAGE_MARGIN - f._fw, f.x + f.vx * dt));
                /* applyGravity does the landing itself - platforms, the
                   "where were they last frame" ledge check, all of it - and
                   returns true on the frame they touch down. An earlier
                   version of this compared f.y against surfaceBelow()
                   directly, which returns an OBJECT, not a number: the
                   comparison was always false and the victim flew off the
                   stage and never came back. */
                if (applyGravity(f, dt, false)) {
                    f.vx = 0;
                    f.thrownGrounded = true; f.thrownT = 0;
                    f.fr = 1;                     // the "landed" frame
                    if (typeof playSfxFile === 'function') playSfxFile(randomFrom(SFX_HITS), 0.5);
                }
            } else {
                f.thrownT += dt;
                if (f.thrownT >= THROWN_GROUND_T) {
                    f.state = 'idle'; f.fr = 0; f.thrownT = 0; f.thrownGrounded = false;
                }
            }
            return;
        }

        // HITSTOP: both fighters frozen, nobody gains anything by it.
        if (f.stop > 0) { f.stop--; return; }

        /* GUARD COUNTER, read here and nowhere else.

           It has to be checked BEFORE the stun gate below, because that
           gate returns early and would otherwise swallow the input for the
           entire duration of blockstun - which is exactly when the player
           is pressing it.

           Both buttons HELD, not justPressed: nobody hits two keys on the
           same frame, and requiring a simultaneous rising edge would make
           the move feel broken. Held-together over the window is forgiving
           and reads the same to a player. */
        if (f.counterWindowT > 0 && keys[bind.punch] && keys[bind.kick]) {
            if (f.beginGuardCounter()) return;
        }

        // THE THROW. Same reasoning as the counter for why it is read here:
        // the player is in blockstun when they press it, and the stun gate
        // below returns early. Read from the buffer set at the top of this
        // function rather than from justPressed directly - see the note
        // there. The buffer is cleared on use so one press can only ever
        // produce one throw.
        if (f.throwBufT > 0 && f.throwReady()) {
            if (f.beginThrow()) { f.throwBufT = 0; return; }
        }

        // STUN: carried only by the fighter who was hit. The attacker is
        // already free and acting - that gap IS frame advantage, and it is
        // what makes a combo or a punish possible at all.
        if (f.stunT > 0) {
            f.stunT = Math.max(0, f.stunT - dt);
            // Blockstun keeps the guard up, so a block string reads as one
            // continuous stance instead of flickering. Hitstun does not -
            // you cannot start blocking in the middle of eating a combo,
            // which is exactly what makes getting hit once cost something.
            if (f.stunIsBlock && blockHeld && !attacking) {
                f.blocking = true;
                f.crouching = f.grounded && crouchHeld;
                f.state = 'block'; f.fr = 0;
                f.timeSinceBlockOrHit = 0;
            } else {
                f.blocking = false;
            }
            if (!f.grounded) applyGravity(f, dt, true);
            f.vx = 0;
            return;
        }

        // Blocking works airborne too (see jump_block art) - grounded
        // blocking still stops input dead like before; airborne blocking
        // falls through so gravity/landing keeps running underneath it.
        f.blocking = blockHeld && !attacking;
        if (f.blocking) {
            f.crouching = f.grounded && crouchHeld; // holding crouch+block on the ground gives the crouch_block pose
            f.state = 'block'; f.fr = 0;
            f.timeSinceBlockOrHit = 0; // holding block also resets the recovery clock, not just getting hit while blocking
            if (f.grounded) return;
        }

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
        // The guard counter used to live on its own key here. It is now
        // Z + X out of a block, handled above the stun gate - there is
        // deliberately no way to throw one out from neutral.
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
        /* The breath clock runs unconditionally and FIRST. It was originally
           placed further down and landed inside the guardBroken branch,
           which early-returns - so it only advanced while a fighter was
           dizzy and the idle sat frozen mid-breath the rest of the time.
           It is purely cosmetic, so it should never sit behind a gate. */
        f._breathT = (f._breathT || 0) + dt;
        if (f.landT > 0) f.landT = Math.max(0, f.landT - dt);

        /* These three lapse-timers also run unconditionally. They used to sit
           a few lines below, INSIDE the guardBroken branch that returns early,
           so they only counted down while a fighter was dizzy: the guard
           counter window never expired, and a block streak never lapsed, so a
           throw stayed armed forever off one long-dead block. */
        if (f.counterWindowT > 0) f.counterWindowT = Math.max(0, f.counterWindowT - dt);
        if (f.blockStreakT > 0) {
            f.blockStreakT = Math.max(0, f.blockStreakT - dt);
            if (f.blockStreakT === 0) f.blockStreak = 0;
        }
        if (f.hurtT > 0) f.hurtT = Math.max(0, f.hurtT - dt);
        if (f.throwBufT > 0) f.throwBufT = Math.max(0, f.throwBufT - dt);

        // Guard break countdown - once it expires they're back to normal,
        // guard meter already reset to 0 by triggerGuardBreak() so they have
        // to earn it back like anyone else who got chipped down.
        if (f.guardBroken) {
            f.guardBreakT -= dt;
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
            // Cancel opens the moment the move CONNECTS, not at a fixed
            // fraction of its duration. Whiffing now means sitting in your
            // own recovery, which is the entire point of having recovery.
            // Throws never cancel into anything.
            if (!f.canW && f.hitReg && !isCounterState(f.state)) { f.canW = true; f.canT = CANCEL_W; }
            if (f.atkT >= f.atkDur) {
                f.state = f.grounded ? 'idle' : 'jump'; f.atkT = 0; f.canW = false; f.fr = 0;
            }
        }
        // (hurtT is decremented at the top of this function now, alongside the
        // other lapse-timers. Leaving a second decrement here would tick it
        // twice per frame and halve the hit flash.)

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

    /* The fx array lives inside the game loop's closure, so anything outside
       it that wants to spawn an effect needs a way in. This is set once per
       match rather than threading the array through every call site. */
    let _activeFx = null;
    function spawnLandingDust(f) {
        if (!_activeFx) return;
        _activeFx.push({
            x: f.x + f._fw / 2,
            y: f.y + P_H - 6,        // at the feet, not the centre of mass
            kind: 'dust', l: 14, ml: 14,
            rot: 0, flip: Math.random() < 0.5 ? -1 : 1, heavy: false,
        });
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
            // A counter hit now means what it says: catching them during
            // the STARTUP of their own move, before their hitbox exists.
            // It used to fire whenever the defender was in any attack
            // state, which - back when every hitbox was live on frame 1 -
            // was effectively a coin flip rather than a read.
            const isCounterHit = isAttackState(defender.state) && !defender.hitReg
                && !defender.guardBroken && defender.attackPhase() === 'startup';
            let dmg = isCounterHit ? baseDmg * COUNTER_HIT_MULT : baseDmg;

            // Combo scaling only applies to genuinely unguarded hits -
            // blocked hits (free or chip) are a guard mechanic, not a combo.
            if (!defender.blocking) {
                defender.comboCounter = defender.comboWindowT > 0 ? defender.comboCounter + 1 : 1;
                defender.comboWindowT = COMBO_WINDOW;
                const scale = Math.max(COMBO_MIN_SCALE, 1 - (defender.comboCounter - 1) * COMBO_SCALE_STEP);
                dmg *= scale;
            }

            defender.takeDamage(dmg, heavy, isCounterHit, attacker.state);
            // A throw doesn't just damage - it puts them on the floor. Done
            // after takeDamage so the KO check has already run: launching a
            // corpse would strand it mid-air with no state to recover into.
            if (isThrowState(attacker.state) && !defender.ko) {
                defender.launchThrown(attacker.x);
            }
            attacker.stop = heavy ? HS_HV : HS_LT;
            shake.hit(heavy ? 7.0 : 3.2);

            // The ONLY thing in the game that moves an opponent. A clean
            // hit shoves further than a blocked one, and after
            // KB_MAX_CHAIN nudges in one flurry they plant and stop
            // sliding - so a long combo can't walk somebody into the
            // corner. Walking into them does nothing at all (see
            // resolveFighterCollision).
            applyKnockback(defender, attacker, defender.blocking);

            /* A sprite spark instead of the old expanding circle. `kind`
               picks the sheet, `rot` and `flip` vary it so repeated hits in
               the same spot don't look stamped, and `l`/`ml` keep the same
               countdown lifecycle the circle used. Blocked hits get the
               small spark - a guard clash shouldn't read as a clean hit. */
            const sparkKind = pickSparkKind(heavy, defender.blocking);
            fx.push({
                x: hb.x + hb.w / 2, y: hb.y + hb.h / 2,
                kind: sparkKind,
                l: heavy ? 12 : 9, ml: heavy ? 12 : 9,
                rot: (Math.random() * Math.PI * 2),
                flip: Math.random() < 0.5 ? -1 : 1,
                heavy,
            });
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
        syncThrowButton(g.p1.throwReady && g.p1.throwReady());
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

    // Mirrors the HUD cue onto the touch button, so a phone player gets the
    // same information a keyboard player does instead of guessing.
    let _lastThrowReady = null;
    function syncThrowButton(ready) {
        if (ready === _lastThrowReady) return;   // don't touch the DOM every frame
        _lastThrowReady = ready;
        document.querySelector('#fightTouchPad .ft-throwbtn')?.classList.toggle('ft-ready', !!ready);
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

        /* THROW READY. A move the player cannot see is available may as well
           not exist - the throw only unlocks after blocking a barrage, which
           is exactly the kind of hidden state nobody discovers on their own.
           It pulses so it reads as "now", not as another static bar. */
        if (fighter.throwReady && fighter.throwReady()) {
            const label = 'THROW READY  [C]';
            ctx.font = "11px 'BonusStagePixel', monospace";
            const tw = ctx.measureText(label).width;
            const tx = rightAlign ? x + w - tw : x;
            const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 110);
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = COL.YL;
            ctx.textBaseline = 'top';
            ctx.fillText(label, tx, y + h + 3);
            ctx.restore();
        }
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

        // Only the two fighters actually in this match get loaded. Every
        // match used to download all five - 3.8MB of sprite strips for two
        // characters' worth of fighting, with the other ~2.3MB decoded,
        // rescaled and held in memory unused. The cache below means a
        // character already loaded this session costs nothing, so the
        // saving is on first load, where it matters most - a phone on
        // mobile data opening the fight game for the first time.
        const { p1Key, p2Key } = pickFighterKeys();
        /* Kicked off here but deliberately NOT awaited: the impact sheets are
           small and shared, and the match must not sit on a black screen
           waiting for them. Everything that draws fx checks fxAnims for null
           and falls back to the old circle burst until they arrive. */
        loadFxAnims();
        const anims = await loadFightersFor(p1Key, p2Key);
        const bg = await loadArenaBackground(window.fightClubOnlineActive ? window.fightClubOnlineArena : null); // always fresh - depends on whichever theme is active right now, not cached

        let g = newGame(anims, bg, p1Key, p2Key);
        if (typeof playSfxFile === 'function') playSfxFile('assets/sfx/fight/fight.mp3', 0.7);
        const shake = new Shake();
        const fx = [];
        _activeFx = fx;   // let spawnLandingDust reach it

        const P1_BIND = { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', crouch: 'ArrowDown', punch: 'z', kick: 'x', block: ' ', throwGrab: 'c' };
        // P2 is CPU-only now (see updateCPUInput) - these are just internal
        // dictionary keys the AI sets programmatically, not real keyboard
        // keys, so they're deliberately NOT actual key names anymore. That
        // matters: if these matched P1_BIND's real key strings, a P1 key
        // press would leak into the CPU's virtual input for that frame
        // (they share the same `keys`/`justPressed` objects).
        const P2_BIND = { left: 'cpu_left', right: 'cpu_right', jump: 'cpu_jump', crouch: 'cpu_crouch', punch: 'cpu_punch', kick: 'cpu_kick', block: 'cpu_block', throwGrab: 'cpu_throw' };

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
        bindFightTouchPad(P1_BIND);

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
            const rawDt = Math.min((now - lastT) / 1000, 0.05);
            lastT = now;

            /* THE KO CLOCK. Scaling dt is what makes the freeze and the slow
               motion work everywhere at once - physics, animation, timers,
               the lot - without a single one of them needing to know this
               exists. The clocks themselves run on rawDt, or a freeze that
               sets dt to zero could never end. */
            let dt = rawDt;
            if (g.koFreezeT > 0) {
                g.koFreezeT = Math.max(0, g.koFreezeT - rawDt);
                dt = 0;
            } else if (g.koSlowT > 0) {
                g.koSlowT = Math.max(0, g.koSlowT - rawDt);
                dt = rawDt * KO_SLOW_SCALE;
            }
            const timeStopped = dt === 0;

            const so = shake.off(); shake.update();

            if (g.phase === 'intro') {
                g.introT += dt;
                /* The full fighter update does NOT run during the intro - no
                   input, no physics, no timers - so the breath clock is
                   ticked by hand here. Without it both fighters stand
                   completely frozen behind the FIGHT! card, which is the
                   one moment a player is looking straight at them. */
                g.p1._breathT = (g.p1._breathT || 0) + dt;
                g.p2._breathT = (g.p2._breathT || 0) + dt;
                if (g.introT >= INTRO_DURATION) {
                    g.phase = 'playing';
                    g.p1.introPose = false; g.p2.introPose = false;
                    g.p1.fr = 0; g.p2.fr = 0;
                }
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
                        cpu_throw: !!keys[P1_BIND.throwGrab],
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
                /* Skipped while time is stopped. This is a positional
                   correction rather than simulation - it un-stacks the two
                   bodies by halving the overlap every FRAME, with no dt in
                   it at all - so during a KO freeze it kept sliding the
                   loser away from the punch that just landed, which is the
                   one thing the freeze exists to hold still. */
                if (!timeStopped) resolveFighterCollision(p1, p2);

                resolveHit(p1, p2, shake, fx);
                resolveHit(p2, p1, shake, fx);

                if (p1.ko || p2.ko) {
                    /* Start the freeze on the frame the KO happens, and hold
                       the transition until it ends. Flipping to the win
                       phase straight away would replace the fighter who just
                       got hit with a defeat pose - so the freeze would land
                       on the wrong frame and the impact it exists to show
                       would never be on screen. */
                    if (!g.koStarted) {
                        g.koStarted = true;
                        g.koFreezeT = KO_FREEZE_T;
                        g.koSlowT = KO_SLOW_T;
                    }
                }
                if ((p1.ko || p2.ko) && g.koFreezeT <= 0) {
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
                } else if (!p1.ko && !p2.ko && g.timer <= 0) {
                    // Spelled out rather than left as a bare `else`: the
                    // branch above no longer means "somebody was KO'd", it
                    // means "somebody was KO'd AND the freeze has finished",
                    // so a plain else would let a time-out decide a match
                    // that a KO had already ended.
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
                /* Effects age per FRAME, not per second, so they are the one
                   thing the dt scaling above cannot slow down on its own -
                   and a hit spark that vanished on schedule during a KO
                   freeze would take the impact with it. Hold them while
                   time is stopped, and age them at the same rate as
                   everything else while it is slow. */
                const s = fx[i];
                if (!timeStopped) {
                    s.age = (s.age || 0) + (g.koSlowT > 0 ? KO_SLOW_SCALE : 1);
                    if (s.age >= 1) { s.age -= 1; s.l--; }
                }
                if (s.l <= 0) { fx.splice(i, 1); continue; }
                const t = 1 - s.l / s.ml;          // 0 at spawn -> 1 at death
                const frames = fxAnims && fxAnims[s.kind];

                if (frames && frames.length) {
                    // Step through the strip over the effect's lifetime.
                    const fi = Math.min(frames.length - 1, Math.floor(t * frames.length));
                    const img = frames[fi];
                    ctx.save();
                    ctx.translate(s.x + so[0], s.y + so[1]);
                    if (s.rot) ctx.rotate(s.rot);
                    if (s.flip === -1) ctx.scale(-1, 1);
                    // Fade only over the last third - fading from frame one
                    // makes even a heavy hit look weak.
                    ctx.globalAlpha = t > 0.66 ? Math.max(0, 1 - (t - 0.66) / 0.34) : 1;
                    ctx.drawImage(img, -img.width / 2, -img.height / 2);
                    ctx.restore();
                    ctx.globalAlpha = 1;
                } else {
                    // Fallback to the original circle if the sheets failed to
                    // load - a missing decoration must never hide a hit.
                    ctx.fillStyle = s.heavy ? COL.OR : COL.YL;
                    ctx.globalAlpha = Math.max(0, 1 - t);
                    ctx.beginPath();
                    ctx.arc(s.x + so[0], s.y + so[1], 10 + t * 14, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }

            g.p1.draw(ctx, so);
            g.p2.draw(ctx, so);
            drawHUD(ctx, g);
            if (g.phase === 'intro') drawIntro(ctx, g);
            else if (g.phase !== 'playing') drawEnd(ctx, g);

            // Z+X is listed because a move nobody can discover may as well
            // not exist - and the guard counter is the whole answer to an
            // opponent leaning on you.
            const leg = 'P1: \u2190\u2192 Move  \u2191 Jump  \u2193 Crouch  Z Punch  X Kick  Space Block  Z+X Counter  C Throw   |   P2: CPU';
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

    /* ---------------- TOUCH CONTROLS ----------------
       The fight game needs seven inputs - left, right, jump, crouch,
       punch, kick, block - and there is no sensible gesture for seven
       things at once, so mobile gets real on-screen buttons instead of
       the swipe-and-drag approach MEV Sandwich uses.

       These press the SAME keys the keyboard does. Each button carries a
       data-fight-key naming a P1_BIND entry, and pressing it sets
       keys[...] and justPressed[...] exactly as onKeyDown would. There is
       no second input path for the game logic to know about, so touch and
       keyboard can never drift apart - and a Bluetooth keyboard on a
       tablet keeps working alongside the buttons. */

    let _ftButtons = [];       // { el, onDown, onUp } for teardown
    let _ftRevealHandler = null;

    function _ftPress(bindKey, on) {
        if (!bindKey) return;
        if (on) {
            // Match the keyboard exactly: justPressed is a rising edge only,
            // so holding a button can't machine-gun a move that is meant to
            // need a fresh press.
            if (!keys[bindKey]) justPressed[bindKey] = true;
            keys[bindKey] = true;
        } else {
            keys[bindKey] = false;
        }
    }

    function bindFightTouchPad(bind) {
        unbindFightTouchPad();
        const pad = document.getElementById('fightTouchPad');
        if (!pad) return;

        // data-fight-key for a single key, data-fight-keys="a,b" for a button
        // that presses several at once. The guard counter needs the plural
        // form: on a keyboard it is Z and X HELD TOGETHER, and a touch pad
        // has no way to express "hold two" with one thumb.
        pad.querySelectorAll('[data-fight-key], [data-fight-keys]').forEach((el) => {
            const names = (el.getAttribute('data-fight-keys') || el.getAttribute('data-fight-key') || '')
                .split(',').map((n) => n.trim()).filter(Boolean);
            const bindKeys = names.map((n) => bind[n]).filter(Boolean);
            if (!bindKeys.length) return;
            const onDown = (ev) => {
                ev.preventDefault();   // no scroll, no zoom, no synthetic click
                ev.stopPropagation();
                el.classList.add('ft-on');
                bindKeys.forEach((k) => _ftPress(k, true));
            };
            // touchend AND touchcancel: an incoming call or the browser
            // reclaiming the gesture fires cancel, and without it the button
            // would stay held down for the rest of the match.
            const onUp = (ev) => {
                ev.preventDefault();
                el.classList.remove('ft-on');
                bindKeys.forEach((k) => _ftPress(k, false));
            };
            el.addEventListener('touchstart', onDown, { passive: false });
            el.addEventListener('touchend', onUp, { passive: false });
            el.addEventListener('touchcancel', onUp, { passive: false });
            _ftButtons.push({ el, onDown, onUp });
        });

        // Reveal on the first REAL touch rather than sniffing the user agent
        // or 'ontouchstart' - plenty of laptops report touch support while
        // the person is using a mouse, and showing them a d-pad would be
        // nonsense. Once shown it stays for the session.
        if (pad.classList.contains('hidden')) {
            _ftRevealHandler = () => {
                pad.classList.remove('hidden');
                window.removeEventListener('touchstart', _ftRevealHandler, true);
                _ftRevealHandler = null;
            };
            window.addEventListener('touchstart', _ftRevealHandler, true);
        }
    }

    function unbindFightTouchPad() {
        _ftButtons.forEach(({ el, onDown, onUp }) => {
            // The options object has to match the one used to add these, or
            // the browser treats it as a different listener and never
            // removes it - the exact bug that leaked handlers in the Win95
            // desktop for months.
            el.removeEventListener('touchstart', onDown, { passive: false });
            el.removeEventListener('touchend', onUp, { passive: false });
            el.removeEventListener('touchcancel', onUp, { passive: false });
            el.classList.remove('ft-on');
        });
        _ftButtons = [];
        if (_ftRevealHandler) {
            window.removeEventListener('touchstart', _ftRevealHandler, true);
            _ftRevealHandler = null;
        }
    }

    function stop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
        if (onKeyUp) window.removeEventListener('keyup', onKeyUp);
        onKeyDown = onKeyUp = null;
        unbindFightTouchPad();
        keys = {}; justPressed = {};
        if (typeof stopFightMusic === 'function') stopFightMusic();
    }

    return { start, stop };
})();
