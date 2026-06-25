package handler

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/ai"
)

func TestResponsesInputMessagesNormalizesTextAndFunctionItems(t *testing.T) {
	messages, err := responsesInputMessages(json.RawMessage(`[
		{"role":"user","content":[{"type":"input_text","text":"find scenes"}]},
		{"type":"function_call","call_id":"call_1","name":"movscript_search","arguments":"{\"q\":\"scene\"}"},
		{"type":"function_call_output","call_id":"call_1","output":"{\"count\":2}"}
	]`))
	if err != nil {
		t.Fatalf("normalize responses input: %v", err)
	}
	if len(messages) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(messages))
	}
	if messages[0].Role != "user" || messages[0].Content != "find scenes" {
		t.Fatalf("unexpected user message: %#v", messages[0])
	}
	if messages[1].Role != "assistant" || len(messages[1].ToolCalls) != 1 {
		t.Fatalf("unexpected assistant tool call message: %#v", messages[1])
	}
	if messages[1].ToolCalls[0].ID != "call_1" || messages[1].ToolCalls[0].Function.Name != "movscript_search" {
		t.Fatalf("unexpected tool call: %#v", messages[1].ToolCalls[0])
	}
	if messages[2].Role != "tool" || messages[2].ToolCallID != "call_1" || messages[2].Content != `{"count":2}` {
		t.Fatalf("unexpected tool result message: %#v", messages[2])
	}
}

func TestResponsesInputMessagesPreservesStandardImageParts(t *testing.T) {
	messages, err := responsesInputMessages(json.RawMessage(`[
		{"role":"user","content":[
			{"type":"input_text","text":"describe"},
			{"type":"input_image","image_url":"data:image/png;base64,AAAA","detail":"low"}
		]}
	]`))
	if err != nil {
		t.Fatalf("normalize responses input: %v", err)
	}
	if len(messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(messages))
	}
	if messages[0].Content != "describe" {
		t.Fatalf("text content = %q, want describe", messages[0].Content)
	}
	if len(messages[0].ContentParts) != 2 {
		t.Fatalf("content parts = %#v, want text and image", messages[0].ContentParts)
	}
	if messages[0].ContentParts[1]["type"] != "input_image" || messages[0].ContentParts[1]["image_url"] != "data:image/png;base64,AAAA" {
		t.Fatalf("image part not preserved: %#v", messages[0].ContentParts[1])
	}
}

func TestGatewayMessageContentAndPartsRejectsNonStandardResourceParts(t *testing.T) {
	_, _, err := gatewayMessageContentAndParts(json.RawMessage(`[
		{"type":"text","text":"describe"},
			{"type":"resource_id","resource_id":1}
	]`))
	if err == nil {
		t.Fatalf("expected non-standard resource part to be rejected")
	}
}

func TestResponsesToolsNormalizeToChatCompletionsShape(t *testing.T) {
	raw := normalizeResponsesTools(json.RawMessage(`[
		{"type":"function","name":"movscript_search","description":"Search","parameters":{"type":"object","properties":{"q":{"type":"string"}}}}
	]`))
	var tools []map[string]any
	if err := json.Unmarshal(raw, &tools); err != nil {
		t.Fatalf("decode tools: %v", err)
	}
	fn, ok := tools[0]["function"].(map[string]any)
	if !ok {
		t.Fatalf("expected chat-completions function wrapper: %#v", tools[0])
	}
	if fn["name"] != "movscript_search" {
		t.Fatalf("unexpected function name: %#v", fn)
	}
}

func TestGatewayUsageShapesIncludeTokenDetails(t *testing.T) {
	usage := ai.TokenUsage{
		InputTokens:       14110,
		OutputTokens:      244,
		CachedInputTokens: 12000,
		ReasoningTokens:   19,
	}

	chatUsage := chatUsageFromTokenUsage(usage)
	if chatUsage.PromptTokens != 14110 || chatUsage.CompletionTokens != 244 || chatUsage.TotalTokens != 14354 {
		t.Fatalf("chat usage totals = %#v", chatUsage)
	}
	if chatUsage.PromptTokensDetails.CachedTokens != 12000 || chatUsage.CompletionTokensDetails.ReasoningTokens != 19 {
		t.Fatalf("chat usage details = %#v", chatUsage)
	}

	responsesUsage := responsesUsageFromTokenUsage(usage)
	if responsesUsage.InputTokens != 14110 || responsesUsage.OutputTokens != 244 || responsesUsage.TotalTokens != 14354 {
		t.Fatalf("responses usage totals = %#v", responsesUsage)
	}
	if responsesUsage.InputTokensDetails.CachedTokens != 12000 || responsesUsage.OutputTokensDetails.ReasoningTokens != 19 {
		t.Fatalf("responses usage details = %#v", responsesUsage)
	}
}

