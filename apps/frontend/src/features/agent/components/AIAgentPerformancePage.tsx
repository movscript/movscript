import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Database, Gauge, ListTree, RefreshCw, Route, Trash2 } from 'lucide-react'
import {
  AgentPerformanceActionButton,
  AgentPerformanceBarList,
  AgentPerformanceBarRow,
  AgentPerformanceDurationText,
  AgentPerformanceEmptyState,
  AgentPerformanceHeader,
  AgentPerformanceHeaderActions,
  AgentPerformanceHeaderCopy,
  AgentPerformanceHeaderDescription,
  AgentPerformanceHeaderTitle,
  AgentPerformanceHeaderTitleRow,
  AgentPerformanceIcon,
  AgentPerformanceListItem,
  AgentPerformanceLogItem,
  AgentPerformanceMainGrid,
  AgentPerformanceMetricTable,
  AgentPerformanceOperationButton,
  AgentPerformanceOperationButtonContent,
  AgentPerformancePanel,
  AgentPerformancePhaseGrid,
  AgentPerformancePhaseRow,
  AgentPerformancePhaseStat,
  AgentPerformanceProgressBar,
  AgentPerformanceScrollList,
  AgentPerformanceSection,
  AgentPerformanceSectionTitle,
  AgentPerformanceSlowItem,
  AgentPerformanceStack,
  AgentPerformanceStatCard,
  AgentPerformanceStatGrid,
  AgentPerformanceStorageBar,
  AgentPerformanceStatusBadge,
  AgentPerformanceThreeColumnGrid,
  AgentPerformanceTimelineBody,
  AgentPerformanceTimelineDetail,
  AgentPerformanceTimelineGrid,
  AgentPerformanceTimelineHeader,
  AgentPerformanceTrendBaseline,
  AgentPerformanceTrendFrame,
  AgentPerformanceTrendPath,
  AgentPerformanceTrendPoint,
  AgentPerformanceTrendSample,
  AgentPerformanceTrendSampleGrid,
  AgentPerformanceTrendSvg,
  AgentPerformanceTrendValue,
  AgentPerformanceTwoColumnGrid,
  AgentPageShell,
  AgentPageShellBody,
  AgentPageShellHeader,
} from '@movscript/ui'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { localAgentClient, type AgentRuntimeTelemetryOperation, type AgentRuntimeTelemetrySpan } from '@/shared/infrastructure/localAgentClient'
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
} from '@/features/agent/state/agentPerformanceStore'
import {
  agentPerformanceHealthRecipe,
  agentPerformanceLogRecipe,
  agentPerformanceOperationRecipe,
  agentSlowDiagnosticRecipe,
} from '@/features/agent/presentation/agentSemanticUi'

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
    <AgentPageShell data-testid="agent-performance-page">
      <AgentPageShellHeader>
        <AgentPerformanceHeader>
          <AgentPerformanceHeaderCopy>
            <AgentPerformanceHeaderTitleRow>
              <Gauge size={18} />
              <AgentPerformanceHeaderTitle>Agent 性能监控</AgentPerformanceHeaderTitle>
              <AgentPerformanceStatusBadge {...agentPerformanceHealthRecipe(summary.slowCount > 0)}>
                {summary.slowCount > 0 ? `${summary.slowCount} 次慢操作` : '交互正常'}
              </AgentPerformanceStatusBadge>
            </AgentPerformanceHeaderTitleRow>
            <AgentPerformanceHeaderDescription>
              以三层数据排查 Agent：指标看趋势，Timeline 看单次链路，诊断日志指出慢阶段和本地状态风险。
            </AgentPerformanceHeaderDescription>
          </AgentPerformanceHeaderCopy>
          <AgentPerformanceHeaderActions>
            <AgentPerformanceActionButton type="button" size="sm" variant="outline" onClick={() => { captureAgentStorageSnapshot(); void runtimeTelemetryQuery.refetch() }}>
              <AgentPerformanceIcon icon={RefreshCw} size={14} />
              刷新快照
            </AgentPerformanceActionButton>
            <AgentPerformanceActionButton type="button" size="sm" variant="outline" onClick={clear}>
              <Trash2 size={14} />
              清空本页样本
            </AgentPerformanceActionButton>
          </AgentPerformanceHeaderActions>
        </AgentPerformanceHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentPageShellBody>
        <AgentPerformanceStatGrid>
          <PerformanceStat title="操作样本" value={`${operations.length}`} detail={`P95 ${formatMs(summary.p95)} / 平均 ${formatMs(summary.avg)}`} icon={<Activity size={15} />} tone={summary.slowCount > 0 ? 'warning' : 'ready'} />
          <PerformanceStat title="发送耗时" value={formatMs(summary.sendP95)} detail={`发送样本 ${summary.sendCount} 次`} icon={<Route size={15} />} tone={summary.sendP95 > 1_000 ? 'warning' : 'ready'} />
          <PerformanceStat title="确认耗时" value={formatMs(summary.approvalP95)} detail={`确认样本 ${summary.approvalCount} 次`} icon={<ListTree size={15} />} tone={summary.approvalP95 > 600 ? 'warning' : 'ready'} />
          <PerformanceStat title="本地状态体积" value={formatBytes(latestStorage?.totalBytes ?? 0)} detail={latestStorage ? storageDetail(latestStorage.keys) : '尚无快照'} icon={<Database size={15} />} tone={(latestStorage?.totalBytes ?? 0) > 2 * 1024 * 1024 ? 'warning' : 'ready'} />
          <PerformanceStat title="主线程阻塞" value={formatMs(maxLongTask)} detail={`${longTasks.length} 条 Long Task`} icon={<AlertTriangle size={15} />} tone={maxLongTask > 500 ? 'warning' : 'ready'} />
          <PerformanceStat title="Runtime 指标" value={`${runtimeSummary?.operationCount ?? 0}`} detail={`${runtimeSummary?.spanCount ?? 0} spans / ${runtimeService?.storage ?? 'memory'} window`} icon={<Gauge size={15} />} tone={(runtimeSummary?.slowOperationCount ?? 0) + (runtimeSummary?.slowSpanCount ?? 0) > 0 ? 'warning' : 'ready'} />
        </AgentPerformanceStatGrid>

        <AgentPerformanceThreeColumnGrid>
          <PerformancePanel title="延迟趋势" icon={<Activity size={14} />}>
            <LatencyTrendChart points={latencySeries} />
          </PerformancePanel>
          <PerformancePanel title="Span 分布" icon={<Gauge size={14} />}>
            <SpanKindBars rows={spanKindRows} />
          </PerformancePanel>
          <PerformancePanel title="慢点排行" icon={<AlertTriangle size={14} />}>
            <SlowDiagnosticList rows={slowRows} />
          </PerformancePanel>
        </AgentPerformanceThreeColumnGrid>

        <AgentPerformanceMainGrid>
          <PerformancePanel title="Run Timeline" icon={<Route size={14} />}>
            <AgentPerformanceTimelineGrid>
              <AgentPerformanceScrollList>
                {operations.length === 0 ? (
                  <AgentPerformanceEmptyState>发送、确认或回答一次 Agent 交互后，这里会出现链路时间线。</AgentPerformanceEmptyState>
                ) : operations.map((operation) => (
                  <AgentPerformanceOperationButton
                    key={operation.id}
                    active={selectedOperation?.id === operation.id}
                    onClick={() => setSelectedOperationId(operation.id)}
                  >
                      <AgentPerformanceOperationButtonContent
                        title={operationKindLabel(operation.kind)}
                        meta={`${new Date(operation.startedAt).toLocaleTimeString()} · ${slowestPhase(operation)?.label ?? '等待阶段数据'}`}
                        badge={(
                          <AgentPerformanceStatusBadge {...agentPerformanceOperationRecipe(operation.status, slowOperation(operation))}>
                          {operation.status === 'running' ? '运行中' : formatMs(operation.durationMs ?? 0)}
                          </AgentPerformanceStatusBadge>
                        )}
                      />
                  </AgentPerformanceOperationButton>
                ))}
              </AgentPerformanceScrollList>
              <OperationTimeline operation={selectedOperation} />
            </AgentPerformanceTimelineGrid>
          </PerformancePanel>

          <PerformancePanel title="三层指标" icon={<Gauge size={14} />}>
            <AgentPerformanceStack>
              <AgentPerformanceSection>
                <AgentPerformanceSectionTitle>Metrics 趋势样本</AgentPerformanceSectionTitle>
                <AgentPerformanceMetricTable
                  headers={['指标', 'P95', 'Max', 'N']}
                  empty="暂无指标样本。"
                  rows={metricSummary.map((metric) => ({
                    id: metric.name,
                    cells: [
                      metric.name,
                      formatMetricValue(metric.p95, metric.unit),
                      formatMetricValue(metric.max, metric.unit),
                      metric.count,
                    ],
                  }))}
                />
              </AgentPerformanceSection>

              <AgentPerformanceSection>
                <AgentPerformanceSectionTitle>Logs 诊断摘要</AgentPerformanceSectionTitle>
                <AgentPerformanceStack density="compact">
                  {combinedLogs.length === 0 ? (
                    <AgentPerformanceEmptyState>慢操作、错误和本地状态写入风险会自动沉淀为诊断日志。</AgentPerformanceEmptyState>
                  ) : combinedLogs.slice(0, 8).map((log) => (
                    <AgentPerformanceLogItem
                      key={log.id}
                      badge={<AgentPerformanceStatusBadge {...agentPerformanceLogRecipe(log.level)}>{log.level}</AgentPerformanceStatusBadge>}
                      time={new Date(log.createdAt).toLocaleTimeString()}
                      message={log.message}
                    />
                  ))}
                </AgentPerformanceStack>
              </AgentPerformanceSection>
            </AgentPerformanceStack>
          </PerformancePanel>
        </AgentPerformanceMainGrid>

        <AgentPerformanceTwoColumnGrid>
          <PerformancePanel title="Runtime Operations" icon={<Route size={14} />}>
            <RuntimeOperationList operations={runtimeOperations} loading={runtimeTelemetryQuery.isLoading} />
          </PerformancePanel>

          <PerformancePanel title="Runtime Trace Spans" icon={<Activity size={14} />}>
            <RuntimeSpanList spans={runtimeSpans} loading={runtimeTelemetryQuery.isLoading} />
          </PerformancePanel>

          <PerformancePanel title="LocalStorage 状态体积" icon={<Database size={14} />}>
            {latestStorage ? (
              <AgentPerformanceStack density="compact">
                {latestStorage.keys.map((item) => (
                  <StorageBar key={item.key} label={item.key} bytes={item.bytes} totalBytes={Math.max(latestStorage.totalBytes, 1)} />
                ))}
              </AgentPerformanceStack>
            ) : <AgentPerformanceEmptyState>点击刷新快照后展示 Agent 本地状态体积。</AgentPerformanceEmptyState>}
          </PerformancePanel>

          <PerformancePanel title="Long Task" icon={<AlertTriangle size={14} />}>
            {longTasks.length === 0 ? (
              <AgentPerformanceEmptyState>浏览器支持 Long Task API 时，超过 50ms 的主线程阻塞会出现在这里。</AgentPerformanceEmptyState>
            ) : (
              <AgentPerformanceStack density="compact">
                {longTasks.slice(0, 8).map((task) => (
                  <AgentPerformanceListItem
                    key={task.id}
                    title={new Date(task.startedAt).toLocaleTimeString()}
                    badge={(
                      <AgentPerformanceDurationText tone={task.durationMs > 500 ? 'warning' : 'neutral'}>
                        {formatMs(task.durationMs)}
                      </AgentPerformanceDurationText>
                    )}
                  />
                ))}
              </AgentPerformanceStack>
            )}
          </PerformancePanel>
        </AgentPerformanceTwoColumnGrid>
      </AgentPageShellBody>
    </AgentPageShell>
  )
}

