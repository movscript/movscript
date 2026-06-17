import { protocol } from 'electron'
import { readMediaPipelineLocalHlsResponse } from './services/mediaPipeline/localHlsProtocol'

const MEDIA_PROTOCOL_SCHEME = 'movscript-media'

let mediaProtocolInstalled = false

export function registerMediaProtocolPrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

export function installMediaProtocol(): void {
  if (mediaProtocolInstalled) return
  mediaProtocolInstalled = true
  protocol.handle(MEDIA_PROTOCOL_SCHEME, (request) => readMediaPipelineLocalHlsResponse(request.url))
}

