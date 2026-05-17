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
  Library,
  ListChecks,
  Loader2,
  LockKeyhole,
  PackageCheck,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Route,
  ScrollText,
  Settings2,
  ShieldCheck,
  Scissors,
  Sparkles,
  Target,
  Upload,
  Users,
  Wand2,
  X,
  type LucideIcon,
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
import { buildContentWorkbenchActivityFeed, type ContentWorkbenchActivityFeed } from '@/lib/contentWorkbenchActivity'
import { buildContentWorkbenchAiSuggestPrompt } from '@/lib/contentWorkbenchAiPrompt'
import { pickContentWorkbenchFirstUsableUnit, pickContentWorkbenchFocusAfterIgnoredCandidate } from '@/lib/contentWorkbenchCandidateFocus'
import {
  contentWorkbenchProposalDefaults,
  contentWorkbenchProposalFieldString,
  contentWorkbenchProposalSnapshot,
  contentWorkbenchProposalUnitKey,
  contentWorkbenchProposalUnitTitle,
  normalizeContentWorkbenchProposalText,
} from '@/lib/contentWorkbenchDraftProposal'
import { buildContentWorkbenchCanvasPayload, findContentWorkbenchCanvas } from '@/lib/contentWorkbenchCanvas'
import { buildContentWorkbenchCommandBrief, type ContentWorkbenchCommandBriefKey } from '@/lib/contentWorkbenchCommandBrief'
import { buildContentWorkbenchDeliveryBrief, type ContentWorkbenchDeliveryBrief } from '@/lib/contentWorkbenchDeliveryBrief'
import { pickContentWorkbenchRelevantJobs } from '@/lib/contentWorkbenchJobScope'
import { buildContentWorkbenchNextActions, type ContentWorkbenchNextActionKey, type ContentWorkbenchNextActionView } from '@/lib/contentWorkbenchNextActions'
import { buildContentWorkbenchPipeline, type ContentWorkbenchPipelineStep, type ContentWorkbenchPipelineStepKey } from '@/lib/contentWorkbenchPipeline'
import { buildContentWorkbenchReadinessSummary } from '@/lib/contentWorkbenchReadiness'
import { buildContentWorkbenchReviewQueueSummary, type ContentWorkbenchReviewQueueSummary } from '@/lib/contentWorkbenchReviewQueue'
import { buildContentWorkbenchRouteSearch, pickContentWorkbenchRowIdForDeepLink } from '@/lib/contentWorkbenchRoute'
import { buildContentWorkbenchUnitHealth, type ContentWorkbenchUnitHealth } from '@/lib/contentWorkbenchUnitHealth'
import { buildContentWorkbenchUnitTrack } from '@/lib/contentWorkbenchUnitTrack'
import { pickContentWorkbenchUploadTarget } from '@/lib/contentWorkbenchUploadTarget'
import { cn } from '@/lib/utils'
import { useAgentStore } from '@/store/agentStore'
import { useAgentSessionStore } from '@/store/agentSessionStore'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import type { Canvas, CanvasStage, Job, PaginatedResponse, PublicModel, RawResource } from '@/types'
import type { Script } from '@/types'
import { Badge, Button, Card, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Progress, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { Input, Label, Textarea } from '@movscript/ui'
import { SemanticEntityInlineEditor } from '@/components/shared/SemanticEntityInlineEditor'
import { AuthedImage } from '@/components/shared/AuthedImage'
import { ResourceLibraryPicker } from '@/components/shared/ResourceLibraryPicker'
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
} from '@/pages/project/projectSurfaces'
import { PreProductionAssetWorkspace } from '@/pages/pre-production/PreProductionPage'
import { ROUTES, mergeSearch, withRouteParams } from '@/routes/projectRoutes'

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
      { label: '状态', value: '可进入内容编排', tone: 'success' },
    ],
    actions: ['确认为情景', '拆成两个情景', '忽略候选', '生成设定资料候选'],
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
      { label: '影响', value: '分镜、素材需求、画面锚点一致性' },
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
    evidence: ['必须可用于画面锚点', '必须和人物状态一致', '必须能解释纸条藏在伞骨里'],
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
      { label: '状态', value: '可生成画面锚点', tone: 'success' },
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
  previewTimelines: WorkbenchRecord[]
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

type ContentSnapshotDiffState = 'added' | 'changed' | 'unchanged' | 'planned'
type ContentSnapshotDiffKind = 'content_unit' | 'keyframe'

interface ContentSnapshotFieldDiff {
  label: string
  before?: string
  after?: string
}

interface ContentSnapshotDiff {
  key: string
  state: ContentSnapshotDiffState
  kind: ContentSnapshotDiffKind
  title: string
  target: string
  detail: string
  impact: string
  before?: string
  after?: string
  fields: ContentSnapshotFieldDiff[]
  currentUnitId?: number
  proposal?: Record<string, unknown>
}

interface ContentDraftReviewModel {
  draft: AgentDraft
  summary: string
  targetLabel: string
  diffs: ContentSnapshotDiff[]
  warnings: string[]
  stats: Array<{ label: string; value: number }>
}

