import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Film, GitBranch, PackageCheck, Route, Sparkles } from 'lucide-react'
import {
  AppPanel,
  AppTextEmptyState,
  Button,
  ChangeActionBadge,
  ReviewDecisionBadge,
  ReviewStat,
  changeActionRowClass,
  semanticToneClass,
} from '@movscript/ui'

import { cn } from '@/lib/utils'
import type { ProductionProposalSnapshotAction } from '@/components/proposals/ProductionProposalApplyPreviewPanel'

export type ProductionProposalNodeDecision = 'accepted' | 'rejected'
export type ProductionProposalNodeDecisions = Record<string, ProductionProposalNodeDecision>
export type ProductionProposalSemanticDiffKind = 'structure' | 'content' | 'reference' | 'asset'

export interface ProductionProposalContextItem {
  nodeKey: string
  action?: ProductionProposalSnapshotAction
  title: string
  detail: string
  parent: string
}

export interface ProductionProposalContextResources {
  creativeReferences: ProductionProposalContextItem[]
  assetSlots: ProductionProposalContextItem[]
}

export interface ProductionProposalSemanticDiffItem {
  key: string
  acceptKeys: string[]
  title: string
  detail: string
  action?: ProductionProposalSnapshotAction
  kind: ProductionProposalSemanticDiffKind
  before?: string
  after?: string
}

