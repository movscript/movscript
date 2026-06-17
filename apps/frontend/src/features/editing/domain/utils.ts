export function numericInput(value: string) {
  return value.replace(/[^\d]/g, '')
}

export function numberInput(value: string) {
  const parsed = Number.parseInt(numericInput(value), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export function safeFileStem(value: string) {
  const stem = value.trim().replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return stem || 'editing-export'
}

export function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(Math.max(Math.round(numberValue), min), max)
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const millis = Math.max(0, Math.floor(durationMs % 1000))
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export function formatEditingProjectTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
