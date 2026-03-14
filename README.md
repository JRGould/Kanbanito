# 📋 Kanbanito

> A lightweight, local-first kanban board that lives inside your project folder.

Kanbanito is designed to be equally comfortable for **humans** and **AI agents**.
Drop it into any project, spin up a beautiful web UI with one command, or drive it entirely from the terminal — no cloud, no accounts, no servers required to get started.

---

## Features

- **100% local & file-based** — cards are plain markdown files in `.kanbanito/cards/`
- **Zero external dependencies** — pure Node.js built-ins only
- **Beautiful drag-and-drop web UI** with live updates (Server-Sent Events)
- **Full-featured CLI** (`kanbanito` / `kb`) for humans and AI agents
- **Agent-friendly** — structured JSON output, predictable file format, simple API
- **Static HTML export** — share a read-only snapshot with no server
- **Git-friendly** — every card is a markdown file; diffs are human-readable

---

## Quick Start

```bash
# Run directly without installing (requires Node ≥ 16)
npx kanbanito init "My Project"
npx kanbanito add "First task" -c todo -p high
npx kanbanito board
npx kanbanito serve --open
```

Or install globally:

```bash
npm install -g kanbanito
kanbanito init "My Project"
kb serve --open          # `kb` is a short alias
```

---

## Installation

**Global (recommended for direct use):**
```bash
npm install -g kanbanito
```

**Inside a project (run via npx):**
```bash
# No install needed — npx downloads and runs it:
npx kanbanito init
```

**Local project dependency (e.g. for scripts in package.json):**
```bash
npm install --save-dev kanbanito
```

---

## CLI Reference

```
kanbanito <command> [options]
kb        <command> [options]   # short alias
```

### `init [name]`
Initialize kanbanito in the current directory.
Creates `.kanbanito/board.json` and `.kanbanito/cards/`.

```bash
kanbanito init "Acme Backend"
```

### `add "title" [options]`
Create a new card.

| Option | Short | Default | Description |
|---|---|---|---|
| `--column` | `-c` | `backlog` | Target column |
| `--priority` | `-p` | `medium` | `low` \| `medium` \| `high` |
| `--assignee` | `-a` | | Assign to a person/agent |
| `--tag` | `-t` | | Add a tag |

```bash
kanbanito add "Implement OAuth" -c todo -p high -a alice
kanbanito add "Write tests"     -c backlog --tag testing
```

### `list [column]`
List all cards, optionally filtered to a column.

```bash
kanbanito list
kanbanito list in-progress
kanbanito list --json          # machine-readable JSON
```

### `show <id>`
Show full details for a card.

```bash
kanbanito show kb-0001
kanbanito show kb-0001 --json
```

### `move <id> <column>`
Move a card to a different column.

```bash
kanbanito move kb-0001 in-progress
kanbanito move kb-0001 done
```

### `done <id>`
Shorthand for moving a card to the `done` column.

```bash
kanbanito done kb-0003
```

### `update <id> [flags]`
Update one or more fields on a card.

```bash
kanbanito update kb-0001 --title "New title"
kanbanito update kb-0001 --priority high --assignee bob
kanbanito update kb-0001 --column review
```

### `note <id> "text"`
Append a timestamped note to the card body.

```bash
kanbanito note kb-0001 "Auth flow complete, starting token refresh"
```

### `delete <id> --yes`
Delete a card (requires `--yes` to confirm).

```bash
kanbanito delete kb-0001 --yes
```

### `board`
Print a colour ASCII kanban board in the terminal.

```bash
kanbanito board
```

### `columns`
List available columns.

```bash
kanbanito columns
kanbanito columns --json
```

### `serve [--port 3000] [--open]`
Start the live web UI server.

```bash
kanbanito serve
kanbanito serve --port 8080 --open   # also opens your browser
```

### `export [filename]`
Export a self-contained static HTML snapshot (no server needed to view).

