package scriptanalysis

import "testing"

func TestExtractJSONObjectHandlesMarkdownFence(t *testing.T) {
	payload, normalized, err := ExtractJSONObject("```json\n{\"summary\":\"测试\"}\n```")
	if err != nil {
		t.Fatalf("ExtractJSONObject returned error: %v", err)
	}
	if payload["summary"] != "测试" {
		t.Fatalf("summary = %v", payload["summary"])
	}
	if normalized != "{\"summary\":\"测试\"}" {
		t.Fatalf("normalized = %q", normalized)
	}
}

func TestExtractJSONObjectTrimsSurroundingText(t *testing.T) {
	payload, _, err := ExtractJSONObject("前置说明 {\"summary\":\"测试\",\"planned_scene_count\":2} 后置说明")
	if err != nil {
		t.Fatalf("ExtractJSONObject returned error: %v", err)
	}
	if payload["summary"] != "测试" {
		t.Fatalf("summary = %v", payload["summary"])
	}
	if payload["planned_scene_count"] != float64(2) {
		t.Fatalf("planned_scene_count = %v", payload["planned_scene_count"])
	}
}
