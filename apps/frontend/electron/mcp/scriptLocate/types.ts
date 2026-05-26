export interface ReadonlyScriptScene {
  id: string
  title: string
  startLine: number
  endLine: number
}

export interface ReadonlyScriptFile {
  projectId: number
  scriptVersionId: number
  scriptId: number
  title: string
  versionNumber?: number
  updatedAt?: string
  uri: string
  text: string
  lines: string[]
  scenes: ReadonlyScriptScene[]
}

export interface ScriptLineRange {
  startLine: number
  endLine: number
  maxChars: number
}

export interface ScriptFileRangePayload {
  projectId: number
  scriptVersionId: number
  scriptId: number
  title: string
  uri: string
  startLine: number
  endLine: number
  lineCount: number
  totalLines: number
  text: string
  truncated: boolean
}

export interface ScriptTermGroup {
  label: string
  terms: string[]
  kind: 'query' | 'must' | 'should'
  weight: number
}

export interface ScriptMatchCandidate {
  file: ReadonlyScriptFile
  scene: ReadonlyScriptScene
  startLine: number
  endLine: number
  score: number
  confidence: number
  matchedTerms: string[]
  matchedGroups: string[]
  excerpt?: string
}
