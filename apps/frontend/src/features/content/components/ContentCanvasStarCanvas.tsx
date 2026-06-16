import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Minus, Plus, Settings2 } from 'lucide-react'
import type { ContentCanvasNodePosition } from '../application/contentCanvasViewState'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import { CONTENT_CANVAS_SETTING_DRAG_TYPE, CANVAS_WORLD_HEIGHT, CANVAS_WORLD_WIDTH, type CandidateSelections, type RadialNode, type SceneSettingGroup, type StarCanvasAction, type StarCanvasContextAction } from './contentCanvasWorkspaceTypes'
import { candidateDecisionForNode, clampCanvasZoom, clampRadialCoordinate, clampRadialYCoordinate, iconForContentNode, mediaKindForNode, mediaKindLabel, selectedCandidateForNode } from './contentCanvasWorkspaceModel'

export function ContentCanvasStarCanvas({
  main,
  nodes,
  actions,
  selectedNodeId,
  emptyText,
  onSelect,
  onNodePositionCommit,
  onResetLayout,
  candidateSelections,
  settingGroups = [],
  groupedSettingIds,
  onDropSetting,
  getNodeContextActions,
  onSettingGroupPositionCommit,
  onSelectSettingGroupNode,
}: {
  main: RadialNode
  nodes: RadialNode[]
  actions: StarCanvasAction[]
  selectedNodeId?: string
  emptyText?: string
  onSelect: (node: RadialNode) => void
  onNodePositionCommit: (nodeId: string, position: ContentCanvasNodePosition) => void
  onResetLayout: () => void
  candidateSelections: CandidateSelections
  settingGroups?: SceneSettingGroup[]
  groupedSettingIds?: Set<string>
  onDropSetting?: (settingId: string, position: ContentCanvasNodePosition) => void
  getNodeContextActions?: (node: ContentCanvasNode) => StarCanvasContextAction[]
  onSettingGroupPositionCommit?: (group: SceneSettingGroup, position: ContentCanvasNodePosition) => void
  onSelectSettingGroupNode?: (node: ContentCanvasNode) => void
}) {
  const worldRef = useRef<HTMLDivElement>(null)
  const [draftPositions, setDraftPositions] = useState<Record<string, ContentCanvasNodePosition>>({})
  const [draftGroupPositions, setDraftGroupPositions] = useState<Record<string, ContentCanvasNodePosition>>({})
  const [dragging, setDragging] = useState<{ nodeId: string; pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null>(null)
  const [draggingGroup, setDraggingGroup] = useState<{ groupId: string; pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [panning, setPanning] = useState<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: StarCanvasContextAction[] } | null>(null)
  const allNodes = useMemo(() => [main, ...nodes], [main, nodes])
  const visibleNodes = useMemo(() => (
    allNodes.map((node) => {
      const draft = draftPositions[node.id]
      return draft ? { ...node, x: draft.x, y: draft.y } : node
    })
  ), [allNodes, draftPositions])
  const visibleMain = visibleNodes[0] ?? main
  const visibleChildren = visibleNodes.slice(1)
  const visibleSettingGroups = useMemo(() => (
    settingGroups.map((group) => {
      const draft = draftGroupPositions[group.id]
      return draft ? { ...group, x: draft.x, y: draft.y } : group
    })
  ), [draftGroupPositions, settingGroups])
  const visibleNodeById = useMemo(() => new Map(visibleNodes.map((node) => [node.id, node])), [visibleNodes])
  const visibleLinks = useMemo(() => [
    ...visibleChildren.map((node) => {
      const parent = node.parentId ? visibleNodeById.get(node.parentId) : undefined
      return { id: node.id, source: parent ?? visibleMain, target: node }
    }),
  ], [visibleChildren, visibleMain, visibleNodeById])
  const worldPositionFromClientPoint = useCallback((clientX: number, clientY: number) => {
    const rect = worldRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
    return {
      x: clampRadialCoordinate(((clientX - rect.left) / rect.width - 0.5) * CANVAS_WORLD_WIDTH),
      y: clampRadialYCoordinate(((clientY - rect.top) / rect.height - 0.5) * CANVAS_WORLD_HEIGHT),
    }
  }, [])
  const updateDraftPosition = useCallback((nodeId: string, clientX: number, clientY: number, offset?: { x: number; y: number }) => {
    const pointerPosition = worldPositionFromClientPoint(clientX, clientY)
    const position = {
      x: clampRadialCoordinate(pointerPosition.x - (offset?.x ?? 0)),
      y: clampRadialYCoordinate(pointerPosition.y - (offset?.y ?? 0)),
    }
    setDraftPositions((current) => ({ ...current, [nodeId]: position }))
  }, [worldPositionFromClientPoint])
  const updateDraftGroupPosition = useCallback((groupId: string, clientX: number, clientY: number, offset?: { x: number; y: number }) => {
    const pointerPosition = worldPositionFromClientPoint(clientX, clientY)
    setDraftGroupPositions((current) => ({
      ...current,
      [groupId]: {
        x: clampRadialCoordinate(pointerPosition.x - (offset?.x ?? 0)),
        y: clampRadialYCoordinate(pointerPosition.y - (offset?.y ?? 0)),
      },
    }))
  }, [worldPositionFromClientPoint])
  const handleDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!onDropSetting || !event.dataTransfer.types.includes(CONTENT_CANVAS_SETTING_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [onDropSetting])
  const handleDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!onDropSetting) return
    const settingId = event.dataTransfer.getData(CONTENT_CANVAS_SETTING_DRAG_TYPE)
    if (!settingId) return
    event.preventDefault()
    onDropSetting(settingId, worldPositionFromClientPoint(event.clientX, event.clientY))
  }, [onDropSetting, worldPositionFromClientPoint])
  const handleCanvasPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    setContextMenu(null)
    if (event.target instanceof Element && event.target.closest('.content-canvas-radial-node, .content-canvas-setting-group')) return
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
    setContextMenu(null)
    const pointerPosition = worldPositionFromClientPoint(event.clientX, event.clientY)
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging({
      nodeId: node.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: pointerPosition.x - node.x,
      offsetY: pointerPosition.y - node.y,
      moved: false,
    })
  }, [worldPositionFromClientPoint])
  const handleNodeContextMenu = useCallback((node: RadialNode, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!node.source || !getNodeContextActions) return
    const actions = getNodeContextActions(node.source).filter((action) => !action.disabled && action.onClick)
    if (!actions.length) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.closest('.content-canvas-star')?.getBoundingClientRect()
    setContextMenu({
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
      actions,
    })
    onSelect(node)
  }, [getNodeContextActions, onSelect])
  const handleNodePointerMove = useCallback((node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging || dragging.nodeId !== node.id || dragging.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY)
    if (!dragging.moved && distance < 4) return
    if (!dragging.moved) {
      setDragging({ ...dragging, moved: true })
    }
    updateDraftPosition(node.id, event.clientX, event.clientY, { x: dragging.offsetX, y: dragging.offsetY })
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
  const handleGroupPointerDown = useCallback((group: SceneSettingGroup, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const pointerPosition = worldPositionFromClientPoint(event.clientX, event.clientY)
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingGroup({
      groupId: group.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: pointerPosition.x - group.x,
      offsetY: pointerPosition.y - group.y,
      moved: false,
    })
  }, [worldPositionFromClientPoint])
  const handleGroupPointerMove = useCallback((group: SceneSettingGroup, event: ReactPointerEvent<HTMLElement>) => {
    if (!draggingGroup || draggingGroup.groupId !== group.id || draggingGroup.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - draggingGroup.startX, event.clientY - draggingGroup.startY)
    if (!draggingGroup.moved && distance < 4) return
    if (!draggingGroup.moved) {
      setDraggingGroup({ ...draggingGroup, moved: true })
    }
    updateDraftGroupPosition(group.id, event.clientX, event.clientY, { x: draggingGroup.offsetX, y: draggingGroup.offsetY })
  }, [draggingGroup, updateDraftGroupPosition])
  const handleGroupPointerUp = useCallback((group: SceneSettingGroup, event: ReactPointerEvent<HTMLElement>) => {
    if (!draggingGroup || draggingGroup.groupId !== group.id || draggingGroup.pointerId !== event.pointerId) return
    if (!draggingGroup.moved) {
      setDraggingGroup(null)
      return
    }
    const position = draftGroupPositions[group.id] ?? { x: group.x, y: group.y }
    onSettingGroupPositionCommit?.(group, position)
    setDraggingGroup(null)
    setDraftGroupPositions((current) => {
      const next = { ...current }
      delete next[group.id]
      return next
    })
  }, [draftGroupPositions, draggingGroup, onSettingGroupPositionCommit])

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
        onDragOver={handleDragOver}
        onDrop={handleDrop}
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
          <svg className="content-canvas-star__links" viewBox="-380 -230 760 460" preserveAspectRatio="none" aria-hidden="true">
            {visibleLinks.map((link) => (
              <line key={link.id} x1={link.source.x} y1={link.source.y} x2={link.target.x} y2={link.target.y} />
            ))}
          </svg>
          <RadialNodeCard
            node={visibleMain}
            selected={selectedNodeId === visibleMain.id}
            dragging={dragging?.nodeId === visibleMain.id}
            candidateSelections={candidateSelections}
            onSelect={onSelect}
            onPointerDown={handleNodePointerDown}
            onPointerMove={handleNodePointerMove}
            onPointerUp={handleNodePointerUp}
            onContextMenu={handleNodeContextMenu}
          />
          {visibleChildren.map((node) => (
            <RadialNodeCard
              key={node.id}
              node={node}
              selected={selectedNodeId === node.id}
              dragging={dragging?.nodeId === node.id}
              candidateSelections={candidateSelections}
              onSelect={onSelect}
              onPointerDown={handleNodePointerDown}
              onPointerMove={handleNodePointerMove}
              onPointerUp={handleNodePointerUp}
              onContextMenu={handleNodeContextMenu}
            />
          ))}
          {visibleSettingGroups.map((group) => (
            <SceneSettingGroupCard
              key={group.id}
              group={group}
              selected={groupedSettingIds?.has(selectedNodeId ?? '')}
              dragging={draggingGroup?.groupId === group.id}
              candidateSelections={candidateSelections}
              onSelectNode={onSelectSettingGroupNode}
              onPointerDown={handleGroupPointerDown}
              onPointerMove={handleGroupPointerMove}
              onPointerUp={handleGroupPointerUp}
            />
          ))}
          {!nodes.length && !settingGroups.length && <div className="content-canvas-star__empty">{emptyText}</div>}
        </div>
      </div>
      {contextMenu ? (
        <div
          className="content-canvas-star-context-menu"
          style={{ '--menu-x': `${contextMenu.x}px`, '--menu-y': `${contextMenu.y}px` } as CSSProperties}
        >
          {contextMenu.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                setContextMenu(null)
                action.onClick?.()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
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
          <button key={action.label} type="button" onClick={action.onClick} disabled={action.disabled || !action.onClick}>
            <Plus size={13} aria-hidden="true" />
            {action.label}
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

function SceneSettingGroupCard({
  group,
  selected,
  dragging,
  candidateSelections,
  onSelectNode,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  group: SceneSettingGroup
  selected?: boolean
  dragging?: boolean
  candidateSelections: CandidateSelections
  onSelectNode?: (node: ContentCanvasNode) => void
  onPointerDown: (group: SceneSettingGroup, event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (group: SceneSettingGroup, event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (group: SceneSettingGroup, event: ReactPointerEvent<HTMLElement>) => void
}) {
  const assetCount = group.states.reduce((total, item) => total + item.assets.length, 0)
  const groupLayout = settingGroupLayout(settingGroupNodes(group))
  const handleInnerNodePointer = (_node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }
  const handleInnerNodeContextMenu = (_node: RadialNode, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }
  return (
    <section
      className="content-canvas-setting-group"
      data-selected={selected ? 'true' : undefined}
      data-dragging={dragging ? 'true' : undefined}
      style={{
        '--group-x': `${group.x}px`,
        '--group-y': `${group.y}px`,
        '--group-width': `${groupLayout.width}px`,
        '--group-height': `${groupLayout.height}px`,
      } as CSSProperties}
      aria-label={`${group.setting.title} Setting 分组`}
      onPointerDown={(event) => onPointerDown(group, event)}
      onPointerMove={(event) => onPointerMove(group, event)}
      onPointerUp={(event) => onPointerUp(group, event)}
      onPointerCancel={(event) => onPointerUp(group, event)}
    >
      <div className="content-canvas-setting-group__frame" data-selected={selected ? 'true' : undefined}>
        <div className="content-canvas-setting-group__header">
          <span className="content-canvas-setting-group__marker" aria-hidden="true" />
          <span className="content-canvas-setting-group__title">{group.setting.title}</span>
          <span className="content-canvas-setting-group__meta">{group.states.length} State / {assetCount} Asset</span>
        </div>
        <div className="content-canvas-setting-group__nodes">
          {groupLayout.nodes.map((node) => (
            <RadialNodeCard
              key={node.id}
              node={node}
              selected={selected}
              candidateSelections={candidateSelections}
              onSelect={(item) => item.source && onSelectNode?.(item.source)}
              onPointerDown={handleInnerNodePointer}
              onPointerMove={handleInnerNodePointer}
              onPointerUp={handleInnerNodePointer}
              onContextMenu={handleInnerNodeContextMenu}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function settingGroupNodes(group: SceneSettingGroup): RadialNode[] {
  const states = group.states
  if (!states.length) return [radialNodeFromSettingGroupSource(group.setting, 0, 0, 'primary')]
  const xFor = (index: number, total: number) => (index - (total - 1) / 2) * 190
  return [
    {
      ...radialNodeFromSettingGroupSource(group.setting, 0, -112, 'primary'),
      id: `${group.id}:setting:${group.setting.id}`,
    },
    ...states.flatMap((item, stateIndex) => {
      const stateX = xFor(stateIndex, states.length)
      const assets = item.assets.map((asset, assetIndex) => radialNodeFromSettingGroupSource(
        asset,
        stateX + xFor(assetIndex, Math.max(1, item.assets.length)) / Math.max(1, states.length),
        112,
        'asset',
      ))
      return [
        radialNodeFromSettingGroupSource(item.state, stateX, 0, 'state'),
        ...assets,
      ]
    }),
  ].slice(0, 32)
}

function radialNodeFromSettingGroupSource(
  node: ContentCanvasNode,
  x: number,
  y: number,
  variant: RadialNode['variant'],
): RadialNode {
  const Icon = iconForContentNode(node)
  return {
    id: node.id,
    code: node.kind === 'setting' ? 'SET' : node.kind === 'state' ? 'STA' : 'AST',
    title: node.title,
    description: node.summary || node.subtitle || node.sourcePath,
    x,
    y,
    Icon,
    variant,
    source: node,
  }
}

const SETTING_GROUP_NODE_WIDTH = 156
const SETTING_GROUP_NODE_HEIGHT = 68
const SETTING_GROUP_PADDING = 22
const SETTING_GROUP_HEADER_HEIGHT = 34

function settingGroupLayout(nodes: RadialNode[]) {
  const bounds = settingGroupNodeBounds(nodes)
  const centerX = (bounds.left + bounds.right) / 2
  const centerY = (bounds.top + bounds.bottom) / 2
  const width = Math.max(390, bounds.right - bounds.left + SETTING_GROUP_PADDING * 2)
  const height = Math.max(320, bounds.bottom - bounds.top + SETTING_GROUP_HEADER_HEIGHT + SETTING_GROUP_PADDING * 2)
  return {
    width,
    height,
    nodes: nodes.map((node) => ({
      ...node,
      x: Math.round(node.x - centerX),
      y: Math.round(node.y - centerY + SETTING_GROUP_HEADER_HEIGHT / 2),
    })),
  }
}

function settingGroupNodeBounds(nodes: RadialNode[]) {
  return nodes.reduce((bounds, node) => ({
    left: Math.min(bounds.left, node.x - SETTING_GROUP_NODE_WIDTH / 2),
    right: Math.max(bounds.right, node.x + SETTING_GROUP_NODE_WIDTH / 2),
    top: Math.min(bounds.top, node.y - SETTING_GROUP_NODE_HEIGHT / 2),
    bottom: Math.max(bounds.bottom, node.y + SETTING_GROUP_NODE_HEIGHT / 2),
  }), {
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
  })
}

function RadialNodeCard({
  node,
  selected,
  dragging,
  candidateSelections,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onContextMenu,
}: {
  node: RadialNode
  selected?: boolean
  dragging?: boolean
  candidateSelections: CandidateSelections
  onSelect: (node: RadialNode) => void
  onPointerDown: (node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => void
  onContextMenu: (node: RadialNode, event: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  const decision = candidateDecisionForNode(node.source, candidateSelections)
  const selectedCandidate = selectedCandidateForNode(node.source, candidateSelections)
  const mediaKind = mediaKindForNode(node.source)
  return (
    <button
      type="button"
      className="content-canvas-radial-node"
      data-variant={node.variant}
      data-selected={selected ? 'true' : undefined}
      data-dragging={dragging ? 'true' : undefined}
      data-decision={decision?.tone}
      style={{ '--node-x': `${node.x}px`, '--node-y': `${node.y}px` } as CSSProperties}
      onClick={() => onSelect(node)}
      onPointerDown={(event) => onPointerDown(node, event)}
      onPointerMove={(event) => onPointerMove(node, event)}
      onPointerUp={(event) => onPointerUp(node, event)}
      onPointerCancel={(event) => onPointerUp(node, event)}
      onContextMenu={(event) => onContextMenu(node, event)}
    >
      <span className="content-canvas-radial-node__icon">
        <node.Icon size={16} aria-hidden="true" />
      </span>
      <span className="content-canvas-radial-node__copy">
        <small>
          {node.code}
          {mediaKind ? <b>{mediaKindLabel(mediaKind)}</b> : null}
        </small>
        <strong>{node.title}</strong>
        <em>{selectedCandidate?.title || node.description}</em>
        {decision ? (
          <i data-decision={decision.tone}>
            <span>{decision.label}</span>
            <b>{decision.candidateCount} 候选</b>
          </i>
        ) : null}
      </span>
    </button>
  )
}
