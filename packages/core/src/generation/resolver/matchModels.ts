import { generationReferenceRoleLabel } from '../promptComposer.js'
import type {
  GenerationBlockedModel,
  GenerationCallProfile,
  GenerationModelInputSlot,
  GenerationModelResolverProfile,
  GenerationResolvedModel,
  GenerationResolverBlocker,
  GenerationResolverMatchLevel,
  GenerationResolverModelLike,
  GenerationResolverReference,
} from './types.js'
import {
  generationModelId,
  generationModelLabel,
  normalizeGenerationModelProfile,
} from './modelProfile.js'
import {
  normalizeGenerationResolverMediaType,
  normalizeGenerationResolverOutput,
  normalizeGenerationResolverRole,
} from './normalizeReferences.js'

export function matchGenerationModels<Model extends GenerationResolverModelLike>(
  models: readonly Model[],
  profile: GenerationCallProfile,
  references: readonly GenerationResolverReference[],
): { matches: GenerationResolvedModel<Model>[]; blocked: GenerationBlockedModel<Model>[] } {
  const matches: GenerationResolvedModel<Model>[] = []
  const blocked: GenerationBlockedModel<Model>[] = []
  for (const model of models) {
    const modelProfile = normalizeGenerationModelProfile(model)
    const result = matchGenerationModel(model, modelProfile, profile, references)
    if ('blockers' in result) blocked.push(result)
    else matches.push(result)
  }
  matches.sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
  return { matches, blocked }
}

function matchGenerationModel<Model extends GenerationResolverModelLike>(
  model: Model,
  modelProfile: GenerationModelResolverProfile,
  profile: GenerationCallProfile,
  references: readonly GenerationResolverReference[],
): GenerationResolvedModel<Model> | GenerationBlockedModel<Model> {
  const modelId = generationModelId(model)
  const label = generationModelLabel(model)
  const blockers: GenerationResolverBlocker[] = []
  const outputs = arrayValue(modelProfile.output).map(normalizeGenerationResolverOutput).filter((item): item is string => Boolean(item))
  if (!outputs.includes(profile.output)) {
    blockers.push({
      code: 'unsupported_output',
      model_id: modelId,
      message: `${label} 不支持输出 ${profile.output}`,
      details: { output: profile.output, modelOutputs: outputs },
    })
  }
  const declaredOperations = arrayValue(modelProfile.operations).map((item) => String(item).trim()).filter(Boolean)
  if (declaredOperations.length > 0 && !declaredOperations.some((operation) => profile.preferred_operations.includes(operation))) {
    blockers.push({
      code: 'unsupported_output',
      model_id: modelId,
      message: `${label} 不支持当前引用组合对应的调用方式`,
      details: {
        preferredOperations: profile.preferred_operations,
        modelOperations: declaredOperations,
      },
    })
  }

  const slotMatches = references.map((ref) => findMatchingSlot(ref, modelProfile.input_slots ?? []))
  for (let index = 0; index < references.length; index += 1) {
    const match = slotMatches[index]
    if (!match) {
      const ref = references[index]
      blockers.push({
        code: 'unsupported_reference',
        model_id: modelId,
        message: `${label} 不支持 ${referenceLabel(ref)}`,
        reference: ref,
      })
    }
  }
  for (const slot of modelProfile.input_slots ?? []) {
    const count = slotMatches.filter((match) => match?.slot === slot).length
    const min = slot.required ? Math.max(1, slot.min ?? 0) : slot.min ?? 0
    const max = slot.max
    if (min > 0 && count < min) {
      blockers.push({
        code: 'missing_required_reference',
        model_id: modelId,
        message: `${label} 缺少 ${slot.label ?? slot.id ?? '必需引用'}`,
        details: { slot, count, min },
      })
    }
    if (typeof max === 'number' && max >= 0 && count > max) {
      blockers.push({
        code: 'too_many_references',
        model_id: modelId,
        message: `${label} 的 ${slot.label ?? slot.id ?? '引用'} 最多 ${max} 个`,
        details: { slot, count, max },
      })
    }
  }
  if (references.length > 0 && (modelProfile.input_slots ?? []).length === 0) {
    blockers.push({
      code: 'unsupported_reference',
      model_id: modelId,
      message: `${label} 不支持提示词引用资源`,
    })
  }

  if (blockers.length > 0) return { model, model_id: modelId, label, blockers, profile: modelProfile }

  const levels = slotMatches.map((match) => match?.level).filter((level): level is GenerationResolverMatchLevel => Boolean(level))
  const level = worstLevel(levels)
  const reasons = generationModelMatchReasons(profile, references)
  const legacyOperation = profile.preferred_operations.find((operation) => declaredOperations.length === 0 || declaredOperations.includes(operation))
    ?? declaredOperations[0]
  return {
    model,
    model_id: modelId,
    label,
    level,
    score: scoreModel(model, level, reasons, references),
    reasons,
    supported_params: model.supported_params,
    profile: modelProfile,
    ...(legacyOperation ? { legacy_operation: legacyOperation } : {}),
  }
}