func TestResponsesSSEWritesCodexCompatibleCompletedEvent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	endTurn := true
	usage := responsesUsageFromTokenUsage(ai.TokenUsage{InputTokens: 3, OutputTokens: 2})

	writeResponsesSSE(c, nil, "response.completed", responsesStreamEvent{
		Type: "response.completed",
		Response: &responsesStreamResponse{
			ID:      "resp_test",
			Status:  "completed",
			Model:   "test-model",
			Usage:   &usage,
			EndTurn: &endTurn,
		},
	})

	body := recorder.Body.String()
	if !strings.HasPrefix(body, "event: response.completed\n") {
		t.Fatalf("unexpected SSE prefix: %q", body)
	}
	var payload map[string]any
	const marker = "data: "
	dataStart := len("event: response.completed\n") + len(marker)
	dataEnd := len(body) - len("\n\n")
	if err := json.Unmarshal([]byte(body[dataStart:dataEnd]), &payload); err != nil {
		t.Fatalf("decode SSE payload: %v\n%s", err, body)
	}
	response, ok := payload["response"].(map[string]any)
	if !ok {
		t.Fatalf("missing response payload: %#v", payload)
	}
	if response["id"] != "resp_test" || response["end_turn"] != true {
		t.Fatalf("unexpected completed response: %#v", response)
	}
}

func TestAnthropicMessagesSSEWritesSDKCompatibleTextEvents(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)

	writeAnthropicMessagesStream(c, nil, "claude-test", ai.TextResponse{
		Content:      "pong",
		FinishReason: "stop",
		Usage:        ai.TokenUsage{InputTokens: 7, OutputTokens: 3, CachedInputTokens: 2},
	})

	body := recorder.Body.String()
	for _, eventName := range []string{
		"message_start",
		"content_block_start",
		"content_block_delta",
		"content_block_stop",
		"message_delta",
		"message_stop",
	} {
		if !strings.Contains(body, "event: "+eventName+"\n") {
			t.Fatalf("missing %s event in SSE body:\n%s", eventName, body)
		}
	}

	start := ssePayloadForEvent(t, body, "message_start")
	message, ok := start["message"].(map[string]any)
	if !ok {
		t.Fatalf("missing message_start.message: %#v", start)
	}
	if message["model"] != "claude-test" || message["role"] != "assistant" {
		t.Fatalf("unexpected message_start payload: %#v", message)
	}
	usage, ok := message["usage"].(map[string]any)
	if !ok || usage["input_tokens"] != float64(7) || usage["cache_read_input_tokens"] != float64(2) {
		t.Fatalf("unexpected message_start usage: %#v", message["usage"])
	}

	delta := ssePayloadForEvent(t, body, "content_block_delta")
	deltaBody, ok := delta["delta"].(map[string]any)
	if !ok || deltaBody["type"] != "text_delta" || deltaBody["text"] != "pong" {
		t.Fatalf("unexpected content delta: %#v", delta)
	}
	blockStart := ssePayloadForEvent(t, body, "content_block_start")
	contentBlock, ok := blockStart["content_block"].(map[string]any)
	if !ok || contentBlock["type"] != "text" || contentBlock["text"] != "" {
		t.Fatalf("unexpected content_block_start payload: %#v", blockStart)
	}

	messageDelta := ssePayloadForEvent(t, body, "message_delta")
	stopDelta, ok := messageDelta["delta"].(map[string]any)
	if !ok || stopDelta["stop_reason"] != "end_turn" {
		t.Fatalf("unexpected message_delta: %#v", messageDelta)
	}
}

