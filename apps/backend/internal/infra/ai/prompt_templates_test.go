package ai

import (
	"strings"
	"testing"
)

func TestBuildProductionOrchestrationPromptUsesPlainTextContext(t *testing.T) {
	prompt := BuildProductionOrchestrationPrompt(ProductionOrchestrationPromptInput{
		Context: PromptContext{
			ProjectID:       12,
			ProjectName:     "雨夜剧院",
			ProductionID:    34,
			ProductionName:  "第一集制作",
			ScriptVersionID: 56,
			ScriptTitle:     "第一集初稿",
		},
		SourceText:    "主角在雨夜进入废弃剧院。",
		ExistingBrief: "已有片段：无。",
	})

	if prompt.Name != FeatureProductionOrchestrate {
		t.Fatalf("prompt name = %q", prompt.Name)
	}
	if !prompt.JSONMode {
		t.Fatalf("expected JSONMode")
	}
	if len(prompt.Messages) != 2 {
		t.Fatalf("expected system + user messages, got %d", len(prompt.Messages))
	}
	user := prompt.Messages[1].Content
	for _, want := range []string{"兼容入口", "project_id: 12", "project_name: 雨夜剧院", "production_id: 34", "production_name: 第一集制作", "backend_prompt_deprecated"} {
		if !strings.Contains(user, want) {
			t.Fatalf("user prompt missing %q:\n%s", want, user)
		}
	}
	for _, unwanted := range []string{"剧本文本", "主角在雨夜进入废弃剧院。", "编排段功能名", "scene_moments", "content_units"} {
		if strings.Contains(user, unwanted) {
			t.Fatalf("compat prompt should not keep orchestration instructions %q:\n%s", unwanted, user)
		}
	}
	if strings.Contains(user, `{"project_id"`) {
		t.Fatalf("user prompt should not encode context as JSON: %s", user)
	}
	if !strings.Contains(prompt.Compiled, "[system]") || !strings.Contains(prompt.Compiled, "[user]") {
		t.Fatalf("compiled prompt missing role sections:\n%s", prompt.Compiled)
	}
}
