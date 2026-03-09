import frida from "frida";
import { resolve } from "node:path";
import { exec } from "./utils.ts";

const SIDECAR_ROOT = resolve(import.meta.dirname!, "..");
export const BIN_DIR = resolve(SIDECAR_ROOT, "bin");
export const DEVICE_SERVER_PATH = "/data/local/tmp/frida-server";

export async function getFridaVersion(): Promise<string> {
  const pkgPath = resolve(
    SIDECAR_ROOT,
    "node_modules/.deno/frida@*/node_modules/frida/package.json",
  );
  const glob = new Deno.Command("sh", {
    args: [
      "-c",
      `cat ${pkgPath} 2>/dev/null || cat node_modules/frida/package.json`,
    ],
    stdout: "piped",
    stderr: "piped",
    cwd: SIDECAR_ROOT,
  });
  const out = await glob.output();
  const pkg = JSON.parse(new TextDecoder().decode(out.stdout));
  return pkg.version;
}

export async function stopFridaServer(deviceId: string): Promise<void> {
  try {
    await exec([
      "adb",
      "-s",
      deviceId,
      "shell",
      "su -c 'killall frida-server' 2>/dev/null; killall frida-server 2>/dev/null",
    ]);
  } catch {}
  for (let i = 0; i < 5; i++) {
    if (!(await isFridaServerRunning(deviceId))) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function isFridaServerRunning(deviceId: string): Promise<boolean> {
  const { stdout } = await exec([
    "adb",
    "-s",
    deviceId,
    "shell",
    "ps -A | grep frida-server",
  ]);
  return stdout.includes("frida-server");
}

async function waitForFridaReady(
  deviceId: string,
  maxAttempts = 10,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const d = await frida.getDevice(deviceId);
      await d.enumerateProcesses();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("frida-server not accepting connections");
}

export async function ensureFridaServer(deviceId: string): Promise<void> {
  if (await isFridaServerRunning(deviceId)) {
    await waitForFridaReady(deviceId);
    return;
  }

  console.log(`frida-server not running on ${deviceId}, installing...`);

  const { stdout: abi } = await exec([
    "adb",
    "-s",
    deviceId,
    "shell",
    "getprop ro.product.cpu.abi",
  ]);
  const archMap: Record<string, string> = {
    "arm64-v8a": "arm64",
    "armeabi-v7a": "arm",
    "x86_64": "x86_64",
    "x86": "x86",
  };
  const arch = archMap[abi] ?? abi;
  const version = await getFridaVersion();
  const binName = `frida-server-${version}-android-${arch}`;
  const localBin = resolve(BIN_DIR, binName);

  try {
    await Deno.stat(localBin);
    console.log(`using cached ${binName}`);
  } catch {
    await Deno.mkdir(BIN_DIR, { recursive: true });

    const url =
      `https://github.com/frida/frida/releases/download/${version}/${binName}.xz`;
    console.log(`downloading ${url}`);

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(
        `failed to download frida-server: ${resp.status} from ${url}`,
      );
    }

    const xzData = new Uint8Array(await resp.arrayBuffer());
    const tmpXz = `${localBin}.xz`;
    await Deno.writeFile(tmpXz, xzData);

    const unxz = await exec(["unxz", "-f", tmpXz]);
    if (unxz.code !== 0) throw new Error(`unxz failed: ${unxz.stderr}`);

  }

  const push = await exec([
    "adb",
    "-s",
    deviceId,
    "push",
    localBin,
    DEVICE_SERVER_PATH,
  ]);
  if (push.code !== 0) throw new Error(`adb push failed: ${push.stderr}`);

  await exec([
    "adb",
    "-s",
    deviceId,
    "shell",
    `chmod 755 ${DEVICE_SERVER_PATH}`,
  ]);

  await exec(["adb", "-s", deviceId, "root"]);
  await new Promise((r) => setTimeout(r, 1000));

  const whoami = await exec(["adb", "-s", deviceId, "shell", "whoami"]);
  const isRoot = whoami.stdout.trim() === "root";

  if (isRoot) {
    await exec(["adb", "-s", deviceId, "shell", "setenforce 0"]);
    new Deno.Command("adb", {
      args: ["-s", deviceId, "shell", `${DEVICE_SERVER_PATH} -D &`],
      stdout: "null",
      stderr: "null",
    }).spawn();
  } else {
    await exec([
      "adb",
      "-s",
      deviceId,
      "shell",
      "su -c 'setenforce 0'",
    ]);
    new Deno.Command("adb", {
      args: [
        "-s",
        deviceId,
        "shell",
        `su -c 'setsid runcon u:r:su:s0 ${DEVICE_SERVER_PATH} -D &'`,
      ],
      stdout: "null",
      stderr: "null",
    }).spawn();
  }

  await waitForFridaReady(deviceId, 20);
}
