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

	if binding.OwnerType != "asset_slot" {
		t.Fatalf("owner type = %q, want asset_slot", binding.OwnerType)
	}
	if binding.Role != "attachment" {
		t.Fatalf("role = %q, want attachment", binding.Role)
	}
	if binding.Slot != "poster" {
		t.Fatalf("slot = %q, want poster", binding.Slot)
	}
	if binding.Version != 1 {
		t.Fatalf("version = %d, want 1", binding.Version)
	}
	if binding.Status != "draft" {
		t.Fatalf("status = %q, want draft", binding.Status)
	}
	if binding.SourceType != "manual" {
		t.Fatalf("source type = %q, want manual", binding.SourceType)
	}
}

func TestValidOwnerTypeRejectsUnknownValue(t *testing.T) {
	if ValidOwnerType("unknown") {
		t.Fatal("expected unknown owner type to be invalid")
	}
}
