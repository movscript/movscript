import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Database,
  Eye,
  Film,
  Layers3,
  PackageCheck,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import {
  CreativeReferenceCard,
  accentForCreativeReferenceKind,
  creativeReferenceKindMeta,
  creativeReferenceStatusMeta,
  normalizeCreativeReferenceKind,
  normalizeCreativeReferenceStatus,
  type CreativeReferenceCardKind,
  type CreativeReferenceCardStatus,
} from '@/components/creative/CreativeReferenceCard'
import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { ContentWorkspaceLayout } from '@/components/layout/ContentWorkspaceLayout'
import { SemanticEntityInlineEditor } from '@/components/shared/SemanticEntityInlineEditor'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge } from '@movscript/ui'
import { Button } from '@movscript/ui'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import { readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/pages/contents/lib/contentFilters'

type ReferenceKind = CreativeReferenceCardKind
type ReferenceStatus = CreativeReferenceCardStatus

interface CreativeReference {
  id: string | number
  kind: ReferenceKind
  title: string
  subtitle: string
  status: ReferenceStatus
  version: string
  owner: string
  usage: number
  coverage: number
  summary: string
  visualNotes: string[]
  facts: string[]
  linkedSceneMoments: string[]
  assets: string[]
  accent: string
}

type CreativeReferenceRecord = SemanticEntityRecord & {
  kind?: string
  name?: string
  alias?: string
  description?: string
  content?: string
  importance?: string
  status?: string
  profile_json?: string
  tags_json?: string
}

type CreativeReferenceUsageRecord = SemanticEntityRecord & {
  owner_type?: string
  owner_id?: number
  creative_reference_id?: number
}

type RelatedRecord = SemanticEntityRecord & {
  segment_id?: number
  scene_moment_id?: number
  owner_type?: string
  owner_id?: number
  creative_reference_id?: number
  title?: string
  name?: string
  label?: string
  summary?: string
  description?: string
  content?: string
  prompt?: string
  prompt_hint?: string
  kind?: string
  status?: string
}

const FALLBACK_REFERENCES: CreativeReference[] = [
  {
    id: 'ref-linxia',
    kind: 'person',
    title: '林夏',
    subtitle: '女主 / 雨夜受伤状态',
    status: 'review',
    version: '2.4',
    owner: '编剧组',
    usage: 12,
    coverage: 76,
    summary: '外表冷静但处在高度戒备中，左眉伤痕与湿发是雨夜段落的连续性标记。',
    visualNotes: ['黑色短外套', '湿发贴脸', '左眉浅伤', '戒备眼神'],
    facts: ['母亲线索持有人', '不主动解释旧伞来源', '对顾言保持防御距离'],
    linkedSceneMoments: ['雨夜巷口对峙', '旧伞纸条暴露', '医院走廊追问'],
    assets: ['主形象参考', '雨夜伤痕状态', '侧脸补充'],
    accent: 'from-sky-500/20 to-cyan-500/10',
  },
  {
    id: 'ref-guyan',
    kind: 'person',
    title: '顾言',
    subtitle: '男主 / 克制追问状态',
    status: 'locked',
    version: 'v1.8',
    owner: '导演组',
    usage: 8,
    coverage: 92,
    summary: '动作克制，始终和林夏保持半步距离，用低声追问制造压迫感。',
    visualNotes: ['黑色长外套', '雨伞未完全撑开', '肩线挺直', '低照度侧光'],
    facts: ['知道旧伞来历', '不直接说出母亲线索', '对第三人保持警觉'],
    linkedSceneMoments: ['雨夜巷口对峙', '第三人入画'],
    assets: ['正面参考', '半身雨景', '手部动作'],
    accent: 'from-violet-500/20 to-indigo-500/10',
  },
  {
    id: 'ref-alley',
    kind: 'location',
    title: '雨夜巷口',
    subtitle: '老城区 / 夜雨 / 低照度',
    status: 'locked',
    version: 'v1.6',
    owner: '美术组',
    usage: 9,
    coverage: 88,
    summary: '窄巷形成视觉压迫，地面积水和路灯反光用于承接人物情绪转折。',
    visualNotes: ['窄巷纵深', '路灯闪烁', '墙面旧广告', '水面高反光'],
    facts: ['巷口只能容纳两人并行', '尽头接医院侧门', '第三人从画面右侧进入'],
    linkedSceneMoments: ['雨夜巷口对峙', '旧伞纸条暴露'],
    assets: ['空间设定图', '雨夜光效', '动线草图'],
    accent: 'from-teal-500/20 to-emerald-500/10',
  },
  {
    id: 'ref-umbrella',
    kind: 'object',
    title: '旧伞',
    subtitle: '线索道具 / 反复出现',
    status: 'missing',
    version: 'v0.9',
    owner: '道具组',
    usage: 6,
    coverage: 48,
    summary: '伞柄磨损和伞骨夹层是剧情证据，缺少可用于特写镜头的清晰状态图。',
    visualNotes: ['深蓝伞面', '银色磨损伞柄', '伞骨夹层', '纸条边角露出'],
    facts: ['母亲留下的旧物', '伞骨夹层藏纸条', '必须能被观众一眼识别'],
    linkedSceneMoments: ['旧伞纸条暴露', '结尾反转留钩'],
    assets: ['基础道具图'],
    accent: 'from-amber-500/20 to-yellow-500/10',
  },
  {
    id: 'ref-rain-style',
    kind: 'style',
    title: '冷雨低照度',
    subtitle: '视觉风格 / 悬疑段落',
    status: 'locked',
    version: '2.1',
    owner: '摄影组',
    usage: 14,
    coverage: 94,
    summary: '低饱和、强反光、窄景深，避免纯氛围化，所有风格规则服务剧情证据可读性。',
    visualNotes: ['蓝绿冷调', '皮肤低饱和', '雨滴边缘光', '背景轻微失焦'],
    facts: ['不能压暗关键道具', '人物眼神必须可读', '反光用于引导视线'],
    linkedSceneMoments: ['雨夜巷口对峙', '手机屏幕推近', '旧伞纸条暴露'],
    assets: ['色彩板', '光效参考', '负面示例'],
    accent: 'from-rose-500/20 to-fuchsia-500/10',
  },
  {
    id: 'ref-phone',
    kind: 'product',
    title: '手机转账提醒',
    subtitle: '屏幕证据 / 误会触发',
    status: 'review',
    version: 'v1.2',
    owner: '后期组',
    usage: 4,
    coverage: 68,
    summary: '屏幕 UI 需要在 5 秒内让观众读懂危险信号，同时不能暴露后续反转答案。',
    visualNotes: ['高亮转账金额', '联系人昵称半遮挡', '屏幕有雨滴', '通知停留 2 秒'],
    facts: ['金额是误会触发点', '联系人不能完整显示', '屏幕反光不能盖住文字'],
    linkedSceneMoments: ['电梯压迫特写', '手机屏幕推近'],
    assets: ['屏幕 UI 草图', '文字版式参考'],
    accent: 'from-violet-500/20 to-purple-500/10',
  },
]

const referenceKinds: Array<'all' | ReferenceKind> = ['all', 'person', 'location', 'object', 'style', 'product']

function normalizeReferenceKind(value: string): 'all' | ReferenceKind {
  return referenceKinds.includes(value as 'all' | ReferenceKind) ? value as 'all' | ReferenceKind : 'all'
}

function normalizeReferenceStatus(value: string): 'all' | ReferenceStatus {
  return value in creativeReferenceStatusMeta ? value as ReferenceStatus : 'all'
}

export default function CreativeReferencesPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const referenceConfig = semanticEntityConfig('creativeReferences')
  const assetSlotConfig = semanticEntityConfig('assetSlots')
  const [creatingReference, setCreatingReference] = useState(false)
  const [creatingAssetSlot, setCreatingAssetSlot] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const kind = normalizeReferenceKind(readStringParam(searchParams, 'kind', 'all'))
  const status = normalizeReferenceStatus(readStringParam(searchParams, 'status', 'all'))
  const referenceFilterId = readStringParam(searchParams, 'reference_id')
  const selectedId = readStringParam(searchParams, 'selected')
  const query = readStringParam(searchParams, 'q')

  const referencesQuery = useQuery({
    queryKey: ['semantic-creative-references-page', projectId, 'creative-references'],
    queryFn: () => listSemanticEntities(projectId!, referenceConfig) as Promise<CreativeReferenceRecord[]>,
    enabled: !!projectId,
  })
  const usagesQuery = useQuery({
    queryKey: ['semantic-creative-references-page', projectId, 'creative-reference-usages'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('creativeReferenceUsages')) as Promise<CreativeReferenceUsageRecord[]>,
    enabled: !!projectId,
  })
  const segmentsQuery = useQuery({
    queryKey: ['semantic-creative-references-page', projectId, 'segments'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('segments')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const sceneMomentsQuery = useQuery({
    queryKey: ['semantic-creative-references-page', projectId, 'scene-moments'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('sceneMoments')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const contentUnitsQuery = useQuery({
    queryKey: ['semantic-creative-references-page', projectId, 'content-units'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('contentUnits')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })
  const assetSlotsQuery = useQuery({
    queryKey: ['semantic-creative-references-page', projectId, 'asset-slots'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('assetSlots')) as Promise<RelatedRecord[]>,
    enabled: !!projectId,
  })

  const rawReferences = referencesQuery.data ?? []
  const usages = usagesQuery.data ?? []
  const segments = segmentsQuery.data ?? []
  const sceneMoments = sceneMomentsQuery.data ?? []
  const contentUnits = contentUnitsQuery.data ?? []
  const assetSlots = assetSlotsQuery.data ?? []
  const usageCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const usage of usages) {
      if (usage.creative_reference_id) counts.set(usage.creative_reference_id, (counts.get(usage.creative_reference_id) ?? 0) + 1)
    }
    return counts
  }, [usages])
  const references = useMemo(() => {
    if (!projectId) return FALLBACK_REFERENCES
    return rawReferences.map((reference) => toReferenceViewModel(reference, usageCounts))
  }, [projectId, rawReferences, usageCounts])

  const filteredReferences = useMemo(() => {
    const q = query.trim().toLowerCase()
    return references.filter((reference) => {
      const matchesSelected = !referenceFilterId || String(reference.id) === referenceFilterId || String(reference.id).replace('ref-', '') === referenceFilterId
      const matchesKind = kind === 'all' || reference.kind === kind
      const matchesStatus = status === 'all' || reference.status === status
      const matchesQuery = !q || [reference.title, reference.subtitle, reference.summary, ...reference.visualNotes, ...reference.facts].some((item) => item.toLowerCase().includes(q))
      return matchesSelected && matchesKind && matchesStatus && matchesQuery
    })
  }, [kind, query, referenceFilterId, references, status])

  const selected = references.find((reference) => String(reference.id) === selectedId) ?? filteredReferences[0] ?? references[0] ?? null
  const selectedRecord = selected ? rawReferences.find((reference) => reference.ID === Number(selected.id)) : null
  const selectedReferenceId = selectedRecord?.ID ?? (selected && Number.isFinite(Number(selected.id)) ? Number(selected.id) : undefined)
  const segmentById = useMemo(() => new Map(segments.map((item) => [item.ID, item])), [segments])
  const sceneMomentById = useMemo(() => new Map(sceneMoments.map((item) => [item.ID, item])), [sceneMoments])
  const contentUnitById = useMemo(() => new Map(contentUnits.map((item) => [item.ID, item])), [contentUnits])
  const selectedUsages = useMemo(() => {
    if (!selectedReferenceId) return []
    return usages.filter((usage) => usage.creative_reference_id === selectedReferenceId)
  }, [selectedReferenceId, usages])
  const referencedSceneMoments = useMemo(() => dedupeRecords(selectedUsages
    .filter((usage) => usage.owner_type === 'scene_moment' && usage.owner_id)
    .map((usage) => sceneMomentById.get(usage.owner_id!))
    .filter(Boolean) as RelatedRecord[]), [sceneMomentById, selectedUsages])
  const referencedContentUnits = useMemo(() => dedupeRecords(selectedUsages
    .filter((usage) => usage.owner_type === 'content_unit' && usage.owner_id)
    .map((usage) => contentUnitById.get(usage.owner_id!))
    .filter(Boolean) as RelatedRecord[]), [contentUnitById, selectedUsages])
  const referencedSegments = useMemo(() => dedupeRecords([
    ...selectedUsages
      .filter((usage) => usage.owner_type === 'segment' && usage.owner_id)
      .map((usage) => segmentById.get(usage.owner_id!)),
    ...referencedSceneMoments.map((moment) => moment.segment_id ? segmentById.get(moment.segment_id) : undefined),
    ...referencedContentUnits.map((unit) => unit.segment_id ? segmentById.get(unit.segment_id) : undefined),
  ].filter(Boolean) as RelatedRecord[]), [referencedContentUnits, referencedSceneMoments, segmentById, selectedUsages])
  const requiredAssets = useMemo(() => {
    if (!selectedReferenceId) return []
    const sceneIds = new Set(referencedSceneMoments.map((item) => item.ID))
    const contentIds = new Set(referencedContentUnits.map((item) => item.ID))
    return assetSlots.filter((slot) => (
      slot.creative_reference_id === selectedReferenceId ||
      Boolean(slot.owner_type === 'creative_reference' && slot.owner_id === selectedReferenceId) ||
      Boolean(slot.owner_type === 'scene_moment' && slot.owner_id && sceneIds.has(slot.owner_id)) ||
      Boolean(slot.owner_type === 'content_unit' && slot.owner_id && contentIds.has(slot.owner_id))
    ))
  }, [assetSlots, referencedContentUnits, referencedSceneMoments, selectedReferenceId])
  const lockedCount = references.filter((reference) => reference.status === 'locked').length
  const reviewCount = references.filter((reference) => reference.status === 'review').length
  const missingCount = references.filter((reference) => reference.status === 'missing').length
  const averageCoverage = references.length ? Math.round(references.reduce((sum, reference) => sum + reference.coverage, 0) / references.length) : 0

  function setFilter(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
    setSearchParams(updateContentFilterParams(searchParams, updates), { replace: true })
  }

  function startCreateReference() {
    setCreatingReference(true)
    setCreatingAssetSlot(false)
  }

  function startCreateAssetSlot() {
    if (!selectedReferenceId) return
    setCreatingReference(false)
    setCreatingAssetSlot(true)
  }

  return (
    <ContentWorkspaceLayout
      header={(
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>内容区</span>
              <ChevronRight size={13} />
              <span>创作资料</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">创作资料库</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              人物、地点、道具、产品和风格作为可复用资料被情节引用，帮助制作预演、资产准备和内容生产保持连续性。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2">
              <Eye size={15} />
              查看引用图谱
            </Button>
            <Button className="gap-2" onClick={startCreateReference}>
              <Plus size={15} />
              新建资料
            </Button>
          </div>
        </header>
      )}
      overview={(
        <section className="grid grid-cols-4 gap-3">
          <MetricCard icon={Database} label="资料总数" value={references.length} detail="覆盖人物、地点、道具、产品、风格" tone="text-sky-600" />
          <MetricCard icon={ShieldCheck} label="已锁定" value={lockedCount} detail="可直接进入预演和生成" tone="text-emerald-600" />
          <MetricCard icon={AlertTriangle} label="待处理" value={reviewCount + missingCount} detail={`${reviewCount} 个待确认 / ${missingCount} 个缺资料`} tone="text-amber-600" />
          <MetricCard icon={Layers3} label="平均完整度" value={`${averageCoverage}%`} detail="按事实、视觉、资产覆盖估算" tone="text-violet-600" />
        </section>
      )}
      filters={(
        <ContentFilterBar
          query={query}
          onQueryChange={(value) => setFilter({ q: value })}
          queryPlaceholder="搜索资料、标签或事实"
          filters={[
            {
              id: 'kind',
              label: '类型',
              value: kind,
              onChange: (value) => setFilter({ kind: value }),
              options: referenceKinds.map((item) => ({
                value: item,
                label: item === 'all' ? '全部资料' : creativeReferenceKindMeta[item].label,
                count: item === 'all' ? references.length : references.filter((reference) => reference.kind === item).length,
              })),
            },
            {
              id: 'status',
              label: '状态',
              value: status,
              onChange: (value) => setFilter({ status: value }),
              options: [
                { value: 'all', label: '全部状态', count: references.length },
                { value: 'locked', label: '已锁定', count: lockedCount },
                { value: 'review', label: '待确认', count: reviewCount },
                { value: 'missing', label: '缺资料', count: missingCount },
              ],
            },
          ]}
          chips={referenceFilterId ? [{ id: 'reference', label: `资料 ${referenceFilterId}`, onRemove: () => setFilter({ reference_id: null }) }] : []}
          resultCount={filteredReferences.length}
          totalCount={references.length}
        />
      )}
      list={(
        <>
          <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">资料清单</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">以资料卡为中心管理事实、视觉状态、引用情节和资产覆盖。</p>
                </div>
              </div>

              <div className="grid max-h-[620px] grid-cols-1 gap-3 overflow-auto p-4">
                {filteredReferences.map((reference) => (
                  <ReferenceCard
                    key={reference.id}
                    reference={reference}
                    selected={selected?.id === reference.id}
                    onSelect={() => setFilter({ selected: reference.id })}
                  />
                ))}
                {filteredReferences.length === 0 && (
                  <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">暂无资料，点击“新建资料”创建。</p>
                )}
              </div>
            </div>
        </>
      )}
      detail={(
        <>
          <SemanticEntityInlineEditor
            projectId={projectId}
            config={creatingAssetSlot ? assetSlotConfig : referenceConfig}
            record={creatingReference || creatingAssetSlot ? null : selectedRecord}
            defaults={creatingAssetSlot
              ? { creative_reference_id: selectedReferenceId ?? null, kind: 'image', priority: 'normal', status: 'missing' }
              : creatingReference
                ? { kind: 'person', importance: 'supporting', status: 'draft' }
                : undefined}
            queryKey={creatingAssetSlot ? ['semantic-creative-references-page', projectId, 'asset-slots'] : ['semantic-creative-references-page', projectId]}
            title={creatingAssetSlot ? '新增素材需求' : creatingReference ? '新建创作资料' : '卡片内编辑创作资料'}
            description={creatingAssetSlot ? '为当前资料创建素材位，资料绑定会自动带入。' : '直接维护资料名称、类型、描述、内容和状态。'}
            hero={selected ? {
              icon: (() => {
                const Icon = creativeReferenceKindMeta[selected.kind].icon
                return <Icon size={19} />
              })(),
              eyebrow: creatingAssetSlot ? '素材需求' : creativeReferenceKindMeta[selected.kind].label,
              title: creatingAssetSlot ? `为 ${selected.title} 新增素材` : creatingReference ? '新建创作资料' : selected.title,
              subtitle: creatingAssetSlot ? selected.subtitle || `资料 #${selected.id}` : creatingReference ? '项目资料' : selected.subtitle || `资料 #${selected.id}`,
              summary: creatingAssetSlot ? '创建后会出现在该资料的“所需要的素材”中，并可继续补充候选或锁定资源。' : creatingReference ? '建立人物、地点、道具、产品或风格资料后，可以被情节、内容单元和素材位复用。' : selected.summary,
              accentClassName: selected.accent,
              status: <Badge variant="secondary" className={cn('text-[10px]', creativeReferenceStatusMeta[creatingReference ? 'draft' : selected.status].className)}>{creativeReferenceStatusMeta[creatingReference ? 'draft' : selected.status].label}</Badge>,
              stats: creatingAssetSlot ? [
                { label: '绑定资料', value: selected.title },
                { label: '默认类型', value: '图片' },
                { label: '默认状态', value: '缺口' },
                { label: '已有素材', value: requiredAssets.length },
              ] : creatingReference ? [
                { label: '默认类型', value: '人物' },
                { label: '重要度', value: 'supporting' },
                { label: '引用', value: 0 },
                { label: '完整度', value: '0%' },
              ] : [
                { label: '引用', value: selected.usage },
                { label: '素材', value: requiredAssets.length },
                { label: '事实', value: selected.facts.length },
                { label: '完整度', value: `${selected.coverage}%` },
              ],
            } : undefined}
            onSaved={(record) => {
              if (creatingAssetSlot) {
                setCreatingAssetSlot(false)
                assetSlotsQuery.refetch()
                return
              }
              setCreatingReference(false)
              setFilter({ selected: record.ID, reference_id: null })
            }}
            onDeleted={() => {
              setCreatingReference(false)
              setCreatingAssetSlot(false)
              setFilter({ selected: null, reference_id: null })
            }}
          />
          <Panel title="一致性检查" icon={CheckCircle2}>
            <CheckRow label="人物状态" value="3/4" ok />
            <CheckRow label="地点动线" value="2/2" ok />
            <CheckRow label="道具特写" value="1/3" />
            <CheckRow label="风格负面约束" value="已配置" ok />
          </Panel>
        </>
      )}
      preview={(
        selected ? (
          <Panel title="事实与视觉要点" icon={Sparkles}>
            <InfoList title="视觉要点" items={selected.visualNotes} />
            <div className="mt-4">
              <InfoList title="事实约束" items={selected.facts} />
            </div>
          </Panel>
        ) : null
      )}
      upstream={<div />}
      downstream={<div />}
      bottom={(
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          <RelatedPanel title="被引用的片段" icon={Layers3} records={referencedSegments} empty="当前资料暂无片段引用" />
          <RelatedPanel title="被引用的情节" icon={Film} records={referencedSceneMoments} empty="当前资料暂无情节引用" />
          <RelatedPanel title="所需要的素材" icon={PackageCheck} records={requiredAssets} empty="当前资料暂无素材需求" action={selectedReferenceId ? { label: '新增素材', onClick: startCreateAssetSlot } : undefined} />
          <RelatedPanel title="被引用的内容单元" icon={Boxes} records={referencedContentUnits} empty="当前资料暂无内容单元引用" />
        </div>
      )}
    />
  )
}

function toReferenceViewModel(reference: CreativeReferenceRecord, usageCounts: Map<number, number>): CreativeReference {
  const kind = normalizeCreativeReferenceKind(reference.kind)
  const status = normalizeCreativeReferenceStatus(reference.status)
  const tags = parseStringList(reference.tags_json)
  const contentFacts = String(reference.content ?? '')
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
  const profileNotes = parseProfileNotes(reference.profile_json)
  const coverageParts = [
    Boolean(reference.description || reference.content),
    tags.length > 0 || profileNotes.length > 0,
    status === 'confirmed' || status === 'locked',
    (usageCounts.get(reference.ID) ?? 0) > 0,
  ].filter(Boolean).length

  return {
    id: reference.ID,
    kind,
    title: reference.name || `资料 #${reference.ID}`,
    subtitle: [creativeReferenceKindMeta[kind].label, reference.alias, reference.importance].filter(Boolean).join(' / '),
    status,
    version: `#${reference.ID}`,
    owner: '项目资料',
    usage: usageCounts.get(reference.ID) ?? 0,
    coverage: Math.max(20, Math.round((coverageParts / 4) * 100)),
    summary: reference.description || reference.content || '暂无资料摘要',
    visualNotes: profileNotes.length > 0 ? profileNotes : tags.slice(0, 6),
    facts: contentFacts.length > 0 ? contentFacts : tags.slice(0, 5),
    linkedSceneMoments: [],
    assets: [],
    accent: accentForCreativeReferenceKind(kind),
  }
}

function parseStringList(value?: string): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean)
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function parseProfileNotes(value?: string): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return Object.entries(parsed)
      .slice(0, 6)
      .map(([key, item]) => `${key}: ${String(item)}`)
      .filter(Boolean)
  } catch {
    return []
  }
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Database; label: string; value: string | number; detail: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
          <Icon size={18} className={tone} />
        </span>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function Panel({ title, icon: Icon, children, action }: { title: string; icon: typeof Database; children: React.ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={14} className="shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        </div>
        {action ? (
          <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1.5 px-2 text-xs" onClick={action.onClick}>
            <Plus size={13} />
            {action.label}
          </Button>
        ) : null}
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function RelatedPanel({ title, icon: Icon, records, empty, action }: { title: string; icon: typeof Database; records: RelatedRecord[]; empty: string; action?: { label: string; onClick: () => void } }) {
  return (
    <Panel title={title} icon={Icon} action={action}>
      <RelatedList records={records} empty={empty} />
    </Panel>
  )
}

function RelatedList({ records, empty }: { records: RelatedRecord[]; empty: string }) {
  if (records.length === 0) {
    return <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">{empty}</p>
  }

  return (
    <div className="space-y-2">
      {records.slice(0, 6).map((record) => (
        <div key={record.ID} className="rounded-md border border-border bg-background px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{titleOf(record)}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{record.summary || record.description || record.content || record.prompt || record.prompt_hint || record.kind || `ID ${record.ID}`}</p>
            </div>
            <Badge variant="secondary" className="shrink-0 text-[10px]">{record.status ?? '草稿'}</Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

function titleOf(record?: RelatedRecord | null) {
  if (!record) return '未命名'
  return record.title || record.name || record.label || `#${record.ID}`
}

function dedupeRecords<T extends { ID: number }>(records: T[]) {
  const map = new Map<number, T>()
  records.forEach((record) => {
    if (!map.has(record.ID)) map.set(record.ID, record)
  })
  return [...map.values()]
}

function ReferenceCard({ reference, selected, onSelect }: { reference: CreativeReference; selected: boolean; onSelect: () => void }) {
  return (
    <CreativeReferenceCard reference={reference} selected={selected} onSelect={onSelect} />
  )
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{item}</span>
        ))}
      </div>
    </div>
  )
}

function CheckRow({ label, value, ok = false }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      {ok ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertTriangle size={14} className="text-amber-600" />}
      <span className="min-w-0 flex-1 text-xs text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{value}</span>
    </div>
  )
}
