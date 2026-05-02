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
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@movscript/ui'
import {
  localAgentClient,
  type AgentCapabilitiesResponse,
  type AgentDebugTool,
  type AgentHealth,
  type AgentInspectResponse,
  type AgentManifest,
  type AgentRun,
  type AgentRunPreview,
  type AgentSkillManifest,
  type ResolvedAgentSkill,
  type ResolvedToolCatalog,
  type RuntimeModelConfigPublic,
  type RuntimeModelTestResult,
} from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'

interface AIFunctionDebugSpec {
  id: string
  name: string
  surface: string
  frontendEntry: string
  trigger: string
  endpoint: string
  requestShape: Record<string, unknown>
  executionTrace: string[]
  currentVisibility: string[]
  missingVisibility: string[]
}

interface DebugRunInputSnapshot {
  message: string
  startedAt: string
  route?: { pathname: string; search: string; hash: string }
  project?: { id: number; name: string; status?: string }
}

type DebugStageStatus = 'pending' | 'active' | 'complete' | 'blocked' | 'failed'

const AI_FUNCTIONS: AIFunctionDebugSpec[] = [
  {
    id: 'agent_debug_model_planner',
    name: 'Agent Debug Model Planner / Run',
    surface: '/agent/debug',
    frontendEntry: 'apps/frontend/src/pages/agent/AgentDebugPage.tsx',
    trigger: 'Run Preview / Execute Debug Run',
    endpoint: 'local runtime: POST /runs/preview, POST /threads, POST /runs, GET /runs/:id',
    requestShape: {
      clientInput: {
        message: 'string',
        uiSnapshot: {
          route: { pathname: 'string', search: 'string', hash: 'string' },
          project: { id: 'number', name: 'string', status: 'string', description: 'string' },
        },
      },
      agentManifest: 'optional',
      approvedToolNames: 'optional string[]',
    },
    executionTrace: ['context pack', 'skill resolution', 'tool capability resolution', 'prompt compilation', 'model/rule planner', 'tool policy', 'run steps', 'approval gate', 'assistant message'],
    currentVisibility: ['prompt', 'context', 'planner kind', 'plan', 'tool calls', 'approvals', 'step args/result/error', 'final message', 'raw run JSON'],
    missingVisibility: ['token usage', 'model raw request/response body', 'per-step latency'],
  },
  {
    id: 'brainstorm_chat',
    name: 'Brainstorm Text Chat',
    surface: '/tools/brainstorm',
    frontendEntry: 'apps/frontend/src/pages/tools/BrainstormPage.tsx',
    trigger: 'generate()',
    endpoint: 'backend: POST /ai/chat',
    requestShape: {
      model_config_id: 'selectedModelId',
      messages: [{ role: 'user', content: 'prompt.trim()' }],
    },
    executionTrace: ['frontend prompt', 'backend AI service', 'provider chat/completions', 'content response'],
    currentVisibility: ['local page history status/result/error'],
    missingVisibility: ['request inspector', 'provider endpoint/debug info', 'latency', 'usage/cost', 'raw response'],
  },
  {
    id: 'tool_generation_jobs',
    name: 'Tool Generation Job',
    surface: '/tools/*',
    frontendEntry: 'apps/frontend/src/pages/tools/ToolDialog.tsx',
    trigger: 'Generate button',
    endpoint: 'backend: POST /jobs, GET /jobs/:id',
    requestShape: {
      model_config_id: 'selectedModelId',
      job_type: 'image | image_edit | video | video_i2v | video_v2v',
      prompt: 'prompt.trim()',
      aspect_ratio: 'optional',
      duration: 'optional number',
      extra_params: 'JSON.stringify(remainingParams)',
      input_resource_ids: 'attachments.map(ID)',
      feature_key: 'nodeType',
    },
    executionTrace: ['job create', 'model config lookup', 'provider generation request', 'poll task if async', 'resource save', 'job status update'],
    currentVisibility: ['job list page', 'admin debug jobs', 'page active job status'],
    missingVisibility: ['frontend request payload preview', 'provider request/response timeline in product debug page', 'resource binding trace'],
  },
  {
    id: 'quick_tool_canvas',
    name: 'Quick Tool Canvas Node Run',
    surface: 'legacy tool pages using useToolCanvas',
    frontendEntry: 'apps/frontend/src/hooks/useToolCanvas.ts',
    trigger: 'ToolPage run()',
    endpoint: 'backend: PUT /canvases/:id, POST /canvases/:id/nodes/:nodeId/run, GET /canvases/:id/nodes/:nodeId/task',
    requestShape: {
      canvasSave: {
        nodes: [{ node_id: 'tool-node-1', type: 'nodeType', data: { source: 'ai', modelDbId: 'number', prompt: 'string', resourceId: 'optional', resourceIds: 'optional number[]' } }],
        edges: [],
      },
      nodeRun: {},
    },
    executionTrace: ['ensure canvas', 'save synthetic node', 'run node', 'canvas task', 'AI model execution', 'resource output', 'poll task'],
    currentVisibility: ['page status', 'node task polling result'],
    missingVisibility: ['exact saved node payload inspector', 'canvas task timeline', 'provider debug body'],
  },
  {
    id: 'canvas_workflow_run',
    name: 'Canvas Workflow / Node AI Run',
    surface: '/canvases/:id',
    frontendEntry: 'apps/frontend/src/pages/canvas/CanvasEditorPage.tsx',
    trigger: 'Run workflow / Run node',
    endpoint: 'backend: POST /canvases/:id/run, POST /canvases/:id/nodes/:nodeId/run, GET /canvases/:id/runs/:runId/tasks',
    requestShape: {
      input_values: {
        '<portId>': { type: 'text | image | video | resource | boolean | number', text: 'optional', resource_id: 'optional' },
      },
    },
    executionTrace: ['save canvas graph', 'topological plan', 'create CanvasRun/CanvasTask', 'resolve port inputs', 'execute ai/plugin/entity/resource nodes', 'update task outputs', 'update run status'],
    currentVisibility: ['workflow history', 'run tasks', 'node status/error', 'output dialog'],
    missingVisibility: ['full input_values inspector', 'per-node resolved prompt/model/resources', 'provider request/response trace'],
  },
  {
    id: 'production_preview_analyze',
    name: 'Production Preview Analyze',
    surface: '/production-preview',
    frontendEntry: 'apps/frontend/src/api/scriptPreview.ts',
    trigger: 'analyzeScriptPreview()',
    endpoint: 'backend: POST /projects/:id/production-preview/analyze',
    requestShape: {
      draft_id: 'string',
      source_text: 'string',
      storyboard_rows: 'ScriptPreviewStoryboardRow[]',
    },
    executionTrace: ['draft context', 'section analysis', 'storyboard suggestions', 'draft save'],
    currentVisibility: ['page message/result state', 'saved draft'],
    missingVisibility: ['whether backend used deterministic or model path', 'analysis steps', 'candidate diff trace'],
  },
  {
    id: 'production_preview_generate',
    name: 'Production Preview Generate Keyframes',
    surface: '/production-preview',
    frontendEntry: 'apps/frontend/src/api/scriptPreview.ts',
    trigger: 'generateScriptPreview()',
    endpoint: 'backend: POST /projects/:id/production-preview/generate-preview',
    requestShape: {
      draft_id: 'string',
      storyboard_rows: 'ScriptPreviewStoryboardRow[]',
    },
    executionTrace: ['storyboard rows', 'keyframe candidate generation', 'asset gaps', 'preview timeline', 'draft save'],
    currentVisibility: ['page keyframe candidates', 'asset gaps', 'timeline preview'],
    missingVisibility: ['per-row generation decision', 'model/provider trace if used', 'candidate provenance'],
  },
  {
    id: 'client_plugin_generation',
    name: 'Client Plugin Generation',
    surface: '/plugins and canvas plugin_card',
    frontendEntry: 'apps/frontend/src/lib/clientPlugins.ts',
    trigger: 'plugin mov.generateImage() or canvas plugin_card run',
    endpoint: 'frontend plugin runtime + backend POST /jobs, GET /jobs/:id',
    requestShape: {
      model_config_id: 'number',
      job_type: 'image | image_edit',
      feature_key: 'client_plugin',
      prompt: 'string',
      input_resource_ids: 'number[]',
      aspect_ratio: 'optional',
      extra_params: 'JSON.stringify(extra_params)',
    },
    executionTrace: ['plugin args', 'sandbox runtime call', 'job create', 'job polling', 'plugin result mapping'],
    currentVisibility: ['plugin card executableSpec/result/error', 'job status if generated through backend'],
    missingVisibility: ['plugin API call transcript', 'job payload inspector', 'provider trace'],
  },
]

