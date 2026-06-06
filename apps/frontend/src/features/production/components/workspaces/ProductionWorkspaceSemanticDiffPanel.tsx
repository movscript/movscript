import { useMemo, useState } from 'react'
import { Film, GitBranch, PackageCheck, Route, Sparkles } from 'lucide-react'
import {
  ChangeActionBadge,
  ProductionWorkspaceContextGroup,
  ProductionWorkspaceContextItemRow,
  ProductionWorkspaceContextStack,
  ProductionWorkspaceSemanticDiffEmptyText,
  ProductionWorkspaceSemanticDiffFilterRow,
  ProductionWorkspaceSemanticDiffGroupCard,
  ProductionWorkspaceSemanticDiffOverview,
  ProductionWorkspaceSemanticDiffRow as PackageProductionWorkspaceSemanticDiffRow,
  ProductionWorkspaceSemanticDiffStack,
} from '@movscript/ui'

import type {
  ProductionWorkspaceContextResources,
  ProductionWorkspaceNodeDecision,
  ProductionWorkspaceNodeDecisions,
  ProductionWorkspaceSemanticDiffGroup,
  ProductionWorkspaceSemanticDiffItem,
  ProductionWorkspaceSemanticDiffKind,
  ProductionWorkspaceSnapshotAction,
} from '@/features/production/domain/productionWorkspaceReviewTypes'

type ProductionWorkspaceSemanticDiffDecisionFilter = 'pending' | 'all' | 'accepted' | 'rejected'
type ProductionWorkspaceSemanticDiffActionFilter = 'all' | ProductionWorkspaceSnapshotAction
type ProductionWorkspaceSemanticDiffKindFilter = 'all' | ProductionWorkspaceSemanticDiffKind

export function ProductionWorkspaceSemanticDiffPanel({
  groups,
  decisions,
  onSetDecision,
  onSetDecisions,
}: {
  groups: ProductionWorkspaceSemanticDiffGroup[]
  decisions: ProductionWorkspaceNodeDecisions
  onSetDecision: (key: string, decision: ProductionWorkspaceNodeDecision) => void
  onSetDecisions: (keys: string[], decision: ProductionWorkspaceNodeDecision) => void
}) {
  const [decisionFilter, setDecisionFilter] = useState<ProductionWorkspaceSemanticDiffDecisionFilter>('pending')
  const [actionFilter, setActionFilter] = useState<ProductionWorkspaceSemanticDiffActionFilter>('all')
  const [kindFilter, setKindFilter] = useState<ProductionWorkspaceSemanticDiffKindFilter>('all')
  const summary = useMemo(() => summarizeProductionWorkspaceSemanticDiff(groups, decisions), [decisions, groups])
  const filteredGroups = useMemo(
    () => filterProductionWorkspaceSemanticDiffGroups(groups, decisions, { decisionFilter, actionFilter, kindFilter }),
    [actionFilter, decisionFilter, decisions, groups, kindFilter],
  )

  if (groups.length === 0) {
    return (
      <ProductionWorkspaceSemanticDiffEmptyText>
        当前工作区没有可审阅的制作变更。
      </ProductionWorkspaceSemanticDiffEmptyText>
    )
  }

  return (
    <ProductionWorkspaceSemanticDiffStack>
      <ProductionWorkspaceSemanticDiffOverview
        icon={GitBranch}
        filteredCount={filteredGroups.length}
        totalCount={groups.length}
        summary={summary}
      >
          <ProductionWorkspaceSemanticDiffFilterRow
            items={[
              { value: 'pending', label: '未审' },
              { value: 'all', label: '全部' },
              { value: 'accepted', label: '已接受' },
              { value: 'rejected', label: '已拒绝' },
            ]}
            value={decisionFilter}
            onChange={(value) => setDecisionFilter(value as ProductionWorkspaceSemanticDiffDecisionFilter)}
          />
          <ProductionWorkspaceSemanticDiffFilterRow
            items={[
              { value: 'all', label: '全部动作' },
              { value: 'create', label: '新建' },
              { value: 'update', label: '更新' },
              { value: 'delete', label: '删除' },
            ]}
            value={actionFilter}
            onChange={(value) => setActionFilter(value as ProductionWorkspaceSemanticDiffActionFilter)}
          />
          <ProductionWorkspaceSemanticDiffFilterRow
            items={[
              { value: 'all', label: '全部类型' },
              { value: 'structure', label: '结构' },
              { value: 'content', label: '内容' },
              { value: 'reference', label: '设定' },
              { value: 'asset', label: '素材' },
            ]}
            value={kindFilter}
            onChange={(value) => setKindFilter(value as ProductionWorkspaceSemanticDiffKindFilter)}
          />
      </ProductionWorkspaceSemanticDiffOverview>

      {filteredGroups.length === 0 && (
        <ProductionWorkspaceSemanticDiffEmptyText>
          当前筛选下没有变更项。
        </ProductionWorkspaceSemanticDiffEmptyText>
      )}

      {filteredGroups.map((group) => {
        const visibleKeys = visibleProductionWorkspaceSemanticDiffKeys(group)
        const groupDecision = summarizeProductionWorkspaceGroupDecision(visibleKeys, decisions)
        return (
          <ProductionWorkspaceSemanticDiffGroupCard
            key={group.key}
            action={group.action}
            title={group.title}
            detail={group.detail}
            decision={groupDecision}
            stats={productionWorkspaceSemanticDiffGroupStats(group)}
            onAcceptVisible={() => onSetDecisions(uniqueStrings([group.key, ...group.children.flatMap((item): string[] => productionWorkspaceSemanticDiffAcceptKeys(item))]), 'accepted')}
            onRejectVisible={() => onSetDecisions(visibleKeys, 'rejected')}
          >
            {group.children.map((item) => (
              <ProductionWorkspaceSemanticDiffRow
                key={item.key}
                item={item}
                decision={decisions[item.key]}
                onSetDecision={onSetDecision}
                onSetDecisions={onSetDecisions}
              />
            ))}
          </ProductionWorkspaceSemanticDiffGroupCard>
        )
      })}
    </ProductionWorkspaceSemanticDiffStack>
  )
}

