package db

import (
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestBackfillCoreEntityRelationsIncludesSettingRelations(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(allModels()...); err != nil {
		t.Fatalf("migrate all models: %v", err)
	}

	owner := model.User{Username: "owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	project := model.Project{Name: "Test", Status: "planning", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	script := model.Script{ProjectID: project.ID, Title: "Pilot", AuthorID: owner.ID}
	sourceSetting := model.Setting{ProjectID: project.ID, Name: "Hero", Status: "default"}
	targetSetting := model.Setting{ProjectID: project.ID, Name: "Villain", Status: "default"}
	if err := db.Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	if err := db.Create(&sourceSetting).Error; err != nil {
		t.Fatalf("create source setting: %v", err)
	}
	if err := db.Create(&targetSetting).Error; err != nil {
		t.Fatalf("create target setting: %v", err)
	}

	if err := db.Create(&model.ScriptSettingRef{
		ProjectID: project.ID,
		ScriptID:  script.ID,
		SettingID: sourceSetting.ID,
		Role:      "protagonist",
		Scope:     "scene",
		Source:    "manual",
	}).Error; err != nil {
		t.Fatalf("create script setting ref: %v", err)
	}
	if err := db.Create(&model.SettingRelationship{
		ProjectID:       project.ID,
		SourceSettingID: sourceSetting.ID,
		TargetSettingID: targetSetting.ID,
		Category:        "relationship",
		Type:            "same_as",
		Source:          "manual",
	}).Error; err != nil {
		t.Fatalf("create setting relationship: %v", err)
	}

	if err := backfillCoreEntityRelations(db); err != nil {
		t.Fatalf("backfill: %v", err)
	}

	var refRelation model.EntityRelation
	if err := db.Where("metadata_json LIKE ?", "%script_setting_ref_id%").First(&refRelation).Error; err != nil {
		t.Fatalf("load script setting relation: %v", err)
	}
	if refRelation.SourceType != "script" || refRelation.TargetType != "setting" || refRelation.Type != model.EntityRelationTypeUses {
		t.Fatalf("unexpected script relation: %+v", refRelation)
	}

	var settingRelation model.EntityRelation
	if err := db.Where("metadata_json LIKE ?", "%setting_relationship_id%").First(&settingRelation).Error; err != nil {
		t.Fatalf("load setting relation: %v", err)
	}
	if settingRelation.SourceType != "setting" || settingRelation.TargetType != "setting" || settingRelation.Type != "same_as" {
		t.Fatalf("unexpected setting relation: %+v", settingRelation)
	}
}
