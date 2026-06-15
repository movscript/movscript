import type {
  SemanticEntityConfig,
  SemanticEntityPayload,
  SemanticEntityRecord,
  SourceLockStatus,
} from '@/shared/infrastructure/api/semanticEntities'

export type SemanticEntityInlineFormState = Record<string, string | boolean>

export function sourceLockReasonText(status?: SourceLockStatus) {
  if (!status?.locked) return undefined
  const first = status.reasons[0]
  if (!first) return '来源已锁定，已有下游对象引用当前记录'
  const more = status.reasons.length > 1 ? ` 等 ${status.reasons.length} 类下游对象` : ''
  return `${first.message}${more}`
}

export function sourceLockSupportedKind(kind: SemanticEntityConfig['kind']) {
  return kind === 'productions' ||
    kind === 'segments' ||
    kind === 'sceneMoments' ||
    kind === 'storyboardScripts' ||
    kind === 'contentUnits'
}

export function formatSettingOption(record: SemanticEntityRecord) {
  return [record.name || record.title || `设定资料 #${record.ID}`, kindLabel(record.kind), `#${record.ID}`].filter(Boolean).join(' · ')
}

export function formatSettingStateOption(record: SemanticEntityRecord, reference?: SemanticEntityRecord) {
  const scope = [record.scope_type, record.scope_id ? `#${record.scope_id}` : null].filter(Boolean).join(' ')
  const referenceName = reference?.name || reference?.title
  return [record.name || `状态 #${record.ID}`, referenceName, scope, `#${record.ID}`].filter(Boolean).join(' · ')
}

export function formatScriptBlockOption(record: SemanticEntityRecord) {
  const startLine = record.start_line || '?'
  const endLine = record.end_line || '?'
  const content = String(record.content ?? '').trim().replace(/\s+/g, ' ')
  const excerpt = content.length > 40 ? `${content.slice(0, 40)}...` : content
  return [`剧本块 #${record.ID}`, `行 ${startLine}-${endLine}`, record.speaker || record.kind, excerpt].filter(Boolean).join(' · ')
}

export function isAdvancedField(kind: SemanticEntityConfig['kind'], key: string) {
  if (key.endsWith('_json') || key.endsWith('Json')) return true
  if (key === 'metadata_json' || key === 'profile_json' || key === 'tags_json' || key === 'snapshot_json' || key === 'value_json') return true
  if (key === 'order' || key === 'status' || key === 'source' || key === 'source_type' || key === 'source_id') return true
  if (key === 'slot_key' || key === 'locked_asset_slot_id') return true
  if (key === 'owner_type' || key === 'owner_id') return true
  if (key.endsWith('_id') && !basicIdFieldsByKind[kind]?.includes(key)) return true
  return advancedFieldsByKind[kind]?.includes(key) ?? false
}

export function buildInitialForm(fields: SemanticEntityConfig['fields'], record?: SemanticEntityRecord | null, defaults?: Partial<SemanticEntityPayload>): SemanticEntityInlineFormState {
  const source = record ?? defaults ?? {}
  return Object.fromEntries(fields.map((field) => {
    const raw = source[field.key] ?? defaultValueForField(field.type)
    return [field.key, field.type === 'boolean' ? Boolean(raw) : String(raw ?? '')]
  }))
}

export function buildPayload(fields: SemanticEntityConfig['fields'], form: SemanticEntityInlineFormState): SemanticEntityPayload {
  const payload: SemanticEntityPayload = {}
  for (const field of fields) {
    const value = form[field.key]
    if (field.type === 'boolean') {
      payload[field.key] = Boolean(value)
      continue
    }
    if (field.type === 'number') {
      const raw = String(value ?? '').trim()
      payload[field.key] = raw === '' ? null : Number(raw)
      continue
    }
    payload[field.key] = String(value ?? '').trim()
  }
  return payload
}

export function isFieldFilled(value: string | boolean, type: SemanticEntityConfig['fields'][number]['type']) {
  if (type === 'boolean') return Boolean(value)
  return String(value ?? '').trim().length > 0
}

export function isImmutableKind(kind: SemanticEntityConfig['kind']) {
  return kind === 'scriptVersions' || kind === 'storyboardVersions'
}

export function isDeleteProtectedKind(kind: SemanticEntityConfig['kind']) {
  return isImmutableKind(kind) || kind === 'scriptBlocks'
}

function defaultValueForField(type: SemanticEntityConfig['fields'][number]['type']) {
  if (type === 'boolean') return false
  return ''
}

function kindLabel(kind: unknown) {
  const labels: Record<string, string> = {
    person: '人物',
    place: '地点',
    prop: '道具',
    product: '产品',
    brand: '品牌',
    style: '风格',
    world_rule: '世界规则',
    time_period: '时间段',
    restriction: '限制',
  }
  const key = String(kind ?? '')
  return labels[key] ?? key
}

const basicIdFieldsByKind: Partial<Record<SemanticEntityConfig['kind'], string[]>> = {
  productions: ['script_version_id', 'preview_timeline_id'],
  sceneMoments: ['segment_id', 'script_block_id'],
  contentUnits: ['production_id', 'segment_id', 'scene_moment_id', 'script_block_id'],
  keyframes: ['scene_moment_id', 'content_unit_id'],
}

const advancedFieldsByKind: Partial<Record<SemanticEntityConfig['kind'], string[]>> = {
  productions: ['script_version_id', 'preview_timeline_id', 'progress'],
  sceneMoments: ['segment_id', 'script_block_id'],
  contentUnits: ['production_id', 'segment_id', 'scene_moment_id', 'script_block_id'],
  assetSlots: ['production_id', 'owner_type', 'owner_id', 'setting_id', 'setting_state_id', 'slot_key', 'locked_asset_slot_id'],
}
