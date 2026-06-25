import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const localSurfaceHostProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'local-surface-host',
  serviceName: 'movscript.local-surface.host',
  kind: 'web',
  name: 'MovScript Local Surface Host',
  profiles: ['local', 'plugin-full-local', 'desktop-connected', 'desktop-embedded', 'test'],
  entry: {
    command: 'movscript-local-surface-host',
    args: ['serve'],
  },
  transport: 'http',
  health: {
    kind: 'http',
    target: '/health',
  },
  provides: ['surface-host-local', 'project-surface-url', 'canvas-surface-local-url', 'admin-surface-local-url'],
} satisfies ProgramManifest

export default localSurfaceHostProgramManifest
