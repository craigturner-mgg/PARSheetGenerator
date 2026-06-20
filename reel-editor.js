/**
 * Reel Editor Module
 * Provides visual editing of reel strips with drag-and-drop reordering,
 * symbol management, and live statistics.
 */

// ============ REEL EDITOR STATE ============
let editorState = {
    activeReel: 0,
    selectedItems: new Set(),
    draggedIndex: null,
    filterSymbol: ''
};

// ============ SYMBOL COLORS ============
function getSymbolColorClass(symbol) {
    const known = ['J', 'Q', 'K', 'A', 'M2', 'M1', 'H3', 'H2', 'H1', 'W', 'S'];
    return known.includes(symbol) ? `symbol-color-${symbol}` : 'symbol-color-default';
}

// ============ INITIALISE EDITOR ============
let editorToolbarInitialized = false;

function initReelEditor() {
    renderReelSelector();
    renderReelStrip();
    renderReelStats();
    if (!editorToolbarInitialized) {
        setupEditorToolbar();
        editorToolbarInitialized = true;
    } else {
        populateSymbolDropdown();
        populateFilterDropdown();
    }
}

// ============ REEL SELECTOR PANEL ============
function renderReelSelector() {
    const panel = document.getElementById('reelSelectorPanel');
    const config = getConfig();
    let html = '';

    for (let i = 0; i < config.numReels; i++) {
        const strip = gameData.reelStrips[i] || [];
        const isActive = i === editorState.activeReel;
        html += `<button class="reel-selector-btn ${isActive ? 'active' : ''}" data-reel="${i}">
            Reel ${i + 1}
            <div class="reel-info">${strip.length} stops</div>
        </button>`;
    }

    // Duplicate reel section
    html += `<div class="duplicate-section">
        <h4 style="color: #00d4ff; margin-bottom: 8px; font-size: 0.85em;">Duplicate Reel</h4>
        <select id="duplicateSourceSelect">`;
    for (let i = 0; i < config.numReels; i++) {
        html += `<option value="${i}">From Reel ${i + 1}</option>`;
    }
    html += `</select>
        <select id="duplicateTargetSelect">`;
    for (let i = 0; i < config.numReels; i++) {
        html += `<option value="${i}">To Reel ${i + 1}</option>`;
    }
    html += `</select>
        <button id="duplicateReelBtn" style="width:100%; margin-top: 6px; font-size: 0.8em; padding: 8px;">📋 Duplicate</button>
    </div>`;

    panel.innerHTML = html;

    // Bind reel selector clicks
    panel.querySelectorAll('.reel-selector-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            editorState.activeReel = parseInt(btn.dataset.reel);
            editorState.selectedItems.clear();
            editorState.filterSymbol = '';
            renderReelSelector();
            renderReelStrip();
            renderReelStats();
            populateFilterDropdown();
        });
    });

    // Bind duplicate button
    const dupBtn = document.getElementById('duplicateReelBtn');
    if (dupBtn) {
        dupBtn.addEventListener('click', duplicateReel);
    }
}

function duplicateReel() {
    const source = parseInt(document.getElementById('duplicateSourceSelect').value);
    const target = parseInt(document.getElementById('duplicateTargetSelect').value);

    if (source === target) {
        alert('Source and target reels must be different.');
        return;
    }

    if (!gameData.reelStrips[source] || gameData.reelStrips[source].length === 0) {
        alert('Source reel is empty.');
        return;
    }

    gameData.reelStrips[target] = [...gameData.reelStrips[source]];
    recalculateSymbolCounts();
    editorState.activeReel = target;
    renderReelSelector();
    renderReelStrip();
    renderReelStats();
    runEvaluation();
}

