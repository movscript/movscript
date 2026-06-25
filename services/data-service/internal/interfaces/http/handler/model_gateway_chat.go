package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	modelgatewayapp "github.com/movscript/movscript/internal/app/gateway"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/observability"
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
		APIKind:   ai.ModelAPIKindOpenAIChatCompletions,
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
		Usage: chatUsageFromTokenUsage(resp.Usage),
	})
}

// Responses implements the OpenAI Responses API surface backed by the same
// MovScript model gateway policy, usage, and provider routing as chat completions.
func (h *ModelGatewayHandler) Responses(c *gin.Context) {
	observability.WithRequest(c.Request.Context()).Info("model_gateway_responses_entered",
		slog.String("method", c.Request.Method),
		slog.String("path", c.Request.URL.Path),
		slog.Bool("has_authorization", strings.TrimSpace(c.GetHeader("Authorization")) != ""),
		slog.String("content_type", c.ContentType()),
	)

	principal, ok := h.gatewayPrincipal(c)
	if !ok {
		observability.WithRequest(c.Request.Context()).Warn("model_gateway_responses_auth_failed",
			slog.String("path", c.Request.URL.Path),
			slog.Bool("has_authorization", strings.TrimSpace(c.GetHeader("Authorization")) != ""),
		)
		writeOpenAIError(c, http.StatusUnauthorized, "authentication required", "authentication_error", "", "authentication_required")
		return
	}

	var req responsesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		observability.WithRequest(c.Request.Context()).Warn("model_gateway_responses_parse_failed",
			slog.Uint64("user_id", uint64(principal.UserID)),
			slog.Bool("gateway_key", principal.Key != nil),
			slog.String("error", err.Error()),
		)
		writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "", "invalid_request")
		return
	}
	observability.WithRequest(c.Request.Context()).Info("model_gateway_responses_request",
		slog.String("model", strings.TrimSpace(req.Model)),
		slog.Uint64("user_id", uint64(principal.UserID)),
		slog.Bool("gateway_key", principal.Key != nil),
		slog.Bool("stream", req.Stream),
	)

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
	input := modelgatewayapp.ResponsesInput{
		Principal: modelgatewayapp.Principal{UserID: principal.UserID, Key: principal.Key},
		Model:     req.Model,
		APIKind:   ai.ModelAPIKindOpenAIResponses,
		Text:      textReq,
		Responses: ai.ResponsesRequest{
			Input:        req.Input,
			Instructions: strings.TrimSpace(req.Instructions),
			Tools:        req.Tools,
			ToolChoice:   req.ToolChoice,
		},
		ProjectID: req.ProjectID,
	}
	if req.Stream {
		h.streamResponses(c, input)
		return
	}

	result, err := h.service.CallResponses(c.Request.Context(), input)
	if err != nil {
		observability.WithRequest(c.Request.Context()).Warn("model_gateway_responses_failed",
			slog.String("model", strings.TrimSpace(req.Model)),
			slog.Uint64("user_id", uint64(principal.UserID)),
			slog.Bool("gateway_key", principal.Key != nil),
			slog.String("error", err.Error()),
		)
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
		Usage:      responsesUsageFromTokenUsage(resp.Usage),
	})
}

func (h *ModelGatewayHandler) streamResponses(c *gin.Context, input modelgatewayapp.ResponsesInput) {
	result, err := h.service.CallResponsesStream(c.Request.Context(), input)
	if err != nil {
		writeGatewayChatError(c, err, "stream")
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Status(http.StatusOK)
	flusher, _ := c.Writer.(http.Flusher)

	for event := range result.Events {
		if event.Raw != "" && event.Raw != "[DONE]" {
			writeRawResponsesSSE(c, flusher, event.Type, event.Raw)
		} else if event.Error != "" {
			writeResponsesSSE(c, flusher, "response.failed", responsesStreamEvent{
				Type: "response.failed",
				Response: &responsesStreamResponse{
					ID:        "resp_" + randomHex(12),
					Object:    "response",
					CreatedAt: time.Now().Unix(),
					Status:    "failed",
					Model:     result.ResponseModel,
				},
			})
		}
		if event.Done {
			return
		}
	}
}

func writeResponsesSSE(c *gin.Context, flusher http.Flusher, eventName string, event responsesStreamEvent) {
	payload, _ := json.Marshal(event)
	writeRawResponsesSSE(c, flusher, eventName, string(payload))
}

func writeRawResponsesSSE(c *gin.Context, flusher http.Flusher, eventName string, payload string) {
	if strings.TrimSpace(eventName) != "" {
		fmt.Fprintf(c.Writer, "event: %s\n", eventName)
	}
	fmt.Fprintf(c.Writer, "data: %s\n\n", payload)
	if flusher != nil {
		flusher.Flush()
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
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
		APIKind:   ai.ModelAPIKindAnthropicMessages,
		Text:      textReq,
		ProjectID: req.ProjectID,
	}
	if req.Stream {
		h.streamAnthropicMessages(c, input)
		return
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
			InputTokens:          resp.Usage.InputTokens,
			OutputTokens:         resp.Usage.OutputTokens,
			CacheReadInputTokens: resp.Usage.CachedInputTokens,
		},
	})
}

