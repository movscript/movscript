import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clapperboard,
  Clock3,
  ClipboardCheck,
  Database,
  FileText,
  Film,
  GitBranch,
  Image,
  Layers,
  ListChecks,
  Loader2,
  LockKeyhole,
  PackageCheck,
  Play,
  RefreshCw,
  Route,
  ScrollText,
  Settings2,
  ShieldCheck,
  Scissors,
  Sparkles,
  SquareStack,
  Target,
  Upload,
  Users,
  Wand2,
} from 'lucide-react'

import ReferenceRelationsPage from '@/pages/reference-relations/ReferenceRelationsPage'
import { api } from '@/lib/api'
import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/draft-schemas'
import { RESOURCE_UPLOAD_ACCEPT } from '@/lib/mediaTypes'
import { buildCommandFirstClientInput, buildPageKey } from '@/lib/agentCommandInput'
import { openAgentPanelDraft, registerAgentPanelPageTool } from '@/lib/agentPanelBridge'
import { selectLatestDraftArtifact } from '@/lib/agentArtifacts'
import {
  buildScriptSplitDraftContent,
  getScriptTextLineCount,
  getScriptTextLineEntries,
  findMatchingScript,
  findScriptByIdAndType,
  inferSourceScriptTitle,
  normalizeScriptType,
  parseScriptSplitDraftContent,
  summarizeText,
  scriptTypeLabel,
  scriptSplitDraftStatusLabel,
  scriptSplitDraftStatusVariant,
  type ScriptSplitDraft,
  type ScriptSplitProductionSummary,
  type ScriptSplitResult,
} from '@/lib/scriptSplitDraft'
import { localAgentClient, type AgentDraft, type AgentDraftValidationResult, type AgentRun } from '@/lib/localAgentClient'
import { SCRIPT_DOCUMENT_ACCEPT, readScriptDocument, scriptDocumentTitleFromName } from '@/lib/scriptDocuments'
import { cn } from '@/lib/utils'
import { useAgentStore } from '@/store/agentStore'
import { useAgentSessionStore } from '@/store/agentSessionStore'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import type { Canvas, CanvasStage, Job, PublicModel, RawResource } from '@/types'
import type { Script } from '@/types'
import { Badge, Button, Card, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Progress, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { Input, Label, Textarea } from '@movscript/ui'
import { SemanticEntityInlineEditor } from '@/components/shared/SemanticEntityInlineEditor'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { runRuntimeMessage } from '@/lib/runtimeChat'
import { formatLocalAgentAssistantContent } from '@/components/agent/localRuntime'
import {
  buildContentUnitGenerationContext,
  createSemanticEntity,
  listSemanticEntities,
  semanticEntityConfig,
  updateSemanticEntity,
  type GenerationContext,
  type SemanticEntityPayload,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import {
  getWorkbenchSurface,
  workbenchSurfaces,
  type WorkbenchCategory,
} from '@/pages/project-workspace/structure'
import { PreProductionAssetWorkspace } from '@/pages/pre-production/PreProductionPage'
import { MediaViewer } from '@/components/shared/MediaViewer'

export type WorkbenchMode = 'free'
type WorkStatus = 'blocked' | 'review' | 'ready' | 'running'
type Priority = 'high' | 'medium' | 'low'

interface WorkbenchContentProps {
  mode: WorkbenchMode
  initialCategory?: WorkbenchCategory
  showCategoryTabs?: boolean
  nodeId?: string | number
  embedded?: boolean
  onBack?: () => void
}

interface QueueItem {
  id: string
  title: string
  subtitle: string
  status: WorkStatus
  priority: Priority
  progress: number
}

interface DecisionRow {
  label: string
  value: string
  tone?: 'default' | 'warning' | 'success'
}

interface CategoryScenario {
  queue: QueueItem[]
  evidenceTitle: string
  evidence: string[]
  decisionTitle: string
  decisions: DecisionRow[]
  outputTitle: string
  outputs: DecisionRow[]
  actions: string[]
}

const scenarios: Record<WorkbenchCategory, CategoryScenario> = {
  script: {
    queue: [
      { id: 's3', title: '旧伞纸条滑落', subtitle: '编排段 3 · 建议拆成两个情景', status: 'review', priority: 'high', progress: 62 },
      { id: 's2', title: '巷口对峙', subtitle: '编排段 2 · 人物动机待确认', status: 'review', priority: 'medium', progress: 74 },
      { id: 's4', title: '顾言停步', subtitle: '编排段 4 · 低置信表达', status: 'blocked', priority: 'medium', progress: 35 },
    ],
    evidenceTitle: '剧本证据',
    evidence: [
      '林夏撑着旧伞走进雨夜巷口，雨水沿着伞骨滴落。',
      '纸条从伞骨夹缝里滑出，被雨水打湿。',
      '顾言看见纸条，神色变化。林夏低声说：你还是来了。',
    ],
    decisionTitle: '理解判断',
    decisions: [
      { label: '情景', value: '旧伞纸条滑落' },
      { label: '人物', value: '林夏、顾言' },
      { label: '道具', value: '破损旧伞、纸条' },
      { label: '风险', value: '顾言动机缺上下文', tone: 'warning' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '结构', value: '新增 2 个情景候选' },
      { label: '下游', value: '生成设定资料候选和素材需求缺口' },
      { label: '状态', value: '可进入预演决策', tone: 'success' },
    ],
    actions: ['确认为情景', '拆成两个情景', '忽略候选', '生成设定资料候选'],
  },
  preview: {
    queue: [
      { id: 'p2', title: '林夏雨中半身', subtitle: '编排段 02 · 关键帧待选', status: 'running', priority: 'high', progress: 72 },
      { id: 'p3', title: '纸条特写', subtitle: '编排段 03 · 暂无可看的候选', status: 'review', priority: 'high', progress: 38 },
      { id: 'p5', title: '巷口背影', subtitle: '编排段 05 · 已有候选版本', status: 'ready', priority: 'low', progress: 84 },
    ],
    evidenceTitle: '候选依据',
    evidence: [
      '01 雨夜全景 · 广角固定 · 4s',
      '02 林夏半身 · 中近景缓推 · 5s',
      '03 纸条特写 · 特写慢推 · 3s',
      '04 顾言停步 · 中景静止 · 4s',
    ],
    decisionTitle: '候选状态',
    decisions: [
      { label: '总数', value: '已有 4 个候选' },
      { label: '未生成', value: '编排段 03 还没有候选', tone: 'warning' },
      { label: '关键帧', value: '编排段 02 候选 4 张' },
      { label: '下一步', value: '先处理已有候选，再补生成缺失候选' },
    ],
    outputTitle: '处理后输出',
    outputs: [
      { label: '采用', value: '记录被采用的预演候选' },
      { label: '忽略', value: '记录不再继续看的候选' },
      { label: '补生成', value: '为无候选段落生成新候选' },
    ],
    actions: ['审阅候选', '采用候选', '忽略候选', '生成新候选'],
  },
  creative: {
    queue: [
      { id: 'c1', title: '林夏', subtitle: '人物 · 表演克制程度待定', status: 'review', priority: 'high', progress: 58 },
      { id: 'c2', title: '破损旧伞', subtitle: '道具 · 影响纸条特写', status: 'blocked', priority: 'high', progress: 28 },
      { id: 'c3', title: '冷雨悬疑风格', subtitle: '风格 · 已可用于提示词', status: 'ready', priority: 'medium', progress: 92 },
    ],
    evidenceTitle: '设定资料证据',
    evidence: [
      '林夏需要保持克制，不是惊慌逃离。',
      '旧伞必须破损，伞骨内侧可以藏纸条。',
      '老城区窄巷需要低照度、潮湿墙面和坏路灯。',
    ],
    decisionTitle: '设定资料判断',
    decisions: [
      { label: '人物', value: '林夏状态需锁定', tone: 'warning' },
      { label: '道具', value: '旧伞是剧情证据，不是装饰' },
      { label: '风格', value: '低饱和、强反差、克制表演' },
      { label: '影响', value: '分镜、素材需求、关键帧一致性' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '设定资料卡', value: '人物、地点、道具、风格' },
      { label: '约束', value: '进入提示词和审核标准' },
      { label: '状态', value: '可进入素材准备', tone: 'success' },
    ],
    actions: ['确认设定资料', '标记缺口', '补充说明', '关联使用位置'],
  },
  assets: {
    queue: [
      { id: 'a1', title: '破损旧伞特写', subtitle: '素材需求 · 道具参考', status: 'blocked', priority: 'high', progress: 24 },
      { id: 'a2', title: '林夏雨夜半身', subtitle: '人物状态 · 候选 4 张', status: 'running', priority: 'medium', progress: 72 },
      { id: 'a3', title: '老城区窄巷', subtitle: '地点 · 可用于全景', status: 'ready', priority: 'medium', progress: 88 },
    ],
    evidenceTitle: '素材标准',
    evidence: ['必须可用于关键帧', '必须和人物状态一致', '必须能解释纸条藏在伞骨里'],
    decisionTitle: '采用判断',
    decisions: [
      { label: '缺口', value: '旧伞没有可用正面和特写参考', tone: 'warning' },
      { label: '候选', value: 'AI 候选 2 张，上传参考 1 张' },
      { label: '质量', value: '人物一致性 78%，道具准确 64%', tone: 'warning' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '素材', value: '锁定素材版本' },
      { label: '资源', value: '写入资源库引用' },
      { label: '状态', value: '可生成关键帧', tone: 'success' },
    ],
    actions: ['上传参考', '生成候选', '采用素材', '请求返工'],
  },
  production: {
    queue: [
      { id: 'variant-b', title: '编排段 02 人物停步', subtitle: '版本 B 待审', status: 'review', priority: 'high', progress: 61 },
      { id: 'v3', title: '纸条特写', subtitle: '缺正式视频', status: 'blocked', priority: 'high', progress: 34 },
      { id: 'v1', title: '雨夜全景', subtitle: '可采用', status: 'ready', priority: 'medium', progress: 86 },
    ],
    evidenceTitle: '候选版本',
    evidence: ['版本 A：节奏偏快，雨量过强。', '版本 B：人物停步清楚，灯光需微调。', '版本 C：构图稳定，但表情不够准确。'],
    decisionTitle: '生产判断',
    decisions: [
      { label: '推荐', value: '版本 B 可先采用' },
      { label: '返工', value: '灯光和雨量需要微调', tone: 'warning' },
      { label: '一致性', value: '人物 78%，道具 64%', tone: 'warning' },
      { label: '下游', value: '采用后进入交付检查' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '编排段', value: '正式段落 02' },
      { label: '记录', value: '采用版本和返工意见' },
      { label: '状态', value: '可进入交付门禁', tone: 'success' },
    ],
    actions: ['采用版本', '请求返工', '生成新版本', '创建人工任务'],
  },
  delivery: {
    queue: [
      { id: 'd3', title: '画面完整性', subtitle: '编排段 03 缺正式视频', status: 'blocked', priority: 'high', progress: 52 },
      { id: 'd2', title: '声音混音', subtitle: '雨声已生成，台词未混音', status: 'review', priority: 'medium', progress: 66 },
      { id: 'd4', title: '版权记录', subtitle: '字体授权待记录', status: 'blocked', priority: 'medium', progress: 40 },
    ],
    evidenceTitle: '交付检查',
    evidence: ['编排段 03 缺正式视频。', '第 2 段字幕未确认。', '台词未混音。', '字体授权待记录。'],
    decisionTitle: '放行判断',
    decisions: [
      { label: '完整性', value: '84%' },
      { label: '声音', value: '52%', tone: 'warning' },
      { label: '字幕', value: '66%', tone: 'warning' },
      { label: '版权', value: '40%', tone: 'warning' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '版本', value: '检查版、内部评审版、交付版' },
      { label: '结果', value: '导出前通过/阻塞记录' },
      { label: '状态', value: '满足条件后可导出', tone: 'success' },
    ],
    actions: ['导出检查版', '标记阻塞', '补齐字幕', '记录版权'],
  },
  'reference-relations': {
    queue: [
      { id: 'r1', title: '林夏 ↔ 顾言', subtitle: '人物关系 · 共同秘密', status: 'review', priority: 'high', progress: 70 },
      { id: 'r2', title: '旧伞 → 纸条', subtitle: '道具关系 · 剧情证据', status: 'ready', priority: 'high', progress: 88 },
      { id: 'r3', title: '窄巷 → 对峙', subtitle: '地点关系 · 情绪压迫', status: 'review', priority: 'medium', progress: 64 },
    ],
    evidenceTitle: '关系证据',
    evidence: ['旧伞和纸条共同解释秘密暴露。', '林夏和顾言的距离影响镜头调度。', '坏路灯和雨夜共同制造低照度风格。'],
    decisionTitle: '关系判断',
    decisions: [
      { label: '人物', value: '共同秘密，不是普通重逢' },
      { label: '道具', value: '纸条推动情绪变化' },
      { label: '地点', value: '窄巷限制运动和构图' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '关系图', value: '可被分镜和提示词引用' },
      { label: '证据', value: '每条关系保留来源' },
      { label: '状态', value: '下游解释一致', tone: 'success' },
    ],
    actions: ['确认关系', '改关系类型', '补证据', '删除弱关系'],
  },
}

function statusLabel(status: WorkStatus) {
  if (status === 'blocked') return '阻塞'
  if (status === 'ready') return '可推进'
  if (status === 'running') return '运行中'
  return '待确认'
}

function statusVariant(status: WorkStatus) {
  if (status === 'blocked') return 'warning' as const
  if (status === 'ready') return 'success' as const
  if (status === 'running') return 'secondary' as const
  return 'outline' as const
}

function priorityLabel(priority: Priority) {
  if (priority === 'high') return '高'
  if (priority === 'medium') return '中'
  return '低'
}

function decisionVariant(tone?: DecisionRow['tone']) {
  if (tone === 'success') return 'success' as const
  if (tone === 'warning') return 'warning' as const
  return 'outline' as const
}

function QueueList({
  items,
  selectedId,
  onSelect,
}: {
  items: QueueItem[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <Card className="rounded-lg border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">待处理队列</h2>
        <Badge variant="secondary">{items.length}</Badge>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              'w-full rounded-md border px-3 py-3 text-left transition-colors',
              selectedId === item.id ? 'border-primary/60 bg-primary/5' : 'border-border bg-background hover:bg-muted/30',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{item.title}</span>
              <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{item.subtitle}</p>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'outline'} className="shrink-0">
                {priorityLabel(item.priority)}
              </Badge>
              <Progress value={item.progress} className="h-1.5" />
            </div>
          </button>
        ))}
      </div>
    </Card>
  )
}

function InfoPanel({ title, rows, icon: Icon }: { title: string; rows: string[]; icon: typeof FileText }) {
  return (
    <Card className="rounded-lg border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={17} />
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row} className="rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground">
            {row}
          </div>
        ))}
      </div>
    </Card>
  )
}

function DecisionPanel({ title, rows }: { title: string; rows: DecisionRow[] }) {
  return (
    <Card className="rounded-lg border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={`${row.label}:${row.value}`} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{row.label}</p>
              <Badge variant={decisionVariant(row.tone)}>{row.tone === 'warning' ? '需处理' : row.tone === 'success' ? '可用' : '信息'}</Badge>
            </div>
            <p className="mt-2 text-sm font-medium leading-6 text-foreground">{row.value}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ActionRail({ actions, outputTitle, outputs }: { actions: string[]; outputTitle: string; outputs: DecisionRow[] }) {
  return (
    <aside className="w-80 shrink-0 overflow-auto border-l border-border bg-muted/20 p-4">
      <section className="mb-5">
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">可执行动作</h3>
        <div className="space-y-2">
          {actions.map((action, index) => (
            <button
              key={action}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                index === 0 ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border bg-background text-foreground hover:bg-muted/40',
              )}
            >
              {index === 0 ? <CheckCircle2 size={14} className="shrink-0 text-primary" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />}
              <span>{action}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{outputTitle}</h3>
        <div className="space-y-2">
          {outputs.map((row) => (
            <div key={`${row.label}:${row.value}`} className="rounded-md border border-border bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <Badge variant={decisionVariant(row.tone)}>{row.tone === 'success' ? '输出' : '记录'}</Badge>
              </div>
              <p className="mt-1 text-sm leading-5 text-foreground">{row.value}</p>
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}

interface WorkbenchMetric {
  label: string
  value: string
  detail: string
  icon: typeof FileText
  status: WorkStatus
}

interface WorkbenchGate {
  label: string
  detail: string
  done: boolean
  tone?: 'warning' | 'success'
}

interface WorkbenchLinkRow {
  label: string
  value: string
  icon: typeof FileText
}

type WorkbenchRecord = SemanticEntityRecord & {
  alias?: string
  description?: string
  content?: string
  prompt?: string
  prompt_hint?: string
  visual_intent?: string
  summary?: string
  action_text?: string
  condition_text?: string
  time_text?: string
  location_text?: string
  mood?: string
  emotion?: string
  costume?: string
  visual_notes?: string
  props?: string
  duration_sec?: number
  production_id?: number
  segment_id?: number
  scene_moment_id?: number
  content_unit_id?: number
  owner_type?: string
  owner_id?: number
  creative_reference_id?: number
  creative_reference_state_id?: number
  kind?: string
  name?: string
  priority?: string
  resource_id?: number
  resource?: RawResource
  locked_asset_slot_id?: number
  slot_key?: string
  source_type?: string
  source_id?: number
  scope_type?: string
  scope_id?: number
  score?: number
  note?: string
  candidate_asset_slot_id?: number
  asset_slot_id?: number
  candidate_asset_slot?: WorkbenchRecord
  shot_size?: string
  camera_angle?: string
  camera_motion?: string
  importance?: string
  profile_json?: string
  tags_json?: string
  role?: string
  evidence?: string
}

interface ProductionWorkbenchData {
  productions: WorkbenchRecord[]
  segments: WorkbenchRecord[]
  sceneMoments: WorkbenchRecord[]
  creativeReferences: WorkbenchRecord[]
  creativeReferenceUsages: WorkbenchRecord[]
  contentUnits: WorkbenchRecord[]
  assetSlots: WorkbenchRecord[]
  keyframes: WorkbenchRecord[]
  previewTimelineItems: WorkbenchRecord[]
  deliveryVersions: WorkbenchRecord[]
  jobs: Job[]
}

interface SettingPrepData {
  productions: WorkbenchRecord[]
  scripts: Script[]
  scriptVersions: WorkbenchRecord[]
  segments: WorkbenchRecord[]
  sceneMoments: WorkbenchRecord[]
  creativeReferences: WorkbenchRecord[]
  creativeReferenceStates: WorkbenchRecord[]
  creativeReferenceUsages: WorkbenchRecord[]
  creativeRelationships: WorkbenchRecord[]
  assetSlots: WorkbenchRecord[]
  contentUnits: WorkbenchRecord[]
}

interface SettingPrepRow {
  id: string
  title: string
  kind: string
  status: WorkStatus
  rawStatus: string
  priority: Priority
  progress: number
  readinessLabel: string
  scope: string
  missing: string[]
  warnings: string[]
  record: WorkbenchRecord
  states: WorkbenchRecord[]
  usages: WorkbenchRecord[]
  relationships: WorkbenchRecord[]
  assetSlots: WorkbenchRecord[]
  linkedSegments: WorkbenchRecord[]
  linkedSceneMoments: WorkbenchRecord[]
  linkedContentUnits: WorkbenchRecord[]
  linkedProductions: WorkbenchRecord[]
}

interface AiUnitSuggestion {
  client_id: string
  title: string
  kind: string
  description?: string
  prompt?: string
  duration_sec?: number
  shot_size?: string
  camera_angle?: string
  camera_motion?: string
}

interface ContentGenerationViewRow {
  id: string
  title: string
  scope: string
  status: WorkStatus
  priority: Priority
  progress: number
  unit: WorkbenchRecord
  assetSlots: WorkbenchRecord[]
  missingSlots: WorkbenchRecord[]
  keyframes: WorkbenchRecord[]
}

interface ContentGenerationMomentRow {
  id: string
  title: string
  scope: string
  status: WorkStatus
  priority: Priority
  progress: number
  moment: WorkbenchRecord
  productionIds: number[]
  segment?: WorkbenchRecord
  references: WorkbenchRecord[]
  units: WorkbenchRecord[]
  assetSlots: WorkbenchRecord[]
  missingSlots: WorkbenchRecord[]
  keyframes: WorkbenchRecord[]
}

async function loadProductionWorkbenchData(projectId: number): Promise<ProductionWorkbenchData> {
  const [productions, segments, sceneMoments, creativeReferences, creativeReferenceUsages, contentUnits, assetSlots, keyframes, previewTimelineItems, deliveryVersions, jobs] = await Promise.all([
    listSemanticEntities(projectId, semanticEntityConfig('productions')),
    listSemanticEntities(projectId, semanticEntityConfig('segments')),
    listSemanticEntities(projectId, semanticEntityConfig('sceneMoments')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferences')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferenceUsages')),
    listSemanticEntities(projectId, semanticEntityConfig('contentUnits')),
    listSemanticEntities(projectId, semanticEntityConfig('assetSlots')),
    listSemanticEntities(projectId, semanticEntityConfig('keyframes')),
    listSemanticEntities(projectId, semanticEntityConfig('previewTimelineItems')),
    listSemanticEntities(projectId, semanticEntityConfig('deliveryVersions')),
    loadWorkbenchJobs(projectId, ['video', 'video_i2v', 'video_v2v']),
  ])
  return {
    productions: productions as WorkbenchRecord[],
    segments: segments as WorkbenchRecord[],
    sceneMoments: sceneMoments as WorkbenchRecord[],
    creativeReferences: creativeReferences as WorkbenchRecord[],
    creativeReferenceUsages: creativeReferenceUsages as WorkbenchRecord[],
    contentUnits: contentUnits as WorkbenchRecord[],
    assetSlots: assetSlots as WorkbenchRecord[],
    keyframes: keyframes as WorkbenchRecord[],
    previewTimelineItems: previewTimelineItems as WorkbenchRecord[],
    deliveryVersions: deliveryVersions as WorkbenchRecord[],
    jobs,
  }
}

async function safeWorkbenchList(projectId: number, kind: Parameters<typeof semanticEntityConfig>[0]): Promise<WorkbenchRecord[]> {
  try {
    return await listSemanticEntities(projectId, semanticEntityConfig(kind)) as WorkbenchRecord[]
  } catch (error) {
    console.warn(`Failed to load workbench entity: ${kind}`, error)
    return []
  }
}

async function loadSettingPrepData(projectId: number): Promise<SettingPrepData> {
  const [
    productions,
    scripts,
    scriptVersions,
    segments,
    sceneMoments,
    creativeReferences,
    creativeReferenceStates,
    creativeReferenceUsages,
    creativeRelationships,
    assetSlots,
    contentUnits,
  ] = await Promise.all([
    safeWorkbenchList(projectId, 'productions'),
    api.get<Script[]>(`/projects/${projectId}/scripts`).then((r) => r.data).catch(() => []),
    safeWorkbenchList(projectId, 'scriptVersions'),
    safeWorkbenchList(projectId, 'segments'),
    safeWorkbenchList(projectId, 'sceneMoments'),
    safeWorkbenchList(projectId, 'creativeReferences'),
    safeWorkbenchList(projectId, 'creativeReferenceStates'),
    safeWorkbenchList(projectId, 'creativeReferenceUsages'),
    safeWorkbenchList(projectId, 'creativeRelationships'),
    safeWorkbenchList(projectId, 'assetSlots'),
    safeWorkbenchList(projectId, 'contentUnits'),
  ])
  return {
    productions,
    scripts,
    scriptVersions,
    segments,
    sceneMoments,
    creativeReferences,
    creativeReferenceStates,
    creativeReferenceUsages,
    creativeRelationships,
    assetSlots,
    contentUnits,
  }
}

interface ProductionPreviewData {
  productions: WorkbenchRecord[]
  segments: WorkbenchRecord[]
  sceneMoments: WorkbenchRecord[]
  creativeReferences: WorkbenchRecord[]
  creativeReferenceUsages: WorkbenchRecord[]
  contentUnits: WorkbenchRecord[]
  assetSlots: WorkbenchRecord[]
  keyframes: WorkbenchRecord[]
  previewTimelines: WorkbenchRecord[]
  previewTimelineItems: WorkbenchRecord[]
  deliveryVersions: WorkbenchRecord[]
  jobs: Job[]
}

async function loadProductionPreviewData(projectId: number): Promise<ProductionPreviewData> {
  const [
    productions,
    segments,
    sceneMoments,
    creativeReferences,
    creativeReferenceUsages,
    contentUnits,
    assetSlots,
    keyframes,
    previewTimelines,
    previewTimelineItems,
    deliveryVersions,
    jobs,
  ] = await Promise.all([
    listSemanticEntities(projectId, semanticEntityConfig('productions')),
    listSemanticEntities(projectId, semanticEntityConfig('segments')),
    listSemanticEntities(projectId, semanticEntityConfig('sceneMoments')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferences')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferenceUsages')),
    listSemanticEntities(projectId, semanticEntityConfig('contentUnits')),
    listSemanticEntities(projectId, semanticEntityConfig('assetSlots')),
    listSemanticEntities(projectId, semanticEntityConfig('keyframes')),
    listSemanticEntities(projectId, semanticEntityConfig('previewTimelines')),
    listSemanticEntities(projectId, semanticEntityConfig('previewTimelineItems')),
    listSemanticEntities(projectId, semanticEntityConfig('deliveryVersions')),
    loadWorkbenchJobs(projectId, ['video', 'video_i2v', 'video_v2v']),
  ])
  return {
    productions: productions as WorkbenchRecord[],
    segments: segments as WorkbenchRecord[],
    sceneMoments: sceneMoments as WorkbenchRecord[],
    creativeReferences: creativeReferences as WorkbenchRecord[],
    creativeReferenceUsages: creativeReferenceUsages as WorkbenchRecord[],
    contentUnits: contentUnits as WorkbenchRecord[],
    assetSlots: assetSlots as WorkbenchRecord[],
    keyframes: keyframes as WorkbenchRecord[],
    previewTimelines: previewTimelines as WorkbenchRecord[],
    previewTimelineItems: previewTimelineItems as WorkbenchRecord[],
    deliveryVersions: deliveryVersions as WorkbenchRecord[],
    jobs,
  }
}

async function loadWorkbenchJobs(projectId: number, types: string[]) {
  const batches = await Promise.all(types.map((type) => (
    api.get<Job[]>('/jobs', {
      params: {
        project_id: projectId,
        type,
        exact_type: 1,
        limit: 100,
      },
    }).then((r) => r.data)
  )))
  return batches.flat().sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime())
}

function buildContentGenerationRows(data?: ProductionWorkbenchData): ContentGenerationViewRow[] {
  if (!data) return []
  const contentUnits = data.contentUnits ?? []
  const assetSlotsData = data.assetSlots ?? []
  const keyframesData = data.keyframes ?? []
  const visibleAssetSlots = assetSlotsData.filter((slot) => slot.owner_type !== 'asset_slot')
  return contentUnits
    .map((unit) => {
      const keyframeIds = new Set(keyframesData.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID).map((keyframe) => keyframe.ID))
      const assetSlots = visibleAssetSlots.filter((slot) => (
        (slot.owner_type === 'content_unit' && Number(slot.owner_id) === unit.ID) ||
        (slot.owner_type === 'keyframe' && slot.owner_id ? keyframeIds.has(Number(slot.owner_id)) : false)
      ))
      const missingSlots = assetSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
      const keyframes = keyframesData.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID)
      const status = contentUnitWorkStatus(unit, missingSlots)
      const priority: Priority = missingSlots.length > 0 ? 'high' : status === 'running' ? 'medium' : 'low'
      return {
        id: String(unit.ID),
        title: titleOfRecord(unit),
        scope: contentUnitScopeLabel(unit, keyframes, missingSlots),
        status,
        priority,
        progress: contentUnitProgress(unit, missingSlots, keyframes),
        unit,
        assetSlots,
        missingSlots,
        keyframes,
      }
    })
    .sort((a, b) => workStatusRank(a.status) - workStatusRank(b.status) || priorityRank(b.priority) - priorityRank(a.priority) || numberOf(a.unit.order) - numberOf(b.unit.order))
}

function buildContentGenerationMomentRows(data?: ProductionWorkbenchData): ContentGenerationMomentRow[] {
  if (!data) return []
  const productions = data.productions ?? []
  const segments = data.segments ?? []
  const sceneMoments = data.sceneMoments ?? []
  const contentUnits = data.contentUnits ?? []
  const assetSlotsData = data.assetSlots ?? []
  const keyframesData = data.keyframes ?? []
  const creativeReferences = data.creativeReferences ?? []
  const creativeReferenceUsages = data.creativeReferenceUsages ?? []
  const visibleAssetSlots = assetSlotsData.filter((slot) => slot.owner_type !== 'asset_slot')
  return sceneMoments
    .slice()
    .sort(byOrder)
    .map((moment) => {
      const segment = moment.segment_id ? segments.find((item) => item.ID === Number(moment.segment_id)) : undefined
      const units = contentUnits
        .filter((unit) => Number(unit.scene_moment_id) === moment.ID)
        .slice()
        .sort(byOrder)
      const unitIds = new Set(units.map((unit) => unit.ID))
      const productionIds = new Set<number>()
      if (Number.isFinite(Number(moment.production_id)) && Number(moment.production_id) > 0) productionIds.add(Number(moment.production_id))
      if (segment?.production_id) productionIds.add(Number(segment.production_id))
      units.forEach((unit) => {
        if (unit.production_id) productionIds.add(Number(unit.production_id))
      })
      const usageReferenceIds = creativeReferenceUsages
        .filter((usage) => (
          (usage.owner_type === 'scene_moment' && Number(usage.owner_id) === moment.ID) ||
          (usage.owner_type === 'content_unit' && usage.owner_id ? unitIds.has(Number(usage.owner_id)) : false)
        ))
        .map((usage) => Number(usage.creative_reference_id))
        .filter((id) => Number.isFinite(id) && id > 0)
      const references = dedupeRecords(creativeReferences.filter((reference) => usageReferenceIds.includes(reference.ID)))
      const keyframes = keyframesData.filter((keyframe) => Number(keyframe.scene_moment_id) === moment.ID || (keyframe.content_unit_id ? unitIds.has(Number(keyframe.content_unit_id)) : false)).slice().sort(byOrder)
      const keyframeIds = new Set(keyframes.map((keyframe) => keyframe.ID))
      const assetSlots = visibleAssetSlots.filter((slot) => (
        (slot.owner_type === 'scene_moment' && Number(slot.owner_id) === moment.ID) ||
        (slot.owner_type === 'content_unit' && slot.owner_id ? unitIds.has(Number(slot.owner_id)) : false) ||
        (slot.owner_type === 'keyframe' && slot.owner_id ? keyframeIds.has(Number(slot.owner_id)) : false)
      ))
      const missingSlots = assetSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
      const hasUnitPrompt = units.some((unit) => firstText(unit.description, unit.prompt))
      const status = momentWorkStatus(moment, units, missingSlots)
      const priority: Priority = units.length === 0 || missingSlots.length > 0 ? 'high' : status === 'running' ? 'medium' : 'low'
      return {
        id: String(moment.ID),
        title: titleOfRecord(moment),
        scope: momentScopeLabel(moment, segment, units, keyframes, missingSlots, productions, Array.from(productionIds)),
        status,
        priority,
        progress: momentProgress(moment, units, missingSlots, keyframes, hasUnitPrompt),
        moment,
        productionIds: Array.from(productionIds),
        segment,
        references,
        units,
        assetSlots,
        missingSlots,
        keyframes,
      }
    })
}

function buildProductionMetrics(rows: ContentGenerationViewRow[], data?: ProductionWorkbenchData): WorkbenchMetric[] {
  const runningJobs = data?.jobs.filter((job) => job.status === 'pending' || job.status === 'running').length ?? 0
  const succeededJobs = data?.jobs.filter((job) => job.status === 'succeeded').length ?? 0
  return [
    { label: '制作项', value: String(rows.length), detail: 'content-units', icon: Boxes, status: rows.length > 0 ? 'review' : 'blocked' },
    { label: '可生成', value: String(rows.filter((row) => row.missingSlots.length === 0 && firstText(row.unit.prompt, row.unit.description)).length), detail: '素材需求和提示已具备', icon: CheckCircle2, status: 'ready' },
    { label: '阻塞镜头', value: String(rows.filter((row) => row.status === 'blocked').length), detail: '存在 missing 素材需求', icon: AlertTriangle, status: rows.some((row) => row.status === 'blocked') ? 'blocked' : 'ready' },
    { label: '视频任务', value: String(runningJobs || succeededJobs), detail: runningJobs > 0 ? '有任务运行中' : '已完成任务', icon: Film, status: runningJobs > 0 ? 'running' : succeededJobs > 0 ? 'ready' : 'review' },
  ]
}

function buildMomentMetrics(rows: ContentGenerationMomentRow[], data?: ProductionWorkbenchData): WorkbenchMetric[] {
  const readyMoments = rows.filter((row) => row.units.length > 0 && row.missingSlots.length === 0).length
  const uncoveredMoments = rows.filter((row) => row.units.length === 0).length
  const totalUnits = rows.reduce((sum, row) => sum + row.units.length, 0)
  return [
    { label: '情节', value: String(rows.length), detail: '生成工作台的入口层', icon: Route, status: rows.length > 0 ? 'review' : 'blocked' },
    { label: '已有镜头', value: String(totalUnits), detail: '情节下面的制作项', icon: Boxes, status: totalUnits > 0 ? 'ready' : 'blocked' },
    { label: '可直接生成', value: String(readyMoments), detail: '情节、镜头和素材输入都已接上', icon: CheckCircle2, status: readyMoments > 0 ? 'ready' : 'review' },
    { label: '待拆镜头', value: String(uncoveredMoments), detail: '还没有生成制作项的情节', icon: Wand2, status: uncoveredMoments > 0 ? 'blocked' : 'ready' },
  ]
}

function normalizeCreativeReferenceStatus(status?: string) {
  if (status === 'confirmed' || status === 'locked' || status === 'ignored' || status === 'merged') return status
  return 'draft'
}

function creativeReferenceStatusLabel(status?: string) {
  const normalized = normalizeCreativeReferenceStatus(status)
  if (normalized === 'confirmed') return '已确认'
  if (normalized === 'locked') return '已锁定'
  if (normalized === 'ignored') return '已忽略'
  if (normalized === 'merged') return '已合并'
  return '草稿'
}

function creativeReferenceStatusVariant(status?: string) {
  const normalized = normalizeCreativeReferenceStatus(status)
  if (normalized === 'confirmed' || normalized === 'locked' || normalized === 'merged') return 'success' as const
  if (normalized === 'ignored') return 'outline' as const
  return 'warning' as const
}

function creativeUsageStatusLabel(status?: string) {
  if (status === 'confirmed') return '已确认'
  if (status === 'corrected') return '已修正'
  if (status === 'ignored') return '已忽略'
  if (status === 'draft') return '草稿'
  return firstText(status, '未设置')
}

function creativeUsageStatusVariant(status?: string) {
  if (status === 'confirmed' || status === 'corrected') return 'success' as const
  if (status === 'ignored') return 'outline' as const
  if (status === 'draft') return 'warning' as const
  return 'outline' as const
}

function creativeReferenceWorkStatus(status?: string): WorkStatus {
  const normalized = normalizeCreativeReferenceStatus(status)
  if (normalized === 'ignored') return 'blocked'
  if (normalized === 'draft') return 'review'
  return 'ready'
}

function creativeReferenceKindLabel(kind?: string) {
  if (kind === 'person') return '人物'
  if (kind === 'place') return '地点'
  if (kind === 'prop') return '道具'
  if (kind === 'product') return '产品'
  if (kind === 'brand') return '品牌'
  if (kind === 'style') return '风格'
  if (kind === 'world_rule') return '世界规则'
  if (kind === 'time_period') return '时间段'
  if (kind === 'restriction') return '限制'
  return firstText(kind, '设定')
}

function parseCreativeProfileJSON(profileJSON?: string) {
  const raw = firstText(profileJSON, '')
  if (!raw) return { profileJson: '', visualIntent: '' }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { profileJson: raw, visualIntent: '' }
    }
    const data = parsed as Record<string, unknown>
    const visualIntent = firstText(data.visual_intent, data.visualIntent, data.visual_notes, '')
    const cleaned = { ...data }
    delete cleaned.visual_intent
    delete cleaned.visualIntent
    delete cleaned.visual_notes
    return {
      profileJson: Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned, null, 2) : '',
      visualIntent,
    }
  } catch {
    return { profileJson: raw, visualIntent: '' }
  }
}

