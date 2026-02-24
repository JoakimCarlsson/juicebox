import type { AgentModule } from "./types";
import evasion from "./modules/evasion";
import ssl from "./modules/ssl";
import classes from "./modules/classes";
import crash from "./modules/crash";
import crypto from "./modules/crypto";
import keystore from "./modules/keystore";

const registry: Record<string, AgentModule> = { evasion, ssl, classes, crash, crypto, keystore };

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
