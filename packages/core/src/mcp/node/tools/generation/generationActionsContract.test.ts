import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function legacyToken(...parts: string[]): string {
  return parts.join('_')
}

test('visual generation tools route through backend resolver intent', () => {
  const actions = readFileSync(resolve(process.cwd(), 'packages/core/src/mcp/node/tools/generation/actions.ts'), 'utf8')
  const definitions = readFileSync(resolve(process.cwd(), 'packages/core/src/mcp/tools/generation/definitions.ts'), 'utf8')

  assert.doesNotMatch(actions, /operation is required; choose an explicit operation instead of relying on input resources/)
  assert.doesNotMatch(actions, /operation is required for generation_prepare; choose an explicit operation instead of relying on input resources/)
  assert.match(actions, /capability === 'audio_generation' && !operation/)
  assert.match(actions, /compiledContentUnitGenerationPromptReferenceAssets\(compiledContentUnit\.prompt\)/)
  assert.match(actions, /target_output: outputKind/)
  assert.match(actions, /resolve_intent: !explicitOperation && \(isImageGenerationCapability\(capability\) \|\| isVideoGenerationCapability\(capability\) \|\| isAudioGenerationCapability\(capability\)\)/)
  assert.match(actions, /inferredVisualGenerationOperation\(outputKind, payload\.reference_assets\)/)
  assert.match(actions, /resolveModelSelection\(args, built\.generationIntent\?\.capability \?\? 'video_generation', 'video_generation', built\.generationIntent\?\.operation\)/)
  assert.match(actions, /listModels\(\{\s*capability,\s*\.\.\.\(explicitOperation \? \{ operation \} : \{\}\),\s*target_output: outputKind,/)
  assert.match(actions, /reference_assets media_type is required for every input resource/)
  assert.doesNotMatch(actions, /function defaultGenerationOperation/)
  assert.doesNotMatch(actions, /defaultGenerationOperation\(outputKind, refIds\.length\)/)

  assert.match(definitions, /backend routing infers the compatible operation/)
  assert.match(definitions, /Optional for image_generation\/video_generation/)
})

test('audio generation tools use canonical operation intent for model routing', () => {
  const actions = readFileSync(resolve(process.cwd(), 'packages/core/src/mcp/node/tools/generation/actions.ts'), 'utf8')
  const definitions = readFileSync(resolve(process.cwd(), 'packages/core/src/mcp/tools/generation/definitions.ts'), 'utf8')

  assert.match(actions, /'audio_generation'/)
  assert.match(actions, /audio_generation operation is required/)
  assert.match(actions, /case 'music_generation':\s*return generationV2Result\(await generateMusic\(args\)/)
  assert.match(actions, /case 'sound_effect_generation':\s*return generationV2Result\(await generateSfx\(args\)/)
  assert.match(actions, /case 'speech_to_speech':\s*return generationV2Result\(await generateSpeechToSpeech\(args\)/)
  assert.match(actions, /audioGenerationIntentArg\(args, normalizedOperation, refIds\)/)
  assert.match(actions, /audioGenerationReferenceAssetsPayload\(rawReferenceAssets, refIds, operation\)/)
  assert.match(actions, /resolveModelSelectionWithFallback\(args, 'audio_generation', 'audio_generation', normalizedOperation, normalizedOperation\)/)
  assert.equal(actions.includes(`case '${legacyToken('audio', 'music')}':`), false)
  assert.equal(actions.includes(`case '${legacyToken('audio', 'transcribe')}':`), false)
  assert.equal(actions.includes(`case '${legacyToken('audio', 'chat')}':`), false)
  assert.equal(definitions.includes(legacyToken('audio', 'music')), false)
  assert.equal(definitions.includes(legacyToken('subtitle', 'translate')), false)
})
