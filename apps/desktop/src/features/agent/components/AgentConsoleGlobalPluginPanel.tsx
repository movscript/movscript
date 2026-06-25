import { PackageCheck, RefreshCw } from 'lucide-react'
import { Badge, Switch } from '@movscript/ui/primitives'
import {
  AgentConsoleActionButton,
  AgentConsoleIcon,
  AgentConsoleStack,
  AgentConsoleToneSurfaceBlock,
} from '@/features/agent/components/AgentConsoleUi'
import {
  ConsolePanel,
  EmptyText,
  IssueRow,
} from '@/features/agent/components/AgentConsolePageSections'
import type { ProjectPluginSnapshot } from '@/features/plugins/application/projectPlugins'

export function AgentConsoleGlobalPluginPanel({
  snapshot,
  loading,
  refreshing,
  error,
  togglingKey,
  onRefresh,
  onToggle,
}: {
  snapshot?: ProjectPluginSnapshot
  loading: boolean
  refreshing: boolean
  error?: string
  togglingKey?: string
  onRefresh: () => void
  onToggle: (plugin: ProjectPluginSnapshot['systemPlugins'][number], enabled: boolean) => void
}) {
  const plugins = snapshot?.systemPlugins ?? []
  return (
    <ConsolePanel
      title="全局插件"
      icon={<PackageCheck size={14} />}
      action={(
        <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
          <AgentConsoleIcon icon={RefreshCw} size={12} spinning={refreshing} />
          刷新
        </AgentConsoleActionButton>
      )}
    >
      <AgentConsoleStack>
        {error ? (
          <IssueRow issue={{ id: 'global-plugin-error', title: '全局插件读取失败', detail: error, tone: 'action' }} />
        ) : null}
        {loading ? (
          <EmptyText>正在读取系统插件缓存...</EmptyText>
        ) : plugins.length === 0 ? (
          <EmptyText>系统缓存暂无插件。</EmptyText>
        ) : plugins.map((plugin) => (
          <GlobalPluginCard
            key={plugin.pluginKey}
            plugin={plugin}
            busy={togglingKey === plugin.pluginKey}
            onToggle={(enabled) => onToggle(plugin, enabled)}
          />
        ))}
      </AgentConsoleStack>
    </ConsolePanel>
  )
}

function GlobalPluginCard({
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
  return (
    <AgentConsoleToneSurfaceBlock as="article" variant="subtle" className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PackageCheck size={14} className={enabled ? 'text-foreground' : 'text-muted-foreground'} />
            <h3 className="truncate type-body font-semibold text-foreground">{plugin.displayName ?? plugin.name}</h3>
          </div>
          <p className="mt-1 truncate type-caption text-muted-foreground">{plugin.pluginKey}</p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy || !plugin.installed || builtin}
          aria-label={`${enabled ? '关闭' : '开启'} ${plugin.displayName ?? plugin.name}`}
          onCheckedChange={onToggle}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant={enabled ? 'solid' : 'outline'} tone={enabled ? 'success' : 'neutral'}>
          {enabled ? '全局已开启' : '全局未开启'}
        </Badge>
        <Badge variant={plugin.installed ? 'outline' : 'solid'} tone={plugin.installed ? 'neutral' : 'warning'}>
          {builtin ? '系统内置' : plugin.installed ? '系统缓存' : '缓存缺失'}
        </Badge>
        {builtin ? <Badge variant="outline">系统托管</Badge> : null}
        {plugin.version ? <Badge variant="outline">v{plugin.version}</Badge> : null}
        {plugin.providerTargets.map((target) => (
          <Badge key={target} variant="outline">{providerTargetLabel(target)}</Badge>
        ))}
        {busy ? <Badge variant="outline">切换中</Badge> : null}
      </div>
    </AgentConsoleToneSurfaceBlock>
  )
}

function providerTargetLabel(target: ProjectPluginSnapshot['systemPlugins'][number]['providerTargets'][number]): string {
  if (target === 'codex') return 'Codex'
  if (target === 'mova') return 'Mova'
  return 'Claude'
}
