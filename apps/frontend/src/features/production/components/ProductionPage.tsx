import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  Clapperboard,
  Clock3,
  Film,
  GitBranch,
  ListChecks,
  PackageCheck,
  Play,
  Plus,
  Route,
  ScrollText,
  Sparkles,
  Video,
  Wand2,
} from 'lucide-react'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { SemanticEntityCrudDialog } from '@/shared/ui/SemanticEntityCrudDialog'
import {
  ProductionPageActionButton,
  ProductionPageActivityStack,
  ProductionPageAsideActionGrid,
  ProductionPageBadge,
  ProductionPageBottomGrid,
  ProductionPageAreaCard,
  ProductionPageAreaCardIdentity,
  ProductionPageAreaCardMetric,
  ProductionPageActivityItem,
  ProductionPageCardDescription,
  ProductionPageCardHeader,
  ProductionPageCardSubtitle,
  ProductionPageCardTitle,
  ProductionPageDetailGrid,
  ProductionPageEmptyActions,
  ProductionPageEmptyState,
  ProductionPageEyebrow,
  ProductionPageFooterAction,
  ProductionPageHeaderFrame,
  ProductionPageLayout,
  ProductionPageListCard,
  ProductionPageListStack,
  ProductionPageMain,
  ProductionPageMetaItem,
  ProductionPageMetaRow,
  ProductionPageMetric,
  ProductionPageNextActionItem,
  ProductionPagePreviewActionSlot,
  ProductionPagePreviewDescription,
  ProductionPagePreviewMetaStack,
  ProductionPagePreviewMetaLine,
  ProductionPagePreviewProgress,
  ProductionPagePreviewTitle,
  ProductionPageProgressRow,
  ProductionPageScrollArea,
  ProductionPageSection,
  ProductionPageSectionActionText,
  ProductionPageStack,
  ProductionPageStatusBadge,
  ProductionPageUnitBody,
  ProductionPageUnitCode,
  ProductionPageUnitCodeLine,
  ProductionPageUnitRow,
  ProductionPageUnitSummary,
  ProductionPageUnitText,
  ProductionPageUnitTitle,
  ProjectSurfaceHeader,
} from '@movscript/ui'
import { StatusDot } from '@movscript/ui'
import { isGeneratedKeyframeCandidateRecord } from '@/features/agent/domain/agentGeneratedResourceBinding'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { productionStatusRecipe, productionUnitStatusRecipe } from '@/features/production/presentation/productionSemanticUi'
import { ROUTES, mergeSearch, withRouteParams } from '@/routes/projectRoutes'

type ProductionStatus = 'planning' | 'previewing' | 'materializing' | 'producing' | 'reviewing' | 'delivered'
type UnitStatus = 'done' | 'active' | 'waiting' | 'blocked'

const PRODUCTION_STATUSES = new Set<ProductionStatus>(['planning', 'previewing', 'materializing', 'producing', 'reviewing', 'delivered'])

interface ProductionArea {
  key: string
  title: string
  description: string
  icon: LucideIcon
  count: number
  progress: number
  status: UnitStatus
  href: string
}

interface ProductionUnit {
  id: string
  title: string
  summary: string
  timeRange: string
  duration: number
  status: UnitStatus
  assets: string
  content: string
}

interface ProductionRecord {
  dbId: number
  id: string
  name: string
  status: ProductionStatus
  source: string
  owner: string
  progress: number
  updatedAt: string
  description: string
  preview: {
    title: string
    status: UnitStatus
    progress: number
    savedAt: string
    confirmedAt?: string
  }
  stats: {
    segments: number
    sceneMoments: number
    references: number
    assets: number
    contents: number
    finals: number
  }
  areas: ProductionArea[]
  units: ProductionUnit[]
  blockers: string[]
  nextActions: string[]
}

type ProductionBackendRecord = SemanticEntityRecord & {
  script_version_id?: number
  preview_timeline_id?: number
  name?: string
  description?: string
  status?: string
  source_type?: string
  owner_label?: string
  progress?: number
}

type ProductionData = {
  productions: ProductionBackendRecord[]
  segments: SemanticEntityRecord[]
  sceneMoments: SemanticEntityRecord[]
  creativeReferences: SemanticEntityRecord[]
  creativeReferenceUsages: SemanticEntityRecord[]
  contentUnits: SemanticEntityRecord[]
  assetSlots: SemanticEntityRecord[]
  keyframes: SemanticEntityRecord[]
  previewTimelines: SemanticEntityRecord[]
  deliveryVersions: SemanticEntityRecord[]
}

