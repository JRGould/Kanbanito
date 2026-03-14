#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { getKanbanitDir, getCardsDir } = require('../lib/cards');
const {
  readCard, readAllCards, createCard, updateCard, deleteCard,
} = require('../lib/cards');
const { readBoard, writeBoard, initBoard } = require('../lib/board');

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

const cwd = process.cwd();
const kanbanitDir = getKanbanitDir(cwd);
const cardsDir = getCardsDir(cwd);

function requireInit() {
  if (!fs.existsSync(kanbanitDir)) {
    die('Kanbanito not initialized here. Run: kanbanito init');
  }
}

function die(msg, code = 1) {
  console.error(`\x1b[31merror:\x1b[0m ${msg}`);
  process.exit(code);
}

function ok(msg) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function info(msg) {
  console.log(msg);
}

// Very minimal arg parser (no deps)
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else if (a.startsWith('-') && a.length === 2) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

// ──────────────────────────────────────────────────────────
// ASCII board renderer
// ──────────────────────────────────────────────────────────

const PRIORITY_COLORS = {
  high:   '\x1b[31m', // red
  medium: '\x1b[33m', // yellow
  low:    '\x1b[32m', // green
};
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const CYAN  = '\x1b[36m';

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

function renderAsciiBoard(board, cards) {
  const cols = board.columns;
  const colWidth = 22;
  const sep = '  ';

  // Header
  const boardTitle = `${BOLD}${board.name}${RESET}`;
  console.log('');
  console.log(`  📋  ${boardTitle}`);
  console.log('');

  // Column headers
  let headerLine = '';
  let underLine = '';
  for (const col of cols) {
    const count = cards.filter(c => c.column === col.id).length;
    const header = `${BOLD}${truncate(col.name.toUpperCase(), colWidth - 4)} ${DIM}(${count})${RESET}`;
    headerLine += header.padEnd(colWidth + BOLD.length + DIM.length + RESET.length * 2 + 4) + sep;
    underLine += '─'.repeat(colWidth) + sep;
  }
  console.log('  ' + headerLine);
  console.log('  ' + underLine);

  // Cards per column (up to 8 rows)
  const maxRows = 10;
  for (let row = 0; row < maxRows; row++) {
    let line = '';
    let hasContent = false;
    for (const col of cols) {
      const colCards = cards.filter(c => c.column === col.id);
      const card = colCards[row];
      if (card) {
        hasContent = true;
        const pc = PRIORITY_COLORS[card.priority] || '';
        const priorityMark = card.priority === 'high' ? '!' : card.priority === 'low' ? '·' : '•';
        const title = truncate(card.title, colWidth - 2);
        line += `${pc}${priorityMark}${RESET} ${truncate(title, colWidth - 3)}`.padEnd(colWidth + pc.length + RESET.length + 2) + sep;
      } else {
        line += ' '.repeat(colWidth) + sep;
      }
    }
    if (!hasContent) break;
    console.log('  ' + line);

    // ID line
    let idLine = '';
    for (const col of cols) {
      const colCards = cards.filter(c => c.column === col.id);
      const card = colCards[row];
      if (card) {
        idLine += `  ${DIM}${card.id}${RESET}`.padEnd(colWidth + DIM.length + RESET.length + 2) + sep;
      } else {
        idLine += ' '.repeat(colWidth) + sep;
      }
    }
    console.log('  ' + idLine);
    console.log('');
  }
}

// ──────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────

