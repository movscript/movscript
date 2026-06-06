import { useMemo, useState } from 'react'
import {
  AgentChatContentStack,
  AgentChatMessage,
  AgentMessageSection,
  Button,
} from '@movscript/ui'
import type { AgentChatServerRequest, AgentChatServerRequestResponse } from '@/features/agent/domain/agentChatProtocol'
import {
  agentChatAnswerResponse,
  agentChatElicitationResponse,
  agentChatServerRequestView,
  agentChatToolResultResponse,
} from '@/features/agent/domain/agentChatServerRequests'
import {
  agentChatElicitationContent,
  agentChatElicitationFieldValueIsValid,
  agentChatElicitationFormModel,
  agentChatElicitationInputType,
  agentChatInputAnswerText,
  agentChatInputAnswerValues,
  agentChatInputRequestAnswerPayload,
  agentChatInputRequestFormCanSubmit,
  agentChatInputRequestFormModel,
  agentChatToolResultContentItems,
  nextAgentChatInputAnswerValues,
  type AgentChatElicitationField,
  type AgentChatElicitationValue,
  type AgentChatInputAnswerDraft,
} from '@/features/agent/domain/agentChatServerRequestForms'
import {
  AgentChatInlineList,
  AgentChatPreviewBlock,
  AgentChatSectionTitle,
} from '@/features/agent/components/agent-chat-items/AgentChatThreadItemBlocks'

