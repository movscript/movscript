import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
export function requireWorkspaceFilesAPI() {
  const api = readElectronApi()
  if (!api?.listMovScriptWorkspaceFiles || !api.readMovScriptWorkspaceFile || !api.readMovScriptWorkspaceMediaFile || !api.writeMovScriptWorkspaceFile || !api.deleteMovScriptWorkspaceFile) {
    throw new Error('当前窗口没有 MovScript Workspace 文件管理能力')
  }
  return {
    list: api.listMovScriptWorkspaceFiles,
    read: api.readMovScriptWorkspaceFile,
    readMedia: api.readMovScriptWorkspaceMediaFile,
    write: api.writeMovScriptWorkspaceFile,
    delete: api.deleteMovScriptWorkspaceFile,
  }
}

export function requireWorkspaceFileReadAPI() {
  const api = readElectronApi()
  if (!api?.readMovScriptWorkspaceFile) {
    throw new Error('当前窗口没有 MovScript Workspace 文件读取能力')
  }
  return {
    read: api.readMovScriptWorkspaceFile,
  }
}

export function requireWorkspaceRootAPI() {
  const api = readElectronApi()
  if (!api?.getMovScriptWorkspaceRoot) {
    throw new Error('当前窗口没有 MovScript Workspace Root 能力')
  }
  return {
    getRoot: api.getMovScriptWorkspaceRoot,
  }
}
