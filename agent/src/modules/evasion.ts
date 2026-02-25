/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

let _fridaApplied = false;
let _rootApplied = false;
let _emulatorApplied = false;

function emitEvasion(
  category: string,
  technique: string,
  detail: string,
): void {
  send({
    type: "evasion",
    payload: { category, technique, detail, timestamp: Date.now() },
  });
}

let _libc: Module | null = null;
function libc(): Module {
  if (!_libc) {
    _libc = Process.findModuleByName("libc.so") ??
      Process.findModuleByName("libc.dylib") ??
      Process.enumerateModules()[0];
  }
  return _libc;
}

function libcExport(name: string): NativePointer | null {
  return libc().findExportByName(name);
}

const FRIDA_MAP_STRINGS = [
  "frida",
  "linjector",
  "gum-js-loop",
  "gmain",
  "gdbus",
  "frida-agent",
];

const ROOT_PATHS = new Set([
  "/system/app/Superuser.apk",
  "/sbin/su",
  "/system/bin/su",
  "/system/xbin/su",
  "/data/local/xbin/su",
  "/data/local/bin/su",
  "/data/local/su",
  "/system/sd/xbin/su",
  "/system/bin/failsafe/su",
  "/su/bin/su",
  "/data/adb/magisk",
  "/sbin/.magisk",
  "/cache/.disable_magisk",
  "/dev/.magisk.unblock",
  "/data/adb/modules",
]);

const ROOT_PACKAGES = new Set([
  "com.topjohnwu.magisk",
  "eu.chainfire.supersu",
  "com.noshufou.android.su",
  "com.koushikdutta.superuser",
  "com.thirdparty.superuser",
  "com.yellowes.su",
  "com.kingroot.kinguser",
  "com.kingo.root",
]);

const EMULATOR_INDICATORS = new Set([
  "sdk",
  "google_sdk",
  "generic",
  "emulator",
  "goldfish",
  "ranchu",
  "vbox86",
  "nox",
  "andy",
  "droid4x",
]);

const FAKE_DEVICE = {
  DEVICE: "sunfish",
  MODEL: "Pixel 4a",
  MANUFACTURER: "Google",
  BRAND: "google",
  PRODUCT: "sunfish",
  BOARD: "sunfish",
  HARDWARE: "sunfish",
  FINGERPRINT:
    "google/sunfish/sunfish:13/TQ3A.230901.001/10750268:user/release-keys",
};

const FRIDA_DETECT_PATHS = new Set([
  "/data/local/tmp/re.frida.server",
  "/data/local/tmp/frida-server",
  "/data/local/tmp/frida-server-arm64",
  "/data/local/tmp/frida-server-arm",
  "/data/local/tmp/frida-server-x86",
  "/data/local/tmp/frida-server-x86_64",
]);

function isFridaDetectPath(path: string | null): boolean {
  if (!path) return false;
  if (FRIDA_DETECT_PATHS.has(path)) return true;
  if (path.startsWith("/tmp/frida-") && !path.includes("/cache/")) return true;
  return false;
}

function scheduleJavaPerform(fn: () => void): void {
  if (!Java.available) return;
  Java.perform(fn);
}

