import frida from "frida";
import { Buffer } from "node:buffer";
import type { JsonRpcRequest, JsonRpcResponse } from "../types.ts";
import { fail, ok } from "../state.ts";
import { normalizePlatform } from "../utils.ts";

export async function handleListDevices(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const mgr = frida.getDeviceManager();
  const devices = await mgr.enumerateDevices();
  const usb = devices.filter((d) => d.type === "usb");
  const result = await Promise.all(
    usb.map(async (d) => {
      const params = await d.querySystemParameters();
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        platform: normalizePlatform(params.platform as string),
      };
    }),
  );
  return ok(req.id, result);
}

export async function handleListApps(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const deviceId = req.params?.deviceId as string;
  if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
  const device = await frida.getDevice(deviceId);
  const apps = await device.enumerateApplications();
  return ok(
    req.id,
    apps.map((a) => ({
      identifier: a.identifier,
      name: a.name,
      pid: a.pid,
    })),
  );
}

export async function handleListProcesses(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const deviceId = req.params?.deviceId as string;
  if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
  const device = await frida.getDevice(deviceId);
  const processes = await device.enumerateProcesses();
  return ok(
    req.id,
    processes.map((p) => ({
      pid: p.pid,
      name: p.name,
    })),
  );
}

export async function handleGetDeviceInfo(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const deviceId = req.params?.deviceId as string;
  if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
  const device = await frida.getDevice(deviceId);
  const params = await device.querySystemParameters();
  return ok(req.id, {
    name: device.name,
    id: device.id,
    type: device.type,
    os: params.os,
    platform: normalizePlatform(params.platform as string),
    arch: params.arch,
    access: params.access,
  });
}

export async function handleGetAppIcon(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const deviceId = req.params?.deviceId as string;
  const identifier = req.params?.identifier as string;
  if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
  if (!identifier) return fail(req.id, -32602, "missing param: identifier");
  const device = await frida.getDevice(deviceId);
  const apps = await device.enumerateApplications({
    identifiers: [identifier],
    scope: "full",
  } as any);
  if (apps.length === 0) return fail(req.id, -32602, "app not found");
  const icons = apps[0].parameters?.icons as
    | { format: string; image: Buffer }[]
    | undefined;
  if (!icons || icons.length === 0) {
    return fail(req.id, -32602, "no icon available");
  }
  const icon = icons[icons.length - 1];
  const b64 = Buffer.from(icon.image).toString("base64");
  return ok(req.id, { format: icon.format, data: b64 });
}
