import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { createScriptVersion, listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import type { AssetSlot, Script, Setting } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clapperboard,
  Clock3,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Layers,
  Plus,
  ScrollText,
  Users,
} from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { ScriptCreateForm } from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { ScriptForm } from '@/components/forms/ScriptForm'
import { BUILT_IN_SETTING_TYPES, DEFAULT_SETTING_STATUS, SettingDetailEditor, SettingStatusBadge, settingTypeLabel } from '@/components/settings/SettingDetailEditor'
import { SettingAssetOverview } from '@/components/settings/SettingAssetOverview'
import { useTranslation } from 'react-i18next'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'

type PageTab = 'scripts' | 'settings'

interface SettingPreview {
  key: string
  src: string
  isVideo: boolean
}

type SettingAssetSlot = SemanticEntityRecord & AssetSlot

function slotPreviewCandidates(slot: SettingAssetSlot): SettingPreview[] {
  const resource = slot.resource
  if (!resource?.url) return []
  const src = resource.url.startsWith('http') ? resource.url : resource.url
  return [{ key: `slot:${slot.ID}:${resource.ID}`, src, isVideo: resource.type === 'video' || !!resource.mime_type?.startsWith('video/') }]
}

function settingAssetPreviews(settingId: number, slots: SettingAssetSlot[], limit = 4): SettingPreview[] {
  const previews: SettingPreview[] = []
  const seen = new Set<string>()
  for (const slot of slots) {
    if (slot.creative_reference_id !== settingId && !(slot.owner_type === 'setting' && slot.owner_id === settingId)) continue
    for (const preview of slotPreviewCandidates(slot)) {
      if (seen.has(preview.src)) continue
      seen.add(preview.src)
      previews.push(preview)
      if (previews.length >= limit) return previews
    }
  }
  return previews
}

// ─── Scripts Section ────────────────────────────────────────────────────────

