import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const editingServiceProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'editing-service',
  serviceName: 'movscript.editing.service',
  kind: 'service',
  name: 'MovScript Editing Service',
  profiles: ['local', 'cloud', 'test'],
  entry: {
    command: 'movscript-editing-service',
    args: ['serve'],
  },
  transport: 'http',
  health: {
    kind: 'http',
    target: '/health',
  },
  dependsOn: ['movscript.project.service', 'movscript.data.service'],
  provides: ['timeline', 'edit-plan', 'editing-timeline-view', 'scene-moment-timeline-bundle', 'production-timeline-bundle', 'preview-timeline', 'render-request', 'media-task-action'],
} satisfies ProgramManifest

export default editingServiceProgramManifest
