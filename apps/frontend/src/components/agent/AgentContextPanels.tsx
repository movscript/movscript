import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardCheck, RefreshCw, SlidersHorizontal, Wrench } from 'lucide-react'
import { Badge, Button } from '@movscript/ui'
import { buildPageContext } from '@/lib/agentCommandInput'
import { agentToolNameLabel } from '@/lib/agentToolDisplay'
import { isRecord } from '@/lib/jsonValue'
import { localAgentApprovalRiskText } from '@/components/agent/localRuntime'
import { DebugSummaryItem } from '@/components/agent/AgentDebugPreviewDialog'
import type {
  AgentCapabilitiesResponse,
  AgentDebugTool,
  AgentInspectResponse,
  AgentManifest,
  AgentRun,
  AgentRunPreview,
} from '@/lib/localAgentClient'

type ConversationContextTool = AgentDebugTool | AgentInspectResponse['registeredTools'][number]

export interface ConversationAgentContextConfig {
  enabled: boolean
  manifest: AgentManifest | null
}

export const EMPTY_AGENT_CONTEXT_CONFIG: ConversationAgentContextConfig = {
  enabled: false,
  manifest: null,
}

export interface PageContextSummary {
  pageKey?: string
  pageType?: string
  pageRoute?: string
  pageEntityType?: string
  pageEntityId?: number | string
  draftId?: string
  projectId?: number
  productionId?: number
  selectionLabel?: string
  selectionEntityType?: string
  selectionEntityId?: number | string
  labels: string[]
}

export const EMPTY_PAGE_CONTEXT_SUMMARY: PageContextSummary = {
  labels: [],
}

export function PageContextPanel({
  context,
}: {
  context: PageContextSummary
}) {
  const { t } = useTranslation()
  const rows = [
    context.pageRoute ? { label: t('agents.chat.panel.pageContext.route'), value: context.pageRoute } : null,
    context.pageKey ? { label: t('agents.chat.panel.pageContext.pageKey'), value: context.pageKey } : null,
    context.selectionLabel ? { label: t('agents.chat.panel.pageContext.selection'), value: context.selectionLabel } : null,
    context.draftId ? { label: t('agents.chat.panel.pageContext.currentDraft'), value: context.draftId } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
      <div className="grid gap-2 text-[11px] md:grid-cols-3">
        <DebugSummaryItem label={t('agents.chat.panel.pageContext.page')} value={context.pageType || t('agents.chat.panel.pageContext.unknown')} />
        <DebugSummaryItem label={t('agents.chat.panel.pageContext.entity')} value={formatPageEntityLabel(context, t)} />
        <DebugSummaryItem label={t('agents.chat.panel.pageContext.currentDraft')} value={context.draftId || t('agents.chat.panel.pageContext.noDraft')} />
      </div>
      {rows.length > 0 ? (
        <div className="space-y-1">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1 text-[10px]">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="truncate font-mono text-foreground" title={row.value}>{row.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] leading-relaxed text-muted-foreground">{t('agents.chat.panel.pageContext.empty')}</p>
      )}
      {context.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {context.labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">{label}</Badge>
          ))}
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {context.draftId
          ? t('agents.chat.panel.pageContext.draftHint')
          : t('agents.chat.panel.pageContext.noDraftHint')}
      </p>
    </div>
  )
}

