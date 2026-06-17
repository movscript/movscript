import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const repoRoot = process.cwd()
const expectedCapabilities = ['audio_tts', 'audio_transcribe', 'audio_music', 'audio_sfx', 'subtitle_align', 'subtitle_translate']

test('media pipeline capability names are shared across contracts and runtime declarations', async () => {
  const files = {
    backendAI: await readFile(path.join(repoRoot, 'apps', 'backend', 'internal', 'infra', 'ai', 'feature.go'), 'utf8'),
    backendJob: await readFile(path.join(repoRoot, 'apps', 'backend', 'internal', 'domain', 'job', 'helpers.go'), 'utf8'),
    coreAgentProtocol: await readFile(path.join(repoRoot, 'packages', 'core', 'src', 'agent', 'protocol.ts'), 'utf8'),
    frontendTypes: await readFile(path.join(repoRoot, 'apps', 'frontend', 'src', 'types', 'canvas.ts'), 'utf8'),
    adminTypes: await readFile(path.join(repoRoot, 'apps', 'admin', 'src', 'types', 'index.ts'), 'utf8'),
    modelAliases: await readFile(path.join(repoRoot, 'packages', 'core', 'src', 'mcp', 'tools', 'model', 'contracts', 'capability.ts'), 'utf8'),
  }

  for (const capability of expectedCapabilities) {
    for (const [name, contents] of Object.entries(files)) {
      assert.ok(contents.includes(capability), `${name} should include ${capability}`)
    }
  }

  assert.match(files.modelAliases, /text_to_speech[\s\S]*audio_tts/)
  assert.match(files.modelAliases, /speech_to_text[\s\S]*audio_transcribe/)
  assert.match(files.modelAliases, /music_generation[\s\S]*audio_music/)
  assert.match(files.modelAliases, /sound_effect_generation[\s\S]*audio_sfx/)
  assert.match(files.modelAliases, /forced_alignment[\s\S]*subtitle_align/)
  assert.match(files.modelAliases, /subtitle_translation[\s\S]*subtitle_translate/)
})

test('core agent protocol exports the media artifacts v1 contract shape', async () => {
  const protocol = await readFile(path.join(repoRoot, 'packages', 'core', 'src', 'agent', 'protocol.ts'), 'utf8')

  assert.match(protocol, /MEDIA_ARTIFACTS_V1_SCHEMA = 'movscript\.media\.artifacts\.v1'/)
  assert.equal(protocol.includes('schemaUrl'), false)
  for (const exportedType of [
    'MediaTimingSource',
    'TimedTextUnit',
    'TimingMetadata',
    'VoiceoverResourceRef',
    'SubtitleResourceRef',
    'RenderRecipe',
    'MediaArtifactsV1',
  ]) {
    assert.ok(protocol.includes(`export interface ${exportedType}`) || protocol.includes(`export type ${exportedType}`), `protocol should export ${exportedType}`)
  }
})

test('backend media domain exposes abstract provider interfaces only', async () => {
  const providerContract = await readFile(path.join(repoRoot, 'apps', 'backend', 'internal', 'domain', 'media', 'provider_contract.go'), 'utf8')

  for (const declaration of [
    'type TTSProvider interface',
    'type SubtitleProvider interface',
    'type AudioGenerationProvider interface',
    'type SubtitleTranslateProvider interface',
    'type TTSRequest struct',
    'type AlignRequest struct',
    'type TranslateSubtitleRequest struct',
  ]) {
    assert.ok(providerContract.includes(declaration), `backend media contract should include ${declaration}`)
  }

  for (const vendorName of ['ElevenLabs', 'Azure', 'OpenAI', 'Google', 'Polly']) {
    assert.equal(providerContract.includes(vendorName), false, `backend media contract should not bind to ${vendorName}`)
  }
})
