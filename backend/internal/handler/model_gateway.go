package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
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

// ListModels exposes text-capable MovScript models in the OpenAI-compatible
// models list format.
func (h *ModelGatewayHandler) ListModels(c *gin.Context) {
	if principal, ok := h.gatewayPrincipal(c); !ok {
		writeOpenAIError(c, http.StatusUnauthorized, "authentication required", "authentication_error", "", "authentication_required")
		return
	} else if principal.Key != nil && !gatewayKeyAllowsScope(principal.Key, "model:chat") {
		writeOpenAIError(c, http.StatusForbidden, "gateway key is not allowed to list chat models", "insufficient_permissions", "", "insufficient_scope")
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

// ChatCompletions implements the OpenAI-compatible Chat Completions endpoint.
func (h *ModelGatewayHandler) ChatCompletions(c *gin.Context) {
	principal, ok := h.gatewayPrincipal(c)
	if !ok {
		writeOpenAIError(c, http.StatusUnauthorized, "authentication required", "authentication_error", "", "authentication_required")
		return
	}
	if principal.Key != nil && !gatewayKeyAllowsScope(principal.Key, "model:chat") {
		writeOpenAIError(c, http.StatusForbidden, "gateway key is not allowed to call chat models", "insufficient_permissions", "", "insufficient_scope")
		return
	}

	var req chatCompletionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "", "invalid_request")
		return
	}

	modelConfigID, responseModel, err := h.resolveTextModel(req.Model)
	if err != nil {
		writeOpenAIError(c, http.StatusNotFound, err.Error(), "invalid_request_error", "model", "model_not_found")
		return
	}
	if principal.Key != nil && !gatewayKeyAllowsModel(principal.Key, modelConfigID) {
		writeOpenAIError(c, http.StatusForbidden, "gateway key is not allowed to use this model", "insufficient_permissions", "model", "model_not_allowed")
		return
	}

	messages, ok := normalizeGatewayMessages(c, req.Messages)
	if !ok {
		return
	}

	temp := float32(-1)
	if req.Temperature != nil {
		temp = *req.Temperature
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = req.MaxCompletionTokens
	}
	textReq := ai.TextRequest{
		Messages:    messages,
		MaxTokens:   maxTokens,
		Temperature: temp,
		JSONMode:    req.ResponseFormat != nil && req.ResponseFormat.Type == "json_object",
		Tools:       req.Tools,
		ToolChoice:  req.ToolChoice,
	}

	if req.Stream {
		h.streamChatCompletions(c, principal.User.ID, modelConfigID, responseModel, textReq)
		return
	}

	resp, err := h.svc.CallText(c.Request.Context(), principal.User.ID, modelConfigID, textReq)
	if err != nil {
		writeOpenAIError(c, http.StatusBadGateway, err.Error(), "server_error", "", "provider_error")
		return
	}

	content := resp.Content
	contentPtr := &content
	if len(resp.ToolCalls) > 0 && content == "" {
		contentPtr = nil
	}
	finishReason := resp.FinishReason
	if finishReason == "" {
		if len(resp.ToolCalls) > 0 {
			finishReason = "tool_calls"
		} else {
			finishReason = "stop"
		}
	}
	c.JSON(http.StatusOK, chatCompletionResponse{
		ID:      "chatcmpl_" + randomHex(12),
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   responseModel,
		Choices: []chatCompletionChoice{{
			Index: 0,
			Message: chatCompletionChoiceMessage{
				Role:      "assistant",
				Content:   contentPtr,
				ToolCalls: resp.ToolCalls,
			},
			FinishReason: finishReason,
		}},
		Usage: chatCompletionUsage{
			PromptTokens:     resp.Usage.InputTokens,
			CompletionTokens: resp.Usage.OutputTokens,
			TotalTokens:      resp.Usage.InputTokens + resp.Usage.OutputTokens,
		},
	})
}

