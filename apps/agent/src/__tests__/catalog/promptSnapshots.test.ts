import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import type { PolicySkill, RuntimeContext, WorkflowSkill } from '../../catalog/types.js'
import { loadAgentPluginCatalog } from '../../catalog/loader.js'
import { resolveProfile } from '../../profiles/resolveProfile.js'
import { composePrompt } from '../../skills/promptComposer.js'

const SNAPSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '__snapshots__')

test('catalog prompt snapshots cover every mode profile', () => {
  const catalog = loadAgentPluginCatalog()
  const modeAliases = Array.from(catalog.layeredRegistry.modeProfiles.keys()).sort()

  assert.deepEqual(modeAliases, [
    'asset-candidate-generation',
    'asset-proposal',
    'chat',
    'content-unit-media-proposal',
    'content-unit-proposal',
    'create',
    'creative-workbench',
    'dual-orchestration',
    'plan',
    'production-orchestration',
    'project-orchestration',
    'review',
    'script-split',
    'setting-prep',
    'visual-generation',
  ])

  for (const modeAlias of modeAliases) {
    const actual = buildModePromptSnapshot(modeAlias)
    const snapshotPath = join(SNAPSHOT_DIR, `${modeAlias}--no-context.snap.md`)

    assert.equal(existsSync(snapshotPath), true, `missing prompt snapshot: ${snapshotPath}`)
    assert.equal(actual, readFileSync(snapshotPath, 'utf8'), `prompt snapshot mismatch for ${modeAlias}`)
  }
})

function buildModePromptSnapshot(modeAlias: string): string {
  const catalog = loadAgentPluginCatalog()
  const { profile, warnings } = resolveProfile(catalog.layeredRegistry, { modeAlias })
  assert.deepEqual(warnings, [])

  const persona = profile.persona ? catalog.layeredRegistry.skills.get(profile.persona) : undefined
  const policies = profile.enabledPolicies.map((id) => catalog.layeredRegistry.skills.get(id))
  const workflows = profile.enabledWorkflows.map((id) => catalog.layeredRegistry.skills.get(id))

  assert.ok(!persona || persona.kind === 'persona')
  assert.ok(policies.every((skill): skill is PolicySkill => skill?.kind === 'policy'))
  assert.ok(workflows.every((skill): skill is WorkflowSkill => skill?.kind === 'workflow'))

  const ctx: RuntimeContext = {
    profile,
    message: '',
    intents: [],
    uiContext: { mode: modeAlias },
    conversation: { turnCount: 0, lastToolCalls: [], recentErrors: [] },
    catalogVersion: catalog.layeredRegistry.version,
  }
  const prompt = composePrompt({
    registry: catalog.layeredRegistry,
    ctx,
    persona,
    policies,
    workflows,
  })

  return [
    `# ${modeAlias} / no-context`,
    '',
    `profile: ${profile.id}@${profile.version}`,
    `parts: ${prompt.parts.map((part) => part.id).join(', ')}`,
    '',
    prompt.systemPrompt,
    '',
  ].join('\n')
}
