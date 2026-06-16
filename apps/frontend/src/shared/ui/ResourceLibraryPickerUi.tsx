import type { ReactNode } from 'react'

import { AppPager, AppPanel } from '@movscript/ui/business/app'
import { Button, Input, Label, NativeSelect } from '@movscript/ui/primitives'
import {
  WorkbenchListItem,
  WorkbenchThumbnail,
  type WorkbenchIconComponent,
} from '@movscript/ui/business/workbench'
import { cn } from '@/shared/ui/cn'
import './ResourceLibraryPickerUi.css'

export type ResourceLibraryPickerOption = {
  value: string
  label: ReactNode
}

export type ResourceLibraryPickerItem = {
  id: string
  title: ReactNode
  meta: ReactNode
  selected?: boolean
  thumbnail?: ReactNode
  fallbackIcon?: WorkbenchIconComponent
}

export function ResourceLibraryPickerPanel({
  title,
  clearLabel,
  searchPlaceholder,
  loadingLabel,
  emptyLabel,
  selectedLabel,
  pageSummary,
  previousLabel,
  nextLabel,
  searchIcon,
  items,
  search,
  type,
  typeOptions = [],
  page,
  pageCount,
  showClear,
  variant = 'default',
  className,
  listClassName,
  onSearch,
  onType,
  onPage,
  onSelect,
  onClear,
  isLoading,
}: {
  title: ReactNode
  clearLabel: ReactNode
  searchPlaceholder?: string
  loadingLabel: ReactNode
  emptyLabel: ReactNode
  selectedLabel: ReactNode
  pageSummary: ReactNode
  previousLabel?: string
  nextLabel?: string
  searchIcon?: ReactNode
  items: ResourceLibraryPickerItem[]
  search: string
  type: string
  typeOptions?: ResourceLibraryPickerOption[]
  page: number
  pageCount: number
  showClear?: boolean
  variant?: 'default' | 'prep-dialog'
  className?: string
  listClassName?: string
  onSearch: (value: string) => void
  onType: (value: string) => void
  onPage: (value: number) => void
  onSelect: (id: string) => void
  onClear?: () => void
  isLoading?: boolean
}) {
  const panelClassName = variant === 'prep-dialog'
    ? 'resource-library-picker-panel--prep-dialog'
    : undefined
  const panelListClassName = variant === 'prep-dialog'
    ? 'resource-library-picker__list--prep-dialog'
    : undefined

  return (
    <AppPanel className={cn(panelClassName, className)} bodyClassName="resource-library-picker">
      <ResourceLibraryPickerHeader title={title} clearLabel={clearLabel} showClear={showClear} onClear={onClear} />

      <ResourceLibraryPickerToolbar
        search={search}
        type={type}
        typeOptions={typeOptions}
        searchIcon={searchIcon}
        searchPlaceholder={searchPlaceholder}
        onSearch={onSearch}
        onType={onType}
      />

      <ResourceLibraryPickerList
        items={items}
        selectedLabel={selectedLabel}
        loadingLabel={loadingLabel}
        emptyLabel={emptyLabel}
        className={cn(panelListClassName, listClassName)}
        isLoading={isLoading}
        onSelect={onSelect}
      />

      <AppPager
        className="resource-library-picker__pager"
        page={page}
        pageCount={pageCount}
        summary={pageSummary}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        onPage={onPage}
      />
    </AppPanel>
  )
}

export function ResourceLibraryPickerHeader({
  title,
  clearLabel,
  showClear,
  onClear,
}: {
  title: ReactNode
  clearLabel: ReactNode
  showClear?: boolean
  onClear?: () => void
}) {
  return (
    <div className="resource-library-picker__header">
      <Label className="resource-library-picker__title">{title}</Label>
      {showClear && onClear ? (
        <Button type="button" variant="ghost" size="xs" onClick={onClear}>
          {clearLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function ResourceLibraryPickerToolbar({
  search,
  type,
  typeOptions = [],
  searchIcon,
  searchPlaceholder,
  onSearch,
  onType,
}: {
  search: string
  type: string
  typeOptions?: ResourceLibraryPickerOption[]
  searchIcon?: ReactNode
  searchPlaceholder?: string
  onSearch: (value: string) => void
  onType: (value: string) => void
}) {
  return (
    <div className="resource-library-picker__toolbar">
      <div className="resource-library-picker__search">
        {searchIcon ? <span className="resource-library-picker__search-icon">{searchIcon}</span> : null}
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className={cn('resource-library-picker__search-input', searchIcon && 'resource-library-picker__search-input--with-icon')}
          placeholder={searchPlaceholder}
        />
      </div>
      {typeOptions.length > 1 ? (
        <NativeSelect
          controlSize="sm"
          className="resource-library-picker__type-select"
          value={type}
          onChange={(event) => onType(event.target.value)}
        >
          {typeOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
      ) : null}
    </div>
  )
}

export function ResourceLibraryPickerList({
  items,
  selectedLabel,
  loadingLabel,
  emptyLabel,
  className,
  onSelect,
  isLoading,
}: {
  items: ResourceLibraryPickerItem[]
  selectedLabel: ReactNode
  loadingLabel: ReactNode
  emptyLabel: ReactNode
  className?: string
  onSelect: (id: string) => void
  isLoading?: boolean
}) {
  return (
    <div className={cn('resource-library-picker__list', className)}>
      {isLoading ? (
        <p className="resource-library-picker__state">{loadingLabel}</p>
      ) : items.length === 0 ? (
        <p className="resource-library-picker__state">{emptyLabel}</p>
      ) : (
        items.map((item) => (
          <ResourceLibraryPickerRow
            key={item.id}
            item={item}
            selectedLabel={selectedLabel}
            onSelect={() => onSelect(item.id)}
          />
        ))
      )}
    </div>
  )
}

export function ResourceLibraryPickerRow({
  item,
  selectedLabel,
  onSelect,
}: {
  item: ResourceLibraryPickerItem
  selectedLabel: ReactNode
  onSelect: () => void
}) {
  return (
    <WorkbenchListItem onClick={onSelect} active={item.selected} density="compact" className="resource-library-picker__row">
      {item.thumbnail ? (
        <WorkbenchThumbnail ratio="square" className="resource-library-picker__thumbnail">
          {item.thumbnail}
        </WorkbenchThumbnail>
      ) : (
        <WorkbenchThumbnail ratio="square" className="resource-library-picker__thumbnail" icon={item.fallbackIcon} />
      )}
      <div className="resource-library-picker__item-copy">
        <p className="resource-library-picker__item-title">{item.title}</p>
        <p className="resource-library-picker__item-meta">{item.meta}</p>
      </div>
      {item.selected ? <span className="resource-library-picker__selected-label">{selectedLabel}</span> : null}
    </WorkbenchListItem>
  )
}
