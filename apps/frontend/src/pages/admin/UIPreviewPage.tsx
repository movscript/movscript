import { useState } from 'react'
import type { ElementType, ReactNode } from 'react'
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, Clapperboard, Clock, CopyPlus, Database, FileText, Film, GitBranch, ImagePlus, Inbox, Layers, ListChecks, MapPin, Play, Plus, Puzzle, RefreshCw, Send, ShieldCheck, Sparkles, Users, Video, Wrench } from 'lucide-react'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { CanvasCandidateGroupCard, type CanvasCandidateGroupCardProps } from '@/components/canvas/CanvasCandidateGroupCard'
import { CanvasEntityActionCard, type CanvasEntityActionCardProps } from '@/components/canvas/CanvasEntityActionCard'
import { CanvasSettingStateCard, type CanvasSettingStateCardProps } from '@/components/canvas/CanvasSettingStateCard'
import { CanvasToolActionCard, type CanvasToolActionCardProps } from '@/components/canvas/CanvasToolActionCard'

type EntityPreviewItem = {
  id: string
  type: 'entity'
  name: string
  description: string
  props: CanvasEntityActionCardProps
}

type ToolPreviewItem = {
  id: string
  type: 'tool'
  name: string
  description: string
  props: CanvasToolActionCardProps
}

type StatePreviewItem = {
  id: string
  type: 'state'
  name: string
  description: string
  props: CanvasSettingStateCardProps
}

type CandidatePreviewItem = {
  id: string
  type: 'candidate'
  name: string
  description: string
  props: CanvasCandidateGroupCardProps
}

type AgentPreviewItem = {
  id: string
  type: 'agent'
  name: string
  description: string
}

type ScriptStructurePreviewItem = {
  id: string
  type: 'script-structure'
  name: string
  description: string
}

type StructuredScriptItem = {
  id: string
  type: 'structured-script'
  name: string
  description: string
  scriptKind: 'main' | 'scene'
}

type PreviewItem = EntityPreviewItem | StatePreviewItem | CandidatePreviewItem | ToolPreviewItem | ScriptStructurePreviewItem | StructuredScriptItem | AgentPreviewItem

const ENTITY_PREVIEWS: EntityPreviewItem[] = [
  {
    id: 'setting-character',
    type: 'entity',
    name: '人物设定',
    description: '角色或道具设定在画布中的基础卡片，突出参考图绑定和实体关系。',
    props: {
      kind: 'setting',
      title: '林夏',
      subtitle: '角色设定 · 主角 · 已进入视觉开发',
      status: '进行中',
      selected: true,
      bindings: [
        { id: 'portrait', label: '形象', kind: 'image', state: 'bound', resourceLabel: '主视觉 v2' },
        { id: 'reference', label: '参考', kind: 'image', state: 'bound', resourceLabel: '3 张' },
        { id: 'result', label: '输出', kind: 'resource', state: 'empty' },
      ],
      relations: [
        { id: 'r1', label: '搭档', targetLabel: '顾言' },
        { id: 'r2', label: '出现于', targetLabel: '雨夜巷口' },
      ],
      createActions: [
        { id: 'asset', label: '素材', icon: CopyPlus },
        { id: 'shot', label: '镜头', icon: Camera },
      ],
      footer: <CardHint tone="green" text="默认只显示创作动作，高级字段放到右侧面板。" />,
    },
  },
  {
    id: 'setting-assets-graph',
    type: 'entity',
    name: '设定牵引素材',
    description: '用画布连线表达设定与素材之间的引用、归属和绑定关系。',
    props: {
      kind: 'setting',
      title: '林夏',
      subtitle: '角色设定 · 视觉母体',
      status: '关系视图',
      selected: true,
      bindings: [
        { id: 'portrait', label: '形象', kind: 'image', state: 'bound', resourceLabel: '主视觉' },
        { id: 'reference', label: '参考', kind: 'image', state: 'bound', resourceLabel: '5 张' },
        { id: 'result', label: '输出', kind: 'resource', state: 'empty' },
      ],
      relations: [
        { id: 'r1', label: '牵引', targetLabel: '素材组' },
        { id: 'r2', label: '约束', targetLabel: '镜头生成' },
      ],
      createActions: [
        { id: 'asset', label: '素材', icon: CopyPlus },
        { id: 'variant', label: '变体', icon: Sparkles },
      ],
      footer: <CardHint tone="green" text="这类连线表示实体引用关系，不直接触发生成执行。" />,
    },
  },
  {
    id: 'storyboard',
    type: 'entity',
    name: '分镜',
    description: '分镜卡片重点呈现生成图、原始参考和下游镜头创建。',
    props: {
      kind: 'storyboard',
      title: '雨夜巷口对峙',
      subtitle: '第 2 集 / 第 8 场 · 6 秒',
      status: '待生成',
      bindings: [
        { id: 'image', label: '画面', kind: 'image', state: 'pending', resourceLabel: '生成中' },
        { id: 'raw_source', label: '原片', kind: 'video', state: 'empty' },
        { id: 'reference', label: '参考', kind: 'image', state: 'bound', resourceLabel: '角色+场景' },
      ],
      relations: [
        { id: 'r1', label: '来自', targetLabel: '雨夜巷口' },
      ],
      createActions: [
        { id: 'shot', label: '镜头', icon: Camera },
        { id: 'variant', label: '变体', icon: Sparkles },
      ],
    },
  },
  {
    id: 'scene',
    type: 'entity',
    name: '分场',
    description: '分场更多承担上下文容器，卡片应该帮助快速创建分镜和关联设定。',
    props: {
      kind: 'scene',
      title: '08 雨夜巷口',
      subtitle: '外景 · 夜 · 情绪冲突',
      status: '草稿',
      bindings: [
        { id: 'reference', label: '参考', kind: 'image', state: 'bound', resourceLabel: '环境参考' },
        { id: 'result', label: '输出', kind: 'resource', state: 'empty' },
        { id: 'attachment', label: '附件', kind: 'resource', state: 'empty' },
      ],
      relations: [
        { id: 'r1', label: '包含', targetLabel: '林夏' },
        { id: 'r2', label: '包含', targetLabel: '顾言' },
      ],
      createActions: [
        { id: 'storyboard', label: '分镜', icon: Layers },
        { id: 'shot', label: '镜头', icon: Camera },
      ],
    },
  },
  {
    id: 'shot',
    type: 'entity',
    name: '镜头',
    description: '镜头卡片强调最终视频绑定和上游分镜关系。',
    props: {
      kind: 'shot',
      title: 'S08-04 推近特写',
      subtitle: '由分镜生成 · 5 秒 · 竖屏',
      status: '已选片',
      bindings: [
        { id: 'video', label: '成片', kind: 'video', state: 'bound', resourceLabel: 'shot_v3.mp4' },
        { id: 'raw_source', label: '源视频', kind: 'video', state: 'bound', resourceLabel: '动作参考' },
        { id: 'reference', label: '参考', kind: 'image', state: 'empty' },
      ],
      relations: [
        { id: 'r1', label: '来自', targetLabel: '雨夜巷口对峙', direction: 'incoming' },
      ],
      createActions: [
        { id: 'final-video', label: '成片', icon: Film },
        { id: 'variant', label: '重做', icon: Sparkles },
      ],
    },
  },
]

