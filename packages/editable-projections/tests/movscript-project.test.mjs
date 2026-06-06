import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  MemoryBackendStore,
  movscriptAssetSlotUpdateTarget,
  movscriptCreativeReferenceUpdateTarget,
  movscriptProjectRelativeAssetSlotPath,
  movscriptProjectRelativeCreativeReferencePath,
} from '../dist/index.js'
import {
  createMovScriptProjectEditableProjectionKit,
  createMovScriptProjectNodeProjectionKit,
} from '../dist/examples/movscriptProject.js'

test('createMovScriptProjectEditableProjectionKit wires MovScript project adapters for memory workflows', async () => {
  const backendStore = new MemoryBackendStore()
  const kit = createMovScriptProjectEditableProjectionKit({ backendStore })
  const memory = kit.createMemoryWorkflow()

  await memory.workflow.update([
    movscriptCreativeReferenceUpdateTarget({
      ID: 8,
      projectId: 1,
      kind: 'person',
      name: 'Lina',
    }),
  ])

  assert.equal(kit.registry.getByEntityType('creative_reference')?.schema, 'movscript.creative_reference.v1')
  assert.equal(kit.registry.getByEntityType('asset_slot')?.schema, 'movscript.asset_slot.v1')
  assert.equal((await memory.workflow.status('data/projects/1')).status.files[0].state, 'clean')
})

test('createMovScriptProjectNodeProjectionKit applies edited project files through a service executor', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movscript-project-node-projection-'))
  try {
    const referencePath = movscriptProjectRelativeCreativeReferencePath(8)
    const slotPath = movscriptProjectRelativeAssetSlotPath(12)
    const reference = {
      ID: 8,
      projectId: 1,
      kind: 'person',
      name: 'Lina',
      description: 'Lead character',
    }
    const slot = {
      ID: 12,
      projectId: 1,
      owner: {
        type: 'creative_reference',
        id: 8,
        label: 'Lina',
        path: '../references/creative_reference_8.json',
      },
      kind: 'image',
      name: 'Hero portrait',
      status: 'missing',
    }
    const backendStore = new MemoryBackendStore([
      {
        entityType: 'creative_reference',
        entityId: 8,
        hash: 'reference-v1',
        value: reference,
      },
      {
        entityType: 'asset_slot',
        entityId: 12,
        hash: 'slot-v1',
        value: slot,
      },
    ])
    const executedCommands = []
    const kit = createMovScriptProjectNodeProjectionKit(root, {
      backendStore,
      executor: {
        async execute(commands) {
          executedCommands.push(...commands)
          return {
            updateTargets: commands.map((command) => {
              if (command.type === 'movscript.creative_reference.update') {
                const canonical = {
                  ...command.input,
                  id: command.entityId,
                  status: 'active',
                }
                backendStore.setEntity({
                  entityType: 'creative_reference',
                  entityId: command.entityId,
                  hash: 'reference-v2',
                  value: canonical,
                })
                return movscriptCreativeReferenceUpdateTarget(canonical, {
                  path: command.filePath,
                  backendHash: 'reference-v2',
                })
              }
              if (command.type === 'movscript.asset_slot.update') {
                const canonical = {
                  ...command.input,
                  id: command.entityId,
                  status: 'candidate',
                }
                backendStore.setEntity({
                  entityType: 'asset_slot',
                  entityId: command.entityId,
                  hash: 'slot-v2',
                  value: canonical,
                })
                return movscriptAssetSlotUpdateTarget(canonical, {
                  path: command.filePath,
                  backendHash: 'slot-v2',
                })
              }
              throw new Error(`unexpected command: ${command.type}`)
            }),
          }
        },
      },
    })

    await kit.workflow.update([
      movscriptCreativeReferenceUpdateTarget(reference, { path: referencePath, backendHash: 'reference-v1' }),
      movscriptAssetSlotUpdateTarget(slot, { path: slotPath, backendHash: 'slot-v1' }),
    ])

    const referenceFilePath = path.join(root, referencePath)
    const slotFilePath = path.join(root, slotPath)
    const editedReference = JSON.parse(await readFile(referenceFilePath, 'utf8'))
    editedReference.description = 'Lead character with a sharper visual identity.'
    await writeFile(referenceFilePath, json(editedReference))
    const editedSlot = JSON.parse(await readFile(slotFilePath, 'utf8'))
    editedSlot.prompt_hint = 'Use the creative reference identity; clean front-facing portrait.'
    await writeFile(slotFilePath, json(editedSlot))

    const result = await kit.workflow.reviewAndApply('.')

    assert.equal(result.gate.ready, true)
    assert.deepEqual(executedCommands.map((command) => command.type).sort(), [
      'movscript.asset_slot.update',
      'movscript.creative_reference.update',
    ])
    assert.equal(JSON.parse(await readFile(referenceFilePath, 'utf8')).status, 'active')
    assert.equal(JSON.parse(await readFile(slotFilePath, 'utf8')).status, 'candidate')
    assert.deepEqual((await kit.workflow.status('.')).status.files.map((file) => file.state), ['clean', 'clean'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
