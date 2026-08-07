/* ============================================================
   ONLINE FIGHT CLUB — STAGE 1: LOBBY / MATCHMAKING
   ============================================================
   This is just the "find and connect to an opponent" layer,
   relayed through Supabase Realtime (the same system already
   running the leaderboard) rather than a direct connection
   between the two players. Actual live match input-syncing
   (Stage 2) isn't built yet - joining a room right now proves
   the connection pipeline genuinely works end to end, it doesn't
   start a synced match.

   Depends on sb / walletAddress / walletSolDomain / shortAddr /
   showToast from web3.js, so this file must load AFTER web3.js.
   ============================================================ */

let lobbyChannel = null;
const ROOM_LIST_WINDOW_MINUTES = 10; // only show recently-created rooms; older ones are considered stale

function lobbyDisplayName() {
    if (typeof walletSolDomain !== 'undefined' && walletSolDomain) return walletSolDomain;
    if (typeof shortAddr === 'function' && typeof walletAddress !== 'undefined' && walletAddress) return shortAddr(walletAddress);
    return 'Anonymous Degen';
}

async function renderLobbyRooms() {
    const box = document.getElementById('lobbyRoomList');
    if (!box) return;
    if (!sb) { box.innerHTML = `<div class="text-gray-500 italic text-xs">Lobby not configured yet.</div>`; return; }

    const cutoff = new Date(Date.now() - ROOM_LIST_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { data, error } = await sb
        .from('fight_rooms')
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
            <span>${room.host_name || shortAddr(room.host_wallet)}'s room</span>
            ${room.host_wallet === walletAddress
                ? `<span class="text-gray-500 italic">Waiting for an opponent…</span>`
                : `<button onclick="joinLobbyRoom('${room.id}')" class="bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-300 rounded px-3 py-1 font-bold transition">Join</button>`}
        </div>
    `).join('');
}

async function createLobbyRoom() {
    if (!sb || !walletAddress) { if (typeof showToast === 'function') showToast('Connect a wallet first.', 'error'); return; }
    const { error } = await sb.from('fight_rooms').insert({
        host_wallet: walletAddress,
        host_name: lobbyDisplayName(),
        status: 'waiting',
    });

    if (error) {
        if (typeof showToast === 'function') showToast("Couldn't create a room - try again.", 'error');
        console.error('[onlinelobby] create failed:', error);
        return;
    }
    if (typeof showToast === 'function') showToast('🥊 Room created - waiting for an opponent…', 'info');
    renderLobbyRooms();
}

async function joinLobbyRoom(roomId) {
    if (!sb || !walletAddress) { if (typeof showToast === 'function') showToast('Connect a wallet first.', 'error'); return; }
    const { data, error } = await sb
        .from('fight_rooms')
        .update({ guest_wallet: walletAddress, guest_name: lobbyDisplayName(), status: 'matched' })
        .eq('id', roomId)
        .eq('status', 'waiting') // someone else could've joined a split second earlier - don't double-join a taken room
        .select()
        .maybeSingle();

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
        showToast(`🔗 Connected to ${data.host_name || shortAddr(data.host_wallet)}! Live synced matches aren't wired up yet - this just confirms the connection works.`, 'success');
    }
    renderLobbyRooms();
}

function subscribeLobbyRealtime() {
    if (!sb || lobbyChannel) return;
    lobbyChannel = sb
        .channel('fight-rooms-lobby')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fight_rooms' }, renderLobbyRooms)
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
