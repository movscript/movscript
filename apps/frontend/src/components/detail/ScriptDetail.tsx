import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { ScriptForm } from '@/components/forms/ScriptForm'
import { DetailHero, HeroMetric, HeroPill } from './DetailHero'

const SCRIPT_TYPE_MAP: Record<string, { labelKey: string; color: string; tone: 'sky' | 'violet' | 'blue' }> = {
  main:    { labelKey: 'domain.scriptTypes.main',    color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400', tone: 'sky' },
  episode: { labelKey: 'domain.scriptTypes.episode', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400', tone: 'violet' },
  scene:   { labelKey: 'domain.scriptTypes.scene',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400', tone: 'blue' },
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
  const bodyLength = (draft.content ?? script.content ?? '').trim().length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DetailHero
        kind="script"
        title={draft.title ?? script.title}
        description={draft.summary || draft.description || script.summary || script.description}
        tone={typeCfg?.tone ?? 'neutral'}
        eyebrow={(
          <>
            <HeroPill className={cn(typeCfg?.color)}>{typeCfg ? t(typeCfg.labelKey) : script.script_type}</HeroPill>
          </>
        )}
        meta={(
          <>
            <HeroMetric label="ID" value={`#${script.ID}`} />
            <HeroMetric label={t('details.scriptBody')} value={bodyLength} />
            {script.version ? <HeroMetric label="Version" value={script.version} /> : null}
          </>
        )}
        onDelete={onDelete ? () => remove.mutate() : undefined}
        onClose={onClose}
        deleteLabel={t('common.delete')}
        closeLabel={t('common.close')}
      />

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
