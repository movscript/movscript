export const shotLibraryKeys = {
  references: ['shot-references'] as const,
  referenceList: (input: {
    sources: Array<{ id: string; apiV1BaseURL: string }>
    query: string
    language: string
  }) => [
    ...shotLibraryKeys.references,
    input.sources.map(source => `${source.id}:${source.apiV1BaseURL}`).join('|'),
    input.query,
    input.language,
  ] as const,
}
