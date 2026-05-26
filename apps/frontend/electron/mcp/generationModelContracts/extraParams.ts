import { isRecord } from '../valueUtils'

export interface GenerationExtraParamAudit {
  extraParams?: string
  providedKeys: string[]
  submittedKeys: string[]
  droppedKeys: string[]
  submittedParams?: Record<string, unknown>
  dropReasons?: Record<string, string>
  renamedKeys?: Record<string, string>
  parseError?: string
}

export function normalizeGenerationExtraParams(value: unknown, supportedParamKeys?: Set<string>): GenerationExtraParamAudit {
  if (value === undefined || value === null) {
    return { providedKeys: [], submittedKeys: [], droppedKeys: [] }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return { providedKeys: [], submittedKeys: [], droppedKeys: [] }
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (isRecord(parsed)) return normalizeGenerationExtraParams(parsed, supportedParamKeys)
    } catch (error) {
      return {
        extraParams: trimmed,
        providedKeys: [],
        submittedKeys: [],
        droppedKeys: [],
        parseError: error instanceof Error ? error.message : String(error),
      }
    }
    return {
      extraParams: trimmed,
      providedKeys: [],
      submittedKeys: [],
      droppedKeys: [],
    }
  }
  if (isRecord(value)) {
    const providedKeys = Object.keys(value)
    const params: Record<string, unknown> = {}
    const droppedKeys: string[] = []
    const renamedKeys: Record<string, string> = {}
    for (const [key, paramValue] of Object.entries(value)) {
      const canonicalKey = canonicalGenerationParamKey(key)
      if (supportedParamKeys && !supportedParamKeys.has(canonicalKey)) {
        droppedKeys.push(key)
        continue
      }
      if (canonicalKey !== key) renamedKeys[key] = canonicalKey
      if (params[canonicalKey] === undefined || key === canonicalKey) {
        params[canonicalKey] = paramValue
      }
    }
    const submittedKeys = Object.keys(params)
    return {
      extraParams: submittedKeys.length > 0 ? JSON.stringify(params) : undefined,
      providedKeys,
      submittedKeys,
      droppedKeys,
      ...(submittedKeys.length > 0 ? { submittedParams: params } : {}),
      ...(droppedKeys.length > 0 ? { dropReasons: Object.fromEntries(droppedKeys.map((key) => [key, 'unsupported_extra_param'])) } : {}),
      ...(Object.keys(renamedKeys).length > 0 ? { renamedKeys } : {}),
    }
  }
  return { providedKeys: [], submittedKeys: [], droppedKeys: [] }
}

function canonicalGenerationParamKey(key: string): string {
  switch (key) {
    case 'ratio':
      return 'aspect_ratio'
    case 'duration_seconds':
      return 'duration'
    case 'size':
      return 'image_size'
    case 'guidance_scale':
      return 'prompt_strength'
    case 'max_images':
      return 'image_count'
    case 'camera_fixed':
      return 'fixed_camera'
    case 'generate_audio':
      return 'audio'
    default:
      return key
  }
}
