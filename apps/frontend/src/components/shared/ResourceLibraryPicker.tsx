import { ChevronLeft, ChevronRight, FileAudio, FileText, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input, Label } from '@movscript/ui'
import type { RawResource } from '@/types'
import { cn } from '@/lib/utils'
import { MediaViewer } from '@/components/shared/MediaViewer'

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
  className,
  listClassName,
}: ResourceLibraryPickerProps) {
  const { t } = useTranslation()

  return (
    <div className={cn('rounded-md border border-border bg-card p-3', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label className="type-label font-medium text-muted-foreground">{t('forms.selectFromResourceLibrary')}</Label>
        {selectedResource && onClear && (
          <button type="button" className="type-caption text-muted-foreground hover:text-foreground" onClick={onClear}>
            {t('forms.clearSelection')}
          </button>
        )}
      </div>
      <div className="mb-2 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            className="h-8 pl-7 type-label"
            placeholder={t('pages.assets.searchPlaceholder')}
          />
        </div>
        {typeOptions.length > 1 && (
          <select
            className="h-8 rounded-md border border-border bg-background px-2 type-label text-foreground"
            value={type}
            onChange={(event) => onType(event.target.value as ResourceTypeFilter)}
          >
            {typeOptions.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? t('common.all') : t(`pages.resources.types.${item}`, { defaultValue: item })}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className={cn('max-h-52 space-y-1 overflow-y-auto', listClassName)}>
        {isLoading ? (
          <p className="py-6 text-center type-label text-muted-foreground">{t('common.loadingShort')}</p>
        ) : resources.length === 0 ? (
          <p className="py-6 text-center type-label text-muted-foreground">{t('pages.resources.empty')}</p>
        ) : (
          resources.map((resource) => (
            <ResourcePickerRow
              key={resource.ID}
              resource={resource}
              selected={selectedResource?.ID === resource.ID}
              onSelect={() => onSelect(resource)}
            />
          ))
        )}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 type-caption text-muted-foreground">
        <span>{t('common.itemsCount', { count: total })}</span>
        <div className="flex items-center gap-1">
          <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>
            <ChevronLeft size={12} />
          </button>
          <span>{page}/{pageCount}</span>
          <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-40" disabled={page >= pageCount} onClick={() => onPage(Math.min(pageCount, page + 1))}>
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

function ResourcePickerRow({ resource, selected, onSelect }: { resource: RawResource; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
        selected ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/60',
      )}
    >
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-muted">
        {resource.type === 'image' || resource.type === 'video' || resource.type === 'text' ? (
          <MediaViewer resource={resource} className="h-full w-full" lightbox={false} />
        ) : resource.type === 'audio' ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground"><FileAudio size={14} /></div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground"><FileText size={14} /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate type-label font-medium text-foreground">{resource.name}</p>
        <p className="truncate type-caption text-muted-foreground">{resource.type} · {formatResourceBytes(resource.size)}</p>
      </div>
      {selected && <span className="shrink-0 type-caption text-primary">{t('common.selected')}</span>}
    </button>
  )
}

function formatResourceBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
