export interface SurfaceGenerationJobStatusEvent {
  jobId: number
  status?: string
  job?: unknown
  projectId?: number
  jobType?: string
  providerTaskId?: string
  message?: string
  updatedAt?: string
  source?: string
  [key: string]: unknown
}

export interface SurfaceGenerationJobStatusClient {
  subscribeGenerationJobStatus(handler: (event: SurfaceGenerationJobStatusEvent) => void): () => void
}

let generationJobStatusClient: SurfaceGenerationJobStatusClient | undefined

export function configureSurfaceGenerationJobStatusClient(client: SurfaceGenerationJobStatusClient): void {
  generationJobStatusClient = client
}

export function subscribeSurfaceGenerationJobStatus(
  handler: (event: SurfaceGenerationJobStatusEvent) => void,
): () => void {
  return generationJobStatusClient?.subscribeGenerationJobStatus(handler) ?? (() => {})
}
