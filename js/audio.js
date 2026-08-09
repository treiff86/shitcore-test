/* ============================================================
   AUDIO ENGINE
   Tiny synthesizer used for interaction sound feedback.
   No audio files are loaded — everything is generated at
   runtime with the Web Audio API, so this works completely
   offline / from a static GitHub Pages host.
   ============================================================ */

let audioCtx = null;

// Background music toggle - wired up to a real <audio> element. Mid
// Evils and Conmen each have their own track; the element's src gets
// swapped to match whichever theme is currently active.
let bgMusicMuted = true;
let bgMusicEl = null;
let bgMusicWasPlayingBeforeBonusStage = false;

const THEME_MUSIC_TRACKS = {
    'medieval-mode': 'assets/midevil-theme.mp3',
    'conmen-mode': 'assets/conmen-theme.mp3?v=2',
};

// Returns the music file for whichever cosmetic theme is currently active
// on <body>, or null if the current theme (or lack of one) has no track.
function _bgMusicSrcForCurrentTheme() {
    for (const cls in THEME_MUSIC_TRACKS) {
        if (document.body.classList.contains(cls)) return THEME_MUSIC_TRACKS[cls];
    }
    return null;
}

function toggleBgMusic() {
    const src = _bgMusicSrcForCurrentTheme();
    if (!src) return; // current theme (if any) has no music track, full stop
    if (!bgMusicEl) bgMusicEl = document.getElementById('bgMusicEl');
    if (!bgMusicEl) return;
    if (!bgMusicEl.src.endsWith(src)) {
        bgMusicEl.src = src; // switch track if the active theme changed since last play
    }
    bgMusicMuted = !bgMusicMuted;
    const icon = document.getElementById('audioToggleIcon');
    if (icon) {
        icon.classList.toggle('fa-volume-high', !bgMusicMuted);
        icon.classList.toggle('fa-volume-xmark', bgMusicMuted);
    }
    bgMusicEl.volume = 0.3;
    if (bgMusicMuted) {
        bgMusicEl.pause();
    } else {
        bgMusicEl.play().catch((err) => console.warn('[audio] background music blocked:', err.name));
    }
}

// Called the moment a themed track actually becomes available (real Mid
// Evils/Conmen theme applied, or TEST Play previewing one) - starts music
// playing by default instead of requiring a manual click first. Only
// fires once per "went from no track to having one"; switching between
// Mid Evils and Conmen while already unmuted doesn't touch it.
function autoStartThemeMusicIfMuted() {
    if (!bgMusicMuted) return;
    const src = _bgMusicSrcForCurrentTheme();
    if (!src) return;
    if (!bgMusicEl) bgMusicEl = document.getElementById('bgMusicEl');
    if (!bgMusicEl) return;
    if (!bgMusicEl.src.endsWith(src)) bgMusicEl.src = src;
    bgMusicMuted = false;
    const icon = document.getElementById('audioToggleIcon');
    if (icon) {
        icon.classList.add('fa-volume-high');
        icon.classList.remove('fa-volume-xmark');
    }
    bgMusicEl.volume = 0.3;
    bgMusicEl.play().catch((err) => console.warn('[audio] main theme autoplay blocked:', err.name));
}

// Called when the theme switches away from one with music (disconnect,
// wallet swap, theme preview reset) so a track doesn't keep playing under
// a theme it's not supposed to exist in.
function stopMainThemeIfPlaying() {
    if (!bgMusicEl) bgMusicEl = document.getElementById('bgMusicEl');
    bgMusicMuted = true;
    const icon = document.getElementById('audioToggleIcon');
    if (icon) {
        icon.classList.remove('fa-volume-high');
        icon.classList.add('fa-volume-xmark');
    }
    if (bgMusicEl) bgMusicEl.pause();
}

// Handoff with the bonus stage's own theme track - only one plays at a
// time. bgMusicWasPlayingBeforeBonusStage remembers whether the main
// theme was actually on, so closing the mini-game doesn't un-mute music
// for someone who had it off in the first place.
function pauseMainThemeForBonusStage() {
    if (!bgMusicEl) bgMusicEl = document.getElementById('bgMusicEl');
    bgMusicWasPlayingBeforeBonusStage = !bgMusicMuted;
    if (bgMusicEl) bgMusicEl.pause();
}
function resumeMainThemeAfterBonusStage() {
    if (!bgMusicEl) bgMusicEl = document.getElementById('bgMusicEl');
    if (bgMusicWasPlayingBeforeBonusStage && bgMusicEl) {
        // Fight Game may have swapped bgMusicEl's src to a battle track
        // for a different arena than the site's actual active theme (see
        // playFightMusicForBackground() below) - reset it back to
        // whatever the site theme actually calls for before resuming,
        // otherwise leaving Fight Club could keep playing fight music.
        const correctSrc = _bgMusicSrcForCurrentTheme();
        if (correctSrc && !bgMusicEl.src.endsWith(correctSrc)) bgMusicEl.src = correctSrc;
        bgMusicEl.volume = 0.3;
        bgMusicEl.play().catch(() => {});
    }
}

