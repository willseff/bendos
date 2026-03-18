import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { z } from 'zod';
import { registerTool } from './registry';

interface ExecManifest {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  exec: string;
}

// Loads external tools from a directory.
//
// Two formats are supported:
//   .json  — exec manifest: defines name/description/schema + an executable to call.
//            The executable receives JSON on stdin and must write JSON to stdout.
//   .js/.ts — module tool: must export a ToolDefinition as default or module.exports.
//
// Example exec manifest (tools/echo.json):
//   { "name": "echo", "exec": "node tools/echo.js", ... }
//
// Example module tool (tools/my-tool.js):
//   module.exports = { name: '...', description: '...', inputSchema: z.object({...}), execute: async () => {} }
export function loadExternalTools(dir: string): void {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));

  for (const file of files) {
    const fullPath = path.resolve(dir, file);
    const ext = path.extname(file);

    try {
      if (ext === '.json') {
        loadExecTool(fullPath);
      } else if (ext === '.js' || ext === '.ts') {
        // Skip if a companion .json manifest exists — that file is an exec runner, not a module.
        const hasManifest = fs.existsSync(fullPath.replace(/\.(js|ts)$/, '.json'));
        if (!hasManifest) loadModuleTool(fullPath);
      }
    } catch (err) {
      console.warn(`[loader] Failed to load tool from ${file}:`, err instanceof Error ? err.message : err);
    }
  }
}

function loadExecTool(manifestPath: string): void {
  const manifest: ExecManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (!manifest.name || !manifest.exec) {
    throw new Error(`Invalid manifest: missing name or exec field`);
  }

  registerTool({
    name: manifest.name,
    description: manifest.description ?? '',
    // Accept any object input — the external process handles its own validation.
    inputSchema: z.record(z.unknown()),
    async execute(input) {
      const result = spawnSync(manifest.exec, {
        input: JSON.stringify(input),
        encoding: 'utf8',
        shell: true,
        timeout: 30_000,
        cwd: process.cwd(),
      });

      if (result.error) throw new Error(`Exec failed: ${result.error.message}`);
      if (result.status !== 0) {
        throw new Error(`Tool exited ${result.status}: ${result.stderr?.trim()}`);
      }

      return JSON.parse(result.stdout);
    },
  });
}

function loadModuleTool(toolPath: string): void {
  // require() works for both .js and .ts when running under tsx.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(toolPath);
  const def = mod.default ?? mod;
  if (!def.name || !def.execute) {
    throw new Error(`Module must export { name, description, inputSchema, execute }`);
  }
  registerTool(def);
}
