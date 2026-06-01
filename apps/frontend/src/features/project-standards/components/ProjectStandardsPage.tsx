import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Eye,
  GitBranch,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import {
  ProjectStandardsActionButton,
  ProjectStandardsAppSurface,
  ProjectStandardsBadge,
  ProjectStandardsBodyText,
  ProjectStandardsCheckboxField,
  ProjectStandardsCodeBlock,
  ProjectStandardsColumn,
  ProjectStandardsContentLayout,
  ProjectStandardsDescription,
  ProjectStandardsDialog,
  ProjectStandardsDialogBody,
  ProjectStandardsDialogContent,
  ProjectStandardsDialogTitle,
  ProjectStandardsEmptyState,
  ProjectStandardsEmptyText,
  ProjectStandardsField,
  ProjectStandardsFieldActions,
  ProjectStandardsFormGrid,
  ProjectStandardsIconButton,
  ProjectStandardsImageCard,
  ProjectStandardsImageFrame,
  ProjectStandardsImageGrid,
  ProjectStandardsImageMeta,
  ProjectStandardsInput,
  ProjectStandardsLoadingState,
  ProjectStandardsMain,
  ProjectStandardsMetric,
  ProjectStandardsMetricGrid,
  ProjectStandardsPreviewAside,
  ProjectStandardsPreviewSurface,
  ProjectStandardsRuleActions,
  ProjectStandardsRuleCard,
  ProjectStandardsRuleCardHeader,
  ProjectStandardsRuleForm,
  ProjectStandardsRuleList,
  ProjectStandardsSection,
  ProjectStandardsSectionHeader,
  ProjectStandardsSelect,
  ProjectStandardsSelectContent,
  ProjectStandardsSelectItem,
  ProjectStandardsSelectTrigger,
  ProjectStandardsSelectValue,
  ProjectStandardsStatusBadge,
  ProjectStandardsSurfaceItem,
  ProjectStandardsTextarea,
  ProjectStandardsTinyText,
  ProjectStandardsTitle,
  ProjectStandardsTitleRow,
  ProjectStandardsWorkspaceGrid,
  WorkbenchProjectBody,
  WorkbenchProjectShell,
} from '@movscript/ui'

import { applyProjectStandardsProposal, getProject } from '@/shared/infrastructure/api/semanticEntities'
import { ResourceFileImage } from '@/shared/ui/ResourceFileImage'
import { ProjectStandardsProposalReviewPanel } from '@/features/project-standards/components/proposals/ProjectStandardsProposalReviewPanel'
import { useProjectWorkbenchShellProps } from '@/features/project-workbenches/application/useProjectWorkbenchShellProps'
import { buildPageKey } from '@/features/agent/domain/agentCommandInput'
import {
  buildProjectStandardsReviewSearchParams,
  createProjectStandardsProposalDraft,
  launchProjectStandardsProposalAgent,
} from '@/features/project-standards/application/projectStandardsAgentLaunch'
import {
  CORE_STANDARD_DEFS,
  PROMPT_ROLE_LABELS,
  STYLE_REFERENCE_RULE_KEY,
  buildProjectPromptPreview,
  buildProjectStyleApplyPayload,
  coreStandardText,
  emptyData,
  emptyRuleForm,
  extractResourceIds,
  isProjectStandardsProposalHelperDraft,
  isRecord,
  loadProjectStandardsWorkspaceData,
  normalizeRuleForm,
  parseProjectStandardsProposalDraft,
  parseProjectStyleDraftRows,
  projectPromptRulePayload,
  projectPromptRules,
  projectStandardFilledCount,
  projectStandardMissingLabels,
  splitListText,
  type CoreStandardDef,
  type ProjectPromptRule,
  type ProjectPromptRuleForm,
  type PromptRole,
} from '@/features/project-standards/application/projectStandardsModel'
import {
  buildProjectStandardsStyleReferenceRemovalPatch,
  uploadProjectStandardsStyleReferenceImages,
} from '@/features/project-standards/application/projectStandardsStyleReferenceUpload'
import {
  projectStandardsEnabledRuleRecipe,
  projectStandardsReadyRecipe,
  projectStandardsRequiredRuleRecipe,
} from '@/features/project-standards/presentation/projectStandardsSemanticUi'
import { localAgentClient, type AgentDraft } from '@/shared/infrastructure/localAgentClient'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import { ROUTES } from '@/routes/projectRoutes'
import type { RawResource } from '@/types'
const PROJECT_STANDARDS_AI_PROMPT = '请为当前项目制定项目级制作规范：补齐固定 8 项，并按需要新增 custom_rules。custom_rules 每条要包含 key、label、category、value、prompt_role、enabled、required、order。如果需要用图片固定画风，请新增 prompt_role="style" 的 custom_rules，在 value 中记录参考图 resource#ID 或 reference_resource_ids，并说明后续图片/视频生成要把这些 ID 作为 reference_resource_ids 用于画风参考。不要创建设定资料或素材需求。'

