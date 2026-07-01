import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function legacyToken(...parts: string[]): string {
  return parts.join('_')
}

test('model list exposes backend resolver intent without route details', () => {
  const actions = readFileSync(resolve(process.cwd(), 'packages/core/src/mcp/node/tools/model/actions.ts'), 'utf8')
  const definitions = readFileSync(resolve(process.cwd(), 'packages/core/src/mcp/tools/model/definitions.ts'), 'utf8')

  assert.match(actions, /const operation = getOptionalString\(args, 'operation'\) \?\? getOptionalString\(args, 'model_operation'\)/)
  assert.match(actions, /capabilityForModelOperation\(operation\)/)
  assert.match(actions, /const targetOutput = modelTargetOutputArg\(args, capability, operation\)/)
  assert.match(actions, /params\.set\('target_output', options\.targetOutput\)/)
  assert.match(actions, /params\.set\('resolve_intent', 'true'\)/)
  assert.match(actions, /params\.set\('operation', options\.operation\)/)
  assert.match(actions, /params\.set\('reference_assets', JSON\.stringify\(options\.referenceAssets\)\)/)

  assert.match(definitions, /backend resolver infer usable model operations/)
  assert.match(definitions, /target_output/)
  assert.match(definitions, /resolve_intent/)
  assert.match(definitions, /inferred_operation/)
  assert.match(definitions, /first_last_frame_to_video/)
  assert.match(definitions, /music_generation/)
  assert.match(definitions, /sound_effect_generation/)
  assert.match(actions, /const defaultCapabilities = \[\s*'text_generation',\s*'image_generation',\s*'video_generation',\s*'audio_generation',\s*\]/)
  assert.match(actions, /case 'music_generation':\s*case 'sound_effect_generation':\s*case 'voice_isolation':\s*case 'forced_alignment':\s*return 'audio_generation'/)
  assert.match(definitions, /Reference role such as generic, reference_image, target_image, reference_video, target_video, reference_audio/)
  assert.equal(actions.includes(legacyToken('video', 'v2v')), false)
  assert.doesNotMatch(definitions, /legacy capability alias/)
})
