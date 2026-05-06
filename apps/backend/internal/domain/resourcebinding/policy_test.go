package resourcebinding

import (
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
)

func TestNormalizeOwnerTypeAndRole(t *testing.T) {
	if got := NormalizeOwnerType("Creative-Reference "); got != "creative_reference" {
		t.Fatalf("owner type = %q, want creative_reference", got)
	}
	if got := NormalizeRole(" Setting-Doc "); got != "setting_doc" {
		t.Fatalf("role = %q, want setting_doc", got)
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
