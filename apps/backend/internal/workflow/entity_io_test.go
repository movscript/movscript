package workflow

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/model"
)

func TestEntityFieldUpdatesUseSchemaStorageMapping(t *testing.T) {
	updates := entityFieldUpdates("script", map[string]EntityPortValue{
		"title":    {Type: "text", Text: "New title"},
		"settings": {Type: "json", JSON: map[string]any{"world": "near future"}},
		"result":   {Type: "resource", ResourceIDs: []uint{7}},
	})

	if got := updates["title"]; got != "New title" {
		t.Fatalf("expected title update, got %#v", got)
	}
	if got := updates["core_settings"]; got != `{"world":"near future"}` {
		t.Fatalf("expected settings to map to core_settings JSON text, got %#v", got)
	}
	if _, ok := updates["result"]; ok {
		t.Fatalf("resource binding port should not produce field update: %#v", updates)
	}
}

func TestEntityFieldUpdatesPreserveShotPromptCompatibility(t *testing.T) {
	updates := entityFieldUpdates("shot", map[string]EntityPortValue{
		"prompt": {Type: "text", Text: "final camera prompt"},
	})

	if got := updates["prompt"]; got != "final camera prompt" {
		t.Fatalf("expected prompt update, got %#v", got)
	}
	if got := updates["final_prompt"]; got != "final camera prompt" {
		t.Fatalf("expected final_prompt compatibility update, got %#v", got)
	}
}

func TestValidateEntityPortValuesRejectsReadonlyPort(t *testing.T) {
	err := validateEntityPortValues("episode", map[string]EntityPortValue{
		"script": {Type: "text", Text: "read-only script body"},
	})
	if err == nil || !strings.Contains(err.Error(), "not writable") {
		t.Fatalf("expected readonly port error, got %v", err)
	}
}

func TestValidateEntityPortValuesRejectsTypeMismatch(t *testing.T) {
	err := validateEntityPortValues("shot", map[string]EntityPortValue{
		"video": {Type: "text", Text: "not a resource"},
	})
	if err == nil || !strings.Contains(err.Error(), "expects video") {
		t.Fatalf("expected type mismatch error, got %v", err)
	}
}

func TestBuildEntityWriteAuditsCapturesPortContext(t *testing.T) {
	audits := buildEntityWriteAudits(
		"storyboard",
		9,
		map[string]EntityPortValue{
			"description": {Type: "text", Text: "new description"},
			"image":       {Type: "image", ResourceIDs: []uint{77}},
		},
		map[string]EntityPortValue{
			"description": {Type: "text", Text: "old description"},
		},
		map[string][]uint{
			"image": {101, 102},
		},
		EntityWriteMeta{CanvasID: 1, RunID: 2, NodeID: "node-a", UserID: 3},
	)

	if len(audits) != 2 {
		t.Fatalf("expected two audits, got %d", len(audits))
	}

	byPort := map[string]model.CanvasEntityWriteAudit{}
	for i := range audits {
		audit := audits[i]
		if audit.CanvasID != 1 || audit.CanvasRunID != 2 || audit.CanvasNodeID != "node-a" || audit.UserID != 3 {
			t.Fatalf("audit context was not preserved: %#v", audit)
		}
		if audit.EntityKind != "storyboard" || audit.EntityID != 9 {
			t.Fatalf("entity context was not preserved: %#v", audit)
		}
		byPort[audit.PortID] = audit
	}

	descriptionAudit, ok := byPort["description"]
	if !ok {
		t.Fatalf("missing description audit: %#v", audits)
	}
	assertAuditPayload(t, descriptionAudit.OldValueJSON, "text", "old description", nil)
	assertAuditPayload(t, descriptionAudit.NewValueJSON, "text", "new description", nil)
	if descriptionAudit.ResourceBindingIDs != "null" {
		t.Fatalf("expected null binding ids for text field, got %s", descriptionAudit.ResourceBindingIDs)
	}

	imageAudit, ok := byPort["image"]
	if !ok {
		t.Fatalf("missing image audit: %#v", audits)
	}
	assertAuditPayload(t, imageAudit.OldValueJSON, "", "", nil)
	assertAuditPayload(t, imageAudit.NewValueJSON, "image", "", []float64{77})
	if imageAudit.ResourceBindingIDs != "[101,102]" {
		t.Fatalf("expected resource binding ids, got %s", imageAudit.ResourceBindingIDs)
	}
}

func assertAuditPayload(t *testing.T, raw string, wantType string, wantText string, wantResourceIDs []float64) {
	t.Helper()
	if raw == "" {
		if wantType == "" && wantText == "" && len(wantResourceIDs) == 0 {
			return
		}
		t.Fatalf("expected audit payload, got empty")
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("invalid audit payload %q: %v", raw, err)
	}
	if got := payload["type"]; got != wantType {
		t.Fatalf("expected type %q, got %#v in %s", wantType, got, raw)
	}
	if wantText != "" {
		if got := payload["text"]; got != wantText {
			t.Fatalf("expected text %q, got %#v in %s", wantText, got, raw)
		}
	}
	if wantResourceIDs != nil {
		got, ok := payload["resource_ids"].([]any)
		if !ok {
			t.Fatalf("expected resource_ids in %s", raw)
		}
		if len(got) != len(wantResourceIDs) {
			t.Fatalf("expected %d resource ids, got %d in %s", len(wantResourceIDs), len(got), raw)
		}
		for i, want := range wantResourceIDs {
			if got[i] != want {
				t.Fatalf("expected resource id %.0f at %d, got %#v in %s", want, i, got[i], raw)
			}
		}
	}
}
