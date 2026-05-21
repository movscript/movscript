import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script } from '@/types'
import { createScriptVersion, listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { ScriptForm } from '@/components/forms/ScriptForm'
import { DetailHero, HeroMetric, HeroPill } from './DetailHero'
import { Plus } from 'lucide-react'

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
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)

  const { data: versions = [], isLoading: versionsLoading } = useQuery<ScriptVersion[]>({
    queryKey: ['semantic-script-versions', projectId, script.ID],
    queryFn: () => listScriptVersions(projectId!, { scriptId: script.ID }),
    enabled: !!projectId,
  })
  const selectedVersion = versions.find((version) => version.ID === selectedVersionId) ?? versions[0] ?? null

  const update = useMutation({
    mutationFn: (data: Partial<Script>) =>
      api.put(`/projects/${projectId}/scripts/${script.ID}`, data).then((r) => r.data),
    onSuccess: (updated: Script) => {
      setDraft((d) => ({ ...d, ...updated }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId, script.ID] })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/scripts/${script.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      onDelete?.()
    },
  })

  const createVersion = useMutation({
    mutationFn: () => createScriptVersion(projectId!, {
      script_id: script.ID,
      parent_version_id: selectedVersion?.ID ?? null,
      title: draft.title ?? script.title,
      source_type: script.source_type ?? 'raw',
      content: draft.content ?? script.content ?? draft.raw_source ?? script.raw_source ?? '',
      raw_source: draft.raw_source ?? script.raw_source ?? draft.content ?? script.content ?? '',
      summary: draft.summary ?? script.summary ?? '',
      status: 'active',
    }),
    onSuccess: (version) => {
      setSelectedVersionId(version.ID)
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId, script.ID] })
    },
  })

  const typeCfg = SCRIPT_TYPE_MAP[script.script_type]
  const bodyLength = (draft.raw_source ?? script.raw_source ?? draft.content ?? script.content ?? '').trim().length

  return (
    <div className="flex h-full flex-col overflow-hidden">
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ScriptVersionViewer
          versions={versions}
          selectedVersion={selectedVersion}
          selectedVersionId={selectedVersionId}
          isLoading={versionsLoading}
          isCreating={createVersion.isPending}
          onSelect={setSelectedVersionId}
          onCreate={() => createVersion.mutate()}
        />

        <ScriptForm
          script={script}
          draft={draft}
          onChange={setDraft}
          onSave={(data) => update.mutate(data)}
          isSaving={update.isPending}
        />
      </div>
    </div>
  )
}

function ScriptVersionViewer({
  versions,
  selectedVersion,
  selectedVersionId,
  isLoading,
  isCreating,
  onSelect,
  onCreate,
}: {
  versions: ScriptVersion[]
  selectedVersion: ScriptVersion | null
  selectedVersionId: number | null
  isLoading: boolean
  isCreating: boolean
  onSelect: (id: number) => void
  onCreate: () => void
}) {
  const selectedText = selectedVersion ? scriptVersionText(selectedVersion) : ''

  return (
    <section className="border-b border-border bg-background">
      <div className="grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="type-label font-semibold text-foreground">版本</p>
            <button
              type="button"
              onClick={onCreate}
              disabled={isCreating}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 type-caption text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Plus size={12} />
              {isCreating ? '新增中' : '新增快照'}
            </button>
          </div>
          <div className="space-y-2 p-3">
            {isLoading ? (
              <p className="rounded-md border border-dashed border-border px-3 py-3 type-label text-muted-foreground">正在读取版本</p>
            ) : versions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-3 type-label text-muted-foreground">暂无剧本版本</p>
            ) : versions.map((version) => (
              <button
                key={version.ID}
                type="button"
                onClick={() => onSelect(version.ID)}
                className={cn(
                  'w-full rounded-md border px-3 py-2 text-left transition-colors',
                  (selectedVersionId ?? versions[0]?.ID) === version.ID
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background hover:border-primary/50',
                )}
              >
                <span className="block truncate type-body font-medium text-foreground">{version.title || `剧本版本 ${version.version_number}`}</span>
                <span className="mt-1 block type-label text-muted-foreground">
                  v{version.version_number || version.ID} · {formatScriptVersionStatus(version.status)} · {formatDate(version.UpdatedAt)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <p className="min-w-0 truncate type-label font-semibold text-foreground">
              {selectedVersion ? `${selectedVersion.title || '未命名版本'} · v${selectedVersion.version_number || selectedVersion.ID}` : '版本正文'}
            </p>
            {selectedVersion ? (
              <span className="shrink-0 type-label text-muted-foreground">{formatScriptVersionStatus(selectedVersion.status)}</span>
            ) : null}
          </div>
          <div className="p-3">
            <textarea
              readOnly
              className="min-h-[260px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono type-body leading-relaxed text-foreground outline-none"
              value={selectedText}
              placeholder="选择版本后查看正文"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function scriptVersionText(version: ScriptVersion) {
  return (version.content || version.raw_source || version.summary || '').trim()
}

function formatScriptVersionStatus(status: string) {
  if (status === 'active') return '已锁定'
  if (status === 'archived') return '已归档'
  return '草稿'
}

function formatDate(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
