package resourcebinding

import (
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
)

func TestNormalizeOwnerTypeAndRole(t *testing.T) {
	if got := NormalizeOwnerType("Creative-Reference "); got != "creative_reference" {
		t.Fatalf("owner type = %q, want creative_reference", got)
	}
	if got := NormalizeRole(" Source "); got != "source" {
		t.Fatalf("role = %q, want source", got)
	}
}

func TestNormalizeBindingDefaults(t *testing.T) {
	binding := model.ResourceBinding{
		OwnerType: "Asset-Slot",
		Slot:      " poster ",
	}
	NormalizeBinding(&binding)

	if binding.OwnerType != OwnerTypeAssetSlot {
		t.Fatalf("owner type = %q, want asset_slot", binding.OwnerType)
	}
	if binding.Role != RoleAttachment {
		t.Fatalf("role = %q, want attachment", binding.Role)
	}
	if binding.Slot != "poster" {
		t.Fatalf("slot = %q, want poster", binding.Slot)
	}
	if binding.Version != 1 {
		t.Fatalf("version = %d, want 1", binding.Version)
	}
	if binding.Status != StatusDraft {
		t.Fatalf("status = %q, want draft", binding.Status)
	}
	if binding.SourceType != SourceTypeManual {
		t.Fatalf("source type = %q, want manual", binding.SourceType)
	}
}

func TestNormalizeDomainBindingDefaults(t *testing.T) {
	binding := Binding{
		OwnerType:    "Asset-Slot",
		Slot:         " poster ",
		MetadataJSON: " {} ",
	}
	Normalize(&binding)

	if binding.OwnerType != OwnerTypeAssetSlot || binding.Role != RoleAttachment || binding.Slot != "poster" {
		t.Fatalf("unexpected normalized identity: %+v", binding)
	}
	if binding.Version != 1 || binding.Status != StatusDraft || binding.SourceType != SourceTypeManual || binding.MetadataJSON != "{}" {
		t.Fatalf("unexpected normalized defaults: %+v", binding)
	}
}

func TestNormalizeCreateInputDefaults(t *testing.T) {
	input := CreateInput{
		ProjectID:  1,
		ResourceID: 2,
		OwnerType:  "Asset-Slot",
		OwnerID:    3,
	}
	NormalizeCreateInput(&input)

	if input.OwnerType != OwnerTypeAssetSlot {
		t.Fatalf("owner type = %q, want asset_slot", input.OwnerType)
	}
	if input.Role != RoleAttachment {
		t.Fatalf("role = %q, want attachment", input.Role)
	}
	if input.Version != 1 {
		t.Fatalf("version = %d, want 1", input.Version)
	}
	if input.Status != StatusDraft {
		t.Fatalf("status = %q, want draft", input.Status)
	}
	if input.SourceType != SourceTypeManual {
		t.Fatalf("source type = %q, want manual", input.SourceType)
	}
}

func TestNewDomainBindingAppliesNormalizedCreateInput(t *testing.T) {
	sortOrder := 4
	sourceID := uint(5)
	createdBy := uint(6)
	binding := New(CreateInput{
		ProjectID:    1,
		ResourceID:   2,
		OwnerType:    "Asset-Slot",
		OwnerID:      3,
		Role:         "Output",
		Slot:         " result ",
		SortOrder:    &sortOrder,
		SourceType:   "Canvas",
		SourceID:     &sourceID,
		CreatedByID:  &createdBy,
		MetadataJSON: " {} ",
	})
	if binding.OwnerType != OwnerTypeAssetSlot || binding.Role != RoleOutput || binding.Slot != "result" || binding.Version != 1 {
		t.Fatalf("unexpected binding identity: %+v", binding)
	}
	if binding.SortOrder != sortOrder || binding.Status != StatusDraft || binding.SourceType != SourceTypeCanvas || binding.MetadataJSON != "{}" {
		t.Fatalf("unexpected binding defaults: %+v", binding)
	}
	if binding.SourceID == nil || *binding.SourceID != sourceID || binding.CreatedByID == nil || *binding.CreatedByID != createdBy {
		t.Fatalf("unexpected binding pointers: %+v", binding)
	}
}

func TestNewDomainBindingAndModelMapping(t *testing.T) {
	sourceID := uint(5)
	createdBy := uint(6)
	binding := New(CreateInput{
		ProjectID:   1,
		ResourceID:  2,
		OwnerType:   "Asset-Slot",
		OwnerID:     3,
		Role:        "Output",
		SourceType:  "Canvas",
		SourceID:    &sourceID,
		CreatedByID: &createdBy,
	})
	modelBinding := binding.ToModel()
	modelBinding.ID = 9
	roundTrip := BindingFromModel(modelBinding)

	if roundTrip.ID != 9 || roundTrip.OwnerType != OwnerTypeAssetSlot || roundTrip.Role != RoleOutput {
		t.Fatalf("unexpected round-trip binding: %+v", roundTrip)
	}
	if roundTrip.SourceID == nil || *roundTrip.SourceID != sourceID || roundTrip.CreatedByID == nil || *roundTrip.CreatedByID != createdBy {
		t.Fatalf("unexpected round-trip pointers: %+v", roundTrip)
	}
}

func TestValidateCreateInputRejectsUnknownOwner(t *testing.T) {
	input := CreateInput{
		ProjectID:  1,
		ResourceID: 2,
		OwnerType:  "unknown",
		OwnerID:    3,
		Role:       RoleAttachment,
		Version:    1,
		Status:     StatusDraft,
		SourceType: SourceTypeManual,
	}
	if err := ValidateCreateInput(input); err != ErrOwnerInvalidType {
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

	updates, err := BuildUpdates(UpdateInput{
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
	if updates["role"] != "final" || updates["slot"] != "poster" || updates["version"] != 1 {
		t.Fatalf("unexpected normalized role/slot/version: %#v", updates)
	}
	if updates["status"] != "approved" || updates["source_type"] != "canvas" || updates["metadata_json"] != "{}" {
		t.Fatalf("unexpected normalized status/source/metadata: %#v", updates)
	}
}

func TestBuildUpdatesRejectsInvalidStatus(t *testing.T) {
	status := "pending"
	if _, err := BuildUpdates(UpdateInput{Status: &status}); err != ErrInvalidInput {
		t.Fatalf("error = %v, want ErrInvalidInput", err)
	}
}

func TestValidOwnerTypeRejectsUnknownValue(t *testing.T) {
	if ValidOwnerType("unknown") {
		t.Fatal("expected unknown owner type to be invalid")
	}
}