// ============ REEL STRIP LIST ============
function renderReelStrip() {
    const list = document.getElementById('reelStripList');
    const strip = gameData.reelStrips[editorState.activeReel] || [];

    if (strip.length === 0) {
        list.innerHTML = '<li style="justify-content: center; color: #666; cursor: default;">No symbols on this reel. Add symbols using the toolbar above.</li>';
        return;
    }

    const filter = editorState.filterSymbol;
    let html = '';
    let visibleCount = 0;

    for (let i = 0; i < strip.length; i++) {
        const sym = strip[i];

        // Apply filter
        if (filter && sym !== filter) continue;

        visibleCount++;
        const colorClass = getSymbolColorClass(sym);
        const selected = editorState.selectedItems.has(i) ? 'border-color: #00ff88;' : '';
        html += `<li draggable="true" data-index="${i}" style="${selected}">
            <span class="stop-number">#${i + 1}</span>
            <span class="symbol-badge ${colorClass}">${sym}</span>
            <span class="symbol-name">${getSymbolDisplayName(sym)}</span>
            <button class="delete-btn" data-index="${i}" title="Delete this stop">✕</button>
        </li>`;
    }

    if (visibleCount === 0 && filter) {
        list.innerHTML = `<li style="justify-content: center; color: #666; cursor: default;">No "${filter}" symbols on this reel.</li>`;
        return;
    }

    list.innerHTML = html;
    bindDragEvents();
    bindDeleteButtons();
    bindItemSelection();
}

function getSymbolDisplayName(sym) {
    const entry = gameData.paytable.find(e => e.symbol === sym);
    if (entry) return '';
    // Check config for special names
    const config = getConfig();
    if (sym === config.wildSymbol) return '(Wild)';
    if (sym === config.scatterSymbol) return '(Scatter)';
    return '';
}

// ============ DRAG AND DROP ============
function bindDragEvents() {
    const list = document.getElementById('reelStripList');
    const items = list.querySelectorAll('li[draggable]');

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            editorState.draggedIndex = parseInt(item.dataset.index);
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.index);
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            editorState.draggedIndex = null;
            list.querySelectorAll('li').forEach(li => li.classList.remove('drag-over'));
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const targetIndex = parseInt(item.dataset.index);
            if (targetIndex !== editorState.draggedIndex) {
                list.querySelectorAll('li').forEach(li => li.classList.remove('drag-over'));
                item.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            const fromIndex = editorState.draggedIndex;
            const toIndex = parseInt(item.dataset.index);

            if (fromIndex !== null && fromIndex !== toIndex) {
                moveSymbol(fromIndex, toIndex);
            }
        });
    });
}

function moveSymbol(fromIndex, toIndex) {
    const strip = gameData.reelStrips[editorState.activeReel];
    const [moved] = strip.splice(fromIndex, 1);
    strip.splice(toIndex, 0, moved);

    editorState.selectedItems.clear();
    renderReelStrip();
    renderReelStats();
    // No need to recalculate RTP for reorder within same reel (counts stay same)
}

// ============ ITEM SELECTION ============
function bindItemSelection() {
    const list = document.getElementById('reelStripList');
    const items = list.querySelectorAll('li[draggable]');

    items.forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't select when clicking delete button
            if (e.target.classList.contains('delete-btn')) return;

            const index = parseInt(item.dataset.index);
            if (e.ctrlKey || e.metaKey) {
                // Toggle selection
                if (editorState.selectedItems.has(index)) {
                    editorState.selectedItems.delete(index);
                } else {
                    editorState.selectedItems.add(index);
                }
            } else {
                editorState.selectedItems.clear();
                editorState.selectedItems.add(index);
            }
            renderReelStrip();
        });
    });
}

// ============ DELETE BUTTONS ============
function bindDeleteButtons() {
    const list = document.getElementById('reelStripList');
    list.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            deleteSymbolAt(index);
        });
    });
}

