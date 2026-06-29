import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { WorkbenchProjectBody, WorkbenchProjectShell } from '@movscript/ui/business/workbench'
import { arrayValue, recordValue, stringValue } from '../../data.js'
import { useProjectSurfaceRuntime } from '../../runtime/index.js'
import {
  ProjectStandardsDialog,
  ProjectStandardsDialogBody,
  ProjectStandardsDialogContent,
  ProjectStandardsDialogTitle,
  ProjectStandardsMain,
} from './components/ProjectStandardsUi.js'
import {
  ProjectStandardsLoadingView,
  ProjectStandardsWorkspaceContent,
} from './components/ProjectStandardsPageParts.js'
import { ProjectStandardsWorkspaceReviewPanel } from './components/workspaces/ProjectStandardsWorkspaceReviewPanel.js'
import {
  STYLE_REFERENCE_RULE_KEY,
  buildProjectPromptPreview,
  buildProjectStyleApplyPayload,
  buildStyleReferenceRule,
  coreStandardText,
  emptyData,
  emptyRuleForm,
  extractResourceIds,
  isProjectStandardsWorkspaceHelperWorkspace,
  isRecord,
  normalizeRuleForm,
  parseProjectStandardsWorkspaceArtifact,
  parseProjectStyleRecord,
  parseProjectStyleWorkspaceRows,
  projectPromptRulePayload,
  projectPromptRules,
  projectStandardFilledCount,
  projectStandardMissingLabels,
  projectStandardsWorkspaceDataFromRecords,
  splitListText,
  type CoreStandardDef,
  type ProjectPromptRule,
  type ProjectPromptRuleForm,
  type WorkspaceData,
  type WorkspaceRecord,
} from './application/projectStandardsModel.js'
import {
  CORE_STANDARD_GROUPS,
  coreCards,
  type StandardWorkbenchGroup,
} from './presentation/projectStandardsBoardModel.js'
import type { RawResource, WorkspaceArtifact } from './types.js'

export function ProjectStandardsSurface() {
  const controller = useProjectStandardsSurfaceController()

  return (
    <WorkbenchProjectShell
      workbenchId="project_standards"
      icon={ClipboardList}
      kicker="规范"
      title="项目规范"
      description="集中维护项目画幅、视觉风格、镜头语言、禁忌项和模型提示词规则。"
    >
      <WorkbenchProjectBody padding="none" scroll="auto" tone="muted">
        <ProjectStandardsMain>
          {controller.isLoading ? (
            <ProjectStandardsLoadingView />
          ) : (
            <ProjectStandardsWorkspaceContent
              visibleCustomRules={controller.visibleCustomRules}
              styleReferenceIds={controller.styleReferenceIds}
              standardGroups={controller.standardGroups}
              project={controller.project}
              ruleForm={controller.ruleForm}
              setRuleForm={controller.setRuleForm}
              savingRule={controller.savingRule}
              onSaveRuleForm={controller.saveRuleForm}
              isFetching={controller.isFetching}
              workspaceArtifactsFetching={controller.workspaceArtifactsFetching}
              onRefreshAll={controller.refreshAll}
              projectId={controller.projectId}
              onOpenNewRuleForm={controller.openNewRuleForm}
              editingCoreKey={controller.editingCoreKey}
              coreWorkspaceValue={controller.coreWorkspaceValue}
              onCoreWorkspaceValueChange={controller.setCoreWorkspaceValue}
              savingCoreKey={controller.savingCoreKey}
              onOpenCoreEditor={controller.openCoreEditor}
              onCancelCoreEditor={() => controller.setEditingCoreKey(null)}
              onSaveCoreStandard={controller.saveCoreStandard}
              deletingRuleId={controller.deletingRuleId}
              onToggleRule={controller.toggleRule}
              onOpenEditRuleForm={controller.openEditRuleForm}
              onDeleteRule={controller.deleteRule}
              enabledRuleCount={controller.enabledRuleCount}
              promptPreview={controller.promptPreview}
              styleReferenceInputRef={controller.styleReferenceInputRef}
              uploadingStyleReferences={controller.uploadingStyleReferences}
              onUploadStyleReferenceImages={controller.uploadStyleReferenceImages}
              uploadedStyleReferencesById={controller.uploadedStyleReferencesById}
              deletingStyleReferenceId={controller.deletingStyleReferenceId}
              onRemoveStyleReferenceImage={controller.removeStyleReferenceImage}
              styleReferenceRule={controller.styleReferenceRule}
            />
          )}
        </ProjectStandardsMain>

        <ProjectStandardsDialog open={controller.reviewDialogOpen} onOpenChange={controller.handleReviewDialogOpenChange}>
          <ProjectStandardsDialogContent>
            <ProjectStandardsDialogTitle className="sr-only">项目规范审阅</ProjectStandardsDialogTitle>
            <ProjectStandardsDialogBody>
              <ProjectStandardsWorkspaceReviewPanel
                loading={controller.workspaceArtifactsLoading}
                workspaceCount={controller.workspaceCounts.workspace}
                workspaces={controller.reviewWorkspaceArtifacts}
                applyingWorkspaceId={controller.applyingWorkspaceId}
                onApplyWorkspace={(workspace) => { void controller.applyWorkspace(workspace) }}
              />
            </ProjectStandardsDialogBody>
          </ProjectStandardsDialogContent>
        </ProjectStandardsDialog>
      </WorkbenchProjectBody>
    </WorkbenchProjectShell>
  )
}