function composeCreativeProfileJSON(profileJson: string, visualIntent: string) {
  const trimmedProfile = profileJson.trim()
  const trimmedVisual = visualIntent.trim()
  if (!trimmedProfile && !trimmedVisual) return ''
  try {
    const parsed = trimmedProfile ? JSON.parse(trimmedProfile) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid profile json')
    const next = { ...(parsed as Record<string, unknown>) }
    if (trimmedVisual) next.visual_intent = trimmedVisual
    else {
      delete next.visual_intent
      delete next.visualIntent
      delete next.visual_notes
    }
    return JSON.stringify(next, null, 2)
  } catch {
    if (!trimmedVisual) return trimmedProfile
    return JSON.stringify({
      raw_profile: trimmedProfile,
      visual_intent: trimmedVisual,
    }, null, 2)
  }
}

function buildSettingPrepForm(record: WorkbenchRecord) {
  const profile = parseCreativeProfileJSON(record.profile_json)
  return {
    name: firstText(record.name, record.title, record.label, ''),
    alias: firstText(record.alias, ''),
    kind: firstText(record.kind, 'person'),
    importance: firstText(record.importance, 'supporting'),
    status: normalizeCreativeReferenceStatus(record.status),
    description: firstText(record.description, ''),
    content: firstText(record.content, ''),
    visualIntent: profile.visualIntent,
    profileJson: profile.profileJson,
    tagsJson: firstText(record.tags_json, ''),
  }
}

function buildSettingPrepUsageSummary(record: SettingPrepRow | null) {
  if (!record) return '暂无使用上下文'
  const productions = record.linkedProductions.slice(0, 2).map((item) => titleOfRecord(item))
  const segments = record.linkedSegments.slice(0, 2).map((item) => titleOfRecord(item))
  const moments = record.linkedSceneMoments.slice(0, 2).map((item) => titleOfRecord(item))
  const parts = [
    productions.length > 0 ? `制作 ${productions.join('、')}` : null,
    segments.length > 0 ? `编排段 ${segments.join('、')}` : null,
    moments.length > 0 ? `情景 ${moments.join('、')}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : '暂无使用上下文'
}

function buildSettingPrepEvidenceRows(record: SettingPrepRow | null) {
  if (!record) return []
  const lines: string[] = []
  for (const item of record.linkedSceneMoments.slice(0, 3)) {
    const line = [
      titleOfRecord(item),
      firstText(item.time_text, item.location_text, item.mood, item.description, item.action_text),
    ].filter(Boolean).join(' · ')
    if (line.trim()) lines.push(line)
  }
  for (const item of record.linkedSegments.slice(0, 2)) {
    const line = [
      titleOfRecord(item),
      firstText(item.summary, item.description, item.content),
    ].filter(Boolean).join(' · ')
    if (line.trim()) lines.push(line)
  }
  return lines.length > 0 ? lines : ['当前设定暂时没有绑定到可见剧本或编排上下文。']
}

function buildSettingPrepContextRows(record: SettingPrepRow | null) {
  if (!record) return []
  return [
    { label: '设定资料', value: `${creativeReferenceKindLabel(record.record.kind)} / ${creativeReferenceStatusLabel(record.record.status)}`, icon: Sparkles },
    { label: '使用范围', value: buildSettingPrepUsageSummary(record), icon: GitBranch },
    { label: '设定状态', value: `${record.states.length} 个状态记录`, icon: Layers },
    { label: '关联素材', value: record.assetSlots.length > 0 ? `${record.assetSlots.length} 个素材需求` : '尚未关联素材需求', icon: PackageCheck },
    { label: '关系网络', value: record.relationships.length > 0 ? `${record.relationships.length} 条关系` : '尚未建立关系', icon: Route },
  ]
}

function buildSettingPrepChecklist(record: SettingPrepRow | null) {
  if (!record) return []
  const readyForLock = record.missing.length === 0 && (record.rawStatus === 'confirmed' || record.rawStatus === 'locked')
  return [
    { label: '名称明确', detail: firstText(record.record.name, '设定资料需要一个稳定名称'), done: Boolean(firstText(record.record.name)), tone: 'warning' as const },
    { label: '设定正文完整', detail: record.missing.includes('缺设定正文') ? '需要补充可直接用于制作的设定说明' : '已有可用设定正文', done: !record.missing.includes('缺设定正文'), tone: 'warning' as const },
    { label: '视觉锚点可用', detail: record.missing.includes('缺视觉锚点') ? '需要补充视觉说明、档案或提示词锚点' : '已有视觉说明或档案', done: !record.missing.includes('缺视觉锚点'), tone: 'warning' as const },
    { label: '被使用范围明确', detail: record.usages.length > 0 ? `${record.usages.length} 个引用正在使用这个设定` : '还没有被剧本或制作使用', done: record.usages.length > 0, tone: 'warning' as const },
    { label: '状态可放行', detail: readyForLock ? '可以进入已确认或已锁定状态' : '建议先补齐缺口，再确认状态', done: readyForLock, tone: 'warning' as const },
  ]
}

function buildSettingPrepRows(data?: SettingPrepData): SettingPrepRow[] {
  if (!data) return []
  const segmentsById = new Map(data.segments.map((item) => [item.ID, item]))
  const momentsById = new Map(data.sceneMoments.map((item) => [item.ID, item]))
  const productionsById = new Map(data.productions.map((item) => [item.ID, item]))
  const contentUnitsById = new Map(data.contentUnits.map((item) => [item.ID, item]))

  return data.creativeReferences
    .slice()
    .sort((a, b) => byOrder(a, b))
    .map((record) => {
      const states = data.creativeReferenceStates.filter((state) => Number(state.creative_reference_id) === record.ID)
      const usages = data.creativeReferenceUsages.filter((usage) => Number(usage.creative_reference_id) === record.ID)
      const relatedAssetSlots = data.assetSlots.filter((slot) => Number(slot.creative_reference_id) === record.ID || states.some((state) => Number(slot.creative_reference_state_id) === state.ID))
      const relationships = data.creativeRelationships.filter((relation) => Number(relation.source_creative_reference_id) === record.ID || Number(relation.target_creative_reference_id) === record.ID)

      const linkedSegments = dedupeRecords([
        ...usages
          .filter((usage) => usage.owner_type === 'segment')
          .map((usage) => segmentsById.get(Number(usage.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
        ...relatedAssetSlots
          .filter((slot) => slot.owner_type === 'segment')
          .map((slot) => segmentsById.get(Number(slot.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
      ])
      const linkedSceneMoments = dedupeRecords([
        ...usages
          .filter((usage) => usage.owner_type === 'scene_moment')
          .map((usage) => momentsById.get(Number(usage.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
        ...relatedAssetSlots
          .filter((slot) => slot.owner_type === 'scene_moment')
          .map((slot) => momentsById.get(Number(slot.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
      ])
      const linkedContentUnits = dedupeRecords([
        ...usages
          .filter((usage) => usage.owner_type === 'content_unit')
          .map((usage) => contentUnitsById.get(Number(usage.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
        ...relatedAssetSlots
          .filter((slot) => slot.owner_type === 'content_unit')
          .map((slot) => contentUnitsById.get(Number(slot.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
      ])
      const linkedProductions = dedupeRecords([
        ...linkedSegments
          .map((segment) => segment.production_id ? productionsById.get(Number(segment.production_id)) : undefined)
          .filter((item): item is WorkbenchRecord => Boolean(item)),
        ...linkedSceneMoments
          .map((moment) => moment.production_id ? productionsById.get(Number(moment.production_id)) : undefined)
          .filter((item): item is WorkbenchRecord => Boolean(item)),
        ...linkedContentUnits
          .map((unit) => unit.production_id ? productionsById.get(Number(unit.production_id)) : undefined)
          .filter((item): item is WorkbenchRecord => Boolean(item)),
      ])

      const title = firstText(record.name, record.title, record.label, record.alias, `${creativeReferenceKindLabel(record.kind)} #${record.ID}`)
      const hasDescription = Boolean(firstText(record.description, record.content))
      const hasVisualAnchor = Boolean(firstText(record.visual_intent, record.visual_notes, record.profile_json))
      const hasState = states.length > 0
      const hasUsage = usages.length > 0
      const hasAsset = relatedAssetSlots.length > 0
      const missing = [
        hasDescription ? null : '缺设定正文',
        hasVisualAnchor ? null : '缺视觉锚点',
        hasState ? null : '缺状态记录',
        hasUsage ? null : '缺使用上下文',
        normalizeCreativeReferenceStatus(record.status) === 'draft' ? '待定稿' : null,
      ].filter(Boolean) as string[]
      const warnings = [
        relationships.some((relation) => String(relation.category) === 'conflict') ? '存在冲突关系' : null,
        usages.length > 0 && normalizeCreativeReferenceStatus(record.status) === 'draft' ? '下游已在使用，建议先补完再定稿' : null,
      ].filter(Boolean) as string[]
      const progress = clampProgress(
        10 +
        (hasDescription ? 18 : 0) +
        (hasVisualAnchor ? 20 : 0) +
        (hasState ? 18 : 0) +
        (hasUsage ? 18 : 0) +
        (hasAsset ? 10 : 0) +
        (normalizeCreativeReferenceStatus(record.status) === 'confirmed' ? 8 : 0) +
        (normalizeCreativeReferenceStatus(record.status) === 'locked' ? 12 : 0),
      )
      const priority: Priority = (usages.length > 0 && missing.length > 0) || warnings.length > 0
        ? 'high'
        : usages.length > 0
          ? 'medium'
          : 'low'
      const status = creativeReferenceWorkStatus(record.status)
      const readinessLabel = missing.length === 0
        ? normalizeCreativeReferenceStatus(record.status) === 'locked'
          ? '已锁定，可下游引用'
          : normalizeCreativeReferenceStatus(record.status) === 'confirmed'
            ? '已确认，可继续使用'
            : '可进入确认'
        : `${missing.length} 个缺口`
      const scopeParts = [
        linkedProductions.length > 0 ? `${linkedProductions.length} 个制作` : '未绑定制作',
        linkedSegments.length > 0 ? `${linkedSegments.length} 个编排段` : '未绑定编排段',
        linkedSceneMoments.length > 0 ? `${linkedSceneMoments.length} 个情景` : '未绑定情景',
      ]

      return {
        id: String(record.ID),
        title,
        kind: creativeReferenceKindLabel(record.kind),
        status,
        rawStatus: normalizeCreativeReferenceStatus(record.status),
        priority,
        progress,
        readinessLabel,
        scope: scopeParts.join(' / '),
        missing,
        warnings,
        record,
        states,
        usages,
        relationships,
        assetSlots: relatedAssetSlots,
        linkedSegments,
        linkedSceneMoments,
        linkedContentUnits,
        linkedProductions,
      }
    })
}

function buildSettingPrepMetrics(rows: SettingPrepRow[]): WorkbenchMetric[] {
  const completed = rows.filter((row) => row.missing.length === 0 && (row.rawStatus === 'confirmed' || row.rawStatus === 'locked'))
  const locked = rows.filter((row) => row.rawStatus === 'locked')
  const used = rows.filter((row) => row.usages.length > 0)
  const needingWork = rows.filter((row) => row.missing.length > 0 || row.rawStatus === 'draft')
  return [
    { label: '设定资料', value: String(rows.length), detail: '当前项目内的核心设定对象', icon: Sparkles, status: rows.length > 0 ? 'review' : 'blocked' },
    { label: '待完善', value: String(needingWork.length), detail: '缺口或草稿状态的设定', icon: AlertTriangle, status: needingWork.length > 0 ? 'blocked' : 'ready' },
    { label: '已可用', value: String(completed.length), detail: '可进入下游使用的设定', icon: CheckCircle2, status: completed.length > 0 ? 'ready' : 'review' },
    { label: '已锁定', value: String(locked.length), detail: '后续修改需二次确认', icon: LockKeyhole, status: locked.length > 0 ? 'ready' : 'review' },
    { label: '已使用', value: String(used.length), detail: '已经进入剧本或制作上下文', icon: GitBranch, status: used.length > 0 ? 'ready' : 'review' },
  ]
}

function buildSettingPrepAgentMessage(input: {
  projectName?: string
  row: SettingPrepRow
  evidence: string[]
  missing: string[]
}) {
  return [
    `请完善设定资料：${input.row.title}`,
    input.projectName ? `项目：${input.projectName}` : undefined,
    `类型：${input.row.kind}`,
    `状态：${creativeReferenceStatusLabel(input.row.rawStatus)}`,
    input.missing.length > 0 ? `缺口：${input.missing.join('、')}` : undefined,
    input.evidence.length > 0 ? `证据：${input.evidence.join('；')}` : undefined,
  ].filter(Boolean).join('\n')
}

function SettingPrepStateBadge({ status }: { status?: string }) {
  return <Badge variant={creativeReferenceStatusVariant(status)}>{creativeReferenceStatusLabel(status)}</Badge>
}

function SettingPrepHintCard({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm leading-6 text-foreground">{text}</p>
    </div>
  )
}

function SettingPrepTag({ children }: { children: ReactNode }) {
  return <span className="inline-flex max-w-full items-center rounded border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">{children}</span>
}

