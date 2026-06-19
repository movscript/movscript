import type {
  AgentRun,
  AgentRunPreview,
  AgentTaskGraphSnapshot,
  AgentTimelineItem,
  AgentTimelinePage,
  AgentTimelineStreamEvent,
  AgentTraceDebugView,
  CreateMessageRunResult,
  DispatchTaskGraphResult,
  ProviderManifest,
  ProviderMemory,
  ProviderPluginFile,
  ProviderSessionLimitsOverride,
  ProviderSessionSnapshotV2,
  ProviderSessionTraceFrame,
  ProviderSessionTelemetrySnapshot,
  UpdateTaskGraphResult,
} from '@/shared/infrastructure/provider-session-client/types'

export function providerPluginCatalogFilesWireKey(): string {
  return ['agent', 'Catalog', 'Files'].join('')
}

export function providerCatalogWireRoute(kind: 'catalog' | 'config-files', suffix?: string): string {
  const base = `/${['agent', kind].join('-')}`
  return suffix ? `${base}/${suffix}` : base
}

export function providerPluginCatalogFilesWireValue(files: ProviderPluginFile[]): ProviderPluginFile[] {
  return files.map((file) => ({
    ...file,
    path: providerPluginCatalogPathWireValue(file.path),
  }))
}

function providerPluginCatalogPathWireValue(path: string): string {
  const mappings: Array<[string, string]> = [
    ['plugin-skills', ['agent', 'skills'].join('-')],
    ['plugin-tools', ['agent', 'tools'].join('-')],
    ['plugin-packs', ['agent', 'packs'].join('-')],
    ['plugin-config-files', ['agent', 'config', 'files'].join('-')],
  ]
  for (const [source, target] of mappings) {
    if (path === source || path.startsWith(`${source}/`)) return `${target}${path.slice(source.length)}`
  }
  return path
}

export function isBackendAPIV1Endpoint(endpoint: string): boolean {
  return endpoint.replace(/\/+$/, '').endsWith('/api/v1')
}

export function emptyProviderSessionTelemetrySnapshot(): ProviderSessionTelemetrySnapshot {
  return {
    schema: 'movscript.agent.runtime-telemetry.v1',
    generatedAt: new Date().toISOString(),
    service: {
      name: 'mova',
      storage: 'memory',
      metricsEndpoint: '/metrics',
      snapshotEndpoint: '/runtime/telemetry',
    },
    retention: {
      operations: 0,
      spans: 0,
      metrics: 0,
      logs: 0,
    },
    operations: [],
    spans: [],
    metrics: [],
    logs: [],
    summary: {
      operationCount: 0,
      runningOperationCount: 0,
      slowOperationCount: 0,
      errorOperationCount: 0,
      spanCount: 0,
      slowSpanCount: 0,
      errorSpanCount: 0,
    },
  }
}

export function statusClass(status: number): string {
  if (!Number.isFinite(status) || status <= 0) return 'unknown'
  return `${Math.floor(status / 100)}xx`
}

export function parseTimelineEvent(data: string): AgentTimelineStreamEvent | undefined {
  const parsed = JSON.parse(data) as unknown
  if (!isPlainRecord(parsed)) return undefined
  const type = parsed.type
  if (
    type !== 'timeline.item.created'
    && type !== 'timeline.item.updated'
    && type !== 'timeline.reset_required'
  ) return undefined
  const revision = typeof parsed.revision === 'number' && Number.isFinite(parsed.revision)
    ? parsed.revision
    : Date.now()
  if (type === 'timeline.reset_required') {
    return {
      type,
      revision,
      ...(typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}),
    }
  }
  if (!isPlainRecord(parsed.item)) return undefined
  return {
    type,
    revision,
    item: normalizeTimelineItem(parsed.item as unknown as AgentTimelineItem) as Extract<AgentTimelineStreamEvent, { type: typeof type }>['item'],
  }
}

export function normalizeTimelinePage(page: AgentTimelinePage): AgentTimelinePage {
  return {
    ...page,
    items: (page.items ?? []).map(normalizeTimelineItem),
  }
}

function normalizeTimelineItem(item: AgentTimelineItem): AgentTimelineItem {
  return item
}

