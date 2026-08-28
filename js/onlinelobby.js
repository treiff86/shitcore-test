/* ============================================================
   ONLINE FIGHT CLUB — STAGE 2: LIVE INPUT SYNC
   ============================================================
   Real-time relay of each player's actual key state to their
   opponent, over a Supabase Realtime Broadcast channel scoped to
   this one match (separate from the lobby-wide channel used for
   matchmaking in onlinelobby.js). This is NOT peer-to-peer - every
   input still bounces through Supabase's server - but it's a real
   live connection now, not two disconnected local CPU fights.

   Each side runs its own full local simulation of BOTH fighters.
   Your own real key presses drive your fighter directly; your
   opponent's fighter is driven by whatever key state they most
   recently broadcast (fed into fightgame.js the same way the old
   CPU AI used to - see updateRemoteInput() there). Both sides
   compute hits/damage locally off the same synced inputs, which
   keeps this simple and low-latency but isn't a bulletproof anti-
   desync system: with identical inputs both sides SHOULD land on
   the same result, but small timing differences between two
   different devices/connections could in rare cases make the two
   screens disagree slightly (e.g. the exact frame a hit registers).
   Known first-pass limitation, consistent with how this feature
   has been scoped in stages the whole way - fine for a casual/
   social feature, would need real state reconciliation to fully
   close.

   Which arena and which fighter each side plays as is NOT sent
   over this channel - that's decided at room-creation/join time
   and stored directly on the fight_rooms row (see onlinelobby.js),
   so both sides read it from the same database record instead of
   racing a broadcast message against channel subscription timing.

   Depends on sb from web3.js, so this file must load after it.
   ============================================================ */

let fightSyncChannel = null;
let fightSyncPeerPresent = false;
let fightSyncLastPingMs = null;
let fightSyncLastRemoteInputAt = 0;
let fightSyncConnectedAt = 0;
let fightSyncOnPeerLeft = null;
let fightSyncPingTimer = null;
/* Must list EVERY key updateRemoteInput() in fightgame.js reads, because
   the receiver now rebuilds the remote key state from this shape rather
   than trusting the payload's own. cpu_throw was missing here: the sender
   has always transmitted it, so copying the payload wholesale carried it
   anyway - but rebuilding from an incomplete template would have quietly
   deleted throws from online play. */
const FIGHT_SYNC_EMPTY_KEYS = { cpu_left: false, cpu_right: false, cpu_jump: false, cpu_crouch: false, cpu_punch: false, cpu_kick: false, cpu_block: false, cpu_throw: false };
let fightSyncRemoteKeys = { ...FIGHT_SYNC_EMPTY_KEYS };

// Snapshot for the TEST-mode debug button (see checkFightSyncStatus in
// web3.js) - everything it needs to answer "is this actually connected
// right now" in one place.
function getFightSyncStatus() {
    return {
        active: !!fightSyncChannel,
        peerPresent: fightSyncPeerPresent,
        lastPingMs: fightSyncLastPingMs,
        msSinceLastRemoteInput: fightSyncChannel ? (Date.now() - fightSyncLastRemoteInputAt) : null,
        connectedForMs: fightSyncChannel ? (Date.now() - fightSyncConnectedAt) : null,
    };
}

// roomId ties this to one specific match. onPeerLeft fires if the other
// tab's presence drops (closed the page, lost connection, etc.) so the
// caller can end the match gracefully instead of leaving someone stuck
// fighting a frozen opponent.
/* The shared per-match secret, handed over by onlinelobby.js once the
   database has confirmed this tab is actually one of the two players.
   Null means "not armed yet" - see the note in startOnlineMatch. */
let fightSyncSecret = null;
let fightSyncRejected = 0;   // broadcasts dropped for a bad signature

function setFightSyncSecret(secret) {
    fightSyncSecret = secret || null;
}

/* A broadcast is trusted only if it carries the match secret. Once the
   secret is armed, anything unsigned or wrongly signed is dropped and
   counted - which is what a stranger's forged input looks like from the
   inside. Before it is armed we accept, so the first frames of a match
   are never lost to a round trip. */
