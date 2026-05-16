package binding

import (
	"context"
	"strconv"
	"testing"

	domainbinding "github.com/movscript/movscript/internal/domain/resource/binding"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestNormalizeOwnerTypeAndRole(t *testing.T) {
	if got := NormalizeOwnerType("Creative-Reference "); got != "creative_reference" {
		t.Fatalf("owner type = %q, want creative_reference", got)
	}
	if got := NormalizeRole(" Source "); got != "source" {
		t.Fatalf("role = %q, want source", got)
	}
}

func TestNormalizeCreateInputDefaults(t *testing.T) {
	input := CreateInput{
		ProjectID:  1,
		ResourceID: 2,
		OwnerType:  "Asset-Slot",
		OwnerID:    3,
	}
	normalizeCreateInput(&input)

	if input.OwnerType != "asset_slot" {
		t.Fatalf("owner type = %q, want asset_slot", input.OwnerType)
	}
	if input.Role != "attachment" {
		t.Fatalf("role = %q, want attachment", input.Role)
	}
	if input.Version != 1 {
		t.Fatalf("version = %d, want 1", input.Version)
	}
	if input.Status != "draft" {
		t.Fatalf("status = %q, want draft", input.Status)
	}
	if input.SourceType != "manual" {
		t.Fatalf("source type = %q, want manual", input.SourceType)
	}
}

func TestValidateCreateInputRejectsUnknownOwner(t *testing.T) {
	input := CreateInput{
		ProjectID:  1,
		ResourceID: 2,
		OwnerType:  "unknown",
		OwnerID:    3,
		Role:       "attachment",
		Version:    1,
		Status:     "draft",
		SourceType: "manual",
	}
	if err := validateCreateInput(input); err != ErrOwnerInvalidType {
		t.Fatalf("error = %v, want ErrOwnerInvalidType", err)
	}
}

func TestBuildUpdatesNormalizesMutableFields(t *testing.T) {
	role := "Final"
	slot := " poster "
	version := 0
	status := "Approved"
	sourceType := "Canvas"
	metadata := " {} "

	updates, err := buildUpdates(UpdateInput{
		Role:         &role,
		Slot:         &slot,
		Version:      &version,
		Status:       &status,
		SourceType:   &sourceType,
		MetadataJSON: &metadata,
	})
	if err != nil {
		t.Fatal(err)
	}
	columns := bindingUpdateColumns(updates)
	if columns["role"] != "final" || columns["slot"] != "poster" || columns["version"] != 1 {
		t.Fatalf("unexpected normalized role/slot/version: %#v", columns)
	}
	if columns["status"] != "approved" || columns["source_type"] != "canvas" || columns["metadata_json"] != "{}" {
		t.Fatalf("unexpected normalized status/source/metadata: %#v", columns)
	}
}

func TestBuildUpdatesRejectsInvalidStatus(t *testing.T) {
	status := "pending"
	if _, err := buildUpdates(UpdateInput{Status: &status}); err != ErrInvalidInput {
		t.Fatalf("error = %v, want ErrInvalidInput", err)
	}
}

func TestCreateAndDeleteBindingSyncsRelationsWithoutHooks(t *testing.T) {
	db := newResourceBindingTestDB(t)
	ctx := context.Background()
	slot := model.AssetSlot{
		ProjectID: 1,
		Kind:      "image",
		Name:      "Hero image",
		Status:    "missing",
	}
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "hero.png", FilePath: "/tmp/hero.png"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	svc := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	canvasBinding := model.ResourceBinding{
		ProjectID:  1,
		ResourceID: resource.ID,
		OwnerType:  "canvas",
		OwnerID:    42,
		Role:       "output",
		Slot:       "image",
		Status:     "selected",
		SourceType: "manual",
	}
	createdCanvasBinding, err := svc.CreateBinding(ctx, domainbinding.BindingFromModel(canvasBinding))
	if err != nil {
		t.Fatalf("create canvas binding: %v", err)
	}
	assertResourceBindingRelationExists(t, db, "resource_binding_id", createdCanvasBinding.ID)
	if err := svc.Delete(ctx, createdCanvasBinding.ID); err != nil {
		t.Fatalf("delete canvas binding: %v", err)
	}
	assertResourceBindingRelationMissing(t, db, "resource_binding_id", createdCanvasBinding.ID)

	binding := model.ResourceBinding{
		ProjectID:  1,
		ResourceID: resource.ID,
		OwnerType:  "asset_slot",
		OwnerID:    slot.ID,
		Role:       "output",
		Slot:       "image",
		Status:     "selected",
		SourceType: "manual",
		IsPrimary:  true,
	}
	createdBinding, err := svc.CreateBinding(ctx, domainbinding.BindingFromModel(binding))
	if err != nil {
		t.Fatalf("create binding: %v", err)
	}

	var updatedSlot model.AssetSlot
	if err := db.First(&updatedSlot, slot.ID).Error; err != nil {
		t.Fatalf("reload slot: %v", err)
	}
	if updatedSlot.ResourceID == nil || *updatedSlot.ResourceID != resource.ID {
		t.Fatalf("asset slot resource_id was not backfilled: %+v", updatedSlot)
	}
	assertResourceBindingEdgeExists(t, db, "asset_slot", slot.ID, "raw_resource", resource.ID, model.EntityRelationTypeUsesResource)

	if err := svc.Delete(ctx, createdBinding.ID); err != nil {
		t.Fatalf("delete binding: %v", err)
	}
	if err := db.First(&updatedSlot, slot.ID).Error; err != nil {
		t.Fatalf("reload slot after delete: %v", err)
	}
	if updatedSlot.ResourceID != nil {
		t.Fatalf("asset slot resource_id was not cleared: %+v", updatedSlot)
	}
	assertResourceBindingEdgeMissing(t, db, "asset_slot", slot.ID, "raw_resource", resource.ID, model.EntityRelationTypeUsesResource)
}

func newResourceBindingTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "resource_binding.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	},
		&model.EntityRelation{},
		&model.AssetSlot{},
		&model.ResourceBinding{},
		&model.RawResource{},
	)
}