function useProjectStandardsSurfaceController() {
  const runtime = useProjectSurfaceRuntime()
  const queryClient = useQueryClient()
  const styleReferenceInputRef = useRef<HTMLInputElement>(null)
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [applyingWorkspaceId, setApplyingWorkspaceId] = useState<string | null>(null)
  const [editingCoreKey, setEditingCoreKey] = useState<string | null>(null)
  const [coreWorkspaceValue, setCoreWorkspaceValue] = useState('')
  const [ruleForm, setRuleForm] = useState<ProjectPromptRuleForm | null>(null)
  const [savingCoreKey, setSavingCoreKey] = useState<string | null>(null)
  const [savingRule, setSavingRule] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [uploadingStyleReferences, setUploadingStyleReferences] = useState(false)
  const [deletingStyleReferenceId, setDeletingStyleReferenceId] = useState<number | null>(null)
  const [lastUploadedStyleReferences, setLastUploadedStyleReferences] = useState<RawResource[]>([])
  const projectQueryKey = ['project-surface', 'standards', runtime.project.projectId, runtime.project.projectDir ?? '']

  const projectQuery = useQuery({
    queryKey: projectQueryKey,
    queryFn: () => readProjectStandardsWorkspaceData(runtime),
    enabled: Boolean(runtime.gateways.project.standardsReadModel && runtime.project.projectDir),
    staleTime: 12_000,
    refetchOnWindowFocus: false,
  })
  const data = projectQuery.data ?? emptyData
  const projectId = numericProjectId(data.project) ?? numericProjectId(runtime.project.projectId) ?? 1

  const saveMutation = useMutation({
    mutationFn: async (input: { projectStyle: Record<string, unknown>; successMessage: string }) => {
      const upsertProjectStandards = runtime.gateways.project.upsertProjectStandards
      if (!upsertProjectStandards) throw new Error('Project standards gateway is not available.')
      await upsertProjectStandards({
        projectId: runtime.project.projectId,
        projectDir: runtime.project.projectDir,
        projectUid: runtime.project.projectUid,
        input: {
          record: data.project ?? undefined,
          projectStyle: projectStandardsPayload({
            currentProject: data.project,
            projectStyle: input.projectStyle,
          }),
        },
      })
      runtime.notifier.success(input.successMessage)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectQueryKey })
    },
    onError: (error) => {
      runtime.notifier.error(errorMessage(error))
    },
  })

  const workspaceArtifacts = useMemo(() => [] as WorkspaceArtifact[], [])
  const reviewWorkspaceArtifacts = useMemo(() => workspaceArtifacts
    .filter((workspace) => !isProjectStandardsWorkspaceHelperWorkspace(workspace))
    .map((workspace) => ({
      workspace,
      workspaceView: parseProjectStandardsWorkspaceArtifact(workspace, undefined),
      styleRows: parseProjectStyleWorkspaceRows(workspace, data.project),
    })), [data.project, workspaceArtifacts])
  const workspaceCounts = useMemo(() => ({
    workspace: reviewWorkspaceArtifacts.filter((item) => item.workspace.status === 'workspace').length,
    applied: reviewWorkspaceArtifacts.filter((item) => item.workspace.status === 'applied').length,
  }), [reviewWorkspaceArtifacts])
  const customRules = useMemo(() => projectPromptRules(data.project), [data.project])
  const visibleCustomRules = customRules.filter((rule) => rule.key !== STYLE_REFERENCE_RULE_KEY)
  const enabledCustomRules = visibleCustomRules.filter((rule) => rule.enabled)
  const filledStandardCount = projectStandardFilledCount(data.project)
  const enabledRuleCount = filledStandardCount + enabledCustomRules.length
  const promptPreview = useMemo(() => buildProjectPromptPreview(data.project), [data.project])
  const styleReferenceRule = customRules.find((rule) => rule.key === STYLE_REFERENCE_RULE_KEY)
  const styleReferenceIds = useMemo(() => extractResourceIds(styleReferenceRule?.value ?? ''), [styleReferenceRule?.value])
  const uploadedStyleReferencesById = useMemo(() => new Map(lastUploadedStyleReferences.map((resource) => [resource.ID, resource])), [lastUploadedStyleReferences])
  const standardGroups = useMemo<StandardWorkbenchGroup[]>(() => {
    const groups: StandardWorkbenchGroup[] = CORE_STANDARD_GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      description: group.description,
      cards: coreCards(group.coreKeys),
    }))
    if (visibleCustomRules.length > 0) {
      groups.push({
        id: 'custom',
        title: '自定义规范',
        description: '补充角色、台词、平台禁忌、审核口径等项目级规则。',
        cards: visibleCustomRules.map((rule) => ({ type: 'custom' as const, rule })),
      })
    }
    return groups
  }, [visibleCustomRules])

  function refreshAll() {
    void projectQuery.refetch()
  }

  async function saveProjectStylePatch(projectStyle: Record<string, unknown>, successMessage: string) {
    await saveMutation.mutateAsync({ projectStyle, successMessage })
  }

  function openCoreEditor(key: string) {
    setEditingCoreKey(key)
    setCoreWorkspaceValue(coreStandardText(data.project, key))
  }

  async function saveCoreStandard(def: CoreStandardDef) {
    setSavingCoreKey(def.key)
    try {
      const value = def.list ? splitListText(coreWorkspaceValue) : coreWorkspaceValue.trim()
      await saveProjectStylePatch({ [def.key]: value }, '核心规范已保存')
      setEditingCoreKey(null)
      setCoreWorkspaceValue('')
    } finally {
      setSavingCoreKey(null)
    }
  }

  function openNewRuleForm() {
    setRuleForm({ ...emptyRuleForm })
  }

  function openEditRuleForm(rule: ProjectPromptRule) {
    setRuleForm({
      id: rule.id,
      key: rule.key,
      label: rule.label,
      category: rule.category,
      value: rule.value,
      prompt_role: rule.prompt_role,
      enabled: rule.enabled,
      required: rule.required,
    })
  }

  async function saveRuleForm() {
    if (!ruleForm) return
    const normalized = normalizeRuleForm(ruleForm, ruleForm.id
      ? customRules.find((rule) => rule.id === ruleForm.id)?.order ?? (customRules.length + 1) * 10
      : (customRules.length + 1) * 10)
    if (!normalized.value) {
      runtime.notifier.error('请填写规范内容')
      return
    }
    setSavingRule(true)
    try {
      const exists = customRules.some((rule) => rule.id === normalized.id)
      const nextRules = exists
        ? customRules.map((rule) => rule.id === normalized.id ? normalized : rule)
        : [...customRules, normalized]
      await saveProjectStylePatch({ custom_rules: projectPromptRulePayload(nextRules) }, exists ? '扩展规范已更新' : '扩展规范已新增')
      setRuleForm(null)
    } finally {
      setSavingRule(false)
    }
  }

  async function toggleRule(rule: ProjectPromptRule) {
    const nextRules = customRules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item)
    await saveProjectStylePatch({ custom_rules: projectPromptRulePayload(nextRules) }, rule.enabled ? '规范已停用' : '规范已启用')
  }

  async function deleteRule(rule: ProjectPromptRule) {
    setDeletingRuleId(rule.id)
    try {
      const nextRules = customRules.filter((item) => item.id !== rule.id)
      await saveProjectStylePatch({ custom_rules: projectPromptRulePayload(nextRules) }, '扩展规范已删除')
      if (ruleForm?.id === rule.id) setRuleForm(null)
    } finally {
      setDeletingRuleId(null)
    }
  }

  async function uploadStyleReferenceImages(files: FileList | null) {
    if (!files || files.length === 0) return
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      runtime.notifier.error('请选择图片文件')
      return
    }
    const upload = runtime.gateways.resources?.upload
    if (!upload) {
      runtime.notifier.warning('当前 Surface runtime 尚未提供资源上传网关')
      return
    }
    setUploadingStyleReferences(true)
    try {
      const uploaded: RawResource[] = []
      for (const file of imageFiles) {
        const formData = new FormData()
        formData.append('file', file)
        uploaded.push(normalizeUploadedResource(await upload(formData), file))
      }
      const existingIds = extractResourceIds(styleReferenceRule?.value ?? '')
      const nextRule = buildStyleReferenceRule([
        ...existingIds,
        ...uploaded.map((resource) => resource.ID),
      ], styleReferenceRule)
      const nextRules = styleReferenceRule
        ? customRules.map((rule) => rule.id === styleReferenceRule.id ? nextRule : rule)
        : [nextRule, ...customRules]
      setLastUploadedStyleReferences((current) => {
        const byId = new Map(current.map((resource) => [resource.ID, resource]))
        for (const resource of uploaded) byId.set(resource.ID, resource)
        return Array.from(byId.values())
      })
      await saveProjectStylePatch({ custom_rules: projectPromptRulePayload(nextRules) }, `已上传 ${uploaded.length} 张画风参考图`)
    } finally {
      setUploadingStyleReferences(false)
      if (styleReferenceInputRef.current) styleReferenceInputRef.current.value = ''
    }
  }

  async function removeStyleReferenceImage(resourceId: number) {
    if (!styleReferenceRule) return
    setDeletingStyleReferenceId(resourceId)
    try {
      const nextIds = extractResourceIds(styleReferenceRule.value).filter((id) => id !== resourceId)
      const nextRules = nextIds.length > 0
        ? customRules.map((rule) => rule.id === styleReferenceRule.id ? buildStyleReferenceRule(nextIds, styleReferenceRule) : rule)
        : customRules.filter((rule) => rule.id !== styleReferenceRule.id)
      await saveProjectStylePatch({ custom_rules: projectPromptRulePayload(nextRules) }, '风格图片已移出项目规范')
      setLastUploadedStyleReferences((current) => current.filter((resource) => resource.ID !== resourceId))
    } finally {
      setDeletingStyleReferenceId(null)
    }
  }

  async function applyWorkspace(workspace: WorkspaceArtifact) {
    if (workspace.kind !== 'project_standards_workspace') return
    setApplyingWorkspaceId(workspace.id)
    try {
      const proposedValue = buildProjectStyleApplyPayload(workspace)
      const parsedWorkspace = JSON.parse(proposedValue) as Record<string, unknown>
      const workspacePayload = isRecord(parsedWorkspace.workspace) ? parsedWorkspace.workspace : {}
      await saveProjectStylePatch(
        isRecord(workspacePayload.project_style) ? workspacePayload.project_style : {},
        '项目规范已写入工作区',
      )
    } finally {
      setApplyingWorkspaceId(null)
    }
  }

  return {
    applyingWorkspaceId,
    coreWorkspaceValue,
    deleteRule,
    deletingRuleId,
    deletingStyleReferenceId,
    editingCoreKey,
    enabledCustomRules,
    enabledRuleCount,
    filledStandardCount,
    handleReviewDialogOpenChange: setReviewDialogOpen,
    isFetching: projectQuery.isFetching,
    isLoading: projectQuery.isLoading,
    missingStandardLabels: projectStandardMissingLabels(data.project),
    openCoreEditor,
    openEditRuleForm,
    openNewRuleForm,
    project: data.project,
    projectId,
    promptPreview,
    refreshAll,
    removeStyleReferenceImage,
    reviewDialogOpen,
    reviewWorkspaceArtifacts,
    ruleForm,
    saveCoreStandard,
    saveRuleForm,
    savingCoreKey,
    savingRule,
    setCoreWorkspaceValue,
    setEditingCoreKey,
    setReviewDialogOpen,
    setRuleForm,
    standardGroups,
    statusSummary: `${filledStandardCount}/8 项核心 · ${visibleCustomRules.length} 条自定义 · ${styleReferenceIds.length} 张风格图 · ${workspaceCounts.workspace} 个待审阅工作区`,
    styleReferenceIds,
    styleReferenceInputRef,
    styleReferenceRule,
    toggleRule,
    uploadStyleReferenceImages,
    uploadedStyleReferencesById,
    uploadingStyleReferences,
    visibleCustomRules,
    workspaceArtifactsFetching: false,
    workspaceArtifactsLoading: false,
    workspaceCounts,
    applyWorkspace,
  }
}

