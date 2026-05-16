package entityrelation

import (
	"testing"

	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestCanvasRunSaveSyncsEntityRelations(t *testing.T) {
	db := testutil.OpenSQLite(t, "canvas_run_save_relations.db", &EntityRelation{}, &Canvas{}, &CanvasRun{})

	projectID := uint(1)
	canvas := Canvas{OwnerID: 1, ProjectID: &projectID, Name: "Workflow", CanvasType: "workflow", Stage: "generation", RefType: "asset_slot", RefID: ptrUint(9)}
	if err := db.Create(&canvas).Error; err != nil {
		t.Fatalf("create canvas: %v", err)
	}
	run := CanvasRun{CanvasID: canvas.ID, Status: "pending"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&run).Error; err != nil {
		t.Fatalf("create run: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &run); err != nil {
		t.Fatalf("sync initial run relations: %v", err)
	}

	run.Status = "done"
	if err := db.Session(&gorm.Session{SkipHooks: true}).Save(&run).Error; err != nil {
		t.Fatalf("save run: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &run); err != nil {
		t.Fatalf("sync run relations: %v", err)
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
