import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('MCP server exposes candidate tools and multi-output generation contracts', () => {
  const serverSource = readFileSync(resolve('electron/mcp/server.ts'), 'utf8')
  const candidateParamsSource = readFileSync(resolve('electron/mcp/candidateParams.ts'), 'utf8')
  const createJobTool = JSON.parse(readFileSync(resolve('../agent/catalog/tools/movscript/visual-generation/create-job.tool.json'), 'utf8'))
  const assetTool = JSON.parse(readFileSync(resolve('../agent/catalog/tools/movscript/visual-generation/attach-asset-slot-candidate.tool.json'), 'utf8'))
  const keyframeTool = JSON.parse(readFileSync(resolve('../agent/catalog/tools/movscript/visual-generation/attach-keyframe-candidate.tool.json'), 'utf8'))

  assert.match(serverSource, /name:\s*'movscript_attach_asset_slot_candidate'/)
  assert.match(serverSource, /name:\s*'movscript_attach_keyframe_candidate'/)
  assert.match(serverSource, /case 'movscript_attach_asset_slot_candidate':/)
  assert.match(serverSource, /case 'movscript_attach_keyframe_candidate':/)

  assert.match(serverSource, /output_resources\/output_resource_ids/)
  assert.match(serverSource, /output_resource_ids:\s*\{\s*type:\s*'array'/)
  assert.match(createJobTool.description, /output_resources\/output_resource_ids/)
  assert.ok(createJobTool.outputSchema.properties.output_resources)
  assert.ok(createJobTool.outputSchema.properties.output_resource_ids)

  assert.match(serverSource, /const resourceIdAliases = \['resource_id', 'resourceId', 'output_resource_id', 'outputResourceId'\]/)
  assert.match(JSON.stringify(assetTool.inputSchema.allOf), /outputResourceId/)
  assert.match(JSON.stringify(keyframeTool.inputSchema.allOf), /outputResourceId/)
  assert.match(serverSource, /import \{ getRequiredPositiveIntegerAliasParam \} from '\.\/candidateParams'/)
  assert.match(candidateParamsSource, /aliases must match/)
  assert.equal(assetTool.inputSchema.properties.output_resource_id.minimum, 1)
  assert.equal(keyframeTool.inputSchema.properties.output_resource_id.minimum, 1)
  assert.equal(keyframeTool.inputSchema.properties.target_keyframe_id.minimum, 1)

  assert.match(serverSource, /Add an existing raw resource to the reviewable candidate set for an original target keyframe \/ visual anchor/)
  assert.match(serverSource, /Do not pass an existing generated candidate keyframe as the target/)
  assert.match(serverSource, /target_keyframe_id/)
  assert.match(serverSource, /targetKeyframeId/)
  assert.match(serverSource, /target keyframe \/ visual anchor ID, not an existing generated candidate keyframe/)
  assert.match(keyframeTool.description, /不要把已有 generated candidate keyframe 当作目标传入/)

  assert.match(serverSource, /source:\s*'ai_generated_keyframe_candidate'/)
  assert.match(serverSource, /isGeneratedKeyframeCandidateTarget\(target\)/)
  assert.match(serverSource, /return isGeneratedKeyframeCandidateRecord\(keyframe\)/)
  assert.match(serverSource, /asset_slot: new Set\(\['name', 'kind', 'description', 'prompt_hint', 'priority', 'status', 'metadata_json'\]\)/)
  assert.match(serverSource, /keyframe: new Set\(\['title', 'description', 'prompt', 'status', 'metadata_json'\]\)/)
  assert.doesNotMatch(serverSource, /asset_slot: new Set\(\[[^\]]*resource_id[^\]]*\]\)/)
  assert.doesNotMatch(serverSource, /keyframe: new Set\(\[[^\]]*resource_id[^\]]*\]\)/)
  assert.match(candidateParamsSource, /`\$\{label\} is required`/)
  assert.match(serverSource, /getRequiredPositiveIntegerAliasParam\(args, resourceIdAliases, 'resource_id'\)/)
})
