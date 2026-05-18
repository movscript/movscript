import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, CheckCircle2, Clipboard, Download, Loader2, Play, RefreshCw, Settings, Terminal, XCircle } from 'lucide-react'
import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@movscript/ui'
import {
  localAgentClient,
  type AgentCapabilitiesResponse,
  type AgentInspectResponse,
  type AgentRun,
  type AgentRunPreview,
  type RuntimeModelConfigPublic,
} from '@/lib/localAgentClient'
import { redactAgentTraceDebugData, redactAgentTraceDebugText } from '@/lib/agentTraceDebugData'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/lib/utils'
import { ROUTES, agentRunPath } from '@/routes/projectRoutes'

type AgentDebugData = {
  health: unknown
  inspect: AgentInspectResponse
  capabilities: AgentCapabilitiesResponse
  modelConfig: RuntimeModelConfigPublic | null
  modelConfigError: string | null
  runs: Awaited<ReturnType<typeof localAgentClient.listRuns>>['runs']
  lastUpdated: string
}
type AgentDebugProjectSnapshot = { id: number; name: string; status?: string } | null
const AGENT_DEBUG_BUNDLE_SCHEMA = 'movscript.agent.debug.bundle.v1'
const AGENT_DEBUG_BUNDLE_SCHEMA_VERSION = 1
const AGENT_DEBUG_BUNDLE_SCHEMA_URL = 'https://movscript.dev/schemas/agent-debug-bundle-v1.schema.json'
type AgentDebugBundle = {
  schema: typeof AGENT_DEBUG_BUNDLE_SCHEMA
  schemaVersion: typeof AGENT_DEBUG_BUNDLE_SCHEMA_VERSION
  schemaUrl: typeof AGENT_DEBUG_BUNDLE_SCHEMA_URL
  redacted: true
  exportedAt: string
  baseURL: string
  currentProject: AgentDebugProjectSnapshot
  runtime: unknown | null
  modelConfig: RuntimeModelConfigPublic | null
  modelConfigError: string | null
  lastUpdated: string | null
  observationCoverage: DebugObservationItem[]
  evidenceChecklist: DebugEvidenceItem[]
  triageItems: DebugTriageItem[]
  remediationPlan: DebugRemediationItem[]
  runSummary: ReturnType<typeof summarizeRuns>
  runIssueGroups: DebugRunIssueGroup[]
  warnings: string[]
  warningGroups: DebugWarningGroup[]
  preview: unknown | null
}
type DebugWarningGroup = {
  source: 'capabilities' | 'catalog' | 'model' | 'preview'
  labelKey: string
  warnings: string[]
}
type DebugObservationItem = {
  id: string
  status: 'ready' | 'warning' | 'action'
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
}
type DebugEvidenceItem = {
  id: 'runtime' | 'observations' | 'triage' | 'remediation' | 'runs' | 'preview' | 'redaction'
  status: 'ready' | 'warning' | 'action'
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
}
type DebugRunIssueGroup = {
  id: 'requires_action' | 'failed' | 'in_progress' | 'completed_with_warnings'
  status: AgentRun['status']
  labelKey: string
  count: number
  sampleReason?: string
  sampleRunId?: string
}
type DebugTriageItem = {
  id: string
  severity: 'action' | 'warning' | 'info'
  titleKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
  signalLabelKey?: string
  runId?: string
}
type DebugRemediationItem = {
  id: string
  severity: 'action' | 'warning' | 'info'
  target: 'settings' | 'run-details' | 'preview' | 'observe'
  titleKey: string
  detailKey: string
  actionKey: string
  detailValues?: Record<string, string | number>
  runId?: string
}
type DebugTranslate = ReturnType<typeof useTranslation>['t']

