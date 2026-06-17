package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
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
						Name:      "movscript.read_current_production",
						Arguments: `{"projectId":42,"productionId":4}`,
					},
				}},
			},
			{Role: "tool", ToolCallID: "call_1", Content: `{"results":[]}`},
		},
		Tools:      json.RawMessage(`[{"type":"function","function":{"name":"movscript.read_current_production","parameters":{"type":"object"}}}]`),
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

func TestBuildOpenAIChatBodyPreservesImageURLContentParts(t *testing.T) {
	body, err := buildOpenAIChatBody(TextRequest{
		Model: "gpt-test",
		Messages: []Message{{
			Role:    "user",
			Content: "describe",
			ContentParts: []MessageContentPart{
				{"type": "text", "text": "describe"},
				{"type": "image_url", "image_url": map[string]any{"url": "data:image/png;base64,AAAA", "detail": "low"}},
			},
		}},
	}, false)
	if err != nil {
		t.Fatalf("buildOpenAIChatBody() error = %v", err)
	}

	messages := body["messages"].([]map[string]any)
	parts := messages[0]["content"].([]map[string]any)
	if parts[0]["type"] != "text" || parts[0]["text"] != "describe" {
		t.Fatalf("text part = %#v", parts[0])
	}
	imageURL := parts[1]["image_url"].(map[string]any)
	if parts[1]["type"] != "image_url" || imageURL["url"] != "data:image/png;base64,AAAA" || imageURL["detail"] != "low" {
		t.Fatalf("image part = %#v", parts[1])
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

func TestBuildOpenAIResponsesBodyUsesResponsesShape(t *testing.T) {
	body, err := buildOpenAIResponsesBody(ResponsesRequest{
		Text: TextRequest{
			Model:       "gpt-5.2",
			MaxTokens:   64,
			Temperature: 0,
			JSONMode:    true,
			Messages: []Message{
				{Role: "user", Content: "find scenes"},
			},
		},
		Input:        json.RawMessage(`[{"role":"user","content":[{"type":"input_text","text":"find scenes"}]}]`),
		Instructions: "Be concise.",
		Tools:        json.RawMessage(`[{"type":"function","function":{"name":"movscript_search","description":"Search","parameters":{"type":"object"}}}]`),
		ToolChoice:   json.RawMessage(`{"type":"function","name":"movscript_search"}`),
	})
	if err != nil {
		t.Fatalf("buildOpenAIResponsesBody() error = %v", err)
	}
	if _, ok := body["messages"]; ok {
		t.Fatalf("responses body must not include chat messages: %#v", body)
	}
	if body["model"] != "gpt-5.2" || body["instructions"] != "Be concise." || body["max_output_tokens"] != 64 {
		t.Fatalf("unexpected basic body fields: %#v", body)
	}
	if _, ok := body["input"].([]any); !ok {
		t.Fatalf("input not decoded from raw responses input: %#v", body["input"])
	}
	text := body["text"].(map[string]any)
	format := text["format"].(map[string]any)
	if format["type"] != "json_object" {
		t.Fatalf("text format = %#v, want json_object", format)
	}
	tools := body["tools"].([]map[string]any)
	if _, ok := tools[0]["function"]; ok {
		t.Fatalf("responses tools should be flattened, got %#v", tools[0])
	}
	if tools[0]["name"] != "movscript_search" {
		t.Fatalf("tool name = %#v, want movscript_search", tools[0]["name"])
	}
}

func TestBuildOpenAIResponsesBodyMapsContentPartsToResponsesInput(t *testing.T) {
	body, err := buildOpenAIResponsesBody(ResponsesRequest{
		Text: TextRequest{
			Model: "gpt-test",
			Messages: []Message{{
				Role:    "user",
				Content: "describe",
				ContentParts: []MessageContentPart{
					{"type": "input_text", "text": "describe"},
					{"type": "image_url", "image_url": map[string]any{"url": "data:image/png;base64,AAAA"}, "detail": "high"},
				},
			}},
		},
	})
	if err != nil {
		t.Fatalf("buildOpenAIResponsesBody() error = %v", err)
	}

	input := body["input"].([]map[string]any)
	content := input[0]["content"].([]map[string]any)
	if content[0]["type"] != "input_text" || content[0]["text"] != "describe" {
		t.Fatalf("text content = %#v", content[0])
	}
	if content[1]["type"] != "input_image" || content[1]["image_url"] != "data:image/png;base64,AAAA" || content[1]["detail"] != "high" {
		t.Fatalf("image content = %#v", content[1])
	}
}

func TestOpenAIResponsesGeneratePostsResponsesEndpoint(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	adapter := NewOpenAIAdapter("https://model.example/v1", "test-key")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotPath = r.URL.Path
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("authorization = %q, want bearer key", r.Header.Get("Authorization"))
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		body := `{
			"id":"resp_test",
			"object":"response",
			"status":"completed",
			"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"connection ok"}]}],
			"usage":{"input_tokens":7,"output_tokens":2,"total_tokens":9,"input_tokens_details":{"cached_tokens":3},"output_tokens_details":{"reasoning_tokens":1}}
		}`
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(body)),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.ResponsesGenerate(context.Background(), ResponsesRequest{
		Text: TextRequest{
			Model:    "gpt-5.2",
			Messages: []Message{{Role: "user", Content: "hello"}},
		},
		Input: json.RawMessage(`"hello"`),
	})
	if err != nil {
		t.Fatalf("ResponsesGenerate() error = %v", err)
	}
	if gotPath != "/v1/responses" {
		t.Fatalf("path = %q, want /v1/responses", gotPath)
	}
	if _, ok := gotBody["messages"]; ok {
		t.Fatalf("request body used chat messages: %#v", gotBody)
	}
	if resp.Content != "connection ok" || resp.Usage.InputTokens != 7 || resp.Usage.OutputTokens != 2 || resp.Usage.CachedInputTokens != 3 || resp.Usage.ReasoningTokens != 1 {
		t.Fatalf("response = %#v, want parsed content and usage", resp)
	}
}

func TestOpenAIResponsesStreamPostsResponsesEndpoint(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	adapter := NewOpenAIAdapter("https://model.example/v1", "test-key")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotPath = r.URL.Path
		if r.Header.Get("Accept") != "text/event-stream" {
			t.Fatalf("accept = %q, want text/event-stream", r.Header.Get("Accept"))
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		body := strings.Join([]string{
			`event: response.created`,
			`data: {"type":"response.created","response":{"id":"resp_test","object":"response","status":"in_progress","model":"gpt-5.2"}}`,
			``,
			`event: response.output_item.added`,
			`data: {"type":"response.output_item.added","item":{"id":"msg_1","type":"message","role":"assistant","content":[]}}`,
			``,
			`event: response.output_text.delta`,
			`data: {"type":"response.output_text.delta","delta":"hello"}`,
			``,
			`event: response.completed`,
			`data: {"type":"response.completed","response":{"id":"resp_test","object":"response","status":"completed","usage":{"input_tokens":7,"output_tokens":2,"total_tokens":9,"input_tokens_details":{"cached_tokens":3},"output_tokens_details":{"reasoning_tokens":1}}}}`,
			``,
		}, "\n")
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
			Body:       io.NopCloser(strings.NewReader(body)),
			Request:    r,
		}, nil
	})}

	stream, err := adapter.ResponsesStream(context.Background(), ResponsesRequest{
		Text: TextRequest{
			Model:    "gpt-5.2",
			Messages: []Message{{Role: "user", Content: "hello"}},
		},
		Input: json.RawMessage(`"hello"`),
	})
	if err != nil {
		t.Fatalf("ResponsesStream() error = %v", err)
	}
	var events []ResponsesStreamEvent
	for event := range stream {
		events = append(events, event)
	}
	if gotPath != "/v1/responses" {
		t.Fatalf("path = %q, want /v1/responses", gotPath)
	}
	if gotBody["stream"] != true {
		t.Fatalf("stream = %#v, want true", gotBody["stream"])
	}
	if _, ok := gotBody["messages"]; ok {
		t.Fatalf("request body used chat messages: %#v", gotBody)
	}
	if len(events) != 4 {
		t.Fatalf("events len = %d, want 4: %#v", len(events), events)
	}
	if events[1].Type != "response.output_item.added" || !strings.Contains(events[1].Raw, `"msg_1"`) {
		t.Fatalf("item added event = %#v", events[1])
	}
	if events[2].Type != "response.output_text.delta" || events[2].Raw == "" {
		t.Fatalf("text delta event = %#v", events[2])
	}
	completed := events[3]
	if !completed.Done || completed.Usage.InputTokens != 7 || completed.Usage.OutputTokens != 2 || completed.Usage.CachedInputTokens != 3 || completed.Usage.ReasoningTokens != 1 {
		t.Fatalf("completed event = %#v, want done with parsed usage", completed)
	}
}

func TestOpenAITextGenerateParsesUsageDetails(t *testing.T) {
	adapter := NewOpenAIAdapter("https://model.example/v1", "test-key")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := `{
			"id":"chatcmpl_test",
			"object":"chat.completion",
			"choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],
			"usage":{"prompt_tokens":11,"completion_tokens":4,"total_tokens":15,"prompt_tokens_details":{"cached_tokens":6},"completion_tokens_details":{"reasoning_tokens":2}}
		}`
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(body)),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.TextGenerate(context.Background(), TextRequest{
		Model:    "gpt-test",
		Messages: []Message{{Role: "user", Content: "hello"}},
	})
	if err != nil {
		t.Fatalf("TextGenerate() error = %v", err)
	}
	if resp.Usage.InputTokens != 11 || resp.Usage.OutputTokens != 4 || resp.Usage.CachedInputTokens != 6 || resp.Usage.ReasoningTokens != 2 {
		t.Fatalf("usage = %#v, want detailed usage", resp.Usage)
	}
}