async function loadProductionWorkbenchData(projectId: number): Promise<ProductionWorkbenchData> {
  const [productions, segments, sceneMoments, creativeReferences, creativeReferenceUsages, contentUnits, assetSlots, keyframes, previewTimelines, previewTimelineItems, deliveryVersions, jobs] = await Promise.all([
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
    { label: '阻塞制作项', value: String(rows.filter((row) => row.status === 'blocked').length), detail: '存在 missing 素材需求', icon: AlertTriangle, status: rows.some((row) => row.status === 'blocked') ? 'blocked' : 'ready' },
    { label: '视频任务', value: String(runningJobs || succeededJobs), detail: runningJobs > 0 ? '有任务运行中' : '已完成任务', icon: Film, status: runningJobs > 0 ? 'running' : succeededJobs > 0 ? 'ready' : 'review' },
  ]
}

function buildMomentMetrics(rows: ContentGenerationMomentRow[], data?: ProductionWorkbenchData): WorkbenchMetric[] {
  const readyMoments = rows.filter((row) => row.units.length > 0 && row.missingSlots.length === 0).length
  const uncoveredMoments = rows.filter((row) => row.units.length === 0).length
  const totalUnits = rows.reduce((sum, row) => sum + row.units.length, 0)
  return [
    { label: '情节', value: String(rows.length), detail: '生成工作台的入口层', icon: Route, status: rows.length > 0 ? 'review' : 'blocked' },
    { label: '已有制作项', value: String(totalUnits), detail: '情节下面的制作项', icon: Boxes, status: totalUnits > 0 ? 'ready' : 'blocked' },
    { label: '可直接生成', value: String(readyMoments), detail: '情节、制作项和素材输入都已接上', icon: CheckCircle2, status: readyMoments > 0 ? 'ready' : 'review' },
    { label: '待拆制作项', value: String(uncoveredMoments), detail: '还没有生成制作项的情节', icon: Wand2, status: uncoveredMoments > 0 ? 'blocked' : 'ready' },
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
    { label: '画面锚点', value: row.keyframes.length > 0 ? `${row.keyframes.length} 个画面锚点：${row.keyframes.slice(0, 2).map(titleOfRecord).join('、')}` : '尚未绑定画面锚点', icon: Image },
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
    { label: '制作项', value: row.units.length > 0 ? `${row.units.length} 个，${row.units.slice(0, 2).map(titleOfRecord).join('、')}` : '尚未生成制作项', icon: Boxes },
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
    { label: '画面锚点具备', detail: hasKeyframe ? `${row.keyframes.length} 个画面锚点可用` : '建议先生成或绑定开头、结尾等画面锚点', done: hasKeyframe, tone: hasKeyframe ? 'success' : 'warning' },
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
    { label: '制作项存在', detail: hasUnits ? `${row.units.length} 个制作项可继续拆分` : '还没有制作项，先手动创建或让 AI 规划制作项', done: hasUnits, tone: hasUnits ? 'success' : 'warning' },
    { label: '制作项提示可用', detail: hasUnitPrompt ? '已有 description 或 prompt，可直接驱动生成' : '需要为制作项补上生成提示或用途说明', done: hasUnitPrompt, tone: hasUnitPrompt ? 'success' : 'warning' },
    { label: '素材输入就绪', detail: assetsReady ? '没有未处理的素材缺口' : `${row.missingSlots.length} 个素材缺口仍在阻塞`, done: assetsReady, tone: assetsReady ? 'success' : 'warning' },
    { label: '生成记录可追溯', detail: hasJob ? '已有项目生成任务记录' : '当前项目还没有生成任务记录', done: hasJob, tone: hasJob ? 'success' : 'warning' },
  ]
}

function appendReviewGate(rows: WorkbenchGate[], pendingDraftCount: number): WorkbenchGate[] {
  if (rows.length === 0) return rows
  return [
    ...rows,
    {
      label: 'AI 草案已处理',
      detail: pendingDraftCount > 0 ? `${pendingDraftCount} 个制作项草案仍需人工审阅` : '没有待处理的制作项草案',
      done: pendingDraftCount === 0,
      tone: pendingDraftCount === 0 ? 'success' : 'warning',
    },
  ]
}

function buildGenerationContextStandards(context?: GenerationContext): WorkbenchGate[] {
  if (!context) return []
  const target = context.target.content_unit
  const lockedAssets = context.asset_slots.filter((slot) => isGenerationAssetUsable(slot)).length
  const missingAssets = context.asset_slots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing').length
  const hasTargetPrompt = Boolean(firstText(target.prompt, target.description))
  const hasScriptSource = Boolean(context.script_block)
  const hasStoryContext = Boolean(context.scene_moment || context.segment)
  const hasContinuity = context.creative_references.length > 0
  const assetsReady = context.asset_slots.length > 0 && missingAssets === 0 && lockedAssets > 0
  const hasKeyframe = context.keyframes.length > 0
  return [
    { label: '目标提示可读', detail: hasTargetPrompt ? firstText(target.prompt, target.description) : '制作项缺少 prompt 或 description，Agent 难以判断画面目标', done: hasTargetPrompt, tone: hasTargetPrompt ? 'success' : 'warning' },
    { label: '剧本来源稳定', detail: hasScriptSource ? scriptBlockContextLabel(context.script_block) : '未绑定不可变剧本块，生成缺少可追溯的剧本行文', done: hasScriptSource, tone: hasScriptSource ? 'success' : 'warning' },
    { label: '情景上下文存在', detail: hasStoryContext ? [context.segment ? `编排段：${titleOfRecord(context.segment)}` : null, context.scene_moment ? `情景：${titleOfRecord(context.scene_moment)}` : null].filter(Boolean).join(' / ') : '未绑定情景或编排段，生成会缺少时空、动作和情绪约束', done: hasStoryContext, tone: hasStoryContext ? 'success' : 'warning' },
    { label: '连续性资料可用', detail: hasContinuity ? `${context.creative_references.length} 个设定引用会进入生成上下文` : '未找到人物、地点、风格或道具设定引用', done: hasContinuity, tone: hasContinuity ? 'success' : 'warning' },
    { label: '素材输入可用', detail: context.asset_slots.length === 0 ? '未找到素材需求或参考素材' : `${context.asset_slots.length} 个素材输入，${lockedAssets} 个可用，${missingAssets} 个缺失`, done: assetsReady, tone: assetsReady ? 'success' : 'warning' },
    { label: '首帧/画面锚点', detail: hasKeyframe ? `${context.keyframes.length} 个画面锚点可作为视频生成锚点` : '视频生成前建议先生成或绑定开头、结尾等画面锚点', done: hasKeyframe, tone: hasKeyframe ? 'success' : 'warning' },
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
    { label: '剧本来源', value: context.script_block ? firstText(context.script_block.content, scriptBlockContextLabel(context.script_block)) : '未绑定剧本块', icon: ScrollText },
    { label: '情景', value: context.scene_moment ? firstText(context.scene_moment.description, context.scene_moment.action_text, titleOfRecord(context.scene_moment)) : '未绑定情景', icon: Route },
    { label: '设定引用', value: referenceNames.length > 0 ? referenceNames.slice(0, 4).join('、') : '未找到设定引用', icon: Users },
    { label: '素材输入', value: assetSummary, icon: PackageCheck },
    { label: '画面锚点', value: context.keyframes.length > 0 ? context.keyframes.slice(0, 3).map(titleOfRecord).join('、') : '未找到画面锚点', icon: Image },
    { label: '写回范围', value: context.constraints.write_targets.join('、') || '未声明写回范围', icon: ShieldCheck },
  ]
}

function scriptBlockContextLabel(block?: SemanticEntityRecord) {
  if (!block) return '未绑定剧本块'
  const lines = Number(block.start_line) > 0 && Number(block.end_line) > 0
    ? `行 ${block.start_line}-${block.end_line}`
    : `剧本块 #${block.ID}`
  const kind = String(block.kind ?? '').trim()
  const speaker = String(block.speaker ?? '').trim()
  return [lines, kind, speaker].filter(Boolean).join(' · ')
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

function buildContentDraftReviewModel(
  draft: AgentDraft,
  context: {
    rowByMomentId: Map<number, ContentGenerationMomentRow>
    rowByUnitId: Map<number, ContentGenerationMomentRow>
  },
): ContentDraftReviewModel {
  const parsed = parseDraftJsonContent(draft.content)
  const warnings: string[] = []
  const diffs: ContentSnapshotDiff[] = []

  if (!parsed) {
    warnings.push('草案内容不是可解析的 JSON。')
    return {
      draft,
      summary: '草案内容无法解析，暂时不能做结构对比。',
      targetLabel: draft.title,
      diffs,
      warnings,
      stats: [],
    }
  }

  if (draft.kind === 'content_unit_proposal') {
    const sceneMomentId = draftEntityId(draft.target) || draftEntityId(draft.source) || numberOf(parsed.sceneMomentId ?? parsed.scene_moment_id)
    const row = sceneMomentId > 0 ? context.rowByMomentId.get(sceneMomentId) ?? null : null
    const proposal: Record<string, unknown> = isRecord(parsed.proposal) ? parsed.proposal : {}
    const proposedUnits = draftRecordsArray(proposal.units ?? parsed.units)
    const currentUnits = row?.units ?? []
    const usedCurrentIds = new Set<number>()

    if (!row) warnings.push('草案没有指向当前情节，无法做精确当前值对比。')

    proposedUnits.forEach((unit, index) => {
      if ('action' in unit) warnings.push(`草案制作项「${contentWorkbenchProposalUnitTitle(unit, index)}」包含旧版操作字段；snapshot 审阅不会把它当作草案语义。`)
      const current = matchCurrentContentUnit(unit, currentUnits, usedCurrentIds, index)
      const fields = compareContentUnitFields(current, unit)
      const state: ContentSnapshotDiffState = current ? (fields.length > 0 ? 'changed' : 'unchanged') : 'added'
      if (current) usedCurrentIds.add(current.ID)
      diffs.push({
        key: `unit-${index}-${current?.ID ?? contentWorkbenchProposalUnitKey(unit, index)}`,
        state,
        kind: 'content_unit',
        title: contentWorkbenchProposalUnitTitle(unit, index),
        target: current ? `当前制作项 #${current.ID}` : '新增制作项',
        detail: contentUnitChangeDetail(current, unit, fields),
        impact: contentUnitChangeImpact(state, current, fields),
        before: current ? contentUnitSnapshot(current) : undefined,
        after: contentWorkbenchProposalSnapshot(unit),
        fields,
        currentUnitId: current?.ID,
        proposal: current ? undefined : unit,
      })
    })

    currentUnits.forEach((current) => {
      if (usedCurrentIds.has(current.ID)) return
      diffs.push({
        key: `removed-${current.ID}`,
        state: 'changed',
        kind: 'content_unit',
        title: titleOfRecord(current),
        target: `现有制作项 #${current.ID}`,
        detail: '草案未包含该制作项，属于收拢或删除候选。',
        impact: '可能移除当前制作项。',
        before: contentUnitSnapshot(current),
        after: '未出现在草案中',
        fields: [],
      })
      warnings.push(`现有制作项「${titleOfRecord(current)}」未出现在草案中。`)
    })

    const summary = [
      `${diffs.filter((item) => item.state === 'added').length} 个快照新增`,
      `${diffs.filter((item) => item.state === 'changed').length} 个快照变更`,
      `${diffs.filter((item) => item.state === 'unchanged').length} 个快照一致`,
    ].join('，')

    return {
      draft,
      summary,
      targetLabel: row ? titleOfRecord(row.moment) : draft.title,
      diffs,
      warnings,
      stats: [
        { label: '快照新增', value: diffs.filter((item) => item.state === 'added').length },
        { label: '快照变更', value: diffs.filter((item) => item.state === 'changed').length },
        { label: '快照一致', value: diffs.filter((item) => item.state === 'unchanged').length },
      ],
    }
  }

  return {
    draft,
    summary: '当前草案类型暂不支持内容编排审阅。',
    targetLabel: draft.title,
    diffs,
    warnings,
    stats: [],
  }
}

function parseDraftJsonContent(content: string): Record<string, unknown> | null {
  const block = extractJsonBlock(content.trim())
  if (!block) return null
  try {
    const parsed = JSON.parse(block)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function extractJsonBlock(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  if (fenced) return fenced[1].trim()
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) return raw.slice(first, last + 1)
  return raw.trim() || null
}

function draftEntityId(value?: Record<string, unknown>) {
  return numberOf(value?.entityId)
}

function draftRecordsArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function matchCurrentContentUnit(
  proposed: Record<string, unknown>,
  currentUnits: WorkbenchRecord[],
  usedCurrentIds: Set<number>,
  index: number,
) {
  const proposedTitle = normalizeContentWorkbenchProposalText(contentWorkbenchProposalFieldString(proposed, ['title']))
  const proposedKind = normalizeContentWorkbenchProposalText(contentWorkbenchProposalFieldString(proposed, ['kind']))
  const exact = currentUnits.find((unit) => !usedCurrentIds.has(unit.ID) && normalizeContentWorkbenchProposalText(titleOfRecord(unit)) === proposedTitle && normalizeContentWorkbenchProposalText(unit.kind) === proposedKind)
  if (exact) return exact
  const byTitle = currentUnits.find((unit) => !usedCurrentIds.has(unit.ID) && normalizeContentWorkbenchProposalText(titleOfRecord(unit)) === proposedTitle)
  if (byTitle) return byTitle
  const byKind = currentUnits.find((unit) => !usedCurrentIds.has(unit.ID) && normalizeContentWorkbenchProposalText(unit.kind) === proposedKind)
  if (byKind) return byKind
  return currentUnits.find((unit) => !usedCurrentIds.has(unit.ID) && index === 0) ?? undefined
}

function contentUnitSnapshot(unit: WorkbenchRecord) {
  return compactContentParts([
    titleOfRecord(unit),
    unit.kind,
    unit.description,
    unit.prompt,
    unit.duration_sec ? `${unit.duration_sec}s` : '',
    unit.shot_size,
    unit.camera_angle,
    unit.camera_motion,
  ])
}

function compareContentUnitFields(current: WorkbenchRecord | undefined, proposed: Record<string, unknown>): ContentSnapshotFieldDiff[] {
  const shot = isRecord(proposed.shot) ? proposed.shot : undefined
  return compactFieldChanges([
    { label: '标题', before: current ? titleOfRecord(current) : undefined, after: contentWorkbenchProposalUnitTitle(proposed, 0) },
    { label: '类型', before: current?.kind, after: contentWorkbenchProposalFieldString(proposed, ['kind']) },
    { label: '描述', before: current?.description, after: contentWorkbenchProposalFieldString(proposed, ['description']) },
    { label: '提示词', before: current?.prompt, after: contentWorkbenchProposalFieldString(proposed, ['prompt']) },
    { label: '时长', before: current?.duration_sec ? `${current.duration_sec}s` : undefined, after: numberOf(proposed.duration_sec) > 0 ? `${numberOf(proposed.duration_sec)}s` : undefined },
    { label: '景别', before: current?.shot_size, after: contentWorkbenchProposalFieldString(shot ?? {}, ['shot_size']) },
    { label: '机位', before: current?.camera_angle, after: contentWorkbenchProposalFieldString(shot ?? {}, ['camera_angle']) },
    { label: '运动', before: current?.camera_motion, after: contentWorkbenchProposalFieldString(shot ?? {}, ['camera_movement', 'camera_motion']) },
  ])
}

function contentUnitChangeDetail(current: WorkbenchRecord | undefined, proposed: Record<string, unknown>, fields: ContentSnapshotFieldDiff[]) {
  if (!current) return compactContentParts([contentWorkbenchProposalFieldString(proposed, ['description']), contentWorkbenchProposalFieldString(proposed, ['prompt'])])
  if (fields.length === 0) return '与当前制作项一致，可视为复用。'
  return `调整 ${fields.map((field) => field.label).slice(0, 4).join('、')}`
}

function contentUnitChangeImpact(state: ContentSnapshotDiffState, current: WorkbenchRecord | undefined, fields: ContentSnapshotFieldDiff[]) {
  if (state === 'added') return '草案快照新增制作项。'
  if (state === 'unchanged') return '草案快照与当前制作项一致。'
  if (!current) return '新增或替换结构。'
  if (fields.some((field) => field.label === '标题' || field.label === '类型')) return '会改变该制作项的结构定位。'
  if (fields.some((field) => field.label === '提示词' || field.label === '描述')) return '会改变该制作项的创作意图。'
  return '会改变该制作项的执行细节。'
}

function compactFieldChanges(items: Array<ContentSnapshotFieldDiff>): ContentSnapshotFieldDiff[] {
  return items.filter((item) => normalizeContentWorkbenchProposalText(item.before) !== normalizeContentWorkbenchProposalText(item.after))
}

function compactContentParts(parts: Array<unknown>) {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' / ')
}

function dedupeDrafts(drafts: AgentDraft[]) {
  const seen = new Set<string>()
  return drafts.filter((draft) => {
    if (seen.has(draft.id)) return false
    seen.add(draft.id)
    return true
  })
}

function contentSnapshotStateLabel(state: ContentSnapshotDiffState) {
  if (state === 'added') return '快照新增'
  if (state === 'changed') return '快照变更'
  if (state === 'unchanged') return '快照一致'
  return '媒体计划'
}

function contentSnapshotKindLabel(kind: ContentSnapshotDiffKind) {
  if (kind === 'content_unit') return '制作项快照'
  return '关键帧快照'
}

function ContentGenerationReviewPanel({
  reviewMode,
  drafts,
  selectedDraft,
  reviewModel,
  queueSummary,
  rejectingDraft,
  markingDraftReviewed,
  onOpenAiSuggest,
  onSelectDraft,
  onCreateUnitFromProposal,
  onEditCurrentUnit,
  onMarkDraftReviewed,
  onRejectDraft,
  onCloseReview,
}: {
  reviewMode: boolean
  drafts: AgentDraft[]
  selectedDraft: AgentDraft | null
  reviewModel: ContentDraftReviewModel | null
  queueSummary: ContentWorkbenchReviewQueueSummary
  rejectingDraft: boolean
  markingDraftReviewed: boolean
  onOpenAiSuggest: () => void
  onSelectDraft: (draftId: string) => void
  onCreateUnitFromProposal: (proposal: Record<string, unknown>) => void
  onEditCurrentUnit: (unitId: number) => void
  onMarkDraftReviewed: (draft: AgentDraft) => void
  onRejectDraft: (draft: AgentDraft) => void
  onCloseReview: () => void
}) {
  return (
    <WorkbenchPanel
      title="AI 审稿队列"
      icon={ClipboardCheck}
      action={(
        <div className="flex items-center gap-2">
          <Badge variant={queueSummary.tone === 'success' ? 'success' : queueSummary.tone === 'warning' ? 'warning' : 'outline'}>
            {queueSummary.pending > 0 ? `${queueSummary.pending} 待审` : `${queueSummary.total} 草案`}
          </Badge>
          <Button size="sm" variant="outline" className="h-8 gap-2" onClick={onCloseReview}>
            <Database size={13} />
            {reviewMode ? '退出审阅' : '收起审阅'}
          </Button>
        </div>
      )}
    >
      <div
        className={cn(
          'mb-3 rounded-md border px-2.5 py-2.5',
          queueSummary.tone === 'warning'
            ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20'
            : queueSummary.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/20'
              : 'border-border bg-background',
        )}
        data-testid="content-workbench-review-queue"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Bot size={15} className="text-muted-foreground" />
              {queueSummary.title}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{queueSummary.detail}</p>
          </div>
          <Button
            size="sm"
            variant={queueSummary.total === 0 ? 'default' : 'outline'}
            className="h-8 gap-2"
            onClick={queueSummary.total === 0 ? onOpenAiSuggest : undefined}
            disabled={queueSummary.total > 0}
          >
            <Sparkles size={13} />
            {queueSummary.actionLabel}
          </Button>
        </div>
        {queueSummary.total > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-testid="content-workbench-review-metrics">
            <span className={queueSummary.pending > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : undefined}>{queueSummary.pending} 待审</span>
            <span className="text-border">/</span>
            <span>{queueSummary.addedCount} 新增</span>
            <span className="text-border">/</span>
            <span className={queueSummary.changedCount > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : undefined}>{queueSummary.changedCount} 变更</span>
            <span className="text-border">/</span>
            <span className={queueSummary.warningCount > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : undefined}>{queueSummary.warningCount} 风险</span>
          </div>
        ) : null}
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background px-3 py-6 text-sm text-muted-foreground">
          还没有制作项草案。先通过 AI 助手生成 snapshot 草案，审阅区会显示当前快照和草案快照的对比。
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
            {drafts.map((draft) => {
              const active = selectedDraft?.id === draft.id
              return (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => onSelectDraft(draft.id)}
                  className={cn(
                    'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                    active ? 'border-primary/60 bg-primary/5' : 'border-border bg-background hover:bg-muted/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{draft.title}</p>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">制作项快照 · {draft.status}</p>
                    </div>
                    <Badge variant={active ? 'secondary' : 'outline'} className="shrink-0 text-[10px]">
                      结构
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="min-w-0 rounded-md border border-border bg-background p-2.5">
            {!selectedDraft || !reviewModel ? (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">选择一个草案后查看快照对比。</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{selectedDraft.title}</h3>
                      <Badge variant="secondary" className="text-[10px]">制作项快照</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {reviewModel.targetLabel} · {reviewModel.summary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {reviewModel.stats.map((stat) => (
                      <Badge key={stat.label} variant="outline" className="text-[10px]">{stat.label} {stat.value}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
                  <p className="text-xs leading-5 text-muted-foreground">
                    内容编排草案当前只做 snapshot 审阅；按差异创建、编辑或确认无需写入后，可标记为人工已处理，或退回草案清理待审队列。
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      className="h-8 gap-2"
                      data-testid="content-workbench-mark-draft-reviewed"
                      onClick={() => onMarkDraftReviewed(selectedDraft)}
                      loading={markingDraftReviewed}
                      disabled={markingDraftReviewed || selectedDraft.status === 'applied'}
                    >
                      <CheckCircle2 size={13} />
                      {selectedDraft.status === 'applied' ? '已处理' : '标记人工已处理'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-2"
                      onClick={() => onRejectDraft(selectedDraft)}
                      loading={rejectingDraft}
                      disabled={rejectingDraft || selectedDraft.status === 'rejected'}
                    >
                      <X size={13} />
                      退回草案
                    </Button>
                  </div>
                </div>

                {reviewModel.warnings.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {reviewModel.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-2">
                  {reviewModel.diffs.map((change) => (
                    <div key={change.key} className="rounded-md border border-border bg-muted/10 px-2.5 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={change.state === 'added' ? 'secondary' : change.state === 'unchanged' ? 'outline' : 'default'} className="text-[10px]">
                              {contentSnapshotStateLabel(change.state)}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">{contentSnapshotKindLabel(change.kind)}</Badge>
                            <span className="truncate text-sm font-medium text-foreground">{change.title}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">{change.target}</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{change.impact}</p>
                      </div>
                      {change.detail ? <p className="mt-2 text-xs leading-5 text-foreground">{change.detail}</p> : null}
                      {change.state === 'added' && change.proposal ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 h-8 gap-2"
                          data-testid="content-workbench-create-proposal-unit"
                          onClick={() => onCreateUnitFromProposal(change.proposal!)}
                        >
                          <Plus size={13} />
                          带入新建制作项
                        </Button>
                      ) : null}
                      {change.state === 'changed' && change.currentUnitId ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 h-8 gap-2"
                          data-testid="content-workbench-edit-current-unit"
                          onClick={() => onEditCurrentUnit(change.currentUnitId!)}
                        >
                          <Pencil size={13} />
                          编辑当前制作项
                        </Button>
                      ) : null}
                      {(change.before || change.after) ? (
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {change.before ? <div className="rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-700 dark:text-rose-300">当前：{change.before}</div> : null}
                          {change.after ? <div className="rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">草案：{change.after}</div> : null}
                        </div>
                      ) : null}
                      {change.fields.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {change.fields.map((field) => (
                            <div key={field.label} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="w-14 shrink-0 text-muted-foreground">{field.label}</span>
                              <span className="rounded bg-muted px-2 py-1 text-muted-foreground">{field.before || '空'}</span>
                              <ArrowRight size={12} className="text-muted-foreground" />
                              <span className="rounded bg-primary/10 px-2 py-1 text-foreground">{field.after || '空'}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </WorkbenchPanel>
  )
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
    units.length > 0 ? `${units.length} 制作项` : '待拆制作项',
    keyframes.length > 0 ? `${keyframes.length} 预览画面` : '无预览画面',
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
    keyframes.length > 0 ? `画面锚点 ${keyframes.length}` : '无画面锚点',
    missingSlots.length > 0 ? `缺素材需求 ${missingSlots.length}` : '素材需求可用',
  ]
  return parts.join(' / ')
}

function buildMomentKeyframeSequence(row: ContentGenerationMomentRow) {
  const sequence: Array<{
    keyframe: WorkbenchRecord
    unit?: WorkbenchRecord
    role: string
    sequence: number
  }> = []
  for (const unit of row.units.slice().sort(byOrder)) {
    const unitKeyframes = row.keyframes
      .filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID)
      .slice()
      .sort(byOrder)
    unitKeyframes.forEach((keyframe, index) => {
      sequence.push({
        keyframe,
        unit,
        role: frameRoleLabel(index, unitKeyframes.length),
        sequence: sequence.length + 1,
      })
    })
  }
  return sequence
}

function frameRoleLabel(index: number, total: number) {
  if (total <= 1) return '关键画面'
  if (index <= 0) return '开头帧'
  if (index >= total - 1) return '结尾帧'
  if (total === 3) return '中间帧'
  return `中间帧 ${index}`
}

function resourceFileUrl(resourceId?: number | null) {
  return resourceId ? `/api/v1/resources/${resourceId}/file` : ''
}

function keyframeResourcePatchPayload(keyframe: WorkbenchRecord, resourceId: number): SemanticEntityPayload {
  return {
    production_id: nullableNumber(keyframe.production_id),
    scene_moment_id: nullableNumber(keyframe.scene_moment_id),
    content_unit_id: nullableNumber(keyframe.content_unit_id),
    resource_id: resourceId,
    canvas_id: nullableNumber(keyframe.canvas_id),
    title: String(keyframe.title ?? ''),
    description: String(keyframe.description ?? ''),
    prompt: String(keyframe.prompt ?? ''),
    order: numberOf(keyframe.order),
    status: firstText(keyframe.status, 'attached') === 'rejected' ? 'attached' : firstText(keyframe.status, 'attached'),
    metadata_json: String(keyframe.metadata_json ?? ''),
  }
}

function nullableNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
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
    <section className={cn('rounded-md border border-border bg-card', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={15} className="shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn('p-2.5', bodyClassName)}>{children}</div>
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

function QueueMiniMetric({ label, value, tone = 'default', onClick }: { label: string; value: number | string; tone?: 'default' | 'warning'; onClick?: () => void }) {
  const content = (
    <>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>{value}</p>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="min-w-14 rounded-md border border-border bg-background px-2 py-1.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
      >
        {content}
      </button>
    )
  }
  return (
    <div className="min-w-14 rounded-md border border-border bg-background px-2 py-1.5">
      {content}
    </div>
  )
}

function ProductionPipeline({
  title,
  detail,
  steps,
  icons,
}: {
  title: string
  detail: string
  steps: ContentWorkbenchPipelineStep[]
  icons: Record<ContentWorkbenchPipelineStepKey, LucideIcon>
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5" data-testid="content-workbench-production-pipeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Route size={15} className="text-muted-foreground" />
            {title}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
        <Badge variant={steps.some((step) => step.tone === 'current' || step.tone === 'blocked') ? 'warning' : 'success'}>
          {steps.filter((step) => step.tone === 'done').length}/{steps.length}
        </Badge>
      </div>
      <div className="mt-2 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-1.5">
          {steps.map((step, index) => {
            const Icon = icons[step.key]
            return (
              <div key={step.key} className="flex items-center gap-1.5">
                <div
                  title={step.detail}
                  data-step-key={step.key}
                  className={cn(
                    'flex min-w-[108px] items-center gap-1.5 rounded px-1.5 py-1',
                    step.tone === 'done'
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/20'
                      : step.tone === 'current'
                        ? 'bg-primary/5 ring-1 ring-primary/40'
                        : step.tone === 'blocked'
                          ? 'bg-amber-50/70 dark:bg-amber-950/20'
                          : 'bg-muted/30',
                  )}
                >
                  <Icon size={13} className="shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-muted-foreground">{step.label}</p>
                    <p className="truncate text-xs font-semibold text-foreground">{step.value}</p>
                  </div>
                </div>
                {index < steps.length - 1 ? (
                  <div className="flex items-center text-muted-foreground">
                    <ChevronRight size={14} />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ContextStack({ rows, className }: { rows: WorkbenchLinkRow[]; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-md border border-border bg-background', className)}>
      {rows.map((row) => {
        const Icon = row.icon
        return (
          <div key={row.label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 border-b border-border/70 px-2.5 py-2 last:border-b-0">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{row.label}</span>
            </div>
            <p className="min-w-0 truncate text-sm text-foreground">{row.value}</p>
          </div>
        )
      })}
    </div>
  )
}

function GateChecklist({ rows }: { rows: WorkbenchGate[] }) {
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="rounded-md border border-border bg-background px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {row.done ? <CheckCircle2 size={15} className="shrink-0 text-emerald-600" /> : <CircleDot size={15} className="shrink-0 text-amber-600" />}
              <span className="truncate text-sm font-medium text-foreground">{row.label}</span>
            </div>
            <Badge variant={row.done ? 'success' : row.tone === 'warning' ? 'warning' : 'outline'}>{row.done ? '通过' : '待处理'}</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.detail}</p>
        </div>
      ))}
    </div>
  )
}

function KeyframeContinuityStrip({
  sequence,
}: {
  sequence: ReturnType<typeof buildMomentKeyframeSequence>
}) {
  const previewItems = sequence.slice(0, 8)
  return (
    <div className="rounded-md border border-border bg-background p-2.5" data-testid="content-workbench-keyframe-continuity">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Image size={15} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">画面连续性</p>
            <p className="truncate text-xs text-muted-foreground">
              {sequence.length > 0 ? `${sequence.length} 帧按制作项顺序串联` : '还没有画面锚点'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={sequence.length > 0 ? 'secondary' : 'warning'}>{sequence.length} 帧</Badge>
        </div>
      </div>
      <div className="mt-2 overflow-x-auto pb-1">
        <div className="flex min-w-max items-stretch gap-1.5">
          {previewItems.map((item) => (
            <div key={`${item.keyframe.ID}-${item.sequence}`} className="w-[104px] overflow-hidden rounded-md border border-border bg-card">
              <div className="relative aspect-video bg-muted">
                {item.keyframe.resource_id ? (
                  <AuthedImage
                    src={resourceFileUrl(item.keyframe.resource_id)}
                    alt={titleOfRecord(item.keyframe)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Image size={15} />
                  </div>
                )}
                <span className="absolute left-1 top-1 rounded bg-background/90 px-1 py-0.5 text-[10px] font-medium tabular-nums text-foreground shadow-sm">
                  {String(item.sequence).padStart(2, '0')}
                </span>
              </div>
              <div className="px-1.5 py-1">
                <p className="truncate text-[11px] font-medium text-foreground">{item.role}</p>
                <p className="truncate text-[10px] text-muted-foreground">{item.unit ? titleOfRecord(item.unit) : '未绑定制作项'}</p>
              </div>
            </div>
          ))}
          {sequence.length > previewItems.length ? (
            <div className="flex w-[72px] items-center justify-center rounded-md border border-border bg-card px-2 text-center text-xs text-muted-foreground">
              +{sequence.length - previewItems.length} 帧
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ReadinessSummaryCard({ rows }: { rows: WorkbenchGate[] }) {
  const summary = buildContentWorkbenchReadinessSummary(rows)
  return (
    <div
      className={cn(
        'mb-2.5 rounded-md border px-2.5 py-2',
        summary.tone === 'ready'
          ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/20'
          : summary.tone === 'warning'
            ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20'
            : 'border-rose-200 bg-rose-50/80 dark:border-rose-900/60 dark:bg-rose-950/20',
      )}
      data-testid="content-workbench-readiness-summary"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {summary.tone === 'ready' ? <CheckCircle2 size={15} className="text-emerald-600" /> : <ShieldCheck size={15} className="text-muted-foreground" />}
            {summary.title}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{summary.detail}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums text-foreground">{summary.percent}%</p>
          <p className="text-[10px] text-muted-foreground">{summary.passed}/{summary.total} 通过</p>
        </div>
      </div>
      {summary.primaryBlocker ? (
        <div className="mt-2 rounded bg-background/70 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
          {summary.primaryBlocker}
        </div>
      ) : null}
    </div>
  )
}

function UnitHealthCard({ health }: { health: ContentWorkbenchUnitHealth }) {
  const badgeVariant = health.tone === 'done' || health.tone === 'ready'
    ? 'success'
    : health.tone === 'blocked' || health.tone === 'warning'
      ? 'warning'
      : 'outline'
  const statusLabel = health.tone === 'done'
    ? '已闭环'
    : health.tone === 'ready'
      ? '可执行'
      : health.tone === 'blocked'
        ? '阻塞'
        : health.tone === 'warning'
          ? '待推进'
          : '未选择'
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5',
        health.tone === 'done' || health.tone === 'ready'
          ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/20'
          : health.tone === 'blocked' || health.tone === 'warning'
            ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20'
            : 'border-border bg-background',
      )}
      data-testid="content-workbench-unit-health"
    >
      <div className="flex min-w-0 items-center gap-2">
        {health.tone === 'done' || health.tone === 'ready'
          ? <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
          : <ShieldCheck size={15} className="shrink-0 text-muted-foreground" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{health.title}</p>
          <p className="truncate text-xs text-muted-foreground">{health.detail}</p>
        </div>
      </div>
      <Badge variant={badgeVariant} className="shrink-0" data-testid="content-workbench-unit-health-status">{statusLabel}</Badge>
    </div>
  )
}

function DeliveryBriefCard({
  brief,
}: {
  brief: ContentWorkbenchDeliveryBrief
}) {
  const primaryBlocker = brief.blockers[0]
  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-2',
        brief.tone === 'ready'
          ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/20'
          : brief.tone === 'warning'
            ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20'
            : 'border-border bg-background',
      )}
      data-testid="content-workbench-delivery-brief"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <PackageCheck size={15} className="text-muted-foreground" />
            {brief.title}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{brief.detail}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={brief.tone === 'ready' ? 'success' : brief.tone === 'blocked' ? 'warning' : 'outline'}>
            {brief.progress}%
          </Badge>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap overflow-hidden rounded-md border border-border bg-card">
        {brief.metrics.map((metric) => (
          <div key={metric.label} className="min-w-[72px] flex-1 border-b border-border/70 px-2 py-1.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <p className="text-[10px] text-muted-foreground">{metric.label}</p>
            <p className={cn('mt-0.5 truncate text-sm font-semibold', metric.done ? 'text-foreground' : 'text-amber-700 dark:text-amber-300')}>{metric.value}</p>
          </div>
        ))}
      </div>
      {primaryBlocker ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1.5 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle size={12} className="shrink-0 text-amber-600" />
            <p className="truncate text-xs text-amber-900 dark:text-amber-100">优先处理：{primaryBlocker}</p>
          </div>
          {brief.blockers.length > 1 ? <Badge variant="warning">另 {brief.blockers.length - 1}</Badge> : null}
        </div>
      ) : null}
      {brief.progress > 0 ? <Progress value={brief.progress} className="mt-2 h-1.5" /> : null}
    </div>
  )
}

function PreviewMountCard({
  productionTitle,
  segments,
  timelineUnits,
  gaps,
  previewTimelineCount,
  previewItemCount,
}: {
  productionTitle: string
  segments: PreviewPlanSegment[]
  timelineUnits: PreviewTimelineContentUnit[]
  gaps: PreviewAssetGap[]
  previewTimelineCount: number
  previewItemCount: number
}) {
  const blockedUnits = timelineUnits.filter((unit) => unit.status === 'blocked').length
  const readyUnits = timelineUnits.filter((unit) => unit.status === 'ready').length
  const firstGap = gaps[0]
  const hasPreviewBlocker = gaps.length > 0 || blockedUnits > 0
  return (
    <details className="rounded-md border border-border bg-background" data-testid="content-workbench-preview-mount" open={hasPreviewBlocker}>
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-2 px-2.5 py-2 marker:text-muted-foreground">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Film size={15} className="text-muted-foreground" />
            预览挂载
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {productionTitle} · {segments.length} 个入口、{timelineUnits.length} 个制作项、{previewItemCount} 条预览记录
          </p>
        </div>
        <Badge variant={gaps.length > 0 || blockedUnits > 0 ? 'warning' : previewItemCount > 0 ? 'success' : 'outline'}>
          {gaps.length > 0 ? `${gaps.length} 缺口` : previewItemCount > 0 ? '已挂载' : '待挂载'}
        </Badge>
      </summary>
      <div className="border-t border-border p-2">
        <div className="flex flex-wrap overflow-hidden rounded-md border border-border bg-card" data-testid="content-workbench-preview-metrics">
          {[
            { label: '入口', value: segments.length },
            { label: '可看', value: readyUnits },
            { label: '阻塞', value: blockedUnits + gaps.length, tone: blockedUnits + gaps.length > 0 ? 'warning' : 'default' },
            { label: '时间线', value: previewTimelineCount },
          ].map((metric) => (
            <div key={metric.label} className="min-w-[64px] flex-1 border-b border-border/70 px-2 py-1.5 text-center last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <span className="text-[10px] text-muted-foreground">{metric.label}</span>
              <span className={cn('ml-1.5 text-sm font-semibold tabular-nums', metric.tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>{metric.value}</span>
            </div>
          ))}
        </div>
        {firstGap ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1.5 dark:border-amber-900/60 dark:bg-amber-950/20">
            <p className="min-w-0 truncate text-xs text-amber-900 dark:text-amber-100">
              优先缺口：{firstGap.name} · {firstGap.owner}{gaps.length > 1 ? ` · 另 ${gaps.length - 1} 项` : ''}
            </p>
            <Badge variant={firstGap.priority === '高' ? 'danger' : firstGap.priority === '中' ? 'warning' : 'outline'}>{firstGap.priority}</Badge>
          </div>
        ) : null}
      </div>
    </details>
  )
}

function ActivityFeedCard({
  feed,
}: {
  feed: ContentWorkbenchActivityFeed
}) {
  const primaryItems = feed.items.slice(0, 1)
  const secondaryItems = feed.items.slice(1)
  const hasActiveItem = feed.items.some((item) => item.tone === 'blocked' || item.tone === 'running')
  function renderActivityItem(item: ContentWorkbenchActivityFeed['items'][number]) {
    return (
      <div
        key={item.key}
        data-action-key={item.actionKey}
        className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-2 rounded-md border border-border bg-card px-2 py-1.5"
      >
        <span
          className={cn(
            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
            item.tone === 'done'
              ? 'bg-emerald-500'
              : item.tone === 'running'
                ? 'bg-primary'
                : item.tone === 'blocked'
                  ? 'bg-amber-500'
                  : 'bg-muted-foreground/50',
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
        </div>
        {item.actionLabel ? <Badge variant="outline" className="shrink-0 text-[10px]">{item.actionLabel}</Badge> : null}
      </div>
    )
  }
  return (
    <details className="rounded-md border border-border bg-background" data-testid="content-workbench-activity-feed" open={hasActiveItem}>
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-2 px-2.5 py-2 marker:text-muted-foreground">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock3 size={15} className="text-muted-foreground" />
            {feed.title}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{feed.detail}</p>
        </div>
        <Badge variant={feed.items.some((item) => item.tone === 'blocked') ? 'warning' : feed.items.some((item) => item.tone === 'running') ? 'secondary' : 'success'}>
          {feed.items.length} 条
        </Badge>
      </summary>
      <div className="space-y-1.5 border-t border-border p-2">
        {primaryItems.map(renderActivityItem)}
        {secondaryItems.length > 0 ? (
          <details className="rounded-md border border-border bg-card" data-testid="content-workbench-activity-overflow">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
              <span>展开活动记录</span>
              <Badge variant="outline">{secondaryItems.length}</Badge>
            </summary>
            <div className="space-y-1.5 border-t border-border p-1.5">
              {secondaryItems.map(renderActivityItem)}
            </div>
          </details>
        ) : null}
      </div>
    </details>
  )
}

function NextActionsPanel({
  actions,
  actionIcons,
  actionHandlers,
  generationCanvasPending,
}: {
  actions: ContentWorkbenchNextActionView[]
  actionIcons: Record<ContentWorkbenchNextActionKey, LucideIcon>
  actionHandlers: Partial<Record<ContentWorkbenchNextActionKey, () => void>>
  generationCanvasPending: boolean
}) {
  const primaryAction = actions[0]
  const secondaryActions = actions.slice(1)
  if (!primaryAction) {
    return <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">暂无动作建议。</p>
  }

  const PrimaryIcon = actionIcons[primaryAction.key]
  const primaryHandler = actionHandlers[primaryAction.key]
  const primaryDisabled = primaryAction.key === 'open_generation_canvas' && generationCanvasPending
  const primaryClickable = typeof primaryHandler === 'function' && !primaryDisabled
  return (
    <div className="space-y-2" data-testid="content-workbench-next-actions">
      <button
        type="button"
        data-action-key={primaryAction.key}
        onClick={primaryHandler}
        disabled={!primaryClickable || primaryDisabled}
        className={cn(
          'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
          primaryAction.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/20'
            : primaryAction.tone === 'warning'
              ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20'
              : 'border-border bg-background',
          primaryClickable ? 'hover:border-primary/50 hover:bg-primary/5' : 'cursor-default',
        )}
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
            <PrimaryIcon size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{primaryAction.title}</p>
              <Badge variant={primaryAction.tone === 'success' ? 'success' : primaryAction.tone === 'warning' ? 'warning' : 'outline'}>
                {primaryAction.tone === 'success' ? '可执行' : primaryAction.tone === 'warning' ? '优先' : '建议'}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{primaryAction.detail}</p>
          </div>
        </div>
      </button>
      {secondaryActions.length > 0 ? (
        <details className="overflow-hidden rounded-md border border-border bg-background" data-testid="content-workbench-secondary-actions">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-sm font-medium text-foreground marker:text-muted-foreground">
            <span>更多建议</span>
            <Badge variant="outline">{secondaryActions.length}</Badge>
          </summary>
          <div className="border-t border-border">
            {secondaryActions.map((action) => {
              const Icon = actionIcons[action.key]
              const handler = actionHandlers[action.key]
              const disabled = action.key === 'open_generation_canvas' && generationCanvasPending
              const clickable = typeof handler === 'function' && !disabled
              return (
                <button
                  key={`${action.key}:${action.title}`}
                  type="button"
                  data-action-key={action.key}
                  onClick={handler}
                  disabled={!clickable || disabled}
                  className={cn(
                    'grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/70 px-2.5 py-2 text-left last:border-b-0',
                    clickable ? 'hover:bg-primary/5' : 'cursor-default',
                  )}
                >
                  <Icon size={14} className="text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{action.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{action.detail}</p>
                  </div>
                  <Badge variant={action.tone === 'warning' ? 'warning' : action.tone === 'success' ? 'success' : 'outline'}>
                    {action.tone === 'warning' ? '优先' : action.tone === 'success' ? '可执行' : '建议'}
                  </Badge>
                </button>
              )
            })}
          </div>
        </details>
      ) : null}
    </div>
  )
}

function formatTrackDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '未设时长'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}

function UnitProductionTrack({
  row,
  selectedUnitId,
  onSelectUnit,
}: {
  row: ContentGenerationMomentRow | null
  selectedUnitId?: number
  onSelectUnit: (unitId: number) => void
}) {
  const summary = buildContentWorkbenchUnitTrack((row?.units ?? []).slice().sort(byOrder).map((unit) => {
    const unitSlots = row?.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === unit.ID) ?? []
    const missingSlots = unitSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
    const keyframes = row?.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID) ?? []
    return {
      id: unit.ID,
      title: titleOfRecord(unit),
      kind: unit.kind,
      durationSec: numberOf(unit.duration_sec),
      status: unit.status,
      hasPrompt: Boolean(firstText(unit.prompt, unit.description)),
      assetSlotCount: unitSlots.length,
      missingSlotCount: missingSlots.length,
      keyframeCount: keyframes.length,
      selected: selectedUnitId === unit.ID,
    }
  }))

  if (!row || summary.total === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-sm text-muted-foreground" data-testid="content-workbench-unit-track">
        <p className="font-medium text-foreground">{summary.title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{summary.detail}</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border bg-background p-2.5" data-testid="content-workbench-unit-track">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Route size={15} className="text-muted-foreground" />
            {summary.title}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{summary.detail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-testid="content-workbench-unit-track-summary">
          <span>{summary.total} 制作项</span>
          <span className="text-border">/</span>
          <span>{formatTrackDuration(summary.durationSec)}</span>
          <span className="text-border">/</span>
          <span className={summary.blockedCount > 0 ? 'text-amber-700 dark:text-amber-300' : undefined}>{summary.blockedCount} 阻塞</span>
          <span className="text-border">/</span>
          <span className={summary.keyframeCount > 0 ? undefined : 'text-amber-700 dark:text-amber-300'}>{summary.keyframeCount} 关键帧</span>
        </div>
      </div>

      <div className="mt-2.5 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2">
          {summary.items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectUnit(Number(item.id))}
              className={cn(
                'w-[164px] shrink-0 rounded-md border px-2 py-1.5 text-left transition-colors',
                item.selected
                  ? 'border-primary/60 bg-primary/5'
                  : item.tone === 'blocked'
                    ? 'border-amber-200 bg-amber-50/60 hover:border-primary/50 hover:bg-primary/5 dark:border-amber-900/60 dark:bg-amber-950/20'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5',
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.title}</p>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{item.kind || '制作项'} · {item.labels.slice(0, 2).join(' · ') || '待补输入'}</p>
              {item.blockers.length > 0 ? (
                <p className="mt-1 truncate text-[11px] text-amber-700 dark:text-amber-300">{item.blockers[0]}{item.blockers.length > 1 ? ` · 另 ${item.blockers.length - 1}` : ''}</p>
              ) : (
                <p className="mt-1 truncate text-[11px] text-emerald-700 dark:text-emerald-300">基础输入可用</p>
              )}
            </button>
          ))}
        </div>
      </div>
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
          route: { pathname: ROUTES.project.preProduction },
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
          <EmptyWorkbenchState title="暂无设定资料" text="先从剧本拆解、创作编排或设定资料页创建人物、地点、道具、风格等设定。" />
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
                  <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => navigate(mergeSearch(ROUTES.project.preProduction, '', { tab: 'settings' }))}>
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
                    <div className="flex flex-wrap items-center justify-end gap-2">
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
                          <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">这个设定还没有被情景、编排段或制作项引用。</p>
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
  const [searchParams, setSearchParams] = useSearchParams()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const keyframeUploadInputRef = useRef<HTMLInputElement>(null)
  const previewMountSectionRef = useRef<HTMLDivElement>(null)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workbench', 'production', projectId],
    queryFn: () => loadProductionWorkbenchData(projectId!),
    enabled: !!projectId,
  })
  const rows = useMemo(() => buildContentGenerationMomentRows(data), [data])
  const [productionFilter, setProductionFilter] = useState('all')
  const [segmentFilter, setSegmentFilter] = useState('all')
  const [selectedId, setSelectedId] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [candidateUploadTargetSlot, setCandidateUploadTargetSlot] = useState<WorkbenchRecord | null>(null)
  const [creatingUnit, setCreatingUnit] = useState(false)
  const [unitDraftDefaults, setUnitDraftDefaults] = useState<Partial<SemanticEntityPayload> | null>(null)
  const [optimisticSelectedUnit, setOptimisticSelectedUnit] = useState<WorkbenchRecord | null>(null)
  const [editingUnit, setEditingUnit] = useState(false)
  const [reviewPanelCollapsed, setReviewPanelCollapsed] = useState(false)
  const [creatingKeyframe, setCreatingKeyframe] = useState(false)
  const [keyframeLibraryTarget, setKeyframeLibraryTarget] = useState<WorkbenchRecord | null>(null)
  const [keyframeResourceSearch, setKeyframeResourceSearch] = useState('')
  const [keyframeResourcePage, setKeyframeResourcePage] = useState(1)
  const [uploadKeyframeTarget, setUploadKeyframeTarget] = useState<WorkbenchRecord | null>(null)
  const linkedProductionId = numberOf(searchParams.get('productionId'))
  const linkedSceneMomentId = numberOf(searchParams.get('scene_moment_id'))
  const linkedContentUnitId = numberOf(searchParams.get('content_unit_id'))
  const reviewDraftId = searchParams.get('draftId')?.trim() ?? ''
  const reviewMode = searchParams.get('view') === 'review' || reviewDraftId.length > 0
  useEffect(() => {
    if (reviewMode) setReviewPanelCollapsed(false)
  }, [reviewMode])
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
  useEffect(() => {
    const target = linkedProductionId > 0 ? String(linkedProductionId) : ''
    if (target && productionFilter !== target && productionFilterOptions.some((option) => option.value === target)) {
      setProductionFilter(target)
    }
  }, [linkedProductionId, productionFilter, productionFilterOptions])
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
    const linkedRowId = pickContentWorkbenchRowIdForDeepLink(filteredRows, { sceneMomentId: linkedSceneMomentId, contentUnitId: linkedContentUnitId })
    if (linkedRowId && selectedId !== linkedRowId) {
      setSelectedId(linkedRowId)
      return
    }
    if (!selectedId || !filteredRows.some((row) => row.id === selectedId)) {
      setSelectedId(filteredRows[0].id)
    }
  }, [filteredRows, linkedContentUnitId, linkedSceneMomentId, selectedId])

  const selected = filteredRows.find((item) => item.id === selectedId) ?? filteredRows[0] ?? null

  useEffect(() => {
    if (!selected) {
      if (selectedUnitId !== null) setSelectedUnitId(null)
      if (editingUnit) setEditingUnit(false)
      return
    }
    const linkedUnit = linkedContentUnitId > 0 ? selected.units.find((unit) => unit.ID === linkedContentUnitId) : undefined
    if (linkedUnit && selectedUnitId !== linkedUnit.ID) {
      setSelectedUnitId(linkedUnit.ID)
      return
    }
    if (selectedUnitId !== null && !selected.units.some((unit) => unit.ID === selectedUnitId)) {
      setSelectedUnitId(null)
      if (editingUnit) setEditingUnit(false)
    }
  }, [editingUnit, linkedContentUnitId, selected, selectedUnitId])

  useEffect(() => {
    if (!selected || linkedSceneMomentId > 0 || linkedContentUnitId <= 0) return
    if (!selected.units.some((unit) => unit.ID === linkedContentUnitId)) return
    setSearchParams((current) => {
      if (current.get('scene_moment_id')) return current
      const next = new URLSearchParams(current)
      next.set('scene_moment_id', String(selected.moment.ID))
      return next
    }, { replace: true })
  }, [linkedContentUnitId, linkedSceneMomentId, selected, setSearchParams])

  const fallbackSelectedUnit = selected?.units.find((unit) => firstText(unit.prompt, unit.description)) ?? selected?.units[0] ?? null
  const selectedUnitFromRows = selected?.units.find((unit) => unit.ID === selectedUnitId) ?? null
  const optimisticUnitForSelection = optimisticSelectedUnit && selectedUnitId === optimisticSelectedUnit.ID && selected?.moment.ID === Number(optimisticSelectedUnit.scene_moment_id)
    ? optimisticSelectedUnit
    : null
  const selectedUnit = selectedUnitFromRows ?? optimisticUnitForSelection ?? (selectedUnitId ? null : fallbackSelectedUnit)
  const selectedProduction = selected?.productionIds[0]
    ? data?.productions.find((production) => production.ID === selected.productionIds[0])
    : null

  function selectSceneMoment(rowId: string, options: { replace?: boolean } = {}) {
    const row = filteredRows.find((item) => item.id === rowId) ?? rows.find((item) => item.id === rowId)
    setOptimisticSelectedUnit(null)
    setSelectedId(rowId)
    if (!row) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('scene_moment_id', String(row.moment.ID))
      next.delete('content_unit_id')
      return next
    }, { replace: options.replace ?? true })
  }

  function selectContentUnit(unitId: number | null, options: { replace?: boolean } = {}) {
    if (!unitId || optimisticSelectedUnit?.ID !== unitId) setOptimisticSelectedUnit(null)
    setSelectedUnitId(unitId)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (selected?.moment.ID) next.set('scene_moment_id', String(selected.moment.ID))
      if (unitId && unitId > 0) next.set('content_unit_id', String(unitId))
      else next.delete('content_unit_id')
      return next
    }, { replace: options.replace ?? true })
  }

  function selectProductionFilter(value: string) {
    setOptimisticSelectedUnit(null)
    setSelectedUnitId(null)
    setProductionFilter(value)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value !== 'all' && value !== 'unassigned' && Number(value) > 0) next.set('productionId', value)
      else next.delete('productionId')
      next.delete('scene_moment_id')
      next.delete('content_unit_id')
      return next
    }, { replace: true })
  }

  function selectSegmentFilter(value: string) {
    setOptimisticSelectedUnit(null)
    setSelectedUnitId(null)
    setSegmentFilter(value)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('scene_moment_id')
      next.delete('content_unit_id')
      return next
    }, { replace: true })
  }

  useEffect(() => {
    if (!optimisticSelectedUnit) return
    if (!selected || Number(optimisticSelectedUnit.scene_moment_id) !== selected.moment.ID || selected.units.some((unit) => unit.ID === optimisticSelectedUnit.ID)) {
      setOptimisticSelectedUnit(null)
    }
  }, [optimisticSelectedUnit, selected])

  const generationContextQuery = useQuery({
    queryKey: ['workbench', 'production', 'generation-context', projectId, selectedUnit?.ID],
    queryFn: () => buildContentUnitGenerationContext(projectId!, selectedUnit!.ID, 'video'),
    enabled: !!projectId && !!selectedUnit?.ID,
  })
  const keyframeResourcePageSize = 8
  const keyframeResourcesQuery = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', 'keyframe-picker', keyframeResourceSearch, keyframeResourcePage],
    queryFn: () => api.get('/resources', {
      params: {
        page: keyframeResourcePage,
        page_size: keyframeResourcePageSize,
        type: 'image',
        q: keyframeResourceSearch.trim() || undefined,
      },
    }).then((r) => r.data),
    enabled: Boolean(keyframeLibraryTarget),
  })
  const keyframeResourceItems = keyframeResourcesQuery.data?.items ?? []
  const keyframeResourceTotal = keyframeResourcesQuery.data?.total ?? 0
  const keyframeResourcePageCount = Math.max(1, Math.ceil(keyframeResourceTotal / keyframeResourcePageSize))
  const uploadCandidate = useMutation({
    mutationFn: async ({ file, slot }: { file: File; slot: WorkbenchRecord }) => {
      if (!projectId) throw new Error('请先选择项目')
      const fd = new FormData()
      fd.append('file', file)
      const resource = await api.post('/resources/upload', fd).then((r) => r.data as RawResource)
      await api.post(`/projects/${projectId}/entities/asset-slot-candidates`, {
        asset_slot_id: slot.ID,
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
      setCandidateUploadTargetSlot(null)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    },
  })
  const openUnitCanvas = useMutation({
    mutationFn: async (unit: WorkbenchRecord) => {
      if (!projectId) throw new Error('请先选择项目')
      const canvases = await api.get('/canvases', {
        params: {
          project_id: projectId,
          type: 'workflow',
          stage: 'generation',
          ref_type: 'content_unit',
          ref_id: unit.ID,
        },
      }).then((r) => r.data as Canvas[])
      const existingCanvas = findContentWorkbenchCanvas(canvases, unit.ID)
      if (existingCanvas) return existingCanvas
      return api.post('/canvases', buildContentWorkbenchCanvasPayload({
        projectId,
        contentUnitId: unit.ID,
        title: titleOfRecord(unit),
      })).then((r) => r.data as Canvas)
    },
    onSuccess: (canvas) => navigate(`/canvases/${canvas.ID}`),
    onError: (error) => {
      toast.error(apiErrorMessage(error, '打开生成画布失败'))
    },
  })
  const bindKeyframeResource = useMutation({
    mutationFn: async ({ keyframe, resourceId }: { keyframe: WorkbenchRecord; resourceId: number }) => {
      if (!projectId) throw new Error('请先选择项目')
      return updateSemanticEntity(projectId, semanticEntityConfig('keyframes'), keyframe.ID, keyframeResourcePatchPayload(keyframe, resourceId))
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workbench', 'production', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['resources'] }),
      ])
      setKeyframeLibraryTarget(null)
      toast.success('关键帧已绑定资源')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '绑定关键帧资源失败'))
    },
  })
  const uploadKeyframeResource = useMutation({
    mutationFn: async ({ keyframe, file }: { keyframe: WorkbenchRecord; file: File }) => {
      if (!projectId) throw new Error('请先选择项目')
      const fd = new FormData()
      fd.append('file', file)
      const resource = await api.post('/resources/upload', fd).then((r) => r.data as RawResource)
      await updateSemanticEntity(projectId, semanticEntityConfig('keyframes'), keyframe.ID, keyframeResourcePatchPayload(keyframe, resource.ID))
      return resource
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workbench', 'production', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['resources'] }),
      ])
      setUploadKeyframeTarget(null)
      if (keyframeUploadInputRef.current) keyframeUploadInputRef.current.value = ''
      toast.success('关键帧素材已上传并绑定')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '上传关键帧素材失败'))
      setUploadKeyframeTarget(null)
      if (keyframeUploadInputRef.current) keyframeUploadInputRef.current.value = ''
    },
  })
  const baseStandards = generationContextQuery.data
    ? buildGenerationContextStandards(generationContextQuery.data)
    : buildMomentStandards(selected, data?.jobs ?? [])
  const generationContextRows = buildGenerationContextRows(generationContextQuery.data)
  const selectedUnitKeyframes = selected && selectedUnit
    ? selected.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === selectedUnit.ID).slice().sort(byOrder)
    : []
  const selectedUnitAssetSlots = selected && selectedUnit
    ? selected.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === selectedUnit.ID)
    : []
  const selectedUnitMissingSlots = selectedUnitAssetSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
  const uploadTargetSlot = pickContentWorkbenchUploadTarget({
    selectedUnitAssetSlots,
    momentAssetSlots: selected?.assetSlots ?? [],
  })
  const selectedUnitResourceIds = [
    ...selectedUnitAssetSlots.map((slot) => numberOf(slot.resource_id)),
    ...selectedUnitKeyframes.map((keyframe) => numberOf(keyframe.resource_id)),
  ].filter((id) => id > 0)
  const selectedUnitJobs = pickContentWorkbenchRelevantJobs({
    jobs: data?.jobs ?? [],
    contentUnitId: selectedUnit?.ID,
    contentUnitTitle: selectedUnit ? titleOfRecord(selectedUnit) : undefined,
    resourceIds: selectedUnitResourceIds,
  })
  const selectedUnitRunningJobCount = selectedUnitJobs.filter((job) => job.status === 'pending' || job.status === 'running').length
  const selectedUnitCompletedJobCount = selectedUnitJobs.filter((job) => job.status === 'succeeded').length
  const selectedUnitStatus = selectedUnit ? contentUnitWorkStatus(selectedUnit, selectedUnitMissingSlots) : 'blocked'
  const selectedKeyframeSequence = selected ? buildMomentKeyframeSequence(selected) : []
  const showMomentKeyframeContinuity = selectedKeyframeSequence.length > 0 && (!selectedUnit || selectedKeyframeSequence.some((item) => {
    const sequenceUnitId = item.unit?.ID ?? numberOf(item.keyframe.content_unit_id)
    return sequenceUnitId !== selectedUnit.ID
  }))
  const keyframeConfig = useMemo(() => semanticEntityConfig('keyframes'), [])
  const nextKeyframeRole = frameRoleLabel(selectedUnitKeyframes.length, selectedUnitKeyframes.length + 1)
  const keyframeDefaults = useMemo<Partial<SemanticEntityPayload> | undefined>(() => {
    if (!selected || !selectedUnit) return undefined
    return {
      production_id: nullableNumber(selectedUnit.production_id ?? selected.segment?.production_id ?? selected.moment.production_id ?? selected.productionIds[0]),
      scene_moment_id: selected.moment.ID,
      content_unit_id: selectedUnit.ID,
      title: `${nextKeyframeRole} · ${titleOfRecord(selectedUnit)}`,
      order: selectedUnitKeyframes.length + 1,
      status: 'candidate',
    }
  }, [nextKeyframeRole, selected, selectedUnit, selectedUnitKeyframes.length])
  const missingGenerationContext = generationContextQuery.data
    ? buildGenerationContextStandards(generationContextQuery.data).filter((item) => !item.done)
    : []

  function triggerCandidateUpload() {
    if (!uploadTargetSlot || uploading || uploadCandidate.isPending) return
    setCandidateUploadTargetSlot(uploadTargetSlot)
    uploadInputRef.current?.click()
  }

  function handleCandidateUpload(file?: File) {
    const slot = candidateUploadTargetSlot ?? uploadTargetSlot
    if (!file) {
      setCandidateUploadTargetSlot(null)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      return
    }
    if (!slot) {
      setCandidateUploadTargetSlot(null)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      return
    }
    if (uploadCandidate.isPending) return
    setUploading(true)
    uploadCandidate.mutate({ file, slot })
  }

  function openKeyframeUpload(keyframe: WorkbenchRecord) {
    setUploadKeyframeTarget(keyframe)
    keyframeUploadInputRef.current?.click()
  }

  function handleKeyframeUpload(file?: File) {
    if (!file || !uploadKeyframeTarget || uploadKeyframeResource.isPending) return
    uploadKeyframeResource.mutate({ keyframe: uploadKeyframeTarget, file })
  }

  function openKeyframeLibrary(keyframe: WorkbenchRecord) {
    setKeyframeLibraryTarget(keyframe)
    setKeyframeResourceSearch('')
    setKeyframeResourcePage(1)
  }

  function openCreateKeyframe() {
    if (!selectedUnit) return
    setCreatingKeyframe(true)
  }

  const contentUnitConfig = useMemo(() => semanticEntityConfig('contentUnits'), [])
  const productionWorkbenchQueryKey = ['workbench', 'production', projectId] as const
  const reviewDraftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['workbench', 'production', 'content-drafts', projectId],
    queryFn: async () => {
      if (!projectId) return []
      const contentUnitProposals = await localAgentClient.listDrafts({ projectId, kind: 'content_unit_proposal', status: ['draft', 'accepted'], limit: 20 })
      return dedupeDrafts(contentUnitProposals.drafts)
    },
    enabled: !!projectId,
    retry: false,
  })
  const reviewDrafts = reviewDraftsQuery.data ?? []
  const reviewDraftsById = useMemo(() => new Map(reviewDrafts.map((draft) => [draft.id, draft] as const)), [reviewDrafts])
  const selectedReviewDraft = reviewDraftId ? reviewDraftsById.get(reviewDraftId) ?? null : reviewDrafts[0] ?? null
  const contentDraftReview = useMemo(() => {
    if (!selectedReviewDraft) return null
    return buildContentDraftReviewModel(selectedReviewDraft, {
      rowByMomentId: new Map(rows.map((row) => [row.moment.ID, row] as const)),
      rowByUnitId: new Map(rows.flatMap((row) => row.units.map((unit) => [unit.ID, row] as const))),
    })
  }, [rows, selectedReviewDraft])
  const reviewQueueSummary = useMemo(() => buildContentWorkbenchReviewQueueSummary({
    drafts: reviewDrafts,
    selectedReview: contentDraftReview ? {
      warningCount: contentDraftReview.warnings.length,
      diffCount: contentDraftReview.diffs.length,
      addedCount: contentDraftReview.diffs.filter((diff) => diff.state === 'added').length,
      changedCount: contentDraftReview.diffs.filter((diff) => diff.state === 'changed').length,
    } : null,
  }), [contentDraftReview, reviewDrafts])
  const standards = useMemo(() => appendReviewGate(baseStandards, reviewQueueSummary.pending), [baseStandards, reviewQueueSummary.pending])

  function selectReviewDraft(draftId: string) {
    setReviewPanelCollapsed(false)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('view', 'review')
      next.set('draftId', draftId)
      return next
    }, { replace: true })
  }

  function closeReview() {
    setReviewPanelCollapsed(true)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('view')
      next.delete('draftId')
      return next
    }, { replace: true })
  }

  const rejectContentDraft = useMutation({
    mutationFn: async (draft: AgentDraft) => localAgentClient.rejectDraft(draft.id, '用户在内容编排工作台退回该制作项草案'),
    onSuccess: async () => {
      toast.success('AI 草案已退回')
      await reviewDraftsQuery.refetch()
      closeReview()
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, 'AI 草案退回失败'))
    },
  })
  const markContentDraftReviewed = useMutation({
    mutationFn: async (draft: AgentDraft) => localAgentClient.updateDraft(draft.id, {
      status: 'applied',
      target: {
        ...(isRecord(draft.target) ? draft.target : {}),
        projectId,
        entityType: 'scene_moment',
        entityId: selected?.moment.ID ?? draftEntityId(draft.target) ?? draftEntityId(draft.source),
        field: 'content_unit_proposal_review',
      },
      metadata: {
        ...(isRecord(draft.metadata) ? draft.metadata : {}),
        reviewedFrom: 'content-workbench',
        reviewedAt: new Date().toISOString(),
        backendWritePerformed: false,
        reviewDisposition: 'manual_review_completed',
      },
    }),
    onSuccess: async () => {
      toast.success('AI 草案已标记为处理完成')
      await reviewDraftsQuery.refetch()
      closeReview()
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, 'AI 草案状态更新失败'))
    },
  })

  const unitCandidates = useMemo(() => {
    if (!selected) return [] as WorkbenchRecord[]
    return selected.units.filter((unit) => {
      const status = String(unit.status ?? '').toLowerCase()
      return status === '' || status === 'draft' || status === 'candidate'
    })
  }, [selected])
  const totalUnitCount = filteredRows.reduce((sum, row) => sum + row.units.length, 0)
  const totalKeyframeCount = filteredRows.reduce((sum, row) => sum + row.keyframes.length, 0)
  const totalMissingSlotCount = filteredRows.reduce((sum, row) => sum + row.missingSlots.length, 0)
  const readyMomentCount = filteredRows.filter((row) => row.units.length > 0 && row.missingSlots.length === 0 && row.units.some((unit) => firstText(unit.prompt, unit.description))).length
  const runningJobCount = data?.jobs.filter((job) => job.status === 'pending' || job.status === 'running').length ?? 0
  const completedJobCount = data?.jobs.filter((job) => job.status === 'succeeded').length ?? 0
  const selectedProductionIdSet = new Set(selected?.productionIds ?? [])
  const selectedPreviewItemCount = data?.previewTimelineItems.filter((item) => (
    selectedProductionIdSet.has(numberOf(item.production_id)) ||
    (selected?.moment.ID && numberOf(item.scene_moment_id) === selected.moment.ID) ||
    (selectedUnit?.ID && numberOf(item.content_unit_id) === selectedUnit.ID)
  )).length ?? 0
  const selectedPreviewPlanSegments = useMemo(
    () => (selectedProduction && data ? buildPreviewPlanSegments(selectedProduction, data) : []),
    [data, selectedProduction],
  )
  const selectedPreviewTimelineUnits = useMemo(
    () => (selectedProduction && data ? buildPreviewTimelineContentUnits(selectedProduction, data) : []),
    [data, selectedProduction],
  )
  const selectedPreviewMissingAssets = useMemo(
    () => (selectedProduction && data ? buildPreviewAssetGaps(selectedProduction, data) : []),
    [data, selectedProduction],
  )
  const selectedPreviewTimelines = useMemo(
    () => (selectedProduction && data ? previewTimelinesForWorkbenchProduction(selectedProduction, data) : []),
    [data, selectedProduction],
  )
  const selectedDeliveryVersionCount = data?.deliveryVersions.filter((item) => (
    selectedProductionIdSet.has(numberOf(item.production_id)) ||
    (selectedUnit?.ID && numberOf(item.content_unit_id) === selectedUnit.ID)
  )).length ?? 0
  const readinessSummary = buildContentWorkbenchReadinessSummary(standards)
  const productionPipeline = buildContentWorkbenchPipeline({
    productionTitle: selectedProduction ? titleOfRecord(selectedProduction) : undefined,
    segmentTitle: selected?.segment ? titleOfRecord(selected.segment) : undefined,
    sceneMomentTitle: selected ? titleOfRecord(selected.moment) : undefined,
    selectedUnitTitle: selectedUnit ? titleOfRecord(selectedUnit) : undefined,
    unitCount: selected?.units.length ?? 0,
    keyframeCount: selectedKeyframeSequence.length,
    missingSlotCount: selected?.missingSlots.length ?? 0,
    generationContextReady: Boolean(selectedUnit && generationContextQuery.data && missingGenerationContext.length === 0),
    pendingReviewDraftCount: reviewQueueSummary.pending,
    runningJobCount: selectedUnit ? selectedUnitRunningJobCount : runningJobCount,
    completedJobCount: selectedUnit ? selectedUnitCompletedJobCount : completedJobCount,
    previewItemCount: selectedPreviewItemCount,
    deliveryVersionCount: selectedDeliveryVersionCount,
  })
  const productionPipelineIcons: Record<ContentWorkbenchPipelineStepKey, LucideIcon> = {
    production: Clapperboard,
    segment: GitBranch,
    scene_moment: Route,
    content_units: Boxes,
    keyframes: Image,
    assets: Upload,
    generation_context: ClipboardCheck,
    ai_review: ShieldCheck,
    generation_plan: Play,
    preview_delivery: Film,
  }
  const confirmCandidate = useMutation({
    mutationFn: async ({ unitId, next }: { unitId: number; next: 'confirmed' | 'ignored' }) => {
      if (!projectId) throw new Error('请先选择项目')
      await updateSemanticEntity(projectId, contentUnitConfig, unitId, { status: next })
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: productionWorkbenchQueryKey })
      if (variables.next === 'confirmed') {
        selectContentUnit(variables.unitId)
      } else if (selectedUnit?.ID === variables.unitId) {
        const nextUnitId = selected
          ? pickContentWorkbenchFocusAfterIgnoredCandidate(
            selected.units.map((unit) => ({ id: unit.ID, status: unit.status })),
            variables.unitId,
          )
          : null
        if (nextUnitId) selectContentUnit(nextUnitId)
        else if (selected) selectSceneMoment(selected.id)
      }
      toast.success(variables.next === 'confirmed' ? '候选已确认' : '候选已忽略')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '候选状态更新失败'))
    },
  })

  function openAiSuggest() {
    if (!projectId || !selected) {
      toast.info('请先选择情节')
      return
    }
    const prompt = buildContentWorkbenchAiSuggestPrompt({
      momentTitle: selected.title,
      sceneMomentId: selected.moment.ID,
      momentScope: selected.scope,
      existingUnits: selected.units.map((unit) => ({
        title: titleOfRecord(unit),
        kind: unit.kind,
        status: unit.status,
        prompt: unit.prompt,
        description: unit.description,
      })),
    })
    const requestId = `content_unit_suggest_${selected.moment.ID}_${Date.now().toString(36)}`
    openAgentPanelDraft({
      requestId,
      taskType: 'content_unit_suggest',
      message: prompt,
      title: `制作项 AI 建议: ${selected.title}`,
      newConversation: true,
      autoSend: false,
      projectId,
      clientInput: buildCommandFirstClientInput({
        message: prompt,
        labels: ['workbench', 'content-unit-suggest'],
        hints: {
          projectId,
          productionId: selectedProduction?.ID,
          route: {
            pathname: ROUTES.project.contentUnitWorkbench,
            search: buildContentWorkbenchRouteSearch({ sceneMomentId: selected.moment.ID }),
          },
          selection: {
            entityType: 'scene_moment',
            entityId: selected.moment.ID,
            label: selected.title,
          },
        },
      }),
      timeoutMs: 90_000,
    })
    toast.success('已打开 AI 助手，可在输入框补充需求后发送')
  }

  function openReviewQueue() {
    setReviewPanelCollapsed(false)
    const draft = selectedReviewDraft ?? reviewDrafts[0]
    if (!draft) {
      openAiSuggest()
      return
    }
    selectReviewDraft(draft.id)
  }

  function inspectPreviewMount() {
    const previewMount = previewMountSectionRef.current?.querySelector<HTMLDetailsElement>('[data-testid="content-workbench-preview-mount"]')
    if (previewMount) previewMount.open = true
    previewMountSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function openEditSelectedUnit(unitId?: number) {
    const targetUnit = unitId && selected?.units.some((unit) => unit.ID === unitId)
      ? selected.units.find((unit) => unit.ID === unitId) ?? null
      : selectedUnit
    if (!targetUnit) {
      setCreatingUnit(true)
      return
    }
    selectContentUnit(targetUnit.ID)
    setEditingUnit(true)
  }

  function openCreateUnitFromProposal(proposal: Record<string, unknown>) {
    setUnitDraftDefaults(contentWorkbenchProposalDefaults(proposal))
    setCreatingUnit(true)
  }

  function openSelectedUnitCanvas() {
    if (openUnitCanvas.isPending) return
    if (!selectedUnit) {
      setCreatingUnit(true)
      return
    }
    openUnitCanvas.mutate(selectedUnit)
  }

  function selectFirstSceneMoment() {
    const firstRow = filteredRows[0]
    if (!firstRow) {
      toast.info('暂无可选择的情节')
      return
    }
    selectSceneMoment(firstRow.id)
  }

  function selectFirstContentUnit() {
    if (!selected) {
      selectFirstSceneMoment()
      return
    }
    const targetUnitId = pickContentWorkbenchFirstUsableUnit(selected.units.map((unit) => ({ id: unit.ID, status: unit.status })))
    if (!targetUnitId) {
      setCreatingUnit(true)
      return
    }
    selectContentUnit(targetUnitId)
  }

  const nextActions = buildContentWorkbenchNextActions({
    hasSelectedMoment: Boolean(selected),
    unitCount: selected?.units.length ?? 0,
    hasSelectedUnit: Boolean(selectedUnit),
    hasUnitPrompt: Boolean(selectedUnit && firstText(selectedUnit.prompt, selectedUnit.description)),
    missingSlotCount: selectedUnitMissingSlots.length,
    keyframeCount: selectedUnitKeyframes.length,
    pendingReviewDraftCount: reviewQueueSummary.pending,
    missingGenerationContext,
    completedJobCount: selectedUnitCompletedJobCount,
    previewItemCount: selectedPreviewItemCount,
    deliveryVersionCount: selectedDeliveryVersionCount,
  })
  const nextActionIcons: Record<ContentWorkbenchNextActionKey, LucideIcon> = {
    select_scene_moment: Route,
    ai_plan_units: Sparkles,
    manual_add_unit: Boxes,
    select_unit: Target,
    complete_unit_prompt: FileText,
    upload_missing_assets: Upload,
    add_first_keyframe: Image,
    resolve_generation_context: AlertTriangle,
    review_ai_drafts: ClipboardCheck,
    open_generation_canvas: Play,
    inspect_preview_mount: Film,
    open_delivery_workspace: PackageCheck,
  }
  const nextActionHandlers: Partial<Record<ContentWorkbenchNextActionKey, () => void>> = {
    select_scene_moment: selectFirstSceneMoment,
    ai_plan_units: openAiSuggest,
    manual_add_unit: () => setCreatingUnit(true),
    select_unit: selectFirstContentUnit,
    complete_unit_prompt: () => openEditSelectedUnit(),
    upload_missing_assets: triggerCandidateUpload,
    add_first_keyframe: openCreateKeyframe,
    resolve_generation_context: () => openEditSelectedUnit(),
    review_ai_drafts: openReviewQueue,
    open_generation_canvas: selectedUnit ? openSelectedUnitCanvas : undefined,
    inspect_preview_mount: inspectPreviewMount,
    open_delivery_workspace: () => navigate(withRouteParams(ROUTES.project.deliveryWorkbench, { productionId: selectedProduction?.ID })),
  }
  const deliveryBrief = buildContentWorkbenchDeliveryBrief({
    hasSelectedUnit: Boolean(selectedUnit),
    unitTitle: selectedUnit ? titleOfRecord(selectedUnit) : undefined,
    hasPrompt: Boolean(selectedUnit && firstText(selectedUnit.prompt, selectedUnit.description)),
    assetSlotCount: selectedUnitAssetSlots.length,
    missingSlotCount: selectedUnitMissingSlots.length,
    keyframeCount: selectedUnitKeyframes.length,
    generationContextReady: Boolean(selectedUnit && generationContextQuery.data && missingGenerationContext.length === 0),
    generationContextLoading: !generationContextQuery.data && (generationContextQuery.isLoading || generationContextQuery.isFetching),
    generationContextError: generationContextQuery.isError,
    pendingReviewDraftCount: reviewQueueSummary.pending,
    completedJobCount: selectedUnitCompletedJobCount,
    previewItemCount: selectedPreviewItemCount,
    deliveryVersionCount: selectedDeliveryVersionCount,
  })
  const currentUnitHealth = buildContentWorkbenchUnitHealth({
    hasSelectedUnit: Boolean(selectedUnit),
    hasPrompt: Boolean(selectedUnit && firstText(selectedUnit.prompt, selectedUnit.description)),
    assetSlotCount: selectedUnitAssetSlots.length,
    missingSlotCount: selectedUnitMissingSlots.length,
    keyframeCount: selectedUnitKeyframes.length,
    generationContextReady: Boolean(selectedUnit && generationContextQuery.data && missingGenerationContext.length === 0),
    generationContextLoading: !generationContextQuery.data && (generationContextQuery.isLoading || generationContextQuery.isFetching),
    generationContextError: generationContextQuery.isError,
    pendingReviewDraftCount: reviewQueueSummary.pending,
    runningJobCount: selectedUnitRunningJobCount,
    completedJobCount: selectedUnitCompletedJobCount,
    previewItemCount: selectedPreviewItemCount,
    deliveryVersionCount: selectedDeliveryVersionCount,
  })
  const activityFeed = buildContentWorkbenchActivityFeed({
    hasSelectedUnit: Boolean(selectedUnit),
    selectedUnitTitle: selectedUnit ? titleOfRecord(selectedUnit) : undefined,
    missingAssetTitles: selectedUnitMissingSlots.map((slot) => titleOfRecord(slot)),
    keyframeTitles: selectedUnitKeyframes.map((keyframe) => titleOfRecord(keyframe)),
    generationContextReady: Boolean(selectedUnit && generationContextQuery.data && missingGenerationContext.length === 0),
    generationContextLoading: !generationContextQuery.data && (generationContextQuery.isLoading || generationContextQuery.isFetching),
    generationContextError: generationContextQuery.isError,
    pendingReviewDraftCount: reviewQueueSummary.pending,
    jobs: selectedUnitJobs.map((job) => ({
      id: job.ID,
      title: job.title,
      type: job.job_type,
      status: job.status,
      outputResourceId: job.output_resource_id,
      error: job.error_msg,
    })),
  })
  const commandBriefRows = buildContentWorkbenchCommandBrief({
    selectedMomentTitle: selected?.title,
    selectedUnitTitle: selectedUnit ? titleOfRecord(selectedUnit) : undefined,
    selectedUnitDetail: selectedUnit ? firstText(selectedUnit.prompt, selectedUnit.description, '暂无生成提示') : undefined,
    readiness: readinessSummary,
  })
  const commandBriefIcons: Record<ContentWorkbenchCommandBriefKey, LucideIcon> = {
    focus: Target,
    blocker: ShieldCheck,
  }
  const showReviewPanel = reviewMode || reviewDraftsQuery.isLoading || (reviewDrafts.length > 0 && !reviewPanelCollapsed)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <SpecializedWorkbenchHeader
        category="production"
        generationKind="production"
        kicker="内容编排"
        title="内容编排工作台"
        description="围绕情节拆解制作项、补齐画面锚点和素材需求，并把设定资料一起带入 AI 生成流程。"
      />
      <main className="min-h-0 flex-1 overflow-auto p-4">
        {!projectId ? (
          <EmptyWorkbenchState title="请先选择项目" text="当前没有可用的项目信息，无法拉取情节、制作项、素材需求和生成任务。" />
        ) : isLoading ? (
          <Card className="rounded-lg border-border bg-card p-8 text-center text-sm text-muted-foreground">正在加载内容编排数据...</Card>
        ) : isError ? (
          <EmptyWorkbenchState title="内容编排数据加载失败" text="后端语义实体接口未返回可用数据，稍后重试。" />
        ) : (
          <div className="production-workbench space-y-3">
            <section className="overflow-hidden rounded-lg border border-border bg-card" data-testid="content-workbench-command-center">
              <div className="border-b border-border bg-muted/25 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Wand2 size={14} />
                      AI 内容创作指挥台
                    </div>
                    <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{selected ? selected.title : '暂无情节'}</h2>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{selected ? selected.scope : '选择制作和情节后，拆解制作项、补视觉锚点并检查生成上下文。'}</p>
                  </div>
                  <div className="flex flex-wrap overflow-hidden rounded-md border border-border bg-background" data-testid="content-workbench-command-metrics">
                    {[
                      { label: '可生成', value: readyMomentCount, tone: readyMomentCount > 0 ? 'default' : 'warning' },
                      { label: '待审草案', value: reviewQueueSummary.pending, tone: reviewQueueSummary.pending > 0 ? 'warning' : 'default', onClick: openReviewQueue },
                      { label: '运行任务', value: runningJobCount, tone: runningJobCount > 0 ? 'warning' : 'default' },
                    ].map((metric) => {
                      const content = (
                        <>
                          <span className="text-[10px] text-muted-foreground">{metric.label}</span>
                          <span className={cn('text-sm font-semibold tabular-nums', metric.tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>
                            {metric.value}
                          </span>
                        </>
                      )
                      const className = 'flex min-w-[92px] flex-1 items-center justify-between gap-2 border-b border-border/70 px-2 py-1.5 text-left last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0'
                      return metric.onClick ? (
                        <button key={metric.label} type="button" data-action-key="review_ai_drafts" className={cn(className, 'transition-colors hover:bg-primary/5')} onClick={metric.onClick}>
                          {content}
                        </button>
                      ) : (
                        <div key={metric.label} className={className}>
                          {content}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 p-2.5 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 space-y-3">
                  <ProductionPipeline
                    title={productionPipeline.title}
                    detail={productionPipeline.detail}
                    steps={productionPipeline.steps}
                    icons={productionPipelineIcons}
                  />

                  <div className="flex flex-wrap items-stretch overflow-hidden rounded-md border border-border bg-background" data-testid="content-workbench-command-brief">
                    {commandBriefRows.map((item) => {
                      const Icon = commandBriefIcons[item.key]
                      const className = cn(
                        'min-w-[160px] flex-1 border-b border-border/70 px-2.5 py-1.5 text-left last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0',
                        item.tone === 'warning' ? 'bg-amber-50/60 dark:bg-amber-950/20' : 'bg-background',
                      )
                      return (
                        <div key={item.key} className={className}>
                          <div className="flex items-center gap-1.5">
                            <Icon size={14} className="shrink-0 text-muted-foreground" />
                            <p className="truncate text-[11px] font-medium text-muted-foreground">{item.label}</p>
                          </div>
                          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{item.value}</p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.detail}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Settings2 size={14} />
                    筛选与定位
                  </div>
                  <Select value={productionFilter} onValueChange={selectProductionFilter}>
                    <SelectTrigger className="h-9">
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
                  <Select value={segmentFilter} onValueChange={selectSegmentFilter}>
                    <SelectTrigger className="h-9">
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
                  <Select value={selected?.id ?? ''} onValueChange={selectSceneMoment} disabled={sceneMomentFilterOptions.length === 0}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="选择情节" />
                    </SelectTrigger>
                    <SelectContent>
                      {sceneMomentFilterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label} · {option.count} 制作项
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filteredRows.length === 0 ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                      <p>当前项目还没有情节入口，先完成制作编排后再进入内容编排。</p>
                      <Button size="sm" variant="outline" className="mt-2 h-8 gap-1.5" onClick={() => navigate(ROUTES.project.productionOrchestration)}>
                        <Route size={13} />
                        进入制作编排
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {showReviewPanel ? (
              <ContentGenerationReviewPanel
                reviewMode={reviewMode}
                drafts={reviewDrafts}
                selectedDraft={selectedReviewDraft}
                reviewModel={contentDraftReview}
                queueSummary={reviewQueueSummary}
                rejectingDraft={rejectContentDraft.isPending}
                markingDraftReviewed={markContentDraftReviewed.isPending}
                onOpenAiSuggest={openAiSuggest}
                onSelectDraft={selectReviewDraft}
                onCreateUnitFromProposal={openCreateUnitFromProposal}
                onEditCurrentUnit={openEditSelectedUnit}
                onMarkDraftReviewed={(draft) => markContentDraftReviewed.mutate(draft)}
                onRejectDraft={(draft) => rejectContentDraft.mutate(draft)}
                onCloseReview={closeReview}
              />
            ) : null}

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]" data-testid="content-workbench-production-grid">
              <div className="min-w-0 space-y-3">
                <WorkbenchPanel
                  title="制作项轨道"
                  icon={Play}
                  action={unitCandidates.length > 0 ? <Badge variant="secondary">{unitCandidates.length} 条待确认</Badge> : undefined}
                >
                  <div className="space-y-3">
                    <UnitProductionTrack row={selected} selectedUnitId={selectedUnit?.ID} onSelectUnit={selectContentUnit} />
                    {showMomentKeyframeContinuity ? (
                      <KeyframeContinuityStrip
                        sequence={selectedKeyframeSequence}
                      />
                    ) : null}
                    {unitCandidates.length > 0 ? (
                      <details className="overflow-hidden rounded-md border border-border bg-background" data-testid="content-workbench-candidate-queue">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Sparkles size={15} className="shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm font-medium text-foreground">待确认候选</span>
                            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                              {titleOfRecord(unitCandidates[0])}
                            </span>
                          </div>
                          <Badge variant="secondary">{unitCandidates.length}</Badge>
                        </summary>
                        <div className="border-t border-border">
                          {unitCandidates.map((unit) => {
                            const isDraft = String(unit.status ?? '').toLowerCase() === 'draft'
                            return (
                              <div key={unit.ID} className="grid gap-1.5 border-b border-border/70 px-2.5 py-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="truncate text-sm font-medium text-foreground">{titleOfRecord(unit)}</p>
                                    <Badge variant={isDraft ? 'outline' : 'secondary'} className="text-[10px]">{isDraft ? '草稿' : '候选'}</Badge>
                                    <Badge variant="outline" className="text-[10px]">{unit.kind || 'shot'}</Badge>
                                  </div>
                                  <p className="mt-1 truncate text-xs text-muted-foreground">
                                    {firstText(unit.description, unit.prompt, '暂无描述或生成提示')}
                                  </p>
                                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                    <span>时长 {formatDuration(unit.duration_sec)}</span>
                                    {unit.shot_size ? <span>景别 {unit.shot_size}</span> : null}
                                    {unit.camera_angle ? <span>机位 {unit.camera_angle}</span> : null}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 md:justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2"
                                    onClick={() => confirmCandidate.mutate({ unitId: unit.ID, next: 'ignored' })}
                                    disabled={confirmCandidate.isPending}
                                  >
                                    忽略
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-7 gap-1 px-2"
                                    onClick={() => confirmCandidate.mutate({ unitId: unit.ID, next: 'confirmed' })}
                                    disabled={confirmCandidate.isPending}
                                  >
                                    <CheckCircle2 size={13} />
                                    确认
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </details>
                    ) : null}

                    <div className="border-t border-border pt-3" data-testid="content-workbench-keyframe-track">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Image size={15} className="text-muted-foreground" />
                          画面锚点轨道
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={selectedUnitKeyframes.length > 0 ? 'secondary' : 'warning'}>
                            {selectedUnitKeyframes.length > 0 ? `${selectedUnitKeyframes.length} 帧` : '待补'}
                          </Badge>
                        </div>
                      </div>
                      {selectedUnit ? (
                        <p className="mb-2 text-xs text-muted-foreground">当前制作项：{titleOfRecord(selectedUnit)}</p>
                      ) : null}
                      {!selectedUnit ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">选择或创建制作项后查看画面锚点。</p>
                      ) : selectedUnitKeyframes.length === 0 ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">当前制作项还没有关键帧</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">建议至少补开头帧和结尾帧，用来约束视频生成的状态变化。</p>
                          </div>
                          <Button size="sm" className="shrink-0 gap-2" onClick={openCreateKeyframe}>
                            <Plus size={14} />
                            添加第一张关键帧
                          </Button>
                        </div>
                      ) : (
                        <div className="-mx-1 overflow-x-auto px-1 pb-1">
                          <div className="flex min-w-max gap-2">
                            {selectedUnitKeyframes.map((keyframe, index) => (
                              <div key={keyframe.ID} className="w-[148px] shrink-0 overflow-hidden rounded-md border border-border bg-card">
                                <div className="relative aspect-video bg-muted">
                                  {keyframe.resource_id ? (
                                    <AuthedImage
                                      src={resourceFileUrl(keyframe.resource_id)}
                                      alt={titleOfRecord(keyframe)}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                                      <Image size={18} />
                                      <span className="text-[11px]">文字锚点</span>
                                    </div>
                                  )}
                                  <Badge variant="secondary" className="absolute left-1.5 top-1.5 bg-background/90 px-1.5 py-0 text-[10px] shadow-sm">
                                    {frameRoleLabel(index, selectedUnitKeyframes.length)}
                                  </Badge>
                                  <Badge variant={keyframe.resource_id ? 'success' : 'outline'} className="absolute right-1.5 top-1.5 bg-background/90 px-1.5 py-0 text-[10px] shadow-sm">
                                    {keyframe.resource_id ? '有素材' : '待出图'}
                                  </Badge>
                                  <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      aria-label="上传关键帧图片"
                                      title="上传关键帧图片"
                                      className="h-7 w-7 bg-background/95 p-0 shadow-sm hover:bg-background"
                                      onClick={() => openKeyframeUpload(keyframe)}
                                      disabled={uploadKeyframeResource.isPending || bindKeyframeResource.isPending}
                                    >
                                      <Upload size={12} />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      aria-label="从资源库选择关键帧素材"
                                      title="从资源库选择关键帧素材"
                                      className="h-7 w-7 bg-background/95 p-0 shadow-sm hover:bg-background"
                                      onClick={() => openKeyframeLibrary(keyframe)}
                                      disabled={uploadKeyframeResource.isPending || bindKeyframeResource.isPending}
                                    >
                                      <Library size={12} />
                                    </Button>
                                  </div>
                                </div>
                                <div className="px-2 py-1.5">
                                  <p className="truncate text-xs font-medium text-foreground">{titleOfRecord(keyframe)}</p>
                                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{firstText(keyframe.prompt, keyframe.description, '暂无画面描述')}</p>
                                </div>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={openCreateKeyframe}
                              className="flex w-[112px] shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-border bg-card px-2 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
                            >
                              <Plus size={16} />
                              <span className="mt-2 font-medium">添加关键帧</span>
                              <span className="mt-1 text-[11px] leading-4">{nextKeyframeRole}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </WorkbenchPanel>
              </div>

              <div className="min-w-0 space-y-3">
                <WorkbenchPanel
                  title="生成检查"
                  icon={ShieldCheck}
                  action={selectedUnit ? (
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(selectedUnitStatus)}>{statusLabel(selectedUnitStatus)}</Badge>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => openEditSelectedUnit()}>
                        <Pencil size={13} />
                        编辑
                      </Button>
                    </div>
                  ) : <Badge variant="warning">未选择制作项</Badge>}
                >
                  {selectedUnit ? (
                    <div className="mb-2.5 space-y-2" data-testid="content-workbench-current-unit-panel">
                      <details className="rounded-md border border-border bg-background" data-testid="content-workbench-generation-target">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 marker:text-muted-foreground">
                          <span className="flex min-w-0 items-center gap-2">
                            <Target size={15} className="shrink-0 text-muted-foreground" />
                            <span className="min-w-0">
                              <span className="block text-[11px] font-medium text-muted-foreground">生成目标</span>
                              <span className="block truncate text-sm font-semibold text-foreground">{titleOfRecord(selectedUnit)}</span>
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <Badge variant="outline">{selectedUnit.kind || 'shot'}</Badge>
                            <Badge variant="outline">{formatDuration(selectedUnit.duration_sec)}</Badge>
                          </span>
                        </summary>
                        <div className="border-t border-border px-2.5 py-2">
                          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{firstText(selectedUnit.prompt, selectedUnit.description, '暂无描述或生成提示')}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {selectedUnit.shot_size ? <Badge variant="outline">景别 {selectedUnit.shot_size}</Badge> : null}
                            {selectedUnit.camera_angle ? <Badge variant="outline">机位 {selectedUnit.camera_angle}</Badge> : null}
                            {selectedUnit.camera_motion ? <Badge variant="outline">运动 {selectedUnit.camera_motion}</Badge> : null}
                          </div>
                        </div>
                      </details>
                      <UnitHealthCard health={currentUnitHealth} />
                    </div>
                  ) : (
                    <p className="mb-2.5 rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">从制作项轨道选择一个制作项后查看生成目标、健康度和检查状态。</p>
                  )}
                  <ReadinessSummaryCard rows={standards} />
                  <details className="rounded-md border border-border bg-background" data-testid="content-workbench-gate-detail">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-sm font-medium text-foreground marker:text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-2">
                        <ShieldCheck size={15} className="text-muted-foreground" />
                        <span className="truncate">门禁明细</span>
                      </span>
                      <Badge variant={standards.every((item) => item.done) ? 'success' : 'warning'}>{standards.filter((item) => item.done).length}/{standards.length}</Badge>
                    </summary>
                    <div className="border-t border-border p-2.5">
                      <GateChecklist rows={standards} />
                    </div>
                  </details>
                  <details className="mt-2 rounded-md border border-border bg-background" data-testid="content-workbench-generation-context-detail">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-sm font-medium text-foreground marker:text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-2">
                        <ClipboardCheck size={15} className="text-muted-foreground" />
                        <span className="truncate">生成上下文详情</span>
                      </span>
                      {!selectedUnit ? (
                        <Badge variant="warning">待生成制作项</Badge>
                      ) : generationContextQuery.isFetching ? (
                        <Badge variant="secondary">检查中</Badge>
                      ) : generationContextQuery.isError ? (
                        <Badge variant="warning">检查失败</Badge>
                      ) : (
                        <Badge variant={missingGenerationContext.length > 0 ? 'warning' : 'success'}>
                          {missingGenerationContext.length > 0 ? `${missingGenerationContext.length} 个缺失` : '上下文可用'}
                        </Badge>
                      )}
                    </summary>
                    <div className="border-t border-border p-2.5">
                      {!selected ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">选择情节后检查生成上下文。</p>
                      ) : !selectedUnit ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">当前情节还没有制作项，暂时不能读取制作项级生成上下文。</p>
                      ) : generationContextQuery.isLoading ? (
                        <p className="rounded-md border border-border bg-card px-3 py-5 text-center text-sm text-muted-foreground">正在读取后端生成上下文...</p>
                      ) : generationContextQuery.isError ? (
                        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                          {apiErrorMessage(generationContextQuery.error, '后端上下文检查失败，请确认后端已更新并重新加载页面。')}
                        </p>
                      ) : generationContextQuery.data ? (
                        <div className="space-y-3">
                          <ContextStack rows={generationContextRows} className="production-context-stack" />
                          {missingGenerationContext.length > 0 ? (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                              <p className="text-sm font-medium text-amber-900">生成前建议补齐</p>
                              <div className="mt-1.5 space-y-1">
                                {missingGenerationContext.map((item) => (
                                  <p key={item.label} className="text-xs leading-5 text-amber-800">{item.label}：{item.detail}</p>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                              当前制作项的后端生成上下文已具备，可以进入生成计划阶段。
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </details>

                  <div className="mt-2 border-t border-border pt-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                        <Settings2 size={15} className="text-muted-foreground" />
                        <span className="truncate">下一步动作</span>
                      </div>
                      <Badge variant={nextActions.some((action) => action.tone === 'warning') ? 'warning' : 'success'}>{nextActions.length}</Badge>
                    </div>
                    <NextActionsPanel
                      actions={nextActions}
                      actionIcons={nextActionIcons}
                      actionHandlers={nextActionHandlers}
                      generationCanvasPending={openUnitCanvas.isPending}
                    />
                  </div>

                  <details open className="mt-2 rounded-md border border-border bg-background" data-testid="content-workbench-execution-section">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-sm font-medium text-foreground marker:text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-2">
                        <PackageCheck size={15} className="text-muted-foreground" />
                        <span className="truncate">生成结果</span>
                      </span>
                      <Badge variant={deliveryBrief.tone === 'ready' ? 'success' : deliveryBrief.tone === 'blocked' ? 'warning' : 'outline'}>
                        {deliveryBrief.progress}%
                      </Badge>
                    </summary>
                    <div className="space-y-2.5 border-t border-border p-2.5">
                      {selectedProduction ? (
                        <div ref={previewMountSectionRef}>
                          <PreviewMountCard
                            productionTitle={titleOfRecord(selectedProduction)}
                            segments={selectedPreviewPlanSegments}
                            timelineUnits={selectedPreviewTimelineUnits}
                            gaps={selectedPreviewMissingAssets}
                            previewTimelineCount={selectedPreviewTimelines.length}
                            previewItemCount={selectedPreviewItemCount}
                          />
                        </div>
                      ) : null}
                      <DeliveryBriefCard brief={deliveryBrief} />
                      <ActivityFeedCard feed={activityFeed} />
                    </div>
                  </details>
                </WorkbenchPanel>
              </div>
            </div>
            <input ref={uploadInputRef} type="file" className="hidden" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleCandidateUpload(e.target.files?.[0])} />
            <input ref={keyframeUploadInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleKeyframeUpload(e.target.files?.[0])} />
          </div>
        )}
      </main>

      <Dialog open={Boolean(keyframeLibraryTarget)} onOpenChange={(open) => { if (!open) setKeyframeLibraryTarget(null) }}>
        <DialogContent className="max-h-[88vh] w-[min(560px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>从资源库选择关键帧素材</DialogTitle>
            <DialogDescription>
              {keyframeLibraryTarget ? `绑定到：${titleOfRecord(keyframeLibraryTarget)}` : '选择一个图片资源绑定到关键帧。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            <ResourceLibraryPicker
              resources={keyframeResourceItems}
              selectedResource={null}
              search={keyframeResourceSearch}
              type="image"
              typeOptions={['image']}
              page={keyframeResourcePage}
              pageCount={keyframeResourcePageCount}
              total={keyframeResourceTotal}
              isLoading={keyframeResourcesQuery.isLoading || bindKeyframeResource.isPending}
              onSearch={(value) => {
                setKeyframeResourceSearch(value)
                setKeyframeResourcePage(1)
              }}
              onType={() => {}}
              onPage={setKeyframeResourcePage}
              onSelect={(resource) => {
                if (!keyframeLibraryTarget) return
                bindKeyframeResource.mutate({ keyframe: keyframeLibraryTarget, resourceId: resource.ID })
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={creatingUnit} onOpenChange={(open) => { if (!open) { setCreatingUnit(false); setUnitDraftDefaults(null) } }}>
        <DialogContent className="max-h-[88vh] w-[min(760px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>添加制作项</DialogTitle>
            <DialogDescription>
              {selected ? `将作为候选加入当前情节：${selected.title}` : '请先选择情节再添加制作项。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {selected ? (
              <SemanticEntityInlineEditor
                projectId={projectId}
                config={contentUnitConfig}
                record={null}
                defaults={{
                  kind: 'shot',
                  status: 'candidate',
                  ...unitDraftDefaults,
                  segment_id: selected.segment?.ID ?? null,
                  scene_moment_id: selected.moment.ID,
                  production_id: selectedUnit?.production_id ?? selected.segment?.production_id ?? null,
                  script_block_id: nullableNumber(selectedUnit?.script_block_id ?? selected.segment?.script_block_id),
                  order: selected.units.length + 1,
                }}
                queryKey={productionWorkbenchQueryKey}
                title="新建制作项"
                description="填写制作项基本信息后保存，加入当前情节候选。"
                onSaved={(record) => {
                  selectContentUnit(record.ID)
                  setOptimisticSelectedUnit(record)
                  setCreatingUnit(false)
                  setUnitDraftDefaults(null)
                }}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                请先在筛选区选择情节。
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingUnit} onOpenChange={(open) => { if (!open) setEditingUnit(false) }}>
        <DialogContent className="max-h-[88vh] w-[min(820px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>编辑制作项</DialogTitle>
            <DialogDescription>
              {selectedUnit ? `补齐生成目标、提示词和镜头参数：${titleOfRecord(selectedUnit)}` : '请先选择制作项。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {selectedUnit ? (
              <SemanticEntityInlineEditor
                projectId={projectId}
                config={contentUnitConfig}
                record={selectedUnit}
                queryKey={productionWorkbenchQueryKey}
                editKey={selectedUnit.ID}
                title="编辑制作项"
                description="保存后会刷新制作项轨道、生成检查和下一步动作。"
                onSaved={(record) => {
                  selectContentUnit(record.ID)
                  setEditingUnit(false)
                }}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                请先在制作项轨道中选择一个制作项。
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={creatingKeyframe} onOpenChange={(open) => { if (!open) setCreatingKeyframe(false) }}>
        <DialogContent className="max-h-[88vh] w-[min(760px,calc(100vw-32px))] overflow-auto p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>添加关键帧</DialogTitle>
            <DialogDescription>
              {selectedUnit ? `将写入当前制作项：${titleOfRecord(selectedUnit)}` : '请先选择制作项再添加关键帧。'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {selected && selectedUnit && keyframeDefaults ? (
              <SemanticEntityInlineEditor
                projectId={projectId}
                config={keyframeConfig}
                record={null}
                defaults={keyframeDefaults}
                queryKey={productionWorkbenchQueryKey}
                title="新建关键帧"
                description="保存后会出现在画面连续性和当前制作项的画面锚点轨道中。随后可以上传图片或从资源库选择素材。"
                onSaved={(record) => {
                  setCreatingKeyframe(false)
                  selectContentUnit(Number(record.content_unit_id) || selectedUnit.ID)
                }}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                请先在制作项轨道中选择一个制作项；如果当前情节还没有制作项，请先添加制作项。
              </p>
            )}
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
  contentUnits: number
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
  contentUnits: number
  keyframes: number
  gaps: number
  contentUnitRows: PreviewTimelineContentUnit[]
}

interface PreviewTimelineContentUnit {
  id: string
  title: string
  source: string
  duration: string
  cameraPlan: string
  status: PreviewPlanStatus
  assets: string
  keyframes: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

interface PreviewAssetGap {
  name: string
  owner: string
  priority: '高' | '中' | '低'
  impact: '影响判断' | '影响最终质量'
  placeholder: string
  detail: string
}

function previewTimelinesForWorkbenchProduction(record: WorkbenchRecord, data: ProductionWorkbenchData) {
  return data.previewTimelines.filter((item) => Number(item.production_id) === record.ID)
}

function relatedSegmentIdsForWorkbenchProduction(record: WorkbenchRecord, data: ProductionWorkbenchData) {
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

function relatedSceneMomentIdsForWorkbenchProduction(segmentIds: Set<number>, record: WorkbenchRecord, data: ProductionWorkbenchData) {
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

function contentUnitsForWorkbenchProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, record: WorkbenchRecord, data: ProductionWorkbenchData) {
  return data.contentUnits.filter((unit) => (
    Number(unit.production_id) === record.ID ||
    segmentIds.has(Number(unit.segment_id)) ||
    sceneMomentIds.has(Number(unit.scene_moment_id))
  ))
}

function assetSlotsForWorkbenchProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, contentUnitIds: Set<number>, record: WorkbenchRecord, data: ProductionWorkbenchData) {
  return data.assetSlots.filter((slot) => (
    Number(slot.production_id) === record.ID ||
    (slot.owner_type === 'segment' && segmentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'scene_moment' && sceneMomentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'content_unit' && contentUnitIds.has(Number(slot.owner_id)))
  ))
}

function keyframesForWorkbenchProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, contentUnitIds: Set<number>, record: WorkbenchRecord, data: ProductionWorkbenchData) {
  return data.keyframes.filter((keyframe) => (
    Number(keyframe.production_id) === record.ID ||
    segmentIds.has(Number(keyframe.segment_id)) ||
    sceneMomentIds.has(Number(keyframe.scene_moment_id)) ||
    contentUnitIds.has(Number(keyframe.content_unit_id))
  ))
}

function buildPreviewPlanSegments(record: WorkbenchRecord, data: ProductionWorkbenchData): PreviewPlanSegment[] {
  const segmentIds = relatedSegmentIdsForWorkbenchProduction(record, data)
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
      const plotMissingUnits = plotUnits.filter((unit) => !plotKeyframes.some((keyframe) => Number(keyframe.content_unit_id) === unit.ID)).length
      const plotGaps = plotMissingSlots + plotMissingUnits
      const contentUnitRows = plotUnits.map((unit) => {
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
          cameraPlan: cameraPlanSummary(unit) || firstText(unit.kind, '待补镜头参数'),
          status: missingSlots.length > 0 ? 'blocked' : unitKeyframes.length > 0 ? 'ready' : 'attention',
          assets: `${unitSlots.length} 个素材需求 · ${unitKeyframes.length} 个画面锚点${missingSlots.length > 0 ? ` · ${missingSlots.length} 个缺口` : ''}`,
          keyframes: unitKeyframes.length,
        } satisfies PreviewTimelineContentUnit
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
        contentUnits: plotUnits.length,
        keyframes: plotKeyframes.length,
        gaps: plotGaps,
        contentUnitRows,
      }
    })
    if (orphanUnits.length > 0) {
      const orphanUnitIds = new Set(orphanUnits.map((unit) => unit.ID))
      const orphanSlots = data.assetSlots.filter((slot) => (
        slot.owner_type === 'content_unit' && orphanUnitIds.has(Number(slot.owner_id))
      ))
      const orphanKeyframes = data.keyframes.filter((keyframe) => orphanUnitIds.has(Number(keyframe.content_unit_id)))
      const orphanContentUnitRows = orphanUnits.map((unit) => {
        const unitKeyframes = orphanKeyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID)
        const unitSlots = orphanSlots.filter((slot) => Number(slot.owner_id) === unit.ID)
        const missingSlots = unitSlots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing')
        return {
          id: `cu-${unit.ID}`,
          title: titleOfRecord(unit),
          source: `编排段 ${titleOfRecord(segment)} / 未归属情节`,
          duration: formatDuration(Number(unit.duration_sec) || 0),
          cameraPlan: cameraPlanSummary(unit) || firstText(unit.kind, '待补镜头参数'),
          status: missingSlots.length > 0 ? 'blocked' : unitKeyframes.length > 0 ? 'ready' : 'attention',
          assets: `${unitSlots.length} 个素材需求 · ${unitKeyframes.length} 个画面锚点${missingSlots.length > 0 ? ` · ${missingSlots.length} 个缺口` : ''}`,
          keyframes: unitKeyframes.length,
        } satisfies PreviewTimelineContentUnit
      })
      plotRows.push({
        id: `orphan-${segment.ID}`,
        title: '未归属情节',
        subtitle: '该段中尚未挂到具体情节的制作项',
        status: orphanContentUnitRows.some((unit) => unit.status === 'blocked') ? 'blocked' : orphanContentUnitRows.some((unit) => unit.status === 'attention') ? 'attention' : 'ready',
        durationSec: orphanUnits.reduce((sum, unit) => sum + (Number(unit.duration_sec) || 0), 0),
        readiness: clampProgress(
          Math.round(
            (orphanContentUnitRows.length > 0 ? 28 : 8) +
            (orphanKeyframes.length > 0 ? 34 : 0) +
            (orphanSlots.some((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing') ? 0 : 18) +
            (orphanContentUnitRows.every((unit) => unit.status !== 'blocked') ? 20 : 0),
          ),
        ),
        duration: formatDuration(orphanUnits.reduce((sum, unit) => sum + (Number(unit.duration_sec) || 0), 0)),
        contentUnits: orphanUnits.length,
        keyframes: orphanKeyframes.length,
        gaps: orphanSlots.filter((slot) => normalizeAssetSlotStatus(String(slot.status ?? '')) === 'missing').length +
          orphanUnits.filter((unit) => !orphanKeyframes.some((keyframe) => Number(keyframe.content_unit_id) === unit.ID)).length,
        contentUnitRows: orphanContentUnitRows,
      })
    }

    const plotContentUnits = plotRows.reduce((sum, plot) => sum + plot.contentUnits, 0)
    const plotKeyframes = plotRows.reduce((sum, plot) => sum + plot.keyframes, 0)
    const gaps = plotRows.reduce((sum, plot) => sum + plot.gaps, 0)
    const durationSec = plotRows.reduce((sum, plot) => sum + plot.durationSec, 0)
    const readiness = clampProgress(
      Math.round(
        (plotRows.length > 0 ? 22 : 8) +
        (plotContentUnits > 0 ? 28 : 0) +
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
      contentUnits: plotContentUnits,
      keyframes: plotKeyframes,
      gaps,
      plotRows,
    }
  })
}

function buildPreviewTimelineContentUnits(record: WorkbenchRecord, data: ProductionWorkbenchData): PreviewTimelineContentUnit[] {
  const segmentIds = relatedSegmentIdsForWorkbenchProduction(record, data)
  const sceneMomentIds = relatedSceneMomentIdsForWorkbenchProduction(segmentIds, record, data)
  const units = contentUnitsForWorkbenchProduction(segmentIds, sceneMomentIds, record, data).sort(byOrder)
  const contentUnitIds = new Set(units.map((unit) => unit.ID))
  const assetSlots = assetSlotsForWorkbenchProduction(segmentIds, sceneMomentIds, contentUnitIds, record, data)
  const keyframes = keyframesForWorkbenchProduction(segmentIds, sceneMomentIds, contentUnitIds, record, data)
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
      ].filter(Boolean).join(' / ') || `制作项 #${unit.ID}`,
      duration: formatDuration(Number(unit.duration_sec) || 0),
      cameraPlan: cameraPlanSummary(unit) || firstText(unit.kind, '待补镜头参数'),
      status: missingSlots.length > 0 ? 'blocked' : unitKeyframes.length > 0 ? 'ready' : 'attention',
      assets: `${unitSlots.length} 个素材需求 · ${unitKeyframes.length} 个画面锚点${missingSlots.length > 0 ? ` · ${missingSlots.length} 个缺口` : ''}`,
      keyframes: unitKeyframes.length,
    }
  })
}

function buildPreviewAssetGaps(record: WorkbenchRecord, data: ProductionWorkbenchData): PreviewAssetGap[] {
  const segmentIds = relatedSegmentIdsForWorkbenchProduction(record, data)
  const sceneMomentIds = relatedSceneMomentIdsForWorkbenchProduction(segmentIds, record, data)
  const units = contentUnitsForWorkbenchProduction(segmentIds, sceneMomentIds, record, data)
  const unitIds = new Set(units.map((unit) => unit.ID))
  const slots = assetSlotsForWorkbenchProduction(segmentIds, sceneMomentIds, unitIds, record, data)
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
      owner: `制作项 · ${titleOfRecord(unit)}`,
      priority: unit.duration_sec && Number(unit.duration_sec) > 10 ? '中' : '低',
      impact: '影响最终质量',
      placeholder: '补充画面锚点后才能展开真实预览',
      detail: '当前制作项还没有可展示的开头、结尾等关键画面或预览记录。',
    })
  }

  return gaps.slice(0, 6)
}

function previewAssetSlotScopeLabel(slot: WorkbenchRecord, data: ProductionWorkbenchData) {
  if (slot.owner_type === 'content_unit' && slot.owner_id) {
    const unit = data.contentUnits.find((item) => item.ID === Number(slot.owner_id))
    return unit ? `制作项 · ${titleOfRecord(unit)}` : `制作项 #${slot.owner_id}`
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

function EmptyWorkbenchState({ title, text }: { title: string; text: string }) {
  return (
    <Card className="rounded-lg border-dashed border-border bg-card p-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{text}</p>
    </Card>
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
    description: '复用现有画布工作流来串联画面制作项、提示词、视觉锚点、视频候选、返工和正式输出。',
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
      route: { pathname: ROUTES.project.scripts },
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
      route: { pathname: ROUTES.project.scripts },
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
        pageRoute: ROUTES.project.scripts,
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
    { label: '进入编排', detail: '继续验证制作项、素材缺口和生成记录', done: false, active: hasStartedProduction, icon: Play },
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
              <span>方案 · 编排 · 生成</span>
            </div>
            <h1 className="mt-1 text-lg font-semibold text-foreground">一键制作</h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
              输入剧本、brief 或提示词，自动生成制作设定、素材需求线索和制作入口；确认后写入项目，并直接进入内容编排验证。
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
                    <p className="mt-1 text-xs text-muted-foreground">把分析藏到后台，把用户路径收敛成输入、确认、内容编排和生成。</p>
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
                  <p className="mt-1 text-xs text-muted-foreground">轻确认设定、素材线索和制作入口后，再让系统写入并进入内容编排。</p>
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
                      <Label className="mb-1 text-xs text-muted-foreground">制作摘要与编排意图</Label>
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
                <p className="mt-2 text-xs leading-5 text-foreground">进入内容编排工作台，继续检查制作项、预览挂载、素材缺口和生成记录。</p>
              </div>
              <Button size="sm" className="mt-3 w-full gap-1.5" onClick={() => navigate(ROUTES.project.contentUnitWorkbench)}>
                <Play size={13} />
                进入内容编排
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

export function WorkbenchContent({ initialCategory = 'production', showCategoryTabs = true }: WorkbenchContentProps) {
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
