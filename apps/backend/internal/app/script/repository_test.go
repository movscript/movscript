package script

import (
	"context"
	"path/filepath"
	"testing"

	domainscript "github.com/movscript/movscript/internal/domain/script"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestGormRepositoryPatchScriptPersistsSpecZeroValues(t *testing.T) {
	db := newScriptRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	assigneeID := uint(7)
	row := model.Script{
		ProjectID:             1,
		Title:                 "Old",
		ScriptType:            "main",
		SourceType:            domainscript.ScriptSourceTypeRaw,
		Version:               3,
		ParentScriptID:        &assigneeID,
		AssigneeID:            &assigneeID,
		PlannedSceneCount:     8,
		PlannedCharacterCount: 2,
		Order:                 9,
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	item := domainscript.ScriptSnapshotFromModel(row)
	empty := ""
	zero := 0
	var noParent *uint
	var noAssignee *uint

	if err := repo.PatchScript(context.Background(), &item, domainscript.ScriptPatchSpec{
		Title:             &empty,
		Version:           &zero,
		ParentScriptID:    &noParent,
		AssigneeID:        &noAssignee,
		PlannedSceneCount: &zero,
		Order:             &zero,
	}); err != nil {
		t.Fatalf("PatchScript() error = %v", err)
	}

	var stored model.Script
	if err := db.First(&stored, row.ID).Error; err != nil {
		t.Fatalf("load script: %v", err)
	}
	if stored.Title != "" || stored.Version != 0 || stored.ParentScriptID != nil || stored.AssigneeID != nil || stored.PlannedSceneCount != 0 || stored.Order != 0 {
		t.Fatalf("zero-value patch was not persisted: %+v", stored)
	}
}

func newScriptRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "script_repository.db")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.EntityRelation{}, &model.Script{}, &model.ScriptVersion{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}
