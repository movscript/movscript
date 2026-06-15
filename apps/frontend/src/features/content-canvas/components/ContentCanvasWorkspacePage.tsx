import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PanelResizeHandle, useResizablePanel } from '@movscript/ui/layout'
import {
  Box,
  Building2,
  CircleDot,
  FileImage,
  Film,
  KeyRound,
  Link2,
  Palette,
  Plus,
  Rows3,
  ScrollText,
  Settings2,
  Shirt,
  Sparkles,
  SquareStack,
  Star,
  UserRound,
  Video,
  WandSparkles,
  Image,
  ListFilter,
  Minus,
  Search,
  TextCursorInput,
  type LucideIcon,
} from 'lucide-react'
import {
  routeLayoutSpecForPathname,
  CONTENT_CANVAS_INSPECTOR_DEFAULT_WIDTH,
  CONTENT_CANVAS_INSPECTOR_MAX_WIDTH,
  CONTENT_CANVAS_INSPECTOR_MIN_WIDTH,
  CONTENT_CANVAS_INSPECTOR_PANE_ID,
  CONTENT_CANVAS_SETTING_CATALOG_DEFAULT_HEIGHT,
  CONTENT_CANVAS_SETTING_CATALOG_MAX_HEIGHT,
  CONTENT_CANVAS_SETTING_CATALOG_MIN_HEIGHT,
  CONTENT_CANVAS_SETTING_CATALOG_PANE_ID,
  CONTENT_CANVAS_STRUCTURE_DEFAULT_WIDTH,
  CONTENT_CANVAS_STRUCTURE_MAX_WIDTH,
  CONTENT_CANVAS_STRUCTURE_MIN_WIDTH,
  CONTENT_CANVAS_STRUCTURE_PANE_ID,
  CONTENT_CANVAS_TIMELINE_DEFAULT_HEIGHT,
  CONTENT_CANVAS_TIMELINE_MAX_HEIGHT,
  CONTENT_CANVAS_TIMELINE_MIN_HEIGHT,
  CONTENT_CANVAS_TIMELINE_PANE_ID,
} from '@/routes/routeLayoutRegistry'
import { useRouteLayoutPaneController } from '@/features/app-shell/application/useRouteLayoutPaneController'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { contentCanvasKeys } from '../application/contentCanvasQueryKeys'
import {
  clearContentCanvasNodePositions,
  mergeContentCanvasNodePositions,
  readContentCanvasViewState,
  type ContentCanvasNodePosition,
  type ContentCanvasViewStateScope,
} from '../application/contentCanvasViewState'
import { loadContentCanvasProject } from '../application/loadContentCanvasProject'
import { buildContentCanvasGraph } from '../domain/contentCanvasGraph'
import type { ContentCanvasEdge, ContentCanvasGraph, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import './ContentCanvasWorkspacePage.css'

type SettingKind =
  | 'character'
  | 'location'
  | 'prop'
  | 'costume'
  | 'visual_style'
  | 'world_rule'
  | 'relationship'
  | 'sound_motif'

type CanvasMode = 'scene_moment' | 'setting'

type RadialNode = {
  id: string
  code: string
  title: string
  description: string
  x: number
  y: number
  Icon: LucideIcon
  variant?: 'primary' | 'state' | 'asset' | 'expression' | 'shot' | 'keyframe' | 'storyboard'
  parentId?: string
  source?: ContentCanvasNode
}

type InspectorSelection =
  | { kind: 'scene_moment', node: RadialNode }
  | { kind: 'setting', setting: ContentCanvasNode }
  | { kind: 'state', node: RadialNode }
  | { kind: 'asset', node: RadialNode }
  | { kind: 'other', node: RadialNode }

const ASSET_PROMPTS: Record<string, string> = {}
const CANVAS_WORLD_WIDTH = 760
const CANVAS_WORLD_HEIGHT = 460

const SCENE_MAIN_NODE: RadialNode = {
  id: 'scene-main',
  code: 'SCN',
  title: '电话打断告白',
  description: 'scene_moment 主节点',
  x: 50,
  y: 50,
  Icon: Film,
  variant: 'primary',
}


export default function ContentCanvasWorkspacePage() {
  const paneLayout = useContentCanvasPaneLayout()
  const project = useProjectStore((state) => state.current)
  const projectId = project?.ID
  const [settingQuery, setSettingQuery] = useState('')
  const [activeKind, setActiveKind] = useState<SettingKind | 'all'>('all')
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('scene_moment')
  const [activeSettingId, setActiveSettingId] = useState<string | null>(null)
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<InspectorSelection>({ kind: 'scene_moment', node: SCENE_MAIN_NODE })
  const [assetPrompts, setAssetPrompts] = useState(ASSET_PROMPTS)

  const projectQuery = useQuery({
    queryKey: contentCanvasKeys.project(projectId),
    queryFn: () => loadContentCanvasProject(projectId!),
    enabled: Boolean(projectId),
  })
  const graph = useMemo(
    () => projectQuery.data ? buildContentCanvasGraph(projectQuery.data) : emptyContentCanvasGraph(),
    [projectQuery.data],
  )
  const graphIndex = useMemo(() => contentCanvasGraphIndex(graph), [graph])
  const settingNodes = useMemo(() => graph.nodes.filter((node) => node.kind === 'setting'), [graph.nodes])
  const sceneNodes = useMemo(() => graph.nodes.filter((node) => node.kind === 'scene_moment'), [graph.nodes])
  const activeSetting = useMemo(
    () => settingNodes.find((node) => node.id === activeSettingId) ?? settingNodes[0] ?? null,
    [activeSettingId, settingNodes],
  )
  const activeScene = useMemo(
    () => sceneNodes.find((node) => node.id === activeSceneId) ?? sceneNodes[0] ?? null,
    [activeSceneId, sceneNodes],
  )
  const sceneMainNode = useMemo(
    () => activeScene ? radialNodeFromContentNode(activeScene, 50, 50, 'primary') : SCENE_MAIN_NODE,
    [activeScene],
  )
  const settingMainNode = useMemo(
    () => activeSetting ? radialNodeFromContentNode(activeSetting, 50, 50, 'primary') : null,
    [activeSetting],
  )
  const sceneRelationNodes = useMemo(
    () => activeScene ? radialNodesAround(activeScene, graphIndex, ['expression_unit', 'shot', 'keyframe', 'storyboard', 'audio_cue']) : [],
    [activeScene, graphIndex],
  )
  const settingRelationNodes = useMemo(
    () => activeSetting ? radialNodesAround(activeSetting, graphIndex, ['state', 'asset']) : [],
    [activeSetting, graphIndex],
  )
  const radialLayout = useContentCanvasRadialLayout({
    projectId,
    mode: canvasMode,
    mainNodeId: canvasMode === 'scene_moment' ? activeScene?.id : activeSetting?.id,
  })
  const laidOutSceneMainNode = sceneMainNode
  const laidOutSettingMainNode = settingMainNode
  const laidOutSceneRelationNodes = useMemo(
    () => radialLayout.applyNodePositions(sceneRelationNodes),
    [radialLayout, sceneRelationNodes],
  )
  const laidOutSettingRelationNodes = useMemo(
    () => radialLayout.applyNodePositions(settingRelationNodes),
    [radialLayout, settingRelationNodes],
  )
  const tree = useMemo(() => contentCanvasStructureTree(graph, activeScene?.id), [activeScene?.id, graph])
  const timelineItems = useMemo(
    () => activeScene ? sceneTimelineItemsFromGraph(activeScene, graphIndex) : [],
    [activeScene, graphIndex],
  )

  const filteredSettings = useMemo(() => {
    const needle = settingQuery.trim().toLowerCase()
    return settingNodes.filter((item) => {
      const kind = settingKindFromNode(item)
      const active = activeKind === 'all' || kind === activeKind
      if (!active) return false
      if (!needle) return true
      return [
        item.id,
        kind,
        item.entityKey,
        item.title,
        item.subtitle,
        item.summary,
        item.status,
        item.sourcePath,
      ].join(' ').toLowerCase().includes(needle)
    })
  }, [activeKind, settingNodes, settingQuery])

  return (
    <section
      className="content-canvas-workspace-page"
      data-main-node={canvasMode}
      data-testid="content-canvas-workspace-page"
      style={paneLayout.style}
    >
      <header className="content-canvas-workspace-top">
        <div className="content-canvas-workspace-top__filter">
          <label className="content-canvas-workspace-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={settingQuery}
              onChange={(event) => setSettingQuery(event.target.value)}
              placeholder="筛选 Setting 名称、状态、作用域"
              aria-label="筛选顶部 Setting 节点"
            />
          </label>
          <div className="content-canvas-workspace-chips" aria-label="Setting 节点筛选">
            <button type="button" data-active={activeKind === 'all' ? 'true' : undefined} onClick={() => setActiveKind('all')}>全部</button>
            <button type="button" data-active={activeKind === 'character' ? 'true' : undefined} onClick={() => setActiveKind('character')}>角色</button>
            <button type="button" data-active={activeKind === 'location' ? 'true' : undefined} onClick={() => setActiveKind('location')}>场景</button>
            <button type="button" data-active={activeKind === 'prop' ? 'true' : undefined} onClick={() => setActiveKind('prop')}>道具</button>
            <button type="button" data-active={activeKind === 'visual_style' ? 'true' : undefined} onClick={() => setActiveKind('visual_style')}>视觉</button>
          </div>
          <span className="content-canvas-workspace-count">{filteredSettings.length}/{settingNodes.length} Setting</span>
        </div>

        <div className="content-canvas-catalog" aria-label="Setting 节点卡片网格">
          {projectQuery.isLoading ? (
            <div className="content-canvas-catalog-empty">正在读取项目数据...</div>
          ) : filteredSettings.length ? filteredSettings.map((item) => {
            const Icon = iconForContentNode(item)
            return (
            <button
              key={item.id}
              type="button"
              className="content-canvas-catalog-card"
              data-status={item.status}
              draggable
              onClick={() => {
                setActiveSettingId(item.id)
                setCanvasMode('setting')
                setSelectedNode({ kind: 'setting', setting: item })
              }}
              aria-label={`${item.title} Setting 节点`}
            >
              <span className="content-canvas-catalog-card__icon">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="content-canvas-catalog-card__copy">
                <strong>{item.title}</strong>
                <small>{item.summary || item.subtitle}</small>
              </span>
              <span className="content-canvas-catalog-card__status">{contentStatusLabel(item.status)}</span>
              <span className="content-canvas-catalog-card__code">SET</span>
              <span className="content-canvas-catalog-card__scope">{item.subtitle}</span>
            </button>
          )}) : (
            <div className="content-canvas-catalog-empty">当前项目暂无 Setting 节点</div>
          )}
        </div>
        <ContentCanvasResizeHandle
          className="content-canvas-resize-handle content-canvas-resize-handle--top"
          resizeHandleProps={paneLayout.settingCatalog.resizeHandleProps}
        />
      </header>

      <aside className="content-canvas-workspace-sidebar" aria-label="Production Segment Scene Moment 层级">
        <div className="content-canvas-workspace-sidebar__header">
          <div>
            <strong>结构层级</strong>
            <span>只到 Production / Segment / Scene Moment</span>
          </div>
          <button type="button" title="筛选层级" aria-label="筛选层级">
            <ListFilter size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="content-canvas-workspace-sidebar__actions" aria-label="添加结构节点">
          <button type="button"><Plus size={13} aria-hidden="true" /> Pro</button>
          <button type="button"><Plus size={13} aria-hidden="true" /> Seg</button>
          <button type="button"><Plus size={13} aria-hidden="true" /> Sec</button>
        </div>
        <label className="content-canvas-workspace-sidebar__search">
          <Search size={14} aria-hidden="true" />
          <input defaultValue="雨夜" aria-label="搜索结构层级" />
        </label>
        <div className="content-canvas-workspace-tree">
          {tree.length ? tree.map((node) => <TreeNode key={node.id ?? node.title} node={node} onSelectScene={(sceneId) => {
            setCanvasMode('scene_moment')
            setActiveSceneId(sceneId)
            const nextScene = graph.nodes.find((item) => item.id === sceneId && item.kind === 'scene_moment')
            setSelectedNode({ kind: 'scene_moment', node: nextScene ? radialNodeFromContentNode(nextScene, 50, 50, 'primary') : laidOutSceneMainNode })
          }} />) : null}
          {!tree.length && <div className="content-canvas-tree-empty">当前项目暂无 Production / Segment / Scene Moment</div>}
        </div>
        <PanelResizeHandle
          className="content-canvas-resize-handle content-canvas-resize-handle--left"
          side="right"
          {...paneLayout.structure.resizeHandleProps}
        />
      </aside>

      <main className="content-canvas-workspace-canvas" aria-label="无限画布">
        <div className="content-canvas-workspace-canvas__toolbar">
          <span>{canvasMode === 'scene_moment' ? 'Scene Moment 主节点画布' : 'Setting 主节点画布'}</span>
          <div className="content-canvas-workspace-canvas__switch" aria-label="切换主节点类型">
            <button type="button" data-active={canvasMode === 'scene_moment' ? 'true' : undefined} onClick={() => {
              setCanvasMode('scene_moment')
              setSelectedNode({ kind: 'scene_moment', node: laidOutSceneMainNode })
            }}>
              <Film size={13} aria-hidden="true" />
              Scene
            </button>
            <button type="button" data-active={canvasMode === 'setting' ? 'true' : undefined} onClick={() => {
              setCanvasMode('setting')
              if (activeSetting) setSelectedNode({ kind: 'setting', setting: activeSetting })
            }}>
              <Star size={13} aria-hidden="true" />
              Setting
            </button>
          </div>
          <em>{canvasMode === 'scene_moment' ? 'Scene Moment 可添加表达单元，并给 Shot 添加 Keyframe / Storyboard' : 'Setting 可添加 State，State 下可添加 Asset 节点'}</em>
        </div>
        {canvasMode === 'scene_moment' ? (
          <StarCanvas
            main={laidOutSceneMainNode}
            nodes={laidOutSceneRelationNodes}
            actions={['添加表达单元', '给 Shot 添加 Keyframe', '添加 Storyboard']}
            selectedNodeId={selectedNode.kind !== 'setting' ? selectedSelectionId(selectedNode) : undefined}
            emptyText={activeScene ? '这个 Scene Moment 暂无表达单元 / Shot / Keyframe / Storyboard 关系' : '当前项目暂无 Scene Moment'}
            onSelect={(node) => setSelectedNode(node.id === laidOutSceneMainNode.id ? { kind: 'scene_moment', node } : { kind: 'other', node })}
            onNodePositionCommit={radialLayout.commitNodePosition}
            onResetLayout={radialLayout.reset}
          />
        ) : laidOutSettingMainNode && activeSetting ? (
          <StarCanvas
            main={laidOutSettingMainNode}
            nodes={laidOutSettingRelationNodes}
            actions={['添加 State', '给 State 添加 Asset', '绑定到 Scene Moment']}
            selectedNodeId={selectedSelectionId(selectedNode)}
            emptyText="这个 Setting 暂无 State / Asset 关系"
            onSelect={(node) => {
              if (node.id === activeSetting.id) {
                setSelectedNode({ kind: 'setting', setting: activeSetting })
                return
              }
              if (node.variant === 'state') {
                setSelectedNode({ kind: 'state', node })
                return
              }
              if (node.variant === 'asset') {
                setSelectedNode({ kind: 'asset', node })
                return
              }
              setSelectedNode({ kind: 'other', node })
            }}
            onNodePositionCommit={radialLayout.commitNodePosition}
            onResetLayout={radialLayout.reset}
          />
        ) : (
          <div className="content-canvas-star content-canvas-star--empty">当前项目暂无 Setting</div>
        )}
      </main>

      <aside className="content-canvas-workspace-inspector" aria-label="右侧节点信息区域">
        <PanelResizeHandle
          className="content-canvas-resize-handle content-canvas-resize-handle--right"
          side="left"
          {...paneLayout.inspector.resizeHandleProps}
        />
        <NodeInspector
          selection={selectedNode}
          activeSetting={activeSetting}
          assetPrompts={assetPrompts}
          onPromptChange={(assetId, prompt) => setAssetPrompts((current) => ({ ...current, [assetId]: prompt }))}
        />
      </aside>

      <section className="content-canvas-workspace-timeline" aria-label="底部 Scene Moment 时间线区域">
        <ContentCanvasResizeHandle
          className="content-canvas-resize-handle content-canvas-resize-handle--bottom"
          resizeHandleProps={paneLayout.timeline.resizeHandleProps}
        />
        <SceneTimeline items={timelineItems} />
      </section>
    </section>
  )
}

function useContentCanvasPaneLayout() {
  const location = useLocation()
  const routeLayout = useMemo(() => routeLayoutSpecForPathname(location.pathname), [location.pathname])
  const settingCatalogPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: CONTENT_CANVAS_SETTING_CATALOG_PANE_ID,
    fallbackSize: CONTENT_CANVAS_SETTING_CATALOG_DEFAULT_HEIGHT,
    clampSize: (size) => clampPaneSize(size, CONTENT_CANVAS_SETTING_CATALOG_MIN_HEIGHT, CONTENT_CANVAS_SETTING_CATALOG_MAX_HEIGHT),
  })
  const structurePane = useRouteLayoutPaneController({
    routeLayout,
    paneId: CONTENT_CANVAS_STRUCTURE_PANE_ID,
    fallbackSize: CONTENT_CANVAS_STRUCTURE_DEFAULT_WIDTH,
    clampSize: (size) => clampPaneSize(size, CONTENT_CANVAS_STRUCTURE_MIN_WIDTH, CONTENT_CANVAS_STRUCTURE_MAX_WIDTH),
  })
  const inspectorPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: CONTENT_CANVAS_INSPECTOR_PANE_ID,
    fallbackSize: CONTENT_CANVAS_INSPECTOR_DEFAULT_WIDTH,
    clampSize: (size) => clampPaneSize(size, CONTENT_CANVAS_INSPECTOR_MIN_WIDTH, CONTENT_CANVAS_INSPECTOR_MAX_WIDTH),
  })
  const timelinePane = useRouteLayoutPaneController({
    routeLayout,
    paneId: CONTENT_CANVAS_TIMELINE_PANE_ID,
    fallbackSize: CONTENT_CANVAS_TIMELINE_DEFAULT_HEIGHT,
    clampSize: (size) => clampPaneSize(size, CONTENT_CANVAS_TIMELINE_MIN_HEIGHT, CONTENT_CANVAS_TIMELINE_MAX_HEIGHT),
  })

  const settingCatalogResize = useResizablePanel({
    size: settingCatalogPane.size,
    onSizeChange: settingCatalogPane.setSize,
    minSize: CONTENT_CANVAS_SETTING_CATALOG_MIN_HEIGHT,
    maxSize: CONTENT_CANVAS_SETTING_CATALOG_MAX_HEIGHT,
    resizeEdge: 'bottom',
    ariaLabel: '调整 Setting 目录高度',
  })
  const structureResize = useResizablePanel({
    size: structurePane.size,
    onSizeChange: structurePane.setSize,
    minSize: CONTENT_CANVAS_STRUCTURE_MIN_WIDTH,
    maxSize: CONTENT_CANVAS_STRUCTURE_MAX_WIDTH,
    resizeEdge: 'right',
    ariaLabel: '调整结构层级宽度',
  })
  const inspectorResize = useResizablePanel({
    size: inspectorPane.size,
    onSizeChange: inspectorPane.setSize,
    minSize: CONTENT_CANVAS_INSPECTOR_MIN_WIDTH,
    maxSize: CONTENT_CANVAS_INSPECTOR_MAX_WIDTH,
    resizeEdge: 'left',
    ariaLabel: '调整节点信息宽度',
  })
  const timelineResize = useResizablePanel({
    size: timelinePane.size,
    onSizeChange: timelinePane.setSize,
    minSize: CONTENT_CANVAS_TIMELINE_MIN_HEIGHT,
    maxSize: CONTENT_CANVAS_TIMELINE_MAX_HEIGHT,
    resizeEdge: 'top',
    ariaLabel: '调整时间线高度',
  })

  return {
    style: {
      '--content-canvas-setting-catalog-height': `${settingCatalogPane.size}px`,
      '--content-canvas-structure-width': `${structurePane.size}px`,
      '--content-canvas-inspector-width': `${inspectorPane.size}px`,
      '--content-canvas-timeline-height': `${timelinePane.size}px`,
    } as CSSProperties,
    settingCatalog: settingCatalogResize,
    structure: structureResize,
    inspector: inspectorResize,
    timeline: timelineResize,
  }
}

