export const modelKeys = {
  capability: (capability: string | undefined) => ['models', capability] as const,
}
