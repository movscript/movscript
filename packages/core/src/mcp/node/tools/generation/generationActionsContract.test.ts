import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('visual generation tools require explicit operation intent', () => {
  const actions = readFileSync(resolve(process.cwd(), 'packages/core/src/mcp/node/tools/generation/actions.ts'), 'utf8')
  const definitions = readFileSync(resolve(process.cwd(), 'packages/core/src/mcp/tools/generation/definitions.ts'), 'utf8')

  assert.match(actions, /operation is required; choose an explicit operation instead of relying on input resources/)
  assert.match(actions, /operation is required for generation_prepare; choose an explicit operation instead of relying on input resources/)
  assert.match(actions, /isAudioGenerationCapability\(capability\)\) && !operation/)
  assert.match(actions, /const operation = topLevelOperation/)
  assert.match(actions, /resolveModelSelection\(args, built\.generationIntent\?\.capability \?\? built\.jobType, 'video', built\.generationIntent\?\.operation\)/)
  assert.match(actions, /listModels\(\{\s*capability,\s*operation,/)
  assert.doesNotMatch(actions, /function defaultGenerationOperation/)
  assert.doesNotMatch(actions, /defaultGenerationOperation\(outputKind, refIds\.length\)/)

  assert.match(definitions, /the tool never infers the operation from resource count/)
  assert.match(definitions, /Required for image_generation, video_generation, and audio_generation/)
})

test('audio generation tools use canonical operation intent for model routing', () => {
  const actions = readFileSync(resolve(process.cwd(), 'packages/core/src/mcp/node/tools/generation/actions.ts'), 'utf8')

  assert.match(actions, /'audio_generation'/)
  assert.match(actions, /audio_generation operation is required/)
  assert.match(actions, /case 'music':\s*return generationV2Result\(await generateMusic\(args\)/)
  assert.match(actions, /audioGenerationIntentArg\(args, jobType, refIds\)/)
  assert.match(actions, /resolveModelSelection\(args, built\.generationIntent\?\.capability \?\? built\.jobType, fallbackCapability, built\.generationIntent\?\.operation\)/)
  assert.match(actions, /case 'audio_music':\s*return 'music'/)
  assert.match(actions, /case 'audio_sfx':\s*return 'sfx'/)
  assert.doesNotMatch(actions, /return 'music_generation'/)
  assert.doesNotMatch(actions, /return 'sound_effect_generation'/)
})
