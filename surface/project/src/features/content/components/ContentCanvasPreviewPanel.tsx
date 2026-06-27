import { useEffect, useMemo, useState } from 'react'
import { Film, Image as ImageIcon } from 'lucide-react'

import { ResourceFileImage, ResourceFileVideo } from '@movscript/resource-surface/resource-media-components'

import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { CandidateSelections, ContentCanvasPreviewScope } from './contentCanvasWorkspaceTypes'
import { contentCanvasGenerationTargetForNode } from './contentCanvasWorkspaceGenerationModel'
import { contentCanvasWorkspaceIndex } from './contentCanvasWorkspaceGraphModel'
import {
  candidateDecisionForNode,
  mediaKindForNode,
  mediaKindLabel,
  selectedCandidateForNode,
  uniqueContentNodes,
} from './contentCanvasWorkspaceModel'

type PreviewTargetRow = {
  id: string
  node: ContentCanvasNode
  candidate: ContentCanvasCandidate | null
  selected: boolean
  state: 'selected' | 'pending' | 'empty'
  stateLabel: string
}

export function ContentCanvasPreviewPanel({
  activeNode,
  candidateSelections,
  graphIndex,
  nodes,
  previewScope,
}: {
  activeNode: ContentCanvasNode | null
  candidateSelections: CandidateSelections
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>
  nodes: ContentCanvasNode[]
  previewScope: ContentCanvasPreviewScope
}) {
  const previewNode = activeNode ?? previewScope.rootNode ?? firstPreviewNode(nodes, previewScope.kind)
  const previewRows = useMemo(
    () => previewTargetRows(previewNode, graphIndex, candidateSelections),
    [candidateSelections, graphIndex, previewNode],
  )
  const emptyCopy = previewEmptyCopy(previewScope)
  const defaultRow = previewRows.find((row) => row.selected && row.candidate)
    ?? previewRows.find((row) => row.candidate)
    ?? previewRows[0]
    ?? null
  const [previewRowId, setPreviewRowId] = useState<string | null>(null)
  const previewRow = previewRows.find((row) => row.id === previewRowId) ?? defaultRow
  const previewCandidate = previewRow?.candidate ?? null
  const scopeRoot = previewScope.kind === 'mixed' ? null : previewScope.rootNode

  useEffect(() => {
    setPreviewRowId(null)
  }, [previewNode?.id])

  return (
    <main className="content-canvas-preview-panel" aria-label="创作预览">
      {scopeRoot ? (
        <header className="content-canvas-preview-scope-header">
          <span>
            <strong>{scopeRoot.title}</strong>
            <small>{previewScopeLabel(previewScope)}</small>
          </span>
          <em>{scopeRoot.sourcePath || scopeRoot.id}</em>
        </header>
      ) : null}
      <section className="content-canvas-preview-player" aria-label="预览播放器">
        <div className="content-canvas-preview-player__screen">
          {previewCandidate ? (
            <CandidatePreviewMedia candidate={previewCandidate} node={previewRow?.node ?? previewNode ?? undefined} />
          ) : (
            <div className="content-canvas-preview-player__empty">
              <Film size={42} aria-hidden="true" />
              <strong>{previewRow?.node.title ?? previewNode?.title ?? emptyCopy.title}</strong>
              <span>{previewNode ? emptyCopy.nodeEmptyText : emptyCopy.emptyText}</span>
            </div>
          )}
        </div>
        <div className="content-canvas-preview-player__meta">
          <span>
            <strong>{previewRow?.node.title ?? previewNode?.title ?? '预览'}</strong>
            <small>{previewRow ? mediaKindLabel(mediaKindForNode(previewRow.node)) : previewNode ? mediaKindLabel(mediaKindForNode(previewNode)) : '请选择节点'}</small>
          </span>
          <em>{previewRow ? previewRow.stateLabel : previewCandidate ? previewCandidate.id : '无候选'}</em>
        </div>
      </section>

      <section className="content-canvas-preview-candidates" aria-label="候选横向列表">
        {previewRows.length ? previewRows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="content-canvas-preview-candidate-card"
            data-preview-active={row.id === previewRow?.id ? 'true' : undefined}
            data-state={row.state}
            onClick={() => setPreviewRowId(row.id)}
          >
            <span className="content-canvas-preview-candidate-card__thumb">
              <CandidatePreviewMedia candidate={row.candidate} node={row.node} compact />
            </span>
            <span className="content-canvas-preview-candidate-card__copy">
              <strong>{row.node.title}</strong>
              <small>{row.candidate?.title || row.candidate?.id || mediaKindLabel(mediaKindForNode(row.node))}</small>
            </span>
            <em>{row.id === previewRow?.id ? '预览中' : row.stateLabel}</em>
          </button>
        )) : (
          <div className="content-canvas-preview-candidates__empty">
            <ImageIcon size={18} aria-hidden="true" />
            <span>{emptyCopy.candidatesEmptyText}</span>
          </div>
        )}
      </section>
    </main>
  )
}

function previewScopeLabel(scope: ContentCanvasPreviewScope): string {
  if (scope.kind === 'production') return '制作预览'
  if (scope.kind === 'setting') return '设定预览'
  return '项目预览'
}