async function readProjectStandardsWorkspaceData(runtime: ReturnType<typeof useProjectSurfaceRuntime>): Promise<WorkspaceData> {
  const standardsReadModel = runtime.gateways.project.standardsReadModel
  if (!standardsReadModel) throw new Error('Project runtime standards read-model gateway is not available.')
  const response = await standardsReadModel({
    projectId: runtime.project.projectId,
    projectDir: runtime.project.projectDir,
    projectUid: runtime.project.projectUid,
  })
  const model = readModelPayload(response)
  return projectStandardsWorkspaceDataFromRecords({
    project: recordValue(model.project) as WorkspaceRecord | null ?? null,
    settings: recordsFromReadModel(model.settings),
    assetSlots: recordsFromReadModel(model.assetSlots),
    productions: recordsFromReadModel(model.productions),
    segments: recordsFromReadModel(model.segments),
    sceneMoments: recordsFromReadModel(model.sceneMoments),
    contentUnits: recordsFromReadModel(model.contentUnits),
    creativeRelationships: recordsFromReadModel(model.creativeRelationships),
    settingUsages: recordsFromReadModel(model.settingUsages),
    assetSlotCandidates: recordsFromReadModel(model.assetSlotCandidates),
  })
}

function readModelPayload(value: unknown): Record<string, unknown> {
  const record = recordValue(value) ?? {}
  return recordValue(record.projectStandardsReadModel) ?? record
}

