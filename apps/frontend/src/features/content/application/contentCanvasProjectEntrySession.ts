import type { ProjectEntrySessionSnapshot } from '@/features/project/application/projectEntrySessionStore'
import type {
  CanvasMode,
  InspectorSelectionRef,
  SettingKind,
} from '@/features/content/components/contentCanvasWorkspaceTypes'

export interface ContentCanvasProjectEntrySessionState {
  activeKind?: SettingKind | 'all'
  activeCanvasNodeId: string
  canvasMode: CanvasMode
  selectedNodeId: string
  selectionKind: InspectorSelectionRef['kind']
}

export function buildContentCanvasProjectEntrySessionSearch(state: ContentCanvasProjectEntrySessionState): string {
  const params = new URLSearchParams()
  params.set('mode', state.canvasMode)
  params.set('canvasNode', state.activeCanvasNodeId)
  params.set('node', state.selectedNodeId)
  params.set('kind', state.selectionKind)
  if (state.activeKind && state.activeKind !== 'all') params.set('settingKind', state.activeKind)
  return params.toString()
}

export function resolveContentCanvasProjectEntrySessionState(input: {
  hasExplicitSearch: boolean
  searchParams: URLSearchParams
  snapshot?: ProjectEntrySessionSnapshot | null
}): ContentCanvasProjectEntrySessionState | null {
  if (input.hasExplicitSearch) return contentCanvasProjectEntrySessionStateFromSearch(input.searchParams)
  return contentCanvasProjectEntrySessionStateFromSnapshot(input.snapshot)
}

function contentCanvasProjectEntrySessionStateFromSearch(searchParams: URLSearchParams): ContentCanvasProjectEntrySessionState | null {
  const selectedNodeId = searchParams.get('node')?.trim()
  if (!selectedNodeId) return null
  const activeCanvasNodeId = searchParams.get('canvasNode')?.trim() || selectedNodeId
  const canvasMode = normalizeContentCanvasMode(searchParams.get('mode')) ?? 'structure'
  return {
    activeCanvasNodeId,
    canvasMode,
    selectedNodeId,
    selectionKind: normalizeContentCanvasSelectionKind(searchParams.get('kind')) ?? selectionKindForContentCanvasMode(canvasMode),
    ...(normalizeContentCanvasActiveKind(searchParams.get('settingKind')) ? { activeKind: normalizeContentCanvasActiveKind(searchParams.get('settingKind')) } : {}),
  }
}

function contentCanvasProjectEntrySessionStateFromSnapshot(snapshot: ProjectEntrySessionSnapshot | null | undefined): ContentCanvasProjectEntrySessionState | null {
  const selectedNodeId = stringFilterValue(snapshot?.filters?.selectedNodeId)
  if (!selectedNodeId) return null
  const activeCanvasNodeId = stringFilterValue(snapshot?.filters?.activeCanvasNodeId) ?? selectedNodeId
  const canvasMode = normalizeContentCanvasMode(snapshot?.filters?.canvasMode) ?? 'structure'
  return {
    activeCanvasNodeId,
    canvasMode,
    selectedNodeId,
    selectionKind: normalizeContentCanvasSelectionKind(snapshot?.filters?.selectionKind) ?? selectionKindForContentCanvasMode(canvasMode),
    ...(normalizeContentCanvasActiveKind(snapshot?.filters?.activeKind) ? { activeKind: normalizeContentCanvasActiveKind(snapshot?.filters?.activeKind) } : {}),
  }
}

function selectionKindForContentCanvasMode(mode: CanvasMode): InspectorSelectionRef['kind'] {
  return mode === 'structure' || mode === 'prompt' ? 'scene_moment' : 'scene_moment'
}

function stringFilterValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeContentCanvasMode(value: unknown): CanvasMode | undefined {
  if (value === 'structure' || value === 'prompt') return value
  if (value === 'scene_moment' || value === 'setting') return 'structure'
  return undefined
}

function normalizeContentCanvasSelectionKind(value: unknown): InspectorSelectionRef['kind'] | undefined {
  if (
    value === 'scene_moment'
    || value === 'setting'
    || value === 'state'
    || value === 'asset'
    || value === 'other'
  ) {
    return value
  }
  return undefined
}

function normalizeContentCanvasActiveKind(value: unknown): SettingKind | 'all' | undefined {
  if (
    value === 'all'
    || value === 'character'
    || value === 'location'
    || value === 'prop'
    || value === 'costume'
    || value === 'visual_style'
    || value === 'world_rule'
    || value === 'relationship'
    || value === 'sound_motif'
  ) {
    return value
  }
  return undefined
}