type StandardWorkbenchCard =
  | { type: 'core'; def: CoreStandardDef }
  | { type: 'custom'; rule: ProjectPromptRule }

interface StandardWorkbenchGroup {
  id: string
  title: string
  description: string
  cards: StandardWorkbenchCard[]
}

const CORE_STANDARD_GROUPS = [
  {
    id: 'foundation',
    title: '基础规范',
    description: '决定项目默认画幅、整体质感和生成任务的基础语境。',
    coreKeys: ['aspect_ratio', 'visual_style'],
  },
  {
    id: 'camera',
    title: '镜头规范',
    description: '统一镜头尺度、运动方式、构图和视角表达。',
    coreKeys: ['shot_size_system', 'camera_language'],
  },
  {
    id: 'look',
    title: '画风规范',
    description: '控制灯光、色彩、画面观感和视觉连续性。',
    coreKeys: ['lighting_style', 'color_palette'],
  },
  {
    id: 'constraints',
    title: '节奏与约束',
    description: '约束剪辑节奏、禁止项和必须遵守的项目规则。',
    coreKeys: ['pacing_rules', 'negative_rules'],
  },
] as const

function coreCards(keys: readonly string[]): StandardWorkbenchCard[] {
  return keys.flatMap((key) => {
    const def = CORE_STANDARD_DEFS.find((item) => item.key === key)
    return def ? [{ type: 'core' as const, def }] : []
  })
}

export default function ProjectStandardsPage() {
  const project = useProjectStore((s) => s.current)
  const workbenchShellProps = useProjectWorkbenchShellProps({
    workbenchId: 'project_standards',
    projectName: project?.name,
    kicker: '项目规范',
    title: '项目规范工作台',
    description: '集中查看和调整项目会遵守的制作规范，并预览最终注入模型的提示词与风格参考。',
  })

  return (
    <WorkbenchProjectShell {...workbenchShellProps}>
      <WorkbenchProjectBody padding="none" scroll="auto" tone="muted">
        <ProjectStandardsContent />
      </WorkbenchProjectBody>
    </WorkbenchProjectShell>
  )
}

