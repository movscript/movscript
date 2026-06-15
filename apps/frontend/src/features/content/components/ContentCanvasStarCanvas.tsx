import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { CircleDot, Image, Minus, Plus, Settings2 } from 'lucide-react'
import type { ContentCanvasNodePosition } from '../application/contentCanvasViewState'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import { CONTENT_CANVAS_SETTING_DRAG_TYPE, CANVAS_WORLD_HEIGHT, CANVAS_WORLD_WIDTH, type CandidateSelections, type RadialNode, type SceneSettingGroup, type StarCanvasAction } from './contentCanvasWorkspaceTypes'
import { clampCanvasZoom, clampRadialCoordinate, clampRadialYCoordinate, iconForContentNode, mediaKindForNode, mediaKindLabel, nodeCandidateBadge, selectedCandidateForNode } from './contentCanvasWorkspaceModel'

export function StarCanvas({
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
    ...visibleSettingGroups.map((group) => ({
      id: group.id,
      source: visibleMain,
      target: { x: group.x, y: group.y },
    })),
  ], [visibleChildren, visibleMain, visibleNodeById, visibleSettingGroups])
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
  const Icon = iconForContentNode(group.setting)
  const assetCount = group.states.reduce((total, item) => total + item.assets.length, 0)
  return (
    <section
      className="content-canvas-setting-group"
      data-selected={selected ? 'true' : undefined}
      data-dragging={dragging ? 'true' : undefined}
      style={{ '--group-x': `${group.x}px`, '--group-y': `${group.y}px` } as CSSProperties}
      aria-label={`${group.setting.title} Setting 分组`}
      onPointerDown={(event) => onPointerDown(group, event)}
      onPointerMove={(event) => onPointerMove(group, event)}
      onPointerUp={(event) => onPointerUp(group, event)}
      onPointerCancel={(event) => onPointerUp(group, event)}
    >
      <button type="button" className="content-canvas-setting-group__header" onClick={() => onSelectNode?.(group.setting)}>
        <span className="content-canvas-setting-group__icon">
          <Icon size={15} aria-hidden="true" />
        </span>
        <span>
          <small>SETTING GROUP</small>
          <strong>{group.setting.title}</strong>
        </span>
        <em>{group.states.length} State / {assetCount} Asset</em>
      </button>
      <div className="content-canvas-setting-group__body">
        {group.states.length ? group.states.map((item) => (
          <div key={item.state.id} className="content-canvas-setting-group__state">
            <button type="button" onClick={() => onSelectNode?.(item.state)}>
              <CircleDot size={12} aria-hidden="true" />
              <span>{item.state.title}</span>
            </button>
            {item.assets.length ? (
              <div className="content-canvas-setting-group__assets">
                {item.assets.map((asset) => (
                  <button key={asset.id} type="button" onClick={() => onSelectNode?.(asset)}>
                    <Image size={11} aria-hidden="true" />
                    <span>{asset.title}</span>
                    <em>{nodeCandidateBadge(asset, candidateSelections)}</em>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )) : (
          <span className="content-canvas-setting-group__empty">这个 Setting 暂无 State / Asset</span>
        )}
      </div>
    </section>
  )
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
}: {
  node: RadialNode
  selected?: boolean
  dragging?: boolean
  candidateSelections: CandidateSelections
  onSelect: (node: RadialNode) => void
  onPointerDown: (node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (node: RadialNode, event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  const candidateBadge = nodeCandidateBadge(node.source, candidateSelections)
  const selectedCandidate = selectedCandidateForNode(node.source, candidateSelections)
  const mediaKind = mediaKindForNode(node.source)
  return (
    <button
      type="button"
      className="content-canvas-radial-node"
      data-variant={node.variant}
      data-selected={selected ? 'true' : undefined}
      data-dragging={dragging ? 'true' : undefined}
      style={{ '--node-x': `${node.x}px`, '--node-y': `${node.y}px` } as CSSProperties}
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
        <small>
          {node.code}
          {mediaKind ? <b>{mediaKindLabel(mediaKind)}</b> : null}
        </small>
        <strong>{node.title}</strong>
        <em>{selectedCandidate?.title || node.description}</em>
        {candidateBadge ? <i>{candidateBadge}</i> : null}
      </span>
    </button>
  )
}

