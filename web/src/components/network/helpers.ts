export function parseUrl(raw: string): { host: string; path: string } {
  try {
    const u = new URL(raw)
    return { host: u.host, path: u.pathname + u.search }
  } catch {
    return { host: raw, path: '' }
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDuration(ms?: number): string {
  if (ms === undefined || ms === 0) return '\u2014'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function statusColor(code: number): string {
  if (code >= 200 && code < 300) return 'text-green-600 dark:text-green-400'
  if (code >= 300 && code < 400) return 'text-yellow-600 dark:text-yellow-400'
  if (code >= 400) return 'text-red-600 dark:text-red-400'
  return 'text-muted-foreground'
}

export function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    case 'POST':
      return 'bg-green-500/15 text-green-600 dark:text-green-400'
    case 'PUT':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
    case 'PATCH':
      return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
    case 'DELETE':
      return 'bg-red-500/15 text-red-600 dark:text-red-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}