function createCleanMapsFile(): number {
  const openatPtr = libcExport("openat");
  const readPtr = libcExport("read");
  const writePtr = libcExport("write");
  const closePtr = libcExport("close");
  const memfdCreatePtr = libcExport("memfd_create");
  const lseekPtr = libcExport("lseek");

  if (!openatPtr || !readPtr || !writePtr || !closePtr || !lseekPtr) return -1;

  const openat = new NativeFunction(openatPtr, "int", [
    "int",
    "pointer",
    "int",
    "int",
  ]);
  const read = new NativeFunction(readPtr, "int", ["int", "pointer", "int"]);
  const write = new NativeFunction(writePtr, "int", ["int", "pointer", "int"]);
  const close = new NativeFunction(closePtr, "int", ["int"]);
  const lseek = new NativeFunction(lseekPtr, "int", ["int", "int", "int"]);

  const AT_FDCWD = -100;
  const O_RDONLY = 0;
  const mapsPathBuf = Memory.allocUtf8String("/proc/self/maps");
  const mapsFd = openat(
    AT_FDCWD,
    mapsPathBuf,
    O_RDONLY,
    0,
  ) as unknown as number;
  if (mapsFd < 0) return -1;

  const bufSize = 65536;
  const buf = Memory.alloc(bufSize);
  let content = "";

  while (true) {
    const n = read(mapsFd, buf, bufSize) as unknown as number;
    if (n <= 0) break;
    content += buf.readUtf8String(n) ?? "";
  }
  close(mapsFd);

  const filtered = content
    .split("\n")
    .filter((line) => !FRIDA_MAP_STRINGS.some((s) => line.includes(s)))
    .join("\n");

  let memFd = -1;
  if (memfdCreatePtr) {
    const memfdCreate = new NativeFunction(memfdCreatePtr, "int", [
      "pointer",
      "int",
    ]);
    const nameBuf = Memory.allocUtf8String("maps");
    memFd = memfdCreate(nameBuf, 0) as unknown as number;
  }

  if (memFd < 0) return -1;

  const filteredBuf = Memory.allocUtf8String(filtered);
  write(memFd, filteredBuf, filtered.length);
  lseek(memFd, 0, 0);

  return memFd;
}

function bypassFrida(): { applied: boolean } {
  if (_fridaApplied) return { applied: true };

  const openatPtr = libcExport("openat");
  const dupPtr = libcExport("dup");
  const lseekPtr = libcExport("lseek");

  if (openatPtr && dupPtr && lseekPtr) {
    const origOpenat = new NativeFunction(openatPtr, "int", [
      "int",
      "pointer",
      "int",
      "int",
    ]);
    const dup = new NativeFunction(dupPtr, "int", ["int"]);
    const lseek = new NativeFunction(lseekPtr, "int", ["int", "int", "int"]);

    const cleanMapsFd = createCleanMapsFile();

    if (cleanMapsFd >= 0) {
      Interceptor.replace(
        openatPtr,
        new NativeCallback(
          (
            dirfd: number,
            pathnamePtr: NativePointer,
            flags: number,
            mode: number,
          ): number => {
            let path: string | null = null;
            try {
              path = pathnamePtr.readUtf8String();
            } catch (_) {}

            if (path === "/proc/self/maps" || path === "/proc/self/smaps") {
              lseek(cleanMapsFd, 0, 0);
              const fd = dup(cleanMapsFd) as unknown as number;
              if (fd >= 0) return fd;
            }

            if (isFridaDetectPath(path)) {
              return -1;
            }

            return origOpenat(
              dirfd,
              pathnamePtr,
              flags,
              mode,
            ) as unknown as number;
          },
          "int",
          ["int", "pointer", "int", "int"],
        ),
      );
      emitEvasion(
        "frida",
        "openat_replace",
        "openat replaced: /proc/self/maps → clean memfd",
      );
    }
  }

  const pthreadCreatePtr = libcExport("pthread_create");
  if (pthreadCreatePtr) {
    Interceptor.attach(pthreadCreatePtr, {
      onEnter(args) {
        const startRoutine = args[2];
        try {
          const mod = Process.findModuleByAddress(startRoutine);
          if (mod) {
            const name = mod.name.toLowerCase();
            if (
              name.includes("msaoaidsec") ||
              name.includes("sgsecuritysdk") ||
              name.includes("dexhelper") ||
              name.includes("jiagu") ||
              name.includes("secneo") ||
              name.includes("bangcle") ||
              name.includes("ijiami")
            ) {
              args[2] = new NativeCallback(() => ptr(0), "pointer", [
                "pointer",
              ]);
              emitEvasion(
                "frida",
                "pthread_block",
                `blocked security thread from ${mod.name}`,
              );
            }
          }
        } catch (_) {}
      },
    });
  }

  scheduleJavaPerform(() => {
    try {
      const BufferedReader = Java.use("java.io.BufferedReader");
      BufferedReader.readLine.overload().implementation = function ():
        | string
        | null {
        const line: string | null = this.readLine();
        if (
          line !== null &&
          (line.includes("frida") || line.includes("linjector") ||
            line.includes("gum-js-loop"))
        ) {
          emitEvasion(
            "frida",
            "readline_filter",
            "filtered frida string from readLine()",
          );
          return this.readLine();
        }
        return line;
      };
    } catch (_) {}

    try {
      const Socket = Java.use("java.net.Socket");
      const InetSocketAddress = Java.use("java.net.InetSocketAddress");
      Socket.connect.overload("java.net.SocketAddress", "int").implementation =
        function (addr: any, timeout: number): void {
          try {
            const inetAddr = Java.cast(addr, InetSocketAddress);
            const port = inetAddr.getPort();
            const host = inetAddr.getHostString();
            if (
              port === 27042 && (host === "127.0.0.1" || host === "localhost")
            ) {
              emitEvasion(
                "frida",
                "java_connect_block",
                `blocked Socket.connect to ${host}:${port}`,
              );
              throw Java.use("java.net.ConnectException").$new(
                "Connection refused",
              );
            }
          } catch (e: any) {
            if (e.$className) throw e;
          }
          return this.connect(addr, timeout);
        };
    } catch (_) {}

    emitEvasion(
      "frida",
      "java_hooks_ready",
      "frida Java-level hooks installed",
    );
  });

  _fridaApplied = true;
  return { applied: true };
}

