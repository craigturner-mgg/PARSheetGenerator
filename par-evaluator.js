/**
 * PAR Sheet Generator Engine
 * Calculates probability, RTP, and hit frequency for reel-based slot games.
 */

// ============ STATE ============
let gameData = {
    reelStrips: [],      // array of arrays: reelStrips[reelIndex][stopIndex] = symbolId (active set)
    paytable: [],        // array of { symbol, pays: { 3: val, 4: val, 5: val } }
    winLines: [],        // array of arrays: winLines[lineIndex][reelIndex] = row (1-indexed)
    symbolCounts: {},    // symbolCounts[symbol][reelIndex] = count
    config: {},
    reelSets: [],        // array of { name, weight, reelStrips, symbolCounts, wildMultipliers, featureTrigger }
                         // featureTrigger: { enabled, targetSetIndex, awards: [{scatterCount, spins}], globalMultiplier, retrigger }
    activeReelSet: 0     // index of currently active/editing reel set
};

// ============ FILE UPLOAD ============
const uploadSection = document.getElementById('uploadSection');
const fileInput = document.getElementById('fileInput');

if (uploadSection) {
    uploadSection.addEventListener('click', () => fileInput.click());
    uploadSection.addEventListener('dragover', (e) => { e.preventDefault(); });
    uploadSection.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    });
}
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) processFile(e.target.files[0]);
    });
}

// ============ START FROM SCRATCH ============
const startFromScratchEl = document.getElementById('startFromScratchBtn');
if (startFromScratchEl) {
    startFromScratchEl.addEventListener('click', startFromScratch);
}

function startFromScratch() {
    const config = getConfig();

    // Create default paytable with common slot symbols
    gameData.paytable = [
        { symbol: 'J', pays: { 3: 0.1, 4: 0.3, 5: 1 } },
        { symbol: 'Q', pays: { 3: 0.1, 4: 0.3, 5: 1 } },
        { symbol: 'K', pays: { 3: 0.2, 4: 0.5, 5: 2 } },
        { symbol: 'A', pays: { 3: 0.2, 4: 0.5, 5: 2 } },
        { symbol: 'M2', pays: { 3: 0.5, 4: 1, 5: 4 } },
        { symbol: 'M1', pays: { 3: 0.5, 4: 1, 5: 4 } },
        { symbol: 'H3', pays: { 3: 1, 4: 2, 5: 6 } },
        { symbol: 'H2', pays: { 3: 1.5, 4: 3, 5: 8 } },
        { symbol: 'H1', pays: { 3: 3, 4: 5, 5: 10 } },
        { symbol: 'W', pays: { 5: 10 } },
        { symbol: 'S', pays: {} }
    ];

    // Trim paytable pay keys to match numReels
    for (const entry of gameData.paytable) {
        const newPays = {};
        for (let len = 3; len <= config.numReels; len++) {
            if (entry.pays[len] !== undefined) newPays[len] = entry.pays[len];
        }
        entry.pays = newPays;
    }

    // Create empty reel strips with a basic distribution
    gameData.reelStrips = [];
    const symbols = gameData.paytable.map(e => e.symbol);
    const defaultStops = 99; // Default reel length

    for (let r = 0; r < config.numReels; r++) {
        const strip = [];
        // Distribute symbols evenly
        const perSymbol = Math.floor(defaultStops / symbols.length);
        for (const sym of symbols) {
            for (let i = 0; i < perSymbol; i++) {
                strip.push(sym);
            }
        }
        // Distribute remainder across symbols (1 extra each, starting from the end)
        let remainder = defaultStops - strip.length;
        let symIdx = symbols.length - 1;
        while (remainder > 0) {
            strip.push(symbols[symIdx]);
            symIdx--;
            if (symIdx < 0) symIdx = symbols.length - 1;
            remainder--;
        }
        gameData.reelStrips[r] = strip;
    }

    // Create default win lines based on numRows and numReels
    gameData.winLines = generateDefaultWinLines(config.numReels, config.numRows, config.numLines);

    // Calculate symbol counts
    gameData.symbolCounts = {};
    for (let reel = 0; reel < config.numReels; reel++) {
        for (const sym of gameData.reelStrips[reel]) {
            if (!gameData.symbolCounts[sym]) {
                gameData.symbolCounts[sym] = new Array(config.numReels).fill(0);
            }
            gameData.symbolCounts[sym][reel]++;
        }
    }

    // Reset reel sets
    gameData.reelSets = [];
    gameData.activeReelSet = 0;

    currentFileName = '';
    uploadSection.innerHTML = `<p>✅ New PAR created from scratch | ${config.numReels} reels × ${defaultStops} stops | ${gameData.paytable.length} symbols | ${gameData.winLines.length} lines</p>`;

    runEvaluation();
}

function generateDefaultWinLines(numReels, numRows, numLines) {
    const lines = [];

    // Line 1-numRows: straight horizontal lines
    for (let row = 1; row <= numRows && lines.length < numLines; row++) {
        lines.push(new Array(numReels).fill(row));
    }

    // V-shapes and inverted V-shapes
    if (numRows >= 3 && lines.length < numLines) {
        // V: top-mid-bot-mid-top
        const mid = Math.ceil(numRows / 2);
        if (numReels === 5) {
            const patterns = [
                [1, 2, 1, 2, 1], [2, 3, 2, 3, 2], [3, 2, 3, 2, 3],
                [3, numRows, 3, numRows, 3],
                [1, 2, 2, 2, 1], [2, 1, 1, 1, 2],
                [2, 3, 3, 3, 2], [3, 2, 2, 2, 3],
                [3, numRows, numRows, numRows, 3], [numRows, 3, 3, 3, numRows],
                [1, 2, 3, 2, 1], [3, 2, 1, 2, 3],
                [2, 3, numRows, 3, 2], [numRows, 3, 2, numRows, 2],
                [1, 1, 2, 1, 1]
            ];
            for (const p of patterns) {
                if (lines.length >= numLines) break;
                // Validate all rows are within bounds
                if (p.every(r => r >= 1 && r <= numRows)) {
                    lines.push([...p]);
                }
            }
        } else {
            // Generic: generate zig-zag patterns
            for (let row = 1; row <= numRows - 1 && lines.length < numLines; row++) {
                const line = [];
                for (let r = 0; r < numReels; r++) {
                    line.push(r % 2 === 0 ? row : row + 1);
                }
                lines.push(line);
            }
            for (let row = 2; row <= numRows && lines.length < numLines; row++) {
                const line = [];
                for (let r = 0; r < numReels; r++) {
                    line.push(r % 2 === 0 ? row : row - 1);
                }
                lines.push(line);
            }
        }
    }

    // Pad remaining lines with row 1 if we haven't hit numLines
    while (lines.length < numLines) {
        const line = [];
        for (let r = 0; r < numReels; r++) {
            line.push(((lines.length + r) % numRows) + 1);
        }
        lines.push(line);
    }

    return lines.slice(0, numLines);
}

let currentFileName = '';

function processFile(file) {
    currentFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Detect if this is an exported evaluation workbook
        const sheetNames = workbook.SheetNames;
        const hasReelStrips = sheetNames.some(n => n.startsWith('Reel Strips'));
        const hasPaytable = sheetNames.includes('Paytable');
        const hasWinLines = sheetNames.includes('Win Lines');

        if (hasReelStrips && hasPaytable && hasWinLines) {
            parseExportedWorkbook(workbook);
        } else {
            const sheet = workbook.Sheets[sheetNames[0]];
            parseSheet(sheet);
        }
        runEvaluation();
    };
    reader.readAsArrayBuffer(file);
}

// ============ PARSING ============
function parseExportedWorkbook(workbook) {
    const sheetNames = workbook.SheetNames;

    // --- Find all reel strip sheets ---
    const reelStripSheets = sheetNames.filter(n => n.startsWith('Reel Strips'));

    // --- Auto-detect numReels from first reel strip sheet ---
    let detectedReels = parseInt(document.getElementById('numReels').value) || 5;
    if (reelStripSheets.length > 0) {
        const firstRsData = XLSX.utils.sheet_to_json(workbook.Sheets[reelStripSheets[0]], { header: 1 });
        if (firstRsData.length > 1) {
            // Count data columns in first data row (skip stop# column)
            const dataRow = firstRsData[1] || [];
            let cols = 0;
            for (let c = 1; c < dataRow.length; c++) {
                if (dataRow[c] !== undefined && dataRow[c] !== '') cols++;
            }
            if (cols > 0) detectedReels = cols;
        }
    }
    document.getElementById('numReels').value = detectedReels;

    // Detect numLines and numRows from Win Lines sheet
    if (sheetNames.includes('Win Lines')) {
        const wlData = XLSX.utils.sheet_to_json(workbook.Sheets['Win Lines'], { header: 1 });
        if (wlData.length > 1) {
            document.getElementById('numLines').value = wlData.length - 1;
            let maxRow = 1;
            for (let i = 1; i < wlData.length; i++) {
                const row = wlData[i];
                if (!row) continue;
                for (let j = 1; j < row.length; j++) {
                    if (typeof row[j] === 'number' && row[j] > maxRow) maxRow = row[j];
                }
            }
            document.getElementById('numRows').value = maxRow;
        }
    }

    const config = getConfig();

    // --- Parse Paytable sheet ---
    const paySheet = workbook.Sheets['Paytable'];
    const payData = XLSX.utils.sheet_to_json(paySheet, { header: 1 });

    gameData.paytable = [];
    for (let i = 1; i < payData.length; i++) {
        const row = payData[i];
        if (!row || !row[0]) break;
        const symbol = String(row[1] || row[0]).trim();
        const pays = {};
        for (let len = 3; len <= config.numReels; len++) {
            const colIdx = len - 3 + 2;
            const val = row[colIdx];
            if (val !== undefined && val !== 'N/A' && val !== '') {
                const num = parseFloat(val);
                if (!isNaN(num)) pays[len] = num;
            }
        }
        gameData.paytable.push({ symbol, pays });
    }

    // --- Parse Win Lines sheet ---
    const wlSheet = workbook.Sheets['Win Lines'];
    const wlData = XLSX.utils.sheet_to_json(wlSheet, { header: 1 });

    gameData.winLines = [];
    for (let i = 1; i < wlData.length; i++) {
        const row = wlData[i];
        if (!row || row[0] === undefined || row[0] === '') break;
        const line = [];
        for (let r = 0; r < config.numReels; r++) {
            line.push(Number(row[r + 1]) || 1);
        }
        gameData.winLines.push(line);
    }

    // --- Parse all reel strip sheets into reel sets ---
    gameData.reelSets = [];

    for (const rsSheet of reelStripSheets) {
        const reelData = XLSX.utils.sheet_to_json(workbook.Sheets[rsSheet], { header: 1 });

        const strips = [];
        for (let r = 0; r < config.numReels; r++) {
            strips[r] = [];
        }

        for (let i = 1; i < reelData.length; i++) {
            const row = reelData[i];
            if (!row || row[0] === undefined || row[0] === '') break;
            for (let r = 0; r < config.numReels; r++) {
                const sym = row[r + 1];
                if (sym !== undefined && sym !== '') {
                    strips[r].push(String(sym).trim());
                }
            }
        }

        // Determine set name from sheet name
        let setName = 'Base Game';
        const match = rsSheet.match(/Reel Strips \((.+)\)/);
        if (match) {
            setName = match[1];
        }

        // Look for a corresponding wild multiplier sheet
        let wildMultipliers = [];
        const wmSheetName = sheetNames.find(n => n.startsWith('Wild Mult') && n.includes(setName));
        if (wmSheetName) {
            const wmData = XLSX.utils.sheet_to_json(workbook.Sheets[wmSheetName], { header: 1 });
            // Find rows with multiplier/chance data (skip headers)
            for (let i = 0; i < wmData.length; i++) {
                const row = wmData[i];
                if (row && row[0] === 'Multiplier' && row[1] === 'Chance') continue; // header
                if (row && typeof row[0] === 'number' && typeof row[1] === 'number') {
                    wildMultipliers.push({ multiplier: row[0], chance: row[1] });
                }
            }
        }

        // Look for weight in Summary sheet
        let weight = 1;
        const summarySheet = workbook.Sheets['Summary'];
        if (summarySheet) {
            const summaryData = XLSX.utils.sheet_to_json(summarySheet, { header: 1 });
            for (const row of summaryData) {
                if (row && row[0] === setName && typeof row[1] === 'number') {
                    weight = row[1];
                    break;
                }
            }
        }

        // Compute symbol counts
        const symbolCounts = {};
        for (let reel = 0; reel < config.numReels; reel++) {
            for (const sym of strips[reel]) {
                if (!symbolCounts[sym]) {
                    symbolCounts[sym] = new Array(config.numReels).fill(0);
                }
                symbolCounts[sym][reel]++;
            }
        }

        gameData.reelSets.push({
            name: setName,
            weight,
            reelStrips: strips,
            symbolCounts,
            wildMultipliers
        });
    }

    // --- Parse Feature Triggers sheet ---
    if (sheetNames.includes('Feature Triggers')) {
        const ftData = XLSX.utils.sheet_to_json(workbook.Sheets['Feature Triggers'], { header: 1 });
        // Skip header rows (row 0 = title, row 1 = empty, row 2 = column headers)
        for (let i = 3; i < ftData.length; i++) {
            const row = ftData[i];
            if (!row || !row[0]) continue;
            // Skip sub-headers for reel bands
            if (String(row[0]).startsWith('Reel Bands for:') || row[0] === 'Set Index') continue;

            const setName = String(row[0]);
            const enabled = row[1] === true || row[1] === 'TRUE' || row[1] === 1;

            // Find matching reel set
            const matchSet = gameData.reelSets.find(rs => rs.name === setName);
            if (matchSet && enabled) {
                matchSet.featureTrigger = {
                    enabled: true,
                    triggerSymbol: String(row[2] || 'S'),
                    triggerCount: parseInt(row[3]) || 3,
                    numSpins: parseInt(row[4]) || 10,
                    targetSetIndex: parseInt(row[5]) || 0,
                    globalMultiplier: parseFloat(row[6]) || 1,
                    retrigger: true,
                    reelBands: [{ setIndex: parseInt(row[5]) || 0, weight: 1 }],
                    awards: [{
                        scatterCount: parseInt(row[3]) || 3,
                        spins: parseInt(row[4]) || 10,
                        targetSetIndex: parseInt(row[5]) || 0
                    }]
                };

                // Check for reel bands sub-table
                for (let j = i + 1; j < ftData.length; j++) {
                    const subRow = ftData[j];
                    if (!subRow || !subRow[0]) break;
                    if (String(subRow[0]).startsWith('Reel Bands for: ' + setName)) {
                        // Next row is header, then data
                        matchSet.featureTrigger.reelBands = [];
                        for (let k = j + 2; k < ftData.length; k++) {
                            const bandRow = ftData[k];
                            if (!bandRow || bandRow[0] === undefined || bandRow[0] === '') break;
                            if (typeof bandRow[0] === 'number') {
                                matchSet.featureTrigger.reelBands.push({
                                    setIndex: parseInt(bandRow[0]) || 0,
                                    weight: parseFloat(bandRow[2]) || 1
                                });
                            }
                        }
                        break;
                    }
                }
            } else if (matchSet) {
                matchSet.featureTrigger = { enabled: false, targetSetIndex: -1, awards: [], globalMultiplier: 1, retrigger: true };
            }
        }
    }

    // Set active to first set
    gameData.activeReelSet = 0;
    if (gameData.reelSets.length > 0) {
        gameData.reelStrips = gameData.reelSets[0].reelStrips.map(r => [...r]);
        gameData.symbolCounts = JSON.parse(JSON.stringify(gameData.reelSets[0].symbolCounts));
    } else {
        // Fallback: shouldn't happen but just in case
        gameData.reelStrips = [];
        for (let r = 0; r < config.numReels; r++) {
            gameData.reelStrips[r] = [];
        }
        gameData.symbolCounts = {};
    }

    const stopsInfo = gameData.reelStrips[0] ? gameData.reelStrips[0].length : 0;
    uploadSection.innerHTML = `<p>✅ Loaded: ${currentFileName || 'PAR Sheet'} | ${gameData.reelSets.length} reel set(s) | ${stopsInfo} stops (set 1) | ${gameData.paytable.length} symbols | ${gameData.winLines.length} lines</p>`;
}

