import { useMemo, useState } from 'react'
import { Film, GitBranch, PackageCheck, Route, Sparkles } from 'lucide-react'
import {
  ChangeActionBadge,
  ProductionProposalContextGroup,
  ProductionProposalContextItemRow,
  ProductionProposalContextStack,
  ProductionProposalSemanticDiffEmptyText,
  ProductionProposalSemanticDiffFilterRow,
  ProductionProposalSemanticDiffGroupCard,
  ProductionProposalSemanticDiffOverview,
  ProductionProposalSemanticDiffRow as PackageProductionProposalSemanticDiffRow,
  ProductionProposalSemanticDiffStack,
} from '@movscript/ui'

import type {
  ProductionProposalContextResources,
  ProductionProposalNodeDecision,
  ProductionProposalNodeDecisions,
  ProductionProposalSemanticDiffGroup,
  ProductionProposalSemanticDiffItem,
  ProductionProposalSemanticDiffKind,
  ProductionProposalSnapshotAction,
} from '@/features/production/domain/productionProposalReviewTypes'

type ProductionProposalSemanticDiffDecisionFilter = 'pending' | 'all' | 'accepted' | 'rejected'
type ProductionProposalSemanticDiffActionFilter = 'all' | ProductionProposalSnapshotAction
type ProductionProposalSemanticDiffKindFilter = 'all' | ProductionProposalSemanticDiffKind

export function ProductionProposalSemanticDiffPanel({
  groups,
  decisions,
  onSetDecision,
  onSetDecisions,
}: {
  groups: ProductionProposalSemanticDiffGroup[]
  decisions: ProductionProposalNodeDecisions
  onSetDecision: (key: string, decision: ProductionProposalNodeDecision) => void
  onSetDecisions: (keys: string[], decision: ProductionProposalNodeDecision) => void
}) {
  const [decisionFilter, setDecisionFilter] = useState<ProductionProposalSemanticDiffDecisionFilter>('pending')
  const [actionFilter, setActionFilter] = useState<ProductionProposalSemanticDiffActionFilter>('all')
  const [kindFilter, setKindFilter] = useState<ProductionProposalSemanticDiffKindFilter>('all')
  const summary = useMemo(() => summarizeProductionProposalSemanticDiff(groups, decisions), [decisions, groups])
  const filteredGroups = useMemo(
    () => filterProductionProposalSemanticDiffGroups(groups, decisions, { decisionFilter, actionFilter, kindFilter }),
    [actionFilter, decisionFilter, decisions, groups, kindFilter],
  )

  if (groups.length === 0) {
    return (
      <ProductionProposalSemanticDiffEmptyText>
        当前提案没有可审阅的制作变更。
      </ProductionProposalSemanticDiffEmptyText>
    )
  }

  return (
    <ProductionProposalSemanticDiffStack>
      <ProductionProposalSemanticDiffOverview
        icon={GitBranch}
        filteredCount={filteredGroups.length}
        totalCount={groups.length}
        summary={summary}
      >
          <ProductionProposalSemanticDiffFilterRow
            items={[
              { value: 'pending', label: '未审' },
              { value: 'all', label: '全部' },
              { value: 'accepted', label: '已接受' },
              { value: 'rejected', label: '已拒绝' },
            ]}
            value={decisionFilter}
            onChange={(value) => setDecisionFilter(value as ProductionProposalSemanticDiffDecisionFilter)}
          />
          <ProductionProposalSemanticDiffFilterRow
            items={[
              { value: 'all', label: '全部动作' },
              { value: 'create', label: '新建' },
              { value: 'update', label: '更新' },
              { value: 'delete', label: '删除' },
            ]}
            value={actionFilter}
            onChange={(value) => setActionFilter(value as ProductionProposalSemanticDiffActionFilter)}
          />
          <ProductionProposalSemanticDiffFilterRow
            items={[
              { value: 'all', label: '全部类型' },
              { value: 'structure', label: '结构' },
              { value: 'content', label: '内容' },
              { value: 'reference', label: '设定' },
              { value: 'asset', label: '素材' },
            ]}
            value={kindFilter}
            onChange={(value) => setKindFilter(value as ProductionProposalSemanticDiffKindFilter)}
          />
      </ProductionProposalSemanticDiffOverview>

      {filteredGroups.length === 0 && (
        <ProductionProposalSemanticDiffEmptyText>
          当前筛选下没有变更项。
        </ProductionProposalSemanticDiffEmptyText>
      )}

      {filteredGroups.map((group) => {
        const visibleKeys = visibleProductionProposalSemanticDiffKeys(group)
        const groupDecision = summarizeProductionProposalGroupDecision(visibleKeys, decisions)
        return (
          <ProductionProposalSemanticDiffGroupCard
            key={group.key}
            action={group.action}
            title={group.title}
            detail={group.detail}
            decision={groupDecision}
            stats={productionProposalSemanticDiffGroupStats(group)}
            onAcceptVisible={() => onSetDecisions(uniqueStrings([group.key, ...group.children.flatMap((item): string[] => productionProposalSemanticDiffAcceptKeys(item))]), 'accepted')}
            onRejectVisible={() => onSetDecisions(visibleKeys, 'rejected')}
          >
            {group.children.map((item) => (
              <ProductionProposalSemanticDiffRow
                key={item.key}
                item={item}
                decision={decisions[item.key]}
                onSetDecision={onSetDecision}
                onSetDecisions={onSetDecisions}
              />
            ))}
          </ProductionProposalSemanticDiffGroupCard>
        )
      })}
    </ProductionProposalSemanticDiffStack>
  )
}

