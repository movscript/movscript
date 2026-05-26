import { stringArrayModelField } from '../modelContracts'
import type { ScriptMatchCandidate, ScriptTermGroup } from './types'

export function normalizeScriptTermList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return stringArrayModelField(value)
}

export function normalizeScriptAliasGroups(value: unknown): string[][] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const terms = normalizeScriptTermList(item)
    return terms.length > 1 ? [terms] : []
  })
}

export function buildScriptTermGroups(terms: string[], aliasGroups: string[][], kind: ScriptTermGroup['kind']): ScriptTermGroup[] {
  const seen = new Set<string>()
  return terms.flatMap((term) => {
    const normalized = normalizeSearchText(term)
    if (!normalized || seen.has(`${kind}:${normalized}`)) return []
    seen.add(`${kind}:${normalized}`)
    const aliases = aliasGroups.find((group) => group.some((alias) => normalizeSearchText(alias) === normalized)) ?? [term]
    const weight = kind === 'must' ? 6 : kind === 'query' ? 3 : 2
    return [{ label: term, terms: Array.from(new Set([term, ...aliases])), kind, weight }]
  })
}

export function inferScriptIntentTerms(intent: string): string[] {
  const chunks = intent
    .split(/[\s,，。.!！?？:：;；、（）()【】\[\]“”"']+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 16)
  const cjkRuns = Array.from(intent.matchAll(/[\u3400-\u9fff]{2,}/g)).flatMap((match) => {
    const text = match[0]
    if (text.length <= 4) return [text]
    const grams: string[] = []
    for (let index = 0; index < text.length - 1; index += 1) grams.push(text.slice(index, index + 2))
    return grams
  })
  const stop = new Set(['这个', '那个', '那里', '这里', '一下', '一点', '帮我', '需要', '希望', '改得', '改成'])
  return Array.from(new Set([...chunks, ...cjkRuns].filter((item) => !stop.has(item)))).slice(0, 24)
}

export function collectScriptMatches(text: string, groups: ScriptTermGroup[]): { groups: string[]; terms: string[] } {
  const matchedGroups: string[] = []
  const matchedTerms: string[] = []
  for (const group of groups) {
    const term = group.terms.find((candidate) => searchTextIncludes(text, candidate))
    if (!term) continue
    matchedGroups.push(group.label)
    matchedTerms.push(term)
  }
  return {
    groups: Array.from(new Set(matchedGroups)),
    terms: Array.from(new Set(matchedTerms)),
  }
}

function searchTextIncludes(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeSearchText(haystack)
  const normalizedNeedle = normalizeSearchText(needle)
  if (!normalizedHaystack || !normalizedNeedle) return false
  return normalizedHaystack.includes(normalizedNeedle)
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[\s,，。.!！?？:：;；、（）()【】\[\]“”"'`~·\-—_/\\]+/g, '')
}

export function truncateScriptExcerpt(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value
}

export function scriptLocateAmbiguity(candidates: ScriptMatchCandidate[]): 'none' | 'low' | 'medium' | 'high' {
  if (candidates.length === 0) return 'none'
  if (candidates[0].confidence < 0.55) return 'high'
  if (candidates.length === 1) return candidates[0].confidence >= 0.75 ? 'low' : 'medium'
  const gap = candidates[0].confidence - candidates[1].confidence
  if (gap < 0.12) return 'high'
  if (gap < 0.24) return 'medium'
  return 'low'
}

export function dedupeOverlappingScriptCandidates(candidates: ScriptMatchCandidate[]): ScriptMatchCandidate[] {
  const kept: ScriptMatchCandidate[] = []
  for (const candidate of candidates) {
    if (kept.some((item) => item.file.uri === candidate.file.uri && item.scene.id === candidate.scene.id && rangesOverlap(item.startLine, item.endLine, candidate.startLine, candidate.endLine))) {
      continue
    }
    kept.push(candidate)
  }
  return kept.sort((a, b) => b.score - a.score || a.startLine - b.startLine)
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.max(aStart, bStart) <= Math.min(aEnd, bEnd)
}
