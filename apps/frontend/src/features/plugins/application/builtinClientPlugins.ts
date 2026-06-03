import {
  loadClientPlugins,
  saveClientPlugin,
  type ClientPluginManifest,
} from '@/features/plugins/application/clientPlugins'
import { agentCatalogPackStoreClient, type AgentCatalogPackFile, type AgentCatalogPackInstallResult } from './agentCatalogPackStoreClient'
import { BUNDLED_MOVSCRIPT_IMAGE_GENERATOR_BUNDLE } from './bundledImageGeneratorBundle'
import { BUNDLED_MOVSCRIPT_VIDEO_GENERATOR_BUNDLE } from './bundledVideoGeneratorBundle'

export const BUILTIN_MOVSCRIPT_IMAGE_GENERATOR_PLUGIN_ID = 'com.movscript.image-generator'
export const BUILTIN_MOVSCRIPT_VIDEO_GENERATOR_PLUGIN_ID = 'com.movscript.video-generator'

export interface EnsureBundledClientPluginsResult {
  pluginId: string
  status: 'already_installed' | 'installed' | 'pack_store_failed'
  manifest: ClientPluginManifest
  install?: AgentCatalogPackInstallResult
  error?: string
}

export interface EnsureBundledClientPluginsDeps {
  loadPlugins?: () => Promise<ClientPluginManifest[]>
  savePlugin?: (plugin: ClientPluginManifest) => Promise<void>
  uninstallAgentCatalogPack?: (input: { pluginId: string }, signal?: AbortSignal) => Promise<unknown>
  now?: () => string
  signal?: AbortSignal
}

export async function ensureBundledClientPluginsInstalled(
  deps: EnsureBundledClientPluginsDeps = {}
): Promise<EnsureBundledClientPluginsResult[]> {
  const loadPlugins = deps.loadPlugins ?? loadClientPlugins
  const savePlugin = deps.savePlugin ?? saveClientPlugin
  const now = deps.now ?? (() => new Date().toISOString())

  const existingPlugins = await loadPlugins()
  const existingById = new Map(existingPlugins.map((plugin) => [plugin.id, plugin]))
  const results: EnsureBundledClientPluginsResult[] = []
  for (const definition of bundledClientPluginDefinitions()) {
    const existing = existingById.get(definition.pluginId)
    const manifest = definition.manifest({
      installedAt: existing?.installedAt ?? now(),
    })
    throwIfAborted(deps.signal)
    await savePlugin(manifest)
    const cleanupError = await cleanupBundledAgentCatalogPack({
      pluginId: definition.pluginId,
      signal: deps.signal,
      uninstallAgentCatalogPack: deps.uninstallAgentCatalogPack,
    })
    results.push({
      pluginId: definition.pluginId,
      status: cleanupError ? 'pack_store_failed' : existing ? 'already_installed' : 'installed',
      manifest,
      ...(cleanupError ? { error: cleanupError } : {}),
    })
  }
  return results
}

function bundledClientPluginDefinitions(): Array<{
  pluginId: string
  manifest: (input?: { installedAt?: string; agentCatalogPackInstall?: AgentCatalogPackInstallResult }) => ClientPluginManifest
}> {
  return [
    {
      pluginId: BUILTIN_MOVSCRIPT_IMAGE_GENERATOR_PLUGIN_ID,
      manifest: movScriptImageGeneratorManifest,
    },
    {
      pluginId: BUILTIN_MOVSCRIPT_VIDEO_GENERATOR_PLUGIN_ID,
      manifest: movScriptVideoGeneratorManifest,
    },
  ]
}

