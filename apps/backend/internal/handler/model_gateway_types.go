package handler

import (
	"encoding/json"

	"github.com/movscript/movscript/internal/ai"
	modelgatewayapp "github.com/movscript/movscript/internal/app/modelgateway"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

const defaultGatewayChatModel = "movscript-default-chat"

type ModelGatewayHandler struct {
	db      *gorm.DB
	svc     *ai.AIService
	service *modelgatewayapp.Service
}

func NewModelGatewayHandler(db *gorm.DB, svc *ai.AIService) *ModelGatewayHandler {
	return &ModelGatewayHandler{db: db, svc: svc, service: modelgatewayapp.NewService(db)}
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
	User *model.User
	Key  *model.GatewayAPIKey
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
}

type chatCompletionStreamChoice struct {
	Index        int                       `json:"index"`
	Delta        chatCompletionStreamDelta `json:"delta"`
	FinishReason string                    `json:"finish_reason,omitempty"`
}

type chatCompletionStreamDelta struct {
	Role      string             `json:"role,omitempty"`
	Content   string             `json:"content,omitempty"`
	ToolCalls []ai.ToolCallDelta `json:"tool_calls,omitempty"`
}

type createGatewayAPIKeyRequest struct {
	Name            string   `json:"name" binding:"required"`
	ProjectID       *uint    `json:"project_id"`
	AllowedModelIDs []uint   `json:"allowed_model_ids"`
	AllowedScopes   []string `json:"allowed_scopes"`
	RateLimitRPM    int      `json:"rate_limit_rpm"`
	MonthlyBudget   float64  `json:"monthly_budget"`
}

type updateGatewayAPIKeyRequest struct {
	Name            *string  `json:"name"`
	AllowedModelIDs []uint   `json:"allowed_model_ids"`
	AllowedScopes   []string `json:"allowed_scopes"`
	RateLimitRPM    *int     `json:"rate_limit_rpm"`
	MonthlyBudget   *float64 `json:"monthly_budget"`
	IsEnabled       *bool    `json:"is_enabled"`
}

type gatewayAPIKeyCreateResponse struct {
	model.GatewayAPIKey
	Key string `json:"key"`
}
