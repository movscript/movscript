import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'

import {
  hasExplicitProjectEntrySearchParam,
  useProjectEntrySessionStore,
  type ProjectEntrySessionId,
  type ProjectEntrySessionSnapshot,
} from '../../project/application/projectEntrySessionStore'
import { surfaceRoutePath } from '@movscript/shared'
import {
  buildContentCanvasProjectEntrySessionSearch,
  resolveContentCanvasProjectEntrySessionState,
} from '../application/contentCanvasProjectEntrySession'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { ContentWorkspaceTab, InspectorSelection, InspectorSelectionRef, SettingKind } from './contentCanvasWorkspaceTypes'

type ContentCanvasCreateSelection = Extract<InspectorSelection, {
  kind: 'create_expression_unit' | 'create_keyframe' | 'create_storyboard' | 'create_state' | 'create_asset'
}> | null

interface UseContentCanvasWorkspaceSessionInput {
  activeKind: SettingKind | 'all'
  activeCanvasNodeId: string | null
  graphIndex: {
    nodeById: Map<string, ContentCanvasNode>
  }
  projectEntryId?: ProjectEntrySessionId
  projectId?: number
  searchParams: URLSearchParams
  selection: InspectorSelectionRef
  setActiveKind: Dispatch<SetStateAction<SettingKind | 'all'>>
  setActiveCanvasNodeId: Dispatch<SetStateAction<string | null>>
  setActiveProductionId: Dispatch<SetStateAction<string | null>>
  setActiveSceneId: Dispatch<SetStateAction<string | null>>
  setActiveSettingId: Dispatch<SetStateAction<string | null>>
  setCreateSelection: Dispatch<SetStateAction<ContentCanvasCreateSelection>>
  setSelection: Dispatch<SetStateAction<InspectorSelectionRef>>
  setWorkspaceTab: Dispatch<SetStateAction<ContentWorkspaceTab>>
  workspaceMode?: ContentWorkspaceTab
  workspaceTab: ContentWorkspaceTab
}

