import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { createScriptVersion, listScriptVersionLines, listScriptVersions, type ScriptVersion, type ScriptVersionLine } from '@/shared/infrastructure/api/scriptVersions'
import { createSemanticEntity, listScriptBlockUsageMap, listSemanticEntities, semanticEntityConfig, type ScriptBlockUsages, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import type { Script } from '@/types'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import {
  hasExplicitWorkbenchSearchParam,
  useWorkbenchSessionStore,
} from '@/features/project-workbenches/application/workbenchSessionStore'
import {
  AlertTriangle,
  CheckCircle2,
  Check,
  Clock3,
  FileText,
  GitBranch,
  Layers,
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
  ScriptBlockCard,
  ScriptBlockGrid,
  ScriptBlockSelectField,
  ScriptBlockUsageEmpty,
  ScriptBlockUsageOverflowBadge,
  ScriptBlockUsageStrip as ScriptBlockUsageStripUi,
  ScriptCreateDialog,
  ScriptDetailHeader,
  ScriptDetailTabs,
  ScriptLibraryEmptyState,
  ScriptLibraryGroup,
  ScriptLibraryItem,
  ScriptLibraryRail,
  ScriptVersionBlockShell,
  ScriptVersionCard,
  ScriptVersionEmptyState,
  ScriptVersionHistoryPanel,
  ScriptVersionLineEditor,
  ScriptWorkspaceEmptySelection,
  ScriptWorkspaceDetailContent,
  ScriptWorkspaceLayout,
  ScriptWorkspaceMain,
  ScriptWorkspaceShell,
  StatusBadge,
  WorkbenchProjectBody,
  WorkbenchProjectShell,
  OverlapPaneRevealButton,
  usePersistentOverlapPaneController,
} from '@movscript/ui'
import { ScriptForm } from '@/features/scripts/components/ScriptForm'
import { useTranslation } from 'react-i18next'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'
import {
  scriptLibraryStatusRecipe,
  scriptStageRecipe,
  scriptVersionStatusRecipe,
} from '@/features/scripts/presentation/scriptsSemanticUi'

type ScriptDetailTab = 'edit' | 'versions'

const SCRIPT_LIST_MIN_WIDTH = 240
const SCRIPT_DETAIL_PANE_MIN_WIDTH = 360
const SCRIPT_DETAIL_PANE_MAX_WIDTH = 2400
const SCRIPT_DETAIL_PANE_DEFAULT_WIDTH = 810
const SCRIPT_DETAIL_PANE_WIDTH_STORAGE_KEY = 'movscript.scriptWorkbench.detailPaneWidth'

type ScriptBlockRecord = SemanticEntityRecord & {
  script_id?: number
  script_version_id?: number
  kind?: string
  speaker?: string
  content?: string
  start_line?: number
  end_line?: number
  start_char?: number
  end_char?: number
}

type ScriptBlockUsageRecord = SemanticEntityRecord & {
  script_block_id?: number
  production_id?: number
  segment_id?: number
  scene_moment_id?: number
  title?: string
  name?: string
  status?: string
}

type ScriptBlockUsage = {
  segments: ScriptBlockUsageRecord[]
  sceneMoments: ScriptBlockUsageRecord[]
  contentUnits: ScriptBlockUsageRecord[]
}

type ScriptTextSelection = {
  versionId: number
  text: string
  startLine: number
  endLine: number
  startChar: number
  endChar: number
} | null

// ─── Scripts Section ────────────────────────────────────────────────────────

function ScriptsSection({ projectId }: { projectId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<ScriptDetailTab>('edit')
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null)
  const [scriptTextSelection, setScriptTextSelection] = useState<ScriptTextSelection>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingScriptTypeId, setEditingScriptTypeId] = useState<number | null>(null)
  const [scriptTypeDraft, setScriptTypeDraft] = useState('')
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
  const [draft, setDraft] = useState<Partial<Script>>({})
  const scriptBlockConfig = useMemo(() => semanticEntityConfig('scriptBlocks'), [])

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
  const { data: scriptBlocks = [] } = useQuery<ScriptBlockRecord[]>({
    queryKey: ['semantic-script-blocks', projectId],
    queryFn: () => listSemanticEntities(projectId, scriptBlockConfig) as Promise<ScriptBlockRecord[]>,
    enabled: !!projectId,
  })
  const { data: segments = [] } = useQuery<ScriptBlockUsageRecord[]>({
    queryKey: ['semantic-script-page-segments', projectId],
    queryFn: () => listSemanticEntities(projectId, semanticEntityConfig('segments')) as Promise<ScriptBlockUsageRecord[]>,
    enabled: !!projectId,
  })
  const { data: sceneMoments = [] } = useQuery<ScriptBlockUsageRecord[]>({
    queryKey: ['semantic-script-page-scene-moments', projectId],
    queryFn: () => listSemanticEntities(projectId, semanticEntityConfig('sceneMoments')) as Promise<ScriptBlockUsageRecord[]>,
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
  const versionsForSelected = useMemo(() => {
    if (!selected) return []
    return scriptVersions
      .filter((v) => v.script_id === selected.ID)
      .slice()
      .sort((a, b) => (b.version_number || b.ID) - (a.version_number || a.ID) || b.ID - a.ID)
  }, [selected, scriptVersions])
  const latestVersion = versionsForSelected[0] ?? null
  const draftSourceText = selected ? scriptDraftSourceText(draft, selected) : ''
  const latestVersionSourceText = latestVersion ? scriptVersionSourceText(latestVersion) : ''
  const hasDraftBody = draftSourceText.trim().length > 0
  const isDraftPublished = Boolean(latestVersion && normalizeComparableScriptText(draftSourceText) === normalizeComparableScriptText(latestVersionSourceText))
  const versionStateLabel = latestVersion
    ? isDraftPublished
      ? '工作稿已发布为最新版本'
      : '工作稿有未发布改动'
    : hasDraftBody
      ? '工作稿尚未创建版本'
      : '工作稿暂无正文'
  const latestVersionLabel = latestVersion
    ? `最新版本 v${latestVersion.version_number || latestVersion.ID} · ${formatDate(latestVersion.UpdatedAt)}`
    : undefined

  useEffect(() => {
    if (selected) setDraft({ ...selected })
  }, [selected?.ID])

  // Reset expanded version when script changes
  useEffect(() => {
    setExpandedVersionId(null)
    setScriptTextSelection(null)
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

  const updateScriptCategory = useMutation({
    mutationFn: ({ scriptId, scriptType }: { scriptId: number; scriptType: string }) => {
      return api.patch<Script>(`/scripts/${scriptId}`, { script_type: scriptType }).then((r) => r.data)
    },
    onSuccess: (updated: Script) => {
      if (updated.ID === selected?.ID) setDraft((current) => ({ ...current, script_type: updated.script_type }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      setEditingScriptTypeId(null)
      toast.success('分类标签已保存')
    },
    onError: () => toast.error('分类标签保存失败，请重试'),
  })

  const createVersion = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('请选择剧本')
      const saved = await saveScriptDraft(projectId, selected.ID, draft)
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
      setDraft((current) => ({
        ...current,
        title: version.title,
        content: version.content,
        raw_source: version.raw_source,
        summary: version.summary,
      }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      toast.success('工作稿已保存并创建版本')
      setDetailTab('versions')
    },
    onError: () => toast.error('创建版本失败'),
  })

  const createScriptBlock = useMutation({
    mutationFn: () => {
      if (!selected || !scriptTextSelection) throw new Error('请选择剧本正文')
      const blocksForVersion = scriptBlocks.filter((block) => Number(block.script_version_id) === scriptTextSelection.versionId)
      const inferred = inferScriptBlockKind(scriptTextSelection.text)
      return createSemanticEntity(projectId, scriptBlockConfig, {
        script_id: selected.ID,
        script_version_id: scriptTextSelection.versionId,
        order: blocksForVersion.length + 1,
        kind: inferred.kind,
        speaker: inferred.speaker,
        start_line: scriptTextSelection.startLine,
        end_line: scriptTextSelection.endLine,
        start_char: scriptTextSelection.startChar,
        end_char: scriptTextSelection.endChar,
        status: 'active',
      })
    },
    onSuccess: () => {
      setScriptTextSelection(null)
      qc.invalidateQueries({ queryKey: ['semantic-script-blocks', projectId] })
      qc.invalidateQueries({ queryKey: ['semantic-script-block-usages', projectId] })
      toast.success('剧本块已创建')
    },
    onError: () => toast.error('创建剧本块失败'),
  })

  const createSegmentFromScriptBlock = useMutation({
    mutationFn: (block: ScriptBlockRecord) => createSemanticEntity(projectId, semanticEntityConfig('segments'), {
      script_block_id: block.ID,
      kind: 'dramatic_function',
      title: titleFromScriptBlock(block),
      summary: `来源剧本块 #${block.ID}`,
      content: String(block.content ?? '').trim(),
      status: 'draft',
    }),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ['semantic-segment-workspace', projectId, 'segments'] })
      qc.invalidateQueries({ queryKey: ['semantic-script-block-usages', projectId] })
      toast.success('编排段已创建')
      navigate(withRouteParams(ROUTES.project.productionOrchestration, { segment_id: record.ID }))
    },
    onError: () => toast.error('创建编排段失败'),
  })

  const createSceneMomentFromScriptBlock = useMutation({
    mutationFn: ({ block, segmentId }: { block: ScriptBlockRecord; segmentId?: number | null }) => createSemanticEntity(projectId, semanticEntityConfig('sceneMoments'), {
      segment_id: segmentId ?? null,
      script_block_id: block.ID,
      title: titleFromScriptBlock(block),
      description: String(block.content ?? '').trim(),
      action_text: String(block.content ?? '').trim(),
      status: 'draft',
    }),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ['semantic-scene-moment-page', projectId, 'sceneMoments'] })
      qc.invalidateQueries({ queryKey: ['semantic-script-block-usages', projectId] })
      toast.success('情景已创建')
      navigate(withRouteParams(ROUTES.project.productionOrchestration, { scene_moment_id: record.ID }))
    },
    onError: () => toast.error('创建情景失败'),
  })

  const createContentUnitFromScriptBlock = useMutation({
    mutationFn: ({ block, segmentId, sceneMomentId }: { block: ScriptBlockRecord; segmentId?: number | null; sceneMomentId?: number | null }) => createSemanticEntity(projectId, semanticEntityConfig('contentUnits'), {
      segment_id: segmentId ?? null,
      scene_moment_id: sceneMomentId ?? null,
      script_block_id: block.ID,
      kind: contentUnitKindFromScriptBlock(block),
      title: titleFromScriptBlock(block),
      description: String(block.content ?? '').trim(),
      prompt: contentPromptFromScriptBlock(block),
      status: 'draft',
    }),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ['semantic-content-positioning', projectId, 'content-units'] })
      qc.invalidateQueries({ queryKey: ['semantic-script-block-usages', projectId] })
      toast.success('制作项已创建')
      navigate(withRouteParams(ROUTES.project.productionOrchestration, {
        scene_moment_id: Number(record.scene_moment_id) || undefined,
        content_unit_id: record.ID,
      }))
    },
    onError: () => toast.error('创建制作项失败'),
  })

  const selectedVersionIds = useMemo(() => new Set(versionsForSelected.map((version) => version.ID)), [versionsForSelected])
  const selectedScriptBlocks = useMemo(() => {
    if (!selected) return []
    return scriptBlocks.filter((block) => Number(block.script_id) === selected.ID || selectedVersionIds.has(Number(block.script_version_id)))
  }, [scriptBlocks, selected, selectedVersionIds])
  function beginScriptTypeEdit(script: Script) {
    setEditingScriptTypeId(script.ID)
    setScriptTypeDraft(script.script_type === 'uncategorized' ? '' : script.script_type ?? '')
  }
  function cancelScriptTypeEdit() {
    setEditingScriptTypeId(null)
    setScriptTypeDraft('')
  }
  function saveScriptType(script: Script) {
    const nextType = scriptTypeDraft.trim() || 'uncategorized'
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
      description="集中维护项目稿件、正文工作稿和定稿记录。"
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
                        const vers = scriptVersions.filter((v) => v.script_id === script.ID)
                        const bodyLength = String(script.content || script.raw_source || '').trim().length
                        const hasVersions = vers.length > 0
                        const scriptTypeLabel = categoryLabel(script.script_type)
                        const isEditingType = editingScriptTypeId === script.ID
                        const scriptVersion = latestScriptVersion(vers)
                        const versionIdSet = new Set(vers.map((version) => version.ID))
                        const relatedBlocks = scriptBlocks.filter((block) => Number(block.script_id) === script.ID || versionIdSet.has(Number(block.script_version_id)))
                        const editState = scriptCardEditState(script, scriptVersion, hasVersions, bodyLength)
                        return (
                          <ScriptLibraryItem
                            key={script.ID}
                            active={selected?.ID === script.ID}
                            statusProps={scriptLibraryStatusRecipe(hasVersions, bodyLength)}
                            title={script.title}
                            meta={scriptLibraryItemMeta({
                              bodyLength,
                              scriptVersion,
                              scriptTypeLabel,
                              blockCount: relatedBlocks.length,
                            })}
                            statusLabel={editState}
                            editor={isEditingType ? (
                              <div className="script-library-item__tag-editor" onClick={(event) => event.stopPropagation()}>
                                <ScriptEditorFieldLabel htmlFor={`script-library-category-${script.ID}`} className="sr-only">分类标签</ScriptEditorFieldLabel>
                                <ScriptEditorInput
                                  id={`script-library-category-${script.ID}`}
                                  placeholder="未分类"
                                  value={scriptTypeDraft}
                                  autoFocus
                                  onChange={(event) => setScriptTypeDraft(event.target.value)}
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
                          <ScriptStageBadge versionCount={versionsForSelected.length} />
                          {latestVersion && (
                            <Badge variant="outline">
                              最新版本 v{latestVersion.version_number || latestVersion.ID}
                            </Badge>
                          )}
                        </>
                      )}
                      title={selected.title}
                      actions={(
                        <>
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDetailTab('versions')}>
                            <GitBranch size={14} />
                            定稿记录
                          </Button>
                        </>
                      )}
                    />

                    <ScriptDetailTabs
                      tabs={[
                        { key: 'edit', label: '正文' },
                        { key: 'versions', label: `定稿记录 ${versionsForSelected.length}` },
                      ]}
                      activeKey={detailTab}
                      onSelect={(key) => setDetailTab(key as ScriptDetailTab)}
                    />

                    {/* Tab content */}
                    <ScriptWorkspaceDetailContent>
                      {detailTab === 'edit' && (
                        <ScriptForm
                          script={selected}
                          draft={draft}
                          onChange={setDraft}
                          onSave={(data) => updateScript.mutate(data)}
                          isSaving={updateScript.isPending}
                          onCreateVersion={() => createVersion.mutate()}
                          isCreatingVersion={createVersion.isPending}
                          canCreateVersion={hasDraftBody && !isDraftPublished}
                          versionStateLabel={versionStateLabel}
                          latestVersionLabel={latestVersionLabel}
                        />
                      )}

                      {detailTab === 'versions' && (
                        <ScriptVersionHistoryPanel
                          title="定稿记录"
                          description="把当前正文保存成一份稳定稿，后续制作引用这份文本。"
                          action={(
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={createVersion.isPending || !hasDraftBody || isDraftPublished}
                              onClick={() => createVersion.mutate()}
                            >
                              <Plus size={14} />
                              保存为定稿
                            </Button>
                          )}
                        >
                          {versionsForSelected.length === 0 ? (
                            <ScriptVersionEmptyState
                              icon={Layers}
                              title="还没有定稿"
                              detail="正文稳定后，可以保存成第一份定稿。"
                              action={<Button variant="outline" size="sm" onClick={() => setDetailTab('edit')}>回到正文</Button>}
                            />
                          ) : (
                            <div>
                              {versionsForSelected.map((version) => {
                                const isExpanded = expandedVersionId === version.ID
                                const content = version.content || version.raw_source || ''
                                const contentLength = content.trim().length
                                return (
                                  <ScriptVersionCard
                                    key={version.ID}
                                    versionLabel={`v${version.version_number || version.ID}`}
                                    status={<VersionStatusBadge status={version.status} />}
                                    title={version.title}
                                    meta={`${contentLength} 字 · ${formatDate(version.UpdatedAt)}`}
                                    toggleLabel={contentLength > 0 ? (isExpanded ? '收起' : '查看') : undefined}
                                    onToggle={contentLength > 0 ? () => setExpandedVersionId(isExpanded ? null : version.ID) : undefined}
                                  >
                                    {isExpanded && contentLength > 0 && (
                                      <ScriptVersionBlockPanel
                                        blocks={scriptBlocks.filter((block) => Number(block.script_version_id) === version.ID)}
                                        content={content}
                                        sceneMoments={sceneMoments}
                                        segments={segments}
                                        isCreating={createScriptBlock.isPending}
                                        isCreatingContentUnit={createContentUnitFromScriptBlock.isPending}
                                        isCreatingSceneMoment={createSceneMomentFromScriptBlock.isPending}
                                        isCreatingSegment={createSegmentFromScriptBlock.isPending}
                                        selection={scriptTextSelection?.versionId === version.ID ? scriptTextSelection : null}
                                        version={version}
                                        projectId={projectId}
                                        onCreate={() => createScriptBlock.mutate()}
                                        onCreateContentUnit={(block, target) => createContentUnitFromScriptBlock.mutate({ block, ...target })}
                                        onCreateSceneMoment={(block, segmentId) => createSceneMomentFromScriptBlock.mutate({ block, segmentId })}
                                        onCreateSegment={(block) => createSegmentFromScriptBlock.mutate(block)}
                                        onOpenUsage={(kind, id) => {
                                          if (kind === 'segment') navigate(withRouteParams(ROUTES.project.productionOrchestration, { segment_id: id }))
                                          else if (kind === 'scene_moment') navigate(withRouteParams(ROUTES.project.productionOrchestration, { scene_moment_id: id }))
                                          else navigate(withRouteParams(ROUTES.project.contentUnitEditor, { content_unit_id: id }))
                                        }}
                                        onSelectionChange={setScriptTextSelection}
                                      />
                                    )}
                                  </ScriptVersionCard>
                                )
                              })}
                            </div>
                          )}
                        </ScriptVersionHistoryPanel>
                      )}
                    </ScriptWorkspaceDetailContent>
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
        <ScriptCreateForm projectId={projectId} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </ScriptCreateDialog>
    </WorkbenchProjectShell>
  )
}

