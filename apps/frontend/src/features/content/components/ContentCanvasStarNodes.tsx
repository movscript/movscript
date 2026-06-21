import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { CandidateSelections, RadialNode, SceneSettingGroup } from './contentCanvasWorkspaceTypes'
import {
  candidateDecisionForNode,
  iconForContentNode,
  mediaKindForNode,
  mediaKindLabel,
  selectedCandidateForNode,
} from './contentCanvasWorkspaceModel'

export function SceneSettingGroupCard({
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

export function settingGroupNodes(group: SceneSettingGroup): RadialNode[] {
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

export function settingGroupLayout(nodes: RadialNode[]) {
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

export function RadialNodeCard({
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
