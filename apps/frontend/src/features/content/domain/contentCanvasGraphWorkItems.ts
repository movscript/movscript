import type { ProductionWorkItemView } from '@movscript/core/content'

import type { ContentCanvasNode, ContentCanvasNodeKind } from './contentCanvasTypes'

const WORK_ITEM_TARGET_KINDS = new Set<ContentCanvasNodeKind>([
  'project',
  'production',
  'segment',
  'scene_moment',
  'expression_unit',
  'content_unit',
  'candidate',
  'selection',
  'resource',
  'asset',
  'setting',
  'state',
  'audio_cue',
  'work_item',
  'actor',
  'group',
])

export function createWorkItemNodes(items: ProductionWorkItemView[]): ContentCanvasNode[] {
  return items.map((item) => ({
    id: workItemNodeIdFor(item),
    entityKey: item.id,
    kind: 'work_item',
    title: item.actionLabels[0] ?? workItemKindLabel(item.kind),
    subtitle: `${workItemSeverityLabel(item.severity)} / ${workItemActorLabel(item.recommendedActor)}`,
    summary: item.reason,
    status: statusForWorkItem(item),
    metrics: [
      `优先级 ${item.priority}`,
      `状态 ${item.status}`,
      `目标 ${item.targetKind}`,
      `建议 ${workItemActorLabel(item.recommendedActor)}`,
    ],
    sourcePath: item.targetPath ?? '',
    record: { ...item },
    candidates: [],
    position: { x: 0, y: 0 },
  }))
}

export function createActorNodes(items: ProductionWorkItemView[]): ContentCanvasNode[] {
  const itemsByActor = new Map<ProductionWorkItemView['recommendedActor'], ProductionWorkItemView[]>()
  for (const item of items) {
    itemsByActor.set(item.recommendedActor, [...(itemsByActor.get(item.recommendedActor) ?? []), item])
  }
  return [...itemsByActor.entries()].map(([actor, actorItems]) => {
    const blocking = actorItems.filter((item) => item.severity === 'blocking' || item.status === 'blocked').length
    const warning = actorItems.filter((item) => item.severity === 'warning').length
    return {
      id: actorNodeIdFor(actor),
      entityKey: actor,
      kind: 'actor',
      title: workItemActorLabel(actor),
      subtitle: '推荐处理者',
      summary: actorSummary(actor),
      status: blocking > 0 ? 'missing' : actorItems.some((item) => item.status === 'open') ? 'active' : 'neutral',
      metrics: [
        `工作项 ${actorItems.length}`,
        blocking > 0 ? `阻塞 ${blocking}` : undefined,
        warning > 0 ? `警示 ${warning}` : undefined,
      ].filter((item): item is string => Boolean(item)),
      sourcePath: '',
      record: {
        actor,
        workItemIds: actorItems.map((item) => item.id),
      },
      candidates: [],
      position: { x: 0, y: 0 },
    } satisfies ContentCanvasNode
  })
}

export function workItemNodeIdFor(item: ProductionWorkItemView) {
  return `work_item:${item.id}`
}

export function actorNodeIdFor(actor: ProductionWorkItemView['recommendedActor']) {
  return `actor:${actor}`
}

export function targetNodeForWorkItem(
  item: ProductionWorkItemView,
  nodes: Map<string, ContentCanvasNode>,
  nodeByPath: Map<string, ContentCanvasNode>,
): ContentCanvasNode | undefined {
  if (item.targetPath) {
    const byPath = nodeByPath.get(item.targetPath)
    if (byPath) return byPath
  }
  const targetKind = contentCanvasKindFromTargetKind(item.targetKind)
  if (!targetKind || !item.targetId) return undefined
  return nodes.get(`${targetKind}:${item.targetId}`)
}

function contentCanvasKindFromTargetKind(kind: string): ContentCanvasNodeKind | undefined {
  if (kind === 'asset_reference') return 'asset'
  if (kind === 'content_unit_candidate') return 'candidate'
  return WORK_ITEM_TARGET_KINDS.has(kind as ContentCanvasNodeKind) ? kind as ContentCanvasNodeKind : undefined
}

function statusForWorkItem(item: ProductionWorkItemView): ContentCanvasNode['status'] {
  if (item.severity === 'blocking' || item.status === 'blocked') return 'missing'
  if (item.status === 'ready') return 'ready'
  if (item.status === 'open') return 'active'
  return 'neutral'
}

function workItemKindLabel(kind: string) {
  if (kind === 'missing_candidate') return '补齐候选'
  if (kind === 'stale_selection') return '复核选择'
  if (kind === 'missing_reference') return '补齐引用'
  if (kind === 'ready_to_generate') return '可生成'
  return '工作项'
}

function workItemSeverityLabel(severity: string) {
  if (severity === 'blocking') return '阻塞'
  if (severity === 'warning') return '警示'
  return '建议'
}

function workItemActorLabel(actor: ProductionWorkItemView['recommendedActor']) {
  if (actor === 'agent') return 'Agent'
  if (actor === 'workflow') return 'Workflow'
  return '人工'
}

function actorSummary(actor: ProductionWorkItemView['recommendedActor']) {
  if (actor === 'agent') return '适合由 Agent 接手的内容编排任务。'
  if (actor === 'workflow') return '适合由自动流程继续推进的内容编排任务。'
  return '需要人工判断或确认的内容编排任务。'
}
