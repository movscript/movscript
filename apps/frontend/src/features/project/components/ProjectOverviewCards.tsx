import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Download, FileText, LayoutDashboard, Loader2, PackageCheck, RefreshCw, Store } from 'lucide-react'
import { Badge, Button, Progress, StatusBadge, Switch } from '@movscript/ui/primitives'
import { toneTextClass } from '@movscript/ui/semantic'

import {
  projectOverviewLaneLabel,
  projectOverviewNextActionLabel,
  type ProjectOverviewWorkLane,
} from '@/features/project/presentation/projectOverviewModel'
import { projectLaneStateRecipe } from '@/features/project/presentation/projectSemanticUi'
import type { ProjectPluginSnapshot } from '@/features/plugins/application/projectPlugins'
import type { ProviderPluginMarketplaceItem } from '@/features/plugins/application/providerPluginMarketplace'
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
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'
import type { Script } from '@/types'

export function ProjectOverviewMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <p className="type-label text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-7 text-foreground tabular-nums">{value}</p>
      <p className="mt-1 truncate type-caption text-muted-foreground">{detail}</p>
    </div>
  )
}

export function ProjectOverviewScriptCard({ script }: { script: Script }) {
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
          <Badge variant="outline">{script.script_type || '手记'}</Badge>
        </div>
        <div className="mt-4 min-w-0 flex-1">
          <h3 className="truncate type-body font-semibold text-foreground">{script.title || `手记 #${script.ID}`}</h3>
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

export function ProjectOverviewPluginInfoTile({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail: string
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <p className="type-label text-muted-foreground">{label}</p>
      <p className="mt-1 truncate type-body font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate type-caption text-muted-foreground">{detail}</p>
    </div>
  )
}

export function ProjectSystemPluginCard({
  plugin,
  busy,
  onToggle,
}: {
  plugin: ProjectPluginSnapshot['systemPlugins'][number]
  busy: boolean
  onToggle: (enabled: boolean) => void
}) {
  const builtin = plugin.sourceType === 'builtin'
  const enabled = plugin.globalEnabled || plugin.projectEnabled
  const disabled = busy || !plugin.installed || plugin.globalEnabled || builtin
  return (
    <article className="flex min-h-[148px] flex-col rounded-md border border-border bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PackageCheck size={14} className={enabled ? toneTextClass('success') : 'text-muted-foreground'} />
            <h3 className="truncate type-body font-semibold text-foreground">{plugin.displayName ?? plugin.name}</h3>
          </div>
          <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">
            {plugin.description ?? '系统缓存插件'}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={disabled}
          aria-label={`${enabled ? '关闭' : '启用'} ${plugin.displayName ?? plugin.name}`}
          onCheckedChange={onToggle}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant={enabled ? 'solid' : 'outline'} tone={enabled ? 'success' : 'neutral'}>
          {plugin.globalEnabled ? '全局已开启' : plugin.projectEnabled ? '本项目已开启' : '本项目未开启'}
        </Badge>
        <Badge variant={plugin.installed ? 'outline' : 'solid'} tone={plugin.installed ? 'neutral' : 'warning'}>
          {builtin ? '系统内置' : plugin.installed ? '系统缓存' : '系统缓存缺失'}
        </Badge>
        {plugin.globalEnabled || builtin ? <Badge variant="outline">项目只读</Badge> : null}
        {plugin.version ? <Badge variant="outline">v{plugin.version}</Badge> : null}
        {plugin.providerTargets.map((target) => (
          <Badge key={target} variant="outline">{projectSkillProviderLabel(target)}</Badge>
        ))}
        {busy ? <Badge variant="outline">切换中</Badge> : null}
      </div>
      <p className="mt-3 truncate type-caption text-muted-foreground">{plugin.pluginKey}</p>
    </article>
  )
}

export function ProjectBuiltInStandardsPluginCard({ lane }: { lane?: ProjectOverviewWorkLane }) {
  const statusLabel = lane ? projectOverviewLaneLabel(lane.state) : '内建'
  return (
    <article className="flex min-h-[148px] flex-col rounded-md border border-border bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LayoutDashboard size={14} className={lane?.state === 'ready' ? toneTextClass('success') : 'text-muted-foreground'} />
            <h3 className="truncate type-body font-semibold text-foreground">项目规范</h3>
          </div>
          <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">
            统一项目级画幅、镜头语言、视觉风格、节奏和生成约束。
          </p>
        </div>
        <Button asChild type="button" size="sm" variant="outline">
          <Link to={ROUTES.project.standards}>打开</Link>
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="solid" tone="success">系统内置</Badge>
        <Badge variant="outline">项目能力</Badge>
        <Badge variant="outline">{statusLabel}</Badge>
      </div>
      {lane ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-3 type-caption text-muted-foreground">
            <span className="truncate">{lane.detail}</span>
            <span className="shrink-0 tabular-nums">{lane.progress}%</span>
          </div>
          <Progress value={lane.progress} className="h-1.5" />
        </div>
      ) : (
        <p className="mt-3 truncate type-caption text-muted-foreground">project_standards</p>
      )}
    </article>
  )
}

function projectSkillProviderLabel(providerScope: ProjectPluginSnapshot['systemPlugins'][number]['providerTargets'][number]) {
  if (providerScope === 'codex') return 'Codex'
  if (providerScope === 'mova') return 'Mova'
  return 'Claude'
}

export function ProjectPluginMarketplaceDialog({
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
        <PluginDialogTitle>插件市场</PluginDialogTitle>
        <PluginDialogDescription>
          安装后进入系统缓存，项目开启在 Project Home 完成。
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
            <PluginEmptyState icon={Loader2} title="正在读取插件市场" detail="从当前 Agent provider 汇总可安装插件。" layout="marketplace" />
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
                          安装到系统
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

export function ProjectOverviewWorkbenchCard({ lane }: { lane: ProjectOverviewWorkLane }) {
  const Icon = lane.definition.icon
  const laneUi = projectLaneStateRecipe(lane.state)

  return (
    <article className="flex min-h-[220px] flex-col rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-foreground">
          <Icon size={17} />
        </span>
        <StatusBadge {...laneUi}>{projectOverviewLaneLabel(lane.state)}</StatusBadge>
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
            {projectOverviewNextActionLabel(lane.definition)}
            <ArrowRight size={14} />
          </Link>
        </Button>
      </div>
    </article>
  )
}
