package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	modelgatewayapp "github.com/movscript/movscript/internal/app/gateway"
	"github.com/movscript/movscript/internal/infra/ai"
)

// ListModels exposes text-capable MovScript models in the OpenAI-compatible
// models list format.
func (h *ModelGatewayHandler) ListModels(c *gin.Context) {
	principal, ok := h.gatewayPrincipal(c)
	if !ok {
		writeOpenAIError(c, http.StatusUnauthorized, "authentication required", "authentication_error", "", "authentication_required")
		return
	}

	models, err := h.service.ListChatModels(c.Request.Context(), modelgatewayapp.Principal{UserID: principal.UserID, Key: principal.Key})
	if err != nil {
		if errors.Is(err, modelgatewayapp.ErrInsufficientScope) {
			writeOpenAIError(c, http.StatusForbidden, "gateway key is not allowed to list chat models", "insufficient_permissions", "", "insufficient_scope")
			return
		}
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
		id := modelgatewayapp.ModelID(m)
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

	var req chatCompletionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "", "invalid_request")
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
	input := modelgatewayapp.ChatInput{
		Principal: modelgatewayapp.Principal{UserID: principal.UserID, Key: principal.Key},
		Model:     req.Model,
		Text:      textReq,
		ProjectID: req.ProjectID,
	}

	if req.Stream {
		h.streamChatCompletions(c, input)
		return
	}

	result, err := h.service.CallChat(c.Request.Context(), input)
	if err != nil {
		writeGatewayChatError(c, err, "")
		return
	}
	resp := result.Response

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
		Model:   result.ResponseModel,
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

// Responses implements the OpenAI Responses API surface backed by the same
// MovScript model gateway policy, usage, and provider routing as chat completions.
func (h *ModelGatewayHandler) Responses(c *gin.Context) {
	principal, ok := h.gatewayPrincipal(c)
	if !ok {
		writeOpenAIError(c, http.StatusUnauthorized, "authentication required", "authentication_error", "", "authentication_required")
		return
	}

	var req responsesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "", "invalid_request")
		return
	}
	if req.Stream {
		writeOpenAIError(c, http.StatusBadRequest, "responses streaming is not implemented by the MovScript gateway yet", "invalid_request_error", "stream", "unsupported_parameter")
		return
	}

	messages, ok := normalizeResponsesMessages(c, req)
	if !ok {
		return
	}
	temp := float32(-1)
	if req.Temperature != nil {
		temp = *req.Temperature
	}
	textReq := ai.TextRequest{
		PromptName:  "model_gateway_responses",
		Messages:    messages,
		MaxTokens:   req.MaxOutputTokens,
		Temperature: temp,
		JSONMode:    req.Text != nil && req.Text.Format != nil && req.Text.Format.Type == "json_object",
		Tools:       normalizeResponsesTools(req.Tools),
		ToolChoice:  normalizeResponsesToolChoice(req.ToolChoice),
	}
	input := modelgatewayapp.ChatInput{
		Principal: modelgatewayapp.Principal{UserID: principal.UserID, Key: principal.Key},
		Model:     req.Model,
		Text:      textReq,
		ProjectID: req.ProjectID,
	}
	result, err := h.service.CallChat(c.Request.Context(), input)
	if err != nil {
		writeGatewayChatError(c, err, "")
		return
	}
	resp := result.Response
	output := responseOutputFromTextResponse(resp)
	c.JSON(http.StatusOK, responsesResponse{
		ID:         "resp_" + randomHex(12),
		Object:     "response",
		CreatedAt:  time.Now().Unix(),
		Status:     "completed",
		Model:      result.ResponseModel,
		Output:     output,
		OutputText: resp.Content,
		Usage: responsesUsage{
			InputTokens:  resp.Usage.InputTokens,
			OutputTokens: resp.Usage.OutputTokens,
			TotalTokens:  resp.Usage.InputTokens + resp.Usage.OutputTokens,
		},
	})
}

// AnthropicMessages implements Claude's Messages API surface backed by
// MovScript gateway auth and model routing. It accepts Anthropic-shaped messages
// and returns Anthropic-shaped content blocks.
func (h *ModelGatewayHandler) AnthropicMessages(c *gin.Context) {
	principal, ok := h.gatewayPrincipal(c)
	if !ok {
		writeOpenAIError(c, http.StatusUnauthorized, "authentication required", "authentication_error", "", "authentication_required")
		return
	}

	var req anthropicMessagesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "", "invalid_request")
		return
	}
	if req.Stream {
		writeOpenAIError(c, http.StatusBadRequest, "anthropic messages streaming is not implemented by the MovScript gateway yet", "invalid_request_error", "stream", "unsupported_parameter")
		return
	}

	messages, ok := normalizeAnthropicGatewayMessages(c, req)
	if !ok {
		return
	}
	temp := float32(-1)
	if req.Temperature != nil {
		temp = *req.Temperature
	}
	textReq := ai.TextRequest{
		PromptName:  "model_gateway_anthropic_messages",
		Messages:    messages,
		MaxTokens:   req.MaxTokens,
		Temperature: temp,
		Tools:       normalizeAnthropicTools(req.Tools),
		ToolChoice:  normalizeAnthropicToolChoice(req.ToolChoice),
	}
	input := modelgatewayapp.ChatInput{
		Principal: modelgatewayapp.Principal{UserID: principal.UserID, Key: principal.Key},
		Model:     req.Model,
		Text:      textReq,
		ProjectID: req.ProjectID,
	}
	result, err := h.service.CallChat(c.Request.Context(), input)
	if err != nil {
		writeGatewayChatError(c, err, "")
		return
	}
	resp := result.Response
	c.JSON(http.StatusOK, anthropicMessagesResponse{
		ID:           "msg_" + randomHex(12),
		Type:         "message",
		Role:         "assistant",
		Model:        result.ResponseModel,
		Content:      anthropicContentFromTextResponse(resp),
		StopReason:   anthropicStopReason(resp),
		StopSequence: nil,
		Usage: anthropicMessagesUsage{
			InputTokens:  resp.Usage.InputTokens,
			OutputTokens: resp.Usage.OutputTokens,
		},
	})
}

