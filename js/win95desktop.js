/* ============================================================
   $MIM / BITCOIN WIZARD THEME — WINDOWS 95 DESKTOP
   ============================================================
   Moves the panels of WHICHEVER tab is currently active (plus
   the always-visible Command Center) into a scrollable desktop
   overlay, each wrapped as a draggable window, with a taskbar
   along the bottom. The header and nav bar stay put and visible
   (styled for the theme via CSS) rather than being covered - so
   switching tabs/tools still works normally while this is on.

   Panels are found automatically by their shared card styling
   (bg-[#0C0F16]) rather than needing every single one hand-
   tagged - covers every tab, including ones added dynamically
   (like OpenShit), with a couple of panels still using an
   explicit data-win95-window title where a nicer name matters.
   Switching tabs while this is active tears down the old set of
   windows and rebuilds for whatever's now on screen.
   ============================================================ */

let win95Active = false;
const win95OriginalSlots = []; // [{el, parent, nextSibling}] for restoring panels to their real DOM spot
let win95TopZ = 100;

function win95CardSelector() {
    // Tailwind's arbitrary-value classes can't be matched with a plain CSS
    // class selector without escaping brackets, so this matches on the
    // class attribute containing the color instead - same practical effect,
    // no escaping needed.
    return '[data-win95-window], [class*="0C0F16"]';
}

// Whichever tab content section is actually visible right now, plus the
// always-on Command Center - covers every tab automatically, including
// ones that don't exist yet when this file loads.
function win95ActiveSections() {
    const activeTab = [...document.querySelectorAll('main > section[id^="content-"]')]
        .find(s => !s.classList.contains('hidden'));
    const commandCenter = document.getElementById('commandCenterSection');
    return [activeTab, commandCenter].filter(Boolean);
}

function collectWin95Panels() {
    const found = [];
    win95ActiveSections().forEach(section => {
        section.querySelectorAll(win95CardSelector()).forEach(card => {
            if (found.includes(card)) return;
            // Skip a card that's nested inside another matching card - only
            // want the outer one, or a panel inside a panel gets double-wrapped.
            if (card.parentElement && card.parentElement.closest(win95CardSelector())) return;
            found.push(card);
        });
    });
    return found;
}

function win95Title(card, index) {
    if (card.hasAttribute('data-win95-window')) return card.getAttribute('data-win95-window');
    const heading = card.querySelector('h1, h2, h3, h4, h5, .font-black, .font-bold');
    const text = heading ? heading.textContent.trim().replace(/\s+/g, '').slice(0, 24) : '';
    return (text || `Window${index + 1}`) + '.exe';
}

function positionWin95Desktop() {
    const desktop = document.getElementById('win95Desktop');
    if (!desktop) return;
    const header = document.querySelector('header');
    const nav = document.querySelector('nav');
    const topOffset = (header?.offsetHeight || 0) + (nav?.offsetHeight || 0);
    desktop.style.top = `${topOffset}px`;
}

function enterWin95Desktop() {
    if (win95Active) return;
    win95Active = true;
    document.body.classList.add('win95-mode');
    if (typeof window.WizardPopups !== 'undefined') window.WizardPopups.init();

    const desktop = document.createElement('div');
    desktop.id = 'win95Desktop';
    document.body.appendChild(desktop);
    positionWin95Desktop();
    window.addEventListener('resize', positionWin95Desktop);

    const taskbar = document.createElement('div');
    taskbar.id = 'win95Taskbar';
    taskbar.innerHTML = `
        <div class="win95-start-btn">Start</div>
        <div id="win95TaskbarItems" style="display:flex;gap:4px;overflow-x:auto;"></div>
        <div id="win95Clock"></div>
    `;
    document.body.appendChild(taskbar);
    updateWin95Clock();
    window._win95ClockInterval = setInterval(updateWin95Clock, 30000);

    buildWin95Windows();
}

// Tears down the current set of windows (returning every panel to its real
// spot in the page, still hidden the same way normal tab-switching hides
// it) without exiting Win95 mode itself - used both when switching tabs
// and as the first half of a full exit.
function returnWin95Panels() {
    win95OriginalSlots.forEach(({ el, parent, nextSibling }) => {
        if (nextSibling && nextSibling.parentElement === parent) {
            parent.insertBefore(el, nextSibling);
        } else {
            parent.appendChild(el);
        }
    });
    win95OriginalSlots.length = 0;
    document.querySelectorAll('.win95-window').forEach(w => w.remove());
    const items = document.getElementById('win95TaskbarItems');
    if (items) items.innerHTML = '';
}

function buildWin95Windows() {
    const desktop = document.getElementById('win95Desktop');
    if (!desktop) return;

    const panels = collectWin95Panels();
    const startRects = panels.map(p => p.getBoundingClientRect());
    const headerNavH = (document.querySelector('header')?.offsetHeight || 0) + (document.querySelector('nav')?.offsetHeight || 0);

    panels.forEach((panel, i) => {
        win95OriginalSlots.push({ el: panel, parent: panel.parentElement, nextSibling: panel.nextSibling });
        const rect = startRects[i];

        const win = document.createElement('div');
        win.className = 'win95-window';
        win.style.left = `${Math.round(rect.left)}px`;
        win.style.top = `${Math.max(4, Math.round(rect.top - headerNavH))}px`;
        win.style.width = `${Math.round(rect.width) || 380}px`;

        const title = win95Title(panel, i);
        const titlebar = document.createElement('div');
        titlebar.className = 'win95-titlebar';
        titlebar.innerHTML = `<span>${title}</span><div class="win95-titlebar-buttons"><div class="win95-titlebar-btn">_</div><div class="win95-titlebar-btn">&#9633;</div><div class="win95-titlebar-btn">X</div></div>`;

        const body = document.createElement('div');
        body.className = 'win95-window-body';

        win.appendChild(titlebar);
        win.appendChild(body);
        desktop.appendChild(win);
        body.appendChild(panel); // moves the real panel (and all its live JS-bound content) into the window body

        makeWin95Draggable(win, titlebar);
        win.addEventListener('mousedown', () => bringWin95ToFront(win));

        const taskItem = document.createElement('div');
        taskItem.className = 'win95-taskbar-item active';
        taskItem.textContent = title;
        taskItem.onclick = () => { win.style.display = 'flex'; bringWin95ToFront(win); };
        document.getElementById('win95TaskbarItems')?.appendChild(taskItem);

        // Neither button destroys anything - the panel still needs to keep
        // updating for the rest of the game to work - both just hide the
        // window, and the taskbar entry is what brings it back.
        titlebar.querySelector('.win95-titlebar-btn:first-child').onclick = (e) => { e.stopPropagation(); win.style.display = 'none'; };
        titlebar.querySelector('.win95-titlebar-btn:last-child').onclick = (e) => { e.stopPropagation(); win.style.display = 'none'; };
    });
}

// Called from switchTab() while Win95 mode is active - swaps out the
// current windows for whatever the newly-active tab actually has.
function rebuildWin95WindowsForActiveTab() {
    if (!win95Active) return;
    returnWin95Panels();
    buildWin95Windows();
}

function exitWin95Desktop() {
    if (!win95Active) return;
    win95Active = false;
    document.body.classList.remove('win95-mode');
    if (typeof window.WizardPopups !== 'undefined') window.WizardPopups.stop();
    clearInterval(window._win95ClockInterval);
    window.removeEventListener('resize', positionWin95Desktop);

    returnWin95Panels();
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