function RuntimeSpanList({ spans, loading }: { spans: AgentRuntimeTelemetrySpan[]; loading: boolean }) {
  if (loading && spans.length === 0) return <AgentPerformanceEmptyState>正在读取 runtime telemetry。</AgentPerformanceEmptyState>
  if (spans.length === 0) return <AgentPerformanceEmptyState>模型、工具、审批等后端 trace 会作为 spans 出现在这里。</AgentPerformanceEmptyState>
  return (
    <AgentPerformanceStack density="compact">
      {spans.slice(0, 10).map((span) => (
        <AgentPerformanceListItem
          key={span.id}
          title={span.name}
          meta={`${span.kind}${span.toolName ? ` / ${span.toolName}` : ''} · ${span.runId}`}
          badge={(
            <AgentPerformanceStatusBadge {...agentPerformanceOperationRecipe(span.status)}>
              {typeof span.durationMs === 'number' ? formatMs(span.durationMs) : span.status}
            </AgentPerformanceStatusBadge>
          )}
        />
      ))}
    </AgentPerformanceStack>
  )
}

function RuntimeOperationList({ operations, loading }: { operations: AgentRuntimeTelemetryOperation[]; loading: boolean }) {
  if (loading && operations.length === 0) return <AgentPerformanceEmptyState>正在读取 runtime operations。</AgentPerformanceEmptyState>
  if (operations.length === 0) return <AgentPerformanceEmptyState>后端 HTTP、run 创建、stream、审批等操作会出现在这里。</AgentPerformanceEmptyState>
  return (
    <AgentPerformanceStack density="compact">
      {operations.slice(0, 10).map((operation) => {
        const slowest = slowestRuntimePhase(operation)
        return (
          <AgentPerformanceListItem
            key={operation.id}
            title={`${operation.method ? `${operation.method} ` : ''}${operation.requestPath ?? operation.kind}`}
            meta={`${operation.kind}${operation.runId ? ` · ${operation.runId}` : ''}${slowest ? ` · slowest ${slowest.label}` : ''}`}
            badge={(
              <AgentPerformanceStatusBadge {...agentPerformanceOperationRecipe(operation.status, isSlowRuntimeOperation(operation))}>
                {operation.status === 'running' ? 'running' : formatMs(operation.durationMs ?? 0)}
              </AgentPerformanceStatusBadge>
            )}
          >
            {operation.phases.length > 1 ? (
              <AgentPerformancePhaseGrid>
                {operation.phases.slice(-4).map((phase) => (
                  <AgentPerformancePhaseStat key={`${operation.id}:${phase.name}:${phase.offsetMs}`} label={phase.label} value={`+${formatMs(phase.offsetMs)}`} />
                ))}
              </AgentPerformancePhaseGrid>
            ) : null}
          </AgentPerformanceListItem>
        )
      })}
    </AgentPerformanceStack>
  )
}

