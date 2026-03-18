import fs from 'fs';
import { createTask, listTasks } from '../objects/task';
import { getAgent } from '../agents/registry';

export interface BootEntry {
  agentType: string;
  goal: string;
  priority?: number;
  jobId?: string;
}

export function loadBootConfig(file: string): BootEntry[] {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as BootEntry[];
  } catch (err) {
    console.warn(`[boot] Failed to load ${file}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

// Spawn any boot entries that don't already have a live (non-terminal) task.
// Safe to call multiple times — idempotent.
export function applyBootConfig(entries: BootEntry[]): void {
  const liveTasks = listTasks().filter(t =>
    t.status === 'pending' || t.status === 'running' || t.status === 'paused'
  );
  const liveAgentTypes = new Set(liveTasks.map(t => t.agent_type).filter(Boolean));

  for (const entry of entries) {
    const def = getAgent(entry.agentType);
    if (!def) {
      console.warn(`[boot] Unknown agent type: "${entry.agentType}" — skipping`);
      continue;
    }

    if (liveAgentTypes.has(entry.agentType)) {
      continue; // Already running, don't spawn a duplicate.
    }

    createTask(entry.goal, {
      agentType: entry.agentType,
      capabilities: def.capabilities,
      maxSteps: def.maxSteps,
      priority: entry.priority ?? 0,
      jobId: entry.jobId,
    });
  }
}
