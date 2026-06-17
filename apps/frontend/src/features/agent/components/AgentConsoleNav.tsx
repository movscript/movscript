import { Link, useLocation } from 'react-router-dom'
import { BarChart3, Blocks, Bot, Cable, ClipboardList, Database, FileCog } from 'lucide-react'
import {
  AgentConsoleNavItem,
  AgentConsoleNavLinkWrapper,
  AgentConsoleNavList,
  AgentConsoleNavMeta,
  AgentConsoleNavMetaRow,
  AgentConsoleNavShell
} from '@/features/agent/components/AgentConsoleNavUi'
import { ROUTES } from '@/routes/projectRoutes'
import {
  enabledProviders,
  normalizeProviderSettings,
  usesAppServerProtocol,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'

const agentConsoleSections = [
  {
    tab: 'console',
    to: ROUTES.agentConsole,
    label: 'Overview',
    description: '全局状态、健康检查和待关注事项',
    icon: BarChart3,
    end: true,
  },
  {
    tab: 'console:model-providers',
    to: ROUTES.modelProviders,
    label: 'Provider / Catalog / Route',
    description: 'provider/new-api、Catalog 和 Route',
    icon: Database,
  },
  {
    tab: 'console:agents',
    to: ROUTES.agents,
    label: 'Agents',
    description: 'Provider 启用与生命周期',
    icon: Bot,
    match: ['/agents', ROUTES.agentSettings],
  },
  {
    tab: 'console:connections',
    to: ROUTES.agentConnections,
    label: 'Connections',
    description: '裸请求、裸返回和 thread 流状态',
    icon: Cable,
  },
  {
    tab: 'console:plugins',
    to: ROUTES.plugins,
    label: 'Plugins',
    description: '全局插件、Pack、Skills/Tools 贡献',
    icon: Blocks,
    match: [ROUTES.plugins],
  },
  {
    tab: 'console:workspace',
    to: ROUTES.workspaceConfig,
    label: 'Workspace',
    description: 'source、providers',
    icon: FileCog,
    match: [ROUTES.workspaceConfig, ROUTES.workspaceReview],
  },
] as const

export function AgentConsoleNav({ compact = false }: { compact?: boolean }) {
  const location = useLocation()
  const settingsConsoleTab = settingsHostedConsoleTab(location.pathname, location.search)
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const settings = normalizeProviderSettings(savedSettings)
  const enabledProviderList = enabledProviders(settings)
  const defaultProvider = settings.providers.find((provider) => provider.id === settings.defaultProviderId)
  const currentAgentProvider = usesAppServerProtocol(defaultProvider)
    ? defaultProvider
    : enabledProviderList.find(usesAppServerProtocol)
  return (
    <AgentConsoleNavShell compact={compact}>
      <nav aria-label="Agent 控制台全局导航">
        <AgentConsoleNavList>
          {agentConsoleSections.map((section) => {
            const Icon = section.icon
            const active = settingsConsoleTab
              ? settingsConsoleTab === section.tab
              : sectionIsActive(section, location.pathname)
            const description = section.label === 'Agents'
              ? `当前：${currentAgentProvider?.label ?? '未选择'}`
              : section.description
            const to = settingsHostedConsoleRoute(section.tab)
            return (
              <AgentConsoleNavLinkWrapper key={section.to}>
                <Link to={to}>
                  <AgentConsoleNavItem
                    active={active}
                    compact={compact}
                    icon={<Icon size={14} />}
                    title={section.label}
                    description={description}
                  />
                </Link>
              </AgentConsoleNavLinkWrapper>
            )
          })}
        </AgentConsoleNavList>
        {!compact && (
          <AgentConsoleNavMetaRow>
            <AgentConsoleNavMeta icon={ClipboardList}>
              插件和 workspace root 是全局入口
            </AgentConsoleNavMeta>
            <AgentConsoleNavMeta>
              Agent 页面只负责 provider 的启用、关闭、配置和运行状态
            </AgentConsoleNavMeta>
          </AgentConsoleNavMetaRow>
        )}
      </nav>
    </AgentConsoleNavShell>
  )
}

function settingsHostedConsoleRoute(tab: (typeof agentConsoleSections)[number]['tab']): string {
  return `${ROUTES.appSettings}?tab=${encodeURIComponent(tab)}`
}

function settingsHostedConsoleTab(pathname: string, search: string): (typeof agentConsoleSections)[number]['tab'] | undefined {
  if (pathname === ROUTES.agentConsole) return 'console'
  if (pathname !== ROUTES.appSettings) return undefined
  const tab = new URLSearchParams(search).get('tab')
  return agentConsoleSections.some((section) => section.tab === tab)
    ? tab as (typeof agentConsoleSections)[number]['tab']
    : undefined
}

function sectionIsActive(section: (typeof agentConsoleSections)[number], pathname: string): boolean {
  if ('end' in section && section.end) return pathname === section.to
  if ('match' in section) return section.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return pathname === section.to || pathname.startsWith(`${section.to}/`)
}
