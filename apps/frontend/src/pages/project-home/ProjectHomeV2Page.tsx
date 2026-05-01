import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clapperboard,
  ClipboardList,
  FileText,
  Film,
  LayoutDashboard,
  PackageCheck,
  Sparkles,
  Video,
  Wand2,
} from 'lucide-react'
import { Badge, Button, Card, Progress } from '@movscript/ui'
import { api } from '@/lib/api'
import { useProjectStore } from '@/store/projectStore'
import type { Asset, Episode, Progress as ProjectProgress, Script, Shot, Storyboard } from '@/types'

type StageState = 'ready' | 'active' | 'blocked'

interface StageItem {
  key: string
  title: string
  description: string
  href: string
  icon: typeof FileText
  state: StageState
  primaryMetric: string
  secondaryMetric: string
  progress: number
}

interface FocusItem {
  key: string
  label: string
  title: string
  href: string
  meta: string
  priority: 'high' | 'medium' | 'low'
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function formatDate(value?: string) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '-'
  }
}

function StateBadge({ state }: { state: StageState }) {
  const { t } = useTranslation()
  const variant = state === 'ready' ? 'success' : state === 'active' ? 'secondary' : 'warning'
  return <Badge variant={variant}>{t(`pages.projectHomeV2.stageState.${state}`)}</Badge>
}

function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string | number
  hint: string
  icon: typeof FileText
}) {
  return (
    <Card className="rounded-lg border-border/80 bg-card/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={17} />
        </span>
      </div>
    </Card>
  )
}

function StageCard({ stage }: { stage: StageItem }) {
  const Icon = stage.icon
  return (
    <Link
      to={stage.href}
      className="group flex min-h-[168px] flex-col rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/45 hover:bg-muted/20"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
          <Icon size={17} />
        </span>
        <StateBadge state={stage.state} />
      </div>
      <div className="mt-4 min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-foreground">{stage.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{stage.description}</p>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-muted-foreground">{stage.primaryMetric}</span>
          <span className="shrink-0 font-medium tabular-nums text-foreground">{stage.secondaryMetric}</span>
        </div>
        <Progress value={stage.progress} className="h-1.5" />
      </div>
    </Link>
  )
}

function FocusRow({ item }: { item: FocusItem }) {
  const { t } = useTranslation()
  const variant = item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'outline'
  return (
    <Link
      to={item.href}
      className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted/40"
    >
      <Badge variant={variant} className="w-16 justify-center">
        {t(`pages.projectHomeV2.priority.${item.priority}`)}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.label} · {item.meta}</p>
      </div>
      <ArrowRight size={15} className="shrink-0 text-muted-foreground" />
    </Link>
  )
}

