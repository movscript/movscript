import { isRecord, stringValue } from '../valueUtils'

export function normalizeProjectStylePatch(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}
  const out: Record<string, unknown> = { ...value }
  if (value.shot_size_system !== undefined) {
    out.shot_size_system = normalizeProjectStyleStringList(value.shot_size_system)
  }
  if (value.negative_rules !== undefined) {
    out.negative_rules = normalizeProjectStyleStringList(value.negative_rules)
  }
  return out
}

function normalizeProjectStyleStringList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : [value]
  return items
    .map((item) => projectStyleListItemToString(item))
    .map((item) => item.trim())
    .filter(Boolean)
}

function projectStyleListItemToString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (!isRecord(value)) return ''
  const key = stringValue(value.key)
  const label = stringValue(value.label)
  const usage = stringValue(value.usage)
  const composition = stringValue(value.composition)
  const description = stringValue(value.description)
  const name = [key, label].filter(Boolean).join(' ')
  const details = [usage, composition, description].filter(Boolean).join('；')
  return [name, details].filter(Boolean).join('：')
}