function buildProductionContext(row: ContentGenerationViewRow | null): WorkbenchLinkRow[] {
  if (!row) return []
  const unit = row.unit
  return [
    { label: '内容目标', value: firstText(unit.description, unit.prompt, titleOfRecord(unit)), icon: Target },
    { label: '关键帧', value: row.keyframes.length > 0 ? `${row.keyframes.length} 个关键帧：${row.keyframes.slice(0, 2).map(titleOfRecord).join('、')}` : '尚未绑定关键帧', icon: Image },
    { label: '素材需求输入', value: `${row.assetSlots.length} 个素材需求，${row.missingSlots.length} 个缺口`, icon: PackageCheck },
    { label: '生成设置', value: `${unit.kind || '制作项'} / ${formatDuration(unit.duration_sec)} / ${unit.production_id ? `制作 #${unit.production_id}` : '未绑定制作'}`, icon: Settings2 },
  ]
}

function buildMomentContext(row: ContentGenerationMomentRow | null): WorkbenchLinkRow[] {
  if (!row) return []
  const moment = row.moment
  return [
    { label: '情节目标', value: firstText(moment.description, moment.action_text, titleOfRecord(moment)), icon: Target },
    { label: '时空条件', value: [moment.time_text, moment.location_text].filter(Boolean).join(' / ') || '未填写时间或地点', icon: Route },
    { label: '动作与情绪', value: [moment.condition_text, moment.action_text, moment.mood].filter(Boolean).join(' / ') || '未填写条件、动作或情绪', icon: Film },
    { label: '设定资料', value: summarizeRecordNames(row.references, '尚未关联设定资料'), icon: Users },
    { label: '素材输入', value: summarizeAssetSlots(row.assetSlots, '尚未关联素材输入'), icon: PackageCheck },
    { label: '镜头制作项', value: row.units.length > 0 ? `${row.units.length} 个，${row.units.slice(0, 2).map(titleOfRecord).join('、')}` : '尚未生成镜头制作项', icon: Boxes },
  ]
}

function buildProductionStandards(row: ContentGenerationViewRow | null, jobs: Job[]): WorkbenchGate[] {
  if (!row) return []
  const hasTarget = Boolean(firstText(row.unit.description, row.unit.prompt))
  const assetsReady = row.missingSlots.length === 0
  const hasKeyframe = row.keyframes.length > 0
  const hasJob = jobs.length > 0 || row.unit.status === 'locked'
  return [
    { label: '内容目标明确', detail: hasTarget ? '已有 description 或 prompt' : '需要补充内容目标或生成提示', done: hasTarget, tone: hasTarget ? 'success' : 'warning' },
    { label: '素材需求输入可用', detail: assetsReady ? '没有 missing 素材需求' : `${row.missingSlots.length} 个素材需求缺口阻塞`, done: assetsReady, tone: assetsReady ? 'success' : 'warning' },
    { label: '关键帧具备', detail: hasKeyframe ? `${row.keyframes.length} 个关键帧可用` : '建议先生成或绑定关键帧', done: hasKeyframe, tone: hasKeyframe ? 'success' : 'warning' },
    { label: '生成记录可追溯', detail: hasJob ? '已有项目生成任务或内容已锁定' : '还没有当前项目的视频生成任务', done: hasJob, tone: hasJob ? 'success' : 'warning' },
  ]
}

function buildMomentStandards(row: ContentGenerationMomentRow | null, jobs: Job[]): WorkbenchGate[] {
  if (!row) return []
  const hasStoryContext = Boolean(firstText(row.moment.description, row.moment.action_text) || row.moment.time_text || row.moment.location_text)
  const hasUnits = row.units.length > 0
  const hasUnitPrompt = row.units.some((unit) => firstText(unit.description, unit.prompt))
  const assetsReady = row.units.length > 0 && row.missingSlots.length === 0
  const hasJob = jobs.length > 0
  return [
    { label: '情节上下文明确', detail: hasStoryContext ? '已有情节描述、动作或时空条件' : '需要补齐情节描述、动作、时间或地点', done: hasStoryContext, tone: hasStoryContext ? 'success' : 'warning' },
    { label: '镜头入口存在', detail: hasUnits ? `${row.units.length} 个镜头制作项可继续拆分` : '还没有镜头制作项，先手动创建或交给 AI 拆镜', done: hasUnits, tone: hasUnits ? 'success' : 'warning' },
    { label: '镜头提示可用', detail: hasUnitPrompt ? '已有 description 或 prompt，可直接驱动生成' : '需要为镜头补上生成提示或用途说明', done: hasUnitPrompt, tone: hasUnitPrompt ? 'success' : 'warning' },
    { label: '素材输入就绪', detail: assetsReady ? '没有未处理的素材缺口' : `${row.missingSlots.length} 个素材缺口仍在阻塞`, done: assetsReady, tone: assetsReady ? 'success' : 'warning' },
    { label: '生成记录可追溯', detail: hasJob ? '已有项目生成任务记录' : '当前项目还没有生成任务记录', done: hasJob, tone: hasJob ? 'success' : 'warning' },
  ]
}

function buildGenerationContextStandards(context?: GenerationContext): WorkbenchGate[] {
  if (!context) return []
  const target = context.target.content_unit
  const lockedAssets = context.asset_slots.filter((slot) => isGenerationAssetUsable(slot)).length
  const missingAssets = context.asset_slots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing').length
  const hasTargetPrompt = Boolean(firstText(target.prompt, target.description))
  const hasStoryContext = Boolean(context.scene_moment || context.segment)
  const hasContinuity = context.creative_references.length > 0
  const assetsReady = context.asset_slots.length > 0 && missingAssets === 0 && lockedAssets > 0
  const hasKeyframe = context.keyframes.length > 0
  return [
    { label: '目标提示可读', detail: hasTargetPrompt ? firstText(target.prompt, target.description) : '制作项缺少 prompt 或 description，Agent 难以判断画面目标', done: hasTargetPrompt, tone: hasTargetPrompt ? 'success' : 'warning' },
    { label: '情景上下文存在', detail: hasStoryContext ? [context.segment ? `编排段：${titleOfRecord(context.segment)}` : null, context.scene_moment ? `情景：${titleOfRecord(context.scene_moment)}` : null].filter(Boolean).join(' / ') : '未绑定情景或编排段，生成会缺少时空、动作和情绪约束', done: hasStoryContext, tone: hasStoryContext ? 'success' : 'warning' },
    { label: '连续性资料可用', detail: hasContinuity ? `${context.creative_references.length} 个设定引用会进入生成上下文` : '未找到人物、地点、风格或道具设定引用', done: hasContinuity, tone: hasContinuity ? 'success' : 'warning' },
    { label: '素材输入可用', detail: context.asset_slots.length === 0 ? '未找到素材需求或参考素材' : `${context.asset_slots.length} 个素材输入，${lockedAssets} 个可用，${missingAssets} 个缺失`, done: assetsReady, tone: assetsReady ? 'success' : 'warning' },
    { label: '首帧/关键帧', detail: hasKeyframe ? `${context.keyframes.length} 个关键帧可作为视频生成锚点` : '视频生成前建议先生成或绑定关键帧', done: hasKeyframe, tone: hasKeyframe ? 'success' : 'warning' },
  ]
}

function buildGenerationContextRows(context?: GenerationContext): WorkbenchLinkRow[] {
  if (!context) return []
  const target = context.target.content_unit
  const referenceNames = context.creative_references
    .map((item) => titleOfRecord(item.state ?? item.reference))
    .filter(Boolean)
  const assetSummary = summarizeGenerationAssets(context.asset_slots)
  return [
    { label: '后端目标', value: firstText(target.prompt, target.description, titleOfRecord(target)), icon: Target },
    { label: '情景', value: context.scene_moment ? firstText(context.scene_moment.description, context.scene_moment.action_text, titleOfRecord(context.scene_moment)) : '未绑定情景', icon: Route },
    { label: '设定引用', value: referenceNames.length > 0 ? referenceNames.slice(0, 4).join('、') : '未找到设定引用', icon: Users },
    { label: '素材输入', value: assetSummary, icon: PackageCheck },
    { label: '关键帧', value: context.keyframes.length > 0 ? context.keyframes.slice(0, 3).map(titleOfRecord).join('、') : '未找到关键帧', icon: Image },
    { label: '写回范围', value: context.constraints.write_targets.join('、') || '未声明写回范围', icon: ShieldCheck },
  ]
}

function summarizeGenerationAssets(slots: SemanticEntityRecord[]) {
  if (slots.length === 0) return '未找到素材输入'
  const usable = slots.filter((slot) => isGenerationAssetUsable(slot)).length
  const missing = slots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing').length
  return `${slots.length} 个素材输入，${usable} 个可用，${missing} 个缺失`
}

function isGenerationAssetUsable(slot: SemanticEntityRecord) {
  const status = normalizeAssetSlotStatus(String(slot.status ?? ''))
  return status === 'locked' || status === 'waived' || Boolean(slot.resource_id || slot.locked_asset_slot_id)
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const data = (error as { response?: { data?: { message?: unknown; error?: unknown } } }).response?.data
    const message = firstText(data?.message, data?.error)
    if (message) return message
  }
  return fallback
}

function buildProductionCandidateRows(jobs: Job[]) {
  return jobs.slice(0, 6).map((job) => ({
    name: `任务 #${job.ID} · ${job.job_type}`,
    source: firstText(job.model_display, job.model_identifier, `模型 #${job.model_config_id}`),
    fit: job.output_resource_id ? `输出资源 #${job.output_resource_id}` : job.status === 'succeeded' ? '已完成' : job.status,
    issue: firstText(job.error_msg, trimText(job.prompt, 36), job.feature_key, '无提示词'),
    status: jobToWorkStatus(job),
  }))
}

