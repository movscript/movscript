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
    owns: '设定资料卡、设定资料状态、设定资料说明',
    output: '可复用的创作约束',
  },
  {
    key: 'relations',
    title: '关系网络',
    shortTitle: '关系',
    href: '/reference-relations',
    icon: GitBranch,
    purpose: '解释设定资料之间的关系和冲突，避免素材需求、分镜、视频各做各的。',
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
    owns: '素材需求缺口、候选素材、锁定版本、资源引用',
    output: '可进入关键帧和视频生产的素材包',
  },
  {
    key: 'plan',
    title: '制作编排',
    shortTitle: '编排',
    href: '/production-orchestrate',
    icon: Clapperboard,
    purpose: '把编排段、情景、设定资料、素材需求缺口和制作项组织到具体制作下，形成可预演的结构。',
    owns: '制作结构、段落顺序、情景节点、设定资料引用、素材需求缺口、制作项骨架',
    output: '可进入制作预演验证的编排方案',
  },
  {
    key: 'production',
    title: '内容制作',
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
    href: '/delivery',
    icon: Video,
    purpose: '管理交付版本、素材包、轻量成片、导出物和最终归档。',
    owns: '交付版本、素材包、成片导出、检查项、交付状态',
    output: '可交付或可归档的交付包',
  },
]

export const workbenchSurfaces: WorkbenchSurfaceItem[] = [
  {
    value: 'script',
    title: '剧本拆分',
    shortTitle: '拆分',
    href: '/workbench/script',
    icon: BookOpenCheck,
    purpose: '把总稿拆成可独立使用的制作剧本。',
    decision: '识别制作边界、调整标题、合并或忽略片段。',
    output: '多份可直接创建和复用的制作脚本。',
  },
  {
    value: 'preview',
    title: '制作预演',
    shortTitle: '预演',
    href: '/workbench/production-plan',
    icon: Clapperboard,
    purpose: '只看当前制作有没有预演候选，以及这些候选是否已经被处理。',
    decision: '有候选就审阅、采用、忽略或重新生成；没有候选就先生成候选。',
    output: '制作预演候选状态、候选清单和处理记录。',
  },
  {
    value: 'creative',
    title: '资料确认工作台',
    shortTitle: '资料',
    href: '/workbench/creative',
    icon: Sparkles,
    purpose: '把候选资料变成可复用的创作约束。',
    decision: '确认设定资料状态、补说明、标记缺口和影响范围。',
    output: '人物、地点、道具、风格的锁定说明。',
  },
  {
    value: 'assets',
    title: '素材生成工作台',
    shortTitle: '素材',
    href: '/workbench/assets',
    icon: PackageCheck,
    purpose: '围绕素材需求缺口生成、挑选和锁定素材。',
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
    title: '交付工作台',
    shortTitle: '交付',
    href: '/delivery/workbench',
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
