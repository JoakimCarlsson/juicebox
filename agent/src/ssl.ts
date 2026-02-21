import { onWrite, onRead, onReadBytes, onFree, needsData } from "./connection";

const MAX_READ_SIZE = 32768;

export interface SslExports {
  moduleName: string;
  sslRead: NativePointer;
  sslWrite: NativePointer;
  sslFree: NativePointer;
}

const SKIP_MODULES = /^lib(javacrypto|conscrypt_jni|conscrypt_gmscore_jni)\b/i;

export function findSslExports(): SslExports[] {
  const results: SslExports[] = [];
  const seen = new Set<string>();

  const modules = Process.enumerateModules();
  for (const mod of modules) {
    if (SKIP_MODULES.test(mod.name)) continue;

    const sslRead = mod.findExportByName("SSL_read");
    const sslWrite = mod.findExportByName("SSL_write");

    if (!sslRead || !sslWrite) continue;

    const key = sslRead.toString() + "|" + sslWrite.toString();
    if (seen.has(key)) continue;
    seen.add(key);

    const sslFree = mod.findExportByName("SSL_free");
    if (!sslFree) continue;

    results.push({ moduleName: mod.name, sslRead, sslWrite, sslFree });
  }

  return results;
}

function safeReadBytes(buf: NativePointer, size: number): Uint8Array | null {
  if (size <= 0 || size > MAX_READ_SIZE) return null;
  try {
    const ab = buf.readVolatile(size);
    if (!ab || ab.byteLength === 0) return null;
    return new Uint8Array(ab);
  } catch (_) {
    return null;
  }
}

export function hookSsl(exports: SslExports): void {
  Interceptor.attach(exports.sslWrite, {
    onEnter(args) {
      try {
        if (args[0].isNull() || args[1].isNull()) return;
        const num = args[2].toInt32();
        if (num <= 0) return;

        const key = args[0].toString();
        const readSize = num < MAX_READ_SIZE ? num : MAX_READ_SIZE;
        const data = safeReadBytes(args[1], readSize);
        if (data) onWrite(key, data, num);
      } catch (_) {}
    },
  });

  Interceptor.attach(exports.sslRead, {
    onEnter(args) {
      try {
        if (args[0].isNull() || args[1].isNull()) return;
        this.ssl = args[0].toString();
        this.buf = args[1];
      } catch (_) {
        this.ssl = null;
      }
    },
    onLeave(retval) {
      if (!this.ssl) return;
      const bytesRead = retval.toInt32();
      if (bytesRead <= 0) return;

      try {
        if (!needsData(this.ssl)) {
          onReadBytes(this.ssl, bytesRead);
          return;
        }
        const data = safeReadBytes(this.buf, bytesRead);
        if (data) onRead(this.ssl, data);
      } catch (_) {}
    },
  });

  Interceptor.attach(exports.sslFree, {
    onEnter(args) {
      try {
        if (args[0].isNull()) return;
        onFree(args[0].toString());
      } catch (_) {}
    },
  });
}