function clampPaneSize(size: number, minSize: number, maxSize: number) {
  return Math.min(Math.max(Math.round(size), minSize), maxSize)
}

function useContentCanvasRadialLayout({
  projectId,
  mode,
  mainNodeId,
}: {
  projectId: number | undefined
  mode: CanvasMode
  mainNodeId: string | undefined
}) {
  const scope = useMemo<ContentCanvasViewStateScope>(() => ({
    productionId: mainNodeId,
    mode: `workspace-${mode}`,
  }), [mainNodeId, mode])
  const [positions, setPositions] = useState<Record<string, ContentCanvasNodePosition>>(() => (
    readContentCanvasViewState(projectId, scope)?.nodePositions ?? {}
  ))

  useEffect(() => {
    setPositions(readContentCanvasViewState(projectId, scope)?.nodePositions ?? {})
  }, [projectId, scope])

  const applyNodePositions = useCallback((nodes: RadialNode[]) => (
    nodes.map((node) => {
      const position = positions[node.id]
      return position ? { ...node, x: position.x, y: position.y } : node
    })
  ), [positions])

  const commitNodePosition = useCallback((nodeId: string, position: ContentCanvasNodePosition) => {
    const nextPosition = {
      x: clampRadialCoordinate(position.x),
      y: clampRadialCoordinate(position.y),
    }
    setPositions((current) => ({ ...current, [nodeId]: nextPosition }))
    mergeContentCanvasNodePositions(projectId, { [nodeId]: nextPosition }, scope)
  }, [projectId, scope])

  const reset = useCallback(() => {
    setPositions({})
    clearContentCanvasNodePositions(projectId, scope)
  }, [projectId, scope])

  return useMemo(() => ({
    applyNodePositions,
    commitNodePosition,
    reset,
  }), [applyNodePositions, commitNodePosition, reset])
}

