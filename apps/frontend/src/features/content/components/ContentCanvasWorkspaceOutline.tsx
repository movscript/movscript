import { Plus } from 'lucide-react'

import type { TimelineTrack, TreeNodeData } from './contentCanvasWorkspaceTypes'

export function SceneTimeline({ emptyText, items, title }: { emptyText: string; items: TimelineTrack[]; title: string }) {
  const totalDuration = Math.max(12, ...items.flatMap((track) => track.items.map((item) => (item.startSec ?? 0) + (item.durationSec ?? 0))))
  return (
    <div className="content-canvas-timeline">
      <div className="content-canvas-timeline__header">
        <div>
          <strong>{title}</strong>
          <span>Media editing project view · {formatSeconds(totalDuration)} total</span>
        </div>
      </div>
      <div className="content-canvas-timeline__ruler" aria-hidden="true">
        <span>00:00</span>
        <span>{formatSeconds(totalDuration / 3)}</span>
        <span>{formatSeconds(totalDuration * 2 / 3)}</span>
        <span>{formatSeconds(totalDuration)}</span>
      </div>
      <div className="content-canvas-timeline__tracks">
        {items.length ? items.map((track) => (
          <div key={track.kind} className="content-canvas-timeline__track" data-track={track.kind}>
            <span className="content-canvas-timeline__track-label">{track.label}</span>
            <div className="content-canvas-timeline__track-surface">
              {track.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="content-canvas-timeline__item"
                  data-type={item.type}
                  data-status={item.status}
                  style={{ left: `${item.start}%`, width: `${item.width}%` }}
                  title={timelineItemTitle(item)}
                >
                  <span className="content-canvas-timeline__item-handle" aria-hidden="true" />
                  <span className="content-canvas-timeline__item-copy">
                    <strong>{item.title}</strong>
                    <small>{timelineItemMeta(item)}</small>
                  </span>
                  <span className="content-canvas-timeline__item-handle" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )) : <span className="content-canvas-timeline__empty">{emptyText}</span>}
      </div>
    </div>
  )
}

export function TreeNode({
  node,
  onCreateChild,
  onSelectStructureNode,
}: {
  node: TreeNodeData
  onCreateChild?: (node: TreeNodeData) => void
  onSelectStructureNode: (node: TreeNodeData) => void
}) {
  const createLabel = node.kind === 'production' ? '添加 Segment' : node.kind === 'segment' ? '添加 Scene Moment' : null
  const isSelectable = Boolean(node.id)
  return (
    <div className="content-canvas-workspace-tree-node-wrap">
      <div className="content-canvas-workspace-tree-node-row">
        <button
          type="button"
          className="content-canvas-workspace-tree-node"
          data-active={node.active ? 'true' : undefined}
          data-tone={node.tone}
          title={node.meta ? `${node.title} · ${node.meta}` : node.title}
          onClick={isSelectable && node.id ? () => onSelectStructureNode(node) : undefined}
        >
          <span className="content-canvas-workspace-tree-node__chevron">{node.children?.length ? '⌄' : ''}</span>
          <span className="content-canvas-workspace-tree-node__code">{node.code}</span>
          <span className="content-canvas-workspace-tree-node__copy">
            <strong>{node.title}</strong>
            <small>{node.meta}</small>
          </span>
        </button>
        {createLabel && onCreateChild ? (
          <button
            type="button"
            className="content-canvas-workspace-tree-node__add"
            title={createLabel}
            aria-label={createLabel}
            onClick={() => onCreateChild(node)}
          >
            <Plus size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {node.children?.length ? (
        <div className="content-canvas-workspace-tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id ?? child.title}
              node={child}
              onCreateChild={onCreateChild}
              onSelectStructureNode={onSelectStructureNode}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function timelineItemMeta(item: TimelineTrack['items'][number]): string {
  return [
    item.resourceId ? `res ${item.resourceId}` : statusLabelForTimelineItem(item.status),
    item.startSec !== undefined ? `${formatSeconds(item.startSec)}+${formatSeconds(item.durationSec ?? 0)}` : undefined,
    item.trimStartSec !== undefined || item.trimEndSec !== undefined ? `trim ${item.trimStartSec ?? 0}/${item.trimEndSec ?? 0}` : undefined,
  ].filter(Boolean).join(' · ')
}

function timelineItemTitle(item: TimelineTrack['items'][number]): string {
  return `${item.title}${item.resourceId ? ` · resource ${item.resourceId}` : ''}${item.contentUnitId ? ` · content unit ${item.contentUnitId}` : ''}`
}

function statusLabelForTimelineItem(status: TimelineTrack['items'][number]['status']): string {
  if (status === 'selected') return 'selected'
  if (status === 'needs_candidate') return 'needs candidate'
  if (status === 'stale') return 'stale'
  if (status === 'missing') return 'missing'
  return 'ready'
}

function formatSeconds(value: number): string {
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
