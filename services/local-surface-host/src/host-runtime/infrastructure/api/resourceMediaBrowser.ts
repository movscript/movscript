import { configureResourceMediaBrowser } from '@movscript/resource-surface/resource-media'
import { getAPIBaseURL } from '../config'

configureResourceMediaBrowser({
  apiBaseURL: getAPIBaseURL,
})
