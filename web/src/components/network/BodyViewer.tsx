import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { formatBytes } from './helpers'

const TEXT_TYPES = /text\/|json|xml|html|javascript|css|csv|svg|yaml|toml|plain|urlencoded/i

function b64ToBytes(b64: string): Uint8Array {
  const binStr = atob(b64)
  const bytes = new Uint8Array(binStr.length)
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
  return bytes
}

async function decompressBytes(bytes: Uint8Array, encoding: string): Promise<Uint8Array> {
  let format: string | null = null
  if (encoding === 'gzip' || encoding === 'x-gzip') format = 'gzip'
  else if (encoding === 'deflate') format = 'deflate'
  if (!format) return bytes
  try {
    const ds = new DecompressionStream(format as 'gzip' | 'deflate')
    const writer = ds.writable.getWriter()
    writer.write(bytes as unknown as BufferSource)
    writer.close()
    const reader = ds.readable.getReader()
    const chunks: Uint8Array[] = []
    let totalLen = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      totalLen += value.length
    }
    const result = new Uint8Array(totalLen)
    let offset = 0
    for (const c of chunks) {
      result.set(c, offset)
      offset += c.length
    }
    return result
  } catch {
    return bytes
  }
}

function useDecodedBody(
  body: string,
  headers: Record<string, string>,
  bodyEncoding?: string
): { decoded: string | null; isImage: boolean; imageDataUri: string | null; loading: boolean } {
  const contentType = headers['content-type'] ?? headers['Content-Type'] ?? ''
  const contentEncoding = (headers['content-encoding'] ?? headers['Content-Encoding'] ?? '')
    .trim()
    .toLowerCase()
  const mimeType = contentType.split(';')[0].trim().toLowerCase()
  const isImage = mimeType.startsWith('image/')
  const isText = TEXT_TYPES.test(contentType)

  const [decoded, setDecoded] = useState<string | null>(null)
  const [imageDataUri, setImageDataUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (bodyEncoding === 'utf8') {
          if (cancelled) return
          if (isText || !contentType) {
            setDecoded(body)
            setImageDataUri(null)
          } else {
            setDecoded(null)
            setImageDataUri(null)
          }
          return
        }

        const raw = b64ToBytes(body)
        const bytes = await decompressBytes(raw, contentEncoding)

        if (cancelled) return

        if (isImage) {
          const b64 = btoa(String.fromCharCode(...bytes))
          setImageDataUri(`data:${mimeType};base64,${b64}`)
          setDecoded(null)
        } else if (isText || !contentType) {
          setDecoded(new TextDecoder('utf-8', { fatal: false }).decode(bytes))
          setImageDataUri(null)
        } else {
          setDecoded(null)
          setImageDataUri(null)
        }
      } catch {
        setDecoded(null)
        setImageDataUri(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [body, bodyEncoding, contentEncoding, isImage, isText, mimeType, contentType])

  return { decoded, isImage, imageDataUri, loading }
}

function JsonRenderer({ value, indent = 0 }: { value: unknown; indent?: number }) {
  const pad = '  '.repeat(indent)
  const innerPad = '  '.repeat(indent + 1)

  if (value === null) return <span className="text-orange-500">null</span>
  if (typeof value === 'boolean') return <span className="text-orange-500">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-blue-500">{value}</span>
  if (typeof value === 'string')
    return <span className="text-green-600 dark:text-green-400">&quot;{value}&quot;</span>

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>{'[]'}</span>
    return (
      <span>
        {'[\n'}
        {value.map((item, i) => (
          <span key={i}>
            {innerPad}
            <JsonRenderer value={item} indent={indent + 1} />
            {i < value.length - 1 ? ',' : ''}
            {'\n'}
          </span>
        ))}
        {pad}
        {']'}
      </span>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span>{'{}'}</span>
    return (
      <span>
        {'{\n'}
        {entries.map(([key, val], i) => (
          <span key={key}>
            {innerPad}
            <span className="text-purple-600 dark:text-purple-400">&quot;{key}&quot;</span>
            {': '}
            <JsonRenderer value={val} indent={indent + 1} />
            {i < entries.length - 1 ? ',' : ''}
            {'\n'}
          </span>
        ))}
        {pad}
        {'}'}
      </span>
    )
  }

  return <span>{String(value)}</span>
}

export function BodyViewer({
  body,
  headers,
  size,
  bodyEncoding,
}: {
  body: string
  headers: Record<string, string>
  size?: number
  bodyEncoding?: string
}) {
  const contentType = headers['content-type'] ?? headers['Content-Type'] ?? ''
  const mimeType = contentType.split(';')[0].trim() || 'unknown'
  const { decoded, isImage, imageDataUri, loading } = useDecodedBody(body, headers, bodyEncoding)

  if (loading) {
    return (
      <div className="rounded bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        Decoding...
      </div>
    )
  }

  if (isImage && imageDataUri) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {formatBytes(size ?? 0)}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {mimeType}
          </Badge>
        </div>
        <div className="rounded bg-muted/30 p-3 flex items-center justify-center">
          <img
            src={imageDataUri}
            alt="Response image"
            className="max-h-80 max-w-full object-contain rounded"
          />
        </div>
      </div>
    )
  }

  if (decoded !== null) {
    if (
      contentType.includes('json') ||
      decoded.trimStart().startsWith('{') ||
      decoded.trimStart().startsWith('[')
    ) {
      let parsed: unknown = undefined
      try {
        parsed = JSON.parse(decoded)
      } catch {}
      if (parsed !== undefined) {
        return (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {formatBytes(size ?? decoded.length)}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                JSON
              </Badge>
            </div>
            <pre className="rounded bg-muted/30 p-3 overflow-auto max-h-96 text-xs font-mono whitespace-pre">
              <JsonRenderer value={parsed} />
            </pre>
          </div>
        )
      }
    }

    return (
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {formatBytes(size ?? decoded.length)}
          </Badge>
        </div>
        <pre className="rounded bg-muted/30 p-3 overflow-auto max-h-96 text-xs font-mono whitespace-pre-wrap break-all">
          {decoded}
        </pre>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Badge variant="secondary" className="text-[10px]">
          {formatBytes(size ?? 0)}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {mimeType}
        </Badge>
      </div>
      <div className="rounded bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        Binary data ({formatBytes(size ?? 0)})
      </div>
    </div>
  )
}
