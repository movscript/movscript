import type { GenerationIntentPayload, GenerationReferenceAssetPayload } from './jobPayload.js'
import { generationOperationAcceptsReferences } from './promptComposer.js'

export type GenerationReadinessStatus = 'ready' | 'blocked'

export type GenerationReadinessBlockerCode =
  | 'generation_running'
  | 'missing_prompt'
  | 'missing_model'
  | 'unsupported_output_kind'
  | 'prompt_preflight_pending'
  | 'prompt_compile_failed'
  | 'prompt_blocker'
  | 'missing_generation_intent'
  | 'missing_capability_intent'
  | 'missing_operation_intent'
  | 'operation_reference_assets_mismatch'
  | 'missing_input_resource_id'
  | 'missing_input_media_type'
  | 'missing_input_role'
  | 'missing_required_input'

export interface GenerationReadinessBlocker {
  code: GenerationReadinessBlockerCode
  field?: string
  message: string
  details?: Record<string, unknown>
}

export interface GenerationReadinessRequiredInput {
  key: string
  label?: string
  required?: boolean
  filled?: boolean
}

export interface GenerationReadinessInput {
  isRunning?: boolean
  prompt?: string | null
  promptRequired?: boolean
  modelId?: string | number | null
  outputKind?: string | null
  supportedOutputKinds?: readonly string[]
  requireGenerationIntent?: boolean
  generationIntent?: GenerationIntentPayload | null
  inputResourceIds?: readonly number[]
  referenceAssets?: readonly Partial<GenerationReferenceAssetPayload>[]
  requiredInputs?: readonly GenerationReadinessRequiredInput[]
  compiledPromptLoaded?: boolean
  compiledPromptError?: string | null
  promptBlockers?: readonly unknown[]
}

export interface GenerationReadinessResult {
  status: GenerationReadinessStatus
  blockers: GenerationReadinessBlocker[]
}

export interface GenerationBackendPreflightBlocker {
  code?: string
  field?: string
  message?: string
  [key: string]: unknown
}

export interface GenerationBackendPreflightResult {
  ready?: boolean
  status?: 'ready' | 'blocked' | string
  blockers?: GenerationBackendPreflightBlocker[]
  [key: string]: unknown
}

export interface GenerationReferenceRequirement {
  id: string
  label: string
  roles?: readonly string[]
  mediaTypes?: readonly string[]
  minCount?: number
}

