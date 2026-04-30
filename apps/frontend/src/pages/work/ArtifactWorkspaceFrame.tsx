import type { ReactNode } from 'react'
import { Save } from 'lucide-react'
import type { PipelineNode } from '@/types'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { canReviewPipelineNode, canSubmitPipelineNode } from '@/lib/pipelinePermissions'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import type { EntityKind } from './config'
import { KIND_CONFIG } from './config'
import { ArtifactReviewRail } from './ArtifactReviewRail'
import type { Pipeline, ProjectMember } from '@/types'

interface ArtifactWorkspaceFrameProps {
  kind: EntityKind
  title: string
  subtitle?: string
  node?: PipelineNode
  pipeline?: Pipeline
  members?: ProjectMember[]
  isSaving?: boolean
  onSave?: () => void
  onNodeUpdated?: (node: PipelineNode) => void
  children: ReactNode
}

export function ArtifactWorkspaceFrame({
  kind,
  title,
  subtitle,
  node,
  pipeline,
  members = [],
  isSaving = false,
  onSave,
  onNodeUpdated,
  children,
}: ArtifactWorkspaceFrameProps) {
  const project = useProjectStore((s) => s.current)
  const currentUser = useUserStore((s) => s.currentUser)
  const cfg = KIND_CONFIG[kind]
  const Icon = cfg.icon
  const canSubmit = node
    ? canSubmitPipelineNode({ node, project, members, currentUserId: currentUser?.ID, pipeline })
    : false
  const canReview = node
    ? canReviewPipelineNode({ node, project, members, currentUserId: currentUser?.ID, pipeline })
    : false

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', cfg.accentSoft)}>
              <Icon size={16} className={cfg.activeColor} />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-semibold text-foreground">{title || '未命名产物'}</h1>
                {node && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    节点 #{node.ID}
                  </span>
                )}
              </div>
              {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {isSaving ? '保存中' : '创作页'}
            </span>
            {onSave && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onSave} disabled={isSaving}>
                <Save size={13} />
                {isSaving ? '保存中' : '保存'}
              </Button>
            )}
          </div>
        </header>

        <ArtifactReviewRail
          node={node}
          canSubmit={canSubmit}
          canReview={canReview}
          onNodeUpdated={onNodeUpdated}
        />

        <main className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
        </main>
      </div>
    </div>
  )
}
