import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'

const sourceCatalog = resolve('../agent/catalog')
const deployedCatalog = resolve('movscript-agent/catalog')

test('agent catalog keeps candidate generation contracts for deploy', () => {
  const visualInstruction = readFile('skills/movscript/workflow/generation/visual-generation/instruction.md')
  assert.match(visualInstruction, /把每个可用 output_resource_id 逐个加入目标 asset slot 候选集/)
  assert.match(visualInstruction, /把每个可用 output_resource_id 逐个加入目标 keyframe 候选集/)
  assert.match(visualInstruction, /必须逐项写入并逐项报告成功、失败或阻塞/)

  const visualWorkflow = readJson('skills/movscript/workflow/generation/visual-generation/skill.workflow.json')
  assert.equal(visualWorkflow.toolRefs.includes('tool://movscript_attach_keyframe_candidate'), true)
  assert.match(JSON.stringify(visualWorkflow.triggers), /关键帧候选/)
  assert.match(JSON.stringify(visualWorkflow.triggers), /visual anchor candidate/)

  const createJob = readJson('tools/movscript/visual-generation/create-job.tool.json')
  assert.match(createJob.description, /output_resources\/output_resource_ids/)
  assert.ok(createJob.outputSchema.properties.output_resources)
  assert.ok(createJob.outputSchema.properties.output_resource_ids)

  const assetTool = readJson('tools/movscript/visual-generation/attach-asset-slot-candidate.tool.json')
  assert.equal(assetTool.inputSchema.properties.asset_slot_id.minimum, 1)
  assert.equal(assetTool.inputSchema.properties.output_resource_id.minimum, 1)

  const keyframeTool = readJson('tools/movscript/visual-generation/attach-keyframe-candidate.tool.json')
  assert.match(keyframeTool.description, /原始 target keyframe|原始 keyframe|original target keyframe/)
  assert.equal(keyframeTool.inputSchema.additionalProperties, false)
  assert.ok(keyframeTool.inputSchema.properties.target_keyframe_id)
  assert.equal(keyframeTool.inputSchema.properties.target_keyframe_id.minimum, 1)
  assert.equal(keyframeTool.inputSchema.properties.output_resource_id.minimum, 1)
  assert.match(JSON.stringify(keyframeTool.inputSchema.allOf), /outputResourceId/)

  const productionContext = readJson('tools/movscript/workspace/query-production-context.tool.json')
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
