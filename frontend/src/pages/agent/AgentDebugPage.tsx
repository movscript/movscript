import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  Clipboard,
  Copy,
  Database,
  FileJson,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  Wrench,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@movscript/ui'
import { api } from '@/lib/api'
import {
  localAgentClient,
  type AgentCapabilitiesResponse,
  type AgentDebugTool,
  type AgentHealth,
  type AgentInspectResponse,
  type AgentManifest,
  type AgentRunPreview,
  type AgentSkillManifest,
  type ResolvedAgentSkill,
  type ResolvedToolCatalog,
} from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { AgentTemplate, UserAgent } from '@/store/agentStore'

export default function AgentDebugPage() {
  const { t } = useTranslation()
  const currentProject = useProjectStore((s) => s.current)
  const [selectedAgentId, setSelectedAgentId] = useState<string>('default')
  const [previewMessage, setPreviewMessage] = useState(() => t('agents.debug.defaultPreviewMessage'))
  const [copied, setCopied] = useState(false)

  const health = useQuery<AgentHealth>({
    queryKey: ['local-agent-debug-health', localAgentClient.baseURL],
    queryFn: () => localAgentClient.ensureRunning(),
    retry: false,
    refetchInterval: 5000,
  })
  const inspect = useQuery<AgentInspectResponse>({
    queryKey: ['local-agent-debug-inspect', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.inspect()
    },
    retry: false,
  })
  const capabilities = useQuery<AgentCapabilitiesResponse>({
    queryKey: ['local-agent-debug-capabilities', localAgentClient.baseURL, currentProject?.ID ?? null],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.getCapabilities({
        ...(currentProject?.ID ? { projectId: currentProject.ID } : {}),
      })
    },
    retry: false,
  })
  const { data: userAgents = [] } = useQuery<UserAgent[]>({
    queryKey: ['agents', 'my'],
    queryFn: () => api.get('/agents/my').then((r) => r.data),
  })
  const { data: templates = [] } = useQuery<AgentTemplate[]>({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then((r) => r.data),
  })

  const effectiveAgents = useMemo(() => {
    return userAgents.map((agent) => {
      if (!agent.accept_platform_updates || !agent.source_template_id) return agent
      const template = templates.find((item) => item.id === agent.source_template_id)
      return template
        ? { ...agent, soul: template.soul, skills: template.skills, platform_model_id: template.platform_model_id }
        : agent
    })
  }, [templates, userAgents])

  const selectedAgent = selectedAgentId === 'default'
    ? null
    : effectiveAgents.find((agent) => String(agent.id) === selectedAgentId) ?? null
  const agentManifest = useMemo(() => buildLocalAgentManifest(selectedAgent), [selectedAgent])

  const preview = useMutation<AgentRunPreview, Error>({
    mutationFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.previewRun({
        message: previewMessage.trim() || t('agents.debug.defaultPreviewMessage'),
        ...(agentManifest ? { agentManifest } : {}),
      })
    },
  })

  const selectedTools = preview.data?.tools ?? capabilities.data?.resolvedTools
  const selectedSkills = preview.data?.skills ?? inspect.data?.skills ?? []
  const selectedManifest = preview.data?.agentManifest ?? agentManifest ?? inspect.data?.defaultAgentManifest
  const warnings = [
    ...(health.data?.pluginCatalog?.warnings ?? []),
    ...(inspect.data?.pluginCatalog?.warnings ?? []),
    ...(capabilities.data?.warnings ?? []),
    ...(preview.data?.warnings ?? []),
  ].filter((warning, index, all) => all.indexOf(warning) === index)
  const rawPayload = useMemo(() => safeJSONStringify({
    health: health.data,
    inspect: inspect.data,
    capabilities: capabilities.data,
    selectedAgent: selectedAgent ? { id: selectedAgent.id, name: selectedAgent.name } : null,
    selectedManifest,
    preview: preview.data,
    previewError: preview.error?.message,
  }), [capabilities.data, health.data, inspect.data, preview.data, preview.error, selectedAgent, selectedManifest])

  async function copyRaw() {
    await navigator.clipboard.writeText(rawPayload)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-background px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <TerminalSquare size={18} />
              <h2 className="text-base font-semibold text-foreground">{t('agents.debug.title')}</h2>
              <Badge variant={health.data?.ok ? 'success' : 'warning'} className="text-[10px]">
                {health.data?.ok ? t('agents.debug.status.runtimeOnline') : health.isFetching ? t('agents.debug.status.checking') : t('agents.debug.status.runtimeOffline')}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('agents.debug.description')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                health.refetch()
                inspect.refetch()
                capabilities.refetch()
              }}
              disabled={health.isFetching || inspect.isFetching || capabilities.isFetching}
            >
              <RefreshCw size={13} />
              {t('agents.debug.actions.refresh')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={copyRaw}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? t('agents.debug.actions.copied') : t('agents.debug.actions.copyJson')}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] overflow-hidden">
        <aside className="overflow-y-auto border-r border-border bg-muted/10 p-4">
          <div className="space-y-4">
            <Panel title={t('agents.debug.panels.runtime')} icon={<Activity size={14} />}>
              <div className="space-y-2 text-xs">
                <KeyValue label={t('agents.debug.fields.baseUrl')} value={localAgentClient.baseURL} />
                <KeyValue label="MCP" value={health.data?.mcpEndpoint ?? inspect.data?.mcpEndpoint ?? t('agents.debug.values.unknown')} />
                <KeyValue label={t('agents.debug.fields.skillsDir')} value={health.data?.pluginCatalog?.skillsDir ?? inspect.data?.pluginCatalog?.skillsDir ?? t('agents.debug.values.unknown')} />
                <KeyValue label={t('agents.debug.fields.toolsDir')} value={health.data?.pluginCatalog?.toolsDir ?? inspect.data?.pluginCatalog?.toolsDir ?? t('agents.debug.values.unknown')} />
              </div>
            </Panel>

            <Panel title={t('agents.debug.panels.previewInput')} icon={<Bot size={14} />}>
              <div className="space-y-2">
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue placeholder={t('agents.debug.fields.agentManifest')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t('agents.debug.defaultRuntimeManifest')}</SelectItem>
                    {effectiveAgents.map((agent) => (
                      <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={previewMessage}
                  onChange={(event) => setPreviewMessage(event.target.value)}
                  rows={5}
                  className="resize-none text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  onClick={() => preview.mutate()}
                  disabled={preview.isPending}
                >
                  {preview.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  {t('agents.debug.actions.runPreview')}
                </Button>
                {preview.error && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                    {preview.error.message}
                  </p>
                )}
              </div>
            </Panel>

            {warnings.length > 0 && (
              <Panel title={t('agents.debug.panels.warnings')} icon={<AlertTriangle size={14} />}>
                <div className="space-y-1">
                  {warnings.map((warning) => (
                    <p key={warning} className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                      {warning}
                    </p>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </aside>

        <main className="min-w-0 overflow-y-auto p-6">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="flex h-auto w-full justify-start overflow-x-auto rounded-md border border-border bg-background p-1">
              <TabsTrigger value="overview" className="gap-1.5 text-xs"><Activity size={12} /> {t('agents.debug.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="manifest" className="gap-1.5 text-xs"><SlidersHorizontal size={12} /> {t('agents.debug.tabs.manifest')}</TabsTrigger>
              <TabsTrigger value="skills" className="gap-1.5 text-xs"><Clipboard size={12} /> {t('agents.debug.tabs.skills')}</TabsTrigger>
              <TabsTrigger value="tools" className="gap-1.5 text-xs"><Wrench size={12} /> {t('agents.debug.tabs.tools')}</TabsTrigger>
              <TabsTrigger value="prompt" className="gap-1.5 text-xs"><FileJson size={12} /> {t('agents.debug.tabs.prompt')}</TabsTrigger>
              <TabsTrigger value="context" className="gap-1.5 text-xs"><Database size={12} /> {t('agents.debug.tabs.context')}</TabsTrigger>
              <TabsTrigger value="plan" className="gap-1.5 text-xs"><ShieldCheck size={12} /> {t('agents.debug.tabs.runs')}</TabsTrigger>
              <TabsTrigger value="raw" className="gap-1.5 text-xs"><TerminalSquare size={12} /> {t('agents.debug.tabs.raw')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-0">
              <OverviewTab
                health={health.data}
                inspect={inspect.data}
                capabilities={capabilities.data}
                preview={preview.data}
                loading={health.isFetching || inspect.isFetching || capabilities.isFetching}
              />
            </TabsContent>

            <TabsContent value="manifest" className="mt-0">
              <ManifestTab manifest={selectedManifest} defaultManifest={inspect.data?.defaultAgentManifest} />
            </TabsContent>

            <TabsContent value="skills" className="mt-0">
              <SkillsTab skills={selectedSkills} catalog={inspect.data?.skills ?? []} />
            </TabsContent>

            <TabsContent value="tools" className="mt-0">
              <ToolsTab catalog={selectedTools} mcpCount={inspect.data?.tools?.length ?? 0} registryCount={inspect.data?.registeredTools?.length ?? 0} />
            </TabsContent>

            <TabsContent value="prompt" className="mt-0">
              <PromptTab preview={preview.data} />
            </TabsContent>

            <TabsContent value="context" className="mt-0">
              <ContextTab preview={preview.data} projectName={currentProject?.name} />
            </TabsContent>

            <TabsContent value="plan" className="mt-0">
              <PlanTab preview={preview.data} />
            </TabsContent>

            <TabsContent value="raw" className="mt-0">
              <CodeBlock value={rawPayload} maxHeight="70vh" />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  )
}

function OverviewTab({
  health,
  inspect,
  capabilities,
  preview,
  loading,
}: {
  health?: AgentHealth
  inspect?: AgentInspectResponse
  capabilities?: AgentCapabilitiesResponse
  preview?: AgentRunPreview
  loading: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label={t('agents.debug.metrics.runtime')} value={health?.ok ? t('agents.debug.status.online') : loading ? t('agents.debug.status.checking') : t('agents.debug.status.offline')} tone={health?.ok ? 'success' : 'warning'} />
        <Metric label={t('agents.debug.metrics.mcpTools')} value={String(inspect?.tools?.length ?? capabilities?.mcp?.tools?.length ?? 0)} />
        <Metric label={t('agents.debug.metrics.registeredTools')} value={String(inspect?.registeredTools?.length ?? capabilities?.registry?.length ?? 0)} />
        <Metric label={t('agents.debug.metrics.skills')} value={String(inspect?.skills?.length ?? health?.pluginCatalog?.skillCount ?? 0)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('agents.debug.panels.mcpResources')} icon={<Database size={14} />}>
          <List values={(inspect?.resources ?? capabilities?.mcp?.resources ?? []).map((resource) => resource.name || resource.uri)} empty={t('agents.debug.empty.noResources')} />
        </Panel>
        <Panel title={t('agents.debug.panels.latestPreview')} icon={<Play size={14} />}>
          {preview ? (
            <div className="space-y-2 text-xs">
              <KeyValue label={t('agents.debug.fields.preview')} value={preview.id} />
              <KeyValue label={t('agents.debug.fields.project')} value={preview.currentProjectId ? `#${preview.currentProjectId}` : t('agents.debug.values.none')} />
              <KeyValue label={t('agents.debug.fields.memoryCount')} value={String(preview.memoryCount)} />
              <KeyValue label={t('agents.debug.fields.toolCalls')} value={String(preview.toolCalls?.length ?? 0)} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('agents.debug.empty.runPreviewHint')}</p>
          )}
        </Panel>
      </div>
    </div>
  )
}

function ManifestTab({ manifest, defaultManifest }: { manifest?: AgentManifest; defaultManifest?: AgentManifest }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title={t('agents.debug.panels.effectiveManifest')} icon={<SlidersHorizontal size={14} />}>
        {manifest ? <CodeBlock value={safeJSONStringify(manifest)} /> : <EmptyState text={t('agents.debug.empty.noManifest')} />}
      </Panel>
      <Panel title={t('agents.debug.panels.defaultManifest')} icon={<Bot size={14} />}>
        {defaultManifest ? <CodeBlock value={safeJSONStringify(defaultManifest)} /> : <EmptyState text={t('agents.debug.empty.noDefaultManifest')} />}
      </Panel>
    </div>
  )
}

function SkillsTab({
  skills,
  catalog,
}: {
  skills: Array<ResolvedAgentSkill | AgentSkillManifest>
  catalog: AgentSkillManifest[]
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <Panel title={t('agents.debug.panels.activatedSkills')} icon={<Clipboard size={14} />}>
        <SkillList skills={skills} activated />
      </Panel>
      <Panel title={t('agents.debug.panels.skillCatalog')} icon={<Database size={14} />}>
        <SkillList skills={catalog} />
      </Panel>
    </div>
  )
}

function SkillList({ skills, activated = false }: { skills: Array<ResolvedAgentSkill | AgentSkillManifest>; activated?: boolean }) {
  const { t } = useTranslation()
  if (skills.length === 0) return <EmptyState text={t('agents.debug.empty.noSkills')} />
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {skills.map((skill) => {
        const resolved = skill as Partial<ResolvedAgentSkill>
        return (
          <div key={skill.id} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="truncate text-sm font-medium text-foreground">{skill.name}</h3>
                  <Badge variant={skill.enabled ? 'success' : 'secondary'} className="text-[9px]">
                    {skill.enabled ? t('agents.debug.status.enabled') : t('agents.debug.status.disabled')}
                  </Badge>
                  {activated && resolved.activationReason && (
                    <Badge variant="outline" className="text-[9px]">{resolved.activationReason}</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{skill.description || t('agents.debug.empty.noDescription')}</p>
              </div>
              {typeof resolved.resolvedPriority === 'number' && (
                <Badge variant="secondary" className="shrink-0 text-[9px]">p{resolved.resolvedPriority}</Badge>
              )}
            </div>
            <CodeBlock value={(resolved.compiledInstruction || skill.instruction || '').trim() || t('agents.debug.empty.noInstruction')} maxHeight="160px" className="mt-2" />
            {resolved.warnings && resolved.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {resolved.warnings.map((warning) => (
                  <p key={warning} className="text-[11px] text-amber-700 dark:text-amber-300">{warning}</p>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ToolsTab({
  catalog,
  mcpCount,
  registryCount,
}: {
  catalog?: ResolvedToolCatalog
  mcpCount: number
  registryCount: number
}) {
  const { t } = useTranslation()
  if (!catalog) return <EmptyState text={t('agents.debug.empty.noToolCatalog')} />
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="MCP" value={String(mcpCount)} />
        <Metric label={t('agents.debug.metrics.registry')} value={String(registryCount)} />
        <Metric label={t('agents.debug.metrics.discovered')} value={String(catalog.discovered?.length ?? 0)} />
        <Metric label={t('agents.debug.metrics.available')} value={String(catalog.available?.length ?? 0)} tone="success" />
        <Metric label={t('agents.debug.metrics.blocked')} value={String(catalog.blocked?.length ?? 0)} tone={(catalog.blocked?.length ?? 0) ? 'warning' : 'neutral'} />
      </div>
      <ToolTable tools={catalog.discovered ?? []} />
    </div>
  )
}

function ToolTable({ tools }: { tools: AgentDebugTool[] }) {
  const { t } = useTranslation()
  if (tools.length === 0) return <EmptyState text={t('agents.debug.empty.noTools')} />
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full min-w-[860px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{t('agents.debug.table.tool')}</th>
            <th className="px-3 py-2">{t('agents.debug.table.source')}</th>
            <th className="px-3 py-2">{t('agents.debug.table.risk')}</th>
            <th className="px-3 py-2">{t('agents.debug.table.permission')}</th>
            <th className="px-3 py-2">{t('agents.debug.table.approval')}</th>
            <th className="px-3 py-2">{t('agents.debug.table.status')}</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => (
            <tr key={tool.name} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">{tool.name}</div>
                {tool.description && <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{tool.description}</div>}
              </td>
              <td className="px-3 py-2"><Badge variant="outline" className="text-[9px]">{tool.source}</Badge></td>
              <td className="px-3 py-2">{tool.risk ?? t('agents.debug.values.unknown')}</td>
              <td className="px-3 py-2">{tool.permission ?? '-'}</td>
              <td className="px-3 py-2">{tool.approval}{tool.requiresApproval ? ` · ${t('agents.debug.values.required')}` : ''}</td>
              <td className="px-3 py-2">
                <Badge variant={tool.available ? 'success' : 'warning'} className="text-[9px]">
                  {tool.available ? t('agents.debug.status.available') : tool.unavailableReason ?? t('agents.debug.status.blocked')}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PromptTab({ preview }: { preview?: AgentRunPreview }) {
  const { t } = useTranslation()
  if (!preview?.promptPreview) return <EmptyState text={t('agents.debug.empty.runPromptPreviewHint')} />
  return (
    <div className="space-y-4">
      <Panel title={t('agents.debug.panels.promptParts')} icon={<FileJson size={14} />}>
        <div className="space-y-2">
          {(preview.promptPreview.debugParts ?? []).map((part) => (
            <div key={part.id} className="rounded-md border border-border bg-background">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Badge variant="outline" className="text-[9px]">{part.kind}</Badge>
                <span className="text-xs font-medium text-foreground">{part.title}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{part.id}</span>
              </div>
              <CodeBlock value={part.content || t('agents.debug.empty.emptyValue')} maxHeight="220px" className="rounded-none border-0 bg-muted/20" />
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={t('agents.debug.panels.outboundMessages')} icon={<TerminalSquare size={14} />}>
        <div className="space-y-2">
          {(preview.promptPreview.messages ?? []).map((message, index) => (
            <div key={`${message.role}-${index}`} className="rounded-md border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <Badge variant="outline" className="text-[9px]">{message.role}</Badge>
                <span className="text-[10px] text-muted-foreground">{t('agents.debug.values.chars', { count: message.content?.length ?? 0 })}</span>
              </div>
              <CodeBlock value={message.content || t('agents.debug.empty.emptyValue')} maxHeight="220px" className="rounded-none border-0 bg-muted/20" />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function ContextTab({ preview, projectName }: { preview?: AgentRunPreview; projectName?: string }) {
  const { t } = useTranslation()
  if (!preview?.context) {
    return (
      <Panel title={t('agents.debug.panels.currentProject')} icon={<Database size={14} />}>
        <p className="text-xs text-muted-foreground">
          {projectName ? t('agents.debug.values.currentProject', { name: projectName }) : t('agents.debug.empty.noProject')} {t('agents.debug.empty.runContextPreviewHint')}
        </p>
      </Panel>
    )
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title={t('agents.debug.panels.contextSummary')} icon={<Database size={14} />}>
        <div className="space-y-2 text-xs">
          <KeyValue label={t('agents.debug.fields.route')} value={preview.context.route?.pathname ?? t('agents.debug.values.unknown')} />
          <KeyValue label={t('agents.debug.fields.project')} value={preview.context.project ? `#${preview.context.project.id} ${preview.context.project.name ?? ''}`.trim() : t('agents.debug.values.none')} />
          <KeyValue label={t('agents.debug.fields.selection')} value={preview.context.selection ? `${preview.context.selection.entityType}#${preview.context.selection.entityId}` : t('agents.debug.values.none')} />
          <KeyValue label={t('agents.debug.fields.recentResources')} value={String(preview.context.recentResources?.length ?? 0)} />
          <KeyValue label={t('agents.debug.fields.attachments')} value={String(preview.context.attachments?.length ?? 0)} />
          <KeyValue label={t('agents.debug.fields.memories')} value={String(preview.context.memories?.length ?? 0)} />
        </div>
      </Panel>
      <Panel title={t('agents.debug.panels.contextJson')} icon={<FileJson size={14} />}>
        <CodeBlock value={safeJSONStringify(preview.context)} maxHeight="520px" />
      </Panel>
    </div>
  )
}

function PlanTab({ preview }: { preview?: AgentRunPreview }) {
  const { t } = useTranslation()
  if (!preview) return <EmptyState text={t('agents.debug.empty.runPlanPreviewHint')} />
  return (
    <div className="space-y-4">
      <Panel title={t('agents.debug.panels.plan')} icon={<ShieldCheck size={14} />}>
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">{preview.plan.objective}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{preview.plan.strategy}</p>
          </div>
          <div className="space-y-2">
            {(preview.plan.tasks ?? []).map((task, index) => (
              <div key={task.id} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">{index + 1}. {task.title}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
                  </div>
                  <Badge variant={task.status === 'skipped' ? 'warning' : 'outline'} className="text-[9px]">{task.status}</Badge>
                </div>
                {(task.toolCalls?.length ?? 0) > 0 && (
                  <CodeBlock value={safeJSONStringify(task.toolCalls)} maxHeight="160px" className="mt-2" />
                )}
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title={t('agents.debug.panels.approvals')} icon={<AlertTriangle size={14} />}>
        {(preview.pendingApprovals?.length ?? 0) === 0 ? (
          <EmptyState text={t('agents.debug.empty.noApprovals')} />
        ) : (
          <div className="space-y-2">
            {(preview.pendingApprovals ?? []).map((approval) => (
              <div key={approval.id} className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{approval.toolName}</span>
                  <Badge variant="warning" className="text-[9px]">{approval.status}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{approval.reason}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'warning' }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn(
        'mt-1 text-xl font-semibold',
        tone === 'success' && 'text-green-600',
        tone === 'warning' && 'text-amber-600',
        tone === 'neutral' && 'text-foreground',
      )}>
        {value}
      </div>
    </div>
  )
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-[11px] text-foreground" title={value}>{value}</div>
    </div>
  )
}

function List({ values, empty }: { values: string[]; empty: string }) {
  const { t } = useTranslation()
  if (values.length === 0) return <EmptyState text={empty} />
  return (
    <div className="space-y-1">
      {values.slice(0, 16).map((value) => (
        <div key={value} className="truncate rounded border border-border/60 bg-muted/20 px-2 py-1 font-mono text-[11px] text-foreground" title={value}>
          {value}
        </div>
      ))}
      {values.length > 16 && <p className="text-[11px] text-muted-foreground">{t('agents.debug.values.more', { count: values.length - 16 })}</p>}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  )
}

function CodeBlock({ value, maxHeight = '360px', className }: { value: string; maxHeight?: string; className?: string }) {
  return (
    <pre
      className={cn('overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-foreground', className)}
      style={{ maxHeight }}
    >
      {value}
    </pre>
  )
}

function buildLocalAgentManifest(agent: UserAgent | null): AgentManifest | undefined {
  if (!agent) return undefined
  const skills = (agent.skills ?? []).map((skill, index) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    enabled: true,
    priority: (agent.skills?.length ?? 0) - index,
    instruction: skill.description,
    metadata: {
      source: 'movscript-ui',
    },
  }))
  return {
    schema: 'movscript.agent.v2',
    id: `movscript.ui-agent.${agent.id}`,
    version: String(agent.updated_at || 1),
    name: agent.name,
    description: agent.soul || undefined,
    soul: agent.soul || undefined,
    skills,
    permissions: ['project.read', 'draft.read', 'draft.write', 'ui.navigate'],
    tools: [
      { name: 'movscript.search_entities', mode: 'allow', approval: 'never' },
      { name: 'movscript.read_entity', mode: 'allow', approval: 'never' },
      { name: 'movscript.create_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript.list_drafts', mode: 'allow', approval: 'never' },
      { name: 'movscript.open_entity', mode: 'allow', approval: 'never' },
    ],
    ...(agent.platform_model_id ? { model: { provider: 'movscript', platformModelId: agent.platform_model_id } } : {}),
    metadata: {
      source: 'movscript-ui',
      skillIds: (agent.skills ?? []).map((skill) => skill.id),
    },
  }
}

function safeJSONStringify(value: unknown): string {
  return JSON.stringify(redact(value), null, 2)
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/api[_-]?key|authorization|token|secret|password/i.test(key)) {
      out[key] = '[redacted]'
    } else {
      out[key] = redact(item)
    }
  }
  return out
}