export function normalizeCreateMessageRunResult(input: CreateMessageRunResult): CreateMessageRunResult {
  return {
    ...input,
    run: normalizeAgentRun(input.run),
  }
}

export function normalizeAgentRun(input: AgentRun): AgentRun {
  return normalizeProviderManifestCarrier(input) as AgentRun
}

export function normalizeOptionalAgentRun(input: AgentRun | undefined): AgentRun | undefined {
  return input ? normalizeAgentRun(input) : undefined
}

export function normalizeAgentRunList<T extends { runs: AgentRun[] }>(input: T): Omit<T, 'runs'> & { runs: AgentRun[] } {
  return {
    ...input,
    runs: input.runs.map(normalizeAgentRun),
  }
}

export function normalizeAgentTaskGraphSnapshot(input: AgentTaskGraphSnapshot): AgentTaskGraphSnapshot {
  return {
    ...input,
    runs: (input.runs ?? []).map(normalizeAgentRun),
  }
}

export function normalizeDispatchTaskGraphResult(input: DispatchTaskGraphResult): DispatchTaskGraphResult {
  return {
    ...input,
    spawnedRuns: (input.spawnedRuns ?? []).map(normalizeAgentRun),
  }
}

export function normalizeUpdateTaskGraphResult(input: UpdateTaskGraphResult): UpdateTaskGraphResult {
  return {
    ...input,
    ...(input.dispatch ? { dispatch: normalizeDispatchTaskGraphResult(input.dispatch) } : {}),
  }
}

export function normalizeProviderSessionSnapshot(input: ProviderSessionSnapshotV2): ProviderSessionSnapshotV2 {
  return {
    ...input,
    entities: {
      ...input.entities,
      ...(input.entities.runs ? { runs: input.entities.runs.map(normalizeAgentRun) } : {}),
    },
  }
}

export function normalizeAgentRunPreview(input: AgentRunPreview): AgentRunPreview {
  return normalizeProviderManifestCarrier(input)
}

type AgentTraceDebugViewWire = Omit<AgentTraceDebugView, 'providerSessionSummary' | 'providerSessionFrames'> & {
  providerSessionSummary?: AgentTraceDebugView['providerSessionSummary']
  providerSessionFrames?: ProviderSessionTraceFrame[]
}

export function normalizeAgentTraceDebugView(input: AgentTraceDebugViewWire): AgentTraceDebugView {
  return {
    ...input,
    providerSessionSummary: input.providerSessionSummary,
    providerSessionFrames: input.providerSessionFrames ?? [],
  } as AgentTraceDebugView
}

export function providerManifestRequestBody<T extends { providerManifest?: ProviderManifest; agentManifest?: ProviderManifest; providerSessionInputMode?: 'soft' | 'hard'; providerSessionLimits?: ProviderSessionLimitsOverride }>(
  input: T,
): Omit<T, 'providerManifest' | 'agentManifest'> & { agentManifest?: ProviderManifest } {
  const { providerManifest, agentManifest, ...rest } = input
  const manifest = providerManifest ?? agentManifest
  return {
    ...rest,
    ...(manifest ? { agentManifest: manifest } : {}),
  }
}

export function normalizeActiveProviderManifestResponse<T extends { activeProviderManifest?: ProviderManifest; activeAgentManifest?: ProviderManifest }>(input: T): Omit<T, 'activeProviderManifest'> & { activeProviderManifest: ProviderManifest; activeAgentManifest?: ProviderManifest } {
  const manifest = input.activeProviderManifest ?? input.activeAgentManifest
  return {
    ...input,
    activeProviderManifest: manifest as ProviderManifest,
  }
}

export function normalizeProviderManifestCarrier<T extends { providerManifest?: ProviderManifest; agentManifest?: ProviderManifest }>(input: T): T & { providerManifest?: ProviderManifest } {
  const manifest = input.providerManifest ?? input.agentManifest
  return {
    ...input,
    ...(manifest ? { providerManifest: manifest } : {}),
  }
}

export function normalizeOptionalProviderManifestCarrier<T extends { providerManifest?: ProviderManifest; agentManifest?: ProviderManifest }>(input: T | undefined): (T & { providerManifest?: ProviderManifest }) | undefined {
  return input ? normalizeProviderManifestCarrier(input) : undefined
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
