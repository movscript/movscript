import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  createResourceLibraryDataServiceAdapter,
  useResourceLibraryBrowserController,
  type ResourceLibraryBrowserControllerInput,
} from '../../resource-browser.js'
import { surfaceDataApi as api } from '@movscript/shared/surface-http'
import { toast } from '@movscript/ui/toast'
import { downloadResource } from '../../resourceMediaBrowser.js'
import type { Project, RawResource, ResourceBinding, ResourceFolder } from '@movscript/shared'
import {
  invalidateResourceMutationResult,
  resourceBindingChangedResult,
  resourceLibraryChangedResult,
} from '../application/resourceMutationInvalidation'
import { useSurfaceHostState } from '../../surfaceHostStateHooks.js'

export type ResourceLibraryControllerOptions = Pick<
  ResourceLibraryBrowserControllerInput<RawResource, ResourceBinding, ResourceFolder, Project>,
  'initialSearch' | 'initialType' | 'initialScope' | 'focusResourceId'
>

export function useResourceLibraryController(options: ResourceLibraryControllerOptions = {}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const currentOrgID = useSurfaceHostState(state => state.currentOrgID)
  const currentUser = useSurfaceHostState(state => state.currentUser)
  const currentProject = useSurfaceHostState(state => state.currentProject)
  const appSettings = useSurfaceHostState(state => state.appSettings)
  const projectScopeEnabled = appSettings?.launchMode !== 'local'

  return useResourceLibraryBrowserController<RawResource, ResourceBinding, ResourceFolder, Project>({
    ...options,
    adapter: createResourceLibraryDataServiceAdapter<RawResource, ResourceBinding, ResourceFolder, Project>(api),
    currentOrgID,
    currentUser,
    currentProject,
    projectScopeEnabled,
    downloadResource,
    notify: toast,
    messages: {
      sharedToTeamSuccess: t('pages.resources.sharedToTeamSuccess', { defaultValue: '已加入团队资源库' }),
      sharedToProjectSuccess: t('pages.resources.sharedToProjectSuccess', { defaultValue: '已分享给项目' }),
      revokedFromProjectSuccess: t('pages.resources.revokedFromProjectSuccess', { defaultValue: '已从项目移除引用' }),
      providerAssetCertified: t('pages.resources.providerAssetCertified', { defaultValue: '已认证到 Provider 素材库' }),
      providerAssetCertifyFailed: t('pages.resources.providerAssetCertifyFailed', { defaultValue: 'Provider 素材库认证失败，请检查系统设置里的公网地址和 provider 凭证' }),
    },
    onResourceLibraryChanged: ({ changedIds }) => {
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds }))
    },
    onResourceBindingChanged: ({ projectId, changedIds }) => {
      invalidateResourceMutationResult(qc, resourceBindingChangedResult({ projectId, changedIds }))
    },
  })
}
