import type { AgentModule } from "./types";
import ssl from "./modules/ssl";
import classes from "./modules/classes";

const registry: Record<string, AgentModule> = { ssl, classes };

export function getModule(namespace: string): AgentModule | undefined {
  return registry[namespace];
}

export function listInterfaces(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [ns, mod] of Object.entries(registry)) {
    result[ns] = Object.keys(mod).filter((k) => typeof mod[k] === "function");
  }
  return result;
}
