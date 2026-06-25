import { BarChart3, Blocks, Bot, Cable, FileCog, type LucideIcon } from 'lucide-react'

import { ROUTES } from '@/routes/projectRoutes'

export type AgentConsoleTab =
  | 'console'
  | 'console:agents'
  | 'console:connections'

export interface AgentConsoleRouteSection {
  tab: AgentConsoleTab
  canonicalPath: string
  label: string
  description: string
  icon: LucideIcon
  end?: boolean
  matchPaths?: readonly string[]
}

export interface AgentConsoleEnvironmentLink {
  id: 'plugins' | 'workspace'
  canonicalPath: string
  label: string
  description: string
  icon: LucideIcon
}

export const agentConsoleRouteSections = [
  {
    tab: 'console',
    canonicalPath: ROUTES.agentConsole,
    label: 'Overview',
    description: '当前 Agent、会话和待关注事项',
    icon: BarChart3,
    end: true,
  },
  {
    tab: 'console:agents',
    canonicalPath: ROUTES.agents,
    label: 'Agent',
    description: '选择当前 Agent 与用户可见配置',
    icon: Bot,
    matchPaths: [ROUTES.agents, ROUTES.agentSettings],
  },
  {
    tab: 'console:connections',
    canonicalPath: ROUTES.agentConnections,
    label: 'Diagnostics',
    description: '连接、事件流和原始诊断',
    icon: Cable,
  },
] as const satisfies readonly AgentConsoleRouteSection[]

export const agentConsoleEnvironmentLinks = [
  {
    id: 'plugins',
    canonicalPath: ROUTES.plugins,
    label: 'Plugins',
    description: '全局插件、Provider Pack、Skills/Tools 贡献',
    icon: Blocks,
  },
  {
    id: 'workspace',
    canonicalPath: ROUTES.workspaceConfig,
    label: 'Workspace',
    description: 'Workspace root、source files、providers 配置',
    icon: FileCog,
  },
] as const satisfies readonly AgentConsoleEnvironmentLink[]

export function agentConsoleSettingsRoute(tab: AgentConsoleTab): string {
  return tab === 'console'
    ? ROUTES.agentConsole
    : `${ROUTES.appSettings}?tab=${encodeURIComponent(tab)}`
}

export function agentConsoleTabFromLocation(pathname: string, search: string): AgentConsoleTab | undefined {
  if (pathname === ROUTES.agentConsole) return 'console'
  const directSection = agentConsoleRouteSections.find((section) => agentConsoleSectionMatchesPath(section, pathname))
  if (directSection) return directSection.tab
  if (pathname !== ROUTES.appSettings) return undefined
  const tab = new URLSearchParams(search).get('tab')
  return isAgentConsoleTab(tab) ? tab : undefined
}

export function isAgentConsoleTab(value: unknown): value is AgentConsoleTab {
  return typeof value === 'string' && agentConsoleRouteSections.some((section) => section.tab === value)
}

export function agentConsoleSectionForTab(tab: AgentConsoleTab): AgentConsoleRouteSection {
  return agentConsoleRouteSections.find((section) => section.tab === tab) ?? agentConsoleRouteSections[0]
}

export function agentConsoleSectionMatchesPath(section: AgentConsoleRouteSection, pathname: string): boolean {
  if (section.end) return pathname === section.canonicalPath
  const matchPaths = section.matchPaths ?? [section.canonicalPath]
  return matchPaths.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
