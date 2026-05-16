import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, Input, Label } from '@movscript/ui'
import { api } from '@/lib/api'
import { activeUserOptionLabel } from '@/lib/adminPickerLabels'
import type { PaginatedResponse, User } from '@/types'

const DEFAULT_PAGE_SIZE = 25

type ActiveUserSelectProps = {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder: string
  emptyLabel: string
  disabled?: boolean
  autoFocus?: boolean
  pageSize?: number
  className?: string
  selectClassName?: string
}

export function ActiveUserSelect({
  value,
  onChange,
  label,
  placeholder,
  emptyLabel,
  disabled,
  autoFocus,
  pageSize = DEFAULT_PAGE_SIZE,
  className = '',
  selectClassName = '',
}: ActiveUserSelectProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const params = useMemo(() => ({
    page,
    page_size: pageSize,
    status: 'active',
    q: query.trim() || undefined,
  }), [page, pageSize, query])

  const usersQuery = useQuery<PaginatedResponse<User>>({
    queryKey: ['admin', 'users', 'active-picker', params],
    queryFn: () => api.get('/admin/users', { params }).then((r) => r.data),
  })

  const users = usersQuery.data?.items ?? []
  const total = usersQuery.data?.total ?? 0
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
          placeholder={t('admin.userPicker.searchPlaceholder')}
          className="h-8 text-xs"
          disabled={disabled}
          autoFocus={autoFocus}
        />
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || usersQuery.isLoading}
          className={`h-8 w-full rounded-md border border-input bg-background px-2 text-xs ${selectClassName}`}
        >
          <option value="">{users.length ? placeholder : usersQuery.isLoading ? t('common.loading') : emptyLabel}</option>
          {users.map((user) => (
            <option key={user.ID} value={user.ID}>{activeUserOptionLabel(user)}</option>
          ))}
        </select>
        {canPage && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{t('admin.userPicker.pageStatus', { page, pageCount })}</span>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                {t('admin.userPicker.previousPage')}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                {t('admin.userPicker.nextPage')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
