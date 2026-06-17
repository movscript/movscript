import type {
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'

export type TimelinePreviewVisualLayer = {
  kind: 'visual'
  trackId: string
  trackType: 'video' | 'image'
  layerIndex: number
  clip: ElectronMediaPipelineClip
  localTimeMs: number
}

export type TimelinePreviewTextLayer = {
  kind: 'text'
  trackId: string
  layerIndex: number
  clip: ElectronMediaPipelineClip
  localTimeMs: number
  text: string
}

export type TimelinePreviewAudioLayer = {
  kind: 'audio'
  trackId: string
  layerIndex: number
  clip: ElectronMediaPipelineClip
  localTimeMs: number
}

export type TimelinePreviewProjection = {
  visualLayers: TimelinePreviewVisualLayer[]
  textLayers: TimelinePreviewTextLayer[]
  audioLayers: TimelinePreviewAudioLayer[]
  primaryVisualClip: ElectronMediaPipelineClip | null
}

export function buildTimelinePreviewProjection(
  project: ElectronMediaPipelineEditingProject | null,
  playheadMs: number,
): TimelinePreviewProjection {
  if (!project) {
    return {
      visualLayers: [],
      textLayers: [],
      audioLayers: [],
      primaryVisualClip: null,
    }
  }

  const visualLayers: TimelinePreviewVisualLayer[] = []
  const textLayers: TimelinePreviewTextLayer[] = []
  const audioLayers: TimelinePreviewAudioLayer[] = []

  project.timeline.tracks.forEach((track, trackOrder) => {
    track.clips.forEach((clip, clipOrder) => {
      if (!clipVisibleAtPlayhead(clip, playheadMs)) return
      const localTimeMs = Math.max(0, playheadMs - clip.timelineStartMs)
      const sortableLayerIndex = track.zIndex * 10000 + trackOrder * 100 + clipOrder

      if ((track.type === 'video' || track.type === 'image') && (clip.assetType === 'video' || clip.assetType === 'image')) {
        visualLayers.push({
          kind: 'visual',
          trackId: track.id,
          trackType: track.type,
          layerIndex: sortableLayerIndex,
          clip,
          localTimeMs,
        })
        return
      }

      if ((track.type === 'text' || track.type === 'subtitle') && timelinePreviewText(clip)) {
        textLayers.push({
          kind: 'text',
          trackId: track.id,
          layerIndex: sortableLayerIndex,
          clip,
          localTimeMs,
          text: timelinePreviewText(clip),
        })
        return
      }

      if (track.type === 'audio' && clip.assetType === 'audio') {
        audioLayers.push({
          kind: 'audio',
          trackId: track.id,
          layerIndex: sortableLayerIndex,
          clip,
          localTimeMs,
        })
      }
    })
  })

  visualLayers.sort(comparePreviewLayers)
  textLayers.sort(comparePreviewLayers)
  audioLayers.sort(comparePreviewLayers)

  return {
    visualLayers,
    textLayers,
    audioLayers,
    primaryVisualClip: visualLayers.at(-1)?.clip ?? null,
  }
}

export function timelinePreviewText(clip: ElectronMediaPipelineClip): string {
  return (clip.subtitle?.style?.content ?? clip.text?.content ?? '').trim()
}

function clipVisibleAtPlayhead(clip: ElectronMediaPipelineClip, playheadMs: number): boolean {
  return playheadMs >= clip.timelineStartMs && playheadMs < clip.timelineStartMs + clip.durationMs
}

function comparePreviewLayers(
  left: Pick<TimelinePreviewVisualLayer | TimelinePreviewTextLayer | TimelinePreviewAudioLayer, 'layerIndex' | 'clip'>,
  right: Pick<TimelinePreviewVisualLayer | TimelinePreviewTextLayer | TimelinePreviewAudioLayer, 'layerIndex' | 'clip'>,
): number {
  if (left.layerIndex !== right.layerIndex) return left.layerIndex - right.layerIndex
  if (left.clip.timelineStartMs !== right.clip.timelineStartMs) return left.clip.timelineStartMs - right.clip.timelineStartMs
  return left.clip.id.localeCompare(right.clip.id)
}