function parseSheet(sheet) {
    const config = getConfig();
    const range = XLSX.utils.decode_range(sheet['!ref']);

    // Reset reel sets so initializeReelSets creates a fresh one
    gameData.reelSets = [];
    gameData.activeReelSet = 0;

    // Parse reel strips (columns B-F, starting row 2 based on the PAR format)
    // The reel data starts at column B (index 1) and rows start at index 1 (row 2 in Excel)
    gameData.reelStrips = [];

    for (let r = 0; r < config.numReels; r++) {
        gameData.reelStrips[r] = [];
    }

    // Find reel strip data - look for "Stops" header or start from known position
    let reelStartRow = -1;
    let reelStartCol = -1;

    for (let row = 0; row <= Math.min(range.e.r, 5); row++) {
        for (let col = 0; col <= Math.min(range.e.c, 10); col++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (cell && String(cell.v).toLowerCase() === 'stops') {
                reelStartRow = row + 1;
                reelStartCol = col + 1;
                break;
            }
        }
        if (reelStartRow >= 0) break;
    }

    if (reelStartRow < 0) {
        // Fallback: assume column B (index 1) starts at row 1
        reelStartRow = 1;
        reelStartCol = 1;
    }

    // Read reel strips
    let stopIndex = 0;
    for (let row = reelStartRow; row <= range.e.r; row++) {
        // Check if row has a stop number in col before reelStartCol
        const stopCell = sheet[XLSX.utils.encode_cell({ r: row, c: reelStartCol - 1 })];
        if (!stopCell || isNaN(Number(stopCell.v))) continue;

        for (let reel = 0; reel < config.numReels; reel++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: reelStartCol + reel })];
            if (cell) {
                gameData.reelStrips[reel].push(String(cell.v).trim());
            }
        }
        stopIndex++;
    }

    // Parse paytable - look for columns with 3x, 4x, 5x headers
    gameData.paytable = [];
    let payStartRow = -1;
    let payStartCol = -1;

    for (let row = 0; row <= Math.min(range.e.r, 5); row++) {
        for (let col = 0; col <= range.e.c; col++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (cell && String(cell.v).match(/^3x$/i)) {
                payStartRow = row + 1;
                payStartCol = col;
                break;
            }
        }
        if (payStartRow >= 0) break;
    }

    if (payStartRow >= 0) {
        // Find SymbolID column (should be 2 cols before 3x)
        let symbolCol = payStartCol - 1;
        // Check for SymbolID header
        for (let col = payStartCol - 3; col < payStartCol; col++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: payStartRow - 1, c: col })];
            if (cell && String(cell.v).toLowerCase().includes('symbolid')) {
                symbolCol = col;
                break;
            }
        }

        for (let row = payStartRow; row <= range.e.r; row++) {
            const symCell = sheet[XLSX.utils.encode_cell({ r: row, c: symbolCol })];
            if (!symCell || !symCell.v) break;

            const symbol = String(symCell.v).trim();
            const pays = {};

            for (let i = 0; i < config.numReels - 2; i++) {
                const payCell = sheet[XLSX.utils.encode_cell({ r: row, c: payStartCol + i })];
                if (payCell) {
                    const val = payCell.v;
                    if (typeof val === 'number') {
                        pays[i + 3] = val;
                    } else if (String(val).toLowerCase() !== 'n/a') {
                        const num = parseFloat(val);
                        if (!isNaN(num)) pays[i + 3] = num;
                    }
                }
            }

            gameData.paytable.push({ symbol, pays });
        }
    }

    // Parse win lines - look for "Line #" header
    gameData.winLines = [];
    let lineStartRow = -1;
    let lineStartCol = -1;

    for (let row = 0; row <= range.e.r; row++) {
        for (let col = 0; col <= range.e.c; col++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (cell && String(cell.v).toLowerCase().includes('line')) {
                // Verify next row has numbers
                const checkCell = sheet[XLSX.utils.encode_cell({ r: row + 1, c: col })];
                if (checkCell && Number(checkCell.v) === 1) {
                    lineStartRow = row + 1;
                    lineStartCol = col + 1;
                    break;
                }
            }
        }
        if (lineStartRow >= 0) break;
    }

    if (lineStartRow >= 0) {
        for (let row = lineStartRow; row <= range.e.r; row++) {
            const lineNumCell = sheet[XLSX.utils.encode_cell({ r: row, c: lineStartCol - 1 })];
            if (!lineNumCell || isNaN(Number(lineNumCell.v))) break;

            const line = [];
            for (let reel = 0; reel < config.numReels; reel++) {
                const cell = sheet[XLSX.utils.encode_cell({ r: row, c: lineStartCol + reel })];
                line.push(cell ? Number(cell.v) : 1);
            }
            gameData.winLines.push(line);
        }
    }

    // Parse symbol counts if available - look for a grid with symbol names as row headers and Reel 1-5 as columns
    gameData.symbolCounts = {};

    // Try to find the symbol count table by looking for "Reel 1" headers that appear after the reel strips
    let countStartRow = -1;
    let countStartCol = -1;

    for (let row = 0; row <= range.e.r; row++) {
        for (let col = 6; col <= range.e.c; col++) { // Start from col 6 to skip reel strip section
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (cell && String(cell.v).toLowerCase() === 'reel 1') {
                // Check if row below has a symbol ID
                const belowCell = sheet[XLSX.utils.encode_cell({ r: row + 1, c: col - 1 })];
                if (belowCell && typeof belowCell.v === 'string' && belowCell.v.length <= 3) {
                    countStartRow = row + 1;
                    countStartCol = col;
                    break;
                }
            }
        }
        if (countStartRow >= 0) break;
    }

    if (countStartRow >= 0) {
        for (let row = countStartRow; row <= range.e.r; row++) {
            const symCell = sheet[XLSX.utils.encode_cell({ r: row, c: countStartCol - 1 })];
            if (!symCell || !symCell.v) break;

            const symbol = String(symCell.v).trim();
            gameData.symbolCounts[symbol] = [];

            for (let reel = 0; reel < config.numReels; reel++) {
                const cell = sheet[XLSX.utils.encode_cell({ r: row, c: countStartCol + reel })];
                gameData.symbolCounts[symbol].push(cell ? Number(cell.v) : 0);
            }
        }
    } else {
        // Calculate counts from reel strips
        for (let reel = 0; reel < config.numReels; reel++) {
            for (const sym of gameData.reelStrips[reel]) {
                if (!gameData.symbolCounts[sym]) {
                    gameData.symbolCounts[sym] = new Array(config.numReels).fill(0);
                }
                gameData.symbolCounts[sym][reel]++;
            }
        }
    }

    uploadSection.innerHTML = `<p>✅ Loaded: ${currentFileName || 'PAR Sheet'} | ${gameData.reelStrips[0].length} stops per reel | ${gameData.paytable.length} symbols | ${gameData.winLines.length} lines</p>`;
}

function getConfig() {
    return {
        numReels: parseInt(document.getElementById('numReels').value),
        numRows: parseInt(document.getElementById('numRows').value),
        numLines: parseInt(document.getElementById('numLines').value),
        wildSymbol: document.getElementById('wildSymbol').value.trim(),
        scatterSymbol: document.getElementById('scatterSymbol').value.trim()
    };
}

// ============ EVALUATION ENGINE ============
function runEvaluation() {
    const config = getConfig();
    gameData.config = config;

    // Ensure reel sets are initialized
    if (gameData.reelSets.length === 0) {
        initializeReelSets();
    } else {
        // Sync active reel set with current reelStrips
        syncActiveReelSet();
    }

    // Calculate weighted results across all reel sets
    const totalWeight = gameData.reelSets.reduce((sum, rs) => sum + rs.weight, 0);

    if (totalWeight === 0) {
        document.getElementById('resultsArea').style.display = 'block';
        return;
    }

    let weightedTotalPayout = 0;
    let weightedTotalHits = 0;
    let weightedTotalCombinations = 0;
    let allSymbolResults = [];
    let primaryScatterResults = null;
    let primaryTotalCombinations = 0;

    // Per-set results for display
    const perSetResults = [];

    for (let setIdx = 0; setIdx < gameData.reelSets.length; setIdx++) {
        const reelSet = gameData.reelSets[setIdx];
        if (reelSet.weight <= 0) continue;
        if (!reelSet.reelStrips || reelSet.reelStrips.length === 0) continue;
        if (reelSet.reelStrips[0].length === 0) continue;

        const reelLengths = reelSet.reelStrips.map(r => r.length);
        const totalCombinations = reelLengths.reduce((a, b) => a * b, 1);
        const weightFraction = reelSet.weight / totalWeight;

        // Temporarily swap reelStrips for calculations
        const savedStrips = gameData.reelStrips;
        gameData.reelStrips = reelSet.reelStrips;

        const results = calculateLineWins(config, reelLengths, totalCombinations, reelSet.wildMultipliers, reelSet.expandingWilds);
        const scatterResults = calculateScatterWins(config, reelLengths, totalCombinations);

        gameData.reelStrips = savedStrips;

        weightedTotalPayout += (results.totalPayout / totalCombinations) * weightFraction;
        const hitRatePerLine = results.totalHits / (totalCombinations * config.numLines);
        const approxAnyWinRate = 1 - Math.pow(1 - hitRatePerLine, config.numLines);
        weightedTotalHits += approxAnyWinRate * weightFraction;

        perSetResults.push({
            name: reelSet.name,
            weight: reelSet.weight,
            weightFraction,
            totalCombinations,
            results,
            scatterResults,
            rtp: (results.totalPayout / totalCombinations) * 100
        });

        // Use active set for detailed display
        if (setIdx === gameData.activeReelSet) {
            allSymbolResults = results.symbolResults;
            primaryScatterResults = scatterResults;
            primaryTotalCombinations = totalCombinations;
        }
    }

    // Calculate free games RTP contribution
    const freeGamesRtp = calculateFreeGamesRtp(config, perSetResults);

    // Display results using active set detail but weighted totals
    const weightedRtp = (weightedTotalPayout * 100) + freeGamesRtp.totalContribution;
    const weightedHitFreq = weightedTotalHits;

    displayResultsWeighted(weightedRtp, weightedHitFreq, allSymbolResults, primaryScatterResults,
        primaryTotalCombinations, config, perSetResults, freeGamesRtp);

    document.getElementById('resultsArea').style.display = 'block';
}

function initializeReelSets() {
    // Create initial reel set from loaded data
    if (gameData.reelStrips.length > 0 && gameData.reelStrips[0].length > 0) {
        gameData.reelSets = [{
            name: 'Base Game',
            weight: 1,
            reelStrips: gameData.reelStrips.map(r => [...r]),
            symbolCounts: JSON.parse(JSON.stringify(gameData.symbolCounts)),
            wildMultipliers: [],
            featureTrigger: { enabled: false, targetSetIndex: -1, awards: [], globalMultiplier: 1, retrigger: true }
        }];
        gameData.activeReelSet = 0;
    }
}

function syncActiveReelSet() {
    if (gameData.reelSets.length > 0 && gameData.activeReelSet < gameData.reelSets.length) {
        gameData.reelSets[gameData.activeReelSet].reelStrips = gameData.reelStrips.map(r => [...r]);
        gameData.reelSets[gameData.activeReelSet].symbolCounts = JSON.parse(JSON.stringify(gameData.symbolCounts));
    }
}

function switchToReelSet(index) {
    // Save current to active set
    syncActiveReelSet();
    // Switch
    gameData.activeReelSet = index;
    const set = gameData.reelSets[index];
    gameData.reelStrips = set.reelStrips.map(r => [...r]);
    gameData.symbolCounts = JSON.parse(JSON.stringify(set.symbolCounts || {}));
    // Recalculate symbol counts if empty
    if (Object.keys(gameData.symbolCounts).length === 0) {
        const config = getConfig();
        for (let reel = 0; reel < config.numReels; reel++) {
            for (const sym of gameData.reelStrips[reel]) {
                if (!gameData.symbolCounts[sym]) {
                    gameData.symbolCounts[sym] = new Array(config.numReels).fill(0);
                }
                gameData.symbolCounts[sym][reel]++;
            }
        }
    }
}

