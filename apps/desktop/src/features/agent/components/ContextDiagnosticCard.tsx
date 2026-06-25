import { useState } from 'react'
import { Braces, Check, CircleStop, Copy, FileJson, MessageSquareText, Route, Wrench } from 'lucide-react'
import {
  AgentDiagnosticActionButton,
  AgentDiagnosticBadge,
  AgentDiagnosticCard,
  AgentDiagnosticCodeBlock,
  AgentDiagnosticDescription,
  AgentDiagnosticDisclosure,
  AgentDiagnosticEntry,
  AgentDiagnosticEntryHeader,
  AgentDiagnosticEntryMeta,
  AgentDiagnosticEntryTitle,
  AgentDiagnosticHeader,
  AgentDiagnosticHeaderBody,
  AgentDiagnosticStatusBadge,
  AgentDiagnosticSummaryGrid,
  AgentDiagnosticSummaryItem,
  AgentDiagnosticTitle,
  AgentDiagnosticToolHeader,
  AgentDiagnosticToolItem,
  AgentDiagnosticToolName,
  AgentDiagnosticToolText,
  AgentDiagnosticWarnings
} from '@movscript/ui/business/agent'
import { useTranslation } from 'react-i18next'
import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { toolApprovalLabel } from '@/features/agent/domain/agentRunUi'
import { providerSessionApprovalRiskText } from '@/features/agent/components/providerSessionInteractions'
import { agentSeverityStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import type { ChatContextDiagnostic, ChatContextDiagnosticTool } from '@/features/agent/state/agentStore'

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
    <AgentDiagnosticCard>
      <AgentDiagnosticHeader>
        <AgentDiagnosticHeaderBody>
          <AgentDiagnosticTitle>
            <MessageSquareText size={14} />
            <span>运行上下文</span>
            <AgentDiagnosticBadge>
              /context
            </AgentDiagnosticBadge>
          </AgentDiagnosticTitle>
          <AgentDiagnosticDescription>
            本地诊断快照；不会发起模型网关调用。
          </AgentDiagnosticDescription>
        </AgentDiagnosticHeaderBody>
        <AgentDiagnosticActionButton
          type="button"
          onClick={copyJSON}
          aria-label="复制上下文诊断 JSON"
          title="复制上下文诊断 JSON"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </AgentDiagnosticActionButton>
      </AgentDiagnosticHeader>

      <AgentDiagnosticSummaryGrid>
        <AgentDiagnosticSummaryItem label="消息" value={String(diagnostic.messages.length)} />
        <AgentDiagnosticSummaryItem label="模型工具" value={String(modelTools.length)} />
        <AgentDiagnosticSummaryItem label="可用工具" value={String(availableTools.length)} />
        <AgentDiagnosticSummaryItem label="字符" value={String(totalChars)} />
      </AgentDiagnosticSummaryGrid>

      {focusPart && (
        <AgentDiagnosticDisclosure open title="页面焦点" icon={<Route size={10} />}>
          <AgentDiagnosticCodeBlock size="lg">
            {focusPart.content}
          </AgentDiagnosticCodeBlock>
        </AgentDiagnosticDisclosure>
      )}

      <AgentDiagnosticDisclosure open title="随模型请求发送的工具" icon={<Wrench size={10} />} count={modelTools.length} contentScroll="lg">
          {modelTools.length === 0 ? (
            <AgentDiagnosticDescription>没有随请求发送可调用工具。</AgentDiagnosticDescription>
          ) : modelTools.map((tool) => {
            const details = availableTools.find((candidate) => candidate.name === tool.name)
            return <ContextDiagnosticToolRow key={tool.name} tool={details ?? tool} parameters={tool.parameters} />
          })}
      </AgentDiagnosticDisclosure>

      {blockedTools.length > 0 && (
        <AgentDiagnosticDisclosure title="被阻止的工具" icon={<CircleStop size={10} />} count={blockedTools.length} contentScroll="md">
            {blockedTools.map((tool) => <ContextDiagnosticToolRow key={tool.name} tool={tool} />)}
        </AgentDiagnosticDisclosure>
      )}

      <AgentDiagnosticDisclosure title="上下文片段" icon={<FileJson size={10} />} count={diagnostic.debugParts.length}>
          {diagnostic.debugParts.map((part) => (
            <AgentDiagnosticEntry key={part.id}>
              <AgentDiagnosticEntryHeader>
                <AgentDiagnosticBadge>{part.kind}</AgentDiagnosticBadge>
                <AgentDiagnosticEntryTitle>{part.title}</AgentDiagnosticEntryTitle>
                <AgentDiagnosticEntryMeta>{part.content.length}</AgentDiagnosticEntryMeta>
              </AgentDiagnosticEntryHeader>
              <AgentDiagnosticCodeBlock size="sm">
                {part.content}
              </AgentDiagnosticCodeBlock>
            </AgentDiagnosticEntry>
          ))}
      </AgentDiagnosticDisclosure>

      <AgentDiagnosticDisclosure title="模型请求消息" icon={<Braces size={10} />} count={diagnostic.messages.length}>
          {diagnostic.messages.map((message, index) => (
            <AgentDiagnosticEntry key={`${message.role}-${index}`}>
              <AgentDiagnosticEntryHeader>
                <AgentDiagnosticBadge>{message.role}</AgentDiagnosticBadge>
                <AgentDiagnosticEntryMeta>{message.content.length}</AgentDiagnosticEntryMeta>
              </AgentDiagnosticEntryHeader>
              <AgentDiagnosticCodeBlock size="md" tone="default">
                {message.content}
              </AgentDiagnosticCodeBlock>
            </AgentDiagnosticEntry>
          ))}
      </AgentDiagnosticDisclosure>

      {diagnostic.warnings.length > 0 && (
        <AgentDiagnosticWarnings>
          {diagnostic.warnings.map((warning) => <div key={warning}>- {warning}</div>)}
        </AgentDiagnosticWarnings>
      )}
    </AgentDiagnosticCard>
  )
}

