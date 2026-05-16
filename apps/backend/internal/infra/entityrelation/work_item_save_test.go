package entityrelation

import (
	"testing"

	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestWorkItemSaveSyncsEntityRelations(t *testing.T) {
	db := testutil.OpenSQLite(t, "work_item_save_relations.db", &EntityRelation{}, &Production{}, &WorkItem{})

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
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&item).Error; err != nil {
		t.Fatalf("create item: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &item); err != nil {
		t.Fatalf("sync initial item relations: %v", err)
	}

	item.ProductionID = nil
	item.Status = "running"
	if err := db.Session(&gorm.Session{SkipHooks: true}).Save(&item).Error; err != nil {
		t.Fatalf("save item: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &item); err != nil {
		t.Fatalf("sync item relations: %v", err)
	}

	var relations []EntityRelation
	if err := db.Find(&relations).Error; err != nil {
		t.Fatalf("load relations: %v", err)
	}
	for _, relation := range relations {
		if relation.SourceType == "production" && relation.TargetType == "work_item" && relation.TargetID == item.ID {
			t.Fatalf("stale production containment relation remained: %+v", relation)
		}
	}
}
