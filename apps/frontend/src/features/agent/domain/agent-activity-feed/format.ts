import type { AgentActivityTokenUsage } from './types'

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '--'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

export function formatTokenUsage(usage: AgentActivityTokenUsage): string | undefined {
  const total = usage.totalTokens ?? sumNumbers(usage.inputTokens, usage.outputTokens)
  if (total === undefined) return undefined
  const parts = [`${formatInteger(total)} tokens`]
  if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
    parts.push(`in ${formatInteger(usage.inputTokens ?? 0)} / out ${formatInteger(usage.outputTokens ?? 0)}`)
  }
  if (usage.cachedInputTokens !== undefined) {
    parts.push(`cache ${formatInteger(usage.cachedInputTokens)}`)
  }
  if (usage.reasoningTokens !== undefined && usage.reasoningTokens > 0) {
    parts.push(`reason ${formatInteger(usage.reasoningTokens)}`)
  }
  return parts.join('，')
}

export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export function sumNumbers(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined && right === undefined) return undefined
  return (left ?? 0) + (right ?? 0)
}

export function compactLines(lines: Array<string | undefined>): string[] {
  return lines.filter((line): line is string => !!line?.trim())
}
