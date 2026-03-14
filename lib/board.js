'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_COLUMNS = [
  { id: 'backlog',     name: 'Backlog',      color: '#6B7280' },
  { id: 'todo',        name: 'Todo',         color: '#3B82F6' },
  { id: 'in-progress', name: 'In Progress',  color: '#F59E0B' },
  { id: 'review',      name: 'Review',       color: '#8B5CF6' },
  { id: 'done',        name: 'Done',         color: '#10B981' },
];

function getBoardPath(kanbanitDir) {
  return path.join(kanbanitDir, 'board.json');
}

function readBoard(kanbanitDir) {
  const p = getBoardPath(kanbanitDir);
  if (!fs.existsSync(p)) {
    return { name: 'Kanbanito', columns: DEFAULT_COLUMNS };
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeBoard(kanbanitDir, board) {
  fs.writeFileSync(getBoardPath(kanbanitDir), JSON.stringify(board, null, 2) + '\n', 'utf8');
}

function initBoard(kanbanitDir, name) {
  if (!fs.existsSync(kanbanitDir)) fs.mkdirSync(kanbanitDir, { recursive: true });
  const cardsDir = path.join(kanbanitDir, 'cards');
  if (!fs.existsSync(cardsDir)) fs.mkdirSync(cardsDir, { recursive: true });

  const board = {
    name: name || 'Kanbanito',
    columns: DEFAULT_COLUMNS,
    created: new Date().toISOString(),
  };
  writeBoard(kanbanitDir, board);

  // Write .gitkeep so the cards dir is tracked
  const gitkeep = path.join(cardsDir, '.gitkeep');
  if (!fs.existsSync(gitkeep)) fs.writeFileSync(gitkeep, '', 'utf8');

  return board;
}

module.exports = { readBoard, writeBoard, initBoard, DEFAULT_COLUMNS };
