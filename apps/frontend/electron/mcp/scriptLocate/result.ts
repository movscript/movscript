import { readonlyScriptFileRangeURI, summarizeReadonlyScriptFile } from './files'
import type { ScriptLocateQuery } from './query'
import type { ReadonlyScriptFile, ScriptMatchCandidate } from './types'

export function emptyScriptLocateResult(input: {
  projectId?: number
  files: ReadonlyScriptFile[]
}): Record<string, unknown> {
  return {
    projectId: input.projectId,
    scripts: input.files.map(summarizeReadonlyScriptFile),
    ambiguity: 'none',
    candidates: [],
    suggestedQuestion: '需要提供要定位的人物、场景、道具、台词或事件关键词；也可以从 scripts 列表选择 scriptVersionId。',
  }
}

export function scriptLocateResult(input: {
  projectId?: number
  files: ReadonlyScriptFile[]
  query: ScriptLocateQuery
  ambiguity: 'none' | 'low' | 'medium' | 'high'
  candidates: ScriptMatchCandidate[]
}): Record<string, unknown> {
  return {
    projectId: input.projectId,
    scripts: input.files.map(summarizeReadonlyScriptFile),
    query: {
      intent: input.query.intent,
      queries: input.query.explicitQueries,
      must: input.query.explicitMust,
      should: input.query.explicitShould,
      inferred: input.query.inferredTerms,
      aliasGroups: input.query.aliasGroups,
    },
    ambiguity: input.ambiguity,
    suggestedQuestion: scriptLocateSuggestedQuestion(input.ambiguity, input.candidates),
    candidates: input.candidates.map(scriptLocateCandidatePayload),
  }
}

function scriptLocateSuggestedQuestion(
  ambiguity: 'none' | 'low' | 'medium' | 'high',
  candidates: ScriptMatchCandidate[],
): string | undefined {
  if (ambiguity !== 'high' || candidates.length <= 1) return undefined
  return `找到多个相近片段：${candidates.slice(0, 2).map((item) => `${item.scene.title}（${item.startLine}-${item.endLine}行）`).join('；')}。需要确认是哪一段。`
}

function scriptLocateCandidatePayload(candidate: ScriptMatchCandidate): Record<string, unknown> {
  return {
    scriptVersionId: candidate.file.scriptVersionId,
    scriptId: candidate.file.scriptId,
    title: candidate.file.title,
    uri: candidate.file.uri,
    sceneId: candidate.scene.id,
    sceneTitle: candidate.scene.title,
    lineRange: [candidate.startLine, candidate.endLine],
    score: candidate.score,
    confidence: Number(candidate.confidence.toFixed(2)),
    matchedTerms: candidate.matchedTerms,
    matchedGroups: candidate.matchedGroups,
    reason: `匹配 ${candidate.matchedTerms.slice(0, 8).join('、')}`,
    readRef: {
      ref: candidate.file.uri,
      uri: candidate.file.uri,
      readUri: readonlyScriptFileRangeURI(candidate.file.uri, candidate.startLine, candidate.endLine),
      rangeUri: readonlyScriptFileRangeURI(candidate.file.uri, candidate.startLine, candidate.endLine),
      projectId: candidate.file.projectId,
      scriptVersionId: candidate.file.scriptVersionId,
      startLine: candidate.startLine,
      endLine: candidate.endLine,
    },
    ...(candidate.excerpt ? { excerpt: candidate.excerpt } : {}),
  }
}
