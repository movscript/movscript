//go:build !runtime_overlay

package hub

import (
	"context"
	"testing"

	domainhub "github.com/movscript/movscript/internal/domain/hub"
)

func TestCommunityServiceDistributionProfileHooksAreNoOp(t *testing.T) {
	service := &Service{}
	row := domainhub.HubPackage{
		PackageID: "demo",
		Title:     "Demo",
		Status:    StatusPublished,
	}

	item, err := service.distributionProfilePackageForList(context.Background(), row)
	if err != nil {
		t.Fatalf("distributionProfilePackageForList() error = %v", err)
	}
	if item.ID != row.PackageID || item.Title != row.Title {
		t.Fatalf("distributionProfilePackageForList() = %#v, want package %q/%q", item, row.PackageID, row.Title)
	}

	item, err = service.distributionProfilePackageForDownload(context.Background(), row)
	if err != nil {
		t.Fatalf("distributionProfilePackageForDownload() error = %v", err)
	}
	if item.ID != row.PackageID || item.Title != row.Title {
		t.Fatalf("distributionProfilePackageForDownload() = %#v, want package %q/%q", item, row.PackageID, row.Title)
	}

	if err := service.distributionProfileValidateDownload(context.Background(), row, "0.0.0"); err != nil {
		t.Fatalf("distributionProfileValidateDownload() error = %v", err)
	}
	if !service.distributionProfileDownloadCountsInline() {
		t.Fatal("distributionProfileDownloadCountsInline() = false, want true")
	}
}
