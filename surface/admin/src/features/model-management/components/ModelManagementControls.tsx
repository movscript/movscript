import { Input } from '@movscript/ui/primitives'
import { Database, Route as RouteIcon, Search, Settings2 } from 'lucide-react'
import type { ModelManagementViewMode } from '../model/modelManagementModel'
const MODEL_ADMIN_PAGE_SIZE = 25
const MODEL_ADMIN_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
export const modelManagementSectionMeta: Array<{
  id: ModelManagementViewMode
  icon: typeof Settings2
  label: string
  description: string
}> = [
  {
    id: 'providers',
    icon: Settings2,
    label: 'API账号管理',
    description: '供应商账号、密钥完整性、连接测试',
  },
  {
    id: 'catalog',
    icon: Database,
    label: '模型管理',
    description: '对外 model id、能力、参数和输入约束',
  },
  {
      id: 'routes',
      icon: RouteIcon,
      label: '路由管理',
      description: '模型到 Provider 通道的覆盖关系',
  },
]

export function normalizeModelAdminSearch(value: string): string {
  return value.trim().toLowerCase()
}

export function modelAdminTextMatches(search: string, values: Array<string | number | undefined | null>): boolean {
  const needle = normalizeModelAdminSearch(search)
  if (!needle) return true
  return values.some((value) => String(value ?? '').toLowerCase().includes(needle))
}

export function modelAdminPaginationSlice<T>(items: T[], page: number, pageSize: number): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const normalizedPage = Math.max(1, Math.min(page, pageCount))
  return {
    page: normalizedPage,
    pageCount,
    items: items.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize),
  }
}

export function ModelAdminSearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative min-w-0 flex-1 sm:min-w-[220px]">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 pl-8 text-sm" />
    </label>
  )
}

export function ModelAdminPageSizeSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      每页
      <select value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground">
        {MODEL_ADMIN_PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}
export function ModelManagementLayerNav({
  activeView,
  onChange,
}: {
  activeView: ModelManagementViewMode
  onChange: (view: ModelManagementViewMode) => void
}) {
  return (
    <nav className="inline-flex w-full flex-col gap-1 rounded-lg border border-border bg-muted/30 p-1 md:w-auto md:flex-row" aria-label="AI provider configuration layers" role="tablist">
      {modelManagementSectionMeta.map((section) => {
        const Icon = section.icon
        const active = section.id === activeView
        return (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(section.id)}
            className={`min-w-0 rounded-md px-3 py-2 text-left transition-colors md:w-64 ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'}`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon size={15} />
              {section.label}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{section.description}</span>
          </button>
        )
      })}
    </nav>
  )
}