export default function ProductionPage() {
  const project = useProjectStore((s) => s.current)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = project?.ID
  const [selectedId, setSelectedId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const productionQueryKey = ['production-frame', projectId] as const
  const { data: productionData } = useQuery<ProductionData>({
    queryKey: productionQueryKey,
    queryFn: () => loadProductionData(projectId!),
    enabled: !!projectId,
    refetchInterval: 60_000,
  })

  const productions = useMemo(() => buildProductionRecords(productionData), [productionData])
  const routeProductionId = Number(searchParams.get('productionId'))
  const routeSelected = routeProductionId ? productions.find((item) => item.dbId === routeProductionId) : undefined
  const explicitSelected = routeSelected ?? productions.find((item) => item.id === selectedId)
  const selected = explicitSelected ?? productions[0]
  const selectedProductionId = selected?.dbId

  useEffect(() => {
    if (selectedId && !productions.some((item) => item.id === selectedId)) setSelectedId('')
  }, [productions, selectedId])

  useEffect(() => {
    const productionId = Number(searchParams.get('productionId'))
    if (!productionId || productions.length === 0) return
    const production = productions.find((item) => item.dbId === productionId)
    if (production) setSelectedId(production.id)
  }, [productions, searchParams])

  useEffect(() => {
    if (!selectedProductionId || !explicitSelected) return
    const current = Number(searchParams.get('productionId'))
    if (current === selectedProductionId) return
    const next = new URLSearchParams(searchParams)
    next.set('productionId', String(selectedProductionId))
    next.delete('created')
    setSearchParams(next, { replace: true })
  }, [explicitSelected, searchParams, selectedProductionId, setSearchParams])

  const aggregate = useMemo(() => {
    const active = productions.filter((item) => item.status !== 'delivered').length
    const delivered = productions.filter((item) => item.status === 'delivered').length
    const blocked = productions.filter((item) => item.blockers.length > 0).length
    const avg = productions.length ? Math.round(productions.reduce((sum, item) => sum + item.progress, 0) / productions.length) : 0
    return { active, delivered, blocked, avg }
  }, [productions])

  function selectProduction(production: ProductionRecord) {
    setSelectedId(production.id)
    const next = new URLSearchParams(searchParams)
    next.set('productionId', String(production.dbId))
    next.delete('created')
    setSearchParams(next, { replace: true })
  }

  return (
    <ProductionPageLayout>
        <ProductionPageHeaderFrame>
          <ProjectSurfaceHeader
            icon={Boxes}
            title="制作"
            description="一个项目可以包含多个制作。每个制作承载一次从剧本到成片的完整创作单元，并统一挂载编排段、情景、设定资料、素材需求、制作项和成片。"
            meta={<ProductionPageBadge variant="outline">{productions.length} 个制作</ProductionPageBadge>}
            actions={(
              <>
                <ProductionPageActionButton variant="outline" asChild>
                  <Link to={ROUTES.project.scripts}>
                    <Plus size={14} />
                    去剧本创建
                  </Link>
                </ProductionPageActionButton>
                <ProductionPageActionButton onClick={() => setCreateOpen(true)}>
                  <Plus size={14} />
                  直接创建制作
                </ProductionPageActionButton>
              </>
            )}
          />
        </ProductionPageHeaderFrame>

        <ProductionPageScrollArea>
          <ProductionPageStack>
            <ProductionPageSection title="制作" icon={Boxes} action={<ProductionPageBadge variant="outline">{productions.length} 个制作</ProductionPageBadge>} bodyVariant="metrics">
                <Metric label="进行中" value={aggregate.active} />
                <Metric label="已成片" value={aggregate.delivered} />
                <Metric label="阻塞制作" value={aggregate.blocked} />
                <Metric label="平均进度" value={`${aggregate.avg}%`} />
            </ProductionPageSection>

            <ProductionPageSection
              title="项目制作"
              icon={Clapperboard}
              action={<ProductionPageBadge variant="outline">{productions.length}</ProductionPageBadge>}
              bodyVariant="cards"
            >
              {productions.length > 0 ? productions.map((production) => (
                <ProductionListCard
                  key={production.id}
                  production={production}
                  active={production.id === selected?.id}
                  onSelect={() => selectProduction(production)}
                />
              )) : (
                <ProductionPageEmptyState
                  title="暂无制作"
                  detail="可以直接创建制作，也可以先完成创作编排后再从剧本创建。"
                  action={(
                    <ProductionPageEmptyActions>
                      <ProductionPageActionButton variant="outline" asChild>
                        <Link to={ROUTES.project.productionOrchestration}>
                          <Route size={14} />
                          创作编排
                        </Link>
                      </ProductionPageActionButton>
                      <ProductionPageActionButton onClick={() => setCreateOpen(true)}>
                        <Plus size={14} />
                        直接创建制作
                      </ProductionPageActionButton>
                    </ProductionPageEmptyActions>
                  )}
                />
              )}
            </ProductionPageSection>

            {selected ? <ProductionPageMain>
              <ProductionPageStack>
              <ProductionPageSection
                title={selected.name}
                description={selected.description}
                eyebrow={(
                  <ProductionPageEyebrow>
                    <ProductionPageStatusBadge {...productionStatusRecipe(selected.status)} label={productionStatusLabel(selected.status)} />
                    <ProductionPageBadge variant="outline">{selected.id}</ProductionPageBadge>
                    <ProductionPageBadge>来源：{selected.source}</ProductionPageBadge>
                  </ProductionPageEyebrow>
                )}
                bodyVariant="stats"
              >
                  <StatCard icon={GitBranch} label="编排段" value={selected.stats.segments} />
                  <StatCard icon={Route} label="情景" value={selected.stats.sceneMoments} />
                  <StatCard icon={Sparkles} label="设定资料" value={selected.stats.references} />
                  <StatCard icon={PackageCheck} label="素材需求" value={selected.stats.assets} />
                  <StatCard icon={Film} label="制作项" value={selected.stats.contents} />
                  <StatCard icon={Video} label="成片" value={selected.stats.finals} />
              </ProductionPageSection>

              <ProductionPageDetailGrid>
                <ProductionPageSection
                  title="推演对象"
                  description="从编排段推导出情景、设定资料、素材需求、制作项与成片。"
                  bodyVariant="areas"
                >
                    {selected.areas.map((area) => (
                      <AreaCard key={area.key} area={area} production={selected} />
                    ))}
                </ProductionPageSection>

                <ProductionPageSection
                  title="预览挂载"
                  icon={ListChecks}
                  action={<UnitStatusBadge status={selected.preview.status} />}
                >
                    <ProductionPagePreviewTitle>{selected.preview.title}</ProductionPagePreviewTitle>
                    <ProductionPagePreviewDescription>
                      预览挂在制作下面，用于追踪编排段、预览画面、素材和制作项准备情况。
                    </ProductionPagePreviewDescription>
                    <ProductionPagePreviewProgress value={selected.preview.progress} />
                    <ProductionPagePreviewMetaStack>
                      <ProductionPagePreviewMetaLine>最近保存：{selected.preview.savedAt ? formatDateTime(selected.preview.savedAt) : '暂无'}</ProductionPagePreviewMetaLine>
                      <ProductionPagePreviewMetaLine>确认时间：{selected.preview.confirmedAt ? formatDateTime(selected.preview.confirmedAt) : '暂无'}</ProductionPagePreviewMetaLine>
                    </ProductionPagePreviewMetaStack>
                    <ProductionPagePreviewActionSlot>
                      <ProductionPageActionButton variant="outline" size="sm" asChild>
                        <Link to={productionContentWorkbenchHref(selected)}>
                          <Play size={14} />
                          内容编排
                        </Link>
                      </ProductionPageActionButton>
                    </ProductionPagePreviewActionSlot>
                </ProductionPageSection>
              </ProductionPageDetailGrid>

              <ProductionPageSection
                title="制作项"
                icon={ScrollText}
                action={<ProductionPageSectionActionText>制作项结构由内容编排工作台统一拆解、检查和推进。</ProductionPageSectionActionText>}
                bodyVariant="units"
              >
                  {selected.units.map((unit) => (
                    <ProductionUnitRow key={unit.id} unit={unit} />
                  ))}
              </ProductionPageSection>
              </ProductionPageStack>
            </ProductionPageMain> : null}

            {selected ? <ProductionPageBottomGrid>
            <ProductionPageSection title="下一步" icon={Wand2}>
              <ProductionPageListStack>
                {selected.nextActions.map((item, index) => (
                  <ProductionPageNextActionItem
                    key={item}
                    index={index + 1}
                    onClick={() => navigate(productionNextActionHref(item, selected))}
                  >
                    {item}
                  </ProductionPageNextActionItem>
                ))}
              </ProductionPageListStack>
            </ProductionPageSection>

            <ProductionPageSection title="最近动态" icon={Clock3}>
              <ProductionPageActivityStack>
                {[
                  ['预览', selected.preview.status === 'done' ? '已有确认记录，可作为制作输入。' : '可继续挂载或更新预览记录。'],
                  ['编排段', `${selected.stats.segments} 个编排段已挂在制作下。`],
                  ['素材', `${selected.stats.assets} 个素材需求等待候选或锁定。`],
                  ['成片', selected.stats.finals > 0 ? '已有成片版本进入交付检查。' : '尚未生成成片版本。'],
                ].map(([label, text]) => (
                  <ProductionPageActivityItem key={label} label={label}>{text}</ProductionPageActivityItem>
                ))}
              </ProductionPageActivityStack>
            </ProductionPageSection>

            <ProductionPageAsideActionGrid>
              <ProductionPageActionButton variant="outline" asChild>
                <Link to={mergeSearch(ROUTES.project.preProduction, '', { tab: 'assets' })}>
                  <PackageCheck size={14} />
                  素材
                </Link>
              </ProductionPageActionButton>
              <ProductionPageActionButton variant="outline" asChild>
                <Link to={deliveryWorkbenchHref(selected)}>
                  <Video size={14} />
                  成片
                </Link>
              </ProductionPageActionButton>
            </ProductionPageAsideActionGrid>
            </ProductionPageBottomGrid> : null}
          </ProductionPageStack>
        </ProductionPageScrollArea>
      <SemanticEntityCrudDialog
        open={createOpen}
        mode="create"
        projectId={projectId}
        config={semanticEntityConfig('productions')}
        defaults={{ source_type: 'direct', status: 'planning', owner_label: '导演组', progress: 0 }}
        queryKey={productionQueryKey}
        title="直接创建制作"
        onOpenChange={setCreateOpen}
        onSaved={(record) => setSelectedId(`PRD-${record.ID}`)}
      />
    </ProductionPageLayout>
  )
}

function ProductionListCard({ production, active, onSelect }: { production: ProductionRecord; active: boolean; onSelect: () => void }) {
  return (
    <ProductionPageListCard
      active={active}
      onSelect={onSelect}
      footer={(
        <ProductionPageFooterAction variant={active ? 'soft' : 'outline'} asChild>
          <Link to={withRouteParams(ROUTES.project.productionOrchestration, { productionId: production.dbId })}>
            <Route size={14} />
            创作编排
          </Link>
        </ProductionPageFooterAction>
      )}
    >
      <ProductionPageCardHeader
        aside={<ProductionPageStatusBadge {...productionStatusRecipe(production.status)} label={productionStatusLabel(production.status)} />}
      >
        <ProductionPageCardTitle prefix={<StatusDot intent={productionStatusRecipe(production.status).intent} />}>
          {production.name}
        </ProductionPageCardTitle>
        <ProductionPageCardSubtitle>{production.source}</ProductionPageCardSubtitle>
      </ProductionPageCardHeader>
      <ProductionPageCardDescription>{production.description}</ProductionPageCardDescription>
      <ProductionPageProgressRow value={production.progress} />
      <ProductionPageMetaRow>
        <ProductionPageMetaItem>{production.owner}</ProductionPageMetaItem>
        <ProductionPageMetaItem>{production.updatedAt}</ProductionPageMetaItem>
      </ProductionPageMetaRow>
    </ProductionPageListCard>
  )
}

function AreaCard({ area, production }: { area: ProductionArea; production: ProductionRecord }) {
  const Icon = area.icon
  const href = productionAreaHref(area, production)
  return (
    <ProductionPageAreaCard>
      <Link to={href}>
        <ProductionPageCardHeader aside={<UnitStatusBadge status={area.status} />}>
          <ProductionPageAreaCardIdentity
            icon={(
              <Icon size={14} />
            )}
          >
            <ProductionPageCardTitle>{area.title}</ProductionPageCardTitle>
            <ProductionPageCardSubtitle>{area.description}</ProductionPageCardSubtitle>
          </ProductionPageAreaCardIdentity>
        </ProductionPageCardHeader>
        <ProductionPageAreaCardMetric value={area.count} progress={area.progress} />
      </Link>
    </ProductionPageAreaCard>
  )
}

function ProductionUnitRow({ unit }: { unit: ProductionUnit }) {
  return (
    <ProductionPageUnitRow>
      <ProductionPageUnitCode>
        <ProductionPageUnitCodeLine>{unit.id}</ProductionPageUnitCodeLine>
        <ProductionPageUnitCodeLine>{unit.timeRange}</ProductionPageUnitCodeLine>
      </ProductionPageUnitCode>
      <ProductionPageUnitBody>
        <ProductionPageUnitTitle>{unit.title}</ProductionPageUnitTitle>
        <ProductionPageUnitSummary>{unit.summary}</ProductionPageUnitSummary>
      </ProductionPageUnitBody>
      <ProductionPageUnitText>{unit.assets}</ProductionPageUnitText>
      <ProductionPageUnitText>{unit.content}</ProductionPageUnitText>
      <UnitStatusBadge status={unit.status} />
    </ProductionPageUnitRow>
  )
}

function UnitStatusBadge({ status }: { status: UnitStatus }) {
  return <ProductionPageStatusBadge {...productionUnitStatusRecipe(status)} label={unitStatusLabel(status)} />
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | string }) {
  return <ProductionPageMetric icon={Icon} label={label} value={value} compact />
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <ProductionPageMetric label={label} value={value} compact />
}

