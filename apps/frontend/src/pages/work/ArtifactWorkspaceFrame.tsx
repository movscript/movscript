import type { ReactNode } from 'react'
import { Save } from 'lucide-react'
import type { PipelineNode } from '@/types'
import { Button } from '@movscript/ui'
import { canReviewPipelineNode, canSubmitPipelineNode } from '@/lib/pipelinePermissions'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import type { EntityKind } from './config'
import { ArtifactReviewRail } from './ArtifactReviewRail'
import type { Pipeline, ProjectMember } from '@/types'
import { EntitySurfaceHeader } from '@/components/entity/EntitySurface'

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
  const canSubmit = node
    ? canSubmitPipelineNode({ node, project, members, currentUserId: currentUser?.ID, pipeline })
    : false
  const canReview = node
    ? canReviewPipelineNode({ node, project, members, currentUserId: currentUser?.ID, pipeline })
    : false

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <EntitySurfaceHeader
          surface="workbench"
          kind={kind}
          title={title || '未命名产物'}
          description={subtitle}
          nodeBadge={node ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              节点 #{node.ID}
            </span>
          ) : null}
          actions={onSave ? (
              <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={onSave} disabled={isSaving}>
                <Save size={13} />
                {isSaving ? '保存中' : '保存'}
              </Button>
          ) : null}
        />

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
