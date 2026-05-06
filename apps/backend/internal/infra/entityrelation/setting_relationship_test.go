package entityrelation

import (
	"fmt"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSettingRelationshipSyncsToEntityRelation(t *testing.T) {
	db, err := openSettingRelationshipTestDB(t)
	if err != nil {
		t.Fatal(err)
	}

	source := Setting{ProjectID: 1, Name: "Hero", Status: "default"}
	target := Setting{ProjectID: 1, Name: "Villain", Status: "default"}
	owner := User{Username: "owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	project := Project{Name: "Test", Status: "planning", OwnerID: owner.ID}
	script := Script{ProjectID: 1, Title: "Pilot", AuthorID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&source).Error; err != nil {
		t.Fatalf("create source setting: %v", err)
	}
	if err := db.Create(&target).Error; err != nil {
		t.Fatalf("create target setting: %v", err)
	}
	script.ProjectID = project.ID
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
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&item).Error; err != nil {
		t.Fatalf("create relationship: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &item); err != nil {
		t.Fatalf("sync relationship: %v", err)
	}

	var relation EntityRelation
	if err := db.Where("metadata_json LIKE ?", "%setting_relationship_id%").First(&relation).Error; err != nil {
		t.Fatalf("load relation: %v", err)
	}
	if relation.SourceType != "setting" || relation.TargetType != "setting" || relation.Type != "same_as" {
		t.Fatalf("unexpected relation: %+v", relation)
	}
	if relation.Category != "relationship" {
		t.Fatalf("category = %q, want %q", relation.Category, "relationship")
	}
}

func TestSettingRelationshipDeleteCleansEntityRelation(t *testing.T) {
	db, err := openSettingRelationshipTestDB(t)
	if err != nil {
		t.Fatal(err)
	}

	source := Setting{ProjectID: 1, Name: "Hero", Status: "default"}
	target := Setting{ProjectID: 1, Name: "Villain", Status: "default"}
	owner := User{Username: "owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	project := Project{Name: "Test", Status: "planning", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&source).Error; err != nil {
		t.Fatalf("create source setting: %v", err)
	}
	if err := db.Create(&target).Error; err != nil {
		t.Fatalf("create target setting: %v", err)
	}

	item := SettingRelationship{
		ProjectID:       1,
		SourceSettingID: source.ID,
		TargetSettingID: target.ID,
		Type:            "same_as",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&item).Error; err != nil {
		t.Fatalf("create relationship: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &item); err != nil {
		t.Fatalf("sync relationship: %v", err)
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Delete(&item).Error; err != nil {
		t.Fatalf("delete relationship: %v", err)
	}
	if err := DeleteCoreEntityRelations(db, &item); err != nil {
		t.Fatalf("delete relations: %v", err)
	}

	var count int64
	if err := db.Model(&EntityRelation{}).Where("metadata_json LIKE ?", "%setting_relationship_id%").Count(&count).Error; err != nil {
		t.Fatalf("count relations: %v", err)
	}
	if count != 0 {
		t.Fatalf("entity relations count = %d, want 0", count)
	}
}

func openSettingRelationshipTestDB(t *testing.T) (*gorm.DB, error) {
	t.Helper()
	dbPath := fmt.Sprintf("file:%s?cache=shared&_fk=1", t.TempDir()+"/test.db")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if err := db.AutoMigrate(&EntityRelation{}, &Project{}, &User{}, &Setting{}, &Script{}, &SettingRelationship{}); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return db, nil
}
