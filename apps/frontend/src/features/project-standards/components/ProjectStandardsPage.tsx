import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ProjectStandardsDialog,
  ProjectStandardsDialogBody,
  ProjectStandardsDialogContent,
  ProjectStandardsDialogTitle,
  ProjectStandardsMain,
} from '@/features/project-standards/components/ProjectStandardsUi'
import { WorkbenchProjectBody, WorkbenchProjectShell } from '@movscript/ui/business/workbench'
import { getProject } from '@/shared/infrastructure/api/semanticEntities'
import {
  ProjectStandardsLoadingView,
  ProjectStandardsWorkspaceContent,
} from '@/features/project-standards/components/ProjectStandardsPageParts'
import { ProjectStandardsWorkspaceReviewPanel } from '@/features/project-standards/components/workspaces/ProjectStandardsWorkspaceReviewPanel'
import { saveProjectStandardsWorkspaceEdit } from '@/features/project-standards/application/projectStandardsWorkspaceRepository'
import { projectStandardsKeys } from '@/features/project-standards/application/projectStandardsQueryKeys'
import { useProjectEntryShellProps } from '@/features/project/application/useProjectEntryShellProps'
import { buildPageKey } from '@/features/agent/domain/agentCommandInput'
import {
  STYLE_REFERENCE_RULE_KEY,
  buildProjectPromptPreview,
  buildProjectStyleApplyPayload,
  coreStandardText,
  emptyData,
  emptyRuleForm,
  extractResourceIds,
  isProjectStandardsWorkspaceHelperWorkspace,
  isRecord,
  loadProjectStandardsWorkspaceData,
  normalizeRuleForm,
  parseProjectStandardsWorkspaceArtifact,
  parseProjectStyleWorkspaceRows,
  projectPromptRulePayload,
  projectPromptRules,
  projectStandardFilledCount,
  projectStandardMissingLabels,
  splitListText,
  type CoreStandardDef,
  type ProjectPromptRule,
  type ProjectPromptRuleForm,
} from '@/features/project-standards/application/projectStandardsModel'
import {
  buildProjectStandardsStyleReferenceRemovalPatch,
  uploadProjectStandardsStyleReferenceImages,
} from '@/features/project-standards/application/projectStandardsStyleReferenceUpload'
import {
  listProjectStandardsWorkspaceArtifacts,
  updateProjectStandardsWorkspaceArtifact,
  type ProjectStandardsWorkspaceArtifact,
} from '@/features/project-standards/application/projectStandardsWorkspaceArtifactService'
import {
  CORE_STANDARD_GROUPS,
  coreCards,
  type StandardWorkbenchGroup,
} from '@/features/project-standards/presentation/projectStandardsBoardModel'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import { ROUTES } from '@/routes/projectRoutes'
import type { RawResource } from '@/types'

export default function ProjectStandardsPage() {
  const project = useProjectStore((s) => s.current)
  const entryShellProps = useProjectEntryShellProps({
    projectEntryId: 'project_standards',
    projectName: project?.name,
    kicker: '项目规范',
    title: '项目规范',
    description: '集中查看和调整项目会遵守的制作规范，并预览最终注入模型的提示词与风格参考。',
  })

  return (
    <WorkbenchProjectShell {...entryShellProps}>
      <WorkbenchProjectBody padding="none" scroll="auto" tone="muted">
        <ProjectStandardsContent />
      </WorkbenchProjectBody>
    </WorkbenchProjectShell>
  )
}

