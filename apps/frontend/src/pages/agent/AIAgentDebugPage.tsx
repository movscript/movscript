import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bot, CheckCircle2, Clipboard, Loader2, Play, RefreshCw, Terminal, XCircle } from 'lucide-react'
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
  type AgentRunPreview,
} from '@/lib/localAgentClient'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/lib/utils'

type AgentDebugData = {
  health: unknown
  inspect: AgentInspectResponse
  capabilities: AgentCapabilitiesResponse
  runs: Awaited<ReturnType<typeof localAgentClient.listRuns>>['runs']
}

export default function AIAgentDebugPage() {
  const { t } = useTranslation()
  const currentProject = useProjectStore((s) => s.current)
  const [previewMessage, setPreviewMessage] = useState(t('agents.debug.defaultPreviewMessage'))
  const [preview, setPreview] = useState<AgentRunPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const debugQuery = useQuery<AgentDebugData>({
    queryKey: ['agent-debug-page', localAgentClient.baseURL, currentProject?.ID],
    queryFn: async () => {
      const health = await localAgentClient.ensureRunning()
      const [inspect, capabilities, runs] = await Promise.all([
        localAgentClient.inspect(),
        localAgentClient.getCapabilities({ ...(currentProject ? { projectId: currentProject.ID } : {}) }),
        localAgentClient.listRuns().then((result) => result.runs),
      ])
      return { health, inspect, capabilities, runs }
    },
    retry: false,
  })

  const rawData = useMemo(() => ({
    baseURL: localAgentClient.baseURL,
    currentProject: currentProject ? { id: currentProject.ID, name: currentProject.name, status: currentProject.status } : null,
    debug: debugQuery.data,
    preview,
  }), [currentProject, debugQuery.data, preview])

  const allWarnings = [
    ...(debugQuery.data?.capabilities.warnings ?? []),
    ...(debugQuery.data?.inspect.pluginCatalog?.warnings ?? []),
    ...(preview?.warnings ?? []),
  ]

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
      setPreviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function copyRawData() {
    await navigator.clipboard.writeText(formatJson(rawData))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
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
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={copyRawData}>
              <Clipboard size={13} />
              {copied ? t('agents.debug.actions.copied') : t('agents.debug.actions.copyJson')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => debugQuery.refetch()} disabled={debugQuery.isFetching}>
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
            text={debugQuery.error instanceof Error ? debugQuery.error.message : String(debugQuery.error)}
          />
        ) : debugQuery.data ? (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="overview">{t('agents.debug.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="manifest">{t('agents.debug.tabs.manifest')}</TabsTrigger>
              <TabsTrigger value="skills">{t('agents.debug.tabs.skills')}</TabsTrigger>
              <TabsTrigger value="tools">{t('agents.debug.tabs.tools')}</TabsTrigger>
              <TabsTrigger value="prompt">{t('agents.debug.tabs.prompt')}</TabsTrigger>
              <TabsTrigger value="context">{t('agents.debug.tabs.context')}</TabsTrigger>
              <TabsTrigger value="runs">{t('agents.debug.tabs.runs')}</TabsTrigger>
              <TabsTrigger value="raw">{t('agents.debug.tabs.raw')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <section className="grid gap-3 md:grid-cols-4">
                <MetricCard label={t('agents.debug.metrics.runtime')} value={runtimeOnline ? t('agents.debug.status.online') : t('agents.debug.status.offline')} />
                <MetricCard label={t('agents.debug.metrics.mcpTools')} value={String(debugQuery.data.inspect.tools.length)} />
                <MetricCard label={t('agents.debug.metrics.registeredTools')} value={String(debugQuery.data.inspect.registeredTools.length)} />
                <MetricCard label={t('agents.debug.metrics.skills')} value={String(debugQuery.data.inspect.skills.length)} />
              </section>

              <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                <Panel title={t('agents.debug.panels.runtime')}>
                  <div className="grid gap-2 text-xs md:grid-cols-2">
                    <SummaryItem label={t('agents.debug.fields.baseUrl')} value={localAgentClient.baseURL} />
                    <SummaryItem label="MCP" value={debugQuery.data.capabilities.mcp.connected ? t('agents.debug.status.online') : t('agents.debug.status.offline')} />
                    <SummaryItem label={t('agents.debug.fields.skillsDir')} value={debugQuery.data.inspect.pluginCatalog?.skillsDir ?? t('agents.debug.values.unknown')} />
                    <SummaryItem label={t('agents.debug.fields.toolsDir')} value={debugQuery.data.inspect.pluginCatalog?.toolsDir ?? t('agents.debug.values.unknown')} />
                  </div>
                  {allWarnings.length > 0 && (
                    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{t('agents.debug.panels.warnings')}</p>
                      <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                        {allWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
                      </ul>
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

            <TabsContent value="skills" className="grid gap-4 lg:grid-cols-2">
              <Panel title={t('agents.debug.panels.activatedSkills')}>
                {preview?.skills ? (
                  preview.skills.length === 0 ? <EmptyText>{t('agents.debug.empty.noSkills')}</EmptyText> : (
                    <div className="space-y-2">
                      {preview.skills.map((skill) => (
                        <ListRow
                          key={skill.id}
                          title={skill.name}
                          meta={`${skill.id} / p${skill.resolvedPriority} / ${skill.activationReason}`}
                          description={skill.description || skill.compiledInstruction || t('agents.debug.empty.noInstruction')}
                        />
                      ))}
                    </div>
                  )
                ) : <EmptyText>{t('agents.debug.empty.runPreviewHint')}</EmptyText>}
              </Panel>
              <Panel title={t('agents.debug.panels.skillCatalog')}>
                {debugQuery.data.inspect.skills.length === 0 ? <EmptyText>{t('agents.debug.empty.noSkills')}</EmptyText> : (
                  <div className="space-y-2">
                    {debugQuery.data.inspect.skills.map((skill) => (
                      <ListRow
                        key={skill.id}
                        title={skill.name}
                        meta={[skill.id, skill.kind, skill.category].filter(Boolean).join(' / ')}
                        description={skill.description || skill.instruction || t('agents.debug.empty.noDescription')}
                        trailing={<Badge variant={skill.enabled ? 'success' : 'outline'}>{skill.enabled ? t('agents.debug.status.enabled') : t('agents.debug.status.disabled')}</Badge>}
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="tools" className="space-y-4">
              <section className="grid gap-3 md:grid-cols-3">
                <MetricCard label={t('agents.debug.metrics.discovered')} value={String(debugQuery.data.capabilities.resolvedTools.discovered.length)} />
                <MetricCard label={t('agents.debug.metrics.available')} value={String(debugQuery.data.capabilities.resolvedTools.available.length)} />
                <MetricCard label={t('agents.debug.metrics.blocked')} value={String(debugQuery.data.capabilities.resolvedTools.blocked.length)} />
              </section>
              <Panel title={t('agents.debug.panels.runtime')}>
                <ToolTable tools={debugQuery.data.capabilities.resolvedTools.discovered} />
              </Panel>
            </TabsContent>

            <TabsContent value="prompt" className="grid gap-4 lg:grid-cols-2">
              <Panel title={t('agents.debug.panels.promptParts')}>
                {preview?.promptPreview ? (
                  <div className="space-y-2">
                    {preview.promptPreview.debugParts.map((part) => (
                      <div key={part.id} className="rounded-md border border-border bg-muted/20 p-2">
                        <p className="text-xs font-medium text-foreground">{part.title}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{part.kind} / {t('agents.debug.values.chars', { count: part.content.length })}</p>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[10px] leading-4">{part.content || t('agents.debug.empty.emptyValue')}</pre>
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
                      <ListRow
                        key={run.id}
                        title={run.id}
                        meta={[run.status, run.role, run.planId].filter(Boolean).join(' / ')}
                        description={run.error || run.blockedReason || run.agentManifest?.name}
                        trailing={<Badge variant={runStatusVariant(run.status)}>{run.status}</Badge>}
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="raw">
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

function ToolTable({ tools }: { tools: AgentCapabilitiesResponse['resolvedTools']['discovered'] }) {
  const { t } = useTranslation()
  if (tools.length === 0) return <EmptyText>{t('agents.debug.empty.noTools')}</EmptyText>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="border-b border-border text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className="px-2 py-2">{t('agents.debug.table.tool')}</th>
            <th className="px-2 py-2">{t('agents.debug.table.source')}</th>
            <th className="px-2 py-2">{t('agents.debug.table.risk')}</th>
            <th className="px-2 py-2">{t('agents.debug.table.permission')}</th>
            <th className="px-2 py-2">{t('agents.debug.table.approval')}</th>
            <th className="px-2 py-2">{t('agents.debug.table.status')}</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => (
            <tr key={tool.name} className="border-b border-border/60 last:border-0">
              <td className="px-2 py-2 font-medium text-foreground">{tool.name}</td>
              <td className="px-2 py-2 text-muted-foreground">{tool.source}</td>
              <td className="px-2 py-2 text-muted-foreground">{tool.risk ?? t('agents.debug.values.unknown')}</td>
              <td className="px-2 py-2 text-muted-foreground">{tool.permission ?? t('agents.debug.values.none')}</td>
              <td className="px-2 py-2 text-muted-foreground">{tool.approval}</td>
              <td className="px-2 py-2">
                <Badge variant={tool.available ? 'success' : 'warning'}>{tool.available ? t('agents.debug.status.available') : t('agents.debug.status.blocked')}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
              description={approval.reason}
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

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
