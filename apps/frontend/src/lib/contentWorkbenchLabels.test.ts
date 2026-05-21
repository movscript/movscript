import assert from 'node:assert/strict'
import test from 'node:test'
import { contentUnitKindOptions, trackKindLabel } from './contentWorkbenchLabels.ts'

test('content workbench labels sort content unit kinds in timeline order', () => {
  const options = contentUnitKindOptions({
    kind: 'contentUnits',
    fields: [
      {
        key: 'kind',
        label: '类型',
        options: [
          { value: 'subtitle', label: '字幕' },
          { value: 'shot', label: '镜头' },
          { value: 'sound', label: '音效' },
        ],
      },
    ],
  } as any)

  assert.deepEqual(options.map((option) => option.value), ['shot', 'sound', 'subtitle'])
  assert.equal(trackKindLabel('dialogue_audio'), '对白音频')
  assert.equal(trackKindLabel('custom'), 'custom')
})
