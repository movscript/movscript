import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Textarea } from '@movscript/ui/primitives'
import {
  localizeShotField,
  localizeShotSemanticValue,
  type ShotLibrarySemanticCategory,
} from '../domain/shotReferenceLibrary'
import {
  appendTagValue,
  type ShotManualWorkspace,
} from '../domain/shotLibraryWorkspaceModel'

export function ManualField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="shot-library-manual-form__field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function TagInputField({
  label,
  value,
  suggestions,
  category,
  disabled = false,
  onChange,
}: {
  label: string
  value: string
  suggestions: string[]
  category: ShotLibrarySemanticCategory
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const { i18n } = useTranslation()
  return (
    <ManualField label={label}>
      <Input value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
      {suggestions.length > 0 ? (
        <div className="shot-library-page__tags">
          {suggestions.slice(0, 12).map(suggestion => (
            <button
              key={`${category}:${suggestion}`}
              type="button"
              className="shot-library-page__tag-button"
              disabled={disabled}
              onClick={() => onChange(appendTagValue(value, suggestion))}
            >
              {localizeShotSemanticValue(category, suggestion, i18n.language)}
            </button>
          ))}
        </div>
      ) : null}
    </ManualField>
  )
}

export function StructuredShotEditor({
  workspace,
  disabled = false,
  onChange,
}: {
  workspace: ShotManualWorkspace
  disabled?: boolean
  onChange: (patch: Partial<ShotManualWorkspace>) => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <div className="shot-library-structured-editor">
      <h2>{t('pages.shotLibrary.structuredAnnotation')}</h2>
      <div className="shot-library-manual-form__grid">
        <TextWorkspaceField label={localizeShotField('shot_size', i18n.language)} value={workspace.shotSize} disabled={disabled} onChange={value => onChange({ shotSize: value })} />
        <TextWorkspaceField label={localizeShotField('camera_angle', i18n.language)} value={workspace.cameraAngle} disabled={disabled} onChange={value => onChange({ cameraAngle: value })} />
        <TextWorkspaceField label={localizeShotField('camera_height', i18n.language)} value={workspace.cameraHeight} disabled={disabled} onChange={value => onChange({ cameraHeight: value })} />
        <TextWorkspaceField label={localizeShotField('movement', i18n.language)} value={workspace.cameraMovementType} disabled={disabled} onChange={value => onChange({ cameraMovementType: value })} />
        <TextWorkspaceField label={localizeShotField('camera_movement.speed', i18n.language)} value={workspace.cameraMovementSpeed} disabled={disabled} onChange={value => onChange({ cameraMovementSpeed: value })} />
        <TextWorkspaceField label={localizeShotField('camera_movement.stability', i18n.language)} value={workspace.cameraMovementStability} disabled={disabled} onChange={value => onChange({ cameraMovementStability: value })} />
        <TextWorkspaceField label={localizeShotField('camera_movement.motivation', i18n.language)} value={workspace.cameraMovementMotivation} disabled={disabled} onChange={value => onChange({ cameraMovementMotivation: value })} />
        <TextWorkspaceField label={localizeShotField('lens', i18n.language)} value={workspace.lensFocalLength} disabled={disabled} onChange={value => onChange({ lensFocalLength: value })} />
        <TextWorkspaceField label={localizeShotField('lens.depth_of_field', i18n.language)} value={workspace.lensDepthOfField} disabled={disabled} onChange={value => onChange({ lensDepthOfField: value })} />
        <TextWorkspaceField label={localizeShotField('focus', i18n.language)} value={workspace.focusBehavior} disabled={disabled} onChange={value => onChange({ focusBehavior: value })} />
        <TextWorkspaceField label={localizeShotField('lighting', i18n.language)} value={workspace.lightingStyle} disabled={disabled} onChange={value => onChange({ lightingStyle: value })} />
        <TextWorkspaceField label={localizeShotField('lighting.contrast', i18n.language)} value={workspace.lightingContrast} disabled={disabled} onChange={value => onChange({ lightingContrast: value })} />
        <TextWorkspaceField label={localizeShotField('color', i18n.language)} value={workspace.colorPalette} disabled={disabled} onChange={value => onChange({ colorPalette: value })} />
        <TextWorkspaceField label={localizeShotField('color.saturation', i18n.language)} value={workspace.colorSaturation} disabled={disabled} onChange={value => onChange({ colorSaturation: value })} />
        <TextWorkspaceField label={localizeShotField('environment', i18n.language)} value={workspace.environmentLocationType} disabled={disabled} onChange={value => onChange({ environmentLocationType: value })} />
        <TextWorkspaceField label={localizeShotField('primary', i18n.language)} value={workspace.narrativePrimary} disabled={disabled} onChange={value => onChange({ narrativePrimary: value })} />
        <TextWorkspaceField label={localizeShotField('information_state', i18n.language)} value={workspace.informationState} disabled={disabled} onChange={value => onChange({ informationState: value })} />
        <TextWorkspaceField label={localizeShotField('scene_type', i18n.language)} value={workspace.sceneType} disabled={disabled} onChange={value => onChange({ sceneType: value })} />
        <TextWorkspaceField label={localizeShotField('location_type', i18n.language)} value={workspace.sceneLocationType} disabled={disabled} onChange={value => onChange({ sceneLocationType: value })} />
        <TextWorkspaceField label={localizeShotField('conflict_level', i18n.language)} value={workspace.conflictLevel} disabled={disabled} onChange={value => onChange({ conflictLevel: value })} />
        <TextWorkspaceField label={localizeShotField('emotion.valence', i18n.language)} value={workspace.emotionValence} disabled={disabled} onChange={value => onChange({ emotionValence: value })} />
        <TextWorkspaceField label={localizeShotField('emotion.arousal', i18n.language)} value={workspace.emotionArousal} disabled={disabled} onChange={value => onChange({ emotionArousal: value })} />
        <TextWorkspaceField label={localizeShotField('emotion.viewer_position', i18n.language)} value={workspace.viewerPosition} disabled={disabled} onChange={value => onChange({ viewerPosition: value })} />
        <TextWorkspaceField label={localizeShotField('coverage_role', i18n.language)} value={workspace.coverageRole} disabled={disabled} onChange={value => onChange({ coverageRole: value })} />
        <TextWorkspaceField label={localizeShotField('difficulty', i18n.language)} value={workspace.difficulty} disabled={disabled} onChange={value => onChange({ difficulty: value })} />
      </div>
      <TextWorkspaceField label={localizeShotField('framing', i18n.language)} value={workspace.framing} disabled={disabled} onChange={value => onChange({ framing: value })} />
      <TextWorkspaceField label={localizeShotField('composition', i18n.language)} value={workspace.composition} disabled={disabled} onChange={value => onChange({ composition: value })} />
      <TextWorkspaceField label={localizeShotField('lens.optical_effects', i18n.language)} value={workspace.opticalEffects} disabled={disabled} onChange={value => onChange({ opticalEffects: value })} />
      <TextWorkspaceField label={localizeShotField('environment.spatial_feeling', i18n.language)} value={workspace.spatialFeeling} disabled={disabled} onChange={value => onChange({ spatialFeeling: value })} />
      <TextWorkspaceField label={localizeShotField('genre', i18n.language)} value={workspace.genre} disabled={disabled} onChange={value => onChange({ genre: value })} />
      <TextWorkspaceField label={localizeShotField('secondary', i18n.language)} value={workspace.narrativeSecondary} disabled={disabled} onChange={value => onChange({ narrativeSecondary: value })} />
      <TextWorkspaceField label={localizeShotField('emotion.names', i18n.language)} value={workspace.emotionNames} disabled={disabled} onChange={value => onChange({ emotionNames: value })} />
      <TextWorkspaceField label={localizeShotField('pattern_ids', i18n.language)} value={workspace.patternIds} disabled={disabled} onChange={value => onChange({ patternIds: value })} />
      <ManualField label={localizeShotField('principle', i18n.language)}>
        <Textarea value={workspace.reusablePrinciple} disabled={disabled} rows={3} onChange={event => onChange({ reusablePrinciple: event.target.value })} />
      </ManualField>
      <TextWorkspaceField label={localizeShotField('works_when', i18n.language)} value={workspace.worksWhen} disabled={disabled} onChange={value => onChange({ worksWhen: value })} />
      <TextWorkspaceField label={localizeShotField('avoid_when', i18n.language)} value={workspace.avoidWhen} disabled={disabled} onChange={value => onChange({ avoidWhen: value })} />
      <TextWorkspaceField label={localizeShotField('requirement', i18n.language)} value={workspace.requirements} disabled={disabled} onChange={value => onChange({ requirements: value })} />
      <ManualField label={localizeShotField('blocking', i18n.language)}>
        <Textarea value={workspace.blocking} disabled={disabled} rows={2} onChange={event => onChange({ blocking: event.target.value })} />
      </ManualField>
    </div>
  )
}

function TextWorkspaceField({ label, value, disabled = false, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <ManualField label={label}>
      <Input value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
    </ManualField>
  )
}
