package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSettingRelationshipSyncsToEntityRelation(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&EntityRelation{}, &Setting{}, &Script{}, &SettingRelationship{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	source := Setting{ProjectID: 1, Name: "Hero", Status: "default"}
	target := Setting{ProjectID: 1, Name: "Villain", Status: "default"}
	script := Script{ProjectID: 1, Title: "Pilot"}
	if err := db.Create(&source).Error; err != nil {
		t.Fatalf("create source setting: %v", err)
	}
	if err := db.Create(&target).Error; err != nil {
		t.Fatalf("create target setting: %v", err)
	}
	if err := db.Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}

	item := SettingRelationship{
		ProjectID:       1,
		SourceSettingID: source.ID,
		TargetSettingID: target.ID,
		ScopeScriptID:   &script.ID,
		Category:        "relationship",
		Type:            "same_as",
		Label:           "同一角色",
		Description:     "角色别名关系",
		Source:          "manual",
	}
	if err := db.Create(&item).Error; err != nil {
		t.Fatalf("create relationship: %v", err)
	}

	var relation EntityRelation
	if err := db.Where("metadata_json LIKE ?", "%setting_relationship_id%").First(&relation).Error; err != nil {
		t.Fatalf("load relation: %v", err)
	}
	if relation.SourceType != "setting" || relation.TargetType != "setting" || relation.Type != "same_as" {
		t.Fatalf("unexpected relation: %+v", relation)
	}
	if relation.Category != EntityRelationCategorySetting {
		t.Fatalf("category = %q, want %q", relation.Category, EntityRelationCategorySetting)
	}
}
