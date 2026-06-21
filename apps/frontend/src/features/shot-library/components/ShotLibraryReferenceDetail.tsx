import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Save, Trash2, X } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  StatusBadge,
  Textarea,
} from '@movscript/ui/primitives'
import {
  localizeAnyShotValue,
  localizeShotField,
  localizeShotFieldValue,
  localizeShotSemanticValue,
  localizeShotSummary,
  type ShotLibraryEntry,
  type ShotLibrarySemanticCategory,
  type ShotReferenceManualUpdate,
  type ShotSearchMatch,
} from '@/features/shot-library/domain/shotReferenceLibrary'
import {
  detailWorkspaceFromEntry,
  emotionalProfileFromWorkspace,
  executionDetailsFromWorkspace,
  formatDuration,
  narrativeFunctionFromWorkspace,
  optionalNumber,
  resourceFromEntry,
  reusablePatternFromWorkspace,
  sceneSemanticsFromWorkspace,
  shotEntryKey,
  splitTags,
  visualAnalysisFromWorkspace,
  type ShotImportWorkspace,
  type ShotTagSuggestions,
} from '@/features/shot-library/domain/shotLibraryWorkspaceModel'
import { ShotWorkspaceClipPlayer } from '@/features/shot-library/components/ShotLibraryImportClipPlayer'
import { ManualField, StructuredShotEditor, TagInputField } from '@/features/shot-library/components/ShotLibraryWorkspaceFields'
import { shotReferenceAspectRatio } from '@/features/shot-library/components/shotLibraryVideoPreview'