function calculateFreeGamesRtp(config, perSetResults) {
    // Calculates free games RTP contribution with full chain support.
    // A chain: Base Game triggers FG Level 1, which can trigger FG Level 2, etc.
    // Only reel sets with weight > 0 are entry points (paid spins).
    // Sets with weight 0 only contribute when triggered by another set's feature trigger.

    const totalWeight = gameData.reelSets.reduce((sum, rs) => sum + rs.weight, 0);
    let totalContribution = 0;
    const details = [];

    // Only process entry points (sets with weight > 0 that have feature triggers)
    for (let setIdx = 0; setIdx < gameData.reelSets.length; setIdx++) {
        const reelSet = gameData.reelSets[setIdx];
        if (reelSet.weight <= 0) continue;
        const ft = reelSet.featureTrigger;
        if (!ft || !ft.enabled) continue;
        if (!ft.awards || ft.awards.length === 0) continue;
        if (!reelSet.reelStrips || reelSet.reelStrips.length === 0 || reelSet.reelStrips[0].length === 0) continue;

        const weightFraction = totalWeight > 0 ? reelSet.weight / totalWeight : 0;

        // Calculate scatter probabilities on the entry set
        const triggerReelLengths = reelSet.reelStrips.map(r => r.length);
        const triggerTotalCombos = triggerReelLengths.reduce((a, b) => a * b, 1);

        const savedStrips = gameData.reelStrips;
        gameData.reelStrips = reelSet.reelStrips;
        const scatterRes = calculateScatterWins(config, triggerReelLengths, triggerTotalCombos);
        gameData.reelStrips = savedStrips;

        if (!scatterRes) continue;

        let setContribution = 0;
        const awardDetails = [];

        for (const award of ft.awards) {
            const sr = scatterRes.scatterResults.find(s => s.count === award.scatterCount);
            if (!sr) continue;

            const triggerProb = sr.probability;
            const targetIdx = award.targetSetIndex !== undefined ? award.targetSetIndex : ft.targetSetIndex;
            if (targetIdx < 0 || targetIdx >= gameData.reelSets.length) continue;

            // Calculate the full chain RTP starting from this target set
            const chainResult = calculateChainRtp(config, targetIdx, award.spins, ft.globalMultiplier, [setIdx], 10);

            const contribution = triggerProb * chainResult.totalRtpPerTrigger * weightFraction * 100;
            setContribution += contribution;

            awardDetails.push({
                scatterCount: award.scatterCount,
                spins: award.spins,
                effectiveSpins: chainResult.effectiveSpins,
                triggerProb,
                targetSetName: gameData.reelSets[targetIdx].name,
                fgPerSpinRtp: chainResult.perSpinRtp * 100,
                retriggerExpectedSpins: chainResult.retriggerExpectedSpins,
                contribution,
                chainDepth: chainResult.chainDepth,
                chainDetail: chainResult.chainDetail
            });
        }

        totalContribution += setContribution;
        details.push({
            triggerSet: reelSet.name,
            globalMultiplier: ft.globalMultiplier,
            contribution: setContribution,
            awardDetails,
            scatterResults: scatterRes
        });
    }

    return { totalContribution, details };
}

function calculateChainRtp(config, targetSetIdx, baseSpins, globalMultiplier, visited, maxDepth) {
    // Recursively calculates the total RTP value of triggering `baseSpins` on `targetSetIdx`,
    // including any chained triggers from that set to further sets.
    //
    // Returns: { totalRtpPerTrigger, perSpinRtp, effectiveSpins, retriggerExpectedSpins, chainDepth, chainDetail }

    if (maxDepth <= 0) {
        return { totalRtpPerTrigger: 0, perSpinRtp: 0, effectiveSpins: baseSpins, retriggerExpectedSpins: 0, chainDepth: 0, chainDetail: [] };
    }

    const targetSet = gameData.reelSets[targetSetIdx];
    if (!targetSet || !targetSet.reelStrips || targetSet.reelStrips.length === 0 || targetSet.reelStrips[0].length === 0) {
        return { totalRtpPerTrigger: 0, perSpinRtp: 0, effectiveSpins: baseSpins, retriggerExpectedSpins: 0, chainDepth: 0, chainDetail: [] };
    }

    const targetReelLengths = targetSet.reelStrips.map(r => r.length);
    const targetTotalCombos = targetReelLengths.reduce((a, b) => a * b, 1);

    // Calculate per-spin line win RTP of target set
    const savedStrips = gameData.reelStrips;
    gameData.reelStrips = targetSet.reelStrips;
    const targetResults = calculateLineWins(config, targetReelLengths, targetTotalCombos, targetSet.wildMultipliers, targetSet.expandingWilds);
    gameData.reelStrips = savedStrips;

    const perSpinRtp = targetResults.totalPayout / targetTotalCombos; // fraction

    // Check if target set has its own feature trigger (for chaining)
    const targetFt = targetSet.featureTrigger;
    let retriggerExpectedSpins = 0;
    let chainedRtpPerSpin = 0; // additional RTP per spin from chained triggers
    let chainDepth = 1;
    const chainDetail = [{ setName: targetSet.name, spins: baseSpins, perSpinRtp: perSpinRtp * 100 }];

    if (targetFt && targetFt.enabled && targetFt.awards && targetFt.awards.length > 0) {
        // Calculate scatter probabilities on the target set
        const savedStrips2 = gameData.reelStrips;
        gameData.reelStrips = targetSet.reelStrips;
        const targetScatter = calculateScatterWins(config, targetReelLengths, targetTotalCombos);
        gameData.reelStrips = savedStrips2;

        if (targetScatter) {
            for (const award of targetFt.awards) {
                const sr = targetScatter.scatterResults.find(s => s.count === award.scatterCount);
                if (!sr) continue;

                const awardTargetIdx = award.targetSetIndex !== undefined ? award.targetSetIndex : targetFt.targetSetIndex;
                if (awardTargetIdx < 0 || awardTargetIdx >= gameData.reelSets.length) continue;

                // Check if this chains to the same set (retrigger) or a different set (chain forward)
                if (awardTargetIdx === targetSetIdx) {
                    // Same-set retrigger: geometric series
                    retriggerExpectedSpins += sr.probability * award.spins;
                } else {
                    // Chain forward to a different set — recurse
                    // Prevent infinite loops
                    if (visited.includes(awardTargetIdx)) continue;

                    const chainResult = calculateChainRtp(
                        config, awardTargetIdx, award.spins,
                        targetFt.globalMultiplier || 1,
                        [...visited, targetSetIdx], maxDepth - 1
                    );

                    // The probability of this chain firing per spin on the current target
                    chainedRtpPerSpin += sr.probability * chainResult.totalRtpPerTrigger;
                    chainDepth = Math.max(chainDepth, 1 + chainResult.chainDepth);

                    if (chainResult.chainDetail.length > 0) {
                        chainDetail.push(...chainResult.chainDetail.map(d => ({
                            ...d,
                            triggerProb: sr.probability,
                            fromSet: targetSet.name
                        })));
                    }
                }
            }
        }
    }

    // Effective spins accounting for same-set retriggers
    let effectiveSpins = baseSpins;
    if (retriggerExpectedSpins > 0 && retriggerExpectedSpins < 1) {
        effectiveSpins = baseSpins / (1 - retriggerExpectedSpins);
    } else if (retriggerExpectedSpins >= 1) {
        effectiveSpins = baseSpins * 100; // cap
    }

    // Total RTP per trigger:
    // = effectiveSpins × (perSpinRtp × globalMultiplier + chainedRtpPerSpin)
    // The chainedRtpPerSpin is the expected RTP contributed by chains firing from each spin
    const totalRtpPerTrigger = effectiveSpins * (perSpinRtp * globalMultiplier + chainedRtpPerSpin);

    return { totalRtpPerTrigger, perSpinRtp, effectiveSpins, retriggerExpectedSpins, chainDepth, chainDetail };
}

function calculateLevelProgression(config) {
    // Walk the chain from each entry point (weight > 0) and calculate the probability
    // of reaching each successive level.
    //
    // P(reach Level 1) = 100% (given free games triggered)
    // P(reach Level 2) = P(at least one scatter trigger during Level 1's effective spins)
    //                   = 1 - (1 - P_scatter_per_spin_on_level1)^effective_spins_level1
    // P(reach Level 3) = P(reach Level 2) × P(at least one trigger during Level 2)
    // etc.

    const progressionData = [];

    for (let setIdx = 0; setIdx < gameData.reelSets.length; setIdx++) {
        const reelSet = gameData.reelSets[setIdx];
        if (reelSet.weight <= 0) continue;
        const ft = reelSet.featureTrigger;
        if (!ft || !ft.enabled || !ft.awards || ft.awards.length === 0) continue;

        // Walk the chain forward from the first award
        // Use the first/primary award tier to trace the main progression
        let currentSetIdx = -1;
        let currentSpins = 0;
        let cumulativeReachProb = 1.0; // 100% chance of being at Level 1 once triggered
        let levelNum = 0;
        const visited = new Set([setIdx]);

        // Find the primary trigger (typically 3 scatters — use first award)
        for (const award of ft.awards) {
            const targetIdx = award.targetSetIndex !== undefined ? award.targetSetIndex : (ft.targetSetIndex >= 0 ? ft.targetSetIndex : 0);
            if (targetIdx < 0 || targetIdx >= gameData.reelSets.length) continue;

            currentSetIdx = targetIdx;
            currentSpins = award.spins;
            break;
        }

        if (currentSetIdx < 0) continue;

        // Walk the chain
        while (currentSetIdx >= 0 && currentSetIdx < gameData.reelSets.length) {
            const currentSet = gameData.reelSets[currentSetIdx];
            if (!currentSet.reelStrips || currentSet.reelStrips.length === 0 || currentSet.reelStrips[0].length === 0) break;

            levelNum++;

            // Calculate effective spins (accounting for same-set retriggers)
            const currentFt = currentSet.featureTrigger;
            const currentReelLengths = currentSet.reelStrips.map(r => r.length);
            const currentTotalCombos = currentReelLengths.reduce((a, b) => a * b, 1);

            // Get scatter probability per spin on this set (for any trigger)
            const savedStrips = gameData.reelStrips;
            gameData.reelStrips = currentSet.reelStrips;
            const scatterRes = calculateScatterWins(config, currentReelLengths, currentTotalCombos);
            gameData.reelStrips = savedStrips;

            // P(scatter trigger per spin) = sum of P(n scatters) for all award-relevant counts
            let pTriggerPerSpin = 0;
            let nextSetIdx = -1;
            let nextSpins = 0;

            if (currentFt && currentFt.enabled && currentFt.awards && currentFt.awards.length > 0 && scatterRes) {
                for (const award of currentFt.awards) {
                    const sr = scatterRes.scatterResults.find(s => s.count === award.scatterCount);
                    if (sr) {
                        pTriggerPerSpin += sr.probability;
                        // Track where the chain goes next (use first forward-chain award)
                        const awardTarget = award.targetSetIndex !== undefined ? award.targetSetIndex : currentFt.targetSetIndex;
                        if (awardTarget !== currentSetIdx && nextSetIdx < 0) {
                            nextSetIdx = awardTarget;
                            nextSpins = award.spins;
                        }
                    }
                }
            }

            // Calculate same-set retrigger expected spins
            let retriggerExpSpins = 0;
            if (currentFt && currentFt.enabled && currentFt.retrigger && scatterRes) {
                for (const award of currentFt.awards) {
                    const awardTarget = award.targetSetIndex !== undefined ? award.targetSetIndex : currentFt.targetSetIndex;
                    if (awardTarget === currentSetIdx) {
                        const sr = scatterRes.scatterResults.find(s => s.count === award.scatterCount);
                        if (sr) retriggerExpSpins += sr.probability * award.spins;
                    }
                }
            }

            let effectiveSpins = currentSpins;
            if (retriggerExpSpins > 0 && retriggerExpSpins < 1) {
                effectiveSpins = currentSpins / (1 - retriggerExpSpins);
            }

            // P(advance to next level) = 1 - (1 - pTriggerPerSpin)^effectiveSpins
            // But only for triggers that go to a DIFFERENT set (forward chain)
            let pForwardPerSpin = 0;
            if (currentFt && currentFt.enabled && currentFt.awards && scatterRes) {
                for (const award of currentFt.awards) {
                    const awardTarget = award.targetSetIndex !== undefined ? award.targetSetIndex : currentFt.targetSetIndex;
                    if (awardTarget !== currentSetIdx) {
                        const sr = scatterRes.scatterResults.find(s => s.count === award.scatterCount);
                        if (sr) pForwardPerSpin += sr.probability;
                    }
                }
            }

            const pAdvance = pForwardPerSpin > 0 ? 1 - Math.pow(1 - pForwardPerSpin, effectiveSpins) : 0;

            progressionData.push({
                levelName: `Level ${levelNum}`,
                setName: currentSet.name,
                spins: currentSpins,
                effectiveSpins,
                reachProbability: cumulativeReachProb,
                advanceProbability: nextSetIdx >= 0 ? pAdvance : null
            });

            // Move to next level
            if (nextSetIdx < 0 || visited.has(nextSetIdx)) break;
            visited.add(nextSetIdx);
            cumulativeReachProb *= pAdvance;
            currentSetIdx = nextSetIdx;
            currentSpins = nextSpins;

            if (levelNum > 10) break; // safety cap
        }
    }

    return progressionData;
}

function calculateLineWins(config, reelLengths, totalCombinations, wildMultipliers, expandingWilds) {
    const wildSymbol = config.wildSymbol;
    const scatterSymbol = config.scatterSymbol;

    // Check if expanding wilds is active for this reel set
    const hasExpandingWilds = !!expandingWilds;

    // Calculate expected wild multiplier
    let expectedWildMultiplier = 1;
    if (wildMultipliers && wildMultipliers.length > 0) {
        expectedWildMultiplier = wildMultipliers.reduce((sum, wm) => sum + (wm.multiplier * wm.chance), 0);
    }

    // For each symbol in the paytable, calculate wins on each line
    const symbolResults = [];
    let totalPayout = 0;
    let totalHits = 0;

    for (const entry of gameData.paytable) {
        const sym = entry.symbol;
        if (sym === scatterSymbol) continue; // Scatter is handled separately

        const symResult = {
            symbol: sym,
            pays: entry.pays,
            combosPerLength: {},
            payoutPerLength: {},
            totalPayout: 0,
            totalHits: 0
        };

        // For each possible win length (3, 4, 5 for a 5-reel game)
        for (let len = 3; len <= config.numReels; len++) {
            if (!entry.pays[len] && entry.pays[len] !== 0) continue;
            const pay = entry.pays[len];
            if (pay <= 0) continue;

            // Count combinations that give exactly this length match on any line
            let totalLineCombos = 0;
            let totalLineComboWithWild = 0;
            let totalLineComboNoWild = 0;

            for (const line of gameData.winLines) {
                const result = countLineCombosForSymbolWithWildSplit(sym, len, line, config, reelLengths, wildSymbol, scatterSymbol, hasExpandingWilds);
                totalLineCombos += result.total;
                totalLineComboWithWild += result.withWild;
                totalLineComboNoWild += result.noWild;
            }

            // Apply wild multiplier: wins involving wild get multiplied
            const payout = (totalLineComboNoWild * pay) + (totalLineComboWithWild * pay * expectedWildMultiplier);

            symResult.combosPerLength[len] = totalLineCombos;
            symResult.payoutPerLength[len] = payout;
            symResult.totalPayout += payout;
            symResult.totalHits += totalLineCombos;
        }

        totalPayout += symResult.totalPayout;
        totalHits += symResult.totalHits;
        symbolResults.push(symResult);
    }

    return { symbolResults, totalPayout, totalHits, totalCombinations };
}

