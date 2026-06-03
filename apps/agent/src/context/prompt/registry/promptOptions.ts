import type { PromptOptions } from './promptFragmentProvider.js'

export function resolvePromptOptions(value: unknown): PromptOptions {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return {
    includeFinalSourceBlock: record.finalSourceBlock === false ? false : true,
  }
}
