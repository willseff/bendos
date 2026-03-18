# bendos

A self-contained, headless operating environment for LLM agents.

bendos is not a desktop OS. It is a local-first runtime where LLMs are the only users — a minimal kernel that gives language models stable primitives to reason about, act on, and persist state across steps.

---

## Why it exists

LLMs are increasingly useful for multi-step work, but most agent frameworks wrap them in web frameworks, cloud services, or chat UIs. bendos takes the opposite approach: a single SQLite database, a synchronous runtime loop, and a small set of composable primitives.

The goal is to answer one question cleanly: *what does an LLM need to get real work done on a local machine?*

The answer bendos gives: tasks, memory, tools, artifacts, and events. Nothing else.

---

## Core concepts

| Primitive | Description |
|-----------|-------------|
| **Task** | A unit of work with a goal. Has a status (`pending`, `running`, `complete`, `failed`), a step count, and an optional parent task. |
| **Memory** | A piece of text the agent wants to remember, optionally tagged and linked to a task. |
| **Tool** | A named, schema-validated function the agent can invoke. Registered at startup, seeded to the DB. |
| **Artifact** | A named content blob (text, JSON, code) produced during a task, like a file. |
| **Event** | An immutable log entry. Every significant action emits an event: `task.started`, `action.executed`, `task.complete`, etc. |

---

## Architecture overview

```
src/
  main.ts           Entry point — loads dotenv, runs CLI
  cli/              Commander CLI — all user-facing commands
  kernel/
    scheduler.ts    Pick next task (FIFO + depth-first for children)
    runtime.ts      runOnce / runAll — the agent loop
  llm/
    index.ts        AgentActionSchema, LLMAdapter interface
    mock.ts         Deterministic mock adapter (no API calls)
    openai.ts       OpenAI adapter (lazy import)
    anthropic.ts    Anthropic adapter (lazy import)
  tools/
    registry.ts     In-memory tool registry + seedToolRegistry
    builtin/        Six built-in tools (task.spawn, task.done, memory.*, artifact.create, state.query)
  context/
    assembler.ts    Build LLMContext from task + DB state
  policy/
    index.ts        Gate on tool calls (spawn limit, etc.)
  objects/
    task.ts         Task CRUD
    memory.ts       Memory CRUD
    tool.ts         Tool record CRUD
    artifact.ts     Artifact CRUD
    event.ts        Event emit + query
  db/
    index.ts        Lazy singleton DB connection
    migrations.ts   CREATE TABLE IF NOT EXISTS for all tables
```

### Why specialized tables instead of a generic objects table?

bendos uses one table per primitive type rather than a single `objects` table with a `type` column. This means:

- Queries are typed — no `JSON.parse` sprinkled everywhere
- Foreign keys work correctly — `memories.task_id REFERENCES tasks(id)` is enforceable
- SQLite schema acts as documentation
- Adding a new primitive is one migration, not a schema negotiation

The tradeoff is more migration code up front, but for a local-first runtime with a known, stable set of primitives, this is the right call.

---

## Install

```bash
npm install
npm run dev -- init
```

The `init` command creates the SQLite database at `data/state.db` (configurable via `DB_PATH` env var) and registers all built-in tools.

---

## Running

### 1. Initialize

```bash
npm run dev -- init
# bendos initialized. Database ready and tools registered.
```

### 2. Create a task

```bash
npm run dev -- task:create "write a haiku about recursion"
# Created task: 3f2a1b4c-...
```

### 3. Run the agent

```bash
npm run dev -- run
# Running all tasks with adapter: mock
# All tasks complete.
```

Or run a single step:

```bash
npm run dev -- run:once
# Task ran: 3f2a1b4c-...
```

### 4. Inspect results

```bash
npm run dev -- task:list
npm run dev -- trace 3f2a1b4c-...
npm run dev -- object:list
```

---

## CLI examples

### `init`
```
$ npm run dev -- init
bendos initialized. Database ready and tools registered.
```

### `task:create`
```
$ npm run dev -- task:create "summarize the last 3 events"
Created task: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### `task:list`
```
$ npm run dev -- task:list
ID                                      STATUS      STEPS   GOAL
------------------------------------------------------------------------
a1b2c3d4-e5f6-7890-abcd-ef1234567890  complete    2       summarize the last 3 events
```

### `run`
```
$ npm run dev -- run
Running all tasks with adapter: mock
All tasks complete.
```

### `run:once`
```
$ npm run dev -- run:once
Task ran: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### `trace`
```
$ npm run dev -- trace a1b2c3d4-e5f6-7890-abcd-ef1234567890
Trace for task: a1b2c3d4-e5f6-7890-abcd-ef1234567890
------------------------------------------------------------
  [task.started] {"goal":"summarize the last 3 events"}
  step 0: memory.write — I should start by writing a memory about the goal.
  step 1: task.done — I have completed the task.
  [task.complete] {"summary":"Completed: summarize the last 3 events"}
```

### `object:list`
```
$ npm run dev -- object:list
Object counts:
  tasks:     1
  tools:     6
  artifacts: 0
  memories:  1
```

---

## Data model

### tasks
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| goal | TEXT | The agent's objective |
| status | TEXT | pending / running / complete / failed |
| parent_task_id | TEXT FK | Nullable, references tasks(id) |
| spawn_count | INTEGER | How many child tasks have been spawned |
| step_count | INTEGER | How many LLM steps have been taken |
| created_at | INTEGER | Unix ms |
| updated_at | INTEGER | Unix ms |

### memories
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| task_id | TEXT FK | Nullable |
| content | TEXT | Free-form text |
| tags | TEXT | JSON array of strings |
| created_at | INTEGER | Unix ms |

### tools
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| name | TEXT UNIQUE | e.g. `memory.write` |
| description | TEXT | Human-readable |
| input_schema | TEXT | JSON schema object |
| created_at | INTEGER | Unix ms |

### artifacts
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| task_id | TEXT FK | Nullable |
| name | TEXT | Filename-like identifier |
| content | TEXT | File contents |
| mime_type | TEXT | Default `text/plain` |
| created_at | INTEGER | Unix ms |

### events
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| task_id | TEXT | Nullable, no FK (allows system events) |
| type | TEXT | e.g. `action.executed`, `task.complete` |
| payload | TEXT | JSON object |
| created_at | INTEGER | Unix ms |

---

## Current limitations

- **Single process** — no concurrency, one task runs at a time
- **No streaming** — LLM responses are awaited in full before proceeding
- **No token counting** — context is not pruned based on token budget
- **No authentication** — the CLI and DB are local-only, no access control
- **No parallelism** — the scheduler is strictly sequential
- **Mock adapter only ships tested** — OpenAI and Anthropic adapters require their respective SDKs to be installed separately

---

## Next steps

- **Streaming** — pipe LLM token streams to the terminal during `run`
- **Parallel tasks** — run multiple independent tasks concurrently using worker threads
- **Real prompt templates** — structured system prompts per task type, few-shot examples
- **Web UI** — a minimal local dashboard showing the task tree, event stream, and memory browser
- **Task DAGs** — explicit dependency edges between tasks, not just parent/child spawn relationships
- **Token budgeting** — truncate context intelligently when approaching model limits
- **Plugin tools** — load tools from external modules at runtime
