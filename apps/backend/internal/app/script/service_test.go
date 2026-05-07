package script

import (
	"context"
	"path/filepath"
	"testing"

	dto "github.com/movscript/movscript/internal/app/dto"
	"github.com/movscript/movscript/internal/domain/model"
	domainscript "github.com/movscript/movscript/internal/domain/script"
	"gorm.io/driver/sqlite"
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

func TestEnsureInitialVersionSyncsRelationsWithoutHooks(t *testing.T) {
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
	if version.Title != "Pilot Revised" {
		t.Fatalf("version title = %q, want revised", version.Title)
	}
	assertScriptRelationExists(t, db, updated.ID, version.ID, model.EntityRelationTypeHasVersion, "confirmed")
}

func newScriptTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "script.db")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.EntityRelation{}, &model.Script{}, &model.ScriptVersion{}); err != nil {
		t.Fatalf("migrate script db: %v", err)
	}
	return db
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