export function AgentRuntimeContextPanel({
  context,
  emptyText,
}: {
  context?: AgentRunPreview['context']
  emptyText: string
}) {
  const { t } = useTranslation()
  if (!context) {
    return (
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {emptyText}
      </p>
    )
  }
  const route = [context.route.pathname, context.route.search ?? '', context.route.hash ?? ''].join('')
  const rows = [
    route ? { label: t('agents.chat.panel.pageContext.route'), value: route } : null,
    context.selection?.label ? { label: t('agents.chat.panel.pageContext.selection'), value: context.selection.label } : null,
    context.projectsError ? { label: '项目加载错误', value: context.projectsError } : null,
    ...(context.statusDigest ?? []).slice(0, 3).map((value, index) => ({ label: `状态 ${index + 1}`, value })),
    ...(context.rawContextHints ?? []).slice(0, 3).map((value, index) => ({ label: `提示 ${index + 1}`, value })),
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
      <div className="grid gap-2 text-[11px] md:grid-cols-3">
        <DebugSummaryItem label={t('agents.chat.panel.context.project')} value={context.project ? `${context.project.name ?? `#${context.project.id}`}` : t('common.emptyTitle')} />
        <DebugSummaryItem label={t('agents.chat.panel.context.resources')} value={String(context.recentResources.length)} />
        <DebugSummaryItem label={t('agents.chat.panel.context.attachments')} value={String(context.attachments.length)} />
      </div>
      <div className="grid gap-2 text-[11px] md:grid-cols-3">
        <DebugSummaryItem label="制作" value={context.productionId !== undefined ? `#${context.productionId}` : t('agents.chat.panel.pageContext.none')} />
        <DebugSummaryItem label="项目数" value={String(context.projects?.length ?? 0)} />
        <DebugSummaryItem label="记忆数" value={String(context.memories.length)} />
      </div>
      {rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((row) => (
            <div key={`${row.label}-${row.value}`} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1 text-[10px]">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="truncate font-mono text-foreground" title={row.value}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
      {context.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {context.labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">{label}</Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function formatPageEntityLabel(context: PageContextSummary, t: ReturnType<typeof useTranslation>['t']) {
  const type = context.pageEntityType ?? context.selectionEntityType
  const id = context.pageEntityId ?? context.selectionEntityId
  if (!type && id === undefined) return t('agents.chat.panel.pageContext.none')
  if (!type) return String(id)
  return id === undefined ? type : `${type} #${id}`
}

export function pageContextFromAgentContext(context?: AgentRunPreview['context']): PageContextSummary | undefined {
  if (!context) return undefined
  const route = {
    pathname: context.route.pathname,
    search: context.route.search,
    hash: context.route.hash,
  }
  const pageContext = buildPageContext({
    route,
    projectId: context.project?.id,
    productionId: context.productionId,
    selection: context.selection,
    labels: context.labels,
  })
  return {
    pageKey: pageContext?.pageKey,
    pageType: pageContext?.pageType,
    pageRoute: pageContext?.pageRoute,
    pageEntityType: pageContext?.pageEntityType,
    pageEntityId: pageContext?.pageEntityId,
    draftId: pageContext?.draftId,
    ...(context.project?.id !== undefined ? { projectId: context.project.id } : {}),
    ...(context.productionId !== undefined ? { productionId: context.productionId } : {}),
    selectionLabel: context.selection?.label,
    selectionEntityType: context.selection?.entityType,
    selectionEntityId: context.selection?.entityId,
    labels: context.labels,
  }
}

export function agentContextFromRun(run: AgentRun | null | undefined): AgentRunPreview['context'] | undefined {
  const context = isRecord(run?.metadata?.context) ? run.metadata.context : undefined
  if (!context) return undefined
  const route = isRecord(context.route) ? context.route : undefined
  const pathname = stringValue(route?.pathname) ?? '/'
  const recentResources = Array.isArray(context.recentResources)
    ? context.recentResources.filter(isRecord).map((resource) => ({
      id: numberValue(resource.id) ?? numberValue(resource.ID) ?? 0,
      name: stringValue(resource.name) ?? '',
      type: stringValue(resource.type) ?? '',
      ...(stringValue(resource.mimeType ?? resource.mime_type) ? { mimeType: stringValue(resource.mimeType ?? resource.mime_type) } : {}),
      ...(numberValue(resource.size) !== undefined ? { size: numberValue(resource.size) } : {}),
    })).filter((resource) => resource.id > 0 && resource.name && resource.type)
    : []
  const attachments = Array.isArray(context.attachments)
    ? context.attachments.filter(isRecord).map((attachment) => ({
      id: stringValue(attachment.id) ?? '',
      name: stringValue(attachment.name) ?? '',
      type: stringValue(attachment.type) ?? 'file',
      ...(numberValue(attachment.resourceId) !== undefined ? { resourceId: numberValue(attachment.resourceId) } : {}),
    })).filter((attachment) => attachment.id && attachment.name)
    : []
  const memories = Array.isArray(context.memories)
    ? context.memories.filter(isRecord).map((memory) => ({
      id: stringValue(memory.id) ?? '',
      scope: stringValue(memory.scope) ?? (numberValue(memory.projectId) !== undefined ? 'project' : 'global'),
      kind: stringValue(memory.kind) ?? '',
      content: stringValue(memory.content) ?? '',
    })).filter((memory) => memory.id && memory.kind)
    : []
  const selection = isRecord(context.selection)
    ? {
      entityType: stringValue(context.selection.entityType) ?? '',
      entityId: stringValue(context.selection.entityId) ?? numberValue(context.selection.entityId) ?? '',
      ...(stringValue(context.selection.label) ? { label: stringValue(context.selection.label) } : {}),
    }
    : null
  return {
    route: {
      pathname,
      ...(stringValue(route?.search) ? { search: stringValue(route?.search) } : {}),
      ...(stringValue(route?.hash) ? { hash: stringValue(route?.hash) } : {}),
    },
    ...(Array.isArray(context.projects) ? { projects: context.projects.filter(isRecord).map((project) => ({
      id: numberValue(project.id) ?? 0,
      name: stringValue(project.name) ?? '',
      ...(stringValue(project.description) ? { description: stringValue(project.description) } : {}),
      ...(stringValue(project.status) ? { status: stringValue(project.status) } : {}),
      ...(numberValue(project.totalEpisodes) !== undefined ? { totalEpisodes: numberValue(project.totalEpisodes) } : {}),
    })).filter((project) => project.id > 0 && project.name) } : {}),
    ...(stringValue(context.projectsError) ? { projectsError: stringValue(context.projectsError) } : {}),
    ...(isRecord(context.project) && numberValue(context.project.id) !== undefined ? {
      project: {
        id: numberValue(context.project.id) as number,
        ...(stringValue(context.project.name) ? { name: stringValue(context.project.name) } : {}),
        ...(stringValue(context.project.status) ? { status: stringValue(context.project.status) } : {}),
        ...(stringValue(context.project.description) ? { description: stringValue(context.project.description) } : {}),
        ...(stringValue(context.project.aspect_ratio) ? { aspect_ratio: stringValue(context.project.aspect_ratio) } : {}),
        ...(stringValue(context.project.visual_style) ? { visual_style: stringValue(context.project.visual_style) } : {}),
        ...(stringValue(context.project.project_style) ? { project_style: stringValue(context.project.project_style) } : {}),
      },
    } : {}),
    ...(numberValue(context.productionId) !== undefined ? { productionId: numberValue(context.productionId) } : {}),
    selection: selection && selection.entityType && selection.entityId !== '' ? selection : null,
    recentResources,
    attachments,
    memories,
    labels: Array.isArray(context.labels) ? context.labels.filter((label): label is string => typeof label === 'string' && !!label.trim()) : [],
    ...(Array.isArray(context.statusDigest) ? { statusDigest: context.statusDigest.filter((item): item is string => typeof item === 'string') } : {}),
    ...(Array.isArray(context.rawContextHints) ? { rawContextHints: context.rawContextHints.filter((item): item is string => typeof item === 'string') } : {}),
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function ConversationContextPanel({
  online,
  inspect,
  capabilities,
  loading,
  config,
  onRefresh,
}: {
  online: boolean
  inspect?: AgentInspectResponse
  capabilities?: AgentCapabilitiesResponse
  loading: boolean
  config: ConversationAgentContextConfig
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const skills = inspect?.skills ?? []
  const tools = useMemo<ConversationContextTool[]>(() => capabilities?.resolvedTools.available ?? inspect?.registeredTools ?? [], [capabilities?.resolvedTools.available, inspect?.registeredTools])
  const activeManifest = (config.enabled ? config.manifest : inspect?.defaultAgentManifest) ?? null
  const activeSkillIds = config.enabled
    ? new Set((activeManifest?.skills ?? []).filter((skill) => skill.enabled !== false).map((skill) => skill.id))
    : null
  const activeToolNames = new Set((activeManifest?.tools ?? []).filter((grant) => grant.mode !== 'deny').map((grant) => grant.name))
  const activeSkills = activeSkillIds
    ? skills.filter((skill) => activeSkillIds.has(skill.id))
    : skills.filter((skill) => skill.enabled !== false)
  const activeTools = tools.filter((tool) => activeToolNames.has(tool.name))

  return (
    <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
            <SlidersHorizontal size={11} />
            {t('agents.chat.panel.capabilities.title')}
            <Badge variant={config.enabled ? 'secondary' : 'outline'} className="text-[9px] leading-4 px-1.5 py-0">
              {config.enabled ? t('agents.chat.panel.capabilities.custom') : t('agents.chat.panel.capabilities.runtimeDefault')}
            </Badge>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            {t('agents.chat.panel.capabilities.activeHint')}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onRefresh}
          disabled={loading}
          className="h-5 px-1 text-[10px] text-muted-foreground"
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          {t('agents.chat.panel.capabilities.refresh')}
        </Button>
      </div>

      {!online ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">{t('agents.chat.panel.capabilities.startHint')}</p>
      ) : !inspect ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">{loading ? t('agents.chat.panel.capabilities.loadingCatalog') : t('agents.chat.panel.capabilities.notLoaded')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <DebugSummaryItem label={t('agents.chat.panel.capabilities.skills')} value={String(activeSkills.length)} />
            <DebugSummaryItem label={t('agents.chat.panel.capabilities.tools')} value={String(activeTools.length)} />
          </div>

          {activeManifest && (
            <div className="rounded-md border border-border bg-muted/20 p-2 text-[10px]">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-foreground">{activeManifest.name}</span>
                <Badge variant={config.enabled ? 'secondary' : 'outline'} className="text-[9px] leading-4 px-1.5 py-0">
                  {config.enabled ? t('agents.chat.panel.capabilities.custom') : t('agents.chat.panel.capabilities.runtimeDefault')}
                </Badge>
              </div>
              <div className="mt-1 text-muted-foreground">
                {t('agents.chat.panel.capabilities.activeManifest', { skills: activeSkills.length, tools: activeTools.length })}
              </div>
            </div>
          )}

          <details className="rounded-md border border-border bg-background/70" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
              <span className="inline-flex items-center gap-1.5"><ClipboardCheck size={10} /> Skills</span>
              <span className="text-[9px] text-muted-foreground">{activeSkills.length}</span>
            </summary>
            <div className="max-h-44 space-y-1 overflow-y-auto border-t border-border p-1.5">
              {activeSkills.length === 0 ? (
                <p className="px-1 text-[10px] text-muted-foreground">{t('agents.chat.panel.capabilities.noSkillsLoaded')}</p>
              ) : activeSkills.map((skill) => (
                <div key={skill.id} className="rounded border border-border/70 bg-background px-2 py-1.5 text-[10px]">
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="truncate font-medium text-foreground">{skill.name}</span>
                        {!skill.enabled && <Badge variant="secondary" className="text-[8px] leading-3 px-1 py-0">{t('agents.chat.panel.capabilities.disabled')}</Badge>}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">{skill.description || skill.id}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>

          <details className="rounded-md border border-border bg-background/70" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
              <span className="inline-flex items-center gap-1.5"><Wrench size={10} /> Tools</span>
              <span className="text-[9px] text-muted-foreground">{activeTools.length}</span>
            </summary>
            <div className="max-h-56 space-y-1 overflow-y-auto border-t border-border p-1.5">
              {activeTools.length === 0 ? (
                <p className="px-1 text-[10px] text-muted-foreground">{t('agents.chat.panel.capabilities.noToolsLoaded')}</p>
              ) : activeTools.map((tool) => (
                <div key={tool.name} className="rounded border border-border/70 bg-background px-2 py-1.5 text-[10px]">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-medium text-foreground" title={tool.name}>{agentToolNameLabel(tool.name, t)}</span>
                    {tool.risk && <Badge variant="outline" className="text-[8px] leading-3 px-1 py-0">{localAgentApprovalRiskText(tool.risk, t)}</Badge>}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">{tool.description}</p>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  )
}
