package handler

import (
	"encoding/json"
	"testing"

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
		{"type":"resource_id","resource_id":"asset_1"}
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
