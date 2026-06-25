import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const canvasServiceProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'canvas-service',
  serviceName: 'movscript.canvas.service',
  kind: 'service',
  name: 'MovScript Canvas Service',
  profiles: ['local', 'cloud', 'test'],
  entry: {
    command: 'movscript-canvas-service',
    args: ['serve'],
  },
  transport: 'http',
  health: {
    kind: 'http',
    target: '/health',
  },
  dependsOn: ['movscript.data.service'],
  provides: ['canvas-api', 'canvas-storage', 'canvas-runtime'],
} satisfies ProgramManifest

export default canvasServiceProgramManifest