export function evaluateGenerationReadiness(input: GenerationReadinessInput): GenerationReadinessResult {
  const blockers: GenerationReadinessBlocker[] = []
  const promptRequired = input.promptRequired ?? true
  const modelId = String(input.modelId ?? '').trim()
  const intent = input.generationIntent ?? undefined
  const inputResourceIds = input.inputResourceIds ?? []
  const referenceAssets = input.referenceAssets ?? intent?.reference_assets ?? []

  if (input.isRunning) {
    blockers.push({
      code: 'generation_running',
      message: '生成任务正在运行',
    })
  }
  if (promptRequired && !String(input.prompt ?? '').trim()) {
    blockers.push({
      code: 'missing_prompt',
      field: 'prompt',
      message: '需要先填写提示词',
    })
  }
  if (!modelId) {
    blockers.push({
      code: 'missing_model',
      field: 'model_id',
      message: '需要先选择可用模型',
    })
  }
  if (input.outputKind && input.supportedOutputKinds && !input.supportedOutputKinds.includes(input.outputKind)) {
    blockers.push({
      code: 'unsupported_output_kind',
      field: 'output_kind',
      message: `${input.outputKind} 当前不支持生成`,
      details: { outputKind: input.outputKind, supportedOutputKinds: input.supportedOutputKinds },
    })
  }
  if (input.compiledPromptLoaded === false) {
    blockers.push({
      code: 'prompt_preflight_pending',
      field: 'prompt',
      message: '提示词仍在预检中',
    })
  }
  if (input.compiledPromptError) {
    blockers.push({
      code: 'prompt_compile_failed',
      field: 'prompt',
      message: input.compiledPromptError,
    })
  }
  for (const blocker of input.promptBlockers ?? []) {
    blockers.push({
      code: 'prompt_blocker',
      field: 'prompt',
      message: promptBlockerMessage(blocker),
      details: isRecord(blocker) ? blocker : undefined,
    })
  }
  for (const requiredInput of input.requiredInputs ?? []) {
    if (requiredInput.required === false || requiredInput.filled) continue
    blockers.push({
      code: 'missing_required_input',
      field: requiredInput.key,
      message: `缺少必需输入：${requiredInput.label ?? requiredInput.key}`,
      details: { key: requiredInput.key, label: requiredInput.label },
    })
  }

  const intentRequired = input.requireGenerationIntent ?? requiresStructuredGenerationIntent(input.outputKind, intent, inputResourceIds)
  if (intentRequired) {
    if (!intent) {
      blockers.push({
        code: 'missing_generation_intent',
        field: 'generation_intent',
        message: '需要明确生成能力和 operation',
      })
    } else {
      if (!intent.capability?.trim()) {
        blockers.push({
          code: 'missing_capability_intent',
          field: 'generation_intent.capability',
          message: '需要明确生成 capability',
        })
      }
      if (!intent.operation?.trim()) {
        blockers.push({
          code: 'missing_operation_intent',
          field: 'generation_intent.operation',
          message: '需要明确生成 operation',
        })
      }
    }
  }

  if (inputResourceIds.length > 0 && intentRequired) {
    if (referenceAssets.length < inputResourceIds.length) {
      blockers.push({
        code: 'missing_input_role',
        field: 'generation_intent.reference_assets',
        message: '每个输入资源都需要声明 role 和 media_type',
      })
    }
    for (let index = 0; index < Math.min(referenceAssets.length, inputResourceIds.length); index += 1) {
      const ref = referenceAssets[index]
      if (!ref?.resource_id && !inputResourceIds[index]) {
        blockers.push({
          code: 'missing_input_resource_id',
          field: 'generation_intent.reference_assets.resource_id',
          message: '输入资源缺少 resource_id',
        })
      }
      if (!String(ref?.media_type ?? '').trim()) {
        blockers.push({
          code: 'missing_input_media_type',
          field: 'generation_intent.reference_assets.media_type',
          message: '输入资源缺少 media_type',
        })
      }
      if (!String(ref?.role ?? '').trim()) {
        blockers.push({
          code: 'missing_input_role',
          field: 'generation_intent.reference_assets.role',
          message: '输入资源缺少 role',
        })
      }
    }
  }

  for (const requirement of generationOperationReferenceRequirements(intent?.operation)) {
    if (generationReferenceRequirementCount(requirement, referenceAssets) >= (requirement.minCount ?? 1)) continue
    blockers.push({
      code: 'missing_required_input',
      field: 'generation_intent.reference_assets',
      message: `缺少必需输入：${requirement.label}`,
      details: { requirement },
    })
  }
  if (intent?.operation?.trim() && !generationOperationAcceptsReferences(intent.operation, referenceAssets)) {
    blockers.push({
      code: 'operation_reference_assets_mismatch',
      field: 'generation_intent.operation',
      message: '当前 operation 不支持这些引用资源',
      details: {
        operation: intent.operation,
        referenceAssets,
      },
    })
  }

  return {
    status: blockers.length > 0 ? 'blocked' : 'ready',
    blockers,
  }
}

export function generationReadinessIsReady(result: GenerationReadinessResult): boolean {
  return result.status === 'ready' && result.blockers.length === 0
}

export function firstGenerationReadinessBlockerMessage(result: GenerationReadinessResult): string | undefined {
  return result.blockers[0]?.message
}

export function generationReadinessBlockerMessages(result: GenerationReadinessResult): string[] {
  return result.blockers.map((blocker) => blocker.message)
}