function bypassRoot(): { applied: boolean } {
  if (_rootApplied) return { applied: true };

  scheduleJavaPerform(() => {
    try {
      const File = Java.use("java.io.File");
      File.exists.implementation = function (): boolean {
        const path: string = this.getAbsolutePath();
        if (ROOT_PATHS.has(path)) {
          emitEvasion(
            "root",
            "file_exists_hide",
            `File.exists("${path}") → false`,
          );
          return false;
        }
        if (isFridaDetectPath(path)) {
          emitEvasion(
            "frida",
            "file_exists_hide",
            `File.exists("${path}") → false`,
          );
          return false;
        }
        return this.exists();
      };
    } catch (_) {}

    try {
      const Runtime = Java.use("java.lang.Runtime");
      Runtime.exec.overload("java.lang.String").implementation = function (
        cmd: string,
      ): any {
        if (cmd && (cmd.includes("which su") || cmd === "su")) {
          emitEvasion(
            "root",
            "runtime_exec_hide",
            `Runtime.exec("${cmd}") → empty`,
          );
          return this.exec("echo");
        }
        return this.exec(cmd);
      };
    } catch (_) {}

    try {
      const Runtime = Java.use("java.lang.Runtime");
      Runtime.exec.overload("[Ljava.lang.String;").implementation = function (
        cmds: any,
      ): any {
        try {
          const arr: string[] = [];
          for (let i = 0; i < cmds.length; i++) arr.push(String(cmds[i]));
          const joined = arr.join(" ");
          if (
            joined.includes("which su") || (arr.length === 1 && arr[0] === "su")
          ) {
            emitEvasion(
              "root",
              "runtime_exec_arr_hide",
              `Runtime.exec(${JSON.stringify(arr)}) → empty`,
            );
            return this.exec(["echo"]);
          }
        } catch (_) {}
        return this.exec(cmds);
      };
    } catch (_) {}

    try {
      const PMAbstract = Java.use("android.app.ApplicationPackageManager");
      PMAbstract.getPackageInfo.overload("java.lang.String", "int")
        .implementation = function (name: string, flags: number): any {
          if (ROOT_PACKAGES.has(name)) {
            emitEvasion(
              "root",
              "pkg_hide",
              `getPackageInfo("${name}") → NameNotFoundException`,
            );
            throw Java.use(
              "android.content.pm.PackageManager$NameNotFoundException",
            ).$new(name);
          }
          return this.getPackageInfo(name, flags);
        };
    } catch (_) {}

    try {
      const Build = Java.use("android.os.Build");
      const tagsField = Build.class.getDeclaredField("TAGS");
      tagsField.setAccessible(true);
      const currentTags = String(tagsField.get(null) ?? "");
      if (currentTags.includes("test-keys")) {
        tagsField.set(null, Java.use("java.lang.String").$new("release-keys"));
        emitEvasion("root", "build_tags_fix", "Build.TAGS → release-keys");
      }
    } catch (_) {}

    emitEvasion("root", "java_hooks_ready", "root Java-level hooks installed");
  });

  _rootApplied = true;
  return { applied: true };
}

