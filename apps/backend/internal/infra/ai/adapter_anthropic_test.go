package ai

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestAnthropicMessageContentBlocksIncludeToolUseAndToolResult(t *testing.T) {
	assistantBlocks := anthropicMessageContentBlocks(Message{
		Role: "assistant",
		ToolCalls: []ToolCall{{
			ID:   "call_1",
			Type: "function",
			Function: ToolFunction{
				Name:      "movscript_get_context",
				Arguments: `{"project_id":7}`,
			},
		}},
	})
	assistantJSON, err := json.Marshal(assistantBlocks)
	if err != nil {
		t.Fatalf("marshal assistant blocks: %v", err)
	}
	if !jsonContains(assistantJSON, `"type":"tool_use"`) || !jsonContains(assistantJSON, `"name":"movscript_get_context"`) {
		t.Fatalf("assistant tool_use block missing: %s", assistantJSON)
	}

	toolBlocks := anthropicMessageContentBlocks(Message{
		Role:       "tool",
		ToolCallID: "call_1",
		Content:    `{"ok":true}`,
	})
	toolJSON, err := json.Marshal(toolBlocks)
	if err != nil {
		t.Fatalf("marshal tool blocks: %v", err)
	}
	if !jsonContains(toolJSON, `"type":"tool_result"`) || !jsonContains(toolJSON, `"tool_use_id":"call_1"`) {
		t.Fatalf("tool_result block missing: %s", toolJSON)
	}
}

func TestAnthropicToolsNormalizeOpenAIStyleTools(t *testing.T) {
	tools := anthropicTools(json.RawMessage(`[
		{"type":"function","function":{"name":"movscript_get_context","description":"Read context","parameters":{"type":"object","properties":{"project_id":{"type":"number"}}}}}
	]`))
	if len(tools) != 1 || tools[0].OfTool == nil {
		t.Fatalf("expected one anthropic client tool, got %#v", tools)
	}
	if tools[0].OfTool.Name != "movscript_get_context" {
		t.Fatalf("unexpected tool name: %q", tools[0].OfTool.Name)
	}
}

func TestAnthropicToolChoiceNormalizesOpenAIStyleChoice(t *testing.T) {
	choice, ok := anthropicToolChoice(json.RawMessage(`{"type":"function","function":{"name":"movscript_get_context"}}`))
	if !ok || choice.OfTool == nil {
		t.Fatalf("expected concrete anthropic tool choice, got %#v", choice)
	}
	if choice.OfTool.Name != "movscript_get_context" {
		t.Fatalf("unexpected tool choice name: %q", choice.OfTool.Name)
	}
}

func jsonContains(data []byte, fragment string) bool {
	return strings.Contains(string(data), fragment)
}
