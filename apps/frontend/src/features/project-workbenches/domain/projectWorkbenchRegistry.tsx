import type { LucideIcon } from 'lucide-react'
import {
  Clapperboard,
  ClipboardCheck,
  LayoutDashboard,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

export type ProjectWorkbenchId =
  | 'project_standards'
  | 'pre_production'
  | 'orchestration_production'
  | 'content_orchestration'
  | 'delivery'

export type ProjectWorkbenchStage =
  | 'standards'
  | 'pre_production'
  | 'orchestration_production'
  | 'content_orchestration'
  | 'delivery'

export type ProjectWorkbenchProposalKind =
  | 'project_standards_proposal'
  | 'setting_proposal'
  | 'asset_proposal'
  | 'production_proposal'
  | 'content_unit_proposal'

export interface ProjectWorkbenchReviewQuery {
  viewParam?: string
  viewValue?: string
  draftIdParam: string
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
  proposalKinds: ProjectWorkbenchProposalKind[]
  primarySelection?: {
    queryParam: string
    entityType: string
  }
  reviewQuery: ProjectWorkbenchReviewQuery
}

export const projectWorkbenchDefinitions: ProjectWorkbenchDefinition[] = [
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
    decision: '审阅并写入固定 8 项项目规范和扩展 prompt 规则。',
    output: '可被后续设定、素材、编排和生成继承的项目级规范。',
    owns: ['project.aspect_ratio', 'project.visual_style', 'project.project_style'],
    reads: ['project'],
    proposalKinds: ['project_standards_proposal'],
    primarySelection: { queryParam: 'projectId', entityType: 'project' },
    reviewQuery: {
      draftIdParam: 'draftId',
      entityParams: { project: 'projectId' },
    },
  },
  {
    id: 'pre_production',
    title: '前期准备工作台',
    shortTitle: '前期',
    route: ROUTES.project.preProduction,
    sidebarTitleKey: 'sidebar.items.preProduction',
    headerTitleKey: 'header.titles.preProduction',
    stage: 'pre_production',
    icon: Sparkles,
    purpose: '沉淀设定资料、素材需求和候选素材，补齐下游生成前的可复用上下文。',
    decision: '审阅设定和素材提案，确认缺口、归属、候选、锁定和豁免状态。',
    output: '可进入创作编排和内容编辑的设定素材包。',
    owns: ['creative_reference', 'asset_slot', 'asset_slot_candidate'],
    reads: ['project', 'script', 'production', 'scene_moment', 'content_unit', 'resource'],
    proposalKinds: ['setting_proposal', 'asset_proposal'],
    reviewQuery: {
      viewParam: 'view',
      viewValue: 'review',
      draftIdParam: 'draftId',
      entityParams: {
        creative_reference: 'reference_id',
        asset_slot: 'asset_slot_id',
      },
    },
  },
  {
    id: 'orchestration_production',
    title: '创作编排工作台',
    shortTitle: '创作',
    route: ROUTES.project.productionOrchestration,
    sidebarTitleKey: 'sidebar.items.productionOrchestration',
    headerTitleKey: 'header.titles.productionOrchestration',
    stage: 'orchestration_production',
    icon: Clapperboard,
    purpose: '把剧本、设定、素材约束组织成 production 级创作蓝图，并继续拆解镜头方案、时间轴和镜头列表。',
    decision: '审阅 production proposal 和 content unit proposal，确认 segments、scene moments、引用关系和镜头方案。',
    output: '可进入内容编辑细化执行的创作方案。',
    owns: ['production', 'segment', 'scene_moment', 'creative_reference_usage', 'asset_slot_usage', 'production_local_requirement', 'content_unit', 'keyframe', 'preview_timeline_item'],
    reads: ['project_standards', 'creative_reference', 'asset_slot', 'script'],
    proposalKinds: ['production_proposal', 'content_unit_proposal'],
    primarySelection: { queryParam: 'productionId', entityType: 'production' },
    reviewQuery: {
      viewParam: 'view',
      viewValue: 'review',
      draftIdParam: 'draftId',
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
    title: '内容编排工作台',
    shortTitle: '编排',
    route: ROUTES.project.contentUnitWorkbench,
    sidebarTitleKey: 'sidebar.items.workbenchContentGeneration',
    headerTitleKey: 'header.titles.workbenchContentGeneration',
    stage: 'content_orchestration',
    icon: Wand2,
    purpose: '围绕每个情节拆解制作项，把设定、素材输入和画面锚点带进生成上下文。',
    decision: '审阅内容单元草案，补齐关键帧、素材缺口和生成上下文。',
    output: '可驱动画面、视频和返工处理的创作输入。',
    owns: ['content_unit', 'keyframe', 'preview_timeline_item', 'generation_context'],
    reads: ['production', 'segment', 'scene_moment', 'creative_reference', 'asset_slot', 'resource', 'job'],
    proposalKinds: [],
    primarySelection: { queryParam: 'scene_moment_id', entityType: 'scene_moment' },
    reviewQuery: {
      viewParam: 'view',
      viewValue: 'review',
      draftIdParam: 'draftId',
      entityParams: {
        production: 'productionId',
        scene_moment: 'scene_moment_id',
        content_unit: 'content_unit_id',
      },
    },
  },
  {
    id: 'delivery',
    title: '交付工作台',
    shortTitle: '交付',
    route: ROUTES.project.deliveryWorkbench,
    sidebarTitleKey: 'sidebar.items.workbenchDelivery',
    headerTitleKey: 'header.titles.deliveryWorkbench',
    stage: 'delivery',
    icon: ClipboardCheck,
    purpose: '围绕制作总览交付版本、成片时间线、资源覆盖和导出记录。',
    decision: '检查覆盖、预览片段、微调顺序和时长、替换采用资源、标记阻塞或导出检查版。',
    output: '交付包、内部评审版、正式成片和归档记录。',
    owns: ['delivery_version', 'delivery_timeline_item', 'export_record'],
    reads: ['production', 'preview_timeline', 'content_unit', 'resource'],
    proposalKinds: [],
    primarySelection: { queryParam: 'productionId', entityType: 'production' },
    reviewQuery: {
      draftIdParam: 'draftId',
      entityParams: {
        production: 'productionId',
        delivery_version: 'deliveryVersionId',
      },
    },
  },
]

export function getProjectWorkbenchDefinition(id: ProjectWorkbenchId) {
  return projectWorkbenchDefinitions.find((item) => item.id === id) ?? projectWorkbenchDefinitions[0]
}

export function getProjectWorkbenchDefinitionForProposalKind(kind: string) {
  return projectWorkbenchDefinitions.find((item) => item.proposalKinds.includes(kind as ProjectWorkbenchProposalKind)) ?? null
}

export interface ProjectWorkbenchReviewInput {
  draftId: string
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
  if (!definition.reviewQuery.viewParam && entityParam) {
    params[entityParam] = input.entityId
  }
  if (definition.reviewQuery.viewParam && definition.reviewQuery.viewValue) {
    params[definition.reviewQuery.viewParam] = definition.reviewQuery.viewValue
  }
  params[definition.reviewQuery.draftIdParam] = input.draftId
  if (definition.reviewQuery.viewParam && entityParam) {
    if (entityParam) params[entityParam] = input.entityId
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