function clampRadialCoordinate(value: number) {
  if (!Number.isFinite(value)) return 50
  return Math.min(Math.max(Math.round(value * 10) / 10, 4), 96)
}

function clampCanvasZoom(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(Math.round(value * 100) / 100, 0.5), 1.8)
}

function ContentCanvasResizeHandle({
  className,
  resizeHandleProps,
}: {
  className: string
  resizeHandleProps: ReturnType<typeof useResizablePanel>['resizeHandleProps']
}) {
  const { active, ...props } = resizeHandleProps
  return (
    <div
      className={className}
      data-active={active ? 'true' : undefined}
      {...props}
    />
  )
}

type TreeNodeData = {
  id?: string
  title: string
  meta: string
  code: string
  tone: string
  active?: boolean
  children?: TreeNodeData[]
}

function selectedSelectionId(selection: InspectorSelection) {
  if (selection.kind === 'setting') return selection.setting.id
  return selection.node.id
}

function StarCanvas({
  main,
  nodes,
  actions,
  selectedNodeId,
  emptyText,
  onSelect,
  onNodePositionCommit,
  onResetLayout,
}: {
  main: RadialNode
  nodes: RadialNode[]
  actions: string[]
  selectedNodeId?: string
  emptyText?: string
  onSelect: (node: RadialNode) => void
  onNodePositionCommit: (nodeId: string, position: ContentCanvasNodePosition) => void
  onResetLayout: () => void
}) {
  const worldRef = useRef<HTMLDivElement>(null)
  const [draftPositions, setDraftPositions] = useState<Record<string, ContentCanvasNodePosition>>({})
  const [dragging, setDragging] = useState<{ nodeId: string; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [panning, setPanning] = useState<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const allNodes = useMemo(() => [main, ...nodes], [main, nodes])
  const visibleNodes = useMemo(() => (
    allNodes.map((node) => {
      const draft = draftPositions[node.id]
      return draft ? { ...node, x: draft.x, y: draft.y } : node
    })
  ), [allNodes, draftPositions])
  const visibleMain = visibleNodes[0] ?? main
  const visibleChildren = visibleNodes.slice(1)
  const visibleNodeById = useMemo(() => new Map(visibleNodes.map((node) => [node.id, node])), [visibleNodes])
  const visibleLinks = useMemo(() => visibleChildren.map((node) => {
    const parent = node.parentId ? visibleNodeById.get(node.parentId) : undefined
    return { id: node.id, source: parent ?? visibleMain, target: node }
  }), [visibleChildren, visibleMain, visibleNodeById])
  const updateDraftPosition = useCallback((nodeId: string, clientX: number, clientY: number) => {
    const rect = worldRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return
    const position = {
      x: clampRadialCoordinate(((clientX - rect.left) / rect.width) * 100),
      y: clampRadialCoordinate(((clientY - rect.top) / rect.height) * 100),
    }
    setDraftPositions((current) => ({ ...current, [nodeId]: position }))
  }, [])
  const handleCanvasPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('.content-canvas-radial-node')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setPanning({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y })
  }, [pan.x, pan.y])
  const handleCanvasPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panning || panning.pointerId !== event.pointerId) return
    setPan({
      x: panning.originX + event.clientX - panning.startX,
      y: panning.originY + event.clientY - panning.startY,
    })
  }, [panning])
  const handleCanvasPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panning || panning.pointerId !== event.pointerId) return
    setPanning(null)
  }, [panning])
  const zoomBy = useCallback((delta: number) => {
    setZoom((current) => clampCanvasZoom(current + delta))
  }, [])
  const handleCanvasWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const delta = event.deltaY > 0 ? -0.08 : 0.08
    zoomBy(delta)
  }, [zoomBy])
  const resetViewport = useCallback(() => {
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }, [])
  useEffect(() => {
    resetViewport()
  }, [main.id, resetViewport])
  const resetCanvas = useCallback(() => {
    resetViewport()
    onResetLayout()
  }, [onResetLayout, resetViewport])
  const handleNodePointerDown = useCallback((node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    if (node.id === main.id) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging({ nodeId: node.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false })
  }, [main.id])
  const handleNodePointerMove = useCallback((node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging || dragging.nodeId !== node.id || dragging.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY)
    if (!dragging.moved && distance < 4) return
    if (!dragging.moved) {
      setDragging({ ...dragging, moved: true })
    }
    updateDraftPosition(node.id, event.clientX, event.clientY)
  }, [dragging, updateDraftPosition])
  const handleNodePointerUp = useCallback((node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging || dragging.nodeId !== node.id || dragging.pointerId !== event.pointerId) return
    if (!dragging.moved) {
      setDragging(null)
      return
    }
    const position = draftPositions[node.id] ?? { x: node.x, y: node.y }
    onNodePositionCommit(node.id, position)
    setDragging(null)
    setDraftPositions((current) => {
      const next = { ...current }
      delete next[node.id]
      return next
    })
  }, [draftPositions, dragging, onNodePositionCommit])

  return (
    <div className="content-canvas-star" aria-label="星状关系画布">
      <div
        className="content-canvas-star__surface"
        data-panning={panning ? 'true' : undefined}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        onWheel={handleCanvasWheel}
      >
        <div
          className="content-canvas-star__world"
          ref={worldRef}
          style={{
            '--canvas-pan-x': `${pan.x}px`,
            '--canvas-pan-y': `${pan.y}px`,
            '--canvas-zoom': zoom,
          } as CSSProperties}
        >
          <svg className="content-canvas-star__links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {visibleLinks.map((link) => (
              <line key={link.id} x1={link.source.x} y1={link.source.y} x2={link.target.x} y2={link.target.y} />
            ))}
          </svg>
          <RadialNodeCard
            node={visibleMain}
            selected={selectedNodeId === visibleMain.id}
            dragging={dragging?.nodeId === visibleMain.id}
            onSelect={onSelect}
            onPointerDown={handleNodePointerDown}
            onPointerMove={handleNodePointerMove}
            onPointerUp={handleNodePointerUp}
          />
          {visibleChildren.map((node) => (
            <RadialNodeCard
              key={node.id}
              node={node}
              selected={selectedNodeId === node.id}
              dragging={dragging?.nodeId === node.id}
              onSelect={onSelect}
              onPointerDown={handleNodePointerDown}
              onPointerMove={handleNodePointerMove}
              onPointerUp={handleNodePointerUp}
            />
          ))}
          {!nodes.length && <div className="content-canvas-star__empty">{emptyText}</div>}
        </div>
      </div>
      <div className="content-canvas-star__zoom" aria-label="画布缩放控制">
        <button type="button" onClick={() => zoomBy(-0.1)} aria-label="缩小画布">
          <Minus size={13} aria-hidden="true" />
        </button>
        <button type="button" onClick={resetViewport} aria-label="重置画布视图">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={() => zoomBy(0.1)} aria-label="放大画布">
          <Plus size={13} aria-hidden="true" />
        </button>
      </div>
      <div className="content-canvas-star__actions">
        {actions.map((action) => (
          <button key={action} type="button">
            <Plus size={13} aria-hidden="true" />
            {action}
          </button>
        ))}
        <button type="button" onClick={resetCanvas}>
          <Settings2 size={13} aria-hidden="true" />
          一键复位
        </button>
      </div>
    </div>
  )
}

