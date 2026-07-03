package db

import (
	"context"
	"strings"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type EmptySupportedParamsCatalogCleanupResult struct {
	CatalogEntriesDeleted int64
	RouteBindingsDeleted  int64
	PublicModelIDs        []string
}

func CleanupEmptySupportedParamsCatalogEntries(ctx context.Context, database *gorm.DB) (EmptySupportedParamsCatalogCleanupResult, error) {
	var result EmptySupportedParamsCatalogCleanupResult
	if database == nil {
		return result, nil
	}
	migrator := database.Migrator()
	if !migrator.HasTable(&persistencemodel.AIModelCatalogEntry{}) ||
		!migrator.HasColumn(&persistencemodel.AIModelCatalogEntry{}, "supported_params") {
		return result, nil
	}

	err := database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var entries []persistencemodel.AIModelCatalogEntry
		if err := tx.
			Where("TRIM(COALESCE(supported_params, '')) = ''").
			Find(&entries).Error; err != nil {
			return err
		}
		if len(entries) == 0 {
			return nil
		}

		ids := make([]uint, 0, len(entries))
		for _, entry := range entries {
			ids = append(ids, entry.ID)
			if publicModelID := strings.TrimSpace(entry.PublicModelID); publicModelID != "" {
				result.PublicModelIDs = append(result.PublicModelIDs, publicModelID)
			}
		}

		if tx.Migrator().HasTable(&persistencemodel.AIModelRouteBinding{}) {
			deleteRoutes := tx.Where("catalog_entry_id IN ?", ids).Delete(&persistencemodel.AIModelRouteBinding{})
			if deleteRoutes.Error != nil {
				return deleteRoutes.Error
			}
			result.RouteBindingsDeleted = deleteRoutes.RowsAffected
		}

		deleteEntries := tx.Where("id IN ?", ids).Delete(&persistencemodel.AIModelCatalogEntry{})
		if deleteEntries.Error != nil {
			return deleteEntries.Error
		}
		result.CatalogEntriesDeleted = deleteEntries.RowsAffected
		return nil
	})
	return result, err
}
