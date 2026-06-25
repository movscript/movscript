import { readBrowserStorageItem } from '@movscript/shared/browser'

export interface ResourceMediaDiagnosticEnvironment {
  dev: boolean
  renderDiagnostics?: string
  search?: string
}

export const RESOURCE_MEDIA_DIAGNOSTIC_STORAGE_KEY = 'movscript.canvasDebug'

export function resourceMediaDiagnosticsEnabled(
  env: ResourceMediaDiagnosticEnvironment,
  readStorage: (key: string) => string | null | undefined = readResourceMediaDiagnosticStorageValue,
) {
  if (!env.dev) return false
  if (env.renderDiagnostics === '1') return true
  try {
    if (new URLSearchParams(env.search ?? '').has('canvasDebug')) return true
    return !!readStorage(RESOURCE_MEDIA_DIAGNOSTIC_STORAGE_KEY)
  } catch {
    return false
  }
}

export function compactResourceMediaDiagnosticSrc(src: string | undefined, origin: string) {
  if (!src) return 'empty'
  if (/^blob:/i.test(src)) return compactBlobDiagnosticSrc(src)
  const dataUrlMatch = /^data:([^;,]+)?((?:;[^,]*)?),(.+)$/i.exec(src)
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1] || 'unknown'
    const isBase64 = dataUrlMatch[2]?.toLowerCase().includes(';base64') ?? false
    return `data:${mimeType}${isBase64 ? ';base64' : ''} (${(dataUrlMatch[3] ?? '').length} chars)`
  }
  try {
    const url = new URL(src, origin)
    return `${url.pathname}${url.search}`
  } catch {
    return src.length > 96 ? `${src.slice(0, 96)}...` : src
  }
}

export function compactResourceMediaDiagnosticRect(
  rect: Pick<DOMRectReadOnly, 'width' | 'height' | 'left' | 'top'>,
) {
  return `${roundedDiagnosticValue(rect.width)}x${roundedDiagnosticValue(rect.height)}+${roundedDiagnosticValue(rect.left)}+${roundedDiagnosticValue(rect.top)}`
}

export function compactResourceMediaDiagnosticElementRect(
  element: Pick<HTMLElement, 'getBoundingClientRect'>,
) {
  return compactResourceMediaDiagnosticRect(element.getBoundingClientRect())
}

function compactBlobDiagnosticSrc(src: string) {
  const payload = src.slice('blob:'.length)
  try {
    const url = new URL(payload)
    const id = url.pathname.split('/').filter(Boolean).at(-1)
    return `object-url(origin=${url.host || 'opaque'}${id ? `, id=${id.slice(0, 8)}...` : ''})`
  } catch {
    const token = payload.length > 32 ? `${payload.slice(0, 32)}...` : payload
    return `object-url(${token || 'local'})`
  }
}

function roundedDiagnosticValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.round(number) : 0
}

function readResourceMediaDiagnosticStorageValue(key: string) {
  return readBrowserStorageItem('local', key)
}