function ScriptVersionBlockPanel({
  version,
  projectId,
  content,
  blocks,
  sceneMoments,
  segments,
  selection,
  isCreating,
  isCreatingContentUnit,
  isCreatingSceneMoment,
  isCreatingSegment,
  onSelectionChange,
  onCreate,
  onCreateContentUnit,
  onCreateSceneMoment,
  onCreateSegment,
  onOpenUsage,
}: {
  version: ScriptVersion
  projectId: number
  content: string
  blocks: ScriptBlockRecord[]
  sceneMoments: ScriptBlockUsageRecord[]
  segments: ScriptBlockUsageRecord[]
  selection: ScriptTextSelection
  isCreating: boolean
  isCreatingContentUnit: boolean
  isCreatingSceneMoment: boolean
  isCreatingSegment: boolean
  onSelectionChange: (selection: ScriptTextSelection) => void
  onCreate: () => void
  onCreateContentUnit: (block: ScriptBlockRecord, target: { segmentId?: number | null; sceneMomentId?: number | null }) => void
  onCreateSceneMoment: (block: ScriptBlockRecord, segmentId?: number | null) => void
  onCreateSegment: (block: ScriptBlockRecord) => void
  onOpenUsage: (kind: 'segment' | 'scene_moment' | 'content_unit', id: number) => void
}) {
  const [scrollTop, setScrollTop] = useState(0)
  const [targetContentByBlockId, setTargetContentByBlockId] = useState<Record<number, string>>({})
  const [targetSegmentByBlockId, setTargetSegmentByBlockId] = useState<Record<number, string>>({})
  const { data: versionLines = [] } = useQuery({
    queryKey: ['semantic-script-version-lines', projectId, version.ID],
    queryFn: () => listScriptVersionLines(projectId, version.ID),
    enabled: Boolean(projectId && version.ID),
  })
  const lineText = useMemo(() => linesToScriptText(versionLines, content), [content, versionLines])
  const displayLines = useMemo(() => scriptDisplayLines(versionLines, lineText), [lineText, versionLines])
  const { data: usageResponse = {} } = useQuery({
    queryKey: ['semantic-script-block-usages', projectId, version.ID],
    queryFn: () => listScriptBlockUsageMap(projectId, version.ID),
    enabled: Boolean(projectId && version.ID),
  })
  const usagesByBlockId = useMemo(() => {
    const map = new Map<number, ScriptBlockUsage>()
    blocks.forEach((block) => {
      map.set(block.ID, scriptBlockUsageFromResponse(usageResponse[String(block.ID)]))
    })
    return map
  }, [blocks, usageResponse])

  function captureSelection(event: SyntheticEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget
    const start = target.selectionStart ?? 0
    const end = target.selectionEnd ?? 0
    if (start === end) {
      onSelectionChange(null)
      return
    }
    const text = target.value.slice(Math.min(start, end), Math.max(start, end))
    if (!text.trim()) {
      onSelectionChange(null)
      return
    }
    const range = scriptLineRange(target.value, start, end, versionLines)
    onSelectionChange({
      versionId: version.ID,
      text,
      ...range,
    })
  }

  return (
    <ScriptVersionBlockShell
      toolbar={(
        <>
          <div className="min-w-0 type-label text-muted-foreground">
            {selection ? `已选 ${selection.startLine}-${selection.endLine} 行 · ${selection.text.trim().length} 字` : `${blocks.length} 个剧本块`}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 px-2 type-label"
            disabled={!selection || isCreating}
            onClick={onCreate}
          >
            <Plus size={12} />
            {isCreating ? '创建中' : '创建剧本块'}
          </Button>
        </>
      )}
    >
      <ScriptVersionLineEditor
        value={lineText}
        lines={displayLines}
        scrollTop={scrollTop}
        onKeyUp={captureSelection}
        onMouseUp={captureSelection}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      />
      {blocks.length > 0 && (
        <ScriptBlockGrid>
          {blocks.map((block) => {
            const usages = usagesByBlockId.get(block.ID) ?? emptyScriptBlockUsage()
            const targetSegmentValue = targetSegmentByBlockId[block.ID] ?? defaultSegmentValueForScriptBlock(block, usages)
            const targetSegmentId = Number(targetSegmentValue)
            const selectedTargetSegment = Number.isFinite(targetSegmentId) && targetSegmentId > 0
              ? segments.find((segment) => segment.ID === targetSegmentId)
              : undefined
            const unrelatedSegments = segments.filter((segment) => !usages.segments.some((used) => used.ID === segment.ID))
            const targetContentValue = targetContentByBlockId[block.ID] ?? defaultContentTargetValueForScriptBlock(block, usages)
            const contentTarget = parseContentTargetValue(targetContentValue)
            const selectedContentTarget = contentTarget.sceneMomentId
              ? sceneMoments.find((moment) => moment.ID === contentTarget.sceneMomentId)
              : contentTarget.segmentId
                ? segments.find((segment) => segment.ID === contentTarget.segmentId)
                : undefined
            const unrelatedSceneMoments = sceneMoments.filter((moment) => !usages.sceneMoments.some((used) => used.ID === moment.ID))
            return (
              <ScriptBlockCard
                key={block.ID}
                title={scriptBlockLabel(block)}
                range={`行 ${block.start_line || '?'}-${block.end_line || '?'}`}
                description={String(block.content ?? '')}
                usage={<ScriptBlockUsageStrip usages={usages} onOpen={onOpenUsage} />}
                fields={(
                  <>
                    <ScriptBlockSelectField
                      id={`script-block-target-segment-${block.ID}`}
                      label="情景归属编排段"
                      value={targetSegmentValue}
                      onChange={(event) => setTargetSegmentByBlockId((current) => ({ ...current, [block.ID]: event.target.value }))}
                      helper={selectedTargetSegment ? `将创建到 ${segmentOptionLabel(selectedTargetSegment)}` : undefined}
                    >
                      <option value="">不挂载到编排段</option>
                      {usages.segments.length > 0 ? (
                        <optgroup label="当前剧本块相关">
                          {usages.segments.map((segment) => (
                            <option key={`related-${segment.ID}`} value={segment.ID}>{segmentOptionLabel(segment)}</option>
                          ))}
                        </optgroup>
                      ) : null}
                      {unrelatedSegments.length > 0 ? (
                        <optgroup label="全部编排段">
                          {unrelatedSegments.map((segment) => (
                            <option key={segment.ID} value={segment.ID}>{segmentOptionLabel(segment)}</option>
                          ))}
                        </optgroup>
                      ) : null}
                    </ScriptBlockSelectField>
                    <ScriptBlockSelectField
                      id={`script-block-target-content-${block.ID}`}
                      label="制作项归属"
                      value={targetContentValue}
                      onChange={(event) => setTargetContentByBlockId((current) => ({ ...current, [block.ID]: event.target.value }))}
                      helper={selectedContentTarget ? `将创建到 ${contentTarget.sceneMomentId ? sceneMomentOptionLabel(selectedContentTarget) : segmentOptionLabel(selectedContentTarget)}` : undefined}
                    >
                      <option value="">不挂载到情景或编排段</option>
                      {usages.sceneMoments.length > 0 ? (
                        <optgroup label="当前剧本块情景">
                          {usages.sceneMoments.map((moment) => (
                            <option key={`related-moment-${moment.ID}`} value={contentTargetValue('scene_moment', moment.ID)}>{sceneMomentOptionLabel(moment)}</option>
                          ))}
                        </optgroup>
                      ) : null}
                      {usages.segments.length > 0 ? (
                        <optgroup label="当前剧本块编排段">
                          {usages.segments.map((segment) => (
                            <option key={`related-segment-${segment.ID}`} value={contentTargetValue('segment', segment.ID)}>{segmentOptionLabel(segment)}</option>
                          ))}
                        </optgroup>
                      ) : null}
                      {unrelatedSceneMoments.length > 0 ? (
                        <optgroup label="全部情景">
                          {unrelatedSceneMoments.map((moment) => (
                            <option key={`moment-${moment.ID}`} value={contentTargetValue('scene_moment', moment.ID)}>{sceneMomentOptionLabel(moment)}</option>
                          ))}
                        </optgroup>
                      ) : null}
                      {unrelatedSegments.length > 0 ? (
                        <optgroup label="全部编排段">
                          {unrelatedSegments.map((segment) => (
                            <option key={`segment-${segment.ID}`} value={contentTargetValue('segment', segment.ID)}>{segmentOptionLabel(segment)}</option>
                          ))}
                        </optgroup>
                      ) : null}
                    </ScriptBlockSelectField>
                  </>
                )}
                actions={(
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2 type-label"
                      disabled={isCreatingSegment}
                      onClick={() => onCreateSegment(block)}
                    >
                      生成编排段
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2 type-label"
                      disabled={isCreatingSceneMoment}
                      onClick={() => onCreateSceneMoment(block, targetSegmentId > 0 ? targetSegmentId : null)}
                    >
                      生成情景
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2 type-label"
                      disabled={isCreatingContentUnit}
                      onClick={() => onCreateContentUnit(block, contentTarget)}
                    >
                      生成制作项
                    </Button>
                  </>
                )}
              />
            )
          })}
        </ScriptBlockGrid>
      )}
    </ScriptVersionBlockShell>
  )
}

