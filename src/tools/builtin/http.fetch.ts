import { z } from 'zod';
import { registerTool } from '../registry';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES     = 512 * 1024; // 512 KB response cap

registerTool({
  name: 'http.fetch',
  description:
    'Make an outbound HTTP request. Returns status, headers, and body. ' +
    'Use json_body to POST/PUT JSON (Content-Type is set automatically). ' +
    'Response body is truncated at 512 KB. Timeout defaults to 15 s.',
  inputSchema: z.object({
    url:         z.string().url(),
    method:      z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
    headers:     z.record(z.string()).optional().describe('Additional request headers'),
    body:        z.string().optional().describe('Raw request body string'),
    json_body:   z.unknown().optional().describe('JSON request body — sets Content-Type: application/json'),
    timeout_ms:  z.number().int().min(100).max(60_000).default(DEFAULT_TIMEOUT_MS),
  }),

  async execute(input) {
    const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    const headers: Record<string, string> = { ...(input.headers ?? {}) };
    let body: string | undefined;

    if (input.json_body !== undefined) {
      body = JSON.stringify(input.json_body);
      headers['Content-Type'] = 'application/json';
    } else if (input.body !== undefined) {
      body = input.body;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(input.url, {
        method:  input.method,
        headers,
        body,
        signal:  controller.signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('aborted') || msg.includes('abort');
      throw new Error(isTimeout ? `Request timed out after ${timeoutMs}ms` : `Fetch failed: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    // Read body with size cap.
    const reader = response.body?.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    let truncated = false;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          // Keep what we have, mark truncated, cancel the stream.
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }

    const bodyText = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');

    // Collect response headers.
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });

    // Try to parse JSON if content-type says so.
    const contentType = responseHeaders['content-type'] ?? '';
    let json: unknown;
    if (contentType.includes('application/json') && !truncated) {
      try { json = JSON.parse(bodyText); } catch { /* leave undefined */ }
    }

    return {
      status:    response.status,
      ok:        response.ok,
      headers:   responseHeaders,
      body:      bodyText,
      ...(json !== undefined ? { json } : {}),
      ...(truncated ? { truncated: true } : {}),
    };
  },
});
