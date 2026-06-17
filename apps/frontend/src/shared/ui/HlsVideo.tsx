import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type VideoHTMLAttributes } from 'react'
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import { useUserStore } from '@/shared/infrastructure/session/userStore'

export type HlsVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> & {
  src: string | undefined
  diagnosticLabel?: string
}

interface HlsPlaylist {
  source: string
  codecs?: string
  initUri?: string
  segmentUris: string[]
}

const FMP4_MIME_CANDIDATES = [
  'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4; codecs="avc1.4d401f,mp4a.40.2"',
  'video/mp4; codecs="avc1.64001f,mp4a.40.2"',
  'video/mp4; codecs="mp4a.40.2"',
  'video/mp4',
]

export const HlsVideo = forwardRef<HTMLVideoElement, HlsVideoProps>(function HlsVideo(
  { src, diagnosticLabel, onError, ...props },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [directSrc, setDirectSrc] = useState<string | undefined>(src ? normalizeHlsSource(src) : undefined)
  useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement, [])

  useEffect(() => {
    if (!src) {
      setDirectSrc(undefined)
      return
    }
    const normalizedSrc = normalizeHlsSource(src)
    const video = videoRef.current
    if (!video) {
      setDirectSrc(normalizedSrc)
      return
    }
    const shouldUseMse = canUseMediaSource()
      && (!canPlayHlsNatively(video) || requiresMediaStreamAuth(normalizedSrc))
    if (!shouldUseMse) {
      setDirectSrc(normalizedSrc)
      return
    }

    const controller = new AbortController()
    const mediaSource = new MediaSource()
    const objectUrl = URL.createObjectURL(mediaSource)
    setDirectSrc(objectUrl)

    const onSourceOpen = () => {
      void loadMseHls(mediaSource, normalizedSrc, controller.signal, diagnosticLabel).catch((error) => {
        if (!controller.signal.aborted) {
          console.warn('[hls-video] failed to load HLS stream', diagnosticLabel ?? normalizedSrc, error)
          setDirectSrc(normalizedSrc)
        }
      })
    }
    mediaSource.addEventListener('sourceopen', onSourceOpen, { once: true })
    return () => {
      controller.abort()
      mediaSource.removeEventListener('sourceopen', onSourceOpen)
      if (mediaSource.readyState === 'open') {
        try {
          mediaSource.endOfStream()
        } catch {
          // Ignore cleanup races while the element is detaching.
        }
      }
      URL.revokeObjectURL(objectUrl)
    }
  }, [diagnosticLabel, src])

  if (!src) return null
  return (
    <video
      ref={videoRef}
      src={directSrc}
      onError={onError}
      {...props}
    />
  )
})

export function isHlsSource(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)
    return url.pathname.toLowerCase().endsWith('.m3u8')
  } catch {
    return value.toLowerCase().includes('.m3u8')
  }
}

async function loadMseHls(mediaSource: MediaSource, source: string, signal: AbortSignal, diagnosticLabel?: string): Promise<void> {
  const playlist = await loadMediaPlaylist(source, signal)
  if (!playlist.initUri || playlist.segmentUris.length === 0) {
    throw new Error('Only fMP4 VOD HLS playlists are supported by the built-in player.')
  }
  const mimeType = supportedFmp4MimeType(playlist.codecs)
  if (!mimeType) throw new Error('This browser cannot play fMP4 HLS with MediaSource.')
  const sourceBuffer = mediaSource.addSourceBuffer(mimeType)
  if (diagnosticLabel) {
    console.info(`[hls-video] mse-start label=${diagnosticLabel} segments=${playlist.segmentUris.length}`)
  }
  await appendHlsAsset(sourceBuffer, resolveHlsUri(playlist.initUri, playlist.source), signal)
  for (const segmentUri of playlist.segmentUris) {
    await appendHlsAsset(sourceBuffer, resolveHlsUri(segmentUri, playlist.source), signal)
  }
  if (mediaSource.readyState === 'open') mediaSource.endOfStream()
}

async function appendHlsAsset(sourceBuffer: SourceBuffer, url: string, signal: AbortSignal): Promise<void> {
  const data = await loadHlsAsset(url, signal)
  await appendBuffer(sourceBuffer, data, signal)
}

