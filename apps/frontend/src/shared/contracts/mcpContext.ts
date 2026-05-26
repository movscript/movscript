export interface MCPContextSnapshot {
  route: {
    pathname: string
    search: string
    hash: string
  }
  project: {
    id: number
    name: string
    description?: string
    status?: string
    totalEpisodes?: number
  } | null
  productionId?: number | null
  user: {
    id: number
    username: string
    systemRole: string
  } | null
  selection: {
    entityType?: string
    entityId?: number
    label?: string
  } | null
  updatedAt: string
}

export type MCPContextUpdate = MCPContextSnapshot & {
  auth?: {
    token: string
  } | null
}
