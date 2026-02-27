import frida from "frida";
import type { JsonRpcRequest, JsonRpcResponse } from "../types.ts";
import { devices, fail, ok, sessions } from "../state.ts";
import { normalizePlatform } from "../utils.ts";
import { ensureFridaServer } from "../frida-server.ts";

export async function handleConnectDevice(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const deviceId = req.params?.deviceId as string;
  if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");

  if (devices.has(deviceId)) {
    const existing = devices.get(deviceId)!;
    return ok(req.id, { deviceId, platform: existing.platform });
  }

  const device = await frida.getDevice(deviceId);
  const sysParams = await device.querySystemParameters();
  const platform = normalizePlatform(sysParams.platform as string);

  if (platform === "android") {
    await ensureFridaServer(deviceId);
  }

  devices.set(deviceId, { id: deviceId, device, platform });
  console.log(`device ${deviceId} connected (platform=${platform})`);

  return ok(req.id, { deviceId, platform });
}

export async function handleDisconnectDevice(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const deviceId = req.params?.deviceId as string;
  if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");

  const deviceState = devices.get(deviceId);
  if (!deviceState) return fail(req.id, -32602, "device not connected");

  for (const [sessionId, state] of sessions) {
    if (state.deviceId !== deviceId) continue;
    for (const [, us] of state.userScripts) {
      try {
        await us.script.unload();
      } catch {}
    }
    state.userScripts.clear();
    try {
      await state.script.unload();
    } catch {}
    try {
      await state.session.detach();
    } catch {}
    for (const sub of state.subscribers) {
      try {
        sub.close();
      } catch {}
    }
    sessions.delete(sessionId);
  }

  devices.delete(deviceId);
  console.log(`device ${deviceId} disconnected`);

  return ok(req.id, { success: true });
}