export function useContentCanvasWorkspaceSession({
  activeKind,
  activeCanvasNodeId,
  graphIndex,
  projectEntryId,
  projectId,
  searchParams,
  selection,
  setActiveKind,
  setActiveCanvasNodeId,
  setActiveProductionId,
  setActiveSceneId,
  setActiveSettingId,
  setCreateSelection,
  setSelection,
  setWorkspaceTab,
  workspaceMode,
  workspaceTab,
}: UseContentCanvasWorkspaceSessionInput): void {
  const restoredSessionRef = useRef(false)
  const restoredSessionKeyRef = useRef('')
  const skipNextSessionPersistRef = useRef(false)
  const resolvedProjectEntryId = projectEntryId ?? contentCanvasProjectEntryIdForWorkspaceTab(workspaceMode ?? workspaceTab)
  const sessionSnapshot = useProjectEntrySessionStore((state) => (
    projectId
      ? state.snapshotFor(projectId, resolvedProjectEntryId)
        ?? (resolvedProjectEntryId === 'content_preview' ? state.snapshotFor(projectId, 'content') : null)
      : null
  ))
  const upsertProjectEntrySessionSnapshot = useProjectEntrySessionStore((state) => state.upsertSnapshot)
  const hasExplicitSessionSearch = useMemo(
    () => hasExplicitProjectEntrySearchParam(searchParams, [
      'canvasNode',
      'canvasId',
      'canvas',
      'node',
      'tab',
      'mode',
      'kind',
      'settingKind',
      'scopeRef',
      'scope_ref',
      'targetRef',
      'target_ref',
      'timeline_assembly_ref',
      'timelineAssemblyRef',
      'productionId',
      'production_id',
      'setting_id',
      'settingId',
      'setting_state_id',
      'settingStateId',
      'state_id',
      'stateId',
      'asset_id',
      'assetId',
      'asset_slot_id',
      'assetSlotId',
    ]),
    [searchParams],
  )

  useEffect(() => {
    if (!projectId || (!hasExplicitSessionSearch && restoredSessionRef.current)) return
    const sessionState = resolveContentCanvasProjectEntrySessionState({
      hasExplicitSearch: hasExplicitSessionSearch,
      searchParams,
      snapshot: sessionSnapshot,
    })
    if (!sessionState) return
    const resolvedWorkspaceTab = workspaceMode ?? sessionState.workspaceTab
    const sessionKey = [
      resolvedWorkspaceTab,
      sessionState.activeCanvasNodeId,
      sessionState.selectionKind,
      sessionState.selectedNodeId,
      sessionState.activeKind ?? '',
    ].join(':')
    if (hasExplicitSessionSearch && restoredSessionKeyRef.current === sessionKey) return
    if (sessionState.selectedNodeId !== 'scene-main' && !graphIndex.nodeById.has(sessionState.selectedNodeId)) return
    if (sessionState.activeCanvasNodeId !== 'scene-main' && !graphIndex.nodeById.has(sessionState.activeCanvasNodeId)) return
    restoredSessionRef.current = true
    restoredSessionKeyRef.current = sessionKey
    skipNextSessionPersistRef.current = true
    if (sessionState.activeKind) setActiveKind(sessionState.activeKind)
    setActiveCanvasNodeId(sessionState.activeCanvasNodeId === 'scene-main' ? null : sessionState.activeCanvasNodeId)
    setWorkspaceTab(resolvedWorkspaceTab)
    const canvasNode = graphIndex.nodeById.get(sessionState.activeCanvasNodeId)
    if (canvasNode?.kind === 'scene_moment') {
      setActiveProductionId(null)
      setActiveSceneId(canvasNode.id)
    }
    if (canvasNode?.kind === 'production') setActiveProductionId(canvasNode.id)
    if (canvasNode?.kind === 'setting') setActiveSettingId(canvasNode.id)
    setSelection({ kind: sessionState.selectionKind, nodeId: sessionState.selectedNodeId })
    setCreateSelection(null)
  }, [
    graphIndex,
    hasExplicitSessionSearch,
    projectId,
    searchParams,
    sessionSnapshot,
    setActiveKind,
    setActiveCanvasNodeId,
    setActiveProductionId,
    setActiveSceneId,
    setActiveSettingId,
    setCreateSelection,
    setSelection,
    setWorkspaceTab,
    workspaceMode,
  ])

  useEffect(() => {
    if (!projectId) return
    if (!hasExplicitSessionSearch && sessionSnapshot && !restoredSessionRef.current) return
    if (skipNextSessionPersistRef.current) {
      skipNextSessionPersistRef.current = false
      return
    }
    upsertProjectEntrySessionSnapshot(contentCanvasProjectEntrySessionSnapshot({
      activeKind,
      activeCanvasNodeId: activeCanvasNodeId ?? selection.nodeId,
      projectId,
      projectEntryId: resolvedProjectEntryId,
      selectedNodeId: selection.nodeId,
      selectionKind: selection.kind,
      workspaceTab: workspaceMode ?? workspaceTab,
    }))
  }, [
    activeKind,
    activeCanvasNodeId,
    hasExplicitSessionSearch,
    projectId,
    resolvedProjectEntryId,
    selection.kind,
    selection.nodeId,
    sessionSnapshot,
    upsertProjectEntrySessionSnapshot,
    workspaceMode,
    workspaceTab,
  ])
}

function contentCanvasProjectEntrySessionSnapshot(input: {
  activeKind: SettingKind | 'all'
  activeCanvasNodeId: string
  projectEntryId: ProjectEntrySessionId
  projectId: number
  selectedNodeId: string
  selectionKind: InspectorSelectionRef['kind']
  workspaceTab: ContentWorkspaceTab
}): Omit<ProjectEntrySessionSnapshot, 'schemaVersion' | 'updatedAt'> {
  const search = buildContentCanvasProjectEntrySessionSearch({
    activeKind: input.activeKind,
    activeCanvasNodeId: input.activeCanvasNodeId,
    selectedNodeId: input.selectedNodeId,
    selectionKind: input.selectionKind,
    workspaceTab: input.workspaceTab,
  })
  return {
    projectId: input.projectId,
    projectEntryId: input.projectEntryId,
    route: surfaceRoutePath(contentCanvasProjectEntryRouteKey(input.projectEntryId, input.workspaceTab), { projectId: input.projectId }),
    search,
    filters: {
      activeKind: input.activeKind,
      activeCanvasNodeId: input.activeCanvasNodeId,
      selectedNodeId: input.selectedNodeId,
      selectionKind: input.selectionKind,
      workspaceTab: input.workspaceTab,
    },
    selection: undefined,
  }
}

function contentCanvasProjectEntryIdForWorkspaceTab(workspaceTab: ContentWorkspaceTab): ProjectEntrySessionId {
  return workspaceTab === 'canvas' ? 'content_canvas' : 'content_preview'
}

function contentCanvasProjectEntryRouteKey(
  projectEntryId: ProjectEntrySessionId,
  workspaceTab: ContentWorkspaceTab,
): 'project.contentCanvas' | 'project.contentPreview' | 'project.settingPreview' {
  if (projectEntryId === 'setting_preview') return 'project.settingPreview'
  return workspaceTab === 'canvas' ? 'project.contentCanvas' : 'project.contentPreview'
}