async function loadProductionData(projectId: number): Promise<ProductionData> {
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
    deliveryVersions,
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
    listSemanticEntities(projectId, semanticEntityConfig('deliveryVersions')),
  ])
  return {
    productions: productions as ProductionBackendRecord[],
    segments,
    sceneMoments,
    creativeReferences,
    creativeReferenceUsages,
    contentUnits,
    assetSlots,
    keyframes,
    previewTimelines,
    deliveryVersions,
  }
}

function buildProductionRecords(data?: ProductionData): ProductionRecord[] {
  if (!data?.productions.length) return []
  return data.productions.map((production) => {
    const productionId = production.ID
    const relatedSegmentIds = relatedSegmentIdsForProduction(production, data)
    const relatedSceneMomentIds = relatedSceneMomentIdsForProduction(relatedSegmentIds, productionId, data)
    const relatedContentUnits = contentUnitsForProduction(relatedSegmentIds, relatedSceneMomentIds, productionId, data)
    const relatedContentUnitIds = new Set(relatedContentUnits.map((item) => item.ID))
    const assetSlots = assetSlotsForProduction(relatedSegmentIds, relatedSceneMomentIds, relatedContentUnitIds, productionId, data)
    const keyframes = keyframesForProduction(relatedSceneMomentIds, relatedContentUnitIds, productionId, data)
    const previewTimelines = recordsForProduction(data.previewTimelines, productionId)
    const deliveryVersions = recordsForProduction(data.deliveryVersions, productionId)
    const units = mapContentUnitsToProductionUnits(relatedContentUnits, assetSlots)
    const relatedReferenceIds = relatedReferenceIdsForProduction(relatedSegmentIds, relatedSceneMomentIds, relatedContentUnitIds, assetSlots, data)
    const relatedSegmentCount = relatedSegmentIds.size
    const relatedSceneMomentCount = relatedSceneMomentIds.size
    const relatedReferenceCount = relatedReferenceIds.size
    const blockedUnits = units.filter((unit) => unit.status === 'blocked').length
    const activeUnits = units.filter((unit) => unit.status === 'active').length
    const doneUnits = units.filter((unit) => unit.status === 'done').length
    const unitProgress = Math.round((doneUnits / Math.max(units.length, 1)) * 100)
    const previewConfirmed = previewTimelines.some((item) => item.status === 'confirmed')
    const previewProgress = previewConfirmed ? 100 : previewTimelines.length > 0 ? 65 : 0
    const storedProgress = Number(production.progress ?? 0)
    const progress = storedProgress > 0 ? clampProgress(storedProgress) : Math.round((previewProgress * 0.3) + (unitProgress * 0.45) + (deliveryVersions.length > 0 ? 20 : 0))

    return {
      dbId: productionId,
      id: `PRD-${productionId}`,
      name: production.name || `制作 ${productionId}`,
      status: normalizeProductionStatus(production.status, previewConfirmed, deliveryVersions),
      source: sourceLabel(production),
      owner: production.owner_label || '导演组',
      progress: clampProgress(progress),
      updatedAt: production.UpdatedAt ? formatShortDate(production.UpdatedAt) : '',
      description: production.description || '直接创建的制作。可以继续挂载预览、制作项、素材需求和成片版本。',
      preview: {
        title: previewTimelines[0]?.name as string || '未挂载预览',
        status: previewConfirmed ? 'done' : previewTimelines.length > 0 ? 'active' : 'waiting',
        progress: previewProgress,
        savedAt: String(previewTimelines[0]?.UpdatedAt ?? ''),
      },
      stats: {
        segments: relatedSegmentCount,
        sceneMoments: relatedSceneMomentCount,
        references: relatedReferenceCount,
        assets: assetSlots.length,
        contents: units.length,
        finals: deliveryVersions.length,
      },
      areas: buildAreas({
        previewProgress,
        segmentCount: relatedSegmentCount,
        sceneMomentCount: relatedSceneMomentCount,
        referenceCount: relatedReferenceCount,
        assetCount: assetSlots.length,
        contentCount: units.length,
        finalCount: deliveryVersions.length,
        blockedUnits,
        activeUnits,
      }),
      units,
      blockers: [
        ...(blockedUnits > 0 ? [`${blockedUnits} 个制作项仍有素材需求或设定资料缺口。`] : []),
        ...(units.length === 0 ? ['当前制作还没有制作项。'] : []),
      ],
      nextActions: nextActionsForProduction({ blockedUnits, units: units.length, deliveryVersions: deliveryVersions.length, keyframes: keyframes.length }),
    }
  })
}