// ---- Fight Club's own battle music ----
// Fight Club uses this one track for every arena, on purpose - no more
// per-arena splitting between the Mid Evils/Conmen site themes.
// Every arena uses this by default; the Genuine Undead office gets its
// own dedicated track below since Tim sent one specifically for it.
const FIGHT_MUSIC_TRACK = 'assets/bonus_stage/bonus-stage-theme.mp3?v=2';
const FIGHT_ARENA_MUSIC_OVERRIDES = {
    'assets/fight_game/bg_undead.webp': 'assets/fight_game/undead_theme.mp3',
};

// Called by Fight Game once it knows which arena background got picked
// for this match. Respects the player's existing mute preference - if
// they've got music toggled off for the main site, a match starting
// doesn't force it back on.
function playFightMusicForBackground(bgSrc) {
    if (!bgMusicEl) bgMusicEl = document.getElementById('bgMusicEl');
    if (!bgMusicEl) return;
    setActiveMiniGameMusicEl(bgMusicEl);
    const src = FIGHT_ARENA_MUSIC_OVERRIDES[bgSrc] || FIGHT_MUSIC_TRACK;
    // Ignores the main site's bgMusicMuted on purpose - Fight Game music
    // starts every match regardless of whether the player has ever
    // touched the site's own music toggle. Only the mini-game music
    // button (miniGameMusicMuted) controls this.
    if (!bgMusicEl.src.endsWith(src)) bgMusicEl.src = src;
    bgMusicEl.volume = 0.3;
    bgMusicEl.currentTime = 0;
    if (miniGameMusicMuted) return; // stays loaded and ready, just doesn't auto-play
    bgMusicEl.play().catch((err) => console.warn('[audio] fight music blocked:', err.name));
}

// Wraps the synthesized playSound() (used for the "FIGHT!" and "GAME
// OVER" stingers) so those two respect the mini-game SFX mute too,
// without making playSound() itself mute-aware everywhere else it's
// used across the whole site.
function playMiniGameSound(type) {
    if (miniGameSfxMuted) return;
    if (typeof playSound === 'function') playSound(type);
}

function stopFightMusic() {
    if (!bgMusicEl) bgMusicEl = document.getElementById('bgMusicEl');
    if (bgMusicEl) bgMusicEl.pause();
}

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function _playSoundNow(type) {
    try {
        const ctx = getAudioCtx();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.04);
            osc.start(now); osc.stop(now + 0.04);
        } else if (type === 'buy') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.setValueAtTime(800, now + 0.05);
            osc.frequency.setValueAtTime(1200, now + 0.1);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'stake') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(250, now);
            osc.frequency.exponentialRampToValueAtTime(900, now + 0.35);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.35);
            osc.start(now); osc.stop(now + 0.35);
        } else if (type === 'alarm') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(900, now);
            osc.frequency.linearRampToValueAtTime(450, now + 0.2);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'lambo') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.linearRampToValueAtTime(380, now + 0.3);
            osc.frequency.linearRampToValueAtTime(220, now + 0.6);
            osc.frequency.linearRampToValueAtTime(600, now + 1.1);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 1.2);
            osc.start(now); osc.stop(now + 1.2);
        } else if (type === 'liquidated') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.8);
            const filter = ctx.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = 300;
            osc.disconnect(gain);
            osc.connect(filter);
            filter.connect(gain);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.8);
            osc.start(now); osc.stop(now + 0.8);
        } else if (type === 'rug') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(250, now);
            osc.frequency.exponentialRampToValueAtTime(25, now + 1.8);
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(700, now);
            filter.frequency.exponentialRampToValueAtTime(60, now + 1.8);
            osc.disconnect(gain);
            osc.connect(filter);
            filter.connect(gain);
            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.002, now + 1.9);
            osc.start(now); osc.stop(now + 1.9);

            const bufferSize = ctx.sampleRate * 2.0;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            const noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(500, now);
            noiseFilter.frequency.exponentialRampToValueAtTime(50, now + 2.0);
            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(0.28, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(ctx.destination);
            noise.start(now); noise.stop(now + 2.0);
        } else if (type === 'launch') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(1500, now + 0.95);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
            osc.start(now); osc.stop(now + 0.95);
        } else if (type === 'fryer_hit') {
            // Metallic clang - short bright thud with a quick pitch drop,
            // plus a burst of filtered noise for the "hit something metal" bite.
            osc.type = 'square';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            osc.start(now); osc.stop(now + 0.14);

            const bufferSize = ctx.sampleRate * 0.1;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            const noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(1800, now);
            noiseFilter.Q.value = 1.2;
            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(0.18, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(ctx.destination);
            noise.start(now); noise.stop(now + 0.1);
        } else if (type === 'player_hurt') {
            // Short pained grunt - a falling, slightly rough tone.
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.18);
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1200, now);
            filter.frequency.exponentialRampToValueAtTime(300, now + 0.18);
            osc.disconnect(gain);
            osc.connect(filter);
            filter.connect(gain);
            gain.gain.setValueAtTime(0.14, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'fight_start') {
            // Two-note rising "FIGHT!" stinger - no announcer voice clip on
            // hand, so this is a synthesized brass-ish hit instead.
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.setValueAtTime(440, now + 0.12);
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.16, now + 0.02);
            gain.gain.setValueAtTime(0.16, now + 0.1);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
            gain.gain.linearRampToValueAtTime(0.18, now + 0.14);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc.start(now); osc.stop(now + 0.5);
        } else if (type === 'fight_game_over') {
            // Descending three-note "that's a wrap" stinger for the win/
            // lose/draw screen.
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.setValueAtTime(390, now + 0.15);
            osc.frequency.setValueAtTime(260, now + 0.3);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.setValueAtTime(0.15, now + 0.42);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
            osc.start(now); osc.stop(now + 0.6);
        }
    } catch (e) {
        console.warn('[audio] playSound blocked or unsupported:', e);
    }
}

