package ai

import (
	"encoding/json"
	"testing"
)

func TestBuildOpenAIChatBodyIncludesToolCalls(t *testing.T) {
	body, err := buildOpenAIChatBody(TextRequest{
		Model: "gpt-test",
		Messages: []Message{
			{Role: "user", Content: "find the scene"},
			{
				Role: "assistant",
				ToolCalls: []ToolCall{{
					ID:   "call_1",
					Type: "function",
					Function: ToolFunction{
						Name:      "movscript.search_entities",
						Arguments: `{"query":"scene"}`,
					},
				}},
			},
			{Role: "tool", ToolCallID: "call_1", Content: `{"results":[]}`},
		},
		Tools:      json.RawMessage(`[{"type":"function","function":{"name":"movscript.search_entities","parameters":{"type":"object"}}}]`),
		ToolChoice: json.RawMessage(`"auto"`),
	}, false)
	if err != nil {
		t.Fatalf("buildOpenAIChatBody() error = %v", err)
	}

	messages := body["messages"].([]map[string]any)
	if messages[1]["content"] != nil {
		t.Fatalf("assistant tool-call content = %#v, want nil", messages[1]["content"])
	}
	if _, ok := messages[1]["tool_calls"].([]ToolCall); !ok {
		t.Fatalf("assistant tool_calls missing: %#v", messages[1]["tool_calls"])
	}
	if messages[2]["tool_call_id"] != "call_1" {
		t.Fatalf("tool_call_id = %v, want call_1", messages[2]["tool_call_id"])
	}
	if _, ok := body["tools"].([]any); !ok {
		t.Fatalf("tools not decoded as JSON array: %#v", body["tools"])
	}
	if body["tool_choice"] != "auto" {
		t.Fatalf("tool_choice = %#v, want auto", body["tool_choice"])
	}
}
