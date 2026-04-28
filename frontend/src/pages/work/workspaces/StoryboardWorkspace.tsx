import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Storyboard, Scene, Episode, Shot } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { StoryboardForm } from '@/components/forms/StoryboardForm'
import { cn } from '@/lib/utils'
import type { EntityKind } from '../config'

const SHOT_STATUS_COLOR: Record<string, string> = {
  draft:        'bg-muted text-muted-foreground',
  prompt_ready: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  generating:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400',
  generated:    'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  approved:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
}

interface StoryboardWorkspaceProps {
  storyboard: Storyboard
  scenes?: Scene[]
  episodes?: Episode[]
  shots?: Shot[]
  onOpenTab?: (kind: EntityKind, id: number, label: string) => void
}

export function StoryboardWorkspace({ storyboard, scenes = [], episodes = [], shots = [], onOpenTab }: StoryboardWorkspaceProps) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Storyboard>>({ ...storyboard })

  const update = useMutation({
    mutationFn: (data: Partial<Storyboard>) =>
      api.put(`/storyboards/${storyboard.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] }),
  })

  const scene = storyboard.scene_id ? scenes.find((s) => s.ID === storyboard.scene_id) : null
  const episode = storyboard.episode_id ? episodes.find((e) => e.ID === storyboard.episode_id) : null
  const childShots = shots.filter((s) => s.storyboard_id === storyboard.ID).sort((a, b) => a.order - b.order)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Context panel */}
      <div className="w-44 shrink-0 border-r border-border bg-muted/20 overflow-y-auto p-3 space-y-3">
        {episode && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide mb-1">剧集</p>
            <p className="text-xs text-muted-foreground leading-snug">
              EP{String(episode.number).padStart(2, '0')} {episode.title}
            </p>
          </div>
        )}
        {scene && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide mb-1">场景</p>
            <p className="text-xs text-muted-foreground leading-snug">
              #{scene.number} {scene.title}
            </p>
          </div>
        )}
        {!episode && !scene && (
          <p className="text-[10px] text-muted-foreground/40 italic">未关联场景/剧集</p>
        )}

        {childShots.length > 0 && (
          <>
            <div className="h-px bg-border" />
            <div>
              <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide mb-2">
                镜头 ({childShots.length})
              </p>
              <div className="space-y-0.5">
                {childShots.map((shot) => (
                  <button
                    key={shot.ID}
                    onClick={() => onOpenTab?.('shot', shot.ID, `#${shot.order}`)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-mono text-muted-foreground">#{shot.order}</span>
                      <span className={cn('text-[9px] px-1 py-0.5 rounded-sm font-medium leading-none', SHOT_STATUS_COLOR[shot.status] ?? 'bg-muted text-muted-foreground')}>
                        {shot.status}
                      </span>
                    </div>
                    {shot.description && (
                      <p className="text-[10px] text-muted-foreground/60 leading-snug truncate">
                        {shot.description.slice(0, 20)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Form */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <StoryboardForm
          draft={draft}
          onChange={setDraft}
          onSave={(data) => update.mutate(data)}
          isSaving={update.isPending}
        />
      </div>
    </div>
  )
}
