import type { ShotLibraryEntry, ShotReferenceManualUpdate } from '@/features/shot-library/domain/shotReferenceLibrary'

export type ShotManualWorkspace = ReturnType<typeof detailWorkspaceFromEntry>

export function detailWorkspaceFromEntry(entry: ShotLibraryEntry) {
  return {
    title: entry.title,
    summary: entry.summary,
    intent: entry.intent.join(', '),
    pattern: entry.pattern.join(', '),
    shotFunction: entry.shotFunction.join(', '),
    visualPreference: entry.visualPreference.join(', '),
    emotionalEffect: entry.emotionalEffect.join(', '),
    startSec: entry.startSec === undefined ? '' : String(entry.startSec),
    endSec: entry.endSec === undefined ? '' : String(entry.endSec),
    resolution: entry.executionDetails.resolution ?? '',
    aspectRatio: entry.executionDetails.aspectRatio ?? '',
    shotSize: entry.visualAnalysis.shot_size ?? '',
    framing: (entry.visualAnalysis.framing ?? []).join(', '),
    composition: (entry.visualAnalysis.composition ?? []).join(', '),
    cameraAngle: entry.visualAnalysis.camera_angle ?? '',
    cameraHeight: entry.visualAnalysis.camera_height ?? '',
    lensFocalLength: entry.visualAnalysis.lens?.focal_length_class ?? '',
    lensDepthOfField: entry.visualAnalysis.lens?.depth_of_field ?? '',
    opticalEffects: (entry.visualAnalysis.lens?.optical_effects ?? []).join(', '),
    focusBehavior: entry.visualAnalysis.focus?.behavior ?? '',
    cameraMovementType: entry.visualAnalysis.camera_movement?.type ?? '',
    cameraMovementSpeed: entry.visualAnalysis.camera_movement?.speed ?? '',
    cameraMovementStability: entry.visualAnalysis.camera_movement?.stability ?? '',
    cameraMovementMotivation: entry.visualAnalysis.camera_movement?.motivation ?? '',
    lightingStyle: entry.visualAnalysis.lighting?.style ?? '',
    lightingContrast: entry.visualAnalysis.lighting?.contrast ?? '',
    colorPalette: entry.visualAnalysis.color?.palette ?? '',
    colorSaturation: entry.visualAnalysis.color?.saturation ?? '',
    environmentLocationType: entry.visualAnalysis.environment?.location_type ?? '',
    spatialFeeling: (entry.visualAnalysis.environment?.spatial_feeling ?? []).join(', '),
    genre: (entry.sceneSemantics.genre ?? []).join(', '),
    sceneType: entry.sceneSemantics.scene_type ?? '',
    sceneLocationType: entry.sceneSemantics.location_type ?? '',
    conflictLevel: entry.sceneSemantics.conflict_level ?? '',
    narrativePrimary: entry.narrativeFunction.primary ?? '',
    narrativeSecondary: (entry.narrativeFunction.secondary ?? []).join(', '),
    informationState: entry.narrativeFunction.information_state ?? '',
    emotionNames: (entry.emotionalProfile.names ?? []).join(', '),
    emotionValence: entry.emotionalProfile.valence ?? '',
    emotionArousal: entry.emotionalProfile.arousal ?? '',
    viewerPosition: entry.emotionalProfile.viewer_position ?? '',
    patternIds: (entry.reusablePattern.pattern_ids ?? []).join(', '),
    reusablePrinciple: entry.reusablePattern.principle ?? '',
    worksWhen: (entry.reusablePattern.works_when ?? []).join(', '),
    avoidWhen: (entry.reusablePattern.avoid_when ?? []).join(', '),
    coverageRole: entry.executionDetails.coverageRole ?? '',
    difficulty: entry.executionDetails.difficulty ?? '',
    requirements: (entry.executionDetails.requirements ?? []).join(', '),
    blocking: entry.executionDetails.blocking ?? '',
  }
}