export function ProjectStandardsContent() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const orchestrationToolCleanupRef = useRef<(() => void) | null>(null)
  const styleReferenceInputRef = useRef<HTMLInputElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [orchestrationPrompt, setOrchestrationPrompt] = useState('')
  const [launching, setLaunching] = useState(false)
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [applyingDraftId, setApplyingDraftId] = useState<string | null>(null)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [editingCoreKey, setEditingCoreKey] = useState<string | null>(null)
  const [coreDraftValue, setCoreDraftValue] = useState('')
  const [savingCoreKey, setSavingCoreKey] = useState<string | null>(null)
  const [ruleForm, setRuleForm] = useState<ProjectPromptRuleForm | null>(null)
  const [savingRule, setSavingRule] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [uploadingStyleReferences, setUploadingStyleReferences] = useState(false)
  const [deletingStyleReferenceId, setDeletingStyleReferenceId] = useState<number | null>(null)
  const [lastUploadedStyleReferences, setLastUploadedStyleReferences] = useState<RawResource[]>([])
  const openedDraftId = searchParams.get('draftId')?.trim() || ''

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
    setActiveDraftId(openedDraftId || null)
    if (openedDraftId) setReviewDialogOpen(true)
  }, [openedDraftId])

  useEffect(() => {
    return () => orchestrationToolCleanupRef.current?.()
  }, [])

  const draftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['project-workspace-drafts', projectId, pageKey, activeDraftId, openedDraftId],
    queryFn: async () => {
      if (!projectId || !pageKey) return []
      const scopedDraftId = openedDraftId || activeDraftId
      if (scopedDraftId) {
        const draft = await localAgentClient.getDraft(scopedDraftId)
        return draft.kind === 'project_standards_proposal' ? [draft] : []
      }
      const { drafts } = await localAgentClient.listDrafts({ projectId, kind: 'project_standards_proposal', pageKey, limit: 20 })
      return drafts
    },
    enabled: !!projectId && !!pageKey,
    refetchInterval: (openedDraftId || activeDraftId) ? 1500 : false,
    refetchIntervalInBackground: false,
  })

  const draftCounts = useMemo(() => {
    const drafts = (draftsQuery.data ?? []).filter((draft) => !isProjectStandardsProposalHelperDraft(draft))
    return {
      draft: drafts.filter((item) => item.status === 'draft').length,
      applied: drafts.filter((item) => item.status === 'applied').length,
    }
  }, [draftsQuery.data])

  async function startProjectOrchestration(promptOverride?: string) {
    if (!projectId || !pageKey) return
    const requestedPrompt = typeof promptOverride === 'string' ? promptOverride : orchestrationPrompt
    setLaunching(true)
    try {
      const draftShell = await createProjectStandardsProposalDraft({
        projectId,
        projectName: project?.name,
        pageKey,
      })
      setActiveDraftId(draftShell.id)
      setReviewDialogOpen(true)
      setSearchParams((current) => buildProjectStandardsReviewSearchParams(current, { fallbackDraftId: draftShell.id }), { replace: true })

      const requestId = `project_orchestrate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

      orchestrationToolCleanupRef.current?.()
      orchestrationToolCleanupRef.current = launchProjectStandardsProposalAgent({
        requestId,
        projectId,
        projectName: project?.name,
        draftId: draftShell.id,
        promptOverride: requestedPrompt,
        onSettled: async (payload) => {
          if (payload.run?.status === 'failed' || payload.run?.status === 'cancelled') {
            await draftsQuery.refetch()
            return
          }
          const nextSearch = buildProjectStandardsReviewSearchParams(new URLSearchParams(searchParams), {
            artifacts: payload.artifacts,
            fallbackDraftId: draftShell.id,
          })
          setActiveDraftId(nextSearch.get('draftId') || draftShell.id)
          setReviewDialogOpen(true)
          setSearchParams((current) => buildProjectStandardsReviewSearchParams(current, {
            artifacts: payload.artifacts,
            fallbackDraftId: draftShell.id,
          }), { replace: true })
          await draftsQuery.refetch()
        },
      })
      toast.info('已打开项目规范提案会话；AI 生成的草稿会回到审阅区')
      await draftsQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '项目规范提案启动失败')
    } finally {
      setLaunching(false)
    }
  }

  function handleReviewDialogOpenChange(open: boolean) {
    setReviewDialogOpen(open)
    if (open) return
    setActiveDraftId(null)
    if (!openedDraftId) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('draftId')
      return next
    }, { replace: true })
  }

  async function applyDraft(draft: AgentDraft) {
    if (!projectId) return
    if (draft.kind === 'project_standards_proposal') {
      setApplyingDraftId(draft.id)
      try {
        const proposedValue = buildProjectStyleApplyPayload(draft)
        await localAgentClient.updateDraft(draft.id, {
          metadata: {
            ...(isRecord(draft.metadata) ? draft.metadata : {}),
            reviewedFrom: 'project-standards-workbench',
            reviewedAt: new Date().toISOString(),
          },
        })
        try {
          await localAgentClient.applyDraft(draft.id, {
            target: {
              projectId,
              entityType: 'project',
              entityId: projectId,
              field: 'proposal',
            },
            currentValue: {
              aspect_ratio: data.project?.aspect_ratio ?? '',
              visual_style: data.project?.visual_style ?? '',
              project_style: data.project?.project_style ?? '',
            },
            proposedValue,
          })
        } catch (error) {
          await applyProjectStandardsProposal(projectId, JSON.parse(proposedValue) as Record<string, unknown>)
          await localAgentClient.updateDraft(draft.id, {
            status: 'applied',
            target: {
              projectId,
              entityType: 'project',
              entityId: projectId,
              field: 'proposal',
            },
            metadata: {
              ...(isRecord(draft.metadata) ? draft.metadata : {}),
              reviewedFrom: 'project-standards-workbench',
              reviewedAt: new Date().toISOString(),
              backendWritePerformed: true,
              backendApplyFallback: error instanceof Error ? error.message : String(error),
            },
          })
        }
        const nextProject = await getProject(projectId)
        useProjectStore.getState().setCurrent(nextProject)
        toast.success('项目规范已写入后端')
        await refetch()
        await draftsQuery.refetch()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '应用项目规范提案失败')
      } finally {
        setApplyingDraftId(null)
      }
      return
    }
  }

  function refreshAll() {
    void refetch()
    void draftsQuery.refetch()
  }

  const drafts = (draftsQuery.data ?? []).filter((draft) => !isProjectStandardsProposalHelperDraft(draft))
  const reviewDrafts = useMemo(() => drafts.map((draft) => ({
    draft,
    proposalView: parseProjectStandardsProposalDraft(draft, pageKey),
    styleRows: parseProjectStyleDraftRows(draft, data.project),
  })), [data.project, drafts, pageKey])

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
  const statusSummary = `${filledStandardCount}/8 项核心 · ${visibleCustomRules.length} 条自定义 · ${styleReferenceIds.length} 张风格图 · ${draftCounts.draft} 个待审阅草稿`

  async function saveProjectStylePatch(projectStyle: Record<string, unknown>, successMessage: string) {
    if (!projectId) return
    await applyProjectStandardsProposal(projectId, {
      scope: 'project_standards_proposal',
      mode: 'patch',
      proposal: {
        project_style: projectStyle,
      },
    })
    const nextProject = await getProject(projectId)
    useProjectStore.getState().setCurrent(nextProject)
    await refetch()
    toast.success(successMessage)
  }

  function openCoreEditor(key: string) {
    setEditingCoreKey(key)
    setCoreDraftValue(coreStandardText(data.project, key))
  }

  async function saveCoreStandard(def: CoreStandardDef) {
    if (!projectId) return
    setSavingCoreKey(def.key)
    try {
      const value = def.list ? splitListText(coreDraftValue) : coreDraftValue.trim()
      await saveProjectStylePatch({ [def.key]: value }, '核心规范已保存')
      setEditingCoreKey(null)
      setCoreDraftValue('')
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
            <ProjectStandardsLoadingState>
              <Loader2 size={16} className="animate-spin" />
              加载项目现状…
            </ProjectStandardsLoadingState>
          ) : (
            <ProjectStandardsContentLayout>
              <ProjectStandardsMetricGrid>
                <ProjectStandardsMetric label="核心规范" value={`${filledStandardCount}/8`} detail={missingStandardLabels.length > 0 ? `待补充 ${missingStandardLabels.length} 项` : '已覆盖'} tone={missingStandardLabels.length > 0 ? 'warning' : 'success'} compact />
                <ProjectStandardsMetric label="自定义规则" value={visibleCustomRules.length} detail={`${enabledCustomRules.length} 条启用`} compact />
                <ProjectStandardsMetric label="风格参考" value={styleReferenceIds.length} detail="参考图" tone={styleReferenceIds.length > 0 ? 'success' : 'neutral'} compact />
                <ProjectStandardsMetric label="待审草稿" value={draftCounts.draft} detail="Agent draft" tone={draftCounts.draft > 0 ? 'warning' : 'neutral'} compact />
              </ProjectStandardsMetricGrid>
              <ProjectStandardsAppSurface className="project-standards-status-strip">
                <ProjectStandardsTinyText className="text-foreground">{statusSummary}</ProjectStandardsTinyText>
                <ProjectStandardsStatusBadge {...projectStandardsReadyRecipe(missingStandardLabels.length === 0)}>
                  {missingStandardLabels.length === 0 ? '核心已覆盖' : '待补核心'}
                </ProjectStandardsStatusBadge>
                <ProjectStandardsTinyText>
                  {missingStandardLabels.length > 0 ? `待补充：${missingStandardLabels.join('、')}` : '核心规范已覆盖，预览会随编辑实时更新。'}
                </ProjectStandardsTinyText>
              </ProjectStandardsAppSurface>

              <ProjectStandardsWorkspaceGrid>
                  <ProjectStandardsColumn>
                    <ProjectStandardsSection className="project-standards-board-heading">
                      <ProjectStandardsSectionHeader>
                        <div className="min-w-0">
                          <ProjectStandardsTitle>规范工作板</ProjectStandardsTitle>
                          <ProjectStandardsDescription>按创作语境查看规范；点击卡片右上角即可编辑，启用的内容会进入右侧预览。</ProjectStandardsDescription>
                        </div>
                        <div className="project-standards-board-actions">
                          <ProjectStandardsActionButton size="sm" variant="outline" className="type-label" onClick={refreshAll} loading={isFetching || draftsQuery.isFetching}>
                            刷新
                          </ProjectStandardsActionButton>
                          <ProjectStandardsActionButton size="sm" variant="outline" className="type-label" onClick={() => setReviewDialogOpen(true)} disabled={!projectId}>
                            <GitBranch size={12} />
                            草稿{draftCounts.draft > 0 ? ` ${draftCounts.draft}` : ''}
                          </ProjectStandardsActionButton>
                          <ProjectStandardsActionButton size="sm" variant="outline" className="type-label" onClick={() => startProjectOrchestration(PROJECT_STANDARDS_AI_PROMPT)} loading={launching} disabled={!projectId}>
                            <Wand2 size={12} />
                            AI 制定
                          </ProjectStandardsActionButton>
                          <ProjectStandardsActionButton size="sm" className="type-label" onClick={openNewRuleForm}>
                            <Plus size={12} />
                            新增规范
                          </ProjectStandardsActionButton>
                        </div>
                      </ProjectStandardsSectionHeader>

                      {ruleForm && (
                        <ProjectStandardsRuleForm>
                          <ProjectStandardsFormGrid>
                            <ProjectStandardsField>
                              名称
                              <ProjectStandardsInput value={ruleForm.label} onChange={(event) => setRuleForm({ ...ruleForm, label: event.target.value })} className="h-8 type-label" placeholder="角色一致性" />
                            </ProjectStandardsField>
                            <ProjectStandardsField>
                              Key
                              <ProjectStandardsInput value={ruleForm.key} onChange={(event) => setRuleForm({ ...ruleForm, key: event.target.value })} className="h-8 font-mono type-label" placeholder="character_consistency" />
                            </ProjectStandardsField>
                            <ProjectStandardsField>
                              分类
                              <ProjectStandardsInput value={ruleForm.category} onChange={(event) => setRuleForm({ ...ruleForm, category: event.target.value })} className="h-8 type-label" placeholder="人物 / 审核 / 平台 / 交付" />
                            </ProjectStandardsField>
                            <ProjectStandardsField>
                              提示词角色
                              <ProjectStandardsSelect value={ruleForm.prompt_role} onValueChange={(value) => setRuleForm({ ...ruleForm, prompt_role: value as PromptRole })}>
                                <ProjectStandardsSelectTrigger className="h-8 type-label"><ProjectStandardsSelectValue /></ProjectStandardsSelectTrigger>
                                <ProjectStandardsSelectContent>
                                  {Object.entries(PROMPT_ROLE_LABELS).map(([value, label]) => <ProjectStandardsSelectItem key={value} value={value}>{label}</ProjectStandardsSelectItem>)}
                                </ProjectStandardsSelectContent>
                              </ProjectStandardsSelect>
                            </ProjectStandardsField>
                          </ProjectStandardsFormGrid>
                          <ProjectStandardsField className="mt-2">
                            规范内容
                            <ProjectStandardsTextarea value={ruleForm.value} onChange={(event) => setRuleForm({ ...ruleForm, value: event.target.value })} className="min-h-24 type-label" placeholder="写清楚会进入提示词的项目级规则。" />
                          </ProjectStandardsField>
                          <ProjectStandardsFieldActions>
                            <div className="flex flex-wrap gap-2 type-tiny text-muted-foreground">
                              <ProjectStandardsCheckboxField
                                controlSize="sm"
                                variant="subtle"
                                className="type-tiny"
                                checked={ruleForm.enabled}
                                onCheckedChange={(checked) => setRuleForm({ ...ruleForm, enabled: checked })}
                              >
                                启用
                              </ProjectStandardsCheckboxField>
                              <ProjectStandardsCheckboxField
                                controlSize="sm"
                                variant="subtle"
                                className="type-tiny"
                                checked={ruleForm.required}
                                onCheckedChange={(checked) => setRuleForm({ ...ruleForm, required: checked })}
                              >
                                标记必选
                              </ProjectStandardsCheckboxField>
                            </div>
                            <div className="flex gap-1.5">
                              <ProjectStandardsActionButton size="sm" variant="outline" className="type-label" onClick={() => setRuleForm(null)}>取消</ProjectStandardsActionButton>
                              <ProjectStandardsActionButton size="sm" className="type-label" loading={savingRule} onClick={saveRuleForm}>
                                <Save size={12} />
                                保存规范
                              </ProjectStandardsActionButton>
                            </div>
                          </ProjectStandardsFieldActions>
                        </ProjectStandardsRuleForm>
                      )}
                    </ProjectStandardsSection>

                    {standardGroups.map((group) => (
                      <ProjectStandardsSection key={group.id} className="project-standards-standard-group">
                        <ProjectStandardsSectionHeader>
                          <div className="min-w-0">
                            <ProjectStandardsTitle>{group.title}</ProjectStandardsTitle>
                            <ProjectStandardsDescription>{group.description}</ProjectStandardsDescription>
                          </div>
                          <ProjectStandardsBadge variant="outline" className="type-tiny">{group.cards.length} 项</ProjectStandardsBadge>
                        </ProjectStandardsSectionHeader>

                        <ProjectStandardsRuleList className="project-standards-standard-list">
                          {group.cards.map((card) => {
                            if (card.type === 'core') {
                              const { def } = card
                              const value = coreStandardText(data.project, def.key)
                              const editing = editingCoreKey === def.key
                              return (
                                <ProjectStandardsSurfaceItem
                                  key={def.key}
                                  tone={value ? 'neutral' : 'warning'}
                                  className="project-standards-standard-card"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <p className="type-label font-semibold text-foreground">{def.label}</p>
                                        <ProjectStandardsBadge variant="outline" className="h-5 px-1.5 type-tiny">{def.category}</ProjectStandardsBadge>
                                        {!value ? (
                                          <ProjectStandardsStatusBadge {...projectStandardsReadyRecipe(false)}>
                                            待补充
                                          </ProjectStandardsStatusBadge>
                                        ) : null}
                                      </div>
                                      <p className="mt-1 type-tiny leading-4 text-muted-foreground">{def.helper}</p>
                                    </div>
                                    <ProjectStandardsIconButton size="icon-sm" variant="ghost" onClick={() => editing ? setEditingCoreKey(null) : openCoreEditor(def.key)} title={editing ? '收起编辑' : '编辑规范'}>
                                      {editing ? <X size={14} /> : <Pencil size={14} />}
                                    </ProjectStandardsIconButton>
                                  </div>
                                  {editing ? (
                                    <div className="mt-2 space-y-2">
                                      {def.multiline ? (
                                        <ProjectStandardsTextarea value={coreDraftValue} onChange={(event) => setCoreDraftValue(event.target.value)} className="min-h-24 type-label" placeholder={def.helper} />
                                      ) : (
                                        <ProjectStandardsInput value={coreDraftValue} onChange={(event) => setCoreDraftValue(event.target.value)} className="h-8 type-label" placeholder={def.helper} />
                                      )}
                                      <div className="flex justify-end gap-1.5">
                                        <ProjectStandardsActionButton size="sm" variant="outline" className="type-label" onClick={() => setEditingCoreKey(null)}>取消</ProjectStandardsActionButton>
                                        <ProjectStandardsActionButton size="sm" className="type-label" loading={savingCoreKey === def.key} onClick={() => saveCoreStandard(def)}>
                                          <Save size={12} />
                                          保存
                                        </ProjectStandardsActionButton>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="mt-2 whitespace-pre-wrap type-label leading-5 text-foreground">{value || '点击编辑补充这条规范。'}</p>
                                  )}
                                </ProjectStandardsSurfaceItem>
                              )
                            }

                            const { rule } = card
                            return (
                              <ProjectStandardsRuleCard key={rule.id} disabled={!rule.enabled} className="project-standards-standard-card">
                                <ProjectStandardsRuleCardHeader>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className="type-label font-semibold text-foreground">{rule.label}</p>
                                      <ProjectStandardsBadge variant="outline" className="h-5 px-1.5 type-tiny">{rule.category}</ProjectStandardsBadge>
                                      <ProjectStandardsBadge className="h-5 px-1.5 type-tiny">{PROMPT_ROLE_LABELS[rule.prompt_role]}</ProjectStandardsBadge>
                                      <ProjectStandardsStatusBadge {...projectStandardsEnabledRuleRecipe(rule.enabled)}>
                                        {rule.enabled ? '已进入预览' : '未进入预览'}
                                      </ProjectStandardsStatusBadge>
                                      {rule.required ? (
                                        <ProjectStandardsStatusBadge {...projectStandardsRequiredRuleRecipe()}>
                                          必填
                                        </ProjectStandardsStatusBadge>
                                      ) : null}
                                    </div>
                                    <ProjectStandardsBodyText className="mt-2">{rule.value || '未填写'}</ProjectStandardsBodyText>
                                  </div>
                                  <ProjectStandardsRuleActions>
                                    <ProjectStandardsActionButton size="sm" variant="outline" className="px-2 type-tiny" onClick={() => toggleRule(rule)}>{rule.enabled ? '停用' : '启用'}</ProjectStandardsActionButton>
                                    <ProjectStandardsIconButton size="icon-sm" variant="ghost" onClick={() => openEditRuleForm(rule)} title="编辑规范"><Pencil size={14} /></ProjectStandardsIconButton>
                                    <ProjectStandardsIconButton size="icon-sm" variant="ghost" tone="danger" loading={deletingRuleId === rule.id} onClick={() => deleteRule(rule)} title="删除规范"><Trash2 size={14} /></ProjectStandardsIconButton>
                                  </ProjectStandardsRuleActions>
                                </ProjectStandardsRuleCardHeader>
                              </ProjectStandardsRuleCard>
                            )
                          })}
                        </ProjectStandardsRuleList>
                      </ProjectStandardsSection>
                    ))}

                    {visibleCustomRules.length === 0 ? (
                      <ProjectStandardsSection className="project-standards-standard-group">
                        <ProjectStandardsEmptyState compact title="暂无自定义规范" description="常见的平台禁忌、角色一致性和审核口径，可以从这里补充。" />
                      </ProjectStandardsSection>
                    ) : null}
                  </ProjectStandardsColumn>

                  <ProjectStandardsPreviewAside>
                    <ProjectStandardsSectionHeader>
                      <div className="min-w-0">
                        <ProjectStandardsTitleRow><Eye size={14} />输出预览</ProjectStandardsTitleRow>
                        <ProjectStandardsDescription>这里展示最终会交给模型的提示词片段和风格参考图。</ProjectStandardsDescription>
                      </div>
                      <ProjectStandardsBadge className="type-tiny">{enabledRuleCount} 条启用</ProjectStandardsBadge>
                    </ProjectStandardsSectionHeader>
                    <ProjectStandardsPreviewSurface>
                      <ProjectStandardsCodeBlock>{promptPreview}</ProjectStandardsCodeBlock>
                    </ProjectStandardsPreviewSurface>

                    <ProjectStandardsSectionHeader className="project-standards-preview-subheader">
                      <div className="min-w-0">
                        <ProjectStandardsTitleRow><ImagePlus size={14} />风格图片</ProjectStandardsTitleRow>
                        <ProjectStandardsDescription>这些图片会作为项目画风、质感、色彩和光影的参考。</ProjectStandardsDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <ProjectStandardsInput
                          ref={styleReferenceInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => uploadStyleReferenceImages(event.target.files)}
                        />
                        <ProjectStandardsActionButton size="sm" className="type-label" onClick={() => styleReferenceInputRef.current?.click()} loading={uploadingStyleReferences} disabled={!projectId}>
                          <Upload size={12} />
                          上传
                        </ProjectStandardsActionButton>
                      </div>
                    </ProjectStandardsSectionHeader>

                    <div className="mt-3">
                      {styleReferenceIds.length === 0 ? (
                        <ProjectStandardsEmptyText className="type-label">
                          尚未设置风格图片。上传后会自动加入提示词预览。
                        </ProjectStandardsEmptyText>
                      ) : (
                        <ProjectStandardsImageGrid>
                          {styleReferenceIds.map((id) => {
                            const uploaded = uploadedStyleReferencesById.get(id)
                            return (
                              <ProjectStandardsImageCard key={id}>
                                <ProjectStandardsImageFrame>
                                  <ResourceFileImage resourceId={id} alt={uploaded?.name ?? `resource#${id}`} className="h-full w-full object-cover" />
                                  <ProjectStandardsIconButton
                                    size="icon-sm"
                                    variant="ghost"
                                    tone="danger"
                                    className="project-standards-image-remove"
                                    loading={deletingStyleReferenceId === id}
                                    onClick={() => { void removeStyleReferenceImage(id) }}
                                    title="移除风格图片"
                                  >
                                    <Trash2 size={14} />
                                  </ProjectStandardsIconButton>
                                </ProjectStandardsImageFrame>
                                <ProjectStandardsImageMeta>
                                  <p className="min-w-0 truncate type-tiny text-foreground">{uploaded?.name ?? `resource#${id}`}</p>
                                  <ProjectStandardsBadge className="shrink-0 type-tiny">#{id}</ProjectStandardsBadge>
                                </ProjectStandardsImageMeta>
                              </ProjectStandardsImageCard>
                            )
                          })}
                        </ProjectStandardsImageGrid>
                      )}
                    </div>

                    {styleReferenceRule ? (
                      <ProjectStandardsSurfaceItem className="project-standards-style-reference-note">
                        <ProjectStandardsTinyText>{styleReferenceRule.value}</ProjectStandardsTinyText>
                      </ProjectStandardsSurfaceItem>
                    ) : null}
                  </ProjectStandardsPreviewAside>
              </ProjectStandardsWorkspaceGrid>
            </ProjectStandardsContentLayout>
          )}
      </ProjectStandardsMain>

      <ProjectStandardsDialog open={reviewDialogOpen} onOpenChange={handleReviewDialogOpenChange}>
        <ProjectStandardsDialogContent>
          <ProjectStandardsDialogTitle className="sr-only">项目规范审阅</ProjectStandardsDialogTitle>
          <ProjectStandardsDialogBody>
            <ProjectStandardsProposalReviewPanel
              loading={draftsQuery.isLoading}
              draftCount={draftCounts.draft}
              drafts={reviewDrafts}
              applyingDraftId={applyingDraftId}
              onApplyDraft={(draft) => { void applyDraft(draft) }}
            />
          </ProjectStandardsDialogBody>
        </ProjectStandardsDialogContent>
      </ProjectStandardsDialog>

    </>
  )
}
