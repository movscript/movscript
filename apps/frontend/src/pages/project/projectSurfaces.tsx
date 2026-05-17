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
import { ROUTES } from '@/routes/projectRoutes'

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
    output: '可被预演和生产引用的叙事结构',
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
    output: '可进入画面编排工作台验证的创作方案',
  },
  {
    key: 'production',
    title: '内容制作',
    shortTitle: '生产',
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
    title: '画面编排工作台',
    shortTitle: '画面',
    href: ROUTES.project.contentUnitWorkbench,
    icon: Wand2,
    purpose: '围绕每个情节推敲画面表达，把设定资料和素材输入带进生成上下文。',
    decision: '手动添加画面制作项、让 AI 规划镜头、打开生成画布或查看任务记录。',
    output: '可驱动画面、视频和返工处理的创作输入。',
  },
  {
    value: 'delivery',
    title: '交付工作台',
    shortTitle: '交付',
    href: ROUTES.project.deliveryWorkbench,
    icon: ClipboardCheck,
    purpose: '围绕某个制作做轻量剪辑装配、资源锁定、导出前检查和放行。',
    decision: '素材包、轻量成片、放行、阻塞、补齐或导出检查版。',
    output: '交付包、内部评审版、正式成片和归档记录。',
  },
]

export function getWorkbenchSurface(value: WorkbenchCategory) {
  return workbenchSurfaces.find((item) => item.value === value) ?? workbenchSurfaces[0]
}

export function getProjectSurface(key: StageKey) {
  return projectSurfaces.find((item) => item.key === key) ?? projectSurfaces[0]
}