// ---- Mini-game audio toggles (Fight Club / Bonus Stage) ----
// Deliberately separate from the main site's bgMusicMuted toggle above -
// mini-game music defaults to ON regardless of whether the player has
// ever touched the main site's music button, per Tim's request. SFX mute
// is its own independent flag. Neither persists across a page reload
// (matches the rest of the site - no localStorage use).
let miniGameMusicMuted = false; // false = ON, opposite default from bgMusicMuted
let miniGameSfxMuted = false;
let activeMiniGameMusicEl = null; // whichever Audio element the currently-open mini-game is using for music

// Called by a mini-game the moment it starts/changes its music, so the
// toggle buttons below know which element to actually pause/resume.
function setActiveMiniGameMusicEl(el) { activeMiniGameMusicEl = el; }
function isMiniGameMusicMuted() { return miniGameMusicMuted; }
function isMiniGameSfxMuted() { return miniGameSfxMuted; }

function toggleMiniGameMusic() {
    miniGameMusicMuted = !miniGameMusicMuted;
    if (activeMiniGameMusicEl) {
        if (miniGameMusicMuted) activeMiniGameMusicEl.pause();
        else activeMiniGameMusicEl.play().catch(() => {});
    }
    _refreshMiniGameAudioButtons();
    return miniGameMusicMuted;
}
function toggleMiniGameSfx() {
    miniGameSfxMuted = !miniGameSfxMuted;
    _refreshMiniGameAudioButtons();
    return miniGameSfxMuted;
}
// Updates every mini-game music/SFX button on the page at once (Fight
// Club and Bonus Stage each have their own titlebar copy, both wired to
// the same shared mute flags).
function _refreshMiniGameAudioButtons() {
    document.querySelectorAll('.mg-music-btn').forEach((btn) => {
        btn.classList.toggle('mg-btn-off', miniGameMusicMuted);
        btn.title = miniGameMusicMuted ? 'Music: OFF (click to unmute)' : 'Music: ON (click to mute)';
    });
    document.querySelectorAll('.mg-sfx-btn').forEach((btn) => {
        btn.classList.toggle('mg-btn-off', miniGameSfxMuted);
        btn.title = miniGameSfxMuted ? 'SFX: OFF (click to unmute)' : 'SFX: ON (click to mute)';
        const icon = btn.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-volume-high', !miniGameSfxMuted);
            icon.classList.toggle('fa-volume-xmark', miniGameSfxMuted);
        }
    });
}

// ---- Real audio-file SFX, as opposed to the synthesized tones above ----
// Used by Fight Game/Bonus Stage for actual recorded hit/block/whoosh
// sounds. Each call makes a fresh Audio element so overlapping hits (e.g.
// two fighters landing shots close together, or a fast combo) don't cut
// each other off the way a single shared <audio> element would.
function playSfxFile(path, volume) {
    if (miniGameSfxMuted) return;
    try {
        const el = new Audio(path);
        el.volume = volume == null ? 0.6 : volume;
        el.play().catch(() => {}); // autoplay-policy rejections are fine to swallow, same as bg music
    } catch (e) { /* ignore */ }
}

// Picks a random file from a pool - used for the "mix it up" hit/block
// variety so the same exact sample doesn't play every single time.
function playSfxRandom(paths, volume) {
    if (!paths || !paths.length) return;
    playSfxFile(paths[Math.floor(Math.random() * paths.length)], volume);
}

// Public entry point. The Web Audio API starts every AudioContext in a
// "suspended" state until a user gesture resumes it, and resume() is
// async - calling it and immediately building/starting the oscillator
// (the old code) is a race: the context can still be suspended the
// instant .start() fires, which produces no audible sound at all with
// no error anywhere. This waits for resume to actually finish first.
function playSound(type) {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
        ctx.resume()
            .then(() => _playSoundNow(type))
            .catch((e) => console.warn('[audio] AudioContext.resume() failed:', e));
    } else {
        _playSoundNow(type);
    }
}
