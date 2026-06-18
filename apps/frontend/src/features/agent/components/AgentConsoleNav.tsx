import { Link, useLocation } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import {
  AgentConsoleNavItem,
  AgentConsoleNavLinkWrapper,
  AgentConsoleNavList,
  AgentConsoleNavMeta,
  AgentConsoleNavMetaRow,
  AgentConsoleNavShell
} from '@/features/agent/components/AgentConsoleNavUi'
import {
  agentConsoleRouteSections,
  agentConsoleSectionMatchesPath,
  agentConsoleSettingsRoute,
  agentConsoleTabFromLocation,
} from '@/features/agent/application/agentConsoleRouteModel'
import {
  enabledProviders,
  normalizeProviderSettings,
  usesAppServerProtocol,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'

export function AgentConsoleNav({ compact = false }: { compact?: boolean }) {
  const location = useLocation()
  const activeConsoleTab = agentConsoleTabFromLocation(location.pathname, location.search)
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
          {agentConsoleRouteSections.map((section) => {
            const Icon = section.icon
            const active = activeConsoleTab
              ? activeConsoleTab === section.tab
              : agentConsoleSectionMatchesPath(section, location.pathname)
            const description = section.label === 'Agents'
              ? `当前：${currentAgentProvider?.label ?? '未选择'}`
              : section.description
            const to = agentConsoleSettingsRoute(section.tab)
            return (
              <AgentConsoleNavLinkWrapper key={section.tab}>
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
              Agent Console 只聚焦 Agent、Runtime 和会话运行态
            </AgentConsoleNavMeta>
            <AgentConsoleNavMeta>
              Plugins 与 Workspace 已归到全局环境入口
            </AgentConsoleNavMeta>
          </AgentConsoleNavMetaRow>
        )}
      </nav>
    </AgentConsoleNavShell>
  )
}
