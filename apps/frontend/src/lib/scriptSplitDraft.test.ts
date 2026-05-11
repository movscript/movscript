import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseScriptSplitDraftContent,
  type ScriptSplitProductionSummary,
} from './scriptSplitDraft'
import type { Script } from '@/types'

function makeScript(input: Partial<Script>): Script {
  return {
    ID: 1,
    project_id: 1,
    title: '第一集 火种',
    description: '',
    content: '',
    script_type: 'episode',
    author_id: 1,
    order: 1,
    summary: '',
    characters: '',
    core_settings: '',
    background: '',
    scenes_desc: '',
    hook: '',
    plot_summary: '',
    CreatedAt: '',
    UpdatedAt: '',
    ...input,
  }
}

test('parseScriptSplitDraftContent resolves matched production into update metadata', () => {
  const content = JSON.stringify({
    schema: 'movscript.script_split_analysis.v1',
    global_settings: {
      story_world: '近未来都市',
      core_rules: ['线索必须可回收'],
      character_relationships: [],
      key_characters: ['主角'],
      key_locations: ['天台'],
      key_props: ['录音笔'],
      continuity_notes: [],
    },
    episode_drafts: [{
      order: 1,
      title: '第一集 火种',
      summary: '主角发现关键线索。',
      start_line: 1,
      end_line: 2,
      action: 'create',
      existing_script_id: null,
      production_title: '火种制作',
      production_summary: '围绕第一集线索发现的制作。',
    }],
  })

  const drafts = parseScriptSplitDraftContent(
    content,
    [],
    '第一集 火种\n主角发现线索。',
    [{ ID: 42, name: '火种制作', description: '围绕第一集的制作计划' }],
  )

  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].productionAction, 'update')
  assert.equal(drafts[0].existingProductionId, 42)
  assert.equal(drafts[0].productionTitle, '火种制作')
})
