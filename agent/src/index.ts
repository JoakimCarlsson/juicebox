/// <reference types="npm:@types/frida-gum" />

import { findSslExports, hookSsl, type SslExports } from "./ssl";

const hookedAddresses = new Set<string>();

function hookNewTargets(targets: SslExports[]): void {
  for (const target of targets) {
    const key = target.sslRead.toString() + "|" + target.sslWrite.toString();
    if (hookedAddresses.has(key)) continue;
    hookedAddresses.add(key);
    hookSsl(target);
  }
}

hookNewTargets(findSslExports());

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
