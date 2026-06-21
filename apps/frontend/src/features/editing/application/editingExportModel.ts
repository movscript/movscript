import { safeFileStem } from '@/features/editing/domain/utils'

export type EditingExportFormat = 'mp4' | 'hls'
export type EditingExportDialogPhase = 'settings' | 'progress' | 'result'

export type EditingExportDialogState = {
  open: boolean
  phase: EditingExportDialogPhase
  format: EditingExportFormat
  filename: string
  taskId?: string
  errorMessage?: string
}

export function defaultExportFilename(title: string, format: EditingExportFormat) {
  return `${safeFileStem(title)}.${exportFileExtension(format)}`
}

export function normalizeExportFilename(filename: string, title: string, format: EditingExportFormat) {
  const fallback = defaultExportFilename(title, format)
  const trimmed = filename.trim()
  if (!trimmed) return fallback
  const extension = exportFileExtension(format)
  return trimmed.toLowerCase().endsWith(`.${extension}`) ? trimmed : `${trimmed}.${extension}`
}

function exportFileExtension(format: EditingExportFormat) {
  return format === 'hls' ? 'm3u8' : 'mp4'
}
