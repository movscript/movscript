import {
  buildScriptTermGroups,
  inferScriptIntentTerms,
  normalizeScriptAliasGroups,
  normalizeScriptTermList,
} from './matching'
import type { ScriptTermGroup } from './types'
import { clampNumber, getOptionalString, normalizeListLimit } from './utils'

export interface ScriptLocateQuery {
  windowLines: number
  limit: number
  includeExcerpt: boolean
  intent: string
  aliasGroups: string[][]
  explicitQueries: string[]
  explicitMust: string[]
  explicitShould: string[]
  inferredTerms: string[]
  excludeGroups: ScriptTermGroup[]
  queryGroups: ScriptTermGroup[]
  mustGroups: ScriptTermGroup[]
  shouldGroups: ScriptTermGroup[]
  groups: ScriptTermGroup[]
}

export function resolveScriptLocateQuery(args: Record<string, unknown>): ScriptLocateQuery {
  const windowLines = clampNumber(Math.floor(numericArg(args.windowLines) ?? 6), 1, 30)
  const limit = normalizeListLimit(args.limit, 5, 20)
  const includeExcerpt = args.includeExcerpt !== false
  const intent = getOptionalString(args, 'intent') ?? ''
  const aliasGroups = normalizeScriptAliasGroups(args.aliasGroups)
  const explicitQueries = [...normalizeScriptTermList(args.query), ...normalizeScriptTermList(args.queries)]
  const explicitMust = normalizeScriptTermList(args.must)
  const explicitShould = normalizeScriptTermList(args.should)
  const excludeGroups = buildScriptTermGroups(normalizeScriptTermList(args.exclude), [], 'should')
  const inferredTerms = explicitQueries.length + explicitMust.length + explicitShould.length > 0 ? [] : inferScriptIntentTerms(intent)
  const queryGroups = buildScriptTermGroups([...explicitQueries, ...inferredTerms], aliasGroups, 'query')
  const mustGroups = buildScriptTermGroups(explicitMust, aliasGroups, 'must')
  const shouldGroups = buildScriptTermGroups(explicitShould, aliasGroups, 'should')
  const groups = [...mustGroups, ...queryGroups, ...shouldGroups]

  return {
    windowLines,
    limit,
    includeExcerpt,
    intent,
    aliasGroups,
    explicitQueries,
    explicitMust,
    explicitShould,
    inferredTerms,
    excludeGroups,
    queryGroups,
    mustGroups,
    shouldGroups,
    groups,
  }
}

function numericArg(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}
