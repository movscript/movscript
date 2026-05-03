package script

import (
	"testing"

	"github.com/movscript/movscript/internal/model"
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
