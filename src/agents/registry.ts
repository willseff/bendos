export type RestartPolicy = 'never' | 'on-failure' | 'always';

export interface AgentDef {
  name: string;
  description: string;
  systemPrompt: string;
  capabilities?: string[];
  maxSteps?: number;
  restart?: RestartPolicy;
}

const registry = new Map<string, AgentDef>();

export function registerAgent(def: AgentDef): void {
  registry.set(def.name, def);
}

export function getAgent(name: string): AgentDef | undefined {
  return registry.get(name);
}

export function listAgents(): AgentDef[] {
  return Array.from(registry.values());
}
