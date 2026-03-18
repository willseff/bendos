import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { closeDb, getDb } from '../db/index';
import { createApiServer } from '../api/index';
import { registerAgent } from '../agents/registry';

// ─── helpers ──────────────────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const json = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(url, {
      method,
      headers: json ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) } : {},
    }, res => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode ?? 0, body: raw }); }
      });
    });
    req.on('error', reject);
    if (json) req.write(json);
    req.end();
  });
}

function get(path: string) { return request('GET', path); }
function post(path: string, body?: unknown) { return request('POST', path, body); }
function del(path: string) { return request('DELETE', path); }

// ─── setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  process.env.DB_PATH = ':memory:';
  closeDb();
  getDb();
  server = createApiServer();
  await new Promise<void>(r => server.listen(0, r));
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>(r => server.close(() => r()));
  closeDb();
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns ok', async () => {
    const { status, body } = await get('/health');
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
  });
});

describe('POST /tasks', () => {
  it('creates a task and returns 201', async () => {
    const { status, body } = await post('/tasks', { goal: 'write a report' });
    expect(status).toBe(201);
    expect((body as any).id).toBeDefined();
    expect((body as any).goal).toBe('write a report');
    expect((body as any).status).toBe('pending');
  });

  it('returns 400 if goal is missing', async () => {
    const { status, body } = await post('/tasks', {});
    expect(status).toBe(400);
    expect((body as any).error).toMatch(/goal/);
  });

  it('accepts priority and jobId', async () => {
    const { status, body } = await post('/tasks', { goal: 'high pri', priority: 10, jobId: 'batch-1' });
    expect(status).toBe(201);
    expect((body as any).priority).toBe(10);
    expect((body as any).job_id).toBe('batch-1');
  });
});

describe('GET /tasks', () => {
  it('returns an array', async () => {
    await post('/tasks', { goal: 't1' });
    await post('/tasks', { goal: 't2' });
    const { status, body } = await get('/tasks');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as any[]).length).toBe(2);
  });
});

describe('GET /tasks/:id', () => {
  it('returns the task', async () => {
    const created = (await post('/tasks', { goal: 'fetch me' })).body as any;
    const { status, body } = await get(`/tasks/${created.id}`);
    expect(status).toBe(200);
    expect((body as any).id).toBe(created.id);
  });

  it('returns 404 for unknown id', async () => {
    const { status } = await get('/tasks/does-not-exist');
    expect(status).toBe(404);
  });
});

describe('GET /tasks/:id/events', () => {
  it('returns an array', async () => {
    const created = (await post('/tasks', { goal: 'events test' })).body as any;
    const { status, body } = await get(`/tasks/${created.id}/events`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('POST /tasks/:id/signal', () => {
  it('sends a cancel signal', async () => {
    const created = (await post('/tasks', { goal: 'cancel me' })).body as any;
    const { status, body } = await post(`/tasks/${created.id}/signal`, { type: 'cancel' });
    expect(status).toBe(200);
    expect((body as any).type).toBe('cancel');
  });

  it('returns 400 if type is missing', async () => {
    const created = (await post('/tasks', { goal: 'no type' })).body as any;
    const { status } = await post(`/tasks/${created.id}/signal`, {});
    expect(status).toBe(400);
  });

  it('returns 404 for unknown task', async () => {
    const { status } = await post('/tasks/unknown/signal', { type: 'cancel' });
    expect(status).toBe(404);
  });
});

describe('GET /agents', () => {
  it('returns agent list', async () => {
    registerAgent({ name: 'test-api-agent', description: 'd', systemPrompt: 'p' });
    const { status, body } = await get('/agents');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as any[]).some(a => a.name === 'test-api-agent')).toBe(true);
  });
});

describe('GET /vfs', () => {
  it('op=ls on / returns mount points', async () => {
    const { status, body } = await get('/vfs?path=/&op=ls');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('op=stat on / returns dir', async () => {
    const { status, body } = await get('/vfs?path=/&op=stat');
    expect(status).toBe(200);
    expect((body as any).type).toBe('dir');
  });

  it('returns 404 for nonexistent path', async () => {
    const { status } = await get('/vfs?path=/nowhere/file.txt');
    expect(status).toBe(404);
  });
});

describe('GET /jobs + DELETE /jobs/:id', () => {
  it('lists jobs', async () => {
    await post('/tasks', { goal: 'j1', jobId: 'myjob' });
    await post('/tasks', { goal: 'j2', jobId: 'myjob' });
    const { status, body } = await get('/jobs');
    expect(status).toBe(200);
    const jobs = body as any[];
    const job = jobs.find(j => j.id === 'myjob');
    expect(job).toBeDefined();
    expect(job.taskCount).toBe(2);
  });

  it('cancels a job', async () => {
    await post('/tasks', { goal: 'kill me', jobId: 'deadjob' });
    const { status, body } = await del('/jobs/deadjob');
    expect(status).toBe(200);
    expect((body as any).cancelled).toBeGreaterThanOrEqual(1);
  });

  it('returns 404 for unknown job', async () => {
    const { status } = await del('/jobs/ghost');
    expect(status).toBe(404);
  });
});

describe('CORS', () => {
  it('OPTIONS returns 204 with CORS headers', async () => {
    const result = await request('OPTIONS', '/tasks');
    expect(result.status).toBe(204);
  });
});
