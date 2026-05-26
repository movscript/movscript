import type { ReactNode } from 'react'
import { ListFilter, Search, X } from 'lucide-react'

import {
  ContentFilterBarShell,
  ContentFilterChipButton,
  ContentFilterChipRail,
  ContentFilterClearButton,
  ContentFilterCount,
  ContentFilterSearchBox,
  ContentFilterSelectField,
  ContentFilterToolbar,
} from '@movscript/ui'

export interface FilterOption {
  value: string
  label: string
  count?: number
}

interface ContentFilterBarProps {
  query: string
  onQueryChange: (value: string) => void
  queryPlaceholder?: string
  filters?: Array<{
    id: string
    label: string
    value: string
    options: FilterOption[]
    onChange: (value: string) => void
  }>
  chips?: Array<{
    id: string
    label: string
    onRemove: () => void
  }>
  resultCount?: number
  totalCount?: number
  actions?: ReactNode
}

export function ContentFilterBar({
  query,
  onQueryChange,
  queryPlaceholder = '搜索',
  filters = [],
  chips = [],
  resultCount,
  totalCount,
  actions,
}: ContentFilterBarProps) {
  return (
    <ContentFilterBarShell>
      <ContentFilterToolbar>
        <ContentFilterSearchBox
          icon={<Search size={14} />}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={queryPlaceholder}
        />

        {filters.map((filter) => (
          <ContentFilterSelectField
            key={filter.id}
            icon={<ListFilter size={14} />}
            label={filter.label}
            value={filter.value}
            onChange={(event) => filter.onChange(event.target.value)}
            options={filter.options}
          />
        ))}

        {typeof resultCount === 'number' && typeof totalCount === 'number' ? (
          <ContentFilterCount>
            {resultCount} / {totalCount}
          </ContentFilterCount>
        ) : null}

        {actions}
      </ContentFilterToolbar>

      {chips.length > 0 ? (
        <ContentFilterChipRail
          label="当前筛选"
          clearAction={(
            <ContentFilterClearButton onClick={() => chips.forEach((chip) => chip.onRemove())}>
              清空
            </ContentFilterClearButton>
          )}
        >
          {chips.map((chip) => (
            <ContentFilterChipButton
              key={chip.id}
              onClick={chip.onRemove}
              removeIcon={<X size={12} />}
            >
              {chip.label}
            </ContentFilterChipButton>
          ))}
        </ContentFilterChipRail>
      ) : null}
    </ContentFilterBarShell>
  )
}
