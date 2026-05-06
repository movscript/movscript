package script

import (
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
)

func TestNormalizeDefaultsUsesRawSourceAsCanonicalInput(t *testing.T) {
	item := model.Script{Content: "原始剧本文档"}

	NormalizeDefaults(&item)

	if item.ScriptType != "uncategorized" {
		t.Fatalf("script type = %q, want uncategorized", item.ScriptType)
	}
	if item.SourceType != "raw" {
		t.Fatalf("source type = %q, want raw", item.SourceType)
	}
	if item.Version != 1 {
		t.Fatalf("version = %d, want 1", item.Version)
	}
	if item.RawSource != item.Content {
		t.Fatalf("raw source = %q, content = %q", item.RawSource, item.Content)
	}
}

func TestNormalizeDefaultsBackfillsContentFromRawSource(t *testing.T) {
	item := model.Script{RawSource: "raw source only"}

	NormalizeDefaults(&item)

	if item.Content != "raw source only" {
		t.Fatalf("content = %q, want raw source", item.Content)
	}
}

func TestNewInitialVersionUsesScriptSnapshot(t *testing.T) {
	createdByID := uint(9)
	item := model.Script{
		ProjectID:  1,
		Title:      "Draft",
		Content:    "content",
		RawSource:  "raw",
		Summary:    "summary",
		SourceType: "",
	}
	item.ID = 2

	version := NewInitialVersion(item, &createdByID)

	if version.ProjectID != 1 || version.ScriptID != 2 || version.VersionNumber != 1 {
		t.Fatalf("unexpected version identity: %+v", version)
	}
	if version.SourceType != ScriptSourceTypeRaw || version.Status != ScriptVersionStatusActive {
		t.Fatalf("unexpected version defaults: %+v", version)
	}
	if version.Title != "Draft" || version.Content != "content" || version.RawSource != "raw" || version.Summary != "summary" {
		t.Fatalf("unexpected version snapshot: %+v", version)
	}
	if version.CreatedByID == nil || *version.CreatedByID != createdByID {
		t.Fatalf("created by = %#v, want %d", version.CreatedByID, createdByID)
	}
}
