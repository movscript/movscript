import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createScriptVersion, listScriptVersions, type ScriptVersion } from '@/shared/infrastructure/api/scriptVersions'
import type { Script } from '@/types'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import {
  hasExplicitWorkbenchSearchParam,
  useWorkbenchSessionStore,
} from '@/features/project-workbenches/application/workbenchSessionStore'
import {
  Check,
  FileText,
  GitBranch,
  PanelRightClose,
  Pencil,
  Plus,
  ScrollText,
  X,
} from 'lucide-react'
import { ScriptCreateForm } from '@/shared/ui/EntityCreateForms'
import {
  Badge,
  Button,
  ScriptEditorFieldLabel,
  ScriptEditorInput,
  ScriptCreateDialog,
  ScriptDetailHeader,
  ScriptDetailTabs,
  ScriptLibraryEmptyState,
  ScriptLibraryGroup,
  ScriptLibraryItem,
  ScriptLibraryRail,
  ScriptVersionCard,
  ScriptVersionEmptyState,
  ScriptVersionHistoryPanel,
  ScriptWorkspaceEmptySelection,
  ScriptWorkspaceDetailContent,
  ScriptWorkspaceInspector,
  ScriptWorkspaceLayout,
  ScriptWorkspaceMain,
  ScriptWorkspaceShell,
  WorkbenchProjectBody,
  WorkbenchProjectShell,
  OverlapPaneRevealButton,
  usePersistentOverlapPaneController,
} from '@movscript/ui'
import { ScriptForm } from '@/features/scripts/components/ScriptForm'
import {
  listWorkspaceScripts,
  saveWorkspaceScript,
  type ScriptWorkspaceRepositoryContext,
} from '@/features/scripts/application/scriptWorkspaceRepository'
import { useTranslation } from 'react-i18next'
import { ROUTES } from '@/routes/projectRoutes'
import { scriptLibraryStatusRecipe } from '@/features/scripts/presentation/scriptsSemanticUi'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { workspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'

type ScriptDetailTab = 'edit' | 'versions'

const SCRIPT_LIST_MIN_WIDTH = 240
const SCRIPT_DETAIL_PANE_MIN_WIDTH = 360
const SCRIPT_DETAIL_PANE_MAX_WIDTH = 2400
const SCRIPT_DETAIL_PANE_DEFAULT_WIDTH = 810
const SCRIPT_DETAIL_PANE_WIDTH_STORAGE_KEY = 'movscript.scriptWorkbench.detailPaneWidth'

// ─── Scripts Section ────────────────────────────────────────────────────────

function ScriptsSection({ projectId }: { projectId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<ScriptDetailTab>('edit')
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingScriptTypeId, setEditingScriptTypeId] = useState<number | null>(null)
  const [scriptTypeWorkspace, setScriptTypeWorkspace] = useState('')
  const restoredSessionRef = useRef(false)
  const sessionSnapshot = useWorkbenchSessionStore((state) => state.snapshotFor(projectId, 'scripts'))
  const upsertWorkbenchSessionSnapshot = useWorkbenchSessionStore((state) => state.upsertSnapshot)
  const hasExplicitSessionSearch = useMemo(
    () => hasExplicitWorkbenchSearchParam(searchParams, ['script_id']),
    [searchParams],
  )
  const detailPane = usePersistentOverlapPaneController({
    storageKey: SCRIPT_DETAIL_PANE_WIDTH_STORAGE_KEY,
    defaultSize: SCRIPT_DETAIL_PANE_DEFAULT_WIDTH,
    minSize: SCRIPT_DETAIL_PANE_MIN_WIDTH,
    maxSize: (rect) => Math.max(
      SCRIPT_DETAIL_PANE_MIN_WIDTH,
      Math.min(SCRIPT_DETAIL_PANE_MAX_WIDTH, rect.width - SCRIPT_LIST_MIN_WIDTH),
    ),
    resizeEdge: 'left',
    collapseMode: 'after-min',
    expandMode: 'after-max',
    ariaLabel: '调整剧本正文宽度',
  })
  const [workspace, setWorkspace] = useState<Partial<Script>>({})
  const currentUser = useUserStore((state) => state.currentUser)
  const currentOrgID = useUserStore((state) => state.currentOrgID)
  const orgMemberships = useUserStore((state) => state.orgMemberships)
  const workspaceContext = useMemo(
    () => workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }),
    [currentOrgID, currentUser?.ID, orgMemberships],
  )

  const { data: rawScripts, isLoading } = useQuery<Script[]>({
    queryKey: ['scripts', projectId, workspaceContext.userId ?? 'local', workspaceContext.orgId ?? 'personal'],
    queryFn: () => listWorkspaceScripts(projectId, workspaceContext),
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

  useEffect(() => {
    const scriptId = Number(searchParams.get('script_id'))
    if (!scriptId || scripts.length === 0) return
    if (scripts.some((script) => script.ID === scriptId)) setSelectedId(scriptId)
  }, [scripts, searchParams])

  useEffect(() => {
    if (hasExplicitSessionSearch || restoredSessionRef.current || !sessionSnapshot || scripts.length === 0) return
    restoredSessionRef.current = true
    const snapshotScriptId = sessionSnapshot.selection?.primary?.entityType === 'script'
      ? sessionSnapshot.selection.primary.entityId
      : Number(sessionSnapshot.filters?.scriptId) || 0
    if (!snapshotScriptId || !scripts.some((script) => script.ID === snapshotScriptId)) return
    setSelectedId(snapshotScriptId)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('script_id', String(snapshotScriptId))
      return next
    }, { replace: true })
  }, [hasExplicitSessionSearch, scripts, sessionSnapshot, setSearchParams])

  function selectScript(scriptId: number | null) {
    setSelectedId(scriptId)
    upsertWorkbenchSessionSnapshot({
      projectId,
      workbenchId: 'scripts',
      route: ROUTES.project.scripts,
      search: scriptId ? `script_id=${scriptId}` : '',
      filters: { scriptId: scriptId ?? null },
      selection: {
        ...(scriptId ? { primary: { entityType: 'script', entityId: scriptId } } : {}),
      },
    })
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (scriptId) next.set('script_id', String(scriptId))
      else next.delete('script_id')
      return next
    }, { replace: true })
  }

  const scriptGroups = useMemo(() => groupScriptsByCategory(sortedScripts), [sortedScripts])
  const selected = selectedId ? scripts.find((s) => s.ID === selectedId) ?? null : null
  const hasSelectedScript = Boolean(selected)
  const detailPaneLayoutProps = hasSelectedScript
    ? detailPane.groupProps
    : {
        ...detailPane.groupProps,
        'data-overlap-pane-collapsed': 'true' as const,
        'data-overlap-pane-expanded': undefined,
      }
  const workspaceSourceText = selected ? scriptWorkspaceSourceText(workspace, selected) : ''
  const hasWorkspaceBody = workspaceSourceText.trim().length > 0
  const versionsForSelected = useMemo(() => {
    if (!selected) return []
    return scriptVersions
      .filter((version) => version.script_id === selected.ID)
      .slice()
      .sort((a, b) => (b.version_number || b.ID) - (a.version_number || a.ID) || b.ID - a.ID)
  }, [scriptVersions, selected])
  const latestVersion = versionsForSelected[0] ?? null
  const isCurrentVersionSaved = Boolean(
    latestVersion && normalizeComparableScriptText(workspaceSourceText) === normalizeComparableScriptText(scriptVersionSourceText(latestVersion)),
  )

  useEffect(() => {
    if (selected) setWorkspace({ ...selected })
  }, [selected?.ID])

  useEffect(() => {
    setDetailTab('edit')
    setExpandedVersionId(null)
  }, [selected?.ID])

  const updateScript = useMutation({
    mutationFn: (data: Partial<Script>) => {
      if (!selected) throw new Error('请选择剧本')
      return saveWorkspaceScript(projectId, selected.ID, data, workspaceContext)
    },
    onSuccess: (updated: Script) => {
      setWorkspace((current) => ({ ...current, ...updated }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      toast.success('已保存')
    },
    onError: () => toast.error('保存失败，请重试'),
  })

  const updateScriptCategory = useMutation({
    mutationFn: ({ scriptId, scriptType }: { scriptId: number; scriptType: string }) => {
      const script = scripts.find((item) => item.ID === scriptId)
      return saveWorkspaceScript(projectId, scriptId, { ...script, script_type: scriptType }, workspaceContext)
    },
    onSuccess: (updated: Script) => {
      if (updated.ID === selected?.ID) setWorkspace((current) => ({ ...current, script_type: updated.script_type }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      setEditingScriptTypeId(null)
      toast.success('分类标签已保存')
    },
    onError: () => toast.error('分类标签保存失败，请重试'),
  })

  const createVersion = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('请选择剧本')
      const saved = await saveScriptWorkspace(projectId, selected.ID, workspace, workspaceContext)
      return createScriptVersion(projectId, {
        script_id: saved.ID,
        parent_version_id: latestVersion?.ID ?? null,
        title: saved.title,
        source_type: saved.source_type ?? 'raw',
        content: saved.content ?? saved.raw_source ?? '',
        raw_source: saved.raw_source ?? saved.content ?? '',
        summary: saved.summary ?? '',
        status: 'active',
      })
    },
    onSuccess: (version) => {
      setWorkspace((current) => ({
        ...current,
        title: version.title,
        content: version.content,
        raw_source: version.raw_source,
        summary: version.summary,
      }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      toast.success('版本已保存')
      setDetailTab('versions')
    },
    onError: () => toast.error('保存版本失败'),
  })

  function beginScriptTypeEdit(script: Script) {
    setEditingScriptTypeId(script.ID)
    setScriptTypeWorkspace(script.script_type === 'uncategorized' ? '' : script.script_type ?? '')
  }
  function cancelScriptTypeEdit() {
    setEditingScriptTypeId(null)
    setScriptTypeWorkspace('')
  }
  function saveScriptType(script: Script) {
    const nextType = scriptTypeWorkspace.trim() || 'uncategorized'
    const currentType = script.script_type || 'uncategorized'
    if (nextType !== currentType) updateScriptCategory.mutate({ scriptId: script.ID, scriptType: nextType })
    else cancelScriptTypeEdit()
  }
  return (
    <WorkbenchProjectShell
      workbenchId="scripts"
      icon={ScrollText}
      kicker="剧本"
      title="剧本编辑工作台"
      description="集中维护项目剧本文本。"
    >
      <WorkbenchProjectBody padding="none" scroll="hidden" tone="muted">
        <ScriptWorkspaceShell>
            <ScriptWorkspaceLayout
              {...detailPaneLayoutProps}
            >
            <ScriptLibraryRail
              className="script-workbench-rail"
              icon={<ScrollText size={14} />}
              title="剧本编辑"
              action={(
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title="隐藏剧本正文"
                    aria-label="隐藏剧本正文"
                    onClick={() => {
                      detailPane.collapse()
                    }}
                  >
                    <PanelRightClose size={14} />
                  </Button>
                  <Button size="icon-sm" onClick={() => setShowCreate(true)} aria-label="新建剧本">
                    <Plus size={14} />
                  </Button>
                </>
              )}
            >
              {isLoading ? (
                <p className="px-2 py-4 type-label text-muted-foreground">{t('common.loadingShort')}</p>
              ) : scripts.length === 0 ? (
                <ScriptLibraryEmptyState
                  icon={<FileText size={24} />}
                  title={t('pages.scripts.empty')}
                  action={(
                    <Button variant="ghost" size="xs" onClick={() => setShowCreate(true)}>
                      {t('pages.scripts.createOne')}
                    </Button>
                  )}
                />
              ) : (
                <>
                  {scriptGroups.map((group) => (
                    <ScriptLibraryGroup key={group.category} label={group.category} count={group.scripts.length}>
                      {group.scripts.map((script) => {
                        const bodyLength = String(script.content || script.raw_source || '').trim().length
                        const scriptTypeLabel = categoryLabel(script.script_type)
                        const isEditingType = editingScriptTypeId === script.ID
                        const editState = bodyLength > 0 ? '有正文' : '空稿'
                        return (
                          <ScriptLibraryItem
                            key={script.ID}
                            active={selected?.ID === script.ID}
                            statusProps={scriptLibraryStatusRecipe(false, bodyLength)}
                            title={script.title}
                            meta={scriptLibraryItemMeta({ bodyLength, scriptTypeLabel })}
                            statusLabel={editState}
                            editor={isEditingType ? (
                              <div className="script-library-item__tag-editor" onClick={(event) => event.stopPropagation()}>
                                <ScriptEditorFieldLabel htmlFor={`script-library-category-${script.ID}`} className="sr-only">分类标签</ScriptEditorFieldLabel>
                                <ScriptEditorInput
                                  id={`script-library-category-${script.ID}`}
                                  placeholder="未分类"
                                  value={scriptTypeWorkspace}
                                  autoFocus
                                  onChange={(event) => setScriptTypeWorkspace(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      saveScriptType(script)
                                    }
                                    if (event.key === 'Escape') {
                                      cancelScriptTypeEdit()
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  aria-label="保存分类标签"
                                  disabled={updateScriptCategory.isPending}
                                  onClick={() => saveScriptType(script)}
                                >
                                  <Check size={13} />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="取消编辑分类标签"
                                  onClick={cancelScriptTypeEdit}
                                >
                                  <X size={13} />
                                </Button>
                              </div>
                            ) : null}
                            action={!isEditingType ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="script-library-item__tag-button"
                                aria-label={`编辑分类标签：${scriptTypeLabel}`}
                                title={`编辑分类标签：${scriptTypeLabel}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  beginScriptTypeEdit(script)
                                }}
                              >
                                <Pencil size={11} />
                              </Button>
                            ) : null}
                            onSelect={() => selectScript(selectedId === script.ID ? null : script.ID)}
                          />
                        )
                      })}
                    </ScriptLibraryGroup>
                  ))}
                </>
              )}
            </ScriptLibraryRail>

            {hasSelectedScript && !detailPane.collapsed ? (
              <ScriptWorkspaceMain
                overlapState={detailPane.overlapState}
                resizeHandleSide="left"
                resizeHandleProps={{
                  ...detailPane.resizeHandleProps,
                  className: 'script-workbench-main__resize-handle',
                }}
              >
                {!selected ? (
                  <ScriptWorkspaceEmptySelection
                    icon={ScrollText}
                    title="选择一份稿件开始创作"
                    action={(
                      <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                        <Plus size={14} className="mr-1.5" />
                        新建剧本
                      </Button>
                    )}
                  />
                ) : (
                  <>
                    <ScriptDetailHeader
                      badges={(
                        <>
                          <ScriptTypeBadge script={selected} />
                          {hasWorkspaceBody ? <Badge variant="outline">{workspaceSourceText.trim().length} 字</Badge> : null}
                        </>
                      )}
                      title={selected.title}
                      actions={(
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setDetailTab('versions')}
                        >
                          <GitBranch size={14} />
                          版本管理
                        </Button>
                      )}
                    />

                    <ScriptDetailTabs
                      tabs={[
                        { key: 'edit', label: '正文' },
                        { key: 'versions', label: `版本管理 ${versionsForSelected.length}` },
                      ]}
                      activeKey={detailTab}
                      onSelect={(key) => setDetailTab(key as ScriptDetailTab)}
                    />

                    <ScriptWorkspaceInspector className={detailTab === 'edit' ? 'script-workbench-inspector--editor' : undefined}>
                      <ScriptWorkspaceDetailContent className={detailTab === 'edit' ? 'script-workbench-detail-content--editor' : undefined}>
                        {detailTab === 'edit' ? (
                          <ScriptForm
                            script={selected}
                            workspace={workspace}
                            onChange={setWorkspace}
                            onSave={(data) => updateScript.mutate(data)}
                            isSaving={updateScript.isPending}
                          />
                        ) : (
                          <ScriptVersionHistoryPanel
                            title="版本管理"
                            description="保存当前正文为一个可回看的版本。"
                            action={(
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                disabled={createVersion.isPending || !hasWorkspaceBody || isCurrentVersionSaved}
                                onClick={() => createVersion.mutate()}
                              >
                                <Plus size={14} />
                                {createVersion.isPending ? '保存中' : '保存为版本'}
                              </Button>
                            )}
                          >
                            {versionsForSelected.length === 0 ? (
                              <ScriptVersionEmptyState
                                icon={GitBranch}
                                title="暂无版本"
                                detail="正文保存后，可以在这里创建第一个版本。"
                                action={<Button variant="outline" size="sm" onClick={() => setDetailTab('edit')}>回到正文</Button>}
                              />
                            ) : (
                              <div>
                                {versionsForSelected.map((version) => {
                                  const isExpanded = expandedVersionId === version.ID
                                  const content = scriptVersionSourceText(version)
                                  const contentLength = content.trim().length
                                  return (
                                    <ScriptVersionCard
                                      key={version.ID}
                                      versionLabel={`v${version.version_number || version.ID}`}
                                      status={<Badge variant="outline">{scriptVersionStatusLabel(version.status)}</Badge>}
                                      title={version.title}
                                      meta={`${contentLength} 字 · ${formatDate(version.UpdatedAt)}`}
                                      toggleLabel={contentLength > 0 ? (isExpanded ? '收起' : '查看') : undefined}
                                      onToggle={contentLength > 0 ? () => setExpandedVersionId(isExpanded ? null : version.ID) : undefined}
                                    >
                                      {isExpanded && contentLength > 0 ? (
                                        <p className="max-h-[520px] overflow-auto whitespace-pre-wrap type-caption leading-5 text-foreground">
                                          {content}
                                        </p>
                                      ) : null}
                                    </ScriptVersionCard>
                                  )
                                })}
                              </div>
                            )}
                          </ScriptVersionHistoryPanel>
                        )}
                      </ScriptWorkspaceDetailContent>
                    </ScriptWorkspaceInspector>
                  </>
                )}
              </ScriptWorkspaceMain>
            ) : null}
            {hasSelectedScript && detailPane.collapsed ? (
              <OverlapPaneRevealButton
                action="show"
                label="显示剧本正文"
                onClick={detailPane.show}
              />
            ) : null}
            {hasSelectedScript && detailPane.expanded ? (
              <OverlapPaneRevealButton
                action="restore"
                label="还原剧本正文"
                onClick={detailPane.restore}
              />
            ) : null}
          </ScriptWorkspaceLayout>
        </ScriptWorkspaceShell>
      </WorkbenchProjectBody>

      <ScriptCreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.scripts.createTitle')}>
        <ScriptCreateForm
          projectId={projectId}
          workspaceContext={workspaceContext}
          onSuccess={() => setShowCreate(false)}
          onCancel={() => setShowCreate(false)}
        />
      </ScriptCreateDialog>
    </WorkbenchProjectShell>
  )
}

function ScriptTypeBadge({ script }: { script: Script }) {
  return <Badge>{categoryLabel(script.script_type)}</Badge>
}

function scriptLibraryItemMeta({
  bodyLength,
  scriptTypeLabel,
}: {
  bodyLength: number
  scriptTypeLabel: string
}) {
  return `${bodyLength} 字 · ${scriptTypeLabel}`
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

async function saveScriptWorkspace(
  projectId: number,
  scriptId: number,
  workspace: Partial<Script>,
  context: ScriptWorkspaceRepositoryContext,
) {
  return saveWorkspaceScript(projectId, scriptId, workspace, context)
}

function scriptWorkspaceSourceText(workspace: Partial<Script>, script: Script) {
  return String(workspace.content ?? workspace.raw_source ?? script.content ?? script.raw_source ?? '')
}

function scriptVersionSourceText(version: ScriptVersion) {
  return String(version.content || version.raw_source || '')
}

function normalizeComparableScriptText(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function scriptVersionStatusLabel(status?: string) {
  if (status === 'active') return '当前'
  if (status === 'archived') return '已归档'
  return '工作区'
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
