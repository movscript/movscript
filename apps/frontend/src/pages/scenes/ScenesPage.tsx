import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  Eye,
  Film,
  Flag,
  Image,
  Layers3,
  ListFilter,
  MapPin,
  PackageCheck,
  RefreshCcw,
  Search,
  Sparkles,
  Wand2,
} from 'lucide-react'

import { listV2Entities, v2EntityConfig, type V2EntityRecord } from '@/api/v2Entities'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Input, Progress as ProgressBar } from '@movscript/ui'

type StatusFilter = 'all' | 'confirmed' | 'draft' | 'attention'

type ScriptSectionRecord = V2EntityRecord & {
  title?: string
  kind?: string
  summary?: string
  content?: string
  order?: number
  status?: string
}

type SituationRecord = V2EntityRecord & {
  script_section_id?: number
  title?: string
  description?: string
  time_text?: string
  location_text?: string
  condition_text?: string
  action_text?: string
  mood?: string
  order?: number
  status?: string
}

type RelatedRecord = V2EntityRecord & {
  situation_id?: number
  owner_type?: string
  owner_id?: number
  title?: string
  name?: string
  label?: string
  description?: string
  visual_intent?: string
  prompt?: string
  prompt_hint?: string
  kind?: string
  status?: string
  priority?: string
  duration_sec?: number
  order?: number
}

