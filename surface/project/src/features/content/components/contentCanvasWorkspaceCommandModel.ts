import type { InspectorSelectionRef } from './contentCanvasWorkspaceTypes'
import { contentUnitNodeForGenerationTask } from './contentCanvasWorkspaceGenerationModel'

export { contentUnitNodeForGenerationTask } from './contentCanvasWorkspaceGenerationModel'

export type ContentCanvasCommandFocusState = {
  activeCanvasNodeId?: string | null
  activeProductionId?: string | null
  activeSceneId?: string | null
  activeSettingId?: string | null
  selection: InspectorSelectionRef
}

export function contentCanvasCommandFocusState(focusNodeId: string | undefined): ContentCanvasCommandFocusState | undefined {
  if (!focusNodeId) return undefined
  if (focusNodeId.startsWith('setting:')) {
    return {
      activeCanvasNodeId: focusNodeId,
      activeSettingId: focusNodeId,
      selection: { kind: 'setting', nodeId: focusNodeId },
    }
  }
  if (focusNodeId.startsWith('scene_moment:')) {
    return {
      activeCanvasNodeId: focusNodeId,
      activeProductionId: null,
      activeSceneId: focusNodeId,
      selection: { kind: 'scene_moment', nodeId: focusNodeId },
    }
  }
  if (focusNodeId.startsWith('state:')) {
    return {
      activeCanvasNodeId: focusNodeId,
      selection: { kind: 'state', nodeId: focusNodeId },
    }
  }
  if (focusNodeId.startsWith('asset:')) {
    return {
      activeCanvasNodeId: focusNodeId,
      selection: { kind: 'asset', nodeId: focusNodeId },
    }
  }
  if (focusNodeId.startsWith('expression_unit:')) {
    return {
      activeCanvasNodeId: focusNodeId,
      selection: { kind: 'other', nodeId: focusNodeId },
    }
  }
  if (
    focusNodeId.startsWith('production:')
    || focusNodeId.startsWith('segment:')
    || focusNodeId.startsWith('keyframe:')
    || focusNodeId.startsWith('storyboard:')
    || focusNodeId.startsWith('audio_cue:')
  ) {
    return {
      activeCanvasNodeId: focusNodeId,
      selection: { kind: 'other', nodeId: focusNodeId },
    }
  }
  return {
    selection: { kind: 'other', nodeId: focusNodeId },
  }
}
