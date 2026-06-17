import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, Database, FilePlus2, FileText, LayoutDashboard } from 'lucide-react'
import { AppContentLayout, ProjectSurfaceHeader } from '@movscript/ui/layout'
import { Badge, Button, StatusBadge } from '@movscript/ui/primitives'

import { projectOverviewKeys } from '@/features/project/application/projectQueries'
import {
  emptyProjectOverviewData,
  loadProjectOverviewData,
} from '@/features/project/application/projectOverviewData'
import {
  buildProjectOverviewModel,
  projectOverviewNextActionLabel,
} from '@/features/project/presentation/projectOverviewModel'
import { scriptKeys } from '@/features/scripts/application/scriptQueryKeys'
import { createWorkspaceScript, listWorkspaceScripts } from '@/features/scripts/application/scriptWorkspaceRepository'
import {
  invalidateScriptMutationResult,
  scriptCreatedResult,
} from '@/features/scripts/application/scriptMutationInvalidation'
import {
  projectBlockedSummaryRecipe,
} from '@/features/project/presentation/projectSemanticUi'
import {
  ProjectOverviewScriptCard,
  ProjectOverviewWorkbenchCard,
  ProjectSkillCard,
} from '@/features/project/components/ProjectOverviewCards'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { workspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'
import type { Script } from '@/types'
import { toast } from '@/shared/ui/toastStore'
import { requireWorkspaceRootAPI } from '@/features/agent/application/movScriptWorkspaceElectron'
import {
  loadProjectPluginSnapshot,
  setProjectSkillEnabled,
  type ProjectLocalSkill,
  type ProjectPluginContext,
} from '@/features/plugins/application/projectPlugins'
import {
  PluginStateBanner,
} from '@/features/plugins/components/PluginsPageUi'

export default function ProjectOverviewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const project = useProjectStore((state) => state.current)
  const projectId = project?.ID
  const [skillTogglingId, setSkillTogglingId] = useState<string>()
  const [skillToggleError, setSkillToggleError] = useState<string>()
  const currentUser = useUserStore((state) => state.currentUser)
  const currentOrgID = useUserStore((state) => state.currentOrgID)
  const orgMemberships = useUserStore((state) => state.orgMemberships)
  const workspaceContext = useMemo(
    () => workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }),
    [currentOrgID, currentUser?.ID, orgMemberships],
  )

  const { data = emptyProjectOverviewData, isFetching } = useQuery({
    queryKey: projectOverviewKeys.detail(projectId),
    queryFn: () => loadProjectOverviewData(projectId!),
    enabled: !!projectId,
  })
  const scriptsQuery = useQuery<Script[]>({
    queryKey: scriptKeys.projectScripts(projectId, workspaceContext),
    queryFn: () => listWorkspaceScripts(projectId!, workspaceContext),
    enabled: !!projectId,
  })
  const workspaceRootQuery = useQuery({ queryKey: projectOverviewKeys.workspaceRoot, queryFn: () => requireWorkspaceRootAPI().getRoot(), enabled: !!projectId })
  const movScriptHomeDir = workspaceRootQuery.data?.movScriptHomeDir ?? workspaceRootQuery.data?.workspaceDir
  const projectPluginContext = useMemo<ProjectPluginContext>(() => ({
    ...(movScriptHomeDir ? { movScriptHomeDir, workspaceDir: movScriptHomeDir } : {}),
    ...(projectId ? { projectId } : {}),
  }), [movScriptHomeDir, projectId])
  const projectPluginsQuery = useQuery({
    queryKey: projectOverviewKeys.plugins(projectPluginContext.movScriptHomeDir ?? projectPluginContext.workspaceDir, projectPluginContext.projectId),
    queryFn: () => loadProjectPluginSnapshot(projectPluginContext),
    enabled: !!projectId && !!movScriptHomeDir,
  })

  async function handleProjectSkillToggle(skill: ProjectLocalSkill, enabled: boolean) {
    setSkillTogglingId(skill.id)
    setSkillToggleError(undefined)
    try {
      await setProjectSkillEnabled(projectPluginContext, skill.id, enabled)
      await projectPluginsQuery.refetch()
    } catch (error) {
      setSkillToggleError(error instanceof Error ? error.message : String(error))
    } finally {
      setSkillTogglingId(undefined)
    }
  }

  const overviewModel = useMemo(() => buildProjectOverviewModel({ data, project }), [data, project])
  const projectSkills = projectPluginsQuery.data?.skills ?? []
  const scripts = useMemo(() => (scriptsQuery.data ?? []).slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.ID - b.ID), [scriptsQuery.data])
  const createScript = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('请选择项目')
      const scriptNumber = scripts.length + 1
      return createWorkspaceScript(projectId, {
        title: `新剧本 ${scriptNumber}`,
        script_type: 'uncategorized',
        content: '',
        raw_source: '',
        summary: '',
      }, workspaceContext)
    },
    onSuccess: (created) => {
      invalidateScriptMutationResult(queryClient, scriptCreatedResult({ projectId, changedIds: [created.ID] }))
      toast.success('剧本已创建')
      navigate(withRouteParams(ROUTES.project.scripts, { script_id: created.ID }))
    },
    onError: () => toast.error('创建剧本失败，请重试'),
  })
  const nextActionIsScriptWorkbench = overviewModel.nextLane?.definition.id === 'orchestration_production'

  return (
    <AppContentLayout variant="contained" width="wide" contentClassName="space-y-5 py-5">
      <ProjectSurfaceHeader
        icon={LayoutDashboard}
        title={project?.name ?? '项目首页'}
        description={project?.description || '项目首页汇总当前项目的规范、剧本、内容编排和素材准备状态。'}
        meta={(
          <>
            <StatusBadge {...projectBlockedSummaryRecipe(overviewModel.blockedCount)}>
              {overviewModel.blockedCount > 0 ? `${overviewModel.blockedCount} 个事项待处理` : '可继续推进'}
            </StatusBadge>
            {isFetching ? <Badge variant="outline">同步中</Badge> : null}
          </>
        )}
        actions={(
          <>
            <Button asChild variant="outline" className="gap-2">
              <Link to={ROUTES.projects}>
                <Database size={14} />
                切换项目
              </Link>
            </Button>
            {nextActionIsScriptWorkbench ? (
              <Button
                type="button"
                className="gap-2"
                disabled={createScript.isPending || !projectId}
                onClick={() => createScript.mutate()}
              >
                <FilePlus2 size={14} />
                {createScript.isPending ? '创建中' : '添加剧本'}
              </Button>
            ) : (
              <Button asChild className="gap-2">
                <Link to={overviewModel.nextLane?.definition.route ?? ROUTES.project.home}>
                  {overviewModel.nextLane ? projectOverviewNextActionLabel(overviewModel.nextLane.definition) : '进入工作台'}
                  <ArrowRight size={14} />
                </Link>
              </Button>
            )}
          </>
        )}
      />

      <section className="rounded-lg border border-border bg-background p-4">
        {skillToggleError ? (
          <PluginStateBanner tone="danger" icon={<AlertCircle size={12} />}>
            {skillToggleError}
          </PluginStateBanner>
        ) : null}
        <div className={`${skillToggleError ? 'mt-4 ' : ''}grid gap-3 lg:grid-cols-2`}>
          {projectPluginsQuery.isLoading ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 type-label text-muted-foreground">正在读取本地 Skills...</div>
          ) : projectSkills.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 type-label text-muted-foreground">
              当前没有本地 Skill。可以先从插件市场下载安装到本机缓存，再为项目启用。
            </div>
          ) : projectSkills.map((skill) => (
            <ProjectSkillCard
              key={skill.id}
              skill={skill}
              busy={skillTogglingId === skill.id}
              onToggle={(enabled) => void handleProjectSkillToggle(skill, enabled)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 type-body font-semibold text-foreground">
              <FileText size={16} className="text-muted-foreground" />
              剧本列表
            </div>
            <p className="mt-1 type-label text-muted-foreground">
              从一份剧本进入编辑、版本管理和后续编排上下文。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={createScript.isPending || !projectId}
            onClick={() => createScript.mutate()}
          >
            <FilePlus2 size={14} />
            {createScript.isPending ? '创建中' : '添加剧本'}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scriptsQuery.isLoading ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 type-label text-muted-foreground">正在读取剧本...</div>
          ) : scripts.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 type-label text-muted-foreground">
              当前项目还没有剧本。点击添加剧本后会直接进入这份剧本的编辑工作台。
            </div>
          ) : scripts.map((script) => (
            <ProjectOverviewScriptCard key={script.ID} script={script} />
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {overviewModel.homeEntryLanes.map((lane) => (
          <ProjectOverviewWorkbenchCard key={lane.definition.id} lane={lane} />
        ))}
      </section>
    </AppContentLayout>
  )
}