export function ProductionProposalContextPanel({
  context,
  decisions,
  onSetDecision,
}: {
  context: ProductionProposalContextResources
  decisions: ProductionProposalNodeDecisions
  onSetDecision: (key: string, decision: ProductionProposalNodeDecision) => void
}) {
  return (
    <ProductionProposalContextStack>
      <ProductionProposalContextGroup icon={Sparkles} title="设定资料" count={context.creativeReferences.length} empty="本提案没有设定资料引用">
        {context.creativeReferences.map((item, index) => (
          <ProductionProposalContextItemRow
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
      </ProductionProposalContextGroup>
      <ProductionProposalContextGroup icon={PackageCheck} title="素材需求" count={context.assetSlots.length} empty="本提案没有素材需求">
        {context.assetSlots.map((item, index) => (
          <ProductionProposalContextItemRow
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
      </ProductionProposalContextGroup>
    </ProductionProposalContextStack>
  )
}

export function ProductionProposalDiffActionBadge({ action, compact = false }: { action: ProductionProposalSnapshotAction | undefined; compact?: boolean }) {
  return <ChangeActionBadge action={action} compact={compact} />
}

function ProductionProposalSemanticDiffRow({
  item,
  decision,
  onSetDecision,
  onSetDecisions,
}: {
  item: ProductionProposalSemanticDiffItem
  decision?: ProductionProposalNodeDecision
  onSetDecision: (key: string, decision: ProductionProposalNodeDecision) => void
  onSetDecisions: (keys: string[], decision: ProductionProposalNodeDecision) => void
}) {
  const Icon = item.kind === 'reference' ? Sparkles : item.kind === 'asset' ? PackageCheck : item.kind === 'content' ? Film : Route
  const projectBoundaryBlocked = isProductionDiffItemBlockedByProjectBoundary(item)
  return (
    <PackageProductionProposalSemanticDiffRow
      icon={Icon}
      action={item.action}
      title={item.title}
      detail={item.detail}
      before={item.before}
      after={item.after}
      decision={decision}
      blocked={projectBoundaryBlocked}
      acceptTitle={projectBoundaryBlocked ? '设定和素材需求需要先处理对应上游草稿' : undefined}
      onAccept={() => onSetDecisions(projectBoundaryBlocked ? [] : item.acceptKeys, 'accepted')}
      onReject={() => onSetDecision(item.key, 'rejected')}
    />
  )
}

function isProductionDiffItemBlockedByProjectBoundary(item: ProductionProposalSemanticDiffItem) {
  return item.kind === 'reference' && item.action === 'create'
}

function productionProposalSemanticDiffAcceptKeys(item: ProductionProposalSemanticDiffItem): string[] {
  return isProductionDiffItemBlockedByProjectBoundary(item) ? [] : item.acceptKeys
}

function summarizeProductionProposalGroupDecision(keys: string[], decisions: ProductionProposalNodeDecisions): ProductionProposalNodeDecision | 'mixed' | undefined {
  const decided = keys.map((key) => decisions[key]).filter(Boolean)
  if (decided.length === 0) return undefined
  if (decided.length !== keys.length) return 'mixed'
  return decided.every((decision) => decision === 'accepted') ? 'accepted'
    : decided.every((decision) => decision === 'rejected') ? 'rejected'
      : 'mixed'
}

function visibleProductionProposalSemanticDiffKeys(group: ProductionProposalSemanticDiffGroup) {
  return group.visibleNodeKeys ?? group.nodeKeys
}

function productionProposalSemanticDiffGroupStats(group: ProductionProposalSemanticDiffGroup): string[] {
  return [
    `${group.children.filter((item) => item.kind === 'structure').length} 情节`,
    `${group.children.filter((item) => item.kind === 'content').length} 内容分镜`,
    `${group.children.filter((item) => item.kind === 'reference').length} 设定引用`,
    `${group.children.filter((item) => item.kind === 'asset').length} 素材需求`,
  ]
}

function summarizeProductionProposalSemanticDiff(groups: ProductionProposalSemanticDiffGroup[], decisions: ProductionProposalNodeDecisions) {
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

function filterProductionProposalSemanticDiffGroups(
  groups: ProductionProposalSemanticDiffGroup[],
  decisions: ProductionProposalNodeDecisions,
  filters: {
    decisionFilter: ProductionProposalSemanticDiffDecisionFilter
    actionFilter: ProductionProposalSemanticDiffActionFilter
    kindFilter: ProductionProposalSemanticDiffKindFilter
  },
) {
  return groups.flatMap((group) => {
    const groupMatches = productionProposalSemanticDiffNodeMatches({
      key: group.key,
      action: group.action,
      kind: group.kind,
    }, decisions, filters)
    const children = group.children.filter((item) => productionProposalSemanticDiffNodeMatches(item, decisions, filters))
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

function productionProposalSemanticDiffNodeMatches(
  node: { key: string; action?: ProductionProposalSnapshotAction; kind: ProductionProposalSemanticDiffKind },
  decisions: ProductionProposalNodeDecisions,
  filters: {
    decisionFilter: ProductionProposalSemanticDiffDecisionFilter
    actionFilter: ProductionProposalSemanticDiffActionFilter
    kindFilter: ProductionProposalSemanticDiffKindFilter
  },
) {
  const decision = decisions[node.key]
  const decisionMatched = filters.decisionFilter === 'all'
    || (filters.decisionFilter === 'pending' ? !decision : decision === filters.decisionFilter)
  const actionMatched = filters.actionFilter === 'all' || normalizeProductionProposalSemanticAction(node.action) === filters.actionFilter
  const kindMatched = filters.kindFilter === 'all' || node.kind === filters.kindFilter
  return decisionMatched && actionMatched && kindMatched
}

function normalizeProductionProposalSemanticAction(action?: ProductionProposalSnapshotAction): ProductionProposalSemanticDiffActionFilter {
  if (action === 'delete') return 'delete'
  return action === 'update' ? 'update' : 'create'
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}
