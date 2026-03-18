import http from 'node:http';
import { createTask, listTasks, getTask, cancelJob, getTasksByJob } from '../objects/task';
import { listAgents } from '../agents/registry';
import { sendSignal } from '../objects/signal';
import { vfsRead, vfsList, vfsStat } from '../vfs/index';
import { listEvents } from '../objects/event';

// ─── helpers ──────────────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

function ok(res: http.ServerResponse, body: unknown): void { send(res, 200, body); }
function created(res: http.ServerResponse, body: unknown): void { send(res, 201, body); }
function badRequest(res: http.ServerResponse, msg: string): void { send(res, 400, { error: msg }); }
function notFound(res: http.ServerResponse, msg = 'Not found'): void { send(res, 404, { error: msg }); }
function methodNotAllowed(res: http.ServerResponse): void { send(res, 405, { error: 'Method not allowed' }); }

// ─── router ───────────────────────────────────────────────────────────────────

type Handler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  params: Record<string, string>,
) => Promise<void> | void;

interface Route { method: string; pattern: RegExp; keys: string[]; handler: Handler }

const routes: Route[] = [];

function route(method: string, path: string, handler: Handler): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$'
  );
  routes.push({ method, pattern, keys, handler });
}

function dispatch(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = (req.method ?? 'GET').toUpperCase();

  for (const r of routes) {
    if (r.method !== method) continue;
    const m = url.pathname.match(r.pattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = m[i + 1]));
    Promise.resolve(r.handler(req, res, params)).catch(err => {
      if (!res.headersSent) send(res, 500, { error: String(err) });
    });
    return;
  }
  notFound(res);
}

// ─── routes ───────────────────────────────────────────────────────────────────

// GET /health
route('GET', '/health', (_req, res) => {
  ok(res, { ok: true });
});

// GET /tasks
route('GET', '/tasks', (_req, res) => {
  ok(res, listTasks());
});

// POST /tasks  { goal, agentType?, capabilities?, priority?, jobId?, parentTaskId? }
route('POST', '/tasks', async (req, res) => {
  const body = await readBody(req) as any;
  if (!body?.goal || typeof body.goal !== 'string') {
    return badRequest(res, '"goal" (string) is required');
  }
  const task = createTask(body.goal, {
    agentType: body.agentType,
    capabilities: body.capabilities,
    priority: body.priority,
    jobId: body.jobId,
    parentTaskId: body.parentTaskId,
  });
  created(res, task);
});

// GET /tasks/:id
route('GET', '/tasks/:id', (_req, res, { id }) => {
  const task = getTask(id);
  if (!task) return notFound(res, `Task ${id} not found`);
  ok(res, task);
});

// GET /tasks/:id/events
route('GET', '/tasks/:id/events', (_req, res, { id }) => {
  const task = getTask(id);
  if (!task) return notFound(res, `Task ${id} not found`);
  ok(res, listEvents(id));
});

// POST /tasks/:id/signal  { type, payload? }
route('POST', '/tasks/:id/signal', async (req, res, { id }) => {
  const task = getTask(id);
  if (!task) return notFound(res, `Task ${id} not found`);
  const body = await readBody(req) as any;
  const type = body?.type;
  if (!type || typeof type !== 'string') {
    return badRequest(res, '"type" (string) is required: cancel | pause | resume | inject');
  }
  const signal = sendSignal(id, type as any, body?.payload ?? {});
  ok(res, signal);
});

// GET /agents
route('GET', '/agents', (_req, res) => {
  ok(res, listAgents());
});

// GET /vfs?path=<path>   read a file
route('GET', '/vfs', (req, res) => {
  const url = new URL(req.url!, `http://${req.headers.host ?? 'localhost'}`);
  const path = url.searchParams.get('path') ?? '/';
  const op = url.searchParams.get('op') ?? 'read';
  const taskId = url.searchParams.get('taskId') ?? undefined;
  const ctx = { taskId };

  if (op === 'ls') {
    const entries = vfsList(path, ctx);
    if (entries === null) return notFound(res, `No such directory: ${path}`);
    return ok(res, entries);
  }

  if (op === 'stat') {
    const stat = vfsStat(path, ctx);
    if (stat === null) return notFound(res, `No such path: ${path}`);
    return ok(res, stat);
  }

  // default: read
  const content = vfsRead(path, ctx);
  if (content === null) return notFound(res, `No such file: ${path}`);
  ok(res, { path, content });
});

// GET /jobs
route('GET', '/jobs', (_req, res) => {
  const tasks = listTasks();
  const jobMap = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!t.job_id) continue;
    if (!jobMap.has(t.job_id)) jobMap.set(t.job_id, []);
    jobMap.get(t.job_id)!.push(t);
  }
  const jobs = Array.from(jobMap.entries()).map(([id, ts]) => ({
    id,
    taskCount: ts.length,
    counts: ts.reduce((acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; }, {} as Record<string, number>),
  }));
  ok(res, jobs);
});

// DELETE /jobs/:id  — cancel all tasks in a job
route('DELETE', '/jobs/:id', (_req, res, { id }) => {
  const tasks = getTasksByJob(id);
  if (tasks.length === 0) return notFound(res, `Job ${id} not found`);
  const cancelled = cancelJob(id);
  ok(res, { cancelled });
});

// ─── server factory ───────────────────────────────────────────────────────────

export function createApiServer(): http.Server {
  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    dispatch(req, res);
  });
}

export function startApiServer(port = 4000): http.Server {
  const server = createApiServer();
  server.listen(port, () => {
    console.log(`[api] HTTP server listening on http://localhost:${port}`);
  });
  return server;
}