function ContextDiagnosticToolRow({ tool, parameters }: { tool: ChatContextDiagnosticTool | { name: string; description?: string }; parameters?: unknown }) {
  const { t } = useTranslation()
  const schema = parameters ?? ('inputSchema' in tool ? tool.inputSchema : undefined)
  const resolution = 'resolution' in tool ? tool.resolution : undefined
  return (
    <AgentDiagnosticToolItem>
      <AgentDiagnosticToolHeader>
        <AgentDiagnosticToolName title={tool.name}>{agentToolNameLabel(tool.name, t)}</AgentDiagnosticToolName>
        {'risk' in tool && tool.risk && <AgentDiagnosticBadge>{providerSessionApprovalRiskText(tool.risk, t)}</AgentDiagnosticBadge>}
        {'approval' in tool && tool.approval && <AgentDiagnosticBadge variant="soft">{toolApprovalLabel(tool.approval)}</AgentDiagnosticBadge>}
        {'unavailableReason' in tool && tool.unavailableReason && (
          <AgentDiagnosticStatusBadge intent={agentSeverityStatusRecipe('warning').intent} emphasis={agentSeverityStatusRecipe('warning').emphasis}>
            {tool.unavailableReason}
          </AgentDiagnosticStatusBadge>
        )}
      </AgentDiagnosticToolHeader>
      {tool.description && <AgentDiagnosticToolText>{tool.description}</AgentDiagnosticToolText>}
      {resolution && (
        <AgentDiagnosticToolText>
          {contextToolResolutionLabel(resolution)}
        </AgentDiagnosticToolText>
      )}
      {schema !== undefined && (
        <AgentDiagnosticDisclosure title="参数结构">
          <AgentDiagnosticCodeBlock size="sm">
            {safeJSONStringify(schema)}
          </AgentDiagnosticCodeBlock>
        </AgentDiagnosticDisclosure>
      )}
    </AgentDiagnosticToolItem>
  )
}

function contextToolResolutionLabel(resolution: NonNullable<ChatContextDiagnosticTool['resolution']>) {
  return [
    `授权: ${resolution.authorized ? '是' : '否'}`,
    `可见: ${resolution.visible ? '是' : '否'}`,
    `来源: ${resolution.grantSource}`,
    `激活技能: ${resolution.activeSkillIds.length}`,
    resolution.reason ? `原因: ${resolution.reason}` : undefined,
  ].filter(Boolean).join(' · ')
}

function safeJSONStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}