function RadialNodeCard({
  node,
  selected,
  dragging,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  node: RadialNode
  selected?: boolean
  dragging?: boolean
  onSelect: (node: RadialNode) => void
  onPointerDown: (node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className="content-canvas-radial-node"
      data-variant={node.variant}
      data-selected={selected ? 'true' : undefined}
      data-dragging={dragging ? 'true' : undefined}
      style={{ '--node-x': `${node.x}%`, '--node-y': `${node.y}%` } as CSSProperties}
      onClick={() => onSelect(node)}
      onPointerDown={(event) => onPointerDown(node, event)}
      onPointerMove={(event) => onPointerMove(node, event)}
      onPointerUp={(event) => onPointerUp(node, event)}
      onPointerCancel={(event) => onPointerUp(node, event)}
    >
      <span className="content-canvas-radial-node__icon">
        <node.Icon size={16} aria-hidden="true" />
      </span>
      <span className="content-canvas-radial-node__copy">
        <small>{node.code}</small>
        <strong>{node.title}</strong>
        <em>{node.description}</em>
      </span>
    </button>
  )
}

function NodeInspector({
  selection,
  activeSetting,
  assetPrompts,
  onPromptChange,
}: {
  selection: InspectorSelection
  activeSetting: ContentCanvasNode | null
  assetPrompts: Record<string, string>
  onPromptChange: (assetId: string, prompt: string) => void
}) {
  if (selection.kind === 'setting') {
    const Icon = iconForContentNode(selection.setting)
    return (
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Setting Detail" title={selection.setting.title} Icon={Icon} />
        <p>{selection.setting.summary || selection.setting.subtitle}</p>
        <InspectorMeta label="Setting 类型" value={selection.setting.subtitle} />
        <InspectorMeta label="状态" value={contentStatusLabel(selection.setting.status)} />
        <InspectorMeta label="来源" value={selection.setting.sourcePath} />
        <InspectorSection title="可添加关系">
          <div className="content-canvas-inspector-actions">
            <button type="button"><Plus size={13} aria-hidden="true" /> State</button>
            <button type="button"><Link2 size={13} aria-hidden="true" /> 绑定 Scene</button>
          </div>
        </InspectorSection>
      </div>
    )
  }

  if (selection.kind === 'state') {
    const state = selection.node.source
    return (
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="State Detail" title={selection.node.title} Icon={selection.node.Icon} />
        <p>{selection.node.description}</p>
        <InspectorMeta label="所属 Setting" value={activeSetting?.title ?? '未关联'} />
        <InspectorMeta label="节点类型" value="State" />
        <InspectorMeta label="来源" value={state?.sourcePath ?? selection.node.id} />
        <InspectorSection title="State 约束">
          <textarea
            defaultValue={state?.summary || `保持「${selection.node.title}」在跨 Scene Moment 使用时连续一致。`}
            aria-label="State 约束说明"
          />
        </InspectorSection>
        <InspectorSection title="可添加关系">
          <div className="content-canvas-inspector-actions">
            <button type="button"><Plus size={13} aria-hidden="true" /> Asset</button>
          </div>
        </InspectorSection>
      </div>
    )
  }

  if (selection.kind === 'asset') {
    const asset = selection.node.source
    const prompt = assetPrompts[selection.node.id] ?? promptFromContentNode(asset) ?? ''
    return (
      <div className="content-canvas-inspector-card">
        <InspectorHeader eyebrow="Asset Detail" title={selection.node.title} Icon={selection.node.Icon} />
        <p>{selection.node.description}</p>
        <InspectorMeta label="所属 Setting" value={activeSetting?.title ?? '未关联'} />
        <InspectorMeta label="父级 State" value={assetParentStateLabel(selection.node, activeSetting)} />
        <InspectorMeta label="来源" value={asset?.sourcePath ?? selection.node.id} />
        <InspectorSection title="Content-unit 提示词">
          <label className="content-canvas-prompt-editor">
            <span><TextCursorInput size={13} aria-hidden="true" /> Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => onPromptChange(selection.node.id, event.target.value)}
              aria-label={`${selection.node.title} Content-unit 提示词`}
            />
          </label>
        </InspectorSection>
      </div>
    )
  }

  return (
    <div className="content-canvas-inspector-card">
      <InspectorHeader
        eyebrow={selection.kind === 'scene_moment' ? 'Scene Moment Detail' : 'Node Detail'}
        title={selection.node.title}
        Icon={selection.node.Icon}
      />
      <p>{selection.node.description}</p>
      <InspectorMeta label="节点类型" value={selection.node.code} />
      <InspectorMeta label="布局" value="星状视图" />
    </div>
  )
}

