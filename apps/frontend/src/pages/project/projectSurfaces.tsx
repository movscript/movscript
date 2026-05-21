import type { LucideIcon } from 'lucide-react'
import {
  Clapperboard,
  ClipboardCheck,
  FileText,
  GitBranch,
  LayoutDashboard,
  PackageCheck,
  Sparkles,
  Video,
  Wand2,
} from 'lucide-react'
import { LEGACY_ROUTES, ROUTES, withRouteParams } from '@/routes/projectRoutes'

export type StageKey =
  | 'overview'
  | 'script'
  | 'creative'
  | 'relations'
  | 'assets'
  | 'plan'
  | 'production'
  | 'delivery'

export type WorkbenchCategory =
  | 'script'
  | 'creative'
  | 'assets'
  | 'production'
  | 'delivery'
  | 'reference-relations'

export type ProjectWorkbenchId =
  | 'project_standards'
  | 'pre_production'
  | 'creative_plan'
  | 'content_orchestration'
  | 'delivery'

export type ProjectWorkbenchStage =
  | 'standards'
  | 'pre_production'
  | 'creative_plan'
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
  legacyRoutes: string[]
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

export interface ProjectSurfaceItem {
  key: StageKey
  title: string
  shortTitle: string
  href: string
  icon: LucideIcon
  purpose: string
  owns: string
  output: string
}

export interface WorkbenchSurfaceItem {
  value: WorkbenchCategory
  title: string
  shortTitle: string
  href: string
  icon: LucideIcon
  purpose: string
  decision: string
  output: string
}

