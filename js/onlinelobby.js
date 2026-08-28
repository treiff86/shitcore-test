/* ============================================================
   ONLINE FIGHT CLUB — LOBBY / MATCHMAKING
   ============================================================
   This is the "find and connect to an opponent" layer, relayed
   through Supabase Realtime (the same system already running the
   leaderboard). Once matched, both sides open the Fight Game with
   a real live input-sync channel between them (see js/onlinesync.js
   and updateRemoteInput() in fightgame.js) - not peer-to-peer, but
   a genuine live connection: your actual inputs reach your
   opponent and vice versa, not a local CPU standing in for them.

   Depends on sb / walletAddress / walletSolDomain / shortAddr /
   showToast / openFightGame / getActiveFighterKey from web3.js,
   and startFightSync / stopFightSync from onlinesync.js, so this
   file must load after both.
   ============================================================ */

let lobbyChannel = null;
const ROOM_LIST_WINDOW_MINUTES = 10; // only show recently-created rooms; older ones are considered stale

// Identifies THIS BROWSER TAB, not the wallet - two tabs on the same
// wallet (like when testing solo with the master wallet) would otherwise
// look identical by wallet address alone, and neither would ever see a
// Join button for the other's room. Fresh every tab/reload on purpose.
const mySessionId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
let myRoomId = null; // the room THIS tab created, if any - used to clean it up on the way out

function lobbyDisplayName() {
    if (typeof walletSolDomain !== 'undefined' && walletSolDomain) return walletSolDomain;
    if (typeof shortAddr === 'function' && typeof walletAddress !== 'undefined' && walletAddress) return shortAddr(walletAddress);
    return 'Anonymous Degen';
}

/* Best-effort cleanup of the room this tab created, fired when the tab
   is closed, refreshed, or navigated away from.

   NOTHING WRITES TO fight_rooms DIRECTLY ANY MORE.

   The anon key is public - it is in the page source - so it identifies
   nobody, and while the table accepted direct writes from it, anyone
   could delete every room in the lobby on a loop or edit a match they
   were not in. The table is now SELECT-only to anon, and creating,
   joining and leaving all go through database functions that check
   mySessionId first. That id never leaves this tab except into those
   calls: it is stored in a side table the client cannot read at all.

   So this is still a keepalive fetch (it has to survive the page
   unloading, and unlike sendBeacon it can carry the apikey header
   Supabase needs) - it just posts to the function instead of the table. */
function cleanupMyRoom() {
    if (!myRoomId || typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined') return;
    try {
        fetch(`${SUPABASE_URL}/rest/v1/rpc/fight_room_leave`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ p_room: myRoomId, p_session: mySessionId }),
            keepalive: true,
        });
    } catch (e) { /* best effort - nothing more we can do on the way out */ }
    myRoomId = null;
}
window.addEventListener('pagehide', cleanupMyRoom);
window.addEventListener('beforeunload', cleanupMyRoom);

async function renderLobbyRooms() {
    const box = document.getElementById('lobbyRoomList');
    if (!box) return;
    if (!sb) { box.innerHTML = `<div class="text-gray-500 italic text-xs">Lobby not configured yet.</div>`; return; }

    const cutoff = new Date(Date.now() - ROOM_LIST_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { data, error } = await sb
        .from('fight_rooms')
        // host_session used to be selected here so a tab could spot its
        // own room - which also meant anyone browsing the lobby could
        // read it, and it was the only thing standing between them and
        // deleting that room. It now lives in a table the client cannot
        // read at all, and "is this mine" is answered locally by myRoomId.
        .select('id, host_wallet, host_name, guest_wallet, status, created_at')
        .eq('status', 'waiting')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        box.innerHTML = `<div class="text-rose-400 text-xs">Couldn't load the lobby.</div>`;
        console.error('[onlinelobby] list failed:', error);
        return;
    }
    if (!data.length) {
        box.innerHTML = `<div class="text-gray-500 italic text-xs">No open rooms right now. Create one below.</div>`;
        return;
    }

    box.innerHTML = data.map(room => `
        <div class="flex justify-between items-center text-xs border-b border-[#1A2232] py-2">
            <span>${room.host_name ? escapeHtml(room.host_name) : shortAddr(room.host_wallet)}'s room</span>
            ${room.id === myRoomId
                ? `<span class="text-gray-500 italic">Waiting for an opponent…</span>`
                : `<button onclick="joinLobbyRoom('${room.id}')" class="bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-300 rounded px-3 py-1 font-bold transition">Join</button>`}
        </div>
    `).join('');
}

