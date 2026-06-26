import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  Filter,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import type { RawResource } from '@movscript/shared'
import { surfaceDataApi as api } from '@movscript/shared/surface-http'
import { Button, Input, cn } from '@movscript/ui/primitives'
import { toast } from '@movscript/ui/toast'
import {
  YUNWU_SEEDANCE_PROVIDER_ASSET_MODELS,
  type ResourceLibraryProviderAssetProvider,
} from '../../resource-browser.js'
import { ResourceImage } from '../../resourceMediaComponents.js'
import './ProviderAssetLibraryPage.css'

type ResourcePagePayload = {
  items?: RawResource[]
  total?: number
}

type RemoteAssetGroup = {
  ID?: number
  id?: number
  provider_id?: string
  provider_kind?: string
  remote_group_id?: string
  name?: string
  project_id?: string
  project_name?: string
  setting_id?: string
  model_scope?: string
  scope?: string
  origin?: string
  status?: string
  UpdatedAt?: string
  updated_at?: string
}

type RemoteAsset = {
  ID?: number
  id?: number
  provider_id?: string
  provider_kind?: string
  group_id?: number
  remote_group_id?: string
  remote_asset_id?: string
  asset_uri?: string
  hub_asset_id?: string
  source_resource_id?: number
  source_candidate_id?: string
  source_url?: string
  source_hash?: string
  name?: string
  asset_type?: string
  mime_type?: string
  status?: string
  raw_status?: string
  UpdatedAt?: string
  updated_at?: string
  model_certifications?: ModelCertification[]
}

type ModelCertification = {
  ID?: number
  id?: number
  provider_asset_id?: number
  provider_id?: string
  public_model_id?: string
  provider_model_id?: string
  capability?: string
  status?: string
  asset_uri?: string
  remote_asset_id?: string
  certified_at?: string
  expires_at?: string
  error?: string
  UpdatedAt?: string
  updated_at?: string
}

type CertificationStatus = 'active' | 'processing' | 'failed' | 'missing'
type GroupMode = 'selected' | 'manual'
type StatusFilter = 'all' | CertificationStatus

