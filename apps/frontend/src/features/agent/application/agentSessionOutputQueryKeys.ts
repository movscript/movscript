export const agentSessionOutputKeys = {
  threadRuns: (
    baseURL: string,
    providerSessionTreeId: string | undefined,
    providerThreadId: string | undefined,
  ) => ['agent-session-output-thread-runs', baseURL, providerSessionTreeId, providerThreadId] as const,
  contentWorkspace: (projectId: number | undefined) => ['agent-session-output-content-workspace', projectId] as const,
}
