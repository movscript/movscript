import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const repoRoot = resolve(import.meta.dirname, '../../..')

function getFallbackTools() {
  const bridgePath = resolve(repoRoot, 'plugins/movscript/bin/mcp-stdio-bridge.mjs')
  const source = readFileSync(bridgePath, 'utf8')
    .replace(/^#!.*\n/, '')
    .replace("import readline from 'node:readline'", "const readline = { createInterface: () => ({ on() {} }) }")
    + "\nresult = fallbackTools\n"
  const context = {
    AbortController,
    clearTimeout,
    console,
    fetch: async () => { throw new Error('fetch disabled') },
    process: { env: {} },
    result: undefined,
    setTimeout,
  }
  vm.runInNewContext(source, context)
  return Array.from(context.result)
}

function getFallbackToolNames() {
  return getFallbackTools().map((tool) => tool.name).filter(Boolean)
}

function getFallbackEditingToolNames() {
  return getFallbackToolNames().filter((name) => name.startsWith('editing_'))
}

test('MovScript editing skill routes product editing through editing tools', () => {
  const source = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/editing/SKILL.md'), 'utf8')

  assert.match(source, /editing_project_create_from_edit_plan/)
  assert.match(source, /editing_project_update_settings/)
  assert.match(source, /editing_project_remove_asset/)
  assert.match(source, /editing_timeline_add_clip/)
  assert.match(source, /editing_runtime_capabilities_get/)
  assert.match(source, /editing_task_render_create/)
  assert.match(source, /editing_export_save_local/)
  assert.match(source, /editing_export_import_resource/)
  assert.match(source, /Electron `mediaPipeline`/)
  assert.match(source, /Do not use `timeline_document` or historical third-party fields as the main workflow contract/)
  assert.match(source, /output\.hlsVariants/)
  assert.match(source, /ASS\/libass/)
  assert.match(source, /Do not automatically create, adopt, or select candidates after a render succeeds/)
  assert.match(source, /RawResource-backed candidate creation/)
  assert.match(source, /HLS `MediaStreamArtifact` outputs as hosted previews/)
  assert.match(source, /future domain candidate schema extension/)
  assert.match(source, /When any export or artifact tool resolves an Electron task by `taskId`, pass the matching `projectId` as well/)
  assert.match(source, /`editing_export_save_local`, `editing_export_import_resource`, `editing_export_publish_hls`, `system_artifact_upload_export`, and `system_artifact_upload_hls_stream`/)

  assert.doesNotMatch(source, /domain_compose_scene_moment_from_edit_plan` is the default/)
  assert.doesNotMatch(source, /OpenCut-compatible MVP editing document/)
  assert.doesNotMatch(source, /Use `system_resource_video_trim_to_resource`, `system_resource_video_concat_to_resource`, or `system_resource_video_compose_to_resource` only when you need manual resource-level drafts before writing a candidate/)
  assert.doesNotMatch(source, /system_resource_video_compose_to_resource/)
  assert.doesNotMatch(source, /system_resource_video_concat_to_resource/)
  assert.doesNotMatch(source, /system_resource_video_trim_to_resource/)
})

test('MovScript generation and domain skills keep resource utilities out of the main editing path', () => {
  const generation = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/generation/SKILL.md'), 'utf8')
  const domain = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/domain/SKILL.md'), 'utf8')
  const resourceRules = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/generation/references/resource-id-rules.md'), 'utf8')
  const planningRecipes = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/planning/references/content-unit-recipes.md'), 'utf8')
  const pluginBridge = readFileSync(resolve(repoRoot, 'plugins/movscript/bin/mcp-stdio-bridge.mjs'), 'utf8')
  const domainToolDefinitions = readFileSync(resolve(repoRoot, 'packages/core/src/mcp/tools/domain/definitions.ts'), 'utf8')
  const domainToolActions = readFileSync(resolve(repoRoot, 'packages/core/src/mcp/node/tools/domain/actions.ts'), 'utf8')
  const resourceToolDefinitions = readFileSync(resolve(repoRoot, 'packages/core/src/mcp/tools/resource-media/definitions.ts'), 'utf8')

  assert.match(generation, /switch to the `editing` skill/)
  assert.match(generation, /editing_project_create_from_edit_plan/)
  assert.doesNotMatch(generation, /Use `domain_compose_scene_moment_from_edit_plan` when stitching/)

  assert.match(domain, /not available editing paths/)
  assert.match(domain, /editing_\*/)
  assert.match(domain, /mcp__movscript__domain_read_scene_moment_timeline/)
  assert.match(domain, /mcp__movscript__domain_read_production_timeline/)
  assert.doesNotMatch(domain, /mcp__movscript__domain_apply_scene_moment_timeline_commands/)
  assert.doesNotMatch(domain, /mcp__movscript__domain_apply_production_timeline_commands/)
  assert.doesNotMatch(domain, /mcp__movscript__domain_compose_scene_moment_from_edit_plan/)
  assert.doesNotMatch(domain, /mcp__movscript__domain_compose_production_from_timeline/)

  assert.match(resourceRules, /For product editing, create a `MediaEditingProject` and use `editing_\*` tools/)

  assert.match(planningRecipes, /editing_project_create_from_edit_plan creates a MediaEditingProject/)
  assert.match(planningRecipes, /editing_task_render_create renders through Electron mediaPipeline/)
  assert.match(planningRecipes, /`domain_compose_scene_moment_from_edit_plan` is not an available product editing path/)
  assert.doesNotMatch(planningRecipes, /domain_compose_scene_moment_from_edit_plan writes a scene-moment-level video candidate/)

  assert.match(pluginBridge, /MediaEditingProject handoff/)
  assert.match(pluginBridge, /const editingTools = \[/)
  assert.match(pluginBridge, /name: 'editing_project_create_from_edit_plan'/)
  assert.match(pluginBridge, /name: 'editing_timeline_apply_commands'/)
  assert.match(pluginBridge, /name: 'editing_timeline_add_clip'/)
  assert.match(pluginBridge, /name: 'editing_runtime_capabilities_get'/)
  assert.match(pluginBridge, /name: 'editing_task_render_create'/)
  assert.match(pluginBridge, /name: 'editing_export_import_resource'/)
  assert.match(pluginBridge, /\.\.\.editingTools/)
  assert.doesNotMatch(pluginBridge, /name: 'domain_compose_scene_moment_from_edit_plan'/)
  assert.doesNotMatch(pluginBridge, /name: 'domain_compose_production_from_timeline'/)
  assert.doesNotMatch(pluginBridge, /name: 'domain_apply_scene_moment_timeline_commands'/)
  assert.doesNotMatch(pluginBridge, /name: 'domain_apply_production_timeline_commands'/)
  assert.doesNotMatch(pluginBridge, /domain_compose_scene_moment_from_edit_plan'[\s\S]*timelineDocument/)
  assert.doesNotMatch(pluginBridge, /domain_compose_scene_moment_from_edit_plan'[\s\S]*timeline_document/)
  assert.doesNotMatch(pluginBridge, /domain_compose_production_from_timeline'[\s\S]*timelineDocument/)
  assert.doesNotMatch(pluginBridge, /domain_compose_production_from_timeline'[\s\S]*timeline_document/)
  assert.doesNotMatch(pluginBridge, /OpenCut-compatible/)
  assert.doesNotMatch(pluginBridge, /OpenCut-style/)

  assert.doesNotMatch(domainToolDefinitions, /OpenCut-compatible/)
  assert.doesNotMatch(domainToolDefinitions, /OpenCut-style/)
  assert.match(domainToolDefinitions, /MediaEditingProject handoff/)
  assert.doesNotMatch(domainToolDefinitions, /name: 'domain_apply_scene_moment_timeline_commands'/)
  assert.doesNotMatch(domainToolDefinitions, /name: 'domain_apply_production_timeline_commands'/)
  assert.doesNotMatch(domainToolDefinitions, /name: 'domain_compose_scene_moment_from_edit_plan'/)
  assert.doesNotMatch(domainToolDefinitions, /name: 'domain_compose_production_from_timeline'/)
  assert.doesNotMatch(domainToolDefinitions, /domain_compose_scene_moment_from_edit_plan'[\s\S]*timelineDocument/)
  assert.doesNotMatch(domainToolDefinitions, /domain_compose_scene_moment_from_edit_plan'[\s\S]*timeline_document/)
  assert.doesNotMatch(domainToolDefinitions, /domain_compose_production_from_timeline'[\s\S]*timelineDocument/)
  assert.doesNotMatch(domainToolDefinitions, /domain_compose_production_from_timeline'[\s\S]*timeline_document/)

  assert.doesNotMatch(domainToolActions, /@movscript\/editing\/legacy-open-cut/)
  assert.doesNotMatch(domainToolActions, /OpenCut/)
  assert.doesNotMatch(domainToolActions, /opencut/)

  assert.match(resourceToolDefinitions, /movscript_resource_video_trim_to_resource'[\s\S]*Neutral resource preparation/)
  assert.match(resourceToolDefinitions, /movscript_resource_video_trim_to_resource'[\s\S]*not the product editing path/)
  assert.match(resourceToolDefinitions, /movscript_resource_video_trim_to_resource'[\s\S]*editing_\* tools through Electron mediaPipeline/)
  assert.match(resourceToolDefinitions, /movscript_resource_video_compose_to_resource'[\s\S]*Resource-level video utility/)
  assert.match(resourceToolDefinitions, /movscript_resource_video_compose_to_resource'[\s\S]*not the product editing path/)
  assert.match(resourceToolDefinitions, /movscript_resource_video_compose_to_resource'[\s\S]*editing_\* tools through Electron mediaPipeline/)
  assert.match(resourceToolDefinitions, /movscript_resource_video_concat_to_resource'[\s\S]*Resource-level video utility/)
  assert.match(resourceToolDefinitions, /movscript_resource_video_concat_to_resource'[\s\S]*not the product editing path/)
})

test('MovScript plugin metadata advertises the dedicated Electron editing path', () => {
  const codexManifest = JSON.parse(readFileSync(resolve(repoRoot, 'plugins/movscript/.codex-plugin/plugin.json'), 'utf8'))
  const providerManifest = JSON.parse(readFileSync(resolve(repoRoot, 'plugins/movscript/.provider-plugin/plugin.json'), 'utf8'))
  const readme = readFileSync(resolve(repoRoot, 'plugins/movscript/README.md'), 'utf8')

  for (const manifest of [codexManifest, providerManifest]) {
    assert.match(manifest.description, /Electron media editing/)
    assert.ok(manifest.keywords.includes('editing'))
    assert.ok(manifest.keywords.includes('media-pipeline'))
    assert.ok(manifest.interface.capabilities.includes('MediaEditingProject editing'))
    assert.ok(manifest.interface.capabilities.includes('Electron mediaPipeline render'))
    assert.match(manifest.interface.longDescription, /dedicated editing_\* tool family/)
    assert.match(manifest.interface.longDescription, /MediaEditingProject creation/)
    assert.match(manifest.interface.longDescription, /Electron mediaPipeline render\/HLS\/transcode\/reframe/)
    assert.match(manifest.interface.defaultPrompt, /For product video editing, use editing_\* tools/)
    assert.match(manifest.interface.defaultPrompt, /check editing_runtime_capabilities_get before local render/)
    assert.match(manifest.interface.defaultPrompt, /Resource-level media utilities are only for neutral material preparation, not the main editing path/)
  }

  assert.match(readme, /skills\/editing\/SKILL\.md/)
  assert.match(readme, /Editing tools: `editing_project_\*`, `editing_timeline_\*`, `editing_runtime_capabilities_get`, `editing_task_\*`, and `editing_export_\*`/)
  assert.match(readme, /Electron `mediaPipeline`/)
  assert.match(readme, /resource-level media utilities are only for neutral material preparation, not product editing/)
  assert.match(readme, /artifact hosting, and editing tools/)
  assert.match(readme, /static bootstrap set also advertises the dedicated `editing_\*` tool family/)
})

test('MovScript plugin bridge bootstrap list exposes the dedicated editing tool family', () => {
  const fallbackTools = getFallbackTools()
  const fallbackToolsByName = new Map(fallbackTools.map((tool) => [tool.name, tool]))
  assert.equal(fallbackToolsByName.has('domain_compose_scene_moment_from_edit_plan'), false)
  assert.equal(fallbackToolsByName.has('domain_compose_production_from_timeline'), false)
  assert.equal(fallbackToolsByName.has('domain_apply_scene_moment_timeline_commands'), false)
  assert.equal(fallbackToolsByName.has('domain_apply_production_timeline_commands'), false)
  assert.deepEqual(fallbackTools.filter((tool) => tool.name.startsWith('editing_')).map((tool) => tool.name), [
    'editing_project_create',
    'editing_project_create_from_edit_plan',
    'editing_project_get',
    'editing_project_update_settings',
    'editing_project_add_asset',
    'editing_project_remove_asset',
    'editing_project_save',
    'editing_timeline_apply_commands',
    'editing_timeline_add_track',
    'editing_timeline_remove_track',
    'editing_timeline_add_clip',
    'editing_timeline_update_clip',
    'editing_timeline_split_clip',
    'editing_timeline_move_clip',
    'editing_timeline_delete_clip',
    'editing_timeline_validate',
    'editing_runtime_capabilities_get',
    'editing_task_render_create',
    'editing_task_hls_create',
    'editing_task_transcode_create',
    'editing_task_reframe_create',
    'editing_task_get',
    'editing_task_cancel',
    'editing_task_logs_get',
    'editing_export_import_resource',
    'editing_export_save_local',
    'editing_export_publish_hls',
    'editing_export_create_candidate',
  ])
  assert.match(String(fallbackToolsByName.get('editing_export_import_resource')?.description), /HLS manifests must use editing_export_publish_hls/)
  assert.match(String(fallbackToolsByName.get('editing_export_import_resource')?.description), /MediaStreamArtifact/)
  for (const name of [
    'editing_task_render_create',
    'editing_task_hls_create',
    'editing_task_transcode_create',
    'editing_task_reframe_create',
  ]) {
    assert.ok(fallbackToolsByName.get(name)?.inputSchema?.properties?.projectId, `${name} should expose projectId in bootstrap discovery`)
    assert.ok(fallbackToolsByName.get(name)?.inputSchema?.properties?.project_id, `${name} should expose project_id in bootstrap discovery`)
  }
  assert.match(String(fallbackToolsByName.get('editing_task_transcode_create')?.description), /projectId/)
  assert.match(String(fallbackToolsByName.get('editing_task_reframe_create')?.description), /projectId/)
  for (const name of [
    'editing_task_get',
    'editing_task_cancel',
    'editing_task_logs_get',
    'editing_export_import_resource',
    'editing_export_save_local',
    'editing_export_publish_hls',
  ]) {
    assert.ok(fallbackToolsByName.get(name)?.inputSchema?.properties?.projectId, `${name} should expose projectId in bootstrap discovery`)
    assert.ok(fallbackToolsByName.get(name)?.inputSchema?.properties?.project_id, `${name} should expose project_id in bootstrap discovery`)
    assert.match(String(fallbackToolsByName.get(name)?.description), /projectId/)
  }
  assert.match(String(fallbackToolsByName.get('editing_export_save_local')?.description), /complete HLS bundle/)
  assert.ok(fallbackToolsByName.get('editing_export_save_local')?.inputSchema?.properties?.saveDirectory)
  assert.ok(fallbackToolsByName.get('editing_export_save_local')?.inputSchema?.properties?.save_directory)
  assert.ok(fallbackToolsByName.get('editing_export_save_local')?.inputSchema?.properties?.hlsDirectory)
  assert.ok(fallbackToolsByName.get('editing_export_save_local')?.inputSchema?.properties?.segmentPaths)
  assert.match(String(fallbackToolsByName.get('editing_export_create_candidate')?.description), /RawResource-backed/)
  assert.match(String(fallbackToolsByName.get('editing_export_create_candidate')?.description), /future domain candidate schema extension/)
  assert.equal(fallbackToolsByName.get('editing_export_create_candidate')?.inputSchema?.properties?.streamId?.description.includes('Known unsupported HLS MediaStreamArtifact ID'), true)
})

test('MovScript plugin bridge bootstrap list exposes neutral artifact hosting tools', () => {
  const tools = getFallbackTools()
  const names = new Set(tools.map((tool) => tool.name))
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))

  assert.equal(names.has('system_artifact_upload_export'), true)
  assert.equal(names.has('system_artifact_upload_hls_stream'), true)
  assert.equal(names.has('system_artifact_get_stream'), true)
  assert.match(String(toolsByName.get('system_artifact_upload_export')?.description), /HLS manifests must use system_artifact_upload_hls_stream/)
  assert.match(String(toolsByName.get('system_artifact_upload_export')?.description), /MediaStreamArtifact/)
  assert.match(String(toolsByName.get('system_artifact_upload_export')?.description), /projectId/)
  assert.ok(toolsByName.get('system_artifact_upload_export')?.inputSchema?.properties?.projectId)
  assert.ok(toolsByName.get('system_artifact_upload_export')?.inputSchema?.properties?.project_id)
  assert.match(String(toolsByName.get('system_artifact_upload_hls_stream')?.description), /projectId/)
  assert.ok(toolsByName.get('system_artifact_upload_hls_stream')?.inputSchema?.properties?.projectId)
  assert.ok(toolsByName.get('system_artifact_upload_hls_stream')?.inputSchema?.properties?.project_id)
})

test('MovScript generation skill resource grants match neutral bridge bootstrap tools', () => {
  const fallbackNames = new Set(getFallbackToolNames())
  const skill = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/generation/SKILL.md'), 'utf8')
  const grantedResourceTools = Array.from(
    skill.matchAll(/mcp__movscript__(system_resource_[a-z0-9_]+)/g),
    (match) => match[1],
  )

  assert.deepEqual(grantedResourceTools.sort(), [
    'system_resource_image_annotate',
    'system_resource_image_read',
    'system_resource_image_transform_to_resource',
    'system_resource_library_query',
    'system_resource_upload',
    'system_resource_video_contact_sheet_to_resource',
    'system_resource_video_extract_audio_to_resource',
    'system_resource_video_extract_frame_to_resource',
    'system_resource_video_extract_frames',
    'system_resource_video_extract_frames_to_resources',
    'system_resource_video_probe',
    'system_resource_video_trim_to_resource',
  ].sort())

  for (const name of grantedResourceTools) {
    assert.equal(fallbackNames.has(name), true, `${name} should be exposed by bridge bootstrap list`)
  }

  assert.doesNotMatch(skill, /system_resource_video_compose_to_resource/)
  assert.doesNotMatch(skill, /system_resource_video_concat_to_resource/)
})

test('MovScript plugin bridge bootstrap list and generation skill expose batch generation polling tools', () => {
  const fallbackNames = new Set(getFallbackToolNames())
  const skill = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/generation/SKILL.md'), 'utf8')

  for (const name of [
    'generation_image_job_get_batch',
    'system_generate_image_job_get_batch',
    'generation_video_job_get_batch',
    'system_generate_video_job_get_batch',
    'generation_audio_job_get_batch',
  ]) {
    assert.equal(fallbackNames.has(name), true, `${name} should be exposed by bridge bootstrap list`)
  }

  for (const grant of [
    'mcp__movscript__system_generate_image_job_get_batch',
    'mcp__movscript__system_generate_video_job_get_batch',
    'mcp__movscript__generation_audio_job_get_batch',
  ]) {
    assert.match(skill, new RegExp(grant))
  }
  assert.match(skill, /When tracking multiple jobs, use `system_generate_image_job_get_batch`, `system_generate_video_job_get_batch`, or `generation_audio_job_get_batch`/)
})

test('MovScript editing skill grants match the bridge bootstrap editing tools', () => {
  const skill = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/editing/SKILL.md'), 'utf8')
  const grantedEditingTools = Array.from(
    skill.matchAll(/mcp__movscript__(editing_[a-z0-9_]+)/g),
    (match) => match[1],
  )

  assert.deepEqual(grantedEditingTools.sort(), getFallbackEditingToolNames().sort())
})
