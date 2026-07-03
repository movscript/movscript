package db

import (
	"context"
	"slices"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestCleanupEmptySupportedParamsCatalogEntriesDeletesEntriesAndRoutes(t *testing.T) {
	database := testutil.OpenSQLite(t, "model-catalog-empty-supported-params-cleanup.db",
		&model.AIModelCatalogEntry{},
		&model.AIModelRouteBinding{},
	)

	empty := model.AIModelCatalogEntry{
		PublicModelID:   "seedream-legacy-empty",
		DisplayName:     "Seedream Legacy Empty",
		IsEnabled:       true,
		Capabilities:    "image_generation",
		SupportedParams: "",
	}
	blank := model.AIModelCatalogEntry{
		PublicModelID:   "seedream-legacy-blank",
		DisplayName:     "Seedream Legacy Blank",
		IsEnabled:       true,
		Capabilities:    "image_generation",
		SupportedParams: "   ",
	}
	current := model.AIModelCatalogEntry{
		PublicModelID:   "seedream-current",
		DisplayName:     "Seedream Current",
		IsEnabled:       true,
		Capabilities:    "image_generation",
		SupportedParams: `{"version":2,"by_operation":{"image_generation":{"allow":["image_size"]}}}`,
	}
	for _, entry := range []*model.AIModelCatalogEntry{&empty, &blank, &current} {
		if err := database.Create(entry).Error; err != nil {
			t.Fatalf("create catalog entry %s: %v", entry.PublicModelID, err)
		}
		if err := database.Create(&model.AIModelRouteBinding{
			CatalogEntryID:  entry.ID,
			SourceType:      model.ModelRouteSourceLocalProvider,
			ProviderModelID: entry.PublicModelID,
			IsEnabled:       true,
		}).Error; err != nil {
			t.Fatalf("create route binding for %s: %v", entry.PublicModelID, err)
		}
	}

	result, err := CleanupEmptySupportedParamsCatalogEntries(context.Background(), database)
	if err != nil {
		t.Fatalf("CleanupEmptySupportedParamsCatalogEntries() error = %v", err)
	}
	if result.CatalogEntriesDeleted != 2 || result.RouteBindingsDeleted != 2 {
		t.Fatalf("cleanup result = %#v, want two entries and two routes deleted", result)
	}
	if !slices.Contains(result.PublicModelIDs, "seedream-legacy-empty") ||
		!slices.Contains(result.PublicModelIDs, "seedream-legacy-blank") ||
		slices.Contains(result.PublicModelIDs, "seedream-current") {
		t.Fatalf("cleanup public model ids = %#v", result.PublicModelIDs)
	}

	var remainingEntries int64
	if err := database.Model(&model.AIModelCatalogEntry{}).Count(&remainingEntries).Error; err != nil {
		t.Fatalf("count remaining catalog entries: %v", err)
	}
	if remainingEntries != 1 {
		t.Fatalf("remaining catalog entries = %d, want 1", remainingEntries)
	}
	var remainingRoutes int64
	if err := database.Model(&model.AIModelRouteBinding{}).Count(&remainingRoutes).Error; err != nil {
		t.Fatalf("count remaining route bindings: %v", err)
	}
	if remainingRoutes != 1 {
		t.Fatalf("remaining route bindings = %d, want 1", remainingRoutes)
	}
}
