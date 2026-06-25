import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const projectServiceProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'project-service',
  serviceName: 'movscript.project.service',
  kind: 'service',
  name: 'MovScript Project Service',
  profiles: ['local', 'cloud', 'test'],
  entry: {
    command: 'movscript-project-service',
    args: ['serve'],
  },
  transport: 'http',
  health: {
    kind: 'http',
    target: '/health',
  },
  dependsOn: ['movscript.data.service'],
  provides: ['project-read-model', 'domain-source', 'candidate-view', 'interpret'],
} satisfies ProgramManifest

export default projectServiceProgramManifest