// ─── Version status badge ─────────────────────────────────────────────────────

function VersionStatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return <StatusBadge {...scriptVersionStatusRecipe(status)} className="gap-1"><CheckCircle2 size={10} />已锁定</StatusBadge>
  }
  if (status === 'archived') {
    return <StatusBadge {...scriptVersionStatusRecipe(status)}>已归档</StatusBadge>
  }
  return <StatusBadge {...scriptVersionStatusRecipe(status)} className="gap-1"><Clock3 size={10} />草稿</StatusBadge>
}

function ScriptBlockUsageStrip({
  usages,
  onOpen,
}: {
  usages: ScriptBlockUsage
  onOpen: (kind: 'segment' | 'scene_moment' | 'content_unit', id: number) => void
}) {
  const items = [
    ...usages.segments.slice(0, 2).map((record) => ({ kind: 'segment' as const, label: '编排段', record })),
    ...usages.sceneMoments.slice(0, 2).map((record) => ({ kind: 'scene_moment' as const, label: '情景', record })),
    ...usages.contentUnits.slice(0, 2).map((record) => ({ kind: 'content_unit' as const, label: '制作项', record })),
  ]
  const total = usages.segments.length + usages.sceneMoments.length + usages.contentUnits.length
  if (total === 0) {
    return <ScriptBlockUsageEmpty>尚未被下游引用</ScriptBlockUsageEmpty>
  }
  return (
    <ScriptBlockUsageStripUi>
      {items.map((item) => (
        <Button
          key={`${item.kind}-${item.record.ID}`}
          type="button"
          variant="outline"
          size="xs"
          onClick={() => onOpen(item.kind, item.record.ID)}
          className="max-w-full text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <span className="font-medium">{item.label}</span>
          <span className="ml-1">{titleOfRecord(item.record)}</span>
        </Button>
      ))}
      {total > items.length ? <ScriptBlockUsageOverflowBadge>+{total - items.length}</ScriptBlockUsageOverflowBadge> : null}
    </ScriptBlockUsageStripUi>
  )
}

