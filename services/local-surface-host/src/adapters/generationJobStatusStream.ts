export interface GenerationJobStatusEvent {
  jobId: number
  projectId?: number
  contentUnitId?: string
  candidateId?: string
  status?: string
  resourceId?: number
  outputResourceId?: number
  [key: string]: unknown
}

export type GenerationJobStatusHandler = (event: GenerationJobStatusEvent) => void

const subscribers = new Set<GenerationJobStatusHandler>()

export function subscribeGenerationJobStatus(handler: GenerationJobStatusHandler): () => void {
  subscribers.add(handler)
  return () => subscribers.delete(handler)
}

export function publishGenerationJobStatus(event: GenerationJobStatusEvent): void {
  for (const subscriber of subscribers) subscriber(event)
}
