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
import { AppEmptyState, AppKeyValue, AppMetricCard, AppPanel, AppStateMessage, Badge, Button, ReviewCallout, SemanticDot, WorkbenchList, WorkbenchListItem, WorkbenchSurfaceItem, semanticToneClass, type SemanticTone } from '@movscript/ui'
import { generatePreview, type PreviewContentUnit, type PreviewGenerateResponse, type PreviewKeyframe, type PreviewScope } from '@/api/preview'
import { AuthedImage } from '@/components/shared/AuthedImage'
import { productionIdentifier, sceneIdentifier, unitIdentifier } from '@/lib/productionIdentifiers'
import { cn } from '@/lib/utils'

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

function priorityTone(priority: string | undefined): SemanticTone {
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
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
          onClick={onClose}
        />
      )}
      <div
        className={cn(
          'fixed right-0 top-0 z-40 flex h-full w-[min(1120px,96vw)] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Clapperboard size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0 type-tiny">{scopeLabel[scope]}</Badge>
              <span className="truncate type-body font-semibold text-foreground">{entityTitle || data?.entity.title || '内容预览'}</span>
            </div>
            <p className="mt-0.5 truncate type-label text-muted-foreground">
              {[sceneIdentifier({ scene_code: data?.context.scene_moment_code }), data?.context.scene_moment_title || data?.context.segment_title || data?.entity.description || '编排段结构驱动预览，画面流承接真实剧情。'].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="shrink-0"
            aria-label="关闭"
          >
            <X size={16} />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[360px] shrink-0 flex-col border-r border-border bg-muted/20 lg:flex">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2 type-body font-semibold text-foreground">
                <Layers3 size={14} />
                编排段树
              </div>
              <p className="mt-1 type-label leading-5 text-muted-foreground">
                外层只看叙事推进；展开后再看每段承载的关键画面。
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {isLoading ? (
                <LoadingBlock label="读取编排段结构" />
              ) : isError ? (
                <ErrorBlock />
              ) : storyNodes.length === 0 ? (
                <EmptyBlock title="暂无预览结构" detail="需要先补充制作项或情节预览画面，预览才能形成可观看的剧情树。" />
              ) : (
                <WorkbenchList>
                  <WorkbenchListItem
                    onClick={() => setSelectedUnitId(null)}
                    active={selectedUnitId === null}
                  >
                    <div className="flex items-center gap-2">
                      <Film size={14} className="text-muted-foreground" />
                      <span className="type-body font-semibold text-foreground">整集预览画面</span>
                    </div>
                    <p className="mt-1 type-label leading-5 text-muted-foreground">从上到下查看全部真实剧情画面。</p>
                  </WorkbenchListItem>
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
                </WorkbenchList>
              )}
            </div>
            {data && (
              <div className="border-t border-border p-3">
                <PreviewStats data={data} />
              </div>
            )}
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto">
            {isLoading && (
              <div className="p-4">
                <AppStateMessage text="加载中…" />
              </div>
            )}

            {isError && (
              <div className="p-4">
                <AppStateMessage tone="danger" text="加载失败，请关闭后重试" />
              </div>
            )}

            {data && (
              <div className="space-y-4 p-4">
                <MobileTree data={data} nodes={storyNodes} />

                <AppPanel
                  icon={Film}
                  title="真实剧情流"
                  bodyClassName="p-0"
                  action={
                    <Badge variant="outline" className="type-tiny">
                      {selectedNode ? productionIdentifier({ scene_code: data.context.scene_moment_code }, selectedNode.unit) || selectedNode.unit.title || `制作项 #${selectedNode.unit.id}` : '全部画面'}
                    </Badge>
                  }
                >
                  <p className="border-b border-border px-4 py-3 type-label leading-5 text-muted-foreground">
                    画面从上到下就是观众看到的剧情顺序；镜头关键帧会按开头、中间、结尾承接生产约束。
                  </p>

                  {selectedKeyframes.length === 0 ? (
                    <EmptyStoryFlow />
                  ) : (
                    <div className="divide-y divide-border">
                      {selectedKeyframes.map((keyframe, index) => (
                        <StoryFrame
                          key={keyframe.id}
                          keyframe={keyframe}
                          index={index}
                          frameContext={frameContextFor(storyNodes, keyframe, index, selectedNode)}
                        />
                      ))}
                    </div>
                  )}
                </AppPanel>

                {data.missing_assets.length > 0 && (
                  <ReviewCallout tone="warning" className="p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <AlertTriangle size={14} className={semanticToneClass('warning', 'icon')} />
                      <span className="type-body font-medium text-foreground">{data.missing_assets.length} 个素材待补充</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {data.missing_assets.map((asset) => (
                        <AppKeyValue
                          key={asset.id}
                          label={asset.name}
                          valueClassName="line-clamp-1 whitespace-normal"
                          value={(
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="min-w-0 flex-1 truncate">{asset.description || '暂无说明'}</span>
                              <span className={cn('shrink-0 rounded px-1.5 py-0.5 type-tiny font-medium', semanticToneClass(priorityTone(asset.priority), 'badge'))}>
                                {priorityLabel[asset.priority] ?? asset.priority}
                              </span>
                            </span>
                          )}
                        />
                      ))}
                    </div>
                  </ReviewCallout>
                )}
              </div>
            )}
          </main>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
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
    <WorkbenchSurfaceItem active={selected} className="p-0">
      <div className="flex items-start gap-2 p-2.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onToggle}
          className="mt-0.5 shrink-0"
          aria-label={expanded ? '收起' : '展开'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </Button>
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 type-tiny tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
            {identifier ? <Badge variant="outline" className="shrink-0 type-tiny">{identifier}</Badge> : null}
            <p className="truncate type-body font-semibold text-foreground">{node.unit.title || `制作项 #${node.unit.id}`}</p>
          </div>
          <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">{node.unit.description || '暂无段落说明'}</p>
          <div className="mt-2 flex items-center gap-2 type-caption text-muted-foreground">
            <span>{node.unit.kind || 'content'}</span>
            <span>·</span>
            <span>{duration}</span>
            <span>·</span>
            <span>{node.keyframes.length} 镜头关键帧</span>
          </div>
        </button>
      </div>
      {expanded && (
        <div className="space-y-1 border-t border-border px-3 py-2">
          {node.keyframes.length === 0 ? (
            <p className="px-8 py-1 type-caption text-muted-foreground">暂无镜头关键帧</p>
          ) : node.keyframes.map((keyframe, keyframeIndex) => (
            <div key={keyframe.id} className="ml-8 flex items-center gap-2 type-caption text-muted-foreground">
              <SemanticDot tone={keyframe.has_asset ? 'success' : 'warning'} className="h-1.5 w-1.5" />
              <span className="shrink-0 type-tiny">{frameRoleLabel(keyframeIndex, node.keyframes.length)}</span>
              <span className="truncate">{keyframe.title || `画面 #${keyframe.id}`}</span>
            </div>
          ))}
        </div>
      )}
    </WorkbenchSurfaceItem>
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
    <article className="grid gap-4 p-4 md:grid-cols-[minmax(220px,42%)_1fr]">
      <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
        <div className="relative aspect-video w-full">
          {keyframe.resource_url ? (
            <AuthedImage src={keyframe.resource_url} alt={keyframe.title || '剧情画面'} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
              <Image size={24} />
              <span className="type-label">待补画面</span>
            </div>
          )}
          <span className="absolute left-2 top-2 rounded bg-background/90 px-2 py-1 type-tiny font-medium tabular-nums text-foreground shadow-sm">
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>
      </div>
      <div className="min-w-0 py-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="type-tiny">{unitIdentifier(frameContext.unit) || frameContext.unit?.title || frameContext.scopeLabel}</Badge>
          <Badge variant="secondary" className="type-tiny">{frameRoleLabel(frameContext.localIndex, frameContext.total)}</Badge>
          <span className={cn('rounded px-1.5 py-0.5 type-tiny font-medium', semanticToneClass(keyframe.has_asset ? 'success' : 'warning', 'badge'))}>
            {keyframe.has_asset ? '可预览' : '待补素材资源'}
          </span>
        </div>
        <h3 className="type-body font-semibold leading-5 text-foreground">{keyframe.title || '未命名预览画面'}</h3>
        {keyframe.description && (
          <p className="mt-2 type-label leading-5 text-muted-foreground">{keyframe.description}</p>
        )}
        {keyframe.prompt && (
          <p className="mt-3 line-clamp-3 rounded-md bg-muted/50 px-3 py-2 type-caption leading-5 text-muted-foreground">{keyframe.prompt}</p>
        )}
      </div>
    </article>
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
    <div className="grid grid-cols-3 gap-2">
      <AppMetricCard icon={Boxes} label="段落" value={data.content_units.length} compact />
      <AppMetricCard icon={Image} label="画面" value={data.keyframes.length} compact />
      <AppMetricCard icon={AlertTriangle} label="缺口" value={data.missing_assets.length} compact />
    </div>
  )
}

function MobileTree({ data, nodes }: { data: PreviewGenerateResponse; nodes: PreviewStoryNode[] }) {
  return (
    <AppPanel icon={Layers3} title="编排段树" action={<PreviewStats data={data} />} className="lg:hidden" bodyClassName="space-y-2">
      <div className="space-y-2">
        {nodes.length === 0 ? (
          <EmptyBlock title="暂无预览结构" detail="需要先补充制作项或预览画面。" />
        ) : nodes.map((node, index) => (
          <AppKeyValue
            key={node.unit.id}
            label={(
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 type-tiny tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                {productionIdentifier({ scene_code: data.context.scene_moment_code }, node.unit) ? <Badge variant="outline" className="shrink-0 type-tiny">{productionIdentifier({ scene_code: data.context.scene_moment_code }, node.unit)}</Badge> : null}
                <span className="min-w-0 flex-1 truncate type-body font-semibold text-foreground">{node.unit.title || `制作项 #${node.unit.id}`}</span>
                <Badge variant="outline" className="shrink-0 type-tiny">{node.keyframes.length} 帧</Badge>
              </span>
            )}
            value={node.unit.description || '暂无段落说明'}
            valueClassName="line-clamp-2 whitespace-normal"
          />
        ))}
      </div>
    </AppPanel>
  )
}

function EmptyStoryFlow() {
  return (
    <AppEmptyState
      icon={Image}
      title="暂无预览画面"
      detail="补充情节预览画面或镜头关键帧后，这里会按从上到下的顺序呈现真实剧情。"
      className="min-h-60"
    />
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <AppStateMessage text={`${label}…`} />
  )
}

function ErrorBlock() {
  return (
    <AppStateMessage tone="danger" text="加载失败" />
  )
}

function EmptyBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <AppEmptyState title={title} detail={detail} compact />
  )
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '未估时'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}