function ScriptTypeBadge({ script }: { script: Script }) {
  return <Badge>{categoryLabel(script.script_type)}</Badge>
}

function ScriptStageBadge({ versionCount }: { versionCount: number }) {
  const stage = !versionCount ? '无版本' : '已锁定'
  const configs: Record<string, { icon: typeof AlertTriangle }> = {
    '无版本': { icon: AlertTriangle },
    '已锁定': { icon: CheckCircle2 },
  }
  const config = configs[stage]
  const Icon = config.icon
  return <StatusBadge {...scriptStageRecipe(versionCount)} className="gap-1"><Icon size={12} />{stage}</StatusBadge>
}

function linesToScriptText(lines: ScriptVersionLine[], fallback: string) {
  if (lines.length === 0) return fallback
  return lines
    .slice()
    .sort((a, b) => a.line_number - b.line_number)
    .map((line) => line.content)
    .join('\n')
}

function scriptDisplayLines(lines: ScriptVersionLine[], text: string) {
  if (lines.length > 0) return lines.slice().sort((a, b) => a.line_number - b.line_number)
  return text.split('\n').map((content, index) => ({
    line_number: index + 1,
    content,
    start_char: 0,
    end_char: Array.from(content).length,
  }))
}

function scriptLineRange(text: string, selectionStart: number, selectionEnd: number, lines: ScriptVersionLine[] = []) {
  const start = Math.min(selectionStart, selectionEnd)
  const end = Math.max(selectionStart, selectionEnd)
  if (lines.length > 0) {
    const sorted = lines.slice().sort((a, b) => a.line_number - b.line_number)
    return {
      startLine: lineNumberAtOffset(sorted, text, start),
      endLine: lineNumberAtOffset(sorted, text, end),
      startChar: charOffsetInLine(text.slice(0, start)),
      endChar: charOffsetInLine(text.slice(0, end)),
    }
  }
  const beforeStart = text.slice(0, start)
  const beforeEnd = text.slice(0, end)
  return {
    startLine: beforeStart.split('\n').length,
    endLine: beforeEnd.split('\n').length,
    startChar: charOffsetInLine(beforeStart),
    endChar: charOffsetInLine(beforeEnd),
  }
}

