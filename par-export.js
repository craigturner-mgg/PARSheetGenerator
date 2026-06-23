/**
 * PAR Sheet Export using ExcelJS
 * Generates styled Excel workbooks with combined reel set tabs.
 */

// Style constants
const STYLE = {
    headerFont: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    headerFill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a1a' } },
    orangeFont: { bold: true, color: { argb: 'FFFF8C00' }, size: 11 },
    orangeFill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2a1500' } },
    dataFont: { color: { argb: 'FFE0E0E0' }, size: 10 },
    border: {
        top: { style: 'thin', color: { argb: 'FF333333' } },
        bottom: { style: 'thin', color: { argb: 'FF333333' } },
        left: { style: 'thin', color: { argb: 'FF333333' } },
        right: { style: 'thin', color: { argb: 'FF333333' } }
    },
    darkFill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } },
    altFill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0a0a0a' } }
};

function styleHeader(row) {
    row.eachCell(cell => {
        cell.font = STYLE.headerFont;
        cell.fill = STYLE.orangeFill;
        cell.border = STYLE.border;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    row.height = 20;
}

function styleDataRow(row, alt) {
    row.eachCell(cell => {
        cell.font = STYLE.dataFont;
        cell.fill = alt ? STYLE.altFill : STYLE.darkFill;
        cell.border = STYLE.border;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
}

async function exportToExcelJS() {
    try {
        const config = getConfig();
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Mad Goose Games PAR Generator';

        const totalWeight = gameData.reelSets.reduce((sum, rs) => sum + rs.weight, 0);

        // === SUMMARY SHEET ===
        const sumWs = wb.addWorksheet('Summary');
        sumWs.columns = [{ width: 25 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }];

        sumWs.addRow(['PAR Sheet Summary']).font = { bold: true, size: 14, color: { argb: 'FFFF8C00' } };
        sumWs.addRow([]);
        sumWs.addRow(['Configuration']);
        sumWs.addRow(['Reels', config.numReels]);
        sumWs.addRow(['Rows', config.numRows]);
        sumWs.addRow(['Win Lines', config.numLines]);
        sumWs.addRow(['Wild Symbols', config.wildSymbols.join(', ')]);
        sumWs.addRow(['Scatter Symbol', config.scatterSymbol]);
        sumWs.addRow([]);

        // Per set summary
        const sumHeader = sumWs.addRow(['Reel Set', 'Weight', 'Weight %', 'RTP', 'Contribution']);
        styleHeader(sumHeader);

        for (let si = 0; si < gameData.reelSets.length; si++) {
            const rs = gameData.reelSets[si];
            const wf = totalWeight > 0 ? rs.weight / totalWeight : 0;
            let setRtp = 0;
            if (rs.reelStrips && rs.reelStrips.length > 0 && rs.reelStrips[0].length > 0) {
                const rl = rs.reelStrips.map(r => r.length);
                const tc = rl.reduce((a, b) => a * b, 1);
                const saved = gameData.reelStrips;
                gameData.reelStrips = rs.reelStrips;
                const res = calculateLineWins(config, rl, tc, rs.wildMultipliers, rs.expandingWilds);
                gameData.reelStrips = saved;
                setRtp = (res.totalPayout / tc) * 100;
            }
            const row = sumWs.addRow([rs.name, rs.weight, (wf * 100).toFixed(1) + '%', setRtp.toFixed(4) + '%', (setRtp * wf).toFixed(4) + '%']);
            styleDataRow(row, si % 2 === 1);
        }

        // === PER REEL SET TABS (combined data) ===
        for (let si = 0; si < gameData.reelSets.length; si++) {
            const rs = gameData.reelSets[si];
            if (!rs.reelStrips || rs.reelStrips.length === 0 || rs.reelStrips[0].length === 0) continue;

            const setName = rs.name.substring(0, 20);
            const sheetSuffix = gameData.reelSets.length > 1 ? ' (' + setName + ')' : '';
            const wsName = ('Reel Strips' + sheetSuffix).substring(0, 31);
            const ws = wb.addWorksheet(wsName);

            const rl = rs.reelStrips.map(r => r.length);
            const maxLen = Math.max(...rl);
            const tc = rl.reduce((a, b) => a * b, 1);

            // Set column widths
            const cols = [{ width: 8 }];
            for (let r = 0; r < config.numReels; r++) cols.push({ width: 10 });
            cols.push({ width: 5 }); // spacer
            for (let r = 0; r < config.numReels; r++) cols.push({ width: 8 });
            cols.push({ width: 8 }); // total
            ws.columns = cols;

            // --- REEL STRIPS (header on row 1 for importer compatibility) ---
            const stripHeader = ['Stop'];
            for (let r = 0; r < config.numReels; r++) stripHeader.push('Reel ' + (r + 1));
            const sh = ws.addRow(stripHeader);
            styleHeader(sh);

            for (let i = 0; i < maxLen; i++) {
                const row = [i + 1];
                for (let r = 0; r < config.numReels; r++) {
                    row.push(rs.reelStrips[r][i] || '');
                }
                const dr = ws.addRow(row);
                styleDataRow(dr, i % 2 === 1);
            }

            // --- SPACER ---
            ws.addRow([]);
            ws.addRow([]);

            // --- SYMBOL COMPOSITION ---
            const compTitle = ws.addRow(['Symbol Composition']);
            compTitle.font = { bold: true, size: 12, color: { argb: 'FFFF8C00' } };

            const compHeader = ['Symbol'];
            for (let r = 0; r < config.numReels; r++) compHeader.push('R' + (r + 1));
            compHeader.push('Total');
            const ch = ws.addRow(compHeader);
            styleHeader(ch);

            const symbols = gameData.paytable.map(e => e.symbol);
            for (let si2 = 0; si2 < symbols.length; si2++) {
                const sym = symbols[si2];
                const row = [sym];
                let symTotal = 0;
                for (let r = 0; r < config.numReels; r++) {
                    const count = rs.reelStrips[r].filter(s => s === sym).length;
                    row.push(count);
                    symTotal += count;
                }
                row.push(symTotal);
                const dr = ws.addRow(row);
                styleDataRow(dr, si2 % 2 === 1);
            }

            // Totals
            const totRow = ['TOTAL'];
            let grand = 0;
            for (let r = 0; r < config.numReels; r++) {
                totRow.push(rs.reelStrips[r].length);
                grand += rs.reelStrips[r].length;
            }
            totRow.push(grand);
            const tr = ws.addRow(totRow);
            tr.font = { bold: true, color: { argb: 'FFFF8C00' } };

            // --- SPACER ---
            ws.addRow([]);
            ws.addRow([]);

            // --- SYMBOL BREAKDOWN ---
            const saved = gameData.reelStrips;
            gameData.reelStrips = rs.reelStrips;
            const results = calculateLineWins(config, rl, tc, rs.wildMultipliers, rs.expandingWilds);
            gameData.reelStrips = saved;

            const brkTitle = ws.addRow(['Symbol Breakdown']);
            brkTitle.font = { bold: true, size: 12, color: { argb: 'FFFF8C00' } };

            const brkHeader = ['Symbol'];
            for (let len = 3; len <= config.numReels; len++) {
                brkHeader.push(len + 'OAK Pay', len + 'OAK Combos', len + 'OAK Payout');
            }
            brkHeader.push('Total Payout', 'RTP %');
            const bh = ws.addRow(brkHeader);
            styleHeader(bh);

            for (let si2 = 0; si2 < results.symbolResults.length; si2++) {
                const sym = results.symbolResults[si2];
                const row = [sym.symbol];
                for (let len = 3; len <= config.numReels; len++) {
                    row.push(sym.pays[len] || 0);
                    row.push(sym.combosPerLength[len] || 0);
                    row.push(sym.payoutPerLength[len] || 0);
                }
                row.push(sym.totalPayout);
                row.push(((sym.totalPayout / tc) * 100).toFixed(4) + '%');
                const dr = ws.addRow(row);
                styleDataRow(dr, si2 % 2 === 1);
            }

            // RTP summary
            ws.addRow([]);
            ws.addRow(['Total Combinations', tc]);
            ws.addRow(['RTP (this set)', ((results.totalPayout / tc) * 100).toFixed(4) + '%']);
        }

        // === PAYTABLE SHEET ===
        const payWs = wb.addWorksheet('Paytable');
        const payHeader = ['Symbol', 'SymbolID'];
        for (let len = 3; len <= config.numReels; len++) payHeader.push(len + 'x');
        payHeader.push('isCoin', 'isCollector', 'CoinValues', 'isWild');
        const ph = payWs.addRow(payHeader);
        styleHeader(ph);

        const currentWilds = config.wildSymbols || [];
        for (let i = 0; i < gameData.paytable.length; i++) {
            const entry = gameData.paytable[i];
            const row = [entry.symbol, entry.symbol];
            for (let len = 3; len <= config.numReels; len++) {
                row.push(entry.pays[len] !== undefined ? entry.pays[len] : 'N/A');
            }
            row.push(entry.isCoin ? 'TRUE' : 'FALSE');
            row.push(entry.isCollector ? 'TRUE' : 'FALSE');
            row.push(entry.isCoin && entry.coinValues ? JSON.stringify(entry.coinValues) : '');
            row.push(currentWilds.includes(entry.symbol) ? 'TRUE' : 'FALSE');
            const dr = payWs.addRow(row);
            styleDataRow(dr, i % 2 === 1);
        }
        payWs.columns = [{ width: 12 }, { width: 12 }, ...Array(config.numReels - 2).fill({ width: 10 }), { width: 8 }, { width: 10 }, { width: 40 }, { width: 8 }];

        // === WIN LINES SHEET ===
        const wlWs = wb.addWorksheet('Win Lines');
        const wlHeader = ['Line #'];
        for (let r = 0; r < config.numReels; r++) wlHeader.push('Reel ' + (r + 1));
        const wlh = wlWs.addRow(wlHeader);
        styleHeader(wlh);
        for (let i = 0; i < gameData.winLines.length; i++) {
            const dr = wlWs.addRow([i + 1, ...gameData.winLines[i]]);
            styleDataRow(dr, i % 2 === 1);
        }

        // === FEATURE TRIGGERS SHEET ===
        const ftWs = wb.addWorksheet('Feature Triggers');
        const ftH = ftWs.addRow(['Reel Set', 'Enabled', 'Trigger Symbol', 'Trigger Count', 'Num Spins', 'Target Set Index', 'Global Multiplier', 'Tiers (JSON)', 'Retrigger Enabled', 'Retrigger Scatters', 'Retrigger Spins']);
        styleHeader(ftH);
        for (let si = 0; si < gameData.reelSets.length; si++) {
            const rs = gameData.reelSets[si];
            const ft = rs.featureTrigger;
            if (ft && ft.enabled) {
                const targetIdx = (ft.tiers && ft.tiers[0] && ft.tiers[0].bands && ft.tiers[0].bands[0]) ? ft.tiers[0].bands[0].setIndex : (ft.targetSetIndex || 0);
                const tiersJson = ft.tiers ? JSON.stringify(ft.tiers) : '';
                const dr = ftWs.addRow([
                    rs.name, true, ft.triggerSymbol || '', ft.triggerCount || 3, ft.numSpins || 10,
                    targetIdx, ft.globalMultiplier || 1, tiersJson,
                    ft.retriggerEnabled || false, ft.retriggerScatters || 3, ft.retriggerSpins || 5
                ]);
                styleDataRow(dr, si % 2 === 1);
            } else {
                const dr = ftWs.addRow([rs.name, false, '', '', '', '', '', '', '', '', '']);
                styleDataRow(dr, si % 2 === 1);
            }
        }

        // === LOCK & SPIN SHEET ===
        const lasWs = wb.addWorksheet('Lock & Spin');
        const lasH = lasWs.addRow(['Reel Set', 'Enabled', 'Trigger Symbol', 'Trigger Count', 'Lives', 'Pay Mode', 'Respin Weights', 'Coin Values']);
        styleHeader(lasH);
        for (let si = 0; si < gameData.reelSets.length; si++) {
            const rs = gameData.reelSets[si];
            const las = rs.lockAndSpin;
            if (las && las.enabled) {
                const dr = lasWs.addRow([rs.name, true, las.triggerSymbol || '', las.triggerCount || 6, las.lives || 3, las.payMode || 'coins', JSON.stringify(las.respinWeights || []), JSON.stringify(las.coinValues || [])]);
                styleDataRow(dr, si % 2 === 1);
            } else {
                const dr = lasWs.addRow([rs.name, false, '', '', '', '', '', '']);
                styleDataRow(dr, si % 2 === 1);
            }
        }

        // === SAVE ===
        const suggestedName = getNextVersionFileName(currentFileName);
        const fileName = prompt('Save as:', suggestedName);
        if (!fileName) return;
        currentFileName = fileName;
        const finalName = fileName.endsWith('.xlsx') ? fileName : fileName + '.xlsx';

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalName;
        a.click();
        URL.revokeObjectURL(url);

    } catch(e) {
        console.error('Export error:', e);
        alert('Export error: ' + e.message);
    }
}
