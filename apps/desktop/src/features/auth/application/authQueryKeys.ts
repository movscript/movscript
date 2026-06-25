export const authKeys = {
  config: ['auth', 'config'] as const,
  invitation: (token: string | undefined) => ['invitation', token] as const,
}