export function ShotReferenceDetail({
  entry,
  tagSuggestions,
  deleting,
  saving,
  canDelete,
  match,
  score,
  onDelete,
  onSave,
}: {
  entry: ShotLibraryEntry
  tagSuggestions: ShotTagSuggestions
  deleting: boolean
  saving: boolean
  canDelete: boolean
  match: ShotSearchMatch[]
  score: number
  onDelete: () => void
  onSave: (input: ShotReferenceManualUpdate) => void
}) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [workspace, setWorkspace] = useState(() => detailWorkspaceFromEntry(entry))
  const [detectedAspectRatio, setDetectedAspectRatio] = useState<string>()
  const workspaceKey = shotEntryKey(entry)

  useEffect(() => {
    setWorkspace(detailWorkspaceFromEntry(entry))
    setEditing(false)
    setDetectedAspectRatio(undefined)
  }, [workspaceKey])

  const confirmDelete = () => {
    if (!window.confirm(t('pages.shotLibrary.deleteConfirm', { title: entry.title }))) return
    onDelete()
  }

  const submit = () => {
    onSave({
      title: workspace.title,
      summary: workspace.summary,
      intent: splitTags(workspace.intent),
      pattern: splitTags(workspace.pattern),
      shot_function: splitTags(workspace.shotFunction),
      visual_preference: splitTags(workspace.visualPreference),
      emotional_effect: splitTags(workspace.emotionalEffect),
      execution_details: executionDetailsFromWorkspace(workspace, entry),
      visual_analysis: visualAnalysisFromWorkspace(workspace),
      scene_semantics: sceneSemanticsFromWorkspace(workspace),
      narrative_function: narrativeFunctionFromWorkspace(workspace),
      emotional_profile: emotionalProfileFromWorkspace(workspace),
      reusable_pattern: reusablePatternFromWorkspace(workspace),
      start_sec: optionalNumber(workspace.startSec),
      start_sec_set: true,
      end_sec: optionalNumber(workspace.endSec),
      end_sec_set: true,
    })
  }

  return (
    <Card className="shot-library-page__detail-card">
      <CardHeader>
        <div className="shot-library-page__detail-title-row">
          <CardTitle>{entry.title}</CardTitle>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => setEditing(current => !current)}
            disabled={entry.sourceReadOnly}
            aria-label={editing ? t('pages.shotLibrary.cancelEdit') : t('pages.shotLibrary.editReference')}
            title={entry.sourceReadOnly ? t('pages.shotLibrary.readOnlySource') : editing ? t('pages.shotLibrary.cancelEdit') : t('pages.shotLibrary.editReference')}
          >
            {editing ? <X size={14} /> : <Pencil size={14} />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            tone="danger"
            onClick={confirmDelete}
            loading={deleting}
            disabled={!canDelete}
            aria-label={t('pages.shotLibrary.deleteReference')}
            title={canDelete ? t('pages.shotLibrary.deleteReference') : t('pages.shotLibrary.readOnlySource')}
          >
            <Trash2 size={14} />
          </Button>
        </div>
        <CardDescription>{localizeShotSummary(entry, i18n.language)}</CardDescription>
      </CardHeader>
      <CardContent className="shot-library-page__detail-content">
        <DetailGroup title={t('pages.shotLibrary.source')} values={[{ value: `${entry.sourceName} · ${entry.sourceBaseURL || '-'}` }]} />
        <DetailGroup title={t('pages.shotLibrary.group')} values={[{ value: entry.groupTitle ?? '-' }]} />
        <SearchMatchPanel score={score} matches={match} />
        <div
          className="shot-library-page__preview"
          style={{ '--shot-reference-aspect-ratio': detectedAspectRatio ?? shotReferenceAspectRatio(entry) } as CSSProperties}
        >
          <ShotWorkspaceClipPlayer
            resource={resourceFromEntry(entry)}
            workspace={shotClipWorkspaceFromEntry(entry)}
            onAspectRatio={setDetectedAspectRatio}
          />
        </div>
        {editing ? (
          <div className="shot-library-manual-form">
            <ManualField label={t('pages.shotLibrary.titleField')}>
              <Input value={workspace.title} onChange={event => setWorkspace(current => ({ ...current, title: event.target.value }))} />
            </ManualField>
            <ManualField label={t('pages.shotLibrary.summaryField')}>
              <Textarea value={workspace.summary} rows={3} onChange={event => setWorkspace(current => ({ ...current, summary: event.target.value }))} />
            </ManualField>
            <TagInputField label={t('pages.shotLibrary.intent')} value={workspace.intent} suggestions={tagSuggestions.intent} category="intent" onChange={value => setWorkspace(current => ({ ...current, intent: value }))} />
            <TagInputField label={t('pages.shotLibrary.pattern')} value={workspace.pattern} suggestions={tagSuggestions.pattern} category="pattern" onChange={value => setWorkspace(current => ({ ...current, pattern: value }))} />
            <TagInputField label={t('pages.shotLibrary.shotFunction')} value={workspace.shotFunction} suggestions={tagSuggestions.shotFunction} category="shotFunction" onChange={value => setWorkspace(current => ({ ...current, shotFunction: value }))} />
            <TagInputField label={t('pages.shotLibrary.visualPreference')} value={workspace.visualPreference} suggestions={tagSuggestions.visualPreference} category="visualPreference" onChange={value => setWorkspace(current => ({ ...current, visualPreference: value }))} />
            <TagInputField label={t('pages.shotLibrary.emotionalEffect')} value={workspace.emotionalEffect} suggestions={tagSuggestions.emotionalEffect} category="emotionalEffect" onChange={value => setWorkspace(current => ({ ...current, emotionalEffect: value }))} />
            <StructuredShotEditor workspace={workspace} onChange={patch => setWorkspace(current => ({ ...current, ...patch }))} />
            <div className="shot-library-manual-form__range">
              <ManualField label={t('pages.shotLibrary.startSec')}>
                <Input value={workspace.startSec} onChange={event => setWorkspace(current => ({ ...current, startSec: event.target.value }))} />
              </ManualField>
              <ManualField label={t('pages.shotLibrary.endSec')}>
                <Input value={workspace.endSec} onChange={event => setWorkspace(current => ({ ...current, endSec: event.target.value }))} />
              </ManualField>
            </div>
            <div className="shot-library-manual-form__actions">
              <Button type="button" size="sm" onClick={submit} loading={saving}>
                <Save size={14} />
                {t('pages.shotLibrary.saveManualSettings')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DetailGroup title={t('pages.shotLibrary.intent')} category="intent" values={entry.intent} />
            <DetailGroup title={t('pages.shotLibrary.pattern')} category="pattern" values={entry.pattern} />
            <DetailGroup title={t('pages.shotLibrary.shotFunction')} category="shotFunction" values={entry.shotFunction} />
            <DetailGroup title={t('pages.shotLibrary.visualPreference')} category="visualPreference" values={entry.visualPreference} />
            <DetailGroup title={t('pages.shotLibrary.emotionalEffect')} category="emotionalEffect" values={entry.emotionalEffect} />
            <DetailGroup title={t('pages.shotLibrary.visualAnalysis')} values={visualAnalysisDetails(entry, i18n.language)} />
            <DetailGroup title={t('pages.shotLibrary.narrativeFunction')} values={narrativeFunctionDetails(entry, i18n.language)} />
            <DetailGroup title={t('pages.shotLibrary.sceneSemantics')} values={sceneSemanticsDetails(entry, i18n.language)} />
            <DetailGroup title={t('pages.shotLibrary.reusablePattern')} values={reusablePatternDetails(entry, i18n.language)} />
            <DetailGroup title={t('pages.shotLibrary.searchIndex')} values={searchIndexDetails(entry, i18n.language)} />
            <DetailGroup title={t('pages.shotLibrary.executionDetails')} values={[
              entry.startSec !== undefined ? { field: localizeShotField('start_sec', i18n.language), value: String(entry.startSec) } : null,
              entry.endSec !== undefined ? { field: localizeShotField('end_sec', i18n.language), value: String(entry.endSec) } : null,
              entry.executionDetails.durationSec ? { field: localizeShotField('duration', i18n.language), value: formatDuration(entry.executionDetails.durationSec, i18n.language) } : null,
              entry.executionDetails.resolution ? { field: localizeShotField('resolution', i18n.language), value: entry.executionDetails.resolution } : null,
              entry.executionDetails.aspectRatio ? { field: localizeShotField('aspect_ratio', i18n.language), value: entry.executionDetails.aspectRatio } : null,
              entry.executionDetails.coverageRole ? { field: localizeShotField('coverage_role', i18n.language), value: localizeShotFieldValue('coverage_role', entry.executionDetails.coverageRole, i18n.language) } : null,
              entry.executionDetails.transitionIn ? { field: localizeShotField('transition_in', i18n.language), value: localizeShotFieldValue('transition_in', entry.executionDetails.transitionIn, i18n.language) } : null,
              entry.executionDetails.transitionOut ? { field: localizeShotField('transition_out', i18n.language), value: localizeShotFieldValue('transition_out', entry.executionDetails.transitionOut, i18n.language) } : null,
              entry.executionDetails.difficulty ? { field: localizeShotField('difficulty', i18n.language), value: localizeShotFieldValue('difficulty', entry.executionDetails.difficulty, i18n.language) } : null,
              entry.executionDetails.blocking ? { field: localizeShotField('blocking', i18n.language), value: entry.executionDetails.blocking } : null,
              ...(entry.executionDetails.requirements ?? []).map(value => ({ field: localizeShotField('requirement', i18n.language), value: localizeShotFieldValue('requirement', value, i18n.language) })),
            ].filter((value): value is { field: string; value: string } => Boolean(value))} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function shotClipWorkspaceFromEntry(entry: ShotLibraryEntry): ShotImportWorkspace {
  return {
    ...detailWorkspaceFromEntry(entry),
    id: shotEntryKey(entry),
    order: entry.order || 1,
    status: 'ready',
    selected: true,
  }
}

function DetailGroup({ title, category, values }: { title: string; category?: ShotLibrarySemanticCategory; values: Array<string | { value: string; category?: ShotLibrarySemanticCategory; field?: string }> }) {
  return (
    <section className="shot-library-page__detail-group">
      <h2>{title}</h2>
      <TagRow values={values.map(value => typeof value === 'string' ? { value, category } : value)} empty="-" />
    </section>
  )
}

function localizeMatchCategory(category: ShotSearchMatch['category'], language: string): string {
  const labels: Record<ShotSearchMatch['category'], string> = {
    text: localizeShotField('queries', language),
    tag: language.toLowerCase().startsWith('zh') ? '标签' : 'Tag',
    visual: language.toLowerCase().startsWith('zh') ? '画面' : 'Visual',
    narrative: language.toLowerCase().startsWith('zh') ? '叙事' : 'Narrative',
    emotion: language.toLowerCase().startsWith('zh') ? '情绪' : 'Emotion',
    pattern: language.toLowerCase().startsWith('zh') ? '方法' : 'Pattern',
    production: language.toLowerCase().startsWith('zh') ? '执行' : 'Production',
  }
  return labels[category]
}

function localizeMatchValue(match: ShotSearchMatch, language: string): string {
  if (match.category === 'tag') return localizeAnyShotValue(match.value, language)
  if (match.category === 'text') return localizeShotField(match.value, language)
  return localizeShotFieldValue(match.category, match.value, language)
}

function SearchMatchPanel({ score, matches }: { score: number; matches: ShotSearchMatch[] }) {
  const { t, i18n } = useTranslation()
  if (score <= 0 && matches.length === 0) return null
  return (
    <section className="shot-library-page__match-panel">
      <h2>{t('pages.shotLibrary.matchReason')}</h2>
      <div className="shot-library-page__match-score">{t('pages.shotLibrary.matchScore', { score })}</div>
      <TagRow
        values={matches.map(match => ({
          value: `${localizeMatchCategory(match.category, i18n.language)}: ${match.term ? `${match.term} -> ` : ''}${localizeMatchValue(match, i18n.language)}`,
        }))}
        empty="-"
      />
    </section>
  )
}

function visualAnalysisDetails(entry: ShotLibraryEntry, language: string): Array<{ field: string; value: string }> {
  const visual = entry.visualAnalysis
  return [
    detailValue('shot_size', visual.shot_size, language),
    detailValue('camera_angle', visual.camera_angle, language),
    detailValue('camera_height', visual.camera_height, language),
    detailValue('framing', visual.framing, language),
    detailValue('composition', visual.composition, language),
    detailValue('lens', [visual.lens?.focal_length_class, visual.lens?.depth_of_field, ...(visual.lens?.optical_effects ?? [])], language),
    detailValue('focus', [visual.focus?.behavior, visual.focus?.initial_focus, visual.focus?.final_focus], language, ' -> '),
    detailValue('movement', [visual.camera_movement?.type, visual.camera_movement?.speed, visual.camera_movement?.stability, visual.camera_movement?.motivation], language),
    detailValue('lighting', [visual.lighting?.style, visual.lighting?.contrast, visual.lighting?.direction], language),
    detailValue('color', [visual.color?.palette, visual.color?.contrast, visual.color?.saturation], language),
    detailValue('environment', [visual.environment?.location_type, ...(visual.environment?.spatial_feeling ?? [])], language),
    ...(visual.characters ?? []).map((character, index) => detailValue(`character_${index + 1}`, [character.role, character.visibility, character.expression, character.action], language)),
  ].filter(isDetailValue)
}

function narrativeFunctionDetails(entry: ShotLibraryEntry, language: string): Array<{ field: string; value: string }> {
  const fn = entry.narrativeFunction
  return [
    detailValue('primary', fn.primary, language),
    detailValue('secondary', fn.secondary, language),
    detailValue('information_state', fn.information_state, language),
    detailValue('sequence_position', fn.sequence_position, language),
    detailValue('relation_to_previous', fn.relation_to_previous, language),
    detailValue('relation_to_next', fn.relation_to_next, language),
  ].filter(isDetailValue)
}

function sceneSemanticsDetails(entry: ShotLibraryEntry, language: string): Array<{ field: string; value: string }> {
  const semantics = entry.sceneSemantics
  return [
    detailValue('genre', semantics.genre, language),
    detailValue('scene_type', semantics.scene_type, language),
    detailValue('location_type', semantics.location_type, language),
    detailValue('relationship_state', semantics.relationship_state, language),
    detailValue('conflict_level', semantics.conflict_level, language),
    detailValue('story_beat', semantics.story_beat, language),
    detailValue('production_scale', semantics.production_scale, language),
  ].filter(isDetailValue)
}

function reusablePatternDetails(entry: ShotLibraryEntry, language: string): Array<{ field: string; value: string }> {
  const pattern = entry.reusablePattern
  return [
    detailValue('principle', pattern.principle, language, ', ', false),
    detailValue('pattern_ids', pattern.pattern_ids, language),
    ...(pattern.works_when ?? []).map(value => detailValue('works_when', value, language, ', ', false)),
    ...(pattern.avoid_when ?? []).map(value => detailValue('avoid_when', value, language, ', ', false)),
    ...Object.entries(pattern.variables ?? {}).map(([key, value]) => detailValue(key, value, language)),
  ].filter(isDetailValue)
}

function searchIndexDetails(entry: ShotLibraryEntry, language: string): Array<{ field: string; value: string }> {
  const index = entry.searchIndex
  return [
    detailValue('queries', index.natural_language_queries?.slice(0, 4), language, ' | ', false),
    detailValue('visual_facets', index.visual_facets?.slice(0, 8), language),
    detailValue('narrative_facets', index.narrative_facets?.slice(0, 8), language),
    detailValue('emotion_facets', index.emotion_facets?.slice(0, 8), language),
    detailValue('pattern_facets', index.pattern_facets?.slice(0, 8), language),
  ].filter(isDetailValue)
}

function detailValue(field: string, value: string | Array<string | undefined> | undefined, language: string, separator = ', ', localizeValue = true): { field: string; value: string } | null {
  const values = Array.isArray(value) ? value : [value]
  const text = values
    .filter((item): item is string => Boolean(item?.trim()))
    .map(item => localizeValue ? localizeShotFieldValue(field, item, language) : item)
    .join(separator)
  return text ? { field: localizeShotField(field, language), value: text } : null
}

function isDetailValue(value: { field: string; value: string } | null): value is { field: string; value: string } {
  return value !== null
}

function TagRow({ values, empty }: { values: Array<string | { value: string; category?: ShotLibrarySemanticCategory; field?: string }>; empty?: string }) {
  const { i18n } = useTranslation()
  if (values.length === 0) return empty ? <span className="shot-library-page__muted">{empty}</span> : null
  return (
    <div className="shot-library-page__tags">
      {values.map((item) => {
        const value = typeof item === 'string' ? item : item.value
        const category = typeof item === 'string' ? undefined : item.category
        const field = typeof item === 'string' ? undefined : item.field
        const label = category ? localizeShotSemanticValue(category, value, i18n.language) : field ? `${field}: ${value}` : value
        return <StatusBadge key={`${category ?? field ?? 'value'}:${value}`} intent="neutral" emphasis="soft">{label}</StatusBadge>
      })}
    </div>
  )
}
