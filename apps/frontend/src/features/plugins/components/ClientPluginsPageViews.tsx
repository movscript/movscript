import {
  useMemo,
  useState,
} from 'react'
import {
  AlertCircle,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Store,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@movscript/ui/primitives'
import {
  isClientPluginRemovable,
  type ClientPluginManifest,
} from '@/features/plugins/application/clientPlugins'
import type {
  ProjectPluginSnapshot,
} from '@/features/plugins/application/projectPlugins'
import type {
  ProviderPluginMarketplaceItem,
  ProviderPluginMarketplaceState,
} from '@/features/plugins/application/providerPluginMarketplace'
import {
  PluginButtonIcon,
  PluginCardActions,
  PluginCardCopy,
  PluginCardDescription,
  PluginCardDownloadMeta,
  PluginCardFooter,
  PluginCardHeader,
  PluginCardId,
  PluginCardMeta,
  PluginCardSurface,
  PluginCardTagRow,
  PluginCardTitle,
  PluginEmptyState,
  PluginMarketplaceToolbar,
  PluginPageCardGrid,
  PluginPageScrollBody,
  PluginSearchField,
  PluginSearchIconSlot,
  PluginSearchInput,
  PluginStateBanner,
  PluginStatusMeta,
  PluginTagMeta,
} from '@/features/plugins/components/PluginsPageUi'

export function PluginCard({ plugin, onRemove }: {
  plugin: ClientPluginManifest
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const removable = isClientPluginRemovable(plugin)
  return (
    <PluginCardSurface>
      <PluginCardHeader>
        <PluginCardCopy>
          <PluginCardTitle>{plugin.name}</PluginCardTitle>
          <PluginCardMeta>
            {plugin.author ? `${plugin.author} · ` : ''}v{plugin.version}
          </PluginCardMeta>
        </PluginCardCopy>
        <PluginCardActions>
          {plugin.homepage && (
            <Button size="icon-sm" variant="ghost" asChild>
              <a href={plugin.homepage} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} />
              </a>
            </Button>
          )}
          {!removable ? (
            <PluginStatusMeta>{t('plugins.builtin')}</PluginStatusMeta>
          ) : (
            <Button size="icon-sm" variant="ghost" tone="danger" onClick={onRemove}>
              <Trash2 size={14} />
            </Button>
          )}
        </PluginCardActions>
      </PluginCardHeader>

      {plugin.description && (
        <PluginCardDescription>{plugin.description}</PluginCardDescription>
      )}

      <PluginCardFooter>
        <PluginCardId>{plugin.id}</PluginCardId>
        <PluginStatusMeta>{t('plugins.pluginSkills')}</PluginStatusMeta>
      </PluginCardFooter>
    </PluginCardSurface>
  )
}

export function ProviderPluginCard({ item, onUninstall }: {
  item: ProviderPluginMarketplaceItem
  onUninstall?: () => void
}) {
  const { t } = useTranslation()
  return (
    <PluginCardSurface>
      <PluginCardHeader>
        <PluginCardCopy>
          <PluginCardTitle>{item.displayName}</PluginCardTitle>
          <PluginCardMeta>
            {item.providerLabel} · {item.marketplaceDisplayName}{item.version ? ` · v${item.version}` : ''}
          </PluginCardMeta>
        </PluginCardCopy>
        <PluginCardActions>
          <PluginStatusMeta>{item.enabled ? t('plugins.enabled') : t('plugins.disabled')}</PluginStatusMeta>
          {onUninstall ? (
            <Button size="icon-sm" variant="ghost" tone="danger" onClick={onUninstall}>
              <Trash2 size={14} />
            </Button>
          ) : null}
        </PluginCardActions>
      </PluginCardHeader>

      {item.description && (
        <PluginCardDescription>{item.description}</PluginCardDescription>
      )}

      <PluginCardFooter>
        <PluginCardId>{item.name}</PluginCardId>
        <PluginStatusMeta>{item.sourceLabel}</PluginStatusMeta>
      </PluginCardFooter>
    </PluginCardSurface>
  )
}

export function SystemPluginCard({ item, onUninstall }: {
  item: ProjectPluginSnapshot['systemPlugins'][number]
  onUninstall?: () => void
}) {
  const builtin = item.sourceType === 'builtin'
  return (
    <PluginCardSurface>
      <PluginCardHeader>
        <PluginCardCopy>
          <PluginCardTitle>{item.displayName ?? item.name}</PluginCardTitle>
          <PluginCardMeta>
            {item.marketplaceName}{item.version ? ` · v${item.version}` : ''}
          </PluginCardMeta>
        </PluginCardCopy>
        <PluginCardActions>
          <PluginStatusMeta>{builtin ? '系统内置' : item.installed ? '系统缓存' : '缺失'}</PluginStatusMeta>
          {onUninstall ? (
            <Button size="icon-sm" variant="ghost" tone="danger" onClick={onUninstall}>
              <Trash2 size={14} />
            </Button>
          ) : null}
        </PluginCardActions>
      </PluginCardHeader>

      {item.description && (
        <PluginCardDescription>{item.description}</PluginCardDescription>
      )}

      <PluginCardFooter>
        <PluginCardId>{item.pluginKey}</PluginCardId>
        <PluginStatusMeta>
          {item.projectEnabled ? '本项目已开启' : item.globalEnabled ? '全局已开启' : builtin ? '系统托管' : '未开启'}
        </PluginStatusMeta>
      </PluginCardFooter>
    </PluginCardSurface>
  )
}

export function MarketplaceView({ items, errors, loading, onInstall, onUninstall, onRefresh }: {
  items: ProviderPluginMarketplaceItem[]
  errors: ProviderPluginMarketplaceState['errors']
  loading: boolean
  onInstall: (item: ProviderPluginMarketplaceItem) => Promise<void>
  onUninstall: (item: ProviderPluginMarketplaceItem) => Promise<void>
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [installing, setInstalling] = useState<string>()

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (p) => p.name.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q) ||
        p.providerLabel.toLowerCase().includes(q) ||
        p.marketplaceDisplayName.toLowerCase().includes(q) ||
        p.sourceLabel.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        p.keywords.some((tag) => tag.toLowerCase().includes(q)),
    )
  }, [items, search])

  async function handleInstall(item: ProviderPluginMarketplaceItem) {
    setInstalling(item.key)
    try {
      await onInstall(item)
    } finally {
      setInstalling(undefined)
    }
  }

  async function handleUninstall(item: ProviderPluginMarketplaceItem) {
    setInstalling(item.key)
    try {
      await onUninstall(item)
    } finally {
      setInstalling(undefined)
    }
  }

  return (
    <PluginPageScrollBody>
      <PluginMarketplaceToolbar>
        <PluginSearchField>
          <PluginSearchIconSlot><Search size={14} /></PluginSearchIconSlot>
          <PluginSearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('plugins.searchPlaceholder')}
          />
        </PluginSearchField>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading} loading={loading}>
          {!loading ? <PluginButtonIcon><RefreshCw size={12} /></PluginButtonIcon> : null}
          {t('plugins.refresh')}
        </Button>
      </PluginMarketplaceToolbar>

      {errors.length > 0 ? (
        <PluginStateBanner tone="danger" icon={<AlertCircle size={12} />}>
          {errors.map((error) => `${error.providerLabel}: ${error.message}`).join(' · ')}
        </PluginStateBanner>
      ) : null}

      {loading && filtered.length === 0 ? (
        <PluginEmptyState
          icon={Loader2}
          title={t('plugins.loadingMarketplace')}
          detail={t('plugins.loadingMarketplaceHint')}
          layout="marketplace"
        />
      ) : filtered.length === 0 ? (
        <PluginEmptyState
          icon={Store}
          title={t('plugins.marketplaceEmpty')}
          detail={t('plugins.marketplaceEmptyHint')}
          layout="marketplace"
        />
      ) : (
        <PluginPageCardGrid>
          {filtered.map((entry) => {
            const isInstalling = installing === entry.key
            const installBlocked = entry.installPolicy === 'NOT_AVAILABLE' || entry.availability === 'DISABLED_BY_ADMIN'
            return (
              <PluginCardSurface key={entry.key} spacing="compact">
                <PluginCardHeader>
                  <PluginCardCopy>
                    <PluginCardTitle>{entry.displayName}</PluginCardTitle>
                    <PluginCardMeta>
                      {entry.providerLabel} · {entry.marketplaceDisplayName}{entry.version ? ` · v${entry.version}` : ''}
                    </PluginCardMeta>
                  </PluginCardCopy>
                  {entry.installed ? (
                    <PluginCardActions>
                      <PluginStatusMeta>{t('plugins.alreadyInstalled')}</PluginStatusMeta>
                      <Button size="icon-sm" variant="ghost" tone="danger" onClick={() => void handleUninstall(entry)} disabled={isInstalling} loading={isInstalling}>
                        <Trash2 size={14} />
                      </Button>
                    </PluginCardActions>
                  ) : (
                    <PluginCardActions>
                      <Button size="sm" onClick={() => void handleInstall(entry)} disabled={isInstalling || installBlocked} loading={isInstalling}>
                        {isInstalling
                          ? t('plugins.install')
                          : <><PluginButtonIcon><Download size={12} /></PluginButtonIcon>{t('plugins.install')}</>
                        }
                      </Button>
                    </PluginCardActions>
                  )}
                </PluginCardHeader>
                <PluginCardDescription>{entry.description ?? t('plugins.noDescription')}</PluginCardDescription>
                <PluginCardFooter>
                  <PluginCardTagRow>
                    {[entry.sourceType, ...entry.capabilities, ...entry.keywords].slice(0, 4).map((tag) => (
                      <PluginTagMeta key={tag}>{tag}</PluginTagMeta>
                    ))}
                  </PluginCardTagRow>
                  <PluginCardDownloadMeta>
                    {entry.sourceLabel}
                  </PluginCardDownloadMeta>
                </PluginCardFooter>
              </PluginCardSurface>
            )
          })}
        </PluginPageCardGrid>
      )}
    </PluginPageScrollBody>
  )
}
