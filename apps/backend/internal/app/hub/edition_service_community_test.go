//go:build !runtime_overlay

package hub

import (
	"context"
	"testing"

	domainhub "github.com/movscript/movscript/internal/domain/hub"
)

func TestCommunityServiceEditionHooksAreNoOp(t *testing.T) {
	service := &Service{}
	row := domainhub.HubPackage{
		PackageID: "demo",
		Title:     "Demo",
		Status:    StatusPublished,
	}

	item, err := service.editionPackageForList(context.Background(), row)
	if err != nil {
		t.Fatalf("editionPackageForList() error = %v", err)
	}
	if item.ID != row.PackageID || item.Title != row.Title {
		t.Fatalf("editionPackageForList() = %#v, want package %q/%q", item, row.PackageID, row.Title)
	}

	item, err = service.editionPackageForDownload(context.Background(), row)
	if err != nil {
		t.Fatalf("editionPackageForDownload() error = %v", err)
	}
	if item.ID != row.PackageID || item.Title != row.Title {
		t.Fatalf("editionPackageForDownload() = %#v, want package %q/%q", item, row.PackageID, row.Title)
	}

	if err := service.editionValidateDownload(context.Background(), row, "0.0.0"); err != nil {
		t.Fatalf("editionValidateDownload() error = %v", err)
	}
	if !service.editionDownloadCountsInline() {
		t.Fatal("editionDownloadCountsInline() = false, want true")
	}
}
