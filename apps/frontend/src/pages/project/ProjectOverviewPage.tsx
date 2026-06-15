import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, Blocks, Database, Download, FileText, LayoutDashboard, Loader2, Power, RefreshCw, Store } from 'lucide-react'
import { AppContentLayout, ProjectSurfaceHeader } from '@movscript/ui/layout'
import { Badge, Button, Progress, StatusBadge, Switch } from '@movscript/ui/primitives'
import { toneTextClass } from '@movscript/ui/semantic'

import { projectEntryDefinitions, type ProjectEntryDefinition } from '@/features/project/domain/projectEntryRegistry'
import { projectOverviewKeys } from '@/features/project/application/projectQueries'
import { scriptKeys } from '@/features/scripts/application/scriptQueryKeys'
import { listWorkspaceScripts } from '@/features/scripts/application/scriptWorkspaceRepository'
import {
  projectBlockedSummaryRecipe,
  projectLaneStateRecipe,
} from '@/features/project/presentation/projectSemanticUi'
import { listSemanticEntities, semanticEntityConfig, type SemanticEntityKind, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { workspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'
import type { Script } from '@/types'
import { requireWorkspaceRootAPI } from '@/features/agent/application/movScriptWorkspaceElectron'
import {
  installProviderMarketplacePluginToProject,
  loadProjectPluginSnapshot,
  observeProjectSkills,
  setProjectSkillEnabled,
  type ProjectLocalSkill,
  type ProjectPluginContext,
} from '@/features/plugins/application/projectPlugins'
import {
  loadProviderPluginMarketplaceState,
  type ProviderPluginMarketplaceItem,
} from '@/features/plugins/application/providerPluginMarketplace'
import {
  PluginButtonIcon,
  PluginCardActions,
  PluginCardCopy,
  PluginCardDescription,
  PluginCardDownloadMeta,
  PluginCardFooter,
  PluginCardHeader,
  PluginCardMeta,
  PluginCardSurface,
  PluginCardTagRow,
  PluginCardTitle,
  PluginDialogActions,
  PluginDialogDescription,
  PluginDialogOverlay,
  PluginDialogSurface,
  PluginDialogTitle,
  PluginEmptyState,
  PluginPageCardGrid,
  PluginPageScrollBody,
  PluginStateBanner,
  PluginTagMeta,
} from '@/features/plugins/components/PluginsPageUi'

type LaneState = 'ready' | 'active' | 'blocked' | 'empty'

type HomeRecord = SemanticEntityRecord & {
  description?: string
  summary?: string
  progress?: number
}

interface ProjectOverviewData {
  scriptVersions: HomeRecord[]
  segments: HomeRecord[]
  sceneMoments: HomeRecord[]
  productions: HomeRecord[]
  settings: HomeRecord[]
  assetSlots: HomeRecord[]
  contentUnits: HomeRecord[]
  keyframes: HomeRecord[]
}

interface WorkLane {
  definition: ProjectEntryDefinition
  count: number
  detail: string
  progress: number
  state: LaneState
}

const emptyData: ProjectOverviewData = {
  scriptVersions: [],
  segments: [],
  sceneMoments: [],
  productions: [],
  settings: [],
  assetSlots: [],
  contentUnits: [],
  keyframes: [],
}

async function safeList(projectId: number, kind: SemanticEntityKind): Promise<HomeRecord[]> {
  try {
    return await listSemanticEntities(projectId, semanticEntityConfig(kind)) as HomeRecord[]
  } catch (error) {
    console.warn(`[project-home] failed to load ${kind}`, error)
    return []
  }
}

async function loadProjectOverviewData(projectId: number): Promise<ProjectOverviewData> {
  const [
    scriptVersions,
    segments,
    sceneMoments,
    productions,
    settings,
    assetSlots,
    contentUnits,
    keyframes,
  ] = await Promise.all([
    safeList(projectId, 'scriptVersions'),
    safeList(projectId, 'segments'),
    safeList(projectId, 'sceneMoments'),
    safeList(projectId, 'productions'),
    safeList(projectId, 'settings'),
    safeList(projectId, 'assetSlots'),
    safeList(projectId, 'contentUnits'),
    safeList(projectId, 'keyframes'),
  ])

  return {
    scriptVersions,
    segments,
    sceneMoments,
    productions,
    settings,
    assetSlots,
    contentUnits,
    keyframes,
  }
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

function numberOf(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasText(record: HomeRecord, keys: string[]) {
  return keys.some((key) => typeof record[key] === 'string' && String(record[key]).trim().length > 0)
}

function hasLockedResource(record: HomeRecord) {
  return Boolean(record.locked_asset_slot_id || record.locked_resource_id || record.resource_id || record.lock)
}

function laneLabel(state: LaneState) {
  if (state === 'ready') return '已就绪'
  if (state === 'active') return '进行中'
  if (state === 'blocked') return '待前置'
  return '未开始'
}

function nextActionLabel(definition: ProjectEntryDefinition) {
  if (definition.id === 'project_standards') return '进入项目规范'
  if (definition.id === 'orchestration_production') return '进入剧本工作台'
  if (definition.id === 'content') return '进入 Content'
  return '进入入口'
}

export default function ProjectOverviewPage() {
  const project = useProjectStore((state) => state.current)
  const projectId = project?.ID
  const [marketplaceOpen, setMarketplaceOpen] = useState(false)
  const [projectInstallingKey, setProjectInstallingKey] = useState<string>()
  const [projectInstallError, setProjectInstallError] = useState<string>()
  const [skillTogglingId, setSkillTogglingId] = useState<string>()
  const [skillToggleError, setSkillToggleError] = useState<string>()
  const currentUser = useUserStore((state) => state.currentUser)
  const currentOrgID = useUserStore((state) => state.currentOrgID)
  const orgMemberships = useUserStore((state) => state.orgMemberships)
  const workspaceContext = useMemo(
    () => workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }),
    [currentOrgID, currentUser?.ID, orgMemberships],
  )

  const { data = emptyData, isFetching } = useQuery({
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
  const projectPluginContext = useMemo<ProjectPluginContext>(() => ({
    ...(workspaceRootQuery.data?.workspaceDir ? { workspaceDir: workspaceRootQuery.data.workspaceDir } : {}),
    ...(projectId ? { projectId } : {}),
  }), [projectId, workspaceRootQuery.data?.workspaceDir])
  const projectPluginsQuery = useQuery({
    queryKey: projectOverviewKeys.plugins(projectPluginContext.workspaceDir, projectPluginContext.projectId),
    queryFn: () => loadProjectPluginSnapshot(projectPluginContext),
    enabled: !!projectId && !!workspaceRootQuery.data?.workspaceDir,
  })
  const observedSkillsQuery = useQuery({
    queryKey: projectOverviewKeys.observedSkills(
      projectPluginsQuery.data?.projectCwd,
      projectPluginsQuery.data?.skills.filter((skill) => skill.enabled).length,
    ),
    queryFn: () => observeProjectSkills(projectPluginsQuery.data!.projectCwd),
    enabled: !!projectId && !!projectPluginsQuery.data?.projectCwd,
  })
  const marketplaceQuery = useQuery({
    queryKey: projectOverviewKeys.pluginMarketplace,
    queryFn: () => loadProviderPluginMarketplaceState(),
    enabled: marketplaceOpen,
  })

  async function handleProjectMarketplaceInstall(item: ProviderPluginMarketplaceItem) {
    setProjectInstallingKey(item.key)
    setProjectInstallError(undefined)
    try {
      await installProviderMarketplacePluginToProject(item, projectPluginContext)
      await Promise.all([
        projectPluginsQuery.refetch(),
        observedSkillsQuery.refetch(),
        marketplaceQuery.refetch(),
      ])
    } catch (error) {
      setProjectInstallError(error instanceof Error ? error.message : String(error))
    } finally {
      setProjectInstallingKey(undefined)
    }
  }

  async function handleProjectSkillToggle(skill: ProjectLocalSkill, enabled: boolean) {
    setSkillTogglingId(skill.id)
    setSkillToggleError(undefined)
    try {
      await setProjectSkillEnabled(projectPluginContext, skill.id, enabled)
      await Promise.all([
        projectPluginsQuery.refetch(),
        observedSkillsQuery.refetch(),
      ])
    } catch (error) {
      setSkillToggleError(error instanceof Error ? error.message : String(error))
    } finally {
      setSkillTogglingId(undefined)
    }
  }

  const counts = useMemo(() => {
    const productionProgress = data.productions.length
      ? Math.round(data.productions.reduce((sum, item) => sum + numberOf(item.progress), 0) / data.productions.length)
      : 0
    const readyContentUnits = data.contentUnits.filter((item) => hasText(item, ['title', 'description', 'prompt'])).length
    const readyKeyframes = data.keyframes.filter((item) => hasText(item, ['title', 'description', 'prompt'])).length
    const lockedAssets = data.assetSlots.filter(hasLockedResource).length

    return {
      productionProgress,
      readyContentUnits,
      readyKeyframes,
      lockedAssets,
      missingAssets: Math.max(0, data.assetSlots.length - lockedAssets),
    }
  }, [data])

  const lanes = useMemo<WorkLane[]>(() => {
    const standardsDone = [
      project?.aspect_ratio,
      project?.visual_style,
      project?.project_style,
      data.scriptVersions.length > 0,
      data.settings.length > 0,
    ].filter(Boolean).length
    const standardsProgress = percentage(standardsDone, 5)

    const scriptSignals = data.scriptVersions.length + data.segments.length + data.sceneMoments.length + data.productions.length
    const scriptProgress = Math.max(counts.productionProgress, percentage(data.productions.length + data.sceneMoments.length, Math.max(1, scriptSignals)))
    const contentSignals = data.contentUnits.length + data.keyframes.length + data.assetSlots.length
    const contentProgress = percentage(counts.readyContentUnits + counts.readyKeyframes + counts.lockedAssets, Math.max(1, contentSignals))

    return projectEntryDefinitions.map((definition) => {
      if (definition.id === 'project_standards') {
        return {
          definition,
          count: standardsDone,
          detail: `${data.scriptVersions.length} 个剧本版本，${data.settings.length} 个设定可继承规范`,
          progress: standardsProgress,
          state: standardsProgress >= 70 ? 'ready' : standardsProgress > 0 ? 'active' : 'empty',
        }
      }
      if (definition.id === 'content') {
        return {
          definition,
          count: contentSignals,
          detail: `${data.contentUnits.length} 个内容单元，${counts.missingAssets} 个素材缺口`,
          progress: contentProgress,
          state: data.productions.length === 0 ? 'blocked' : contentProgress >= 70 ? 'ready' : contentSignals > 0 ? 'active' : 'empty',
        }
      }
      return {
        definition,
        count: scriptSignals,
        detail: `${data.productions.length} 个制作，${data.sceneMoments.length} 个情节`,
        progress: scriptProgress,
        state: data.scriptVersions.length === 0 ? 'blocked' : scriptProgress >= 70 ? 'ready' : scriptSignals > 0 ? 'active' : 'empty',
      }
    })
  }, [counts, data, project?.aspect_ratio, project?.project_style, project?.visual_style])

  const blockedCount = lanes.filter((lane) => lane.state === 'blocked').length
  const nextLane = lanes.find((lane) => lane.state === 'blocked') ?? lanes.find((lane) => lane.state === 'active') ?? lanes[0]
  const homeEntryLanes = [
    lanes.find((lane) => lane.definition.id === 'project_standards'),
    lanes.find((lane) => lane.definition.id === 'content'),
  ].filter((lane): lane is WorkLane => Boolean(lane))
  const projectPluginCount = projectPluginsQuery.data?.plugins.length ?? 0
  const preparedProjectPluginCount = projectPluginsQuery.data?.plugins.filter((plugin) => plugin.prepared).length ?? 0
  const projectSkills = projectPluginsQuery.data?.skills ?? []
  const enabledProjectSkillCount = projectSkills.filter((skill) => skill.enabled).length
  const observedSkillCount = observedSkillsQuery.data?.ok
    ? observedSkillsQuery.data.skillCount
    : observedSkillsQuery.isLoading
      ? '...'
      : '未观测'
  const observedSkillErrors = observedSkillsQuery.data?.ok ? observedSkillsQuery.data.errorCount : 0
  const scripts = useMemo(() => (scriptsQuery.data ?? []).slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.ID - b.ID), [scriptsQuery.data])

  return (
    <AppContentLayout variant="contained" width="wide" contentClassName="space-y-5 py-5">
      <ProjectSurfaceHeader
        icon={LayoutDashboard}
        title={project?.name ?? '项目首页'}
        description={project?.description || '项目首页汇总当前项目的规范、剧本、内容编排和素材准备状态。'}
        meta={(
          <>
            <StatusBadge {...projectBlockedSummaryRecipe(blockedCount)}>
              {blockedCount > 0 ? `${blockedCount} 个事项待处理` : '可继续推进'}
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
            <Button asChild className="gap-2">
              <Link to={nextLane?.definition.route ?? ROUTES.project.scripts}>
                {nextLane ? nextActionLabel(nextLane.definition) : '进入工作台'}
                <ArrowRight size={14} />
              </Link>
            </Button>
          </>
        )}
      />

      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 type-body font-semibold text-foreground">
              <Blocks size={16} className="text-muted-foreground" />
              项目插件能力
            </div>
            <p className="mt-1 type-label text-muted-foreground">
              项目插件由 Desktop 准备到项目目录，并以 agent 实际观测到的 skills 作为加载事实。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setMarketplaceOpen(true)}>
              <Blocks size={14} />
              打开插件市场
            </Button>
            <Button asChild size="sm" variant="ghost" className="gap-2">
              <Link to={ROUTES.plugins}>
                全局管理
                <ArrowRight size={14} />
              </Link>
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="项目插件" value={projectPluginsQuery.isLoading ? 0 : projectPluginCount} detail={projectPluginsQuery.isLoading ? '读取中' : `${preparedProjectPluginCount} 个已准备`} />
          <PluginInfoTile label="Agent 观测" value={observedSkillCount} detail={`${observedSkillErrors} 个加载错误`} />
          <PluginInfoTile label="Desktop 缓存" value={projectPluginsQuery.data?.desktopPluginCacheRoot ? '已配置' : '未就绪'} detail={projectPluginsQuery.data?.desktopPluginCacheRoot ? 'plugin-cache' : '等待 Desktop API'} />
          <PluginInfoTile label="启用 Skills" value={projectPluginsQuery.isLoading ? '读取中' : `${enabledProjectSkillCount}/${projectSkills.length}`} detail=".codex/skills + .agents/skills" />
        </div>
        {skillToggleError ? (
          <PluginStateBanner tone="danger" icon={<AlertCircle size={12} />} className="mt-4">
            {skillToggleError}
          </PluginStateBanner>
        ) : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
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
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link to={ROUTES.project.scripts}>
              打开剧本工作台
              <ArrowRight size={14} />
            </Link>
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scriptsQuery.isLoading ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 type-label text-muted-foreground">正在读取剧本...</div>
          ) : scripts.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 type-label text-muted-foreground">
              当前项目还没有剧本。进入剧本工作台后可以创建或导入正文。
            </div>
          ) : scripts.map((script) => (
            <ScriptListCard key={script.ID} script={script} />
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {homeEntryLanes.map((lane) => (
          <WorkbenchCard key={lane.definition.id} lane={lane} />
        ))}
      </section>
      {marketplaceOpen ? (
        <ProjectPluginMarketplaceDialog
          items={marketplaceQuery.data?.items ?? []}
          loading={marketplaceQuery.isLoading || marketplaceQuery.isFetching}
          errors={marketplaceQuery.data?.errors ?? []}
          installError={projectInstallError}
          installingKey={projectInstallingKey}
          onRefresh={() => void marketplaceQuery.refetch()}
          onClose={() => {
            setMarketplaceOpen(false)
            setProjectInstallError(undefined)
          }}
          onInstall={(item) => void handleProjectMarketplaceInstall(item)}
        />
      ) : null}
    </AppContentLayout>
  )
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <p className="type-label text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-7 text-foreground tabular-nums">{value}</p>
      <p className="mt-1 truncate type-caption text-muted-foreground">{detail}</p>
    </div>
  )
}

function ScriptListCard({ script }: { script: Script }) {
  const bodyLength = (script.raw_source || script.content || '').trim().length
  const description = script.summary || script.description || script.plot_summary || '暂无摘要'

  return (
    <Button asChild variant="ghost" className="h-auto justify-start rounded-md border border-border bg-muted/10 p-0 text-left hover:bg-muted/30">
      <Link
        to={withRouteParams(ROUTES.project.scripts, { script_id: script.ID })}
        className="flex min-h-[148px] w-full flex-col items-stretch p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground">
            <FileText size={17} />
          </span>
          <Badge variant="outline">{script.script_type || '剧本'}</Badge>
        </div>
        <div className="mt-4 min-w-0 flex-1">
          <h3 className="truncate type-body font-semibold text-foreground">{script.title || `剧本 #${script.ID}`}</h3>
          <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 type-caption text-muted-foreground">
          <span>{bodyLength > 0 ? `${bodyLength} 字` : '未导入正文'}</span>
          <span className="inline-flex items-center gap-1 text-foreground">
            进入工作台
            <ArrowRight size={13} />
          </span>
        </div>
      </Link>
    </Button>
  )
}

function PluginInfoTile({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <p className="type-label text-muted-foreground">{label}</p>
      <p className="mt-1 truncate type-body font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate type-caption text-muted-foreground">{detail}</p>
    </div>
  )
}

function ProjectSkillCard({
  skill,
  busy,
  onToggle,
}: {
  skill: ProjectLocalSkill
  busy: boolean
  onToggle: (enabled: boolean) => void
}) {
  return (
    <article className="flex min-h-[132px] flex-col rounded-md border border-border bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Power size={14} className={skill.enabled ? toneTextClass('success') : 'text-muted-foreground'} />
            <h3 className="truncate type-body font-semibold text-foreground">{skill.name}</h3>
          </div>
          <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">
            {skill.description ?? '本地 Skill，启用后会投影到当前项目。'}
          </p>
        </div>
        <Switch
          checked={skill.enabled}
          disabled={busy}
          aria-label={`${skill.enabled ? '关闭' : '启用'} ${skill.name}`}
          onCheckedChange={onToggle}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant={skill.enabled ? 'solid' : 'outline'} tone={skill.enabled ? 'success' : 'neutral'}>{skill.enabled ? '已启用' : '未启用'}</Badge>
        <Badge variant="outline">{projectSkillSourceLabel(skill.sourceType)}</Badge>
        {skill.pluginName ? <Badge variant="outline">{skill.pluginName}</Badge> : null}
        {skill.version ? <Badge variant="outline">v{skill.version}</Badge> : null}
        {busy ? <Badge variant="outline">切换中</Badge> : null}
      </div>
      <p className="mt-3 truncate type-caption text-muted-foreground">{skill.projectRelativePath ?? skill.id}</p>
    </article>
  )
}

function projectSkillSourceLabel(sourceType: ProjectLocalSkill['sourceType']) {
  if (sourceType === 'desktop-cache') return 'Desktop 缓存'
  if (sourceType === 'project') return '项目'
  if (sourceType === 'project-catalog') return '项目目录'
  return '插件来源'
}

function ProjectPluginMarketplaceDialog({
  items,
  loading,
  errors,
  installError,
  installingKey,
  onRefresh,
  onClose,
  onInstall,
}: {
  items: ProviderPluginMarketplaceItem[]
  loading: boolean
  errors: Array<{ providerId: string; providerLabel: string; message: string }>
  installError?: string
  installingKey?: string
  onRefresh: () => void
  onClose: () => void
  onInstall: (item: ProviderPluginMarketplaceItem) => void
}) {
  return (
    <PluginDialogOverlay>
      <PluginDialogSurface layout="project-marketplace">
        <PluginDialogTitle>项目插件市场</PluginDialogTitle>
        <PluginDialogDescription>
          安装到当前项目后，MovScript 会写入项目插件清单，并准备 Desktop cache、.codex/skills、.agents/skills 与项目 marketplace。
        </PluginDialogDescription>
        <PluginDialogActions>
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading} loading={loading}>
            {!loading ? <PluginButtonIcon><RefreshCw size={12} /></PluginButtonIcon> : null}
            刷新
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </PluginDialogActions>
        {errors.length > 0 ? (
          <PluginStateBanner tone="danger" icon={<AlertCircle size={12} />}>
            {errors.map((error) => `${error.providerLabel}: ${error.message}`).join(' · ')}
          </PluginStateBanner>
        ) : null}
        {installError ? (
          <PluginStateBanner tone="danger" icon={<AlertCircle size={12} />}>
            {installError}
          </PluginStateBanner>
        ) : null}
        <PluginPageScrollBody layout="project-marketplace">
          {loading && items.length === 0 ? (
            <PluginEmptyState icon={Loader2} title="正在读取插件市场" detail="从当前 app-server provider 汇总可安装插件。" layout="marketplace" />
          ) : items.length === 0 ? (
            <PluginEmptyState icon={Store} title="暂无可安装插件" detail="当前 provider 没有返回插件市场内容。" layout="marketplace" />
          ) : (
            <PluginPageCardGrid layout="project-marketplace">
              {items.map((item) => {
                const installing = installingKey === item.key
                return (
                  <PluginCardSurface key={item.key} spacing="compact">
                    <PluginCardHeader>
                      <PluginCardCopy>
                        <PluginCardTitle>{item.displayName}</PluginCardTitle>
                        <PluginCardMeta>
                          {item.providerLabel} · {item.marketplaceDisplayName}{item.version ? ` · v${item.version}` : ''}
                        </PluginCardMeta>
                      </PluginCardCopy>
                      <PluginCardActions>
                        <Button size="sm" onClick={() => onInstall(item)} disabled={installing} loading={installing}>
                          {!installing ? <PluginButtonIcon><Download size={12} /></PluginButtonIcon> : null}
                          安装到项目
                        </Button>
                      </PluginCardActions>
                    </PluginCardHeader>
                    <PluginCardDescription>{item.description ?? '暂无描述'}</PluginCardDescription>
                    <PluginCardFooter>
                      <PluginCardTagRow>
                        {[item.sourceType, ...item.capabilities, ...item.keywords].slice(0, 4).map((tag) => (
                          <PluginTagMeta key={tag}>{tag}</PluginTagMeta>
                        ))}
                      </PluginCardTagRow>
                      <PluginCardDownloadMeta>{item.sourceLabel}</PluginCardDownloadMeta>
                    </PluginCardFooter>
                  </PluginCardSurface>
                )
              })}
            </PluginPageCardGrid>
          )}
        </PluginPageScrollBody>
      </PluginDialogSurface>
    </PluginDialogOverlay>
  )
}

function WorkbenchCard({ lane }: { lane: WorkLane }) {
  const Icon = lane.definition.icon
  const laneUi = projectLaneStateRecipe(lane.state)

  return (
    <article className="flex min-h-[220px] flex-col rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-foreground">
          <Icon size={17} />
        </span>
        <StatusBadge {...laneUi}>{laneLabel(lane.state)}</StatusBadge>
      </div>
      <div className="mt-4 min-w-0 flex-1">
        <h2 className="type-body font-semibold text-foreground">{lane.definition.title}</h2>
        <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">{lane.definition.purpose}</p>
        <div className="mt-4 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3 type-label">
            <span className="truncate text-muted-foreground">对象数量</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{lane.count}</span>
          </div>
          <p className="mt-1 truncate type-caption text-muted-foreground">{lane.detail}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-3 type-label">
          <span className="text-muted-foreground">准备度</span>
          <span className="font-medium tabular-nums text-foreground">{lane.progress}%</span>
        </div>
        <Progress value={lane.progress} className="h-1.5" />
        <Button asChild variant="outline" size="sm" className="w-full justify-center gap-2">
          <Link to={lane.definition.route}>
            {nextActionLabel(lane.definition)}
            <ArrowRight size={14} />
          </Link>
        </Button>
      </div>
    </article>
  )
}