func (h *ModelGatewayHandler) streamAnthropicMessages(c *gin.Context, input modelgatewayapp.ChatInput) {
	result, err := h.service.CallChatStream(c.Request.Context(), input)
	if err != nil {
		writeGatewayChatError(c, err, "stream")
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Status(http.StatusOK)
	flusher, _ := c.Writer.(http.Flusher)
	writeAnthropicMessagesEventStream(c, flusher, result.ResponseModel, result.Events)
}

func writeAnthropicMessagesEventStream(c *gin.Context, flusher http.Flusher, model string, events <-chan ai.TextStreamEvent) {
	messageID := "msg_" + randomHex(12)
	blockOpen := false
	currentBlockKind := ""
	currentIndex := 0
	nextIndex := 0
	toolBlockIndexes := map[int]int{}
	finishReason := ""
	usage := ai.TokenUsage{}
	usedTool := false
	started := false

	ensureStarted := func() {
		if started {
			return
		}
		started = true
		writeAnthropicMessagesSSE(c, flusher, "message_start", anthropicMessagesStreamEvent{
			Type: "message_start",
			Message: &anthropicMessagesStreamMessage{
				ID:           messageID,
				Type:         "message",
				Role:         "assistant",
				Model:        model,
				Content:      []anthropicContentBlock{},
				StopReason:   nil,
				StopSequence: nil,
				Usage: anthropicMessagesUsage{
					InputTokens:          usage.InputTokens,
					CacheReadInputTokens: usage.CachedInputTokens,
				},
			},
		})
	}

	closeBlock := func() {
		if !blockOpen {
			return
		}
		index := currentIndex
		writeAnthropicMessagesSSE(c, flusher, "content_block_stop", anthropicMessagesStreamEvent{
			Type:  "content_block_stop",
			Index: &index,
		})
		blockOpen = false
		currentBlockKind = ""
	}
	startTextBlock := func() {
		if blockOpen && currentBlockKind == "text" {
			return
		}
		closeBlock()
		index := nextIndex
		nextIndex++
		currentIndex = index
		currentBlockKind = "text"
		blockOpen = true
		writeAnthropicMessagesSSE(c, flusher, "content_block_start", anthropicMessagesStreamEvent{
			Type:         "content_block_start",
			Index:        &index,
			ContentBlock: anthropicTextStreamStartBlock(),
		})
	}
	startToolBlock := func(delta ai.ToolCallDelta) int {
		if blockIndex, ok := toolBlockIndexes[delta.Index]; ok {
			return blockIndex
		}
		closeBlock()
		blockIndex := nextIndex
		nextIndex++
		toolBlockIndexes[delta.Index] = blockIndex
		currentIndex = blockIndex
		currentBlockKind = "tool_use"
		blockOpen = true
		usedTool = true
		toolID := delta.ID
		if strings.TrimSpace(toolID) == "" {
			toolID = fmt.Sprintf("toolu_%d", delta.Index)
		}
		writeAnthropicMessagesSSE(c, flusher, "content_block_start", anthropicMessagesStreamEvent{
			Type:  "content_block_start",
			Index: &blockIndex,
			ContentBlock: &anthropicStreamContentBlock{
				Type:  "tool_use",
				ID:    toolID,
				Name:  delta.Function.Name,
				Input: json.RawMessage(`{}`),
			},
		})
		return blockIndex
	}

	for event := range events {
		if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 || event.Usage.CachedInputTokens > 0 || event.Usage.ReasoningTokens > 0 {
			usage = event.Usage
		}
		if event.FinishReason != "" {
			finishReason = event.FinishReason
		}
		ensureStarted()
		if event.Error != "" {
			writeAnthropicMessagesSSE(c, flusher, "error", anthropicMessagesStreamEvent{
				Type:  "error",
				Error: &anthropicMessagesStreamError{Type: "api_error", Message: event.Error},
			})
			return
		}
		if event.ContentDelta != "" {
			startTextBlock()
			index := currentIndex
			writeAnthropicMessagesSSE(c, flusher, "content_block_delta", anthropicMessagesStreamEvent{
				Type:  "content_block_delta",
				Index: &index,
				Delta: &anthropicMessagesStreamDelta{Type: "text_delta", Text: event.ContentDelta},
			})
		}
		for _, delta := range event.ToolCallDeltas {
			blockIndex := startToolBlock(delta)
			if delta.Function.Arguments == "" {
				continue
			}
			index := blockIndex
			writeAnthropicMessagesSSE(c, flusher, "content_block_delta", anthropicMessagesStreamEvent{
				Type:  "content_block_delta",
				Index: &index,
				Delta: &anthropicMessagesStreamDelta{Type: "input_json_delta", PartialJSON: delta.Function.Arguments},
			})
		}
		if event.Done {
			if !blockOpen {
				startTextBlock()
			}
			closeBlock()
			writeAnthropicMessagesStreamStop(c, flusher, finishReason, usedTool, usage)
			return
		}
	}
	ensureStarted()
	if !blockOpen {
		startTextBlock()
	}
	closeBlock()
	writeAnthropicMessagesStreamStop(c, flusher, finishReason, usedTool, usage)
}

func writeAnthropicMessagesStreamStop(c *gin.Context, flusher http.Flusher, finishReason string, usedTool bool, usage ai.TokenUsage) {
	stopReason := anthropicStopReasonFromFinishReason(finishReason, usedTool)
	writeAnthropicMessagesSSE(c, flusher, "message_delta", anthropicMessagesStreamEvent{
		Type:  "message_delta",
		Delta: &anthropicMessagesStreamDelta{StopReason: stopReason},
		Usage: &anthropicMessagesUsage{
			InputTokens:          usage.InputTokens,
			OutputTokens:         usage.OutputTokens,
			CacheReadInputTokens: usage.CachedInputTokens,
		},
	})
	writeAnthropicMessagesSSE(c, flusher, "message_stop", anthropicMessagesStreamEvent{Type: "message_stop"})
}

func writeAnthropicMessagesStream(c *gin.Context, flusher http.Flusher, model string, resp ai.TextResponse) {
	messageID := "msg_" + randomHex(12)
	writeAnthropicMessagesSSE(c, flusher, "message_start", anthropicMessagesStreamEvent{
		Type: "message_start",
		Message: &anthropicMessagesStreamMessage{
			ID:           messageID,
			Type:         "message",
			Role:         "assistant",
			Model:        model,
			Content:      []anthropicContentBlock{},
			StopReason:   nil,
			StopSequence: nil,
			Usage: anthropicMessagesUsage{
				InputTokens:          resp.Usage.InputTokens,
				OutputTokens:         0,
				CacheReadInputTokens: resp.Usage.CachedInputTokens,
			},
		},
	})

	blocks := anthropicContentFromTextResponse(resp)
	if len(blocks) == 0 {
		blocks = []anthropicContentBlock{{Type: "text"}}
	}
	for index, block := range blocks {
		index := index
		writeAnthropicMessagesSSE(c, flusher, "content_block_start", anthropicMessagesStreamEvent{
			Type:         "content_block_start",
			Index:        &index,
			ContentBlock: anthropicStreamStartBlock(block),
		})
		writeAnthropicMessagesContentDelta(c, flusher, index, block)
		writeAnthropicMessagesSSE(c, flusher, "content_block_stop", anthropicMessagesStreamEvent{
			Type:  "content_block_stop",
			Index: &index,
		})
	}

	stopReason := anthropicStopReason(resp)
	writeAnthropicMessagesSSE(c, flusher, "message_delta", anthropicMessagesStreamEvent{
		Type: "message_delta",
		Delta: &anthropicMessagesStreamDelta{
			StopReason: stopReason,
		},
		Usage: &anthropicMessagesUsage{
			OutputTokens: resp.Usage.OutputTokens,
		},
	})
	writeAnthropicMessagesSSE(c, flusher, "message_stop", anthropicMessagesStreamEvent{Type: "message_stop"})
}

func anthropicStreamStartBlock(block anthropicContentBlock) *anthropicStreamContentBlock {
	switch block.Type {
	case "tool_use":
		return &anthropicStreamContentBlock{
			Type:  "tool_use",
			ID:    block.ID,
			Name:  block.Name,
			Input: json.RawMessage(`{}`),
		}
	default:
		return anthropicTextStreamStartBlock()
	}
}

func anthropicTextStreamStartBlock() *anthropicStreamContentBlock {
	text := ""
	return &anthropicStreamContentBlock{Type: "text", Text: &text}
}

func writeAnthropicMessagesContentDelta(c *gin.Context, flusher http.Flusher, index int, block anthropicContentBlock) {
	switch block.Type {
	case "tool_use":
		partialJSON := strings.TrimSpace(string(block.Input))
		if partialJSON == "" {
			partialJSON = "{}"
		}
		writeAnthropicMessagesSSE(c, flusher, "content_block_delta", anthropicMessagesStreamEvent{
			Type:  "content_block_delta",
			Index: &index,
			Delta: &anthropicMessagesStreamDelta{
				Type:        "input_json_delta",
				PartialJSON: partialJSON,
			},
		})
	default:
		if block.Text == "" {
			return
		}
		writeAnthropicMessagesSSE(c, flusher, "content_block_delta", anthropicMessagesStreamEvent{
			Type:  "content_block_delta",
			Index: &index,
			Delta: &anthropicMessagesStreamDelta{
				Type: "text_delta",
				Text: block.Text,
			},
		})
	}
}

func writeAnthropicMessagesSSE(c *gin.Context, flusher http.Flusher, eventName string, event anthropicMessagesStreamEvent) {
	payload, _ := json.Marshal(event)
	if strings.TrimSpace(eventName) != "" {
		fmt.Fprintf(c.Writer, "event: %s\n", eventName)
	}
	fmt.Fprintf(c.Writer, "data: %s\n\n", payload)
	if flusher != nil {
		flusher.Flush()
	}
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
		if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 || event.Usage.CachedInputTokens > 0 || event.Usage.ReasoningTokens > 0 {
			usage := chatUsageFromTokenUsage(event.Usage)
			streamEvent.Usage = &usage
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

func chatUsageFromTokenUsage(usage ai.TokenUsage) chatCompletionUsage {
	return chatCompletionUsage{
		PromptTokens:     usage.InputTokens,
		CompletionTokens: usage.OutputTokens,
		TotalTokens:      usage.InputTokens + usage.OutputTokens,
		PromptTokensDetails: tokenUsagePromptDetails{
			CachedTokens: usage.CachedInputTokens,
		},
		CompletionTokensDetails: tokenUsageCompletionDetails{
			ReasoningTokens: usage.ReasoningTokens,
		},
	}
}

func responsesUsageFromTokenUsage(usage ai.TokenUsage) responsesUsage {
	return responsesUsage{
		InputTokens:  usage.InputTokens,
		OutputTokens: usage.OutputTokens,
		TotalTokens:  usage.InputTokens + usage.OutputTokens,
		InputTokensDetails: tokenUsageInputDetails{
			CachedTokens: usage.CachedInputTokens,
		},
		OutputTokensDetails: tokenUsageOutputDetails{
			ReasoningTokens: usage.ReasoningTokens,
		},
	}
}

func normalizeGatewayMessages(c *gin.Context, input []gatewayMessage) ([]ai.Message, bool) {
	messages := make([]ai.Message, 0, len(input))
	for i, msg := range input {
		content, contentParts, err := gatewayMessageContentAndParts(msg.Content)
		if err != nil {
			writeOpenAIError(c, http.StatusBadRequest, fmt.Sprintf("messages[%d].content: %s", i, err.Error()), "invalid_request_error", "messages", "invalid_message_content")
			return nil, false
		}
		role := strings.TrimSpace(msg.Role)
		if role == "tool" && strings.TrimSpace(msg.ToolCallID) == "" {
			writeOpenAIError(c, http.StatusBadRequest, fmt.Sprintf("messages[%d].tool_call_id is required for tool messages", i), "invalid_request_error", "messages", "missing_tool_call_id")
			return nil, false
		}
		messages = append(messages, ai.Message{
			Role:         role,
			Content:      content,
			ContentParts: contentParts,
			ToolCallID:   msg.ToolCallID,
			ToolCalls:    msg.ToolCalls,
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
	case errors.Is(err, modelgatewayapp.ErrCatalogEntryNotAllowed):
		writeOpenAIError(c, http.StatusForbidden, "gateway key is not allowed to use this catalog entry", "insufficient_permissions", "model", "catalog_entry_not_allowed")
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
