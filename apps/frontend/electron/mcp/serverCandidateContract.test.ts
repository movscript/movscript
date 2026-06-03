import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('MCP server exposes candidate tools and multi-output generation contracts', () => {
  const serverSource = readFileSync(resolve('electron/mcp/server.ts'), 'utf8')
  const toolRegistrySource = readFileSync(resolve('electron/mcp/toolRegistry.ts'), 'utf8')
  const generationToolDefinitionModuleSources = [
    'candidateToolDefinitions',
    'modelToolDefinitions',
  ].map((name) => readFileSync(resolve(`electron/mcp/tools/${name}.ts`), 'utf8')).join('\n')
  const toolSchemaSource = readFileSync(resolve('electron/mcp/tools/schema.ts'), 'utf8')
  const toolCallRouterSource = readFileSync(resolve('electron/mcp/tools/router.ts'), 'utf8')
  const workspaceReviewApplySource = readFileSync(resolve('electron/mcp/workspaceReviewApply.ts'), 'utf8')
  const workspaceReviewApplyModuleSources = [
    'apply',
    'directPatch',
    'workspacePayloads',
    'projectLayerWorkspaceKind',
    'productionWorkspacePayloads',
    'projectLayerWorkspacePayloads',
    'projectLayerWorkspaceStyle',
    'workspaceTargets',
    'request',
    'types',
    'utils',
  ].map((name) => readFileSync(resolve(`electron/mcp/workspaceReviewApply/${name}.ts`), 'utf8')).join('\n')
  const candidateAttachSource = readFileSync(resolve('electron/mcp/candidateAttach.ts'), 'utf8')
  const candidateAttachModuleSources = [
    'assetSlotCandidate',
    'candidateParams',
    'keyframeCandidate',
    'keyframeRecords',
    'params',
    'utils',
  ].map((name) => readFileSync(resolve(`electron/mcp/candidateAttach/${name}.ts`), 'utf8')).join('\n')
  const candidateAttachContractSource = `${candidateAttachSource}\n${candidateAttachModuleSources}`
  const mcpContractSource = `${serverSource}\n${toolRegistrySource}\n${generationToolDefinitionModuleSources}\n${toolSchemaSource}\n${toolCallRouterSource}\n${workspaceReviewApplySource}\n${workspaceReviewApplyModuleSources}\n${candidateAttachContractSource}`
  const candidateParamsSource = readFileSync(resolve('electron/mcp/candidateAttach/candidateParams.ts'), 'utf8')
  const imageGenerateTool = JSON.parse(readFileSync(resolve('../agent/catalog/tools/generation/image-generate.tool.json'), 'utf8'))
  const imageJobGetTool = JSON.parse(readFileSync(resolve('../agent/catalog/tools/generation/image-job-get.tool.json'), 'utf8'))
  const videoGenerateTool = JSON.parse(readFileSync(resolve('../agent/catalog/tools/generation/video-generate.tool.json'), 'utf8'))
  const videoJobGetTool = JSON.parse(readFileSync(resolve('../agent/catalog/tools/generation/video-job-get.tool.json'), 'utf8'))

  assert.match(mcpContractSource, /name:\s*'candidate_asset_slot_attach'/)
  assert.match(mcpContractSource, /name:\s*'candidate_keyframe_attach'/)
  assert.match(toolCallRouterSource, /case 'candidate_asset_slot_attach':/)
  assert.match(toolCallRouterSource, /case 'candidate_keyframe_attach':/)

  assert.match(toolRegistrySource, /listMCPPluginTools/)
  assert.match(toolCallRouterSource, /findMCPPluginTool\(name\)/)
  assert.match(toolCallRouterSource, /callMCPPluginTool/)
  assert.match(mcpContractSource, /generation_model_list/)
  assert.match(imageGenerateTool.description, /provider job/)
  assert.match(videoGenerateTool.description, /provider job/)
  assert.ok(imageGenerateTool.inputSchema.properties.prompt)
  assert.ok(videoGenerateTool.inputSchema.properties.prompt)
  assert.ok(imageGenerateTool.outputSchema.properties.monitor)
  assert.ok(videoGenerateTool.outputSchema.properties.monitor)
  assert.ok(imageJobGetTool.outputSchema.properties.output_resource_ids)
  assert.ok(videoJobGetTool.outputSchema.properties.output_resource_ids)

  assert.match(mcpContractSource, /const resourceIdAliases = \['resource_id', 'resourceId', 'output_resource_id', 'outputResourceId', 'resource_ids', 'resourceIds', 'output_resource_ids', 'outputResourceIds'\]/)
  assert.match(mcpContractSource, /outputResourceId/)
  assert.match(mcpContractSource, /outputResourceIds/)
  assert.match(candidateAttachContractSource, /getRequiredPositiveIntegerAliasParam/)
  assert.match(candidateAttachContractSource, /getRequiredPositiveIntegerAliasParams/)
  assert.match(candidateAttachContractSource, /from '\.\/candidateParams'/)
  assert.match(candidateParamsSource, /aliases must match/)
  assert.match(mcpContractSource, /output_resource_id: \{ type: 'number', minimum: 1/)
  assert.match(mcpContractSource, /output_resource_ids: \{ type: 'array', items: \{ type: 'number', minimum: 1 \}/)
  assert.match(mcpContractSource, /target_keyframe_id: \{ type: 'number', minimum: 1/)

  assert.match(mcpContractSource, /Add one existing raw resource to the reviewable candidate set for an original target keyframe \/ visual anchor/)
  assert.match(mcpContractSource, /Do not pass an existing generated candidate keyframe as the target/)
  assert.match(mcpContractSource, /target_keyframe_id/)
  assert.match(mcpContractSource, /targetKeyframeId/)
  assert.match(mcpContractSource, /target keyframe \/ visual anchor ID, not an existing generated candidate keyframe/)

  assert.match(candidateAttachContractSource, /source:\s*'ai_generated_keyframe_candidate'/)
  assert.match(candidateAttachContractSource, /isGeneratedKeyframeCandidateTarget\(target\)/)
  assert.match(candidateAttachContractSource, /return isGeneratedKeyframeCandidateRecord\(keyframe\)/)
  assert.match(mcpContractSource, /asset_slot: new Set\(\['name', 'kind', 'description', 'prompt_hint', 'priority', 'status', 'metadata_json'\]\)/)
  assert.match(mcpContractSource, /keyframe: new Set\(\['title', 'description', 'prompt', 'status', 'metadata_json'\]\)/)
  assert.doesNotMatch(mcpContractSource, /asset_slot: new Set\(\[[^\]]*resource_id[^\]]*\]\)/)
  assert.doesNotMatch(mcpContractSource, /keyframe: new Set\(\[[^\]]*resource_id[^\]]*\]\)/)
  assert.match(candidateParamsSource, /`\$\{label\} is required`/)
  assert.match(candidateAttachContractSource, /RESOURCE_ID_ALIASES = \[/)
  assert.match(candidateAttachContractSource, /getRequiredPositiveIntegerAliasParams\(args, RESOURCE_ID_ALIASES, 'resource_id'\)/)
})
