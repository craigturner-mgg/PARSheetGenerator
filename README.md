# PAR Sheet Generator

A browser-based tool for generating and analysing Probability Analysis Reports (PAR) for reel-based slot games.

## Architecture

| File | Purpose |
|------|---------|
| `index.html` | UI layout, wizard, reel sets panel, view navigation |
| `par-evaluator.js` | Core engine: RTP calculation, line wins, scatter wins, free games, L&S, import/export parsing |
| `par-export.js` | Excel export using ExcelJS (styled, per-set data tabs) |
| `reel-editor.js` | Visual reel strip editor with drag-drop, selection, keyboard nav |

## Features

### Core
- Step-by-step wizard (reels, rows, win lines, paytable)
- Lines and Ways win evaluation
- Multiple reel sets with weighted RTP
- Per-set Edit and Data views
- Excel export/import (full round-trip)

### Symbol Types
- **Standard** — x-of-a-kind line pays
- **Wild** — substitutes for other symbols (multiple wilds supported)
- **Scatter/Trigger** — triggers free games feature
- **Coin** — weighted random values, collected by Collectors
- **Collector** — collects visible coin values with weighted multipliers

### Features & Mechanics
- **Free Spins** — scatter-triggered with tiered awards, per-tier reel bands, retriggers
- **Lock & Spin** — coin-triggered hold & spin with configurable lives, respin weights, collectors
- **Modifiers** — per-reel-set: Multiplier Wilds, Expanding Wilds, Custom Coin Values

### Analysis
- RTP breakdown (Line Wins / Free Games / Coin-Collector / Lock & Spin)
- Hit frequency (any win)
- Feature hit rate
- Win distribution (10M sample simulation)
- Lock & Spin data (trigger rate, avg win, end-state distribution)
- Per-reel-set symbol composition and breakdown

## Usage

Open `index.html` in a browser. No server required.

- **NEW** — Step through the wizard to create a PAR from scratch
- **UPLOAD** — Import a previously exported Excel PAR file
- **Export** — Saves styled Excel with all data for documentation

## Forking for Game-Specific Mechanics

This is a **base template**. For games with mechanics like walking wilds, cascading wins, mystery symbols, etc.:

1. Fork/copy this project
2. Add game-specific simulation logic
3. Keep the base import/export/UI structure

## Dependencies (CDN)

- [SheetJS](https://sheetjs.com/) — Excel import
- [ExcelJS](https://github.com/exceljs/exceljs) — Styled Excel export
