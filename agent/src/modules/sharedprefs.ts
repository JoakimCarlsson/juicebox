/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

interface SharedPrefEntry {
  key: string;
  value: string;
  type: string;
}

interface SharedPrefsFile {
  name: string;
  path: string;
  encrypted: boolean;
  entries: SharedPrefEntry[];
}

const TINK_KEYS = [
  "__androidx_security_crypto_encrypted_prefs_key_keyset__",
  "__androidx_security_crypto_encrypted_prefs_value_keyset__",
];

function extractEntries(map: any): SharedPrefEntry[] {
  const entries: SharedPrefEntry[] = [];
  const entrySet = map.entrySet();
  const iterator = entrySet.iterator();

  while (iterator.hasNext()) {
    const entry = iterator.next();
    const k = entry.getKey().toString();
    const v = entry.getValue();

    if (v === null) {
      entries.push({ key: k, value: "null", type: "null" });
      continue;
    }

    const cls = v.getClass().getName();

    if (cls === "java.lang.String") {
      entries.push({ key: k, value: v.toString(), type: "string" });
    } else if (cls === "java.lang.Integer") {
      entries.push({ key: k, value: v.toString(), type: "int" });
    } else if (cls === "java.lang.Long") {
      entries.push({ key: k, value: v.toString(), type: "long" });
    } else if (cls === "java.lang.Float") {
      entries.push({ key: k, value: v.toString(), type: "float" });
    } else if (cls === "java.lang.Boolean") {
      entries.push({ key: k, value: v.toString(), type: "boolean" });
    } else if (cls === "java.util.HashSet" || cls.includes("Set")) {
      const setIter = v.iterator();
      const items: string[] = [];
      while (setIter.hasNext()) {
        items.push(setIter.next().toString());
      }
      entries.push({ key: k, value: JSON.stringify(items), type: "string_set" });
    } else {
      entries.push({ key: k, value: v.toString(), type: cls });
    }
  }

  return entries;
}

function isEncrypted(entries: SharedPrefEntry[]): boolean {
  return entries.some((e) => TINK_KEYS.includes(e.key));
}

function enumerate(): SharedPrefsFile[] | Promise<SharedPrefsFile[]> {
  if (!Java.available) return [];

  return new Promise<SharedPrefsFile[]>((resolve) => {
    Java.perform(() => {
      const results: SharedPrefsFile[] = [];

      try {
        const ActivityThread = Java.use("android.app.ActivityThread");
        const context = ActivityThread.currentApplication().getApplicationContext();
        const dataDir = context.getFilesDir().getParent();
        const prefsDir = Java.use("java.io.File").$new(dataDir, "shared_prefs");

        if (!prefsDir.exists() || !prefsDir.isDirectory()) {
          resolve([]);
          return;
        }

        const files = prefsDir.listFiles();
        if (files === null) {
          resolve([]);
          return;
        }

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fileName = file.getName();
          if (!fileName.endsWith(".xml")) continue;

          const prefsName = fileName.replace(/\.xml$/, "");
          const filePath = file.getAbsolutePath();

          try {
            const prefs = context.getSharedPreferences(prefsName, 0);
            const all = prefs.getAll();
            const entries = extractEntries(all);
            const encrypted = isEncrypted(entries);

            results.push({
              name: prefsName,
              path: filePath,
              encrypted,
              entries: encrypted
                ? entries.filter((e) => !TINK_KEYS.includes(e.key))
                : entries,
            });
          } catch (_) {
            results.push({
              name: prefsName,
              path: filePath,
              encrypted: false,
              entries: [],
            });
          }
        }
      } catch (_) {}

      resolve(results);
    });
  });
}

const sharedprefs: AgentModule = { enumerate };
export default sharedprefs;
