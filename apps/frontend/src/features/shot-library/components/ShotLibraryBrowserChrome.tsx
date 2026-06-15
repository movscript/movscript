import { useTranslation } from 'react-i18next'
import { X, type LucideIcon } from 'lucide-react'
import { Button, cn } from '@movscript/ui/primitives'
import {
  localizeShotFacetValue,
  type ShotLibraryFacetFilters,
  type ShotLibrarySource,
} from '@/features/shot-library/domain/shotReferenceLibrary'
import type { ShotFacetCategory, ShotFacetOptions } from '@/features/shot-library/domain/shotLibraryWorkspaceModel'

export function ShotLibraryMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="shot-library-page__metric">
      <Icon size={15} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function ShotLibrarySourceBar({
  sources,
  activeSourceId,
  failedSourceIds,
  onSelect,
}: {
  sources: ShotLibrarySource[]
  activeSourceId: string | 'all'
  failedSourceIds: Set<string>
  onSelect: (sourceId: string | 'all') => void
}) {
  const { t } = useTranslation()
  return (
    <div className="shot-library-page__sources" aria-label={t('pages.shotLibrary.sourceFilter')}>
      <button
        type="button"
        className={cn('shot-library-page__source-chip', activeSourceId === 'all' && 'shot-library-page__source-chip--active')}
        onClick={() => onSelect('all')}
      >
        {t('pages.shotLibrary.allSources')}
      </button>
      {sources.map(source => (
        <button
          key={source.id}
          type="button"
          className={cn(
            'shot-library-page__source-chip',
            activeSourceId === source.id && 'shot-library-page__source-chip--active',
            failedSourceIds.has(source.id) && 'shot-library-page__source-chip--failed',
          )}
          onClick={() => onSelect(source.id)}
          title={source.apiV1BaseURL}
        >
          {source.name}
          {source.readOnly ? <span>{t('pages.shotLibrary.readOnlyBadge')}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function ShotFacetFilters({
  options,
  value,
  onChange,
}: {
  options: ShotFacetOptions
  value: ShotLibraryFacetFilters
  onChange: (value: ShotLibraryFacetFilters) => void
}) {
  const { t, i18n } = useTranslation()
  const categories: ShotFacetCategory[] = ['visual', 'narrative', 'emotion', 'pattern', 'production']
  const hasActive = categories.some(category => (value[category] ?? []).length > 0)
  return (
    <div className="shot-library-facets">
      {categories.map(category => (
        <label key={category} className="shot-library-facets__field">
          <span>{t(`pages.shotLibrary.facets.${category}`)}</span>
          <select
            value={(value[category] ?? [])[0] ?? ''}
            onChange={event => onChange(setFacetValue(value, category, event.target.value))}
          >
            <option value="">{t('pages.shotLibrary.allFacetValues')}</option>
            {options[category].slice(0, 80).map(option => (
              <option key={`${category}:${option}`} value={option}>{localizeShotFacetValue(category, option, i18n.language)}</option>
            ))}
          </select>
        </label>
      ))}
      {hasActive ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange({})}>
          <X size={14} />
          {t('pages.shotLibrary.clearFilters')}
        </Button>
      ) : null}
    </div>
  )
}

function setFacetValue(filters: ShotLibraryFacetFilters, category: ShotFacetCategory, selected: string): ShotLibraryFacetFilters {
  return {
    ...filters,
    [category]: selected ? [selected] : [],
  }
}
