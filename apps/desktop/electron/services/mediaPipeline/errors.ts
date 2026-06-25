export class MediaPipelineTaskError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

export function taskError(code: string, message: string): MediaPipelineTaskError {
  return new MediaPipelineTaskError(code, message)
}

export function throwIfTaskCanceled(signal: AbortSignal): void {
  if (signal.aborted) throw taskError('TASK_CANCELED', 'Task was canceled.')
}

export function isTaskCanceled(error: unknown): boolean {
  if (error instanceof MediaPipelineTaskError) {
    return error.code === 'TASK_CANCELED' || error.code === 'TIMELINE_EXPORT_CANCELED'
  }
  return error instanceof Error && error.name === 'FFmpegCanceledError'
}

export function parseMaterializeError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : 'Asset materialization failed.'
  const match = /^([A-Z0-9_]+):\s*(.+)$/.exec(message)
  if (match) return { code: match[1], message: match[2] }
  return { code: 'ASSET_MATERIALIZE_FAILED', message }
}