function InspectorHeader({ eyebrow, title, Icon }: { eyebrow: string, title: string, Icon: LucideIcon }) {
  return (
    <div className="content-canvas-inspector-card__header">
      <span className="content-canvas-inspector-card__icon">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div>
        <span className="content-canvas-inspector-card__eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
      </div>
    </div>
  )
}

function InspectorMeta({ label, value }: { label: string, value: string }) {
  return (
    <div className="content-canvas-inspector-card__meta">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

function InspectorSection({ title, children }: { title: string, children: ReactNode }) {
  return (
    <section className="content-canvas-inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function assetParentStateLabel(assetNode: RadialNode, activeSetting: ContentCanvasNode | null) {
  const stateRef = stringField(assetNode.source?.record, 'setting_state_id', 'setting_state_ref', 'state_id')
  return stateRef || activeSetting?.title || 'State'
}

type TimelineItem = {
  id: string
  title: string
  type: string
  width: number
  start: number
}

function SceneTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="content-canvas-timeline">
      <div className="content-canvas-timeline__header">
        <div>
          <strong>Scene Moment Timeline</strong>
          <span>只在 Scene Moment 作为主节点时出现，用于调节表达单元顺序。</span>
        </div>
        <button type="button">
          <Plus size={13} aria-hidden="true" />
          表达单元
        </button>
      </div>
      <div className="content-canvas-timeline__ruler" aria-hidden="true">
        <span>00:00</span>
        <span>00:04</span>
        <span>00:08</span>
        <span>00:12</span>
      </div>
      <div className="content-canvas-timeline__track">
        {items.length ? items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="content-canvas-timeline__item"
            data-type={item.type}
            style={{ left: `${item.start}%`, width: `${item.width}%` }}
          >
            {item.title}
          </button>
        )) : <span className="content-canvas-timeline__empty">当前 Scene Moment 暂无表达单元时间线</span>}
      </div>
    </div>
  )
}

