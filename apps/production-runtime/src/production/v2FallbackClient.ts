import type { JSONValue } from '../types.js'
import type { ProductionAction, ProductionRun } from './types.js'

export interface ProductionV2FallbackResult {
  performed: boolean
  skippedReason?: string
  url?: string
  response?: JSONValue
}

export interface ProductionV2FallbackClient {
  isEnabled(): boolean
  writeAnalyzeScriptToSections(action: ProductionAction, run: ProductionRun): Promise<ProductionV2FallbackResult>
  writeGenerateKeyframeCandidates(action: ProductionAction, run: ProductionRun): Promise<ProductionV2FallbackResult>
}

export class DisabledProductionV2FallbackClient implements ProductionV2FallbackClient {
  isEnabled(): boolean {
    return false
  }

  async writeAnalyzeScriptToSections(): Promise<ProductionV2FallbackResult> {
    return { performed: false, skippedReason: 'V2 fallback disabled' }
  }

  async writeGenerateKeyframeCandidates(): Promise<ProductionV2FallbackResult> {
    return { performed: false, skippedReason: 'V2 fallback disabled' }
  }
}

export class ScriptPreviewV2FallbackClient implements ProductionV2FallbackClient {
  private readonly baseURL?: string
  private readonly enabled: boolean

  constructor(options: { baseURL?: string; enabled?: boolean } = {}) {
    this.enabled = options.enabled ?? process.env.MOVSCRIPT_PRODUCTION_V2_FALLBACK_ENABLED === 'true'
    this.baseURL = normalizeBaseURL(options.baseURL ?? process.env.MOVSCRIPT_PRODUCTION_V2_FALLBACK_BASE_URL ?? process.env.MOVSCRIPT_BACKEND_API_BASE_URL ?? process.env.MOVSCRIPT_API_BASE_URL)
  }

  isEnabled(): boolean {
    return this.enabled && !!this.baseURL
  }

  async writeAnalyzeScriptToSections(action: ProductionAction, run: ProductionRun): Promise<ProductionV2FallbackResult> {
    if (!this.isEnabled() || !this.baseURL) {
      return { performed: false, skippedReason: 'V2 fallback disabled: set MOVSCRIPT_PRODUCTION_V2_FALLBACK_ENABLED=true and a backend API base URL' }
    }
    if (action.type !== 'AnalyzeScriptToSections') {
      return { performed: false, skippedReason: `V2 fallback does not support ${action.type}` }
    }
    const sourceText = getString(action.inputContext, 'source_text') ?? getString(action.inputContext, 'sourceText')
    if (!sourceText?.trim()) {
      return { performed: false, skippedReason: 'V2 fallback skipped: source_text is missing' }
    }
    const draftId = inferDraftId(action)
    const url = `${this.baseURL}/projects/${encodeURIComponent(String(action.projectId))}/script-preview/analyze`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft_id: draftId,
        source_text: sourceText,
        storyboard_rows: getArray(action.inputContext, 'storyboard_rows') ?? getArray(action.inputContext, 'storyboardRows') ?? [],
      }),
    })
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    if (!response.ok) {
      throw new Error(`V2 script-preview/analyze fallback failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`)
    }
    return {
      performed: true,
      url,
      ...(parsed !== undefined ? { response: parsed } : {}),
    }
  }

  async writeGenerateKeyframeCandidates(action: ProductionAction, run: ProductionRun): Promise<ProductionV2FallbackResult> {
    if (!this.isEnabled() || !this.baseURL) {
      return { performed: false, skippedReason: 'V2 fallback disabled: set MOVSCRIPT_PRODUCTION_V2_FALLBACK_ENABLED=true and a backend API base URL' }
    }
    if (action.type !== 'GenerateKeyframeCandidates') {
      return { performed: false, skippedReason: `V2 fallback does not support ${action.type}` }
    }
    const storyboardRows = inferStoryboardRows(action, run)
    if (storyboardRows.length === 0) {
      return { performed: false, skippedReason: 'V2 fallback skipped: storyboard_rows are missing' }
    }
    const draftId = inferDraftId(action)
    const url = `${this.baseURL}/projects/${encodeURIComponent(String(action.projectId))}/script-preview/generate-preview`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft_id: draftId,
        storyboard_rows: storyboardRows,
      }),
    })
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    if (!response.ok) {
      throw new Error(`V2 script-preview/generate-preview fallback failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`)
    }
    return {
      performed: true,
      url,
      ...(parsed !== undefined ? { response: parsed } : {}),
    }
  }
}

function inferStoryboardRows(action: ProductionAction, run: ProductionRun): JSONValue[] {
  const explicitRows = getArray(action.inputContext, 'storyboard_rows') ?? getArray(action.inputContext, 'storyboardRows')
  if (explicitRows && explicitRows.length > 0) return explicitRows
  const contentUnits = getArray(action.inputContext, 'content_units') ?? getArray(action.inputContext, 'contentUnits')
  if (contentUnits && contentUnits.length > 0) return normalizeRowsFromRecords(contentUnits)
  return run.candidates
    .filter((candidate) => candidate.type === 'keyframe')
    .map((candidate, index) => ({
      client_id: getString(candidate.payload, 'client_id') ?? `keyframe-${index + 1}`,
      order: getNumber(candidate.payload, 'order') ?? index + 1,
      title: getString(candidate.payload, 'title') ?? `Keyframe ${index + 1}`,
      body: getString(candidate.payload, 'visual_prompt') ?? getString(candidate.payload, 'title') ?? '',
      duration_seconds: 6,
      status: '待确认',
    }))
}

function normalizeRowsFromRecords(rows: JSONValue[]): JSONValue[] {
  return rows
    .filter((row): row is Record<string, JSONValue> => isRecord(row))
    .map((row, index) => ({
      client_id: getString(row, 'client_id') ?? getString(row, 'clientId') ?? `row-${index + 1}`,
      order: getNumber(row, 'order') ?? index + 1,
      title: getString(row, 'title') ?? getString(row, 'shot') ?? getString(row, 'summary') ?? `Storyboard row ${index + 1}`,
      body: getString(row, 'body') ?? getString(row, 'description') ?? getString(row, 'visual_prompt') ?? getString(row, 'visualPrompt') ?? '',
      duration_seconds: getNumber(row, 'duration_seconds') ?? getNumber(row, 'durationSeconds') ?? 6,
      status: getString(row, 'status') ?? '待确认',
    }))
}

function inferDraftId(action: ProductionAction): string {
  const explicitDraftId = getString(action.inputContext, 'draft_id') ?? getString(action.inputContext, 'draftId')
  if (explicitDraftId?.trim()) return explicitDraftId.trim()
  const scriptVersion = action.inputContext.script_version ?? action.inputContext.scriptVersion
  if (isRecord(scriptVersion)) {
    const nestedDraftId = scriptVersion.draft_id ?? scriptVersion.draftId
    if (typeof nestedDraftId === 'string' && nestedDraftId.trim()) return nestedDraftId.trim()
  }
  return action.id
}

function normalizeBaseURL(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`
}

function parseJSONText(text: string): JSONValue | undefined {
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text) as JSONValue
  } catch {
    return text
  }
}

function getString(record: Record<string, JSONValue>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function getNumber(record: Record<string, JSONValue>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getArray(record: Record<string, JSONValue>, key: string): JSONValue[] | undefined {
  const value = record[key]
  return Array.isArray(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