function lineNumberAtOffset(lines: ScriptVersionLine[], text: string, offset: number) {
  let cursor = 0
  for (const line of lines) {
    const lineLength = String(line.content ?? '').length
    const lineEnd = cursor + lineLength
    if (offset <= lineEnd) return line.line_number
    cursor = lineEnd + 1
  }
  return lines[lines.length - 1]?.line_number ?? text.slice(0, offset).split('\n').length
}

function charOffsetInLine(text: string) {
  const lastBreak = text.lastIndexOf('\n')
  const lineText = lastBreak < 0 ? text : text.slice(lastBreak + 1)
  return Array.from(lineText).length
}

function inferScriptBlockKind(text: string) {
  const firstLine = text.trim().split(/\r?\n/)[0]?.trim() ?? ''
  const speakerMatch = firstLine.match(/^([^：:]{1,24})[：:]\s*(.+)$/)
  if (speakerMatch) {
    return { kind: 'dialogue', speaker: speakerMatch[1].trim() }
  }
  if (/^(INT\.|EXT\.|内景|外景|场景|第.+场)/i.test(firstLine)) {
    return { kind: 'scene_heading', speaker: '' }
  }
  return { kind: 'action', speaker: '' }
}

function scriptBlockLabel(block: ScriptBlockRecord) {
  const kind = String(block.kind ?? 'block')
  const speaker = String(block.speaker ?? '').trim()
  return speaker ? `${kind} · ${speaker}` : kind
}