export const projectWorkbenchDefinitions: ProjectWorkbenchDefinition[] = [
  {
    id: 'project_standards',
    title: '项目规范工作台',
    shortTitle: '规范',
    route: ROUTES.project.standards,
    legacyRoutes: [LEGACY_ROUTES.projectWorkspace],
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
    legacyRoutes: [
      LEGACY_ROUTES.preProduction,
      LEGACY_ROUTES.creativeReferences,
      LEGACY_ROUTES.assetSlots,
      LEGACY_ROUTES.creativeWorkbench,
      LEGACY_ROUTES.workbenchCreative,
      LEGACY_ROUTES.workbenchAssets,
    ],
    sidebarTitleKey: 'sidebar.items.preProduction',
    headerTitleKey: 'header.titles.preProduction',
    stage: 'pre_production',
    icon: Sparkles,
    purpose: '沉淀设定资料、素材需求和候选素材，补齐下游生成前的可复用上下文。',
    decision: '审阅设定和素材提案，确认缺口、归属、候选、锁定和豁免状态。',
    output: '可进入创作编排和内容编排的设定素材包。',
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
    id: 'creative_plan',
    title: '创作编排工作台',
    shortTitle: '创作',
    route: ROUTES.project.productionOrchestration,
    legacyRoutes: [LEGACY_ROUTES.productionOrchestration],
    sidebarTitleKey: 'sidebar.items.productionOrchestration',
    headerTitleKey: 'header.titles.productionOrchestration',
    stage: 'creative_plan',
    icon: Clapperboard,
    purpose: '把剧本、设定、素材约束组织成 production 级创作蓝图。',
    decision: '审阅 production proposal，确认 segments、scene moments 和引用关系。',
    output: '可进入内容编排工作台验证和拆解的创作方案。',
    owns: ['production', 'segment', 'scene_moment', 'creative_reference_usage', 'asset_slot_usage', 'production_local_requirement'],
    reads: ['project_standards', 'creative_reference', 'asset_slot', 'script'],
    proposalKinds: ['production_proposal'],
    primarySelection: { queryParam: 'productionId', entityType: 'production' },
    reviewQuery: {
      draftIdParam: 'draftId',
      entityParams: { production: 'productionId' },
      requiresEntity: true,
    },
  },
  {
    id: 'content_orchestration',
    title: '内容编排工作台',
    shortTitle: '编排',
    route: ROUTES.project.contentUnitWorkbench,
    legacyRoutes: [LEGACY_ROUTES.contentUnitOrchestrate, LEGACY_ROUTES.workbenchProduction],
    sidebarTitleKey: 'sidebar.items.workbenchContentGeneration',
    headerTitleKey: 'header.titles.workbenchContentGeneration',
    stage: 'content_orchestration',
    icon: Wand2,
    purpose: '围绕每个情节拆解制作项，把设定、素材输入和画面锚点带进生成上下文。',
    decision: '审阅内容单元草案，补齐关键帧、素材缺口和生成上下文。',
    output: '可驱动画面、视频和返工处理的创作输入。',
    owns: ['content_unit', 'keyframe', 'preview_timeline_item', 'generation_context'],
    reads: ['production', 'segment', 'scene_moment', 'creative_reference', 'asset_slot', 'resource', 'job'],
    proposalKinds: ['content_unit_proposal'],
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
    legacyRoutes: [
      LEGACY_ROUTES.deliveryWorkbench,
      LEGACY_ROUTES.deliveryWorkbenchFlat,
      LEGACY_ROUTES.workbenchDelivery,
    ],
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

export const projectSurfaces: ProjectSurfaceItem[] = [
  {
    key: 'overview',
    title: '项目总览',
    shortTitle: '总览',
    href: ROUTES.project.overview,
    icon: LayoutDashboard,
    purpose: '看清项目当前处在哪个阶段、哪里阻塞、下一步该进入哪个工作台。',
    owns: '项目状态、阶段进度、关键缺口、快速入口',
    output: '明确下一步推进方向',
  },
  {
    key: 'script',
    title: '剧本与情景',
    shortTitle: '剧本',
    href: ROUTES.project.scripts,
    icon: FileText,
    purpose: '管理原始剧本、结构化剧本、场景和情景对象。',
    owns: '剧本文本、剧本版本、场景/情景库',
    output: '可被内容编排和生产引用的叙事结构',
  },
  {
    key: 'creative',
    title: '前期准备',
    shortTitle: '前期',
    href: ROUTES.project.preProduction,
    icon: Sparkles,
    purpose: '沉淀设定资料，并把人物、地点、道具、风格对应的素材围绕在同一个上下文里。',
    owns: '设定资料卡、素材需求、候选素材、锁定版本',
    output: '可复用的设定素材包',
  },
  {
    key: 'relations',
    title: '关系网络',
    shortTitle: '关系',
    href: ROUTES.project.referenceRelations,
    icon: GitBranch,
    purpose: '解释设定资料之间的关系和冲突，避免素材需求、分镜、视频各做各的。',
    owns: '人物关系、道具作用、场景关联、影响路径',
    output: '下游生成可遵循的关系约束',
  },
  {
    key: 'assets',
    title: '前期素材',
    shortTitle: '素材',
    href: ROUTES.project.preProduction,
    icon: PackageCheck,
    purpose: '管理素材需求、参考图、候选图和最终锁定素材。',
    owns: '素材需求缺口、候选素材、锁定版本、资源引用',
    output: '可进入画面锚点和视频生产的素材包',
  },
  {
    key: 'plan',
    title: '创作编排',
    shortTitle: '创作',
    href: ROUTES.project.productionOrchestration,
    icon: Clapperboard,
    purpose: '把作品想表达的情绪、关系和关键画面组织成可以继续推演的创作蓝图。',
    owns: '作品意图、情绪推进、情节节点、设定资料引用、素材需求缺口、画面线索',
    output: '可进入内容编排工作台验证的创作方案',
  },
  {
    key: 'production',
    title: '制作执行',
    shortTitle: '执行',
    href: ROUTES.project.production,
    icon: Wand2,
    purpose: '组织镜头关键帧、视频候选、返工意见和采用决策。',
    owns: '生成任务、候选版本、采用记录、返工要求',
    output: '可进入交付检查的正式片段',
  },
  {
    key: 'delivery',
    title: '成片与交付',
    shortTitle: '交付',
    href: ROUTES.project.delivery,
    icon: Video,
    purpose: '管理交付版本、素材包、轻量成片、导出物和最终归档。',
    owns: '交付版本、素材包、成片导出、检查项、交付状态',
    output: '可交付或可归档的交付包',
  },
]

export const workbenchSurfaces: WorkbenchSurfaceItem[] = [
  {
    value: 'creative',
    title: '前期准备',
    shortTitle: '前期',
    href: ROUTES.project.preProduction,
    icon: Sparkles,
    purpose: '围绕被剧本和制作使用到的设定推进完整度，补齐缺口并确认可用状态。',
    decision: '检查上下文、补充设定、标记缺口、确认状态和锁定范围。',
    output: '可直接进入分镜、素材和生成的稳定设定包。',
  },
  {
    value: 'assets',
    title: '素材候选',
    shortTitle: '素材',
    href: ROUTES.project.preProduction,
    icon: PackageCheck,
    purpose: '统一维护素材需求、候选素材、上传、生成、挑选和锁定。',
    decision: '审阅素材需求提案，选择参考，上传或生成候选，采用素材或继续返工。',
    output: '可用于画面锚点和视频生产的素材版本。',
  },
  {
    value: 'reference-relations',
    title: '关系校正工作台',
    shortTitle: '关系',
    href: ROUTES.project.referenceRelationsWorkbench,
    icon: GitBranch,
    purpose: '修正资料间关系，保证下游解释一致。',
    decision: '确认关系类型、作用范围和证据来源。',
    output: '可被提示词、分镜和审核引用的关系图。',
  },
  {
    value: 'production',
    title: '内容编排工作台',
    shortTitle: '编排',
    href: ROUTES.project.contentUnitWorkbench,
    icon: Wand2,
    purpose: '围绕每个情节拆解制作项，把设定资料、素材输入和画面锚点带进生成上下文。',
    decision: '手动添加制作项、让 AI 规划镜头、打开生成画布或查看任务记录。',
    output: '可驱动画面、视频和返工处理的创作输入。',
  },
  {
    value: 'delivery',
    title: '交付工作台',
    shortTitle: '交付',
    href: ROUTES.project.deliveryWorkbench,
    icon: ClipboardCheck,
    purpose: '围绕某个制作总览交付版本、成片时间线、预览资源、轻量剪辑微调和导出前门禁。',
    decision: '检查覆盖、预览片段、微调顺序和时长、替换采用资源、标记阻塞或导出检查版。',
    output: '交付包、内部评审版、正式成片和归档记录。',
  },
]

export function getWorkbenchSurface(value: WorkbenchCategory) {
  return workbenchSurfaces.find((item) => item.value === value) ?? workbenchSurfaces[0]
}

export function getProjectSurface(key: StageKey) {
  return projectSurfaces.find((item) => item.key === key) ?? projectSurfaces[0]
}

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
