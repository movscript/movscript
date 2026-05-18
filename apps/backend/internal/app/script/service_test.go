package script

import (
	"context"
	"testing"

	dto "github.com/movscript/movscript/internal/app/dto"
	domainscript "github.com/movscript/movscript/internal/domain/script"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestNormalizeDefaultsUsesRawSourceAsCanonicalInput(t *testing.T) {
	item := domainscript.ScriptSnapshot{Content: "原始剧本文档"}

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
	item := domainscript.ScriptSnapshot{RawSource: "raw source only"}

	NormalizeDefaults(&item)

	if item.Content != "raw source only" {
		t.Fatalf("content = %q, want raw source", item.Content)
	}
}

func TestCreateScriptDoesNotCreateEmptyInitialVersion(t *testing.T) {
	db := newScriptTestDB(t)
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	ctx := context.Background()

	item, err := service.Create(ctx, CreateInput{
		ProjectID: 1,
		AuthorID:  1,
		Script:    dto.ScriptInput{Title: "Empty Draft"},
	})
	if err != nil {
		t.Fatalf("create script: %v", err)
	}

	var count int64
	if err := db.Model(&model.ScriptVersion{}).Where("project_id = ? AND script_id = ?", 1, item.ID).Count(&count).Error; err != nil {
		t.Fatalf("count versions: %v", err)
	}
	if count != 0 {
		t.Fatalf("empty script version count = %d, want 0", count)
	}
}

func TestEnsureInitialVersionCreatesImmutableSnapshotWithoutHooks(t *testing.T) {
	db := newScriptTestDB(t)
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	ctx := context.Background()

	item, err := service.Create(ctx, CreateInput{
		ProjectID: 1,
		AuthorID:  1,
		Script:    dtoScriptInput("Pilot"),
	})
	if err != nil {
		t.Fatalf("create script: %v", err)
	}

	var version model.ScriptVersion
	if err := db.First(&version, "project_id = ? AND script_id = ? AND version_number = 1", 1, item.ID).Error; err != nil {
		t.Fatalf("load version: %v", err)
	}
	originalUpdatedAt := version.UpdatedAt
	assertScriptRelationExists(t, db, item.ID, version.ID, model.EntityRelationTypeHasVersion, "confirmed")

	updated, err := service.Update(ctx, UpdateInput{
		ID:     item.ID,
		Script: dtoScriptInput("Pilot Revised"),
	})
	if err != nil {
		t.Fatalf("update script: %v", err)
	}
	if err := db.First(&version, "project_id = ? AND script_id = ? AND version_number = 1", 1, updated.ID).Error; err != nil {
		t.Fatalf("reload version: %v", err)
	}
	if version.Title != "Pilot" {
		t.Fatalf("version title = %q, want original snapshot", version.Title)
	}
	if !version.UpdatedAt.Equal(originalUpdatedAt) {
		t.Fatalf("version updated_at changed after script update: got %v, want %v", version.UpdatedAt, originalUpdatedAt)
	}
	assertScriptRelationExists(t, db, updated.ID, version.ID, model.EntityRelationTypeHasVersion, "confirmed")
}

func newScriptTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "script.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &model.EntityRelation{}, &model.Script{}, &model.ScriptVersion{})
}

func dtoScriptInput(title string) dto.ScriptInput {
	return dto.ScriptInput{Title: title, Content: "content"}
}

func assertScriptRelationExists(t *testing.T, db *gorm.DB, scriptID uint, versionID uint, relationType string, status string) {
	t.Helper()
	var relation model.EntityRelation
	if err := db.Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND type = ?", "script", scriptID, "script_version", versionID, relationType).First(&relation).Error; err != nil {
		t.Fatalf("load relation: %v", err)
	}
	if relation.Status != status {
		t.Fatalf("relation status = %q, want %q", relation.Status, status)
	}
}