func (h *ModelGatewayHandler) streamChatCompletions(c *gin.Context, input modelgatewayapp.ChatInput) {
	result, err := h.service.CallChatStream(c.Request.Context(), input)
	if err != nil {
		writeGatewayChatError(c, err, "stream")
		return
	}

	id := "chatcmpl_" + randomHex(12)
	created := time.Now().Unix()
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Status(http.StatusOK)
	flusher, _ := c.Writer.(http.Flusher)

	for event := range result.Events {
		if event.Done {
			fmt.Fprint(c.Writer, "data: [DONE]\n\n")
			if flusher != nil {
				flusher.Flush()
			}
			return
		}
		streamEvent := &chatCompletionStreamEvent{
			Role:           event.Role,
			ContentDelta:   event.ContentDelta,
			ReasoningDelta: event.ReasoningDelta,
			ToolCallDeltas: event.ToolCallDeltas,
			FinishReason:   event.FinishReason,
			Error:          event.Error,
		}
		if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 {
			streamEvent.Usage = &chatCompletionUsage{
				PromptTokens:     event.Usage.InputTokens,
				CompletionTokens: event.Usage.OutputTokens,
				TotalTokens:      event.Usage.InputTokens + event.Usage.OutputTokens,
			}
		}
		chunk := chatCompletionStreamChunk{
			ID:      id,
			Object:  "chat.completion.chunk",
			Created: created,
			Model:   result.ResponseModel,
			Event:   streamEvent,
		}
		if event.Role != "" || event.ContentDelta != "" || event.ReasoningDelta != "" || len(event.ToolCallDeltas) > 0 || event.FinishReason != "" {
			chunk.Choices = []chatCompletionStreamChoice{{
				Index: 0,
				Delta: chatCompletionStreamDelta{
					Role:             event.Role,
					Content:          event.ContentDelta,
					ReasoningContent: event.ReasoningDelta,
					ReasoningDelta:   event.ReasoningDelta,
					ToolCalls:        event.ToolCallDeltas,
				},
				FinishReason: event.FinishReason,
			}}
		} else {
			chunk.Choices = []chatCompletionStreamChoice{}
		}
		if streamEvent.Usage != nil {
			chunk.Usage = streamEvent.Usage
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

func writeGatewayChatError(c *gin.Context, err error, param string) {
	switch {
	case errors.Is(err, modelgatewayapp.ErrInsufficientScope):
		writeOpenAIError(c, http.StatusForbidden, "gateway key is not allowed to call chat models", "insufficient_permissions", "", "insufficient_scope")
	case errors.Is(err, modelgatewayapp.ErrModelNotFound):
		writeOpenAIError(c, http.StatusNotFound, err.Error(), "invalid_request_error", "model", "model_not_found")
	case errors.Is(err, modelgatewayapp.ErrModelNotAllowed):
		writeOpenAIError(c, http.StatusForbidden, "gateway key is not allowed to use this model", "insufficient_permissions", "model", "model_not_allowed")
	case errors.Is(err, modelgatewayapp.ErrProjectNotAllowed):
		writeOpenAIError(c, http.StatusForbidden, "gateway key is not allowed to use this project scope", "insufficient_permissions", "project_id", "project_not_allowed")
	case errors.Is(err, modelgatewayapp.ErrUnsupportedParameter):
		writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "", "unsupported_parameter")
	case errors.Is(err, modelgatewayapp.ErrModelUnavailable):
		writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "model", "model_not_available")
	case errors.Is(err, modelgatewayapp.ErrGatewayUsageLimitExceeded):
		writeOpenAIError(c, http.StatusForbidden, err.Error(), "insufficient_quota", "", "gateway_usage_limit_exceeded")
	case errors.Is(err, modelgatewayapp.ErrGatewayRateLimited):
		writeOpenAIError(c, http.StatusTooManyRequests, err.Error(), "insufficient_quota", "", "gateway_rate_limit_exceeded")
	case modelgatewayapp.IsUsageLimitExceeded(err):
		writeOpenAIError(c, http.StatusForbidden, err.Error(), "insufficient_quota", param, "insufficient_quota")
	default:
		writeOpenAIError(c, http.StatusBadGateway, err.Error(), "server_error", param, "provider_error")
	}
}
