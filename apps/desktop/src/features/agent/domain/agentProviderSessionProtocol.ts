export function agentProtocolUsesProviderSession(
  input: { providerProtocol?: string | null } | undefined,
): boolean {
  const protocol = input?.providerProtocol?.trim()
  return Boolean(protocol) && protocol !== 'sdk' && protocol !== 'claude-code'
}
