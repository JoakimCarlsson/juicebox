export async function exec(cmd: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const p = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
  });
  const out = await p.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout).trim(),
    stderr: new TextDecoder().decode(out.stderr).trim(),
  };
}

export function normalizePlatform(raw: string): string {
  if (raw === "linux") return "android";
  if (raw === "darwin") return "ios";
  return raw;
}
