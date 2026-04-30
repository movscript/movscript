import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script, Setting } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Plus, FileText, Users } from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { ScriptCreateForm } from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { ScriptDetail } from '@/components/detail'
import { BUILT_IN_SETTING_TYPES, DEFAULT_SETTING_STATUS, SettingDetailEditor, SettingStatusBadge, settingTypeLabel } from '@/components/settings/SettingDetailEditor'
import { SettingAssetOverview } from '@/components/settings/SettingAssetOverview'
import { useTranslation } from 'react-i18next'

type ScriptType = 'main' | 'episode' | 'scene'
type PageTab = 'scripts' | 'settings'

const SCRIPT_TYPES: { type: ScriptType; labelKey: string; color: string }[] = [
  { type: 'main',    labelKey: 'domain.scriptTypes.main',    color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' },
  { type: 'episode', labelKey: 'domain.scriptTypes.episode', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  { type: 'scene',   labelKey: 'domain.scriptTypes.scene',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
]

const SCRIPT_TYPE_MAP = Object.fromEntries(SCRIPT_TYPES.map((t) => [t.type, t]))

// ─── Scripts Section ────────────────────────────────────────────────────────

function ScriptsSection({ projectId }: { projectId: number }) {
  const { t } = useTranslation()
  const [filterType, setFilterType] = useState<ScriptType | ''>('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: rawScripts, isLoading } = useQuery<Script[]>({
    queryKey: ['scripts', projectId, filterType],
    queryFn: () =>
      api.get(`/projects/${projectId}/scripts`, { params: filterType ? { type: filterType } : {} })
        .then((r) => r.data),
    enabled: !!projectId,
  })
  const scripts = (rawScripts ?? []).slice().sort((a, b) => {
    if (filterType === 'episode' || (a.script_type === 'episode' && b.script_type === 'episode')) {
      return (a.order ?? 0) - (b.order ?? 0)
    }
    return 0
  })

  const selected = scripts.find((s) => s.ID === selectedId) ?? null
  const detailOpen = selectedId !== null

  const filterTabs = [
    { value: '' as const, label: t('common.all') },
    ...SCRIPT_TYPES.map((type) => ({ value: type.type, label: t(type.labelKey) })),
  ]

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left list panel */}
      <div className={cn(
        'flex flex-col border-r border-border bg-card overflow-hidden transition-all duration-200',
        detailOpen ? 'w-72 shrink-0' : 'flex-1'
      )}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-background shrink-0">
          <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
            {filterTabs.map((t) => (
              <button
                key={t.value}
                onClick={() => { setFilterType(t.value); setSelectedId(null) }}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors',
                  filterType === t.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button variant="default" size="icon" onClick={() => setShowCreate(true)} className="ml-2 shrink-0 h-7 w-7">
            <Plus size={14} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground text-center">{t('common.loadingShort')}</p>
          ) : scripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <FileText size={32} className="opacity-30" />
              <p className="text-sm">{t('pages.scripts.empty')}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground underline-offset-4">{t('pages.scripts.createOne')}</button>
            </div>
          ) : detailOpen ? (
            scripts.map((s) => (
              <button
                key={s.ID}
                onClick={() => setSelectedId(s.ID)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-b border-border hover:bg-background transition-colors',
                  selectedId === s.ID ? 'bg-background border-l-2 border-l-primary' : ''
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs px-1.5 py-0.5 rounded shrink-0 font-medium', SCRIPT_TYPE_MAP[s.script_type]?.color ?? 'bg-muted text-muted-foreground')}>
                    {SCRIPT_TYPE_MAP[s.script_type] ? t(SCRIPT_TYPE_MAP[s.script_type].labelKey) : s.script_type}
                  </span>
                  {s.script_type === 'episode' && (
                    <span className="text-xs text-muted-foreground font-mono shrink-0">#{s.order || '—'}</span>
                  )}
                  <span className="text-sm font-medium truncate flex-1">{s.title}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
              {scripts.map((s) => (
                <button
                  key={s.ID}
                  onClick={() => setSelectedId(s.ID)}
                  className="text-left bg-background border border-border rounded-lg p-4 hover:border-ring hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SCRIPT_TYPE_MAP[s.script_type]?.color ?? 'bg-muted text-muted-foreground')}>
                      {SCRIPT_TYPE_MAP[s.script_type] ? t(SCRIPT_TYPE_MAP[s.script_type].labelKey) : s.script_type}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">{s.title}</h3>
                  {s.summary ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">{s.summary}</p>
                  ) : s.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel — uses shared ScriptDetail */}
      {detailOpen && selected && (
        <div className="flex-1 overflow-hidden">
          <ScriptDetail
            script={selected}
            onClose={() => setSelectedId(null)}
            onDelete={() => setSelectedId(null)}
          />
        </div>
      )}

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.scripts.createTitle')}>
        <ScriptCreateForm projectId={projectId} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </CreateDialog>
    </div>
  )
}

// ─── Settings Section ────────────────────────────────────────────────────────

function SettingsSection({ projectId }: { projectId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [filterType, setFilterType] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('')

  const { data: rawSettings, isLoading } = useQuery<Setting[]>({
    queryKey: ['settings', projectId, filterType],
    queryFn: () =>
      api.get(`/projects/${projectId}/settings`, { params: filterType ? { type: filterType } : {} })
        .then((r) => r.data),
    enabled: !!projectId,
  })
  const settings = rawSettings ?? []

  const create = useMutation({
    mutationFn: (s: Partial<Setting>) => api.post(`/projects/${projectId}/settings`, s).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', projectId] })
      setShowCreate(false)
      setNewName('')
      setNewType('')
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings', projectId] }); setSelectedId(null) },
  })

  const selected = settings.find((s) => s.ID === selectedId) ?? null
  const detailOpen = selectedId !== null

  function selectSetting(s: Setting) { setSelectedId(s.ID) }
  const customTypes = Array.from(new Set(settings.map((setting) => setting.type).filter(Boolean) as string[]))
    .filter((type) => !BUILT_IN_SETTING_TYPES.some((item) => item.value === type))
  const filterTabs = [
    { value: '', label: t('common.all') },
    ...BUILT_IN_SETTING_TYPES.map((type) => ({ value: type.value, label: type.label })),
    ...customTypes.map((type) => ({ value: type, label: type })),
  ]

  return (
    <div className="flex h-full overflow-hidden">
      <div className={cn('flex flex-col border-r border-border bg-card overflow-hidden transition-all duration-200', detailOpen ? 'w-72 shrink-0' : 'flex-1')}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-background shrink-0">
          <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
            {filterTabs.map((t) => (
              <button key={t.value} onClick={() => { setFilterType(t.value); setSelectedId(null) }}
                className={cn('px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors', filterType === t.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}>
                {t.label}
              </button>
            ))}
          </div>
          <Button variant="default" size="icon" onClick={() => setShowCreate(true)} className="ml-2 shrink-0 h-7 w-7"><Plus size={14} /></Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? <p className="p-4 text-xs text-muted-foreground text-center">{t('common.loadingShort')}</p>
            : settings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Users size={32} className="opacity-30" /><p className="text-sm">{t('pages.scripts.settingsEmpty')}</p>
                <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground">{t('pages.scripts.createOne')}</button>
              </div>
            ) : detailOpen ? (
              settings.map((s) => (
                <button key={s.ID} onClick={() => selectSetting(s)}
                  className={cn('w-full text-left px-3 py-2.5 border-b border-border hover:bg-background transition-colors', selectedId === s.ID ? 'bg-background border-l-2 border-l-primary' : '')}>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{settingTypeLabel(s.type)}</span>
                    <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                  </div>
                  {s.status && <div className="mt-1.5"><SettingStatusBadge status={s.status} /></div>}
                </button>
              ))
            ) : (
              <div className="p-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
                {settings.map((s) => (
                  <button key={s.ID} onClick={() => selectSetting(s)} className="text-left bg-background border border-border rounded-lg p-4 hover:border-ring hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{settingTypeLabel(s.type)}</span>
                      {s.status && <SettingStatusBadge status={s.status} />}
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">{s.name}</h3>
                    {s.description && <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>

      {detailOpen && selected && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{settingTypeLabel(selected.type)}</span>
              <h2 className="text-sm font-semibold text-foreground truncate">{selected.name}</h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>{t('common.close')}</Button>
              <button onClick={() => remove.mutate(selected.ID)} className="text-xs text-muted-foreground hover:text-destructive transition-colors">{t('common.delete')}</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <SettingDetailEditor setting={selected} projectId={projectId} />
            <SettingAssetOverview setting={selected} className="mt-6" />
          </div>
        </div>
      )}

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.scripts.settingsCreateTitle')}>
        <div className="space-y-4">
          <div><Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.nameRequired')}</Label>
            <Input autoFocus placeholder={t('pages.scripts.settingName')} value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newName.trim() && create.mutate({ name: newName.trim(), type: newType.trim(), status: DEFAULT_SETTING_STATUS })} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">类型（可选）</Label>
            <div className="flex flex-wrap gap-2">
              {BUILT_IN_SETTING_TYPES.map((type) => (
                <button key={type.value} onClick={() => setNewType(type.value)}
                  className={cn('px-3 py-1.5 text-xs rounded-md border transition-colors', newType === type.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-ring')}>
                  {type.label}
                </button>
              ))}
              <Input className="h-8 w-44 text-xs" value={newType} onChange={(event) => setNewType(event.target.value)} placeholder="自定义类型" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => create.mutate({ name: newName.trim(), type: newType.trim(), status: DEFAULT_SETTING_STATUS })} disabled={!newName.trim() || create.isPending} className="flex-1">
              {create.isPending ? t('common.creating') : t('pages.scripts.createSetting')}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      </CreateDialog>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ScriptsPage({ initialTab = 'scripts' }: { initialTab?: PageTab }) {
  const projectId = useProjectStore((s) => s.current?.ID)

  if (!projectId) return null

  return initialTab === 'settings'
    ? <SettingsSection projectId={projectId} />
    : <ScriptsSection projectId={projectId} />
}
