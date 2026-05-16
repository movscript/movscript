package entityrelation

import (
	"testing"

	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestSyncWorkItemRelationsRemovesOldProductionContainment(t *testing.T) {
	db := testutil.OpenSQLite(t, "work_item_relations.db", &EntityRelation{}, &Production{}, &WorkItem{})

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
	db := testutil.OpenSQLite(t, "creative_reference_state_relations.db", &EntityRelation{}, &CreativeReference{}, &CreativeReferenceState{})

	ref := CreativeReference{ProjectID: 1, Kind: "character", Name: "Hero", Importance: "supporting", Status: "draft"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&ref).Error; err != nil {
		t.Fatalf("create reference: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &ref); err != nil {
		t.Fatalf("sync reference relations: %v", err)
	}
	state := CreativeReferenceState{
		ProjectID:           1,
		CreativeReferenceID: ref.ID,
		ScopeType:           "segment",
		Name:                "Hero state",
		Status:              "draft",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&state).Error; err != nil {
		t.Fatalf("create state: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &state); err != nil {
		t.Fatalf("sync state relations: %v", err)
	}

	var relation EntityRelation
	if err := db.Where("type = ?", EntityRelationTypeHasState).First(&relation).Error; err != nil {
		t.Fatalf("load relation: %v", err)
	}
	if relation.Type != EntityRelationTypeHasState {
		t.Fatalf("relation type = %q, want %q", relation.Type, EntityRelationTypeHasState)
	}
}