function bypassEmulator(): { applied: boolean } {
  if (_emulatorApplied) return { applied: true };

  scheduleJavaPerform(() => {
    try {
      const Build = Java.use("android.os.Build");
      const fields = [
        "DEVICE",
        "MODEL",
        "MANUFACTURER",
        "BRAND",
        "PRODUCT",
        "BOARD",
        "HARDWARE",
        "FINGERPRINT",
      ] as const;

      for (const name of fields) {
        try {
          const field = Build.class.getDeclaredField(name);
          field.setAccessible(true);
          const current = String(field.get(null) ?? "");
          const lower = current.toLowerCase();
          if (
            EMULATOR_INDICATORS.has(lower) || lower.includes("generic") ||
            lower.includes("emulator") || lower.includes("sdk")
          ) {
            const fake = FAKE_DEVICE[name as keyof typeof FAKE_DEVICE];
            if (fake) {
              field.set(null, Java.use("java.lang.String").$new(fake));
              emitEvasion(
                "emulator",
                "build_field_spoof",
                `Build.${name}: "${current}" → "${fake}"`,
              );
            }
          }
        } catch (_) {}
      }
    } catch (_) {}

    try {
      const TelephonyManager = Java.use("android.telephony.TelephonyManager");
      TelephonyManager.getNetworkOperatorName.implementation =
        function (): string {
          const original: string = this.getNetworkOperatorName();
          if (original === "Android" || original === "" || original === null) {
            emitEvasion(
              "emulator",
              "telephony_operator",
              `getNetworkOperatorName: "${original}" → "T-Mobile"`,
            );
            return "T-Mobile";
          }
          return original;
        };
    } catch (_) {}

    try {
      const TelephonyManager = Java.use("android.telephony.TelephonyManager");
      TelephonyManager.getDeviceId.overload().implementation =
        function (): string {
          const original: string = this.getDeviceId();
          if (!original || /^[0]+$/.test(original) || /^[1]+$/.test(original)) {
            emitEvasion(
              "emulator",
              "telephony_imei",
              `getDeviceId: "${original}" → spoofed`,
            );
            return "358240051111110";
          }
          return original;
        };
    } catch (_) {}

    try {
      const TelephonyManager = Java.use("android.telephony.TelephonyManager");
      TelephonyManager.getLine1Number.implementation = function (): string {
        const original: string = this.getLine1Number();
        if (original === "15555215554" || original === "15555215556") {
          emitEvasion(
            "emulator",
            "telephony_phone",
            `getLine1Number: "${original}" → spoofed`,
          );
          return "";
        }
        return original;
      };
    } catch (_) {}

    emitEvasion(
      "emulator",
      "java_hooks_ready",
      "emulator Java-level hooks installed",
    );
  });

  _emulatorApplied = true;
  return { applied: true };
}

const evasion: AgentModule = { bypassFrida, bypassRoot, bypassEmulator };
export default evasion;
