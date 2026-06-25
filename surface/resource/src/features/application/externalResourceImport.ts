import type { ExternalResourceItem, RawResource } from '@movscript/shared'
import { surfaceDataApi as api } from '@movscript/shared/surface-http'

export function externalResourceProviderName(providerKey: string) {
  switch (providerKey) {
    case 'pixabay':
      return 'Pixabay'
    case 'pexels':
      return 'Pexels'
    default:
      return providerKey
  }
}

export async function uploadExternalResourceItem(item: ExternalResourceItem): Promise<RawResource> {
  const url = item.preview_url || item.thumbnail_url
  if (!url) throw new Error('外部资源没有可导入的文件地址')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载外部资源失败：HTTP ${response.status}`)
  const blob = await response.blob()
  const file = new window.File(
    [blob],
    externalResourceFileName(item, blob.type),
    { type: blob.type || externalResourceMimeType(item) },
  )
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/resources/upload', fd).then(r => r.data as RawResource)
}

function externalResourceFileName(item: ExternalResourceItem, mimeType: string) {
  const title = item.title || `${item.provider_key}-${item.media_type}-${item.external_id}`
  const base = title
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `${item.provider_key}-${item.external_id}`
  return `${base}-${item.external_id}${externalResourceExtension(item, mimeType)}`
}

function externalResourceExtension(item: ExternalResourceItem, mimeType: string) {
  const urlPath = item.preview_url || item.thumbnail_url || ''
  const urlExtension = urlPath.split('?')[0]?.match(/\.(jpe?g|png|webp|gif|mp4|mov|webm)$/i)?.[0]
  if (urlExtension) return urlExtension.toLowerCase()
  if (mimeType.includes('png')) return '.png'
  if (mimeType.includes('webp')) return '.webp'
  if (mimeType.includes('gif')) return '.gif'
  if (mimeType.includes('video/webm')) return '.webm'
  if (mimeType.includes('video/quicktime')) return '.mov'
  if (mimeType.includes('video')) return '.mp4'
  return item.media_type === 'video' ? '.mp4' : '.jpg'
}

function externalResourceMimeType(item: ExternalResourceItem) {
  return item.media_type === 'video' ? 'video/mp4' : 'image/jpeg'
}
