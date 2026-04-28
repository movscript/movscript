import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { ScriptForm } from '@/components/forms/ScriptForm'

const SCRIPT_TYPE_MAP: Record<string, { labelKey: string; color: string }> = {
  main:    { labelKey: 'domain.scriptTypes.main',    color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' },
  episode: { labelKey: 'domain.scriptTypes.episode', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  scene:   { labelKey: 'domain.scriptTypes.scene',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
}

interface Props {
  script: Script
  onClose?: () => void
  onDelete?: () => void
}

export function ScriptDetail({ script, onClose, onDelete }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Script>>({ ...script })
  const [analyzing, setAnalyzing] = useState(false)

  const update = useMutation({
    mutationFn: (data: Partial<Script>) =>
      api.put(`/projects/${projectId}/scripts/${script.ID}`, data).then((r) => r.data),
    onSuccess: (updated: Script) => {
      setDraft((d) => ({ ...d, ...updated }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['settings', projectId] })
      qc.invalidateQueries({ queryKey: ['setting-refs', projectId, script.ID] })
      qc.invalidateQueries({ queryKey: ['setting-relationships', projectId, script.ID] })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/scripts/${script.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      onDelete?.()
    },
  })

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const res = await api.post(`/projects/${projectId}/scripts/${script.ID}/analyze`, {
        content: draft.content ?? script.content,
      })
      const updated: Script = res.data
      setDraft((d) => ({
        ...d,
        summary: updated.summary,
        characters: updated.characters,
        character_profiles: updated.character_profiles,
        character_relationships: updated.character_relationships,
        core_settings: updated.core_settings,
        background: updated.background,
        scenes_desc: updated.scenes_desc,
        hook: updated.hook,
        plot_summary: updated.plot_summary,
        script_points: updated.script_points,
      }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['settings', projectId] })
      qc.invalidateQueries({ queryKey: ['setting-refs', projectId, script.ID] })
      qc.invalidateQueries({ queryKey: ['setting-relationships', projectId, script.ID] })
    } catch {
      // ignore
    } finally {
      setAnalyzing(false)
    }
  }

  const typeCfg = SCRIPT_TYPE_MAP[script.script_type]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0 font-medium', typeCfg?.color)}>
            {typeCfg ? t(typeCfg.labelKey) : script.script_type}
          </span>
          <h2 className="text-sm font-semibold text-foreground truncate">{script.title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onDelete && (
            <button
              onClick={() => remove.mutate()}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              {t('common.delete')}
            </button>
          )}
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>{t('common.close')}</Button>
          )}
        </div>
      </div>

      <ScriptForm
        script={script}
        projectId={projectId}
        draft={draft}
        onChange={setDraft}
        onSave={(data) => update.mutate(data)}
        isSaving={update.isPending}
        analyzing={analyzing}
        onAnalyze={handleAnalyze}
      />
    </div>
  )
}
