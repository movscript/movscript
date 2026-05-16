import { useTranslation } from 'react-i18next'
import { Button } from '@movscript/ui'

type PaginationControlsProps = {
  page: number
  pageCount: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  disabled?: boolean
}

export function PaginationControls({ page, pageCount, pageSize, total, onPageChange, disabled }: PaginationControlsProps) {
  const { t } = useTranslation()
  const normalizedPage = Math.max(1, Math.min(pageCount, page))
  const start = total === 0 ? 0 : (normalizedPage - 1) * pageSize + 1
  const end = total === 0 ? 0 : Math.min(total, normalizedPage * pageSize)
  const isFirst = normalizedPage <= 1
  const isLast = normalizedPage >= pageCount

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-muted-foreground">
        {t('admin.pagination.range', { start, end, total })}
        <span className="mx-2 text-muted-foreground/50">·</span>
        {t('admin.pagination.pageStatus', { page: normalizedPage, pageCount })}
      </span>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || isFirst} onClick={() => onPageChange(1)}>
          {t('admin.pagination.firstPage')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || isFirst} onClick={() => onPageChange(normalizedPage - 1)}>
          {t('admin.pagination.previousPage')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || isLast} onClick={() => onPageChange(normalizedPage + 1)}>
          {t('admin.pagination.nextPage')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || isLast} onClick={() => onPageChange(pageCount)}>
          {t('admin.pagination.lastPage')}
        </Button>
      </div>
    </div>
  )
}