function latestScriptVersion(versions: ScriptVersion[]) {
  return versions
    .slice()
    .sort((a, b) => (b.version_number || b.ID) - (a.version_number || a.ID) || b.ID - a.ID)[0] ?? null
}

function scriptCardEditState(script: Script, latestVersion: ScriptVersion | null, hasVersions: boolean, bodyLength: number) {
  if (!bodyLength) return '空稿'
  if (!hasVersions) return '草稿'
  const draftText = normalizeComparableScriptText(String(script.content ?? script.raw_source ?? ''))
  const versionText = latestVersion ? normalizeComparableScriptText(scriptVersionSourceText(latestVersion)) : ''
  if (draftText && versionText && draftText !== versionText) return '有改动'
  return '已发布'
}

function scriptLibraryItemMeta({
  bodyLength,
  scriptVersion,
  scriptTypeLabel,
  blockCount,
}: {
  bodyLength: number
  scriptVersion: ScriptVersion | null
  scriptTypeLabel: string
  blockCount: number
}) {
  const versionLabel = scriptVersion ? `v${scriptVersion.version_number || scriptVersion.ID}` : '工作稿'
  const blockLabel = blockCount > 0 ? `剧本块 ${blockCount}` : '暂无剧本块'
  return `${bodyLength} 字 · ${versionLabel} · ${blockLabel} · ${scriptTypeLabel}`
}