func (h *ModelGatewayHandler) streamChatCompletions(c *gin.Context, userID uint, modelConfigID uint, responseModel string, req ai.TextRequest) {
	events, err := h.svc.CallTextStream(c.Request.Context(), userID, modelConfigID, req)
	if err != nil {
		writeOpenAIError(c, http.StatusBadGateway, err.Error(), "server_error", "stream", "provider_error")
		return
	}

	id := "chatcmpl_" + randomHex(12)
	created := time.Now().Unix()
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Status(http.StatusOK)
	flusher, _ := c.Writer.(http.Flusher)

	for event := range events {
		if event.Done {
			fmt.Fprint(c.Writer, "data: [DONE]\n\n")
			if flusher != nil {
				flusher.Flush()
			}
			return
		}
		chunk := chatCompletionStreamChunk{
			ID:      id,
			Object:  "chat.completion.chunk",
			Created: created,
			Model:   responseModel,
		}
		if event.Role != "" || event.ContentDelta != "" || len(event.ToolCallDeltas) > 0 || event.FinishReason != "" {
			chunk.Choices = []chatCompletionStreamChoice{{
				Index: 0,
				Delta: chatCompletionStreamDelta{
					Role:      event.Role,
					Content:   event.ContentDelta,
					ToolCalls: event.ToolCallDeltas,
				},
				FinishReason: event.FinishReason,
			}}
		} else {
			chunk.Choices = []chatCompletionStreamChoice{}
		}
		if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 {
			chunk.Usage = &chatCompletionUsage{
				PromptTokens:     event.Usage.InputTokens,
				CompletionTokens: event.Usage.OutputTokens,
				TotalTokens:      event.Usage.InputTokens + event.Usage.OutputTokens,
			}
		}
		payload, _ := json.Marshal(chunk)
		fmt.Fprintf(c.Writer, "data: %s\n\n", payload)
		if flusher != nil {
			flusher.Flush()
		}
	}
	fmt.Fprint(c.Writer, "data: [DONE]\n\n")
	if flusher != nil {
		flusher.Flush()
	}
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

func normalizeGatewayMessages(c *gin.Context, input []gatewayMessage) ([]ai.Message, bool) {
	messages := make([]ai.Message, 0, len(input))
	for i, msg := range input {
		content, err := gatewayMessageContent(msg.Content)
		if err != nil {
			writeOpenAIError(c, http.StatusBadRequest, fmt.Sprintf("messages[%d].content: %s", i, err.Error()), "invalid_request_error", "messages", "invalid_message_content")
			return nil, false
		}
		role := strings.TrimSpace(msg.Role)
		if role != "system" && role != "user" && role != "assistant" && role != "tool" {
			writeOpenAIError(c, http.StatusBadRequest, fmt.Sprintf("messages[%d].role must be system, user, assistant, or tool", i), "invalid_request_error", "messages", "invalid_message_role")
			return nil, false
		}
		if role == "tool" && strings.TrimSpace(msg.ToolCallID) == "" {
			writeOpenAIError(c, http.StatusBadRequest, fmt.Sprintf("messages[%d].tool_call_id is required for tool messages", i), "invalid_request_error", "messages", "missing_tool_call_id")
			return nil, false
		}
		messages = append(messages, ai.Message{
			Role:       role,
			Content:    content,
			ToolCallID: msg.ToolCallID,
			ToolCalls:  msg.ToolCalls,
		})
	}
	return messages, true
}

func (h *ModelGatewayHandler) gatewayPrincipal(c *gin.Context) (*gatewayPrincipal, bool) {
	if user := currentUser(c); user != nil {
		return &gatewayPrincipal{User: user}, true
	}

	bearer := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(strings.ToLower(bearer), "bearer ") {
		return nil, false
	}
	token := strings.TrimSpace(bearer[len("Bearer "):])

	if strings.HasPrefix(token, "user_") || isUnsignedInteger(token) {
		rawID := token
		if strings.HasPrefix(token, "user_") {
			rawID = strings.TrimPrefix(token, "user_")
		}
		id, err := strconv.ParseUint(rawID, 10, 64)
		if err != nil || id == 0 {
			return nil, false
		}
		var user model.User
		if err := h.db.First(&user, uint(id)).Error; err != nil {
			return nil, false
		}
		return &gatewayPrincipal{User: &user}, true
	}

	var key model.GatewayAPIKey
	hash := hashGatewayAPIKey(token)
	if err := h.db.Where("key_hash = ? AND is_enabled = true", hash).First(&key).Error; err != nil {
		return nil, false
	}
	var user model.User
	if err := h.db.First(&user, key.OwnerUserID).Error; err != nil {
		return nil, false
	}
	now := time.Now()
	h.db.Model(&key).Update("last_used_at", &now)
	key.LastUsedAt = &now
	return &gatewayPrincipal{User: &user, Key: &key}, true
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

func (h *ModelGatewayHandler) ListAPIKeys(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var keys []model.GatewayAPIKey
	if err := h.db.Where("owner_user_id = ?", user.ID).Order("created_at desc").Find(&keys).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": keys})
}

func (h *ModelGatewayHandler) CreateAPIKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var req createGatewayAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scopes := req.AllowedScopes
	if len(scopes) == 0 {
		scopes = []string{"model:chat"}
	}
	rawKey := generateGatewayAPIKey()
	key := model.GatewayAPIKey{
		Name:            strings.TrimSpace(req.Name),
		KeyPrefix:       gatewayKeyPrefix(rawKey),
		KeyHash:         hashGatewayAPIKey(rawKey),
		OwnerUserID:     user.ID,
		ProjectID:       req.ProjectID,
		AllowedModelIDs: mustJSONString(req.AllowedModelIDs),
		AllowedScopes:   mustJSONString(scopes),
		RateLimitRPM:    req.RateLimitRPM,
		MonthlyBudget:   req.MonthlyBudget,
		IsEnabled:       true,
	}
	if err := h.db.Create(&key).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gatewayAPIKeyCreateResponse{GatewayAPIKey: key, Key: rawKey})
}

