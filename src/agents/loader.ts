import fs from 'fs';
import path from 'path';
import { registerAgent } from './registry';
import type { AgentDef } from './registry';

export function loadAgents(dir: string): void {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.'));

  for (const file of files) {
    const fullPath = path.resolve(dir, file);
    try {
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as AgentDef;
      if (!raw.name || !raw.systemPrompt) {
        console.warn(`[agents] Skipping ${file}: missing name or systemPrompt`);
        continue;
      }
      registerAgent(raw);
    } catch (err) {
      console.warn(`[agents] Failed to load ${file}:`, err instanceof Error ? err.message : err);
    }
  }
}
