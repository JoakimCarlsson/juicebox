/// <reference types="npm:@types/frida-gum" />

import type { HookRule } from "./types";
import { getModule, listInterfaces } from "./router";

const appliedRules: HookRule[] = [];

function rulesEqual(a: HookRule, b: HookRule): boolean {
  return (
    a.namespace === b.namespace &&
    a.method === b.method &&
    JSON.stringify(a.args) === JSON.stringify(b.args)
  );
}

function invoke(
  namespace: string,
  method: string,
  args: unknown[],
): unknown {
  const mod = getModule(namespace);
  if (!mod) throw new Error(`unknown namespace: ${namespace}`);

  const fn = mod[method];
  if (typeof fn !== "function") {
    throw new Error(`unknown method: ${namespace}.${method}`);
  }

  const result = fn(...args);

  const rule: HookRule = { namespace, method, args, enabled: true };
  if (!appliedRules.some((r) => rulesEqual(r, rule))) {
    appliedRules.push(rule);
  }

  return result;
}

function restore(rules: HookRule[]): void {
  appliedRules.length = 0;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    try {
      invoke(rule.namespace, rule.method, rule.args);
    } catch (e) {
      console.error(
        `restore failed for ${rule.namespace}.${rule.method}:`,
        e,
      );
    }
  }
}

function snapshot(): HookRule[] {
  return JSON.parse(JSON.stringify(appliedRules));
}

rpc.exports = {
  async invoke(
    namespace: string,
    method: string,
    args: unknown[],
  ): Promise<unknown> {
    return await invoke(namespace, method, args);
  },

  interfaces(): Record<string, string[]> {
    return listInterfaces();
  },

  restore(rules: HookRule[]): void {
    restore(rules);
  },

  snapshot(): HookRule[] {
    return snapshot();
  },

  ping(): string {
    return "pong";
  },
};
