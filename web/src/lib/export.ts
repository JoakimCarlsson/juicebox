import type { HttpMessage } from '@/types/session'

function resolveBody(
  body: string | null | undefined,
  encoding: string | undefined
): { text: string; isBinary: boolean } | null {
  if (!body) return null

  if (encoding === 'base64') {
    const decoded = atob(body)
    const isBinary = /[\x00-\x08\x0E-\x1F\x7F-\xFF]/.test(decoded)
    return { text: isBinary ? body : decoded, isBinary }
  }

  return { text: body, isBinary: false }
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

function escapeJsString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

function escapePythonString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

export function generateCurl(message: HttpMessage): string {
  const parts: string[] = [`curl -X ${message.method}`]

  parts.push(shellEscape(message.url))

  for (const [key, value] of Object.entries(message.requestHeaders)) {
    parts.push(`-H ${shellEscape(`${key}: ${value}`)}`)
  }

  const acceptEncoding =
    message.requestHeaders['Accept-Encoding'] ?? message.requestHeaders['accept-encoding']
  if (acceptEncoding && /\b(gzip|deflate|br)\b/.test(acceptEncoding)) {
    parts.push('--compressed')
  }

  const resolved = resolveBody(message.requestBody, message.requestBodyEncoding)
  if (resolved) {
    if (resolved.isBinary) {
      parts.push(`--data-binary @- <<< $(echo ${shellEscape(resolved.text)} | base64 -d)`)
    } else {
      parts.push(`-d ${shellEscape(resolved.text)}`)
    }
  }

  return parts.join(' \\\n  ')
}

export function generateFetch(message: HttpMessage): string {
  const headers = message.requestHeaders
  const hasHeaders = Object.keys(headers).length > 0
  const resolved = resolveBody(message.requestBody, message.requestBodyEncoding)
  const isGet = message.method === 'GET'

  const options: string[] = []

  if (!isGet) {
    options.push(`  method: "${message.method}",`)
  }

  if (hasHeaders) {
    const headerEntries = Object.entries(headers)
      .map(([k, v]) => `    "${escapeJsString(k)}": "${escapeJsString(v)}"`)
      .join(',\n')
    options.push(`  headers: {\n${headerEntries}\n  },`)
  }

  if (resolved) {
    if (resolved.isBinary) {
      options.push('  // binary body omitted')
    } else {
      options.push(`  body: "${escapeJsString(resolved.text)}",`)
    }
  }

  if (options.length === 0) {
    return `fetch("${escapeJsString(message.url)}")`
  }

  return `fetch("${escapeJsString(message.url)}", {\n${options.join('\n')}\n})`
}

export function generatePythonRequests(message: HttpMessage): string {
  const lines: string[] = ['import requests', '']

  const method = message.method.toLowerCase()
  const commonMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']
  const useDirectMethod = commonMethods.includes(method)

  const args: string[] = []

  if (useDirectMethod) {
    args.push(`"${escapePythonString(message.url)}"`)
  } else {
    args.push(`"${message.method}", "${escapePythonString(message.url)}"`)
  }

  const headers = message.requestHeaders
  if (Object.keys(headers).length > 0) {
    const entries = Object.entries(headers)
      .map(([k, v]) => `    "${escapePythonString(k)}": "${escapePythonString(v)}"`)
      .join(',\n')
    args.push(`headers={\n${entries}\n}`)
  }

  const resolved = resolveBody(message.requestBody, message.requestBodyEncoding)
  if (resolved) {
    if (resolved.isBinary) {
      args.push(`data=base64.b64decode("${escapePythonString(resolved.text)}")`)
      lines[0] = 'import base64\nimport requests'
    } else {
      args.push(`data="${escapePythonString(resolved.text)}"`)
    }
  }

  const funcName = useDirectMethod ? `requests.${method}` : 'requests.request'
  const joinedArgs = args.join(',\n  ')

  if (joinedArgs.includes('\n')) {
    lines.push(`response = ${funcName}(\n  ${joinedArgs}\n)`)
  } else {
    lines.push(`response = ${funcName}(${args.join(', ')})`)
  }

  return lines.join('\n')
}

export function generateHarEntry(message: HttpMessage): string {
  let queryString: { name: string; value: string }[] = []
  try {
    const url = new URL(message.url)
    queryString = Array.from(url.searchParams.entries()).map(([name, value]) => ({ name, value }))
  } catch {
    // invalid URL, skip query string parsing
  }

  const reqHeaders = Object.entries(message.requestHeaders).map(([name, value]) => ({
    name,
    value,
  }))
  const resHeaders = Object.entries(message.responseHeaders).map(([name, value]) => ({
    name,
    value,
  }))

  const contentType =
    message.requestHeaders['Content-Type'] ??
    message.requestHeaders['content-type'] ??
    'application/octet-stream'

  const resolvedReqBody = resolveBody(message.requestBody, message.requestBodyEncoding)
  const resolvedResBody = resolveBody(message.responseBody, message.responseBodyEncoding)

  const resContentType =
    message.responseHeaders['Content-Type'] ??
    message.responseHeaders['content-type'] ??
    'application/octet-stream'

  const entry: Record<string, unknown> = {
    startedDateTime: new Date(message.timestamp).toISOString(),
    time: message.duration ?? 0,
    request: {
      method: message.method,
      url: message.url,
      httpVersion: 'HTTP/1.1',
      headers: reqHeaders,
      queryString,
      headersSize: -1,
      bodySize: message.requestBodySize ?? -1,
      ...(resolvedReqBody && {
        postData: {
          mimeType: contentType,
          text: resolvedReqBody.text,
          ...(resolvedReqBody.isBinary && { encoding: 'base64' }),
        },
      }),
    },
    response: {
      status: message.statusCode,
      statusText: '',
      httpVersion: 'HTTP/1.1',
      headers: resHeaders,
      headersSize: -1,
      bodySize: message.responseBodySize ?? -1,
      content: {
        size: message.responseBodySize ?? 0,
        mimeType: resContentType,
        ...(resolvedResBody && {
          text: resolvedResBody.text,
          ...(resolvedResBody.isBinary && { encoding: 'base64' }),
        }),
      },
    },
    cache: {},
    timings: {
      send: 0,
      wait: message.duration ?? 0,
      receive: 0,
    },
  }

  const har = {
    log: {
      version: '1.2',
      creator: { name: 'juicebox', version: '1.0' },
      entries: [entry],
    },
  }

  return JSON.stringify(har, null, 2)
}