export function manualWorkspaceToManualUpdate(workspace: ShotManualWorkspace): ShotReferenceManualUpdate {
  return {
    title: workspace.title,
    summary: workspace.summary,
    intent: splitTags(workspace.intent),
    pattern: splitTags(workspace.pattern),
    shot_function: splitTags(workspace.shotFunction),
    visual_preference: splitTags(workspace.visualPreference),
    emotional_effect: splitTags(workspace.emotionalEffect),
    execution_details: executionDetailsFromWorkspace(workspace),
    visual_analysis: visualAnalysisFromWorkspace(workspace),
    scene_semantics: sceneSemanticsFromWorkspace(workspace),
    narrative_function: narrativeFunctionFromWorkspace(workspace),
    emotional_profile: emotionalProfileFromWorkspace(workspace),
    reusable_pattern: reusablePatternFromWorkspace(workspace),
    start_sec: optionalNumber(workspace.startSec),
    start_sec_set: true,
    end_sec: optionalNumber(workspace.endSec),
    end_sec_set: true,
  }
}

export function executionDetailsFromWorkspace(workspace: ShotManualWorkspace, entry?: ShotLibraryEntry): ShotReferenceManualUpdate['execution_details'] {
  return {
    duration_sec: entry?.executionDetails.durationSec,
    resolution: entry?.executionDetails.resolution ?? cleanText(workspace.resolution),
    aspect_ratio: entry?.executionDetails.aspectRatio ?? cleanText(workspace.aspectRatio),
    transition_in: entry?.executionDetails.transitionIn,
    transition_out: entry?.executionDetails.transitionOut,
    coverage_role: cleanText(workspace.coverageRole),
    difficulty: cleanText(workspace.difficulty),
    requirements: splitTags(workspace.requirements),
    blocking: cleanText(workspace.blocking),
  }
}

export function visualAnalysisFromWorkspace(workspace: ShotManualWorkspace): ShotReferenceManualUpdate['visual_analysis'] {
  return {
    shot_size: cleanText(workspace.shotSize),
    framing: splitTags(workspace.framing),
    composition: splitTags(workspace.composition),
    camera_angle: cleanText(workspace.cameraAngle),
    camera_height: cleanText(workspace.cameraHeight),
    lens: {
      focal_length_class: cleanText(workspace.lensFocalLength),
      depth_of_field: cleanText(workspace.lensDepthOfField),
      optical_effects: splitTags(workspace.opticalEffects),
    },
    focus: {
      behavior: cleanText(workspace.focusBehavior),
    },
    camera_movement: {
      type: cleanText(workspace.cameraMovementType),
      speed: cleanText(workspace.cameraMovementSpeed),
      stability: cleanText(workspace.cameraMovementStability),
      motivation: cleanText(workspace.cameraMovementMotivation),
    },
    lighting: {
      style: cleanText(workspace.lightingStyle),
      contrast: cleanText(workspace.lightingContrast),
    },
    color: {
      palette: cleanText(workspace.colorPalette),
      saturation: cleanText(workspace.colorSaturation),
    },
    environment: {
      location_type: cleanText(workspace.environmentLocationType),
      spatial_feeling: splitTags(workspace.spatialFeeling),
    },
  }
}

export function sceneSemanticsFromWorkspace(workspace: ShotManualWorkspace): ShotReferenceManualUpdate['scene_semantics'] {
  return {
    genre: splitTags(workspace.genre),
    scene_type: cleanText(workspace.sceneType),
    location_type: cleanText(workspace.sceneLocationType),
    conflict_level: cleanText(workspace.conflictLevel),
  }
}

export function narrativeFunctionFromWorkspace(workspace: ShotManualWorkspace): ShotReferenceManualUpdate['narrative_function'] {
  return {
    primary: cleanText(workspace.narrativePrimary),
    secondary: splitTags(workspace.narrativeSecondary),
    information_state: cleanText(workspace.informationState),
  }
}

export function emotionalProfileFromWorkspace(workspace: ShotManualWorkspace): ShotReferenceManualUpdate['emotional_profile'] {
  return {
    names: splitTags(workspace.emotionNames),
    valence: cleanText(workspace.emotionValence),
    arousal: cleanText(workspace.emotionArousal),
    viewer_position: cleanText(workspace.viewerPosition),
  }
}

export function reusablePatternFromWorkspace(workspace: ShotManualWorkspace): ShotReferenceManualUpdate['reusable_pattern'] {
  return {
    pattern_ids: splitTags(workspace.patternIds),
    principle: cleanText(workspace.reusablePrinciple),
    works_when: splitTags(workspace.worksWhen),
    avoid_when: splitTags(workspace.avoidWhen),
  }
}

export function splitTags(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map(item => item.trim())
    .filter(Boolean)
}

export function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function cleanText(value: string): string | undefined {
  return value.trim() || undefined
}