function findMatchingSlot(
  ref: GenerationResolverReference,
  slots: readonly GenerationModelInputSlot[],
): { slot: GenerationModelInputSlot; level: GenerationResolverMatchLevel } | undefined {
  const exact = slots.find((slot) => slotMatchesReference(slot, ref, true))
  if (exact) return { slot: exact, level: exact.match_level ?? 'exact' }
  const compatible = slots.find((slot) => slotMatchesReference(slot, ref, false))
  if (compatible) return { slot: compatible, level: compatible.match_level ?? 'compatible' }
  return undefined
}

function slotMatchesReference(slot: GenerationModelInputSlot, ref: GenerationResolverReference, requireRole: boolean): boolean {
  const mediaTypes = arrayValue(slot.media_type).map(normalizeGenerationResolverMediaType)
  if (!mediaTypes.includes(ref.media_type)) return false
  const roles = arrayValue(slot.roles).map(normalizeGenerationResolverRole).filter((role): role is string => Boolean(role))
  if (roles.length === 0) return true
  if (roles.includes(ref.role)) return true
  if (!requireRole && ref.role === 'generic') return true
  return false
}

function generationModelMatchReasons(
  profile: GenerationCallProfile,
  references: readonly GenerationResolverReference[],
): string[] {
  if (references.length === 0) return [`支持${profile.labels[0] ?? '提示词生成'}`]
  return Array.from(new Set(references.map((ref) => `支持${referenceLabel(ref)}`)))
}

function referenceLabel(ref: GenerationResolverReference | undefined): string {
  if (!ref) return '引用'
  const roleLabel = generationReferenceRoleLabel(ref.role) || ref.role
  if (ref.media_type === 'image') return roleLabel
  if (ref.media_type === 'video') return roleLabel || '视频参考'
  if (ref.media_type === 'audio') return roleLabel || '音频参考'
  return roleLabel || ref.media_type
}

function worstLevel(levels: readonly GenerationResolverMatchLevel[]): GenerationResolverMatchLevel {
  if (levels.includes('requires_adaptation')) return 'requires_adaptation'
  if (levels.includes('compatible')) return 'compatible'
  return 'exact'
}

function scoreModel(
  model: GenerationResolverModelLike,
  level: GenerationResolverMatchLevel,
  reasons: readonly string[],
  references: readonly GenerationResolverReference[],
): number {
  const levelScore = level === 'exact' ? 300 : level === 'compatible' ? 200 : 100
  const defaultScore = model.is_default ? 20 : 0
  const referenceScore = references.length > 0 ? references.length * 8 : 4
  return levelScore + defaultScore + referenceScore + reasons.length
}

function arrayValue<T>(value: readonly T[] | undefined | null): T[]
function arrayValue<T>(value: T | undefined | null): T[]
function arrayValue<T>(value: T | readonly T[] | undefined | null): T[] {
  if (Array.isArray(value)) return [...value]
  return value === undefined || value === null ? [] : [value as T]
}
