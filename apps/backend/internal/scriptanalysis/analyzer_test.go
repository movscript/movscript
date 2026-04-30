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
	if !strings.Contains(result.Prompt, "测试剧本") {
		t.Fatalf("prompt does not include script title")
	}
	if !strings.Contains(result.Prompt, "主剧本分析目标") {
		t.Fatalf("prompt does not include main script focus")
	}
}

func TestAnalyzerChunksAndReducesLongContent(t *testing.T) {
	caller := &fakeTextCaller{responses: []string{
		`{"summary":"片段1"}`,
		`{"summary":"片段2"}`,
		`{"summary":"合并"}`,
	}}
	longContent := strings.Repeat("一", defaultMaxChunkRunes) + "\n" + strings.Repeat("二", 20)
	result, err := NewAnalyzer(caller).Analyze(context.Background(), Request{
		Script:  model.Script{Title: "长剧本", ScriptType: "episode"},
		Content: longContent,
	})
	if err != nil {
		t.Fatalf("Analyze returned error: %v", err)
	}
	if len(caller.requests) != 3 {
		t.Fatalf("request count = %d, want 3", len(caller.requests))
	}
	if result.PartialCount != 2 {
		t.Fatalf("partial count = %d, want 2", result.PartialCount)
	}
	if result.Payload["summary"] != "合并" {
		t.Fatalf("summary = %v", result.Payload["summary"])
	}
	if result.Payload["analysis_chunks"] != 2 {
		t.Fatalf("analysis_chunks = %v, want 2", result.Payload["analysis_chunks"])
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