export function generationBackendPreflightIsReady(result: GenerationBackendPreflightResult | null | undefined): boolean {
  if (!result) return false
  const blockers = generationBackendPreflightBlockerMessages(result)
  return (result.ready === true || result.status === 'ready') && blockers.length === 0
}

export function generationBackendPreflightBlockerMessages(result: GenerationBackendPreflightResult | null | undefined): string[] {
  if (!result) return []
  const blockers = Array.isArray(result.blockers) ? result.blockers : []
  return blockers.map(generationBackendPreflightBlockerMessage).filter((message): message is string => Boolean(message))
}

export function generationBackendPreflightBlockerMessage(blocker: GenerationBackendPreflightBlocker): string | undefined {
  const message = typeof blocker.message === 'string' ? blocker.message.trim() : ''
  if (message) return message
  const code = typeof blocker.code === 'string' ? blocker.code.trim() : ''
  const field = typeof blocker.field === 'string' ? blocker.field.trim() : ''
  if (code && field) return `${field}: ${code}`
  if (code) return code
  if (field) return `${field} 未通过后端预检`
  return undefined
}

export function generationOperationReferenceRequirements(operation: string | undefined): GenerationReferenceRequirement[] {
  switch (operation?.trim()) {
    case 'image_to_image':
    case 'image_edit':
    case 'reference_to_image':
    case 'style_transfer':
    case 'image_to_video':
      return [{ id: `${operation}:image`, label: '参考图', mediaTypes: ['image'] }]
    case 'first_frame_to_video':
      return [{ id: 'first_frame', label: '首帧图', roles: ['first_frame'], mediaTypes: ['image'] }]
    case 'first_last_frame_to_video':
      return [
        { id: 'first_frame', label: '首帧图', roles: ['first_frame'], mediaTypes: ['image'] },
        { id: 'last_frame', label: '尾帧图', roles: ['last_frame'], mediaTypes: ['image'] },
      ]
    case 'video_to_video':
      return [{ id: 'video_to_video:video', label: '参考视频', mediaTypes: ['video'] }]
    case 'reference_to_video':
      return [{ id: 'reference_to_video:media', label: '参考图或参考视频', mediaTypes: ['image', 'video'] }]
    case 'stt':
    case 'speech_translate':
    case 'audio_chat':
    case 'voice_clone':
    case 'speech_enhancement':
    case 'dubbing':
      return [{ id: `${operation}:audio`, label: '参考音频', mediaTypes: ['audio'] }]
    default:
      return []
  }
}

function requiresStructuredGenerationIntent(
  outputKind: string | null | undefined,
  intent: GenerationIntentPayload | undefined,
  inputResourceIds: readonly number[],
): boolean {
  if (intent) return true
  if (inputResourceIds.length > 0) return true
  return outputKind === 'image' || outputKind === 'video'
}

function generationReferenceRequirementCount(
  requirement: GenerationReferenceRequirement,
  refs: readonly Partial<GenerationReferenceAssetPayload>[],
): number {
  return refs.filter((ref) => generationReferenceMatchesRequirement(ref, requirement)).length
}

function generationReferenceMatchesRequirement(
  ref: Partial<GenerationReferenceAssetPayload>,
  requirement: GenerationReferenceRequirement,
): boolean {
  const role = String(ref.role ?? '').trim()
  const mediaType = String(ref.media_type ?? '').trim()
  if (requirement.roles && !requirement.roles.includes(role)) return false
  if (requirement.mediaTypes && !requirement.mediaTypes.includes(mediaType)) return false
  return Boolean(role || mediaType)
}

function promptBlockerMessage(blocker: unknown): string {
  if (!isRecord(blocker)) return '提示词引用尚未解析'
  const message = stringValue(blocker.message)
  if (message) return message
  const ref = stringValue(blocker.ref)
  if (ref) return `提示词引用尚未解析：${ref}`
  const code = stringValue(blocker.code)
  if (code) return `提示词引用尚未解析：${code}`
  return '提示词引用尚未解析'
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
