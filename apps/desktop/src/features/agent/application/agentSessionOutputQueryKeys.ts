export const agentSessionOutputKeys = {
  threadRuns: (
    providerSessionTreeId: string | undefined,
    providerThreadId: string | undefined,
  ) => ['agent-session-output-thread-runs', providerSessionTreeId, providerThreadId] as const,
  contentWorkspace: (projectId: number | undefined) => ['agent-session-output-content-workspace', projectId] as const,
}
