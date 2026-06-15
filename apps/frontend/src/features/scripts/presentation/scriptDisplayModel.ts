import type { ScriptVersion } from '@/shared/infrastructure/api/scriptVersions'
import type { Script } from '@/types'

export function scriptLibraryItemMeta({
  bodyLength,
  scriptTypeLabel,
}: {
  bodyLength: number
  scriptTypeLabel: string
}) {
  return `${bodyLength} 字 · ${scriptTypeLabel}`
}

export function groupScriptsByCategory(scripts: Script[]) {
  const groups = new Map<string, Script[]>()
  for (const script of scripts) {
    const category = categoryLabel(script.script_type)
    const items = groups.get(category) ?? []
    items.push(script)
    groups.set(category, items)
  }
  return Array.from(groups.entries()).map(([category, items]) => ({ category, scripts: items }))
}

export function categoryLabel(value?: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === 'uncategorized' || normalized === 'main') return '未分类'
  return normalized
}

export function scriptWorkspaceSourceText(workspace: Partial<Script>, script: Script) {
  return String(workspace.content ?? workspace.raw_source ?? script.content ?? script.raw_source ?? '')
}

export function scriptVersionSourceText(version: ScriptVersion) {
  return String(version.content || version.raw_source || '')
}

export function scriptEditorLines(value: string) {
  const count = Math.max(1, value.split(/\r\n|\r|\n/).length)
  return Array.from({ length: count }, (_, index) => ({ line_number: index + 1 }))
}

export function normalizeComparableScriptText(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

export function formatDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
