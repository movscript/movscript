import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  Eye,
  GitBranch,
  ImagePlus,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  Route,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@movscript/ui'

import { applyProjectStandardsProposal, getProject } from '@/api/semanticEntities'
import { AuthedImage } from '@/components/shared/AuthedImage'
import { ProjectStandardsProposalReviewPanel } from '@/components/proposals/ProjectStandardsProposalReviewPanel'
import { ProjectWorkbenchShell } from '@/components/workbench/WorkbenchChrome'
import { WorkbenchEmptyState, WorkbenchMetric } from '@/components/workbench/WorkbenchPrimitives'
import { buildPageKey } from '@/lib/agentCommandInput'
import {
  buildProjectStandardsReviewSearchParams,
  createProjectStandardsProposalDraft,
  launchProjectStandardsProposalAgent,
} from '@/lib/projectStandardsAgentLaunch'
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
} from '@/lib/projectStandardsModel'
import { uploadProjectStandardsStyleReferenceImages } from '@/lib/projectStandardsStyleReferenceUpload'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { ROUTES } from '@/routes/projectRoutes'
import type { RawResource } from '@/types'

const PROJECT_STANDARDS_AI_PROMPT = '请为当前项目制定项目级制作规范：补齐固定 8 项，并按需要新增 custom_rules。custom_rules 每条要包含 key、label、category、value、prompt_role、enabled、required、order。如果需要用图片固定画风，请新增 prompt_role="style" 的 custom_rules，在 value 中记录参考图 resource#ID 或 reference_resource_ids，并说明后续图片/视频生成要把这些 ID 作为 reference_resource_ids 用于画风参考。不要创建设定资料或素材需求。'

