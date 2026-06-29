export const jobKeys = {
  all: ['jobs'] as const,
  list: (input: { category: string; status: string; page: number }) => ['jobs', input] as const,
  toolHistory: (input: { sourceKey: string; operation?: string; capability?: string; page: number }) => ['jobs', 'tool-history', input] as const,
  toolHistoryScope: (_nodeType: string) => ['jobs', 'tool-history'] as const,
}
