import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  ClipboardCheck,
  Database,
  FileText,
  Film,
  GitBranch,
  Image,
  Layers,
  ListChecks,
  LockKeyhole,
  PackageCheck,
  Play,
  RefreshCw,
  Route,
  Settings2,
  ShieldCheck,
  SquareStack,
  Target,
  Upload,
  Users,
  Wand2,
} from 'lucide-react'

import ReferenceRelationsPage from '@/pages/reference-relations/ReferenceRelationsPage'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { Canvas, CanvasStage, Job } from '@/types'
import { Badge, Button, Card, Progress } from '@movscript/ui'
import {
  listSemanticEntities,
  semanticEntityConfig,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import {
  getWorkbenchSurface,
  workbenchSurfaces,
  type WorkbenchCategory,
} from '@/pages/project-workspace/structure'

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
      { id: 's3', title: '旧伞纸条滑落', subtitle: '剧本段落 3 · 建议拆成两个情景', status: 'review', priority: 'high', progress: 62 },
      { id: 's2', title: '巷口对峙', subtitle: '剧本段落 2 · 人物动机待确认', status: 'review', priority: 'medium', progress: 74 },
      { id: 's4', title: '顾言停步', subtitle: '剧本段落 4 · 低置信表达', status: 'blocked', priority: 'medium', progress: 35 },
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
      { label: '下游', value: '生成资料候选和素材缺口' },
      { label: '状态', value: '可进入预演决策', tone: 'success' },
    ],
    actions: ['确认为情景', '拆成两个情景', '忽略候选', '生成资料候选'],
  },
  preview: {
    queue: [
      { id: 'p2', title: '林夏雨中半身', subtitle: '剧本段落 02 · 关键帧待选', status: 'running', priority: 'high', progress: 72 },
      { id: 'p3', title: '纸条特写', subtitle: '剧本段落 03 · 缺旧伞素材', status: 'blocked', priority: 'high', progress: 38 },
      { id: 'p5', title: '巷口背影', subtitle: '剧本段落 05 · 时间线偏短', status: 'ready', priority: 'low', progress: 84 },
    ],
    evidenceTitle: '分镜脚本',
    evidence: [
      '01 雨夜全景 · 广角固定 · 4s',
      '02 林夏半身 · 中近景缓推 · 5s',
      '03 纸条特写 · 特写慢推 · 3s',
      '04 顾言停步 · 中景静止 · 4s',
    ],
    decisionTitle: '预演判断',
    decisions: [
      { label: '时长', value: '23s，目标 30s 仍偏短', tone: 'warning' },
      { label: '缺口', value: '剧本段落 03 缺旧伞素材', tone: 'warning' },
      { label: '关键帧', value: '剧本段落 02 候选 4 张' },
      { label: '建议', value: '先补素材，再确认分集预演' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '时间线', value: '第 1 版预演时间线' },
      { label: '任务', value: '2 个素材缺口，1 个关键帧选择' },
      { label: '状态', value: '部分剧本段落可生产', tone: 'success' },
    ],
    actions: ['采用当前分镜', '生成关键帧', '补素材缺口', '确认分集预演'],
  },
  creative: {
    queue: [
      { id: 'c1', title: '林夏', subtitle: '人物 · 表演克制程度待定', status: 'review', priority: 'high', progress: 58 },
      { id: 'c2', title: '破损旧伞', subtitle: '道具 · 影响纸条特写', status: 'blocked', priority: 'high', progress: 28 },
      { id: 'c3', title: '冷雨悬疑风格', subtitle: '风格 · 已可用于提示词', status: 'ready', priority: 'medium', progress: 92 },
    ],
    evidenceTitle: '资料证据',
    evidence: [
      '林夏需要保持克制，不是惊慌逃离。',
      '旧伞必须破损，伞骨内侧可以藏纸条。',
      '老城区窄巷需要低照度、潮湿墙面和坏路灯。',
    ],
    decisionTitle: '资料判断',
    decisions: [
      { label: '人物', value: '林夏状态需锁定', tone: 'warning' },
      { label: '道具', value: '旧伞是剧情证据，不是装饰' },
      { label: '风格', value: '低饱和、强反差、克制表演' },
      { label: '影响', value: '分镜、素材需求、关键帧一致性' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '资料卡', value: '人物、地点、道具、风格' },
      { label: '约束', value: '进入提示词和审核标准' },
      { label: '状态', value: '可进入素材准备', tone: 'success' },
    ],
    actions: ['确认资料', '标记缺口', '补充说明', '关联使用位置'],
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
      { id: 'variant-b', title: '剧本段落 02 人物停步', subtitle: '版本 B 待审', status: 'review', priority: 'high', progress: 61 },
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
      { label: '剧本段落', value: '正式段落 02' },
      { label: '记录', value: '采用版本和返工意见' },
      { label: '状态', value: '可进入交付门禁', tone: 'success' },
    ],
    actions: ['采用版本', '请求返工', '生成新版本', '创建人工任务'],
  },
  delivery: {
    queue: [
      { id: 'd3', title: '画面完整性', subtitle: '剧本段落 03 缺正式视频', status: 'blocked', priority: 'high', progress: 52 },
      { id: 'd2', title: '声音混音', subtitle: '雨声已生成，台词未混音', status: 'review', priority: 'medium', progress: 66 },
      { id: 'd4', title: '版权记录', subtitle: '字体授权待记录', status: 'blocked', priority: 'medium', progress: 40 },
    ],
    evidenceTitle: '交付检查',
    evidence: ['剧本段落 03 缺正式视频。', '第 2 段字幕未确认。', '台词未混音。', '字体授权待记录。'],
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
  description?: string
  content?: string
  prompt?: string
  prompt_hint?: string
  visual_intent?: string
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
  locked_asset_slot_id?: number
  slot_key?: string
  source_type?: string
  source_id?: number
  score?: number
  note?: string
  candidate_asset_slot_id?: number
  asset_slot_id?: number
  candidate_asset_slot?: WorkbenchRecord
}

interface AssetPrepData {
  slots: WorkbenchRecord[]
  candidates: WorkbenchRecord[]
  contentUnits: WorkbenchRecord[]
  segments: WorkbenchRecord[]
  sceneMoments: WorkbenchRecord[]
  creativeReferences: WorkbenchRecord[]
  keyframes: WorkbenchRecord[]
  jobs: Job[]
}

