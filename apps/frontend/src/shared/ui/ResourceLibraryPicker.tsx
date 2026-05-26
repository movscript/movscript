import { FileAudio, FileText, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ResourceLibraryPickerPanel, type ResourceLibraryPickerItem, type ResourceLibraryPickerOption } from '@movscript/ui'
import type { RawResource } from '@/types'
import { MediaViewer } from '@/shared/ui/MediaViewer'

export type ResourceTypeFilter = 'all' | RawResource['type']

const RESOURCE_TYPE_FILTERS: ResourceTypeFilter[] = ['all', 'image', 'video', 'audio', 'text', 'file']

interface ResourceLibraryPickerProps {
  resources: RawResource[]
  selectedResource: RawResource | null
  search: string
  type: ResourceTypeFilter
  page: number
  pageCount: number
  total: number
  isLoading: boolean
  typeOptions?: ResourceTypeFilter[]
  onSearch: (value: string) => void
  onType: (value: ResourceTypeFilter) => void
  onPage: (value: number) => void
  onSelect: (resource: RawResource) => void
  onClear?: () => void
  variant?: 'default' | 'prep-dialog'
  className?: string
  listClassName?: string
}

export function ResourceLibraryPicker({
  resources,
  selectedResource,
  search,
  type,
  page,
  pageCount,
  total,
  isLoading,
  typeOptions = RESOURCE_TYPE_FILTERS,
  onSearch,
  onType,
  onPage,
  onSelect,
  onClear,
  variant = 'default',
  className,
  listClassName,
}: ResourceLibraryPickerProps) {
  const { t } = useTranslation()
  const options: ResourceLibraryPickerOption[] = typeOptions.map((item) => ({
    value: item,
    label: item === 'all' ? t('common.all') : t(`pages.resources.types.${item}`, { defaultValue: item }),
  }))
  const items: ResourceLibraryPickerItem[] = resources.map((resource) => ({
    id: String(resource.ID),
    title: resource.name,
    meta: `${resource.type} · ${formatResourceBytes(resource.size)}`,
    selected: selectedResource?.ID === resource.ID,
    thumbnail: resource.type === 'image' || resource.type === 'video' || resource.type === 'text'
      ? <MediaViewer resource={resource} lightbox={false} />
      : undefined,
    fallbackIcon: resource.type === 'audio' ? FileAudio : FileText,
  }))

  return (
    <ResourceLibraryPickerPanel
      title={t('forms.selectFromResourceLibrary')}
      clearLabel={t('forms.clearSelection')}
      searchPlaceholder={t('pages.assets.searchPlaceholder')}
      loadingLabel={t('common.loadingShort')}
      emptyLabel={t('pages.resources.empty')}
      selectedLabel={t('common.selected')}
      pageSummary={t('common.itemsCount', { count: total })}
      previousLabel={t('pages.resources.previousPage')}
      nextLabel={t('pages.resources.nextPage')}
      searchIcon={<Search size={12} />}
      items={items}
      search={search}
      type={type}
      typeOptions={options}
      page={page}
      pageCount={pageCount}
      showClear={!!selectedResource}
      variant={variant}
      className={className}
      listClassName={listClassName}
      onSearch={onSearch}
      onType={(value) => onType(value as ResourceTypeFilter)}
      onPage={onPage}
      onSelect={(id) => {
        const resource = resources.find((item) => String(item.ID) === id)
        if (resource) onSelect(resource)
      }}
      onClear={onClear}
      isLoading={isLoading}
    />
  )
}

function formatResourceBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
