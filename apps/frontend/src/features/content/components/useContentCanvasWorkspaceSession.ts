import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'

import {
  hasExplicitProjectEntrySearchParam,
  useProjectEntrySessionStore,
  type ProjectEntrySessionSnapshot,
} from '@/features/project/application/projectEntrySessionStore'
import { ROUTES } from '@/routes/projectRoutes'
import {
  buildContentCanvasProjectEntrySessionSearch,
  resolveContentCanvasProjectEntrySessionState,
} from '../application/contentCanvasProjectEntrySession'
import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { CanvasMode, InspectorSelection, InspectorSelectionRef, SettingKind } from './contentCanvasWorkspaceTypes'

type ContentCanvasCreateSelection = Extract<InspectorSelection, {
  kind: 'create_expression_unit' | 'create_keyframe' | 'create_storyboard' | 'create_state' | 'create_asset'
}> | null

interface UseContentCanvasWorkspaceSessionInput {
  activeKind: SettingKind | 'all'
  activeCanvasNodeId: string | null
  canvasMode: CanvasMode
  graphIndex: {
    nodeById: Map<string, ContentCanvasNode>
  }
  projectId?: number
  searchParams: URLSearchParams
  selection: InspectorSelectionRef
  setActiveKind: Dispatch<SetStateAction<SettingKind | 'all'>>
  setActiveCanvasNodeId: Dispatch<SetStateAction<string | null>>
  setActiveProductionId: Dispatch<SetStateAction<string | null>>
  setActiveSceneId: Dispatch<SetStateAction<string | null>>
  setActiveSettingId: Dispatch<SetStateAction<string | null>>
  setCanvasMode: Dispatch<SetStateAction<CanvasMode>>
  setCreateSelection: Dispatch<SetStateAction<ContentCanvasCreateSelection>>
  setSelection: Dispatch<SetStateAction<InspectorSelectionRef>>
}

export function useContentCanvasWorkspaceSession({
  activeKind,
  activeCanvasNodeId,
  canvasMode,
  graphIndex,
  projectId,
  searchParams,
  selection,
  setActiveKind,
  setActiveCanvasNodeId,
  setActiveProductionId,
  setActiveSceneId,
  setActiveSettingId,
  setCanvasMode,
  setCreateSelection,
  setSelection,
}: UseContentCanvasWorkspaceSessionInput): void {
  const restoredSessionRef = useRef(false)
  const restoredSessionKeyRef = useRef('')
  const skipNextSessionPersistRef = useRef(false)
  const sessionSnapshot = useProjectEntrySessionStore((state) => (
    projectId ? state.snapshotFor(projectId, 'content') : null
  ))
  const upsertProjectEntrySessionSnapshot = useProjectEntrySessionStore((state) => state.upsertSnapshot)
  const hasExplicitSessionSearch = useMemo(
    () => hasExplicitProjectEntrySearchParam(searchParams, ['canvasNode', 'node', 'mode', 'kind', 'settingKind']),
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
    const sessionKey = [
      sessionState.canvasMode,
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
    setCanvasMode(sessionState.canvasMode)
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
    setCanvasMode,
    setCreateSelection,
    setSelection,
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
      canvasMode,
      projectId,
      selectedNodeId: selection.nodeId,
      selectionKind: selection.kind,
    }))
  }, [
    activeKind,
    activeCanvasNodeId,
    canvasMode,
    hasExplicitSessionSearch,
    projectId,
    selection.kind,
    selection.nodeId,
    sessionSnapshot,
    upsertProjectEntrySessionSnapshot,
  ])
}

function contentCanvasProjectEntrySessionSnapshot(input: {
  activeKind: SettingKind | 'all'
  activeCanvasNodeId: string
  canvasMode: CanvasMode
  projectId: number
  selectedNodeId: string
  selectionKind: InspectorSelectionRef['kind']
}): Omit<ProjectEntrySessionSnapshot, 'schemaVersion' | 'updatedAt'> {
  const search = buildContentCanvasProjectEntrySessionSearch({
    activeKind: input.activeKind,
    activeCanvasNodeId: input.activeCanvasNodeId,
    canvasMode: input.canvasMode,
    selectedNodeId: input.selectedNodeId,
    selectionKind: input.selectionKind,
  })
  return {
    projectId: input.projectId,
    projectEntryId: 'content',
    route: ROUTES.project.content,
    search,
    filters: {
      activeKind: input.activeKind,
      activeCanvasNodeId: input.activeCanvasNodeId,
      canvasMode: input.canvasMode,
      selectedNodeId: input.selectedNodeId,
      selectionKind: input.selectionKind,
    },
    selection: undefined,
  }
}
