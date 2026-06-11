export const CANVAS_DEBUG_STORAGE_KEY = 'movscript.canvasDebug'

export type CanvasDebugBooleanKey =
  | 'nodes'
  | 'grid'
  | 'media'
  | 'images'
  | 'videos'
  | 'shelf'
  | 'edges'
  | 'shadows'
  | 'controls'
  | 'minimap'
  | 'visibleOnly'

export type CanvasDebugOptions = Record<CanvasDebugBooleanKey, boolean> & {
  enabled: boolean
  source: string
}

export interface CanvasRenderDiagnosticsEnvironment {
  dev: boolean
  renderDiagnostics?: string
}

export const DEFAULT_CANVAS_DEBUG_OPTIONS: CanvasDebugOptions = {
  enabled: false,
  source: 'default',
  nodes: true,
  grid: true,
  media: true,
  images: true,
  videos: true,
  shelf: true,
  edges: true,
  shadows: true,
  controls: true,
  minimap: true,
  visibleOnly: true,
}

const CANVAS_DEBUG_KEY_ALIASES: Record<string, CanvasDebugBooleanKey> = {
  node: 'nodes',
  nodes: 'nodes',
  grid: 'grid',
  media: 'media',
  image: 'images',
  images: 'images',
  img: 'images',
  video: 'videos',
  videos: 'videos',
  shelf: 'shelf',
  resources: 'shelf',
  resourceShelf: 'shelf',
  edges: 'edges',
  edge: 'edges',
  shadows: 'shadows',
  shadow: 'shadows',
  controls: 'controls',
  minimap: 'minimap',
  miniMap: 'minimap',
  visible: 'visibleOnly',
  visibleOnly: 'visibleOnly',
  virtualization: 'visibleOnly',
}

export function parseCanvasDebugOptions(
  search: string,
  readStorage: (key: string) => string | null | undefined = readCanvasDebugStorageValue,
): CanvasDebugOptions {
  const options: CanvasDebugOptions = { ...DEFAULT_CANVAS_DEBUG_OPTIONS }
  applyCanvasDebugSpec(options, readStorage(CANVAS_DEBUG_STORAGE_KEY), 'localStorage')
  const params = new URLSearchParams(search)
  if (params.has('canvasDebug')) {
    applyCanvasDebugSpec(options, params.get('canvasDebug'), 'query')
  }
  for (const [param, value] of params.entries()) {
    if (!param.startsWith('canvasDebug') || param === 'canvasDebug') continue
    const rawKey = param.slice('canvasDebug'.length)
    const key = CANVAS_DEBUG_KEY_ALIASES[rawKey.charAt(0).toLowerCase() + rawKey.slice(1)]
    if (!key) continue
    options.enabled = true
    options.source = 'query'
    options[key] = parseCanvasDebugBool(value, true)
  }
  return options
}

export function canvasRenderDiagnosticsEnabled(
  env: CanvasRenderDiagnosticsEnvironment,
  debugOptions?: CanvasDebugOptions,
) {
  return env.dev && (env.renderDiagnostics === '1' || !!debugOptions?.enabled)
}

export function compactCanvasDebugOptions(options: CanvasDebugOptions) {
  if (!options.enabled) return 'off'
  const flags = (Object.keys(DEFAULT_CANVAS_DEBUG_OPTIONS) as Array<keyof CanvasDebugOptions>)
    .filter((key): key is CanvasDebugBooleanKey => typeof options[key] === 'boolean')
    .map((key) => `${key}=${options[key] ? '1' : '0'}`)
    .join(',')
  return `${options.source}:${flags}`
}

function readCanvasDebugStorageValue(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function parseCanvasDebugBool(value: string | null | undefined, fallback: boolean) {
  if (value == null || value === '') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'on', 'yes', 'y', 'enable', 'enabled'].includes(normalized)) return true
  if (['0', 'false', 'off', 'no', 'n', 'disable', 'disabled'].includes(normalized)) return false
  return fallback
}

function applyCanvasDebugSpec(options: CanvasDebugOptions, raw: string | null | undefined, source: string) {
  if (raw == null) return
  const trimmed = raw.trim()
  if (!trimmed) {
    options.enabled = true
    options.source = source
    return
  }
  const normalized = trimmed.toLowerCase()
  if (['0', 'false', 'off', 'no', 'disabled'].includes(normalized)) {
    options.enabled = false
    options.source = source
    return
  }
  options.enabled = true
  options.source = source
  if (['1', 'true', 'on', 'yes', 'enabled'].includes(normalized)) return
  for (const token of trimmed.split(/[,&;]/)) {
    const part = token.trim()
    if (!part) continue
    const [rawKey, rawValue] = part.split(/[:=]/, 2)
    const key = CANVAS_DEBUG_KEY_ALIASES[rawKey.trim()]
    if (!key) continue
    options[key] = parseCanvasDebugBool(rawValue, true)
  }
}
