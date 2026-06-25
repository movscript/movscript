export const jobKeys = {
  all: ['jobs'] as const,
  list: (input: { category: string; status: string; page: number }) => ['jobs', input] as const,
  toolHistory: (nodeType: string, page: number) => ['jobs', nodeType, page] as const,
  toolHistoryScope: (nodeType: string) => ['jobs', nodeType] as const,
}
