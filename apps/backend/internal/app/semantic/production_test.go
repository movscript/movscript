package semantic

import (
	"context"
	"errors"
	"strconv"
	"testing"

	"github.com/movscript/movscript/internal/app/coregraph"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestPatchProductionAllowsSourceChangeBeforeDerivedItems(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	_, firstVersion, secondVersion := seedProductionScriptVersions(t, db, 1)
	production := model.Production{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: "Production", SourceType: "script", Status: "planning"}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}

	patched, err := service.PatchProduction(context.Background(), 1, strconv.FormatUint(uint64(production.ID), 10), ProductionInput{
		ScriptVersionID: &secondVersion.ID,
		Name:            "Production v2",
		SourceType:      "script",
		Status:          "planning",
	})
	if err != nil {
		t.Fatalf("PatchProduction() error = %v", err)
	}
	if patched.ScriptVersionID == nil || *patched.ScriptVersionID != secondVersion.ID {
		t.Fatalf("script version id = %v, want %d", patched.ScriptVersionID, secondVersion.ID)
	}
}

func TestPatchProductionRejectsSourceChangeAfterDerivedItems(t *testing.T) {
	cases := []struct {
		name string
		seed func(t *testing.T, db *gorm.DB, production model.Production)
	}{
		{
			name: "production text block",
			seed: func(t *testing.T, db *gorm.DB, production model.Production) {
				t.Helper()
				block := model.ProductionTextBlock{ProjectID: production.ProjectID, ProductionID: production.ID, Title: "Brief", Content: "Locked source", Status: "active"}
				if err := db.Create(&block).Error; err != nil {
					t.Fatalf("create production text block: %v", err)
				}
				syncSemanticTestRelations(t, db, &block)
			},
		},
		{
			name: "segment",
			seed: func(t *testing.T, db *gorm.DB, production model.Production) {
				t.Helper()
				segment := model.Segment{ProjectID: production.ProjectID, ProductionID: &production.ID, Title: "Segment", Status: "confirmed"}
				if err := db.Create(&segment).Error; err != nil {
					t.Fatalf("create segment: %v", err)
				}
				syncSemanticTestRelations(t, db, &segment)
			},
		},
		{
			name: "content unit",
			seed: func(t *testing.T, db *gorm.DB, production model.Production) {
				t.Helper()
				unit := model.ContentUnit{ProjectID: production.ProjectID, ProductionID: &production.ID, Title: "Unit", Status: "draft"}
				if err := db.Create(&unit).Error; err != nil {
					t.Fatalf("create content unit: %v", err)
				}
				syncSemanticTestRelations(t, db, &unit)
			},
		},
		{
			name: "keyframe",
			seed: func(t *testing.T, db *gorm.DB, production model.Production) {
				t.Helper()
				keyframe := model.Keyframe{ProjectID: production.ProjectID, ProductionID: &production.ID, Title: "Keyframe", Status: "candidate"}
				if err := db.Create(&keyframe).Error; err != nil {
					t.Fatalf("create keyframe: %v", err)
				}
				syncSemanticTestRelations(t, db, &keyframe)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := newProductionTestDB(t)
			service := NewService(db)
			_, firstVersion, secondVersion := seedProductionScriptVersions(t, db, 1)
			production := model.Production{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: "Production", SourceType: "script", Status: "planning"}
			if err := db.Create(&production).Error; err != nil {
				t.Fatalf("create production: %v", err)
			}
			tc.seed(t, db, production)

			_, err := service.PatchProduction(context.Background(), 1, strconv.FormatUint(uint64(production.ID), 10), ProductionInput{
				ScriptVersionID: &secondVersion.ID,
				Name:            "Moved source",
				SourceType:      "script",
				Status:          "planning",
			})
			var invalid ErrInvalidInput
			if !errors.As(err, &invalid) {
				t.Fatalf("PatchProduction() error = %v, want ErrInvalidInput", err)
			}

			var persisted model.Production
			if err := db.First(&persisted, production.ID).Error; err != nil {
				t.Fatalf("load production: %v", err)
			}
			if persisted.ScriptVersionID == nil || *persisted.ScriptVersionID != firstVersion.ID {
				t.Fatalf("script version changed to %v, want %d", persisted.ScriptVersionID, firstVersion.ID)
			}
		})
	}
}