function TreeNode({ node, onSelectScene }: { node: TreeNodeData, onSelectScene: (sceneId: string) => void }) {
  return (
    <div className="content-canvas-workspace-tree-node-wrap">
      <button
        type="button"
        className="content-canvas-workspace-tree-node"
        data-active={node.active ? 'true' : undefined}
        data-tone={node.tone}
        onClick={node.code === 'SCN' && node.id ? () => onSelectScene(node.id!) : undefined}
      >
        <span className="content-canvas-workspace-tree-node__chevron">{node.children?.length ? '⌄' : ''}</span>
        <span className="content-canvas-workspace-tree-node__code">{node.code}</span>
        <span className="content-canvas-workspace-tree-node__copy">
          <strong>{node.title}</strong>
          <small>{node.meta}</small>
        </span>
      </button>
      {node.children?.length ? (
        <div className="content-canvas-workspace-tree-children">
          {node.children.map((child) => <TreeNode key={child.title} node={child} onSelectScene={onSelectScene} />)}
        </div>
      ) : null}
    </div>
  )
}

function emptyContentCanvasGraph(): ContentCanvasGraph {
  return { nodes: [], edges: [] }
}

function contentCanvasGraphIndex(graph: ContentCanvasGraph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const connectedByNodeId = new Map<string, ContentCanvasNode[]>()
  const edgesByNodeId = new Map<string, ContentCanvasEdge[]>()
  for (const edge of graph.edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) continue
    appendMapArray(connectedByNodeId, edge.source, target)
    appendMapArray(connectedByNodeId, edge.target, source)
    appendMapArray(edgesByNodeId, edge.source, edge)
    appendMapArray(edgesByNodeId, edge.target, edge)
  }
  return { nodeById, connectedByNodeId, edgesByNodeId }
}