function countLineCombosForSymbolWithWildSplit(symbol, length, line, config, reelLengths, wildSymbol, scatterSymbol, expandingWilds) {
    // Returns { total, withWild, noWild } - splitting combos by whether they involve wilds
    const isWildSymbol = (symbol === wildSymbol);

    // Check for expanding wilds (passed from caller)
    const hasExpandingWilds = !!expandingWilds;

    const matchCounts = [];
    const nonMatchCounts = [];
    const pureSymbolCounts = []; // Only the target symbol (no wild)
    const pureWildCounts = [];

    for (let reel = 0; reel < config.numReels; reel++) {
        const row = line[reel];
        const reelLength = reelLengths[reel];
        const reelStrip = gameData.reelStrips[reel];

        let matches = 0;
        let wilds = 0;
        let pureSymbol = 0;

        if (hasExpandingWilds) {
            // With expanding wilds: a stop counts as wild if ANY row in window has wild
            for (let stop = 0; stop < reelLength; stop++) {
                let hasWildInWindow = false;
                for (let r = 0; r < config.numRows; r++) {
                    const idx = (stop + r) % reelLength;
                    if (reelStrip[idx] === wildSymbol) {
                        hasWildInWindow = true;
                        break;
                    }
                }
                const visibleSymbol = getSymbolAtPosition(reel, stop, row, config);

                if (hasWildInWindow) {
                    wilds++;
                    if (!isWildSymbol) matches++;
                } else if (visibleSymbol === symbol) {
                    matches++;
                    pureSymbol++;
                } else if (visibleSymbol === wildSymbol) {
                    // Shouldn't happen if expanding wilds catches all, but safety
                    wilds++;
                    if (!isWildSymbol) matches++;
                }
            }
        } else {
            // Standard: only the specific row position matters
            for (let stop = 0; stop < reelLength; stop++) {
                const visibleSymbol = getSymbolAtPosition(reel, stop, row, config);
                if (visibleSymbol === wildSymbol) {
                    wilds++;
                    if (!isWildSymbol) matches++;
                } else if (visibleSymbol === symbol) {
                    matches++;
                    pureSymbol++;
                }
            }
        }

        if (isWildSymbol) {
            matchCounts.push(wilds);
            pureSymbolCounts.push(wilds);
        } else {
            matchCounts.push(matches);
            pureSymbolCounts.push(pureSymbol);
        }
        nonMatchCounts.push(reelLength - matchCounts[matchCounts.length - 1]);
        pureWildCounts.push(wilds);
    }

    // Total combos for exactly `length` consecutive matches
    let totalCombos = 1;
    for (let r = 0; r < length; r++) {
        totalCombos *= matchCounts[r];
    }
    if (length < config.numReels) {
        totalCombos *= nonMatchCounts[length];
        for (let r = length + 1; r < config.numReels; r++) {
            totalCombos *= reelLengths[r];
        }
    }

    if (isWildSymbol) {
        // All wild wins inherently involve wilds, but the multiplier applies to
        // non-wild symbols that include wilds. Pure wild wins don't get extra multiplier.
        return { total: totalCombos, withWild: 0, noWild: totalCombos };
    }

    // Calculate combos with NO wild in the matching portion (pure symbol only)
    let noWildCombos = 1;
    for (let r = 0; r < length; r++) {
        noWildCombos *= pureSymbolCounts[r];
    }
    if (length < config.numReels) {
        noWildCombos *= nonMatchCounts[length];
        for (let r = length + 1; r < config.numReels; r++) {
            noWildCombos *= reelLengths[r];
        }
    }

    const withWildCombos = totalCombos - noWildCombos;

    return { total: totalCombos, withWild: withWildCombos, noWild: noWildCombos };
}

// Backwards-compatible wrapper for line detail display
function countLineCombosForSymbol(symbol, length, line, config, reelLengths, wildSymbol, scatterSymbol) {
    const activeSet = gameData.reelSets[gameData.activeReelSet];
    const expanding = activeSet && activeSet.expandingWilds;
    const result = countLineCombosForSymbolWithWildSplit(symbol, length, line, config, reelLengths, wildSymbol, scatterSymbol, expanding);
    return result.total;
}

function getSymbolAtPosition(reelIndex, stopIndex, row, config) {
    // Given a reel stop and a row (1-indexed), return the symbol visible
    // Row 1 = top of visible window, row numRows = bottom
    // The stop index represents the top of the window
    const reelStrip = gameData.reelStrips[reelIndex];
    const reelLength = reelStrip.length;
    const symbolIndex = (stopIndex + row - 1) % reelLength;
    return reelStrip[symbolIndex];
}

function calculateScatterWins(config, reelLengths, totalCombinations) {
    const scatterSymbol = config.scatterSymbol;

    // Find scatter in paytable
    const scatterEntry = gameData.paytable.find(e => e.symbol === scatterSymbol);
    if (!scatterEntry) return null;

    // For scatter: count how many stops on each reel show the scatter symbol
    // anywhere in the visible window
    const scatterCountsPerReel = [];

    for (let reel = 0; reel < config.numReels; reel++) {
        const reelLength = reelLengths[reel];
        let scatterStops = 0;

        for (let stop = 0; stop < reelLength; stop++) {
            // Check if scatter appears anywhere in the visible window for this stop
            let found = false;
            for (let row = 1; row <= config.numRows; row++) {
                if (getSymbolAtPosition(reel, stop, row, config) === scatterSymbol) {
                    found = true;
                    break;
                }
            }
            if (found) scatterStops++;
        }

        scatterCountsPerReel.push(scatterStops);
    }

    // Calculate probability of getting 3, 4, 5 scatters
    const scatterResults = [];

    for (let count = 3; count <= config.numReels; count++) {
        // Choose which reels have the scatter
        const reelCombinations = getCombinations(config.numReels, count);
        let totalCombos = 0;

        for (const reelSet of reelCombinations) {
            let combos = 1;
            for (let reel = 0; reel < config.numReels; reel++) {
                if (reelSet.includes(reel)) {
                    combos *= scatterCountsPerReel[reel];
                } else {
                    combos *= (reelLengths[reel] - scatterCountsPerReel[reel]);
                }
            }
            totalCombos += combos;
        }

        scatterResults.push({
            count,
            combinations: totalCombos,
            probability: totalCombos / totalCombinations,
            payInfo: scatterEntry.pays[count] || 'N/A'
        });
    }

    return { scatterCountsPerReel, scatterResults, scatterEntry };
}

function getCombinations(n, k) {
    const results = [];
    const combo = [];

    function backtrack(start) {
        if (combo.length === k) {
            results.push([...combo]);
            return;
        }
        for (let i = start; i < n; i++) {
            combo.push(i);
            backtrack(i + 1);
            combo.pop();
        }
    }

    backtrack(0);
    return results;
}

// ============ DISPLAY ============
function displayResultsWeighted(rtp, hitFreq, symbolResults, scatterResults, totalCombinations, config, perSetResults, freeGamesRtp) {
    const rtpEl = document.getElementById('rtpValue');
    rtpEl.textContent = rtp.toFixed(4) + '%';
    rtpEl.className = 'value ' + (rtp >= 94 ? 'good' : rtp >= 90 ? 'warning' : 'bad');

    // Show base/FG split if free games are contributing
    const rtpCard = rtpEl.parentElement;
    let existingSplit = rtpCard.querySelector('.rtp-split');
    if (existingSplit) existingSplit.remove();
    if (freeGamesRtp && freeGamesRtp.totalContribution > 0) {
        const baseRtp = rtp - freeGamesRtp.totalContribution;
        const splitEl = document.createElement('div');
        splitEl.className = 'rtp-split';
        splitEl.style.cssText = 'font-size: 0.75em; color: #aaa; margin-top: 6px;';
        splitEl.innerHTML = `Base: ${baseRtp.toFixed(4)}% | Free Games: ${freeGamesRtp.totalContribution.toFixed(4)}%`;
        rtpCard.appendChild(splitEl);
    }

    const hitEl = document.getElementById('hitFreqValue');
    const hitOneInX = hitFreq > 0 ? (1 / hitFreq).toFixed(2) : '∞';
    hitEl.textContent = '1 in ' + hitOneInX;
    hitEl.className = 'value';

    document.getElementById('totalCombos').textContent = totalCombinations.toLocaleString();

    // Show weighted note if multiple sets
    const activeSetPayout = symbolResults.reduce((sum, s) => sum + s.totalPayout, 0);
    document.getElementById('totalPayout').textContent = activeSetPayout.toLocaleString(undefined, { maximumFractionDigits: 2 });

    // Feature hit rate - probability of triggering the scatter feature per spin
    const featureHitEl = document.getElementById('featureHitRate');
    if (featureHitEl) {
        if (scatterResults && scatterResults.scatterResults) {
            // Find the trigger count from active set's feature trigger
            const activeFt = gameData.reelSets[gameData.activeReelSet] ? gameData.reelSets[gameData.activeReelSet].featureTrigger : null;
            const triggerCount = (activeFt && activeFt.enabled && activeFt.triggerCount) ? activeFt.triggerCount : 3;
            const triggerResult = scatterResults.scatterResults.find(sr => sr.count >= triggerCount);
            if (triggerResult && triggerResult.probability > 0) {
                const featureOneInX = (1 / triggerResult.probability).toFixed(2);
                featureHitEl.textContent = '1 in ' + featureOneInX;
            } else {
                featureHitEl.textContent = 'N/A';
            }
        } else {
            featureHitEl.textContent = 'N/A';
        }
    }

    // Symbol breakdown table (for active reel set)
    let symbolHTML = '';
    if (gameData.reelSets.length > 1) {
        symbolHTML += `<p style="color: #aaa; margin-bottom: 10px; font-size: 0.85em;">Showing detail for: <strong>${gameData.reelSets[gameData.activeReelSet].name}</strong> | Weighted Total RTP: <strong>${rtp.toFixed(4)}%</strong></p>`;
    }
    symbolHTML += '<table><tr><th>Symbol</th>';
    for (let len = 3; len <= config.numReels; len++) {
        symbolHTML += `<th>${len}-of-a-kind Pay</th><th>${len}x Combos</th><th>${len}x Payout</th>`;
    }
    symbolHTML += '<th>Total Payout</th><th>RTP Contribution</th></tr>';

    for (const sym of symbolResults) {
        symbolHTML += `<tr><td><strong>${sym.symbol}</strong></td>`;
        for (let len = 3; len <= config.numReels; len++) {
            const pay = sym.pays[len] || '-';
            const combos = sym.combosPerLength[len] || 0;
            const payout = sym.payoutPerLength[len] || 0;
            symbolHTML += `<td>${pay}</td><td>${combos.toLocaleString()}</td><td>${payout.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>`;
        }
        const symRtp = (sym.totalPayout / totalCombinations) * 100;
        symbolHTML += `<td>${sym.totalPayout.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>`;
        symbolHTML += `<td>${symRtp.toFixed(4)}%</td></tr>`;
    }
    symbolHTML += '</table>';

    // Per-set RTP summary if multiple sets
    if (perSetResults.length > 1) {
        symbolHTML += '<h3 style="margin-top: 20px; color: #00d4ff;">Per Reel Set RTP</h3>';
        symbolHTML += '<table><tr><th>Reel Set</th><th>Weight</th><th>Weight %</th><th>Set RTP</th><th>Contribution to Total</th></tr>';
        for (const ps of perSetResults) {
            const contrib = ps.rtp * ps.weightFraction;
            symbolHTML += `<tr><td>${ps.name}</td><td>${ps.weight}</td><td>${(ps.weightFraction * 100).toFixed(2)}%</td><td>${ps.rtp.toFixed(4)}%</td><td>${contrib.toFixed(4)}%</td></tr>`;
        }
        symbolHTML += '</table>';
    }

    document.getElementById('symbolTable').innerHTML = symbolHTML;

    // Line detail table (for active reel set)
    let lineHTML = '<table><tr><th>Line #</th><th>Pattern</th><th>Hits</th><th>Payout</th><th>RTP</th></tr>';
    for (let lineIdx = 0; lineIdx < gameData.winLines.length; lineIdx++) {
        const line = gameData.winLines[lineIdx];
        let linePayout = 0;
        let lineHits = 0;

        for (const entry of gameData.paytable) {
            if (entry.symbol === config.scatterSymbol) continue;
            for (let len = 3; len <= config.numReels; len++) {
                if (!entry.pays[len] || entry.pays[len] <= 0) continue;
                const combos = countLineCombosForSymbol(entry.symbol, len, line, config,
                    gameData.reelStrips.map(r => r.length), config.wildSymbol, config.scatterSymbol);
                linePayout += combos * entry.pays[len];
                lineHits += combos;
            }
        }

        const lineRtp = (linePayout / totalCombinations) * 100;
        const pattern = line.map((r, i) => `R${i + 1}:${r}`).join(' ');
        lineHTML += `<tr><td>${lineIdx + 1}</td><td>${pattern}</td>`;
        lineHTML += `<td>${lineHits.toLocaleString()}</td>`;
        lineHTML += `<td>${linePayout.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>`;
        lineHTML += `<td>${lineRtp.toFixed(4)}%</td></tr>`;
    }
    lineHTML += '</table>';
    document.getElementById('lineTable').innerHTML = lineHTML;

    // Reel strip composition
    let reelHTML = '<table><tr><th>Symbol</th>';
    for (let r = 0; r < config.numReels; r++) {
        reelHTML += `<th>Reel ${r + 1}</th>`;
    }
    reelHTML += '<th>Total</th></tr>';

    for (const sym of Object.keys(gameData.symbolCounts)) {
        reelHTML += `<tr><td><strong>${sym}</strong></td>`;
        let total = 0;
        for (let r = 0; r < config.numReels; r++) {
            const count = gameData.symbolCounts[sym][r] || 0;
            total += count;
            reelHTML += `<td>${count}</td>`;
        }
        reelHTML += `<td>${total}</td></tr>`;
    }

    reelHTML += '<tr><td><strong>TOTAL</strong></td>';
    for (let r = 0; r < config.numReels; r++) {
        reelHTML += `<td><strong>${gameData.reelStrips[r].length}</strong></td>`;
    }
    reelHTML += `<td><strong>${gameData.reelStrips.reduce((a, r) => a + r.length, 0)}</strong></td></tr>`;
    reelHTML += '</table>';
    document.getElementById('reelTable').innerHTML = reelHTML;

    // Scatter analysis
    if (scatterResults) {
        let scatHTML = '<table><tr><th>Scatter Count</th><th>Combinations</th><th>Probability</th><th>Frequency (1 in X)</th><th>Award</th></tr>';
        for (const sr of scatterResults.scatterResults) {
            const freq = sr.probability > 0 ? (1 / sr.probability).toFixed(1) : 'N/A';
            scatHTML += `<tr><td>${sr.count} Scatters</td>`;
            scatHTML += `<td>${sr.combinations.toLocaleString()}</td>`;
            scatHTML += `<td>${(sr.probability * 100).toFixed(6)}%</td>`;
            scatHTML += `<td>1 in ${freq}</td>`;
            scatHTML += `<td>${sr.payInfo}</td></tr>`;
        }
        scatHTML += '</table>';

        scatHTML += '<h3 style="margin-top:20px; color: #00d4ff;">Scatter Stops Per Reel (visible in window)</h3>';
        scatHTML += '<table><tr><th>Reel</th><th>Scatter Stops</th><th>Total Stops</th><th>Probability</th></tr>';
        for (let r = 0; r < config.numReels; r++) {
            const sc = scatterResults.scatterCountsPerReel[r];
            const total = gameData.reelStrips[r].length;
            scatHTML += `<tr><td>Reel ${r + 1}</td><td>${sc}</td><td>${total}</td><td>${((sc / total) * 100).toFixed(2)}%</td></tr>`;
        }
        scatHTML += '</table>';

        document.getElementById('scatterTable').innerHTML = scatHTML;
    }

    // Free Games RTP breakdown
    if (freeGamesRtp && freeGamesRtp.details.length > 0) {
        let fgHTML = '<h3 style="margin-top: 30px; color: #00ff88;">🎰 Free Games RTP Contribution</h3>';
        fgHTML += `<p style="color: #aaa; margin: 8px 0;">Total Free Games RTP: <strong style="color: #00ff88;">${freeGamesRtp.totalContribution.toFixed(4)}%</strong></p>`;

        for (const d of freeGamesRtp.details) {
            fgHTML += `<h4 style="margin-top: 15px; color: #00d4ff;">Triggered from: ${d.triggerSet} (Global ${d.globalMultiplier}x) — ${d.contribution.toFixed(4)}%</h4>`;
            fgHTML += '<table><tr><th>Scatter Count</th><th>Target Set</th><th>Per-Spin RTP</th><th>Trigger Prob</th><th>Base Spins</th><th>Effective Spins</th><th>Retrigger Exp.</th><th>Chain Depth</th><th>Contribution</th></tr>';
            for (const ad of d.awardDetails) {
                fgHTML += `<tr>
                    <td>${ad.scatterCount} Scatters</td>
                    <td>${ad.targetSetName}</td>
                    <td>${ad.fgPerSpinRtp.toFixed(4)}%</td>
                    <td>${(ad.triggerProb * 100).toFixed(6)}%</td>
                    <td>${ad.spins}</td>
                    <td>${ad.effectiveSpins.toFixed(2)}</td>
                    <td>${ad.retriggerExpectedSpins.toFixed(4)}</td>
                    <td>${ad.chainDepth || 1}</td>
                    <td>${ad.contribution.toFixed(4)}%</td>
                </tr>`;
            }
            fgHTML += '</table>';

            // Show chain flow if depth > 1
            const hasChains = d.awardDetails.some(ad => ad.chainDepth > 1);
            if (hasChains) {
                fgHTML += '<div style="margin-top: 10px; padding: 10px; background: #16213e; border-radius: 6px; border-left: 3px solid #00ff88;">';
                fgHTML += '<h5 style="color: #00ff88; margin-bottom: 6px;">Chain Flow</h5>';
                for (const ad of d.awardDetails) {
                    if (ad.chainDetail && ad.chainDetail.length > 1) {
                        const flow = ad.chainDetail.map((cd, idx) => {
                            const arrow = idx > 0 ? ' → ' : '';
                            return `${arrow}<span style="color: #00d4ff;">${cd.setName}</span> (${cd.spins} spins, ${cd.perSpinRtp.toFixed(2)}%/spin)`;
                        }).join('');
                        fgHTML += `<p style="font-size: 0.85em; margin: 4px 0;">${ad.scatterCount}S: ${flow}</p>`;
                    }
                }
                fgHTML += '</div>';
            }
        }

        // Level Progression Probabilities
        const progressionData = calculateLevelProgression(config);
        if (progressionData.length > 0) {
            fgHTML += '<div style="margin-top: 20px; padding: 15px; background: #16213e; border-radius: 8px; border-left: 3px solid #ffaa00;">';
            fgHTML += '<h4 style="color: #ffaa00; margin-bottom: 10px;">📊 Level Progression Probabilities</h4>';
            fgHTML += '<p style="color: #aaa; font-size: 0.8em; margin-bottom: 10px;">Chance of reaching each level once free games are triggered.</p>';
            fgHTML += '<table><tr><th>Level</th><th>Reel Set</th><th>Spins at Level</th><th>P(Reach this level)</th><th>P(Advance to next)</th><th>Frequency</th></tr>';

            for (const level of progressionData) {
                const reachPct = (level.reachProbability * 100).toFixed(4);
                const advancePct = level.advanceProbability !== null ? (level.advanceProbability * 100).toFixed(4) + '%' : '— (final level)';
                const freq = level.reachProbability > 0 && level.reachProbability < 1 ? '1 in ' + (1 / level.reachProbability).toFixed(1) : level.reachProbability >= 1 ? 'Always' : 'N/A';
                const barWidth = Math.round(level.reachProbability * 200);

                fgHTML += `<tr>
                    <td style="font-weight: bold; color: #00d4ff;">${level.levelName}</td>
                    <td>${level.setName}</td>
                    <td>${level.spins} (eff: ${level.effectiveSpins.toFixed(1)})</td>
                    <td><span style="color: #00ff88; font-weight: bold;">${reachPct}%</span>
                        <span style="display: inline-block; height: 8px; width: ${barWidth}px; background: #00ff88; border-radius: 4px; margin-left: 6px; vertical-align: middle;"></span></td>
                    <td>${advancePct}</td>
                    <td style="color: #aaa;">${freq}</td>
                </tr>`;
            }
            fgHTML += '</table>';
            fgHTML += '</div>';
        } else {
            fgHTML += '<div style="margin-top: 15px; padding: 10px; background: #16213e; border-radius: 6px;">';
            fgHTML += '<p style="color: #666; font-size: 0.85em;">💡 To see level progression: enable feature triggers on your FG reel sets and point each level to the next.</p>';
            fgHTML += '</div>';
        }

        const scatContainer = document.getElementById('scatterTable');
        scatContainer.innerHTML += fgHTML;
    }

    // Render reel sets manager
    renderReelSetsPanel();
}