interface ProductionWorkbenchData {
  contentUnits: WorkbenchRecord[]
  assetSlots: WorkbenchRecord[]
  keyframes: WorkbenchRecord[]
  previewTimelineItems: WorkbenchRecord[]
  deliveryVersions: WorkbenchRecord[]
  jobs: Job[]
}

interface AssetPrepViewRow {
  id: string
  title: string
  scope: string
  status: WorkStatus
  priority: Priority
  need?: string
  progress: number
  slot: WorkbenchRecord
  candidates: WorkbenchRecord[]
  lockedSlot?: WorkbenchRecord
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

async function loadAssetPrepData(projectId: number): Promise<AssetPrepData> {
  const [slots, candidates, contentUnits, segments, sceneMoments, creativeReferences, keyframes, jobs] = await Promise.all([
    listSemanticEntities(projectId, semanticEntityConfig('assetSlots')),
    listSemanticEntities(projectId, semanticEntityConfig('assetSlotCandidates')),
    listSemanticEntities(projectId, semanticEntityConfig('contentUnits')),
    listSemanticEntities(projectId, semanticEntityConfig('segments')),
    listSemanticEntities(projectId, semanticEntityConfig('sceneMoments')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferences')),
    listSemanticEntities(projectId, semanticEntityConfig('keyframes')),
    loadWorkbenchJobs(projectId, ['image', 'image_edit']),
  ])
  return {
    slots: slots as WorkbenchRecord[],
    candidates: candidates as WorkbenchRecord[],
    contentUnits: contentUnits as WorkbenchRecord[],
    segments: segments as WorkbenchRecord[],
    sceneMoments: sceneMoments as WorkbenchRecord[],
    creativeReferences: creativeReferences as WorkbenchRecord[],
    keyframes: keyframes as WorkbenchRecord[],
    jobs,
  }
}

async function loadProductionWorkbenchData(projectId: number): Promise<ProductionWorkbenchData> {
  const [contentUnits, assetSlots, keyframes, previewTimelineItems, deliveryVersions, jobs] = await Promise.all([
    listSemanticEntities(projectId, semanticEntityConfig('contentUnits')),
    listSemanticEntities(projectId, semanticEntityConfig('assetSlots')),
    listSemanticEntities(projectId, semanticEntityConfig('keyframes')),
    listSemanticEntities(projectId, semanticEntityConfig('previewTimelineItems')),
    listSemanticEntities(projectId, semanticEntityConfig('deliveryVersions')),
    loadWorkbenchJobs(projectId, ['video', 'video_i2v', 'video_v2v']),
  ])
  return {
    contentUnits: contentUnits as WorkbenchRecord[],
    assetSlots: assetSlots as WorkbenchRecord[],
    keyframes: keyframes as WorkbenchRecord[],
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

function buildAssetPrepRows(data?: AssetPrepData): AssetPrepViewRow[] {
  if (!data) return []
  const slotById = new Map(data.slots.map((slot) => [slot.ID, slot]))
  const visibleSlots = data.slots.filter((slot) => slot.owner_type !== 'asset_slot')
  return visibleSlots
    .map((slot) => {
      const candidates = data.candidates
        .filter((candidate) => Number(candidate.asset_slot_id) === slot.ID)
        .map((candidate) => ({
          ...candidate,
          candidate_asset_slot: candidate.candidate_asset_slot ?? (candidate.candidate_asset_slot_id ? slotById.get(Number(candidate.candidate_asset_slot_id)) : undefined),
        }))
      const lockedSlot = slot.locked_asset_slot_id ? slotById.get(Number(slot.locked_asset_slot_id)) : undefined
      return {
        id: String(slot.ID),
        title: titleOfRecord(slot),
        scope: assetSlotScopeLabel(slot, data),
        status: assetSlotWorkStatus(slot, candidates),
        priority: priorityFromRecord(slot.priority),
        need: firstText(slot.description, slot.prompt_hint, slot.slot_key, slot.kind),
        progress: assetSlotProgress(slot, candidates, lockedSlot),
        slot,
        candidates,
        lockedSlot,
      }
    })
    .sort((a, b) => workStatusRank(a.status) - workStatusRank(b.status) || priorityRank(b.priority) - priorityRank(a.priority) || b.slot.ID - a.slot.ID)
}

function buildContentGenerationRows(data?: ProductionWorkbenchData): ContentGenerationViewRow[] {
  if (!data) return []
  const visibleAssetSlots = data.assetSlots.filter((slot) => slot.owner_type !== 'asset_slot')
  return data.contentUnits
    .map((unit) => {
      const keyframeIds = new Set(data.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID).map((keyframe) => keyframe.ID))
      const assetSlots = visibleAssetSlots.filter((slot) => (
        (slot.owner_type === 'content_unit' && Number(slot.owner_id) === unit.ID) ||
        (slot.owner_type === 'keyframe' && slot.owner_id ? keyframeIds.has(Number(slot.owner_id)) : false)
      ))
      const missingSlots = assetSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
      const keyframes = data.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID)
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

function buildAssetMetrics(rows: AssetPrepViewRow[], data?: AssetPrepData): WorkbenchMetric[] {
  const activeJobs = data?.jobs.filter((job) => job.status === 'pending' || job.status === 'running').length ?? 0
  return [
    { label: '素材缺口', value: String(rows.length), detail: '来自内容区素材需求', icon: PackageCheck, status: rows.some((row) => row.status === 'blocked') ? 'blocked' : 'ready' },
    { label: '候选素材', value: String(data?.candidates.length ?? 0), detail: 'asset-slot-candidates', icon: SquareStack, status: (data?.candidates.length ?? 0) > 0 ? 'review' : 'blocked' },
    { label: '已锁定', value: String(rows.filter((row) => normalizeAssetSlotStatus(row.slot.status) === 'locked').length), detail: '可进入关键帧或制作项生成', icon: LockKeyhole, status: 'ready' },
    { label: '生成任务', value: String(activeJobs), detail: '当前项目图片任务', icon: RefreshCw, status: activeJobs > 0 ? 'running' : 'ready' },
  ]
}

function buildProductionMetrics(rows: ContentGenerationViewRow[], data?: ProductionWorkbenchData): WorkbenchMetric[] {
  const runningJobs = data?.jobs.filter((job) => job.status === 'pending' || job.status === 'running').length ?? 0
  const succeededJobs = data?.jobs.filter((job) => job.status === 'succeeded').length ?? 0
  return [
    { label: '制作项', value: String(rows.length), detail: 'content-units', icon: Boxes, status: rows.length > 0 ? 'review' : 'blocked' },
    { label: '可生成', value: String(rows.filter((row) => row.missingSlots.length === 0 && firstText(row.unit.prompt, row.unit.description)).length), detail: '素材和提示已具备', icon: CheckCircle2, status: 'ready' },
    { label: '阻塞镜头', value: String(rows.filter((row) => row.status === 'blocked').length), detail: '存在 missing 素材需求', icon: AlertTriangle, status: rows.some((row) => row.status === 'blocked') ? 'blocked' : 'ready' },
    { label: '视频任务', value: String(runningJobs || succeededJobs), detail: runningJobs > 0 ? '有任务运行中' : '已完成任务', icon: Film, status: runningJobs > 0 ? 'running' : succeededJobs > 0 ? 'ready' : 'review' },
  ]
}

function buildAssetContext(row: AssetPrepViewRow | null, data?: AssetPrepData): WorkbenchLinkRow[] {
  if (!row) return []
  const slot = row.slot
  return [
    { label: '素材需求', value: `${assetKindLabel(slot.kind)} / ${assetPriorityLabel(slot.priority)} / ${assetStatusLabel(slot.status)}`, icon: PackageCheck },
    { label: '归属上下文', value: assetSlotScopeLabel(slot, data), icon: GitBranch },
    { label: '用途说明', value: firstText(slot.description, slot.prompt_hint, '未填写用途或提示'), icon: FileText },
    { label: '锁定输出', value: row.lockedSlot ? titleOfRecord(row.lockedSlot) : slot.resource_id ? `资源 #${slot.resource_id}` : '尚未锁定素材', icon: LockKeyhole },
  ]
}

function buildAssetStandards(row: AssetPrepViewRow | null): WorkbenchGate[] {
  if (!row) return []
  const slot = row.slot
  const hasOwner = Boolean(slot.owner_type && slot.owner_id) || Boolean(slot.creative_reference_id)
  const hasBrief = Boolean(firstText(slot.description, slot.prompt_hint))
  const hasCandidate = row.candidates.length > 0 || Boolean(row.lockedSlot || slot.resource_id)
  const isLocked = normalizeAssetSlotStatus(slot.status) === 'locked' || Boolean(row.lockedSlot || slot.resource_id)
  return [
    { label: '归属明确', detail: hasOwner ? '已绑定内容、情景或资料上下文' : '需要绑定 owner 或设定资料来源', done: hasOwner, tone: hasOwner ? 'success' : 'warning' },
    { label: '用途/提示完整', detail: hasBrief ? '已有用途说明或生成提示' : '需要补充 description 或 prompt_hint', done: hasBrief, tone: hasBrief ? 'success' : 'warning' },
    { label: '候选可比较', detail: hasCandidate ? `${row.candidates.length} 个候选 / ${row.lockedSlot || slot.resource_id ? '已有锁定引用' : '待锁定'}` : '需要上传、生成或关联候选素材', done: hasCandidate, tone: hasCandidate ? 'success' : 'warning' },
    { label: '输出可写回', detail: isLocked ? '已具备资源或锁定素材需求' : '采用前仍不能进入下游生成', done: isLocked, tone: isLocked ? 'success' : 'warning' },
  ]
}

function buildAssetCandidateRows(row: AssetPrepViewRow | null) {
  if (!row) return []
  const candidateRows = row.candidates.map((candidate) => {
    const candidateSlot = candidate.candidate_asset_slot
    return {
      name: candidateSlot ? titleOfRecord(candidateSlot) : `候选 #${candidate.ID}`,
      source: [candidate.source_type || 'manual', candidate.source_id ? `#${candidate.source_id}` : null].filter(Boolean).join(' '),
      fit: candidate.score ? `评分 ${candidate.score}` : firstText(candidateSlot?.description, candidateSlot?.prompt_hint, candidateSlot?.status, '未填写说明'),
      issue: firstText(candidate.note, candidateSlot?.prompt_hint, candidate.status, '待人工复核'),
      status: candidate.status === 'selected' ? 'ready' as WorkStatus : candidate.status === 'rejected' ? 'blocked' as WorkStatus : 'review' as WorkStatus,
    }
  })
  if (candidateRows.length === 0 && row.lockedSlot) {
    return [{
      name: titleOfRecord(row.lockedSlot),
      source: 'locked_asset_slot',
      fit: firstText(row.lockedSlot.description, row.lockedSlot.prompt_hint, '已锁定素材'),
      issue: '已作为当前素材需求输出',
      status: 'ready' as WorkStatus,
    }]
  }
  return candidateRows
}

function buildProductionContext(row: ContentGenerationViewRow | null): WorkbenchLinkRow[] {
  if (!row) return []
  const unit = row.unit
  return [
    { label: '内容目标', value: firstText(unit.description, unit.prompt, titleOfRecord(unit)), icon: Target },
    { label: '关键帧', value: row.keyframes.length > 0 ? `${row.keyframes.length} 个关键帧：${row.keyframes.slice(0, 2).map(titleOfRecord).join('、')}` : '尚未绑定关键帧', icon: Image },
    { label: '素材输入', value: `${row.assetSlots.length} 个素材需求，${row.missingSlots.length} 个缺口`, icon: PackageCheck },
    { label: '生成设置', value: `${unit.kind || '制作项'} / ${formatDuration(unit.duration_sec)} / ${unit.production_id ? `分集 #${unit.production_id}` : '未绑定分集'}`, icon: Settings2 },
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
    { label: '素材输入可用', detail: assetsReady ? '没有 missing 素材需求' : `${row.missingSlots.length} 个素材缺口阻塞`, done: assetsReady, tone: assetsReady ? 'success' : 'warning' },
    { label: '关键帧具备', detail: hasKeyframe ? `${row.keyframes.length} 个关键帧可用` : '建议先生成或绑定关键帧', done: hasKeyframe, tone: hasKeyframe ? 'success' : 'warning' },
    { label: '生成记录可追溯', detail: hasJob ? '已有项目生成任务或内容已锁定' : '还没有当前项目的视频生成任务', done: hasJob, tone: hasJob ? 'success' : 'warning' },
  ]
}

function buildProductionCandidateRows(jobs: Job[]) {
  return jobs.slice(0, 6).map((job) => ({
    name: `任务 #${job.ID} · ${job.job_type}`,
    source: firstText(job.model_display, job.provider_name, job.model_identifier, `模型 #${job.model_config_id}`),
    fit: job.output_resource_id ? `输出资源 #${job.output_resource_id}` : job.status === 'succeeded' ? '已完成' : job.status,
    issue: firstText(job.error_msg, trimText(job.prompt, 36), job.feature_key, '无提示词'),
    status: jobToWorkStatus(job),
  }))
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
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

function normalizeAssetSlotStatus(status?: string) {
  if (status === 'candidate' || status === 'locked' || status === 'waived') return status
  return 'missing'
}

function assetSlotWorkStatus(slot: WorkbenchRecord, candidates: WorkbenchRecord[]): WorkStatus {
  const status = normalizeAssetSlotStatus(slot.status)
  if (status === 'locked' || status === 'waived') return 'ready'
  if (status === 'candidate' || candidates.length > 0) return 'review'
  return 'blocked'
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

function assetSlotScopeLabel(slot: WorkbenchRecord, data?: AssetPrepData) {
  if (slot.owner_type === 'content_unit' && slot.owner_id) {
    const unit = data?.contentUnits.find((item) => item.ID === Number(slot.owner_id))
    return unit ? `制作项 · ${titleOfRecord(unit)}` : `制作项 #${slot.owner_id}`
  }
  if (slot.owner_type === 'scene_moment' && slot.owner_id) {
    const moment = data?.sceneMoments.find((item) => item.ID === Number(slot.owner_id))
    return moment ? `情景 · ${titleOfRecord(moment)}` : `情景 #${slot.owner_id}`
  }
  if (slot.owner_type === 'segment' && slot.owner_id) {
    const segment = data?.segments.find((item) => item.ID === Number(slot.owner_id))
    return segment ? `剧本段落 · ${titleOfRecord(segment)}` : `剧本段落 #${slot.owner_id}`
  }
  if (slot.creative_reference_id) {
    const reference = data?.creativeReferences.find((item) => item.ID === Number(slot.creative_reference_id))
    return reference ? `设定资料 · ${titleOfRecord(reference)}` : `设定资料 #${slot.creative_reference_id}`
  }
  if (slot.owner_type && slot.owner_id) return `${slot.owner_type} #${slot.owner_id}`
  if (slot.production_id) return `分集 #${slot.production_id}`
  return '项目素材需求'
}

function contentUnitScopeLabel(unit: WorkbenchRecord, keyframes: WorkbenchRecord[], missingSlots: WorkbenchRecord[]) {
  const parts = [
    unit.kind || '制作项',
    formatDuration(unit.duration_sec),
    keyframes.length > 0 ? `关键帧 ${keyframes.length}` : '无关键帧',
    missingSlots.length > 0 ? `缺素材 ${missingSlots.length}` : '素材可用',
  ]
  return parts.join(' / ')
}

function jobToWorkStatus(job: Job): WorkStatus {
  if (job.status === 'pending' || job.status === 'running') return 'running'
  if (job.status === 'succeeded') return 'ready'
  if (job.status === 'failed' || job.status === 'cancelled') return 'blocked'
  return 'review'
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

function WorkbenchPanel({ title, icon: Icon, children, action }: { title: string; icon: typeof FileText; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={16} className="shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function SpecializedQueue({
  items,
  selectedId,
  onSelect,
}: {
  items: Array<{ id: string; title: string; scope: string; status: WorkStatus; priority: Priority; progress: number; need?: string }>
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <WorkbenchPanel title="生产队列" icon={ListChecks} action={<Badge variant="secondary">{items.length}</Badge>}>
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
            <p className="mt-1 truncate text-xs text-muted-foreground">{item.scope}</p>
            {item.need ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.need}</p> : null}
            <div className="mt-3 flex items-center gap-2">
              <Badge variant={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'outline'}>{priorityLabel(item.priority)}</Badge>
              <Progress value={item.progress} className="h-1.5" />
            </div>
          </button>
        ))}
      </div>
    </WorkbenchPanel>
  )
}

function ContextStack({ rows }: { rows: WorkbenchLinkRow[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
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
}: {
  rows: Array<{ name: string; source: string; fit: string; issue: string; status: WorkStatus }>
  primaryLabel: string
  emptyText?: string
}) {
  if (rows.length === 0) {
    return <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.name} className="grid gap-3 rounded-md border border-border bg-background px-3 py-3 md:grid-cols-[1fr_1fr_1fr_auto]">
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

function AssetPreparationWorkbench() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workbench', 'assets', projectId],
    queryFn: () => loadAssetPrepData(projectId!),
    enabled: !!projectId,
  })
  const rows = useMemo(() => buildAssetPrepRows(data), [data])
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    if (rows.length === 0) {
      if (selectedId) setSelectedId('')
      return
    }
    if (!selectedId || !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0].id)
    }
  }, [rows, selectedId])