function appendMapArray<T>(map: Map<string, T[]>, key: string, value: T) {
  map.set(key, [...(map.get(key) ?? []), value])
}

function radialNodesAround(
  main: ContentCanvasNode,
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
  allowedKinds: ContentCanvasNodeKind[],
): RadialNode[] {
  if (main.kind === 'setting') {
    const states = (graphIndex.connectedByNodeId.get(main.id) ?? [])
      .filter((node) => node.kind === 'state')
      .slice(0, 8)
    return states.flatMap((state, stateIndex) => {
      const statePoint = radialPoint(stateIndex, states.length, 180, 118, -Math.PI / 18)
      const stateNode = radialNodeFromContentNode(state, statePoint.x, statePoint.y, 'state')
      const assets = (graphIndex.connectedByNodeId.get(state.id) ?? [])
        .filter((node) => node.kind === 'asset')
        .slice(0, 4)
        .map((asset, assetIndex) => {
          const assetPoint = childRadialPoint(
            statePoint,
            assetIndex,
            assetsForStateCount(graphIndex, state.id),
            statePoint.x >= 50 ? 0 : Math.PI,
          )
          return {
            ...radialNodeFromContentNode(asset, assetPoint.x, assetPoint.y, 'asset'),
            parentId: state.id,
          }
        })
      return [stateNode, ...assets]
    })
  }
  const allowed = new Set<ContentCanvasNodeKind>(allowedKinds)
  const direct = graphIndex.connectedByNodeId.get(main.id) ?? []
  const expanded = direct.flatMap((node) => {
    if (allowed.has(node.kind)) return [node]
    if (main.kind === 'scene_moment' && node.kind === 'shot') {
      return [
        node,
        ...(graphIndex.connectedByNodeId.get(node.id) ?? []).filter((child) => allowed.has(child.kind)),
      ]
    }
    if (main.kind === 'setting' && node.kind === 'state') {
      return [
        node,
        ...(graphIndex.connectedByNodeId.get(node.id) ?? []).filter((child) => allowed.has(child.kind)),
      ]
    }
    return []
  })
  const unique = [...new Map(expanded.filter((node) => node.id !== main.id).map((node) => [node.id, node])).values()]
  return unique.slice(0, 10).map((node, index, items) => {
    const point = radialPoint(index, items.length)
    return radialNodeFromContentNode(node, point.x, point.y, radialVariantForKind(node.kind))
  })
}

function assetsForStateCount(graphIndex: ReturnType<typeof contentCanvasGraphIndex>, stateId: string) {
  return Math.max(1, (graphIndex.connectedByNodeId.get(stateId) ?? []).filter((node) => node.kind === 'asset').length)
}

function radialPoint(index: number, total: number, radiusX = 250, radiusY = 160, startAngle = -Math.PI / 2) {
  const angle = ((Math.PI * 2) / Math.max(total, 1)) * index + startAngle
  return {
    x: pixelOffsetToRadialX(Math.cos(angle) * radiusX),
    y: pixelOffsetToRadialY(Math.sin(angle) * radiusY),
  }
}

function childRadialPoint(parent: { x: number; y: number }, index: number, total: number, startAngle = -Math.PI / 2) {
  const spread = Math.min(Math.PI, (Math.PI * 2) / Math.max(total, 1))
  const angle = total <= 1
    ? startAngle
    : startAngle - spread / 2 + (spread / Math.max(total - 1, 1)) * index
  return {
    x: clampRadialCoordinate(parent.x + pixelOffsetToRadialX(Math.cos(angle) * 132) - 50),
    y: clampRadialCoordinate(parent.y + pixelOffsetToRadialY(Math.sin(angle) * 82) - 50),
  }
}

function pixelOffsetToRadialX(offset: number) {
  return 50 + (offset / CANVAS_WORLD_WIDTH) * 100
}

function pixelOffsetToRadialY(offset: number) {
  return 50 + (offset / CANVAS_WORLD_HEIGHT) * 100
}

