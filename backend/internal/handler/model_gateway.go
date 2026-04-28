package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

const defaultGatewayChatModel = "movscript-default-chat"

type ModelGatewayHandler struct {
	db  *gorm.DB
	svc *ai.AIService
}

func NewModelGatewayHandler(db *gorm.DB, svc *ai.AIService) *ModelGatewayHandler {
	return &ModelGatewayHandler{db: db, svc: svc}
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
}

type gatewayMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
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
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// ListModels exposes text-capable MovScript models in the OpenAI-compatible
// models list format.
func (h *ModelGatewayHandler) ListModels(c *gin.Context) {
	if _, ok := h.gatewayUser(c); !ok {
		writeOpenAIError(c, http.StatusUnauthorized, "authentication required", "authentication_error", "", "authentication_required")
		return
	}

	models, err := h.svc.GetModelsByCapability(ai.CapabilityText)
	if err != nil {
		writeOpenAIError(c, http.StatusInternalServerError, err.Error(), "server_error", "", "internal_error")
		return
	}

	out := []openAIModel{{
		ID:      defaultGatewayChatModel,
		Object:  "model",
		OwnedBy: "movscript",
	}}
	seen := map[string]bool{defaultGatewayChatModel: true}
	for _, m := range models {
		id := gatewayModelID(m)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, openAIModel{ID: id, Object: "model", OwnedBy: "movscript"})
	}

	c.JSON(http.StatusOK, openAIModelList{Object: "list", Data: out})
}

// ChatCompletions implements the non-streaming subset of OpenAI Chat Completions.
func (h *ModelGatewayHandler) ChatCompletions(c *gin.Context) {
	user, ok := h.gatewayUser(c)
	if !ok {
		writeOpenAIError(c, http.StatusUnauthorized, "authentication required", "authentication_error", "", "authentication_required")
		return
	}

	var req chatCompletionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "", "invalid_request")
		return
	}
	if req.Stream {
		writeOpenAIError(c, http.StatusBadRequest, "streaming is not supported by this gateway endpoint yet", "invalid_request_error", "stream", "unsupported_streaming")
		return
	}
	if rawJSONPresent(req.Tools) {
		writeOpenAIError(c, http.StatusBadRequest, "tool calls are not supported by this gateway endpoint yet", "invalid_request_error", "tools", "unsupported_tools")
		return
	}
	if rawJSONPresent(req.ToolChoice) {
		writeOpenAIError(c, http.StatusBadRequest, "tool_choice is not supported by this gateway endpoint yet", "invalid_request_error", "tool_choice", "unsupported_tools")
		return
	}

	modelConfigID, responseModel, err := h.resolveTextModel(req.Model)
	if err != nil {
		writeOpenAIError(c, http.StatusNotFound, err.Error(), "invalid_request_error", "model", "model_not_found")
		return
	}

	messages := make([]ai.Message, 0, len(req.Messages))
	for i, msg := range req.Messages {
		content, err := gatewayMessageContent(msg.Content)
		if err != nil {
			writeOpenAIError(c, http.StatusBadRequest, fmt.Sprintf("messages[%d].content: %s", i, err.Error()), "invalid_request_error", "messages", "invalid_message_content")
			return
		}
		role := strings.TrimSpace(msg.Role)
		if role != "system" && role != "user" && role != "assistant" {
			writeOpenAIError(c, http.StatusBadRequest, fmt.Sprintf("messages[%d].role must be system, user, or assistant", i), "invalid_request_error", "messages", "invalid_message_role")
			return
		}
		messages = append(messages, ai.Message{Role: role, Content: content})
	}

	temp := float32(-1)
	if req.Temperature != nil {
		temp = *req.Temperature
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = req.MaxCompletionTokens
	}

	resp, err := h.svc.CallText(c.Request.Context(), user.ID, modelConfigID, ai.TextRequest{
		Messages:    messages,
		MaxTokens:   maxTokens,
		Temperature: temp,
		JSONMode:    req.ResponseFormat != nil && req.ResponseFormat.Type == "json_object",
	})
	if err != nil {
		writeOpenAIError(c, http.StatusBadGateway, err.Error(), "server_error", "", "provider_error")
		return
	}

	c.JSON(http.StatusOK, chatCompletionResponse{
		ID:      "chatcmpl_" + randomHex(12),
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   responseModel,
		Choices: []chatCompletionChoice{{
			Index: 0,
			Message: chatCompletionChoiceMessage{
				Role:    "assistant",
				Content: resp.Content,
			},
			FinishReason: "stop",
		}},
		Usage: chatCompletionUsage{
			PromptTokens:     resp.Usage.InputTokens,
			CompletionTokens: resp.Usage.OutputTokens,
			TotalTokens:      resp.Usage.InputTokens + resp.Usage.OutputTokens,
		},
	})
}

