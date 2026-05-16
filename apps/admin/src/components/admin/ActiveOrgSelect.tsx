import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, Input, Label } from '@movscript/ui'
import { api } from '@/lib/api'
import { activeOrgOptionLabel } from '@/lib/adminPickerLabels'
import type { Organization, PaginatedResponse } from '@/types'

const DEFAULT_PAGE_SIZE = 25

type ActiveOrgSelectProps = {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder: string
  emptyLabel: string
  disabled?: boolean
  pageSize?: number
  className?: string
}

export function ActiveOrgSelect({
  value,
  onChange,
  label,
  placeholder,
  emptyLabel,
  disabled,
  pageSize = DEFAULT_PAGE_SIZE,
  className = '',
}: ActiveOrgSelectProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const params = useMemo(() => ({
    page,
    page_size: pageSize,
    status: 'active',
    is_personal: false,
    q: query.trim() || undefined,
  }), [page, pageSize, query])

  const orgsQuery = useQuery<PaginatedResponse<Organization>>({
    queryKey: ['admin', 'orgs', 'active-picker', params],
    queryFn: () => api.get('/admin/orgs', { params }).then((r) => r.data),
  })

  const orgs = orgsQuery.data?.items ?? []
  const total = orgsQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const canPage = total > pageSize

  function updateQuery(value: string) {
    setQuery(value)
    setPage(1)
  }

  return (
    <div className={className}>
      {label && <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>}
      <div className="grid gap-1.5">
        <Input
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder={t('admin.orgPicker.searchPlaceholder')}
          className="h-8 text-xs"
          disabled={disabled}
        />
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || orgsQuery.isLoading}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">{orgs.length ? placeholder : orgsQuery.isLoading ? t('common.loading') : emptyLabel}</option>
          {orgs.map((org) => (
            <option key={org.ID} value={org.ID}>{activeOrgOptionLabel(org)}</option>
          ))}
        </select>
        {canPage && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{t('admin.orgPicker.pageStatus', { page, pageCount })}</span>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                {t('admin.orgPicker.previousPage')}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                {t('admin.orgPicker.nextPage')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
