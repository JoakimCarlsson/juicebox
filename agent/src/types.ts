export type ModuleFn = (...args: unknown[]) => unknown | Promise<unknown>;

export interface AgentModule {
  [method: string]: ModuleFn;
}

export interface HookRule {
  namespace: string;
  method: string;
  args: unknown[];
  enabled: boolean;
}
