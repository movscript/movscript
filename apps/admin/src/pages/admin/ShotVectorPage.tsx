import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Database, RefreshCcw, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { translateAPIRequestError } from '@/lib/apiError'
import { AppInlineError } from '@movscript/ui/business/app'
import { Button } from '@movscript/ui/primitives'

type VectorStats = {
  documents: number
  embedded_documents: number
  references: number
  source_references: number
  unindexed_references: number
  orphan_references: number
  index_coverage: number
  by_kind: Record<string, number>
  by_locale: Record<string, number>
  by_embedding_model: Record<string, number>
  last_updated_at?: string
}

type VectorSearchResult = {
  document: {
    id: string
    reference_id: number
    source_id: string
    locale: string
    kind: string
    text: string
    metadata?: Record<string, unknown>
  }
  score: number
}

type VectorSearchResponse = {
  items: VectorSearchResult[]
}

type VectorMetricsResponse = {
  generated_at: string
  summary: {
    operations: number
    errors: number
    documents: number
  }
  operations: Array<{
    operation: string
    status: string
    count: number
    documents: number
    duration_ms: {
      avg: number
      max: number
      sum: number
    }
  }>
}

type ReindexResponse = {
  reindexed: number
  stats: VectorStats
}

export function ShotVectorPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('delayed reveal')
  const [locale, setLocale] = useState('zh-CN')
  const [activeQuery, setActiveQuery] = useState('delayed reveal')

  const statsQuery = useQuery<VectorStats>({
    queryKey: ['admin', 'shot-vectors', 'stats'],
    queryFn: () => api.get('/admin/shot-vectors/stats').then((r) => r.data),
  })
  const searchQuery = useQuery<VectorSearchResponse>({
    queryKey: ['admin', 'shot-vectors', 'search', activeQuery, locale],
    queryFn: () => api.get('/admin/shot-vectors/search', { params: { q: activeQuery, locale, top_k: 20 } }).then((r) => r.data),
    enabled: activeQuery.trim().length > 0,
  })
  const metricsQuery = useQuery<VectorMetricsResponse>({
    queryKey: ['admin', 'shot-vectors', 'metrics'],
    queryFn: () => api.get('/admin/shot-vectors/metrics').then((r) => r.data),
    refetchInterval: 5000,
  })
  const reindexMutation = useMutation<ReindexResponse>({
    mutationFn: () => api.post('/admin/shot-vectors/reindex').then((r) => r.data),
    onSuccess: () => {
      statsQuery.refetch()
      searchQuery.refetch()
      metricsQuery.refetch()
    },
  })

  const stats = statsQuery.data
  const kinds = useMemo(() => Object.entries(stats?.by_kind ?? {}).sort(([a], [b]) => a.localeCompare(b)), [stats?.by_kind])
  const locales = useMemo(() => Object.entries(stats?.by_locale ?? {}).sort(([a], [b]) => a.localeCompare(b)), [stats?.by_locale])
  const embeddingModels = useMemo(() => Object.entries(stats?.by_embedding_model ?? {}).sort(([a], [b]) => a.localeCompare(b)), [stats?.by_embedding_model])
  const operationRows = metricsQuery.data?.operations ?? []
  const error = statsQuery.error || searchQuery.error || metricsQuery.error || reindexMutation.error

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('admin.shotVectors.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.shotVectors.description')}</p>
        </div>
        <Button
          type="button"
          onClick={() => reindexMutation.mutate()}
          disabled={reindexMutation.isPending}
          className="gap-2"
        >
          <RefreshCcw size={15} />
          {reindexMutation.isPending ? t('admin.shotVectors.reindexing') : t('admin.shotVectors.reindex')}
        </Button>
      </header>

      {error && (
        <AppInlineError>
          {translateAPIRequestError(error)}
        </AppInlineError>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricTile label={t('admin.shotVectors.documents')} value={stats?.documents ?? 0} />
        <MetricTile label={t('admin.shotVectors.embeddedDocuments')} value={stats?.embedded_documents ?? 0} />
        <MetricTile label={t('admin.shotVectors.sourceReferences')} value={stats?.source_references ?? 0} />
        <MetricTile label={t('admin.shotVectors.references')} value={stats?.references ?? 0} />
        <MetricTile label={t('admin.shotVectors.coverage')} value={formatPercent(stats?.index_coverage)} />
        <MetricTile label={t('admin.shotVectors.kinds')} value={kinds.length} />
      </section>

      <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricTile label={t('admin.shotVectors.unindexedReferences')} value={stats?.unindexed_references ?? 0} />
        <MetricTile label={t('admin.shotVectors.orphanReferences')} value={stats?.orphan_references ?? 0} />
        <MetricTile label={t('admin.shotVectors.lastUpdated')} value={stats?.last_updated_at ? new Date(stats.last_updated_at).toLocaleString() : '-'} />
        <MetricTile label={t('admin.shotVectors.operations')} value={metricsQuery.data?.summary.operations ?? 0} />
        <MetricTile label={t('admin.shotVectors.errors')} value={metricsQuery.data?.summary.errors ?? 0} />
        <MetricTile label={t('admin.shotVectors.processedDocuments')} value={metricsQuery.data?.summary.documents ?? 0} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setActiveQuery(query)
                }}
                className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder={t('admin.shotVectors.searchPlaceholder')}
              />
            </div>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="zh-CN">zh-CN</option>
              <option value="en-US">en-US</option>
            </select>
            <Button type="button" variant="outline" onClick={() => setActiveQuery(query)}>
              {t('admin.shotVectors.search')}
            </Button>
          </div>
          <div className="divide-y divide-border">
            {(searchQuery.data?.items ?? []).map((item) => (
              <article key={item.document.id} className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Database size={14} />
                    <span>{item.document.kind}</span>
                    <span className="text-muted-foreground">#{item.document.reference_id}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{t('admin.shotVectors.score', { score: item.score.toFixed(2) })}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{item.document.text}</p>
                <div className="mt-2 text-xs text-muted-foreground">{item.document.id}</div>
              </article>
            ))}
            {searchQuery.isSuccess && (searchQuery.data?.items ?? []).length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">{t('admin.shotVectors.emptySearch')}</div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <BreakdownPanel title={t('admin.shotVectors.byKind')} rows={kinds} />
          <BreakdownPanel title={t('admin.shotVectors.byLocale')} rows={locales} />
          <BreakdownPanel title={t('admin.shotVectors.byEmbeddingModel')} rows={embeddingModels} />
          <OperationMetricsPanel title={t('admin.shotVectors.operationMetrics')} rows={operationRows} />
          {reindexMutation.data && (
            <div className="rounded-lg border border-border bg-card p-3 text-sm">
              {t('admin.shotVectors.reindexResult', { count: reindexMutation.data.reindexed })}
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}

function MetricTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  )
}

function formatPercent(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return `${Math.round(value * 100)}%`
}

function OperationMetricsPanel({ title, rows }: { title: string; rows: VectorMetricsResponse['operations'] }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={`${row.operation}:${row.status}`} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{row.operation}</span>
              <span className="text-xs text-muted-foreground">{row.status}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t('admin.shotVectors.operationMetricDetail', {
                count: row.count.toLocaleString(),
                avg: row.duration_ms.avg.toFixed(1),
                max: row.duration_ms.max.toFixed(1),
                documents: row.documents.toLocaleString(),
              })}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-sm text-muted-foreground">-</div>}
      </div>
    </div>
  )
}

function BreakdownPanel({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-3 space-y-2">
        {rows.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-muted-foreground">{key}</span>
            <span className="font-medium">{value.toLocaleString()}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="text-sm text-muted-foreground">-</div>}
      </div>
    </div>
  )
}
