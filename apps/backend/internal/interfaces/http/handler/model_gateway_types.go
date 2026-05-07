package handler

import (
	"encoding/json"

	modelgatewayapp "github.com/movscript/movscript/internal/app/modelgateway"
	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

type ModelGatewayHandler struct {
	service *modelgatewayapp.Service
}

func NewModelGatewayHandler(db *gorm.DB, svc *ai.AIService) *ModelGatewayHandler {
	return &ModelGatewayHandler{service: modelgatewayapp.NewService(db, svc)}
}

type chatCompletionRequest struct {
	Model               string           `json:"model"`
	Messages            []gatewayMessage `json:"messages" binding:"required,min=1"`
	Temperature         *float32         `json:"temperature,omitempty"`
	MaxTokens           int              `json:"max_tokens,omitempty"`
	MaxCompletionTokens int              `json:"max_completion_tokens,omitempty"`
	Stream              bool             `json:"stream,omitempty"`
	ResponseFormat      *struct {
		Type string `json:"type"`
	} `json:"response_format,omitempty"`
	Tools      json.RawMessage `json:"tools,omitempty"`
	ToolChoice json.RawMessage `json:"tool_choice,omitempty"`
	ProjectID  *uint           `json:"project_id,omitempty"`
}

type gatewayMessage struct {
	Role       string          `json:"role"`
	Content    json.RawMessage `json:"content"`
	ToolCallID string          `json:"tool_call_id,omitempty"`
	ToolCalls  []ai.ToolCall   `json:"tool_calls,omitempty"`
}

type gatewayPrincipal struct {
	UserID uint
	Key    *domainmodelgateway.APIKey
}

type openAIErrorResponse struct {
	Error openAIError `json:"error"`
}

type openAIError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Param   string `json:"param,omitempty"`
	Code    string `json:"code,omitempty"`
}

type openAIModelList struct {
	Object string        `json:"object"`
	Data   []openAIModel `json:"data"`
}

type openAIModel struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	OwnedBy string `json:"owned_by"`
}

type chatCompletionResponse struct {
	ID      string                 `json:"id"`
	Object  string                 `json:"object"`
	Created int64                  `json:"created"`
	Model   string                 `json:"model"`
	Choices []chatCompletionChoice `json:"choices"`
	Usage   chatCompletionUsage    `json:"usage"`
}

type chatCompletionChoice struct {
	Index        int                         `json:"index"`
	Message      chatCompletionChoiceMessage `json:"message"`
	FinishReason string                      `json:"finish_reason"`
}

type chatCompletionChoiceMessage struct {
	Role      string        `json:"role"`
	Content   *string       `json:"content"`
	ToolCalls []ai.ToolCall `json:"tool_calls,omitempty"`
}

type chatCompletionUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

type chatCompletionStreamChunk struct {
	ID      string                       `json:"id"`
	Object  string                       `json:"object"`
	Created int64                        `json:"created"`
	Model   string                       `json:"model"`
	Choices []chatCompletionStreamChoice `json:"choices"`
	Usage   *chatCompletionUsage         `json:"usage,omitempty"`
	Event   *chatCompletionStreamEvent   `json:"event,omitempty"`
}

type chatCompletionStreamChoice struct {
	Index        int                       `json:"index"`
	Delta        chatCompletionStreamDelta `json:"delta"`
	FinishReason string                    `json:"finish_reason,omitempty"`
}

type chatCompletionStreamDelta struct {
	Role             string             `json:"role,omitempty"`
	Content          string             `json:"content,omitempty"`
	ReasoningContent string             `json:"reasoning_content,omitempty"`
	ReasoningDelta   string             `json:"reasoning_delta,omitempty"`
	ToolCalls        []ai.ToolCallDelta `json:"tool_calls,omitempty"`
}

type chatCompletionStreamEvent struct {
	Role           string               `json:"role,omitempty"`
	ContentDelta   string               `json:"content_delta,omitempty"`
	ReasoningDelta string               `json:"reasoning_delta,omitempty"`
	ToolCallDeltas []ai.ToolCallDelta   `json:"tool_call_deltas,omitempty"`
	FinishReason   string               `json:"finish_reason,omitempty"`
	Usage          *chatCompletionUsage `json:"usage,omitempty"`
	Error          string               `json:"error,omitempty"`
}

type createGatewayAPIKeyRequest struct {
	Name            string   `json:"name" binding:"required"`
	ProjectID       *uint    `json:"project_id"`
	AllowedModelIDs []uint   `json:"allowed_model_ids"`
	AllowedScopes   []string `json:"allowed_scopes"`
	Commercial      gatewayAPIKeyCreateCommercialRequest
}

type updateGatewayAPIKeyRequest struct {
	Name            *string  `json:"name"`
	AllowedModelIDs []uint   `json:"allowed_model_ids"`
	AllowedScopes   []string `json:"allowed_scopes"`
	IsEnabled       *bool    `json:"is_enabled"`
	Commercial      gatewayAPIKeyUpdateCommercialRequest
}

type gatewayAPIKeyCreateResponse struct {
	domainmodelgateway.APIKey
	Key string `json:"key"`
}