function radialNodeFromContentNode(node: ContentCanvasNode, x: number, y: number, variant = radialVariantForKind(node.kind)): RadialNode {
  const Icon = iconForContentNode(node)
  return {
    id: node.id,
    code: codeForKind(node.kind),
    title: node.title,
    description: node.summary || node.subtitle || node.sourcePath,
    x,
    y,
    Icon,
    variant,
    source: node,
  }
}

function radialVariantForKind(kind: ContentCanvasNodeKind): RadialNode['variant'] {
  if (kind === 'state') return 'state'
  if (kind === 'asset') return 'asset'
  if (kind === 'expression_unit') return 'expression'
  if (kind === 'shot') return 'shot'
  if (kind === 'keyframe') return 'keyframe'
  if (kind === 'storyboard') return 'storyboard'
  return undefined
}

function iconForContentNode(node: Pick<ContentCanvasNode, 'kind' | 'subtitle'>): LucideIcon {
  if (node.kind === 'scene_moment') return Film
  if (node.kind === 'production') return Box
  if (node.kind === 'segment') return Rows3
  if (node.kind === 'state') return CircleDot
  if (node.kind === 'asset') return Image
  if (node.kind === 'shot') return Video
  if (node.kind === 'storyboard') return FileImage
  if (node.kind === 'keyframe') return KeyRound
  if (node.kind === 'expression_unit') return SquareStack
  if (node.kind === 'content_unit') return TextCursorInput
  if (node.kind === 'audio_cue') return WandSparkles
  if (node.kind === 'setting') {
    const subtype = node.subtitle.toLowerCase()
    if (subtype.includes('character') || subtype.includes('角色')) return UserRound
    if (subtype.includes('location') || subtype.includes('场景')) return Building2
    if (subtype.includes('prop') || subtype.includes('道具')) return Box
    if (subtype.includes('costume') || subtype.includes('服装')) return Shirt
    if (subtype.includes('visual') || subtype.includes('视觉')) return Palette
    if (subtype.includes('rule') || subtype.includes('规则')) return ScrollText
    if (subtype.includes('sound') || subtype.includes('声音')) return WandSparkles
  }
  return Star
}

function codeForKind(kind: ContentCanvasNodeKind) {
  if (kind === 'scene_moment') return 'SCN'
  if (kind === 'production') return 'PRO'
  if (kind === 'segment') return 'SEG'
  if (kind === 'expression_unit') return 'EXP'
  if (kind === 'content_unit') return 'UNIT'
  if (kind === 'storyboard') return 'BOARD'
  if (kind === 'keyframe') return 'KEY'
  return kind.toUpperCase().slice(0, 5)
}

function contentCanvasStructureTree(graph: ContentCanvasGraph, activeSceneId?: string): TreeNodeData[] {
  const productions = graph.nodes.filter((node) => node.kind === 'production')
  const segments = graph.nodes.filter((node) => node.kind === 'segment')
  const scenes = graph.nodes.filter((node) => node.kind === 'scene_moment')
  const childrenBySource = new Map<string, ContentCanvasNode[]>()
  for (const edge of graph.edges) {
    if (edge.kind !== 'hierarchy' && edge.type !== 'contains') continue
    const child = graph.nodes.find((node) => node.id === edge.target)
    if (child) appendMapArray(childrenBySource, edge.source, child)
  }
  const roots = productions.length ? productions : segments.length ? segments : scenes
  return roots.map((node) => structureNodeFromContentNode(node, childrenBySource, activeSceneId))
}

function structureNodeFromContentNode(
  node: ContentCanvasNode,
  childrenBySource: Map<string, ContentCanvasNode[]>,
  activeSceneId?: string,
): TreeNodeData {
  const children = (childrenBySource.get(node.id) ?? [])
    .filter((child) => child.kind === 'segment' || child.kind === 'scene_moment')
    .map((child) => structureNodeFromContentNode(child, childrenBySource, activeSceneId))
  return {
    id: node.id,
    title: node.title,
    meta: `${node.kind} · ${node.subtitle}`,
    code: codeForKind(node.kind),
    tone: node.kind === 'segment' ? 'violet' : 'blue',
    active: node.id === activeSceneId,
    children,
  }
}

function sceneTimelineItemsFromGraph(
  scene: ContentCanvasNode,
  graphIndex: ReturnType<typeof contentCanvasGraphIndex>,
): TimelineItem[] {
  const candidates = (graphIndex.connectedByNodeId.get(scene.id) ?? [])
    .filter((node) => node.kind === 'expression_unit' || node.kind === 'content_unit' || node.kind === 'shot' || node.kind === 'audio_cue')
    .slice(0, 8)
  const width = candidates.length ? Math.max(10, Math.floor(80 / candidates.length)) : 18
  return candidates.map((node, index) => ({
    id: node.id,
    title: node.title,
    type: node.kind,
    width,
    start: Math.min(86, 4 + index * Math.max(10, width)),
  }))
}

function settingKindFromNode(node: ContentCanvasNode): SettingKind | 'relationship' {
  const value = `${node.subtitle} ${stringField(node.record, 'kind', 'setting_kind', 'type')}`.toLowerCase()
  if (value.includes('character') || value.includes('角色')) return 'character'
  if (value.includes('location') || value.includes('场景')) return 'location'
  if (value.includes('prop') || value.includes('道具')) return 'prop'
  if (value.includes('costume') || value.includes('服装')) return 'costume'
  if (value.includes('visual') || value.includes('style') || value.includes('视觉')) return 'visual_style'
  if (value.includes('rule') || value.includes('规则')) return 'world_rule'
  if (value.includes('sound') || value.includes('声音')) return 'sound_motif'
  return 'relationship'
}

function contentStatusLabel(status: ContentCanvasNode['status']) {
  if (status === 'ready') return '就绪'
  if (status === 'active') return '进行中'
  if (status === 'missing') return '缺失'
  return '普通'
}

function promptFromContentNode(node: ContentCanvasNode | undefined) {
  if (!node) return undefined
  return stringField(node.record, 'prompt', 'prompt_text', 'generation_prompt', 'description') || node.summary
}

function stringField(record: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!record) return ''
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}