func TestPatchProductionAllowsMetadataAfterDerivedItems(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	_, firstVersion, _ := seedProductionScriptVersions(t, db, 1)
	production := model.Production{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: "Production", SourceType: "script", Status: "planning"}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}
	segment := model.Segment{ProjectID: 1, ProductionID: &production.ID, Title: "Segment", Status: "confirmed"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	syncSemanticTestRelations(t, db, &segment)

	patched, err := service.PatchProduction(context.Background(), 1, strconv.FormatUint(uint64(production.ID), 10), ProductionInput{
		ScriptVersionID: &firstVersion.ID,
		Name:            "Renamed production",
		Description:     "Updated description",
		SourceType:      "script",
		Status:          "producing",
		Progress:        35,
	})
	if err != nil {
		t.Fatalf("PatchProduction() error = %v", err)
	}
	if patched.Name != "Renamed production" || patched.Description != "Updated description" || patched.Status != "producing" || patched.Progress != 35 {
		t.Fatalf("patched production = %+v, want metadata updates", patched)
	}
	if patched.ScriptVersionID == nil || *patched.ScriptVersionID != firstVersion.ID {
		t.Fatalf("script version id = %v, want %d", patched.ScriptVersionID, firstVersion.ID)
	}
}

func TestDeleteProductionRejectsDownstreamItems(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	_, firstVersion, _ := seedProductionScriptVersions(t, db, 1)
	production := model.Production{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: "Production", SourceType: "script", Status: "planning"}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}
	segment := model.Segment{ProjectID: 1, ProductionID: &production.ID, Title: "Segment", Status: "confirmed"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	syncSemanticTestRelations(t, db, &segment)

	err := service.DeleteItemByKind(context.Background(), 1, "production", strconv.FormatUint(uint64(production.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("DeleteItemByKind() error = %v, want ErrForbidden", err)
	}

	var count int64
	if err := db.Model(&model.Production{}).Where("id = ?", production.ID).Count(&count).Error; err != nil {
		t.Fatalf("count production: %v", err)
	}
	if count != 1 {
		t.Fatalf("production count = %d, want 1", count)
	}
}

func TestDeleteProductionWithoutDownstreamItemsSucceeds(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	_, firstVersion, _ := seedProductionScriptVersions(t, db, 1)
	production := model.Production{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: "Production", SourceType: "script", Status: "planning"}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}

	if err := service.DeleteItemByKind(context.Background(), 1, "production", strconv.FormatUint(uint64(production.ID), 10)); err != nil {
		t.Fatalf("DeleteItemByKind() error = %v", err)
	}

	var count int64
	if err := db.Model(&model.Production{}).Where("id = ?", production.ID).Count(&count).Error; err != nil {
		t.Fatalf("count production: %v", err)
	}
	if count != 0 {
		t.Fatalf("production count = %d, want 0", count)
	}
}

func syncSemanticTestRelations(t *testing.T, db *gorm.DB, item any) {
	t.Helper()
	if err := coregraph.NewWriter(db).Write(context.Background(), item); err != nil {
		t.Fatalf("sync relations for %T: %v", item, err)
	}
}

func newProductionTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "production.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	},
		&model.EntityRelation{},
		&model.Script{},
		&model.ScriptVersion{},
		&model.Production{},
		&model.ProductionTextBlock{},
		&model.Segment{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.PreviewTimeline{},
		&model.AssetSlot{},
		&model.WorkItem{},
		&model.DeliveryVersion{},
	)
}

func seedProductionScriptVersions(t *testing.T, db *gorm.DB, projectID uint) (model.Script, model.ScriptVersion, model.ScriptVersion) {
	t.Helper()
	content := "INT. SHOP - NIGHT\n手机屏幕亮起。"
	script := model.Script{ProjectID: projectID, Title: "Pilot", Content: content, RawSource: content, AuthorID: 1}
	if err := db.Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	firstVersion := model.ScriptVersion{
		ProjectID:     projectID,
		ScriptID:      script.ID,
		VersionNumber: 1,
		Title:         "Pilot v1",
		SourceType:    "raw",
		Content:       content,
		RawSource:     content,
		Status:        "active",
	}
	if err := db.Create(&firstVersion).Error; err != nil {
		t.Fatalf("create first script version: %v", err)
	}
	secondVersion := model.ScriptVersion{
		ProjectID:     projectID,
		ScriptID:      script.ID,
		VersionNumber: 2,
		Title:         "Pilot v2",
		SourceType:    "revised",
		Content:       "EXT. SHOP - DAY\n手机屏幕熄灭。",
		RawSource:     "EXT. SHOP - DAY\n手机屏幕熄灭。",
		Status:        "active",
	}
	if err := db.Create(&secondVersion).Error; err != nil {
		t.Fatalf("create second script version: %v", err)
	}
	return script, firstVersion, secondVersion
}
