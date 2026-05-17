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
	"github.com/movscript/movscript/internal/infra/ai"
)

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
		if part.Type == "" || part.Type == "text" || part.Type == "input_text" || part.Type == "output_text" {
			builder.WriteString(part.Text)
		}
	}
	return builder.String(), nil
}

func writeOpenAIError(c *gin.Context, status int, message, typ, param, code string) {
	c.JSON(status, openAIErrorResponse{Error: openAIError{
		Message: message,
		Type:    typ,
		Param:   param,
		Code:    code,
	}})
}

func normalizeResponsesMessages(c *gin.Context, req responsesRequest) ([]ai.Message, bool) {
	messages := make([]ai.Message, 0)
	if strings.TrimSpace(req.Instructions) != "" {
		messages = append(messages, ai.Message{Role: "system", Content: strings.TrimSpace(req.Instructions)})
	}
	inputMessages, err := responsesInputMessages(req.Input)
	if err != nil {
		writeOpenAIError(c, http.StatusBadRequest, fmt.Sprintf("input: %s", err.Error()), "invalid_request_error", "input", "invalid_input")
		return nil, false
	}
	messages = append(messages, inputMessages...)
	return messages, true
}

func responsesInputMessages(raw json.RawMessage) ([]ai.Message, error) {
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return []ai.Message{{Role: "user", Content: text}}, nil
	}
	var items []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, fmt.Errorf("must be a string or an array")
	}
	messages := make([]ai.Message, 0, len(items))
	for i, item := range items {
		itemType := rawString(item["type"])
		switch itemType {
		case "function_call_output":
			messages = append(messages, ai.Message{
				Role:       "tool",
				ToolCallID: rawString(item["call_id"]),
				Content:    rawString(item["output"]),
			})
			continue
		case "function_call":
			messages = append(messages, ai.Message{
				Role: "assistant",
				ToolCalls: []ai.ToolCall{{
					ID:   rawString(item["call_id"]),
					Type: "function",
					Function: ai.ToolFunction{
						Name:      rawString(item["name"]),
						Arguments: rawString(item["arguments"]),
					},
				}},
			})
			continue
		}
		role := rawString(item["role"])
		if role == "" {
			role = "user"
		}
		if role != "system" && role != "user" && role != "assistant" {
			return nil, fmt.Errorf("items[%d].role must be system, user, or assistant", i)
		}
		content, err := gatewayMessageContent(item["content"])
		if err != nil {
			return nil, fmt.Errorf("items[%d].content: %w", i, err)
		}
		messages = append(messages, ai.Message{Role: role, Content: content})
	}
	return messages, nil
}

func normalizeResponsesTools(raw json.RawMessage) json.RawMessage {
	var tools []struct {
		Type        string          `json:"type"`
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Parameters  json.RawMessage `json:"parameters"`
		Function    json.RawMessage `json:"function"`
	}
	if !rawJSONPresent(raw) || json.Unmarshal(raw, &tools) != nil {
		return raw
	}
	out := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		if tool.Type != "function" {
			continue
		}
		if rawJSONPresent(tool.Function) {
			out = append(out, map[string]any{"type": "function", "function": rawJSON(tool.Function)})
			continue
		}
		fn := map[string]any{"name": tool.Name}
		if tool.Description != "" {
			fn["description"] = tool.Description
		}
		if rawJSONPresent(tool.Parameters) {
			fn["parameters"] = rawJSON(tool.Parameters)
		}
		out = append(out, map[string]any{"type": "function", "function": fn})
	}
	return mustRawJSON(out)
}

func normalizeResponsesToolChoice(raw json.RawMessage) json.RawMessage {
	return raw
}

func responseOutputFromTextResponse(resp ai.TextResponse) []responsesOutputItem {
	out := make([]responsesOutputItem, 0, 1+len(resp.ToolCalls))
	if resp.Content != "" {
		out = append(out, responsesOutputItem{
			ID:     "msg_" + randomHex(8),
			Type:   "message",
			Status: "completed",
			Role:   "assistant",
			Content: []responsesOutputContent{{
				Type: "output_text",
				Text: resp.Content,
			}},
		})
	}
	for _, call := range resp.ToolCalls {
		out = append(out, responsesOutputItem{
			ID:        call.ID,
			Type:      "function_call",
			Status:    "completed",
			CallID:    call.ID,
			Name:      call.Function.Name,
			Arguments: call.Function.Arguments,
		})
	}
	return out
}

func normalizeAnthropicGatewayMessages(c *gin.Context, req anthropicMessagesRequest) ([]ai.Message, bool) {
	messages := make([]ai.Message, 0, len(req.Messages)+1)
	system, err := anthropicSystemContent(req.System)
	if err != nil {
		writeOpenAIError(c, http.StatusBadRequest, fmt.Sprintf("system: %s", err.Error()), "invalid_request_error", "system", "invalid_system")
		return nil, false
	}
	if system != "" {
		messages = append(messages, ai.Message{Role: "system", Content: system})
	}
	for i, msg := range req.Messages {
		role := strings.TrimSpace(msg.Role)
		if role != "user" && role != "assistant" {
			writeOpenAIError(c, http.StatusBadRequest, fmt.Sprintf("messages[%d].role must be user or assistant", i), "invalid_request_error", "messages", "invalid_message_role")
			return nil, false
		}
		text, toolCalls, toolResults, err := anthropicMessageParts(msg.Content)
		if err != nil {
			writeOpenAIError(c, http.StatusBadRequest, fmt.Sprintf("messages[%d].content: %s", i, err.Error()), "invalid_request_error", "messages", "invalid_message_content")
			return nil, false
		}
		if text != "" || len(toolCalls) > 0 {
			messages = append(messages, ai.Message{Role: role, Content: text, ToolCalls: toolCalls})
		}
		for _, result := range toolResults {
			messages = append(messages, result)
		}
	}
	return messages, true
}

