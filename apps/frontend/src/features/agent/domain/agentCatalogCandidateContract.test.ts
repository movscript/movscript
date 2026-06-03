import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'

const sourceCatalog = resolve('../agent/catalog')
const deployedCatalog = resolve('movscript-agent/catalog')

test('agent catalog keeps candidate generation contracts for deploy', () => {
  const imageInstruction = readFile('skills/core/generation/image_generation/instruction.md')
  assert.match(imageInstruction, /generation_image_generate/)
  assert.match(imageInstruction, /generation_image_job_get/)
  assert.match(imageInstruction, /core_work_start/)
  assert.match(imageInstruction, /不要绕过 `core_work_start`/)

  const videoInstruction = readFile('skills/core/generation/video_generation/instruction.md')
  assert.match(videoInstruction, /generation_video_generate/)
  assert.match(videoInstruction, /generation_video_job_get/)
  assert.match(videoInstruction, /core_work_start/)
  assert.match(videoInstruction, /不要绕过 `core_work_start`/)

  const generationPack = readJson('packs/generation.pack.json')
  assert.equal(generationPack.tools.includes('generation_image_generate'), true)
  assert.equal(generationPack.tools.includes('generation_image_job_get'), true)
  assert.equal(generationPack.tools.includes('generation_video_generate'), true)
  assert.equal(generationPack.tools.includes('generation_video_job_get'), true)

  const runtimeWorkStart = readJson('tools/core/work-start.tool.json')
  assert.match(runtimeWorkStart.description, /kind:\"generation_job\"/)
  assert.match(runtimeWorkStart.inputSchema.properties.request.description, /generation_image_generate\|generation_video_generate/)
  assert.equal(runtimeWorkStart.inputSchema.properties.kind.enum.includes('generation_job'), true)
  assert.equal(runtimeWorkStart.inputSchema.properties.kind.enum.includes('subagent_run'), true)
  assert.ok(runtimeWorkStart.inputSchema.properties.request)

  assert.equal(existsSync(join(sourceCatalog, 'tools/candidate/asset-slot-attach.tool.json')), false)
  assert.equal(existsSync(join(sourceCatalog, 'tools/candidate/keyframe-attach.tool.json')), false)
  assert.equal(existsSync(join(sourceCatalog, 'tools/movscript/workspace/production-context-query.tool.json')), false)

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