const COMMANDS = {

  // ── init ────────────────────────────────────────────────
  init(args) {
    const name = args._.join(' ') || args.name || 'Kanbanito';
    if (fs.existsSync(kanbanitDir)) {
      const board = readBoard(kanbanitDir);
      ok(`Already initialized: "${board.name}"`);
      return;
    }
    const board = initBoard(kanbanitDir, name);
    ok(`Initialized "${board.name}" board in .kanbanito/`);
    info(`  Columns: ${board.columns.map(c => c.name).join(' → ')}`);
    info('');
    info('  Add cards:  kanbanito add "My first task"');
    info('  View board: kanbanito board');
    info('  Web UI:     kanbanito serve');
  },

  // ── add ─────────────────────────────────────────────────
  add(args) {
    requireInit();
    const title = args._.join(' ') || args.title;
    if (!title) die('Usage: kanbanito add "Card title" [-c column] [-p priority] [-a assignee] [-t tag]');

    const card = createCard(cardsDir, {
      title,
      column:   args.c || args.column   || 'backlog',
      priority: args.p || args.priority || 'medium',
      assignee: args.a || args.assignee || '',
      tags:     args.t || args.tag ? [args.t || args.tag] : [],
      body:     args.body || '',
    });
    ok(`Created ${CYAN}${card.id}${RESET}: ${card.title}`);
    if (args.json) {
      console.log(JSON.stringify(card, null, 2));
    }
  },

  // ── list ────────────────────────────────────────────────
  list(args) {
    requireInit();
    const board = readBoard(kanbanitDir);
    let cards = readAllCards(cardsDir);

    const filterCol = args._.length > 0 ? args._[0] : (args.column || args.c || null);
    if (filterCol) {
      // Accept partial match or exact id
      const col = board.columns.find(
        c => c.id === filterCol || c.name.toLowerCase().startsWith(filterCol.toLowerCase())
      );
      if (!col) die(`Unknown column: ${filterCol}`);
      cards = cards.filter(c => c.column === col.id);
    }

    if (args.json) {
      console.log(JSON.stringify(cards, null, 2));
      return;
    }

    if (cards.length === 0) {
      info(filterCol ? `No cards in ${filterCol}.` : 'No cards yet. Try: kanbanito add "My task"');
      return;
    }

    // Group by column
    const grouped = {};
    for (const col of board.columns) grouped[col.id] = [];
    for (const card of cards) {
      if (!grouped[card.column]) grouped[card.column] = [];
      grouped[card.column].push(card);
    }

    for (const col of board.columns) {
      const colCards = grouped[col.id];
      if (!colCards || colCards.length === 0) continue;
      console.log(`\n${BOLD}${col.name}${RESET} ${DIM}(${colCards.length})${RESET}`);
      for (const card of colCards) {
        const pc = PRIORITY_COLORS[card.priority] || '';
        const assignee = card.assignee ? ` ${DIM}@${card.assignee}${RESET}` : '';
        const tags = Array.isArray(card.tags) && card.tags.length
          ? ` ${DIM}[${card.tags.join(', ')}]${RESET}` : '';
        console.log(`  ${pc}●${RESET} ${CYAN}${card.id}${RESET}  ${card.title}${assignee}${tags}`);
      }
    }
    console.log('');
  },

  // ── show ────────────────────────────────────────────────
  show(args) {
    requireInit();
    const id = args._[0];
    if (!id) die('Usage: kanbanito show <id>');
    const card = readCard(cardsDir, id);
    if (!card) die(`Card not found: ${id}`);

    if (args.json) {
      console.log(JSON.stringify(card, null, 2));
      return;
    }

    const pc = PRIORITY_COLORS[card.priority] || '';
    console.log('');
    console.log(`  ${BOLD}${card.title}${RESET}`);
    console.log(`  ${CYAN}${card.id}${RESET}  ·  ${pc}${card.priority || 'medium'}${RESET}  ·  ${card.column}`);
    if (card.assignee) console.log(`  Assignee: @${card.assignee}`);
    if (card.tags && card.tags.length) console.log(`  Tags: ${card.tags.join(', ')}`);
    console.log(`  Created: ${card.created || '—'}  Updated: ${card.updated || '—'}`);
    if (card.body) {
      console.log('');
      console.log(card.body.split('\n').map(l => '  ' + l).join('\n'));
    }
    console.log('');
  },

  // ── move ────────────────────────────────────────────────
  move(args) {
    requireInit();
    const [id, col] = args._;
    if (!id || !col) die('Usage: kanbanito move <id> <column>');

    const board = readBoard(kanbanitDir);
    const target = board.columns.find(
      c => c.id === col || c.name.toLowerCase().startsWith(col.toLowerCase())
    );
    if (!target) die(`Unknown column: ${col}\nAvailable: ${board.columns.map(c => c.id).join(', ')}`);

    const card = updateCard(cardsDir, id, { column: target.id });
    ok(`Moved ${CYAN}${id}${RESET} to ${BOLD}${target.name}${RESET}`);
  },

  // ── done ────────────────────────────────────────────────
  done(args) {
    requireInit();
    const id = args._[0];
    if (!id) die('Usage: kanbanito done <id>');
    const card = updateCard(cardsDir, id, { column: 'done' });
    ok(`Marked ${CYAN}${id}${RESET} as done: ${card.title}`);
  },

  // ── update ──────────────────────────────────────────────
  update(args) {
    requireInit();
    const id = args._[0];
    if (!id) die('Usage: kanbanito update <id> [--title x] [--priority x] [--assignee x] [--note x] [--body x]');

    const updates = {};
    if (args.title)    updates.title    = args.title;
    if (args.priority || args.p) updates.priority = args.priority || args.p;
    if (args.assignee || args.a) updates.assignee = args.assignee || args.a;
    if (args.column   || args.c) updates.column   = args.column   || args.c;
    if (args.note)     updates.note     = args.note;
    if (args.body)     updates.body     = args.body;
    if (args.tag || args.t) updates.tags = [args.tag || args.t];

    if (Object.keys(updates).length === 0) {
      die('Provide at least one update flag, e.g. --title "New title"');
    }

    const card = updateCard(cardsDir, id, updates);
    ok(`Updated ${CYAN}${id}${RESET}: ${card.title}`);
    if (args.json) console.log(JSON.stringify(card, null, 2));
  },

  // ── note ────────────────────────────────────────────────
  note(args) {
    requireInit();
    const id = args._[0];
    const text = args._.slice(1).join(' ') || args.text;
    if (!id || !text) die('Usage: kanbanito note <id> "Note text"');
    updateCard(cardsDir, id, { note: text });
    ok(`Note added to ${CYAN}${id}${RESET}`);
  },

  // ── delete ──────────────────────────────────────────────
  delete(args) {
    requireInit();
    const id = args._[0];
    if (!id) die('Usage: kanbanito delete <id>');
    const card = readCard(cardsDir, id);
    if (!card) die(`Card not found: ${id}`);

    if (!args.yes && !args.y) {
      // Just confirm via message since we can't prompt in agent context
      console.log(`About to delete: ${CYAN}${id}${RESET} "${card.title}"`);
      console.log('Re-run with --yes to confirm.');
      return;
    }
    deleteCard(cardsDir, id);
    ok(`Deleted ${CYAN}${id}${RESET}`);
  },

  // ── board ────────────────────────────────────────────────
  board(args) {
    requireInit();
    const board = readBoard(kanbanitDir);
    const cards = readAllCards(cardsDir);
    renderAsciiBoard(board, cards);
  },

  // ── serve ────────────────────────────────────────────────
  serve(args) {
    requireInit();
    const port = parseInt(args.port || args.p || '3000', 10);
    const { createServer } = require('../lib/server');
    const board = readBoard(kanbanitDir);
    const server = createServer(kanbanitDir, cardsDir, port);
    server.listen(port, '127.0.0.1', () => {
      console.log('');
      console.log(`  📋  ${BOLD}${board.name}${RESET}`);
      console.log(`  ${CYAN}http://localhost:${port}${RESET}`);
      console.log('');
      console.log('  Press Ctrl+C to stop.');
      console.log('');
      if (args.open || args.o) {
        const open = process.platform === 'darwin' ? 'open'
          : process.platform === 'win32' ? 'start' : 'xdg-open';
        require('child_process').exec(`${open} http://localhost:${port}`);
      }
    });
  },

  // ── export ───────────────────────────────────────────────
  export(args) {
    requireInit();
    const outFile = args._[0] || args.output || args.o || 'kanbanito.html';
    const { generateStaticHtml } = require('../lib/server');
    const board = readBoard(kanbanitDir);
    const cards = readAllCards(cardsDir);
    const html = generateStaticHtml(board, cards);
    fs.writeFileSync(path.resolve(cwd, outFile), html, 'utf8');
    ok(`Exported to ${outFile}`);
  },

  // ── columns ──────────────────────────────────────────────
  columns(args) {
    requireInit();
    const board = readBoard(kanbanitDir);
    if (args.json) {
      console.log(JSON.stringify(board.columns, null, 2));
      return;
    }
    for (const col of board.columns) {
      const count = readAllCards(cardsDir).filter(c => c.column === col.id).length;
      console.log(`  ${col.id.padEnd(14)} ${col.name.padEnd(16)} ${DIM}(${count} cards)${RESET}`);
    }
  },

  // ── help ─────────────────────────────────────────────────
  help() {
    console.log(`
  ${BOLD}kanbanito${RESET}  ${DIM}(alias: kb)${RESET}
  Lightweight local-first kanban board

  ${BOLD}USAGE${RESET}
    kanbanito <command> [options]

  ${BOLD}COMMANDS${RESET}
    ${CYAN}init [name]${RESET}                Initialize kanbanito in current directory
    ${CYAN}add "title"${RESET}                Add a new card
      -c, --column  <col>          Column (default: backlog)
      -p, --priority <p>           low | medium | high (default: medium)
      -a, --assignee <name>        Assign to someone
      -t, --tag <tag>              Add a tag
    ${CYAN}list [column]${RESET}              List cards (optionally filter by column)
      --json                       Output JSON
    ${CYAN}show <id>  ${RESET}               Show card details
      --json                       Output JSON
    ${CYAN}move <id> <column>${RESET}         Move a card to another column
    ${CYAN}done <id>${RESET}                  Mark a card as done
    ${CYAN}update <id> [flags]${RESET}        Update card fields
      --title, --priority, --assignee, --column, --tag, --note, --body
    ${CYAN}note <id> "text"${RESET}           Append a timestamped note to a card
    ${CYAN}delete <id> --yes${RESET}          Delete a card (--yes to confirm)
    ${CYAN}board${RESET}                      Print ASCII kanban board
    ${CYAN}columns${RESET}                    List board columns
    ${CYAN}serve [--port 3000]${RESET}        Start the web UI (live, with drag-and-drop)
      --open                       Open in default browser
    ${CYAN}export [file]${RESET}              Export a static HTML snapshot
      (default: kanbanito.html)
    ${CYAN}help${RESET}                       Show this help

  ${BOLD}EXAMPLES${RESET}
    kanbanito init "My Project"
    kanbanito add "Implement login" -c todo -p high
    kanbanito move kb-0001 in-progress
    kanbanito note kb-0001 "Auth flow done, working on refresh tokens"
    kanbanito done kb-0001
    kanbanito board
    kanbanito serve --open
`);
  },
};

// ──────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────

const [,, cmd, ...rest] = process.argv;

if (!cmd || cmd === '--help' || cmd === '-h') {
  COMMANDS.help();
  process.exit(0);
}

if (!COMMANDS[cmd]) {
  die(`Unknown command: ${cmd}\nRun 'kanbanito help' for usage.`);
}

const args = parseArgs(rest);

try {
  COMMANDS[cmd](args);
} catch (e) {
  die(e.message);
}
