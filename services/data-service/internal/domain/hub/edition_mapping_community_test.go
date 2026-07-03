//go:build !runtime_overlay

package hub

import (
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestCommunityHubDistributionProfileMappingHooksAreNoop(t *testing.T) {
	row := HubPackage{
		PackageID:         "pkg",
		SHA256:            "9b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde",
		RequiredProductID: "self-hosted-plan",
	}
	var model persistencemodel.HubPackage
	row.distributionProfileApplyToModel(&model)
	if model.PackageID != "" {
		t.Fatalf("distributionProfileApplyToModel mutated community model: %+v", model)
	}
	out := HubPackage{PackageID: "pkg"}
	distributionProfileApplyHubPackageFromModel(model, &out)
	if out.SHA256 != "" || out.RequiredProductID != "" {
		t.Fatalf("distributionProfileApplyHubPackageFromModel mutated community domain row: %+v", out)
	}
}