func assertResourceBindingRelationExists(t *testing.T, db *gorm.DB, marker string, id uint) {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("metadata_json LIKE ?", `%`+marker+`":`+strconv.FormatUint(uint64(id), 10)+`%`).
		Count(&count).Error; err != nil {
		t.Fatalf("count relation metadata: %v", err)
	}
	if count == 0 {
		t.Fatalf("expected relation metadata marker %s=%d", marker, id)
	}
}

func assertResourceBindingRelationMissing(t *testing.T, db *gorm.DB, marker string, id uint) {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("metadata_json LIKE ?", `%`+marker+`":`+strconv.FormatUint(uint64(id), 10)+`%`).
		Count(&count).Error; err != nil {
		t.Fatalf("count relation metadata: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected relation metadata marker %s=%d to be missing, got %d", marker, id, count)
	}
}

func assertResourceBindingEdgeExists(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) {
	t.Helper()
	if countResourceBindingEdges(t, db, sourceType, sourceID, targetType, targetID, relationType) == 0 {
		t.Fatalf("expected relation %s:%d -> %s:%d type %s", sourceType, sourceID, targetType, targetID, relationType)
	}
}

func assertResourceBindingEdgeMissing(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) {
	t.Helper()
	if count := countResourceBindingEdges(t, db, sourceType, sourceID, targetType, targetID, relationType); count != 0 {
		t.Fatalf("expected relation %s:%d -> %s:%d type %s to be missing, got %d", sourceType, sourceID, targetType, targetID, relationType, count)
	}
}

func countResourceBindingEdges(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND type = ?", sourceType, sourceID, targetType, targetID, relationType).
		Count(&count).Error; err != nil {
		t.Fatalf("count relation: %v", err)
	}
	return count
}
