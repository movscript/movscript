import {
  generationReferenceMediaTypeShortLabel,
  generationReferenceRoleLabel,
} from '@movscript/core/generation'
import type { RawResource } from '@/types'

export type ResourceChipMediaElement = HTMLSpanElement
export type ResourceChipReferenceMetadata = {
  role?: string
  mediaType?: string
  roleLabel?: string
  sourceLabel?: string
}

export function resourceChipDisplayLabel(metadata: ResourceChipReferenceMetadata = {}): string {
  const roleLabel = metadata.roleLabel ?? generationReferenceRoleLabel(metadata.role)
  const sourceLabel = metadata.sourceLabel ?? '资源'
  return `${roleLabel || '参考'} · ${sourceLabel}`
}

export function buildResourceChipElement(resource: RawResource, metadata: ResourceChipReferenceMetadata = {}): { chip: HTMLElement; media: ResourceChipMediaElement } {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.resourceName = resource.name
  chip.dataset.resourceId = String(resource.ID)
  chip.dataset.sourceLabel = metadata.sourceLabel ?? '资源'
  if (metadata.role) chip.dataset.role = metadata.role
  if (metadata.mediaType) chip.dataset.mediaType = metadata.mediaType
  chip.title = [
    resource.name,
    metadata.roleLabel ?? generationReferenceRoleLabel(metadata.role),
    metadata.sourceLabel ?? '资源',
  ].filter(Boolean).join(' · ')
  chip.className = 'generation-input-chip'

  const media = buildResourceChipMedia(metadata.mediaType ?? resource.type)
  chip.appendChild(media)

  const label = document.createElement('span')
  label.textContent = resourceChipDisplayLabel(metadata)
  label.className = 'generation-input-chip__label'
  chip.appendChild(label)

  return { chip, media }
}

function buildResourceChipMedia(mediaType: string | undefined) {
  const marker = document.createElement('span')
  marker.className = 'generation-input-chip__media'
  marker.dataset.type = mediaType
  marker.textContent = generationReferenceMediaTypeShortLabel(mediaType)
  return marker
}