function titleFromScriptBlock(block: ScriptBlockRecord) {
  const content = String(block.content ?? '').trim()
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? ''
  if (!firstLine) return `剧本块 #${block.ID}`
  return firstLine.length > 32 ? `${firstLine.slice(0, 32)}...` : firstLine
}

function contentUnitKindFromScriptBlock(block: ScriptBlockRecord) {
  const kind = String(block.kind ?? '')
  if (kind === 'dialogue') return 'dialogue_audio'
  if (kind === 'transition') return 'transition'
  return 'shot'
}

function contentPromptFromScriptBlock(block: ScriptBlockRecord) {
  const content = String(block.content ?? '').trim()
  const speaker = String(block.speaker ?? '').trim()
  if (speaker) return `${speaker}: ${content}`
  return content
}

function defaultSegmentValueForScriptBlock(block: ScriptBlockRecord, usages: ScriptBlockUsage) {
  const sameBlockSegment = usages.segments.find((segment) => Number(segment.script_block_id) === block.ID)
  return sameBlockSegment ? String(sameBlockSegment.ID) : ''
}

function segmentOptionLabel(segment: ScriptBlockUsageRecord) {
  const title = titleOfRecord(segment)
  const production = segment.production_id ? `制作 #${segment.production_id}` : ''
  const source = segment.script_block_id ? `剧本块 #${segment.script_block_id}` : ''
  return [title, production, source].filter(Boolean).join(' · ')
}

