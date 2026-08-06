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
    'conmen-mode': 'assets/conmen-theme.mp3',
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
    if (bgMusicEl && !bgMusicEl.src.endsWith(src)) {
        bgMusicEl.src = src; // switch track if the active theme changed since last play
    }
    bgMusicMuted = !bgMusicMuted;
    const icon = document.getElementById('audioToggleIcon');
    if (icon) {
        icon.classList.toggle('fa-volume-high', !bgMusicMuted);
        icon.classList.toggle('fa-volume-xmark', bgMusicMuted);
    }
    if (bgMusicEl) {
        bgMusicEl.volume = 0.3;
        if (bgMusicMuted) bgMusicEl.pause();
        else bgMusicEl.play().catch(() => {});
    }
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
        bgMusicEl.volume = 0.3;
        bgMusicEl.play().catch(() => {});
    }
}

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playSound(type) {
    try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();

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
        }
    } catch (e) {
        console.warn('Audio blocked or unsupported:', e);
    }
}
