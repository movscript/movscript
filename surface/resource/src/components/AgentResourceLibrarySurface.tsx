export type AgentResourceLibraryRenderProps = {
  initialSearch?: string
  initialType?: string
  initialScope?: string
  focusResourceId?: number
  agentReferenceActions: true
}

export function AgentResourceLibrarySurface({
  ready,
  params,
  renderLibrary,
}: {
  ready: boolean
  params: URLSearchParams
  renderLibrary: (props: AgentResourceLibraryRenderProps) => JSX.Element
}) {
  if (!ready) {
    return <div className="resource-page__status">Preparing resource library...</div>
  }

  return renderLibrary({
    initialSearch: params.get('q') ?? undefined,
    initialType: params.get('type') ?? undefined,
    initialScope: params.get('scope') ?? undefined,
    focusResourceId: numberParam(params.get('resourceId')),
    agentReferenceActions: true,
  })
}

function numberParam(value: string | undefined | null): number | undefined {
  if (!value) return undefined
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}
