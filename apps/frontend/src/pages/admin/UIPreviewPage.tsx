import { useState } from 'react'
import type { ElementType, ReactNode } from 'react'
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, Clapperboard, Clock, CopyPlus, Database, FileText, Film, GitBranch, ImagePlus, Inbox, Layers, ListChecks, MapPin, Play, Plus, Puzzle, RefreshCw, Send, ShieldCheck, Sparkles, Users, Video, Wrench } from 'lucide-react'
import {
  AgentCommandBar,
  AgentComposerAction,
  AgentComposerField,
  AgentComposerSubmit,
  AgentContextBar,
  AgentContextChip,
  AgentInstructionCard,
  AgentRailSection,
  AgentRunCard,
  AgentRunCardGrid,
  AgentRunField,
  AgentStatus,
  AgentToolStep,
  AgentWorkActions,
  AgentWorkBody,
  AgentWorkHeader,
  AgentWorkLane,
  AgentWorkRail,
  AgentWorkSurface,
  AgentWorkTitleBlock,
  Button,
} from '@movscript/ui'
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

type V2PreviewItem = {
  id: string
  type: 'v2'
  name: string
  description: string
}

type V2CanvasCardPreviewItem = {
  id: string
  type: 'v2-canvas-card'
  name: string
  description: string
}

type V2CanvasInsertPreviewItem = {
  id: string
  type: 'v2-canvas-insert'
  name: string
  description: string
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

type StructuredScriptPreviewItem = {
  id: string
  type: 'structured-script'
  name: string
  description: string
  scriptKind: 'main' | 'scene'
}

type PreviewItem = EntityPreviewItem | StatePreviewItem | CandidatePreviewItem | V2PreviewItem | V2CanvasCardPreviewItem | V2CanvasInsertPreviewItem | ToolPreviewItem | ScriptStructurePreviewItem | StructuredScriptPreviewItem | AgentPreviewItem

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

const STRUCTURED_SCRIPT_PREVIEWS: StructuredScriptPreviewItem[] = [
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
    id: 'script-section-hierarchy',
    type: 'script-structure',
    name: '剧本节层级',
    description: '展示剧本原文如何进入剧本节、情境、内容单元，以及人物/场景/产品等创作资料如何被引用。',
  },
]

const V2_PREVIEWS: V2PreviewItem[] = [
  {
    id: 'v2-integrated-model',
    type: 'v2',
    name: 'V2 总览',
    description: '把剧本结构、创作资料、素材、画布输出和制作任务收进一个模型里，用来检查设计是否自洽。',
  },
]

const V2_CANVAS_CARD_PREVIEWS: V2CanvasCardPreviewItem[] = [
  {
    id: 'v2-canvas-cards',
    type: 'v2-canvas-card',
    name: '预演修改原型',
    description: '用户从一个不满意的预演画面进入，只看到理解、画面、素材、关键图和视频候选，以及每次点击后的结果。',
  },
]

const V2_CANVAS_INSERT_PREVIEWS: V2CanvasInsertPreviewItem[] = [
    {
      id: 'v2-canvas-insert',
      type: 'v2-canvas-insert',
      name: '卡片加入画布',
      description: '示例用户如何从卡片库选择一个卡片，点击加入后把它放进当前画布空位，并继续生成关键图或视频候选。',
    },
]

