import { configureSurfaceGenerationJobStatusClient, type SurfaceGenerationJobStatusEvent } from '@movscript/shared'
import { subscribeGenerationJobStatus } from '@/features/jobs/application/generationJobStatusStream'

configureSurfaceGenerationJobStatusClient({
  subscribeGenerationJobStatus: (handler) => subscribeGenerationJobStatus((event) => {
    handler(event as SurfaceGenerationJobStatusEvent)
  }),
})
