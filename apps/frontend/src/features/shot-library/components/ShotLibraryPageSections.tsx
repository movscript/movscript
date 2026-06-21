import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  Search,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@movscript/ui/primitives'
import type {
  ShotLibraryEntry,
  ShotLibraryFacetFilters,
  ShotLibrarySource,
} from '@/features/shot-library/domain/shotReferenceLibrary'
import {
  formatDuration,
  shotEntryKey,
  type ShotFacetOptions,
} from '@/features/shot-library/domain/shotLibraryWorkspaceModel'
import {
  ShotFacetFilters,
  ShotLibraryMetric,
  ShotLibrarySourceBar,
} from '@/features/shot-library/components/ShotLibraryBrowserChrome'
import { ShotReferenceCard } from '@/features/shot-library/components/ShotLibraryReferenceCard'
import { SHOT_LIBRARY_PAGE_SIZE } from '@/features/shot-library/components/shotLibraryPagination'

export function ShotLibraryHeader({
  saving,
  disabled,
  onImport,
}: {
  saving: boolean
  disabled: boolean
  onImport: () => void
}) {
  const { t } = useTranslation()
  return (
    <section className="shot-library-page__header">
      <div className="shot-library-page__title-block">
        <div className="shot-library-page__eyebrow">
          <Clapperboard size={14} />
          <span>{t('pages.shotLibrary.eyebrow')}</span>
        </div>
        <h1>{t('pages.shotLibrary.title')}</h1>
        <p>{t('pages.shotLibrary.description')}</p>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={onImport}
        loading={saving}
        disabled={disabled}
      >
        <Upload size={14} />
        {saving ? t('pages.shotLibrary.analyzing') : t('pages.shotLibrary.uploadShot')}
      </Button>
    </section>
  )
}

export function ShotLibraryMetrics({
  entryCount,
  totalDuration,
  sourceCount,
}: {
  entryCount: number
  totalDuration: number
  sourceCount: number
}) {
  const { t, i18n } = useTranslation()
  return (
    <section className="shot-library-page__metrics" aria-label={t('pages.shotLibrary.metricsLabel')}>
      <ShotLibraryMetric icon={Film} label={t('pages.shotLibrary.totalReferences')} value={String(entryCount)} />
      <ShotLibraryMetric icon={Video} label={t('pages.shotLibrary.totalDuration')} value={formatDuration(totalDuration, i18n.language)} />
      <ShotLibraryMetric icon={Sparkles} label={t('pages.shotLibrary.librarySources')} value={String(sourceCount)} />
    </section>
  )
}

export function ShotLibraryToolbar({
  sources,
  activeSourceId,
  failedSourceIds,
  query,
  facetOptions,
  facetFilters,
  onSourceSelect,
  onQueryChange,
  onFacetFiltersChange,
}: {
  sources: ShotLibrarySource[]
  activeSourceId: string | 'all'
  failedSourceIds: Set<string>
  query: string
  facetOptions: ShotFacetOptions
  facetFilters: ShotLibraryFacetFilters
  onSourceSelect: (sourceId: string | 'all') => void
  onQueryChange: (query: string) => void
  onFacetFiltersChange: (filters: ShotLibraryFacetFilters) => void
}) {
  const { t } = useTranslation()
  return (
    <section className="shot-library-page__toolbar">
      <div className="shot-library-page__toolbar-row">
        <ShotLibrarySourceBar
          sources={sources}
          activeSourceId={activeSourceId}
          onSelect={onSourceSelect}
          failedSourceIds={failedSourceIds}
        />
        <div className="shot-library-page__search">
          <Search size={14} />
          <Input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder={t('pages.shotLibrary.searchPlaceholder')}
            aria-label={t('pages.shotLibrary.searchPlaceholder')}
          />
        </div>
      </div>
      <div className="shot-library-page__toolbar-row">
        <ShotFacetFilters
          options={facetOptions}
          value={facetFilters}
          onChange={onFacetFiltersChange}
        />
      </div>
    </section>
  )
}

export function ShotLibraryBrowser({
  failedSourceCount,
  entriesCount,
  isLoading,
  visibleEntries,
  pagedVisibleEntries,
  selectedEntryKey,
  page,
  pageCount,
  onEntrySelect,
  onPageChange,
}: {
  failedSourceCount: number
  entriesCount: number
  isLoading: boolean
  visibleEntries: ShotLibraryEntry[]
  pagedVisibleEntries: ShotLibraryEntry[]
  selectedEntryKey: string
  page: number
  pageCount: number
  onEntrySelect: (entry: ShotLibraryEntry) => void
  onPageChange: (page: number | ((current: number) => number)) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="shot-library-page__library">
      {failedSourceCount > 0 ? (
        <div className="shot-library-page__source-warning">
          <AlertCircle size={14} />
          <span>{t('pages.shotLibrary.sourceLoadFailed', { count: failedSourceCount })}</span>
        </div>
      ) : null}

      {entriesCount === 0 ? (
        <Card className="shot-library-page__empty">
          <CardHeader>
            <CardTitle>{t('pages.shotLibrary.emptyTitle')}</CardTitle>
            <CardDescription>{t('pages.shotLibrary.emptyDescription')}</CardDescription>
          </CardHeader>
        </Card>
      ) : isLoading ? (
        <div className="shot-library-page__empty-inline">
          <Sparkles size={16} />
          <span>{t('common.loadingShort')}</span>
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="shot-library-page__empty-inline">
          <AlertCircle size={16} />
          <span>{t('pages.shotLibrary.noMatches')}</span>
        </div>
      ) : (
        <div className="shot-library-page__browser">
          <div className="shot-library-page__grid">
            {pagedVisibleEntries.map(entry => (
              <ShotReferenceCard
                key={shotEntryKey(entry)}
                entry={entry}
                active={shotEntryKey(entry) === selectedEntryKey}
                onSelect={() => onEntrySelect(entry)}
              />
            ))}
          </div>
          {visibleEntries.length > SHOT_LIBRARY_PAGE_SIZE ? (
            <div className="shot-library-page__pager">
              <span>{t('pages.shotLibrary.libraryPageStatus', { page, total: pageCount })}</span>
              <div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => onPageChange(current => Math.max(1, current - 1))}
                  aria-label={t('pages.resources.previousPage')}
                  title={t('pages.resources.previousPage')}
                >
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  disabled={page >= pageCount}
                  onClick={() => onPageChange(current => Math.min(pageCount, current + 1))}
                  aria-label={t('pages.resources.nextPage')}
                  title={t('pages.resources.nextPage')}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
