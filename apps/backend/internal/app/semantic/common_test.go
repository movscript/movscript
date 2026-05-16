package semantic

import (
	"context"
	"strconv"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestRepositoryItemPersistenceDoesNotImplicitlySyncEntityRelations(t *testing.T) {
	db := testutil.OpenSQLite(t, "repository_item_persistence.db", &model.EntityRelation{}, &model.CreativeReference{})

	repo := newRepository(db)
	ctx := context.Background()
	item := model.CreativeReference{
		ProjectID:  1,
		Kind:       "person",
		Name:       "Ada",
		Importance: "supporting",
		Status:     "draft",
	}

	if err := repo.createItemOnly(ctx, &item); err != nil {
		t.Fatalf("create item: %v", err)
	}

	var count int64
	if err := db.Model(&model.EntityRelation{}).Where("target_type = ? AND target_id = ? AND valid_to IS NULL", "creative_reference", item.ID).Count(&count).Error; err != nil {
		t.Fatalf("count create relations: %v", err)
	}
	if count != 0 {
		t.Fatalf("active relations after create = %d, want 0", count)
	}

	if err := repo.patchItemOnly(ctx, &item, map[string]any{"status": "confirmed"}); err != nil {
		t.Fatalf("patch item: %v", err)
	}
	if err := db.Model(&model.EntityRelation{}).Where("target_type = ? AND target_id = ? AND valid_to IS NULL", "creative_reference", item.ID).Count(&count).Error; err != nil {
		t.Fatalf("count patch relations: %v", err)
	}
	if count != 0 {
		t.Fatalf("active relations after patch = %d, want 0", count)
	}

	if err := repo.deleteItem(ctx, &item); err != nil {
		t.Fatalf("delete item: %v", err)
	}
	if err := db.Model(&model.EntityRelation{}).Where("target_type = ? AND target_id = ? AND valid_to IS NULL", "creative_reference", item.ID).Count(&count).Error; err != nil {
		t.Fatalf("count relations: %v", err)
	}
	if count != 0 {
		t.Fatalf("active relations after delete = %d, want 0", count)
	}
}

func TestServiceDeleteItemByKindKeepsPersistenceModelsInRepository(t *testing.T) {
	db := testutil.OpenSQLite(t, "delete_item_repository.db", &model.EntityRelation{}, &model.CreativeReference{})

	item := model.CreativeReference{
		ProjectID:  1,
		Kind:       "person",
		Name:       "Ada",
		Importance: "supporting",
		Status:     "draft",
	}
	if err := db.Create(&item).Error; err != nil {
		t.Fatalf("seed item: %v", err)
	}

	service := NewService(db)
	if err := service.DeleteItemByKind(context.Background(), item.ProjectID, "creative_reference", strconv.FormatUint(uint64(item.ID), 10)); err != nil {
		t.Fatalf("delete item by kind: %v", err)
	}

	var count int64
	if err := db.Model(&model.CreativeReference{}).Where("id = ?", item.ID).Count(&count).Error; err != nil {
		t.Fatalf("count item: %v", err)
	}
	if count != 0 {
		t.Fatalf("items after delete = %d, want 0", count)
	}
}
