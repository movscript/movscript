import { firstText, titleOfRecord } from './contentWorkbenchRecordUtils'
import { summarizeText } from './scriptSplitDraft'

export type ContentWorkbenchScriptCueRecord = {
  ID: number
  kind?: string
  title?: unknown
  name?: unknown
  label?: unknown
  content?: unknown
  summary?: unknown
  prompt?: unknown
  description?: unknown
  speaker?: unknown
}

export function scriptBlockCue(block?: ContentWorkbenchScriptCueRecord | null) {
  if (!block) return ''
  const content = firstText(block.content, block.summary, block.title)
  const speaker = firstText(block.speaker)
  if (block.kind === 'dialogue') {
    return content ? `对白：${speaker ? `${speaker}：` : ''}${summarizeText(content, 36)}` : speaker ? `对白：${speaker}` : '对白'
  }
  const label = scriptBlockKindLabel(block.kind)
  return content ? `${label}：${summarizeText(content, 36)}` : label
}

export function unitSoundCue(
  unit: ContentWorkbenchScriptCueRecord,
  scriptBlock?: ContentWorkbenchScriptCueRecord | null,
  audioSlots: ContentWorkbenchScriptCueRecord[] = [],
) {
  const sourceText = firstText(scriptBlock?.content, unit.prompt, unit.description)
  if (unit.kind === 'voiceover') return sourceText ? `旁白：${summarizeText(sourceText, 34)}` : '旁白'
  if (unit.kind === 'dialogue_audio') return sourceText ? `对白音频：${summarizeText(sourceText, 34)}` : '对白音频'
  if (unit.kind === 'sound') return sourceText ? `音效：${summarizeText(sourceText, 34)}` : '音效'
  if (unit.kind === 'music_beat') return sourceText ? `音乐/节拍：${summarizeText(sourceText, 32)}` : '音乐/节拍'
  if (unit.kind === 'subtitle' || unit.kind === 'caption_card') return sourceText ? `字幕：${summarizeText(sourceText, 34)}` : '字幕'
  if (audioSlots.length > 0) return `音频：${audioSlots.slice(0, 2).map(titleOfRecord).join('、')}`
  return ''
}

export function scriptBlockKindLabel(kind?: string) {
  switch (kind) {
    case 'dialogue':
      return '对白'
    case 'parenthetical':
      return '括注'
    case 'transition':
      return '转场文本'
    case 'scene_heading':
      return '场景标题'
    case 'action':
      return '动作文本'
    default:
      return '剧本块'
  }
}
