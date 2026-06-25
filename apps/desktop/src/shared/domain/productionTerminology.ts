import type { WorkbenchPriority, WorkbenchStatus } from '@/shared/domain/workbenchTypes'

export type ProductionActionKey =
  | 'complete_info'
  | 'add_setting'
  | 'add_asset'
  | 'select_asset'
  | 'selected_asset'
  | 'confirm_content'
  | 'split_shots'
  | 'add_keyframe'
  | 'ready_to_generate'
  | 'generating'
  | 'review_result'
  | 'rework'
  | 'lock_version'
  | 'done'

export type ProductionCoverageKey = 'empty' | 'gap' | 'partial' | 'covered' | 'locked'
export type ProductionTermState = 'empty' | 'blocked' | 'pending' | 'active' | 'ready' | 'complete'

export interface ProductionTerm {
  key: string
  label: string
  state: ProductionTermState
  detail: string
}

const ACTION_TERMS: Record<ProductionActionKey, ProductionTerm> = {
  complete_info: { key: 'complete_info', label: '补信息', state: 'blocked', detail: '基础字段还不完整，先补齐标题、描述、用途或归属。' },
  add_setting: { key: 'add_setting', label: '补设定', state: 'blocked', detail: '缺人物、场景、道具、风格或世界规则，先补齐制作依据。' },
  add_asset: { key: 'add_asset', label: '补素材', state: 'blocked', detail: '缺可用参考或主素材，先生成、上传或绑定素材。' },
  select_asset: { key: 'select_asset', label: '选素材', state: 'pending', detail: '已有候选，但还没有选定主素材。' },
  selected_asset: { key: 'selected_asset', label: '已选定', state: 'complete', detail: '已经选中主素材，可以进入下游制作。' },
  confirm_content: { key: 'confirm_content', label: '确认内容', state: 'pending', detail: '已有草案或建议，需要人工确认后进入下游。' },
  split_shots: { key: 'split_shots', label: '拆镜头', state: 'pending', detail: '情节已有基础信息，可以拆成创作片段或镜头。' },
  add_keyframe: { key: 'add_keyframe', label: '补关键帧', state: 'blocked', detail: '视觉镜头缺画面锚点，先补首帧、尾帧或关键画面。' },
  ready_to_generate: { key: 'ready_to_generate', label: '可生成', state: 'ready', detail: '生成前条件已满足，可以进入画布或生成任务。' },
  generating: { key: 'generating', label: '生成中', state: 'active', detail: '生成任务正在执行，等待结果或查看任务记录。' },
  review_result: { key: 'review_result', label: '审阅结果', state: 'pending', detail: '已有生成或制作结果，需要判断是否采用。' },
  rework: { key: 'rework', label: '处理返工', state: 'blocked', detail: '结果未达到要求，需要修改意见或重新生成。' },
  lock_version: { key: 'lock_version', label: '锁定版本', state: 'complete', detail: '内容可作为正式制作依据，确认后锁定主版本。' },
  done: { key: 'done', label: '已完成', state: 'complete', detail: '当前对象已经完成闭环。' },
}

const COVERAGE_TERMS: Record<ProductionCoverageKey, ProductionTerm> = {
  empty: { key: 'empty', label: '无内容', state: 'empty', detail: '还没有关联的设定、素材或制作输入。' },
  gap: { key: 'gap', label: '有缺口', state: 'blocked', detail: '关键条件缺失，会影响下游制作。' },
  partial: { key: 'partial', label: '部分覆盖', state: 'pending', detail: '已有一部分内容，但还需要选择或补齐。' },
  covered: { key: 'covered', label: '已覆盖', state: 'ready', detail: '当前上下文需要的内容已经够用。' },
  locked: { key: 'locked', label: '已锁定', state: 'complete', detail: '内容已经成为正式制作依据。' },
}

export function productionActionTerm(key: ProductionActionKey): ProductionTerm {
  return ACTION_TERMS[key]
}

export function productionCoverageTerm(key: ProductionCoverageKey): ProductionTerm {
  return COVERAGE_TERMS[key]
}

export function scenarioAction(status: WorkbenchStatus): ProductionTerm {
  if (status === 'blocked') return ACTION_TERMS.complete_info
  if (status === 'ready') return ACTION_TERMS.ready_to_generate
  if (status === 'running') return ACTION_TERMS.generating
  return ACTION_TERMS.confirm_content
}

export function contentUnitAction(input: {
  status?: string
  hasPrompt?: boolean
  missingSlotCount?: number
  keyframeCount?: number
  requiresKeyframe?: boolean
}): ProductionTerm {
  const status = String(input.status ?? '').trim().toLowerCase()
  if (!input.hasPrompt) return ACTION_TERMS.complete_info
  if (positiveInteger(input.missingSlotCount) > 0) return ACTION_TERMS.add_asset
  if (input.requiresKeyframe && positiveInteger(input.keyframeCount) === 0) return ACTION_TERMS.add_keyframe
  if (status === 'in_production' || status === 'running') return ACTION_TERMS.generating
  if (status === 'confirmed' || status === 'locked') return ACTION_TERMS.ready_to_generate
  return ACTION_TERMS.confirm_content
}

export function assetSlotAction(input: { status?: string; candidateCount?: number; hasResource?: boolean }): ProductionTerm {
  const status = String(input.status ?? '').trim().toLowerCase()
  if (status === 'locked' || input.hasResource) return ACTION_TERMS.selected_asset
  if (status === 'candidate' || positiveInteger(input.candidateCount) > 0) return ACTION_TERMS.select_asset
  if (status === 'waived') return ACTION_TERMS.done
  return ACTION_TERMS.add_asset
}

export function assetCoverage(input: { total: number; missing: number; candidate: number; locked: number }): ProductionTerm {
  const total = positiveInteger(input.total)
  const missing = positiveInteger(input.missing)
  const candidate = positiveInteger(input.candidate)
  const locked = positiveInteger(input.locked)
  if (total === 0) return COVERAGE_TERMS.empty
  if (missing > 0) return COVERAGE_TERMS.gap
  if (candidate > 0) return COVERAGE_TERMS.partial
  if (locked > 0) return COVERAGE_TERMS.locked
  return COVERAGE_TERMS.covered
}

export function gateActionLabel(done: boolean, state?: ProductionTermState) {
  if (done) return '已通过'
  return state === 'blocked' ? '待补齐' : '待确认'
}

export function priorityActionLabel(priority: WorkbenchPriority) {
  if (priority === 'high') return '优先处理'
  if (priority === 'medium') return '正常处理'
  return '后续处理'
}

function positiveInteger(value: unknown) {
  return Math.max(0, Math.trunc(Number(value) || 0))
}
