import type { ProjectEntrySessionSnapshot } from '../../project/application/projectEntrySessionStore'
import type {
  ContentWorkspaceTab,
  InspectorSelectionRef,
  SettingKind,
} from '../components/contentCanvasWorkspaceTypes'

export interface ContentCanvasProjectEntrySessionState {
  activeKind?: SettingKind | 'all'
  activeCanvasNodeId: string
  selectedNodeId: string
  selectionKind: InspectorSelectionRef['kind']
  workspaceTab: ContentWorkspaceTab
}

export function buildContentCanvasProjectEntrySessionSearch(state: ContentCanvasProjectEntrySessionState): string {
  const params = new URLSearchParams()
  params.set('tab', state.workspaceTab)
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
  const derivedSelection = contentCanvasDerivedSelectionFromSearch(searchParams)
  const selectedNodeId = searchParams.get('node')?.trim() || derivedSelection?.nodeId
  if (!selectedNodeId) return null
  const activeCanvasNodeId = searchParams.get('canvasNode')?.trim() || selectedNodeId
  const workspaceTab = normalizeContentWorkspaceTab(searchParams.get('tab'))
    ?? legacyWorkspaceTabFromMode(searchParams.get('mode'))
    ?? 'preview'
  return {
    activeCanvasNodeId,
    selectedNodeId,
    selectionKind: normalizeContentCanvasSelectionKind(searchParams.get('kind')) ?? derivedSelection?.selectionKind ?? 'scene_moment',
    workspaceTab,
    ...(normalizeContentCanvasActiveKind(searchParams.get('settingKind')) ? { activeKind: normalizeContentCanvasActiveKind(searchParams.get('settingKind')) } : {}),
  }
}

function contentCanvasDerivedSelectionFromSearch(searchParams: URLSearchParams): {
  nodeId: string
  selectionKind: InspectorSelectionRef['kind']
} | undefined {
  const settingId = searchParamValue(searchParams, ['setting_id', 'settingId'])
    ?? idFromTargetRef(searchParamValue(searchParams, ['targetRef', 'target_ref']), 'setting')
  if (settingId) return { nodeId: `setting:${settingId}`, selectionKind: 'setting' }

  const settingStateId = searchParamValue(searchParams, ['setting_state_id', 'settingStateId', 'state_id', 'stateId'])
    ?? idFromTargetRef(searchParamValue(searchParams, ['targetRef', 'target_ref']), 'state')
  if (settingStateId) return { nodeId: `state:${settingStateId}`, selectionKind: 'state' }

  const assetId = searchParamValue(searchParams, ['asset_id', 'assetId', 'asset_slot_id', 'assetSlotId'])
    ?? idFromTargetRef(searchParamValue(searchParams, ['targetRef', 'target_ref']), 'asset')
  if (assetId) return { nodeId: `asset:${assetId}`, selectionKind: 'asset' }

  const productionId = searchParamValue(searchParams, ['productionId', 'production_id'])
    ?? searchParamValue(searchParams, ['scopeRef', 'scope_ref'])
    ?? idFromTimelineAssemblyRef(searchParamValue(searchParams, [
      'timeline_assembly_ref',
      'timelineAssemblyRef',
      'targetRef',
      'target_ref',
    ]))
  if (productionId) return { nodeId: `production:${productionId}`, selectionKind: 'other' }
  return undefined
}

function contentCanvasProjectEntrySessionStateFromSnapshot(snapshot: ProjectEntrySessionSnapshot | null | undefined): ContentCanvasProjectEntrySessionState | null {
  const selectedNodeId = stringFilterValue(snapshot?.filters?.selectedNodeId)
  if (!selectedNodeId) return null
  const activeCanvasNodeId = stringFilterValue(snapshot?.filters?.activeCanvasNodeId) ?? selectedNodeId
  const workspaceTab = normalizeContentWorkspaceTab(snapshot?.filters?.workspaceTab)
    ?? legacyWorkspaceTabFromMode(snapshot?.filters?.canvasMode)
    ?? 'preview'
  return {
    activeCanvasNodeId,
    selectedNodeId,
    selectionKind: normalizeContentCanvasSelectionKind(snapshot?.filters?.selectionKind) ?? 'scene_moment',
    workspaceTab,
    ...(normalizeContentCanvasActiveKind(snapshot?.filters?.activeKind) ? { activeKind: normalizeContentCanvasActiveKind(snapshot?.filters?.activeKind) } : {}),
  }
}

function stringFilterValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function searchParamValue(searchParams: URLSearchParams, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = searchParams.get(key)?.trim()
    if (value) return value
  }
  return undefined
}

function idFromTimelineAssemblyRef(value: string | undefined): string | undefined {
  if (!value?.startsWith('timeline_assembly:')) return undefined
  const [, , ...tail] = value.split(':')
  const id = tail.join(':').trim()
  return id || undefined
}

function idFromTargetRef(value: string | undefined, prefix: string): string | undefined {
  const marker = `${prefix}:`
  if (!value?.startsWith(marker)) return undefined
  const id = value.slice(marker.length).trim()
  return id || undefined
}

function normalizeContentWorkspaceTab(value: unknown): ContentWorkspaceTab | undefined {
  if (value === 'preview' || value === 'canvas') return value
  return undefined
}

function legacyWorkspaceTabFromMode(value: unknown): ContentWorkspaceTab | undefined {
  if (value === 'prompt') return 'canvas'
  if (value === 'structure' || value === 'scene_moment' || value === 'setting') return 'preview'
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
