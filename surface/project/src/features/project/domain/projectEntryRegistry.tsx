import type { LucideIcon } from 'lucide-react'
import {
  Clapperboard,
  LayoutDashboard,
  Wand2,
} from 'lucide-react'
import { surfaceRoutePath, type SurfaceRouteKey, type SurfaceRouteParams } from '@movscript/shared'

export type ProjectEntryId =
  | 'orchestration_production'
  | 'content'
  | 'project_standards'

export type ProjectEntryStage =
  | 'orchestration_production'
  | 'content'
  | 'standards'

export interface ProjectEntryReviewQuery {
  viewParam?: string
  viewValue?: string
  workspaceIdParam: string
  entityParams?: Record<string, string>
  requiresEntity?: boolean
}

export interface ProjectEntryDefinition {
  id: ProjectEntryId
  title: string
  shortTitle: string
  routeKey: SurfaceRouteKey
  sidebarTitleKey: string
  headerTitleKey: string
  stage: ProjectEntryStage
  icon: LucideIcon
  purpose: string
  decision: string
  output: string
  owns: string[]
  reads: string[]
  primarySelection?: {
    queryParam: string
    entityType: string
  }
  reviewQuery: ProjectEntryReviewQuery
}

export const projectEntryDefinitions: ProjectEntryDefinition[] = [
  {
    id: 'orchestration_production',
    title: '创作编排',
    shortTitle: '手记',
    routeKey: 'project.scripts',
    sidebarTitleKey: 'sidebar.items.productionOrchestration',
    headerTitleKey: 'header.titles.productionOrchestration',
    stage: 'orchestration_production',
    icon: Clapperboard,
    purpose: '把手记、设定、素材约束组织成 production 级结构化蓝图，并继续沉淀镜头方案、时间轴和镜头列表。',
    decision: '手动维护 segments、scene moments、引用关系和镜头方案。',
    output: '可进入创作继续细化执行的创作方案。',
    owns: ['production', 'segment', 'scene_moment', 'setting_usage', 'asset_slot_usage', 'production_local_requirement', 'content_unit', 'keyframe', 'preview_timeline_item'],
    reads: ['project_standards', 'setting', 'asset_slot', 'script'],
    primarySelection: { queryParam: 'productionId', entityType: 'production' },
    reviewQuery: {
      viewParam: 'view',
      viewValue: 'review',
      workspaceIdParam: 'workspaceId',
      entityParams: {
        production: 'productionId',
        scene_moment: 'scene_moment_id',
        content_unit: 'content_unit_id',
      },
      requiresEntity: true,
    },
  },
  {
    id: 'content',
    title: '创作',
    shortTitle: '创作',
    routeKey: 'project.content',
    sidebarTitleKey: 'sidebar.items.workbenchContentGeneration',
    headerTitleKey: 'header.titles.workbenchContentGeneration',
    stage: 'content',
    icon: Wand2,
    purpose: '围绕每个情节拆解创作片段，把设定、素材输入和画面锚点带进生成上下文。',
    decision: '审阅创作片段草案，补齐关键帧、素材缺口和生成上下文。',
    output: '可驱动画面、视频和返工处理的创作输入。',
    owns: ['content_unit', 'keyframe', 'preview_timeline_item', 'generation_context'],
    reads: ['production', 'segment', 'scene_moment', 'setting', 'asset_slot', 'resource', 'job'],
    primarySelection: { queryParam: 'scene_moment_id', entityType: 'scene_moment' },
    reviewQuery: {
      workspaceIdParam: 'workspaceId',
      entityParams: {
        scene_moment: 'scene_moment_id',
        content_unit: 'content_unit_id',
      },
    },
  },
  {
    id: 'project_standards',
    title: '项目规范',
    shortTitle: '规范',
    routeKey: 'project.standards',
    sidebarTitleKey: 'sidebar.items.projectWorkspace',
    headerTitleKey: 'header.titles.projectWorkspace',
    stage: 'standards',
    icon: LayoutDashboard,
    purpose: '统一项目级画幅、镜头语言、视觉风格、节奏和禁用规则。',
    decision: '手动维护固定 8 项项目规范和扩展 prompt 规则。',
    output: '可被后续设定、素材、编排和生成继承的项目级规范。',
    owns: ['project.aspect_ratio', 'project.visual_style', 'project.project_style'],
    reads: ['project'],
    primarySelection: { queryParam: 'projectId', entityType: 'project' },
    reviewQuery: {
      workspaceIdParam: 'workspaceId',
      entityParams: { project: 'projectId' },
    },
  },
]

const defaultProjectEntryDefinition = projectEntryDefinitions[0]

export function getProjectEntryDefinition(id: ProjectEntryId) {
  if (!defaultProjectEntryDefinition) {
    throw new Error('Project entry definitions must declare at least one entry.')
  }
  return projectEntryDefinitions.find((item) => item.id === id) ?? defaultProjectEntryDefinition
}

export interface ProjectEntryReviewInput {
  workspaceId: string
  entityType?: string
  entityId?: string | number
}

export function buildProjectEntryReviewParams(
  definition: ProjectEntryDefinition,
  input: ProjectEntryReviewInput,
) {
  const params: Record<string, string | number | undefined> = {}
  const entityParam = input.entityType && input.entityId !== undefined
    ? definition.reviewQuery.entityParams?.[input.entityType]
    : undefined
  if (definition.reviewQuery.viewParam && definition.reviewQuery.viewValue) {
    params[definition.reviewQuery.viewParam] = definition.reviewQuery.viewValue
  }
  params[definition.reviewQuery.workspaceIdParam] = input.workspaceId
  if (entityParam) {
    params[entityParam] = input.entityId
  }
  if (definition.reviewQuery.requiresEntity) {
    const entityParamNames = new Set(Object.values(definition.reviewQuery.entityParams ?? {}))
    const hasEntityParam = Object.keys(params).some((key) => entityParamNames.has(key))
    if (!hasEntityParam) return null
  }
  return params
}

export function mergeProjectEntryReviewSearchParams(
  current: URLSearchParams,
  definition: ProjectEntryDefinition,
  input: ProjectEntryReviewInput,
) {
  const params = buildProjectEntryReviewParams(definition, input)
  if (!params) return null
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    next.set(key, String(value))
  }
  return next
}

export function buildProjectEntryReviewPath(
  definition: ProjectEntryDefinition,
  input: ProjectEntryReviewInput,
) {
  const params = buildProjectEntryReviewParams(definition, input)
  if (!params) return null
  return projectEntryRoutePath(definition, params)
}

export function projectEntryRoutePath(
  definition: ProjectEntryDefinition,
  params: SurfaceRouteParams = {},
) {
  return surfaceRoutePath(definition.routeKey, params)
}
