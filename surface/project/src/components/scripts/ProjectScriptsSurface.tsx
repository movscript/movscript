import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Save, ScrollText, Upload } from 'lucide-react'
import { WorkbenchProjectBody, WorkbenchProjectShell } from '@movscript/ui/business/workbench'
import { Badge, Button } from '@movscript/ui/primitives'
import { arrayValue, recordValue, stringValue } from '../../data.js'
import { useProjectSurfaceRuntime } from '../../runtime/index.js'
import type { ProjectSurfaceRuntime } from '../../runtime/index.js'
import { ScriptForm } from './ScriptForm.js'
import {
  ScriptStageBadge,
  ScriptTypeBadge,
  ScriptVersionManagementPanel,
  type ScriptDetailTab,
} from './ScriptsPageParts.js'
import {
  ScriptDetailHeader,
  ScriptDetailTabs,
  ScriptEditorErrorText,
  ScriptEditorHiddenFileInput,
  ScriptEditorInlineMeta,
  ScriptWorkspaceDetailContent,
  ScriptWorkspaceEmptySelection,
  ScriptWorkspaceInspector,
  ScriptWorkspaceShell,
} from './ScriptsPageUi.js'
import {
  normalizeComparableScriptText,
  scriptVersionSourceText,
  scriptWorkspaceSourceText,
} from './scriptDisplayModel.js'
import type { Script, ScriptVersion } from './types.js'

const SCRIPT_DOCUMENT_ACCEPT = '.txt,.md,.markdown,text/plain,text/markdown'

export interface ProjectScriptsSurfaceProps {
  params?: URLSearchParams
}

