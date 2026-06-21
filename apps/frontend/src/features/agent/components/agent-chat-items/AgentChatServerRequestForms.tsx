import { useMemo, useState } from 'react'
import { Button } from '@movscript/ui/primitives'
import {
  agentChatAnswerResponse,
  agentChatElicitationContent,
  agentChatElicitationFieldValueIsValid,
  agentChatElicitationFormModel,
  agentChatElicitationInputType,
  agentChatElicitationResponse,
  agentChatInputAnswerText,
  agentChatInputAnswerValues,
  agentChatInputRequestAnswerPayload,
  agentChatInputRequestFormCanSubmit,
  agentChatInputRequestFormModel,
  agentChatMovScriptDecisionResponse,
  agentChatToolResultContentItems,
  agentChatToolResultResponse,
  nextAgentChatInputAnswerValues,
  type AgentChatElicitationField,
  type AgentChatElicitationValue,
  type AgentChatInputAnswerDraft,
  type AgentChatServerRequest,
  type AgentChatServerRequestResponse,
  type MovScriptAgentDecision,
} from '@movscript/core/agent/chat'

export function AgentChatMovScriptDecisionForm({
  request,
  onAnswer,
}: {
  request: AgentChatServerRequest
  onAnswer: (response: AgentChatServerRequestResponse) => void
}) {
  const { params: rawParams } = request
  const params = isRecord(rawParams) ? rawParams : {}
  const question = stringField(params.question) ?? 'Choose how to handle this generated candidate.'
  const choices: Array<{ decision: MovScriptAgentDecision; label: string; description: string }> = [
    { decision: 'adopt', label: '采纳', description: '写入 selection，并让依赖它的下游节点继续推进。' },
    { decision: 'reject', label: '放弃', description: '标记候选不可用，不作为稳定依赖。' },
    { decision: 'defer', label: '待定', description: '保留候选，但不解除下游阻塞。' },
  ]
  return (
    <div className="agent-chat-request-form" data-testid="agent-chat-movscript-decision-form">
      <div className="agent-chat-request-field">
        <div className="agent-chat-request-label">{stringField(params.title) ?? '候选产物决策'}</div>
        <div className="agent-chat-request-help">{question}</div>
        <div className="agent-chat-request-options">
          {choices.map((choice) => (
            <button
              key={choice.decision}
              type="button"
              className="agent-chat-request-option"
              onClick={() => onAnswer(agentChatMovScriptDecisionResponse(request, choice.decision))}
            >
              <span>
                <span className="agent-chat-request-option-label">{choice.label}</span>
                <span className="agent-chat-request-option-description">{choice.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AgentChatServerRequestToolResultForm({
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
    <div className="agent-chat-request-form" data-testid="agent-chat-server-request-tool-result-form">
      <label className="agent-chat-request-check">
        <input type="checkbox" checked={success} onChange={(event) => setSuccess(event.target.checked)} />
        <span>Tool call succeeded</span>
      </label>
      <div className="agent-chat-request-field">
        <div className="agent-chat-request-label">Text output</div>
        <textarea
          className="agent-chat-request-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="agent-chat-request-field">
        <div className="agent-chat-request-label">Image URL</div>
        <input
          className="agent-chat-request-input"
          type="url"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
        />
      </div>
      <div className="agent-chat-request-field">
        <div className="agent-chat-request-label">Audio URL</div>
        <input
          className="agent-chat-request-input"
          type="url"
          value={audioUrl}
          onChange={(event) => setAudioUrl(event.target.value)}
        />
      </div>
      <div className="agent-chat-request-field">
        <div className="agent-chat-request-label">Audio MIME type</div>
        <input
          className="agent-chat-request-input"
          type="text"
          value={audioMimeType}
          onChange={(event) => setAudioMimeType(event.target.value)}
        />
      </div>
      <div className="agent-chat-request-field">
        <div className="agent-chat-request-label">Video URL</div>
        <input
          className="agent-chat-request-input"
          type="url"
          value={videoUrl}
          onChange={(event) => setVideoUrl(event.target.value)}
        />
      </div>
      <div className="agent-chat-request-field">
        <div className="agent-chat-request-label">Video MIME type</div>
        <input
          className="agent-chat-request-input"
          type="text"
          value={videoMimeType}
          onChange={(event) => setVideoMimeType(event.target.value)}
        />
      </div>
      <div className="agent-chat-request-field">
        <div className="agent-chat-request-label">Resource name</div>
        <input
          className="agent-chat-request-input"
          type="text"
          value={resourceName}
          onChange={(event) => setResourceName(event.target.value)}
        />
      </div>
      <div className="agent-chat-request-field">
        <div className="agent-chat-request-label">Resource URI</div>
        <input
          className="agent-chat-request-input"
          type="text"
          value={resourceUri}
          onChange={(event) => setResourceUri(event.target.value)}
        />
      </div>
      <div className="agent-chat-request-field">
        <div className="agent-chat-request-label">Resource URL</div>
        <input
          className="agent-chat-request-input"
          type="url"
          value={resourceUrl}
          onChange={(event) => setResourceUrl(event.target.value)}
        />
      </div>
      <div className="agent-chat-request-field">
        <div className="agent-chat-request-label">Resource MIME type</div>
        <input
          className="agent-chat-request-input"
          type="text"
          value={resourceMimeType}
          onChange={(event) => setResourceMimeType(event.target.value)}
        />
      </div>
      <div className="agent-chat-request-footer">
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

export function AgentChatServerRequestElicitationForm({
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
    <div className="agent-chat-request-form" data-testid="agent-chat-server-request-elicitation-form">
      {model.message ? <div className="agent-chat-request-help">{model.message}</div> : null}
      {model.fields.map((field) => (
        <div key={field.name} className="agent-chat-request-field">
          <div className="agent-chat-request-label">
            {field.title || field.name}
            {field.required ? <span className="agent-chat-request-required">*</span> : null}
          </div>
          {field.description ? <div className="agent-chat-request-description">{field.description}</div> : null}
          <ElicitationFieldControl
            field={field}
            value={values[field.name]}
            onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
          />
        </div>
      ))}
      <div className="agent-chat-request-footer">
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
      <label className="agent-chat-request-check">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        <span>{field.title || field.name}</span>
      </label>
    )
  }
  if (field.kind === 'single-select') {
    return (
      <div className="agent-chat-request-options">
        {field.options.map((option) => (
          <label key={`${field.name}:${option.value}`} className="agent-chat-request-option">
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
      <div className="agent-chat-request-options">
        {field.options.map((option) => (
          <label key={`${field.name}:${option.value}`} className="agent-chat-request-option">
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
      className="agent-chat-request-input"
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

export function AgentChatServerRequestAnswerForm({
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
    <div className="agent-chat-request-form" data-testid="agent-chat-server-request-answer-form">
      {model.kind === 'question-form' ? (
        model.questions.map((question) => (
          <div key={question.id} className="agent-chat-request-field">
            <div className="agent-chat-request-label">{question.header || question.question}</div>
            {question.header && question.question ? <div className="agent-chat-request-help">{question.question}</div> : null}
            {question.options.length > 0 ? (
              <div className="agent-chat-request-options">
                {question.options.map((option) => (
                  <label key={`${question.id}:${option.value}`} className="agent-chat-request-option">
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
                      <span className="agent-chat-request-option-label">{option.label}</span>
                      {option.description ? <span className="agent-chat-request-option-description">{option.description}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <input
                className="agent-chat-request-input"
                type={question.isSecret ? 'password' : 'text'}
                value={agentChatInputAnswerText(answers[question.id])}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
              />
            )}
          </div>
        ))
      ) : (
        <div className="agent-chat-request-field">
          <div className="agent-chat-request-label">{model.title}</div>
          {model.question ? <div className="agent-chat-request-help">{model.question}</div> : null}
          {model.choices.length > 0 ? (
            <div className="agent-chat-request-options">
              {model.choices.map((choice) => (
                <label key={choice.id} className="agent-chat-request-option">
                  <input
                    type="radio"
                    name={`${request.id}:choice`}
                    value={choice.id}
                    checked={agentChatInputAnswerText(answers[model.id]) === choice.id}
                    onChange={() => setAnswers({ [model.id]: choice.id })}
                  />
                  <span>
                    <span className="agent-chat-request-option-label">{choice.label}</span>
                    {choice.description ? <span className="agent-chat-request-option-description">{choice.description}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          {(model.inputType === 'text' || model.allowCustomAnswer) ? (
            <textarea
              className="agent-chat-request-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          ) : null}
        </div>
      )}
      <div className="agent-chat-request-footer">
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
