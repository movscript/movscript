import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Database, Gauge, ListTree, RefreshCw, Route, Trash2 } from 'lucide-react'
import { Badge, Button, AppTextEmptyState, semanticToneClass } from '@movscript/ui'
import { AgentConsoleNav } from '@/pages/agent/AgentConsoleNav'
import { localAgentClient, type AgentRuntimeTelemetryOperation, type AgentRuntimeTelemetrySpan } from '@/lib/localAgentClient'
import {
  captureAgentStorageSnapshot,
  formatBytes,
  formatMs,
  operationKindLabel,
  slowestPhase,
  summarizeAgentPerformanceMetrics,
  useAgentPerformanceStore,
  type AgentPerformanceOperation,
  type AgentPerformanceMetricSample,
} from '@/store/agentPerformanceStore'
import { cn } from '@/lib/utils'

export default function AIAgentPerformancePage() {
  const operations = useAgentPerformanceStore((state) => state.operations)
  const metrics = useAgentPerformanceStore((state) => state.metrics)
  const logs = useAgentPerformanceStore((state) => state.logs)
  const longTasks = useAgentPerformanceStore((state) => state.longTasks)
  const storageSnapshots = useAgentPerformanceStore((state) => state.storageSnapshots)
  const clear = useAgentPerformanceStore((state) => state.clear)
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null)
  const runtimeTelemetryQuery = useQuery({
    queryKey: ['agent-runtime-telemetry', localAgentClient.baseURL],
    queryFn: ({ signal }) => localAgentClient.getRuntimeTelemetry(signal),
    refetchInterval: 5_000,
    retry: false,
  })

  useEffect(() => {
    captureAgentStorageSnapshot()
  }, [])

  const selectedOperation = useMemo(() => {
    if (!selectedOperationId) return operations[0] ?? null
    return operations.find((operation) => operation.id === selectedOperationId) ?? operations[0] ?? null
  }, [operations, selectedOperationId])

  const summary = useMemo(() => summarizeOperations(operations), [operations])
  const combinedMetrics = useMemo(() => [
    ...metrics,
    ...(runtimeTelemetryQuery.data?.metrics.map((sample) => ({
      id: `runtime:${sample.name}:${sample.createdAt}:${sample.value}`,
      name: sample.name,
      value: sample.value,
      unit: sample.unit,
      createdAt: sample.createdAt,
      labels: sample.labels,
    })) ?? []),
  ], [metrics, runtimeTelemetryQuery.data?.metrics])
  const combinedLogs = useMemo(() => [
    ...logs,
    ...(runtimeTelemetryQuery.data?.logs.map((log) => ({
      id: `runtime:${log.createdAt}:${log.message}`,
      level: log.level,
      message: `[runtime] ${log.message}`,
      createdAt: log.createdAt,
      operationId: log.operationId,
      details: log.details,
    })) ?? []),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [logs, runtimeTelemetryQuery.data?.logs])
  const metricSummary = useMemo(() => summarizeAgentPerformanceMetrics(combinedMetrics).slice(0, 12), [combinedMetrics])
  const latestStorage = storageSnapshots[0]
  const maxLongTask = longTasks.reduce((max, task) => Math.max(max, task.durationMs), 0)
  const runtimeSummary = runtimeTelemetryQuery.data?.summary
  const runtimeOperations = runtimeTelemetryQuery.data?.operations ?? []
  const runtimeSpans = runtimeTelemetryQuery.data?.spans ?? []
  const runtimeService = runtimeTelemetryQuery.data?.service
  const latencySeries = useMemo(() => latencyTrendSeries(combinedMetrics, operations, runtimeSpans), [combinedMetrics, operations, runtimeSpans])
  const spanKindRows = useMemo(() => spanKindDistribution(runtimeSpans), [runtimeSpans])
  const slowRows = useMemo(() => slowDiagnosticRows(operations, runtimeSpans, longTasks), [operations, runtimeSpans, longTasks])

  return (
    <div data-testid="agent-performance-page" className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-background px-5 py-3">
        <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Gauge size={18} />
              <h1 className="type-title-sm font-semibold text-foreground">Agent 性能监控</h1>
              <Badge variant={summary.slowCount > 0 ? 'warning' : 'success'}>
                {summary.slowCount > 0 ? `${summary.slowCount} 次慢操作` : '交互正常'}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 max-w-3xl type-label leading-5 text-muted-foreground">
              以三层数据排查 Agent：指标看趋势，Timeline 看单次链路，诊断日志指出慢阶段和本地状态风险。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { captureAgentStorageSnapshot(); void runtimeTelemetryQuery.refetch() }}>
              <RefreshCw size={14} />
              刷新快照
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clear}>
              <Trash2 size={14} />
              清空本页样本
            </Button>
          </div>
        </div>
      </header>

      <AgentConsoleNav compact />

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <PerformanceStat title="操作样本" value={`${operations.length}`} detail={`P95 ${formatMs(summary.p95)} / 平均 ${formatMs(summary.avg)}`} icon={<Activity size={15} />} tone={summary.slowCount > 0 ? 'warning' : 'ready'} />
          <PerformanceStat title="发送耗时" value={formatMs(summary.sendP95)} detail={`发送样本 ${summary.sendCount} 次`} icon={<Route size={15} />} tone={summary.sendP95 > 1_000 ? 'warning' : 'ready'} />
          <PerformanceStat title="确认耗时" value={formatMs(summary.approvalP95)} detail={`确认样本 ${summary.approvalCount} 次`} icon={<ListTree size={15} />} tone={summary.approvalP95 > 600 ? 'warning' : 'ready'} />
          <PerformanceStat title="本地状态体积" value={formatBytes(latestStorage?.totalBytes ?? 0)} detail={latestStorage ? storageDetail(latestStorage.keys) : '尚无快照'} icon={<Database size={15} />} tone={(latestStorage?.totalBytes ?? 0) > 2 * 1024 * 1024 ? 'warning' : 'ready'} />
          <PerformanceStat title="主线程阻塞" value={formatMs(maxLongTask)} detail={`${longTasks.length} 条 Long Task`} icon={<AlertTriangle size={15} />} tone={maxLongTask > 500 ? 'warning' : 'ready'} />
          <PerformanceStat title="Runtime 指标" value={`${runtimeSummary?.operationCount ?? 0}`} detail={`${runtimeSummary?.spanCount ?? 0} spans / ${runtimeService?.storage ?? 'memory'} window`} icon={<Gauge size={15} />} tone={(runtimeSummary?.slowOperationCount ?? 0) + (runtimeSummary?.slowSpanCount ?? 0) > 0 ? 'warning' : 'ready'} />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px_360px]">
          <PerformancePanel title="延迟趋势" icon={<Activity size={14} />}>
            <LatencyTrendChart points={latencySeries} />
          </PerformancePanel>
          <PerformancePanel title="Span 分布" icon={<Gauge size={14} />}>
            <SpanKindBars rows={spanKindRows} />
          </PerformancePanel>
          <PerformancePanel title="慢点排行" icon={<AlertTriangle size={14} />}>
            <SlowDiagnosticList rows={slowRows} />
          </PerformancePanel>
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)]">
          <PerformancePanel title="Run Timeline" icon={<Route size={14} />}>
            <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="min-h-[360px] space-y-2 overflow-y-auto pr-1">
                {operations.length === 0 ? (
                  <AppTextEmptyState>发送、确认或回答一次 Agent 交互后，这里会出现链路时间线。</AppTextEmptyState>
                ) : operations.map((operation) => (
                  <button
                    key={operation.id}
                    type="button"
                    onClick={() => setSelectedOperationId(operation.id)}
                    className={cn(
                      'block w-full rounded-md border px-3 py-2 text-left transition-colors',
                      selectedOperation?.id === operation.id ? 'border-primary/50 bg-primary/5' : 'border-border bg-background hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="type-label font-medium text-foreground">{operationKindLabel(operation.kind)}</span>
                      <Badge variant={operation.status === 'error' ? 'destructive' : operation.status === 'running' ? 'secondary' : slowOperation(operation) ? 'warning' : 'outline'}>
                        {operation.status === 'running' ? '运行中' : formatMs(operation.durationMs ?? 0)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate type-tiny text-muted-foreground">
                      {new Date(operation.startedAt).toLocaleTimeString()} · {slowestPhase(operation)?.label ?? '等待阶段数据'}
                    </p>
                  </button>
                ))}
              </div>
              <OperationTimeline operation={selectedOperation} />
            </div>
          </PerformancePanel>

          <PerformancePanel title="三层指标" icon={<Gauge size={14} />}>
            <div className="space-y-4">
              <div>
                <p className="type-label font-medium text-foreground">Metrics 趋势样本</p>
                <div className="mt-2 overflow-hidden rounded-md border border-border">
                  <table className="w-full text-left">
                    <thead className="bg-muted/40 type-tiny uppercase text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">指标</th>
                        <th className="px-2 py-1.5 font-medium">P95</th>
                        <th className="px-2 py-1.5 font-medium">Max</th>
                        <th className="px-2 py-1.5 font-medium">N</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border type-tiny">
                      {metricSummary.length === 0 ? (
                        <tr><td colSpan={4} className="px-2 py-3 text-muted-foreground">暂无指标样本。</td></tr>
                      ) : metricSummary.map((metric) => (
                        <tr key={metric.name}>
                          <td className="max-w-[220px] truncate px-2 py-1.5 font-mono text-foreground">{metric.name}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{formatMetricValue(metric.p95, metric.unit)}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{formatMetricValue(metric.max, metric.unit)}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{metric.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="type-label font-medium text-foreground">Logs 诊断摘要</p>
                <div className="mt-2 space-y-2">
                  {combinedLogs.length === 0 ? (
                    <AppTextEmptyState>慢操作、错误和本地状态写入风险会自动沉淀为诊断日志。</AppTextEmptyState>
                  ) : combinedLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="rounded-md border border-border bg-background px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={log.level === 'error' ? 'destructive' : log.level === 'warning' ? 'warning' : 'outline'}>{log.level}</Badge>
                        <span className="type-tiny text-muted-foreground">{new Date(log.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="mt-1 type-caption leading-5 text-foreground">{log.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PerformancePanel>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-2">
          <PerformancePanel title="Runtime Operations" icon={<Route size={14} />}>
            <RuntimeOperationList operations={runtimeOperations} loading={runtimeTelemetryQuery.isLoading} />
          </PerformancePanel>

          <PerformancePanel title="Runtime Trace Spans" icon={<Activity size={14} />}>
            <RuntimeSpanList spans={runtimeSpans} loading={runtimeTelemetryQuery.isLoading} />
          </PerformancePanel>

          <PerformancePanel title="LocalStorage 状态体积" icon={<Database size={14} />}>
            {latestStorage ? (
              <div className="space-y-2">
                {latestStorage.keys.map((item) => (
                  <StorageBar key={item.key} label={item.key} bytes={item.bytes} totalBytes={Math.max(latestStorage.totalBytes, 1)} />
                ))}
              </div>
            ) : <AppTextEmptyState>点击刷新快照后展示 Agent 本地状态体积。</AppTextEmptyState>}
          </PerformancePanel>

          <PerformancePanel title="Long Task" icon={<AlertTriangle size={14} />}>
            {longTasks.length === 0 ? (
              <AppTextEmptyState>浏览器支持 Long Task API 时，超过 50ms 的主线程阻塞会出现在这里。</AppTextEmptyState>
            ) : (
              <div className="space-y-2">
                {longTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                    <span className="type-caption text-foreground">{new Date(task.startedAt).toLocaleTimeString()}</span>
                    <span className={cn('type-label font-medium', task.durationMs > 500 ? semanticToneClass('warning', 'icon') : 'text-muted-foreground')}>
                      {formatMs(task.durationMs)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PerformancePanel>
        </section>
      </main>
    </div>
  )
}

function RuntimeSpanList({ spans, loading }: { spans: AgentRuntimeTelemetrySpan[]; loading: boolean }) {
  if (loading && spans.length === 0) return <AppTextEmptyState>正在读取 runtime telemetry。</AppTextEmptyState>
  if (spans.length === 0) return <AppTextEmptyState>模型、工具、审批等后端 trace 会作为 spans 出现在这里。</AppTextEmptyState>
  return (
    <div className="space-y-2">
      {spans.slice(0, 10).map((span) => (
        <div key={span.id} className="rounded-md border border-border bg-background px-3 py-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate type-caption font-medium text-foreground">{span.name}</p>
              <p className="mt-0.5 truncate font-mono type-tiny text-muted-foreground">
                {span.kind}{span.toolName ? ` / ${span.toolName}` : ''} · {span.runId}
              </p>
            </div>
            <Badge variant={span.status === 'failed' ? 'destructive' : span.status === 'blocked' ? 'warning' : 'outline'}>
              {typeof span.durationMs === 'number' ? formatMs(span.durationMs) : span.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

function RuntimeOperationList({ operations, loading }: { operations: AgentRuntimeTelemetryOperation[]; loading: boolean }) {
  if (loading && operations.length === 0) return <AppTextEmptyState>正在读取 runtime operations。</AppTextEmptyState>
  if (operations.length === 0) return <AppTextEmptyState>后端 HTTP、run 创建、stream、审批等操作会出现在这里。</AppTextEmptyState>
  return (
    <div className="space-y-2">
      {operations.slice(0, 10).map((operation) => {
        const slowest = slowestRuntimePhase(operation)
        return (
          <div key={operation.id} className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate type-caption font-medium text-foreground">
                  {operation.method ? `${operation.method} ` : ''}{operation.requestPath ?? operation.kind}
                </p>
                <p className="mt-0.5 truncate font-mono type-tiny text-muted-foreground">
                  {operation.kind}{operation.runId ? ` · ${operation.runId}` : ''}{slowest ? ` · slowest ${slowest.label}` : ''}
                </p>
              </div>
              <Badge variant={operation.status === 'error' ? 'destructive' : operation.status === 'running' ? 'secondary' : isSlowRuntimeOperation(operation) ? 'warning' : 'outline'}>
                {operation.status === 'running' ? 'running' : formatMs(operation.durationMs ?? 0)}
              </Badge>
            </div>
            {operation.phases.length > 1 ? (
              <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-1">
                {operation.phases.slice(-4).map((phase) => (
                  <div key={`${operation.id}:${phase.name}:${phase.offsetMs}`} className="rounded bg-muted/30 px-2 py-1">
                    <p className="truncate type-tiny text-muted-foreground">{phase.label}</p>
                    <p className="font-mono type-tiny text-foreground">+{formatMs(phase.offsetMs)}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function LatencyTrendChart({ points }: { points: LatencyPoint[] }) {
  if (points.length === 0) return <AppTextEmptyState>还没有可绘制的延迟样本。</AppTextEmptyState>
  const max = Math.max(...points.map((point) => point.value), 1)
  const path = sparklinePath(points.map((point) => point.value), 320, 92)
  return (
    <div className="space-y-3">
      <div className="h-[116px] rounded-md border border-border bg-background px-3 py-2">
        <svg viewBox="0 0 320 92" className="h-full w-full" role="img" aria-label="Agent latency trend">
          <line x1="0" y1="91" x2="320" y2="91" className="stroke-border" strokeWidth="1" />
          <path d={path} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => {
            const x = points.length === 1 ? 320 : (index / (points.length - 1)) * 320
            const y = 88 - (point.value / max) * 82
            return <circle key={`${point.label}-${index}`} cx={x} cy={y} r="2.5" className={cn('fill-current', point.tone === 'warning' ? semanticToneClass('warning', 'icon') : 'text-primary')} />
          })}
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {points.slice(-3).map((point, index) => (
          <div key={`${point.label}-${index}`} className="min-w-0 rounded-md bg-muted/30 px-2 py-1.5">
            <p className="truncate type-tiny text-muted-foreground">{point.label}</p>
            <p className={cn('type-label font-medium', point.tone === 'warning' ? semanticToneClass('warning', 'icon') : 'text-foreground')}>{formatMs(point.value)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpanKindBars({ rows }: { rows: SpanKindRow[] }) {
  if (rows.length === 0) return <AppTextEmptyState>后端 trace spans 到达后，这里会展示模型、工具、审批等类型占比。</AppTextEmptyState>
  const max = Math.max(...rows.map((row) => row.count), 1)
  return (
    <div className="space-y-2">
      {rows.slice(0, 7).map((row) => (
        <div key={row.kind}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate type-caption font-medium text-foreground">{row.kind}</span>
            <span className="type-tiny text-muted-foreground">{row.count} · P95 {formatMs(row.p95)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full', row.failed > 0 ? 'bg-destructive' : row.slow > 0 ? `${semanticToneClass('warning', 'icon')} bg-current` : 'bg-primary')} style={{ width: `${Math.max(4, Math.round((row.count / max) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function SlowDiagnosticList({ rows }: { rows: SlowDiagnosticRow[] }) {
  if (rows.length === 0) return <AppTextEmptyState>目前没有慢操作、慢 span 或长任务。</AppTextEmptyState>
  return (
    <div className="space-y-2">
      {rows.slice(0, 7).map((row) => (
        <div key={row.id} className="rounded-md border border-border bg-background px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Badge variant={row.tone === 'error' ? 'destructive' : 'warning'}>{row.kind}</Badge>
            <span className="font-mono type-tiny text-muted-foreground">{formatMs(row.durationMs)}</span>
          </div>
          <p className="mt-1 truncate type-caption font-medium text-foreground">{row.title}</p>
          <p className="mt-0.5 truncate type-tiny text-muted-foreground">{row.subtitle}</p>
        </div>
      ))}
    </div>
  )
}

function OperationTimeline({ operation }: { operation: AgentPerformanceOperation | null }) {
  if (!operation) return <AppTextEmptyState>暂无可展示的操作。</AppTextEmptyState>
  const slowest = slowestPhase(operation)
  return (
    <div className="min-h-[360px] rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <p className="type-label font-semibold text-foreground">{operationKindLabel(operation.kind)}</p>
          <p className="mt-0.5 type-tiny text-muted-foreground">{operation.id}</p>
        </div>
        <Badge variant={operation.status === 'error' ? 'destructive' : operation.status === 'running' ? 'secondary' : slowOperation(operation) ? 'warning' : 'success'}>
          {operation.status === 'running' ? '运行中' : formatMs(operation.durationMs ?? 0)}
        </Badge>
      </div>
      <div className="mt-3 space-y-2">
        {operation.phases.map((phase) => (
          <div key={phase.id} className={cn(
            'grid grid-cols-[86px_1fr_72px] items-start gap-3 rounded-md px-2 py-1.5',
            slowest?.id === phase.id ? semanticToneClass('warning', 'surface') : 'bg-muted/20',
          )}>
            <span className="font-mono type-tiny text-muted-foreground">+{formatMs(phase.offsetMs)}</span>
            <div className="min-w-0">
              <p className="truncate type-caption font-medium text-foreground">{phase.label}</p>
              {phase.details ? <p className="mt-0.5 truncate type-tiny text-muted-foreground">{formatDetails(phase.details)}</p> : null}
            </div>
            <span className="text-right font-mono type-tiny text-muted-foreground">{formatMs(phase.durationFromPreviousMs)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PerformanceStat({ title, value, detail, icon, tone }: {
  title: string
  value: string
  detail: string
  icon: React.ReactNode
  tone: 'ready' | 'warning'
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="type-tiny font-medium uppercase">{title}</span>
        <span className={cn('flex size-7 items-center justify-center rounded-md', tone === 'warning' ? cn(semanticToneClass('warning', 'surface'), semanticToneClass('warning', 'icon')) : cn(semanticToneClass('success', 'surface'), semanticToneClass('success', 'icon')))}>
          {icon}
        </span>
      </div>
      <p className="mt-2 type-title-sm font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate type-tiny text-muted-foreground">{detail}</p>
    </div>
  )
}

function PerformancePanel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="type-label font-semibold text-foreground">{title}</h2>
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

function StorageBar({ label, bytes, totalBytes }: { label: string; bytes: number; totalBytes: number }) {
  const pct = Math.max(2, Math.min(100, Math.round((bytes / totalBytes) * 100)))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="type-caption font-medium text-foreground">{label}</span>
        <span className="type-tiny text-muted-foreground">{formatBytes(bytes)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function summarizeOperations(operations: AgentPerformanceOperation[]) {
  const durations = operations.map((operation) => operation.durationMs ?? 0).filter((value) => value > 0).sort((a, b) => a - b)
  const sendDurations = durationsForKinds(operations, ['send'])
  const approvalDurations = durationsForKinds(operations, ['approval', 'rejection', 'input_answer'])
  return {
    avg: average(durations),
    p95: percentile(durations, 0.95),
    slowCount: operations.filter(slowOperation).length,
    sendCount: sendDurations.length,
    sendP95: percentile(sendDurations, 0.95),
    approvalCount: approvalDurations.length,
    approvalP95: percentile(approvalDurations, 0.95),
  }
}

function durationsForKinds(operations: AgentPerformanceOperation[], kinds: AgentPerformanceOperation['kind'][]): number[] {
  const set = new Set(kinds)
  return operations
    .filter((operation) => set.has(operation.kind) && typeof operation.durationMs === 'number')
    .map((operation) => operation.durationMs ?? 0)
    .sort((a, b) => a - b)
}

function slowOperation(operation: AgentPerformanceOperation): boolean {
  const duration = operation.durationMs ?? 0
  if (operation.kind === 'send') return duration > 1_000
  return duration > 600
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))
  return values[index] ?? 0
}

function formatMetricValue(value: number, unit: 'ms' | 'bytes' | 'count'): string {
  if (unit === 'ms') return formatMs(value)
  if (unit === 'bytes') return formatBytes(value)
  return String(Math.round(value))
}

function storageDetail(keys: Array<{ key: string; bytes: number }>): string {
  return keys.map((item) => `${item.key}: ${formatBytes(item.bytes)}`).join(' / ')
}

interface LatencyPoint {
  label: string
  value: number
  tone: 'ready' | 'warning'
}

interface SpanKindRow {
  kind: string
  count: number
  slow: number
  failed: number
  p95: number
}

interface SlowDiagnosticRow {
  id: string
  kind: string
  title: string
  subtitle: string
  durationMs: number
  tone: 'warning' | 'error'
}

function latencyTrendSeries(metrics: AgentPerformanceMetricSample[], operations: AgentPerformanceOperation[], spans: AgentRuntimeTelemetrySpan[]): LatencyPoint[] {
  const metricPoints = metrics
    .filter((sample) => sample.unit === 'ms' && (sample.name.endsWith('operation_duration_ms') || sample.name.endsWith('trace_span_duration_ms')))
    .slice(0, 24)
    .reverse()
    .map((sample) => ({
      label: compactMetricLabel(sample.name, sample.labels),
      value: sample.value,
      tone: sample.value > (sample.name.includes('trace_span') ? 3_000 : 1_000) ? 'warning' as const : 'ready' as const,
    }))
  if (metricPoints.length > 0) return metricPoints

  return [
    ...operations.filter((operation) => typeof operation.durationMs === 'number').map((operation) => ({
      label: operationKindLabel(operation.kind),
      value: operation.durationMs ?? 0,
      tone: slowOperation(operation) ? 'warning' as const : 'ready' as const,
    })),
    ...spans.filter((span) => typeof span.durationMs === 'number').map((span) => ({
      label: span.kind,
      value: span.durationMs ?? 0,
      tone: (span.durationMs ?? 0) > 3_000 ? 'warning' as const : 'ready' as const,
    })),
  ].slice(0, 24)
}

function spanKindDistribution(spans: AgentRuntimeTelemetrySpan[]): SpanKindRow[] {
  const rows = new Map<string, { durations: number[]; count: number; slow: number; failed: number }>()
  for (const span of spans) {
    const row = rows.get(span.kind) ?? { durations: [], count: 0, slow: 0, failed: 0 }
    row.count += 1
    if (typeof span.durationMs === 'number') row.durations.push(span.durationMs)
    if ((span.durationMs ?? 0) > 3_000) row.slow += 1
    if (span.status === 'failed') row.failed += 1
    rows.set(span.kind, row)
  }
  return Array.from(rows.entries())
    .map(([kind, row]) => ({
      kind,
      count: row.count,
      slow: row.slow,
      failed: row.failed,
      p95: percentile(row.durations.sort((a, b) => a - b), 0.95),
    }))
    .sort((a, b) => b.count - a.count || b.p95 - a.p95)
}

function slowDiagnosticRows(operations: AgentPerformanceOperation[], spans: AgentRuntimeTelemetrySpan[], longTasks: Array<{ id: string; startedAt: string; durationMs: number }>): SlowDiagnosticRow[] {
  return [
    ...operations.filter(slowOperation).map((operation) => ({
      id: `operation:${operation.id}`,
      kind: 'operation',
      title: operationKindLabel(operation.kind),
      subtitle: slowestPhase(operation)?.label ?? operation.status,
      durationMs: operation.durationMs ?? 0,
      tone: operation.status === 'error' ? 'error' as const : 'warning' as const,
    })),
    ...spans.filter((span) => span.status === 'failed' || (span.durationMs ?? 0) > 3_000).map((span) => ({
      id: `span:${span.id}`,
      kind: span.kind,
      title: span.name,
      subtitle: span.toolName ?? span.runId,
      durationMs: span.durationMs ?? 0,
      tone: span.status === 'failed' ? 'error' as const : 'warning' as const,
    })),
    ...longTasks.filter((task) => task.durationMs > 200).map((task) => ({
      id: `longtask:${task.id}`,
      kind: 'longtask',
      title: 'Main thread blocked',
      subtitle: new Date(task.startedAt).toLocaleTimeString(),
      durationMs: task.durationMs,
      tone: 'warning' as const,
    })),
  ].sort((a, b) => b.durationMs - a.durationMs)
}

function slowestRuntimePhase(operation: AgentRuntimeTelemetryOperation): AgentRuntimeTelemetryOperation['phases'][number] | undefined {
  return operation.phases
    .filter((phase) => phase.name !== 'operation_start')
    .sort((a, b) => b.deltaMs - a.deltaMs)[0]
}

function isSlowRuntimeOperation(operation: AgentRuntimeTelemetryOperation): boolean {
  const duration = operation.durationMs ?? 0
  if (operation.kind === 'http_request' || operation.kind === 'run_stream') return duration > 1_000
  return duration > 600
}

function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1)
  return values.map((value, index) => {
    const x = values.length === 1 ? width : (index / (values.length - 1)) * width
    const y = height - 4 - (value / max) * (height - 10)
    return `${index === 0 ? 'M' : 'L'}${roundSvg(x)} ${roundSvg(y)}`
  }).join(' ')
}

function roundSvg(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function compactMetricLabel(name: string, labels?: Record<string, string | number | boolean>): string {
  const kind = labels?.kind ? String(labels.kind) : undefined
  const status = labels?.status ? String(labels.status) : undefined
  if (kind && status) return `${kind}/${status}`
  if (kind) return kind
  return name.replace(/^movscript_agent_/, '').replace(/^agent_/, '')
}

function formatDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ')
}
