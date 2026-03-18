import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { listTasks } from '../objects/task';
import { registerAgent } from '../agents/registry';
import { CronScheduler, fireDueCronEntries } from '../boot/cron';
import type { BootEntry } from '../boot/index';

// Fixed reference time: 2026-03-18 13:00:00 UTC
const T = new Date('2026-03-18T13:00:00.000Z').getTime();
const ONE_MIN = 60_000;
const ONE_HOUR = 3_600_000;

describe('CronScheduler', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    registerAgent({ name: 'worker', description: '', systemPrompt: '' });
  });

  afterEach(() => {
    closeDb();
  });

  it('entry with no cron is never due', () => {
    const entries: BootEntry[] = [{ agentType: 'worker', goal: 'once' }];
    const s = new CronScheduler();
    s.init(entries, T);
    expect(s.due(entries, T + ONE_MIN)).toHaveLength(0);
  });

  it('cron entry is not due immediately after init (lastFired = now)', () => {
    const entries: BootEntry[] = [{ agentType: 'worker', goal: 'tick', cron: '* * * * *' }];
    const s = new CronScheduler();
    s.init(entries, T);
    // Same tick — previous run == lastFired, not due yet
    expect(s.due(entries, T)).toHaveLength(0);
  });

  it('cron entry is due after one interval passes', () => {
    const entries: BootEntry[] = [{ agentType: 'worker', goal: 'tick', cron: '* * * * *' }];
    const s = new CronScheduler();
    s.init(entries, T);
    // One minute later — previous run is T+0:00 which is after lastFired
    expect(s.due(entries, T + ONE_MIN + 1000)).toHaveLength(1);
  });

  it('entry is not due again after markFired', () => {
    const entries: BootEntry[] = [{ agentType: 'worker', goal: 'tick', cron: '* * * * *' }];
    const s = new CronScheduler();
    s.init(entries, T);
    const now = T + ONE_MIN + 1000;
    expect(s.due(entries, now)).toHaveLength(1);
    s.markFired(0, entries[0], now);
    expect(s.due(entries, now)).toHaveLength(0);
  });

  it('hourly cron is not due after 59 minutes', () => {
    const entries: BootEntry[] = [{ agentType: 'worker', goal: 'hourly', cron: '0 * * * *' }];
    const s = new CronScheduler();
    s.init(entries, T);
    expect(s.due(entries, T + ONE_HOUR - ONE_MIN)).toHaveLength(0);
  });

  it('hourly cron is due after 61 minutes', () => {
    const entries: BootEntry[] = [{ agentType: 'worker', goal: 'hourly', cron: '0 * * * *' }];
    const s = new CronScheduler();
    s.init(entries, T);
    expect(s.due(entries, T + ONE_HOUR + ONE_MIN)).toHaveLength(1);
  });
});

describe('fireDueCronEntries', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    registerAgent({ name: 'worker', description: '', systemPrompt: '' });
  });

  afterEach(() => {
    closeDb();
  });

  it('spawns a task when entry is due', () => {
    const entries: BootEntry[] = [{ agentType: 'worker', goal: 'run', cron: '* * * * *' }];
    const s = new CronScheduler();
    s.init(entries, T);

    fireDueCronEntries(s, entries, T + ONE_MIN + 1000);

    const tasks = listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].agent_type).toBe('worker');
  });

  it('does not spawn a duplicate if a live task already exists', () => {
    const entries: BootEntry[] = [{ agentType: 'worker', goal: 'run', cron: '* * * * *' }];
    const s = new CronScheduler();
    s.init(entries, T);

    const now = T + ONE_MIN + 1000;
    fireDueCronEntries(s, entries, now);
    fireDueCronEntries(s, entries, now + ONE_MIN);  // fires again but task still pending

    expect(listTasks()).toHaveLength(1);
  });

  it('does not spawn when entry is not due', () => {
    const entries: BootEntry[] = [{ agentType: 'worker', goal: 'hourly', cron: '0 * * * *' }];
    const s = new CronScheduler();
    s.init(entries, T);

    fireDueCronEntries(s, entries, T + 30 * ONE_MIN);

    expect(listTasks()).toHaveLength(0);
  });
});
