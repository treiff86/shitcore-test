/* ============================================================
   $MIM / BITCOIN WIZARD THEME — WINDOWS 95 DESKTOP
   ============================================================
   When active, physically moves every [data-win95-window]
   element into a full-screen desktop overlay and wraps each in
   a draggable title-bar window, with a taskbar along the bottom.
   Deactivating moves everything back to its original place in
   the page exactly as it was.

   Panels keep their existing dark-card styling inside the window
   body rather than being fully re-skinned individually - reads
   like "a browser window sitting on a Win95 desktop," which is
   achievable without redoing every panel's internal look per
   theme.
   ============================================================ */

let win95Active = false;
const win95OriginalSlots = []; // [{el, parent, nextSibling}] for restoring on deactivate
let win95TopZ = 100;

function isWin95Supported() {
    return document.querySelectorAll('[data-win95-window]').length > 0;
}

function enterWin95Desktop() {
    if (win95Active) return;
    win95Active = true;
    document.body.classList.add('win95-mode');

    const desktop = document.createElement('div');
    desktop.id = 'win95Desktop';
    document.body.appendChild(desktop);

    const taskbar = document.createElement('div');
    taskbar.id = 'win95Taskbar';
    taskbar.innerHTML = `
        <div class="win95-start-btn">🪟 Start</div>
        <div id="win95TaskbarItems" style="display:flex;gap:4px;"></div>
        <div id="win95Clock"></div>
    `;
    document.body.appendChild(taskbar);
    updateWin95Clock();
    window._win95ClockInterval = setInterval(updateWin95Clock, 30000);

    const panels = [...document.querySelectorAll('[data-win95-window]')];
    const cols = Math.ceil(Math.sqrt(panels.length));
    panels.forEach((panel, i) => {
        win95OriginalSlots.push({ el: panel, parent: panel.parentElement, nextSibling: panel.nextSibling });

        const win = document.createElement('div');
        win.className = 'win95-window';
        win.style.left = `${24 + (i % cols) * 40}px`;
        win.style.top = `${24 + Math.floor(i / cols) * 40}px`;
        win.style.width = `${panel.getBoundingClientRect().width || 380}px`;

        const title = panel.getAttribute('data-win95-window') || 'Window.exe';
        const titlebar = document.createElement('div');
        titlebar.className = 'win95-titlebar';
        titlebar.innerHTML = `<span>🪟 ${title}</span><div class="win95-titlebar-buttons"><div class="win95-titlebar-btn">_</div><div class="win95-titlebar-btn">□</div><div class="win95-titlebar-btn">×</div></div>`;

        const body = document.createElement('div');
        body.className = 'win95-window-body';

        win.appendChild(titlebar);
        win.appendChild(body);
        desktop.appendChild(win);
        body.appendChild(panel); // moves the real panel (and all its live JS-bound content) into the window body

        makeWin95Draggable(win, titlebar);
        win.addEventListener('mousedown', () => bringWin95ToFront(win));

        // Taskbar entry
        const taskItem = document.createElement('div');
        taskItem.className = 'win95-taskbar-item active';
        taskItem.textContent = title;
        taskItem.onclick = () => bringWin95ToFront(win);
        document.getElementById('win95TaskbarItems').appendChild(taskItem);

        // Close button just minimizes to taskbar (nothing is ever really
        // "closed" here - the underlying panel still needs to exist and
        // keep updating for the rest of the game to work).
        titlebar.querySelector('.win95-titlebar-btn:last-child').onclick = (e) => {
            e.stopPropagation();
            win.style.display = win.style.display === 'none' ? 'flex' : 'none';
        };
        titlebar.querySelector('.win95-titlebar-btn:first-child').onclick = (e) => {
            e.stopPropagation();
            win.style.display = 'none';
        };
    });
}

function exitWin95Desktop() {
    if (!win95Active) return;
    win95Active = false;
    document.body.classList.remove('win95-mode');
    clearInterval(window._win95ClockInterval);

    // Move every panel back to exactly where it came from.
    win95OriginalSlots.forEach(({ el, parent, nextSibling }) => {
        if (nextSibling && nextSibling.parentElement === parent) {
            parent.insertBefore(el, nextSibling);
        } else {
            parent.appendChild(el);
        }
    });
    win95OriginalSlots.length = 0;

    document.getElementById('win95Desktop')?.remove();
    document.getElementById('win95Taskbar')?.remove();
}

function bringWin95ToFront(win) {
    win95TopZ += 1;
    win.style.zIndex = win95TopZ;
}

function makeWin95Draggable(win, handle) {
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    handle.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('win95-titlebar-btn')) return;
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        startLeft = win.offsetLeft; startTop = win.offsetTop;
        bringWin95ToFront(win);
        e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        win.style.left = `${Math.max(0, startLeft + (e.clientX - startX))}px`;
        win.style.top = `${Math.max(0, startTop + (e.clientY - startY))}px`;
    });
    window.addEventListener('mouseup', () => { dragging = false; });
}

function updateWin95Clock() {
    const el = document.getElementById('win95Clock');
    if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
