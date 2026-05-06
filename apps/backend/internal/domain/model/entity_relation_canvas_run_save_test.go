package model

import (
	"os"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCanvasRunSaveSyncsEntityRelations(t *testing.T) {
	file, err := os.CreateTemp("", "canvas-run-rel-*.db")
	if err != nil {
		t.Fatalf("create temp db: %v", err)
	}
	t.Cleanup(func() { _ = os.Remove(file.Name()) })
	db, err := gorm.Open(sqlite.Open(file.Name()), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&EntityRelation{}, &Canvas{}, &CanvasRun{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	projectID := uint(1)
	canvas := Canvas{OwnerID: 1, ProjectID: &projectID, Name: "Workflow", CanvasType: "workflow", Stage: "generation", RefType: "asset_slot", RefID: ptrUint(9)}
	if err := db.Create(&canvas).Error; err != nil {
		t.Fatalf("create canvas: %v", err)
	}
	run := CanvasRun{CanvasID: canvas.ID, Status: "pending"}
	if err := db.Create(&run).Error; err != nil {
		t.Fatalf("create run: %v", err)
	}

	run.Status = "done"
	if err := db.Save(&run).Error; err != nil {
		t.Fatalf("save run: %v", err)
	}

	var relations []EntityRelation
	if err := db.Find(&relations).Error; err != nil {
		t.Fatalf("load relations: %v", err)
	}
	found := false
	for _, relation := range relations {
		if relation.SourceType == "canvas_run" && relation.SourceID == run.ID && relation.TargetType == "canvas" && relation.TargetID == canvas.ID {
			found = true
			if relation.Status != "done" {
				t.Fatalf("relation status = %q, want done", relation.Status)
			}
		}
	}
	if !found {
		t.Fatalf("missing canvas run relation after save: %+v", relations)
	}
}

func ptrUint(v uint) *uint { return &v }
