import type { JsonRpcRequest, JsonRpcResponse } from "../types.ts";
import { sessions, ok, fail } from "../state.ts";

export async function handleAgentInvoke(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const sessionId = req.params?.sessionId as string;
  const namespace = req.params?.namespace as string;
  const method = req.params?.method as string;
  const args = (req.params?.args as unknown[]) ?? [];
  if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");
  if (!namespace) return fail(req.id, -32602, "missing param: namespace");
  if (!method) return fail(req.id, -32602, "missing param: method");
  const state = sessions.get(sessionId);
  if (!state) return fail(req.id, -32602, "session not found");
  const result = await state.script.exports.invoke(namespace, method, args);
  return ok(req.id, result);
}

export async function handleAgentInterfaces(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const sessionId = req.params?.sessionId as string;
  if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");
  const state = sessions.get(sessionId);
  if (!state) return fail(req.id, -32602, "session not found");
  const result = await state.script.exports.interfaces();
  return ok(req.id, result);
}

export async function handleAgentSnapshot(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const sessionId = req.params?.sessionId as string;
  if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");
  const state = sessions.get(sessionId);
  if (!state) return fail(req.id, -32602, "session not found");
  const result = await state.script.exports.snapshot();
  return ok(req.id, result);
}

export async function handleAgentRestore(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const sessionId = req.params?.sessionId as string;
  const rules = req.params?.rules as unknown[];
  if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");
  if (!rules) return fail(req.id, -32602, "missing param: rules");
  const state = sessions.get(sessionId);
  if (!state) return fail(req.id, -32602, "session not found");
  await state.script.exports.restore(rules);
  return ok(req.id, { success: true });
}