export function ProjectScriptsSurface({ params }: ProjectScriptsSurfaceProps = {}) {
  const runtime = useProjectSurfaceRuntime()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const requestedScriptId = useMemo(() => selectedScriptIdFromSearchParams(params), [params])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<ScriptDetailTab>('edit')
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null)
  const [versionEditorScrollTop, setVersionEditorScrollTop] = useState(0)
  const [workspace, setWorkspace] = useState<Partial<Script>>({})
  const [workspaceDirty, setWorkspaceDirty] = useState(false)
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')

  const scriptsQuery = useQuery({
    queryKey: ['project-surface', 'scripts-read-model', runtime.project.projectId, runtime.project.projectDir ?? ''],
    queryFn: () => loadProjectScriptsReadModel(runtime),
    enabled: Boolean((runtime.gateways.project.scriptsReadModel || runtime.gateways.project.resourceView) && runtime.project.projectDir),
  })

  const scripts = scriptsQuery.data?.scripts ?? []

  useEffect(() => {
    if (scripts.length === 0) return
    const requested = requestedScriptId
      ? scripts.find((script) => script.ID === requestedScriptId)
      : undefined
    setSelectedId(requested?.ID ?? scripts[0]?.ID ?? null)
  }, [requestedScriptId, scripts])

  const selected = selectedId ? scripts.find((script) => script.ID === selectedId) ?? null : null
  const selectedSourceQuery = useQuery({
    queryKey: [
      'project-surface',
      'script-source',
      runtime.project.projectId,
      runtime.project.projectDir ?? '',
      selected ? scriptStableKey(selected) : '',
      selected ? scriptWorkspacePath(selected) ?? '' : '',
    ],
    queryFn: () => readSelectedScriptSource(runtime, selected),
    enabled: Boolean(selected && runtime.project.projectDir),
  })
  const scriptVersions = scriptsQuery.data?.versions ?? []
  const versionsForSelected = useMemo(() => {
    if (!selected) return []
    return scriptVersions
      .filter((version) => scriptVersionMatchesScript(version, selected))
      .slice()
      .sort((a, b) => (b.version_number || b.ID) - (a.version_number || a.ID) || b.ID - a.ID)
  }, [scriptVersions, selected])
  const latestVersion = versionsForSelected[0] ?? null
  const workspaceSourceText = selected ? scriptWorkspaceSourceText(workspace, selected) : ''
  const workspaceBodyLength = workspaceSourceText.trim().length
  const hasWorkspaceBody = workspaceBodyLength > 0
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
    if (selected) {
      const source = scriptInlineSourceText(selected)
      setWorkspace({
        ...selected,
        ...(source !== undefined ? { content: source, raw_source: source } : {}),
      })
      setWorkspaceDirty(false)
      setFileName('')
      setFileError('')
    }
  }, [selected?.ID])

  useEffect(() => {
    if (!selected || selectedSourceQuery.data === undefined || workspaceDirty) return
    setWorkspace((current) => {
      if (scriptStableKey(current) !== scriptStableKey(selected)) return current
      return {
        ...current,
        content: selectedSourceQuery.data,
        raw_source: selectedSourceQuery.data,
      }
    })
  }, [selected, selectedSourceQuery.data, workspaceDirty])

  useEffect(() => {
    setDetailTab('edit')
    setExpandedVersionId(null)
    setVersionEditorScrollTop(0)
  }, [selected?.ID])

  const updateScript = useMutation({
    mutationFn: (data: Partial<Script>) => {
      if (!selected) throw new Error('请选择手记')
      return saveWorkspaceScript(selected, data)
    },
    onSuccess: async (updated) => {
      setWorkspace((current) => ({ ...current, ...updated }))
      setWorkspaceDirty(false)
      runtime.notifier.success('已保存')
      await invalidateScripts(queryClient, runtime.project.projectId, runtime.project.projectDir)
    },
    onError: (error) => runtime.notifier.error('保存失败', errorMessage(error)),
  })

  const createVersion = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('请选择手记')
      const saved = await saveWorkspaceScript(selected, workspace)
      const snapshotScriptVersionFromMarkdown = runtime.gateways.project.snapshotScriptVersionFromMarkdown
      if (!snapshotScriptVersionFromMarkdown) throw new Error('Project script version gateway is not available.')
      const versionNumber = nextVersionNumber(versionsForSelected)
      const versionId = `v${versionNumber}`
      await snapshotScriptVersionFromMarkdown({
        projectId: runtime.project.projectId,
        projectDir: runtime.project.projectDir,
        projectUid: runtime.project.projectUid,
        input: {
          scriptId: String(saved.id ?? saved.ID),
          versionId,
          versionLabel: `V${versionNumber}`,
        },
      })
      return saved
    },
    onSuccess: async (saved) => {
      setWorkspace((current) => ({ ...current, ...saved }))
      setWorkspaceDirty(false)
      runtime.notifier.success('版本已保存')
      await invalidateScripts(queryClient, runtime.project.projectId, runtime.project.projectDir)
      setDetailTab('versions')
    },
    onError: (error) => runtime.notifier.error('保存版本失败', errorMessage(error)),
  })

  async function saveWorkspaceScript(selectedScript: Script, data: Partial<Script>): Promise<Script> {
    const upsertScript = runtime.gateways.project.upsertScript
    if (!upsertScript) throw new Error('Project script gateway is not available.')
    if (!runtime.project.projectDir) throw new Error('Project directory is not configured for this surface.')
    const sourceText = scriptWorkspaceSourceText(data, selectedScript)
    const metadata = {
      ...(selectedScript.record ?? {}),
      ...data,
      id: String(selectedScript.id ?? selectedScript.ID),
      ID: selectedScript.ID,
      title: data.title ?? selectedScript.title,
      content: sourceText,
      raw_source: sourceText,
    }
    const result = await upsertScript({
      projectId: runtime.project.projectId,
      projectDir: runtime.project.projectDir,
      projectUid: runtime.project.projectUid,
      input: {
        scriptId: String(selectedScript.id ?? selectedScript.ID),
        record: selectedScript.record ?? null,
        sourceText,
        metadata,
      },
    })
    const record = recordValue(recordValue(result)?.record ?? result) ?? metadata
    return scriptFromRecord(record, sourceText, selectedScript.ID)
  }

  async function handleFile(file?: File) {
    if (!file) return
    setFileError('')
    try {
      const text = await file.text()
      setFileName(file.name)
      setWorkspaceDirty(true)
      setWorkspace((current) => ({ ...current, raw_source: text, content: text }))
    } catch (error) {
      setFileError(errorMessage(error) || '读取文档失败')
    }
  }

  return (
    <WorkbenchProjectShell
      className="script-workbench-project-shell"
      workbenchId="orchestration_production"
      icon={ScrollText}
      kicker="手记"
      title="创作手记"
      description="以 Markdown 记录创作底稿，集中完成写作、大纲和版本管理。"
    >
      <WorkbenchProjectBody padding="none" scroll="hidden" tone="muted">
        <ScriptWorkspaceShell>
          <div className="script-workbench-layout">
            {scriptsQuery.isLoading ? (
              <ScriptWorkspaceEmptySelection icon={ScrollText} title="正在读取手记..." />
            ) : scriptsQuery.error ? (
              <ScriptWorkspaceEmptySelection icon={ScrollText} title={errorMessage(scriptsQuery.error)} />
            ) : !selected ? (
              <ScriptWorkspaceEmptySelection icon={ScrollText} title="当前项目还没有手记" />
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
                  actions={(
                    <>
                      <ScriptDetailTabs
                        className="script-workbench-mode-tabs"
                        tabs={[
                          { key: 'edit', label: '正文' },
                          { key: 'versions', label: `版本 ${versionsForSelected.length}` },
                        ]}
                        activeKey={detailTab}
                        onSelect={(key) => setDetailTab(key as ScriptDetailTab)}
                      />
                      <ScriptEditorHiddenFileInput
                        ref={fileInputRef}
                        type="file"
                        accept={SCRIPT_DOCUMENT_ACCEPT}
                        onChange={(event) => {
                          void handleFile(event.target.files?.[0])
                          event.currentTarget.value = ''
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload size={14} />
                        导入文档
                      </Button>
                      {fileName && <ScriptEditorInlineMeta>{fileName}</ScriptEditorInlineMeta>}
                      {selectedSourceQuery.isLoading && <ScriptEditorInlineMeta>正文读取中</ScriptEditorInlineMeta>}
                      {fileError && <ScriptEditorErrorText>{fileError}</ScriptEditorErrorText>}
                      {selectedSourceQuery.error && <ScriptEditorErrorText>{errorMessage(selectedSourceQuery.error)}</ScriptEditorErrorText>}
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => updateScript.mutate(workspace)}
                        disabled={updateScript.isPending || selectedSourceQuery.isLoading}
                      >
                        <Save size={14} />
                        {updateScript.isPending ? '保存中' : '保存'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setDetailTab('versions')}
                      >
                        <GitBranch size={14} />
                        版本管理
                      </Button>
                    </>
                  )}
                />

                <ScriptWorkspaceInspector className={detailTab === 'edit' ? 'script-workbench-inspector--editor' : undefined}>
                  <ScriptWorkspaceDetailContent className={detailTab === 'edit' ? 'script-workbench-detail-content--editor' : undefined}>
                    {detailTab === 'edit' ? (
                      <ScriptForm
                        script={selected}
                        workspace={workspace}
                        onChange={(next) => {
                          setWorkspaceDirty(true)
                          setWorkspace(next)
                        }}
                        onCreateVersion={() => createVersion.mutate()}
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

function selectedScriptIdFromSearchParams(searchParams: URLSearchParams | undefined): number | null {
  const value = searchParams?.get('script_id')
  return numberValue(value) ?? null
}

interface ProjectScriptsReadModelData {
  scripts: Script[]
  versions: ScriptVersion[]
}

async function loadProjectScriptsReadModel(runtime: ProjectSurfaceRuntime): Promise<ProjectScriptsReadModelData> {
  const scriptsReadModel = runtime.gateways.project.scriptsReadModel
  if (scriptsReadModel) {
    const response = await scriptsReadModel({
      projectId: runtime.project.projectId,
      projectDir: runtime.project.projectDir,
      projectUid: runtime.project.projectUid,
    })
    const payload = recordValue(response)
    const model = recordValue(payload?.projectScriptsReadModel ?? response) ?? {}
    return {
      scripts: arrayValue(model.scripts).map((item, index) => scriptFromResource(item, index)),
      versions: arrayValue(model.versions ?? model.scriptVersions ?? model.script_versions)
        .map((item, index) => scriptVersionFromResource(item, index)),
    }
  }
  return loadProjectScriptsResourceViewFallback(runtime)
}

async function loadProjectScriptsResourceViewFallback(runtime: ProjectSurfaceRuntime): Promise<ProjectScriptsReadModelData> {
  const resourceView = runtime.gateways.project.resourceView
  if (!resourceView) throw new Error('Project runtime scripts read-model gateway is not available.')
  const scriptsResponse = await resourceView({
    projectId: runtime.project.projectId,
    projectDir: runtime.project.projectDir,
    projectUid: runtime.project.projectUid,
    kind: 'scripts',
  })
  const versions = await resourceView({
    projectId: runtime.project.projectId,
    projectDir: runtime.project.projectDir,
    projectUid: runtime.project.projectUid,
    kind: 'script-versions',
  }).then((response) => arrayValue(recordValue(response)?.items).map((item, index) => scriptVersionFromResource(item, index)))
    .catch((error) => {
      if (errorMessage(error).includes('unsupported project resource kind')) return []
      throw error
    })
  return {
    scripts: arrayValue(recordValue(scriptsResponse)?.items).map((item, index) => scriptFromResource(item, index)),
    versions,
  }
}

async function readSelectedScriptSource(runtime: ProjectSurfaceRuntime, selected: Script | null): Promise<string> {
  if (!selected) return ''
  const inlineSource = scriptInlineSourceText(selected)
  if (inlineSource !== undefined) return inlineSource
  const readScriptSource = runtime.gateways.project.readScriptSource
  if (!readScriptSource) throw new Error('Project script source gateway is not available.')
  const response = await readScriptSource({
    projectId: runtime.project.projectId,
    projectDir: runtime.project.projectDir,
    projectUid: runtime.project.projectUid,
    input: {
      record: scriptSourceReadRecord(selected),
    },
  })
  return scriptSourceTextFromGatewayResult(response)
}

function scriptSourceReadRecord(script: Script): Record<string, unknown> {
  return {
    ...(script.record ?? {}),
    id: script.id ?? script.ID,
    ID: script.ID,
    title: script.title,
    source_ref: stringValue(script.record?.source_ref ?? script.record?.sourceRef) ?? 'script.md',
    ...((script.record?.__workspace_path ?? script.record?.path) ? {
      __workspace_path: script.record.__workspace_path ?? script.record.path,
    } : {}),
  }
}

function scriptSourceTextFromGatewayResult(response: unknown): string {
  const record = recordValue(response)
  return rawStringValue(record?.result ?? response) ?? ''
}

function scriptInlineSourceText(script: Partial<Script>): string | undefined {
  const record = script.record ?? {}
  const sourceLoaded = record.sourceLoaded === true
    || record.source_loaded === true
    || record.source !== undefined
    || record.content !== undefined
    || record.raw_source !== undefined
  const source = rawStringValue(script.content ?? script.raw_source ?? record.content ?? record.raw_source ?? record.source)
  if (!sourceLoaded && source === '') return undefined
  return source
}

function scriptWorkspacePath(script: Partial<Script>): string | undefined {
  return stringValue(script.record?.__workspace_path ?? script.record?.path)
}

function scriptStableKey(script: Partial<Script>): string {
  return stringValue(script.id)
    ?? stringValue(script.record?.id)
    ?? stringValue(script.record?.__workspace_path)
    ?? (numberValue(script.ID) !== undefined ? String(script.ID) : 'script')
}

function scriptFromResource(item: unknown, index: number): Script {
  const record = recordValue(item) ?? {}
  const source = rawStringValue(record.source ?? record.content ?? record.raw_source) ?? ''
  return scriptFromRecord(record, source, index + 1)
}

function scriptFromRecord(record: Record<string, unknown>, source: string, fallbackId: number): Script {
  const id = numberValue(record.ID ?? record.id) ?? numericSuffix(record.id) ?? fallbackId
  return {
    ID: id,
    id: stringValue(record.id) ?? String(id),
    project_id: numberValue(record.project_id) ?? 0,
    title: stringValue(record.title ?? record.name) ?? `手记 #${id}`,
    description: stringValue(record.description) ?? '',
    content: source,
    raw_source: source,
    script_type: stringValue(record.script_type ?? record.script_kind) ?? 'uncategorized',
    source_type: scriptSourceType(record.source_type),
    version: numberValue(record.version),
    parent_script_id: numberValue(record.parent_script_id),
    assignee_id: numberValue(record.assignee_id),
    author_id: numberValue(record.author_id) ?? 0,
    order: numberValue(record.order) ?? 0,
    summary: stringValue(record.summary) ?? '',
    characters: stringValue(record.characters) ?? '',
    character_profiles: stringValue(record.character_profiles),
    character_relationships: stringValue(record.character_relationships),
    core_settings: stringValue(record.core_settings) ?? '',
    background: stringValue(record.background) ?? '',
    scenes_desc: stringValue(record.scenes_desc) ?? '',
    hook: stringValue(record.hook) ?? '',
    plot_summary: stringValue(record.plot_summary) ?? '',
    script_points: stringValue(record.script_points),
    planned_scene_count: numberValue(record.planned_scene_count),
    planned_character_count: numberValue(record.planned_character_count),
    time_text: stringValue(record.time_text),
    location_text: stringValue(record.location_text),
    structured_characters: stringValue(record.structured_characters),
    plot_beats: stringValue(record.plot_beats),
    atmosphere: stringValue(record.atmosphere),
    structure_json: stringValue(record.structure_json),
    entity_candidates: stringValue(record.entity_candidates),
    relationship_candidates: stringValue(record.relationship_candidates),
    CreatedAt: stringValue(record.CreatedAt ?? record.created_at) ?? '',
    UpdatedAt: stringValue(record.UpdatedAt ?? record.updated_at) ?? '',
    record,
  }
}

function scriptVersionFromResource(item: unknown, index: number): ScriptVersion {
  const record = recordValue(item) ?? {}
  const id = numberValue(record.ID ?? record.version_number ?? record.id) ?? numericSuffix(record.id) ?? index + 1
  return {
    ID: id,
    id: stringValue(record.id) ?? String(id),
    script_id: numberValue(record.script_id ?? record.scriptId ?? record.script_ref ?? record.scriptRef) ?? numericSuffix(record.script_id ?? record.script_ref) ?? 0,
    version_number: numberValue(record.version_number) ?? numericSuffix(record.id) ?? id,
    version_label: stringValue(record.version_label ?? record.versionLabel),
    title: stringValue(record.title) ?? `版本 #${id}`,
    source_type: stringValue(record.source_type),
    content: rawStringValue(record.content ?? record.raw_source ?? record.source),
    raw_source: rawStringValue(record.raw_source ?? record.content ?? record.source),
    summary: stringValue(record.summary) ?? '',
    CreatedAt: stringValue(record.CreatedAt ?? record.created_at) ?? '',
    UpdatedAt: stringValue(record.UpdatedAt ?? record.updated_at) ?? '',
    record,
  }
}

function scriptVersionMatchesScript(version: ScriptVersion, script: Script): boolean {
  if (version.script_id === script.ID) return true
  const versionRecord = version.record ?? {}
  const scriptRef = stringValue(versionRecord.script_id ?? versionRecord.scriptId ?? versionRecord.script_ref ?? versionRecord.scriptRef)
  return Boolean(scriptRef && (scriptRef === script.id || scriptRef === String(script.ID) || scriptRef.endsWith(`/${script.id}`)))
}

function nextVersionNumber(versions: ScriptVersion[]): number {
  return versions.reduce((max, version) => Math.max(max, version.version_number ?? version.ID), 0) + 1
}

function rawStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  const record = recordValue(value)
  if (!record) return undefined
  return stringValue(record.text ?? record.sourceText ?? record.raw ?? record.content)
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
  return undefined
}

function numericSuffix(value: unknown): number | undefined {
  const text = typeof value === 'string' ? value : undefined
  const match = text?.match(/(\d+)(?!.*\d)/)
  return match ? numberValue(match[1]) : undefined
}

function scriptSourceType(value: unknown): Script['source_type'] {
  return value === 'raw' || value === 'adapted' || value === 'revised' ? value : 'raw'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function invalidateScripts(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string | number,
  projectDir?: string,
) {
  await queryClient.invalidateQueries({
    queryKey: ['project-surface', 'scripts-read-model', projectId, projectDir ?? ''],
  })
  await queryClient.invalidateQueries({
    queryKey: ['project-surface', 'script-source', projectId, projectDir ?? ''],
  })
  await queryClient.invalidateQueries({
    queryKey: ['project-surface', 'scripts', projectId, projectDir ?? ''],
  })
}