export function AgentChatServerRequestCard({
  request,
  onApprove,
  onApproveForSession,
  onApproveWithExecPolicyAmendment,
  onApproveWithNetworkPolicyAmendment,
  onApproveWithStrictAutoReview,
  onAnswer,
  onCancel,
  onReject,
}: {
  request: AgentChatServerRequest
  onApprove: () => void
  onApproveForSession?: () => void
  onApproveWithExecPolicyAmendment?: () => void
  onApproveWithNetworkPolicyAmendment?: (amendmentIndex: number) => void
  onApproveWithStrictAutoReview?: () => void
  onAnswer?: (response: AgentChatServerRequestResponse) => void
  onCancel?: () => void
  onReject: () => void
}) {
  const view = agentChatServerRequestView(request)
  const allowOptions = [
    view.canApproveForSession ? {
      key: 'session',
      label: 'Allow for session',
      onClick: onApproveForSession ?? onApprove,
    } : null,
    view.canApproveWithExecPolicyAmendment ? {
      key: 'exec-policy',
      label: 'Allow similar command',
      onClick: onApproveWithExecPolicyAmendment ?? onApprove,
    } : null,
    ...view.networkPolicyAmendments.map((_, amendmentIndex) => ({
      key: `network-policy:${amendmentIndex}`,
      label: `Allow network policy ${amendmentIndex + 1}`,
      onClick: () => onApproveWithNetworkPolicyAmendment?.(amendmentIndex),
    })),
    view.canApproveWithStrictAutoReview ? {
      key: 'strict-review',
      label: 'Allow with strict review',
      onClick: onApproveWithStrictAutoReview ?? onApprove,
    } : null,
  ].filter((option): option is { key: string; label: string; onClick: () => void } => Boolean(option))
  return (
    <AgentChatMessage
      role="system"
      avatar="!"
      data-testid="agent-chat-server-request"
      actions={(
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {view.canReject ? (
            <Button type="button" size="sm" variant="ghost" onClick={onReject}>
              Reject
            </Button>
          ) : null}
          {view.canCancel ? (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel ?? onReject}>
              Cancel
            </Button>
          ) : null}
          {view.canAnswer || view.canElicit || view.canSubmitToolResult ? null : (
            <>
              {allowOptions.length > 0 ? (
                <details className="group relative">
                  <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&::-webkit-details-marker]:hidden">
                    More allow options
                  </summary>
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-1 grid min-w-48 gap-1 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                  >
                    {allowOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        role="menuitem"
                        className="rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onClick={option.onClick}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
              <Button type="button" size="sm" onClick={onApprove} disabled={!view.canApprove}>
                {view.canApprove ? 'Allow once' : 'Approve'}
              </Button>
            </>
          )}
        </div>
      )}
    >
      <AgentMessageSection
        title={<AgentChatSectionTitle title={view.title} meta={view.meta} />}
        tone="diagnostic"
      >
        <AgentChatContentStack>
          {view.summary.length > 0 ? <AgentChatInlineList label="Summary" values={view.summary} /> : null}
          {view.argumentDetails !== undefined ? <AgentChatPreviewBlock label="Arguments" value={view.argumentDetails} contentKind="arguments" /> : null}
          {view.canAnswer ? (
            <AgentChatServerRequestAnswerForm
              request={request}
              onAnswer={(response) => onAnswer?.(response)}
            />
          ) : null}
          {view.canElicit ? (
            <AgentChatServerRequestElicitationForm
              request={request}
              onAnswer={(response) => onAnswer?.(response)}
            />
          ) : null}
          {view.canSubmitToolResult ? (
            <AgentChatServerRequestToolResultForm
              request={request}
              onAnswer={(response) => onAnswer?.(response)}
            />
          ) : null}
          {view.externalUrl ? (
            <a
              href={view.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 w-fit items-center rounded border border-border bg-background px-3 text-sm text-foreground transition-colors hover:border-ring hover:bg-accent"
            >
              Open URL
            </a>
          ) : null}
          <AgentChatPreviewBlock label="Request details" value={view.requestDetails} contentKind="rawDetails" tone="process" />
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}

function AgentChatServerRequestToolResultForm({
  request,
  onAnswer,
}: {
  request: AgentChatServerRequest
  onAnswer: (response: AgentChatServerRequestResponse) => void
}) {
  const [success, setSuccess] = useState(true)
  const [text, setText] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [audioMimeType, setAudioMimeType] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoMimeType, setVideoMimeType] = useState('')
  const [resourceName, setResourceName] = useState('')
  const [resourceUri, setResourceUri] = useState('')
  const [resourceUrl, setResourceUrl] = useState('')
  const [resourceMimeType, setResourceMimeType] = useState('')
  return (
    <div className="space-y-3 rounded border border-border/70 bg-background/70 p-3" data-testid="agent-chat-server-request-tool-result-form">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={success} onChange={(event) => setSuccess(event.target.checked)} />
        <span>Tool call succeeded</span>
      </label>
      <div className="space-y-2">
        <div className="text-sm font-medium">Text output</div>
        <textarea
          className="min-h-20 w-full rounded border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Image URL</div>
        <input
          className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          type="url"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Audio URL</div>
        <input
          className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          type="url"
          value={audioUrl}
          onChange={(event) => setAudioUrl(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Audio MIME type</div>
        <input
          className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          type="text"
          value={audioMimeType}
          onChange={(event) => setAudioMimeType(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Video URL</div>
        <input
          className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          type="url"
          value={videoUrl}
          onChange={(event) => setVideoUrl(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Video MIME type</div>
        <input
          className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          type="text"
          value={videoMimeType}
          onChange={(event) => setVideoMimeType(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Resource name</div>
        <input
          className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          type="text"
          value={resourceName}
          onChange={(event) => setResourceName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Resource URI</div>
        <input
          className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          type="text"
          value={resourceUri}
          onChange={(event) => setResourceUri(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Resource URL</div>
        <input
          className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          type="url"
          value={resourceUrl}
          onChange={(event) => setResourceUrl(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Resource MIME type</div>
        <input
          className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          type="text"
          value={resourceMimeType}
          onChange={(event) => setResourceMimeType(event.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={() => onAnswer(agentChatToolResultResponse(request, {
            success,
            contentItems: agentChatToolResultContentItems({ text, imageUrl, audioUrl, audioMimeType, videoUrl, videoMimeType, resourceName, resourceUri, resourceUrl, resourceMimeType }),
          }))}
        >
          Submit result
        </Button>
      </div>
    </div>
  )
}

function AgentChatServerRequestElicitationForm({
  request,
  onAnswer,
}: {
  request: AgentChatServerRequest
  onAnswer: (response: AgentChatServerRequestResponse) => void
}) {
  const model = useMemo(() => agentChatElicitationFormModel(request), [request])
  const [values, setValues] = useState<Record<string, AgentChatElicitationValue>>(() => Object.fromEntries(model.fields.map((field) => [field.name, field.defaultValue])))
  const canSubmit = model.fields.every((field) => agentChatElicitationFieldValueIsValid(field, values[field.name]))

  return (
    <div className="space-y-3 rounded border border-border/70 bg-background/70 p-3" data-testid="agent-chat-server-request-elicitation-form">
      {model.message ? <div className="text-sm text-muted-foreground">{model.message}</div> : null}
      {model.fields.map((field) => (
        <div key={field.name} className="space-y-2">
          <div className="text-sm font-medium">
            {field.title || field.name}
            {field.required ? <span className="ml-1 text-destructive">*</span> : null}
          </div>
          {field.description ? <div className="text-xs text-muted-foreground">{field.description}</div> : null}
          <ElicitationFieldControl
            field={field}
            value={values[field.name]}
            onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
          />
        </div>
      ))}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!canSubmit}
          onClick={() => onAnswer(agentChatElicitationResponse(request, {
            accepted: true,
            content: agentChatElicitationContent(model, values),
            meta: model.meta,
          }))}
        >
          Submit
        </Button>
      </div>
    </div>
  )
}

function ElicitationFieldControl({
  field,
  value,
  onChange,
}: {
  field: AgentChatElicitationField
  value: AgentChatElicitationValue
  onChange: (value: AgentChatElicitationValue) => void
}) {
  if (field.kind === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        <span>{field.title || field.name}</span>
      </label>
    )
  }
  if (field.kind === 'single-select') {
    return (
      <div className="grid gap-2">
        {field.options.map((option) => (
          <label key={`${field.name}:${option.value}`} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name={`${field.name}:elicitation`}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    )
  }
  if (field.kind === 'multi-select') {
    const selected = Array.isArray(value) ? value : []
    const maxSelected = typeof field.maxItems === 'number' && selected.length >= field.maxItems
    return (
      <div className="grid gap-2">
        {field.options.map((option) => (
          <label key={`${field.name}:${option.value}`} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              value={option.value}
              checked={selected.includes(option.value)}
              disabled={!selected.includes(option.value) && maxSelected}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...selected, option.value]
                  : selected.filter((item) => item !== option.value)
                onChange(next)
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    )
  }
  return (
    <input
      className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus:border-ring"
      type={agentChatElicitationInputType(field)}
      value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
      min={typeof field.minimum === 'number' ? field.minimum : undefined}
      max={typeof field.maximum === 'number' ? field.maximum : undefined}
      minLength={typeof field.minLength === 'number' ? field.minLength : undefined}
      maxLength={typeof field.maxLength === 'number' ? field.maxLength : undefined}
      onChange={(event) => onChange(field.kind === 'number' || field.kind === 'integer' ? event.target.value : event.target.value)}
    />
  )
}

function AgentChatServerRequestAnswerForm({
  request,
  onAnswer,
}: {
  request: AgentChatServerRequest
  onAnswer: (response: AgentChatServerRequestResponse) => void
}) {
  const model = useMemo(() => agentChatInputRequestFormModel(request), [request])
  const [answers, setAnswers] = useState<Record<string, AgentChatInputAnswerDraft>>({})
  const [text, setText] = useState('')
  const canSubmit = agentChatInputRequestFormCanSubmit(model, answers, text)

  return (
    <div className="space-y-3 rounded border border-border/70 bg-background/70 p-3" data-testid="agent-chat-server-request-answer-form">
      {model.kind === 'question-form' ? (
        model.questions.map((question) => (
          <div key={question.id} className="space-y-2">
            <div className="text-sm font-medium">{question.header || question.question}</div>
            {question.header && question.question ? <div className="text-sm text-muted-foreground">{question.question}</div> : null}
            {question.options.length > 0 ? (
              <div className="grid gap-2">
                {question.options.map((option) => (
                  <label key={`${question.id}:${option.value}`} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`${request.id}:${question.id}`}
                      value={option.value}
                      checked={agentChatInputAnswerValues(answers[question.id]).includes(option.value)}
                      onChange={(event) => setAnswers((current) => ({
                        ...current,
                        [question.id]: nextAgentChatInputAnswerValues(current[question.id], option.value, event.target.checked),
                      }))}
                    />
                    <span>
                      <span className="block">{option.label}</span>
                      {option.description ? <span className="block text-xs text-muted-foreground">{option.description}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <input
                className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                type={question.isSecret ? 'password' : 'text'}
                value={agentChatInputAnswerText(answers[question.id])}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
              />
            )}
          </div>
        ))
      ) : (
        <div className="space-y-2">
          <div className="text-sm font-medium">{model.title}</div>
          {model.question ? <div className="text-sm text-muted-foreground">{model.question}</div> : null}
          {model.choices.length > 0 ? (
            <div className="grid gap-2">
              {model.choices.map((choice) => (
                <label key={choice.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${request.id}:choice`}
                    value={choice.id}
                    checked={agentChatInputAnswerText(answers[model.id]) === choice.id}
                    onChange={() => setAnswers({ [model.id]: choice.id })}
                  />
                  <span>
                    <span className="block">{choice.label}</span>
                    {choice.description ? <span className="block text-xs text-muted-foreground">{choice.description}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          {(model.inputType === 'text' || model.allowCustomAnswer) ? (
            <textarea
              className="min-h-20 w-full rounded border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          ) : null}
        </div>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!canSubmit}
          onClick={() => onAnswer(agentChatAnswerResponse(request, agentChatInputRequestAnswerPayload(model, answers, text)))}
        >
          Submit
        </Button>
      </div>
    </div>
  )
}
