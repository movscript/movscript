package entityrelation

import (
	"testing"

	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestSyncCoreEntityRelationsExplicitlyManagesCreativeReferenceRelations(t *testing.T) {
	db := testutil.OpenSQLite(t, "creative_reference_relations.db", &EntityRelation{}, &CreativeReference{})

	ref := CreativeReference{ProjectID: 1, Kind: "character", Name: "Hero", Importance: "supporting", Status: "draft"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&ref).Error; err != nil {
		t.Fatalf("create reference: %v", err)
	}

	var count int64
	if err := db.Model(&EntityRelation{}).Where(
		"source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?",
		"project", ref.ProjectID, "creative_reference", ref.ID,
	).Count(&count).Error; err != nil {
		t.Fatalf("count relations before sync: %v", err)
	}
	if count != 0 {
		t.Fatalf("relations before sync = %d, want 0", count)
	}

	if err := SyncCoreEntityRelations(db, &ref); err != nil {
		t.Fatalf("sync relations: %v", err)
	}

	if err := db.Model(&EntityRelation{}).Where(
		"source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?",
		"project", ref.ProjectID, "creative_reference", ref.ID,
	).Count(&count).Error; err != nil {
		t.Fatalf("count relations after sync: %v", err)
	}
	if count != 1 {
		t.Fatalf("relations after sync = %d, want 1", count)
	}

	if err := db.Session(&gorm.Session{SkipHooks: true}).Model(&ref).Update("status", "confirmed").Error; err != nil {
		t.Fatalf("update reference: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &ref); err != nil {
		t.Fatalf("resync relations: %v", err)
	}

	var relation EntityRelation
	if err := db.Where(
		"source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?",
		"project", ref.ProjectID, "creative_reference", ref.ID,
	).First(&relation).Error; err != nil {
		t.Fatalf("load relation after resync: %v", err)
	}
	if relation.Status != "confirmed" {
		t.Fatalf("relation status = %q, want confirmed", relation.Status)
	}
}

func TestDeleteCoreEntityRelationsRemovesCreativeRelationshipMetadata(t *testing.T) {
	db := testutil.OpenSQLite(t, "creative_relationship_relations.db", &EntityRelation{}, &CreativeReference{}, &CreativeRelationship{})

	source := CreativeReference{ProjectID: 1, Kind: "character", Name: "Source", Importance: "supporting", Status: "draft"}
	target := CreativeReference{ProjectID: 1, Kind: "character", Name: "Target", Importance: "supporting", Status: "draft"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&source).Error; err != nil {
		t.Fatalf("create source: %v", err)
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&target).Error; err != nil {
		t.Fatalf("create target: %v", err)
	}

	relationship := CreativeRelationship{
		ProjectID:                 1,
		SourceCreativeReferenceID: source.ID,
		TargetCreativeReferenceID: target.ID,
		Category:                  "relationship",
		Type:                      "related_to",
		Label:                     "linked",
		Status:                    "draft",
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&relationship).Error; err != nil {
		t.Fatalf("create relationship: %v", err)
	}
	if err := SyncCoreEntityRelations(db, &relationship); err != nil {
		t.Fatalf("sync relationship relations: %v", err)
	}

	var count int64
	if err := db.Model(&EntityRelation{}).Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?",
		"creative_reference", source.ID, "creative_reference", target.ID,
	).Count(&count).Error; err != nil {
		t.Fatalf("count relation before delete: %v", err)
	}
	if count != 1 {
		t.Fatalf("relations before delete = %d, want 1", count)
	}

	if err := DeleteCoreEntityRelations(db, &relationship); err != nil {
		t.Fatalf("delete relationship relations: %v", err)
	}

	if err := db.Model(&EntityRelation{}).Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?",
		"creative_reference", source.ID, "creative_reference", target.ID,
	).Count(&count).Error; err != nil {
		t.Fatalf("count relation after delete: %v", err)
	}
	if count != 0 {
		t.Fatalf("relations after delete = %d, want 0", count)
	}
}