function deleteSymbolAt(index) {
    const strip = gameData.reelStrips[editorState.activeReel];
    strip.splice(index, 1);
    editorState.selectedItems.clear();
    recalculateSymbolCounts();
    populateFilterDropdown();
    renderReelSelector();
    renderReelStrip();
    renderReelStats();
    runEvaluation();
}

function deleteSelected() {
    if (editorState.selectedItems.size === 0) {
        alert('No items selected. Click items to select (Ctrl+click for multi-select).');
        return;
    }

    const strip = gameData.reelStrips[editorState.activeReel];
    // Delete from highest index to lowest to avoid index shifting
    const sorted = Array.from(editorState.selectedItems).sort((a, b) => b - a);
    for (const idx of sorted) {
        strip.splice(idx, 1);
    }

    editorState.selectedItems.clear();
    recalculateSymbolCounts();
    populateFilterDropdown();
    renderReelSelector();
    renderReelStrip();
    renderReelStats();
    runEvaluation();
}

function replaceSelected() {
    if (editorState.selectedItems.size === 0) {
        alert('No items selected. Click items to select (Ctrl+click for multi-select).');
        return;
    }

    // Use the dropdown value, or custom input if filled
    const customInput = document.getElementById('customSymbolInput');
    const select = document.getElementById('addSymbolSelect');
    let newSymbol = customInput.value.trim().toUpperCase();
    if (!newSymbol) {
        newSymbol = select.value;
    }

    if (!newSymbol) {
        alert('Select a symbol from the dropdown or enter one in the custom field.');
        return;
    }

    const strip = gameData.reelStrips[editorState.activeReel];
    for (const idx of editorState.selectedItems) {
        strip[idx] = newSymbol;
    }

    customInput.value = '';
    editorState.selectedItems.clear();
    recalculateSymbolCounts();
    populateSymbolDropdown();
    populateFilterDropdown();
    renderReelSelector();
    renderReelStrip();
    renderReelStats();
    runEvaluation();
}

// ============ ADD SYMBOLS ============
function setupEditorToolbar() {
    populateSymbolDropdown();
    populateFilterDropdown();

    document.getElementById('addSymbolBtn').addEventListener('click', () => {
        const select = document.getElementById('addSymbolSelect');
        const symbol = select.value;
        if (symbol) addSymbolToReel(symbol);
    });

    document.getElementById('addCustomSymbolBtn').addEventListener('click', () => {
        const input = document.getElementById('customSymbolInput');
        const symbol = input.value.trim().toUpperCase();
        if (symbol) {
            addSymbolToReel(symbol);
            input.value = '';
        } else {
            alert('Enter a symbol ID in the custom field.');
        }
    });

    document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelected);

    document.getElementById('replaceSelectedBtn').addEventListener('click', replaceSelected);

    document.getElementById('filterSymbolSelect').addEventListener('change', (e) => {
        editorState.filterSymbol = e.target.value;
        editorState.selectedItems.clear();
        renderReelStrip();
    });
}

function populateSymbolDropdown() {
    const select = document.getElementById('addSymbolSelect');
    const symbols = getUniqueSymbols();

    let html = '';
    for (const sym of symbols) {
        html += `<option value="${sym}">${sym}</option>`;
    }
    select.innerHTML = html;
}

function populateFilterDropdown() {
    const select = document.getElementById('filterSymbolSelect');
    const strip = gameData.reelStrips[editorState.activeReel] || [];

    // Get unique symbols on this reel
    const reelSymbols = [...new Set(strip)];

    let html = '<option value="">All Symbols</option>';
    for (const sym of reelSymbols) {
        const selected = editorState.filterSymbol === sym ? ' selected' : '';
        html += `<option value="${sym}"${selected}>${sym}</option>`;
    }
    select.innerHTML = html;
}

function getUniqueSymbols() {
    const symbols = new Set();
    // From paytable
    for (const entry of gameData.paytable) {
        symbols.add(entry.symbol);
    }
    // From reel strips
    for (const strip of gameData.reelStrips) {
        for (const sym of strip) {
            symbols.add(sym);
        }
    }
    return Array.from(symbols);
}

