package handler

import (
	"testing"

	"github.com/movscript/movscript/internal/model"
)

func TestNormalizeScriptDefaultsUsesRawSourceAsCanonicalInput(t *testing.T) {
	s := model.Script{Content: "原始剧本文档"}

	normalizeScriptDefaults(&s)

	if s.ScriptType != "uncategorized" {
		t.Fatalf("script type = %q, want uncategorized", s.ScriptType)
	}
	if s.SourceType != "raw" {
		t.Fatalf("source type = %q, want raw", s.SourceType)
	}
	if s.Version != 1 {
		t.Fatalf("version = %d, want 1", s.Version)
	}
	if s.RawSource != s.Content {
		t.Fatalf("raw source = %q, content = %q", s.RawSource, s.Content)
	}
}

func TestNormalizeScriptDefaultsBackfillsContentFromRawSource(t *testing.T) {
	s := model.Script{RawSource: "raw source only"}

	normalizeScriptDefaults(&s)

	if s.Content != "raw source only" {
		t.Fatalf("content = %q, want raw source", s.Content)
	}
}
