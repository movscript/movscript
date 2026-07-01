import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { startProjectService } from '../../../../services/project-service/src/server.mjs'
import { bindLocalMovScriptProject, createLocalMovScriptProject, inspectLocalMovScriptProject, openLocalMovScriptProject } from './localProject'

test('local project inspection treats a missing directory as a clean create target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-local-project-'))
  const projectDir = join(root, 'new-project')
  const previousProjectServiceURL = process.env.MOVSCRIPT_PROJECT_SERVICE_URL
  const runtime = await startProjectService()
  process.env.MOVSCRIPT_PROJECT_SERVICE_URL = runtime.url
  try {
    const inspection = await inspectLocalMovScriptProject({ projectDir })

    assert.equal(inspection.exists, false)
    assert.equal(inspection.isDirectory, false)
    assert.equal(inspection.canCreateClean, true)
    assert.deepEqual(inspection.impacts, [])

    const created = await createLocalMovScriptProject({ projectDir, title: 'New Project', localProjectId: 'new_project' })
    assert.equal(created.projectDir, projectDir)
    assert.equal(created.localProjectId, 'new_project')
    assert.equal(created.local_project_id, 'new_project')
    assert.equal(created.projectId, 'new_project')
    assert.equal(created.project.name, 'New Project')
    assert.equal(created.project.ID, 0)
    assert.ok(created.projectUid)

    const opened = await openLocalMovScriptProject({ projectDir })
    assert.equal(opened.project.ID, 0)
    assert.equal(opened.localProjectId, 'new_project')

    const bound = await bindLocalMovScriptProject({
      projectDir,
      projectUid: created.projectUid,
      backendProjectId: 42,
      scopeKind: 'user',
      scopeId: '1',
    })
    assert.equal(bound.project.ID, 42)
  } finally {
    await runtime.close()
    if (previousProjectServiceURL === undefined) {
      delete process.env.MOVSCRIPT_PROJECT_SERVICE_URL
    } else {
      process.env.MOVSCRIPT_PROJECT_SERVICE_URL = previousProjectServiceURL
    }
    await rm(root, { recursive: true, force: true })
  }
})