function CandidatePreviewMedia({
  candidate,
  compact = false,
  node,
}: {
  candidate: ContentCanvasCandidate | null
  compact?: boolean
  node?: ContentCanvasNode
}) {
  const mediaKind = `${candidate?.resourceKind ?? mediaKindForNode(node)}`.toLowerCase()
  const className = compact ? 'content-canvas-preview-media content-canvas-preview-media--thumb' : 'content-canvas-preview-media content-canvas-preview-media--player'
  if (candidate?.resourceId !== undefined && mediaKind.includes('video')) {
    return (
      <span className={compact ? 'content-canvas-preview-media-frame content-canvas-preview-media-frame--thumb' : 'content-canvas-preview-media-frame content-canvas-preview-media-frame--player'}>
        <ResourceFileVideo className={className} resourceId={candidate.resourceId} muted playsInline controls={!compact} preload="metadata" />
      </span>
    )
  }
  if (candidate?.resourceId !== undefined && (mediaKind.includes('image') || mediaKind.includes('board') || mediaKind.includes('keyframe') || mediaKind.includes('scene'))) {
    return (
      <span className={compact ? 'content-canvas-preview-media-frame content-canvas-preview-media-frame--thumb' : 'content-canvas-preview-media-frame content-canvas-preview-media-frame--player'}>
        <ResourceFileImage className={className} resourceId={candidate.resourceId} alt={candidate.title || candidate.id} loading="lazy" />
      </span>
    )
  }
  return (
    <span className="content-canvas-preview-media-fallback">
      <ImageIcon size={compact ? 18 : 38} aria-hidden="true" />
      {!compact ? <small>{candidate?.title || candidate?.id || '暂无候选'}</small> : null}
    </span>
  )
}

function previewTargetRows(
  node: ContentCanvasNode | null,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
  candidateSelections: CandidateSelections,
): PreviewTargetRow[] {
  const targets = previewTargetNodes(node, graphIndex)
  return targets.map((targetNode) => previewTargetRow(targetNode, candidateSelections))
}

function previewTargetNodes(
  node: ContentCanvasNode | null,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
): ContentCanvasNode[] {
  if (!node) return []
  if (node.kind === 'production' || node.kind === 'segment') {
    return descendantsOfKind(node, graphIndex, 'scene_moment')
  }
  if (node.kind === 'setting' || node.kind === 'state') {
    return descendantsOfKind(node, graphIndex, 'asset')
  }
  return contentCanvasGenerationTargetForNode(node) ? [node] : []
}

function descendantsOfKind(
  node: ContentCanvasNode,
  graphIndex: ReturnType<typeof contentCanvasWorkspaceIndex>,
  kind: ContentCanvasNode['kind'],
): ContentCanvasNode[] {
  const output: ContentCanvasNode[] = []
  const visit = (nodeId: string) => {
    for (const child of graphIndex.childNodesByHierarchy.get(nodeId) ?? []) {
      if (child.kind === kind) output.push(child)
      visit(child.id)
    }
  }
  visit(node.id)
  return uniqueContentNodes(output)
}

function previewTargetRow(node: ContentCanvasNode, candidateSelections: CandidateSelections): PreviewTargetRow {
  const target = contentCanvasGenerationTargetForNode(node ?? undefined)
  const targetNode = target?.node ?? node
  const decision = candidateDecisionForNode(targetNode, candidateSelections)
  const selected = selectedCandidateForNode(targetNode, candidateSelections)
  const hasExplicitSelection = Boolean(decision?.hasExplicitSelection)
  const candidate = hasExplicitSelection ? selected ?? target?.candidates[0] ?? null : target?.candidates[0] ?? null
  const state = hasExplicitSelection ? 'selected' : target?.candidates.length ? 'pending' : 'empty'
  return {
    id: `${node.id}:${candidate?.id ?? state}`,
    node,
    candidate,
    selected: hasExplicitSelection,
    state,
    stateLabel: state === 'selected' ? '已选择' : state === 'pending' ? '待选择' : '无候选',
  }
}

function firstPreviewNode(
  nodes: ContentCanvasNode[],
  defaultScope: ContentCanvasPreviewScope['kind'],
): ContentCanvasNode | null {
  if (defaultScope === 'production') {
    const productionNode = nodes.find((node) => node.kind === 'production')
    if (productionNode) return productionNode
  }
  if (defaultScope === 'setting') {
    const settingNode = nodes.find((node) => node.kind === 'setting')
    if (settingNode) return settingNode
  }
  return nodes.find((node) => {
    const target = contentCanvasGenerationTargetForNode(node)
    return Boolean(target?.candidates.length)
  }) ?? nodes.find((node) => Boolean(contentCanvasGenerationTargetForNode(node))) ?? null
}

function previewEmptyCopy(scope: ContentCanvasPreviewScope): {
  title: string
  emptyText: string
  nodeEmptyText: string
  candidatesEmptyText: string
} {
  if (scope.kind === 'production') {
    return {
      title: '请选择 Production',
      emptyText: '从项目首页选择一个 production 进入独立预览。',
      nodeEmptyText: '当前 production 节点还没有可预览候选。',
      candidatesEmptyText: '当前 production 下暂无可预览 scene moment。',
    }
  }
  if (scope.kind === 'setting') {
    return {
      title: '暂无设定预览目标',
      emptyText: '从左侧选择一个 setting、state 或 asset 查看资源。',
      nodeEmptyText: '当前设定节点还没有可预览候选。',
      candidatesEmptyText: '当前 setting 下暂无可预览 asset。',
    }
  }
  return {
    title: '暂无预览目标',
    emptyText: '从左侧结构选择一个创作节点开始预览。',
    nodeEmptyText: '当前节点还没有可预览候选。',
    candidatesEmptyText: '当前结构下暂无可预览节点。',
  }
}
