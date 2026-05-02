import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Clock3,
  Database,
  Eye,
  FileText,
  Film,
  GitBranch,
  Image,
  Layers3,
  ListFilter,
  LockKeyhole,
  PackageCheck,
  Play,
  RefreshCcw,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react'

import { listV2Entities, v2EntityConfig, type V2EntityRecord } from '@/api/v2Entities'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Input, Progress } from '@movscript/ui'

type StatusFilter = 'all' | 'ready' | 'attention' | 'locked'

type ContentUnitRecord = V2EntityRecord & {
  segment_id?: number
  sceneMoment_id?: number
  title?: string
  kind?: string
  order?: number
  duration_sec?: number
  description?: string
  prompt?: string
  status?: string
}

type SceneMomentRecord = V2EntityRecord & {
  title?: string
  description?: string
  time_text?: string
  location_text?: string
  condition_text?: string
  action_text?: string
  mood?: string
  status?: string
}

type SegmentRecord = V2EntityRecord & {
  title?: string
  summary?: string
  content?: string
  status?: string
}

type StoryboardLineRecord = V2EntityRecord & {
  sceneMoment_id?: number
  segment_id?: number
  title?: string
  description?: string
  visual_intent?: string
  status?: string
}

type KeyframeRecord = V2EntityRecord & {
  sceneMoment_id?: number
  content_unit_id?: number
  title?: string
  description?: string
  prompt?: string
  status?: string
}

type CreativeReferenceRecord = V2EntityRecord & {
  name?: string
  kind?: string
  description?: string
  content?: string
  status?: string
}

type CreativeReferenceUsageRecord = V2EntityRecord & {
  owner_type?: string
  owner_id?: number
  creative_reference_id?: number
  role?: string
  evidence?: string
  status?: string
}

type AssetSlotRecord = V2EntityRecord & {
  owner_type?: string
  owner_id?: number
  creative_reference_id?: number
  kind?: string
  name?: string
  description?: string
  prompt_hint?: string
  priority?: string
  status?: string
}

interface ContentUnitViewModel {
  unit: ContentUnitRecord
  sceneMoment?: SceneMomentRecord
  section?: SegmentRecord
  usages: CreativeReferenceUsageRecord[]
  references: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  keyframes: KeyframeRecord[]
  storyboardLines: StoryboardLineRecord[]
  missingAssets: AssetSlotRecord[]
  readiness: number
}

