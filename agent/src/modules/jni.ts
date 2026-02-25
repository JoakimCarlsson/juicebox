/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

let _enabled = false;
let _counter = 0;
let _interceptors: InvocationListener[] = [];
let _filter: { library?: string; method?: string } = {};

function generateId(): string {
  return `jni-${Date.now()}-${++_counter}`;
}

interface NativeRegistration {
  className: string;
  methodName: string;
  signature: string;
  fnPtr: NativePointer;
  library: string | null;
}

const registrations: NativeRegistration[] = [];

function resolveLibrary(addr: NativePointer): string | null {
  try {
    const mod = Process.findModuleByAddress(addr);
    return mod ? mod.name : null;
  } catch (_) {
    return null;
  }
}

function formatBacktrace(ctx: CpuContext): string[] {
  try {
    return Thread.backtrace(ctx, Backtracer.ACCURATE).map((addr) => {
      const sym = DebugSymbol.fromAddress(addr);
      return sym.toString();
    });
  } catch (_) {
    return [];
  }
}

function serializeValue(val: any): string | null {
  if (val === null || val === undefined) return null;
  try {
    return String(val);
  } catch (_) {
    return "[unserializable]";
  }
}

function matchesFilter(reg: NativeRegistration): boolean {
  if (_filter.library && reg.library && !reg.library.toLowerCase().includes(_filter.library.toLowerCase())) {
    return false;
  }
  if (_filter.method && !reg.methodName.toLowerCase().includes(_filter.method.toLowerCase())) {
    return false;
  }
  return true;
}

function attachToRegistration(reg: NativeRegistration): void {
  if (!matchesFilter(reg)) return;

  try {
    const listener = Interceptor.attach(reg.fnPtr, {
      onEnter(args: InvocationArguments) {
        (this as any).__jni_reg = reg;
        (this as any).__jni_args = [];
        for (let i = 0; i < 8; i++) {
          try {
            const ptr = args[i];
            if (ptr.isNull()) break;
            (this as any).__jni_args.push(ptr.toString());
          } catch (_) {
            break;
          }
        }
        (this as any).__jni_bt = formatBacktrace(this.context);
      },
      onLeave(retval: InvocationReturnValue) {
        const r = (this as any).__jni_reg as NativeRegistration;
        send({
          type: "jni",
          payload: {
            id: generateId(),
            className: r.className,
            methodName: r.methodName,
            signature: r.signature,
            arguments: (this as any).__jni_args ?? [],
            returnValue: serializeValue(retval),
            backtrace: (this as any).__jni_bt ?? [],
            library: r.library,
            timestamp: Date.now(),
          },
        });
      },
    });
    _interceptors.push(listener);
  } catch (_) {}
}

function hookRegisterNatives(): void {
  const artModule = Process.findModuleByName("libart.so");
  if (!artModule) return;

  const symbols = artModule.enumerateExports();
  let registerNativesAddr: NativePointer | null = null;

  for (const sym of symbols) {
    if (sym.name.includes("RegisterNatives") && sym.type === "function") {
      registerNativesAddr = sym.address;
      break;
    }
  }

  if (!registerNativesAddr) {
    const resolver = new ApiResolver("module");
    const matches = resolver.enumerateMatches("exports:libart.so!*RegisterNatives*");
    if (matches.length > 0) {
      registerNativesAddr = matches[0].address;
    }
  }

  if (!registerNativesAddr) return;

  const listener = Interceptor.attach(registerNativesAddr, {
    onEnter(args: InvocationArguments) {
      const env = args[0];
      const jclass = args[1];
      const methodsPtr = args[2];
      const nMethods = args[3].toInt32();

      if (nMethods <= 0 || nMethods > 1000) return;

      let className = "unknown";
      try {
        if (Java.available) {
          const envHandle = Java.vm.tryGetEnv();
          if (envHandle) {
            className = envHandle.getClassName(jclass);
          }
        }
      } catch (_) {}

      const ptrSize = Process.pointerSize;
      const entrySize = ptrSize * 3;

      for (let i = 0; i < nMethods; i++) {
        try {
          const entry = methodsPtr.add(i * entrySize);
          const namePtr = entry.readPointer();
          const sigPtr = entry.add(ptrSize).readPointer();
          const fnPtr = entry.add(ptrSize * 2).readPointer();

          const methodName = namePtr.readUtf8String() ?? "unknown";
          const signature = sigPtr.readUtf8String() ?? "";
          const library = resolveLibrary(fnPtr);

          const reg: NativeRegistration = { className, methodName, signature, fnPtr, library };
          registrations.push(reg);
          attachToRegistration(reg);
        } catch (_) {}
      }
    },
  });
  _interceptors.push(listener);
}

function hookExistingNatives(): void {
  if (!Java.available) return;

  Java.perform(() => {
    try {
      const patterns = _filter.method
        ? [`*!${_filter.method}*`]
        : ["*!native*"];

      Java.enumerateMethods(patterns[0])?.forEach((group: any) => {
        const loader = group.loader;
        const classes = group.classes;
        if (!classes) return;

        classes.forEach((cls: any) => {
          const className = cls.name;
          const methods = cls.methods;
          if (!methods) return;

          methods.forEach((methodName: string) => {
            if (!methodName.includes("native")) return;
            try {
              const wrapper = Java.use(className);
              const method = wrapper[methodName];
              if (!method || !method.implementation) return;
            } catch (_) {}
          });
        });
      });
    } catch (_) {}
  });
}

function enable(filter?: unknown): { enabled: boolean; registrations: number } {
  if (_enabled) {
    return { enabled: true, registrations: registrations.length };
  }

  if (filter && typeof filter === "object") {
    _filter = filter as { library?: string; method?: string };
  }

  hookRegisterNatives();
  hookExistingNatives();

  _enabled = true;
  return { enabled: true, registrations: registrations.length };
}

function disable(): { disabled: boolean } {
  for (const listener of _interceptors) {
    listener.detach();
  }
  _interceptors = [];
  registrations.length = 0;
  _enabled = false;
  _filter = {};
  return { disabled: true };
}

const jni: AgentModule = { enable, disable };
export default jni;