const TOOL_PREVIEWS: ToolPreviewItem[] = [
  {
    id: 'ai-image-tool',
    type: 'tool',
    name: 'AI 图像生成',
    description: 'AI 生成工具卡片把提示词、参考资源、模型参数和生成结果收拢到一个运行单元。',
    props: {
      source: 'ai',
      tone: 'violet',
      icon: Sparkles,
      title: '参考图生成',
      subtitle: 'canvas_image · Seedream 4.0 · 输出 image',
      status: '可运行',
      selected: true,
      inputs: [
        { id: 'prompt', label: '提示词', type: 'prompt', state: 'ready', summary: '雨夜巷口' },
        { id: 'character', label: '角色参考', type: 'image', state: 'ready', summary: '林夏' },
        { id: 'scene', label: '场景实体', type: 'entity', state: 'ready', summary: '08 巷口' },
      ],
      configs: [
        { id: 'model', label: '模型', value: 'Seedream' },
        { id: 'ratio', label: '比例', value: '9:16' },
        { id: 'quality', label: '质量', value: '标准' },
      ],
      outputs: [
        { id: 'image', label: '图像', type: 'image', state: 'pending', summary: '生成中' },
        { id: 'metadata', label: '参数', type: 'json', state: 'ready', summary: '可追溯' },
      ],
      primaryAction: { id: 'run', label: '运行', icon: Play },
      secondaryAction: { id: 'variant', label: '变体', icon: ImagePlus },
      footer: <CardHint tone="green" text="工具卡片只暴露运行所需契约，完整参数仍由右侧面板承载。" />,
    },
  },
  {
    id: 'plugin-tool',
    type: 'tool',
    name: '插件工具',
    description: '插件工具与 AI 生成使用同一张工具卡片，只通过来源标识、输入输出类型和配置项区分。',
    props: {
      source: 'plugin',
      tone: 'cyan',
      icon: Puzzle,
      title: '分场摘要插件',
      subtitle: 'scene-summary · v1.2.0 · 输出 text/json',
      status: '已启用',
      inputs: [
        { id: 'scene', label: '分场', type: 'entity', state: 'ready', summary: '08 巷口' },
        { id: 'storyboards', label: '分镜列表', type: 'json', state: 'ready', summary: '6 条' },
        { id: 'style', label: '风格约束', type: 'text', state: 'empty', summary: '可选' },
      ],
      configs: [
        { id: 'runtime', label: '运行时', value: 'HTTP' },
        { id: 'scope', label: '权限', value: '只读' },
        { id: 'timeout', label: '超时', value: '30s' },
      ],
      outputs: [
        { id: 'summary', label: '摘要', type: 'text', state: 'ready', summary: '已生成' },
        { id: 'tags', label: '标签', type: 'json', state: 'ready', summary: '12 项' },
      ],
      primaryAction: { id: 'run', label: '运行', icon: Play },
      secondaryAction: { id: 'config', label: '配置', icon: Wrench },
    },
  },
]

const STATE_PREVIEWS: StatePreviewItem[] = [
  {
    id: 'setting-state-rain-night',
    type: 'state',
    name: '状态表现卡',
    description: '设定在特定场景或镜头中的状态表现，会影响素材牵引、提示词上下文和生成体验。',
    props: {
      title: '林夏 · 雨夜受伤状态',
      baseSetting: '基础设定：林夏',
      scope: 'EP02 / Scene 08 / Shot 04',
      status: '可生成',
      selected: true,
      states: [
        { id: 'costume', label: '服装', value: '湿透风衣', tone: 'sky' },
        { id: 'emotion', label: '情绪', value: '压抑愤怒', tone: 'rose' },
        { id: 'injury', label: '伤痕', value: '左颧擦伤', tone: 'amber' },
        { id: 'prop', label: '道具', value: '旧伞', tone: 'violet' },
        { id: 'time', label: '时段', value: '雨夜', tone: 'neutral' },
      ],
      bindings: [
        { id: 'costume-ref', label: '服装参考', state: 'ready', summary: '2 张' },
        { id: 'injury-ref', label: '伤痕参考', state: 'missing', summary: '缺失' },
        { id: 'mood-ref', label: '情绪参考', state: 'ready', summary: '表情组' },
      ],
      impacts: [
        { id: 'prompt', label: '提示词', value: '强约束', tone: 'emerald', icon: Sparkles },
        { id: 'continuity', label: '连续性', value: '需锁定', tone: 'amber', icon: ShieldCheck },
        { id: 'asset', label: '素材', value: '派生变体', tone: 'sky', icon: CopyPlus },
      ],
    },
  },
]

const CANDIDATE_PREVIEWS: CandidatePreviewItem[] = [
  {
    id: 'analysis-candidate-group',
    type: 'candidate',
    name: '候选卡片组',
    description: '智能分析工具运行后的暂存结果，用户选择哪些候选成为正式实体，哪些放弃或留待重生成。',
    props: {
      title: '分镜与设定理解候选',
      subtitle: '来自：剧本分析工具 · Scene 08',
      sourceLabel: '智能分析结果',
      status: '待确认',
      selected: true,
      candidates: [
        {
          id: 'storyboard-1',
          kind: 'storyboard',
          title: '巷口远景建立',
          summary: '雨夜、窄巷、林夏站在路灯边，建立空间和压抑氛围。',
          confidence: 0.91,
          decision: 'selected',
          tags: ['远景', '雨夜', '氛围'],
        },
        {
          id: 'setting-1',
          kind: 'setting',
          title: '旧伞',
          summary: '反复出现的旧伞，作为林夏过去经历的视觉锚点。',
          confidence: 0.84,
          decision: 'pending',
          tags: ['道具', '符号'],
        },
        {
          id: 'storyboard-2',
          kind: 'storyboard',
          title: '近景情绪压迫',
          summary: '镜头靠近林夏脸部，强调雨水、擦伤和压抑愤怒。',
          confidence: 0.88,
          decision: 'selected',
          tags: ['近景', '情绪'],
        },
        {
          id: 'setting-2',
          kind: 'setting',
          title: '临时路人',
          summary: '背景路人，没有明确生产价值，建议放弃。',
          confidence: 0.42,
          decision: 'rejected',
          tags: ['低价值'],
        },
      ],
    },
  },
]

const AGENT_PREVIEWS: AgentPreviewItem[] = [
  {
    id: 'ai-assistant-workbench',
    type: 'agent',
    name: 'AI 助手工作区',
    description: 'AI 助手沿用卡片化信息密度：上下文是输入契约，执行计划是可审查卡片，工具调用可追踪。',
  },
]

const STRUCTURED_SCRIPT_ITEMS: StructuredScriptItem[] = [
  {
    id: 'main-script-detail',
    type: 'structured-script',
    name: '总剧本详情',
    description: '总剧本是故事级来源，负责全局结构、人物关系、集纲和分集/分场候选，不直接等同于正式生产实体。',
    scriptKind: 'main',
  },
  {
    id: 'scene-script-detail',
    type: 'structured-script',
    name: '分场剧本详情',
    description: '分场剧本是生产级结构单元，以时间、地点、人物、情节和氛围等字段承载下游可消费事实。',
    scriptKind: 'scene',
  },
]

const SCRIPT_STRUCTURE_PREVIEWS: ScriptStructurePreviewItem[] = [
  {
    id: 'production-segment-hierarchy',
    type: 'script-structure',
    name: '片段层级',
    description: '展示剧本原文如何进入片段、情节、内容单元，以及人物/场景/产品等创作资料如何被引用。',
  },
]

const PREVIEW_GROUPS: Array<{
  id: string
  title: string
  description: string
  items: PreviewItem[]
}> = [
  {
    id: 'entities',
    title: '实体卡片',
    description: 'Canvas Entity Card',
    items: ENTITY_PREVIEWS,
  },
  {
    id: 'tools',
    title: '工具卡片',
    description: 'AI / Plugin Tool Card',
    items: TOOL_PREVIEWS,
  },
  {
    id: 'states',
    title: '状态卡片',
    description: 'Setting State Card',
    items: STATE_PREVIEWS,
  },
  {
    id: 'candidates',
    title: '候选组',
    description: 'Candidate Group',
    items: CANDIDATE_PREVIEWS,
  },
  {
    id: 'script-structure',
    title: '剧本结构',
    description: 'Segment / SceneMoment / ContentUnit',
    items: SCRIPT_STRUCTURE_PREVIEWS,
  },
  {
    id: 'script-detail',
    title: '剧本详情',
    description: 'Structured Script',
    items: STRUCTURED_SCRIPT_ITEMS,
  },
  {
    id: 'agent',
    title: 'AI 助手',
    description: 'MovScript Agent UI',
    items: AGENT_PREVIEWS,
  },
]