func TestAnthropicMessagesEventStreamWritesSDKCompatibleTextEvents(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	events := make(chan ai.TextStreamEvent, 4)
	events <- ai.TextStreamEvent{Usage: ai.TokenUsage{InputTokens: 5, CachedInputTokens: 1}}
	events <- ai.TextStreamEvent{ContentDelta: "po"}
	events <- ai.TextStreamEvent{ContentDelta: "ng", FinishReason: "end_turn", Usage: ai.TokenUsage{InputTokens: 5, OutputTokens: 2, CachedInputTokens: 1}}
	events <- ai.TextStreamEvent{Done: true}
	close(events)

	writeAnthropicMessagesEventStream(c, nil, "claude-test", events)

	body := recorder.Body.String()
	start := ssePayloadForEvent(t, body, "message_start")
	message, ok := start["message"].(map[string]any)
	if !ok {
		t.Fatalf("missing message_start.message: %#v", start)
	}
	startUsage, ok := message["usage"].(map[string]any)
	if !ok || startUsage["input_tokens"] != float64(5) || startUsage["cache_read_input_tokens"] != float64(1) {
		t.Fatalf("unexpected message_start usage: %#v", message["usage"])
	}
	deltas := ssePayloadsForEvent(t, body, "content_block_delta")
	if len(deltas) != 2 {
		t.Fatalf("content deltas = %d, want 2\n%s", len(deltas), body)
	}
	firstDelta, _ := deltas[0]["delta"].(map[string]any)
	secondDelta, _ := deltas[1]["delta"].(map[string]any)
	if firstDelta["text"] != "po" || secondDelta["text"] != "ng" {
		t.Fatalf("unexpected content deltas: %#v %#v", firstDelta, secondDelta)
	}
	blockStart := ssePayloadForEvent(t, body, "content_block_start")
	contentBlock, ok := blockStart["content_block"].(map[string]any)
	if !ok || contentBlock["type"] != "text" || contentBlock["text"] != "" {
		t.Fatalf("unexpected content_block_start payload: %#v", blockStart)
	}
	messageDelta := ssePayloadForEvent(t, body, "message_delta")
	usage, ok := messageDelta["usage"].(map[string]any)
	if !ok || usage["input_tokens"] != float64(5) || usage["output_tokens"] != float64(2) {
		t.Fatalf("unexpected stream usage: %#v", messageDelta)
	}
}

func TestAnthropicMessagePartsNormalizeToolUseAndToolResult(t *testing.T) {
	text, calls, results, err := anthropicMessageParts(json.RawMessage(`[
		{"type":"text","text":"checking"},
		{"type":"tool_use","id":"toolu_1","name":"movscript_get_context","input":{"project_id":7}},
		{"type":"tool_result","tool_use_id":"toolu_1","content":"{\"ok\":true}"}
	]`))
	if err != nil {
		t.Fatalf("normalize anthropic message: %v", err)
	}
	if text != "checking" {
		t.Fatalf("unexpected text: %q", text)
	}
	if len(calls) != 1 || calls[0].ID != "toolu_1" || calls[0].Function.Name != "movscript_get_context" {
		t.Fatalf("unexpected tool calls: %#v", calls)
	}
	if calls[0].Function.Arguments != `{"project_id":7}` {
		t.Fatalf("unexpected arguments: %q", calls[0].Function.Arguments)
	}
	if len(results) != 1 || results[0].Role != "tool" || results[0].ToolCallID != "toolu_1" {
		t.Fatalf("unexpected tool results: %#v", results)
	}
}

func TestAnthropicContentFromTextResponseMapsToolCalls(t *testing.T) {
	blocks := anthropicContentFromTextResponse(ai.TextResponse{
		Content: "Need context.",
		ToolCalls: []ai.ToolCall{{
			ID:   "call_1",
			Type: "function",
			Function: ai.ToolFunction{
				Name:      "movscript_get_context",
				Arguments: `{"project_id":7}`,
			},
		}},
	})
	if len(blocks) != 2 {
		t.Fatalf("expected 2 content blocks, got %d", len(blocks))
	}
	if blocks[0].Type != "text" || blocks[0].Text != "Need context." {
		t.Fatalf("unexpected text block: %#v", blocks[0])
	}
	if blocks[1].Type != "tool_use" || blocks[1].ID != "call_1" || blocks[1].Name != "movscript_get_context" {
		t.Fatalf("unexpected tool block: %#v", blocks[1])
	}
}

func ssePayloadForEvent(t *testing.T, body string, eventName string) map[string]any {
	t.Helper()
	payloads := ssePayloadsForEvent(t, body, eventName)
	if len(payloads) == 0 {
		t.Fatalf("missing %s event in body:\n%s", eventName, body)
	}
	return payloads[0]
}

func ssePayloadsForEvent(t *testing.T, body string, eventName string) []map[string]any {
	t.Helper()
	var payloads []map[string]any
	for _, chunk := range strings.Split(body, "\n\n") {
		if !strings.HasPrefix(chunk, "event: "+eventName+"\n") {
			continue
		}
		data := strings.TrimPrefix(strings.TrimSpace(strings.TrimPrefix(chunk, "event: "+eventName+"\n")), "data: ")
		var payload map[string]any
		if err := json.Unmarshal([]byte(data), &payload); err != nil {
			t.Fatalf("decode %s payload: %v\n%s", eventName, err, chunk)
		}
		payloads = append(payloads, payload)
	}
	return payloads
}
