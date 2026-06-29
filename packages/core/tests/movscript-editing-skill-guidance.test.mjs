import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')

const toolDefinitionPaths = [
  'packages/core/src/mcp/node/server/toolRegistry.ts',
  'packages/core/src/mcp/tools/artifact/definitions.ts',
  'packages/core/src/mcp/tools/context/definitions.ts',
  'packages/core/src/mcp/tools/domain/definitions.ts',
  'packages/core/src/mcp/tools/editing/definitions.ts',
  'packages/core/src/mcp/tools/external-resources/definitions.ts',
  'packages/core/src/mcp/tools/generation/definitions.ts',
  'packages/core/src/mcp/tools/model/definitions.ts',
  'packages/core/src/mcp/tools/resource-library/definitions.ts',
  'packages/core/src/mcp/tools/resource-media/definitions.ts',
  'packages/core/src/mcp/tools/shot-library/definitions.ts',
  'packages/core/src/mcp/tools/timeline/definitions.ts',
]

function readRepoFile(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

function toolNamesFromSource(source) {
  const names = new Set()
  for (const match of source.matchAll(/\bname:\s*['"]([^'"]+)['"]/g)) names.add(match[1])
  for (const match of source.matchAll(/"name":\s*"([^"]+)"/g)) names.add(match[1])
  for (const match of source.matchAll(/\b\w+Tool\(\s*['"]([^'"]+)['"]/g)) names.add(match[1])
  for (const match of source.matchAll(/^\s*[A-Za-z0-9_]+:\s*['"]((?:system_|generation_audio_)[^'"]+)['"],?$/gm)) names.add(match[1])
  return Array.from(names)
}

function getMCPToolNames() {
  return toolDefinitionPaths.flatMap((path) => toolNamesFromSource(readRepoFile(path)))
}

function getEditingToolNames() {
  return toolNamesFromSource(readRepoFile('packages/core/src/mcp/tools/editing/definitions.ts'))
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
  assert.match(source, /task-specific working copy/)
  assert.match(source, /many independent edits, drafts, variants, exports, and candidates/)
  assert.match(source, /Do not use domain planning\/production records as the editing workspace/)
  assert.match(source, /use `domain_read_production_timeline` only as a legacy production \/ timeline-assembly material handoff/)
  assert.match(source, /Do not assume `domain_read_production_edit_plan` or any legacy production\/timeline-scope handoff is the correct default/)
  assert.match(source, /Returning an edit to the domain means importing the artifact/)
  assert.match(source, /Bring the completed artifact back explicitly/)
  assert.match(source, /Do not use `timeline_document` or historical third-party fields as the main workflow contract/)
  assert.match(source, /output\.hlsVariants/)
  assert.match(source, /ASS\/libass/)
  assert.match(source, /Do not automatically create, adopt, or select candidates after a render succeeds/)
  assert.match(source, /RawResource-backed candidate creation/)
  assert.match(source, /HLS `MediaStreamArtifact` outputs as hosted previews/)
  assert.match(source, /future domain candidate schema extension/)
  assert.match(source, /when any export or artifact tool resolves an Electron task by `taskId`, pass the matching `projectId` as well/)
  assert.match(source, /`editing_export_save_local`, `editing_export_import_resource`, `editing_export_publish_hls`, `system_artifact_upload_export`, and `system_artifact_upload_hls_stream`/)

  assert.doesNotMatch(source, /domain_compose_scene_moment_from_edit_plan` is the default/)
  assert.doesNotMatch(source, /domain_read_production_edit_plan` is the default/)
  assert.doesNotMatch(source, /Use `domain_read_production_edit_plan` as the default/)
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
  const toolRegistry = readRepoFile('packages/core/src/mcp/node/server/toolRegistry.ts')
  const editingDefinitions = readRepoFile('packages/core/src/mcp/tools/editing/definitions.ts')
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

  assert.match(editingDefinitions, /MediaEditingProject from a MovScript edit_plan/)
  assert.match(editingDefinitions, /export function editingTools\(\)/)
  assert.match(editingDefinitions, /name: 'editing_project_create_from_edit_plan'/)
  assert.match(editingDefinitions, /name: 'editing_timeline_apply_commands'/)
  assert.match(editingDefinitions, /name: 'editing_timeline_add_clip'/)
  assert.match(editingDefinitions, /name: 'editing_runtime_capabilities_get'/)
  assert.match(editingDefinitions, /name: 'editing_task_render_create'/)
  assert.match(editingDefinitions, /name: 'editing_export_import_resource'/)
  assert.match(toolRegistry, /\.\.\.editingTools\(\)/)
  assert.doesNotMatch(editingDefinitions, /name: 'domain_compose_scene_moment_from_edit_plan'/)
  assert.doesNotMatch(editingDefinitions, /name: 'domain_compose_production_from_timeline'/)
  assert.doesNotMatch(editingDefinitions, /name: 'domain_apply_scene_moment_timeline_commands'/)
  assert.doesNotMatch(editingDefinitions, /name: 'domain_apply_production_timeline_commands'/)
  assert.doesNotMatch(editingDefinitions, /domain_compose_scene_moment_from_edit_plan'[\s\S]*timelineDocument/)
  assert.doesNotMatch(editingDefinitions, /domain_compose_scene_moment_from_edit_plan'[\s\S]*timeline_document/)
  assert.doesNotMatch(editingDefinitions, /domain_compose_production_from_timeline'[\s\S]*timelineDocument/)
  assert.doesNotMatch(editingDefinitions, /domain_compose_production_from_timeline'[\s\S]*timeline_document/)
  assert.doesNotMatch(editingDefinitions, /OpenCut-compatible/)
  assert.doesNotMatch(editingDefinitions, /OpenCut-style/)

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

test('MovScript MCP tool definitions expose the dedicated editing tool family', () => {
  const names = new Set(getMCPToolNames())
  const editingDefinitions = readRepoFile('packages/core/src/mcp/tools/editing/definitions.ts')
  assert.equal(names.has('domain_compose_scene_moment_from_edit_plan'), false)
  assert.equal(names.has('domain_compose_production_from_timeline'), false)
  assert.equal(names.has('domain_apply_scene_moment_timeline_commands'), false)
  assert.equal(names.has('domain_apply_production_timeline_commands'), false)
  assert.deepEqual(getEditingToolNames(), [
    'editing_project_create',
    'editing_project_create_from_edit_plan',
    'editing_project_create_from_edit_decisions',
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
    'editing_video_compose',
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
  assert.match(editingDefinitions, /HLS manifests must use editing_export_publish_hls/)
  assert.match(editingDefinitions, /MediaStreamArtifact/)
  for (const name of [
    'editing_task_render_create',
    'editing_task_hls_create',
    'editing_task_transcode_create',
    'editing_task_reframe_create',
  ]) {
    assert.equal(names.has(name), true, `${name} should be exposed by MCP definitions`)
  }
  assert.match(editingDefinitions, /projectId/)
  assert.match(editingDefinitions, /project_id/)
  for (const name of [
    'editing_task_get',
    'editing_task_cancel',
    'editing_task_logs_get',
    'editing_export_import_resource',
    'editing_export_save_local',
    'editing_export_publish_hls',
  ]) {
    assert.equal(names.has(name), true, `${name} should be exposed by MCP definitions`)
  }
  assert.match(editingDefinitions, /complete HLS bundle/)
  assert.match(editingDefinitions, /saveDirectory/)
  assert.match(editingDefinitions, /save_directory/)
  assert.match(editingDefinitions, /hlsDirectory/)
  assert.match(editingDefinitions, /segmentPaths/)
  assert.match(editingDefinitions, /RawResource-backed/)
  assert.match(editingDefinitions, /future domain candidate schema extension/)
  assert.match(editingDefinitions, /Known unsupported HLS MediaStreamArtifact ID/)
})

test('MovScript MCP tool definitions expose neutral artifact hosting tools', () => {
  const names = new Set(getMCPToolNames())
  const artifactDefinitions = readRepoFile('packages/core/src/mcp/tools/artifact/definitions.ts')

  assert.equal(names.has('system_artifact_upload_export'), true)
  assert.equal(names.has('system_artifact_upload_hls_stream'), true)
  assert.equal(names.has('system_artifact_get_stream'), true)
  assert.match(artifactDefinitions, /HLS manifests must use system_artifact_upload_hls_stream/)
  assert.match(artifactDefinitions, /MediaStreamArtifact/)
  assert.match(artifactDefinitions, /projectId/)
  assert.match(artifactDefinitions, /project_id/)
})

test('MovScript generation skill resource grants match neutral MCP resource tools', () => {
  const fallbackNames = new Set(getMCPToolNames())
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
    assert.equal(fallbackNames.has(name), true, `${name} should be exposed by MCP definitions`)
  }

  assert.doesNotMatch(skill, /system_resource_video_compose_to_resource/)
  assert.doesNotMatch(skill, /system_resource_video_concat_to_resource/)
})

test('MovScript MCP tool definitions and generation skill expose batch generation polling tools', () => {
  const fallbackNames = new Set(getMCPToolNames())
  const skill = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/generation/SKILL.md'), 'utf8')

  for (const name of [
    'generation_job_get_batch',
  ]) {
    assert.equal(fallbackNames.has(name), true, `${name} should be exposed by MCP definitions`)
  }

  for (const grant of [
    'mcp__movscript__generation_job_get_batch',
  ]) {
    assert.match(skill, new RegExp(grant))
  }
  assert.match(skill, /When tracking multiple jobs, use `generation_job_get_batch`/)
})

test('MovScript generation skill routes content-unit visual generation through the unified generation contract', () => {
  const fallbackNames = new Set(getMCPToolNames())
  const skill = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/generation/SKILL.md'), 'utf8')
  const candidateSelectionFlow = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/generation/references/candidate-selection-flow.md'), 'utf8')
  const cachedCandidateSelectionFlow = readFileSync(resolve(repoRoot, 'apps/desktop/plugin-cache/movscript-bundled/movscript/9cc8f9d8c6628c1a/skills/generation/references/candidate-selection-flow.md'), 'utf8')
  const coreDefinitions = readFileSync(resolve(repoRoot, 'packages/core/src/mcp/tools/generation/definitions.ts'), 'utf8')
  const coreActions = readFileSync(resolve(repoRoot, 'packages/core/src/mcp/node/tools/generation/actions.ts'), 'utf8')
  const router = readFileSync(resolve(repoRoot, 'packages/core/src/mcp/node/tools/router.ts'), 'utf8')

  for (const name of [
    'generation_prepare',
    'generation_submit',
    'generation_job_get',
    'generation_result_register',
  ]) {
    assert.equal(fallbackNames.has(name), true, `${name} should be exposed by MCP definitions`)
  }

  for (const grant of [
    'mcp__movscript__generation_prepare',
    'mcp__movscript__generation_submit',
    'mcp__movscript__generation_job_get',
    'mcp__movscript__generation_result_register',
  ]) {
    assert.match(skill, new RegExp(grant))
  }

  assert.match(skill, /first write or update the content unit `edit_prompt`.*call `generation_submit` with `scope: "content_unit"`/)
  assert.match(skill, /Do not manually call `domain_create_content_candidate` after `generation_submit` content-unit image\/video jobs/)
  assert.match(skill, /Use `generation_submit` with `scope: "free"` for low-level prompt channels/)
  assert.match(candidateSelectionFlow, /Successful terminal polls automatically create or refresh backend content candidates/)
  assert.match(candidateSelectionFlow, /Do not manually call `domain_create_content_candidate` after `generation_submit` content-unit image\/video jobs/)
  assert.match(cachedCandidateSelectionFlow, /Successful terminal polls automatically create or refresh backend content candidates/)
  assert.match(cachedCandidateSelectionFlow, /Do not manually call `domain_create_content_candidate` after `generation_submit` content-unit image\/video jobs/)

  assert.match(coreDefinitions, /generation_submit/)
  assert.match(coreDefinitions, /generation_job_get/)
  assert.match(coreActions, /domainBuildContentUnitBackendPrompt/)
  assert.match(coreActions, /domainCreateContentCandidate/)
  assert.match(coreActions, /contentUnitGenerationCandidateId/)
  assert.match(router, /case 'generation_submit'/)
  assert.match(router, /case 'generation_job_get'/)
})

test('MovScript skills and MCP definitions expose raw-resource candidate registration and production summaries', () => {
  const fallbackNames = new Set(getMCPToolNames())
  const generationSkill = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/generation/SKILL.md'), 'utf8')
  const domainSkill = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/domain/SKILL.md'), 'utf8')
  const modelUsage = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/generation/references/model-usage.md'), 'utf8')

  assert.equal(fallbackNames.has('domain_register_raw_resource_as_content_unit_candidate'), true)
  assert.equal(fallbackNames.has('domain_production_status_summary'), true)
  assert.match(generationSkill, /mcp__movscript__domain_register_raw_resource_as_content_unit_candidate/)
  assert.match(generationSkill, /mcp__movscript__domain_production_status_summary/)
  assert.match(domainSkill, /RawResource is the media\/resource body/)
  assert.match(modelUsage, /Default to a direct `scene_moment_ref` content unit/)
  assert.match(modelUsage, /Use `domain_register_raw_resource_as_content_unit_candidate`/)
})

test('MovScript skills teach namespace planning and legacy production projection boundaries', () => {
  for (const skillRoot of ['plugins/movscript/skills', 'apps/plugin/skills']) {
    const planningSkill = readRepoFile(`${skillRoot}/planning/SKILL.md`)
    const domainSkill = readRepoFile(`${skillRoot}/domain/SKILL.md`)
    const planningWorkflow = readRepoFile(`${skillRoot}/planning/references/planning-workflows.md`)
    const entityMapping = readRepoFile(`${skillRoot}/planning/references/entity-mapping.md`)
    const entityGlossary = readRepoFile(`${skillRoot}/domain/references/entity-glossary.md`)
    const domainStory = readRepoFile(`${skillRoot}/domain/references/domain-story.md`)

    assert.match(planningSkill, /output\/scope granularity/)
    assert.match(planningSkill, /timeline namespace scope that needs a `timeline_assembly_ref`/)
    assert.match(planningSkill, /legacy production\/segment projection writer/)
    assert.match(planningSkill, /explicit `timeline_assembly_ref` content unit/)
    assert.doesNotMatch(planningSkill, /production granularity/)
    assert.doesNotMatch(planningSkill, /segments, or productions/)

    assert.match(domainSkill, /legacy production\/segment projection writer/)
    assert.match(domainSkill, /explicit `timeline_assembly_ref` content unit/)
    assert.match(planningWorkflow, /timeline namespace node \(legacy production\/segment projection when needed\)/)
    assert.match(entityMapping, /legacy `production` \/ `segment` records projected as `timeline_namespace`/)
    assert.match(entityGlossary, /Timeline namespace nodes organize story\/time structure/)
    assert.match(domainStory, /Timeline namespace nodes organize story rhythm/)
    assert.match(domainStory, /`timeline_assembly_ref` is the production target for a namespace scope/)
  }
})

test('MovScript generation editing and review skills describe timeline scope and assembly boundaries', () => {
  for (const skillRoot of ['plugins/movscript/skills', 'apps/plugin/skills']) {
    const generationSkill = readRepoFile(`${skillRoot}/generation/SKILL.md`)
    const candidateSelectionFlow = readRepoFile(`${skillRoot}/generation/references/candidate-selection-flow.md`)
    const editingSkill = readRepoFile(`${skillRoot}/editing/SKILL.md`)
    const reviewSkill = readRepoFile(`${skillRoot}/review/SKILL.md`)

    assert.match(generationSkill, /outputs anchored to content units, including system primitives and `timeline_assembly_ref` scope outputs/)
    assert.match(generationSkill, /scene-moment video or timeline assembly/)
    assert.match(candidateSelectionFlow, /system primitive and timeline assembly outputs/)
    assert.doesNotMatch(generationSkill, /requested production work/)
    assert.doesNotMatch(generationSkill, /production outputs anchored to content units/)

    assert.match(editingSkill, /timeline scope\/assembly/)
    assert.match(editingSkill, /legacy production \/ timeline-assembly material handoff/)
    assert.match(editingSkill, /legacy production\/timeline-scope handoff/)
    assert.match(editingSkill, /namespace nodes/)
    assert.doesNotMatch(editingSkill, /production has one canonical edit/)
    assert.doesNotMatch(editingSkill, /production-level edit/)

    assert.match(reviewSkill, /generation readiness/)
    assert.match(reviewSkill, /assembly content unit/)
    assert.doesNotMatch(reviewSkill, /production readiness/)
  }
})

test('MovScript editing skill grants match the MCP editing tools', () => {
  const skill = readFileSync(resolve(repoRoot, 'plugins/movscript/skills/editing/SKILL.md'), 'utf8')
  const grantedEditingTools = Array.from(
    skill.matchAll(/mcp__movscript__(editing_[a-z0-9_]+)/g),
    (match) => match[1],
  )

  assert.deepEqual(grantedEditingTools.sort(), getEditingToolNames().sort())
})
