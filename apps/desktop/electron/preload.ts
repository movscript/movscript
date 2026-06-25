import { contextBridge, ipcRenderer } from 'electron'
import { createElectronAPI } from './preload/api'

contextBridge.exposeInMainWorld('api', createElectronAPI(ipcRenderer, process.platform))