async function createLobbyRoom() {
    if (!sb || !walletAddress) { if (typeof showToast === 'function') showToast('Connect a wallet first.', 'error'); return; }
    const myTheme = (typeof getActiveFighterKey === 'function') ? getActiveFighterKey() : 'reiffer';
    const arena = (typeof pickRandomArenaSrc === 'function') ? pickRandomArenaSrc() : null;
    /* fight_room_create() also clears any waiting room this wallet still
       had open, so clicking Create twice replaces your room instead of
       adding a second one - which is what stopped the lobby being
       floodable. It returns the new room's id and nothing else. */
    const { data, error } = await sb.rpc('fight_room_create', {
        p_session: mySessionId,
        p_wallet: walletAddress,
        p_name: lobbyDisplayName(),
        p_theme: myTheme,
        p_arena: arena,
    });

    if (error || !data) {
        if (typeof showToast === 'function') showToast("Couldn't create a room - try again.", 'error');
        console.error('[onlinelobby] create failed:', error);
        return;
    }
    myRoomId = data;
    if (typeof showToast === 'function') showToast('🥊 Room created - waiting for an opponent…', 'info');
    renderLobbyRooms();
}

async function joinLobbyRoom(roomId) {
    if (!sb || !walletAddress) { if (typeof showToast === 'function') showToast('Connect a wallet first.', 'error'); return; }
    const myTheme = (typeof getActiveFighterKey === 'function') ? getActiveFighterKey() : 'reiffer';
    /* fight_room_join() claims the room and records this tab's session in
       one statement, so two people racing for the last room cannot both
       win - the loser gets no row back, same as before. It returns only
       the fields the guest needs, never the other side's session id. */
    const { data: rows, error } = await sb.rpc('fight_room_join', {
        p_room: roomId,
        p_session: mySessionId,
        p_wallet: walletAddress,
        p_name: lobbyDisplayName(),
        p_theme: myTheme,
    });
    const data = Array.isArray(rows) ? rows[0] : rows;

    if (error) {
        if (typeof showToast === 'function') showToast("Couldn't join that room - try again.", 'error');
        console.error('[onlinelobby] join failed:', error);
        return;
    }
    if (!data) {
        if (typeof showToast === 'function') showToast('That room just got taken - try another.', 'error');
        renderLobbyRooms();
        return;
    }

    if (typeof showToast === 'function') {
        showToast(`🔗 Connected to ${data.host_name || shortAddr(data.host_wallet)}! Syncing up…`, 'success');
    }
    startOnlineMatch({
        roomId,
        isHost: false,
        myKey: myTheme,
        opponentKey: data.host_theme || 'reiffer',
        arenaSrc: data.arena_src || null,
        myName: lobbyDisplayName(),
        opponentName: data.host_name || shortAddr(data.host_wallet) || 'Opponent',
    });
    renderLobbyRooms();
}

// Shared by both the guest (right after joining) and the host (right after
// someone joins their room, in the realtime handler below) - one place
// that sets up everything a real match needs: which fighter each side
// plays as, which arena, the live input-sync channel, and what happens if
// the opponent's connection drops mid-fight.
/* THE MATCH SECRET.

   Every room's id is public - it has to be, the lobby lists it - and the
   live input channel is named after it. Before this, that meant anyone
   who read a room id off the lobby could subscribe to a stranger's match
   and broadcast inputs into it: not "watch", DRIVE. Your opponent's
   fighter would start moving to someone else's keyboard, and neither of
   you would have any way to tell.

   So each room now carries a secret that is NOT in the lobby's SELECT
   grant. You can only get it by presenting your own session id - the
   host's or the guest's - to fight_room_secret(), and neither of those
   is readable either. Every broadcast carries the secret and the other
   side drops anything that doesn't match, so a third party with the room
   id has the address but not the key. */
async function fetchMatchSecret(roomId) {
    if (!sb || !roomId) return null;
    try {
        const { data, error } = await sb.rpc('fight_room_secret', {
            p_room: roomId, p_session: mySessionId,
        });
        if (error) { console.warn('[onlinelobby] match secret unavailable:', error.message); return null; }
        return data || null;
    } catch (e) { console.warn('[onlinelobby] match secret failed:', e); return null; }
}