  const selected = rows.find((item) => item.id === selectedId) ?? rows[0] ?? null
  const metrics = buildAssetMetrics(rows, data)
  const candidateRows = buildAssetCandidateRows(selected)
  const standards = buildAssetStandards(selected)
  const contextRows = buildAssetContext(selected, data)
  const openAssetCanvas = useMutation({
    mutationFn: async (row: AssetPrepViewRow) => {
      if (!projectId) throw new Error('请先选择项目')
      return api.post('/canvases', {
        name: `${titleOfRecord(row.slot)} · 素材准备画布`,
        project_id: projectId,
        canvas_type: 'inspiration',
        stage: 'asset_prep',
        ref_type: 'asset_slot',
        ref_id: row.slot.ID,
      }).then((r) => r.data as Canvas)
    },
    onSuccess: (canvas) => navigate(`/canvases/${canvas.ID}`),
  })

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <SpecializedWorkbenchHeader
        category="assets"
        kicker="素材准备"
        title="素材准备工作台"
        description="从素材缺口出发，把剧本证据、资料约束、参考输入和验收标准放在同一个生产界面里。"
      />
      <main className="min-h-0 flex-1 overflow-auto p-5">
        {!projectId ? (
          <EmptyWorkbenchState title="请先选择项目" text="当前没有可用的项目上下文，无法拉取素材需求、候选和生成任务。" />
        ) : isLoading ? (
          <Card className="rounded-lg border-border bg-card p-8 text-center text-sm text-muted-foreground">正在加载素材数据...</Card>
        ) : isError ? (
          <EmptyWorkbenchState title="素材数据加载失败" text="后端语义实体接口未返回可用数据，稍后重试。 " />
        ) : (
          <div className="space-y-5">
            <MetricStrip metrics={metrics} />
            <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
              <SpecializedQueue
                items={rows.map((row) => ({
                  id: row.id,
                  title: row.title,
                  scope: row.scope,
                  status: row.status,
                  priority: row.priority,
                  progress: row.progress,
                  need: row.need,
                }))}
                selectedId={selected?.id ?? ''}
                onSelect={setSelectedId}
              />
              <div className="min-w-0 space-y-5">
                <WorkbenchPanel title="当前素材上下文" icon={GitBranch}>
                  {selected ? (
                    <>
                      <div className="mb-4 flex items-start justify-between gap-4 rounded-md border border-border bg-background p-3">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">正在准备</p>
                          <h2 className="mt-1 truncate text-xl font-semibold text-foreground">{selected.title}</h2>
                          <p className="mt-1 truncate text-sm text-muted-foreground">{selected.scope}</p>
                        </div>
                        <Badge variant={statusVariant(selected.status)}>{statusLabel(selected.status)}</Badge>
                      </div>
                      <ContextStack rows={contextRows} />
                    </>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">暂无素材需求</p>
                  )}
                </WorkbenchPanel>

                <WorkbenchPanel title="参考输入与候选素材" icon={SquareStack} action={<Badge variant="outline">{candidateRows.length} 个候选</Badge>}>
                  <CandidateComparison rows={candidateRows} primaryLabel="可用性" emptyText="当前素材需求还没有候选素材" />
                </WorkbenchPanel>
              </div>
              <div className="min-w-0 space-y-5">
                <WorkbenchPanel title="素材验收标准" icon={ShieldCheck}>
                  <GateChecklist rows={standards} />
                </WorkbenchPanel>
                <WorkbenchPanel title="下一步动作" icon={ClipboardCheck}>
                  <div className="space-y-2">
                    {assetPrepNextActions(selected).map((action, index) => (
                      <Button key={action.label} variant={action.primary ? 'primary' : 'outline'} className="w-full justify-start gap-2" onClick={() => action.run()} loading={action.loading}>
                        {index === 2 ? <LockKeyhole size={15} /> : <ChevronRight size={15} />}
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </WorkbenchPanel>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )

  function assetPrepNextActions(row: AssetPrepViewRow | null) {
    const slotId = row?.slot.ID
    return [
      { label: '上传参考图', run: () => navigate('/resources'), primary: false },
      { label: '生成补充候选', run: () => row ? openAssetCanvas.mutate(row) : navigate('/asset-slots'), primary: !row?.candidates.length, loading: openAssetCanvas.isPending },
      { label: '采用并锁定素材', run: () => navigate(slotId ? `/asset-slots?asset_slot_id=${slotId}` : '/asset-slots'), primary: Boolean(row?.candidates.length) && normalizeAssetSlotStatus(row?.slot.status) !== 'locked' },
      { label: '写回资源库', run: () => navigate('/resources'), primary: false },
    ]
  }
}

function ContentGenerationWorkbench() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workbench', 'production', projectId],
    queryFn: () => loadProductionWorkbenchData(projectId!),
    enabled: !!projectId,
  })
  const rows = useMemo(() => buildContentGenerationRows(data), [data])
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    if (rows.length === 0) {
      if (selectedId) setSelectedId('')
      return
    }
    if (!selectedId || !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0].id)
    }
  }, [rows, selectedId])

  const selected = rows.find((item) => item.id === selectedId) ?? rows[0] ?? null
  const metrics = buildProductionMetrics(rows, data)
  const candidateRows = buildProductionCandidateRows(data?.jobs ?? [])
  const standards = buildProductionStandards(selected, data?.jobs ?? [])
  const contextRows = buildProductionContext(selected)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <SpecializedWorkbenchHeader
        category="production"
        generationKind="production"
        kicker="制作项生成"
        title="制作项生成工作台"
        description="围绕制作项组织输入完整性、生成上下文、候选版本、返工意见和正式输出。"
      />
      <main className="min-h-0 flex-1 overflow-auto p-5">
        {!projectId ? (
          <EmptyWorkbenchState title="请先选择项目" text="当前没有可用的项目上下文，无法拉取制作项、素材需求和生成任务。" />
        ) : isLoading ? (
          <Card className="rounded-lg border-border bg-card p-8 text-center text-sm text-muted-foreground">正在加载制作项生成数据...</Card>
        ) : isError ? (
          <EmptyWorkbenchState title="制作项生成数据加载失败" text="后端语义实体接口未返回可用数据，稍后重试。" />
        ) : (
          <div className="space-y-5">
            <MetricStrip metrics={metrics} />
            <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
              <SpecializedQueue
                items={rows.map((row) => ({
                  id: row.id,
                  title: row.title,
                  scope: row.scope,
                  status: row.status,
                  priority: row.priority,
                  progress: row.progress,
                  need: row.missingSlots.length > 0 ? `${row.missingSlots.length} 个素材缺口` : firstText(row.unit.description, row.unit.prompt, '素材已齐备'),
                }))}
                selectedId={selected?.id ?? ''}
                onSelect={setSelectedId}
              />
              <div className="min-w-0 space-y-5">
                <WorkbenchPanel title="生成上下文" icon={Layers}>
                  {selected ? (
                    <>
                      <div className="mb-4 grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-[1fr_auto]">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">当前制作项</p>
                          <h2 className="mt-1 truncate text-xl font-semibold text-foreground">{selected.title}</h2>
                          <p className="mt-1 truncate text-sm text-muted-foreground">{selected.scope}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusVariant(selected.status)}>{statusLabel(selected.status)}</Badge>
                          <Badge variant="outline">准备度 {selected.progress}%</Badge>
                        </div>
                      </div>
                      <ContextStack rows={contextRows} />
                    </>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">暂无制作项</p>
                  )}
                </WorkbenchPanel>

                <WorkbenchPanel title="候选版本对比" icon={Play} action={<Badge variant="secondary">{candidateRows.length > 0 ? '最新任务' : '暂无任务'}</Badge>}>
                  <CandidateComparison rows={candidateRows} primaryLabel="优势" emptyText="当前项目还没有视频生成任务" />
                </WorkbenchPanel>
              </div>
              <div className="min-w-0 space-y-5">
                <WorkbenchPanel title="采用门禁" icon={ShieldCheck}>
                  <GateChecklist rows={standards} />
                </WorkbenchPanel>
                <WorkbenchPanel title="生成与审核动作" icon={Settings2}>
                  <div className="space-y-2">
                    {['生成新版本', '采用版本 B', '请求返工', '创建人工任务'].map((action, index) => (
                      <Button key={action} variant={index === 1 ? 'primary' : 'outline'} className="w-full justify-start gap-2">
                        {index === 1 ? <CheckCircle2 size={15} /> : <ChevronRight size={15} />}
                        {action}
                      </Button>
                    ))}
                  </div>
                </WorkbenchPanel>
              </div>
            </div>
          </div>
        )}
      </main>
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
  moments: number
  units: number
  gaps: number
}

