import { useState } from 'react'
import { Braces, Check, CircleStop, Copy, FileJson, MessageSquareText, Route, Wrench } from 'lucide-react'
import { Badge, Button } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { agentToolNameLabel } from '@/lib/agentToolDisplay'
import { toolApprovalLabel } from '@/lib/agentRunUi'
import { localAgentApprovalRiskText } from '@/components/agent/localRuntime'
import type { ChatContextDiagnostic, ChatContextDiagnosticTool } from '@/store/agentStore'

export function ContextDiagnosticCard({ diagnostic }: { diagnostic: ChatContextDiagnostic }) {
  const [copied, setCopied] = useState(false)
  const totalChars = diagnostic.promptStats?.totalChars ?? diagnostic.messages.reduce((sum, message) => sum + message.content.length, 0)
  const availableTools = diagnostic.tools.available
  const blockedTools = diagnostic.tools.blocked
  const modelTools = diagnostic.tools.modelTools
  const focusPart = diagnostic.debugParts.find((part) => part.id === 'context.summary')

  function copyJSON() {
    navigator.clipboard.writeText(safeJSONStringify(diagnostic))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mt-1 space-y-2 rounded-md border border-border bg-background/70 p-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <MessageSquareText size={13} />
            <span>运行上下文</span>
            <Badge variant="outline" className="text-[9px] leading-4 px-1.5 py-0">
              /context
            </Badge>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            本地诊断快照；不会发起模型网关调用。
          </p>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={copyJSON}
          aria-label="复制上下文诊断 JSON"
          title="复制上下文诊断 JSON"
          className="shrink-0"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <DiagnosticSummaryItem label="消息" value={String(diagnostic.messages.length)} />
        <DiagnosticSummaryItem label="模型工具" value={String(modelTools.length)} />
        <DiagnosticSummaryItem label="可用工具" value={String(availableTools.length)} />
        <DiagnosticSummaryItem label="字符" value={String(totalChars)} />
      </div>

      {focusPart && (
        <details className="rounded-md border border-border bg-background/70" open>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
            <Route size={10} />
            页面焦点
          </summary>
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words border-t border-border px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {focusPart.content}
          </pre>
        </details>
      )}

      <details className="rounded-md border border-border bg-background/70" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
          <span className="inline-flex items-center gap-1.5"><Wrench size={10} /> 随模型请求发送的工具</span>
          <span className="text-[9px] text-muted-foreground">{modelTools.length}</span>
        </summary>
        <div className="max-h-72 space-y-1.5 overflow-y-auto border-t border-border p-1.5">
          {modelTools.length === 0 ? (
            <p className="px-1 text-[10px] text-muted-foreground">没有随请求发送可调用工具。</p>
          ) : modelTools.map((tool) => {
            const details = availableTools.find((candidate) => candidate.name === tool.name)
            return <ContextDiagnosticToolRow key={tool.name} tool={details ?? tool} parameters={tool.parameters} />
          })}
        </div>
      </details>

      {blockedTools.length > 0 && (
        <details className="rounded-md border border-border bg-background/70">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
            <span className="inline-flex items-center gap-1.5"><CircleStop size={10} /> 被阻止的工具</span>
            <span className="text-[9px] text-muted-foreground">{blockedTools.length}</span>
          </summary>
          <div className="max-h-56 space-y-1.5 overflow-y-auto border-t border-border p-1.5">
            {blockedTools.map((tool) => <ContextDiagnosticToolRow key={tool.name} tool={tool} />)}
          </div>
        </details>
      )}

      <details className="rounded-md border border-border bg-background/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
          <span className="inline-flex items-center gap-1.5"><FileJson size={10} /> 上下文片段</span>
          <span className="text-[9px] text-muted-foreground">{diagnostic.debugParts.length}</span>
        </summary>
        <div className="space-y-1.5 border-t border-border p-1.5">
          {diagnostic.debugParts.map((part) => (
            <div key={part.id} className="rounded border border-border/70 bg-muted/20">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Badge variant="outline" className="text-[8px] leading-3 px-1 py-0">{part.kind}</Badge>
                  <span className="truncate text-[10px] font-medium text-foreground">{part.title}</span>
                </div>
                <span className="shrink-0 text-[9px] text-muted-foreground">{part.content.length}</span>
              </div>
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {part.content}
              </pre>
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-md border border-border bg-background/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-medium text-foreground marker:hidden">
          <span className="inline-flex items-center gap-1.5"><Braces size={10} /> 模型请求消息</span>
          <span className="text-[9px] text-muted-foreground">{diagnostic.messages.length}</span>
        </summary>
        <div className="space-y-1.5 border-t border-border p-1.5">
          {diagnostic.messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className="rounded border border-border/70 bg-muted/20">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1">
                <Badge variant="outline" className="text-[8px] leading-3 px-1 py-0">{message.role}</Badge>
                <span className="text-[9px] text-muted-foreground">{message.content.length}</span>
              </div>
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 text-[10px] leading-relaxed text-foreground">
                {message.content}
              </pre>
            </div>
          ))}
        </div>
      </details>

      {diagnostic.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
          {diagnostic.warnings.map((warning) => <div key={warning}>- {warning}</div>)}
        </div>
      )}
    </div>
  )
}

function ContextDiagnosticToolRow({ tool, parameters }: { tool: ChatContextDiagnosticTool | { name: string; description?: string }; parameters?: unknown }) {
  const { t } = useTranslation()
  const schema = parameters ?? ('inputSchema' in tool ? tool.inputSchema : undefined)
  return (
    <div className="rounded border border-border/70 bg-background px-2 py-1.5 text-[10px]">
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate font-medium text-foreground" title={tool.name}>{agentToolNameLabel(tool.name, t)}</span>
        {'risk' in tool && tool.risk && <Badge variant="outline" className="text-[8px] leading-3 px-1 py-0">{localAgentApprovalRiskText(tool.risk, t)}</Badge>}
        {'approval' in tool && tool.approval && <Badge variant="secondary" className="text-[8px] leading-3 px-1 py-0">{toolApprovalLabel(tool.approval)}</Badge>}
        {'unavailableReason' in tool && tool.unavailableReason && <Badge variant="warning" className="text-[8px] leading-3 px-1 py-0">{tool.unavailableReason}</Badge>}
      </div>
      {tool.description && <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">{tool.description}</p>}
      {schema !== undefined && (
        <details className="mt-1 rounded border border-border/60 bg-muted/20">
          <summary className="cursor-pointer list-none px-1.5 py-1 text-[9px] text-muted-foreground marker:hidden">参数结构</summary>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words border-t border-border/60 px-1.5 py-1 text-[9px] text-muted-foreground">
            {safeJSONStringify(schema)}
          </pre>
        </details>
      )}
    </div>
  )
}

function DiagnosticSummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="mt-0.5 truncate text-[11px] font-medium text-foreground">{value}</div>
    </div>
  )
}

function safeJSONStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}
