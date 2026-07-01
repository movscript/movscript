import { projectEntryDefinitions, type ProjectEntryDefinition } from '../domain/projectEntryRegistry'
import type { ProjectOverviewData, ProjectOverviewRecord } from '../application/projectOverviewData'

export type ProjectOverviewLaneState = 'ready' | 'active' | 'blocked' | 'empty'

export interface ProjectOverviewWorkLane {
  definition: ProjectEntryDefinition
  count: number
  detail: string
  progress: number
  state: ProjectOverviewLaneState
}

export interface ProjectOverviewModel {
  lanes: ProjectOverviewWorkLane[]
  blockedCount: number
  nextLane: ProjectOverviewWorkLane | undefined
  homeEntryLanes: ProjectOverviewWorkLane[]
}

export function buildProjectOverviewModel({
  data,
  project,
}: {
  data: ProjectOverviewData
  project?: {
    aspect_ratio?: unknown
    visual_style?: unknown
    project_style?: unknown
  } | null
}): ProjectOverviewModel {
  const productionProgress = data.productions.length
    ? Math.round(data.productions.reduce((sum, item) => sum + numberOf(item.progress), 0) / data.productions.length)
    : 0
  const readyContentUnits = data.contentUnits.filter((item) => hasText(item, ['title', 'description', 'prompt'])).length
  const readyKeyframes = data.keyframes.filter((item) => hasText(item, ['title', 'description', 'prompt'])).length
  const lockedAssets = data.assetSlots.filter(hasLockedResource).length
  const missingAssets = Math.max(0, data.assetSlots.length - lockedAssets)
  const timelineStatus = recordValue(data.projectTimelineStatus)
  const timelineNamespaces = arrayValue(timelineStatus?.timeline_namespaces ?? timelineStatus?.timelineNamespaces)
  const systemPrimitives = recordValue(timelineStatus?.system_primitives ?? timelineStatus?.systemPrimitives)
  const timelineNamespaceSignals = timelineStatus
    ? optionalNumber(timelineStatus.timeline_namespace_count ?? timelineStatus.timelineNamespaceCount) ?? timelineNamespaces.length
    : data.productions.length + data.segments.length
  const sceneMomentSignals = optionalNumber(systemPrimitives?.scene_moments_count ?? systemPrimitives?.sceneMomentsCount) ?? data.sceneMoments.length
  const timelinePrimitiveSignals = sceneMomentSignals + data.keyframes.length
  const hasTimelineStructure = timelineNamespaceSignals > 0 || sceneMomentSignals > 0
  const hasProductionInput = hasTimelineStructure || data.contentUnits.length > 0

  const standardsDone = [
    project?.aspect_ratio,
    project?.visual_style,
    project?.project_style,
    data.scriptVersions.length > 0,
    data.settings.length > 0,
  ].filter(Boolean).length
  const standardsProgress = percentage(standardsDone, 5)

  const scriptSignals = data.scriptVersions.length + timelineNamespaceSignals + sceneMomentSignals
  const scriptProgress = Math.max(productionProgress, percentage(timelineNamespaceSignals + sceneMomentSignals, Math.max(1, scriptSignals)))
  const contentSignals = data.contentUnits.length + data.keyframes.length
  const contentProgress = percentage(readyContentUnits + readyKeyframes, Math.max(1, contentSignals))

  const lanes = projectEntryDefinitions.map((definition): ProjectOverviewWorkLane => {
    if (definition.id === 'project_standards') {
      return {
        definition,
        count: standardsDone,
        detail: `${data.scriptVersions.length} 个手记版本，${data.settings.length} 个设定可继承规范`,
        progress: standardsProgress,
        state: standardsProgress >= 70 ? 'ready' : standardsProgress > 0 ? 'active' : 'empty',
      }
    }
    if (definition.id === 'content_canvas') {
      return {
        definition,
        count: contentSignals,
        detail: `${data.contentUnits.length} 个创作片段，${data.keyframes.length} 个关键帧`,
        progress: contentProgress,
        state: !hasProductionInput && data.scriptVersions.length === 0 ? 'blocked' : contentProgress >= 70 ? 'ready' : contentSignals > 0 || timelinePrimitiveSignals > 0 ? 'active' : 'empty',
      }
    }
    if (definition.id === 'content_preview') {
      return {
        definition,
        count: data.contentUnits.length,
        detail: `${data.contentUnits.length} 个片段可预览`,
        progress: contentProgress,
        state: data.contentUnits.length === 0 ? 'blocked' : contentProgress >= 70 ? 'ready' : 'active',
      }
    }
    if (definition.id === 'setting_preview') {
      const settingSignals = data.settings.length + data.assetSlots.length
      const settingProgress = percentage(data.settings.length + lockedAssets, Math.max(1, settingSignals))
      return {
        definition,
        count: settingSignals,
        detail: `${data.settings.length} 个设定，${lockedAssets} 个素材已锁定，${missingAssets} 个素材缺口`,
        progress: settingProgress,
        state: settingSignals === 0 ? 'empty' : settingProgress >= 70 ? 'ready' : 'active',
      }
    }
    return {
      definition,
      count: scriptSignals,
      detail: `${timelineNamespaceSignals} 个时间结构，${sceneMomentSignals} 个场面`,
      progress: scriptProgress,
      state: data.scriptVersions.length === 0 && !hasTimelineStructure ? 'blocked' : scriptProgress >= 70 ? 'ready' : scriptSignals > 0 ? 'active' : 'empty',
    }
  })

  return {
    lanes,
    blockedCount: lanes.filter((lane) => lane.state === 'blocked').length,
    nextLane: lanes.find((lane) => lane.state === 'blocked') ?? lanes.find((lane) => lane.state === 'active') ?? lanes[0],
    homeEntryLanes: [
      lanes.find((lane) => lane.definition.id === 'project_standards'),
      lanes.find((lane) => lane.definition.id === 'content_canvas'),
      lanes.find((lane) => lane.definition.id === 'content_preview'),
      lanes.find((lane) => lane.definition.id === 'setting_preview'),
    ].filter((lane): lane is ProjectOverviewWorkLane => Boolean(lane)),
  }
}

export function projectOverviewLaneLabel(state: ProjectOverviewLaneState) {
  if (state === 'ready') return '已就绪'
  if (state === 'active') return '进行中'
  if (state === 'blocked') return '待前置'
  return '未开始'
}

export function projectOverviewNextActionLabel(definition: ProjectEntryDefinition) {
  if (definition.id === 'project_standards') return '进入项目规范'
  if (definition.id === 'orchestration_production') return '进入创作编排'
  if (definition.id === 'content_canvas') return '进入画布'
  if (definition.id === 'content_preview') return '进入预览'
  if (definition.id === 'setting_preview') return '进入设定预览'
  return '进入入口'
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

function numberOf(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function hasText(record: ProjectOverviewRecord, keys: string[]) {
  return keys.some((key) => typeof record[key] === 'string' && String(record[key]).trim().length > 0)
}

function hasLockedResource(record: ProjectOverviewRecord) {
  return Boolean(record.locked_asset_slot_id || record.locked_resource_id || record.resource_id || record.lock)
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
