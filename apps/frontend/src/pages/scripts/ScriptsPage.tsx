import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { createScriptVersion, listScriptVersions, patchScriptVersion, type ScriptVersion } from '@/api/scriptVersions'
import { createSemanticEntity, semanticEntityConfig } from '@/api/semanticEntities'
import type { Script } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Clapperboard,
  Clock3,
  FileText,
  Layers,
  Lock,
  Plus,
  ScrollText,
} from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { ScriptCreateForm } from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { ScriptForm } from '@/components/forms/ScriptForm'
import { useTranslation } from 'react-i18next'

type ScriptDetailTab = 'edit' | 'versions' | 'production'

// ─── Scripts Section ────────────────────────────────────────────────────────

function ScriptsSection({ projectId }: { projectId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<ScriptDetailTab>('edit')
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState<Partial<Script>>({})

  const { data: rawScripts, isLoading } = useQuery<Script[]>({
    queryKey: ['scripts', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
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
  const versionsForSelected = useMemo(
    () => selected ? scriptVersions.filter((v) => v.script_id === selected.ID) : [],
    [selected, scriptVersions],
  )
  const activeVersion = versionsForSelected.find((v) => v.status === 'active') ?? versionsForSelected[0] ?? null
  const bodyText = selected
    ? (activeVersion?.content || activeVersion?.raw_source || draft.content || draft.raw_source || selected.content || selected.raw_source || '').trim()
    : ''
  const canCreateProduction = versionsForSelected.some((v) => v.status === 'active') && bodyText.length > 0

  useEffect(() => {
    if (selected) setDraft({ ...selected })
  }, [selected?.ID])

  // Reset expanded version when script changes
  useEffect(() => {
    setExpandedVersionId(null)
  }, [selected?.ID])

  const updateScript = useMutation({
    mutationFn: (data: Partial<Script>) =>
      api.put(`/projects/${projectId}/scripts/${selected?.ID}`, data).then((r) => r.data),
    onSuccess: (updated: Script) => {
      setDraft((current) => ({ ...current, ...updated }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      toast.success('已保存')
    },
    onError: () => toast.error('保存失败，请重试'),
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
      toast.success('草稿版本已创建')
      setDetailTab('versions')
    },
    onError: () => toast.error('创建版本失败'),
  })

  const activateVersion = useMutation({
    mutationFn: (versionId: number) => patchScriptVersion(projectId, versionId, { status: 'active' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      toast.success('版本已激活，可用于创建制作')
    },
    onError: () => toast.error('操作失败'),
  })

  const archiveVersion = useMutation({
    mutationFn: (versionId: number) => patchScriptVersion(projectId, versionId, { status: 'archived' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      toast.info('版本已归档')
    },
    onError: () => toast.error('操作失败'),
  })

  const createProduction = useMutation({
    mutationFn: async () => {
      if (!selected || !activeVersion) throw new Error('请先激活一个剧本版本')
      const record = await createSemanticEntity(projectId, semanticEntityConfig('productions'), {
        name: `${selected.title} 制作`,
        description: selected.summary || selected.description || `${selected.title} 的制作`,
        source_type: 'script',
        status: 'planning',
        owner_label: '导演组',
        progress: 0,
        script_version_id: activeVersion.ID,
      })
      return record
    },
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ['production-frame', projectId] })
      navigate(`/production?productionId=${record.ID}&created=1`)
    },
    onError: () => toast.error('创建制作失败'),
  })

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* ── Left sidebar: script list ── */}
      <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-card">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <ScrollText size={14} className="text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">剧本列表</span>
          </div>
          <Button variant="default" size="icon" onClick={() => setShowCreate(true)} className="h-7 w-7">
            <Plus size={14} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">{t('common.loadingShort')}</p>
          ) : scripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
              <FileText size={28} className="opacity-30" />
              <p className="text-xs">{t('pages.scripts.empty')}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground">
                {t('pages.scripts.createOne')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {scriptGroups.map((group) => (
                <div key={group.category}>
                  <div className="mb-1.5 flex items-center justify-between px-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.category}</p>
                    <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{group.scripts.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {group.scripts.map((script) => {
                      const vers = scriptVersions.filter((v) => v.script_id === script.ID)
                      const hasActive = vers.some((v) => v.status === 'active')
                      const isSelected = selected?.ID === script.ID
                      return (
                        <button
                          key={script.ID}
                          type="button"
                          onClick={() => setSelectedId(script.ID)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                            isSelected ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted',
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{script.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {vers.length} 版本 · {hasActive ? '已激活' : vers.length ? '草稿' : '待版本'}
                            </p>
                          </div>
                          {hasActive && <Lock size={11} className="shrink-0 text-emerald-500" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right detail panel ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <ScrollText size={36} className="opacity-20" />
            <p className="text-sm">选择左侧剧本开始编辑</p>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={13} className="mr-1.5" />
              新建剧本
            </Button>
          </div>
        ) : (
          <>
            {/* Script header */}
            <div className="shrink-0 border-b border-border bg-card px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ScriptTypeBadge script={selected} />
                    <ScriptStageBadge versionCount={versionsForSelected.length} hasActive={versionsForSelected.some((v) => v.status === 'active')} />
                    {activeVersion && (
                      <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                        激活版本 v{activeVersion.version_number || activeVersion.ID}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-foreground">{selected.title}</h2>
                  {(selected.summary || selected.description) && (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{selected.summary || selected.description}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <MetricBox icon={ScrollText} label="正文字数" value={`${bodyText.length}`} />
                <MetricBox icon={Layers} label="版本总数" value={`${versionsForSelected.length}`} />
                <MetricBox icon={Lock} label="已激活" value={versionsForSelected.filter((v) => v.status === 'active').length > 0 ? '是' : '否'} />
                <MetricBox icon={BookOpenCheck} label="完整度" value={`${scriptReadiness(selected, versionsForSelected.length, bodyText.length)}%`} />
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex shrink-0 items-center gap-0 border-b border-border bg-card px-4">
              {([
                { key: 'edit', label: '编辑正文' },
                { key: 'versions', label: `版本管理 (${versionsForSelected.length})` },
                { key: 'production', label: '创建制作' },
              ] as { key: ScriptDetailTab; label: string }[]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDetailTab(tab.key)}
                  className={cn(
                    'border-b-2 px-4 py-2.5 text-sm transition-colors',
                    detailTab === tab.key
                      ? 'border-foreground font-medium text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {detailTab === 'edit' && (
                <ScriptForm
                  script={selected}
                  draft={draft}
                  onChange={setDraft}
                  onSave={(data) => updateScript.mutate(data)}
                  isSaving={updateScript.isPending}
                  onCreateVersion={() => createVersion.mutate()}
                  isCreatingVersion={createVersion.isPending}
                />
              )}

              {detailTab === 'versions' && (
                <div className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">版本历史</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">激活版本后可用于创建制作；归档版本保留记录但不参与制作。</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={createVersion.isPending}
                      onClick={() => createVersion.mutate()}
                    >
                      <Plus size={13} />
                      快照当前正文
                    </Button>
                  </div>

                  {versionsForSelected.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-card py-10 text-center">
                      <Layers size={28} className="mx-auto text-muted-foreground/30" />
                      <p className="mt-3 text-sm font-medium text-foreground">暂无版本</p>
                      <p className="mt-1 text-xs text-muted-foreground">保存正文后，点击「快照当前正文」创建第一个版本。</p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => setDetailTab('edit')}>
                        前往编辑正文
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {versionsForSelected.map((version) => {
                        const isExpanded = expandedVersionId === version.ID
                        const isActive = version.status === 'active'
                        const isArchived = version.status === 'archived'
                        const content = (version.content || version.raw_source || '').trim()
                        return (
                          <div
                            key={version.ID}
                            className={cn(
                              'overflow-hidden rounded-lg border transition-colors',
                              isActive ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-border bg-card',
                              isArchived && 'opacity-60',
                            )}
                          >
                            <div className="flex items-center gap-3 px-4 py-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground">
                                    v{version.version_number || version.ID}
                                  </span>
                                  <VersionStatusBadge status={version.status} />
                                  <span className="text-xs text-muted-foreground">{version.title}</span>
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {content.length} 字 · {formatDate(version.UpdatedAt)}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {content && (
                                  <button
                                    onClick={() => setExpandedVersionId(isExpanded ? null : version.ID)}
                                    className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                  >
                                    {isExpanded ? '收起' : '查看'}
                                  </button>
                                )}
                                {!isActive && !isArchived && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1 px-2 text-xs"
                                    disabled={activateVersion.isPending}
                                    onClick={() => activateVersion.mutate(version.ID)}
                                  >
                                    <Lock size={11} />
                                    激活
                                  </Button>
                                )}
                                {isActive && (
                                  <button
                                    className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                                    onClick={() => archiveVersion.mutate(version.ID)}
                                  >
                                    归档
                                  </button>
                                )}
                                {isArchived && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1 px-2 text-xs"
                                    disabled={activateVersion.isPending}
                                    onClick={() => activateVersion.mutate(version.ID)}
                                  >
                                    重新激活
                                  </Button>
                                )}
                              </div>
                            </div>
                            {isExpanded && content && (
                              <div className="border-t border-border bg-background px-4 py-3">
                                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">{content}</pre>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'production' && (
                <div className="p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-foreground">创建制作项目</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">基于已激活的剧本版本创建制作，制作将锁定版本作为来源。</p>
                  </div>
                  <div className="space-y-2">
                    <ReadinessRow label="剧本分类已设置" done={categoryLabel(selected.script_type) !== '未分类'} />
                    <ReadinessRow label="已有剧本版本" done={versionsForSelected.length > 0} />
                    <ReadinessRow label="有正文内容" done={bodyText.length > 0} />
                    <ReadinessRow label="版本已激活（必须）" done={versionsForSelected.some((v) => v.status === 'active')} />
                  </div>
                  {canCreateProduction ? (
                    <Button
                      className="mt-5 w-full justify-center gap-2"
                      loading={createProduction.isPending}
                      onClick={() => createProduction.mutate()}
                    >
                      <Clapperboard size={15} />
                      创建制作项目
                    </Button>
                  ) : (
                    <div className="mt-5 space-y-2">
                      <Button className="w-full justify-center gap-2" disabled>
                        <Clapperboard size={15} />
                        创建制作项目
                      </Button>
                      {!versionsForSelected.some((v) => v.status === 'active') && versionsForSelected.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5"
                          onClick={() => setDetailTab('versions')}
                        >
                          前往版本管理 → 激活版本
                        </Button>
                      )}
                      {versionsForSelected.length === 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5"
                          onClick={() => setDetailTab('edit')}
                        >
                          前往编辑正文 → 保存并创建版本
                        </Button>
                      )}
                    </div>
                  )}

                  {activeVersion && (
                    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
                      <p className="text-xs font-medium text-foreground">将使用激活版本</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        v{activeVersion.version_number || activeVersion.ID} · {activeVersion.title} · {formatDate(activeVersion.UpdatedAt)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.scripts.createTitle')}>
        <ScriptCreateForm projectId={projectId} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </CreateDialog>
    </div>
  )
}

// ─── Version status badge ─────────────────────────────────────────────────────

function VersionStatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
        <Lock size={10} />
        已激活
      </span>
    )
  }
  if (status === 'archived') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
        已归档
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <Clock3 size={10} />
      草稿
    </span>
  )
}

function ScriptTypeBadge({ script }: { script: Script }) {
  return <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{categoryLabel(script.script_type)}</span>
}

function ScriptStageBadge({ versionCount, hasActive }: { versionCount: number; hasActive: boolean }) {
  const stage = !versionCount ? '无版本' : !hasActive ? '待激活' : '已就绪'
  const config = {
    '无版本': { className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300', icon: AlertTriangle },
    '待激活': { className: 'border-border bg-muted text-muted-foreground', icon: Clock3 },
    '已就绪': { className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300', icon: CheckCircle2 },
  }[stage]
  const Icon = config.icon
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]', config.className)}>
      <Icon size={11} />
      {stage}
    </span>
  )
}

function MetricBox({ label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}

function ReadinessRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5">
      <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs', done ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
        {done ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
        {done ? '就绪' : '待处理'}
      </span>
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

function formatDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ScriptsPage() {
  const projectId = useProjectStore((s) => s.current?.ID)

  if (!projectId) return null

  return <ScriptsSection projectId={projectId} />
}