export function movScriptImageGeneratorManifest(input: {
  installedAt?: string
  agentCatalogPackInstall?: AgentCatalogPackInstallResult
} = {}): ClientPluginManifest {
  return {
    schema: 'movscript.clientPlugin.v1',
    id: BUILTIN_MOVSCRIPT_IMAGE_GENERATOR_PLUGIN_ID,
    name: '图像生成器',
    version: '1.0.0',
    description: 'Bundled MovScript image generation provider plugin. Agent generation behavior is defined by the agent generation harness; this plugin implements the runtime provider tools.',
    author: 'MovScript',
    permissions: ['model.image.generate', 'resource.read'],
    bundle: BUNDLED_MOVSCRIPT_IMAGE_GENERATOR_BUNDLE,
    hasCompile: true,
    builtin: true,
    uninstallable: false,
    contributes: {
      tools: [{
        id: 'generation_image_generate',
        title: '生成图像',
        description: '实现 agent generation_image_generate 接口，提交一个图像生成任务。',
        inputSchema: MOVSCRIPT_IMAGE_GENERATE_TOOL.inputSchema,
        outputSchema: MOVSCRIPT_IMAGE_GENERATE_TOOL.outputSchema,
      }, {
        id: 'generation_image_job_get',
        title: '查看图像生成任务',
        description: '实现 agent generation_image_job_get 接口，查询图像生成任务状态。',
        inputSchema: GENERATION_JOB_GET_TOOL.inputSchema,
        outputSchema: GENERATION_JOB_GET_TOOL.outputSchema,
      }],
      canvasNodes: [{
        type: 'com.movscript.image-generator.image_generator',
        title: '图像生成器',
        description: '文生图或参考图生图节点。',
        category: 'ai',
        icon: 'image',
        defaultData: {
          source: 'ai',
          label: '图像生成器',
          outputType: 'image',
        },
      }],
    },
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', title: '提示词' },
        model_id: { type: 'string', title: '模型', 'x-widget': 'model-selector', 'x-capability': 'image' },
        aspect_ratio: { type: 'string', title: '画幅比例', enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2'], default: '1:1' },
        image_size: { type: 'string', title: '输出尺寸', default: '1024x1024' },
        quality: { type: 'string', title: '质量', enum: ['auto', 'standard', 'hd', 'high', 'medium', 'low'] },
      },
    },
    ...(input.installedAt ? { installedAt: input.installedAt } : {}),
    ...(input.agentCatalogPackInstall ? { agentCatalogPackInstall: input.agentCatalogPackInstall } : {}),
  }
}

export function movScriptVideoGeneratorManifest(input: {
  installedAt?: string
  agentCatalogPackInstall?: AgentCatalogPackInstallResult
} = {}): ClientPluginManifest {
  return {
    schema: 'movscript.clientPlugin.v1',
    id: BUILTIN_MOVSCRIPT_VIDEO_GENERATOR_PLUGIN_ID,
    name: '视频生成器',
    version: '1.0.0',
    description: 'Bundled MovScript video generation provider plugin. Agent generation behavior is defined by the agent generation harness; this plugin implements the runtime provider tools.',
    author: 'MovScript',
    permissions: ['model.video.generate', 'resource.read'],
    bundle: BUNDLED_MOVSCRIPT_VIDEO_GENERATOR_BUNDLE,
    hasCompile: true,
    builtin: true,
    uninstallable: false,
    contributes: {
      tools: [{
        id: 'generation_video_generate',
        title: '生成视频',
        description: '实现 agent generation_video_generate 接口，提交一个视频生成任务。',
        inputSchema: MOVSCRIPT_VIDEO_GENERATE_TOOL.inputSchema,
        outputSchema: MOVSCRIPT_VIDEO_GENERATE_TOOL.outputSchema,
      }, {
        id: 'generation_video_job_get',
        title: '查看视频生成任务',
        description: '实现 agent generation_video_job_get 接口，查询视频生成任务状态。',
        inputSchema: GENERATION_JOB_GET_TOOL.inputSchema,
        outputSchema: GENERATION_JOB_GET_TOOL.outputSchema,
      }],
      canvasNodes: [{
        type: 'com.movscript.video-generator.video_generator',
        title: '视频生成器',
        description: '文生视频或参考图生视频节点。',
        category: 'ai',
        icon: 'video',
        defaultData: {
          source: 'ai',
          label: '视频生成器',
          outputType: 'video',
        },
      }],
    },
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', title: '提示词' },
        model_id: { type: 'string', title: '模型', 'x-widget': 'model-selector', 'x-capability': 'video' },
        aspect_ratio: { type: 'string', title: '画幅比例', enum: ['16:9', '9:16', '1:1', '4:3', '3:4'], default: '16:9' },
        duration: { type: 'number', title: '时长（秒）', default: 5 },
        quality: { type: 'string', title: '质量', enum: ['auto', 'standard', 'high', 'medium', 'low'], default: 'standard' },
      },
    },
    ...(input.installedAt ? { installedAt: input.installedAt } : {}),
    ...(input.agentCatalogPackInstall ? { agentCatalogPackInstall: input.agentCatalogPackInstall } : {}),
  }
}

