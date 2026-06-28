export const modelKeys = {
  capability: (capability: string | undefined) => ['models', capability] as const,
  intent: (capability: string | undefined, operation: string | undefined) => ['models', capability, operation ?? ''] as const,
}