export function ProductionWorkspaceContextPanel({
  context,
  decisions,
  onSetDecision,
}: {
  context: ProductionWorkspaceContextResources
  decisions: ProductionWorkspaceNodeDecisions
  onSetDecision: (key: string, decision: ProductionWorkspaceNodeDecision) => void
}) {
  return (
    <ProductionWorkspaceContextStack>
      <ProductionWorkspaceContextGroup icon={Sparkles} title="设定资料" count={context.settings.length} empty="本工作区没有设定资料引用">
        {context.settings.map((item, index) => (
          <ProductionWorkspaceContextItemRow
            key={`${item.nodeKey}-${index}`}
            action={item.action}
            title={item.title}
            parent={item.parent}
            detail={item.detail}
            decision={decisions[item.nodeKey]}
            onAccept={() => onSetDecision(item.nodeKey, 'accepted')}
            onReject={() => onSetDecision(item.nodeKey, 'rejected')}
          />
        ))}
      </ProductionWorkspaceContextGroup>
      <ProductionWorkspaceContextGroup icon={PackageCheck} title="素材需求" count={context.assetSlots.length} empty="本工作区没有素材需求">
        {context.assetSlots.map((item, index) => (
          <ProductionWorkspaceContextItemRow
            key={`${item.nodeKey}-${index}`}
            action={item.action}
            title={item.title}
            parent={item.parent}
            detail={item.detail}
            decision={decisions[item.nodeKey]}
            onAccept={() => onSetDecision(item.nodeKey, 'accepted')}
            onReject={() => onSetDecision(item.nodeKey, 'rejected')}
          />
        ))}
      </ProductionWorkspaceContextGroup>
    </ProductionWorkspaceContextStack>
  )
}

export function ProductionWorkspaceDiffActionBadge({ action, compact = false }: { action: ProductionWorkspaceSnapshotAction | undefined; compact?: boolean }) {
  return <ChangeActionBadge action={action} compact={compact} />
}

function ProductionWorkspaceSemanticDiffRow({
  item,
  decision,
  onSetDecision,
  onSetDecisions,
}: {
  item: ProductionWorkspaceSemanticDiffItem
  decision?: ProductionWorkspaceNodeDecision
  onSetDecision: (key: string, decision: ProductionWorkspaceNodeDecision) => void
  onSetDecisions: (keys: string[], decision: ProductionWorkspaceNodeDecision) => void
}) {
  const Icon = item.kind === 'reference' ? Sparkles : item.kind === 'asset' ? PackageCheck : item.kind === 'content' ? Film : Route
  const projectBoundaryBlocked = isProductionDiffItemBlockedByProjectBoundary(item)
  return (
    <PackageProductionWorkspaceSemanticDiffRow
      icon={Icon}
      action={item.action}
      title={item.title}
      detail={item.detail}
      before={item.before}
      after={item.after}
      decision={decision}
      blocked={projectBoundaryBlocked}
      acceptTitle={projectBoundaryBlocked ? '设定和素材需求需要先处理对应上游工作区' : undefined}
      onAccept={() => onSetDecisions(projectBoundaryBlocked ? [] : item.acceptKeys, 'accepted')}
      onReject={() => onSetDecision(item.key, 'rejected')}
    />
  )
}

