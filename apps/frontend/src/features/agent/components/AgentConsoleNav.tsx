import { NavLink } from 'react-router-dom'
import { BarChart3, Blocks, ClipboardList, FileSearch, ListTree, Settings } from 'lucide-react'
import {
  AgentConsoleNavItem,
  AgentConsoleNavLinkWrapper,
  AgentConsoleNavList,
  AgentConsoleNavMeta,
  AgentConsoleNavMetaRow,
  AgentConsoleNavShell,
} from '@movscript/ui'
import { ROUTES } from '@/routes/projectRoutes'

const agentConsoleSections = [
  {
    to: ROUTES.agentConsole,
    label: '概览',
    description: '健康状态与待关注事项',
    icon: BarChart3,
    end: true,
  },
  {
    to: ROUTES.agentSettings,
    label: '配置文件与能力设置',
    description: '配置文件、已安装能力、Skills、Tools、模型与运行限制',
    icon: Settings,
  },
  {
    to: ROUTES.plugins,
    label: 'Pack / 插件市场',
    description: 'Pack 安装来源、应用插件与工具扩展',
    icon: Blocks,
  },
  {
    to: ROUTES.agentRuns,
    label: '运行记录',
    description: 'Run 列表与 trace 入口',
    icon: ListTree,
  },
  {
    to: ROUTES.agentWorkspaces,
    label: '工作区索引',
    description: 'Agent 产物查询与业务审阅跳转',
    icon: FileSearch,
  },
] as const

export function AgentConsoleNav({ compact = false }: { compact?: boolean }) {
  return (
    <AgentConsoleNavShell compact={compact}>
      <nav aria-label="Agent 控制台导航">
        <AgentConsoleNavList>
          {agentConsoleSections.map((section) => {
            const Icon = section.icon
            return (
              <AgentConsoleNavLinkWrapper key={section.to}>
                <NavLink to={section.to} end={'end' in section ? section.end : undefined}>
                  {({ isActive }) => (
                    <AgentConsoleNavItem
                      active={isActive}
                      compact={compact}
                      icon={<Icon size={14} />}
                      title={section.label}
                      description={section.description}
                    />
                  )}
                </NavLink>
              </AgentConsoleNavLinkWrapper>
            )
          })}
        </AgentConsoleNavList>
        {!compact && (
          <AgentConsoleNavMetaRow>
            <AgentConsoleNavMeta icon={ClipboardList}>
              业务审阅仍在各业务页面完成
            </AgentConsoleNavMeta>
            <AgentConsoleNavMeta>
              控制台只负责配置文件、已安装能力、工具权限、运行和索引
            </AgentConsoleNavMeta>
          </AgentConsoleNavMetaRow>
        )}
      </nav>
    </AgentConsoleNavShell>
  )
}
