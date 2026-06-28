import axios from 'axios'
import { configureSurfaceHttpClients } from '@movscript/shared/surface-http'
import '../application/appEvents'
import './api/generationJobs'
import './api/hostState'
import './api/localSurfaceHostApi'
import './api/routes'
import './api/semanticEntities'
import './api/workspaceArtifacts'
import './api/workspaceCandidates'
import './api/workspaceDomain'
import './api/resourceMediaBrowser'

export const api = axios.create({
  baseURL: '/api/v1',
})

export const canvasApi = axios.create({
  baseURL: '',
})

configureSurfaceHttpClients({
  data: api,
  canvas: canvasApi,
})
