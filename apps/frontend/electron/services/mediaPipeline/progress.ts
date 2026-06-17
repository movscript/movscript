export interface MediaPipelineTimelineProgressReporter {
  report: (chunk: string) => void
  flush: () => Promise<void>
}

export function createTimelineExportProgressReporter(input: {
  durationMs: number
  startPercent: number
  endPercent: number
  onProgress: (
    progressPercent: number,
    currentStep: string,
    event: Record<string, unknown>,
  ) => Promise<void>
}): MediaPipelineTimelineProgressReporter {
  if (input.durationMs <= 0 || input.endPercent <= input.startPercent) {
    return {
      report: () => undefined,
      flush: async () => undefined,
    }
  }
  let buffer = ''
  let lastProgress = input.startPercent
  let pending = Promise.resolve()
  return {
    report: (chunk: string) => {
      buffer = (buffer + chunk).slice(-512)
      const timeMs = parseFFmpegProgressTimeMs(buffer)
      if (timeMs === undefined) return
      const ratio = Math.max(0, Math.min(1, timeMs / input.durationMs))
      const progressPercent = clampProgressPercent(input.startPercent + ratio * (input.endPercent - input.startPercent))
      if (progressPercent < lastProgress + 1 || progressPercent >= 100) return
      lastProgress = progressPercent
      pending = pending.then(() => input.onProgress(progressPercent, `exporting:${formatDurationMs(timeMs)}`, {
        phase: 'timeline.export',
        timeMs,
        durationMs: input.durationMs,
      })).then(() => undefined, () => undefined)
    },
    flush: () => pending,
  }
}

export function parseFFmpegProgressTimeMs(chunk: string): number | undefined {
  const matches = [...chunk.matchAll(/\btime=(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)/g)]
  const match = matches[matches.length - 1]
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (![hours, minutes, seconds].every(Number.isFinite)) return undefined
  return Math.max(0, Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000))
}

export function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function formatDurationMs(value: number): string {
  return `${(Math.max(0, value) / 1000).toFixed(2)}s`
}