func anthropicSystemContent(raw json.RawMessage) (string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", nil
	}
	return gatewayMessageContent(raw)
}

func anthropicMessageParts(raw json.RawMessage) (string, []ai.ToolCall, []ai.Message, error) {
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return text, nil, nil, nil
	}
	var parts []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &parts); err != nil {
		return "", nil, nil, fmt.Errorf("must be a string or an array of content blocks")
	}
	var builder strings.Builder
	var toolCalls []ai.ToolCall
	var toolResults []ai.Message
	for _, part := range parts {
		switch rawString(part["type"]) {
		case "", "text":
			builder.WriteString(rawString(part["text"]))
		case "tool_use":
			toolCalls = append(toolCalls, ai.ToolCall{
				ID:   rawString(part["id"]),
				Type: "function",
				Function: ai.ToolFunction{
					Name:      rawString(part["name"]),
					Arguments: rawJSONString(part["input"]),
				},
			})
		case "tool_result":
			content, err := gatewayMessageContent(part["content"])
			if err != nil {
				return "", nil, nil, err
			}
			toolResults = append(toolResults, ai.Message{
				Role:       "tool",
				ToolCallID: rawString(part["tool_use_id"]),
				Content:    content,
			})
		}
	}
	return builder.String(), toolCalls, toolResults, nil
}

func normalizeAnthropicTools(raw json.RawMessage) json.RawMessage {
	var tools []struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		InputSchema json.RawMessage `json:"input_schema"`
	}
	if !rawJSONPresent(raw) || json.Unmarshal(raw, &tools) != nil {
		return raw
	}
	out := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		fn := map[string]any{"name": tool.Name}
		if tool.Description != "" {
			fn["description"] = tool.Description
		}
		if rawJSONPresent(tool.InputSchema) {
			fn["parameters"] = rawJSON(tool.InputSchema)
		}
		out = append(out, map[string]any{"type": "function", "function": fn})
	}
	return mustRawJSON(out)
}

func normalizeAnthropicToolChoice(raw json.RawMessage) json.RawMessage {
	var choice map[string]json.RawMessage
	if !rawJSONPresent(raw) || json.Unmarshal(raw, &choice) != nil {
		return raw
	}
	switch rawString(choice["type"]) {
	case "auto":
		return json.RawMessage(`"auto"`)
	case "any":
		return json.RawMessage(`"required"`)
	case "none":
		return json.RawMessage(`"none"`)
	case "tool":
		return mustRawJSON(map[string]any{
			"type": "function",
			"function": map[string]any{
				"name": rawString(choice["name"]),
			},
		})
	default:
		return raw
	}
}

func anthropicContentFromTextResponse(resp ai.TextResponse) []anthropicContentBlock {
	out := make([]anthropicContentBlock, 0, 1+len(resp.ToolCalls))
	if resp.Content != "" {
		out = append(out, anthropicContentBlock{Type: "text", Text: resp.Content})
	}
	for _, call := range resp.ToolCalls {
		out = append(out, anthropicContentBlock{
			Type:  "tool_use",
			ID:    call.ID,
			Name:  call.Function.Name,
			Input: json.RawMessage(normalizeJSONObject(call.Function.Arguments)),
		})
	}
	return out
}

func anthropicStopReason(resp ai.TextResponse) string {
	if len(resp.ToolCalls) > 0 {
		return "tool_use"
	}
	if resp.FinishReason == "length" {
		return "max_tokens"
	}
	return "end_turn"
}

func rawString(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var out string
	if err := json.Unmarshal(raw, &out); err == nil {
		return out
	}
	return strings.TrimSpace(string(raw))
}

func rawJSONString(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return "{}"
	}
	return normalizeJSONObject(string(raw))
}

func rawJSONPresent(raw json.RawMessage) bool {
	s := strings.TrimSpace(string(raw))
	return s != "" && s != "null" && s != "[]"
}

func rawJSON(raw json.RawMessage) any {
	var out any
	if err := json.Unmarshal(raw, &out); err == nil {
		return out
	}
	return string(raw)
}

func mustRawJSON(value any) json.RawMessage {
	b, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	return b
}

func normalizeJSONObject(value string) string {
	if strings.TrimSpace(value) == "" {
		return "{}"
	}
	var parsed any
	if err := json.Unmarshal([]byte(value), &parsed); err != nil {
		encoded, _ := json.Marshal(map[string]string{"value": value})
		return string(encoded)
	}
	if _, ok := parsed.(map[string]any); ok {
		return strings.TrimSpace(value)
	}
	encoded, _ := json.Marshal(map[string]any{"value": parsed})
	return string(encoded)
}

func randomHex(bytes int) string {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(buf)
}