const PREVIEWS = PREVIEW_GROUPS.flatMap((group) => group.items)

export function UIPreviewPage() {
  const [selectedId, setSelectedId] = useState(PREVIEWS[0].id)
  const selected = PREVIEWS.find((item) => item.id === selectedId) ?? PREVIEWS[0]

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">UI 组件预览</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            后台专用的组件预览入口，用于评估画布节点、卡片和操作控件的实际呈现。当前聚焦实体卡片和统一的工具卡片。
          </p>
        </div>
        <Button size="sm" variant="outline">
          <Plus size={13} />
          添加预览
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-medium text-foreground">Canvas Cards</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">实体与工具操作卡片</p>
          </div>
          <div className="space-y-3 p-2">
            {PREVIEW_GROUPS.map((group) => (
              <div key={group.id}>
                <div className="px-2 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/70">{group.description}</p>
                </div>
                <div className="space-y-1">
                  {group.items.map((preview) => (
                    <button
                      key={preview.id}
                      type="button"
                      onClick={() => setSelectedId(preview.id)}
                      className={cn(
                        'w-full rounded-md px-2.5 py-2 text-left transition-colors',
                        selected.id === preview.id ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      )}
                    >
                      <p className="text-xs font-medium">{preview.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug">{preview.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                {selected.type === 'entity'
                  ? <Clapperboard size={15} className="text-muted-foreground" />
                  : selected.type === 'state'
                    ? <Sparkles size={15} className="text-muted-foreground" />
                  : selected.type === 'candidate'
                    ? <Layers size={15} className="text-muted-foreground" />
                  : selected.type === 'script-structure'
                    ? <ListChecks size={15} className="text-muted-foreground" />
                  : selected.type === 'structured-script'
                    ? <FileText size={15} className="text-muted-foreground" />
                  : selected.type === 'tool'
                    ? <Wrench size={15} className="text-muted-foreground" />
                    : <Sparkles size={15} className="text-muted-foreground" />}
                <h3 className="text-sm font-semibold text-foreground">{selected.name}</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{selected.description}</p>
            </div>

            <div className="overflow-auto">
              <div className="min-h-[420px] min-w-[860px] bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:20px_20px] p-8">
                {selected.type === 'entity'
                  ? <EntityPreviewCanvas preview={selected} />
                  : selected.type === 'state'
                    ? <StatePreviewCanvas preview={selected} />
                  : selected.type === 'candidate'
                    ? <CandidatePreviewCanvas preview={selected} />
                  : selected.type === 'script-structure'
                    ? <ScriptStructureHierarchyPreviewCanvas />
                  : selected.type === 'structured-script'
                    ? <StructuredScriptDetailPreviewCanvas scriptKind={selected.scriptKind} />
                  : selected.type === 'tool'
                    ? <ToolPreviewCanvas preview={selected} />
                    : <AgentAssistantPreviewCanvas />}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card px-3 py-3">
            <p className="text-xs font-semibold text-foreground">端口吸附规则</p>
            <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
              <LegendDot tone="target" label="蓝色点：输入，可吸附上游实体、资源或参数" />
              <LegendDot tone="source" label="主色点：输出，可被下游实体或工具读取" />
              <LegendDot tone="neutral" label="空心点：整卡选择、备用端口或未就绪槽位" />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {selected.type === 'entity' ? (
              <>
                <SpecCard title="属性绑定" text="卡片只暴露可绑定资源槽，不再展示所有实体字段。" />
                <SpecCard title="实体关联" text="关系区展示高频关系，真实创建关系时可通过连线或右键动作触发。" />
                <SpecCard title="实体创建" text="创建区承载从当前实体派生新实体的操作入口。" />
              </>
            ) : selected.type === 'state' ? (
              <>
                <SpecCard title="状态不是设定本体" text="状态卡表达某个上下文里的临时表现，避免把服装、情绪、伤痕直接污染基础设定。" />
                <SpecCard title="影响生成体验" text="状态变量可以注入提示词、锁定连续性，并决定应该牵引哪些素材。" />
                <SpecCard title="可派生素材" text="状态表现可以向外创建状态素材、表情组、服装变体或镜头级参考。" />
              </>
            ) : selected.type === 'candidate' ? (
              <>
                <SpecCard title="候选不等于实体" text="工具运行后先进入候选组，用户确认后才创建正式分镜、设定或素材。" />
                <SpecCard title="选择即提交" text="选中的候选输出为实体创建动作；放弃项保留为本次分析上下文，可用于重生成。" />
                <SpecCard title="可重复生成" text="候选组是一次运行的版本化结果，未来可以保留、对比或基于拒绝原因重跑。" />
              </>
            ) : selected.type === 'script-structure' ? (
              <>
                <SpecCard title="结构主干" text="片段、情节、内容单元是从文本到 AI 预演的主路径，负责叙事位置和生产颗粒度。" />
                <SpecCard title="资料引用" text="人物、场景、产品、风格等作为创作资料被情节引用，不强行成为所有项目的固定结构层。" />
                <SpecCard title="画布落点" text="每个情节或内容单元都可以打开自己的画布，执行关键帧、素材和视频生成动作。" />
              </>
            ) : selected.type === 'structured-script' ? (
              selected.scriptKind === 'main' ? (
                <>
                  <SpecCard title="总剧本是母体" text="保留 raw_source，同时沉淀故事主线、人物关系、世界规则和集纲结构。" />
                  <SpecCard title="拆解先成候选" text="分集、分场、角色和道具先进入候选收件箱，确认后才创建正式实体。" />
                  <SpecCard title="不直接生产镜头" text="总剧本服务全局规划和一致性，下游生产主要从已确认分场剧本开始。" />
                </>
              ) : (
                <>
                  <SpecCard title="raw_source 是来源" text="原始分场文本保持可追溯，不直接承担最终生产字段。" />
                  <SpecCard title="分场实体要结构化" text="时间、地点、人物、情节、氛围等字段成为可读写、可校验、可下游引用的事实层。" />
                  <SpecCard title="下游只读结构化层" text="分镜和镜头优先读取结构化分场，必要时再回看原文证据。" />
                </>
              )
            ) : selected.type === 'tool' ? (
              <>
                <SpecCard title="输入契约" text="工具卡片优先展示运行所需输入，输入缺失时直接暴露可连接端口。" />
                <SpecCard title="运行配置" text="模型、插件运行时和关键参数只显示摘要，详细编辑交给右侧面板。" />
                <SpecCard title="输出落点" text="输出槽既是结果预览，也是下游实体绑定或继续串联工具的端口。" />
              </>
            ) : (
              <>
                <SpecCard title="上下文契约" text="助手先展示当前项目、实体、资源和权限，让用户知道 AI 会基于什么行动。" />
                <SpecCard title="执行卡片" text="计划、工具调用和审批以卡片呈现，便于检查、暂停和追溯。" />
                <SpecCard title="紧凑输入" text="输入区保留附件、发送和运行状态，避免占用过多创作画布空间。" />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function ScriptStructureHierarchyPreviewCanvas() {
  const sections = [
    {
      id: 'sec-01',
      type: '开场节',
      title: '清晨厨房里的产品登场',
      source: 'Brief L12-L28',
      summary: '用安静、干净的清晨画面建立品牌质感。',
      active: false,
    },
    {
      id: 'sec-02',
      type: '剧情节',
      title: '雨夜巷口发现旧伞线索',
      source: 'Script L340-L392',
      summary: '林夏在暴雨中与顾言对峙，旧伞里滑出纸条。',
      active: true,
    },
    {
      id: 'sec-03',
      type: '转场节',
      title: '纸条地址引向老伞匠铺',
      source: 'Script L393-L426',
      summary: '情绪从对峙转向追查，进入下一地点。',
      active: false,
    },
  ]

  const sceneMoments = [
    {
      id: 'sit-01',
      title: '雨夜巷口对峙',
      summary: '老城区窄巷，路灯闪烁，林夏攥着湿透旧伞，顾言保持距离追问真相。',
      tone: '压抑 / 悬疑',
      refs: ['林夏', '顾言', '雨夜巷口', '旧伞'],
      selected: true,
    },
    {
      id: 'sit-02',
      title: '旧伞纸条暴露',
      summary: '伞骨夹层滑出被雨泡皱的纸条，林夏意识到母亲线索被隐藏多年。',
      tone: '惊愕 / 悲伤',
      refs: ['林夏', '旧伞', '母亲线索'],
    },
  ]

  const units = [
    { id: 'cu-01', label: 'CU-01', title: '巷口远景建立', kind: '画面', duration: '4s', output: '关键帧', status: '可生成' },
    { id: 'cu-02', label: 'CU-02', title: '林夏湿透脸部近景', kind: '镜头', duration: '5s', output: '视频片段', status: '缺伤痕参考', warning: true },
    { id: 'cu-03', label: 'CU-03', title: '旧伞纸条特写', kind: '画面', duration: '3s', output: '关键帧', status: '可生成' },
  ]

  const references = [
    { kind: 'person', label: '人物', title: '林夏', meta: '基础资料 + 雨夜受伤状态', tone: 'sky' },
    { kind: 'person', label: '人物', title: '顾言', meta: '黑色外套 / 克制距离', tone: 'violet' },
    { kind: 'location', label: '地点', title: '雨夜巷口', meta: '老城区 / 夜雨状态', tone: 'teal' },
    { kind: 'object', label: '道具', title: '旧伞', meta: '反复出现的线索道具', tone: 'amber' },
    { kind: 'style', label: '风格', title: '冷雨低照度', meta: '低饱和 / 强反光 / 悬疑', tone: 'rose' },
  ]

  return (
    <div className="w-[1120px] rounded-lg border border-border bg-background text-xs shadow-sm">
      <div className="grid h-[640px] grid-cols-[250px_minmax(0,1fr)_270px] overflow-hidden rounded-lg">
        <aside className="border-r border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-sky-600" />
              <p className="font-semibold text-foreground">片段</p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              原文先切成可确认的语义段落，不直接变成镜头。
            </p>
          </div>

          <div className="space-y-2 p-3">
            {sections.map((section, index) => (
              <SegmentPreviewCard key={section.id} index={index + 1} {...section} />
            ))}
          </div>

          <div className="border-t border-border p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">结构规则</p>
            <ScriptStructureCheck label="片段保留 source span" ok />
            <ScriptStructureCheck label="情节从片段派生" ok />
            <ScriptStructureCheck label="内容单元进入预演时间线" />
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden bg-background">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ListChecks size={14} className="text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Segment 到 SceneMoment 到 ContentUnit</h3>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  中间层负责 AI 理解和一键预演；人物、地点、产品、风格通过引用参与，而不是固定压进层级。
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="xs" variant="outline" className="h-7">合并/拆分节</Button>
                <Button size="xs" className="h-7">生成预演</Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-4">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold text-foreground">情节候选</p>
                <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">来自选中片段</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {sceneMoments.map((sceneMoment) => (
                  <SceneMomentPreviewCard key={sceneMoment.id} {...sceneMoment} />
                ))}
              </div>
            </section>

            <section className="rounded-md border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Clapperboard size={13} className="text-muted-foreground" />
                  <p className="font-semibold text-foreground">内容单元</p>
                </div>
                <span className="text-[10px] text-muted-foreground">确认后进入预演时间线</span>
              </div>
              <div className="divide-y divide-border/70">
                {units.map((unit) => (
                  <ContentUnitPreviewRow key={unit.id} {...unit} />
                ))}
              </div>
            </section>

            <section className="rounded-md border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Play size={13} className="text-muted-foreground" />
                  <p className="font-semibold text-foreground">预演时间线</p>
                </div>
                <span className="text-[10px] text-muted-foreground">关键帧先行，视频后置</span>
              </div>
              <div className="grid grid-cols-3 gap-2 p-3">
                {units.map((unit, index) => (
                  <div key={unit.id} className="rounded-md border border-border bg-background">
                    <div className="flex h-20 items-center justify-center border-b border-border bg-muted/30">
                      {index === 1 ? <Video size={20} className="text-muted-foreground/45" /> : <ImagePlus size={20} className="text-muted-foreground/45" />}
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="truncate text-[11px] font-medium text-foreground">{unit.title}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{unit.duration} · {unit.output}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>

        <aside className="border-l border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-muted-foreground" />
              <p className="font-semibold text-foreground">创作资料引用</p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              人物/场景/产品仍存在，只是作为可复用资料被情节引用。
            </p>
          </div>

          <div className="space-y-3 p-3">
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">CreativeReference</p>
              <div className="space-y-2">
                {references.map((reference) => (
                  <CreativeReferencePreviewCard key={`${reference.kind}-${reference.title}`} {...reference} />
                ))}
              </div>
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">关系说明</p>
              <ContinuityItem label="片段" value="文本来源和叙事位置" />
              <ContinuityItem label="情节" value="AI 理解画面的上下文" />
              <ContinuityItem label="内容单元" value="关键帧/视频生产颗粒度" />
              <ContinuityItem label="创作资料" value="主体、地点、产品、风格等复用事实" />
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">画布入口</p>
              <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2">
                <p className="text-[11px] font-medium text-foreground">打开「雨夜巷口对峙」情节画布</p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  画布中放置情节卡、资料引用卡、关键帧动作和生成结果。
                </p>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SegmentPreviewCard({
  index,
  type,
  title,
  source,
  summary,
  active,
}: {
  index: number
  type: string
  title: string
  source: string
  summary: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
        active ? 'border-primary/30 bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">{String(index).padStart(2, '0')}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{type}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] opacity-75">{source}</span>
      </div>
      <p className="mt-2 truncate text-xs font-semibold">{title}</p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed opacity-75">{summary}</p>
    </button>
  )
}

function SceneMomentPreviewCard({
  title,
  summary,
  tone,
  refs,
  selected,
}: {
  title: string
  summary: string
  tone: string
  refs: string[]
  selected?: boolean
}) {
  return (
    <div className={cn('rounded-md border bg-card px-3 py-3', selected ? 'border-primary/35 ring-1 ring-primary/15' : 'border-border')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{title}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{summary}</p>
        </div>
        <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{tone}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {refs.map((ref) => (
          <span key={ref} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{ref}</span>
        ))}
      </div>
    </div>
  )
}

function ContentUnitPreviewRow({
  label,
  title,
  kind,
  duration,
  output,
  status,
  warning,
}: {
  label: string
  title: string
  kind: string
  duration: string
  output: string
  status: string
  warning?: boolean
}) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)_86px_90px_96px] items-center gap-3 px-3 py-2.5">
      <span className="rounded border border-border bg-background px-1.5 py-1 text-center font-mono text-[10px] text-muted-foreground">{label}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{kind} · {duration}</p>
      </div>
      <span className="truncate text-[11px] text-muted-foreground">{output}</span>
      <Button size="xs" variant="outline" className="h-7">开画布</Button>
      <span className={cn(
        'truncate rounded border px-1.5 py-1 text-center text-[10px]',
        warning ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-border bg-background text-muted-foreground',
      )}>
        {status}
      </span>
    </div>
  )
}

function CreativeReferencePreviewCard({
  label,
  title,
  meta,
  tone,
}: {
  kind: string
  label: string
  title: string
  meta: string
  tone: string
}) {
  return (
    <div className={cn(
      'rounded-md border px-2.5 py-2',
      tone === 'sky' && 'border-sky-500/25 bg-sky-500/10',
      tone === 'violet' && 'border-violet-500/25 bg-violet-500/10',
      tone === 'teal' && 'border-teal-500/25 bg-teal-500/10',
      tone === 'amber' && 'border-amber-500/25 bg-amber-500/10',
      tone === 'rose' && 'border-rose-500/25 bg-rose-500/10',
    )}>
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded border border-border/70 bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">{label}</span>
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{title}</p>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{meta}</p>
    </div>
  )
}

function StructuredScriptDetailPreviewCanvas({ scriptKind }: { scriptKind: 'main' | 'scene' }) {
  if (scriptKind === 'main') {
    return <MainScriptDetailPreviewCanvas />
  }

  return <SceneScriptDetailPreviewCanvas />
}

function MainScriptDetailPreviewCanvas() {
  const episodeCandidates = [
    { id: 'ep1', label: 'EP01', title: '林夏回到老城', summary: '建立人物处境和旧伞伏笔，结尾出现顾言。', status: '待确认', selected: true },
    { id: 'ep2', label: 'EP02', title: '雨夜巷口对峙', summary: '林夏与顾言冲突升级，旧伞揭开母亲线索。', status: '待拆分', selected: true },
    { id: 'ep3', label: 'EP03', title: '纸条里的地址', summary: '主角追查母亲留下的地址，关系开始反转。', status: '低置信', warning: true },
  ]

  const globalFacts = [
    { icon: Users, label: '核心人物', value: '林夏、顾言、母亲、周屿', source: 'L12-L210' },
    { icon: GitBranch, label: '人物关系', value: '林夏与顾言从对立转向合作，母亲线索驱动主线。', source: 'AI 候选' },
    { icon: Database, label: '世界规则', value: '老城区拆迁、旧案档案缺失、伞匠铺是关键地点。', source: 'L55 / L240' },
    { icon: ListChecks, label: '主线结构', value: '回归、对峙、追查、揭露、选择。', source: '人工确认' },
  ]

  return (
    <div className="w-[1080px] rounded-lg border border-border bg-background text-xs shadow-sm">
      <div className="grid h-[620px] grid-cols-[250px_minmax(0,1fr)_290px] overflow-hidden rounded-lg">
        <aside className="border-r border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-sky-600" />
              <p className="font-semibold text-foreground">总剧本来源</p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">raw_source 保留完整故事文档</p>
          </div>

          <div className="space-y-3 p-3">
            <section className="rounded-md border border-border bg-background">
              <div className="border-b border-border px-3 py-2">
                <p className="font-mono text-[11px] font-medium text-foreground">main_script_raw.md</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">v12 / 12 集 / 4.8 万字</p>
              </div>
              <div className="space-y-2 px-3 py-2">
                <RawSourceLine line="L012" text="林夏回到老城，是为了查清母亲当年离开的真相。" active />
                <RawSourceLine line="L155" text="顾言始终回避旧伞的来历，却知道伞骨里藏着东西。" />
                <RawSourceLine line="L420" text="每一次雨夜，都对应一段被刻意抹掉的证词。" />
              </div>
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">总剧本边界</p>
              <div className="space-y-1.5">
                <ScriptStructureCheck label="全局故事结构" ok />
                <ScriptStructureCheck label="分集/分场候选" ok />
                <ScriptStructureCheck label="正式实体待确认" />
              </div>
            </section>
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden bg-background">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">总剧本</span>
                  <h3 className="truncate text-sm font-semibold text-foreground">《雨巷旧伞》故事母本</h3>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  总剧本沉淀全局故事事实，并生成分集、分场、人物、场景和道具候选；确认后才进入正式实体库。
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="xs" variant="outline" className="h-7">查看差异</Button>
                <Button size="xs" className="h-7">分析总剧本</Button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4">
            <div className="grid grid-cols-5 gap-2">
              <ScriptStructureMetric icon={Film} label="集数" value="12 集" tone="sky" />
              <ScriptStructureMetric icon={Users} label="人物候选" value="18" tone="violet" />
              <ScriptStructureMetric icon={MapPin} label="场景候选" value="26" tone="teal" />
              <ScriptStructureMetric icon={ListChecks} label="分场候选" value="84" tone="amber" />
              <ScriptStructureMetric icon={AlertTriangle} label="冲突" value="5" tone="rose" />
            </div>

            <section className="rounded-md border border-border bg-card">
              <div className="grid grid-cols-[150px_minmax(0,1fr)_130px] border-b border-border px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>全局结构</span>
                <span>当前值</span>
                <span>来源</span>
              </div>
              {globalFacts.map((fact) => (
                <ScriptStructureFact key={fact.label} {...fact} />
              ))}
            </section>

            <section className="grid grid-cols-[minmax(0,1fr)_220px] gap-3">
              <div className="rounded-md border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <p className="font-semibold text-foreground">分集候选拆解</p>
                  <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">确认后创建分集剧本</span>
                </div>
                <div className="divide-y divide-border/70">
                  {episodeCandidates.map((episode) => (
                    <ScriptCandidateRow key={episode.id} {...episode} />
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-border bg-card">
                <div className="border-b border-border px-3 py-2">
                  <p className="font-semibold text-foreground">候选收件箱</p>
                </div>
                <div className="space-y-2 p-3">
                  <ScriptInboxItem label="人物" value="18 个候选，6 个疑似重复" />
                  <ScriptInboxItem label="场景" value="26 个候选，3 个需合并" />
                  <ScriptInboxItem label="道具" value="9 个候选，旧伞高优先级" />
                  <ScriptInboxItem label="关系" value="14 条候选，5 条冲突" />
                </div>
              </div>
            </section>
          </div>
        </main>

        <aside className="border-l border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <GitBranch size={14} className="text-muted-foreground" />
              <p className="font-semibold text-foreground">拆解契约</p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">总剧本不直接生成正式生产实体</p>
          </div>
          <div className="space-y-3 p-3">
            <ScriptStructureSideBlock title="确认后可创建">
              <ScriptStructureAction icon={Film} label="分集剧本" value="12 个候选" />
              <ScriptStructureAction icon={Clapperboard} label="分场剧本" value="84 个候选" />
              <ScriptStructureAction icon={Database} label="设定实体" value="人物/场景/道具" />
            </ScriptStructureSideBlock>

            <ScriptStructureSideBlock title="禁止直接写入">
              <ContinuityItem label="空人物实体" value="必须经候选确认或合并后创建" />
              <ContinuityItem label="空分场实体" value="必须有来源范围和结构字段" />
              <ContinuityItem label="空素材位" value="进入素材阶段后再生成" />
            </ScriptStructureSideBlock>

            <ScriptStructureSideBlock title="关系定义">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                总剧本是 `parent_script`；分集剧本和分场剧本是从它拆出的确认结果。候选层负责去重、合并、忽略和证据追溯。
              </p>
            </ScriptStructureSideBlock>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SceneScriptDetailPreviewCanvas() {
  const beats = [
    { id: 'b1', label: '开场', time: '00:00-00:18', plot: '林夏独自走进雨巷，旧伞被风吹翻。', mood: '压抑 / 不安', active: true },
    { id: 'b2', label: '冲突', time: '00:18-00:54', plot: '顾言拦住林夏，追问她隐瞒的真相。', mood: '对峙 / 克制' },
    { id: 'b3', label: '反转', time: '00:54-01:12', plot: '林夏发现旧伞内侧藏着母亲留下的纸条。', mood: '惊愕 / 悲伤' },
  ]

  const characters = [
    { name: '林夏', role: '主角', state: '湿透风衣 / 左颧擦伤 / 压抑愤怒' },
    { name: '顾言', role: '对手戏', state: '黑色外套 / 保持距离 / 情绪克制' },
    { name: '母亲', role: '缺席人物', state: '通过纸条和旧伞进入剧情' },
  ]

  return (
    <div className="w-[1080px] rounded-lg border border-border bg-background text-xs shadow-sm">
      <div className="grid h-[620px] grid-cols-[240px_minmax(0,1fr)_280px] overflow-hidden rounded-lg">
        <aside className="border-r border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-sky-600" />
              <p className="font-semibold text-foreground">剧本文档</p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">raw_source 保留原始表达和证据位置</p>
          </div>

          <div className="space-y-3 p-3">
            <section className="rounded-md border border-border bg-background">
              <div className="border-b border-border px-3 py-2">
                <p className="font-mono text-[11px] font-medium text-foreground">raw_source.md</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">v12 / 1784 字 / 已解析</p>
              </div>
              <div className="space-y-2 px-3 py-2">
                <RawSourceLine line="L340" text="雨越下越大，林夏攥着旧伞站在巷口。" active />
                <RawSourceLine line="L361" text="顾言没有靠近，只问她到底还瞒了什么。" />
                <RawSourceLine line="L378" text="伞骨夹层里滑出一张被雨泡皱的纸条。" />
              </div>
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">解析状态</p>
              <div className="space-y-1.5">
                <ScriptStructureCheck label="来源文本已锁定" ok />
                <ScriptStructureCheck label="结构化字段可编辑" ok />
                <ScriptStructureCheck label="下游影响待确认" />
              </div>
            </section>
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden bg-background">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">分场剧本</span>
                  <h3 className="truncate text-sm font-semibold text-foreground">EP02-S08 雨夜巷口</h3>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  正式剧本实体承载结构化事实；原文只作为来源证据和人工复核入口。
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="xs" variant="outline" className="h-7">查看原文</Button>
                <Button size="xs" className="h-7">确认结构</Button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4">
            <div className="grid grid-cols-5 gap-2">
              <ScriptStructureMetric icon={Clock} label="时间" value="雨夜 / 1 分 12 秒" tone="sky" />
              <ScriptStructureMetric icon={MapPin} label="地点" value="老城区窄巷" tone="teal" />
              <ScriptStructureMetric icon={Users} label="人物" value="3" tone="violet" />
              <ScriptStructureMetric icon={Layers} label="情节点" value="3" tone="amber" />
              <ScriptStructureMetric icon={Sparkles} label="氛围" value="压抑悬疑" tone="rose" />
            </div>

            <section className="rounded-md border border-border bg-card">
              <div className="grid grid-cols-[150px_minmax(0,1fr)_130px] border-b border-border px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>结构字段</span>
                <span>当前值</span>
                <span>来源</span>
              </div>
              <ScriptStructureFact icon={Clock} label="时间" value="深夜，暴雨刚起，单场预计 72 秒。" source="L340-L392" />
              <ScriptStructureFact icon={MapPin} label="地点" value="老城区窄巷，路灯闪烁，地面积水反光。" source="L340" />
              <ScriptStructureFact icon={Users} label="人物" value="林夏、顾言、母亲纸条；母亲不在场但驱动反转。" source="L361 / L378" />
              <ScriptStructureFact icon={ListChecks} label="情节" value="建立压迫空间，人物对峙，旧伞揭示隐藏信息。" source="AI + 人工确认" />
              <ScriptStructureFact icon={Sparkles} label="氛围" value="克制、冷雨、低照度、悬疑感，结尾转为悲伤。" source="L340-L392" />
            </section>

            <section className="grid grid-cols-[minmax(0,1fr)_210px] gap-3">
              <div className="rounded-md border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <p className="font-semibold text-foreground">情节结构</p>
                  <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">可拆分为分镜</span>
                </div>
                <div className="divide-y divide-border/70">
                  {beats.map((beat, index) => (
                    <div key={beat.id} className={cn('grid grid-cols-[56px_82px_minmax(0,1fr)_92px] gap-2 px-3 py-2.5', beat.active && 'bg-primary/5')}>
                      <span className="font-mono text-[11px] text-muted-foreground">#{index + 1}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{beat.time}</span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">{beat.label}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{beat.plot}</p>
                      </div>
                      <span className="truncate rounded bg-muted px-1.5 py-1 text-center text-[10px] text-muted-foreground">{beat.mood}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-border bg-card">
                <div className="border-b border-border px-3 py-2">
                  <p className="font-semibold text-foreground">人物状态</p>
                </div>
                <div className="space-y-2 p-3">
                  {characters.map((character) => (
                    <CharacterStateRow key={character.name} {...character} />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </main>

        <aside className="border-l border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-muted-foreground" />
              <p className="font-semibold text-foreground">生产契约</p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">下游实体读取结构化字段</p>
          </div>
          <div className="space-y-3 p-3">
            <ScriptStructureSideBlock title="可创建">
              <ScriptStructureAction icon={Clapperboard} label="分场" value="Scene 08" />
              <ScriptStructureAction icon={Layers} label="分镜候选" value="3 条" />
              <ScriptStructureAction icon={Camera} label="镜头任务" value="预计 5-7 个" />
            </ScriptStructureSideBlock>

            <ScriptStructureSideBlock title="引用关系">
              <ContinuityItem label="林夏雨夜受伤状态" value="人物状态，不覆盖基础设定" />
              <ContinuityItem label="旧伞" value="道具设定 + 反转证据" />
              <ContinuityItem label="雨夜巷口" value="场景设定的夜雨状态" />
            </ScriptStructureSideBlock>

            <ScriptStructureSideBlock title="字段边界">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                `raw_source` 保存全文、版本和证据行；剧本实体保存可审核事实；分镜和镜头只消费结构化事实与引用关系。
              </p>
            </ScriptStructureSideBlock>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ScriptCandidateRow({
  label,
  title,
  summary,
  status,
  selected,
  warning,
}: {
  label: string
  title: string
  summary: string
  status: string
  selected?: boolean
  warning?: boolean
}) {
  return (
    <div className={cn('grid grid-cols-[48px_minmax(0,1fr)_84px] gap-3 px-3 py-2.5', selected && 'bg-primary/5')}>
      <span className="rounded border border-border bg-background px-1.5 py-1 text-center font-mono text-[10px] text-muted-foreground">{label}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{title}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{summary}</p>
      </div>
      <div className="flex items-center justify-end">
        <span className={cn(
          'rounded border px-1.5 py-1 text-[10px] leading-none',
          warning ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-border bg-background text-muted-foreground',
        )}>
          {status}
        </span>
      </div>
    </div>
  )
}

function ScriptInboxItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{value}</p>
    </div>
  )
}

function RawSourceLine({ line, text, active }: { line: string; text: string; active?: boolean }) {
  return (
    <div className={cn('rounded border px-2 py-1.5', active ? 'border-sky-500/30 bg-sky-500/10' : 'border-border bg-muted/20')}>
      <div className="mb-1 font-mono text-[10px] text-muted-foreground">{line}</div>
      <p className="text-[11px] leading-relaxed text-foreground">{text}</p>
    </div>
  )
}

function ScriptStructureMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ElementType
  label: string
  value: string
  tone: 'sky' | 'teal' | 'violet' | 'amber' | 'rose'
}) {
  return (
    <div className={cn(
      'rounded-md border px-2.5 py-2',
      tone === 'sky' && 'border-sky-500/25 bg-sky-500/10',
      tone === 'teal' && 'border-teal-500/25 bg-teal-500/10',
      tone === 'violet' && 'border-violet-500/25 bg-violet-500/10',
      tone === 'amber' && 'border-amber-500/25 bg-amber-500/10',
      tone === 'rose' && 'border-rose-500/25 bg-rose-500/10',
    )}>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon size={12} />
        <span>{label}</span>
      </div>
      <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
    </div>
  )
}

function ScriptStructureFact({
  icon: Icon,
  label,
  value,
  source,
}: {
  icon: ElementType
  label: string
  value: string
  source: string
}) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)_130px] gap-3 border-b border-border/70 px-3 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        <Icon size={13} className="shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium text-foreground">{label}</span>
      </div>
      <p className="truncate text-xs text-muted-foreground">{value}</p>
      <span className="truncate font-mono text-[10px] text-muted-foreground">{source}</span>
    </div>
  )
}

function CharacterStateRow({ name, role, state }: { name: string; role: string; state: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-foreground">{name}</p>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{role}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{state}</p>
    </div>
  )
}

function ScriptStructureSideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function ScriptStructureAction({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
      <Icon size={12} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{label}</span>
      <span className="shrink-0 text-[11px] font-medium text-foreground">{value}</span>
    </div>
  )
}

function ContinuityItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5">
      <p className="truncate text-[11px] font-medium text-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{value}</p>
    </div>
  )
}

function ScriptStructureCheck({ label, ok }: { label: string; ok?: boolean }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Icon size={12} className={cn('shrink-0', ok ? 'text-emerald-600' : 'text-amber-600')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </div>
  )
}

function EntityPreviewCanvas({ preview }: { preview: EntityPreviewItem }) {
  if (preview.id === 'setting-assets-graph') {
    return <SettingAssetRelationCanvas preview={preview} />
  }

  return (
    <div className="flex items-start gap-12">
      <CanvasEntityActionCard {...preview.props} />
      <div className="mt-4 space-y-3">
        <CanvasToolActionCard
          {...TOOL_PREVIEWS[0].props}
          selected={false}
          status="已生成"
          className="scale-[0.86] origin-top-left"
        />
      </div>
    </div>
  )
}

function AgentAssistantPreviewCanvas() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">AI 助手</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        当前只保留基础占位，不展示实验性画布原型。
      </p>
    </div>
  )
}

function StatePreviewCanvas({ preview }: { preview: StatePreviewItem }) {
  const baseSetting = ENTITY_PREVIEWS[0].props
  const stateAsset: CanvasEntityActionCardProps = {
    kind: 'asset',
    title: '雨夜受伤状态素材',
    subtitle: '状态资产 · 服装/伤痕/情绪',
    status: '待补伤痕',
    bindings: [
      { id: 'image', label: '图像', kind: 'image', state: 'bound', resourceLabel: '服装参考' },
      { id: 'reference', label: '参考', kind: 'image', state: 'bound', resourceLabel: '基础设定' },
      { id: 'injury', label: '伤痕', kind: 'image', state: 'empty', resourceLabel: '缺失' },
    ],
    relations: [
      { id: 'state', label: '表现自', targetLabel: '雨夜状态', direction: 'incoming' },
    ],
    createActions: [
      { id: 'variant', label: '变体', icon: Sparkles },
      { id: 'shot', label: '镜头', icon: Camera },
    ],
  }

  return (
    <div className="relative h-[520px] w-[980px]">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 980 520" aria-hidden="true">
        <defs>
          <marker id="state-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="fill-amber-500" />
          </marker>
          <marker id="state-binding-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="fill-primary" />
          </marker>
        </defs>

        <StatePath d="M278 112 C350 112 368 112 430 112" label="base setting + scene scope" labelX={310} labelY={92} />
        <StatePath d="M740 112 C790 112 800 74 856 74" label="derive state asset" labelX={748} labelY={92} />
        <BindingPath d="M740 250 C794 250 800 322 858 322" label="prompt context" labelX={774} labelY={292} />
      </svg>

      <div className="absolute left-0 top-8">
        <CanvasEntityActionCard {...baseSetting} selected={false} status="基础设定" />
      </div>

      <div className="absolute left-[430px] top-8">
        <CanvasSettingStateCard {...preview.props} />
      </div>

      <div className="absolute left-[780px] top-0">
        <CanvasEntityActionCard {...stateAsset} selected={false} className="scale-[0.78] origin-top-left" />
      </div>

      <div className="absolute left-[810px] top-[280px] w-[160px] rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-violet-500/10 px-3 py-2">
          <Sparkles size={13} className="text-violet-600" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">镜头生成</span>
        </div>
        <div className="space-y-1 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <p>读取状态变量</p>
          <p>锁定服装、情绪、伤痕连续性</p>
        </div>
      </div>

      <div className="absolute bottom-3 left-0 flex gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm">
        <LineLegend tone="amber" label="状态线：基础设定在特定上下文里的表现" />
        <LineLegend tone="primary" label="数据流线：状态上下文注入生成工具" />
      </div>
    </div>
  )
}

function CandidatePreviewCanvas({ preview }: { preview: CandidatePreviewItem }) {
  const analysisTool: CanvasToolActionCardProps = {
    source: 'ai',
    tone: 'emerald',
    icon: Sparkles,
    title: '剧本智能分析',
    subtitle: '理解分场 / 抽取设定 / 生成候选',
    status: '已运行',
    inputs: [
      { id: 'script', label: '剧本文本', type: 'text', state: 'ready', summary: 'EP02' },
      { id: 'scene', label: '目标分场', type: 'entity', state: 'ready', summary: '08 巷口' },
      { id: 'settings', label: '已有设定', type: 'json', state: 'ready', summary: '6 项' },
    ],
    configs: [
      { id: 'mode', label: '模式', value: '分镜+设定' },
      { id: 'count', label: '数量', value: '4-8' },
      { id: 'strictness', label: '约束', value: '中' },
    ],
    outputs: [
      { id: 'candidates', label: '候选组', type: 'json', state: 'ready', summary: '4 项' },
      { id: 'notes', label: '分析说明', type: 'text', state: 'ready', summary: '可追溯' },
    ],
    primaryAction: { id: 'run', label: '重跑', icon: RefreshCw },
    secondaryAction: { id: 'config', label: '配置', icon: Wrench },
  }

  const acceptedStoryboard: CanvasEntityActionCardProps = {
    kind: 'storyboard',
    title: '巷口远景建立',
    subtitle: '由候选创建 · Scene 08',
    status: '新实体',
    bindings: [
      { id: 'image', label: '画面', kind: 'image', state: 'empty' },
      { id: 'reference', label: '参考', kind: 'image', state: 'bound', resourceLabel: '林夏状态' },
      { id: 'result', label: '输出', kind: 'resource', state: 'empty' },
    ],
    relations: [
      { id: 'source', label: '来自', targetLabel: '候选组', direction: 'incoming' },
    ],
    createActions: [
      { id: 'shot', label: '镜头', icon: Camera },
      { id: 'variant', label: '变体', icon: Sparkles },
    ],
  }

  const acceptedSetting: CanvasEntityActionCardProps = {
    kind: 'setting',
    title: '旧伞',
    subtitle: '由候选创建 · 道具设定',
    status: '待完善',
    bindings: [
      { id: 'reference', label: '参考', kind: 'image', state: 'empty' },
      { id: 'result', label: '输出', kind: 'resource', state: 'empty' },
      { id: 'attachment', label: '附件', kind: 'resource', state: 'empty' },
    ],
    relations: [
      { id: 'scene', label: '出现于', targetLabel: '雨夜巷口', direction: 'incoming' },
    ],
    createActions: [
      { id: 'asset', label: '素材', icon: CopyPlus },
      { id: 'state', label: '状态', icon: Sparkles },
    ],
  }

  return (
    <div className="relative h-[540px] w-[1040px]">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1040 540" aria-hidden="true">
        <defs>
          <marker id="candidate-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="fill-emerald-500" />
          </marker>
          <marker id="candidate-entity-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="fill-primary" />
          </marker>
        </defs>

        <CandidatePath d="M300 132 C365 132 380 132 438 132" label="analysis output" labelX={334} labelY={112} />
        <CandidateEntityPath d="M770 92 C820 92 840 58 890 58" label="accept -> create storyboard" labelX={778} labelY={70} />
        <CandidateEntityPath d="M770 238 C820 238 840 300 890 300" label="accept -> create setting" labelX={784} labelY={276} />
      </svg>

      <div className="absolute left-0 top-8">
        <CanvasToolActionCard {...analysisTool} className="scale-[0.92] origin-top-left" />
      </div>

      <div className="absolute left-[438px] top-22">
        <CanvasCandidateGroupCard {...preview.props} />
      </div>

      <div className="absolute left-[890px] top-0 space-y-5">
        <CanvasEntityActionCard {...acceptedStoryboard} selected={false} className="scale-[0.75] origin-top-left" />
        <CanvasEntityActionCard {...acceptedSetting} selected={false} className="scale-[0.75] origin-top-left" />
      </div>

      <div className="absolute bottom-3 left-0 flex gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm">
        <LineLegend tone="emerald" label="候选线：工具输出待确认候选集合" />
        <LineLegend tone="primary" label="提交线：选中候选创建正式实体" />
      </div>
    </div>
  )
}

function SettingAssetRelationCanvas({ preview }: { preview: EntityPreviewItem }) {
  const assetCards: CanvasEntityActionCardProps[] = [
    {
      kind: 'asset',
      title: '林夏 主视觉',
      subtitle: '角色资产 · 正面半身',
      status: '已绑定',
      bindings: [
        { id: 'image', label: '图像', kind: 'image', state: 'bound', resourceLabel: 'portrait_v2.png' },
        { id: 'reference', label: '参考', kind: 'image', state: 'bound', resourceLabel: '设定' },
        { id: 'result', label: '输出', kind: 'resource', state: 'empty' },
      ],
      relations: [
        { id: 'setting', label: '属于', targetLabel: '林夏', direction: 'incoming' },
      ],
      createActions: [
        { id: 'variant', label: '变体', icon: Sparkles },
        { id: 'shot', label: '镜头', icon: Camera },
      ],
    },
    {
      kind: 'asset',
      title: '林夏 雨夜服装',
      subtitle: '角色资产 · 服装状态',
      status: '草稿',
      bindings: [
        { id: 'image', label: '图像', kind: 'image', state: 'bound', resourceLabel: 'costume.png' },
        { id: 'reference', label: '参考', kind: 'image', state: 'bound', resourceLabel: '主视觉' },
        { id: 'result', label: '输出', kind: 'resource', state: 'empty' },
      ],
      relations: [
        { id: 'setting', label: '变体自', targetLabel: '林夏', direction: 'incoming' },
      ],
      createActions: [
        { id: 'multi-angle', label: '多角度', icon: CopyPlus },
        { id: 'shot', label: '镜头', icon: Camera },
      ],
    },
    {
      kind: 'asset',
      title: '林夏 表情参考',
      subtitle: '角色资产 · 情绪组',
      status: '参考',
      bindings: [
        { id: 'image', label: '图像', kind: 'image', state: 'bound', resourceLabel: '4 张' },
        { id: 'reference', label: '参考', kind: 'image', state: 'bound', resourceLabel: '主视觉' },
        { id: 'result', label: '输出', kind: 'resource', state: 'empty' },
      ],
      relations: [
        { id: 'setting', label: '服务于', targetLabel: '林夏', direction: 'incoming' },
      ],
      createActions: [
        { id: 'variant', label: '变体', icon: Sparkles },
        { id: 'storyboard', label: '分镜', icon: Layers },
      ],
    },
  ]

  return (
    <div className="relative h-[560px] w-[980px]">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 980 560" aria-hidden="true">
        <defs>
          <marker id="entity-relation-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="fill-teal-500" />
          </marker>
          <marker id="binding-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="fill-primary" />
          </marker>
        </defs>

        <RelationPath d="M278 96 C360 96 386 70 468 70" label="setting_id / belongs_to" labelX={344} labelY={70} />
        <RelationPath d="M278 166 C362 166 384 238 468 238" label="variant_of" labelX={358} labelY={216} />
        <RelationPath d="M278 236 C360 236 386 404 468 404" label="reference_for" labelX={346} labelY={362} />
        <BindingPath d="M724 94 C792 94 804 158 872 158" label="输出到生成工具" labelX={770} labelY={126} />
      </svg>

      <div className="absolute left-0 top-12">
        <CanvasEntityActionCard {...preview.props} />
      </div>

      <div className="absolute left-[470px] top-0 space-y-5">
        {assetCards.map((props) => (
          <CanvasEntityActionCard key={props.title} {...props} className="scale-[0.86] origin-top-left" />
        ))}
      </div>

      <div className="absolute left-[820px] top-[116px] w-[150px] rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
          <Sparkles size={13} className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">图像生成</span>
        </div>
        <div className="px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          读取素材输出，不拥有实体关系
        </div>
      </div>

      <div className="absolute bottom-3 left-0 flex gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm">
        <LineLegend tone="teal" label="实体引用线：持久关系，可用于牵引素材" />
        <LineLegend tone="primary" label="数据流线：执行/绑定生成结果" />
      </div>
    </div>
  )
}

function RelationPath({ d, label, labelX, labelY }: { d: string; label: string; labelX: number; labelY: number }) {
  return (
    <>
      <path d={d} fill="none" stroke="rgb(20 184 166)" strokeWidth="2" strokeDasharray="6 5" markerEnd="url(#entity-relation-arrow)" />
      <text x={labelX} y={labelY} className="fill-muted-foreground text-[10px]">{label}</text>
    </>
  )
}

function StatePath({ d, label, labelX, labelY }: { d: string; label: string; labelX: number; labelY: number }) {
  return (
    <>
      <path d={d} fill="none" stroke="rgb(245 158 11)" strokeWidth="2.5" strokeDasharray="4 4" markerEnd="url(#state-arrow)" />
      <text x={labelX} y={labelY} className="fill-muted-foreground text-[10px]">{label}</text>
    </>
  )
}

function CandidatePath({ d, label, labelX, labelY }: { d: string; label: string; labelX: number; labelY: number }) {
  return (
    <>
      <path d={d} fill="none" stroke="rgb(16 185 129)" strokeWidth="2.5" strokeDasharray="5 4" markerEnd="url(#candidate-arrow)" />
      <text x={labelX} y={labelY} className="fill-muted-foreground text-[10px]">{label}</text>
    </>
  )
}

function CandidateEntityPath({ d, label, labelX, labelY }: { d: string; label: string; labelX: number; labelY: number }) {
  return (
    <>
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" markerEnd="url(#candidate-entity-arrow)" />
      <text x={labelX} y={labelY} className="fill-muted-foreground text-[10px]">{label}</text>
    </>
  )
}

function BindingPath({ d, label, labelX, labelY }: { d: string; label: string; labelX: number; labelY: number }) {
  return (
    <>
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" markerEnd="url(#binding-arrow)" />
      <text x={labelX} y={labelY} className="fill-muted-foreground text-[10px]">{label}</text>
    </>
  )
}

function LineLegend({ tone, label }: { tone: 'teal' | 'primary' | 'amber' | 'emerald'; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn(
        'h-0 w-8 border-t-2',
        tone === 'teal' && 'border-teal-500 border-dashed',
        tone === 'amber' && 'border-amber-500 border-dashed',
        tone === 'emerald' && 'border-emerald-500 border-dashed',
        tone === 'primary' && 'border-primary',
      )} />
      <span>{label}</span>
    </div>
  )
}

function ToolPreviewCanvas({ preview }: { preview: ToolPreviewItem }) {
  return (
    <div className="flex items-start gap-10">
      <CanvasEntityActionCard
        {...ENTITY_PREVIEWS[2].props}
        selected={false}
        status="输入源"
        className="mt-5"
      />
      <CanvasToolActionCard {...preview.props} />
      <CanvasEntityActionCard
        {...ENTITY_PREVIEWS[1].props}
        selected={false}
        status="输出目标"
        className="mt-16"
      />
    </div>
  )
}

function SpecCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

function LegendDot({ tone, label }: { tone: 'target' | 'source' | 'neutral'; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        'h-3 w-3 shrink-0 rounded-full border-2',
        tone === 'target' && 'border-sky-500 bg-sky-500',
        tone === 'source' && 'border-primary bg-primary',
        tone === 'neutral' && 'border-border bg-card',
      )} />
      <span>{label}</span>
    </div>
  )
}

function CardHint({ tone, text }: { tone: 'green'; text: ReactNode }) {
  return (
    <div className={cn(
      'rounded-md border px-2 py-1.5 text-[10px] leading-relaxed',
      tone === 'green' && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    )}>
      {text}
    </div>
  )
}