function LatencyTrendChart({ points }: { points: LatencyPoint[] }) {
  if (points.length === 0) return <AgentPerformanceEmptyState>还没有可绘制的延迟样本。</AgentPerformanceEmptyState>
  const max = Math.max(...points.map((point) => point.value), 1)
  const path = sparklinePath(points.map((point) => point.value), 320, 92)
  return (
    <AgentPerformanceStack>
      <AgentPerformanceTrendFrame>
        <AgentPerformanceTrendSvg viewBox="0 0 320 92" role="img" aria-label="Agent latency trend">
          <AgentPerformanceTrendBaseline x1="0" y1="91" x2="320" y2="91" strokeWidth="1" />
          <AgentPerformanceTrendPath d={path} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => {
            const x = points.length === 1 ? 320 : (index / (points.length - 1)) * 320
            const y = 88 - (point.value / max) * 82
            return <AgentPerformanceTrendPoint key={`${point.label}-${index}`} cx={x} cy={y} r="2.5" tone={point.tone} />
          })}
        </AgentPerformanceTrendSvg>
      </AgentPerformanceTrendFrame>
      <AgentPerformanceTrendSampleGrid>
        {points.slice(-3).map((point, index) => (
          <AgentPerformanceTrendSample key={`${point.label}-${index}`} label={point.label} value={formatMs(point.value)} tone={point.tone} />
        ))}
      </AgentPerformanceTrendSampleGrid>
    </AgentPerformanceStack>
  )
}

