import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const mediaPipelineProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'media-pipeline',
  serviceName: 'movscript.media.pipeline',
  kind: 'service',
  name: 'MovScript Media Pipeline',
  profiles: ['local', 'cloud', 'desktop', 'plugin-full-local', 'test'],
  entry: {
    command: 'movscript-media-pipeline',
    args: ['serve'],
  },
  transport: 'http',
  health: {
    kind: 'http',
    target: '/health',
  },
  dependsOn: ['movscript.data.service'],
  provides: ['probe', 'thumbnail', 'waveform', 'transcode', 'render'],
} satisfies ProgramManifest

export default mediaPipelineProgramManifest
