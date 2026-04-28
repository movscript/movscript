import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Shot, Storyboard } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { ShotForm } from '@/components/forms/ShotForm'
import type { EntityKind } from '../config'

interface ShotWorkspaceProps {
  shot: Shot
  storyboards?: Storyboard[]
  onOpenTab?: (kind: EntityKind, id: number, label: string) => void
}

export function ShotWorkspace({ shot, storyboards = [], onOpenTab }: ShotWorkspaceProps) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Shot>>({ ...shot })

  const update = useMutation({
    mutationFn: (data: Partial<Shot>) =>
      api.put(`/shots/${shot.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shots-project', projectId] }),
  })

  const storyboard = shot.storyboard_id ? storyboards.find((b) => b.ID === shot.storyboard_id) : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {storyboard && (
        <div className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 border-b border-border bg-muted/20 text-xs text-muted-foreground">
          <span className="text-muted-foreground/50">分镜</span>
          <span className="text-muted-foreground/30">/</span>
          <button
            onClick={() => onOpenTab?.('storyboard', storyboard.ID, storyboard.title || `#${storyboard.order}`)}
            className="hover:text-foreground hover:underline transition-colors"
          >
            #{storyboard.order}{storyboard.title ? ` ${storyboard.title}` : ''}
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ShotForm
          shot={shot}
          draft={draft}
          onChange={setDraft}
          onSave={(data) => update.mutate(data)}
          isSaving={update.isPending}
        />
      </div>
    </div>
  )
}
