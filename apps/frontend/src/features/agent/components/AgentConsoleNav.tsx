import { Link, useLocation } from 'react-router-dom'
import { BarChart3, Blocks, Bot, Cable, ClipboardList, Database, FileCog } from 'lucide-react'
import {
  AgentConsoleNavItem,
  AgentConsoleNavLinkWrapper,
  AgentConsoleNavList,
  AgentConsoleNavMeta,
  AgentConsoleNavMetaRow,
  AgentConsoleNavShell,
} from '@movscript/ui'
import { ROUTES } from '@/routes/projectRoutes'
import {
  enabledProviders,
  normalizeProviderSettings,
  usesAppServerProtocol,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import { providerRoute } from '@/features/agent/application/providerRoutes'

const agentConsoleSections = [
  {
    to: ROUTES.agentConsole,
    label: 'Overview',
    description: '全局状态、健康检查和待关注事项',
    icon: BarChart3,
    end: true,
  },
  {
    to: ROUTES.modelProviders,
    label: 'Model Providers',
    description: '本地模型供应商、Base URL、API Key',
    icon: Database,
  },
  {
    to: ROUTES.agents,
    label: 'Agents',
    description: 'Provider 启用与生命周期',
    icon: Bot,
    match: ['/agents', ROUTES.agentSettings, ROUTES.agentRuns],
  },
  {
    to: ROUTES.agentConnections,
    label: 'Connections',
    description: '裸请求、裸返回和 thread 流状态',
    icon: Cable,
  },
  {
    to: ROUTES.plugins,
    label: 'Plugins',
    description: '全局插件、Pack、Skills/Tools 贡献',
    icon: Blocks,
    match: [ROUTES.plugins],
  },
  {
    to: ROUTES.workspaceConfig,
    label: 'Workspace',
    description: 'edit、.build、.movscript/providers',
    icon: FileCog,
    match: [ROUTES.workspaceConfig, ROUTES.agentFiles],
  },
] as const

export function AgentConsoleNav({ compact = false }: { compact?: boolean }) {
  const location = useLocation()
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const settings = normalizeProviderSettings(savedSettings)
  const enabledProviderList = enabledProviders(settings)
  const enabledCount = enabledProviderList.length
  const defaultProvider = settings.providers.find((provider) => provider.id === settings.defaultProviderId)
  const appServerProvider = usesAppServerProtocol(defaultProvider)
    ? defaultProvider
    : enabledProviderList.find(usesAppServerProtocol)
  const agentsRoute = appServerProvider ? providerRoute(appServerProvider) : ROUTES.agents
  return (
    <AgentConsoleNavShell compact={compact}>
      <nav aria-label="Agent 控制台全局导航">
        <AgentConsoleNavList>
          {agentConsoleSections.map((section) => {
            const Icon = section.icon
            const active = sectionIsActive(section, location.pathname)
            const description = section.label === 'Agents'
              ? `${enabledCount} 个 Provider 启用`
              : section.description
            const to = section.label === 'Agents' ? agentsRoute : section.to
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

function sectionIsActive(section: (typeof agentConsoleSections)[number], pathname: string): boolean {
  if ('end' in section && section.end) return pathname === section.to
  if ('match' in section) return section.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return pathname === section.to || pathname.startsWith(`${section.to}/`)
}
