/* ============================================================
   MEV SANDWICH - GHOST RUNS
   ============================================================
   Real players in the mempool, without a realtime connection.

   Every finished run is recorded as a path of samples and written to
   Supabase once. Later rounds read a pool of those runs back and replay
   them as opponents alongside the CPU bots, carrying the original
   player's name.

   Why recorded instead of live: Supabase bills Realtime per message and
   broadcasts fan out (one message to a room of 5 is billed as 5), so
   continuous position streaming for a slither-style game burns the free
   2M/month quota in roughly 90 rounds. This approach is ONE read when a
   round starts and ONE write when it ends - no realtime messages at all,
   and the world still feels populated by actual people. The tradeoff is
   that two players clicking at the same moment don't truly meet; they
   meet each other's recorded runs instead.

   Everything here fails soft. No Supabase, no network, empty table, bad
   data - the game just runs with CPU bots only and never throws.
   ============================================================ */

const MEV_GHOST_SAMPLE_HZ = 8;       // samples/sec recorded - 8 is plenty once playback interpolates between them
const MEV_GHOST_POOL_SIZE = 40;      // how many runs to pull, then randomly draw from
const MEV_GHOST_PER_ROUND = 4;       // how many ghosts appear in a given round
const MEV_GHOST_MIN_SCORE = 5;       // don't archive junk runs where nothing happened
const MEV_GHOST_MIN_SAMPLES = 40;    // ~5s minimum, matches the table's CHECK constraint
const MEV_GHOST_MAX_SAMPLES = 1400;  // hard cap so a long session can't build an oversized payload

let _mevGhostPool = null;      // cached list of runs pulled from Supabase
let _mevGhostFetching = null;  // in-flight promise, so several calls share one request

// `sb` is declared with `let` in js/web3.js. A `let` binding is in the
// temporal dead zone until that script executes, and `typeof` on a TDZ
// binding THROWS rather than returning "undefined" - so the usual
// typeof guard isn't safe here. In practice web3.js always runs first
// (both are deferred, and nothing below fires until well after load),
// but this keeps a load-order change from breaking the minigame.
function _mevGhostClient() {
    try {
        return (typeof sb !== 'undefined' && sb) ? sb : null;
    } catch (e) {
        return null;
    }
}

// Pulls the top runs once per page load and caches them. Sorted by score
// so the ghosts you race are decent runs rather than someone who died
// immediately.
function fetchMevGhostPool() {
    if (_mevGhostPool) return Promise.resolve(_mevGhostPool);
    if (_mevGhostFetching) return _mevGhostFetching;
    const client = _mevGhostClient();
    if (!client) return Promise.resolve([]);

    _mevGhostFetching = client
        .from('mev_ghosts')
        .select('name, score, segments, path')
        .order('score', { ascending: false })
        .limit(MEV_GHOST_POOL_SIZE)
        .then(({ data, error }) => {
            if (error) { console.warn('[mevghosts] fetch failed:', error.message); _mevGhostPool = []; return []; }
            _mevGhostPool = (data || []).filter(r => Array.isArray(r.path) && r.path.length >= MEV_GHOST_MIN_SAMPLES);
            console.log(`[mevghosts] loaded ${_mevGhostPool.length} recorded run(s)`);
            return _mevGhostPool;
        })
        .catch(e => { console.warn('[mevghosts] fetch threw:', e); _mevGhostPool = []; return []; })
        .finally(() => { _mevGhostFetching = null; });

    return _mevGhostFetching;
}

// Flat [x, y, angle*100, segments, ...] -> usable sample objects, with the
// whole path rotated by a random angle around the world centre. Rotation
// matters: every run was recorded starting from the same fixed spawn
// point, so replaying them unrotated would stack every ghost on top of
// the player at t=0 and kill everyone instantly. Rotating around the
// origin keeps each path inside the circular world while spreading the
// ghosts out.
function decodeMevGhostPath(flat, rotation) {
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const out = [];
    for (let i = 0; i + 3 < flat.length; i += 4) {
        const x = flat[i], y = flat[i + 1];
        out.push({
            x: x * cos - y * sin,
            y: x * sin + y * cos,
            a: (flat[i + 2] / 100) + rotation,
            s: Math.max(1, flat[i + 3] | 0),
        });
    }
    return out;
}

// Draws up to n distinct runs at random from the cached pool.
function pickMevGhostRuns(n) {
    const pool = _mevGhostPool || [];
    if (!pool.length) return [];
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, n).map(run => ({
        name: String(run.name || 'anon').slice(0, 14),
        score: run.score | 0,
        samples: decodeMevGhostPath(run.path, Math.random() * Math.PI * 2),
    })).filter(r => r.samples.length >= 10);
}

// Writes a finished run. Fire-and-forget on purpose - the player is
// already looking at the REKT screen and shouldn't wait on a network
// round trip, and a failure here must never surface as an error.
function saveMevGhostRun(score, segments, samples) {
    try {
        const client = _mevGhostClient();
        if (!client) return;
        if (!Array.isArray(samples) || samples.length < MEV_GHOST_MIN_SAMPLES) return;
        if (score < MEV_GHOST_MIN_SCORE) return;

        const trimmed = samples.slice(0, MEV_GHOST_MAX_SAMPLES);
        const flat = [];
        for (const s of trimmed) {
            flat.push(Math.round(s.x), Math.round(s.y), Math.round(s.a * 100), s.s | 0);
        }

        const name = (typeof displayName === 'function' && typeof walletAddress !== 'undefined' && walletAddress)
            ? String(displayName()).slice(0, 40)
            : 'anon';

        client.from('mev_ghosts')
            .insert({ name, score: Math.max(0, Math.round(score)), segments: Math.max(0, segments | 0), path: flat })
            .then(({ error }) => {
                if (error) console.warn('[mevghosts] save failed:', error.message);
                else {
                    console.log('[mevghosts] run saved');
                    _mevGhostPool = null; // let the next round pick up the new run
                }
            });
    } catch (e) {
        console.warn('[mevghosts] save threw:', e);
    }
}

// Warm the pool shortly after load so the very first round already has
// ghosts in it, rather than them popping in a second late. Delayed a
// beat so it doesn't compete with the page's own startup requests, and
// harmless if the player never opens the minigame - it's a single query.
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { fetchMevGhostPool(); } catch (e) {} }, 2500);
});
