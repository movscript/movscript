import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Database, Gauge, ListTree, RefreshCw, Route, Trash2 } from 'lucide-react'
import { Badge, Button, AppTextEmptyState, semanticToneClass } from '@movscript/ui'
import { AgentConsoleNav } from '@/pages/agent/AgentConsoleNav'
import { localAgentClient } from '@/lib/localAgentClient'
import {
  captureAgentStorageSnapshot,
  formatBytes,
  formatMs,
  operationKindLabel,
  slowestPhase,
  summarizeAgentPerformanceMetrics,
  useAgentPerformanceStore,
  type AgentPerformanceOperation,
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
          <PerformanceStat title="Runtime 指标" value={`${runtimeSummary?.operationCount ?? 0}`} detail={`${runtimeSummary?.runningOperationCount ?? 0} 运行中 / ${runtimeSummary?.slowOperationCount ?? 0} 慢操作`} icon={<Gauge size={15} />} tone={(runtimeSummary?.slowOperationCount ?? 0) > 0 ? 'warning' : 'ready'} />
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)]">
          <PerformancePanel title="Run Timeline" icon={<Route size={14} />}>
            <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="min-h-[360px] space-y-2 overflow-y-auto pr-1">
                {operations.length === 0 ? (
                  <EmptyState>发送、确认或回答一次 Agent 交互后，这里会出现链路时间线。</EmptyState>
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
                  {logs.length === 0 ? (
                    <EmptyState>慢操作、错误和本地状态写入风险会自动沉淀为诊断日志。</EmptyState>
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
          <PerformancePanel title="LocalStorage 状态体积" icon={<Database size={14} />}>
            {latestStorage ? (
              <div className="space-y-2">
                {latestStorage.keys.map((item) => (
                  <StorageBar key={item.key} label={item.key} bytes={item.bytes} totalBytes={Math.max(latestStorage.totalBytes, 1)} />
                ))}
              </div>
            ) : <EmptyState>点击刷新快照后展示 Agent 本地状态体积。</EmptyState>}
          </PerformancePanel>

          <PerformancePanel title="Long Task" icon={<AlertTriangle size={14} />}>
            {longTasks.length === 0 ? (
              <EmptyState>浏览器支持 Long Task API 时，超过 50ms 的主线程阻塞会出现在这里。</EmptyState>
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

function OperationTimeline({ operation }: { operation: AgentPerformanceOperation | null }) {
  if (!operation) return <EmptyState>暂无可展示的操作。</EmptyState>
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

function EmptyState({ children }: { children: React.ReactNode }) {
  return <AppTextEmptyState>{children}</AppTextEmptyState>
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

function formatDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ')
}
