import assert from 'node:assert/strict'
import test from 'node:test'

import {
  inferScriptBlockKind,
  scriptBlockContentFromLines,
  scriptBlockLineLabel,
  scriptBlockSelectLabel,
  scriptLineEntries,
  scriptSourceTextForVersion,
} from './productionScriptBlocks'

test('production script block helpers normalize version text and line ranges', () => {
  const sourceText = scriptSourceTextForVersion({
    ID: 12,
    project_id: 7,
    script_id: 3,
    version_number: 1,
    title: '剧本版本',
    source_type: 'manual',
    summary: '',
    status: 'active',
    content: '第一行\r\n第二行\r第三行',
    raw_source: '',
    CreatedAt: '2026-01-01T00:00:00.000Z',
    UpdatedAt: '2026-01-03T00:00:00.000Z',
  })

  assert.equal(sourceText, '第一行\n第二行\n第三行')
  assert.deepEqual(scriptLineEntries(sourceText), [
    { number: 1, content: '第一行' },
    { number: 2, content: '第二行' },
    { number: 3, content: '第三行' },
  ])
  assert.equal(scriptBlockContentFromLines(sourceText, 2, 3), '第二行\n第三行')
})

test('production script block helpers label blocks and infer block kind', () => {
  assert.deepEqual(inferScriptBlockKind('张三：我们开始吧'), { kind: 'dialogue', speaker: '张三' })
  assert.deepEqual(inferScriptBlockKind('INT. OFFICE - NIGHT'), { kind: 'scene_heading', speaker: '' })
  assert.deepEqual(inferScriptBlockKind('镜头推近桌面'), { kind: 'action', speaker: '' })

  const block = {
    ID: 20,
    start_line: 4,
    end_line: 8,
    speaker: '张三',
    content: '一句很长很长很长很长很长的对白内容需要截断',
  }
  assert.equal(scriptBlockLineLabel(block), '行 4-8')
  assert.equal(scriptBlockSelectLabel(block), '行 4-8 · 张三 · 一句很长很长很长很长很长的对白内容需...')
})
