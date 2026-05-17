import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bot, CheckCircle2, Loader2, RefreshCw, Save, Settings, TestTube2, XCircle } from 'lucide-react'
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@movscript/ui'
import { api } from '@/lib/api'
import { localAgentClient, type RuntimeModelConfigPublic, type RuntimeModelTestResult } from '@/lib/localAgentClient'
import { publicModelId, publicModelLabel } from '@/lib/modelDisplay'
import { cn } from '@/lib/utils'
import { useAgentStore } from '@/store/agentStore'
import type { PublicModel } from '@/types'

const NO_MODEL_VALUE = '__none'

export default function AIAgentSettingsPage() {
  const { t } = useTranslation()
  const agentSettings = useAgentStore((s) => s.settings)
  const updateAgentSettings = useAgentStore((s) => s.updateSettings)
  const [selectedModelId, setSelectedModelId] = useState<string>(NO_MODEL_VALUE)
  const [useForChat, setUseForChat] = useState(true)
  const [useForPlanner, setUseForPlanner] = useState(true)
  const [testMessage, setTestMessage] = useState(t('agents.settings.testMessageDefault'))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedConfig, setSavedConfig] = useState<RuntimeModelConfigPublic | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<RuntimeModelTestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const runtimeQuery = useQuery({
    queryKey: ['agent-settings-runtime-model', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.getModelConfig()
    },
    retry: false,
  })
  const modelsQuery = useQuery<PublicModel[]>({
    queryKey: ['models', 'text'],
    queryFn: () => api.get('/models?capability=text').then((r) => r.data),
  })

  const textModels = modelsQuery.data ?? []
  const selectedModel = useMemo(() => {
    return textModels.find((model) => publicModelId(model) === selectedModelId) ?? null
  }, [selectedModelId, textModels])
  const effectiveConfig = savedConfig ?? runtimeQuery.data ?? null
  const effectiveModelValue = useMemo(() => (
    effectiveConfig?.configured ? runtimeModelValue(textModels, effectiveConfig) : NO_MODEL_VALUE
  ), [effectiveConfig, textModels])
  const configuredModelLabel = effectiveConfig?.configured
    ? modelDisplayName(textModels, effectiveConfig)
    : t('agents.settings.notConfigured')
  const hasUnsavedChanges = effectiveConfig?.configured
    ? selectedModelId !== effectiveModelValue ||
      useForChat !== effectiveConfig.useForChat ||
      useForPlanner !== effectiveConfig.useForPlanner
    : selectedModelId !== NO_MODEL_VALUE

  useEffect(() => {
    if (!runtimeQuery.data) return
    if (runtimeQuery.data.configured) {
      setSelectedModelId(runtimeModelValue(textModels, runtimeQuery.data))
      setUseForChat(runtimeQuery.data.useForChat)
      setUseForPlanner(runtimeQuery.data.useForPlanner)
      return
    }
    if (agentSettings.modelId) {
      const storedModel = textModels.find((model) => model.id === agentSettings.modelId)
      if (storedModel) setSelectedModelId(publicModelId(storedModel))
    }
  }, [agentSettings.modelId, runtimeQuery.data, textModels])

  async function saveSettings() {
    if (!selectedModel) return
    setSaving(true)
    setSaveError(null)
    setTestResult(null)
    setTestError(null)
    try {
      await localAgentClient.ensureRunning()
      const nextConfig = await localAgentClient.saveModelConfig({
        model: publicModelId(selectedModel),
        useForChat,
        useForPlanner,
      })
      setSavedConfig(nextConfig)
      updateAgentSettings({ modelId: selectedModel.id })
      await runtimeQuery.refetch()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  async function testSettings() {
    if (!selectedModel) return
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    setSaveError(null)
    try {
      await localAgentClient.ensureRunning()
      await localAgentClient.saveModelConfig({
        model: publicModelId(selectedModel),
        useForChat,
        useForPlanner,
      })
      updateAgentSettings({ modelId: selectedModel.id })
      const result = await localAgentClient.testModelConfig({ message: testMessage.trim() || t('agents.settings.testMessageDefault') })
      setTestResult(result)
      await runtimeQuery.refetch()
    } catch (error) {
      setTestError(error instanceof Error ? error.message : String(error))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div data-testid="agent-settings-page" className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Settings size={18} />
              <h1 className="text-lg font-semibold text-foreground">{t('agents.settings.title')}</h1>
              <Badge variant={effectiveConfig?.configured ? 'success' : 'warning'}>
                {effectiveConfig?.configured ? t('agents.settings.configured') : t('agents.settings.notConfigured')}
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{t('agents.settings.description')}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => runtimeQuery.refetch()} disabled={runtimeQuery.isFetching}>
            <RefreshCw size={13} className={runtimeQuery.isFetching ? 'animate-spin' : ''} />
            {t('agents.debug.actions.refresh')}
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        {runtimeQuery.isLoading || modelsQuery.isLoading ? (
          <StateMessage icon={<Loader2 size={16} className="animate-spin" />} text={t('common.loading')} />
        ) : runtimeQuery.error ? (
          <StateMessage icon={<XCircle size={16} />} tone="danger" text={runtimeQuery.error instanceof Error ? runtimeQuery.error.message : String(runtimeQuery.error)} />
        ) : modelsQuery.error ? (
          <StateMessage icon={<XCircle size={16} />} tone="danger" text={modelsQuery.error instanceof Error ? modelsQuery.error.message : String(modelsQuery.error)} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-4">
              <Panel title={t('agents.settings.modelPanel')}>
                <div className="grid gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">{t('agents.settings.modelLabel')}</label>
                    <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('agents.settings.selectModel')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MODEL_VALUE} disabled>{t('agents.settings.selectModel')}</SelectItem>
                        {textModels.length === 0 ? (
                          <SelectItem value="__empty_text_models" disabled>{t('agents.settings.noTextModels')}</SelectItem>
                        ) : textModels.map((model) => (
                          <SelectItem key={model.id} value={publicModelId(model)}>
                            {publicModelLabel(model, true)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t('agents.settings.modelHelp')}</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <ToggleRow checked={useForChat} onChange={setUseForChat} title={t('agents.settings.useForChat')} description={t('agents.settings.useForChatHelp')} />
                    <ToggleRow checked={useForPlanner} onChange={setUseForPlanner} title={t('agents.settings.useForPlanner')} description={t('agents.settings.useForPlannerHelp')} />
                  </div>

                  {selectedModel && (
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <SummaryItem label={t('agents.settings.fields.modelId')} value={publicModelId(selectedModel)} />
                      <SummaryItem label={t('agents.settings.fields.capabilities')} value={selectedModel.capabilities.join(', ') || '-'} />
                      <SummaryItem label={t('agents.settings.fields.provider')} value={selectedModel.provider_name || '-'} />
                      <SummaryItem label={t('agents.settings.fields.configId')} value={`#${selectedModel.id}`} />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={saveSettings} disabled={!selectedModel || saving}>
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      {hasUnsavedChanges ? t('agents.settings.save') : t('agents.settings.saved')}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={testSettings} disabled={!selectedModel || testing}>
                      {testing ? <Loader2 size={13} className="animate-spin" /> : <TestTube2 size={13} />}
                      {t('agents.settings.test')}
                    </Button>
                  </div>

                  {saveError && <InlineError>{saveError}</InlineError>}
                </div>
              </Panel>

              <Panel title={t('agents.settings.testPanel')}>
                <div className="space-y-3">
                  <Textarea
                    value={testMessage}
                    onChange={(event) => setTestMessage(event.target.value)}
                    className="min-h-24 text-xs"
                  />
                  {testError && <InlineError>{testError}</InlineError>}
                  {testResult && (
                    <div className="rounded-md border border-border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={testResult.ok ? 'success' : 'destructive'}>
                          {testResult.ok ? t('agents.settings.testOk') : t('agents.settings.testFailed')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{testResult.model}</span>
                        <span className="text-xs text-muted-foreground">{testResult.latencyMs}ms</span>
                      </div>
                      <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-xs leading-5 text-foreground">
                        {testResult.content || '-'}
                      </pre>
                    </div>
                  )}
                </div>
              </Panel>
            </section>

            <aside className="space-y-4">
              <Panel title={t('agents.settings.currentRuntime')}>
                <div className="space-y-2 text-xs">
                  <SummaryItem label={t('agents.settings.fields.baseUrl')} value={localAgentClient.baseURL} />
                  <SummaryItem label={t('agents.settings.fields.configuredModel')} value={configuredModelLabel} />
                  <SummaryItem label={t('agents.settings.fields.source')} value={effectiveConfig?.source ?? 'none'} />
                  <SummaryItem label={t('agents.settings.fields.updatedAt')} value={effectiveConfig?.updatedAt ? new Date(effectiveConfig.updatedAt).toLocaleString() : '-'} />
                </div>
              </Panel>

              <Panel title={t('agents.settings.availableModels')}>
                {textModels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('agents.settings.noTextModels')}</p>
                ) : (
                  <div className="space-y-2">
                    {textModels.slice(0, 12).map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => setSelectedModelId(publicModelId(model))}
                        className={cn(
                          'w-full rounded-md border p-2 text-left transition-colors',
                          selectedModelId === publicModelId(model) ? 'border-ring bg-muted/50' : 'border-border bg-background hover:bg-muted/30',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-medium text-foreground">{publicModelLabel(model, true)}</span>
                          {selectedModelId === publicModelId(model) && <CheckCircle2 size={13} className="shrink-0 text-primary" />}
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{model.capabilities.join(', ')}</p>
                      </button>
                    ))}
                  </div>
                )}
              </Panel>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

function runtimeModelValue(models: PublicModel[], config: RuntimeModelConfigPublic): string {
  const byPublicID = models.find((model) => publicModelId(model) === config.model)
  if (byPublicID) return publicModelId(byPublicID)
  const byLegacyID = config.modelConfigId ? models.find((model) => model.id === config.modelConfigId) : undefined
  return byLegacyID ? publicModelId(byLegacyID) : config.model
}

function modelDisplayName(models: PublicModel[], config: RuntimeModelConfigPublic) {
  const value = runtimeModelValue(models, config)
  const model = models.find((item) => publicModelId(item) === value)
  return model ? publicModelLabel(model, true) : config.model
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Bot size={13} className="text-muted-foreground" />
        <h2 className="text-xs font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function ToggleRow({ checked, onChange, title, description }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-muted/20 p-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded border-input"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}

function SummaryItem({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/20 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-foreground">{value ?? '-'}</p>
    </div>
  )
}

function InlineError({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{children}</div>
}

function StateMessage({ icon, text, tone = 'muted' }: { icon: React.ReactNode; text: string; tone?: 'muted' | 'danger' }) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-md border p-3 text-sm',
      tone === 'danger' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-muted/20 text-muted-foreground',
    )}>
      {icon}
      <span>{text}</span>
    </div>
  )
}
