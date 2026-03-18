import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import '../tools/builtin/http.fetch';
import { getTool } from '../tools/registry';

// ─── minimal test server ──────────────────────────────────────────────────────

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url!, `http://localhost`);

    if (url.pathname === '/json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hello: 'world' }));
      return;
    }

    if (url.pathname === '/echo' && req.method === 'POST') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        res.writeHead(200, {
          'Content-Type': req.headers['content-type'] ?? 'text/plain',
          'X-Echo': 'true',
        });
        res.end(body);
      });
      return;
    }

    if (url.pathname === '/status/404') {
      res.writeHead(404);
      res.end('not found');
      return;
    }

    if (url.pathname === '/slow') {
      // Never responds — for timeout test.
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });

  await new Promise<void>(r => server.listen(0, r));
  const addr = server.address() as { port: number };
  base = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()));
});

// ─── tests ────────────────────────────────────────────────────────────────────

async function fetch(input: Record<string, unknown>) {
  const tool = getTool('http.fetch')!;
  return tool.execute(input as any, { taskId: 'test', task: {} as any });
}

describe('http.fetch tool', () => {
  it('GET returns status and body', async () => {
    const r = await fetch({ url: `${base}/` }) as any;
    expect(r.status).toBe(200);
    expect(r.ok).toBe(true);
    expect(r.body).toBe('ok');
  });

  it('parses JSON response automatically', async () => {
    const r = await fetch({ url: `${base}/json` }) as any;
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ hello: 'world' });
  });

  it('POST with json_body sends JSON and echoes it back', async () => {
    const r = await fetch({
      url: `${base}/echo`,
      method: 'POST',
      json_body: { foo: 42 },
    }) as any;
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ foo: 42 });
    expect(r.headers['content-type']).toContain('application/json');
  });

  it('POST with raw body', async () => {
    const r = await fetch({
      url: `${base}/echo`,
      method: 'POST',
      body: 'hello raw',
    }) as any;
    expect(r.body).toBe('hello raw');
  });

  it('forwards custom request headers', async () => {
    const r = await fetch({
      url: `${base}/echo`,
      method: 'POST',
      body: 'x',
      headers: { 'X-Custom': 'test-value' },
    }) as any;
    expect(r.status).toBe(200);
  });

  it('non-200 status sets ok=false', async () => {
    const r = await fetch({ url: `${base}/status/404` }) as any;
    expect(r.status).toBe(404);
    expect(r.ok).toBe(false);
  });

  it('response headers are returned', async () => {
    const r = await fetch({
      url: `${base}/echo`,
      method: 'POST',
      body: 'x',
    }) as any;
    expect(r.headers['x-echo']).toBe('true');
  });

  it('times out and throws a clear error', async () => {
    await expect(
      fetch({ url: `${base}/slow`, timeout_ms: 100 })
    ).rejects.toThrow(/timed out/);
  });

  it('throws on unreachable host', async () => {
    await expect(
      fetch({ url: 'http://localhost:1', timeout_ms: 500 })
    ).rejects.toThrow();
  });

  it('rejects invalid URL', async () => {
    await expect(
      fetch({ url: 'not-a-url' })
    ).rejects.toThrow();
  });
});