const PREVIEW_GROUPS: Array<{
  id: string
  title: string
  description: string
  items: PreviewItem[]
}> = [
  {
    id: 'v2',
    title: 'V2',
    description: 'Integrated Product Model',
    items: V2_PREVIEWS,
  },
  {
    id: 'v2-canvas-cards',
    title: '预演修改原型',
    description: 'Low-friction Prototype',
    items: V2_CANVAS_CARD_PREVIEWS,
  },
  {
    id: 'v2-canvas-insert',
    title: '卡片加入画布',
    description: 'Insert Card Flow',
    items: V2_CANVAS_INSERT_PREVIEWS,
  },
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
    description: 'ScriptSection / Situation / ContentUnit',
    items: SCRIPT_STRUCTURE_PREVIEWS,
  },
  {
    id: 'script-detail',
    title: '剧本详情',
    description: 'Structured Script',
    items: STRUCTURED_SCRIPT_PREVIEWS,
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
                {selected.type === 'v2'
                  ? <Sparkles size={15} className="text-muted-foreground" />
                : selected.type === 'v2-canvas-card'
                  ? <GitBranch size={15} className="text-muted-foreground" />
                : selected.type === 'entity'
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
                {selected.type === 'v2'
                  ? <V2IntegratedModelPreviewCanvas />
                : selected.type === 'v2-canvas-card'
                  ? <V2CanvasCardsPreviewCanvas />
                : selected.type === 'v2-canvas-insert'
                  ? <V2CanvasInsertPreviewCanvas />
                : selected.type === 'entity'
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
            {selected.type === 'v2' ? (
              <>
                <SpecCard title="不按页面建模" text="V2 把页面收敛为对象视图：剧本与拆解、创作资料、预演、素材、任务、交付都读取同一组事实源。" />
                <SpecCard title="画布不是事实源" text="画布有 owner 和输出落点，只记录操作、运行和结果；实体数据仍由结构化域、创作资料域、素材域持有。" />
                <SpecCard title="漏洞显式暴露" text="右侧专门列出模型风险，要求每条关系都有事实源、落点、状态边界和可追溯证据。" />
              </>
            ) : selected.type === 'v2-canvas-card' ? (
              <>
                <SpecCard title="从画面进入" text="用户点一个不满意的预演画面后进入这里，不需要先理解画布、节点或内部对象。" />
                <SpecCard title="只看下一步" text="每张卡只回答：哪里不对、点什么按钮、点完之后预演画面会发生什么变化。" />
                <SpecCard title="结果自动回去" text="关键图、参考素材和视频候选都默认回到当前预演画面，内部保存位置由系统处理。" />
              </>
            ) : selected.type === 'v2-canvas-insert' ? (
              <>
                <SpecCard title="先选再放" text="用户先从左侧卡片库选一个卡片，再点“加入到画布”，不要求理解拖拽编排。" />
                <SpecCard title="空位明确" text="中间画布只显示可放入的空位和已放入的卡片，避免卡片互相遮挡。" />
                <SpecCard title="加入后可继续改" text="卡片放进画布后，可以继续选中、替换、移除或用工具生成候选结果。" />
              </>
            ) : selected.type === 'entity' ? (
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
                <SpecCard title="结构主干" text="剧本节、情境、内容单元是从文本到 AI 预演的主路径，负责叙事位置和生产颗粒度。" />
                <SpecCard title="资料引用" text="人物、场景、产品、风格等作为创作资料被情境引用，不强行成为所有项目的固定结构层。" />
                <SpecCard title="画布落点" text="每个情境或内容单元都可以打开自己的画布，执行关键帧、素材和视频生成动作。" />
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

function V2IntegratedModelPreviewCanvas() {
  const [activePage, setActivePage] = useState('剧本预演')
  const navigation = [
    { label: '项目首页', meta: '项目状态和下一步' },
    { label: '剧本预演', meta: '导入剧本，一键看全片' },
    { label: '创作资料', meta: '人物、地点、产品、风格' },
    { label: '素材准备', meta: '缺什么、用什么、锁什么' },
    { label: '内容生产', meta: '关键帧、视频片段、版本' },
    { label: '制作任务', meta: '人做、AI 做、待审核' },
    { label: '交付', meta: '预演片、成片、导出' },
    { label: '画布', meta: '从对象进入的创作工作台' },
  ].map((item) => ({ ...item, active: item.label === activePage }))

  const pageCards = [
    { title: '项目首页', userGoal: '知道今天该先做什么', primary: '展示最近变更、阻塞、AI 运行和下一步建议', action: '继续项目' },
    { title: '剧本预演', userGoal: '把剧本变成可播放预览', primary: '上传/粘贴剧本，生成章节、情境和关键帧', action: '一键生成预演' },
    { title: '创作资料', userGoal: '确认 AI 对角色和世界的理解', primary: '按人物、动物、地点、产品、风格分组检查', action: '确认资料' },
    { title: '素材准备', userGoal: '知道正式生产缺哪些输入', primary: '按情境和内容单元列出参考图、视频、声音缺口', action: '补齐素材' },
    { title: '内容生产', userGoal: '把预演画面升级成可用片段', primary: '从关键帧进入视频生成、实拍上传或人工制作', action: '生成片段' },
    { title: '制作任务', userGoal: '分配给人或 AI 执行', primary: '看我的任务、AI 队列、待审核和返工', action: '派发任务' },
    { title: '交付', userGoal: '检查整片是否能交付', primary: '播放预演/成片时间线，检查缺失和版本', action: '导出版本' },
    { title: '画布', userGoal: '在具体对象里做 AI 创作', primary: '从情境、关键帧、素材需求、片段进入上下文画布', action: '打开画布' },
  ] as const

  const rightRail = [
    { title: '用户先看到什么', text: '不是表和模型，而是“剧本已解析、预演可播放、这些地方需要确认”。' },
    { title: '画布什么时候出现', text: '用户点击某个情境、关键帧、素材需求或视频片段时才进入画布。' },
    { title: '实现怎么分步', text: '先做剧本导入和静态预演，再做资料确认、素材缺口、画布生成和任务分配。' },
  ]
  const activeNav = navigation.find((item) => item.active) ?? navigation[1]

  return (
    <div className="w-[1260px] rounded-lg border border-border bg-background text-xs shadow-sm">
      <div className="grid h-[780px] grid-cols-[210px_minmax(0,1fr)_300px] overflow-hidden rounded-lg">
        <aside className="border-r border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              <p className="font-semibold text-foreground">MovScript</p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              AI 影视预演与制作工作台
            </p>
          </div>
          <div className="space-y-1 p-2">
            {navigation.map((item) => (
              <V2NavItem key={item.label} {...item} onClick={() => setActivePage(item.label)} />
            ))}
          </div>
          <div className="border-t border-border p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">今天</p>
            <V2Principle label="剧本预演待确认 3 项" />
            <V2Principle label="缺素材 6 项" />
            <V2Principle label="AI 生成中 2 项" />
            <V2Principle label="待审核 4 项" />
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden bg-background">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Play size={14} className="text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{activePage}</h3>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {activeNav.meta}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="xs" variant="outline" className="h-7">查看说明</Button>
                <Button size="xs" className="h-7">{pageCards.find((page) => page.title === activePage)?.action ?? '继续'}</Button>
              </div>
            </div>
          </div>

          <div className="space-y-4 overflow-y-auto p-4">
            <V2PagePrototype page={activePage} />

            <section className="rounded-md border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">主页面原型地图</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">先定义每个页面帮用户完成什么，再回头拆实现。</p>
                </div>
                <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">Product first</span>
              </div>
              <div className="grid grid-cols-3 gap-2 p-2">
                {pageCards.map((page) => (
                  <V2ProductPageCard
                    key={page.title}
                    {...page}
                    active={activePage === page.title}
                    onClick={() => setActivePage(page.title)}
                  />
                ))}
              </div>
            </section>
          </div>
        </main>

        <aside className="border-l border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <ListChecks size={14} className="text-muted-foreground" />
              <p className="font-semibold text-foreground">从原型到实现</p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              技术拆分放在产品原型之后，而不是反过来。
            </p>
          </div>
          <div className="space-y-3 p-3">
            {rightRail.map((item) => (
              <div key={item.title} className="rounded-md border border-border bg-background px-2.5 py-2">
                <p className="text-xs font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            ))}
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">实施顺序</p>
              <V2ImplementationStep label="1. 剧本导入" value="上传、版本、原文定位" />
              <V2ImplementationStep label="2. 预演生成" value="章节、情境、关键帧候选" />
              <V2ImplementationStep label="3. 人工确认" value="调整理解、顺序和画面" />
              <V2ImplementationStep label="4. 对象画布" value="从情境/素材/片段进入生成" />
              <V2ImplementationStep label="5. 任务和交付" value="分配执行、审核、导出" />
            </section>
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">先不做</p>
              <ContinuityItem label="复杂排期系统" value="先用制作任务列表替代" />
              <ContinuityItem label="全项目自由画布" value="先做对象画布，避免无落点输出" />
              <ContinuityItem label="过细角色字段" value="先用产品可理解的资料卡" />
            </section>
          </div>
        </aside>
      </div>
    </div>
  )
}

function V2AppShellPreview({
  navigation,
}: {
  navigation: ReadonlyArray<{ label: string; meta: string; active?: boolean }>
}) {
  const active = navigation.find((item) => item.active) ?? navigation[0]

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="grid h-[190px] grid-cols-[170px_minmax(0,1fr)_170px]">
        <aside className="border-r border-border bg-background">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-foreground">V2 侧栏</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">用户路径优先</p>
          </div>
          <div className="space-y-0.5 p-2">
            {navigation.map((item) => (
              <div
                key={item.label}
                className={cn(
                  'rounded px-2 py-1.5',
                  item.active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground',
                )}
              >
                <p className="truncate text-[11px] font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 bg-background">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">{active.label}</p>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{active.meta}</p>
            </div>
            <Button size="xs" className="h-7">一键预演</Button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_190px] gap-2 p-2">
            <div className="rounded-md border border-border bg-card">
              <div className="border-b border-border px-2.5 py-1.5">
                <p className="text-[11px] font-medium text-foreground">原文与结构</p>
              </div>
              <div className="space-y-1.5 p-2">
                <V2TinyRow label="ScriptSection" value="雨夜巷口发现旧伞线索" />
                <V2TinyRow label="Situation" value="雨夜巷口对峙" />
                <V2TinyRow label="ContentUnit" value="CU-02 林夏近景" />
              </div>
            </div>
            <div className="rounded-md border border-border bg-card">
              <div className="border-b border-border px-2.5 py-1.5">
                <p className="text-[11px] font-medium text-foreground">当前上下文</p>
              </div>
              <div className="space-y-1.5 p-2">
                <V2TinyRow label="资料" value="林夏 / 旧伞" />
                <V2TinyRow label="素材" value="3 张可用" />
                <V2TinyRow label="输出" value="关键帧候选" warning />
              </div>
            </div>
          </div>
        </main>

        <aside className="border-l border-border bg-background">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-foreground">对象详情</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">选中即显示边界</p>
          </div>
          <div className="space-y-1.5 p-2">
            <V2TinyRow label="事实源" value="Structure" />
            <V2TinyRow label="画布 owner" value="Situation#12" />
            <V2TinyRow label="默认落点" value="Keyframe" />
          </div>
        </aside>
      </div>
    </section>
  )
}

function V2PagePrototype({ page }: { page: string }) {
  if (page === '项目首页') {
    return (
      <V2PageShell
        eyebrow="项目首页"
        title="今天先处理会影响预演和交付的事项"
        description="首页不是数据大盘，而是把项目推进所需的下一步排出来。"
        primary="继续剧本预演"
        secondary="查看风险"
        hero={<V2HomePrototype />}
      />
    )
  }
  if (page === '创作资料') {
    return (
      <V2PageShell
        eyebrow="创作资料"
        title="确认 AI 对人物、地点、产品和风格的理解"
        description="用户按自然分类审查资料，不需要知道底层统一成什么模型。"
        primary="确认选中资料"
        secondary="合并重复项"
        hero={<V2ReferencePrototype />}
      />
    )
  }
  if (page === '素材准备') {
    return (
      <V2PageShell
        eyebrow="素材准备"
        title="先看缺口，再决定上传、生成或复用"
        description="素材页围绕需求矩阵，而不是一堆无上下文图片。"
        primary="生成缺失素材"
        secondary="导入素材"
        hero={<V2AssetPrototype />}
      />
    )
  }
  if (page === '内容生产') {
    return (
      <V2PageShell
        eyebrow="内容生产"
        title="把预演画面升级为视频片段或可交付素材"
        description="镜头只是内容单元的一种；宣传片画面、字幕卡、转场也能在这里生产。"
        primary="生成视频片段"
        secondary="上传实拍"
        hero={<V2ProductionPrototype />}
      />
    )
  }
  if (page === '制作任务') {
    return (
      <V2PageShell
        eyebrow="制作任务"
        title="每个具体工作都可以由人或 AI 完成"
        description="任务页只管执行、审核和返工，不和实体采用状态混在一起。"
        primary="派发 AI 任务"
        secondary="新建人工任务"
        hero={<V2TaskPrototype />}
      />
    )
  }
  if (page === '交付') {
    return (
      <V2PageShell
        eyebrow="交付"
        title="检查整片是否完整，再导出版本"
        description="交付页聚焦时间线、缺失检查、版本和审核。"
        primary="导出预演片"
        secondary="检查缺失"
        hero={<V2DeliveryPrototype />}
      />
    )
  }
  if (page === '画布') {
    return (
      <V2PageShell
        eyebrow="画布"
        title="画布从具体对象进入，负责生成和决策"
        description="这里是管理入口；真正创作时从情境、关键帧、素材需求或片段打开画布。"
        primary="打开最近画布"
        secondary="检查无落点输出"
        hero={<V2CanvasPrototype />}
      />
    )
  }

  return (
    <V2PageShell
      eyebrow="一键预演"
      title="上传剧本，先看到整部片"
      description="系统自动拆出章节、情境和关键画面，生成一条可播放的预演时间线。用户先确认理解，再决定进入素材和视频生产。"
      primary="一键生成预演"
      secondary="导入剧本"
      hero={<V2ScriptPreviewPrototype />}
    />
  )
}

function V2PageShell({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  hero,
}: {
  eyebrow: string
  title: string
  description: string
  primary: string
  secondary: string
  hero: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded border border-primary/25 bg-primary/10 px-2 py-1 text-[11px] text-primary">
            <Sparkles size={12} />
            {eyebrow}
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-normal text-foreground">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="xs" variant="outline" className="h-7">{secondary}</Button>
          <Button size="xs" className="h-7">{primary}</Button>
        </div>
      </div>
      <div className="p-4">{hero}</div>
    </section>
  )
}

function V2ScriptPreviewPrototype() {
  const previewFrames = [
    { title: '雨夜巷口', subtitle: '压抑 / 悬疑 / 林夏与顾言' },
    { title: '旧伞纸条', subtitle: '特写 / 反转 / 母亲线索' },
    { title: '老伞匠铺', subtitle: '转场 / 追查 / 新地点' },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4">
        <div className="min-w-0">
          <div className="grid grid-cols-4 gap-2">
            <V2PrototypeStep index="1" title="导入剧本" text="上传剧本、brief 或文案" active />
            <V2PrototypeStep index="2" title="生成预演" text="AI 生成关键画面和节奏" active />
            <V2PrototypeStep index="3" title="调整确认" text="修改情境、画面和顺序" />
            <V2PrototypeStep index="4" title="进入制作" text="补素材、生成视频、交付" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background p-2">
          <div className="flex h-36 items-center justify-center rounded-md bg-zinc-950 text-white">
            <div className="text-center">
              <Play size={26} className="mx-auto opacity-75" />
              <p className="mt-2 text-sm font-medium">预演片 v1</p>
              <p className="mt-1 text-[11px] text-white/55">01:42 · 12 个关键画面</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {previewFrames.map((frame) => <V2PreviewFrame key={frame.title} {...frame} />)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[240px_minmax(0,1fr)_220px] gap-3">
        <div className="rounded-md border border-border bg-background">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-foreground">剧本原文</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">用户能回看 AI 的依据</p>
          </div>
          <div className="space-y-2 p-3">
            <RawSourceLine line="L340" text="雨越下越大，林夏攥着旧伞站在巷口。" active />
            <RawSourceLine line="L361" text="顾言没有靠近，只问她到底还瞒了什么。" />
            <RawSourceLine line="L378" text="伞骨夹层里滑出一张被雨泡皱的纸条。" />
          </div>
        </div>
        <div className="rounded-md border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-foreground">AI 理解结果</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">用用户语言展示，不暴露底层模型名。</p>
            </div>
            <Button size="xs" variant="outline" className="h-7">全部确认</Button>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3">
            <V2UnderstandingCard title="章节" value="雨夜巷口发现旧伞线索" text="这是一段剧情推进，不是单纯环境描写。" />
            <V2UnderstandingCard title="情境" value="雨夜巷口对峙" text="林夏、顾言、旧伞、暴雨和纸条共同构成画面上下文。" />
            <V2UnderstandingCard title="画面" value="3 个关键画面" text="巷口远景、林夏近景、纸条特写。" warning />
          </div>
        </div>
        <div className="rounded-md border border-border bg-background">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-foreground">下一步</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">产品动作优先</p>
          </div>
          <div className="space-y-2 p-3">
            <V2NextAction title="确认创作资料" text="林夏、顾言、旧伞、雨夜巷口" />
            <V2NextAction title="补齐素材" text="缺林夏伤痕参考和旧伞特写" warning />
            <V2NextAction title="打开画布" text="为纸条特写生成关键帧" />
          </div>
        </div>
      </div>
    </div>
  )
}

function V2HomePrototype() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_240px] gap-3">
      <div className="grid grid-cols-2 gap-3">
        <V2Panel title="继续工作" rows={['剧本预演 v1 有 3 个待确认画面', '林夏伤痕参考缺失，阻塞 CU-02', '旧伞特写关键帧可进入视频生成']} />
        <V2Panel title="项目健康" rows={['预演完成 72%', '素材缺口 6 项', '待审核 4 项']} />
        <V2Panel title="最近更新" rows={['AI 新增 12 个关键画面', '用户确认 5 个创作资料', '顾言侧脸素材被标记不足']} />
        <V2Panel title="快捷入口" rows={['导入新版剧本', '播放预演片', '打开待处理任务']} />
      </div>
      <V2Panel title="今日建议" rows={['先确认雨夜巷口情境', '补齐林夏伤痕参考', '再生成 CU-02 视频片段']} warning />
    </div>
  )
}

function V2ReferencePrototype() {
  return <V2Board columns={[
    { title: '主体', rows: ['林夏 · 主角 · 待确认状态', '顾言 · 对手戏 · 缺侧脸参考', '旧伞 · 线索道具 · 高优先级'] },
    { title: '地点/风格', rows: ['雨夜巷口 · 夜雨状态', '老伞匠铺 · 下一场地点', '冷雨低照度 · 风格约束'] },
    { title: '待处理', rows: ['林夏雨夜受伤状态需确认', '雨夜巷口是否合并旧地点', '旧伞道具需要主视觉'] },
  ]} />
}

function V2AssetPrototype() {
  return <V2Board columns={[
    { title: '缺失', rows: ['林夏伤痕参考 · 阻塞 CU-02', '旧伞特写图 · 阻塞纸条画面', '顾言侧脸 · 阻塞反打镜头'] },
    { title: '候选', rows: ['雨夜巷口环境参考 3 张', '林夏主视觉 v2/v3', '旧伞草图 2 张'] },
    { title: '已锁定', rows: ['林夏基础头像', '冷雨风格参考', '巷口环境基底'] },
  ]} />
}

function V2ProductionPrototype() {
  return <V2Board columns={[
    { title: '可生产', rows: ['CU-01 巷口远景建立', 'CU-03 旧伞纸条特写', '字幕卡：雨夜线索'] },
    { title: '生成中', rows: ['CU-02 林夏近景 v2', '旧伞纸条关键帧 v3'] },
    { title: '待选片', rows: ['CU-01 视频候选 4 个', '老伞匠铺转场 2 个'] },
  ]} />
}

function V2TaskPrototype() {
  return <V2Board columns={[
    { title: '我的任务', rows: ['确认雨夜巷口情境', '审核旧伞道具资料', '选择 CU-01 视频版本'] },
    { title: 'AI 执行', rows: ['生成旧伞特写关键帧', '补齐林夏表情组', '根据预演生成镜头描述'] },
    { title: '待审核', rows: ['林夏主视觉 v3', 'CU-02 近景视频', '预演片 v1'] },
  ]} />
}

function V2DeliveryPrototype() {
  return <V2Board columns={[
    { title: '时间线', rows: ['开场 00:00-00:18', '雨夜巷口 00:18-01:42', '老伞匠铺 01:42-02:10'] },
    { title: '缺失检查', rows: ['CU-02 未锁定', '顾言反打缺视频', '字幕未审核'] },
    { title: '版本', rows: ['预演片 v1 可播放', '成片 cut v0 未生成', '竖屏 9:16 待导出'] },
  ]} />
}

function V2CanvasPrototype() {
  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)_220px] gap-3">
      <V2Panel title="上下文" rows={['Owner：雨夜巷口情境', '引用：林夏、顾言、旧伞', '可用素材：3 张']} />
      <div className="rounded-md border border-border bg-background p-3">
        <div className="grid grid-cols-3 gap-3">
          <V2CanvasMiniCard title="情境卡" text="雨夜巷口对峙" />
          <V2CanvasMiniCard title="AI 动作" text="生成旧伞纸条关键帧" active />
          <V2CanvasMiniCard title="结果卡" text="关键帧候选 v3" />
        </div>
        <div className="mt-3 rounded border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
          输出按钮：设为关键帧 / 保存为素材 / 加入预演
        </div>
      </div>
      <V2Panel title="输出落点" rows={['默认：当前情境关键帧', '备选：旧伞素材', '备选：CU-03 输入']} />
    </div>
  )
}

function V2Panel({ title, rows, warning }: { title: string; rows: string[]; warning?: boolean }) {
  return (
    <div className={cn('rounded-md border bg-background', warning ? 'border-amber-500/25' : 'border-border')}>
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
      </div>
      <div className="space-y-1.5 p-3">
        {rows.map((row) => <V2TinyRow key={row} label="-" value={row} warning={warning} />)}
      </div>
    </div>
  )
}

function V2Board({ columns }: { columns: Array<{ title: string; rows: string[] }> }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {columns.map((column) => <V2Panel key={column.title} title={column.title} rows={column.rows} />)}
    </div>
  )
}

function V2CanvasMiniCard({ title, text, active }: { title: string; text: string; active?: boolean }) {
  return (
    <div className={cn('rounded-md border px-3 py-3', active ? 'border-primary/30 bg-primary/10' : 'border-border bg-card')}>
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{text}</p>
    </div>
  )
}

function V2PrototypeStep({ index, title, text, active }: { index: string; title: string; text: string; active?: boolean }) {
  return (
    <div className={cn('rounded-md border px-2.5 py-2', active ? 'border-primary/25 bg-primary/10' : 'border-border bg-background')}>
      <div className="flex items-center gap-1.5">
        <span className={cn('flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{index}</span>
        <p className="truncate text-xs font-semibold text-foreground">{title}</p>
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

function V2PreviewFrame({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded border border-border bg-card px-2 py-1.5">
      <p className="truncate text-[10px] font-medium text-foreground">{title}</p>
      <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function V2UnderstandingCard({ title, value, text, warning }: { title: string; value: string; text: string; warning?: boolean }) {
  return (
    <div className={cn('rounded-md border px-2.5 py-2', warning ? 'border-amber-500/25 bg-amber-500/10' : 'border-border bg-background')}>
      <p className="text-[10px] text-muted-foreground">{title}</p>
      <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
      <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

function V2NextAction({ title, text, warning }: { title: string; text: string; warning?: boolean }) {
  return (
    <div className={cn('rounded-md border px-2.5 py-2', warning ? 'border-amber-500/25 bg-amber-500/10' : 'border-border bg-background')}>
      <div className="flex items-center gap-1.5">
        {warning ? <AlertTriangle size={12} className="text-amber-600" /> : <CheckCircle2 size={12} className="text-emerald-600" />}
        <p className="truncate text-xs font-medium text-foreground">{title}</p>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

function V2ProductPageCard({
  title,
  userGoal,
  primary,
  action,
  active,
  onClick,
}: {
  title: string
  userGoal: string
  primary: string
  action: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border bg-background px-2.5 py-2 text-left transition-colors',
        active ? 'border-primary/30 bg-primary/10 ring-1 ring-primary/15' : 'border-border hover:bg-muted/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-semibold text-foreground">{title}</p>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{action}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-foreground">{userGoal}</p>
      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{primary}</p>
    </button>
  )
}

function V2ImplementationStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1.5 rounded-md border border-border bg-background px-2 py-1.5">
      <p className="truncate text-[11px] font-medium text-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{value}</p>
    </div>
  )
}

function V2TinyRow({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1">
      <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <span className={cn(
        'min-w-0 flex-1 truncate text-[10px] font-medium',
        warning ? 'text-amber-700 dark:text-amber-300' : 'text-foreground',
      )}>{value}</span>
    </div>
  )
}

function V2PageCard({
  title,
  object,
  defaultView,
  canvas,
  risk,
}: {
  title: string
  object: string
  defaultView: string
  canvas: string
  risk: string
}) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-semibold text-foreground">{title}</p>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">page</span>
      </div>
      <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{object}</p>
      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{defaultView}</p>
      <div className="mt-2 rounded border border-primary/20 bg-primary/5 px-1.5 py-1">
        <p className="truncate text-[10px] text-muted-foreground">画布：{canvas}</p>
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">风险：{risk}</p>
    </div>
  )
}

function V2NavItem({ label, meta, active, onClick }: { label: string; meta: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-md px-2.5 py-2 text-left transition-colors',
        active ? 'bg-primary/10 text-foreground ring-1 ring-primary/20' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <p className="truncate text-xs font-medium">{label}</p>
      <p className="mt-0.5 truncate text-[10px] opacity-75">{meta}</p>
    </button>
  )
}

function V2Principle({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground">
      <CheckCircle2 size={12} className="shrink-0 text-emerald-600" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </div>
  )
}

function V2Metric({ label, value, caption, tone }: { label: string; value: string; caption: string; tone: 'sky' | 'teal' | 'amber' }) {
  return (
    <div className={cn(
      'rounded-md border px-3 py-2',
      tone === 'sky' && 'border-sky-500/25 bg-sky-500/10',
      tone === 'teal' && 'border-teal-500/25 bg-teal-500/10',
      tone === 'amber' && 'border-amber-500/25 bg-amber-500/10',
    )}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-none text-foreground">{value}</p>
      <p className="mt-1 truncate text-[10px] text-muted-foreground">{caption}</p>
    </div>
  )
}

function V2Column({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-2 p-2">{children}</div>
    </section>
  )
}

function V2ObjectCard({ label, title, meta, tone }: { label: string; title: string; meta: string; tone: 'sky' | 'violet' | 'amber' | 'teal' | 'rose' | 'emerald' }) {
  return (
    <div className={cn(
      'rounded-md border px-2.5 py-2',
      tone === 'sky' && 'border-sky-500/25 bg-sky-500/10',
      tone === 'violet' && 'border-violet-500/25 bg-violet-500/10',
      tone === 'amber' && 'border-amber-500/25 bg-amber-500/10',
      tone === 'teal' && 'border-teal-500/25 bg-teal-500/10',
      tone === 'rose' && 'border-rose-500/25 bg-rose-500/10',
      tone === 'emerald' && 'border-emerald-500/25 bg-emerald-500/10',
    )}>
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded border border-border/70 bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 truncate text-xs font-medium text-foreground">{title}</p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{meta}</p>
    </div>
  )
}

function V2RelationRow({ relation, meaning, boundary, entry }: { relation: string; meaning: string; boundary: string; entry: string }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-3 border-b border-border/70 px-3 py-2.5 last:border-b-0">
      <p className="truncate text-xs font-medium text-foreground">{relation}</p>
      <p className="truncate text-[11px] text-muted-foreground">{meaning}</p>
      <p className="truncate text-[11px] text-muted-foreground">{boundary}</p>
      <p className="truncate text-[11px] text-muted-foreground">{entry}</p>
    </div>
  )
}

function V2RiskCard({ title, problem, guardrail, severity }: { title: string; problem: string; guardrail: string; severity: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{title}</p>
        <span className={cn(
          'shrink-0 rounded border px-1.5 py-0.5 text-[10px]',
          severity === '高' ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        )}>
          {severity}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{problem}</p>
      <div className="mt-2 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5">
        <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">约束</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{guardrail}</p>
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

  const situations = [
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
              <p className="font-semibold text-foreground">剧本节</p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              原文先切成可确认的语义段落，不直接变成镜头。
            </p>
          </div>

          <div className="space-y-2 p-3">
            {sections.map((section, index) => (
              <ScriptSectionPreviewCard key={section.id} index={index + 1} {...section} />
            ))}
          </div>

          <div className="border-t border-border p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">结构规则</p>
            <ScriptStructureCheck label="剧本节保留 source span" ok />
            <ScriptStructureCheck label="情境从剧本节派生" ok />
            <ScriptStructureCheck label="内容单元进入预演时间线" />
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden bg-background">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ListChecks size={14} className="text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">ScriptSection 到 Situation 到 ContentUnit</h3>
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
                <p className="font-semibold text-foreground">情境候选</p>
                <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">来自选中剧本节</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {situations.map((situation) => (
                  <SituationPreviewCard key={situation.id} {...situation} />
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
              人物/场景/产品仍存在，只是作为可复用资料被情境引用。
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
              <ContinuityItem label="剧本节" value="文本来源和叙事位置" />
              <ContinuityItem label="情境" value="AI 理解画面的上下文" />
              <ContinuityItem label="内容单元" value="关键帧/视频生产颗粒度" />
              <ContinuityItem label="创作资料" value="主体、地点、产品、风格等复用事实" />
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">画布入口</p>
              <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2">
                <p className="text-[11px] font-medium text-foreground">打开「雨夜巷口对峙」情境画布</p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  画布中放置情境卡、资料引用卡、关键帧动作和生成结果。
                </p>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ScriptSectionPreviewCard({
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

function SituationPreviewCard({
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
              <ContinuityItem label="空素材需求" value="进入素材阶段后再生成" />
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

function V2CanvasCardsPreviewCanvas() {
  const [selectedCardId, setSelectedCardId] = useState('key-image-tool')
  const [selectedActionId, setSelectedActionId] = useState('run-key-image-tool')
  const cards: V2UseCaseCard[] = [
    {
      id: 'scene-understanding',
      title: '这一段发生什么',
      label: '待确认',
      icon: MapPin,
      tone: 'sky' as const,
      summary: '雨夜老城区窄巷，林夏攥着旧伞，与顾言保持距离对峙。',
      meta: '系统对剧本这一段的理解',
      slots: [
        { label: '来自', value: '第 3 段剧本' },
        { label: '包含', value: '林夏 / 顾言 / 旧伞' },
        { label: '下一步', value: '确认后生成画面' },
      ],
      actions: [
        { id: 'edit-understanding', label: '改一下理解', effect: '打开右侧编辑面板，用户用自然语言改“这里发生了什么”。保存后，相关画面会提示需要重新生成。' },
        { id: 'confirm', label: '确认理解', effect: '卡片状态变为“已确认”，系统把这段理解用于生成下面的预演画面。用户不会看到内部对象名。' },
      ],
    },
    {
      id: 'preview-shot',
      title: '预演里的一个画面',
      label: '可生成',
      icon: Clapperboard,
      tone: 'emerald' as const,
      summary: '旧伞伞骨特写，纸条从缝隙滑出，雨水打湿纸面。',
      meta: '会出现在预演时间线里',
      slots: [
        { label: '位置', value: '第 3 个画面' },
        { label: '时长', value: '2 秒' },
        { label: '当前状态', value: '可做成视频' },
      ],
      actions: [
        { id: 'edit-shot', label: '改画面', effect: '打开画面描述编辑器，用户调整画面、景别、运动和时长。保存后只影响这个画面，不改剧本原文。' },
        { id: 'make-key-image', label: '生成关键图', effect: '启动生成，右侧出现“生成中”。完成后新增一张关键图候选，用户需要点击“采用”。' },
      ],
    },
    {
      id: 'key-image',
      title: '关键图候选',
      label: '待采用',
      icon: ImagePlus,
      tone: 'amber' as const,
      summary: '纸条从伞骨缝隙滑出，雨水打湿纸面，画面偏冷。',
      meta: '这张图可以替换当前预演画面',
      slots: [
        { label: '属于', value: '第 3 个画面' },
        { label: '候选', value: '2 / 4' },
        { label: '清晰度', value: '纸条可读' },
      ],
      actions: [
        { id: 'use-key-image', label: '采用这张', effect: '预演时间线第 3 个画面的缩略图立即换成这张图，并标记为“已采用”。其他候选保留在历史里。' },
        { id: 'regen-key-image', label: '再生成', effect: '保留当前候选，同时基于同一画面描述再生成一组新图。用户不会丢失已生成结果。' },
      ],
    },
    {
      id: 'missing-asset',
      title: '还缺一个素材',
      label: '缺失',
      icon: Inbox,
      tone: 'rose' as const,
      summary: '林夏雨夜受伤状态，正面半身伤痕参考缺失。',
      meta: '缺它会影响后续生成稳定性',
      slots: [
        { label: '用于', value: '近景和半身画面' },
        { label: '现在', value: '没有可用素材' },
        { label: '建议', value: '上传或生成参考' },
      ],
      actions: [
        { id: 'upload-asset', label: '上传素材', effect: '打开上传弹窗。上传后素材进入“候选”，用户还需要点“锁定使用”，避免误把随手上传的图用于生成。' },
        { id: 'make-reference', label: '生成参考', effect: '用当前人物和这一段剧情生成参考图。完成后出现在这张卡下面，等待用户选择。' },
      ],
    },
    {
      id: 'character-look',
      title: '人物当前样子',
      label: '需保持',
      icon: Users,
      tone: 'violet' as const,
      summary: '林夏：湿透风衣、左颧擦伤、压抑愤怒、攥着旧伞。',
      meta: '告诉系统这几段里人物要保持一致',
      slots: [
        { label: '人物', value: '林夏' },
        { label: '范围', value: '接下来 3 个画面' },
        { label: '重点', value: '伤痕和湿发' },
      ],
      actions: [
        { id: 'edit-look', label: '改样子', effect: '打开人物状态编辑，用户改服装、伤痕、情绪等自然语言描述。保存后提示哪些画面会受到影响。' },
        { id: 'lock-look', label: '保持一致', effect: '接下来相关画面生成时都会使用这个人物状态。界面显示“已保持”，但不要求用户理解底层状态对象。' },
      ],
    },
    {
      id: 'video-candidate',
      title: '生成的视频候选',
      label: '待选择',
      icon: Video,
      tone: 'zinc' as const,
      summary: '运动自然，但纸条信息不够清晰，还不适合作为最终片段。',
      meta: '生成完成后，需要用户决定用不用',
      slots: [
        { label: '属于', value: '第 3 个画面' },
        { label: '现在', value: '只是候选' },
        { label: '问题', value: '纸条不清楚' },
      ],
      actions: [
        { id: 'use-video', label: '用这个视频', effect: '第 3 个画面从关键图预演切换成这段视频，时间线显示“已用视频”。生成任务本身不会被当成采用决定。' },
        { id: 'redo-video', label: '返工', effect: '打开返工说明输入框，默认带入“纸条不清楚”。提交后生成一个新候选，旧视频仍保留。' },
      ],
    },
  ]
  const toolCards: V2UseCaseCard[] = [
    {
      id: 'key-image-tool',
      title: '关键图生成',
      label: '工具',
      icon: Sparkles,
      tone: 'amber' as const,
      summary: '读取画面描述、人物样子和素材参考，生成一组关键图候选。',
      meta: '工具只负责生成，不负责采用',
      slots: [
        { label: '读取', value: '画面 / 人物 / 素材' },
        { label: '生成', value: '关键图候选 4 张' },
        { label: '之后', value: '用户选择采用' },
      ],
      actions: [
        { id: 'run-key-image-tool', label: '生成关键图', effect: '工具读取左侧几张卡的内容，生成 4 张关键图候选。生成完成后，结果出现在“关键图候选”卡里，用户仍需点“采用这张”。' },
      ],
    },
    {
      id: 'video-tool',
      title: '图生视频',
      label: '工具',
      icon: Video,
      tone: 'zinc' as const,
      summary: '读取已采用关键图、动作说明和时长，生成一个视频候选。',
      meta: '采用关键图后才建议运行',
      slots: [
        { label: '读取', value: '已采用关键图' },
        { label: '动作', value: '纸条滑出' },
        { label: '生成', value: '视频候选 v1' },
      ],
      actions: [
        { id: 'run-video-tool', label: '生成视频', effect: '采用关键图后，这个工具变为可运行。运行完成后，生成的视频进入“生成的视频候选”卡，用户再决定是否使用。' },
      ],
    },
  ]
  const allInteractiveItems = [...cards, ...toolCards]
  const selectedCard = allInteractiveItems.find((card) => card.id === selectedCardId) ?? cards[0]
  const selectedAction = selectedCard.actions.find((action) => action.id === selectedActionId) ?? selectedCard.actions[0]
  const SelectedCardIcon = selectedCard.icon
  const useCaseSteps = [
    '用户发现纸条特写不清楚',
    '检查这一段理解和人物状态',
    '补齐伤痕参考素材',
    '用关键图工具生成新候选',
    '采用关键图后生成视频候选',
  ]

  function selectCard(cardId: string) {
    const nextCard = allInteractiveItems.find((card) => card.id === cardId) ?? cards[0]
    setSelectedCardId(cardId)
    setSelectedActionId(nextCard.actions[0]?.id ?? '')
  }

  return (
    <div className="w-[1340px] rounded-lg border border-border bg-background text-xs shadow-sm">
      <div className="grid h-[760px] grid-cols-[220px_minmax(0,1fr)_300px] overflow-hidden rounded-lg">
        <aside className="border-r border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <Play size={14} className="text-primary" />
              <p className="font-semibold text-foreground">具体用例</p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              第 3 个画面里纸条看不清，用户要重新生成关键图，再生成视频候选。
            </p>
          </div>
          <div className="space-y-2 p-3">
            <V2CanvasMiniLane title="用户目标" items={['让纸条信息更清楚', '保持林夏受伤状态一致', '拿到可用的视频候选']} />
            <V2CanvasMiniLane title="操作步骤" items={useCaseSteps} muted />
          </div>
          <div className="border-t border-border p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">用户只需要知道</p>
            <V2CanvasRule label="输入从哪来" value="理解、人物、素材、画面描述" />
            <V2CanvasRule label="工具做什么" value="生成关键图 / 生成视频" />
            <V2CanvasRule label="结果怎么用" value="采用后回到当前画面" />
          </div>
        </aside>

        <main className="min-w-0 overflow-auto bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:20px_20px] p-5">
          <div className="mb-4 rounded-lg border border-border bg-card px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">正在修改：第 3 个画面 · 旧伞纸条特写</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  卡片提供上下文和决策，工具负责生成；工具结果不会自动采用，必须由用户点“采用”。
                </p>
              </div>
              <Button size="xs" className="h-7">播放当前预演</Button>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]">流程</span>
                <span>这一段发生什么</span>
                <ArrowRight size={11} />
                <span>关键图生成</span>
                <ArrowRight size={11} />
                <span>关键图候选</span>
                <ArrowRight size={11} />
                <span>图生视频</span>
                <ArrowRight size={11} />
                <span>视频候选</span>
              </div>
            </div>

            <div className="grid min-w-[1160px] grid-cols-[270px_270px_240px_270px] gap-4">
              <section className="space-y-4">
                <V2LaneTitle title="理解和约束" note="先让系统知道这一段是什么、人物要保持成什么样。" />
                <V2CanvasObjectCard card={cards[0]} selected={selectedCardId === cards[0].id} onSelect={selectCard} onAction={setSelectedActionId} selectedActionId={selectedActionId} />
                <V2CanvasObjectCard card={cards[4]} selected={selectedCardId === cards[4].id} compact onSelect={selectCard} onAction={setSelectedActionId} selectedActionId={selectedActionId} />
                <V2CanvasObjectCard card={cards[3]} selected={selectedCardId === cards[3].id} compact onSelect={selectCard} onAction={setSelectedActionId} selectedActionId={selectedActionId} />
              </section>

              <section className="space-y-4">
                <V2LaneTitle title="当前画面" note="用户真正想改的对象，点进去改画面内容，不改剧本原文。" />
                <V2CanvasObjectCard card={cards[1]} selected={selectedCardId === cards[1].id} onSelect={selectCard} onAction={setSelectedActionId} selectedActionId={selectedActionId} />
              </section>

              <section className="space-y-4">
                <V2LaneTitle title="生成工具" note="工具读取卡片内容，但不会直接改结果。" />
                <V2UseCaseToolCard
                  card={toolCards[0]}
                  subtitle="读取画面描述、人物样子、素材参考"
                  status="可运行"
                  inputs={['画面描述', '人物当前样子', '旧伞 / 伤痕参考']}
                  outputs={['关键图候选 4 张']}
                  selected={selectedCardId === 'key-image-tool'}
                  onSelect={selectCard}
                  selectedActionId={selectedActionId}
                  onAction={setSelectedActionId}
                />
                <V2UseCaseToolCard
                  card={toolCards[1]}
                  subtitle="读取已采用关键图和动作说明"
                  status="待关键图"
                  inputs={['已采用关键图', '2 秒时长', '纸条滑出动作']}
                  outputs={['视频候选 v1']}
                  selected={selectedCardId === 'video-tool'}
                  onSelect={selectCard}
                  selectedActionId={selectedActionId}
                  onAction={setSelectedActionId}
                />
              </section>

              <section className="space-y-4">
                <V2LaneTitle title="结果候选" note="工具跑完后，结果先落到这里，用户再决定要不要采用。" />
                <V2CanvasObjectCard card={cards[2]} selected={selectedCardId === cards[2].id} compact onSelect={selectCard} onAction={setSelectedActionId} selectedActionId={selectedActionId} />
                <V2CanvasObjectCard card={cards[5]} selected={selectedCardId === cards[5].id} compact onSelect={selectCard} onAction={setSelectedActionId} selectedActionId={selectedActionId} />
              </section>
            </div>
          </div>
        </main>

        <aside className="border-l border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <p className="font-semibold text-foreground">点击后发生什么</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              原型里点卡片或按钮，右侧说明用户会看到的反馈。
            </p>
          </div>
          <div className="space-y-3 p-3">
            <section className="rounded-lg border border-border bg-background px-3 py-3">
              <div className="flex items-center gap-2">
                <SelectedCardIcon size={14} className={V2_CANVAS_CARD_TONES[selectedCard.tone].text} />
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{selectedCard.title}</p>
                <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">{selectedCard.label}</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{selectedCard.summary}</p>
              <div className="mt-2 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] text-muted-foreground">
                点这张卡：右侧打开它的详情，主画布高亮它和相关连线。卡片负责上下文、判断和采用，工具负责生成。
              </div>
            </section>
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">这个按钮的效果</p>
              <div className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-3">
                <p className="text-xs font-semibold text-foreground">{selectedAction.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{selectedAction.effect}</p>
              </div>
            </section>
            <V2CanvasCardChecklist title="原型里的可点击点" items={cards.flatMap((card) => [card.title, ...card.actions.map((action) => action.label)])} />
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">后台才关心</p>
              <V2CanvasRule label="保存位置" value="系统自动记，不展示术语" />
              <V2CanvasRule label="生成记录" value="放历史和审计里" />
              <V2CanvasRule label="内部对象" value="调试模式再显示" />
            </section>
          </div>
        </aside>
      </div>
    </div>
  )
}

type V2CanvasCardTone = 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'zinc'

type V2UseCaseCard = {
  id: string
  title: string
  label: string
  icon: ElementType
  tone: V2CanvasCardTone
  summary: string
  meta: string
  slots: Array<{ label: string; value: string }>
  actions: Array<{ id: string; label: string; effect: string }>
}

function V2CanvasInsertPreviewCanvas() {
  const [selectedLibraryCardId, setSelectedLibraryCardId] = useState('scene-card')
  const [selectedCanvasSlotId, setSelectedCanvasSlotId] = useState('slot-shot')
  const [lastInsertedCardId, setLastInsertedCardId] = useState<string | null>('shot-card')

  const libraryCards = [
    {
      id: 'scene-card',
      title: '这一段发生什么',
      label: '理解卡',
      tone: 'sky' as const,
      summary: '雨夜老城区窄巷，林夏与顾言对峙，纸条即将出现。',
      badge: '适合先放入画布',
      action: '加入到画布',
    },
    {
      id: 'shot-card',
      title: '预演里的一个画面',
      label: '画面卡',
      tone: 'emerald' as const,
      summary: '旧伞纸条特写，2 秒，等待关键图和视频候选。',
      badge: '最常放入画布',
      action: '加入到画布',
    },
    {
      id: 'asset-card',
      title: '还缺一个素材',
      label: '素材卡',
      tone: 'rose' as const,
      summary: '伤痕参考缺失，需要先补齐再做近景。',
      badge: '适合先补素材',
      action: '加入到画布',
    },
    {
      id: 'tool-card',
      title: '关键图生成',
      label: '工具卡',
      tone: 'amber' as const,
      summary: '读取画面描述、人物样子和素材参考，生成关键图候选。',
      badge: '加入后可直接生成',
      action: '加入到画布',
    },
  ] as const

  const canvasSlots = [
    { id: 'slot-understanding', title: '上方空位', note: '放理解和约束' },
    { id: 'slot-shot', title: '中间空位', note: '放当前画面' },
    { id: 'slot-tool', title: '右侧空位', note: '放工具' },
    { id: 'slot-result', title: '结果区', note: '放关键图 / 视频候选' },
  ]

  const selectedLibraryCard = libraryCards.find((card) => card.id === selectedLibraryCardId) ?? libraryCards[0]
  const selectedCanvasSlot = canvasSlots.find((slot) => slot.id === selectedCanvasSlotId) ?? canvasSlots[0]

  return (
    <div className="w-[1360px] rounded-lg border border-border bg-background text-xs shadow-sm">
      <div className="grid h-[760px] grid-cols-[250px_minmax(0,1fr)_310px] overflow-hidden rounded-lg">
        <aside className="border-r border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <Plus size={14} className="text-primary" />
              <p className="font-semibold text-foreground">从卡片库加入</p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              用户先选一个卡片，再点“加入到画布”。
            </p>
          </div>
          <div className="space-y-2 p-3">
            {libraryCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setSelectedLibraryCardId(card.id)
                  setLastInsertedCardId(card.id)
                }}
                className={cn(
                  'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                  selectedLibraryCardId === card.id ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/50',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{card.title}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{card.label}</p>
                  </div>
                  <span className={cn('rounded px-1.5 py-0.5 text-[9px]', selectedLibraryCardId === card.id ? 'bg-background text-foreground' : 'bg-muted text-muted-foreground')}>
                    {card.badge}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{card.summary}</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 overflow-auto bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:20px_20px] p-5">
          <div className="mb-4 rounded-lg border border-border bg-card px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">把卡片加入画布</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  先选左侧卡片，再点中间的一个空位，卡片就会出现在画布里。
                </p>
              </div>
              <Button size="xs" className="h-7">清空画布</Button>
            </div>
          </div>

          <div className="grid min-w-[960px] grid-cols-[220px_minmax(0,1fr)] gap-4">
            <div className="space-y-4">
              <V2LaneTitle title="步骤 1" note="先选卡片" />
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs font-semibold text-foreground">{selectedLibraryCard.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{selectedLibraryCard.summary}</p>
                <div className="mt-3 rounded-md border border-border bg-background px-2 py-2 text-[11px] text-muted-foreground">
                  点击后会选中这张卡，再把它加入中间画布。
                </div>
              </div>

              <V2LaneTitle title="步骤 2" note="再点“加入到画布”" />
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs font-semibold text-foreground">加入按钮</p>
                <p className="mt-1 text-[11px] text-muted-foreground">按钮会把当前卡片放进你在中间选中的空位。</p>
                <Button
                  size="sm"
                  className="mt-3 h-8 w-full justify-center"
                  onClick={() => setLastInsertedCardId(selectedLibraryCard.id)}
                >
                  <Plus size={13} />
                  {selectedLibraryCard.action}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <V2LaneTitle title="步骤 3" note="在中间点一个空位" />
              <div className="grid grid-cols-2 gap-3">
                {canvasSlots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setSelectedCanvasSlotId(slot.id)}
                    className={cn(
                      'min-h-[128px] rounded-lg border p-3 text-left transition-colors',
                      selectedCanvasSlotId === slot.id ? 'border-primary bg-primary/10' : 'border-dashed border-border bg-background hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">{slot.title}</p>
                      <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[9px] text-muted-foreground">{slot.note}</span>
                    </div>
                    <div className="mt-3 flex h-16 items-center justify-center rounded-md border border-border bg-card px-3 text-[11px] text-muted-foreground">
                      {lastInsertedCardId && selectedCanvasSlotId === slot.id ? (
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{libraryCards.find((card) => card.id === lastInsertedCardId)?.title}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">已加入这个空位</p>
                        </div>
                      ) : (
                        <span>点击后可放入卡片</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>

        <aside className="border-l border-border bg-card">
          <div className="border-b border-border px-3 py-3">
            <p className="font-semibold text-foreground">加入后发生什么</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              右侧只解释用户能看懂的变化，不讲内部对象名。
            </p>
          </div>
          <div className="space-y-3 p-3">
            <section className="rounded-lg border border-border bg-background px-3 py-3">
              <p className="text-xs font-semibold text-foreground">{selectedLibraryCard.title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{selectedLibraryCard.summary}</p>
              <div className="mt-2 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] text-muted-foreground">
                加入后会出现在你选中的“{selectedCanvasSlot.title}”。
              </div>
            </section>
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">加入后效果</p>
              <V2CanvasRule label="卡片状态" value="出现在画布里，可继续点选" />
              <V2CanvasRule label="右侧反馈" value="显示当前卡片可以做什么" />
              <V2CanvasRule label="后续动作" value="生成关键图、补素材、生成视频" />
            </section>
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">如果再点一次</p>
              <V2CanvasRule label="同类卡片" value="会替换或新增到当前画布区" />
              <V2CanvasRule label="不同卡片" value="可以放到别的空位" />
            </section>
          </div>
        </aside>
      </div>
    </div>
  )
}

function V2CanvasObjectCard({
  card,
  selected,
  compact,
  selectedActionId,
  onSelect,
  onAction,
}: {
  card: V2UseCaseCard
  selected?: boolean
  compact?: boolean
  selectedActionId?: string
  onSelect?: (cardId: string) => void
  onAction?: (actionId: string) => void
}) {
  const Icon = card.icon
  const tone = V2_CANVAS_CARD_TONES[card.tone]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(card.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect?.(card.id)
      }}
      className={cn(
        'relative overflow-visible rounded-lg border bg-card text-left shadow-sm transition-all',
        compact ? 'w-[250px]' : 'w-[270px]',
        selected ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/15' : 'border-border',
      )}
    >
      <V2CanvasPort side="left" tone="target" className="top-[38px]" />
      <V2CanvasPort side="right" tone="source" className="top-[38px]" />
      <header className={cn('border-b px-3 py-2.5', tone.bg)}>
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/85">
            <Icon size={15} className={tone.text} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{card.title}</p>
              <span className="shrink-0 rounded border border-border bg-background/80 px-1.5 py-0.5 text-[9px] text-muted-foreground">{card.label}</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{card.meta}</p>
          </div>
        </div>
      </header>
      <div className="space-y-2 px-3 py-2.5">
        <p className="line-clamp-2 min-h-[34px] text-[11px] leading-relaxed text-foreground">{card.summary}</p>
        <div className="space-y-1">
          {card.slots.slice(0, compact ? 2 : 3).map((slot) => (
            <div key={slot.label} className="relative flex h-7 items-center gap-2 rounded-md border border-border bg-background px-2 text-[10px]">
              <V2CanvasPort side="left" tone="neutral" compact />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{slot.label}</span>
              <span className="max-w-[118px] truncate font-medium text-foreground">{slot.value}</span>
              <V2CanvasPort side="right" tone="source" compact />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {card.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onSelect?.(card.id)
                onAction?.(action.id)
              }}
              className={cn(
                'relative flex h-7 items-center justify-center rounded-md border px-2 text-[10px] font-medium hover:bg-muted',
                selectedActionId === action.id && selected
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-muted/30 text-foreground',
              )}
            >
              {action.label}
              <V2CanvasPort side="right" tone="source" compact />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function V2UseCaseToolCard({
  card,
  subtitle,
  status,
  inputs,
  outputs,
  selected,
  selectedActionId,
  onSelect,
  onAction,
}: {
  card: V2UseCaseCard
  subtitle: string
  status: string
  inputs: string[]
  outputs: string[]
  selected?: boolean
  selectedActionId?: string
  onSelect?: (cardId: string) => void
  onAction?: (actionId: string) => void
}) {
  const Icon = card.icon
  const tone = V2_CANVAS_CARD_TONES[card.tone]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(card.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect?.(card.id)
      }}
      className={cn(
        'relative w-[220px] overflow-visible rounded-lg border bg-card text-left shadow-sm transition-all',
        selected ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/15' : 'border-border',
      )}
    >
      <V2CanvasPort side="left" tone="target" className="top-[38px]" />
      <V2CanvasPort side="right" tone="source" className="top-[38px]" />
      <header className={cn('border-b px-3 py-2.5', tone.bg)}>
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/85">
            <Icon size={15} className={tone.text} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{card.title}</p>
              <span className="shrink-0 rounded border border-border bg-background/80 px-1.5 py-0.5 text-[9px] text-muted-foreground">{status}</span>
            </div>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </header>
      <div className="space-y-2 px-3 py-2.5">
        <V2UseCaseToolSection title="读取" items={inputs} />
        <V2UseCaseToolSection title="生成" items={outputs} />
        {card.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onSelect?.(card.id)
              onAction?.(action.id)
            }}
            className={cn(
              'relative flex h-7 w-full items-center justify-center rounded-md border px-2 text-[10px] font-medium hover:bg-muted',
              selectedActionId === action.id && selected
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-muted/30 text-foreground',
            )}
          >
            {action.label}
            <V2CanvasPort side="right" tone="source" compact />
          </button>
        ))}
      </div>
    </div>
  )
}

function V2UseCaseToolSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item} className="rounded-md border border-border bg-background px-2 py-1 text-[10px] text-foreground">
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function V2LaneTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{note}</p>
    </div>
  )
}

const V2_CANVAS_CARD_TONES: Record<V2CanvasCardTone, { bg: string; text: string }> = {
  sky: { bg: 'bg-sky-500/10', text: 'text-sky-600' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-600' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-600' },
  rose: { bg: 'bg-rose-500/10', text: 'text-rose-600' },
  violet: { bg: 'bg-violet-500/10', text: 'text-violet-600' },
  zinc: { bg: 'bg-zinc-500/10', text: 'text-zinc-600 dark:text-zinc-300' },
}

function V2CanvasPort({ side, tone, compact, className }: { side: 'left' | 'right'; tone: 'target' | 'source' | 'neutral'; compact?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'absolute z-10 rounded-full border-2',
        compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5',
        side === 'left' ? (compact ? '-left-1.5 top-1/2 -translate-y-1/2' : '-left-2') : (compact ? '-right-1.5 top-1/2 -translate-y-1/2' : '-right-2'),
        tone === 'target' && 'border-sky-500 bg-sky-500',
        tone === 'source' && 'border-primary bg-primary',
        tone === 'neutral' && 'border-border bg-card',
        className,
      )}
    />
  )
}

function V2CanvasFlowPath({ d, label, labelX, labelY }: { d: string; label: string; labelX: number; labelY: number }) {
  return (
    <>
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeDasharray="6 5" markerEnd="url(#v2-card-flow-arrow)" />
      <text x={labelX} y={labelY} className="fill-muted-foreground text-[10px]">{label}</text>
    </>
  )
}

function V2CanvasDecisionPath({ d, label, labelX, labelY }: { d: string; label: string; labelX: number; labelY: number }) {
  return (
    <>
      <path d={d} fill="none" stroke="rgb(16 185 129)" strokeWidth="2.5" markerEnd="url(#v2-card-decision-arrow)" />
      <text x={labelX} y={labelY} className="fill-muted-foreground text-[10px]">{label}</text>
    </>
  )
}

function V2CanvasMiniLane({ title, items, muted }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <section>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item} className={cn('rounded-md border px-2 py-1.5 text-[11px]', muted ? 'border-border bg-background text-muted-foreground' : 'border-primary/20 bg-primary/10 text-foreground')}>
            {item}
          </div>
        ))}
      </div>
    </section>
  )
}

function V2CanvasCardChecklist({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
            <CheckCircle2 size={12} className="shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{item}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function V2CanvasRule({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1.5 rounded-md border border-border bg-background px-2 py-1.5 last:mb-0">
      <p className="truncate text-[11px] font-medium text-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{value}</p>
    </div>
  )
}

function AgentAssistantPreviewCanvas() {
  return (
    <div className="max-w-[860px]">
      <AgentWorkSurface className="h-[430px] min-h-[430px] shadow-sm">
        <AgentWorkHeader>
          <AgentWorkTitleBlock>
            <p>分场创作助手</p>
            <p>基于当前实体、资源和权限生成可执行创作计划</p>
          </AgentWorkTitleBlock>
          <AgentWorkActions>
            <AgentStatus state="running">规划中</AgentStatus>
            <Button size="icon-sm" variant="ghost" aria-label="Settings">
              <Wrench size={14} />
            </Button>
          </AgentWorkActions>
        </AgentWorkHeader>

        <AgentWorkBody>
          <AgentWorkLane>
            <AgentContextBar>
              <AgentContextChip tone="accent"><FileText size={12} /> 08 雨夜巷口</AgentContextChip>
              <AgentContextChip><Database size={12} /> 角色 2</AgentContextChip>
              <AgentContextChip tone="success"><ShieldCheck size={12} /> 建议模式</AgentContextChip>
              <AgentContextChip><Clock size={12} /> 最近 6 次改动</AgentContextChip>
            </AgentContextBar>

            <AgentInstructionCard title="当前指令" meta="导演 · 刚刚">
              基于当前分场规划 3 个可生成分镜，检查角色参考是否足够；缺失资源只列为待确认项，不直接改写实体。
            </AgentInstructionCard>

            <AgentRunCard tone="accent" selected eyebrow="PLAN" title="分镜生成前检查" meta="3 步">
              <AgentToolStep state="done">
                <span>读取分场事实和关系</span>
                <span>0.4s</span>
              </AgentToolStep>
              <AgentToolStep state="running">
                <span>检查角色参考绑定</span>
                <span>运行中</span>
              </AgentToolStep>
              <AgentToolStep state="pending">
                <span>草拟分镜创建动作</span>
                <span>待执行</span>
              </AgentToolStep>
            </AgentRunCard>

            <AgentRunCard eyebrow="CONTEXT" title="本轮输入契约" meta="可审查">
              <AgentRunCardGrid>
                <AgentRunField label="当前实体" value="Scene #08" />
                <AgentRunField label="参考资源" value="4 张" />
                <AgentRunField label="权限" value="建议模式" />
              </AgentRunCardGrid>
            </AgentRunCard>
          </AgentWorkLane>

          <AgentWorkRail>
            <AgentRailSection title="待确认" action="2 项">
              <AgentToolStep state="pending">
                <span>顾言侧脸参考不足</span>
                <span>需要素材</span>
              </AgentToolStep>
              <AgentToolStep state="pending">
                <span>镜头 2 是否允许近景</span>
                <span>待确认</span>
              </AgentToolStep>
            </AgentRailSection>

            <AgentRailSection title="建议产物" action="草稿">
              <AgentRunField label="分镜 1" value="雨中远景建立空间" />
              <AgentRunField label="分镜 2" value="近景压迫情绪" />
              <AgentRunField label="分镜 3" value="反打留悬念" />
            </AgentRailSection>

            <AgentRailSection title="可调用工具" action="3">
              <AgentContextChip tone="accent">实体读取</AgentContextChip>
              <AgentContextChip>素材检索</AgentContextChip>
              <AgentContextChip>分镜草稿</AgentContextChip>
            </AgentRailSection>
          </AgentWorkRail>
        </AgentWorkBody>

        <AgentCommandBar onSubmit={(event) => event.preventDefault()}>
          <AgentComposerField minRows={1} value="把第二个分镜改成近景，保留雨水反光。" readOnly />
          <div className="flex items-center gap-2">
            <AgentComposerAction aria-label="Attach context" active>
              <Plus size={13} />
            </AgentComposerAction>
            <AgentComposerSubmit type="button" label="Send">
              <Send size={15} />
            </AgentComposerSubmit>
          </div>
        </AgentCommandBar>
      </AgentWorkSurface>
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