function parseAiUnitSuggestions(raw: string): AiUnitSuggestion[] {
  if (!raw || !raw.trim()) return []
  const jsonPayload = extractJsonBlock(raw)
  if (!jsonPayload) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonPayload)
  } catch {
    return []
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { units?: unknown })?.units)
      ? (parsed as { units: unknown[] }).units
      : []
  const items: AiUnitSuggestion[] = []
  const validKinds = new Set(['shot', 'visual_segment', 'caption_card', 'narration', 'transition', 'music_beat', 'product_showcase'])
  arr.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return
    const record = entry as Record<string, unknown>
    const title = String(record.title ?? '').trim()
    if (!title) return
    const rawKind = String(record.kind ?? 'shot').trim()
    const kind = validKinds.has(rawKind) ? rawKind : 'shot'
    items.push({
      client_id: `ai_${index}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      kind,
      description: optionalString(record.description),
      prompt: optionalString(record.prompt),
      duration_sec: optionalNumber(record.duration_sec),
      shot_size: optionalString(record.shot_size),
      camera_angle: optionalString(record.camera_angle),
      camera_motion: optionalString(record.camera_motion),
    })
  })
  return items
}

function extractJsonBlock(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fenced) return fenced[1].trim()
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text ? text : undefined
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value === 'string' && value.trim()) {
    const num = Number(value)
    if (Number.isFinite(num) && num > 0) return Math.round(num)
  }
  return undefined
}


function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function normalizeEntityTitleKey(value: unknown) {
  return firstText(value).replace(/\s+/g, '').toLowerCase()
}

function mergeMetadataJSON(value: unknown, patch: Record<string, unknown>) {
  if (typeof value !== 'string' || !value.trim()) return patch
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...parsed as Record<string, unknown>, ...patch }
      : patch
  } catch {
    return patch
  }
}

function dedupeRecords<T extends { ID: number }>(records: T[]): T[] {
  const seen = new Set<number>()
  return records.filter((record) => {
    if (seen.has(record.ID)) return false
    seen.add(record.ID)
    return true
  })
}

function trimText(value: unknown, max = 42) {
  const text = String(value ?? '').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

function titleOfRecord(record?: WorkbenchRecord | null) {
  if (!record) return '未选择'
  return firstText(record.title, record.name, record.label, record.slot_key, `${record.kind || '记录'} #${record.ID}`)
}

function numberOf(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

function formatDuration(value?: number) {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return '未设时长'
  return `${Math.round(next)}s`
}

function byOrder<T extends { order?: number; ID: number }>(a: T, b: T) {
  const ao = typeof a.order === 'number' ? a.order : a.ID
  const bo = typeof b.order === 'number' ? b.order : b.ID
  return ao - bo
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeAssetSlotStatus(status?: string) {
  if (status === 'candidate' || status === 'locked' || status === 'waived') return status
  return 'missing'
}

function assetSlotWorkStatus(slot: WorkbenchRecord, lockedSlot?: WorkbenchRecord): WorkStatus {
  const status = normalizeAssetSlotStatus(slot.status)
  if (status === 'locked' || status === 'waived' || lockedSlot || slot.resource_id) return 'ready'
  return 'review'
}

function contentUnitWorkStatus(unit: WorkbenchRecord, missingSlots: WorkbenchRecord[]): WorkStatus {
  if (missingSlots.length > 0) return 'blocked'
  if (unit.status === 'in_production') return 'running'
  if (unit.status === 'locked') return 'ready'
  if (unit.status === 'confirmed') return 'ready'
  return 'review'
}

function assetSlotProgress(slot: WorkbenchRecord, candidates: WorkbenchRecord[], lockedSlot?: WorkbenchRecord) {
  if (normalizeAssetSlotStatus(slot.status) === 'locked' || lockedSlot || slot.resource_id) return 100
  if (normalizeAssetSlotStatus(slot.status) === 'waived') return 100
  if (candidates.length > 0) return 65
  if (firstText(slot.description, slot.prompt_hint)) return 35
  return 15
}

function contentUnitProgress(unit: WorkbenchRecord, missingSlots: WorkbenchRecord[], keyframes: WorkbenchRecord[]) {
  let score = 20
  if (firstText(unit.description, unit.prompt)) score += 25
  if (missingSlots.length === 0) score += 25
  if (keyframes.length > 0) score += 20
  if (unit.status === 'locked') score += 10
  return Math.min(100, score)
}

function momentWorkStatus(moment: WorkbenchRecord, units: WorkbenchRecord[], missingSlots: WorkbenchRecord[]): WorkStatus {
  if (units.length === 0) return 'blocked'
  if (missingSlots.length > 0) return 'blocked'
  if (units.some((unit) => unit.status === 'in_production')) return 'running'
  if (moment.status === 'confirmed' && units.some((unit) => unit.status === 'confirmed' || unit.status === 'locked')) return 'ready'
  return 'review'
}

function momentProgress(
  moment: WorkbenchRecord,
  units: WorkbenchRecord[],
  missingSlots: WorkbenchRecord[],
  keyframes: WorkbenchRecord[],
  hasUnitPrompt: boolean,
) {
  let score = 15
  if (firstText(moment.description, moment.action_text) || moment.time_text || moment.location_text) score += 25
  if (units.length > 0) score += 25
  if (hasUnitPrompt) score += 15
  if (missingSlots.length === 0 && units.length > 0) score += 10
  if (keyframes.length > 0) score += 10
  return clampProgress(score)
}

function momentScopeLabel(
  moment: WorkbenchRecord,
  segment: WorkbenchRecord | undefined,
  units: WorkbenchRecord[],
  keyframes: WorkbenchRecord[],
  missingSlots: WorkbenchRecord[],
  productions: WorkbenchRecord[],
  productionIds: number[],
) {
  const productionNames = productionIds
    .map((id) => productions.find((production) => production.ID === id))
    .filter(Boolean)
    .map((production) => titleOfRecord(production))
  const parts = [
    productionNames.length > 0 ? `制作 · ${productionNames.slice(0, 2).join('、')}` : '未绑定制作',
    segment ? `编排段 · ${titleOfRecord(segment)}` : '未绑定编排段',
    moment.mood || '情绪未定',
    units.length > 0 ? `${units.length} 镜头` : '待拆镜头',
    keyframes.length > 0 ? `${keyframes.length} 关键帧` : '无关键帧',
    missingSlots.length > 0 ? `${missingSlots.length} 缺口` : null,
  ].filter(Boolean)
  return parts.join(' / ')
}

function summarizeRecordNames(records: WorkbenchRecord[], empty = '暂无') {
  if (records.length === 0) return empty
  return records.slice(0, 4).map((record) => titleOfRecord(record)).join('、')
}

function summarizeAssetSlots(records: WorkbenchRecord[], empty = '暂无素材输入') {
  if (records.length === 0) return empty
  return records
    .slice(0, 4)
    .map((record) => firstText(record.name, record.slot_key, record.kind, titleOfRecord(record)))
    .join('、')
}

function priorityFromRecord(priority?: string): Priority {
  if (priority === 'critical' || priority === 'high') return 'high'
  if (priority === 'low') return 'low'
  return 'medium'
}

function priorityRank(priority: Priority) {
  if (priority === 'high') return 3
  if (priority === 'medium') return 2
  return 1
}

function workStatusRank(status: WorkStatus) {
  if (status === 'blocked') return 0
  if (status === 'review') return 1
  if (status === 'running') return 2
  return 3
}

function assetKindLabel(kind?: string) {
  if (kind === 'video') return '视频'
  if (kind === 'audio') return '音频'
  if (kind === 'text') return '文本'
  if (kind === 'brand_pack') return '品牌包'
  if (kind === 'reference') return '参考'
  if (kind === 'image') return '图片'
  return firstText(kind, '素材')
}

function assetPriorityLabel(priority?: string) {
  if (priority === 'critical') return '紧急'
  if (priority === 'high') return '高优先级'
  if (priority === 'low') return '低优先级'
  return '普通优先级'
}

function assetStatusLabel(status?: string) {
  const normalized = normalizeAssetSlotStatus(status)
  if (normalized === 'locked') return '已锁定'
  if (normalized === 'candidate') return '候选中'
  if (normalized === 'waived') return '已豁免'
  return '缺口'
}

function contentUnitScopeLabel(unit: WorkbenchRecord, keyframes: WorkbenchRecord[], missingSlots: WorkbenchRecord[]) {
  const parts = [
    unit.kind || '制作项',
    formatDuration(unit.duration_sec),
    keyframes.length > 0 ? `关键帧 ${keyframes.length}` : '无关键帧',
    missingSlots.length > 0 ? `缺素材需求 ${missingSlots.length}` : '素材需求可用',
  ]
  return parts.join(' / ')
}

function jobToWorkStatus(job: Job): WorkStatus {
  if (job.status === 'pending' || job.status === 'running') return 'running'
  if (job.status === 'succeeded') return 'ready'
  if (job.status === 'failed' || job.status === 'cancelled') return 'blocked'
  return 'review'
}

function ScriptLinePreview({
  lines,
  highlightStartLine,
  highlightEndLine,
}: {
  lines: Array<{ lineNo: number; text: string }>
  highlightStartLine?: number
  highlightEndLine?: number
}) {
  if (lines.length === 0) {
    return (
      <div className="bg-muted/20 px-3 py-8 text-center text-xs text-muted-foreground">
        还没有可显示的行号预览
      </div>
    )
  }

  const width = Math.max(2, String(Math.max(lines.length, highlightStartLine ?? 0, highlightEndLine ?? 0)).length)

  return (
    <div className="max-h-[420px] overflow-auto bg-background font-mono text-xs leading-6">
      {lines.map((line) => {
        const highlighted = (
          highlightStartLine !== undefined &&
          highlightEndLine !== undefined &&
          line.lineNo >= highlightStartLine &&
          line.lineNo <= highlightEndLine
        )
        return (
          <div
            key={line.lineNo}
            className={cn(
              'grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-border/60 px-3 py-1.5 last:border-b-0',
              highlighted ? 'bg-primary/5 text-foreground' : 'bg-background text-muted-foreground',
            )}
          >
            <span
              className={cn('select-none text-right tabular-nums', highlighted ? 'text-primary' : 'text-muted-foreground/70')}
              style={{ width: `${width}ch` }}
            >
              {String(line.lineNo).padStart(width, '0')}
            </span>
            <span className="whitespace-pre-wrap break-words">{line.text || '\u00A0'}</span>
          </div>
        )
      })}
    </div>
  )
}

function SpecializedWorkbenchHeader({
  category,
  kicker,
  title,
  description,
  generationKind,
}: {
  category: WorkbenchCategory
  kicker: string
  title: string
  description: string
  generationKind?: CanvasWorkbenchKind
}) {
  const surface = getWorkbenchSurface(category)
  const generation = useWorkbenchCanvasLauncher(generationKind)

  return (
    <header className="shrink-0 border-b border-border bg-background px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <surface.icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database size={14} />
              <span>当前项目</span>
              <ChevronRight size={13} />
              <span>{kicker}</span>
            </div>
            <h1 className="mt-1 truncate text-lg font-semibold text-foreground">{title}</h1>
            <p className="mt-1 max-w-4xl truncate text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw size={14} />
            刷新上下文
          </Button>
          {generationKind ? (
            <Button size="sm" disabled={generation.disabled} loading={generation.loading} onClick={generation.open}>
              <ArrowRight size={14} />
              {generation.label}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function MetricStrip({ metrics }: { metrics: WorkbenchMetric[] }) {
  return (
    <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon
        return (
          <div key={metric.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <Icon size={15} />
                <span className="truncate">{metric.label}</span>
              </div>
              <Badge variant={statusVariant(metric.status)}>{statusLabel(metric.status)}</Badge>
            </div>
            <p className="mt-3 text-2xl font-semibold text-foreground">{metric.value}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{metric.detail}</p>
          </div>
        )
      })}
    </section>
  )
}

function WorkbenchPanel({
  title,
  icon: Icon,
  children,
  action,
  className,
  bodyClassName,
}: {
  title: string
  icon: typeof FileText
  children: ReactNode
  action?: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={16} className="shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

function SpecializedQueue({
  title = '生产队列',
  items,
  selectedId,
  onSelect,
  className,
  bodyClassName,
}: {
  title?: string
  items: Array<{ id: string; title: string; scope: string; status: WorkStatus; priority: Priority; progress: number; need?: string }>
  selectedId: string
  onSelect: (id: string) => void
  className?: string
  bodyClassName?: string
}) {
  return (
    <WorkbenchPanel title={title} icon={ListChecks} action={<Badge variant="secondary">{items.length}</Badge>} className={className} bodyClassName={bodyClassName}>
      <ScrollArea className="h-full min-h-0">
        <div className="space-y-2 pr-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                'w-full rounded-md border px-3 py-3 text-left transition-colors',
                selectedId === item.id ? 'border-primary/60 bg-primary/5' : 'border-border bg-background hover:bg-muted/30',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{item.title}</span>
                <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{item.scope}</p>
              {item.need ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.need}</p> : null}
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'outline'}>{priorityLabel(item.priority)}</Badge>
                <Progress value={item.progress} className="h-1.5" />
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </WorkbenchPanel>
  )
}

function QueueMiniMetric({ label, value, tone = 'default' }: { label: string; value: number | string; tone?: 'default' | 'warning' }) {
  return (
    <div className="min-w-14 rounded-md border border-border bg-background px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>{value}</p>
    </div>
  )
}

function ContextStack({ rows, className }: { rows: WorkbenchLinkRow[]; className?: string }) {
  return (
    <div className={cn('grid gap-3 md:grid-cols-2', className)}>
      {rows.map((row) => {
        const Icon = row.icon
        return (
          <div key={row.label} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon size={14} />
              <span>{row.label}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground">{row.value}</p>
          </div>
        )
      })}
    </div>
  )
}

function GateChecklist({ rows }: { rows: WorkbenchGate[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="rounded-md border border-border bg-background px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {row.done ? <CheckCircle2 size={15} className="shrink-0 text-emerald-600" /> : <CircleDot size={15} className="shrink-0 text-amber-600" />}
              <span className="truncate text-sm font-medium text-foreground">{row.label}</span>
            </div>
            <Badge variant={row.done ? 'success' : row.tone === 'warning' ? 'warning' : 'outline'}>{row.done ? '通过' : '待处理'}</Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{row.detail}</p>
        </div>
      ))}
    </div>
  )
}

function CandidateComparison({
  rows,
  primaryLabel,
  emptyText = '暂无候选',
  rowClassName,
}: {
  rows: Array<{ name: string; source: string; fit: string; issue: string; status: WorkStatus; resource?: RawResource }>
  primaryLabel: string
  emptyText?: string
  rowClassName?: string
}) {
  if (rows.length === 0) {
    return <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={`${row.name}:${row.source}`} className={cn('grid gap-3 rounded-md border border-border bg-background px-3 py-3 md:grid-cols-[3rem_1fr_1fr_1fr_auto]', rowClassName)}>
          <div className="h-12 w-12 overflow-hidden rounded-md border border-border bg-muted">
            {row.resource ? (
              <MediaViewer resource={row.resource} className="h-full w-full" lightbox={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <SquareStack size={14} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{row.source}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{primaryLabel}</p>
            <p className="mt-1 truncate text-sm text-foreground">{row.fit}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">待处理</p>
            <p className="mt-1 truncate text-sm text-foreground">{row.issue}</p>
          </div>
          <Badge variant={statusVariant(row.status)} className="self-start">{statusLabel(row.status)}</Badge>
        </div>
      ))}
    </div>
  )
}

function SettingPreparationWorkbench() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workbench', 'creative', projectId],
    queryFn: () => loadSettingPrepData(projectId!),
    enabled: !!projectId,
  })
  const rows = useMemo(() => buildSettingPrepRows(data), [data])
  const [kindFilter, setKindFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedId, setSelectedId] = useState('')
  const [contextMode, setContextMode] = useState<'usage' | 'script' | 'ai'>('usage')
  const [draft, setDraft] = useState<ReturnType<typeof buildSettingPrepForm> | null>(null)

  const kindOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1)
    return Array.from(counts.entries()).map(([kind, count]) => ({ value: kind, label: creativeReferenceKindLabel(kind), count }))
  }, [rows])
  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.rawStatus, (counts.get(row.rawStatus) ?? 0) + 1)
    return Array.from(counts.entries()).map(([status, count]) => ({ value: status, label: creativeReferenceStatusLabel(status), count }))
  }, [rows])
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (kindFilter !== 'all' && row.kind !== kindFilter) return false
    if (statusFilter !== 'all' && row.rawStatus !== statusFilter) return false
    return true
  }), [rows, kindFilter, statusFilter])
  const selected = filteredRows.find((row) => row.id === selectedId) ?? filteredRows[0] ?? rows.find((row) => row.id === selectedId) ?? rows[0] ?? null
  const metrics = buildSettingPrepMetrics(rows)
  const evidenceRows = buildSettingPrepEvidenceRows(selected)
  const contextRows = buildSettingPrepContextRows(selected)
  const checklist = buildSettingPrepChecklist(selected)

  useEffect(() => {
    if (filteredRows.length === 0) {
      if (selectedId) setSelectedId('')
      return
    }
    if (!selectedId || !filteredRows.some((row) => row.id === selectedId)) {
      setSelectedId(filteredRows[0].id)
    }
  }, [filteredRows, selectedId])

  useEffect(() => {
    if (!selected) {
      setDraft(null)
      return
    }
    setDraft(buildSettingPrepForm(selected.record))
  }, [selected?.id, selected?.record.UpdatedAt, selected?.record.status, selected?.record.name, selected?.record.content, selected?.record.profile_json, selected?.record.tags_json])

  const saveReference = useMutation({
    mutationFn: async () => {
      if (!projectId || !selected || !draft) throw new Error('请先选择设定资料')
      return updateSemanticEntity(projectId, semanticEntityConfig('creativeReferences'), selected.record.ID, {
        name: draft.name,
        alias: draft.alias,
        kind: draft.kind,
        importance: draft.importance,
        status: draft.status,
        description: draft.description,
        content: draft.content,
        profile_json: composeCreativeProfileJSON(draft.profileJson, draft.visualIntent),
        tags_json: draft.tagsJson,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workbench', 'creative', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['semantic-creative-references-page', projectId] })
      toast.success('设定资料已保存')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '保存设定资料失败'))
    },
  })

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      if (!projectId || !selected) throw new Error('请先选择设定资料')
      return updateSemanticEntity(projectId, semanticEntityConfig('creativeReferences'), selected.record.ID, { status })
    },
    onSuccess: async (record) => {
      setDraft((current) => current ? { ...current, status: normalizeCreativeReferenceStatus(record.status) } : current)
      await queryClient.invalidateQueries({ queryKey: ['workbench', 'creative', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['semantic-creative-references-page', projectId] })
      toast.success('设定状态已更新')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '更新设定状态失败'))
    },
  })

  function launchAICompletion() {
    if (!projectId || !selected) {
      toast.info('请先选择设定资料')
      return
    }
    const message = buildSettingPrepAgentMessage({
      projectName: project?.name,
      row: selected,
      evidence: evidenceRows,
      missing: selected.missing,
    })
    const requestId = `setting_prep_${selected.record.ID}_${Date.now().toString(36)}`
    openAgentPanelDraft({
      requestId,
      taskType: 'setting_preparation',
      message,
      title: `完善设定: ${selected.title}`,
      newConversation: true,
      autoSend: true,
      projectId,
      clientInput: buildCommandFirstClientInput({
        message: `请完善设定资料：${selected.title}`,
        labels: ['setting-prep-workbench', 'workbench', 'structured-output'],
        hints: {
          projectId,
          route: { pathname: '/workbench/creative' },
          selection: {
            entityType: 'creative_reference',
            entityId: selected.record.ID,
            label: selected.title,
          },
        },
      }),
      renderMode: 'page',
    })
    toast.success('已打开 AI 设定完善任务')
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <SpecializedWorkbenchHeader
        category="creative"
        kicker="设定准备"
        title="设定准备工作台"
        description="围绕已经被剧本和制作使用到的设定推进完整度：先看上下文，再用 AI 补齐缺口，最后把设定状态确认或锁定。"
      />
      <main className="min-h-0 flex-1 overflow-auto p-5">
        {!projectId ? (
          <EmptyWorkbenchState title="请先选择项目" text="当前没有可用项目，无法读取设定资料和制作上下文。" />
        ) : isLoading ? (
          <Card className="rounded-lg border-border bg-card p-8 text-center text-sm text-muted-foreground">正在加载设定准备数据...</Card>
        ) : isError ? (
          <EmptyWorkbenchState title="设定准备数据加载失败" text="后端语义实体接口未返回可用数据，稍后重试。" />
        ) : rows.length === 0 ? (
          <EmptyWorkbenchState title="暂无设定资料" text="先从剧本拆解、制作编排或设定资料页创建人物、地点、道具、风格等设定。" />
        ) : (
          <div className="setting-prep-workbench space-y-5">
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Sparkles size={14} />
                    <span>{project?.name ?? '当前项目'}</span>
                    <ChevronRight size={13} />
                    <span>设定准备</span>
                    {selected ? (
                      <>
                        <ChevronRight size={13} />
                        <span className="truncate text-foreground">{selected.title}</span>
                      </>
                    ) : null}
                  </div>
                  <h1 className="mt-2 text-lg font-semibold text-foreground">推进被生产使用的设定完整度</h1>
                  <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
                    这里按使用上下文组织设定。优先处理被制作、情景、素材需求引用但仍处于草稿或缺口状态的资料。
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <QueueMiniMetric label="制作" value={data?.productions.length ?? 0} />
                  <QueueMiniMetric label="剧本" value={(data?.scripts.length ?? 0) + (data?.scriptVersions.length ?? 0)} />
                  <QueueMiniMetric label="情景" value={data?.sceneMoments.length ?? 0} />
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[220px_220px_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">类型</p>
                  <Select value={kindFilter} onValueChange={setKindFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="全部类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型 · {rows.length}</SelectItem>
                      {kindOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label} · {option.count}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">状态</p>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="全部状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态 · {rows.length}</SelectItem>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label} · {option.count}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-end justify-end gap-2">
                  <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => { setKindFilter('all'); setStatusFilter('all') }}>
                    <RefreshCw size={14} />
                    清空筛选
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => navigate('/creative-references')}>
                    <ArrowRight size={14} />
                    设定资料页
                  </Button>
                  <Button size="sm" className="h-9 gap-2" onClick={launchAICompletion} disabled={!selected}>
                    <Wand2 size={14} />
                    AI 完善当前设定
                  </Button>
                </div>
              </div>
            </section>

            <MetricStrip metrics={metrics} />

            <div className="grid gap-5 2xl:grid-cols-[340px_minmax(0,1fr)_380px]">
              <SpecializedQueue
                title="待完善设定"
                className="flex min-h-[720px] flex-col overflow-hidden"
                bodyClassName="min-h-0 flex-1 overflow-hidden"
                items={filteredRows.map((row) => ({
                  id: row.id,
                  title: row.title,
                  scope: row.scope,
                  status: row.status,
                  priority: row.priority,
                  progress: row.progress,
                  need: [row.readinessLabel, ...row.missing.slice(0, 2)].join(' · '),
                }))}
                selectedId={selected?.id ?? ''}
                onSelect={(id) => setSelectedId(id)}
              />

              <div className="min-w-0 space-y-5">
                <WorkbenchPanel
                  title="设定完善面板"
                  icon={Sparkles}
                  action={selected ? (
                    <div className="flex items-center gap-2">
                      <SettingPrepStateBadge status={draft?.status ?? selected.rawStatus} />
                      <Badge variant="outline">准备度 {selected.progress}%</Badge>
                    </div>
                  ) : undefined}
                >
                  {!selected || !draft ? (
                    <EmptyWorkbenchState title="暂无可编辑设定" text="请选择左侧队列中的设定资料。" />
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_150px]">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">名称</Label>
                          <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">类型</Label>
                          <Select value={draft.kind} onValueChange={(value) => setDraft({ ...draft, kind: value })}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['person', 'place', 'prop', 'style', 'world_rule', 'product', 'brand', 'restriction'].map((kind) => (
                                <SelectItem key={kind} value={kind}>{creativeReferenceKindLabel(kind)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">重要性</Label>
                          <Select value={draft.importance} onValueChange={(value) => setDraft({ ...draft, importance: value })}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="main">主要</SelectItem>
                              <SelectItem value="supporting">辅助</SelectItem>
                              <SelectItem value="background">背景</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">别名 / 识别词</Label>
                          <Input value={draft.alias} onChange={(event) => setDraft({ ...draft, alias: event.target.value })} placeholder="可选，用于查重和 AI 识别" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">状态</Label>
                          <Select value={draft.status} onValueChange={(value) => setDraft({ ...draft, status: value })}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">草稿</SelectItem>
                              <SelectItem value="confirmed">已确认</SelectItem>
                              <SelectItem value="locked">已锁定</SelectItem>
                              <SelectItem value="merged">已合并</SelectItem>
                              <SelectItem value="ignored">已忽略</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-3 xl:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">设定摘要</Label>
                          <Textarea
                            value={draft.description}
                            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                            className="min-h-32 resize-none text-sm leading-6"
                            placeholder="这个设定在故事和制作中是什么。"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">设定正文</Label>
                          <Textarea
                            value={draft.content}
                            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                            className="min-h-32 resize-none text-sm leading-6"
                            placeholder="稳定事实、不可改写项、剧情作用、人物关系等。"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">视觉锚点 / 生成约束</Label>
                        <Textarea
                          value={draft.visualIntent}
                          onChange={(event) => setDraft({ ...draft, visualIntent: event.target.value })}
                          className="min-h-24 resize-none text-sm leading-6"
                          placeholder="外观、材质、色彩、风格、禁止项和生成提示词要点。"
                        />
                      </div>

                      <div className="grid gap-3 xl:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">档案 JSON</Label>
                          <Textarea
                            value={draft.profileJson}
                            onChange={(event) => setDraft({ ...draft, profileJson: event.target.value })}
                            className="min-h-24 resize-none font-mono text-xs"
                            placeholder='{"appearance":"...","rules":["..."]}'
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">标签 JSON</Label>
                          <Textarea
                            value={draft.tagsJson}
                            onChange={(event) => setDraft({ ...draft, tagsJson: event.target.value })}
                            className="min-h-24 resize-none font-mono text-xs"
                            placeholder='["主角","雨夜","关键道具"]'
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                        <div className="flex flex-wrap gap-2">
                          {selected.missing.map((item) => <SettingPrepTag key={item}>{item}</SettingPrepTag>)}
                          {selected.warnings.map((item) => <SettingPrepTag key={item}>{item}</SettingPrepTag>)}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button variant="outline" size="sm" className="gap-2" onClick={launchAICompletion}>
                            <Wand2 size={14} />
                            AI 补全
                          </Button>
                          <Button size="sm" loading={saveReference.isPending} onClick={() => saveReference.mutate()}>
                            保存设定
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </WorkbenchPanel>

                <WorkbenchPanel title="完成条件" icon={ClipboardCheck} action={selected ? <Badge variant={selected.missing.length > 0 ? 'warning' : 'success'}>{selected.readinessLabel}</Badge> : undefined}>
                  <GateChecklist rows={checklist} />
                </WorkbenchPanel>
              </div>

              <div className="min-w-0 space-y-5">
                <WorkbenchPanel
                  title="上下文"
                  icon={GitBranch}
                  action={(
                    <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
                      {[
                        ['usage', '使用'],
                        ['script', '剧本'],
                        ['ai', 'AI'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setContextMode(value as 'usage' | 'script' | 'ai')}
                          className={cn(
                            'rounded px-2 py-1 text-xs transition-colors',
                            contextMode === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                >
                  {!selected ? (
                    <EmptyWorkbenchState title="暂无上下文" text="选择设定资料后查看使用位置、剧本证据和 AI 补全入口。" />
                  ) : contextMode === 'usage' ? (
                    <div className="space-y-4">
                      <ContextStack rows={contextRows} className="grid-cols-1" />
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">使用位置</p>
                        {selected.usages.length === 0 ? (
                          <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">这个设定还没有被情景、编排段或镜头引用。</p>
                        ) : (
                          selected.usages.slice(0, 6).map((usage) => (
                            <div key={usage.ID} className="rounded-md border border-border bg-background px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {firstText(usage.role, usage.owner_type, '引用')} · #{usage.owner_id}
                                </p>
                                <Badge variant={creativeUsageStatusVariant(usage.status)}>{creativeUsageStatusLabel(usage.status)}</Badge>
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{firstText(usage.evidence, usage.source, '暂无证据说明')}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : contextMode === 'script' ? (
                    <div className="space-y-3">
                      {evidenceRows.map((row) => (
                        <SettingPrepHintCard key={row} label="剧本 / 编排证据" text={row} />
                      ))}
                      <div className="rounded-md border border-border bg-background px-3 py-3">
                        <p className="text-xs text-muted-foreground">制作上下文</p>
                        <p className="mt-2 text-sm leading-6 text-foreground">{buildSettingPrepUsageSummary(selected)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-3">
                        <p className="text-sm font-medium text-foreground">AI 完善任务</p>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          AI 会读取当前设定、缺口、使用位置和剧本证据，输出可复制回设定字段的补全建议。
                        </p>
                        <Button className="mt-3 w-full justify-start gap-2" onClick={launchAICompletion}>
                          <Wand2 size={15} />
                          生成完善建议
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">建议 AI 优先处理</p>
                        {(selected.missing.length > 0 ? selected.missing : ['检查设定是否足够进入下游']).map((item) => (
                          <SettingPrepHintCard key={item} label="待处理" text={item} />
                        ))}
                      </div>
                      <div className="space-y-2 border-t border-border pt-4">
                        <p className="text-xs font-medium text-muted-foreground">完成后设置状态</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            ['draft', '草稿'],
                            ['confirmed', '已确认'],
                            ['locked', '已锁定'],
                            ['merged', '已合并'],
                            ['ignored', '已忽略'],
                          ].map(([status, label]) => (
                            <Button
                              key={status}
                              variant={selected.rawStatus === status ? 'primary' : 'outline'}
                              size="sm"
                              className="justify-start gap-2"
                              loading={updateStatus.isPending && updateStatus.variables === status}
                              onClick={() => updateStatus.mutate(status)}
                            >
                              {status === 'locked' ? <LockKeyhole size={14} /> : status === 'confirmed' ? <CheckCircle2 size={14} /> : <CircleDot size={14} />}
                              {label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </WorkbenchPanel>

                <WorkbenchPanel title="下游可用性" icon={ShieldCheck} action={selected ? <Badge variant={selected.progress >= 80 ? 'success' : 'warning'}>{selected.progress}%</Badge> : undefined}>
                  {!selected ? (
                    <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">暂无设定。</p>
                  ) : (
                    <div className="space-y-3">
                      <SettingPrepHintCard label="分镜 / 情节" text={selected.linkedSceneMoments.length > 0 ? `${selected.linkedSceneMoments.length} 个情景会引用这个设定` : '还没有进入情景引用'} />
                      <SettingPrepHintCard label="素材准备" text={selected.assetSlots.length > 0 ? `${selected.assetSlots.length} 个素材需求依赖这个设定` : '还没有素材需求绑定'} />
                      <SettingPrepHintCard label="生成约束" text={firstText(draft?.visualIntent, selected.record.description, '补充视觉锚点后可进入提示词和审核标准')} />
                    </div>
                  )}
                </WorkbenchPanel>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function ContentGenerationWorkbench() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workbench', 'production', projectId],
    queryFn: () => loadProductionWorkbenchData(projectId!),
    enabled: !!projectId,
  })
  const rows = useMemo(() => buildContentGenerationMomentRows(data), [data])
  const [productionFilter, setProductionFilter] = useState('all')
  const [segmentFilter, setSegmentFilter] = useState('all')
  const [selectedId, setSelectedId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [creatingUnit, setCreatingUnit] = useState(false)
  const [aiSuggestOpen, setAiSuggestOpen] = useState(false)
  const [aiSuggestRunning, setAiSuggestRunning] = useState(false)
  const [aiSuggestError, setAiSuggestError] = useState<string | null>(null)
  const [aiSuggestions, setAiSuggestions] = useState<AiUnitSuggestion[]>([])
  const [aiSuggestSelected, setAiSuggestSelected] = useState<Set<string>>(new Set())
  const [aiSuggestBrief, setAiSuggestBrief] = useState('')
  const [aiModelId, setAiModelId] = useState<number | null>(null)
  const [aiModelName, setAiModelName] = useState<string | undefined>(undefined)
  const productionFilteredRows = useMemo(() => {
    if (productionFilter === 'all') return rows
    if (productionFilter === 'unassigned') return rows.filter((row) => row.productionIds.length === 0)
    const productionId = Number(productionFilter)
    if (!Number.isFinite(productionId) || productionId <= 0) return rows
    return rows.filter((row) => row.productionIds.includes(productionId))
  }, [productionFilter, rows])
  const filteredRows = useMemo(() => {
    if (segmentFilter === 'all') return productionFilteredRows
    if (segmentFilter === 'unassigned') return productionFilteredRows.filter((row) => !row.segment?.ID)
    const segmentId = Number(segmentFilter)
    if (!Number.isFinite(segmentId) || segmentId <= 0) return productionFilteredRows
    return productionFilteredRows.filter((row) => row.segment?.ID === segmentId)
  }, [productionFilteredRows, segmentFilter])
  const productionFilterOptions = useMemo(() => {
    const productions = data?.productions ?? []
    const unassignedCount = rows.filter((row) => row.productionIds.length === 0).length
    return [
      { value: 'all', label: '全部制作', count: rows.length },
      { value: 'unassigned', label: '未绑定制作', count: unassignedCount },
      ...productions.map((production) => ({
        value: String(production.ID),
        label: titleOfRecord(production),
        count: rows.filter((row) => row.productionIds.includes(production.ID)).length,
      })),
    ]
  }, [data?.productions, rows])
  const segmentFilterOptions = useMemo(() => {
    const segmentMap = new Map<string, { value: string; label: string; count: number }>()
    let unassignedCount = 0
    for (const row of productionFilteredRows) {
      if (!row.segment?.ID) {
        unassignedCount += 1
        continue
      }
      const key = String(row.segment.ID)
      const existing = segmentMap.get(key)
      if (existing) existing.count += 1
      else segmentMap.set(key, { value: key, label: titleOfRecord(row.segment), count: 1 })
    }
    return [
      { value: 'all', label: '全部情绪段', count: productionFilteredRows.length },
      ...(unassignedCount > 0 ? [{ value: 'unassigned', label: '未绑定情绪段', count: unassignedCount }] : []),
      ...Array.from(segmentMap.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN')),
    ]
  }, [productionFilteredRows])
  const sceneMomentFilterOptions = useMemo(() => filteredRows.map((row) => ({
    value: row.id,
    label: row.title,
    count: row.units.length,
  })), [filteredRows])

  useEffect(() => {
    if (segmentFilter !== 'all' && segmentFilter !== 'unassigned' && !segmentFilterOptions.some((option) => option.value === segmentFilter)) {
      setSegmentFilter('all')
    }
  }, [segmentFilter, segmentFilterOptions])

  useEffect(() => {
    if (filteredRows.length === 0) {
      if (selectedId) setSelectedId('')
      return
    }
    if (!selectedId || !filteredRows.some((row) => row.id === selectedId)) {
      setSelectedId(filteredRows[0].id)
    }
  }, [filteredRows, selectedId])

  const selected = filteredRows.find((item) => item.id === selectedId) ?? filteredRows[0] ?? null
  const selectedUnit = selected?.units.find((unit) => firstText(unit.prompt, unit.description)) ?? selected?.units[0] ?? null
  const selectedProduction = selected?.productionIds[0]
    ? data?.productions.find((production) => production.ID === selected.productionIds[0])
    : null
  const uploadTargetSlot = selected?.missingSlots[0] ?? selected?.assetSlots[0] ?? null
  const generationContextQuery = useQuery({
    queryKey: ['workbench', 'production', 'generation-context', projectId, selectedUnit?.ID],
    queryFn: () => buildContentUnitGenerationContext(projectId!, selectedUnit!.ID, 'video'),
    enabled: !!projectId && !!selectedUnit?.ID,
  })
  const uploadCandidate = useMutation({
    mutationFn: async (file: File) => {
      if (!projectId) throw new Error('请先选择项目')
      if (!uploadTargetSlot) throw new Error('当前情节没有可挂载候选的素材需求')
      const fd = new FormData()
      fd.append('file', file)
      const resource = await api.post('/resources/upload', fd).then((r) => r.data as RawResource)
      await api.post(`/projects/${projectId}/entities/asset-slot-candidates`, {
        asset_slot_id: uploadTargetSlot.ID,
        resource_id: resource.ID,
        source_type: 'upload',
        source_id: resource.ID,
        score: 0.75,
        status: 'candidate',
        note: `内容编排主动上传：${resource.name}`,
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workbench', 'production', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['workbench', 'assets', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['resources'] }),
        queryClient.invalidateQueries({ queryKey: ['semantic-asset-slot-candidates-page', projectId] }),
      ])
      toast.success('候选已上传')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '上传候选失败'))
    },
    onSettled: () => {
      setUploading(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    },
  })
  const openUnitCanvas = useMutation({
    mutationFn: (unit: WorkbenchRecord) => {
      if (!projectId) throw new Error('请先选择项目')
      return api.post('/canvases', {
        name: `${titleOfRecord(unit)} · 内容编排`,
        project_id: projectId,
        canvas_type: 'workflow',
        stage: 'generation',
        ref_type: 'content_unit',
        ref_id: unit.ID,
      }).then((r) => r.data as Canvas)
    },
    onSuccess: (canvas) => navigate(`/canvases/${canvas.ID}`),
  })
  const metrics = buildMomentMetrics(filteredRows, data)
  const candidateRows = buildProductionCandidateRows(data?.jobs ?? [])
  const standards = generationContextQuery.data
    ? buildGenerationContextStandards(generationContextQuery.data)
    : buildMomentStandards(selected, data?.jobs ?? [])
  const contextRows = buildMomentContext(selected)
  const generationContextRows = buildGenerationContextRows(generationContextQuery.data)
  const missingGenerationContext = generationContextQuery.data
    ? buildGenerationContextStandards(generationContextQuery.data).filter((item) => !item.done)
    : []

  function triggerCandidateUpload() {
    if (!uploadTargetSlot || uploading || uploadCandidate.isPending) return
    uploadInputRef.current?.click()
  }

  function handleCandidateUpload(file?: File) {
    if (!file || !uploadTargetSlot || uploadCandidate.isPending) return
    setUploading(true)
    uploadCandidate.mutate(file)
  }

  const contentUnitConfig = useMemo(() => semanticEntityConfig('contentUnits'), [])
  const productionWorkbenchQueryKey = ['workbench', 'production', projectId] as const
  const unitCandidates = useMemo(() => {
    if (!selected) return [] as WorkbenchRecord[]
    return selected.units.filter((unit) => {
      const status = String(unit.status ?? '').toLowerCase()
      return status === '' || status === 'draft' || status === 'candidate'
    })
  }, [selected])
  const confirmCandidate = useMutation({
    mutationFn: async ({ unitId, next }: { unitId: number; next: 'confirmed' | 'ignored' }) => {
      if (!projectId) throw new Error('请先选择项目')
      await updateSemanticEntity(projectId, contentUnitConfig, unitId, { status: next })
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: productionWorkbenchQueryKey })
      toast.success(variables.next === 'confirmed' ? '候选已确认' : '候选已忽略')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '候选状态更新失败'))
    },
  })
  const createUnitsFromAI = useMutation({
    mutationFn: async (items: AiUnitSuggestion[]) => {
      if (!projectId) throw new Error('请先选择项目')
      if (!selected) throw new Error('请先选择情节')
      const baseOrder = selected.units.length
      const segmentId = selected.segment?.ID ?? null
      const momentId = selected.moment.ID
      const productionId = selectedUnit?.production_id ?? selected.segment?.production_id ?? null
      const created: SemanticEntityRecord[] = []
      for (let i = 0; i < items.length; i += 1) {
        const suggestion = items[i]
        const payload: SemanticEntityPayload = {
          title: suggestion.title,
          kind: suggestion.kind || 'shot',
          order: baseOrder + i + 1,
          status: 'candidate',
          segment_id: segmentId,
          scene_moment_id: momentId,
          production_id: productionId,
        }
        if (suggestion.description) payload.description = suggestion.description
        if (suggestion.prompt) payload.prompt = suggestion.prompt
        if (suggestion.duration_sec) payload.duration_sec = suggestion.duration_sec
        if (suggestion.shot_size) payload.shot_size = suggestion.shot_size
        if (suggestion.camera_angle) payload.camera_angle = suggestion.camera_angle
        if (suggestion.camera_motion) payload.camera_motion = suggestion.camera_motion
        const saved = await createSemanticEntity(projectId, contentUnitConfig, payload)
        created.push(saved)
      }
      return created
    },
    onSuccess: async (records) => {
      await queryClient.invalidateQueries({ queryKey: productionWorkbenchQueryKey })
      toast.success(`已加入 ${records.length} 个候选单元`)
      setAiSuggestions([])
      setAiSuggestSelected(new Set())
      setAiSuggestOpen(false)
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '候选单元创建失败'))
    },
  })

  async function runAiSuggest() {
    if (!projectId || !selected) return
    if (!aiModelId) {
      toast.error('请选择文本模型')
      return
    }
    setAiSuggestRunning(true)
    setAiSuggestError(null)
    try {
      const brief = aiSuggestBrief.trim()
      const prompt = brief
        ? `请基于当前情节建议 3-6 条尚未创建的内容单元。\n创作者补充：${brief}`
        : '请基于当前情节建议 3-6 条尚未创建的内容单元。'
      const { run, thread } = await runRuntimeMessage({
        message: prompt,
        title: '内容单元 AI 建议',
        modelConfigId: aiModelId,
        modelName: aiModelName,
        clientInput: buildCommandFirstClientInput({
          message: prompt,
          labels: ['workbench', 'content-unit-suggest'],
          hints: {
            projectId,
            productionId: selectedProduction?.ID,
            route: { pathname: '/workbench/production' },
            selection: {
              entityType: 'scene_moment',
              entityId: selected.moment.ID,
              label: selected.title,
            },
          },
        }),
        timeoutMs: 90_000,
        pollMs: 500,
        sessionId: `content_unit_suggest_${projectId}_${selected.moment.ID}_${Date.now()}`,
        sessionTaskType: 'content_unit_suggest',
      })
      const raw = formatLocalAgentAssistantContent(run, thread)
      const parsed = parseAiUnitSuggestions(raw)
      if (parsed.length === 0) {
        setAiSuggestError('模型没有返回可解析的候选单元，请重试或调整补充说明。')
      } else {
        setAiSuggestions(parsed)
        setAiSuggestSelected(new Set(parsed.map((item) => item.client_id)))
      }
    } catch (error) {
      setAiSuggestError(error instanceof Error ? error.message : String(error))
    } finally {
      setAiSuggestRunning(false)
    }
  }

  function toggleAiSuggestion(clientId: string) {
    setAiSuggestSelected((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  function acceptAiSuggestions() {
    const items = aiSuggestions.filter((item) => aiSuggestSelected.has(item.client_id))
    if (items.length === 0) {
      toast.error('至少勾选一条候选单元')
      return
    }
    createUnitsFromAI.mutate(items)
  }

  function openAiSuggest() {
    if (!selected) return
    setAiSuggestError(null)
    setAiSuggestions([])
    setAiSuggestSelected(new Set())
    setAiSuggestOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <SpecializedWorkbenchHeader
        category="production"
        generationKind="production"
        kicker="内容编排"
        title="内容编排工作台"
        description="先以情节承载上下文，再手动添加制作项或由 AI 规划拆镜，并把设定资料和素材一起带入生成流程。"
      />
      <main className="min-h-0 flex-1 overflow-auto p-5">
        {!projectId ? (
          <EmptyWorkbenchState title="请先选择项目" text="当前没有可用的项目信息，无法拉取情节、制作项、素材需求和生成任务。" />
        ) : isLoading ? (
          <Card className="rounded-lg border-border bg-card p-8 text-center text-sm text-muted-foreground">正在加载内容编排数据...</Card>
        ) : isError ? (
          <EmptyWorkbenchState title="内容编排数据加载失败" text="后端语义实体接口未返回可用数据，稍后重试。" />
        ) : (
          <div className="production-workbench space-y-5">
            <section className="rounded-lg border border-border bg-card">
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <ListChecks size={14} />
                        生产队列
                      </div>
                      <p className="mt-1 truncate text-base font-semibold text-foreground">{selected ? selected.title : '暂无情节'}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{selected ? selected.scope : '选择制作后查看情节队列'}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <QueueMiniMetric label="情节" value={filteredRows.length} />
                      <QueueMiniMetric label="单元" value={selected?.units.length ?? 0} />
                      <QueueMiniMetric label="素材" value={selected?.assetSlots.length ?? 0} />
                      <QueueMiniMetric label="缺口" value={selected?.missingSlots.length ?? 0} tone={(selected?.missingSlots.length ?? 0) > 0 ? 'warning' : 'default'} />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {filteredRows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className={cn(
                          'min-w-[220px] rounded-md border px-3 py-2 text-left transition-colors',
                          selected?.id === row.id ? 'border-primary/60 bg-primary/5' : 'border-border bg-background hover:bg-muted/30',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{row.title}</span>
                          <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {row.units.length === 0 ? '待添加内容单元' : `${row.units.length} 单元 / ${row.missingSlots.length} 缺口`}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Settings2 size={14} />
                    入口与筛选
                  </div>
                  <Select value={productionFilter} onValueChange={setProductionFilter}>
                    <SelectTrigger className="mt-3 h-9">
                      <SelectValue placeholder="选择制作" />
                    </SelectTrigger>
                    <SelectContent>
                      {productionFilterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label} · {option.count}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                    <SelectTrigger className="mt-2 h-9">
                      <SelectValue placeholder="选择情绪段" />
                    </SelectTrigger>
                    <SelectContent>
                      {segmentFilterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label} · {option.count}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selected?.id ?? ''} onValueChange={setSelectedId} disabled={sceneMomentFilterOptions.length === 0}>
                    <SelectTrigger className="mt-2 h-9">
                      <SelectValue placeholder="选择情节" />
                    </SelectTrigger>
                    <SelectContent>
                      {sceneMomentFilterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label} · {option.count} 单元
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    添加单元会写入当前情节：{selected ? titleOfRecord(selected.moment) : '未选择情节'}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => setCreatingUnit(true)} disabled={!selected}>
                      <Boxes size={13} />
                      添加内容单元
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-2" onClick={openAiSuggest} disabled={!selected || aiSuggestRunning}>
                      <Sparkles size={13} />
                      AI 建议
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <WorkbenchPanel
                title="内容单元列表"
                icon={Boxes}
                action={<Badge variant={selected?.units.length ? 'secondary' : 'warning'}>{selected?.units.length ?? 0} 个</Badge>}
              >
                {!selected ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">选择情节后查看内容单元。</p>
                ) : selected.units.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-background px-3 py-8 text-center">
                    <p className="text-sm font-medium text-foreground">这个情节还没有内容单元</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">先添加镜头、旁白、字幕卡或转场，再进入候选和生成检查。</p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <Button size="sm" className="gap-2" onClick={() => setCreatingUnit(true)}>
                        <Boxes size={14} />
                        添加内容单元
                      </Button>
                      <Button size="sm" variant="outline" className="gap-2" onClick={openAiSuggest}>
                        <Sparkles size={14} />
                        AI 建议
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selected.units.map((unit, index) => {
                      const unitSlots = selected.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === unit.ID)
                      const missingUnitSlots = unitSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
                      const unitStatus = contentUnitWorkStatus(unit, missingUnitSlots)
                      return (
                        <button
                          key={unit.ID}
                          type="button"
                          onClick={() => navigate(`/contents?content_unit_id=${unit.ID}&scene_moment_id=${selected.moment.ID}`)}
                          className={cn(
                            'w-full rounded-md border px-3 py-3 text-left transition-colors',
                            selectedUnit?.ID === unit.ID ? 'border-primary/60 bg-primary/5' : 'border-border bg-background hover:bg-muted/30',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] text-muted-foreground">内容单元 {index + 1}</p>
                              <p className="mt-1 truncate text-sm font-medium text-foreground">{titleOfRecord(unit)}</p>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{firstText(unit.description, unit.prompt, '暂无描述或生成提示')}</p>
                            </div>
                            <Badge variant={statusVariant(unitStatus)}>{statusLabel(unitStatus)}</Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant="outline">{unit.kind || 'shot'}</Badge>
                            <Badge variant="outline">{formatDuration(unit.duration_sec)}</Badge>
                            <Badge variant={unitSlots.length > 0 ? 'secondary' : 'warning'}>{unitSlots.length} 素材</Badge>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </WorkbenchPanel>

              <div className="min-w-0 space-y-5">
                <WorkbenchPanel title="情节上下文" icon={Layers}>
                  {selected ? (
                    <>
                      <div className="mb-4 grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-[1fr_auto]">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">当前情节</p>
                          <h2 className="mt-1 truncate text-xl font-semibold text-foreground">{selected.title}</h2>
                          <p className="mt-1 truncate text-sm text-muted-foreground">{selected.scope}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusVariant(selected.status)}>{statusLabel(selected.status)}</Badge>
                          <Badge variant="outline">准备度 {selected.progress}%</Badge>
                        </div>
                      </div>
                      <ContextStack
                        rows={[
                          { label: '制作', value: selectedProduction ? titleOfRecord(selectedProduction) : '未绑定制作', icon: Clapperboard },
                          { label: '情绪段', value: selected.segment ? titleOfRecord(selected.segment) : '未绑定情绪段', icon: GitBranch },
                          ...contextRows,
                        ]}
                        className="production-context-stack"
                      />
                    </>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">暂无情节</p>
                  )}
                </WorkbenchPanel>

                <WorkbenchPanel
                  title="内容单元候选"
                  icon={Play}
                  action={<Badge variant={unitCandidates.length > 0 ? 'secondary' : 'outline'}>{unitCandidates.length} 条待确认</Badge>}
                >
                  <div className="space-y-4">
                    <div className="grid gap-2 md:grid-cols-3">
                      <Button className="justify-start gap-2" onClick={() => setCreatingUnit(true)} disabled={!selected}>
                        <Boxes size={15} />
                        添加内容单元
                      </Button>
                      <Button variant="outline" className="justify-start gap-2" onClick={openAiSuggest} disabled={!selected || aiSuggestRunning}>
                        <Sparkles size={15} />
                        {aiSuggestRunning ? 'AI 建议中' : 'AI 建议'}
                      </Button>
                      <Button variant="outline" className="justify-start gap-2" onClick={() => selectedUnit ? openUnitCanvas.mutate(selectedUnit) : setCreatingUnit(true)} loading={openUnitCanvas.isPending} disabled={!selected}>
                        <Play size={15} />
                        {selectedUnit ? '打开编排画布' : '先创建内容单元'}
                      </Button>
                    </div>
                    {!selected ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">选择情节后查看候选单元。</p>
                    ) : unitCandidates.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                        当前情节没有待确认的候选单元。通过「添加内容单元」或「AI 建议」可新增候选。
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {unitCandidates.map((unit) => {
                          const isDraft = String(unit.status ?? '').toLowerCase() === 'draft'
                          return (
                            <div key={unit.ID} className="rounded-md border border-border bg-background p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate text-sm font-medium text-foreground">{titleOfRecord(unit)}</p>
                                    <Badge variant={isDraft ? 'outline' : 'secondary'}>{isDraft ? '草稿' : '候选'}</Badge>
                                    <Badge variant="outline">{unit.kind || 'shot'}</Badge>
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                    {firstText(unit.description, unit.prompt, '暂无描述或生成提示')}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                    <span>时长 {formatDuration(unit.duration_sec)}</span>
                                    {unit.shot_size ? <span>景别 {unit.shot_size}</span> : null}
                                    {unit.camera_angle ? <span>机位 {unit.camera_angle}</span> : null}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 gap-1"
                                    onClick={() => confirmCandidate.mutate({ unitId: unit.ID, next: 'ignored' })}
                                    disabled={confirmCandidate.isPending}
                                  >
                                    忽略
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-8 gap-1"
                                    onClick={() => confirmCandidate.mutate({ unitId: unit.ID, next: 'confirmed' })}
                                    disabled={confirmCandidate.isPending}
                                  >
                                    <CheckCircle2 size={13} />
                                    确认
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="rounded-md border border-border bg-background p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Upload size={15} className="text-muted-foreground" />
                          素材候选上传
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-2"
                          onClick={triggerCandidateUpload}
                          disabled={!uploadTargetSlot || uploading || uploadCandidate.isPending}
                        >
                          <Upload size={13} />
                          {uploading || uploadCandidate.isPending ? '上传中' : '上传素材候选'}
                        </Button>
                      </div>
                      {uploadTargetSlot ? (
                        <p className="text-xs text-muted-foreground">会挂到素材需求：{titleOfRecord(uploadTargetSlot)}</p>
                      ) : (
                        <p className="text-xs text-amber-700 dark:text-amber-300">当前情节暂无素材需求，先添加素材需求后即可上传素材候选。</p>
                      )}
                      {candidateRows.length > 0 ? (
                        <div className="mt-3">
                          <CandidateComparison rows={candidateRows} primaryLabel="优势" emptyText="当前项目还没有视频生成任务" rowClassName="production-candidate-row" />
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-md border border-border bg-background p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <ClipboardCheck size={15} className="text-muted-foreground" />
                          生成上下文检查
                        </div>
                        {!selectedUnit ? (
                          <Badge variant="warning">待生成镜头</Badge>
                        ) : generationContextQuery.isFetching ? (
                          <Badge variant="secondary">检查中</Badge>
                        ) : generationContextQuery.isError ? (
                          <Badge variant="warning">检查失败</Badge>
                        ) : (
                          <Badge variant={missingGenerationContext.length > 0 ? 'warning' : 'success'}>
                            {missingGenerationContext.length > 0 ? `${missingGenerationContext.length} 个缺失` : '上下文可用'}
                          </Badge>
                        )}
                      </div>
                      {!selected ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">选择情节后检查生成上下文。</p>
                      ) : !selectedUnit ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">当前情节还没有内容单元，暂时不能读取内容单元级生成上下文。</p>
                      ) : generationContextQuery.isLoading ? (
                        <p className="rounded-md border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">正在读取后端生成上下文...</p>
                      ) : generationContextQuery.isError ? (
                        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-800">
                          {apiErrorMessage(generationContextQuery.error, '后端上下文检查失败，请确认后端已更新并重新加载页面。')}
                        </p>
                      ) : generationContextQuery.data ? (
                        <div className="space-y-4">
                          <ContextStack rows={generationContextRows} className="production-context-stack" />
                          {missingGenerationContext.length > 0 ? (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
                              <p className="text-sm font-medium text-amber-900">生成前建议补齐</p>
                              <div className="mt-2 space-y-1">
                                {missingGenerationContext.map((item) => (
                                  <p key={item.label} className="text-xs leading-5 text-amber-800">{item.label}：{item.detail}</p>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                              当前内容单元的后端生成上下文已具备，可以进入生成计划阶段。
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </WorkbenchPanel>
              </div>
            </div>
            <input ref={uploadInputRef} type="file" className="hidden" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleCandidateUpload(e.target.files?.[0])} />
          </div>
        )}
      </main>

      <Dialog open={creatingUnit} onOpenChange={(open) => { if (!open) setCreatingUnit(false) }}>
        <DialogContent className="max-h-[88vh] w-[min(760px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>添加内容单元</DialogTitle>
            <DialogDescription>
              {selected ? `将作为候选加入当前情节：${selected.title}` : '请先选择情节再添加内容单元。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {selected ? (
              <SemanticEntityInlineEditor
                projectId={projectId}
                config={contentUnitConfig}
                record={null}
                defaults={{
                  segment_id: selected.segment?.ID ?? null,
                  scene_moment_id: selected.moment.ID,
                  production_id: selectedUnit?.production_id ?? selected.segment?.production_id ?? null,
                  order: selected.units.length + 1,
                  kind: 'shot',
                  status: 'candidate',
                }}
                queryKey={productionWorkbenchQueryKey}
                title="新建内容单元"
                description="填写制作项基本信息后保存，加入当前情节候选。"
                onSaved={() => {
                  setCreatingUnit(false)
                }}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                请先在左侧筛选中选择情节。
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={aiSuggestOpen} onOpenChange={(open) => { if (!open) setAiSuggestOpen(false) }}>
        <DialogContent className="max-h-[88vh] w-[min(720px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>AI 建议内容单元</DialogTitle>
            <DialogDescription>
              {selected ? `基于情节「${selected.title}」生成候选单元，勾选后批量加入。` : '请先选择情节再使用 AI 建议。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">文本模型</Label>
              <ModelSelector
                capability="text"
                value={aiModelId}
                onChange={(id) => setAiModelId(id)}
                onModelChange={(model) => setAiModelName(model?.short_name || model?.display_name || model?.logical_model_id || undefined)}
                disabled={aiSuggestRunning}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">补充说明（可选）</Label>
              <Textarea
                value={aiSuggestBrief}
                onChange={(e) => setAiSuggestBrief(e.target.value)}
                placeholder="例如：强调情绪反差、突出产品细节、加一条旁白..."
                rows={3}
                disabled={aiSuggestRunning}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {aiSuggestions.length > 0
                  ? `已生成 ${aiSuggestions.length} 条候选，勾选后加入`
                  : aiSuggestRunning ? '正在生成候选...' : '点击生成后将获得 3-6 条候选单元'}
              </p>
              <Button size="sm" className="gap-2" onClick={runAiSuggest} loading={aiSuggestRunning} disabled={!selected || !aiModelId}>
                <Sparkles size={14} />
                {aiSuggestions.length > 0 ? '重新生成' : '生成候选'}
              </Button>
            </div>
            {aiSuggestError ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{aiSuggestError}</p>
            ) : null}
            {aiSuggestions.length > 0 ? (
              <div className="space-y-2">
                {aiSuggestions.map((item) => {
                  const checked = aiSuggestSelected.has(item.client_id)
                  return (
                    <label
                      key={item.client_id}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition-colors',
                        checked ? 'border-primary/60 bg-primary/5' : 'border-border bg-background hover:bg-muted/30',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => toggleAiSuggestion(item.client_id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{item.title}</span>
                          <Badge variant="outline">{item.kind}</Badge>
                          {item.duration_sec ? <Badge variant="outline">{item.duration_sec}s</Badge> : null}
                          {item.shot_size ? <Badge variant="outline">{item.shot_size}</Badge> : null}
                          {item.camera_angle ? <Badge variant="outline">{item.camera_angle}</Badge> : null}
                        </div>
                        {item.description ? (
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                        ) : null}
                        {item.prompt ? (
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">提示词：{item.prompt}</p>
                        ) : null}
                      </div>
                    </label>
                  )
                })}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setAiSuggestOpen(false)}>
                    取消
                  </Button>
                  <Button size="sm" onClick={acceptAiSuggestions} loading={createUnitsFromAI.isPending} disabled={aiSuggestSelected.size === 0}>
                    加入 {aiSuggestSelected.size} 条候选
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type PreviewPlanStatus = 'ready' | 'attention' | 'blocked' | 'draft'

interface PreviewPlanSegment {
  id: string
  title: string
  subtitle: string
  status: PreviewPlanStatus
  readiness: number
  duration: string
  plots: number
  shots: number
  keyframes: number
  gaps: number
  plotRows: PreviewPlotRow[]
}

interface PreviewPlotRow {
  id: string
  title: string
  subtitle: string
  status: PreviewPlanStatus
  readiness: number
  duration: string
  durationSec: number
  shots: number
  keyframes: number
  gaps: number
  shotRows: PreviewTimelineShot[]
}

interface PreviewTimelineShot {
  id: string
  title: string
  source: string
  duration: string
  camera: string
  status: PreviewPlanStatus
  assets: string
  keyframes: number
}

interface PreviewGateRow {
  label: string
  detail: string
  done: boolean
}

interface PreviewWorkTask {
  id: string
  title: string
  scope: string
  status: WorkStatus
  priority: Priority
  progress: number
  method: string
  output: string
  blocker?: string
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(/\r?\n|[；;]/).map((item) => item.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
  }
  return []
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

interface PreviewAssetGap {
  name: string
  owner: string
  priority: '高' | '中' | '低'
  impact: '影响判断' | '影响最终质量'
  placeholder: string
  detail: string
}

interface PreviewRunSignal {
  label: string
  value: string
  detail: string
  status: PreviewPlanStatus
}

function previewProductionLabel(record?: WorkbenchRecord | null) {
  if (!record) return '未选择制作'
  return firstText(record.name, record.title, `制作 #${record.ID}`)
}

function previewProductionStatus(record: WorkbenchRecord, data: ProductionPreviewData) {
  const previewTimelines = previewTimelinesForProduction(record, data)
  const deliveryVersions = recordsForProduction(data.deliveryVersions, record.ID)
  if (deliveryVersions.some((item) => item.status === 'exported' || item.status === 'approved')) return 'ready' as const
  if (previewTimelines.some((item) => item.status === 'confirmed')) return 'ready' as const
  if (previewTimelines.length > 0) return 'attention' as const
  return 'draft' as const
}

function productionSourceLabel(record: WorkbenchRecord) {
  if (record.source_type === 'script') return record.source_id ? `剧本 #${record.source_id}` : '剧本创建'
  if (record.source_type === 'brief') return '简介创建'
  if (record.source_type === 'preview') return '预演创建'
  if (record.source_type === 'import') return '导入创建'
  return '直接创建'
}

function recordsForProduction(records: WorkbenchRecord[], productionId: number) {
  return records.filter((item) => Number(item.production_id) === productionId)
}

function previewTimelinesForProduction(record: WorkbenchRecord, data: ProductionPreviewData) {
  return data.previewTimelines.filter((item) => Number(item.production_id) === record.ID)
}

function previewTimelineItemsForProduction(record: WorkbenchRecord, data: ProductionPreviewData) {
  const timelineIds = new Set(previewTimelinesForProduction(record, data).map((item) => item.ID))
  return data.previewTimelineItems.filter((item) => timelineIds.has(Number(item.preview_timeline_id)))
}

function relatedSegmentIdsForPreviewProduction(record: WorkbenchRecord, data: ProductionPreviewData) {
  const ids = new Set<number>()
  for (const segment of data.segments) {
    if (Number(segment.production_id) === record.ID) ids.add(segment.ID)
  }
  for (const unit of data.contentUnits.filter((item) => Number(item.production_id) === record.ID)) {
    addRecordId(ids, unit.segment_id)
    const moment = data.sceneMoments.find((item) => item.ID === Number(unit.scene_moment_id))
    addRecordId(ids, moment?.segment_id)
  }
  for (const slot of data.assetSlots.filter((item) => Number(item.production_id) === record.ID)) {
    if (slot.owner_type === 'segment') addRecordId(ids, slot.owner_id)
    if (slot.owner_type === 'scene_moment') {
      const moment = data.sceneMoments.find((item) => item.ID === Number(slot.owner_id))
      addRecordId(ids, moment?.segment_id)
    }
    if (slot.owner_type === 'content_unit') {
      const unit = data.contentUnits.find((item) => item.ID === Number(slot.owner_id))
      addRecordId(ids, unit?.segment_id)
      const moment = data.sceneMoments.find((item) => item.ID === Number(unit?.scene_moment_id))
      addRecordId(ids, moment?.segment_id)
    }
  }
  return ids
}

function addRecordId(target: Set<number>, value: unknown) {
  const id = Number(value)
  if (Number.isFinite(id) && id > 0) target.add(id)
}

function relatedSceneMomentIdsForPreviewProduction(segmentIds: Set<number>, record: WorkbenchRecord, data: ProductionPreviewData) {
  const ids = new Set<number>()
  for (const moment of data.sceneMoments) {
    if (segmentIds.has(Number(moment.segment_id))) ids.add(moment.ID)
  }
  for (const unit of data.contentUnits.filter((item) => Number(item.production_id) === record.ID)) {
    addRecordId(ids, unit.scene_moment_id)
  }
  for (const slot of data.assetSlots.filter((item) => Number(item.production_id) === record.ID)) {
    if (slot.owner_type === 'scene_moment') addRecordId(ids, slot.owner_id)
    if (slot.owner_type === 'content_unit') {
      const unit = data.contentUnits.find((item) => item.ID === Number(slot.owner_id))
      addRecordId(ids, unit?.scene_moment_id)
    }
  }
  return ids
}

function contentUnitsForPreviewProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, record: WorkbenchRecord, data: ProductionPreviewData) {
  return data.contentUnits.filter((unit) => (
    Number(unit.production_id) === record.ID ||
    segmentIds.has(Number(unit.segment_id)) ||
    sceneMomentIds.has(Number(unit.scene_moment_id))
  ))
}

function assetSlotsForPreviewProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, contentUnitIds: Set<number>, record: WorkbenchRecord, data: ProductionPreviewData) {
  return data.assetSlots.filter((slot) => (
    Number(slot.production_id) === record.ID ||
    (slot.owner_type === 'segment' && segmentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'scene_moment' && sceneMomentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'content_unit' && contentUnitIds.has(Number(slot.owner_id)))
  ))
}

function keyframesForPreviewProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, contentUnitIds: Set<number>, record: WorkbenchRecord, data: ProductionPreviewData) {
  return data.keyframes.filter((keyframe) => (
    Number(keyframe.production_id) === record.ID ||
    segmentIds.has(Number(keyframe.segment_id)) ||
    sceneMomentIds.has(Number(keyframe.scene_moment_id)) ||
    contentUnitIds.has(Number(keyframe.content_unit_id))
  ))
}

function buildPreviewPlanSegments(record: WorkbenchRecord, data: ProductionPreviewData): PreviewPlanSegment[] {
  const segmentIds = relatedSegmentIdsForPreviewProduction(record, data)
  const segments = data.segments
    .filter((segment) => segmentIds.has(segment.ID) || Number(segment.production_id) === record.ID)
    .sort(byOrder)

  return segments.map((segment, index) => {
    const moments = data.sceneMoments.filter((moment) => Number(moment.segment_id) === segment.ID)
    const orphanUnits = data.contentUnits.filter((unit) => Number(unit.segment_id) === segment.ID && !unit.scene_moment_id).sort(byOrder)
    const plotRows: PreviewPlotRow[] = moments.map((moment, momentIndex): PreviewPlotRow => {
      const plotUnits = data.contentUnits.filter((unit) => Number(unit.scene_moment_id) === moment.ID).sort(byOrder)
      const plotUnitIds = new Set(plotUnits.map((unit) => unit.ID))
      const plotSlots = data.assetSlots.filter((slot) => (
        (slot.owner_type === 'scene_moment' && Number(slot.owner_id) === moment.ID) ||
        (slot.owner_type === 'content_unit' && plotUnitIds.has(Number(slot.owner_id)))
      ))
      const plotKeyframes = data.keyframes.filter((keyframe) => (
        Number(keyframe.scene_moment_id) === moment.ID ||
        plotUnitIds.has(Number(keyframe.content_unit_id))
      ))
      const plotMissingSlots = plotSlots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing').length
      const plotMissingShots = plotUnits.filter((unit) => !plotKeyframes.some((keyframe) => Number(keyframe.content_unit_id) === unit.ID)).length
      const plotGaps = plotMissingSlots + plotMissingShots
      const shotRows = plotUnits.map((unit) => {
        const unitKeyframes = plotKeyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID)
        const unitSlots = plotSlots.filter((slot) => (
          slot.owner_type === 'content_unit' && Number(slot.owner_id) === unit.ID
        ))
        const missingSlots = unitSlots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing')
        return {
          id: `cu-${unit.ID}`,
          title: titleOfRecord(unit),
          source: [
            `编排段 ${titleOfRecord(segment)}`,
            `情节 ${titleOfRecord(moment)}`,
          ].join(' / '),
          duration: formatDuration(Number(unit.duration_sec) || 0),
          camera: cameraPlanSummary(unit) || firstText(unit.kind, '待补镜头参数'),
          status: missingSlots.length > 0 ? 'blocked' : unitKeyframes.length > 0 ? 'ready' : 'attention',
          assets: `${unitSlots.length} 个素材需求 · ${unitKeyframes.length} 个关键帧${missingSlots.length > 0 ? ` · ${missingSlots.length} 个缺口` : ''}`,
          keyframes: unitKeyframes.length,
        } satisfies PreviewTimelineShot
      })
      const durationSec = plotUnits.reduce((sum, unit) => sum + (Number(unit.duration_sec) || 0), 0)
      const readiness = clampProgress(
        Math.round(
          (plotUnits.length > 0 ? 35 : 8) +
          (plotKeyframes.length > 0 ? 28 : 0) +
          (plotMissingSlots === 0 ? 18 : 0) +
          (plotGaps === 0 ? 19 : 0),
        ),
      )
      return {
        id: `moment-${moment.ID}`,
        title: titleOfRecord(moment),
        subtitle: firstText(moment.action_text, moment.description, moment.time_text, moment.location_text, `情节 ${String(momentIndex + 1).padStart(2, '0')}`),
        status: plotGaps > 0 ? (plotUnits.length === 0 ? 'draft' : plotMissingSlots > 0 ? 'blocked' : 'attention') : 'ready',
        readiness,
        duration: formatDuration(durationSec),
        durationSec,
        shots: plotUnits.length,
        keyframes: plotKeyframes.length,
        gaps: plotGaps,
        shotRows,
      }
    })
    if (orphanUnits.length > 0) {
      const orphanUnitIds = new Set(orphanUnits.map((unit) => unit.ID))
      const orphanSlots = data.assetSlots.filter((slot) => (
        slot.owner_type === 'content_unit' && orphanUnitIds.has(Number(slot.owner_id))
      ))
      const orphanKeyframes = data.keyframes.filter((keyframe) => orphanUnitIds.has(Number(keyframe.content_unit_id)))
      const orphanShotRows = orphanUnits.map((unit) => {
        const unitKeyframes = orphanKeyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID)
        const unitSlots = orphanSlots.filter((slot) => Number(slot.owner_id) === unit.ID)
        const missingSlots = unitSlots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing')
        return {
          id: `cu-${unit.ID}`,
          title: titleOfRecord(unit),
          source: `编排段 ${titleOfRecord(segment)} / 未归属情节`,
          duration: formatDuration(Number(unit.duration_sec) || 0),
          camera: cameraPlanSummary(unit) || firstText(unit.kind, '待补镜头参数'),
          status: missingSlots.length > 0 ? 'blocked' : unitKeyframes.length > 0 ? 'ready' : 'attention',
          assets: `${unitSlots.length} 个素材需求 · ${unitKeyframes.length} 个关键帧${missingSlots.length > 0 ? ` · ${missingSlots.length} 个缺口` : ''}`,
          keyframes: unitKeyframes.length,
        } satisfies PreviewTimelineShot
      })
      plotRows.push({
        id: `orphan-${segment.ID}`,
        title: '未归属情节',
        subtitle: '该段中尚未挂到具体情节的镜头',
        status: orphanShotRows.some((shot) => shot.status === 'blocked') ? 'blocked' : orphanShotRows.some((shot) => shot.status === 'attention') ? 'attention' : 'ready',
        durationSec: orphanUnits.reduce((sum, unit) => sum + (Number(unit.duration_sec) || 0), 0),
        readiness: clampProgress(
          Math.round(
            (orphanShotRows.length > 0 ? 28 : 8) +
            (orphanKeyframes.length > 0 ? 34 : 0) +
            (orphanSlots.some((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing') ? 0 : 18) +
            (orphanShotRows.every((shot) => shot.status !== 'blocked') ? 20 : 0),
          ),
        ),
        duration: formatDuration(orphanUnits.reduce((sum, unit) => sum + (Number(unit.duration_sec) || 0), 0)),
        shots: orphanUnits.length,
        keyframes: orphanKeyframes.length,
        gaps: orphanSlots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing').length +
          orphanUnits.filter((unit) => !orphanKeyframes.some((keyframe) => Number(keyframe.content_unit_id) === unit.ID)).length,
        shotRows: orphanShotRows,
      })
    }

    const plotShots = plotRows.reduce((sum, plot) => sum + plot.shots, 0)
    const plotKeyframes = plotRows.reduce((sum, plot) => sum + plot.keyframes, 0)
    const gaps = plotRows.reduce((sum, plot) => sum + plot.gaps, 0)
    const durationSec = plotRows.reduce((sum, plot) => sum + plot.durationSec, 0)
    const readiness = clampProgress(
      Math.round(
        (plotRows.length > 0 ? 22 : 8) +
        (plotShots > 0 ? 28 : 0) +
        (plotKeyframes > 0 ? 24 : 0) +
        (gaps === 0 ? 26 : 0),
      ),
    )

    return {
      id: `seg-${segment.ID}`,
      title: titleOfRecord(segment),
      subtitle: firstText(segment.summary, segment.description, segment.content, `编排段 ${String(index + 1).padStart(2, '0')}`),
      status: gaps > 0 ? (plotRows.length === 0 ? 'draft' : plotRows.some((plot) => plot.status === 'blocked') ? 'blocked' : 'attention') : 'ready',
      readiness,
      duration: formatDuration(durationSec),
      plots: plotRows.length,
      shots: plotShots,
      keyframes: plotKeyframes,
      gaps,
      plotRows,
    }
  })
}

function buildPreviewTimelineShots(record: WorkbenchRecord, data: ProductionPreviewData): PreviewTimelineShot[] {
  const segmentIds = relatedSegmentIdsForPreviewProduction(record, data)
  const sceneMomentIds = relatedSceneMomentIdsForPreviewProduction(segmentIds, record, data)
  const units = contentUnitsForPreviewProduction(segmentIds, sceneMomentIds, record, data).sort(byOrder)
  const contentUnitIds = new Set(units.map((unit) => unit.ID))
  const assetSlots = assetSlotsForPreviewProduction(segmentIds, sceneMomentIds, contentUnitIds, record, data)
  const keyframes = keyframesForPreviewProduction(segmentIds, sceneMomentIds, contentUnitIds, record, data)
  const segmentById = new Map(data.segments.map((segment) => [segment.ID, segment]))
  const momentById = new Map(data.sceneMoments.map((moment) => [moment.ID, moment]))

  return units.map((unit) => {
    const segment = unit.segment_id ? segmentById.get(Number(unit.segment_id)) : undefined
    const moment = unit.scene_moment_id ? momentById.get(Number(unit.scene_moment_id)) : undefined
    const unitKeyframes = keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID)
    const unitSlots = assetSlots.filter((slot) => (
      (slot.owner_type === 'content_unit' && Number(slot.owner_id) === unit.ID) ||
      (slot.owner_type === 'scene_moment' && moment ? Number(slot.owner_id) === moment.ID : false) ||
      (slot.owner_type === 'segment' && segment ? Number(slot.owner_id) === segment.ID : false) ||
      Number(slot.production_id) === record.ID
    ))
    const missingSlots = unitSlots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing')
    return {
      id: `cu-${unit.ID}`,
      title: titleOfRecord(unit),
      source: [
        segment ? `编排段 ${titleOfRecord(segment)}` : '',
        moment ? `情节 ${titleOfRecord(moment)}` : '',
      ].filter(Boolean).join(' / ') || `镜头 #${unit.ID}`,
      duration: formatDuration(Number(unit.duration_sec) || 0),
      camera: cameraPlanSummary(unit) || firstText(unit.kind, '待补镜头参数'),
      status: missingSlots.length > 0 ? 'blocked' : unitKeyframes.length > 0 ? 'ready' : 'attention',
      assets: `${unitSlots.length} 个素材需求 · ${unitKeyframes.length} 个关键帧${missingSlots.length > 0 ? ` · ${missingSlots.length} 个缺口` : ''}`,
      keyframes: unitKeyframes.length,
    }
  })
}

function buildPreviewAssetGaps(record: WorkbenchRecord, data: ProductionPreviewData): PreviewAssetGap[] {
  const segmentIds = relatedSegmentIdsForPreviewProduction(record, data)
  const sceneMomentIds = relatedSceneMomentIdsForPreviewProduction(segmentIds, record, data)
  const units = contentUnitsForPreviewProduction(segmentIds, sceneMomentIds, record, data)
  const unitIds = new Set(units.map((unit) => unit.ID))
  const slots = assetSlotsForPreviewProduction(segmentIds, sceneMomentIds, unitIds, record, data)
  const gaps: PreviewAssetGap[] = slots
    .filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing')
    .sort((a, b) => priorityRank(priorityFromRecord(String(b.priority ?? ''))) - priorityRank(priorityFromRecord(String(a.priority ?? ''))) || a.ID - b.ID)
    .map((slot) => ({
      name: titleOfRecord(slot),
      owner: previewAssetSlotScopeLabel(slot, data),
      priority: slot.priority === 'critical' || slot.priority === 'high' ? '高' : slot.priority === 'low' ? '低' : '中',
      impact: slot.priority === 'critical' || slot.priority === 'high' ? '影响判断' : '影响最终质量',
      placeholder: firstText(slot.prompt_hint, slot.description, assetKindLabel(String(slot.kind ?? '')) || '可先补生成候选'),
      detail: firstText(slot.description, slot.prompt_hint, '当前素材需求仍是缺口。'),
    }))

  for (const unit of units) {
    const unitKeyframes = data.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID)
    if (unitKeyframes.length > 0) continue
    gaps.push({
      name: titleOfRecord(unit),
      owner: `镜头 · ${titleOfRecord(unit)}`,
      priority: unit.duration_sec && Number(unit.duration_sec) > 10 ? '中' : '低',
      impact: '影响最终质量',
      placeholder: '补充关键帧后才能展开真实预演',
      detail: '当前镜头还没有可展示的关键帧或预演记录。',
    })
  }

  return gaps.slice(0, 6)
}

function previewAssetSlotScopeLabel(slot: WorkbenchRecord, data: ProductionPreviewData) {
  if (slot.owner_type === 'content_unit' && slot.owner_id) {
    const unit = data.contentUnits.find((item) => item.ID === Number(slot.owner_id))
    return unit ? `镜头 · ${titleOfRecord(unit)}` : `镜头 #${slot.owner_id}`
  }
  if (slot.owner_type === 'scene_moment' && slot.owner_id) {
    const moment = data.sceneMoments.find((item) => item.ID === Number(slot.owner_id))
    return moment ? `情节 · ${titleOfRecord(moment)}` : `情节 #${slot.owner_id}`
  }
  if (slot.owner_type === 'segment' && slot.owner_id) {
    const segment = data.segments.find((item) => item.ID === Number(slot.owner_id))
    return segment ? `编排段 · ${titleOfRecord(segment)}` : `编排段 #${slot.owner_id}`
  }
  if (slot.creative_reference_id) {
    const reference = data.creativeReferences.find((item) => item.ID === Number(slot.creative_reference_id))
    return reference ? `设定资料 · ${titleOfRecord(reference)}` : `设定资料 #${slot.creative_reference_id}`
  }
  if (slot.owner_type && slot.owner_id) return `${slot.owner_type} #${slot.owner_id}`
  if (slot.production_id) return `制作 #${slot.production_id}`
  return '项目素材需求'
}

function cameraPlanSummary(row: WorkbenchRecord) {
  return [
    row.shot_size,
    row.camera_angle,
    row.camera_motion,
    row.motion_intensity,
    row.camera_speed,
    row.lens,
    row.focal_length,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' · ')
}

function buildPreviewWorkTasks(record: WorkbenchRecord, data: ProductionPreviewData, segments: PreviewPlanSegment[], timelineShots: PreviewTimelineShot[], gaps: PreviewAssetGap[]): PreviewWorkTask[] {
  const firstGap = gaps[0]
  const firstBlockedShot = timelineShots.find((shot) => shot.status === 'blocked') ?? timelineShots.find((shot) => shot.status === 'attention')
  const firstReadySegment = segments.find((segment) => segment.status === 'ready') ?? segments[0]
  const previewTimelines = previewTimelinesForProduction(record, data)
  const timelineItems = previewTimelineItemsForProduction(record, data)

  return [
    {
      id: 'task-gap',
      title: firstGap ? `补齐 ${firstGap.name}` : '检查制作缺口',
      scope: firstGap?.owner ?? `制作 #${record.ID}`,
      status: firstGap ? 'running' : 'ready',
      priority: firstGap && firstGap.priority === '高' ? 'high' : 'medium',
      progress: firstGap ? 42 : 88,
      method: firstGap ? '定位素材需求或关键帧缺口' : '复核当前制作是否可推进',
      output: firstGap ? '补齐缺口后进入下一轮预演' : '确认制作预演状态',
      blocker: firstGap?.detail,
    },
    {
      id: 'task-shot',
      title: firstBlockedShot ? `审阅 ${firstBlockedShot.title}` : '审阅情节镜头流',
      scope: firstBlockedShot?.source ?? `制作 #${record.ID}`,
      status: firstBlockedShot ? 'review' : 'ready',
      priority: firstBlockedShot?.status === 'blocked' ? 'high' : 'medium',
      progress: firstBlockedShot ? 58 : 76,
      method: firstBlockedShot ? '查看镜头、关键帧和素材需求状态' : '查看全部情节下的镜头与关键帧',
      output: firstBlockedShot ? '决定补生成或标记为已处理' : '确认情节展开可读',
      blocker: firstBlockedShot?.assets?.includes('缺口') ? '当前镜头仍有素材需求缺口' : undefined,
    },
    {
      id: 'task-segment',
      title: firstReadySegment ? `复核 ${firstReadySegment.title}` : '复核情绪入口',
      scope: firstReadySegment?.subtitle ?? `制作 #${record.ID}`,
      status: firstReadySegment ? 'ready' : 'review',
      priority: firstReadySegment?.gaps ? 'medium' : 'low',
      progress: firstReadySegment?.readiness ?? 64,
      method: '检查情绪入口、情节、镜头和关键帧的真实覆盖',
      output: '确认可以进入下一步制作',
    },
    {
      id: 'task-history',
      title: previewTimelines.length > 0 ? '复核预演记录' : '建立预演记录',
      scope: `${previewTimelines.length} 条预演 · ${timelineItems.length} 条记录`,
      status: previewTimelines.length > 0 ? 'running' : 'review',
      priority: previewTimelines.length > 0 ? 'medium' : 'low',
      progress: previewTimelines.length > 0 ? 72 : 18,
      method: previewTimelines.length > 0 ? '确认预演时间线状态' : '先挂载第一条预演时间线',
      output: '形成可追踪的预演记录',
      blocker: timelineItems.length === 0 ? '还没有可展示的预演项' : undefined,
    },
  ]
}

function buildPreviewGateRows(segments: PreviewPlanSegment[], timelineShots: PreviewTimelineShot[], gaps: PreviewAssetGap[]) {
  return [
    { label: '情绪入口已接入', detail: `${segments.length} 个编排段已读取真实制作数据`, done: segments.length > 0 },
    { label: '情节已展开', detail: `${segments.reduce((sum, segment) => sum + segment.plots, 0)} 个情节已挂到入口下面`, done: segments.some((segment) => segment.plots > 0) },
    { label: '镜头 / 关键帧可看', detail: `${timelineShots.length} 个镜头、${timelineShots.reduce((sum, shot) => sum + shot.keyframes, 0)} 个关键帧已进入预演`, done: timelineShots.length > 0 },
    { label: '缺口已识别', detail: gaps.length > 0 ? `${gaps.length} 个缺口待处理` : '当前没有明显缺口', done: gaps.length === 0 },
  ]
}

function ProductionPreviewWorkspace() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showAllTasks, setShowAllTasks] = useState(false)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const { data, isLoading, isFetching, refetch } = useQuery<ProductionPreviewData>({
    queryKey: ['workbench', 'preview', projectId],
    queryFn: () => loadProductionPreviewData(projectId!),
    enabled: !!projectId,
  })

  const hasProductionParam = searchParams.has('productionId')
  useEffect(() => {
    if (!projectId || !data?.productions.length || hasProductionParam) return
    const next = new URLSearchParams(searchParams)
    next.set('productionId', String(data.productions[0].ID))
    setSearchParams(next, { replace: true })
  }, [data?.productions, hasProductionParam, projectId, searchParams, setSearchParams])

  const selectedProductionId = Number(searchParams.get('productionId')) || data?.productions[0]?.ID || 0
  const selectedProduction = useMemo(
    () => {
      if (!data?.productions.length) return null
      return data.productions.find((production) => production.ID === selectedProductionId) ?? data.productions[0] ?? null
    },
    [data?.productions, selectedProductionId],
  )

  const previewPlanSegments = useMemo(
    () => (selectedProduction && data ? buildPreviewPlanSegments(selectedProduction, data) : []),
    [data, selectedProduction],
  )
  const previewTimelineShots = useMemo(
    () => (selectedProduction && data ? buildPreviewTimelineShots(selectedProduction, data) : []),
    [data, selectedProduction],
  )
  const previewMissingAssets = useMemo(
    () => (selectedProduction && data ? buildPreviewAssetGaps(selectedProduction, data) : []),
    [data, selectedProduction],
  )
  const previewGates = useMemo(
    () => buildPreviewGateRows(previewPlanSegments, previewTimelineShots, previewMissingAssets),
    [previewMissingAssets, previewPlanSegments, previewTimelineShots],
  )
  const previewWorkTasks = useMemo(
    () => (selectedProduction && data ? buildPreviewWorkTasks(selectedProduction, data, previewPlanSegments, previewTimelineShots, previewMissingAssets) : []),
    [data, previewMissingAssets, previewPlanSegments, previewTimelineShots, selectedProduction],
  )
  const previewTimelines = useMemo(
    () => (selectedProduction && data ? previewTimelinesForProduction(selectedProduction, data) : []),
    [data, selectedProduction],
  )
  const previewTimelineItems = useMemo(
    () => (selectedProduction && data ? previewTimelineItemsForProduction(selectedProduction, data) : []),
    [data, selectedProduction],
  )

  useEffect(() => {
    if (!previewPlanSegments.length) {
      setSelectedSegmentId(null)
      return
    }
    setSelectedSegmentId((current) => (current && previewPlanSegments.some((segment) => segment.id === current) ? current : previewPlanSegments[0].id))
  }, [previewPlanSegments])

  useEffect(() => {
    if (!previewWorkTasks.length) {
      setSelectedTaskId(null)
      return
    }
    setSelectedTaskId((current) => (current && previewWorkTasks.some((task) => task.id === current) ? current : previewWorkTasks[0].id))
  }, [previewWorkTasks])

  const selectedSegment = previewPlanSegments.find((segment) => segment.id === selectedSegmentId) ?? previewPlanSegments[0] ?? null
  const selectedTask = previewWorkTasks.find((task) => task.id === selectedTaskId) ?? previewWorkTasks[0] ?? null
  const selectedProductionStatus = selectedProduction && data ? previewProductionStatus(selectedProduction, data) : 'draft'
  const readyShots = previewTimelineShots.filter((shot) => shot.status === 'ready').length
  const pendingShots = previewTimelineShots.filter((shot) => shot.status === 'attention').length
  const blockedShots = previewTimelineShots.filter((shot) => shot.status === 'blocked').length
  const totalPlots = previewPlanSegments.reduce((sum, segment) => sum + segment.plots, 0)
  const totalKeyframes = previewTimelineShots.reduce((sum, shot) => sum + shot.keyframes, 0)

  const previewSignals: PreviewRunSignal[] = [
    {
      label: '情绪入口',
      value: `${previewPlanSegments.length} 段`,
      detail: selectedProduction ? `${previewProductionLabel(selectedProduction)} 已接入真实数据` : '请选择制作后查看',
      status: previewPlanSegments.length > 0 ? 'ready' : 'draft',
    },
    {
      label: '情节',
      value: `${totalPlots} 个`,
      detail: totalPlots > 0 ? '情节下面承载镜头和关键帧' : '当前还没有情节',
      status: totalPlots > 0 ? 'ready' : 'draft',
    },
    {
      label: '镜头 / 关键帧',
      value: `${readyShots}/${previewTimelineShots.length || 0}`,
      detail: `${totalKeyframes} 个关键帧已接入，${pendingShots + blockedShots} 个镜头待处理`,
      status: previewTimelineShots.length > 0 ? 'ready' : 'draft',
    },
    {
      label: '预演记录',
      value: `${previewTimelines.length} 条`,
      detail: previewTimelineItems.length > 0 ? `${previewTimelineItems.length} 条挂载记录` : '尚未挂载记录',
      status: previewTimelines.length > 0 ? 'ready' : 'draft',
    },
  ]

  const metrics: WorkbenchMetric[] = [
    {
      label: '情绪入口',
      value: String(previewPlanSegments.length),
      detail: selectedProduction ? `来自 ${selectedProduction.source_type || '当前制作'}` : '未选择制作',
      icon: Clapperboard,
      status: previewPlanSegments.length > 0 ? 'ready' : 'blocked',
    },
    {
      label: '情节',
      value: String(totalPlots),
      detail: `下挂 ${previewTimelineShots.length} 个镜头，${totalKeyframes} 个关键帧`,
      icon: GitBranch,
      status: totalPlots > 0 ? 'review' : 'blocked',
    },
    {
      label: '镜头',
      value: String(previewTimelineShots.length),
      detail: `${readyShots} 个可看 · ${pendingShots} 个待处理`,
      icon: Film,
      status: previewTimelineShots.length > 0 ? 'review' : 'blocked',
    },
    {
      label: '缺口',
      value: String(previewMissingAssets.length),
      detail: previewMissingAssets.length > 0 ? '素材或关键帧仍需补齐' : '当前没有明显缺口',
      icon: AlertTriangle,
      status: previewMissingAssets.length > 0 ? 'blocked' : 'ready',
    },
  ]

  if (!projectId) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <SpecializedWorkbenchHeader
          category="preview"
          kicker="真实数据"
          title="制作预演"
          description="制作预演会读取当前项目里的真实制作数据。"
        />
        <main className="min-h-0 flex-1 overflow-auto p-5">
          <EmptyWorkbenchState title="请先选择项目" text="当前没有可用的项目信息，无法读取制作数据。" />
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <SpecializedWorkbenchHeader
        category="preview"
        kicker="真实数据"
        title="制作预演"
        description="制作预演只查看真实制作数据：编排段、情节、镜头、关键帧和素材缺口。"
      />
      <main className="min-h-0 flex-1 overflow-auto p-5">
        <div className="space-y-5">
          {isLoading ? (
            <Card className="rounded-lg border-border bg-card p-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                读取真实制作数据…
              </div>
            </Card>
          ) : !data?.productions.length ? (
            <EmptyWorkbenchState
              title="暂无制作"
              text="先到制作页创建制作，或从制作编排生成制作结构后再来查看预演。"
            />
          ) : selectedProduction ? (
            <>
              <MetricStrip metrics={metrics} />

              <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-5">
                  <WorkbenchPanel
                    title="本集候选全览"
                    icon={Clapperboard}
                    action={(
                      <div className="flex items-center gap-2">
                        <Select
                          value={String(selectedProduction.ID)}
                          onValueChange={(value) => {
                            const next = new URLSearchParams(searchParams)
                            next.set('productionId', value)
                            setSearchParams(next, { replace: true })
                          }}
                        >
                          <SelectTrigger className="h-8 w-[220px] text-xs">
                            <SelectValue placeholder="选择制作" />
                          </SelectTrigger>
                          <SelectContent>
                            {data.productions.map((production) => (
                              <SelectItem key={production.ID} value={String(production.ID)}>
                                {previewProductionLabel(production)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
                          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                          刷新数据
                        </Button>
                      </div>
                    )}
                  >
                    <div className="mb-4 rounded-md border border-border bg-background px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">当前制作</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium text-foreground">{previewProductionLabel(selectedProduction)}</p>
                            <Badge variant={previewStatusVariant(selectedProductionStatus)}>{previewStatusLabel(selectedProductionStatus)}</Badge>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{firstText(productionSourceLabel(selectedProduction), selectedProduction.description, '段只作为入口，真正内容在情节、镜头和关键帧里。')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/production-orchestrate?productionId=${selectedProduction.ID}`)}>
                            <Clapperboard size={14} />
                            查看编排
                          </Button>
                          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/production?productionId=${selectedProduction.ID}`)}>
                            <Film size={14} />
                            查看制作
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-3">
                        <WorkbenchMiniStat label="情节" value={totalPlots} detail="入口下面的真正内容层" />
                        <WorkbenchMiniStat label="镜头" value={previewTimelineShots.length} detail="镜头和关键帧的承载层" />
                        <WorkbenchMiniStat label="缺口" value={previewMissingAssets.length} detail="需要补齐的素材或关键帧" />
                      </div>
                    </div>
                    {selectedSegment ? (
                      <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-3">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">当前入口</p>
                          <p className="truncate text-sm font-medium text-foreground">{selectedSegment.title}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{selectedSegment.subtitle}</p>
                        </div>
                        <Badge variant={previewStatusVariant(selectedSegment.status)}>{previewStatusLabel(selectedSegment.status)}</Badge>
                      </div>
                    ) : null}
                    <div className="grid gap-3 lg:grid-cols-4">
                      {previewPlanSegments.map((segment, index) => (
                        <button
                          key={segment.id}
                          type="button"
                          onClick={() => setSelectedSegmentId(segment.id)}
                          className="text-left"
                        >
                          <PreviewOverviewNode segment={segment} index={index} selected={segment.id === selectedSegment?.id} />
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-3 xl:grid-cols-4">
                      {previewSignals.map((signal) => (
                        <PreviewRunSignalCard key={signal.label} signal={signal} />
                      ))}
                    </div>
                  </WorkbenchPanel>

                  <WorkbenchPanel
                    title="情节与镜头"
                    icon={GitBranch}
                    action={<Badge variant="outline">{totalPlots} 个情节</Badge>}
                  >
                    <p className="mb-3 text-sm font-semibold text-foreground">先看情绪入口，再往下展开情节、镜头和关键帧。</p>
                    {selectedSegment ? (
                      selectedSegment.plotRows.length === 0 ? (
                        <EmptyWorkbenchState title="暂无情节" text="当前入口下还没有可展开的情节。" />
                      ) : (
                        <div className="space-y-3">
                          {selectedSegment.plotRows.map((plot, index) => (
                            <PreviewPlotCard key={plot.id} plot={plot} index={index} />
                          ))}
                        </div>
                      )
                    ) : (
                      <EmptyWorkbenchState title="暂无入口" text="先选择一个制作入口，再看它下面的情节和镜头。" />
                    )}
                  </WorkbenchPanel>
                </div>

                <div className="min-w-0 space-y-5">
                  <WorkbenchPanel
                    title="缺口清单"
                    icon={ShieldCheck}
                    action={<Badge variant={previewMissingAssets.length > 0 ? 'warning' : 'success'}>{previewMissingAssets.length} 个缺口</Badge>}
                  >
                    <div className="space-y-3">
                      {previewMissingAssets.length === 0 ? (
                        <EmptyWorkbenchState title="暂无缺口" text="当前制作没有明显的素材或关键帧缺口。" />
                      ) : (
                        previewMissingAssets.map((asset) => (
                          <div key={`${asset.owner}-${asset.name}`} className="rounded-md border border-border bg-background px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">{asset.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{asset.owner}</p>
                              </div>
                              <Badge variant={asset.priority === '高' ? 'danger' : asset.priority === '中' ? 'warning' : 'outline'}>{asset.priority}</Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant={asset.impact === '影响判断' ? 'warning' : 'outline'}>{asset.impact === '影响判断' ? '优先处理' : '可稍后处理'}</Badge>
                              <Badge variant="secondary">{asset.placeholder}</Badge>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">{asset.detail}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-4">
                      <GateChecklist rows={previewGates} />
                    </div>
                  </WorkbenchPanel>

                  <WorkbenchPanel title="下一步动作" icon={Settings2}>
                    <div className="space-y-2">
                      <Button className="w-full justify-start gap-2" onClick={() => navigate(`/production-orchestrate?productionId=${selectedProduction.ID}`)}>
                        <Clapperboard size={15} />
                        查看制作编排
                      </Button>
                      <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate(`/asset-slots?production_id=${selectedProduction.ID}`)}>
                        <PackageCheck size={15} />
                        查看素材需求
                      </Button>
                      <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate(`/contents?production_id=${selectedProduction.ID}`)}>
                        <Film size={15} />
                        查看镜头内容
                      </Button>
                      <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate(`/delivery/workbench?productionId=${selectedProduction.ID}`)}>
                        <CheckCircle2 size={15} />
                        查看成片工作台
                      </Button>
                    </div>
                  </WorkbenchPanel>

                  <WorkbenchPanel title="当前处理" icon={ListChecks} action={<Badge variant="secondary">{previewWorkTasks.length}</Badge>}>
                    {selectedTask ? (
                      <div className="mb-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-3">
                        <p className="text-xs text-muted-foreground">本轮目标</p>
                        <p className="mt-1 text-sm font-medium leading-6 text-foreground">{selectedTask.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedTask.blocker ?? '当前只看实际制作数据和缺口，不接入 agent。'}</p>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      {previewWorkTasks.length === 0 ? (
                        <EmptyWorkbenchState title="暂无处理任务" text="先选择一个制作后，系统会根据真实数据给出待处理项。" />
                      ) : (
                        (showAllTasks ? previewWorkTasks : previewWorkTasks.filter((task) => ['running', 'review'].includes(task.status)).slice(0, 2)).map((task) => (
                          <PreviewWorkTaskCard
                            key={task.id}
                            task={task}
                            selected={task.id === selectedTask?.id}
                            compact
                            onSelect={() => setSelectedTaskId(task.id)}
                          />
                        ))
                      )}
                    </div>
                    {previewWorkTasks.length > 2 && (
                      <Button variant="outline" size="sm" className="mt-3 w-full justify-center gap-2" onClick={() => setShowAllTasks((value) => !value)}>
                        <ListChecks size={14} />
                        {showAllTasks ? '收起清单' : '展开完整清单'}
                      </Button>
                    )}
                  </WorkbenchPanel>
                </div>
              </div>
            </>
          ) : (
            <EmptyWorkbenchState title="暂无可用制作" text="请选择一个制作后，再查看它的真实预演数据。" />
          )}
        </div>
      </main>
    </div>
  )
}

function PreviewWorkTaskCard({ task, selected, compact = false, onSelect }: { task: PreviewWorkTask; selected: boolean; compact?: boolean; onSelect?: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-md border px-3 py-3 text-left transition-colors',
        selected ? 'border-primary/60 bg-primary/5' : 'border-border bg-background hover:bg-muted/30',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{task.scope}</p>
        </div>
        <Badge variant={statusVariant(task.status)}>{statusLabel(task.status)}</Badge>
      </div>
      {!compact && (
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
          <div className="min-w-0 rounded border border-border bg-background/70 px-2 py-2">
            <p className="text-muted-foreground">方式</p>
            <p className="mt-1 truncate text-foreground">{task.method}</p>
          </div>
          <div className="min-w-0 rounded border border-border bg-background/70 px-2 py-2">
            <p className="text-muted-foreground">产出</p>
            <p className="mt-1 truncate text-foreground">{task.output}</p>
          </div>
        </div>
      )}
      {task.blocker ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-amber-600">{task.blocker}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <Badge variant={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'outline'}>{priorityLabel(task.priority)}</Badge>
        <Progress value={task.progress} className="h-1.5" />
      </div>
    </button>
  )
}

function PreviewOverviewNode({ segment, index, selected }: { segment: PreviewPlanSegment; index: number; selected: boolean }) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-md border px-3 py-3',
        selected ? 'border-primary/60 bg-primary/5' : 'border-border bg-background',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] tabular-nums text-muted-foreground">情绪入口 {index + 1}</p>
          <p className="mt-1 truncate text-sm font-medium text-foreground">{segment.title}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{segment.subtitle}</p>
        </div>
        <Badge variant={previewStatusVariant(segment.status)}>{previewStatusLabel(segment.status)}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>{segment.duration}</span>
        <span>{segment.plots} 情节</span>
        <span>{segment.shots} 镜头</span>
        <span>{segment.keyframes} 关键帧</span>
        {segment.gaps > 0 ? <span className="text-amber-600">缺口 {segment.gaps}</span> : null}
      </div>
      <Progress value={segment.readiness} className="mt-3 h-1.5" />
    </div>
  )
}

function PreviewPlotCard({ plot, index }: { plot: PreviewPlotRow; index: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] tabular-nums text-muted-foreground">情节 {index + 1}</p>
          <p className="mt-1 truncate text-sm font-medium text-foreground">{plot.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{plot.subtitle}</p>
        </div>
        <Badge variant={previewStatusVariant(plot.status)}>{previewStatusLabel(plot.status)}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>{plot.duration}</span>
        <span>{plot.shots} 镜头</span>
        <span>{plot.keyframes} 关键帧</span>
        {plot.gaps > 0 ? <span className="text-amber-600">缺口 {plot.gaps}</span> : null}
      </div>
      <Progress value={plot.readiness} className="mt-3 h-1.5" />
      {plot.shotRows.length > 0 ? (
        <div className="mt-3 space-y-2">
          {plot.shotRows.map((shot, shotIndex) => (
            <PreviewTimelineRow key={shot.id} shot={shot} index={shotIndex} />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          当前情节还没有镜头或关键帧。
        </p>
      )}
    </div>
  )
}

function PreviewRunSignalCard({ signal }: { signal: PreviewRunSignal }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{signal.label}</p>
        <Badge variant={previewStatusVariant(signal.status)}>{previewStatusLabel(signal.status)}</Badge>
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{signal.value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{signal.detail}</p>
    </div>
  )
}

function PreviewTimelineRow({ shot, index }: { shot: PreviewTimelineShot; index: number }) {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-background px-3 py-3 md:grid-cols-[44px_minmax(0,1.25fr)_110px_120px_auto]">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
        {index + 1}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{shot.title}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{shot.source}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">时长</p>
        <p className="mt-1 text-sm text-foreground">{shot.duration}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">镜头</p>
        <p className="mt-1 truncate text-sm text-foreground">{shot.camera}</p>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3 md:justify-end">
        <p className="truncate text-xs text-muted-foreground md:max-w-40">{shot.assets}</p>
        <Badge variant={shot.keyframes > 0 ? 'secondary' : 'outline'}>{shot.keyframes} 帧</Badge>
        <Badge variant={previewStatusVariant(shot.status)}>{previewStatusLabel(shot.status)}</Badge>
      </div>
    </div>
  )
}

function previewStatusLabel(status: PreviewPlanStatus) {
  if (status === 'ready') return '已有候选'
  if (status === 'blocked') return '无候选'
  if (status === 'attention') return '待处理'
  return '未生成'
}

function previewStatusVariant(status: PreviewPlanStatus) {
  if (status === 'ready') return 'success' as const
  if (status === 'blocked') return 'outline' as const
  if (status === 'attention') return 'warning' as const
  return 'outline' as const
}

function EmptyWorkbenchState({ title, text }: { title: string; text: string }) {
  return (
    <Card className="rounded-lg border-dashed border-border bg-card p-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{text}</p>
    </Card>
  )
}

function WorkbenchMiniStat({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Badge variant="outline">{value}</Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  )
}

type CanvasWorkbenchKind = 'assets' | 'production'

const canvasWorkbenchMeta: Record<CanvasWorkbenchKind, {
  title: string
  stage: CanvasStage
  description: string
  canvasName: string
  icon: typeof PackageCheck
}> = {
  assets: {
    title: '素材工作台',
    stage: 'asset_prep',
    description: '复用现有画布工作流来组织素材需求缺口、参考输入、AI 生成、人工审核和资源写回。',
    canvasName: '素材工作台画布',
    icon: PackageCheck,
  },
  production: {
    title: '内容编排工作台',
    stage: 'generation',
    description: '复用现有画布工作流来串联制作项、提示词、关键帧、视频候选、返工和正式输出。',
    canvasName: '内容编排画布',
    icon: Wand2,
  },
}

function useWorkbenchCanvasLauncher(kind?: CanvasWorkbenchKind) {
  const navigate = useNavigate()
  const project = useProjectStore((s) => s.current)
  const meta = kind ? canvasWorkbenchMeta[kind] : undefined
  const canvasesQuery = useQuery<Canvas[]>({
    queryKey: ['workbench-canvas', project?.ID, meta?.stage],
    queryFn: () => api.get('/canvases', {
      params: {
        project_id: project?.ID,
        stage: meta?.stage,
        type: 'workflow',
      },
    }).then((r) => r.data),
    enabled: !!project?.ID && !!meta,
  })
  const createCanvas = useMutation({
    mutationFn: () => {
      if (!project?.ID || !meta) throw new Error('请先选择项目')
      return api.post('/canvases', {
        name: meta.canvasName,
        project_id: project.ID,
        canvas_type: 'workflow',
        stage: meta.stage,
      }).then((r) => r.data as Canvas)
    },
    onSuccess: (canvas) => navigate(`/canvases/${canvas.ID}`),
  })
  const existingCanvas = canvasesQuery.data?.[0]
  return {
    disabled: !project?.ID || canvasesQuery.isLoading || createCanvas.isPending || !meta,
    loading: canvasesQuery.isLoading || createCanvas.isPending,
    label: createCanvas.isPending ? '创建中' : existingCanvas ? '去生成' : '创建并去生成',
    open: () => {
      if (!meta) return
      if (existingCanvas) {
        navigate(`/canvases/${existingCanvas.ID}`)
        return
      }
      createCanvas.mutate()
    },
  }
}

function ScenarioWorkspace({ category, generationKind }: { category: WorkbenchCategory; generationKind?: CanvasWorkbenchKind }) {
  if (category === 'preview') return <ProductionPreviewWorkspace />

  const surface = getWorkbenchSurface(category)
  const scenario = scenarios[category]
  const [selectedId, setSelectedId] = useState(scenario.queue[0]?.id ?? '')
  const selected = scenario.queue.find((item) => item.id === selectedId) ?? scenario.queue[0]
  const evidenceIcon = category === 'production' ? Play : category === 'delivery' ? Film : category === 'creative' ? Users : category === 'assets' ? Upload : FileText
  const generation = useWorkbenchCanvasLauncher(generationKind)

  useEffect(() => {
    setSelectedId(scenario.queue[0]?.id ?? '')
  }, [category, scenario.queue])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <surface.icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-foreground">{surface.title}</h1>
              <Badge variant="outline">{surface.shortTitle}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{surface.purpose}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm"><RefreshCw size={14} />刷新建议</Button>
          {generationKind ? (
            <Button size="sm" disabled={generation.disabled} loading={generation.loading} onClick={generation.open}>
              <ArrowRight size={14} />
              {generation.label}
            </Button>
          ) : (
            <Button size="sm"><CheckCircle2 size={14} />确认当前决策</Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-auto p-5">
          <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <QueueList items={scenario.queue} selectedId={selected?.id ?? ''} onSelect={setSelectedId} />
            <div className="min-w-0 space-y-5">
              {selected ? (
                <Card className="rounded-lg border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">当前对象</p>
                      <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{selected.title}</h2>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{selected.subtitle}</p>
                    </div>
                    <Badge variant={statusVariant(selected.status)}>{statusLabel(selected.status)}</Badge>
                  </div>
                  <Progress value={selected.progress} className="mt-4 h-1.5" />
                </Card>
              ) : null}

              <div className="grid gap-5 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <InfoPanel title={scenario.evidenceTitle} rows={scenario.evidence} icon={evidenceIcon} />
                <DecisionPanel title={scenario.decisionTitle} rows={scenario.decisions} />
              </div>

              <Card className="rounded-lg border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">工作台定位</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    ['目的', surface.purpose, Target],
                    ['决策', surface.decision, ListChecks],
                    ['产出', surface.output, CheckCircle2],
                  ].map(([label, text, Icon]) => (
                    <div key={label as string} className="rounded-md border border-border bg-background p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon size={14} />
                        <span>{label as string}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground">{text as string}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </main>
        <ActionRail actions={scenario.actions} outputTitle={scenario.outputTitle} outputs={scenario.outputs} />
      </div>
    </div>
  )
}

function ScriptSplitWorkbench() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const agentSettings = useAgentStore((s) => s.settings)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sourceTitle, setSourceTitle] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [sourceFileName, setSourceFileName] = useState('')
  const [sourceFileError, setSourceFileError] = useState('')
  const [importingFile, setImportingFile] = useState(false)
  const [saveSourceScript, setSaveSourceScript] = useState(true)
  const [drafts, setDrafts] = useState<ScriptSplitDraft[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [result, setResult] = useState<ScriptSplitResult | null>(null)
  const [agentDraft, setAgentDraft] = useState<AgentDraft | null>(null)
  const [agentDraftDirty, setAgentDraftDirty] = useState(false)
  const [agentDraftValidation, setAgentDraftValidation] = useState<AgentDraftValidationResult | null>(null)
  const [draftSyncing, setDraftSyncing] = useState(false)
  const [draftRejecting, setDraftRejecting] = useState(false)
  const [lastAgentRunId, setLastAgentRunId] = useState<string | null>(null)
  const scriptSplitToolCleanupRef = useRef<(() => void) | null>(null)

  const { data: scripts = [], isLoading: scriptsLoading } = useQuery<Script[]>({
    queryKey: ['workbench-script-scripts', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: productions = [] } = useQuery<ScriptSplitProductionSummary[]>({
    queryKey: ['workbench-script-productions', projectId],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('productions')) as Promise<ScriptSplitProductionSummary[]>,
    enabled: !!projectId,
  })
  const { data: textModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'text'],
    queryFn: () => api.get('/models?capability=text').then((r) => r.data),
  })

  const sortedScripts = useMemo(
    () => scripts.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.ID - b.ID),
    [scripts],
  )
  const mainScripts = useMemo(
    () => sortedScripts.filter((script) => normalizeScriptType(script.script_type) === 'main'),
    [sortedScripts],
  )
  const episodeScripts = useMemo(
    () => sortedScripts.filter((script) => normalizeScriptType(script.script_type) === 'episode'),
    [sortedScripts],
  )
  const sourceLineEntries = useMemo(() => getScriptTextLineEntries(sourceText), [sourceText])
  const sourceLineCount = useMemo(() => getScriptTextLineCount(sourceText), [sourceText])
  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId) ?? drafts[0] ?? null
  const openedDraftId = searchParams.get('draftId')?.trim() || ''
  const sourceTitleLabel = sourceTitle.trim() || sourceFileName || '未命名总稿'
  const modelId = agentSettings.modelId ?? textModels[0]?.id ?? null

  function syncDrafts(nextDrafts: ScriptSplitDraft[]) {
    setDrafts(nextDrafts)
    setSelectedDraftId(nextDrafts[0]?.id ?? null)
  }

  function resetAgentDrafts() {
    syncDrafts([])
    setResult(null)
    setAgentDraft(null)
    setAgentDraftDirty(false)
    setAgentDraftValidation(null)
    setLastAgentRunId(null)
  }

  function handleSourceTextChange(text: string) {
    setSourceText(text)
    resetAgentDrafts()
  }

  async function getLatestWritableScriptSplitDraft(preferredDraftId?: string): Promise<AgentDraft | null> {
    const sourceIdentity = getScriptSplitSourceIdentity(sourceTitle, sourceFileName, sourceText)
    const pageKey = buildPageKey({
      route: { pathname: '/workbench/script' },
      projectId,
      selection: sourceIdentity,
      labels: ['script-split-workbench'],
    })
    const pageScoped = await localAgentClient.listDrafts({
      projectId,
      kind: 'script_split_proposal',
      status: 'draft',
      pageKey,
      limit: 5,
    })
    const pageScopedLatest = pageScoped.drafts[0]
    if (pageScopedLatest) return pageScopedLatest
    const preferred = preferredDraftId
      ? await localAgentClient.getDraft(preferredDraftId).catch(() => null)
      : null
    if (preferred && preferred.kind === 'script_split_proposal' && preferred.status !== 'superseded') return preferred
    const latest = await localAgentClient.listDrafts({
      projectId,
      kind: 'script_split_proposal',
      status: 'draft',
      limit: 1,
    })
    return latest.drafts[0] ?? preferred
  }

  async function ensureScriptSplitDraftShell(baseTitle: string, normalized: string): Promise<AgentDraft> {
    if (!projectId) throw new Error('请先选择项目')
    const sourceIdentity = getScriptSplitSourceIdentity(baseTitle, sourceFileName, normalized)
    const pageKey = buildPageKey({
      route: { pathname: '/workbench/script' },
      projectId,
      selection: sourceIdentity,
      labels: ['script-split-workbench'],
    })
    const existing = await localAgentClient.listDrafts({
      projectId,
      kind: 'script_split_proposal',
      status: 'draft',
      pageKey,
      limit: 1,
    })
    if (existing.drafts[0]) return existing.drafts[0]

    const lineCount = Math.max(1, getScriptTextLineCount(normalized))
    const sourceSummary = `${baseTitle} 待生成制作方案，共 ${lineCount} 行。`
    return localAgentClient.createDraft({
      projectId,
      kind: 'script_split_proposal',
      title: `一键制作方案 - ${baseTitle}`,
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.scriptSplit,
        source_title: baseTitle,
        source_summary: sourceSummary,
        source_script: {
          title: baseTitle,
          summary: sourceSummary,
          source_type: 'raw',
          line_count: lineCount,
        },
        global_settings: {},
        episode_drafts: [],
        warnings: [],
        confidence: 0,
      }, null, 2),
      source: {
        entityType: 'script_source',
        entityId: sourceIdentity.entityId,
        pageKey,
        pageType: 'workbench',
        pageRoute: '/workbench/script',
        pageEntityType: 'script_source',
        pageEntityId: sourceIdentity.entityId,
      },
      metadata: {
        pageOwned: true,
        sourceTitle: baseTitle,
        sourceLineCount: lineCount,
      },
    })
  }

  useEffect(() => {
    return () => scriptSplitToolCleanupRef.current?.()
  }, [])

  useEffect(() => {
    if (!openedDraftId) return
    let cancelled = false
    void (async () => {
      try {
        const draft = await localAgentClient.getDraft(openedDraftId)
        if (cancelled || draft.kind !== 'script_split_proposal') return
        setAgentDraft(draft)
        setAgentDraftDirty(false)
        setLastAgentRunId(draft.createdByRunId ?? null)
        if (!sourceTitle.trim()) {
          setSourceTitle(draft.title)
        }
        try {
          setAgentDraftValidation(await localAgentClient.validateDraft(draft.id))
        } catch {
          setAgentDraftValidation(null)
        }
      } catch {
        if (!cancelled) setAgentDraft(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openedDraftId])

  async function openScriptSplitAgentSession(normalized: string) {
    if (!projectId) throw new Error('请先选择项目')
    if (!modelId) throw new Error('请先在右侧 Agent 面板选择一个文本模型')
    const baseTitle = sourceTitle.trim() || inferSourceScriptTitle(normalized)
    const draftShell = await ensureScriptSplitDraftShell(baseTitle, normalized)
    const clientInput = buildCommandFirstClientInput({
      message: normalized,
      labels: ['script-split-workbench', 'structured-output'],
      hints: {
        projectId,
        draftId: draftShell.id,
        selection: getScriptSplitSourceIdentity(baseTitle, sourceFileName, normalized),
      },
    })
    const requestId = `script_split_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const displayMessage = [
      `请为《${baseTitle}》生成一键制作方案。`,
      `完整正文已随本地运行输入发送（${normalized.length} 字符），对话面板仅展示摘要以避免卡顿。`,
    ].join('\n')

    scriptSplitToolCleanupRef.current?.()
    scriptSplitToolCleanupRef.current = registerAgentPanelPageTool(requestId, async (detail) => {
      const run = detail.run
      const thread = detail.thread
      if (run?.status === 'failed') {
        toast.error(run.error || detail.error || '一键制作方案生成失败')
        return
      }
      if (run?.status === 'cancelled') {
        toast.info('一键制作方案生成已停止')
        return
      }
      if (!run || !thread || (run.status !== 'completed' && run.status !== 'completed_with_warnings')) return
      try {
        const task = useAgentSessionStore.getState().pageTasks[requestId]
        const artifact = selectLatestDraftArtifact(task?.artifacts, 'script_split_proposal')
        if (!artifact) return
        const latest = await getLatestWritableScriptSplitDraft(artifact.draftId)
        if (!latest) return
        const nextDrafts = parseScriptSplitDraftContent(latest.content, sortedScripts, normalized, productions)
        syncDrafts(nextDrafts)
        setAgentDraft(latest)
        setAgentDraftDirty(false)
        if (latest.id) {
          try {
            setAgentDraftValidation(await localAgentClient.validateDraft(latest.id))
          } catch {
            setAgentDraftValidation(null)
          }
        } else {
          setAgentDraftValidation(null)
        }
        setLastAgentRunId(run.id)
        setResult({
          sourceTitle: baseTitle,
          sourceScriptId: null,
          createdCount: 0,
          updatedCount: 0,
          episodeCount: nextDrafts.length,
          productionCreatedCount: 0,
          productionUpdatedCount: 0,
          productionSkippedCount: 0,
          agentRunId: run.id,
          agentDraftId: latest.id,
        })
        toast.success(`制作方案已准备好：${nextDrafts.length} 个制作入口`)
      } catch {
        // This response may still be part of the conversation. Wait for a later structured conclusion.
      }
    })

    openAgentPanelDraft({
      requestId,
      taskType: 'script_split_proposal',
      message: displayMessage,
      title: `一键制作: ${baseTitle}`,
      newConversation: true,
      autoSend: true,
      projectId,
      clientInput,
      timeoutMs: 900_000,
      renderMode: 'page',
    })

    return { baseTitle }
  }

  function getScriptSplitSourceIdentity(title: string, fileName: string, text: string) {
    const sourceLabel = fileName.trim() || title.trim() || inferSourceScriptTitle(text)
    return {
      entityType: 'script_source',
      entityId: sourceLabel,
      label: sourceLabel,
    }
  }

  async function handleImportFile(file?: File) {
    if (!file) return
    setImportingFile(true)
    setSourceFileError('')
    try {
      const text = await readScriptDocument(file)
      const normalized = text.trim()
      if (!normalized) throw new Error('文件里没有可分析的文本')
      setSourceText(text)
      setSourceFileName(file.name)
      setSourceTitle((current) => current.trim() || scriptDocumentTitleFromName(file.name))
      resetAgentDrafts()
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取文档失败'
      setSourceFileError(message)
      toast.error(message)
    } finally {
      setImportingFile(false)
    }
  }

  const splitWithAgent = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('请先选择项目')
      const normalized = sourceText.trim()
      if (!normalized) throw new Error('请先粘贴剧本或提示词')
      return openScriptSplitAgentSession(normalized)
    },
    onSuccess: () => {
      toast.success('已启动一键制作，请在右侧会话等待 Agent 产出制作方案')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '一键制作失败')
    },
  })

  function handleSplit() {
    splitWithAgent.mutate()
  }

  function updateEpisodeDraftState(id: string, patch: Partial<ScriptSplitDraft>) {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)))
    setAgentDraftDirty(!!agentDraft)
    setAgentDraftValidation(null)
  }

  async function syncAgentDraft(nextDrafts = drafts): Promise<AgentDraft | null> {
    if (!agentDraft) return null
    if (agentDraft.status !== 'draft' && agentDraft.status !== 'accepted') {
      throw new Error(`当前 Agent Draft ${scriptSplitDraftStatusLabel(agentDraft.status)}，不能继续修改`)
    }
    const normalized = sourceText.trim()
    const nextContent = buildScriptSplitDraftContent({
      agentDraft,
      drafts: nextDrafts,
      sourceTitle: sourceTitle.trim() || inferSourceScriptTitle(normalized),
      sourceText: normalized,
    })
    setDraftSyncing(true)
    try {
      const updated = await localAgentClient.updateDraft(agentDraft.id, {
        content: nextContent,
        metadata: {
          uiEditedAt: new Date().toISOString(),
          uiEpisodeCount: nextDrafts.length,
        },
      })
      setAgentDraft(updated)
      setAgentDraftDirty(false)
      try {
        setAgentDraftValidation(await localAgentClient.validateDraft(updated.id))
      } catch {
        setAgentDraftValidation(null)
      }
      return updated
    } finally {
      setDraftSyncing(false)
    }
  }

  async function refreshAgentDraft() {
    if (!agentDraft) return
    setDraftSyncing(true)
    try {
      const latest = await localAgentClient.getDraft(agentDraft.id)
      const nextDrafts = parseScriptSplitDraftContent(latest.content, sortedScripts, sourceText.trim(), productions)
      setAgentDraft(latest)
      syncDrafts(nextDrafts)
      setAgentDraftDirty(false)
      setAgentDraftValidation(await localAgentClient.validateDraft(latest.id))
      toast.success('已刷新 Agent Draft')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '刷新 Agent Draft 失败')
    } finally {
      setDraftSyncing(false)
    }
  }

  async function rejectAgentDraft() {
    if (!agentDraft) return
    setDraftRejecting(true)
    try {
      const rejected = await localAgentClient.rejectDraft(agentDraft.id, '用户在一键制作页面删除了该提案')
      setAgentDraft(rejected)
      setAgentDraftDirty(false)
      toast.success('已删除 Agent Draft')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除 Agent Draft 失败')
    } finally {
      setDraftRejecting(false)
    }
  }

  async function upsertScript(payload: {
    existingScriptId?: number | null
    title: string
    description?: string
    content: string
    raw_source: string
    summary?: string
    characters?: string
    character_relationships?: string
    core_settings?: string
    background?: string
    scenes_desc?: string
    structured_characters?: string
    structure_json?: string
    entity_candidates?: string
    relationship_candidates?: string
    script_type: string
    source_type: string
    order?: number
    parent_script_id?: number | null
  }) {
    if (!projectId) throw new Error('请先选择项目')
    const existing = payload.existingScriptId
      ? findScriptByIdAndType(sortedScripts, payload.existingScriptId, payload.script_type)
      : findMatchingScript(sortedScripts, payload.title, payload.script_type)
    const body = {
      title: payload.title,
      description: payload.description ?? '',
      content: payload.content,
      raw_source: payload.raw_source,
      summary: payload.summary ?? '',
      characters: payload.characters ?? '',
      character_relationships: payload.character_relationships ?? '',
      core_settings: payload.core_settings ?? '',
      background: payload.background ?? '',
      scenes_desc: payload.scenes_desc ?? '',
      structured_characters: payload.structured_characters ?? '',
      structure_json: payload.structure_json ?? '',
      entity_candidates: payload.entity_candidates ?? '',
      relationship_candidates: payload.relationship_candidates ?? '',
      script_type: payload.script_type,
      source_type: payload.source_type,
      order: payload.order ?? 0,
      parent_script_id: payload.parent_script_id ?? null,
    }
    if (existing) {
      return api.put<Script>(`/projects/${projectId}/scripts/${existing.ID}`, body).then((r) => r.data)
    }
    return api.post<Script>(`/projects/${projectId}/scripts`, body).then((r) => r.data)
  }

  function findProductionForDraft(draft: ScriptSplitDraft) {
    if (draft.productionAction !== 'update') return null
    if (draft.existingProductionId) {
      const byId = productions.find((production) => production.ID === draft.existingProductionId)
      if (byId) return byId
    }
    const titleKey = normalizeEntityTitleKey(draft.productionTitle)
    return productions.find((production) => normalizeEntityTitleKey(firstText(production.name, production.title)) === titleKey) ?? null
  }

  async function upsertProductionForDraft(input: {
    draft: ScriptSplitDraft
    sourceScriptTitle: string
    sourceScriptId: number | null
    savedScriptId?: number | null
    agentDraftId?: string
  }) {
    if (!projectId) throw new Error('请先选择项目')
    const { draft } = input
    if (draft.productionAction === 'skip') return { record: null, action: 'skip' as const }

    const existing = findProductionForDraft(draft)
    const metadata = mergeMetadataJSON(existing?.metadata_json, {
      source: 'workbench.script_split_proposal',
      source_title: input.sourceScriptTitle,
      source_script_id: input.sourceScriptId,
      saved_script_id: input.savedScriptId ?? null,
      agent_draft_id: input.agentDraftId ?? agentDraft?.id ?? null,
      episode_order: draft.order,
      episode_title: draft.title,
      script_line_range: {
        start_line: draft.startLine,
        end_line: draft.endLine,
      },
      production_decision: draft.productionAction,
    })
    const payload: SemanticEntityPayload = {
      name: draft.productionTitle || draft.title,
      description: draft.productionSummary || draft.summary,
      source_type: 'script',
      owner_label: '导演组',
      metadata_json: JSON.stringify(metadata),
    }

    if (existing) {
      const record = await updateSemanticEntity(projectId, semanticEntityConfig('productions'), existing.ID, payload)
      return { record, action: 'update' as const }
    }

    const record = await createSemanticEntity(projectId, semanticEntityConfig('productions'), {
      ...payload,
      status: 'planning',
      progress: 0,
    })
    return { record, action: 'create' as const }
  }

  const createAll = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('请先选择项目')
      const normalized = sourceText.trim()
      if (!normalized) throw new Error('请先粘贴剧本或提示词')

      let agentRunId = lastAgentRunId ?? undefined
      let nextDrafts = drafts
      if (nextDrafts.length === 0) {
        throw new Error('请先通过一键制作生成制作方案，并生成 Agent Draft')
      }
      if (nextDrafts.length === 0) throw new Error('没有可制作的内容')
      if (!agentDraft) throw new Error('当前制作方案没有关联的 Agent Draft，请重新运行一键制作')
      if (agentDraft.status === 'rejected') throw new Error('当前 Agent Draft 已删除，不能写入')
      if (agentDraft.status === 'applied') throw new Error('当前 Agent Draft 已写入，请重新生成新的制作方案')

      let sourceScriptId: number | null = null
      const sourceScriptTitle = sourceTitle.trim() || inferSourceScriptTitle(normalized)
      const syncedDraft = await syncAgentDraft(nextDrafts)
      if (syncedDraft) {
        const validation = await localAgentClient.validateDraft(syncedDraft.id)
        setAgentDraftValidation(validation)
        if (!validation.ok) {
          const firstIssue = validation.issues.find((issue) => issue.severity === 'error')
          throw new Error(firstIssue?.message || 'Agent Draft 校验失败')
        }
      }

      if (saveSourceScript) {
        const sourceScript = await upsertScript({
          existingScriptId: null,
          title: sourceScriptTitle,
          description: `一键制作方案自动拆分为 ${nextDrafts.length} 段`,
          content: normalized,
          raw_source: normalized,
          summary: `一键制作方案自动拆分为 ${nextDrafts.length} 段`,
          script_type: 'main',
          source_type: 'raw',
          order: 0,
          parent_script_id: null,
        })
        sourceScriptId = sourceScript.ID
      }

      let createdCount = 0
      let updatedCount = 0
      const createdScripts: Script[] = []
      for (const draft of nextDrafts) {
        const existing = draft.existingScriptId
          ? findScriptByIdAndType(sortedScripts, draft.existingScriptId, 'episode')
          : findMatchingScript(sortedScripts, draft.title, 'episode')
        const saved = await upsertScript({
          existingScriptId: existing?.ID ?? null,
          title: draft.title,
          description: draft.summary,
          content: draft.content,
          raw_source: draft.bodyContent || draft.content,
          summary: draft.summary,
          characters: draft.globalContext.keyCharacters.join('\n'),
          character_relationships: JSON.stringify(draft.globalContext.characterRelationships),
          core_settings: draft.globalContextText,
          background: draft.globalContext.storyWorld,
          scenes_desc: draft.globalContext.keyLocations.join('\n'),
          structured_characters: JSON.stringify(draft.globalContext.keyCharacters.map((name) => ({ name, scope: 'global' }))),
          structure_json: JSON.stringify({
            global_context: draft.globalContext,
            episode: {
              order: draft.order,
              title: draft.title,
              summary: draft.summary,
              start_line: draft.startLine,
              end_line: draft.endLine,
            },
          }),
          entity_candidates: JSON.stringify([
            ...draft.globalContext.keyCharacters.map((name) => ({ type: 'character', name, scope: 'global' })),
            ...draft.globalContext.keyLocations.map((name) => ({ type: 'location', name, scope: 'global' })),
            ...draft.globalContext.keyProps.map((name) => ({ type: 'prop', name, scope: 'global' })),
          ]),
          relationship_candidates: JSON.stringify(draft.globalContext.characterRelationships.map((description) => ({
            type: 'character_relationship',
            description,
            scope: 'global',
          }))),
          script_type: 'episode',
          source_type: 'adapted',
          order: draft.order,
          parent_script_id: sourceScriptId,
        })
        createdScripts.push(saved)
        if (existing) updatedCount += 1
        else createdCount += 1
      }

      let productionCreatedCount = 0
      let productionUpdatedCount = 0
      let productionSkippedCount = 0
      const savedScriptByTitle = new Map(createdScripts.map((script) => [normalizeEntityTitleKey(script.title), script]))
      const savedProductions: SemanticEntityRecord[] = []
      for (const draft of nextDrafts) {
        const savedScript = savedScriptByTitle.get(normalizeEntityTitleKey(draft.title))
        const productionResult = await upsertProductionForDraft({
          draft,
          sourceScriptTitle,
          sourceScriptId,
          savedScriptId: savedScript?.ID ?? null,
          agentDraftId: syncedDraft?.id,
        })
        if (productionResult.action === 'skip') {
          productionSkippedCount += 1
          continue
        }
        if (productionResult.record) savedProductions.push(productionResult.record)
        if (productionResult.action === 'update') productionUpdatedCount += 1
        else productionCreatedCount += 1
      }

      let appliedDraft = syncedDraft
      if (syncedDraft) {
        appliedDraft = await localAgentClient.updateDraft(syncedDraft.id, {
          status: 'applied',
          metadata: {
            appliedFrom: 'workbench.script_split_proposal',
            appliedAt: new Date().toISOString(),
            sourceScriptId,
            savedScriptIds: createdScripts.map((script) => script.ID),
            savedProductionIds: savedProductions.map((production) => production.ID),
            createdCount,
            updatedCount,
            productionCreatedCount,
            productionUpdatedCount,
            productionSkippedCount,
          },
        })
        setAgentDraft(appliedDraft)
        setAgentDraftDirty(false)
      }

      return {
        sourceTitle: sourceScriptTitle,
        sourceScriptId,
        createdCount,
        updatedCount,
        episodeCount: createdScripts.length,
        productionCreatedCount,
        productionUpdatedCount,
        productionSkippedCount,
        agentRunId,
        agentDraftId: appliedDraft?.id ?? result?.agentDraftId,
        savedScripts: createdScripts,
      } satisfies ScriptSplitResult
    },
    onSuccess: (next) => {
      setResult(next)
      queryClient.invalidateQueries({ queryKey: ['scripts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      queryClient.invalidateQueries({ queryKey: ['workbench-script-productions', projectId] })
      queryClient.invalidateQueries({ queryKey: ['production-frame', projectId] })
      toast.success(`已启动 ${next.episodeCount} 个制作入口，${(next.productionCreatedCount ?? 0) + (next.productionUpdatedCount ?? 0)} 个制作决策已写入`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '开始制作失败')
    },
  })

  const selectedScriptAction = selectedDraft ? (selectedDraft.action === 'update' ? '将更新已有剧本' : '将创建新剧本') : ''
  const selectedProductionAction = selectedDraft
    ? selectedDraft.productionAction === 'skip'
      ? '不创建制作'
      : selectedDraft.productionAction === 'update'
        ? '将更新已有制作'
        : '将创建新制作'
    : ''
  const selectedAction = selectedDraft ? `${selectedScriptAction} · ${selectedProductionAction}` : '先生成制作方案，再开始生成'
  const agentDraftWriteBlocked = !agentDraft || agentDraft.status === 'rejected' || agentDraft.status === 'applied' || agentDraft.status === 'superseded'
  const writeDisabled = !sourceText.trim() || drafts.length === 0 || agentDraftWriteBlocked || createAll.isPending || importingFile || splitWithAgent.isPending || draftSyncing
  const validationErrors = agentDraftValidation?.issues.filter((issue) => issue.severity === 'error') ?? []
  const hasSourceInput = Boolean(sourceText.trim())
  const hasPlan = drafts.length > 0
  const hasStartedProduction = Boolean(result) || agentDraft?.status === 'applied'
  const hasModel = Boolean(modelId)
  const selectedAssetHints = selectedDraft
    ? [
      ...selectedDraft.globalContext.keyCharacters.slice(0, 3).map((name) => `角色 · ${name}`),
      ...selectedDraft.globalContext.keyLocations.slice(0, 2).map((name) => `场景 · ${name}`),
      ...selectedDraft.globalContext.keyProps.slice(0, 3).map((name) => `道具 · ${name}`),
    ].slice(0, 6)
    : []
  const selectedSettingHints = selectedDraft
    ? [
      firstText(selectedDraft.globalContext.storyWorld, '故事世界待补充'),
      ...selectedDraft.globalContext.coreRules,
      ...selectedDraft.globalContext.continuityNotes,
    ].filter(Boolean).slice(0, 4)
    : []
  const oneClickFlow = [
    { label: '输入剧本/提示词', detail: sourceTitleLabel, done: hasSourceInput, active: !hasSourceInput, icon: ScrollText },
    { label: '生成制作方案', detail: hasPlan ? `${drafts.length} 个制作入口` : '自动拆解设定、段落和制作主体', done: hasPlan, active: hasSourceInput && !hasPlan, icon: Bot },
    { label: '轻确认', detail: selectedDraft ? selectedAction : '确认风格、素材缺口和制作决策', done: hasPlan && !validationErrors.length, active: hasPlan && !hasStartedProduction, icon: ClipboardCheck },
    { label: '开始生成', detail: hasStartedProduction ? '制作入口已写入' : '写入剧本与制作主体', done: hasStartedProduction, active: hasPlan && !hasStartedProduction, icon: Wand2 },
    { label: '进入预演', detail: '从制作编排继续验证镜头和缺口', done: false, active: hasStartedProduction, icon: Play },
  ]
  const primaryActionLabel = !hasPlan
    ? splitWithAgent.isPending ? '生成方案中' : '一键制作'
    : createAll.isPending ? '开始生成中' : draftSyncing ? '同步方案中' : '开始生成'
  const primaryActionDisabled = !hasSourceInput || importingFile || splitWithAgent.isPending || createAll.isPending || (hasPlan && writeDisabled)

  function handlePrimaryProductionAction() {
    if (!hasPlan) {
      handleSplit()
      return
    }
    createAll.mutate()
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border bg-background px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wand2 size={14} />
              <span>一键制作</span>
              <ChevronRight size={13} />
              <span>方案 · 生成 · 预演</span>
            </div>
            <h1 className="mt-1 text-lg font-semibold text-foreground">一键制作</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
              输入剧本、brief 或提示词，自动生成制作设定、素材需求线索和制作入口；确认后写入项目，并直接进入预演验证。
            </p>
          </div>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={SCRIPT_DOCUMENT_ACCEPT}
        onChange={(event) => {
          void handleImportFile(event.target.files?.[0])
          event.currentTarget.value = ''
        }}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-y-auto bg-muted/20 p-5">
          <section className="one-click-workbench mb-5 rounded-lg border border-border bg-card p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">制作流</p>
                    <p className="mt-1 text-xs text-muted-foreground">把分析藏到后台，把用户路径收敛成输入、确认、生成和预演。</p>
                  </div>
                  {scriptsLoading ? <Loader2 size={13} className="animate-spin text-muted-foreground" /> : <Badge variant="outline">{sortedScripts.length} 个剧本 · {productions.length} 个制作</Badge>}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-5">
                  {oneClickFlow.map((step, index) => {
                    const Icon = step.icon
                    return (
                      <div
                        key={step.label}
                        className={cn(
                          'rounded-md border px-3 py-3',
                          step.done ? 'border-emerald-500/30 bg-emerald-500/5' : step.active ? 'border-primary/40 bg-primary/5' : 'border-border bg-background',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                            step.done ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : step.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                          )}>
                            <Icon size={15} />
                          </span>
                          <span className="text-[11px] text-muted-foreground">0{index + 1}</span>
                        </div>
                        <p className="mt-3 truncate text-sm font-medium text-foreground">{step.label}</p>
                        <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">{step.detail}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">当前主动作</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{hasPlan ? '确认方案并开始生成' : '从剧本/提示词生成方案'}</p>
                  </div>
                  <Badge variant={hasStartedProduction ? 'success' : hasPlan ? 'warning' : 'outline'}>
                    {hasStartedProduction ? '已启动' : hasPlan ? '待确认' : '待输入'}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">制作入口</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{drafts.length}</p>
                  </div>
                  <div className="rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">模型</p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{hasModel ? '可用' : '待配置'}</p>
                  </div>
                  <div className="rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">Agent Draft</p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{agentDraftDirty ? '待同步' : scriptSplitDraftStatusLabel(agentDraft?.status)}</p>
                  </div>
                  <div className="rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">总稿</p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{saveSourceScript ? '保存' : '不保存'}</p>
                  </div>
                </div>
                <Button className="mt-3 w-full justify-center gap-2" onClick={handlePrimaryProductionAction} disabled={primaryActionDisabled}>
                  {splitWithAgent.isPending || createAll.isPending || draftSyncing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  {primaryActionLabel}
                </Button>
              </div>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">剧本 / 提示词输入</p>
                  <p className="mt-1 text-xs text-muted-foreground">支持完整剧本、广告 brief、短片想法或一句提示词；系统会自动补齐制作方案。</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{sourceText.length} 字</Badge>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={importingFile}>
                    {importingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {importingFile ? '导入中' : '导入文档'}
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={handlePrimaryProductionAction} disabled={primaryActionDisabled}>
                    {splitWithAgent.isPending || createAll.isPending || draftSyncing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {primaryActionLabel}
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-4">
                <div>
                  <Label className="mb-1 text-xs text-muted-foreground">项目标题</Label>
                  <Input
                    value={sourceTitle}
                    onChange={(event) => setSourceTitle(event.target.value)}
                    placeholder="例如：雨夜旧伞 / 30 秒产品短片"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">来源: {sourceTitleLabel}</p>
                </div>
                <div>
                  <Label className="mb-1 text-xs text-muted-foreground">剧本或提示词</Label>
                  <Textarea
                    className="min-h-[420px] resize-none font-mono text-xs leading-relaxed"
                    value={sourceText}
                    onChange={(event) => handleSourceTextChange(event.target.value)}
                    placeholder="粘贴剧本，或直接描述你想制作的视频。例如：一个 30 秒悬疑短片，主角在雨夜旧伞里发现一张来自未来的纸条。"
                  />
                </div>
                <div className="rounded-md border border-border bg-background">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">来源定位</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">用于回看方案对应的原文范围，避免生成结果失去依据。</p>
                    </div>
                    <Badge variant={selectedDraft ? 'secondary' : 'outline'} className="shrink-0">
                      {selectedDraft ? `第 ${selectedDraft.startLine}-${selectedDraft.endLine} 行` : `${sourceLineCount} 行`}
                    </Badge>
                  </div>
                  <ScriptLinePreview
                    lines={sourceLineEntries}
                    highlightStartLine={selectedDraft?.startLine}
                    highlightEndLine={selectedDraft?.endLine}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={saveSourceScript}
                      onChange={(event) => setSaveSourceScript(event.target.checked)}
                      className="h-4 w-4 rounded border-border text-foreground"
                    />
                    同步保存总稿
                  </label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setSourceText(''); setSourceTitle(''); setSourceFileName(''); setSourceFileError(''); resetAgentDrafts() }}>
                      清空
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={handlePrimaryProductionAction} disabled={primaryActionDisabled}>
                      {splitWithAgent.isPending || createAll.isPending || draftSyncing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                      {primaryActionLabel}
                    </Button>
                  </div>
                </div>
                {sourceFileError && <p className="text-xs text-destructive">{sourceFileError}</p>}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">制作方案</p>
                  <p className="mt-1 text-xs text-muted-foreground">轻确认设定、素材线索和制作入口后，再让系统写入并进入预演。</p>
                </div>
                <Badge variant={drafts.length > 0 ? 'success' : 'outline'}>{drafts.length || 0} 个入口</Badge>
              </div>
              <div className="mt-4 rounded-md border border-border bg-background px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">Agent Draft</p>
                      <Badge variant={scriptSplitDraftStatusVariant(agentDraft?.status)}>
                        {agentDraftDirty ? '有未同步修改' : scriptSplitDraftStatusLabel(agentDraft?.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {agentDraft?.id ?? '一键制作后会生成可审阅的 production plan draft'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void refreshAgentDraft()}
                      disabled={!agentDraft || draftSyncing || createAll.isPending}
                    >
                      <RefreshCw size={13} className={draftSyncing ? 'animate-spin' : ''} />
                      刷新
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void syncAgentDraft()}
                      disabled={!agentDraft || !agentDraftDirty || draftSyncing || createAll.isPending || agentDraft.status !== 'draft'}
                    >
                      <ClipboardCheck size={13} />
                      同步草稿
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive"
                      onClick={() => void rejectAgentDraft()}
                      disabled={!agentDraft || draftRejecting || createAll.isPending || agentDraft.status !== 'draft'}
                    >
                      {draftRejecting ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                      删除
                    </Button>
                  </div>
                </div>
                {validationErrors.length > 0 && (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
                    {validationErrors[0]?.message}
                  </div>
                )}
              </div>
              <div className="mt-4 space-y-3">
                {drafts.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-background px-4 py-10 text-center text-xs text-muted-foreground">
                    还没有制作方案
                  </div>
                ) : (
                  drafts.map((draft) => {
                    const active = selectedDraftId === draft.id
                    const productionBadgeVariant = draft.productionAction === 'update'
                      ? 'warning'
                      : draft.productionAction === 'skip'
                        ? 'outline'
                        : 'success'
                    return (
                      <button
                        key={draft.id}
                        type="button"
                        onClick={() => setSelectedDraftId(draft.id)}
                        className={cn(
                          'w-full rounded-md border px-3 py-3 text-left transition-colors',
                          active ? 'border-primary/50 bg-primary/5' : 'border-border bg-background hover:bg-muted/30',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">入口 {draft.order}</span>
                              <Badge variant={draft.action === 'update' ? 'warning' : 'outline'}>
                                {draft.action === 'update' ? '更新已有' : '新建'}
                              </Badge>
                              <Badge variant={productionBadgeVariant as 'warning' | 'outline' | 'success'}>
                                {draft.productionAction === 'update' ? '更新制作' : draft.productionAction === 'skip' ? '跳过制作' : '新建制作'}
                              </Badge>
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {draft.startLine}-{draft.endLine} 行
                              </Badge>
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{draft.summary || '暂无摘要'}</p>
                          </div>
                          <span className="text-[11px] tabular-nums text-muted-foreground">{draft.content.length} 字</span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              {selectedDraft && (
                <div className="mt-4 rounded-md border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">当前选中</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{selectedAction}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        覆盖行号：第 {selectedDraft.startLine}-{selectedDraft.endLine} 行
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant={selectedDraft.action === 'update' ? 'warning' : 'outline'}>{selectedDraft.action === 'update' ? '更新剧本' : '新建剧本'}</Badge>
                        <Badge variant={selectedDraft.productionAction === 'update' ? 'warning' : selectedDraft.productionAction === 'skip' ? 'outline' : 'success'}>
                          {selectedDraft.productionAction === 'update' ? '更新制作' : selectedDraft.productionAction === 'skip' ? '跳过制作' : '新建制作'}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {selectedDraft.existingProductionId ? `制作 #${selectedDraft.existingProductionId}` : '未绑定制作'}
                        </Badge>
                      </div>
                    </div>
                    <Badge variant={selectedDraft.action === 'update' ? 'warning' : 'success'}>{selectedDraft.action === 'update' ? '更新' : '创建'}</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-border px-3 py-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Sparkles size={14} />
                        <span>设定线索</span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {selectedSettingHints.length > 0 ? selectedSettingHints.map((item) => (
                          <p key={item} className="line-clamp-2 text-xs leading-5 text-foreground">{item}</p>
                        )) : <p className="text-xs text-muted-foreground">等待 Agent 补齐风格、世界观和连续性约束。</p>}
                      </div>
                    </div>
                    <div className="rounded-md border border-border px-3 py-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <PackageCheck size={14} />
                        <span>素材需求线索</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedAssetHints.length > 0 ? selectedAssetHints.map((item) => (
                          <Badge key={item} variant="outline">{item}</Badge>
                        )) : <p className="text-xs text-muted-foreground">方案生成后会列出角色、场景、道具等素材输入。</p>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    <div>
                      <Label className="mb-1 text-xs text-muted-foreground">制作入口标题</Label>
                      <Input
                        value={selectedDraft.title}
                        onChange={(event) => updateEpisodeDraftState(selectedDraft.id, { title: event.target.value })}
                        disabled={agentDraft?.status === 'applied' || agentDraft?.status === 'rejected' || agentDraft?.status === 'superseded'}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 text-xs text-muted-foreground">源内容 / 分段正文</Label>
                      <Textarea
                        className="min-h-52 resize-none font-mono text-xs leading-relaxed"
                        value={selectedDraft.content}
                        onChange={(event) => updateEpisodeDraftState(selectedDraft.id, {
                          content: event.target.value,
                          bodyContent: event.target.value,
                          summary: summarizeText(event.target.value, 120),
                        })}
                        disabled={agentDraft?.status === 'applied' || agentDraft?.status === 'rejected' || agentDraft?.status === 'superseded'}
                      />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <Label className="mb-1 text-xs text-muted-foreground">制作标题</Label>
                        <Input
                          value={selectedDraft.productionTitle}
                          onChange={(event) => updateEpisodeDraftState(selectedDraft.id, { productionTitle: event.target.value })}
                          disabled={agentDraft?.status === 'applied' || agentDraft?.status === 'rejected' || agentDraft?.status === 'superseded'}
                        />
                      </div>
                      <div>
                        <Label className="mb-1 text-xs text-muted-foreground">制作决策</Label>
                        <Select
                          value={selectedDraft.productionAction}
                          onValueChange={(value) => updateEpisodeDraftState(selectedDraft.id, { productionAction: value as ScriptSplitDraft['productionAction'] })}
                          disabled={agentDraft?.status === 'applied' || agentDraft?.status === 'rejected' || agentDraft?.status === 'superseded'}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="create">新建制作</SelectItem>
                            <SelectItem value="update">更新制作</SelectItem>
                            <SelectItem value="skip">跳过制作</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="mb-1 text-xs text-muted-foreground">制作摘要与预演意图</Label>
                      <Textarea
                        className="min-h-28 resize-none text-xs leading-relaxed"
                        value={selectedDraft.productionSummary}
                        onChange={(event) => updateEpisodeDraftState(selectedDraft.id, { productionSummary: event.target.value })}
                        disabled={agentDraft?.status === 'applied' || agentDraft?.status === 'rejected' || agentDraft?.status === 'superseded'}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>

        {result && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-card p-4">
            <section className="rounded-md border border-border bg-background p-3">
              <p className="text-sm font-semibold text-foreground">最近一次制作启动</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">项目</p>
                  <p className="mt-1 truncate text-foreground">{result.sourceTitle}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">入口</p>
                  <p className="mt-1 text-foreground">{result.episodeCount}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">剧本创建</p>
                  <p className="mt-1 text-foreground">{result.createdCount}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">剧本更新</p>
                  <p className="mt-1 text-foreground">{result.updatedCount}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">制作新建</p>
                  <p className="mt-1 text-foreground">{result.productionCreatedCount ?? 0}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">制作更新</p>
                  <p className="mt-1 text-foreground">{result.productionUpdatedCount ?? 0}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-2">
                  <p className="text-muted-foreground">制作跳过</p>
                  <p className="mt-1 text-foreground">{result.productionSkippedCount ?? 0}</p>
                </div>
                {result.agentRunId && (
                  <div className="col-span-2 rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">Agent Run</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-foreground">{result.agentRunId}</p>
                  </div>
                )}
                {result.agentDraftId && (
                  <div className="col-span-2 rounded-md border border-border px-2 py-2">
                    <p className="text-muted-foreground">Agent Draft</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-foreground">{result.agentDraftId}</p>
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-md border border-border px-3 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Play size={14} />
                  <span>下一步</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-foreground">进入制作编排或制作预演，继续检查镜头、关键帧、素材缺口和预演记录。</p>
              </div>
              <Button size="sm" className="mt-3 w-full gap-1.5" onClick={() => navigate('/workbench/production-plan')}>
                <Play size={13} />
                开始预演
              </Button>
            </section>
          </aside>
        )}
      </div>
    </div>
  )
}

function CategoryContent({ category }: { category: WorkbenchCategory }) {
  if (category === 'script') return <ScriptSplitWorkbench />
  if (category === 'assets') return <PreProductionAssetWorkspace />
  if (category === 'creative') return <SettingPreparationWorkbench />
  if (category === 'production') return <ContentGenerationWorkbench />
  if (category === 'reference-relations') return <ReferenceRelationsPage embedded initialView="graph" />
  return <ScenarioWorkspace category={category} />
}

export function WorkbenchContent({ initialCategory = 'script', showCategoryTabs = true }: WorkbenchContentProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [category, setCategory] = useState<WorkbenchCategory>(() => {
    const tab = searchParams.get('tab')
    return showCategoryTabs && workbenchSurfaces.some((item) => item.value === tab) ? (tab as WorkbenchCategory) : initialCategory
  })

  useEffect(() => {
    const tab = searchParams.get('tab')
    setCategory(showCategoryTabs && workbenchSurfaces.some((item) => item.value === tab) ? (tab as WorkbenchCategory) : initialCategory)
  }, [searchParams, initialCategory, showCategoryTabs])

  const activeCategory = showCategoryTabs ? category : initialCategory
  const summary = useMemo(() => {
    if (activeCategory === 'preview') return '真实制作数据 · 先看编排、缺口和预演记录'
    const scenario = scenarios[activeCategory]
    const blocked = scenario.queue.filter((item) => item.status === 'blocked').length
    const review = scenario.queue.filter((item) => item.status === 'review').length
    const running = scenario.queue.filter((item) => item.status === 'running').length
    return `${review} 个待确认 · ${blocked} 个阻塞 · ${running} 个运行中`
  }, [activeCategory])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {showCategoryTabs && (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-md bg-muted p-0.5">
            {workbenchSurfaces.map((item) => {
              const Icon = item.icon
              const active = category === item.value
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    if (item.value === 'delivery') {
                      navigate(item.href)
                      return
                    }
                    setCategory(item.value)
                    const next = new URLSearchParams(searchParams)
                    next.set('tab', item.value)
                    setSearchParams(next, { replace: true })
                  }}
                  className={cn(
                    'flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded px-3 text-sm font-medium transition-colors',
                    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon size={15} />
                  <span className="truncate">{item.shortTitle}</span>
                </button>
              )
            })}
          </div>
          <div className="ml-3 hidden shrink-0 items-center gap-2 text-xs text-muted-foreground xl:flex">
            <Clock3 size={14} />
            <span>{summary}</span>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <CategoryContent category={activeCategory} />
      </div>
    </div>
  )
}

interface WorkbenchPageProps {
  mode: WorkbenchMode
  initialCategory?: WorkbenchCategory
  showCategoryTabs?: boolean
}

export default function WorkbenchPage({ mode, initialCategory, showCategoryTabs }: WorkbenchPageProps) {
  return <WorkbenchContent mode={mode} initialCategory={initialCategory} showCategoryTabs={showCategoryTabs} />
}