function ScriptsSection({ projectId }: { projectId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState<Partial<Script>>({})

  const { data: rawScripts, isLoading } = useQuery<Script[]>({
    queryKey: ['scripts', projectId],
    queryFn: () =>
      api.get(`/projects/${projectId}/scripts`)
        .then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: scriptVersions = [] } = useQuery<ScriptVersion[]>({
    queryKey: ['semantic-script-versions', projectId],
    queryFn: () => listScriptVersions(projectId),
    enabled: !!projectId,
  })

  const scripts = rawScripts ?? []
  const sortedScripts = useMemo(
    () => scripts.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.ID - b.ID),
    [scripts],
  )
  const scriptGroups = useMemo(() => groupScriptsByCategory(sortedScripts), [sortedScripts])
  const selected = scripts.find((s) => s.ID === selectedId) ?? sortedScripts[0] ?? null
  const versionsForSelected = selected ? scriptVersions.filter((version) => version.script_id === selected.ID) : []
  const activeVersion = versionsForSelected.find((version) => version.status === 'active') ?? versionsForSelected[0] ?? null
  const bodyText = selected ? (activeVersion?.content || activeVersion?.raw_source || draft.content || draft.raw_source || selected.content || selected.raw_source || '').trim() : ''
  const readiness = selected ? scriptReadiness(selected, versionsForSelected.length, bodyText.length) : 0
  const canCreateProduction = versionsForSelected.length > 0 && bodyText.length > 0

  useEffect(() => {
    if (selected) setDraft({ ...selected })
  }, [selected?.ID])

  const updateScript = useMutation({
    mutationFn: (data: Partial<Script>) =>
      api.put(`/projects/${projectId}/scripts/${selected?.ID}`, data).then((r) => r.data),
    onSuccess: (updated: Script) => {
      setDraft((current) => ({ ...current, ...updated }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
    },
  })

  const createVersion = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('请选择剧本')
      return createScriptVersion(projectId, {
        script_id: selected.ID,
        parent_version_id: activeVersion?.ID ?? null,
        title: draft.title ?? selected.title,
        source_type: selected.source_type ?? 'raw',
        content: draft.content ?? selected.content ?? draft.raw_source ?? selected.raw_source ?? '',
        raw_source: draft.raw_source ?? selected.raw_source ?? draft.content ?? selected.content ?? '',
        summary: draft.summary ?? selected.summary ?? '',
        status: 'draft',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
    },
  })

  const scriptStats = {
    total: scripts.length,
    withVersion: scripts.filter((script) => scriptVersions.some((version) => version.script_id === script.ID)).length,
    withBody: scripts.filter((script) => {
      const versions = scriptVersions.filter((version) => version.script_id === script.ID)
      return Boolean((versions[0]?.content || versions[0]?.raw_source || script.content || script.raw_source || '').trim())
    }).length,
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="border-b border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ScrollText size={14} />
              <span>{t('header.titles.scripts')}</span>
              <ArrowRight size={13} />
              <span>剧本 / 分类 / 版本</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">剧本工作台</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              管理剧本文档、自由分类和版本证据；分类由用户自己打标签，不限制固定选项。
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <GitBranch size={16} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">剧本列表</h2>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">先选择剧本，再在下方维护正文、版本和制作创建状态。</p>
             </div>
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setShowCreate(true)}>
                <Plus size={13} />
                新建
              </Button>
            </div>
            <div className="p-3">
              {isLoading ? (
                <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">{t('common.loadingShort')}</p>
              ) : scripts.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-6 text-center">
                  <FileText size={28} className="mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm font-medium text-foreground">{t('pages.scripts.empty')}</p>
                  <button onClick={() => setShowCreate(true)} className="mt-1 text-xs text-muted-foreground hover:text-foreground">{t('pages.scripts.createOne')}</button>
                </div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-3">
                  {scriptGroups.map((group) => (
                    <ScriptTreeGroup
                      key={group.category}
                      title={group.category}
                      emptyText="暂无剧本"
                      scripts={group.scripts}
                      selectedId={selected?.ID ?? null}
                      versions={scriptVersions}
                      onSelect={setSelectedId}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <main className="min-w-0">
          {isLoading ? (
            <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">{t('common.loadingShort')}</p>
          ) : selected ? (
            <div className="space-y-4">
              <section className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ScriptTypeBadge script={selected} />
                      <ScriptStageBadge script={selected} versionCount={versionsForSelected.length} bodyLength={bodyText.length} />
                      {activeVersion ? <span className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">当前 v{activeVersion.version_number || activeVersion.ID}</span> : null}
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-foreground">{selected.title}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {selected.summary || selected.description || '维护这一份剧本的正文、分类、版本和结构化证据。'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <MetricBox icon={ScrollText} label="正文证据" value={`${bodyText.length} 字`} />
                  <MetricBox icon={Layers} label="版本" value={`${versionsForSelected.length} 个`} />
                  <MetricBox icon={BookOpenCheck} label="结构完整度" value={`${readiness}%`} />
                  <MetricBox icon={Clock3} label="更新时间" value={formatDate(selected.UpdatedAt)} />
                </div>
              </section>

              <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">版本与正文</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">制作项目应该基于明确的剧本版本；预演和推演都挂在制作下面。</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">{activeVersion ? formatScriptVersionStatus(activeVersion.status) : '暂无版本'}</span>
                      <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={createVersion.isPending || !selected} onClick={() => createVersion.mutate()}>
                        <Plus size={13} />
                        新增版本
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-4 p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                    <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                      {versionsForSelected.length === 0 ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs leading-5 text-muted-foreground">暂无剧本版本。编辑正文后可创建版本。</p>
                      ) : versionsForSelected.map((version) => (
                        <div key={version.ID} className="rounded-md border border-border bg-background px-3 py-2">
                          <p className="truncate text-sm font-medium text-foreground">{version.title || `剧本版本 ${version.version_number}`}</p>
                          <p className="mt-1 text-xs text-muted-foreground">v{version.version_number || version.ID} · {formatScriptVersionStatus(version.status)} · {formatDate(version.UpdatedAt)}</p>
                        </div>
                      ))}
                    </div>
                    <textarea
                      readOnly
                      className="min-h-[300px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-sm leading-6 text-foreground outline-none"
                      value={bodyText}
                      placeholder="暂无正文。请在下方编辑区维护并保存剧本正文。"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 2xl:block 2xl:space-y-4">
                  <section className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <GitBranch size={16} className="text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">制作创建</h3>
                    </div>
                    <div className="mt-4 space-y-2">
                      <ReadinessRow label="分类标签" done={categoryLabel(selected.script_type) !== '未分类'} />
                      <ReadinessRow label="剧本版本" done={versionsForSelected.length > 0} />
                      <ReadinessRow label="正文证据" done={bodyText.length > 0} />
                      <ReadinessRow label="可创建制作" done={canCreateProduction} />
                    </div>
                    {canCreateProduction ? (
                      <Button className="mt-4 w-full justify-center gap-2" asChild>
                        <Link to={`/production?scriptId=${selected.ID}`}>
                          <Clapperboard size={15} />
                          创建制作项目
                        </Link>
                      </Button>
                    ) : (
                      <Button className="mt-4 w-full justify-center gap-2" disabled>
                        <Clapperboard size={15} />
                        创建制作项目
                      </Button>
                    )}
                  </section>

                  <section className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Layers size={16} className="text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">剧本概览</h3>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <SmallStat label="剧本" value={scriptStats.total} />
                      <SmallStat label="有版本" value={scriptStats.withVersion} />
                      <SmallStat label="有正文" value={scriptStats.withBody} />
                    </div>
                  </section>
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">编辑当前剧本</h3>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">保存正文后，再创建版本用于制作、预演和生产追溯。</p>
                  </div>
                </div>
                <ScriptForm
                  script={selected}
                  draft={draft}
                  onChange={setDraft}
                  onSave={(data) => updateScript.mutate(data)}
                  isSaving={updateScript.isPending}
                />
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-card">
              <div className="text-center">
                <FileText size={34} className="mx-auto text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">{t('pages.scripts.empty')}</p>
                <Button className="mt-3 gap-2" onClick={() => setShowCreate(true)}>
                  <Plus size={15} />
                  新建剧本
                </Button>
              </div>
            </div>
          )}
        </main>
        </div>
      </div>

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.scripts.createTitle')}>
        <ScriptCreateForm projectId={projectId} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </CreateDialog>
    </div>
  )
}

function ScriptTreeGroup({
  title,
  emptyText,
  scripts,
  selectedId,
  versions,
  onSelect,
}: {
  title: string
  emptyText: string
  scripts: Script[]
  selectedId: number | null
  versions: ScriptVersion[]
  onSelect: (id: number) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{scripts.length}</span>
      </div>
      {scripts.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {scripts.map((script) => {
            const scriptVersions = versions.filter((version) => version.script_id === script.ID)
            const hasBody = Boolean((scriptVersions[0]?.content || scriptVersions[0]?.raw_source || script.content || script.raw_source || '').trim())
            return (
              <button
                key={script.ID}
                type="button"
                onClick={() => onSelect(script.ID)}
                className={cn(
                  'w-full rounded-md border px-3 py-2 text-left transition-colors',
                  selectedId === script.ID ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">
                    {script.title}
                  </span>
                  <ScriptStageBadge script={script} versionCount={scriptVersions.length} bodyLength={hasBody ? 1 : 0} />
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{scriptVersions.length} 个版本 · {hasBody ? '有正文' : '待补正文'}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ScriptTypeBadge({ script }: { script: Script }) {
  return <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{categoryLabel(script.script_type)}</span>
}

function ScriptStageBadge({ script, versionCount, bodyLength }: { script: Script; versionCount: number; bodyLength: number }) {
  const stage = !bodyLength ? '待正文' : versionCount === 0 ? '待版本' : '可预演'
  const config = {
    '待正文': { className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300', icon: AlertTriangle },
    '待版本': { className: 'border-border bg-muted text-muted-foreground', icon: Clock3 },
    '可预演': { className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300', icon: CheckCircle2 },
    '可用': { className: 'border-border bg-background text-muted-foreground', icon: CheckCircle2 },
  }[stage]
  const Icon = config.icon

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]', config.className)}>
      <Icon size={11} />
      {stage}
    </span>
  )
}

function MetricBox({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 truncate text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

function ReadinessRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
      <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
      <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs', done ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
        {done ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
        {done ? '就绪' : '待处理'}
      </span>
    </div>
  )
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-3">
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function groupScriptsByCategory(scripts: Script[]) {
  const groups = new Map<string, Script[]>()
  for (const script of scripts) {
    const category = categoryLabel(script.script_type)
    const items = groups.get(category) ?? []
    items.push(script)
    groups.set(category, items)
  }
  return Array.from(groups.entries()).map(([category, items]) => ({ category, scripts: items }))
}

function categoryLabel(value?: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === 'uncategorized' || normalized === 'main') return '未分类'
  return normalized
}

function scriptReadiness(script: Script, versionCount: number, bodyLength: number) {
  let score = 0
  if (script.title.trim()) score += 20
  if (bodyLength > 0) score += 35
  if (versionCount > 0) score += 25
  if (script.summary || script.description || script.plot_summary) score += 20
  return Math.min(100, score)
}

function formatScriptVersionStatus(status: string) {
  if (status === 'active') return '当前正式版'
  if (status === 'archived') return '已归档'
  return '草稿'
}

function formatDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
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
  const assetSlotConfig = semanticEntityConfig('assetSlots')

  const { data: rawSettings, isLoading } = useQuery<Setting[]>({
    queryKey: ['settings', projectId, filterType],
    queryFn: () =>
      api.get(`/projects/${projectId}/settings`, { params: filterType ? { type: filterType } : {} })
        .then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: settingAssets = [] } = useQuery<SettingAssetSlot[]>({
    queryKey: ['asset-slots', projectId, 'settings-preview'],
    queryFn: () => listSemanticEntities(projectId, assetSlotConfig) as Promise<SettingAssetSlot[]>,
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
                  className={cn('flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-background', selectedId === s.ID ? 'bg-background border-l-2 border-l-primary' : '')}>
                  <SettingPreviewThumb previews={settingAssetPreviews(s.ID, settingAssets, 4)} title={s.name} compact />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{settingTypeLabel(s.type)}</span>
                      <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                    </div>
                    {s.status && <div className="mt-1.5"><SettingStatusBadge status={s.status} /></div>}
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
                {settings.map((s) => (
                  <button key={s.ID} onClick={() => selectSetting(s)} className="overflow-hidden rounded-lg border border-border bg-background text-left transition-all hover:border-ring hover:shadow-sm">
                    <SettingPreviewThumb previews={settingAssetPreviews(s.ID, settingAssets, 4)} title={s.name} />
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{settingTypeLabel(s.type)}</span>
                        {s.status && <SettingStatusBadge status={s.status} />}
                      </div>
                      <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">{s.name}</h3>
                      {s.description && <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                    </div>
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

function SettingPreviewThumb({
  previews,
  title,
  compact = false,
}: {
  previews: SettingPreview[]
  title: string
  compact?: boolean
}) {
  return (
    <div className={cn(
      'grid shrink-0 overflow-hidden bg-muted text-muted-foreground',
      compact ? 'h-10 w-10 rounded-md' : 'aspect-[4/3] w-full',
      previews.length <= 1 ? 'grid-cols-1' : 'grid-cols-2',
      previews.length > 2 && 'grid-rows-2',
    )}>
      {previews.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon size={compact ? 15 : 22} />
        </div>
      ) : previews.map((preview) => (
        <div key={preview.key} className="min-h-0 min-w-0 overflow-hidden">
          {preview.isVideo ? (
            <AuthedVideo src={preview.src} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <AuthedImage src={preview.src} alt={title} className="h-full w-full object-cover" />
          )}
        </div>
      ))}
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