function buildAreas(input: {
  previewProgress: number
  segmentCount: number
  sceneMomentCount: number
  referenceCount: number
  assetCount: number
  contentCount: number
  finalCount: number
  blockedUnits: number
  activeUnits: number
}): ProductionArea[] {
  return [
    {
      key: 'segments',
      title: '编排段',
      description: '叙事和制作块',
      icon: GitBranch,
      count: input.segmentCount,
      progress: input.previewProgress,
      status: input.segmentCount > 0 ? 'active' : 'waiting',
      href: ROUTES.project.productionOrchestration,
    },
    {
      key: 'sceneMoments',
      title: '情景',
      description: '时间、地点、条件和动作',
      icon: Route,
      count: input.sceneMomentCount,
      progress: input.sceneMomentCount > 0 ? 60 : 0,
      status: input.sceneMomentCount > 0 ? 'active' : 'waiting',
      href: ROUTES.project.productionOrchestration,
    },
    {
      key: 'references',
      title: '设定资料',
      description: '人物、场景、道具、风格规则',
      icon: Sparkles,
      count: input.referenceCount,
      progress: input.referenceCount > 0 ? 60 : 0,
      status: input.referenceCount > 0 ? 'active' : 'waiting',
      href: mergeSearch(ROUTES.project.preProduction, '', { tab: 'settings' }),
    },
    {
      key: 'assets',
      title: '素材需求',
      description: '从编排段和设定资料推演出的素材需求',
      icon: PackageCheck,
      count: input.assetCount,
      progress: input.blockedUnits > 0 ? 38 : input.assetCount > 0 ? 68 : 0,
      status: input.blockedUnits > 0 ? 'blocked' : input.assetCount > 0 ? 'active' : 'waiting',
      href: mergeSearch(ROUTES.project.preProduction, '', { tab: 'assets' }),
    },
    {
      key: 'content',
      title: '制作项',
      description: '正式候选、返工和锁定目标',
      icon: Film,
      count: input.contentCount,
      progress: input.activeUnits > 0 ? 44 : input.contentCount > 0 ? 30 : 0,
      status: input.contentCount > 0 ? 'active' : 'waiting',
      href: ROUTES.project.contentUnitWorkbench,
    },
    {
      key: 'final',
      title: '成片',
      description: '时间线、版本和交付输出',
      icon: Video,
      count: input.finalCount,
      progress: input.finalCount > 0 ? 72 : 0,
      status: input.finalCount > 0 ? 'active' : 'waiting',
      href: ROUTES.project.deliveryWorkbench,
    },
  ]
}

