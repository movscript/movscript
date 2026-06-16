import { CheckCircle2, Film, Loader2, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Button,
  Input,
  Textarea,
  cn,
} from '@movscript/ui/primitives'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import type { RawResource } from '@/types'
import type {
  ShotImportWorkspace,
  ShotManualWorkspace,
  ShotTagSuggestions,
} from '@/features/shot-library/domain/shotLibraryWorkspaceModel'
import {
  ManualField,
  StructuredShotEditor,
  TagInputField,
} from '@/features/shot-library/components/ShotLibraryWorkspaceFields'

export function ShotImportResourceGrid({
  resources,
  selectedResource,
  search,
  page,
  pageCount,
  total,
  isLoading,
  disabled,
  onSearch,
  onPage,
  onSelect,
  onClear,
}: {
  resources: RawResource[]
  selectedResource: RawResource | null
  search: string
  page: number
  pageCount: number
  total: number
  isLoading: boolean
  disabled: boolean
  onSearch: (value: string) => void
  onPage: (value: number) => void
  onSelect: (resource: RawResource) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="shot-import-resource-grid">
      <div className="shot-import-resource-grid__search">
        <Search size={13} />
        <Input
          value={search}
          disabled={disabled}
          placeholder={t('pages.assets.searchPlaceholder')}
          onChange={event => onSearch(event.target.value)}
        />
        {selectedResource ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            onClick={onClear}
            aria-label={t('forms.clearSelection')}
            title={t('forms.clearSelection')}
          >
            <X size={14} />
          </Button>
        ) : null}
      </div>
      <div className="shot-import-resource-grid__list" aria-busy={isLoading}>
        {isLoading ? (
          <div className="shot-import-resource-grid__state">
            <Loader2 className="shot-import-resource-grid__spinner" size={16} />
            <span>{t('common.loadingShort')}</span>
          </div>
        ) : resources.length === 0 ? (
          <div className="shot-import-resource-grid__state">
            <Film size={16} />
            <span>{t('pages.resources.empty')}</span>
          </div>
        ) : resources.map(resource => (
          <button
            key={resource.ID}
            type="button"
            className={cn(
              'shot-import-resource-grid__card',
              selectedResource?.ID === resource.ID && 'shot-import-resource-grid__card--selected',
            )}
            disabled={disabled}
            onClick={() => onSelect(resource)}
            aria-label={resource.name}
            aria-pressed={selectedResource?.ID === resource.ID}
            title={resource.name}
          >
            <MediaViewer resource={resource} fit="cover" lightbox={false} />
            {selectedResource?.ID === resource.ID ? (
              <span className="shot-import-resource-grid__selected">
                <CheckCircle2 size={16} />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="shot-import-resource-grid__pager">
        <span>{t('common.itemsCount', { count: total })}</span>
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || page <= 1}
            onClick={() => onPage(Math.max(1, page - 1))}
          >
            {t('pages.resources.previousPage')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || page >= pageCount}
            onClick={() => onPage(Math.min(pageCount, page + 1))}
          >
            {t('pages.resources.nextPage')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ShotImportWorkspaceEditor({
  workspace,
  disabled,
  tagSuggestions,
  onChange,
}: {
  workspace: ShotImportWorkspace
  disabled: boolean
  tagSuggestions: ShotTagSuggestions
  onChange: (patch: Partial<ShotManualWorkspace>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="shot-import-dialog__editor">
      <ManualField label={t('pages.shotLibrary.titleField')}>
        <Input value={workspace.title} disabled={disabled} onChange={event => onChange({ title: event.target.value })} />
      </ManualField>
      <ManualField label={t('pages.shotLibrary.summaryField')}>
        <Textarea value={workspace.summary} disabled={disabled} rows={3} onChange={event => onChange({ summary: event.target.value })} />
      </ManualField>
      <div className="shot-library-manual-form__range">
        <ManualField label={t('pages.shotLibrary.startSec')}>
          <Input value={workspace.startSec} disabled={disabled} onChange={event => onChange({ startSec: event.target.value })} />
        </ManualField>
        <ManualField label={t('pages.shotLibrary.endSec')}>
          <Input value={workspace.endSec} disabled={disabled} onChange={event => onChange({ endSec: event.target.value })} />
        </ManualField>
      </div>
      <TagInputField label={t('pages.shotLibrary.intent')} value={workspace.intent} disabled={disabled} suggestions={tagSuggestions.intent} category="intent" onChange={value => onChange({ intent: value })} />
      <TagInputField label={t('pages.shotLibrary.pattern')} value={workspace.pattern} disabled={disabled} suggestions={tagSuggestions.pattern} category="pattern" onChange={value => onChange({ pattern: value })} />
      <TagInputField label={t('pages.shotLibrary.shotFunction')} value={workspace.shotFunction} disabled={disabled} suggestions={tagSuggestions.shotFunction} category="shotFunction" onChange={value => onChange({ shotFunction: value })} />
      <TagInputField label={t('pages.shotLibrary.visualPreference')} value={workspace.visualPreference} disabled={disabled} suggestions={tagSuggestions.visualPreference} category="visualPreference" onChange={value => onChange({ visualPreference: value })} />
      <TagInputField label={t('pages.shotLibrary.emotionalEffect')} value={workspace.emotionalEffect} disabled={disabled} suggestions={tagSuggestions.emotionalEffect} category="emotionalEffect" onChange={value => onChange({ emotionalEffect: value })} />
      <StructuredShotEditor workspace={workspace} disabled={disabled} onChange={onChange} />
    </div>
  )
}
