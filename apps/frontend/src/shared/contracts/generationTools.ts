export type GenerationToolServerType = 'comfyui' | 'webui'
export type GenerationToolServerScope = 'local' | 'org' | 'admin'
export type GenerationToolAuthKind = 'none' | 'basic' | 'bearer'

export type GenerationToolServer = {
  id: string
  scope: GenerationToolServerScope
  type: GenerationToolServerType
  name: string
  enabled: boolean
  baseURL: string
  timeoutMS: number
  priority: number
  authKind: GenerationToolAuthKind
  username?: string
  password?: string
  token?: string
  tokenSet?: boolean
  passwordSet?: boolean
  tags?: string[]
}

export type GenerationToolsSettings = {
  servers: GenerationToolServer[]
  defaultServerId?: string
  defaultServerIds?: Partial<Record<GenerationToolServerType, string>>
  preferLocalServers: boolean
}