interface PreviewTimelineShot {
  id: string
  title: string
  source: string
  duration: string
  camera: string
  status: PreviewPlanStatus
  assets: string
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

interface PreviewAssetGap {
  name: string
  owner: string
  priority: '高' | '中'
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

const previewPlanSegments: PreviewPlanSegment[] = [
  { id: 'seg-01', title: '雨夜巷口进入', subtitle: '剧本段落 01 / 开场环境', status: 'ready', readiness: 86, duration: '12s', moments: 2, units: 4, gaps: 0 },
  { id: 'seg-02', title: '旧伞纸条滑落', subtitle: '剧本段落 02 / 剧情证据', status: 'blocked', readiness: 52, duration: '11s', moments: 2, units: 3, gaps: 2 },
  { id: 'seg-03', title: '顾言停步对峙', subtitle: '剧本段落 03 / 情绪转折', status: 'attention', readiness: 68, duration: '9s', moments: 1, units: 3, gaps: 1 },
  { id: 'seg-04', title: '纸条被雨水浸湿', subtitle: '剧本段落 04 / 细节收束', status: 'draft', readiness: 34, duration: '6s', moments: 1, units: 2, gaps: 3 },
]

const previewTimelineShots: PreviewTimelineShot[] = [
  { id: 'cu-01', title: '巷口远景建立雨夜空间', source: '剧本段落 01 / 情景 01', duration: '4s', camera: '广角固定', status: 'ready', assets: '场景、雨夜风格已齐' },
  { id: 'cu-02', title: '林夏撑旧伞进入画面', source: '剧本段落 01 / 情景 02', duration: '5s', camera: '中景缓推', status: 'ready', assets: '人物状态已锁定' },
  { id: 'cu-03', title: '旧伞伞骨内侧露出纸条', source: '剧本段落 02 / 情景 03', duration: '3s', camera: '特写慢推', status: 'blocked', assets: '缺旧伞特写素材' },
  { id: 'cu-04', title: '顾言停步看向纸条', source: '剧本段落 03 / 情景 04', duration: '4s', camera: '中近景静止', status: 'attention', assets: '表演状态待确认' },
  { id: 'cu-05', title: '雨水打湿纸条文字', source: '剧本段落 04 / 情景 05', duration: '3s', camera: '微距俯拍', status: 'draft', assets: '缺纸条与雨滴参考' },
]

const previewGates: PreviewGateRow[] = [
  { label: '结构完整', detail: '4 个剧本段落 / 6 个情景 / 12 个制作项', done: true },
  { label: '关键帧可选', detail: '8 个候选，3 个待确认', done: true },
  { label: '素材缺口收敛', detail: '仍有 6 个素材缺口', done: false },
  { label: '时间线可生产', detail: '38s / 目标 45s，节奏偏短', done: false },
]

const previewWorkTasks: PreviewWorkTask[] = [
  {
    id: 'task-01',
    title: '验证旧伞纸条桥段是否成立',
    scope: '剧本段落 02 / 情景 03',
    status: 'running',
    priority: 'high',
    progress: 58,
    method: '低清关键帧 + 粗剪时间线',
    output: '判断是否继续投入正式制作',
    blocker: '纸条特写缺可信占位素材',
  },
  {
    id: 'task-02',
    title: '生成旧伞和纸条占位素材',
    scope: '素材需求 / CU-03',
    status: 'blocked',
    priority: 'high',
    progress: 32,
    method: '低成本生图',
    output: '替代正式道具参考进入预演',
    blocker: '伞骨藏纸条的结构还不清楚',
  },
  {
    id: 'task-03',
    title: '挑选顾言停步关键帧',
    scope: '关键帧候选 / CU-04',
    status: 'review',
    priority: 'medium',
    progress: 74,
    method: '候选图评审',
    output: '锁定情绪转折的视觉锚点',
  },
  {
    id: 'task-04',
    title: '补一版 45 秒节奏粗预演',
    scope: 'Preview v1 / 全片段',
    status: 'ready',
    priority: 'low',
    progress: 84,
    method: '占位图 + 临时字幕',
    output: '确认节奏是否值得进入制作',
  },
]

const previewMissingAssets: PreviewAssetGap[] = [
  { name: '破损旧伞特写', owner: 'CU-03', priority: '高', impact: '影响判断', placeholder: '可先生成低清道具图', detail: '伞骨内侧需要能解释纸条藏匿位置，否则桥段无法判断。' },
  { name: '顾言雨夜表演状态', owner: 'CU-04', priority: '中', impact: '影响最终质量', placeholder: '可用临时人物状态帧', detail: '需要克制、迟疑，不是惊讶或愤怒。' },
  { name: '被雨水打湿的纸条', owner: 'CU-05', priority: '高', impact: '影响判断', placeholder: '可先生成文字可读的占位图', detail: '文字需要可读，同时保留被雨水破坏的质感。' },
]

const previewValueChecks = [
  { label: '剧情钩子', value: '基本成立', detail: '旧伞和纸条能形成可视化证据。', status: 'ready' as WorkStatus },
  { label: '画面可生成性', value: '有风险', detail: '伞骨藏纸条的细节需要占位验证。', status: 'blocked' as WorkStatus },
  { label: '节奏判断', value: '偏短', detail: '38s 版本信息够用，但情绪停顿不足。', status: 'review' as WorkStatus },
]

const previewScriptEvidence = [
  '林夏撑着破损旧伞走进雨夜巷口，雨水沿着伞骨滴落。',
  '纸条从伞骨夹缝里滑出，被雨水打湿。',
  '顾言看见纸条后停步，情绪变化需要克制而不是爆发。',
]

const previewRunSignals: PreviewRunSignal[] = [
  { label: '结构顺序', value: '4 段可串联', detail: '从进入、证据、对峙到细节收束，叙事链条完整。', status: 'ready' },
  { label: '当前卡点', value: '旧伞纸条', detail: '道具细节解释不足，会影响桥段是否可信。', status: 'blocked' },
  { label: '节奏状态', value: '偏短 7s', detail: '情绪停顿不足，需要补一版 45 秒粗预演。', status: 'attention' },
]

function ProductionPreviewWorkspace() {
  const navigate = useNavigate()
  const [showAllTasks, setShowAllTasks] = useState(false)
  const selectedSegment = previewPlanSegments[1]
  const selectedTask = previewWorkTasks[0]
  const activeTasks = showAllTasks ? previewWorkTasks : previewWorkTasks.filter((task) => ['running', 'blocked', 'review'].includes(task.status)).slice(0, 3)
  const criticalGaps = previewMissingAssets.filter((asset) => asset.impact === '影响判断').length

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <SpecializedWorkbenchHeader
        category="preview"
        kicker="分集编排验证"
        title="分集预演"
        description="基于分集编排的结构全览，检查片段是否跑通，再处理关键帧、占位素材和制作判断。"
      />
      <main className="min-h-0 flex-1 overflow-auto p-5">
        <div className="space-y-5">
          <MetricStrip
            metrics={[
              { label: '编排覆盖', value: '4 段', detail: '剧本段落、情景和制作项已串联', icon: Route, status: 'ready' },
              { label: '可粗看内容', value: '7/12', detail: '已有关键帧或占位素材', icon: Boxes, status: 'ready' },
              { label: '判断阻塞', value: String(criticalGaps), detail: '会影响是否继续制作', icon: AlertTriangle, status: 'blocked' },
              { label: '粗预演时长', value: '38s', detail: '目标 45s，仍需补节奏', icon: Clock3, status: 'review' },
            ]}
          />

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-5">
              <section className="rounded-lg border border-border bg-card">
                <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">全览态</Badge>
                      <Badge variant={previewStatusVariant(selectedSegment.status)}>{previewStatusLabel(selectedSegment.status)}</Badge>
                    </div>
                    <h2 className="mt-2 truncate text-xl font-semibold text-foreground">本集预演全览</h2>
                    <p className="mt-1 text-sm text-muted-foreground">先看整集结构是否跑通，再聚焦“{selectedSegment.title}”的当前风险。</p>
                  </div>
                  <div className="w-36 shrink-0">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">全局可判断</span>
                      <span className="font-medium text-foreground">68%</span>
                    </div>
                    <Progress value={68} className="h-2" />
                  </div>
                </div>

                <div className="border-b border-border p-4">
                  <div className="grid gap-3 lg:grid-cols-4">
                    {previewPlanSegments.map((segment, index) => (
                      <PreviewOverviewNode key={segment.id} segment={segment} index={index} selected={segment.id === selectedSegment.id} />
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    {previewRunSignals.map((signal) => (
                      <PreviewRunSignalCard key={signal.label} signal={signal} />
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="min-w-0">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <GitBranch size={16} className="text-muted-foreground" />
                        <h3 className="text-sm font-semibold text-foreground">粗预演时间线</h3>
                      </div>
                      <Badge variant="outline">{previewTimelineShots.length} 个验证颗粒</Badge>
                    </div>
                    <div className="space-y-2">
                      {previewTimelineShots.map((shot, index) => (
                        <PreviewTimelineRow key={shot.id} shot={shot} index={index} />
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-md border border-border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <Play size={15} className="text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">低清预演</h3>
                    </div>
                    <div className="mt-3 aspect-video overflow-hidden rounded-md border border-border bg-zinc-950">
                      <div className="flex h-full flex-col justify-between p-3">
                        <div className="flex items-center justify-between text-[11px] text-zinc-300">
                          <span>Low-fi v1</span>
                          <span>00:14 / 00:38</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <span className="h-10 rounded-sm bg-cyan-400/70" />
                          <span className="h-10 rounded-sm bg-emerald-300/60" />
                          <span className="h-10 rounded-sm bg-amber-300/70" />
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-700">
                          <div className="h-full w-[38%] rounded-full bg-primary" />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button size="sm" className="justify-center gap-2">
                        <Play size={14} />
                        粗看
                      </Button>
                      <Button size="sm" variant="outline" className="justify-center gap-2">
                        <RefreshCw size={14} />
                        再生成
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <WorkbenchPanel title="当前节点详情" icon={Target} action={<Badge variant={previewStatusVariant(selectedSegment.status)}>{selectedSegment.title}</Badge>}>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
                    <div className="min-w-0">
                      <div className="rounded-md border border-border bg-background px-3 py-3">
                        <p className="text-xs text-muted-foreground">验证问题</p>
                        <p className="mt-1 text-sm font-medium leading-6 text-foreground">纸条滑落是否能形成足够强的剧情钩子，并且能被镜头解释清楚。</p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {previewScriptEvidence.map((row) => (
                          <p key={row} className="rounded border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">{row}</p>
                        ))}
                      </div>
                    </div>
                    <ContextStack
                      rows={[
                        { label: '低质产出', value: '3 张关键帧、1 条 38 秒粗剪、2 个占位素材', icon: Wand2 },
                        { label: '当前处理', value: selectedTask.title, icon: ClipboardCheck },
                      ]}
                    />
                  </div>
                </WorkbenchPanel>

                <WorkbenchPanel title="低质关键帧候选" icon={Image} action={<Badge variant="outline">8 张</Badge>}>
                  <div className="grid grid-cols-2 gap-3">
                    {['林夏雨中半身', '旧伞纸条特写', '顾言停步', '雨水浸湿纸条'].map((title, index) => (
                      <div key={title} className="rounded-md border border-border bg-background p-2">
                        <div className={cn(
                          'aspect-video rounded border border-border',
                          index === 0 ? 'bg-cyan-500/20' : index === 1 ? 'bg-amber-500/20' : index === 2 ? 'bg-emerald-500/20' : 'bg-rose-500/15',
                        )} />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-foreground">{title}</p>
                          <Badge variant={index === 1 || index === 3 ? 'warning' : 'success'} className="text-[10px]">
                            {index === 1 || index === 3 ? '待选' : '可用'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </WorkbenchPanel>
              </div>
            </div>

            <div className="min-w-0 space-y-5">
              <WorkbenchPanel title="当前处理" icon={ListChecks} action={<Badge variant="secondary">{activeTasks.length}</Badge>}>
                <div className="mb-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-3">
                  <p className="text-xs text-muted-foreground">本轮目标</p>
                  <p className="mt-1 text-sm font-medium leading-6 text-foreground">用低成本画面判断“旧伞纸条滑落”是否值得进入正式视频制作。</p>
                </div>
                <div className="space-y-2">
                  {activeTasks.map((task) => (
                    <PreviewWorkTaskCard key={task.id} task={task} selected={task.id === selectedTask.id} compact />
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-3 w-full justify-center gap-2" onClick={() => setShowAllTasks((value) => !value)}>
                  <ListChecks size={14} />
                  {showAllTasks ? '收起清单' : '展开完整清单'}
                </Button>
              </WorkbenchPanel>

              <WorkbenchPanel title="制作价值判断" icon={ShieldCheck} action={<Badge variant="warning">待定</Badge>}>
                <div className="space-y-2">
                  {previewValueChecks.map((check) => (
                    <div key={check.label} className="rounded-md border border-border bg-background px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{check.label}</p>
                        <Badge variant={statusVariant(check.status)}>{check.value}</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{check.detail}</p>
                    </div>
                  ))}
                </div>
              </WorkbenchPanel>

              <WorkbenchPanel title="上下文约束" icon={GitBranch} action={<Badge variant="outline">资料 5</Badge>}>
                <ContextStack
                  rows={[
                    { label: '人物状态', value: '林夏克制紧张，顾言迟疑停步', icon: Users },
                    { label: '地点风格', value: '老城区窄巷、坏路灯、低照度雨夜', icon: Film },
                    { label: '剧情道具', value: '破损旧伞和纸条必须可被镜头解释', icon: PackageCheck },
                    { label: '生成落点', value: '确认后进入制作项生成工作台', icon: Wand2 },
                  ]}
                />
              </WorkbenchPanel>

              <WorkbenchPanel title="预演缺口" icon={PackageCheck} action={<Badge variant="danger">影响判断 2</Badge>}>
                <div className="space-y-2">
                  {previewMissingAssets.map((asset) => (
                    <div key={asset.name} className="rounded-md border border-border bg-background px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{asset.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{asset.owner}</p>
                        </div>
                        <Badge variant={asset.priority === '高' ? 'danger' : 'warning'}>{asset.priority}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant={asset.impact === '影响判断' ? 'warning' : 'outline'}>{asset.impact}</Badge>
                        <Badge variant="secondary">{asset.placeholder}</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{asset.detail}</p>
                    </div>
                  ))}
                </div>
              </WorkbenchPanel>

              <WorkbenchPanel title="预演门禁" icon={ClipboardCheck} action={<Badge variant="warning">2 项未过</Badge>}>
                <GateChecklist rows={previewGates} />
              </WorkbenchPanel>

              <WorkbenchPanel title="下一步决策" icon={Settings2}>
                <div className="space-y-2">
                  <Button className="w-full justify-start gap-2">
                    <Image size={15} />
                    生成低清关键帧
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <PackageCheck size={15} />
                    补临时占位素材
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/segments')}>
                    <Layers size={15} />
                    调整分镜再预演
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <CheckCircle2 size={15} />
                    继续进入正式制作
                  </Button>
                </div>
              </WorkbenchPanel>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function PreviewWorkTaskCard({ task, selected, compact = false }: { task: PreviewWorkTask; selected: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
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
          <p className="text-[11px] tabular-nums text-muted-foreground">段落 {index + 1}</p>
          <p className="mt-1 truncate text-sm font-medium text-foreground">{segment.title}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{segment.subtitle}</p>
        </div>
        <Badge variant={previewStatusVariant(segment.status)}>{previewStatusLabel(segment.status)}</Badge>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{segment.duration}</span>
        <span>{segment.moments} 情景</span>
        <span>{segment.units} 内容</span>
        {segment.gaps > 0 ? <span className="text-amber-600">缺口 {segment.gaps}</span> : null}
      </div>
      <Progress value={segment.readiness} className="mt-3 h-1.5" />
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
        <Badge variant={previewStatusVariant(shot.status)}>{previewStatusLabel(shot.status)}</Badge>
      </div>
    </div>
  )
}

function previewStatusLabel(status: PreviewPlanStatus) {
  if (status === 'ready') return '可生产'
  if (status === 'blocked') return '阻塞'
  if (status === 'attention') return '待确认'
  return '草稿'
}

function previewStatusVariant(status: PreviewPlanStatus) {
  if (status === 'ready') return 'success' as const
  if (status === 'blocked') return 'danger' as const
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

type CanvasWorkbenchKind = 'assets' | 'production'

const canvasWorkbenchMeta: Record<CanvasWorkbenchKind, {
  title: string
  stage: CanvasStage
  description: string
  canvasName: string
  icon: typeof PackageCheck
}> = {
  assets: {
    title: '素材准备工作台',
    stage: 'asset_prep',
    description: '复用现有画布工作流来组织素材缺口、参考输入、AI 生成、人工审核和资源写回。',
    canvasName: '素材准备画布',
    icon: PackageCheck,
  },
  production: {
    title: '制作项生成工作台',
    stage: 'generation',
    description: '复用现有画布工作流来串联制作项、提示词、关键帧、视频候选、返工和正式输出。',
    canvasName: '制作项生成画布',
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

function CategoryContent({ category }: { category: WorkbenchCategory }) {
  if (category === 'assets') return <AssetPreparationWorkbench />
  if (category === 'production') return <ContentGenerationWorkbench />
  if (category === 'reference-relations') return <ReferenceRelationsPage embedded initialView="graph" />
  return <ScenarioWorkspace category={category} />
}

export function WorkbenchContent({ initialCategory = 'script', showCategoryTabs = true }: WorkbenchContentProps) {
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