function fightSyncTrusted(payload) {
    if (!fightSyncSecret) return true;
    if (payload && payload.s === fightSyncSecret) return true;
    fightSyncRejected++;
    return false;
}

function getFightSyncRejectedCount() { return fightSyncRejected; }

function startFightSync(roomId, onPeerLeft) {
    stopFightSync(); // clean up any leftover channel from a previous match first
    if (!sb || !roomId) return null;
    fightSyncRejected = 0;
    fightSyncOnPeerLeft = onPeerLeft || null;
    fightSyncPeerPresent = false;
    fightSyncLastPingMs = null;
    fightSyncLastRemoteInputAt = 0;
    fightSyncConnectedAt = Date.now();
    fightSyncRemoteKeys = { ...FIGHT_SYNC_EMPTY_KEYS };

    const mySyncId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    const channel = sb.channel(`fight-sync-${roomId}`, {
        config: { broadcast: { self: false }, presence: { key: mySyncId } },
    });

    channel.on('broadcast', { event: 'input' }, ({ payload }) => {
        if (!fightSyncTrusted(payload)) return;   // not from your opponent
        if (payload && payload.keys) {
            /* Only the keys the game actually reads are copied across.
               Spreading the payload wholesale let a remote peer put any
               property it liked onto the object updateRemoteInput()
               reads. Rebuilding it from a fixed shape means a forged
               message can, at absolute worst, hold a real button down. */
            const src = payload.keys;
            const next = { ...FIGHT_SYNC_EMPTY_KEYS };
            for (const k in next) next[k] = !!src[k];
            fightSyncRemoteKeys = next;
            fightSyncLastRemoteInputAt = Date.now();
        }
    });
    channel.on('broadcast', { event: 'ping' }, ({ payload }) => {
        if (!fightSyncTrusted(payload)) return;
        channel.send({ type: 'broadcast', event: 'pong', payload: { t: payload.t, s: fightSyncSecret } });
    });
    channel.on('broadcast', { event: 'pong' }, ({ payload }) => {
        if (!fightSyncTrusted(payload)) return;   // or the latency readout is forgeable too
        fightSyncLastPingMs = Math.round(performance.now() - payload.t);
    });
    channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        fightSyncPeerPresent = Object.keys(state).length > 1;
    });
    channel.on('presence', { event: 'leave' }, () => {
        const wasPresent = fightSyncPeerPresent;
        fightSyncPeerPresent = false;
        if (wasPresent && fightSyncOnPeerLeft) fightSyncOnPeerLeft();
    });

    channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await channel.track({ id: mySyncId, joinedAt: Date.now() });
        }
    });

    fightSyncChannel = channel;

    // Ongoing ping so latency is a live number (debug button) rather than
    // a one-time reading, and so a silently-dead connection eventually
    // shows itself (no pongs coming back).
    fightSyncPingTimer = setInterval(() => {
        if (fightSyncChannel) fightSyncChannel.send({ type: 'broadcast', event: 'ping', payload: { t: performance.now(), s: fightSyncSecret } });
    }, 2000);

    return channel;
}

function sendFightSyncInput(keysSnapshot) {
    if (!fightSyncChannel) return;
    fightSyncChannel.send({ type: 'broadcast', event: 'input', payload: { keys: keysSnapshot, s: fightSyncSecret } });
}

function getFightSyncRemoteKeys() {
    return fightSyncRemoteKeys;
}

function stopFightSync() {
    if (fightSyncPingTimer) { clearInterval(fightSyncPingTimer); fightSyncPingTimer = null; }
    if (fightSyncChannel) { try { sb && sb.removeChannel(fightSyncChannel); } catch (e) {} fightSyncChannel = null; }
    fightSyncPeerPresent = false;
    fightSyncOnPeerLeft = null;
    // A secret belongs to ONE match. Carrying it into the next one would
    // arm the filter against the new opponent and drop all their input.
    fightSyncSecret = null;
}
window.addEventListener('pagehide', stopFightSync);