function addSymbolToReel(symbol) {
    const strip = gameData.reelStrips[editorState.activeReel];

    // If there are selected items, insert after last selected; otherwise append
    if (editorState.selectedItems.size > 0) {
        const maxSelected = Math.max(...editorState.selectedItems);
        strip.splice(maxSelected + 1, 0, symbol);
    } else {
        strip.push(symbol);
    }

    recalculateSymbolCounts();
    populateSymbolDropdown();
    populateFilterDropdown();
    renderReelSelector();
    renderReelStrip();
    renderReelStats();
    runEvaluation();
}

// ============ STATS PANEL ============
function renderReelStats() {
    const panel = document.getElementById('reelStatsPanel');
    const strip = gameData.reelStrips[editorState.activeReel] || [];
    const reelLength = strip.length;

    if (reelLength === 0) {
        panel.innerHTML = '<h4>Reel Statistics</h4><p style="color: #666;">No data for this reel.</p>';
        return;
    }

    // Count symbols on this reel
    const counts = {};
    for (const sym of strip) {
        counts[sym] = (counts[sym] || 0) + 1;
    }

    // Sort by count descending
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    let html = `<h4>Reel ${editorState.activeReel + 1} Statistics</h4>`;
    html += `<p style="color: #aaa; font-size: 0.85em; margin-bottom: 12px;">Total stops: <strong>${reelLength}</strong></p>`;

    html += `<table class="stats-table">
        <tr><th>Symbol</th><th>Count</th><th>Frequency</th><th></th></tr>`;

    for (const [sym, count] of sorted) {
        const pct = ((count / reelLength) * 100).toFixed(2);
        const barWidth = Math.round((count / reelLength) * 80);
        const colorClass = getSymbolColorClass(sym);
        html += `<tr>
            <td><span class="symbol-badge ${colorClass}">${sym}</span></td>
            <td>${count}</td>
            <td>${pct}%</td>
            <td><span class="freq-bar" style="width: ${barWidth}px;"></span></td>
        </tr>`;
    }

    html += '</table>';

    // All reels overview
    html += `<h4 style="margin-top: 20px;">All Reels Overview</h4>`;
    html += `<table class="stats-table"><tr><th>Reel</th><th>Stops</th></tr>`;
    const config = getConfig();
    for (let i = 0; i < config.numReels; i++) {
        const s = gameData.reelStrips[i] || [];
        const highlight = i === editorState.activeReel ? 'color: #00d4ff; font-weight: bold;' : '';
        html += `<tr style="${highlight}"><td>Reel ${i + 1}</td><td>${s.length}</td></tr>`;
    }
    html += '</table>';

    panel.innerHTML = html;
}

// ============ HELPERS ============
function recalculateSymbolCounts() {
    const config = getConfig();
    gameData.symbolCounts = {};

    for (let reel = 0; reel < config.numReels; reel++) {
        const strip = gameData.reelStrips[reel] || [];
        for (const sym of strip) {
            if (!gameData.symbolCounts[sym]) {
                gameData.symbolCounts[sym] = new Array(config.numReels).fill(0);
            }
            gameData.symbolCounts[sym][reel]++;
        }
    }

    // Sync back to active reel set
    if (gameData.reelSets && gameData.reelSets.length > 0 && gameData.activeReelSet !== undefined) {
        gameData.reelSets[gameData.activeReelSet].reelStrips = gameData.reelStrips.map(r => [...r]);
        gameData.reelSets[gameData.activeReelSet].symbolCounts = JSON.parse(JSON.stringify(gameData.symbolCounts));
    }
}

// ============ HOOK INTO TAB SYSTEM ============
// The reel editor is initialized when its tab is activated (handled in par-evaluator.js)
// This ensures the editor refreshes when data changes while the editor tab is visible.