function mapContentUnitsToProductionUnits(rows: SemanticEntityRecord[], assetSlots: SemanticEntityRecord[]): ProductionUnit[] {
  let cursor = 0
  return rows.map((row, index) => {
    const duration = Number(row.duration_sec ?? 0)
    const start = cursor
    const end = cursor + duration
    cursor = end
    const slots = assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === row.ID)
    const blocked = slots.some((slot) => slot.status === 'missing')
    const status = contentUnitStatus(row.status, blocked)
    return {
      id: `CU-${String(index + 1).padStart(3, '0')}`,
      title: String(row.title || `制作项 ${index + 1}`),
      summary: String(row.description || row.prompt || '制作下的正式制作项。'),
      timeRange: `${formatTime(start)}-${formatTime(end)}`,
      duration,
      status,
      assets: slots.length > 0 ? `${slots.filter((slot) => slot.status === 'locked').length}/${slots.length} 已锁定` : '暂无素材需求',
      content: cameraPlanSummary(row) || (status === 'done' ? '已锁定' : status === 'active' ? '制作中' : status === 'blocked' ? '有阻塞' : '待生成'),
    }
  })
}

function cameraPlanSummary(row: SemanticEntityRecord) {
  return [
    row.shot_size,
    row.camera_angle,
    row.camera_motion,
    row.motion_intensity,
    row.camera_speed,
    row.lens,
    row.focal_length,
  ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' · ')
}

