import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  BUILTIN_MOVSCRIPT_IMAGE_GENERATOR_PLUGIN_ID,
  BUILTIN_MOVSCRIPT_VIDEO_GENERATOR_PLUGIN_ID,
  ensureBundledClientPluginsInstalled,
  movScriptImageGeneratorManifest,
  movScriptVideoGeneratorManifest,
} from './builtinClientPlugins'
import {
  isClientPluginRemovable,
  isClientPluginRunnable,
  parseClientPluginManifest,
  type ClientPluginManifest,
} from './clientPlugins'
import { MARKETPLACE_PLUGINS } from './pluginMarketplace'

test('bundled MovScript image generator contributes provider tools without agent harness files', () => {
  const manifest = movScriptImageGeneratorManifest({ installedAt: '2026-06-03T00:00:00.000Z' })

  assert.equal(manifest.id, BUILTIN_MOVSCRIPT_IMAGE_GENERATOR_PLUGIN_ID)
  assert.equal(manifest.builtin, true)
  assert.equal(manifest.uninstallable, false)
  assert.equal(manifest.contributes?.tools?.some((tool: any) => tool.id === 'generation_image_generate'), true)
  assert.equal(manifest.contributes?.tools?.some((tool: any) => tool.id === 'generation_image_job_get'), true)
  assert.equal(manifest.contributes?.agentSkills?.length ?? 0, 0)
  assert.equal(manifest.permissions?.includes('agent-skills'), false)
  assert.equal(manifest.permissions?.includes('agent-tools'), false)
  assert.equal(isClientPluginRemovable(manifest), false)
  assert.equal(isClientPluginRunnable(manifest), true)
  assert.match(manifest.bundle ?? '', /runAgentTool/)
  assert.match(manifest.bundle ?? '', /agentTools/)
  assert.doesNotMatch(manifest.bundle ?? '', /runTool/)
  assert.doesNotMatch(manifest.bundle ?? '', /movscript_image_generate/)
  assert.equal(parseClientPluginManifest(JSON.stringify(manifest)).id, manifest.id)
})

test('bundled MovScript video generator contributes provider tools without agent harness files', () => {
  const manifest = movScriptVideoGeneratorManifest({ installedAt: '2026-06-03T00:00:00.000Z' })

  assert.equal(manifest.id, BUILTIN_MOVSCRIPT_VIDEO_GENERATOR_PLUGIN_ID)
  assert.equal(manifest.builtin, true)
  assert.equal(manifest.uninstallable, false)
  assert.equal(manifest.contributes?.tools?.some((tool: any) => tool.id === 'generation_video_generate'), true)
  assert.equal(manifest.contributes?.tools?.some((tool: any) => tool.id === 'generation_video_job_get'), true)
  assert.equal(manifest.contributes?.tools?.some((tool: any) => tool.id === 'movscript_video_model_list'), false)
  assert.equal(manifest.contributes?.agentSkills?.length ?? 0, 0)
  assert.equal(manifest.permissions?.includes('agent-skills'), false)
  assert.equal(manifest.permissions?.includes('agent-tools'), false)
  assert.equal(isClientPluginRemovable(manifest), false)
  assert.equal(isClientPluginRunnable(manifest), true)
  assert.match(manifest.bundle ?? '', /runAgentTool/)
  assert.match(manifest.bundle ?? '', /agentTools/)
  assert.doesNotMatch(manifest.bundle ?? '', /runTool/)
  assert.doesNotMatch(manifest.bundle ?? '', /movscript_video_generate/)
  assert.doesNotMatch(manifest.bundle ?? '', /movscript_video_model_list/)
})

test('ensureBundledClientPluginsInstalled saves provider plugin manifests without installing agent packs', async () => {
  const calls: string[] = []
  const saved: ClientPluginManifest[] = []

  const result = await ensureBundledClientPluginsInstalled({
    loadPlugins: async () => {
      calls.push('loadPlugins')
      return []
    },
    savePlugin: async (plugin) => {
      calls.push(`save:${plugin.id}`)
      saved.push(plugin)
    },
    now: () => '2026-06-03T00:00:00.000Z',
  })

  assert.deepEqual(calls, [
    'loadPlugins',
    `save:${BUILTIN_MOVSCRIPT_IMAGE_GENERATOR_PLUGIN_ID}`,
    `save:${BUILTIN_MOVSCRIPT_VIDEO_GENERATOR_PLUGIN_ID}`,
  ])
  assert.equal(result[0]?.status, 'installed')
  assert.equal(result[1]?.status, 'installed')
  assert.equal(saved[0]?.builtin, true)
  assert.equal(saved[0]?.uninstallable, false)
  assert.equal(saved[0]?.installedAt, '2026-06-03T00:00:00.000Z')
  assert.equal(saved[0]?.agentCatalogPackInstall, undefined)
  assert.equal(saved.at(-1)?.agentCatalogPackInstall, undefined)
})

test('ensureBundledClientPluginsInstalled preserves installedAt for provider plugins', async () => {
  const calls: string[] = []
  const existingImage = movScriptImageGeneratorManifest({ installedAt: '2026-01-01T00:00:00.000Z' })
  const existingVideo = movScriptVideoGeneratorManifest({ installedAt: '2026-01-01T00:00:00.000Z' })

  const result = await ensureBundledClientPluginsInstalled({
    loadPlugins: async () => [existingImage, existingVideo],
    savePlugin: async (plugin) => {
      calls.push(`save:${plugin.installedAt}`)
    },
    now: () => '2026-06-03T00:00:00.000Z',
  })

  assert.equal(result[0]?.status, 'already_installed')
  assert.deepEqual(calls, [
    'save:2026-01-01T00:00:00.000Z',
    'save:2026-01-01T00:00:00.000Z',
  ])
})