function appendBuffer(sourceBuffer: SourceBuffer, data: ArrayBuffer, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const cleanup = () => {
      sourceBuffer.removeEventListener('updateend', onUpdateEnd)
      sourceBuffer.removeEventListener('error', onError)
      signal.removeEventListener('abort', onAbort)
    }
    const onUpdateEnd = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('MediaSource append failed.'))
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    sourceBuffer.addEventListener('updateend', onUpdateEnd, { once: true })
    sourceBuffer.addEventListener('error', onError, { once: true })
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      sourceBuffer.appendBuffer(data)
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

async function loadMediaPlaylist(source: string, signal: AbortSignal, depth = 0): Promise<HlsPlaylist> {
  if (depth > 2) throw new Error('Nested HLS playlist depth exceeded.')
  const text = await loadHlsText(source, signal)
  const parsed = parseHlsPlaylist(text, source)
  if (parsed.variantUri) {
    return loadMediaPlaylist(resolveHlsUri(parsed.variantUri, source), signal, depth + 1)
  }
  return {
    source,
    codecs: parsed.codecs,
    initUri: parsed.initUri,
    segmentUris: parsed.segmentUris,
  }
}

function parseHlsPlaylist(text: string, source: string): { variantUri?: string; codecs?: string; initUri?: string; segmentUris: string[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const segmentUris: string[] = []
  let initUri: string | undefined
  let variantUri: string | undefined
  let codecs: string | undefined
  let expectVariantUri = false
  for (const line of lines) {
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      codecs = hlsAttribute(line, 'CODECS') ?? codecs
      expectVariantUri = true
      continue
    }
    if (line.startsWith('#EXT-X-MAP:')) {
      initUri = hlsAttribute(line, 'URI') ?? initUri
      continue
    }
    if (line.startsWith('#')) continue
    if (expectVariantUri) {
      variantUri = line
      break
    }
    segmentUris.push(line)
  }
  if (!variantUri && !initUri && segmentUris.some((uri) => !uri.toLowerCase().endsWith('.m4s'))) {
    throw new Error(`Unsupported MPEG-TS HLS playlist: ${source}`)
  }
  return { variantUri, codecs, initUri, segmentUris }
}

function hlsAttribute(line: string, key: string): string | undefined {
  const match = new RegExp(`${key}="([^"]+)"`).exec(line)
  if (match?.[1]) return match[1]
  const raw = new RegExp(`${key}=([^,]+)`).exec(line)?.[1]
  return raw?.trim()
}

async function loadHlsText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { headers: hlsRequestHeaders(url), signal })
  if (!response.ok) throw new Error(`Failed to load HLS manifest: ${response.status}`)
  return response.text()
}

async function loadHlsAsset(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { headers: hlsRequestHeaders(url), signal })
  if (!response.ok) throw new Error(`Failed to load HLS asset: ${response.status}`)
  return response.arrayBuffer()
}

function hlsRequestHeaders(url: string): HeadersInit | undefined {
  if (!requiresMediaStreamAuth(url)) return undefined
  const { token, currentOrgID } = useUserStore.getState()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (currentOrgID) headers['X-Org-ID'] = String(currentOrgID)
  return Object.keys(headers).length ? headers : undefined
}

function requiresMediaStreamAuth(value: string): boolean {
  try {
    const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
    const url = new URL(value, base)
    return url.pathname.startsWith('/api/v1/media/streams/')
  } catch {
    return value.startsWith('/api/v1/media/streams/')
  }
}

function resolveHlsUri(uri: string, source: string): string {
  return new URL(uri, source).toString()
}

function supportedFmp4MimeType(codecs: string | undefined): string | undefined {
  const candidates = codecs ? [`video/mp4; codecs="${codecs}"`, ...FMP4_MIME_CANDIDATES] : FMP4_MIME_CANDIDATES
  return candidates.find((mimeType) => MediaSource.isTypeSupported(mimeType))
}

function normalizeHlsSource(src: string): string {
  const trimmed = src.trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/api/v1/')) return `${getAPIBaseURL()}${trimmed}`
  if (looksLikeAbsoluteLocalPath(trimmed)) return `file://${trimmed}`
  return trimmed
}

function looksLikeAbsoluteLocalPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/api/')
}

function canPlayHlsNatively(video: HTMLVideoElement): boolean {
  return Boolean(video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL'))
}

function canUseMediaSource(): boolean {
  return typeof MediaSource !== 'undefined' && typeof MediaSource.isTypeSupported === 'function'
}
