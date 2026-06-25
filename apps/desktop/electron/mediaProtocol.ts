import { protocol } from 'electron'
import { readMediaPipelineLocalFileResponse } from './services/mediaPipeline/localFileProtocol'
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
  protocol.handle(MEDIA_PROTOCOL_SCHEME, (request) => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    if (url.hostname === 'local-file') return readMediaPipelineLocalFileResponse(request)
    return readMediaPipelineLocalHlsResponse(request.url)
  })
}