export default function AIAgentDebugPage() {
  const { t } = useTranslation()
  const currentProject = useProjectStore((s) => s.current)
  const [previewMessage, setPreviewMessage] = useState(t('agents.debug.defaultPreviewMessage'))
  const [preview, setPreview] = useState<AgentRunPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [triageCopied, setTriageCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const debugQuery = useQuery<AgentDebugData>({
    queryKey: ['agent-debug-page', localAgentClient.baseURL, currentProject?.ID],
    queryFn: async () => {
      const health = await localAgentClient.ensureRunning()
      const [inspect, capabilities, modelConfigResult, runs] = await Promise.all([
        localAgentClient.inspect(),
        localAgentClient.getCapabilities({ ...(currentProject ? { projectId: currentProject.ID } : {}) }),
        localAgentClient.getModelConfig()
          .then((modelConfig) => ({ modelConfig, modelConfigError: null }))
          .catch((error) => ({
            modelConfig: null,
            modelConfigError: redactAgentTraceDebugText(error instanceof Error ? error.message : String(error)),
          })),
        localAgentClient.listRuns().then((result) => result.runs),
      ])
      return { health, inspect, capabilities, ...modelConfigResult, runs, lastUpdated: new Date().toISOString() }
    },
    retry: false,
  })

  const currentProjectSnapshot = useMemo<AgentDebugProjectSnapshot>(() => (
    currentProject ? { id: currentProject.ID, name: currentProject.name, status: currentProject.status } : null
  ), [currentProject])
  const warningGroups = useMemo(() => collectDebugWarningGroups(debugQuery.data, preview), [debugQuery.data, preview])
  const allWarnings = useMemo(() => flattenDebugWarningGroups(warningGroups), [warningGroups])
  const runHealth = useMemo(() => summarizeRuns(debugQuery.data?.runs ?? []), [debugQuery.data?.runs])
  const observationItems = useMemo(() => buildDebugObservationItems({
    debug: debugQuery.data ?? null,
    currentProject: currentProjectSnapshot,
    preview,
    warnings: allWarnings,
  }), [allWarnings, currentProjectSnapshot, debugQuery.data, preview])
  const rawData = useMemo(() => buildDebugBundle({
    baseURL: localAgentClient.baseURL,
    currentProject: currentProjectSnapshot,
    debug: debugQuery.data ?? null,
    preview,
  }), [currentProjectSnapshot, debugQuery.data, preview])
  const evidenceChecklist = rawData.evidenceChecklist
  const triageItems = rawData.triageItems
  const remediationPlan = rawData.remediationPlan

  async function runPreview() {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const message = previewMessage.trim() || t('agents.debug.defaultPreviewMessage')
      const result = await localAgentClient.previewRun({
        message,
        clientInput: {
          message,
          uiSnapshot: {
            route: {
              pathname: window.location.pathname,
              search: window.location.search,
              hash: window.location.hash,
            },
            project: currentProject
              ? {
                id: currentProject.ID,
                name: currentProject.name,
                status: currentProject.status,
                description: currentProject.description,
              }
              : undefined,
            labels: ['agent-debug'],
          },
        },
      })
      setPreview(result)
    } catch (error) {
      setPreviewError(redactAgentTraceDebugText(error instanceof Error ? error.message : String(error)))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function copyRawData() {
    await navigator.clipboard.writeText(currentDebugBundleText())
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  async function copyTriageSummary() {
    await navigator.clipboard.writeText(currentTriageSummaryText())
    setTriageCopied(true)
    window.setTimeout(() => setTriageCopied(false), 1500)
  }

  function currentTriageSummaryText() {
    const lines = [
      t('agents.debug.triageSummary.title'),
      `${t('agents.debug.fields.baseUrl')}: ${redactAgentTraceDebugText(localAgentClient.baseURL)}`,
      `${t('agents.debug.fields.lastUpdated')}: ${rawData.lastUpdated ?? rawData.exportedAt}`,
    ]
    if (currentProjectSnapshot) {
      lines.push(`${t('agents.debug.fields.project')}: ${currentProjectSnapshot.name} (#${currentProjectSnapshot.id})`)
    }
    if (triageItems.length === 0) {
      lines.push(t('agents.debug.empty.noTriageItems'))
      return lines.join('\n')
    }
    triageItems.forEach((item, index) => {
      lines.push(`${index + 1}. [${t(`agents.debug.triageSeverities.${item.severity}`)}] ${t(item.titleKey, item.detailValues)}`)
      lines.push(`   ${t(item.detailKey, item.detailValues)}`)
      if (item.signalLabelKey) lines.push(`   ${t('agents.debug.triage.signal', { signal: t(item.signalLabelKey) })}`)
      if (item.runId) lines.push(`   ${t('agents.debug.actions.viewRun')}: ${agentRunPath(item.runId)}`)
    })
    if (remediationPlan.length > 0) {
      lines.push('')
      lines.push(t('agents.debug.remediationSummary.title'))
      remediationPlan.forEach((item, index) => {
        lines.push(`${index + 1}. [${t(`agents.debug.triageSeverities.${item.severity}`)}] ${t(item.titleKey, item.detailValues)}`)
        lines.push(`   ${t(item.detailKey, item.detailValues)}`)
      })
    }
    return lines.join('\n')
  }

  function currentDebugBundleText() {
    return formatJson(buildDebugBundle({
      baseURL: localAgentClient.baseURL,
      currentProject: currentProjectSnapshot,
      debug: debugQuery.data ?? null,
      preview,
    }))
  }

  function downloadDebugBundle() {
    const text = currentDebugBundleText()
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `agent-debug-bundle-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setDownloaded(true)
    window.setTimeout(() => setDownloaded(false), 1500)
  }

  const runtimeOnline = !!debugQuery.data && !debugQuery.error

  return (
    <div data-testid="agent-debug-page" className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Terminal size={18} />
              <h1 className="text-lg font-semibold text-foreground">{t('agents.debug.title')}</h1>
              <RuntimeStatusBadge online={runtimeOnline} loading={debugQuery.isLoading || debugQuery.isFetching} />
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{t('agents.debug.description')}</p>
            <div data-testid="agent-debug-scope-boundary" className="mt-2 flex max-w-3xl flex-wrap gap-2 text-[11px] leading-4">
              <span className="rounded border border-border bg-muted/30 px-2 py-1 text-foreground">{t('agents.debug.scope.observabilityPlane')}</span>
              <span className="rounded border border-border bg-background px-2 py-1 text-muted-foreground">{t('agents.debug.scope.noPersistentWrites')}</span>
              <span className="rounded border border-border bg-background px-2 py-1 text-muted-foreground">{t('agents.debug.scope.runDiagnosticsInDetails')}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" data-testid="agent-debug-open-settings">
              <Link to={ROUTES.agentSettings}>
                <Settings size={13} />
                {t('agents.debug.actions.openSettings')}
              </Link>
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={copyTriageSummary} data-testid="agent-debug-copy-triage">
              <Clipboard size={13} />
              {triageCopied ? t('agents.debug.actions.triageCopied') : t('agents.debug.actions.copyTriage')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={copyRawData} data-testid="agent-debug-copy-bundle">
              <Clipboard size={13} />
              {copied ? t('agents.debug.actions.copied') : t('agents.debug.actions.copyJson')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={downloadDebugBundle} data-testid="agent-debug-download-bundle">
              <Download size={13} />
              {downloaded ? t('agents.debug.actions.downloaded') : t('agents.debug.actions.downloadJson')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => debugQuery.refetch()} disabled={debugQuery.isFetching} data-testid="agent-debug-refresh">
              <RefreshCw size={13} className={debugQuery.isFetching ? 'animate-spin' : ''} />
              {t('agents.debug.actions.refresh')}
            </Button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        {debugQuery.isLoading ? (
          <StateMessage icon={<Loader2 size={16} className="animate-spin" />} text={t('common.loading')} />
        ) : debugQuery.error ? (
          <StateMessage
            icon={<XCircle size={16} />}
            tone="danger"
            text={redactAgentTraceDebugText(debugQuery.error instanceof Error ? debugQuery.error.message : String(debugQuery.error))}
          />
        ) : debugQuery.data ? (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="overview">{t('agents.debug.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="manifest">{t('agents.debug.tabs.manifest')}</TabsTrigger>
              <TabsTrigger value="prompt">{t('agents.debug.tabs.prompt')}</TabsTrigger>
              <TabsTrigger value="context">{t('agents.debug.tabs.context')}</TabsTrigger>
              <TabsTrigger value="runs">{t('agents.debug.tabs.runs')}</TabsTrigger>
              <TabsTrigger value="raw">{t('agents.debug.tabs.raw')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <section className="grid gap-3 md:grid-cols-4">
                <MetricCard label={t('agents.debug.metrics.runtime')} value={runtimeOnline ? t('agents.debug.status.online') : t('agents.debug.status.offline')} />
                <MetricCard label={t('agents.debug.metrics.activeRuns')} value={String(runHealth.active)} />
                <MetricCard label={t('agents.debug.metrics.waitingRuns')} value={String(runHealth.waiting)} />
                <MetricCard label={t('agents.debug.metrics.failedRuns')} value={String(runHealth.failed)} />
              </section>

              <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                <Panel title={t('agents.debug.panels.runtime')}>
                  <div className="grid gap-2 text-xs md:grid-cols-2">
                    <SummaryItem label={t('agents.debug.fields.baseUrl')} value={redactAgentTraceDebugText(localAgentClient.baseURL)} />
                    <SummaryItem label={t('agents.debug.fields.lastUpdated')} value={debugQuery.data.lastUpdated ? new Date(debugQuery.data.lastUpdated).toLocaleString() : '-'} />
                    <SummaryItem label="MCP" value={debugQuery.data.capabilities.mcp.connected ? t('agents.debug.status.online') : t('agents.debug.status.offline')} />
                    <SummaryItem label={t('agents.debug.fields.skillsDir')} value={debugQuery.data.inspect.pluginCatalog?.skillsDir ?? t('agents.debug.values.unknown')} />
                    <SummaryItem label={t('agents.debug.fields.toolsDir')} value={debugQuery.data.inspect.pluginCatalog?.toolsDir ?? t('agents.debug.values.unknown')} />
                  </div>
                  <div data-testid="agent-debug-runtime-model-config" className="mt-3 rounded-md border border-border bg-muted/20 p-2">
                    <p className="text-xs font-medium text-foreground">{t('agents.debug.panels.runtimeModelConfig')}</p>
                    {debugQuery.data.modelConfig ? (
                      <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                        <SummaryItem label={t('agents.debug.fields.modelConfigured')} value={debugQuery.data.modelConfig.configured ? t('agents.debug.status.enabled') : t('agents.debug.status.disabled')} />
                        <SummaryItem label={t('agents.debug.fields.model')} value={debugModelConfigValue(debugQuery.data.modelConfig)} />
                        <SummaryItem label={t('agents.debug.fields.apiKind')} value={debugQuery.data.modelConfig.apiKind ?? 'openai_chat_completions'} />
                        <SummaryItem label={t('agents.debug.fields.modelCredentials')} value={debugModelCredentialStatusLabel(debugQuery.data.modelConfig, t)} />
                        <SummaryItem label={t('agents.debug.fields.modelRoutes')} value={debugModelRouteSummary(debugQuery.data.modelConfig)} />
                        <SummaryItem label={t('agents.debug.fields.modelSource')} value={debugQuery.data.modelConfig.source} />
                      </div>
                    ) : (
                      <div data-testid="agent-debug-model-config-read-error" className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-4 text-amber-800 dark:text-amber-300">
                        {t('agents.debug.empty.modelConfigReadFailed', { reason: debugQuery.data.modelConfigError ?? '-' })}
                      </div>
                    )}
                  </div>
                  {warningGroups.length > 0 && (
                    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{t('agents.debug.panels.warnings')}</p>
                      <div data-testid="agent-debug-warning-groups" className="mt-2 space-y-2">
                        {warningGroups.map((group) => (
                          <div key={group.source} data-testid="agent-debug-warning-group" className="rounded bg-background/70 px-2 py-1.5">
                            <p className="text-[10px] font-medium text-foreground">{t(group.labelKey)}</p>
                            <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                              {group.warnings.map((warning, index) => <li key={`${group.source}-${warning}-${index}`}>{warning}</li>)}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Panel>

                <Panel title={t('agents.debug.panels.previewInput')}>
                  <div className="space-y-2">
                    <Textarea
                      value={previewMessage}
                      onChange={(event) => setPreviewMessage(event.target.value)}
                      className="min-h-24 text-xs"
                    />
                    <Button type="button" size="sm" onClick={runPreview} disabled={previewLoading}>
                      {previewLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      {t('agents.debug.actions.runPreview')}
                    </Button>
                    {previewError && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                        {previewError}
                      </div>
                    )}
                  </div>
                </Panel>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <Panel title={t('agents.debug.panels.triage')}>
                  <DebugTriagePanel items={triageItems} />
                </Panel>
                <Panel title={t('agents.debug.panels.remediationPlan')}>
                  <DebugRemediationPlan items={remediationPlan} previewLoading={previewLoading} onRunPreview={() => void runPreview()} />
                </Panel>
                <Panel title={t('agents.debug.panels.observationCoverage')}>
                  <DebugObservationCoverage items={observationItems} previewLoading={previewLoading} onRunPreview={() => void runPreview()} />
                </Panel>
                <Panel title={t('agents.debug.panels.evidenceChecklist')}>
                  <DebugEvidenceChecklistPanel items={evidenceChecklist} />
                </Panel>
                <Panel title={t('agents.debug.panels.runIssueSummary')}>
                  <RunIssueSummary groups={runHealth.issueGroups} />
                </Panel>
                <Panel title={t('agents.debug.panels.runAttention')}>
                  <div data-testid="agent-debug-run-attention" className="space-y-2">
                    {runHealth.attention.length === 0 ? (
                      <EmptyText>{t('agents.debug.empty.noRunAttention')}</EmptyText>
                    ) : runHealth.attention.map((run) => (
                      <RunListRow key={run.id} run={run} />
                    ))}
                  </div>
                </Panel>
                <Panel title={t('agents.debug.panels.mcpResources')}>
                  {debugQuery.data.capabilities.mcp.resources.length === 0 ? (
                    <EmptyText>{t('agents.debug.empty.noResources')}</EmptyText>
                  ) : (
                    <div className="space-y-2">
                      {debugQuery.data.capabilities.mcp.resources.map((resource) => (
                        <ListRow key={resource.uri} title={resource.name || resource.uri} meta={resource.uri} description={resource.description} />
                      ))}
                    </div>
                  )}
                </Panel>
                <Panel title={t('agents.debug.panels.latestPreview')}>
                  {preview ? <PreviewSummary preview={preview} /> : <EmptyText>{t('agents.debug.empty.runPreviewHint')}</EmptyText>}
                </Panel>
              </section>
            </TabsContent>

            <TabsContent value="manifest" className="grid gap-4 lg:grid-cols-2">
              <JsonPanel title={t('agents.debug.panels.effectiveManifest')} value={preview?.agentManifest ?? debugQuery.data.capabilities.defaultAgentManifest} emptyText={t('agents.debug.empty.noManifest')} />
              <JsonPanel title={t('agents.debug.panels.defaultManifest')} value={debugQuery.data.inspect.defaultAgentManifest} emptyText={t('agents.debug.empty.noDefaultManifest')} />
            </TabsContent>

            <TabsContent value="prompt" className="grid gap-4 lg:grid-cols-2">
              <Panel title={t('agents.debug.panels.promptParts')}>
                {preview?.promptPreview ? (
                  <div className="space-y-2">
                    {preview.promptPreview.debugParts.map((part) => (
                      <div key={part.id} className="rounded-md border border-border bg-muted/20 p-2">
                        <p className="text-xs font-medium text-foreground">{part.title}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{part.kind} / {t('agents.debug.values.chars', { count: part.content.length })}</p>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[10px] leading-4">{part.content ? redactAgentTraceDebugText(part.content) : t('agents.debug.empty.emptyValue')}</pre>
                      </div>
                    ))}
                  </div>
                ) : <EmptyText>{t('agents.debug.empty.runPromptPreviewHint')}</EmptyText>}
              </Panel>
              <JsonPanel title={t('agents.debug.panels.outboundMessages')} value={preview?.promptPreview?.messages} emptyText={t('agents.debug.empty.runPromptPreviewHint')} />
            </TabsContent>

            <TabsContent value="context" className="grid gap-4 lg:grid-cols-2">
              <Panel title={t('agents.debug.panels.currentProject')}>
                {currentProject ? (
                  <div className="space-y-2 text-xs">
                    <SummaryItem label={t('agents.debug.fields.project')} value={`#${currentProject.ID} ${currentProject.name}`} />
                    <SummaryItem label={t('agents.debug.fields.route')} value={window.location.pathname} />
                  </div>
                ) : <EmptyText>{t('agents.debug.empty.noProject')}</EmptyText>}
              </Panel>
              <JsonPanel title={t('agents.debug.panels.contextJson')} value={preview?.context} emptyText={t('agents.debug.empty.runContextPreviewHint')} />
            </TabsContent>

            <TabsContent value="runs" className="space-y-4">
              <Panel title={t('agents.debug.tabs.runs')}>
                {debugQuery.data.runs.length === 0 ? <EmptyText>{t('agents.debug.values.none')}</EmptyText> : (
                  <div className="space-y-2">
                    {debugQuery.data.runs.slice(0, 30).map((run) => (
                      <RunListRow key={run.id} run={run} />
                    ))}
                  </div>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="raw" className="space-y-4">
              <DebugBundleRedactionNotice />
              <DebugBundleFieldGuide />
              <JsonPanel title={t('agents.debug.tabs.raw')} value={rawData} />
            </TabsContent>
          </Tabs>
        ) : null}
      </main>
    </div>
  )
}

function RuntimeStatusBadge({ online, loading }: { online: boolean; loading: boolean }) {
  const { t } = useTranslation()
  if (loading) return <Badge variant="secondary">{t('agents.debug.status.checking')}</Badge>
  return (
    <Badge variant={online ? 'success' : 'destructive'} className="gap-1">
      {online ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {online ? t('agents.debug.status.runtimeOnline') : t('agents.debug.status.runtimeOffline')}
    </Badge>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

function DebugObservationCoverage({
  items,
  previewLoading,
  onRunPreview,
}: {
  items: DebugObservationItem[]
  previewLoading: boolean
  onRunPreview: () => void
}) {
  return (
    <div data-testid="agent-debug-observation-coverage" className="space-y-2">
      {items.map((item) => (
        <DebugObservationRow
          key={item.id}
          item={item}
          previewLoading={previewLoading}
          onRunPreview={onRunPreview}
        />
      ))}
    </div>
  )
}

function DebugObservationRow({
  item,
  previewLoading,
  onRunPreview,
}: {
  item: DebugObservationItem
  previewLoading: boolean
  onRunPreview: () => void
}) {
  const { t } = useTranslation()
  const canRunPreview = item.id === 'preview' && item.status !== 'ready'
  const icon = item.status === 'ready'
    ? <CheckCircle2 size={13} className="text-emerald-600" />
    : item.status === 'action'
      ? <XCircle size={13} className="text-destructive" />
      : <XCircle size={13} className="text-amber-600" />
  return (
    <div data-testid="agent-debug-observation-item" className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/20 p-2">
      <span className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0">
          <span className="block text-xs font-medium text-foreground">{t(item.labelKey)}</span>
          <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{t(item.detailKey, item.detailValues)}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant={item.status === 'ready' ? 'success' : item.status === 'action' ? 'destructive' : 'warning'}>
          {t(`agents.debug.observationStatuses.${item.status}`)}
        </Badge>
        {canRunPreview && (
          <Button type="button" size="sm" variant="outline" onClick={onRunPreview} disabled={previewLoading} data-testid="agent-debug-observation-run-preview">
            {previewLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {t('agents.debug.actions.runPreview')}
          </Button>
        )}
      </span>
    </div>
  )
}

function DebugEvidenceChecklistPanel({ items }: { items: DebugEvidenceItem[] }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  async function copyEvidenceChecklist() {
    const lines = [
      t('agents.debug.evidenceChecklist.title'),
      ...items.map((item, index) => (
        `${index + 1}. [${t(`agents.debug.observationStatuses.${item.status}`)}] ${t(item.labelKey)} - ${t(item.detailKey, item.detailValues)}`
      )),
    ]
    await navigator.clipboard.writeText(lines.map(redactAgentTraceDebugText).join('\n'))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div data-testid="agent-debug-evidence-checklist" className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={() => void copyEvidenceChecklist()} data-testid="agent-debug-copy-evidence-checklist">
          <Clipboard size={13} />
          {copied ? t('agents.debug.actions.evidenceCopied') : t('agents.debug.actions.copyEvidence')}
        </Button>
      </div>
      {items.map((item) => (
        <div key={item.id} data-testid="agent-debug-evidence-item" className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/20 p-2">
          <span className="min-w-0">
            <span className="block text-xs font-medium text-foreground">{t(item.labelKey)}</span>
            <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{t(item.detailKey, item.detailValues)}</span>
          </span>
          <Badge variant={item.status === 'ready' ? 'success' : item.status === 'action' ? 'destructive' : 'warning'} className="shrink-0">
            {t(`agents.debug.observationStatuses.${item.status}`)}
          </Badge>
        </div>
      ))}
    </div>
  )
}

function RunIssueSummary({ groups }: { groups: DebugRunIssueGroup[] }) {
  const { t } = useTranslation()
  if (groups.length === 0) return <EmptyText>{t('agents.debug.empty.noRunIssues')}</EmptyText>
  return (
    <div data-testid="agent-debug-run-issue-summary" className="space-y-2">
      {groups.map((group) => (
        <div key={group.id} data-testid="agent-debug-run-issue-group" className="rounded-md border border-border bg-muted/20 p-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">{t(group.labelKey)}</p>
              {group.sampleReason && <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{group.sampleReason}</p>}
              {group.sampleRunId && (
                <Link to={agentRunPath(group.sampleRunId)} data-testid="agent-debug-run-issue-link" className="mt-1 inline-flex text-[10px] font-medium text-primary hover:underline">
                  {t('agents.debug.actions.viewRun')}
                </Link>
              )}
            </div>
            <Badge variant={runStatusVariant(group.status)} className="shrink-0">{group.count}</Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

function DebugTriagePanel({ items }: { items: DebugTriageItem[] }) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return (
      <div data-testid="agent-debug-triage" className="space-y-2">
        <EmptyText>{t('agents.debug.empty.noTriageItems')}</EmptyText>
      </div>
    )
  }
  return (
    <div data-testid="agent-debug-triage" className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          data-testid="agent-debug-triage-item"
          className={cn(
            'rounded-md border p-2',
            item.severity === 'action'
              ? 'border-destructive/40 bg-destructive/10'
              : item.severity === 'warning'
                ? 'border-amber-500/40 bg-amber-500/10'
                : 'border-border bg-muted/20',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block text-xs font-medium text-foreground">{t(item.titleKey, item.detailValues)}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                {t(item.detailKey, item.detailValues)}
              </span>
              {item.signalLabelKey && (
                <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
                  {t('agents.debug.triage.signal', { signal: t(item.signalLabelKey) })}
                </span>
              )}
              {item.runId && (
                <Link to={agentRunPath(item.runId)} data-testid="agent-debug-triage-run-link" className="mt-1 inline-flex text-[10px] font-medium text-primary hover:underline">
                  {t('agents.debug.actions.viewRun')}
                </Link>
              )}
            </span>
            <Badge variant={item.severity === 'action' ? 'destructive' : item.severity === 'warning' ? 'warning' : 'secondary'} className="shrink-0">
              {t(`agents.debug.triageSeverities.${item.severity}`)}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

function DebugRemediationPlan({
  items,
  previewLoading,
  onRunPreview,
}: {
  items: DebugRemediationItem[]
  previewLoading: boolean
  onRunPreview: () => void
}) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return (
      <div data-testid="agent-debug-remediation-plan" className="space-y-2">
        <EmptyText>{t('agents.debug.empty.noRemediationItems')}</EmptyText>
      </div>
    )
  }
  return (
    <div data-testid="agent-debug-remediation-plan" className="space-y-2">
      {items.map((item) => (
        <div key={item.id} data-testid="agent-debug-remediation-item" className="rounded-md border border-border bg-muted/20 p-2">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-xs font-medium text-foreground">{t(item.titleKey, item.detailValues)}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{t(item.detailKey, item.detailValues)}</span>
            </span>
            <Badge variant={item.severity === 'action' ? 'destructive' : item.severity === 'warning' ? 'warning' : 'secondary'} className="shrink-0">
              {t(`agents.debug.triageSeverities.${item.severity}`)}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.target === 'settings' ? (
              <Button asChild size="sm" variant="outline" data-testid="agent-debug-remediation-settings-link">
                <Link to={ROUTES.agentSettings}>
                  <Settings size={12} />
                  {t(item.actionKey)}
                </Link>
              </Button>
            ) : item.target === 'run-details' && item.runId ? (
              <Button asChild size="sm" variant="outline" data-testid="agent-debug-remediation-run-link">
                <Link to={agentRunPath(item.runId)}>
                  <ArrowRight size={12} />
                  {t(item.actionKey)}
                </Link>
              </Button>
            ) : item.target === 'preview' ? (
              <Button type="button" size="sm" variant="outline" onClick={onRunPreview} disabled={previewLoading} data-testid="agent-debug-remediation-preview-action">
                {previewLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                {t(item.actionKey)}
              </Button>
            ) : (
              <span className="inline-flex items-center rounded border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground" data-testid="agent-debug-remediation-observe-only">
                {t(item.actionKey)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function DebugBundleRedactionNotice() {
  const { t } = useTranslation()
  return (
    <div data-testid="agent-debug-bundle-redaction-notice" className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">{t('agents.debug.redactionNotice.title')}</p>
        <p className="mt-0.5">{t('agents.debug.redactionNotice.detail')}</p>
      </div>
    </div>
  )
}

function DebugBundleFieldGuide() {
  const { t } = useTranslation()
  const fields = [
    'schema',
    'schemaVersion',
    'schemaUrl',
    'triageItems',
    'remediationPlan',
    'observationCoverage',
    'evidenceChecklist',
    'runIssueGroups',
    'warningGroups',
    'redacted',
    'preview',
    'runtime',
    'modelConfig',
    'modelConfigError',
  ] as const
  return (
    <Panel title={t('agents.debug.panels.debugBundleFieldGuide')}>
      <div data-testid="agent-debug-bundle-field-guide" className="grid gap-2 text-xs md:grid-cols-2">
        {fields.map((field) => (
          <div key={field} data-testid="agent-debug-bundle-field-guide-item" className="rounded-md border border-border bg-muted/20 p-2">
            <p className="font-medium text-foreground">{field}</p>
            <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{t(`agents.debug.bundleFields.${field}`)}</p>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Bot size={13} className="text-muted-foreground" />
        <h2 className="text-xs font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function SummaryItem({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/20 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-foreground">{value ?? '-'}</p>
    </div>
  )
}

function ListRow({
  title,
  meta,
  description,
  trailing,
}: {
  title: string
  meta?: string
  description?: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 p-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{title}</p>
        {meta && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{meta}</p>}
        {description && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{description}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  )
}

function RunListRow({ run }: { run: AgentRun }) {
  return (
    <Link
      to={agentRunPath(run.id)}
      data-testid="agent-debug-run-link"
      className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 p-2 transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{run.id}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {redactAgentTraceDebugText([run.status, run.role, run.planId].filter(Boolean).join(' / '))}
        </p>
        {(run.error || run.blockedReason || run.agentManifest?.name) && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {redactAgentTraceDebugText(run.error || run.blockedReason || run.agentManifest?.name || '')}
          </p>
        )}
      </div>
      <Badge variant={runStatusVariant(run.status)} className="shrink-0">{run.status}</Badge>
    </Link>
  )
}

function PreviewSummary({ preview }: { preview: AgentRunPreview }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-xs md:grid-cols-3">
        <SummaryItem label={t('agents.debug.fields.project')} value={preview.currentProjectId ?? t('agents.debug.values.none')} />
        <SummaryItem label={t('agents.debug.fields.memoryCount')} value={preview.memoryCount} />
        <SummaryItem label={t('agents.debug.fields.toolCalls')} value={preview.toolCalls.length} />
      </div>
      <div className="space-y-2">
        {preview.toolCalls.length === 0 ? <EmptyText>{t('agents.debug.empty.runPlanPreviewHint')}</EmptyText> : preview.toolCalls.map((toolCall, index) => (
          <ListRow
            key={`${toolCall.name}-${index}`}
            title={`${index + 1}. ${toolCall.name}`}
            description={toolCall.args ? formatJson(toolCall.args) : undefined}
          />
        ))}
      </div>
      {preview.pendingApprovals.length > 0 ? (
        <div className="space-y-2">
          {preview.pendingApprovals.map((approval) => (
            <ListRow
              key={approval.id}
              title={approval.toolName}
              meta={approval.risk}
              description={redactAgentTraceDebugText(approval.reason)}
              trailing={<Badge variant="warning">{t('agents.debug.values.required')}</Badge>}
            />
          ))}
        </div>
      ) : <EmptyText>{t('agents.debug.empty.noApprovals')}</EmptyText>}
    </div>
  )
}

function JsonPanel({ title, value, emptyText }: { title: string; value?: unknown; emptyText?: string }) {
  return (
    <Panel title={title}>
      {value === undefined || value === null ? (
        <EmptyText>{emptyText ?? '-'}</EmptyText>
      ) : (
        <pre className="max-h-[68vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-5 text-foreground">
          {formatJson(value)}
        </pre>
      )}
    </Panel>
  )
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-5 text-muted-foreground">{children}</p>
}

function StateMessage({ icon, text, tone = 'muted' }: { icon: React.ReactNode; text: string; tone?: 'muted' | 'danger' }) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-md border p-3 text-sm',
      tone === 'danger' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-muted/20 text-muted-foreground',
    )}>
      {icon}
      <span>{text}</span>
    </div>
  )
}

function runStatusVariant(status: string) {
  if (status === 'completed' || status === 'completed_with_warnings') return 'success'
  if (status === 'failed') return 'destructive'
  if (status === 'requires_action') return 'warning'
  if (status === 'cancelled') return 'outline'
  return 'secondary'
}

function summarizeRuns(runs: AgentRun[]) {
  const active = runs.filter((run) => run.status === 'queued' || run.status === 'in_progress').length
  const waiting = runs.filter((run) => run.status === 'requires_action').length
  const failed = runs.filter((run) => run.status === 'failed').length
  const attention = [...runs]
    .filter((run) => run.status === 'requires_action' || run.status === 'failed' || run.status === 'in_progress' || run.status === 'completed_with_warnings')
    .sort((a, b) => runAttentionRank(a) - runAttentionRank(b) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 8)
  const issueGroups = buildRunIssueGroups(runs)
  return { active, waiting, failed, attention, issueGroups }
}

function runAttentionRank(run: AgentRun): number {
  if (run.status === 'requires_action') return 0
  if (run.status === 'failed') return 1
  if (run.status === 'in_progress') return 2
  if (run.status === 'completed_with_warnings') return 3
  return 4
}

function buildRunIssueGroups(runs: AgentRun[]): DebugRunIssueGroup[] {
  const groupDefinitions: Array<Pick<DebugRunIssueGroup, 'id' | 'status' | 'labelKey'>> = [
    { id: 'requires_action', status: 'requires_action', labelKey: 'agents.debug.runIssueGroups.requiresAction' },
    { id: 'failed', status: 'failed', labelKey: 'agents.debug.runIssueGroups.failed' },
    { id: 'in_progress', status: 'in_progress', labelKey: 'agents.debug.runIssueGroups.inProgress' },
    { id: 'completed_with_warnings', status: 'completed_with_warnings', labelKey: 'agents.debug.runIssueGroups.completedWithWarnings' },
  ]
  return groupDefinitions.flatMap((definition) => {
    const matching = runs.filter((run) => run.status === definition.status)
    if (matching.length === 0) return []
    const newest = [...matching].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]
    return [{
      ...definition,
      count: matching.length,
      sampleReason: runIssueReason(newest),
      sampleRunId: newest.id,
    }]
  })
}

function runIssueReason(run: AgentRun): string | undefined {
  const reason = run.blockedReason
    ?? run.error
    ?? run.warnings?.[0]
    ?? ((run.pendingApprovals?.length ?? 0) > 0 ? `${run.pendingApprovals!.length} approval request(s)` : undefined)
    ?? ((run.pendingInputRequests?.length ?? 0) > 0 ? `${run.pendingInputRequests!.length} input request(s)` : undefined)
    ?? run.agentManifest?.name
    ?? run.planId
    ?? run.taskId
  return reason ? redactAgentTraceDebugText(reason) : undefined
}

function debugModelConfigValue(config: RuntimeModelConfigPublic): string {
  if (!config.configured) return '-'
  return redactAgentTraceDebugText(config.model || '-')
}

function debugModelCredentialStatusLabel(config: RuntimeModelConfigPublic, t: DebugTranslate): string {
  const status = config.credentialStatus
  if (!status?.required) return t('agents.debug.modelCredentials.notRequired')
  if (status.configured) return t('agents.debug.modelCredentials.configured', { env: status.sourceEnv.join(', ') || '-' })
  return t('agents.debug.modelCredentials.missing', { env: status.acceptedEnv.join(', ') || '-' })
}

function debugModelRouteSummary(config: RuntimeModelConfigPublic): string {
  const routes = config.capabilities ?? []
  if (routes.length === 0) return '-'
  const configured = routes.filter((route) => route.configured).map((route) => route.capability)
  return `${configured.length}/${routes.length}: ${configured.join(', ') || '-'}`
}

function collectDebugWarningGroups(debug: AgentDebugData | undefined | null, preview: AgentRunPreview | null): DebugWarningGroup[] {
  return [
    {
      source: 'capabilities' as const,
      labelKey: 'agents.debug.warningSources.capabilities',
      warnings: debug?.capabilities.warnings ?? [],
    },
    {
      source: 'catalog' as const,
      labelKey: 'agents.debug.warningSources.catalog',
      warnings: debug?.inspect.pluginCatalog?.warnings ?? [],
    },
    {
      source: 'model' as const,
      labelKey: 'agents.debug.warningSources.model',
      warnings: debug?.modelConfigError ? [debug.modelConfigError] : [],
    },
    {
      source: 'preview' as const,
      labelKey: 'agents.debug.warningSources.preview',
      warnings: preview?.warnings ?? [],
    },
  ]
    .map((group) => ({
      ...group,
      warnings: group.warnings.map((warning) => redactAgentTraceDebugText(warning)),
    }))
    .filter((group) => group.warnings.length > 0)
}

function flattenDebugWarningGroups(groups: DebugWarningGroup[]): string[] {
  return groups.flatMap((group) => group.warnings.map((warning) => `[${group.source}] ${warning}`))
}

function buildDebugObservationItems(input: {
  debug: AgentDebugData | null
  currentProject: AgentDebugProjectSnapshot
  preview: AgentRunPreview | null
  warnings: string[]
}): DebugObservationItem[] {
  const runCount = input.debug?.runs.length ?? 0
  const mcpConnected = input.debug?.capabilities.mcp.connected === true
  const modelConfig = input.debug?.modelConfig
  const modelConfigReadFailed = Boolean(input.debug?.modelConfigError)
  const modelCredentialMissing = modelConfig?.credentialStatus?.required === true && modelConfig.credentialStatus.configured !== true
  const modelObservationStatus: DebugObservationItem['status'] = !input.debug
    ? 'action'
    : modelConfigReadFailed
      ? 'warning'
    : modelConfig?.configured !== true || modelCredentialMissing
      ? 'action'
      : 'ready'
  const modelObservationDetailKey = !input.debug
    ? 'agents.debug.observationDetails.modelConfigUnavailable'
    : modelConfigReadFailed
      ? 'agents.debug.observationDetails.modelConfigReadFailed'
    : modelConfig?.configured !== true
      ? 'agents.debug.observationDetails.modelConfigMissing'
      : modelCredentialMissing
        ? 'agents.debug.observationDetails.modelCredentialMissing'
        : 'agents.debug.observationDetails.modelConfigReady'
  return [
    {
      id: 'runtime',
      status: input.debug ? 'ready' : 'action',
      labelKey: 'agents.debug.observation.runtime',
      detailKey: input.debug ? 'agents.debug.observationDetails.runtimeReady' : 'agents.debug.observationDetails.runtimeMissing',
    },
    {
      id: 'model-config',
      status: modelObservationStatus,
      labelKey: 'agents.debug.observation.modelConfig',
      detailKey: modelObservationDetailKey,
      detailValues: {
        model: modelConfig?.model ? redactAgentTraceDebugText(modelConfig.model) : '-',
        env: modelConfig?.credentialStatus?.acceptedEnv.join(', ') || '-',
        reason: input.debug?.modelConfigError ?? '-',
      },
    },
    {
      id: 'mcp',
      status: mcpConnected ? 'ready' : 'warning',
      labelKey: 'agents.debug.observation.mcp',
      detailKey: mcpConnected ? 'agents.debug.observationDetails.mcpReady' : 'agents.debug.observationDetails.mcpMissing',
    },
    {
      id: 'context',
      status: input.currentProject ? 'ready' : 'warning',
      labelKey: 'agents.debug.observation.context',
      detailKey: input.currentProject ? 'agents.debug.observationDetails.contextReady' : 'agents.debug.observationDetails.contextMissing',
      detailValues: { project: input.currentProject?.name ?? '-' },
    },
    {
      id: 'preview',
      status: input.preview?.promptPreview ? 'ready' : 'warning',
      labelKey: 'agents.debug.observation.preview',
      detailKey: input.preview?.promptPreview ? 'agents.debug.observationDetails.previewReady' : 'agents.debug.observationDetails.previewMissing',
    },
    {
      id: 'runs',
      status: runCount > 0 ? 'ready' : 'warning',
      labelKey: 'agents.debug.observation.runs',
      detailKey: runCount > 0 ? 'agents.debug.observationDetails.runsReady' : 'agents.debug.observationDetails.runsMissing',
      detailValues: { count: runCount },
    },
    {
      id: 'warnings',
      status: input.warnings.length > 0 ? 'warning' : 'ready',
      labelKey: 'agents.debug.observation.warnings',
      detailKey: input.warnings.length > 0 ? 'agents.debug.observationDetails.warningsFound' : 'agents.debug.observationDetails.warningsClear',
      detailValues: { count: input.warnings.length },
    },
  ]
}

function buildDebugTriageItems(input: {
  observationItems: DebugObservationItem[]
  runIssueGroups: DebugRunIssueGroup[]
  warningGroups: DebugWarningGroup[]
}): DebugTriageItem[] {
  const items: DebugTriageItem[] = []
  const failedRuns = input.runIssueGroups.find((group) => group.id === 'failed')
  if (failedRuns) {
    items.push({
      id: 'failed-runs',
      severity: 'action',
      titleKey: 'agents.debug.triage.failedRuns',
      detailKey: 'agents.debug.triageDetails.failedRuns',
      detailValues: { count: failedRuns.count, reason: failedRuns.sampleReason ?? '-' },
      runId: failedRuns.sampleRunId,
    })
  }
  const waitingRuns = input.runIssueGroups.find((group) => group.id === 'requires_action')
  if (waitingRuns) {
    items.push({
      id: 'requires-action-runs',
      severity: 'action',
      titleKey: 'agents.debug.triage.requiresAction',
      detailKey: 'agents.debug.triageDetails.requiresAction',
      detailValues: { count: waitingRuns.count, reason: waitingRuns.sampleReason ?? '-' },
      runId: waitingRuns.sampleRunId,
    })
  }
  const missingObservations = input.observationItems.filter((item) => item.status !== 'ready')
  for (const observation of missingObservations.slice(0, 2)) {
    items.push({
      id: `observation-${observation.id}`,
      severity: observation.status === 'action' ? 'action' : 'warning',
      titleKey: 'agents.debug.triage.observationMissing',
      detailKey: `agents.debug.triageDetails.observation.${observation.id}`,
      signalLabelKey: observation.labelKey,
    })
  }
  const warningCount = input.warningGroups.reduce((total, group) => total + group.warnings.length, 0)
  if (warningCount > 0) {
    items.push({
      id: 'warning-signals',
      severity: 'warning',
      titleKey: 'agents.debug.triage.warningSignals',
      detailKey: 'agents.debug.triageDetails.warningSignals',
      detailValues: { count: warningCount, sources: input.warningGroups.length },
    })
  }
  return items.slice(0, 5)
}

function buildDebugRemediationPlan(input: {
  observationItems: DebugObservationItem[]
  runIssueGroups: DebugRunIssueGroup[]
  warningGroups: DebugWarningGroup[]
}): DebugRemediationItem[] {
  const items: DebugRemediationItem[] = []
  const failedRuns = input.runIssueGroups.find((group) => group.id === 'failed')
  if (failedRuns) {
    items.push({
      id: 'inspect-failed-run',
      severity: 'action',
      target: failedRuns.sampleRunId ? 'run-details' : 'observe',
      titleKey: 'agents.debug.remediation.failedRuns',
      detailKey: 'agents.debug.remediationDetails.failedRuns',
      actionKey: failedRuns.sampleRunId ? 'agents.debug.actions.viewRun' : 'agents.debug.actions.observeOnly',
      detailValues: { count: failedRuns.count, reason: failedRuns.sampleReason ?? '-' },
      ...(failedRuns.sampleRunId ? { runId: failedRuns.sampleRunId } : {}),
    })
  }
  const waitingRuns = input.runIssueGroups.find((group) => group.id === 'requires_action')
  if (waitingRuns) {
    items.push({
      id: 'resolve-waiting-run',
      severity: 'action',
      target: waitingRuns.sampleRunId ? 'run-details' : 'observe',
      titleKey: 'agents.debug.remediation.requiresAction',
      detailKey: 'agents.debug.remediationDetails.requiresAction',
      actionKey: waitingRuns.sampleRunId ? 'agents.debug.actions.viewRun' : 'agents.debug.actions.observeOnly',
      detailValues: { count: waitingRuns.count, reason: waitingRuns.sampleReason ?? '-' },
      ...(waitingRuns.sampleRunId ? { runId: waitingRuns.sampleRunId } : {}),
    })
  }
  const modelObservation = input.observationItems.find((item) => item.id === 'model-config' && item.status !== 'ready')
  if (modelObservation) {
    items.push({
      id: 'fix-model-config',
      severity: modelObservation.status === 'action' ? 'action' : 'warning',
      target: 'settings',
      titleKey: 'agents.debug.remediation.modelConfig',
      detailKey: 'agents.debug.remediationDetails.modelConfig',
      actionKey: 'agents.debug.actions.openSettings',
      detailValues: modelObservation.detailValues,
    })
  }
  const previewObservation = input.observationItems.find((item) => item.id === 'preview' && item.status !== 'ready')
  if (previewObservation) {
    items.push({
      id: 'run-preview',
      severity: 'warning',
      target: 'preview',
      titleKey: 'agents.debug.remediation.preview',
      detailKey: 'agents.debug.remediationDetails.preview',
      actionKey: 'agents.debug.actions.runPreview',
    })
  }
  const mcpObservation = input.observationItems.find((item) => item.id === 'mcp' && item.status !== 'ready')
  if (mcpObservation) {
    items.push({
      id: 'inspect-mcp',
      severity: 'warning',
      target: 'observe',
      titleKey: 'agents.debug.remediation.mcp',
      detailKey: 'agents.debug.remediationDetails.mcp',
      actionKey: 'agents.debug.actions.observeOnly',
    })
  }
  const warningCount = input.warningGroups.reduce((total, group) => total + group.warnings.length, 0)
  if (warningCount > 0) {
    items.push({
      id: 'review-warning-groups',
      severity: 'warning',
      target: 'observe',
      titleKey: 'agents.debug.remediation.warningSignals',
      detailKey: 'agents.debug.remediationDetails.warningSignals',
      actionKey: 'agents.debug.actions.observeOnly',
      detailValues: { count: warningCount, sources: input.warningGroups.length },
    })
  }
  return items.slice(0, 5)
}

function buildDebugEvidenceChecklist(input: {
  debug: AgentDebugData | null
  observationItems: DebugObservationItem[]
  triageItems: DebugTriageItem[]
  remediationPlan: DebugRemediationItem[]
  runIssueGroups: DebugRunIssueGroup[]
  warningGroups: DebugWarningGroup[]
  preview: AgentRunPreview | null
}): DebugEvidenceItem[] {
  const actionObservations = input.observationItems.filter((item) => item.status === 'action').length
  const warningObservations = input.observationItems.filter((item) => item.status === 'warning').length
  const actionTriage = input.triageItems.filter((item) => item.severity === 'action').length
  const runIssueCount = input.runIssueGroups.reduce((total, group) => total + group.count, 0)
  return [
    {
      id: 'runtime',
      status: input.debug ? 'ready' : 'action',
      labelKey: 'agents.debug.evidenceChecklist.runtime',
      detailKey: input.debug ? 'agents.debug.evidenceChecklistDetails.runtimeReady' : 'agents.debug.evidenceChecklistDetails.runtimeMissing',
    },
    {
      id: 'observations',
      status: actionObservations > 0 ? 'action' : warningObservations > 0 ? 'warning' : 'ready',
      labelKey: 'agents.debug.evidenceChecklist.observations',
      detailKey: 'agents.debug.evidenceChecklistDetails.observations',
      detailValues: { actions: actionObservations, warnings: warningObservations, total: input.observationItems.length, warningSources: input.warningGroups.length },
    },
    {
      id: 'triage',
      status: actionTriage > 0 ? 'action' : input.triageItems.length > 0 ? 'warning' : 'ready',
      labelKey: 'agents.debug.evidenceChecklist.triage',
      detailKey: 'agents.debug.evidenceChecklistDetails.triage',
      detailValues: { actions: actionTriage, total: input.triageItems.length },
    },
    {
      id: 'remediation',
      status: input.remediationPlan.some((item) => item.severity === 'action') ? 'action' : input.remediationPlan.length > 0 ? 'warning' : 'ready',
      labelKey: 'agents.debug.evidenceChecklist.remediation',
      detailKey: 'agents.debug.evidenceChecklistDetails.remediation',
      detailValues: { count: input.remediationPlan.length },
    },
    {
      id: 'runs',
      status: runIssueCount > 0 ? 'warning' : input.debug && input.debug.runs.length > 0 ? 'ready' : 'warning',
      labelKey: 'agents.debug.evidenceChecklist.runs',
      detailKey: 'agents.debug.evidenceChecklistDetails.runs',
      detailValues: { issues: runIssueCount, total: input.debug?.runs.length ?? 0 },
    },
    {
      id: 'preview',
      status: input.preview ? 'ready' : 'warning',
      labelKey: 'agents.debug.evidenceChecklist.preview',
      detailKey: input.preview ? 'agents.debug.evidenceChecklistDetails.previewReady' : 'agents.debug.evidenceChecklistDetails.previewMissing',
    },
    {
      id: 'redaction',
      status: 'ready',
      labelKey: 'agents.debug.evidenceChecklist.redaction',
      detailKey: 'agents.debug.evidenceChecklistDetails.redactionReady',
    },
  ]
}

function buildDebugBundle(input: {
  baseURL: string
  currentProject: AgentDebugProjectSnapshot
  debug: AgentDebugData | null
  preview: AgentRunPreview | null
}): AgentDebugBundle {
  const warningGroups = collectDebugWarningGroups(input.debug, input.preview)
  const warnings = flattenDebugWarningGroups(warningGroups)
  const observationCoverage = buildDebugObservationItems({
    debug: input.debug,
    currentProject: input.currentProject,
    preview: input.preview,
    warnings,
  })
  const runSummary = summarizeRuns(input.debug?.runs ?? [])
  const triageItems = buildDebugTriageItems({
    observationItems: observationCoverage,
    runIssueGroups: runSummary.issueGroups,
    warningGroups,
  })
  const remediationPlan = buildDebugRemediationPlan({
    observationItems: observationCoverage,
    runIssueGroups: runSummary.issueGroups,
    warningGroups,
  })
  const evidenceChecklist = buildDebugEvidenceChecklist({
    debug: input.debug,
    observationItems: observationCoverage,
    triageItems,
    remediationPlan,
    runIssueGroups: runSummary.issueGroups,
    warningGroups,
    preview: input.preview,
  })
  return {
    schema: AGENT_DEBUG_BUNDLE_SCHEMA,
    schemaVersion: AGENT_DEBUG_BUNDLE_SCHEMA_VERSION,
    schemaUrl: AGENT_DEBUG_BUNDLE_SCHEMA_URL,
    redacted: true,
    exportedAt: new Date().toISOString(),
    baseURL: redactAgentTraceDebugText(input.baseURL),
    currentProject: redactAgentTraceDebugData(input.currentProject) as AgentDebugProjectSnapshot,
    runtime: input.debug ? redactAgentTraceDebugData(input.debug) : null,
    modelConfig: input.debug?.modelConfig ? redactAgentTraceDebugData(input.debug.modelConfig) as RuntimeModelConfigPublic : null,
    modelConfigError: input.debug?.modelConfigError ? redactAgentTraceDebugText(input.debug.modelConfigError) : null,
    lastUpdated: input.debug?.lastUpdated ?? null,
    observationCoverage,
    evidenceChecklist,
    triageItems,
    remediationPlan,
    runSummary: redactAgentTraceDebugData(runSummary) as ReturnType<typeof summarizeRuns>,
    runIssueGroups: redactAgentTraceDebugData(runSummary.issueGroups) as DebugRunIssueGroup[],
    warnings,
    warningGroups,
    preview: input.preview ? redactAgentTraceDebugData(input.preview) : null,
  }
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(redactAgentTraceDebugData(value), null, 2)
  } catch {
    return redactAgentTraceDebugText(String(value))
  }
}
