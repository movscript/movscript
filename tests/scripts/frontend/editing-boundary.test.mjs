import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const editingCommandsSource = readSource('apps/frontend/src/features/editing/application/editingCommands.ts')
const editingCommandServiceSource = readSource('apps/frontend/src/features/editing/application/editingCommandService.ts')
const editingTrackCommandsSource = readSource('apps/frontend/src/features/editing/application/editingTrackCommands.ts')
const timelineControllerSource = readSource('apps/frontend/src/features/editing/application/useEditingTimelineController.ts')

test('editing timeline track commands are split from clip and asset commands', () => {
  for (const exportName of [
    'addTimelineTrackCommand',
    'deleteTimelineTrackCommand',
    'moveTimelineTrackCommand',
    'toggleTimelineTrackLockedCommand',
    'toggleTimelineTrackMutedCommand',
  ]) {
    assert.match(editingCommandsSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must remain exported through the compatibility command module`)
    assert.doesNotMatch(editingCommandsSource, new RegExp(`export function ${exportName}\\b`), `${exportName} implementation must not live in editingCommands.ts`)
    assert.match(editingTrackCommandsSource, new RegExp(`export function ${exportName}\\b`), `${exportName} implementation must live in editingTrackCommands.ts`)
  }

  assert.match(editingCommandsSource, /from '\.\/editingTrackCommands'/)
  assert.match(editingTrackCommandsSource, /from '\.\/editingCommandService'/)
  assert.match(timelineControllerSource, /from '@\/features\/editing\/application\/editingCommands'/)
})

test('editing command service owns package service adaptation', () => {
  assert.match(editingCommandServiceSource, /createMediaEditingProjectService/)
  assert.match(editingCommandServiceSource, /export function applyTimelineCommands/)
  assert.doesNotMatch(editingCommandsSource, /createMediaEditingProjectService/)
  assert.doesNotMatch(editingTrackCommandsSource, /createMediaEditingProjectService/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
