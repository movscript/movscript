package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSyncWorkItemRelationsRemovesOldProductionContainment(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&EntityRelation{}, &Production{}, &WorkItem{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	production := Production{ProjectID: 1, Name: "Prod", Status: "planning", SourceType: "direct", OwnerLabel: "导演组"}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}
	item := WorkItem{
		ProjectID:    1,
		ProductionID: &production.ID,
		TargetType:   "content_unit",
		TargetID:     9,
		Kind:         "human",
		Title:        "Task",
		Status:       "todo",
		Priority:     "normal",
	}
	if err := syncWorkItemRelations(db, &item); err != nil {
		t.Fatalf("initial sync: %v", err)
	}

	item.ProductionID = nil
	if err := syncWorkItemRelations(db, &item); err != nil {
		t.Fatalf("resync: %v", err)
	}

	var relations []EntityRelation
	if err := db.Find(&relations).Error; err != nil {
		t.Fatalf("list relations: %v", err)
	}
	for _, relation := range relations {
		if relation.SourceType == "production" && relation.TargetType == "work_item" && relation.TargetID == item.ID {
			t.Fatalf("stale production containment relation remained: %+v", relation)
		}
	}
}

func TestCreativeReferenceStateUsesNamedRelationType(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&EntityRelation{}, &CreativeReference{}, &CreativeReferenceState{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	ref := CreativeReference{ProjectID: 1, Kind: "character", Name: "Hero", Importance: "supporting", Status: "draft"}
	if err := db.Create(&ref).Error; err != nil {
		t.Fatalf("create reference: %v", err)
	}
	state := CreativeReferenceState{
		ProjectID:           1,
		CreativeReferenceID: ref.ID,
		ScopeType:           "segment",
		Name:                "Hero state",
		Status:              "draft",
	}
	if err := db.Create(&state).Error; err != nil {
		t.Fatalf("create state: %v", err)
	}

	var relation EntityRelation
	if err := db.Where("type = ?", EntityRelationTypeHasState).First(&relation).Error; err != nil {
		t.Fatalf("load relation: %v", err)
	}
	if relation.Type != EntityRelationTypeHasState {
		t.Fatalf("relation type = %q, want %q", relation.Type, EntityRelationTypeHasState)
	}
}
