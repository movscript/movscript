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
  normalizeProviderSettings,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import {
  activeAgentProfileForRoute,
  agentProfilesFromProviderSettings,
} from '@/features/agent/application/agentProfileModel'

export function AgentConsoleNav({ compact = false }: { compact?: boolean }) {
  const location = useLocation()
  const activeConsoleTab = agentConsoleTabFromLocation(location.pathname, location.search)
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const settings = normalizeProviderSettings(savedSettings)
  const profiles = agentProfilesFromProviderSettings(settings)
  const currentAgent = activeAgentProfileForRoute(profiles, undefined)
  return (
    <AgentConsoleNavShell compact={compact}>
      <nav aria-label="Agent 控制台全局导航">
        <AgentConsoleNavList>
          {agentConsoleRouteSections.map((section) => {
            const Icon = section.icon
            const active = activeConsoleTab
              ? activeConsoleTab === section.tab
              : agentConsoleSectionMatchesPath(section, location.pathname)
            const description = section.tab === 'console:agents'
              ? `当前：${currentAgent?.label ?? '未选择'}`
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
              Agent Console 只聚焦当前 Agent、会话和待处理状态
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