function startOnlineMatch({ roomId, isHost, myKey, opponentKey, arenaSrc, myName, opponentName }) {
    window.fightClubOnlineNames = { p1: myName, p2: opponentName };
    window.fightClubOnlineFighters = { p1: myKey, p2: opponentKey };
    window.fightClubOnlineArena = arenaSrc;
    window.fightClubOnlineRoomId = roomId;
    window.fightClubOnlineIsHost = isHost;
    window.fightClubOnlineActive = true;

    if (typeof startFightSync === 'function') {
        startFightSync(roomId, () => {
            // Opponent's presence dropped mid-match - closed the tab, lost
            // their connection, etc. Nothing to fight against anymore, so
            // end it cleanly rather than leaving the local player stuck
            // fighting a frozen opponent forever.
            if (typeof showToast === 'function') showToast('Your opponent disconnected.', 'error');
            if (typeof closeFightGame === 'function') closeFightGame();
        });
    }
    /* Armed AFTER the channel is open, and deliberately not awaited.
       startFightSync() calls stopFightSync(), which clears any secret
       from the previous match - so fetching first would have the new
       secret wiped out a moment later by the very call that needs it.

       Not awaited because the channel should be live immediately: until
       the filter is armed, unsigned traffic is still accepted, which
       costs a sub-second window and saves losing the opponent's opening
       frames to a database round trip. */
    if (typeof setFightSyncSecret === 'function') {
        fetchMatchSecret(roomId).then((secret) => {
            if (secret) setFightSyncSecret(secret);
            else console.warn('[onlinelobby] no match secret - sync channel stays unauthenticated for this match');
        });
    }
    if (typeof openFightGame === 'function') openFightGame();
}

function subscribeLobbyRealtime() {
    if (!sb || lobbyChannel) return;
    lobbyChannel = sb
        .channel('fight-rooms-lobby')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fight_rooms' }, (payload) => {
            renderLobbyRooms();
            // My own room just got matched by someone else - jump into the
            // Fight Game on this side too. myRoomId gets cleared right after
            // so a stray duplicate event can't open it twice, and so leaving
            // the page later doesn't try to delete an already-matched room.
            if (payload.eventType === 'UPDATE' && payload.new?.status === 'matched'
                && myRoomId && payload.new?.id === myRoomId) {
                if (typeof showToast === 'function') {
                    showToast(`🔗 ${payload.new.guest_name || 'An opponent'} joined your room! Syncing up…`, 'success');
                }
                const myTheme = (typeof getActiveFighterKey === 'function') ? getActiveFighterKey() : 'reiffer';
                startOnlineMatch({
                    roomId: myRoomId,
                    isHost: true,
                    myKey: myTheme,
                    opponentKey: payload.new.guest_theme || 'reiffer',
                    arenaSrc: payload.new.arena_src || null,
                    myName: lobbyDisplayName(),
                    opponentName: payload.new.guest_name || shortAddr(payload.new.guest_wallet) || 'Opponent',
                });
                myRoomId = null;
            }
        })
        .subscribe();
}

function openOnlineLobby() {
    renderLobbyRooms();
    subscribeLobbyRealtime();
}

/* ---------------- Debug menu: connectivity check ---------------- */
// Round-trips a real request to Supabase and reports how long it took, so
// "is my internet actually reaching the backend right now" is a one-click
// answer instead of guesswork through DevTools.
async function checkConnectivity() {
    const out = document.getElementById('connectivityCheckResult');
    if (out) out.textContent = 'Checking…';
    if (!sb) { if (out) out.textContent = '❌ Supabase not configured.'; return; }

    const start = performance.now();
    try {
        const { error } = await sb.from('fight_rooms').select('id', { count: 'exact', head: true });
        const ms = Math.round(performance.now() - start);
        if (error) { if (out) out.textContent = `❌ Reached the server but got an error: ${error.message}`; return; }
        if (out) out.textContent = `✅ Connected - round trip ${ms}ms.`;
    } catch (e) {
        const ms = Math.round(performance.now() - start);
        if (out) out.textContent = `❌ No connection (failed after ${ms}ms). Check your internet.`;
    }
}