// ============ REEL SETS MANAGER ============
function renderReelSetsPanel() {
    const container = document.getElementById('reelSetsPanel');
    if (!container) return;

    const totalWeight = gameData.reelSets.reduce((sum, rs) => sum + rs.weight, 0);

    let html = '<table style="width: 100%;"><tr><th></th><th>Name</th><th>Weight</th><th>Weight %</th><th>Stops (R1)</th><th>Wild Mult.</th><th>Actions</th></tr>';

    for (let i = 0; i < gameData.reelSets.length; i++) {
        const set = gameData.reelSets[i];
        const isActive = i === gameData.activeReelSet;
        const pct = totalWeight > 0 ? ((set.weight / totalWeight) * 100).toFixed(1) : '0';
        const stops = set.reelStrips && set.reelStrips[0] ? set.reelStrips[0].length : 0;
        const activeStyle = isActive ? 'background: #1a3a5e; border-left: 3px solid #00d4ff;' : '';
        const multSummary = getWildMultiplierSummary(set.wildMultipliers);

        html += `<tr style="${activeStyle}">
            <td><input type="radio" name="activeReelSet" value="${i}" ${isActive ? 'checked' : ''}></td>
            <td><input type="text" value="${set.name}" data-set="${i}" class="reel-set-name-input" style="background: #0f3460; border: 1px solid #1a2a4e; color: #e0e0e0; padding: 4px 8px; border-radius: 4px; width: 140px;"></td>
            <td><input type="number" value="${set.weight}" min="0" step="1" data-set="${i}" class="reel-set-weight-input" style="background: #0f3460; border: 1px solid #1a2a4e; color: #e0e0e0; padding: 4px 8px; border-radius: 4px; width: 70px;"></td>
            <td>${pct}%</td>
            <td>${stops}</td>
            <td style="font-size: 0.8em; color: ${multSummary === 'None' ? '#666' : '#ffaa00'};">${multSummary}</td>
            <td>${gameData.reelSets.length > 1 ? `<button class="reel-set-delete-btn" data-set="${i}" style="background: #ff4444; color: #fff; padding: 4px 10px; font-size: 0.8em;">✕</button>` : ''}</td>
        </tr>`;
    }

    html += '</table>';
    html += `<div style="margin-top: 12px; display: flex; gap: 10px; flex-wrap: wrap;">
        <button id="addReelSetBtn" style="font-size: 0.85em; padding: 8px 16px;">+ Add Reel Set</button>
        <button id="duplicateReelSetBtn" style="font-size: 0.85em; padding: 8px 16px; background: #0f3460; color: #00d4ff; border: 1px solid #00d4ff;">📋 Duplicate Active</button>
    </div>`;

    // Wild Multiplier config for active set
    const activeSet = gameData.reelSets[gameData.activeReelSet];
    html += renderWildMultiplierEditor(activeSet);

    // Feature Trigger config for active set
    html += renderFeatureTriggerEditor(activeSet);

    container.innerHTML = html;

    // Bind reel set events
    container.querySelectorAll('input[name="activeReelSet"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const newIdx = parseInt(e.target.value);
            switchToReelSet(newIdx);
            runEvaluation();
        });
    });

    container.querySelectorAll('.reel-set-name-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.set);
            gameData.reelSets[idx].name = e.target.value;
        });
    });

    container.querySelectorAll('.reel-set-weight-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.set);
            gameData.reelSets[idx].weight = Math.max(0, parseFloat(e.target.value) || 0);
            runEvaluation();
        });
    });

    container.querySelectorAll('.reel-set-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.set);
            if (!confirm(`Delete reel set "${gameData.reelSets[idx].name}"?`)) return;
            gameData.reelSets.splice(idx, 1);
            if (gameData.activeReelSet >= gameData.reelSets.length) {
                gameData.activeReelSet = gameData.reelSets.length - 1;
            }
            switchToReelSet(gameData.activeReelSet);
            runEvaluation();
        });
    });

    const addBtn = document.getElementById('addReelSetBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const config = getConfig();
            const emptyStrips = [];
            for (let r = 0; r < config.numReels; r++) {
                emptyStrips.push([]);
            }
            gameData.reelSets.push({
                name: `Reel Set ${gameData.reelSets.length + 1}`,
                weight: 1,
                reelStrips: emptyStrips,
                symbolCounts: {},
                wildMultipliers: [],
                featureTrigger: { enabled: false, targetSetIndex: -1, awards: [], globalMultiplier: 1, retrigger: true }
            });
            switchToReelSet(gameData.reelSets.length - 1);
            runEvaluation();
        });
    }

    const dupBtn = document.getElementById('duplicateReelSetBtn');
    if (dupBtn) {
        dupBtn.addEventListener('click', () => {
            const source = gameData.reelSets[gameData.activeReelSet];
            gameData.reelSets.push({
                name: source.name + ' (copy)',
                weight: source.weight,
                reelStrips: source.reelStrips.map(r => [...r]),
                symbolCounts: JSON.parse(JSON.stringify(source.symbolCounts)),
                wildMultipliers: source.wildMultipliers ? source.wildMultipliers.map(wm => ({ ...wm })) : [],
                featureTrigger: source.featureTrigger ? JSON.parse(JSON.stringify(source.featureTrigger)) : { enabled: false, targetSetIndex: -1, awards: [], globalMultiplier: 1, retrigger: true }
            });
            switchToReelSet(gameData.reelSets.length - 1);
            runEvaluation();
        });
    }

    // Bind wild multiplier events
    bindWildMultiplierEvents();

    // Bind feature trigger events
    bindFeatureTriggerEvents();
}

function getWildMultiplierSummary(wildMultipliers) {
    if (!wildMultipliers || wildMultipliers.length === 0) return 'None';
    const expected = wildMultipliers.reduce((sum, wm) => sum + (wm.multiplier * wm.chance), 0);
    return `Avg ${expected.toFixed(2)}x`;
}

function renderWildMultiplierEditor(activeSet) {
    const multipliers = activeSet.wildMultipliers || [];

    let html = `<div style="margin-top: 20px; padding: 15px; background: #0f3460; border-radius: 8px; border-left: 3px solid #ffaa00;">
        <h4 style="color: #ffaa00; margin-bottom: 10px;">🃏 Wild Multipliers — ${activeSet.name}</h4>
        <p style="color: #aaa; font-size: 0.8em; margin-bottom: 10px;">When a win includes wild(s), it is multiplied. Define the chance each multiplier value is applied. Chances must sum to 1 (100%).</p>`;

    if (multipliers.length > 0) {
        html += `<table style="width: 100%; margin-bottom: 10px;">
            <tr><th>Multiplier</th><th>Chance</th><th>Chance %</th><th></th></tr>`;
        for (let i = 0; i < multipliers.length; i++) {
            const wm = multipliers[i];
            html += `<tr>
                <td><input type="number" value="${wm.multiplier}" min="0" step="1" data-wm-idx="${i}" class="wm-mult-input" style="background: #16213e; border: 1px solid #1a2a4e; color: #e0e0e0; padding: 4px 8px; border-radius: 4px; width: 70px;"></td>
                <td><input type="number" value="${wm.chance}" min="0" max="1" step="0.01" data-wm-idx="${i}" class="wm-chance-input" style="background: #16213e; border: 1px solid #1a2a4e; color: #e0e0e0; padding: 4px 8px; border-radius: 4px; width: 80px;"></td>
                <td style="color: #aaa;">${(wm.chance * 100).toFixed(1)}%</td>
                <td><button class="wm-delete-btn" data-wm-idx="${i}" style="background: #ff4444; color: #fff; padding: 3px 8px; font-size: 0.8em; border: none; border-radius: 4px; cursor: pointer;">✕</button></td>
            </tr>`;
        }

        const totalChance = multipliers.reduce((sum, wm) => sum + wm.chance, 0);
        const expectedMult = multipliers.reduce((sum, wm) => sum + (wm.multiplier * wm.chance), 0);
        const chanceColor = Math.abs(totalChance - 1) < 0.001 ? '#00ff88' : '#ff4444';

        html += `<tr style="border-top: 2px solid #1a2a4e;">
            <td style="font-weight: bold; color: #ffaa00;">Expected: ${expectedMult.toFixed(2)}x</td>
            <td style="font-weight: bold; color: ${chanceColor};">Total: ${totalChance.toFixed(2)}</td>
            <td style="color: ${chanceColor};">${(totalChance * 100).toFixed(1)}%</td>
            <td></td>
        </tr>`;
        html += '</table>';

        if (Math.abs(totalChance - 1) > 0.001) {
            html += `<p style="color: #ff4444; font-size: 0.8em; margin-bottom: 8px;">⚠️ Chances must sum to 1.0 (currently ${totalChance.toFixed(3)})</p>`;
        }
    } else {
        html += `<p style="color: #666; font-size: 0.85em; margin-bottom: 10px;">No wild multipliers configured. Wins involving wilds pay at 1x.</p>`;
    }

    html += `<button id="addWildMultBtn" style="font-size: 0.8em; padding: 6px 14px;">+ Add Multiplier</button>`;
    html += '</div>';

    return html;
}

