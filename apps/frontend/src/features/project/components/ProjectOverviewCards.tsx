import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Download, FileText, Loader2, Power, RefreshCw, Store } from 'lucide-react'
import { Badge, Button, Progress, StatusBadge, Switch } from '@movscript/ui/primitives'
import { toneTextClass } from '@movscript/ui/semantic'

import {
  projectOverviewLaneLabel,
  projectOverviewNextActionLabel,
  type ProjectOverviewWorkLane,
} from '@/features/project/presentation/projectOverviewModel'
import { projectLaneStateRecipe } from '@/features/project/presentation/projectSemanticUi'
import type { ProjectLocalSkill } from '@/features/plugins/application/projectPlugins'
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

export function ProjectSkillCard({
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
        <Badge variant="outline">{projectSkillProviderLabel(skill.providerScope)}</Badge>
        <Badge variant="outline">{projectSkillScopeLabel(skill.sourceScope)}</Badge>
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

function projectSkillProviderLabel(providerScope: ProjectLocalSkill['providerScope']) {
  if (providerScope === 'codex') return 'Codex'
  if (providerScope === 'mova') return 'Mova'
  return 'Claude'
}

function projectSkillScopeLabel(sourceScope: ProjectLocalSkill['sourceScope']) {
  if (sourceScope === 'global') return '全局'
  if (sourceScope === 'builtin') return '内置'
  return '项目'
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
        <PluginDialogTitle>项目插件市场</PluginDialogTitle>
        <PluginDialogDescription>
          安装到当前项目后，MovScript 会写入项目插件清单，并准备 Desktop cache、provider-native skills 与项目 marketplace。
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