const statusMeta: Record<string, { label: string; className: string; dot: string }> = {
  draft: { label: '草稿', className: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  confirmed: { label: '已确认', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  in_production: { label: '生成中', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  locked: { label: '已锁定', className: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  candidate: { label: '候选', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  missing: { label: '缺素材', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  blocked: { label: '阻塞', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
}

const kindLabels: Record<string, string> = {
  shot: '镜头',
  visual_segment: '视觉片段',
  product_showcase: '产品展示',
  caption_card: '字幕卡',
  narration: '旁白',
  transition: '转场',
  music_beat: '音乐节拍',
}

const kindOptions = ['all', 'shot', 'visual_segment', 'product_showcase', 'caption_card', 'narration', 'transition', 'music_beat']

export default function ContentsPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [kindFilter, setKindFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')

  const contentUnitsQuery = useQuery({
    queryKey: ['v2-content-positioning', projectId, 'content-units'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('contentUnits')) as Promise<ContentUnitRecord[]>,
    enabled: !!projectId,
  })
  const sceneMomentsQuery = useQuery({
    queryKey: ['v2-content-positioning', projectId, 'sceneMoments'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('sceneMoments')) as Promise<SceneMomentRecord[]>,
    enabled: !!projectId,
  })
  const sectionsQuery = useQuery({
    queryKey: ['v2-content-positioning', projectId, 'segments'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('segments')) as Promise<SegmentRecord[]>,
    enabled: !!projectId,
  })
  const storyboardLinesQuery = useQuery({
    queryKey: ['v2-content-positioning', projectId, 'storyboard-lines'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('storyboardLines')) as Promise<StoryboardLineRecord[]>,
    enabled: !!projectId,
  })
  const keyframesQuery = useQuery({
    queryKey: ['v2-content-positioning', projectId, 'keyframes'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('keyframes')) as Promise<KeyframeRecord[]>,
    enabled: !!projectId,
  })
  const referencesQuery = useQuery({
    queryKey: ['v2-content-positioning', projectId, 'creative-references'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('creativeReferences')) as Promise<CreativeReferenceRecord[]>,
    enabled: !!projectId,
  })
  const usagesQuery = useQuery({
    queryKey: ['v2-content-positioning', projectId, 'creative-reference-usages'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('creativeReferenceUsages')) as Promise<CreativeReferenceUsageRecord[]>,
    enabled: !!projectId,
  })
  const assetSlotsQuery = useQuery({
    queryKey: ['v2-content-positioning', projectId, 'asset-slots'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('assetSlots')) as Promise<AssetSlotRecord[]>,
    enabled: !!projectId,
  })

  const contentUnits = useMemo(() => (contentUnitsQuery.data ?? []).slice().sort(compareByOrder), [contentUnitsQuery.data])
  const sceneMoments = sceneMomentsQuery.data ?? []
  const sections = sectionsQuery.data ?? []
  const storyboardLines = storyboardLinesQuery.data ?? []
  const keyframes = keyframesQuery.data ?? []
  const references = referencesQuery.data ?? []
  const usages = usagesQuery.data ?? []
  const assetSlots = assetSlotsQuery.data ?? []

  const referencesById = useMemo(() => new Map(references.map((item) => [item.ID, item])), [references])
  const sceneMomentById = useMemo(() => new Map(sceneMoments.map((item) => [item.ID, item])), [sceneMoments])
  const sectionById = useMemo(() => new Map(sections.map((item) => [item.ID, item])), [sections])

  const unitViewModels = useMemo(() => contentUnits.map((unit) => {
    const sceneMoment = unit.sceneMoment_id ? sceneMomentById.get(unit.sceneMoment_id) : undefined
    const section = unit.segment_id ? sectionById.get(unit.segment_id) : undefined
    const unitUsages = usages.filter((item) => item.owner_type === 'content_unit' && item.owner_id === unit.ID)
    const inheritedUsages = sceneMoment ? usages.filter((item) => item.owner_type === 'sceneMoment' && item.owner_id === sceneMoment.ID) : []
    const relatedUsages = dedupeUsages([...unitUsages, ...inheritedUsages])
    const relatedReferences = relatedUsages
      .map((usage) => usage.creative_reference_id ? referencesById.get(usage.creative_reference_id) : undefined)
      .filter(Boolean) as CreativeReferenceRecord[]
    const unitAssetSlots = assetSlots.filter((item) => item.owner_type === 'content_unit' && item.owner_id === unit.ID)
    const inheritedAssetSlots = sceneMoment ? assetSlots.filter((item) => item.owner_type === 'sceneMoment' && item.owner_id === sceneMoment.ID) : []
    const relatedAssetSlots = [...unitAssetSlots, ...inheritedAssetSlots]
    const relatedKeyframes = keyframes.filter((item) => item.content_unit_id === unit.ID || (unit.sceneMoment_id && item.sceneMoment_id === unit.sceneMoment_id))
    const relatedStoryboardLines = storyboardLines.filter((item) => (
      (unit.sceneMoment_id && item.sceneMoment_id === unit.sceneMoment_id) ||
      (unit.segment_id && item.segment_id === unit.segment_id)
    ))
    const missingAssets = relatedAssetSlots.filter((item) => ['missing', 'blocked'].includes(String(item.status ?? '')))
    const readiness = calculateReadiness({ unit, sceneMoment, references: relatedReferences, assetSlots: relatedAssetSlots, keyframes: relatedKeyframes })

    return {
      unit,
      sceneMoment,
      section,
      usages: relatedUsages,
      references: relatedReferences,
      assetSlots: relatedAssetSlots,
      keyframes: relatedKeyframes,
      storyboardLines: relatedStoryboardLines,
      missingAssets,
      readiness,
    }
  }), [assetSlots, contentUnits, keyframes, referencesById, sectionById, sceneMomentById, storyboardLines, usages])

  const filteredUnits = useMemo(() => {
    const q = query.trim().toLowerCase()
    return unitViewModels.filter((item) => {
      const status = String(item.unit.status ?? 'draft')
      const matchesKind = kindFilter === 'all' || item.unit.kind === kindFilter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'ready' && item.readiness >= 70 && item.missingAssets.length === 0) ||
        (statusFilter === 'attention' && (item.readiness < 70 || item.missingAssets.length > 0 || ['draft', 'candidate'].includes(status))) ||
        (statusFilter === 'locked' && status === 'locked')
      const haystack = [
        titleOf(item.unit),
        item.unit.description,
        item.unit.prompt,
        titleOf(item.sceneMoment),
        item.sceneMoment?.description,
        item.sceneMoment?.action_text,
        item.references.map((ref) => ref.name).join(' '),
        item.assetSlots.map((slot) => slot.name).join(' '),
      ].filter(Boolean).join(' ').toLowerCase()
      return matchesKind && matchesStatus && (!q || haystack.includes(q))
    })
  }, [kindFilter, query, statusFilter, unitViewModels])

  const selected = useMemo(() => {
    if (selectedId) {
      const matched = unitViewModels.find((item) => item.unit.ID === selectedId)
      if (matched) return matched
    }
    return filteredUnits[0] ?? unitViewModels[0] ?? null
  }, [filteredUnits, selectedId, unitViewModels])

  const readyCount = unitViewModels.filter((item) => item.readiness >= 70 && item.missingAssets.length === 0).length
  const lockedCount = unitViewModels.filter((item) => item.unit.status === 'locked').length
  const attentionCount = unitViewModels.filter((item) => item.readiness < 70 || item.missingAssets.length > 0).length
  const averageReadiness = unitViewModels.length
    ? Math.round(unitViewModels.reduce((sum, item) => sum + item.readiness, 0) / unitViewModels.length)
    : 0
  const isLoading = contentUnitsQuery.isLoading || sceneMomentsQuery.isLoading
  const isFetching = contentUnitsQuery.isFetching || sceneMomentsQuery.isFetching || sectionsQuery.isFetching || storyboardLinesQuery.isFetching || keyframesQuery.isFetching || referencesQuery.isFetching || usagesQuery.isFetching || assetSlotsQuery.isFetching

  function refreshAll() {
    contentUnitsQuery.refetch()
    sceneMomentsQuery.refetch()
    sectionsQuery.refetch()
    storyboardLinesQuery.refetch()
    keyframesQuery.refetch()
    referencesQuery.refetch()
    usagesQuery.refetch()
    assetSlotsQuery.refetch()
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="min-w-[1180px] space-y-5 p-5">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>v2 内容生产</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">内容单元</h1>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              内容单元是最小可生成单位：它从情节继承时间、地点、动作和情绪，绑定创作资料、素材位与关键帧，形成一次可执行的生成合同。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={refreshAll} loading={isFetching}>
              <RefreshCcw size={15} />
              刷新
            </Button>
            <Button variant="outline" className="gap-2" asChild>
              <Link to="/reference-relations">
                <GitBranch size={15} />
                关系图谱
              </Link>
            </Button>
            <Button className="gap-2" asChild>
              <Link to="/workbench/production">
                <Wand2 size={15} />
                内容生成
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-4 gap-3">
          <MetricCard icon={Boxes} label="内容单元" value={unitViewModels.length} detail="最小可生成颗粒" tone="text-indigo-600" />
          <MetricCard icon={ShieldCheck} label="可生成" value={readyCount} detail="情节、资料和素材输入已满足" tone="text-emerald-600" />
          <MetricCard icon={AlertTriangle} label="待补齐" value={attentionCount} detail="缺上下文、提示词或素材位" tone="text-amber-600" />
          <MetricCard icon={LockKeyhole} label="已锁定" value={lockedCount} detail={`${averageReadiness}% 平均生成准备度`} tone="text-violet-600" />
        </section>

        <section className="grid grid-cols-[260px_minmax(0,1fr)_360px] gap-4">
          <aside className="space-y-4">
            <Panel title="内容定位" icon={Route}>
              <div className="space-y-3">
                <PositionStep icon={Route} label="情节" detail="定义发生条件和上下文" />
                <PositionStep icon={Boxes} label="内容单元" detail="收敛为一次可生成任务" active />
                <PositionStep icon={Play} label="候选内容" detail="生成、返工、选片" />
                <PositionStep icon={Film} label="成片时间线" detail="锁定后进入交付" />
              </div>
            </Panel>

            <Panel title="生成合同" icon={FileText}>
              <GateRow icon={Route} title="上下文" detail="情节提供时间、地点、条件、动作" />
              <GateRow icon={Sparkles} title="创作资料" detail="人物、地点、道具、产品、风格连续性" />
              <GateRow icon={PackageCheck} title="素材位" detail="需要输入或锁定的图像、视频、音频、参考" />
              <GateRow icon={Image} title="视觉锚点" detail="关键帧或参考帧稳定构图和状态" />
            </Panel>

            <Panel title="类型筛选" icon={ListFilter}>
              <div className="space-y-1">
                {kindOptions.map((kind) => {
                  const active = kindFilter === kind
                  const count = kind === 'all' ? unitViewModels.length : unitViewModels.filter((item) => item.unit.kind === kind).length
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setKindFilter(kind)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                        active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      )}
                    >
                      <span className="truncate">{kind === 'all' ? '全部类型' : kindLabel(kind)}</span>
                      <span className={cn('text-[11px]', active ? 'text-background/65' : 'text-muted-foreground')}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </Panel>
          </aside>

          <main className="min-w-0 space-y-4">
            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">内容单元清单</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">每一项都是可被生成工作台执行、复核和锁定的生产颗粒。</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索标题、提示词、资料或素材"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="ms-input h-8 w-28 text-xs">
                    <option value="all">全部</option>
                    <option value="ready">可生成</option>
                    <option value="attention">待补齐</option>
                    <option value="locked">已锁定</option>
                  </select>
                </div>
              </div>

              {isLoading ? (
                <EmptyState title="正在加载内容单元" detail="读取内容、情节和生成输入关系" />
              ) : filteredUnits.length === 0 ? (
                <EmptyState title="暂无内容单元" detail="可先在制作预演确认分镜，再生成内容单元骨架" />
              ) : (
                <div className="grid grid-cols-2 gap-3 p-4">
                  {filteredUnits.map((item) => (
                    <ContentUnitCard
                      key={item.unit.ID}
                      item={item}
                      selected={selected?.unit.ID === item.unit.ID}
                      onSelect={() => setSelectedId(item.unit.ID)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Layers3 size={15} className="text-primary" />
                  <p className="text-sm font-semibold text-foreground">情节到生成</p>
                </div>
                <span className="text-xs text-muted-foreground">展示所选内容单元的上游来源和下游落点</span>
              </div>
              <div className="grid grid-cols-5 gap-3 p-4">
                <PipelineTile icon={Route} label="情节上下文" value={selected?.sceneMoment ? titleOf(selected.sceneMoment) : '未绑定'} detail={selected?.sceneMoment?.description || selected?.sceneMoment?.action_text || '需要绑定情节'} />
                <PipelineTile icon={Clapperboard} label="分镜行" value={selected?.storyboardLines.length ?? 0} detail="内容单元的叙事来源" />
                <PipelineTile icon={Sparkles} label="创作资料" value={selected?.references.length ?? 0} detail="连续性和约束" />
                <PipelineTile icon={PackageCheck} label="素材位" value={selected?.assetSlots.length ?? 0} detail={`${selected?.missingAssets.length ?? 0} 个待补齐`} />
                <PipelineTile icon={Play} label="执行入口" value={selected ? `${selected.readiness}%` : '-'} detail="进入生成工作台" />
              </div>
            </section>
          </main>

          <aside className="space-y-4">
            <ContentUnitDetail item={selected} />
            <RelatedPanel
              title="创作资料"
              icon={Sparkles}
              empty="暂无资料引用"
              records={selected?.references.map((item) => ({
                id: item.ID,
                title: item.name || titleOf(item),
                subtitle: `${item.kind ?? 'reference'} · ${statusLabel(item.status)}`,
                status: item.status,
              })) ?? []}
            />
            <RelatedPanel
              title="素材位"
              icon={PackageCheck}
              empty="暂无素材需求"
              records={selected?.assetSlots.map((item) => ({
                id: item.ID,
                title: item.name || titleOf(item),
                subtitle: `${item.kind ?? 'asset'} · ${item.prompt_hint || item.description || '等待补充生成输入'}`,
                status: item.status,
              })) ?? []}
            />
            <RelatedPanel
              title="关键帧"
              icon={Image}
              empty="暂无关键帧"
              records={selected?.keyframes.map((item) => ({
                id: item.ID,
                title: item.title || titleOf(item),
                subtitle: item.prompt || item.description || '视觉锚点',
                status: item.status,
              })) ?? []}
            />
          </aside>
        </section>
      </div>
    </div>
  )
}

function ContentUnitCard({
  item,
  selected,
  onSelect,
}: {
  item: ContentUnitViewModel
  selected: boolean
  onSelect: () => void
}) {
  const status = String(item.unit.status ?? 'draft')
  const sceneMomentTitle = item.sceneMoment ? titleOf(item.sceneMoment) : '未绑定情节'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'overflow-hidden rounded-lg border bg-background text-left transition-all hover:border-primary/50 hover:shadow-sm',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="border-b border-border bg-gradient-to-br from-indigo-500/15 to-cyan-500/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
            <Boxes size={18} />
          </span>
          <StatusBadge status={status} />
        </div>
        <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-foreground">{titleOf(item.unit)}</h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">{kindLabel(item.unit.kind)} · {formatDuration(item.unit.duration_sec)}</p>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{item.unit.description || item.unit.prompt || '暂无内容描述或生成提示词'}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <InfoChip icon={Route} label={sceneMomentTitle} />
          <InfoChip icon={Clock3} label={item.sceneMoment?.time_text || item.sceneMoment?.location_text || '情节待补'} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">资料 {item.references.length}</Badge>
          <Badge variant="outline" className="text-[10px]">素材 {item.assetSlots.length}</Badge>
          <Badge variant="outline" className="text-[10px]">关键帧 {item.keyframes.length}</Badge>
          {item.missingAssets.length > 0 ? <Badge variant="warning" className="text-[10px]">缺口 {item.missingAssets.length}</Badge> : null}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Progress value={item.readiness} className="h-1.5 flex-1" />
          <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{item.readiness}%</span>
        </div>
      </div>
    </button>
  )
}

function ContentUnitDetail({ item }: { item: ContentUnitViewModel | null }) {
  if (!item) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <EmptyState title="未选择内容单元" detail="从中间清单选择一个可生成颗粒" compact />
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-gradient-to-br from-indigo-500/15 to-cyan-500/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
            <Eye size={19} />
          </span>
          <StatusBadge status={item.unit.status ?? 'draft'} />
        </div>
        <h2 className="mt-3 text-lg font-semibold text-foreground">{titleOf(item.unit)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{kindLabel(item.unit.kind)} · {formatDuration(item.unit.duration_sec)}</p>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">生成准备度</span>
            <span className="font-medium tabular-nums text-foreground">{item.readiness}%</span>
          </div>
          <Progress value={item.readiness} className="h-2" />
        </div>
        <CheckRow ok={Boolean(item.sceneMoment)} label="已绑定情节" detail={item.sceneMoment ? titleOf(item.sceneMoment) : '缺少时间、地点、动作上下文'} />
        <CheckRow ok={Boolean(item.unit.prompt || item.unit.description)} label="有生成意图" detail={item.unit.prompt || item.unit.description || '需要补充描述或提示词'} />
        <CheckRow ok={item.references.length > 0} label="有创作资料" detail={`${item.references.length} 个资料约束`} />
        <CheckRow ok={item.missingAssets.length === 0} label="素材缺口可控" detail={item.missingAssets.length ? `${item.missingAssets.length} 个素材位待补齐` : `${item.assetSlots.length} 个素材位可用或未要求`} />
        <InfoBlock label="情节" value={item.sceneMoment?.description || item.sceneMoment?.action_text || '暂无情节描述'} />
        <InfoBlock label="生成提示" value={item.unit.prompt || item.unit.description || '暂无提示词'} />
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="分镜行" value={item.storyboardLines.length} />
          <MiniStat label="关键帧" value={item.keyframes.length} />
        </div>
      </div>
    </section>
  )
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string | number; detail: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
          <Icon size={18} className={tone} />
        </span>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Icon size={14} className="text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function PositionStep({ icon: Icon, label, detail, active = false }: { icon: LucideIcon; label: string; detail: string; active?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function GateRow({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="flex gap-2 rounded-md border border-border bg-background p-2.5">
      <Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function PipelineTile({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string | number; detail: string }) {
  return (
    <div className="relative rounded-md border border-border bg-background p-3">
      <ArrowRight className="absolute -right-5 top-1/2 hidden -translate-y-1/2 text-muted-foreground last:hidden md:block" size={16} />
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-semibold text-foreground">{value}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">{detail}</p>
    </div>
  )
}

function RelatedPanel({ title, icon: Icon, records, empty }: { title: string; icon: LucideIcon; records: Array<{ id: number; title: string; subtitle: string; status?: string }>; empty: string }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
        <Badge variant="outline" className="text-[10px]">{records.length}</Badge>
      </div>
      <div className="space-y-2 p-3">
        {records.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">{empty}</p>
        ) : (
          records.slice(0, 6).map((record) => (
            <div key={record.id} className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">{record.title}</p>
                <StatusBadge status={record.status ?? 'draft'} compact />
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{record.subtitle}</p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex gap-2 rounded-md border border-border bg-background p-2.5">
      {ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />}
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function InfoChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5">
      <Icon size={12} className="shrink-0 text-muted-foreground" />
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const meta = statusMeta[status] ?? { label: status || '未知', className: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' }
  return (
    <Badge variant="secondary" className={cn('shrink-0', compact ? 'text-[9px]' : 'text-[10px]', meta.className)}>
      {meta.label}
    </Badge>
  )
}

function EmptyState({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'min-h-32 p-4' : 'min-h-72 p-8')}>
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Boxes size={18} />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  )
}

function calculateReadiness(input: {
  unit: ContentUnitRecord
  sceneMoment?: SceneMomentRecord
  references: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  keyframes: KeyframeRecord[]
}) {
  let score = 0
  if (input.sceneMoment) score += 25
  if (input.unit.prompt || input.unit.description) score += 25
  if (input.references.length > 0) score += 20
  if (input.keyframes.length > 0) score += 10
  const missingAssets = input.assetSlots.filter((item) => ['missing', 'blocked'].includes(String(item.status ?? ''))).length
  if (input.assetSlots.length === 0 || missingAssets === 0) score += 20
  else score += Math.max(0, 20 - missingAssets * 8)
  return Math.max(0, Math.min(100, score))
}

function dedupeUsages(usages: CreativeReferenceUsageRecord[]) {
  const seen = new Set<string>()
  return usages.filter((usage) => {
    const key = `${usage.owner_type}:${usage.owner_id}:${usage.creative_reference_id}:${usage.role ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function compareByOrder<T extends { order?: number; ID: number }>(a: T, b: T) {
  return orderOf(a) - orderOf(b)
}

function orderOf(record: { order?: number; ID: number }) {
  return typeof record.order === 'number' ? record.order : record.ID
}

function titleOf(record?: { ID?: number; title?: string; name?: string; label?: string } | null) {
  if (!record) return '未命名'
  return String(record.title ?? record.name ?? record.label ?? `#${record.ID}`)
}

function kindLabel(kind?: string) {
  return kindLabels[String(kind ?? '')] ?? kind ?? '内容单元'
}

function statusLabel(status?: string) {
  return statusMeta[String(status ?? '')]?.label ?? status ?? '未知'
}

function formatDuration(value?: number) {
  if (!value) return '时长未定'
  return `${value}s`
}
