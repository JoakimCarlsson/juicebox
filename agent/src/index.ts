/// <reference types="npm:@types/frida-gum" />

import { findSslExports, hookSsl, type SslExports } from "./ssl";

send({ type: "ready", payload: { pid: Process.id } });

const hookedAddresses = new Set<string>();

function hookNewTargets(targets: SslExports[]): void {
  for (const target of targets) {
    const key = target.sslRead.toString() + "|" + target.sslWrite.toString();
    if (hookedAddresses.has(key)) continue;
    hookedAddresses.add(key);

    send({
      type: "log",
      payload: {
        message: "hooking SSL in " + target.moduleName +
          " (read=" + target.sslRead +
          " write=" + target.sslWrite +
          " free=" + target.sslFree + ")",
      },
    });
    hookSsl(target);
  }
}

hookNewTargets(findSslExports());

if (hookedAddresses.size === 0) {
  send({ type: "log", payload: { message: "no SSL exports found yet, watching for new modules" } });
} else {
  send({ type: "log", payload: { message: "hooked " + hookedAddresses.size + " SSL module(s)" } });
}

const SSL_LIB_PATTERN = /ssl|crypto|boring|flutter|cronet|conscrypt|curl/i;

Process.attachModuleObserver({
  onAdded(mod) {
    if (!SSL_LIB_PATTERN.test(mod.name)) return;
    try {
      hookNewTargets(findSslExports());
    } catch (_) {}
  },
});

rpc.exports = {
  ping(): string {
    return "pong";
  },
};
