import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  listProviderSessionsFromWorkspace,
  MOVSCRIPT_PROVIDER_SESSION_SCHEMA,
  upsertProviderSessionInWorkspace,
} from './providerSessionWorkspace'

const legacyProviderHomeKey = ['codex', 'Home'].join('')

test('provider session index is stored under the provider profile sessions directory', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-provider-sessions-'))
  try {
    upsertProviderSessionInWorkspace({
      workspaceDir,
      providerProfileKey: 'codex',
      providerProfileId: 'codex-movscript-home',
      providerKey: 'codex',
      label: 'Codex',
      endpoint: 'ws://127.0.0.1:41234',
      executablePath: 'codex',
      home: join(workspaceDir, '.movscript', '.codex'),
      status: 'running',
      now: new Date('2026-06-05T01:02:03.000Z'),
    })

    const recordPath = join(workspaceDir, '.movscript', 'providers', 'codex', 'sessions', 'codex-movscript-home.json')
    assert.equal(existsSync(recordPath), true)
    const raw = JSON.parse(readFileSync(recordPath, 'utf8'))
    assert.equal(raw.schema, MOVSCRIPT_PROVIDER_SESSION_SCHEMA)
    assert.equal(raw.providerProfileKey, 'codex')
    assert.equal(raw.providerProfileId, 'codex-movscript-home')
    assert.equal(raw.home, join(workspaceDir, '.movscript', '.codex'))
    assert.equal(legacyProviderHomeKey in raw, false)
    assert.equal(raw.state.status, 'running')

    const listed = listProviderSessionsFromWorkspace({ workspaceDir, providerProfileKey: 'codex' })
    assert.equal(listed.sessions.length, 1)
    assert.equal(listed.sessions[0]?.session.id, 'codex-movscript-home')
    assert.equal(listed.sessions[0]?.workspaceDir, workspaceDir)
    assert.equal(listed.sessions[0]?.state?.status, 'running')
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true })
  }
})

test('provider session listing filters by provider profile key', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-provider-sessions-filter-'))
  try {
    upsertProviderSessionInWorkspace({
      workspaceDir,
      providerProfileKey: 'codex',
      providerProfileId: 'codex-provider',
      providerKey: 'codex',
      status: 'running',
      now: new Date('2026-06-05T01:02:03.000Z'),
    })
    upsertProviderSessionInWorkspace({
      workspaceDir,
      providerProfileKey: 'mova',
      providerProfileId: 'mova-home',
      providerKey: 'mova',
      status: 'running',
      now: new Date('2026-06-05T01:02:04.000Z'),
    })

    assert.deepEqual(
      listProviderSessionsFromWorkspace({ workspaceDir, providerProfileKey: 'mova' }).sessions.map((item) => item.session.id),
      ['mova-home'],
    )
    assert.deepEqual(
      listProviderSessionsFromWorkspace({ workspaceDir }).sessions.map((item) => item.session.id),
      ['mova-home', 'codex-provider'],
    )
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true })
  }
})
