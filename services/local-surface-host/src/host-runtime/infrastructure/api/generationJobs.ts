import { configureSurfaceGenerationJobStatusClient } from '@movscript/shared'
import { subscribeGenerationJobStatus } from '../../../adapters/generationJobStatusStream'

configureSurfaceGenerationJobStatusClient({
  subscribeGenerationJobStatus,
})