function recordsFromReadModel(value: unknown): WorkspaceRecord[] {
  return arrayValue(value)
    .map((item) => recordValue(item))
    .filter((item): item is WorkspaceRecord => Boolean(item))
}

function projectStandardsPayload(input: {
  currentProject?: WorkspaceRecord | null
  projectStyle: Record<string, unknown>
}): Record<string, unknown> {
  const currentStyle = parseProjectStyleRecord(input.currentProject)
  const projectStyle = {
    ...currentStyle,
    ...input.projectStyle,
  }
  return {
    aspect_ratio: stringValue(projectStyle.aspect_ratio) ?? stringValue(input.currentProject?.aspect_ratio) ?? '',
    visual_style: stringValue(projectStyle.visual_style) ?? stringValue(input.currentProject?.visual_style) ?? '',
    project_style: JSON.stringify(projectStyle),
  }
}

function normalizeUploadedResource(value: unknown, file: File): RawResource {
  const record = recordValue(recordValue(value)?.resource ?? value) ?? {}
  const id = Number(record.ID ?? record.id ?? Date.now())
  return {
    ...record,
    ID: Number.isFinite(id) ? id : Date.now(),
    name: stringValue(record.name ?? record.title) ?? file.name,
    ...(stringValue(record.url ?? record.file_url ?? record.thumbnail_url)
      ? {}
      : { url: URL.createObjectURL(file) }),
  }
}

function numericProjectId(value: unknown): number | undefined {
  const raw = recordValue(value)?.ID ?? recordValue(value)?.id ?? value
  const id = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(id) && id > 0 ? id : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
