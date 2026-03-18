import { CronExpressionParser } from 'cron-parser';
import { createTask, listTasks } from '../objects/task';
import { getAgent } from '../agents/registry';
import type { BootEntry } from './index';

// Returns the most recent scheduled time before `now` for a cron expression,
// or null if the expression is invalid.
function previousRun(cronExpr: string, now: number): number | null {
  try {
    const interval = CronExpressionParser.parse(cronExpr, {
      currentDate: new Date(now),
      utc: true,
    });
    return interval.prev().toDate().getTime();
  } catch {
    return null;
  }
}

// A CronScheduler tracks the last time each cron entry fired and decides
// which entries are due on each tick.
export class CronScheduler {
  // Key: entry index (string), value: timestamp of last fire
  private lastFired = new Map<string, number>();

  // Call once on daemon start with current time.
  // Initialises lastFired to now so overdue entries don't fire immediately.
  init(entries: BootEntry[], now = Date.now()): void {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].cron) {
        this.lastFired.set(this.key(i, entries[i]), now);
      }
    }
  }

  // Returns entries whose cron schedule has fired since they were last run.
  due(entries: BootEntry[], now = Date.now()): BootEntry[] {
    const result: BootEntry[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.cron) continue;
      const k = this.key(i, entry);
      const last = this.lastFired.get(k) ?? 0;
      const prev = previousRun(entry.cron, now);
      if (prev !== null && prev > last) {
        result.push(entry);
      }
    }
    return result;
  }

  // Mark an entry as having just fired.
  markFired(index: number, entry: BootEntry, now = Date.now()): void {
    this.lastFired.set(this.key(index, entry), now);
  }

  private key(index: number, entry: BootEntry): string {
    return `${index}:${entry.agentType}:${entry.goal}`;
  }
}

// Spawn tasks for any cron entries that are due.
// Respects the same idempotency rule as applyBootConfig — won't spawn if a
// live task already exists for that agent type.
export function fireDueCronEntries(
  scheduler: CronScheduler,
  entries: BootEntry[],
  now = Date.now()
): void {
  const due = scheduler.due(entries, now);
  if (due.length === 0) return;

  const liveTasks = listTasks().filter(t =>
    t.status === 'pending' || t.status === 'running' || t.status === 'paused'
  );
  const liveAgentTypes = new Set(liveTasks.map(t => t.agent_type).filter(Boolean));

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!due.includes(entry)) continue;

    const def = getAgent(entry.agentType);
    if (!def) {
      console.warn(`[cron] Unknown agent type: "${entry.agentType}" — skipping`);
      scheduler.markFired(i, entry, now);
      continue;
    }

    if (!liveAgentTypes.has(entry.agentType)) {
      createTask(entry.goal, {
        agentType: entry.agentType,
        capabilities: def.capabilities,
        maxSteps: def.maxSteps,
        priority: entry.priority ?? 0,
        jobId: entry.jobId,
      });
    }

    scheduler.markFired(i, entry, now);
  }
}