func (h *ModelGatewayHandler) UpdateAPIKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var key model.GatewayAPIKey
	if err := h.db.Where("id = ? AND owner_user_id = ?", c.Param("id"), user.ID).First(&key).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "api key not found"})
		return
	}
	var req updateGatewayAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]any{}
	if req.Name != nil {
		updates["name"] = strings.TrimSpace(*req.Name)
	}
	if req.AllowedModelIDs != nil {
		updates["allowed_model_ids"] = mustJSONString(req.AllowedModelIDs)
	}
	if req.AllowedScopes != nil {
		updates["allowed_scopes"] = mustJSONString(req.AllowedScopes)
	}
	if req.RateLimitRPM != nil {
		updates["rate_limit_rpm"] = *req.RateLimitRPM
	}
	if req.MonthlyBudget != nil {
		updates["monthly_budget"] = *req.MonthlyBudget
	}
	if req.IsEnabled != nil {
		updates["is_enabled"] = *req.IsEnabled
	}
	if len(updates) > 0 {
		if err := h.db.Model(&key).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	h.db.First(&key, key.ID)
	c.JSON(http.StatusOK, key)
}

func (h *ModelGatewayHandler) DeleteAPIKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var key model.GatewayAPIKey
	if err := h.db.Where("id = ? AND owner_user_id = ?", c.Param("id"), user.ID).First(&key).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "api key not found"})
		return
	}
	if err := h.db.Delete(&key).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func gatewayKeyAllowsScope(key *model.GatewayAPIKey, scope string) bool {
	scopes := parseStringArray(key.AllowedScopes)
	if len(scopes) == 0 {
		return scope == "model:chat"
	}
	for _, s := range scopes {
		if s == scope || s == "*" {
			return true
		}
	}
	return false
}

func gatewayKeyAllowsModel(key *model.GatewayAPIKey, modelConfigID uint) bool {
	ids := parseUintArray(key.AllowedModelIDs)
	if len(ids) == 0 {
		return true
	}
	for _, id := range ids {
		if id == modelConfigID {
			return true
		}
	}
	return false
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

func parseStringArray(raw string) []string {
	var values []string
	if strings.TrimSpace(raw) == "" {
		return values
	}
	_ = json.Unmarshal([]byte(raw), &values)
	return values
}

func parseUintArray(raw string) []uint {
	var values []uint
	if strings.TrimSpace(raw) == "" {
		return values
	}
	_ = json.Unmarshal([]byte(raw), &values)
	return values
}

func mustJSONString(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return "[]"
	}
	return string(data)
}

func generateGatewayAPIKey() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "mgw_" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return "mgw_" + base64.RawURLEncoding.EncodeToString(buf)
}

func hashGatewayAPIKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func gatewayKeyPrefix(raw string) string {
	if len(raw) <= 12 {
		return raw
	}
	return raw[:12]
}

func isUnsignedInteger(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
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
