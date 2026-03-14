'use strict';

const fs = require('fs');
const path = require('path');

// ---------- Frontmatter parsing (zero-dep) ----------

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();

    if (val.startsWith('[') && val.endsWith(']')) {
      // Inline array: [a, b, c]
      meta[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    } else if (val === 'true') {
      meta[key] = true;
    } else if (val === 'false') {
      meta[key] = false;
    } else if (val !== '' && !isNaN(val)) {
      meta[key] = Number(val);
    } else {
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      meta[key] = val;
    }
  }
  return { meta, body: match[2].trim() };
}

function serializeFrontmatter(meta, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(meta)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.join(', ')}]`);
    } else if (typeof v === 'string' && (v.includes(':') || v.includes('"') || v.includes('#'))) {
      lines.push(`${k}: "${v.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---');
  if (body) lines.push('', body);
  return lines.join('\n') + '\n';
}

// ---------- Paths ----------

function getKanbanitDir(cwd) {
  return path.join(cwd || process.cwd(), '.kanbanito');
}

function getCardsDir(cwd) {
  return path.join(getKanbanitDir(cwd), 'cards');
}

function cardPath(cardsDir, id) {
  return path.join(cardsDir, `${id}.md`);
}

// ---------- ID generation ----------

function generateId(cardsDir) {
  const ids = listCardIds(cardsDir);
  const nums = ids
    .map(id => parseInt(id.replace('kb-', ''), 10))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `kb-${String(next).padStart(4, '0')}`;
}

// ---------- CRUD ----------

function listCardIds(cardsDir) {
  if (!fs.existsSync(cardsDir)) return [];
  return fs.readdirSync(cardsDir)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep')
    .map(f => f.slice(0, -3))
    .sort();
}

function readCard(cardsDir, id) {
  const p = cardPath(cardsDir, id);
  if (!fs.existsSync(p)) return null;
  const { meta, body } = parseFrontmatter(fs.readFileSync(p, 'utf8'));
  return { ...meta, id, body };
}

function readAllCards(cardsDir) {
  return listCardIds(cardsDir)
    .map(id => readCard(cardsDir, id))
    .filter(Boolean);
}

function writeCard(cardsDir, card) {
  const { id, body, ...meta } = card;
  const content = serializeFrontmatter({ id, ...meta }, body || '');
  fs.writeFileSync(cardPath(cardsDir, id), content, 'utf8');
}

function createCard(cardsDir, data) {
  if (!fs.existsSync(cardsDir)) {
    throw new Error('Kanbanito not initialized. Run: kanbanito init');
  }
  const id = generateId(cardsDir);
  const now = new Date().toISOString();
  const card = {
    id,
    title: data.title || 'Untitled',
    column: data.column || 'backlog',
    priority: data.priority || 'medium',
    assignee: data.assignee || '',
    tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []),
    created: now,
    updated: now,
    body: data.body || data.description || '',
  };
  writeCard(cardsDir, card);
  return card;
}

function updateCard(cardsDir, id, updates) {
  const card = readCard(cardsDir, id);
  if (!card) throw new Error(`Card not found: ${id}`);

  const { body: currentBody, ...currentMeta } = card;
  const { body: newBody, ...metaUpdates } = updates;

  // Append a note if provided
  let finalBody = currentBody;
  if (updates.note) {
    const ts = new Date().toLocaleString();
    finalBody = (finalBody ? finalBody + '\n\n' : '') + `**Note** _(${ts})_: ${updates.note}`;
    delete metaUpdates.note;
  } else if (newBody !== undefined) {
    finalBody = newBody;
  }

  const updated = {
    ...currentMeta,
    ...metaUpdates,
    id,
    updated: new Date().toISOString(),
    body: finalBody,
  };
  writeCard(cardsDir, updated);
  return updated;
}

function deleteCard(cardsDir, id) {
  const p = cardPath(cardsDir, id);
  if (!fs.existsSync(p)) throw new Error(`Card not found: ${id}`);
  fs.unlinkSync(p);
}

module.exports = {
  getKanbanitDir,
  getCardsDir,
  listCardIds,
  readCard,
  readAllCards,
  writeCard,
  createCard,
  updateCard,
  deleteCard,
};
