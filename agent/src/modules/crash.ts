/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

let _enabled = false;
let _counter = 0;

const FATAL_TYPES = new Set([
  "abort",
  "illegal-instruction",
  "guard-page",
  "arithmetic",
]);

function generateId(): string {
  return `crash-${Date.now()}-${++_counter}`;
}

function readRegisters(ctx: CpuContext): Record<string, string> {
  const regs: Record<string, string> = {};
  const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(ctx))
    .filter((k) => k !== "constructor" && k !== "toJSON");
  for (const key of keys) {
    try {
      const val = (ctx as any)[key];
      if (val instanceof NativePointer) {
        regs[key] = val.toString();
      }
    } catch (_) {}
  }
  return regs;
}

function enableNative(): void {
  Process.setExceptionHandler((details) => {
    if (!FATAL_TYPES.has(details.type)) return false;

    const frames = Thread.backtrace(details.context, Backtracer.ACCURATE);
    const backtrace = frames.map((addr) => {
      const sym = DebugSymbol.fromAddress(addr);
      return sym.toString();
    });

    const registers = readRegisters(details.context);

    send({
      type: "crash",
      payload: {
        id: generateId(),
        crashType: "native",
        signal: details.type ?? null,
        address: details.address?.toString() ?? null,
        registers,
        backtrace,
        javaStackTrace: null,
        exceptionClass: null,
        exceptionMessage: null,
        timestamp: Date.now(),
      },
    });

    return false;
  });
}

function enableJava(): void {
  if (!Java.available) return;

  setTimeout(() => {
    Java.perform(() => {
      const Thread = Java.use("java.lang.Thread");
      const UncaughtHandler = Java.use("java.lang.Thread$UncaughtExceptionHandler");

      const previousHandler = Thread.getDefaultUncaughtExceptionHandler();

      const CrashHandler = Java.registerClass({
        name: "com.juicebox.CrashHandler",
        implements: [UncaughtHandler],
        methods: {
          uncaughtException(thread: any, throwable: any) {
            try {
              const exceptionClass = throwable.getClass().getName();
              const exceptionMessage = throwable.getMessage()?.toString() ?? "";

              const stackElements = throwable.getStackTrace();
              const lines: string[] = [];
              for (let i = 0; i < stackElements.length; i++) {
                lines.push(stackElements[i].toString());
              }

              let fullTrace = `${exceptionClass}: ${exceptionMessage}`;
              for (const line of lines) {
                fullTrace += `\n    at ${line}`;
              }

              let cause = throwable.getCause();
              while (cause !== null) {
                const causeClass = cause.getClass().getName();
                const causeMsg = cause.getMessage()?.toString() ?? "";
                fullTrace += `\nCaused by: ${causeClass}: ${causeMsg}`;
                const causeStack = cause.getStackTrace();
                for (let i = 0; i < causeStack.length; i++) {
                  fullTrace += `\n    at ${causeStack[i].toString()}`;
                }
                cause = cause.getCause();
              }

              send({
                type: "crash",
                payload: {
                  id: generateId(),
                  crashType: "java",
                  signal: null,
                  address: null,
                  registers: null,
                  backtrace: [],
                  javaStackTrace: fullTrace,
                  exceptionClass,
                  exceptionMessage,
                  timestamp: Date.now(),
                },
              });
            } catch (_) {}

            if (previousHandler !== null) {
              previousHandler.uncaughtException(thread, throwable);
            }
          },
        },
      });

      Thread.setDefaultUncaughtExceptionHandler(CrashHandler.$new());
    });
  }, 0);
}

function enable(): { enabled: boolean } {
  if (_enabled) return { enabled: true };
  enableNative();
  enableJava();
  _enabled = true;
  return { enabled: true };
}

const crash: AgentModule = { enable };
export default crash;