export default function AgentDebugPage() {
  const { t } = useTranslation()
  const currentProject = useProjectStore((s) => s.current)
  const [previewMessage, setPreviewMessage] = useState(() => t('agents.debug.defaultPreviewMessage'))
  const [modelForm, setModelForm] = useState({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '', useForChat: true, useForPlanner: true })
  const [modelPaste, setModelPaste] = useState('')
  const [modelPasteError, setModelPasteError] = useState<string | null>(null)
  const [debugRun, setDebugRun] = useState<AgentRun | null>(null)
  const [debugThreadMessages, setDebugThreadMessages] = useState<Array<{ id: string; role: string; content: string; createdAt: string }>>([])
  const [debugRunError, setDebugRunError] = useState<string | null>(null)
  const [debugRunInput, setDebugRunInput] = useState<DebugRunInputSnapshot | null>(null)
  const [approvingRun, setApprovingRun] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

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
  const modelConfig = useQuery<RuntimeModelConfigPublic>({
    queryKey: ['local-agent-model-config', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      const config = await localAgentClient.getModelConfig()
      setModelForm((current) => ({
        ...current,
        baseURL: config.baseURL,
        model: config.model,
        useForChat: config.useForChat,
        useForPlanner: config.useForPlanner,
      }))
      return config
    },
    retry: false,
  })
  const preview = useMutation<AgentRunPreview, Error>({
    mutationFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.previewRun({
        clientInput: {
          message: previewMessage.trim() || t('agents.debug.defaultPreviewMessage'),
          uiSnapshot: {
            ...(currentProject ? {
              project: {
                id: currentProject.ID,
                name: currentProject.name,
                status: currentProject.status,
                description: currentProject.description,
              },
            } : {}),
            route: typeof window !== 'undefined'
              ? { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }
              : undefined,
          },
        },
      })
    },
  })
  const executeRun = useMutation<AgentRun, Error>({
    mutationFn: async () => {
      const message = previewMessage.trim() || t('agents.debug.defaultPreviewMessage')
      const route = typeof window !== 'undefined'
        ? { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }
        : undefined
      setActiveTab('plan')
      setDebugRun(null)
      setDebugRunError(null)
      setDebugThreadMessages([])
      setDebugRunInput({
        message,
        startedAt: new Date().toISOString(),
        ...(route ? { route } : {}),
        ...(currentProject ? {
          project: {
            id: currentProject.ID,
            name: currentProject.name,
            status: currentProject.status,
          },
        } : {}),
      })
      await localAgentClient.ensureRunning()
      const result = await localAgentClient.runMessage({
        message,
        title: 'Agent debug run',
        projectId: currentProject?.ID,
        clientInput: {
          message,
          uiSnapshot: {
            ...(currentProject ? {
              project: {
                id: currentProject.ID,
                name: currentProject.name,
                status: currentProject.status,
                description: currentProject.description,
              },
            } : {}),
            route,
          },
        },
      }, {
        timeoutMs: 45_000,
        pollMs: 400,
        onRunUpdate: (run) => setDebugRun(run),
      })
      setDebugRun(result.run)
      setDebugThreadMessages(result.thread.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })))
      return result.run
    },
    onError: (error) => {
      setActiveTab('plan')
      setDebugRunError(error.message)
    },
  })
  const saveModel = useMutation<RuntimeModelConfigPublic, Error>({
    mutationFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.saveModelConfig({
        baseURL: modelForm.baseURL,
        model: modelForm.model,
        ...(modelForm.apiKey.trim() ? { apiKey: modelForm.apiKey.trim() } : {}),
        useForChat: modelForm.useForChat,
        useForPlanner: modelForm.useForPlanner,
      })
    },
    onSuccess: (config) => {
      setModelForm((current) => ({ ...current, apiKey: '', baseURL: config.baseURL, model: config.model }))
      modelConfig.refetch()
      health.refetch()
    },
  })
  const testModel = useMutation<RuntimeModelTestResult, Error>({
    mutationFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.testModelConfig({
        message: '用一句中文回复：MovScript Runtime 模型连接已成功。',
      })
    },
  })

  const selectedTools = preview.data?.tools ?? capabilities.data?.resolvedTools
  const selectedSkills = preview.data?.skills ?? inspect.data?.skills ?? []
  const selectedManifest = preview.data?.agentManifest ?? inspect.data?.defaultAgentManifest
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
    selectedManifest,
    preview: preview.data,
    previewError: preview.error?.message,
    modelConfig: modelConfig.data,
    modelTest: testModel.data,
    modelTestError: testModel.error?.message,
    debugRun,
    debugThreadMessages,
    debugRunError,
    debugRunInput,
  }), [capabilities.data, debugRun, debugRunError, debugRunInput, debugThreadMessages, health.data, inspect.data, modelConfig.data, preview.data, preview.error, selectedManifest, testModel.data, testModel.error])

  async function approveDebugRun(approvalIds?: string[]) {
    if (!debugRun) return
    setActiveTab('plan')
    setApprovingRun(true)
    setDebugRunError(null)
    try {
      const approvedRun = await localAgentClient.approveRun(debugRun.id, { approvalIds })
      setDebugRun(approvedRun)
      const finalRun = await localAgentClient.waitForRun(approvedRun.id, {
        timeoutMs: 45_000,
        pollMs: 400,
        onRunUpdate: (run) => setDebugRun(run),
      })
      setDebugRun(finalRun)
      const thread = await localAgentClient.getThread(finalRun.threadId)
      setDebugThreadMessages(thread.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })))
    } catch (error) {
      setDebugRunError(error instanceof Error ? error.message : String(error))
    } finally {
      setApprovingRun(false)
    }
  }

  async function rejectDebugRun(approvalIds?: string[]) {
    if (!debugRun) return
    setActiveTab('plan')
    setApprovingRun(true)
    setDebugRunError(null)
    try {
      const rejectedRun = await localAgentClient.rejectRun(debugRun.id, { approvalIds })
      setDebugRun(rejectedRun)
      const thread = await localAgentClient.getThread(rejectedRun.threadId)
      setDebugThreadMessages(thread.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })))
    } catch (error) {
      setDebugRunError(error instanceof Error ? error.message : String(error))
    } finally {
      setApprovingRun(false)
    }
  }

  async function copyRaw() {
    await navigator.clipboard.writeText(rawPayload)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function applyPastedModelConfig() {
    const parsed = parseRuntimeModelPaste(modelPaste)
    if (!parsed) {
      setModelPasteError('Paste JSON copied from Admin models, or paste at least a model id.')
      return
    }
    setModelForm((current) => ({
      ...current,
      ...(parsed.baseURL ? { baseURL: parsed.baseURL } : {}),
      ...(parsed.model ? { model: parsed.model } : {}),
      ...(parsed.apiKey ? { apiKey: parsed.apiKey } : {}),
      ...(typeof parsed.useForChat === 'boolean' ? { useForChat: parsed.useForChat } : {}),
      ...(typeof parsed.useForPlanner === 'boolean' ? { useForPlanner: parsed.useForPlanner } : {}),
    }))
    setModelPasteError(null)
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
                <KeyValue label="Model" value={modelConfig.data?.configured ? `${modelConfig.data.model} (${modelConfig.data.source})` : 'not configured'} />
                <KeyValue label={t('agents.debug.fields.skillsDir')} value={health.data?.pluginCatalog?.skillsDir ?? inspect.data?.pluginCatalog?.skillsDir ?? t('agents.debug.values.unknown')} />
                <KeyValue label={t('agents.debug.fields.toolsDir')} value={health.data?.pluginCatalog?.toolsDir ?? inspect.data?.pluginCatalog?.toolsDir ?? t('agents.debug.values.unknown')} />
              </div>
            </Panel>

            <Panel title="Model Connection" icon={<Bot size={14} />}>
              <div className="space-y-2">
                <Input
                  value={modelForm.baseURL}
                  onChange={(event) => setModelForm((current) => ({ ...current, baseURL: event.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  className="h-8 text-xs"
                />
                <Input
                  value={modelForm.model}
                  onChange={(event) => setModelForm((current) => ({ ...current, model: event.target.value }))}
                  placeholder="gpt-4o-mini"
                  className="h-8 text-xs"
                />
                <Textarea
                  value={modelPaste}
                  onChange={(event) => setModelPaste(event.target.value)}
                  rows={3}
                  placeholder="Paste admin model config JSON here"
                  className="resize-none text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={applyPastedModelConfig}
                  disabled={!modelPaste.trim()}
                >
                  <Clipboard size={13} />
                  Apply Pasted Config
                </Button>
                {modelPasteError && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                    {modelPasteError}
                  </p>
                )}
                <Input
                  type="password"
                  value={modelForm.apiKey}
                  onChange={(event) => setModelForm((current) => ({ ...current, apiKey: event.target.value }))}
                  placeholder={modelConfig.data?.apiKeyConfigured ? 'API key already saved' : 'API key'}
                  className="h-8 text-xs"
                />
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={modelForm.useForChat}
                    onChange={(event) => setModelForm((current) => ({ ...current, useForChat: event.target.checked }))}
                  />
                  Use for chat replies
                </label>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={modelForm.useForPlanner}
                    onChange={(event) => setModelForm((current) => ({ ...current, useForPlanner: event.target.checked }))}
                  />
                  Use for agent planner
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => saveModel.mutate()}
                    disabled={saveModel.isPending}
                  >
                    {saveModel.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => testModel.mutate()}
                    disabled={testModel.isPending || !modelConfig.data?.apiKeyConfigured}
                  >
                    {testModel.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    Test
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {modelConfig.data?.configured ? `Configured: ${modelConfig.data.model} via ${modelConfig.data.source}` : 'No runtime model configured'}
                </div>
                {saveModel.error && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                    {saveModel.error.message}
                  </p>
                )}
                {testModel.error && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                    {testModel.error.message}
                  </p>
                )}
                {testModel.data && (
                  <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    {testModel.data.model} · {testModel.data.latencyMs}ms<br />
                    {testModel.data.content}
                  </p>
                )}
              </div>
            </Panel>

            <Panel title={t('agents.debug.panels.previewInput')} icon={<Bot size={14} />}>
              <div className="space-y-2">
                <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
                  {t('agents.debug.defaultRuntimeManifest')}
                </div>
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
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setActiveTab('plan')
                    executeRun.mutate()
                  }}
                  disabled={executeRun.isPending}
                >
                  {executeRun.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  {executeRun.isPending ? 'Running Debug Run' : 'Execute Debug Run'}
                </Button>
                {(debugRunInput || debugRun || executeRun.isPending || debugRunError) && (
                  <div className="rounded-md border border-border bg-muted/20 p-2 text-[11px]">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">Latest run</span>
                      <Badge variant={runStatusTone(debugRun?.status, executeRun.isPending, debugRunError)} className="text-[9px]">
                        {debugRunStatusLabel(debugRun, executeRun.isPending, debugRunError)}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-muted-foreground">{debugRunInput?.message}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => setActiveTab('plan')}
                    >
                      Open Run Timeline
                    </Button>
                  </div>
                )}
                {preview.error && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                    {preview.error.message}
                  </p>
                )}
                {(executeRun.error || debugRunError) && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                    {debugRunError ?? executeRun.error?.message}
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
          <RunInteractionPanel
            input={debugRunInput}
            run={debugRun}
            threadMessages={debugThreadMessages}
            running={executeRun.isPending}
            approving={approvingRun}
            error={debugRunError ?? executeRun.error?.message ?? null}
            runtimeOnline={health.data?.ok}
            onOpenTimeline={() => setActiveTab('plan')}
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex h-auto w-full justify-start overflow-x-auto rounded-md border border-border bg-background p-1">
              <TabsTrigger value="overview" className="gap-1.5 text-xs"><Activity size={12} /> {t('agents.debug.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="functions" className="gap-1.5 text-xs"><FileJson size={12} /> AI Functions</TabsTrigger>
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

            <TabsContent value="functions" className="mt-0">
              <AIFunctionsTab />
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
              <PlanTab
                preview={preview.data}
                run={debugRun}
                input={debugRunInput}
                threadMessages={debugThreadMessages}
                running={executeRun.isPending}
                error={debugRunError ?? executeRun.error?.message ?? null}
                approving={approvingRun}
                onApprove={approveDebugRun}
                onReject={rejectDebugRun}
              />
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

function AIFunctionsTab() {
  return (
    <div className="space-y-4">
      <Panel title="AI Function Inventory" icon={<FileJson size={14} />}>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Function</th>
                <th className="px-3 py-2">Surface</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Endpoint</th>
                <th className="px-3 py-2">Visibility</th>
              </tr>
            </thead>
            <tbody>
              {AI_FUNCTIONS.map((item) => (
                <tr key={item.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{item.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.frontendEntry}</div>
                  </td>
                  <td className="px-3 py-2">{item.surface}</td>
                  <td className="px-3 py-2">{item.trigger}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">{item.endpoint}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {item.currentVisibility.slice(0, 3).map((value) => (
                        <Badge key={value} variant="outline" className="text-[9px]">{value}</Badge>
                      ))}
                      {item.currentVisibility.length > 3 && <Badge variant="secondary" className="text-[9px]">+{item.currentVisibility.length - 3}</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        {AI_FUNCTIONS.map((item) => (
          <Panel key={item.id} title={item.name} icon={<Bot size={14} />}>
            <div className="space-y-3 text-xs">
              <div className="grid gap-2 md:grid-cols-2">
                <KeyValue label="Surface" value={item.surface} />
                <KeyValue label="Trigger" value={item.trigger} />
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase text-muted-foreground">Endpoint</div>
                <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5 font-mono text-[11px] text-foreground">{item.endpoint}</div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase text-muted-foreground">Request Shape</div>
                <CodeBlock value={safeJSONStringify(item.requestShape)} maxHeight="220px" />
              </div>
              <DebugPills title="Execution Trace" values={item.executionTrace} />
              <DebugPills title="Currently Visible" values={item.currentVisibility} tone="success" />
              <DebugPills title="Missing Visibility" values={item.missingVisibility} tone="warning" />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}

function DebugPills({ title, values, tone = 'neutral' }: { title: string; values: string[]; tone?: 'neutral' | 'success' | 'warning' }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1">
        {values.map((value) => (
          <Badge key={value} variant={tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'outline'} className="text-[9px]">
            {value}
          </Badge>
        ))}
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

function RunInteractionPanel({
  input,
  run,
  threadMessages,
  running,
  approving,
  error,
  runtimeOnline,
  onOpenTimeline,
}: {
  input: DebugRunInputSnapshot | null
  run: AgentRun | null
  threadMessages: Array<{ id: string; role: string; content: string; createdAt: string }>
  running: boolean
  approving: boolean
  error: string | null
  runtimeOnline?: boolean
  onOpenTimeline: () => void
}) {
  if (!input && !run && !running && !error) return null

  const stages = buildRunStages({ input, run, threadMessages, running, approving, error, runtimeOnline })
  const assistantMessage = findAssistantMessage(run, threadMessages)
  const pendingApprovals = (run?.pendingApprovals ?? []).filter((approval) => approval.status === 'pending')

  return (
    <Panel title="Agent Interaction Trace" icon={running || approving ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={runStatusTone(run?.status, running || approving, error)} className="text-[9px]">
                {debugRunStatusLabel(run, running || approving, error)}
              </Badge>
              {input?.startedAt && <Badge variant="outline" className="text-[9px]">started {formatTime(input.startedAt)}</Badge>}
              {run?.id && <Badge variant="outline" className="text-[9px]">{run.id}</Badge>}
              {pendingApprovals.length > 0 && <Badge variant="warning" className="text-[9px]">{pendingApprovals.length} approval pending</Badge>}
            </div>
            <div className="mt-2 rounded-md border border-border bg-muted/20 p-3">
              <div className="mb-1 text-[10px] uppercase text-muted-foreground">User Input</div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{input?.message ?? run?.envelope?.message.content ?? 'No input captured.'}</p>
            </div>
          </div>
          <div className="grid min-w-[220px] gap-2 text-xs">
            <KeyValue label="Runtime" value={runtimeOnline ? 'online' : running ? 'checking' : 'unknown'} />
            <KeyValue label="Thread" value={run?.threadId ?? run?.envelope?.threadId ?? 'pending'} />
            <KeyValue label="Planner" value={String(run?.metadata?.planner ?? (running ? 'resolving' : 'unknown'))} />
            <Button type="button" size="sm" variant="outline" onClick={onOpenTimeline}>
              Open Run Timeline
            </Button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {stages.map((stage) => (
            <div key={stage.id} className={cn('rounded-md border p-3', stageBoxClass(stage.status))}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-foreground">{stage.title}</div>
                <StageIcon status={stage.status} />
              </div>
              <p className="mt-1 min-h-[32px] text-[11px] leading-relaxed text-muted-foreground">{stage.detail}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {assistantMessage && (
          <div className="rounded-md border border-border bg-muted/10 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase text-muted-foreground">Latest Assistant Message</div>
              <Badge variant="outline" className="text-[9px]">{formatTime(assistantMessage.createdAt)}</Badge>
            </div>
            <p className="max-h-28 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">{assistantMessage.content}</p>
          </div>
        )}
      </div>
    </Panel>
  )
}

function PlanTab({
  preview,
  run,
  input,
  threadMessages,
  running,
  error,
  approving,
  onApprove,
  onReject,
}: {
  preview?: AgentRunPreview
  run: AgentRun | null
  input: DebugRunInputSnapshot | null
  threadMessages: Array<{ id: string; role: string; content: string; createdAt: string }>
  running: boolean
  error: string | null
  approving: boolean
  onApprove: (approvalIds?: string[]) => void
  onReject: (approvalIds?: string[]) => void
}) {
  const { t } = useTranslation()
  if (!preview && !run && !input && !running && !error) return <EmptyState text={t('agents.debug.empty.runPlanPreviewHint')} />
  return (
    <div className="space-y-4">
      <DebugRunTimeline
        run={run}
        input={input}
        threadMessages={threadMessages}
        running={running}
        error={error}
        approving={approving}
        onApprove={onApprove}
        onReject={onReject}
      />
      {preview && (
        <>
          <Panel title="Dry-run Plan Preview" icon={<ShieldCheck size={14} />}>
            <div className="space-y-3">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={preview.planner === 'model' ? 'secondary' : 'outline'} className="text-[9px]">
                    {preview.planner} planner
                  </Badge>
                  {preview.plannerWarnings.map((warning) => (
                    <Badge key={warning} variant="warning" className="text-[9px]">{warning}</Badge>
                  ))}
                </div>
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
          <Panel title="Dry-run Approval Preview" icon={<AlertTriangle size={14} />}>
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
        </>
      )}
    </div>
  )
}

function DebugRunTimeline({
  run,
  input,
  threadMessages,
  running,
  error,
  approving,
  onApprove,
  onReject,
}: {
  run: AgentRun | null
  input: DebugRunInputSnapshot | null
  threadMessages: Array<{ id: string; role: string; content: string; createdAt: string }>
  running: boolean
  error: string | null
  approving: boolean
  onApprove: (approvalIds?: string[]) => void
  onReject: (approvalIds?: string[]) => void
}) {
  if (!run) {
    return (
      <Panel title="Executed Run Timeline" icon={<Play size={14} />}>
        {input || running || error ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="Status" value={error ? 'failed' : running ? 'starting' : 'pending'} tone={error ? 'warning' : 'neutral'} />
              <Metric label="Runtime" value={running ? 'checking' : 'unknown'} />
              <Metric label="Thread" value="pending" />
              <Metric label="Steps" value="0" />
            </div>
            {input && (
              <div className="rounded-md border border-border bg-muted/10 p-3">
                <div className="mb-1 text-xs font-semibold text-foreground">Submitted Input</div>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{input.message}</p>
              </div>
            )}
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            ) : (
              <EmptyState text="Starting runtime run. Waiting for thread, planner, and step timeline..." />
            )}
          </div>
        ) : (
          <EmptyState text="Execute a debug run to inspect the actual planner, steps, tool calls, approvals, and final assistant message." />
        )}
      </Panel>
    )
  }

  const pendingApprovals = (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending')
  const assistantMessage = findAssistantMessage(run, threadMessages)

  return (
    <Panel title="Executed Run Timeline" icon={<Play size={14} />}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Run" value={run.id} />
          <Metric label="Status" value={run.status} tone={run.status === 'failed' ? 'warning' : run.status === 'completed' ? 'success' : 'neutral'} />
          <Metric label="Planner" value={String(run.metadata?.planner ?? 'unknown')} tone={run.metadata?.planner === 'model' ? 'success' : 'neutral'} />
          <Metric label="Steps" value={String(run.steps.length)} />
        </div>

        {run.warnings && run.warnings.length > 0 && (
          <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            {run.warnings.map((warning) => (
              <p key={warning} className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {pendingApprovals.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-foreground">Approval Required</div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => onReject(pendingApprovals.map((approval) => approval.id))} disabled={approving}>
                  {approving ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  Reject All
                </Button>
                <Button type="button" size="sm" onClick={() => onApprove(pendingApprovals.map((approval) => approval.id))} disabled={approving}>
                  {approving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Approve All
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {pendingApprovals.map((approval) => (
                <div key={approval.id} className="rounded-md border border-border bg-background p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-foreground">{approval.toolName}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant="warning" className="text-[9px]">{approval.risk ?? approval.permission ?? approval.status}</Badge>
                      <Button type="button" size="xs" variant="outline" onClick={() => onReject([approval.id])} disabled={approving}>Reject</Button>
                      <Button type="button" size="xs" onClick={() => onApprove([approval.id])} disabled={approving}>Approve</Button>
                    </div>
                  </div>
                  <p className="mt-1 text-muted-foreground">{approval.reason}</p>
                  {approval.args && <CodeBlock value={safeJSONStringify(approval.args)} maxHeight="160px" className="mt-2" />}
                  {approval.preview !== undefined && <CodeBlock value={safeJSONStringify(approval.preview)} maxHeight="220px" className="mt-2" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {run.plan && (
          <div className="rounded-md border border-border bg-muted/10 p-3">
            <div className="mb-2 text-xs font-semibold text-foreground">Plan</div>
            <div className="text-sm font-medium text-foreground">{run.plan.objective}</div>
            <p className="mt-1 text-xs text-muted-foreground">{run.plan.strategy}</p>
            <div className="mt-3 space-y-2">
              {run.plan.tasks.map((task, index) => (
                <div key={task.id} className="rounded-md border border-border bg-background p-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-foreground">{index + 1}. {task.title}</div>
                      <p className="mt-1 text-muted-foreground">{task.description}</p>
                    </div>
                    <Badge variant={task.status === 'failed' ? 'destructive' : task.status === 'completed' ? 'success' : task.status === 'skipped' ? 'warning' : 'outline'} className="text-[9px]">
                      {task.status}
                    </Badge>
                  </div>
                  {(task.toolCalls?.length ?? 0) > 0 && <CodeBlock value={safeJSONStringify(task.toolCalls)} maxHeight="160px" className="mt-2" />}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs font-semibold text-foreground">Step Timeline</div>
          {run.steps.length === 0 ? (
            <EmptyState text="No steps recorded yet." />
          ) : (
            run.steps.map((step, index) => (
              <div key={step.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-md border border-border bg-background p-3">
                <div className={cn('flex h-7 w-7 items-center justify-center rounded-full border text-[10px]', stepDotClass(step.status))}>
                  {step.status === 'in_progress' ? <Loader2 size={13} className="animate-spin" /> : step.status === 'completed' ? <Check size={13} /> : <X size={13} />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                    <span className="text-sm font-medium text-foreground">{stepTitle(step)}</span>
                    <Badge variant={step.status === 'failed' ? 'destructive' : step.status === 'completed' ? 'success' : 'secondary'} className="text-[9px]">{step.status}</Badge>
                    <Badge variant="outline" className="text-[9px]">{step.type}</Badge>
                  </div>
                  <div className="mt-1 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                    {step.agentRole && <KeyValue label="Agent" value={step.agentRole} />}
                    {step.toolName && <KeyValue label="Tool" value={step.toolName} />}
                    {step.createdAt && <KeyValue label="Created" value={formatTime(step.createdAt)} />}
                    {step.completedAt && <KeyValue label="Completed" value={formatTime(step.completedAt)} />}
                  </div>
                  {step.args && <CodeBlock value={safeJSONStringify(step.args)} maxHeight="180px" className="mt-2" />}
                  {step.result !== undefined && <CodeBlock value={safeJSONStringify(step.result)} maxHeight="260px" className="mt-2" />}
                  {step.error && <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{step.error}</p>}
                </div>
              </div>
            ))
          )}
        </div>

        {assistantMessage && (
          <div className="rounded-md border border-border bg-muted/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-foreground">Final Assistant Message</div>
              <Badge variant="outline" className="text-[9px]">{formatTime(assistantMessage.createdAt)}</Badge>
            </div>
            <CodeBlock value={assistantMessage.content} maxHeight="320px" />
          </div>
        )}

        <div className="rounded-md border border-border bg-muted/10 p-3">
          <div className="mb-2 text-xs font-semibold text-foreground">Run Raw JSON</div>
          <CodeBlock value={safeJSONStringify(run)} maxHeight="420px" />
        </div>
      </div>
    </Panel>
  )
}

function buildRunStages({
  input,
  run,
  threadMessages,
  running,
  approving,
  error,
  runtimeOnline,
}: {
  input: DebugRunInputSnapshot | null
  run: AgentRun | null
  threadMessages: Array<{ id: string; role: string; content: string; createdAt: string }>
  running: boolean
  approving: boolean
  error: string | null
  runtimeOnline?: boolean
}): Array<{ id: string; title: string; detail: string; status: DebugStageStatus }> {
  const hasRun = Boolean(run)
  const hasThread = Boolean(run?.threadId || run?.envelope?.threadId)
  const hasUserMessage = threadMessages.some((message) => message.role === 'user') || Boolean(input)
  const hasContext = Boolean(run?.envelope?.context)
  const hasPlan = Boolean(run?.plan)
  const pendingApprovals = (run?.pendingApprovals ?? []).filter((approval) => approval.status === 'pending')
  const toolSteps = run?.steps.filter((step) => step.type === 'tool_call') ?? []
  const activeStep = run?.steps.find((step) => step.status === 'in_progress')
  const failedStep = run?.steps.find((step) => step.status === 'failed')
  const assistantMessage = findAssistantMessage(run, threadMessages)
  const runFailed = Boolean(error || run?.status === 'failed' || failedStep)
  const waitingApproval = pendingApprovals.length > 0 || run?.status === 'requires_action'

  return [
    {
      id: 'runtime',
      title: 'Runtime Check',
      detail: runtimeOnline || hasRun ? 'Local Production Runtime accepted the request.' : running ? 'Checking local runtime and endpoint capability.' : 'Runtime has not been checked for this run.',
      status: runFailed && !hasRun ? 'failed' : runtimeOnline || hasRun ? 'complete' : running ? 'active' : 'pending',
    },
    {
      id: 'thread',
      title: 'Thread Setup',
      detail: hasThread ? `Thread ${run?.threadId ?? run?.envelope?.threadId} is bound to this run.` : hasUserMessage ? 'User input captured, waiting for runtime thread id.' : 'No submitted input yet.',
      status: runFailed && !hasThread ? 'failed' : hasThread ? 'complete' : hasUserMessage ? 'active' : 'pending',
    },
    {
      id: 'message',
      title: 'Message Submit',
      detail: hasUserMessage ? 'Debug input was submitted as the user message.' : 'Waiting for Execute Debug Run.',
      status: runFailed && !hasUserMessage ? 'failed' : hasUserMessage ? 'complete' : 'pending',
    },
    {
      id: 'context',
      title: 'Context Pack',
      detail: hasContext ? 'Route, project, manifest, skills, tools, and memory context are attached.' : hasRun || running ? 'Resolving UI snapshot, project context, skills, tools, and memories.' : 'Context resolution starts after execution.',
      status: runFailed && !hasContext ? 'failed' : hasContext ? 'complete' : hasRun || running ? 'active' : 'pending',
    },
    {
      id: 'planner',
      title: 'Planner',
      detail: hasPlan ? `${String(run?.metadata?.planner ?? 'runtime')} planner produced ${run?.plan?.tasks.length ?? 0} task(s).` : hasRun || running ? 'Planner is compiling the prompt and creating a task plan.' : 'No planner output yet.',
      status: runFailed && !hasPlan ? 'failed' : hasPlan ? 'complete' : hasRun || running ? 'active' : 'pending',
    },
    {
      id: 'policy',
      title: 'Tool Policy',
      detail: waitingApproval ? `${pendingApprovals.length || 1} tool action requires approval before continuing.` : hasPlan ? 'Tool grants and approval policy have been evaluated.' : 'Tool policy runs after planning.',
      status: waitingApproval ? 'blocked' : hasPlan ? 'complete' : hasRun || running ? 'active' : 'pending',
    },
    {
      id: 'tools',
      title: 'Tool Execution',
      detail: failedStep ? `${stepTitle(failedStep)} failed.` : activeStep ? `${stepTitle(activeStep)} is running.` : toolSteps.length > 0 ? `${toolSteps.filter((step) => step.status === 'completed').length}/${toolSteps.length} tool step(s) completed.` : hasPlan ? 'No tool execution was required, or execution has not started.' : 'Waiting for planner tool calls.',
      status: failedStep ? 'failed' : waitingApproval ? 'blocked' : activeStep ? 'active' : toolSteps.length > 0 || (hasPlan && run?.status !== 'in_progress') ? 'complete' : hasPlan || running ? 'active' : 'pending',
    },
    {
      id: 'assistant',
      title: 'Assistant Response',
      detail: assistantMessage ? 'Final assistant message is available in the timeline.' : error ? 'Run failed before producing an assistant message.' : waitingApproval ? 'Waiting for approval before the assistant can finish.' : running || approving || run?.status === 'in_progress' ? 'Waiting for assistant response.' : 'No assistant response yet.',
      status: assistantMessage ? 'complete' : runFailed ? 'failed' : waitingApproval ? 'blocked' : running || approving || run?.status === 'in_progress' ? 'active' : 'pending',
    },
  ]
}

function StageIcon({ status }: { status: DebugStageStatus }) {
  if (status === 'active') return <Loader2 size={13} className="animate-spin text-blue-600" />
  if (status === 'complete') return <Check size={13} className="text-emerald-600" />
  if (status === 'failed') return <X size={13} className="text-destructive" />
  if (status === 'blocked') return <AlertTriangle size={13} className="text-amber-600" />
  return <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
}

function stageBoxClass(status: DebugStageStatus) {
  if (status === 'complete') return 'border-emerald-500/30 bg-emerald-500/10'
  if (status === 'active') return 'border-blue-500/30 bg-blue-500/10'
  if (status === 'blocked') return 'border-amber-500/30 bg-amber-500/10'
  if (status === 'failed') return 'border-destructive/30 bg-destructive/10'
  return 'border-border bg-background'
}

function findAssistantMessage(run: AgentRun | null, threadMessages: Array<{ id: string; role: string; content: string; createdAt: string }>) {
  if (!run) return [...threadMessages].reverse().find((message) => message.role === 'assistant')
  return threadMessages.find((message) => message.id === run.assistantMessageId)
    ?? [...threadMessages].reverse().find((message) => message.role === 'assistant')
}

function debugRunStatusLabel(run: AgentRun | null, running: boolean, error?: string | null) {
  if (error) return 'failed'
  if (run?.status === 'requires_action') return 'waiting approval'
  if (run?.status) return run.status
  if (running) return 'starting'
  return 'idle'
}

function runStatusTone(status: AgentRun['status'] | undefined, running: boolean, error?: string | null) {
  if (error || status === 'failed') return 'destructive'
  if (status === 'completed' || status === 'completed_with_warnings') return 'success'
  if (status === 'requires_action') return 'warning'
  if (running || status === 'queued' || status === 'in_progress') return 'secondary'
  return 'outline'
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

function stepTitle(step: AgentRun['steps'][number]) {
  if (step.title) return step.title
  if (step.type === 'planning') return 'Planning'
  if (step.type === 'subagent') return step.agentRole ?? 'Subagent'
  if (step.type === 'tool_call') return step.toolName ?? 'Tool call'
  return 'Assistant message'
}

function stepDotClass(status: AgentRun['steps'][number]['status']) {
  if (status === 'completed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (status === 'failed') return 'border-destructive/30 bg-destructive/10 text-destructive'
  return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function parseRuntimeModelPaste(value: string): Partial<typeof initialRuntimeModelForm> | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    const model = pickString(record, ['model', 'modelId', 'model_id', 'model_def_id', 'model_id_override'])
    const baseURL = pickString(record, ['baseURL', 'base_url', 'url', 'endpoint'])
    const apiKey = pickString(record, ['apiKey', 'api_key'])
    const useForChat = typeof record.useForChat === 'boolean' ? record.useForChat : undefined
    const useForPlanner = typeof record.useForPlanner === 'boolean' ? record.useForPlanner : undefined
    if (!model && !baseURL && !apiKey) return null
    return {
      ...(model ? { model } : {}),
      ...(baseURL ? { baseURL } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(typeof useForChat === 'boolean' ? { useForChat } : {}),
      ...(typeof useForPlanner === 'boolean' ? { useForPlanner } : {}),
    }
  } catch {
    if (/^https?:\/\//.test(trimmed)) return { baseURL: trimmed }
    return { model: trimmed }
  }
}

const initialRuntimeModelForm = {
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
  useForChat: true,
  useForPlanner: true,
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
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
