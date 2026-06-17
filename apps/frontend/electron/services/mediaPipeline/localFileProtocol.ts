import { open, readFile, stat } from 'fs/promises'
import { extname, resolve } from 'path'

const MEDIA_PROTOCOL_SCHEME = 'movscript-media'
const LOCAL_FILE_HOST = 'local-file'

export function createMediaPipelineLocalFileURL(filePath: string): string {
  return `${MEDIA_PROTOCOL_SCHEME}://${LOCAL_FILE_HOST}/?path=${encodeURIComponent(filePath)}`
}

export async function readMediaPipelineLocalFileResponse(request: Request): Promise<Response> {
  const filePath = resolveMediaPipelineLocalFilePath(request.url)
  if (!filePath) return new Response('Not found', { status: 404 })
  const info = await stat(filePath).catch(() => null)
  if (!info?.isFile()) return new Response('Not found', { status: 404 })

  const contentType = contentTypeForPath(filePath)
  const range = request.headers.get('range')
  if (range) {
    const rangeResponse = await readRangeResponse(filePath, info.size, range, contentType)
    if (rangeResponse) return rangeResponse
  }

  const bytes = await readFile(filePath)
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'accept-ranges': 'bytes',
      'content-length': String(info.size),
      'content-type': contentType,
    },
  })
}

export function resolveMediaPipelineLocalFilePath(requestURL: string): string | null {
  let url: URL
  try {
    url = new URL(requestURL)
  } catch {
    return null
  }
  if (url.protocol !== `${MEDIA_PROTOCOL_SCHEME}:` || url.hostname !== LOCAL_FILE_HOST) return null
  const filePath = url.searchParams.get('path')
  if (!filePath) return null
  return resolve(filePath)
}

async function readRangeResponse(filePath: string, size: number, range: string, contentType: string): Promise<Response | null> {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (!match) return null
  const requestedStart = match[1] ? Number.parseInt(match[1], 10) : 0
  const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : size - 1
  if (!Number.isFinite(requestedStart) || !Number.isFinite(requestedEnd) || requestedStart < 0 || requestedStart >= size) {
    return new Response(null, {
      status: 416,
      headers: {
        'content-range': `bytes */${size}`,
      },
    })
  }

  const start = requestedStart
  const end = Math.min(requestedEnd, size - 1)
  const length = end - start + 1
  const file = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(length)
    await file.read(buffer, 0, length, start)
    return new Response(new Uint8Array(buffer), {
      status: 206,
      headers: {
        'accept-ranges': 'bytes',
        'content-length': String(length),
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-type': contentType,
      },
    })
  } finally {
    await file.close()
  }
}

function contentTypeForPath(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.mp4':
      return 'video/mp4'
    case '.mov':
      return 'video/quicktime'
    case '.webm':
      return 'video/webm'
    case '.m4v':
      return 'video/x-m4v'
    case '.mp3':
      return 'audio/mpeg'
    case '.m4a':
      return 'audio/mp4'
    case '.wav':
      return 'audio/wav'
    case '.aac':
      return 'audio/aac'
    case '.ogg':
      return 'audio/ogg'
    default:
      return 'application/octet-stream'
  }
}
