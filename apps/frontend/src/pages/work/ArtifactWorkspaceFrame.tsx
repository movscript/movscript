import type { ReactNode } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@movscript/ui'
import type { EntityKind } from './config'
import { EntitySurfaceHeader } from '@/components/entity/EntitySurface'

interface ArtifactWorkspaceFrameProps {
  kind: EntityKind
  title: string
  subtitle?: string
  isSaving?: boolean
  onSave?: () => void
  children: ReactNode
}

export function ArtifactWorkspaceFrame({
  kind,
  title,
  subtitle,
  isSaving = false,
  onSave,
  children,
}: ArtifactWorkspaceFrameProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <EntitySurfaceHeader
          surface="workbench"
          kind={kind}
          title={title || '未命名产物'}
          description={subtitle}
          actions={onSave ? (
              <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={onSave} disabled={isSaving}>
                <Save size={13} />
                {isSaving ? '保存中' : '保存'}
              </Button>
          ) : null}
        />

        <main className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
        </main>
      </div>
    </div>
  )
}
