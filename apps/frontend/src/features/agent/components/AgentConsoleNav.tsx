import { Link, useLocation } from 'react-router-dom'
import { BarChart3, Blocks, Bot, ClipboardList, Database, FileCog } from 'lucide-react'
import {
  AgentConsoleNavItem,
  AgentConsoleNavLinkWrapper,
  AgentConsoleNavList,
  AgentConsoleNavMeta,
  AgentConsoleNavMetaRow,
  AgentConsoleNavShell,
} from '@movscript/ui'
import { ROUTES } from '@/routes/projectRoutes'
import { enabledAgentProviders, normalizeAgentProviderSettings, useAgentProviderConfigStore } from '@/features/agent/state/agentProviderConfigStore'

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
    to: ROUTES.agentsMovscript,
    label: 'Agents',
    description: 'MovScript Agent、Codex 启用与生命周期',
    icon: Bot,
    match: ['/agents', ROUTES.agentSettings, ROUTES.agentRuns],
  },
  {
    to: ROUTES.plugins,
    label: 'Plugins',
    description: '全局插件、Pack、Skills/Tools 贡献',
    icon: Blocks,
    match: [ROUTES.plugins, ROUTES.legacyAgentPlugins],
  },
  {
    to: ROUTES.workspaceConfig,
    label: 'Workspace Config',
    description: '.movscript workspace 配置文件',
    icon: FileCog,
    match: [ROUTES.workspaceConfig, ROUTES.agentFiles],
  },
] as const

export function AgentConsoleNav({ compact = false }: { compact?: boolean }) {
  const location = useLocation()
  const savedSettings = useAgentProviderConfigStore((state) => state.settings)
  const enabledCount = enabledAgentProviders(normalizeAgentProviderSettings(savedSettings)).length
  return (
    <AgentConsoleNavShell compact={compact}>
      <nav aria-label="Agent 控制台全局导航">
        <AgentConsoleNavList>
          {agentConsoleSections.map((section) => {
            const Icon = section.icon
            const active = sectionIsActive(section, location.pathname)
            const description = section.label === 'Agents'
              ? `${enabledCount} 个 Agent 启用`
              : section.description
            return (
              <AgentConsoleNavLinkWrapper key={section.to}>
                <Link to={section.to}>
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
              插件和 workspace 配置是全局入口
            </AgentConsoleNavMeta>
            <AgentConsoleNavMeta>
              Agent 页面只负责 MovScript / Codex 的启用、关闭、配置和运行状态
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