function formatTime(seconds: number) {
  const minute = Math.floor(seconds / 60)
  const second = Math.round(seconds % 60)
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

function recordsForProduction(records: SemanticEntityRecord[], productionId: number) {
  return records.filter((item) => Number(item.production_id) === productionId)
}

function relatedSegmentIdsForProduction(production: ProductionBackendRecord, data: ProductionData) {
  const productionId = production.ID
  const ids = new Set<number>()
  for (const segment of data.segments) {
    if (Number(segment.production_id) === productionId) ids.add(segment.ID)
    if (production.script_version_id && Number(segment.script_version_id) === Number(production.script_version_id)) ids.add(segment.ID)
  }
  for (const unit of data.contentUnits.filter((item) => Number(item.production_id) === productionId)) {
    addRecordId(ids, unit.segment_id)
    const sceneMoment = data.sceneMoments.find((item) => item.ID === Number(unit.scene_moment_id))
    addRecordId(ids, sceneMoment?.segment_id)
  }
  for (const slot of data.assetSlots.filter((item) => Number(item.production_id) === productionId)) {
    if (slot.owner_type === 'segment') addRecordId(ids, slot.owner_id)
    if (slot.owner_type === 'scene_moment') {
      const sceneMoment = data.sceneMoments.find((item) => item.ID === Number(slot.owner_id))
      addRecordId(ids, sceneMoment?.segment_id)
    }
    if (slot.owner_type === 'content_unit') {
      const unit = data.contentUnits.find((item) => item.ID === Number(slot.owner_id))
      addRecordId(ids, unit?.segment_id)
      const sceneMoment = data.sceneMoments.find((item) => item.ID === Number(unit?.scene_moment_id))
      addRecordId(ids, sceneMoment?.segment_id)
    }
  }
  return ids
}

function relatedSceneMomentIdsForProduction(segmentIds: Set<number>, productionId: number, data: ProductionData) {
  const ids = new Set<number>()
  for (const moment of data.sceneMoments) {
    if (segmentIds.has(Number(moment.segment_id))) ids.add(moment.ID)
  }
  for (const unit of recordsForProduction(data.contentUnits, productionId)) {
    addRecordId(ids, unit.scene_moment_id)
  }
  for (const slot of recordsForProduction(data.assetSlots, productionId)) {
    if (slot.owner_type === 'scene_moment') addRecordId(ids, slot.owner_id)
    if (slot.owner_type === 'content_unit') {
      const unit = data.contentUnits.find((item) => item.ID === Number(slot.owner_id))
      addRecordId(ids, unit?.scene_moment_id)
    }
  }
  return ids
}

function contentUnitsForProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, productionId: number, data: ProductionData) {
  return data.contentUnits.filter((unit) => (
    Number(unit.production_id) === productionId ||
    segmentIds.has(Number(unit.segment_id)) ||
    sceneMomentIds.has(Number(unit.scene_moment_id))
  ))
}

function assetSlotsForProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, contentUnitIds: Set<number>, productionId: number, data: ProductionData) {
  return data.assetSlots.filter((slot) => (
    Number(slot.production_id) === productionId ||
    (slot.owner_type === 'segment' && segmentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'scene_moment' && sceneMomentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'content_unit' && contentUnitIds.has(Number(slot.owner_id)))
  ))
}

function keyframesForProduction(sceneMomentIds: Set<number>, contentUnitIds: Set<number>, productionId: number, data: ProductionData) {
  return data.keyframes.filter((keyframe) => !isGeneratedKeyframeCandidateRecord(keyframe) && (
    Number(keyframe.production_id) === productionId ||
    sceneMomentIds.has(Number(keyframe.scene_moment_id)) ||
    contentUnitIds.has(Number(keyframe.content_unit_id))
  ))
}

function relatedReferenceIdsForProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, contentUnitIds: Set<number>, assetSlots: SemanticEntityRecord[], data: ProductionData) {
  const ids = new Set<number>()
  for (const usage of data.creativeReferenceUsages) {
    if (
      (usage.owner_type === 'segment' && segmentIds.has(Number(usage.owner_id))) ||
      (usage.owner_type === 'scene_moment' && sceneMomentIds.has(Number(usage.owner_id))) ||
      (usage.owner_type === 'content_unit' && contentUnitIds.has(Number(usage.owner_id)))
    ) {
      addRecordId(ids, usage.creative_reference_id)
    }
  }
  for (const slot of assetSlots) {
    addRecordId(ids, slot.creative_reference_id)
  }
  return new Set([...ids].filter((id) => data.creativeReferences.some((reference) => reference.ID === id)))
}

