/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

const MAX_RESULTS = 500;

function withJava<T>(
  fallback: T,
  fn: (resolve: (v: T) => void) => void,
): Promise<T> {
  if (!Java.available) return Promise.resolve(fallback);
  return new Promise<T>((resolve) => {
    Java.perform(() => {
      fn(resolve);
    });
  });
}

function list(query: unknown): Promise<string[]> {
  return withJava([] as string[], (resolve) => {
    const q = String(query ?? "").toLowerCase();
    const all = Java.enumerateLoadedClassesSync();
    const filtered = q ? all.filter((c) => c.toLowerCase().includes(q)) : all;
    filtered.sort();
    resolve(filtered.slice(0, MAX_RESULTS));
  });
}

interface MethodInfo {
  name: string;
  parameterTypes: string[];
  returnType: string;
  modifiers: number;
}

interface FieldInfo {
  name: string;
  type: string;
  modifiers: number;
  value: unknown;
}

interface ClassDetail {
  className: string;
  methods: MethodInfo[];
  fields: FieldInfo[];
  interfaces: string[];
  superclasses: string[];
}

function detail(className: unknown): Promise<ClassDetail> {
  const cls = String(className);
  const empty: ClassDetail = {
    className: cls,
    methods: [],
    fields: [],
    interfaces: [],
    superclasses: [],
  };

  return withJava(empty, (resolve) => {
    const result: ClassDetail = {
      className: cls,
      methods: [],
      fields: [],
      interfaces: [],
      superclasses: [],
    };

    const wrapper = Java.use(cls);
    const jclass = wrapper.class;

    const methods = jclass.getDeclaredMethods();
    for (let i = 0; i < methods.length; i++) {
      const m = methods[i];
      const params = m.getParameterTypes();
      const paramTypes: string[] = [];
      for (let j = 0; j < params.length; j++) {
        paramTypes.push(params[j].getName());
      }
      result.methods.push({
        name: m.getName(),
        parameterTypes: paramTypes,
        returnType: m.getReturnType().getName(),
        modifiers: m.getModifiers(),
      });
    }

    const fields = jclass.getDeclaredFields();
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const mods: number = f.getModifiers();
      let value: unknown = null;
      const isStatic = (mods & 0x0008) !== 0;
      if (isStatic) {
        try {
          f.setAccessible(true);
          const raw = f.get(null);
          if (raw !== null && raw !== undefined) {
            value = String(raw);
          }
        } catch (_) {
          // non-readable field
        }
      }
      result.fields.push({
        name: f.getName(),
        type: f.getType().getName(),
        modifiers: mods,
        value,
      });
    }

    const ifaces = jclass.getInterfaces();
    for (let i = 0; i < ifaces.length; i++) {
      result.interfaces.push(ifaces[i].getName());
    }

    let sup = jclass.getSuperclass();
    while (sup !== null) {
      const name = sup.getName();
      result.superclasses.push(name);
      if (name === "java.lang.Object") break;
      sup = sup.getSuperclass();
    }

    resolve(result);
  });
}

function invokeMethod(
  className: unknown,
  methodName: unknown,
  args: unknown,
): Promise<unknown> {
  return withJava<unknown>({ error: "Java not available" }, (resolve) => {
    const cn = String(className);
    const mn = String(methodName);
    const a: string[] = Array.isArray(args) ? (args as string[]) : [];

    const wrapper = Java.use(cn);
    const jclass = wrapper.class;
    const jmethod = jclass.getDeclaredMethods().find(
      (m: any) => m.getName() === mn,
    );
    if (!jmethod) {
      resolve({ error: `method ${mn} not found on ${cn}` });
      return;
    }

    const isStatic = (jmethod.getModifiers() & 0x0008) !== 0;
    if (!isStatic) {
      resolve({
        error:
          `${mn} is an instance method — invoke requires a live object reference`,
      });
      return;
    }

    try {
      const method = wrapper[mn];
      if (!method) {
        resolve({ error: `method ${mn} not accessible on ${cn}` });
        return;
      }
      const ret = a.length === 0
        ? method.call(wrapper)
        : method.call(wrapper, ...a);
      resolve({
        value: ret !== null && ret !== undefined ? String(ret) : null,
      });
    } catch (e: any) {
      resolve({ error: String(e.message ?? e) });
    }
  });
}

function readField(className: unknown, fieldName: unknown): Promise<unknown> {
  return withJava<unknown>({ error: "Java not available" }, (resolve) => {
    const cn = String(className);
    const fn = String(fieldName);

    try {
      const wrapper = Java.use(cn);
      const jclass = wrapper.class;
      const f = jclass.getDeclaredField(fn);
      f.setAccessible(true);
      const raw = f.get(null);
      resolve({
        value: raw !== null && raw !== undefined ? String(raw) : null,
      });
    } catch (e: any) {
      resolve({ error: String(e.message ?? e) });
    }
  });
}

const classes: AgentModule = { list, detail, invokeMethod, readField };
export default classes;