function isProductionDiffItemBlockedByProjectBoundary(item: ProductionWorkspaceSemanticDiffItem) {
  return item.kind === 'reference' && item.action === 'create'
}

function productionWorkspaceSemanticDiffAcceptKeys(item: ProductionWorkspaceSemanticDiffItem): string[] {
  return isProductionDiffItemBlockedByProjectBoundary(item) ? [] : item.acceptKeys
}

function summarizeProductionWorkspaceGroupDecision(keys: string[], decisions: ProductionWorkspaceNodeDecisions): ProductionWorkspaceNodeDecision | 'mixed' | undefined {
  const decided = keys.map((key) => decisions[key]).filter(Boolean)
  if (decided.length === 0) return undefined
  if (decided.length !== keys.length) return 'mixed'
  return decided.every((decision) => decision === 'accepted') ? 'accepted'
    : decided.every((decision) => decision === 'rejected') ? 'rejected'
      : 'mixed'
}

function visibleProductionWorkspaceSemanticDiffKeys(group: ProductionWorkspaceSemanticDiffGroup) {
  return group.visibleNodeKeys ?? group.nodeKeys
}

function productionWorkspaceSemanticDiffGroupStats(group: ProductionWorkspaceSemanticDiffGroup): string[] {
  return [
    `${group.children.filter((item) => item.kind === 'structure').length} 情节`,
    `${group.children.filter((item) => item.kind === 'content').length} 内容分镜`,
    `${group.children.filter((item) => item.kind === 'reference').length} 设定引用`,
    `${group.children.filter((item) => item.kind === 'asset').length} 素材需求`,
  ]
}

function summarizeProductionWorkspaceSemanticDiff(groups: ProductionWorkspaceSemanticDiffGroup[], decisions: ProductionWorkspaceNodeDecisions) {
  const keys = groups.flatMap((group) => group.nodeKeys)
  const accepted = keys.filter((key) => decisions[key] === 'accepted').length
  const rejected = keys.filter((key) => decisions[key] === 'rejected').length
  return {
    total: keys.length,
    accepted,
    rejected,
    pending: Math.max(0, keys.length - accepted - rejected),
  }
}

function filterProductionWorkspaceSemanticDiffGroups(
  groups: ProductionWorkspaceSemanticDiffGroup[],
  decisions: ProductionWorkspaceNodeDecisions,
  filters: {
    decisionFilter: ProductionWorkspaceSemanticDiffDecisionFilter
    actionFilter: ProductionWorkspaceSemanticDiffActionFilter
    kindFilter: ProductionWorkspaceSemanticDiffKindFilter
  },
) {
  return groups.flatMap((group) => {
    const groupMatches = productionWorkspaceSemanticDiffNodeMatches({
      key: group.key,
      action: group.action,
      kind: group.kind,
    }, decisions, filters)
    const children = group.children.filter((item) => productionWorkspaceSemanticDiffNodeMatches(item, decisions, filters))
    if (!groupMatches && children.length === 0) return []
    return [{
      ...group,
      visibleNodeKeys: [
        ...(groupMatches ? [group.key] : []),
        ...children.map((item) => item.key),
      ],
      children,
    }]
  })
}

function productionWorkspaceSemanticDiffNodeMatches(
  node: { key: string; action?: ProductionWorkspaceSnapshotAction; kind: ProductionWorkspaceSemanticDiffKind },
  decisions: ProductionWorkspaceNodeDecisions,
  filters: {
    decisionFilter: ProductionWorkspaceSemanticDiffDecisionFilter
    actionFilter: ProductionWorkspaceSemanticDiffActionFilter
    kindFilter: ProductionWorkspaceSemanticDiffKindFilter
  },
) {
  const decision = decisions[node.key]
  const decisionMatched = filters.decisionFilter === 'all'
    || (filters.decisionFilter === 'pending' ? !decision : decision === filters.decisionFilter)
  const actionMatched = filters.actionFilter === 'all' || normalizeProductionWorkspaceSemanticAction(node.action) === filters.actionFilter
  const kindMatched = filters.kindFilter === 'all' || node.kind === filters.kindFilter
  return decisionMatched && actionMatched && kindMatched
}

function normalizeProductionWorkspaceSemanticAction(action?: ProductionWorkspaceSnapshotAction): ProductionWorkspaceSemanticDiffActionFilter {
  if (action === 'delete') return 'delete'
  return action === 'update' ? 'update' : 'create'
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}
