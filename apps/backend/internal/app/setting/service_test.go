package setting

import (
	"context"
	"path/filepath"
	"strconv"
	"testing"

	dto "github.com/movscript/movscript/internal/app/dto"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestScriptSettingRefSyncsRelationsWithoutHooks(t *testing.T) {
	db := newSettingTestDB(t)
	ctx := context.Background()
	script, setting := createSettingRelationFixtures(t, db)
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))

	ref, err := service.CreateRef(ctx, 1, dto.ScriptSettingRefInput{
		ScriptID:     script.ID,
		SettingID:    setting.ID,
		Role:         "location",
		Scope:        "scene",
		FirstMention: "act one",
		Evidence:     "script text",
		State:        "confirmed",
		Confidence:   0.8,
	})
	if err != nil {
		t.Fatalf("create ref: %v", err)
	}
	assertSettingRelationExists(t, db, "script", script.ID, "setting", setting.ID, model.EntityRelationTypeUses)
	assertSettingRelationMetadataExists(t, db, "script_setting_ref_id", ref.ID)

	if err := service.DeleteRef(ctx, ref.ID); err != nil {
		t.Fatalf("delete ref: %v", err)
	}
	assertSettingRelationMissing(t, db, "script", script.ID, "setting", setting.ID, model.EntityRelationTypeUses)
	assertSettingRelationMetadataMissing(t, db, "script_setting_ref_id", ref.ID)
}

func TestSettingRelationshipSyncsRelationsWithoutHooks(t *testing.T) {
	db := newSettingTestDB(t)
	ctx := context.Background()
	_, source := createSettingRelationFixtures(t, db)
	target := model.Setting{ProjectID: 1, Type: "location", Name: "Harbor"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&target).Error; err != nil {
		t.Fatalf("create target setting: %v", err)
	}
	service := NewService(db.Session(&gorm.Session{SkipHooks: true}))

	item, err := service.CreateRelationship(ctx, 1, dto.SettingRelationshipInput{
		SourceSettingID: source.ID,
		TargetSettingID: target.ID,
		Category:        model.EntityRelationCategorySetting,
		Type:            model.EntityRelationTypeRelatedTo,
		Label:           "near",
		Description:     "same city",
	})
	if err != nil {
		t.Fatalf("create relationship: %v", err)
	}
	assertSettingRelationExists(t, db, "setting", source.ID, "setting", target.ID, model.EntityRelationTypeRelatedTo)
	assertSettingRelationMetadataExists(t, db, "setting_relationship_id", item.ID)

	if err := service.DeleteRelationship(ctx, item.ID); err != nil {
		t.Fatalf("delete relationship: %v", err)
	}
	assertSettingRelationMissing(t, db, "setting", source.ID, "setting", target.ID, model.EntityRelationTypeRelatedTo)
	assertSettingRelationMetadataMissing(t, db, "setting_relationship_id", item.ID)
}

func newSettingTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "setting.db")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&model.EntityRelation{},
		&model.Script{},
		&model.Setting{},
		&model.ScriptSettingRef{},
		&model.SettingRelationship{},
	); err != nil {
		t.Fatalf("migrate setting db: %v", err)
	}
	return db
}

func createSettingRelationFixtures(t *testing.T, db *gorm.DB) (model.Script, model.Setting) {
	t.Helper()
	script := model.Script{ProjectID: 1, Title: "Pilot", AuthorID: 1}
	setting := model.Setting{ProjectID: 1, Type: "location", Name: "Bridge"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&setting).Error; err != nil {
		t.Fatalf("create setting: %v", err)
	}
	return script, setting
}

func assertSettingRelationExists(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) {
	t.Helper()
	if countSettingRelations(t, db, sourceType, sourceID, targetType, targetID, relationType) != 1 {
		t.Fatalf("expected relation %s:%d -> %s:%d type %s", sourceType, sourceID, targetType, targetID, relationType)
	}
}

func assertSettingRelationMissing(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) {
	t.Helper()
	if count := countSettingRelations(t, db, sourceType, sourceID, targetType, targetID, relationType); count != 0 {
		t.Fatalf("expected relation %s:%d -> %s:%d type %s to be missing, got %d", sourceType, sourceID, targetType, targetID, relationType, count)
	}
}

func countSettingRelations(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND type = ?", sourceType, sourceID, targetType, targetID, relationType).
		Count(&count).Error; err != nil {
		t.Fatalf("count relation: %v", err)
	}
	return count
}

func assertSettingRelationMetadataExists(t *testing.T, db *gorm.DB, marker string, id uint) {
	t.Helper()
	if countSettingRelationMetadata(t, db, marker, id) == 0 {
		t.Fatalf("expected relation metadata marker %s=%d", marker, id)
	}
}

func assertSettingRelationMetadataMissing(t *testing.T, db *gorm.DB, marker string, id uint) {
	t.Helper()
	if count := countSettingRelationMetadata(t, db, marker, id); count != 0 {
		t.Fatalf("expected relation metadata marker %s=%d to be missing, got %d", marker, id, count)
	}
}

func countSettingRelationMetadata(t *testing.T, db *gorm.DB, marker string, id uint) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("metadata_json LIKE ?", `%`+marker+`":`+strconv.FormatUint(uint64(id), 10)+`%`).
		Count(&count).Error; err != nil {
		t.Fatalf("count relation metadata: %v", err)
	}
	return count
}
