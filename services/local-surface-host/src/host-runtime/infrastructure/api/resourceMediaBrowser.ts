import { configureResourceMediaBrowser } from '@movscript/resource-surface/resource-media'
import { getDaemonGatewayBaseURL } from '../config'

configureResourceMediaBrowser({
  gatewayBaseURL: getDaemonGatewayBaseURL,
})
