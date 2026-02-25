export interface CrashEvent {
  id: string;
  crashType: string;
  signal?: string;
  address?: string;
  registers?: Record<string, string>;
  backtrace?: string[];
  javaStackTrace?: string;
  exceptionClass?: string;
  exceptionMessage?: string;
  timestamp: number;
}

export interface CryptoEvent {
  id: string;
  operation: string;
  algorithm: string;
  input?: string;
  output?: string;
  key?: string;
  iv?: string;
  timestamp: number;
}

export interface ScriptOutputEvent {
  type: "script_output";
  payload: unknown;
}

export interface LogEvent {
  type: "log";
  payload: {
    level: string;
    source: string;
    message: string;
  };
}

export interface DetachedEvent {
  type: "detached";
  reason: string;
  crash: { summary: string; report: string } | null;
}
