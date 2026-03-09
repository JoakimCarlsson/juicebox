// @ts-nocheck
/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";

let _applied = false;

function enable(proxyPort: number): { applied: boolean } {
  if (_applied) return { applied: true };

  const libc = Process.findModuleByName("libc.so");
  if (!libc) return { applied: false };
  const connectPtr = libc.findExportByName("connect");
  if (!connectPtr) return { applied: false };

  const port = proxyPort | 0;

  Interceptor.attach(connectPtr, {
    onEnter(args) {
      const addr = args[1];
      const family = addr.readU16();
      if (family !== 2) return;

      const portHi = addr.add(2).readU8();
      const portLo = addr.add(3).readU8();
      const origPort = (portHi << 8) | portLo;

      if (origPort !== 80 && origPort !== 443) return;

      const ip0 = addr.add(4).readU8();
      if (ip0 === 127) return;

      addr.add(2).writeU8((port >>> 8) & 0xff);
      addr.add(3).writeU8(port & 0xff);
      addr.add(4).writeU8(127);
      addr.add(5).writeU8(0);
      addr.add(6).writeU8(0);
      addr.add(7).writeU8(1);
    },
  });

  _applied = true;
  return { applied: true };
}

const proxyredirect: AgentModule = { enable };
export default proxyredirect;
