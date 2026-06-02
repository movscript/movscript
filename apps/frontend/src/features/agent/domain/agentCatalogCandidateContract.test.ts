import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'

const sourceCatalog = resolve('../agent/catalog')
const deployedCatalog = resolve('movscript-agent/catalog')

test('agent catalog keeps candidate generation contracts for deploy', () => {
  const visualInstruction = readFile('skills/generation/visual_execution/instruction.md')
  assert.match(visualInstruction, /`continuationPolicy: \{ "mode": "any_completed"/)
  assert.match(visualInstruction, /每拿到一个可用 `output_resource_id`，立即单独调用一次 `candidate_asset_slot_attach`/)
  assert.match(visualInstruction, /每拿到一个可用 `output_resource_id`，立即单独调用一次 `candidate_keyframe_attach`/)
  assert.match(visualInstruction, /不要把 `output_resource_ids`、`resource_ids` 或多个资源 ID 合并传入同一次候选写入/)
  assert.match(visualInstruction, /必须逐个调用 attach，并逐项报告成功、失败或阻塞/)

  const visualTask = readJson('skills/generation/visual_execution/skill.json')
  assert.equal(visualTask.toolGrants.includes('candidate_keyframe_attach'), true)
  assert.match(JSON.stringify(visualTask.triggers), /关键帧候选/)
  assert.match(JSON.stringify(visualTask.triggers), /visual anchor candidate/)

  const runtimeWorkStart = readJson('tools/core/work-start.tool.json')
  assert.match(runtimeWorkStart.description, /kind:\"generation_job\"/)
  assert.equal(runtimeWorkStart.inputSchema.properties.kind.enum.includes('generation_job'), true)
  assert.equal(runtimeWorkStart.inputSchema.properties.kind.enum.includes('subagent_run'), true)
  assert.ok(runtimeWorkStart.inputSchema.properties.request)

  const assetTool = readJson('tools/candidate/asset-slot-attach.tool.json')
  assert.equal(assetTool.inputSchema.properties.asset_slot_id.minimum, 1)
  assert.equal(assetTool.inputSchema.properties.output_resource_id.minimum, 1)
  assert.equal(assetTool.inputSchema.properties.output_resource_ids.items.minimum, 1)
  assert.match(JSON.stringify(assetTool.inputSchema.allOf), /outputResourceIds/)

  const keyframeTool = readJson('tools/candidate/keyframe-attach.tool.json')
  assert.match(keyframeTool.description, /原始 target keyframe|原始 keyframe|original target keyframe/)
  assert.equal(keyframeTool.inputSchema.additionalProperties, false)
  assert.ok(keyframeTool.inputSchema.properties.target_keyframe_id)
  assert.equal(keyframeTool.inputSchema.properties.target_keyframe_id.minimum, 1)
  assert.equal(keyframeTool.inputSchema.properties.output_resource_id.minimum, 1)
  assert.equal(keyframeTool.inputSchema.properties.output_resource_ids.items.minimum, 1)
  assert.match(JSON.stringify(keyframeTool.inputSchema.allOf), /outputResourceId/)
  assert.match(JSON.stringify(keyframeTool.inputSchema.allOf), /outputResourceIds/)

  const productionContext = readJson('tools/movscript/workspace/production-context-query.tool.json')
  assert.equal(productionContext.inputSchema.properties.include.items.enum.includes('keyframes'), true)
  assert.match(productionContext.capability, /keyframes 结果不包含 AI 候选画面锚点/)

  if (!existsSync(deployedCatalog)) return

  const sourceFiles = catalogFiles(sourceCatalog)
  const deployedFiles = catalogFiles(deployedCatalog)
  assert.deepEqual(deployedFiles, sourceFiles)

  for (const path of sourceFiles) {
    assert.equal(
      readFileSync(join(deployedCatalog, path), 'utf8'),
      readFileSync(join(sourceCatalog, path), 'utf8'),
      `${path} should match apps/agent/catalog`,
    )
  }
})

function catalogFiles(root: string) {
  const files: string[] = []
  walk(root, root, files)
  return files.sort()
}

function walk(root: string, dir: string, files: string[]) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      walk(root, path, files)
    } else if (stat.isFile()) {
      files.push(relative(root, path))
    }
  }
}

function readFile(path: string) {
  const sourcePath = join(sourceCatalog, path)
  assert.equal(existsSync(sourcePath), true, `${path} should exist`)
  return readFileSync(sourcePath, 'utf8')
}

function readJson(path: string) {
  return JSON.parse(readFile(path))
}
