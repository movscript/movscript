import type { ContentCanvasCandidateRecord, ContentCanvasNodeRecord } from './contentCanvasStore'
import { resourceFileUrl } from '@movscript/core/resources'

export type ContentCanvasNodeMedia = {
  url: string
  type: 'image' | 'video' | 'audio' | 'file'
  resourceId: number
}

export function contentCanvasNodeResourceMedia(record: ContentCanvasNodeRecord): ContentCanvasNodeMedia | undefined {
  if (record.kind !== 'candidate' && record.kind !== 'resource') return undefined
  return contentCanvasResourceMediaForFields(record)
}

export function contentCanvasCandidateResourceMedia(candidate: ContentCanvasCandidateRecord): ContentCanvasNodeMedia | undefined {
  return contentCanvasResourceMediaForFields(candidate)
}

function contentCanvasResourceMediaForFields(
  input: Pick<ContentCanvasCandidateRecord, 'resourceId' | 'resourceKind' | 'artifactRef'>,
): ContentCanvasNodeMedia | undefined {
  const resourceId = input.resourceId
  if (resourceId === undefined) return undefined
  return {
    resourceId,
    url: resourceFileUrl(resourceId) ?? '',
    type: contentCanvasResourceMediaType({
      kind: 'candidate',
      resourceKind: input.resourceKind,
      artifactRef: input.artifactRef,
    }),
  }
}

export function contentCanvasResourceMediaType(
  record: Pick<ContentCanvasNodeRecord, 'resourceKind' | 'artifactRef' | 'kind'>,
): ContentCanvasNodeMedia['type'] {
  const kind = String(record.resourceKind ?? record.kind ?? '').toLowerCase()
  if (kind.includes('video')) return 'video'
  if (kind.includes('audio')) return 'audio'
  if (kind.includes('image') || kind.includes('storyboard')) return 'image'
  const artifact = String(record.artifactRef ?? '').toLowerCase()
  if (/\.(mp4|mov|webm|m4v)(\?|#|$)/.test(artifact)) return 'video'
  if (/\.(mp3|wav|m4a|aac|ogg)(\?|#|$)/.test(artifact)) return 'audio'
  if (/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/.test(artifact)) return 'image'
  return 'file'
}
