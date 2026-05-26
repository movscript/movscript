import { useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { createScriptVersion, listScriptVersionLines, listScriptVersions, type ScriptVersion, type ScriptVersionLine } from '@/shared/infrastructure/api/scriptVersions'
import { createSemanticEntity, listScriptBlockUsageMap, listSemanticEntities, semanticEntityConfig, type ScriptBlockUsages, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import type { Script } from '@/types'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import {
  AlertTriangle,
  Bot,
  BookOpenCheck,
  CheckCircle2,
  Clapperboard,
  Clock3,
  FileText,
  GitBranch,
  Layers,
  ListChecks,
  Plus,
  Route,
  ScrollText,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { ScriptCreateForm } from '@/shared/ui/EntityCreateForms'
import {
  Badge,
  Button,
  ScriptAgentAssistPanel,
  ScriptBlockCard,
  ScriptBlockGrid,
  ScriptBlockSelectField,
  ScriptBlockUsageEmpty,
  ScriptBlockUsageOverflowBadge,
  ScriptBlockUsageStrip as ScriptBlockUsageStripUi,
  ScriptCollaborationEmpty,
  ScriptCollaborationStack,
  ScriptCreateDialog,
  ScriptDetailHeader,
  ScriptDetailTabs,
  ScriptLibraryEmptyState,
  ScriptLibraryGroup,
  ScriptLibraryItem,
  ScriptLibraryRail,
  ScriptMetricBox,
  ScriptPipelineMetric,
  ScriptPipelinePanel,
  ScriptProductionNotice,
  ScriptProductionPanel,
  ScriptReadinessPanel,
  ScriptReadinessRow as ScriptReadinessRowUi,
  ScriptVersionBlockShell,
  ScriptVersionCard,
  ScriptVersionEmptyState,
  ScriptVersionHistoryPanel,
  ScriptVersionLineEditor,
  ScriptWorkflowPanel,
  ScriptWorkflowStep as ScriptWorkflowStepUi,
  ScriptWorkspaceEmptySelection,
  ScriptWorkspaceInspector,
  ScriptWorkspaceLayout,
  ScriptWorkspaceMain,
  ScriptWorkspaceShell,
  ScriptWorkspaceStat,
  StatusBadge,
} from '@movscript/ui'
import { ScriptForm } from '@/features/scripts/components/ScriptForm'
import { ProjectSurfaceHeader } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'
import { buildCommandFirstClientInput } from '@/features/agent/domain/agentCommandInput'
import { openAgentPanelDraft } from '@/features/agent/application/agentPanelBridge'
import {
  scriptLibraryStatusRecipe,
  scriptReadinessItemRecipe,
  scriptReadinessRecipe,
  scriptStageRecipe,
  scriptVersionStatusRecipe,
} from '@/features/scripts/presentation/scriptsSemanticUi'

type ScriptDetailTab = 'edit' | 'versions' | 'production'

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
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<ScriptDetailTab>('edit')
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null)
  const [scriptTextSelection, setScriptTextSelection] = useState<ScriptTextSelection>(null)
  const [showCreate, setShowCreate] = useState(false)
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
  const scriptGroups = useMemo(() => groupScriptsByCategory(sortedScripts), [sortedScripts])
  const selected = scripts.find((s) => s.ID === selectedId) ?? sortedScripts[0] ?? null
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
  const lockedBodyText = latestVersionSourceText.trim()
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
  const canCreateProduction = versionsForSelected.length > 0 && lockedBodyText.length > 0

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

  const createProduction = useMutation({
    mutationFn: async () => {
      if (!selected || !latestVersion) throw new Error('请先创建一个剧本版本')
      const record = await createSemanticEntity(projectId, semanticEntityConfig('productions'), {
        name: `${selected.title} 制作`,
        description: selected.summary || selected.description || `${selected.title} 的制作`,
        source_type: 'script',
        status: 'planning',
        owner_label: '导演组',
        progress: 0,
        script_version_id: latestVersion.ID,
      })
      return record
    },
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ['production-frame', projectId] })
      navigate(`/production?productionId=${record.ID}&created=1`)
    },
    onError: () => toast.error('创建制作失败'),
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
      navigate(withRouteParams(ROUTES.project.contentUnitWorkbench, { content_unit_id: record.ID }))
    },
    onError: () => toast.error('创建制作项失败'),
  })

  const selectedVersionIds = useMemo(() => new Set(versionsForSelected.map((version) => version.ID)), [versionsForSelected])
  const selectedScriptBlocks = useMemo(() => {
    if (!selected) return []
    return scriptBlocks.filter((block) => Number(block.script_id) === selected.ID || selectedVersionIds.has(Number(block.script_version_id)))
  }, [scriptBlocks, selected, selectedVersionIds])
  const selectedScriptBlockIds = useMemo(() => new Set(selectedScriptBlocks.map((block) => block.ID)), [selectedScriptBlocks])
  const linkedSegments = useMemo(
    () => segments.filter((segment) => selectedScriptBlockIds.has(Number(segment.script_block_id))),
    [segments, selectedScriptBlockIds],
  )
  const linkedSceneMoments = useMemo(
    () => sceneMoments.filter((moment) => selectedScriptBlockIds.has(Number(moment.script_block_id))),
    [sceneMoments, selectedScriptBlockIds],
  )
  const selectedReadiness = selected ? scriptReadiness(selected, versionsForSelected.length, draftSourceText.trim().length) : 0

  function launchScriptAgent(mode: 'diagnose' | 'rewrite' | 'breakdown') {
    if (!selected) return
    const requestId = `script_workbench_${mode}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const title = selected.title || `剧本 #${selected.ID}`
    const body = draftSourceText.trim()
    const prompts = {
      diagnose: `请作为影视创意编排搭档，审阅剧本《${title}》。重点指出结构、人物动机、情景拆分、道具证据和制作可执行性问题，并给出可执行修改建议。当前正文如下：\n\n${body || '当前剧本正文为空，请先给出创作 brief 和结构提纲建议。'}`,
      rewrite: `请协助完善剧本《${title}》。保持现有核心设定，优先提升冲突、动作可视化、对白克制程度和镜头可拍性。请输出修改建议和可直接替换的片段。当前正文如下：\n\n${body || '当前剧本正文为空，请先根据标题和摘要起草一个可拍摄的短片段。'}`,
      breakdown: `请把剧本《${title}》拆解为专业创作编排方案。输出情景、编排段、关键画面、人物/地点/道具设定资料、素材缺口和下游制作风险。当前正文如下：\n\n${body || '当前剧本正文为空，请先列出需要补齐的信息清单。'}`,
    }
    openAgentPanelDraft({
      requestId,
      taskType: `script_${mode}`,
      message: mode === 'diagnose' ? `审阅剧本: ${title}` : mode === 'rewrite' ? `完善剧本: ${title}` : `拆解编排: ${title}`,
      title: mode === 'diagnose' ? `剧本审阅: ${title}` : mode === 'rewrite' ? `剧本完善: ${title}` : `剧本编排: ${title}`,
      newConversation: true,
      autoSend: true,
      projectId,
      clientInput: buildCommandFirstClientInput({
        message: prompts[mode],
        labels: ['script-workbench', 'creative-orchestration', 'human-ai-collaboration'],
        hints: {
          projectId,
          route: { pathname: ROUTES.project.scripts },
          selection: { entityType: 'script', entityId: selected.ID, label: title },
        },
      }),
      timeoutMs: 240_000,
      renderMode: 'page',
    })
    toast.info('已把剧本上下文发送到 AI 协作面板')
  }

  return (
    <ScriptWorkspaceShell>
        <ProjectSurfaceHeader
          icon={Clapperboard}
          title="剧本协作与制作拆解"
          description="管理剧本、版本和下游拆解对象，把文本来源稳定传递到编排段、情景与制作项。"
          actions={(
            <div className="grid grid-cols-3 gap-2">
              <ScriptWorkspaceStat icon={ScrollText} label="剧本" value={String(scripts.length)} />
              <ScriptWorkspaceStat icon={GitBranch} label="版本" value={String(scriptVersions.length)} />
              <ScriptWorkspaceStat icon={Route} label="下游" value={String(segments.length + sceneMoments.length)} />
            </div>
          )}
        />

        <ScriptWorkspaceLayout>
          <ScriptLibraryRail
            className="script-workbench-rail"
            icon={<ScrollText size={14} />}
            title="剧本库"
            action={(
              <Button size="icon-sm" onClick={() => setShowCreate(true)} aria-label="新建剧本">
                <Plus size={14} />
              </Button>
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
                      return (
                        <ScriptLibraryItem
                          key={script.ID}
                          active={selected?.ID === script.ID}
                          statusProps={scriptLibraryStatusRecipe(hasVersions, bodyLength)}
                          title={script.title}
                          meta={`${vers.length} 版本 · ${bodyLength} 字 · ${hasVersions ? '可制作' : '待锁定'}`}
                          onSelect={() => setSelectedId(script.ID)}
                        />
                      )
                    })}
                  </ScriptLibraryGroup>
                ))}
              </>
            )}
          </ScriptLibraryRail>

          <ScriptWorkspaceMain>
        {!selected ? (
          <ScriptWorkspaceEmptySelection
            icon={ScrollText}
            title="选择左侧剧本开始编辑"
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
              description={selected.summary || selected.description}
              actions={(
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => launchScriptAgent('diagnose')}>
                    <Bot size={14} />
                    AI 审阅
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => launchScriptAgent('breakdown')}>
                    <Wand2 size={14} />
                    拆解编排
                  </Button>
                </>
              )}
              metrics={(
                <>
                <ScriptMetricBox icon={ScrollText} label="工作稿字数" value={`${draftSourceText.trim().length}`} />
                <ScriptMetricBox icon={Layers} label="版本总数" value={`${versionsForSelected.length}`} />
                <ScriptMetricBox icon={ListChecks} label="剧本块" value={`${selectedScriptBlocks.length}`} />
                <ScriptMetricBox icon={BookOpenCheck} label="完整度" value={`${selectedReadiness}%`} />
                </>
              )}
            />

            <ScriptDetailTabs
              tabs={[
                { key: 'edit', label: '编辑正文' },
                { key: 'versions', label: `版本管理 (${versionsForSelected.length})` },
                { key: 'production', label: '创建制作' },
              ]}
              activeKey={detailTab}
              onSelect={(key) => setDetailTab(key as ScriptDetailTab)}
            />

            {/* Tab content */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                  title="版本历史"
                  description="版本创建后即锁定为历史快照，不支持修改、激活或归档；创建制作时默认使用最新版本。"
                  action={(
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={createVersion.isPending || !hasDraftBody || isDraftPublished}
                      onClick={() => createVersion.mutate()}
                    >
                      <Plus size={14} />
                      快照当前正文
                    </Button>
                  )}
                >
                  {versionsForSelected.length === 0 ? (
                    <ScriptVersionEmptyState
                      icon={Layers}
                      title="暂无版本"
                      detail="填写正文后，点击「快照当前正文」创建第一个稳定版本。"
                      action={<Button variant="outline" size="sm" onClick={() => setDetailTab('edit')}>前往编辑正文</Button>}
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
                                  else navigate(withRouteParams(ROUTES.project.contentUnitWorkbench, { content_unit_id: id }))
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

              {detailTab === 'production' && (
                <ScriptProductionPanel
                  title="创建制作项目"
                  description="基于最新的剧本版本创建制作，制作将锁定该版本作为来源。"
                >
                  <div className="space-y-2">
                    <ReadinessRow label="剧本分类已设置" done={categoryLabel(selected.script_type) !== '未分类'} />
                    <ReadinessRow label="已有剧本版本" done={versionsForSelected.length > 0} />
                    <ReadinessRow label="最新版本有正文" done={lockedBodyText.length > 0} />
                  </div>
                  {canCreateProduction ? (
                    <Button
                      className="mt-5 w-full justify-center gap-2"
                      loading={createProduction.isPending}
                      onClick={() => createProduction.mutate()}
                    >
                      <Clapperboard size={14} />
                      创建制作项目
                    </Button>
                  ) : (
                    <div className="mt-5 space-y-2">
                      <Button className="w-full justify-center gap-2" disabled>
                        <Clapperboard size={14} />
                        创建制作项目
                      </Button>
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

                  {latestVersion && (
                    <ScriptProductionNotice title="将使用最新版本">
                      <p>
                        v{latestVersion.version_number || latestVersion.ID} · {latestVersion.title} · {formatDate(latestVersion.UpdatedAt)}
                      </p>
                    </ScriptProductionNotice>
                  )}
                </ScriptProductionPanel>
              )}
            </div>
          </>
        )}
          </ScriptWorkspaceMain>

          <ScriptWorkspaceInspector>
            <ScriptCollaborationPanel
              canCreateProduction={canCreateProduction}
              hasDraftBody={hasDraftBody}
              isDraftPublished={isDraftPublished}
              latestVersion={latestVersion}
              linkedSceneMomentCount={linkedSceneMoments.length}
              linkedSegmentCount={linkedSegments.length}
              readiness={selectedReadiness}
              script={selected}
              scriptBlockCount={selectedScriptBlocks.length}
              versionCount={versionsForSelected.length}
              onCreateVersion={() => createVersion.mutate()}
              onLaunchAgent={launchScriptAgent}
              onSetTab={setDetailTab}
            />
          </ScriptWorkspaceInspector>
        </ScriptWorkspaceLayout>

      <ScriptCreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.scripts.createTitle')}>
        <ScriptCreateForm projectId={projectId} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </ScriptCreateDialog>
    </ScriptWorkspaceShell>
  )
}

function ScriptCollaborationPanel({
  canCreateProduction,
  hasDraftBody,
  isDraftPublished,
  latestVersion,
  linkedSceneMomentCount,
  linkedSegmentCount,
  readiness,
  script,
  scriptBlockCount,
  versionCount,
  onCreateVersion,
  onLaunchAgent,
  onSetTab,
}: {
  canCreateProduction: boolean
  hasDraftBody: boolean
  isDraftPublished: boolean
  latestVersion: ScriptVersion | null
  linkedSceneMomentCount: number
  linkedSegmentCount: number
  readiness: number
  script: Script | null
  scriptBlockCount: number
  versionCount: number
  onCreateVersion: () => void
  onLaunchAgent: (mode: 'diagnose' | 'rewrite' | 'breakdown') => void
  onSetTab: (tab: ScriptDetailTab) => void
}) {
  if (!script) {
    return (
      <ScriptCollaborationEmpty icon={Sparkles} title="选择剧本后查看协作状态" />
    )
  }
  const readinessUi = scriptReadinessRecipe(readiness)

  return (
    <ScriptCollaborationStack>
      <ScriptAgentAssistPanel
        icon={Bot}
        title="AI 创意搭档"
        description="围绕当前剧本做审阅、改写和制作拆解，结果回到右侧 AI 面板继续协作。"
        primaryAction={(
          <Button size="sm" className="justify-start gap-2" onClick={() => onLaunchAgent('rewrite')}>
            <Sparkles size={14} />
            协作完善剧本
          </Button>
        )}
        secondaryActions={(
          <>
            <Button variant="outline" size="sm" className="justify-start gap-1.5" onClick={() => onLaunchAgent('diagnose')}>
              <BookOpenCheck size={14} />
              审阅
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-1.5" onClick={() => onLaunchAgent('breakdown')}>
              <Route size={14} />
              拆解
            </Button>
          </>
        )}
      />

      <ScriptReadinessPanel
        title="制作就绪"
        value={readiness}
        status={<StatusBadge {...readinessUi}>{readiness}%</StatusBadge>}
        tone={readinessUi.intent}
        rows={(
          <>
            <ReadinessRow label="有可审正文" done={hasDraftBody} />
            <ReadinessRow label="已锁定版本" done={versionCount > 0} />
            <ReadinessRow label="可创建制作" done={canCreateProduction} />
          </>
        )}
        actions={(
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="justify-start gap-1.5"
              disabled={!hasDraftBody || isDraftPublished}
              onClick={onCreateVersion}
            >
              <GitBranch size={14} />
              锁定当前版本
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-1.5" onClick={() => onSetTab('production')}>
              <Clapperboard size={14} />
              查看制作入口
            </Button>
          </div>
        )}
      />

      <ScriptPipelinePanel
        title="剧本到制作链路"
        metrics={(
          <>
            <ScriptPipelineMetric label="版本" value={versionCount} />
            <ScriptPipelineMetric label="剧本块" value={scriptBlockCount} />
            <ScriptPipelineMetric label="编排段" value={linkedSegmentCount} />
            <ScriptPipelineMetric label="情景" value={linkedSceneMomentCount} />
          </>
        )}
        sourceLabel="当前锁定源"
        sourceValue={latestVersion ? `v${latestVersion.version_number || latestVersion.ID} · ${formatDate(latestVersion.UpdatedAt)}` : '尚无可用于制作的锁定版本'}
      />

      <ScriptWorkflowPanel title="专业工作流">
        <ScriptWorkflowStepUi index="01" title="完善正文" active={!hasDraftBody || !isDraftPublished} />
        <ScriptWorkflowStepUi index="02" title="锁定版本" active={hasDraftBody && versionCount === 0} />
        <ScriptWorkflowStepUi index="03" title="选择文本生成剧本块" active={versionCount > 0 && scriptBlockCount === 0} />
        <ScriptWorkflowStepUi index="04" title="拆成编排段和情景" active={scriptBlockCount > 0 && linkedSceneMomentCount === 0} />
        <ScriptWorkflowStepUi index="05" title="进入制作提案" active={canCreateProduction} />
      </ScriptWorkflowPanel>
    </ScriptCollaborationStack>
  )
}

function ReadinessRow({ label, done }: { label: string; done: boolean }) {
  return (
    <ScriptReadinessRowUi
      done={done}
      label={label}
      status={(
        <StatusBadge {...scriptReadinessItemRecipe(done)} className="gap-1">
          {done ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
          {done ? '就绪' : '待处理'}
        </StatusBadge>
      )}
    />
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

function scriptReadiness(script: Script, versionCount: number, bodyLength: number) {
  let score = 0
  if (script.title.trim()) score += 20
  if (bodyLength > 0) score += 35
  if (versionCount > 0) score += 25
  if (script.summary || script.description || script.plot_summary) score += 20
  return Math.min(100, score)
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
