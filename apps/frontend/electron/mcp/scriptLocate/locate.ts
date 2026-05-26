import { getMCPContextSnapshot } from '../context/store'
import {
  resolveReadonlyScriptFiles,
  sceneForLine,
  scriptLinesText,
} from './files'
import {
  collectScriptMatches,
  dedupeOverlappingScriptCandidates,
  scriptLocateAmbiguity,
  truncateScriptExcerpt,
} from './matching'
import { resolveScriptLocateQuery } from './query'
import { emptyScriptLocateResult, scriptLocateResult } from './result'
import type { ScriptMatchCandidate } from './types'
import { getOptionalNumber } from './utils'

export async function locateScriptPassages(args: Record<string, unknown>): Promise<unknown> {
  const files = await resolveReadonlyScriptFiles(args)
  const projectId = getOptionalNumber(args, 'projectId') ?? getMCPContextSnapshot().project?.id
  const query = resolveScriptLocateQuery(args)
  if (query.groups.length === 0) return emptyScriptLocateResult({ projectId, files })

  const candidatesByKey = new Map<string, ScriptMatchCandidate>()
  files.forEach((file) => {
    file.lines.forEach((line, lineIndex) => {
      const lineMatches = collectScriptMatches(line, query.groups)
      if (lineMatches.groups.length === 0) return
      const centerLine = lineIndex + 1
      const scene = sceneForLine(file.scenes, centerLine)
      const startLine = Math.max(scene.startLine, centerLine - query.windowLines)
      const endLine = Math.min(scene.endLine, centerLine + query.windowLines)
      const key = `${file.uri}:${scene.id}:${startLine}:${endLine}`
      if (candidatesByKey.has(key)) return
      const rangeText = scriptLinesText(file.lines, startLine, endLine)
      if (collectScriptMatches(rangeText, query.excludeGroups).groups.length > 0) return
      const rangeMatches = collectScriptMatches(rangeText, query.groups)
      const matchedMust = query.mustGroups.filter((group) => rangeMatches.groups.includes(group.label))
      if (query.mustGroups.length > 0 && matchedMust.length < query.mustGroups.length) return
      const matchedQuery = query.queryGroups.filter((group) => rangeMatches.groups.includes(group.label))
      const matchedShould = query.shouldGroups.filter((group) => rangeMatches.groups.includes(group.label))
      const sceneMatches = collectScriptMatches(scene.title, query.groups)
      const score = matchedMust.length * 6 + matchedQuery.length * 3 + matchedShould.length * 2 + sceneMatches.groups.length
      const denominator = Math.max(1, query.mustGroups.length * 6 + query.queryGroups.length * 3 + query.shouldGroups.length * 2)
      candidatesByKey.set(key, {
        file,
        scene,
        startLine,
        endLine,
        score,
        confidence: Math.min(0.98, Math.max(0.12, score / denominator)),
        matchedTerms: rangeMatches.terms,
        matchedGroups: rangeMatches.groups,
        ...(query.includeExcerpt ? { excerpt: truncateScriptExcerpt(rangeText, 1800) } : {}),
      })
    })
  })

  const candidates = dedupeOverlappingScriptCandidates(Array.from(candidatesByKey.values())
    .sort((a, b) => b.score - a.score || a.startLine - b.startLine)
  )
    .slice(0, query.limit)
  const ambiguity = scriptLocateAmbiguity(candidates)

  return scriptLocateResult({
    projectId,
    files,
    query,
    ambiguity,
    candidates,
  })
}
