import type { AgentDebugContextPanel } from '../../../state/shared/types.js'

export type RuntimeIntentSource =
  | 'client_label'
  | 'label_alias'
  | 'keyword_fallback'
  | 'route'
  | 'agent_taskGraph'
  | 'visual_context'
  | 'derived'

export type RuntimeIntentConfidence = 'high' | 'medium' | 'low'

export interface RuntimeIntentSignal {
  intent: string
  source: RuntimeIntentSource
  confidence: RuntimeIntentConfidence
  evidence: string
}

export interface RuntimeIntentResolution {
  intents: string[]
  signals: RuntimeIntentSignal[]
}

export function resolveRuntimeIntents(message: string, debugContext: AgentDebugContextPanel): RuntimeIntentResolution {
  const signals: RuntimeIntentSignal[] = []
  const normalized = message.toLowerCase()
  for (const label of debugContext.labels) {
    const normalizedLabel = normalizeIntentLabel(label)
    if (!normalizedLabel) continue
    addSignal(signals, normalizedLabel, 'client_label', 'high', `label:${label}`)
    if (isVisualGenerationLabel(normalizedLabel)) addSignal(signals, 'visual_generation', 'label_alias', 'high', `label:${label}`)
  }

  for (const [intent, needles] of INTENT_KEYWORD_MAPPINGS) {
    const matchedNeedle = needles.find((needle) => matchesIntentNeedle(normalized, needle.toLowerCase(), intent))
    if (matchedNeedle) addSignal(signals, intent, 'keyword_fallback', 'low', `keyword:${matchedNeedle}`)
  }

  if (debugContext.agentTaskGraph) addSignal(signals, 'planner_subagents', 'agent_taskGraph', 'high', `taskGraph:${debugContext.agentTaskGraph.id}`)
  if (isVisualGenerationRequest(normalized, debugContext)) addSignal(signals, 'visual_generation', 'visual_context', 'medium', 'visual_context')
  if (intentSet(signals).has('asset_candidate_generation')) addSignal(signals, 'visual_generation', 'derived', 'medium', 'asset_candidate_generation')
  return {
    intents: Array.from(intentSet(signals)),
    signals,
  }
}

function addSignal(
  signals: RuntimeIntentSignal[],
  intent: string,
  source: RuntimeIntentSource,
  confidence: RuntimeIntentConfidence,
  evidence: string,
): void {
  const normalized = intent.trim()
  if (!normalized) return
  signals.push({ intent: normalized, source, confidence, evidence })
}

function intentSet(signals: RuntimeIntentSignal[]): Set<string> {
  return new Set(signals.map((signal) => signal.intent))
}

function normalizeIntentLabel(label: string): string | undefined {
  const normalized = label.trim().toLowerCase().replaceAll('-', '_')
  if (!normalized) return undefined
  return normalized.startsWith('intent:') ? normalized.slice('intent:'.length).trim() : normalized
}

function isVisualGenerationLabel(label: string): boolean {
  return [
    'visual_generation',
    'image_generation',
    'video_generation',
    'image_edit',
    '图片生成',
    '图片编辑',
    '视频生成',
    '生成请求',
  ].some((needle) => label.includes(needle))
}

const INTENT_KEYWORD_MAPPINGS = [
  ['visual_generation', [
    '生成图片',
    '生成视频',
    '生成图片候选',
    '生成视频候选',
    '出图',
    '出视频',
    'image generation',
    'video generation',
    'image edit',
    'image_edit',
    'edit image',
    '编辑图片',
    '图片编辑',
    '改图',
    '修图',
    '参考图',
    '这张图',
    '这张图片',
  ]],
  ['planner_subagents', ['subagent', 'worker', 'parallel', '并行', '子 agent', '分工']],
] as const

function matchesIntentNeedle(message: string, needle: string, intent: string): boolean {
  if (!message.includes(needle)) return false
  if (intent !== 'asset_candidate_generation' && intent !== 'visual_generation') return true
  return hasNonNegatedNeedle(message, needle)
}

function hasNonNegatedNeedle(message: string, needle: string): boolean {
  let index = message.indexOf(needle)
  while (index >= 0) {
    if (!isNegatedIntentMatch(message, index)) return true
    index = message.indexOf(needle, index + needle.length)
  }
  return false
}

function isNegatedIntentMatch(message: string, matchIndex: number): boolean {
  const prefix = message.slice(Math.max(0, matchIndex - 12), matchIndex)
  return /(?:不要|不必|不用|无需|不需要|禁止|避免|别|不|do not|don't|dont|no)\s*$/.test(prefix)
    || /(?:不要|不必|不用|无需|不需要|禁止|避免|别|不)\s*(?:创建|调用|进入|执行|启动|发起)?\s*$/.test(prefix)
}

function isVisualGenerationRequest(message: string, debugContext: AgentDebugContextPanel): boolean {
  if (message.trim().length === 0) return false
  if (hasAnyNonNegated(message, DIRECT_VISUAL_GENERATION_NEEDLES)) return true
  if (!hasImageContext(debugContext)) return false
  return hasAnyNonNegated(message, IMAGE_CONTEXT_EDIT_NEEDLES)
}

function hasImageContext(debugContext: AgentDebugContextPanel): boolean {
  return debugContext.attachments.some(isImageLike)
    || debugContext.recentResources.some(isImageLike)
    || debugContext.labels.some((label) => /图片|图像|image|image_edit|resource/i.test(label))
}

function isImageLike(item: { name?: string; type?: string; mimeType?: string }): boolean {
  const type = item.type?.toLowerCase() ?? ''
  const mimeType = item.mimeType?.toLowerCase() ?? ''
  const name = item.name?.toLowerCase() ?? ''
  return type.includes('image')
    || type.includes('图片')
    || mimeType.startsWith('image/')
    || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name)
}

function hasAnyNonNegated(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => hasNonNegatedNeedle(value, needle))
}

const DIRECT_VISUAL_GENERATION_NEEDLES = [
  '生成图片',
  '生成视频',
  '出图',
  '出视频',
  'visual generation',
  'image generation',
  'video generation',
  'image edit',
  'image_edit',
  'edit image',
  '编辑图片',
  '图片编辑',
  '改图',
  '修图',
  '参考图',
] as const

const IMAGE_CONTEXT_EDIT_NEEDLES = [
  '这张',
  '这个图',
  '这张图',
  '这张图片',
  '这幅图',
  '这幅图片',
  '这只',
  '这个小猫',
  '小猫',
  '参考图',
  '原图',
  '图中',
  '图片里',
  '照片里',
  '让它',
  '让他',
  '让她',
  '站起来',
  '坐下',
  '转身',
  '换成',
  '变成',
  '保持',
  '不要改变',
] as const