export interface ProductionProposalSemanticDiffGroup {
  key: string
  acceptKeys: string[]
  title: string
  detail: string
  action?: ProductionProposalSnapshotAction
  kind: ProductionProposalSemanticDiffKind
  nodeKeys: string[]
  visibleNodeKeys?: string[]
  stats: string[]
  children: ProductionProposalSemanticDiffItem[]
}

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
      <AppTextEmptyState>
        当前提案没有可审阅的制作变更。
      </AppTextEmptyState>
    )
  }

  return (
    <div className="space-y-2">
      <AppPanel
        icon={GitBranch}
        title="提案审阅"
        action={<ReviewStat tone="neutral">{filteredGroups.length}/{groups.length} 段</ReviewStat>}
      >
        <div className="grid grid-cols-4 gap-1.5 text-center type-tiny">
          <span className="rounded bg-muted px-1.5 py-1 text-foreground">总计 {summary.total}</span>
          <span className="rounded bg-muted px-1.5 py-1 text-foreground">未审 {summary.pending}</span>
          <ReviewStat tone="success">接受 {summary.accepted}</ReviewStat>
          <ReviewStat tone="danger">拒绝 {summary.rejected}</ReviewStat>
        </div>
        <div className="mt-3 space-y-2">
          <ProductionProposalDiffFilterRow
            items={[
              ['pending', '未审'],
              ['all', '全部'],
              ['accepted', '已接受'],
              ['rejected', '已拒绝'],
            ]}
            value={decisionFilter}
            onChange={(value) => setDecisionFilter(value as ProductionProposalSemanticDiffDecisionFilter)}
          />
          <ProductionProposalDiffFilterRow
            items={[
              ['all', '全部动作'],
              ['create', '新建'],
              ['update', '更新'],
              ['delete', '删除'],
            ]}
            value={actionFilter}
            onChange={(value) => setActionFilter(value as ProductionProposalSemanticDiffActionFilter)}
          />
          <ProductionProposalDiffFilterRow
            items={[
              ['all', '全部类型'],
              ['structure', '结构'],
              ['content', '内容'],
              ['reference', '设定'],
              ['asset', '素材'],
            ]}
            value={kindFilter}
            onChange={(value) => setKindFilter(value as ProductionProposalSemanticDiffKindFilter)}
          />
        </div>
      </AppPanel>

      {filteredGroups.length === 0 && (
        <AppTextEmptyState>
          当前筛选下没有变更项。
        </AppTextEmptyState>
      )}

      {filteredGroups.map((group) => {
        const visibleKeys = visibleProductionProposalSemanticDiffKeys(group)
        const groupDecision = summarizeProductionProposalGroupDecision(visibleKeys, decisions)
        return (
          <AppPanel key={group.key} className={cn(groupDecision === 'rejected' && 'opacity-60')} bodyClassName="p-0 divide-y divide-border/60">
            <div className="px-3 py-2">
              <div className="flex items-start gap-2">
                <ProductionProposalDiffActionBadge action={group.action} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate type-label font-semibold text-foreground">{group.title}</p>
                    {groupDecision !== 'mixed' && groupDecision && <ProductionProposalDecisionBadge decision={groupDecision} />}
                    {groupDecision === 'mixed' && <span className="rounded bg-muted px-1.5 py-0.5 type-micro font-medium text-muted-foreground">部分处理</span>}
                  </div>
                  {group.detail && <p className="mt-1 line-clamp-2 type-caption leading-4 text-muted-foreground">{group.detail}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {productionProposalSemanticDiffGroupStats(group).map((stat) => (
                      <span key={stat} className="rounded bg-muted px-1.5 py-0.5 type-tiny text-muted-foreground">{stat}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-1.5 pl-7">
                <Button size="xs" variant={groupDecision === 'accepted' ? 'secondary' : 'outline'} className="px-2 type-tiny" onClick={() => onSetDecisions(uniqueStrings([group.key, ...group.children.flatMap((item): string[] => productionProposalSemanticDiffAcceptKeys(item))]), 'accepted')}>
                  接受可见项
                </Button>
                <Button size="xs" variant={groupDecision === 'rejected' ? 'secondary' : 'ghost'} className="px-2 type-tiny" onClick={() => onSetDecisions(visibleKeys, 'rejected')}>
                  拒绝可见项
                </Button>
              </div>
            </div>
            {group.children.map((item) => (
              <ProductionProposalSemanticDiffRow
                key={item.key}
                item={item}
                decision={decisions[item.key]}
                onSetDecision={onSetDecision}
                onSetDecisions={onSetDecisions}
              />
            ))}
          </AppPanel>
        )
      })}
    </div>
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
    <div className="space-y-3">
      <ProductionProposalContextGroup icon={Sparkles} title="设定资料" items={context.creativeReferences} empty="本提案没有设定资料引用" decisions={decisions} onSetDecision={onSetDecision} />
      <ProductionProposalContextGroup icon={PackageCheck} title="素材需求" items={context.assetSlots} empty="本提案没有素材需求" decisions={decisions} onSetDecision={onSetDecision} />
    </div>
  )
}

export function ProductionProposalDiffActionBadge({ action, compact = false }: { action: ProductionProposalSnapshotAction | undefined; compact?: boolean }) {
  return <ChangeActionBadge action={action} compact={compact} />
}

function ProductionProposalDecisionBadge({ decision }: { decision: ProductionProposalNodeDecision }) {
  return <ReviewDecisionBadge decision={decision} />
}

function ProductionProposalDiffFilterRow({
  items,
  value,
  onChange,
}: {
  items: Array<[string, string]>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto">
      {items.map(([itemValue, label]) => (
        <Button
          key={itemValue}
          type="button"
          size="xs"
          variant={value === itemValue ? 'default' : 'secondary'}
          onClick={() => onChange(itemValue)}
          className="h-6 shrink-0 px-2 type-tiny"
        >
          {label}
        </Button>
      ))}
    </div>
  )
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
    <div className={cn(
      'px-3 py-2',
      changeActionRowClass(item.action),
      decision === 'rejected' && 'opacity-60',
    )}>
      <div className="flex items-start gap-2">
        <Icon size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
        <ProductionProposalDiffActionBadge action={item.action} compact />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate type-caption font-medium text-foreground">{item.title}</p>
            {decision && <ProductionProposalDecisionBadge decision={decision} />}
            {!decision && projectBoundaryBlocked && <span className={cn('rounded px-1.5 py-0.5 type-micro font-medium', semanticToneClass('warning', 'badge'))}>回上游工作台</span>}
          </div>
          {item.detail && <p className="mt-0.5 line-clamp-2 type-tiny leading-4 text-muted-foreground">{item.detail}</p>}
          {(item.before || item.after) && (
            <div className="mt-2 grid gap-1.5 type-tiny leading-4">
              {item.before && <p className={cn('rounded px-2 py-1', semanticToneClass('danger', 'badge'))}>原：{item.before}</p>}
              {item.after && <p className={cn('rounded px-2 py-1', semanticToneClass('success', 'badge'))}>新：{item.after}</p>}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5 pl-12">
        <Button
          size="xs"
          variant={decision === 'accepted' ? 'secondary' : 'outline'}
          className="px-2 type-tiny"
          onClick={() => onSetDecisions(projectBoundaryBlocked ? [] : item.acceptKeys, 'accepted')}
          disabled={projectBoundaryBlocked}
          title={projectBoundaryBlocked ? '设定和素材需求需要先处理对应上游草稿' : undefined}
        >
          {projectBoundaryBlocked ? '回上游工作台' : '接受'}
        </Button>
        <Button size="xs" variant={decision === 'rejected' ? 'secondary' : 'ghost'} className="px-2 type-tiny" onClick={() => onSetDecision(item.key, 'rejected')}>
          拒绝
        </Button>
      </div>
    </div>
  )
}

function ProductionProposalContextGroup({
  icon: Icon,
  title,
  items,
  empty,
  decisions,
  onSetDecision,
}: {
  icon: LucideIcon
  title: string
  items: ProductionProposalContextItem[]
  empty: string
  decisions: ProductionProposalNodeDecisions
  onSetDecision: (key: string, decision: ProductionProposalNodeDecision) => void
}) {
  return (
    <AppPanel
      icon={Icon}
      title={title}
      action={<ReviewStat tone="neutral">{items.length}</ReviewStat>}
      bodyClassName={cn(items.length > 0 && 'p-0 divide-y divide-border/60')}
    >
      {items.length === 0 ? (
        <AppTextEmptyState>{empty}</AppTextEmptyState>
      ) : (
        items.map((item, index) => {
          const decision = decisions[item.nodeKey]
          return (
            <div key={`${item.nodeKey}-${index}`} className={cn('px-3 py-2', decision === 'rejected' && 'opacity-50')}>
              <div className="flex items-start gap-2">
                <ProductionProposalDiffActionBadge action={item.action} compact />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate type-caption font-medium text-foreground">{item.title}</p>
                    {decision && <ProductionProposalDecisionBadge decision={decision} />}
                  </div>
                  <p className="mt-0.5 truncate type-tiny text-muted-foreground">{item.parent}</p>
                  {item.detail && <p className="mt-1 line-clamp-2 type-tiny leading-4 text-muted-foreground">{item.detail}</p>}
                </div>
              </div>
              <div className="mt-2 flex gap-1.5 pl-7">
                <Button
                  size="xs"
                  variant={decision === 'accepted' ? 'secondary' : 'outline'}
                  className="px-2 type-tiny"
                  onClick={() => onSetDecision(item.nodeKey, 'accepted')}
                >
                  接受
                </Button>
                <Button size="xs" variant={decision === 'rejected' ? 'secondary' : 'ghost'} className="px-2 type-tiny" onClick={() => onSetDecision(item.nodeKey, 'rejected')}>
                  拒绝
                </Button>
              </div>
            </div>
          )
        })
      )}
    </AppPanel>
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
