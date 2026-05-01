package handler

import (
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

func TestNormalizeScriptDefaultsUsesRawSourceAsCanonicalInput(t *testing.T) {
	s := model.Script{Content: "原始剧本文档"}

	normalizeScriptDefaults(&s)

	if s.ScriptType != "main" {
		t.Fatalf("script type = %q, want main", s.ScriptType)
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

func TestValidateSingleMainScriptRejectsSecondMainScriptErrorMessage(t *testing.T) {
	err := validateSingleMainScriptCount(model.Script{ScriptType: "main"}, 1, nil)

	if err == nil || !strings.Contains(err.Error(), "一个项目只能有一个总剧本") {
		t.Fatalf("expected single main script error, got %v", err)
	}
}

func TestValidateSingleMainScriptAllowsNonMainScript(t *testing.T) {
	err := validateSingleMainScriptCount(model.Script{ScriptType: "scene"}, 1, nil)

	if err != nil {
		t.Fatalf("expected scene script to pass, got %v", err)
	}
}

func TestValidateSingleMainScriptPropagatesQueryError(t *testing.T) {
	queryErr := gorm.ErrInvalidDB
	err := validateSingleMainScriptCount(model.Script{ScriptType: "main"}, 0, queryErr)

	if err != queryErr {
		t.Fatalf("expected query error %v, got %v", queryErr, err)
	}
}
