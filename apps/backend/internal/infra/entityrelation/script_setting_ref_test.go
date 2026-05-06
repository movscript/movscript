package entityrelation

import (
	"fmt"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestScriptSettingRefSyncsToEntityRelation(t *testing.T) {
	db, err := openScriptSettingRefTestDB(t)
	if err != nil {
		t.Fatal(err)
	}

	owner := User{Username: "owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	project := Project{Name: "Test", Status: "planning", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	script := Script{ProjectID: project.ID, Title: "Pilot", AuthorID: owner.ID}
	setting := Setting{ProjectID: project.ID, Name: "Hero", Status: "default"}
	if err := db.Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	if err := db.Create(&setting).Error; err != nil {
		t.Fatalf("create setting: %v", err)
	}

	ref := ScriptSettingRef{
		ProjectID:  project.ID,
		ScriptID:   script.ID,
		SettingID:  setting.ID,
		Role:       "protagonist",
		Scope:      "scene",
		Source:     "manual",
		Confidence: 0.85,
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&ref).Error; err != nil {
		t.Fatalf("create ref: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &ref); err != nil {
		t.Fatalf("sync ref: %v", err)
	}

	var relation EntityRelation
	if err := db.Where("metadata_json LIKE ?", "%script_setting_ref_id%").First(&relation).Error; err != nil {
		t.Fatalf("load relation: %v", err)
	}
	if relation.SourceType != "script" || relation.TargetType != "setting" || relation.Type != EntityRelationTypeUses {
		t.Fatalf("unexpected relation: %+v", relation)
	}
	if relation.Weight != 0.85 {
		t.Fatalf("weight = %v, want 0.85", relation.Weight)
	}
}

func TestScriptSettingRefDeleteCleansEntityRelation(t *testing.T) {
	db, err := openScriptSettingRefTestDB(t)
	if err != nil {
		t.Fatal(err)
	}

	owner := User{Username: "owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	project := Project{Name: "Test", Status: "planning", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	script := Script{ProjectID: project.ID, Title: "Pilot", AuthorID: owner.ID}
	setting := Setting{ProjectID: project.ID, Name: "Hero", Status: "default"}
	if err := db.Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	if err := db.Create(&setting).Error; err != nil {
		t.Fatalf("create setting: %v", err)
	}

	ref := ScriptSettingRef{ProjectID: project.ID, ScriptID: script.ID, SettingID: setting.ID, Source: "manual"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&ref).Error; err != nil {
		t.Fatalf("create ref: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &ref); err != nil {
		t.Fatalf("sync ref: %v", err)
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Delete(&ref).Error; err != nil {
		t.Fatalf("delete ref: %v", err)
	}
	if err := DeleteCoreEntityRelations(db, &ref); err != nil {
		t.Fatalf("delete relations: %v", err)
	}

	var count int64
	if err := db.Model(&EntityRelation{}).Where("metadata_json LIKE ?", "%script_setting_ref_id%").Count(&count).Error; err != nil {
		t.Fatalf("count relations: %v", err)
	}
	if count != 0 {
		t.Fatalf("entity relations count = %d, want 0", count)
	}
}

func openScriptSettingRefTestDB(t *testing.T) (*gorm.DB, error) {
	t.Helper()
	dbPath := fmt.Sprintf("file:%s?cache=shared&_fk=1", t.TempDir()+"/test.db")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if err := db.AutoMigrate(&EntityRelation{}, &Project{}, &User{}, &Setting{}, &Script{}, &ScriptSettingRef{}); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return db, nil
}
