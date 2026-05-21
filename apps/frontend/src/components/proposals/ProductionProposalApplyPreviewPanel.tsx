import { cn } from '@/lib/utils'

export type ProductionProposalSnapshotAction = 'create' | 'update' | 'delete'

export interface ProductionProposalApplyPreviewItem {
  key: string
  title: string
  detail: string
  kind: 'segment' | 'scene_moment' | 'content_unit' | 'keyframe' | 'creative_reference' | 'asset_slot'
  action?: ProductionProposalSnapshotAction
  parent?: string
}

export interface ProductionProposalApplyPreview {
  writePlan: ProductionProposalApplyPreviewItem[]
  rejected: ProductionProposalApplyPreviewItem[]
  pending: ProductionProposalApplyPreviewItem[]
  blocked: ProductionProposalApplyPreviewItem[]
}

export function ProductionProposalApplyPreviewPanel({ preview }: { preview: ProductionProposalApplyPreview }) {
  return (
    <div className="space-y-2">
      <ProductionProposalApplyPreviewGroup
        tone="success"
        title="将写入"
        items={preview.writePlan}
        empty="还没有接受任何可写入项"
      />
      <ProductionProposalApplyPreviewGroup
        tone="warning"
        title="依赖未接受"
        items={preview.blocked}
        empty="没有被父级决策阻塞的已接受项"
      />
      <ProductionProposalApplyPreviewGroup
        tone="muted"
        title="未处理"
        items={preview.pending}
        empty="没有未审项"
      />
      <ProductionProposalApplyPreviewGroup
        tone="danger"
        title="已拒绝"
        items={preview.rejected}
        empty="没有拒绝项"
      />
    </div>
  )
}

function ProductionProposalApplyPreviewGroup({
  title,
  items,
  empty,
  tone,
}: {
  title: string
  items: ProductionProposalApplyPreviewItem[]
  empty: string
  tone: 'success' | 'warning' | 'danger' | 'muted'
}) {
  const toneClass = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300'
      : tone === 'danger'
        ? 'border-rose-200 bg-rose-50/60 text-rose-700 dark:border-rose-800/50 dark:text-rose-300'
        : 'border-border bg-background text-muted-foreground'

  return (
    <div className={cn('rounded-lg border p-3', toneClass)}>
      <div className="flex items-center justify-between gap-2">
        <p className="type-label font-semibold">{title}</p>
        <span className="rounded bg-background/60 px-1.5 py-0.5 type-tiny">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 type-caption leading-4 opacity-80">{empty}</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {items.slice(0, 8).map((item) => (
            <div key={item.key} className="rounded bg-background/70 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <ProductionProposalActionBadge action={item.action} compact />
                <span className="min-w-0 flex-1 truncate type-caption font-medium text-foreground">{item.title}</span>
                <span className="shrink-0 type-tiny opacity-70">{productionProposalApplyPreviewKindLabel(item.kind)}</span>
              </div>
              {item.parent && <p className="mt-0.5 truncate type-tiny opacity-70">{item.parent}</p>}
              {item.detail && <p className="mt-1 line-clamp-2 type-tiny leading-4 opacity-80">{item.detail}</p>}
            </div>
          ))}
          {items.length > 8 && <p className="type-tiny opacity-70">还有 {items.length - 8} 项未显示</p>}
        </div>
      )}
    </div>
  )
}

function ProductionProposalActionBadge({ action, compact = false }: { action: ProductionProposalSnapshotAction | undefined; compact?: boolean }) {
  const cls = compact ? 'px-1 py-0 type-micro' : 'px-1.5 py-0.5 type-micro'
  if (action === 'delete') {
    return <span className={cn('shrink-0 rounded font-mono font-medium text-rose-600 dark:text-rose-400', cls)}>-</span>
  }
  if (action === 'update') {
    return <span className={cn('shrink-0 rounded font-mono font-medium text-amber-600 dark:text-amber-400', cls)}>~</span>
  }
  return <span className={cn('shrink-0 rounded font-mono font-medium text-emerald-600 dark:text-emerald-400', cls)}>+</span>
}

function productionProposalApplyPreviewKindLabel(kind: ProductionProposalApplyPreviewItem['kind']) {
  if (kind === 'segment') return '编排段'
  if (kind === 'scene_moment') return '情节'
  if (kind === 'content_unit') return '内容'
  if (kind === 'keyframe') return '画面锚点'
  if (kind === 'creative_reference') return '设定'
  return '素材'
}
