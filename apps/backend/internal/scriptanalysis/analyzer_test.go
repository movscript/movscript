package scriptanalysis

import (
	"context"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/model"
)

type fakeTextCaller struct {
	responses []string
	requests  []ai.TextRequest
}

func (f *fakeTextCaller) CallText(_ context.Context, _, _ uint, req ai.TextRequest) (ai.TextResponse, error) {
	f.requests = append(f.requests, req)
	index := len(f.requests) - 1
	if index >= len(f.responses) {
		return ai.TextResponse{Content: `{"summary":"default"}`}, nil
	}
	return ai.TextResponse{Content: f.responses[index]}, nil
}

type fakeStreamTextCaller struct {
	fakeTextCaller
	events []ai.TextStreamEvent
}

func (f *fakeStreamTextCaller) CallTextStream(_ context.Context, _, _ uint, req ai.TextRequest) (<-chan ai.TextStreamEvent, error) {
	f.requests = append(f.requests, req)
	out := make(chan ai.TextStreamEvent, len(f.events))
	for _, event := range f.events {
		out <- event
	}
	close(out)
	return out, nil
}

func TestAnalyzerSinglePass(t *testing.T) {
	caller := &fakeTextCaller{responses: []string{`{"summary":"完整分析","episode_scripts":[{"id":"ep1","title":"第一集","outline":"开端","content":"第1集正文"}]}`}}
	result, err := NewAnalyzer(caller).Analyze(context.Background(), Request{
		UserID:        1,
		ModelConfigID: 2,
		Script:        model.Script{Title: "测试剧本", ScriptType: "main", Version: 1},
		Content:       "短剧本",
	})
	if err != nil {
		t.Fatalf("Analyze returned error: %v", err)
	}
	if result.Payload["summary"] != "完整分析" {
		t.Fatalf("summary = %v", result.Payload["summary"])
	}
	candidates, ok := result.Payload["entity_candidates"].([]interface{})
	if !ok || len(candidates) != 1 {
		t.Fatalf("entity candidates = %#v, want projected episode candidate", result.Payload["entity_candidates"])
	}
	candidate, ok := candidates[0].(map[string]interface{})
	if !ok || candidate["type"] != "episode" {
		t.Fatalf("entity candidate = %#v, want projected episode candidate", candidates[0])
	}
	if len(caller.requests) != 1 {
		t.Fatalf("request count = %d, want 1", len(caller.requests))
	}
	if !caller.requests[0].JSONMode {
		t.Fatalf("JSONMode = false, want true")
	}
	if caller.requests[0].MaxTokens != ai.DefaultTextMaxTokens {
		t.Fatalf("MaxTokens = %d, want %d", caller.requests[0].MaxTokens, ai.DefaultTextMaxTokens)
	}
	if !strings.Contains(result.Prompt, "测试剧本") {
		t.Fatalf("prompt does not include script title")
	}
	if !strings.Contains(result.Prompt, "主剧本分析目标") {
		t.Fatalf("prompt does not include main script focus")
	}
}

func TestAnalyzerUsesFullContextForLongContent(t *testing.T) {
	caller := &fakeTextCaller{responses: []string{`{"summary":"完整长剧本分析"}`}}
	longContent := strings.Repeat("一", defaultMaxChunkRunes) + "\n" + strings.Repeat("二", 20)
	result, err := NewAnalyzer(caller).Analyze(context.Background(), Request{
		Script:  model.Script{Title: "长剧本", ScriptType: "episode"},
		Content: longContent,
	})
	if err != nil {
		t.Fatalf("Analyze returned error: %v", err)
	}
	if len(caller.requests) != 1 {
		t.Fatalf("request count = %d, want 1 full-context request", len(caller.requests))
	}
	if result.PartialCount != 0 {
		t.Fatalf("partial count = %d, want 0", result.PartialCount)
	}
	if result.Payload["summary"] != "完整长剧本分析" {
		t.Fatalf("summary = %v", result.Payload["summary"])
	}
	if !strings.Contains(result.Prompt, strings.Repeat("二", 20)) {
		t.Fatalf("prompt does not include full long content tail")
	}
}

func TestAnalyzerUsesSceneSpecificPrompt(t *testing.T) {
	caller := &fakeTextCaller{responses: []string{`{"title":"雨夜巷口","time_text":"深夜","location_text":"巷口","plot_beats":[{"id":"b1","plot":"相遇"}]}`}}
	result, err := NewAnalyzer(caller).Analyze(context.Background(), Request{
		Script:  model.Script{Title: "场1", ScriptType: "scene"},
		Content: "深夜，巷口。两人相遇。",
	})
	if err != nil {
		t.Fatalf("Analyze returned error: %v", err)
	}
	if result.Payload["time_text"] != "深夜" {
		t.Fatalf("time_text = %v, want 深夜", result.Payload["time_text"])
	}
	if !strings.Contains(result.Prompt, "分场剧本分析目标") {
		t.Fatalf("prompt does not include scene script focus")
	}
}

func TestAnalyzerReturnsRawResponseWhenJSONParseFails(t *testing.T) {
	caller := &fakeTextCaller{responses: []string{`这不是 JSON，但需要返回给前端调试`}}
	result, err := NewAnalyzer(caller).Analyze(context.Background(), Request{
		Script:  model.Script{Title: "测试剧本", ScriptType: "main"},
		Content: "短剧本",
	})
	if err != nil {
		t.Fatalf("Analyze returned error: %v", err)
	}
	if len(result.Payload) != 0 {
		t.Fatalf("payload = %#v, want empty object", result.Payload)
	}
	if result.RawResponse != "这不是 JSON，但需要返回给前端调试" {
		t.Fatalf("raw response = %q", result.RawResponse)
	}
}