function addRecordId(target: Set<number>, value: unknown) {
  const id = Number(value)
  if (Number.isFinite(id) && id > 0) target.add(id)
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeProductionStatus(status: unknown, previewConfirmed: boolean, deliveryVersions: SemanticEntityRecord[]): ProductionStatus {
  const value = String(status ?? '')
  if (PRODUCTION_STATUSES.has(value as ProductionStatus)) return value as ProductionStatus
  if (deliveryVersions.some((item) => item.status === 'exported' || item.status === 'approved')) return 'reviewing'
  return previewConfirmed ? 'producing' : 'planning'
}

function productionStatusLabel(status: ProductionStatus) {
  const labels: Record<ProductionStatus, string> = {
    planning: '筹备中',
    previewing: '预览中',
    materializing: '资料推演',
    producing: '制作中',
    reviewing: '审片中',
    delivered: '已成片',
  }
  return labels[status]
}

function unitStatusLabel(status: UnitStatus) {
  const labels: Record<UnitStatus, string> = {
    done: '已完成',
    active: '进行中',
    waiting: '待处理',
    blocked: '阻塞',
  }
  return labels[status]
}

function sourceLabel(production: ProductionBackendRecord) {
  if (production.source_type === 'script' && production.script_version_id) return `剧本版本 #${production.script_version_id}`
  if (production.source_type === 'brief') return '简介创建'
  if (production.source_type === 'preview' && production.preview_timeline_id) return `预览 #${production.preview_timeline_id}`
  if (production.source_type === 'import') return '导入创建'
  return '直接创建'
}

function contentUnitStatus(status: unknown, blocked: boolean): UnitStatus {
  if (blocked) return 'blocked'
  if (status === 'locked') return 'done'
  if (status === 'in_production') return 'active'
  if (status === 'confirmed') return 'active'
  return 'waiting'
}

function nextActionsForProduction(input: { blockedUnits: number; units: number; deliveryVersions: number; keyframes: number }) {
  if (input.units === 0) return ['创建或导入制作项。', '为制作项补充素材需求。', '进入内容编排拆解制作项。']
  if (input.blockedUnits > 0) return ['先补齐阻塞制作项的素材需求。', '锁定关键设定资料和素材资源。', '再进入生成候选与选片。']
  if (input.deliveryVersions === 0) return ['生成正式候选。', '选择可进入成片时间线的版本。', '创建第一版成片并进入交付检查。']
  return ['复核成片版本。', '归档生成记录和审核意见。', '准备导出或交付。']
}

function productionNextActionHref(action: string, production: ProductionRecord) {
  const lower = action.toLowerCase()
  if (action.includes('素材') || action.includes('资料')) return withRouteParams(ROUTES.project.preProduction, { tab: 'assets', production_id: production.dbId })
  if (action.includes('内容编排')) return productionContentWorkbenchHref(production)
  if (action.includes('预览') || action.includes('时间线')) return withRouteParams(ROUTES.project.productionOrchestration, { productionId: production.dbId })
  if (action.includes('内容') || action.includes('候选') || action.includes('选片')) return productionContentWorkbenchHref(production)
  if (action.includes('成片') || action.includes('交付') || action.includes('导出') || action.includes('审核')) return deliveryHref(production)
  if (lower.includes('archive') || action.includes('归档')) return deliveryHref(production)
  const area = production.areas.find((item) => item.status === 'blocked') ?? production.areas.find((item) => item.status === 'waiting' || item.status === 'active')
  return area ? productionAreaHref(area, production) : productionContentWorkbenchHref(production)
}

function productionAreaHref(area: ProductionArea, production: ProductionRecord) {
  if (area.key === 'final') return deliveryWorkbenchHref(production)
  if (area.key === 'content') return productionContentWorkbenchHref(production)
  if (area.key === 'segments' || area.key === 'sceneMoments') return withRouteParams(ROUTES.project.productionOrchestration, { productionId: production.dbId })
  if (area.key === 'assets') return withRouteParams(ROUTES.project.preProduction, { tab: 'assets', production_id: production.dbId })
  return area.href
}

function deliveryHref(production: ProductionRecord) {
  return deliveryWorkbenchHref(production)
}

function deliveryWorkbenchHref(production: ProductionRecord) {
  return withRouteParams(ROUTES.project.deliveryWorkbench, { productionId: production.dbId })
}

function productionContentWorkbenchHref(production: ProductionRecord) {
  return withRouteParams(ROUTES.project.contentUnitWorkbench, { productionId: production.dbId })
}

function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
