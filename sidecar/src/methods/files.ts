import type { FileEntry, JsonRpcRequest, JsonRpcResponse } from "../types.ts";
import { fail, ok } from "../state.ts";
import { exec } from "../utils.ts";

function parseLsOutput(output: string, basePath: string): FileEntry[] {
  const entries: FileEntry[] = [];
  const normalizedBase = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("total")) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 7) continue;

    const permissions = parts[0];
    const size = parseInt(parts[4], 10) || 0;
    const date = parts[5];
    const time = parts[6];
    const rest = parts.slice(7).join(" ");
    if (!rest || rest === "." || rest === "..") continue;

    let type: "file" | "dir" | "symlink" = "file";
    if (permissions.startsWith("d")) type = "dir";
    else if (permissions.startsWith("l")) type = "symlink";

    const name = type === "symlink" ? rest.split(" -> ")[0] : rest;

    entries.push({
      name,
      path: `${normalizedBase}/${name}`,
      type,
      size,
      permissions,
      modifiedAt: `${date} ${time}`,
    });
  }

  return entries;
}

function detectMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    xml: "application/xml",
    json: "application/json",
    txt: "text/plain",
    log: "text/plain",
    html: "text/html",
    htm: "text/html",
    js: "application/javascript",
    ts: "application/typescript",
    css: "text/css",
    sh: "application/x-sh",
    yaml: "application/yaml",
    yml: "application/yaml",
    toml: "application/toml",
    ini: "text/plain",
    cfg: "text/plain",
    conf: "text/plain",
    properties: "text/plain",
    db: "application/x-sqlite3",
    sqlite: "application/x-sqlite3",
    sqlite3: "application/x-sqlite3",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    zip: "application/zip",
    so: "application/octet-stream",
    dex: "application/octet-stream",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function handleListFiles(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const deviceId = req.params?.deviceId as string;
  const bundleId = req.params?.bundleId as string;
  const path = (req.params?.path as string) || `/data/data/${bundleId}`;
  if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
  if (!bundleId) return fail(req.id, -32602, "missing param: bundleId");

  const { stdout, stderr } = await exec([
    "adb",
    "-s",
    deviceId,
    "shell",
    `run-as ${bundleId} ls -la "${path}" 2>/dev/null || su -c 'ls -la "${path}"' 2>/dev/null || ls -la "${path}" 2>&1`,
  ]);

  if (!stdout && stderr) {
    return fail(req.id, -32000, `ls failed: ${stderr}`);
  }

  return ok(req.id, parseLsOutput(stdout, path));
}

