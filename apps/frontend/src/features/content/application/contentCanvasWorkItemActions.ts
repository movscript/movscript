import type { ContentCanvasNode } from '../domain/contentCanvasTypes'

export type ContentCanvasWorkItemActionKind =
  | 'create_content_unit_from_asset'
  | 'create_content_unit_from_scene_moment'
  | 'select_candidate'
  | 'unsupported'

export interface ContentCanvasWorkItemActionPlan {
  id: string
  kind: ContentCanvasWorkItemActionKind
  label: string
  actionLabel: string
  targetNodeId?: string
  targetTitle?: string
  executable: boolean
  disabledReason?: string
}

export function planContentCanvasWorkItemActions(
  workItemNode: ContentCanvasNode,
  targetNodes: ContentCanvasNode[],
): ContentCanvasWorkItemActionPlan[] {
  if (workItemNode.kind !== 'work_item') return []
  const actionLabels = actionLabelsFromNode(workItemNode)
  if (actionLabels.length === 0) return []
  if (targetNodes.length === 0) {
    return actionLabels.map((actionLabel, index) => unsupportedAction({
      id: `missing-target:${index}:${actionLabel}`,
      actionLabel,
      disabledReason: '缺少处理目标',
    }))
  }

  const planned: ContentCanvasWorkItemActionPlan[] = []
  for (const targetNode of targetNodes) {
    for (const actionLabel of actionLabels) {
      planned.push(planActionForTarget(actionLabel, targetNode))
    }
  }
  return dedupeActionPlans(planned)
}

function planActionForTarget(actionLabel: string, targetNode: ContentCanvasNode): ContentCanvasWorkItemActionPlan {
  const text = actionLabel.trim().toLowerCase()
  const base = {
    id: `${targetNode.id}:${actionLabel}`,
    actionLabel,
    targetNodeId: targetNode.id,
    targetTitle: targetNode.title,
  }
  const selectionIntent = containsAny(text, ['选择', '采纳', 'select', 'choose', 'adopt'])
  const createIntent = !selectionIntent && containsAny(text, ['制作项', '候选', '生成', '补齐', 'create', 'generate', 'content unit'])

  if (targetNode.kind === 'asset' && createIntent) {
    return {
      ...base,
      kind: 'create_content_unit_from_asset',
      label: '准备素材生成',
      executable: true,
    }
  }

  if (targetNode.kind === 'scene_moment' && createIntent) {
    return {
      ...base,
      kind: 'create_content_unit_from_scene_moment',
      label: '准备情节生成',
      executable: true,
    }
  }

  if (targetNode.kind === 'candidate' && selectionIntent) {
    const selected = targetNode.record.selected === true
    return {
      ...base,
      kind: 'select_candidate',
      label: selected ? '候选已选择' : '选择候选',
      executable: !selected,
      disabledReason: selected ? '候选已选择' : undefined,
    }
  }

  return unsupportedAction({
    id: `${targetNode.id}:${actionLabel}`,
    actionLabel,
    targetNodeId: targetNode.id,
    targetTitle: targetNode.title,
  })
}

function unsupportedAction(input: {
  id: string
  actionLabel: string
  targetNodeId?: string
  targetTitle?: string
  disabledReason?: string
}): ContentCanvasWorkItemActionPlan {
  return {
    id: input.id,
    kind: 'unsupported',
    label: input.actionLabel,
    actionLabel: input.actionLabel,
    targetNodeId: input.targetNodeId,
    targetTitle: input.targetTitle,
    executable: false,
    disabledReason: input.disabledReason ?? '暂未接入自动执行',
  }
}

function actionLabelsFromNode(node: ContentCanvasNode): string[] {
  if (!Array.isArray(node.record.actionLabels)) return []
  return node.record.actionLabels
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim())
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle))
}

function dedupeActionPlans(plans: ContentCanvasWorkItemActionPlan[]): ContentCanvasWorkItemActionPlan[] {
  const seen = new Set<string>()
  return plans.filter((plan) => {
    const key = `${plan.kind}:${plan.targetNodeId ?? ''}:${plan.actionLabel}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