const statusTone: Record<string, string> = {
  confirmed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  locked: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  accepted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  attached: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  draft: 'bg-muted text-muted-foreground',
  candidate: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  generated: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  missing: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  review: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  ignored: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  rejected: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  blocked: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

const sectionKinds: Record<string, string> = {
  section: '剧本节',
  scene: '场次',
  montage: '蒙太奇',
  narration: '旁白',
  product_showcase: '产品展示',
  title_card: '标题卡',
  transition: '转场',
}

function matchesStatus(status: StatusFilter, recordStatus?: string) {
  const value = String(recordStatus ?? '')
  if (status === 'all') return true
  if (status === 'attention') return ['draft', 'candidate', 'missing', 'review', 'blocked', 'ignored'].includes(value)
  return value === status
}

function titleOf(record?: RelatedRecord | SituationRecord | ScriptSectionRecord | null) {
  if (!record) return '未命名'
  return String(record.title ?? record.name ?? record.label ?? `#${record.ID}`)
}

function orderOf(record: { order?: number; ID: number }) {
  return typeof record.order === 'number' ? record.order : record.ID
}

function compareByOrder<T extends { order?: number; ID: number }>(a: T, b: T) {
  return orderOf(a) - orderOf(b)
}

function formatDuration(value?: number) {
  if (!value) return '-'
  return `${value}s`
}

export default function ScenesPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const [selectedSectionId, setSelectedSectionId] = useState<number | 'all'>('all')
  const [selectedSituationId, setSelectedSituationId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')

  const scriptSectionsQuery = useQuery({
    queryKey: ['v2-situation-library', projectId, 'script-sections'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('scriptSections')) as Promise<ScriptSectionRecord[]>,
    enabled: !!projectId,
  })
  const situationsQuery = useQuery({
    queryKey: ['v2-situation-library', projectId, 'situations'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('situations')) as Promise<SituationRecord[]>,
    enabled: !!projectId,
  })
  const storyboardLinesQuery = useQuery({
    queryKey: ['v2-situation-library', projectId, 'storyboard-lines'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('storyboardLines')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const contentUnitsQuery = useQuery({
    queryKey: ['v2-situation-library', projectId, 'content-units'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('contentUnits')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const keyframesQuery = useQuery({
    queryKey: ['v2-situation-library', projectId, 'keyframes'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('keyframes')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const assetSlotsQuery = useQuery({
    queryKey: ['v2-situation-library', projectId, 'asset-slots'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('assetSlots')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })

  const sections = useMemo(() => (scriptSectionsQuery.data ?? []).slice().sort(compareByOrder), [scriptSectionsQuery.data])
  const situations = useMemo(() => (situationsQuery.data ?? []).slice().sort(compareByOrder), [situationsQuery.data])
  const storyboardLines = storyboardLinesQuery.data ?? []
  const contentUnits = contentUnitsQuery.data ?? []
  const keyframes = keyframesQuery.data ?? []
  const assetSlots = assetSlotsQuery.data ?? []

  const sectionCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const situation of situations) {
      if (situation.script_section_id) counts.set(situation.script_section_id, (counts.get(situation.script_section_id) ?? 0) + 1)
    }
    return counts
  }, [situations])

  const visibleSituations = useMemo(() => {
    const q = query.trim().toLowerCase()
    return situations.filter((situation) => {
      const section = sections.find((item) => item.ID === situation.script_section_id)
      const inSection = selectedSectionId === 'all' || situation.script_section_id === selectedSectionId
      const inStatus = matchesStatus(statusFilter, situation.status)
      const haystack = [
        titleOf(situation),
        situation.description,
        situation.time_text,
        situation.location_text,
        situation.condition_text,
        situation.action_text,
        situation.mood,
        titleOf(section),
        section?.summary,
      ].filter(Boolean).join(' ').toLowerCase()
      return inSection && inStatus && (!q || haystack.includes(q))
    })
  }, [query, sections, selectedSectionId, situations, statusFilter])

  const selectedSituation = useMemo(() => {
    if (selectedSituationId) {
      const selected = situations.find((item) => item.ID === selectedSituationId)
      if (selected && visibleSituations.some((item) => item.ID === selected.ID)) return selected
    }
    return visibleSituations[0] ?? situations[0] ?? null
  }, [selectedSituationId, situations, visibleSituations])

  const selectedSection = selectedSituation?.script_section_id
    ? sections.find((section) => section.ID === selectedSituation.script_section_id) ?? null
    : selectedSectionId !== 'all'
      ? sections.find((section) => section.ID === selectedSectionId) ?? null
      : null

  const selectedSituationKey = selectedSituation?.ID
  const selectedStoryboardLines = storyboardLines.filter((item) => item.situation_id === selectedSituationKey).sort(compareByOrder)
  const selectedContentUnits = contentUnits.filter((item) => item.situation_id === selectedSituationKey).sort(compareByOrder)
  const selectedKeyframes = keyframes.filter((item) => item.situation_id === selectedSituationKey).sort(compareByOrder)
  const selectedAssetSlots = assetSlots.filter((item) => item.owner_type === 'situation' && item.owner_id === selectedSituationKey).sort(compareByOrder)

  const confirmedCount = situations.filter((item) => item.status === 'confirmed').length
  const attentionCount = situations.filter((item) => ['draft', 'candidate', 'missing', 'review', 'blocked'].includes(String(item.status ?? ''))).length
  const coverage = situations.length > 0 ? Math.round((confirmedCount / situations.length) * 100) : 0
  const isLoading = scriptSectionsQuery.isLoading || situationsQuery.isLoading
  const isFetching = scriptSectionsQuery.isFetching || situationsQuery.isFetching || storyboardLinesQuery.isFetching || contentUnitsQuery.isFetching || keyframesQuery.isFetching || assetSlotsQuery.isFetching

  function refreshAll() {
    scriptSectionsQuery.refetch()
    situationsQuery.refetch()
    storyboardLinesQuery.refetch()
    contentUnitsQuery.refetch()
    keyframesQuery.refetch()
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
              <span>v2 情景库</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">情景库</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              剧本节作为来源和分组，情境作为可确认的画面上下文；分镜、内容单元、关键帧和素材位围绕情境展开。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={refreshAll} loading={isFetching}>
              <RefreshCcw size={15} />
              刷新
            </Button>
            <Button className="gap-2">
              <Sparkles size={15} />
              从制作预演生成
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-4 gap-3">
          <MetricCard icon={BookOpenText} label="剧本节" value={sections.length} detail="情境的来源分组" tone="text-cyan-600" />
          <MetricCard icon={Film} label="情境" value={situations.length} detail={`${visibleSituations.length} 个符合当前筛选`} tone="text-teal-600" />
          <MetricCard icon={CheckCircle2} label="已确认" value={confirmedCount} detail={`${coverage}% 可进入预演`} tone="text-emerald-600" />
          <MetricCard icon={AlertTriangle} label="待处理" value={attentionCount} detail="草稿、候选或阻塞情境" tone="text-amber-600" />
        </section>

        <section className="grid grid-cols-[260px_minmax(0,1fr)_350px] gap-4">
          <aside className="space-y-4">
            <Panel title="剧本节分组" icon={Layers3}>
              <div className="space-y-1">
                <SectionButton
                  active={selectedSectionId === 'all'}
                  title="全部剧本节"
                  subtitle={`${situations.length} 个情境`}
                  status="source"
                  onClick={() => setSelectedSectionId('all')}
                />
                {sections.map((section) => (
                  <SectionButton
                    key={section.ID}
                    active={selectedSectionId === section.ID}
                    title={titleOf(section)}
                    subtitle={`${sectionKinds[String(section.kind ?? '')] ?? section.kind ?? '剧本节'} · ${sectionCounts.get(section.ID) ?? 0} 个情境`}
                    status={section.status ?? 'draft'}
                    onClick={() => setSelectedSectionId(section.ID)}
                  />
                ))}
              </div>
            </Panel>

            <Panel title="确认进度" icon={Flag}>
              <div className="space-y-3">
                <ProgressBar value={coverage} className="h-1.5" />
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="确认" value={confirmedCount} />
                  <MiniStat label="待处理" value={attentionCount} />
                  <MiniStat label="素材缺口" value={assetSlots.filter((item) => item.status === 'missing').length} />
                </div>
              </div>
            </Panel>

            <Panel title="下游落点" icon={ArrowRight}>
              <FlowStep icon={Film} label="分镜脚本" detail="情境转为分镜行" />
              <FlowStep icon={Image} label="预演关键帧" detail="锁定视觉锚点" />
              <FlowStep icon={PackageCheck} label="素材位" detail="补齐生产缺口" />
            </Panel>
          </aside>

          <main className="min-w-0 space-y-4">
            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">情境清单</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">按剧本节聚合，优先处理待确认和缺素材的情境。</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索时间、地点、动作或情绪"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <ListFilter size={14} className="text-muted-foreground" />
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="ms-input h-8 w-28 text-xs">
                    <option value="all">全部</option>
                    <option value="confirmed">已确认</option>
                    <option value="draft">草稿</option>
                    <option value="attention">待处理</option>
                  </select>
                </div>
              </div>

              {isLoading ? (
                <EmptyState title="正在加载情境" detail="读取剧本节和情境对象" />
              ) : visibleSituations.length === 0 ? (
                <EmptyState title="暂无情境" detail="可先在制作预演中解析并采纳情境候选" />
              ) : (
                <div className="grid grid-cols-2 gap-3 p-4">
                  {visibleSituations.map((situation) => {
                    const section = sections.find((item) => item.ID === situation.script_section_id)
                    return (
                      <SituationCard
                        key={situation.ID}
                        situation={situation}
                        section={section}
                        selected={selectedSituation?.ID === situation.ID}
                        storyboardCount={storyboardLines.filter((item) => item.situation_id === situation.ID).length}
                        contentUnitCount={contentUnits.filter((item) => item.situation_id === situation.ID).length}
                        keyframeCount={keyframes.filter((item) => item.situation_id === situation.ID).length}
                        assetGapCount={assetSlots.filter((item) => item.owner_type === 'situation' && item.owner_id === situation.ID && item.status === 'missing').length}
                        onSelect={() => setSelectedSituationId(situation.ID)}
                      />
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Wand2 size={15} className="text-primary" />
                  <p className="text-sm font-semibold text-foreground">情境到预演</p>
                </div>
                <span className="text-xs text-muted-foreground">展示当前情境如何进入分镜、关键帧和素材准备</span>
              </div>
              <div className="grid grid-cols-4 gap-3 p-4">
                <PipelineTile icon={BookOpenText} label="来源剧本节" value={selectedSection ? titleOf(selectedSection) : '未绑定'} detail={selectedSection?.summary || selectedSection?.content || '情境可以暂时不绑定剧本节'} />
                <PipelineTile icon={Film} label="分镜行" value={selectedStoryboardLines.length} detail="可编译为内容单元" />
                <PipelineTile icon={Image} label="关键帧" value={selectedKeyframes.length} detail="预演视觉锚点" />
                <PipelineTile icon={PackageCheck} label="素材位" value={selectedAssetSlots.length} detail="生产前缺口管理" />
              </div>
            </section>
          </main>

          <aside className="space-y-4">
            <SituationDetail situation={selectedSituation} section={selectedSection} />
            <RelatedPanel title="分镜行" icon={Film} records={selectedStoryboardLines} empty="暂无分镜行" />
            <RelatedPanel title="内容单元" icon={Boxes} records={selectedContentUnits} empty="暂无内容单元" />
            <RelatedPanel title="关键帧" icon={Image} records={selectedKeyframes} empty="暂无关键帧" />
            <RelatedPanel title="素材缺口" icon={PackageCheck} records={selectedAssetSlots} empty="暂无素材位" />
          </aside>
        </section>
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Database; label: string; value: string | number; detail: string; tone: string }) {
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

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Database; children: React.ReactNode }) {
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

function SectionButton({ active, title, subtitle, status, onClick }: { active: boolean; title: string; subtitle: string; status: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
        active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', active ? 'bg-background/15' : 'bg-muted')}>
        <BookOpenText size={14} className={active ? 'text-background' : 'text-cyan-700 dark:text-cyan-300'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className={cn('block truncate text-[11px]', active ? 'text-background/65' : 'text-muted-foreground')}>{subtitle}</span>
      </span>
      <StatusBadge status={status} muted={active} />
    </button>
  )
}

function SituationCard({
  situation,
  section,
  selected,
  storyboardCount,
  contentUnitCount,
  keyframeCount,
  assetGapCount,
  onSelect,
}: {
  situation: SituationRecord
  section?: ScriptSectionRecord
  selected: boolean
  storyboardCount: number
  contentUnitCount: number
  keyframeCount: number
  assetGapCount: number
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'overflow-hidden rounded-lg border bg-background text-left transition-all hover:border-primary/50 hover:shadow-sm',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="border-b border-border bg-gradient-to-br from-teal-500/15 to-sky-500/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-500/10 text-teal-700 dark:text-teal-300">
            <Film size={18} />
          </span>
          <StatusBadge status={situation.status ?? 'draft'} />
        </div>
        <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-foreground">{titleOf(situation)}</h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">{section ? titleOf(section) : '未绑定剧本节'}</p>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{situation.description || situation.action_text || situation.condition_text || '暂无情境描述'}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <InfoChip icon={Clock3} label={situation.time_text || '时间未定'} />
          <InfoChip icon={MapPin} label={situation.location_text || '地点未定'} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">分镜 {storyboardCount}</Badge>
          <Badge variant="outline" className="text-[10px]">内容 {contentUnitCount}</Badge>
          <Badge variant="outline" className="text-[10px]">关键帧 {keyframeCount}</Badge>
          {assetGapCount > 0 ? <Badge variant="warning" className="text-[10px]">缺口 {assetGapCount}</Badge> : null}
        </div>
      </div>
    </button>
  )
}

function InfoChip({ icon: Icon, label }: { icon: typeof Clock3; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5">
      <Icon size={12} className="shrink-0 text-muted-foreground" />
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}

function SituationDetail({ situation, section }: { situation: SituationRecord | null; section: ScriptSectionRecord | null }) {
  if (!situation) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <EmptyState title="未选择情境" detail="从中间情境清单选择一个对象" compact />
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-gradient-to-br from-teal-500/15 to-sky-500/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-500/10 text-teal-700 dark:text-teal-300">
            <Eye size={19} />
          </span>
          <StatusBadge status={situation.status ?? 'draft'} />
        </div>
        <h2 className="mt-3 text-lg font-semibold text-foreground">{titleOf(situation)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{section ? `来自 ${titleOf(section)}` : '未绑定剧本节'}</p>
      </div>
      <div className="space-y-4 p-4">
        <InfoBlock label="情境描述" value={situation.description || '暂无描述'} />
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="时间" value={situation.time_text || '-'} />
          <MiniStat label="地点" value={situation.location_text || '-'} />
        </div>
        <InfoBlock label="条件" value={situation.condition_text || '-'} />
        <InfoBlock label="动作" value={situation.action_text || '-'} />
        <InfoBlock label="情绪" value={situation.mood || '-'} />
      </div>
    </section>
  )
}

function RelatedPanel({ title, icon: Icon, records, empty }: { title: string; icon: typeof Film; records: RelatedRecord[]; empty: string }) {
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
          records.slice(0, 5).map((record) => <RelatedRow key={record.ID} record={record} />)
        )}
      </div>
    </section>
  )
}

function RelatedRow({ record }: { record: RelatedRecord }) {
  const detail = record.description || record.visual_intent || record.prompt || record.prompt_hint || record.kind || `ID ${record.ID}`
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{titleOf(record)}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{detail}</p>
        </div>
        <StatusBadge status={record.status ?? record.priority ?? 'draft'} />
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {record.kind ? <span>{record.kind}</span> : null}
        {record.duration_sec ? <span>{formatDuration(record.duration_sec)}</span> : null}
      </div>
    </div>
  )
}

function PipelineTile({ icon: Icon, label, value, detail }: { icon: typeof BookOpenText; label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-muted-foreground" />
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">{detail}</p>
    </div>
  )
}

function FlowStep({ icon: Icon, label, detail }: { icon: typeof Film; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
      <Icon size={14} className="text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-foreground">{value}</p>
    </div>
  )
}

function StatusBadge({ status, muted = false }: { status: string; muted?: boolean }) {
  if (muted) return <Badge variant="outline" className="shrink-0 border-background/30 text-[10px] text-background/80">{status}</Badge>
  return <Badge variant="secondary" className={cn('shrink-0 text-[10px]', statusTone[status] ?? 'bg-muted text-muted-foreground')}>{status}</Badge>
}

function EmptyState({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'min-h-32 p-4' : 'min-h-[320px] p-8')}>
      <Film size={24} className="text-muted-foreground" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}
