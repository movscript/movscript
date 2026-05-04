package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	modelgatewayapp "github.com/movscript/movscript/internal/app/modelgateway"
)

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
		ID:      modelgatewayapp.DefaultChatModel,
		Object:  "model",
		OwnedBy: "movscript",
	}}
	seen := map[string]bool{modelgatewayapp.DefaultChatModel: true}
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
	if principal.Key != nil && !gatewayKeyAllowsProject(principal.Key, req.ProjectID) {
		writeOpenAIError(c, http.StatusForbidden, "gateway key is not allowed to use this project scope", "insufficient_permissions", "project_id", "project_not_allowed")
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
		PromptName:  "model_gateway_chat",
		Messages:    messages,
		MaxTokens:   maxTokens,
		Temperature: temp,
		JSONMode:    req.ResponseFormat != nil && req.ResponseFormat.Type == "json_object",
		Tools:       req.Tools,
		ToolChoice:  req.ToolChoice,
	}
	if _, err := h.svc.PreflightText(modelConfigID, &textReq); err != nil {
		writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "", "unsupported_parameter")
		return
	}
	if principal.Key != nil {
		estimate, err := h.svc.EstimateTextCost(modelConfigID, textReq)
		if err != nil {
			writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "model", "model_not_available")
			return
		}
		if err := h.enforceGatewayKeyLimits(c.Request.Context(), principal.Key, estimate.Cost); err != nil {
			status := http.StatusTooManyRequests
			code := "rate_limit_exceeded"
			if errors.Is(err, errGatewayMonthlyBudgetExceeded) {
				status = http.StatusPaymentRequired
				code = "monthly_budget_exceeded"
			}
			writeOpenAIError(c, status, err.Error(), "insufficient_quota", "", code)
			return
		}
	}

	if req.Stream {
		h.streamChatCompletions(c, principal, modelConfigID, responseModel, textReq, req.ProjectID)
		return
	}

	resp, err := h.svc.CallTextWithBilling(c.Request.Context(), principal.User.ID, modelConfigID, textReq, gatewayBillingContext(principal.Key, req.ProjectID))
	if err != nil {
		if errors.Is(err, ai.ErrInsufficientQuota) {
			writeOpenAIError(c, http.StatusPaymentRequired, err.Error(), "insufficient_quota", "", "insufficient_quota")
			return
		}
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

func (h *ModelGatewayHandler) streamChatCompletions(c *gin.Context, principal *gatewayPrincipal, modelConfigID uint, responseModel string, req ai.TextRequest, projectID *uint) {
	events, err := h.svc.CallTextStreamWithBilling(c.Request.Context(), principal.User.ID, modelConfigID, req, gatewayBillingContext(principal.Key, projectID))
	if err != nil {
		if errors.Is(err, ai.ErrInsufficientQuota) {
			writeOpenAIError(c, http.StatusPaymentRequired, err.Error(), "insufficient_quota", "stream", "insufficient_quota")
			return
		}
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

func (h *ModelGatewayHandler) resolveTextModel(modelID string) (uint, string, error) {
	models, err := h.svc.GetModelsByCapability(ai.CapabilityText)
	if err != nil {
		return 0, strings.TrimSpace(modelID), err
	}
	defaultID, _, defaultErr := h.svc.GetAnyTextModel()
	return modelgatewayapp.ResolveTextModel(models, modelID, defaultID, defaultErr)
}

func gatewayModelID(m ai.PublicModel) string {
	return modelgatewayapp.ModelID(m)
}
