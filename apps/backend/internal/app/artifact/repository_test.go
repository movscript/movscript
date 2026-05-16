package artifact

import (
	"testing"
	"time"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func TestAssetSlotsFromModelsAttachesResourcesByResourceID(t *testing.T) {
	resourceID := uint(42)
	otherResourceID := uint(99)
	updatedAt := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)

	items := []persistencemodel.AssetSlot{
		{
			Model:      gorm.Model{ID: 1, CreatedAt: updatedAt, UpdatedAt: updatedAt},
			Name:       "hero image",
			Kind:       "image",
			Status:     "locked",
			ResourceID: &resourceID,
		},
		{
			Model:      gorm.Model{ID: 2, CreatedAt: updatedAt, UpdatedAt: updatedAt},
			Name:       "missing video",
			Kind:       "video",
			Status:     "missing",
			ResourceID: &otherResourceID,
		},
	}
	resources := []domainresource.RawResource{
		{ID: resourceID, Name: "hero.png", Type: "image"},
	}

	got := assetSlotsFromModels(items, resources)
	if len(got) != 2 {
		t.Fatalf("assetSlotsFromModels len = %d, want 2", len(got))
	}
	if got[0].Resource == nil || got[0].Resource.ID != resourceID || got[0].Resource.Name != "hero.png" {
		t.Fatalf("first slot resource = %+v, want hero resource", got[0].Resource)
	}
	if got[1].Resource != nil {
		t.Fatalf("second slot resource = %+v, want nil for missing resource row", got[1].Resource)
	}
}

func TestRawResourcesByIDReturnsIndependentPointers(t *testing.T) {
	resources := []domainresource.RawResource{
		{ID: 1, Name: "one"},
		{ID: 2, Name: "two"},
	}

	byID := rawResourcesByID(resources)
	if byID[1] == nil || byID[1].Name != "one" {
		t.Fatalf("resource 1 = %+v", byID[1])
	}
	if byID[2] == nil || byID[2].Name != "two" {
		t.Fatalf("resource 2 = %+v", byID[2])
	}
	byID[1].Name = "changed"
	if byID[2].Name != "two" {
		t.Fatalf("resource pointers alias each other: %+v", byID)
	}
}
