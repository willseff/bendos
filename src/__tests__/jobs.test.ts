import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db/index';
import { createTask, getTask, getTasksByJob, listJobIds, cancelJob } from '../objects/task';
import { seedToolRegistry } from '../tools/registry';
import { runOnce } from '../kernel/runtime';
import { MockLLMAdapter } from '../llm/mock';
import '../tools/builtin/task.spawn';
import '../tools/builtin/task.done';
import '../tools/builtin/task.pipe';
import '../tools/builtin/signal.send';
import '../tools/builtin/memory.read';
import '../tools/builtin/memory.write';
import '../tools/builtin/artifact.create';
import '../tools/builtin/artifact.read';
import '../tools/builtin/artifact.list';
import '../tools/builtin/state.query';
import '../tools/builtin/message.send';
import '../tools/builtin/message.receive';

describe('process groups / jobs', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDb();
    getDb();
    seedToolRegistry();
  });

  afterEach(() => {
    closeDb();
  });

  it('task without job_id has null job_id', () => {
    const task = createTask('solo task');
    expect(task.job_id).toBeNull();
  });

  it('task created with job_id stores it', () => {
    const task = createTask('grouped task', { jobId: 'my-job' });
    expect(task.job_id).toBe('my-job');
  });

  it('getTasksByJob returns all tasks in a job', () => {
    createTask('task 1', { jobId: 'job-a' });
    createTask('task 2', { jobId: 'job-a' });
    createTask('task 3', { jobId: 'job-b' });

    const jobA = getTasksByJob('job-a');
    expect(jobA).toHaveLength(2);
    expect(jobA.every(t => t.job_id === 'job-a')).toBe(true);
  });

  it('listJobIds returns distinct job IDs', () => {
    createTask('t1', { jobId: 'job-x' });
    createTask('t2', { jobId: 'job-x' });
    createTask('t3', { jobId: 'job-y' });
    createTask('t4');  // no job

    const ids = listJobIds();
    expect(ids).toContain('job-x');
    expect(ids).toContain('job-y');
    expect(ids).not.toContain(null);
    expect(ids).toHaveLength(2);
  });

  it('cancelJob marks pending tasks as failed immediately', () => {
    const t1 = createTask('t1', { jobId: 'kill-job' });
    const t2 = createTask('t2', { jobId: 'kill-job' });

    const count = cancelJob('kill-job');

    expect(count).toBe(2);
    expect(getTask(t1.id)!.status).toBe('failed');
    expect(getTask(t2.id)!.status).toBe('failed');
  });

  it('cancelJob does not affect tasks outside the job', () => {
    createTask('in job', { jobId: 'kill-job2' });
    const outside = createTask('outside');

    cancelJob('kill-job2');

    expect(getTask(outside.id)!.status).toBe('pending');
  });

  it('cancelJob does not affect already-complete tasks', async () => {
    const t = createTask('complete me', { jobId: 'mixed-job' });
    await runOnce(new MockLLMAdapter());
    expect(getTask(t.id)!.status).toBe('complete');

    cancelJob('mixed-job');

    // complete task should be untouched
    expect(getTask(t.id)!.status).toBe('complete');
  });

  it('cancelJob returns 0 for unknown job', () => {
    expect(cancelJob('nonexistent-job')).toBe(0);
  });
});
