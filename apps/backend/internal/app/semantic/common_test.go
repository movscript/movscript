package semantic

import (
	"context"
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestServiceItemPersistenceSyncsEntityRelationsExplicitly(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.EntityRelation{}, &model.CreativeReference{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	service := NewService(db)
	ctx := context.Background()
	item := model.CreativeReference{
		ProjectID:  1,
		Kind:       "person",
		Name:       "Ada",
		Importance: "supporting",
		Status:     "draft",
	}

	if err := service.CreateItem(ctx, &item); err != nil {
		t.Fatalf("create item: %v", err)
	}

	var relation model.EntityRelation
	if err := db.Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?",
		"project", item.ProjectID, "creative_reference", item.ID,
	).First(&relation).Error; err != nil {
		t.Fatalf("load create relation: %v", err)
	}
	if relation.Status != "draft" {
		t.Fatalf("create relation status = %q, want draft", relation.Status)
	}

	if err := service.PatchItem(ctx, &item, map[string]any{"status": "confirmed"}); err != nil {
		t.Fatalf("patch item: %v", err)
	}
	relation = model.EntityRelation{}
	if err := db.Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?",
		"project", item.ProjectID, "creative_reference", item.ID,
	).First(&relation).Error; err != nil {
		t.Fatalf("reload patch relation: %v", err)
	}
	if relation.Status != "confirmed" {
		t.Fatalf("patch relation status = %q, want confirmed", relation.Status)
	}

	if err := service.DeleteItem(ctx, &item); err != nil {
		t.Fatalf("delete item: %v", err)
	}
	var count int64
	if err := db.Model(&model.EntityRelation{}).Where("target_type = ? AND target_id = ?", "creative_reference", item.ID).Count(&count).Error; err != nil {
		t.Fatalf("count relations: %v", err)
	}
	if count != 0 {
		t.Fatalf("relations after delete = %d, want 0", count)
	}
}