export function ProviderAssetLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const [providerID, setProviderID] = useState(searchParams.get('provider_id') ?? '')
  const [model, setModel] = useState(searchParams.get('model') ?? YUNWU_SEEDANCE_PROVIDER_ASSET_MODELS[0]?.id ?? '')
  const [selectedGroupRef, setSelectedGroupRef] = useState(searchParams.get('group') ?? '')
  const [selectedAssetID, setSelectedAssetID] = useState<number | null>(() => numberParam(searchParams.get('asset_id')))
  const [sourceResourceID, setSourceResourceID] = useState<number | null>(() => numberParam(searchParams.get('resource_id')))
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('selected')
  const [manualGroupID, setManualGroupID] = useState('')
  const [manualGroupName, setManualGroupName] = useState('')

  const providersQuery = useQuery({
    queryKey: ['provider-assets', 'providers'],
    queryFn: listProviderAssetProviders,
  })

  const providers = providersQuery.data ?? []
  const selectedProvider = providers.find(provider => provider.provider_id === providerID) ?? providers[0]
  const effectiveModel = model || YUNWU_SEEDANCE_PROVIDER_ASSET_MODELS[0]?.id || ''
  const selectedModelOption = YUNWU_SEEDANCE_PROVIDER_ASSET_MODELS.find(option => option.id === effectiveModel)

  useEffect(() => {
    if (!providerID && providers[0]) setProviderID(providers[0].provider_id)
  }, [providerID, providers])

  const groupsQuery = useQuery({
    queryKey: ['provider-assets', 'groups', selectedProvider?.provider_id],
    enabled: Boolean(selectedProvider?.provider_id),
    queryFn: () => listRemoteAssetGroups(selectedProvider?.provider_id ?? ''),
  })

  const groups = groupsQuery.data ?? []
  const selectedGroup = useMemo(() => {
    if (!selectedGroupRef) return groups[0]
    return groups.find(group => groupRef(group) === selectedGroupRef || String(groupID(group) ?? '') === selectedGroupRef) ?? groups[0]
  }, [groups, selectedGroupRef])

  useEffect(() => {
    if (!selectedGroup) return
    const nextRef = groupRef(selectedGroup)
    if (nextRef && selectedGroupRef !== nextRef) setSelectedGroupRef(nextRef)
  }, [selectedGroup, selectedGroupRef])

  const assetsQuery = useQuery({
    queryKey: ['provider-assets', 'assets', selectedProvider?.provider_id, selectedGroup ? groupRef(selectedGroup) : ''],
    enabled: Boolean(selectedProvider?.provider_id && selectedGroup),
    queryFn: () => listRemoteAssets(selectedProvider?.provider_id ?? '', groupRef(selectedGroup)),
  })

  const resourcesQuery = useQuery({
    queryKey: ['provider-assets', 'source-resources'],
    queryFn: listImageResources,
  })

  const resources = resourcesQuery.data?.items ?? []
  const resourcesByID = useMemo(() => {
    const map = new Map<number, RawResource>()
    for (const resource of resources) map.set(resource.ID, resource)
    return map
  }, [resources])

  const assets = assetsQuery.data ?? []
  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return assets.filter(asset => {
      const status = assetStatusForModel(asset, effectiveModel)
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (!needle) return true
      const localResource = sourceResource(asset, resourcesByID)
      return [
        asset.name,
        asset.asset_uri,
        asset.remote_asset_id,
        asset.remote_group_id,
        asset.source_resource_id,
        localResource?.name,
      ].some(value => String(value ?? '').toLowerCase().includes(needle))
    })
  }, [assets, effectiveModel, query, resourcesByID, statusFilter])

  const selectedAsset = useMemo(() => {
    if (selectedAssetID) {
      const matched = assets.find(asset => assetID(asset) === selectedAssetID)
      if (matched) return matched
    }
    return filteredAssets[0] ?? assets[0]
  }, [assets, filteredAssets, selectedAssetID])

  useEffect(() => {
    if (!selectedAsset) return
    const id = assetID(selectedAsset)
    if (id && selectedAssetID !== id) setSelectedAssetID(id)
  }, [selectedAsset, selectedAssetID])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (selectedProvider?.provider_id) next.set('provider_id', selectedProvider.provider_id)
    else next.delete('provider_id')
    if (effectiveModel) next.set('model', effectiveModel)
    else next.delete('model')
    if (selectedGroupRef) next.set('group', selectedGroupRef)
    else next.delete('group')
    if (selectedAssetID) next.set('asset_id', String(selectedAssetID))
    else next.delete('asset_id')
    if (sourceResourceID) next.set('resource_id', String(sourceResourceID))
    else next.delete('resource_id')
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [effectiveModel, searchParams, selectedAssetID, selectedGroupRef, selectedProvider?.provider_id, setSearchParams, sourceResourceID])

  const stats = useMemo(() => ({
    active: assets.filter(asset => assetStatusForModel(asset, effectiveModel) === 'active').length,
    processing: assets.filter(asset => assetStatusForModel(asset, effectiveModel) === 'processing').length,
    failed: assets.filter(asset => assetStatusForModel(asset, effectiveModel) === 'failed').length,
    missing: assets.filter(asset => assetStatusForModel(asset, effectiveModel) === 'missing').length,
  }), [assets, effectiveModel])

  const certify = useMutation({
    mutationFn: async () => {
      if (!selectedProvider) throw new Error('请选择 Provider')
      if (!sourceResourceID) throw new Error('请选择本地 RawResource 来源')
      const source = resourcesByID.get(sourceResourceID)
      const targetGroupID = groupMode === 'manual' ? manualGroupID.trim() : groupRef(selectedGroup)
      if (!targetGroupID) throw new Error('请选择或输入远端素材组')
      const response = await api.post(`/provider-assets/providers/${encodeURIComponent(selectedProvider.provider_id)}/certify`, {
        resource_id: sourceResourceID,
        name: source?.name ?? `resource-${sourceResourceID}`,
        model: effectiveModel,
        asset_group_id: targetGroupID,
        asset_group_name: groupMode === 'manual' ? manualGroupName.trim() : selectedGroup?.name,
      })
      return response.data
    },
    onSuccess: () => {
      toast.success('素材已注册到远端素材组')
      void qc.invalidateQueries({ queryKey: ['provider-assets'] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '素材注册失败')
    },
  })

  const syncGroups = useMutation({
    mutationFn: async () => {
      if (!selectedProvider) throw new Error('请选择 Provider')
      return syncRemoteAssetGroups(selectedProvider.provider_id, effectiveModel)
    },
    onSuccess: () => {
      toast.success('远端素材组已同步')
      void qc.invalidateQueries({ queryKey: ['provider-assets', 'groups', selectedProvider?.provider_id] })
    },
    onError: error => {
      toast.error(error instanceof Error ? error.message : '同步远端素材组失败')
    },
  })

  const syncAssets = useMutation({
    mutationFn: async () => {
      if (!selectedProvider) throw new Error('请选择 Provider')
      const targetGroupID = groupMode === 'manual' ? manualGroupID.trim() : groupRef(selectedGroup)
      if (!targetGroupID) throw new Error('请选择或输入远端素材组')
      return syncRemoteAssets(selectedProvider.provider_id, targetGroupID, effectiveModel)
    },
    onSuccess: () => {
      toast.success('远端素材已同步')
      void qc.invalidateQueries({ queryKey: ['provider-assets'] })
    },
    onError: error => {
      toast.error(error instanceof Error ? error.message : '同步远端素材失败')
    },
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['provider-assets'] })
  }

  const loading = providersQuery.isLoading || groupsQuery.isLoading || assetsQuery.isLoading
  const providerLabel = providerDisplayName(selectedProvider)
  const selectedSource = sourceResourceID ? resourcesByID.get(sourceResourceID) : undefined

  return (
    <div className="provider-asset-page">
      <aside className="provider-asset-page__sidebar">
        <div className="provider-asset-page__sidebar-header">
          <div>
            <p className="provider-asset-page__eyebrow">Provider</p>
            <h1>私域素材库</h1>
          </div>
          <span className="provider-asset-page__connection" data-state={selectedProvider ? 'connected' : 'empty'}>
            {selectedProvider ? '已连接' : '未配置'}
          </span>
        </div>

        <section className="provider-asset-page__panel">
          <div className="provider-asset-page__field">
            <label>Provider 账号</label>
            <select value={selectedProvider?.provider_id ?? ''} onChange={event => setProviderID(event.target.value)}>
              {providers.map(provider => (
                <option key={provider.provider_id} value={provider.provider_id}>{providerDisplayName(provider)}</option>
              ))}
            </select>
          </div>
          <div className="provider-asset-page__field">
            <label>目标模型</label>
            <select value={effectiveModel} onChange={event => setModel(event.target.value)}>
              {YUNWU_SEEDANCE_PROVIDER_ASSET_MODELS.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <p>{selectedModelOption?.description ?? '认证按模型独立记录。'}</p>
          </div>
        </section>

        <section className="provider-asset-page__panel">
          <div className="provider-asset-page__section-title">
            <Database size={14} />
            <span>远端素材组</span>
          </div>
          <div className="provider-asset-page__field">
            <label>素材组</label>
            <select value={selectedGroup ? groupRef(selectedGroup) : ''} onChange={event => setSelectedGroupRef(event.target.value)}>
              {groups.map(group => (
                <option key={groupRef(group)} value={groupRef(group)}>{group.name || groupRef(group)}</option>
              ))}
            </select>
          </div>
          <div className="provider-asset-page__segmented">
            <button type="button" data-active={groupMode === 'selected' ? 'true' : undefined} onClick={() => setGroupMode('selected')}>选中组</button>
            <button type="button" data-active={groupMode === 'manual' ? 'true' : undefined} onClick={() => setGroupMode('manual')}>手动 ID</button>
          </div>
          {groupMode === 'manual' ? (
            <div className="provider-asset-page__field">
              <label>远端 Group ID</label>
              <Input value={manualGroupID} onChange={event => setManualGroupID(event.target.value)} placeholder="输入远端素材组 ID" />
              <Input value={manualGroupName} onChange={event => setManualGroupName(event.target.value)} placeholder="名称，可选" />
            </div>
          ) : (
            <p className="provider-asset-page__hint">{selectedGroup ? groupSummary(selectedGroup) : '暂无远端素材组。注册素材时可以手动输入已有组 ID。'}</p>
          )}
          <div className="provider-asset-page__inline-actions">
            <Button variant="outline" onClick={() => syncGroups.mutate()} disabled={!selectedProvider || syncGroups.isPending}>
              {syncGroups.isPending ? <Loader2 size={14} className="provider-asset-page__spin" /> : <RefreshCw size={14} />}
              同步素材组
            </Button>
            <Button variant="outline" onClick={() => syncAssets.mutate()} disabled={!selectedProvider || syncAssets.isPending || (groupMode === 'manual' && !manualGroupID.trim()) || (groupMode === 'selected' && !selectedGroup)}>
              {syncAssets.isPending ? <Loader2 size={14} className="provider-asset-page__spin" /> : <RotateCcw size={14} />}
              同步组素材
            </Button>
          </div>
        </section>

        <section className="provider-asset-page__panel">
          <div className="provider-asset-page__section-title">
            <ShieldCheck size={14} />
            <span>注册来源</span>
          </div>
          <div className="provider-asset-page__field">
            <label>本地 RawResource</label>
            <select value={sourceResourceID ?? ''} onChange={event => setSourceResourceID(numberParam(event.target.value))}>
              <option value="">选择图片资源</option>
              {resources.map(resource => (
                <option key={resource.ID} value={resource.ID}>{resource.name} · #{resource.ID}</option>
              ))}
            </select>
          </div>
          <Button onClick={() => certify.mutate()} disabled={!selectedProvider || !sourceResourceID || certify.isPending || (groupMode === 'manual' && !manualGroupID.trim()) || (groupMode === 'selected' && !selectedGroup)}>
            {certify.isPending ? <Loader2 size={14} className="provider-asset-page__spin" /> : <ShieldCheck size={14} />}
            注册到素材组
          </Button>
          {selectedSource ? <p className="provider-asset-page__hint">来源：{selectedSource.name} · RawResource #{selectedSource.ID}</p> : null}
        </section>

        <section className="provider-asset-page__panel">
          <div className="provider-asset-page__section-title">
            <Filter size={14} />
            <span>模型认证概览</span>
          </div>
          <Metric label="已认证" value={stats.active} tone="success" onClick={() => setStatusFilter('active')} />
          <Metric label="处理中" value={stats.processing} tone="warning" onClick={() => setStatusFilter('processing')} />
          <Metric label="失败" value={stats.failed} tone="danger" onClick={() => setStatusFilter('failed')} />
          <Metric label="未认证" value={stats.missing} onClick={() => setStatusFilter('missing')} />
        </section>
      </aside>

      <main className="provider-asset-page__workspace">
        <div className="provider-asset-page__toolbar">
          <label className="provider-asset-page__search">
            <Search size={15} />
            <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索远端素材 / asset:// / 来源资源" />
          </label>
          <div className="provider-asset-page__toolbar-actions">
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} aria-label="状态筛选">
              <option value="all">全部状态</option>
              <option value="active">已认证</option>
              <option value="processing">处理中</option>
              <option value="failed">失败</option>
              <option value="missing">未认证</option>
            </select>
            <Button variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} />
              刷新
            </Button>
          </div>
        </div>

        <div className="provider-asset-page__context">
          <span><Filter size={13} /> {providerLabel || '未选择 Provider'}</span>
          <span>{selectedGroup ? selectedGroup.name || groupRef(selectedGroup) : '未选择素材组'}</span>
          <span>{modelLabel(effectiveModel)}</span>
          <span>共 {assets.length} 个远端素材</span>
        </div>

        <div className="provider-asset-page__table-wrap">
          <table className="provider-asset-page__table">
            <thead>
              <tr>
                <th>预览</th>
                <th>远端素材</th>
                <th>Provider</th>
                <th>目标模型</th>
                <th>认证状态</th>
                <th>asset:// ID</th>
                <th>素材组</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map(asset => {
                const localResource = sourceResource(asset, resourcesByID)
                const status = assetStatusForModel(asset, effectiveModel)
                return (
                  <tr
                    key={assetID(asset) ?? asset.remote_asset_id ?? asset.asset_uri}
                    data-active={selectedAsset && assetID(selectedAsset) === assetID(asset) ? 'true' : undefined}
                    onClick={() => setSelectedAssetID(assetID(asset))}
                  >
                    <td>{localResource ? <ResourceThumb resource={localResource} /> : <RemoteThumb />}</td>
                    <td>
                      <strong>{asset.name || asset.remote_asset_id || '-'}</strong>
                      <span>{localResource ? `RawResource #${localResource.ID}` : asset.remote_asset_id || '远端素材'}</span>
                    </td>
                    <td>{providerLabel || '-'}</td>
                    <td>{modelLabel(effectiveModel)}</td>
                    <td><StatusPill status={status} /></td>
                    <td className="provider-asset-page__mono">{asset.asset_uri || '-'}</td>
                    <td className="provider-asset-page__mono">{asset.remote_group_id || '-'}</td>
                    <td>{formatDateTime(asset.updated_at || asset.UpdatedAt || '')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!loading && filteredAssets.length === 0 ? (
            <div className="provider-asset-page__empty">
              <ImageIcon size={24} />
              <p>当前素材组还没有匹配的远端素材。</p>
            </div>
          ) : null}
          {loading ? (
            <div className="provider-asset-page__empty">
              <Loader2 size={24} className="provider-asset-page__spin" />
              <p>正在加载远端素材库。</p>
            </div>
          ) : null}
        </div>
      </main>

      <aside className="provider-asset-page__detail">
        <div className="provider-asset-page__detail-header">
          <div>
            <p className="provider-asset-page__eyebrow">远端素材</p>
            <h2>{selectedAsset?.name ?? '未选择素材'}</h2>
          </div>
        </div>
        {selectedAsset ? (
          <RemoteAssetDetail
            asset={selectedAsset}
            provider={selectedProvider}
            source={sourceResource(selectedAsset, resourcesByID)}
            targetModel={effectiveModel}
          />
        ) : (
          <p className="provider-asset-page__hint">选择一个远端素材后查看模型认证状态。</p>
        )}
      </aside>
    </div>
  )
}

function RemoteAssetDetail({ asset, provider, source, targetModel }: { asset: RemoteAsset; provider?: ResourceLibraryProviderAssetProvider; source?: RawResource; targetModel: string }) {
  const status = assetStatusForModel(asset, targetModel)
  const targetCert = certificationForModel(asset, targetModel)
  return (
    <>
      <div className="provider-asset-page__preview">
        {source ? <ResourceThumb resource={source} large /> : <RemoteThumb large />}
      </div>
      <DetailRow label="目标模型状态" value={<StatusPill status={status} />} />
      <DetailRow label="Provider" value={providerDisplayName(provider) || '-'} />
      <DetailRow label="Provider ID" value={provider?.provider_id ?? '-'} mono />
      <DetailRow label="远端 Asset ID" value={asset.remote_asset_id || '-'} mono />
      <DetailRow label="Asset URI" value={asset.asset_uri || '-'} mono />
      <DetailRow label="素材组" value={asset.remote_group_id || '-'} mono />
      <DetailRow label="来源资源" value={source ? `RawResource #${source.ID}` : '-'} mono />
      <DetailRow label="更新时间" value={formatDateTime(asset.updated_at || asset.UpdatedAt || '')} />
      {targetCert?.error ? (
        <div className="provider-asset-page__error">
          <AlertTriangle size={14} />
          <span>{targetCert.error}</span>
        </div>
      ) : null}
      <div className="provider-asset-page__panel">
        <div className="provider-asset-page__section-title">
          <ShieldCheck size={14} />
          <span>模型认证</span>
        </div>
        {(asset.model_certifications ?? []).length === 0 ? (
          <p className="provider-asset-page__hint">暂无模型认证记录。</p>
        ) : (
          <div className="provider-asset-page__cert-list">
            {(asset.model_certifications ?? []).map(cert => (
              <div key={cert.ID ?? cert.id ?? `${cert.public_model_id}:${cert.provider_model_id}`} className="provider-asset-page__cert-item">
                <span>{modelLabel(cert.public_model_id || cert.provider_model_id || '未指定模型')}</span>
                <StatusPill status={certStatus(cert)} />
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="provider-asset-page__detail-actions">
        <Button variant="outline" onClick={() => copyText(asset.asset_uri || '')} disabled={!asset.asset_uri}>
          <Copy size={14} />
          复制 ID
        </Button>
      </div>
    </>
  )
}

function Metric({ label, value, tone, onClick }: { label: string; value: number; tone?: string; onClick: () => void }) {
  return (
    <button type="button" className="provider-asset-page__metric" data-tone={tone} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="provider-asset-page__detail-row">
      <span>{label}</span>
      <strong className={cn(mono && 'provider-asset-page__mono')}>{value}</strong>
    </div>
  )
}

function StatusPill({ status }: { status: CertificationStatus }) {
  const label = status === 'active' ? '已认证' : status === 'processing' ? '处理中' : status === 'failed' ? '失败' : '未认证'
  const Icon = status === 'active' ? CheckCircle2 : status === 'processing' ? Loader2 : status === 'failed' ? AlertTriangle : ImageIcon
  return (
    <span className="provider-asset-page__status" data-status={status}>
      <Icon size={13} className={status === 'processing' ? 'provider-asset-page__spin' : undefined} />
      {label}
    </span>
  )
}

function ResourceThumb({ resource, large = false }: { resource: RawResource; large?: boolean }) {
  return (
    <div className={cn('provider-asset-page__thumb', large && 'provider-asset-page__thumb--large')}>
      <ResourceImage
        resource={resource}
        alt={resource.name}
        loading="eager"
        diagnosticLabel={`provider-asset:${resource.ID}`}
        thumbnailMaxSize={large ? 900 : 240}
      />
    </div>
  )
}

function RemoteThumb({ large = false }: { large?: boolean }) {
  return (
    <div className={cn('provider-asset-page__thumb', large && 'provider-asset-page__thumb--large')}>
      <ImageIcon size={large ? 32 : 18} />
    </div>
  )
}

async function listProviderAssetProviders(): Promise<ResourceLibraryProviderAssetProvider[]> {
  const response = await api.get<unknown>('/admin/providers')
  return readListPayload<ResourceLibraryProviderAssetProvider>(response.data).filter(providerSupportsAssetLibrary)
}

async function listRemoteAssetGroups(providerID: string): Promise<RemoteAssetGroup[]> {
  const response = await api.get<unknown>(`/provider-assets/providers/${encodeURIComponent(providerID)}/groups`)
  return readListPayload<RemoteAssetGroup>(response.data)
}

async function listRemoteAssets(providerID: string, groupRefValue: string): Promise<RemoteAsset[]> {
  if (!providerID || !groupRefValue) return []
  const response = await api.get<unknown>(`/provider-assets/providers/${encodeURIComponent(providerID)}/groups/${encodeURIComponent(groupRefValue)}/assets`)
  return readListPayload<RemoteAsset>(response.data)
}

async function listImageResources(): Promise<ResourcePagePayload> {
  const params = new URLSearchParams()
  params.set('page', '1')
  params.set('page_size', '200')
  params.set('type', 'image')
  const response = await api.get<ResourcePagePayload>(`/resources?${params}`)
  return {
    items: response.data.items ?? [],
    total: response.data.total ?? response.data.items?.length ?? 0,
  }
}

async function syncRemoteAssetGroups(providerID: string, model: string): Promise<RemoteAssetGroup[]> {
  const params = new URLSearchParams()
  if (model) params.set('model', model)
  const suffix = params.toString() ? `?${params}` : ''
  const response = await api.post<unknown>(`/provider-assets/providers/${encodeURIComponent(providerID)}/groups/sync${suffix}`)
  return readListPayload<RemoteAssetGroup>(response.data)
}

async function syncRemoteAssets(providerID: string, groupRefValue: string, model: string): Promise<RemoteAsset[]> {
  const params = new URLSearchParams()
  if (model) params.set('model', model)
  const suffix = params.toString() ? `?${params}` : ''
  const response = await api.post<unknown>(`/provider-assets/providers/${encodeURIComponent(providerID)}/groups/${encodeURIComponent(groupRefValue)}/assets/sync${suffix}`)
  return readListPayload<RemoteAsset>(response.data)
}

function assetStatusForModel(asset: RemoteAsset, model: string): CertificationStatus {
  const cert = certificationForModel(asset, model)
  if (!cert) return 'missing'
  return certStatus(cert)
}

function certificationForModel(asset: RemoteAsset, model: string): ModelCertification | undefined {
  const certs = asset.model_certifications ?? []
  if (!model) return certs[0]
  return certs.find(cert => cert.public_model_id === model || cert.provider_model_id === model)
}

function certStatus(cert: ModelCertification): CertificationStatus {
  const raw = String(cert.status ?? '').toLowerCase()
  if (raw === 'active' || raw === 'succeeded' || raw === 'success') return 'active'
  if (raw === 'processing' || raw === 'pending' || raw === 'running') return 'processing'
  if (raw === 'failed' || raw === 'error') return 'failed'
  return 'missing'
}

function sourceResource(asset: RemoteAsset, resourcesByID: Map<number, RawResource>): RawResource | undefined {
  return asset.source_resource_id ? resourcesByID.get(asset.source_resource_id) : undefined
}

function groupID(group: RemoteAssetGroup | undefined): number | undefined {
  return group?.ID ?? group?.id
}

function assetID(asset: RemoteAsset | undefined): number | null {
  return asset?.ID ?? asset?.id ?? null
}

function groupRef(group: RemoteAssetGroup | undefined): string {
  if (!group) return ''
  return group.remote_group_id || String(groupID(group) ?? '')
}

function groupSummary(group: RemoteAssetGroup): string {
  const parts = [
    group.remote_group_id ? `ID ${group.remote_group_id}` : '',
    group.project_id ? `项目 ${group.project_id}` : '',
    group.setting_id ? `设定 ${group.setting_id}` : '',
    group.model_scope ? `模型 ${modelLabel(group.model_scope)}` : '',
  ].filter(Boolean)
  return parts.join(' · ') || '远端素材组'
}

function providerSupportsAssetLibrary(provider: ResourceLibraryProviderAssetProvider): boolean {
  const state = readJSONRecord(provider.asset_library_state_json)
  const assetTypes = Array.isArray(state.asset_types) ? state.asset_types.map(String) : []
  return provider.is_enabled !== false && state.supports_asset_library === true && (assetTypes.length === 0 || assetTypes.includes('image'))
}

function providerDisplayName(provider: ResourceLibraryProviderAssetProvider | undefined): string {
  if (!provider) return ''
  return provider.display_name || provider.profile || provider.provider_id
}

function modelLabel(modelID: string): string {
  return YUNWU_SEEDANCE_PROVIDER_ASSET_MODELS.find(option => option.id === modelID)?.label ?? modelID
}

function readListPayload<T>(raw: unknown, keys: string[] = ['items', 'records', 'data']): T[] {
  if (Array.isArray(raw)) return raw as T[]
  if (!raw || typeof raw !== 'object') return []
  const record = raw as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value as T[]
  }
  return []
}

function readJSONRecord(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function numberParam(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function formatDateTime(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function copyText(value: string) {
  if (!value) return
  void navigator.clipboard.writeText(value)
  toast.success('已复制 asset URI')
}
