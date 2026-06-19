package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestNormalizeAnthropicBaseURL(t *testing.T) {
	cases := map[string]string{
		"":                                "",
		"https://api.ikuncode.cc":         "https://api.ikuncode.cc",
		"https://api.ikuncode.cc/":        "https://api.ikuncode.cc",
		"https://api.ikuncode.cc/v1":      "https://api.ikuncode.cc",
		"https://api.ikuncode.cc/v1/":     "https://api.ikuncode.cc",
		"https://proxy.example/anthropic": "https://proxy.example/anthropic",
	}
	for input, want := range cases {
		if got := normalizeAnthropicBaseURL(input); !reflect.DeepEqual(got, want) {
			t.Fatalf("normalizeAnthropicBaseURL(%q) = %q, want %q", input, got, want)
		}
	}
}

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

func TestAnthropicTextStreamConsumesMessagesSSE(t *testing.T) {
	var sawStream bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" {
			t.Fatalf("path = %q, want /v1/messages", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		sawStream = strings.Contains(string(body), `"stream":true`)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(`event: message_start
data: {"type":"message_start","message":{"model":"claude-test","id":"msg_1","type":"message","role":"assistant","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":5,"cache_creation_input_tokens":0,"cache_read_input_tokens":1,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"pong"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":5,"cache_creation_input_tokens":0,"cache_read_input_tokens":1,"output_tokens":2}}

event: message_stop
data: {"type":"message_stop"}

`))
	}))
	defer server.Close()

	adapter := NewAnthropicAdapter("test-key", server.URL)
	stream, err := adapter.TextStream(context.Background(), TextRequest{
		Model:    "claude-test",
		Messages: []Message{{Role: "user", Content: "ping"}},
	})
	if err != nil {
		t.Fatalf("TextStream() error = %v", err)
	}
	var text string
	var usage TokenUsage
	var finishReason string
	var done bool
	for event := range stream {
		if event.Error != "" {
			t.Fatalf("unexpected stream error: %s", event.Error)
		}
		text += event.ContentDelta
		if event.FinishReason != "" {
			finishReason = event.FinishReason
		}
		if event.Usage.InputTokens > 0 || event.Usage.OutputTokens > 0 || event.Usage.CachedInputTokens > 0 {
			usage = event.Usage
		}
		done = done || event.Done
	}
	if !sawStream {
		t.Fatal("expected anthropic request body to enable stream")
	}
	if text != "pong" || finishReason != "end_turn" || !done {
		t.Fatalf("unexpected stream result text=%q finish=%q done=%v", text, finishReason, done)
	}
	if usage.InputTokens != 5 || usage.OutputTokens != 2 || usage.CachedInputTokens != 1 {
		t.Fatalf("unexpected usage: %#v", usage)
	}
}

func jsonContains(data []byte, fragment string) bool {
	return strings.Contains(string(data), fragment)
}
