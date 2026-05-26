import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Film,
  Image,
  Layers3,
  X,
} from 'lucide-react'
import {
  Button,
  ResourcePreviewDrawerBody,
  ResourcePreviewDrawerFooter,
  ResourcePreviewDrawerHeader,
  ResourcePreviewDrawerMain,
  ResourcePreviewDrawerMainBlock,
  ResourcePreviewDrawerOverlay,
  ResourcePreviewDrawerShell,
  ResourcePreviewDrawerSidebar,
  ResourcePreviewDrawerSidebarContent,
  ResourcePreviewDrawerSidebarFooter,
  ResourcePreviewDrawerSidebarHeader,
  ResourcePreviewEmptyBlock,
  ResourcePreviewEmptyStoryFlow,
  ResourcePreviewFrameEmptyMedia,
  ResourcePreviewMissingAssets,
  ResourcePreviewMobileNode,
  ResourcePreviewMobileTree,
  ResourcePreviewRootTreeItem,
  ResourcePreviewStateMessage,
  ResourcePreviewStats,
  ResourcePreviewStoryFrame,
  ResourcePreviewStoryPanel,
  ResourcePreviewTreeEmpty,
  ResourcePreviewTreeFrameRow,
  ResourcePreviewTreeList,
  ResourcePreviewTreeNode,
  StatusBadge,
  type StatusIntent
} from '@movscript/ui'
import { generatePreview, type PreviewContentUnit, type PreviewGenerateResponse, type PreviewKeyframe, type PreviewScope } from '@/shared/infrastructure/api/preview'
import { AuthedImage } from '@/shared/ui/AuthedImage'
import { productionIdentifier, sceneIdentifier, unitIdentifier } from '@/features/content/domain/productionIdentifiers'

interface PreviewDrawerProps {
  open: boolean
  onClose: () => void
  projectId: number
  scope: PreviewScope
  entityId: number
  entityTitle?: string
}

type PreviewStoryNode = {
  unit: PreviewContentUnit
  keyframes: PreviewKeyframe[]
}

const scopeLabel: Record<PreviewScope, string> = {
  segment: '编排段',
  scene_moment: '情景',
  content_unit: '制作项',
}

const priorityLabel: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

function priorityIntent(priority: string | undefined): StatusIntent {
  if (priority === 'high') return 'danger'
  if (priority === 'medium') return 'warning'
  return 'neutral'
}

