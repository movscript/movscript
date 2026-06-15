import type { LucideIcon } from 'lucide-react'
import {
  Clapperboard,
  LayoutDashboard,
  Wand2,
} from 'lucide-react'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

export type ProjectWorkbenchId =
  | 'orchestration_production'
  | 'content_orchestration'
  | 'project_standards'

export type ProjectWorkbenchStage =
  | 'orchestration_production'
  | 'content_orchestration'
  | 'standards'

export type ProjectWorkbenchWorkspaceKind =
  | 'setting_workspace'
  | 'asset_workspace'
  | 'content_unit_workspace'

export interface ProjectWorkbenchReviewQuery {
  viewParam?: string
  viewValue?: string
  workspaceIdParam: string
  entityParams?: Record<string, string>
  requiresEntity?: boolean
}

export interface ProjectWorkbenchDefinition {
  id: ProjectWorkbenchId
  title: string
  shortTitle: string
  route: string
  sidebarTitleKey: string
  headerTitleKey: string
  stage: ProjectWorkbenchStage
  icon: LucideIcon
  purpose: string
  decision: string
  output: string
  owns: string[]
  reads: string[]
  workspaceKinds: ProjectWorkbenchWorkspaceKind[]
  primarySelection?: {
    queryParam: string
    entityType: string
  }
  reviewQuery: ProjectWorkbenchReviewQuery
}

export const projectWorkbenchDefinitions: ProjectWorkbenchDefinition[] = [
  {
    id: 'orchestration_production',
    title: '剧本工作台',
    shortTitle: '剧本',
    route: ROUTES.project.scripts,
    sidebarTitleKey: 'sidebar.items.productionOrchestration',
    headerTitleKey: 'header.titles.productionOrchestration',
    stage: 'orchestration_production',
    icon: Clapperboard,
    purpose: '把剧本、设定、素材约束组织成 production 级结构化蓝图，并继续沉淀镜头方案、时间轴和镜头列表。',
    decision: '手动维护 segments、scene moments、引用关系和镜头方案。',
    output: '可进入内容编辑细化执行的创作方案。',
    owns: ['production', 'segment', 'scene_moment', 'setting_usage', 'asset_slot_usage', 'production_local_requirement', 'content_unit', 'keyframe', 'preview_timeline_item'],
    reads: ['project_standards', 'setting', 'asset_slot', 'script'],
    workspaceKinds: [],
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
    id: 'content_orchestration',
    title: '新版编排画布',
    shortTitle: '编排',
    route: ROUTES.project.contentCanvas,
    sidebarTitleKey: 'sidebar.items.workbenchContentGeneration',
    headerTitleKey: 'header.titles.workbenchContentGeneration',
    stage: 'content_orchestration',
    icon: Wand2,
    purpose: '围绕每个情节拆解制作项，把设定、素材输入和画面锚点带进生成上下文。',
    decision: '审阅内容单元草案，补齐关键帧、素材缺口和生成上下文。',
    output: '可驱动画面、视频和返工处理的创作输入。',
    owns: ['content_unit', 'keyframe', 'preview_timeline_item', 'generation_context'],
    reads: ['production', 'segment', 'scene_moment', 'setting', 'asset_slot', 'resource', 'job'],
    workspaceKinds: ['content_unit_workspace'],
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
    title: '项目规范工作台',
    shortTitle: '规范',
    route: ROUTES.project.standards,
    sidebarTitleKey: 'sidebar.items.projectWorkspace',
    headerTitleKey: 'header.titles.projectWorkspace',
    stage: 'standards',
    icon: LayoutDashboard,
    purpose: '统一项目级画幅、镜头语言、视觉风格、节奏和禁用规则。',
    decision: '手动维护固定 8 项项目规范和扩展 prompt 规则。',
    output: '可被后续设定、素材、编排和生成继承的项目级规范。',
    owns: ['project.aspect_ratio', 'project.visual_style', 'project.project_style'],
    reads: ['project'],
    workspaceKinds: [],
    primarySelection: { queryParam: 'projectId', entityType: 'project' },
    reviewQuery: {
      workspaceIdParam: 'workspaceId',
      entityParams: { project: 'projectId' },
    },
  },
]

export function getProjectWorkbenchDefinition(id: ProjectWorkbenchId) {
  return projectWorkbenchDefinitions.find((item) => item.id === id) ?? projectWorkbenchDefinitions[0]
}

export function getProjectWorkbenchDefinitionForWorkspaceKind(kind: string) {
  return projectWorkbenchDefinitions.find((item) => item.workspaceKinds.includes(kind as ProjectWorkbenchWorkspaceKind)) ?? null
}

export interface ProjectWorkbenchReviewInput {
  workspaceId: string
  entityType?: string
  entityId?: string | number
}

export function buildProjectWorkbenchReviewParams(
  definition: ProjectWorkbenchDefinition,
  input: ProjectWorkbenchReviewInput,
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

export function mergeProjectWorkbenchReviewSearchParams(
  current: URLSearchParams,
  definition: ProjectWorkbenchDefinition,
  input: ProjectWorkbenchReviewInput,
) {
  const params = buildProjectWorkbenchReviewParams(definition, input)
  if (!params) return null
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    next.set(key, String(value))
  }
  return next
}

export function buildProjectWorkbenchReviewPath(
  definition: ProjectWorkbenchDefinition,
  input: ProjectWorkbenchReviewInput,
) {
  const params = buildProjectWorkbenchReviewParams(definition, input)
  if (!params) return null
  return withRouteParams(definition.route, params)
}