func TestAnalyzerStreamReturnsRawResponseWhenJSONParseFails(t *testing.T) {
	caller := &fakeStreamTextCaller{
		events: []ai.TextStreamEvent{
			{ContentDelta: "非 JSON "},
			{ContentDelta: "流式内容"},
			{Done: true},
		},
	}
	result, err := NewAnalyzer(caller).AnalyzeStream(context.Background(), Request{
		Script:  model.Script{Title: "测试剧本", ScriptType: "main"},
		Content: "短剧本",
	}, nil)
	if err != nil {
		t.Fatalf("AnalyzeStream returned error: %v", err)
	}
	if len(result.Payload) != 0 {
		t.Fatalf("payload = %#v, want empty object", result.Payload)
	}
	if result.RawResponse != "非 JSON 流式内容" {
		t.Fatalf("raw response = %q", result.RawResponse)
	}
}

func TestAnalyzerStreamReturnsErrorWhenNoContentArrives(t *testing.T) {
	caller := &fakeStreamTextCaller{
		events: []ai.TextStreamEvent{
			{ReasoningDelta: "正在分析"},
			{FinishReason: "content_filter"},
			{Done: true},
		},
	}
	var emitted []StreamEvent
	_, err := NewAnalyzer(caller).AnalyzeStream(context.Background(), Request{
		Script:  model.Script{Title: "测试剧本", ScriptType: "main"},
		Content: "短剧本",
	}, func(event StreamEvent) {
		emitted = append(emitted, event)
	})
	if err == nil {
		t.Fatalf("AnalyzeStream returned nil error, want no-content error")
	}
	if !strings.Contains(err.Error(), "AI stream returned no content") {
		t.Fatalf("error = %q, want no-content detail", err.Error())
	}
	if !strings.Contains(err.Error(), "reasoning_events=1") {
		t.Fatalf("error = %q, want reasoning event detail", err.Error())
	}
	if !strings.Contains(err.Error(), "finish_reason=content_filter") {
		t.Fatalf("error = %q, want finish reason detail", err.Error())
	}
	if len(emitted) != 1 || emitted[0].Kind != "reasoning" || emitted[0].Delta != "正在分析" {
		t.Fatalf("emitted = %#v, want one reasoning progress event", emitted)
	}
}

func TestAnalyzerStreamReturnsReceiveErrorDuringReasoning(t *testing.T) {
	caller := &fakeStreamTextCaller{
		events: []ai.TextStreamEvent{
			{ReasoningDelta: "正在分析"},
			{Error: "volcen text stream receive: context deadline exceeded"},
		},
	}
	var emitted []StreamEvent
	_, err := NewAnalyzer(caller).AnalyzeStream(context.Background(), Request{
		Script:  model.Script{Title: "测试剧本", ScriptType: "main"},
		Content: "短剧本",
	}, func(event StreamEvent) {
		emitted = append(emitted, event)
	})
	if err == nil {
		t.Fatalf("AnalyzeStream returned nil error, want receive error")
	}
	if !strings.Contains(err.Error(), "volcen text stream receive") {
		t.Fatalf("error = %q, want stream receive detail", err.Error())
	}
	if strings.Contains(err.Error(), "AI stream returned no content") {
		t.Fatalf("error = %q, should not be reported as no content", err.Error())
	}
	if len(emitted) != 1 || emitted[0].Kind != "reasoning" || emitted[0].Delta != "正在分析" {
		t.Fatalf("emitted = %#v, want reasoning event before error", emitted)
	}
}

func TestAnalyzerStreamUsesFullContextForLongContent(t *testing.T) {
	caller := &fakeStreamTextCaller{
		events: []ai.TextStreamEvent{
			{ContentDelta: `{"summary":"完整流式长剧本分析"}`},
			{Done: true},
		},
	}
	var emitted []StreamEvent
	longContent := strings.Repeat("一", defaultMaxChunkRunes) + "\n" + strings.Repeat("二", 20)
	result, err := NewAnalyzer(caller).AnalyzeStream(context.Background(), Request{
		Script:  model.Script{Title: "长剧本", ScriptType: "episode"},
		Content: longContent,
	}, func(event StreamEvent) {
		emitted = append(emitted, event)
	})
	if err != nil {
		t.Fatalf("AnalyzeStream returned error: %v", err)
	}
	if len(caller.requests) != 1 {
		t.Fatalf("request count = %d, want 1 full-context streaming request", len(caller.requests))
	}
	if caller.requests[0].MaxTokens != ai.DefaultTextMaxTokens {
		t.Fatalf("MaxTokens = %d, want %d", caller.requests[0].MaxTokens, ai.DefaultTextMaxTokens)
	}
	if result.PartialCount != 0 {
		t.Fatalf("partial count = %d, want 0", result.PartialCount)
	}
	if result.Payload["summary"] != "完整流式长剧本分析" {
		t.Fatalf("summary = %v", result.Payload["summary"])
	}
	if !strings.Contains(result.Prompt, strings.Repeat("二", 20)) {
		t.Fatalf("prompt does not include full long content tail")
	}
	deltas := 0
	for _, event := range emitted {
		if event.Kind == "delta" {
			deltas++
		}
	}
	if deltas != 1 {
		t.Fatalf("delta event count = %d, want 1", deltas)
	}
}