export async function handleReadFile(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const deviceId = req.params?.deviceId as string;
  const bundleId = req.params?.bundleId as string;
  const path = req.params?.path as string;
  if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
  if (!bundleId) return fail(req.id, -32602, "missing param: bundleId");
  if (!path) return fail(req.id, -32602, "missing param: path");

  const sizeResult = await exec([
    "adb",
    "-s",
    deviceId,
    "shell",
    `run-as ${bundleId} stat -c %s "${path}" 2>/dev/null || su -c 'stat -c %s "${path}"' 2>/dev/null || stat -c %s "${path}" 2>/dev/null || echo 0`,
  ]);
  const fileSize = parseInt(sizeResult.stdout.trim(), 10) || 0;
  const MAX_SIZE = 5 * 1024 * 1024;
  if (fileSize > MAX_SIZE) {
    return fail(
      req.id,
      -32000,
      `file too large: ${fileSize} bytes (max ${MAX_SIZE})`,
    );
  }

  const { stdout, stderr } = await exec([
    "adb",
    "-s",
    deviceId,
    "shell",
    `run-as ${bundleId} base64 "${path}" 2>/dev/null || su -c 'base64 "${path}"' 2>/dev/null || base64 "${path}" 2>&1`,
  ]);

  if (!stdout && stderr) {
    return fail(req.id, -32000, `read failed: ${stderr}`);
  }

  const b64 = stdout.replace(/\s/g, "");
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  let binary = false;
  const checkLen = Math.min(raw.length, 8192);
  for (let i = 0; i < checkLen; i++) {
    if (raw[i] === 0) {
      binary = true;
      break;
    }
  }

  if (binary) {
    return ok(req.id, {
      path,
      content: b64,
      encoding: "base64",
      mimeType: "application/octet-stream",
      size: raw.length,
    });
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(raw);
  return ok(req.id, {
    path,
    content: text,
    encoding: "utf-8",
    mimeType: detectMimeType(path),
    size: raw.length,
  });
}

export async function handleFindFiles(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const deviceId = req.params?.deviceId as string;
  const bundleId = req.params?.bundleId as string;
  const pattern = req.params?.pattern as string;
  const basePath = (req.params?.basePath as string) || `/data/data/${bundleId}`;
  if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
  if (!bundleId) return fail(req.id, -32602, "missing param: bundleId");
  if (!pattern) return fail(req.id, -32602, "missing param: pattern");

  const { stdout } = await exec([
    "adb",
    "-s",
    deviceId,
    "shell",
    `run-as ${bundleId} find "${basePath}" -name "${pattern}" 2>/dev/null || su -c 'find "${basePath}" -name "${pattern}"' 2>/dev/null || find "${basePath}" -name "${pattern}" 2>/dev/null`,
  ]);

  const paths = stdout.split("\n").map((p) => p.trim()).filter((p) =>
    p.length > 0
  );
  return ok(req.id, paths);
}

export async function handlePullDatabase(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const deviceId = req.params?.deviceId as string;
  const bundleId = req.params?.bundleId as string;
  const dbPath = req.params?.dbPath as string;
  if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
  if (!bundleId) return fail(req.id, -32602, "missing param: bundleId");
  if (!dbPath) return fail(req.id, -32602, "missing param: dbPath");

  const hash = Array.from(new TextEncoder().encode(dbPath))
    .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  const remoteTmp = `/data/local/tmp/jb_${hash}.db`;
  const localTmp = `${
    Deno.env.get("TMPDIR") ?? "/tmp"
  }/jb_${hash}_${Date.now()}.db`;

  await exec([
    "adb",
    "-s",
    deviceId,
    "shell",
    `run-as ${bundleId} cat "${dbPath}" > "${remoteTmp}" 2>/dev/null && chmod 644 "${remoteTmp}" || su -c 'cat "${dbPath}" > "${remoteTmp}" && chmod 644 "${remoteTmp}"' 2>/dev/null || cat "${dbPath}" > "${remoteTmp}" 2>/dev/null && chmod 644 "${remoteTmp}"`,
  ]);

  const checkTmp = await exec([
    "adb",
    "-s",
    deviceId,
    "shell",
    `ls "${remoteTmp}" 2>/dev/null && echo EXISTS || echo MISSING`,
  ]);
  if (!checkTmp.stdout.includes("EXISTS")) {
    return fail(
      req.id,
      -32000,
      `copy failed: could not copy ${dbPath} to ${remoteTmp} (tried run-as and root)`,
    );
  }

  const pull = await exec(["adb", "-s", deviceId, "pull", remoteTmp, localTmp]);
  if (pull.code !== 0) {
    return fail(req.id, -32000, `adb pull failed: ${pull.stderr}`);
  }

  await exec(["adb", "-s", deviceId, "shell", `rm -f "${remoteTmp}"`]);

  const pullSidecar = async (suffix: string) => {
    const srcPath = dbPath + suffix;
    const rTmp = remoteTmp + suffix;
    const lTmp = localTmp + suffix;
    const scCp = await exec([
      "adb",
      "-s",
      deviceId,
      "shell",
      `run-as ${bundleId} cat "${srcPath}" > "${rTmp}" 2>/dev/null && chmod 644 "${rTmp}" && echo OK || su -c 'cat "${srcPath}" > "${rTmp}" && chmod 644 "${rTmp}"' 2>/dev/null && echo OK || echo SKIP`,
    ]);
    if (scCp.stdout.trim().includes("OK")) {
      await exec(["adb", "-s", deviceId, "pull", rTmp, lTmp]);
      await exec(["adb", "-s", deviceId, "shell", `rm -f "${rTmp}"`]);
    }
  };

  await pullSidecar("-wal");
  await pullSidecar("-shm");

  return ok(req.id, { localPath: localTmp });
}
