import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import type { Script } from '@/types'
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  projectId: number | undefined
}

// ScriptPanel shows the main script(s) as a collapsible side panel.
// Intended to be embedded in work pages so collaborators always have context.
export function ScriptPanel({ projectId }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: ['scripts-main', projectId],
    queryFn: () =>
      api.get(`/projects/${projectId}/scripts`).then((r) =>
        (r.data as Script[]).filter((s) => s.script_type === 'main')
      ),
    enabled: !!projectId && open,
  })

  const selected = scripts.find((s) => s.ID === selectedId) ?? scripts[0] ?? null

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-foreground text-background px-1.5 py-3 rounded-l-lg flex flex-col items-center gap-1 hover:bg-muted hover:text-foreground transition-colors"
        title={t('shared.scriptPanel.expandMainScript')}
      >
        <BookOpen size={14} />
        <ChevronLeft size={12} />
      </button>
    )
  }

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-background border-l border-border shadow-xl z-40 flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/50">
        <BookOpen size={15} className="text-muted-foreground shrink-0" />
        <span className="type-body font-semibold flex-1">{t('domain.scriptTypes.mainAlt')}</span>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <ChevronRight size={16} />
        </button>
      </div>

      {scripts.length > 1 && (
        <div className="px-3 py-2 border-b">
          <select
            className="w-full border rounded px-2 py-1.5 type-label"
            value={selected?.ID ?? ''}
            onChange={(e) => setSelectedId(Number(e.target.value))}
          >
            {scripts.map((s) => (
              <option key={s.ID} value={s.ID}>{s.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!selected ? (
          <p className="type-label text-muted-foreground">{t('shared.scriptPanel.noMainScript')}</p>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="type-body font-semibold text-foreground">{selected.title}</p>
              {selected.description && (
                <p className="type-label text-muted-foreground mt-1">{selected.description}</p>
              )}
            </div>
            {selected.content ? (
              <pre className="type-label text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {selected.content}
              </pre>
            ) : (
              <p className="type-label text-muted-foreground italic">{t('shared.scriptPanel.emptyContent')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
