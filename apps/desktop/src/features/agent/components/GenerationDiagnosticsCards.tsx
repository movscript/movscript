import { AlertCircle, Wand2 } from 'lucide-react'
import type { ChatGenerationParamAudit, ChatGenerationValidationError } from '@/features/agent/state/agentStore'
import { agentReadinessStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import {
  AgentGeneratedCard,
  AgentGeneratedCardHeader,
  AgentGeneratedCountBadge,
  AgentGeneratedHeaderCopy,
  AgentGeneratedIconSlot,
  AgentGeneratedIntentText,
  AgentGeneratedItem,
  AgentGeneratedItemDetail,
  AgentGeneratedItemHeader,
  AgentGeneratedItemMeta,
  AgentGeneratedItemTitle,
  AgentGeneratedStack,
  AgentGeneratedStat,
  AgentGeneratedStatusBadge,
  AgentGeneratedTitle,
} from '@/features/agent/components/GenerationCardUi'

export function GenerationParamAuditCard({ audits }: { audits?: ChatGenerationParamAudit[] }) {
  if (!audits?.length) return null
  return (
    <AgentGeneratedCard data-testid="agent-generation-param-audit">
      <AgentGeneratedCardHeader>
        <AgentGeneratedHeaderCopy>
          <AgentGeneratedIconSlot intent="info">
            <Wand2 size={12} />
          </AgentGeneratedIconSlot>
          <AgentGeneratedTitle>参数校验</AgentGeneratedTitle>
        </AgentGeneratedHeaderCopy>
        <AgentGeneratedCountBadge>{audits.length} 次提交</AgentGeneratedCountBadge>
      </AgentGeneratedCardHeader>
      <AgentGeneratedStack>
        {audits.map((audit, index) => {
          const droppedCount = audit.droppedExtraParams.length + audit.droppedTopLevelParams.length
          const auditRecipe = agentReadinessStatusRecipe(droppedCount === 0)
          return (
            <AgentGeneratedItem key={audit.stepId ?? `audit-${index}`}>
              <AgentGeneratedItemHeader>
                <AgentGeneratedItemTitle>
                  {audit.jobId !== undefined ? `Job #${audit.jobId}` : `生成提交 ${index + 1}`}
                </AgentGeneratedItemTitle>
                <AgentGeneratedStatusBadge intent={auditRecipe.intent} emphasis={auditRecipe.emphasis}>
                  {droppedCount > 0 ? `过滤 ${droppedCount}` : '已匹配'}
                </AgentGeneratedStatusBadge>
              </AgentGeneratedItemHeader>
              <AgentGeneratedItemMeta>
                模型合约：{audit.modelContractLoaded ? '已加载' : '未加载'}
                {audit.supportedParams.length > 0 ? ` · ${audit.supportedParams.length} 个参数` : ''}
                {audit.paramsSchemaLoaded ? ` · schema${audit.paramsSchemaRuleCount !== undefined ? ` ${audit.paramsSchemaRuleCount} 条规则` : ''}` : ''}
              </AgentGeneratedItemMeta>
              {audit.inputRequirements && (
                <AgentGeneratedItemDetail>
                  输入需求：图片 {formatInputRequirement(audit.inputRequirements.image)} · 视频 {formatInputRequirement(audit.inputRequirements.video)}
                  {audit.submittedInputs ? ` · 已提交 图片 ${audit.submittedInputs.image}/视频 ${audit.submittedInputs.video}` : ''}
                </AgentGeneratedItemDetail>
              )}
              {audit.submittedExtraParams.length > 0 && (
                <AgentGeneratedItemDetail>
                  提交：{audit.submittedExtraParams.join('、')}
                </AgentGeneratedItemDetail>
              )}
              {audit.droppedExtraParams.length > 0 && (
                <AgentGeneratedIntentText as="p" intent="warning">
                  过滤 extra_params：{audit.droppedExtraParams.map((key) => formatDroppedParam(key, audit.dropReasons)).join('、')}
                </AgentGeneratedIntentText>
              )}
              {audit.droppedTopLevelParams.length > 0 && (
                <AgentGeneratedIntentText as="p" intent="warning">
                  过滤顶层参数：{audit.droppedTopLevelParams.map((key) => formatDroppedParam(key, audit.dropReasons)).join('、')}
                </AgentGeneratedIntentText>
              )}
              {audit.renamedExtraParams && Object.keys(audit.renamedExtraParams).length > 0 && (
                <AgentGeneratedItemDetail>
                  参数别名：{formatRenamedParams(audit.renamedExtraParams)}
                </AgentGeneratedItemDetail>
              )}
              {audit.extraParamsParseError && (
                <AgentGeneratedIntentText as="p" intent="danger">
                  extra_params 解析失败：{audit.extraParamsParseError}
                </AgentGeneratedIntentText>
              )}
              {audit.preflightErrors && audit.preflightErrors.length > 0 && (
                <AgentGeneratedIntentText as="p" intent="warning">
                  本地预检：{audit.preflightErrors.map(formatPreflightError).join('、')}
                </AgentGeneratedIntentText>
              )}
              {audit.inputPreflightErrors && audit.inputPreflightErrors.length > 0 && (
                <AgentGeneratedIntentText as="p" intent="warning">
                  输入预检：{audit.inputPreflightErrors.map(formatInputPreflightError).join('、')}
                </AgentGeneratedIntentText>
              )}
              {audit.repairNote && (
                <AgentGeneratedIntentText as="p" intent="success">
                  自动修复：{audit.repairNote}
                </AgentGeneratedIntentText>
              )}
            </AgentGeneratedItem>
          )
        })}
      </AgentGeneratedStack>
    </AgentGeneratedCard>
  )
}

export function GenerationValidationErrorCard({ errors }: { errors?: ChatGenerationValidationError[] }) {
  if (!errors?.length) return null
  return (
    <AgentGeneratedCard data-testid="agent-generation-validation-errors">
      <AgentGeneratedCardHeader>
        <AgentGeneratedHeaderCopy>
          <AgentGeneratedIconSlot>
            <AlertCircle size={12} />
          </AgentGeneratedIconSlot>
          <AgentGeneratedTitle>生成校验失败</AgentGeneratedTitle>
        </AgentGeneratedHeaderCopy>
        <AgentGeneratedStat intent="danger">{errors.length} 个错误</AgentGeneratedStat>
      </AgentGeneratedCardHeader>
      <AgentGeneratedStack>
        {errors.map((error, index) => (
          <AgentGeneratedItem key={error.stepId ?? `generation-error-${index}`} intent="danger">
            <AgentGeneratedItemTitle>
              {error.field ? `${error.field} · ` : ''}{error.code}
            </AgentGeneratedItemTitle>
            <AgentGeneratedItemDetail>{error.message}</AgentGeneratedItemDetail>
            {error.allowedValues && error.allowedValues.length > 0 && (
              <AgentGeneratedItemDetail>
                允许值：{error.allowedValues.join('、')}
              </AgentGeneratedItemDetail>
            )}
            {error.requiredMin !== undefined && error.allowedMax !== undefined && error.actualCount !== undefined && (
              <AgentGeneratedItemDetail>
                输入数量：{error.actualCount}，要求 {error.requiredMin}-{error.allowedMax === -1 ? '不限' : error.allowedMax}
              </AgentGeneratedItemDetail>
            )}
            {error.suggestedFix && (
              <AgentGeneratedIntentText as="p" intent="warning">
                建议：{formatSuggestedFix(error.suggestedFix).replace(/^，建议 /, '')}
              </AgentGeneratedIntentText>
            )}
          </AgentGeneratedItem>
        ))}
      </AgentGeneratedStack>
    </AgentGeneratedCard>
  )
}

function formatDroppedParam(key: string, reasons?: Record<string, string>): string {
  const reason = reasons?.[key]
  if (!reason) return key
  return `${key} (${formatDropReason(reason)})`
}

function formatDropReason(reason: string): string {
  switch (reason) {
    case 'unsupported_extra_param':
      return '不支持'
    case 'unsupported_top_level_param':
      return '模型不支持'
    case 'parse_error':
      return '解析失败'
    default:
      return reason
  }
}

function formatRenamedParams(values: Record<string, string>): string {
  return Object.entries(values).map(([from, to]) => `${from} -> ${to}`).join('、')
}

function formatInputRequirement(value: { min: number, max: number }): string {
  return `${value.min}-${value.max === -1 ? '不限' : value.max}`
}

function formatPreflightError(error: NonNullable<ChatGenerationParamAudit['preflightErrors']>[number]): string {
  const allowed = error.allowedValues?.length ? `，允许 ${error.allowedValues.join('/')}` : ''
  const suggested = formatSuggestedFix(error.suggestedFix)
  return `${error.field} (${error.code}${allowed}${suggested})`
}

function formatInputPreflightError(error: NonNullable<ChatGenerationParamAudit['inputPreflightErrors']>[number]): string {
  const label = error.field === 'image' ? '图片' : '视频'
  const max = error.allowedMax === -1 ? '不限' : String(error.allowedMax)
  return `${label} ${error.actualCount} 个 (要求 ${error.requiredMin}-${max})`
}

function formatSuggestedFix(value?: Record<string, unknown>): string {
  if (!value) return ''
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string | number | boolean | null] => (
      entry[0].trim().length > 0 && isReadableSuggestedFixValue(entry[1])
    ))
    .sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) return ''
  return `，建议 ${entries.map(([key, fixValue]) => fixValue === null ? `删除 ${key}` : `${key}=${String(fixValue)}`).join('/')}`
}

function isReadableSuggestedFixValue(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}
