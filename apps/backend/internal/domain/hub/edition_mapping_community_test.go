//go:build !runtime_overlay

package hub

import (
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestCommunityHubEditionMappingHooksAreNoop(t *testing.T) {
	row := HubPackage{
		PackageID:         "pkg",
		SHA256:            "9b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde",
		RequiredProductID: "enterprise-plan",
	}
	var model persistencemodel.HubPackage
	row.editionApplyToModel(&model)
	if model.PackageID != "" {
		t.Fatalf("editionApplyToModel mutated community model: %+v", model)
	}
	out := HubPackage{PackageID: "pkg"}
	editionApplyHubPackageFromModel(model, &out)
	if out.SHA256 != "" || out.RequiredProductID != "" {
		t.Fatalf("editionApplyHubPackageFromModel mutated community domain row: %+v", out)
	}
}