func (h *ModelGatewayHandler) gatewayUser(c *gin.Context) (*model.User, bool) {
	if user := currentUser(c); user != nil {
		return user, true
	}

	bearer := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(strings.ToLower(bearer), "bearer ") {
		return nil, false
	}
	token := strings.TrimSpace(bearer[len("Bearer "):])
	token = strings.TrimPrefix(token, "user_")
	id, err := strconv.ParseUint(token, 10, 64)
	if err != nil || id == 0 {
		return nil, false
	}

	var user model.User
	if err := h.db.First(&user, uint(id)).Error; err != nil {
		return nil, false
	}
	return &user, true
}

func (h *ModelGatewayHandler) resolveTextModel(modelID string) (uint, string, error) {
	requested := strings.TrimSpace(modelID)
	if requested == "" || requested == defaultGatewayChatModel {
		id, _, err := h.svc.GetAnyTextModel()
		return id, defaultGatewayChatModel, err
	}

	if strings.HasPrefix(requested, "model_config:") {
		rawID := strings.TrimPrefix(requested, "model_config:")
		id, err := strconv.ParseUint(rawID, 10, 64)
		if err != nil || id == 0 {
			return 0, requested, fmt.Errorf("model %q not found", requested)
		}
		models, err := h.svc.GetModelsByCapability(ai.CapabilityText)
		if err != nil {
			return 0, requested, err
		}
		for _, m := range models {
			if m.ID == uint(id) {
				return uint(id), requested, nil
			}
		}
		return 0, requested, fmt.Errorf("model %q not found", requested)
	}

	models, err := h.svc.GetModelsByCapability(ai.CapabilityText)
	if err != nil {
		return 0, requested, err
	}
	for _, m := range models {
		if requested == gatewayModelID(m) || requested == m.ModelDefID || requested == m.ModelIDOverride {
			return m.ID, requested, nil
		}
	}
	return 0, requested, fmt.Errorf("model %q not found", requested)
}

func gatewayModelID(m ai.PublicModel) string {
	if m.ModelIDOverride != "" {
		return m.ModelIDOverride
	}
	if m.ModelDefID != "" {
		return m.ModelDefID
	}
	if m.ID > 0 {
		return fmt.Sprintf("model_config:%d", m.ID)
	}
	return ""
}

func gatewayMessageContent(raw json.RawMessage) (string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", nil
	}

	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s, nil
	}

	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parts); err != nil {
		return "", fmt.Errorf("must be a string or an array of text parts")
	}

	var builder strings.Builder
	for _, part := range parts {
		if part.Type == "" || part.Type == "text" {
			builder.WriteString(part.Text)
		}
	}
	return builder.String(), nil
}

func rawJSONPresent(raw json.RawMessage) bool {
	s := strings.TrimSpace(string(raw))
	return s != "" && s != "null" && s != "[]"
}

func writeOpenAIError(c *gin.Context, status int, message, typ, param, code string) {
	c.JSON(status, openAIErrorResponse{Error: openAIError{
		Message: message,
		Type:    typ,
		Param:   param,
		Code:    code,
	}})
}

func randomHex(bytes int) string {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(buf)
}