export default function ProjectHomeV2Page() {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID

  const { data: progress } = useQuery<ProjectProgress>({
    queryKey: ['progress', projectId],
    queryFn: () => api.get(`/projects/${projectId}/progress`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: ['scripts', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: episodes = [] } = useQuery<Episode[]>({
    queryKey: ['episodes-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: assets = [] } = useQuery<Asset[]>({
    queryKey: ['assets', projectId],
    queryFn: () => api.get(`/projects/${projectId}/assets`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: storyboards = [] } = useQuery<Storyboard[]>({
    queryKey: ['storyboards-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: shots = [] } = useQuery<Shot[]>({
    queryKey: ['shots-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/shots`).then((r) => r.data),
    enabled: !!projectId,
  })

  const scriptCount = progress?.scripts ?? scripts.length
  const episodeCount = progress?.episodes ?? episodes.length
  const assetCount = progress?.assets ?? assets.length
  const storyboardTotal = progress?.storyboards.total ?? storyboards.length
  const shotTotal = progress?.shots.total ?? shots.length
  const approvedShots = progress?.shots.is_approved ?? shots.filter((shot) => shot.is_approved || shot.status === 'approved').length
  const readyShots = progress?.shots.prompt_ready ?? shots.filter((shot) => shot.status === 'prompt_ready').length
  const generatedShots = progress?.shots.generated ?? shots.filter((shot) => shot.status === 'generated').length

  const stages = useMemo<StageItem[]>(() => {
    const scriptReady = scriptCount > 0
    const assetReady = assetCount > 0
    const storyboardReady = storyboardTotal > 0
    const shotReady = shotTotal > 0
    const shotProgress = percentage(approvedShots, shotTotal)

    return [
      {
        key: 'script-preview',
        title: t('pages.projectHomeV2.stages.script.title'),
        description: t('pages.projectHomeV2.stages.script.description'),
        href: '/script-preview',
        icon: Film,
        state: scriptReady ? 'ready' : 'active',
        primaryMetric: t('pages.projectHomeV2.metrics.scripts'),
        secondaryMetric: String(scriptCount),
        progress: scriptReady ? 100 : 20,
      },
      {
        key: 'creative-references',
        title: t('pages.projectHomeV2.stages.references.title'),
        description: t('pages.projectHomeV2.stages.references.description'),
        href: '/creative-references',
        icon: Sparkles,
        state: scriptReady ? 'active' : 'blocked',
        primaryMetric: t('pages.projectHomeV2.metrics.episodes'),
        secondaryMetric: String(episodeCount),
        progress: percentage(episodeCount, Math.max(progress?.total_episodes ?? episodeCount, 1)),
      },
      {
        key: 'asset-prep',
        title: t('pages.projectHomeV2.stages.assets.title'),
        description: t('pages.projectHomeV2.stages.assets.description'),
        href: '/assets',
        icon: PackageCheck,
        state: assetReady ? 'ready' : scriptReady ? 'active' : 'blocked',
        primaryMetric: t('pages.projectHomeV2.metrics.assets'),
        secondaryMetric: String(assetCount),
        progress: assetReady ? 100 : scriptReady ? 45 : 10,
      },
      {
        key: 'production',
        title: t('pages.projectHomeV2.stages.production.title'),
        description: t('pages.projectHomeV2.stages.production.description'),
        href: '/production',
        icon: Wand2,
        state: shotReady ? 'active' : assetReady || storyboardReady ? 'active' : 'blocked',
        primaryMetric: t('pages.projectHomeV2.metrics.storyboards'),
        secondaryMetric: String(storyboardTotal),
        progress: storyboardReady ? Math.max(35, percentage(generatedShots + approvedShots, Math.max(shotTotal, 1))) : 12,
      },
      {
        key: 'delivery',
        title: t('pages.projectHomeV2.stages.delivery.title'),
        description: t('pages.projectHomeV2.stages.delivery.description'),
        href: '/delivery',
        icon: Video,
        state: approvedShots > 0 ? 'active' : 'blocked',
        primaryMetric: t('pages.projectHomeV2.metrics.approvedShots'),
        secondaryMetric: `${approvedShots}/${shotTotal}`,
        progress: shotProgress,
      },
    ]
  }, [approvedShots, assetCount, episodeCount, generatedShots, progress?.total_episodes, scriptCount, shotTotal, storyboardTotal, t])

  const focusItems = useMemo<FocusItem[]>(() => {
    const items: FocusItem[] = []
    const scriptsWithoutContent = scripts.filter((script) => !script.content?.trim()).slice(0, 2)
    for (const script of scriptsWithoutContent) {
      items.push({
        key: `script:${script.ID}`,
        label: t('pages.projectHomeV2.focus.script'),
        title: script.title || t('common.emptyTitle'),
        href: `/creation?kind=script&id=${script.ID}`,
        meta: t('pages.projectHomeV2.focus.missingBody'),
        priority: 'high',
      })
    }

    for (const storyboard of storyboards.filter((item) => !item.description?.trim()).slice(0, 2)) {
      items.push({
        key: `storyboard:${storyboard.ID}`,
        label: t('pages.projectHomeV2.focus.storyboard'),
        title: storyboard.title || t('details.storyboardLabel', { order: storyboard.order }),
        href: `/creation?kind=storyboard&id=${storyboard.ID}`,
        meta: t('pages.projectHomeV2.focus.needsDescription'),
        priority: 'medium',
      })
    }

    for (const shot of shots.filter((item) => item.status === 'generated' && !item.is_approved).slice(0, 3)) {
      items.push({
        key: `shot:${shot.ID}`,
        label: t('pages.projectHomeV2.focus.shot'),
        title: shot.description || t('details.shotTitle', { order: shot.order }),
        href: `/creation?kind=shot&id=${shot.ID}`,
        meta: t('pages.projectHomeV2.focus.awaitingApproval'),
        priority: 'medium',
      })
    }

    if (items.length > 0) return items.slice(0, 5)

    return [
      {
        key: 'script-preview',
        label: t('pages.projectHomeV2.focus.nextStep'),
        title: t('pages.projectHomeV2.emptyFocus.scriptPreview'),
        href: '/script-preview',
        meta: t('pages.projectHomeV2.emptyFocus.scriptPreviewMeta'),
        priority: 'low',
      },
      {
        key: 'assets',
        label: t('pages.projectHomeV2.focus.nextStep'),
        title: t('pages.projectHomeV2.emptyFocus.assets'),
        href: '/assets',
        meta: t('pages.projectHomeV2.emptyFocus.assetsMeta'),
        priority: 'low',
      },
    ]
  }, [scripts, shots, storyboards, t])

  const activeStage = stages.find((stage) => stage.state === 'active') ?? stages[0]
  const productionReadiness = Math.round((stages.reduce((sum, stage) => sum + stage.progress, 0) / stages.length))

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-6">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <LayoutDashboard size={17} />
                  </span>
                  <Badge variant="outline">{t('pages.projectHomeV2.badge')}</Badge>
                </div>
                <h1 className="mt-4 truncate text-2xl font-semibold text-foreground">{project?.name}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {project?.description || t('pages.projectHomeV2.noDescription')}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild variant="outline" className="gap-2">
                  <Link to="/creation">
                    <Boxes size={15} /> {t('pages.projectHomeV2.actions.openWorkbench')}
                  </Link>
                </Button>
                <Button asChild className="gap-2">
                  <Link to={activeStage.href}>
                    {t('pages.projectHomeV2.actions.continue')} <ArrowRight size={15} />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label={t('pages.projectHomeV2.metrics.productionReadiness')}
                value={`${productionReadiness}%`}
                hint={t('pages.projectHomeV2.metrics.productionReadinessHint')}
                icon={CheckCircle2}
              />
              <MetricTile
                label={t('pages.projectHomeV2.metrics.scriptAssets')}
                value={`${scriptCount}/${assetCount}`}
                hint={t('pages.projectHomeV2.metrics.scriptAssetsHint')}
                icon={FileText}
              />
              <MetricTile
                label={t('pages.projectHomeV2.metrics.storyboardShots')}
                value={`${storyboardTotal}/${shotTotal}`}
                hint={t('pages.projectHomeV2.metrics.storyboardShotsHint')}
                icon={Clapperboard}
              />
              <MetricTile
                label={t('pages.projectHomeV2.metrics.approvedShots')}
                value={`${approvedShots}/${shotTotal}`}
                hint={t('pages.projectHomeV2.metrics.approvedShotsHint', { count: readyShots })}
                icon={Video}
              />
            </div>
          </div>

          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{t('pages.projectHomeV2.now.title')}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t('pages.projectHomeV2.now.subtitle')}</p>
              </div>
              <StateBadge state={activeStage.state} />
            </div>
            <div className="mt-5 rounded-md border border-border bg-background p-4">
              <p className="text-xs text-muted-foreground">{t('pages.projectHomeV2.now.currentStage')}</p>
              <p className="mt-1 text-base font-semibold text-foreground">{activeStage.title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{activeStage.description}</p>
              <Progress value={activeStage.progress} className="mt-4 h-1.5" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-muted-foreground">{t('pages.projectHomeV2.now.updated')}</p>
                <p className="mt-1 font-medium text-foreground">{formatDate(project?.UpdatedAt)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-muted-foreground">{t('pages.projectHomeV2.now.status')}</p>
                <p className="mt-1 font-medium text-foreground">{project?.status || t('pages.projectHomeV2.now.statusFallback')}</p>
              </div>
            </div>
          </Card>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">{t('pages.projectHomeV2.sections.pipeline')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('pages.projectHomeV2.sections.pipelineHint')}</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {stages.map((stage) => <StageCard key={stage.key} stage={stage} />)}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">{t('pages.projectHomeV2.sections.focus')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('pages.projectHomeV2.sections.focusHint')}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to="/collaboration">
                  <ClipboardList size={14} /> {t('pages.projectHomeV2.actions.viewTasks')}
                </Link>
              </Button>
            </div>
            <div className="space-y-2">
              {focusItems.map((item) => <FocusRow key={item.key} item={item} />)}
            </div>
          </Card>

          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">{t('pages.projectHomeV2.sections.quickLinks')}</h2>
            <div className="mt-4 grid gap-2">
              {[
                { href: '/script-preview', icon: Film, label: t('sidebar.items.scriptPreview') },
                { href: '/creative-references', icon: Sparkles, label: t('sidebar.items.creativeReferences') },
                { href: '/assets', icon: PackageCheck, label: t('sidebar.items.assetPreparation') },
                { href: '/production', icon: Wand2, label: t('sidebar.items.contentProduction') },
                { href: '/delivery', icon: Video, label: t('sidebar.items.delivery') },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
                  >
                    <Icon size={15} className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-foreground">{item.label}</span>
                    <ArrowRight size={14} className="text-muted-foreground" />
                  </Link>
                )
              })}
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
