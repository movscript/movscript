import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, CheckCircle2, Clipboard, Download, Loader2, Play, RefreshCw, Settings, Terminal, XCircle } from 'lucide-react'
import {
  AgentDataBlock,
  AgentDebugActionButton,
  AgentDebugActionRow,
  AgentDebugBadge,
  AgentDebugBlockLink,
  AgentDebugCallout,
  AgentDebugCodeBlock,
  AgentDebugEmptyText,
  AgentDebugFieldLabel,
  AgentDebugFormField,
  AgentDebugGrid,
  AgentDebugHeaderActions,
  AgentDebugHeaderContent,
  AgentDebugHeaderCopy,
  AgentDebugHeaderDescription,
  AgentDebugHeaderTitle,
  AgentDebugHeaderTitleRow,
  AgentDebugIcon,
  AgentDebugInlineLink,
  AgentDebugInlineMeta,
  AgentDebugIssueList,
  AgentDebugItemDetail,
  AgentDebugItemTitle,
  AgentDebugJsonPanel,
  AgentDebugKeyValue,
  AgentDebugListRow,
  AgentDebugMetricCard,
  AgentDebugNativeSelect,
  AgentDebugPanel,
  AgentDebugRunListRow,
  AgentDebugScopeRail,
  AgentDebugSeverityBlock,
  AgentDebugStack,
  AgentDebugStateMessage,
  AgentDebugStatusBadge,
  AgentDebugStatusIcon,
  AgentDebugStatusRow,
  AgentDebugTabs,
  AgentDebugTabsContent,
  AgentDebugTabsList,
  AgentDebugTextarea,
  AgentDebugToneText,
  AppInlineError,
  AppPageShell,
  AppPageShellBody,
  AppPageShellHeader,
  TabsTrigger,
} from '@movscript/ui'
import {
  localAgentClient,
  type AgentDraft,
  type AgentCapabilitiesResponse,
  type AgentInspectResponse,
  type AgentRun,
  type AgentRunPreview,
  type AgentToolCall,
  type RuntimeModelConfigPublic,
} from '@/shared/infrastructure/localAgentClient'
import { api } from '@/shared/infrastructure/api'
import { projectListQueryKey } from '@/features/project/application/projectQueries'
import { redactAgentTraceDebugData, redactAgentTraceDebugText } from '@/features/agent/domain/agentTraceDebugData'
import {
  agentAvailabilityStatusRecipe,
  agentRunStatusRecipe,
  agentSeverityStatusRecipe,
} from '@/features/agent/presentation/agentSemanticUi'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES, agentRunPath } from '@/routes/projectRoutes'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import type { Project } from '@/types'

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
type AgentToolConsoleResult = {
  run: AgentRun
  trace?: Awaited<ReturnType<typeof localAgentClient.getRunTraceEvents>>
}
const DRAFT_RUNTIME_TOOL_NAMES = [
  'draft_model_get',
  'draft_create',
  'draft_apply_preview',
] as const
const DRAFT_ID_REQUIRED_TOOLS = new Set<string>([
  'draft_apply_preview',
])
const DEBUG_SUMMARY_MAX_DEPTH = 5
const DEBUG_SUMMARY_MAX_FIELDS = 32
const DEBUG_SUMMARY_MAX_ARRAY_ITEMS = 8
const DEBUG_SUMMARY_MAX_STRING_CHARS = 1400
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
  remediationTaskGraph: DebugRemediationItem[]
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
  const setCurrentProject = useProjectStore((s) => s.setCurrent)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const [previewMessage, setPreviewMessage] = useState(t('agents.debug.defaultPreviewMessage'))
  const [preview, setPreview] = useState<AgentRunPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [toolName, setToolName] = useState('')
  const [toolArgsText, setToolArgsText] = useState('{}')
  const [toolRunLoading, setToolRunLoading] = useState(false)
  const [toolRunError, setToolRunError] = useState<string | null>(null)
  const [toolRunResult, setToolRunResult] = useState<AgentToolConsoleResult | null>(null)
  const [draftToolName, setDraftToolName] = useState('draft_create')
  const [draftToolArgsText, setDraftToolArgsText] = useState(formatJson(defaultCreateAssetProposalDraftArgs(currentProject?.ID)))
  const [draftToolRunLoading, setDraftToolRunLoading] = useState(false)
  const [draftToolRunError, setDraftToolRunError] = useState<string | null>(null)
  const [draftToolRunResult, setDraftToolRunResult] = useState<AgentToolConsoleResult | null>(null)
  const [draftRuntimeLastDraftId, setDraftRuntimeLastDraftId] = useState<string | null>(null)
  const [draftRuntimeDraft, setDraftRuntimeDraft] = useState<AgentDraft | null>(null)
  const [draftRuntimeDraftError, setDraftRuntimeDraftError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [triageCopied, setTriageCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const projectsQuery = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const debugProject = useMemo(() => {
    if (currentProject) return currentProject
    return projectsQuery.data?.[0] ?? null
  }, [currentProject, projectsQuery.data])

  useEffect(() => {
    const projects = projectsQuery.data ?? []
    if (projects.length === 0) return
    if (currentProject && projects.some((project) => project.ID === currentProject.ID)) return
    setCurrentProject(projects[0])
  }, [currentProject, projectsQuery.data, setCurrentProject])

  useEffect(() => {
    if (draftToolName !== 'draft_create') return
    setDraftToolArgsText((current) => {
      let parsed: Record<string, unknown>
      try {
        parsed = parseToolArgs(current)
      } catch {
        return current
      }
      if (parsed.projectId === debugProject?.ID) return current
      if (isDefaultCreateAssetProposalDraftArgs(parsed)) return formatJson(defaultCreateAssetProposalDraftArgs(debugProject?.ID))
      if (isDefaultCreateProductionProposalDraftArgs(parsed)) return formatJson(defaultCreateProductionProposalDraftArgs(debugProject?.ID))
      return current
    })
  }, [debugProject?.ID, draftToolName])

  useEffect(() => {
    if (!draftRuntimeLastDraftId || !DRAFT_ID_REQUIRED_TOOLS.has(draftToolName)) return
    setDraftToolArgsText((current) => {
      let parsed: Record<string, unknown>
      try {
        parsed = parseToolArgs(current)
      } catch {
        return current
      }
      if (typeof parsed.draftId === 'string' && parsed.draftId.trim()) return current
      return formatJson(defaultDraftRuntimeToolArgs(draftToolName, draftRuntimeLastDraftId))
    })
  }, [draftRuntimeLastDraftId, draftToolName])

  const debugQuery = useQuery<AgentDebugData>({
    queryKey: ['agent-debug-page', localAgentClient.baseURL, debugProject?.ID],
    queryFn: async () => {
      const health = await localAgentClient.ensureRunning()
      const [inspect, capabilities, modelConfigResult, runs] = await Promise.all([
        localAgentClient.inspect(),
        localAgentClient.getCapabilities({ ...(debugProject ? { projectId: debugProject.ID } : {}) }),
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
    debugProject ? { id: debugProject.ID, name: debugProject.name, status: debugProject.status } : null
  ), [debugProject])
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
  const remediationTaskGraph = rawData.remediationTaskGraph
  const availableTools = useMemo(() => {
    const tools = (debugQuery.data?.capabilities.resolvedTools.available ?? [])
      .filter((tool) => tool.source === 'mcp')
    return [...tools].sort((a, b) => a.name.localeCompare(b.name))
  }, [debugQuery.data?.capabilities.resolvedTools.available])
  const selectedTool = useMemo(() => availableTools.find((tool) => tool.name === toolName) ?? null, [availableTools, toolName])
  const draftRuntimeTools = useMemo(() => {
    const allowed = new Set<string>(DRAFT_RUNTIME_TOOL_NAMES)
    const tools = (debugQuery.data?.capabilities.resolvedTools.discovered ?? [])
      .filter((tool) => tool.source === 'runtime' && allowed.has(tool.name))
    return [...tools].sort((a, b) => DRAFT_RUNTIME_TOOL_NAMES.indexOf(a.name as typeof DRAFT_RUNTIME_TOOL_NAMES[number]) - DRAFT_RUNTIME_TOOL_NAMES.indexOf(b.name as typeof DRAFT_RUNTIME_TOOL_NAMES[number]))
  }, [debugQuery.data?.capabilities.resolvedTools.discovered])
  const selectedDraftTool = useMemo(() => draftRuntimeTools.find((tool) => tool.name === draftToolName) ?? null, [draftRuntimeTools, draftToolName])

  useEffect(() => {
    if (availableTools.length === 0) return
    if (availableTools.some((tool) => tool.name === toolName)) return
    setToolName(availableTools[0].name)
  }, [availableTools, toolName])

  useEffect(() => {
    if (draftRuntimeTools.length === 0) return
    if (draftRuntimeTools.some((tool) => tool.name === draftToolName)) return
    setDraftToolName(draftRuntimeTools[0].name)
  }, [draftRuntimeTools, draftToolName])

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
            project: debugProject
              ? {
                id: debugProject.ID,
                name: debugProject.name,
                status: debugProject.status,
                description: debugProject.description,
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

  async function runToolConsole() {
    setToolRunLoading(true)
    setToolRunError(null)
    setToolRunResult(null)
    try {
      const parsed = parseToolArgs(toolArgsText)
      const result = await localAgentClient.runMessageStream({
        title: `Debug tool: ${toolName}`,
        message: `Run ${toolName} from Agent Debug tool console.`,
        toolCall: { name: toolName, args: parsed as AgentToolCall['args'] },
        approvedToolNames: [toolName],
        clientInput: {
          message: `Run ${toolName}`,
          uiSnapshot: {
            route: {
              pathname: window.location.pathname,
              search: window.location.search,
              hash: window.location.hash,
            },
            project: debugProject
              ? {
                id: debugProject.ID,
                name: debugProject.name,
                status: debugProject.status,
                description: debugProject.description,
              }
              : undefined,
            labels: ['agent-debug', 'tool-console'],
          },
        },
      }, {
        runPolicy: { approvalMode: 'auto', maxToolCalls: 1, maxIterations: 2 },
        timeoutMs: 90_000,
        onRunUpdate: (latestRun) => setToolRunResult((current) => ({ ...(current ?? {}), run: latestRun })),
      })
      const completedRun = result.run
      const trace = await localAgentClient.getRunTraceEvents(completedRun.id, { limit: 80 })
      setToolRunResult({ run: completedRun, trace })
      void debugQuery.refetch()
    } catch (error) {
      setToolRunError(redactAgentTraceDebugText(error instanceof Error ? error.message : String(error)))
    } finally {
      setToolRunLoading(false)
    }
  }

  async function refreshToolRunTrace() {
    if (!toolRunResult?.run.id) return
    setToolRunLoading(true)
    setToolRunError(null)
    try {
      const [run, trace] = await Promise.all([
        localAgentClient.getRun(toolRunResult.run.id),
        localAgentClient.getRunTraceEvents(toolRunResult.run.id, { limit: 80 }),
      ])
      setToolRunResult({ run, trace })
    } catch (error) {
      setToolRunError(redactAgentTraceDebugText(error instanceof Error ? error.message : String(error)))
    } finally {
      setToolRunLoading(false)
    }
  }

  async function runDraftRuntimeTool() {
    setDraftToolRunLoading(true)
    setDraftToolRunError(null)
    setDraftToolRunResult(null)
    setDraftRuntimeDraft(null)
    setDraftRuntimeDraftError(null)
    try {
      const parsed = normalizeDraftRuntimeToolArgs(
        draftToolName,
        parseToolArgs(draftToolArgsText),
        {
          projectId: debugProject?.ID,
          draftId: draftRuntimeLastDraftId ?? undefined,
        },
      )
      setDraftToolArgsText(formatJson(parsed))
      validateDraftRuntimeToolArgs(draftToolName, parsed)
      const productionId = draftRuntimeDebugProductionId(parsed)
      const result = await localAgentClient.runMessageStream({
        title: `Draft runtime debug: ${draftToolName}`,
        message: `Run ${draftToolName} from Agent Debug draft runtime panel.`,
        toolCall: { name: draftToolName, args: parsed as AgentToolCall['args'] },
        approvedToolNames: [draftToolName],
        clientInput: {
          message: `Run ${draftToolName}`,
          uiSnapshot: {
            route: {
              pathname: window.location.pathname,
              search: window.location.search,
              hash: window.location.hash,
            },
            project: debugProject
              ? {
                id: debugProject.ID,
                name: debugProject.name,
                status: debugProject.status,
                description: debugProject.description,
              }
              : undefined,
            ...(productionId !== undefined ? { productionId } : {}),
            labels: draftRuntimeDebugLabels(parsed),
          },
        },
      }, {
        runPolicy: { approvalMode: 'auto', maxToolCalls: 1, maxIterations: 2 },
        timeoutMs: 90_000,
        onRunUpdate: (latestRun) => setDraftToolRunResult((current) => ({ ...(current ?? {}), run: latestRun })),
      })
      const completedRun = result.run
      const trace = await localAgentClient.getRunTraceEvents(completedRun.id, { limit: 80 })
      setDraftToolRunResult({ run: completedRun, trace })
      const draftId = extractDraftIdFromToolRun(completedRun)
      if (draftId) {
        setDraftRuntimeLastDraftId(draftId)
        try {
          setDraftRuntimeDraft(await localAgentClient.getDraft(draftId))
        } catch (draftError) {
          setDraftRuntimeDraftError(redactAgentTraceDebugText(draftError instanceof Error ? draftError.message : String(draftError)))
        }
      }
      void debugQuery.refetch()
    } catch (error) {
      setDraftToolRunError(redactAgentTraceDebugText(error instanceof Error ? error.message : String(error)))
    } finally {
      setDraftToolRunLoading(false)
    }
  }

  async function refreshDraftToolRunTrace() {
    if (!draftToolRunResult?.run.id) return
    setDraftToolRunLoading(true)
    setDraftToolRunError(null)
    try {
      const [run, trace] = await Promise.all([
        localAgentClient.getRun(draftToolRunResult.run.id),
        localAgentClient.getRunTraceEvents(draftToolRunResult.run.id, { limit: 80 }),
      ])
      setDraftToolRunResult({ run, trace })
    } catch (error) {
      setDraftToolRunError(redactAgentTraceDebugText(error instanceof Error ? error.message : String(error)))
    } finally {
      setDraftToolRunLoading(false)
    }
  }

  function setDraftToolPreset(nextToolName: string, args: Record<string, unknown>) {
    setDraftToolName(nextToolName)
    setDraftToolArgsText(formatJson(args))
    setDraftToolRunError(null)
  }

  function draftRuntimeToolPresetArgs(toolName: string): Record<string, unknown> {
    if (toolName === 'draft_create') return defaultCreateAssetProposalDraftArgs(debugProject?.ID)
    return defaultDraftRuntimeToolArgs(toolName, draftRuntimeLastDraftId ?? undefined)
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
    if (remediationTaskGraph.length > 0) {
      lines.push('')
      lines.push(t('agents.debug.remediationSummary.title'))
      remediationTaskGraph.forEach((item, index) => {
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
    <AppPageShell data-testid="agent-debug-page">
      <AppPageShellHeader>
        <AgentDebugHeaderContent>
          <AgentDebugHeaderCopy>
            <AgentDebugHeaderTitleRow>
              <Terminal size={18} />
              <AgentDebugHeaderTitle>{t('agents.debug.title')}</AgentDebugHeaderTitle>
              <RuntimeStatusBadge online={runtimeOnline} loading={debugQuery.isLoading || debugQuery.isFetching} />
            </AgentDebugHeaderTitleRow>
            <AgentDebugHeaderDescription>{t('agents.debug.description')}</AgentDebugHeaderDescription>
            <AgentDebugScopeRail data-testid="agent-debug-scope-boundary" hidden>
              <AgentDebugInlineMeta>{t('agents.debug.scope.observabilityPlane')}</AgentDebugInlineMeta>
              <AgentDebugInlineMeta>{t('agents.debug.scope.noPersistentWrites')}</AgentDebugInlineMeta>
              <AgentDebugInlineMeta>{t('agents.debug.scope.runDiagnosticsInDetails')}</AgentDebugInlineMeta>
            </AgentDebugScopeRail>
          </AgentDebugHeaderCopy>
          <AgentDebugHeaderActions>
            <AgentDebugActionButton asChild variant="outline" data-testid="agent-debug-open-settings">
              <Link to={ROUTES.agentSettings}>
                <Settings size={14} />
                {t('agents.debug.actions.openSettings')}
              </Link>
            </AgentDebugActionButton>
            <AgentDebugActionButton variant="outline" onClick={copyTriageSummary} data-testid="agent-debug-copy-triage">
              <Clipboard size={14} />
              {triageCopied ? t('agents.debug.actions.triageCopied') : t('agents.debug.actions.copyTriage')}
            </AgentDebugActionButton>
            <AgentDebugActionButton variant="outline" onClick={copyRawData} data-testid="agent-debug-copy-bundle">
              <Clipboard size={14} />
              {copied ? t('agents.debug.actions.copied') : t('agents.debug.actions.copyJson')}
            </AgentDebugActionButton>
            <AgentDebugActionButton variant="outline" onClick={downloadDebugBundle} data-testid="agent-debug-download-bundle">
              <Download size={14} />
              {downloaded ? t('agents.debug.actions.downloaded') : t('agents.debug.actions.downloadJson')}
            </AgentDebugActionButton>
            <AgentDebugActionButton variant="outline" onClick={() => debugQuery.refetch()} disabled={debugQuery.isFetching} data-testid="agent-debug-refresh">
              <AgentDebugIcon icon={RefreshCw} size={14} spinning={debugQuery.isFetching} />
              {t('agents.debug.actions.refresh')}
            </AgentDebugActionButton>
          </AgentDebugHeaderActions>
        </AgentDebugHeaderContent>
      </AppPageShellHeader>

      <AgentConsoleNav compact />

      <AppPageShellBody>
        {debugQuery.isLoading ? (
          <AgentDebugStateMessage icon={<AgentDebugIcon icon={Loader2} size={16} spinning />} text={t('common.loading')} />
        ) : debugQuery.error ? (
          <AgentDebugStateMessage
            icon={<XCircle size={16} />}
            tone="danger"
            text={redactAgentTraceDebugText(debugQuery.error instanceof Error ? debugQuery.error.message : String(debugQuery.error))}
          />
        ) : debugQuery.data ? (
          <AgentDebugTabs defaultValue="overview">
            <AgentDebugTabsList>
              <TabsTrigger value="overview">{t('agents.debug.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="manifest">{t('agents.debug.tabs.manifest')}</TabsTrigger>
              <TabsTrigger value="toolConsole">{t('agents.debug.tabs.toolConsole')}</TabsTrigger>
              <TabsTrigger value="draftRuntime">{t('agents.debug.tabs.draftRuntime')}</TabsTrigger>
              <TabsTrigger value="prompt">{t('agents.debug.tabs.prompt')}</TabsTrigger>
              <TabsTrigger value="context">{t('agents.debug.tabs.context')}</TabsTrigger>
              <TabsTrigger value="runs">{t('agents.debug.tabs.runs')}</TabsTrigger>
              <TabsTrigger value="raw">{t('agents.debug.tabs.raw')}</TabsTrigger>
            </AgentDebugTabsList>

            <AgentDebugTabsContent value="overview" layout="stack">
              <AgentDebugGrid columns="four">
                <AgentDebugMetricCard label={t('agents.debug.metrics.runtime')} value={runtimeOnline ? t('agents.debug.status.online') : t('agents.debug.status.offline')} />
                <AgentDebugMetricCard label={t('agents.debug.metrics.activeRuns')} value={String(runHealth.active)} />
                <AgentDebugMetricCard label={t('agents.debug.metrics.waitingRuns')} value={String(runHealth.waiting)} />
                <AgentDebugMetricCard label={t('agents.debug.metrics.failedRuns')} value={String(runHealth.failed)} />
              </AgentDebugGrid>

              <AgentDebugGrid columns="overview">
                <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.runtime')}>
                  <AgentDebugGrid columns="two">
                    <AgentDebugKeyValue label={t('agents.debug.fields.baseUrl')} value={redactAgentTraceDebugText(localAgentClient.baseURL)} />
                    <AgentDebugKeyValue label={t('agents.debug.fields.lastUpdated')} value={debugQuery.data.lastUpdated ? new Date(debugQuery.data.lastUpdated).toLocaleString() : '-'} />
                    <AgentDebugKeyValue label="MCP" value={debugQuery.data.capabilities.mcp.connected ? t('agents.debug.status.online') : t('agents.debug.status.offline')} />
                    <AgentDebugKeyValue label={t('agents.debug.fields.skillsDir')} value={debugQuery.data.inspect.pluginCatalog?.skillsDir ?? t('agents.debug.values.unknown')} />
                    <AgentDebugKeyValue label={t('agents.debug.fields.toolsDir')} value={debugQuery.data.inspect.pluginCatalog?.toolsDir ?? t('agents.debug.values.unknown')} />
                  </AgentDebugGrid>
                  <AgentDataBlock data-testid="agent-debug-runtime-model-config">
                    <AgentDebugItemTitle>{t('agents.debug.panels.runtimeModelConfig')}</AgentDebugItemTitle>
                    {debugQuery.data.modelConfig ? (
                      <AgentDebugGrid columns="two">
                        <AgentDebugKeyValue label={t('agents.debug.fields.modelConfigured')} value={debugQuery.data.modelConfig.configured ? t('agents.debug.status.enabled') : t('agents.debug.status.disabled')} />
                        <AgentDebugKeyValue label={t('agents.debug.fields.model')} value={debugModelConfigValue(debugQuery.data.modelConfig)} />
                        <AgentDebugKeyValue label={t('agents.debug.fields.apiKind')} value={debugQuery.data.modelConfig.apiKind ?? 'openai_chat_completions'} />
                        <AgentDebugKeyValue label={t('agents.debug.fields.modelCredentials')} value={debugModelCredentialStatusLabel(debugQuery.data.modelConfig, t)} />
                        <AgentDebugKeyValue label={t('agents.debug.fields.modelRoutes')} value={debugModelRouteSummary(debugQuery.data.modelConfig)} />
                        <AgentDebugKeyValue label={t('agents.debug.fields.modelSource')} value={debugQuery.data.modelConfig.source} />
                      </AgentDebugGrid>
                    ) : (
                      <AgentDebugCallout data-testid="agent-debug-model-config-read-error" tone="warning" compact>
                        {t('agents.debug.empty.modelConfigReadFailed', { reason: debugQuery.data.modelConfigError ?? '-' })}
                      </AgentDebugCallout>
                    )}
                  </AgentDataBlock>
                  {warningGroups.length > 0 && (
                    <AgentDebugCallout tone="warning" compact>
                      <AgentDebugToneText tone="warning">
                        {t('agents.debug.panels.warnings')}
                      </AgentDebugToneText>
                      <AgentDebugStack data-testid="agent-debug-warning-groups" density="compact">
                        {warningGroups.map((group) => (
                          <AgentDataBlock key={group.source} data-testid="agent-debug-warning-group">
                            <AgentDebugItemTitle>{t(group.labelKey)}</AgentDebugItemTitle>
                            <AgentDebugIssueList items={group.warnings} />
                          </AgentDataBlock>
                        ))}
                      </AgentDebugStack>
                    </AgentDebugCallout>
                  )}
                </AgentDebugPanel>

                <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.previewInput')}>
                  <AgentDebugStack density="compact">
                    <AgentDebugTextarea
                      value={previewMessage}
                      onChange={(event) => setPreviewMessage(event.target.value)}
                      minRows="large"
                    />
                    <AgentDebugActionButton onClick={runPreview} disabled={previewLoading}>
                      {previewLoading ? <AgentDebugIcon icon={Loader2} size={14} spinning /> : <Play size={14} />}
                      {t('agents.debug.actions.runPreview')}
                    </AgentDebugActionButton>
                    {previewError && (
                      <AppInlineError>
                        {previewError}
                      </AppInlineError>
                    )}
                  </AgentDebugStack>
                </AgentDebugPanel>
              </AgentDebugGrid>

              <AgentDebugGrid columns="two">
                <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.triage')}>
                  <DebugTriagePanel items={triageItems} />
                </AgentDebugPanel>
                <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.remediationTaskGraph')}>
                  <DebugRemediationTaskGraph items={remediationTaskGraph} previewLoading={previewLoading} onRunPreview={() => void runPreview()} />
                </AgentDebugPanel>
                <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.observationCoverage')}>
                  <DebugObservationCoverage items={observationItems} previewLoading={previewLoading} onRunPreview={() => void runPreview()} />
                </AgentDebugPanel>
                <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.evidenceChecklist')}>
                  <DebugEvidenceChecklistPanel items={evidenceChecklist} />
                </AgentDebugPanel>
                <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.runIssueSummary')}>
                  <RunIssueSummary groups={runHealth.issueGroups} />
                </AgentDebugPanel>
                <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.runAttention')}>
                  <AgentDebugStack data-testid="agent-debug-run-attention" density="compact">
                    {runHealth.attention.length === 0 ? (
                      <AgentDebugEmptyText>{t('agents.debug.empty.noRunAttention')}</AgentDebugEmptyText>
                    ) : runHealth.attention.map((run) => (
                      <RunListRow key={run.id} run={run} />
                    ))}
                  </AgentDebugStack>
                </AgentDebugPanel>
                <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.mcpResources')}>
                  {debugQuery.data.capabilities.mcp.resources.length === 0 ? (
                    <AgentDebugEmptyText>{t('agents.debug.empty.noResources')}</AgentDebugEmptyText>
                  ) : (
                    <AgentDebugStack density="compact">
                      {debugQuery.data.capabilities.mcp.resources.map((resource) => (
                        <AgentDebugListRow key={resource.uri} title={resource.name || resource.uri} meta={resource.uri} description={resource.description} />
                      ))}
                    </AgentDebugStack>
                  )}
                </AgentDebugPanel>
                <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.latestPreview')}>
                  {preview ? <PreviewSummary preview={preview} /> : <AgentDebugEmptyText>{t('agents.debug.empty.runPreviewHint')}</AgentDebugEmptyText>}
                </AgentDebugPanel>
              </AgentDebugGrid>
            </AgentDebugTabsContent>

            <AgentDebugTabsContent value="manifest" layout="two">
              <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title={t('agents.debug.panels.effectiveManifest')} value={preview?.agentManifest ?? debugQuery.data.capabilities.defaultAgentManifest} emptyText={t('agents.debug.empty.noManifest')} />
              <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title={t('agents.debug.panels.defaultManifest')} value={debugQuery.data.inspect.defaultAgentManifest} emptyText={t('agents.debug.empty.noDefaultManifest')} />
            </AgentDebugTabsContent>

            <AgentDebugTabsContent value="toolConsole" layout="tool-console">
              <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.toolConsole')}>
                <AgentDebugStack>
                  <AgentDebugCallout tone="warning" compact>
                    {t('agents.debug.toolConsole.warning')}
                  </AgentDebugCallout>
                  <AgentDataBlock>
                    {t('agents.debug.toolConsole.runtimeBoundary')}
                  </AgentDataBlock>
                  <AgentDebugFormField>
                    <AgentDebugFieldLabel>{t('agents.debug.toolConsole.tool')}</AgentDebugFieldLabel>
                    <AgentDebugNativeSelect
                      value={toolName}
                      onChange={(event) => setToolName(event.target.value)}
                      disabled={availableTools.length === 0}
                    >
                      {availableTools.length === 0 && <option value="">{t('agents.debug.empty.noMcpTools')}</option>}
                      {availableTools.map((tool) => (
                        <option key={tool.name} value={tool.name}>{tool.name}</option>
                      ))}
                    </AgentDebugNativeSelect>
                  </AgentDebugFormField>
                  {selectedTool && (
                    <AgentDebugGrid columns="two">
                      <AgentDebugKeyValue label={t('agents.debug.table.source')} value={selectedTool.source} />
                      <AgentDebugKeyValue label={t('agents.debug.table.risk')} value={selectedTool.risk ?? '-'} />
                      <AgentDebugKeyValue label={t('agents.debug.table.permission')} value={selectedTool.permission ?? '-'} />
                      <AgentDebugKeyValue label={t('agents.debug.table.approval')} value={selectedTool.approval} />
                    </AgentDebugGrid>
                  )}
                  <AgentDebugFormField>
                    <AgentDebugFieldLabel>{t('agents.debug.toolConsole.args')}</AgentDebugFieldLabel>
                    <AgentDebugTextarea
                      value={toolArgsText}
                      onChange={(event) => setToolArgsText(event.target.value)}
                      minRows="console"
                      monospace
                      spellCheck={false}
                    />
                  </AgentDebugFormField>
                  <AgentDebugActionRow>
                    <AgentDebugActionButton onClick={() => void runToolConsole()} disabled={toolRunLoading || !toolName}>
                      {toolRunLoading ? <AgentDebugIcon icon={Loader2} size={14} spinning /> : <Play size={14} />}
                      {t('agents.debug.toolConsole.run')}
                    </AgentDebugActionButton>
                    {toolRunResult?.run.id && (
                      <AgentDebugActionButton variant="outline" onClick={() => void refreshToolRunTrace()} disabled={toolRunLoading}>
                        <AgentDebugIcon icon={RefreshCw} size={14} spinning={toolRunLoading} />
                        {t('agents.debug.toolConsole.refreshTrace')}
                      </AgentDebugActionButton>
                    )}
                  </AgentDebugActionRow>
                  {toolRunError && (
                    <AppInlineError>
                      {toolRunError}
                    </AppInlineError>
                  )}
                  {toolRunResult?.run && (
                    <AgentDebugGrid columns="two">
                      <AgentDebugKeyValue label="Run ID" value={toolRunResult.run.id} />
                      <AgentDebugKeyValue label={t('agents.debug.table.status')} value={toolRunResult.run.status} />
                    </AgentDebugGrid>
                  )}
                  {toolRunResult?.run.id && (
                    <AgentDebugActionButton asChild variant="outline">
                      <Link to={agentRunPath(toolRunResult.run.id)}>
                        <ArrowRight size={14} />
                        {t('agents.debug.actions.viewRun')}
                      </Link>
                    </AgentDebugActionButton>
                  )}
                </AgentDebugStack>
              </AgentDebugPanel>
              <AgentDebugStack>
                <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title={t('agents.debug.panels.toolSchema')} value={selectedTool?.inputSchema} emptyText={t('agents.debug.empty.noToolSelected')} />
                <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title={t('agents.debug.panels.toolConsoleOutput')} value={extractToolConsoleOutput(toolRunResult)} emptyText={t('agents.debug.empty.noToolConsoleResult')} />
                <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title={t('agents.debug.panels.toolConsoleResult')} value={buildToolConsoleResultSummary(toolRunResult)} emptyText={t('agents.debug.empty.noToolConsoleResult')} />
              </AgentDebugStack>
            </AgentDebugTabsContent>

            <AgentDebugTabsContent value="draftRuntime" layout="draft-runtime">
              <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.draftRuntime')}>
                <AgentDebugStack>
                  <AgentDataBlock>
                    {t('agents.debug.draftRuntime.boundary')}
                  </AgentDataBlock>
                  <AgentDebugFormField>
                    <AgentDebugFieldLabel>{t('agents.debug.draftRuntime.tool')}</AgentDebugFieldLabel>
                    <AgentDebugNativeSelect
                      value={draftToolName}
                      onChange={(event) => setDraftToolPreset(event.target.value, draftRuntimeToolPresetArgs(event.target.value))}
                      disabled={draftRuntimeTools.length === 0}
                    >
                      {draftRuntimeTools.length === 0 && <option value="">{t('agents.debug.empty.noDraftRuntimeTools')}</option>}
                      {draftRuntimeTools.map((tool) => (
                        <option key={tool.name} value={tool.name}>{tool.name}</option>
                      ))}
                    </AgentDebugNativeSelect>
                  </AgentDebugFormField>
                  {selectedDraftTool && (
                    <AgentDebugGrid columns="two">
                      <AgentDebugKeyValue label={t('agents.debug.table.source')} value={selectedDraftTool.source} />
                      <AgentDebugKeyValue label={t('agents.debug.table.risk')} value={selectedDraftTool.risk ?? '-'} />
                      <AgentDebugKeyValue label={t('agents.debug.table.permission')} value={selectedDraftTool.permission ?? '-'} />
                      <AgentDebugKeyValue label={t('agents.debug.table.approval')} value={selectedDraftTool.approval} />
                    </AgentDebugGrid>
                  )}
                  <AgentDebugFormField>
                    <AgentDebugFieldLabel>{t('agents.debug.draftRuntime.args')}</AgentDebugFieldLabel>
                    <AgentDebugTextarea
                      value={draftToolArgsText}
                      onChange={(event) => setDraftToolArgsText(event.target.value)}
                      minRows="tall"
                      monospace
                      spellCheck={false}
                    />
                  </AgentDebugFormField>
                  <AgentDebugActionRow>
                    <AgentDebugActionButton onClick={() => void runDraftRuntimeTool()} disabled={draftToolRunLoading || !draftToolName}>
                      {draftToolRunLoading ? <AgentDebugIcon icon={Loader2} size={14} spinning /> : <Play size={14} />}
                      {t('agents.debug.draftRuntime.run')}
                    </AgentDebugActionButton>
                    <AgentDebugActionButton
                      variant="outline"
                      onClick={() => setDraftToolPreset('draft_model_get', { kind: 'asset_proposal', seedMode: 'editable_snapshot', hydrate: true })}
                    >
                      {t('agents.debug.draftRuntime.assetModelPreset')}
                    </AgentDebugActionButton>
                    <AgentDebugActionButton
                      variant="outline"
                      onClick={() => setDraftToolPreset('draft_create', defaultCreateAssetProposalDraftArgs(debugProject?.ID))}
                    >
                      {t('agents.debug.draftRuntime.createAssetDraftPreset')}
                    </AgentDebugActionButton>
                    <AgentDebugActionButton
                      variant="outline"
                      onClick={() => setDraftToolPreset('draft_create', defaultCreateProductionProposalDraftArgs(debugProject?.ID))}
                    >
                      {t('agents.debug.draftRuntime.createProductionDraftPreset')}
                    </AgentDebugActionButton>
                    <AgentDebugActionButton
                      variant="outline"
                      onClick={() => setDraftToolPreset('draft_apply_preview', defaultDraftRuntimeToolArgs('draft_apply_preview', draftRuntimeLastDraftId ?? undefined))}
                    >
                      {t('agents.debug.draftRuntime.previewApplyPreset')}
                    </AgentDebugActionButton>
                    {draftToolRunResult?.run.id && (
                      <AgentDebugActionButton variant="outline" onClick={() => void refreshDraftToolRunTrace()} disabled={draftToolRunLoading}>
                        <AgentDebugIcon icon={RefreshCw} size={14} spinning={draftToolRunLoading} />
                        {t('agents.debug.draftRuntime.refreshTrace')}
                      </AgentDebugActionButton>
                    )}
                    {draftToolRunResult?.run.id && (
                      <AgentDebugActionButton asChild variant="outline">
                        <Link to={agentRunPath(draftToolRunResult.run.id)}>
                          <ArrowRight size={14} />
                          {t('agents.debug.actions.viewRun')}
                        </Link>
                      </AgentDebugActionButton>
                    )}
                  </AgentDebugActionRow>
                  {draftToolRunError && (
                    <AppInlineError>
                      {draftToolRunError}
                    </AppInlineError>
                  )}
                  {draftToolRunResult?.run && (
                    <AgentDebugGrid columns="two">
                      <AgentDebugKeyValue label="Run ID" value={draftToolRunResult.run.id} />
                      <AgentDebugKeyValue label={t('agents.debug.table.status')} value={draftToolRunResult.run.status} />
                    </AgentDebugGrid>
                  )}
                </AgentDebugStack>
              </AgentDebugPanel>
              <AgentDebugStack>
                <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title={t('agents.debug.panels.draftRuntimeSchema')} value={selectedDraftTool?.inputSchema} emptyText={t('agents.debug.empty.noDraftRuntimeToolSelected')} />
                <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title={t('agents.debug.panels.draftRuntimeOutput')} value={extractToolConsoleOutput(draftToolRunResult)} emptyText={t('agents.debug.empty.noDraftRuntimeResult')} />
                <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title="Draft Runtime full draft" value={buildDraftRuntimeFullDraftView(draftRuntimeDraft, draftRuntimeDraftError)} emptyText={t('agents.debug.empty.noDraftRuntimeResult')} />
                <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title={t('agents.debug.panels.draftRuntimeResult')} value={buildToolConsoleResultSummary(draftToolRunResult)} emptyText={t('agents.debug.empty.noDraftRuntimeResult')} />
              </AgentDebugStack>
            </AgentDebugTabsContent>

            <AgentDebugTabsContent value="prompt" layout="two">
              <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.promptParts')}>
                {preview?.promptPreview ? (
                  <AgentDebugStack density="compact">
                    {preview.promptPreview.debugParts.map((part) => (
                      <AgentDataBlock key={part.id}>
                        <AgentDebugItemTitle>{part.title}</AgentDebugItemTitle>
                        <AgentDebugItemDetail>{part.kind} / {t('agents.debug.values.chars', { count: part.content.length })}</AgentDebugItemDetail>
                        <AgentDataBlock>
                          <AgentDebugCodeBlock>{part.content ? redactAgentTraceDebugText(part.content) : t('agents.debug.empty.emptyValue')}</AgentDebugCodeBlock>
                        </AgentDataBlock>
                      </AgentDataBlock>
                    ))}
                  </AgentDebugStack>
                ) : <AgentDebugEmptyText>{t('agents.debug.empty.runPromptPreviewHint')}</AgentDebugEmptyText>}
              </AgentDebugPanel>
              <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title={t('agents.debug.panels.outboundMessages')} value={preview?.promptPreview?.messages} emptyText={t('agents.debug.empty.runPromptPreviewHint')} />
            </AgentDebugTabsContent>

            <AgentDebugTabsContent value="context" layout="two">
              <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.currentProject')}>
                {debugProject ? (
                  <AgentDebugStack density="compact">
                    <AgentDebugKeyValue label={t('agents.debug.fields.project')} value={`#${debugProject.ID} ${debugProject.name}`} />
                    <AgentDebugKeyValue label={t('agents.debug.fields.route')} value={window.location.pathname} />
                  </AgentDebugStack>
                ) : <AgentDebugEmptyText>{t('agents.debug.empty.noProject')}</AgentDebugEmptyText>}
              </AgentDebugPanel>
              <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title={t('agents.debug.panels.contextJson')} value={preview?.context} emptyText={t('agents.debug.empty.runContextPreviewHint')} />
            </AgentDebugTabsContent>

            <AgentDebugTabsContent value="runs" layout="stack">
              <AgentDebugPanel icon={Bot} title={t('agents.debug.tabs.runs')}>
                {debugQuery.data.runs.length === 0 ? <AgentDebugEmptyText>{t('agents.debug.values.none')}</AgentDebugEmptyText> : (
                  <AgentDebugStack density="compact">
                    {debugQuery.data.runs.slice(0, 30).map((run) => (
                      <RunListRow key={run.id} run={run} />
                    ))}
                  </AgentDebugStack>
                )}
              </AgentDebugPanel>
            </AgentDebugTabsContent>

            <AgentDebugTabsContent value="raw" layout="stack">
              <DebugBundleRedactionNotice />
              <DebugBundleFieldGuide />
              <AgentDebugJsonPanel icon={Bot} formatValue={formatJson} title={t('agents.debug.tabs.raw')} value={rawData} />
            </AgentDebugTabsContent>
          </AgentDebugTabs>
        ) : null}
      </AppPageShellBody>
    </AppPageShell>
  )
}

function RuntimeStatusBadge({ online, loading }: { online: boolean; loading: boolean }) {
  const { t } = useTranslation()
  if (loading) return <AgentDebugBadge>{t('agents.debug.status.checking')}</AgentDebugBadge>
  const statusRecipe = agentAvailabilityStatusRecipe(online)
  return (
    <AgentDebugStatusBadge intent={statusRecipe.intent} emphasis={statusRecipe.emphasis}>
      {online ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {online ? t('agents.debug.status.runtimeOnline') : t('agents.debug.status.runtimeOffline')}
    </AgentDebugStatusBadge>
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
    <AgentDebugStack data-testid="agent-debug-observation-coverage" density="compact">
      {items.map((item) => (
        <DebugObservationRow
          key={item.id}
          item={item}
          previewLoading={previewLoading}
          onRunPreview={onRunPreview}
        />
      ))}
    </AgentDebugStack>
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
  const icon = <AgentDebugStatusIcon status={item.status} />
  const actions = canRunPreview ? (
    <AgentDebugActionButton
      variant="outline"
      onClick={onRunPreview}
      disabled={previewLoading}
      data-testid="agent-debug-observation-run-preview"
    >
      {previewLoading ? <AgentDebugIcon icon={Loader2} size={12} spinning /> : <Play size={12} />}
      {t('agents.debug.actions.runPreview')}
    </AgentDebugActionButton>
  ) : undefined

  return (
    <AgentDebugStatusRow
      data-testid="agent-debug-observation-item"
      icon={icon}
      title={t(item.labelKey)}
      detail={t(item.detailKey, item.detailValues)}
      status={t(`agents.debug.observationStatuses.${item.status}`)}
      statusProps={agentSeverityStatusRecipe(item.status)}
      actions={actions}
    />
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
    <AgentDebugStack data-testid="agent-debug-evidence-checklist" density="compact">
      <AgentDebugActionRow>
        <AgentDebugActionButton variant="outline" onClick={() => void copyEvidenceChecklist()} data-testid="agent-debug-copy-evidence-checklist">
          <Clipboard size={14} />
          {copied ? t('agents.debug.actions.evidenceCopied') : t('agents.debug.actions.copyEvidence')}
        </AgentDebugActionButton>
      </AgentDebugActionRow>
      {items.map((item) => (
        <AgentDebugStatusRow
          key={item.id}
          data-testid="agent-debug-evidence-item"
          title={t(item.labelKey)}
          detail={t(item.detailKey, item.detailValues)}
          status={t(`agents.debug.observationStatuses.${item.status}`)}
          statusProps={agentSeverityStatusRecipe(item.status)}
        />
      ))}
    </AgentDebugStack>
  )
}

function RunIssueSummary({ groups }: { groups: DebugRunIssueGroup[] }) {
  const { t } = useTranslation()
  if (groups.length === 0) return <AgentDebugEmptyText>{t('agents.debug.empty.noRunIssues')}</AgentDebugEmptyText>
  return (
    <AgentDebugStack data-testid="agent-debug-run-issue-summary" density="compact">
      {groups.map((group) => (
        <AgentDebugStatusRow
          key={group.id}
          data-testid="agent-debug-run-issue-group"
          title={t(group.labelKey)}
          detail={group.sampleReason}
          secondaryDetail={group.sampleRunId ? (
            <AgentDebugInlineLink asChild data-testid="agent-debug-run-issue-link">
              <Link to={agentRunPath(group.sampleRunId)}>
                {t('agents.debug.actions.viewRun')}
              </Link>
            </AgentDebugInlineLink>
          ) : undefined}
          status={group.count}
          statusProps={agentRunStatusRecipe(group.status)}
        />
      ))}
    </AgentDebugStack>
  )
}

function DebugTriagePanel({ items }: { items: DebugTriageItem[] }) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return (
      <AgentDebugStack data-testid="agent-debug-triage" density="compact">
        <AgentDebugEmptyText>{t('agents.debug.empty.noTriageItems')}</AgentDebugEmptyText>
      </AgentDebugStack>
    )
  }
  return (
    <AgentDebugStack data-testid="agent-debug-triage" density="compact">
      {items.map((item) => (
        <AgentDebugSeverityBlock
          key={item.id}
          data-testid="agent-debug-triage-item"
          severity={item.severity}
        >
          <AgentDebugStatusRow
            title={t(item.titleKey, item.detailValues)}
            detail={t(item.detailKey, item.detailValues)}
            secondaryDetail={item.signalLabelKey
              ? t('agents.debug.triage.signal', { signal: t(item.signalLabelKey) })
              : item.runId ? (
                <AgentDebugInlineLink asChild data-testid="agent-debug-triage-run-link">
                  <Link to={agentRunPath(item.runId)}>
                    {t('agents.debug.actions.viewRun')}
                  </Link>
                </AgentDebugInlineLink>
              ) : undefined}
            status={t(`agents.debug.triageSeverities.${item.severity}`)}
            statusProps={agentSeverityStatusRecipe(item.severity)}
          />
        </AgentDebugSeverityBlock>
      ))}
    </AgentDebugStack>
  )
}

function DebugRemediationTaskGraph({
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
      <AgentDebugStack data-testid="agent-debug-remediation-taskGraph" density="compact">
        <AgentDebugEmptyText>{t('agents.debug.empty.noRemediationItems')}</AgentDebugEmptyText>
      </AgentDebugStack>
    )
  }
  return (
    <AgentDebugStack data-testid="agent-debug-remediation-taskGraph" density="compact">
      {items.map((item) => (
        <AgentDebugStatusRow
          key={item.id}
          data-testid="agent-debug-remediation-item"
          title={t(item.titleKey, item.detailValues)}
          detail={t(item.detailKey, item.detailValues)}
          status={t(`agents.debug.triageSeverities.${item.severity}`)}
          statusProps={agentSeverityStatusRecipe(item.severity)}
          actions={(
            <AgentDebugActionRow>
            {item.target === 'settings' ? (
              <AgentDebugActionButton asChild variant="outline" data-testid="agent-debug-remediation-settings-link">
                <Link to={ROUTES.agentSettings}>
                  <Settings size={12} />
                  {t(item.actionKey)}
                </Link>
              </AgentDebugActionButton>
            ) : item.target === 'run-details' && item.runId ? (
              <AgentDebugActionButton asChild variant="outline" data-testid="agent-debug-remediation-run-link">
                <Link to={agentRunPath(item.runId)}>
                  <ArrowRight size={12} />
                  {t(item.actionKey)}
                </Link>
              </AgentDebugActionButton>
            ) : item.target === 'preview' ? (
              <AgentDebugActionButton variant="outline" onClick={onRunPreview} disabled={previewLoading} data-testid="agent-debug-remediation-preview-action">
                {previewLoading ? <AgentDebugIcon icon={Loader2} size={12} spinning /> : <Play size={12} />}
                {t(item.actionKey)}
              </AgentDebugActionButton>
            ) : (
              <AgentDebugInlineMeta data-testid="agent-debug-remediation-observe-only">
                {t(item.actionKey)}
              </AgentDebugInlineMeta>
            )}
            </AgentDebugActionRow>
          )}
        />
      ))}
    </AgentDebugStack>
  )
}

function DebugBundleRedactionNotice() {
  const { t } = useTranslation()
  return (
    <AgentDebugStatusRow
      data-testid="agent-debug-bundle-redaction-notice"
      icon={<AgentDebugStatusIcon status="ready" />}
      title={t('agents.debug.redactionNotice.title')}
      detail={t('agents.debug.redactionNotice.detail')}
    />
  )
}

function DebugBundleFieldGuide() {
  const { t } = useTranslation()
  const fields = [
    'schema',
    'schemaVersion',
    'schemaUrl',
    'triageItems',
    'remediationTaskGraph',
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
    <AgentDebugPanel icon={Bot} title={t('agents.debug.panels.debugBundleFieldGuide')}>
      <AgentDebugGrid data-testid="agent-debug-bundle-field-guide" columns="two">
        {fields.map((field) => (
          <AgentDataBlock key={field} data-testid="agent-debug-bundle-field-guide-item">
            <AgentDebugItemTitle>{field}</AgentDebugItemTitle>
            <AgentDebugItemDetail>{t(`agents.debug.bundleFields.${field}`)}</AgentDebugItemDetail>
          </AgentDataBlock>
        ))}
      </AgentDebugGrid>
    </AgentDebugPanel>
  )
}

function RunListRow({ run }: { run: AgentRun }) {
  const statusRecipe = agentRunStatusRecipe(run.status)
  return (
    <AgentDebugBlockLink asChild data-testid="agent-debug-run-link">
      <Link to={agentRunPath(run.id)}>
        <AgentDebugRunListRow
          id={run.id}
          meta={redactAgentTraceDebugText([run.status, run.role, run.taskGraphId].filter(Boolean).join(' / '))}
          description={run.error || run.blockedReason || run.agentManifest?.name
            ? redactAgentTraceDebugText(run.error || run.blockedReason || run.agentManifest?.name || '')
            : undefined}
          status={run.status}
          statusProps={statusRecipe}
        />
      </Link>
    </AgentDebugBlockLink>
  )
}

function PreviewSummary({ preview }: { preview: AgentRunPreview }) {
  const { t } = useTranslation()
  return (
    <AgentDebugStack>
      <AgentDebugGrid columns="three">
        <AgentDebugKeyValue label={t('agents.debug.fields.project')} value={preview.currentProjectId ?? t('agents.debug.values.none')} />
        <AgentDebugKeyValue label={t('agents.debug.fields.memoryCount')} value={preview.memoryCount} />
        <AgentDebugKeyValue label={t('agents.debug.fields.toolCalls')} value={preview.toolCalls.length} />
      </AgentDebugGrid>
      <AgentDebugStack density="compact">
        {preview.toolCalls.length === 0 ? <AgentDebugEmptyText>{t('agents.debug.empty.runPlanPreviewHint')}</AgentDebugEmptyText> : preview.toolCalls.map((toolCall, index) => (
          <AgentDebugListRow
            key={`${toolCall.name}-${index}`}
            title={`${index + 1}. ${toolCall.name}`}
            description={toolCall.args ? formatJson(toolCall.args) : undefined}
          />
        ))}
      </AgentDebugStack>
      {preview.pendingApprovals.length > 0 ? (
        <AgentDebugStack density="compact">
          {preview.pendingApprovals.map((approval) => (
            <AgentDebugListRow
              key={approval.id}
              title={approval.toolName}
              meta={approval.risk}
              description={redactAgentTraceDebugText(approval.reason)}
              trailing={<AgentDebugStatusBadge intent="warning" emphasis="soft">{t('agents.debug.values.required')}</AgentDebugStatusBadge>}
            />
          ))}
        </AgentDebugStack>
      ) : <AgentDebugEmptyText>{t('agents.debug.empty.noApprovals')}</AgentDebugEmptyText>}
    </AgentDebugStack>
  )
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
    ?? run.taskGraphId
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

function buildDebugRemediationTaskGraph(input: {
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
  remediationTaskGraph: DebugRemediationItem[]
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
      status: input.remediationTaskGraph.some((item) => item.severity === 'action') ? 'action' : input.remediationTaskGraph.length > 0 ? 'warning' : 'ready',
      labelKey: 'agents.debug.evidenceChecklist.remediation',
      detailKey: 'agents.debug.evidenceChecklistDetails.remediation',
      detailValues: { count: input.remediationTaskGraph.length },
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
  const remediationTaskGraph = buildDebugRemediationTaskGraph({
    observationItems: observationCoverage,
    runIssueGroups: runSummary.issueGroups,
    warningGroups,
  })
  const evidenceChecklist = buildDebugEvidenceChecklist({
    debug: input.debug,
    observationItems: observationCoverage,
    triageItems,
    remediationTaskGraph,
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
    remediationTaskGraph,
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

function parseToolArgs(value: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool args must be a JSON object.')
  }
  return parsed as Record<string, unknown>
}

function validateDraftRuntimeToolArgs(toolName: string, args: Record<string, unknown>): void {
  if (!DRAFT_ID_REQUIRED_TOOLS.has(toolName)) return
  if (typeof args.draftId === 'string' && args.draftId.trim()) return
  throw new Error(`${toolName} requires draftId. Create a draft first, or paste an existing local draftId.`)
}

function normalizeDraftRuntimeToolArgs(
  toolName: string,
  args: Record<string, unknown>,
  fallback: { projectId?: number; draftId?: string },
): Record<string, unknown> {
  if (toolName === 'draft_create' && !isCompleteCreateDraftArgs(args)) {
    return defaultCreateAssetProposalDraftArgs(fallback.projectId)
  }
  if (DRAFT_ID_REQUIRED_TOOLS.has(toolName) && (!isNonEmptyString(args.draftId)) && fallback.draftId) {
    return { ...args, draftId: fallback.draftId }
  }
  return args
}

function isCompleteCreateDraftArgs(args: Record<string, unknown>): boolean {
  return isNonEmptyString(args.kind)
    && isNonEmptyString(args.title)
    && isNonEmptyString(args.content)
}

function isDefaultCreateAssetProposalDraftArgs(args: Record<string, unknown>): boolean {
  return args.kind === 'asset_proposal'
    && args.title === 'Debug asset proposal'
    && args.proposal === true
    && typeof args.content === 'string'
    && args.content.includes('Debug asset proposal draft shell')
}

function isDefaultCreateProductionProposalDraftArgs(args: Record<string, unknown>): boolean {
  return args.kind === 'production_proposal'
    && args.title === 'Debug production proposal'
    && args.proposal === true
    && typeof args.content === 'string'
    && args.content.includes('Debug production proposal draft shell')
}

function defaultCreateAssetProposalDraftArgs(projectId?: number): Record<string, unknown> {
  const content = {
    schema: 'movscript.asset_proposal.v1',
    scope: 'asset_proposal',
    mode: 'snapshot',
    proposal: {
      creative_references: [],
      candidate_plans: [],
    },
    summary: 'Debug asset proposal draft shell. Runtime will prefill omitted proposal.asset_slots from the current project data.',
    next_actions: [
      'Use agent://draft/{draftId}/content with file tools to edit proposal.asset_slots before apply preview.',
      'Leaving proposal.asset_slots equal to the hydrated current asset slots represents no asset-slot change.',
    ],
  }
  return {
    kind: 'asset_proposal',
    title: 'Debug asset proposal',
    ...(projectId ? { projectId } : {}),
    content: JSON.stringify(content, null, 2),
    ...(projectId ? {
      target: { entityType: 'project', entityId: projectId, projectId },
    } : {}),
    proposal: true,
  }
}

function defaultCreateProductionProposalDraftArgs(projectId?: number): Record<string, unknown> {
  const productionId = 0
  const content = {
    schema: 'movscript.production_proposal.v1',
    scope: 'production_proposal',
    mode: 'snapshot',
    productionId,
    proposalScope: 'production',
    proposal: {
      segments: [{
        client_id: 'debug-segment-1',
        title: 'Debug production segment',
        scene_moments: [{
          client_id: 'debug-scene-moment-1',
          title: 'Debug scene moment',
          description: 'Replace this shell with a real production beat before apply preview.',
          asset_slots: [{
            client_id: 'debug-production-slot-1',
            name: 'Debug production reference',
            kind: 'image',
            description: 'Replace with a production-local material need.',
          }],
        }],
      }],
    },
    impact_notes: [
      'Debug production proposal draft shell. Replace productionId=0 with the selected production id before apply preview.',
      'Keep project-level settings and asset requirements in setting_proposal or asset_proposal; this draft owns production structure only.',
    ],
    summary: 'Debug production proposal draft shell.',
  }
  return {
    kind: 'production_proposal',
    title: 'Debug production proposal',
    ...(projectId ? { projectId } : {}),
    productionId,
    content: JSON.stringify(content, null, 2),
    source: {
      entityType: 'production',
      pageKey: 'agent_debug_draft_runtime',
      pageType: 'agent_debug',
      pageRoute: ROUTES.agentDebug,
    },
    target: {
      entityType: 'production',
      field: 'proposal',
      ...(projectId ? { projectId } : {}),
      productionId,
    },
    metadata: {
      debugPreset: 'production_proposal',
      proposalScope: 'production',
      requiresProductionIdReplacement: true,
    },
    proposal: true,
  }
}

function defaultDraftRuntimeToolArgs(toolName: string, draftId?: string): Record<string, unknown> {
  if (toolName === 'draft_model_get') {
    return {
      kind: 'asset_proposal',
      seedMode: 'editable_snapshot',
      hydrate: true,
    }
  }
  if (DRAFT_ID_REQUIRED_TOOLS.has(toolName)) return { draftId: draftId ?? '' }
  return {}
}

function draftRuntimeDebugLabels(args: Record<string, unknown>): string[] {
  const labels = ['agent-debug', 'draft-runtime']
  const kind = typeof args.kind === 'string' && args.kind.trim() ? args.kind.trim() : ''
  if (kind) labels.push(kind, `draft-runtime:${kind}`)
  return labels
}

function draftRuntimeDebugProductionId(args: Record<string, unknown>): number | undefined {
  return typeof args.productionId === 'number' && Number.isSafeInteger(args.productionId) && args.productionId > 0 ? args.productionId : undefined
}

function extractDraftIdFromToolRun(run: AgentRun): string | null {
  for (const step of [...run.steps].reverse()) {
    if (step.toolName !== 'draft_create') continue
    const draftId = extractDraftId(step.result)
    if (draftId) return draftId
  }
  return null
}

function extractDraftId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.id === 'string' && record.id.trim()) return record.id.trim()
  if (typeof record.draftId === 'string' && record.draftId.trim()) return record.draftId.trim()
  if (record.draft && typeof record.draft === 'object' && !Array.isArray(record.draft)) {
    const draft = record.draft as Record<string, unknown>
    if (typeof draft.id === 'string' && draft.id.trim()) return draft.id.trim()
  }
  return null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function extractToolConsoleOutput(result: AgentToolConsoleResult | null): unknown {
  if (!result) return null
  const toolEvents = (result.trace?.events ?? [])
    .filter((event) => event.kind === 'tool_call')
    .map((event) => ({
      id: event.id,
      title: event.title,
      status: event.status,
      toolName: event.toolName,
      summary: event.summary,
      data: summarizeDebugValue(event.data),
      durationMs: event.durationMs,
      createdAt: event.createdAt,
    }))
  return {
    run: {
      id: result.run.id,
      status: result.run.status,
      error: result.run.error,
      blockedReason: result.run.blockedReason,
    },
    toolEvents,
  }
}

function buildDraftRuntimeFullDraftView(draft: AgentDraft | null, error: string | null): unknown {
  if (error) return { error }
  if (!draft) return null
  const parsedContent = parseJSONOrText(draft.content)
  return {
    id: draft.id,
    filePath: draft.filePath,
    projectId: draft.projectId,
    kind: draft.kind,
    title: draft.title,
    status: draft.status,
    contentCharCount: draft.content.length,
    source: draft.source,
    target: draft.target,
    metadata: draft.metadata,
    content: parsedContent,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  }
}

function parseJSONOrText(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function buildToolConsoleResultSummary(result: AgentToolConsoleResult | null): unknown {
  if (!result) return null
  return {
    run: {
      id: result.run.id,
      threadId: result.run.threadId,
      status: result.run.status,
      role: result.run.role,
      createdAt: result.run.createdAt,
      updatedAt: result.run.updatedAt,
      completedAt: result.run.completedAt,
      error: result.run.error,
      blockedReason: result.run.blockedReason,
      warnings: result.run.warnings,
      stepCount: result.run.steps.length,
      steps: result.run.steps.map((step) => ({
        id: step.id,
        type: step.type,
        status: step.status,
        toolName: step.toolName,
        error: step.error,
        durationMs: step.durationMs,
        result: summarizeDebugValue(step.result),
      })),
    },
    trace: result.trace
      ? {
        total: result.trace.total,
        hasMore: result.trace.hasMore,
        eventCount: result.trace.events.length,
        events: result.trace.events.map((event) => ({
          id: event.id,
          kind: event.kind,
          title: event.title,
          status: event.status,
          toolName: event.toolName,
          summary: event.summary,
          durationMs: event.durationMs,
          data: summarizeDebugValue(event.data),
        })),
      }
      : null,
    detail: 'Full run details are available from the Run details link.',
  }
}

function summarizeDebugValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return summarizeDebugString(value)
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[循环引用]'
  seen.add(value)

  if (Array.isArray(value)) {
    const sample = value
      .slice(0, DEBUG_SUMMARY_MAX_ARRAY_ITEMS)
      .map((item) => summarizeDebugValue(item, depth + 1, seen))
    return value.length > DEBUG_SUMMARY_MAX_ARRAY_ITEMS
      ? { type: 'array', count: value.length, sample, omittedItems: value.length - sample.length }
      : sample
  }

  const entries = Object.entries(value)
  if (depth >= DEBUG_SUMMARY_MAX_DEPTH) {
    return { type: 'object', fieldCount: entries.length, omittedBecause: 'depth_limit' }
  }

  const out: Record<string, unknown> = {}
  for (const [key, item] of entries.slice(0, DEBUG_SUMMARY_MAX_FIELDS)) {
    out[key] = summarizeDebugValue(item, depth + 1, seen)
  }
  const omittedFields = entries.length - Object.keys(out).length
  if (omittedFields > 0) out.omittedFieldCount = omittedFields
  return out
}

function summarizeDebugString(value: string): unknown {
  if (value.length <= DEBUG_SUMMARY_MAX_STRING_CHARS) return value
  const compact = value.replace(/\s+/g, ' ').trim()
  return {
    type: 'text',
    charCount: value.length,
    excerpt: compact.slice(0, DEBUG_SUMMARY_MAX_STRING_CHARS),
    truncated: true,
  }
}
