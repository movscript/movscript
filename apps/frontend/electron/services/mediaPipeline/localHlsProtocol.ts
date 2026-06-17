import { readFile, stat } from 'fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'path'

const MEDIA_PROTOCOL_SCHEME = 'movscript-media'
const HLS_HOST = 'hls'
const mediaWorkspaceRoots = new Set<string>()

export function registerMediaPipelineLocalHlsRoot(userDataDir: string): string {
  const root = resolve(userDataDir, 'media-workspaces')
  mediaWorkspaceRoots.add(root)
  return root
}

export function createMediaPipelineLocalHlsURL(filePath: string, input?: { userDataDir?: string }): string {
  if (input?.userDataDir) registerMediaPipelineLocalHlsRoot(input.userDataDir)
  const directory = resolve(dirname(filePath))
  const filename = encodeURIComponent(filePathBasename(filePath))
  return `${MEDIA_PROTOCOL_SCHEME}://${HLS_HOST}/${encodePathToken(directory)}/${filename}`
}

export async function readMediaPipelineLocalHlsResponse(requestURL: string): Promise<Response> {
  const filePath = resolveMediaPipelineLocalHlsPath(requestURL)
  if (!filePath) return new Response('Not found', { status: 404 })
  const info = await stat(filePath).catch(() => null)
  if (!info?.isFile()) return new Response('Not found', { status: 404 })
  const bytes = await readFile(filePath)
  const contentType = contentTypeForPath(filePath)
  if (filePath.toLowerCase().endsWith('.m3u8')) {
    return new Response(rewriteHlsManifestForLocalProtocol(Buffer.from(bytes).toString('utf8'), filePath), {
      status: 200,
      headers: { 'content-type': contentType },
    })
  }
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': contentType },
  })
}

export function resolveMediaPipelineLocalHlsPath(requestURL: string): string | null {
  let url: URL
  try {
    url = new URL(requestURL)
  } catch {
    return null
  }
  if (url.protocol !== `${MEDIA_PROTOCOL_SCHEME}:` || url.hostname !== HLS_HOST) return null
  const parts = url.pathname
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  const token = parts.shift()
  if (!token || parts.length === 0) return null
  const directory = decodePathToken(token)
  if (!directory || !isAllowedMediaWorkspacePath(directory)) return null
  const relativePath = safeRelativePath(parts.map((part) => decodeURIComponent(part)).join('/'))
  if (!relativePath) return null
  const candidate = resolve(directory, relativePath)
  if (!isPathInside(candidate, directory) || !isAllowedMediaWorkspacePath(candidate)) return null
  return candidate
}

export function rewriteHlsManifestForLocalProtocol(manifest: string, manifestPath: string): string {
  const directory = dirname(manifestPath)
  return manifest
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#EXT-X-MAP')) {
        return line.replace(/URI="([^"]+)"/, (_match, uri: string) => `URI="${rewriteHlsURI(uri, directory)}"`)
      }
      if (trimmed.startsWith('#')) return line
      return rewriteHlsURI(trimmed, directory)
    })
    .join('\n')
}

function rewriteHlsURI(uri: string, directory: string): string {
  if (isAbsoluteHlsURI(uri)) return uri
  return createMediaPipelineLocalHlsURL(join(directory, uri))
}

function isAbsoluteHlsURI(uri: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith('//')
}

function safeRelativePath(value: string): string {
  const normalized = normalize(value).replace(/^[/\\]+/, '')
  if (!normalized || normalized === '.' || normalized.startsWith('..')) return ''
  return normalized
}

function isAllowedMediaWorkspacePath(candidate: string): boolean {
  const resolvedCandidate = resolve(candidate)
  for (const root of mediaWorkspaceRoots) {
    if (isPathInside(resolvedCandidate, root)) return true
  }
  return false
}

function isPathInside(candidate: string, root: string): boolean {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)
}

function encodePathToken(path: string): string {
  return Buffer.from(resolve(path), 'utf8').toString('base64url')
}

function decodePathToken(token: string): string {
  try {
    return Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    return ''
  }
}

function filePathBasename(filePath: string): string {
  const normalized = normalize(filePath)
  const parts = normalized.split(/[\\/]+/)
  return parts[parts.length - 1] || 'index.m3u8'
}

function contentTypeForPath(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.m3u8':
      return 'application/vnd.apple.mpegurl'
    case '.mp4':
      return 'video/mp4'
    case '.m4s':
      return 'video/iso.segment'
    case '.ts':
      return 'video/mp2t'
    case '.aac':
      return 'audio/aac'
    default:
      return 'application/octet-stream'
  }
}