export default function ProjectStandardsPage() {
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
  const enabledCustomRules = customRules.filter((rule) => rule.enabled)
  const enabledRuleCount = filledStandardCount + enabledCustomRules.length
  const promptPreview = useMemo(() => buildProjectPromptPreview(data.project), [data.project])
  const styleReferenceRule = customRules.find((rule) => rule.key === STYLE_REFERENCE_RULE_KEY)
  const styleReferenceIds = useMemo(() => extractResourceIds(styleReferenceRule?.value ?? ''), [styleReferenceRule?.value])
  const uploadedStyleReferencesById = useMemo(() => new Map(lastUploadedStyleReferences.map((resource) => [resource.ID, resource])), [lastUploadedStyleReferences])

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

  return (
    <ProjectWorkbenchShell
      workbenchId="project_standards"
      projectName={project?.name}
      kicker="项目规范"
      title="项目规范库"
      description="核心规范必填，扩展规范按需进入提示词；AI 生成的项目规范提案在审阅区应用。"
      badges={(
        <>
          <Badge variant="secondary" className="h-6 rounded-full px-2 type-tiny">
            backend apply
          </Badge>
          {isFetching ? <Badge variant="outline" className="h-6 rounded-full px-2 type-tiny">同步中</Badge> : null}
        </>
      )}
      onRefresh={refreshAll}
      refreshing={isFetching || draftsQuery.isFetching}
      refreshLabel="刷新"
      actions={(
        <>
          <Button size="sm" variant="outline" className="h-8 w-32 gap-1.5" onClick={() => setReviewDialogOpen(true)} disabled={!projectId}>
            <GitBranch size={14} />
            审阅草稿
            {draftCounts.draft > 0 ? <span className="ml-0.5 rounded-full bg-muted px-1.5 type-tiny leading-4 text-muted-foreground">{draftCounts.draft}</span> : null}
          </Button>
          <Button size="sm" className="h-8 w-32 gap-1.5" onClick={() => startProjectOrchestration(PROJECT_STANDARDS_AI_PROMPT)} loading={launching} disabled={!projectId}>
            <Wand2 size={14} />
            AI 制定规范
          </Button>
        </>
      )}
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-h-0 flex-1 overflow-auto bg-muted/20">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center gap-2 type-body text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              加载项目现状…
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 p-3 lg:p-4">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <WorkbenchMetric label="核心规范完成度" value={`${filledStandardCount}/8`} detail={missingStandardLabels.length > 0 ? `缺失 ${missingStandardLabels.length} 项必选规范` : '固定规范已覆盖'} icon={Route} />
                <WorkbenchMetric label="启用规范" value={enabledRuleCount} detail={`${enabledCustomRules.length} 条扩展规范会进入提示词`} icon={BookOpen} />
                <WorkbenchMetric label="扩展规范" value={customRules.length} detail="支持任意 key/value、分类和提示词角色" icon={Sparkles} />
                <WorkbenchMetric label="待审阅提案" value={draftCounts.draft} detail="AI 生成的规范变更在审阅区应用" icon={PackageCheck} />
              </section>

              <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.78fr)]">
                  <div className="min-w-0 space-y-4">
                    <section className="min-h-0 border-b border-border pb-4">
                      <div className="min-w-0">
                        <h2 className="type-body font-semibold text-foreground">核心规范</h2>
                        <p className="mt-1 type-label text-muted-foreground">固定 8 项为必选规范，直接写入 Project 全局字段和 project_style。</p>
                      </div>

                        <div className="mt-4 grid gap-2 md:grid-cols-2">
                          {CORE_STANDARD_DEFS.map((def) => {
                            const value = coreStandardText(data.project, def.key)
                            const editing = editingCoreKey === def.key
                            return (
                              <div key={def.key} className={cn(
                                'rounded-md border px-3 py-2',
                                value ? 'border-border bg-background' : 'border-dashed border-amber-500/40 bg-amber-500/5',
                              )}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className="type-label font-medium text-foreground">{def.label}</p>
                                      <Badge variant="outline" className="h-5 rounded-full px-1.5 type-micro">{def.category}</Badge>
                                      <Badge variant="secondary" className="h-5 rounded-full px-1.5 type-micro">{PROMPT_ROLE_LABELS[def.promptRole]}</Badge>
                                      <Badge variant={value ? 'success' : 'warning'} className="h-5 rounded-full px-1.5 type-micro">{value ? '已设置' : '缺失'}</Badge>
                                    </div>
                                    <p className="mt-1 type-tiny leading-4 text-muted-foreground">{def.helper}</p>
                                  </div>
                                  <Button size="icon-sm" variant="ghost" className="shrink-0" onClick={() => editing ? setEditingCoreKey(null) : openCoreEditor(def.key)}>
                                    {editing ? <X size={14} /> : <Pencil size={14} />}
                                  </Button>
                                </div>
                                {editing ? (
                                  <div className="mt-2 space-y-2">
                                    {def.multiline ? (
                                      <Textarea value={coreDraftValue} onChange={(event) => setCoreDraftValue(event.target.value)} className="min-h-24 type-label" placeholder={def.helper} />
                                    ) : (
                                      <Input value={coreDraftValue} onChange={(event) => setCoreDraftValue(event.target.value)} className="h-8 type-label" placeholder={def.helper} />
                                    )}
                                    <div className="flex justify-end gap-1.5">
                                      <Button size="sm" variant="outline" className="type-label" onClick={() => setEditingCoreKey(null)}>取消</Button>
                                      <Button size="sm" className="gap-1.5 type-label" loading={savingCoreKey === def.key} onClick={() => saveCoreStandard(def)}>
                                        <Save size={12} />
                                        保存
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="mt-2 whitespace-pre-wrap type-label leading-5 text-foreground">{value || '未设置'}</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                    </section>

                    <section className="min-h-0 border-b border-border pb-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="flex items-center gap-2 type-body font-semibold text-foreground"><ImagePlus size={14} />全局画风参考图</h2>
                          <p className="mt-1 type-label text-muted-foreground">上传后会写入 style_reference_images 规则，后续图片/视频生成可作为 reference_resource_ids 使用。</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            ref={styleReferenceInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(event) => uploadStyleReferenceImages(event.target.files)}
                          />
                          <Button size="sm" className="gap-1.5 type-label" onClick={() => styleReferenceInputRef.current?.click()} loading={uploadingStyleReferences} disabled={!projectId}>
                            <Upload size={12} />
                            上传参考图
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3">
                        {styleReferenceIds.length === 0 ? (
                          <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 type-label text-muted-foreground">
                            尚未设置画风参考图。上传图片后会自动生成全局画风规则。
                          </div>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {styleReferenceIds.map((id) => {
                              const uploaded = uploadedStyleReferencesById.get(id)
                              return (
                                <div key={id} className="overflow-hidden rounded-md border border-border bg-background">
                                  <div className="aspect-video bg-muted">
                                    <AuthedImage src={`/api/v1/resources/${id}/file`} alt={uploaded?.name ?? `resource#${id}`} className="h-full w-full object-cover" />
                                  </div>
                                  <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                                    <p className="min-w-0 truncate type-tiny text-foreground">{uploaded?.name ?? `resource#${id}`}</p>
                                    <Badge variant="secondary" className="shrink-0 type-micro">#{id}</Badge>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {styleReferenceRule ? (
                        <p className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-2 type-tiny leading-4 text-muted-foreground">{styleReferenceRule.value}</p>
                      ) : null}
                    </section>

                    <section className="min-h-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="type-body font-semibold text-foreground">扩展规范</h2>
                          <p className="mt-1 type-label text-muted-foreground">用任意 key/value 补充角色、台词、平台禁忌、审核口径等项目规则。</p>
                        </div>
                        <Button size="sm" className="gap-1.5 type-label" onClick={openNewRuleForm}>
                          <Plus size={12} />
                          新增规范
                        </Button>
                      </div>

                      {ruleForm && (
                        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                          <div className="grid gap-2 md:grid-cols-2">
                            <label className="space-y-1 type-tiny font-medium text-muted-foreground">
                              名称
                              <Input value={ruleForm.label} onChange={(event) => setRuleForm({ ...ruleForm, label: event.target.value })} className="h-8 type-label" placeholder="角色一致性" />
                            </label>
                            <label className="space-y-1 type-tiny font-medium text-muted-foreground">
                              Key
                              <Input value={ruleForm.key} onChange={(event) => setRuleForm({ ...ruleForm, key: event.target.value })} className="h-8 font-mono type-label" placeholder="character_consistency" />
                            </label>
                            <label className="space-y-1 type-tiny font-medium text-muted-foreground">
                              分类
                              <Input value={ruleForm.category} onChange={(event) => setRuleForm({ ...ruleForm, category: event.target.value })} className="h-8 type-label" placeholder="人物 / 审核 / 平台 / 交付" />
                            </label>
                            <label className="space-y-1 type-tiny font-medium text-muted-foreground">
                              提示词角色
                              <Select value={ruleForm.prompt_role} onValueChange={(value) => setRuleForm({ ...ruleForm, prompt_role: value as PromptRole })}>
                                <SelectTrigger className="h-8 type-label"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {Object.entries(PROMPT_ROLE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </label>
                          </div>
                          <label className="mt-2 block space-y-1 type-tiny font-medium text-muted-foreground">
                            规范内容
                            <Textarea value={ruleForm.value} onChange={(event) => setRuleForm({ ...ruleForm, value: event.target.value })} className="min-h-24 type-label" placeholder="写清楚会进入提示词的项目级规则。" />
                          </label>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-2 type-tiny text-muted-foreground">
                              <label className="inline-flex items-center gap-1.5">
                                <input type="checkbox" checked={ruleForm.enabled} onChange={(event) => setRuleForm({ ...ruleForm, enabled: event.target.checked })} />
                                启用
                              </label>
                              <label className="inline-flex items-center gap-1.5">
                                <input type="checkbox" checked={ruleForm.required} onChange={(event) => setRuleForm({ ...ruleForm, required: event.target.checked })} />
                                标记必选
                              </label>
                            </div>
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="outline" className="type-label" onClick={() => setRuleForm(null)}>取消</Button>
                              <Button size="sm" className="gap-1.5 type-label" loading={savingRule} onClick={saveRuleForm}>
                                <Save size={12} />
                                保存规范
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 space-y-2">
                        {customRules.length === 0 ? (
                          <WorkbenchEmptyState compact title="暂无扩展规范" description="新增一条规范后，它会按启用状态进入提示词预览。" />
                        ) : customRules.map((rule) => (
                          <div key={rule.id} className={cn('rounded-md border p-3', rule.enabled ? 'border-border bg-background' : 'border-dashed border-border bg-muted/30 opacity-80')}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className="type-label font-semibold text-foreground">{rule.label}</p>
                                  <Badge variant="outline" className="h-5 rounded-full px-1.5 type-micro">{rule.category}</Badge>
                                  <Badge variant="secondary" className="h-5 rounded-full px-1.5 type-micro">{PROMPT_ROLE_LABELS[rule.prompt_role]}</Badge>
                                  {rule.required ? <Badge variant="warning" className="h-5 rounded-full px-1.5 type-micro">必选</Badge> : null}
                                  <Badge variant={rule.enabled ? 'success' : 'outline'} className="h-5 rounded-full px-1.5 type-micro">{rule.enabled ? '启用' : '停用'}</Badge>
                                </div>
                                <p className="mt-1 font-mono type-tiny text-muted-foreground">{rule.key}</p>
                                <p className="mt-2 whitespace-pre-wrap type-label leading-5 text-foreground">{rule.value || '未填写'}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button size="sm" variant="outline" className="px-2 type-tiny" onClick={() => toggleRule(rule)}>{rule.enabled ? '停用' : '启用'}</Button>
                                <Button size="icon-sm" variant="ghost" onClick={() => openEditRuleForm(rule)} title="编辑规范"><Pencil size={14} /></Button>
                                <Button size="icon-sm" variant="ghost" className="text-destructive" loading={deletingRuleId === rule.id} onClick={() => deleteRule(rule)} title="删除规范"><Trash2 size={14} /></Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <aside className="min-h-0 self-start overflow-hidden border-t border-border pt-4 xl:sticky xl:top-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="flex items-center gap-2 type-body font-semibold text-foreground"><Eye size={14} />提示词预览</h2>
                        <p className="mt-1 type-label text-muted-foreground">这里展示最终会注入模型的项目规范片段。</p>
                      </div>
                      <Badge variant="secondary" className="type-tiny">{enabledRuleCount} 条启用</Badge>
                    </div>
                    <pre className="mt-3 max-h-[620px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 type-label leading-5 text-foreground">{promptPreview}</pre>
                  </aside>
              </section>
            </div>
          )}
        </main>
      </div>

      <Dialog open={reviewDialogOpen} onOpenChange={handleReviewDialogOpenChange}>
        <DialogContent className="flex max-h-[88vh] w-[min(1120px,calc(100vw-32px))] max-w-none flex-col overflow-hidden p-0">
          <DialogTitle className="sr-only">项目规范审阅</DialogTitle>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <ProjectStandardsProposalReviewPanel
              loading={draftsQuery.isLoading}
              draftCount={draftCounts.draft}
              drafts={reviewDrafts}
              applyingDraftId={applyingDraftId}
              onApplyDraft={(draft) => { void applyDraft(draft) }}
            />
          </div>
        </DialogContent>
      </Dialog>

    </ProjectWorkbenchShell>
  )
}
