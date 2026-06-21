import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { createLocalMovScriptProject, inspectLocalMovScriptProject } from './localProject'

test('local project inspection treats a missing directory as a clean create target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-local-project-'))
  const projectDir = join(root, 'new-project')
  try {
    const inspection = await inspectLocalMovScriptProject({ projectDir })

    assert.equal(inspection.exists, false)
    assert.equal(inspection.isDirectory, false)
    assert.equal(inspection.canCreateClean, true)
    assert.deepEqual(inspection.impacts, [])

    const created = await createLocalMovScriptProject({ projectDir, title: 'New Project' })
    assert.equal(created.projectDir, projectDir)
    assert.equal(created.project.name, 'New Project')
    assert.ok(created.projectUid)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