```bash
kanbanito export                     # → kanbanito.html
kanbanito export docs/board.html
```

---

## Web UI

The web UI (`kanbanito serve`) offers:

- **Drag-and-drop** cards between columns
- **Click any card** to open a full edit modal
- **Inline add** — click `+` on any column header
- **Live updates** — changes from any source (CLI, agents, file edits) appear instantly via SSE
- **Status indicator** — green dot = server connected

---

## File Format

Cards are stored as **Markdown files with YAML frontmatter**:

```
.kanbanito/
├── board.json        ← Board configuration & column definitions
└── cards/
    ├── kb-0001.md
    └── kb-0002.md
```

**Example card** (`.kanbanito/cards/kb-0001.md`):

```markdown
---
id: kb-0001
title: Implement user authentication
column: in-progress
priority: high
assignee: alice
tags: [backend, security]
created: 2024-06-01T10:00:00.000Z
updated: 2024-06-02T14:30:00.000Z
---

Design and implement JWT-based authentication.

## Checklist
- [x] Design the auth flow
- [x] Implement /login endpoint
- [ ] Implement token refresh
- [ ] Write integration tests

**Note** _(6/2/2024, 2:30:00 PM)_: Login endpoint complete, working on refresh tokens.
```

You can edit these files directly in any text editor — changes are reflected immediately in the UI.

---

## For AI Agents & LLM Swarms

Kanbanito is purpose-built for agentic workflows:

### Recommended agent workflow

```bash
# 1. Agent is assigned a task — create a card
kanbanito add "Refactor auth module" -c in-progress -a agent-3 --tag backend

# 2. Agent makes progress — append a note
kanbanito note kb-0012 "Extracted token logic into TokenService class"

# 3. Agent hits a blocker — update status
kanbanito update kb-0012 --column review --note "Ready for human review"

# 4. Task complete
kanbanito done kb-0012
```

### JSON output for scripting

Every command that returns data supports `--json`:

```bash
# Get all in-progress tasks as JSON
kanbanito list in-progress --json

# Get a specific card as JSON
kanbanito show kb-0012 --json
```

### Direct file access

Agents can read and write `.kanbanito/cards/*.md` directly. The format is simple enough that an LLM can parse and emit it natively. The live server watches for file changes and broadcasts updates to the UI immediately.

### REST API (when `kanbanito serve` is running)

```
GET  /api/board              → board config + columns
GET  /api/cards              → all cards (array)
GET  /api/cards?column=todo  → cards filtered by column
GET  /api/cards/:id          → single card
POST /api/cards              → create card  (JSON body)
PUT  /api/cards/:id          → update card  (JSON body, partial)
DEL  /api/cards/:id          → delete card
GET  /api/events             → SSE stream for real-time updates
```

**Example — create a card via curl:**
```bash
curl -s -X POST http://localhost:3000/api/cards \
  -H 'Content-Type: application/json' \
  -d '{"title":"Deploy to staging","column":"todo","priority":"high"}' | jq .
```

---

## Customizing Columns

Edit `.kanbanito/board.json` to change columns, names, or colours:

```json
{
  "name": "Acme Backend",
  "columns": [
    { "id": "icebox",      "name": "Ice Box",     "color": "#94a3b8" },
    { "id": "todo",        "name": "Todo",        "color": "#3B82F6" },
    { "id": "in-progress", "name": "In Progress", "color": "#F59E0B" },
    { "id": "blocked",     "name": "Blocked",     "color": "#ef4444" },
    { "id": "review",      "name": "Review",      "color": "#8B5CF6" },
    { "id": "done",        "name": "Done",        "color": "#10B981" }
  ]
}
```

Restart the server after editing `board.json`.

---

## `.gitignore` recommendation

Add `.kanbanito/` to your `.gitignore` if you don't want board state committed, or leave it **out** to version-control your tasks alongside code.

---

## License

MIT