export function ProjectStandardsContent() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const styleReferenceInputRef = useRef<HTMLInputElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [applyingWorkspaceId, setApplyingWorkspaceId] = useState<string | null>(null)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [editingCoreKey, setEditingCoreKey] = useState<string | null>(null)
  const [coreWorkspaceValue, setCoreWorkspaceValue] = useState('')
  const [savingCoreKey, setSavingCoreKey] = useState<string | null>(null)
  const [ruleForm, setRuleForm] = useState<ProjectPromptRuleForm | null>(null)
  const [savingRule, setSavingRule] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [uploadingStyleReferences, setUploadingStyleReferences] = useState(false)
  const [deletingStyleReferenceId, setDeletingStyleReferenceId] = useState<number | null>(null)
  const [lastUploadedStyleReferences, setLastUploadedStyleReferences] = useState<RawResource[]>([])
  const openedWorkspaceId = searchParams.get('workspaceId')?.trim() || ''

  const queryKey = ['project-workspace', projectId] as const

  const { data = emptyData, isFetching, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => loadProjectStandardsWorkspaceData(projectId!),
    enabled: !!projectId,
  })

  const pageKey = useMemo(() => {
    if (!projectId) return undefined
    return buildPageKey({
      route: { pathname: ROUTES.project.standards },
      projectId,
      selection: { entityType: 'project', entityId: projectId, label: project?.name ?? `项目 #${projectId}` },
      labels: ['project-workspace', 'project-standards'],
    })
  }, [project?.name, projectId])

  useEffect(() => {
    setActiveWorkspaceId(openedWorkspaceId || null)
    if (openedWorkspaceId) setReviewDialogOpen(true)
  }, [openedWorkspaceId])

  const workspaceArtifactsQuery = useQuery<ProjectStandardsWorkspaceArtifact[]>({
    queryKey: projectStandardsKeys.workspaceArtifacts(projectId, pageKey, activeWorkspaceId, openedWorkspaceId),
    queryFn: async () => {
      if (!projectId || !pageKey) return []
      const scopedWorkspaceId = openedWorkspaceId || activeWorkspaceId
      return listProjectStandardsWorkspaceArtifacts({
        projectId,
        pageKey,
        ...(scopedWorkspaceId ? { workspaceId: scopedWorkspaceId } : {}),
      })
    },
    enabled: !!projectId && !!pageKey,
    retry: false,
    refetchInterval: (openedWorkspaceId || activeWorkspaceId) ? 1500 : false,
    refetchIntervalInBackground: false,
  })

  const workspaceCounts = useMemo(() => {
    const workspaceArtifacts = (workspaceArtifactsQuery.data ?? []).filter((workspace) => !isProjectStandardsWorkspaceHelperWorkspace(workspace))
    return {
      workspace: workspaceArtifacts.filter((item) => item.status === 'workspace').length,
      applied: workspaceArtifacts.filter((item) => item.status === 'applied').length,
    }
  }, [workspaceArtifactsQuery.data])

  function handleReviewDialogOpenChange(open: boolean) {
    setReviewDialogOpen(open)
    if (open) return
    setActiveWorkspaceId(null)
    if (!openedWorkspaceId) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('workspaceId')
      return next
    }, { replace: true })
  }

  async function applyWorkspace(workspace: ProjectStandardsWorkspaceArtifact) {
    if (!projectId) return
    if (workspace.kind === 'project_standards_workspace') {
      setApplyingWorkspaceId(workspace.id)
      try {
        const proposedValue = buildProjectStyleApplyPayload(workspace)
        await updateProjectStandardsWorkspaceArtifact(workspace.id, {
          metadata: {
            ...(isRecord(workspace.metadata) ? workspace.metadata : {}),
            reviewedFrom: 'project-standards-workbench',
            reviewedAt: new Date().toISOString(),
          },
        })
        const parsedWorkspace = JSON.parse(proposedValue) as Record<string, unknown>
        const workspacePayload = isRecord(parsedWorkspace.workspace) ? parsedWorkspace.workspace : {}
        await saveProjectStandardsWorkspaceEdit({
          projectId,
          currentProject: data.project,
          projectStyle: isRecord(workspacePayload.project_style) ? workspacePayload.project_style : {},
        })
        await updateProjectStandardsWorkspaceArtifact(workspace.id, {
          status: 'applied',
          target: {
            projectId,
            entityType: 'project',
            entityId: projectId,
            field: 'workspace',
          },
          metadata: {
            ...(isRecord(workspace.metadata) ? workspace.metadata : {}),
            reviewedFrom: 'project-standards-workbench',
            reviewedAt: new Date().toISOString(),
            workspaceWritePerformed: true,
          },
        })
        const nextProject = await getProject(projectId)
        useProjectStore.getState().setCurrent(nextProject)
        toast.success('项目规范已写入工作区')
        await refetch()
        await workspaceArtifactsQuery.refetch()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '应用项目规范工作区失败')
      } finally {
        setApplyingWorkspaceId(null)
      }
      return
    }
  }

  function refreshAll() {
    void refetch()
    void workspaceArtifactsQuery.refetch()
  }

  const workspaceArtifacts = (workspaceArtifactsQuery.data ?? []).filter((workspace) => !isProjectStandardsWorkspaceHelperWorkspace(workspace))
  const reviewWorkspaceArtifacts = useMemo(() => workspaceArtifacts.map((workspace) => ({
    workspace,
    workspaceView: parseProjectStandardsWorkspaceArtifact(workspace, pageKey),
    styleRows: parseProjectStyleWorkspaceRows(workspace, data.project),
  })), [data.project, workspaceArtifacts, pageKey])

  const filledStandardCount = projectStandardFilledCount(data.project)
  const missingStandardLabels = projectStandardMissingLabels(data.project)
  const customRules = useMemo(() => projectPromptRules(data.project), [data.project])
  const visibleCustomRules = customRules.filter((rule) => rule.key !== STYLE_REFERENCE_RULE_KEY)
  const enabledCustomRules = visibleCustomRules.filter((rule) => rule.enabled)
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
  const statusSummary = `${filledStandardCount}/8 项核心 · ${visibleCustomRules.length} 条自定义 · ${styleReferenceIds.length} 张风格图 · ${workspaceCounts.workspace} 个待审阅工作区`

  async function saveProjectStylePatch(projectStyle: Record<string, unknown>, successMessage: string) {
    if (!projectId) return
    await saveProjectStandardsWorkspaceEdit({
      projectId,
      currentProject: data.project,
      projectStyle,
    })
    const nextProject = await getProject(projectId)
    useProjectStore.getState().setCurrent(nextProject)
    await refetch()
    toast.success(successMessage)
  }

  function openCoreEditor(key: string) {
    setEditingCoreKey(key)
    setCoreWorkspaceValue(coreStandardText(data.project, key))
  }

  async function saveCoreStandard(def: CoreStandardDef) {
    if (!projectId) return
    setSavingCoreKey(def.key)
    try {
      const value = def.list ? splitListText(coreWorkspaceValue) : coreWorkspaceValue.trim()
      await saveProjectStylePatch({ [def.key]: value }, '核心规范已保存')
      setEditingCoreKey(null)
      setCoreWorkspaceValue('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存核心规范失败')
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
    if (!projectId || !ruleForm) return
    const normalized = normalizeRuleForm(ruleForm, ruleForm.id
      ? customRules.find((rule) => rule.id === ruleForm.id)?.order ?? (customRules.length + 1) * 10
      : (customRules.length + 1) * 10)
    if (!normalized.value) {
      toast.error('请填写规范内容')
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存扩展规范失败')
    } finally {
      setSavingRule(false)
    }
  }

  async function toggleRule(rule: ProjectPromptRule) {
    if (!projectId) return
    const nextRules = customRules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item)
    try {
      await saveProjectStylePatch({ custom_rules: projectPromptRulePayload(nextRules) }, rule.enabled ? '规范已停用' : '规范已启用')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新规范状态失败')
    }
  }

  async function deleteRule(rule: ProjectPromptRule) {
    if (!projectId) return
    setDeletingRuleId(rule.id)
    try {
      const nextRules = customRules.filter((item) => item.id !== rule.id)
      await saveProjectStylePatch({ custom_rules: projectPromptRulePayload(nextRules) }, '扩展规范已删除')
      if (ruleForm?.id === rule.id) setRuleForm(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除扩展规范失败')
    } finally {
      setDeletingRuleId(null)
    }
  }

  async function uploadStyleReferenceImages(files: FileList | null) {
    if (!projectId || !files || files.length === 0) return
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      toast.error('请选择图片文件')
      return
    }
    setUploadingStyleReferences(true)
    try {
      const { uploaded, patch } = await uploadProjectStandardsStyleReferenceImages({
        files: imageFiles,
        customRules,
        styleReferenceRule,
      })
      setLastUploadedStyleReferences((current) => {
        const byId = new Map(current.map((resource) => [resource.ID, resource]))
        for (const resource of uploaded) byId.set(resource.ID, resource)
        return Array.from(byId.values())
      })
      await saveProjectStylePatch(patch, `已上传 ${uploaded.length} 张画风参考图`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传画风参考图失败')
    } finally {
      setUploadingStyleReferences(false)
      if (styleReferenceInputRef.current) styleReferenceInputRef.current.value = ''
    }
  }

  async function removeStyleReferenceImage(resourceId: number) {
    if (!projectId || !styleReferenceRule) return
    setDeletingStyleReferenceId(resourceId)
    try {
      const { patch } = buildProjectStandardsStyleReferenceRemovalPatch({
        customRules,
        styleReferenceRule,
        resourceId,
      })
      await saveProjectStylePatch(patch, '风格图片已移出项目规范')
      setLastUploadedStyleReferences((current) => current.filter((resource) => resource.ID !== resourceId))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '移除风格图片失败')
    } finally {
      setDeletingStyleReferenceId(null)
    }
  }

  return (
    <>
      <ProjectStandardsMain>
        {isLoading ? (
          <ProjectStandardsLoadingView />
        ) : (
          <ProjectStandardsWorkspaceContent
            filledStandardCount={filledStandardCount}
            missingStandardLabels={missingStandardLabels}
            visibleCustomRules={visibleCustomRules}
            enabledCustomRules={enabledCustomRules}
            styleReferenceIds={styleReferenceIds}
            workspaceCounts={workspaceCounts}
            statusSummary={statusSummary}
            standardGroups={standardGroups}
            project={data.project}
            ruleForm={ruleForm}
            setRuleForm={setRuleForm}
            savingRule={savingRule}
            onSaveRuleForm={saveRuleForm}
            isFetching={isFetching}
            workspaceArtifactsFetching={workspaceArtifactsQuery.isFetching}
            onRefreshAll={refreshAll}
            onOpenReviewDialog={() => setReviewDialogOpen(true)}
            projectId={projectId}
            onOpenNewRuleForm={openNewRuleForm}
            editingCoreKey={editingCoreKey}
            coreWorkspaceValue={coreWorkspaceValue}
            onCoreWorkspaceValueChange={setCoreWorkspaceValue}
            savingCoreKey={savingCoreKey}
            onOpenCoreEditor={openCoreEditor}
            onCancelCoreEditor={() => setEditingCoreKey(null)}
            onSaveCoreStandard={saveCoreStandard}
            deletingRuleId={deletingRuleId}
            onToggleRule={toggleRule}
            onOpenEditRuleForm={openEditRuleForm}
            onDeleteRule={deleteRule}
            enabledRuleCount={enabledRuleCount}
            promptPreview={promptPreview}
            styleReferenceInputRef={styleReferenceInputRef}
            uploadingStyleReferences={uploadingStyleReferences}
            onUploadStyleReferenceImages={uploadStyleReferenceImages}
            uploadedStyleReferencesById={uploadedStyleReferencesById}
            deletingStyleReferenceId={deletingStyleReferenceId}
            onRemoveStyleReferenceImage={removeStyleReferenceImage}
            styleReferenceRule={styleReferenceRule}
          />
        )}
      </ProjectStandardsMain>

      <ProjectStandardsDialog open={reviewDialogOpen} onOpenChange={handleReviewDialogOpenChange}>
        <ProjectStandardsDialogContent>
          <ProjectStandardsDialogTitle className="sr-only">项目规范审阅</ProjectStandardsDialogTitle>
          <ProjectStandardsDialogBody>
            <ProjectStandardsWorkspaceReviewPanel
              loading={workspaceArtifactsQuery.isLoading}
              workspaceCount={workspaceCounts.workspace}
              workspaces={reviewWorkspaceArtifacts}
              applyingWorkspaceId={applyingWorkspaceId}
              onApplyWorkspace={(workspace) => { void applyWorkspace(workspace) }}
            />
          </ProjectStandardsDialogBody>
        </ProjectStandardsDialogContent>
      </ProjectStandardsDialog>

    </>
  )
}