export function movScriptImageGeneratorAgentCatalogFiles(): AgentCatalogPackFile[] {
  return []
}

export function movScriptVideoGeneratorAgentCatalogFiles(): AgentCatalogPackFile[] {
  return []
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  throw signal.reason ?? new Error('aborted')
}

async function cleanupBundledAgentCatalogPack(input: {
  pluginId: string
  signal?: AbortSignal
  uninstallAgentCatalogPack?: (input: { pluginId: string }, signal?: AbortSignal) => Promise<unknown>
}): Promise<string | undefined> {
  const uninstallAgentCatalogPack = input.uninstallAgentCatalogPack ?? defaultUninstallAgentCatalogPack
  if (!uninstallAgentCatalogPack) return undefined
  try {
    await uninstallAgentCatalogPack({ pluginId: input.pluginId }, input.signal)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function defaultUninstallAgentCatalogPack(input: { pluginId: string }, signal?: AbortSignal): Promise<unknown> | undefined {
  if (typeof window === 'undefined') return undefined
  if (!window.api?.uninstallAgentCatalogPack) return undefined
  return agentCatalogPackStoreClient.uninstallAgentCatalogPack(input, signal)
}

const MOVSCRIPT_IMAGE_GENERATE_TOOL = {
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['prompt'],
    properties: {
      prompt: { type: 'string', minLength: 1 },
      title: { type: 'string' },
      negative_prompt: { type: 'string' },
      model_id: { type: 'string' },
      input_resource_ids: { type: 'array', items: { type: 'number' } },
      reference_resource_ids: { type: 'array', items: { type: 'number' } },
      aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2'] },
      image_size: { type: 'string' },
      quality: { type: 'string', enum: ['auto', 'standard', 'hd', 'high', 'medium', 'low'] },
      steps: { type: 'number', minimum: 1 },
      seed: { type: 'number' },
      extra_params: { type: 'object', additionalProperties: true },
      timeout_ms: { type: 'number', minimum: 1 },
      poll_interval_ms: { type: 'number', minimum: 1 },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: true,
    required: ['status', 'jobId', 'terminal', 'monitor'],
    properties: {
      status: { type: 'string' },
      jobId: { type: 'number' },
      job_id: { type: 'number' },
      terminal: { type: 'boolean' },
      monitor: { type: 'object' },
      job: { type: 'object' },
    },
  },
}

const MOVSCRIPT_VIDEO_GENERATE_TOOL = {
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['prompt'],
    properties: {
      prompt: { type: 'string', minLength: 1 },
      title: { type: 'string' },
      model_id: { type: 'string' },
      input_resource_ids: { type: 'array', items: { type: 'number' } },
      reference_resource_ids: { type: 'array', items: { type: 'number' } },
      aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
      duration: { type: 'number', minimum: 1 },
      quality: { type: 'string', enum: ['auto', 'standard', 'high', 'medium', 'low'] },
      fps: { type: 'number', minimum: 1 },
      seed: { type: 'number' },
      extra_params: { type: 'object', additionalProperties: true },
      timeout_ms: { type: 'number', minimum: 1 },
      poll_interval_ms: { type: 'number', minimum: 1 },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: true,
    required: ['status', 'jobId', 'terminal', 'monitor'],
    properties: {
      status: { type: 'string' },
      jobId: { type: 'number' },
      job_id: { type: 'number' },
      terminal: { type: 'boolean' },
      monitor: { type: 'object' },
      job: { type: 'object' },
    },
  },
}

const GENERATION_JOB_GET_TOOL = {
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['jobId'],
    properties: {
      jobId: { type: 'number', minimum: 1 },
      job_id: { type: 'number', minimum: 1 },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: true,
    required: ['status', 'jobId', 'terminal'],
    properties: {
      status: { type: 'string' },
      jobId: { type: 'number' },
      job_id: { type: 'number' },
      terminal: { type: 'boolean' },
      outputResourceIds: { type: 'array', items: { type: 'number' } },
      output_resource_ids: { type: 'array', items: { type: 'number' } },
      job: { type: 'object' },
    },
  },
}