function defaultContentTargetValueForScriptBlock(block: ScriptBlockRecord, usages: ScriptBlockUsage) {
  const sameBlockMoment = usages.sceneMoments.find((moment) => Number(moment.script_block_id) === block.ID)
  if (sameBlockMoment) return contentTargetValue('scene_moment', sameBlockMoment.ID)
  const sameBlockSegment = usages.segments.find((segment) => Number(segment.script_block_id) === block.ID)
  return sameBlockSegment ? contentTargetValue('segment', sameBlockSegment.ID) : ''
}

function contentTargetValue(kind: 'segment' | 'scene_moment', id: number) {
  return `${kind}:${id}`
}

function parseContentTargetValue(value: string): { segmentId?: number | null; sceneMomentId?: number | null } {
  const [kind, rawId] = value.split(':')
  const id = Number(rawId)
  if (!Number.isFinite(id) || id <= 0) return { segmentId: null, sceneMomentId: null }
  if (kind === 'scene_moment') return { sceneMomentId: id, segmentId: null }
  if (kind === 'segment') return { segmentId: id, sceneMomentId: null }
  return { segmentId: null, sceneMomentId: null }
}

function sceneMomentOptionLabel(moment: ScriptBlockUsageRecord) {
  const title = titleOfRecord(moment)
  const segment = moment.segment_id ? `编排段 #${moment.segment_id}` : ''
  const source = moment.script_block_id ? `剧本块 #${moment.script_block_id}` : ''
  return [title, segment, source].filter(Boolean).join(' · ')
}

function scriptBlockUsageFromResponse(response?: ScriptBlockUsages): ScriptBlockUsage {
  if (!response) return emptyScriptBlockUsage()
  return {
    segments: (response.segments ?? []) as ScriptBlockUsageRecord[],
    sceneMoments: (response.scene_moments ?? []) as ScriptBlockUsageRecord[],
    contentUnits: (response.content_units ?? []) as ScriptBlockUsageRecord[],
  }
}

function emptyScriptBlockUsage(): ScriptBlockUsage {
  return { segments: [], sceneMoments: [], contentUnits: [] }
}

function titleOfRecord(record: ScriptBlockUsageRecord) {
  return String(record.title ?? record.name ?? record.label ?? `#${record.ID}`)
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

async function saveScriptDraft(projectId: number, scriptId: number, draft: Partial<Script>) {
  const { data } = await api.put<Script>(`/projects/${projectId}/scripts/${scriptId}`, draft)
  return data
}

function scriptDraftSourceText(draft: Partial<Script>, script: Script) {
  return String(draft.content ?? draft.raw_source ?? script.content ?? script.raw_source ?? '')
}

function scriptVersionSourceText(version: ScriptVersion) {
  return String(version.content || version.raw_source || '')
}

function normalizeComparableScriptText(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
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
