import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildToolPermissionsFilterPresetUpdate,
  type ToolPermissionsFilterPreset,
} from '@/features/agent/presentation/agentSettingsToolPermissionsModel'

const t = (key: string) => key.split('.').at(-1) ?? key

test('tool permissions filter preset update creates a named preset', () => {
  const update = buildToolPermissionsFilterPresetUpdate({
    presets: [],
    filter: 'write_risk',
    search: 'generate',
    t,
  })

  assert.equal(update.action, 'tool_filter_preset_saved')
  assert.deepEqual(update.preset, {
    id: 'write-risk-generate',
    name: 'write_risk: generate',
    search: 'generate',
    filter: 'write_risk',
  })
  assert.deepEqual(update.presets, [update.preset])
})

test('tool permissions filter preset update reuses matching preset ids', () => {
  const existing: ToolPermissionsFilterPreset = {
    id: 'approval-existing',
    name: 'Old label',
    filter: 'requires_approval',
    search: 'deploy',
  }
  const update = buildToolPermissionsFilterPresetUpdate({
    presets: [existing, preset('keep', 'all', '')],
    filter: 'requires_approval',
    search: ' deploy ',
    t,
  })

  assert.equal(update.action, 'tool_filter_preset_updated')
  assert.equal(update.preset.id, 'approval-existing')
  assert.equal(update.preset.name, 'requires_approval: deploy')
  assert.deepEqual(update.presets.map((item) => item.id), ['approval-existing', 'keep'])
})

test('tool permissions filter preset update keeps newest preset first and trims the list', () => {
  const presets = Array.from({ length: 4 }, (_, index) => preset(`preset-${index}`, 'all', String(index)))
  const update = buildToolPermissionsFilterPresetUpdate({
    presets,
    filter: 'available',
    search: '',
    t,
    maxPresets: 3,
  })

  assert.equal(update.action, 'tool_filter_preset_saved')
  assert.deepEqual(update.presets.map((item) => item.id), ['available', 'preset-0', 'preset-1'])
})

function preset(id: string, filter: ToolPermissionsFilterPreset['filter'], search: string): ToolPermissionsFilterPreset {
  return {
    id,
    name: id,
    filter,
    search,
  }
}
