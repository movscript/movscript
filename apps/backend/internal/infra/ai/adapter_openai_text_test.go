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

func TestBuildOpenAIChatBodyJSONModeAddsJSONInstructionWhenMissing(t *testing.T) {
	body, err := buildOpenAIChatBody(TextRequest{
		Model:    "gpt-test",
		JSONMode: true,
		Messages: []Message{
			{Role: "system", Content: "输出结构化对象，不要使用 markdown。"},
			{Role: "user", Content: "分析这个剧本。"},
		},
	}, true)
	if err != nil {
		t.Fatalf("buildOpenAIChatBody() error = %v", err)
	}

	if got := body["response_format"]; got == nil {
		t.Fatalf("response_format missing")
	}
	messages := body["messages"].([]map[string]any)
	if messages[0]["role"] != "system" {
		t.Fatalf("first message role = %v, want system", messages[0]["role"])
	}
	if content, ok := messages[0]["content"].(string); !ok || !jsonWordPatternAI.MatchString(content) {
		t.Fatalf("first message content = %#v, want JSON instruction", messages[0]["content"])
	}
	if messages[1]["content"] != "输出结构化对象，不要使用 markdown。" {
		t.Fatalf("original first message not preserved after JSON instruction: %#v", messages[1]["content"])
	}
}

func TestBuildOpenAIChatBodyJSONModeDoesNotDuplicateExistingJSONInstruction(t *testing.T) {
	body, err := buildOpenAIChatBody(TextRequest{
		Model:    "gpt-test",
		JSONMode: true,
		Messages: []Message{
			{Role: "system", Content: "Return only valid JSON."},
			{Role: "user", Content: "Analyze this script."},
		},
	}, true)
	if err != nil {
		t.Fatalf("buildOpenAIChatBody() error = %v", err)
	}

	messages := body["messages"].([]map[string]any)
	if len(messages) != 2 {
		t.Fatalf("messages len = %d, want 2", len(messages))
	}
	if messages[0]["content"] != "Return only valid JSON." {
		t.Fatalf("first message content = %#v", messages[0]["content"])
	}
}
