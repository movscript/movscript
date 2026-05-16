import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Loader2, Play, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  loadClientPlugins,
  runClientPlugin,
  type ClientPluginManifest,
  type ClientPluginInputProperty,
} from '@/lib/clientPlugins'
import { usePluginBridge } from '@/lib/usePluginBridge'
import { ResourcePanel } from '@/components/shared/ResourcePanel'
import { ModelSelector } from '@/components/shared/ModelSelector'
import type { RawResource } from '@/types'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/projectRoutes'

// ── Webview iframe (bundleUrl plugins) ────────────────────────────────────────

function buildIframeHTML(plugin: ClientPluginManifest): string {
  const bundleUrl = plugin.bundleUrl ?? ''
  const inlineScript = plugin.bundle ?? plugin.script ?? ''
  const movScript = `
(function() {
  var _pending = {};
  var _seq = 0;
  function call(method, args) {
    return new Promise(function(resolve, reject) {
      var id = 'mov_' + (++_seq);
      _pending[id] = { resolve: resolve, reject: reject };
      window.parent.postMessage({ id: id, method: method, args: args }, '*');
    });
  }
  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data || !data.id || !_pending[data.id]) return;
    var p = _pending[data.id];
    delete _pending[data.id];
    if (data.error) p.reject(new Error(data.error));
    else p.resolve(data.result);
  });
  window.mov = {
    get:           function(path)        { return call('get',           [path]); },
    post:          function(path, body)  { return call('post',          [path, body]); },
    patch:         function(path, body)  { return call('patch',         [path, body]); },
    delete:        function(path)        { return call('delete',        [path]); },
    models:        function(cap)         { return call('models',        [cap]); },
    modelConfigs:  function()            { return call('modelConfigs',  []); },
    resources:     function()            { return call('resources',     []); },
    generateImage: function(req)         { return call('generateImage', [req]); },
    sleep:         function(ms)          { return call('sleep',         [ms]); },
    mcp: {
      listTools:   function()            { return call('mcp.listTools', []); },
      callTool:    function(n, a)        { return call('mcp.callTool',  [n, a]); },
    },
  };
})();
`
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: system-ui, sans-serif; background: transparent; }</style>
<script>${movScript}<\/script>
</head>
<body>
<div id="root"></div>
${bundleUrl ? `<script src="${bundleUrl}"><\/script>` : ''}
${inlineScript ? `<script>${inlineScript}<\/script>` : ''}
</body>
</html>`
}

// ── Native form UI (bundle/script plugins) ────────────────────────────────────

function ParamField({
  name,
  prop,
  value,
  onChange,
  modelValues,
  onModelChange,
}: {
  name: string
  prop: ClientPluginInputProperty
  value: string
  onChange: (v: string) => void
  modelValues: Record<string, number>
  onModelChange: (fieldName: string, id: number) => void
}) {
  const label = prop.title ?? name

  // Model selector widget
  const isModelSelector = prop['x-widget'] === 'model-selector' || name === 'model_config_id'
  if (isModelSelector) {
    const capability = (prop['x-capability'] as 'image' | 'video' | 'text') ?? 'image'
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-foreground">{label}</label>
        {prop.description && <p className="text-[11px] text-muted-foreground">{prop.description}</p>}
        <ModelSelector
          capability={capability}
          value={modelValues[name] ?? null}
          onChange={(id) => onModelChange(name, id)}
        />
      </div>
    )
  }

  if (prop.enum && prop.enum.length > 0) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-foreground">{label}</label>
        {prop.description && <p className="text-[11px] text-muted-foreground">{prop.description}</p>}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {prop.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
          ))}
        </select>
      </div>
    )
  }

  if (prop.type === 'number') {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-foreground">{label}</label>
        {prop.description && <p className="text-[11px] text-muted-foreground">{prop.description}</p>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    )
  }

  // string / default
  const isLong = name === 'prompt' || name.includes('prompt') || name.includes('description')
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {prop.description && <p className="text-[11px] text-muted-foreground">{prop.description}</p>}
      {isLong ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="px-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}
    </div>
  )
}

function NativePluginUI({ plugin }: { plugin: ClientPluginManifest }) {
  const { t } = useTranslation()
  const schema = plugin.inputSchema
  const properties = schema?.properties ?? {}
  const required = schema?.required ?? []

  const initValues = () => {
    const vals: Record<string, string> = {}
    for (const [k, prop] of Object.entries(properties)) {
      const isModelSelector = prop['x-widget'] === 'model-selector' || k === 'model_config_id'
      if (!isModelSelector) {
        vals[k] = prop.default !== undefined ? String(prop.default) : ''
      }
    }
    return vals
  }

  const [values, setValues] = useState<Record<string, string>>(initValues)
  // model-selector fields store their selected ID separately
  const [modelValues, setModelValues] = useState<Record<string, number>>({})
  const [selectedResources, setSelectedResources] = useState<RawResource[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ text: string; isError?: boolean } | null>(null)

  // Inject selected resource IDs into reference_resource_ids if the field exists
  const hasRefField = 'reference_resource_ids' in properties

  function handleSelect(r: RawResource) {
    setSelectedResources((prev) => prev.some((x) => x.ID === r.ID) ? prev : [...prev, r])
  }

  async function handleRun() {
    setRunning(true)
    setResult(null)
    try {
      const args: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(values)) {
        if (v === '') continue
        const prop = properties[k]
        args[k] = prop?.type === 'number' ? Number(v) : v
      }
      // Inject model selector values
      for (const [k, id] of Object.entries(modelValues)) {
        if (id) args[k] = id
      }
      if (hasRefField && selectedResources.length > 0) {
        args.reference_resource_ids = selectedResources.map((r) => r.ID).join(',')
      }
      const res = await runClientPlugin(plugin, args)
      const text = res.content?.map((c) => c.text ?? '').join('\n') ?? JSON.stringify(res.data ?? '')
      setResult({ text, isError: res.isError })
    } catch (err: any) {
      setResult({ text: err?.message ?? String(err), isError: true })
    } finally {
      setRunning(false)
    }
  }

  // For required fields: model-selector fields are satisfied when modelValues has a value
  const canRun = !running && required.every((k) => {
    const prop = properties[k]
    const isModelSelector = prop?.['x-widget'] === 'model-selector' || k === 'model_config_id'
    if (isModelSelector) return !!modelValues[k]
    return (values[k] ?? '').trim() !== ''
  })

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <ResourcePanel
        inputType="image+video"
        selectedIds={selectedResources.map((r) => r.ID)}
        onSelect={handleSelect}
      />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Plugin info */}
          <div className="border border-border rounded-lg bg-background p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{plugin.name}</p>
                {plugin.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{plugin.description}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">v{plugin.version}</span>
            </div>

            {/* Selected resources badge */}
            {hasRefField && selectedResources.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {selectedResources.map((r) => (
                  <span
                    key={r.ID}
                    className="inline-flex items-center gap-1 text-[11px] bg-muted text-muted-foreground rounded px-2 py-0.5"
                  >
                    {r.name}
                    <button
                      onClick={() => setSelectedResources((prev) => prev.filter((x) => x.ID !== r.ID))}
                      className="hover:text-foreground"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Param fields */}
            <div className="space-y-3">
              {Object.entries(properties).map(([name, prop]) => {
                if (name === 'reference_resource_ids') return null
                const isModelSelector = prop['x-widget'] === 'model-selector' || name === 'model_config_id'
                return (
                  <ParamField
                    key={name}
                    name={name}
                    prop={prop}
                    value={isModelSelector ? '' : (values[name] ?? '')}
                    onChange={(v) => setValues((prev) => ({ ...prev, [name]: v }))}
                    modelValues={modelValues}
                    onModelChange={(fieldName, id) => setModelValues((prev) => ({ ...prev, [fieldName]: id }))}
                  />
                )
              })}
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={handleRun} disabled={!canRun} size="sm">
                {running
                  ? <><Loader2 size={13} className="mr-1.5 animate-spin" />{t('plugins.running')}</>
                  : <><Play size={13} className="mr-1.5" />{t('plugins.run')}</>
                }
              </Button>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className={cn(
              'border rounded-lg p-4 text-xs font-mono whitespace-pre-wrap break-all',
              result.isError
                ? 'border-destructive/40 bg-destructive/5 text-destructive'
                : 'border-border bg-muted/30 text-foreground'
            )}>
              <p className="text-[10px] font-sans font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {t('plugins.result')}
              </p>
              {result.text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PluginToolPage() {
  const { pluginId } = useParams<{ pluginId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [plugin, setPlugin] = useState<ClientPluginManifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  usePluginBridge(iframeRef)

  useEffect(() => {
    if (!pluginId) return
    loadClientPlugins().then((plugins) => {
      const found = plugins.find((p) => p.id === decodeURIComponent(pluginId))
      if (found) setPlugin(found)
      else setNotFound(true)
      setLoading(false)
    })
  }, [pluginId])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound || !plugin) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <AlertCircle size={24} className="text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">{t('plugins.notFound')}</p>
        <Button size="sm" variant="outline" onClick={() => navigate(ROUTES.plugins)}>
          <ArrowLeft size={13} className="mr-1.5" />
          {t('common.back')}
        </Button>
      </div>
    )
  }

  // webview plugins render in an iframe; bundle/script plugins use native UI
  const isWebview = !!plugin.bundleUrl

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="h-11 border-b border-border px-4 flex items-center gap-3 shrink-0">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigate(ROUTES.plugins)}>
          <ArrowLeft size={14} />
        </Button>
        <span className="text-muted-foreground text-sm">{t('sidebar.sections.tools')}</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-semibold text-foreground">{plugin.name}</span>
        {plugin.version && <span className="text-xs text-muted-foreground">v{plugin.version}</span>}
        {isWebview && (
          <div className="ml-auto">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setIframeKey((k) => k + 1)} title="Reload">
              <RefreshCw size={13} />
            </Button>
          </div>
        )}
      </div>

      {isWebview ? (
        <div className="flex-1 min-h-0">
          <iframe
            key={iframeKey}
            ref={iframeRef}
            srcDoc={buildIframeHTML(plugin)}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            className="w-full h-full border-0"
            title={plugin.name}
          />
        </div>
      ) : (
        <NativePluginUI plugin={plugin} />
      )}
    </div>
  )
}