function SpanKindBars({ rows }: { rows: SpanKindRow[] }) {
  if (rows.length === 0) return <AgentPerformanceEmptyState>后端 trace spans 到达后，这里会展示模型、工具、审批等类型占比。</AgentPerformanceEmptyState>
  const max = Math.max(...rows.map((row) => row.count), 1)
  return (
    <AgentPerformanceBarList>
      {rows.slice(0, 7).map((row) => (
        <AgentPerformanceBarRow key={row.kind} label={row.kind} value={`${row.count} · P95 ${formatMs(row.p95)}`}>
          <AgentPerformanceProgressBar role="presentation" value={Math.max(4, Math.round((row.count / max) * 100))} tone={row.failed > 0 ? 'danger' : row.slow > 0 ? 'warning' : 'brand'} size="md" />
        </AgentPerformanceBarRow>
      ))}
    </AgentPerformanceBarList>
  )
}

function SlowDiagnosticList({ rows }: { rows: SlowDiagnosticRow[] }) {
  if (rows.length === 0) return <AgentPerformanceEmptyState>目前没有慢操作、慢 span 或长任务。</AgentPerformanceEmptyState>
  return (
    <AgentPerformanceStack density="compact">
      {rows.slice(0, 7).map((row) => (
        <AgentPerformanceSlowItem
          key={row.id}
          badge={<AgentPerformanceStatusBadge {...agentSlowDiagnosticRecipe(row.tone)}>{row.kind}</AgentPerformanceStatusBadge>}
          duration={formatMs(row.durationMs)}
          title={row.title}
          subtitle={row.subtitle}
        />
      ))}
    </AgentPerformanceStack>
  )
}