test('ensureBundledClientPluginsInstalled removes stale bundled agent catalog packs', async () => {
  const calls: string[] = []

  const result = await ensureBundledClientPluginsInstalled({
    loadPlugins: async () => [],
    savePlugin: async (plugin) => {
      calls.push(`save:${plugin.id}`)
    },
    uninstallAgentCatalogPack: async (input) => {
      calls.push(`uninstall:${input.pluginId}`)
    },
    now: () => '2026-06-03T00:00:00.000Z',
  })

  assert.deepEqual(calls, [
    `save:${BUILTIN_MOVSCRIPT_IMAGE_GENERATOR_PLUGIN_ID}`,
    `uninstall:${BUILTIN_MOVSCRIPT_IMAGE_GENERATOR_PLUGIN_ID}`,
    `save:${BUILTIN_MOVSCRIPT_VIDEO_GENERATOR_PLUGIN_ID}`,
    `uninstall:${BUILTIN_MOVSCRIPT_VIDEO_GENERATOR_PLUGIN_ID}`,
  ])
  assert.equal(result[0]?.status, 'installed')
  assert.equal(result[1]?.status, 'installed')
})

test('marketplace exposes bundled image and video generator plugins', () => {
  const imageEntry = MARKETPLACE_PLUGINS.find((plugin) => plugin.id === BUILTIN_MOVSCRIPT_IMAGE_GENERATOR_PLUGIN_ID)
  assert.ok(imageEntry)
  assert.equal(imageEntry.manifest.builtin, true)
  assert.equal(imageEntry.manifest.uninstallable, false)
  assert.equal(isClientPluginRunnable(imageEntry.manifest), true)
  assert.equal(imageEntry.manifest.contributes?.tools?.some((tool: any) => tool.id === 'generation_image_generate'), true)
  assert.equal(imageEntry.manifest.contributes?.agentSkills?.length ?? 0, 0)

  const videoEntry = MARKETPLACE_PLUGINS.find((plugin) => plugin.id === BUILTIN_MOVSCRIPT_VIDEO_GENERATOR_PLUGIN_ID)
  assert.ok(videoEntry)
  assert.equal(videoEntry.manifest.builtin, true)
  assert.equal(videoEntry.manifest.uninstallable, false)
  assert.equal(isClientPluginRunnable(videoEntry.manifest), true)
  assert.equal(videoEntry.manifest.contributes?.tools?.some((tool: any) => tool.id === 'generation_video_generate'), true)
  assert.equal(videoEntry.manifest.contributes?.agentSkills?.length ?? 0, 0)
})

test('bundled provider tool schemas match the agent-owned generation catalog', () => {
  assertProviderToolSchemaMatchesAgentCatalog({
    toolName: 'generation_image_generate',
    agentToolPath: '../../apps/agent/catalog/tools/generation/image-generate.tool.json',
    pluginManifestPath: '../../plugins/image-generator/mov.json',
    bundledManifest: movScriptImageGeneratorManifest(),
  })
  assertProviderToolSchemaMatchesAgentCatalog({
    toolName: 'generation_image_job_get',
    agentToolPath: '../../apps/agent/catalog/tools/generation/image-job-get.tool.json',
    pluginManifestPath: '../../plugins/image-generator/mov.json',
    bundledManifest: movScriptImageGeneratorManifest(),
  })
  assertProviderToolSchemaMatchesAgentCatalog({
    toolName: 'generation_video_generate',
    agentToolPath: '../../apps/agent/catalog/tools/generation/video-generate.tool.json',
    pluginManifestPath: '../../plugins/video-generator/mov.json',
    bundledManifest: movScriptVideoGeneratorManifest(),
  })
  assertProviderToolSchemaMatchesAgentCatalog({
    toolName: 'generation_video_job_get',
    agentToolPath: '../../apps/agent/catalog/tools/generation/video-job-get.tool.json',
    pluginManifestPath: '../../plugins/video-generator/mov.json',
    bundledManifest: movScriptVideoGeneratorManifest(),
  })
})

function assertProviderToolSchemaMatchesAgentCatalog(input: {
  toolName: string
  agentToolPath: string
  pluginManifestPath: string
  bundledManifest: ClientPluginManifest
}): void {
  const agentTool = readJSON(input.agentToolPath)
  const pluginTool = toolContribution(readJSON(input.pluginManifestPath), input.toolName)
  const bundledTool = toolContribution(input.bundledManifest, input.toolName)

  assert.deepEqual(pluginTool.inputSchema, agentTool.inputSchema, `${input.toolName} plugin input schema should match agent catalog`)
  assert.deepEqual(pluginTool.outputSchema, agentTool.outputSchema, `${input.toolName} plugin output schema should match agent catalog`)
  assert.deepEqual(bundledTool.inputSchema, agentTool.inputSchema, `${input.toolName} bundled input schema should match agent catalog`)
  assert.deepEqual(bundledTool.outputSchema, agentTool.outputSchema, `${input.toolName} bundled output schema should match agent catalog`)
}

function toolContribution(manifest: Record<string, any>, toolName: string): Record<string, any> {
  const tool = manifest.contributes?.tools?.find((item: Record<string, any>) => item.id === toolName || item.name === toolName)
  assert.ok(tool, `${toolName} contribution should exist`)
  return tool
}

function readJSON(relativePath: string): Record<string, any> {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as Record<string, any>
}
