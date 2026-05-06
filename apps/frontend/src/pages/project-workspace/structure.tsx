import type { LucideIcon } from 'lucide-react'
import {
  BookOpenCheck,
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
  | 'preview'
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
    href: '/project-home',
    icon: LayoutDashboard,
    purpose: '看清项目当前处在哪个阶段、哪里阻塞、下一步该进入哪个工作台。',
    owns: '项目状态、阶段进度、关键缺口、快速入口',
    output: '明确下一步推进方向',
  },
  {
    key: 'script',
    title: '剧本与情景',
    shortTitle: '剧本',
    href: '/scripts',
    icon: FileText,
    purpose: '管理原始剧本、结构化剧本、场景和情景对象。',
    owns: '剧本文本、剧本版本、场景/情景库',
    output: '可被预演和生产引用的叙事结构',
  },
  {
    key: 'creative',
    title: '设定资料',
    shortTitle: '资料',
    href: '/creative-references',
    icon: Sparkles,
    purpose: '沉淀人物、地点、道具、风格等会影响下游一致性的资料。',
    owns: '资料卡、资料状态、资料说明',
    output: '可复用的创作约束',
  },
  {
    key: 'relations',
    title: '关系网络',
    shortTitle: '关系',
    href: '/reference-relations',
    icon: GitBranch,
    purpose: '解释资料之间的关系和冲突，避免素材、分镜、视频各做各的。',
    owns: '人物关系、道具作用、场景关联、影响路径',
    output: '下游生成可遵循的关系约束',
  },
  {
    key: 'assets',
    title: '素材准备',
    shortTitle: '素材',
    href: '/asset-slots',
    icon: PackageCheck,
    purpose: '管理素材需求、参考图、候选图和最终锁定素材。',
    owns: '素材缺口、素材候选、锁定版本、资源引用',
    output: '可进入关键帧和视频生产的素材包',
  },
  {
    key: 'plan',
    title: '预演与制作方案',
    shortTitle: '预演',
    href: '/segments',
    icon: Clapperboard,
    purpose: '在片段、情景或制作项页面触发预演面板，检查关键帧与素材状态。',
    owns: '关键帧、素材需求状态、预演上下文',
    output: '可执行的生产方案',
  },
  {
    key: 'production',
    title: '内容生产',
    shortTitle: '生产',
    href: '/production',
    icon: Wand2,
    purpose: '组织关键帧、视频候选、返工意见和采用决策。',
    owns: '生成任务、候选版本、采用记录、返工要求',
    output: '可进入交付检查的正式片段',
  },
  {
    key: 'delivery',
    title: '成片与交付',
    shortTitle: '交付',
    href: '/final-videos',
    icon: Video,
    purpose: '管理成片版本、导出物、交付检查和最终归档。',
    owns: '成片库、导出版本、检查项、交付状态',
    output: '可交付或可归档的最终版本',
  },
]

export const workbenchSurfaces: WorkbenchSurfaceItem[] = [
  {
    value: 'script',
    title: '理解确认工作台',
    shortTitle: '理解',
    href: '/workbench/script',
    icon: BookOpenCheck,
    purpose: '只处理 AI 对剧本的理解是否成立。',
    decision: '确认、拆分、合并或忽略剧本结构候选。',
    output: '稳定的情景、人物、地点、道具和叙事证据。',
  },
  {
    value: 'preview',
    title: '项目预演工作台',
    shortTitle: '预演',
    href: '/workbench/production-plan',
    icon: Clapperboard,
    purpose: '把制作编排变成可检查、可播放、可确认的项目预演。',
    decision: '补齐关键帧和素材缺口，确认时间线是否可继续用于内容制作。',
    output: '项目预演、关键帧候选和生产缺口清单。',
  },
  {
    value: 'creative',
    title: '资料确认工作台',
    shortTitle: '资料',
    href: '/workbench/creative',
    icon: Sparkles,
    purpose: '把候选资料变成可复用的创作约束。',
    decision: '确认资料状态、补说明、标记缺口和影响范围。',
    output: '人物、地点、道具、风格的锁定说明。',
  },
  {
    value: 'assets',
    title: '素材生成工作台',
    shortTitle: '素材',
    href: '/workbench/assets',
    icon: PackageCheck,
    purpose: '围绕素材缺口生成、挑选和锁定素材。',
    decision: '选择参考、生成候选、采用素材或继续返工。',
    output: '可用于关键帧和视频生产的素材版本。',
  },
  {
    value: 'reference-relations',
    title: '关系校正工作台',
    shortTitle: '关系',
    href: '/workbench/reference-relations',
    icon: GitBranch,
    purpose: '修正资料间关系，保证下游解释一致。',
    decision: '确认关系类型、作用范围和证据来源。',
    output: '可被提示词、分镜和审核引用的关系图。',
  },
  {
    value: 'production',
    title: '生产决策工作台',
    shortTitle: '生产',
    href: '/workbench/production',
    icon: Wand2,
    purpose: '聚焦候选视频、返工和采用决策。',
    decision: '采用版本、请求返工、重新生成或创建人工任务。',
    output: '进入交付检查的正式片段。',
  },
  {
    value: 'delivery',
    title: '交付门禁工作台',
    shortTitle: '交付',
    href: '/workbench/delivery',
    icon: ClipboardCheck,
    purpose: '导出前检查完整性、声音、字幕和版权。',
    decision: '放行、阻塞、补齐或导出检查版。',
    output: '交付版、内部评审版和归档记录。',
  },
]

export function getWorkbenchSurface(value: WorkbenchCategory) {
  return workbenchSurfaces.find((item) => item.value === value) ?? workbenchSurfaces[0]
}

export function getProjectSurface(key: StageKey) {
  return projectSurfaces.find((item) => item.key === key) ?? projectSurfaces[0]
}
