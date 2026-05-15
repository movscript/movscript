package script

import "testing"

func TestNormalizeDefaultsUsesRawSourceAsCanonicalInput(t *testing.T) {
	item := ScriptSnapshot{Content: "原始剧本文档"}

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
	item := ScriptSnapshot{RawSource: "raw source only"}

	NormalizeDefaults(&item)

	if item.Content != "raw source only" {
		t.Fatalf("content = %q, want raw source", item.Content)
	}
}

func TestNewInitialVersionUsesScriptSnapshot(t *testing.T) {
	createdByID := uint(9)
	item := ScriptSnapshot{
		ID:         2,
		ProjectID:  1,
		Title:      "Draft",
		Content:    "content",
		RawSource:  "raw",
		Summary:    "summary",
		SourceType: "",
	}

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
	modelVersion := version.ToModel()
	modelVersion.ID = 17
	roundTrip := ScriptVersionFromModel(modelVersion)
	if roundTrip.ID != 17 || roundTrip.Title != "Draft" || roundTrip.Status != ScriptVersionStatusActive {
		t.Fatalf("unexpected version round-trip: %+v", roundTrip)
	}
}

func TestScriptPatchSpecAppliesZeroValuesAndNilPointers(t *testing.T) {
	assigneeID := uint(7)
	item := ScriptSnapshot{
		Title:             "Old",
		Version:           3,
		ParentScriptID:    &assigneeID,
		AssigneeID:        &assigneeID,
		PlannedSceneCount: 8,
		Order:             9,
	}
	empty := ""
	zero := 0
	var noParent *uint
	var noAssignee *uint

	item.ApplyPatch(ScriptPatchSpec{
		Title:             &empty,
		Version:           &zero,
		ParentScriptID:    &noParent,
		AssigneeID:        &noAssignee,
		PlannedSceneCount: &zero,
		Order:             &zero,
	})

	if item.Title != "" || item.Version != 0 || item.ParentScriptID != nil || item.AssigneeID != nil || item.PlannedSceneCount != 0 || item.Order != 0 {
		t.Fatalf("patch zero values not applied: %+v", item)
	}
}
