'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { readBoard }                                   = require('./board');
const { readAllCards, readCard, createCard, updateCard, deleteCard } = require('./cards');

// ── SSE broadcast ────────────────────────────────────────
const clients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); }
    catch { clients.delete(res); }
  }
}

// ── File watcher (debounced) ─────────────────────────────
function watchDir(dir, cb) {
  if (!fs.existsSync(dir)) return;
  let timer;
  fs.watch(dir, { recursive: false }, (ev, filename) => {
    if (!filename || !filename.endsWith('.md')) return;
    clearTimeout(timer);
    timer = setTimeout(cb, 120);
  });
}

// ── Route helpers ────────────────────────────────────────
function json(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', chunk => { buf += chunk; if (buf.length > 1e6) reject(new Error('Body too large')); });
    req.on('end', () => {
      try { resolve(JSON.parse(buf || '{}')); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ── Build the HTML once ──────────────────────────────────
const UI_HTML = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');

// ── Server factory ───────────────────────────────────────
function createServer(kanbanitDir, cardsDir, port = 3000) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const { pathname } = url;
    const method = req.method.toUpperCase();

    // CORS
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      // ── SSE ──────────────────────────────────────────
      if (pathname === '/api/events' && method === 'GET') {
        res.writeHead(200, {
          'Content-Type':  'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write(':ok\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      // ── Board config ──────────────────────────────────
      if (pathname === '/api/board' && method === 'GET') {
        return json(res, readBoard(kanbanitDir));
      }

      // ── Cards list ────────────────────────────────────
      if (pathname === '/api/cards' && method === 'GET') {
        const col = url.searchParams.get('column');
        let cards = readAllCards(cardsDir);
        if (col) cards = cards.filter(c => c.column === col);
        return json(res, cards);
      }

      // ── Create card ───────────────────────────────────
      if (pathname === '/api/cards' && method === 'POST') {
        const body = await readBody(req);
        const card = createCard(cardsDir, body);
        broadcast('card:created', card);
        return json(res, card, 201);
      }

      // ── Single card ───────────────────────────────────
      const cardMatch = pathname.match(/^\/api\/cards\/([^/]+)$/);
      if (cardMatch) {
        const id = cardMatch[1];

        if (method === 'GET') {
          const card = readCard(cardsDir, id);
          if (!card) return json(res, { error: 'Not found' }, 404);
          return json(res, card);
        }

        if (method === 'PUT') {
          const updates = await readBody(req);
          const card = updateCard(cardsDir, id, updates);
          broadcast('card:updated', card);
          return json(res, card);
        }

        if (method === 'DELETE') {
          deleteCard(cardsDir, id);
          broadcast('card:deleted', { id });
          res.writeHead(204); res.end();
          return;
        }
      }

      // ── UI ────────────────────────────────────────────
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(UI_HTML);
        return;
      }

      // ── 404 ───────────────────────────────────────────
      json(res, { error: 'Not found' }, 404);

    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  });

  // Watch cards dir and broadcast refresh to all clients
  watchDir(cardsDir, () => {
    const cards = readAllCards(cardsDir);
    broadcast('board:refresh', { cards });
  });

  return server;
}

// ── Static HTML export ───────────────────────────────────
function generateStaticHtml(board, cards) {
  const data = JSON.stringify({ board, cards });
  // Inject the data as a script before the closing </body>
  return UI_HTML.replace(
    '</body>',
    `<script>window.__KANBANITO__ = ${data};</script>\n</body>`
  );
}

module.exports = { createServer, generateStaticHtml };