function OperationTimeline({ operation }: { operation: AgentPerformanceOperation | null }) {
  if (!operation) return <AgentPerformanceEmptyState>暂无可展示的操作。</AgentPerformanceEmptyState>
  const slowest = slowestPhase(operation)
  return (
    <AgentPerformanceTimelineDetail>
      <AgentPerformanceTimelineHeader
        title={operationKindLabel(operation.kind)}
        detail={operation.id}
        badge={(
          <AgentPerformanceStatusBadge {...agentPerformanceOperationRecipe(operation.status, slowOperation(operation))}>
            {operation.status === 'running' ? '运行中' : formatMs(operation.durationMs ?? 0)}
          </AgentPerformanceStatusBadge>
        )}
      />
      <AgentPerformanceTimelineBody>
        {operation.phases.map((phase) => (
          <AgentPerformancePhaseRow
            key={phase.id}
            active={slowest?.id === phase.id}
            time={`+${formatMs(phase.offsetMs)}`}
            title={phase.label}
            detail={phase.details ? formatDetails(phase.details) : undefined}
            duration={formatMs(phase.durationFromPreviousMs)}
          />
        ))}
      </AgentPerformanceTimelineBody>
    </AgentPerformanceTimelineDetail>
  )
}

function PerformanceStat({ title, value, detail, icon, tone }: {
  title: string
  value: string
  detail: string
  icon: React.ReactNode
  tone: 'ready' | 'warning'
}) {
  return <AgentPerformanceStatCard title={title} value={value} detail={detail} icon={icon} tone={tone} />
}

function PerformancePanel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <AgentPerformancePanel title={title} icon={icon}>{children}</AgentPerformancePanel>
}

function StorageBar({ label, bytes, totalBytes }: { label: string; bytes: number; totalBytes: number }) {
  const pct = Math.max(2, Math.min(100, Math.round((bytes / totalBytes) * 100)))
  const valueText = formatBytes(bytes)
  return <AgentPerformanceStorageBar label={label} value={pct} valueText={valueText} ariaLabel={`${label} storage usage`} />
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
