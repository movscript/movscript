package model

import (
	"os"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestWorkItemSaveSyncsEntityRelations(t *testing.T) {
	file, err := os.CreateTemp("", "work-item-rel-*.db")
	if err != nil {
		t.Fatalf("create temp db: %v", err)
	}
	t.Cleanup(func() { _ = os.Remove(file.Name()) })
	db, err := gorm.Open(sqlite.Open(file.Name()), &gorm.Config{})
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
	if err := db.Create(&item).Error; err != nil {
		t.Fatalf("create item: %v", err)
	}

	item.ProductionID = nil
	item.Status = "running"
	if err := db.Save(&item).Error; err != nil {
		t.Fatalf("save item: %v", err)
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
