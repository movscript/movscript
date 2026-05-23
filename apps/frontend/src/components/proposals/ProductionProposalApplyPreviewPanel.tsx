import { ChangeActionBadge, ReviewCallout, ReviewStat, type ChangeAction, type ReviewTone } from '@movscript/ui'

export type ProductionProposalSnapshotAction = ChangeAction

export interface ProductionProposalApplyPreviewItem {
  key: string
  title: string
  detail: string
  kind: 'segment' | 'scene_moment' | 'content_unit' | 'keyframe' | 'creative_reference' | 'asset_slot' | 'writing_expression'
  action?: ProductionProposalSnapshotAction
  parent?: string
}

export interface ProductionProposalApplyPreview {
  writeTaskGraph: ProductionProposalApplyPreviewItem[]
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
        items={preview.writeTaskGraph}
        empty="还没有接受任何可写入项"
      />
      <ProductionProposalApplyPreviewGroup
        tone="warning"
        title="依赖未接受"
        items={preview.blocked}
        empty="没有被父级决策阻塞的已接受项"
      />
      <ProductionProposalApplyPreviewGroup
        tone="neutral"
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
  tone: ReviewTone
}) {
  return (
    <ReviewCallout tone={tone}>
      <div className="flex items-center justify-between gap-2">
        <p className="type-label font-semibold">{title}</p>
        <ReviewStat tone="neutral" className="bg-background/60">{items.length}</ReviewStat>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 type-caption leading-4 opacity-80">{empty}</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {items.slice(0, 8).map((item) => (
            <div key={item.key} className="rounded bg-background/70 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <ChangeActionBadge action={item.action} compact />
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
    </ReviewCallout>
  )
}

function productionProposalApplyPreviewKindLabel(kind: ProductionProposalApplyPreviewItem['kind']) {
  if (kind === 'segment') return '编排段'
  if (kind === 'scene_moment') return '情节'
  if (kind === 'writing_expression') return '表达'
  if (kind === 'content_unit') return '内容'
  if (kind === 'keyframe') return '画面锚点'
  if (kind === 'creative_reference') return '设定'
  return '素材'
}
