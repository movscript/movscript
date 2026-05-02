import { Badge } from '@movscript/ui'
import type { Setting } from '@/types'
import { cn } from '@/lib/utils'

export const DEFAULT_SETTING_STATUS = 'draft'

export const BUILT_IN_SETTING_TYPES = [
  { value: 'character', label: '人物' },
  { value: 'location', label: '地点' },
  { value: 'prop', label: '道具' },
  { value: 'style', label: '风格' },
  { value: 'product', label: '产品' },
  { value: 'asset', label: '素材' },
]

const statusLabels: Record<string, string> = {
  draft: '草稿',
  active: '进行中',
  confirmed: '已确认',
  locked: '已锁定',
  archived: '已归档',
  missing: '缺失',
  review: '待审',
}

export function settingTypeLabel(type?: string) {
  if (!type) return '未分类'
  return BUILT_IN_SETTING_TYPES.find((item) => item.value === type)?.label ?? type
}

export function settingStatusLabel(status?: string) {
  if (!status) return '未设置'
  return statusLabels[status] ?? status
}

export function normalizeSettingStateTags(value?: string, fallbackStatus?: string): Record<string, string[]> {
  const fallback = fallbackStatus ? { [fallbackStatus]: [] } : {}
  if (!value?.trim()) return fallback
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return Object.fromEntries(parsed.map((item) => [String(item), []]))
    }
    if (parsed && typeof parsed === 'object') {
      return Object.fromEntries(Object.entries(parsed).map(([key, tags]) => [
        key,
        Array.isArray(tags) ? tags.map(String) : [],
      ]))
    }
  } catch {
    return Object.fromEntries(value.split(',').map((item) => item.trim()).filter(Boolean).map((item) => [item, []]))
  }
  return fallback
}

export function buildSettingStateOptions(states: Record<string, string[]>, fallbackStatus?: string) {
  const options = Object.keys(states).filter(Boolean)
  if (fallbackStatus && !options.includes(fallbackStatus)) options.unshift(fallbackStatus)
  return options.length > 0 ? options : fallbackStatus ? [fallbackStatus] : []
}

export function SettingStatusBadge({ status }: { status?: string }) {
  const tone = status === 'locked' || status === 'confirmed'
    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : status === 'review' || status === 'missing'
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
      : 'bg-muted text-muted-foreground'

  return <Badge variant="secondary" className={cn('text-[10px]', tone)}>{settingStatusLabel(status)}</Badge>
}

export function SettingDetailEditor({ setting, className }: { setting: Setting; projectId?: number; className?: string }) {
  const tags = parseTags(setting.tags)
  const states = buildSettingStateOptions(normalizeSettingStateTags(setting.state_tags, setting.status), setting.status)

  return (
    <section className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{settingTypeLabel(setting.type)}</span>
            <SettingStatusBadge status={setting.status} />
          </div>
          <h2 className="mt-2 text-lg font-semibold text-foreground">{setting.name}</h2>
          {setting.alias ? <p className="mt-1 text-xs text-muted-foreground">{setting.alias}</p> : null}
        </div>
      </div>
      <div className="space-y-4 p-4">
        <InfoBlock label="描述" value={setting.description || setting.content || '暂无描述'} />
        {tags.length > 0 ? <TagBlock label="标签" items={tags} /> : null}
        {states.length > 0 ? <TagBlock label="状态" items={states.map(settingStatusLabel)} /> : null}
        {setting.profile_json ? <InfoBlock label="档案 JSON" value={setting.profile_json} /> : null}
      </div>
    </section>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{value}</p>
    </div>
  )
}

function TagBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => <span key={item} className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{item}</span>)}
      </div>
    </div>
  )
}

function parseTags(value?: string) {
  if (!value?.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return []
}