function bindWildMultiplierEvents() {
    const container = document.getElementById('reelSetsPanel');
    const activeSet = gameData.reelSets[gameData.activeReelSet];

    container.querySelectorAll('.wm-mult-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.wmIdx);
            activeSet.wildMultipliers[idx].multiplier = Math.max(0, parseFloat(e.target.value) || 0);
            runEvaluation();
        });
    });

    container.querySelectorAll('.wm-chance-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.wmIdx);
            activeSet.wildMultipliers[idx].chance = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
            runEvaluation();
        });
    });

    container.querySelectorAll('.wm-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.wmIdx);
            activeSet.wildMultipliers.splice(idx, 1);
            runEvaluation();
        });
    });

    const addBtn = document.getElementById('addWildMultBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            if (!activeSet.wildMultipliers) activeSet.wildMultipliers = [];
            activeSet.wildMultipliers.push({ multiplier: 2, chance: 0.5 });
            runEvaluation();
        });
    }
}

// ============ FEATURE TRIGGER (FREE GAMES) ============
function renderFeatureTriggerEditor(activeSet) {
    const ft = activeSet.featureTrigger || { enabled: false, targetSetIndex: -1, awards: [], globalMultiplier: 1, retrigger: true };

    let html = `<div style="margin-top: 20px; padding: 15px; background: #0f3460; border-radius: 8px; border-left: 3px solid #00ff88;">
        <h4 style="color: #00ff88; margin-bottom: 10px;">🎰 Feature Trigger (Free Games) — ${activeSet.name}</h4>
        <p style="color: #aaa; font-size: 0.8em; margin-bottom: 12px;">When scatters land on this reel set, trigger free spins. Each scatter tier can target a different reel set.</p>`;

    // Enable toggle
    html += `<label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; cursor: pointer;">
        <input type="checkbox" id="ftEnabled" ${ft.enabled ? 'checked' : ''} style="width: 18px; height: 18px;">
        <span style="color: #e0e0e0;">Enable feature trigger on this set</span>
    </label>`;

    if (ft.enabled) {
        // Global settings
        html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
            <label style="display: flex; flex-direction: column; gap: 4px;">
                <span style="font-size: 0.8em; color: #aaa;">Global Multiplier (all FG wins)</span>
                <input type="number" id="ftGlobalMult" value="${ft.globalMultiplier}" min="1" step="1" style="background: #16213e; border: 1px solid #00ff88; color: #e0e0e0; padding: 6px 10px; border-radius: 6px;">
            </label>
            <label style="display: flex; align-items: center; gap: 8px; padding-top: 18px;">
                <input type="checkbox" id="ftRetrigger" ${ft.retrigger ? 'checked' : ''} style="width: 16px; height: 16px;">
                <span style="font-size: 0.85em; color: #e0e0e0;">Allow retriggers</span>
            </label>
        </div>`;

        // Awards table with per-row target set
        html += `<h5 style="color: #00d4ff; margin-bottom: 8px;">Scatter Awards</h5>`;
        if (ft.awards.length > 0) {
            html += '<table style="width: 100%; margin-bottom: 10px;"><tr><th>Scatter Count</th><th>Spins</th><th>Target Reel Set</th><th></th></tr>';
            for (let i = 0; i < ft.awards.length; i++) {
                const award = ft.awards[i];
                const awardTarget = award.targetSetIndex !== undefined ? award.targetSetIndex : ft.targetSetIndex;
                html += `<tr>
                    <td><input type="number" value="${award.scatterCount}" min="3" max="10" data-award-idx="${i}" class="ft-scatter-input" style="background: #16213e; border: 1px solid #1a2a4e; color: #e0e0e0; padding: 4px 8px; border-radius: 4px; width: 60px;"></td>
                    <td><input type="number" value="${award.spins}" min="1" data-award-idx="${i}" class="ft-spins-input" style="background: #16213e; border: 1px solid #1a2a4e; color: #e0e0e0; padding: 4px 8px; border-radius: 4px; width: 70px;"></td>
                    <td><select data-award-idx="${i}" class="ft-target-select" style="background: #16213e; border: 1px solid #00ff88; color: #e0e0e0; padding: 4px 8px; border-radius: 4px;">`;
                for (let j = 0; j < gameData.reelSets.length; j++) {
                    const selected = j === awardTarget ? ' selected' : '';
                    html += `<option value="${j}"${selected}>${gameData.reelSets[j].name}</option>`;
                }
                html += `</select></td>
                    <td><button class="ft-award-delete-btn" data-award-idx="${i}" style="background: #ff4444; color: #fff; padding: 3px 8px; font-size: 0.8em; border: none; border-radius: 4px; cursor: pointer;">✕</button></td>
                </tr>`;
            }
            html += '</table>';
        } else {
            html += '<p style="color: #666; font-size: 0.85em; margin-bottom: 10px;">No scatter awards defined. Add at least one.</p>';
        }

        html += `<button id="addFtAwardBtn" style="font-size: 0.8em; padding: 6px 14px; background: #00ff88; color: #1a1a2e;">+ Add Award Tier</button>`;
    }

    html += '</div>';
    return html;
}

function bindFeatureTriggerEvents() {
    const container = document.getElementById('reelSetsPanel');
    const activeSet = gameData.reelSets[gameData.activeReelSet];
    if (!activeSet.featureTrigger) {
        activeSet.featureTrigger = { enabled: false, targetSetIndex: -1, awards: [], globalMultiplier: 1, retrigger: true };
    }
    const ft = activeSet.featureTrigger;

    const enabledCheckbox = document.getElementById('ftEnabled');
    if (enabledCheckbox) {
        enabledCheckbox.addEventListener('change', (e) => {
            ft.enabled = e.target.checked;
            runEvaluation();
        });
    }

    const globalMultInput = document.getElementById('ftGlobalMult');
    if (globalMultInput) {
        globalMultInput.addEventListener('change', (e) => {
            ft.globalMultiplier = Math.max(1, parseFloat(e.target.value) || 1);
            runEvaluation();
        });
    }

    const retriggerCheckbox = document.getElementById('ftRetrigger');
    if (retriggerCheckbox) {
        retriggerCheckbox.addEventListener('change', (e) => {
            ft.retrigger = e.target.checked;
            runEvaluation();
        });
    }

    container.querySelectorAll('.ft-scatter-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.awardIdx);
            ft.awards[idx].scatterCount = parseInt(e.target.value) || 3;
            runEvaluation();
        });
    });

    container.querySelectorAll('.ft-spins-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.awardIdx);
            ft.awards[idx].spins = parseInt(e.target.value) || 1;
            runEvaluation();
        });
    });

    container.querySelectorAll('.ft-target-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.awardIdx);
            ft.awards[idx].targetSetIndex = parseInt(e.target.value);
            runEvaluation();
        });
    });

    container.querySelectorAll('.ft-award-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.awardIdx);
            ft.awards.splice(idx, 1);
            runEvaluation();
        });
    });

    const addAwardBtn = document.getElementById('addFtAwardBtn');
    if (addAwardBtn) {
        addAwardBtn.addEventListener('click', () => {
            const nextCount = ft.awards.length > 0 ? ft.awards[ft.awards.length - 1].scatterCount + 1 : 3;
            const defaultTarget = ft.awards.length > 0 ? ft.awards[ft.awards.length - 1].targetSetIndex || 0 : 0;
            ft.awards.push({ scatterCount: nextCount, spins: 8, targetSetIndex: defaultTarget });
            runEvaluation();
        });
    }
}

// ============ TABS ============
document.querySelectorAll('.tab-buttons button[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
        // Only toggle among sibling tab buttons (not sub-tabs)
        if (btn.classList.contains('data-sub-tab')) return;
        document.querySelectorAll('.tab-buttons button[data-tab]').forEach(b => {
            if (!b.classList.contains('data-sub-tab')) b.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');

        // Initialize reel config when its tab is activated
        if (btn.dataset.tab === 'reelConfig') {
            renderReelConfig();
        }

        // Initialize reel editor when its tab is activated
        if (btn.dataset.tab === 'reelEditor' && typeof initReelEditor === 'function') {
            if (gameData.reelStrips.length > 0 && gameData.reelStrips[0].length > 0) {
                initReelEditor();
            }
        }

        // Initialize paytable editor when its tab is activated
        if (btn.dataset.tab === 'paytableEditor') {
            renderPaytableEditor();
        }

        // Initialize data tab sub-tabs
        if (btn.dataset.tab === 'dataTab') {
            initDataSubTabs();
        }
    });
});

// Data sub-tab logic
function initDataSubTabs() {
    document.querySelectorAll('.data-sub-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.data-sub-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.data-sub-content').forEach(c => c.style.display = 'none');
            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.subtab);
            if (target) target.style.display = 'block';

            // Trigger win distribution calculation when that sub-tab is shown
            if (btn.dataset.subtab === 'subWinDist') {
                if (gameData.reelStrips.length > 0 && gameData.reelStrips[0].length > 0) {
                    calculateWinDistribution();
                }
            }
        });
    });
}
// Initialize sub-tab listeners immediately
initDataSubTabs();

// ============ REEL STRIP CONFIGURATION ============
function renderReelConfig() {
    const config = getConfig();
    const container = document.getElementById('reelConfigPanel');
    if (!container) return;

    const symbols = gameData.paytable.map(e => e.symbol);
    if (symbols.length === 0) {
        container.innerHTML = '<p style="color: #666;">No paytable loaded. Import a PAR sheet or start from scratch first.</p>';
        return;
    }

    let html = '<table style="width: 100%;"><tr><th>Symbol</th>';
    for (let r = 0; r < config.numReels; r++) {
        html += `<th>Reel ${r + 1}</th>`;
    }
    html += '<th>Total</th></tr>';

    for (const sym of symbols) {
        html += `<tr><td><strong>${sym}</strong></td>`;
        let rowTotal = 0;
        for (let r = 0; r < config.numReels; r++) {
            const count = (gameData.symbolCounts[sym] && gameData.symbolCounts[sym][r]) || 0;
            html += `<td><input type="number" min="0" value="${count}" data-sym="${sym}" data-reel="${r}" class="reel-config-count" style="background: #0f3460; border: 1px solid #1a2a4e; color: #e0e0e0; padding: 4px 8px; border-radius: 4px; width: 60px; text-align: center;"></td>`;
            rowTotal += count;
        }
        html += `<td style="color: #aaa;">${rowTotal}</td></tr>`;
    }

    // Totals row
    html += '<tr style="border-top: 2px solid #00d4ff;"><td><strong>TOTAL</strong></td>';
    for (let r = 0; r < config.numReels; r++) {
        let colTotal = 0;
        for (const sym of symbols) {
            colTotal += (gameData.symbolCounts[sym] && gameData.symbolCounts[sym][r]) || 0;
        }
        html += `<td style="font-weight: bold; color: #00d4ff;">${colTotal}</td>`;
    }
    html += '<td></td></tr>';
    html += '</table>';

    html += `<div style="margin-top: 15px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
        <button id="randomiseReelBtn" style="background: #00ff88; color: #1a1a2e; padding: 10px 20px;">🎲 Randomise & Apply</button>
        <button id="stackedSymbolsBtn" style="background: #ff8c00; color: #fff; padding: 10px 20px;">📚 Stacked Symbols</button>
        <span style="color: #aaa; font-size: 0.8em;">Randomise shuffles strips. Stacked adds random 2/3 stacks.</span>
    </div>`;

    container.innerHTML = html;

    // Bind count input changes (update symbolCounts in memory)
    container.querySelectorAll('.reel-config-count').forEach(input => {
        input.addEventListener('change', (e) => {
            const sym = e.target.dataset.sym;
            const reel = parseInt(e.target.dataset.reel);
            const val = Math.max(0, parseInt(e.target.value) || 0);
            if (!gameData.symbolCounts[sym]) {
                gameData.symbolCounts[sym] = new Array(config.numReels).fill(0);
            }
            gameData.symbolCounts[sym][reel] = val;
            // Re-render to update totals
            renderReelConfig();
        });
    });

    // Randomise & Apply
    const randBtn = document.getElementById('randomiseReelBtn');
    if (randBtn) {
        randBtn.addEventListener('click', () => {
            applyReelConfigToStrips(true);
        });
    }

    // Stacked Symbols
    const stackBtn = document.getElementById('stackedSymbolsBtn');
    if (stackBtn) {
        stackBtn.addEventListener('click', () => {
            applyStackedSymbols();
        });
    }
}

function applyReelConfigToStrips(randomise) {
    const config = getConfig();
    const symbols = gameData.paytable.map(e => e.symbol);
    const bonusSymbol = config.scatterSymbol; // The bonus/scatter symbol

    gameData.reelStrips = [];
    for (let r = 0; r < config.numReels; r++) {
        const strip = [];
        for (const sym of symbols) {
            const count = (gameData.symbolCounts[sym] && gameData.symbolCounts[sym][r]) || 0;
            for (let i = 0; i < count; i++) {
                strip.push(sym);
            }
        }

        if (randomise) {
            // Separate bonus symbols from non-bonus
            const bonusPositions = [];
            const nonBonusSymbols = [];
            for (const sym of strip) {
                if (sym === bonusSymbol) {
                    bonusPositions.push(sym);
                } else {
                    nonBonusSymbols.push(sym);
                }
            }

            // Shuffle non-bonus symbols
            for (let i = nonBonusSymbols.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [nonBonusSymbols[i], nonBonusSymbols[j]] = [nonBonusSymbols[j], nonBonusSymbols[i]];
            }

            // Place bonus symbols with minimum 3 apart spacing
            const totalLength = strip.length;
            const bonusCount = bonusPositions.length;

            if (bonusCount > 0 && totalLength > 0) {
                // Calculate evenly spaced positions with minimum gap of 3
                const spacing = Math.max(3, Math.floor(totalLength / bonusCount));
                const bonusIndices = [];
                let startOffset = Math.floor(Math.random() * Math.min(spacing, totalLength - (bonusCount - 1) * spacing));

                for (let b = 0; b < bonusCount; b++) {
                    let pos = startOffset + b * spacing;
                    if (pos >= totalLength) pos = totalLength - 1 - (bonusCount - 1 - b);
                    bonusIndices.push(pos);
                }

                // Build final strip: insert bonus symbols at calculated positions
                const finalStrip = [];
                let nonBonusIdx = 0;
                const bonusSet = new Set(bonusIndices);

                for (let i = 0; i < totalLength; i++) {
                    if (bonusSet.has(i)) {
                        finalStrip.push(bonusSymbol);
                    } else {
                        finalStrip.push(nonBonusSymbols[nonBonusIdx++] || nonBonusSymbols[0]);
                    }
                }

                gameData.reelStrips[r] = finalStrip;
            } else {
                gameData.reelStrips[r] = nonBonusSymbols;
            }
        } else {
            gameData.reelStrips[r] = strip;
        }
    }

    // Sync to active reel set
    if (gameData.reelSets.length > 0) {
        gameData.reelSets[gameData.activeReelSet].reelStrips = gameData.reelStrips.map(r => [...r]);
        gameData.reelSets[gameData.activeReelSet].symbolCounts = JSON.parse(JSON.stringify(gameData.symbolCounts));
    }

    runEvaluation();
    renderReelConfig();
}

function applyStackedSymbols() {
    const config = getConfig();
    const scatterSymbol = config.scatterSymbol;

    // First randomise the strips (with scatter spacing)
    applyReelConfigToStrips(true);

    // Now rearrange each reel so non-scatter symbols are grouped into stacks of 2-3
    // WITHOUT changing the count of any symbol
    for (let r = 0; r < config.numReels; r++) {
        const strip = gameData.reelStrips[r];
        if (strip.length < 5) continue;

        // Record scatter positions
        const scatterPositions = new Set();
        for (let i = 0; i < strip.length; i++) {
            if (strip[i] === scatterSymbol) {
                scatterPositions.add(i);
            }
        }

        // Collect all non-scatter symbols (preserving exact counts)
        const nonScatters = strip.filter(s => s !== scatterSymbol);
        if (nonScatters.length === 0) continue;

        // Group by symbol, preserving counts
        const symbolBuckets = {};
        for (const sym of nonScatters) {
            symbolBuckets[sym] = (symbolBuckets[sym] || 0) + 1;
        }

        // Build stacks: pull from buckets in random order, creating runs of 2-3
        const stacked = [];
        const symbols = Object.keys(symbolBuckets);

        // Shuffle symbol order
        for (let i = symbols.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
        }

        // Drain each symbol's count into stacks of 2-3
        let symIdx = 0;
        while (stacked.length < nonScatters.length) {
            // Find next symbol with remaining count
            let found = false;
            for (let attempts = 0; attempts < symbols.length; attempts++) {
                const sym = symbols[symIdx % symbols.length];
                symIdx++;
                if (symbolBuckets[sym] > 0) {
                    const stackSize = Math.min(Math.random() < 0.5 ? 2 : 3, symbolBuckets[sym]);
                    for (let k = 0; k < stackSize; k++) {
                        stacked.push(sym);
                        symbolBuckets[sym]--;
                    }
                    found = true;
                    break;
                }
            }
            if (!found) break;
        }

        // Place back into strip, keeping scatter positions fixed
        const newStrip = [];
        let stackedIdx = 0;
        for (let i = 0; i < strip.length; i++) {
            if (scatterPositions.has(i)) {
                newStrip.push(scatterSymbol);
            } else {
                newStrip.push(stacked[stackedIdx++]);
            }
        }

        gameData.reelStrips[r] = newStrip;
    }

    // Sync to active reel set (counts unchanged, just order)
    if (gameData.reelSets.length > 0) {
        gameData.reelSets[gameData.activeReelSet].reelStrips = gameData.reelStrips.map(r => [...r]);
    }

    runEvaluation();
    renderReelConfig();
}

// ============ CONFIG CHANGE LISTENER ============
document.querySelectorAll('.config-grid input').forEach(input => {
    input.addEventListener('change', () => {
        if (gameData.reelStrips.length > 0 && gameData.reelStrips[0].length > 0) {
            runEvaluation();
        }
    });
});

// ============ PAYTABLE EDITOR ============
let selectedPaytableRow = -1;

function renderPaytableEditor() {
    const config = getConfig();
    const container = document.getElementById('paytableEditorTable');

    if (gameData.paytable.length === 0) {
        container.innerHTML = '<p style="color: #666;">No paytable loaded. Upload a PAR sheet first.</p>';
        return;
    }

    let html = `<table class="paytable-edit-table"><tr>
        <th></th>
        <th>Symbol</th>`;
    for (let len = 3; len <= config.numReels; len++) {
        html += `<th>${len}-of-a-kind</th>`;
    }
    html += '</tr>';

    for (let i = 0; i < gameData.paytable.length; i++) {
        const entry = gameData.paytable[i];
        const rowClass = i === selectedPaytableRow ? 'selected-row' : '';
        html += `<tr class="${rowClass}" data-index="${i}">
            <td><input type="radio" name="paytableSelect" value="${i}" ${i === selectedPaytableRow ? 'checked' : ''}></td>
            <td class="symbol-cell"><span class="symbol-badge ${typeof getSymbolColorClass === 'function' ? getSymbolColorClass(entry.symbol) : getSymbolColorClassPay(entry.symbol)}">${entry.symbol}</span></td>`;
        for (let len = 3; len <= config.numReels; len++) {
            const val = entry.pays[len];
            const displayVal = val !== undefined ? val : '';
            html += `<td><input type="number" step="0.01" min="0" value="${displayVal}" data-symbol="${i}" data-len="${len}" placeholder="N/A"></td>`;
        }
        html += '</tr>';
    }

    html += '</table>';
    container.innerHTML = html;

    // Bind input change events
    container.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.symbol);
            const len = parseInt(e.target.dataset.len);
            const val = e.target.value.trim();

            if (val === '' || isNaN(parseFloat(val))) {
                delete gameData.paytable[idx].pays[len];
            } else {
                gameData.paytable[idx].pays[len] = parseFloat(val);
            }

            runEvaluation();
        });
    });

    // Bind radio selection
    container.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            selectedPaytableRow = parseInt(e.target.value);
            renderPaytableEditor();
        });
    });

    // Bind row click for selection
    container.querySelectorAll('tr[data-index]').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            selectedPaytableRow = parseInt(row.dataset.index);
            renderPaytableEditor();
        });
    });
}

// Add/remove paytable row buttons
document.getElementById('addPaytableRowBtn').addEventListener('click', () => {
    const symbolInput = document.getElementById('newSymbolId');
    const symbol = symbolInput.value.trim().toUpperCase();

    if (!symbol) {
        alert('Enter a Symbol ID to add.');
        return;
    }

    // Check if already exists
    if (gameData.paytable.find(e => e.symbol === symbol)) {
        alert(`Symbol "${symbol}" already exists in the paytable.`);
        return;
    }

    const config = getConfig();
    const pays = {};
    // Default to 0 for all lengths
    for (let len = 3; len <= config.numReels; len++) {
        pays[len] = 0;
    }

    gameData.paytable.push({ symbol, pays });
    symbolInput.value = '';
    renderPaytableEditor();
    runEvaluation();
});

document.getElementById('removePaytableRowBtn').addEventListener('click', () => {
    if (selectedPaytableRow < 0 || selectedPaytableRow >= gameData.paytable.length) {
        alert('Select a symbol row to remove.');
        return;
    }

    const sym = gameData.paytable[selectedPaytableRow].symbol;
    if (!confirm(`Remove "${sym}" from the paytable?`)) return;

    gameData.paytable.splice(selectedPaytableRow, 1);
    selectedPaytableRow = -1;
    renderPaytableEditor();
    runEvaluation();
});

// Helper to get symbol color class (may already be defined in reel-editor.js)
function getSymbolColorClassPay(symbol) {
    const known = ['J', 'Q', 'K', 'A', 'M2', 'M1', 'H3', 'H2', 'H1', 'W', 'S'];
    return known.includes(symbol) ? `symbol-color-${symbol}` : 'symbol-color-default';
}

// ============ WIN DISTRIBUTION ============
function calculateWinDistribution() {
    const config = getConfig();
    const reelLengths = gameData.reelStrips.map(r => r.length);
    const totalCombinations = reelLengths.reduce((a, b) => a * b, 1);

    // Define win bands
    const bands = [
        { label: 'No Win', min: 0, max: 0 },
        { label: '0.01 – 0.50', min: 0.01, max: 0.50 },
        { label: '0.51 – 1.00', min: 0.51, max: 1.00 },
        { label: '1.01 – 5.00', min: 1.01, max: 5.00 },
        { label: '5.01 – 10.00', min: 5.01, max: 10.00 },
        { label: '10.01 – 20.00', min: 10.01, max: 20.00 },
        { label: '20.01 – 100.00', min: 20.01, max: 100.00 },
        { label: '100.01 – 500.00', min: 100.01, max: 500.00 },
        { label: 'Over 500', min: 500.01, max: Infinity }
    ];

    // Show loading state
    document.getElementById('winDistTable').innerHTML = '<p style="color: #00d4ff; font-size: 1.2em;">⏳ Calculating win distribution...</p>';

    // Use chunked async processing to avoid freezing the browser
    const sampleSize = 10000000;
    const chunkSize = 50000;

    const bandCounts = new Array(bands.length).fill(0);
    let processed = 0;
    let maxWinSeen = 0;

    // Get wild multiplier config for sampling
    const activeSet = gameData.reelSets[gameData.activeReelSet] || {};
    const wildMultipliers = activeSet.wildMultipliers || [];

    function sampleWildMultiplier() {
        if (wildMultipliers.length === 0) return 1;
        const rand = Math.random();
        let cumulative = 0;
        for (const wm of wildMultipliers) {
            cumulative += wm.chance;
            if (rand <= cumulative) return wm.multiplier;
        }
        return wildMultipliers[wildMultipliers.length - 1].multiplier;
    }

    function processChunk() {
        const end = Math.min(processed + chunkSize, sampleSize);

        for (let s = processed; s < end; s++) {
            // Random stop positions
            const stops = [];
            for (let r = 0; r < config.numReels; r++) {
                stops.push(Math.floor(Math.random() * reelLengths[r]));
            }

            // Sample a wild multiplier for this spin
            const spinWildMult = sampleWildMultiplier();

            // Calculate total win for this spin
            let totalWin = 0;
            for (const line of gameData.winLines) {
                const result = getLineWinAmountFast(line, stops, config);
                if (result.pay > 0) {
                    totalWin += result.hasWild ? result.pay * spinWildMult : result.pay;
                }
            }

            // Classify into band
            if (totalWin > maxWinSeen) maxWinSeen = totalWin;
            if (totalWin === 0) {
                bandCounts[0]++;
            } else if (totalWin <= 0.50) {
                bandCounts[1]++;
            } else if (totalWin <= 1.00) {
                bandCounts[2]++;
            } else if (totalWin <= 5.00) {
                bandCounts[3]++;
            } else if (totalWin <= 10.00) {
                bandCounts[4]++;
            } else if (totalWin <= 20.00) {
                bandCounts[5]++;
            } else if (totalWin <= 100.00) {
                bandCounts[6]++;
            } else if (totalWin <= 500.00) {
                bandCounts[7]++;
            } else {
                bandCounts[8]++;
            }
        }

        processed = end;

        if (processed < sampleSize) {
            // Update progress
            const pct = Math.round((processed / sampleSize) * 100);
            document.getElementById('winDistTable').innerHTML =
                `<p style="color: #00d4ff; font-size: 1.2em;">⏳ Calculating... ${pct}% (${processed.toLocaleString()} / ${sampleSize.toLocaleString()} samples)</p>`;
            setTimeout(processChunk, 0);
        } else {
            // Done - display results
            displayWinDistribution(bands, bandCounts, sampleSize, maxWinSeen);
        }
    }

    // Start processing
    setTimeout(processChunk, 10);
}

function getLineWinAmountFast(line, stops, config) {
    // Optimised: determine the best left-to-right pay for this line given the stops
    // Returns { pay, hasWild } to support multiplier application
    const wildSymbol = config.wildSymbol;
    const scatterSymbol = config.scatterSymbol;
    const numReels = config.numReels;

    // Get symbols at line positions
    const syms = [];
    for (let r = 0; r < numReels; r++) {
        const reelStrip = gameData.reelStrips[r];
        const idx = (stops[r] + line[r] - 1) % reelStrip.length;
        syms.push(reelStrip[idx]);
    }

    // Determine the leading symbol (first non-wild, or wild if all wilds)
    let leadSymbol = null;
    let allWild = true;
    for (let r = 0; r < numReels; r++) {
        if (syms[r] !== wildSymbol) {
            if (syms[r] === scatterSymbol) {
                // Scatter breaks a line win at position 0
                if (r === 0) return { pay: 0, hasWild: false };
            }
            leadSymbol = syms[r];
            allWild = false;
            break;
        }
    }

    // Count consecutive matches from left
    let matchLen = 0;
    if (allWild) {
        matchLen = numReels;
        leadSymbol = wildSymbol;
        for (let r = 0; r < numReels; r++) {
            if (syms[r] !== wildSymbol) {
                matchLen = r;
                break;
            }
        }
        if (matchLen >= 3) {
            const wildEntry = gameData.paytable.find(e => e.symbol === wildSymbol);
            const pay = (wildEntry && wildEntry.pays[matchLen]) ? wildEntry.pays[matchLen] : 0;
            return { pay, hasWild: false }; // Pure wild wins don't get extra multiplier
        }
        return { pay: 0, hasWild: false };
    }

    // leadSymbol is the first non-wild symbol
    matchLen = 0;
    let hasWild = false;
    for (let r = 0; r < numReels; r++) {
        if (syms[r] === leadSymbol || syms[r] === wildSymbol) {
            if (syms[r] === wildSymbol) hasWild = true;
            matchLen++;
        } else {
            break;
        }
    }

    if (matchLen < 3) return { pay: 0, hasWild: false };

    // Find pay for this symbol at this length
    const entry = gameData.paytable.find(e => e.symbol === leadSymbol);
    if (!entry || !entry.pays[matchLen]) return { pay: 0, hasWild: false };

    // Also check if pure-wild length is longer/better
    let wildLen = 0;
    for (let r = 0; r < numReels; r++) {
        if (syms[r] === wildSymbol) wildLen++;
        else break;
    }
    if (wildLen >= 3) {
        const wildEntry = gameData.paytable.find(e => e.symbol === wildSymbol);
        if (wildEntry && wildEntry.pays[wildLen] && wildEntry.pays[wildLen] > entry.pays[matchLen]) {
            return { pay: wildEntry.pays[wildLen], hasWild: false }; // Pure wild win
        }
    }

    return { pay: entry.pays[matchLen], hasWild };
}

function displayWinDistribution(bands, bandCounts, totalSamples, maxWinSeen) {
    const total = totalSamples;
    const maxCount = Math.max(...bandCounts);

    let html = `<p style="color: #aaa; margin-bottom: 12px; font-size: 0.85em;">Based on ${total.toLocaleString()} random samples.</p>`;

    html += `<table class="win-dist-table" style="width: 100%;"><tr>
        <th>Win Range</th>
        <th>Spins</th>
        <th>Probability</th>
        <th>Frequency</th>
        <th style="width: 40%;">Distribution</th>
    </tr>`;

    for (let b = 0; b < bands.length; b++) {
        const count = bandCounts[b];
        const pct = (count / total) * 100;
        const freq = count > 0 ? (total / count) : 0;
        const barWidth = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;

        const barColor = b === 0 ? 'background: #444;' :
            b <= 2 ? 'background: linear-gradient(90deg, #00d4ff, #0088aa);' :
            b <= 4 ? 'background: linear-gradient(90deg, #00aa55, #00d4ff);' :
            b <= 6 ? 'background: linear-gradient(90deg, #ffaa00, #ff6600);' :
            'background: linear-gradient(90deg, #ff4444, #ff0066);';

        html += `<tr>
            <td class="range-label">${bands[b].label}</td>
            <td>${count.toLocaleString()}</td>
            <td class="pct-cell">${pct.toFixed(4)}%</td>
            <td>${count > 0 ? '1 in ' + freq.toFixed(1) : 'N/A'}</td>
            <td><span class="win-dist-bar" style="width: ${barWidth}%; ${barColor}"></span></td>
        </tr>`;
    }

    html += '</table>';

    // Summary stats
    const winningSpins = total - bandCounts[0];
    const winPct = (winningSpins / total) * 100;
    html += `<div style="margin-top: 20px; padding: 15px; background: #0f3460; border-radius: 8px;">
        <h4 style="color: #00d4ff; margin-bottom: 8px;">Summary</h4>
        <p>Total spins sampled: <strong>${total.toLocaleString()}</strong></p>
        <p>Winning spins: <strong>${winningSpins.toLocaleString()}</strong> (${winPct.toFixed(2)}%)</p>
        <p>Non-winning spins: <strong>${bandCounts[0].toLocaleString()}</strong> (${((bandCounts[0] / total) * 100).toFixed(2)}%)</p>
        <p>Largest win seen: <strong style="color: #ffaa00;">${maxWinSeen !== undefined ? maxWinSeen.toFixed(2) : '0.00'}</strong></p>
    </div>`;

    document.getElementById('winDistTable').innerHTML = html;
}

// ============ EXPORT TO EXCEL ============
document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);

function exportToExcel() {
    const config = getConfig();
    const wb = XLSX.utils.book_new();

    // --- Sheet 1: Summary (Weighted across all sets) ---
    const totalWeight = gameData.reelSets.reduce((sum, rs) => sum + rs.weight, 0);
    let weightedRtp = 0;
    let weightedHitFreq = 0;

    const perSetSummary = [];
    for (let setIdx = 0; setIdx < gameData.reelSets.length; setIdx++) {
        const reelSet = gameData.reelSets[setIdx];
        if (!reelSet.reelStrips || reelSet.reelStrips.length === 0 || reelSet.reelStrips[0].length === 0) {
            perSetSummary.push({ name: reelSet.name, weight: reelSet.weight, rtp: 0, hitFreq: 0 });
            continue;
        }
        const rl = reelSet.reelStrips.map(r => r.length);
        const tc = rl.reduce((a, b) => a * b, 1);
        const wf = totalWeight > 0 ? reelSet.weight / totalWeight : 0;

        const savedStrips = gameData.reelStrips;
        gameData.reelStrips = reelSet.reelStrips;
        const res = calculateLineWins(config, rl, tc, reelSet.wildMultipliers, reelSet.expandingWilds);
        gameData.reelStrips = savedStrips;

        const setRtp = (res.totalPayout / tc) * 100;
        const hitPerLine = res.totalHits / (tc * config.numLines);
        const setHitFreq = (1 - Math.pow(1 - hitPerLine, config.numLines)) * 100;
        weightedRtp += setRtp * wf;
        weightedHitFreq += setHitFreq * wf;
        perSetSummary.push({ name: reelSet.name, weight: reelSet.weight, rtp: setRtp, hitFreq: setHitFreq, weightFraction: wf });
    }

    const summaryData = [
        ['PAR Sheet Evaluation Summary'],
        [],
        ['Configuration'],
        ['Number of Reels', config.numReels],
        ['Rows Visible', config.numRows],
        ['Win Lines', config.numLines],
        ['Wild Symbol', config.wildSymbol],
        ['Scatter Symbol', config.scatterSymbol],
        [],
        ['Weighted Results'],
        ['Total RTP', weightedRtp / 100],
        ['Hit Frequency', weightedHitFreq / 100],
        [],
        ['Per Reel Set Breakdown'],
        ['Reel Set', 'Weight', 'Weight %', 'RTP', 'Contribution'],
    ];
    for (const ps of perSetSummary) {
        const wPct = totalWeight > 0 ? (ps.weight / totalWeight) : 0;
        summaryData.push([ps.name, ps.weight, wPct, ps.rtp / 100, (ps.rtp * wPct) / 100]);
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['B11'] = { v: weightedRtp / 100, t: 'n', z: '0.0000%' };
    summarySheet['B12'] = { v: weightedHitFreq / 100, t: 'n', z: '0.0000%' };
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // --- Per Reel Set sheets ---
    for (let setIdx = 0; setIdx < gameData.reelSets.length; setIdx++) {
        const reelSet = gameData.reelSets[setIdx];
        if (!reelSet.reelStrips || reelSet.reelStrips.length === 0 || reelSet.reelStrips[0].length === 0) continue;

        const setName = reelSet.name.substring(0, 20); // Sheet name limit
        const rl = reelSet.reelStrips.map(r => r.length);
        const maxLen = Math.max(...rl);

        // Reel Strips sheet for this set
        const reelHeader = ['Stop'];
        for (let r = 0; r < config.numReels; r++) {
            reelHeader.push(`Reel ${r + 1}`);
        }
        const reelRows = [reelHeader];
        for (let i = 0; i < maxLen; i++) {
            const row = [i + 1];
            for (let r = 0; r < config.numReels; r++) {
                row.push(reelSet.reelStrips[r][i] || '');
            }
            reelRows.push(row);
        }

        const sheetSuffix = gameData.reelSets.length > 1 ? ` (${setName})` : '';
        const reelSheet = XLSX.utils.aoa_to_sheet(reelRows);
        XLSX.utils.book_append_sheet(wb, reelSheet, `Reel Strips${sheetSuffix}`.substring(0, 31));

        // Wild Multipliers for this set
        if (reelSet.wildMultipliers && reelSet.wildMultipliers.length > 0) {
            const wmRows = [['Wild Multiplier Configuration - ' + reelSet.name], [], ['Multiplier', 'Chance', 'Chance %']];
            for (const wm of reelSet.wildMultipliers) {
                wmRows.push([wm.multiplier, wm.chance, wm.chance * 100]);
            }
            const expected = reelSet.wildMultipliers.reduce((sum, wm) => sum + (wm.multiplier * wm.chance), 0);
            wmRows.push([]);
            wmRows.push(['Expected Multiplier', expected]);
            const wmSheet = XLSX.utils.aoa_to_sheet(wmRows);
            XLSX.utils.book_append_sheet(wb, wmSheet, `Wild Mult${sheetSuffix}`.substring(0, 31));
        }

        // --- Symbol Breakdown for this set ---
        const savedStripsForData = gameData.reelStrips;
        gameData.reelStrips = reelSet.reelStrips;

        const setTc = rl.reduce((a, b) => a * b, 1);
        const setResults = calculateLineWins(config, rl, setTc, reelSet.wildMultipliers, reelSet.expandingWilds);

        const symHeader = ['Symbol'];
        for (let len = 3; len <= config.numReels; len++) {
            symHeader.push(`${len}x Pay`, `${len}x Combos`, `${len}x Payout`);
        }
        symHeader.push('Total Payout', 'RTP Contribution');

        const symRows = [symHeader];
        for (const sym of setResults.symbolResults) {
            const sRow = [sym.symbol];
            for (let len = 3; len <= config.numReels; len++) {
                sRow.push(sym.pays[len] || 0);
                sRow.push(sym.combosPerLength[len] || 0);
                sRow.push(sym.payoutPerLength[len] || 0);
            }
            sRow.push(sym.totalPayout);
            sRow.push(sym.totalPayout / setTc);
            symRows.push(sRow);
        }
        // Totals row
        symRows.push([]);
        symRows.push(['TOTAL', '', '', '', '', '', '', '', '', setResults.totalPayout, setResults.totalPayout / setTc]);
        symRows.push([]);
        symRows.push(['Total Combinations', setTc]);
        symRows.push(['RTP (this set)', (setResults.totalPayout / setTc) * 100 + '%']);
        symRows.push(['Hit Frequency', '1 in ' + (setResults.totalHits > 0 ? (setTc * config.numLines / setResults.totalHits).toFixed(2) : 'N/A')]);

        const symSheet = XLSX.utils.aoa_to_sheet(symRows);
        XLSX.utils.book_append_sheet(wb, symSheet, `Data${sheetSuffix}`.substring(0, 31));

        // --- Reel Composition for this set ---
        const compHeader = ['Symbol'];
        for (let r = 0; r < config.numReels; r++) {
            compHeader.push(`Reel ${r + 1}`);
        }
        compHeader.push('Total');

        const compRows = [compHeader];
        const symbols = gameData.paytable.map(e => e.symbol);
        for (const sym of symbols) {
            const cRow = [sym];
            let symTotal = 0;
            for (let r = 0; r < config.numReels; r++) {
                const count = reelSet.reelStrips[r].filter(s => s === sym).length;
                cRow.push(count);
                symTotal += count;
            }
            cRow.push(symTotal);
            compRows.push(cRow);
        }
        // Totals row
        const totRow = ['TOTAL'];
        let grandTotal = 0;
        for (let r = 0; r < config.numReels; r++) {
            totRow.push(reelSet.reelStrips[r].length);
            grandTotal += reelSet.reelStrips[r].length;
        }
        totRow.push(grandTotal);
        compRows.push(totRow);

        const compSheet = XLSX.utils.aoa_to_sheet(compRows);
        XLSX.utils.book_append_sheet(wb, compSheet, `Composition${sheetSuffix}`.substring(0, 31));

        // --- Scatter Analysis for this set ---
        const setScatterResults = calculateScatterWins(config, rl, setTc);
        if (setScatterResults) {
            const scatHeader2 = ['Scatter Count', 'Combinations', 'Probability', 'Frequency (1 in X)', 'Award'];
            const scatRows2 = [scatHeader2];
            for (const sr of setScatterResults.scatterResults) {
                const freq = sr.probability > 0 ? (1 / sr.probability) : 0;
                scatRows2.push([`${sr.count} Scatters`, sr.combinations, sr.probability, freq, sr.payInfo]);
            }
            scatRows2.push([]);
            scatRows2.push(['Scatter Stops Per Reel']);
            scatRows2.push(['Reel', 'Scatter Stops', 'Total Stops', 'Probability']);
            for (let r = 0; r < config.numReels; r++) {
                const sc = setScatterResults.scatterCountsPerReel[r];
                const total = reelSet.reelStrips[r].length;
                scatRows2.push([`Reel ${r + 1}`, sc, total, sc / total]);
            }
            const scatSheet2 = XLSX.utils.aoa_to_sheet(scatRows2);
            XLSX.utils.book_append_sheet(wb, scatSheet2, `Scatter${sheetSuffix}`.substring(0, 31));
        }

        gameData.reelStrips = savedStripsForData;
    }

    // --- Paytable (shared) ---
    const payHeader = ['Symbol', 'SymbolID'];
    for (let len = 3; len <= config.numReels; len++) {
        payHeader.push(`${len}x`);
    }
    const payRows = [payHeader];
    for (const entry of gameData.paytable) {
        const row = [entry.symbol, entry.symbol];
        for (let len = 3; len <= config.numReels; len++) {
            row.push(entry.pays[len] !== undefined ? entry.pays[len] : 'N/A');
        }
        payRows.push(row);
    }
    const paySheet = XLSX.utils.aoa_to_sheet(payRows);
    XLSX.utils.book_append_sheet(wb, paySheet, 'Paytable');

    // --- Win Lines ---
    const wlHeader = ['Line #'];
    for (let r = 0; r < config.numReels; r++) {
        wlHeader.push(`Reel ${r + 1}`);
    }
    const wlRows = [wlHeader];
    for (let i = 0; i < gameData.winLines.length; i++) {
        wlRows.push([i + 1, ...gameData.winLines[i]]);
    }
    const wlSheet = XLSX.utils.aoa_to_sheet(wlRows);
    XLSX.utils.book_append_sheet(wb, wlSheet, 'Win Lines');

    // --- Feature Triggers ---
    const ftRows = [['Feature Triggers'], [], ['Reel Set', 'Enabled', 'Trigger Symbol', 'Trigger Count', 'Num Spins', 'Target Set Index', 'Global Multiplier']];
    for (let setIdx = 0; setIdx < gameData.reelSets.length; setIdx++) {
        const reelSet = gameData.reelSets[setIdx];
        const ft = reelSet.featureTrigger;
        if (ft && ft.enabled) {
            const targetIdx = (ft.reelBands && ft.reelBands.length > 0) ? ft.reelBands[0].setIndex : (ft.targetSetIndex || 0);
            ftRows.push([
                reelSet.name,
                true,
                ft.triggerSymbol || '',
                ft.triggerCount || 3,
                ft.numSpins || 10,
                targetIdx,
                ft.globalMultiplier || 1
            ]);
            // Add reel bands if multiple
            if (ft.reelBands && ft.reelBands.length > 1) {
                ftRows.push([]);
                ftRows.push(['Reel Bands for: ' + reelSet.name]);
                ftRows.push(['Set Index', 'Set Name', 'Weight']);
                for (const band of ft.reelBands) {
                    const bandName = gameData.reelSets[band.setIndex] ? gameData.reelSets[band.setIndex].name : 'Unknown';
                    ftRows.push([band.setIndex, bandName, band.weight]);
                }
            }
        } else {
            ftRows.push([reelSet.name, false, '', '', '', '', '']);
        }
    }
    const ftSheet = XLSX.utils.aoa_to_sheet(ftRows);
    XLSX.utils.book_append_sheet(wb, ftSheet, 'Feature Triggers');

    // Generate and download with incremented version number
    const fileName = getNextVersionFileName(currentFileName);
    XLSX.writeFile(wb, fileName);
}

function getNextVersionFileName(name) {
    if (!name) return 'PAR_v1.xlsx';

    const base = name.replace(/\.xlsx?$/i, '');

    // Check if it already ends with _vN
    const versionMatch = base.match(/^(.+)_v(\d+)$/);
    if (versionMatch) {
        const nextVersion = parseInt(versionMatch[2]) + 1;
        return `${versionMatch[1]}_v${nextVersion}.xlsx`;
    }

    // Strip _evaluation suffix if present from older exports
    const cleanBase = base.replace(/_evaluation$/, '');
    return `${cleanBase}_v2.xlsx`;
}
