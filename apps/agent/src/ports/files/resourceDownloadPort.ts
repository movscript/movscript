export interface ResourceFileDownloadAuthContext {
  userId?: number | string
  backendAuthToken?: string
  backendAPIBaseURL?: string
}

export interface ResourceFileDownloadResult {
  performed: boolean
  method?: 'GET'
  url?: string
  path?: string
  contentType?: string
  contentLength?: number
  skippedReason?: string
}

export interface ResourceFileDownloadPort {
  downloadResourceFile(
    resourceId: number,
    targetPath: string,
    auth?: ResourceFileDownloadAuthContext,
    options?: { signal?: AbortSignal },
  ): Promise<ResourceFileDownloadResult>
}
