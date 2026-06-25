import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const webSurfaceHostProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'web-surface-host',
  serviceName: 'movscript.web-surface.host',
  kind: 'web',
  name: 'MovScript Web Surface Host',
  profiles: ['cloud', 'web', 'test'],
  entry: {
    command: 'movscript-web-surface-host',
    args: ['serve'],
  },
  transport: 'http',
  health: {
    kind: 'http',
    target: '/health',
  },
  dependsOn: ['movscript.project.service', 'movscript.canvas.service', 'movscript.editing.service'],
  provides: ['surface-host-web', 'project-surface-url', 'canvas-surface-web-url', 'admin-surface-web-url', 'remote-collaboration-surface'],
} satisfies ProgramManifest

export default webSurfaceHostProgramManifest
