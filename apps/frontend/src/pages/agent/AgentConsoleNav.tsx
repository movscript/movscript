import { NavLink } from 'react-router-dom'
import { BarChart3, Blocks, ClipboardList, FileSearch, Gauge, ListTree, Settings, Terminal } from 'lucide-react'
import { ROUTES } from '@/routes/projectRoutes'
import { cn } from '@/lib/utils'

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
    label: '模型与能力配置',
    description: '模型、运行策略、Profile、Skills、Tools',
    icon: Settings,
  },
  {
    to: ROUTES.plugins,
    label: '插件',
    description: '应用插件、Agent Skills 与工具扩展',
    icon: Blocks,
  },
  {
    to: ROUTES.agentRuns,
    label: '运行记录',
    description: 'Run 列表与 trace 入口',
    icon: ListTree,
  },
  {
    to: ROUTES.agentPerformance,
    label: '性能监控',
    description: 'Metrics、Timeline、慢操作诊断',
    icon: Gauge,
  },
  {
    to: ROUTES.agentDebug,
    label: '高级诊断',
    description: 'Prompt、工具控制台、调试包',
    icon: Terminal,
  },
  {
    to: ROUTES.agentDrafts,
    label: '草稿索引',
    description: 'Agent 产物查询与业务审阅跳转',
    icon: FileSearch,
  },
] as const

export function AgentConsoleNav({ compact = false }: { compact?: boolean }) {
  return (
    <nav
      aria-label="Agent 控制台导航"
      className={cn(
        'border-b border-border bg-muted/20',
        compact ? 'px-4 py-2' : 'px-5 py-3',
      )}
    >
      <div className="flex min-w-0 gap-1 overflow-x-auto">
        {agentConsoleSections.map((section) => {
          const Icon = section.icon
          return (
            <NavLink
              key={section.to}
              to={section.to}
              end={'end' in section ? section.end : undefined}
              className={({ isActive }) => cn(
                'flex min-w-[156px] shrink-0 items-center gap-2 rounded-md border px-2.5 py-2 transition-colors',
                'hover:border-border hover:bg-background hover:text-foreground',
                isActive
                  ? 'border-border bg-background text-foreground shadow-sm'
                  : 'border-transparent text-muted-foreground',
              )}
            >
              <Icon size={14} className="shrink-0" />
              <span className="min-w-0">
                <span className="block truncate type-label font-medium">{section.label}</span>
                {!compact && <span className="mt-0.5 block truncate type-tiny">{section.description}</span>}
              </span>
            </NavLink>
          )
        })}
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-1.5 type-tiny text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1">
            <ClipboardList size={11} />
            业务审阅仍在各业务页面完成
          </span>
          <span className="rounded border border-border bg-background px-2 py-1">
            控制台只负责配置、插件、状态、运行、诊断和索引
          </span>
        </div>
      )}
    </nav>
  )
}
