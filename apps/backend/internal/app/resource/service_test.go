package resource

import (
	"context"
	"testing"

	resourcebinding "github.com/movscript/movscript/internal/app/resource/binding"
	domainbinding "github.com/movscript/movscript/internal/domain/resource/binding"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestMimeToTypeUsesMimeThenExtension(t *testing.T) {
	if got := MimeToType("image/png", "asset.bin"); got != "image" {
		t.Fatalf("type = %q, want image", got)
	}
	if got := MimeToType("", "clip.webm"); got != "video" {
		t.Fatalf("type = %q, want video", got)
	}
	if got := MimeToType("", "iphone.heic"); got != "image" {
		t.Fatalf("type = %q, want image", got)
	}
	if got := MimeToType("", "archive.zip"); got != "file" {
		t.Fatalf("type = %q, want file", got)
	}
}

func TestNormalizeUploadMimeTypeDetectsHEICExtension(t *testing.T) {
	if got := normalizeUploadMimeType("", "iphone.HEIC"); got != "image/heic" {
		t.Fatalf("mime = %q, want image/heic", got)
	}
	if got := normalizeUploadMimeType("application/octet-stream", "scan.heif"); got != "image/heif" {
		t.Fatalf("mime = %q, want image/heif", got)
	}
	if got := normalizeUploadMimeType("image/heic", "asset.bin"); got != "image/heic" {
		t.Fatalf("mime = %q, want image/heic", got)
	}
}

func TestGenerateStorageKeySanitizesName(t *testing.T) {
	if got := GenerateStorageKey(42, "My Clip 01!.mp4"); got != "42_My_Clip_01_.mp4" {
		t.Fatalf("storage key = %q", got)
	}
}

func TestDeleteResourceDeletesBindingsAndRelationsWithoutHooks(t *testing.T) {
	db := newResourceTestDB(t)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "hero.png", FilePath: "/tmp/hero.png"}
	slot := model.AssetSlot{ProjectID: 1, Kind: "image", Name: "Hero", Status: "missing"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}
	binding := model.ResourceBinding{
		ProjectID:  1,
		ResourceID: resource.ID,
		OwnerType:  "asset_slot",
		OwnerID:    slot.ID,
		Role:       "output",
		Slot:       "image",
		Status:     "selected",
		SourceType: "manual",
	}
	if _, err := resourcebinding.NewService(db.Session(&gorm.Session{SkipHooks: true})).CreateBinding(ctx, domainbinding.BindingFromModel(binding)); err != nil {
		t.Fatalf("create binding: %v", err)
	}

	service := NewService(db.Session(&gorm.Session{SkipHooks: true}), nil, nil)
	if err := service.Delete(ctx, resource.ID, resource.OwnerID, nil); err != nil {
		t.Fatalf("delete resource: %v", err)
	}

	var count int64
	if err := db.Model(&model.ResourceBinding{}).Where("resource_id = ?", resource.ID).Count(&count).Error; err != nil {
		t.Fatalf("count bindings: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected bindings to be deleted, got %d", count)
	}
	var updatedSlot model.AssetSlot
	if err := db.First(&updatedSlot, slot.ID).Error; err != nil {
		t.Fatalf("reload slot: %v", err)
	}
	if updatedSlot.ResourceID != nil {
		t.Fatalf("expected slot resource_id to be cleared, got %+v", updatedSlot)
	}
	if err := db.Model(&model.EntityRelation{}).
		Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?", "asset_slot", slot.ID, "raw_resource", resource.ID).
		Count(&count).Error; err != nil {
		t.Fatalf("count relations: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected resource relations to be deleted, got %d", count)
	}
}

func newResourceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "resource.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &model.EntityRelation{}, &model.RawResource{}, &model.AssetSlot{}, &model.ResourceBinding{})
}
