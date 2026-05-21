import type { SemanticEntityConfig } from '@/api/semanticEntities'
import { contentUnitTimelineKindRank } from './contentWorkbenchTimeline.ts'

export function contentUnitKindOptions(config: SemanticEntityConfig) {
  const kindField = config.fields.find((field) => field.key === 'kind')
  const options = kindField?.options?.length ? kindField.options : [
    { value: 'shot', label: '镜头' },
    { value: 'voiceover', label: '旁白/画外音' },
    { value: 'dialogue_audio', label: '对白音频' },
    { value: 'sound', label: '音效' },
    { value: 'music_beat', label: '节拍' },
    { value: 'subtitle', label: '字幕' },
    { value: 'caption_card', label: '字幕卡' },
    { value: 'transition', label: '转场' },
  ]
  return options
    .filter((option) => option.value)
    .slice()
    .sort((a, b) => contentUnitTimelineKindRank(a.value) - contentUnitTimelineKindRank(b.value) || a.label.localeCompare(b.label, 'zh-Hans-CN'))
}

export function trackKindLabel(kind: string) {
  switch (kind) {
    case 'shot':
      return '镜头'
    case 'voiceover':
      return '旁白/画外音'
    case 'dialogue_audio':
      return '对白音频'
    case 'sound':
      return '音效'
    case 'music_beat':
      return '节拍'
    case 'subtitle':
      return '字幕'
    case 'caption_card':
      return '字幕卡'
    case 'transition':
      return '转场'
    default:
      return kind || '制作项'
  }
}
