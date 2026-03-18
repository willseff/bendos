# bendos

An OS for LLM agents.

bendos gives language models the primitives a real operating system gives programs: processes, memory, a filesystem, IPC, signals, capabilities, and a scheduler. Agents run autonomously inside a persistent daemon — no chat UI, no cloud, no human in the loop.

---

## Concepts

| OS primitive | bendos equivalent |
|---|---|
| Process | Task — has a goal, status, step count, priority |
| Executable | Agent def — JSON file defining role, system prompt, capabilities |
| Signal | `cancel`, `pause`, `resume`, `inject` — intercepted between steps |
| Filesystem | Artifacts with paths (`/reports/summary.md`) |
| Memory | Private/public key-value store per task |
| IPC | Point-to-point messages + pipes between tasks |
| Capabilities | Per-task tool allowlist enforced by the policy layer |
| Scheduler | Priority queue → depth-first children → FIFO |
| Daemon | Always-on process that runs tasks, supervises services, fires cron jobs |
| ps / top | `bendos ps` and `bendos top --watch` |
| Process group | Job ID — kill an entire group atomically with `bendos job:kill` |
| wait() | `task.wait` — suspend a task until a child completes, receive result in inbox |
| systemd service | `"restart": "always"` in agent def — daemon respawns automatically |
| cron | `"cron": "0 9 * * *"` in boot.json — scheduled agent execution |

---

## Install

```bash
npm install
cp .env.example .env   # set LLM_PROVIDER and API key
```

## Quickstart

```bash
# Start the daemon — boots agents from boot.json, runs forever
npx tsx src/main.ts daemon

# In another terminal
npx tsx src/main.ts ps
npx tsx src/main.ts top --watch
```

Or run one-shot:

```bash
npx tsx src/main.ts task:create "research the history of unix" --priority 5
npx tsx src/main.ts run
npx tsx src/main.ts trace <taskId>
```

---

## Defining agents

Create a JSON file in `agents/`:

```json
{
  "name": "researcher",
  "description": "Researches a topic and writes a report",
  "systemPrompt": "You are a research agent. Investigate the topic, store findings in memory, write a report to /reports/<topic>.md, then call task.done.",
  "capabilities": ["memory.write", "memory.read", "artifact.create", "artifact.read", "artifact.list", "task.done"],
  "maxSteps": 30,
  "restart": "on-failure"
}
```

Run one immediately:

```bash
npx tsx src/main.ts agent:run researcher "the history of Plan 9"
```

---

## Boot config

`boot.json` defines what the daemon runs autonomously:

```json
[
  { "agentType": "monitor", "goal": "check system state and log findings" },
  { "agentType": "researcher", "goal": "write daily digest", "cron": "0 9 * * *" }
]
```

- Entries without `cron` spawn once on startup (idempotent — skipped if already running)
- Entries with `cron` fire on schedule, every time the expression matches
- `"restart": "always"` in the agent def respawns it whenever it exits

---

## Key CLI commands

```bash
bendos daemon              # start the daemon
bendos daemon:stop         # graceful shutdown
bendos ps                  # process tree
bendos top --watch         # live system snapshot

bendos task:create <goal> [--priority N] [--job <id>] [--capabilities a,b]
bendos agent:list
bendos agent:run <name> <goal>

bendos signal:send <taskId> cancel|pause|resume|inject
bendos job:list
bendos job:kill <jobId>

bendos trace <taskId>      # full event log for a task
```

---

## LLM adapters

Set `LLM_PROVIDER` in `.env`:

| Value | Requires |
|---|---|
| `mock` | nothing — deterministic, for testing |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |

---

## Built-in tools

`task.spawn` `task.done` `task.wait` `task.pipe` `memory.read` `memory.write` `artifact.create` `artifact.read` `artifact.list` `message.send` `message.receive` `signal.send` `state.query`

External tools can be added to the `tools/` directory as exec scripts (stdin/stdout JSON) or JS modules.

---

## Tests

```bash
npm test
```

77 tests across scheduler, signals, IPC, pipes, isolation, capabilities, agents, jobs, wait, cron, and the runtime loop.
