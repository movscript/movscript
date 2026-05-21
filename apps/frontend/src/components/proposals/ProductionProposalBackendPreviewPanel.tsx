import { AlertCircle } from 'lucide-react'

import type {
  ProductionProposalPreviewSemanticChange,
  ProductionProposalPreviewWarning,
} from '@/api/semanticEntities'
import { ProductionProposalDiffActionBadge } from '@/components/proposals/ProductionProposalSemanticDiffPanel'

export interface ProductionProposalBackendPreviewIssue {
  message: string
  detail?: string
  code?: string
}

export function ProductionProposalBackendPreviewIssuePanel({ issue }: { issue: ProductionProposalBackendPreviewIssue }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300">
      <div className="flex items-start gap-2">
        <AlertCircle size={13} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="type-label font-semibold">后端预览未通过</p>
            {issue.code && <span className="rounded bg-background/70 px-1.5 py-0.5 type-tiny">{issue.code}</span>}
          </div>
          <p className="mt-1 type-caption leading-4">{issue.message}</p>
          {issue.detail && <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-background/70 p-2 type-tiny leading-4">{issue.detail}</pre>}
          <p className="mt-2 type-tiny leading-4 opacity-80">请回到变更队列调整接受/拒绝决策，或重新生成缺少 ID 的复用/更新节点后再预览。</p>
        </div>
      </div>
    </div>
  )
}

export function ProductionProposalBackendPreviewSemanticSummary({
  changes,
  warnings,
}: {
  changes: ProductionProposalPreviewSemanticChange[]
  warnings: ProductionProposalPreviewWarning[]
}) {
  if (changes.length === 0 && warnings.length === 0) return null
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-2">
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-center gap-1.5">
            <AlertCircle size={12} className="shrink-0" />
            <p className="type-caption font-semibold">后端提示</p>
            <span className="ml-auto rounded bg-background/60 px-1.5 py-0.5 type-tiny">{warnings.length}</span>
          </div>
          <div className="mt-1.5 space-y-1">
            {warnings.slice(0, 3).map((warning, index) => (
              <p key={`${warning.code}-${index}`} className="type-tiny leading-4">
                <span className="font-medium">{warning.code}</span>
                <span className="opacity-80"> · {warning.message}</span>
              </p>
            ))}
            {warnings.length > 3 && <p className="type-tiny opacity-70">还有 {warnings.length - 3} 条提示未显示</p>}
          </div>
        </div>
      )}
      {changes.length > 0 && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="type-caption font-semibold text-foreground">后端 Diff</p>
            <span className="rounded bg-background px-1.5 py-0.5 type-tiny text-muted-foreground">{changes.length}</span>
          </div>
          <div className="mt-1.5 space-y-1">
            {changes.slice(0, 6).map((change, index) => (
              <div key={`${change.kind}-${change.client_id ?? change.id ?? index}`} className="flex items-center gap-1.5 rounded bg-background/70 px-2 py-1">
                <ProductionProposalDiffActionBadge action={change.action} compact />
                <span className="min-w-0 flex-1 truncate type-tiny font-medium text-foreground">{change.title}</span>
                <span className="shrink-0 type-tiny text-muted-foreground">{productionProposalChangeKindLabel(change.kind)}</span>
              </div>
            ))}
            {changes.length > 6 && <p className="type-tiny text-muted-foreground">还有 {changes.length - 6} 项未显示</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function productionProposalChangeKindLabel(kind: string) {
  if (kind === 'segment') return '编排段'
  if (kind === 'scene_moment') return '情节'
  if (kind === 'content_unit') return '内容'
  if (kind === 'keyframe') return '画面锚点'
  if (kind === 'creative_reference') return '设定'
  if (kind === 'asset_slot') return '素材'
  return kind
}
