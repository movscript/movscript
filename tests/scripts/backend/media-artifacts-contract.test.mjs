import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const repoRoot = process.cwd()
const mediaDir = path.join(repoRoot, 'contracts', 'media')
const expectedCapabilities = ['audio_tts', 'audio_transcribe', 'subtitle_align', 'render_video']

test('media artifacts fixture preserves voiceover, subtitle, timing, and render relationships', async () => {
  const schema = JSON.parse(await readFile(path.join(mediaDir, 'media-artifacts-v1.schema.json'), 'utf8'))
  const fixture = JSON.parse(await readFile(path.join(mediaDir, 'media-artifacts-v1.fixture.json'), 'utf8'))

  assert.equal(schema.$id, 'https://movscript.dev/schemas/media-artifacts-v1.schema.json')
  assert.equal(fixture.schema, 'movscript.media.artifacts.v1')
  assert.equal(fixture.schemaUrl, schema.$id)
  assert.equal(fixture.schemaVersion, 1)

  assert.equal(fixture.voiceover.resourceId, fixture.renderRecipe.voiceoverResourceId)
  assert.equal(fixture.voiceover.durationMs, fixture.timing.durationMs)
  assert.equal(fixture.voiceover.timingSource, fixture.timing.source)

  const subtitleResourceIds = new Set(fixture.subtitles.map((item) => item.resourceId))
  assert.ok(subtitleResourceIds.has(fixture.renderRecipe.subtitleResourceId))
  for (const subtitle of fixture.subtitles) {
    assert.equal(subtitle.relatedAudioResourceId, fixture.voiceover.resourceId)
    assert.equal(subtitle.source, fixture.timing.source)
  }

  assert.ok(fixture.timing.segments.length > 0)
  for (const segment of fixture.timing.segments) {
    assert.ok(segment.startMs < segment.endMs, `${segment.id} should have a positive duration`)
    assert.ok(segment.endMs <= fixture.timing.durationMs, `${segment.id} should fit within timing.durationMs`)
  }

  for (const clip of fixture.renderRecipe.clips) {
    assert.ok(clip.startMs < clip.endMs, `clip ${clip.resourceId} should have a positive duration`)
    assert.ok(clip.endMs <= fixture.timing.durationMs, `clip ${clip.resourceId} should fit within timing.durationMs`)
  }
})

test('media pipeline capability names are shared across contracts and runtime declarations', async () => {
  const files = {
    pluginSdk: await readFile(path.join(repoRoot, 'packages', 'plugin-sdk', 'src', 'types.ts'), 'utf8'),
    backendAI: await readFile(path.join(repoRoot, 'apps', 'backend', 'internal', 'infra', 'ai', 'feature.go'), 'utf8'),
    backendJob: await readFile(path.join(repoRoot, 'apps', 'backend', 'internal', 'domain', 'job', 'helpers.go'), 'utf8'),
    workspaceRegistry: await readFile(path.join(repoRoot, 'packages', 'workspaces', 'src', 'registry.ts'), 'utf8'),
    frontendAgentProtocol: await readFile(path.join(repoRoot, 'apps', 'frontend', 'src', 'features', 'agent', 'domain', 'agentProtocol.ts'), 'utf8'),
    frontendTypes: await readFile(path.join(repoRoot, 'apps', 'frontend', 'src', 'types', 'index.ts'), 'utf8'),
    adminTypes: await readFile(path.join(repoRoot, 'apps', 'admin', 'src', 'types', 'index.ts'), 'utf8'),
    modelAliases: await readFile(path.join(repoRoot, 'apps', 'frontend', 'electron', 'mcp', 'modelContracts', 'capability.ts'), 'utf8'),
  }

  for (const capability of expectedCapabilities) {
    for (const [name, contents] of Object.entries(files)) {
      assert.ok(contents.includes(capability), `${name} should include ${capability}`)
    }
  }

  assert.match(files.modelAliases, /text_to_speech[\s\S]*audio_tts/)
  assert.match(files.modelAliases, /speech_to_text[\s\S]*audio_transcribe/)
  assert.match(files.modelAliases, /forced_alignment[\s\S]*subtitle_align/)
  assert.match(files.modelAliases, /ffmpeg_render[\s\S]*render_video/)
})

test('frontend agent protocol exports the media artifacts v1 contract shape', async () => {
  const protocol = await readFile(path.join(repoRoot, 'apps', 'frontend', 'src', 'features', 'agent', 'domain', 'agentProtocol.ts'), 'utf8')

  assert.match(protocol, /MEDIA_ARTIFACTS_V1_SCHEMA = 'movscript\.media\.artifacts\.v1'/)
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

test('media provider contract fixture describes abstract provider capabilities without vendor adapters', async () => {
  const schema = JSON.parse(await readFile(path.join(mediaDir, 'media-provider-contract-v1.schema.json'), 'utf8'))
  const fixture = JSON.parse(await readFile(path.join(mediaDir, 'media-provider-contract-v1.fixture.json'), 'utf8'))

  assert.equal(schema.$id, 'https://movscript.dev/schemas/media-provider-contract-v1.schema.json')
  assert.equal(fixture.schema, 'movscript.media.provider_contract.v1')
  assert.equal(fixture.schemaUrl, schema.$id)
  assert.equal(fixture.schemaVersion, 1)
  assert.ok(fixture.provider)

  const capabilities = new Set(fixture.capabilities.map((item) => item.capability))
  assert.ok(capabilities.has('audio_tts'))
  assert.ok(capabilities.has('subtitle_align'))

  const tts = fixture.capabilities.find((item) => item.capability === 'audio_tts')
  assert.ok(tts.models[0].features.includes('word_timestamps'))
  assert.ok(tts.models[0].supportedParams.some((param) => param.key === 'voice'))
  assert.ok(tts.models[0].supportedParams.some((param) => param.key === 'return_timing'))
})

test('backend media domain exposes abstract provider interfaces only', async () => {
  const providerContract = await readFile(path.join(repoRoot, 'apps', 'backend', 'internal', 'domain', 'media', 'provider_contract.go'), 'utf8')

  for (const declaration of [
    'type TTSProvider interface',
    'type SubtitleProvider interface',
    'type Renderer interface',
    'type TTSRequest struct',
    'type AlignRequest struct',
    'type RenderRecipe struct',
  ]) {
    assert.ok(providerContract.includes(declaration), `backend media contract should include ${declaration}`)
  }

  for (const vendorName of ['ElevenLabs', 'Azure', 'OpenAI', 'Google', 'Polly']) {
    assert.equal(providerContract.includes(vendorName), false, `backend media contract should not bind to ${vendorName}`)
  }
})