export function PreviewDrawer({ open, onClose, projectId, scope, entityId, entityTitle }: PreviewDrawerProps) {
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)
  const [expandedUnits, setExpandedUnits] = useState<Set<number>>(() => new Set())
  const { data, isLoading, isError } = useQuery({
    queryKey: ['preview', projectId, scope, entityId],
    queryFn: () => generatePreview(projectId, scope, entityId),
    enabled: open && !!entityId && !!projectId,
    staleTime: 30_000,
  })

  const storyNodes = useMemo(() => buildStoryNodes(data), [data])
  const selectedNode = storyNodes.find((node) => node.unit.id === selectedUnitId)
  const selectedKeyframes = selectedNode?.keyframes ?? [...(data?.keyframes ?? [])].sort(compareOrder)

  function toggleUnit(unitId: number) {
    setExpandedUnits((current) => {
      const next = new Set(current)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }

  return (
    <>
      <ResourcePreviewDrawerOverlay open={open} onClick={onClose} />
      <ResourcePreviewDrawerShell open={open}>
        <ResourcePreviewDrawerHeader
          icon={<Clapperboard size={16} />}
          badge={scopeLabel[scope]}
          title={entityTitle || data?.entity.title || '内容预览'}
          description={[sceneIdentifier({ scene_code: data?.context.scene_moment_code }), data?.context.scene_moment_title || data?.context.segment_title || data?.entity.description || '编排段结构驱动预览，画面流承接真实剧情。'].filter(Boolean).join(' · ')}
          closeIcon={<X size={16} />}
          closeLabel="关闭"
          onClose={onClose}
        />

        <ResourcePreviewDrawerBody>
          <ResourcePreviewDrawerSidebar>
            <ResourcePreviewDrawerSidebarHeader
              icon={<Layers3 size={14} />}
              title="编排段树"
              description="外层只看叙事推进；展开后再看每段承载的关键画面。"
            />
            <ResourcePreviewDrawerSidebarContent>
              {isLoading ? (
                <LoadingBlock label="读取编排段结构" />
              ) : isError ? (
                <ErrorBlock />
              ) : storyNodes.length === 0 ? (
                <EmptyBlock title="暂无预览结构" detail="需要先补充制作项或情节预览画面，预览才能形成可观看的剧情树。" />
              ) : (
                <ResourcePreviewTreeList>
                  <ResourcePreviewRootTreeItem
                    icon={<Film size={14} />}
                    title="整集预览画面"
                    description="从上到下查看全部真实剧情画面。"
                    onClick={() => setSelectedUnitId(null)}
                    active={selectedUnitId === null}
                  />
                  {storyNodes.map((node, index) => (
                    <StoryTreeNode
                      key={node.unit.id}
                      node={node}
                      index={index}
                      sceneCode={data?.context.scene_moment_code}
                      selected={selectedUnitId === node.unit.id}
                      expanded={expandedUnits.has(node.unit.id)}
                      onSelect={() => setSelectedUnitId(node.unit.id)}
                      onToggle={() => toggleUnit(node.unit.id)}
                    />
                  ))}
                </ResourcePreviewTreeList>
              )}
            </ResourcePreviewDrawerSidebarContent>
            {data && (
              <ResourcePreviewDrawerSidebarFooter>
                <PreviewStats data={data} />
              </ResourcePreviewDrawerSidebarFooter>
            )}
          </ResourcePreviewDrawerSidebar>

          <ResourcePreviewDrawerMain>
            {isLoading && (
              <ResourcePreviewDrawerMainBlock>
                <ResourcePreviewStateMessage text="加载中…" />
              </ResourcePreviewDrawerMainBlock>
            )}

            {isError && (
              <ResourcePreviewDrawerMainBlock>
                <ResourcePreviewStateMessage tone="danger" text="加载失败，请关闭后重试" />
              </ResourcePreviewDrawerMainBlock>
            )}

            {data && (
              <ResourcePreviewDrawerMainBlock>
                <MobileTree data={data} nodes={storyNodes} />

                <ResourcePreviewStoryPanel
                  icon={Film}
                  title="真实剧情流"
                  action={
                    <StatusBadge intent="neutral" className="type-tiny">
                      {selectedNode ? productionIdentifier({ scene_code: data.context.scene_moment_code }, selectedNode.unit) || selectedNode.unit.title || `制作项 #${selectedNode.unit.id}` : '全部画面'}
                    </StatusBadge>
                  }
                  intro="画面从上到下就是观众看到的剧情顺序；镜头关键帧会按开头、中间、结尾承接生产约束。"
                >
                  {selectedKeyframes.length === 0 ? (
                    <EmptyStoryFlow />
                  ) : (
                    <>
                      {selectedKeyframes.map((keyframe, index) => (
                        <StoryFrame
                          key={keyframe.id}
                          keyframe={keyframe}
                          index={index}
                          frameContext={frameContextFor(storyNodes, keyframe, index, selectedNode)}
                        />
                      ))}
                    </>
                  )}
                </ResourcePreviewStoryPanel>

                {data.missing_assets.length > 0 && (
                  <ResourcePreviewMissingAssets
                    icon={<AlertTriangle size={14} />}
                    title={`${data.missing_assets.length} 个素材待补充`}
                    assets={data.missing_assets.map((asset) => ({
                      id: asset.id,
                      name: asset.name,
                      description: asset.description || '暂无说明',
                      priorityProps: { intent: priorityIntent(asset.priority) },
                      priorityLabel: priorityLabel[asset.priority] ?? asset.priority,
                    }))}
                  />
                )}
              </ResourcePreviewDrawerMainBlock>
            )}
          </ResourcePreviewDrawerMain>
        </ResourcePreviewDrawerBody>

        <ResourcePreviewDrawerFooter>
          <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
            关闭
          </Button>
        </ResourcePreviewDrawerFooter>
      </ResourcePreviewDrawerShell>
    </>
  )
}

function buildStoryNodes(data?: PreviewGenerateResponse): PreviewStoryNode[] {
  if (!data) return []
  const units = [...data.content_units].sort(compareOrder)
  const unitIds = new Set(units.map((unit) => unit.id))
  const keyframesByUnit = new Map<number, PreviewKeyframe[]>()
  for (const keyframe of data.keyframes) {
    if (!keyframe.content_unit_id || !unitIds.has(keyframe.content_unit_id)) continue
    const group = keyframesByUnit.get(keyframe.content_unit_id) ?? []
    group.push(keyframe)
    keyframesByUnit.set(keyframe.content_unit_id, group)
  }
  return units.map((unit) => ({
    unit,
    keyframes: (keyframesByUnit.get(unit.id) ?? []).sort(compareOrder),
  }))
}

function compareOrder<T extends { order: number; id: number }>(a: T, b: T) {
  return (a.order || 0) - (b.order || 0) || a.id - b.id
}

function StoryTreeNode({
  node,
  index,
  sceneCode,
  selected,
  expanded,
  onSelect,
  onToggle,
}: {
  node: PreviewStoryNode
  index: number
  sceneCode?: string
  selected: boolean
  expanded: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  const duration = formatDuration(node.unit.duration_sec)
  const identifier = productionIdentifier({ scene_code: sceneCode }, node.unit)
  return (
    <ResourcePreviewTreeNode
      active={selected}
      expanded={expanded}
      toggleIcon={expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      toggleLabel={expanded ? '收起' : '展开'}
      onToggle={onToggle}
      onSelect={onSelect}
      indexLabel={String(index + 1).padStart(2, '0')}
      identifier={identifier}
      title={node.unit.title || `制作项 #${node.unit.id}`}
      description={node.unit.description || '暂无段落说明'}
      metaItems={[node.unit.kind || 'content', duration, `${node.keyframes.length} 镜头关键帧`]}
    >
      {node.keyframes.length === 0 ? (
        <ResourcePreviewTreeEmpty>暂无镜头关键帧</ResourcePreviewTreeEmpty>
      ) : node.keyframes.map((keyframe, keyframeIndex) => (
        <ResourcePreviewTreeFrameRow
          key={keyframe.id}
          statusProps={{ intent: keyframe.has_asset ? 'success' : 'warning' }}
          role={frameRoleLabel(keyframeIndex, node.keyframes.length)}
          title={keyframe.title || `画面 #${keyframe.id}`}
        />
      ))}
    </ResourcePreviewTreeNode>
  )
}

type FrameContext = {
  unit?: PreviewContentUnit
  localIndex: number
  total: number
  scopeLabel: string
}

function StoryFrame({ keyframe, index, frameContext }: { keyframe: PreviewKeyframe; index: number; frameContext: FrameContext }) {
  return (
    <ResourcePreviewStoryFrame
      media={keyframe.resource_url ? <AuthedImage src={keyframe.resource_url} alt={keyframe.title || '剧情画面'} /> : undefined}
      emptyMedia={<ResourcePreviewFrameEmptyMedia icon={<Image size={24} />} label="待补画面" />}
      frameNumber={String(index + 1).padStart(2, '0')}
      unitLabel={unitIdentifier(frameContext.unit) || frameContext.unit?.title || frameContext.scopeLabel}
      roleLabel={frameRoleLabel(frameContext.localIndex, frameContext.total)}
      statusProps={{ intent: keyframe.has_asset ? 'success' : 'warning' }}
      statusLabel={keyframe.has_asset ? '可预览' : '待补素材资源'}
      title={keyframe.title || '未命名预览画面'}
      description={keyframe.description}
      prompt={keyframe.prompt}
    />
  )
}

function frameContextFor(nodes: PreviewStoryNode[], keyframe: PreviewKeyframe, fallbackIndex: number, selectedNode?: PreviewStoryNode): FrameContext {
  const node = nodes.find((item) => item.unit.id === keyframe.content_unit_id) ?? selectedNode
  if (!node) {
    return {
      localIndex: fallbackIndex,
      total: 1,
      scopeLabel: '情节预览画面',
    }
  }
  const localIndex = Math.max(0, node.keyframes.findIndex((item) => item.id === keyframe.id))
  return {
    unit: node.unit,
    localIndex: localIndex >= 0 ? localIndex : fallbackIndex,
    total: Math.max(1, node.keyframes.length),
    scopeLabel: '镜头关键帧',
  }
}

function frameRoleLabel(index: number, total: number) {
  if (total <= 1) return '关键画面'
  if (index <= 0) return '开头帧'
  if (index >= total - 1) return '结尾帧'
  if (total === 3) return '中间帧'
  return `中间帧 ${index}`
}

function PreviewStats({ data }: { data: PreviewGenerateResponse }) {
  return (
    <ResourcePreviewStats
      metrics={[
        { icon: Boxes, label: '段落', value: data.content_units.length },
        { icon: Image, label: '画面', value: data.keyframes.length },
        { icon: AlertTriangle, label: '缺口', value: data.missing_assets.length },
      ]}
    />
  )
}

function MobileTree({ data, nodes }: { data: PreviewGenerateResponse; nodes: PreviewStoryNode[] }) {
  return (
    <ResourcePreviewMobileTree icon={Layers3} title="编排段树" stats={<PreviewStats data={data} />}>
      {nodes.length === 0 ? (
        <EmptyBlock title="暂无预览结构" detail="需要先补充制作项或预览画面。" />
      ) : nodes.map((node, index) => (
        <ResourcePreviewMobileNode
          key={node.unit.id}
          indexLabel={String(index + 1).padStart(2, '0')}
          identifier={productionIdentifier({ scene_code: data.context.scene_moment_code }, node.unit)}
          title={node.unit.title || `制作项 #${node.unit.id}`}
          frameCount={`${node.keyframes.length} 帧`}
          description={node.unit.description || '暂无段落说明'}
        />
      ))}
    </ResourcePreviewMobileTree>
  )
}

function EmptyStoryFlow() {
  return (
    <ResourcePreviewEmptyStoryFlow
      icon={Image}
      title="暂无预览画面"
      detail="补充情节预览画面或镜头关键帧后，这里会按从上到下的顺序呈现真实剧情。"
    />
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <ResourcePreviewStateMessage text={`${label}…`} />
  )
}

function ErrorBlock() {
  return (
    <ResourcePreviewStateMessage tone="danger" text="加载失败" />
  )
}

function EmptyBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <ResourcePreviewEmptyBlock title={title} detail={detail} />
  )
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '未估时'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}
