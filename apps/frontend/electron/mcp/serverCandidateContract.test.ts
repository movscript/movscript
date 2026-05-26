import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('MCP server exposes candidate tools and multi-output generation contracts', () => {
  const serverSource = readFileSync(resolve('electron/mcp/server.ts'), 'utf8')
  const toolRegistrySource = readFileSync(resolve('electron/mcp/toolRegistry.ts'), 'utf8')
  const generationToolDefinitionsSource = readFileSync(resolve('electron/mcp/tools/generationToolDefinitions.ts'), 'utf8')
  const generationToolDefinitionModuleSources = [
    'candidateToolDefinitions',
    'generationConnectorToolDefinitions',
    'generationJobToolDefinitions',
    'generationModelToolDefinitions',
  ].map((name) => readFileSync(resolve(`electron/mcp/tools/${name}.ts`), 'utf8')).join('\n')
  const toolSchemaSource = readFileSync(resolve('electron/mcp/tools/schema.ts'), 'utf8')
  const toolCallRouterSource = readFileSync(resolve('electron/mcp/tools/router.ts'), 'utf8')
  const draftReviewApplySource = readFileSync(resolve('electron/mcp/draftReviewApply.ts'), 'utf8')
  const draftReviewApplyModuleSources = [
    'apply',
    'directPatch',
    'proposalPayloads',
    'projectLayerProposalKind',
    'productionProposalPayloads',
    'projectLayerProposalPayloads',
    'projectLayerProposalStyle',
    'proposalTargets',
    'request',
    'types',
    'utils',
  ].map((name) => readFileSync(resolve(`electron/mcp/draftReviewApply/${name}.ts`), 'utf8')).join('\n')
  const candidateAttachSource = readFileSync(resolve('electron/mcp/candidateAttach.ts'), 'utf8')
  const candidateAttachModuleSources = [
    'assetSlotCandidate',
    'candidateParams',
    'keyframeCandidate',
    'keyframeRecords',
    'params',
    'utils',
  ].map((name) => readFileSync(resolve(`electron/mcp/candidateAttach/${name}.ts`), 'utf8')).join('\n')
  const generationJobsSource = readFileSync(resolve('electron/mcp/generationJobs.ts'), 'utf8')
  const generationModelContractsSource = readFileSync(resolve('electron/mcp/generationModelContracts.ts'), 'utf8')
  const generationModelContractModuleSources = [
    'audit',
    'contract',
    'extraParams',
    'preflight',
    'preflightInputs',
    'preflightParams',
    'preflightScalar',
    'preflightTypes',
    'routing',
    'types',
    'utils',
  ].map((name) => readFileSync(resolve(`electron/mcp/generationModelContracts/${name}.ts`), 'utf8')).join('\n')
  const candidateAttachContractSource = `${candidateAttachSource}\n${candidateAttachModuleSources}`
  const mcpContractSource = `${serverSource}\n${toolRegistrySource}\n${generationToolDefinitionsSource}\n${generationToolDefinitionModuleSources}\n${toolSchemaSource}\n${toolCallRouterSource}\n${draftReviewApplySource}\n${draftReviewApplyModuleSources}\n${candidateAttachContractSource}\n${generationJobsSource}\n${generationModelContractsSource}\n${generationModelContractModuleSources}`
  const candidateParamsSource = readFileSync(resolve('electron/mcp/candidateAttach/candidateParams.ts'), 'utf8')
  const createJobTool = JSON.parse(readFileSync(resolve('../agent/catalog/tools/generation/job-create.tool.json'), 'utf8'))
  const assetTool = JSON.parse(readFileSync(resolve('../agent/catalog/tools/candidate/asset-slot-attach.tool.json'), 'utf8'))
  const keyframeTool = JSON.parse(readFileSync(resolve('../agent/catalog/tools/candidate/keyframe-attach.tool.json'), 'utf8'))

  assert.match(mcpContractSource, /name:\s*'candidate_asset_slot_attach'/)
  assert.match(mcpContractSource, /name:\s*'candidate_keyframe_attach'/)
  assert.match(toolCallRouterSource, /case 'candidate_asset_slot_attach':/)
  assert.match(toolCallRouterSource, /case 'candidate_keyframe_attach':/)

  assert.match(mcpContractSource, /independent single-output AI image or video generation jobs/)
  assert.match(mcpContractSource, /output_count/)
  assert.match(mcpContractSource, /output_resource_ids:\s*\{\s*type:\s*'array'/)
  assert.match(createJobTool.description, /independent single-output/)
  assert.ok(createJobTool.inputSchema.properties.output_count)
  assert.ok(createJobTool.outputSchema.properties.output_resources)
  assert.ok(createJobTool.outputSchema.properties.output_resource_ids)
  assert.ok(createJobTool.outputSchema.properties.jobIds)

  assert.match(mcpContractSource, /const resourceIdAliases = \['resource_id', 'resourceId', 'output_resource_id', 'outputResourceId', 'resource_ids', 'resourceIds', 'output_resource_ids', 'outputResourceIds'\]/)
  assert.match(JSON.stringify(assetTool.inputSchema.allOf), /outputResourceId/)
  assert.match(JSON.stringify(assetTool.inputSchema.allOf), /outputResourceIds/)
  assert.match(JSON.stringify(keyframeTool.inputSchema.allOf), /outputResourceId/)
  assert.match(JSON.stringify(keyframeTool.inputSchema.allOf), /outputResourceIds/)
  assert.match(candidateAttachContractSource, /getRequiredPositiveIntegerAliasParam/)
  assert.match(candidateAttachContractSource, /getRequiredPositiveIntegerAliasParams/)
  assert.match(candidateAttachContractSource, /from '\.\/candidateParams'/)
  assert.match(candidateParamsSource, /aliases must match/)
  assert.equal(assetTool.inputSchema.properties.output_resource_id.minimum, 1)
  assert.equal(assetTool.inputSchema.properties.output_resource_ids.items.minimum, 1)
  assert.equal(keyframeTool.inputSchema.properties.output_resource_id.minimum, 1)
  assert.equal(keyframeTool.inputSchema.properties.output_resource_ids.items.minimum, 1)
  assert.equal(keyframeTool.inputSchema.properties.target_keyframe_id.minimum, 1)

  assert.match(mcpContractSource, /Add one existing raw resource to the reviewable candidate set for an original target keyframe \/ visual anchor/)
  assert.match(mcpContractSource, /Do not pass an existing generated candidate keyframe as the target/)
  assert.match(mcpContractSource, /target_keyframe_id/)
  assert.match(mcpContractSource, /targetKeyframeId/)
  assert.match(mcpContractSource, /target keyframe \/ visual anchor ID, not an existing generated candidate keyframe/)
  assert.match(keyframeTool.description, /不要把已有 generated candidate keyframe 当作目标传入/)

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
