import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'
import { loadResourceBlob } from '@/shared/ui/resourceBlob'
import type { RawResource } from '@/types'

export type ResourceChipMediaElement = HTMLImageElement | HTMLVideoElement

export async function loadResourceChipMediaUrl(resource: RawResource): Promise<string> {
  if (resource.direct_url) return resource.direct_url
  return createObjectUrl(await loadResourceBlob(resource))
}

export function buildResourceChipElement(resource: RawResource): { chip: HTMLElement; media: ResourceChipMediaElement } {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.resourceName = resource.name
  chip.dataset.resourceId = String(resource.ID)
  chip.className = 'generation-input-chip'

  const media = resource.type === 'video'
    ? buildResourceChipVideo()
    : buildResourceChipImage(resource.name)
  chip.appendChild(media)

  const label = document.createElement('span')
  label.textContent = resource.name
  label.className = 'generation-input-chip__label'
  chip.appendChild(label)

  return { chip, media }
}

export function applyResourceChipMediaUrl({
  root,
  resource,
  media,
  mediaUrl,
  objectUrls,
}: {
  root: HTMLElement | null
  resource: RawResource
  media: ResourceChipMediaElement
  mediaUrl: string
  objectUrls: Set<string>
}) {
  const target = connectedChipMedia(root, resource, media)
  if (!target) {
    revokeObjectUrl(mediaUrl)
    return
  }
  if (target.src.startsWith('blob:')) {
    revokeObjectUrl(target.src)
    objectUrls.delete(target.src)
  }
  target.src = mediaUrl
  if (mediaUrl.startsWith('blob:')) objectUrls.add(mediaUrl)
  if (resource.type === 'video') {
    const video = target as HTMLVideoElement
    video.addEventListener('loadedmetadata', () => { video.currentTime = 0.1 }, { once: true })
  }
}

function connectedChipMedia(root: HTMLElement | null, resource: RawResource, media: ResourceChipMediaElement): ResourceChipMediaElement | null {
  if (media.isConnected) return media
  const chip = root?.querySelector(`[data-resource-id="${resource.ID}"]`)
  return chip?.querySelector('img, video') as ResourceChipMediaElement | null
}

function buildResourceChipVideo() {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  video.className = 'generation-input-chip__media'
  return video
}

function buildResourceChipImage(name: string) {
  const image = document.createElement('img')
  image.alt = name
  image.className = 'generation-input-chip__media'
  return image
}
