import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, GitBranch, ScrollText } from 'lucide-react'
import { ScriptDetailHeader, ScriptDetailTabs } from '@movscript/ui/business/scripts'
import { WorkbenchProjectBody, WorkbenchProjectShell } from '@movscript/ui/business/workbench'
import { Badge, Button } from '@movscript/ui/primitives'
import { createScriptVersion, listScriptVersions, type ScriptVersion } from '@/shared/infrastructure/api/scriptVersions'
import type { Script } from '@/types'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import {
  hasExplicitWorkbenchSearchParam,
  useWorkbenchSessionStore,
} from '@/features/project-workbenches/application/workbenchSessionStore'
import {
  ScriptWorkspaceDetailContent,
  ScriptWorkspaceEmptySelection,
  ScriptWorkspaceInspector,
  ScriptWorkspaceShell,
  ScriptWorkspaceStat,
} from '@/features/scripts/components/ScriptsPageUi'
import { ScriptForm } from '@/features/scripts/components/ScriptForm'
import {
  ScriptStageBadge,
  ScriptTypeBadge,
  ScriptVersionManagementPanel,
  type ScriptDetailTab,
} from '@/features/scripts/components/ScriptsPageParts'
import {
  listWorkspaceScripts,
  saveWorkspaceScript,
} from '@/features/scripts/application/scriptWorkspaceRepository'
import { scriptKeys } from '@/features/scripts/application/scriptQueryKeys'
import {
  invalidateScriptMutationResult,
  scriptSavedResult,
  scriptVersionCreatedResult,
} from '@/features/scripts/application/scriptMutationInvalidation'
import { ROUTES } from '@/routes/projectRoutes'
import {
  normalizeComparableScriptText,
  scriptVersionSourceText,
  scriptWorkspaceSourceText,
} from '@/features/scripts/presentation/scriptDisplayModel'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { workspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'

function ScriptsSection({ projectId }: { projectId: number }) {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<ScriptDetailTab>('edit')
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null)
  const [versionEditorScrollTop, setVersionEditorScrollTop] = useState(0)
  const [workspace, setWorkspace] = useState<Partial<Script>>({})
  const restoredSessionRef = useRef(false)
  const sessionSnapshot = useWorkbenchSessionStore((state) => state.snapshotFor(projectId, 'scripts'))
  const upsertWorkbenchSessionSnapshot = useWorkbenchSessionStore((state) => state.upsertSnapshot)
  const hasExplicitSessionSearch = useMemo(
    () => hasExplicitWorkbenchSearchParam(searchParams, ['script_id']),
    [searchParams],
  )
  const currentUser = useUserStore((state) => state.currentUser)
  const currentOrgID = useUserStore((state) => state.currentOrgID)
  const orgMemberships = useUserStore((state) => state.orgMemberships)
  const workspaceContext = useMemo(
    () => workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }),
    [currentOrgID, currentUser?.ID, orgMemberships],
  )

  const { data: rawScripts, isLoading } = useQuery<Script[]>({
    queryKey: scriptKeys.projectScripts(projectId, workspaceContext),
    queryFn: () => listWorkspaceScripts(projectId, workspaceContext),
    enabled: !!projectId,
  })
  const { data: scriptVersions = [] } = useQuery<ScriptVersion[]>({
    queryKey: scriptKeys.versions(projectId),
    queryFn: () => listScriptVersions(projectId),
    enabled: !!projectId,
  })

  const scripts = rawScripts ?? []

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

  useEffect(() => {
    if (!selectedId) return
    upsertWorkbenchSessionSnapshot({
      projectId,
      workbenchId: 'scripts',
      route: ROUTES.project.scripts,
      search: `script_id=${selectedId}`,
      filters: { scriptId: selectedId },
      selection: {
        primary: { entityType: 'script', entityId: selectedId },
      },
    })
  }, [projectId, selectedId, upsertWorkbenchSessionSnapshot])

  const selected = selectedId ? scripts.find((script) => script.ID === selectedId) ?? null : null
  const workspaceSourceText = selected ? scriptWorkspaceSourceText(workspace, selected) : ''
  const workspaceBodyLength = workspaceSourceText.trim().length
  const hasWorkspaceBody = workspaceBodyLength > 0
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
  const readinessChecks = [
    Boolean(selected?.title?.trim()),
    hasWorkspaceBody,
    versionsForSelected.length > 0,
  ]
  const readinessScore = Math.round((readinessChecks.filter(Boolean).length / readinessChecks.length) * 100)

  useEffect(() => {
    if (selected) setWorkspace({ ...selected })
  }, [selected?.ID])

  useEffect(() => {
    setDetailTab('edit')
    setExpandedVersionId(null)
    setVersionEditorScrollTop(0)
  }, [selected?.ID])

  const updateScript = useMutation({
    mutationFn: (data: Partial<Script>) => {
      if (!selected) throw new Error('请选择剧本')
      return saveWorkspaceScript(projectId, selected.ID, data, workspaceContext)
    },
    onSuccess: (updated: Script) => {
      setWorkspace((current) => ({ ...current, ...updated }))
      invalidateScriptMutationResult(qc, scriptSavedResult({ projectId, changedIds: [updated.ID] }))
      toast.success('已保存')
    },
    onError: () => toast.error('保存失败，请重试'),
  })

  const createVersion = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('请选择剧本')
      const saved = await saveWorkspaceScript(projectId, selected.ID, workspace, workspaceContext)
      return createScriptVersion(projectId, {
        script_id: saved.ID,
        parent_version_id: latestVersion?.ID ?? null,
        title: saved.title,
        source_type: saved.source_type ?? 'raw',
        content: saved.content ?? saved.raw_source ?? '',
        raw_source: saved.raw_source ?? saved.content ?? '',
        summary: saved.summary ?? '',
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
      invalidateScriptMutationResult(qc, scriptVersionCreatedResult({ projectId, changedIds: [version.ID] }))
      toast.success('版本已保存')
      setDetailTab('versions')
    },
    onError: () => toast.error('保存版本失败'),
  })

  return (
    <WorkbenchProjectShell
      workbenchId="scripts"
      icon={ScrollText}
      kicker="剧本"
      title="剧本编辑工作台"
      description="以 Markdown 作为正文底稿，集中完成写作、大纲和版本管理。"
    >
      <WorkbenchProjectBody padding="none" scroll="hidden" tone="muted">
        <ScriptWorkspaceShell>
          <div className="script-workbench-layout">
            {isLoading ? (
              <ScriptWorkspaceEmptySelection icon={ScrollText} title="正在读取剧本..." />
            ) : !selected ? (
              <ScriptWorkspaceEmptySelection
                icon={ScrollText}
                title="从项目 Home 选择一份剧本开始创作"
                action={(
                  <Button asChild variant="outline" size="sm">
                    <Link to={ROUTES.project.agent}>返回项目模式</Link>
                  </Button>
                )}
              />
            ) : (
              <main className="script-workbench-main">
                <ScriptDetailHeader
                  className="script-workbench-topbar"
                  badges={(
                    <>
                      <ScriptTypeBadge script={selected} />
                      <ScriptStageBadge versionCount={versionsForSelected.length} />
                      {hasWorkspaceBody ? <Badge variant="outline">{workspaceBodyLength} 字</Badge> : null}
                    </>
                  )}
                  title={selected.title}
                  metrics={(
                    <>
                      <ScriptWorkspaceStat icon={FileText} label="正文" value={`${workspaceBodyLength} 字`} />
                      <ScriptWorkspaceStat icon={GitBranch} label="版本" value={versionsForSelected.length} />
                    </>
                  )}
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
                  className="script-workbench-mode-tabs"
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
                        onCreateVersion={() => createVersion.mutate()}
                        isSaving={updateScript.isPending}
                        isCreatingVersion={createVersion.isPending}
                        isCurrentVersionSaved={isCurrentVersionSaved}
                        versionCount={versionsForSelected.length}
                      />
                    ) : (
                      <ScriptVersionManagementPanel
                        selected={selected}
                        detailTab={detailTab}
                        workspaceBodyLength={workspaceBodyLength}
                        hasWorkspaceBody={hasWorkspaceBody}
                        versionsForSelected={versionsForSelected}
                        latestVersion={latestVersion}
                        isCurrentVersionSaved={isCurrentVersionSaved}
                        readinessScore={readinessScore}
                        createVersionPending={createVersion.isPending}
                        expandedVersionId={expandedVersionId}
                        versionEditorScrollTop={versionEditorScrollTop}
                        onCreateVersion={() => createVersion.mutate()}
                        onDetailTabChange={setDetailTab}
                        onExpandedVersionChange={setExpandedVersionId}
                        onVersionEditorScrollTopChange={setVersionEditorScrollTop}
                      />
                    )}
                  </ScriptWorkspaceDetailContent>
                </ScriptWorkspaceInspector>
              </main>
            )}
          </div>
        </ScriptWorkspaceShell>
      </WorkbenchProjectBody>
    </WorkbenchProjectShell>
  )
}

export default function ScriptsPage() {
  const projectId = useProjectStore((state) => state.current?.ID)

  if (!projectId) return null

  return <ScriptsSection projectId={projectId} />
}
