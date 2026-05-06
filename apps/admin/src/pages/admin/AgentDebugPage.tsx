import { useEffect, useMemo, useState } from 'react'
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileJson,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Label,
  ScrollArea,
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
  type AgentRun,
  type AgentSkillManifest,
  type AgentTraceEvent,
  type AgentRunPreview,
  type ResolvedAgentSkill,
  type ResolvedToolCatalog,
  type RuntimeModelConfigPublic,
  type RuntimeModelTestResult,
} from '@/lib/localAgentClient'
import { publicModelLabel } from '@/lib/modelDisplay'
import { buildCommandFirstClientInput } from '@/lib/agentCommandInput'
import { LocalAgentWorkflowPanel } from '@/components/agent/localRuntime'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { PublicModel } from '@/types'

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

interface AgentArchitectureLayer {
  id: string
  name: string
  scope: string
  owner: string
  entrypoints: string[]
  runtimeArtifacts: string[]
  debugVisibility: string[]
}

interface AgentInteractionCommand {
  command: string
  intent: string
  inputContract: Record<string, unknown>
  runtimeFlow: string[]
  outputContract: Record<string, unknown>
  currentSupport: string
}

interface AgentDebugCommandSpec {
  id: string
  label: string
  agentFunction: string
  command: string
  contextProfile?: string
  outputContractSummary?: string
  endpoint: string
  outputMode: string
  description: string
  requestShape?: Record<string, unknown>
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
    id: 'agent_debug_agentic_loop',
    name: 'Agent Debug Agentic Loop / Run',
    surface: '/agent-debug',
    frontendEntry: 'apps/admin/src/pages/admin/AgentDebugPage.tsx',
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
    executionTrace: ['context pack', 'skill resolution', 'tool capability resolution', 'prompt compilation', 'agentic loop', 'tool policy', 'run steps', 'approval gate', 'model HTTP call', 'assistant message'],
    currentVisibility: ['prompt', 'context', 'tool calls', 'approvals', 'step args/result/error', 'model HTTP request/response body', 'final message', 'raw run JSON'],
    missingVisibility: ['token usage', 'per-step latency'],
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
    id: 'preview_generate',
    name: 'Preview Generate (Drawer)',
    surface: '/segments, /scene-moments, /contents',
    frontendEntry: 'apps/frontend/src/api/preview.ts',
    trigger: 'generatePreview(scope, entityId)',
    endpoint: 'backend: POST /projects/:id/preview/generate',
    requestShape: {
      scope: '"segment" | "scene_moment" | "content_unit"',
      entity_id: 'number',
    },
    executionTrace: ['load entity', 'load related keyframes', 'load asset slots', 'assemble response'],
    currentVisibility: ['keyframes list', 'missing assets list'],
    missingVisibility: [],
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

const AGENT_ARCHITECTURE_LAYERS: AgentArchitectureLayer[] = [
  {
    id: 'product_surface',
    name: 'Product Surface',
    scope: '用户入口和当前工作台上下文',
    owner: 'Electron frontend',
    entrypoints: [
      'apps/admin/src/pages/admin/AgentDebugPage.tsx',
      'apps/frontend/src/components/layout/AIAgentPanel.tsx',
      'apps/frontend/src/mcp/MCPContextBridge.tsx',
    ],
    runtimeArtifacts: ['command message', 'attachments', 'optional ui hints'],
    debugVisibility: ['Agent Debug preview input', 'Context tab', 'Executed run input snapshot'],
  },
  {
    id: 'local_runtime',
    name: 'Local Agent',
    scope: '运行生命周期、agentic loop、权限、草稿和记忆',
    owner: 'apps/agent',
    entrypoints: [
      'apps/agent/src/server.ts',
      'apps/agent/src/runtime/agentRuntime.ts',
    ],
    runtimeArtifacts: ['thread', 'message', 'run', 'policy', 'steps', 'approval requests', 'memories', 'drafts'],
    debugVisibility: ['Overview', 'Manifest', 'Skills', 'Tools', 'Prompt', 'Run Timeline', 'Raw JSON'],
  },
  {
    id: 'business_context',
    name: 'Business Context Layer',
    scope: 'MovScript 项目、剧本、设定、语义生产实体、素材需求和资源',
    owner: 'Go backend + frontend MCP bridge',
    entrypoints: [
      'apps/backend/internal/router/router.go',
      'apps/backend/internal/workflow/entity_schema.go',
      'apps/frontend/src/lib/mcpTools.ts',
    ],
    runtimeArtifacts: ['context pack', 'semantic entities', 'workflow schemas', 'resource bindings', 'canvas tasks'],
    debugVisibility: ['Context JSON', 'Tool result JSON', 'AI Function Inventory'],
  },
  {
    id: 'tool_execution',
    name: 'Tool Execution Layer',
    scope: 'MCP/runtime/plugin 工具解析、授权和执行',
    owner: 'runtime tool registry + MCP tool server',
    entrypoints: [
      'apps/agent/src/runtime/toolRegistry.ts',
      'apps/agent/src/runtime/toolPolicy.ts',
      'apps/agent/catalog/tools',
    ],
    runtimeArtifacts: ['resolved tool catalog', 'blocked tools', 'tool calls', 'tool outcomes'],
    debugVisibility: ['Tools table', 'Approval preview', 'Step timeline args/result/error'],
  },
  {
    id: 'model_layer',
    name: 'Model Layer',
    scope: '最终聊天回复模型和 backend model gateway 配置',
    owner: 'Backend AI model config',
    entrypoints: [
      'apps/agent/src/runtime/modelConfig.ts',
      'apps/agent/src/runtime/assistantMessage.ts',
    ],
    runtimeArtifacts: ['compiled prompt', 'assistant message'],
    debugVisibility: ['Model Connection', 'Prompt tab', 'final assistant message'],
  },
]

const AGENT_INTERACTION_COMMANDS: AgentInteractionCommand[] = [
  {
    command: '/context',
    intent: '查看当前 run 会发送给大模型的完整文本上下文。',
    inputContract: {
      command: '/context',
      payload: 'optional note',
      contextProfile: 'minimal',
      uiSnapshot: 'optional hints only',
    },
    runtimeFlow: [
      'send command message',
      'resolve MCP context pack and memories',
      'compile model gateway messages',
      'return plain text without calling the model gateway',
    ],
    outputContract: {
      text: 'plain text model gateway messages grouped by role',
    },
    currentSupport: 'Agent-only diagnostic command.',
  },
  {
    command: '/memory',
    intent: '列出当前 run 打开的记忆文件，不展示记忆内容。',
    inputContract: {
      command: '/memory',
      payload: 'optional note',
      contextProfile: 'minimal',
    },
    runtimeFlow: ['send command message', 'resolve MCP context pack', 'load memories', 'return file list without calling the model gateway'],
    outputContract: {
      files: ['memory file references only'],
    },
    currentSupport: 'Agent-only diagnostic command.',
  },
]

const AGENT_DEBUG_COMMANDS: AgentDebugCommandSpec[] = [
  {
    id: 'context',
    label: 'Context',
    agentFunction: 'buildContext model gateway messages',
    command: '/context',
    contextProfile: 'minimal',
    outputContractSummary: 'Plain text: all messages that would be sent to the model gateway',
    endpoint: 'POST /runs through clientInput.message',
    outputMode: 'assistant text',
    description: '输出当前会话真正会发送给大模型的上下文文本，不输出 JSON。',
  },
  {
    id: 'memory',
    label: 'Memory',
    agentFunction: 'MemoryManager.loadRelevantMemories',
    command: '/memory',
    contextProfile: 'minimal',
    outputContractSummary: 'Plain text: opened memory file references only',
    endpoint: 'POST /runs through clientInput.message',
    outputMode: 'assistant text',
    description: '只列当前会话打开的记忆文件，不展示记忆内容。',
  },
]

export default function AgentDebugPage() {
  const { t } = useTranslation()
  const currentProject = useProjectStore((s) => s.current)
  const [previewMessage, setPreviewMessage] = useState(() => t('agents.debug.defaultPreviewMessage'))
  const [modelForm, setModelForm] = useState(initialRuntimeModelForm)
  const [debugRun, setDebugRun] = useState<AgentRun | null>(null)
  const [debugThreadMessages, setDebugThreadMessages] = useState<Array<{ id: string; role: string; content: string; createdAt: string }>>([])
  const [debugRunError, setDebugRunError] = useState<string | null>(null)
  const [debugRunInput, setDebugRunInput] = useState<DebugRunInputSnapshot | null>(null)
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null)
  const [approvingRun, setApprovingRun] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('workbench')
  const [statusCollapsed, setStatusCollapsed] = useState(false)

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
  const runHistory = useQuery<{ runs: AgentRun[] }>({
    queryKey: ['local-agent-debug-run-history', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listRuns()
    },
    retry: false,
    refetchInterval: approvingRun ? 1000 : false,
  })
  const modelConfig = useQuery<RuntimeModelConfigPublic>({
    queryKey: ['local-agent-model-config', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      const config = await localAgentClient.getModelConfig()
      setModelForm((current) => ({
        ...current,
        modelConfigId: config.modelConfigId ? String(config.modelConfigId) : current.modelConfigId,
        model: config.model,
        useForChat: config.useForChat,
        useForPlanner: config.useForPlanner,
      }))
      return config
    },
    retry: false,
  })
  const backendTextModels = useQuery<PublicModel[]>({
    queryKey: ['local-agent-backend-text-models'],
    queryFn: () => api.get('/models?capability=text').then((r) => r.data),
    retry: false,
  })
  const preview = useMutation<AgentRunPreview, Error>({
    mutationFn: async () => {
      await localAgentClient.ensureRunning()
      const message = previewMessage.trim() || t('agents.debug.defaultPreviewMessage')
      return localAgentClient.previewRun({
        clientInput: buildCommandFirstClientInput({ message }),
      })
    },
  })
  const executeRun = useMutation<AgentRun, Error, string | undefined>({
    mutationFn: async (messageOverride) => {
      const message = messageOverride?.trim() || previewMessage.trim() || t('agents.debug.defaultPreviewMessage')
      setActiveTab('run')
      setDebugRun(null)
      setDebugRunError(null)
      setDebugThreadMessages([])
      setSelectedHistoryRunId(null)
      setDebugRunInput({
        message,
        startedAt: new Date().toISOString(),
      })
      await localAgentClient.ensureRunning()
      const clientInput = buildCommandFirstClientInput({ message })
      const result = await localAgentClient.runMessage({
        message: clientInput.message,
        title: 'Agent debug run',
        clientInput,
      }, {
        timeoutMs: 45_000,
        pollMs: 400,
        onRunUpdate: (run) => setDebugRun(run),
      })
      setDebugRun(result.run)
      setSelectedHistoryRunId(result.run.id)
      setDebugThreadMessages(result.thread.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })))
      runHistory.refetch()
      setPreviewMessage(message)
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
      const modelConfigId = Number(modelForm.modelConfigId)
      if (!Number.isInteger(modelConfigId) || modelConfigId <= 0) {
        throw new Error('Select a backend text model first')
      }
      return localAgentClient.saveModelConfig({
        modelConfigId,
        model: modelForm.model,
        useForChat: modelForm.useForChat,
        useForPlanner: modelForm.useForPlanner,
      })
    },
    onSuccess: (config) => {
      setModelForm((current) => ({ ...current, modelConfigId: config.modelConfigId ? String(config.modelConfigId) : current.modelConfigId, model: config.model }))
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
    runHistory: runHistory.data,
    runHistoryError: runHistory.error?.message,
    debugRun,
    debugThreadMessages,
    debugRunError,
    debugRunInput,
  }), [capabilities.data, debugRun, debugRunError, debugRunInput, debugThreadMessages, health.data, inspect.data, modelConfig.data, preview.data, preview.error, runHistory.data, runHistory.error, selectedManifest, testModel.data, testModel.error])

  async function approveDebugRun(approvalIds?: string[]) {
    if (!debugRun) return
    setActiveTab('plan')
    setApprovingRun(true)
    setDebugRunError(null)
    try {
      const approvedRun = await localAgentClient.approveRun(debugRun.id, { approvalIds })
      setDebugRun(approvedRun)
      setSelectedHistoryRunId(approvedRun.id)
      const finalRun = await localAgentClient.waitForRun(approvedRun.id, {
        timeoutMs: 45_000,
        pollMs: 400,
        onRunUpdate: (run) => setDebugRun(run),
      })
      setDebugRun(finalRun)
      setSelectedHistoryRunId(finalRun.id)
      const thread = await localAgentClient.getThread(finalRun.threadId)
      setDebugThreadMessages(thread.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })))
      runHistory.refetch()
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
      setSelectedHistoryRunId(rejectedRun.id)
      const thread = await localAgentClient.getThread(rejectedRun.threadId)
      setDebugThreadMessages(thread.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })))
      runHistory.refetch()
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

  function useDebugCommand(command: string) {
    setPreviewMessage(command)
    setActiveTab(command.startsWith('/') ? 'plan' : 'commands')
  }

  async function openHistoryRun(run: AgentRun) {
    setDebugRun(run)
    setSelectedHistoryRunId(run.id)
    setDebugRunInput(buildInputSnapshotFromRun(run))
    setDebugRunError(null)
    setActiveTab('run')
    try {
      const thread = await localAgentClient.getThread(run.threadId)
      setDebugThreadMessages(thread.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })))
    } catch {
      setDebugThreadMessages([])
    }
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

      <div className={cn(
        'grid min-h-0 flex-1 overflow-hidden',
        statusCollapsed ? 'grid-cols-[56px_minmax(0,1fr)]' : 'grid-cols-[300px_minmax(0,1fr)]',
      )}>
        <aside className={cn(
          'min-w-0 border-r border-border bg-muted/10',
          statusCollapsed ? 'overflow-hidden p-2' : 'overflow-y-auto p-4',
        )}>
          {statusCollapsed ? (
            <div className="flex h-full flex-col items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setStatusCollapsed(false)}
                title="Expand status sidebar"
              >
                <ChevronRight size={15} />
              </Button>
              <div
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  health.data?.ok ? 'bg-emerald-500' : health.isFetching ? 'bg-amber-500' : 'bg-destructive',
                )}
                title={health.data?.ok ? t('agents.debug.status.runtimeOnline') : health.isFetching ? t('agents.debug.status.checking') : t('agents.debug.status.runtimeOffline')}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  health.refetch()
                  inspect.refetch()
                  capabilities.refetch()
                }}
                disabled={health.isFetching || inspect.isFetching || capabilities.isFetching}
                title={t('agents.debug.actions.refresh')}
              >
                <RefreshCw size={14} className={cn((health.isFetching || inspect.isFetching || capabilities.isFetching) && 'animate-spin')} />
              </Button>
            </div>
          ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Status</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setStatusCollapsed(true)}
                title="Collapse status sidebar"
              >
                <ChevronLeft size={14} />
              </Button>
            </div>
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
                <div className="rounded-md border border-border bg-muted/20 p-2 text-[11px] text-muted-foreground">
                  <KeyValue label="Provider" value={modelConfig.data?.provider ?? 'backend-model-config'} />
                  <KeyValue label="Source" value={modelConfig.data?.source ?? 'none'} />
                  <KeyValue label="Config path" value={health.data?.modelConfigPath ?? t('agents.debug.values.unknown')} />
                  <KeyValue label="Backend model config ID" value={modelConfig.data?.modelConfigId ? String(modelConfig.data.modelConfigId) : 'not configured'} />
                  <KeyValue label="Model" value={modelConfig.data?.model ?? modelForm.model} />
                  <KeyValue label="Use for chat" value={modelConfig.data?.useForChat ? 'true' : 'false'} />
                  <KeyValue label="Use for legacy planner" value={modelConfig.data?.useForPlanner ? 'true' : 'false'} />
                  <KeyValue label="Credential visibility" value="Backend only; Agent does not store provider API keys." />
                </div>
                <Select
                  value={modelForm.modelConfigId}
                  onValueChange={(value) => {
                    const selected = backendTextModels.data?.find((model) => String(model.id) === value)
                    setModelForm((current) => ({
                      ...current,
                      modelConfigId: value,
                      model: selected ? `model_config:${selected.id}` : current.model,
                    }))
                  }}
                >
                  <SelectTrigger size="sm" className="h-8 text-xs">
                    <SelectValue placeholder={backendTextModels.isFetching ? 'Loading backend models...' : 'Select backend text model'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(backendTextModels.data ?? []).map((model) => (
                      <SelectItem key={model.id} value={String(model.id)}>
                        {publicModelLabel(model, true)}
                      </SelectItem>
                    ))}
                    {(backendTextModels.data ?? []).length === 0 && (
                      <SelectItem value="no-models" disabled>No backend text models</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Input
                  value={modelForm.model}
                  onChange={(event) => setModelForm((current) => ({ ...current, model: event.target.value }))}
                  placeholder="model_config:1"
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
                  Use for legacy planner
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => saveModel.mutate()}
                    disabled={saveModel.isPending}
                  >
                    {saveModel.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    onClick={() => testModel.mutate()}
                    disabled={testModel.isPending || !modelConfig.data?.configured}
                  >
                    {testModel.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    Test
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {modelConfig.data?.configured ? `Configured: ${modelConfig.data.model} via backend model #${modelConfig.data.modelConfigId}` : 'No backend runtime model configured'}
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
                  <div className="space-y-2">
                    <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                      {testModel.data.model} · {testModel.data.latencyMs}ms<br />
                      {testModel.data.content}
                    </p>
                    <div className="rounded-md border border-border bg-muted/20 p-2">
                      <div className="mb-1 text-[11px] font-medium text-foreground">Sent Request</div>
                      <CodeBlock value={safeJSONStringify(testModel.data.request)} maxHeight="220px" className="text-[10px]" />
                    </div>
                  </div>
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
          )}
        </aside>

        <main className="min-w-0 overflow-y-auto p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex h-auto w-full justify-start overflow-x-auto rounded-md border border-border bg-background p-1">
              <TabsTrigger value="workbench" className="gap-1.5 text-xs"><MessageSquare size={12} /> Workbench</TabsTrigger>
              <TabsTrigger value="overview" className="gap-1.5 text-xs"><Activity size={12} /> {t('agents.debug.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="architecture" className="gap-1.5 text-xs"><Database size={12} /> Architecture</TabsTrigger>
              <TabsTrigger value="commands" className="gap-1.5 text-xs"><TerminalSquare size={12} /> Commands</TabsTrigger>
              <TabsTrigger value="functions" className="gap-1.5 text-xs"><FileJson size={12} /> AI Functions</TabsTrigger>
              <TabsTrigger value="manifest" className="gap-1.5 text-xs"><SlidersHorizontal size={12} /> {t('agents.debug.tabs.manifest')}</TabsTrigger>
              <TabsTrigger value="skills" className="gap-1.5 text-xs"><Clipboard size={12} /> {t('agents.debug.tabs.skills')}</TabsTrigger>
              <TabsTrigger value="tools" className="gap-1.5 text-xs"><Wrench size={12} /> {t('agents.debug.tabs.tools')}</TabsTrigger>
              <TabsTrigger value="prompt" className="gap-1.5 text-xs"><FileJson size={12} /> {t('agents.debug.tabs.prompt')}</TabsTrigger>
              <TabsTrigger value="context" className="gap-1.5 text-xs"><Database size={12} /> {t('agents.debug.tabs.context')}</TabsTrigger>
              <TabsTrigger value="plan" className="gap-1.5 text-xs"><ShieldCheck size={12} /> {t('agents.debug.tabs.runs')}</TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5 text-xs"><Activity size={12} /> History</TabsTrigger>
              <TabsTrigger value="run" className="gap-1.5 text-xs"><Play size={12} /> Current Run</TabsTrigger>
              <TabsTrigger value="raw" className="gap-1.5 text-xs"><TerminalSquare size={12} /> {t('agents.debug.tabs.raw')}</TabsTrigger>
            </TabsList>

            <TabsContent value="workbench" className="mt-0">
              <WorkbenchTab
                inspect={inspect.data}
                capabilities={capabilities.data}
                currentProject={currentProject}
                debugMessage={previewMessage}
                debugRun={debugRun}
                debugRunInput={debugRunInput}
                debugRunError={debugRunError ?? executeRun.error?.message ?? null}
                debugRunning={executeRun.isPending}
                onDebugMessageChange={setPreviewMessage}
                onExecuteDebugRun={(message) => {
                  setActiveTab('run')
                  executeRun.mutate(message)
                }}
                onOpenDebugRun={() => setActiveTab('run')}
              />
            </TabsContent>

            <TabsContent value="overview" className="mt-0">
              <OverviewTab
                health={health.data}
                inspect={inspect.data}
                capabilities={capabilities.data}
                preview={preview.data}
                loading={health.isFetching || inspect.isFetching || capabilities.isFetching}
              />
            </TabsContent>

            <TabsContent value="architecture" className="mt-0">
              <ArchitectureTab />
            </TabsContent>

            <TabsContent value="commands" className="mt-0">
              <CommandsTab commands={AGENT_DEBUG_COMMANDS} onUse={useDebugCommand} />
            </TabsContent>

            <TabsContent value="functions" className="mt-0">
              <AIFunctionsTab onUseCommand={useDebugCommand} />
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

            <TabsContent value="history" className="mt-0 h-[calc(100vh-220px)] min-h-[520px] max-h-[760px]">
              <RunHistoryPanel
                runs={runHistory.data?.runs ?? []}
                loading={runHistory.isFetching}
                selectedRunId={selectedHistoryRunId ?? debugRun?.id}
                error={runHistory.error?.message ?? null}
                onRefresh={() => runHistory.refetch()}
                onOpen={openHistoryRun}
                compact
              />
            </TabsContent>

            <TabsContent value="run" className="mt-0 h-[calc(100vh-220px)] min-h-[520px] max-h-[760px]">
              <RightRunPanel
                input={debugRunInput}
                run={debugRun}
                running={executeRun.isPending || approvingRun}
                error={debugRunError ?? executeRun.error?.message ?? null}
                onOpenTimeline={() => setActiveTab('plan')}
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

// ─── Workbench ────────────────────────────────────────────────────────────────

interface WorkbenchSession {
  threadId: string
  title: string
  createdAt: string
  lastRunStatus?: string
  messageCount: number
}

interface WorkbenchRunState {
  run: AgentRun | null
  threadMessages: Array<{ id: string; role: string; content: string; createdAt: string; runId?: string }>
  running: boolean
  loadingThread?: boolean
  error: string | null
}

function buildContextDefault(currentProject: { ID: number; name?: string; status?: string; description?: string } | null): string {
  return JSON.stringify({
    route: { pathname: typeof window !== 'undefined' ? window.location.pathname : '/agent-debug', search: '', hash: '' },
    ...(currentProject ? {
      project: { id: currentProject.ID, name: currentProject.name ?? '', status: currentProject.status ?? '', description: currentProject.description ?? '' },
    } : {}),
    selection: null,
  }, null, 2)
}

function WorkbenchTab({
  inspect,
  capabilities,
  currentProject,
  debugMessage,
  debugRun,
  debugRunInput,
  debugRunError,
  debugRunning,
  onDebugMessageChange,
  onExecuteDebugRun,
  onOpenDebugRun,
}: {
  inspect?: AgentInspectResponse
  capabilities?: AgentCapabilitiesResponse
  currentProject: { ID: number; name?: string; status?: string; description?: string } | null
  debugMessage: string
  debugRun: AgentRun | null
  debugRunInput: DebugRunInputSnapshot | null
  debugRunError: string | null
  debugRunning: boolean
  onDebugMessageChange: (message: string) => void
  onExecuteDebugRun: (message?: string) => void
  onOpenDebugRun: () => void
}) {
  // Sessions
  const [sessions, setSessions] = useState<WorkbenchSession[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)

  // Per-session run state
  const [runStates, setRunStates] = useState<Record<string, WorkbenchRunState>>({})

  // Skill picker: set of enabled skill IDs (null = use defaults)
  const allSkills = inspect?.skills ?? []
  const [skillOverrides, setSkillOverrides] = useState<Record<string, boolean>>({})
  const [useSkillOverride, setUseSkillOverride] = useState(false)

  // Context editor
  const [contextJson, setContextJson] = useState(() => buildContextDefault(currentProject))
  const [contextError, setContextError] = useState<string | null>(null)

  // Tool runner
  const [selectedTool, setSelectedTool] = useState<string>('')
  const [toolArgsJson, setToolArgsJson] = useState('{}')
  const [toolArgsError, setToolArgsError] = useState<string | null>(null)
  const [firingTool, setFiringTool] = useState(false)

  // Message input
  const [message, setMessage] = useState(debugMessage)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [inputTab, setInputTab] = useState<'message' | 'tool' | 'skills' | 'context'>('message')
  const [runRailOpen, setRunRailOpen] = useState(true)

  const availableTools = capabilities?.resolvedTools?.available ?? inspect?.registeredTools?.map((t) => ({ name: t.name, description: t.description })) ?? []

  const activeRunState = activeThreadId ? (runStates[activeThreadId] ?? { run: null, threadMessages: [], running: false, error: null }) : null

  useEffect(() => {
    setMessage(debugMessage)
  }, [debugMessage])

  const draftMessage = message.trim() || debugMessage.trim()

  function setRunState(threadId: string, patch: Partial<WorkbenchRunState>) {
    setRunStates((prev) => {
      const existing = prev[threadId] ?? { run: null, threadMessages: [], running: false, error: null }
      return { ...prev, [threadId]: { ...existing, ...patch } }
    })
  }

  async function loadThreadState(threadId: string, options: { force?: boolean } = {}) {
    const existing = runStates[threadId]
    if (!options.force && existing?.threadMessages.length) return
    setRunState(threadId, { loadingThread: true, error: null })
    try {
      const [thread, runsResult] = await Promise.all([
        localAgentClient.getThread(threadId),
        localAgentClient.listRuns().catch(() => ({ runs: [] as AgentRun[] })),
      ])
      const latestRun = runsResult.runs
        .filter((run) => run.threadId === threadId)
        .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())[0] ?? null
      setRunState(threadId, {
        run: latestRun,
        threadMessages: thread.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, runId: m.runId })),
        loadingThread: false,
        error: null,
      })
      setSessions((prev) => prev.map((s) => s.threadId === threadId ? {
        ...s,
        title: thread.title ?? s.title,
        messageCount: thread.messages.length,
        lastRunStatus: latestRun?.status ?? s.lastRunStatus,
      } : s))
    } catch (err) {
      setRunState(threadId, { loadingThread: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  async function loadSessions() {
    setLoadingSessions(true)
    try {
      await localAgentClient.ensureRunning()
      const { threads } = await localAgentClient.listThreads()
      const nextSessions = threads.map((t) => ({
        threadId: t.id,
        title: t.title ?? t.id.slice(0, 12),
        createdAt: t.createdAt,
        lastRunStatus: t.lastRunStatus,
        messageCount: t.messageCount,
      }))
      setSessions(nextSessions)
      if ((!activeThreadId || !nextSessions.some((session) => session.threadId === activeThreadId)) && nextSessions.length > 0) {
        setActiveThreadId(nextSessions[0].threadId)
      }
    } catch (err) {
      if (activeThreadId) {
        setRunState(activeThreadId, { error: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      setLoadingSessions(false)
    }
  }

  useEffect(() => { loadSessions() }, [])

  useEffect(() => {
    if (!activeThreadId) return
    loadThreadState(activeThreadId)
  }, [activeThreadId])

  async function createSession() {
    await localAgentClient.ensureRunning()
    const thread = await localAgentClient.createThread({ title: `Session ${new Date().toLocaleTimeString()}` })
    const session: WorkbenchSession = { threadId: thread.id, title: thread.title ?? thread.id.slice(0, 12), createdAt: thread.createdAt, messageCount: 0 }
    setSessions((prev) => [session, ...prev])
    setActiveThreadId(thread.id)
    setRunState(thread.id, { run: null, threadMessages: [], running: false, loadingThread: false, error: null })
  }

  async function deleteSession(threadId: string) {
    setSessions((prev) => prev.filter((s) => s.threadId !== threadId))
    if (activeThreadId === threadId) setActiveThreadId(null)
  }

  function buildManifestOverride(): AgentManifest | undefined {
    if (!useSkillOverride) return undefined
    const base = inspect?.defaultAgentManifest
    if (!base) return undefined
    const overriddenSkills = (base.skills ?? []).map((skill) => ({
      ...skill,
      enabled: skillOverrides[skill.id] ?? skill.enabled,
    }))
    return { ...base, skills: overriddenSkills }
  }

  function parseContextSnapshot() {
    try {
      const parsed = JSON.parse(contextJson)
      setContextError(null)
      return parsed
    } catch (err) {
      setContextError(err instanceof Error ? err.message : 'Invalid JSON')
      return null
    }
  }

  async function fireTool() {
    if (!selectedTool || !activeThreadId) return
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(toolArgsJson)
      setToolArgsError(null)
    } catch (err) {
      setToolArgsError(err instanceof Error ? err.message : 'Invalid JSON')
      return
    }
    const snapshot = parseContextSnapshot()
    if (!snapshot) return
    setFiringTool(true)
    setRunState(activeThreadId, { running: true, error: null })
    try {
      const run = await localAgentClient.createToolRun({
        threadId: activeThreadId,
        title: `Tool: ${selectedTool}`,
        toolCall: { name: selectedTool, args },
        agentManifest: buildManifestOverride(),
        clientInput: { message: `fire tool ${selectedTool}`, uiSnapshot: snapshot },
      })
      setRunState(activeThreadId, { run, running: true })
      const finalRun = await localAgentClient.waitForRun(run.id, {
        timeoutMs: 30_000,
        pollMs: 300,
        onRunUpdate: (r) => setRunState(activeThreadId, { run: r }),
      })
      const thread = await localAgentClient.getThread(activeThreadId)
      setRunState(activeThreadId, {
        run: finalRun,
        running: false,
        threadMessages: thread.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, runId: m.runId })),
      })
      setSessions((prev) => prev.map((s) => s.threadId === activeThreadId ? { ...s, messageCount: thread.messages.length } : s))
    } catch (err) {
      setRunState(activeThreadId, { running: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setFiringTool(false)
    }
  }

  async function sendMessage() {
    if (!message.trim() || !activeThreadId) return
    const clientInput = buildCommandFirstClientInput({ message: message.trim() })
    setSendingMessage(true)
    setRunState(activeThreadId, { running: true, error: null })
    try {
      const result = await localAgentClient.runMessage({
        threadId: activeThreadId,
        message: clientInput.message,
        clientInput,
      }, {
        timeoutMs: 60_000,
        pollMs: 400,
        agentManifest: buildManifestOverride(),
        onRunUpdate: (r) => setRunState(activeThreadId, { run: r }),
      })
      setRunState(activeThreadId, {
        run: result.run,
        running: false,
        threadMessages: result.thread.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, runId: m.runId })),
      })
      setSessions((prev) => prev.map((s) => s.threadId === activeThreadId ? { ...s, messageCount: result.thread.messages.length, lastRunStatus: result.run.status } : s))
      setMessage('')
    } catch (err) {
      setRunState(activeThreadId, { running: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setSendingMessage(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[520px] max-h-[760px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Agent Workbench</h2>
            {debugRun && (
              <Badge variant={runStatusTone(debugRun.status, debugRunning, debugRunError)} className="text-[9px]">
                {debugRunStatusLabel(debugRun, debugRunning, debugRunError)}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Session runs, tool calls, skills, context, preview, and debug execution share one workspace.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onOpenDebugRun} disabled={!debugRun && !debugRunInput && !debugRunning && !debugRunError}>
          <Play size={13} />
          Current Run
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] overflow-hidden">
      {/* Sessions sidebar */}
      <div className="flex min-h-0 flex-col border-r border-border bg-muted/10">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold text-foreground">Sessions</span>
          <div className="flex items-center gap-1">
            <Button type="button" size="xs" variant="ghost" onClick={loadSessions} disabled={loadingSessions}>
              <RefreshCw size={11} className={loadingSessions ? 'animate-spin' : ''} />
            </Button>
            <Button type="button" size="xs" variant="outline" onClick={createSession}>
              <Plus size={11} />
              New
            </Button>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-2">
            {sessions.length === 0 && (
              <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">No sessions yet. Create one to start.</p>
            )}
            {sessions.map((session) => {
              const isActive = session.threadId === activeThreadId
              const state = runStates[session.threadId]
              return (
                <div
                  key={session.threadId}
                  className={cn(
                    'group flex cursor-pointer items-start justify-between gap-1 rounded-md border p-2 transition-colors',
                    isActive ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:border-border hover:bg-muted/20',
                  )}
                  onClick={() => setActiveThreadId(session.threadId)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-foreground">{session.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{session.messageCount} msg</span>
                      {(state?.running || state?.loadingThread) && <Loader2 size={9} className="animate-spin text-blue-500" />}
                      {session.lastRunStatus === 'completed' && !state?.running && <span className="text-[9px] text-emerald-600">done</span>}
                      {session.lastRunStatus === 'failed' && !state?.running && <span className="text-[9px] text-destructive">failed</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); deleteSession(session.threadId) }}
                  >
                    <Trash2 size={11} className="text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main area */}
      {!activeThreadId ? (
        <div className="flex min-h-0 items-center justify-center overflow-auto p-8 text-center text-sm text-muted-foreground">
          Select a session or create a new one to start debugging.
        </div>
      ) : (
        <div className="flex min-h-0 flex-col">
          {/* Tab bar */}
          <div className="flex shrink-0 items-center gap-0 border-b border-border px-3">
            {([
              { id: 'message', label: 'Message', icon: <MessageSquare size={11} /> },
              { id: 'tool', label: 'Tool Runner', icon: <Wrench size={11} /> },
              { id: 'skills', label: 'Skills', icon: <Clipboard size={11} />, badge: useSkillOverride ? 'override' : undefined },
              { id: 'context', label: 'Context', icon: <Database size={11} /> },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInputTab(tab.id)}
                className={cn(
                  'flex items-center gap-1 border-b-2 px-3 py-2 text-xs transition-colors',
                  inputTab === tab.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.icon}
                {tab.label}
                {'badge' in tab && tab.badge && (
                  <Badge variant="warning" className="ml-1 text-[8px]">{tab.badge}</Badge>
                )}
              </button>
            ))}
          </div>

          {/* Output area */}
          <WorkbenchRunOutput
            state={activeRunState}
            runRailOpen={runRailOpen}
            onRunRailOpenChange={setRunRailOpen}
          />

          {/* Input area — always visible, content switches by inputTab */}
          <div className="shrink-0 border-t border-border bg-background/95 p-3">
            {inputTab === 'message' && (
              <div className="space-y-2">
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">Available Commands</span>
                    <span className="text-[10px] text-muted-foreground">Click to insert</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {AGENT_DEBUG_COMMANDS.filter((item) => item.command.startsWith('/')).slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setMessage(item.command)
                          onDebugMessageChange(item.command)
                        }}
                        className="rounded border border-border bg-background px-2 py-1 font-mono text-[10px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                        title={`${item.label}: ${item.description}`}
                      >
                        {item.command.split(/\s+/, 1)[0]}
                      </button>
                    ))}
                  </div>
                </div>
                <Textarea
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value)
                    onDebugMessageChange(e.target.value)
                  }}
                  placeholder="Send a message to the agent... (⌘+Enter to run)"
                  rows={3}
                  className="resize-none text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendMessage() }
                  }}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-[11px] text-muted-foreground">
                    {debugRunInput ? `Latest debug input: ${debugRunInput.message.slice(0, 80)}` : 'Session Run sends only the command message; runtime resolves context through tools.'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      className="!h-8 !w-40 shrink-0"
                      onClick={() => onExecuteDebugRun(draftMessage)}
                      disabled={debugRunning}
                    >
                      {debugRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      {debugRunning ? 'Running Debug Run' : 'Execute Debug Run'}
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      className="!h-8 !w-40 shrink-0"
                      onClick={sendMessage}
                      disabled={sendingMessage || !message.trim() || !activeThreadId}
                    >
                      {sendingMessage ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      Session Run
                    </Button>
                  </div>
                </div>
                {debugRunError && (
                  <div className="space-y-1">
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">{debugRunError}</p>
                  </div>
                )}
              </div>
            )}

            {inputTab === 'tool' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Select value={selectedTool} onValueChange={setSelectedTool}>
                    <SelectTrigger size="sm" className="h-8 flex-1 text-xs">
                      <SelectValue placeholder="Select a tool to fire..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTools.map((tool) => (
                        <SelectItem key={'name' in tool ? tool.name : ''} value={'name' in tool ? tool.name : ''}>
                          {'name' in tool ? tool.name : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" onClick={fireTool} disabled={firingTool || !selectedTool}>
                    {firingTool ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    Fire
                  </Button>
                </div>
                <Textarea
                  value={toolArgsJson}
                  onChange={(e) => setToolArgsJson(e.target.value)}
                  placeholder='{"key": "value"}'
                  rows={3}
                  className="resize-none font-mono text-xs"
                />
                {toolArgsError && <p className="text-[11px] text-destructive">Args: {toolArgsError}</p>}
                {contextError && <p className="text-[11px] text-destructive">Context: {contextError}</p>}
              </div>
            )}

            {inputTab === 'skills' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="skill-override-toggle"
                    checked={useSkillOverride}
                    onChange={(e) => setUseSkillOverride(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <Label htmlFor="skill-override-toggle" className="text-xs">Override skills for this run</Label>
                  {useSkillOverride && (
                    <Button type="button" size="xs" variant="ghost" onClick={() => setSkillOverrides({})}>Reset</Button>
                  )}
                </div>
                {allSkills.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No skills loaded. Run inspect first.</p>
                ) : (
                  <div className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
                    {allSkills.map((skill) => {
                      const enabled = skillOverrides[skill.id] ?? skill.enabled
                      return (
                        <label
                          key={skill.id}
                          className={cn(
                            'flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs transition-colors',
                            useSkillOverride ? 'hover:bg-muted/20' : 'cursor-default opacity-60',
                            enabled ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-background',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={!useSkillOverride}
                            onChange={(e) => setSkillOverrides((prev) => ({ ...prev, [skill.id]: e.target.checked }))}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{skill.name}</div>
                            <div className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{skill.description}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {inputTab === 'context' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">Optional manual uiSnapshot for tool workbench runs</span>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setContextJson(buildContextDefault(currentProject))}>
                    Reset
                  </Button>
                </div>
                <Textarea
                  value={contextJson}
                  onChange={(e) => { setContextJson(e.target.value); setContextError(null) }}
                  rows={5}
                  className="resize-none font-mono text-xs"
                />
                {contextError && <p className="text-[11px] text-destructive">{contextError}</p>}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function WorkbenchRunOutput({
  state,
  runRailOpen,
  onRunRailOpenChange,
}: {
  state: WorkbenchRunState | null
  runRailOpen: boolean
  onRunRailOpenChange: (open: boolean) => void
}) {
  if (!state) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-xs text-muted-foreground">
        No run yet for this session.
      </div>
    )
  }

  const { run, threadMessages, running, loadingThread, error } = state
  const orderedSteps = run ? orderRunStepsChronologically(run.steps) : []
  const userMessage = [...threadMessages].reverse().find((m) => m.role === 'user')
  const traceEvents = run ? normalizeTraceEvents(run, threadMessages) : []
  const setupEvents = traceEvents.filter((event) => ['run', 'message', 'context', 'memory', 'manifest', 'skill', 'tool_catalog', 'policy', 'prompt'].includes(event.kind))
  const modelEvents = traceEvents.filter((event) => event.kind === 'model_call')
  const toolEvents = traceEvents.filter((event) => event.kind === 'tool_call' || event.kind === 'approval')
  const assistantEvents = traceEvents.filter((event) => event.kind === 'assistant' || event.kind === 'error')
  const toolSteps = orderedSteps.filter((step) => step.type === 'tool_call')
  const messageSteps = orderedSteps.filter((step) => step.type === 'message')

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">完整对话</h3>
              <Badge variant={runStatusTone(run?.status, running, error)} className="text-[9px]">
                {run?.status ?? (running ? 'running' : loadingThread ? 'loading' : 'idle')}
              </Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {threadMessages.length} 条消息 · {userMessage ? `最近输入 ${formatTime(userMessage.createdAt)}` : '暂无用户输入'}
            </p>
          </div>
          <Button type="button" size="xs" variant="outline" onClick={() => onRunRailOpenChange(!runRailOpen)}>
            {runRailOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
            {runRailOpen ? '隐藏节点' : '运行节点'}
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-4">
            {loadingThread && threadMessages.length === 0 && (
              <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-muted/10 p-6 text-xs text-muted-foreground">
                <Loader2 size={13} className="animate-spin" />
                正在加载历史会话...
              </div>
            )}
            {threadMessages.length === 0 && !loadingThread ? (
              <EmptyState text="这个 session 还没有会话消息。发送一条消息后，这里会按文本对话框展示完整的人和大模型对话。" />
            ) : (
              threadMessages.map((message) => (
                <WorkbenchMessageBubble key={message.id} message={message} activeRunId={run?.id} />
              ))
            )}
            {running && (
              <div className="flex items-center gap-2 self-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-300">
                <Loader2 size={12} className="animate-spin" />
                Agent 正在运行
              </div>
            )}
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>
            )}
          </div>
        </ScrollArea>
      </main>

      {runRailOpen ? (
        <aside className="flex w-[390px] shrink-0 flex-col overflow-hidden border-l border-border bg-muted/10">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Activity size={13} className="text-muted-foreground" />
                <h3 className="text-xs font-semibold text-foreground">运行节点</h3>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{run?.id ?? '还没有运行记录'}</p>
            </div>
            <Button type="button" size="xs" variant="ghost" onClick={() => onRunRailOpenChange(false)}>
              <ChevronRight size={12} />
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-3">
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Run" value={run?.status ?? (running ? 'running' : 'idle')} tone={run?.status === 'failed' || error ? 'warning' : run?.status === 'completed' ? 'success' : 'neutral'} />
                <Metric label="Command" value={getWorkbenchCommandLabel(userMessage?.content)} />
                <Metric label="Model Calls" value={String(groupModelHTTPCalls(modelEvents).length)} tone={modelEvents.some((event) => event.status === 'failed') ? 'warning' : 'neutral'} />
                <Metric label="Tool Steps" value={String(toolSteps.length)} />
              </div>

              {!run ? (
                <EmptyState text="当前 session 还没有 run。历史消息会先显示在左侧；发送消息或执行工具后，这里会记录节点。" />
              ) : (
                <>
                  <WorkbenchCollapsibleSection title="系统准备" badge={String(setupEvents.length)}>
                    <WorkbenchEventList events={setupEvents} empty="No setup events recorded yet." />
                  </WorkbenchCollapsibleSection>
                  <WorkbenchCollapsibleSection title="发送给模型" badge={String(groupModelHTTPCalls(modelEvents).length)}>
                    {modelEvents.length === 0 ? (
                      <div className="rounded-md border border-border bg-muted/10 p-3 text-xs leading-relaxed text-muted-foreground">
                        No model gateway call was recorded. Runtime commands such as <code className="font-mono">/context</code> and <code className="font-mono">/memory</code> can be answered locally after context preparation.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {groupModelHTTPCalls(modelEvents).map((call, index) => (
                          <ModelHTTPCallPanel key={call.id} call={call} index={index} />
                        ))}
                      </div>
                    )}
                  </WorkbenchCollapsibleSection>
                  <WorkbenchCollapsibleSection title="工具与策略" badge={String(toolEvents.length + toolSteps.length)}>
                    {toolEvents.length === 0 && toolSteps.length === 0 ? (
                      <EmptyState text="No tool calls or approval events were needed for this run." />
                    ) : (
                      <div className="space-y-2">
                        <WorkbenchEventList events={toolEvents} empty="No tool events recorded." />
                        {toolSteps.map((step, index) => (
                          <WorkbenchStepCard key={step.id} step={step} index={index} />
                        ))}
                      </div>
                    )}
                  </WorkbenchCollapsibleSection>
                  <WorkbenchCollapsibleSection title="最终处理" badge={String(assistantEvents.length + messageSteps.length)}>
                    <div className="space-y-2">
                      <WorkbenchEventList events={assistantEvents} empty="No assistant or error events recorded yet." />
                      {messageSteps.map((step, index) => (
                        <WorkbenchStepCard key={step.id} step={step} index={index} />
                      ))}
                    </div>
                  </WorkbenchCollapsibleSection>
                </>
              )}
            </div>
          </ScrollArea>
        </aside>
      ) : (
        <div className="flex w-10 shrink-0 justify-center border-l border-border bg-muted/10 py-3">
          <Button type="button" size="xs" variant="ghost" className="h-8 w-8 p-0" onClick={() => onRunRailOpenChange(true)} title="显示运行节点">
            <ChevronLeft size={13} />
          </Button>
        </div>
      )}
    </div>
  )
}

function WorkbenchMessageBubble({
  message,
  activeRunId,
}: {
  message: { id: string; role: string; content: string; createdAt: string; runId?: string }
  activeRunId?: string
}) {
  const role = message.role === 'user' ? '用户' : message.role === 'assistant' ? '大模型' : '系统'
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[78%] rounded-lg border px-3 py-2 shadow-sm', isUser
        ? 'border-primary/30 bg-primary/10 text-foreground'
        : isAssistant
          ? 'border-border bg-card text-foreground'
          : 'border-dashed border-border bg-muted/20 text-muted-foreground',
      )}>
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Badge variant={isUser ? 'secondary' : isAssistant ? 'outline' : 'warning'} className="text-[9px]">{role}</Badge>
            {activeRunId && message.runId === activeRunId ? <Badge variant="secondary" className="text-[8px]">run reply</Badge> : null}
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{message.content || '（空消息）'}</p>
      </div>
    </div>
  )
}

function WorkbenchCollapsibleSection({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-border bg-background">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ChevronRight size={13} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
          <span className="truncate text-xs font-semibold text-foreground">{title}</span>
        </div>
        <Badge variant="outline" className="text-[9px]">{badge}</Badge>
      </summary>
      <div className="border-t border-border p-2">
        {children}
      </div>
    </details>
  )
}

function WorkbenchSection({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        <Badge variant="outline" className="text-[9px]">{badge}</Badge>
      </div>
      {children}
    </section>
  )
}

function WorkbenchEventList({ events, empty }: { events: AgentTraceEvent[]; empty: string }) {
  if (events.length === 0) return <EmptyState text={empty} />
  return (
    <div className="space-y-1.5">
      {events.map((event, index) => (
        <TraceEventRow key={event.id} event={event} index={index} compact />
      ))}
    </div>
  )
}

function WorkbenchStepCard({ step, index }: { step: AgentRun['steps'][number]; index: number }) {
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 rounded-md border border-border bg-background p-2">
      <div className={cn('flex h-6 w-6 items-center justify-center rounded-full border text-[9px]', stepDotClass(step.status))}>
        {step.status === 'in_progress' ? <Loader2 size={11} className="animate-spin" /> : step.status === 'completed' ? <Check size={11} /> : <X size={11} />}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">#{index + 1}</span>
          <span className="text-xs font-medium text-foreground">{stepTitle(step)}</span>
          <Badge variant={step.status === 'failed' ? 'destructive' : step.status === 'completed' ? 'success' : 'secondary'} className="text-[8px]">{step.status}</Badge>
          <Badge variant="outline" className="text-[8px]">{step.type}</Badge>
          {step.roundSource && <Badge variant="secondary" className="text-[8px]">{step.roundSource}</Badge>}
          {step.toolName && <Badge variant="outline" className="text-[8px]">{step.toolName}</Badge>}
        </div>
        {step.args && <CodeBlock value={safeJSONStringify(step.args)} maxHeight="140px" className="mt-1.5" />}
        {step.result !== undefined && <CodeBlock value={safeJSONStringify(step.result)} maxHeight="200px" className="mt-1.5" />}
        {step.error && <p className="mt-1 rounded border border-destructive/30 bg-destructive/10 p-1.5 text-[11px] text-destructive">{step.error}</p>}
      </div>
    </div>
  )
}

function getWorkbenchCommandLabel(message?: string) {
  if (!message) return 'none'
  const trimmed = message.trim()
  if (!trimmed.startsWith('/')) return 'chat'
  return trimmed.split(/\s+/, 1)[0] || 'command'
}

// ─── End Workbench ─────────────────────────────────────────────────────────────

function ArchitectureTab() {
  return (
    <div className="space-y-4">
      <Panel title="Agent Runtime Architecture" icon={<Database size={14} />}>
        <div className="space-y-3">
          {AGENT_ARCHITECTURE_LAYERS.map((layer, index) => (
            <div key={layer.id} className="grid gap-3 rounded-md border border-border bg-background p-3 lg:grid-cols-[180px_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[9px]">L{index + 1}</Badge>
                  <div className="text-sm font-medium text-foreground">{layer.name}</div>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{layer.scope}</p>
                <div className="mt-2 text-[10px] uppercase text-muted-foreground">Owner</div>
                <div className="font-mono text-[11px] text-foreground">{layer.owner}</div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <DebugPills title="Entrypoints" values={layer.entrypoints} />
                <DebugPills title="Runtime Artifacts" values={layer.runtimeArtifacts} tone="success" />
                <DebugPills title="Debug Visibility" values={layer.debugVisibility} tone="warning" />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Business Layer Flow" icon={<Clipboard size={14} />}>
          <div className="space-y-2 text-xs">
            {[
              'Project -> Script/Setting -> Segment/SceneMoment -> StoryboardLine -> ContentUnit/Keyframe -> AssetSlot -> Preview/Delivery',
              '业务实体由 Go backend 和语义/workflow schema 维护，runtime 通过 MCP context pack 和工具读取。',
              '写入类动作先落为 draft 或 approval request，避免 agent 直接改正式项目数据。',
            ].map((line) => (
              <div key={line} className="rounded-md border border-border bg-muted/20 px-3 py-2 text-foreground">{line}</div>
            ))}
          </div>
        </Panel>
        <Panel title="Runtime Run Flow" icon={<Activity size={14} />}>
          <div className="space-y-2 text-xs">
            {[
              'clientInput -> thread/message -> context pack',
              'skills + manifest + tools + memories -> prompt preview',
              'agentic loop -> tool policy -> approvals',
              'tool call steps -> assistant message -> memory extraction',
            ].map((line) => (
              <div key={line} className="rounded-md border border-border bg-muted/20 px-3 py-2 font-mono text-[11px] text-foreground">{line}</div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Interaction Commands" icon={<TerminalSquare size={14} />}>
        <div className="grid gap-3 xl:grid-cols-3">
          {AGENT_INTERACTION_COMMANDS.map((item) => (
            <div key={item.command} className="rounded-md border border-border bg-background p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-sm font-semibold text-foreground">{item.command}</div>
                <Badge variant="outline" className="text-[9px]">contract</Badge>
              </div>
              <p className="mt-2 leading-relaxed text-muted-foreground">{item.intent}</p>
              <DebugPills title="Runtime Flow" values={item.runtimeFlow} />
              <div className="mt-3">
                <div className="mb-1 text-[10px] uppercase text-muted-foreground">Input Contract</div>
                <CodeBlock value={safeJSONStringify(item.inputContract)} maxHeight="160px" />
              </div>
              <div className="mt-3">
                <div className="mb-1 text-[10px] uppercase text-muted-foreground">Output Contract</div>
                <CodeBlock value={safeJSONStringify(item.outputContract)} maxHeight="220px" />
              </div>
              <p className="mt-2 rounded-md border border-border bg-muted/20 p-2 text-[11px] text-muted-foreground">{item.currentSupport}</p>
            </div>
          ))}
        </div>
      </Panel>
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

function CommandsTab({ commands, onUse }: { commands: AgentDebugCommandSpec[]; onUse: (command: string) => void }) {
  return (
    <div className="space-y-4">
      <Panel title="Agent Function Command Matrix" icon={<TerminalSquare size={14} />}>
        <div className="grid gap-3 xl:grid-cols-2">
          {commands.map((item) => (
            <div key={item.id} className="rounded-md border border-border bg-background p-3 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{item.label}</h3>
                    <Badge variant="outline" className="text-[9px]">{item.outputMode}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.agentFunction}</p>
                </div>
                <Button type="button" size="xs" variant="outline" onClick={() => onUse(item.command)}>
                  <Play size={12} />
                  Use
                </Button>
              </div>
              <p className="mt-2 leading-relaxed text-muted-foreground">{item.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.contextProfile && <Badge variant="secondary" className="text-[9px]">context: {item.contextProfile}</Badge>}
                <Badge variant="secondary" className="text-[9px]">message-driven</Badge>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div>
                  <div className="mb-1 text-[10px] uppercase text-muted-foreground">Command</div>
                  <CodeBlock value={item.command} maxHeight="120px" />
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase text-muted-foreground">Endpoint</div>
                  <div className="rounded-md border border-border bg-muted/20 px-2 py-2 font-mono text-[11px] text-foreground">
                    {item.endpoint}
                  </div>
                </div>
              </div>
              {item.outputContractSummary && (
                <div className="mt-3">
                  <div className="mb-1 text-[10px] uppercase text-muted-foreground">Output Contract</div>
                  <div className="rounded-md border border-border bg-muted/20 px-2 py-2 text-[11px] text-foreground">
                    {item.outputContractSummary}
                  </div>
                </div>
              )}
              {item.requestShape && (
                <div className="mt-3">
                  <div className="mb-1 text-[10px] uppercase text-muted-foreground">Tool Run Payload</div>
                  <CodeBlock value={safeJSONStringify(item.requestShape)} maxHeight="180px" />
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function AIFunctionsTab({ onUseCommand }: { onUseCommand: (command: string) => void }) {
  return (
    <div className="space-y-4">
      <Panel title="Command-first Debugging" icon={<TerminalSquare size={14} />}>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {AGENT_DEBUG_COMMANDS.slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onUseCommand(item.command)}
              className="rounded-md border border-border bg-background p-3 text-left text-xs transition-colors hover:border-primary/50 hover:bg-muted/20"
            >
              <div className="font-mono text-[11px] text-foreground">{item.command}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{item.agentFunction}</div>
            </button>
          ))}
        </div>
      </Panel>

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

function RunHistoryPanel({
  runs,
  loading,
  selectedRunId,
  error,
  onRefresh,
  onOpen,
  compact = false,
}: {
  runs: AgentRun[]
  loading: boolean
  selectedRunId?: string | null
  error: string | null
  onRefresh: () => void
  onOpen: (run: AgentRun) => void
  compact?: boolean
}) {
  const recentRuns = orderRunsChronologically(getMostRecentRuns(runs, 12))
  return (
    <Panel
      title="Run History"
      icon={loading ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
      className={cn(compact ? 'h-full min-h-0 overflow-hidden' : 'h-[420px] overflow-hidden')}
      bodyClassName="flex min-h-0 flex-1 flex-col p-3"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground">{runs.length} persisted run(s)</div>
          <Button type="button" size="xs" variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={12} />
            Refresh
          </Button>
        </div>
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
            {error}
          </p>
        )}
        {recentRuns.length === 0 ? (
          <EmptyState text="No executed run history yet." />
        ) : (
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {recentRuns.map((run) => {
              const selected = run.id === selectedRunId
              const firstUserMessage = extractRunMessage(run)
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onOpen(run)}
                  className={cn(
                    'w-full rounded-md border p-2 text-left transition-colors',
                    selected ? 'border-primary/50 bg-primary/5' : 'border-border bg-background hover:border-primary/30 hover:bg-muted/20',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={runStatusTone(run.status, false)} className="text-[9px]">{run.status}</Badge>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(run.createdAt)}</span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-foreground" title={run.id}>{run.id}</div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {firstUserMessage || `${run.steps.length} step(s), ${run.traceEvents?.length ?? 0} event(s)`}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[9px]">{run.steps.length} steps</Badge>
                    <Badge variant="outline" className="text-[9px]">{run.traceEvents?.length ?? 0} events</Badge>
                    {run.pendingApprovals?.some((approval) => approval.status === 'pending') && (
                      <Badge variant="warning" className="text-[9px]">approval</Badge>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Panel>
  )
}

function RightRunPanel({
  input,
  run,
  running,
  error,
  onOpenTimeline,
}: {
  input: DebugRunInputSnapshot | null
  run: AgentRun | null
  running: boolean
  error: string | null
  onOpenTimeline: () => void
}) {
  const recentSteps = run ? orderRunStepsChronologically(run.steps).slice(-8) : []
  const recentStepOffset = run ? Math.max(0, run.steps.length - recentSteps.length) : 0
  return (
    <Panel
      title="Current Run"
      icon={running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
      className="h-full min-h-0 overflow-hidden"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-3 p-3"
    >
      {!input && !run && !running && !error ? (
        <EmptyState text="Execute Debug Run from Workbench to inspect the current run here." />
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={runStatusTone(run?.status, running, error)} className="text-[9px]">
                {debugRunStatusLabel(run, running, error)}
              </Badge>
              {input?.startedAt && <span className="text-[10px] text-muted-foreground">{formatTime(input.startedAt)}</span>}
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-2">
              <div className="mb-1 text-[10px] uppercase text-muted-foreground">Input</div>
              <p className="max-h-28 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">
                {input?.message ?? 'No input captured.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label="Thread" value={run?.threadId ?? 'pending'} />
            <Metric label="Steps" value={run ? String(run.steps.length) : running ? '...' : '0'} />
          </div>

          {run && recentSteps.length > 0 && (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Recent Steps</div>
              <div className="space-y-1.5">
                {recentSteps.map((step, index) => (
                  <div key={step.id} className="rounded-md border border-border bg-background p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">#{recentStepOffset + index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{stepTitle(step)}</span>
                      <Badge variant={step.status === 'failed' ? 'destructive' : step.status === 'completed' ? 'success' : 'secondary'} className="text-[8px]">
                        {step.status}
                      </Badge>
                    </div>
                    {step.error && <p className="mt-1 line-clamp-2 text-[10px] text-destructive">{step.error}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
              {error}
            </p>
          )}

          <Button type="button" size="sm" variant="outline" className="w-full" onClick={onOpenTimeline}>
            Open Run Timeline
          </Button>
        </>
      )}
    </Panel>
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
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{input?.message ?? 'No input captured.'}</p>
            </div>
          </div>
          <div className="grid min-w-[220px] gap-2 text-xs">
            <KeyValue label="Runtime" value={runtimeOnline ? 'online' : running ? 'checking' : 'unknown'} />
            <KeyValue label="Thread" value={run?.threadId ?? 'pending'} />
            <KeyValue label="Loop" value={run ? `${run.steps.length} step(s)` : running ? 'running' : 'unknown'} />
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
          <Panel title="Agentic Loop Preview" icon={<ShieldCheck size={14} />}>
            <div className="space-y-3">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={preview.policy?.sandboxMode ? 'secondary' : 'outline'} className="text-[9px]">
                    sandbox {preview.policy?.sandboxMode ? 'on' : 'off'}
                  </Badge>
                  {preview.warnings.map((warning) => (
                    <Badge key={warning} variant="warning" className="text-[9px]">{warning}</Badge>
                  ))}
                </div>
                <h3 className="text-sm font-medium text-foreground">{preview.message}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  project: {preview.currentProjectId ?? 'none'} · memories: {preview.memoryCount} · tool calls: {preview.toolCalls.length}
                </p>
              </div>
              <div className="space-y-2">
                {preview.toolCalls.length === 0 ? (
                  <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                    No immediate tool calls predicted for this message.
                  </div>
                ) : preview.toolCalls.map((call, index) => (
                  <div key={`${call.name}-${index}`} className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-foreground">{index + 1}. {call.name}</div>
                      </div>
                      <Badge variant="outline" className="text-[9px]">tool</Badge>
                    </div>
                    {call.args && (
                      <CodeBlock value={safeJSONStringify(call.args)} maxHeight="160px" className="mt-2" />
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
              <EmptyState text="Starting runtime run. Waiting for thread and step timeline..." />
            )}
          </div>
        ) : (
          <EmptyState text="Execute a debug run to inspect steps, tool calls, approvals, and final assistant message." />
        )}
      </Panel>
    )
  }

  const orderedSteps = orderRunStepsChronologically(run.steps)
  const assistantMessage = findAssistantMessage(run, threadMessages)

  return (
    <Panel title="Executed Run Timeline" icon={<Play size={14} />}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Run" value={run.id} />
          <Metric label="Status" value={run.status} tone={run.status === 'failed' ? 'warning' : run.status === 'completed' ? 'success' : 'neutral'} />
          <Metric label="Loop" value={run.policy.sandboxMode ? 'sandbox' : 'live'} tone={run.policy.sandboxMode ? 'warning' : 'neutral'} />
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

        <LocalAgentWorkflowPanel
          run={run}
          approving={approving}
          onApprove={onApprove}
          onReject={onReject}
          approvalDetails={(approval) => (
            <>
              {approval.permission && (
                <p className="mt-1 text-[9px] text-muted-foreground/70">permission: {approval.permission}</p>
              )}
              {approval.args && <CodeBlock value={safeJSONStringify(approval.args)} maxHeight="160px" className="mt-2" />}
              {approval.preview !== undefined && <CodeBlock value={safeJSONStringify(approval.preview)} maxHeight="220px" className="mt-2" />}
            </>
          )}
        />

        <AgentActivityTrace run={run} threadMessages={threadMessages} />

        <div className="space-y-2">
          <div className="text-xs font-semibold text-foreground">Step Timeline</div>
          {orderedSteps.length === 0 ? (
            <EmptyState text="No steps recorded yet." />
          ) : (
            orderedSteps.map((step, index) => (
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
                    {step.sandboxed && <KeyValue label="Sandbox" value="true" />}
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
  const hasThread = Boolean(run?.threadId)
  const hasUserMessage = threadMessages.some((message) => message.role === 'user') || Boolean(input)
  const hasContext = Boolean(run?.metadata?.context)
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
      detail: runtimeOnline || hasRun ? 'Local Agent accepted the request.' : running ? 'Checking local runtime and endpoint capability.' : 'Runtime has not been checked for this run.',
      status: runFailed && !hasRun ? 'failed' : runtimeOnline || hasRun ? 'complete' : running ? 'active' : 'pending',
    },
    {
      id: 'thread',
      title: 'Thread Setup',
      detail: hasThread ? `Thread ${run?.threadId} is bound to this run.` : hasUserMessage ? 'User input captured, waiting for runtime thread id.' : 'No submitted input yet.',
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
      id: 'loop',
      title: 'Agentic Loop',
      detail: hasRun ? `${run?.steps.length ?? 0} step(s) recorded.` : running ? 'Agentic loop is starting.' : 'No loop output yet.',
      status: runFailed && !hasRun ? 'failed' : hasRun ? 'complete' : running ? 'active' : 'pending',
    },
    {
      id: 'policy',
      title: 'Tool Policy',
      detail: waitingApproval ? `${pendingApprovals.length || 1} tool action requires approval before continuing.` : hasRun ? 'Tool grants and approval policy have been evaluated.' : 'Tool policy runs inside the loop.',
      status: waitingApproval ? 'blocked' : hasRun ? 'complete' : running ? 'active' : 'pending',
    },
    {
      id: 'tools',
      title: 'Tool Execution',
      detail: failedStep ? `${stepTitle(failedStep)} failed.` : activeStep ? `${stepTitle(activeStep)} is running.` : toolSteps.length > 0 ? `${toolSteps.filter((step) => step.status === 'completed').length}/${toolSteps.length} tool step(s) completed.` : hasRun ? 'No tool execution was required, or execution has not started.' : 'Waiting for tool calls.',
      status: failedStep ? 'failed' : waitingApproval ? 'blocked' : activeStep ? 'active' : toolSteps.length > 0 || (hasRun && run?.status !== 'in_progress') ? 'complete' : running ? 'active' : 'pending',
    },
    {
      id: 'assistant',
      title: 'Assistant Response',
      detail: assistantMessage ? 'Final assistant message is available in the timeline.' : error ? 'Run failed before producing an assistant message.' : waitingApproval ? 'Waiting for approval before the assistant can finish.' : running || approving || run?.status === 'in_progress' ? 'Waiting for assistant response.' : 'No assistant response yet.',
      status: assistantMessage ? 'complete' : runFailed ? 'failed' : waitingApproval ? 'blocked' : running || approving || run?.status === 'in_progress' ? 'active' : 'pending',
    },
  ]
}

function AgentActivityTrace({
  run,
  threadMessages,
}: {
  run: AgentRun
  threadMessages: Array<{ id: string; role: string; content: string; createdAt: string }>
}) {
  const events = normalizeTraceEvents(run, threadMessages)
  const rounds = groupTraceRounds(run, events)
  const toolEventCount = events.filter((event) => event.kind === 'tool_call').length
  const modelCallCount = rounds.reduce((count, round) => count + groupModelHTTPCalls(round.events).length, 0)
  const dataEventCount = events.filter((event) => event.data !== undefined).length

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Rounds" value={String(rounds.length)} />
        <Metric label="Tool events" value={String(toolEventCount)} />
        <Metric label="Model HTTP" value={String(modelCallCount)} tone={modelCallCount > 0 ? 'success' : 'neutral'} />
        <Metric label="Data snapshots" value={String(dataEventCount)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-foreground">Round Trace</div>
          {rounds.length === 0 ? (
            <EmptyState text="No activity events were recorded for this run." />
          ) : (
            rounds.map((round) => (
              <TraceRoundPanel key={round.id} round={round} />
            ))
          )}
        </div>
        <div className="space-y-3">
          <TraceSummaryCard title="Setup & Decisions" events={events.filter((event) => event.kind !== 'tool_call' && event.kind !== 'model_call')} />
          <TraceSummaryCard title="Tool Data" events={events.filter((event) => event.kind === 'tool_call')} />
          <TraceSummaryCard title="Model HTTP" events={events.filter((event) => event.kind === 'model_call')} empty="No model HTTP calls recorded for this run." />
        </div>
      </div>
    </div>
  )
}

type TraceRound = {
  id: string
  index: number
  label: string
  source: AgentTraceEvent['roundSource']
  status: AgentTraceEvent['status']
  events: AgentTraceEvent[]
  steps: AgentRun['steps']
  startedAt: string
  completedAt?: string
}

function TraceRoundPanel({ round }: { round: TraceRound }) {
  const toolSteps = round.steps.filter((step) => step.type === 'tool_call')
  const modelCalls = groupModelHTTPCalls(round.events)
  const visibleEvents = round.events.filter((event) => event.kind !== 'model_call')
  const dataEvents = round.events.filter((event) => event.data !== undefined)
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[9px]">Round {round.index}</Badge>
            <h3 className="text-sm font-semibold text-foreground">{round.label}</h3>
            <Badge variant={traceEventBadgeVariant(round.status)} className="text-[9px]">{round.status}</Badge>
            {round.source && <Badge variant="outline" className="text-[9px]">{round.source}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>{round.events.length} event(s)</span>
            <span>{toolSteps.length} tool step(s)</span>
            <span>{modelCalls.length} HTTP call(s)</span>
            <span>{dataEvents.length} data snapshot(s)</span>
          </div>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <div>{formatTime(round.startedAt)}</div>
          {round.completedAt && <div>{formatTime(round.completedAt)}</div>}
        </div>
      </div>

      {toolSteps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {toolSteps.map((step) => (
            <Badge key={step.id} variant={step.status === 'failed' ? 'destructive' : step.sandboxed ? 'warning' : 'outline'} className="text-[9px]">
              {step.toolName ?? step.type}{step.sandboxed ? ' sandbox' : ''}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {modelCalls.map((call, index) => (
          <ModelHTTPCallPanel key={call.id} call={call} index={index} />
        ))}
        {visibleEvents.map((event, index) => (
          <TraceEventRow key={event.id} event={event} index={index} compact />
        ))}
      </div>
    </div>
  )
}

type ModelHTTPCall = {
  id: string
  status: AgentTraceEvent['status']
  startedAt: string
  completedAt?: string
  request?: AgentTraceEvent
  response?: AgentTraceEvent
  error?: AgentTraceEvent
  events: AgentTraceEvent[]
}

function ModelHTTPCallPanel({ call, index }: { call: ModelHTTPCall; index: number }) {
  const [open, setOpen] = useState(false)
  const data = (call.response ?? call.error ?? call.request)?.data as Record<string, unknown> | undefined
  const trace = data && typeof data === 'object' ? data : undefined
  const request = trace?.request as { body?: { model?: string } } | undefined
  const response = trace?.response as { status?: number; statusText?: string } | undefined
  const latency = typeof trace?.latencyMs === 'number' ? `${trace.latencyMs}ms` : undefined
  const title = response
    ? `HTTP ${response.status ?? 'unknown'}${response.statusText ? ` ${response.statusText}` : ''}`
    : call.error?.summary ?? call.request?.summary ?? 'Model HTTP call'

  return (
    <div className="rounded-md border border-border bg-muted/10">
      <button type="button" className="flex w-full items-start gap-3 p-2 text-left" onClick={() => setOpen((value) => !value)}>
        <div className={cn('mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border', traceEventIconClass(call.status))}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">HTTP #{index + 1}</span>
            <span className="text-sm font-medium text-foreground">{title}</span>
            <Badge variant={traceEventBadgeVariant(call.status)} className="text-[9px]">{call.status}</Badge>
            <Badge variant="outline" className="text-[9px]">model_call</Badge>
            {request?.body?.model && <Badge variant="secondary" className="text-[9px]">{request.body.model}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>{formatTime(call.startedAt)}</span>
            {latency && <span>{latency}</span>}
            <span>{call.events.length} event(s)</span>
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-2 pb-2 pt-2">
          <div className="space-y-2">
            {call.events.map((event, eventIndex) => (
              <TraceEventRow key={event.id} event={event} index={eventIndex} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TraceEventRow({ event, index, compact = false }: { event: AgentTraceEvent; index: number; compact?: boolean }) {
  return (
    <div className={cn('grid gap-3 rounded-md border border-border bg-background', compact ? 'grid-cols-[28px_minmax(0,1fr)] p-2' : 'grid-cols-[32px_minmax(0,1fr)] p-3')}>
      <div className={cn('flex items-center justify-center rounded-md border', compact ? 'h-7 w-7' : 'h-8 w-8', traceEventIconClass(event.status))}>
        {traceEventIcon(event)}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">#{index + 1}</span>
          <span className="text-sm font-medium text-foreground">{event.title}</span>
          <Badge variant={traceEventBadgeVariant(event.status)} className="text-[9px]">{event.status}</Badge>
          <Badge variant="outline" className="text-[9px]">{event.kind}</Badge>
          {event.roundLabel && !compact && <Badge variant="secondary" className="text-[9px]">{event.roundLabel}</Badge>}
          {event.agentId && <Badge variant="secondary" className="text-[9px]">{event.agentId}</Badge>}
          {event.toolName && <Badge variant="outline" className="text-[9px]">{event.toolName}</Badge>}
        </div>
        {event.summary && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{event.summary}</p>}
        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
          <KeyValue label="Created" value={formatTime(event.createdAt)} />
          {event.completedAt && <KeyValue label="Completed" value={formatTime(event.completedAt)} />}
          {event.stepId && <KeyValue label="Step" value={event.stepId} />}
          {event.parentAgentId && <KeyValue label="Parent Agent" value={event.parentAgentId} />}
        </div>
        {event.data !== undefined && <CodeBlock value={safeJSONStringify(event.data)} maxHeight={compact ? '180px' : '240px'} className="mt-2" />}
      </div>
    </div>
  )
}

function TraceSummaryCard({
  title,
  events,
  empty = 'No events.',
}: {
  title: string
  events: AgentTraceEvent[]
  empty?: string
}) {
  return (
    <div className="rounded-md border border-border bg-muted/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-foreground">{title}</div>
        <Badge variant="outline" className="text-[9px]">{events.length}</Badge>
      </div>
      {events.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {events.slice(0, 8).map((event) => (
            <div key={event.id} className="rounded border border-border/60 bg-background px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-medium text-foreground" title={event.title}>{event.title}</span>
                <Badge variant={traceEventBadgeVariant(event.status)} className="text-[8px]">{event.status}</Badge>
              </div>
              {event.summary && <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{event.summary}</p>}
            </div>
          ))}
          {events.length > 8 && <p className="text-[10px] text-muted-foreground">+{events.length - 8} more event(s)</p>}
        </div>
      )}
    </div>
  )
}

function groupTraceRounds(run: AgentRun, events: AgentTraceEvent[]): TraceRound[] {
  const orderedSteps = orderRunStepsChronologically(run.steps)
  const stepById = new Map(orderedSteps.map((step) => [step.id, step]))
  const groups = new Map<string, TraceRound>()

  for (const event of events) {
    const step = event.stepId ? stepById.get(event.stepId) : undefined
    const index = event.roundIndex ?? step?.roundIndex ?? 0
    const label = event.roundLabel ?? step?.roundLabel ?? (index === 0 ? 'Setup' : 'Legacy timeline')
    const source = event.roundSource ?? step?.roundSource ?? (index === 0 ? 'setup' : undefined)
    const id = event.roundId ?? step?.roundId ?? `round_${index}_${label}`
    const current = groups.get(id)
    if (current) {
      current.events.push(event)
      current.status = mergeTraceStatus(current.status, event.status)
      if (event.createdAt < current.startedAt) current.startedAt = event.createdAt
      const completedAt = event.completedAt ?? event.createdAt
      if (!current.completedAt || completedAt > current.completedAt) current.completedAt = completedAt
      continue
    }
    groups.set(id, {
      id,
      index,
      label,
      source,
      status: event.status,
      events: [event],
      steps: [],
      startedAt: event.createdAt,
      completedAt: event.completedAt ?? event.createdAt,
    })
  }

  for (const step of orderedSteps) {
    const index = step.roundIndex ?? 0
    const label = step.roundLabel ?? (index === 0 ? 'Setup' : 'Legacy timeline')
    const id = step.roundId ?? `round_${index}_${label}`
    const current = groups.get(id)
    if (current) {
      current.steps.push(step)
      current.status = mergeTraceStatus(current.status, step.status === 'failed' ? 'failed' : step.status === 'in_progress' ? 'started' : 'completed')
      continue
    }
    groups.set(id, {
      id,
      index,
      label,
      source: step.roundSource ?? (index === 0 ? 'setup' : undefined),
      status: step.status === 'failed' ? 'failed' : step.status === 'in_progress' ? 'started' : 'completed',
      events: [],
      steps: [step],
      startedAt: step.createdAt,
      completedAt: step.completedAt,
    })
  }

  return Array.from(groups.values())
    .map((round) => ({
      ...round,
      events: round.events.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      steps: round.steps.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }))
    .sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index
      return a.startedAt.localeCompare(b.startedAt)
    })
}

function groupModelHTTPCalls(events: AgentTraceEvent[]): ModelHTTPCall[] {
  const calls: ModelHTTPCall[] = []
  let current: ModelHTTPCall | undefined
  for (const event of events.filter((item) => item.kind === 'model_call')) {
    if (event.title === 'Model HTTP request sent' || !current) {
      current = {
        id: event.id,
        status: event.status,
        startedAt: event.createdAt,
        completedAt: event.completedAt ?? event.createdAt,
        request: event.title === 'Model HTTP request sent' ? event : undefined,
        events: [event],
      }
      calls.push(current)
      continue
    }
    current.events.push(event)
    current.status = mergeTraceStatus(current.status, event.status)
    if (event.createdAt < current.startedAt) current.startedAt = event.createdAt
    const completedAt = event.completedAt ?? event.createdAt
    if (!current.completedAt || completedAt > current.completedAt) current.completedAt = completedAt
    if (event.title === 'Model HTTP response received') current.response = event
    if (event.title === 'Model HTTP call failed') current.error = event
  }
  return calls
}

function mergeTraceStatus(current: AgentTraceEvent['status'], next: AgentTraceEvent['status']): AgentTraceEvent['status'] {
  const rank: Record<AgentTraceEvent['status'], number> = {
    failed: 5,
    blocked: 4,
    started: 3,
    info: 2,
    completed: 1,
  }
  return rank[next] > rank[current] ? next : current
}

function normalizeTraceEvents(
  run: AgentRun,
  threadMessages: Array<{ id: string; role: string; content: string; createdAt: string }>,
): AgentTraceEvent[] {
  if ((run.traceEvents?.length ?? 0) > 0) {
    return [...(run.traceEvents ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  const events: AgentTraceEvent[] = []
  const userMessage = threadMessages.find((message) => message.role === 'user')
  if (userMessage) {
    events.push({
      id: `${run.id}-message-${userMessage.id}`,
      runId: run.id,
      kind: 'message',
      title: 'User message loaded',
      summary: userMessage.content.slice(0, 180),
      status: 'completed',
      data: { messageId: userMessage.id },
      createdAt: userMessage.createdAt,
    })
  }
  if (run.metadata?.context) {
    events.push({
      id: `${run.id}-context`,
      runId: run.id,
      kind: 'context',
      title: 'Runtime context resolved',
      status: 'completed',
      data: run.metadata.context,
      createdAt: run.startedAt ?? run.createdAt,
    })
  }
  for (const step of orderRunStepsChronologically(run.steps)) {
    events.push({
      id: `${run.id}-step-${step.id}`,
      runId: run.id,
      kind: step.type === 'tool_call' ? 'tool_call' : 'assistant',
      title: stepTitle(step),
      summary: step.error ?? summarizeUnknown(step.result),
      status: step.status === 'failed' ? 'failed' : step.status === 'completed' ? 'completed' : 'started',
      stepId: step.id,
      ...(step.roundId ? { roundId: step.roundId } : {}),
      ...(typeof step.roundIndex === 'number' ? { roundIndex: step.roundIndex } : {}),
      ...(step.roundLabel ? { roundLabel: step.roundLabel } : {}),
      ...(step.roundSource ? { roundSource: step.roundSource } : {}),
      ...(step.toolName ? { toolName: step.toolName } : {}),
      data: {
        ...(step.args ? { args: step.args } : {}),
        ...(step.result !== undefined ? { result: step.result } : {}),
        ...(step.error ? { error: step.error } : {}),
      },
      createdAt: step.createdAt,
      ...(step.completedAt ? { completedAt: step.completedAt } : {}),
    })
  }
  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function getMostRecentRuns(runs: AgentRun[], limit: number): AgentRun[] {
  return [...runs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

function orderRunsChronologically(runs: AgentRun[]): AgentRun[] {
  return [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function orderRunStepsChronologically(steps: AgentRun['steps']): AgentRun['steps'] {
  return [...steps].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
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

function traceEventBadgeVariant(status: AgentTraceEvent['status']) {
  if (status === 'failed') return 'destructive'
  if (status === 'blocked') return 'warning'
  if (status === 'completed') return 'success'
  return 'outline'
}

function traceEventIcon(event: AgentTraceEvent) {
  if (event.status === 'failed') return <X size={14} />
  if (event.status === 'blocked') return <AlertTriangle size={14} />
  if (event.status === 'started') return <Loader2 size={14} className="animate-spin" />
  if (event.kind === 'tool_call') return <Wrench size={14} />
  if (event.kind === 'context' || event.kind === 'memory' || event.kind === 'tool_catalog') return <Database size={14} />
  if (event.kind === 'prompt' || event.kind === 'manifest' || event.kind === 'skill') return <Clipboard size={14} />
  return <Check size={14} />
}

function traceEventIconClass(status: AgentTraceEvent['status']) {
  if (status === 'failed') return 'border-destructive/30 bg-destructive/10 text-destructive'
  if (status === 'blocked') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (status === 'started') return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
  if (status === 'completed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  return 'border-border bg-muted/20 text-muted-foreground'
}

function extractRunMessage(run: AgentRun): string {
  const clientInput = run.metadata?.clientInput
  if (isPlainRecord(clientInput) && typeof clientInput.visibleMessage === 'string') return clientInput.visibleMessage
  if (isPlainRecord(clientInput) && typeof clientInput.message === 'string') return clientInput.message
  const traceMessage = run.traceEvents?.find((event) => event.kind === 'message' && event.summary)?.summary
  return traceMessage ?? ''
}

function buildInputSnapshotFromRun(run: AgentRun): DebugRunInputSnapshot | null {
  const clientInput = run.metadata?.clientInput
  const message = extractRunMessage(run)
  const uiSnapshot = isPlainRecord(clientInput) && isPlainRecord(clientInput.uiSnapshot) ? clientInput.uiSnapshot : undefined
  const route = isPlainRecord(uiSnapshot?.route)
    ? {
      pathname: typeof uiSnapshot.route.pathname === 'string' ? uiSnapshot.route.pathname : '/',
      search: typeof uiSnapshot.route.search === 'string' ? uiSnapshot.route.search : '',
      hash: typeof uiSnapshot.route.hash === 'string' ? uiSnapshot.route.hash : '',
    }
    : undefined
  const project = isPlainRecord(uiSnapshot?.project) && typeof uiSnapshot.project.id === 'number'
    ? {
      id: uiSnapshot.project.id,
      name: typeof uiSnapshot.project.name === 'string' ? uiSnapshot.project.name : `Project #${uiSnapshot.project.id}`,
      ...(typeof uiSnapshot.project.status === 'string' ? { status: uiSnapshot.project.status } : {}),
    }
    : undefined
  return {
    message: message || `Run ${run.id}`,
    startedAt: run.startedAt ?? run.createdAt,
    ...(route ? { route } : {}),
    ...(project ? { project } : {}),
  }
}

function Panel({
  title,
  icon,
  children,
  className,
  bodyClassName,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('flex flex-col rounded-md border border-border bg-background', className)}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      </div>
      <div className={cn('p-3', bodyClassName)}>{children}</div>
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

const initialRuntimeModelForm = {
  modelConfigId: '',
  model: '',
  useForChat: true,
  useForPlanner: true,
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

function summarizeUnknown(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (value === null) return 'null'
  if (typeof value !== 'object') return String(value).slice(0, 180)
  if (Array.isArray(value)) return `${value.length} item(s)`
  const keys = Object.keys(value)
  return `${keys.length} key(s): ${keys.slice(0, 6).join(', ')}`
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
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
